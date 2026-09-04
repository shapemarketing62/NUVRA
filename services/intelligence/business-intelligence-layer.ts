import { SourceAnalyzer, SourceEvidence, type EvidenceFinding } from "./source-analyzer";
import { WebSourceAnalyzer } from "./web-source-analyzer";
import { SearchSourceAnalyzer } from "./search-source-analyzer";
import { ReviewsSourceAnalyzer } from "./reviews-source-analyzer";
import { ExternalMentionsSourceAnalyzer } from "./external-mentions-analyzer";
import { CompetitorSourceAnalyzer } from "./competitor-analyzer";
import { EvidenceAggregator, AggregatedEvidence, CoverageResult, CoverageCalculator } from "./evidence-aggregator";
import { DigitalScoreCalculator, DigitalScoreResult } from "./digital-score-calculator";
import { NuvraScoreCalculator, NuvraScoreResult } from "./nuvra-score-calculator";
import type { DiscoveryResult } from "@/services/discovery/business-discovery-service";
import type { Business } from "@prisma/client";
import { IntegrationSourceAnalyzer } from "@/services/integrations/integration-source-analyzer";
import { buildBusinessProfile, type BusinessProfile } from "./business-profile";
import { SocialPlatformSourceAnalyzer } from "./social/social-source-analyzer.ts";
import { createDefaultSocialProviders } from "./social/social-providers.ts";
import { enrichCrossSourceReputation } from "./social/cross-source-reputation.ts";
import { enrichMultisourceBrandIdentity } from "./social/multisource-brand-identity.ts";
import { buildInstagramDiscoveredAccess } from "./social/instagram-access.ts";
import { PlatformDiscoveryService, type PlatformDiscoveryReport } from "@/services/discovery/platform-discovery-service.ts";
import { WebsiteCrossLinkExtractor } from "@/services/discovery/website-cross-link-extractor.ts";
import { CrossLinkCorroboration } from "@/services/discovery/cross-link-corroboration.ts";
import { PlatformDiscoveryPlanner } from "@/services/discovery/platform-discovery-planner.ts";
import type { BusinessDiscoveryService } from "@/services/discovery/business-discovery-service.ts";

export interface BusinessIntelligenceResult {
  aggregatedEvidence: AggregatedEvidence;
  coverage: CoverageResult;
  digitalScore: DigitalScoreResult;
  nuvraScore: NuvraScoreResult;
  evaluatedAt: Date;
  discoveryResult?: DiscoveryResult;
  businessProfile: BusinessProfile;
  /** Per-platform discovery + validation report. Always present after
   * `analyze()`. Contains PlatformStatus entries that map onto the
   * sourceStatuses in the AnalysisHistory snapshot. */
  platformDiscoveryReport: PlatformDiscoveryReport;
}

export class BusinessIntelligenceLayer {
  private aggregator: EvidenceAggregator;
  private readonly platformDiscoverySearch?: Pick<BusinessDiscoveryService, "discover">;

  constructor(options: { platformDiscoverySearch?: Pick<BusinessDiscoveryService, "discover"> } = {}) {
    this.aggregator = new EvidenceAggregator();
    this.platformDiscoverySearch = options.platformDiscoverySearch;
    this.registerDefaultSources();
  }

  private registerDefaultSources(): void {
    // Registrar fuentes de evidencia
    this.aggregator.registerSource(new WebSourceAnalyzer());
    this.aggregator.registerSource(new SearchSourceAnalyzer());
    this.aggregator.registerSource(new ReviewsSourceAnalyzer());
    this.aggregator.registerSource(new ExternalMentionsSourceAnalyzer());
    this.aggregator.registerSource(new CompetitorSourceAnalyzer());
    this.aggregator.registerSource(new IntegrationSourceAnalyzer("instagram", "instagram"));
    for (const provider of createDefaultSocialProviders()) this.aggregator.registerSource(new SocialPlatformSourceAnalyzer(provider));
  }

