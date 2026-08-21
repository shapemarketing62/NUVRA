import type { DiagnosisResult } from "@/services/diagnostic/diagnostic-engine";
import type { NuvraScoreResult } from "@/services/scoring/nuvra-score";
import type { RawFinding } from "@/services/website-analyzer/types";
import type { FrameworkSelection } from "@/services/frameworks/strategic-framework-engine";
import { createAIService, strategySchema, type StrategyOutput } from "@/services/ai/ai-service";
import { selectStrategicFrameworks, FRAMEWORKS } from "@/services/frameworks/strategic-framework-engine";

// Force recompilation: 2025-01-17T20:25:00Z

export interface StrategyContext {
  nombre: string;
  rubro: string;
  objetivo: string;
  plazoDias: number;
  plazoLabel: string;
  magnitud?: number | null;
}

export interface StrategyResult extends StrategyOutput {
  engineType: "deterministic" | "ai";
  frameworks?: Array<{ id: string; title: string; rationale: string; useCase: string; dimension?: string; priority?: number }>;
}

export async function runStrategyEngine(
  context: StrategyContext,
  diagnosis: DiagnosisResult,
  scoreResult: NuvraScoreResult,
  findings: RawFinding[]
): Promise<StrategyResult> {
  const ai = createAIService();

  if (ai.isAvailable()) {
    const prompt = JSON.stringify({
      instruction: "Genera estrategia personalizada basada SOLO en diagnóstico y findings. Cada acción debe referir un problema real. No inventes información que no esté en el análisis. Agrega frameworks seleccionados según objetivo, plazo y problema principal.",
      context,
      diagnosis,
      score: scoreResult.total,
      coverage: scoreResult.coverage,
      dimensions: scoreResult.dimensions.map((d) => ({ slug: d.slug, points: d.points, confidence: d.confidence, message: d.message })),
      findings: findings.filter((f) => f.type === "problem").slice(0, 10),
    });
    const aiResult = await ai.completeStructured(prompt, strategySchema);
    if (aiResult) {
      return { ...aiResult, engineType: "ai", frameworks: aiResult.frameworks || [] };
    }
  }

  return buildDeterministicStrategy(context, diagnosis, scoreResult, findings);
}

