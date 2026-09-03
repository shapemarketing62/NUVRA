import { SearchProviderUnavailableError, SmartSearchProvider } from "../intelligence/search-source-analyzer.ts";
import type { SearchProvider, SearchResult } from "../intelligence/providers/search-provider.ts";
import {
  EntityMatcher,
} from "./entity-matcher.ts";
import type { CandidateSource, BusinessEntityTarget, DiscoveredSourceType } from "./entity-matcher.ts";
import { selectPrimaryInstagram } from "./source-selection.ts";
import { buildDiscoveryQueries, type DiscoveryQueryIntent } from "./discovery-query-builder.ts";

export type DiscoveryStatus = "completed" | "partial" | "no_results" | "provider_unavailable" | "not_attempted";

export interface DiscoveryQueryAttempt {
  query: string;
  intent: DiscoveryQueryIntent;
  status: "completed" | "no_results" | "provider_unavailable";
  resultCount: number;
  errorType?: string;
}

export interface DiscoveryResult {
  target: BusinessEntityTarget;
  primaryWebUrl: string | null;
  primaryInstagram: string | null;
  primaryGoogleMaps: string | null;
  allCandidates: CandidateSource[];
  confirmedSources: CandidateSource[];
  probableSources: CandidateSource[];
  uncertainSources: CandidateSource[];
  rejectedSources: CandidateSource[];
  status?: DiscoveryStatus;
  queryAttempts?: DiscoveryQueryAttempt[];
  discoveredAt: Date;
}

export class BusinessDiscoveryService {
  private searchProvider: SearchProvider;

  constructor(searchProvider: SearchProvider = new SmartSearchProvider()) {
    this.searchProvider = searchProvider;
  }

