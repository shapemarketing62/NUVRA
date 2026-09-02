import { chromium, type Browser, type Page } from "playwright";
import fs from "fs/promises";
import path from "path";
import { validateAndNormalizeUrl, isSameOrigin } from "./url-validator";
import { analyzePageHtml, discoverInternalLinks } from "./page-analyzer";
import type { WebsiteAnalysisResult, ScreenshotData, RawFinding, PageRenderedMarketingSignals } from "./types";
import { journeyFindings, validateWebsiteJourneys } from "./website-journey-validator.ts";
import { BrandIdentityAnalyzer } from "./brand-identity-analyzer.ts";
import { WebsiteMarketingAnalyzer, type WebsiteMarketingContext } from "./website-marketing-analyzer.ts";

const MAX_PAGES = Math.max(1, Math.min(Number(process.env.MAX_CRAWL_PAGES || 10), 15));
const TIMEOUT_MS = Math.max(10_000, Math.min(Number(process.env.ANALYSIS_TIMEOUT_MS || 90_000), 120_000));
const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 2_000_000;
const SCREENSHOTS_DIR = process.env.SCREENSHOTS_DIR || "./storage/screenshots";

export interface WebsiteAnalysisOptions {
  signal?: AbortSignal;
  maxPages?: number;
  timeoutMs?: number;
  businessContext?: WebsiteMarketingContext;
}

