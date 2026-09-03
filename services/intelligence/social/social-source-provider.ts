import type { BrandIdentitySourceEvidence } from "../../website-analyzer/types.ts";
import type { PublicCommentInput } from "../reputation-intelligence.ts";

export type SocialPlatform = "x" | "tiktok" | "reddit" | "facebook" | "linkedin" | "youtube";
export type SocialProviderStatus = "not_found" | "discovered" | "partial" | "analyzed" | "requires_auth" | "unavailable" | "error";
export type AcquisitionMethod = "official_api" | "authenticated_integration" | "public_page" | "search_index" | "declared_by_user";
export type SocialContentOwner = "brand" | "customer" | "creator" | "unknown";

export interface SocialBusinessTarget {
  businessId: string;
  name: string;
  industry: string;
  location?: string | null;
  website?: string | null;
  phone?: string | null;
  customerType?: string | null;
  objective?: string | null;
  declaredChannels?: string | null;
  /** Profiles linked by a validated official website. */
  validatedPlatformLinks?: Partial<Record<SocialPlatform, string>>;
  /** Internal discovery budget selected by PlatformDiscoveryPlanner. */
  platformDiscoveryQueryCaps?: Partial<Record<SocialPlatform, number>>;
  platformDiscoveryGlobalMaxQueries?: number;
}

export interface SocialIdentityCandidate {
  displayName?: string | null;
  username?: string | null;
  description?: string | null;
  location?: string | null;
  category?: string | null;
  phone?: string | null;
  profileUrl: string;
  linkedUrls?: string[];
}

export interface SocialPublicContent {
  id: string;
  ownerType: SocialContentOwner;
  title?: string | null;
  text: string;
  url: string;
  publishedAt?: string | null;
  publicMetrics?: Record<string, number>;
  themes?: string[];
  callToAction?: string | null;
  responseFromBusiness?: { text: string; publishedAt?: string | null } | null;
  acquisitionMethod?: AcquisitionMethod;
  context?: Record<string, unknown>;
}

export interface SocialSourceCoverage {
  profile: boolean;
  bio: boolean;
  content: "none" | "indexed" | "partial" | "complete";
  comments: "none" | "indexed" | "partial" | "complete";
  mentions: "none" | "indexed" | "partial" | "complete";
  metrics: "none" | "public" | "authenticated";
}

export interface SocialRawCollection {
  identity: SocialIdentityCandidate | null;
  profile?: Record<string, unknown> | null;
  content?: SocialPublicContent[];
  comments?: PublicCommentInput[];
  mentions?: SocialPublicContent[];
  publicMetrics?: Record<string, number>;
  coverage?: number;
  limitations?: string[];
  mechanism: AcquisitionMethod;
  accessLevel?: "not_found" | "discovered" | "partial" | "analyzed" | "unavailable";
  sourceCoverage?: SocialSourceCoverage;
  acquisitionReport?: { queries: string[]; queryCount: number; cacheHit: boolean; durationMs: number; stopReason?: string };
  entityResolution?: { confidence: number; validated: boolean };
}

export interface SocialProviderResult {
  platform: SocialPlatform;
  status: SocialProviderStatus;
  identity: SocialIdentityCandidate | null;
  entityConfidence: number;
  entityValidated: boolean;
  profile: Record<string, unknown> | null;
  content: SocialPublicContent[];
  comments: PublicCommentInput[];
  mentions: SocialPublicContent[];
  publicMetrics: Record<string, number>;
  urls: string[];
  coverage: number;
  limitations: string[];
  errors: Array<{ type: string; message: string }>;
  acceptedContentIds: string[];
  rejectedContentIds: string[];
  brandIdentityEvidence?: BrandIdentitySourceEvidence;
  mechanism?: SocialRawCollection["mechanism"];
  acquisitionMethods: AcquisitionMethod[];
  sourceCoverage: SocialSourceCoverage;
  acquisitionReport?: SocialRawCollection["acquisitionReport"];
}

export interface SocialSourceProvider {
  readonly platform: SocialPlatform;
  readonly purpose: string;
  readonly timeoutMs: number;
  readonly maxAttempts: number;
  readonly requiresAuth: boolean;
  readonly limitations: readonly string[];
  isConfigured(): boolean;
  collect(target: SocialBusinessTarget, context?: { signal?: AbortSignal }): Promise<SocialProviderResult>;
}

export type SocialCollector = (target: SocialBusinessTarget, context?: { signal?: AbortSignal }) => Promise<SocialRawCollection>;

export function unavailableSocialResult(platform: SocialPlatform, limitations: readonly string[], requiresAuth = false): SocialProviderResult {
  return {
    platform,
    status: requiresAuth ? "requires_auth" : "unavailable",
    identity: null,
    entityConfidence: 0,
    entityValidated: false,
    profile: null,
    content: [],
    comments: [],
    mentions: [],
    publicMetrics: {},
    urls: [],
    coverage: 0,
    limitations: [...limitations],
    errors: [],
    acceptedContentIds: [],
    rejectedContentIds: [],
    acquisitionMethods: [],
    sourceCoverage: { profile: false, bio: false, content: "none", comments: "none", mentions: "none", metrics: "none" },
  };
}
