// PlatformDiscoveryService
// ------------------------
// The single entry-point for the new platform-discovery flow. It is a
// thin orchestrator on top of the existing pieces:
//
//   * PlatformDiscoveryPlanner   — decides RELEVANCE + DISCOVERY priority.
//   * WebsiteCrossLinkExtractor   — pulls outbound social links from the
//                                  already-analyzed website (when the
//                                  website is the HUB).
//   * CrossLinkCorroboration     — applies the "1 page ≠ 2 sources" rule.
//   * BusinessDiscoveryService   — runs the actual `site:` queries for
//                                  the platforms the plan tells us to
//                                  search for, respecting the existing
//                                  budget and provider fallbacks.
//
// CRITICAL: This module is designed to be called as a PRE-step. It does
// NOT score anything, does NOT mark the analysis as failed if a
// provider is unavailable, and does NOT let an irrelevant platform
// penalize the business. The `SourceStatus` vocabulary is extended
// (NOT_RELEVANT, NOT_ATTEMPTED, NO_RESULTS, CANDIDATE_FOUND,
// VALIDATED, PROVIDER_UNAVAILABLE, REQUIRES_AUTH, ANALYZED,
// NOT_EVALUABLE) and the existing `business-intelligence-layer.ts` is
// the single source of truth for turning these into the sourceStatuses
// that feed the score.

import { BusinessDiscoveryService, type DiscoveryResult, type DiscoveryQueryAttempt } from "./business-discovery-service.ts";
import { PlatformDiscoveryPlanner, type PlatformDiscoveryEntry, type PlatformDiscoveryPlan, type PlatformDiscoveryInput } from "./platform-discovery-planner.ts";
import { WebsiteCrossLinkExtractor, type WebsiteCrossLink } from "./website-cross-link-extractor.ts";
import { CrossLinkCorroboration, type PlatformCorroboration } from "./cross-link-corroboration.ts";
import type { SocialPlatform } from "../intelligence/social/social-source-provider.ts";
import type { BusinessEntityTarget } from "./entity-matcher.ts";
import type { SourceEvidence, SourceType } from "../intelligence/source-analyzer.ts";

function toBusinessEntityTarget(t: PlatformDiscoveryInput["target"]): BusinessEntityTarget {
  return {
    name: t.name,
    category: t.industry || undefined,
    location: t.location || undefined,
    tipoCliente: t.customerType || undefined,
    declaredWebUrl: t.website || undefined,
  };
}export type PlatformStatus =
  | "NOT_RELEVANT"        // Platform is irrelevant for this business type.
  | "NOT_ATTEMPTED"       // Budget exhausted or skipped intentionally.
  | "NO_RESULTS"          // Search ran, returned 0 candidates.
  | "CANDIDATE_FOUND"     // Candidates exist but ownership not yet confirmed.
  | "VALIDATED"           // Cross-link from validated web OR confirmed match.
  | "PROVIDER_UNAVAILABLE"// Search provider failed (Tavily & DDG).
  | "REQUIRES_AUTH"       // Platform needs auth to deep-analyze.
  | "ANALYZED"            // Validated + analyzed by a public-content analyzer.
  | "NOT_EVALUABLE"       // Platform is knowledge-only (e.g. Pinterest).
  | "INCONSISTENT";       // Cross-link disagrees (two URLs to the same platform).

export interface PlatformDiscoveryReportEntry {
  platform: string;
  status: PlatformStatus;
  /** Resolved platform URL (when status ≥ CANDIDATE_FOUND). */
  url?: string;
  /** Short human-readable reason that explains the status. */
  reason: string;
  /** Plan decision that led to this entry. */
  planEntry: PlatformDiscoveryEntry;
  /** Cross-link corroboration, if any. */
  crossLink?: PlatformCorroboration;
  /** Query attempts that targeted this platform (subset of the global list). */
  queryAttempts?: DiscoveryQueryAttempt[];
  analyzer?: { sourceStatus: string; evidenceCount: number; coverage: number; acquisitionMethods: string[] };
}

