import type { BusinessProfile } from "../intelligence/business-profile.ts";
import type { ProblemCandidate } from "../intelligence/commercial-candidates.ts";
import { buildMarketingDecisionContext, friendlyChannel, type MarketingDecisionContext } from "./marketing-decision-context.ts";
import { buildCausalDecision, buildExperimentDesign, type CausalDecision, type ExperimentDesign } from "./causal-decision-engine.ts";

export type ActionOpportunityType = "corrective" | "growth" | "validation";
export type ActionLever = "commercial_path" | "local_discovery" | "reputation" | "offer" | "content" | "retention" | "channel_mix" | "paid_test" | "measurement";
export interface ActionOpportunityContext { businessName: string; industry: string; location?: string | null; budget?: number | null; capacity?: string | null; timeframeDays: number; timeframeLabel?: string; evaluableDimensions?: number | null }
export interface ActionQualityAssessment { accepted: boolean; score: number; reasons: string[] }
export interface ActionOpportunity {
  id: string; type: ActionOpportunityType; lever: ActionLever; intentKey: string; title: string; description: string; where: string; audience: string;
  executionSteps: string[]; purpose: string; expectedResult: string; estimatedCost: string; metric: string; evidenceIds: string[]; evidence: string;
  inference: string; problem: string; priority: number; impact: "alto" | "medio" | "bajo"; difficulty: "alta" | "media" | "baja";
  timeframe: string; dependencies: string[]; conclusionConfidence: number; quality: ActionQualityAssessment;
  causalDecision: CausalDecision; experimentDesign: ExperimentDesign;
}

export class ActionOpportunityEngine {
  static generate(profile: BusinessProfile, input: ActionOpportunityContext): { selected: ActionOpportunity[]; considered: ActionOpportunity[]; decisionContext: MarketingDecisionContext } {
    const decision = buildMarketingDecisionContext(profile, { timeframeDays: input.timeframeDays, timeframeLabel: input.timeframeLabel, budget: input.budget, capacity: input.capacity, evaluableDimensions: input.evaluableDimensions });
    const candidates = decision.evidence.status === "insufficient"
      ? [measurementAction(profile, decision)].filter((item): item is ActionOpportunity => Boolean(item))
      : [...correctiveActions(profile, decision), ...decisionActions(profile, decision), measurementAction(profile, decision)].filter((item): item is ActionOpportunity => Boolean(item));
    const assessed = candidates.map((item) => ({ ...item, quality: assessActionQuality(item, decision) }));
    const unique = deduplicate(assessed).sort((a, b) => (b.priority + b.quality.score) - (a.priority + a.quality.score));
    const accepted = unique.filter((item) => item.quality.accepted);
    const selected: ActionOpportunity[] = [];
    const levers = new Set<ActionLever>();
    for (const item of accepted) {
      if (selected.length >= decision.resources.maxActions) break;
      if (levers.has(item.lever) && item.type !== "corrective") continue;
      selected.push(item); levers.add(item.lever);
    }
    for (const item of accepted) { if (selected.length >= Math.min(3, decision.resources.maxActions)) break; if (!selected.includes(item)) selected.push(item); }
    return { selected, considered: unique, decisionContext: decision };
  }
}

function correctiveActions(profile: BusinessProfile, decision: MarketingDecisionContext) {
  return profile.problemCandidates.filter((problem) => problem.validationStatus === "validated").map((problem) => correctiveFor(problem, profile, decision));
}

