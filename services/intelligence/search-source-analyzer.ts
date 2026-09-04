import { SourceAnalyzer, type SourceEvidence, type SourceRelevance, type SourceType, type EvidenceFinding, type SourceAnalysisContext } from "./source-analyzer.ts";
import { DuckDuckGoProvider, type SearchProvider, type SearchProviderTraceAttempt, type SearchResult } from "./providers/search-provider.ts";
import { TavilySearchProvider } from "./providers/tavily-search-provider.ts";

import type { Business } from "@prisma/client";

interface BusinessWithGoals extends Business {
  goals?: Array<{ objetivo?: string }>;
}

/**
 * Implementación de SearchProvider que coordina Tavily con fallback a DuckDuckGo.
 */
export class SmartSearchProvider implements SearchProvider {
  private tavily = new TavilySearchProvider();
  private ddg = new DuckDuckGoProvider();
  private attemptsByQuery = new Map<string, SearchProviderTraceAttempt[]>();

  getAttempts(query: string): SearchProviderTraceAttempt[] {
    return [...(this.attemptsByQuery.get(query) || [])];
  }

  async search(query: string, business: Business, options: { signal?: AbortSignal } = {}): Promise<SearchResult[]> {
    const hasTavilyKey = !!process.env.TAVILY_API_KEY;
    const attempts: SearchProviderAttempt[] = [];

    if (hasTavilyKey) {
      try {
        console.log("[SmartSearchProvider] Intentando búsqueda con Tavily...");
        const results = await this.tavily.search(query, business, options);
        attempts.push({ provider: "tavily", status: results.length ? "completed" : "no_results" });
        this.attemptsByQuery.set(query, [...attempts]);
        return results;
      } catch (error) {
        attempts.push({ provider: "tavily", status: "unavailable", errorType: providerErrorType(error) });
        console.error("[SmartSearchProvider] Tavily falló, intentando fallback DuckDuckGo...", providerErrorType(error));
        // Fallback a DDG si Tavily falla incluso teniendo la key (ej: error de API, rate limit)
      }
    } else {
      console.log("[SmartSearchProvider] TAVILY_API_KEY no encontrada, usando DuckDuckGo como fallback...");
    }

    try {
      const results = await this.ddg.search(query, business, options);
      attempts.push({ provider: "duckduckgo", status: results.length ? "completed" : "no_results" });
      this.attemptsByQuery.set(query, [...attempts]);
      return results;
    } catch (error) {
      attempts.push({ provider: "duckduckgo", status: "unavailable", errorType: providerErrorType(error) });
      this.attemptsByQuery.set(query, [...attempts]);
      console.error("[SmartSearchProvider] DuckDuckGo también falló:", providerErrorType(error));
      throw new SearchProviderUnavailableError(attempts);
    }
  }
}

export type SearchProviderAttempt = SearchProviderTraceAttempt;

export class SearchProviderUnavailableError extends Error {
  readonly attempts: SearchProviderAttempt[];

  constructor(attempts: SearchProviderAttempt[]) {
    super("search_provider_unavailable");
    this.name = "SearchProviderUnavailableError";
    this.attempts = attempts;
  }
}

function providerErrorType(error: unknown): string {
  if (error instanceof Error) return error.name || "Error";
  return "ProviderError";
}

export class SearchSourceAnalyzer extends SourceAnalyzer {
  type = "search" as SourceType;
  requiresAuth = false;
  requiresPermission = false;

  private provider: SearchProvider;

  constructor(provider?: SearchProvider) {
    super();
    this.provider = provider || new SmartSearchProvider();
  }


  isAvailable(business: Business): boolean {
    // Search es siempre disponible (usa scraping público)
    return true;
  }

