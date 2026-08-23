import type { AggregatedEvidence, CoverageResult } from "./evidence-aggregator";
import type { EvidenceFinding, SourceType } from "./source-analyzer";
import type { BusinessProfile } from "./business-profile";

export type NuvraScoreStatus = "pending" | "preliminary" | "complete";

export interface NuvraScoreResult {
  total: number | null;
  dimensions: NuvraDimension[];
  confidence: "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE";
  coverage: number;
  scoreStatus: NuvraScoreStatus;
  statusLabel: string;
  requiresMoreSources: boolean;
  reason: string;
  evaluatedAt: Date;
  methodology: {
    evaluableDimensions: number;
    effectiveDimensionDiversity: number;
    objectiveRelevanceCovered: number;
    evidenceQuality: number;
    readiness: number;
    dimensionWeights: Record<string, { objectiveRelevance: number; businessRelevance: number; evidenceQuality: number; combinedWeight: number }>;
  };
}

export interface NuvraDimension {
  name: string;
  slug: string;
  points: number | null;
  confidence: "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE";
  sources: SourceType[]; // Qué fuentes sustentan esta dimensión
  findings: EvidenceFinding[];
  message?: string;
  estimatedFromLimitedEvidence?: boolean;
  scoringSignals?: Array<{ label: string; effect: number; basis: "observed" | "declared" | "contextual" }>;
}

