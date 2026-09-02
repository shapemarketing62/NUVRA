import { getPlanSnapshot, normalizePlanTier, type EntitlementKey, type PlanTier } from "./plans.ts";
import { getFriendlyDimensionName, presentOpportunity, presentProblem, simplifyTechnicalText } from "./simple-language-presenter.ts";
import { decodeActionDecisionDetails, type ActionDecisionDetails } from "../services/strategy/action-decision-details.ts";
import { actionProgress, normalizeActionStatus, type ActionStatus } from "./action-execution.ts";
import { buildEvolutionView, type EvolutionView } from "./evolution-view.ts";
import {
  buildBusinessUnderstandingView,
  buildCompetitionView,
  type BusinessUnderstandingView,
  type CompetitionView,
} from "./business-context-views.ts";
import { buildAnalysisFreshness, type AnalysisFreshnessView } from "./analysis-freshness.ts";

export type DashboardInformationState = "sufficient" | "limited" | "unknown";
export type DashboardSourceStatus =
  | "analyzed"
  | "partial"
  | "discovered"
  | "not_found"
  | "requires_auth"
  | "unavailable"
  | "not_relevant"
  | "error"
  | "unknown";

export interface UserEvidenceView {
  observation: string;
  source: string;
  sourceType: string;
  url: string | null;
  date: string | null;
  interpretation: string;
  relatedConclusion: string | null;
  relationshipToGoal: string | null;
  informationState: DashboardInformationState;
  contradiction: string | null;
}

export interface DashboardCompetitorView {
  name: string;
  competitorType: "direct" | "partial" | "indirect";
  officialWebsite: string | null;
  officialSocialProfile: string | null;
  location?: string;
  rationale?: string;
  classification?: "confirmed_competitor" | "probable_competitor" | "uncertain" | "rejected";
}

export interface DashboardCompetitorSummary {
  competitors: DashboardCompetitorView[];
  totalValidated: number | null;
  totalCandidatesExtracted: number | null;
}

export interface DashboardExternalMentionsSummary {
  mentions: Array<{ url: string; title: string; mentionType: string; source: string; sentiment: string }>;
  totalAccepted: number | null;
  totalFound: number | null;
  totalRejected: number | null;
  byType: Record<string, number>;
}

export interface DashboardActionView {
  id: string;
  title: string;
  description: string | null;
  impact: string;
  difficulty: string;
  estimatedTime: string;
  rationale: string;
  done: boolean;
  state: ActionStatus;
  status: ActionStatus;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  canUpdateStatus: boolean;
  order?: number;
  findingIds?: string[];
  dependencies?: string[];
  evidence?: string;
  inference?: string;
  dimension?: string;
  framework?: string;
  confidence?: string;
  problem?: string;
  indicatorToImprove?: string;
  relatedConclusion: string | null;
  details: ActionDecisionDetails | null;
}

