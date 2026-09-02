import { SourceAnalyzer, type SourceEvidence, type SourceRelevance, type SourceType, type EvidenceFinding, type SourceAnalysisContext } from "./source-analyzer.ts";
import { SmartSearchProvider } from "./search-source-analyzer.ts";
import type { SearchProvider } from "./providers/search-provider.ts";
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

export type CompetitorCandidateOrigin = "title" | "title_segment" | "numbered_list" | "comparison" | "snippet";

export interface RawCompetitorCandidate {
  rawText: string;
  normalizedName: string | null;
  sourceTitle: string;
  sourceSnippet: string;
  sourceUrl: string;
  query: string;
  origin: CompetitorCandidateOrigin;
  extractor: "extractRawCandidates";
}

export interface PlausibleCompetitorEntity {
  name: string;
  source: string;
  sourceUrls: string[];
  origins: CompetitorCandidateOrigin[];
  reasons: string[];
}

export interface RejectedCompetitorCandidate {
  rawText: string;
  normalizedName: string | null;
  sourceUrl: string;
  stage: "normalization" | "plausibility";
  reason: string;
}

export interface CompetitorCandidatePipeline {
  rawCandidates: RawCompetitorCandidate[];
  plausibleEntities: PlausibleCompetitorEntity[];
  rejectedCandidates: RejectedCompetitorCandidate[];
}

export class CompetitorSourceAnalyzer extends SourceAnalyzer {
  type = "competitor" as SourceType;
  requiresAuth = false;
  requiresPermission = false;

  private searchProvider: SearchProvider;

