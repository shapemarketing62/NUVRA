import type { NuvraScoreResult } from "../scoring/nuvra-score";
import type { RawFinding } from "../website-analyzer/types";
import { createAIService, diagnosisSchema, type DiagnosisOutput } from "../ai/ai-service.ts";
import type { BusinessProfile } from "../intelligence/business-profile";
import type { ProblemCandidate, StrengthCandidate } from "../intelligence/commercial-candidates.ts";
import { buildMarketingDecisionContext } from "../strategy/marketing-decision-context.ts";
import { buildDiagnosticFindings, buildChannelInsights, buildStrategyPlan, presentPrimaryStep, humanizeProblem } from "./diagnostic-finding-presenter.ts";
import type { DiagnosisV2Output, StrategyV2Output, DiagnosticFinding, ChannelInsight, StrategyPlan } from "./diagnostic-v2-types.ts";

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
  conclusionAudit?: {
    mainProblem: { candidateId: string | null; conclusionConfidence: number | null; evidenceSufficiency: string | null };
    strengths: Array<{ candidateId: string; conclusionConfidence: number }>;
    opportunities: Array<{ text: string; conclusionConfidence: number; basedOn: string }>;
  };
  v2?: DiagnosisV2Output;
}

const sourceLabel = (source: string) => ({ web: "el sitio web", instagram: "Instagram", search: "Google", reviews: "las reseñas", competitor: "los negocios similares", external_mentions: "las menciones externas", other: "la información aportada" }[source] || "la evidencia encontrada");
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
export async function runDiagnosticEngine(business: BusinessContext, scoreResult: NuvraScoreResult, findings: RawFinding[], businessProfile?: BusinessProfile): Promise<DiagnosisResult> {
  const profile = businessProfile || business.businessProfile;
  // Cuando existe el mapa comercial, la decisión debe ser causal y trazable.
  // La IA queda reservada al fallback legacy para no saltarse ProblemCandidates.
  if (profile) {
    try {
      return buildProfileDiagnosis(business, scoreResult, profile);
    } catch (error) {
      profile.processingIssues?.push({ stage: "diagnostic", errorType: error instanceof Error ? error.name : "DiagnosticError", message: error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180) });
      return buildLegacyFallback(business, scoreResult, findings);
    }
  }
  const ai = createAIService();
  if (ai.isAvailable()) {
    const aiResult = await ai.completeStructured(buildAIPrompt(business, scoreResult, findings, profile), diagnosisSchema);
    if (aiResult) return { ...aiResult, engineType: "ai" };
  }
  return buildLegacyFallback(business, scoreResult, findings);
}

