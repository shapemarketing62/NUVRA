import type { BusinessProfile } from "../intelligence/business-profile.ts";
import type { ProblemCandidate } from "../intelligence/commercial-candidates.ts";

export type ActionOpportunityType = "corrective" | "growth" | "validation";
export type ActionLever = "commercial_path" | "local_discovery" | "reputation" | "offer" | "content" | "retention" | "channel_mix" | "paid_test" | "measurement";

export interface ActionOpportunityContext {
  businessName: string;
  industry: string;
  location?: string | null;
  budget?: number | null;
  capacity?: string | null;
  timeframeDays: number;
}

export interface ActionOpportunity {
  id: string;
  type: ActionOpportunityType;
  lever: ActionLever;
  intentKey: string;
  title: string;
  description: string;
  where: string;
  purpose: string;
  metric: string;
  evidenceIds: string[];
  evidence: string;
  inference: string;
  problem: string;
  priority: number;
  impact: "alto" | "medio" | "bajo";
  difficulty: "alta" | "media" | "baja";
  timeframe: string;
  dependencies: string[];
  conclusionConfidence: number;
}

export class ActionOpportunityEngine {
  static generate(profile: BusinessProfile, context: ActionOpportunityContext): { selected: ActionOpportunity[]; considered: ActionOpportunity[] } {
    const considered = [
      ...correctiveActions(profile, context),
      ...growthActions(profile, context),
    ].filter((item) => item.evidenceIds.length > 0);
    const unique = deduplicateByIntent(considered).sort((a, b) => b.priority - a.priority);
    const selected: ActionOpportunity[] = [];
    const usedLevers = new Set<ActionLever>();
    const correction = unique.find((item) => item.type === "corrective");
    if (correction) { selected.push(correction); usedLevers.add(correction.lever); }
    for (const candidate of unique) {
      if (selected.length >= 3) break;
      if (selected.includes(candidate) || usedLevers.has(candidate.lever)) continue;
      selected.push(candidate); usedLevers.add(candidate.lever);
    }
    for (const candidate of unique) {
      if (selected.length >= 3) break;
      if (!selected.includes(candidate)) selected.push(candidate);
    }
    return { selected: selected.map((item, index) => ({ ...item, priority: item.priority - index * .01 })), considered: unique };
  }
}

function correctiveActions(profile: BusinessProfile, context: ActionOpportunityContext): ActionOpportunity[] {
  return profile.problemCandidates.filter((problem) => problem.validationStatus === "validated").map((problem) => correctiveFor(problem, profile, context));
}

