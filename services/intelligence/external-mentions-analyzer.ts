import { SourceAnalyzer, SourceEvidence, SourceRelevance, SourceType, EvidenceFinding } from "./source-analyzer";
import { SmartSearchProvider } from "./search-source-analyzer";
import { EntityMatcher, CandidateSource, BusinessEntityTarget } from "@/services/discovery/entity-matcher";
import type { Business } from "@prisma/client";

export type MentionType = 
  | "official_source"
  | "earned_media"
  | "community"
  | "directory"
  | "social_profile"
  | "irrelevant";

export type MentionSentiment = "positive" | "negative" | "neutral" | "unknown";

export interface ExternalMention {
  url: string;
  title: string;
  snippet: string;
  source: string;
  domain: string;
  mentionType: MentionType;
  entityMatchConfidence: number;
  mentionRelevanceScore: number;
  date?: string;
  sentiment: MentionSentiment;
  evidenceConfidence: "ALTA" | "MEDIA" | "BAJA";
  accepted: boolean;
  evaluationReasons: string[];
}

interface BusinessWithGoals extends Business {
  goals?: Array<{ objetivo?: string }>;
}

export class ExternalMentionsSourceAnalyzer extends SourceAnalyzer {
  type = "external_mentions" as SourceType;
  requiresAuth = false;
  requiresPermission = false;

  private searchProvider: SmartSearchProvider;

  constructor() {
    super();
    this.searchProvider = new SmartSearchProvider();
  }

  isAvailable(business: Business): boolean {
    return !!business.nombre;
  }

  isRelevant(business: Business): SourceRelevance {
    const businessWithGoals = business as BusinessWithGoals;
    const rubro = businessWithGoals.rubro?.toLowerCase() || "";
    const objetivo = businessWithGoals.goals?.[0]?.objetivo?.toLowerCase() || "";

    let weight = 0.1;
    let relevant = Boolean(businessWithGoals.nombre);

    // Menciones externas son relevantes para casi cualquier negocio
    if (/reconoc|marca|posicion|visibil|autoridad|presencia/i.test(objetivo)) {
      weight = 0.15;
      relevant = true;
    }

    // Servicios profesionales se benefician más de menciones
    if (/servicio|consult|profesional|abogado|arquitect|agency/i.test(rubro)) {
      weight = 0.15;
      relevant = true;
    }

    return {
      source: this.type,
      relevant,
      reason: relevant ? "Menciones externas indican autoridad y visibilidad de marca" : "Menciones externas menos relevantes para este objetivo",
      weight,
    };
  }

