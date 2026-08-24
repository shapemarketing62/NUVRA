import type { AggregatedEvidence, CoverageResult } from "./evidence-aggregator.ts";
import type { EvidenceFinding, SourceType } from "./source-analyzer.ts";
import type { BusinessProfile } from "./business-profile.ts";
import type { CommercialEvidence, CommercialJourneyStageId } from "./commercial-evidence.ts";

export const SCORE_METHODOLOGY_VERSION = "NUVRA_SCORE_V2" as const;
export type NuvraScoreStatus = "pending" | "preliminary" | "complete";

export interface ScoreContribution {
  id: string; groupId: string; label: string; direction: "positive" | "negative";
  impact: number; sourceQuality: number; evidenceSufficiency: number; corroboration: number;
  independence: number; recency: number; businessRelevance: number; goalRelevance: number;
  effectiveStrength: number; source: string; evidenceIds: string[];
}

export interface NuvraDimension {
  name: string; slug: string; points: number | null; performanceScore: number | null;
  evidenceConfidence: number; evidenceCeiling: number; applicable: boolean;
  businessRelevance: number; goalRelevance: number;
  evidenceSufficiency: "insufficient" | "limited" | "sufficient" | "strong";
  journeyStages: CommercialJourneyStageId[];
  confidence: "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE";
  sources: SourceType[]; findings: EvidenceFinding[]; message?: string;
  estimatedFromLimitedEvidence?: boolean;
  scoringSignals?: Array<{ label: string; effect: number; basis: "observed" | "declared" | "contextual" }>;
  contributions: ScoreContribution[];
}

export interface NuvraScoreResult {
  total: number | null; dimensions: NuvraDimension[];
  confidence: "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE";
  coverage: number; scoreStatus: NuvraScoreStatus; statusLabel: string;
  requiresMoreSources: boolean; reason: string; evaluatedAt: Date;
  scoreMethodologyVersion: typeof SCORE_METHODOLOGY_VERSION;
  methodology: {
    scoreMethodologyVersion: typeof SCORE_METHODOLOGY_VERSION; formula: string;
    evaluableDimensions: number; applicableDimensions: string[]; nonApplicableDimensions: string[];
    effectiveDimensionDiversity: number; objectiveRelevanceCovered: number;
    evidenceQuality: number; readiness: number;
    dimensionWeights: Record<string, { applicable: boolean; objectiveRelevance: number; businessRelevance: number; evidenceQuality: number; combinedWeight: number }>;
    totalContribution: Array<{ slug: string; points: number; weight: number; weightedPoints: number; ceiling: number; confidence: number }>;
  };
}

type DimensionSpec = { slug: string; name: string; stages: CommercialJourneyStageId[] };
const DIMENSIONS: DimensionSpec[] = [
  { slug: "presencia", name: "Qué tan fácil es encontrarte", stages: ["discovery"] },
  { slug: "conversion", name: "Qué tan fácil es consultar, reservar o comprar", stages: ["decision", "action"] },
  { slug: "posicionamiento", name: "Qué tanta confianza y diferenciación generás", stages: ["evaluation", "experience"] },
  { slug: "propuesta", name: "Qué tan claro queda lo que ofrecés", stages: ["evaluation", "decision"] },
  { slug: "redes", name: "Qué tan útiles están siendo tus redes", stages: ["discovery", "evaluation", "action"] },
  { slug: "adquisicion", name: "Qué capacidad tenés para atraer demanda", stages: ["discovery"] },
  { slug: "identidad", name: "Qué tan sólida y reconocible es tu marca", stages: ["evaluation"] },
  { slug: "retencion", name: "Qué hacés para que los clientes vuelvan", stages: ["experience", "retention"] },
];
const SOCIAL_SOURCES = new Set<SourceType>(["instagram", "x", "tiktok", "reddit", "facebook", "linkedin", "youtube"]);
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const round = (value: number) => Math.round(value * 100) / 100;