function correctiveFor(problem: ProblemCandidate, profile: BusinessProfile, decision: MarketingDecisionContext): ActionOpportunity {
  const evidence = evidenceByIds(profile, problem.evidenceFor);
  const where = Array.from(new Set(evidence.map((item) => friendlyChannel(item.source)))).join(" y ") || decision.channels.primary;
  const action = profile.primaryCustomerAction;
  const base = makeAction({ id: `corrective:${problem.id}`, type: "corrective", lever: "commercial_path", intentKey: `${problem.pattern}:${problem.journeyStage}`, profile, decision, evidence, priority: 112 + problem.priorityScore, problem: problem.hypothesis, inference: problem.causalExplanation, where, confidence: problem.conclusionConfidence });
  const finalize = (changes: Partial<ActionOpportunity>) => finalizeCorrectiveAction({ ...base, ...changes }, decision);
  if (problem.pattern === "action_path") return finalize({ title: `Simplificar el paso para ${action}`, description: `Probar y corregir el recorrido real hasta ${action}, sin cambiar las partes que ya funcionan.`, executionSteps: [`Abrir ${where} desde un celular y recorrer todos los pasos reversibles.`, "Eliminar únicamente los desvíos que la evidencia haya confirmado.", `Dejar una llamada clara a ${action} y volver a probarla.`], purpose: `${problem.causalExplanation} La intervención busca reducir abandonos antes de ${action}.`, expectedResult: `Más personas completan el paso para ${action}.`, metric: profile.primaryResult });
  if (problem.pattern === "decision_information") return finalize({ lever: "offer", title: `Aclarar la información necesaria antes de ${action}`, description: `Ubicar en ${where} la información concreta que aparece incompleta o tardía.`, executionSteps: ["Listar la duda exacta respaldada por la evidencia.", `Resolverla junto al paso para ${action}.`, "Comprobar con tres recorridos que la respuesta aparece antes de decidir."], purpose: `${problem.causalExplanation} La intervención busca resolver esa duda antes de pedir una decisión.`, expectedResult: `Más personas avanzan a ${action} con la información necesaria.`, metric: `personas que avanzan a ${action}` });
  if (problem.pattern === "trust") return finalize({ lever: "reputation", title: `Responder con pruebas a la duda que aparece antes de ${action}`, description: `Mostrar en ${where} pruebas verificables relacionadas con la duda observada.`, executionSteps: ["Elegir únicamente reseñas, casos o datos verificables.", `Ubicarlos cerca del paso para ${action}.`, "Medir si crecen las consultas o decisiones después de verlos."], purpose: "Reducir una objeción respaldada, sin exagerar la reputación.", expectedResult: "Más decisiones con menos dudas previas.", metric: `personas que avanzan a ${action} después de ver la prueba` });
  if (problem.pattern === "retention") {
    const period = extractRetentionPeriod(profile.additionalInformation) || "el período en que aparecen más bajas";
    const readablePeriod = /^primer/i.test(period) ? `las ${period}` : period;
    return finalize({ lever: "retention", title: `Acompañar a los clientes durante ${readablePeriod}`, description: `Crear un seguimiento breve para quienes se acercan a ${readablePeriod}, antes de que abandonen.`, where: `la experiencia inicial, con seguimiento por ${contactChannel(decision)}`, audience: "clientes actuales que se acercan al período de mayor abandono", executionSteps: [`Identificar cada semana quién se acerca a ${readablePeriod}.`, "Hacer un contacto breve para detectar una dificultad concreta y ofrecer el próximo paso más útil.", "Registrar motivo, respuesta y continuidad para decidir qué intervención sostener."], purpose: problem.causalExplanation, expectedResult: "Más clientes continúan después del período crítico.", metric: "clientes que continúan y bajas durante el período crítico" });
  }
  if (problem.pattern === "visibility") return finalize({ lever: "local_discovery", title: `Corregir cómo aparece ${decision.business.name} en búsquedas`, description: `Alinear en ${where} nombre, actividad, ubicación y contacto usando datos comprobados.`, executionSteps: ["Comparar los datos públicos encontrados.", "Corregir solo las diferencias verificadas.", "Revisar nuevamente la ficha desde una búsqueda sin sesión."], purpose: "Facilitar que las personas correctas encuentren y reconozcan el negocio.", expectedResult: "Más descubrimientos que terminan en contacto o visita.", metric: "personas que llegan desde búsquedas y avanzan al contacto" });
  return finalize({ title: `Corregir la fricción comprobada antes de ${action}`, description: `Cambiar en ${where} la señal concreta indicada por la evidencia y volver a comprobar el recorrido.`, executionSteps: ["Aislar la señal respaldada.", "Aplicar un único cambio.", `Repetir el recorrido hasta ${action} y registrar el resultado.`], purpose: `Destrabar el avance hacia ${action}.`, expectedResult: `Más personas completan ${action}.`, metric: profile.primaryResult });
}

function finalizeCorrectiveAction(action: ActionOpportunity, decision: MarketingDecisionContext): ActionOpportunity {
  return { ...action, experimentDesign: buildExperimentDesign(decision, { title: action.title, description: action.description, audience: action.audience, metric: action.metric, expectedResult: action.expectedResult }) };
}

