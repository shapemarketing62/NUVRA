import type { RawFinding } from "@/services/website-analyzer/types";
import type { ScoreDimensionSlug } from "@/lib/utils";

export interface DimensionWeights {
  presencia: number;
  conversion: number;
  posicionamiento: number;
  propuesta: number;
  redes: number;
  adquisicion: number;
  identidad: number;
}

export type ConfidenceLevel = "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE";

export interface DimensionResult {
  slug: ScoreDimensionSlug;
  name: string;
  points: number | null; // null si no hay suficiente información
  weight: number;
  criteria: string[];
  strengths: string[];
  problems: string[];
  source: string;
  confidence: ConfidenceLevel;
  findings: RawFinding[];
  message?: string; // Explicación cuando confidence es INSUFICIENTE
}

export interface ClarificationResponse {
  questionId: string;
  answer: string;
  affects: string;
}

export interface NuvraScoreResult {
  total: number | null;
  dimensions: DimensionResult[];
  weights: DimensionWeights;
  allFindings: RawFinding[];
  coverage: number;
}

const DEFAULT_WEIGHTS: DimensionWeights = {
  presencia: 0.13,
  conversion: 0.17,
  posicionamiento: 0.13,
  propuesta: 0.13,
  redes: 0.12,
  adquisicion: 0.17,
  identidad: 0.15,
};

const DIMENSION_RULES: Record<ScoreDimensionSlug, { key: string[]; minCriteriaForZero: number; minCriteriaForHigh: number; allowZero?: boolean }> = {
  presencia: { key: ["disponibilidad", "performance", "mobile", "navegacion", "estructura", "tecnica"], minCriteriaForZero: 4, minCriteriaForHigh: 5 },
  conversion: { key: ["cta", "claridad", "formulario", "pasos", "contacto", "confianza", "mobile"], minCriteriaForZero: 4, minCriteriaForHigh: 5 },
  posicionamiento: { key: ["segmentacion", "diferenciacion", "mensaje", "autoridad"], minCriteriaForZero: 3, minCriteriaForHigh: 3, allowZero: false },
  propuesta: { key: ["mensaje", "diferenciacion", "valor", "claridad"], minCriteriaForZero: 3, minCriteriaForHigh: 3 },
  redes: { key: ["redes", "engagement", "consistencia", "conectividad"], minCriteriaForZero: 2, minCriteriaForHigh: 2 },
  adquisicion: { key: ["seo", "trafico", "captacion", "landing"], minCriteriaForZero: 3, minCriteriaForHigh: 3 },
  identidad: { key: ["logo", "color", "tipografia", "fotografia", "tono", "consistencia"], minCriteriaForZero: 3, minCriteriaForHigh: 4 },
};

function categorizeFinding(f: RawFinding): ScoreDimensionSlug | null {
  const category = f.category.toLowerCase();
  if (category.includes("conversion") || /cta|form|checkout|contacto|lead|whatsapp|consulta|pedido|reserv/i.test(f.title + " " + f.evidence)) return "conversion";
  if (category.includes("seo") || /title|meta description|index|seo|canonical|robots|schema|alt text/i.test(f.title + " " + f.evidence)) return "adquisicion";
  if (category.includes("presencia") || /naveg|mobile|estructura|h2|performance|carga|nav|header|ux/i.test(f.title + " " + f.evidence)) return "presencia";
  if (category.includes("propuesta") || /h1|propuesta|valor|mensaje|claridad|diferenci|posicion/i.test(f.title + " " + f.evidence)) return "propuesta";
  if (category.includes("identidad") || /logo|color|tipograf|fotograf|identidad visual|consistencia de marca/i.test(f.title + " " + f.evidence)) return "identidad";
  if (category.includes("posicionamiento") || /marca|autoridad|posicion|diferenci/i.test(f.title + " " + f.evidence)) return "posicionamiento";
  if (category.includes("redes") || /instagram|social|redes|engagement/i.test(f.title + " " + f.evidence)) return "redes";
  if (category.includes("trust") || /confianza|testimonio|reseña|garant|caso/i.test(f.title + " " + f.evidence)) return "conversion";
  return null;
}