export interface PlatformDiscoveryReport {
  generatedAt: string;
  plan: PlatformDiscoveryPlan;
  entries: PlatformDiscoveryReportEntry[];
  /** Discovery result the existing service produced, if it was run. */
  rawDiscovery?: DiscoveryResult;
  /** Total time spent in the discovery step, in ms. */
  durationMs: number;
  /** Whether the provider was unavailable for at least one search. */
  hadProviderFailure: boolean;
}

export interface PlatformDiscoveryServiceInput extends PlatformDiscoveryInput {
  /** Validated website pages (URL + raw HTML) for cross-link extraction.
   *  This is the legacy path. The BI layer prefers the explicit
   *  `crossLinks` field, which lets it pass the data already collected
   *  by the page analyzer without re-parsing HTML. */
  websitePages?: Array<{ url: string; html: string }>;
  /** Pre-computed cross-links from the website analyzer. When this is
   *  provided, the service skips the HTML re-parse and uses these
   *  links directly. This is the path used in production. */
  crossLinks?: WebsiteCrossLink[];
  /** Known hostname of the business (used by the cross-link filter). */
  businessHost?: string;
  /** Abort signal forwarded to the search provider. */
  signal?: AbortSignal;
  /** Optional: inject a BusinessDiscoveryService (for tests). */
  discoveryService?: Pick<BusinessDiscoveryService, "discover">;
  /** Optional: an already-computed DiscoveryResult. When provided,
   *  PlatformDiscoveryService will NOT call the search provider
   *  itself; the pipeline's existing run-analysis already called
   *  BusinessDiscoveryService.discover. This is the path used in
   *  production to avoid double Tavily / double DDG. */
  _prebuiltDiscovery?: DiscoveryResult;
  /** Cross-links are ownership evidence only when their source website was validated. */
  officialWebsiteValidated?: boolean;
  /** Results already produced by real source analyzers in this analysis run. */
  sourceEvidence?: Partial<Record<SourceType, SourceEvidence>>;
}

function platformFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (host.includes("instagram.com")) return "instagram";
    if (host.includes("tiktok.com")) return "tiktok";
    if (host.includes("facebook.com")) return "facebook";
    if (host.includes("linkedin.com")) return "linkedin";
    if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
    if (host === "x.com" || host === "twitter.com") return "x";
    if (host.includes("reddit.com")) return "reddit";
    if (host.includes("pinterest.com")) return "pinterest";
    if (host.includes("google.") || host.includes("g.page") || host.includes("goo.gl")) return "google_business_profile";
    return host;
  } catch {
    return "other";
  }
}

function mapProviderFailure(attempts: DiscoveryQueryAttempt[]): boolean {
  return attempts.some((a) => a.status === "provider_unavailable");
}