  registerSource(analyzer: SourceAnalyzer): void {
    this.aggregator.registerSource(analyzer);
  }

  async analyze(business: Business, discoveryResult?: DiscoveryResult, context: { signal?: AbortSignal } = {}): Promise<BusinessIntelligenceResult> {
    console.log("[BI_LAYER] Starting business intelligence analysis for:", business.nombre);

    // Si tenemos una URL descubierta confirmed/probable y business no tenía web, usarla dinámicamente
    const targetBusiness: Business = { ...business };
    if (!targetBusiness.webUrl && discoveryResult?.primaryWebUrl) {
      targetBusiness.webUrl = discoveryResult.primaryWebUrl;
    }

    // 1. Analyze the website first. Only a validated official website may
    //    act as an ownership hub for social profiles. The result is then
    //    reused by the full aggregation, so the website is never fetched twice.
    const webPhase = await this.aggregator.aggregate(targetBusiness, context, { includeSources: ["web"] });
    const websiteEvidence = webPhase.sources.web;
    const pages: import("@/services/website-analyzer/types").PageAnalysisData[] =
      (websiteEvidence?.data && typeof websiteEvidence.data === "object" && Array.isArray((websiteEvidence.data as any).pages))
        ? ((websiteEvidence.data as any).pages as import("@/services/website-analyzer/types").PageAnalysisData[])
        : [];
    const officialWebsiteValidated = this.isOfficialWebsiteValidated(business, targetBusiness, discoveryResult, websiteEvidence);
    const crossLinks = officialWebsiteValidated ? WebsiteCrossLinkExtractor.fromPageAnalyses(pages) : [];
    const corroboratedLinks = CrossLinkCorroboration.evaluate({ links: crossLinks });
    const platformLinks = Object.fromEntries(
      corroboratedLinks
        .filter((result) => result.urls.length === 1 && result.level !== "inconsistent" && result.level !== "none")
        .map((result) => [result.platform, result.urls[0]])
    );
    (targetBusiness as Business & { validatedPlatformLinks?: Record<string, string> }).validatedPlatformLinks = platformLinks;

    const platformContext = this.platformContext(targetBusiness);
    const discoveryPlan = PlatformDiscoveryPlanner.plan({
      target: platformContext.target,
      declared: platformContext.declared,
      webCrossLinkHints: Object.fromEntries(corroboratedLinks.filter((item) => item.level !== "inconsistent" && item.level !== "none").map((item) => [item.platform, true])),
    });
    const selectedPlatforms = PlatformDiscoveryPlanner.selectForExecution(discoveryPlan);
    const selectedSocial = selectedPlatforms
      .map((entry) => String(entry.platform))
      .filter((platform): platform is import("./source-analyzer.ts").SourceType => ["instagram", "x", "tiktok", "reddit", "facebook", "linkedin", "youtube"].includes(platform));
    const instagramBudget = selectedPlatforms.find((entry) => entry.platform === "instagram")?.maxQueries || 0;
    Object.assign(targetBusiness, {
      platformDiscoveryQueryCaps: Object.fromEntries(selectedPlatforms.map((entry) => [entry.platform, entry.maxQueries])),
      platformDiscoveryGlobalMaxQueries: Math.max(0, discoveryPlan.globalMaxQueries - instagramBudget),
    });

    // 2. Aggregate the remaining sources with the web result preloaded.
    //    Social collectors can use validated cross-links directly and avoid
    //    redundant indexed searches for profiles already owned by the business.
    const aggregatedEvidence = await this.aggregator.aggregate(targetBusiness, context, {
      preloaded: { web: websiteEvidence },
      includeSources: ["search", "reviews", "external_mentions", "competitor", ...selectedSocial],
    });

    // 3. Build the per-platform report after website + platform analyzers ran.
    const platformDiscoveryReport = await this.buildPlatformDiscoveryReport(targetBusiness, aggregatedEvidence, discoveryResult, context, crossLinks, officialWebsiteValidated);

    // 2b. Integrate state from BusinessDiscoveryService (kept as-is to
    //     preserve the existing scoring behavior).
    const effectiveDiscovery = platformDiscoveryReport.rawDiscovery || discoveryResult;
    if (effectiveDiscovery) {
      this.enrichEvidenceWithDiscovery(aggregatedEvidence, effectiveDiscovery);
    }
    // 2c. Apply the platform-discovery statuses on top. Important:
    //     this layer only ADDS metadata + discovery evidence. It does
    //     NOT downgrade existing evaluated sources, does NOT touch
    //     the scoring math, and does NOT turn a missing platform
    //     into a negative finding. VALIDATED but with no public
    //     analyzer leaves the source at "discovered" (no findings).
    this.enrichEvidenceWithPlatformDiscovery(aggregatedEvidence, platformDiscoveryReport);
    this.enrichEvidenceWithDeclaredContext(aggregatedEvidence, targetBusiness, objectiveFromBusiness(targetBusiness));
    const objective = objectiveFromBusiness(targetBusiness);
    enrichCrossSourceReputation(aggregatedEvidence, objective);
    enrichMultisourceBrandIdentity(aggregatedEvidence);
    const businessProfile = buildBusinessProfile(targetBusiness as Business & { goals?: Array<{ objetivo?: string; magnitud?: number | null; plazoDias?: number; plazoLabel?: string }> }, aggregatedEvidence);

    console.log("[BI_LAYER] Evidence aggregated:", {
      sourcesEvaluated: Object.values(aggregatedEvidence.sources).filter((s) => s.status === "evaluated").length,
      totalFindings: aggregatedEvidence.findings.length,
    });

    // 3. Calcular coverage dinámico
    const coverage = CoverageCalculator.calculate(aggregatedEvidence, targetBusiness);
    console.log("[BI_LAYER] Coverage calculated:", {
      overallMarketingCoverage: coverage.overallMarketingCoverage,
      canCalculateNuvraScore: coverage.canCalculateNuvraScore,
      evaluatedSources: coverage.evaluatedSources,
      missingSources: coverage.missingSources,
      requiresAuthSources: coverage.requiresAuthSources,
      relevantSources: coverage.relevantSources,
    });

    // 4. Calcular Digital Score (basado en web)
    const webEvidence = aggregatedEvidence.sources.web;
    const digitalScore = DigitalScoreCalculator.calculate(webEvidence);

    // 5. Calcular Nuvra Score (basado en evidence agregada)
    const nuvraScore = NuvraScoreCalculator.calculate(aggregatedEvidence, coverage, { objective, businessProfile });
    console.log("[BI_LAYER] Nuvra Score calculated:", {
      total: nuvraScore.total,
      confidence: nuvraScore.confidence,
      requiresMoreSources: nuvraScore.requiresMoreSources,
      reason: nuvraScore.reason,
    });

    return {
      aggregatedEvidence,
      coverage,
      digitalScore,
      nuvraScore,
      evaluatedAt: new Date(),
      discoveryResult: effectiveDiscovery,
      businessProfile,
      platformDiscoveryReport,
    };
  }