function evaluateDimensionCriteria(findingGroups: RawFinding[], slug: ScoreDimensionSlug): { score: number; criteria: string[]; evidence: string[] } {
  const relevant = findingGroups.filter((f) => categorizeFinding(f) === slug || f.category === slug || /presencia|conversion|propuesta|adquisicion|redes|posicionamiento|identidad/.test(f.category));
  const rule = DIMENSION_RULES[slug];
  const criteria = rule.key.map((key) => {
    const hasSignal = relevant.some((f) => {
      const haystack = `${f.title} ${f.evidence} ${f.description}`.toLowerCase();
      return haystack.includes(key) || /cta|contact|form|whatsapp|seo|title|meta|h1|naveg|mobile|carga|estructura|propuesta|valor|diferenci|posicion|instagram|redes|confianza/.test(haystack);
    });
    return hasSignal ? key : null;
  }).filter(Boolean) as string[];

  const strongProblems = relevant.filter((f) => f.type === "problem" && f.severity === "high").length;
  const mediumProblems = relevant.filter((f) => f.type === "problem" && f.severity === "medium").length;
  const lowProblems = relevant.filter((f) => f.type === "problem" && f.severity === "low").length;
  const positiveSignals = relevant.filter((f) => f.type !== "problem").length;

  let score = 70;
  score -= strongProblems * 18;
  score -= mediumProblems * 9;
  score -= lowProblems * 4;
  score += positiveSignals * 5;
  score = Math.max(0, Math.min(100, score));

  if (criteria.length < 2) {
    score = Math.max(0, score - 15);
  }

  if (criteria.length < rule.minCriteriaForHigh && score >= 70) {
    score = Math.min(score, 60);
  }

  if (criteria.length < rule.minCriteriaForZero && score <= 10) {
    score = Math.max(0, score + 10);
  }

  return {
    score,
    criteria,
    evidence: relevant.map((f) => `${f.title}: ${f.evidence}`),
  };
}

function calculateConfidence(findings: RawFinding[], hasDirectData: boolean, minFindings: number = 3, userResponseBoost: number = 0): ConfidenceLevel {
  if (!hasDirectData && findings.length === 0 && userResponseBoost === 0) return "INSUFICIENTE";
  if (!hasDirectData && findings.length < minFindings && userResponseBoost === 0) return "INSUFICIENTE";

  const highConfidenceFindings = findings.filter((f) => f.confidence === "alta");
  if (findings.length >= minFindings && highConfidenceFindings.length >= Math.min(minFindings, 2)) {
    return "ALTA";
  }
  if (findings.length >= 2 || userResponseBoost >= 2) {
    return "MEDIA";
  }
  if (findings.length >= 1 || userResponseBoost >= 1) {
    return "BAJA";
  }
  return "INSUFICIENTE";
}

export function getWeightsForObjective(objetivo: string, plazoDias: number): DimensionWeights {
  const shortTerm = plazoDias <= 60;
  const longTerm = plazoDias >= 300;

  if (/venta|consult|lead|reserv|conversi/i.test(objetivo) && shortTerm) {
    return { presencia: 0.09, conversion: 0.25, posicionamiento: 0.09, propuesta: 0.13, redes: 0.08, adquisicion: 0.21, identidad: 0.15 };
  }
  if (/reconoc|posicion|marca|tráfico|trafico/i.test(objetivo) && longTerm) {
    return { presencia: 0.15, conversion: 0.08, posicionamiento: 0.2, propuesta: 0.13, redes: 0.15, adquisicion: 0.09, identidad: 0.2 };
  }
  if (/redes|instagram|social/i.test(objetivo)) {
    return { presencia: 0.12, conversion: 0.12, posicionamiento: 0.12, propuesta: 0.09, redes: 0.25, adquisicion: 0.12, identidad: 0.18 };
  }
  if (/lead|consult/i.test(objetivo)) {
    return { presencia: 0.09, conversion: 0.22, posicionamiento: 0.13, propuesta: 0.13, redes: 0.08, adquisicion: 0.22, identidad: 0.13 };
  }
  return DEFAULT_WEIGHTS;
}

function shouldForceNull(score: number | null, criteriaCount: number, slug: ScoreDimensionSlug, confidence: ConfidenceLevel): boolean {
  if (score === null) return true;
  if (confidence === "INSUFICIENTE") return true;
  if (criteriaCount < 2 && slug === "presencia") return true;
  if (criteriaCount < 2 && slug === "conversion") return true;
  return false;
}

