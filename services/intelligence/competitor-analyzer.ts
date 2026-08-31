import { SourceAnalyzer, type SourceEvidence, type SourceRelevance, type SourceType, type EvidenceFinding, type SourceAnalysisContext } from "./source-analyzer.ts";
import { SmartSearchProvider } from "./search-source-analyzer.ts";
import type { Business } from "@prisma/client";

export interface CompetitorEvidence {
  type: "official_source" | "earned_media" | "community" | "directory" | "social_profile" | "irrelevant";
  label: string;
  url?: string;
  snippet?: string;
}

export interface Competitor {
  name: string;
  competitorType: "direct" | "partial" | "indirect";
  officialWebsite: string | null;
  officialSocialProfile: string | null;
  location?: string;
  entityMatchConfidence: number;
  competitorRelevanceScore: number;
  evidence: CompetitorEvidence[];
  rationale: string;
  reason: string;
  classification: "confirmed_competitor" | "probable_competitor" | "uncertain" | "rejected";
  discoveryEvidenceUrls: string[];
  entityConfidenceReasons: string[];
  competitorRelevanceReasons: string[];
}

interface BusinessWithGoals extends Business {
  goals?: Array<{ objetivo?: string }>;
}

interface PresenceInfo {
  officialWebsite: string | null;
  officialSocialProfile: string | null;
  location?: string;
  discoveryEvidenceUrls: string[];
  evidence: CompetitorEvidence[];
}

export class CompetitorSourceAnalyzer extends SourceAnalyzer {
  type = "competitor" as SourceType;
  requiresAuth = false;
  requiresPermission = false;

  private searchProvider: SmartSearchProvider;

  constructor() {
    super();
    this.searchProvider = new SmartSearchProvider();
  }

  isAvailable(business: Business): boolean {
    return !!business.nombre && !!business.rubro;
  }

  isRelevant(business: Business): SourceRelevance {
    const businessWithGoals = business as BusinessWithGoals;
    const rubro = businessWithGoals.rubro?.toLowerCase() || "";
    const objetivo = businessWithGoals.goals?.[0]?.objetivo?.toLowerCase() || "";

    let weight = businessWithGoals.ubicacion ? 0.15 : 0.1;
    let relevant = Boolean(businessWithGoals.nombre && businessWithGoals.rubro);

    if (/competidor|posicion|diferencial|ventaja|vs|ranking/i.test(objetivo)) {
      weight = 0.15;
      relevant = true;
    }

    if (/restaurante|cafe|comida|delivery|ecom|tienda|retail|servicio|saas|software/i.test(rubro)) {
      weight = 0.12;
      relevant = true;
    }

    return {
      source: this.type,
      relevant,
      reason: relevant ? "Competencia proporciona contexto de posicionamiento y benchmarking" : "Competencia menos relevante para este objetivo",
      weight,
    };
  }

