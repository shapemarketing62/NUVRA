export interface DiagnosticFinding {
  id: string;
  title: string;
  channel: string;
  whatWeSaw: string;
  whatItMeans: string;
  whyItMatters: string;
  recommendation: string;
  unknowns: string[];
  evidenceIds: string[];
  strength: "fuerte" | "parcial" | "por validar";
}

export interface ChannelInsight {
  channel: string;
  label: string;
  status: ChannelPresenceStatus;
  summary: string;
  evidenceCount: number;
  positiveCount: number;
  negativeCount: number;
  hasPrivateMetrics: boolean;
  privateMetricsStatus: "requires_connection" | "unavailable" | "available";
}

export type ChannelPresenceStatus = "analyzed" | "not_confirmed" | "not_found" | "not_available" | "not_prioritized";

export interface GoogleInsight {
  searchesAnalyzed: number;
  resultsAssociated: number;
  observedPosition?: number;
  summary: string;
}

export interface MapsInsight {
  status: ChannelPresenceStatus;
  name?: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  hours?: string;
  category?: string;
  summary: string;
}

export interface ReviewsInsight {
  status: ChannelPresenceStatus;
  rating?: number;
  reviewCount?: number;
  positiveThemes: string[];
  negativeThemes: string[];
  summary: string;
}

export interface InstagramInsight {
  status: ChannelPresenceStatus;
  handle?: string;
  bio?: string;
  link?: string;
  contentSummary: string;
  hasPrivateMetrics: boolean;
  privateMetricsStatus: "requires_connection" | "unavailable" | "available";
}

export interface TikTokInsight {
  status: ChannelPresenceStatus;
  handle?: string;
  contentSummary: string;
  hasPrivateMetrics: boolean;
  privateMetricsStatus: "requires_connection" | "unavailable" | "available";
}

export interface WebsiteInsight {
  status: ChannelPresenceStatus;
  pagesAnalyzed: number;
  loadTime?: string;
  mobileReady: boolean;
  httpsEnabled: boolean;
  ctaPresent: boolean;
  whatsappPresent: boolean;
  formPresent: boolean;
  servicesExplained: boolean;
  trustSignals: boolean;
  teamShown: boolean;
  locationShown: boolean;
  nextStepClear: boolean;
  summary: string;
  metrics: {
    ctaElements: number;
    whatsappElements: number;
    wordCount: number;
  };
}

export interface StrategyPhase {
  phase: string;
  timeframe: string;
  focus: string;
  actions: ActionDetail[];
}

export interface ActionDetail {
  what: string;
  where: string;
  why: string;
  how: string;
  metric: string;
  when: string;
  successCriteria: string;
}

export interface StrategyPlan {
  objective: string;
  whatWeFound: string;
  biggestOpportunity: string;
  priorities: string[];
  whatNotToDoYet: string[];
  phases: StrategyPhase[];
  measurementFocus: string;
}

export interface DiagnosisV2Output {
  engineType: "deterministic" | "ai";
  summary: string;
  findings: DiagnosticFinding[];
  channels: ChannelInsight[];
  google?: GoogleInsight;
  maps?: MapsInsight;
  reviews?: ReviewsInsight;
  instagram?: InstagramInsight;
  tiktok?: TikTokInsight;
  website?: WebsiteInsight;
  whatWeKnow: string[];
  whatWeDontKnow: string[];
  expandableEvidence: Array<{ id: string; text: string; source: string }>;
}

export interface StrategyV2Output {
  engineType: "deterministic" | "ai";
  objective: string;
  whatWeFound: string;
  biggestOpportunity: string;
  priorities: string[];
  whatNotToDoYet: string[];
  plan: StrategyPlan;
  actions: Array<{
    id: string;
    title: string;
    problem: string;
    importance: string;
    whatToDo: string;
    expectedResult: string;
    difficulty: string;
    estimatedTime: string;
    impact: string;
    done: boolean;
    order?: number;
  }>;
}
