import type { AggregatedEvidence } from "./evidence-aggregator.ts";
import type { SourceEvidence, SourceType } from "./source-analyzer.ts";

export type ObservableMetricValue = string | number | boolean | null;
export interface ChannelMetric {
  key: string;
  label: string;
  value: ObservableMetricValue;
  availability: "observed" | "requires_connection" | "unavailable";
  detail?: string;
}
export interface ChannelMetricsView {
  source: SourceType;
  status: SourceEvidence["status"];
  summary: string;
  metrics: ChannelMetric[];
}

const record = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const array = (value: unknown): any[] => Array.isArray(value) ? value : [];
const number = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;

export function buildChannelMetrics(aggregated: AggregatedEvidence): ChannelMetricsView[] {
  return Object.values(aggregated.sources).map(normalizeChannel).filter((value): value is ChannelMetricsView => Boolean(value));
}

function normalizeChannel(evidence: SourceEvidence): ChannelMetricsView | null {
  if (evidence.source === "web") return websiteMetrics(evidence);
  if (evidence.source === "search") return searchMetrics(evidence);
  if (["instagram", "tiktok", "facebook", "linkedin", "youtube", "x"].includes(evidence.source)) return socialMetrics(evidence);
  if (["reviews", "external_mentions", "competitor"].includes(evidence.source)) {
    return { source: evidence.source, status: evidence.status, summary: sourceSummary(evidence), metrics: [{ key: "evidence_count", label: "Señales verificadas", value: evidence.findings.length, availability: evidence.status === "evaluated" ? "observed" : "unavailable" }] };
  }
  return null;
}

function websiteMetrics(evidence: SourceEvidence): ChannelMetricsView {
  const data = record(evidence.data); const pages = array(data.pages); const journeys = array(data.journeys);
  const pageText = JSON.stringify(pages.map((page) => ({ title: page.title, metaDesc: page.metaDesc, h1s: page.h1s, findings: page.findings })));
  const avgLoad = number(record(data.performanceSummary).avgLoadTimeMs);
  const mobileSamples = pages.map((page) => record(page.renderedMarketingSignals)).filter((item) => Object.keys(item).length);
  const mobileUsable = mobileSamples.length ? mobileSamples.every((item) => number(item.horizontalOverflowPx) === null || Number(item.horizontalOverflowPx) <= 4) : null;
  const bestJourney = journeys.find((item) => ["validated", "partial"].includes(String(item.status)));
  return {
    source: "web", status: evidence.status,
    summary: evidence.status === "evaluated" ? `Sitio activo; se analizaron ${number(data.pagesAnalyzed) ?? pages.length} página(s).` : sourceSummary(evidence),
    metrics: [
      metric("site_found", "Sitio encontrado", evidence.status === "evaluated"),
      metric("https", "Conexión segura HTTPS", text(data.baseUrl)?.startsWith("https://") ?? null),
      metric("load_time", "Carga observada", avgLoad, avgLoad === null ? undefined : `${(avgLoad / 1000).toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`),
      metric("mobile", "Uso en celular", mobileUsable, mobileUsable === null ? undefined : mobileUsable ? "Se adapta correctamente al ancho de pantalla observado" : "Se observó contenido fuera del ancho de pantalla"),
      metric("pages", "Páginas analizadas", number(data.pagesAnalyzed) ?? pages.length),
      metric("cta", "Llamados a la acción detectados", sum(pages, "ctaCount")),
      metric("forms", "Formularios detectados", sum(pages, "formCount")),
      metric("whatsapp", "Accesos a WhatsApp", sum(pages, "whatsappCount")),
      metric("contact", "Información de contacto", pages.length ? pages.some((page) => Boolean(page.hasContactInfo)) : null),
      metric("phone", "Teléfono visible", pages.length ? /tel[eé]fono|llamar|\+?54\s?\d/.test(pageText.toLowerCase()) : null),
      metric("email", "Email visible", pages.length ? /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(pageText) : null),
      metric("address", "Dirección visible", pages.length ? /direcci[oó]n|ubicaci[oó]n|c[oó]mo llegar|recoleta|palermo|caba/i.test(pageText.toLowerCase()) : null),
      metric("trust", "Señales de confianza", pages.length ? pages.some((page) => Boolean(page.hasTrustSignals)) : null),
      metric("team", "Equipo o profesionales", pages.length ? /equipo|profesional|especialista|staff|nosotros/i.test(pageText.toLowerCase()) : null),
      metric("services", "Servicios o productos explicados", pages.length ? /servicio|tratamiento|producto|soluci[oó]n/i.test(pageText.toLowerCase()) : null),
      metric("steps", "Pasos observados hasta la acción", number(bestJourney?.steps)),
      metric("action_clarity", "Claridad del contenido según NUVRA", number(bestJourney?.clarity), number(bestJourney?.clarity) === null ? undefined : `${Math.round(Number(bestJourney.clarity) * 100)}/100`),
    ],
  };
}