function decisionActions(profile: BusinessProfile, decision: MarketingDecisionContext): ActionOpportunity[] {
  const result: ActionOpportunity[] = [];
  const evidence = goalEvidence(profile);
  const where = bestExecutionChannel(profile, decision);
  const audience = decision.audience;
  const goal = decision.goal.type;
  const referralSignal = (profile.declaredSignals || []).find((item) => item.type === "referrals");
  const channelSignal = (profile.declaredSignals || []).find((item) => item.type === "channel");
  if (goal === "local_visits") {
    const period = extractDemandPeriod(decision.demandPattern) || "los días con menor movimiento";
    result.push(makeGrowth(profile, decision, evidence, { id: "weekday-demand", lever: "local_discovery", intentKey: "activate-low-demand", priority: 108, title: `Crear una propuesta de ${decision.offer} para ${period}`, description: `Lanzar durante cuatro semanas una propuesta limitada a ${period}, comunicada en ${where} y en el punto de venta.`, where: `${where} y el local`, audience, steps: [`Elegir una propuesta simple sobre ${decision.offer} que pueda sostenerse con la capacidad actual.`, `Publicarla solo para ${period}, con ubicación, horario y forma de contacto.`, "Preguntar en caja cómo conocieron la propuesta y registrar las visitas."], why: decision.demandPattern ? "El negocio informó un desbalance de demanda y el objetivo es aumentar visitas; conviene trabajar la capacidad disponible, no los momentos que ya funcionan." : "El objetivo depende de transformar presencia local en visitas medibles.", result: `Más visitas de ${audience} en ${period}.`, metric: `visitas al local en ${period}` }));
    if (/recompra|recurr|vuelv|volver|fidel/i.test(decision.goal.original)) result.push(recurrenceOpportunity(profile, decision, evidence));
  }
  if (goal === "recurrence") result.push(recurrenceOpportunity(profile, decision, evidence));
  if (goal === "average_ticket") result.push(makeGrowth(profile, decision, evidence, { id: "ticket-bundle", lever: "offer", intentKey: "increase-ticket", priority: 102, title: `Armar una combinación útil alrededor de ${decision.offer}`, description: "Probar una combinación sencilla que aumente el valor de la compra sin aplicar un descuento general.", where: `${where} y el momento de compra`, audience, steps: ["Elegir dos productos o servicios que resuelvan una necesidad conjunta.", "Mostrar el beneficio y el valor total antes de pagar.", "Comparar el valor promedio de las compras con y sin la combinación."], why: "El objetivo es aumentar el valor por cliente; la intervención debe ocurrir en la elección, no solamente en la captación.", result: "Más compras incluyen una combinación relevante.", metric: "valor promedio por compra" }));
  if (goal === "orders") result.push(makeGrowth(profile, decision, evidence, { id: "whatsapp-order", lever: "commercial_path", intentKey: "direct-order", priority: 103, title: "Preparar un recorrido corto para pedir por WhatsApp", description: "Ordenar oferta, condiciones y mensaje inicial para que un pedido pueda comenzar sin ida y vuelta innecesaria.", where: decision.channels.contactMethods.includes("WhatsApp") ? "WhatsApp y los enlaces que llevan al chat" : where, audience, steps: ["Definir qué datos mínimos necesita cada pedido.", "Crear un mensaje inicial con producto, cantidad y forma de entrega.", "Probar el recorrido sin enviar ni cobrar una compra real."], why: "El objetivo es recibir pedidos; el canal debe reducir preguntas repetidas y conducir a una orden completa.", result: "Más conversaciones terminan en un pedido claro.", metric: "pedidos completos y conversaciones que terminan en pedido" }));
  if (goal === "appointments" && decision.demandPattern) {
    const period = extractDemandWindow(decision.demandPattern) || "los momentos con capacidad disponible";
    result.push(makeGrowth(profile, decision, evidence, { id: "appointment-capacity", lever: "local_discovery", intentKey: "activate-appointment-capacity", priority: 86, title: `Concentrar la disponibilidad de turnos en ${period}`, description: `Comunicar durante cuatro semanas los turnos realmente disponibles en ${period}, sin prometer cupos que el equipo no pueda atender.`, where: `${where} y ${contactChannel(decision)}`, audience, steps: [`Definir cuántos turnos reales pueden ofrecerse en ${period}.`, "Comunicar esa disponibilidad con un único acceso a la reserva.", "Marcar cada turno que use esa disponibilidad y comparar ocupación semanal."], why: `El negocio declaró capacidad disponible en ${period}; esta prueba usa esa capacidad para avanzar hacia “${decision.goal.original}”.`, result: `Más turnos ocupados en ${period}.`, metric: `turnos reservados en ${period}` }));
  }
  const hasValidatedProblem = profile.problemCandidates.some((item) => item.validationStatus === "validated");
  if (["appointments", "consultations", "sales", "growth", "awareness"].includes(goal) && !(goal === "appointments" && hasValidatedProblem)) {
    const appointmentPeriod = extractDemandPeriod(decision.goal.original);
    const appointmentTitle = `Presentar ${decision.offer} para ${profile.primaryCustomerAction}${appointmentPeriod ? ` de ${appointmentPeriod}` : ""}`;
    result.push(makeGrowth(profile, decision, evidence, { id: "goal-entry", lever: goal === "awareness" ? "content" : "offer", intentKey: `goal-entry:${goal}`, priority: 91, title: goal === "consultations" ? `Explicar cuándo conviene consultar a ${decision.business.name}` : goal === "appointments" ? appointmentTitle : `Concentrar la propuesta en ${decision.offer}`, description: goal === "consultations" ? `Crear tres situaciones concretas que ${audience} pueda reconocer y vincular cada una con una consulta.` : goal === "appointments" ? `Explicar en ${where} qué puede reservarse, en qué período hace falta completar turnos y cómo avanzar sin desvíos.` : `Presentar una sola propuesta relacionada con “${decision.goal.original}” y llevarla directamente a ${profile.primaryCustomerAction}.`, where, audience, steps: goal === "consultations" ? ["Elegir tres problemas reales que resuelve el negocio.", `Explicarlos con lenguaje de ${audience}, sin describir servicios de forma abstracta.`, `Cerrar cada caso con un paso directo para ${profile.primaryCustomerAction}.`] : goal === "appointments" ? [`Elegir los servicios de ${decision.offer} que pueden sostenerse en el período priorizado.`, `Mostrar disponibilidad y condiciones en ${where}.`, `Conectar cada propuesta con un paso directo para ${profile.primaryCustomerAction} y registrar los turnos.`] : [`Elegir la parte de ${decision.offer} más relacionada con el objetivo.`, `Explicar beneficio, condiciones y siguiente paso en ${where}.`, "Medir avances comerciales, no solamente vistas."], why: `Esta intervención conecta la oferta y el canal disponible con el objetivo “${decision.goal.original}”.`, result: decision.goal.outcome, metric: decision.decision.primaryKpi }));
  }
  if (goal === "sales" && profile.commercialModel === "commerce" && profile.purchasePattern === "repeated") result.push(makeGrowth(profile, decision, evidence, { id: "commerce-repeat", lever: "retention", intentKey: "commerce-next-purchase", priority: 79, title: `Preparar una próxima compra relacionada con ${decision.offer}`, description: "Crear un seguimiento posterior a la entrega que sugiera un complemento útil, sin enviar promociones generales.", where: `el mensaje posterior a la entrega y ${contactChannel(decision)}`, audience: "personas que ya completaron una compra", steps: ["Elegir complementos únicamente cuando tengan relación directa con el producto comprado.", "Enviar una sola recomendación después de confirmar la entrega, con condiciones y enlace al producto.", "Registrar compras repetidas y dejar de enviar el mensaje si no genera respuestas útiles."], why: "El modelo permite trabajar ventas nuevas y recompra como recorridos distintos; esta acción actúa después de una compra completada.", result: "Más compradores vuelven por un producto relacionado.", metric: "compras repetidas y tiempo hasta la próxima compra" }));
  if (goal === "recurrence" && /altas|inscrip|nuevos socios/i.test(decision.goal.original) && profile.activeChannels.includes("search")) {
    const acquisition = makeGrowth(profile, decision, evidence, { id: "membership-acquisition", lever: "local_discovery", intentKey: "membership-maps-entry", priority: 72, title: "Preparar una entrada de inscripción desde Google Maps", description: `Conectar la ficha local con un paso directo y medible para ${profile.primaryCustomerAction}.`, where: "Google Maps y el canal de contacto", audience: "personas de la zona que todavía no son clientes", steps: ["Verificar ubicación, horarios y propuesta de ingreso en la ficha.", `Conectar el botón principal con ${contactChannel(decision)} y preparar el mensaje inicial.`, "Registrar solicitudes de inscripción que comienzan en Google Maps."], why: "El objetivo también incluye nuevas altas, pero esta captación debe activarse después de ordenar el seguimiento de quienes ya ingresan.", result: "Más solicitudes locales de inscripción con origen identificable.", metric: "solicitudes de inscripción desde Google Maps" });
    acquisition.dependencies = ["Medir primero durante cuatro semanas la continuidad de los socios actuales."];
    result.push(acquisition);
  }

  if (referralSignal) result.push(makeGrowth(profile, decision, evidence, { id: "referrals", lever: "channel_mix", intentKey: "repeat-referrals", priority: 88, title: "Convertir las recomendaciones en una forma fácil de generar nuevas consultas", description: "Preparar un pedido de recomendación breve para usar después de una experiencia satisfactoria.", where: `el cierre de la experiencia y ${contactChannel(decision)}`, audience: "clientes satisfechos y las personas que podrían recomendar", steps: ["Definir en qué momento pedir una recomendación sin interrumpir la experiencia.", "Preparar un mensaje y un enlace directo que el cliente pueda compartir.", "Registrar quién recomendó y si la nueva persona avanzó."], why: "El negocio declaró que las recomendaciones ya participan en la llegada de clientes; la acción busca volver ese origen medible y repetible.", result: "Más consultas nuevas provenientes de recomendaciones.", metric: "nuevas consultas por recomendación" }));
  else if (channelSignal) {
    const namedChannel = channelSignal.evidence.match(/Instagram|WhatsApp|Google(?: Maps)?|tel[eé]fono|email/i)?.[0] || where;
    const channelAlreadyExecutesGoal = result.some((item) => item.where.toLowerCase().includes(namedChannel.toLowerCase()));
    if (goal === "consultations") result.push(makeGrowth(profile, decision, evidence, { id: "qualified-channel", lever: "channel_mix", intentKey: "qualify-before-meeting", priority: 82, title: `Calificar por ${namedChannel} antes de ${profile.primaryCustomerAction}`, description: `Pedir solo los datos necesarios para saber si ${decision.offer} encaja antes de agendar una conversación.`, where: namedChannel, audience, steps: [`Definir dos o tres datos que permitan reconocer si ${decision.offer} puede ayudar.`, "Preparar una respuesta breve para casos adecuados y otra derivación clara para los que no encajan.", `Registrar cuántas conversaciones calificadas avanzan a ${profile.primaryCustomerAction}.`], why: "El objetivo no es recibir cualquier contacto, sino consultas calificadas que puedan avanzar a reunión.", result: decision.goal.outcome, metric: decision.decision.primaryKpi }));
    else if (!channelAlreadyExecutesGoal) result.push(makeGrowth(profile, decision, evidence, { id: "declared-channel", lever: "channel_mix", intentKey: "activate-declared-channel", priority: 82, title: `Conectar ${namedChannel} con ${profile.primaryCustomerAction}`, description: `Usar ${namedChannel} para presentar una propuesta concreta y llevarla a un próximo paso medible.`, where: namedChannel, audience, steps: ["Elegir una sola propuesta relacionada con el objetivo.", `Conectar el mensaje, la prueba y el paso para ${profile.primaryCustomerAction}.`, "Registrar cuántos avances empiezan en ese canal."], why: "El negocio informó que este canal participa en la llegada de clientes; se usa como contexto, no como una métrica verificada.", result: decision.goal.outcome, metric: decision.decision.primaryKpi }));
  }

  if (profile.localDependency === "high" && !["recurrence", "average_ticket"].includes(goal) && !result.some((item) => item.lever === "local_discovery")) {
    if (goal === "appointments" && profile.activeChannels.includes("search")) {
      result.push(makeGrowth(profile, decision, evidence, { id: "maps-to-appointment", lever: "local_discovery", intentKey: "maps-to-appointment", priority: 80, title: `Dejar el paso para ${profile.primaryCustomerAction} directo desde Google Maps`, description: `Comprobar que la ficha local muestre horario, ubicación y un acceso vigente para ${profile.primaryCustomerAction}.`, where: "Google Maps y el canal de contacto", audience, steps: ["Revisar la ficha desde un celular y sin una sesión iniciada.", `Conectar el botón principal con ${contactChannel(decision)} o el sistema real usado para ${profile.primaryCustomerAction}.`, "Registrar durante cuatro semanas los turnos que comienzan en la ficha."], why: "La evidencia confirma presencia en Google Maps y el objetivo depende de transformar búsquedas locales en turnos.", result: decision.goal.outcome, metric: `${profile.primaryResult} que comienzan en Google Maps` }));
    } else if (goal === "local_visits" || goal === "growth") {
      result.push(makeGrowth(profile, decision, evidence, { id: "local-presence", lever: "local_discovery", intentKey: "local-to-action", priority: 76, title: `Hacer más directo el paso desde ${decision.business.location || "la zona"} hasta ${profile.primaryCustomerAction}`, description: `Alinear ubicación, horario y contacto en ${where} y comprobar el paso siguiente desde un celular.`, where, audience, steps: ["Verificar ubicación, horario y actividad en el canal local disponible.", `Dejar un enlace directo para ${profile.primaryCustomerAction}.`, "Registrar las consultas o visitas que llegan desde ese punto."], why: "La cercanía influye en la elección de este negocio y debe conectar con el objetivo comercial.", result: decision.goal.outcome, metric: decision.decision.primaryKpi }));
    }
  }

  const reviews = profile.commercialEvidence.filter((item) => item.source === "reviews" && item.polarity === "positive");
  if (reviews.length >= 2) result.push(makeGrowth(profile, decision, reviews, { id: "reputation-proof", lever: "reputation", intentKey: "use-reputation", priority: 78, title: "Usar el motivo mejor valorado como prueba para decidir", description: `Seleccionar el tema favorable repetido y mostrarlo cerca del paso para ${profile.primaryCustomerAction}.`, where, audience, steps: ["Confirmar que el tema aparece en varias opiniones independientes.", "Elegir citas verificables sin cambiar su sentido.", `Ubicarlas junto al paso para ${profile.primaryCustomerAction}.`], why: "La reputación ayuda a decidir cuando está repetida y vinculada con una duda comercial real.", result: `Más personas avanzan a ${profile.primaryCustomerAction} después de ver la prueba.`, metric: decision.decision.primaryKpi }));
  if (decision.resources.paidTestAllowed && decision.resources.capacityBand !== "low" && profile.strengthCandidates.some((item) => item.pattern === "action_path" && item.evidenceSufficiency.status !== "insufficient")) {
    const cap = Math.min(decision.resources.monthlyBudget || 0, decision.resources.budgetBand === "large" ? 900 : 300);
    result.push(makeGrowth(profile, decision, evidence, { id: "paid-test", lever: "paid_test", intentKey: "controlled-paid-test", priority: 58, title: "Probar una campaña pequeña sobre la propuesta prioritaria", description: `Destinar hasta USD ${cap} a una prueba acotada y detenerla si no produce avances comerciales.`, where, audience, steps: ["Usar una sola audiencia, una sola propuesta y un único destino.", "Marcar el origen de cada consulta, visita o pedido.", "Revisar costo y resultado antes de ampliar inversión."], why: "Hay presupuesto y un recorrido utilizable, pero la prueba debe validar demanda antes de escalar.", result: decision.goal.outcome, metric: `costo por ${decision.decision.primaryKpi}` }));
  }
  return result;
}

