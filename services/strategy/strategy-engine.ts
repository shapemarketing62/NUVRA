import type { DiagnosisResult } from "../diagnostic/diagnostic-engine";
import type { NuvraScoreResult } from "../scoring/nuvra-score";
import type { RawFinding } from "../website-analyzer/types";
import type { FrameworkSelection } from "../frameworks/strategic-framework-engine";
import { createAIService, strategySchema, type StrategyOutput } from "../ai/ai-service.ts";
import { selectStrategicFrameworks, FRAMEWORKS } from "../frameworks/strategic-framework-engine.ts";
import { getPrimaryBusinessStep, hasConstrainedExecution, isRetentionObjective, getLocalMarketLabel, getBudgetFocus, isSpecificBusinessAction } from "./business-action-language.ts";
import type { BusinessProfile, ContextualFinding } from "../intelligence/business-profile";
import type { ProblemCandidate } from "../intelligence/commercial-candidates.ts";

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
    candidates: Array<{
      findingId: string;
      problemCandidateId?: string;
      title: string;
      priority: number;
      selected: boolean;
      reason: string;
      journeyStage?: string;
      evidenceIds?: string[];
      cause?: string;
      proposedChange?: string;
      where?: string;
      estimatedCost?: string;
      difficulty?: string;
      timeframe?: string;
      dependencies?: string[];
      metric?: string;
      expectedImpact?: string;
      confidence?: string;
    }>;
  };
}

