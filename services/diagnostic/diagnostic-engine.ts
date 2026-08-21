import type { NuvraScoreResult, DimensionResult } from "@/services/scoring/nuvra-score";
import type { RawFinding } from "@/services/website-analyzer/types";
import { createAIService, diagnosisSchema, type DiagnosisOutput } from "@/services/ai/ai-service";

export interface BusinessContext {
  nombre: string;
  rubro: string;
  objetivo: string;
  plazoDias: number;
  plazoLabel: string;
  descripcion?: string | null;
  publicoObjetivo?: string | null;
}

export interface DiagnosisResult extends Omit<DiagnosisOutput, 'opportunities' | 'risks'> {
  engineType: "deterministic" | "ai";
  opportunities: string[];
  risks: string[];
}

export async function runDiagnosticEngine(
  business: BusinessContext,
  scoreResult: NuvraScoreResult,
  websiteFindings: RawFinding[]
): Promise<DiagnosisResult> {
  const ai = createAIService();

  if (ai.isAvailable()) {
    const prompt = buildAIPrompt(business, scoreResult, websiteFindings);
    const aiResult = await ai.completeStructured(prompt, diagnosisSchema);
    if (aiResult) {
      return { ...aiResult, engineType: "ai" };
    }
  }

  return buildDeterministicDiagnosis(business, scoreResult, websiteFindings);
}

function buildDeterministicDiagnosis(
  business: BusinessContext,
  scoreResult: NuvraScoreResult,
  websiteFindings: RawFinding[]
): DiagnosisResult {
  const evaluable = scoreResult.dimensions.filter((d) => d.points !== null);
  const sortedByWeakness = [...evaluable].sort((a, b) => (a.points ?? 100) - (b.points ?? 100));
  const weakest = sortedByWeakness[0] || null;
  const strongest = [...evaluable].sort((a, b) => (b.points ?? 0) - (a.points ?? 0))[0] || null;

  const relevantProblems = websiteFindings.filter((f) => f.type === "problem" && f.category !== "seo");
  const topProblems = relevantProblems.slice(0, 5);

  const strategicDimension = weakest && weakest.slug ? weakest : null;
  const strategicProblem = strategicDimension
    ? strategicDimension.problems.find((problem) => !/title|meta description|SEO|seo|index/i.test(problem)) || strategicDimension.problems[0] || "Falta claridad en la dimensión prioritaria."
    : "No hay evidencia suficiente para identificar una dimensión prioritaria con confianza.";

  // Build bottleneck from the strategic dimension's actual problems, not from random websiteFindings
  const bottleneckTitle = strategicProblem;
  const bottleneckExplanation = strategicDimension
    ? `La dimensión más débil es ${strategicDimension.name} (${strategicDimension.points ?? "No evaluado"}/100). ${strategicProblem}`
    : "No hay evidencia suficiente para identificar un único cuello de botella con confianza.";

  const coverage = scoreResult.coverage ?? Math.round((evaluable.length / scoreResult.dimensions.length) * 100);

  const summary = `${business.nombre} tiene un Nuvra Score de ${scoreResult.total ?? "N/A"}/100 orientado a "${business.objetivo}" en ${business.plazoLabel}. Cobertura del diagnóstico: ${coverage}%. ${
    scoreResult.total !== null && scoreResult.total >= 70
      ? "La base digital es sólida con áreas puntuales de mejora."
      : scoreResult.total !== null && scoreResult.total >= 50
        ? "Hay oportunidades claras de mejora para acercarse al objetivo."
        : "Existen limitaciones importantes que pueden estar frenando el objetivo comercial."
  } Análisis basado en datos reales del sitio web (${websiteFindings.length} hallazgos detectados).`;

  const strengths = scoreResult.dimensions
    .filter((d) => d.points !== null && d.points >= 65)
    .flatMap((d) =>
      Array.from(d.strengths).slice(0, 2).map((s) => ({
        title: d.name,
        evidence: s,
        findingId: undefined as string | undefined,
      }))
    )
    .slice(0, 4);

  if (strengths.length === 0 && strongest) {
    strengths.push({
      title: strongest.name,
      evidence: `Puntuación relativa más alta: ${strongest.points}/100. ${strongest.strengths[0] || "Sin evidencia adicional."}`,
      findingId: undefined,
    });
  }

  const weaknesses = topProblems.map((f) => ({
    title: f.title,
    evidence: f.evidence,
    findingId: undefined as string | undefined,
  }));

  if (weaknesses.length === 0 && weakest) {
    weaknesses.push({
      title: weakest.name,
      evidence: `Dimensión más débil (${weakest.points ?? "No evaluado"}/100): ${weakest.problems[0] || "Sin problemas específicos detectados."}`,
      findingId: undefined,
    });
  }

  const opportunities = buildOpportunities(strategicDimension, scoreResult.dimensions);
  const risks = buildRisks(business, scoreResult, strategicDimension);
  const priorities = buildPriorities(scoreResult.dimensions, `La dimensión prioritaria es ${strategicDimension?.name ?? "diagnóstico"}.`);

  return {
    engineType: "deterministic",
    summary,
    bottleneck: {
      dimension: strategicDimension?.name || "Diagnóstico",
      title: bottleneckTitle,
      explanation: bottleneckExplanation,
      findingId: undefined,
    },
    strengths,
    weaknesses,
    opportunities,
    risks,
    priorities,
  };
}

