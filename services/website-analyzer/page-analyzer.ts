import * as cheerio from "cheerio";
import type { PageActionSignal, PageAnalysisData, PageFormSignal, PageRenderedMarketingSignals, RawFinding, WebsiteJourneyIntent } from "./types";

const CTA_PATTERNS = [
  /compr/i, /contact/i, /consult/i, /reserv/i, /whatsapp/i, /pedi/i, /orden/i,
  /solicit/i, /agend/i, /cotiz/i, /registr/i, /suscrib/i, /empez/i, /proba/i,
  /buy/i, /shop/i, /order/i, /book/i, /get started/i, /sign up/i, /quote/i,
];

const TRUST_KEYWORDS = [
  "testimonio", "testimonial", "review", "reseña", "cliente", "caso de éxito",
  "case study", "garantía", "certific", "confian", "trust", "partner",
];

const COMMERCIAL_SIGNALS = [
  { category: "propuesta", title: "Productos o servicios visibles", pattern: /servicio|producto|tratamiento|men[uú]|cat[aá]logo|especialidad/i, evidence: "La página muestra información sobre productos o servicios concretos." },
  { category: "propuesta", title: "Precios o promociones visibles", pattern: /\$\s?\d|precio|promoci[oó]n|descuento|cuota/i, evidence: "La página publica precios, promociones o condiciones comerciales observables." },
  { category: "presencia", title: "Horarios visibles", pattern: /horario|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo/i, evidence: "La página muestra horarios o días de atención." },
  { category: "conversion", title: "Información de entrega visible", pattern: /env[ií]o|entrega|retiro|despacho/i, evidence: "La página menciona información de envío, entrega o retiro." },
  { category: "conversion", title: "Medios de pago visibles", pattern: /medio de pago|tarjeta|transferencia|mercado pago|efectivo|cuota/i, evidence: "La página muestra medios o condiciones de pago." },
  { category: "trust", title: "Equipo o profesionales visibles", pattern: /nuestro equipo|profesionales|especialistas|staff|fundador|experiencia/i, evidence: "La página presenta al equipo, profesionales o experiencia del negocio." },
  { category: "propuesta", title: "Preguntas frecuentes visibles", pattern: /preguntas frecuentes|frequently asked|\bfaq\b/i, evidence: "La página responde preguntas frecuentes antes de avanzar." },
] as const;