export class PlatformDiscoveryService {
  /**
   * Run the new platform-discovery flow. The function is deterministic
   * (no real network) when:
   *   * `websitePages` is supplied (cross-links are extracted from them),
   *   * AND the injected `discoveryService` is a fake.
   *
   * The default path uses the real `BusinessDiscoveryService` which may
   * call the network; tests must inject a fake.
   */
  static async run(input: PlatformDiscoveryServiceInput): Promise<PlatformDiscoveryReport> {
    const t0 = Date.now();
    // Two paths to populate cross-links:
    //   1) `input.crossLinks` (preferred) — pre-computed by the BI
    //      layer from `PageAnalysisData.outboundLinks`. Zero re-parse.
    //   2) `input.websitePages` (legacy) — raw HTML, used by tests.
    const extractedCrossLinks: WebsiteCrossLink[] = input.crossLinks && input.crossLinks.length
      ? input.crossLinks
      : (input.websitePages?.length ? WebsiteCrossLinkExtractor.extract(input.websitePages, input.businessHost) : []);
    const crossLinks = input.officialWebsiteValidated === true ? extractedCrossLinks : [];
    const corroboration = CrossLinkCorroboration.evaluate({ links: crossLinks, businessName: input.target.name });

    // 1) Build the plan with cross-link hints so HIGH-relevance platforms
    //    that the website already links to skip the search step.
    const crossHints: Partial<Record<string, boolean>> = {};
    for (const c of corroboration) {
      if (c.level === "strong" || c.level === "single_page") crossHints[c.platform] = true;
    }
    const declared: Partial<Record<string, boolean>> = { ...(input.declared || {}) };

    const plan = PlatformDiscoveryPlanner.plan({
      target: input.target,
      webCrossLinkHints: crossHints,
      declared,
      budget: input.budget,
    });
    const selectedForExecution = new Set(PlatformDiscoveryPlanner.selectForExecution(plan).map((entry) => String(entry.platform)));

    // 2) Decide whether we need to run the existing search. We only run
    //    it if at least one plan entry has action "search_only" or
    //    "search_and_provider" AND the caller did not already
    //    provide a prebuilt DiscoveryResult. When a prebuilt result
    //    is supplied, the pipeline's own run-analysis call has
    //    already done the search work; we reuse it instead of
    //    firing the same queries again.
    const needsSearch = plan.entries.some(
      (e) => selectedForExecution.has(String(e.platform)) && (e.action === "search_only" || e.action === "search_and_provider")
    );

    let discovery: DiscoveryResult | undefined = input._prebuiltDiscovery;
    if (needsSearch && !discovery) {
      const svc = input.discoveryService ?? new BusinessDiscoveryService();
      discovery = await svc.discover(toBusinessEntityTarget(input.target), { signal: input.signal });
    }
    // Instagram does not use the indexed-social adapter because its official
    // integration has a separate analyzer. When it remains unresolved after
    // the website phase, execute only its scoped queries and merge them with
    // the identity/local discovery already performed by the pipeline.
    const instagramPlan = plan.entries.find((entry) => entry.platform === "instagram");
    const instagramCross = corroboration.find((entry) => entry.platform === "instagram");
    const instagramEvidence = input.sourceEvidence?.instagram;
    const instagramAlreadyQueried = Boolean((instagramEvidence?.metadata?.acquisitionReport as any)?.queryCount);
    if (input.sourceEvidence && instagramPlan && selectedForExecution.has("instagram") && ["search_only", "search_and_provider"].includes(instagramPlan.action) && !instagramCross && !instagramAlreadyQueried) {
      const svc = input.discoveryService ?? new BusinessDiscoveryService();
      const location = String(input.target.location || "").split(",")[0]?.trim();
      const anchor = `"${input.target.name.replace(/[\r\n\t]+/g, " ").trim().slice(0, 90)}"`;
      const targeted = await svc.discover(toBusinessEntityTarget(input.target), {
        signal: input.signal,
        queries: ([
          { query: `${anchor} Instagram`, intent: "social" },
          { query: `site:instagram.com ${anchor}${location ? ` "${location}"` : ""}`, intent: "social" },
        ] satisfies Array<{ query: string; intent: "social" }>).slice(0, instagramPlan.maxQueries),
      });
      discovery = mergeDiscovery(discovery, targeted);
    }

    // 3) Build the per-platform report by merging: plan, cross-link
    //    corroboration, and (when present) the search result candidates.
    const reportEntries: PlatformDiscoveryReportEntry[] = [];
    const allQueryAttempts = discovery?.queryAttempts || [];
    const queryAttemptsByPlatform = bucketQueryAttemptsByPlatform(allQueryAttempts);

    for (const planEntry of plan.entries) {
      const platform = String(planEntry.platform);
      const cross = corroboration.find((c) => c.platform === planEntry.platform);
      const source = sourceForPlatform(platform, input.sourceEvidence);
      const analyzer = analyzerOutcome(source);
      const platformQueryAttempts = attemptsForPlatform(platform, allQueryAttempts, queryAttemptsByPlatform);

      // Resolve status using the documented precedence.
      let status: PlatformStatus = "NOT_ATTEMPTED";
      let url: string | undefined;
      let reason = planEntry.reason;

      if (platform === "website") {
        const webCandidates = (discovery?.allCandidates || []).filter((candidate) => candidate.type === "web");
        const confirmed = webCandidates.find((candidate) => candidate.status === "confirmed");
        const probable = webCandidates.find((candidate) => candidate.status === "probable");
        const websiteAttempts = platformQueryAttempts;
        const allUnavailable = websiteAttempts.length > 0 && websiteAttempts.every((attempt) => attempt.status === "provider_unavailable");
        url = input.target.website || confirmed?.url || probable?.url || undefined;
        if (analyzer.status === "ANALYZED" && input.officialWebsiteValidated !== false) {
          status = "ANALYZED";
          reason = "Sitio oficial validado y analizado.";
        } else if (confirmed) {
          status = "VALIDATED";
          reason = `Sitio oficial validado por identidad (${Math.round((confirmed.matchScore || 0) * 100)}%), pero no produjo análisis web completo.`;
        } else if (probable || input.target.website) {
          status = "CANDIDATE_FOUND";
          reason = "Se encontró una web posible, pero no alcanzó validación suficiente o no pudo analizarse.";
        } else if (allUnavailable) {
          status = "PROVIDER_UNAVAILABLE";
          reason = "No se pudo completar la búsqueda del sitio oficial.";
        } else if (websiteAttempts.length > 0) {
          status = "NO_RESULTS";
          reason = "La búsqueda del sitio oficial terminó sin candidatos validables.";
        } else {
          status = "NOT_ATTEMPTED";
          reason = "No se intentó descubrir el sitio oficial en este análisis.";
        }
      } else if (analyzer.status === "ANALYZED") {
        status = "ANALYZED";
        url = analyzer.url || cross?.urls[0];
        reason = "La plataforma fue validada y produjo evidencia pública analizable.";
      } else if (planEntry.action === "skip") {
        status = "NOT_RELEVANT";
        reason = planEntry.reason;
      } else if (planEntry.action === "knowledge_only") {
        status = "NOT_EVALUABLE";
        reason = planEntry.reason;
      } else if (!selectedForExecution.has(platform)) {
        status = "NOT_ATTEMPTED";
        reason = "No se intentó porque el presupuesto se reservó para plataformas más relevantes.";
      } else if (planEntry.action === "follow_cross_link") {
        // Cross-link is sufficient evidence of ownership.
        if (!cross || cross.urls.length === 0) {
          status = "NO_RESULTS";
          reason = "plan suggested follow_cross_link but no cross-link was found";
        } else if (cross.level === "inconsistent") {
          status = "INCONSISTENT";
          reason = cross.reasons.join("; ");
        } else {
          status = cross.level === "strong" ? "VALIDATED" : "VALIDATED";
          url = cross.urls[0];
          reason = cross.reasons.join("; ");
        }
      } else if (planEntry.action === "search_only" || planEntry.action === "search_and_provider") {
        const attempts = [...platformQueryAttempts, ...analyzer.attempts];
        const candidates = (discovery?.allCandidates || []).filter(
          (c) => platformFromUrl(c.url) === platform
        );
        if (cross && cross.level === "inconsistent") {
          status = "INCONSISTENT";
          reason = cross.reasons.join("; ");
        } else if (cross && (cross.level === "strong" || cross.level === "single_page")) {
          // Cross-link outranks search: still report cross-link as primary.
          status = "VALIDATED";
          url = cross.urls[0];
          reason = cross.reasons.join("; ");
        } else if (analyzer.status === "PROVIDER_UNAVAILABLE" || mapProviderFailure(attempts)) {
          status = "PROVIDER_UNAVAILABLE";
          reason = "search provider unavailable for this platform";
        } else if (analyzer.status === "VALIDATED") {
          status = "VALIDATED";
          url = analyzer.url;
          reason = "Perfil validado por el analizador público; no produjo evidencia suficiente para evaluar desempeño.";
        } else if (analyzer.status === "CANDIDATE_FOUND") {
          status = "CANDIDATE_FOUND";
          url = analyzer.url;
          reason = "Se encontró un perfil posible, pero no alcanzó validación de entidad.";
        } else if (candidates.length === 0) {
          status = "NO_RESULTS";
          reason = "search returned no candidates for this platform";
        } else {
          // A search candidate exists. Confirm it via existing entity
          // matcher: confirmed = VALIDATED, probable = CANDIDATE_FOUND.
          const confirmed = candidates.find((c) => c.status === "confirmed");
          const probable = candidates.find((c) => c.status === "probable");
          if (confirmed) {
            status = platform === "google_business_profile" ? "CANDIDATE_FOUND" : "VALIDATED";
            url = confirmed.url;
            reason = platform === "google_business_profile"
              ? `Se encontró una posible ficha local (${Math.round((confirmed.matchScore || 0) * 100)}%), pero Search no confirma datos de Google Business Profile.`
              : `confirmed by entity matcher (${Math.round((confirmed.matchScore || 0) * 100)}%)`;
          } else if (probable) {
            status = "CANDIDATE_FOUND";
            url = probable.url;
            reason = `probable by entity matcher (${Math.round((probable.matchScore || 0) * 100)}%)`;
          } else {
            status = "CANDIDATE_FOUND";
            url = candidates[0].url;
            reason = `candidate found (matchScore ${Math.round((candidates[0].matchScore || 0) * 100)}%)`;
          }
        }
      }

      // If the platform requires auth and we have not been able to
      // confirm ownership, mark as REQUIRES_AUTH so the layer can
      // request OAuth.
      if (planEntry.requiresAuth && status === "VALIDATED" && !url) {
        status = "REQUIRES_AUTH";
        reason = "platform requires authenticated provider to deep-analyze";
      }

      reportEntries.push({
        platform,
        status,
        url,
        reason,
        planEntry,
        crossLink: cross,
        queryAttempts: [...platformQueryAttempts, ...analyzer.attempts],
        analyzer: source ? {
          sourceStatus: source.status,
          evidenceCount: source.findings.length,
          coverage: source.coverage,
          acquisitionMethods: Array.isArray(source.metadata?.acquisitionMethods) ? source.metadata!.acquisitionMethods as string[] : [],
        } : undefined,
      });
    }

    const hadProviderFailure = (discovery?.queryAttempts || []).some(
      (a) => a.status === "provider_unavailable"
    ) || reportEntries.some((entry) => entry.status === "PROVIDER_UNAVAILABLE");

    return {
      generatedAt: new Date().toISOString(),
      plan,
      entries: reportEntries,
      rawDiscovery: discovery,
      durationMs: Date.now() - t0,
      hadProviderFailure,
    };
  }