function correctiveFor(problem: ProblemCandidate, profile: BusinessProfile, context: ActionOpportunityContext): ActionOpportunity {
  const evidence = evidenceByIds(profile, problem.evidenceFor);
  const source = sourceLabel(profile, problem.evidenceFor);
  const action = profile.primaryCustomerAction;
  const common = baseOpportunity(problem, context, evidence, source);
  if (problem.pattern === "action_path") return { ...common, lever: "commercial_path", intentKey: "remove-action-friction", title: `Resolver el paso que hoy frena ${action}`, description: `Corregir en ${source} el acceso señalado por la evidencia y probarlo desde un celular hasta el último paso reversible. Dejar una sola ruta, con destino y mensaje preparados.`, purpose: `Evitar que una persona interesada abandone antes de ${action}.`, metric: profile.primaryResult };
  if (problem.pattern === "decision_information") return { ...common, lever: "offer", intentKey: "complete-decision-information", title: `Mostrar la información que falta antes de ${action}`, description: `Incorporar en ${source} los datos concretos que hoy aparecen incompletos o tarde, cerca del punto donde una persona decide.`, purpose: "Resolver dudas reales antes de pedir una decisión.", metric: `personas que avanzan a ${action}` };
  if (problem.pattern === "trust") return { ...common, lever: "reputation", intentKey: "resolve-trust-gap", title: `Responder con pruebas a la duda que aparece antes de ${action}`, description: `Ubicar en ${source} la prueba verificable relacionada con la duda observada —sin resumirla de forma más favorable— y conectarla con el siguiente paso.`, purpose: "Reducir una objeción respaldada por evidencia.", metric: `personas que consultan después de ver la prueba` };
  if (problem.pattern === "visibility") return { ...common, lever: "local_discovery", intentKey: "fix-discovery", title: `Corregir cómo aparece ${context.businessName} al buscarlo`, description: `Actualizar en ${source} nombre, actividad, ${context.location ? `zona (${context.location})` : "ubicación"} y enlace de contacto usando los datos señalados por la evidencia.`, purpose: "Facilitar que las personas correctas encuentren y reconozcan el negocio.", metric: "personas que llegan desde búsquedas y avanzan al contacto" };
  if (problem.pattern === "retention" || problem.journeyStage === "retention") return { ...common, lever: "retention", intentKey: "create-return-step", title: "Crear un próximo contacto relacionado con lo que recibió cada cliente", description: `Definir desde ${source} cuándo corresponde volver a contactar y con qué próximo paso, respetando la frecuencia del servicio y la capacidad del equipo.`, purpose: `Acercar el negocio al objetivo “${profile.goal.goalOriginalText}”.`, metric: profile.primaryResult };
  return { ...common, lever: "offer", intentKey: `${problem.pattern}:${problem.journeyStage}`, title: `Corregir la fricción comprobada antes de ${action}`, description: `Cambiar en ${source} la señal concreta indicada por la evidencia y comprobar el recorrido nuevamente antes de atraer más demanda.`, purpose: `Destrabar el avance hacia ${action}.`, metric: profile.primaryResult };
}

