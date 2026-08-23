import { SmartSearchProvider } from "@/services/intelligence/search-source-analyzer";
import { SearchResult } from "@/services/intelligence/providers/search-provider";
import {
  EntityMatcher,
  CandidateSource,
  BusinessEntityTarget,
  DiscoveredSourceType,
} from "./entity-matcher";

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
  discoveredAt: Date;
}

export class BusinessDiscoveryService {
  private searchProvider: SmartSearchProvider;

  constructor() {
    this.searchProvider = new SmartSearchProvider();
  }

  /**
   * Descubre automáticamente fuentes públicas relevantes para un negocio.
   * Aplica agrupamiento por dominio/entidad para evitar doble conteo.
   */
  async discover(target: BusinessEntityTarget, context: { signal?: AbortSignal } = {}): Promise<DiscoveryResult> {
    console.log("[BUSINESS_DISCOVERY] Starting discovery for:", target.name, target.category || "", target.location || "");

    const rawResults: Array<{ result: SearchResult; queryCategory: string }> = [];

    const loc = target.location ? target.location : "";
    const cat = target.category ? target.category : "";

    const queries = [
      { q: `${target.name} ${cat} ${loc} sitio oficial`.trim(), cat: "web" },
      { q: `${target.name} ${loc} instagram facebook linkedin twitter x`.trim(), cat: "social" },
      { q: `${target.name} ${loc} reseñas opiniones google maps`.trim(), cat: "reviews" },
      { q: `competidores de ${target.name} ${cat} ${loc}`.trim(), cat: "competitors" },
    ];

    const mockBusiness: any = {
      id: "discovery-target",
      nombre: target.name,
      rubro: target.category || "",
      ubicacion: target.location || "",
    };

    for (const item of queries) {
      if (context.signal?.aborted) throw Object.assign(new Error("discovery_canceled"), { name: "AbortError" });
      try {
        const results = await this.searchProvider.search(item.q, mockBusiness, { signal: context.signal });
        for (const r of results) {
          rawResults.push({ result: r, queryCategory: item.cat });
        }
      } catch (err) {
        if (context.signal?.aborted) throw err;
        console.warn(`[BUSINESS_DISCOVERY] Search query failed for "${item.q}":`, err instanceof Error ? err.message : String(err));
      }
    }

    // 2. Clasificar candidatos brutos
    const rawCandidates: CandidateSource[] = [];
    for (const { result, queryCategory } of rawResults) {
      if (!result.url) continue;
      const type = this.classifyResultType(result.url, result.title, result.snippet, queryCategory);
      rawCandidates.push({
        title: result.title,
        url: result.url,
        snippet: result.snippet,
        type,
      });
    }

    // 3. Agrupar por Entidad / Dominio (Requisito 1: Evitar doble conteo)
    const groupedCandidates = this.groupCandidatesByDomainOrProfile(rawCandidates);

    // 4. Evaluar cada candidato agrupado con EntityMatcher
    const evaluatedCandidates: CandidateSource[] = [];
    for (const candidate of groupedCandidates) {
      const evaluated = EntityMatcher.evaluateCandidate(candidate, target);
      evaluatedCandidates.push(evaluated);
    }

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
    const bestInstagram = validSources.find((c) => c.type === "instagram")?.url || target.declaredInstagram || null;
    const bestMaps = validSources.find((c) => c.type === "google_maps")?.url || null;

    console.log("[BUSINESS_DISCOVERY] Discovery completed:", {
      totalGroupedCandidates: evaluatedCandidates.length,
      confirmed: confirmedSources.length,
      probable: probableSources.length,
      uncertain: uncertainSources.length,
      rejected: rejectedSources.length,
      bestWeb,
      bestInstagram,
      bestMaps,
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
        // Mantener la URL con menor longitud o mejor título como principal
        if (c.url.length < group.primary.url.length || (group.primary.url.includes("/local/") && !c.url.includes("/local/"))) {
          group.subResources.push(group.primary.url);
          group.primary = c;
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
    queryCategory: string
  ): DiscoveredSourceType {
    const u = url.toLowerCase();
    const t = title.toLowerCase();

    if (u.includes("instagram.com")) return "instagram";
    if (u.includes("facebook.com")) return "facebook";
    if (u.includes("linkedin.com")) return "linkedin";
    if (u.includes("twitter.com") || u.includes("x.com")) return "x";
    if (u.includes("google.com/maps") || u.includes("maps.google.com") || u.includes("g.page")) return "google_maps";

    if (queryCategory === "competitors" || /competidor|alternativa|vs|ranking/i.test(t)) {
      return "competitors";
    }

    if (/noticia|diario|prensa|nota|blog|articulo|entrevista/i.test(t + " " + snippet)) {
      return "mentions";
    }

    return "web";
  }
}
