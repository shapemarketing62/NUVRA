// WebsiteCrossLinkExtractor
// -------------------------
// Scans the analyzed website pages for OUTBOUND social links. Each
// cross-link is STRONG evidence of ownership for the corresponding
// platform. The output is consumed by:
//
//   * PlatformDiscoveryPlanner (so platforms with a cross-link skip the
//     `site:` search step and use `follow_cross_link` instead), and
//   * EntityMatcher (so a single page that contains BOTH the business
//     name and a link to `instagram.com/foo` is enough to corroborate
//     the Instagram profile).
//
// IMPORTANT: this extractor is a pure function over the already-rendered
// PageAnalysisData. It does NOT call the network and does NOT depend on
// any provider.

import type { PageAnalysisData } from "../website-analyzer/types.ts";
import type { SocialPlatform } from "../intelligence/social/social-source-provider.ts";

export type CrossLinkPlatform =
  | SocialPlatform
  | "instagram"
  | "google_business_profile"
  | "pinterest"
  | "other";

export interface WebsiteCrossLink {
  /** Logical platform the link refers to. */
  platform: CrossLinkPlatform;
  /** Normalized absolute URL of the link. */
  url: string;
  /** Page on which the link was found (the business's own URL). */
  sourcePage: string;
  /** Anchor text used in the link, if any. Useful for ownership context. */
  anchorText: string;
  /** Lower-cased hostname (e.g. "instagram.com"). */
  hostname: string;
}

const PLATFORM_RULES: Array<{ platform: CrossLinkPlatform; match: RegExp }> = [
  { platform: "instagram",              match: /(^|\.)instagram\.com$/i },
  { platform: "tiktok",                 match: /(^|\.)tiktok\.com$/i },
  { platform: "facebook",               match: /(^|\.)facebook\.com$/i },
  { platform: "linkedin",               match: /(^|\.)linkedin\.com$/i },
  { platform: "youtube",                match: /(^|\.)youtube\.com$/i },
  { platform: "youtube",                match: /(^|\.)youtu\.be$/i },
  { platform: "x",                      match: /(^|\.)x\.com$/i },
  { platform: "x",                      match: /(^|\.)twitter\.com$/i },
  { platform: "reddit",                 match: /(^|\.)reddit\.com$/i },
  { platform: "pinterest",              match: /(^|\.)pinterest\.com$/i },
  { platform: "google_business_profile",match: /(^|\.)g\.page$/i },
];

function classify(hostname: string, href: string): CrossLinkPlatform {
  for (const rule of PLATFORM_RULES) {
    if (rule.match.test(hostname)) return rule.platform;
  }
  if (/(?:^|\.)google\.[a-z.]+$/i.test(hostname) && /\/maps(?:\/|$|\?)/i.test(new URL(href).pathname + new URL(href).search)) return "google_business_profile";
  if (hostname === "maps.app.goo.gl" || (hostname === "goo.gl" && /\/maps/i.test(new URL(href).pathname))) return "google_business_profile";
  return "other";
}

/**
 * Re-exported so the website-analyzer page-analyzer (which already has
 * a cheerio DOM loaded) can classify a single hostname without having
 * to re-implement the rules. Pure function.
 */
export function classifyCrossLinkHostname(hostname: string, href: string): CrossLinkPlatform {
  try { return classify(hostname, href); } catch { return "other"; }
}

/** Keep ownership corroboration limited to profile/listing URLs. */
export function isOwnershipCandidateUrl(platform: CrossLinkPlatform, href: string): boolean {
  try {
    const url = new URL(href);
    const segments = url.pathname.split("/").filter(Boolean);
    const first = (segments[0] || "").toLowerCase();

    switch (platform) {
      case "instagram":
        return segments.length === 1 && !["p", "reel", "reels", "stories", "explore", "accounts"].includes(first);
      case "tiktok":
        return segments.length === 1 && first.startsWith("@") && first.length > 1;
      case "facebook":
        return (segments.length === 1 && !["share", "sharer", "dialog", "plugins", "watch", "reel", "events", "profile.php"].includes(first))
          || (first === "profile.php" && url.searchParams.has("id"));
      case "linkedin":
        return segments.length >= 2 && ["company", "in", "school", "showcase"].includes(first);
      case "youtube":
        return (segments.length === 1 && first.startsWith("@"))
          || (segments.length >= 2 && ["channel", "c", "user"].includes(first));
      case "x":
        return segments.length === 1 && !["home", "search", "explore", "intent", "share", "i", "hashtag"].includes(first);
      case "reddit":
        return segments.length >= 2 && ["r", "user", "u"].includes(first);
      case "pinterest":
        return segments.length === 1 && !["pin", "search", "ideas", "today"].includes(first);
      case "google_business_profile":
        return true;
      default:
        return false;
    }
  } catch {
    return false;
  }
}