export class NuvraScoreCalculator {
  static calculate(
    aggregatedEvidence: AggregatedEvidence,
    coverage: CoverageResult,
    context: { objective?: string; businessProfile?: BusinessProfile } = {}
  ): NuvraScoreResult {
    const findings = aggregatedEvidence.findings;
    const byDimension = this.filterUnvalidatedProblems(aggregatedEvidence.byDimension, context.businessProfile);

    // Las dimensiones mantienen sus propias reglas de evidencia. La cobertura
    // general no debe descartar dimensiones que sí pudieron evaluarse.
    const dimensions = this.calculateDimensions(byDimension, aggregatedEvidence.sources, context.objective || "", context.businessProfile);
    const evaluableDimensions = dimensions.filter(d => d.points !== null);
    const evidenceBackedDimensions = dimensions.filter(d => d.findings.length > 0 && !d.estimatedFromLimitedEvidence);
    const objectiveWeights = this.getObjectiveWeights(context.objective || "", context.businessProfile);
    const rawDimensionWeights = Object.fromEntries(dimensions.map(d => {
      const objectiveRelevance = objectiveWeights[d.slug] ?? 0;
      const businessRelevance = context.businessProfile?.areaRelevance[d.slug]?.businessRelevance ?? 0.7;
      const evidenceQuality = this.calculateEvidenceQuality(d);
      return [d.slug, { objectiveRelevance, businessRelevance, evidenceQuality, combinedWeight: objectiveRelevance * (0.4 + 0.6 * businessRelevance) }];
    }));
    const combinedTotal = Object.values(rawDimensionWeights).reduce((sum, weight) => sum + weight.combinedWeight, 0) || 1;
    const dimensionWeights = Object.fromEntries(Object.entries(rawDimensionWeights).map(([slug, weight]) => [slug, { ...weight, combinedWeight: weight.combinedWeight / combinedTotal }]));
    const objectiveRelevanceCovered = evidenceBackedDimensions.reduce((sum, d) => sum + dimensionWeights[d.slug].combinedWeight, 0);
    const evidenceQuality = objectiveRelevanceCovered > 0
      ? evidenceBackedDimensions.reduce((sum, d) => sum + dimensionWeights[d.slug].combinedWeight * dimensionWeights[d.slug].evidenceQuality, 0) / objectiveRelevanceCovered
      : 0;
    const relevanceShares = evidenceBackedDimensions.map(d => dimensionWeights[d.slug].combinedWeight).filter(Boolean);
    const relevanceTotal = relevanceShares.reduce((sum, value) => sum + value, 0);
    const effectiveDimensionDiversity = relevanceTotal > 0
      ? 1 / relevanceShares.reduce((sum, value) => sum + Math.pow(value / relevanceTotal, 2), 0)
      : 0;
    const diversityFactor = Math.min(1, effectiveDimensionDiversity / 3);
    const readiness = objectiveRelevanceCovered * evidenceQuality * diversityFactor;
    const methodology = {
      evaluableDimensions: evidenceBackedDimensions.length,
      effectiveDimensionDiversity: Math.round(effectiveDimensionDiversity * 100) / 100,
      objectiveRelevanceCovered: Math.round(objectiveRelevanceCovered * 100) / 100,
      evidenceQuality: Math.round(evidenceQuality * 100) / 100,
      readiness: Math.round(readiness * 100) / 100,
      dimensionWeights,
    };

    // El resultado comercial siempre existe. La calidad de evidencia sigue
    // modulando internamente cuánto pesa cada área, sin convertir ausencia en cero.
    let total: number | null = null;

    if (evaluableDimensions.length > 0) {
      // Ponderar por relevancia para el objetivo y calidad de la evidencia.
      const weightedSum = evaluableDimensions.reduce((acc, d) => {
        const qualityAdjustedWeight = dimensionWeights[d.slug].combinedWeight * (0.25 + 0.75 * dimensionWeights[d.slug].evidenceQuality);
        return acc + (d.points || 0) * qualityAdjustedWeight;
      }, 0);
      
      const totalWeight = evaluableDimensions.reduce((acc, d) => {
        return acc + dimensionWeights[d.slug].combinedWeight * (0.25 + 0.75 * dimensionWeights[d.slug].evidenceQuality);
      }, 0);

      total = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 40;
    }

    // Determinar Estado del Score (Requisito 2: Distinguir Pendiente / Preliminar / Completo)
    let scoreStatus: NuvraScoreStatus = "preliminary";
    let statusLabel = "PRELIMINAR";
    let reason = "Score preliminar basado en evidencia disponible. Faltan fuentes para completar la evaluación.";

    if (coverage.total >= 70 && coverage.evaluatedSources.length >= 3 && readiness >= 0.2) {
      scoreStatus = "complete";
      statusLabel = "COMPLETO";
      reason = "Diagnóstico completo sustentado por múltiples fuentes de evidencia.";
    } else {
      const sourceNameMap: Record<string, string> = {
        web: "la información pública del negocio",
        instagram: "el perfil público de Instagram",
        search: "las búsquedas relacionadas con el negocio",
        reviews: "las opiniones de clientes",
        competitor: "otros negocios parecidos",
        x: "presencia en X",
      };

      const pendingLabels = coverage.relevantSources
        .filter((src) => coverage.bySource[src]?.status !== "evaluated")
        .map((src) => sourceNameMap[src])
        .filter(Boolean);

      if (pendingLabels.length > 0) {
        reason = `El diagnóstico todavía es preliminar (cobertura ${coverage.total}%) porque faltan datos de ${pendingLabels.join(" y ")}.`;
      } else {
        reason = `El diagnóstico todavía es preliminar (cobertura ${coverage.total}%) porque la profundidad de evidencia es limitada.`;
      }
    }

    // Calcular confidence general
    const avgConfidence = this.calculateOverallConfidence(dimensions);

    return {
      total,
      dimensions,
      confidence: avgConfidence,
      coverage: coverage.total,
      scoreStatus,
      statusLabel,
      requiresMoreSources: scoreStatus !== "complete",
      reason,
      evaluatedAt: new Date(),
      methodology,
    };
  }

