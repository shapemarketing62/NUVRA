export type KnowledgeEvidenceLevel = "OFFICIAL" | "OBSERVED" | "SPECULATIVE";
export type KnowledgeAuthorityLevel = "primary" | "research" | "practitioner";
export type KnowledgeDomain = "website" | "visual_design" | "conversion" | "accessibility" | "platform";
export type KnowledgePlatform = "instagram" | "google_business_profile" | "tiktok" | "linkedin" | "youtube" | "x" | "facebook" | "reddit" | "pinterest";

export interface KnowledgeSource {
  id: string;
  publisher: string;
  title: string;
  url: string;
  publishedAt: string | null;
  retrievedAt: string;
  type: "official_documentation" | "standard" | "research";
  authorityLevel: KnowledgeAuthorityLevel;
}

export interface KnowledgeRule {
  id: string;
  domain: KnowledgeDomain;
  platform?: KnowledgePlatform;
  surface?: string;
  category: string;
  principle: string;
  strategicMeaning: string;
  evidenceLevel: KnowledgeEvidenceLevel;
  confidence: "ALTA" | "MEDIA" | "BAJA";
  sourceId: string;
  sourceDate: string | null;
  validFrom: string;
  lastVerifiedAt: string;
  supersededAt: string | null;
  version: string;
  tags: string[];
}

export interface KnowledgeQuery {
  domain?: KnowledgeDomain;
  platform?: KnowledgePlatform;
  surface?: string;
  category?: string;
  tags?: string[];
  asOf?: Date;
  includeSpeculative?: boolean;
}

export interface KnowledgeMatch {
  rule: KnowledgeRule;
  source: KnowledgeSource;
}

export class MarketingKnowledgeEngine {
  private readonly rules: KnowledgeRule[];
  private readonly sources: KnowledgeSource[];

  constructor(rules: KnowledgeRule[], sources: KnowledgeSource[]) {
    this.rules = rules;
    this.sources = sources;
  }

  retrieve(query: KnowledgeQuery): KnowledgeMatch[] {
    const asOf = query.asOf || new Date();
    const sourceById = new Map(this.sources.map((source) => [source.id, source]));
    return this.rules.filter((rule) => {
      if (query.domain && rule.domain !== query.domain) return false;
      if (query.platform && rule.platform !== query.platform) return false;
      if (query.surface && rule.surface !== query.surface) return false;
      if (query.category && rule.category !== query.category) return false;
      if (!query.includeSpeculative && rule.evidenceLevel === "SPECULATIVE") return false;
      if (new Date(rule.validFrom) > asOf) return false;
      if (rule.supersededAt && new Date(rule.supersededAt) <= asOf) return false;
      if (query.tags?.length && !query.tags.some((tag) => rule.tags.includes(tag))) return false;
      return sourceById.has(rule.sourceId);
    }).map((rule) => ({ rule, source: sourceById.get(rule.sourceId)! }));
  }

  getRule(id: string, asOf = new Date()): KnowledgeMatch | null {
    return this.retrieve({ asOf, includeSpeculative: true }).find((match) => match.rule.id === id) || null;
  }
}
