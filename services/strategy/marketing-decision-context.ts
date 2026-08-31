import type { BusinessProfile } from "../intelligence/business-profile.ts";

export type DecisionGoal = "local_visits" | "recurrence" | "average_ticket" | "orders" | "appointments" | "consultations" | "sales" | "awareness" | "growth";
export type BudgetBand = "none" | "small" | "medium" | "large" | "unknown";
export type CapacityBand = "low" | "medium" | "high" | "unknown";

export interface MarketingDecisionContext {
  business: { name: string; industry: string; model: BusinessProfile["commercialModel"]; location: string | null; operatingMode: BusinessProfile["operatingMode"] };
  goal: { original: string; type: DecisionGoal; outcome: string; timeframeDays: number; timeframeLabel: string };
  audience: string;
  offer: string;
  resources: { monthlyBudget: number | null; budgetBand: BudgetBand; capacity: string | null; capacityBand: CapacityBand; maxActions: number; paidTestAllowed: boolean };
  channels: { active: string[]; primary: string; contactMethods: string[] };
  demandPattern: string | null;
  declaredContext: string[];
  evidence: { observed: number; declared: number; inferred: number; isPartial: boolean };
  decision: { strategicBet: string; notPriority: string; primaryKpi: string };
}

const normalize = (value: unknown) => String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function buildMarketingDecisionContext(profile: BusinessProfile, input: { timeframeDays?: number; timeframeLabel?: string; budget?: number | null; capacity?: string | null } = {}): MarketingDecisionContext {
  const goalText = profile.goal?.goalOriginalText || profile.goal?.text || "hacer crecer el negocio";
  const goalType = decisionGoal(goalText, profile);
  const budget = input.budget ?? profile.resources.monthlyBudget ?? null;
  const capacity = input.capacity ?? profile.resources.executionCapacity ?? null;
  const budgetBand = budget === null ? "unknown" : budget <= 0 ? "none" : budget <= 400 ? "small" : budget <= 1500 ? "medium" : "large";
  const capacityBand = capacityLevel(capacity);
  const timeframeDays = input.timeframeDays ?? profile.goal.timeframeDays ?? 90;
  const audience = cleanPhrase(profile.audienceSignals?.[0] || profile.customerType || "las personas que busca el negocio", 90);
  const offer = cleanOffer(profile);
  const activeChannels = profile.activeChannels || [];
  const active = Array.from(new Set(activeChannels.map(friendlyChannel)));
  const primary = friendlyChannel(profile.primaryChannel || activeChannels[0] || "other");
  const demandPattern = (profile.declaredSignals || []).find((signal) => signal.type === "demand_pattern")?.evidence || null;
  const evidence = {
    observed: profile.commercialEvidence.filter((item) => item.kind === "ObservedEvidence").length,
    declared: profile.commercialEvidence.filter((item) => item.kind === "DeclaredEvidence").length,
    inferred: profile.commercialEvidence.filter((item) => item.kind === "InferredEvidence").length,
    isPartial: profile.commercialEvidence.filter((item) => item.kind === "ObservedEvidence").length < 3 || (profile.unavailableChannels || []).length > activeChannels.length,
  };
  const outcome = outcomeFor(goalType, profile);
  return {
    business: { name: profile.businessName, industry: profile.originalIndustry, model: profile.commercialModel, location: profile.location, operatingMode: profile.operatingMode },
    goal: { original: goalText, type: goalType, outcome, timeframeDays, timeframeLabel: input.timeframeLabel || profile.goal.timeframeLabel || `${timeframeDays} días` },
    audience,
    offer,
    resources: { monthlyBudget: budget, budgetBand, capacity, capacityBand, maxActions: capacityBand === "low" ? 3 : capacityBand === "high" ? 5 : 4, paidTestAllowed: budget !== null && budget >= 100 },
    channels: { active, primary, contactMethods: profile.contactMethods || [] },
    demandPattern,
    declaredContext: (profile.declaredSignals || []).map((item) => item.evidence),
    evidence,
    decision: decisionFor(goalType, profile, demandPattern, budgetBand),
  };
}