function recurrenceOpportunity(profile: BusinessProfile, decision: MarketingDecisionContext, evidence: BusinessProfile["commercialEvidence"]) {
  const isMembership = ["membership", "subscription"].includes(profile.commercialModel);
  const title = isMembership ? `Probar un mecanismo de continuidad para ${decision.offer}` : `Probar una razón concreta para volver por ${decision.offer}`;
  const description = isMembership ? `Elegir un mecanismo de continuidad que el equipo pueda sostener durante ${decision.offer}, usando ${contactChannel(decision)}.` : `Elegir un mecanismo de regreso que el equipo pueda sostener después de cada compra o atención relacionada con ${decision.offer}, usando ${contactChannel(decision)}.`;
  return makeGrowth(profile, decision, evidence, { id: "second-visit", lever: "retention", intentKey: "managed-return", priority: 102, title, description, where: `el cierre de la experiencia, la caja y ${contactChannel(decision)}`, audience: "clientes que ya compraron o visitaron el negocio", steps: ["Comparar opciones simples —beneficio para la próxima visita, sello o QR, incentivo temporal o mensaje posterior— y elegir una según el margen y la operación.", "Definir una condición y un vencimiento claros, sin aplicar un descuento general.", "Registrar en caja o en el canal de contacto quién recibió la propuesta y si regresó."], why: "El objetivo es aumentar la repetición; atraer más personas no reemplaza un mecanismo claro para que vuelvan.", result: "Más clientes regresan dentro del período definido.", metric: "clientes que vuelven y tiempo entre visitas o compras" });
}