  /**
   * Descubre automáticamente fuentes públicas relevantes para un negocio.
   * Aplica agrupamiento por dominio/entidad para evitar doble conteo.
   */
  async discover(target: BusinessEntityTarget, context: { signal?: AbortSignal; intents?: DiscoveryQueryIntent[]; queries?: Array<{ query: string; intent: DiscoveryQueryIntent }> } = {}): Promise<DiscoveryResult> {
    console.log("[BUSINESS_DISCOVERY] Starting discovery for:", target.name, target.category || "", target.location || "");

    const rawResults: Array<{ result: SearchResult; query: string; intent: DiscoveryQueryIntent }> = [];
    const queryAttempts: DiscoveryQueryAttempt[] = [];
    const allowedIntents = context.intents ? new Set(context.intents) : null;
    const queries = (context.queries || buildDiscoveryQueries(target)).filter((query) => !allowedIntents || allowedIntents.has(query.intent));

    const mockBusiness: any = {
      id: "discovery-target",
      nombre: target.name,
      rubro: target.category || "",
      ubicacion: target.location || "",
    };

    await runWithConcurrency(queries, 3, async (item) => {
      if (context.signal?.aborted) throw Object.assign(new Error("discovery_canceled"), { name: "AbortError" });
      try {
        const results = await this.searchProvider.search(item.query, mockBusiness, { signal: context.signal });
        queryAttempts.push({ query: item.query, intent: item.intent, status: results.length ? "completed" : "no_results", resultCount: results.length });
        for (const result of results) rawResults.push({ result, query: item.query, intent: item.intent });
      } catch (error) {
        if (context.signal?.aborted) throw error;
        queryAttempts.push({ query: item.query, intent: item.intent, status: "provider_unavailable", resultCount: 0, errorType: error instanceof SearchProviderUnavailableError ? error.name : error instanceof Error ? error.name : "ProviderError" });
        console.warn(`[BUSINESS_DISCOVERY] Search query unavailable for "${item.query}":`, error instanceof Error ? error.name : "ProviderError");
      }
    });

    // 2. Clasificar candidatos brutos
    const rawCandidates: CandidateSource[] = [];
    for (const { result, query, intent } of rawResults) {
      if (!result.url) continue;
      const type = this.classifyResultType(result.url, result.title, result.snippet, intent);
      rawCandidates.push({
        title: result.title,
        url: result.url,
        snippet: result.snippet,
        type,
        metadata: { ...result.metadata, queries: [query], queryIntents: [intent] },
      });
    }

    // 3. Agrupar por Entidad / Dominio (Requisito 1: Evitar doble conteo)
    const groupedCandidates = this.groupCandidatesByDomainOrProfile(rawCandidates);

    // 4. Evaluar cada candidato agrupado con EntityMatcher
    const initiallyEvaluated = groupedCandidates.map((candidate) => EntityMatcher.evaluateCandidate(candidate, target));
    const corroboratedCandidates = this.addCrossSourceCorroboration(initiallyEvaluated);
    const evaluatedCandidates = corroboratedCandidates.map((candidate) => EntityMatcher.evaluateCandidate(candidate, target));

    // Ordenar por matchScore descendente
    evaluatedCandidates.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

    // 5. Filtrar por Status (Requisito 2: Tratamiento estricto de probable vs confirmed vs uncertain)
    const confirmedSources = evaluatedCandidates.filter((c) => c.status === "confirmed");
    const probableSources = evaluatedCandidates.filter((c) => c.status === "probable");
    const uncertainSources = evaluatedCandidates.filter((c) => c.status === "uncertain");
    const rejectedSources = evaluatedCandidates.filter((c) => c.status === "rejected");

    // Fuentes válidas para uso en analizadores (CONFIRMED y PROBABLE)
    const validSources = [...confirmedSources, ...probableSources];

    // Seleccionar sitios/perfiles principales de forma única priorizando la relación de entidad
    const bestWeb = this.selectBestWebUrl(validSources, target.declaredWebUrl);
    const bestInstagram = selectPrimaryInstagram(
      target.declaredInstagram,
      validSources.find((c) => c.type === "instagram")?.url,
    );
    const bestMaps = validSources.find((c) => c.type === "google_maps")?.url || null;
    const status = discoveryStatus(queryAttempts, evaluatedCandidates.length);

    console.log("[BUSINESS_DISCOVERY] Discovery completed:", {
      totalGroupedCandidates: evaluatedCandidates.length,
      confirmed: confirmedSources.length,
      probable: probableSources.length,
      uncertain: uncertainSources.length,
      rejected: rejectedSources.length,
      bestWeb,
      bestInstagram,
      bestMaps,
      status,
    });

    return {
      target,
      primaryWebUrl: bestWeb,
      primaryInstagram: bestInstagram,
      primaryGoogleMaps: bestMaps,
      allCandidates: evaluatedCandidates,
      confirmedSources,
      probableSources,
      uncertainSources,
      rejectedSources,
      status,
      queryAttempts: queryAttempts.sort((a, b) => queries.findIndex((item) => item.query === a.query) - queries.findIndex((item) => item.query === b.query)),
      discoveredAt: new Date(),
    };
  }

  /**
   * Selecciona el sitio web oficial principal respetando la prioridad de relación de entidad:
   * 1. Operación local oficial (ej: starbucks.com.ar)
   * 2. Marca global oficial (ej: starbucks.com)
   * 3. Sucursal específica
   * 4. Licenciatarios / sub-marcas (ej: starbucksathome.com) -> Solo secundario
   */
  private selectBestWebUrl(validSources: CandidateSource[], declaredUrl?: string): string | null {
    if (declaredUrl) return declaredUrl;

    const webCandidates = validSources.filter((c) => c.type === "web");
    if (webCandidates.length === 0) return null;

    const getPriority = (c: CandidateSource): number => {
      const rel = c.entityRelationship;
      if (rel === "local_operation" || rel === "primary_entity") return 4;
      if (rel === "brand_global") return 3;
      if (rel === "individual_location") return 2;
      if (rel === "licensed_business" || rel === "sub_brand") return 1;
      return 0;
    };

    const sorted = [...webCandidates].sort((a, b) => {
      const priorityDiff = getPriority(b) - getPriority(a);
      if (priorityDiff !== 0) return priorityDiff;
      return (b.matchScore || 0) - (a.matchScore || 0);
    });

    const top = sorted[0];
    try {
      const u = new URL(top.url);
      if (top.entityRelationship === "local_operation" || top.entityRelationship === "primary_entity" || top.entityRelationship === "brand_global") {
        return `${u.protocol}//${u.hostname}`;
      }
    } catch {}

    return top.url;
  }