function growthActions(profile: BusinessProfile, context: ActionOpportunityContext): ActionOpportunity[] {
  const result: ActionOpportunity[] = [];
  const goalEvidence = evidenceMatching(profile, (item) => item.id === "declared:goal");
  const identityEvidence = evidenceMatching(profile, (item) => ["declared:industry", "declared:description", "declared:offerings", "declared:goal"].includes(item.id));
  const actionStrength = profile.strengthCandidates.find((item) => item.pattern === "action_path" && item.evidenceSufficiency.status !== "insufficient");
  const reviewEvidence = profile.commercialEvidence.filter((item) => item.source === "reviews" && item.polarity === "positive");
  const socialEvidence = profile.commercialEvidence.filter((item) => ["instagram", "facebook", "linkedin"].includes(item.source) && item.polarity !== "negative");
  const searchEvidence = profile.commercialEvidence.filter((item) => ["search", "external_mentions"].includes(item.source) && item.polarity !== "negative");
  const referralSignal = profile.declaredSignals.find((item) => item.type === "referrals");
  const channelSignal = profile.declaredSignals.find((item) => item.type === "channel");
  const demandSignal = profile.declaredSignals.find((item) => item.type === "demand_pattern");
  const timeframe = timing(context.timeframeDays);

  if ((profile.goal.interpretation.goalScope.includes("low_demand_periods") || demandSignal) && (goalEvidence.length || demandSignal)) {
    const days = formatDays(profile.goal.interpretation.targetDays) || extractDayRange(demandSignal?.evidence || "") || "los momentos con menos demanda";
    const evidence = [...goalEvidence, ...evidenceMatching(profile, (item) => item.id === "declared:additional")];
    result.push(growth("low-demand", "local_discovery", "activate-low-demand", `Concentrar una propuesta concreta en ${days}`, `Durante ${timeframe.campaign}, comunicar disponibilidad real para ${days} desde ${channelLabel(profile.primaryChannel)} y llevar cada mensaje directamente a ${profile.primaryCustomerAction}. No extenderla a los días que ya funcionan.`, `Ocupar capacidad disponible en ${days}.`, `reservas o ventas en ${days}`, evidence, 91, context, profile));
  }

  if (profile.goal.interpretation.goalScope.includes("channel_dependency") && goalEvidence.length) {
    const alternative = profile.activeChannels.includes("search") ? "Google y la presencia propia" : profile.activeChannels.includes("web") ? "el sitio web y búsquedas" : "un canal propio de contacto";
    result.push(growth("channel-mix", "channel_mix", "reduce-channel-dependency", `Crear una segunda entrada para no depender tanto de ${profile.goal.interpretation.channelToReduce || "un solo canal"}`, `Elegir una oferta concreta y construir durante ${timeframe.build} una entrada desde ${alternative} hacia ${profile.primaryCustomerAction}. Mantener una sola medición para saber si aporta demanda adicional.`, "Diversificar el origen de clientes sin multiplicar canales.", `consultas o ventas que llegan fuera de ${profile.goal.interpretation.channelToReduce || "el canal principal"}`, goalEvidence, 88, context, profile));
  }

  if (referralSignal) {
    const evidence = evidenceMatching(profile, (item) => item.id === "declared:additional" || item.text === referralSignal.evidence);
    result.push(growth("referrals", "channel_mix", "repeat-referrals", "Convertir las recomendaciones actuales en una forma concreta de generar nuevas consultas", `Preparar un mensaje breve y un enlace directo para compartir después de una experiencia satisfactoria. Registrar quién recomendó y si la nueva persona llegó a ${profile.primaryCustomerAction}.`, "Hacer repetible un origen de clientes que el negocio declaró como relevante.", "nuevos clientes que llegan por recomendaciones", evidence, 90, context, profile));
  } else if (channelSignal) {
    const evidence = evidenceMatching(profile, (item) => item.id === "declared:additional" || item.text === channelSignal.evidence);
    result.push(growth("declared-channel", "channel_mix", "activate-declared-channel", `Convertir el canal informado en una entrada específica para ${profile.primaryCustomerAction}`, `Elegir una sola propuesta relacionada con “${short(profile.goal.goalOriginalText, 80)}” y conectar desde ${channelSignal.evidence.match(/Instagram|WhatsApp|Google|Maps|tel[eé]fono|email/i)?.[0] || "el canal informado"} el mensaje, la prueba y el próximo paso.`, "Aprovechar el origen de clientes declarado sin tratarlo como una métrica verificada.", profile.primaryResult, evidence, 83, context, profile));
  }

  if (reviewEvidence.length) {
    const proof = reviewEvidence[0].text;
    result.push(growth("reputation", "reputation", "activate-reputation", reputationTitle(profile, context), `Seleccionar el tema favorable repetido en las reseñas y mostrar citas verificables en ${channelLabel(profile.primaryChannel)}, cerca del paso para ${profile.primaryCustomerAction}. La evidencia de partida es: “${short(proof, 120)}”.`, "Usar reputación real para ayudar a decidir, no solamente acumular reseñas.", `personas que avanzan a ${profile.primaryCustomerAction} después de ver esa prueba`, reviewEvidence, 84, context, profile));
  }

  if (profile.commercialModel === "professional" && identityEvidence.length) {
    const segment = profile.goal.interpretation.desiredCustomer || profile.customerType || "el tipo de cliente buscado";
    result.push(growth("professional-offer", "offer", "problem-based-professional-entry", `Explicar tres situaciones concretas en las que conviene consultar a ${context.businessName}`, `Crear en ${channelLabel(profile.primaryChannel)} tres entradas breves basadas en problemas reales que resuelve ${context.businessName} para ${segment}. Cada entrada debe terminar en una solicitud de reunión o consulta vinculada con ese caso.`, `Transformar especialización en motivos reconocibles para consultar por “${profile.goal.goalOriginalText}”.`, "consultas recibidas por cada situación explicada", identityEvidence, 82, context, profile));
  }

  if (profile.commercialModel === "commerce" && identityEvidence.length) {
    const offering = offeringLabel(profile);
    result.push(growth("commerce-offer", "offer", "product-demand-entry", `Crear una entrada de compra para la parte de ${offering} más relacionada con el objetivo`, `Elegir un grupo concreto de productos respaldado por la información observada y reunir en ${channelLabel(profile.primaryChannel)} beneficio, condiciones y acceso de compra. Evitar presentar todo el catálogo como una única propuesta.`, `Convertir claridad de producto en una oportunidad de venta específica para “${profile.goal.goalOriginalText}”.`, "compras iniciadas desde esa entrada", identityEvidence, 82, context, profile));
  }

  if (searchEvidence.length && profile.localDependency !== "high" && identityEvidence.length) {
    const offering = offeringLabel(profile);
    result.push(growth("search-demand", "local_discovery", "search-offer-demand", `Conectar las búsquedas sobre ${short(offering, 55)} con una propuesta específica`, `Usar la oferta que ya aparece en búsquedas para crear una entrada propia con información suficiente y un paso directo a ${profile.primaryCustomerAction}. Medir solamente visitas y acciones originadas en esa búsqueda.`, "Aprovechar demanda existente sin abrir una plataforma nueva.", `${profile.primaryResult} provenientes de búsquedas`, [...searchEvidence, ...identityEvidence], 76, context, profile));
  }

  if (socialEvidence.length) {
    const offering = offeringLabel(profile);
    result.push(growth("social-to-action", "content", "content-to-working-action", `Llevar durante cuatro semanas contenido de ${offering} al próximo paso comercial`, `Elegir trabajos, productos o servicios respaldados por lo observado y publicar una serie breve en ${channelLabel(socialEvidence[0].source)}. Cada pieza debe conducir directamente a ${profile.primaryCustomerAction}${actionStrength ? ", sin rediseñar el recorrido validado" : " y registrar si ese paso se completa"}.`, actionStrength ? "Conseguir que más personas lleguen hasta un paso comercial que ya funciona." : "Comprobar qué contenido produce avances reales hacia el objetivo.", `${profile.primaryResult} iniciados desde ${channelLabel(socialEvidence[0].source)}`, [...socialEvidence, ...(actionStrength ? evidenceByCommercialIds(profile, actionStrength.evidence) : [])], 80, context, profile));
  }

  if (profile.localDependency === "high" && (searchEvidence.length || identityEvidence.length) && actionStrength) {
    const location = profile.location || "la zona donde opera el negocio";
    result.push(growth("local", "local_discovery", "local-demand-to-action", `Hacer que más personas de ${location} lleguen al paso de ${profile.primaryCustomerAction}`, `Durante ${timeframe.campaign}, reforzar en Google, Maps o el canal local observado la actividad concreta, la ubicación y una razón verificable para elegir el negocio. Enlazar desde allí al recorrido que ya fue validado.`, `Aumentar demanda local sin cambiar una reserva o contacto que ya funciona.`, `${profile.primaryResult} provenientes de ${location}`, [...searchEvidence, ...evidenceByCommercialIds(profile, actionStrength.evidence), ...goalEvidence], 79, context, profile));
  }

  if (["frequent", "periodic", "membership"].includes(profile.recurrence) && identityEvidence.length && (actionStrength || profile.goal.interpretation.goalType === "retention")) {
    const frequency = profile.goal.interpretation.desiredFrequencyMonths ? `cada ${profile.goal.interpretation.desiredFrequencyMonths} meses` : "en el momento adecuado para el servicio";
    result.push(growth("return", "retention", "next-booking", `Proponer el próximo paso antes de que termine cada atención o compra`, `Al finalizar, ofrecer una nueva fecha, reposición o recordatorio ${frequency}, usando el canal de contacto ya disponible y sin enviar mensajes masivos.`, "Aumentar la repetición con una intervención propia del objetivo de continuidad.", "clientes que dejan acordado o aceptan el próximo contacto", [...(actionStrength ? evidenceByCommercialIds(profile, actionStrength.evidence) : []), ...identityEvidence], profile.goal.interpretation.goalType === "retention" ? 92 : 77, context, profile));
  }

  if (context.budget && context.budget >= 100 && context.budget <= 700 && actionStrength && (searchEvidence.length || socialEvidence.length)) {
    const amount = context.budget <= 300 ? "USD 100–300" : "USD 300–700";
    const channel = searchEvidence.length ? "búsqueda local" : channelLabel(socialEvidence[0]?.source);
    result.push(growth("paid", "paid_test", "controlled-paid-test", `Probar una campaña pequeña para una sola oferta y una sola audiencia`, `Destinar como máximo el rango disponible (${amount} mensuales) a una prueba de ${timeframe.test} en ${channel}. Enviar todo al recorrido ya validado y detenerla si no produce ${profile.primaryResult}.`, "Aumentar demanda sin repartir el presupuesto ni pagar por un recorrido todavía incierto.", `costo por ${profile.primaryResult}`, [...searchEvidence, ...socialEvidence, ...evidenceByCommercialIds(profile, actionStrength.evidence)], 66, context, profile));
  }

  const measurementEvidence = [...goalEvidence, ...identityEvidence].slice(0, 4);
  if (measurementEvidence.length) result.push(growth("measurement", "measurement", "measure-goal-progress", `Registrar semanalmente el avance hacia “${short(profile.goal.goalOriginalText, 70)}”`, `Usar una planilla simple durante ${timeframe.measurement} y anotar solamente ${metricForGoal(profile)} junto con su canal de origen. Revisar el resultado antes de ampliar tiempo o presupuesto.`, "Saber qué intervención acerca realmente al objetivo libre escrito por el negocio.", metricForGoal(profile), measurementEvidence, 45, context, profile, "validation"));
  return result;
}