  async analyze(business: Business, discoveryResult?: any): Promise<SourceEvidence> {
    const businessWithGoals = business as BusinessWithGoals;
    const nombre = businessWithGoals.nombre;
    const rubro = businessWithGoals.rubro || "";
    const ubicacion = businessWithGoals.ubicacion || "";

    if (!nombre) {
      return this.unavailable("No se pudo obtener el nombre del negocio");
    }

    try {
      // Queries específicas para diferentes tipos de menciones
      const queries = [
        `${nombre} ${rubro} ${ubicacion}`, // Búsqueda general
        `${nombre} prensa diario artículo`, // Menciones en medios
        `${nombre} reseñas opiniones`, // Directorios y reviews
        `${nombre} comunidad clientes`, // Menciones de comunidad
      ];

      const allResults: Array<{ result: any; query: string }> = [];

      for (const query of queries) {
        try {
          const results = await this.searchProvider.search(query, business);
          for (const r of results) {
            allResults.push({ result: r, query });
          }
        } catch (err) {
          console.warn(`[EXTERNAL_MENTIONS] Query failed: "${query}"`, err instanceof Error ? err.message : String(err));
        }
      }

      if (allResults.length === 0) {
        return this.unavailable("No se encontraron menciones externas para el negocio");
      }

      // Clasificar cada mención usando EntityMatcher
      const target: BusinessEntityTarget = {
        name: nombre,
        category: rubro,
        location: ubicacion,
        tipoCliente: business.tipoCliente || undefined,
        declaredWebUrl: business.webUrl || undefined,
        declaredInstagram: business.instagramHandle || undefined,
      };

      const evaluatedMentions: ExternalMention[] = [];

      for (const { result, query } of allResults) {
        const candidate: CandidateSource = {
          title: result.title,
          url: result.url,
          snippet: result.snippet || "",
          type: "web", // Se reasignará en clasificación
        };

        const evaluated = EntityMatcher.evaluateCandidate(candidate, target);
        const classification = this.classifyMentionType(result, evaluated, business);
        const entityMatchConfidence = this.calculateMentionEntityConfidence(result, evaluated, business, ubicacion);
        const relevance = this.calculateMentionRelevance(result, classification.type, evaluated, business, ubicacion);
        const evidenceConfidence = this.calculateEvidenceConfidence(result, entityMatchConfidence, relevance.score);
        const accepted = classification.type !== "irrelevant"
          && entityMatchConfidence >= 0.55
          && relevance.score >= 0.5
          && evidenceConfidence !== "BAJA";

        evaluatedMentions.push({
          url: result.url,
          title: result.title,
          snippet: result.snippet || "",
          source: this.extractSourceDomain(result.url),
          domain: this.extractDomain(result.url),
          mentionType: accepted ? classification.type : "irrelevant",
          entityMatchConfidence,
          mentionRelevanceScore: relevance.score,
          date: result.date,
          sentiment: this.calculateSentiment(result),
          evidenceConfidence,
          accepted,
          evaluationReasons: [...classification.reasons, ...relevance.reasons, evaluated.rationale || ""].filter(Boolean),
        });
      }

      const uniqueEvaluated = this.deduplicateMentions(evaluatedMentions);
      const uniqueMentions = uniqueEvaluated.filter((mention) => mention.accepted);
      const rejectedMentions = uniqueEvaluated.filter((mention) => !mention.accepted);

      // Generar findings basados en clasificación
      const findings = this.generateFindings(uniqueMentions, nombre);

      // Calcular coverage
      const coverage = this.calculateCoverage(uniqueMentions, uniqueEvaluated.length);
      const confidence = coverage >= 72 ? "ALTA" : coverage >= 42 ? "MEDIA" : uniqueMentions.length > 0 ? "BAJA" : "INSUFICIENTE";
      const byType = this.groupByType(uniqueEvaluated);

      return {
        source: this.type,
        status: "evaluated",
        data: {
          mentions: uniqueMentions,
          rejectedMentions,
          totalFound: uniqueEvaluated.length,
          totalAccepted: uniqueMentions.length,
          totalRejected: rejectedMentions.length,
          byType,
        },
        findings,
        confidence,
        coverage,
        evaluatedAt: new Date(),
        requiresAuth: false,
        metadata: {
          totalFound: uniqueEvaluated.length,
          totalAccepted: uniqueMentions.length,
          totalRejected: rejectedMentions.length,
          byType,
        },
      };
    } catch (error) {
      return this.unavailable(error instanceof Error ? error.message : String(error));
    }
  }

  private classifyMentionType(
    result: any,
    evaluated: CandidateSource,
    business: Business
  ): { type: MentionType; reasons: string[] } {
    const url = result.url.toLowerCase();
    const title = result.title.toLowerCase();
    const snippet = (result.snippet || "").toLowerCase();
    const text = `${title} ${snippet}`;
    const reasons: string[] = [];

    if (business.webUrl && this.isSameDomain(result.url, business.webUrl)) {
      return { type: "official_source", reasons: ["Coincide con el dominio oficial declarado"] };
    }

    if (url.includes("instagram.com") || url.includes("facebook.com") || url.includes("linkedin.com") || url.includes("x.com") || url.includes("twitter.com")) {
      const officialHandle = this.socialHandleMatches(result.url, business.nombre, business.instagramHandle || undefined);
      return officialHandle
        ? { type: "social_profile", reasons: ["El perfil social coincide con la marca"] }
        : { type: "community", reasons: ["Contenido social de terceros; no es un perfil oficial verificado"] };
    }

    if (/reddit\.com|quora\.com|foro|forum|community/.test(url)) {
      return { type: "community", reasons: ["Fuente comunitaria o foro"] };
    }

    const directoryDomains = ["yelp.com", "tripadvisor.com", "trustpilot.com", "google.com/maps", "maps.google.com", "foursquare.com", "yellowpages.com", "paginasamarillas.com", "restaurantguru.com", "pedidosya.com", "rappi.com"];
    if (directoryDomains.some(d => url.includes(d)) || /tripadvisor\.[a-z.]+|yelp\.[a-z.]+/.test(url)) {
      return { type: "directory", reasons: ["Directorio o plataforma de reseñas"] };
    }

    const newsDomain = /infobae|clarin|lanacion|cronista|forbes|bloomberg|reuters|apnews|bbc|cnn|perfil|ambito|iprofesional|medium|substack|blog|news|diario|revista/.test(url);
    if (evaluated.entityRelationship === "brand_global" || evaluated.entityRelationship === "primary_entity" || evaluated.entityRelationship === "local_operation") {
      const brandDomain = this.domainContainsBusinessName(result.url, business.nombre);
      if (brandDomain) return { type: "official_source", reasons: ["Dominio de marca coherente con la entidad"] };
    }

    if (evaluated.entityRelationship === "licensed_business" || evaluated.entityRelationship === "sub_brand") {
      return { type: "irrelevant", reasons: ["Es una submarca o licenciatario distinto de la operación analizada"] };
    }

    if (newsDomain || /noticia|diario|prensa|entrevista|art[ií]culo|informe|apertura|inaugur/i.test(text)) {
      return { type: "earned_media", reasons: ["Contenido editorial o cobertura de un tercero"] };
    }

    if (/ranking|mejores|top\s*\d|alternativa|comparaci[oó]n|\bvs\b/i.test(text)) {
      return { type: "earned_media", reasons: ["Comparación o ranking editorial"] };
    }

    if (evaluated.status === "rejected" || (evaluated.matchScore || 0) < 0.3) {
      reasons.push("No hay coincidencia suficiente con la entidad");
    }
    reasons.push("La fuente o el tipo de contenido no permiten clasificarlo como mención útil");
    return { type: "irrelevant", reasons };
  }