export function buildProfileDiagnosis(business: BusinessContext, scoreResult: NuvraScoreResult, profile: BusinessProfile): DiagnosisResult {
  const evaluatedCount = scoreResult.dimensions.filter((dimension) => dimension.points !== null).length;
  const evaluableDimensions = scoreResult.dimensions.length > 0 ? evaluatedCount : scoreResult.total === null ? 0 : null;
  const decision = buildMarketingDecisionContext(profile, { timeframeDays: business.plazoDias, timeframeLabel: business.plazoLabel, evaluableDimensions });
  const problems = [...profile.problemCandidates]
    .filter((candidate) => candidate.validationStatus === "validated" && Array.isArray(candidate.evidenceFor) && candidate.evidenceFor.length > 0)
    .sort((a, b) => b.priorityScore - a.priorityScore);
  const strengthsFound = [...profile.strengthCandidates].filter((candidate) => ["sufficient", "strong"].includes(candidate.evidenceSufficiency?.status || "limited")).sort((a, b) => b.priorityScore - a.priorityScore);
  const primary = problems[0];
  const primaryStrength = strengthsFound[0];
  const objective = String(business.objetivo || profile.goal?.text || "hacer crecer el negocio").toLowerCase().replace(/[.!?]+$/, "");
  const demandPatternQuote = decision.demandPattern?.replace(/[.!?]+$/, "");
  const scoreContext = scoreResult.total === null
    ? `${business.nombre} fue analizado para su objetivo de ${objective}.`
    : `${business.nombre} obtiene un Nuvra Score de ${scoreResult.total}/100 para su objetivo de ${objective}.`;
  const mainTitle = decision.evidence.status === "insufficient" ? "Todavía falta información para sacar una conclusión" : primary ? humanizeProblem(primary) : decision.demandPattern ? "La oportunidad más concreta está en equilibrar los momentos de menor demanda" : primaryStrength ? `La base comercial más aprovechable está en ${stageLabel(primaryStrength.journeyStage).toLowerCase()}` : validationTitle(decision.goal.type);
  const mainExplanation = decision.evidence.status === "insufficient" ? `Encontramos varias cosas que ya funcionan, pero todavía no tenemos suficiente información para afirmar qué está frenando las consultas. Primero hace falta registrar ${decision.decision.primaryKpi}, su origen y el paso en que cada consulta avanza o se detiene.` : primary ? plainExplanation(profile, primary) : decision.demandPattern ? `El negocio informó: “${demandPatternQuote}”. Como el objetivo es “${decision.goal.original}”, la decisión más defendible es trabajar ese desbalance y medirlo, sin asumir una falla en los canales que no fue comprobada.` : primaryStrength ? `${primaryStrength.statement} Conviene usar esa base para avanzar hacia ${profile.goal.text.toLowerCase()}.` : validationExplanation(profile, decision.decision.primaryKpi);
  const strengths = strengthsFound.slice(0, 4).map((candidate) => ({ title: candidate.statement, evidence: evidenceText(profile, candidate.evidence) }));
  const weaknesses = problems.slice(0, 5).map((candidate) => ({ title: candidate.hypothesis, evidence: plainExplanation(profile, candidate), findingId: candidate.evidenceFor[0] }));
  const opportunities = buildProfileOpportunities(profile, problems, strengthsFound, decision);
  const priorities = problems.slice(0, 3).map((candidate, index) => ({ title: candidate.hypothesis, reason: plainExplanation(profile, candidate), order: index + 1 }));
  const risks = buildProfileRisks(profile, problems);
  const summaryEvidence = decision.evidence.status === "insufficient" ? "Encontramos varias cosas que ya funcionan, pero todavía no tenemos suficiente información para afirmar qué está frenando las consultas." : primary ? `El hallazgo más firme está en ${stageLabel(primary.journeyStage).toLowerCase()}: ${primary.hypothesis}` : decision.demandPattern ? "El contexto aportado permite elegir una oportunidad comercial concreta, aunque todavía no prueba una causa única." : primaryStrength ? `La señal más firme es: ${primaryStrength.statement}` : "La información revisada alcanza para definir una prioridad, pero todavía no prueba una causa única.";
  const findings: DiagnosticFinding[] = buildDiagnosticFindings(profile, scoreResult);
  const channels: ChannelInsight[] = buildChannelInsights(profile, scoreResult);
  const primaryStep = presentPrimaryStep({ rubro: business.rubro, tipoCliente: business.publicoObjetivo, presupuesto: business.businessProfile?.resources.monthlyBudget ?? null, capacidad: business.businessProfile?.resources.executionCapacity ?? null, objetivo: business.objetivo, ubicacion: business.businessProfile?.location ?? null });
  const whatWeKnow = Array.from(new Set(findings.filter((f) => f.strength === "fuerte" || f.strength === "parcial").map((f) => `${f.channel}: ${f.whatWeSaw}`))).slice(0, 5);
  const whatWeDontKnow = Array.from(new Set(findings.flatMap((f) => f.unknowns))).slice(0, 5);
  const expandableEvidence = findings.slice(0, 5).map((f) => ({ id: f.id, text: f.whatWeSaw, source: f.channel }));

  return {
    engineType: "deterministic",
    summary: `${scoreContext} ${summaryEvidence}`,
    bottleneck: { dimension: primary?.journeyStage || "estado actual", title: mainTitle, explanation: mainExplanation, findingId: primary?.evidenceFor[0] },
    strengths,
    weaknesses,
    opportunities,
    risks,
    priorities,
    conclusionAudit: {
      mainProblem: { candidateId: primary?.id || null, conclusionConfidence: primary?.conclusionConfidence ?? null, evidenceSufficiency: primary?.evidenceSufficiency.status || null },
      strengths: strengthsFound.slice(0, 4).map((candidate) => ({ candidateId: candidate.id, conclusionConfidence: candidate.conclusionConfidence })),
      opportunities: opportunities.map((text, index) => ({ text, conclusionConfidence: problems[index]?.conclusionConfidence ?? strengthsFound[0]?.conclusionConfidence ?? .35, basedOn: problems[index]?.id || strengthsFound[0]?.id || "declared_context" })),
    },
    v2: {
      engineType: "deterministic" as const,
      summary: `${scoreContext} ${summaryEvidence}`,
      findings,
      channels,
      whatWeKnow,
      whatWeDontKnow,
      expandableEvidence,
    } satisfies DiagnosisV2Output,
  } as DiagnosisResult & { v2: DiagnosisV2Output };
}