  constructor(searchProvider?: SearchProvider) {
    super();
    this.searchProvider = searchProvider || new SmartSearchProvider();
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

      const candidatePipeline = this.inspectCandidatePipeline(allResults, nombre, rubro);
      const candidateNames = candidatePipeline.plausibleEntities.map(({ name, source }) => ({ name, source }));

      if (candidateNames.length === 0) {
        return this.insufficient("No se identificaron empresas competidoras con suficiente precisión en las fuentes analizadas");
      }

      const validatedCompetitors: Competitor[] = [];
      const validationAudit: Array<Record<string, unknown>> = [];

      for (const { name, source } of candidateNames) {
        if (this.isTargetBusiness(name, nombre)) {
          validationAudit.push({ name, stage: "plausible_business_entity", decision: "rejected", reason: "target_business" });
          continue;
        }

        const presenceInfo = await this.searchOfficialPresence(name, rubro, ubicacion, nombre, context?.signal);

        if (!presenceInfo || presenceInfo.evidence.filter((item) => item.type !== "irrelevant").length === 0) {
          validationAudit.push({ name, stage: "entity_validation", decision: "rejected", reason: "no_entity_evidence", evidenceUrls: presenceInfo?.discoveryEvidenceUrls || [] });
          continue;
        }

        const entityResult = this.calculateEntityConfidence(presenceInfo, name, rubro, ubicacion);
        const entityMatchConfidence = entityResult.score;
        if (entityMatchConfidence < 0.55) {
          validationAudit.push({ name, stage: "entity_validation", decision: "rejected", entityMatchConfidence, reasons: entityResult.reasons, evidenceUrls: presenceInfo.discoveryEvidenceUrls });
          continue;
        }

        const relevanceResult = this.calculateCompetitorRelevance(presenceInfo, name, rubro, ubicacion, business.tipoCliente || undefined);
        const competitorRelevanceScore = relevanceResult.score;
        if (competitorRelevanceScore < 0.35) {
          validationAudit.push({ name, stage: "validated_entity", decision: "not_comparable", entityMatchConfidence, competitorRelevanceScore, reasons: relevanceResult.reasons, evidenceUrls: presenceInfo.discoveryEvidenceUrls });
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
        validationAudit.push({ name, stage: "comparable_competitor", decision: "accepted", entityMatchConfidence, competitorRelevanceScore, classification, evidenceUrls: presenceInfo.discoveryEvidenceUrls });
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
          candidatePipeline: {
            rawCandidates: candidatePipeline.rawCandidates,
            plausibleEntities: candidatePipeline.plausibleEntities,
            rejectedCandidates: candidatePipeline.rejectedCandidates,
            validation: validationAudit,
          },
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
    return this.inspectCandidatePipeline(results, targetName, rubro).plausibleEntities
      .map(({ name, source }) => ({ name, source }));
  }

  /** Trazabilidad explícita: resultado crudo -> entidad comercial plausible. */
  public inspectCandidatePipeline(
    results: Array<{ result: any; query: string }>,
    targetName: string,
    rubro: string
  ): CompetitorCandidatePipeline {
    const rawCandidates: RawCompetitorCandidate[] = [];
    const rejectedCandidates: RejectedCompetitorCandidate[] = [];
    const grouped = new Map<string, {
      name: string;
      sourceUrls: Set<string>;
      origins: Set<CompetitorCandidateOrigin>;
      raw: RawCompetitorCandidate[];
    }>();

    for (const { result, query } of results) {
      if (!this.isValidDiscoverySource(result)) continue;
      const extracted = this.extractRawCandidates(result.title || "", result.snippet || "", result.url || "", query || "");
      rawCandidates.push(...extracted);

      for (const raw of extracted) {
        if (!raw.normalizedName) {
          rejectedCandidates.push({ rawText: raw.rawText, normalizedName: null, sourceUrl: raw.sourceUrl, stage: "normalization", reason: "empty_or_malformed" });
          continue;
        }
        const key = this.normalizeForComparison(raw.normalizedName);
        const current = grouped.get(key) || {
          name: raw.normalizedName,
          sourceUrls: new Set<string>(),
          origins: new Set<CompetitorCandidateOrigin>(),
          raw: [],
        };
        current.sourceUrls.add(raw.sourceUrl);
        current.origins.add(raw.origin);
        current.raw.push(raw);
        if (raw.normalizedName.length > current.name.length) current.name = raw.normalizedName;
        grouped.set(key, current);
      }
    }

    const plausibleEntities: PlausibleCompetitorEntity[] = [];
    for (const group of Array.from(grouped.values())) {
      const decision = this.evaluateBusinessPlausibility(group.name, group.raw, rubro);
      const isTarget = this.isTargetBusiness(group.name, targetName);
      if (!decision.plausible || isTarget) {
        rejectedCandidates.push({
          rawText: group.raw[0]?.rawText || group.name,
          normalizedName: group.name,
          sourceUrl: group.raw[0]?.sourceUrl || "",
          stage: "plausibility",
          reason: isTarget ? "target_business" : decision.reason,
        });
        continue;
      }
      plausibleEntities.push({
        name: group.name,
        source: group.raw[0]?.sourceUrl || "",
        sourceUrls: Array.from(group.sourceUrls),
        origins: Array.from(group.origins),
        reasons: decision.reasons,
      });
    }

    return { rawCandidates, plausibleEntities, rejectedCandidates };
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

  private extractRawCandidates(title: string, snippet: string, sourceUrl: string, query: string): RawCompetitorCandidate[] {
    const found: Array<{ text: string; origin: CompetitorCandidateOrigin }> = [];
    const add = (text: string, origin: CompetitorCandidateOrigin) => {
      const value = text.replace(/\s+/g, " ").trim();
      if (value) found.push({ text: value, origin });
    };

    for (const segment of title.split(/\s+(?:\||–|—|·|:)\s+/g)) {
      add(segment, segment === title ? "title" : "title_segment");
    }

    const combined = `${title}. ${snippet}`;
    const listPattern = /(?:^|[.;•]\s*|\s)(?:\d{1,2}[.)]|[-•])\s*([^.;|•]+)/g;
    for (const match of Array.from(combined.matchAll(listPattern))) add(match[1], "numbered_list");

    const comparisonPattern = /([^.;|]+?)\s+(?:vs\.?|versus)\s+([^.;|]+)/gi;
    for (const match of Array.from(combined.matchAll(comparisonPattern))) {
      add(match[1], "comparison");
      add(match[2], "comparison");
    }

    const namedEntityPattern = /\b([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ0-9&'’.-]*(?:\s+(?:(?:de|del|la|las|los|y|&)\s+)?[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ0-9&'’.-]*)*)/g;
    for (const sentence of snippet.split(/[.;•]/g)) {
      for (const match of Array.from(sentence.matchAll(namedEntityPattern))) add(match[1], "snippet");
    }

    const seen = new Set<string>();
    return found.map(({ text, origin }) => ({
      rawText: text,
      normalizedName: this.normalizeCandidateName(text),
      sourceTitle: title,
      sourceSnippet: snippet,
      sourceUrl,
      query,
      origin,
      extractor: "extractRawCandidates" as const,
    })).filter((item) => {
      const key = `${item.origin}:${item.normalizedName || item.rawText}`.toLocaleLowerCase("es");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  public normalizeCandidateName(value: string): string | null {
    const cleaned = value
      .replace(/[’‘]/g, "'")
      .replace(/^\s*(?:\d{1,2}[.)]|[-•])\s*/, "")
      .replace(/\s+(?:en|cerca de)\s+[^,.;|]+$/i, "")
      .replace(/^[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]+/, "")
      .replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9'&.-]+$/, "")
      .replace(/\s+/g, " ")
      .trim();

    return cleaned || null;
  }
  public looksLikeBusinessCandidate(candidate: string, categoryTokens: string[]): boolean {
    const raw: RawCompetitorCandidate = { rawText: candidate, normalizedName: candidate, sourceTitle: candidate, sourceSnippet: "", sourceUrl: "test://candidate", query: "", origin: "numbered_list", extractor: "extractRawCandidates" };
    return this.evaluateBusinessPlausibility(candidate, [raw], categoryTokens.join(" ")).plausible;
  }

  private evaluateBusinessPlausibility(candidate: string, raw: RawCompetitorCandidate[], rubro: string): { plausible: boolean; reason: string; reasons: string[] } {
    const normalized = this.normalizeForComparison(candidate);
    const genericCategories = new Set(["cafe", "cafeteria", "coffee", "shop", "store", "tienda", "restaurant", "restaurante", "bar", "bakery", "panaderia", "gimnasio", "gym"]);
    if (genericCategories.has(normalized)) return { plausible: false, reason: "generic_category_only", reasons: [] };
    if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ0-9]/.test(candidate)) return { plausible: false, reason: "no_name_characters", reasons: [] };
    if (/\b(?:ranking|lista|mejores|alternativas|resultados|búsqueda|noticia|artículo|review|reseña|vs|versus)\b/i.test(candidate)) {
      return { plausible: false, reason: "editorial_or_query_fragment", reasons: [] };
    }

    const origins = new Set(raw.map((item) => item.origin));
    const independentUrls = new Set(raw.map((item) => item.sourceUrl).filter(Boolean));
    const categoryTokens = this.getCategoryHints(rubro).tokens.map((token) => this.normalizeForComparison(token)).filter((token) => token.length > 2);
    const hasCategoryDescriptor = categoryTokens.some((token) => normalized.includes(token));
    const urlAligned = raw.some((item) => this.urlContainsCandidate(item.sourceUrl, candidate));
    const structuredMention = ["numbered_list", "comparison"].some((origin) => origins.has(origin as CompetitorCandidateOrigin));
    const properNameForm = /^[A-ZÁÉÍÓÚÑ0-9][A-Za-zÁÉÍÓÚÑáéíóúñ0-9&'’.-]*(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ0-9&'’.-]+)*$/.test(candidate);
    const reasons: string[] = [];
    if (structuredMention) reasons.push("structured_search_result_mention");
    if (urlAligned) reasons.push("source_url_matches_name");
    if (independentUrls.size >= 2) reasons.push("repeated_across_sources");
    if (hasCategoryDescriptor) reasons.push("contains_business_category_descriptor");

    const plausible = properNameForm && (structuredMention || urlAligned || independentUrls.size >= 2 || hasCategoryDescriptor);
    return { plausible, reason: plausible ? "plausible_business_entity" : "insufficient_business_context", reasons };
  }

