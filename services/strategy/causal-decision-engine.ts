import type { BusinessProfile } from "../intelligence/business-profile.ts";
import type { ProblemCandidate } from "../intelligence/commercial-candidates.ts";
import type { MarketingDecisionContext } from "./marketing-decision-context.ts";

export interface CausalDecision {
  observation: string;
  hypothesis: string;
  evidenceFor: string[];
  evidenceAgainst: string[];
  unknowns: string[];
  counterfactual: string;
  decision: string;
  whyThisDecision: string[];
  alternativesNotPrioritized: string[];
  confidenceLabel: "Evidencia fuerte" | "Evidencia parcial" | "Por validar";
}

export interface ExperimentDesign {
  hypothesis: string;
  intervention: string;
  audience: string;
  duration: string;
  baselineMetric: string;
  targetMetric: string;
  successCriteria: string;
  ifWorks: string;
  ifNot: string;
}

const clean = (value: string) => value.replace(/[.!?]+$/, "").trim();

export function buildCausalDecision(profile: BusinessProfile, context: MarketingDecisionContext, problem?: ProblemCandidate): CausalDecision {
  const evidenceFor = problem ? evidenceText(profile, problem.evidenceFor) : context.declaredContext.slice(0, 2);
  const evidenceAgainst = problem ? evidenceText(profile, problem.evidenceAgainst) : [];
  const demand = context.demandPattern ? clean(context.demandPattern) : null;
  const observation = problem
    ? evidenceFor[0] || problem.hypothesis
    : demand
      ? `El negocio concentra actividad en algunos momentos y mantiene capacidad disponible en otros: ${demand}.`
      : `El objetivo es ${context.goal.original}, pero todavía faltan mediciones comparables del recorrido hasta ${profile.primaryCustomerAction}.`;
  const hypothesis = problem
    ? problem.hypothesis
    : demand
      ? `El freno puede no ser la falta general de conocimiento del negocio, sino la ausencia de una razón específica para que las personas elijan esos momentos o vuelvan con mayor frecuencia.`
      : `La mejor explicación disponible es que todavía no está validado qué paso del recorrido limita ${context.decision.primaryKpi}.`;
  const unknowns = problem
    ? unknownsForProblem(problem, context)
    : demand
      ? ["Frecuencia actual de repetición.", "Origen exacto de las visitas o consultas.", "Respuesta de los clientes a una propuesta acotada."]
      : ["Valor inicial del KPI principal.", "Punto exacto donde las personas dejan de avanzar.", "Diferencia entre canales activos."];
  const whyThisDecision = problem
    ? [
        `La señal aparece en ${stageLabel(problem.journeyStage)}, antes del resultado buscado.`,
        `Tiene impacto directo sobre “${context.goal.original}”.`,
        `Puede probarse con la capacidad y los canales disponibles.`,
      ]
    : demand
      ? ["Ya existe demanda, aunque está concentrada.", `El negocio dispone de ${context.channels.active.join(", ") || "canales activos"}.`, "Una prueba acotada permite aprender antes de aumentar inversión."]
      : ["No existe una causa única suficientemente comprobada.", "Medir una intervención pequeña reduce el riesgo de actuar sobre una suposición.", "La decisión respeta el presupuesto y la capacidad disponibles."];
  const alternativesNotPrioritized = alternatives(context, problem);
  return {
    observation,
    hypothesis,
    evidenceFor,
    evidenceAgainst,
    unknowns,
    counterfactual: problem
      ? `Si esta hipótesis fuera falsa, el resultado debería mantenerse aun después de corregir la señal observada.`
      : `Si la propuesta no modifica ${context.decision.primaryKpi}, la concentración de demanda probablemente tenga otra causa y habrá que revisar horario, visibilidad o hábito.`,
    decision: problem ? `Intervenir primero sobre ${problem.hypothesis.toLowerCase()}` : context.decision.strategicBet,
    whyThisDecision,
    alternativesNotPrioritized,
    confidenceLabel: problem?.evidenceSufficiency.status === "strong" ? "Evidencia fuerte" : problem?.validationStatus === "validated" || evidenceFor.length >= 2 ? "Evidencia parcial" : "Por validar",
  };
}

export function buildExperimentDesign(context: MarketingDecisionContext, action: { title: string; description: string; audience: string; metric: string; expectedResult: string }): ExperimentDesign {
  const duration = context.goal.timeframeDays <= 45 ? "3 semanas" : "4 semanas";
  return {
    hypothesis: `La prueba busca comprobar si ${action.title.toLowerCase()} mejora ${action.metric} al actuar sobre la prioridad identificada.`,
    intervention: action.description,
    audience: action.audience,
    duration,
    baselineMetric: `Registrar ${action.metric} antes de empezar y conservar la misma definición durante la prueba.`,
    targetMetric: action.metric,
    successCriteria: `Considerar útil la prueba si se observa una mejora sostenida en ${action.metric} frente a la línea base, sin deteriorar el resultado comercial principal.`,
    ifWorks: `Mantener el mecanismo, documentar qué parte produjo el cambio y ampliarlo de forma gradual.`,
    ifNot: `Detener o ajustar la intervención y revisar la hipótesis antes de sumar presupuesto o nuevos canales.`,
  };
}

function evidenceText(profile: BusinessProfile, ids: string[] | null | undefined) {
  return (Array.isArray(ids) ? ids : []).map((id) => profile.commercialEvidence.find((item) => item.id === id)?.text).filter((item): item is string => Boolean(item));
}

function unknownsForProblem(problem: ProblemCandidate, context: MarketingDecisionContext) {
  const values = [`Valor inicial de ${context.decision.primaryKpi}.`];
  if (problem.supportingSourceCount < 2) values.push("Si la misma señal aparece en otra fuente independiente.");
  if (!Array.isArray(problem.evidenceAgainst) || !problem.evidenceAgainst.length) values.push("Qué evidencia mostraría que esta explicación no es correcta.");
  return values;
}

function alternatives(context: MarketingDecisionContext, problem?: ProblemCandidate) {
  const values: string[] = [];
  if (context.evidence.isPartial || !context.resources.paidTestAllowed) values.push(`No priorizar pauta paga todavía: primero hace falta validar ${context.decision.primaryKpi}.`);
  if (context.channels.active.length) values.push("No abrir nuevos canales antes de aprovechar y medir los que ya están activos.");
  if (problem?.journeyStage === "action") values.push("No ampliar alcance mientras el paso comercial observado siga incompleto.");
  return Array.from(new Set(values)).slice(0, 2);
}

function stageLabel(stage: string) {
  return ({ discovery: "descubrimiento", evaluation: "evaluación", decision: "decisión", action: "acción comercial", experience: "experiencia", retention: "continuidad" } as Record<string, string>)[stage] || "recorrido comercial";
}