  isRelevant(business: Business): SourceRelevance {
    const businessWithGoals = business as BusinessWithGoals;
    const rubro = businessWithGoals.rubro?.toLowerCase() || "";
    const objetivo = businessWithGoals.goals?.[0]?.objetivo?.toLowerCase() || "";
    const tipoCliente = businessWithGoals.tipoCliente?.toLowerCase() || "";
    const isB2C = tipoCliente.includes("b2c") || tipoCliente.includes("consumidor") || tipoCliente.includes("retail");
    const isB2B = tipoCliente.includes("b2b") || tipoCliente.includes("empresa") || tipoCliente.includes("corporativo");

    // Detectar tipo de negocio
    const isEcommerce = /ecom|tienda|venta|shop|store|retail/i.test(rubro);
    const isRestaurante = /restaurante|cafe|cafeter|comida|delivery|bar|pizza|burger|food/i.test(rubro);
    const isServicio = /servicio|consult|abogado|clinic|dent|psic|arquitect|agency|studio|profesional|salud|belleza|estetica/i.test(rubro);
    const isSaaS = /saas|software|platform|app|subscription|crm|b2b|tech|tecnolog/i.test(rubro);
    const isLocal = Boolean(businessWithGoals.ubicacion || businessWithGoals.ciudad) || isRestaurante || isServicio || /local|barrio|zona|ciudad/i.test(rubro);

    let weight = 0.15;
    let relevant = false;

    if (isLocal) { weight = 0.25; relevant = true; }
    else if (isServicio) { weight = 0.2; relevant = true; }
    else if (isEcommerce) { weight = 0.2; relevant = true; }
    else if (isSaaS) { weight = 0.2; relevant = true; }
    else if (isB2B) { weight = 0.15; relevant = true; }

    // Objetivo de tráfico/visibilidad
    if (/tráfico|trafico|visibil|buscador|seo|google|organico|organico/i.test(objetivo)) { weight = Math.max(weight, 0.25); relevant = true; }

    return {
      source: this.type,
      relevant,
      reason: relevant ? "Search indica autoridad y visibilidad orgánica" : "Search no es un canal prioritario para este negocio",
      weight,
    };
  }