  async analyze(business: Business, context?: SourceAnalysisContext): Promise<SourceEvidence> {
    const businessWithGoals = business as BusinessWithGoals;
    const nombre = businessWithGoals.nombre;
    const rubro = businessWithGoals.rubro || "";
    const ubicacion = businessWithGoals.ubicacion || "";

    if (!nombre || !rubro) {
      return this.unavailable("Nombre y rubro son requeridos para análisis de competencia");
    }

    try {
      const categoryHints = this.getCategoryHints(rubro);
      const queries = [
        `competidores de ${nombre} ${rubro} ${ubicacion}`.trim(),
        `alternativas a ${nombre} ${rubro} ${ubicacion}`.trim(),
        `${categoryHints.primary} ${ubicacion} ${categoryHints.discoveryQualifier}`.trim(),
        `${nombre} versus ${categoryHints.primary} ${ubicacion}`.trim(),
        `${categoryHints.primary} ${ubicacion} empresas similares`.trim(),
      ];

      const allResults: Array<{ result: any; query: string }> = [];

      for (const query of queries) {
        if (context?.signal?.aborted) throw Object.assign(new Error("competitor_search_canceled"), { name: "AbortError" });
        try {
          const results = await this.searchProvider.search(query, business, { signal: context?.signal });
          for (const result of results) {
            allResults.push({ result, query });
          }
        } catch (err) {
          if (context?.signal?.aborted) throw err;
          console.warn(`[COMPETITOR_ANALYZER] Query failed: "${query}"`, err instanceof Error ? err.message : String(err));
        }
      }

      if (allResults.length === 0) {
        return this.insufficient("No se encontraron resultados para análisis de competencia");
      }

      const candidateNames = this.extractCompetitorNames(allResults, nombre, rubro);

      if (candidateNames.length === 0) {
        return this.insufficient("No se identificaron empresas competidoras con suficiente precisión en las fuentes analizadas");
      }

      const validatedCompetitors: Competitor[] = [];

      for (const { name, source } of candidateNames) {
        if (this.isTargetBusiness(name, nombre)) continue;

        const presenceInfo = await this.searchOfficialPresence(name, rubro, ubicacion, nombre, context?.signal);

        if (!presenceInfo || presenceInfo.evidence.filter((item) => item.type !== "irrelevant").length === 0) {
          continue;
        }

        const entityResult = this.calculateEntityConfidence(presenceInfo, name, rubro, ubicacion);
        const entityMatchConfidence = entityResult.score;
        if (entityMatchConfidence < 0.55) {
          continue;
        }

        const relevanceResult = this.calculateCompetitorRelevance(presenceInfo, name, rubro, ubicacion, business.tipoCliente || undefined);
        const competitorRelevanceScore = relevanceResult.score;
        if (competitorRelevanceScore < 0.35) {
          continue;
        }

        let classification: Competitor["classification"] = "uncertain";
        if (entityMatchConfidence >= 0.75 && competitorRelevanceScore >= 0.67) {
          classification = "confirmed_competitor";
        } else if (entityMatchConfidence >= 0.62 && competitorRelevanceScore >= 0.48) {
          classification = "probable_competitor";
        }

        const competitorType = this.calculateCompetitorType(presenceInfo, name, rubro, ubicacion);
        const rationale = this.buildCompetitorReason(presenceInfo, name, rubro, ubicacion, competitorRelevanceScore, competitorType);

        validatedCompetitors.push({
          name,
          competitorType,
          officialWebsite: presenceInfo.officialWebsite,
          officialSocialProfile: presenceInfo.officialSocialProfile,
          location: presenceInfo.location || ubicacion || undefined,
          entityMatchConfidence,
          competitorRelevanceScore,
          evidence: [
            { type: "earned_media" as const, label: "Fuente pública de descubrimiento", url: source },
            ...presenceInfo.evidence,
          ].slice(0, 6),
          rationale,
          reason: rationale,
          classification,
          discoveryEvidenceUrls: Array.from(new Set([source, ...presenceInfo.discoveryEvidenceUrls])).filter(Boolean),
          entityConfidenceReasons: entityResult.reasons,
          competitorRelevanceReasons: relevanceResult.reasons,
        });
      }

      const uniqueCompetitors = this.deduplicateCompetitors(validatedCompetitors);
      const topCompetitors = uniqueCompetitors
        .sort((a, b) => b.competitorRelevanceScore - a.competitorRelevanceScore)
        .slice(0, 5);

      const findings = this.generateFindings(topCompetitors, nombre, rubro);
      const coverage = this.calculateCoverage(topCompetitors, candidateNames.length);
      const confidence = coverage >= 70 ? "ALTA" : coverage >= 45 ? "MEDIA" : "BAJA";

      return {
        source: this.type,
        status: "evaluated",
        data: {
          competitors: topCompetitors,
          totalCandidatesExtracted: candidateNames.length,
          totalValidated: topCompetitors.length,
        },
        findings,
        confidence,
        coverage,
        evaluatedAt: new Date(),
        requiresAuth: false,
        metadata: {
          totalCandidatesExtracted: candidateNames.length,
          totalValidated: topCompetitors.length,
          competitors: topCompetitors,
        },
      };
    } catch (error) {
      return this.unavailable(error instanceof Error ? error.message : String(error));
    }
  }

