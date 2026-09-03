export interface RawFinding {
  type: "problem" | "strength" | "info";
  category: string;
  severity: string;
  title: string;
  description: string;
  evidence: string;
  pageUrl: string;
  source: string;
  confidence: string;
  impact?: string;
}

export type WebsiteJourneyIntent = "buy" | "reserve" | "contact" | "appointment" | "quote";

export interface PageActionSignal {
  label: string;
  href: string | null;
  intent: WebsiteJourneyIntent;
  kind: "link" | "button" | "submit";
  direct: boolean;
}

export interface PageFormSignal {
  action: string | null;
  method: string;
  fieldCount: number;
  requiredFieldCount: number;
  submitLabel: string | null;
  intent: WebsiteJourneyIntent;
}

export interface PageBrandSignals {
  logoReferences: string[];
  colors: string[];
  fonts: string[];
  imageCount: number;
  descriptiveImageCount: number;
  toneSamples: string[];
}

export interface RenderedTextSignal {
  tag: string;
  text: string;
  fontFamily: string;
  fontSizePx: number;
  fontWeight: number;
  lineHeightPx: number | null;
  letterSpacingPx: number | null;
  color: string;
  backgroundColor: string;
  widthPx: number;
  topPx: number;
}

export interface RenderedActionSignal {
  label: string;
  topPx: number;
  widthPx: number;
  heightPx: number;
  color: string;
  backgroundColor: string;
  visible: boolean;
}

export interface PageRenderedMarketingSignals {
  viewport: { width: number; height: number };
  bodyWidthPx: number;
  horizontalOverflowPx: number;
  sectionCount: number;
  landmarkCount: number;
  listCount: number;
  cardLikeGroupCount: number;
  visibleImageCount: number;
  imagesAboveFold: number;
  textSamples: RenderedTextSignal[];
  actionSamples: RenderedActionSignal[];
  dominantColors: string[];
  fontFamilies: string[];
  longParagraphCount: number;
}

export type WebsiteMarketingArea = "structure" | "hierarchy" | "color" | "typography" | "imagery" | "scannability" | "conversion";

export interface WebsiteMarketingAreaAnalysis {
  area: WebsiteMarketingArea;
  status: "evaluated" | "partial" | "not_evaluable";
  positiveSignals: string[];
  frictions: string[];
  evidence: string[];
  knowledgeRuleIds: string[];
}

export interface WebsiteMarketingIntelligence {
  context: {
    industry: string;
    customerType: string | null;
    objective: string | null;
    expectedPrimaryIntent: WebsiteJourneyIntent | null;
  };
  areas: WebsiteMarketingAreaAnalysis[];
  findings: RawFinding[];
  evaluatedAt: string;
  limitations: string[];
}

export type BrandIdentityAspect = "logo" | "colors" | "typography" | "photography" | "tone" | "crossChannelConsistency" | "visualRecognition" | "differentiation" | "proposalCoherence" | "temporalConsistency";

export interface BrandIdentitySourceEvidence {
  source: string;
  aspects: Partial<Record<BrandIdentityAspect, number>>;
  evidence: string[];
  contradictions?: string[];
  observedPeriods?: number;
}

export interface PageAnalysisData {
  url: string;
  title: string;
  metaDesc: string;
  h1s: string[];
  h2Count: number;
  wordCount: number;
  ctaCount: number;
  whatsappCount: number;
  formCount: number;
  formFields: number;
  navLinkCount: number;
  imgsTotal: number;
  imgsWithoutAlt: number;
  hasTrustSignals: boolean;
  hasContactInfo: boolean;
  loadTimeMs?: number;
  findings: RawFinding[];
  htmlLength: number;
  actionSignals: PageActionSignal[];
  formSignals: PageFormSignal[];
  brandSignals: PageBrandSignals;
  renderedMarketingSignals?: PageRenderedMarketingSignals;
  outboundLinks?: import("../discovery/website-cross-link-extractor.ts").WebsiteCrossLink[];
}

export interface WebsiteJourneyValidation {
  intent: WebsiteJourneyIntent;
  status: "validated" | "partial" | "blocked" | "not_found";
  steps: number | null;
  clarity: number;
  errors: string[];
  blockers: string[];
  consistency: "consistent" | "mixed" | "unknown";
  timeToActionMs: number | null;
  requiredFields: number | null;
  evidence: string[];
  urls: string[];
}

export interface BrandIdentityAnalysis {
  score: number;
  performanceScore: number;
  evidenceConfidence: number;
  confidence: "ALTA" | "MEDIA" | "BAJA";
  interpretation: "serious_or_unproven" | "weak" | "acceptable" | "good" | "very_good" | "exceptional";
  evidenceCeiling: number;
  coverage: {
    analyzedSources: string[];
    unknownSources: string[];
    evaluatedAspects: BrandIdentityAspect[];
    independentSourceCount: number;
    contradictionCount: number;
    observedPeriods: number;
  };
  strengths: string[];
  problems: string[];
  evidence: string[];
  limitations: string[];
}

export interface ScreenshotData {
  url: string;
  viewport: "desktop" | "mobile";
  path: string;
}

export interface WebsiteAnalysisResult {
  baseUrl: string;
  status: "completed" | "partial" | "failed";
  pagesAnalyzed: number;
  pages: PageAnalysisData[];
  findings: RawFinding[];
  screenshots: ScreenshotData[];
  performanceSummary: {
    avgLoadTimeMs: number;
    slowestPage: string | null;
  };
  crawledUrls: string[];
  journeys: WebsiteJourneyValidation[];
  brandIdentity: BrandIdentityAnalysis;
  marketingIntelligence: WebsiteMarketingIntelligence;
  errorMessage?: string;
  analyzedAt: string;
}
