import type { DiagnosisResult } from "../diagnostic/diagnostic-engine";
import type { NuvraScoreResult } from "../scoring/nuvra-score";
import type { RawFinding } from "../website-analyzer/types";
import type { FrameworkSelection } from "../frameworks/strategic-framework-engine";
import { createAIService, strategySchema, type StrategyOutput } from "../ai/ai-service.ts";
import { selectStrategicFrameworks, FRAMEWORKS } from "../frameworks/strategic-framework-engine.ts";
import { getPrimaryBusinessStep, hasConstrainedExecution, isRetentionObjective, getLocalMarketLabel, getBudgetFocus, isSpecificBusinessAction } from "./business-action-language.ts";
import type { BusinessProfile } from "../intelligence/business-profile";
import type { ProblemCandidate } from "../intelligence/commercial-candidates.ts";
import { StrategicKnowledgeBase, type KnowledgeMatch } from "./strategic-knowledge-base.ts";
import { ActionOpportunityEngine } from "./action-opportunity-engine.ts";
import { encodeActionDecisionDetails } from "./action-decision-details.ts";

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
    decisionEvidence?: {
      status: "sufficient" | "partial" | "insufficient";
      evaluableDimensions: number | null;
      observed: number;
      validatedProblems: number;
      supportedStrengths: number;
    };
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
      conclusionConfidence?: number;
      knowledgePatternIds?: string[];
      rejectedKnowledgePatternIds?: string[];
      knowledgeMatches?: Array<{
        patternId: string;
        score: number;
        applied: boolean;
        reasons: string[];
        rejectionReason?: string;
        intervention?: string;
      }>;
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
  if (profile) {
    try {
      return buildProfileStrategy(context, diagnosis, scoreResult, profile);
    } catch (error) {
      profile.processingIssues?.push({ stage: "strategy", errorType: error instanceof Error ? error.name : "StrategyError", message: error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180) });
      return buildDeterministicStrategy(context, diagnosis, scoreResult, Array.isArray(findings) ? findings : []);
    }
  }
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

const actionSourceLabel = (source: string) => ({ web: "el sitio web", instagram: "Instagram", search: "Google", reviews: "las reseñas", competitor: "la comparación con negocios similares", x: "X", tiktok: "TikTok", reddit: "Reddit", facebook: "Facebook", linkedin: "LinkedIn", youtube: "YouTube", external_mentions: "las menciones externas", other: "la información aportada" }[source] || "el canal observado");