  async analyze(business: Business, context?: SourceAnalysisContext): Promise<SourceEvidence> {
    const businessWithGoals = business as BusinessWithGoals;
    const nombre = businessWithGoals.nombre;
    const rubro = businessWithGoals.rubro || "";
    const webUrl = businessWithGoals.webUrl;
    const ubicacion = businessWithGoals.ubicacion || businessWithGoals.ciudad || "";

    if (!nombre) {
      return this.unavailable("No se pudo obtener el nombre del negocio");
    }

    try {
      const queries = Array.from(new Set([
        `${nombre} ${ubicacion}`.trim(),
        `${nombre} ${rubro} ${ubicacion}`.trim(),
        `${nombre} reseñas opiniones ${ubicacion}`.trim(),
        `${rubro} ${ubicacion}`.trim(),
      ])).filter(Boolean);
      const collected: Array<{ result: SearchResult; query: string; kind: "brand" | "reviews" | "category" }> = [];
      const queryAttempts: Array<{ query: string; kind: "brand" | "reviews" | "category"; status: "completed" | "no_results" | "provider_unavailable"; resultCount: number }> = [];
      for (const query of queries) {
        if (context?.signal?.aborted) throw Object.assign(new Error("search_canceled"), { name: "AbortError" });
        const kind = /reseñas|opiniones/.test(query) ? "reviews" : query === `${rubro} ${ubicacion}`.trim() ? "category" : "brand";
        try {
          const queryResults = await this.provider.search(query, business, { signal: context?.signal });
          queryAttempts.push({ query, kind, status: queryResults.length ? "completed" : "no_results", resultCount: queryResults.length });
          for (const result of queryResults) collected.push({ result, query, kind });
        } catch (error) {
          if (context?.signal?.aborted) throw error;
          queryAttempts.push({ query, kind, status: "provider_unavailable", resultCount: 0 });
          console.warn(`[SEARCH_ANALYZER] No se pudo completar la búsqueda "${query}":`, error instanceof Error ? error.message : String(error));
        }
      }
      const resultMap = new Map<string, SearchResult>();
      for (const item of collected) if (!resultMap.has(item.result.url)) resultMap.set(item.result.url, item.result);
      const results = Array.from(resultMap.values());

      if (results.length === 0) {
        const allUnavailable = queryAttempts.length > 0 && queryAttempts.every((attempt) => attempt.status === "provider_unavailable");
        const partiallyUnavailable = queryAttempts.some((attempt) => attempt.status === "provider_unavailable");
        return this.unavailable(
          allUnavailable ? "No se pudo completar la búsqueda pública" : partiallyUnavailable ? "La búsqueda pública se completó solo parcialmente" : "La búsqueda se completó sin resultados validables",
          allUnavailable ? "provider_unavailable" : partiallyUnavailable ? "partial" : "no_results",
          queryAttempts,
        );
      }

      // Analizar presencia de marca
      const brandNameLower = nombre.toLowerCase();
      const domainLower = webUrl ? new URL(webUrl).hostname.replace("www.", "").toLowerCase() : "";

      const brandMentions = results.filter(r => this.matchesEntity(r, nombre, rubro, ubicacion));

      const domainMatches = domainLower ? results.filter(r => r.url.toLowerCase().includes(domainLower)) : [];

      const brandQueryResults = collected.filter((item) => item.kind === "brand").map((item) => item.result);
      const brandQueryCompleted = queryAttempts.some((attempt) => attempt.kind === "brand" && attempt.status !== "provider_unavailable");
      const brandIndex = brandQueryResults.findIndex(r => this.matchesEntity(r, nombre, rubro, ubicacion));
      const topPosition = brandIndex >= 0 ? brandIndex + 1 : null;

      // Señales de autoridad (directorios conocidos)
      const authorityDomains = ["wikipedia.org", "linkedin.com", "crunchbase.com", "yelp.com", "tripadvisor.com", "facebook.com", "instagram.com", "trustpilot.com"];
      const authoritySignals = brandMentions.filter(r =>
        authorityDomains.some(d => r.url.includes(d))
      ).map(r => r.url);
      const categoryResults = collected.filter((item) => item.kind === "category").map((item) => item.result);
      const categoryMatches = categoryResults.filter((result) => this.matchesEntity(result, nombre, rubro, ubicacion));
      const localDetails = brandMentions.filter((result) => /horario|abierto|direcci[oó]n|tel[eé]fono|whatsapp|maps|mapa/i.test(`${result.title} ${result.snippet}`));
      const reviewMatches = collected.filter((item) => item.kind === "reviews" && this.matchesEntity(item.result, nombre, rubro, ubicacion));

      // Consistencia de información
      const consistencyScore = this.calculateConsistency(results, brandNameLower, domainLower);

      // Generar findings
      const findings: EvidenceFinding[] = [];

      if (brandMentions.length > 0) {
        findings.push(this.generateFinding(
          "posicionamiento",
          "positive",
          brandMentions.length >= 3 ? "high" : "medium",
          `El negocio "${nombre}" aparece en ${brandMentions.length} resultados validados por nombre, rubro o ubicación.`,
          `Búsquedas: ${queries.join(" | ")}`,
          0.5,
          brandMentions.length >= 3 ? "ALTA" : "MEDIA"
        ));
      } else if (brandQueryCompleted) {
        findings.push(this.generateFinding(
          "posicionamiento",
          "negative",
          "high",
          `No se pudo validar la aparición de "${nombre}" en los resultados consultados por nombre, rubro y ubicación.`,
          `Búsquedas: ${queries.join(" | ")}`,
          0.5,
          "ALTA"
        ));
      }

      if (topPosition !== null && topPosition <= 3) {
        findings.push(this.generateFinding(
          "adquisicion",
          "positive",
          "high",
          `La marca aparece en la posición ${topPosition} de los resultados de búsqueda.`,
          `Búsquedas de marca: ${queries.slice(0, 2).join(" | ")}`,
          0.4,
          "ALTA"
        ));
      } else if (topPosition !== null && topPosition <= 10) {
        findings.push(this.generateFinding(
          "adquisicion",
          "positive",
          "medium",
          `La marca aparece en la posición ${topPosition} de los resultados de búsqueda.`,
          `Búsquedas de marca: ${queries.slice(0, 2).join(" | ")}`,
          0.4,
          "MEDIA"
        ));
      } else if (brandQueryCompleted) {
        findings.push(this.generateFinding(
          "adquisicion",
          "negative",
          "medium",
          `La marca no aparece en los primeros resultados de búsqueda.`,
          `Búsquedas de marca: ${queries.slice(0, 2).join(" | ")}`,
          0.4,
          "MEDIA"
        ));
      }

      if (authoritySignals.length > 0) {
        findings.push(this.generateFinding(
          "trust",
          "positive",
          "medium",
          `Se detectaron ${authoritySignals.length} señales de autoridad: ${authoritySignals.slice(0, 3).join(", ")}.`,
          `Búsquedas: ${queries.join(" | ")}`,
          0.3,
          "MEDIA"
        ));
      }

      if (domainMatches.length > 0) {
        findings.push(this.generateFinding(
          "presencia",
          "positive",
          "medium",
          `El dominio ${domainLower} aparece en ${domainMatches.length} resultados de búsqueda.`,
          `Búsquedas: ${queries.join(" | ")}`,
          0.3,
          "MEDIA"
        ));
      }

      if (categoryResults.length > 0) {
        findings.push(this.generateFinding(
          "adquisicion",
          categoryMatches.length > 0 ? "positive" : "negative",
          categoryMatches.length > 0 ? "high" : "medium",
          categoryMatches.length > 0
            ? `El negocio aparece cuando se busca su rubro en ${ubicacion || "su mercado"}.`
            : `Se encontraron resultados para el rubro en ${ubicacion || "su mercado"}, pero no se pudo validar al negocio entre ellos.`,
          `Búsqueda por categoría: ${rubro} ${ubicacion}`.trim(),
          0.55,
          categoryMatches.length > 0 ? "ALTA" : "MEDIA"
        ));
      }

      if (localDetails.length > 0) {
        findings.push(this.generateFinding("presencia", "positive", "medium", `Se encontraron datos comerciales públicos —como ubicación, horario o contacto— asociados al negocio en ${localDetails.length} resultado(s).`, localDetails[0].url, 0.5, "MEDIA"));
      }

      if (reviewMatches.length > 0) {
        findings.push(this.generateFinding("trust", "positive", "medium", `Se encontraron resultados de opiniones asociados al negocio correcto.`, reviewMatches[0].result.url, 0.45, "MEDIA"));
      }

      // Calcular coverage basado en cuántos resultados se obtuvieron
      const coverage = results.length >= 5 ? 100 : results.length >= 3 ? 70 : results.length >= 1 ? 40 : 0;
      const confidence = coverage >= 70 ? "ALTA" : coverage >= 40 ? "MEDIA" : "BAJA";

      return {
        source: this.type,
        status: "evaluated",
        data: {
          queries,
          results,
          brandMentions: brandMentions.length,
          topPosition,
          authoritySignals,
          domainMatches: domainMatches.length,
          consistencyScore,
        },
        findings,
        confidence,
        coverage,
        evaluatedAt: new Date(),
        requiresAuth: false,
        metadata: {
          queries,
          queryAttempts,
          outcome: queryAttempts.some((attempt) => attempt.status === "provider_unavailable") ? "partial" : "completed",
          resultsCount: results.length,
          brandMentions: brandMentions.length,
          topPosition,
          authoritySignals: authoritySignals.length,
          consistencyScore,
        },
      };
    } catch (error) {
      return this.unavailable(error instanceof Error ? error.message : String(error));
    }
  }

