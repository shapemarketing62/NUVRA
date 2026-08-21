import { AggregatedEvidence, CoverageResult } from "./evidence-aggregator";
import { EvidenceFinding, SourceType } from "./source-analyzer";

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
    coverage: CoverageResult
  ): NuvraScoreResult {
    // Si coverage es insuficiente (<30%), marcar como PENDIENTE
    if (!coverage.canCalculateNuvraScore || coverage.total < 30) {
      return {
        total: null,
        dimensions: [],
        confidence: "INSUFICIENTE",
        coverage: coverage.total,
        scoreStatus: "pending",
        statusLabel: "PENDIENTE",
        requiresMoreSources: true,
        reason: "Cobertura insuficiente para calcular un score representativo. Se requieren más fuentes.",
        evaluatedAt: new Date(),
      };
    }

    const findings = aggregatedEvidence.findings;
    const byDimension = aggregatedEvidence.byDimension;

    // Calcular dimensiones del Nuvra Score
    const dimensions = this.calculateDimensions(byDimension, aggregatedEvidence.sources);

    // Calcular total (solo dimensiones evaluables)
    const evaluableDimensions = dimensions.filter(d => d.points !== null);
    let total: number | null = null;

    if (evaluableDimensions.length > 0) {
      // Ponderar por confianza
      const weightedSum = evaluableDimensions.reduce((acc, d) => {
        const confidenceWeight = d.confidence === "ALTA" ? 1 : d.confidence === "MEDIA" ? 0.8 : 0.6;
        return acc + (d.points || 0) * confidenceWeight;
      }, 0);
      
      const totalWeight = evaluableDimensions.reduce((acc, d) => {
        const confidenceWeight = d.confidence === "ALTA" ? 1 : d.confidence === "MEDIA" ? 0.8 : 0.6;
        return acc + confidenceWeight;
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
        web: "análisis del sitio web",
        instagram: "redes sociales",
        search: "posicionamiento en buscadores",
        reviews: "reseñas de clientes",
        competitor: "comparación con competidores",
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
    };
  }

  private static calculateDimensions(
    byDimension: Record<string, EvidenceFinding[]>,
    sources: Record<string, any>
  ): NuvraDimension[] {
    const dimensions: NuvraDimension[] = [
      this.calculatePresenciaDimension(byDimension.presencia || [], sources),
      this.calculateConversionDimension(byDimension.conversion || [], sources),
      this.calculatePosicionamientoDimension(byDimension.posicionamiento || [], sources),
      this.calculatePropuestaDimension(byDimension.propuesta || [], sources),
      this.calculateRedesDimension(byDimension.redes || [], sources),
      this.calculateAdquisicionDimension(byDimension.adquisicion || [], sources),
    ];

    return dimensions;
  }

  private static calculatePresenciaDimension(
    findings: EvidenceFinding[],
    sources: Record<string, any>
  ): NuvraDimension {
    const sourceTypes = this.getSourceTypes(findings, sources);
    const confidence = this.calculateDimensionConfidence(findings, sourceTypes);

    if (findings.length === 0) {
      return {
        name: "Presencia Digital",
        slug: "presencia",
        points: null,
        confidence: "INSUFICIENTE",
        sources: sourceTypes,
        findings: [],
        message: "No hay evidencia suficiente para evaluar presencia digital.",
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
      name: "Presencia Digital",
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
    const confidence = this.calculateDimensionConfidence(findings, sourceTypes);

    if (findings.length === 0) {
      return {
        name: "Conversión",
        slug: "conversion",
        points: null,
        confidence: "INSUFICIENTE",
        sources: sourceTypes,
        findings: [],
        message: "No hay evidencia suficiente para evaluar conversión.",
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
      name: "Conversión",
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
    const confidence = this.calculateDimensionConfidence(findings, sourceTypes);

    // Posicionamiento requiere fuentes externas
    if (sourceTypes.length === 1 && sourceTypes[0] === "web") {
      return {
        name: "Posicionamiento",
        slug: "posicionamiento",
        points: null,
        confidence: "INSUFICIENTE",
        sources: sourceTypes,
        findings,
        message: "Posicionamiento requiere información externa (Instagram, Search, Reviews) - solo hay evidencia web.",
      };
    }

    if (findings.length === 0) {
      return {
        name: "Posicionamiento",
        slug: "posicionamiento",
        points: null,
        confidence: "INSUFICIENTE",
        sources: sourceTypes,
        findings: [],
        message: "No hay evidencia suficiente para evaluar posicionamiento.",
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
      name: "Posicionamiento",
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
    const confidence = this.calculateDimensionConfidence(findings, sourceTypes);

    if (findings.length === 0) {
      return {
        name: "Propuesta de Valor",
        slug: "propuesta",
        points: null,
        confidence: "INSUFICIENTE",
        sources: sourceTypes,
        findings: [],
        message: "No hay evidencia suficiente para evaluar propuesta de valor.",
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
      name: "Propuesta de Valor",
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
    const confidence = this.calculateDimensionConfidence(findings, sourceTypes);

    // Redes requiere fuente de redes
    if (!sourceTypes.includes("instagram") && !sourceTypes.includes("x")) {
      return {
        name: "Redes Sociales",
        slug: "redes",
        points: null,
        confidence: "INSUFICIENTE",
        sources: sourceTypes,
        findings,
        message: "Redes sociales requiere análisis de Instagram u otras plataformas - no hay evidencia de redes.",
      };
    }

    if (findings.length === 0) {
      return {
        name: "Redes Sociales",
        slug: "redes",
        points: null,
        confidence: "INSUFICIENTE",
        sources: sourceTypes,
        findings: [],
        message: "No hay evidencia suficiente para evaluar redes sociales.",
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
      name: "Redes Sociales",
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
    const confidence = this.calculateDimensionConfidence(findings, sourceTypes);

    if (findings.length === 0) {
      return {
        name: "Adquisición",
        slug: "adquisicion",
        points: null,
        confidence: "INSUFICIENTE",
        sources: sourceTypes,
        findings: [],
        message: "No hay evidencia suficiente para evaluar adquisición.",
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
      name: "Adquisición",
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