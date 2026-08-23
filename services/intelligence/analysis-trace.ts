import type { AggregatedEvidence } from "./evidence-aggregator.ts";
import type { BusinessProfile } from "./business-profile.ts";
import type { DiscoveryResult } from "../discovery/business-discovery-service.ts";
import type { DiagnosisResult } from "../diagnostic/diagnostic-engine.ts";
import type { StrategyResult } from "../strategy/strategy-engine.ts";
import type { NuvraScoreResult } from "./nuvra-score-calculator.ts";

export interface AnalysisTrace {
  version: "commercial-journey-v1";
  createdAt: string;
  searched: Array<{ source: string; purpose: string; status: string }>;
  found: Array<{ evidenceId: string; kind: string; source: string; stage: string; text: string; confidence: string }>;
  discarded: Array<{ item: string; reason: string }>;
  businessProfile: Record<string, unknown>;
  commercialJourney: BusinessProfile["commercialJourney"];
  problemCandidates: BusinessProfile["problemCandidates"];
  strengthCandidates: BusinessProfile["strengthCandidates"];
  prioritization: {
    selectedProblemId: string | null;
    rule: string;
    explanation: string;
  };
  actionConsiderations: NonNullable<StrategyResult["audit"]>["candidates"];
  finalActions: Array<{ title: string; problem: string | undefined; evidenceIds: string[] | undefined; metric: string | undefined; confidence: string | undefined }>;
  scoreExplanation: {
    total: number | null;
    signalsThatAdded: string[];
    signalsThatSubtracted: string[];
    dimensions: Array<{ slug: string; points: number | null; weight: number; findingIds: string[] }>;
    methodology: NuvraScoreResult["methodology"];
  };
}

export function buildAnalysisTrace(input: {
  discovery: DiscoveryResult;
  aggregated: AggregatedEvidence;
  profile: BusinessProfile;
  diagnosis: DiagnosisResult;
  strategy: StrategyResult;
  score: NuvraScoreResult;
}): AnalysisTrace {
  const discarded = [
    ...input.discovery.rejectedSources.map((candidate) => ({ item: candidate.url, reason: `Descartado por validación de entidad: ${candidate.status || "rejected"}.` })),
    ...Object.entries(input.aggregated.sources).filter(([, evidence]) => evidence.status !== "evaluated").map(([source, evidence]) => ({ item: source, reason: String(evidence.metadata?.reason || `Fuente ${evidence.status}.`) })),
  ];
  const selectedProblem = input.profile.problemCandidates.find((candidate) => candidate.evidenceFor.includes(input.diagnosis.bottleneck.findingId || "")) || input.profile.problemCandidates[0];
  return {
    version: "commercial-journey-v1",
    createdAt: new Date().toISOString(),
    searched: Object.entries(input.aggregated.sources).map(([source, evidence]) => ({ source, purpose: `Obtener evidencia comercial para ${input.profile.primaryCustomerAction}.`, status: evidence.status })),
    found: input.profile.commercialEvidence.map((evidence) => ({ evidenceId: evidence.id, kind: evidence.kind, source: evidence.source, stage: evidence.journeyStage, text: evidence.text, confidence: evidence.confidence })),
    discarded,
    businessProfile: {
      businessId: input.profile.businessId,
      originalIndustry: input.profile.originalIndustry,
      inferredCategory: input.profile.inferredCategory,
      offeringType: input.profile.offeringType,
      offerings: input.profile.offerings,
      operatingMode: input.profile.operatingMode,
      geographicArea: input.profile.geographicArea,
      commercialModel: input.profile.commercialModel,
      primaryCustomerAction: input.profile.primaryCustomerAction,
      primaryChannel: input.profile.primaryChannel,
      recurrence: input.profile.recurrence,
      decisionFactors: input.profile.decisionFactors,
      goal: input.profile.goal,
      resources: input.profile.resources,
      inferenceTrace: input.profile.inferenceTrace,
    },
    commercialJourney: input.profile.commercialJourney,
    problemCandidates: input.profile.problemCandidates,
    strengthCandidates: input.profile.strengthCandidates,
    prioritization: {
      selectedProblemId: selectedProblem?.id || null,
      rule: "fuerza de evidencia × impacto sobre objetivo × relevancia comercial × frecuencia × posibilidad de solución, con descuento por evidencia contradictoria",
      explanation: selectedProblem ? `${selectedProblem.hypothesis} obtuvo prioridad ${selectedProblem.priorityScore}/100 y conserva ${selectedProblem.evidenceAgainst.length} evidencia(s) contradictoria(s).` : "No se seleccionó un problema sin evidencia negativa suficiente.",
    },
    actionConsiderations: input.strategy.audit?.candidates || [],
    finalActions: input.strategy.actions.map((action) => ({ title: action.title, problem: action.problem, evidenceIds: action.findingIds, metric: action.kpi || action.indicatorToImprove, confidence: action.confidence })),
    scoreExplanation: {
      total: input.score.total,
      signalsThatAdded: input.profile.commercialEvidence.filter((evidence) => evidence.polarity === "positive").map((evidence) => evidence.id),
      signalsThatSubtracted: input.profile.commercialEvidence.filter((evidence) => evidence.polarity === "negative").map((evidence) => evidence.id),
      dimensions: input.score.dimensions.map((dimension) => ({ slug: dimension.slug, points: dimension.points, weight: input.score.methodology.dimensionWeights[dimension.slug]?.combinedWeight || 0, findingIds: dimension.findings.map((finding) => finding.id) })),
      methodology: input.score.methodology,
    },
  };
}
