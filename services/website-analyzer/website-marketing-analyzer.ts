import { marketingKnowledge } from "../knowledge/marketing-knowledge-catalog.ts";
import type { PageAnalysisData, RawFinding, WebsiteJourneyIntent, WebsiteMarketingAreaAnalysis, WebsiteMarketingIntelligence } from "./types.ts";

export interface WebsiteMarketingContext {
  industry?: string | null;
  customerType?: string | null;
  objective?: string | null;
}

export class WebsiteMarketingAnalyzer {
  static analyze(pages: PageAnalysisData[], context: WebsiteMarketingContext = {}): WebsiteMarketingIntelligence {
    const safePages = Array.isArray(pages) ? pages.filter(Boolean) : [];
    const home = safePages[0];
    const expectedPrimaryIntent = inferExpectedIntent(context);
    if (!home) return {
      context: { industry: context.industry || "", customerType: context.customerType || null, objective: context.objective || null, expectedPrimaryIntent },
      areas: emptyAreas(), findings: [], evaluatedAt: new Date().toISOString(), limitations: ["No hubo una página renderizada utilizable para evaluar comunicación, diseño y conversión."],
    };

    const rendered = home.renderedMarketingSignals;
    const areas: WebsiteMarketingAreaAnalysis[] = [
      structureArea(safePages, context),
      hierarchyArea(home),
      colorArea(home),
      typographyArea(home),
      imageryArea(home),
      scannabilityArea(home),
      conversionArea(safePages, expectedPrimaryIntent),
    ];
    const findings = buildFindings(home, areas, expectedPrimaryIntent);
    const limitations = [
      ...(!rendered ? ["No se obtuvieron estilos renderizados; jerarquía, color y tipografía tienen cobertura parcial."] : []),
      "La función semántica de una imagen solo se afirma cuando existe texto alternativo o contexto estructural utilizable.",
      "El análisis observa la interfaz sin completar compras, reservas ni envíos irreversibles.",
    ];
    return {
      context: { industry: context.industry || "", customerType: context.customerType || null, objective: context.objective || null, expectedPrimaryIntent },
      areas, findings, evaluatedAt: new Date().toISOString(), limitations,
    };
  }
}

function structureArea(pages: PageAnalysisData[], context: WebsiteMarketingContext): WebsiteMarketingAreaAnalysis {
  const home = pages[0];
  const bodyText = `${home.title} ${home.metaDesc} ${home.h1s.join(" ")} ${home.findings.map((finding) => finding.evidence).join(" ")}`;
  const local = /restaurante|caf[eé]|cl[ií]nica|odont|est[eé]tica|gimnasio|local|peluquer|bar/i.test(context.industry || "");
  const ecommerce = /ecommerce|tienda|retail|producto|venta online/i.test(context.industry || "");
  const service = /servicio|consult|estudio|profesional|b2b|agencia|software/i.test(`${context.industry || ""} ${context.customerType || ""}`);
  const positiveSignals: string[] = [];
  const frictions: string[] = [];
  if (home.h1s.length === 1) positiveSignals.push("La portada tiene un título principal identificable.");
  if (home.h1s.length === 0) frictions.push("No se pudo identificar una propuesta principal en un título visible.");
  if (home.hasTrustSignals) positiveSignals.push("La portada contiene señales observables de confianza o prueba social.");
  if (local && /horario|ubicaci[oó]n|direcci[oó]n|tel[eé]fono|whatsapp/i.test(bodyText)) positiveSignals.push("Para un negocio local se observa información práctica de contacto o visita.");
  if (local && !home.hasContactInfo) frictions.push("Para este negocio local, la portada no hace evidente cómo contactar o ubicar el negocio.");
  if (ecommerce && /env[ií]o|entrega|pago|cuota|devoluci[oó]n/i.test(bodyText)) positiveSignals.push("Se observa información que ayuda a evaluar compra, entrega o pago.");
  if (service && home.hasTrustSignals) positiveSignals.push("La presentación del servicio incluye evidencia que puede ayudar a evaluar confianza.");
  return area("structure", positiveSignals, frictions, [`Se revisaron ${pages.length} página(s), ${home.h1s.length} H1 y ${home.h2Count} subtítulos H2 en la portada.`], ["web.home.value-proposition"]);
}

function hierarchyArea(page: PageAnalysisData): WebsiteMarketingAreaAnalysis {
  const rendered = page.renderedMarketingSignals;
  if (!rendered) return notEvaluable("hierarchy", "No se obtuvieron posiciones y estilos renderizados.", ["web.hierarchy.focus"]);
  const h1 = rendered.textSamples.find((item) => item.tag === "h1");
  const body = rendered.textSamples.find((item) => item.tag === "p");
  const aboveFoldActions = rendered.actionSamples.filter((item) => item.visible && item.topPx < rendered.viewport.height).length;
  const positiveSignals: string[] = [];
  const frictions: string[] = [];
  if (h1 && body && h1.fontSizePx >= body.fontSizePx * 1.45) positiveSignals.push("El título principal se diferencia con claridad del texto de lectura.");
  if (h1 && body && h1.fontSizePx < body.fontSizePx * 1.2) frictions.push("El título principal tiene casi el mismo peso visual que el texto general.");
  if (aboveFoldActions >= 1 && aboveFoldActions <= 3) positiveSignals.push("Hay una cantidad acotada de acciones visibles al comienzo.");
  if (aboveFoldActions > 5) frictions.push("Varias acciones compiten por atención al comienzo de la página.");
  return area("hierarchy", positiveSignals, frictions, [`Título: ${h1?.fontSizePx || "sin dato"}px; texto: ${body?.fontSizePx || "sin dato"}px; acciones visibles al inicio: ${aboveFoldActions}.`], ["web.hierarchy.focus"]);
}