function stageLabel(stage: string) {
  return profileStageLabels[stage] || "el recorrido comercial";
}

function validationTitle(goalType: string) {
  if (goalType === "consultations") return "Todavía necesitamos medir cuántas consultas reales genera cada canal";
  if (goalType === "appointments") return "Todavía necesitamos medir cuántos pedidos de turno genera cada canal";
  if (goalType === "local_visits") return "Todavía necesitamos medir qué lleva a las personas hasta el local";
  if (goalType === "sales" || goalType === "orders") return "Todavía necesitamos medir qué contactos terminan en una compra";
  return "Todavía necesitamos medir qué parte del negocio impulsa el resultado";
}

function validationExplanation(profile: BusinessProfile, primaryKpi: string) {
  return `Vimos información útil en algunas partes del negocio, pero todavía no sabemos cuántos resultados reales genera cada canal ni dónde dejan de avanzar las personas. Registrar ${primaryKpi} y su origen permitirá decidir qué conviene mejorar primero.`;
}

const profileStageLabels: Record<string, string> = { discovery: "Descubrimiento", evaluation: "Evaluación", decision: "Decisión", action: "Acción comercial", experience: "Experiencia", retention: "Recompra o continuidad" };

function evidenceText(profile: BusinessProfile, evidenceIds: string[]): string {
  return evidenceIds.map((id) => profile.commercialEvidence.find((item) => item.id === id)?.text).filter(Boolean).join(" · ");
}

function plainExplanation(profile: BusinessProfile, candidate: ProblemCandidate): string {
  const supporting = evidenceText(profile, candidate.evidenceFor);
  const supportingSentence = supporting.replace(/[.!?]+$/, "");
  const plainStage = candidate.journeyStage === "retention"
    ? `después de que la persona ya consultó o compró`
    : candidate.journeyStage === "experience"
      ? `durante la experiencia posterior a la consulta o compra`
      : `antes de que la persona pueda consultar o comprar`;
  return `${candidate.causalExplanation} Lo observado: ${supportingSentence}. Esto importa para “${profile.goal.text}” porque ocurre ${plainStage}.`;
}

