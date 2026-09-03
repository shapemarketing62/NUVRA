// PlatformDiscoveryPlan
// --------------------
// Decides which digital platforms are RELEVANT for a given business and
// in what ORDER to DISCOVER them. This is a thin orchestration layer that
// sits BEFORE the existing BusinessDiscoveryService and reuses the
// SourceRelevancePlanner to avoid duplicating business-relevance logic.
//
// Hard rules (see project guidance):
//   * Sources are NOT dimensions. An irrelevant platform must NOT be able
//     to penalize the final score.
//   * Sources ≠ observed evidence. A platform can be RELEVANT but produce
//     no candidates (e.g. provider unavailable, no results).
//   * No real network calls. The plan is fully deterministic and the
//     plan's consumers are responsible for actually running any
//     provider/search.

import { SourceRelevancePlanner, type PlannedSocialSource } from "../intelligence/social/source-relevance-planner.ts";
import type { SocialBusinessTarget, SocialPlatform } from "../intelligence/social/social-source-provider.ts";

export type DiscoverySurface = "social" | "local" | "search";
export type DiscoveryAction =
  | "skip"                // platform is NOT_RELEVANT for this business
  | "follow_cross_link"   // the validated web already links to it; do not search
  | "search_only"         // low budget; only run a `site:` query
  | "search_and_provider" // HIGH relevance; search + provider
  | "knowledge_only";     // cannot deep-analyze; only Marketing Knowledge

export interface PlatformDiscoveryEntry {
  /** Stable identifier for the platform surface. */
  surface: DiscoverySurface;
  /** Logical platform name (matches SocialPlatform when surface=social). */
  platform: SocialPlatform | "instagram" | "google_business_profile" | "reddit" | "pinterest" | "website";
  /** Relevance result (null when not a social platform or "website"). */
  relevance: PlannedSocialSource | null;
  /** Action the orchestrator should take for this platform. */
  action: DiscoveryAction;
  /** Lower = earlier. Tie-breakers are deterministic. */
  priority: number;
  /** Human-readable reason for the plan decision (used in AnalysisTrace). */
  reason: string;
  /** Per-platform cap on `site:` queries. */
  maxQueries: number;
  /** Per-platform timeout in ms for the discovery step. */
  timeoutMs: number;
  /** Whether this platform requires an authenticated provider to deep-analyze. */
  requiresAuth: boolean;
  /** Whether this platform can produce OBSERVED evidence at all (vs only knowledge). */
  observedCapable: boolean;
}

export interface PlatformDiscoveryPlan {
  generatedAt: string;
  entries: PlatformDiscoveryEntry[];
  /** Hard cap on total discovery queries across all platforms. */
  globalMaxQueries: number;
  /** Hard cap on total discovery time in ms across all platforms. */
  globalTimeoutMs: number;
  /** Max number of distinct platforms we will actually attempt (priority-ordered). */
  maxPlatforms: number;
}

export interface PlatformDiscoveryInput {
  /** Source-of-truth business target (industry, customerType, objective, declaredChannels). */
  target: SocialBusinessTarget;
  /** Whether the validated website has at least one outbound link to the platform. */
  webCrossLinkHints?: Partial<Record<string, boolean>>;
  /** Whether the user has declared a handle/URL for that platform. */
  declared?: Partial<Record<string, boolean>>;
  /** Budget overrides. */
  budget?: { globalMaxQueries?: number; globalTimeoutMs?: number; maxPlatforms?: number };
}

const DEFAULT_GLOBAL_MAX_QUERIES = 6;
const DEFAULT_GLOBAL_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_PLATFORMS = 4;

const LOW_QUERY_CAP = 1;
const MED_QUERY_CAP = 1;
const HIGH_QUERY_CAP = 2;

const SOCIAL_OBSERVED: Record<SocialPlatform, { observed: boolean; auth: boolean }> = {
  // Indexed public analysis is possible, but stable deep analysis needs
  // official authentication for these platforms.
  x:        { observed: true,  auth: true },
  tiktok:   { observed: true,  auth: true },
  reddit:   { observed: true,  auth: false },
  facebook: { observed: true,  auth: true },
  linkedin: { observed: true,  auth: true },
  youtube:  { observed: true,  auth: true },
};

const EXTENDED_PLATFORMS: Array<{ platform: string }> = [
  // Instagram is a first-class surface. It is not in
  // SourceRelevancePlanner (which only covers the SocialPlatform
  // union) but it is the single most common social profile for small
  // businesses. The plan therefore treats it as primary for B2C
  // local / ecommerce businesses, and as secondary (not relevant
  // for action) for B2B / non-visual businesses.
  { platform: "instagram" },
];

function instagramPriority(target: PlatformDiscoveryInput["target"], crossLinked: boolean, declared: boolean): "primary" | "secondary" | "optional" {
  if (declared || crossLinked) return "primary";
  const text = `${target.industry || ""} ${target.customerType || ""} ${target.objective || ""}`.toLowerCase();
  const b2b = /b2b|empresa|corporativ|profesional|consultor|estudio|industrial|distribuidor/.test(text);
  if (b2b) return "optional";
  return "primary";
}