function baseOpportunity(problem: ProblemCandidate, context: ActionOpportunityContext, evidence: ReturnType<typeof evidenceByIds>, where: string): ActionOpportunity {
  return { id: `corrective:${problem.id}`, type: "corrective", lever: "commercial_path", intentKey: problem.pattern, title: problem.hypothesis, description: problem.causalExplanation, where, purpose: problem.causalExplanation, metric: "avance hacia el objetivo", evidenceIds: evidence.map((item) => item.id), evidence: evidence.map((item) => item.text).join(" · "), inference: problem.causalExplanation, problem: problem.hypothesis, priority: 100 + problem.priorityScore, impact: problem.priorityScore >= 55 ? "alto" : "medio", difficulty: constrained(context) ? "baja" : "media", timeframe: timing(context.timeframeDays).build, dependencies: problem.dependencies, conclusionConfidence: problem.conclusionConfidence };
}

function growth(id: string, lever: ActionLever, intentKey: string, title: string, description: string, purpose: string, metric: string, evidence: ReturnType<typeof evidenceMatching>, priority: number, context: ActionOpportunityContext, profile: BusinessProfile, type: ActionOpportunityType = "growth"): ActionOpportunity {
  return { id: `${type}:${id}`, type, lever, intentKey, title, description, where: channelLabel(profile.primaryChannel), purpose, metric, evidenceIds: Array.from(new Set(evidence.map((item) => item.id))), evidence: Array.from(new Set(evidence.map((item) => item.text))).slice(0, 4).join(" · "), inference: purpose, problem: type === "growth" ? "Existe una oportunidad de crecimiento respaldada por la información disponible." : "Hace falta medir el avance antes de ampliar la intervención.", priority, impact: priority >= 80 ? "alto" : priority >= 55 ? "medio" : "bajo", difficulty: constrained(context) ? "baja" : "media", timeframe: timing(context.timeframeDays).build, dependencies: [], conclusionConfidence: averageConfidence(evidence) };
}

