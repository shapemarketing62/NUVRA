import type { DiagnosisResult } from "../diagnostic/diagnostic-engine";
import type { NuvraScoreResult } from "../scoring/nuvra-score";
import type { RawFinding } from "../website-analyzer/types";
import type { FrameworkSelection } from "../frameworks/strategic-framework-engine";
import { createAIService, strategySchema, type StrategyOutput } from "../ai/ai-service.ts";
import { selectStrategicFrameworks, FRAMEWORKS } from "../frameworks/strategic-framework-engine.ts";
import { getPrimaryBusinessStep, hasConstrainedExecution, isRetentionObjective, getLocalMarketLabel, getBudgetFocus, isSpecificBusinessAction } from "./business-action-language.ts";
import type { BusinessProfile, ContextualFinding } from "../intelligence/business-profile";

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
  descripcion?: string | null;
  informacionComplementaria?: string | null;
  businessProfile?: BusinessProfile;
}

export interface StrategyResult extends StrategyOutput {
  engineType: "deterministic" | "ai";
  frameworks?: Array<{ id: string; title: string; rationale: string; useCase: string; dimension?: string; priority?: number }>;
  audit?: {
    candidates: Array<{ findingId: string; title: string; priority: number; selected: boolean; reason: string }>;
  };
}

export async function runStrategyEngine(
  context: StrategyContext,
  diagnosis: DiagnosisResult,
  scoreResult: NuvraScoreResult,
  findings: RawFinding[],
  businessProfile?: BusinessProfile
): Promise<StrategyResult> {
  const ai = createAIService();

  if (ai.isAvailable()) {
    const prompt = JSON.stringify({
      instruction: "Generá una estrategia para un pequeño negocio con poco tiempo y presupuesto limitado. Usá lenguaje cotidiano. Priorizá un problema, hasta tres oportunidades y entre tres y cinco acciones. Cada acción debe decir qué cambiar, dónde, para qué, por qué importa para el objetivo y cómo medirlo. Basate SOLO en diagnóstico, contexto y evidencia; no inventes datos ni recomiendes muchos canales a la vez.",
      context,
      businessProfile: businessProfile || context.businessProfile,
      diagnosis,
      score: scoreResult.total,
      coverage: scoreResult.coverage,
      dimensions: scoreResult.dimensions.map((d) => ({ slug: d.slug, points: d.points, confidence: d.confidence, message: d.message })),
      findings: findings.filter((f) => f.type === "problem").slice(0, 10),
    });
    const aiResult = await ai.completeStructured(prompt, strategySchema);
    if (aiResult) {
      const traceableActions = aiResult.actions.filter(isSpecificBusinessAction).filter((action) => Boolean(action.findingIds?.length && action.evidence && action.inference && action.problem));
      if (traceableActions.length > 0) return { ...aiResult, prioridades: aiResult.prioridades.slice(0, 3), actions: traceableActions.slice(0, 5), engineType: "ai", frameworks: aiResult.frameworks || [] };
    }
  }

  const profile = businessProfile || context.businessProfile;
  return profile ? buildProfileStrategy(context, diagnosis, scoreResult, profile) : buildDeterministicStrategy(context, diagnosis, scoreResult, findings);
}

const actionSourceLabel = (source: string) => ({ web: "el sitio web", instagram: "Instagram", search: "Google", reviews: "las reseñas", competitor: "la comparación con negocios similares", external_mentions: "las menciones externas", other: "la información aportada" }[source] || "el canal observado");

function businessDecisionFocus(profile: BusinessProfile): string {
  if (profile.commercialModel === "appointments") return "el servicio o tratamiento que más aporta al objetivo";
  if (profile.commercialModel === "reservations") return "la reserva, el pedido, los horarios y la ubicación";
  if (profile.commercialModel === "commerce") return "el producto, la entrega, el pago y la compra";
  if (profile.commercialModel === "membership") return "la prueba, los horarios, los cupos y la membresía";
  if (profile.commercialModel === "professional") return "la especialización, la experiencia y la solicitud de reunión";
  return "la oferta y el próximo paso del cliente";
}