function priorityFor(relevance: PlannedSocialSource | null, crossLinked: boolean, declared: boolean): number {
  if (!relevance) return 999;
  if (declared) return 0;
  if (crossLinked) return 1;
  if (relevance.priority === "primary") return 2;
  if (relevance.priority === "secondary") return 4;
  return 6;
}

function actionFor(entry: { relevance: PlannedSocialSource | null; crossLinked: boolean; declared: boolean; platform: string; observed: boolean; requiresAuth: boolean }): { action: DiscoveryAction; reason: string; maxQueries: number; timeoutMs: number } {
  if (entry.platform === "website") {
    // Website is special: it is the HUB, not a discovery target. The plan
    // intentionally returns "skip" so the orchestrator does not search for
    // the website via `site:` queries.
    return { action: "skip", reason: "website is the hub, not a discovery target", maxQueries: 0, timeoutMs: 0 };
  }
  if (entry.platform === "pinterest") {
    // Pinterest has no real provider / analyzer; only Marketing Knowledge.
    return { action: "knowledge_only", reason: "no real provider/analyzer; only Marketing Knowledge applies", maxQueries: 0, timeoutMs: 0 };
  }
  if (entry.platform === "reddit") {
    // Reddit is observation-only (no handle, no profile page in the
    // traditional sense). Always knowledge_only when not already
    // cross-linked from a validated page.
    if (entry.crossLinked) {
      return { action: "search_only", reason: "validated web cross-links to a Reddit thread/comment", maxQueries: LOW_QUERY_CAP, timeoutMs: 3_000 };
    }
    return { action: "knowledge_only", reason: "no provider profile and no validated cross-link", maxQueries: 0, timeoutMs: 0 };
  }
  if (entry.platform === "google_business_profile") {
    if (entry.crossLinked || entry.declared) {
      return { action: "search_and_provider", reason: "validated cross-link or declared location", maxQueries: LOW_QUERY_CAP, timeoutMs: 4_000 };
    }
    // No cross-link, no declared address: skip. A `site:google.com/maps`
    // query without an address/city is too noisy to be worth the budget.
    return { action: "skip", reason: "no cross-link and no declared location; budget reserved for higher-priority platforms", maxQueries: 0, timeoutMs: 0 };
  }

  // Regular social platforms.
  if (!entry.relevance?.relevant && !entry.crossLinked) {
    return { action: "skip", reason: entry.relevance?.reasons?.join("; ") || "low relevance for this business", maxQueries: 0, timeoutMs: 0 };
  }
  if (entry.crossLinked) {
    return { action: "follow_cross_link", reason: "validated web cross-link provides ownership evidence", maxQueries: 0, timeoutMs: 0 };
  }
  if (entry.declared) {
    return { action: entry.requiresAuth ? "search_and_provider" : "search_only", reason: "user-declared handle", maxQueries: MED_QUERY_CAP, timeoutMs: 4_000 };
  }
  if (entry.relevance?.priority === "primary") {
    return { action: "search_and_provider", reason: "HIGH relevance for this business", maxQueries: HIGH_QUERY_CAP, timeoutMs: 5_000 };
  }
  if (entry.relevance?.priority === "secondary") {
    return { action: "search_only", reason: "MEDIUM relevance for this business", maxQueries: MED_QUERY_CAP, timeoutMs: 3_500 };
  }
  return { action: "skip", reason: "optional relevance and no signal; budget reserved for higher-priority platforms", maxQueries: 0, timeoutMs: 0 };
}

