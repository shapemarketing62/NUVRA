import { SourceAnalyzer, type SourceEvidence, type SourceType, type EvidenceFinding } from "./source-analyzer.ts";
import { executeSource, type SourceExecutionPolicy } from "./source-execution.ts";
import type { Business } from "@prisma/client";

// Extender Business temporalmente para incluir goals
interface BusinessWithGoals extends Business {
  goals?: Array<{ objetivo?: string }>;
}

export interface AggregatedEvidence {
  businessId: string;
  sources: Record<SourceType, SourceEvidence>;
  findings: EvidenceFinding[];
  byCategory: Record<string, EvidenceFinding[]>;
  byDimension: Record<string, EvidenceFinding[]>;
  deduplicated: EvidenceFinding[];
  evaluatedAt: Date;
}

export interface SourceCoverage {
  source: SourceType;
  status: "evaluated" | "unavailable" | "not_relevant" | "requires_auth";
  coverage: number; // 0-100 - qué tan completa fue esta fuente individual
  relevance: number; // 0-1 - cuánto aporta al coverage total
  confidence: "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE";
  reason: string;
}

export interface CoverageResult {
  overallMarketingCoverage: number; // 0-100 - qué % de la evidencia relevante para el marketing de ESTE negocio fue obtenida
  bySource: Record<SourceType, SourceCoverage>;
  evaluatedSources: SourceType[];
  missingSources: SourceType[];
  relevantSources: SourceType[];
  requiresAuthSources: SourceType[];
  canCalculateNuvraScore: boolean;
  reason: string;
  // Alias para compatibilidad con código existente
  total: number;
}

// Todas las fuentes posibles que pueden aportar evidencia de marketing
const ALL_SOURCE_TYPES: SourceType[] = ["web", "instagram", "search", "reviews", "competitor", "x", "external_mentions"];

export class EvidenceAggregator {
  private sources: Map<SourceType, SourceAnalyzer>;
  private readonly policies: Partial<Record<SourceType, SourceExecutionPolicy>>;

  constructor(policies: Partial<Record<SourceType, SourceExecutionPolicy>> = {}) {
    this.sources = new Map();
    this.policies = policies;
  }

  registerSource(analyzer: SourceAnalyzer): void {
    this.sources.set(analyzer.type, analyzer);
  }

  async aggregate(business: Business, context: { signal?: AbortSignal } = {}): Promise<AggregatedEvidence> {
    const businessWithGoals = business as BusinessWithGoals;
    const evidenceMap: Record<SourceType, SourceEvidence> = {} as any;
    const allFindings: EvidenceFinding[] = [];

    // Las fuentes se ejecutan de forma concurrente y aislada. Una excepción, un
    // timeout o un proveedor caído solo modifica el estado de esa fuente.
    const entries = Array.from(this.sources.entries());
    const settled = await Promise.allSettled(entries.map(async ([type, analyzer]) => {
      const relevance = analyzer.isRelevant(business);
      
      if (!relevance.relevant) {
        return [type, {
          source: type,
          status: "not_relevant",
          data: null,
          findings: [],
          confidence: "INSUFICIENTE",
          coverage: 0,
          evaluatedAt: new Date(),
          requiresAuth: analyzer.requiresAuth,
          metadata: { reason: relevance.reason, notRelevant: true },
        } satisfies SourceEvidence] as const;
      }

      if (analyzer.requiresAuth && !analyzer.isAvailable(business)) {
        return [type, {
          source: type,
          status: "requires_auth",
          data: null,
          findings: [],
          confidence: "INSUFICIENTE",
          coverage: 0,
          evaluatedAt: new Date(),
          requiresAuth: true,
          metadata: { reason: "Esta fuente requiere autenticación/API real", requiresAuth: true },
        } satisfies SourceEvidence] as const;
      }

      if (!analyzer.isAvailable(business)) {
        return [type, {
          source: type,
          status: "unavailable",
          data: null,
          findings: [],
          confidence: "INSUFICIENTE",
          coverage: 0,
          evaluatedAt: new Date(),
          requiresAuth: analyzer.requiresAuth,
          metadata: { reason: "Fuente no disponible o sin datos públicos", unavailable: true },
        } satisfies SourceEvidence] as const;
      }

      const policy = this.policies[type] || defaultPolicy(type);
      const execution = await executeSource({
        source: type,
        operation: (signal) => analyzer.analyze(business, { signal }),
        policy,
        signal: context.signal,
        shouldRetryResult: (value) => value.status === "unavailable",
      });
      const evidence = execution.value || {
          source: type,
          status: "unavailable",
          data: null,
          findings: [],
          confidence: "INSUFICIENTE",
          coverage: 0,
          evaluatedAt: new Date(),
          requiresAuth: analyzer.requiresAuth,
          metadata: { reason: "No pudimos completar esta fuente." },
        } satisfies SourceEvidence;
      evidence.metadata = {
        ...(evidence.metadata || {}),
        execution: execution.audit,
        ...(execution.audit.failure ? { failure: execution.audit.failure } : {}),
      };
      return [type, evidence] as const;
    }));

    settled.forEach((result, index) => {
      const type = entries[index][0];
      if (result.status === "fulfilled") {
        evidenceMap[result.value[0]] = result.value[1];
        allFindings.push(...result.value[1].findings);
      } else {
        evidenceMap[type] = {
          source: type,
          status: "unavailable",
          data: null,
          findings: [],
          confidence: "INSUFICIENTE",
          coverage: 0,
          evaluatedAt: new Date(),
          requiresAuth: entries[index][1].requiresAuth,
          metadata: {
            reason: "No pudimos completar esta fuente.",
            execution: { source: type, status: "error", durationMs: 0, timeoutMs: defaultPolicy(type).timeoutMs, attempts: 0 },
          },
        };
      }
    });

    // Deduplicar findings
    const deduplicated = this.deduplicateFindings(allFindings);

    // Agrupar por categoría y dimensión
    const byCategory = this.groupByCategory(deduplicated);
    const byDimension = this.groupByDimension(deduplicated);

    return {
      businessId: business.id,
      sources: evidenceMap,
      findings: deduplicated,
      byCategory,
      byDimension,
      deduplicated,
      evaluatedAt: new Date(),
    };
  }

