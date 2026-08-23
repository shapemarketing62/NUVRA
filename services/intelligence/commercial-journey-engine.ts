import type { BusinessProfile } from "./business-profile.ts";
import type { CommercialEvidence, CommercialJourneyStageId } from "./commercial-evidence.ts";

export interface CommercialJourneyStage {
  id: CommercialJourneyStageId;
  label: string;
  objective: string;
  importanceForGoal: number;
  commercialImpact: "critical" | "high" | "medium" | "low";
  positiveSignals: string[];
  frictions: string[];
  missingEvidence: string[];
  evidenceIds: string[];
}

export interface CommercialJourney {
  businessId: string;
  primaryAction: string;
  sequence: CommercialJourneyStageId[];
  stages: CommercialJourneyStage[];
  rationale: string[];
  createdAt: string;
}

const LABELS: Record<CommercialJourneyStageId, string> = { discovery: "Descubrimiento", evaluation: "Evaluación", decision: "Decisión", action: "Acción comercial", experience: "Experiencia", retention: "Recompra o continuidad" };
const BASE_IMPORTANCE: Record<CommercialJourneyStageId, number> = { discovery: .7, evaluation: .8, decision: .75, action: 1, experience: .65, retention: .55 };

function objectiveFor(stage: CommercialJourneyStageId, profile: BusinessProfile): string {
  if (stage === "discovery") return `Que las personas correctas encuentren a ${profile.businessName} en los canales que realmente usan.`;
  if (stage === "evaluation") return `Que entiendan qué ofrece el negocio y encuentren pruebas suficientes para considerarlo.`;
  if (stage === "decision") return `Que puedan resolver las dudas prácticas necesarias antes de ${profile.primaryCustomerAction}.`;
  if (stage === "action") return `Que puedan ${profile.primaryCustomerAction} con un paso claro y directo.`;
  if (stage === "experience") return `Que la atención, entrega o prestación cumpla lo prometido y no genere una nueva fricción.`;
  return `Que exista una razón y un próximo paso para ${profile.primaryCustomerAction} nuevamente o continuar la relación.`;
}

function importance(stage: CommercialJourneyStageId, profile: BusinessProfile): number {
  let value = BASE_IMPORTANCE[stage];
  const goal = String(profile.goal?.text || "").toLowerCase();
  if (/volv|vuelv|recompra|renov|recurren|fideliza|clientes actuales|socios actuales/.test(goal)) {
    if (stage === "retention") value = 1;
    if (stage === "experience") value = .95;
    if (stage === "discovery") value = .25;
    if (stage === "action") value = .4;
    if (stage === "decision") value = .45;
    if (stage === "evaluation") value = .5;
  } else if (/dar a conocer|marca|reconoc|visibilidad/.test(goal) && stage === "discovery") value = 1;
  if (stage === "decision" && (profile.commercialModel === "commerce" || profile.localDependency === "high")) value = .9;
  if (stage === "evaluation" && profile.commercialModel === "professional") value = 1;
  if (stage === "retention" && ["frequent", "periodic", "membership"].includes(profile.recurrence)) value = Math.max(value, .8);
  return Math.round(value * 100) / 100;
}

function missingEvidence(stage: CommercialJourneyStageId, evidence: CommercialEvidence[], profile: BusinessProfile): string[] {
  if (evidence.length) return [];
  if (stage === "discovery") return ["No hay evidencia suficiente sobre cómo encuentran hoy el negocio."];
  if (stage === "evaluation") return ["No hay evidencia suficiente sobre qué información o pruebas usan las personas para evaluarlo."];
  if (stage === "decision") return [profile.localDependency === "high" ? "Falta evidencia verificable sobre ubicación, horarios, precio o disponibilidad." : "Falta evidencia verificable sobre las condiciones que ayudan a decidir."];
  if (stage === "action") return [`No hay evidencia suficiente para confirmar si hoy es fácil ${profile.primaryCustomerAction}.`];
  if (stage === "experience") return ["No hay evidencia suficiente sobre lo que ocurre después de la consulta, reserva o compra."];
  return ["No hay evidencia suficiente sobre seguimiento, recompra o continuidad."];
}

export class CommercialJourneyEngine {
  static build(profile: BusinessProfile, evidence: CommercialEvidence[]): CommercialJourney {
    const retentionGoal = /volv|vuelv|recompra|renov|recurren|fideliza|clientes actuales|socios actuales/i.test(String(profile.goal?.text || ""));
    const sequence: CommercialJourneyStageId[] = ["discovery", "evaluation", "decision", "action", "experience"];
    if (retentionGoal || profile.recurrence !== "occasional") sequence.push("retention");
    const stages = sequence.map((id) => {
      const stageEvidence = (Array.isArray(evidence) ? evidence : []).filter((item) => item?.journeyStage === id && typeof item.text === "string" && item.text.trim());
      const stageImportance = importance(id, profile);
      return {
        id,
        label: LABELS[id],
        objective: objectiveFor(id, profile),
        importanceForGoal: stageImportance,
        commercialImpact: stageImportance >= .95 ? "critical" : stageImportance >= .8 ? "high" : stageImportance >= .55 ? "medium" : "low",
        positiveSignals: stageEvidence.filter((item) => item.polarity === "positive").map((item) => item.id),
        frictions: stageEvidence.filter((item) => item.polarity === "negative").map((item) => item.id),
        missingEvidence: missingEvidence(id, stageEvidence, profile),
        evidenceIds: stageEvidence.map((item) => item.id),
      } satisfies CommercialJourneyStage;
    });
    return {
      businessId: profile.businessId,
      primaryAction: profile.primaryCustomerAction,
      sequence,
      stages,
      rationale: [
        `El recorrido termina en “${profile.primaryCustomerAction}”, inferido a partir del modelo comercial y el objetivo.`,
        `La importancia de cada etapa cambia según “${profile.goal.text}”, la recurrencia ${profile.recurrence} y la modalidad ${profile.operatingMode}.`,
      ],
      createdAt: new Date().toISOString(),
    };
  }

  static empty(profile: Pick<BusinessProfile, "businessId" | "primaryCustomerAction">): CommercialJourney {
    return {
      businessId: String(profile.businessId || "unknown"),
      primaryAction: String(profile.primaryCustomerAction || "avanzar con el negocio"),
      sequence: [],
      stages: [],
      rationale: ["No fue posible construir el recorrido completo; las demás etapas continuaron con la evidencia válida."],
      createdAt: new Date().toISOString(),
    };
  }
}