export class NuvraScoreCalculator {
  static calculate(aggregated: AggregatedEvidence, coverage: CoverageResult, context: { objective?: string; businessProfile?: BusinessProfile } = {}): NuvraScoreResult {
    const profile = context.businessProfile;
    const objective = context.objective || profile?.goal.text || "";
    const objectiveWeights = objectiveRelevance(objective, profile);
    const filtered = filterUnvalidatedProblems(aggregated.byDimension || {}, profile);
    const dimensions = DIMENSIONS.map((spec) => calculateDimension(spec, filtered[spec.slug] || [], aggregated, profile, objectiveWeights[spec.slug] ?? .5));
    const evaluable = dimensions.filter((dimension) => dimension.applicable && dimension.points !== null);
    const rawWeights = Object.fromEntries(dimensions.map((dimension) => [dimension.slug, dimension.applicable ? dimension.businessRelevance * (.3 + .7 * dimension.goalRelevance) : 0]));
    const evaluableWeight = evaluable.reduce((sum, dimension) => sum + rawWeights[dimension.slug], 0);
    const normalized = Object.fromEntries(dimensions.map((dimension) => [dimension.slug, evaluableWeight > 0 && dimension.points !== null ? rawWeights[dimension.slug] / evaluableWeight : 0]));
    const totalContribution = evaluable.map((dimension) => ({ slug: dimension.slug, points: dimension.points as number, weight: round(normalized[dimension.slug]), weightedPoints: round((dimension.points as number) * normalized[dimension.slug]), ceiling: dimension.evidenceCeiling, confidence: dimension.evidenceConfidence }));
    const total = totalContribution.length ? Math.round(totalContribution.reduce((sum, item) => sum + item.weightedPoints, 0)) : null;
    const shares = totalContribution.map((item) => item.weight).filter(Boolean);
    const diversity = shares.length ? 1 / shares.reduce((sum, value) => sum + value * value, 0) : 0;
    const objectiveRelevanceCovered = dimensions.reduce((sum, dimension) => sum + (dimension.points !== null ? normalized[dimension.slug] : 0), 0);
    const evidenceQuality = totalContribution.length ? totalContribution.reduce((sum, item) => sum + item.confidence * item.weight, 0) : 0;
    const readiness = clamp(objectiveRelevanceCovered * evidenceQuality * Math.min(1, diversity / 3));
    const dimensionWeights = Object.fromEntries(dimensions.map((dimension) => [dimension.slug, { applicable: dimension.applicable, objectiveRelevance: dimension.goalRelevance, businessRelevance: dimension.businessRelevance, evidenceQuality: dimension.evidenceConfidence, combinedWeight: round(normalized[dimension.slug]) }]));
    const confidence = confidenceLabel(evidenceQuality, evaluable.length);
    const complete = coverage.total >= 70 && evaluable.length >= 3 && readiness >= .45;
    const reason = complete ? "Diagnóstico sustentado por varias áreas aplicables y evidencia suficiente." : total === null ? "Todavía no hay señales de desempeño suficientes para calcular un puntaje defendible." : "Este resultado se calcula con la información disponible; nuevas fuentes pueden ajustar el puntaje y las recomendaciones.";
    return {
      total, dimensions, confidence, coverage: coverage.total,
      scoreStatus: complete ? "complete" : total === null ? "pending" : "preliminary",
      statusLabel: complete ? "COMPLETO" : total === null ? "PENDIENTE" : "PRELIMINAR",
      requiresMoreSources: !complete, reason, evaluatedAt: new Date(), scoreMethodologyVersion: SCORE_METHODOLOGY_VERSION,
      methodology: {
        scoreMethodologyVersion: SCORE_METHODOLOGY_VERSION,
        formula: "performance por balance de grupos independientes; score visible = min(performance, evidenceCeiling) para desempeño favorable; global ponderado solo por áreas aplicables, negocio y objetivo",
        evaluableDimensions: evaluable.length,
        applicableDimensions: dimensions.filter((dimension) => dimension.applicable).map((dimension) => dimension.slug),
        nonApplicableDimensions: dimensions.filter((dimension) => !dimension.applicable).map((dimension) => dimension.slug),
        effectiveDimensionDiversity: round(diversity), objectiveRelevanceCovered: round(objectiveRelevanceCovered),
        evidenceQuality: round(evidenceQuality), readiness: round(readiness), dimensionWeights, totalContribution,
      },
    };
  }
}

