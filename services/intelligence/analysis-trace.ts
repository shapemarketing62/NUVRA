import type { AggregatedEvidence } from "./evidence-aggregator.ts";
import type { BusinessProfile } from "./business-profile.ts";
import type { DiscoveryResult } from "../discovery/business-discovery-service.ts";
import type { DiagnosisResult } from "../diagnostic/diagnostic-engine.ts";
import type { StrategyResult } from "../strategy/strategy-engine.ts";
import type { NuvraScoreResult } from "./nuvra-score-calculator.ts";
import { STRATEGIC_PATTERNS } from "../strategy/strategic-knowledge-base.ts";
import { buildCrossChannelMarketingIntelligence, type CrossChannelMarketingIntelligence } from "./cross-channel-marketing-intelligence.ts";
import { marketingKnowledge } from "../knowledge/marketing-knowledge-catalog.ts";
import type { PlatformDiscoveryReport } from "../discovery/platform-discovery-service.ts";

export interface AnalysisTrace {
  version: "commercial-journey-v1";
  createdAt: string;
  searched: Array<{ source: string; purpose: string; status: string }>;
  discovery: {
    status: string;
    primaryWebUrl: string | null;
    primaryInstagram: string | null;
    primaryGoogleMaps: string | null;
    queries: Array<{ query: string; intent: string; status: string; resultCount: number; providers: Array<{ provider: string; status: string; errorType?: string }> }>;
    candidates: Array<{ title: string; url: string; type: string; status: string; matchScore: number; signals: unknown; reason: string; corroboratingSources: string[] }>;
  };
  found: Array<{ evidenceId: string; kind: string; source: string; stage: string; text: string; confidence: string }>;
  evidenceQuality: Array<{
    evidenceId: string;
    originId: string | null;
    acquisitionMethod: string;
    sourceQuality: number | null;
    independence: number;
    recency: number | null;
    corroboration: number | null;
    claimKey: string | null;
    contribution: string;
  }>;
  evidenceConflicts: BusinessProfile["evidenceConflicts"];
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
    platformDifferences: unknown[];
  } | null;
  socialSources: Array<{
    source: string;
    status: string;
    priority?: string;
    relevanceReasons: string[];
    entityConfidence: number;
    accountsFound: number;
    acceptedContent: number;
    rejectedContent: number;
    comments: number;
    limitations: string[];
    errors: unknown[];
    brandIdentityUsed: boolean;
    acquisitionMethods: string[];
    sourceCoverage?: unknown;
    queriesUsed: number;
    durationMs: number;
  }>;
  knowledgeBase: {
    consultedPatternIds: string[];
    rejectedPatternIds: string[];
    unusedPatternIds: string[];
    evaluations: Array<{ patternId: string; applied: boolean; score: number; reasons: string[]; rejectionReason?: string; intervention?: string }>;
    selectedInterventions: Array<{ action: string; patternIds: string[] }>;
  };
  marketingKnowledge: Array<{
    ruleId: string;
    domain: string;
    platform: string | null;
    surface: string | null;
    evidenceLevel: string;
    version: string;
    sourceTitle: string;
    sourceUrl: string;
    usedBy: string[];
  }>;
  crossChannel: CrossChannelMarketingIntelligence;
  platformDiscovery: {
    entries: Array<{ platform: string; status: string; url: string | null; reason: string; action: string; relevance: string | null; queries: Array<{ query: string; status: string; resultCount: number }>; crossLinkLevel: string | null; crossLinkUrls: string[]; analyzerStatus: string | null; evidenceCount: number; coverage: number; acquisitionMethods: string[] }>;
    hadProviderFailure: boolean;
    durationMs: number;
    needsSearch: boolean;
  };
  prioritization: {
    selectedProblemId: string | null;
    rule: string;
    explanation: string;
  };
  decisionEvidence: NonNullable<StrategyResult["audit"]>["decisionEvidence"] | null;
  actionConsiderations: NonNullable<StrategyResult["audit"]>["candidates"];
  finalActions: Array<{ title: string; problem: string | undefined; evidenceIds: string[] | undefined; metric: string | undefined; confidence: string | undefined }>;
  conclusionContributions: {
    problems: Array<{ id: string; confidence: number; sufficiency: string; evidenceIds: string[] }>;
    strengths: Array<{ id: string; confidence: number; sufficiency: string; evidenceIds: string[] }>;
    opportunities: NonNullable<DiagnosisResult["conclusionAudit"]>["opportunities"];
    recommendations: Array<{ title: string; confidence: number | null; evidenceIds: string[] }>;
  };
  scoreExplanation: {
    scoreMethodologyVersion: NuvraScoreResult["scoreMethodologyVersion"];
    total: number | null;
    signalsThatAdded: string[];
    signalsThatSubtracted: string[];
    dimensions: Array<{ slug: string; applicable: boolean; points: number | null; performanceScore: number | null; evidenceConfidence: number; evidenceCeiling: number; weight: number; findingIds: string[]; contributions: NuvraScoreResult["dimensions"][number]["contributions"] }>;
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
  platformDiscovery?: PlatformDiscoveryReport;
}): AnalysisTrace {
  const discarded = [
    ...(Array.isArray(input.discovery.rejectedSources) ? input.discovery.rejectedSources : []).map((candidate) => ({ item: candidate.url, reason: `Descartado por validación de entidad: ${candidate.status || "rejected"}.` })),
    ...Object.entries(input.aggregated.sources).filter(([, evidence]) => evidence.status !== "evaluated").map(([source, evidence]) => ({ item: source, reason: String(evidence.metadata?.reason || `Fuente ${evidence.status}.`) })),
  ];
  const problemCandidates = Array.isArray(input.profile.problemCandidates) ? input.profile.problemCandidates : [];
  const selectedProblem = problemCandidates.find((candidate) => candidate.validationStatus === "validated" && Array.isArray(candidate?.evidenceFor) && candidate.evidenceFor.includes(input.diagnosis?.bottleneck?.findingId || "")) || problemCandidates.find((candidate) => candidate.validationStatus === "validated");
  const reputation = input.aggregated.crossSourceReputation || (input.aggregated.sources.reviews?.data as any)?.reputation;
  const socialSourceNames = ["instagram", "x", "tiktok", "reddit", "facebook", "linkedin", "youtube"] as const;
  const actionCandidates = input.strategy.audit?.candidates || [];
  const knowledgeEvaluations = actionCandidates.flatMap((candidate) => candidate.knowledgeMatches || []);
  const consultedPatternIds = Array.from(new Set(knowledgeEvaluations.map((match) => match.patternId)));
  const marketingKnowledgeUses = collectMarketingKnowledgeUses(input.aggregated);
  return {
    version: "commercial-journey-v1",
    createdAt: new Date().toISOString(),
    searched: Object.entries(input.aggregated.sources).map(([source, evidence]) => ({ source, purpose: `Obtener evidencia comercial para ${input.profile.primaryCustomerAction}.`, status: evidence.status })),
    discovery: {
      status: input.discovery.status || "legacy_unknown",
      primaryWebUrl: input.discovery.primaryWebUrl || null,
      primaryInstagram: input.discovery.primaryInstagram || null,
      primaryGoogleMaps: input.discovery.primaryGoogleMaps || null,
      queries: (input.discovery.queryAttempts || []).map((attempt) => ({ query: attempt.query, intent: attempt.intent, status: attempt.status, resultCount: attempt.resultCount, providers: attempt.providers || [] })),
      candidates: (input.discovery.allCandidates || []).map((candidate) => ({
        title: candidate.title,
        url: candidate.url,
        type: candidate.type,
        status: candidate.status || "unknown",
        matchScore: candidate.matchScore || 0,
        signals: candidate.metadata?.matchingSignals || null,
        reason: candidate.rationale || "Sin evaluación de entidad",
        corroboratingSources: Array.isArray(candidate.metadata?.corroboratingSources) ? candidate.metadata.corroboratingSources.filter((value): value is string => typeof value === "string") : [],
      })),
    },
    found: (Array.isArray(input.profile.commercialEvidence) ? input.profile.commercialEvidence : []).map((evidence) => ({ evidenceId: evidence.id, kind: evidence.kind, source: evidence.source, stage: evidence.journeyStage, text: evidence.text, confidence: evidence.confidence })),
    evidenceQuality: (Array.isArray(input.profile.commercialEvidence) ? input.profile.commercialEvidence : []).map((evidence) => ({
      evidenceId: evidence.id,
      originId: evidence.lineage?.originId || null,
      acquisitionMethod: evidence.acquisitionMethod || "unknown",
      sourceQuality: evidence.sourceQuality?.score ?? null,
      independence: evidence.lineage?.independence ?? 1,
      recency: evidence.sourceQuality?.recency ?? null,
      corroboration: evidence.corroboration?.strength ?? null,
      claimKey: evidence.corroboration?.claimKey || null,
      contribution: evidence.corroboration?.conflict ? "Contribuye con conflicto explícito; no decide la conclusión por sí sola." : evidence.sourceQuality?.maxClaimStrength === "strong" ? "Puede contribuir a una conclusión fuerte si la suficiencia total lo permite." : "Contribución limitada por calidad, contexto o cobertura.",
    })),
    evidenceConflicts: input.profile.evidenceConflicts || [],
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
      platformDifferences: reputation.platformDifferences || [],
    } : null,
    socialSources: [...socialSourceNames.map((source) => {
      const evidence = input.aggregated.sources[source]; const metadata = evidence?.metadata || {}; const planner = metadata.planner as any;
      const acquisitionReport = metadata.acquisitionReport as any;
      return { source, status: String(metadata.finalStatus || evidence?.status || "not_considered"), priority: planner?.priority, relevanceReasons: Array.isArray(planner?.reasons) ? planner.reasons : [], entityConfidence: Number(metadata.entityConfidence || 0), accountsFound: Number(metadata.accountsFound || ((evidence?.data as any)?.profileDiscovered ? 1 : 0)), acceptedContent: Number(metadata.acceptedContent || 0), rejectedContent: Number(metadata.rejectedContent || 0), comments: Number(metadata.comments || 0), limitations: Array.isArray(metadata.limitations) ? metadata.limitations as string[] : [], errors: Array.isArray(metadata.errors) ? metadata.errors : [], brandIdentityUsed: Boolean((evidence?.data as any)?.brandIdentityEvidence), acquisitionMethods: Array.isArray(metadata.acquisitionMethods) ? metadata.acquisitionMethods as string[] : [], sourceCoverage: metadata.sourceCoverage, queriesUsed: Number(acquisitionReport?.queryCount || 0), durationMs: Number(acquisitionReport?.durationMs || 0) };
    }), (() => {
      const reviews = input.aggregated.sources.reviews; const metadata = reviews?.metadata || {}; const data = reviews?.data as any;
      return { source: "google_business_profile", status: reviews?.status || "not_considered", relevanceReasons: ["Ficha, ubicación y reseñas oficiales cuando Google Places está configurado."], entityConfidence: Number(metadata.entityMatchConfidence || data?.entityMatchConfidence || 0), accountsFound: data?.profile?.placeId ? 1 : 0, acceptedContent: Number(metadata.acceptedComments || 0), rejectedContent: Number(metadata.rejectedEntity || 0), comments: Number(metadata.acceptedComments || 0), limitations: [metadata.providerUsed === "google_places_api" ? "Cobertura obtenida mediante Google Places API." : "Sin GOOGLE_PLACES_API_KEY solo se conserva el fallback público experimental cuando puede validarse."], errors: [], brandIdentityUsed: false, acquisitionMethods: [metadata.providerUsed === "google_places_api" ? "official_api" : "public_page"], sourceCoverage: { profile: Boolean(data?.profile), bio: false, content: "none", comments: metadata.acceptedComments ? "partial" : "none", mentions: "none", metrics: data?.rating != null ? "public" : "none" }, queriesUsed: 0, durationMs: Number((metadata.execution as any)?.durationMs || 0) };
    })()],
    knowledgeBase: {
      consultedPatternIds,
      rejectedPatternIds: Array.from(new Set(actionCandidates.flatMap((candidate: any) => candidate.rejectedKnowledgePatternIds || []))),
      unusedPatternIds: STRATEGIC_PATTERNS.map((pattern) => pattern.id).filter((id) => !consultedPatternIds.includes(id)),
      evaluations: knowledgeEvaluations,
      selectedInterventions: actionCandidates.filter((candidate: any) => candidate.selected && candidate.knowledgePatternIds?.length).map((candidate: any) => ({ action: candidate.title, patternIds: candidate.knowledgePatternIds })),
    },
    marketingKnowledge: Array.from(marketingKnowledgeUses.entries()).flatMap(([ruleId, usedBy]) => {
      const match = marketingKnowledge.getRule(ruleId);
      return match ? [{ ruleId, domain: match.rule.domain, platform: match.rule.platform || null, surface: match.rule.surface || null, evidenceLevel: match.rule.evidenceLevel, version: match.rule.version, sourceTitle: match.source.title, sourceUrl: match.source.url, usedBy: Array.from(usedBy) }] : [];
    }),
    crossChannel: buildCrossChannelMarketingIntelligence(input.profile, input.aggregated),
    platformDiscovery: {
      entries: (input.platformDiscovery?.entries || []).map((entry) => ({
        platform: entry.platform,
        status: entry.status,
        url: entry.url || null,
        reason: entry.reason,
        action: entry.planEntry.action,
        relevance: entry.planEntry.relevance?.priority || null,
        queries: (entry.queryAttempts || []).map((attempt) => ({ query: attempt.query, status: attempt.status, resultCount: attempt.resultCount })),
        crossLinkLevel: entry.crossLink?.level || null,
        crossLinkUrls: entry.crossLink?.urls || [],
        analyzerStatus: entry.analyzer?.sourceStatus || null,
        evidenceCount: entry.analyzer?.evidenceCount || 0,
        coverage: entry.analyzer?.coverage || 0,
        acquisitionMethods: entry.analyzer?.acquisitionMethods || [],
      })),
      hadProviderFailure: input.platformDiscovery?.hadProviderFailure || false,
      durationMs: input.platformDiscovery?.durationMs || 0,
      needsSearch: (input.platformDiscovery?.entries || []).some((entry) => (entry.queryAttempts || []).length > 0),
    },
    prioritization: {
      selectedProblemId: selectedProblem?.id || null,
      rule: "señal → hipótesis → evidencia que confirma → evidencia que contradice → validación; luego impacto sobre objetivo × relevancia comercial × posibilidad de solución",
      explanation: selectedProblem ? `${selectedProblem.hypothesis} quedó validada con fuerza ${selectedProblem.evidenceStrength}, contradicción ${selectedProblem.contradictionStrength} y prioridad ${selectedProblem.priorityScore}/100.` : "No se seleccionó un problema sin una hipótesis validada.",
    },
    decisionEvidence: input.strategy.audit?.decisionEvidence || null,
    actionConsiderations: actionCandidates,
    finalActions: (Array.isArray(input.strategy.actions) ? input.strategy.actions : []).map((action) => ({ title: action.title, problem: action.problem, evidenceIds: action.findingIds, metric: action.kpi || action.indicatorToImprove, confidence: action.confidence })),
    conclusionContributions: {
      problems: problemCandidates.map((candidate) => ({ id: candidate.id, confidence: candidate.conclusionConfidence ?? (candidate.confidence === "ALTA" ? .8 : candidate.confidence === "MEDIA" ? .6 : .4), sufficiency: candidate.evidenceSufficiency?.status || "legacy_unrated", evidenceIds: candidate.evidenceFor })),
      strengths: (input.profile.strengthCandidates || []).map((candidate) => ({ id: candidate.id, confidence: candidate.conclusionConfidence ?? (candidate.confidence === "ALTA" ? .8 : candidate.confidence === "MEDIA" ? .6 : .4), sufficiency: candidate.evidenceSufficiency?.status || "legacy_unrated", evidenceIds: candidate.evidence })),
      opportunities: input.diagnosis.conclusionAudit?.opportunities || [],
      recommendations: (input.strategy.audit?.candidates || []).filter((candidate) => candidate.selected).map((candidate) => ({ title: candidate.title, confidence: candidate.conclusionConfidence ?? null, evidenceIds: candidate.evidenceIds || [] })),
    },
    scoreExplanation: {
      scoreMethodologyVersion: input.score.scoreMethodologyVersion,
      total: input.score.total,
      signalsThatAdded: (Array.isArray(input.profile.commercialEvidence) ? input.profile.commercialEvidence : []).filter((evidence) => evidence.polarity === "positive").map((evidence) => evidence.id),
      signalsThatSubtracted: (Array.isArray(input.profile.commercialEvidence) ? input.profile.commercialEvidence : []).filter((evidence) => evidence.polarity === "negative").map((evidence) => evidence.id),
      dimensions: (Array.isArray(input.score.dimensions) ? input.score.dimensions : []).map((dimension) => ({ slug: dimension.slug, applicable: dimension.applicable, points: dimension.points, performanceScore: dimension.performanceScore, evidenceConfidence: dimension.evidenceConfidence, evidenceCeiling: dimension.evidenceCeiling, weight: input.score.methodology.dimensionWeights[dimension.slug]?.combinedWeight || 0, findingIds: (Array.isArray(dimension.findings) ? dimension.findings : []).map((finding) => finding.id), contributions: dimension.contributions })),
      methodology: input.score.methodology,
    },
  };
}

function collectMarketingKnowledgeUses(aggregated: AggregatedEvidence) {
  const uses = new Map<string, Set<string>>();
  const add = (ruleId: unknown, usedBy: string) => {
    if (typeof ruleId !== "string" || !ruleId) return;
    if (!uses.has(ruleId)) uses.set(ruleId, new Set());
    uses.get(ruleId)!.add(usedBy);
  };
  const web = aggregated.sources.web?.data as any;
  for (const area of web?.marketingIntelligence?.areas || []) for (const ruleId of area?.knowledgeRuleIds || []) add(ruleId, `website:${area.area || "unknown"}`);
  for (const [source, evidence] of Object.entries(aggregated.sources)) {
    const data = evidence?.data as any;
    for (const item of data?.platformMarketing?.knowledge || []) add(item?.ruleId, `platform:${source}`);
  }
  return uses;
}
