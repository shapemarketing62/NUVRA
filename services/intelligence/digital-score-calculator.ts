import { SourceEvidence, EvidenceFinding } from "./source-analyzer";

export interface DigitalScoreResult {
  total: number | null;
  dimensions: DigitalDimension[];
  confidence: "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE";
  evaluatedAt: Date;
}

export interface DigitalDimension {
  name: string;
  slug: string;
  points: number | null;
  confidence: "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE";
  findings: EvidenceFinding[];
}

export class DigitalScoreCalculator {
  static calculate(webEvidence: SourceEvidence): DigitalScoreResult {
    if (webEvidence.source !== "web" || webEvidence.confidence === "INSUFICIENTE") {
      return {
        total: null,
        dimensions: [],
        confidence: "INSUFICIENTE",
        evaluatedAt: new Date(),
      };
    }

    const findings = webEvidence.findings;
    const confidence = webEvidence.confidence;

    // Calcular dimensiones digitales
    const dimensions = this.calculateDimensions(findings, confidence);

    // Calcular total
    const evaluableDimensions = dimensions.filter(d => d.points !== null);
    let total: number | null = null;
    
    if (evaluableDimensions.length > 0) {
      const sum = evaluableDimensions.reduce((acc, d) => acc + (d.points || 0), 0);
      total = Math.round(sum / evaluableDimensions.length);
    }

    return {
      total,
      dimensions,
      confidence,
      evaluatedAt: new Date(),
    };
  }

  private static calculateDimensions(
    findings: EvidenceFinding[],
    overallConfidence: "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE"
  ): DigitalDimension[] {
    // Filtrar findings por categoría digital
    const byCategory = (cat: string) => findings.filter(f => f.category === cat);

    const dimensions: DigitalDimension[] = [
      this.calculateUXDimension(byCategory("presencia"), byCategory("ux"), overallConfidence),
      this.calculateConversionDimension(byCategory("conversion"), overallConfidence),
      this.calculateSEODimension(byCategory("seo"), overallConfidence),
      this.calculateContentDimension(byCategory("propuesta"), overallConfidence),
      this.calculateTrustDimension(byCategory("trust"), overallConfidence),
      this.calculatePerformanceDimension(findings, overallConfidence),
    ];

    return dimensions;
  }

  private static calculateUXDimension(
    presenciaFindings: EvidenceFinding[],
    uxFindings: EvidenceFinding[],
    confidence: "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE"
  ): DigitalDimension {
    const allFindings = [...presenciaFindings, ...uxFindings];
    
    if (allFindings.length === 0) {
      return {
        name: "Experiencia de Usuario",
        slug: "ux",
        points: null,
        confidence: "INSUFICIENTE",
        findings: [],
      };
    }

    let score = 70; // Base
    for (const f of allFindings) {
      if (f.type === "negative") {
        if (f.impact === "high") score -= 15;
        else if (f.impact === "medium") score -= 8;
        else score -= 3;
      } else if (f.type === "positive") {
        score += 5;
      }
    }

    return {
      name: "Experiencia de Usuario",
      slug: "ux",
      points: Math.max(0, Math.min(100, score)),
      confidence,
      findings: allFindings,
    };
  }

  private static calculateConversionDimension(
    conversionFindings: EvidenceFinding[],
    confidence: "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE"
  ): DigitalDimension {
    if (conversionFindings.length === 0) {
      return {
        name: "Conversión",
        slug: "conversion",
        points: null,
        confidence: "INSUFICIENTE",
        findings: [],
      };
    }

    let score = 65; // Base
    for (const f of conversionFindings) {
      if (f.type === "negative") {
        if (f.impact === "high") score -= 20;
        else if (f.impact === "medium") score -= 10;
        else score -= 5;
      } else if (f.type === "positive") {
        score += 8;
      }
    }

    return {
      name: "Conversión",
      slug: "conversion",
      points: Math.max(0, Math.min(100, score)),
      confidence,
      findings: conversionFindings,
    };
  }

  private static calculateSEODimension(
    seoFindings: EvidenceFinding[],
    confidence: "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE"
  ): DigitalDimension {
    if (seoFindings.length === 0) {
      return {
        name: "SEO Técnico",
        slug: "seo",
        points: null,
        confidence: "INSUFICIENTE",
        findings: [],
      };
    }

    let score = 60; // Base
    for (const f of seoFindings) {
      if (f.type === "negative") {
        if (f.impact === "high") score -= 12;
        else if (f.impact === "medium") score -= 6;
        else score -= 3;
      } else if (f.type === "positive") {
        score += 5;
      }
    }

    return {
      name: "SEO Técnico",
      slug: "seo",
      points: Math.max(0, Math.min(100, score)),
      confidence,
      findings: seoFindings,
    };
  }

  private static calculateContentDimension(
    propuestaFindings: EvidenceFinding[],
    confidence: "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE"
  ): DigitalDimension {
    if (propuestaFindings.length === 0) {
      return {
        name: "Contenido y Propuesta",
        slug: "content",
        points: null,
        confidence: "INSUFICIENTE",
        findings: [],
      };
    }

    let score = 55; // Base
    for (const f of propuestaFindings) {
      if (f.type === "negative") {
        if (f.impact === "high") score -= 15;
        else if (f.impact === "medium") score -= 8;
        else score -= 4;
      } else if (f.type === "positive") {
        score += 6;
      }
    }

    return {
      name: "Contenido y Propuesta",
      slug: "content",
      points: Math.max(0, Math.min(100, score)),
      confidence,
      findings: propuestaFindings,
    };
  }

  private static calculateTrustDimension(
    trustFindings: EvidenceFinding[],
    confidence: "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE"
  ): DigitalDimension {
    if (trustFindings.length === 0) {
      return {
        name: "Confianza",
        slug: "trust",
        points: null,
        confidence: "INSUFICIENTE",
        findings: [],
      };
    }

    let score = 50; // Base
    for (const f of trustFindings) {
      if (f.type === "negative") {
        if (f.impact === "high") score -= 15;
        else if (f.impact === "medium") score -= 8;
        else score -= 4;
      } else if (f.type === "positive") {
        score += 10;
      }
    }

    return {
      name: "Confianza",
      slug: "trust",
      points: Math.max(0, Math.min(100, score)),
      confidence,
      findings: trustFindings,
    };
  }

  private static calculatePerformanceDimension(
    allFindings: EvidenceFinding[],
    confidence: "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE"
  ): DigitalDimension {
    // Buscar findings de performance
    const perfFindings = allFindings.filter(f => 
      f.evidence.toLowerCase().includes("carga") || 
      f.evidence.toLowerCase().includes("tiempo") ||
      f.evidence.toLowerCase().includes("segundos")
    );

    if (perfFindings.length === 0) {
      return {
        name: "Performance",
        slug: "performance",
        points: null,
        confidence: "INSUFICIENTE",
        findings: [],
      };
    }

    let score = 70; // Base
    for (const f of perfFindings) {
      if (f.type === "negative") {
        if (f.impact === "high") score -= 20;
        else if (f.impact === "medium") score -= 10;
        else score -= 5;
      } else if (f.type === "positive") {
        score += 8;
      }
    }

    return {
      name: "Performance",
      slug: "performance",
      points: Math.max(0, Math.min(100, score)),
      confidence,
      findings: perfFindings,
    };
  }
}