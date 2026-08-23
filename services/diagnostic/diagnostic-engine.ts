import type { NuvraScoreResult } from "../scoring/nuvra-score";
import type { RawFinding } from "../website-analyzer/types";
import { createAIService, diagnosisSchema, type DiagnosisOutput } from "../ai/ai-service.ts";
import type { BusinessProfile, ContextualFinding } from "../intelligence/business-profile";

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
const rankProblems = (profile: BusinessProfile) => [...profile.problems].sort((a, b) => b.priorityScore - a.priorityScore);
const rankStrengths = (profile: BusinessProfile) => [...profile.strengths].sort((a, b) => b.priorityScore - a.priorityScore);

export async function runDiagnosticEngine(business: BusinessContext, scoreResult: NuvraScoreResult, findings: RawFinding[], businessProfile?: BusinessProfile): Promise<DiagnosisResult> {
  const profile = businessProfile || business.businessProfile;
  const ai = createAIService();
  if (ai.isAvailable()) {
    const aiResult = await ai.completeStructured(buildAIPrompt(business, scoreResult, findings, profile), diagnosisSchema);
    if (aiResult) return { ...aiResult, engineType: "ai" };
  }
  return profile ? buildProfileDiagnosis(business, scoreResult, profile) : buildLegacyFallback(business, scoreResult, findings);
}

export function buildProfileDiagnosis(business: BusinessContext, scoreResult: NuvraScoreResult, profile: BusinessProfile): DiagnosisResult {
  const problems = rankProblems(profile);
  const strengthsFound = rankStrengths(profile);
  const primary = problems[0];
  const primaryStrength = strengthsFound[0];
  const score = scoreResult.total ?? 40;
  const mainTitle = primary ? `${capitalize(sourceLabel(primary.source))}: ${primary.evidence}` : primaryStrength ? `La evidencia más clara hoy es favorable: ${primaryStrength.evidence}` : "Todavía no encontramos un obstáculo comprobable";
  const mainExplanation = primary ? `${primary.interpretation} ${primary.goalRelation}` : primaryStrength ? `${primaryStrength.interpretation} Conviene usar esa base para avanzar hacia ${profile.goal.text.toLowerCase()}.` : "El puntaje se muestra con la información disponible, pero todavía no hay una señal concreta que justifique señalar un problema principal.";
  const strengths = strengthsFound.slice(0, 4).map((finding) => ({ title: `Una base favorable en ${sourceLabel(finding.source)}`, evidence: finding.evidence }));
  const weaknesses = problems.slice(0, 5).map((finding) => ({ title: finding.interpretation, evidence: `${finding.evidence} Fuente: ${sourceLabel(finding.source)}.`, findingId: finding.findingId }));
  const opportunities = buildProfileOpportunities(profile, problems, strengthsFound);
  const priorities = problems.slice(0, 3).map((finding, index) => ({ title: finding.interpretation, reason: `${finding.evidence} ${finding.goalRelation}`, order: index + 1 }));
  const risks = buildProfileRisks(profile, problems);
  const summaryEvidence = primary ? `La señal que más pesa proviene de ${sourceLabel(primary.source)}: ${primary.evidence}` : primaryStrength ? `La señal más firme es: ${primaryStrength.evidence}` : "Todavía hay poca evidencia concreta para señalar un único freno.";
  return {
    engineType: "deterministic",
    summary: `${business.nombre} obtiene un Nuvra Score de ${score}/100 para su objetivo de ${business.objetivo.toLowerCase()}. ${summaryEvidence}`,
    bottleneck: { dimension: primary?.area || "estado actual", title: mainTitle, explanation: mainExplanation, findingId: primary?.findingId },
    strengths,
    weaknesses,
    opportunities,
    risks,
    priorities,
  };
}

function buildProfileOpportunities(profile: BusinessProfile, problems: ContextualFinding[], strengths: ContextualFinding[]): string[] {
  const opportunities: string[] = [];
  for (const problem of problems.slice(0, 2)) opportunities.push(`Resolver lo observado en ${sourceLabel(problem.source)} para facilitar que una persona pueda ${profile.primaryCustomerAction}: ${problem.evidence}`);
  const strength = strengths[0];
  if (strength) opportunities.push(`Aprovechar esta fortaleza observada en ${sourceLabel(strength.source)} para acercar más personas a ${profile.primaryCustomerAction}: ${strength.evidence}`);
  const declared = profile.declaredSignals[0];
  if (declared && !opportunities.some((item) => item.includes(declared.evidence))) opportunities.push(`Usar este dato aportado por el negocio para decidir el próximo paso: ${declared.evidence}`);
  return opportunities.slice(0, 3);
}

function buildProfileRisks(profile: BusinessProfile, problems: ContextualFinding[]): string[] {
  const risks: string[] = [];
  const capacity = profile.declaredSignals.find((signal) => signal.type === "capacity");
  if (capacity) risks.push(`No conviene generar más demanda sin considerar este límite informado: ${capacity.evidence}`);
  const urgent = problems.find((problem) => problem.impact === "high");
  if (urgent) risks.push(`Si no se resuelve lo observado en ${sourceLabel(urgent.source)}, el objetivo puede seguir frenado: ${urgent.evidence}`);
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
