import type { BusinessProfile } from "./business-profile.ts";
import type { CommercialEvidence, CommercialJourneyStageId, CommercialProcessingIssue } from "./commercial-evidence.ts";
import type { CommercialJourney } from "./commercial-journey-engine.ts";
import { HypothesisValidationEngine, type HypothesisValidationStatus } from "./hypothesis-validation-engine.ts";
import { calculateEvidenceSufficiency, type EvidenceSufficiencyResult } from "./evidence/evidence-sufficiency.ts";

export type CommercialProblemPattern = "visibility" | "offer_clarity" | "trust" | "decision_information" | "action_path" | "experience" | "retention" | "demand_pattern" | "other";

export interface ProblemCandidate {
  id: string;
  pattern: CommercialProblemPattern;
  hypothesis: string;
  journeyStage: CommercialJourneyStageId;
  evidenceFor: string[];
  evidenceAgainst: string[];
  frequency: number;
  goalImpact: number;
  commercialRelevance: number;
  severity: "high" | "medium" | "low";
  confidence: "ALTA" | "MEDIA" | "BAJA";
  solvability: number;
  dependencies: string[];
  scope: "single_touchpoint" | "multi_channel" | "business_wide";
  priorityScore: number;
  causalExplanation: string;
  evidenceStrength: number;
  contradictionStrength: number;
  supportingIndependentSignals: number;
  contradictingIndependentSignals: number;
  supportingSourceCount: number;
  contradictingSourceCount: number;
  validationStatus: HypothesisValidationStatus;
  validationReason: string;
  reputationEvidenceConfidence?: number;
  evidenceSufficiency: EvidenceSufficiencyResult;
  conclusionConfidence: number;
}

export interface StrengthCandidate {
  id: string;
  pattern: CommercialProblemPattern;
  statement: string;
  journeyStage: CommercialJourneyStageId;
  evidence: string[];
  frequency: number;
  commercialImpact: number;
  confidence: "ALTA" | "MEDIA" | "BAJA";
  exploitability: number;
  priorityScore: number;
  evidenceSufficiency: EvidenceSufficiencyResult;
  conclusionConfidence: number;
}

const normalize = (value: unknown) => String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function patternFor(evidence: CommercialEvidence): CommercialProblemPattern {
  const text = normalize(evidence.text);
  if (/lunes|martes|miercoles|jueves|viernes|pocas reservas|temporada|demanda/.test(text)) return "demand_pattern";
  if (evidence.journeyStage === "discovery") return "visibility";
  if (evidence.journeyStage === "action") return "action_path";
  if (evidence.journeyStage === "experience") return "experience";
  if (evidence.journeyStage === "retention") return "retention";
  if (/resena|opinion|testimonio|confianza|caso|garantia|profesional/.test(text)) return "trust";
  if (/precio|pago|envio|horario|ubicacion|direccion|disponibilidad|cuota/.test(text) || evidence.journeyStage === "decision") return "decision_information";
  if (/producto|servicio|tratamiento|especializ|propuesta|bio|que ofrece|mensaje/.test(text)) return "offer_clarity";
  return "other";
}

function stageImportance(journey: CommercialJourney, stage: CommercialJourneyStageId) {
  return journey.stages.find((item) => item.id === stage)?.importanceForGoal || .5;
}

function confidenceOf(items: CommercialEvidence[]): "ALTA" | "MEDIA" | "BAJA" {
  const points = items.reduce((sum, item) => sum + (item.confidence === "ALTA" ? 1 : item.confidence === "MEDIA" ? .7 : .4), 0) / Math.max(items.length, 1);
  return points >= .85 ? "ALTA" : points >= .58 ? "MEDIA" : "BAJA";
}

function hypothesis(pattern: CommercialProblemPattern, profile: BusinessProfile): string {
  if (pattern === "visibility") return `El negocio puede estar perdiendo oportunidades antes de ser considerado porque cuesta encontrarlo en los canales relevantes.`;
  if (pattern === "offer_clarity") return `Las personas pueden encontrar el negocio, pero no reunir suficiente claridad sobre qué ofrece y por qué les conviene elegirlo.`;
  if (pattern === "trust") return `La evaluación puede frenarse porque faltan pruebas suficientes para reducir dudas antes de ${profile.primaryCustomerAction}.`;
  if (pattern === "decision_information") return `El interés puede frenarse antes de la decisión porque falta información práctica necesaria para ${profile.primaryCustomerAction}.`;
  if (pattern === "action_path") return `El principal freno parece estar entre el interés y la acción: cuesta pasar desde la información disponible hasta ${profile.primaryCustomerAction}.`;
  if (pattern === "experience") return `La experiencia posterior a la acción puede estar reduciendo el resultado comercial o generando pérdida de clientes.`;
  if (pattern === "retention") return `El negocio puede estar perdiendo continuidad porque no aparece un próximo paso claro para volver o mantener la relación.`;
  if (pattern === "demand_pattern") return `La demanda no está distribuida de manera útil para el negocio y existen momentos concretos que necesitan una intervención propia.`;
  return `Existe una fricción observada que puede dificultar que una persona avance hacia ${profile.primaryCustomerAction}.`;
}