function actionTextForFinding(profile: BusinessProfile, finding: ContextualFinding): { title: string; description: string; kpi: string } | null {
  const where = actionSourceLabel(finding.source);
  const action = profile.primaryCustomerAction;
  const focus = businessDecisionFocus(profile);
  if (finding.findingId === "declared:referrals") return { title: "Convertir las recomendaciones actuales en un paso fácil de repetir", description: `Después de una experiencia satisfactoria, pedir una recomendación con un mensaje breve y un enlace directo para que la nueva persona pueda ${action}. Hacerlo desde el canal que el negocio ya usa.`, kpi: "nuevos clientes que llegan recomendados" };
  if (finding.findingId === "declared:demand_pattern") return { title: "Trabajar específicamente los momentos con menos demanda", description: `Usar el dato aportado para mostrar disponibilidad y una propuesta concreta en los días u horarios señalados, sin cambiar lo que ya funciona en los momentos de mayor demanda.`, kpi: "reservas o ventas en los momentos señalados" };
  if (finding.findingId === "declared:capacity") return { title: "Ordenar la demanda según los cupos realmente disponibles", description: `Mostrar disponibilidad real y ofrecer una lista de espera o una alternativa antes de atraer más consultas que el equipo no pueda atender.`, kpi: "cupos ocupados sin consultas rechazadas" };
  if (finding.findingId === "declared:follow_up") return { title: `Usar el seguimiento existente para que más clientes puedan ${action}`, description: `Separar a los clientes según lo que compraron o recibieron y enviar un próximo paso útil en el momento adecuado, usando la información que el negocio ya registra.`, kpi: profile.primaryResult };
  if (finding.findingId === "declared:channel") return { title: `Hacer que el canal informado conduzca directamente a ${action}`, description: `Revisar el mensaje inicial, la respuesta y el enlace del canal mencionado por el negocio para que una persona entienda ${focus} y pueda avanzar sin cambiar de medio.`, kpi: profile.primaryResult };

  if (finding.type === "problem") {
    if (finding.area === "conversion") return { title: `Facilitar ${action} desde ${where}`, description: `Cambiar el primer paso visible en ${where} para que lleve directamente a ${action}. Mantener cerca la información necesaria sobre ${focus}.`, kpi: profile.primaryResult };
    if (finding.area === "propuesta") return { title: `Explicar mejor ${focus} en ${where}`, description: `Reescribir el mensaje principal de ${where} para decir qué ofrece el negocio, para quién es y qué debe hacer una persona para ${action}.`, kpi: profile.primaryResult };
    if (finding.area === "posicionamiento") return { title: `Dar una razón comprobable para elegir el negocio en ${where}`, description: `Mostrar en ${where} una prueba real —reseña, caso, profesional o forma de trabajo observada— junto al paso para ${action}.`, kpi: profile.primaryResult };
    if (finding.area === "redes") return { title: `Hacer que Instagram ayude a ${action}`, description: `Ajustar la bio, el enlace y la publicación fijada para explicar ${focus} y llevar a una única forma de ${action}.`, kpi: profile.primaryResult };
    if (finding.area === "adquisicion") return { title: `Conectar lo que una persona encuentra en ${where} con ${action}`, description: `Actualizar el resultado o perfil observado para mostrar ${focus}, la ubicación cuando corresponda y un enlace directo para ${action}.`, kpi: profile.primaryResult };
    if (finding.area === "retencion") return { title: `Crear un próximo paso para que los clientes puedan ${action}`, description: `Después de la experiencia actual, indicar cuándo y por qué conviene volver, y facilitar ese paso desde el canal que el negocio ya utiliza.`, kpi: profile.primaryResult };
    return { title: `Corregir la información observada en ${where}`, description: `Actualizar en ${where} los datos concretos señalados por la evidencia y comprobar que conduzcan a ${action}.`, kpi: profile.primaryResult };
  }

  if (finding.type === "strength") {
    if (finding.source === "reviews") return { title: `Usar las buenas reseñas para dar confianza antes de ${action}`, description: `Mostrar una selección verificable de las reseñas observadas cerca del lugar donde una persona decide ${action}, sin cambiar ni exagerar su contenido.`, kpi: profile.primaryResult };
    if (finding.source === "instagram") return { title: `Convertir la presencia ya lograda en Instagram en ${profile.primaryResult}`, description: `Conservar lo que ya funciona en el perfil y agregar un recorrido directo desde la bio o una publicación fijada hacia ${action}.`, kpi: profile.primaryResult };
    if (finding.source === "search") return { title: `Aprovechar la visibilidad encontrada en Google para facilitar ${action}`, description: `Mantener la información que ya ayuda a encontrar el negocio y sumar un paso claro desde ese resultado hacia ${action}.`, kpi: profile.primaryResult };
    if (finding.area === "propuesta") return { title: `Mantener claro ${focus} y conectarlo con ${action}`, description: `Conservar el mensaje favorable observado en ${where} y conectarlo con un paso directo para ${action}.`, kpi: profile.primaryResult };
    if (finding.area === "posicionamiento") return { title: `Llevar la prueba favorable de ${where} al momento de ${action}`, description: `Conservar la señal de confianza encontrada y mostrarla cerca del lugar donde una persona decide ${action}.`, kpi: profile.primaryResult };
    if (finding.area === "presencia") return { title: `Usar la información visible en ${where} para facilitar ${action}`, description: `Mantener los datos que ya están claros y agregar desde allí un camino directo para ${action}.`, kpi: profile.primaryResult };
    if (finding.area === "conversion") return { title: `Conservar el paso claro para ${action} y medir su resultado`, description: `Mantener el recorrido favorable observado en ${where} y registrar cuántas personas logran ${action}.`, kpi: profile.primaryResult };
    return { title: `Aprovechar la fortaleza observada en ${where}`, description: `Conservar la señal favorable encontrada y ubicarla cerca del momento en que una persona decide ${action}.`, kpi: profile.primaryResult };
  }
  return null;
}