  private normalizeForComparison(value: string): string {
    return value.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  }

  private urlContainsCandidate(url: string, candidate: string): boolean {
    try {
      const parsed = new URL(url);
      const haystack = this.normalizeForComparison(`${parsed.hostname.replace(/^www\./, "")} ${parsed.pathname}`);
      const tokens = this.normalizeForComparison(candidate).split(" ").filter((token) => token.length > 1);
      return tokens.length > 0 && tokens.every((token) => haystack.includes(token));
    } catch {
      return false;
    }
  }

  private isTargetBusiness(candidateName: string, targetName: string): boolean {
    const normCandidate = this.normalizeForComparison(candidateName);
    const normTarget = this.normalizeForComparison(targetName);

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
      const normalizedName = this.normalizeForComparison(candidateName).replace(/\s+/g, "");

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
      const normalizedName = this.normalizeForComparison(candidateName).replace(/\s+/g, "");
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
      const normTarget = this.normalizeForComparison(targetName).replace(/\s+/g, "");
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
    let score = 0.0;
    const reasons: string[] = [];
    const evidenceText = presenceInfo.evidence.map((item) => `${item.label} ${item.snippet || ""}`).join(" ").toLowerCase();
    const allUrls = `${presenceInfo.officialWebsite || ""} ${presenceInfo.officialSocialProfile || ""} ${presenceInfo.discoveryEvidenceUrls.join(" ")}`.toLowerCase();
    const fullText = `${evidenceText} ${allUrls}`;
    const categoryHints = this.getCategoryHints(rubro);

    if (categoryHints.tokens.some((token) => token.length > 3 && fullText.includes(token))) {
      score += 0.25;
      reasons.push(`Mismo rubro comprobado (${rubro})`);
    }

    const locationTokens = ubicacion.toLowerCase().split(/[\s,]+/).filter((token) => token.length > 3);
    if (locationTokens.some((token) => evidenceText.includes(token) || allUrls.includes(token))) {
      score += 0.20;
      reasons.push(`Mismo mercado comprobado (${ubicacion})`);
    }

    if (/menu|carta|caf[eé]|coffee|producto|servicio|especialidad|tostado|grano|bean|latte|cappuccino|americano|medialunas|facturas|pastelería|pizza|hamburguesa/i.test(evidenceText)) {
      score += 0.20;
      reasons.push("Productos o servicios comparables detectados en evidencia");
    }

    if (/desayuno|merienda|almuerzo|cena|takeaway|delivery|trabajar|reuni[oó]n|consulta|reserva/i.test(evidenceText)) {
      score += 0.10;
      reasons.push("Ocasión de consumo comparable");
    }

    if (/cadena|franquicia|sucursal|local|tienda|suscripci[oó]n|marketplace|venta online/i.test(evidenceText)) {
      score += 0.10;
      reasons.push("Modelo comercial comparable");
    }

    if (/premium|especialidad|artesanal|rápido|rapido|económico|economico|experiencia|calidad/i.test(evidenceText)) {
      score += 0.05;
      reasons.push("Propuesta de valor comparable");
    }

    if (/local|sucursal|sede|direcci[oó]n|horario/i.test(evidenceText)) {
      score += 0.05;
      reasons.push("Presencia física en el mercado");
    }

    if (tipoCliente && /b2c|consumidor|retail|personas/i.test(tipoCliente.toLowerCase())) {
      if (/consumidor|cliente|retail|personas|familiar|amigos|reunión|trabajo|oficina|estudiar/i.test(evidenceText)) {
        score += 0.15;
        reasons.push("Público objetivo coincidente (B2C)");
      }
    } else if (tipoCliente && /b2b|empresa|corporativo/i.test(tipoCliente.toLowerCase())) {
      if (/empresa|corporativo|profesional|equipos/i.test(evidenceText)) {
        score += 0.15;
        reasons.push("Público objetivo coincidente (B2B)");
      }
    }

    if (ubicacion) {
      const locLower = ubicacion.toLowerCase();
      const hasLocalDomain = presenceInfo.officialWebsite && (
        (locLower.includes("argentina") && /\.ar$/i.test(presenceInfo.officialWebsite)) ||
        (locLower.includes("chile") && /\.cl$/i.test(presenceInfo.officialWebsite)) ||
        (locLower.includes("mexico") && /\.mx$/i.test(presenceInfo.officialWebsite))
      );
      if (hasLocalDomain) {
        score += 0.05;
        reasons.push("Dominio local (.ar)");
      }
    }

    const evidenceQualityBonus = presenceInfo.evidence.filter((e) => e.type !== "irrelevant").length >= 3 ? 0.05 : 0;
    if (evidenceQualityBonus > 0) {
      score += evidenceQualityBonus;
      reasons.push("Múltiples fuentes de evidencia corroboran");
    }

    return { score: Math.min(Math.max(score, 0), 0.95), reasons };
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
    let score = 0.15;
    const reasons: string[] = ["Presencia en línea detectada"];
    const normalizedName = this.normalizeForComparison(candidateName).replace(/\s+/g, "");
    const normalizedWords = candidateName.toLowerCase().split(/\s+/).filter((word) => word.length > 2);
    const evidenceText = presenceInfo.evidence.map((item) => `${item.label} ${item.snippet || ""}`).join(" ").toLowerCase();
    const allUrls = `${presenceInfo.officialWebsite || ""} ${presenceInfo.officialSocialProfile || ""} ${presenceInfo.discoveryEvidenceUrls.join(" ")}`.toLowerCase();

    let hasWebsite = false;
    let hasSocial = false;
    let domainNameMatches = false;
    let handleMatches = false;
    let nameInEvidence = false;
    let rubroInEvidence = false;

    if (presenceInfo.officialWebsite) {
      hasWebsite = true;
      try {
        const hostname = new URL(presenceInfo.officialWebsite).hostname.toLowerCase().replace(/^www\./, "");
        domainNameMatches = hostname.includes(normalizedName) || normalizedName.includes(hostname.replace(/\..+$/, ""));
        if (domainNameMatches) {
          score += 0.35;
          reasons.push("Nombre visible en el dominio del sitio web oficial");
        } else {
          score += 0.05;
          reasons.push("Sitio web encontrado pero el dominio no coincide con el nombre del negocio");
        }
      } catch {
        score += 0.05;
      }
    }

    if (presenceInfo.officialSocialProfile) {
      hasSocial = true;
      try {
        const pathname = new URL(presenceInfo.officialSocialProfile).pathname.toLowerCase();
        const handle = pathname.split("/").filter(Boolean)[0] || "";
        handleMatches = handle.includes(normalizedName) || normalizedName.includes(handle);
        if (handleMatches) {
          score += 0.25;
          reasons.push("Handle de red social coincide con el nombre del negocio");
        } else {
          score += 0.05;
          reasons.push("Perfil social encontrado pero el handle no coincide con el nombre del negocio");
        }
      } catch {
        score += 0.05;
      }
    }

    nameInEvidence = normalizedWords.length > 0 && normalizedWords.every((word) => evidenceText.includes(word));
    if (nameInEvidence) {
      score += 0.15;
      reasons.push("Nombre del negocio referenciado en evidencia pública");
    }

    const rubroTokens = rubro.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
    rubroInEvidence = rubroTokens.some((token) => token.length > 3 && (evidenceText.includes(token) || allUrls.includes(token)));
    if (rubroInEvidence) {
      score += 0.10;
      reasons.push(`Rubro (${rubro}) mencionado en la evidencia`);
    }

    const locationTokens = ubicacion.toLowerCase().split(/[\s,]+/).filter((t) => t.length > 3 && t !== "buenos" && t !== "aires");
    if (locationTokens.some((token) => evidenceText.includes(token) || allUrls.includes(token))) {
      score += 0.05;
      reasons.push("Ubicación mencionada en la evidencia");
    }

    const corroboratingSources = new Set(
      presenceInfo.evidence
        .filter((item) => item.type === "earned_media" || item.type === "directory" || item.type === "community")
        .map((item) => item.url)
        .filter(Boolean)
    );
    const corroboratingCount = Array.from(corroboratingSources).length;
    if (corroboratingCount >= 2) {
      score += 0.10;
      reasons.push("Múltiples fuentes independientes corroboran la entidad");
    } else if (corroboratingCount === 1) {
      score += 0.05;
      reasons.push("Una fuente independiente corrobora la entidad");
    }

    if (hasWebsite && hasSocial && domainNameMatches && handleMatches) {
      score += 0.05;
      reasons.push("Website y perfil social son consistentes entre sí");
    }

    if (!nameInEvidence && !domainNameMatches && !handleMatches) {
      score -= 0.15;
      reasons.push("Sin evidencia directa del nombre del negocio");
    }

    if (!rubroInEvidence) {
      score -= 0.05;
      reasons.push("Rubro no verificado en evidencia");
    }

    if (presenceInfo.officialWebsite && !domainNameMatches) {
      const hostname = (() => {
        try { return new URL(presenceInfo.officialWebsite).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
      })();
      const thirdPartyIndicators = ["mitiendanube", "tiendanube", "shopify", "wix", "squarespace", "latamcoffeetrip", "buenosairesconnect", "yolk-projects"];
      if (thirdPartyIndicators.some((indicator) => hostname.includes(indicator))) {
        score -= 0.20;
        reasons.push("Sitio web es una plataforma de terceros, no un dominio propio");
      }
    }

    return { score: Math.min(Math.max(score, 0.1), 0.95), reasons };
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