function buildProfileOpportunities(profile: BusinessProfile, problems: ProblemCandidate[], strengths: StrengthCandidate[], decision: ReturnType<typeof buildMarketingDecisionContext>): string[] {
  const opportunities: string[] = [];
  for (const problem of problems.slice(0, 2)) opportunities.push(`Mejorar ${stageLabel(problem.journeyStage).toLowerCase()} para que más personas puedan ${profile.primaryCustomerAction}: ${problem.hypothesis}`);
  const strength = strengths[0];
  if (strength) opportunities.push(`Aprovechar esta fortaleza antes de ${profile.primaryCustomerAction}: ${strength.statement}`);
  const declared = profile.declaredSignals[0];
  if (declared && !opportunities.some((item) => item.includes(declared.evidence))) {
    if (declared.type === "demand_pattern") opportunities.push(`Trabajar los períodos con capacidad disponible para avanzar hacia “${decision.goal.original}”, y medir ${decision.decision.primaryKpi}.`);
    else if (declared.type === "referrals") opportunities.push(`Hacer medibles las recomendaciones que el negocio declaró como origen de clientes, sin asumir resultados que todavía no fueron verificados.`);
    else if (declared.type === "channel") opportunities.push(`Conectar el canal que el negocio ya usa con un próximo paso concreto hacia ${profile.primaryCustomerAction}.`);
    else opportunities.push(`Convertir el contexto aportado por el negocio en una prueba pequeña y medible sobre ${decision.decision.primaryKpi}.`);
  }
  return opportunities.slice(0, 3);
}

function buildProfileRisks(profile: BusinessProfile, problems: ProblemCandidate[]): string[] {
  const risks: string[] = [];
  const capacity = profile.declaredSignals.find((signal) => signal.type === "capacity");
  if (capacity) risks.push(`No conviene generar más demanda sin considerar este límite informado: ${capacity.evidence}`);
  const urgent = problems.find((problem) => problem.severity === "high");
  if (urgent) risks.push(`Si no se resuelve el punto observado en ${stageLabel(urgent.journeyStage).toLowerCase()}, el objetivo puede seguir frenado: ${urgent.hypothesis}`);
  return risks.slice(0, 3);
}

function buildLegacyFallback(business: BusinessContext, scoreResult: NuvraScoreResult, findings: RawFinding[]): DiagnosisResult {
  const safeFindings = Array.isArray(findings) ? findings : [];
  const problem = safeFindings.find((finding) => finding?.type === "problem");
  const scoreContext = scoreResult.total === null
    ? `${business.nombre} fue analizado con la información disponible.`
    : `${business.nombre} obtiene un Nuvra Score de ${scoreResult.total}/100 con la información disponible.`;
  const objective = String(business.objetivo || "hacer crecer el negocio").toLowerCase();
  return {
    engineType: "deterministic",
    summary: scoreContext,
    bottleneck: { dimension: problem?.category || "estado actual", title: problem?.title || "Hace falta observar un poco más", explanation: problem?.evidence || "Todavía no hay una señal concreta suficiente para elegir un único problema." },
    strengths: [],
    weaknesses: problem ? [{ title: problem.title, evidence: problem.evidence }] : [],
    opportunities: problem ? [`Resolver lo observado para avanzar hacia ${objective}: ${problem.evidence}`] : [],
    risks: [],
    priorities: problem ? [{ title: problem.title, reason: problem.evidence, order: 1 }] : [],
  };
}

function buildAIPrompt(business: BusinessContext, score: NuvraScoreResult, findings: RawFinding[], profile?: BusinessProfile): string {
  return JSON.stringify({ instruction: "Generá un diagnóstico específico y sencillo basado SOLO en las evidencias. Cada problema debe indicar evidencia, fuente, interpretación y relación con el objetivo. No inventes datos ni uses términos técnicos de marketing.", business: { nombre: business.nombre, rubro: business.rubro, objetivo: business.objetivo, plazo: business.plazoLabel }, businessProfile: profile, nuvraScore: score.total, scoresByArea: score.dimensions.map((dimension) => ({ area: dimension.slug, points: dimension.points, weight: dimension.weight })), findings: findings.map((finding) => ({ title: finding.title, evidence: finding.evidence, source: finding.source, category: finding.category, severity: finding.severity })) });
}