function measurementAction(profile: BusinessProfile, decision: MarketingDecisionContext): ActionOpportunity | null {
  const evidence = decision.evidence.status === "insufficient"
    ? profile.commercialEvidence.filter((item) => item.id === "declared:goal" || item.id === "declared:additional").slice(0, 2)
    : goalEvidence(profile);
  if (!evidence.length) return null;
  const retentionProblem = profile.problemCandidates.find((item) => item.validationStatus === "validated" && item.pattern === "retention");
  const metric = retentionProblem ? "clientes que continúan después del período crítico y bajas semanales" : decision.decision.primaryKpi;
  return makeGrowth(profile, decision, evidence, { id: "measurement", type: "validation", lever: "measurement", intentKey: "measure-decision", priority: decision.evidence.isPartial ? 84 : 45, title: `Medir semanalmente ${metric}`, description: "Durante dos semanas, registrar cuántas personas consultan, desde qué canal llegan y cuántas completan el resultado buscado.", where: "una planilla compartida por el equipo", audience: "el equipo responsable de atender las consultas", steps: ["Anotar el valor inicial antes de cambiar nada.", "Registrar cada consulta, su origen y si avanzó al resultado buscado durante dos semanas.", "Revisar qué canal y qué paso necesitan validarse antes de decidir una intervención."], why: decision.evidence.status === "insufficient" ? "Todavía no hay evidencia suficiente para afirmar dónde está el problema; esta medición permite encontrarlo sin convertir el objetivo en diagnóstico." : decision.evidence.isPartial ? "La evidencia pública es parcial; medir este resultado evita convertir una hipótesis en una certeza." : "La medición permite decidir qué sostener sin sumar complejidad.", result: "Datos suficientes para decidir qué parte del recorrido conviene trabajar primero.", metric });
}

