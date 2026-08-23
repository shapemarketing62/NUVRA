import type { NuvraScoreResult } from "../scoring/nuvra-score";
import type { RawFinding } from "../website-analyzer/types";
import { createAIService, diagnosisSchema, type DiagnosisOutput } from "../ai/ai-service.ts";
import type { BusinessProfile } from "../intelligence/business-profile";
import type { ProblemCandidate, StrengthCandidate } from "../intelligence/commercial-candidates.ts";

export interface BusinessContext {
  nombre: string;
  rubro: string;
  objetivo: string;
  plazoDias: number;
  plazoLabel: string;
  descripcion?: string | null;
  publicoObjetivo?: string | null;
  businessProfile?: BusinessProfile;
}

export interface DiagnosisResult extends Omit<DiagnosisOutput, "opportunities" | "risks"> {
  engineType: "deterministic" | "ai";
  opportunities: string[];
  risks: string[];
}

const sourceLabel = (source: string) => ({ web: "el sitio web", instagram: "Instagram", search: "Google", reviews: "las reseñas", competitor: "los negocios similares", external_mentions: "las menciones externas", other: "la información aportada" }[source] || "la evidencia encontrada");
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
export async function runDiagnosticEngine(business: BusinessContext, scoreResult: NuvraScoreResult, findings: RawFinding[], businessProfile?: BusinessProfile): Promise<DiagnosisResult> {
  const profile = businessProfile || business.businessProfile;
  // Cuando existe el mapa comercial, la decisión debe ser causal y trazable.
  // La IA queda reservada al fallback legacy para no saltarse ProblemCandidates.
  if (profile) return buildProfileDiagnosis(business, scoreResult, profile);
  const ai = createAIService();
  if (ai.isAvailable()) {
    const aiResult = await ai.completeStructured(buildAIPrompt(business, scoreResult, findings, profile), diagnosisSchema);
    if (aiResult) return { ...aiResult, engineType: "ai" };
  }
  return buildLegacyFallback(business, scoreResult, findings);
}

export function buildProfileDiagnosis(business: BusinessContext, scoreResult: NuvraScoreResult, profile: BusinessProfile): DiagnosisResult {
  const problems = [...profile.problemCandidates].sort((a, b) => b.priorityScore - a.priorityScore);
  const strengthsFound = [...profile.strengthCandidates].sort((a, b) => b.priorityScore - a.priorityScore);
  const primary = problems[0];
  const primaryStrength = strengthsFound[0];
  const score = scoreResult.total ?? 40;
  const mainTitle = primary ? primary.hypothesis : primaryStrength ? `La base comercial más aprovechable está en ${stageLabel(primaryStrength.journeyStage).toLowerCase()}` : "Todavía no encontramos un obstáculo comprobable";
  const mainExplanation = primary ? candidateExplanation(profile, primary) : primaryStrength ? `${primaryStrength.statement} Conviene usar esa base para avanzar hacia ${profile.goal.text.toLowerCase()}.` : "El puntaje se muestra con la información disponible, pero todavía no hay una señal concreta que justifique señalar un problema principal.";
  const strengths = strengthsFound.slice(0, 4).map((candidate) => ({ title: candidate.statement, evidence: evidenceText(profile, candidate.evidence) }));
  const weaknesses = problems.slice(0, 5).map((candidate) => ({ title: candidate.hypothesis, evidence: candidateExplanation(profile, candidate), findingId: candidate.evidenceFor[0] }));
  const opportunities = buildProfileOpportunities(profile, problems, strengthsFound);
  const priorities = problems.slice(0, 3).map((candidate, index) => ({ title: candidate.hypothesis, reason: candidateExplanation(profile, candidate), order: index + 1 }));
  const risks = buildProfileRisks(profile, problems);
  const summaryEvidence = primary ? `El freno más probable está en ${stageLabel(primary.journeyStage).toLowerCase()}: ${primary.hypothesis}` : primaryStrength ? `La señal más firme es: ${primaryStrength.statement}` : "Todavía hay poca evidencia concreta para señalar un único freno.";
  return {
    engineType: "deterministic",
    summary: `${business.nombre} obtiene un Nuvra Score de ${score}/100 para su objetivo de ${business.objetivo.toLowerCase()}. ${summaryEvidence}`,
    bottleneck: { dimension: primary?.journeyStage || "estado actual", title: mainTitle, explanation: mainExplanation, findingId: primary?.evidenceFor[0] },
    strengths,
    weaknesses,
    opportunities,
    risks,
    priorities,
  };
}