  private calculateEvidenceConfidence(result: any, entityConfidence: number, relevance: number): "ALTA" | "MEDIA" | "BAJA" {
    const contentLength = `${result.title || ""} ${result.snippet || ""}`.trim().length;
    if (entityConfidence >= 0.72 && relevance >= 0.6 && contentLength >= 140) {
      return "ALTA";
    }
    if (entityConfidence >= 0.55 && relevance >= 0.45 && contentLength >= 70) {
      return "MEDIA";
    }
    return "BAJA";
  }

  private calculateMentionRelevance(
    result: any,
    mentionType: MentionType,
    evaluated: CandidateSource,
    business: Business,
    location: string
  ): { score: number; reasons: string[] } {
    if (mentionType === "irrelevant") return { score: 0, reasons: ["El contenido no aporta evidencia útil para marketing"] };

    const text = `${result.title || ""} ${result.snippet || ""}`.toLowerCase();
    const reasons: string[] = [];
    let score = 0;

    const typeBase: Record<Exclude<MentionType, "irrelevant">, number> = {
      official_source: 0.38,
      earned_media: 0.3,
      community: 0.24,
      directory: 0.3,
      social_profile: 0.34,
    };
    score += typeBase[mentionType];

    const localTokens = location.toLowerCase().split(/[\s,]+/).filter((token) => token.length > 3);
    const localMatch = localTokens.some((token) => text.includes(token)) || (location.toLowerCase().includes("argentina") && this.extractDomain(result.url).endsWith(".ar"));
    if (localMatch) {
      score += 0.2;
      reasons.push("Tiene contexto del mercado o ubicación analizados");
    } else if (location && (mentionType === "directory" || mentionType === "community")) {
      score -= 0.25;
      reasons.push("La fuente local o comunitaria no coincide con el mercado analizado");
    }

    const marketingSignals = /apertura|local|sucursal|cliente|experiencia|reseña|opini[oó]n|producto|men[uú]|precio|promoci[oó]n|campa[nñ]a|marca|servicio|comunidad|consumo|delivery|venta|publicidad/i.test(text);
    if (marketingSignals) {
      score += 0.2;
      reasons.push("Aporta contexto útil sobre mercado, clientes, oferta o marca");
    }

    const categoryTokens = (business.rubro || "").toLowerCase().split(/\s+/).filter((token) => token.length > 3);
    if (categoryTokens.some((token) => text.includes(token)) || /caf[eé]|coffee|cafeter[ií]a/.test(text)) {
      score += 0.1;
      reasons.push("El contenido se relaciona con el rubro del negocio");
    }

    const globalCorporateOnly = /acciones|bolsa|nasdaq|resultados financieros|ingresos trimestrales|dividendo|accionistas|ceo|wall street|cotizaci[oó]n|earnings|revenue/i.test(text)
      && !localMatch && !marketingSignals;
    if (globalCorporateOnly) {
      score -= 0.28;
      reasons.push("El foco es corporativo o financiero global, con poca utilidad para el diagnóstico local");
    }

    const name = business.nombre.toLowerCase();
    const nameOccurrences = text.split(name).length - 1;
    if (nameOccurrences <= 1 && !localMatch && !marketingSignals && (evaluated.matchScore || 0) < 0.75) {
      score -= 0.2;
      reasons.push("La marca aparece solo de manera incidental");
    }

    const recency = this.evaluateRecency(result.date);
    score += recency.adjustment;
    if (recency.reason) reasons.push(recency.reason);

    return { score: Math.max(0, Math.min(0.95, Math.round(score * 100) / 100)), reasons };
  }

