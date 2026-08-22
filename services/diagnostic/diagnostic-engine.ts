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
    ? strategicDimension.problems.find((problem) => !/title|meta description|SEO|seo|index/i.test(problem)) || strategicDimension.problems[0] || "Hoy no hay un único problema que explique el resultado. Hay varias mejoras concretas que conviene ordenar."
    : `Todavía no se pudo observar con claridad qué parte del recorrido está frenando ${business.objetivo.toLowerCase()}.`;

  // Build bottleneck from the strategic dimension's actual problems, not from random websiteFindings
  const bottleneckTitle = strategicProblem;
  const bottleneckExplanation = strategicDimension
    ? `${strategicProblem} Esto puede hacer que menos personas avancen hacia ${business.objetivo.toLowerCase()} dentro de ${business.plazoLabel}.`
    : `Conocemos el negocio y su objetivo, pero todavía falta observar el recorrido real de una persona hasta la consulta o compra.`;

  const summary = scoreResult.total !== null
    ? `${business.nombre} obtiene un Nuvra Score de ${scoreResult.total}/100. Para avanzar hacia ${business.objetivo.toLowerCase()} en ${business.plazoLabel}, conviene concentrar primero el esfuerzo en ${strategicDimension?.name.toLowerCase() || "hacer más claro el camino hacia la consulta o compra"}. ${
    scoreResult.total !== null && scoreResult.total >= 70
      ? "La base actual acompaña el objetivo, aunque todavía hay mejoras concretas que pueden ayudar a conseguir más resultados."
      : scoreResult.total !== null && scoreResult.total >= 50
        ? "Hay una base aprovechable, pero algunos obstáculos hacen que parte del interés no llegue a convertirse en consultas o ventas."
        : "Hoy existen obstáculos concretos que pueden estar frenando el objetivo comercial."
  }`
    : `${business.nombre} busca ${business.objetivo.toLowerCase()} en ${business.plazoLabel}. Ya encontramos señales útiles para orientar los primeros cambios, aunque el puntaje general se completará cuando podamos contrastar más partes del negocio.`;

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
      evidence: strongest.strengths[0] || "Es el área que hoy ofrece la mejor base para apoyar el objetivo.",
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
      evidence: weakest.problems[0] || "Es el área que hoy necesita atención antes que el resto.",
      findingId: undefined,
    });
  }

  const opportunities = buildOpportunities(strategicDimension, scoreResult.dimensions);
  const risks = buildRisks(business, scoreResult, strategicDimension);
  const priorities = buildPriorities(scoreResult.dimensions, `Esta es el área que más puede acercar el negocio a su objetivo: ${strategicDimension?.name ?? "la información disponible"}.`);

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
    opps.push(`Mejorar ${weakest.name.toLowerCase()} es la oportunidad más directa para acercarse al objetivo actual.`);
  } else {
    opps.push("Conectar el sitio, las redes o las reseñas permitirá detectar el primer cambio con impacto comercial concreto.");
  }

  const conversion = all.find((d) => d.slug === "conversion");
  if (conversion && conversion.points !== null && conversion.points < 60) {
    opps.push("Hacer más visible el botón principal, simplificar los formularios y mostrar señales de confianza puede generar más consultas o compras.");
  }
  const posicionamiento = all.find((d) => d.slug === "posicionamiento");
  if (posicionamiento && posicionamiento.points !== null && posicionamiento.points < 60) {
    opps.push("Explicar con claridad qué ofrece el negocio, para quién y por qué elegirlo puede facilitar la decisión de nuevos clientes.");
  }
  return opps.slice(0, 3);
}

function buildRisks(business: BusinessContext, score: NuvraScoreResult, weakest: DimensionResult | null): string[] {
  const risks: string[] = [];
  const conversion = score.dimensions.find((d) => d.slug === "conversion");
  if (business.plazoDias <= 60 && weakest && weakest.slug !== "conversion" && conversion && conversion.points !== null && conversion.points < 50) {
    risks.push("Con un plazo corto, recibir más visitas no alcanzará si esas personas no encuentran un camino claro para consultar o comprar.");
  }
  if (score.total !== null && score.total < 45) {
    risks.push("Hay varios frentes posibles; intentar resolverlos todos al mismo tiempo puede retrasar el objetivo.");
  }
  if (weakest && weakest.slug === "redes" && weakest.points !== null && weakest.points < 40) {
    risks.push("Conectar Instagram permitiría entender mejor si hoy esa cuenta ayuda a generar interés y consultas.");
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
    if (dim.points === null) continue;
    const reason = dim.problems[0] || "Esta área ofrece una oportunidad concreta para acercarse al objetivo.";
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
