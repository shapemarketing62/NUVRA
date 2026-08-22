import type { DiagnosisResult } from "@/services/diagnostic/diagnostic-engine";
import type { NuvraScoreResult } from "@/services/scoring/nuvra-score";
import type { RawFinding } from "@/services/website-analyzer/types";
import type { FrameworkSelection } from "@/services/frameworks/strategic-framework-engine";
import { createAIService, strategySchema, type StrategyOutput } from "@/services/ai/ai-service";
import { selectStrategicFrameworks, FRAMEWORKS } from "@/services/frameworks/strategic-framework-engine";
import { getPrimaryBusinessStep, hasConstrainedExecution, isRetentionObjective, getLocalMarketLabel, getBudgetFocus, isSpecificBusinessAction } from "@/services/strategy/business-action-language";

// Force recompilation: 2025-01-17T20:25:00Z

export interface StrategyContext {
  nombre: string;
  rubro: string;
  objetivo: string;
  plazoDias: number;
  plazoLabel: string;
  magnitud?: number | null;
  ubicacion?: string | null;
  tipoCliente?: string | null;
  presupuesto?: number | null;
  capacidad?: string | null;
  canales?: string | null;
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
      instruction: "Generá una estrategia para un pequeño negocio con poco tiempo y presupuesto limitado. Usá lenguaje cotidiano. Priorizá un problema, hasta tres oportunidades y entre tres y cinco acciones. Cada acción debe decir qué cambiar, dónde, para qué, por qué importa para el objetivo y cómo medirlo. Basate SOLO en diagnóstico, contexto y evidencia; no inventes datos ni recomiendes muchos canales a la vez.",
      context,
      diagnosis,
      score: scoreResult.total,
      coverage: scoreResult.coverage,
      dimensions: scoreResult.dimensions.map((d) => ({ slug: d.slug, points: d.points, confidence: d.confidence, message: d.message })),
      findings: findings.filter((f) => f.type === "problem").slice(0, 10),
    });
    const aiResult = await ai.completeStructured(prompt, strategySchema);
    if (aiResult) {
      return { ...aiResult, prioridades: aiResult.prioridades.slice(0, 3), actions: aiResult.actions.filter(isSpecificBusinessAction).slice(0, 5), engineType: "ai", frameworks: aiResult.frameworks || [] };
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
  const primaryStep = getPrimaryBusinessStep(context);
  const constrainedExecution = hasConstrainedExecution(context);
  const retentionObjective = isRetentionObjective(context);
  const competitorFindings = findings.filter(f => /competidor|competencia/i.test(`${f.title} ${f.evidence}`));

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

  if (retentionObjective && findings.length > 0) {
    const observed = findings[0];
    addAction({
      title: "Crear un seguimiento concreto después de cada compra o atención",
      description: `Contactar a cada cliente después de la experiencia con un próximo paso útil y una invitación clara para volver. ${constrainedExecution ? "Empezar con una lista simple y un único mensaje de seguimiento." : "Separar el seguimiento según servicio o compra realizada."}`,
      dimension: "retencion",
      framework: "Retention",
      findingIds: [`${observed.category}:${observed.title}`],
      evidence: observed.evidence,
      inference: `El objetivo es aumentar la recompra; el seguimiento debe conectar la experiencia actual con una razón concreta para volver, sin asumir que hoy existe ese hábito.`,
      problem: "El objetivo depende de que clientes actuales vuelvan, no solamente de conseguir nuevas consultas",
      impact: "alto",
      effort: constrainedExecution ? "baja" : "media",
      timeframe: context.plazoDias <= 60 ? "30 días" : "60 días",
      kpi: "clientes que vuelven y tiempo entre compras o atenciones",
      confidence: "MEDIA",
    });
  }

  if (weakest?.slug === "conversion" || conversionProblems.length > 0) {
    const relatedEvidence = evidenceForAction("conversion");
    const evidence = relatedEvidence[0]?.evidence || conversionProblems[0]?.evidence || "El camino para consultar, reservar o comprar necesita simplificarse.";
    const problem = conversionProblems[0]?.title || weakest?.name || "El próximo paso no está suficientemente visible";
    addAction({
      title: `Hacer visible “${primaryStep.action}” desde la primera pantalla`,
      description: `Usar una única acción principal —“${primaryStep.action}”— al comienzo de la página y reducir enlaces que distraigan. ${constrainedExecution ? "Empezar por la página más visitada para mantener el trabajo acotado." : "Aplicar el mismo recorrido en las páginas de mayor intención."}`,
      dimension: "conversion",
      framework: "CRO",
      findingIds: relatedEvidence.map((f) => `${f.category}:${f.title}`),
      evidence,
      inference: `Una persona interesada puede recorrer el sitio sin encontrar cómo “${primaryStep.action}”; cada paso adicional puede reducir ${primaryStep.result}.`,
      problem,
      impact: "alto",
      effort: "media",
      timeframe: shortTerm ? "30 días" : "60 días",
      kpi: primaryStep.result,
      confidence: weakest?.confidence || "MEDIA",
    });
  }

  if (weakest?.slug === "propuesta" || proposalProblems.length > 0) {
    const evidence = proposalProblems[0]?.evidence || diagnosis.bottleneck.explanation;
    const problem = proposalProblems[0]?.title || weakest?.name || "Propuesta de Valor";
    addAction({
      title: "Explicar qué ofrecés y por qué elegirte desde la primera pantalla",
      description: `Cambiar el título, el primer párrafo y el botón principal para explicar el servicio, el beneficio concreto y el paso “${primaryStep.action}”.`,
      dimension: "propuesta",
      framework: "Propuesta de Valor",
      findingIds: proposalProblems.map((f) => `${f.category}:${f.title}`),
      evidence,
      inference: "El mensaje principal no comunica con claridad el beneficio diferencial; el usuario no entiende rápidamente por qué elegir este negocio.",
      problem,
      impact: "alto",
      effort: "media",
      timeframe: "30 días",
      kpi: primaryStep.result,
      confidence: weakest?.confidence || "MEDIA",
    });
  }

  if (seoProblems.length > 0 && weakest?.slug === "adquisicion") {
    const evidence = seoProblems[0].evidence;
    const problem = seoProblems[0].title;
    addAction({
      title: `Facilitar que personas de ${getLocalMarketLabel(context)} encuentren el servicio correcto`,
      description: `Ajustar el título principal, la descripción para Google y la información de ubicación en las páginas del servicio que más aporta al objetivo “${context.objetivo}”.`,
      dimension: "adquisicion",
      framework: "Adquisición",
      findingIds: seoProblems.map((f) => `${f.category}:${f.title}`),
      evidence,
      inference: "La ausencia de elementos SEO básicos limita la visibilidad en motores de búsqueda y reduce el tráfico orgánico potencial.",
      problem,
      impact: "medio",
      effort: "baja",
      timeframe: shortTerm ? "30 días" : "90 días",
      kpi: `visitas desde búsquedas de ${getLocalMarketLabel(context)} y ${primaryStep.result}`,
      confidence: scoreResult.dimensions.find((d) => d.slug === "adquisicion")?.confidence || "MEDIA",
    });
  }

  if (trustProblems.length > 0) {
    const evidence = trustProblems[0].evidence;
    const problem = trustProblems[0].title;
    addAction({
      title: "Mostrar reseñas y pruebas reales junto al lugar donde se consulta",
      description: `Agregar reseñas recientes, fotos o casos verificables cerca del botón “${primaryStep.action}” para reducir dudas antes del contacto.`,
      dimension: "conversion",
      framework: "CRO",
      findingIds: trustProblems.map((f) => `${f.category}:${f.title}`),
      evidence,
      inference: "El usuario no dispone de elementos que reduzcan la incertidumbre en el momento de decidir; la confianza es un factor de conversión.",
      problem,
      impact: "medio",
      effort: "media",
      timeframe: "45 días",
      kpi: primaryStep.result,
      confidence: "MEDIA",
    });
  }

  if (competitorFindings.length > 0) {
    const observed = competitorFindings[0];
    addAction({
      title: `Explicar por qué elegir ${context.nombre} frente a alternativas de ${getLocalMarketLabel(context)}`,
      description: `Elegir una diferencia comprobable —especialización, modalidad, atención o resultado— y mostrarla junto a “${primaryStep.action}”.`,
      dimension: "posicionamiento",
      framework: "Positioning",
      findingIds: competitorFindings.map(f => `${f.category}:${f.title}`),
      evidence: observed.evidence,
      inference: "Cuando existen alternativas visibles para el mismo cliente, una diferencia concreta facilita la decisión y evita competir solamente por precio.",
      problem: "El cliente puede comparar varias alternativas sin encontrar una razón clara para elegir este negocio",
      impact: "medio",
      effort: constrainedExecution ? "baja" : "media",
      timeframe: "30 días",
      kpi: primaryStep.result,
      confidence: observed.confidence || "MEDIA",
    });
  }

  if (actions.length === 0) {
    addAction({
      title: "Registrar durante 30 días cómo llegan y avanzan las nuevas consultas",
      description: "Anotar cuántas consultas llegan, desde qué canal y cuántas terminan en una reserva o venta. Conectar el sitio, las redes o las reseñas permitirá afinar el próximo paso.",
      dimension: weakest?.slug || "diagnostico",
      framework: "STP",
      findingIds: [],
      evidence: `El negocio busca ${context.objetivo.toLowerCase()} en ${context.plazoLabel}, pero todavía no registra el recorrido completo de cada consulta.`,
      inference: "Medir el recorrido real permite decidir dónde actuar sin atribuir resultados a un canal por intuición.",
      problem: "No está claro en qué paso se pierden hoy las personas interesadas",
      impact: "medio",
      effort: "baja",
      timeframe: "30 días",
      kpi: "Consultas recibidas, reservas o ventas y canal de origen",
      confidence: "BAJA",
    });
  }

  if ((context.presupuesto ?? 0) > 0 && actions.length < 5) {
    addAction({
      title: "Concentrar el presupuesto mensual en una sola prueba medible",
      description: getBudgetFocus(context),
      dimension: "adquisicion",
      framework: "Adquisición",
      findingIds: [],
      evidence: `El negocio informó un presupuesto aproximado de USD ${Math.round(context.presupuesto || 0)} por mes y el objetivo “${context.objetivo}”.`,
      inference: "Con un presupuesto acotado, repartir la inversión entre muchos canales impide saber qué genera consultas o ventas reales.",
      problem: "El presupuesto necesita un foco único para producir aprendizaje y resultados medibles",
      impact: "medio",
      effort: "baja",
      timeframe: "30 días",
      kpi: `costo por ${primaryStep.result} y cantidad de ${primaryStep.result}`,
      confidence: "MEDIA",
    });
  }

  if (actions.length < 3) {
    addAction({
      title: `Medir durante 30 días cada vez que alguien decide “${primaryStep.action}”`,
      description: `Llevar un registro simple con fecha, canal de origen y resultado de cada consulta. Revisarlo una vez por semana y comparar qué canal aporta más ${primaryStep.result}.`,
      dimension: "medicion",
      framework: "Measurement",
      findingIds: [],
      evidence: `El objetivo informado es “${context.objetivo}” en ${context.plazoLabel}; medir el paso principal permite comprobar avances sin herramientas costosas.`,
      inference: "Un registro pequeño y constante permite decidir qué mantener, qué corregir y dónde no seguir gastando.",
      problem: "Hace falta una medida simple y directa para saber si las primeras mejoras funcionan",
      impact: "medio",
      effort: "baja",
      timeframe: "30 días",
      kpi: primaryStep.result,
      confidence: "ALTA",
    });
  }

  if (actions.length < 3) {
    addAction({
      title: "Unificar el nombre, la oferta y el contacto en todos los perfiles",
      description: `Revisar el sitio, Instagram, Google y directorios encontrados para que muestren el mismo nombre, servicio principal, ubicación y forma de “${primaryStep.action}”.`,
      dimension: "presencia",
      framework: "Consistency",
      findingIds: [],
      evidence: `NUVRA identificó los datos básicos aportados para ${context.nombre} y los canales deben conducir al mismo próximo paso.`,
      inference: "Cuando la información cambia entre canales, una persona puede dudar, abandonar o contactar por un medio que el negocio no revisa.",
      problem: "La información básica necesita funcionar como un único recorrido, incluso cuando aparece en lugares distintos",
      impact: "medio",
      effort: "baja",
      timeframe: "15 días",
      kpi: `${primaryStep.result} provenientes de perfiles actualizados`,
      confidence: "MEDIA",
    });
  }

  const situacionActual = scoreResult.total !== null
    ? `${context.nombre} tiene un Nuvra Score de ${scoreResult.total}/100. Para avanzar hacia ${context.objetivo.toLowerCase()}, el primer foco debería estar en ${weakest?.name.toLowerCase() || "hacer más claro el recorrido hacia la consulta o compra"}.`
    : `${context.nombre} busca ${context.objetivo.toLowerCase()}. El primer paso es observar cómo llegan las consultas y en qué momento dejan de avanzar, para decidir sobre datos reales.`;

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
      ? "Hay una buena base. Conviene mejorar un punto por vez y medir el resultado."
      : scoreResult.total !== null && scoreResult.total >= 50
        ? "Hay una base aprovechable, pero todavía existen obstáculos concretos antes de llegar al objetivo."
        : "Hay varios aspectos por mejorar. NUVRA priorizó el primero para evitar repartir tiempo y presupuesto.",
    principalProblema: diagnosis.bottleneck.explanation,
    prioridades: [diagnosis.bottleneck.title, getBudgetFocus(context), ...diagnosis.priorities.map((p) => p.title)].filter((item, index, all) => all.indexOf(item) === index).slice(0, 3),
    frameworks: [{ id: frameworkSelection.primary, title: FRAMEWORKS[frameworkSelection.primary]?.name || frameworkSelection.primary, rationale: frameworkSelection.rationale, useCase: FRAMEWORKS[frameworkSelection.primary]?.description || "", dimension: weakest?.slug, priority: 1 }, ...frameworksOut],
    actions: actions.filter(isSpecificBusinessAction).slice(0, 5),
  };
}