  private calculateMentionEntityConfidence(
    result: any,
    evaluated: CandidateSource,
    business: Business,
    location: string
  ): number {
    const title = (result.title || "").toLowerCase();
    const snippet = (result.snippet || "").toLowerCase();
    const domain = this.extractDomain(result.url);
    const name = business.nombre.toLowerCase();
    const nameTokens = name.split(/\s+/).filter((token) => token.length > 2);
    let score = 0;

    if (nameTokens.length > 0 && nameTokens.every((token) => title.includes(token) || domain.includes(token))) score += 0.48;
    else if (nameTokens.length > 0 && nameTokens.every((token) => snippet.includes(token))) score += 0.32;

    if ((business.webUrl && this.isSameDomain(result.url, business.webUrl)) || this.domainContainsBusinessName(result.url, business.nombre)) score += 0.25;

    const locationTokens = location.toLowerCase().split(/[\s,]+/).filter((token) => token.length > 3);
    if (locationTokens.some((token) => title.includes(token) || snippet.includes(token) || domain.endsWith(".ar"))) score += 0.17;

    const categoryTokens = (business.rubro || "").toLowerCase().split(/\s+/).filter((token) => token.length > 3);
    if (categoryTokens.some((token) => title.includes(token) || snippet.includes(token)) || /caf[eé]|coffee/.test(`${title} ${snippet}`)) score += 0.1;

    if (/houston|chicago|m[eé]xico|colombia|chile|españa|madrid|barcelona|puerto rico/i.test(`${title} ${snippet}`)
      && !/buenos aires|argentina/i.test(`${title} ${snippet}`)) score -= 0.3;

    if (evaluated.status === "confirmed" && score < 0.75) score += 0.08;
    return Math.max(0, Math.min(0.95, Math.round(score * 100) / 100));
  }

  private calculateSentiment(result: any): MentionSentiment {
    const snippet = (result.snippet || "").trim();
    if (snippet.length < 180) return "unknown";

    const normalized = snippet.toLowerCase();
    const positives = ["excelente", "destacado", "crecimiento", "éxito", "exito", "recomendado", "mejoró", "mejoro"];
    const negatives = ["denuncia", "crisis", "cierre", "queja", "mala atención", "mala atencion", "fracaso", "sanción", "sancion"];
    const positiveCount = positives.filter((term) => normalized.includes(term)).length;
    const negativeCount = negatives.filter((term) => normalized.includes(term)).length;

    if (positiveCount >= 2 && negativeCount === 0) return "positive";
    if (negativeCount >= 2 && positiveCount === 0) return "negative";
    if (positiveCount > 0 && negativeCount > 0) return "neutral";
    return "unknown";
  }

  private evaluateRecency(date?: string): { adjustment: number; reason?: string } {
    if (!date) return { adjustment: 0 };
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return { adjustment: 0 };
    const ageDays = (Date.now() - parsed.getTime()) / 86_400_000;
    if (ageDays <= 365) return { adjustment: 0.07, reason: "La fuente tiene fecha reciente" };
    if (ageDays > 1095) return { adjustment: -0.08, reason: "La fuente tiene más de tres años" };
    return { adjustment: 0 };
  }

  private socialHandleMatches(url: string, businessName: string, declaredInstagram?: string): boolean {
    try {
      const handle = new URL(url).pathname.split("/").filter(Boolean)[0]?.toLowerCase() || "";
      const normalizedName = businessName.toLowerCase().replace(/[^a-z0-9]/g, "");
      const declared = (declaredInstagram || "").toLowerCase().replace(/^@/, "");
      return Boolean(handle && (handle === declared || handle.includes(normalizedName) || normalizedName.includes(handle)));
    } catch {
      return false;
    }
  }

  private domainContainsBusinessName(url: string, businessName: string): boolean {
    const domain = this.extractDomain(url).replace(/[^a-z0-9]/g, "");
    const name = businessName.toLowerCase().replace(/[^a-z0-9]/g, "");
    return name.length >= 4 && (domain.includes(name) || name.includes(domain.split(".")[0]));
  }

  private deduplicateMentions(mentions: ExternalMention[]): ExternalMention[] {
    const seen = new Set<string>();
    const unique: ExternalMention[] = [];

    for (const m of mentions) {
      const key = m.url.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(m);
      }
    }