  /**
   * Build the per-platform discovery report. The report is the
   * single source of truth for which platforms the analysis
   * considered, in what status, and with what evidence. It reuses:
   *
   *   * WebsiteCrossLinkExtractor.fromPageAnalyses()  — the
   *     `outboundLinks` field already populated by the page
   *     analyzer at analyze-time (zero re-parse, zero extra network).
   *   * PlatformDiscoveryPlanner.plan()               — the same
   *     relevance + priority order the rest of the codebase uses.
   *   * The existing BusinessDiscoveryService           — invoked
   *     ONLY when the plan still has search-only or
   *     search-and-provider entries AFTER the cross-link
   *     corroboration is applied.
   */
  private async buildPlatformDiscoveryReport(
    business: Business,
    aggregated: AggregatedEvidence,
    discoveryResult: DiscoveryResult | undefined,
    context: { signal?: AbortSignal },
    crossLinks: import("@/services/discovery/website-cross-link-extractor.ts").WebsiteCrossLink[],
    officialWebsiteValidated: boolean
  ): Promise<PlatformDiscoveryReport> {
    const { declared, target: socialTarget } = this.platformContext(business);
    // Always reuse the existing discovery if it was already done by
    // the pipeline. We pass it as the `discoveryService` argument so
    // PlatformDiscoveryService never re-runs Tavily / DDG.
    const report = await PlatformDiscoveryService.run({
      target: socialTarget,
      websitePages: [], // not used; we pass pre-computed crossLinks below
      crossLinks,
      officialWebsiteValidated,
      businessHost: business.webUrl ? safeHost(business.webUrl) : undefined,
      declared,
      signal: context?.signal,
      // Reuse the already-computed discovery to avoid double Tavily /
      // double DDG. The pipeline's own run-analysis already called
      // BusinessDiscoveryService.discover. The platform service
      // receives the same candidates and never re-runs the search.
      ...(this.platformDiscoverySearch ? { discoveryService: this.platformDiscoverySearch } : {}),
      _prebuiltDiscovery: discoveryResult,
      sourceEvidence: aggregated.sources,
    } as any);
    return report;
  }

