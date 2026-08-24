import type { Business } from "@prisma/client";

export type SourceType = "web" | "instagram" | "search" | "reviews" | "competitor" | "x" | "tiktok" | "reddit" | "facebook" | "linkedin" | "youtube" | "external_mentions" | "other";

export type SourceStatus = "evaluated" | "unavailable" | "not_relevant" | "requires_auth";

export interface SourceEvidence {
  source: SourceType;
  status: SourceStatus;
  data: unknown;
  findings: EvidenceFinding[];
  confidence: "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE";
  coverage: number; // 0-100
  evaluatedAt: Date;
  requiresAuth: boolean;
  metadata?: Record<string, unknown>;
}

export interface EvidenceFinding {
  id: string;
  category: string;
  type: "positive" | "negative" | "neutral";
  impact: "high" | "medium" | "low";
  evidence: string;
  source: SourceType;
  attribution: string; // De dónde vino específicamente
  weight: number; // Cuánto pesa en el score final (0-1)
  confidence: "ALTA" | "MEDIA" | "BAJA";
  reputationEvidenceConfidence?: number;
  reputationTopic?: string;
  acquisitionMethod?: "official_api" | "authenticated_integration" | "public_page" | "search_index" | "declared_by_user";
}

export interface SourceRelevance {
  source: SourceType;
  relevant: boolean;
  reason: string;
  weight: number; // Cuánto contribuye a coverage total (0-1)
}

export interface SourceAnalysisContext {
  signal?: AbortSignal;
}

export abstract class SourceAnalyzer {
  abstract type: SourceType;
  abstract requiresAuth: boolean;
  abstract requiresPermission: boolean;

  abstract isAvailable(business: Business): boolean;
  abstract isRelevant(business: Business): SourceRelevance;
  abstract analyze(business: Business, context?: SourceAnalysisContext): Promise<SourceEvidence>;

  protected generateFinding(
    category: string,
    type: "positive" | "negative" | "neutral",
    impact: "high" | "medium" | "low",
    evidence: string,
    attribution: string,
    weight: number = 0.5,
    confidence: "ALTA" | "MEDIA" | "BAJA" = "MEDIA"
  ): EvidenceFinding {
    return {
      id: `${this.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      category,
      type,
      impact,
      evidence,
      source: this.type,
      attribution,
      weight,
      confidence,
    };
  }
}