function solvabilityFor(pattern: CommercialProblemPattern, profile: BusinessProfile): number {
  const base = ["action_path", "offer_clarity", "decision_information", "retention", "demand_pattern"].includes(pattern) ? .9 : pattern === "visibility" ? .7 : .65;
  const constrained = /lo hago yo|2.?3|poco|sin equipo/i.test(profile.resources.executionCapacity || "") || (profile.resources.monthlyBudget !== null && profile.resources.monthlyBudget <= 100);
  return constrained ? Math.max(.45, base - .12) : base;
}

function sourceScope(items: CommercialEvidence[]): ProblemCandidate["scope"] {
  const sources = new Set(items.map((item) => item.source));
  return sources.size >= 3 ? "business_wide" : sources.size === 2 ? "multi_channel" : "single_touchpoint";
}

export function buildProblemCandidates(profile: BusinessProfile, journey: CommercialJourney, evidence: CommercialEvidence[], issues: CommercialProcessingIssue[] = []): ProblemCandidate[] {
  const safeEvidence = Array.isArray(evidence) ? evidence : [];
  const negatives = safeEvidence.filter((item) => item?.polarity === "negative" && item.id && item.journeyStage);
  // Una declaración del onboarding orienta la estrategia, pero no alcanza por sí
  // sola para presentar una fortaleza como si NUVRA la hubiera comprobado.
  const positives = safeEvidence.filter(
    (item) => item?.polarity === "positive" && item.kind === "ObservedEvidence",
  );
  const groups = new Map<string, CommercialEvidence[]>();
  for (const item of negatives) {
    const pattern = patternFor(item);
    const key = `${item.journeyStage}:${pattern}`;
    (groups.get(key) || groups.set(key, []).get(key)!).push(item);
  }
  const candidates: ProblemCandidate[] = [];
  for (const items of Array.from(groups.values())) {
    try {
      const first = items[0];
      if (!first) continue;
      const pattern = patternFor(first);
      const stage = first.journeyStage;
      const against = positives.filter((item) => item.journeyStage === stage && patternFor(item) === pattern);
      const goalImpact = stageImportance(journey, stage);
      const retentionGoal = /volv|vuelv|recompra|renov|recurren|fideliza|clientes actuales|socios actuales/i.test(String(profile.goal?.text || ""));
      const commercialRelevance = retentionGoal
        ? stage === "retention" ? 1 : stage === "experience" ? .9 : .25
        : stage === "action" ? 1 : stage === "decision" || stage === "evaluation" ? .85 : .7;
      const solvability = solvabilityFor(pattern, profile);
      const frequency = items.length;
      const frequencyFactor = Math.min(1, .55 + frequency * .15);
      const causal = hypothesis(pattern, profile);
      const validation = HypothesisValidationEngine.validate({ pattern, journeyStage: stage }, items, against);
      const evidenceSufficiency = calculateEvidenceSufficiency(items, against, goalImpact);
      const reputationValues = items.map((item) => item.reputationEvidenceConfidence).filter((value): value is number => typeof value === "number");
      const reputationEvidenceConfidence = reputationValues.length ? reputationValues.reduce((sum, value) => sum + value, 0) / reputationValues.length : undefined;
      const lacksSufficiency = !["sufficient", "strong"].includes(evidenceSufficiency.status);
      const validationStatus = (reputationEvidenceConfidence !== undefined && reputationEvidenceConfidence < .55 || lacksSufficiency) && validation.status === "validated" ? "partially_validated" : validation.status;
      const validationFactor = validationStatus === "validated" ? 1 : validationStatus === "partially_validated" ? .35 : 0;
      const conclusionConfidence = Math.min(1, evidenceSufficiency.score * .55 + validation.evidenceStrength * .25 + goalImpact * .12 + (1 - validation.contradictionStrength) * .08);
      const priorityScore = Math.round(validation.evidenceStrength * goalImpact * commercialRelevance * frequencyFactor * solvability * (1 - validation.contradictionStrength) * validationFactor * (.45 + evidenceSufficiency.score * .55) * 100);
      candidates.push({
        id: `problem:${stage}:${pattern}`,
        pattern,
        hypothesis: causal,
        journeyStage: stage,
        evidenceFor: items.map((item) => item.id),
        evidenceAgainst: against.map((item) => item.id),
        frequency,
        goalImpact,
        commercialRelevance,
        severity: items.some((item) => item.possibleImpact === "high") ? "high" : items.some((item) => item.possibleImpact === "medium") ? "medium" : "low",
        confidence: confidenceOf(items),
        solvability,
        dependencies: stage === "action" ? ["La oferta y la información de decisión deben ser suficientemente claras."] : stage === "retention" ? ["La experiencia anterior debe justificar una nueva relación."] : [],
        scope: sourceScope(items),
        priorityScore,
        causalExplanation: `${causal} La hipótesis se apoya en ${items.length} señal(es) y considera ${against.length} señal(es) que podrían contradecirla.`,
        evidenceStrength: validation.evidenceStrength,
        contradictionStrength: validation.contradictionStrength,
        supportingIndependentSignals: validation.supportingIndependentSignals,
        contradictingIndependentSignals: validation.contradictingIndependentSignals,
        supportingSourceCount: validation.supportingSourceCount,
        contradictingSourceCount: validation.contradictingSourceCount,
        validationStatus,
        validationReason: validationStatus !== validation.status ? evidenceSufficiency.reasons.join(" ") : validation.reason,
        reputationEvidenceConfidence,
        evidenceSufficiency,
        conclusionConfidence: Math.round(conclusionConfidence * 100) / 100,
      });
    } catch (error) {
      issues.push({ stage: "problem_candidates", itemId: items[0]?.id, errorType: error instanceof Error ? error.name : "CandidateError", message: error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180) });
    }
  }
  return candidates.sort((a, b) => b.priorityScore - a.priorityScore);
}