  private platformContext(business: Business) {
    const declared: Partial<Record<string, boolean>> = {
      website: !!business.webUrl && !business.noWebDeclared,
      instagram: !!business.instagramHandle && !business.noInstagramDeclared,
    };
    const channelText = String(business.canales || "").toLowerCase();
    for (const platform of ["tiktok", "facebook", "linkedin", "youtube"] as const) {
      if (channelText.includes(platform)) declared[platform] = true;
    }
    if (/(^|\s)(x|twitter)(\s|$)/.test(channelText)) declared.x = true;
    const goal = (business as Business & { goals?: Array<{ objetivo?: string }> }).goals?.[0]?.objetivo || null;
    return {
      declared,
      target: {
        businessId: business.id,
        name: business.nombre,
        industry: business.rubro || "",
        location: [business.ubicacion, business.ciudad, business.pais].filter((value): value is string => Boolean(value?.trim())).join(", ") || null,
        website: business.webUrl || null,
        phone: null,
        customerType: business.tipoCliente || null,
        objective: goal,
        declaredChannels: business.canales || null,
      },
    };
  }

  private isOfficialWebsiteValidated(
    original: Business,
    analyzed: Business,
    discovery: DiscoveryResult | undefined,
    webEvidence: import("./source-analyzer.ts").SourceEvidence | undefined
  ): boolean {
    if (webEvidence?.status !== "evaluated" || !analyzed.webUrl) return false;
    if (!original.noWebDeclared && Boolean(original.webUrl)) return sameHost(original.webUrl!, analyzed.webUrl);
    return Boolean(discovery?.confirmedSources.some((candidate) => candidate.type === "web" && sameHost(candidate.url, analyzed.webUrl!)));
  }

  /** Apply discovery status as metadata only. Presence is not performance. */
  private enrichEvidenceWithPlatformDiscovery(
    aggregated: AggregatedEvidence,
    report: PlatformDiscoveryReport
  ): void {
    // The website entry is the HUB: when it was actually analyzed
    // we keep its "evaluated" status. When it was not, but the
    // business declared one, we mark it as "not_evaluated" without
    // penalizing.
    for (const entry of report.entries) {
      if (entry.platform === "website") {
        const ev = aggregated.sources.web;
        if (ev) {
          ev.metadata = { ...ev.metadata, platformStatus: entry.status, platformReason: entry.reason };
        }
        continue;
      }
      const sourceKey = entry.platform === "google_business_profile" ? "reviews" : entry.platform;
      const ev = (aggregated.sources as any)[sourceKey];
      if (!ev) continue;
      ev.metadata = {
        ...ev.metadata,
        platformStatus: entry.status,
        platformReason: entry.reason,
        platformCrossLinkLevel: entry.crossLink?.level || null,
        platformDiscoveredUrl: entry.url || null,
      };
    }
  }

