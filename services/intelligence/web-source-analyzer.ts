import { SourceAnalyzer, SourceEvidence, SourceRelevance, SourceType } from "./source-analyzer";
import { analyzeWebsite } from "@/services/website-analyzer";
import type { Business } from "@prisma/client";
import type { RawFinding } from "@/services/website-analyzer/types";

interface BusinessWithGoals extends Business {
  goals?: Array<{ objetivo?: string }>;
}

export class WebSourceAnalyzer extends SourceAnalyzer {
  type = "web" as SourceType;
  requiresAuth = false;
  requiresPermission = false;

  isAvailable(business: Business): boolean {
    return !!business.webUrl;
  }

  isRelevant(business: Business): SourceRelevance {
    const businessWithGoals = business as BusinessWithGoals;
    // Web es siempre relevante para cualquier negocio con presencia digital
    const hasWeb = this.isAvailable(business);
    if (!hasWeb) {
      return {
        source: this.type,
        relevant: false,
        reason: "No se detectó URL de sitio web",
        weight: 0,
      };
    }

    // Calcular peso según tipo de negocio y objetivo
    let weight = 0.4; // Base: 40% de coverage

    // Ajustar peso según rubro
    const rubro = businessWithGoals.rubro?.toLowerCase() || "";
    if (/ecom|tienda|venta|shop|store/i.test(rubro)) {
      weight = 0.5; // Ecommerce depende más de web
    } else if (/servicio|consult|profesional|saaS|software/i.test(rubro)) {
      weight = 0.45; // Servicios también dependen mucho de web
    } else if (/restaurante|cafe|comida|delivery/i.test(rubro)) {
      weight = 0.35; // Restaurantes dependen menos de web (usan delivery apps)
    }

    // Ajustar según objetivo
    const objetivo = businessWithGoals.goals?.[0]?.objetivo?.toLowerCase() || "";
    if (/venta|conversi|reserv|lead/i.test(objetivo)) {
      weight = Math.min(weight + 0.1, 0.6); // Objetivos de conversión aumentan peso de web
    } else if (/reconoc|marca|posicion/i.test(objetivo)) {
      weight = Math.max(weight - 0.05, 0.25); // Branding puede usar otros canales
    }

    return {
      source: this.type,
      relevant: true,
      reason: "Sitio web es canal principal de presencia digital",
      weight: Math.min(weight, 0.6), // Máximo 60%
    };
  }

  async analyze(business: Business): Promise<SourceEvidence> {
    const webUrl = business.webUrl;
    if (!webUrl) {
      return {
        source: this.type,
        status: "unavailable",
        data: null,
        findings: [],
        confidence: "INSUFICIENTE",
        coverage: 0,
        evaluatedAt: new Date(),
        requiresAuth: false,
        metadata: { error: "No web URL available" },
      };
    }

    try {
      const analysisResult = await analyzeWebsite(webUrl);
      
      // Convertir RawFinding a EvidenceFinding
      const findings = analysisResult.findings.map((f: RawFinding) => {
        // Asegurar que siempre haya confidence
        const confidence = f.confidence || this.deriveConfidence(f);
        
        return {
          id: `web-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          category: f.category,
          type: f.type as "positive" | "negative" | "neutral",
          impact: (f.severity === "high" ? "high" : f.severity === "medium" ? "medium" : "low") as "high" | "medium" | "low",
          evidence: f.evidence,
          source: this.type,
          attribution: `${f.pageUrl}: ${f.title}`,
          weight: this.calculateFindingWeight(f),
          confidence: confidence as "ALTA" | "MEDIA" | "BAJA",
        };
      });

      // Calcular coverage basado en páginas analizadas
      const coverage = Math.min((analysisResult.pagesAnalyzed / 10) * 100, 100);

      return {
        source: this.type,
        status: "evaluated",
        data: analysisResult,
        findings,
        confidence: coverage >= 50 ? "ALTA" : coverage >= 30 ? "MEDIA" : "BAJA",
        coverage,
        evaluatedAt: new Date(),
        requiresAuth: false,
        metadata: {
          pagesAnalyzed: analysisResult.pagesAnalyzed,
          status: analysisResult.status,
        },
      };
    } catch (error) {
      return {
        source: this.type,
        status: "unavailable",
        data: null,
        findings: [],
        confidence: "INSUFICIENTE",
        coverage: 0,
        evaluatedAt: new Date(),
        requiresAuth: false,
        metadata: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  private calculateFindingWeight(finding: RawFinding): number {
    // Los findings técnicos tienen peso menor en el score general de marketing
    if (finding.category === "seo" || finding.category === "presencia") {
      return 0.3;
    }
    if (finding.category === "conversion" || finding.category === "propuesta") {
      return 0.5;
    }
    if (finding.category === "trust") {
      return 0.4;
    }
    return 0.3;
  }

  private deriveConfidence(finding: RawFinding): "ALTA" | "MEDIA" | "BAJA" {
    // Derivar confidence según severidad y tipo
    if (finding.severity === "high" && finding.source === "html") {
      return "ALTA"; // Problemas técnicos detectados directamente en HTML tienen alta confianza
    }
    if (finding.severity === "high" && finding.source === "playwright") {
      return "ALTA"; // Mediciones directas de Playwright tienen alta confianza
    }
    if (finding.type === "info" || finding.type === "strength") {
      return "MEDIA"; // Signals positivos tienen confianza media
    }
    if (finding.severity === "medium") {
      return "MEDIA"; // Problemas medios tienen confianza media
    }
    return "BAJA"; // Low severity o casos no evidentes tienen baja confianza
  }
}