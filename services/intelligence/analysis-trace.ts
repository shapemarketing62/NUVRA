import type { AggregatedEvidence } from "./evidence-aggregator.ts";
import type { BusinessProfile } from "./business-profile.ts";
import type { DiscoveryResult } from "../discovery/business-discovery-service.ts";
import type { DiagnosisResult } from "../diagnostic/diagnostic-engine.ts";
import type { StrategyResult } from "../strategy/strategy-engine.ts";
import type { NuvraScoreResult } from "./nuvra-score-calculator.ts";
import { STRATEGIC_PATTERNS } from "../strategy/strategic-knowledge-base.ts";

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
  processingIssues: BusinessProfile["processingIssues"];
  reputation: {
    commentsObtained: number;
    accepted: number;
    duplicatesDiscarded: number;
    rejectedEntity: number;
    topics: string[];
    temporalClaims: unknown[];
    strengths: string[];
    problems: string[];
  } | null;
  knowledgeBase: {
    consultedPatternIds: string[];
    rejectedPatternIds: string[];
    unusedPatternIds: string[];
    evaluations: Array<{ patternId: string; applied: boolean; score: number; reasons: string[]; rejectionReason?: string; intervention?: string }>;
    selectedInterventions: Array<{ action: string; patternIds: string[] }>;
  };
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
    ...(Array.isArray(input.discovery.rejectedSources) ? input.discovery.rejectedSources : []).map((candidate) => ({ item: candidate.url, reason: `Descartado por validación de entidad: ${candidate.status || "rejected"}.` })),
    ...Object.entries(input.aggregated.sources).filter(([, evidence]) => evidence.status !== "evaluated").map(([source, evidence]) => ({ item: source, reason: String(evidence.metadata?.reason || `Fuente ${evidence.status}.`) })),
  ];
  const problemCandidates = Array.isArray(input.profile.problemCandidates) ? input.profile.problemCandidates : [];
  const selectedProblem = problemCandidates.find((candidate) => candidate.validationStatus === "validated" && Array.isArray(candidate?.evidenceFor) && candidate.evidenceFor.includes(input.diagnosis?.bottleneck?.findingId || "")) || problemCandidates.find((candidate) => candidate.validationStatus === "validated");
  const reputation = (input.aggregated.sources.reviews?.data as any)?.reputation;
  const actionCandidates = input.strategy.audit?.candidates || [];
  const knowledgeEvaluations = actionCandidates.flatMap((candidate) => candidate.knowledgeMatches || []);
  const consultedPatternIds = Array.from(new Set(knowledgeEvaluations.map((match) => match.patternId)));
  return {
    version: "commercial-journey-v1",
    createdAt: new Date().toISOString(),
    searched: Object.entries(input.aggregated.sources).map(([source, evidence]) => ({ source, purpose: `Obtener evidencia comercial para ${input.profile.primaryCustomerAction}.`, status: evidence.status })),
    found: (Array.isArray(input.profile.commercialEvidence) ? input.profile.commercialEvidence : []).map((evidence) => ({ evidenceId: evidence.id, kind: evidence.kind, source: evidence.source, stage: evidence.journeyStage, text: evidence.text, confidence: evidence.confidence })),
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
    problemCandidates,
    strengthCandidates: Array.isArray(input.profile.strengthCandidates) ? input.profile.strengthCandidates : [],
    processingIssues: input.profile.processingIssues || [],
    reputation: reputation ? {
      commentsObtained: reputation.comments?.length || 0,
      accepted: reputation.accepted?.length || 0,
      duplicatesDiscarded: reputation.duplicates?.length || 0,
      rejectedEntity: reputation.rejectedEntity?.length || 0,
      topics: (reputation.topics || []).map((topic: any) => topic.name),
      temporalClaims: reputation.temporalClaims || [],
      strengths: (reputation.strengths || []).map((topic: any) => topic.name),
      problems: (reputation.problems || []).map((topic: any) => topic.name),
    } : null,
    knowledgeBase: {
      consultedPatternIds,
      rejectedPatternIds: Array.from(new Set(actionCandidates.flatMap((candidate: any) => candidate.rejectedKnowledgePatternIds || []))),
      unusedPatternIds: STRATEGIC_PATTERNS.map((pattern) => pattern.id).filter((id) => !consultedPatternIds.includes(id)),
      evaluations: knowledgeEvaluations,
      selectedInterventions: actionCandidates.filter((candidate: any) => candidate.selected && candidate.knowledgePatternIds?.length).map((candidate: any) => ({ action: candidate.title, patternIds: candidate.knowledgePatternIds })),
    },
    prioritization: {
      selectedProblemId: selectedProblem?.id || null,
      rule: "señal → hipótesis → evidencia que confirma → evidencia que contradice → validación; luego impacto sobre objetivo × relevancia comercial × posibilidad de solución",
      explanation: selectedProblem ? `${selectedProblem.hypothesis} quedó validada con fuerza ${selectedProblem.evidenceStrength}, contradicción ${selectedProblem.contradictionStrength} y prioridad ${selectedProblem.priorityScore}/100.` : "No se seleccionó un problema sin una hipótesis validada.",
    },
    actionConsiderations: actionCandidates,
    finalActions: (Array.isArray(input.strategy.actions) ? input.strategy.actions : []).map((action) => ({ title: action.title, problem: action.problem, evidenceIds: action.findingIds, metric: action.kpi || action.indicatorToImprove, confidence: action.confidence })),
    scoreExplanation: {
      total: input.score.total,
      signalsThatAdded: (Array.isArray(input.profile.commercialEvidence) ? input.profile.commercialEvidence : []).filter((evidence) => evidence.polarity === "positive").map((evidence) => evidence.id),
      signalsThatSubtracted: (Array.isArray(input.profile.commercialEvidence) ? input.profile.commercialEvidence : []).filter((evidence) => evidence.polarity === "negative").map((evidence) => evidence.id),
      dimensions: (Array.isArray(input.score.dimensions) ? input.score.dimensions : []).map((dimension) => ({ slug: dimension.slug, points: dimension.points, weight: input.score.methodology.dimensionWeights[dimension.slug]?.combinedWeight || 0, findingIds: (Array.isArray(dimension.findings) ? dimension.findings : []).map((finding) => finding.id) })),
      methodology: input.score.methodology,
    },
  };
}