  private static calculateEvidenceQuality(dimension: NuvraDimension): number {
    if (!dimension.findings.length || !dimension.sources.length) return 0;
    const confidenceValue = { ALTA: 1, MEDIA: 0.75, BAJA: 0.45, INSUFICIENTE: 0 } as const;
    const averageConfidence = dimension.findings.reduce((sum, finding) => sum + confidenceValue[finding.confidence], 0) / dimension.findings.length;
    const depth = Math.min(1, dimension.findings.length / 3);
    const sourceDiversity = Math.min(1, dimension.sources.length / 2);
    return Math.round((averageConfidence * 0.5 + depth * 0.3 + sourceDiversity * 0.2) * 100) / 100;
  }

  private static getObjectiveWeights(objective: string, profile?: BusinessProfile): Record<string, number> {
    if (profile) {
      const raw = Object.fromEntries(Object.entries(profile.areaRelevance).map(([area, relevance]) => [area, relevance.goalRelevance]));
      const total = Object.values(raw).reduce((sum, value) => sum + value, 0);
      if (total > 0) return Object.fromEntries(Object.entries(raw).map(([area, value]) => [area, value / total]));
    }
    const text = objective.toLowerCase();
    if (/volver|recompra|recurren|fideliza|clientes actuales/.test(text)) {
      return { presencia: 0.08, conversion: 0.16, posicionamiento: 0.1, propuesta: 0.1, redes: 0.08, adquisicion: 0.08, retencion: 0.4 };
    }
    if (/consult|reserv|turno|lead|venta|compr/.test(text)) {
      return { presencia: 0.14, conversion: 0.28, posicionamiento: 0.12, propuesta: 0.16, redes: 0.08, adquisicion: 0.22, retencion: 0 };
    }
    if (/marca|reconoc|posicion|autoridad/.test(text)) {
      return { presencia: 0.1, conversion: 0.1, posicionamiento: 0.3, propuesta: 0.2, redes: 0.2, adquisicion: 0.1, retencion: 0 };
    }
    if (/redes|instagram|comunidad|interacci/.test(text)) {
      return { presencia: 0.1, conversion: 0.15, posicionamiento: 0.15, propuesta: 0.1, redes: 0.35, adquisicion: 0.15, retencion: 0 };
    }
    return { presencia: 0.16, conversion: 0.18, posicionamiento: 0.16, propuesta: 0.16, redes: 0.16, adquisicion: 0.18, retencion: 0 };
  }

  private static calculateDimensions(
    byDimension: Record<string, EvidenceFinding[]>,
    sources: Record<string, any>,
    objective: string,
    profile?: BusinessProfile
  ): NuvraDimension[] {
    const dimensions: NuvraDimension[] = [
      this.calculatePresenciaDimension(byDimension.presencia || [], sources, profile),
      this.calculateConversionDimension(byDimension.conversion || [], sources, profile),
      this.calculatePosicionamientoDimension(byDimension.posicionamiento || [], sources, profile),
      this.calculatePropuestaDimension(byDimension.propuesta || [], sources, profile),
      this.calculateRedesDimension(byDimension.redes || [], sources, profile),
      this.calculateAdquisicionDimension(byDimension.adquisicion || [], sources, profile),
      this.calculateIdentityDimension(byDimension.identidad || [], sources, profile),
    ];

    dimensions.push(this.calculateRetentionDimension(byDimension.retencion || [], profile));

    return dimensions;
  }

  private static calculateIdentityDimension(findings: EvidenceFinding[], sources: Record<string, any>, profile?: BusinessProfile): NuvraDimension {
    const sourceTypes = this.getSourceTypes(findings, sources);
    const brandIdentity = sources.web?.data?.brandIdentity as { score?: number; confidence?: NuvraDimension["confidence"]; limitations?: string[] } | undefined;
    findings = this.deduplicateSemanticFindings(findings);
    if (typeof brandIdentity?.score === "number") {
      return {
        name: "Qué tan sólida y reconocible es tu marca",
        slug: "identidad",
        points: Math.max(0, Math.min(100, Math.round(brandIdentity.score))),
        confidence: brandIdentity.confidence || this.calculateDimensionConfidence(findings, sourceTypes),
        sources: sourceTypes.length ? sourceTypes : (["web"] as SourceType[]),
        findings,
        message: brandIdentity.limitations?.[0],
      };
    }
    return this.estimateDimension("identidad", "Qué tan sólida y reconocible es tu marca", sourceTypes, profile);
  }