function strengthStatement(pattern: CommercialProblemPattern, profile: BusinessProfile): string {
  if (pattern === "visibility") return "El negocio ya logra aparecer en canales donde puede ser descubierto.";
  if (pattern === "trust") return `Existen pruebas públicas que ayudan a reducir dudas antes de ${profile.primaryCustomerAction}.`;
  if (pattern === "action_path") return `El paso para ${profile.primaryCustomerAction} aparece de forma clara en la evidencia observada.`;
  if (pattern === "offer_clarity") return "La oferta se entiende con suficiente claridad en las fuentes observadas.";
  if (pattern === "decision_information") return "La información práctica observada ayuda a tomar una decisión sin sorpresas importantes.";
  if (pattern === "experience") return "La experiencia observada aporta señales favorables que pueden sostener la elección.";
  if (pattern === "retention") return "Existe una base observable para promover continuidad o recompra.";
  return "Existe una señal favorable y utilizable en el recorrido comercial.";
}

export function buildStrengthCandidates(profile: BusinessProfile, journey: CommercialJourney, evidence: CommercialEvidence[], issues: CommercialProcessingIssue[] = []): StrengthCandidate[] {
  const positives = (Array.isArray(evidence) ? evidence : []).filter(
    (item) => item?.polarity === "positive" && item.kind === "ObservedEvidence" && item.id && item.journeyStage,
  );
  const groups = new Map<string, CommercialEvidence[]>();
  for (const item of positives) {
    const pattern = patternFor(item);
    const key = `${item.journeyStage}:${pattern}`;
    (groups.get(key) || groups.set(key, []).get(key)!).push(item);
  }
  const candidates: StrengthCandidate[] = [];
  for (const items of Array.from(groups.values())) {
    try {
      const first = items[0];
      if (!first) continue;
      const pattern = patternFor(first);
      const stage = first.journeyStage;
      const impact = stageImportance(journey, stage);
      const exploitability = ["trust", "visibility", "offer_clarity"].includes(pattern) ? .9 : .75;
      const frequency = items.length;
      const evidenceSufficiency = calculateEvidenceSufficiency(items, [], impact);
      const conclusionConfidence = Math.min(1, evidenceSufficiency.score * .72 + impact * .18 + exploitability * .1);
      const candidate = { id: `strength:${stage}:${pattern}`, pattern, statement: strengthStatement(pattern, profile), journeyStage: stage, evidence: items.map((item) => item.id), frequency, commercialImpact: impact, confidence: confidenceOf(items), exploitability, priorityScore: Math.round(Math.min(1, .4 + frequency * .12) * impact * exploitability * (.45 + evidenceSufficiency.score * .55) * 100), evidenceSufficiency, conclusionConfidence: Math.round(conclusionConfidence * 100) / 100 } satisfies StrengthCandidate;
      if (candidate.priorityScore >= 25) candidates.push(candidate);
    } catch (error) {
      issues.push({ stage: "strength_candidates", itemId: items[0]?.id, errorType: error instanceof Error ? error.name : "CandidateError", message: error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180) });
    }
  }
  return candidates.sort((a, b) => b.priorityScore - a.priorityScore);
}