function normalize(href: string, base: string): { url: string; hostname: string } | null {
  try {
    const abs = new URL(href, base);
    // Drop fragment and trailing slash on path-less URLs.
    abs.hash = "";
    if (abs.pathname === "/" && !abs.search) abs.pathname = "";
    return { url: abs.toString(), hostname: abs.hostname.toLowerCase().replace(/^www\./, "") };
  } catch {
    return null;
  }
}

function sameOrigin(href: string, base: string): boolean {
  try {
    const a = new URL(href, base);
    const b = new URL(base);
    return a.hostname.replace(/^www\./, "").toLowerCase() === b.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return true; // unparseable → be conservative and skip
  }
}

function hostFromHtml(html: string): string {
  // Cheap hostname recovery for the page itself.
  try {
    // Find the first <base href> or use the calling page URL.
    const m = html.match(/<base[^>]+href=["']([^"']+)["']/i);
    return m ? new URL(m[1]).hostname.toLowerCase().replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

export class WebsiteCrossLinkExtractor {
  /**
   * Extract cross-platform links from a list of already-analyzed pages.
   * Each input is (pageUrl, html) — we use cheerio to walk `<a href>`.
   *
   * @param pages list of pages the website analyzer has visited.
   * @param businessHost optional known hostname of the business (used to
   *        filter out links that point to the same origin, e.g. nav
   *        anchors).
   */
  static extract(
    pages: Array<{ url: string; html: string }>,
    businessHost?: string
  ): WebsiteCrossLink[] {
    const results: WebsiteCrossLink[] = [];
    const seen = new Set<string>();

    for (const page of pages) {
      const baseHost = businessHost || hostFromHtml(page.html) || safeHost(page.url);
      // Use a tiny DOM parser via regex. We avoid cheerio here so this
      // module stays free of native deps and works in test environments
      // without DOM polyfills. The pattern is intentionally narrow:
      // `<a href="...">text</a>`. Pages that already have a parsed
      // PageAnalysisData should prefer extractFromPageAnalysis instead.
      const linkRe = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = linkRe.exec(page.html)) !== null) {
        const href = (m[1] || m[2] || m[3] || "").trim();
        if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) continue;
        if (sameOrigin(href, page.url)) continue;
        const norm = normalize(href, page.url);
        if (!norm) continue;
        // Filter: hostname must NOT be the business itself.
        if (norm.hostname === baseHost) continue;
        const platform = classify(norm.hostname, norm.url);
        if (platform === "other") continue;
        if (!isOwnershipCandidateUrl(platform, norm.url)) continue;
        const key = `${platform}|${norm.url}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const anchorText = (m[4] || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
        results.push({
          platform,
          url: norm.url,
          sourcePage: page.url,
          anchorText,
          hostname: norm.hostname,
        });
      }
    }
    return results;
  }

  /**
   * Convenience overload that takes the strongly-typed PageAnalysisData
   * the website analyzer already returns. The page analyzer does not
   * currently keep the raw HTML on PageAnalysisData, so this variant
   * works off a parallel `html` field supplied by the caller (the
   * orchestrator keeps it next to the analysis result for the trace).
   */
  static extractFromPageAnalyses(
    pages: Array<{ analysis: PageAnalysisData; html: string; url: string }>,
    businessHost?: string
  ): WebsiteCrossLink[] {
    return this.extract(pages.map((p) => ({ url: p.url, html: p.html })), businessHost);
  }

  /**
   * Read the outbound social links already extracted by the page
   * analyzer (`PageAnalysisData.outboundLinks`). This is the
   * PREFERRED path for the BI layer because it avoids re-parsing
   * the HTML. Returns a flat deduped list.
   */
  static fromPageAnalyses(pages: PageAnalysisData[]): WebsiteCrossLink[] {
    const seen = new Set<string>();
    const out: WebsiteCrossLink[] = [];
    for (const page of pages) {
      for (const link of page.outboundLinks || []) {
        const key = `${link.platform}|${link.url}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(link);
      }
    }
    return out;
  }

  /**
   * Group cross-links by platform for use in AnalysisTrace and in the
   * PlatformDiscoveryPlanner input.
   */
  static group(links: WebsiteCrossLink[]): Partial<Record<string, WebsiteCrossLink[]>> {
    const out: Partial<Record<string, WebsiteCrossLink[]>> = {};
    for (const l of links) {
      (out[l.platform] ||= []).push(l);
    }
    return out;
  }
}

function safeHost(url: string): string {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}