  private enrichEvidenceWithDeclaredContext(aggregated: AggregatedEvidence, business: Business, objective?: string): void {
    if (!/volver|recompra|recurren|fideliza|clientes actuales/i.test(objective || "")) return;
    const declared = business.otrosCanales?.trim();
    if (!declared || !/lista|cliente|whatsapp|recordatorio|seguimiento|recomendaci|post.?venta/i.test(declared)) return;
    const finding: EvidenceFinding = {
      id: `declared-retention-${business.id}`,
      category: "retencion",
      type: "positive",
      impact: "medium",
      evidence: `El negocio informó una base para volver a contactar clientes: ${declared}`,
      source: "other",
      attribution: "Información aportada por el negocio",
      weight: 0.55,
      confidence: "MEDIA",
    };
    aggregated.findings.push(finding);
    aggregated.deduplicated.push(finding);
    (aggregated.byCategory.retencion ||= []).push(finding);
    (aggregated.byDimension.retencion ||= []).push(finding);
  }

  /**
   * Enriquece la evidencia agregada con el resultado del Discovery Engine:
   * - Aplica ajuste de peso/confianza a candidatos 'probable' (Requisito 2).
   * - Marca fuentes sociales o APIs no conectadas como 'requires_auth' (Requisito 3, 4 y 5).
   */
  private enrichEvidenceWithDiscovery(
    aggregated: AggregatedEvidence,
    discovery: DiscoveryResult
  ): void {
    const searchEvidence = aggregated.sources.search;
    if (searchEvidence) {
      searchEvidence.metadata = {
        ...searchEvidence.metadata,
        discoveryStatus: discovery.status || "legacy_unknown",
        discoveryQueryAttempts: discovery.queryAttempts || [],
        discoveryCandidateCount: discovery.allCandidates.length,
      };
    }

    const externalCandidates = discovery.allCandidates.filter((candidate) => candidate.type === "mentions" && ["confirmed", "probable"].includes(candidate.status || ""));
    if (externalCandidates.length && aggregated.sources.external_mentions) {
      aggregated.sources.external_mentions.metadata = {
        ...aggregated.sources.external_mentions.metadata,
        discoveryCandidates: externalCandidates.map((candidate) => ({ url: candidate.url, status: candidate.status, entityMatchConfidence: candidate.matchScore })),
        discoveryNote: "Estas fuentes corroboran presencia o identidad; no se convierten automáticamente en un hallazgo positivo.",
      };
    }

    const mapsCandidate = discovery.allCandidates.find((candidate) => candidate.type === "google_maps" && ["confirmed", "probable"].includes(candidate.status || ""));
    if (mapsCandidate && (!aggregated.sources.reviews || aggregated.sources.reviews.status !== "evaluated")) {
      const previous = aggregated.sources.reviews;
      aggregated.sources.reviews = {
        source: "reviews",
        status: "unavailable",
        data: { publicListingDiscovered: true, url: mapsCandidate.url, entityMatchConfidence: mapsCandidate.matchScore },
        findings: previous?.findings || [],
        confidence: "INSUFICIENTE",
        coverage: 0,
        evaluatedAt: new Date(),
        requiresAuth: previous?.requiresAuth || false,
        metadata: {
          ...previous?.metadata,
          finalStatus: "discovered",
          discoveredUrl: mapsCandidate.url,
          entityMatchConfidence: mapsCandidate.matchScore,
          reason: "Se identificó una ficha pública compatible, pero no se obtuvieron rating ni reseñas verificables.",
        },
      };
    }

    // Un perfil público confirmado aporta evidencia aunque las métricas privadas requieran OAuth.
    if (discovery.primaryInstagram && (!aggregated.sources.instagram || aggregated.sources.instagram.status !== "evaluated")) {
      const candidate = discovery.allCandidates.find((item) => item.type === "instagram" && item.url === discovery.primaryInstagram);
      const declared = Boolean(discovery.target.declaredInstagram);
      const instagramAccess = buildInstagramDiscoveredAccess({ url: discovery.primaryInstagram, title: candidate?.title, snippet: candidate?.snippet, declared });
      const confidence: "ALTA" | "MEDIA" = declared || candidate?.status === "confirmed" ? "ALTA" : "MEDIA";
      const publicFinding: EvidenceFinding = {
        id: `instagram-public-${Buffer.from(discovery.primaryInstagram).toString("base64url").slice(0, 20)}`,
        category: "redes",
        type: "neutral" as const,
        impact: "low" as const,
        evidence: `Se identificó el perfil público oficial de Instagram, pero su existencia por sí sola no demuestra utilidad comercial: ${discovery.primaryInstagram}.`,
        source: "instagram" as const,
        attribution: candidate?.title || "Perfil aportado o descubierto públicamente",
        weight: 0.25,
        confidence,
        acquisitionMethod: declared ? "declared_by_user" : "search_index",
      };
      aggregated.sources.instagram = {
        source: "instagram",
        status: "unavailable",
        data: instagramAccess.data,
        findings: [publicFinding],
        confidence: "INSUFICIENTE",
        coverage: 0,
        evaluatedAt: new Date(),
        requiresAuth: true,
        metadata: {
          reason: instagramAccess.limitation,
          discoveredUrl: discovery.primaryInstagram,
          privateMetricsAvailable: false,
          finalStatus: "discovered",
          acquisitionMethods: [instagramAccess.acquisitionMethod],
          sourceCoverage: instagramAccess.sourceCoverage,
        },
      };
      if (candidate?.snippet) {
        const hasDirectStep = /whatsapp|reserv|turno|pedid|compr|contact|link/i.test(candidate.snippet);
        const bioFinding: EvidenceFinding = {
          id: `instagram-public-description-${Buffer.from(discovery.primaryInstagram).toString("base64url").slice(0, 20)}`,
          category: hasDirectStep ? "conversion" : "propuesta",
          type: hasDirectStep ? "positive" : "neutral",
          impact: hasDirectStep ? "medium" : "low",
          evidence: `Descripción pública observada en Instagram: ${candidate.snippet}`,
          source: "instagram",
          attribution: discovery.primaryInstagram,
          weight: hasDirectStep ? 0.55 : 0.3,
          confidence,
          acquisitionMethod: declared ? "declared_by_user" : "search_index",
        };
        aggregated.sources.instagram.findings.push(bioFinding);
        aggregated.findings.push(bioFinding);
        aggregated.deduplicated.push(bioFinding);
        (aggregated.byCategory[bioFinding.category] ||= []).push(bioFinding);
        (aggregated.byDimension[bioFinding.category] ||= []).push(bioFinding);
      }
      aggregated.findings.push(publicFinding);
      aggregated.deduplicated.push(publicFinding);
      (aggregated.byCategory.redes ||= []).push(publicFinding);
      (aggregated.byDimension.redes ||= []).push(publicFinding);
    }

    // Si X / Twitter fue descubierto, marcar como requires_auth si no hay API
    const xDiscovered = discovery.allCandidates.find((c) => c.type === "x" && ["confirmed", "probable"].includes(c.status || ""));
    if (xDiscovered && (!aggregated.sources.x || aggregated.sources.x.status !== "evaluated")) {
      aggregated.sources.x = {
        source: "x",
        status: "requires_auth",
        data: { url: xDiscovered.url },
        findings: [],
        confidence: "INSUFICIENTE",
        coverage: 0,
        evaluatedAt: new Date(),
        requiresAuth: true,
        metadata: {
          reason: "Perfil de X descubierto. Se requiere Twitter API Key para analizar publicaciones.",
          discoveredUrl: xDiscovered.url,
        },
      };
    }

    // Ajustar findings provenientes de candidatos con status 'probable' (Requisito 2)
    const probableUrls = new Set(discovery.probableSources.map((s) => s.url.toLowerCase()));

    for (const finding of aggregated.findings) {
      if (probableUrls.has(finding.attribution.toLowerCase())) {
        // Reducir peso y asegurar confianza MEDIA/BAJA para hallazgos 'probable'
        finding.weight = Math.round(finding.weight * 0.6 * 100) / 100;
        if (finding.confidence === "ALTA") {
          finding.confidence = "MEDIA";
        }
      }
    }
  }