export function analyzePageHtml(url: string, html: string, loadTimeMs?: number, renderedMarketingSignals?: PageRenderedMarketingSignals): PageAnalysisData {
  const $ = cheerio.load(html);
  const findings: RawFinding[] = [];
  const text = $("body").text().replace(/\s+/g, " ").trim();

  const title = $("title").first().text().trim();
  const metaDesc = $('meta[name="description"]').attr("content")?.trim() || "";
  const h1s = $("h1").map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const h2Count = $("h2").length;

  if (!title) {
    findings.push(makeFinding("seo", "high", "Sin tag title", "No se encontró elemento <title> en la página.", url, "html", "alta"));
  } else if (title.length < 20) {
    findings.push(makeFinding("seo", "medium", "Title muy corto", `Title: "${title}" (${title.length} caracteres).`, url, "html", "alta"));
  }

  if (!metaDesc) {
    findings.push(makeFinding("seo", "medium", "Sin meta description", "No se encontró meta description.", url, "html", "alta"));
  }

  if (h1s.length === 0) {
    findings.push(makeFinding("propuesta", "high", "Sin H1", "No se encontró un encabezado H1 principal.", url, "html", "alta"));
  } else if (h1s.length > 1) {
    findings.push(makeFinding("propuesta", "low", "Múltiples H1", `Se encontraron ${h1s.length} H1: ${h1s.slice(0, 3).join(" | ")}`, url, "html", "alta"));
  }

  const imgs = $("img");
  const imgsWithoutAlt = imgs.filter((_, el) => !$(el).attr("alt")?.trim()).length;
  if (imgs.length > 0 && imgsWithoutAlt / imgs.length > 0.5) {
    findings.push(makeFinding("seo", "medium", "Imágenes sin alt text", `${imgsWithoutAlt} de ${imgs.length} imágenes no tienen atributo alt.`, url, "html", "alta"));
  }

  const buttons = $("button, a.btn, a.button, [role='button'], input[type='submit']");
  const ctaLinks = $("a").filter((_, el) => {
    const t = $(el).text().trim().toLowerCase();
    const cls = ($(el).attr("class") || "").toLowerCase();
    return CTA_PATTERNS.some((p) => p.test(t) || p.test(cls));
  });

  const allCtas = buttons.length + ctaLinks.length;
  if (allCtas === 0) {
    findings.push(makeFinding("conversion", "high", "Sin CTAs detectables", "No se encontraron botones ni enlaces con texto de acción reconocible.", url, "html", "alta"));
  }

  const whatsappLinks = $("a[href*='wa.me'], a[href*='whatsapp'], a[href*='api.whatsapp']").length;
  if (whatsappLinks > 0) {
    findings.push(makeFinding("conversion", "info", "WhatsApp detectado", `Se encontraron ${whatsappLinks} enlace(s) a WhatsApp.`, url, "html", "alta"));
  }

  const forms = $("form");
  if (forms.length > 0) {
    const fields = forms.find("input, textarea, select").length;
    findings.push(makeFinding("conversion", "info", "Formulario detectado", `${forms.length} formulario(s) con ~${fields} campos.`, url, "html", "alta"));
  }

  const textLower = text.toLowerCase();
  for (const signal of COMMERCIAL_SIGNALS) {
    if (signal.pattern.test(textLower)) findings.push(makeFinding(signal.category, "info", signal.title, signal.evidence, url, "html", "media"));
  }
  const hasTrust = TRUST_KEYWORDS.some((k) => textLower.includes(k));
  if (!hasTrust) {
    findings.push(makeFinding("trust", "medium", "Señales de confianza limitadas", "No se detectaron testimonios, reseñas, casos o garantías en el contenido visible.", url, "html", "media"));
  } else {
    findings.push(makeFinding("trust", "info", "Señales de confianza presentes", "Se detectaron palabras clave de confianza (testimonios, reseñas, casos, etc.).", url, "html", "media"));
  }

  const navLinks = $("nav a, header a").length;
  if (navLinks < 3) {
    findings.push(makeFinding("presencia", "medium", "Navegación limitada", `Solo ${navLinks} enlaces en nav/header.`, url, "html", "alta"));
  }

  const hasContact = /contact|tel:|mailto:|direcci|address|ubicaci/i.test(html);
  if (!hasContact) {
    findings.push(makeFinding("trust", "medium", "Datos de contacto no evidentes", "No se detectaron teléfono, email o sección de contacto visible.", url, "html", "media"));
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < 150 && url.endsWith("/") || url.split("/").length <= 4) {
    findings.push(makeFinding("propuesta", "medium", "Contenido escaso above-the-fold", `La página tiene aproximadamente ${wordCount} palabras visibles — puede dificultar entender la propuesta de valor.`, url, "html", "media"));
  }

  if (h2Count === 0 && wordCount > 200) {
    findings.push(makeFinding("presencia", "low", "Sin estructura H2", "Contenido extenso sin subtítulos H2 para organizar información.", url, "html", "alta"));
  }

  if (loadTimeMs && loadTimeMs > 5000) {
    findings.push(makeFinding("presencia", "high", "Tiempo de carga elevado", `La página tardó ${(loadTimeMs / 1000).toFixed(1)}s en cargar.`, url, "playwright", "alta"));
  } else if (loadTimeMs && loadTimeMs <= 3000) {
    findings.push(makeFinding("presencia", "info", "Tiempo de carga aceptable", `Carga en ${(loadTimeMs / 1000).toFixed(1)}s.`, url, "playwright", "alta"));
  }

  const actionSignals = collectActionSignals($, url);
  const formSignals = collectFormSignals($, url);
  const brandSignals = collectBrandSignals($, html, title, metaDesc);

  return {
    url,
    title,
    metaDesc,
    h1s,
    h2Count,
    wordCount,
    ctaCount: allCtas,
    whatsappCount: whatsappLinks,
    formCount: forms.length,
    formFields: forms.length ? forms.find("input, textarea, select").length : 0,
    navLinkCount: navLinks,
    imgsTotal: imgs.length,
    imgsWithoutAlt,
    hasTrustSignals: hasTrust,
    hasContactInfo: hasContact,
    loadTimeMs,
    findings,
    htmlLength: html.length,
    actionSignals,
    formSignals,
    brandSignals,
    renderedMarketingSignals,
  };
}

function inferIntent(text: string, href = ""): WebsiteJourneyIntent | null {
  const value = `${text} ${href}`.toLowerCase();
  if (/presupuesto|cotiz|quote/.test(value)) return "quote";
  if (/turno|agend|appointment/.test(value)) return "appointment";
  if (/reserv|book|mesa/.test(value)) return "reserve";
  if (/compr|carrito|checkout|tienda|shop|order|pedido/.test(value)) return "buy";
  if (/contact|consult|whatsapp|escrib|llam|tel:|mailto:|wa\.me/.test(value)) return "contact";
  return null;
}