  private deduplicateFindings(findings: EvidenceFinding[]): EvidenceFinding[] {
    const seen = new Set<string>();
    const deduplicated: EvidenceFinding[] = [];

    for (const finding of findings) {
      const key = `${finding.category}:${finding.evidence.toLowerCase()}`;
      
      if (seen.has(key)) {
        const existing = deduplicated.find(f => 
          f.category === finding.category && 
          f.evidence.toLowerCase() === finding.evidence.toLowerCase()
        );
        if (existing) {
          existing.weight = Math.max(existing.weight, finding.weight);
          const mergedConf = this.mergeConfidence(existing.confidence, finding.confidence);
          existing.confidence = mergedConf === "INSUFICIENTE" ? "BAJA" : mergedConf;
        }
      } else {
        seen.add(key);
        deduplicated.push(finding);
      }
    }

    return deduplicated;
  }

  private mergeConfidence(a: "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE", b: "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE"): "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE" {
    const order = { ALTA: 3, MEDIA: 2, BAJA: 1, INSUFICIENTE: 0 };
    const merged = Math.max(order[a], order[b]);
    return Object.entries(order).find(([_, v]) => v === merged)?.[0] as "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE";
  }

  private groupByCategory(findings: EvidenceFinding[]): Record<string, EvidenceFinding[]> {
    const grouped: Record<string, EvidenceFinding[]> = {};
    for (const f of findings) {
      if (!grouped[f.category]) grouped[f.category] = [];
      grouped[f.category].push(f);
    }
    return grouped;
  }

  private groupByDimension(findings: EvidenceFinding[]): Record<string, EvidenceFinding[]> {
    const dimensions: Record<string, EvidenceFinding[]> = {
      presencia: [],
      conversion: [],
      posicionamiento: [],
      propuesta: [],
      redes: [],
      adquisicion: [],
      retencion: [],
    };

    for (const f of findings) {
      if (f.category === "presencia") {
        dimensions.presencia.push(f);
      } else if (f.category === "conversion" || f.category === "ux") {
        dimensions.conversion.push(f);
      } else if (f.category === "posicionamiento" || f.category === "trust") {
        dimensions.posicionamiento.push(f);
      } else if (f.category === "propuesta") {
        dimensions.propuesta.push(f);
      } else if (f.category === "redes") {
        dimensions.redes.push(f);
      } else if (f.category === "adquisicion" || f.category === "seo") {
        dimensions.adquisicion.push(f);
      } else if (f.category === "retencion") {
        dimensions.retencion.push(f);
      }
    }

    return dimensions;
  }
}