  /**
   * Convenience: convert a report entry list into the
   * `sourceStatuses` map shape the existing
   * `BusinessIntelligenceLayer` already understands.
   *
   *   { web: "ANALYZED", instagram: "VALIDATED", tiktok: "NO_RESULTS", ... }
   */
  static toSourceStatuses(entries: PlatformDiscoveryReportEntry[]): Record<string, PlatformStatus> {
    const out: Record<string, PlatformStatus> = {};
    for (const e of entries) {
      if (e.platform === "website") {
        out.web = e.status === "VALIDATED" || e.status === "ANALYZED" ? "ANALYZED" : e.status;
        continue;
      }
      if (e.platform === "google_business_profile") {
        out.google_business_profile = e.status;
        continue;
      }
      out[e.platform] = e.status;
    }
    return out;
  }
}

function sourceForPlatform(platform: string, sources?: Partial<Record<SourceType, SourceEvidence>>): SourceEvidence | undefined {
  if (!sources) return undefined;
  if (platform === "website") return sources.web;
  if (platform === "google_business_profile") return sources.reviews;
  return sources[platform as SourceType];
}

function analyzerOutcome(source?: SourceEvidence): { status: PlatformStatus | "UNKNOWN"; url?: string; attempts: DiscoveryQueryAttempt[] } {
  if (!source) return { status: "UNKNOWN", attempts: [] };
  const metadata = source.metadata || {};
  const data = (source.data && typeof source.data === "object") ? source.data as Record<string, any> : {};
  const report = metadata.acquisitionReport as { queries?: string[] } | undefined;
  const queries = Array.isArray(report?.queries) ? report!.queries! : [];
  const finalStatus = String(metadata.finalStatus || data.status || "").toLowerCase();
  const providerUnavailable = source.status === "unavailable" && (
    finalStatus === "unavailable" ||
    (Array.isArray(metadata.limitations) && metadata.limitations.some((item) => /no configurad|provider|api key/i.test(String(item)))) ||
    (Array.isArray(data.limitations) && data.limitations.some((item: unknown) => /no configurad|provider|api key/i.test(String(item))))
  );
  const resultCount = Number(metadata.accountsFound || (data.identity ? 1 : 0));
  const attempts: DiscoveryQueryAttempt[] = queries.map((query) => ({ query, intent: "social", status: providerUnavailable ? "provider_unavailable" : resultCount ? "completed" : "no_results", resultCount }));
  const url = typeof metadata.platformDiscoveredUrl === "string" ? metadata.platformDiscoveredUrl : typeof data.identity?.profileUrl === "string" ? data.identity.profileUrl : undefined;
  if (source.status === "evaluated" && source.findings.length > 0) return { status: "ANALYZED", url, attempts };
  if (providerUnavailable) return { status: "PROVIDER_UNAVAILABLE", url, attempts };
  if (source.status === "requires_auth") return { status: "REQUIRES_AUTH", url, attempts };
  if (data.entityValidated === true || finalStatus === "discovered") return { status: "VALIDATED", url, attempts };
  if (data.identity || resultCount > 0) return { status: "CANDIDATE_FOUND", url, attempts };
  return { status: "UNKNOWN", url, attempts };
}