function collectActionSignals($: cheerio.CheerioAPI, pageUrl: string): PageActionSignal[] {
  const signals: PageActionSignal[] = [];
  $("a[href], button, input[type='submit']").each((_, element) => {
    const node = $(element);
    const label = (node.text() || node.attr("value") || node.attr("aria-label") || "").replace(/\s+/g, " ").trim();
    const rawHref = node.attr("href") || null;
    const intent = inferIntent(label, rawHref || "");
    if (!intent) return;
    let href = rawHref;
    if (href && !/^(?:javascript:|#)/i.test(href)) {
      try { href = new URL(href, pageUrl).toString(); } catch { href = rawHref; }
    }
    const tag = element.tagName?.toLowerCase();
    const kind: PageActionSignal["kind"] = tag === "a" ? "link" : node.attr("type") === "submit" ? "submit" : "button";
    const direct = Boolean(href && /^(?:https?:\/\/(?:wa\.me|api\.whatsapp\.com)|tel:|mailto:)/i.test(href));
    signals.push({ label: label || intent, href, intent, kind, direct });
  });
  return uniqueBy(signals, (item) => `${item.intent}:${item.label}:${item.href}`).slice(0, 40);
}

function collectFormSignals($: cheerio.CheerioAPI, pageUrl: string): PageFormSignal[] {
  return $("form").map((_, element) => {
    const form = $(element);
    const fields = form.find("input:not([type='hidden']), textarea, select");
    const required = fields.filter("[required], [aria-required='true']");
    const submit = form.find("button[type='submit'], input[type='submit'], button:not([type])").first();
    const submitLabel = (submit.text() || submit.attr("value") || submit.attr("aria-label") || "").replace(/\s+/g, " ").trim() || null;
    const rawAction = form.attr("action") || null;
    let action = rawAction;
    if (action) try { action = new URL(action, pageUrl).toString(); } catch { action = rawAction; }
    const context = `${form.attr("id") || ""} ${form.attr("class") || ""} ${submitLabel || ""} ${fields.map((__, field) => `${$(field).attr("name") || ""} ${$(field).attr("placeholder") || ""}`).get().join(" ")}`;
    return { action, method: (form.attr("method") || "get").toLowerCase(), fieldCount: fields.length, requiredFieldCount: required.length, submitLabel, intent: inferIntent(context, action || "") || "contact" } satisfies PageFormSignal;
  }).get();
}

function collectBrandSignals($: cheerio.CheerioAPI, html: string, title: string, metaDesc: string): PageAnalysisData["brandSignals"] {
  const logoReferences = $("img, svg, [class*='logo'], [id*='logo']").filter((_, element) => /logo|marca|brand/i.test(`${$(element).attr("alt") || ""} ${$(element).attr("class") || ""} ${$(element).attr("id") || ""} ${$(element).attr("src") || ""}`)).map((_, element) => $(element).attr("src") || $(element).attr("aria-label") || $(element).attr("class") || "logo-inline").get();
  const colorMatches = html.match(/(?:#[0-9a-f]{3,8}\b|rgba?\([^)]{5,40}\))/gi) || [];
  const fontMatches = Array.from(html.matchAll(/font-family\s*:\s*([^;}]+)/gi)).map((match) => match[1].replace(/["']/g, "").trim().toLowerCase()).filter(Boolean);
  const images = $("img");
  const descriptiveImageCount = images.filter((_, element) => Boolean($(element).attr("alt")?.trim())).length;
  const toneSamples = [title, metaDesc, ...$("h1, h2").slice(0, 5).map((_, element) => $(element).text().replace(/\s+/g, " ").trim()).get()].filter(Boolean);
  return {
    logoReferences: uniqueBy(logoReferences, String).slice(0, 10),
    colors: mostFrequent(colorMatches.map((item) => item.toLowerCase()), 8),
    fonts: mostFrequent(fontMatches, 5),
    imageCount: images.length,
    descriptiveImageCount,
    toneSamples: toneSamples.slice(0, 8),
  };
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => { const value = key(item); if (seen.has(value)) return false; seen.add(value); return true; });
}

function mostFrequent(items: string[], limit: number) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) || 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([item]) => item);
}

function makeFinding(
  category: string,
  severity: string,
  title: string,
  evidence: string,
  pageUrl: string,
  source: string,
  confidence: string
): RawFinding {
  return {
    type: severity === "info" ? "strength" : "problem",
    category,
    severity,
    title,
    description: title,
    evidence,
    pageUrl,
    source,
    confidence,
    impact: severity === "high" ? "alto" : severity === "medium" ? "medio" : "bajo",
  };
}

export function discoverInternalLinks(baseUrl: string, html: string, maxLinks = 30): string[] {
  const $ = cheerio.load(html);
  const base = new URL(baseUrl);
  const found = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    try {
      const abs = new URL(href, baseUrl);
      if (abs.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) return;
      if (/\.(pdf|jpg|jpeg|png|gif|zip|doc|docx|xls|xlsx)$/i.test(abs.pathname)) return;
      abs.hash = "";
      found.add(abs.toString());
    } catch {
      /* skip invalid */
    }
  });

  const prioritized = Array.from(found).sort((a, b) => {
    const score = (u: string) => {
      const path = new URL(u).pathname.toLowerCase();
      let s = 0;
      for (const kw of ["about", "nosotros", "product", "servic", "precio", "pricing", "contact", "shop", "tienda", "reserv", "turno", "pedido", "cart", "checkout", "presupuesto"]) {
        if (path.includes(kw)) s += 10;
      }
      if (path === "/" || path === "") s += 5;
      return s;
    };
    return score(b) - score(a);
  });

  return prioritized.slice(0, maxLinks);
}