  /**
   * Agrupa candidatos que pertenecen al mismo dominio o perfil social
   * para evitar doble conteo.
   */
  private groupCandidatesByDomainOrProfile(candidates: CandidateSource[]): CandidateSource[] {
    const entityGroups = new Map<string, { primary: CandidateSource; subResources: string[] }>();

    for (const c of candidates) {
      const key = this.getEntityKey(c);

      if (!entityGroups.has(key)) {
        entityGroups.set(key, { primary: c, subResources: [] });
      } else {
        const group = entityGroups.get(key)!;
        group.primary.metadata = mergeCandidateMetadata(group.primary.metadata, c.metadata);
        // Mantener la URL con menor longitud o mejor título como principal
        if (c.url.length < group.primary.url.length || (group.primary.url.includes("/local/") && !c.url.includes("/local/"))) {
          group.subResources.push(group.primary.url);
          group.primary = { ...c, metadata: mergeCandidateMetadata(c.metadata, group.primary.metadata) };
        } else {
          group.subResources.push(c.url);
        }
      }
    }

    const result: CandidateSource[] = [];
    for (const group of Array.from(entityGroups.values())) {
      const item = { ...group.primary };
      if (group.subResources.length > 0) {
        item.metadata = {
          ...item.metadata,
          subResources: Array.from(new Set(group.subResources)),
        };
      }
      result.push(item);
    }

    return result;
  }

  /**
   * Genera una clave única de entidad según el tipo de fuente.
   */
  private getEntityKey(candidate: CandidateSource): string {
    try {
      const parsed = new URL(candidate.url);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
      const path = parsed.pathname.toLowerCase().replace(/\/$/, "");

      if (candidate.type === "instagram") {
        const handle = path.split("/").filter(Boolean)[0] || "";
        return `instagram:${handle}`;
      }
      if (candidate.type === "facebook") {
        const handle = path.split("/").filter(Boolean)[0] || "";
        return `facebook:${handle}`;
      }
      if (candidate.type === "linkedin") {
        const company = path.split("/").filter(Boolean)[1] || path.split("/").filter(Boolean)[0] || "";
        return `linkedin:${company}`;
      }
      if (candidate.type === "x") {
        const handle = path.split("/").filter(Boolean)[0] || "";
        return `x:${handle}`;
      }
      if (candidate.type === "google_maps") {
        return `google_maps:${host}${path.slice(0, 20)}`;
      }
      if (candidate.type === "mentions" || candidate.type === "competitors") {
        return `${candidate.type}:${host}${path.slice(0, 120)}`;
      }

      // Para páginas web generales, agrupar por el hostname/dominio principal
      return `web:${host}`;
    } catch {
      return candidate.url;
    }
  }