  private static filterUnvalidatedProblems(byDimension: Record<string, EvidenceFinding[]>, profile?: BusinessProfile) {
    if (!profile) return byDimension;
    const rejectedCommercialIds = new Set(profile.problemCandidates.filter((candidate) => candidate.validationStatus !== "validated").flatMap((candidate) => candidate.evidenceFor));
    const rejectedFindingIds = new Set(profile.commercialEvidence.filter((item) => rejectedCommercialIds.has(item.id)).map((item) => item.originalFindingId).filter((id): id is string => Boolean(id)));
    return Object.fromEntries(Object.entries(byDimension).map(([slug, findings]) => [slug, findings.filter((finding) => finding.type !== "negative" || !rejectedFindingIds.has(finding.id))]));
  }

  private static calculateRetentionDimension(findings: EvidenceFinding[], profile?: BusinessProfile): NuvraDimension {
    findings = this.deduplicateSemanticFindings(findings);
    const sources = Array.from(new Set(findings.map((finding) => finding.source)));
    if (!findings.length) return this.estimateDimension("retencion", "Qué hacés para que los clientes vuelvan", sources, profile);
    const score = this.scoreObservedFindings(findings);
    return { name: "Qué hacés para que los clientes vuelvan", slug: "retencion", points: Math.max(0, Math.min(100, score)), confidence: this.calculateDimensionConfidence(findings, sources), sources, findings };
  }

  private static calculatePresenciaDimension(
    findings: EvidenceFinding[],
    sources: Record<string, any>,
    profile?: BusinessProfile
  ): NuvraDimension {
    const sourceTypes = this.getSourceTypes(findings, sources);
    findings = this.deduplicateSemanticFindings(findings);
    const confidence = this.calculateDimensionConfidence(findings, sourceTypes);

    if (findings.length === 0) {
      return this.estimateDimension("presencia", "Qué tan fácil es encontrarte", sourceTypes, profile);
    }

    const score = this.scoreObservedFindings(findings);

    return {
      name: "Qué tan fácil es encontrarte",
      slug: "presencia",
      points: Math.max(0, Math.min(100, score)),
      confidence,
      sources: sourceTypes,
      findings,
    };
  }

  private static calculateConversionDimension(
    findings: EvidenceFinding[],
    sources: Record<string, any>,
    profile?: BusinessProfile
  ): NuvraDimension {
    const sourceTypes = this.getSourceTypes(findings, sources);
    findings = this.deduplicateSemanticFindings(findings);
    const confidence = this.calculateDimensionConfidence(findings, sourceTypes);

    if (findings.length === 0) {
      return this.estimateDimension("conversion", "Qué tan fácil es consultar, reservar o comprar", sourceTypes, profile);
    }

    const score = this.scoreObservedFindings(findings);

    return {
      name: "Qué tan fácil es consultar, reservar o comprar",
      slug: "conversion",
      points: Math.max(0, Math.min(100, score)),
      confidence,
      sources: sourceTypes,
      findings,
    };
  }

  private static calculatePosicionamientoDimension(
    findings: EvidenceFinding[],
    sources: Record<string, any>,
    profile?: BusinessProfile
  ): NuvraDimension {
    const sourceTypes = this.getSourceTypes(findings, sources);
    findings = this.deduplicateSemanticFindings(findings);
    const confidence = this.calculateDimensionConfidence(findings, sourceTypes);

    if (findings.length === 0) {
      return this.estimateDimension("posicionamiento", "Qué tanta confianza y diferenciación generás", sourceTypes, profile);
    }

    const score = this.scoreObservedFindings(findings);

    return {
      name: "Qué tanta confianza y diferenciación generás",
      slug: "posicionamiento",
      points: Math.max(0, Math.min(100, score)),
      confidence,
      sources: sourceTypes,
      findings,
    };
  }