function colorArea(page: PageAnalysisData): WebsiteMarketingAreaAnalysis {
  const rendered = page.renderedMarketingSignals;
  if (!rendered) return notEvaluable("color", "No se obtuvieron colores computados del navegador.", ["web.contrast.minimum"]);
  const measurable = rendered.textSamples.map((sample) => ({ sample, ratio: contrastRatio(sample.color, sample.backgroundColor) })).filter((item) => item.ratio !== null);
  const failures = measurable.filter(({ sample, ratio }) => ratio! < (sample.fontSizePx >= 24 || (sample.fontSizePx >= 18.5 && sample.fontWeight >= 700) ? 3 : 4.5));
  const positiveSignals = measurable.length >= 3 && failures.length === 0 ? ["Las muestras de texto medibles alcanzan el contraste mínimo esperado."] : [];
  const frictions = failures.length ? [`${failures.length} muestra(s) de texto tienen contraste medible insuficiente.`] : [];
  return area("color", positiveSignals, frictions, [`Se midieron ${measurable.length} combinaciones de texto/fondo y ${rendered.dominantColors.length} colores dominantes.`], ["web.contrast.minimum"]);
}

function typographyArea(page: PageAnalysisData): WebsiteMarketingAreaAnalysis {
  const rendered = page.renderedMarketingSignals;
  if (!rendered) return notEvaluable("typography", "No se obtuvieron tamaños y familias computadas.", ["web.content.scannable"]);
  const paragraphs = rendered.textSamples.filter((item) => item.tag === "p");
  const small = paragraphs.filter((item) => item.fontSizePx < 14);
  const tight = paragraphs.filter((item) => item.lineHeightPx !== null && item.lineHeightPx < item.fontSizePx * 1.2);
  const positiveSignals: string[] = [];
  const frictions: string[] = [];
  if (paragraphs.length && !small.length && !tight.length) positiveSignals.push("El texto de lectura observado mantiene tamaños e interlineados legibles.");
  if (small.length) frictions.push(`${small.length} muestra(s) de texto de lectura usan un tamaño muy reducido.`);
  if (tight.length) frictions.push(`${tight.length} muestra(s) tienen un interlineado que dificulta la lectura.`);
  return area("typography", positiveSignals, frictions, [`Familias observadas: ${rendered.fontFamilies.slice(0, 4).join(", ") || "sin dato"}.`], ["web.content.scannable"]);
}

function imageryArea(page: PageAnalysisData): WebsiteMarketingAreaAnalysis {
  const rendered = page.renderedMarketingSignals;
  const positives: string[] = [];
  const frictions: string[] = [];
  if (page.imgsTotal && page.brandSignals.descriptiveImageCount / page.imgsTotal >= .65) positives.push("La mayoría de las imágenes tiene una descripción que permite entender su función básica.");
  if (page.imgsTotal && page.brandSignals.descriptiveImageCount / page.imgsTotal < .35) frictions.push("Muchas imágenes no tienen contexto textual suficiente para evaluar su aporte.");
  return area("imagery", positives, frictions, [`Imágenes: ${page.imgsTotal}; descriptivas: ${page.brandSignals.descriptiveImageCount}; al inicio: ${rendered?.imagesAboveFold ?? "sin dato"}.`], ["web.home.value-proposition"], rendered ? "evaluated" : "partial");
}

function scannabilityArea(page: PageAnalysisData): WebsiteMarketingAreaAnalysis {
  const rendered = page.renderedMarketingSignals;
  const longParagraphs = rendered?.longParagraphCount ?? null;
  const positives: string[] = [];
  const frictions: string[] = [];
  if (page.h2Count >= 2 || (rendered?.listCount || 0) > 0) positives.push("La portada usa subtítulos o listas para organizar la lectura.");
  if (longParagraphs !== null && longParagraphs >= 3) frictions.push("Hay varios bloques extensos que dificultan encontrar información rápidamente.");
  if (page.wordCount > 350 && page.h2Count === 0) frictions.push("La portada concentra bastante texto sin subtítulos que orienten el recorrido.");
  return area("scannability", positives, frictions, [`Palabras: ${page.wordCount}; H2: ${page.h2Count}; listas: ${rendered?.listCount ?? "sin dato"}; párrafos extensos: ${longParagraphs ?? "sin dato"}.`], ["web.content.scannable"], rendered ? "evaluated" : "partial");
}