  private classifyResultType(
    url: string,
    title: string,
    snippet: string,
    queryIntent: DiscoveryQueryIntent
  ): DiscoveredSourceType {
    const u = url.toLowerCase();
    const t = title.toLowerCase();

    if (u.includes("instagram.com")) return "instagram";
    if (u.includes("facebook.com")) return "facebook";
    if (u.includes("linkedin.com")) return "linkedin";
    if (u.includes("twitter.com") || u.includes("x.com")) return "x";
    if (u.includes("google.com/maps") || u.includes("maps.google.com") || u.includes("g.page")) return "google_maps";

    if (/competidor|alternativa|\bvs\b|ranking/i.test(t)) {
      return "competitors";
    }

    if (isExternalDomain(u) || /noticia|diario|prensa|nota|blog|articulo|entrevista|directorio|gu[ií]a/i.test(t + " " + snippet)) {
      return "mentions";
    }

    if (queryIntent === "local_reviews" && /maps|mapa/i.test(`${t} ${snippet}`)) return "google_maps";

    return "web";
  }

  private addCrossSourceCorroboration(candidates: CandidateSource[]): CandidateSource[] {
    return candidates.map((candidate) => {
      const directReferences = candidates.filter((other) => other.url !== candidate.url && (candidate.matchScore || 0) >= 0.35 && (other.matchScore || 0) >= 0.35 && (referencesCandidate(candidate, other) || referencesCandidate(other, candidate)));
      const contextualMatches = candidates.filter((other) => other.url !== candidate.url && other.type !== candidate.type && (other.matchScore || 0) >= 0.55 && (candidate.matchScore || 0) >= 0.35 && hasContextSignal(candidate) && hasContextSignal(other));
      const corroboratingSources = Array.from(new Set([...directReferences, ...contextualMatches].map((item) => item.url)));
      return {
        ...candidate,
        metadata: {
          ...candidate.metadata,
          corroboratingSources,
          directCorroborationCount: directReferences.length,
        },
      };
    });
  }
}

function discoveryStatus(attempts: DiscoveryQueryAttempt[], candidateCount: number): DiscoveryStatus {
  if (!attempts.length) return "not_attempted";
  const unavailable = attempts.filter((attempt) => attempt.status === "provider_unavailable").length;
  if (unavailable === attempts.length) return "provider_unavailable";
  if (unavailable > 0) return "partial";
  return candidateCount > 0 ? "completed" : "no_results";
}

async function runWithConcurrency<T>(items: T[], concurrency: number, operation: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await operation(items[index]);
    }
  });
  await Promise.all(workers);
}

function referencesCandidate(source: CandidateSource, target: CandidateSource): boolean {
  const text = `${source.title} ${source.snippet} ${JSON.stringify(source.metadata?.subResources || [])}`.toLowerCase();
  try {
    const parsed = new URL(target.url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const handle = parsed.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    return text.includes(host) || Boolean(handle && handle.length >= 4 && text.includes(`@${handle}`));
  } catch {
    return false;
  }
}

function hasContextSignal(candidate: CandidateSource): boolean {
  const signals = candidate.metadata?.matchingSignals;
  if (!signals || typeof signals !== "object") return false;
  const values = signals as Record<string, unknown>;
  return Number(values.location || 0) > 0 || Number(values.category || 0) > 0 || Number(values.contact || 0) > 0;
}

function isExternalDomain(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return ["tripadvisor.", "yelp.", "foursquare.", "paginasamarillas.", "reddit.", "medium.", "mercadolibre.", "rappi.", "pedidosya.", "linktr.ee", "beacons.ai", "bio.site", "wa.me"].some((domain) => host.includes(domain))
      || /(^|\.)(guia|directorio)[a-z0-9-]*\./.test(host);
  } catch {
    return false;
  }
}

function mergeCandidateMetadata(a?: Record<string, unknown>, b?: Record<string, unknown>): Record<string, unknown> {
  const mergeStrings = (key: string) => Array.from(new Set([
    ...(Array.isArray(a?.[key]) ? a?.[key] as unknown[] : []),
    ...(Array.isArray(b?.[key]) ? b?.[key] as unknown[] : []),
  ].filter((value): value is string => typeof value === "string")));
  return { ...a, ...b, queries: mergeStrings("queries"), queryIntents: mergeStrings("queryIntents") };
}