function buildOpportunities(weakest: DimensionResult | null, all: DimensionResult[]): string[] {
  const opps: string[] = [];
  if (weakest) {
    opps.push(`Mejorar ${weakest.name} (${weakest.points ?? "No evaluado"}/100) tendría el mayor impacto inmediato en tu Nuvra Score.`);
  } else {
    opps.push("Se necesita más información para priorizar una dimensión con impacto claro.");
  }

  const conversion = all.find((d) => d.slug === "conversion");
  if (conversion && conversion.points !== null && conversion.points < 60) {
    opps.push("Optimizar CTA, formularios y señales de confianza puede reducir la fricción real de contacto o compra.");
  }
  const posicionamiento = all.find((d) => d.slug === "posicionamiento");
  if (posicionamiento && posicionamiento.points !== null && posicionamiento.points < 60) {
    opps.push("Definir propuesta de valor y diferenciación puede mejorar la claridad de marca y la autoridad.");
  }
  return opps.slice(0, 4);
}

function buildRisks(business: BusinessContext, score: NuvraScoreResult, weakest: DimensionResult | null): string[] {
  const risks: string[] = [];
  const conversion = score.dimensions.find((d) => d.slug === "conversion");
  if (business.plazoDias <= 60 && weakest && weakest.slug !== "conversion" && conversion && conversion.points !== null && conversion.points < 50) {
    risks.push("Con un plazo corto, la baja conversión puede impedir resultados aunque aumente el tráfico.");
  }
  if (score.total !== null && score.total < 45) {
    risks.push("El score general bajo indica múltiples frentes abiertos — dispersar esfuerzos puede retrasar el objetivo.");
  }
  if (weakest && weakest.slug === "redes" && weakest.points !== null && weakest.points < 40) {
    risks.push("Sin presencia social conectada, es difícil evaluar si Instagram ayuda o limita el objetivo.");
  }
  return risks.slice(0, 3);
}

function buildPriorities(
  dimensions: DimensionResult[],
  _contextSummary: string
): DiagnosisResult["priorities"] {
  const items: DiagnosisResult["priorities"] = [];
  const sorted = [...dimensions].sort((a, b) => (a.points ?? 100) - (b.points ?? 100));

  for (const dim of sorted.slice(0, 3)) {
    const reason = dim.problems[0] || "Sin evidencia suficiente para describir el problema con precisión.";
    items.push({
      title: dim.name,
      reason,
      order: items.length + 1,
    });
  }

  return items.slice(0, 3);
}

function buildAIPrompt(
  business: BusinessContext,
  score: NuvraScoreResult,
  findings: RawFinding[]
): string {
  return JSON.stringify({
    instruction: "Genera un diagnóstico basado SOLO en los datos provistos. No inventes métricas.",
    business,
    nuvraScore: score.total,
    dimensions: score.dimensions.map((d) => ({ name: d.name, points: d.points, weight: d.weight, problems: d.problems })),
    findings: findings.map((f) => ({ title: f.title, evidence: f.evidence, category: f.category, severity: f.severity })),
  });
}