function bucketQueryAttemptsByPlatform(attempts: DiscoveryQueryAttempt[]): Map<string, DiscoveryQueryAttempt[]> {
  const out = new Map<string, DiscoveryQueryAttempt[]>();
  for (const a of attempts) {
    // Mirror BusinessDiscoveryService.classifyResultType so we attribute
    // a query to the platform it most likely targeted.
    const q = a.query.toLowerCase();
    let platform: string | null = null;
    if (q.includes("instagram.com") || /\binstagram\b/.test(q)) platform = "instagram";
    else if (q.includes("tiktok.com") || /\btiktok\b/.test(q)) platform = "tiktok";
    else if (q.includes("facebook.com") || /\bfacebook\b/.test(q)) platform = "facebook";
    else if (q.includes("linkedin.com") || /\blinkedin\b/.test(q)) platform = "linkedin";
    else if (q.includes("youtube.com") || q.includes("youtu.be") || /\byoutube\b/.test(q)) platform = "youtube";
    else if (q.includes("x.com") || q.includes("twitter.com") || /\btwitter\b/.test(q)) platform = "x";
    else if (q.includes("reddit.com")) platform = "reddit";
    else if (q.includes("pinterest.com")) platform = "pinterest";
    else if (q.includes("google.com/maps") || q.includes("g.page") || q.includes("maps.google")) platform = "google_business_profile";
    if (!platform) continue;
    (out.get(platform) || out.set(platform, []).get(platform)!).push(a);
  }
  return out;
}