function defaultPolicy(source: SourceType): SourceExecutionPolicy {
  const policies: Record<SourceType, SourceExecutionPolicy> = {
    web: { timeoutMs: 30_000, retries: 1, backoffMs: 350 },
    search: { timeoutMs: 22_000, retries: 1, backoffMs: 300 },
    reviews: { timeoutMs: 18_000, retries: 1, backoffMs: 300 },
    competitor: { timeoutMs: 24_000, retries: 1, backoffMs: 350 },
    external_mentions: { timeoutMs: 22_000, retries: 1, backoffMs: 300 },
    instagram: { timeoutMs: 12_000, retries: 0, backoffMs: 0 },
    x: { timeoutMs: 12_000, retries: 0, backoffMs: 0 },
    other: { timeoutMs: 15_000, retries: 1, backoffMs: 250 },
  };
  return policies[source];
}

export class CoverageCalculator {
  static calculate(
    aggregatedEvidence: AggregatedEvidence,
    business: Business
  ): CoverageResult {
    const businessWithGoals = business as BusinessWithGoals;
    const sources = aggregatedEvidence.sources;
    const evaluatedSources: SourceType[] = [];
    const missingSources: SourceType[] = [];
    const requiresAuthSources: SourceType[] = [];
    const relevantSources: SourceType[] = [];
    const bySource: Record<SourceType, SourceCoverage> = {} as any;

    let totalWeight = 0;
    let achievedWeight = 0;

    for (const sourceType of ALL_SOURCE_TYPES) {
      const relevance = this.calculateRelevance(sourceType, businessWithGoals);
      
      if (!relevance.relevant) {
        bySource[sourceType] = {
          source: sourceType,
          status: "not_relevant",
          coverage: 0,
          relevance: 0,
          confidence: "INSUFICIENTE",
          reason: relevance.reason,
        };
        continue;
      }

      relevantSources.push(sourceType);
      const evidence = sources[sourceType];

      const status: SourceCoverage["status"] = evidence ? evidence.status : "unavailable";
      const isEvaluated = status === "evaluated" && evidence.findings.length > 0;

      const coverage: SourceCoverage = {
        source: sourceType,
        status,
        coverage: isEvaluated ? evidence.coverage : 0,
        relevance: relevance.weight,
        confidence: isEvaluated ? evidence.confidence : "INSUFICIENTE",
        reason: evidence
          ? (evidence.metadata?.reason as string) || `Fuente ${status}`
          : relevance.reason,
      };

      if (status === "evaluated" && isEvaluated) {
        evaluatedSources.push(sourceType);
        achievedWeight += coverage.coverage * coverage.relevance;
      } else if (status === "requires_auth") {
        requiresAuthSources.push(sourceType);
      } else {
        missingSources.push(sourceType);
      }

      totalWeight += coverage.relevance * 100;
      bySource[sourceType] = coverage;
    }

    const overallMarketingCoverage = totalWeight > 0 ? Math.round((achievedWeight / totalWeight) * 100) : 0;
    const canCalculateNuvraScore = this.canCalculateScore(overallMarketingCoverage, evaluatedSources, businessWithGoals);
    const reason = this.getReasonForCannotCalculate(overallMarketingCoverage, evaluatedSources, businessWithGoals);

    return {
      overallMarketingCoverage,
      bySource,
      evaluatedSources,
      missingSources,
      relevantSources,
      requiresAuthSources,
      canCalculateNuvraScore,
      reason,
      total: overallMarketingCoverage,
    };
  }