function buildDeterministicStrategy(
  context: StrategyContext,
  diagnosis: DiagnosisResult,
  scoreResult: NuvraScoreResult,
  findings: RawFinding[]
): StrategyResult {
  const shortTerm = context.plazoDias <= 60;
  const evaluable = scoreResult.dimensions.filter((d) => d.points !== null);
  const weakest = [...evaluable].sort((a, b) => (a.points ?? 100) - (b.points ?? 100))[0] || null;
  const conversionProblems = findings.filter((f) => f.category === "conversion" && f.type === "problem");
  const seoProblems = findings.filter((f) => f.category === "seo" && f.type === "problem");
  const trustProblems = findings.filter((f) => f.category === "trust" && f.type === "problem");
  const proposalProblems = findings.filter((f) => f.category === "propuesta" && f.type === "problem");

  const evidenceForAction = (slug: string) => findings.filter((f) => {
    const text = `${f.title} ${f.evidence}`;
    const match = /cta|form|contact|checkout|valor|propuesta|h1|naveg|estructura|mobile|seo|title|meta/i.test(text);
    return match && (f.category === slug || f.category === "trust");
  });

  const actions: StrategyOutput["actions"] = [];
  let order = 1;

  const frameworkSelection = selectStrategicFrameworks({
    objetivo: context.objetivo,
    bottleneck: diagnosis.bottleneck.title,
    dimensionProblems: scoreResult.dimensions.filter(d => d.points !== null && d.points < 50).map(d => d.slug),
    score: scoreResult.total,
    hasWeb: true,
    hasInstagram: Boolean(findings.some((f) => /instagram|redes/i.test(`${f.title} ${f.evidence}`))),
  });

  const addAction = (opts: {
    title: string;
    description: string;
    dimension: string;
    framework: string;
    findingIds: string[];
    evidence: string;
    inference: string;
    problem: string;
    impact: "alto" | "medio" | "bajo";
    effort: "baja" | "media" | "alta";
    timeframe: string;
    kpi: string;
    confidence: string;
    rationale?: string;
  }) => {
    actions.push({
      title: opts.title,
      description: opts.description,
      order: order++,
      impact: opts.impact,
      difficulty: opts.effort,
      estimatedTime: opts.timeframe,
      dependencies: [],
      indicatorToImprove: opts.kpi,
      rationale: opts.rationale || opts.inference,
      relatedFindingIds: opts.findingIds,
      findingIds: opts.findingIds,
      evidence: opts.evidence,
      inference: opts.inference,
      dimension: opts.dimension,
      framework: opts.framework,
      confidence: opts.confidence,
      problem: opts.problem,
      unlocksContent: false,
      effort: opts.effort,
      timeframe: opts.timeframe,
      kpi: opts.kpi,
      justification: opts.inference,
    });
  };

  if (weakest?.slug === "conversion" || conversionProblems.length > 0) {
    const relatedEvidence = evidenceForAction("conversion");
    const evidence = relatedEvidence[0]?.evidence || conversionProblems[0]?.evidence || "La dimensión de conversión es la más débil.";
    const problem = conversionProblems[0]?.title || weakest?.name || "Conversión";
    addAction({
      title: "Mover la acción principal al primer bloque y reducir la competencia entre CTAs",
      description: "Definir un único CTA principal por página, situarlo en el primer viewport y eliminar o atenuar acciones secundarias que compitan por la atención.",
      dimension: "conversion",
      framework: "CRO",
      findingIds: relatedEvidence.map((f) => `${f.category}:${f.title}`),
      evidence,
      inference: "Los usuarios llegan al sitio sin encontrar una acción principal clara en el primer bloque; la fricción inicial reduce la probabilidad de conversión.",
      problem,
      impact: "alto",
      effort: "media",
      timeframe: shortTerm ? "30 días" : "60 días",
      kpi: "Tasa de conversión / leads",
      confidence: weakest?.confidence || "MEDIA",
    });
  }

  if (weakest?.slug === "propuesta" || proposalProblems.length > 0) {
    const evidence = proposalProblems[0]?.evidence || diagnosis.bottleneck.explanation;
    const problem = proposalProblems[0]?.title || weakest?.name || "Propuesta de Valor";
    addAction({
      title: "Reescribir la propuesta de valor en el primer bloque visible",
      description: "Ajustar H1, primer párrafo y CTA para explicar claramente qué ofrece el negocio, para quién y qué beneficio recibe.",
      dimension: "propuesta",
      framework: "Propuesta de Valor",
      findingIds: proposalProblems.map((f) => `${f.category}:${f.title}`),
      evidence,
      inference: "El mensaje principal no comunica con claridad el beneficio diferencial; el usuario no entiende rápidamente por qué elegir este negocio.",
      problem,
      impact: "alto",
      effort: "media",
      timeframe: "30 días",
      kpi: "Tiempo de comprensión / tasa de consulta",
      confidence: weakest?.confidence || "MEDIA",
    });
  }

  if (seoProblems.length > 0 && weakest?.slug === "adquisicion") {
    const evidence = seoProblems[0].evidence;
    const problem = seoProblems[0].title;
    addAction({
      title: "Corregir SEO técnico básico que afecta descubrimiento e indexación",
      description: "Completar title, meta description, H1 y estructura semántica para mejorar la captación orgánica.",
      dimension: "adquisicion",
      framework: "Adquisición",
      findingIds: seoProblems.map((f) => `${f.category}:${f.title}`),
      evidence,
      inference: "La ausencia de elementos SEO básicos limita la visibilidad en motores de búsqueda y reduce el tráfico orgánico potencial.",
      problem,
      impact: "medio",
      effort: "baja",
      timeframe: shortTerm ? "30 días" : "90 días",
      kpi: "Tráfico orgánico / consultas",
      confidence: scoreResult.dimensions.find((d) => d.slug === "adquisicion")?.confidence || "MEDIA",
    });
  }

  if (trustProblems.length > 0) {
    const evidence = trustProblems[0].evidence;
    const problem = trustProblems[0].title;
    addAction({
      title: "Incorporar señales de confianza en el punto de decisión",
      description: "Agregar reseñas, casos o garantías en la zona de contacto para apoyar la decisión del usuario.",
      dimension: "conversion",
      framework: "CRO",
      findingIds: trustProblems.map((f) => `${f.category}:${f.title}`),
      evidence,
      inference: "El usuario no dispone de elementos que reduzcan la incertidumbre en el momento de decidir; la confianza es un factor de conversión.",
      problem,
      impact: "medio",
      effort: "media",
      timeframe: "45 días",
      kpi: "Tasa de conversión / leads",
      confidence: "MEDIA",
    });
  }

  if (actions.length === 0) {
    addAction({
      title: "Monitorear métricas y re-analizar en 30 días",
      description: "No hay evidencia suficiente para justificar un cambio estructural; conviene medir y volver a evaluar.",
      dimension: weakest?.slug || "diagnostico",
      framework: "STP",
      findingIds: [],
      evidence: "Sin evidencia suficiente para una acción específica.",
      inference: "El diagnóstico actual no permite identificar un problema con la confianza necesaria; se requiere más información antes de actuar.",
      problem: "Información insuficiente",
      impact: "medio",
      effort: "baja",
      timeframe: "30 días",
      kpi: "Nuvra Score total",
      confidence: "BAJA",
    });
  }

  const coverageText = scoreResult.coverage >= 75
    ? "cobertura sólida"
    : scoreResult.coverage >= 50
      ? "cobertura moderada"
      : "cobertura limitada";

  const situacionActual = `Nuvra Score ${scoreResult.total ?? "N/A"}/100 con ${coverageText} (${scoreResult.coverage || 0}% de cobertura). ${weakest ? `Dimensión más débil: ${weakest.name} (${weakest.points ?? "No evaluado"}/100).` : "No hay evidencia suficiente para priorizar una dimensión con alta confianza."} ${diagnosis.summary.split(".")[0]}.`;

  const frameworksOut = frameworkSelection.secondary.map((s) => ({
    id: s,
    title: FRAMEWORKS[s]?.name || s,
    rationale: frameworkSelection.rationale,
    useCase: FRAMEWORKS[s]?.description || "",
    dimension: weakest?.slug,
    priority: frameworkSelection.secondary.indexOf(s) + 1,
  }));

  return {
    engineType: "deterministic",
    objetivo: `${context.objetivo}${context.magnitud ? ` (+${context.magnitud}%)` : ""} en ${context.plazoLabel}`,
    situacionActual,
    distanciaObjetivo: scoreResult.total !== null && scoreResult.total >= 70
      ? "Buena base — optimización fina necesaria para maximizar resultados."
      : scoreResult.total !== null && scoreResult.total >= 50
        ? "Distancia moderada — mejoras en dimensiones clave pueden acelerar el avance."
        : "Distancia significativa — el problema principal está en la dimensión estratégica más débil y requiere trabajo estructural.",
    principalProblema: diagnosis.bottleneck.explanation,
    prioridades: diagnosis.priorities.map((p) => p.title),
    frameworks: [{ id: frameworkSelection.primary, title: FRAMEWORKS[frameworkSelection.primary]?.name || frameworkSelection.primary, rationale: frameworkSelection.rationale, useCase: FRAMEWORKS[frameworkSelection.primary]?.description || "", dimension: weakest?.slug, priority: 1 }, ...frameworksOut],
    actions: actions.slice(0, 6),
  };
}