  private static calculatePropuestaDimension(
    findings: EvidenceFinding[],
    sources: Record<string, any>,
    profile?: BusinessProfile
  ): NuvraDimension {
    const sourceTypes = this.getSourceTypes(findings, sources);
    findings = this.deduplicateSemanticFindings(findings);
    const confidence = this.calculateDimensionConfidence(findings, sourceTypes);

    if (findings.length === 0) {
      return this.estimateDimension("propuesta", "Qué tan claro queda lo que ofrecés", sourceTypes, profile);
    }

    const score = this.scoreObservedFindings(findings);

    return {
      name: "Qué tan claro queda lo que ofrecés",
      slug: "propuesta",
      points: Math.max(0, Math.min(100, score)),
      confidence,
      sources: sourceTypes,
      findings,
    };
  }

  private static calculateRedesDimension(
    findings: EvidenceFinding[],
    sources: Record<string, any>,
    profile?: BusinessProfile
  ): NuvraDimension {
    const sourceTypes = this.getSourceTypes(findings, sources);
    findings = this.deduplicateSemanticFindings(findings);
    const confidence = this.calculateDimensionConfidence(findings, sourceTypes);

    // Redes requiere fuente de redes
    if (!sourceTypes.includes("instagram") && !sourceTypes.includes("x")) {
      return this.estimateDimension("redes", "Qué tan útiles están siendo tus redes", sourceTypes, profile);
    }

    if (findings.length === 0) {
      return this.estimateDimension("redes", "Qué tan útiles están siendo tus redes", sourceTypes, profile);
    }

    const score = this.scoreObservedFindings(findings);

    return {
      name: "Qué tan útiles están siendo tus redes",
      slug: "redes",
      points: Math.max(0, Math.min(100, score)),
      confidence,
      sources: sourceTypes,
      findings,
    };
  }

  private static calculateAdquisicionDimension(
    findings: EvidenceFinding[],
    sources: Record<string, any>,
    profile?: BusinessProfile
  ): NuvraDimension {
    const sourceTypes = this.getSourceTypes(findings, sources);
    findings = this.deduplicateSemanticFindings(findings);
    const confidence = this.calculateDimensionConfidence(findings, sourceTypes);

    if (findings.length === 0) {
      return this.estimateDimension("adquisicion", "Qué capacidad tenés para atraer demanda", sourceTypes, profile);
    }

    const score = this.scoreObservedFindings(findings);

    return {
      name: "Qué capacidad tenés para atraer demanda",
      slug: "adquisicion",
      points: Math.max(0, Math.min(100, score)),
      confidence,
      sources: sourceTypes,
      findings,
    };
  }

  private static getSourceTypes(findings: EvidenceFinding[], sources: Record<string, any>): SourceType[] {
    const types = new Set<SourceType>();
    for (const f of findings) {
      types.add(f.source);
    }
    return Array.from(types);
  }

  private static scoreObservedFindings(findings: EvidenceFinding[]): number {
    const impactValue = { high: 18, medium: 12, low: 7 } as const;
    const confidenceValue = { ALTA: 1, MEDIA: 0.8, BAJA: 0.6 } as const;
    const score = findings.reduce((total, finding) => {
      if (finding.type === "neutral") return total;
      const direction = finding.type === "positive" ? 1 : -1;
      const evidenceWeight = 0.75 + 0.25 * Math.max(0, Math.min(1, finding.weight));
      return total + direction * impactValue[finding.impact] * confidenceValue[finding.confidence] * evidenceWeight;
    }, 50);
    return Math.max(5, Math.min(95, Math.round(score)));
  }