function deduplicateByIntent(items: ActionOpportunity[]) {
  const result = new Map<string, ActionOpportunity>();
  for (const item of items) { const current = result.get(item.intentKey); if (!current || item.priority > current.priority) result.set(item.intentKey, item); }
  return Array.from(result.values());
}
function evidenceMatching(profile: BusinessProfile, predicate: (item: BusinessProfile["commercialEvidence"][number]) => boolean) { return profile.commercialEvidence.filter(predicate); }
function evidenceByIds(profile: BusinessProfile, ids: string[]) { const wanted = new Set(ids); return profile.commercialEvidence.filter((item) => wanted.has(item.id)); }
function evidenceByCommercialIds(profile: BusinessProfile, ids: string[]) { return evidenceByIds(profile, ids); }
function sourceLabel(profile: BusinessProfile, ids: string[]) { const evidence = evidenceByIds(profile, ids); return Array.from(new Set(evidence.map((item) => channelLabel(item.source)))).join(" y ") || channelLabel(profile.primaryChannel); }
function channelLabel(source?: string | null) { return ({ web: "el sitio web", instagram: "Instagram", search: "Google", reviews: "las reseñas", linkedin: "LinkedIn", facebook: "Facebook", external_mentions: "las menciones externas", other: "el canal informado", onboarding: "la información del negocio" } as Record<string, string>)[String(source)] || "el canal principal"; }
function averageConfidence(items: BusinessProfile["commercialEvidence"]) { if (!items.length) return .35; return Math.round(items.reduce((sum, item) => sum + (item.confidence === "ALTA" ? .8 : item.confidence === "MEDIA" ? .6 : .4), 0) / items.length * 100) / 100; }
function constrained(context: ActionOpportunityContext) { return (context.budget ?? 0) < 300 || /solo|lo hago yo|2.?3|peque/i.test(context.capacity || ""); }
function short(value: string, length: number) { return value.length <= length ? value : `${value.slice(0, length - 1).trim()}…`; }
function timing(days: number) { return days <= 45 ? { build: "7–14 días", campaign: "2–3 semanas", test: "10–14 días", measurement: "4 semanas" } : days <= 120 ? { build: "14–30 días", campaign: "4–6 semanas", test: "2–3 semanas", measurement: "6 semanas" } : { build: "30–60 días", campaign: "8–12 semanas", test: "3–4 semanas", measurement: "3 meses" }; }
function metricForGoal(profile: BusinessProfile) { const goal = profile.goal.interpretation; if (goal.targetMetric === "clients") return "clientes nuevos"; if (goal.targetMetric === "reservations") return "turnos o reservas completadas"; if (goal.targetMetric === "consultations") return "consultas o reuniones recibidas"; if (goal.targetMetric === "visits") return "visitas atribuibles"; if (goal.targetMetric === "sales") return "ventas completadas"; if (goal.goalType === "retention") return "clientes que vuelven"; return profile.primaryResult; }
function reputationTitle(profile: BusinessProfile, context: ActionOpportunityContext) { if (profile.commercialModel === "appointments") return `Usar los resultados y la atención mejor valorados para conseguir más ${profile.primaryResult}`; if (profile.commercialModel === "reservations") return `Llevar lo mejor valorado de ${context.businessName} al momento de reservar o pedir`; if (profile.commercialModel === "membership") return "Convertir las experiencias favorables en motivos concretos para probar una clase"; if (profile.commercialModel === "professional") return `Convertir la confianza observada en motivos concretos para consultar a ${context.businessName}`; return `Convertir las opiniones favorables en una razón concreta para elegir ${context.businessName}`; }
function offeringLabel(profile: BusinessProfile) { return short((profile.offerings[0] || profile.originalIndustry).split(/[.;]/)[0].trim(), 58); }
function formatDays(days: string[]) { if (!days.length) return ""; if (days.length >= 3) return `${days[0]} a ${days.at(-1)}`; return days.join(" y "); }
function extractDayRange(text: string) { const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); const range = normalized.match(/(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s+(?:a|hasta)\s+(lunes|martes|miercoles|jueves|viernes|sabado|domingo)/); if (range) return `${range[1]} a ${range[2]}`; const days = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"].filter((day) => normalized.includes(day.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))); return formatDays(days); }