export interface DashboardViewModel {
  isDemo: boolean;
  internalAccess: boolean;
  planTier: PlanTier;
  plan: {
    tier: PlanTier;
    label: string;
    entitlements: Record<EntitlementKey, boolean>;
  };
  business: {
    id?: string;
    organizationId?: string | null;
    nombre: string;
    rubro: string;
    description?: string | null;
    location?: string | null;
    city?: string | null;
    country?: string | null;
    size?: string | null;
    customerType?: string | null;
    targetAudience?: string | null;
    productsAndServices?: string | null;
    averageTicket?: number | null;
    employees?: string | null;
    webUrl?: string | null;
    instagramHandle?: string | null;
    hasDeclaredNoWebsite?: boolean;
    hasDeclaredNoInstagram?: boolean;
    otherChannels?: string | null;
    channels?: string[];
    monthlyRevenue?: number | null;
    monthlyCustomers?: number | null;
    marketingInvestment?: number | null;
    objetivo?: string;
    customObjective?: string | null;
    timeframeDays?: number | null;
    plazoLabel?: string;
    magnitud?: number | null;
    updatedAt?: string | null;
    canEditDeclaredInformation: boolean;
  };
  analysisFreshness: AnalysisFreshnessView;
  businessUnderstanding: BusinessUnderstandingView;
  analysis: {
    analysisId: string | null;
    date: string | null;
    status: "pending" | "running" | "completed" | "partial" | "failed" | "unknown";
    completion: "complete" | "partial" | "unknown";
    completedSuccessfully: boolean;
    hasPartialSources: boolean;
    methodologyVersion: string | null;
    comparableWithPrevious: boolean;
  };
  intelligence: {
    coverage: number | null;
    sourceStatuses: Record<string, DashboardSourceStatus>;
    sourceMessages: Record<string, string>;
    discoveredInstagram: string | null;
    competitorSummary: DashboardCompetitorSummary | null;
    externalMentionsSummary: DashboardExternalMentionsSummary | null;
  } | null;
  sources: Array<{
    key: string;
    label: string;
    status: DashboardSourceStatus;
    message: string | null;
    hasEvidence: boolean;
  }>;
  score: {
    total: number | null;
    coverage: number | null;
    applicable: boolean;
    evidenceState: DashboardInformationState;
    dimensions: Array<{
      slug: string;
      name: string;
      points: number | null;
      applicable: boolean;
      weight: number | null;
      problems?: string[];
    }>;
    engineType?: string;
  } | null;
  diagnosis: {
    summary: string;
    bottleneck: { dimension: string; title: string; explanation: string; findingId?: string } | null;
    priorities: Array<{ title: string; reason: string; order: number }>;
    strengths: Array<{ title: string; evidence: string }>;
    weaknesses: Array<{ title: string; evidence: string; findingId?: string }>;
    opportunities: string[];
    risks: string[];
    engineType?: string;
  } | null;
  canonicalDiagnosis: {
    mainConclusion: {
      title: string;
      explanation: string;
      relationshipToGoal: string;
      source: "diagnosis.bottleneck";
      informationState: DashboardInformationState;
    } | null;
    strengths: Array<{ title: string; evidence: string; source: "diagnosis.strengths" }>;
    frictions: Array<{ title: string; evidence: string; source: "diagnosis.weaknesses" }>;
    opportunities: Array<{ text: string; source: "diagnosis.opportunities" }>;
    unknowns: string[];
    decisionInsight: {
      observation: string;
      hypothesis: string;
      evidenceFor: string[];
      evidenceAgainst: string[];
      unknowns: string[];
      decision: string;
      whyThisDecision: string[];
      alternativesNotPrioritized: string[];
      confidenceLabel: string;
    } | null;
  };
  strategy: {
    objetivo: string;
    situacionActual: string;
    distanciaObjetivo: string;
    principalProblema: string;
    prioridades: string[];
    engineType?: string;
  } | null;
  canonicalStrategy: {
    objective: string | null;
    problemOfOrigin: DashboardViewModel["canonicalDiagnosis"]["mainConclusion"];
    direction: string | null;
    rationale: string | null;
    expectedResult: string | null;
    kpi: string | null;
    horizon: string | null;
    notPriority: string[];
  } | null;
  actions: DashboardActionView[];
  actionsSummary: {
    immediateAction: DashboardActionView | null;
    pending: DashboardActionView[];
    inProgress: DashboardActionView[];
    completed: DashboardActionView[];
    progress: { total: number; completed: number; percentage: number };
    availableStates: ActionStatus[];
    relatedConclusion: DashboardViewModel["canonicalDiagnosis"]["mainConclusion"];
  };
  history: Array<{ nuvraScoreTotal: number | null; createdAt: string; scoreMethodologyVersion: string | null }>;
  evolutionSummary: {
    hasComparableAnalysis: boolean;
    previousComparableScore: number | null;
    currentScore: number | null;
    change: number | null;
  };
  evolution: EvolutionView;
  competitionSummary: {
    status: "available" | "limited" | "unavailable";
    count: number;
    validCompetitors: DashboardCompetitorView[];
    comparisonAvailable: boolean;
  };
  competition: CompetitionView;
  evidence: UserEvidenceView[];
}

const AREA_NAMES: Record<string, string> = {
  presencia: "Presencia Digital",
  conversion: "Conversión",
  posicionamiento: "Posicionamiento",
  propuesta: "Propuesta de Valor",
  redes: "Redes Sociales",
  adquisicion: "Adquisición",
  retencion: "Clientes que vuelven",
  identidad: "Identidad de marca",
};

