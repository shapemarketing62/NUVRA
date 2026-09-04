import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/server/api-response";
import { authorizeBusiness, requireUser, buildAuthorizationDebug, buildCandidateConsistencyProbe } from "@/lib/server/authorization";
import { resolveAuthorizedBusinessForInternalAudit } from "@/lib/internal-analysis-audit-access";
import { roleCan } from "@/lib/access-policy";
import { randomUUID } from "crypto";

const MAX_IDENTIFIER_LENGTH = 100;
const MAX_BUSINESS_NAME_LENGTH = 160;

type InternalAuditSessionUser = {
  id: string;
  internalRole?: string | null;
  memberships: Array<{
    organizationId: string;
    role: string;
  }>;
};

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function array(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function safeJson(value: unknown): Record<string, any> {
  if (typeof value !== "string" || !value) return record(value);
  try { return record(JSON.parse(value)); } catch { return {}; }
}

function safeText(value: unknown, maxLength = 240): string | null {
  if (typeof value !== "string") return null;
  const result = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return result ? result.slice(0, maxLength) : null;
}

function safeUrl(value: unknown): string | null {
  const candidate = safeText(value, 2_000);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.username = "";
    url.password = "";
    url.hash = "";
    return url.toString();
  } catch { return null; }
}

function hostname(value: unknown): string | null {
  const url = safeUrl(value);
  if (!url) return null;
  try { return new URL(url).hostname; } catch { return null; }
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeFailure(value: unknown) {
  const failure = record(value);
  if (!Object.keys(failure).length) return null;
  return {
    stage: safeText(failure.stage, 80),
    errorType: safeText(failure.errorType || failure.category || failure.code, 80) || "provider_error",
    statusCode: finiteNumber(failure.statusCode),
    timedOut: Boolean(failure.timedOut || failure.category === "timeout"),
    attempts: finiteNumber(failure.attempts),
  };
}

function websiteFailure(value: unknown) {
  const message = safeText(value, 500)?.toLowerCase() || "";
  if (!message) return null;
  if (/timeout|timed out/.test(message)) return { errorType: "timeout", message: "El análisis del sitio superó el tiempo disponible." };
  if (/\b403\b|forbidden/.test(message)) return { errorType: "http_forbidden", message: "El sitio rechazó el acceso automatizado." };
  if (/\b429\b|rate.?limit/.test(message)) return { errorType: "rate_limited", message: "El sitio limitó temporalmente el acceso." };
  if (/\b5\d\d\b/.test(message)) return { errorType: "upstream_error", message: "El sitio respondió con un error temporal." };
  if (/dns|enotfound|name.*resolve/.test(message)) return { errorType: "dns_error", message: "No se pudo resolver el dominio del sitio." };
  if (/tls|certificate|ssl/.test(message)) return { errorType: "tls_error", message: "No se pudo establecer una conexión segura con el sitio." };
  if (/private|localhost|ssrf|blocked.*url/.test(message)) return { errorType: "blocked_url", message: "La URL fue rechazada por la política de seguridad." };
  return { errorType: "website_analysis_error", message: "El análisis del sitio no pudo completarse." };
}

function safeSignals(value: unknown) {
  const signals = record(value);
  return Object.fromEntries(Object.entries(signals)
    .filter(([, score]) => typeof score === "number" && Number.isFinite(score))
    .slice(0, 20));
}

async function resolveRequestedBusiness(req: NextRequest, user: InternalAuditSessionUser) {
  const businessId = req.nextUrl.searchParams.get("businessId") || req.nextUrl.searchParams.get("id");
  const exactName = req.nextUrl.searchParams.get("name")?.trim() || null;
  return resolveAuthorizedBusinessForInternalAudit({
    user,
    businessId,
    exactName,
    maxIdentifierLength: MAX_IDENTIFIER_LENGTH,
    maxBusinessNameLength: MAX_BUSINESS_NAME_LENGTH,
    findByExactName: async (name, authorizedOrganizationIds) => (await prisma.business.findMany({
      where: { nombre: name, organizationId: { in: authorizedOrganizationIds } },
      select: {
        id: true,
        nombre: true,
        organizationId: true,
        createdAt: true,
        analysisHistory: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { createdAt: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 11,
    })).flatMap((match) => match.organizationId ? [{
      id: match.id,
      name: match.nombre,
      organizationId: match.organizationId,
      createdAt: match.createdAt,
      latestAnalysisAt: match.analysisHistory[0]?.createdAt || null,
    }] : []),
    authorizeById: async (id) => {
      const access = await authorizeBusiness(id, "business.read");
      return access.ok ? { ok: true as const, access } : access;
    },
  });
}

export async function GET(req: NextRequest) {
  const requestId = randomUUID();
  const timestamp = new Date().toISOString();
  const serverPid = process.pid;
  try {
    const auth = await requireUser();
    if (!auth.ok) return apiError("unauthorized", 401);
    const resolved = await resolveRequestedBusiness(req, auth.user);
    if (!resolved.ok) {
      if (resolved.reason === "ambiguous_business_name") {
        const candidateDebug = await Promise.all(resolved.candidates.slice(0, 10).map((candidate) => buildAuthorizationDebug(candidate.id)));
        const consistencyProbe = await buildCandidateConsistencyProbe(
          resolved.candidates.slice(0, 10).map((c) => c.id),
          req.nextUrl.searchParams.get("name")?.trim() || "",
          auth.user.memberships
            .filter((m) => roleCan(m.role, "business.read"))
            .map((m) => m.organizationId)
        );
        return NextResponse.json({ requestId, timestamp, serverPid, error: resolved.reason, candidates: resolved.candidates, authorizationDebug: { requestedBy: "name", candidates: candidateDebug }, consistencyProbe }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
      }
      const status = resolved.reason === "unauthorized" ? 401 : resolved.reason === "validation_error" ? 400 : resolved.reason === "not_found" ? 404 : 403;
      const debug = await buildAuthorizationDebug(req.nextUrl.searchParams.get("businessId") || req.nextUrl.searchParams.get("id"));
      return NextResponse.json({ requestId, timestamp, serverPid, ...apiError(resolved.reason, status), authorizationDebug: { requestedBy: "businessId", ...debug } });
    }
    const access = resolved.access;
    const businessId = access.business.id;
    const authorizationDebug = await buildAuthorizationDebug(businessId);

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        scores: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, include: { dimensions: true } },
        analysisHistory: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 2 },
        analysisRuns: { orderBy: [{ queuedAt: "desc" }, { id: "desc" }], take: 1 },
        websites: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], include: { analyses: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 2 } } },
      },
    });
    if (!business) return apiError("not_found", 404);

    const latestHistory = business.analysisHistory[0];
    const snapshot = safeJson(latestHistory?.snapshot);
    const trace = record(snapshot.analysisTrace);
    const discovery = record(trace.discovery);
    const analysisAudit = record(snapshot.analysisAudit);
    const sourceAudit = record(analysisAudit.sources);
    const intelligence = record(snapshot.intelligence);
    const sourceStatuses = record(intelligence.sourceStatuses);
    const platformTrace = Object.keys(record(trace.platformDiscovery)).length
      ? record(trace.platformDiscovery)
      : record(record(intelligence.platformDiscovery).report);
    const latestRun = business.analysisRuns[0];
    const runResult = safeJson(latestRun?.result);
    const websiteAnalyses = business.websites.flatMap((website) => website.analyses.map((analysis) => ({ ...analysis, url: website.url })));
    const selectedWebsiteAnalysis = websiteAnalyses.find((analysis) => analysis.id === latestHistory?.websiteAnalysisId)
      || websiteAnalyses.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
      || null;
    const discoveryQueries = array(discovery.queries);
    const providerAttempts = discoveryQueries.flatMap((query) => array(record(query).providers));
    const scoreTrace = record(trace.scoreExplanation);
    const tracedDimensions = array(scoreTrace.dimensions);
    const persistedScore = business.scores[0];
    const requiredSourceKeys = ["web", "search", "reviews", "external_mentions", "instagram", "tiktok", "google_local", "competitor"];
    const allSourceKeys = Array.from(new Set([...requiredSourceKeys, ...Object.keys(sourceStatuses), ...Object.keys(sourceAudit)]));
    const statusFor = (source: string) => source === "google_local"
      ? sourceStatuses.google_business_profile || sourceStatuses.reviews || "unknown"
      : sourceStatuses[source] || "unknown";
    const auditFor = (source: string) => record(sourceAudit[source === "google_local" ? "reviews" : source]);

    const response = {
      requestId,
      timestamp,
      serverPid,
      deployment: {
        commitSha: safeText(process.env.RAILWAY_GIT_COMMIT_SHA || process.env.COMMIT_SHA, 40) || "unknown",
        buildDate: safeText(process.env.BUILD_DATE, 80) || "unknown",
        environment: safeText(process.env.APP_ENV || process.env.NODE_ENV, 40) || "unknown",
      },
      business: { businessId: business.id, businessName: business.nombre },
      analysis: {
        analysisRunId: latestRun?.id || null,
        analysisHistoryId: latestHistory?.id || null,
        previousHistoryId: business.analysisHistory[1]?.id || null,
        createdAt: latestRun?.queuedAt || null,
        queuedAt: latestRun?.queuedAt || null,
        startedAt: latestRun?.startedAt || null,
        finishedAt: latestRun?.completedAt || null,
        runStatus: latestRun?.status || null,
        historyCreatedAt: latestHistory?.createdAt || null,
        methodologyVersion: safeText(snapshot.scoreMethodologyVersion, 80),
        whetherLatestHistoryIsSelected: Boolean(latestHistory),
        selectionRule: "createdAt_desc_id_desc",
        failure: safeFailure(runResult.internalFailure),
      },
      providers: {
        tavilyConfigured: Boolean(process.env.TAVILY_API_KEY),
        tavilyAttempted: providerAttempts.some((attempt) => record(attempt).provider === "tavily"),
        googlePlacesConfigured: Boolean(process.env.GOOGLE_PLACES_API_KEY),
        ddgAvailable: true,
        ddgAttempted: providerAttempts.some((attempt) => record(attempt).provider === "duckduckgo"),
        playwright: {
          runtimeIncluded: Boolean(process.env.PLAYWRIGHT_BROWSERS_PATH),
          attempted: Boolean(selectedWebsiteAnalysis),
          status: selectedWebsiteAnalysis?.status || "not_attempted",
        },
      },
      discovery: {
        status: safeText(discovery.status, 60) || "unknown",
        attempts: discoveryQueries.slice(0, 30).flatMap((value) => {
          const query = record(value);
          const providers = array(query.providers);
          const attempts = providers.length ? providers : [{ provider: "unknown", status: query.status, errorType: query.errorType }];
          return attempts.slice(0, 4).map((providerValue) => {
            const provider = record(providerValue);
            return {
            query: safeText(query.query, 240),
            intent: safeText(query.intent, 80),
            provider: safeText(provider.provider, 40),
            status: safeText(provider.status || query.status, 60),
            resultCount: finiteNumber(query.resultCount) || 0,
            errorType: safeText(provider.errorType || query.errorType, 80),
            };
          });
        }),
      },
      candidates: array(discovery.candidates).slice(0, 60).map((value) => {
        const candidate = record(value);
        const url = safeUrl(candidate.url);
        return {
          title: safeText(candidate.title, 160),
          hostname: hostname(url),
          url,
          type: safeText(candidate.type, 50),
          decision: safeText(candidate.status, 50),
          reason: safeText(candidate.reason, 240),
          matchScore: finiteNumber(candidate.matchScore),
          signals: safeSignals(candidate.signals),
        };
      }),
      website: selectedWebsiteAnalysis ? {
        primaryWebUrl: safeUrl(discovery.primaryWebUrl || business.webUrl || business.websites[0]?.url),
        selectedAnalysisUrl: safeUrl(selectedWebsiteAnalysis.url),
        analysisId: selectedWebsiteAnalysis.id,
        status: selectedWebsiteAnalysis.status,
        pagesAnalyzed: selectedWebsiteAnalysis.pagesAnalyzed,
        httpStatus: finiteNumber(record(record(sourceAudit.web).failure).statusCode),
        result: selectedWebsiteAnalysis.pagesAnalyzed > 0 ? "pages_analyzed" : selectedWebsiteAnalysis.status === "failed" ? "failed" : "no_pages",
        failure: websiteFailure(selectedWebsiteAnalysis.errorMessage),
        createdAt: selectedWebsiteAnalysis.createdAt,
        completedAt: selectedWebsiteAnalysis.completedAt,
      } : null,
      platforms: {
        entries: array(platformTrace.entries).slice(0, 20).map((value) => {
          const entry = record(value);
          return {
            platform: safeText(entry.platform, 50),
            status: safeText(entry.status, 50),
            url: safeUrl(entry.url),
            crossLinkLevel: safeText(entry.crossLinkLevel, 50),
            crossLinkUrls: array(entry.crossLinkUrls).map(safeUrl).filter(Boolean).slice(0, 10),
            analyzerStatus: safeText(entry.analyzerStatus, 50),
            evidenceCount: finiteNumber(entry.evidenceCount) || 0,
          };
        }),
      },
      evidence: {
        totalFindings: finiteNumber(record(analysisAudit.survivingEvidence).totalFindings) || 0,
        sources: Object.fromEntries(allSourceKeys.map((source) => [source, {
          status: safeText(statusFor(source), 50) || "unknown",
          findingCount: array(auditFor(source).findings).length,
          execution: (() => {
            const execution = record(auditFor(source).execution);
            return {
              durationMs: finiteNumber(execution.durationMs),
              attempts: finiteNumber(execution.attempts),
              timedOut: Boolean(execution.timedOut),
            };
          })(),
          failure: safeFailure(auditFor(source).failure),
        }])),
        performanceFindings: Object.entries(sourceAudit).flatMap(([source, rawSource]) => array(record(rawSource).findings).map((rawFinding) => {
          const finding = record(rawFinding);
          return {
            source,
            id: safeText(finding.id, 120),
            type: safeText(finding.type, 40),
            category: safeText(finding.category, 60),
            evidence: safeText(finding.evidence, 240),
            url: safeUrl(finding.attribution),
          };
        })).slice(0, 100),
        dimensions: (tracedDimensions.length ? tracedDimensions : persistedScore?.dimensions || []).map((value) => {
          const dimension = record(value);
          return {
            slug: safeText(dimension.slug, 60),
            applicable: typeof dimension.applicable === "boolean" ? dimension.applicable : true,
            points: finiteNumber(dimension.points),
            findingCount: array(dimension.findingIds || dimension.findings).length,
          };
        }),
        evaluableAreaCount: tracedDimensions.filter((value) => record(value).applicable === true && finiteNumber(record(value).points) !== null).length
          || persistedScore?.dimensions.length
          || 0,
      },
      sourceStatuses: Object.fromEntries(allSourceKeys.map((source) => [source, safeText(statusFor(source), 50) || "unknown"])),
      authorizationDebug,
    };

    return NextResponse.json(response, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleApiError(error);
  }
}