function makeGrowth(profile: BusinessProfile, decision: MarketingDecisionContext, evidence: BusinessProfile["commercialEvidence"], spec: { id: string; type?: ActionOpportunityType; lever: ActionLever; intentKey: string; priority: number; title: string; description: string; where: string; audience: string; steps: string[]; why: string; result: string; metric: string }) {
  const type = spec.type || (decision.evidence.status === "partial" ? "validation" : "growth");
  return makeAction({ id: `${type}:${spec.id}`, type, lever: spec.lever, intentKey: spec.intentKey, profile, decision, evidence, priority: spec.priority, problem: type === "validation" ? "Hace falta validar esta oportunidad antes de ampliarla." : `El objetivo requiere una decisión específica sobre ${spec.metric}.`, inference: spec.why, where: spec.where, confidence: averageConfidence(evidence), title: spec.title, description: spec.description, audience: spec.audience, executionSteps: spec.steps, purpose: spec.why, expectedResult: spec.result, metric: spec.metric });
}

function makeAction(input: Omit<Partial<ActionOpportunity>, "evidence"> & { id: string; type: ActionOpportunityType; lever: ActionLever; intentKey: string; profile: BusinessProfile; decision: MarketingDecisionContext; evidence: BusinessProfile["commercialEvidence"]; priority: number; problem: string; inference: string; where: string; confidence: number }): ActionOpportunity {
  const cost = input.lever === "paid_test" ? `Hasta USD ${Math.min(input.decision.resources.monthlyBudget || 0, input.decision.resources.budgetBand === "large" ? 900 : 300)}` : input.decision.resources.budgetBand === "none" ? "Sin inversión publicitaria" : "Bajo; usa canales y herramientas existentes";
  const difficulty = input.decision.resources.capacityBand === "low" ? "baja" : input.executionSteps && input.executionSteps.length > 3 ? "alta" : "media";
  const title = input.title || ""; const description = input.description || ""; const audience = input.audience || input.decision.audience; const metric = input.metric || input.decision.decision.primaryKpi; const expectedResult = input.expectedResult || input.decision.goal.outcome;
  const relatedProblem = input.profile.problemCandidates.find((problem) => Array.isArray(problem.evidenceFor) && problem.evidenceFor.some((id) => input.evidence.some((item) => item.id === id)));
  return { id: input.id, type: input.type, lever: input.lever, intentKey: input.intentKey, title, description, where: input.where, audience, executionSteps: input.executionSteps || [], purpose: input.purpose || input.inference, expectedResult, estimatedCost: cost, metric, evidenceIds: Array.from(new Set(input.evidence.map((item) => item.id))), evidence: Array.from(new Set(input.evidence.map((item) => item.text))).slice(0, 4).join(" · "), inference: input.inference, problem: input.problem, priority: input.priority, impact: input.priority >= 85 ? "alto" : input.priority >= 60 ? "medio" : "bajo", difficulty, timeframe: timing(input.decision.goal.timeframeDays), dependencies: input.dependencies || [], conclusionConfidence: input.confidence, quality: { accepted: false, score: 0, reasons: [] }, causalDecision: buildCausalDecision(input.profile, input.decision, relatedProblem), experimentDesign: input.type === "validation" && input.decision.evidence.status === "insufficient" ? buildEvidenceValidationExperiment(input.decision, { description, audience, metric }) : buildExperimentDesign(input.decision, { title, description, audience, metric, expectedResult }) };
}