function calculateDimension(spec: DimensionSpec, rawFindings: EvidenceFinding[], aggregated: AggregatedEvidence, profile: BusinessProfile | undefined, goalRelevance: number): NuvraDimension {
  const applicable = isApplicable(spec.slug, rawFindings, profile, aggregated);
  const businessRelevance = profile?.areaRelevance[spec.slug]?.businessRelevance ?? defaultBusinessRelevance(spec.slug, profile);
  if (!applicable) return emptyDimension(spec, false, businessRelevance, goalRelevance, "Esta área no es relevante para el recorrido actual del negocio.");
  if (spec.slug === "identidad") {
    const identity = aggregated.multisourceBrandIdentity || (aggregated.sources.web?.data as any)?.brandIdentity;
    if (identity && typeof identity.performanceScore === "number") {
      const evidenceConfidence = clamp(Number(identity.evidenceConfidence || 0));
      const evidenceCeiling = clampScore(Number(identity.evidenceCeiling ?? ceilingFor("identidad", evidenceConfidence, Number(identity.coverage?.independentSourceCount || 1))));
      const performanceScore = clampScore(identity.performanceScore);
      const points = performanceScore >= 50 ? Math.min(performanceScore, evidenceCeiling) : performanceScore;
      const findings = deduplicate(rawFindings);
      return { ...baseDimension(spec, businessRelevance, goalRelevance), points, performanceScore, evidenceConfidence: round(evidenceConfidence), evidenceCeiling, applicable: true, evidenceSufficiency: sufficiencyLabel(evidenceConfidence), confidence: confidenceLabel(evidenceConfidence, findings.length || 1), sources: uniqueSources(findings).length ? uniqueSources(findings) : ["web"], findings, message: identity.limitations?.[0], contributions: [{ id: "identity:analysis", groupId: "identity:multisource", label: "Evaluación consolidada de identidad", direction: performanceScore >= 50 ? "positive" : "negative", impact: Math.abs(performanceScore - 50) / 50, sourceQuality: evidenceConfidence, evidenceSufficiency: evidenceConfidence, corroboration: Math.min(1, Number(identity.coverage?.independentSourceCount || 1) / 3), independence: 1, recency: .7, businessRelevance, goalRelevance, effectiveStrength: round(Math.abs(performanceScore - 50) / 50 * evidenceConfidence), source: "brand_identity_analyzer", evidenceIds: findings.map((finding) => finding.id) }] };
    }
  }
  const findings = rawFindings.filter((finding) => Boolean(finding?.id && finding.evidence));
  const evidenceByFinding = new Map((profile?.commercialEvidence || []).filter((item) => item.originalFindingId).map((item) => [item.originalFindingId as string, item]));
  const contributions = buildContributions(spec.slug, findings, evidenceByFinding, profile, businessRelevance, goalRelevance);
  if (!contributions.length) return emptyDimension(spec, true, businessRelevance, goalRelevance, "No hay señales de desempeño suficientes para evaluar esta área.", findings);
  const positives = contributions.filter((item) => item.direction === "positive").reduce((sum, item) => sum + item.effectiveStrength, 0);
  const negatives = contributions.filter((item) => item.direction === "negative").reduce((sum, item) => sum + item.effectiveStrength, 0);
  const performanceScore = clampScore(100 * positives / Math.max(positives + negatives, .0001));
  const origins = new Set(contributions.map((item) => item.groupId));
  const sources = new Set(findings.filter((item) => item.type !== "neutral").map((item) => item.source));
  const strengthTotal = contributions.reduce((sum, item) => sum + item.effectiveStrength, 0);
  const weightedQuality = contributions.reduce((sum, item) => sum + item.sourceQuality * item.effectiveStrength, 0) / Math.max(strengthTotal, .01);
  const averageSufficiency = contributions.reduce((sum, item) => sum + item.evidenceSufficiency, 0) / contributions.length;
  const diversity = Math.min(1, sources.size / sourceTarget(spec.slug));
  const depth = Math.min(1, origins.size / originTarget(spec.slug));
  const corroboration = contributions.reduce((sum, item) => sum + item.corroboration, 0) / contributions.length;
  const evidenceConfidence = clamp(weightedQuality * .34 + averageSufficiency * .28 + diversity * .16 + depth * .12 + corroboration * .1);
  const evidenceCeiling = ceilingFor(spec.slug, evidenceConfidence, sources.size, hasValidatedJourney(contributions, profile), origins.size);
  const points = performanceScore >= 50 ? Math.min(performanceScore, evidenceCeiling) : performanceScore;
  return { ...baseDimension(spec, businessRelevance, goalRelevance), points, performanceScore, evidenceConfidence: round(evidenceConfidence), evidenceCeiling, applicable: true, evidenceSufficiency: sufficiencyLabel(evidenceConfidence), confidence: confidenceLabel(evidenceConfidence, contributions.length), sources: uniqueSources(findings), findings, estimatedFromLimitedEvidence: evidenceConfidence < .6, message: evidenceConfidence < .55 ? "Este resultado se calcula con evidencia limitada y puede ajustarse al incorporar más información." : undefined, scoringSignals: contributions.map((item) => ({ label: item.label, effect: Math.round((item.direction === "positive" ? 1 : -1) * item.effectiveStrength * 20), basis: "observed" as const })), contributions };
}

