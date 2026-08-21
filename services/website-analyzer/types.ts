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
  errorMessage?: string;
  analyzedAt: string;
}