function buildEvidenceValidationExperiment(decision: MarketingDecisionContext, action: { description: string; audience: string; metric: string }) {
  return {
    hypothesis: `Todavía no está validado qué parte del recorrido limita ${action.metric}.`,
    intervention: action.description,
    audience: action.audience,
    duration: "2 semanas",
    baselineMetric: `Registrar ${action.metric}, el origen de cada consulta y cuántas avanzan, sin cambiar la definición durante la medición.`,
    targetMetric: action.metric,
    successCriteria: "La validación se completa cuando existen dos semanas comparables y cada consulta tiene origen y resultado registrados.",
    ifWorks: "Usar los datos para elegir una intervención sobre el paso con mayor pérdida comprobada.",
    ifNot: "Extender la observación o conectar una fuente adicional antes de decidir sobre pauta, canales o recorrido comercial.",
  };
}

export function assessActionQuality(action: ActionOpportunity, context?: MarketingDecisionContext): ActionQualityAssessment {
  const reasons: string[] = []; const text = `${action.title} ${action.description} ${action.purpose}`;
  if (!action.title || action.title.length < 12) reasons.push("título insuficiente");
  if (!action.where || /canal informado|canal principal|donde corresponda/i.test(action.where)) reasons.push("no indica un lugar concreto");
  if (!action.audience || /público objetivo|audiencia objetivo/i.test(action.audience)) reasons.push("no identifica a quién alcanza");
  if (action.executionSteps.length < 2) reasons.push("no explica cómo ejecutarla");
  if (!action.metric || /mejorar resultados|avance hacia el objetivo/i.test(action.metric)) reasons.push("no define una medición concreta");
  if (!action.evidenceIds.length) reasons.push("no conserva evidencia");
  if (/mejorar (las )?redes|mejorar seo|publicar contenido|optimizar (la )?web|hacer publicidad/i.test(text)) reasons.push("recomendación genérica");
  // Detectar patrones genéricos intercambiables entre sectores
  if (/conectar (instagram|facebook|whatsapp) con la acción principal|conectar el canal con/i.test(text)) reasons.push("acción genérica de canal intercambiable");
  if (/probar una campaña pequeña sobre la propuesta|probar anuncios|probar pauta/i.test(text)) reasons.push("acción genérica de prueba paga intercambiable");
  if (/concentrar la propuesta en|presentar una sola propuesta relacionada/i.test(text)) reasons.push("acción genérica de propuesta intercambiable");
  if (/hacer más directo el paso desde .* hasta (visitar|comprar|consultar|reservar)/i.test(text)) reasons.push("acción genérica de localización intercambiable");
  if (/usar (instagram|facebook|whatsapp) para presentar casos específicos/i.test(text)) reasons.push("acción genérica de canal intercambiable");
  if (/\.\.\.|…|channel_mix|commercial_path|paid_test|local_discovery/i.test(text)) reasons.push("contiene una costura interna o texto truncado");
  if (context?.resources.budgetBand === "none" && action.lever === "paid_test") reasons.push("no respeta el presupuesto");
  if (context && referencesUnavailableChannel(action.where, context)) reasons.push("depende de un canal no disponible");
  if (context?.resources.capacityBand === "low" && action.difficulty === "alta") reasons.push("no respeta la capacidad de ejecución");
  const score = Math.max(0, 100 - reasons.length * 22); return { accepted: reasons.length === 0 && score >= 78, score, reasons };
}

