import { SourceAnalyzer, SourceEvidence, SourceRelevance, SourceType, EvidenceFinding } from "./source-analyzer";
import { ReviewsProvider, GoogleMapsScrapeProvider, GooglePlacesApiProvider } from "./providers/reviews-provider";
import type { Business } from "@prisma/client";

interface BusinessWithGoals extends Business {
  goals?: Array<{ objetivo?: string }>;
}

export class ReviewsSourceAnalyzer extends SourceAnalyzer {
  type = "reviews" as SourceType;
  requiresAuth = false;
  requiresPermission = false;

  private primaryProvider: ReviewsProvider;
  private fallbackProvider: ReviewsProvider;

  constructor(primaryProvider?: ReviewsProvider, fallbackProvider?: ReviewsProvider) {
    super();
    // Si se inyecta un provider explícito, usarlo como primario
    // Si no, usar GooglePlacesApiProvider si hay key, sino GoogleMapsScrapeProvider
    if (primaryProvider) {
      this.primaryProvider = primaryProvider;
    } else if (process.env.GOOGLE_PLACES_API_KEY) {
      this.primaryProvider = new GooglePlacesApiProvider();
    } else {
      this.primaryProvider = new GoogleMapsScrapeProvider();
    }

    // Fallback siempre es GoogleMapsScrapeProvider (experimental)
    this.fallbackProvider = fallbackProvider || new GoogleMapsScrapeProvider();
  }

  isAvailable(business: Business): boolean {
    // Reviews es siempre disponible (usa scraping público de Google Maps)
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

    if (isRestaurante) { weight = 0.3; relevant = true; }
    else if (isServicio) { weight = 0.25; relevant = true; }
    else if (/hotel|viaje|turismo|salud|belleza|estetica/i.test(rubro)) { weight = 0.25; relevant = true; }
    else if (isEcommerce) { weight = 0.15; relevant = true; }
    else if (isB2C && !isB2B) { weight = 0.15; relevant = true; }

    // Objetivo de reputación/confianza
    if (/reputación|reputacion|confianza|testimonio|reseña|resena|opinion/i.test(objetivo)) { weight = Math.max(weight, 0.25); relevant = true; }

    return {
      source: this.type,
      relevant,
      reason: relevant ? "Reviews indican prueba social y reputación" : "Reviews no son un canal prioritario para este negocio",
      weight,
    };
  }