export function calculateNuvraScore(
  findings: RawFinding[],
  pagesAnalyzed: number,
  objetivo: string,
  plazoDias: number,
  hasInstagram: boolean,
  hasWeb: boolean,
  clarificationResponses?: ClarificationResponse[]
): NuvraScoreResult {
  const weights = getWeightsForObjective(objetivo, plazoDias);
  const byCategory = (cat: string) => findings.filter((f) => f.category === cat);

  const responseFindings = clarificationResponses ? buildFindingsFromResponses(clarificationResponses) : [];
  const allFindings = [...findings, ...responseFindings];

  const dimensionMapper: Record<ScoreDimensionSlug, RawFinding[]> = {
    presencia: [...byCategory("presencia"), ...byCategory("ux"), ...responseFindings.filter((f) => f.category === "presencia")],
    conversion: [...byCategory("conversion"), ...byCategory("trust"), ...responseFindings.filter((f) => f.category === "conversion")],
    posicionamiento: [...byCategory("posicionamiento"), ...responseFindings.filter((f) => f.category === "posicionamiento")],
    propuesta: [...byCategory("propuesta"), ...responseFindings.filter((f) => f.category === "propuesta")],
    redes: [...byCategory("redes"), ...responseFindings.filter((f) => f.category === "redes")],
    adquisicion: [...byCategory("adquisicion"), ...byCategory("seo"), ...responseFindings.filter((f) => f.category === "adquisicion")],
    identidad: [...byCategory("identidad"), ...responseFindings.filter((f) => f.category === "identidad")],
  };

  const responseCountByDimension: Record<string, number> = {};
  for (const r of clarificationResponses ?? []) {
    responseCountByDimension[r.affects] = (responseCountByDimension[r.affects] || 0) + 1;
  }

  const scoreDimension = (slug: ScoreDimensionSlug): DimensionResult => {
    const catFindings = dimensionMapper[slug] || [];
    const userResponseBoost = responseCountByDimension[slug] || 0;
    const confidence = calculateConfidence(catFindings, slug === "redes" ? hasInstagram : true, slug === "redes" ? 1 : 2, userResponseBoost);
    const evaluated = evaluateDimensionCriteria(catFindings, slug);
    const score = shouldForceNull(evaluated.score, evaluated.criteria.length, slug, confidence) ? null : evaluated.score;
    const isSparse = evaluated.criteria.length < 2 || confidence === "INSUFICIENTE";
    const safeScore = score === null ? null : (isSparse && score > 80 ? 60 : score);

    return buildDimension(slug, getDimensionName(slug), safeScore, weights[slug], catFindings, confidence, slug === "redes" ? hasInstagram : undefined, evaluated.criteria, evaluated.evidence);
  };

  const dimensions: DimensionResult[] = [
    scoreDimension("presencia"),
    scoreDimension("conversion"),
    scoreDimension("posicionamiento"),
    scoreDimension("propuesta"),
    scoreDimension("redes"),
    scoreDimension("adquisicion"),
    scoreDimension("identidad"),
  ];

  const evaluableDimensions = dimensions.filter((d) => d.points !== null);
  const coverage = Math.round((evaluableDimensions.length / dimensions.length) * 100);

  let total: number | null = null;
  if (evaluableDimensions.length > 0) {
    const totalWeight = evaluableDimensions.reduce((sum, d) => sum + d.weight, 0);
    const normalizedTotal = evaluableDimensions.reduce((sum, d) => sum + ((d.points ?? 0) * d.weight) / totalWeight, 0);
    total = Math.round(normalizedTotal);
  }

  return { total, dimensions, weights, allFindings, coverage };
}