export function buildProfileStrategy(context: StrategyContext, diagnosis: DiagnosisResult, scoreResult: NuvraScoreResult, profile: BusinessProfile): StrategyResult {
  const constrained = hasConstrainedExecution(context);
  const shortTerm = context.plazoDias <= 60;
  const candidates: Array<{ problem: ProblemCandidate; intervention: Intervention; knowledgeMatches: KnowledgeMatch[] }> = [];
  const rejectedInterventions: Array<{ problem: ProblemCandidate; reason: string }> = [];
  for (const problem of Array.isArray(profile.problemCandidates) ? profile.problemCandidates : []) {
    if (problem.validationStatus !== "validated") {
      if (!problem.validationStatus) profile.processingIssues?.push({ stage: "strategy", itemId: problem.id, errorType: "InvalidHypothesisValidation", message: "El candidato no contiene un estado de validación utilizable y fue descartado de forma segura." });
      rejectedInterventions.push({ problem, reason: problem.validationReason });
      continue;
    }
    try {
      const knowledgeMatches = StrategicKnowledgeBase.retrieve(profile, problem, 5);
      const applicable = knowledgeMatches.find((match) => !match.rejected);
      const intervention = interventionFor(profile, problem, context, constrained, shortTerm);
      if (applicable?.pattern.interventions[0]) {
        const reference = applicable.pattern.interventions[0];
        intervention.description = `${intervention.description} Como referencia aplicable, priorizar ${reference.change} en ${reference.where}.`;
        intervention.cost = reference.cost;
        intervention.timeframe = reference.timeframe;
        intervention.metric = reference.kpi.includes("acciones comerciales") ? profile.primaryResult : reference.kpi;
      }
      candidates.push({ problem, intervention, knowledgeMatches });
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180);
      rejectedInterventions.push({ problem, reason });
      profile.processingIssues?.push({ stage: "strategy", itemId: problem?.id, errorType: error instanceof Error ? error.name : "InterventionError", message: reason });
    }
  }
  candidates.sort((a, b) => b.problem.priorityScore - a.problem.priorityScore);
  const seen = new Set<string>();
  const selected = candidates.filter(({ problem }) => {
    const key = `${problem.journeyStage}:${problem.pattern}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
  const evaluatedCount = scoreResult.dimensions.filter((dimension) => dimension.points !== null).length;
  const evaluableDimensions = scoreResult.dimensions.length > 0 ? evaluatedCount : scoreResult.total === null ? 0 : null;
  const opportunities = ActionOpportunityEngine.generate(profile, { businessName: context.nombre, industry: context.rubro, location: context.ubicacion, budget: context.presupuesto, capacity: context.capacidad, timeframeDays: context.plazoDias, timeframeLabel: context.plazoLabel, evaluableDimensions });
  const decision = opportunities.decisionContext;
  const selectedOpportunityIds = new Set(opportunities.selected.map((item) => item.id));
  const actions: StrategyOutput["actions"] = opportunities.selected.map((opportunity, index) => ({
    title: opportunity.title,
    description: opportunity.description,
    order: index + 1,
    impact: opportunity.impact,
    difficulty: opportunity.difficulty,
    estimatedTime: opportunity.timeframe,
    dependencies: opportunity.dependencies,
    indicatorToImprove: opportunity.metric,
    rationale: encodeActionDecisionDetails({
      what: opportunity.description,
      where: opportunity.where,
      audience: opportunity.audience,
      steps: opportunity.executionSteps,
      why: opportunity.purpose,
      expectedResult: opportunity.expectedResult,
      estimatedCost: opportunity.estimatedCost,
      metric: opportunity.metric,
      causal: opportunity.causalDecision,
      experiment: opportunity.experimentDesign,
    }),
    relatedFindingIds: opportunity.evidenceIds,
    findingIds: opportunity.evidenceIds,
    evidence: opportunity.evidence,
    inference: opportunity.inference,
    dimension: opportunity.lever,
    framework: opportunity.type === "corrective" ? "CorrectiveAction" : opportunity.type === "growth" ? "GrowthAction" : "EvidenceValidation",
    confidence: opportunity.conclusionConfidence >= .72 ? "ALTA" : opportunity.conclusionConfidence >= .5 ? "MEDIA" : "BAJA",
    problem: opportunity.problem,
    unlocksContent: false,
    effort: opportunity.difficulty,
    timeframe: opportunity.timeframe,
    kpi: opportunity.metric,
    justification: `${opportunity.type === "corrective" ? "Corrige una fricción validada" : opportunity.type === "growth" ? "Aprovecha una oportunidad respaldada" : "Mide antes de ampliar la intervención"} para “${profile.goal.goalOriginalText}”.`,
  })).filter(isSpecificBusinessAction);
  const opportunityAudit: NonNullable<StrategyResult["audit"]>["candidates"] = opportunities.considered.map((opportunity) => ({
    findingId: opportunity.evidenceIds[0] || opportunity.id,
    title: opportunity.title,
    priority: opportunity.priority,
    selected: selectedOpportunityIds.has(opportunity.id),
    reason: selectedOpportunityIds.has(opportunity.id) ? `Seleccionada porque responde al objetivo, conserva evidencia y supera el control de calidad (${opportunity.quality.score}/100).` : opportunity.quality.reasons.length ? `Descartada por calidad: ${opportunity.quality.reasons.join(", ")}.` : "Descartada por menor prioridad o por duplicar la intención de otra intervención.",
    journeyStage: opportunity.lever,
    evidenceIds: opportunity.evidenceIds,
    cause: opportunity.inference,
    proposedChange: opportunity.description,
    where: opportunity.where,
    difficulty: opportunity.difficulty,
    timeframe: opportunity.timeframe,
    metric: opportunity.metric,
    expectedImpact: opportunity.purpose,
    confidence: opportunity.conclusionConfidence >= .72 ? "ALTA" : opportunity.conclusionConfidence >= .5 ? "MEDIA" : "BAJA",
    conclusionConfidence: opportunity.conclusionConfidence,
  }));

  const primary = selected[0]?.problem;
  let frameworkSelection: FrameworkSelection;
  try {
    frameworkSelection = selectStrategicFrameworks({ objetivo: context.objetivo, bottleneck: diagnosis.bottleneck.title, dimensionProblems: profile.problemCandidates.filter((problem) => problem.validationStatus === "validated").map((problem) => problem.journeyStage), score: scoreResult.total, hasWeb: profile.activeChannels.includes("web"), hasInstagram: profile.activeChannels.includes("instagram") });
  } catch (error) {
    profile.processingIssues?.push({ stage: "strategy", errorType: error instanceof Error ? error.name : "FrameworkError", message: error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180) });
    frameworkSelection = { primary: "CRO", secondary: [], rationale: "Fallback interno por indisponibilidad de la selección de marcos." };
  }
  return {
    engineType: "deterministic",
    objetivo: `${context.objetivo}${context.magnitud ? ` (+${context.magnitud}%)` : ""} en ${context.plazoLabel}`,
    situacionActual: decision.evidence.status === "insufficient"
      ? `${context.nombre} fue analizado con la información disponible, pero todavía no hay evidencia suficiente para confirmar dónde se frenan las consultas o decisiones comerciales.`
      : primary
      ? `${scoreResult.total === null ? `${context.nombre} fue analizado con la información disponible.` : `${context.nombre} tiene un Nuvra Score de ${scoreResult.total}/100.`} La evidencia más firme señala: ${primary.hypothesis}`
      : `${scoreResult.total === null ? `${context.nombre} fue analizado con la información disponible.` : `${context.nombre} tiene un Nuvra Score de ${scoreResult.total}/100.`} No hay una única falla comprobada; la decisión más útil es trabajar el objetivo con una prueba acotada y medible.`,
    distanciaObjetivo: decision.evidence.status === "insufficient"
      ? `Durante ${decision.goal.timeframeLabel}, el próximo paso es medir ${decision.decision.primaryKpi}, el origen de las consultas y cuántas avanzan. Con esos datos recién podrá decidirse qué intervención conviene priorizar.`
      : decision.evidence.status === "partial"
        ? `Durante ${decision.goal.timeframeLabel}, la información disponible permite probar como hipótesis: ${actions[0]?.title.toLowerCase() || `medir ${decision.decision.primaryKpi}`}. Las decisiones sobre inversión y canales quedan por validar.`
        : `Durante ${decision.goal.timeframeLabel}, conviene ${primary && actions[0] ? actions[0].title.toLowerCase() : decision.decision.strategicBet}. Por ahora no conviene ${decision.decision.notPriority}.`,
    principalProblema: diagnosis.bottleneck.explanation,
    prioridades: actions.slice(0, 3).map((action) => action.title),
    frameworks: [{ id: frameworkSelection.primary, title: FRAMEWORKS[frameworkSelection.primary]?.name || frameworkSelection.primary, rationale: "Selección interna basada en la hipótesis causal, el objetivo y el recorrido comercial.", useCase: FRAMEWORKS[frameworkSelection.primary]?.description || "", dimension: primary?.journeyStage, priority: 1 }],
    actions,
    audit: {
      decisionEvidence: {
        status: decision.evidence.status,
        evaluableDimensions: decision.evidence.evaluableDimensions,
        observed: decision.evidence.observed,
        validatedProblems: decision.evidence.validatedProblems,
        supportedStrengths: decision.evidence.supportedStrengths,
      },
      candidates: [...candidates.map((candidate) => ({
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
        conclusionConfidence: candidate.problem.conclusionConfidence,
        knowledgePatternIds: candidate.knowledgeMatches.filter((match) => !match.rejected).map((match) => match.pattern.id),
        rejectedKnowledgePatternIds: candidate.knowledgeMatches.filter((match) => match.rejected).map((match) => match.pattern.id),
        knowledgeMatches: candidate.knowledgeMatches.map((match) => ({
          patternId: match.pattern.id,
          score: match.score,
          applied: !match.rejected,
          reasons: match.reasons,
          rejectionReason: match.rejectionReason,
          intervention: !match.rejected ? match.pattern.interventions[0]?.change : undefined,
        })),
      })), ...opportunityAudit, ...rejectedInterventions.map(({ problem, reason }) => ({
        findingId: problem.evidenceFor?.[0] || problem.id,
        problemCandidateId: problem.id,
        title: "Intervención descartada",
        priority: problem.priorityScore,
        selected: false,
        reason: `No se pudo construir esta intervención; el resto continuó. ${reason}`,
        journeyStage: problem.journeyStage,
        evidenceIds: problem.evidenceFor,
        confidence: problem.confidence,
        conclusionConfidence: problem.conclusionConfidence,
      }))],
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
  const isPrimary = profile.problemCandidates.find((candidate) => candidate.validationStatus === "validated")?.id === problem.id;
  const referralSignal = profile.declaredSignals.find((signal) => signal.type === "referrals");
  if (isPrimary && referralSignal) {
    const change = `Convertir las recomendaciones actuales en un paso fácil de repetir y conectado con ${action}.`;
    return { ...base, title: "Convertir las recomendaciones actuales en un paso fácil de repetir", change, where: "el momento posterior a una experiencia satisfactoria y el canal habitual", metric: "nuevos clientes que llegan recomendados y logran avanzar", description: `${change} Preparar un mensaje breve y un enlace directo, porque la evidencia declarada indica que este canal ya participa en el recorrido. La intervención sigue resolviendo: ${problem.hypothesis}` };
  }
  const declaredInstagram = profile.declaredSignals.find((signal) => signal.type === "channel" && /instagram/i.test(signal.evidence));
  if (isPrimary && declaredInstagram) {
    const change = `Hacer que Instagram conduzca directamente a ${action}.`;
    return { ...base, title: `Hacer que Instagram conduzca directamente a ${action}`, change, where: "Instagram", metric: profile.primaryResult, description: `${change} Ajustar el enlace y el mensaje inicial sin asumir métricas privadas. La intervención responde a: ${problem.hypothesis}` };
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