function conversionArea(pages: PageAnalysisData[], expected: WebsiteJourneyIntent | null): WebsiteMarketingAreaAnalysis {
  const actions = pages.flatMap((page) => page.actionSignals);
  const forms = pages.flatMap((page) => page.formSignals);
  const matching = expected ? actions.filter((action) => action.intent === expected) : actions;
  const positives: string[] = [];
  const frictions: string[] = [];
  if (expected && matching.length) positives.push(`Se observó una acción compatible con el paso principal esperado: ${intentLabel(expected)}.`);
  if (expected && !matching.length) frictions.push(`No se pudo confirmar en el HTML una acción directa para ${intentLabel(expected)}; esta señal requiere corroboración con el recorrido real.`);
  if (forms.some((form) => form.requiredFieldCount > 0 && form.requiredFieldCount <= 5)) positives.push("Se observó al menos un formulario con una cantidad acotada de campos obligatorios.");
  return area("conversion", positives, frictions, [`Acciones detectadas: ${actions.length}; compatibles con el objetivo: ${matching.length}; formularios: ${forms.length}.`], ["web.home.primary-action"]);
}

function buildFindings(page: PageAnalysisData, areas: WebsiteMarketingAreaAnalysis[], expected: WebsiteJourneyIntent | null): RawFinding[] {
  const findings: RawFinding[] = [];
  const byArea = new Map(areas.map((item) => [item.area, item]));
  const overflow = page.renderedMarketingSignals?.horizontalOverflowPx || 0;
  if (overflow > 8) findings.push(finding("presencia", "high", "Desborde horizontal comprobado", `La página excede el ancho visible por ${Math.round(overflow)}px en el viewport analizado.`, page.url, "playwright", "alta"));
  const color = byArea.get("color");
  if (color?.frictions.length) findings.push(finding("presencia", "medium", "Contraste de texto insuficiente", color.frictions[0], page.url, "playwright", "alta"));
  const hierarchy = byArea.get("hierarchy");
  if (hierarchy?.frictions.some((item) => item.includes("título principal"))) findings.push(finding("propuesta", "medium", "Jerarquía principal poco diferenciada", hierarchy.frictions.join(" "), page.url, "playwright", "media"));
  if (expected && byArea.get("conversion")?.positiveSignals.length) findings.push({ ...finding("conversion", "info", "Acción comercial observable", byArea.get("conversion")!.positiveSignals[0], page.url, "html", "alta"), type: "strength" });
  return findings;
}

function area(areaName: WebsiteMarketingAreaAnalysis["area"], positiveSignals: string[], frictions: string[], evidence: string[], knowledgeRuleIds: string[], status: WebsiteMarketingAreaAnalysis["status"] = "evaluated"): WebsiteMarketingAreaAnalysis {
  const activeRuleIds = knowledgeRuleIds.filter((id) => marketingKnowledge.getRule(id));
  return { area: areaName, status, positiveSignals, frictions, evidence, knowledgeRuleIds: activeRuleIds };
}

function notEvaluable(areaName: WebsiteMarketingAreaAnalysis["area"], limitation: string, rules: string[]): WebsiteMarketingAreaAnalysis {
  return area(areaName, [], [], [limitation], rules, "not_evaluable");
}

function emptyAreas(): WebsiteMarketingAreaAnalysis[] {
  return (["structure", "hierarchy", "color", "typography", "imagery", "scannability", "conversion"] as const).map((name) => notEvaluable(name, "Sin datos utilizables.", []));
}

function inferExpectedIntent(context: WebsiteMarketingContext): WebsiteJourneyIntent | null {
  const text = `${context.industry || ""} ${context.objective || ""}`.toLowerCase();
  if (/presupuesto|cotiz/.test(text)) return "quote";
  if (/turno|cl[ií]nica|odont|est[eé]tica|salud/.test(text)) return "appointment";
  if (/reserv|restaurante|caf[eé]|hotel|clase/.test(text)) return "reserve";
  if (/compr|venta|ecommerce|tienda|retail|producto/.test(text)) return "buy";
  if (/consulta|reuni[oó]n|contact|lead|cliente/.test(text)) return "contact";
  return null;
}

function intentLabel(intent: WebsiteJourneyIntent): string {
  return ({ buy: "comprar", reserve: "reservar", contact: "contactar", appointment: "pedir turno", quote: "solicitar presupuesto" })[intent];
}

function finding(category: string, severity: string, title: string, evidence: string, pageUrl: string, source: string, confidence: string): RawFinding {
  return { type: severity === "info" ? "strength" : "problem", category, severity, title, description: title, evidence, pageUrl, source, confidence };
}

function contrastRatio(foreground: string, background: string): number | null {
  const fg = parseRgb(foreground);
  const bg = parseRgb(background);
  if (!fg || !bg || fg[3] < .98 || bg[3] < .98) return null;
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

function parseRgb(value: string): [number, number, number, number] | null {
  const match = value.match(/rgba?\(\s*(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)(?:\D+(\d*\.?\d+))?\s*\)/i);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])] : null;
}

function luminance(rgb: [number, number, number, number]): number {
  const channels = rgb.slice(0, 3).map((value) => { const c = value / 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