function buildFindingsFromResponses(responses: ClarificationResponse[]): RawFinding[] {
  const out: RawFinding[] = [];
  for (const r of responses) {
    const text = r.answer.toLowerCase();
    const base = {
      pageUrl: "clarification",
      source: "clarification",
      confidence: "media",
      impact: "bajo",
    } as const;
    switch (r.affects) {
      case "posicionamiento":
        if (/muy conocida|moderadamente conocida/.test(text)) {
          out.push({ type: "info", category: "posicionamiento", severity: "low", title: "Reconocimiento de marca declarado", description: "El usuario indicó que la marca es conocida en el mercado.", evidence: r.answer, ...base } as RawFinding);
        }
        if (/precio|calidad|servicio|ubicación|innovación|especialización/.test(text)) {
          out.push({ type: "info", category: "posicionamiento", severity: "low", title: "Diferencial declarado", description: "El usuario identificó un diferencial competitivo.", evidence: r.answer, ...base } as RawFinding);
        }
        if (/boca a boca|instagram|google|publicidad pagada|tráfico directo|recomendaciones/.test(text)) {
          out.push({ type: "info", category: "adquisicion", severity: "low", title: "Fuente de adquisición declarada", description: "El usuario indicó de dónde llegan sus clientes.", evidence: r.answer, ...base } as RawFinding);
        }
        break;
      case "adquisicion":
        if (/sí, mensual|sí, ocasional/.test(text)) {
          out.push({ type: "info", category: "adquisicion", severity: "low", title: "Presupuesto publicitario declarado", description: "El usuario indicó que cuenta con presupuesto para publicidad digital.", evidence: r.answer, ...base } as RawFinding);
        }
        if (/instagram|google|boca a boca|publicidad pagada|local|presencial/.test(text)) {
          out.push({ type: "info", category: "adquisicion", severity: "low", title: "Canal de adquisición principal declarado", description: "El usuario indicó su canal principal de adquisición.", evidence: r.answer, ...base } as RawFinding);
        }
        break;
      case "conversion":
        if (/proceso de compra complejo|falta de confianza|ctas poco claros|formulario extenso|no se encuentra información/.test(text)) {
          out.push({ type: "problem", category: "conversion", severity: "medium", title: "Barrera de conversión declarada", description: "El usuario identificó una barrera específica en la conversión.", evidence: r.answer, ...base, impact: "medio" } as RawFinding);
        }
        if (/menos de \$5|5\.000|15\.000|50\.000|100\.000/.test(text)) {
          out.push({ type: "info", category: "conversion", severity: "low", title: "Ticket promedio declarado", description: "El usuario indicó su ticket promedio aproximado.", evidence: r.answer, ...base } as RawFinding);
        }
        break;
      case "propuesta":
        if (text.length > 10) {
          out.push({ type: "info", category: "propuesta", severity: "low", title: "Diferencial declarado", description: "El usuario describió qué hace único al negocio.", evidence: r.answer, ...base } as RawFinding);
        }
        break;
      case "redes":
        if (/muy importante|importante/.test(text)) {
          out.push({ type: "info", category: "redes", severity: "low", title: "Importancia de Instagram declarada", description: "El usuario indicó la relevancia estratégica de Instagram.", evidence: r.answer, ...base } as RawFinding);
        }
        break;
    }
  }
  return out;
}

function getDimensionName(slug: ScoreDimensionSlug): string {
  switch (slug) {
    case "presencia": return "Presencia Digital";
    case "conversion": return "Conversión";
    case "posicionamiento": return "Posicionamiento";
    case "propuesta": return "Propuesta de Valor";
    case "redes": return "Redes Sociales";
    case "adquisicion": return "Adquisición";
    case "identidad": return "Identidad de marca";
    default: return slug;
  }
}

function buildDimension(
  slug: ScoreDimensionSlug,
  name: string,
  points: number | null,
  weight: number,
  catFindings: RawFinding[],
  confidence: ConfidenceLevel,
  connected?: boolean,
  criteriaOverride?: string[],
  evidenceOverride?: string[]
): DimensionResult {
  const problems = catFindings.filter((f) => f.type === "problem").map((f) => `${f.title}: ${f.evidence}`);
  const strengths = catFindings.filter((f) => f.type === "info" || f.type === "strength").map((f) => `${f.title}: ${f.evidence}`);

  const criteria = criteriaOverride ?? [];
  const evidence = evidenceOverride ?? problems;

  if (slug === "redes" && !connected) {
    problems.push("Instagram no conectado — análisis de redes limitado a datos ingresados por el usuario.");
  }

  if (slug === "presencia" && points !== null && points >= 90 && evidence.length < 3) {
    points = 60;
  }

  if (confidence === "ALTA" && points === 0 && criteria.length < 2) {
    points = null;
  }

  const message = confidence === "INSUFICIENTE"
    ? `No evaluado / Información insuficiente para ${name.toLowerCase()}.`
    : undefined;

  return {
    slug,
    name,
    points,
    weight,
    criteria,
    strengths,
    problems,
    source: slug === "redes" && !connected ? "user_input" : "website_analyzer",
    confidence,
    findings: catFindings,
    message,
  };
}