  private static calculateRelevance(sourceType: SourceType, business: BusinessWithGoals): { weight: number; relevant: boolean; reason: string } {
    const rubro = business.rubro?.toLowerCase() || "";
    const objetivo = business.goals?.[0]?.objetivo?.toLowerCase() || "";
    const tipoCliente = business.tipoCliente?.toLowerCase() || "";
    const canales = (business.canales || "").toLowerCase();
    const instagramHandle = business.instagramHandle;
    const webUrl = business.webUrl;
    const isB2C = tipoCliente.includes("b2c") || tipoCliente.includes("consumidor") || tipoCliente.includes("retail");
    const isB2B = tipoCliente.includes("b2b") || tipoCliente.includes("empresa") || tipoCliente.includes("corporativo");

    // Detectar tipo de negocio por rubro
    const isEcommerce = /ecom|tienda|venta|shop|store|retail/i.test(rubro);
    const isRestaurante = /restaurante|cafe|cafeter|comida|delivery|bar|pizza|burger|food/i.test(rubro);
    const isServicio = /servicio|consult|abogado|clinic|dent|psic|arquitect|agency|studio|profesional|salud|belleza|estetica/i.test(rubro);
    const isSaaS = /saas|software|platform|app|subscription|crm|b2b|tech|tecnolog/i.test(rubro);
    const isLocal = Boolean(business.ubicacion || business.ciudad) || isRestaurante || isServicio || /local|barrio|zona|ciudad/i.test(rubro);
    const noWebDeclared = Boolean(business.noWebDeclared);
    const noInstagramDeclared = Boolean(business.noInstagramDeclared);

    switch (sourceType) {
      case "web": {
        // Web es casi siempre relevante
        let weight = 0.35;
        if (isEcommerce) weight = 0.5;
        else if (isSaaS) weight = 0.5;
        else if (isServicio) weight = 0.4;
        else if (isRestaurante) weight = 0.3;
        else if (isB2B) weight = 0.45;

        // Objetivo de conversión/venta aumenta peso
        if (/venta|conversi|reserv|lead|compr/i.test(objetivo)) weight = Math.min(weight + 0.1, 0.6);
        // Objetivo de marca/posicionamiento reduce peso (otros canales importan)
        if (/marca|reconoc|posicion|brand/i.test(objetivo)) weight = Math.max(weight - 0.05, 0.2);

        const relevant = !(noWebDeclared && !isEcommerce && !isSaaS && !isB2B);
        return { weight, relevant, reason: relevant ? "El sitio web puede aportar información comercial verificable" : "El negocio declaró no tener web y su modelo no depende de ella para operar" };
      }

      case "instagram": {
        // Instagram relevante para B2C, restaurantes, moda, belleza, servicios locales
        let weight = 0.15;
        let relevant = false;

        if (isRestaurante) { weight = 0.3; relevant = true; }
        else if (/moda|ropa|belleza|estetica|fitness|deporte|viaje|turismo|arte|cultura/i.test(rubro)) { weight = 0.3; relevant = true; }
        else if (isServicio && isB2C) { weight = 0.25; relevant = true; }
        else if (isB2C && !isB2B) { weight = 0.2; relevant = true; }
        else if (instagramHandle) { weight = 0.25; relevant = true; }

        // Si declaró Instagram en canales, es relevante
        if (canales.includes("instagram") || instagramHandle) { weight = Math.max(weight, 0.25); relevant = true; }

        // Objetivo de redes/engagement
        if (/redes|social|instagram|engagement|seguidores/i.test(objetivo)) { weight = Math.max(weight, 0.3); relevant = true; }

        if (noInstagramDeclared && !instagramHandle) relevant = false;
        return { weight, relevant, reason: relevant ? "Instagram puede aportar actividad comercial observable" : "Instagram no fue declarado como canal activo para este negocio" };
      }

      case "search": {
        // Search relevante para negocios locales, servicios, ecommerce
        let weight = 0.15;
        let relevant = isLocal;

        if (isLocal) { weight = 0.25; relevant = true; }
        else if (isServicio) { weight = 0.2; relevant = true; }
        else if (isEcommerce) { weight = 0.2; relevant = true; }
        else if (isSaaS) { weight = 0.2; relevant = true; }

        // Objetivo de tráfico/visibilidad
        if (/tráfico|trafico|visibil|buscador|seo|google|organico|organico/i.test(objetivo)) { weight = Math.max(weight, 0.25); relevant = true; }

        return { weight, relevant, reason: relevant ? "Search indica autoridad y visibilidad orgánica" : "Search no es un canal prioritario para este negocio" };
      }

      case "reviews": {
        // Reviews relevante para restaurantes, servicios, hoteles, ecommerce
        let weight = 0.15;
        let relevant = isLocal;

        if (isRestaurante) { weight = 0.3; relevant = true; }
        else if (isServicio) { weight = 0.25; relevant = true; }
        else if (/hotel|viaje|turismo|salud|belleza|estetica/i.test(rubro)) { weight = 0.25; relevant = true; }
        else if (isEcommerce) { weight = 0.15; relevant = true; }

        // Objetivo de reputación/confianza
        if (/reputación|reputacion|confianza|testimonio|reseña|resena|opinion/i.test(objetivo)) { weight = Math.max(weight, 0.25); relevant = true; }

        return { weight, relevant, reason: relevant ? "Reviews indican prueba social y reputación" : "Reviews no son un canal prioritario para este negocio" };
      }

      case "competitor": {
        // Competencia siempre suma contexto, pero con peso moderado
        let weight = 0.1;
        let relevant = true;

        // Más relevante en mercados competitivos
        if (isEcommerce || isRestaurante || isServicio) weight = 0.15;
        if (/compet|mercado|diferenci/i.test(objetivo)) weight = 0.2;

        return { weight, relevant, reason: "Competencia permite comparación y contexto de mercado" };
      }

      case "x": {
        // X/Twitter relevante para tech, SaaS, noticias, media
        let weight = 0.05;
        let relevant = false;

        if (isSaaS || /tecnolog|software|noticias|media|periodismo|politica|finanzas/i.test(rubro)) { weight = 0.15; relevant = true; }
        if (canales.includes("x") || canales.includes("twitter")) { weight = 0.15; relevant = true; }

        return { weight, relevant, reason: relevant ? "X es canal de conversación y alcance" : "X no es un canal relevante para este negocio" };
      }

      case "external_mentions": {
        // Menciones externas relevantes para autoridad y posicionamiento
        let weight = 0.1;
        let relevant = true;

        if (isServicio) { weight = 0.15; relevant = true; }
        if (/reconoc|marca|posicion|visibil|autoridad|presencia/i.test(objetivo)) { weight = 0.15; relevant = true; }

        return { weight, relevant, reason: relevant ? "Menciones externas indican autoridad y visibilidad de marca" : "Menciones externas menos relevantes para este objetivo" };
      }

      default:
        return { weight: 0.05, relevant: false, reason: "Fuente adicional no relevante" };
    }
  }

