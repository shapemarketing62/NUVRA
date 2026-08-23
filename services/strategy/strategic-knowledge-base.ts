import type { BusinessProfile } from "../intelligence/business-profile.ts";
import type { ProblemCandidate } from "../intelligence/commercial-candidates.ts";

export interface StrategicPattern {
  id: string; archetype: string; commercialModel: string; situation: string; objectives: string[]; journeyStage: string;
  problemPattern: string; requiredSignals: string[]; contradictorySignals: string[]; causalExplanation: string;
  interventions: Array<{ change: string; where: string; cost: "bajo" | "medio" | "alto"; effort: "bajo" | "medio" | "alto"; timeframe: string; kpi: string }>;
  appliesWhen: string[]; doesNotApplyWhen: string[]; risks: string[]; dependencies: string[]; vectorText: string;
}
export interface KnowledgeMatch { pattern: StrategicPattern; score: number; reasons: string[]; rejected: boolean; rejectionReason?: string }

const ARCHETYPES = [
  ["local_visits", "reservations", /caf[eé]|restaurante|gastronom|retail|tienda f[ií]sica/, "visitas y reservas"],
  ["appointments", "appointments", /cl[ií]nica|est[eé]tica|odont|salud|peluquer|barber/, "turnos"],
  ["fitness_membership", "membership", /gimnas|fitness|club|membres/, "pruebas y membresías"],
  ["professional_trust", "professional", /profesional|abog|contador|estudio|consultor/, "consultas y reuniones"],
  ["b2b_service", "professional", /b2b|empresa|industrial|distribuid/, "oportunidades comerciales"],
  ["ecommerce", "commerce", /ecommerce|tienda online|venta de productos/, "compras"],
  ["retail", "commerce", /retail|comercio|tienda/, "ventas y visitas"],
  ["education", "membership", /educa|curso|academ|colegio|instituto/, "inscripciones"],
  ["real_estate", "professional", /inmobili|propiedad/, "consultas calificadas"],
  ["hospitality", "reservations", /hotel|turismo|alojamiento|hostel/, "reservas"],
  ["subscription", "membership", /suscrip|membres|saas/, "altas y renovaciones"],
  ["delivery_service", "commerce", /delivery|env[ií]o|log[ií]stica/, "pedidos completados"],
  ["local_service", "local_service", /cerrajer|reparaci[oó]n|servicio local/, "llamadas y visitas"],
  ["creative_service", "professional", /diseño|arquitect|agencia|imprenta/, "presupuestos"],
  ["general_small_business", "general", /.*/, "próximos pasos comerciales"],
] as const;

const SITUATIONS = [
  { pattern: "visibility", stage: "discovery", situation: "baja presencia verificable", required: ["aparición local o sectorial limitada"], contradiction: ["presencia consistente comprobada"], cause: "personas adecuadas no encuentran el negocio cuando aparece la necesidad", change: "completar y alinear el punto público principal", where: "Google, directorios o canal de descubrimiento validado", kpi: "consultas originadas en el canal", risk: "abrir canales que el equipo no puede mantener" },
  { pattern: "trust", stage: "evaluation", situation: "pruebas de confianza insuficientes", required: ["dudas o falta de pruebas verificables"], contradiction: ["reseñas recientes y pruebas suficientes"], cause: "el interés no encuentra evidencia suficiente para reducir el riesgo percibido", change: "ubicar pruebas reales junto a la decisión", where: "perfil, ficha o página donde se evalúa la oferta", kpi: "personas que avanzan después de ver la prueba", risk: "seleccionar testimonios sin contexto" },
  { pattern: "decision_information", stage: "decision", situation: "información práctica incompleta", required: ["preguntas repetidas sobre precio, horario, entrega o condiciones"], contradiction: ["información completa y consistente"], cause: "la persona posterga la decisión porque aún necesita resolver una duda concreta", change: "responder la duda repetida antes del contacto", where: "el punto inmediatamente anterior a la acción", kpi: "consultas que llegan con intención clara", risk: "agregar información que no ayuda a decidir" },
  { pattern: "action_path", stage: "action", situation: "interés que no llega a la acción", required: ["bloqueo o demora corroborada"], contradiction: ["recorrido comprobado y respuesta oportuna"], cause: "la intención se pierde entre el interés y el próximo paso comercial", change: "reducir el recorrido a un paso claro y verificable", where: "canal principal de acción", kpi: "acciones comerciales completadas", risk: "atraer más demanda que la capacidad disponible" },
  { pattern: "experience", stage: "experience", situation: "fricción repetida en la experiencia", required: ["quejas independientes y consistentes"], contradiction: ["mejora reciente comprobada"], cause: "una falla operativa repetida reduce satisfacción, recomendación y continuidad", change: "corregir la causa operativa antes de amplificar demanda", where: "momento exacto mencionado por clientes", kpi: "frecuencia del tema en opiniones recientes", risk: "tratar el síntoma sin cambiar el proceso" },
  { pattern: "retention", stage: "retention", situation: "continuidad o recompra débil", required: ["ausencia de próximo paso o quejas postventa"], contradiction: ["seguimiento útil y continuidad comprobada"], cause: "una buena primera experiencia no se convierte automáticamente en una relación recurrente", change: "crear un siguiente paso basado en la experiencia anterior", where: "postventa o seguimiento habitual", kpi: "clientes que vuelven o renuevan", risk: "enviar mensajes sin relevancia" },
] as const;