export async function runStrategyEngine(
  context: StrategyContext,
  diagnosis: DiagnosisResult,
  scoreResult: NuvraScoreResult,
  findings: RawFinding[],
  businessProfile?: BusinessProfile
): Promise<StrategyResult> {
  const profile = businessProfile || context.businessProfile;
  if (profile) return buildProfileStrategy(context, diagnosis, scoreResult, profile);
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

  return buildDeterministicStrategy(context, diagnosis, scoreResult, findings);
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
  const candidates = profile.problemCandidates.map((problem) => ({ problem, intervention: interventionFor(profile, problem, context, constrained, shortTerm) })).sort((a, b) => b.problem.priorityScore - a.problem.priorityScore);
  const seen = new Set<string>();
  const selected = candidates.filter(({ problem }) => {
    const key = `${problem.journeyStage}:${problem.pattern}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);

  const actions: StrategyOutput["actions"] = selected.map(({ problem, intervention }, index) => ({
    title: intervention.title,
    description: intervention.description,
    order: index + 1,
    impact: (problem.priorityScore >= 55 ? "alto" : problem.priorityScore >= 30 ? "medio" : "bajo") as "alto" | "medio" | "bajo",
    difficulty: intervention.difficulty,
    estimatedTime: intervention.timeframe,
    dependencies: problem.dependencies,
    indicatorToImprove: intervention.metric,
    rationale: `${problem.causalExplanation} Por eso conviene intervenir en ${intervention.where}.`,
    relatedFindingIds: problem.evidenceFor,
    findingIds: problem.evidenceFor,
    evidence: evidenceForProblem(profile, problem),
    inference: problem.causalExplanation,
    dimension: problem.journeyStage,
    framework: "CommercialJourney",
    confidence: problem.confidence,
    problem: problem.hypothesis,
    unlocksContent: false,
    effort: intervention.difficulty,
    timeframe: intervention.timeframe,
    kpi: intervention.metric,
    justification: `Esta intervención responde a una fricción de ${problem.journeyStage} que afecta el objetivo “${profile.goal.text}”.`,
  })).filter(isSpecificBusinessAction);

  const primary = selected[0]?.problem;
  const frameworkSelection = selectStrategicFrameworks({ objetivo: context.objetivo, bottleneck: diagnosis.bottleneck.title, dimensionProblems: profile.problemCandidates.map((problem) => problem.journeyStage), score: scoreResult.total, hasWeb: profile.activeChannels.includes("web"), hasInstagram: profile.activeChannels.includes("instagram") });
  return {
    engineType: "deterministic",
    objetivo: `${context.objetivo}${context.magnitud ? ` (+${context.magnitud}%)` : ""} en ${context.plazoLabel}`,
    situacionActual: primary ? `${context.nombre} tiene un Nuvra Score de ${scoreResult.total ?? 40}/100. La hipótesis principal está en ${primary.journeyStage}: ${primary.hypothesis}` : `${context.nombre} tiene un Nuvra Score de ${scoreResult.total ?? 40}/100, pero todavía no hay evidencia concreta suficiente para recomendar un cambio específico.`,
    distanciaObjetivo: primary ? `El próximo paso es intervenir donde hoy se frena el recorrido hacia ${profile.primaryCustomerAction}, sin modificar las partes que ya funcionan.` : "Hace falta incorporar evidencia concreta antes de indicar un cambio.",
    principalProblema: diagnosis.bottleneck.explanation,
    prioridades: actions.slice(0, 3).map((action) => action.title),
    frameworks: [{ id: frameworkSelection.primary, title: FRAMEWORKS[frameworkSelection.primary]?.name || frameworkSelection.primary, rationale: "Selección interna basada en la hipótesis causal, el objetivo y el recorrido comercial.", useCase: FRAMEWORKS[frameworkSelection.primary]?.description || "", dimension: primary?.journeyStage, priority: 1 }],
    actions,
    audit: {
      candidates: candidates.map((candidate) => ({
        findingId: candidate.problem.evidenceFor[0] || candidate.problem.id,
        problemCandidateId: candidate.problem.id,
        title: candidate.intervention.title,
        priority: candidate.problem.priorityScore,
        selected: selected.includes(candidate),
        reason: selected.includes(candidate) ? "Seleccionada por fuerza de evidencia, impacto sobre el objetivo, relevancia comercial, frecuencia y posibilidad de solución." : "Descartada por menor prioridad causal o por límite de acciones.",
        journeyStage: candidate.problem.journeyStage,
        evidenceIds: candidate.problem.evidenceFor,
        cause: candidate.problem.causalExplanation,
        proposedChange: candidate.intervention.change,
        where: candidate.intervention.where,
        estimatedCost: candidate.intervention.cost,
        difficulty: candidate.intervention.difficulty,
        timeframe: candidate.intervention.timeframe,
        dependencies: candidate.problem.dependencies,
        metric: candidate.intervention.metric,
        expectedImpact: candidate.intervention.expectedImpact,
        confidence: candidate.problem.confidence,
      })),
    },
  };
}

interface Intervention {
  title: string;
  description: string;
  change: string;
  where: string;
  cost: string;
  difficulty: "baja" | "media" | "alta";
  timeframe: string;
  metric: string;
  expectedImpact: string;
}

function evidenceForProblem(profile: BusinessProfile, problem: ProblemCandidate): string {
  return problem.evidenceFor.map((id) => profile.commercialEvidence.find((item) => item.id === id)?.text).filter(Boolean).join(" · ");
}

function interventionLocation(profile: BusinessProfile, problem: ProblemCandidate): string {
  const sources = problem.evidenceFor.map((id) => profile.commercialEvidence.find((item) => item.id === id)?.source).filter(Boolean);
  const labels = Array.from(new Set(sources.map((source) => actionSourceLabel(String(source)))));
  return labels.length ? labels.join(" y ") : profile.primaryChannel ? actionSourceLabel(profile.primaryChannel) : "el canal principal del negocio";
}

function interventionFor(profile: BusinessProfile, problem: ProblemCandidate, context: StrategyContext, constrained: boolean, shortTerm: boolean): Intervention {
  const where = interventionLocation(profile, problem);
  const action = profile.primaryCustomerAction;
  const metricByStage: Record<string, string> = {
    discovery: `personas que llegan desde ${where} y avanzan a evaluar el negocio`,
    evaluation: `personas que pasan de revisar información a intentar ${action}`,
    decision: `personas que resuelven sus dudas y avanzan a ${action}`,
    action: profile.primaryResult,
    experience: "tiempo de respuesta, entregas o atenciones completadas sin reclamos",
    retention: profile.primaryResult,
  };
  const base = { where, cost: constrained ? "sin inversión o inversión baja" : "inversión baja", difficulty: constrained ? "baja" as const : "media" as const, timeframe: shortTerm ? "14–30 días" : "30–45 días", metric: metricByStage[problem.journeyStage], expectedImpact: `Reducir la fricción en ${problem.journeyStage} y facilitar ${action}.` };
  const isPrimary = profile.problemCandidates[0]?.id === problem.id;
  const referralSignal = profile.declaredSignals.find((signal) => signal.type === "referrals");
  if (isPrimary && referralSignal) {
    const change = `Convertir las recomendaciones actuales en un paso fácil de repetir y conectado con ${action}.`;
    return { ...base, title: "Convertir las recomendaciones actuales en un paso fácil de repetir", change, where: "el momento posterior a una experiencia satisfactoria y el canal habitual", metric: "nuevos clientes que llegan recomendados y logran avanzar", description: `${change} Preparar un mensaje breve y un enlace directo, porque la evidencia declarada indica que este canal ya participa en el recorrido. La intervención sigue resolviendo: ${problem.hypothesis}` };
  }
  const declaredInstagram = profile.declaredSignals.find((signal) => signal.type === "channel" && /instagram/i.test(signal.evidence));
  if (isPrimary && declaredInstagram) {
    const change = `Hacer que el canal informado conduzca directamente a ${action}.`;
    return { ...base, title: `Hacer que el canal informado conduzca directamente a ${action}`, change, where: "Instagram", metric: profile.primaryResult, description: `${change} Ajustar el enlace y el mensaje inicial sin asumir métricas privadas. La intervención responde a: ${problem.hypothesis}` };
  }
  if (problem.pattern === "action_path") {
    const change = `Crear un único acceso directo a ${action}, con el destino y el mensaje ya preparados.`;
    return { ...base, title: `Crear un paso directo para ${action} desde ${where}`, change, description: `${change} Ubicarlo en ${where}, cerca de la información que hoy genera interés, y comprobar que funcione en celular.` };
  }
  if (problem.pattern === "trust") {
    const change = `Acercar las pruebas verificables existentes al momento en que una persona decide ${action}.`;
    return { ...base, title: `Resolver las dudas antes de ${action} con pruebas verificables`, change, description: `${change} Hacerlo en ${where} sin inventar opiniones ni ocultar señales contradictorias.` };
  }
  if (problem.pattern === "decision_information") {
    const change = `Mostrar antes de la acción la información práctica que hoy aparece incompleta o tarde.`;
    return { ...base, title: `Aclarar la información necesaria antes de ${action}`, change, description: `${change} Corregirlo en ${where} usando exactamente los datos señalados por la evidencia.` };
  }
  if (problem.pattern === "offer_clarity") {
    const change = `Explicar qué ofrece el negocio, para quién es y cuál es el siguiente paso.`;
    return { ...base, title: `Hacer que la oferta se entienda antes de pedir una decisión`, change, description: `${change} Aplicarlo en ${where} y mantener el lenguaje escrito por el negocio.` };
  }
  if (problem.pattern === "visibility") {
    const change = `Completar y conectar la información que ayuda a encontrar al negocio correcto.`;
    return { ...base, title: `Mejorar el punto de descubrimiento observado en ${where}`, change, description: `${change} Priorizar nombre, actividad, ubicación y enlace hacia ${action}; no abrir canales nuevos sin evidencia de necesidad.` };
  }
  if (problem.pattern === "demand_pattern") {
    const change = `Crear una intervención limitada a los días, horarios o momentos de menor demanda declarados.`;
    return { ...base, title: "Trabajar específicamente los momentos con menos demanda", change, description: `${change} Usar ${where}, mostrar disponibilidad real y medir solamente reservas o ventas en esos momentos.` };
  }
  if (problem.pattern === "retention") {
    const change = `Definir un próximo contacto útil después de la experiencia, relacionado con lo que la persona compró o recibió.`;
    return { ...base, title: "Crear un próximo paso para que los clientes vuelvan", change, description: `${change} Empezar en ${where}, respetando la capacidad disponible y sin enviar mensajes masivos sin contexto.` };
  }
  if (problem.pattern === "experience") {
    const change = `Corregir el momento concreto de la experiencia que aparece repetidamente como fricción.`;
    return { ...base, title: "Corregir la fricción repetida después de la acción", change, description: `${change} Empezar en ${where} y medir el cambio antes de atraer más demanda.` };
  }
  const change = `Corregir la señal concreta que interrumpe el recorrido hacia ${action}.`;
  return { ...base, title: `Resolver la fricción observada antes de ${action}`, change, description: `${change} Hacerlo en ${where} y medir ${base.metric}.` };
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
