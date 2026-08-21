import { SourceAnalyzer, SourceEvidence, SourceRelevance, SourceType, EvidenceFinding } from "./source-analyzer";
import { SearchProvider, DuckDuckGoProvider, SearchResult } from "./providers/search-provider";
import { TavilySearchProvider } from "./providers/tavily-search-provider";

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

  async search(query: string, business: Business): Promise<SearchResult[]> {
    const hasTavilyKey = !!process.env.TAVILY_API_KEY;

    if (hasTavilyKey) {
      try {
        console.log("[SmartSearchProvider] Intentando búsqueda con Tavily...");
        return await this.tavily.search(query, business);
      } catch (error) {
        console.error("[SmartSearchProvider] Tavily falló, intentando fallback DuckDuckGo...", error);
        // Fallback a DDG si Tavily falla incluso teniendo la key (ej: error de API, rate limit)
      }
    } else {
      console.log("[SmartSearchProvider] TAVILY_API_KEY no encontrada, usando DuckDuckGo como fallback...");
    }

    try {
      return await this.ddg.search(query, business);
    } catch (error) {
      console.error("[SmartSearchProvider] DuckDuckGo también falló:", error);
      throw error; // Dejar que SearchSourceAnalyzer lo maneje
    }
  }
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
    const isLocal = isRestaurante || isServicio || /local|barrio|zona|ciudad/i.test(rubro);

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

  async analyze(business: Business): Promise<SourceEvidence> {
    const businessWithGoals = business as BusinessWithGoals;
    const nombre = businessWithGoals.nombre;
    const rubro = businessWithGoals.rubro || "";
    const webUrl = businessWithGoals.webUrl;

    if (!nombre) {
      return this.unavailable("No se pudo obtener el nombre del negocio");
    }

    try {
      // Usar el provider inyectado para obtener resultados de búsqueda
      const query = `${nombre} ${rubro}`;
      const results = await this.provider.search(query, business);

      if (results.length === 0) {
        return this.unavailable("No se encontraron resultados de búsqueda para la marca");
      }

      // Analizar presencia de marca
      const brandNameLower = nombre.toLowerCase();
      const domainLower = webUrl ? new URL(webUrl).hostname.replace("www.", "").toLowerCase() : "";

      const brandMentions = results.filter(r => 
        r.title.toLowerCase().includes(brandNameLower) || 
        r.snippet.toLowerCase().includes(brandNameLower)
      );

      const domainMatches = results.filter(r => 
        r.url.toLowerCase().includes(domainLower)
      );

      const topPosition = brandMentions.length > 0 
        ? results.findIndex(r => r.title.toLowerCase().includes(brandNameLower) || r.snippet.toLowerCase().includes(brandNameLower)) + 1
        : null;

      // Señales de autoridad (directorios conocidos)
      const authorityDomains = ["wikipedia.org", "linkedin.com", "crunchbase.com", "yelp.com", "tripadvisor.com", "facebook.com", "instagram.com", "trustpilot.com"];
      const authoritySignals = results.filter(r => 
        authorityDomains.some(d => r.url.includes(d))
      ).map(r => r.url);

      // Consistencia de información
      const consistencyScore = this.calculateConsistency(results, brandNameLower, domainLower);

      // Generar findings
      const findings: EvidenceFinding[] = [];

      if (brandMentions.length > 0) {
        findings.push(this.generateFinding(
          "posicionamiento",
          "positive",
          brandMentions.length >= 3 ? "high" : "medium",
          `La marca "${nombre}" aparece en ${brandMentions.length} de ${results.length} resultados de búsqueda para "${query}".`,
          `Búsqueda: ${query}`,
          0.5,
          brandMentions.length >= 3 ? "ALTA" : "MEDIA"
        ));
      } else {
        findings.push(this.generateFinding(
          "posicionamiento",
          "negative",
          "high",
          `La marca "${nombre}" no aparece en los primeros ${results.length} resultados de búsqueda para "${query}".`,
          `Búsqueda: ${query}`,
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
          `Búsqueda: ${query}`,
          0.4,
          "ALTA"
        ));
      } else if (topPosition !== null && topPosition <= 10) {
        findings.push(this.generateFinding(
          "adquisicion",
          "positive",
          "medium",
          `La marca aparece en la posición ${topPosition} de los resultados de búsqueda.`,
          `Búsqueda: ${query}`,
          0.4,
          "MEDIA"
        ));
      } else {
        findings.push(this.generateFinding(
          "adquisicion",
          "negative",
          "medium",
          `La marca no aparece en los primeros resultados de búsqueda.`,
          `Búsqueda: ${query}`,
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
          `Búsqueda: ${query}`,
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
          `Búsqueda: ${query}`,
          0.3,
          "MEDIA"
        ));
      }

      // Calcular coverage basado en cuántos resultados se obtuvieron
      const coverage = results.length >= 5 ? 100 : results.length >= 3 ? 70 : results.length >= 1 ? 40 : 0;
      const confidence = coverage >= 70 ? "ALTA" : coverage >= 40 ? "MEDIA" : "BAJA";

      return {
        source: this.type,
        status: "evaluated",
        data: {
          query,
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
          query,
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

  private unavailable(reason: string): SourceEvidence {
    return {
      source: this.type,
      status: "unavailable",
      data: null,
      findings: [],
      confidence: "INSUFICIENTE",
      coverage: 0,
      evaluatedAt: new Date(),
      requiresAuth: false,
      metadata: { error: reason, unavailable: true },
    };
  }
}