  private static estimateDimension(slug: string, name: string, sources: SourceType[], profile?: BusinessProfile): NuvraDimension {
    const signals: NonNullable<NuvraDimension["scoringSignals"]> = [];
    const add = (label: string, effect: number, basis: "observed" | "declared" | "contextual") => signals.push({ label, effect, basis });
    if (profile) {
      const active = new Set(profile.activeChannels);
      const declared = profile.declaredSignals;
      if (slug === "presencia") {
        if (profile.location) add("Ubicación declarada", 5, "declared");
        if (active.has("search")) add("Presencia encontrada en búsquedas", 8, "observed");
        if (active.has("external_mentions")) add("Menciones externas útiles", 4, "observed");
        if (profile.localDependency === "high" && !profile.location) add("Negocio local sin ubicación declarada", -8, "contextual");
      } else if (slug === "conversion") {
        if (profile.contactMethods.length) add(`Formas de contacto identificadas: ${profile.contactMethods.join(", ")}`, Math.min(9, 3 + profile.contactMethods.length * 2), "observed");
        if (profile.channelDeclarations.web === "absent" && profile.channelDeclarations.instagram === "absent" && !profile.contactMethods.length) add("No hay un canal de avance declarado", -8, "declared");
        if (declared.some((signal) => signal.type === "demand_pattern")) add("Existe un problema de demanda declarado", -6, "declared");
      } else if (slug === "posicionamiento") {
        if (profile.trustSignals.length) add("Señales de confianza observadas", Math.min(10, 4 + profile.trustSignals.length * 2), "observed");
        if (profile.competitorsDetected > 0) add("Hay alternativas verificadas para contextualizar la elección", 2, "observed");
        if (!profile.trustSignals.length && profile.commercialModel === "professional") add("Servicio profesional sin prueba observada", -6, "contextual");
      } else if (slug === "propuesta") {
        if (profile.offerings.length) add("Oferta explicada por el negocio", Math.min(10, 5 + profile.offerings.length * 2), "declared");
        if (profile.audienceSignals.length) add("Público indicado", 5, "declared");
        if (!profile.offerings.length) add("No se aportó una descripción concreta de la oferta", -7, "declared");
      } else if (slug === "redes") {
        if (active.has("instagram")) add("Instagram identificado", 4, "observed");
        if (profile.channelDeclarations.instagram === "absent") add("El negocio declaró no tener Instagram", profile.commercialModel === "commerce" || profile.localDependency === "high" ? -5 : -2, "declared");
        if (profile.channelDeclarations.instagram === "unknown") add("No se informó ni se confirmó Instagram", -2, "contextual");
      } else if (slug === "adquisicion") {
        const discoveryChannels = ["search", "external_mentions", "reviews", "competitor"].filter((source) => active.has(source as SourceType));
        if (discoveryChannels.length) add(`Canales de descubrimiento observados: ${discoveryChannels.join(", ")}`, Math.min(10, discoveryChannels.length * 3), "observed");
        if (declared.some((signal) => signal.type === "referrals")) add("Referidos declarados como origen de clientes", 7, "declared");
        if (!discoveryChannels.length && !declared.some((signal) => signal.type === "referrals" || signal.type === "channel")) add("No se identificó todavía cómo llegan nuevos clientes", -6, "contextual");
      } else if (slug === "retencion") {
        if (declared.some((signal) => signal.type === "follow_up")) add("Seguimiento declarado", 9, "declared");
        if (profile.recurrence === "frequent" || profile.recurrence === "membership" || profile.recurrence === "periodic") add("El modelo admite recurrencia", 3, "contextual");
        if (!declared.some((signal) => signal.type === "follow_up") && /volver|recompra|renuev|fidel/i.test(profile.goal.text)) add("El objetivo requiere volver a contactar clientes y no se declaró un mecanismo", -8, "contextual");
      } else if (slug === "identidad") {
        if (profile.activeChannels.includes("web")) add("Existe un sitio donde observar la identidad de marca", 3, "observed");
        if (profile.activeChannels.includes("instagram")) add("Existe una segunda fuente para contrastar la marca", 3, "observed");
      }
    }
    const points = Math.max(25, Math.min(75, Math.round(50 + signals.reduce((sum, signal) => sum + signal.effect, 0))));
    return { name, slug, points, confidence: "INSUFICIENTE", sources, findings: [], message: "Resultado estimado con la información disponible.", estimatedFromLimitedEvidence: true, scoringSignals: signals };
  }

