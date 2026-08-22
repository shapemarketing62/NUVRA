import type { AggregatedEvidence, CoverageResult } from "./evidence-aggregator";
import type { EvidenceFinding, SourceType } from "./source-analyzer";

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
    dimensionWeights: Record<string, { objectiveRelevance: number; evidenceQuality: number; combinedWeight: number }>;
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
}

export class NuvraScoreCalculator {
  static calculate(
    aggregatedEvidence: AggregatedEvidence,
    coverage: CoverageResult,
    context: { objective?: string } = {}
  ): NuvraScoreResult {
    const findings = aggregatedEvidence.findings;
    const byDimension = aggregatedEvidence.byDimension;

    // Las dimensiones mantienen sus propias reglas de evidencia. La cobertura
    // general no debe descartar dimensiones que sí pudieron evaluarse.
    const dimensions = this.calculateDimensions(byDimension, aggregatedEvidence.sources, context.objective || "");
    const evaluableDimensions = dimensions.filter(d => d.points !== null);
    const objectiveWeights = this.getObjectiveWeights(context.objective || "");
    const dimensionWeights = Object.fromEntries(dimensions.map(d => {
      const objectiveRelevance = objectiveWeights[d.slug] ?? 0;
      const evidenceQuality = this.calculateEvidenceQuality(d);
      return [d.slug, { objectiveRelevance, evidenceQuality, combinedWeight: objectiveRelevance * evidenceQuality }];
    }));
    const objectiveRelevanceCovered = evaluableDimensions.reduce((sum, d) => sum + (objectiveWeights[d.slug] ?? 0), 0);
    const evidenceQuality = objectiveRelevanceCovered > 0
      ? evaluableDimensions.reduce((sum, d) => sum + (objectiveWeights[d.slug] ?? 0) * dimensionWeights[d.slug].evidenceQuality, 0) / objectiveRelevanceCovered
      : 0;
    const relevanceShares = evaluableDimensions.map(d => objectiveWeights[d.slug] ?? 0).filter(Boolean);
    const relevanceTotal = relevanceShares.reduce((sum, value) => sum + value, 0);
    const effectiveDimensionDiversity = relevanceTotal > 0
      ? 1 / relevanceShares.reduce((sum, value) => sum + Math.pow(value / relevanceTotal, 2), 0)
      : 0;
    const diversityFactor = Math.min(1, effectiveDimensionDiversity / 3);
    const readiness = objectiveRelevanceCovered * evidenceQuality * diversityFactor;
    const methodology = {
      evaluableDimensions: evaluableDimensions.length,
      effectiveDimensionDiversity: Math.round(effectiveDimensionDiversity * 100) / 100,
      objectiveRelevanceCovered: Math.round(objectiveRelevanceCovered * 100) / 100,
      evidenceQuality: Math.round(evidenceQuality * 100) / 100,
      readiness: Math.round(readiness * 100) / 100,
      dimensionWeights,
    };

    // Un score general requiere evidencia distribuida y relevante. Las lecturas
    // parciales siguen disponibles para diagnóstico, pero no representan el todo.
    if (evaluableDimensions.length < 2 || objectiveRelevanceCovered < 0.45 || effectiveDimensionDiversity < 1.6 || readiness < 0.2) {
      return {
        total: null,
        dimensions,
        confidence: "INSUFICIENTE",
        coverage: coverage.total,
        scoreStatus: "pending",
        statusLabel: "PENDIENTE",
        requiresMoreSources: true,
        reason: evaluableDimensions.length === 0
          ? "No se pudo evaluar ninguna dimensión con datos observables."
          : "Las señales observadas todavía están demasiado concentradas para representar el marketing general.",
        evaluatedAt: new Date(),
        methodology,
      };
    }

    // Calcular total (solo dimensiones evaluables)
    let total: number | null = null;

    if (evaluableDimensions.length > 0) {
      // Ponderar por relevancia para el objetivo y calidad de la evidencia.
      const weightedSum = evaluableDimensions.reduce((acc, d) => {
        return acc + (d.points || 0) * dimensionWeights[d.slug].combinedWeight;
      }, 0);
      
      const totalWeight = evaluableDimensions.reduce((acc, d) => {
        return acc + dimensionWeights[d.slug].combinedWeight;
      }, 0);

      total = Math.round(weightedSum / totalWeight);
    }

    // Determinar Estado del Score (Requisito 2: Distinguir Pendiente / Preliminar / Completo)
    let scoreStatus: NuvraScoreStatus = "preliminary";
    let statusLabel = "PRELIMINAR";
    let reason = "Score preliminar basado en evidencia disponible. Faltan fuentes para completar la evaluación.";

    if (coverage.total >= 70 && coverage.evaluatedSources.length >= 3) {
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

  private static getObjectiveWeights(objective: string): Record<string, number> {
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
    objective: string
  ): NuvraDimension[] {
    const dimensions: NuvraDimension[] = [
      this.calculatePresenciaDimension(byDimension.presencia || [], sources),
      this.calculateConversionDimension(byDimension.conversion || [], sources),
      this.calculatePosicionamientoDimension(byDimension.posicionamiento || [], sources),
      this.calculatePropuestaDimension(byDimension.propuesta || [], sources),
      this.calculateRedesDimension(byDimension.redes || [], sources),
      this.calculateAdquisicionDimension(byDimension.adquisicion || [], sources),
    ];

    if (/volver|recompra|recurren|fideliza|clientes actuales/i.test(objective) || (byDimension.retencion || []).length > 0) {
      dimensions.push(this.calculateRetentionDimension(byDimension.retencion || []));
    }

    return dimensions;
  }

  private static calculateRetentionDimension(findings: EvidenceFinding[]): NuvraDimension {
    findings = this.deduplicateSemanticFindings(findings);
    const sources = Array.from(new Set(findings.map((finding) => finding.source)));
    if (!findings.length) return { name: "Qué hacés para que los clientes vuelvan", slug: "retencion", points: null, confidence: "INSUFICIENTE", sources, findings: [], message: "Todavía no hay información comprobable sobre seguimiento, recordatorios o recompra." };
    let score = 45;
    for (const finding of findings) score += finding.type === "positive" ? 10 : finding.type === "negative" ? (finding.impact === "high" ? -15 : -8) : 0;
    return { name: "Qué hacés para que los clientes vuelvan", slug: "retencion", points: Math.max(0, Math.min(100, score)), confidence: this.calculateDimensionConfidence(findings, sources), sources, findings };
  }

  private static calculatePresenciaDimension(
    findings: EvidenceFinding[],
    sources: Record<string, any>
  ): NuvraDimension {
    const sourceTypes = this.getSourceTypes(findings, sources);
    findings = this.deduplicateSemanticFindings(findings);
    const confidence = this.calculateDimensionConfidence(findings, sourceTypes);

    if (findings.length === 0) {
      return {
        name: "Qué tan fácil es encontrarte",
        slug: "presencia",
        points: null,
        confidence: "INSUFICIENTE",
        sources: sourceTypes,
        findings: [],
        message: "Todavía no encontramos información pública suficiente para saber qué tan fácil es encontrar el negocio.",
      };
    }

    let score = 50; // Base más baja para Nuvra Score (no asume presencia)
    for (const f of findings) {
      if (f.type === "negative") {
        if (f.impact === "high") score -= 10;
        else if (f.impact === "medium") score -= 5;
        else score -= 2;
      } else if (f.type === "positive") {
        score += 8;
      }
    }

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
    sources: Record<string, any>
  ): NuvraDimension {
    const sourceTypes = this.getSourceTypes(findings, sources);
    findings = this.deduplicateSemanticFindings(findings);
    const confidence = this.calculateDimensionConfidence(findings, sourceTypes);

    if (findings.length === 0) {
      return {
        name: "Qué tan fácil es consultar, reservar o comprar",
        slug: "conversion",
        points: null,
        confidence: "INSUFICIENTE",
        sources: sourceTypes,
        findings: [],
        message: "Todavía no pudimos comprobar con claridad cómo una persona consulta, reserva o compra.",
      };
    }

    let score = 40; // Base más baja
    for (const f of findings) {
      if (f.type === "negative") {
        if (f.impact === "high") score -= 15;
        else if (f.impact === "medium") score -= 8;
        else score -= 4;
      } else if (f.type === "positive") {
        score += 10;
      }
    }

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
    sources: Record<string, any>
  ): NuvraDimension {
    const sourceTypes = this.getSourceTypes(findings, sources);
    findings = this.deduplicateSemanticFindings(findings);
    const confidence = this.calculateDimensionConfidence(findings, sourceTypes);

    // Posicionamiento requiere fuentes externas
    if (sourceTypes.length === 1 && sourceTypes[0] === "web") {
      return {
        name: "Qué tanta confianza y diferenciación generás",
        slug: "posicionamiento",
        points: null,
        confidence: "INSUFICIENTE",
        sources: sourceTypes,
        findings,
        message: "Para evaluar confianza y diferenciación necesitamos contrastar el negocio con reseñas, búsquedas u otros canales públicos.",
      };
    }

    if (findings.length === 0) {
      return {
        name: "Qué tanta confianza y diferenciación generás",
        slug: "posicionamiento",
        points: null,
        confidence: "INSUFICIENTE",
        sources: sourceTypes,
        findings: [],
        message: "Todavía no encontramos señales públicas suficientes de confianza o diferenciación.",
      };
    }

    let score = 30; // Base muy baja - posicionamiento no se asume
    for (const f of findings) {
      if (f.type === "negative") {
        if (f.impact === "high") score -= 10;
        else if (f.impact === "medium") score -= 5;
        else score -= 2;
      } else if (f.type === "positive") {
        score += 12; // Signals de posicionamiento valen más
      }
    }

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
    sources: Record<string, any>
  ): NuvraDimension {
    const sourceTypes = this.getSourceTypes(findings, sources);
    findings = this.deduplicateSemanticFindings(findings);
    const confidence = this.calculateDimensionConfidence(findings, sourceTypes);

    if (findings.length === 0) {
      return {
        name: "Qué tan claro queda lo que ofrecés",
        slug: "propuesta",
        points: null,
        confidence: "INSUFICIENTE",
        sources: sourceTypes,
        findings: [],
        message: "Todavía no pudimos comprobar si una persona entiende con claridad qué ofrecés y por qué elegirte.",
      };
    }

    let score = 40; // Base más baja
    for (const f of findings) {
      if (f.type === "negative") {
        if (f.impact === "high") score -= 15;
        else if (f.impact === "medium") score -= 8;
        else score -= 4;
      } else if (f.type === "positive") {
        score += 10;
      }
    }

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
    sources: Record<string, any>
  ): NuvraDimension {
    const sourceTypes = this.getSourceTypes(findings, sources);
    findings = this.deduplicateSemanticFindings(findings);
    const confidence = this.calculateDimensionConfidence(findings, sourceTypes);

    // Redes requiere fuente de redes
    if (!sourceTypes.includes("instagram") && !sourceTypes.includes("x")) {
      return {
        name: "Qué tan útiles están siendo tus redes",
        slug: "redes",
        points: null,
        confidence: "INSUFICIENTE",
        sources: sourceTypes,
        findings,
        message: "No encontramos un perfil social público que sea relevante para este negocio.",
      };
    }

    if (findings.length === 0) {
      return {
        name: "Qué tan útiles están siendo tus redes",
        slug: "redes",
        points: null,
        confidence: "INSUFICIENTE",
        sources: sourceTypes,
        findings: [],
        message: "Identificamos el perfil, pero todavía no hay suficiente información pública para evaluar su utilidad.",
      };
    }

    let score = 30; // Base muy baja
    for (const f of findings) {
      if (f.type === "negative") {
        if (f.impact === "high") score -= 10;
        else if (f.impact === "medium") score -= 5;
        else score -= 2;
      } else if (f.type === "positive") {
        score += 12;
      }
    }

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
    sources: Record<string, any>
  ): NuvraDimension {
    const sourceTypes = this.getSourceTypes(findings, sources);
    findings = this.deduplicateSemanticFindings(findings);
    const confidence = this.calculateDimensionConfidence(findings, sourceTypes);

    if (findings.length === 0) {
      return {
        name: "Qué capacidad tenés para atraer demanda",
        slug: "adquisicion",
        points: null,
        confidence: "INSUFICIENTE",
        sources: sourceTypes,
        findings: [],
        message: "Todavía no encontramos evidencia suficiente sobre cómo llegan personas interesadas al negocio.",
      };
    }

    let score = 35; // Base más baja
    for (const f of findings) {
      if (f.type === "negative") {
        if (f.impact === "high") score -= 12;
        else if (f.impact === "medium") score -= 6;
        else score -= 3;
      } else if (f.type === "positive") {
        score += 10;
      }
    }

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