function decisionGoal(goal: string, profile: BusinessProfile): DecisionGoal {
  const text = normalize(goal);
  if (/ticket|valor (de )?(compra|pedido)|venta promedio/.test(text)) return "average_ticket";
  if (/visitas?|movimiento|trafico.*local/.test(text) && (profile.declaredSignals || []).some((signal) => signal.type === "demand_pattern")) return "local_visits";
  if (/recompra|recurr|vuelv|volver|fidel|renov/.test(text) || profile.goal.interpretation.goalType === "retention") return "recurrence";
  if (/whatsapp|pedidos?|delivery|envios?/.test(text)) return "orders";
  if (/visitas?|movimiento|trafico.*local/.test(text) || profile.goal.interpretation.goalType === "visits") return "local_visits";
  if (/turno|reserv|cita|clase/.test(text) || profile.goal.interpretation.goalType === "reservations") return "appointments";
  if (/consulta|reunion|presupuesto|contact/.test(text) || ["consultations", "larger_clients"].includes(profile.goal.interpretation.goalType)) return "consultations";
  if (/venta|factur|compr/.test(text) || profile.goal.interpretation.goalType === "sales") return "sales";
  if (profile.goal.interpretation.goalType === "awareness") return "awareness";
  return "growth";
}

function decisionFor(type: DecisionGoal, profile: BusinessProfile, demand: string | null, budget: BudgetBand) {
  const action = profile.primaryCustomerAction;
  if (type === "recurrence") return { strategicBet: "dar a cada cliente una razón concreta y medible para volver", notPriority: "ampliar alcance antes de ordenar el seguimiento de clientes actuales", primaryKpi: "clientes que vuelven y tiempo entre visitas o compras" };
  if (type === "average_ticket") return { strategicBet: "aumentar el valor de cada compra con combinaciones útiles, no con descuentos generales", notPriority: "invertir primero en atraer más personas sin trabajar lo que compra cada una", primaryKpi: "valor promedio por compra" };
  if (type === "orders") return { strategicBet: `hacer más directo el paso hasta ${action} en el canal que ya usa la gente`, notPriority: "abrir canales nuevos antes de simplificar el pedido actual", primaryKpi: "pedidos completos y consultas que terminan en pedido" };
  if (type === "local_visits") return { strategicBet: demand ? "mover demanda hacia los días y momentos que hoy tienen capacidad disponible" : "convertir presencia local en visitas medibles", notPriority: "comunicar de la misma manera todos los días sin distinguir cuándo hace falta demanda", primaryKpi: "visitas al local en los períodos priorizados" };
  if (type === "appointments") return { strategicBet: `reducir dudas y hacer directo el paso para ${action}`, notPriority: "generar más alcance si el paso de reserva todavía no está validado", primaryKpi: profile.primaryResult };
  if (type === "consultations") return { strategicBet: "hacer reconocible el problema que resuelve el negocio y facilitar una consulta calificada", notPriority: "publicar contenido amplio sin conexión con una consulta concreta", primaryKpi: profile.primaryResult };
  if (type === "sales") return { strategicBet: "concentrar la propuesta en la oferta con mejor relación con el objetivo y medir compras reales", notPriority: "dispersar presupuesto entre muchas ofertas o canales", primaryKpi: profile.primaryResult };
  if (type === "awareness") return { strategicBet: "repetir una idea reconocible y comprobar si aumenta el descubrimiento del negocio", notPriority: "confundir visibilidad con resultados comerciales inmediatos", primaryKpi: "personas que descubren el negocio y luego avanzan" };
  return { strategicBet: `probar una mejora concreta en el recorrido hacia ${action} y medirla`, notPriority: budget === "none" ? "sumar herramientas o canales pagos" : "repartir recursos entre demasiadas iniciativas", primaryKpi: profile.primaryResult };
}

function outcomeFor(type: DecisionGoal, profile: BusinessProfile) {
  if (type === "recurrence") return "más clientes que vuelven";
  if (type === "average_ticket") return "un mayor valor por compra";
  if (type === "orders") return "más pedidos completos";
  if (type === "local_visits") return "más visitas al local";
  return profile.primaryResult;
}

function capacityLevel(value: string | null): CapacityBand {
  const text = normalize(value);
  if (!text) return "unknown";
  if (/baja|solo|lo hago yo|1 persona|poca|2.?3/.test(text)) return "low";
  if (/alta|grande|equipo completo|mas de 10/.test(text)) return "high";
  return "medium";
}

export function friendlyChannel(source: string) {
  return ({ web: "sitio web", instagram: "Instagram", search: "Google", reviews: "reseñas", competitor: "comparación local", external_mentions: "menciones externas", other: "información aportada" } as Record<string, string>)[source] || source;
}

function cleanOffer(profile: BusinessProfile) {
  const raw = profile.offerings.find((item) => item.trim().length > 2 && item.trim().length < 120) || profile.originalIndustry;
  return cleanPhrase(raw.split(/[.;\n]/)[0], 90);
}

function cleanPhrase(value: string, max: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const words = clean.split(" ");
  let result = "";
  for (const word of words) { if (`${result} ${word}`.trim().length > max) break; result = `${result} ${word}`.trim(); }
  return result || clean.slice(0, max);
}