function buildContributions(slug: string, findings: EvidenceFinding[], evidenceByFinding: Map<string, CommercialEvidence>, profile: BusinessProfile | undefined, businessRelevance: number, goalRelevance: number): ScoreContribution[] {
  const grouped = new Map<string, ScoreContribution>();
  for (const finding of findings) {
    if (finding.type === "neutral") continue;
    const evidence = evidenceByFinding.get(finding.id);
    const problem = profile?.problemCandidates.find((candidate) => candidate.evidenceFor.includes(evidence?.id || ""));
    if (finding.type === "negative" && profile && problem?.validationStatus !== "validated") continue;
    const strength = profile?.strengthCandidates.find((candidate) => candidate.evidence.includes(evidence?.id || ""));
    const groupId = problem?.id || strength?.id || evidence?.corroboration?.claimKey || evidence?.lineage?.originId || semanticGroup(slug, finding);
    const impact = finding.impact === "high" ? 1 : finding.impact === "medium" ? .66 : .38;
    const sourceQuality = evidence?.sourceQuality?.score ?? (finding.confidence === "ALTA" ? .8 : finding.confidence === "MEDIA" ? .62 : .42);
    const evidenceSufficiency = problem?.evidenceSufficiency.score ?? strength?.evidenceSufficiency.score ?? evidence?.corroboration?.strength ?? .42;
    const corroboration = evidence?.corroboration?.strength ?? .35;
    const independence = evidence?.lineage?.independence ?? 1;
    const recency = evidence?.sourceQuality?.recency ?? .6;
    const effectiveStrength = impact * (.38 + .62 * sourceQuality) * (.45 + .55 * evidenceSufficiency) * (.62 + .38 * corroboration) * independence * (.55 + .45 * recency) * (.55 + .45 * businessRelevance);
    const contribution: ScoreContribution = { id: `contribution:${finding.id}`, groupId, label: finding.evidence, direction: finding.type, impact, sourceQuality: round(sourceQuality), evidenceSufficiency: round(evidenceSufficiency), corroboration: round(corroboration), independence: round(independence), recency: round(recency), businessRelevance: round(businessRelevance), goalRelevance: round(goalRelevance), effectiveStrength: round(effectiveStrength), source: finding.source, evidenceIds: [finding.id] };
    const key = `${groupId}:${finding.type}`;
    const current = grouped.get(key);
    if (!current) grouped.set(key, contribution);
    else if (contribution.effectiveStrength > current.effectiveStrength) grouped.set(key, { ...contribution, evidenceIds: Array.from(new Set([...current.evidenceIds, finding.id])), corroboration: contribution.source !== current.source ? Math.max(contribution.corroboration, Math.min(1, current.corroboration + .12)) : Math.max(contribution.corroboration, current.corroboration) });
    else { current.evidenceIds.push(finding.id); if (contribution.source !== current.source) current.corroboration = Math.max(current.corroboration, Math.min(1, current.corroboration + .12)); }
  }
  return Array.from(grouped.values());
}