function referencesUnavailableChannel(where: string, context: MarketingDecisionContext) {
  const normalizedWhere = where.toLowerCase();
  const available = [...context.channels.active, ...context.channels.contactMethods].join(" ").toLowerCase();
  const channels = [
    { pattern: /instagram/i, aliases: ["instagram"] }, { pattern: /tiktok/i, aliases: ["tiktok"] }, { pattern: /linkedin/i, aliases: ["linkedin"] },
    { pattern: /facebook/i, aliases: ["facebook"] }, { pattern: /google(?: maps)?/i, aliases: ["google", "search"] }, { pattern: /sitio web|web/i, aliases: ["sitio web", "web"] },
    { pattern: /whatsapp/i, aliases: ["whatsapp"] }, { pattern: /email|correo/i, aliases: ["email", "correo"] },
  ];
  return channels.some(({ pattern, aliases }) => pattern.test(normalizedWhere) && !aliases.some((alias) => available.includes(alias)));
}

function deduplicate(items: ActionOpportunity[]) { const result: ActionOpportunity[] = []; for (const item of items) { const duplicate = result.find((existing) => existing.intentKey === item.intentKey || similarity(existing.title, item.title) >= .68); if (!duplicate) result.push(item); else if (item.priority + item.quality.score > duplicate.priority + duplicate.quality.score) result[result.indexOf(duplicate)] = item; } return result; }
function similarity(left: string, right: string) { const a = tokens(left); const b = tokens(right); const common = Array.from(a).filter((word) => b.has(word)).length; return common / Math.max(1, new Set([...Array.from(a), ...Array.from(b)]).size); }
function tokens(value: string) { return new Set(value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((word) => word.length > 3)); }
function evidenceByIds(profile: BusinessProfile, ids: string[]) { const wanted = new Set(ids); return profile.commercialEvidence.filter((item) => wanted.has(item.id)); }
function goalEvidence(profile: BusinessProfile) { const items = profile.commercialEvidence.filter((item) => item.id === "declared:goal" || item.id === "declared:additional" || (item.kind === "ObservedEvidence" && item.polarity !== "negative")).slice(0, 6); return items.length ? items : profile.commercialEvidence.filter((item) => item.polarity !== "negative").slice(0, 4); }
function averageConfidence(items: BusinessProfile["commercialEvidence"]) { if (!items.length) return .35; return Math.round(items.reduce((sum, item) => sum + (item.confidence === "ALTA" ? .82 : item.confidence === "MEDIA" ? .62 : .4), 0) / items.length * 100) / 100; }
function bestExecutionChannel(profile: BusinessProfile, decision: MarketingDecisionContext) { if (decision.goal.type === "orders" && decision.channels.contactMethods.includes("WhatsApp")) return "WhatsApp"; if (profile.activeChannels.includes("instagram")) return "Instagram"; if (profile.activeChannels.includes("search")) return "Google"; return decision.channels.primary; }
function contactChannel(decision: MarketingDecisionContext) { return decision.channels.contactMethods[0] || decision.channels.primary; }
function extractDemandPeriod(value: string | null) { if (!value) return null; const text = value.toLowerCase(); const day = "(lunes|martes|mi[eé]rcoles|jueves|viernes)"; const range = text.match(new RegExp(`${day}\\s+(?:a|hasta)\\s+${day}`)); if (range) return `${range[1]} a ${range[2]}`; if (/lunes|martes|mi[eé]rcoles|jueves|viernes/.test(text)) { const days = ["lunes", "martes", "miércoles", "jueves", "viernes"].filter((candidate) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(candidate.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))); return days.length > 2 ? `${days[0]} a ${days.at(-1)}` : days.join(" y "); } return /fin de semana/.test(text) ? "los días de semana" : null; }
function extractRetentionPeriod(value: string | null) { return value?.match(/primer(?:a|as|o|os)?\s+[a-záéíóúñ0-9]+(?:\s+a\s+[a-záéíóúñ0-9]+)?\s+(?:semanas?|meses?)/i)?.[0].toLowerCase() || null; }
function extractDemandWindow(value: string | null) { const text = value?.toLowerCase() || ""; if (/tarde/.test(text)) return "las tardes"; if (/mañana/.test(text)) return "las mañanas"; if (/noche/.test(text)) return "las noches"; return extractDemandPeriod(value); }
function timing(days: number) { return days <= 45 ? "7–14 días" : days <= 120 ? "2–4 semanas" : "4–8 semanas"; }