  getLegacyFindings(biResult: BusinessIntelligenceResult): any[] {
    const legacyFindings: any[] = [];
    
    for (const finding of biResult.aggregatedEvidence.findings) {
      const contextual = biResult.businessProfile.contextualFindings.find((item) => item.findingId === finding.id);
      legacyFindings.push({
        type: finding.type === "positive" ? "strength" : finding.type === "negative" ? "problem" : "info",
        category: finding.category,
        severity: finding.impact === "high" ? "high" : finding.impact === "medium" ? "medium" : "low",
        title: contextual?.interpretation || finding.category.charAt(0).toUpperCase() + finding.category.slice(1),
        description: contextual?.goalRelation || finding.evidence,
        evidence: finding.evidence,
        pageUrl: finding.attribution,
        source: finding.source,
        confidence: finding.confidence,
        impact: finding.impact,
      });
    }

    return legacyFindings;
  }

  getLegacyDimensions(biResult: BusinessIntelligenceResult): any[] {
    if (biResult.nuvraScore.total === null) {
      // Si el score total es null, devolver dimensiones con sus puntos respectivos (null si sin datos)
      return biResult.nuvraScore.dimensions.map((d) => ({
        slug: d.slug,
        name: d.name,
        points: d.points,
        weight: biResult.nuvraScore.methodology.dimensionWeights[d.slug]?.combinedWeight ?? 0,
        criteria: d.scoringSignals || [],
        strengths: d.findings.filter((f) => f.type === "positive").map((f) => f.evidence),
        problems: d.findings.filter((f) => f.type === "negative").map((f) => f.evidence),
        source: d.sources.join(", "),
        confidence: d.confidence,
        findings: [],
      }));
    }

    return biResult.nuvraScore.dimensions.map((d) => ({
      slug: d.slug,
      name: d.name,
      points: d.points,
      weight: biResult.nuvraScore.methodology.dimensionWeights[d.slug]?.combinedWeight ?? 0,
      criteria: d.scoringSignals || [],
      strengths: d.findings.filter((f) => f.type === "positive").map((f) => f.evidence),
      problems: d.findings.filter((f) => f.type === "negative").map((f) => f.evidence),
      source: d.sources.join(", "),
      confidence: d.confidence,
      findings: this.getLegacyFindings(biResult).filter(
        (lf: any) => this.mapCategoryToDimension(lf.category) === d.slug
      ),
    }));
  }

  private mapCategoryToDimension(category: string): string {
    const mapping: Record<string, string> = {
      presencia: "presencia",
      ux: "conversion",
      conversion: "conversion",
      trust: "posicionamiento",
      posicionamiento: "posicionamiento",
      propuesta: "propuesta",
      redes: "redes",
      adquisicion: "adquisicion",
      seo: "adquisicion",
      retencion: "retencion",
      identidad: "identidad",
    };
    return mapping[category] || "presencia";
  }
}

function objectiveFromBusiness(business: Business): string | undefined {
  return (business as Business & { goals?: Array<{ objetivo?: string }> }).goals?.[0]?.objetivo;
}

function safeHost(url: string): string | undefined {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return undefined; }
}

function sameHost(a: string, b: string): boolean {
  return Boolean(safeHost(a) && safeHost(a) === safeHost(b));
}