function filterUnvalidatedProblems(byDimension: Record<string, EvidenceFinding[]>, profile?: BusinessProfile) {
  if (!profile) return byDimension;
  const rejectedCommercialIds = new Set(profile.problemCandidates.filter((candidate) => candidate.validationStatus !== "validated").flatMap((candidate) => candidate.evidenceFor));
  const rejectedFindingIds = new Set(profile.commercialEvidence.filter((item) => rejectedCommercialIds.has(item.id)).map((item) => item.originalFindingId).filter((id): id is string => Boolean(id)));
  return Object.fromEntries(Object.entries(byDimension).map(([slug, findings]) => [slug, findings.filter((finding) => finding.type !== "negative" || !rejectedFindingIds.has(finding.id))]));
}

function isApplicable(slug: string, findings: EvidenceFinding[], profile: BusinessProfile | undefined, aggregated: AggregatedEvidence) {
  if (findings.length) return true;
  if (!profile) return false;
  if (slug === "redes") return profile.activeChannels.some((source) => SOCIAL_SOURCES.has(source)) || profile.channelDeclarations.instagram === "present";
  if (slug === "retencion") return /volver|recompra|renov|fidel|clientes actuales/i.test(profile.goal.text) || ["frequent", "periodic", "membership"].includes(profile.recurrence);
  if (slug === "identidad") return Boolean(aggregated.multisourceBrandIdentity || (aggregated.sources.web?.data as any)?.brandIdentity || profile.activeChannels.some((source) => source === "web" || SOCIAL_SOURCES.has(source)));
  return true;
}

function objectiveRelevance(objective: string, profile?: BusinessProfile): Record<string, number> {
  if (profile) return Object.fromEntries(DIMENSIONS.map((item) => [item.slug, clamp(profile.areaRelevance[item.slug]?.goalRelevance ?? .4)]));
  const text = objective.toLowerCase();
  const values: Record<string, number> = { presencia: .55, conversion: .6, posicionamiento: .55, propuesta: .6, redes: .35, adquisicion: .6, identidad: .35, retencion: .25 };
  if (/volver|recompra|renov|fidel|clientes actuales/.test(text)) Object.assign(values, { retencion: 1, conversion: .35, adquisicion: .2, redes: .3 });
  else if (/marca|reconoc|posicion|autoridad|dar a conocer/.test(text)) Object.assign(values, { presencia: .9, identidad: 1, posicionamiento: .9, propuesta: .75, redes: .7, conversion: .35 });
  else if (/consult|reserv|turno|venta|compr|pedido|reunion|presupuesto/.test(text)) Object.assign(values, { conversion: 1, propuesta: .75, adquisicion: .85, presencia: .65, posicionamiento: .65, retencion: .2 });
  return values;
}

function defaultBusinessRelevance(slug: string, profile?: BusinessProfile) {
  if (!profile) return .7;
  if (slug === "presencia") return profile.localDependency === "high" ? .95 : .72;
  if (slug === "conversion") return .95;
  if (slug === "posicionamiento") return profile.commercialModel === "professional" || profile.commercialModel === "appointments" ? .95 : .72;
  if (slug === "propuesta") return .85;
  if (slug === "redes") return profile.primaryChannel && SOCIAL_SOURCES.has(profile.primaryChannel) ? .9 : .45;
  if (slug === "adquisicion") return .8;
  if (slug === "identidad") return profile.commercialModel === "commerce" ? .75 : .55;
  if (slug === "retencion") return ["frequent", "periodic", "membership"].includes(profile.recurrence) ? .9 : .4;
  return .6;
}

