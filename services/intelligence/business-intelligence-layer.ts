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

export interface BusinessIntelligenceResult {
  aggregatedEvidence: AggregatedEvidence;
  coverage: CoverageResult;
  digitalScore: DigitalScoreResult;
  nuvraScore: NuvraScoreResult;
  evaluatedAt: Date;
  discoveryResult?: DiscoveryResult;
  businessProfile: BusinessProfile;
}

export class BusinessIntelligenceLayer {
  private aggregator: EvidenceAggregator;

  constructor() {
    this.aggregator = new EvidenceAggregator();
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
    this.aggregator.registerSource(new IntegrationSourceAnalyzer("x", "x"));
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

    // 1. Agregar evidencia de las fuentes registradas
    const aggregatedEvidence = await this.aggregator.aggregate(targetBusiness, context);

    // 2. Integrar estado de fuentes descubiertas (Requisitos 2, 4 y 5)
    if (discoveryResult) {
      this.enrichEvidenceWithDiscovery(aggregatedEvidence, discoveryResult);
    }
    this.enrichEvidenceWithDeclaredContext(aggregatedEvidence, targetBusiness, objectiveFromBusiness(targetBusiness));
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
    const objective = (targetBusiness as Business & { goals?: Array<{ objetivo?: string }> }).goals?.[0]?.objetivo;
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
      discoveryResult,
      businessProfile,
    };
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
    // Un perfil público confirmado aporta evidencia aunque las métricas privadas requieran OAuth.
    if (discovery.primaryInstagram && (!aggregated.sources.instagram || aggregated.sources.instagram.status !== "evaluated")) {
      const candidate = discovery.allCandidates.find((item) => item.type === "instagram" && item.url === discovery.primaryInstagram);
      const declared = Boolean(discovery.target.declaredInstagram);
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
      };
      aggregated.sources.instagram = {
        source: "instagram",
        status: "evaluated",
        data: { url: discovery.primaryInstagram, title: candidate?.title, publicDescription: candidate?.snippet || null, publicOnly: true },
        findings: [publicFinding],
        confidence,
        coverage: candidate?.snippet ? 45 : 30,
        evaluatedAt: new Date(),
        requiresAuth: true,
        metadata: {
          reason: "Perfil público identificado; las métricas privadas requieren autorización.",
          discoveredUrl: discovery.primaryInstagram,
          privateMetricsAvailable: false,
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
    };
    return mapping[category] || "presencia";
  }
}

function objectiveFromBusiness(business: Business): string | undefined {
  return (business as Business & { goals?: Array<{ objetivo?: string }> }).goals?.[0]?.objetivo;
}