const SOURCE_LABELS: Record<string, string> = {
  web: "Sitio web",
  search: "Búsqueda",
  instagram: "Instagram",
  reviews: "Reseñas",
  competitor: "Competencia",
  external_mentions: "Menciones externas",
  google_business_profile: "Perfil de Empresa en Google",
  x: "X",
  tiktok: "TikTok",
  reddit: "Reddit",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  onboarding: "Información aportada",
};

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function array(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function json(value: unknown, fallback: unknown): any {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown): string | null {
  const result = text(value);
  return result || null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isoDate(value: unknown): string | null {
  if (!(typeof value === "string" || value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function publicUrl(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch { return null; }
}

function sourceStatus(value: unknown): DashboardSourceStatus {
  switch (text(value).toLowerCase()) {
    case "evaluated":
    case "analyzed": return "analyzed";
    case "partial": return "partial";
    case "discovered": return "discovered";
    case "not_found": return "not_found";
    case "requires_auth":
    case "not_configured":
    case "disconnected":
    case "expired": return "requires_auth";
    case "unavailable": return "unavailable";
    case "not_relevant": return "not_relevant";
    case "error": return "error";
    default: return "unknown";
  }
}

function informationState(value: unknown, fallback: DashboardInformationState): DashboardInformationState {
  const normalized = text(value).toLowerCase();
  if (normalized === "strong" || normalized === "sufficient") return "sufficient";
  if (normalized === "moderate" || normalized === "limited" || normalized === "partial") return "limited";
  if (normalized === "weak" || normalized === "insufficient" || normalized === "unknown") return "unknown";
  return fallback;
}

function methodology(score: Record<string, any>, snapshot: Record<string, any>): string | null {
  const weights = record(json(score.weights, {}));
  return nullableText(snapshot.scoreMethodologyVersion) || nullableText(weights.scoreMethodologyVersion);
}

function sanitizedSummary(summary: string, businessName: string, total: number | null): string {
  if (total !== null) return summary;
  const escapedName = businessName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return summary
    .replace(new RegExp(`${escapedName} obtiene un Nuvra Score de \\d+\\/100 para su objetivo de ([^.]+)\\.`, "i"), `${businessName} fue analizado para su objetivo de $1.`)
    .replace(/obtiene un Nuvra Score de \d+\/100\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function evidenceProjection(input: {
  snapshot: Record<string, any>;
  mainConclusion: DashboardViewModel["canonicalDiagnosis"]["mainConclusion"];
  objective: string | null;
}): UserEvidenceView[] {
  const profile = record(input.snapshot.businessProfile);
  const trace = record(input.snapshot.analysisTrace);
  const selectedProblemId = nullableText(record(trace.prioritization).selectedProblemId);
  const candidates = array(profile.problemCandidates);
  const selectedCandidate = candidates.find((candidate) => text(record(candidate).id) === selectedProblemId) || null;
  const supporting = new Set(array(record(selectedCandidate).evidenceFor).map(text).filter(Boolean));
  const contradicting = new Set(array(record(selectedCandidate).evidenceAgainst).map(text).filter(Boolean));

  return array(profile.commercialEvidence)
    .filter((item) => text(record(item).text))
    .slice(0, 60)
    .map((item) => {
      const evidence = record(item);
      const source = text(evidence.source) || "other";
      const method = text(evidence.acquisitionMethod);
      const id = text(evidence.id);
      const polarity = text(evidence.polarity);
      const related = supporting.has(id) || contradicting.has(id);
      const state = informationState(record(evidence.sourceQuality).maxClaimStrength, evidence.kind === "DeclaredEvidence" ? "limited" : "unknown");
      return {
        observation: simplifyTechnicalText(text(evidence.text)),
        source: SOURCE_LABELS[source] || "Fuente pública",
        sourceType: ({
          official_api: "Fuente oficial",
          authenticated_integration: "Integración conectada",
          public_page: "Página pública",
          search_index: "Resultado de búsqueda",
          declared_by_user: "Información aportada",
        } as Record<string, string>)[method] || "Fuente pública",
        url: publicUrl(evidence.attribution),
        date: isoDate(evidence.timestamp),
        interpretation: polarity === "positive"
          ? "Esta señal respalda una fortaleza observada."
          : polarity === "negative"
            ? "Esta señal ayuda a evaluar una posible fricción."
            : "Esta señal aporta contexto para comprender el negocio.",
        relatedConclusion: related ? input.mainConclusion?.title || null : null,
        relationshipToGoal: related && input.objective ? `Se consideró por su relación con el objetivo “${input.objective}”.` : null,
        informationState: state,
        contradiction: contradicting.has(id) || record(evidence.corroboration).conflict === true
          ? "Esta señal contradice o limita parte de la conclusión y se conserva como contexto."
          : null,
      };
    });
}

export function createEmptyDashboardViewModel(): DashboardViewModel {
  const plan = getPlanSnapshot("FREE");
  return {
    isDemo: false,
    internalAccess: false,
    planTier: "FREE",
    plan: { tier: "FREE", label: plan.label, entitlements: { ...plan.entitlements } },
    business: { nombre: "", rubro: "", canEditDeclaredInformation: false },
    businessUnderstanding: { declared: [], observed: [], inferred: [], unknown: [] },
    analysisFreshness: { status: "no_analysis", needsReanalysis: false, changedFields: [], analyzedGoal: null, currentGoal: null, analyzedAt: null },
    analysis: { analysisId: null, date: null, status: "unknown", completion: "unknown", completedSuccessfully: false, hasPartialSources: false, methodologyVersion: null, comparableWithPrevious: false },
    intelligence: null,
    sources: [],
    score: null,
    diagnosis: null,
    canonicalDiagnosis: { mainConclusion: null, strengths: [], frictions: [], opportunities: [], unknowns: [], decisionInsight: null },
    strategy: null,
    canonicalStrategy: null,
    actions: [],
    actionsSummary: { immediateAction: null, pending: [], inProgress: [], completed: [], progress: { total: 0, completed: 0, percentage: 0 }, availableStates: ["pending", "in_progress", "completed"], relatedConclusion: null },
    history: [],
    evolutionSummary: { hasComparableAnalysis: false, previousComparableScore: null, currentScore: null, change: null },
    evolution: buildEvolutionView({ history: [], strategies: [] }),
    competitionSummary: { status: "unavailable", count: 0, validCompetitors: [], comparisonAvailable: false },
    competition: { entitled: false, status: "unavailable", context: null, comparable: [], probable: [], discardedCount: 0 },
    evidence: [],
  };
}

export function buildDashboardViewModel(rawValue: unknown, options: { isDemo?: boolean; competitorLimit?: number; canUpdateActions?: boolean; canUpdateBusiness?: boolean } = {}): DashboardViewModel {
  const raw = record(rawValue);
  const goal = record(array(raw.goals)[0]);
  const persistedScore = array(raw.scores)[0];
  const scoreRecord = record(persistedScore);
  const persistedDiagnosis = array(raw.diagnoses)[0];
  const diagnosisRecord = record(persistedDiagnosis);
  const persistedStrategy = array(raw.strategies)[0];
  const strategyRecord = record(persistedStrategy);
  const historyRecords = array(raw.analysisHistory);
  const latestHistory = record(historyRecords[0]);
  const snapshot = record(json(latestHistory.snapshot, {}));
  const intelligenceRecord = record(snapshot.intelligence);
  const rawSourceStatuses = record(intelligenceRecord.sourceStatuses);
  const rawSourceMessages = record(intelligenceRecord.sourceMessages);
  const planTier = normalizePlanTier(raw.planTier);
  const planSnapshot = getPlanSnapshot(planTier);
  const internalAccess = raw.internalAccess === true;
  const entitlements = Object.fromEntries(
    Object.keys(planSnapshot.entitlements).map((key) => [key, internalAccess ? true : planSnapshot.entitlements[key as EntitlementKey]]),
  ) as Record<EntitlementKey, boolean>;
  const competitorLimit = options.competitorLimit ?? Number.MAX_SAFE_INTEGER;

  const total = nullableNumber(scoreRecord.total);
  const snapshotDimensions = array(snapshot.dimensions);
  const persistedDimensions = array(scoreRecord.dimensions);
  const dimensionInput = snapshotDimensions.length ? snapshotDimensions : persistedDimensions;
  const persistedBySlug = new Map(persistedDimensions.map((item) => [text(record(item).slug), record(item)]));
  const dimensions = dimensionInput.map((item) => {
    const dimension = record(item);
    const slug = text(dimension.slug);
    const persisted = persistedBySlug.get(slug) || {};
    const rawPoints = nullableNumber(dimension.points ?? persisted.points);
    const points = rawPoints === null || rawPoints < 0 ? null : rawPoints;
    return {
      slug,
      name: text(persisted.name || dimension.name) || AREA_NAMES[slug] || slug,
      points,
      applicable: dimension.applicable === false ? false : points !== null,
      weight: nullableNumber(dimension.weight ?? persisted.weight),
      problems: array(json(persisted.problems ?? dimension.problems, [])).map(text).filter(Boolean),
    };
  }).filter((item) => item.slug);

  const bottleneckRaw = record(json(diagnosisRecord.bottleneck, {}));
  const bottleneck = text(bottleneckRaw.title) ? {
    dimension: text(bottleneckRaw.dimension),
    title: text(bottleneckRaw.title),
    explanation: text(bottleneckRaw.explanation),
    ...(text(bottleneckRaw.findingId) ? { findingId: text(bottleneckRaw.findingId) } : {}),
  } : null;
  const strengths = array(json(diagnosisRecord.strengths, [])).map((item) => ({ title: text(record(item).title), evidence: text(record(item).evidence) })).filter((item) => item.title);
  const weaknesses = array(json(diagnosisRecord.weaknesses, [])).map((item) => ({ title: text(record(item).title), evidence: text(record(item).evidence), ...(text(record(item).findingId) ? { findingId: text(record(item).findingId) } : {}) })).filter((item) => item.title);
  const opportunities = array(json(diagnosisRecord.opportunities, [])).map(text).filter(Boolean);
  const risks = array(json(diagnosisRecord.risks, [])).map(text).filter(Boolean);
  const priorities = array(json(diagnosisRecord.priorities, [])).map((item, index) => ({ title: text(record(item).title), reason: text(record(item).reason), order: nullableNumber(record(item).order) ?? index + 1 })).filter((item) => item.title);
  const objective = nullableText(goal.objetivo) || nullableText(strategyRecord.objetivo);
  const analyzedInputGoal = record(record(snapshot.analysisInput).goal);
  const analyzedProfileGoal = record(record(snapshot.businessProfile).goal);
  const analyzedObjective = nullableText(analyzedInputGoal.objetivo)
    || nullableText(strategyRecord.objetivo)
    || nullableText(scoreRecord.objetivo)
    || nullableText(analyzedProfileGoal.objective)
    || objective;
  const conclusionAudit = record(record(snapshot.analysisTrace).conclusionContributions);
  const problemAudit = record(array(conclusionAudit.problems)[0]);
  const conclusionState = informationState(problemAudit.sufficiency, bottleneck ? "limited" : "unknown");
  const isMeaningfulConclusion = bottleneck && !/todav[ií]a no|hace falta observar|sin informaci[oó]n/i.test(bottleneck.title);
  const presented = isMeaningfulConclusion ? presentProblem({ title: bottleneck.title, explanation: bottleneck.explanation, objective: analyzedObjective }) : null;
  const mainConclusion: DashboardViewModel["canonicalDiagnosis"]["mainConclusion"] = presented ? {
    ...presented,
    relationshipToGoal: presented.whyItMatters,
    source: "diagnosis.bottleneck",
    informationState: conclusionState,
  } : null;

  const sourceKeys = Array.from(new Set([...Object.keys(rawSourceStatuses), ...Object.keys(rawSourceMessages)]));
  const sources = sourceKeys.map((key) => {
    const status = sourceStatus(rawSourceStatuses[key]);
    return {
      key,
      label: SOURCE_LABELS[key] || key.replaceAll("_", " "),
      status,
      message: nullableText(rawSourceMessages[key]),
      hasEvidence: status === "analyzed" || status === "partial",
    };
  });
  const latestRun = record(array(raw.analysisRuns)[0]);
  const rawRunStatus = text(latestRun.status).toLowerCase();
  const hasPartialSources = rawRunStatus === "partial" || sources.some((source) => ["partial", "not_found", "requires_auth", "unavailable", "error"].includes(source.status));
  const completedSuccessfully = rawRunStatus === "completed" || rawRunStatus === "partial" || (!rawRunStatus && Boolean(latestHistory.id));
  const analysisStatus: DashboardViewModel["analysis"]["status"] = rawRunStatus === "queued"
    ? "pending"
    : rawRunStatus === "running"
      ? "running"
        : rawRunStatus === "failed"
          ? "failed"
        : rawRunStatus === "partial"
          ? "partial"
        : completedSuccessfully
          ? hasPartialSources ? "partial" : "completed"
          : "unknown";
  const methodologyVersion = methodology(scoreRecord, snapshot);
  // La vigencia pertenece al último resultado persistido, no a un intento posterior que pudo fallar.
  const analyzedAt = isoDate(latestHistory.createdAt) || isoDate(scoreRecord.createdAt);
  const latestAttemptAt = isoDate(latestRun.completedAt) || analyzedAt;
  const analysisFreshness = buildAnalysisFreshness({
    business: raw,
    currentGoal: goal,
    snapshot,
    score: scoreRecord,
    strategy: strategyRecord,
    analyzedAt,
    hasAnalysis: Boolean(latestHistory.id || scoreRecord.id || strategyRecord.id),
  });
  const history = historyRecords.map((item) => {
    const historyItem = record(item);
    const historySnapshot = record(json(historyItem.snapshot, {}));
    return {
      nuvraScoreTotal: nullableNumber(historyItem.nuvraScoreTotal),
      createdAt: isoDate(historyItem.createdAt) || "",
      scoreMethodologyVersion: nullableText(historySnapshot.scoreMethodologyVersion),
    };
  });
  const evolution = buildEvolutionView({ history: historyRecords, strategies: raw.strategies });

  const actionItems: DashboardActionView[] = array(strategyRecord.actions).map((item, index) => {
    const action = record(item);
    const details = decodeActionDecisionDetails(action.rationale);
    const status = normalizeActionStatus(action);
    const done = status === "completed";
    return {
      id: text(action.id) || `action-${index + 1}`,
      title: text(action.title),
      description: nullableText(action.description),
      impact: text(action.impact),
      difficulty: text(action.difficulty),
      estimatedTime: text(action.estimatedTime),
      rationale: details?.why || text(action.rationale),
      done,
      state: status,
      status,
      startedAt: isoDate(action.startedAt),
      completedAt: isoDate(action.completedAt),
      updatedAt: isoDate(action.updatedAt),
      canUpdateStatus: options.canUpdateActions === true && entitlements["tracking.progress"] === true && options.isDemo !== true,
      order: nullableNumber(action.order) ?? index + 1,
      findingIds: array(json(action.findingIds || action.relatedFindingIds, [])).map(text).filter(Boolean),
      dependencies: array(json(action.dependencies, [])).map(text).filter(Boolean),
      evidence: nullableText(action.evidence) || undefined,
      inference: nullableText(action.inference) || undefined,
      dimension: nullableText(action.dimension) ? friendlyActionArea(text(action.dimension)) : undefined,
      framework: nullableText(action.framework) || undefined,
      confidence: nullableText(action.confidence) || undefined,
      problem: nullableText(action.problem) || undefined,
      indicatorToImprove: nullableText(action.indicatorToImprove) || undefined,
      relatedConclusion: mainConclusion?.title || null,
      details,
    };
  }).filter((action) => action.title);
  const pendingActions = actionItems.filter((action) => action.state === "pending");
  const inProgressActions = actionItems.filter((action) => action.state === "in_progress");
  const completedActions = actionItems.filter((action) => action.state === "completed");
  const progress = actionProgress(actionItems);
  const primaryCausal = (inProgressActions[0] || pendingActions[0] || actionItems[0])?.details?.causal || null;

  const competitorRaw = record(intelligenceRecord.competitorSummary);
  const competitionEntitled = entitlements["analysis.competitors"] === true;
  const competitors: DashboardCompetitorView[] = (competitionEntitled ? array(competitorRaw.competitors) : [])
    .filter((item) => !["rejected", "uncertain"].includes(text(record(item).classification)))
    .slice(0, competitorLimit)
    .map((item) => {
      const competitor = record(item);
      return {
        name: text(competitor.name),
        competitorType: ["direct", "partial", "indirect"].includes(text(competitor.competitorType)) ? competitor.competitorType : "indirect",
        officialWebsite: nullableText(competitor.officialWebsite),
        officialSocialProfile: nullableText(competitor.officialSocialProfile),
        location: nullableText(competitor.location) || undefined,
        rationale: nullableText(competitor.rationale) || undefined,
        classification: ["confirmed_competitor", "probable_competitor", "uncertain", "rejected"].includes(text(competitor.classification)) ? competitor.classification : undefined,
      };
    });
  const externalMentionsRaw = record(intelligenceRecord.externalMentionsSummary);
  const externalMentions: DashboardExternalMentionsSummary | null = Object.keys(externalMentionsRaw).length ? {
    mentions: array(externalMentionsRaw.mentions).map((item) => {
      const mention = record(item);
      return {
        url: publicUrl(mention.url) || "",
        title: text(mention.title),
        mentionType: text(mention.mentionType),
        source: text(mention.source),
        sentiment: text(mention.sentiment) || "unknown",
      };
    }).filter((mention) => mention.title || mention.url),
    totalAccepted: nullableNumber(externalMentionsRaw.totalAccepted),
    totalFound: nullableNumber(externalMentionsRaw.totalFound),
    totalRejected: nullableNumber(externalMentionsRaw.totalRejected),
    byType: Object.fromEntries(Object.entries(record(externalMentionsRaw.byType)).filter(([, value]) => typeof value === "number")) as Record<string, number>,
  } : null;
  const competitorSourceStatus = sourceStatus(rawSourceStatuses.competitor);
  const competitionStatus = competitors.length ? "available" : competitorSourceStatus === "analyzed" ? "limited" : "unavailable";
  const businessUnderstanding = buildBusinessUnderstandingView({ business: raw, goal, snapshot });
  const competition = buildCompetitionView({
    business: raw,
    profile: record(snapshot.businessProfile),
    summary: competitorRaw,
    objective,
    sourceStatus: competitorSourceStatus,
    entitled: competitionEntitled,
    limit: competitorLimit,
  });

  const unknowns = sources.filter((source) => !["analyzed", "not_relevant"].includes(source.status)).map((source) => {
    if (source.status === "requires_auth") return `${source.label} necesita autorización para ampliar la información.`;
    if (source.status === "unavailable" || source.status === "error") return `${source.label} no estuvo disponible durante este análisis.`;
    if (source.status === "not_found") return `No se encontró información verificable en ${source.label}.`;
    return `La información de ${source.label} es todavía parcial.`;
  });

  const viewModel: DashboardViewModel = {
    isDemo: options.isDemo === true,
    internalAccess,
    planTier,
    plan: { tier: planTier, label: planSnapshot.label, entitlements },
    business: {
      id: nullableText(raw.id) || undefined,
      organizationId: nullableText(raw.organizationId),
      nombre: text(raw.nombre),
      rubro: text(raw.rubro),
      description: nullableText(raw.descripcion),
      location: nullableText(raw.ubicacion),
      city: nullableText(raw.ciudad),
      country: nullableText(raw.pais),
      size: nullableText(raw.tamano),
      customerType: nullableText(raw.tipoCliente),
      targetAudience: nullableText(raw.publicoObjetivo),
      productsAndServices: nullableText(raw.productosServicios),
      averageTicket: nullableNumber(raw.ticketPromedio),
      employees: nullableText(raw.empleados),
      webUrl: nullableText(raw.webUrl),
      instagramHandle: nullableText(raw.instagramHandle),
      hasDeclaredNoWebsite: raw.noWebDeclared === true,
      hasDeclaredNoInstagram: raw.noInstagramDeclared === true,
      otherChannels: nullableText(raw.otrosCanales),
      channels: array(json(raw.canales, [])).map(text).filter(Boolean),
      monthlyRevenue: nullableNumber(raw.facturacion),
      monthlyCustomers: nullableNumber(raw.clientesMensuales),
      marketingInvestment: nullableNumber(raw.inversionMarketing),
      objetivo: objective || undefined,
      customObjective: nullableText(goal.objetivoCustom),
      timeframeDays: nullableNumber(goal.plazoDias),
      plazoLabel: nullableText(goal.plazoLabel) || undefined,
      magnitud: nullableNumber(goal.magnitud),
      updatedAt: isoDate(raw.updatedAt),
      canEditDeclaredInformation: options.canUpdateBusiness === true && options.isDemo !== true,
    },
    businessUnderstanding,
    analysisFreshness,
    analysis: {
      analysisId: nullableText(latestRun.id) || nullableText(latestHistory.id),
      date: latestAttemptAt,
      status: analysisStatus,
      completion: completedSuccessfully ? hasPartialSources ? "partial" : "complete" : "unknown",
      completedSuccessfully,
      hasPartialSources,
      methodologyVersion,
      comparableWithPrevious: evolution.hasComparison,
    },
    intelligence: Object.keys(intelligenceRecord).length ? {
      coverage: nullableNumber(intelligenceRecord.coverage),
      sourceStatuses: Object.fromEntries(Object.entries(rawSourceStatuses).map(([key, value]) => [key, sourceStatus(value)])),
      sourceMessages: Object.fromEntries(Object.entries(rawSourceMessages).map(([key, value]) => [key, text(value)])),
      discoveredInstagram: nullableText(intelligenceRecord.discoveredInstagram),
      competitorSummary: competitionEntitled && Object.keys(competitorRaw).length ? {
        competitors,
        totalValidated: nullableNumber(competitorRaw.totalValidated),
        totalCandidatesExtracted: nullableNumber(competitorRaw.totalCandidatesExtracted),
      } : null,
      externalMentionsSummary: externalMentions,
    } : null,
    sources,
    score: persistedScore ? {
      total,
      coverage: nullableNumber(intelligenceRecord.coverage),
      applicable: total !== null,
      evidenceState: total === null ? "unknown" : hasPartialSources ? "limited" : "sufficient",
      dimensions,
    } : null,
    diagnosis: persistedDiagnosis ? {
      summary: sanitizedSummary(text(diagnosisRecord.summary), text(raw.nombre), total),
      bottleneck,
      priorities: entitlements["diagnosis.full"] ? priorities : priorities.slice(0, 1),
      strengths: entitlements["diagnosis.full"] ? strengths : [],
      weaknesses: entitlements["diagnosis.full"] ? weaknesses : [],
      opportunities: entitlements["diagnosis.full"] ? opportunities : opportunities.slice(0, 1),
      risks: entitlements["diagnosis.full"] ? risks : [],
      engineType: nullableText(diagnosisRecord.engineType) || undefined,
    } : null,
    canonicalDiagnosis: {
      mainConclusion,
      strengths: entitlements["diagnosis.full"] ? strengths.map((item) => ({ ...item, source: "diagnosis.strengths" as const })) : [],
      frictions: entitlements["diagnosis.full"] ? weaknesses.map((item) => ({ title: item.title, evidence: item.evidence, source: "diagnosis.weaknesses" as const })) : [],
      opportunities: (entitlements["diagnosis.full"] ? opportunities : opportunities.slice(0, 1))
        .map((item) => ({ text: presentOpportunity(item), source: "diagnosis.opportunities" as const }))
        .filter((item) => item.text),
      unknowns,
      decisionInsight: primaryCausal ? {
        observation: primaryCausal.observation,
        hypothesis: primaryCausal.hypothesis,
        evidenceFor: primaryCausal.evidenceFor,
        evidenceAgainst: primaryCausal.evidenceAgainst,
        unknowns: primaryCausal.unknowns,
        decision: primaryCausal.decision,
        whyThisDecision: primaryCausal.whyThisDecision,
        alternativesNotPrioritized: primaryCausal.alternativesNotPrioritized,
        confidenceLabel: primaryCausal.confidenceLabel,
      } : null,
    },
    strategy: persistedStrategy ? {
      objetivo: text(strategyRecord.objetivo),
      situacionActual: sanitizedSummary(text(strategyRecord.situacionActual), text(raw.nombre), total),
      distanciaObjetivo: text(strategyRecord.distanciaObjetivo),
      principalProblema: mainConclusion?.title || text(strategyRecord.principalProblema),
      prioridades: array(json(strategyRecord.prioridades, [])).map(text).filter(Boolean),
      engineType: nullableText(strategyRecord.engineType) || undefined,
    } : null,
    canonicalStrategy: persistedStrategy ? {
      objective: analyzedObjective,
      problemOfOrigin: mainConclusion,
      direction: nullableText(strategyRecord.distanciaObjetivo),
      rationale: pendingActions[0]?.rationale || actionItems[0]?.rationale || mainConclusion?.relationshipToGoal || null,
      expectedResult: pendingActions[0]?.details?.expectedResult || actionItems[0]?.details?.expectedResult || analyzedObjective,
      kpi: pendingActions[0]?.details?.metric || pendingActions[0]?.indicatorToImprove || actionItems[0]?.details?.metric || actionItems[0]?.indicatorToImprove || null,
      horizon: nullableText(analyzedInputGoal.plazoLabel) || nullableText(analyzedProfileGoal.timeframeLabel) || (nullableNumber(scoreRecord.plazoDias) ? `${nullableNumber(scoreRecord.plazoDias)} días` : null),
      notPriority: primaryCausal?.alternativesNotPrioritized || [],
    } : null,
    actions: actionItems,
    actionsSummary: {
      immediateAction: inProgressActions[0] || pendingActions[0] || null,
      pending: pendingActions,
      inProgress: inProgressActions,
      completed: completedActions,
      progress,
      availableStates: ["pending", "in_progress", "completed"],
      relatedConclusion: mainConclusion,
    },
    history,
    evolutionSummary: {
      hasComparableAnalysis: evolution.hasComparison && evolution.globalDelta !== null,
      previousComparableScore: evolution.previousComparableAnalysis?.score ?? null,
      currentScore: evolution.currentAnalysis?.score ?? null,
      change: evolution.globalDelta,
    },
    evolution,
    competitionSummary: {
      status: competitionStatus,
      count: competitors.length,
      validCompetitors: competitors,
      comparisonAvailable: competitors.length > 0,
    },
    competition,
    evidence: [],
  };
  viewModel.evidence = evidenceProjection({ snapshot, mainConclusion, objective: analyzedObjective });
  return viewModel;
}

function friendlyActionArea(value: string) {
  const labels: Record<string, string> = {
    commercial_path: "Paso para comprar, reservar o consultar",
    local_discovery: "Presencia local",
    reputation: "Confianza y reseñas",
    offer: "Oferta y decisión",
    content: "Comunicación",
    retention: "Clientes que vuelven",
    channel_mix: "Origen de clientes",
    paid_test: "Prueba con inversión",
    measurement: "Medición",
  };
  return labels[value] || getFriendlyDimensionName(value, value);
}