function attemptsForPlatform(platform: string, attempts: DiscoveryQueryAttempt[], bucketed: Map<string, DiscoveryQueryAttempt[]>): DiscoveryQueryAttempt[] {
  if (platform === "website") return attempts.filter((attempt) => attempt.intent === "identity" || attempt.intent === "website");
  if (platform === "google_business_profile") return attempts.filter((attempt) => attempt.intent === "local_reviews");
  return bucketed.get(platform) || [];
}

function mergeDiscovery(base: DiscoveryResult | undefined, extra: DiscoveryResult): DiscoveryResult {
  if (!base) return extra;
  const allCandidates = Array.from(new Map([...base.allCandidates, ...extra.allCandidates].map((candidate) => [candidate.url, candidate])).values());
  const pick = (status: string) => allCandidates.filter((candidate) => candidate.status === status);
  return {
    ...base,
    primaryWebUrl: base.primaryWebUrl || extra.primaryWebUrl,
    primaryInstagram: base.primaryInstagram || extra.primaryInstagram,
    primaryGoogleMaps: base.primaryGoogleMaps || extra.primaryGoogleMaps,
    allCandidates,
    confirmedSources: pick("confirmed"),
    probableSources: pick("probable"),
    uncertainSources: pick("uncertain"),
    rejectedSources: pick("rejected"),
    status: base.status === "provider_unavailable" && extra.status === "provider_unavailable" ? "provider_unavailable" : base.status === "partial" || extra.status === "partial" ? "partial" : "completed",
    queryAttempts: [...(base.queryAttempts || []), ...(extra.queryAttempts || [])],
  };
}