function stageLabel(stage: string) {
  return profileStageLabels[stage] || "el recorrido comercial";
}

const profileStageLabels: Record<string, string> = { discovery: "Descubrimiento", evaluation: "Evaluación", decision: "Decisión", action: "Acción comercial", experience: "Experiencia", retention: "Recompra o continuidad" };

function evidenceText(profile: BusinessProfile, evidenceIds: string[]): string {
  return evidenceIds.map((id) => profile.commercialEvidence.find((item) => item.id === id)?.text).filter(Boolean).join(" · ");
}

function candidateExplanation(profile: BusinessProfile, candidate: ProblemCandidate): string {
  const supporting = evidenceText(profile, candidate.evidenceFor);
  const contradiction = evidenceText(profile, candidate.evidenceAgainst);
  return `${candidate.causalExplanation} Evidencia: ${supporting}.${contradiction ? ` También se consideró evidencia favorable que limita la hipótesis: ${contradiction}.` : ""} Esto importa para “${profile.goal.text}” porque ocurre en ${stageLabel(candidate.journeyStage).toLowerCase()}, antes de que la persona pueda ${profile.primaryCustomerAction}.`;
}

function buildProfileOpportunities(profile: BusinessProfile, problems: ProblemCandidate[], strengths: StrengthCandidate[]): string[] {
  const opportunities: string[] = [];
  for (const problem of problems.slice(0, 2)) opportunities.push(`Destrabar ${stageLabel(problem.journeyStage).toLowerCase()} para que más personas puedan ${profile.primaryCustomerAction}: ${problem.hypothesis}`);
  const strength = strengths[0];
  if (strength) opportunities.push(`Aprovechar esta fortaleza antes de ${profile.primaryCustomerAction}: ${strength.statement}`);
  const declared = profile.declaredSignals[0];
  if (declared && !opportunities.some((item) => item.includes(declared.evidence))) opportunities.push(`Usar este dato aportado por el negocio para decidir el próximo paso: ${declared.evidence}`);
  return opportunities.slice(0, 3);
}

function buildProfileRisks(profile: BusinessProfile, problems: ProblemCandidate[]): string[] {
  const risks: string[] = [];
  const capacity = profile.declaredSignals.find((signal) => signal.type === "capacity");
  if (capacity) risks.push(`No conviene generar más demanda sin considerar este límite informado: ${capacity.evidence}`);
  const urgent = problems.find((problem) => problem.severity === "high");
  if (urgent) risks.push(`Si no se resuelve la fricción en ${stageLabel(urgent.journeyStage).toLowerCase()}, el objetivo puede seguir frenado: ${urgent.hypothesis}`);
  return risks.slice(0, 3);
}

function buildLegacyFallback(business: BusinessContext, scoreResult: NuvraScoreResult, findings: RawFinding[]): DiagnosisResult {
  const problem = findings.find((finding) => finding.type === "problem");
  const score = scoreResult.total ?? 40;
  return {
    engineType: "deterministic",
    summary: `${business.nombre} obtiene un Nuvra Score de ${score}/100 con la información disponible.`,
    bottleneck: { dimension: problem?.category || "estado actual", title: problem?.title || "Hace falta observar un poco más", explanation: problem?.evidence || "Todavía no hay una señal concreta suficiente para elegir un único problema." },
    strengths: [],
    weaknesses: problem ? [{ title: problem.title, evidence: problem.evidence }] : [],
    opportunities: problem ? [`Resolver lo observado para avanzar hacia ${business.objetivo.toLowerCase()}: ${problem.evidence}`] : [],
    risks: [],
    priorities: problem ? [{ title: problem.title, reason: problem.evidence, order: 1 }] : [],
  };
}

function buildAIPrompt(business: BusinessContext, score: NuvraScoreResult, findings: RawFinding[], profile?: BusinessProfile): string {
  return JSON.stringify({ instruction: "Generá un diagnóstico específico y sencillo basado SOLO en las evidencias. Cada problema debe indicar evidencia, fuente, interpretación y relación con el objetivo. No inventes datos ni uses términos técnicos de marketing.", business: { nombre: business.nombre, rubro: business.rubro, objetivo: business.objetivo, plazo: business.plazoLabel }, businessProfile: profile, nuvraScore: score.total, scoresByArea: score.dimensions.map((dimension) => ({ area: dimension.slug, points: dimension.points, weight: dimension.weight })), findings: findings.map((finding) => ({ title: finding.title, evidence: finding.evidence, source: finding.source, category: finding.category, severity: finding.severity })) });
}