export const STRATEGIC_PATTERNS: StrategicPattern[] = ARCHETYPES.flatMap(([archetype, commercialModel, , result]) => SITUATIONS.map((item) => ({
  id: `${archetype}:${item.pattern}`, archetype, commercialModel, situation: item.situation,
  objectives: [result], journeyStage: item.stage, problemPattern: item.pattern,
  requiredSignals: [...item.required], contradictorySignals: [...item.contradiction],
  causalExplanation: `${item.cause}; en este modelo el resultado esperado se expresa como ${result}.`,
  interventions: [{ change: `${item.change} para facilitar ${result}`, where: item.where, cost: "bajo", effort: item.pattern === "experience" ? "medio" : "bajo", timeframe: item.pattern === "experience" ? "30–60 días" : "14–30 días", kpi: item.kpi }],
  appliesWhen: ["el problema fue validado con evidencia real", `el modelo comercial se aproxima a ${archetype}`],
  doesNotApplyWhen: ["la hipótesis fue descartada", ...item.contradiction], risks: [item.risk], dependencies: item.pattern === "action_path" ? ["capacidad para responder la demanda"] : [],
  vectorText: `${archetype} ${commercialModel} ${item.stage} ${item.pattern} ${item.situation} ${item.cause} ${item.change} ${result}`,
})));

export class StrategicKnowledgeBase {
  static readonly patterns = STRATEGIC_PATTERNS;
  static retrieve(profile: BusinessProfile, problem: ProblemCandidate, limit = 3): KnowledgeMatch[] {
    if (problem.validationStatus !== "validated") return [];
    if (problem.reputationEvidenceConfidence !== undefined && problem.reputationEvidenceConfidence < .55) return [];
    const archetype = inferArchetype(profile);
    return STRATEGIC_PATTERNS.map((pattern) => {
      let score = 0; const reasons: string[] = [];
      if (pattern.problemPattern === problem.pattern) { score += .42; reasons.push("mismo patrón causal"); }
      if (pattern.journeyStage === problem.journeyStage) { score += .2; reasons.push("misma etapa comercial"); }
      if (pattern.commercialModel === profile.commercialModel) { score += .18; reasons.push("mismo modelo comercial"); }
      if (pattern.archetype === archetype) { score += .15; reasons.push("contexto de negocio cercano"); }
      if (profile.resources.monthlyBudget != null && profile.resources.monthlyBudget < 200 && pattern.interventions[0]?.cost === "bajo") { score += .05; reasons.push("compatible con presupuesto acotado"); }
      const causalMismatch = pattern.problemPattern !== problem.pattern || pattern.journeyStage !== problem.journeyStage;
      const contextMismatch = pattern.archetype !== archetype && pattern.commercialModel !== profile.commercialModel && pattern.archetype !== "general_small_business";
      const rejected = causalMismatch || contextMismatch;
      const rejectionReason = causalMismatch
        ? "No coincide con el problema validado y su etapa."
        : contextMismatch
          ? "El patrón causal coincide, pero pertenece a un modelo comercial que no representa este negocio."
          : undefined;
      return { pattern, score: Math.round(score * 100) / 100, reasons, rejected, rejectionReason };
    }).sort((a, b) => b.score - a.score).slice(0, Math.max(limit, 1));
  }
}

function inferArchetype(profile: BusinessProfile) { const text = `${profile.originalIndustry} ${profile.inferredCategory}`; return ARCHETYPES.find(([, model, rule]) => (model === profile.commercialModel || model === "general") && rule.test(text))?.[0] || "general_small_business"; }