  private static deduplicateSemanticFindings(findings: EvidenceFinding[]): EvidenceFinding[] {
    const impactRank = { low: 1, medium: 2, high: 3 } as const;
    const grouped = new Map<string, EvidenceFinding>();
    for (const finding of findings) {
      const text = finding.evidence.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const polarity = finding.type === "negative" ? "negative" : finding.type === "positive" ? "positive" : "neutral";
      let issue = text.replace(/[^a-z0-9]+/g, " ").trim();
      if (polarity === "negative") {
        if (finding.category === "conversion" && /cta|boton|accion principal|contact|consulta|turno|reserv|formulario|whatsapp|avanzar/.test(text)) issue = "contact-path";
        else if (finding.category === "conversion" && /checkout|carrito|pago|compra|envio/.test(text)) issue = "purchase-path";
        else if (/confianza|testimonio|resena|garantia|caso/.test(text)) issue = "trust-signal";
        else if (/title|meta description|canonical|robots|indexa/.test(text)) issue = "search-metadata";
        else if (/h1|titulo principal|diferenci|mensaje principal/.test(text)) issue = "offer-clarity";
        else if (/mobile|movil|responsive/.test(text)) issue = "mobile-experience";
        else if (/performance|velocidad|carga|lento/.test(text)) issue = "page-speed";
        else if (/naveg|menu|header|estructura/.test(text)) issue = "navigation";
      }
      const key = `${finding.category}:${polarity}:${issue}`;
      const current = grouped.get(key);
      if (!current || impactRank[finding.impact] > impactRank[current.impact] || (impactRank[finding.impact] === impactRank[current.impact] && finding.confidence === "ALTA" && current.confidence !== "ALTA")) {
        grouped.set(key, finding);
      }
    }
    return Array.from(grouped.values());
  }

  private static calculateDimensionConfidence(
    findings: EvidenceFinding[],
    sourceTypes: SourceType[]
  ): "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE" {
    if (findings.length === 0) return "INSUFICIENTE";
    if (sourceTypes.length === 0) return "INSUFICIENTE";

    const highConfidenceFindings = findings.filter(f => f.confidence === "ALTA");
    if (findings.length >= 3 && highConfidenceFindings.length >= 2 && sourceTypes.length >= 2) {
      return "ALTA";
    }
    if (findings.length >= 2 && sourceTypes.length >= 1) {
      return "MEDIA";
    }
    if (findings.length >= 1) {
      return "BAJA";
    }
    return "INSUFICIENTE";
  }

  private static calculateOverallConfidence(dimensions: NuvraDimension[]): "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE" {
    const highConfidence = dimensions.filter(d => d.confidence === "ALTA").length;
    const mediumConfidence = dimensions.filter(d => d.confidence === "MEDIA").length;
    const lowConfidence = dimensions.filter(d => d.confidence === "BAJA").length;
    const insufficient = dimensions.filter(d => d.confidence === "INSUFICIENTE").length;

    if (insufficient > dimensions.length / 2) return "INSUFICIENTE";
    if (highConfidence >= dimensions.length * 0.6) return "ALTA";
    if (highConfidence + mediumConfidence >= dimensions.length * 0.7) return "MEDIA";
    return "BAJA";
  }
}