  private matchesEntity(result: SearchResult, businessName: string, rubro: string, location: string): boolean {
    const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    const text = normalize(`${result.title} ${result.snippet} ${result.url}`);
    const name = normalize(businessName);
    const nameTokens = name.split(" ").filter((token) => token.length > 2);
    const matchedNameTokens = nameTokens.filter((token) => text.includes(token));
    const nameMatch = text.includes(name) || (nameTokens.length > 0 && matchedNameTokens.length / nameTokens.length >= 0.75);
    if (!nameMatch) return false;
    const contextTokens = normalize(`${rubro} ${location}`).split(" ").filter((token) => token.length > 3);
    return contextTokens.length === 0 || contextTokens.some((token) => text.includes(token)) || text.includes(name);
  }

  private calculateConsistency(results: Array<{ title: string; url: string; snippet: string }>, brandName: string, domain: string): number {
    if (results.length === 0) return 0;
    
    let consistent = 0;
    for (const r of results) {
      const hasBrand = r.title.toLowerCase().includes(brandName) || r.snippet.toLowerCase().includes(brandName);
      const hasDomain = r.url.toLowerCase().includes(domain);
      if (hasBrand || hasDomain) consistent++;
    }
    return Math.round((consistent / results.length) * 100);
  }

  private unavailable(reason: string, outcome: "provider_unavailable" | "no_results" | "partial" = "provider_unavailable", queryAttempts: unknown[] = []): SourceEvidence {
    return {
      source: this.type,
      status: "unavailable",
      data: null,
      findings: [],
      confidence: "INSUFICIENTE",
      coverage: 0,
      evaluatedAt: new Date(),
      requiresAuth: false,
      metadata: { reason, unavailable: outcome === "provider_unavailable", outcome, queryAttempts },
    };
  }
}