  private static canCalculateScore(
    overallCoverage: number,
    evaluatedSources: SourceType[],
    business: BusinessWithGoals
  ): boolean {
    const rubro = business.rubro?.toLowerCase() || "";
    const tipoCliente = business.tipoCliente?.toLowerCase() || "";
    const isB2C = tipoCliente.includes("b2c") || tipoCliente.includes("consumidor") || tipoCliente.includes("retail");
    const isEcommerce = /ecom|tienda|venta|shop|store|retail/i.test(rubro);
    const isSaaS = /saas|software|platform|app|subscription|crm|b2b|tech|tecnolog/i.test(rubro);
    const isRestaurante = /restaurante|cafe|cafeter|comida|delivery|bar|pizza|burger|food/i.test(rubro);
    const isServicio = /servicio|consult|abogado|clinic|dent|psic|arquitect|agency|studio|profesional|salud|belleza|estetica/i.test(rubro);

    // 1. Coverage mínimo general
    if (overallCoverage < 40) return false;

    // 2. Regla de diversidad mínima:
    //    - Negocios web-first puros (ecommerce, SaaS) pueden calcular con solo web
    //    - Negocios que requieren fuentes externas (restaurantes, servicios, B2C local)
    //      necesitan más de una fuente estratégica independiente
    const isWebFirst = isEcommerce || isSaaS;
    const requiresExternalSources = isRestaurante || isServicio || (isB2C && !isWebFirst);

    if (requiresExternalSources && evaluatedSources.length < 2) {
      return false;
    }

    // 3. Si solo hay web y el negocio no es web-first, coverage insuficiente
    if (evaluatedSources.length === 1 && evaluatedSources[0] === "web" && !isWebFirst) {
      return false;
    }

    return true;
  }

  private static getReasonForCannotCalculate(
    overallCoverage: number,
    evaluatedSources: SourceType[],
    business: BusinessWithGoals
  ): string {
    const rubro = business.rubro?.toLowerCase() || "";
    const tipoCliente = business.tipoCliente?.toLowerCase() || "";
    const isB2C = tipoCliente.includes("b2c") || tipoCliente.includes("consumidor") || tipoCliente.includes("retail");
    const isEcommerce = /ecom|tienda|venta|shop|store|retail/i.test(rubro);
    const isSaaS = /saas|software|platform|app|subscription|crm|b2b|tech|tecnolog/i.test(rubro);
    const isRestaurante = /restaurante|cafe|cafeter|comida|delivery|bar|pizza|burger|food/i.test(rubro);
    const isServicio = /servicio|consult|abogado|clinic|dent|psic|arquitect|agency|studio|profesional|salud|belleza|estetica/i.test(rubro);

    const isWebFirst = isEcommerce || isSaaS;
    const requiresExternalSources = isRestaurante || isServicio || (isB2C && !isWebFirst);

    if (overallCoverage < 30) {
      return "Cobertura insuficiente para evaluar el marketing general. Se requiere evidencia de múltiples fuentes.";
    }
    if (overallCoverage < 40) {
      return "Cobertura insuficiente para evaluar el marketing general. Se requiere más evidencia de fuentes relevantes.";
    }
    if (requiresExternalSources && evaluatedSources.length < 2) {
      return "Cobertura insuficiente para evaluar el marketing general. Este negocio requiere evidencia de múltiples fuentes (Web, Instagram, Search, Reviews, etc.) - una sola fuente no es suficiente.";
    }
    if (evaluatedSources.length === 1 && evaluatedSources[0] === "web" && !isWebFirst) {
      return "Cobertura insuficiente para evaluar el marketing general. Solo se evaluó Web - se requieren fuentes externas adicionales.";
    }
    return "Cobertura suficiente para cálculo de Nuvra Score.";
  }
}