export async function analyzeWebsite(inputUrl: string, options: WebsiteAnalysisOptions = {}): Promise<WebsiteAnalysisResult> {
  console.log("[WEBSITE_ANALYZER] Starting analysis for:", inputUrl);
  let baseUrl = inputUrl;
  let browser: Browser | null = null;
  const startTime = Date.now();
  const maxPages = Math.max(1, Math.min(options.maxPages ?? MAX_PAGES, MAX_PAGES));
  const timeoutMs = Math.max(5_000, Math.min(options.timeoutMs ?? TIMEOUT_MS, TIMEOUT_MS));
  const onAbort = () => { void browser?.close().catch(() => {}); };
  options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    if (options.signal?.aborted) throw Object.assign(new Error("website_analysis_canceled"), { name: "AbortError" });
    baseUrl = await validateAndNormalizeUrl(inputUrl);
    console.log("[WEBSITE_ANALYZER] Validated and normalized URL:", baseUrl);

    const analysisId = `analysis-${Date.now()}`;
    const screenshotDir = path.join(SCREENSHOTS_DIR, analysisId);
    await fs.mkdir(screenshotDir, { recursive: true });
    console.log("[WEBSITE_ANALYZER] Screenshot directory created:", screenshotDir);

    console.log("[WEBSITE_ANALYZER] Launching Playwright browser");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 NuvraBot/1.0",
    });
    const publicUrlCache = new Map<string, boolean>();
    await context.route("**/*", async (route) => {
      if (options.signal?.aborted) return route.abort("timedout");
      const requestUrl = route.request().url();
      try {
        const parsed = new URL(requestUrl);
        const cacheKey = `${parsed.protocol}//${parsed.hostname}`;
        if (!publicUrlCache.has(cacheKey)) {
          await validateAndNormalizeUrl(requestUrl);
          publicUrlCache.set(cacheKey, true);
        }
        await route.continue();
      } catch {
        await route.abort("blockedbyclient");
      }
    });
    console.log("[WEBSITE_ANALYZER] Browser context created");

    const visited = new Set<string>();
    const queue: string[] = [baseUrl];
    const pages: WebsiteAnalysisResult["pages"] = [];
    const screenshots: ScreenshotData[] = [];
    const allFindings: RawFinding[] = [];

    while (queue.length > 0 && pages.length < maxPages) {
      if (options.signal?.aborted) throw Object.assign(new Error("website_analysis_canceled"), { name: "AbortError" });
      if (Date.now() - startTime > timeoutMs) {
        console.log("[WEBSITE_ANALYZER] Timeout reached");
        break;
      }

      const url = queue.shift()!;
      const normalized = url.split("#")[0];
      if (visited.has(normalized)) continue;
      visited.add(normalized);

      console.log("[WEBSITE_ANALYZER] Analyzing page:", normalized, `(Page ${pages.length + 1}/${maxPages})`);
      
      const page = await context.newPage();
      page.setDefaultTimeout(30000);

      try {
        const loadStart = Date.now();
        console.log("[WEBSITE_ANALYZER] Navigating to page:", normalized);
        const response = await page.goto(normalized, { waitUntil: "domcontentloaded", timeout: 30000 });
        if (response) {
          await validateAndNormalizeUrl(response.url());
          let redirects = 0;
          let previous = response.request().redirectedFrom();
          while (previous) { redirects += 1; previous = previous.redirectedFrom(); }
          if (redirects > MAX_REDIRECTS) throw new Error("Demasiadas redirecciones");
          const declaredSize = Number(response.headers()["content-length"] || 0);
          if (declaredSize > MAX_HTML_BYTES) throw new Error("La página supera el tamaño permitido");
        }
        const loadTimeMs = Date.now() - loadStart;
        console.log("[WEBSITE_ANALYZER] Page loaded in", loadTimeMs, "ms, status:", response?.status());

        if (!response || response.status() >= 400) {
          console.error("[WEBSITE_ANALYZER] HTTP error:", response?.status(), "for URL:", normalized);
          allFindings.push({
            type: "problem",
            category: "presencia",
            severity: "high",
            title: `Error HTTP ${response?.status() || "unknown"}`,
            description: `No se pudo cargar la página correctamente.`,
            evidence: `URL: ${normalized} — status ${response?.status() || "sin respuesta"}`,
            pageUrl: normalized,
            source: "playwright",
            confidence: "alta",
            impact: "alto",
          });
          continue;
        }

        const html = await page.content();
        if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) throw new Error("La página supera el tamaño permitido");
        const renderedMarketingSignals = await collectRenderedMarketingSignals(page).catch(() => undefined);
        const pageData = analyzePageHtml(normalized, html, loadTimeMs, renderedMarketingSignals);
        pages.push(pageData);
        allFindings.push(...pageData.findings);

        if (pages.length === 1) {
          const desktopPath = path.join(screenshotDir, "home-desktop.png");
          await page.screenshot({ path: desktopPath, fullPage: false });
          screenshots.push({ url: normalized, viewport: "desktop", path: desktopPath });

          await page.setViewportSize({ width: 375, height: 812 });
          await page.waitForTimeout(500);
          const mobilePath = path.join(screenshotDir, "home-mobile.png");
          await page.screenshot({ path: mobilePath, fullPage: false });
          screenshots.push({ url: normalized, viewport: "mobile", path: mobilePath });
        }

        if (pages.length === 1) {
          const links = discoverInternalLinks(baseUrl, html, 30);
          for (const link of Array.from(links)) {
            if (!visited.has(link.split("#")[0]) && isSameOrigin(baseUrl, link)) {
              queue.push(link);
            }
          }
        }
      } catch (err) {
        console.error("[WEBSITE_ANALYZER] Error analyzing page:", normalized, err);
        allFindings.push({
          type: "problem",
          category: "presencia",
          severity: "medium",
          title: "Error al analizar página",
          description: String(err),
          evidence: `No se pudo completar el análisis de ${normalized}`,
          pageUrl: normalized,
          source: "playwright",
          confidence: "alta",
        });
      } finally {
        await page.close().catch(() => {});
      }
    }

    await browser.close();
    browser = null;

    const loadTimes = pages.map((p) => p.loadTimeMs).filter((t): t is number => !!t);
    const avgLoadTimeMs = loadTimes.length ? loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length : 0;
    const slowest = pages.reduce(
      (best, p) => (!best || (p.loadTimeMs || 0) > (best.loadTimeMs || 0) ? p : best),
      null as (typeof pages)[0] | null
    );

    const journeys = validateWebsiteJourneys(pages, allFindings);
    const brandIdentity = BrandIdentityAnalyzer.analyze(pages);
    const marketingIntelligence = WebsiteMarketingAnalyzer.analyze(pages, options.businessContext);
    const dedupedFindings = dedupeFindings([
      ...allFindings,
      ...journeyFindings(journeys),
      ...BrandIdentityAnalyzer.findings(brandIdentity, baseUrl),
      ...marketingIntelligence.findings,
    ]);

    return {
      baseUrl,
      status: pages.length > 0 ? (Date.now() - startTime > timeoutMs || options.signal?.aborted ? "partial" : "completed") : "failed",
      pagesAnalyzed: pages.length,
      pages,
      findings: dedupedFindings,
      screenshots,
      performanceSummary: {
        avgLoadTimeMs,
        slowestPage: slowest?.url || null,
      },
      crawledUrls: Array.from(visited),
      journeys,
      brandIdentity,
      marketingIntelligence,
      analyzedAt: new Date().toISOString(),
      errorMessage: pages.length === 0 ? "No se pudo analizar ninguna página" : undefined,
    };
  } catch (err) {
    console.error("[WEBSITE_ANALYZER] Fatal error during analysis:", err);
    if (browser) await browser.close().catch(() => {});
    return {
      baseUrl,
      status: "failed",
      pagesAnalyzed: 0,
      pages: [],
      findings: [],
      screenshots: [],
      performanceSummary: { avgLoadTimeMs: 0, slowestPage: null },
      crawledUrls: [],
      journeys: [],
      brandIdentity: BrandIdentityAnalyzer.analyze([]),
      marketingIntelligence: WebsiteMarketingAnalyzer.analyze([], options.businessContext),
      errorMessage: err instanceof Error ? err.message : String(err),
      analyzedAt: new Date().toISOString(),
    };
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
  }
}