function searchMetrics(evidence: SourceEvidence): ChannelMetricsView {
  const data = record(evidence.data); const results = array(data.results); const queries = array(data.queries).filter((item) => typeof item === "string");
  const position = number(data.topPosition);
  return { source: "search", status: evidence.status, summary: evidence.status === "evaluated" ? `${results.length} resultado(s) observados en ${queries.length} búsqueda(s).` : sourceSummary(evidence), metrics: [
    metric("queries", "Búsquedas observadas", queries.length),
    metric("results", "Resultados observados", results.length),
    metric("brand_mentions", "Resultados asociados al negocio", number(data.brandMentions)),
    metric("observed_position", "Posición en la búsqueda observada", position, position === null ? undefined : `Posición ${position}; no representa un ranking general`),
    metric("official_website", "Sitio oficial encontrado", number(data.domainMatches) === null ? null : Number(data.domainMatches) > 0),
  ] };
}

function socialMetrics(evidence: SourceEvidence): ChannelMetricsView {
  const data = record(evidence.data); const coverage = record(data.sourceCoverage || evidence.metadata?.sourceCoverage); const profile = record(data.profile);
  const entityValidation = record(evidence.metadata?.entityValidation);
  const rejectedIdentity = number(entityValidation.accepted) === 0 && (number(entityValidation.rejected) || 0) > 0;
  const connectionNeeded = evidence.status === "requires_auth" || coverage.metrics === "none";
  return { source: evidence.source, status: evidence.status, summary: sourceSummary(evidence), metrics: [
    metric("profile", "Perfil encontrado", rejectedIdentity ? null : Boolean(data.identity || profile.profileDiscovered || data.profileDiscovered)),
    metric("bio", "Bio disponible", rejectedIdentity ? null : Boolean(text(profile.description) || text(data.publicDescription))),
    metric("content", "Contenido público observado", rejectedIdentity ? null : array(data.acceptedContentIds).length || array(data.content).length || null),
    metric("link", "Enlace público visible", rejectedIdentity ? null : Boolean(text(profile.url) || text(data.websiteUrl) || text(data.externalUrl)) || null),
    metric("location", "Ubicación pública visible", rejectedIdentity ? null : Boolean(text(profile.location) || text(data.location)) || null),
    { key: "private_metrics", label: "Alcance, impresiones y clics", value: null, availability: connectionNeeded ? "requires_connection" : "unavailable", detail: connectionNeeded ? "Disponible al conectar la cuenta" : "No disponible en la evidencia pública" },
  ] };
}

function metric(key: string, label: string, value: ObservableMetricValue, detail?: string): ChannelMetric { return { key, label, value, availability: value === null ? "unavailable" : "observed", ...(detail ? { detail } : {}) }; }
function sum(items: any[], key: string) { return items.length ? items.reduce((total, item) => total + (number(item?.[key]) || 0), 0) : null; }
function sourceSummary(evidence: SourceEvidence) { if (evidence.status === "evaluated") return evidence.findings.length ? `${evidence.findings.length} señal(es) verificadas.` : "Fuente analizada sin señales suficientes para evaluar desempeño."; if (evidence.status === "requires_auth") return "Se necesita conectar la cuenta para ampliar esta información."; if (evidence.status === "not_relevant") return "Este canal no es prioritario para el negocio."; return "No se obtuvo información suficiente de esta fuente."; }