  private extractCompetitorNames(
    results: Array<{ result: any; query: string }>,
    targetName: string,
    rubro: string
  ): Array<{ name: string; source: string }> {
    const names: Array<{ name: string; source: string }> = [];
    const seen = new Set<string>();

    for (const { result } of results) {
      if (!this.isValidDiscoverySource(result)) {
        continue;
      }

      const title = result.title || "";
      const snippet = result.snippet || "";
      const candidates = this.extractNameCandidatesFromText(title, snippet, rubro);

      for (const candidate of candidates) {
        const normalized = candidate.toLowerCase();
        if (!seen.has(normalized) && !this.isTargetBusiness(candidate, targetName)) {
          seen.add(normalized);
          names.push({ name: candidate, source: result.url });
        }
      }
    }

    return names;
  }

  private isValidDiscoverySource(result: any): boolean {
    const url = (result.url || "").toLowerCase();
    if (!url) return false;

    const excludedDomains = ["youtube.com", "tiktok.com", "reddit.com", "wikipedia.org", "mercadolibre.com"];
    if (excludedDomains.some((domain) => url.includes(domain))) {
      return false;
    }
    return true;
  }

  private extractNameCandidatesFromText(title: string, snippet: string, rubro: string): string[] {
    const categoryHints = this.getCategoryHints(rubro);
    const candidates = new Set<string>();
    const textBlocks = [title, ...title.split(/[-|:·]/g), ...snippet.split(/[.;•]/g)];

    for (const rawBlock of textBlocks) {
      const block = rawBlock
        .replace(/^\d+\.\s*/, "")
        .replace(/\b(mejores|best|ranking|top|lista|alternativas|vs|versus|review|reseña|guía|guide)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();

      if (!block) continue;

      const properNouns = block.match(/[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ&'.-]+(?:\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ&'.-]+){0,3}/g) || [];
      for (const rawCandidate of properNouns) {
        const candidate = this.normalizeCandidateName(rawCandidate);
        if (candidate && this.looksLikeBusinessCandidate(candidate, categoryHints.tokens)) {
          candidates.add(candidate);
        }
      }
    }

    return Array.from(candidates);
  }