function ceilingFor(slug: string, confidence: number, sourceCount: number, directJourney = false, independentGroups = 1) {
  const thresholds = slug === "identidad" ? [56, 64, 72, 80, 89, 100] : slug === "redes" ? [54, 62, 70, 78, 88, 96] : slug === "posicionamiento" || slug === "retencion" ? [55, 63, 72, 81, 90, 98] : [57, 65, 74, 83, 92, 100];
  const index = confidence < .25 ? 0 : confidence < .4 ? 1 : confidence < .55 ? 2 : confidence < .7 ? 3 : confidence < .85 ? 4 : 5;
  let ceiling = thresholds[index];
  if (sourceCount <= 1 && !directJourney) ceiling = Math.min(ceiling, slug === "conversion" ? (independentGroups >= 2 ? 83 : 80) : slug === "propuesta" ? (independentGroups >= 2 ? 81 : 78) : independentGroups >= 2 ? 78 : 74);
  if (directJourney && slug === "conversion") ceiling = Math.max(ceiling, 84);
  return ceiling;
}

function hasValidatedJourney(contributions: ScoreContribution[], profile?: BusinessProfile) {
  if (!profile) return false;
  const ids = new Set(contributions.flatMap((item) => item.evidenceIds));
  return profile.commercialEvidence.some((item) => item.originalFindingId && ids.has(item.originalFindingId) && /recorrido .*comprob|cargada correctamente|paso .* claro/i.test(item.text));
}

function semanticGroup(slug: string, finding: EvidenceFinding) {
  const text = finding.evidence.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const patterns: Array<[string, RegExp]> = [["decision_information", /envio|entrega|precio|pago|horario|ubicacion|condicion|disponibilidad/], ["action_path", /cta|boton|contact|consulta|turno|reserv|whatsapp|formulario|comprar|checkout|carrito/], ["delay", /demora|tarda|lent|respuesta/], ["trust", /confianza|resena|testimonio|caso|garantia/], ["offer", /propuesta|servicio|producto|especializ|titulo principal/], ["search", /google|busqueda|index|seo|directorio/], ["identity", /logo|color|tipograf|fotograf|identidad|visual/]];
  return `${slug}:${patterns.find(([, pattern]) => pattern.test(text))?.[0] || text.replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((token) => token.length > 5).slice(0, 3).join("_") || finding.id}`;
}

function deduplicate(findings: EvidenceFinding[]) {
  const groups = new Map<string, EvidenceFinding>();
  const rank = { low: 1, medium: 2, high: 3 } as const;
  for (const finding of findings) {
    const key = `${finding.type}:${semanticGroup(finding.category, finding)}`;
    const current = groups.get(key);
    if (!current || rank[finding.impact] > rank[current.impact]) groups.set(key, finding);
  }
  return Array.from(groups.values());
}

function baseDimension(spec: DimensionSpec, businessRelevance: number, goalRelevance: number) { return { name: spec.name, slug: spec.slug, businessRelevance: round(businessRelevance), goalRelevance: round(goalRelevance), journeyStages: spec.stages }; }
function emptyDimension(spec: DimensionSpec, applicable: boolean, businessRelevance: number, goalRelevance: number, message: string, findings: EvidenceFinding[] = []): NuvraDimension { return { ...baseDimension(spec, businessRelevance, goalRelevance), points: null, performanceScore: null, evidenceConfidence: 0, evidenceCeiling: 0, applicable, evidenceSufficiency: "insufficient", confidence: "INSUFICIENTE", sources: uniqueSources(findings), findings, message, estimatedFromLimitedEvidence: true, scoringSignals: [], contributions: [] }; }
function uniqueSources(findings: EvidenceFinding[]) { return Array.from(new Set(findings.map((finding) => finding.source))); }
function clampScore(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }
function sourceTarget(slug: string) { return ["identidad", "posicionamiento", "redes", "retencion"].includes(slug) ? 3 : 2; }
function originTarget(slug: string) { return ["posicionamiento", "retencion"].includes(slug) ? 5 : 3; }
function sufficiencyLabel(value: number): NuvraDimension["evidenceSufficiency"] { return value >= .82 ? "strong" : value >= .62 ? "sufficient" : value >= .38 ? "limited" : "insufficient"; }
function confidenceLabel(value: number, count: number): NuvraDimension["confidence"] { if (!count || value < .22) return "INSUFICIENTE"; if (value >= .78) return "ALTA"; if (value >= .5) return "MEDIA"; return "BAJA"; }
