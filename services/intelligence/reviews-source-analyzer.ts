import { SourceAnalyzer } from "./source-analyzer.ts";
import type { SourceEvidence, SourceRelevance, SourceType, EvidenceFinding, SourceAnalysisContext } from "./source-analyzer.ts";
import { GoogleMapsScrapeProvider, GooglePlacesApiProvider } from "./providers/reviews-provider.ts";
import type { ReviewsProvider } from "./providers/reviews-provider.ts";
import type { Business } from "@prisma/client";
import { ReputationIntelligence } from "./reputation-intelligence.ts";

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

  async analyze(business: Business, context?: SourceAnalysisContext): Promise<SourceEvidence> {
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
        reviewsData = await this.primaryProvider.getReviews(business, undefined, { signal: context?.signal });
      } catch (primaryError) {
        if (context?.signal?.aborted) throw primaryError;
        console.warn("[REVIEWS_ANALYZER] Primary provider failed:", primaryError instanceof Error ? primaryError.message : String(primaryError));
        
        // Fallback a GoogleMapsScrapeProvider
        try {
          reviewsData = await this.fallbackProvider.getReviews(business, undefined, { signal: context?.signal });
          providerUsed = "fallback";
        } catch (fallbackError) {
          if (context?.signal?.aborted) throw fallbackError;
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

      const reputation = ReputationIntelligence.analyze(reviews.map((review, index) => ({
        id: `${reviewsData.placeId || "place"}-review-${index}`,
        source: review.source || "google_maps",
        url: review.url || reviewsData.placeUrl || null,
        date: review.date || null,
        rating: review.rating,
        text: review.text,
        author: review.author || null,
        entityConfidence: entityMatchConfidence ?? (providerUsed === "fallback" ? .6 : 0),
        entityValidated: (entityMatchConfidence ?? 0) >= .72,
      })), { objective: businessWithGoals.goals?.[0]?.objetivo });

      if (!reputation.accepted.length) return this.unavailable("No se obtuvieron reseñas atribuibles al negocio con suficiente seguridad");

      const reputationFindings: EvidenceFinding[] = [];
      const commentById = new Map(reputation.accepted.map((comment) => [comment.id, comment]));
      const addReputationFinding = (finding: EvidenceFinding, topic: typeof reputation.topics[number]) => {
        finding.reputationEvidenceConfidence = topic.evidenceConfidence;
        finding.reputationTopic = topic.name;
        reputationFindings.push(finding);
      };
      for (const topic of reputation.strengths.slice(0, 5)) {
        for (const commentId of topic.commentIds.slice(0, 6)) {
          const comment = commentById.get(commentId); if (!comment) continue;
          addReputationFinding(this.generateFinding("trust", "positive", topic.commercialImpact >= .7 ? "high" : "medium", `La ${topic.name} aparece como fortaleza en opiniones independientes: “${comment.text.slice(0, 180)}”.`, comment.url || `Google Maps: ${nombre}`, topic.commercialImpact, topic.evidenceConfidence >= .7 ? "ALTA" : topic.evidenceConfidence >= .45 ? "MEDIA" : "BAJA"), topic);
        }
      }
      for (const topic of reputation.problems.slice(0, 5)) {
        for (const commentId of topic.commentIds.slice(0, 8)) {
          const comment = commentById.get(commentId); if (!comment) continue;
          addReputationFinding(this.generateFinding(comment.journeyStage === "action" ? "conversion" : "experiencia", "negative", topic.commercialImpact >= .7 ? "high" : "medium", `Opiniones independientes mencionan ${topic.name}: “${comment.text.slice(0, 180)}”.`, comment.url || `Google Maps: ${nombre}`, topic.commercialImpact, topic.evidenceConfidence >= .7 ? "ALTA" : topic.evidenceConfidence >= .45 ? "MEDIA" : "BAJA"), topic);
        }
      }
      const adjustedCoverage = Math.round(Math.min(100, 20 + Math.min(reputation.coverage.accepted, 20) * 2.5 + Math.min(reputation.coverage.independentAuthors, 15) * 2 + Math.min(reputation.coverage.sources.length, 3) * 5));
      return {
        source: this.type, status: "evaluated",
        data: { query: `${nombre} ${rubro}${ciudad ? ` ${ciudad}` : ""}`, rating, reviewCount, profile: { placeId: reviewsData.placeId, name: reviewsData.placeName, address: reviewsData.placeAddress, category: reviewsData.category, secondaryCategories: reviewsData.secondaryCategories, phone: reviewsData.phone, website: reviewsData.website, openingHours: reviewsData.openingHours, photoCount: reviewsData.photoCount }, reputation, scope, entityMatchConfidence, providerUsed },
        findings: reputationFindings,
        confidence: reputation.coverage.independentAuthors >= 5 ? "ALTA" : "MEDIA",
        coverage: adjustedCoverage, evaluatedAt: new Date(), requiresAuth: false,
        metadata: { providerUsed, placeId: reviewsData.placeId, entityMatchConfidence, acceptedComments: reputation.accepted.length, duplicatesDiscarded: reputation.duplicates.length, rejectedEntity: reputation.rejectedEntity.length, topics: reputation.topics.map((topic) => topic.name), temporalClaims: reputation.temporalClaims },
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