export class PlatformDiscoveryPlanner {
  static plan(input: PlatformDiscoveryInput): PlatformDiscoveryPlan {
    const relevance = SourceRelevancePlanner.plan(input.target);
    const byPlatform = new Map(relevance.map((r) => [r.platform, r]));
    const declared = input.declared || {};
    const cross = input.webCrossLinkHints || {};

    const entries: PlatformDiscoveryEntry[] = [];

    // 1) The website is the HUB. It is not a discovery target but the
    //    plan must still surface it so the trace can explain its
    //    treatment of the website.
    entries.push({
      surface: "search",
      platform: "website",
      relevance: null,
      action: "skip",
      priority: 0,
      reason: "website is the hub; existence is decided before discovery",
      maxQueries: 0,
      timeoutMs: 0,
      requiresAuth: false,
      observedCapable: true,
    });

    // 2) Google Business Profile — local presence.
    {
      const gbpDeclared = !!declared["google_business_profile"];
      const gbpCross = !!cross["google_business_profile"];
      const localRelevant = /local|cafe|cafeter|restaurante|salud|estetic|clinica|odont|gimnas|hotel|turismo|tienda|retail|barber|peluquer/i.test(input.target.industry || "");
      const decided = localRelevant
        ? { action: "search_and_provider" as const, reason: "La ubicación y el modelo comercial hacen relevante la presencia local.", maxQueries: 1, timeoutMs: 4_000 }
        : actionFor({ relevance: null, crossLinked: gbpCross, declared: gbpDeclared, platform: "google_business_profile", observed: true, requiresAuth: false });
      entries.push({
        surface: "local",
        platform: "google_business_profile",
        relevance: null,
        action: decided.action,
        priority: gbpCross ? 0 : gbpDeclared ? 1 : localRelevant ? 2 : 5,
        reason: decided.reason,
        maxQueries: decided.maxQueries,
        timeoutMs: decided.timeoutMs,
        requiresAuth: false,
        observedCapable: true,
      });
    }

    // 3) Regular social platforms from the existing planner.
    for (const r of relevance) {
      if (r.platform === "reddit") continue; // reddit is handled in the special-case block below
      const declaredHere = !!declared[r.platform];
      const crossLinked = !!cross[r.platform];
      const caps = SOCIAL_OBSERVED[r.platform];
      const decided = actionFor({ relevance: r, crossLinked, declared: declaredHere, platform: r.platform, observed: caps.observed, requiresAuth: caps.auth });
      entries.push({
        surface: "social",
        platform: r.platform,
        relevance: r,
        action: decided.action,
        priority: priorityFor(r, crossLinked, declaredHere),
        reason: decided.reason,
        maxQueries: decided.maxQueries,
        timeoutMs: decided.timeoutMs,
        requiresAuth: caps.auth,
        observedCapable: caps.observed,
      });
    }

    // 3b) Extended platforms (Instagram is a first-class social
    //     surface but lives outside SourceRelevancePlanner). We give
    //     it a deterministic priority based on declared/cross-linked
    //     hints, falling back to "primary for B2C local / ecommerce"
    //     and "secondary otherwise" via the existing rules in
    //     actionFor.
    for (const ext of EXTENDED_PLATFORMS) {
      const platform = ext.platform;
      const declaredHere = !!declared[platform];
      const crossLinked = !!cross[platform];
      const priority = instagramPriority(input.target, crossLinked, declaredHere);
      const pseudoRelevance: PlannedSocialSource = {
        platform: platform as unknown as SocialPlatform,
        priority,
        relevant: priority !== "optional",
        score: priority === "primary" ? 0.85 : 0.55,
        reasons: [`Instagram priority derived from industry + customer type (${priority})`],
      };
      const decided = actionFor({ relevance: pseudoRelevance, crossLinked, declared: declaredHere, platform, observed: true, requiresAuth: true });
      entries.push({
        surface: "social",
        platform: platform as unknown as SocialPlatform,
        relevance: pseudoRelevance,
        action: decided.action,
        priority: declaredHere ? 0 : crossLinked ? 1 : (priority === "primary" ? 3 : 5),
        reason: decided.reason,
        maxQueries: decided.maxQueries,
        timeoutMs: decided.timeoutMs,
        requiresAuth: true,
        observedCapable: true,
      });
    }

    // 4) Pinterest is knowledge-only.
    entries.push({
      surface: "social",
      platform: "pinterest",
      relevance: null,
      action: "knowledge_only",
      priority: 7,
      reason: "no real provider/analyzer; only Marketing Knowledge applies",
      maxQueries: 0,
      timeoutMs: 0,
      requiresAuth: false,
      observedCapable: false,
    });

    // 5) Reddit special-case: same social surface but no profile page.
    const redditRelevance = byPlatform.get("reddit") || null;
    {
      const declaredHere = !!declared["reddit"];
      const crossLinked = !!cross["reddit"];
      const decided = actionFor({ relevance: redditRelevance, crossLinked, declared: declaredHere, platform: "reddit", observed: true, requiresAuth: false });
      entries.push({
        surface: "social",
        platform: "reddit",
        relevance: redditRelevance,
        action: decided.action,
        priority: priorityFor(redditRelevance, crossLinked, declaredHere),
        reason: decided.reason,
        maxQueries: decided.maxQueries,
        timeoutMs: decided.timeoutMs,
        requiresAuth: false,
        observedCapable: true,
      });
    }

    // 6) Sort by priority (stable; insertion order is the tie-breaker).
    entries.sort((a, b) => a.priority - b.priority);

    return {
      generatedAt: new Date().toISOString(),
      entries,
      globalMaxQueries: input.budget?.globalMaxQueries ?? DEFAULT_GLOBAL_MAX_QUERIES,
      globalTimeoutMs: input.budget?.globalTimeoutMs ?? DEFAULT_GLOBAL_TIMEOUT_MS,
      maxPlatforms: input.budget?.maxPlatforms ?? DEFAULT_MAX_PLATFORMS,
    };
  }

  /**
   * Selects the actual entries to attempt, respecting the per-plan
   * budget. Entries with action "skip" or "knowledge_only" never count
   * against the budget.
   */
  static selectForExecution(plan: PlatformDiscoveryPlan): PlatformDiscoveryEntry[] {
    return plan.entries
      .filter((e) => e.action !== "skip" && e.action !== "knowledge_only")
      .slice(0, plan.maxPlatforms);
  }
}