    return unique;
  }

  private groupByType(mentions: ExternalMention[]): Record<MentionType, number> {
    const grouped: Record<MentionType, number> = {
      official_source: 0,
      earned_media: 0,
      community: 0,
      directory: 0,
      social_profile: 0,
      irrelevant: 0,
    };

    for (const m of mentions) {
      grouped[m.mentionType]++;
    }

    return grouped;
  }

  private generateFindings(mentions: ExternalMention[], businessName: string): EvidenceFinding[] {
    const findings: EvidenceFinding[] = [];
    const strong = mentions.filter((mention) => mention.evidenceConfidence === "ALTA" && mention.mentionRelevanceScore >= 0.65);
    const strongMedia = strong.filter((mention) => mention.mentionType === "earned_media");
    const strongLocal = strong.filter((mention) => /buenos aires|argentina|\.ar\b/i.test(`${mention.title} ${mention.snippet} ${mention.domain}`));
    const community = mentions.filter((mention) => mention.mentionType === "community" && mention.mentionRelevanceScore >= 0.55);

    if (strongMedia.length >= 3) {
      findings.push(this.generateFinding(
        "posicionamiento",
        "positive",
        "high",
        `Se encontraron ${strongMedia.length} coberturas editoriales relevantes y con evidencia sólida sobre ${businessName}.`,
        `Menciones externas: ${businessName}`,
        0.4,
        "ALTA"
      ));
    }

    if (strongLocal.length >= 2) {
      findings.push(this.generateFinding(
        "presencia",
        "positive",
        "medium",
        `Hay ${strongLocal.length} menciones sólidas vinculadas al mercado local analizado.`,
        `Cobertura local: ${businessName}`,
        0.35,
        "ALTA"
      ));
    }

    if (community.length >= 3) {
      findings.push(this.generateFinding(
        "posicionamiento",
        "positive",
        "medium",
        `Se observa conversación comunitaria relevante en ${community.length} fuentes públicas.`,
        `Comunidad: ${businessName}`,
        0.3,
        "MEDIA"
      ));
    }

    const usefulExternal = mentions.filter((mention) => mention.mentionType !== "official_source" && mention.mentionType !== "social_profile");
    if (mentions.length > 0 && usefulExternal.length <= 1 && strong.length === 0) {
      findings.push(this.generateFinding(
        "posicionamiento",
        "negative",
        "medium",
        "La presencia externa útil es limitada: las fuentes encontradas no alcanzan para demostrar cobertura relevante o conversación sostenida.",
        `Menciones externas: ${businessName}`,
        0.25,
        "MEDIA"
      ));
    }

    if (mentions.length === 0) {
      findings.push(this.generateFinding(
        "posicionamiento",
        "negative",
        "medium",
        "No se encontraron menciones externas relevantes del negocio en fuentes públicas.",
        `Menciones externas: ${businessName}`,
        0.3,
        "MEDIA"
      ));
    }

    return findings;
  }

  private calculateCoverage(mentions: ExternalMention[], totalEvaluated: number): number {
    if (mentions.length === 0 || totalEvaluated === 0) return 0;

    const usefulRatio = mentions.length / totalEvaluated;
    const uniqueDomains = new Set(mentions.map((mention) => mention.domain)).size;
    const usefulTypes = new Set(mentions.map((mention) => mention.mentionType)).size;
    const averageRelevance = mentions.reduce((sum, mention) => sum + mention.mentionRelevanceScore, 0) / mentions.length;
    const highQualityRatio = mentions.filter((mention) => mention.evidenceConfidence === "ALTA").length / mentions.length;
    const depthRatio = mentions.filter((mention) => mention.snippet.length >= 140).length / mentions.length;

    const usefulness = usefulRatio * 25;
    const diversity = Math.min(uniqueDomains / 5, 1) * 18 + Math.min(usefulTypes / 4, 1) * 12;
    const quality = highQualityRatio * 15;
    const depth = depthRatio * 10;
    const relevance = averageRelevance * 20;

    return Math.min(95, Math.round(usefulness + diversity + quality + depth + relevance));
  }

  private extractSourceDomain(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return url;
    }
  }

  private extractDomain(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  }

  private isSameDomain(urlA: string, urlB: string): boolean {
    try {
      const hostA = new URL(urlA).hostname.toLowerCase().replace(/^www\./, "");
      const hostB = new URL(urlB).hostname.toLowerCase().replace(/^www\./, "");
      return hostA === hostB;
    } catch {
      return false;
    }
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