export function buildProfileStrategy(context: StrategyContext, diagnosis: DiagnosisResult, scoreResult: NuvraScoreResult, profile: BusinessProfile): StrategyResult {
  const constrained = hasConstrainedExecution(context);
  const shortTerm = context.plazoDias <= 60;
  const candidates = profile.contextualFindings.map((finding) => {
    const text = actionTextForFinding(profile, finding);
    if (!text) return null;
    const feasibility = constrained ? (finding.source === "web" || finding.source === "other" ? 1 : .85) : 1;
    const urgency = shortTerm && ["conversion", "retencion"].includes(finding.area) ? 1.15 : 1;
    const strengthFactor = finding.type === "strength" ? .72 : 1;
    return { finding, text, priority: finding.priorityScore * feasibility * urgency * strengthFactor };
  }).filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate)).sort((a, b) => b.priority - a.priority);

  const seen = new Set<string>();
  const selected = candidates.filter((candidate) => {
    const key = candidate.text.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);

  const actions: StrategyOutput["actions"] = selected.map((candidate, index) => ({
    title: candidate.text.title,
    description: candidate.text.description,
    order: index + 1,
    impact: (candidate.priority >= 55 ? "alto" : candidate.priority >= 30 ? "medio" : "bajo") as "alto" | "medio" | "bajo",
    difficulty: (constrained ? "baja" : candidate.finding.source === "web" ? "media" : "baja") as "alta" | "media" | "baja",
    estimatedTime: shortTerm ? "30 días" : "30–60 días",
    dependencies: [],
    indicatorToImprove: candidate.text.kpi,
    rationale: `${candidate.finding.interpretation} ${candidate.finding.goalRelation}`,
    relatedFindingIds: [candidate.finding.findingId],
    findingIds: [candidate.finding.findingId],
    evidence: candidate.finding.evidence,
    inference: `${candidate.finding.interpretation} ${candidate.finding.goalRelation}`,
    dimension: candidate.finding.area,
    framework: "EvidenceLed",
    confidence: candidate.finding.confidence,
    problem: candidate.finding.type === "problem" ? candidate.finding.interpretation : `Existe una fortaleza que puede aprovecharse para ${profile.primaryCustomerAction}`,
    unlocksContent: false,
    effort: (constrained ? "baja" : "media") as "baja" | "media" | "alta",
    timeframe: shortTerm ? "30 días" : "30–60 días",
    kpi: candidate.text.kpi,
    justification: candidate.finding.goalRelation,
  })).filter(isSpecificBusinessAction);

  const firstEvidence = selected[0]?.finding;
  const frameworkSelection = selectStrategicFrameworks({ objetivo: context.objetivo, bottleneck: diagnosis.bottleneck.title, dimensionProblems: profile.problems.map((finding) => finding.area), score: scoreResult.total, hasWeb: profile.activeChannels.includes("web"), hasInstagram: profile.activeChannels.includes("instagram") });
  return {
    engineType: "deterministic",
    objetivo: `${context.objetivo}${context.magnitud ? ` (+${context.magnitud}%)` : ""} en ${context.plazoLabel}`,
    situacionActual: firstEvidence ? `${context.nombre} tiene un Nuvra Score de ${scoreResult.total ?? 40}/100. La primera decisión se apoya en esta evidencia de ${actionSourceLabel(firstEvidence.source)}: ${firstEvidence.evidence}` : `${context.nombre} tiene un Nuvra Score de ${scoreResult.total ?? 40}/100, pero todavía no hay evidencia concreta suficiente para recomendar un cambio específico.`,
    distanciaObjetivo: firstEvidence ? `El próximo paso es ${profile.primaryCustomerAction} con menos obstáculos, aprovechando las fortalezas que ya existen.` : "Hace falta incorporar evidencia concreta antes de indicar un cambio.",
    principalProblema: diagnosis.bottleneck.explanation,
    prioridades: actions.slice(0, 3).map((action) => action.title),
    frameworks: [{ id: frameworkSelection.primary, title: FRAMEWORKS[frameworkSelection.primary]?.name || frameworkSelection.primary, rationale: "Selección interna basada en el objetivo y la evidencia prioritaria.", useCase: FRAMEWORKS[frameworkSelection.primary]?.description || "", dimension: firstEvidence?.area, priority: 1 }],
    actions,
    audit: {
      candidates: candidates.map((candidate) => ({
        findingId: candidate.finding.findingId,
        title: candidate.text.title,
        priority: Math.round(candidate.priority * 100) / 100,
        selected: selected.includes(candidate),
        reason: selected.includes(candidate) ? "Seleccionada por evidencia, relevancia, urgencia y viabilidad." : "Descartada por menor prioridad o por límite de acciones.",
      })),
    },
  };
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