  private normalizeCandidateName(value: string): string | null {
    const cleaned = value
      .replace(/^[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]+/, "")
      .replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]+$/, "")
      .replace(/\s+/g, " ")
      .trim();

    if (cleaned.length < 3 || cleaned.length > 60) {
      return null;
    }

    return cleaned;
  }

  private looksLikeBusinessCandidate(candidate: string, categoryTokens: string[]): boolean {
    const lower = candidate.toLowerCase();

    const genericStandaloneCandidates = new Set([
      "cafe", "café", "cafeteria", "cafetería", "coffee", "shop", "shops", "specialty", "store", "tienda",
    ]);
    if (genericStandaloneCandidates.has(lower)) {
      return false;
    }

    if (/\b(diario|art[ií]culo|noticia|blog|review|ranking|lista|foro|comunidad)\b/i.test(lower)) {
      return false;
    }

    if (/^(los|las|el|la|mejores|best|ranking|top|lista)$/i.test(lower)) {
      return false;
    }

    const businessSignals = /(café|cafe|coffee|cafetería|tienda|store|studio|estudio|clínica|clinica|consultora|agency|lab|market|bar|burger|pizza|pizzeria|pizzería|bakery|resto)/i;
    const properSingleWordName = !candidate.includes(" ") && /^[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ0-9&'-]{2,}$/.test(candidate);
    return properSingleWordName || businessSignals.test(candidate) || categoryTokens.some((token) => token.length > 3 && lower.includes(token));
  }

  private isTargetBusiness(candidateName: string, targetName: string): boolean {
    const normCandidate = candidateName.toLowerCase().trim();
    const normTarget = targetName.toLowerCase().trim();

    if (normCandidate === normTarget) return true;
    if (normCandidate.startsWith(normTarget) || normTarget.startsWith(normCandidate)) return true;

    const wordsA = Array.from(new Set(normCandidate.split(/\s+/).filter((word) => word.length > 2)));
    const wordsB = Array.from(new Set(normTarget.split(/\s+/).filter((word) => word.length > 2)));
    const intersection = new Set(wordsA.filter((word) => wordsB.includes(word)));
    const union = new Set([...wordsA, ...wordsB]);

    return union.size > 0 && intersection.size / union.size > 0.7;
  }

  private async searchOfficialPresence(name: string, rubro: string, ubicacion: string, targetName: string, signal?: AbortSignal): Promise<PresenceInfo> {
    try {
      const query = `"${name}" ${rubro} ${ubicacion} sitio oficial`;
      const results = await this.searchProvider.search(query, {} as any, { signal });

      let officialWebsite: string | null = null;
      let officialSocialProfile: string | null = null;
      let location: string | undefined;
      const discoveryEvidenceUrls: string[] = [];
      const evidence: CompetitorEvidence[] = [];

      for (const result of results) {
        if (this.isTargetBusiness(name, targetName) || this.urlMatchesTarget(result.url, targetName)) {
          continue;
        }

        const sourceType = this.classifySource(result.url, result.title || "", result.snippet || "", name);
        const inferredLocation = this.extractLocationFromText(`${result.title || ""} ${result.snippet || ""}`);

        if (sourceType === "official_source" && !officialWebsite && this.isLikelyOfficialPresence(result.url, name)) {
          officialWebsite = result.url;
          location = inferredLocation || location;
          evidence.push({
            type: "official_source",
            label: result.title || `Sitio oficial de ${name}`,
            url: result.url,
            snippet: result.snippet || "",
          });
          continue;
        }

        if (sourceType === "social_profile" && !officialSocialProfile && this.isLikelyOfficialPresence(result.url, name)) {
          officialSocialProfile = result.url;
          location = inferredLocation || location;
          evidence.push({
            type: "social_profile",
            label: result.title || `Perfil social oficial de ${name}`,
            url: result.url,
            snippet: result.snippet || "",
          });
          continue;
        }

        if (sourceType !== "irrelevant") discoveryEvidenceUrls.push(result.url);
        evidence.push({
          type: sourceType,
          label: result.title || `Referencia pública de ${name}`,
          url: result.url,
          snippet: result.snippet || "",
        });
      }

      if (officialWebsite && !this.isValidOfficialWebsite(officialWebsite, name)) {
        officialWebsite = null;
      }

      return {
        officialWebsite,
        officialSocialProfile,
        location,
        discoveryEvidenceUrls,
        evidence: evidence.slice(0, 6),
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      return {
        officialWebsite: null,
        officialSocialProfile: null,
        discoveryEvidenceUrls: [],
        evidence: [],
      };
    }
  }

  private classifySource(url: string, title: string, snippet: string, candidateName: string): CompetitorEvidence["type"] {
    const lowerUrl = url.toLowerCase();
    const lowerTitle = title.toLowerCase();
    const lowerSnippet = snippet.toLowerCase();
    const normalizedCandidate = candidateName.toLowerCase().replace(/\s+/g, "");

    if (lowerUrl.includes("instagram.com/") || lowerUrl.includes("facebook.com/") || lowerUrl.includes("linkedin.com/") || lowerUrl.includes("x.com/")) {
      return this.isLikelyOfficialPresence(url, candidateName) ? "social_profile" : "community";
    }

    if (/youtube\.com|tiktok\.com|reddit\.com|foro|forum/.test(lowerUrl)) return "community";
    if (/tripadvisor\.com|yelp\.com|restaurantguru\.com|google\.[^/]+\/maps|yellowpages|paginasamarillas|pedidosya\.com|rappi\.com/.test(lowerUrl)) {
      return "directory";
    }
    if (/infobae\.com|clarin\.com|lanacion\.com|medium\.com|blog|news|noticia|diario|revista/.test(lowerUrl) || /ranking|mejores|top|lista|guía|guide|review|blog|noticia|artículo/i.test(lowerTitle)) {
      return "earned_media";
    }
    if (this.isLikelyOfficialPresence(url, candidateName) && (lowerTitle.includes(candidateName.toLowerCase()) || lowerSnippet.includes(candidateName.toLowerCase()) || lowerUrl.includes(normalizedCandidate))) {
      return "official_source";
    }
    return "irrelevant";
  }

  private isValidOfficialWebsite(url: string, candidateName: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
      const normalizedName = candidateName.toLowerCase().replace(/\s+/g, "");

      const ecommercePlatforms = [
        "mitiendanube.com", "tiendanube.com", "shopify.com", "wix.com",
        "squarespace.com", "bigcartel.com", "etsy.com",
      ];

      if (ecommercePlatforms.some((domain) => hostname.includes(domain))) {
        return false;
      }

      return hostname.includes(normalizedName) || normalizedName.includes(hostname.replace(/\..+$/, ""));
    } catch {
      return false;
    }
  }

  private isLikelyOfficialPresence(url: string, candidateName: string): boolean {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
      const pathname = parsed.pathname.toLowerCase();
      const normalizedName = candidateName.toLowerCase().replace(/\s+/g, "");
      const handle = pathname.split("/").filter(Boolean)[0] || "";
      const slug = hostname.replace(/\..+$/, "");

      if (hostname.includes("instagram.com") || hostname.includes("facebook.com") || hostname.includes("linkedin.com") || hostname.includes("x.com")) {
        return handle.includes(normalizedName) || normalizedName.includes(handle);
      }

      return hostname.includes(normalizedName) || normalizedName.includes(slug);
    } catch {
      return false;
    }
  }

  private urlMatchesTarget(url: string, targetName: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
      const normTarget = targetName.toLowerCase().replace(/\s+/g, "");
      return hostname.includes(normTarget) || normTarget.includes(hostname);
    } catch {
      return false;
    }
  }

  private calculateCompetitorRelevance(
    presenceInfo: PresenceInfo,
    candidateName: string,
    rubro: string,
    ubicacion: string,
    tipoCliente?: string
  ): { score: number; reasons: string[] } {
    let weightedEvidence = 0;
    let observedWeight = 0;
    const reasons: string[] = [];
    const text = presenceInfo.evidence.map((item) => `${item.label} ${item.snippet || ""}`).join(" ").toLowerCase();
    const categoryHints = this.getCategoryHints(rubro);
    const addFactor = (weight: number, matches: boolean, reason: string) => {
      observedWeight += weight;
      if (matches) {
        weightedEvidence += weight;
        reasons.push(reason);
      }
    };

    addFactor(0.3, categoryHints.tokens.some((token) => text.includes(token)), `Mismo rubro comprobado (${rubro})`);

    const locationTokens = ubicacion.toLowerCase().split(/[\s,]+/).filter((token) => token.length > 3);
    addFactor(0.2, locationTokens.length > 0 && locationTokens.some((token) => text.includes(token)), `Mismo mercado comprobado (${ubicacion})`);
    addFactor(0.16, /menu|carta|caf[eé]|coffee|producto|servicio|especialidad|consulta|turno|reserva|software|plataforma/i.test(text), "Productos o servicios comparables");
    addFactor(0.1, /desayuno|merienda|almuerzo|cena|takeaway|delivery|trabajar|reuni[oó]n|consulta|reserva/i.test(text), "Ocasión de consumo comparable");
    addFactor(0.08, /cadena|franquicia|sucursal|local|tienda|suscripci[oó]n|marketplace|venta online/i.test(text), "Modelo comercial comparable");
    addFactor(0.06, /premium|especialidad|artesanal|rápido|rapido|económico|economico|experiencia|calidad/i.test(text), "Propuesta de valor comparable");
    addFactor(0.06, /local|sucursal|sede|direcci[oó]n|horario/i.test(text), "Presencia física en el mercado");
    if (tipoCliente) {
      const expectsBusiness = /b2b|empresa|corporativo|profesional/i.test(tipoCliente);
      const comparableAudience = expectsBusiness
        ? /empresa|corporativo|profesional|equipos/i.test(text)
        : /personas|consumidor|familia|público|publico|clientes/i.test(text);
      addFactor(0.04, comparableAudience, "Tipo de cliente comparable");
    }

    const score = observedWeight === 0 ? 0 : weightedEvidence / observedWeight;
    return { score: Math.round(Math.min(score, 0.95) * 100) / 100, reasons };
  }

  private calculateCompetitorType(
    presenceInfo: PresenceInfo,
    candidateName: string,
    rubro: string,
    ubicacion: string
  ): "direct" | "partial" | "indirect" {
    const lowerName = candidateName.toLowerCase();
    const text = `${presenceInfo.officialWebsite || ""} ${presenceInfo.officialSocialProfile || ""} ${presenceInfo.discoveryEvidenceUrls.join(" ")} ${presenceInfo.evidence.map((item) => `${item.label} ${item.snippet || ""}`).join(" ")}`.toLowerCase();
    const categoryHints = this.getCategoryHints(rubro);

    let score = 0;
    if (categoryHints.tokens.some((token) => lowerName.includes(token) || text.includes(token))) score += 0.42;

    const locationTokens = ubicacion.toLowerCase().split(/[\s,]+/).filter((token) => token.length > 3);
    if (locationTokens.some((token) => text.includes(token))) {
      score += 0.25;
    }

    if (/menu|precio|producto|servicio|carta|especialidad|consulta|turno|reserva|pack|plan/i.test(text)) {
      score += 0.2;
    }

    if (/cliente|personas|empresa|retail|profesional|familia/i.test(text)) {
      score += 0.13;
    }

    if (score >= 0.72) return "direct";
    if (score >= 0.45) return "partial";
    return "indirect";
  }

  private buildCompetitorReason(
    presenceInfo: PresenceInfo,
    candidateName: string,
    rubro: string,
    ubicacion: string,
    relevance: number,
    competitorType: Competitor["competitorType"]
  ): string {
    const text = `${presenceInfo.officialWebsite || ""} ${presenceInfo.officialSocialProfile || ""} ${presenceInfo.discoveryEvidenceUrls.join(" ")} ${presenceInfo.evidence.map((item) => `${item.label} ${item.snippet || ""}`).join(" ")}`.toLowerCase();
    const reasons: string[] = [];
    const categoryHints = this.getCategoryHints(rubro);

    if (categoryHints.tokens.some((token) => text.includes(token))) {
      reasons.push(`misma categoría (${rubro})`);
    }

    const locationTokens = ubicacion.toLowerCase().split(/[\s,]+/).filter((token) => token.length > 3);
    if (locationTokens.some((token) => text.includes(token))) {
      reasons.push(`misma zona o mercado (${ubicacion})`);
    }

    if (/menu|precio|producto|servicio|consulta|turno|reserva|pack|plan/i.test(text)) {
      reasons.push("oferta comparable");
    }

    if (presenceInfo.officialWebsite) {
      reasons.push("sitio oficial verificado");
    }

    if (presenceInfo.officialSocialProfile) {
      reasons.push("perfil social oficial");
    }

    if (reasons.length === 0) {
      return `${candidateName} aparece como competidor ${competitorType} con evidencia pública limitada y relevancia estimada de ${Math.round(relevance * 100)}%.`;
    }

    return `${candidateName} se clasificó como competidor ${competitorType} por ${reasons.join(", ")}. Relevancia estimada: ${Math.round(relevance * 100)}%.`;
  }

  private calculateEntityConfidence(
    presenceInfo: PresenceInfo,
    candidateName: string,
    rubro: string,
    ubicacion: string
  ): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];
    const normalizedName = candidateName.toLowerCase().replace(/\s+/g, "");
    const text = presenceInfo.evidence.map((item) => `${item.label} ${item.snippet || ""}`).join(" ").toLowerCase();
    const normalizedWords = candidateName.toLowerCase().split(/\s+/).filter((word) => word.length > 2);

    if (presenceInfo.officialWebsite) {
      try {
        const hostname = new URL(presenceInfo.officialWebsite).hostname.toLowerCase().replace(/^www\./, "");
        if (hostname.includes(normalizedName) || normalizedName.includes(hostname.replace(/\..+$/, ""))) {
          score += 0.45;
          reasons.push("Nombre del negocio visible en el dominio oficial");
        }
      } catch {
        // noop
      }
    }

    if (presenceInfo.officialSocialProfile) {
      try {
        const pathname = new URL(presenceInfo.officialSocialProfile).pathname.toLowerCase();
        const handle = pathname.split("/").filter(Boolean)[0] || "";
        if (handle.includes(normalizedName) || normalizedName.includes(handle)) {
          score += 0.25;
          reasons.push("Handle social alineado con el nombre del negocio");
        }
      } catch {
        // noop
      }
    }

    if (normalizedWords.length > 0 && normalizedWords.every((word) => text.includes(word))) {
      score += 0.2;
      reasons.push("El nombre completo aparece en la evidencia pública");
    }

    if (presenceInfo.officialWebsite && presenceInfo.officialSocialProfile) {
      score += 0.1;
      reasons.push("Website y red social se corroboran entre sí");
    }

    const corroboratingSources = new Set(
      presenceInfo.evidence
        .filter((item) => item.type === "earned_media" || item.type === "directory" || item.type === "community")
        .map((item) => item.url)
        .filter(Boolean)
    ).size;
    if (corroboratingSources >= 2) {
      score += 0.15;
      reasons.push("Dos o más fuentes independientes corroboran la entidad");
    } else if (corroboratingSources === 1) {
      score += 0.08;
      reasons.push("Una fuente independiente corrobora la entidad");
    }

    return { score: Math.min(score, 0.95), reasons };
  }

  private deduplicateCompetitors(competitors: Competitor[]): Competitor[] {
    const seen = new Set<string>();
    const unique: Competitor[] = [];

    for (const competitor of competitors) {
      const key = competitor.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(competitor);
      }
    }

    return unique;
  }

  private generateFindings(competitors: Competitor[], businessName: string, rubro: string): EvidenceFinding[] {
    const findings: EvidenceFinding[] = [];

    const confirmed = competitors.filter((competitor) => competitor.classification === "confirmed_competitor");
    const probable = competitors.filter((competitor) => competitor.classification === "probable_competitor");

    if (confirmed.length > 0) {
      findings.push(this.generateFinding(
        "posicionamiento",
        "neutral",
        "medium",
        `Se identificaron ${confirmed.length} competidor(es) con evidencia suficiente en el rubro "${rubro}": ${confirmed.map((competitor) => competitor.name).join(", ")}.`,
        `Competencia: ${businessName}`,
        0.4,
        "MEDIA"
      ));
    }

    if (probable.length > 0) {
      findings.push(this.generateFinding(
        "posicionamiento",
        "neutral",
        "low",
        `Se detectaron ${probable.length} competidor(es) probables con evidencia parcial: ${probable.map((competitor) => competitor.name).join(", ")}.`,
        `Competencia: ${businessName}`,
        0.2,
        "BAJA"
      ));
    }

    if (competitors.length === 0) {
      findings.push(this.generateFinding(
        "posicionamiento",
        "neutral",
        "low",
        "No se encontraron competidores con suficiente evidencia pública para mostrarlos con confianza.",
        `Competencia: ${businessName}`,
        0.1,
        "BAJA"
      ));
    }

    return findings;
  }

  private calculateCoverage(competitors: Competitor[], totalCandidates: number): number {
    if (competitors.length === 0 || totalCandidates === 0) return 0;

    const confirmed = competitors.filter((item) => item.classification === "confirmed_competitor").length;
    const probable = competitors.filter((item) => item.classification === "probable_competitor").length;
    const withOfficialSource = competitors.filter((item) => item.officialWebsite || item.officialSocialProfile).length;
    const evidenceDepth = competitors.reduce((sum, item) => sum + Math.min(item.evidence.filter((e) => e.type !== "irrelevant").length, 3), 0);
    const possibleEvidenceDepth = competitors.length * 3;

    const quality = ((confirmed + probable * 0.65) / competitors.length) * 45;
    const officialVerification = (withOfficialSource / competitors.length) * 25;
    const depth = (evidenceDepth / possibleEvidenceDepth) * 20;
    const candidateReview = Math.min(totalCandidates, 10) / 10 * 10;

    return Math.min(95, Math.round(quality + officialVerification + depth + candidateReview));
  }

  private getCategoryHints(rubro: string): { primary: string; discoveryQualifier: string; tokens: string[] } {
    const lower = rubro.toLowerCase();

    if (/caf[eé]|coffee|cafeter/i.test(lower)) {
      return {
        primary: "cafeterías",
        discoveryQualifier: "negocios locales",
        tokens: ["cafeter", "café", "cafe", "coffee", "specialty"],
      };
    }

    if (/clin|salud|dent|psic/i.test(lower)) {
      return {
        primary: "clínicas",
        discoveryQualifier: "opciones cercanas",
        tokens: ["clin", "salud", "médic", "medic", "consultorio", "turno"],
      };
    }

    if (/saas|software|crm|app|tech|tecnolog/i.test(lower)) {
      return {
        primary: "software",
        discoveryQualifier: "alternativas",
        tokens: ["software", "saas", "app", "platform", "crm"],
      };
    }

    if (/consult|agencia|studio|estudio|servicio/i.test(lower)) {
      return {
        primary: "agencias",
        discoveryQualifier: "empresas similares",
        tokens: ["agencia", "agency", "consult", "studio", "estudio", "servicio"],
      };
    }

    return {
      primary: rubro || "negocios",
      discoveryQualifier: "empresas similares",
      tokens: lower.split(/\s+/).filter((token) => token.length > 3),
    };
  }

  private extractLocationFromText(text: string): string | undefined {
    const match = text.match(/\b(Buenos Aires|Córdoba|Cordoba|Rosario|Mendoza|Chile|México|Mexico|Argentina|Uruguay|Madrid|Barcelona)\b/i);
    return match?.[0];
  }

  private insufficient(reason: string): SourceEvidence {
    return {
      source: this.type,
      status: "evaluated",
      data: {
        competitors: [],
        totalCandidatesExtracted: 0,
        totalValidated: 0,
      },
      findings: [
        this.generateFinding(
          "posicionamiento",
          "neutral",
          "low",
          reason,
          "Competencia: insuficiente",
          0.1,
          "BAJA"
        ),
      ],
      confidence: "INSUFICIENTE",
      coverage: 0,
      evaluatedAt: new Date(),
      requiresAuth: false,
      metadata: { reason, insufficient: true },
    };
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
