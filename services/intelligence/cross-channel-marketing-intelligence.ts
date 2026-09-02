import type { BusinessProfile } from "./business-profile.ts";
import type { AggregatedEvidence } from "./evidence-aggregator.ts";
import type { SourceType } from "./source-analyzer.ts";

export type ChannelRole = "primary" | "supporting" | "monitor" | "not_evaluated";

export interface CrossChannelSignal {
  source: SourceType;
  role: ChannelRole;
  status: string;
  reason: string;
  evidenceCount: number;
  limitation: string | null;
}

export interface CrossChannelMarketingIntelligence {
  objective: string;
  primaryCustomerAction: string;
  signals: CrossChannelSignal[];
  interpretation: string;
  limitations: string[];
}

const channelOrder: SourceType[] = ["reviews", "instagram", "web", "search", "linkedin", "youtube", "tiktok", "facebook", "x", "reddit", "competitor", "external_mentions"];

export function buildCrossChannelMarketingIntelligence(profile: BusinessProfile, aggregated: AggregatedEvidence): CrossChannelMarketingIntelligence {
  const evaluated = channelOrder.filter((source) => aggregated.sources[source]?.status === "evaluated");
  const ranked = evaluated.map((source) => ({ source, relevance: contextualRelevance(source, profile) }))
    .sort((a, b) => b.relevance - a.relevance || channelOrder.indexOf(a.source) - channelOrder.indexOf(b.source));
  const primarySource = ranked[0]?.source || null;
  const signals = channelOrder.flatMap((source): CrossChannelSignal[] => {
    const evidence = aggregated.sources[source];
    if (!evidence) return [];
    const status = evidence.status;
    const role: ChannelRole = status !== "evaluated" ? "not_evaluated" : source === primarySource ? "primary" : contextualRelevance(source, profile) >= .55 ? "supporting" : "monitor";
    return [{
      source,
      role,
      status,
      reason: role === "not_evaluated" ? "No hay evidencia utilizable; no se interpreta como desempeño bajo." : channelReason(source, profile),
      evidenceCount: Array.isArray(evidence.findings) ? evidence.findings.length : 0,
      limitation: status === "evaluated" ? null : String(evidence.metadata?.reason || `Fuente ${status}.`),
    }];
  });
  return {
    objective: profile.goal.goalOriginalText,
    primaryCustomerAction: profile.primaryCustomerAction,
    signals,
    interpretation: primarySource
      ? `${label(primarySource)} es el canal observado con relación más directa al objetivo y a ${profile.primaryCustomerAction}; los demás canales cumplen funciones de apoyo o validación.`
      : "No hay canales observados suficientes para priorizar; la ausencia de datos no se interpreta como mal desempeño.",
    limitations: signals.filter((item) => item.role === "not_evaluated").map((item) => `${label(item.source)}: ${item.limitation}`),
  };
}

function contextualRelevance(source: SourceType, profile: BusinessProfile) {
  const goal = normalize(profile.goal.goalOriginalText);
  let relevance = .25;
  if (source === profile.primaryChannel) relevance += .35;
  if (source === "web") relevance += profile.operatingMode === "online" || profile.operatingMode === "mixed" ? .4 : .18;
  if (source === "reviews") relevance += profile.localDependency === "high" || profile.decisionFactors.reviews >= .7 ? .45 : .12;
  if (source === "search") relevance += profile.localDependency === "high" ? .35 : .18;
  if (source === "instagram") relevance += ["appointments", "reservations", "visits"].includes(profile.goal.interpretation.goalType) ? .32 : .18;
  if (source === "linkedin") relevance += profile.customerType?.toLowerCase().includes("b2b") || profile.commercialModel === "professional" ? .5 : .05;
  if (source === "youtube") relevance += /educ|confianza|consider|explicar|demostrar/.test(goal) ? .35 : .12;
  if (source === "tiktok") relevance += /alcance|descubr|visib|conoc/.test(goal) ? .3 : .08;
  if (["x", "reddit"].includes(source)) relevance += /reput|opinion|queja|percepcion/.test(goal) ? .3 : .05;
  if (source === "competitor") relevance += .15;
  return Math.min(1, relevance);
}

function channelReason(source: SourceType, profile: BusinessProfile) {
  if (source === "reviews") return `Aporta confianza y elección local antes de ${profile.primaryCustomerAction}.`;
  if (source === "web") return `Aporta explicación, evaluación y el recorrido hacia ${profile.primaryCustomerAction}.`;
  if (source === "instagram") return `Aporta descubrimiento y evaluación visual del negocio antes de ${profile.primaryCustomerAction}.`;
  if (source === "linkedin") return `Aporta especialización y confianza profesional para ${profile.customerType || "el público del negocio"}.`;
  if (source === "search") return "Aporta encontrabilidad y contexto público verificable.";
  if (source === "competitor") return "Aporta contexto comparativo; no define por sí solo una decisión.";
  return `Aporta señales complementarias para el objetivo “${profile.goal.goalOriginalText}”.`;
}

function label(source: SourceType) {
  return ({ reviews: "Google y reseñas", web: "el sitio web", instagram: "Instagram", search: "la búsqueda pública", linkedin: "LinkedIn", youtube: "YouTube", tiktok: "TikTok", facebook: "Facebook", x: "X", reddit: "Reddit", competitor: "la comparación competitiva", external_mentions: "las menciones externas" } as Partial<Record<SourceType, string>>)[source] || source;
}

function normalize(value: unknown) { return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