  async analyze(business: Business, discoveryResult?: any): Promise<SourceEvidence> {
    const businessWithGoals = business as BusinessWithGoals;
    const nombre = businessWithGoals.nombre;
    const rubro = businessWithGoals.rubro || "";
    const ciudad = businessWithGoals.ciudad || "";

    if (!nombre) {
      return this.unavailable("No se pudo obtener el nombre del negocio");
    }

    try {
      // Intentar con provider primario (Google Places API si key existe, sino GoogleMapsScrape)
      let reviewsData;
      let providerUsed = "primary";

      try {
        reviewsData = await this.primaryProvider.getReviews(business, discoveryResult);
      } catch (primaryError) {
        console.warn("[REVIEWS_ANALYZER] Primary provider failed:", primaryError instanceof Error ? primaryError.message : String(primaryError));
        
        // Fallback a GoogleMapsScrapeProvider
        try {
          reviewsData = await this.fallbackProvider.getReviews(business);
          providerUsed = "fallback";
        } catch (fallbackError) {
          console.warn("[REVIEWS_ANALYZER] Fallback provider also failed:", fallbackError instanceof Error ? fallbackError.message : String(fallbackError));
          return this.unavailable(`Ambos providers fallaron. Primary: ${primaryError instanceof Error ? primaryError.message : String(primaryError)}. Fallback: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
        }
      }

      if (!reviewsData.rating && reviewsData.reviews.length === 0) {
        return this.unavailable("No se encontraron reseñas públicas para el negocio");
      }

      const { rating, reviewCount, reviews, scope, entityMatchConfidence } = reviewsData;

      // Si el alcance es individual_location y esto representa una cadena, reducir confidence/coverage
      let confidenceAdjustment = 0;
      let scopeWarning = "";
      if (scope === "individual_location" && entityMatchConfidence && entityMatchConfidence < 0.7) {
        confidenceAdjustment = 20;
        scopeWarning = " (sucursal individual - no representa reputación global de la marca)";
      }

      // Analizar temas recurrentes
      const themes = this.analyzeThemes(reviews);

      // Generar findings
      const findings: EvidenceFinding[] = [];

      if (rating !== null) {
        if (rating >= 4.5) {
          findings.push(this.generateFinding(
            "trust",
            "positive",
            "high",
            `El negocio tiene un rating de ${rating.toFixed(1)}/5 en Google Maps${reviewCount ? ` con ${reviewCount} reseñas` : ""}${scopeWarning}.`,
            `Google Maps: ${nombre} ${rubro}${ciudad ? ` ${ciudad}` : ""}`,
            0.5,
            "ALTA"
          ));
        } else if (rating >= 4.0) {
          findings.push(this.generateFinding(
            "trust",
            "positive",
            "medium",
            `El negocio tiene un rating de ${rating.toFixed(1)}/5 en Google Maps${reviewCount ? ` con ${reviewCount} reseñas` : ""}${scopeWarning}.`,
            `Google Maps: ${nombre} ${rubro}${ciudad ? ` ${ciudad}` : ""}`,
            0.5,
            "MEDIA"
          ));
        } else if (rating >= 3.0) {
          findings.push(this.generateFinding(
            "trust",
            "negative",
            "medium",
            `El negocio tiene un rating de ${rating.toFixed(1)}/5 en Google Maps, lo que indica problemas de satisfacción${scopeWarning}.`,
            `Google Maps: ${nombre} ${rubro}${ciudad ? ` ${ciudad}` : ""}`,
            0.5,
            "MEDIA"
          ));
        } else {
          findings.push(this.generateFinding(
            "trust",
            "negative",
            "high",
            `El negocio tiene un rating bajo de ${rating.toFixed(1)}/5 en Google Maps, lo que indica problemas serios de satisfacción${scopeWarning}.`,
            `Google Maps: ${nombre} ${rubro}${ciudad ? ` ${ciudad}` : ""}`,
            0.5,
            "ALTA"
          ));
        }
      }

      if (reviewCount !== null) {
        if (reviewCount >= 100) {
          findings.push(this.generateFinding(
            "presencia",
            "positive",
            "high",
            `El negocio tiene ${reviewCount} reseñas en Google Maps, indicando presencia establecida${scopeWarning}.`,
            `Google Maps: ${nombre} ${rubro}${ciudad ? ` ${ciudad}` : ""}`,
            0.3,
            "ALTA"
          ));
        } else if (reviewCount >= 20) {
          findings.push(this.generateFinding(
            "presencia",
            "positive",
            "medium",
            `El negocio tiene ${reviewCount} reseñas en Google Maps${scopeWarning}.`,
            `Google Maps: ${nombre} ${rubro}${ciudad ? ` ${ciudad}` : ""}`,
            0.3,
            "MEDIA"
          ));
        } else {
          findings.push(this.generateFinding(
            "presencia",
            "negative",
            "low",
            `El negocio tiene solo ${reviewCount} reseñas en Google Maps, indicando baja presencia de reseñas${scopeWarning}.`,
            `Google Maps: ${nombre} ${rubro}${ciudad ? ` ${ciudad}` : ""}`,
            0.3,
            "MEDIA"
          ));
        }
      }

      // Temas recurrentes
      if (themes.strengths.length > 0) {
        findings.push(this.generateFinding(
          "propuesta",
          "positive",
          "medium",
          `Fortalezas recurrentes en reseñas: ${themes.strengths.slice(0, 3).join(", ")}.`,
          `Google Maps: ${nombre} ${rubro}${ciudad ? ` ${ciudad}` : ""}`,
          0.4,
          "MEDIA"
        ));
      }

      if (themes.problems.length > 0) {
        findings.push(this.generateFinding(
          "propuesta",
          "negative",
          "medium",
          `Problemas recurrentes en reseñas: ${themes.problems.slice(0, 3).join(", ")}.`,
          `Google Maps: ${nombre} ${rubro}${ciudad ? ` ${ciudad}` : ""}`,
          0.4,
          "MEDIA"
        ));
      }

      // Calcular coverage
      const coverage = reviews.length >= 5 ? 100 : reviews.length >= 3 ? 70 : reviews.length >= 1 ? 40 : 0;
      const adjustedCoverage = Math.max(0, coverage - confidenceAdjustment);
      const confidence = adjustedCoverage >= 70 ? "ALTA" : adjustedCoverage >= 40 ? "MEDIA" : "BAJA";

      return {
        source: this.type,
        status: "evaluated",
        data: {
          query: `${nombre} ${rubro}${ciudad ? ` ${ciudad}` : ""}`,
          rating,
          reviewCount,
          reviews,
          themes,
          scope,
          entityMatchConfidence,
          providerUsed,
        },
        findings,
        confidence,
        coverage: adjustedCoverage,
        evaluatedAt: new Date(),
        requiresAuth: false,
        metadata: {
          query: `${nombre} ${rubro}${ciudad ? ` ${ciudad}` : ""}`,
          rating,
          reviewCount,
          reviewsCount: reviews.length,
          strengths: themes.strengths,
          problems: themes.problems,
          scope,
          entityMatchConfidence,
          providerUsed,
          placeId: reviewsData.placeId,
          placeName: reviewsData.placeName,
          placeAddress: reviewsData.placeAddress,
        },
      };
    } catch (error) {
      return this.unavailable(error instanceof Error ? error.message : String(error));
    }
  }

  private analyzeThemes(reviews: Array<{ text: string; rating: number | null }>): { strengths: string[]; problems: string[] } {
    const strengths: string[] = [];
    const problems: string[] = [];

    // Palabras clave de fortalezas
    const strengthKeywords: Record<string, string[]> = {
      "servicio": ["servicio", "atención", "atencion", "amable", "amabilidad", "buen trato"],
      "calidad": ["calidad", "excelente", "delicioso", "rico", "sabroso", "fresco"],
      "rapidez": ["rápido", "rapido", "veloz", "rápidamente", "rapidamente"],
      "precio": ["precio", "económico", "economico", "accesible", "barato"],
      "ambiente": ["ambiente", "lugar", "espacio", "cómodo", "comodo", "agradable"],
      "ubicación": ["ubicación", "ubicacion", "cerca", "accesible", "bien ubicado"],
    };

    // Palabras clave de problemas
    const problemKeywords: Record<string, string[]> = {
      "servicio lento": ["lento", "demora", "espera", "tardó", "tardo", "lentitud"],
      "mal servicio": ["mal servicio", "mala atención", "mala atencion", "grosero", "desatento", "maltrato"],
      "precio alto": ["caro", "costoso", "precio alto", "sobreprecio", "excesivo"],
      "calidad baja": ["malo", "mal", "regular", "decepcionante", "no recomendable", "pésimo", "pesimo"],
      "limpieza": ["sucio", "suciedad", "limpio", "higiene", "desordenado"],
      "problemas de pedido": ["error", "equivocado", "faltó", "falto", "incompleto", "pedido mal"],
    };

    for (const review of reviews) {
      const text = review.text.toLowerCase();

      // Detectar fortalezas
      for (const [theme, keywords] of Object.entries(strengthKeywords)) {
        if (keywords.some(k => text.includes(k)) && !strengths.includes(theme)) {
          strengths.push(theme);
        }
      }

      // Detectar problemas
      for (const [theme, keywords] of Object.entries(problemKeywords)) {
        if (keywords.some(k => text.includes(k)) && !problems.includes(theme)) {
          problems.push(theme);
        }
      }
    }

    return { strengths, problems };
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