async function collectRenderedMarketingSignals(page: Page): Promise<PageRenderedMarketingSignals> {
  return page.evaluate(() => {
    const visible = (element: Element) => {
      const rect = (element as HTMLElement).getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity || 1) > 0;
    };
    const backgroundFor = (element: Element) => {
      let current: Element | null = element;
      while (current) {
        const color = getComputedStyle(current).backgroundColor;
        if (color && !/rgba\([^)]*,\s*0\s*\)$/.test(color) && color !== "transparent") return color;
        current = current.parentElement;
      }
      return "rgb(255, 255, 255)";
    };
    const number = (value: string) => { const parsed = Number.parseFloat(value); return Number.isFinite(parsed) ? parsed : null; };
    const textSamples = Array.from(document.querySelectorAll("h1, h2, h3, p, li")).filter(visible).slice(0, 80).map((element) => {
      const style = getComputedStyle(element);
      const rect = (element as HTMLElement).getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        text: (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 320),
        fontFamily: style.fontFamily,
        fontSizePx: number(style.fontSize) || 0,
        fontWeight: Number(style.fontWeight) || 400,
        lineHeightPx: style.lineHeight === "normal" ? null : number(style.lineHeight),
        letterSpacingPx: style.letterSpacing === "normal" ? null : number(style.letterSpacing),
        color: style.color,
        backgroundColor: backgroundFor(element),
        widthPx: Math.round(rect.width),
        topPx: Math.round(rect.top + window.scrollY),
      };
    }).filter((item) => item.text);
    const actionSamples = Array.from(document.querySelectorAll("a[href], button, input[type='submit'], [role='button']")).filter(visible).slice(0, 40).map((element) => {
      const style = getComputedStyle(element);
      const rect = (element as HTMLElement).getBoundingClientRect();
      return {
        label: ((element.textContent || (element as HTMLInputElement).value || element.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim()).slice(0, 120),
        topPx: Math.round(rect.top + window.scrollY), widthPx: Math.round(rect.width), heightPx: Math.round(rect.height),
        color: style.color, backgroundColor: backgroundFor(element), visible: true,
      };
    });
    const dominantColors = Array.from(new Set([...textSamples.flatMap((item) => [item.color, item.backgroundColor]), ...actionSamples.flatMap((item) => [item.color, item.backgroundColor])])).filter(Boolean).slice(0, 16);
    const fontFamilies = Array.from(new Set(textSamples.map((item) => item.fontFamily))).filter(Boolean).slice(0, 8);
    const images = Array.from(document.querySelectorAll("img, picture, svg")).filter(visible);
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      bodyWidthPx: Math.round(document.documentElement.scrollWidth),
      horizontalOverflowPx: Math.max(0, Math.round(document.documentElement.scrollWidth - window.innerWidth)),
      sectionCount: document.querySelectorAll("main section, body > section").length,
      landmarkCount: document.querySelectorAll("header, nav, main, aside, footer").length,
      listCount: document.querySelectorAll("ul, ol").length,
      cardLikeGroupCount: document.querySelectorAll("[class*='card'], [class*='grid'], [class*='feature'], [class*='benefit']").length,
      visibleImageCount: images.length,
      imagesAboveFold: images.filter((element) => (element as HTMLElement).getBoundingClientRect().top < window.innerHeight).length,
      textSamples,
      actionSamples,
      dominantColors,
      fontFamilies,
      longParagraphCount: Array.from(document.querySelectorAll("p")).filter((element) => visible(element) && (element.textContent || "").trim().length > 280).length,
    };
  });
}

function dedupeFindings(findings: RawFinding[]): RawFinding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.category}:${f.title}:${f.pageUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
