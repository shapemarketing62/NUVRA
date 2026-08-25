export type GoalType = "sales" | "reservations" | "consultations" | "visits" | "retention" | "awareness" | "larger_clients" | "growth" | "unknown";
export type GoalScope = "general" | "low_demand_periods" | "frequency" | "geography" | "customer_segment" | "channel_dependency";

export interface GoalConstraint {
  type: "budget" | "channel_dependency" | "capacity" | "time";
  value: string;
}

export interface GoalInterpretation {
  goalOriginalText: string;
  goalType: GoalType;
  goalScope: GoalScope[];
  targetAmount: number | null;
  targetMetric: "clients" | "sales" | "reservations" | "consultations" | "visits" | null;
  targetDays: string[];
  desiredFrequencyMonths: number | null;
  desiredCustomer: string | null;
  geography: string | null;
  channelToReduce: string | null;
  constraints: GoalConstraint[];
  confidence: number;
  clarificationQuestion: string | null;
  evidence: string[];
}

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const DAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

export class GoalInterpreter {
  static interpret(originalText: string): GoalInterpretation {
    const goalOriginalText = originalText.trim();
    const text = normalize(goalOriginalText);
    const matches: Array<{ type: GoalType; score: number; reason: string }> = [];
    const add = (type: GoalType, pattern: RegExp, score: number, reason: string) => { if (pattern.test(text)) matches.push({ type, score, reason }); };
    add("retention", /vuelv|volver|recompra|renov|fidel|cada\s+\d+\s+mes|clientes actuales|pacientes vuelvan/, 4, "El objetivo describe repetición o continuidad.");
    add("reservations", /turno|reserv|agenda|cupo|clase/, 3, "El resultado buscado se expresa como turnos o reservas.");
    add("consultations", /consulta|reunion|presupuesto|lead|contact|mensaje|empresas? .*clientes?/, 3, "El resultado buscado requiere una consulta o reunión.");
    add("sales", /vend|venta|factur|pedido|compras?/, 3, "El resultado buscado está relacionado con ventas o pedidos.");
    add("visits", /visitas?|local|mesas?|salon/, 2.5, "El objetivo busca visitas al negocio físico.");
    add("awareness", /conocid|reconoc|visibilidad|marca|aparecer|presencia/, 3, "El objetivo busca reconocimiento o visibilidad.");
    add("larger_clients", /empresas? (mas )?grandes|clientes? (mas )?grandes|cuentas? grandes|corporativ/, 4, "El objetivo especifica un segmento de clientes de mayor tamaño.");
    add("growth", /crecer|crecimiento|mejorar|mas clientes|clientes nuevos|nuevos clientes/, 3, "El objetivo expresa crecimiento en cantidad de clientes.");

    const grouped = new Map<GoalType, number>();
    for (const match of matches) grouped.set(match.type, (grouped.get(match.type) || 0) + match.score);
    const goalType = Array.from(grouped.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";
    const scopes = new Set<GoalScope>();
    const mentionedDays = new Set(DAYS.filter((day) => text.includes(normalize(day))));
    const rangeMatch = text.match(/(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s+(?:a|hasta)\s+(lunes|martes|miercoles|jueves|viernes|sabado|domingo)/);
    if (rangeMatch) {
      const start = DAYS.findIndex((day) => normalize(day) === rangeMatch[1]);
      const end = DAYS.findIndex((day) => normalize(day) === rangeMatch[2]);
      if (start >= 0 && end >= start) for (const day of DAYS.slice(start, end + 1)) mentionedDays.add(day);
    }
    const targetDays = DAYS.filter((day) => mentionedDays.has(day));
    if (targetDays.length || /dias? (con )?menos|baja demanda|horarios? flojos?/.test(text)) scopes.add("low_demand_periods");
    const frequencyMatch = text.match(/cada\s+(\d{1,2})\s+mes/);
    if (frequencyMatch || goalType === "retention") scopes.add("frequency");
    if (/sin depender|depender menos|reducir.*depend/.test(text)) scopes.add("channel_dependency");
    if (goalType === "larger_clients") scopes.add("customer_segment");
    const geographyMatch = goalOriginalText.match(/(?:en|de)\s+([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ\s-]{2,40})(?:[.,]|$)/);
    if (geographyMatch && !/Instagram|Google|Facebook|TikTok|LinkedIn/i.test(geographyMatch[1])) scopes.add("geography");
    if (!scopes.size) scopes.add("general");

    const amountMatch = text.match(/\b(\d{1,5})\s+(clientes?|turnos?|reservas?|consultas?|ventas?|visitas?)\b/);
    const channelMatch = goalOriginalText.match(/(?:sin depender(?: tanto)? de|depender menos de)\s+([A-Za-zÁÉÍÓÚÑáéíóúñ0-9 ]{2,30})/i);
    const constraints: GoalConstraint[] = [];
    if (/sin gastar mas|sin aumentar.*publicidad|sin mas presupuesto|sin invertir mas/.test(text)) constraints.push({ type: "budget", value: "no aumentar la inversión" });
    if (channelMatch) constraints.push({ type: "channel_dependency", value: channelMatch[1].trim() });
    if (/sin sumar (personal|equipo)|con el equipo actual/.test(text)) constraints.push({ type: "capacity", value: "usar la capacidad actual" });

    const targetMetric = amountMatch ? metricFor(amountMatch[2]) : metricForType(goalType);
    const confidence = confidenceFor(goalOriginalText, matches, scopes, amountMatch, targetDays);
    const vague = goalType === "unknown" || (goalType === "growth" && !amountMatch && scopes.has("general"));
    return {
      goalOriginalText,
      goalType,
      goalScope: Array.from(scopes),
      targetAmount: amountMatch ? Number(amountMatch[1]) : null,
      targetMetric,
      targetDays,
      desiredFrequencyMonths: frequencyMatch ? Number(frequencyMatch[1]) : null,
      desiredCustomer: goalType === "larger_clients" ? "empresas o clientes de mayor tamaño" : null,
      geography: scopes.has("geography") ? geographyMatch?.[1]?.trim() || null : null,
      channelToReduce: channelMatch?.[1]?.trim() || null,
      constraints,
      confidence,
      clarificationQuestion: vague ? "¿Qué te gustaría que crezca principalmente: ventas, consultas, visitas o clientes que vuelven?" : null,
      evidence: Array.from(new Set(matches.map((match) => match.reason))),
    };
  }
}

export function goalAreaRelevance(goal: GoalInterpretation): Record<string, number> {
  const base = { presencia: .65, conversion: .7, posicionamiento: .65, propuesta: .7, redes: .5, adquisicion: .65, retencion: .45, identidad: .55 };
  if (goal.goalType === "retention") Object.assign(base, { retencion: 1, conversion: .55, propuesta: .65, adquisicion: .25, presencia: .3 });
  else if (goal.goalType === "awareness") Object.assign(base, { presencia: .95, identidad: 1, posicionamiento: .9, redes: .75, adquisicion: .8, conversion: .35 });
  else if (goal.goalType === "larger_clients") Object.assign(base, { posicionamiento: 1, propuesta: 1, conversion: .9, adquisicion: .8, presencia: .55, retencion: .45 });
  else if (["sales", "reservations", "consultations", "visits"].includes(goal.goalType)) Object.assign(base, { conversion: 1, adquisicion: .9, propuesta: .82, presencia: goal.goalType === "visits" ? .95 : .7, posicionamiento: .72, retencion: .35 });
  if (goal.goalScope.includes("low_demand_periods")) Object.assign(base, { conversion: 1, adquisicion: .95, retencion: .6 });
  if (goal.goalScope.includes("channel_dependency")) Object.assign(base, { adquisicion: 1, presencia: .85, redes: .65 });
  return base;
}

function metricFor(value: string): GoalInterpretation["targetMetric"] {
  const text = normalize(value);
  if (/cliente/.test(text)) return "clients";
  if (/turno|reserva/.test(text)) return "reservations";
  if (/consulta/.test(text)) return "consultations";
  if (/visita/.test(text)) return "visits";
  if (/venta/.test(text)) return "sales";
  return null;
}

function metricForType(type: GoalType): GoalInterpretation["targetMetric"] {
  if (type === "reservations") return "reservations";
  if (type === "consultations" || type === "larger_clients") return "consultations";
  if (type === "sales") return "sales";
  if (type === "visits") return "visits";
  if (type === "growth") return "clients";
  return null;
}

function confidenceFor(text: string, matches: Array<{ type: GoalType }>, scopes: Set<GoalScope>, amount: RegExpMatchArray | null, days: string[]) {
  if (!text) return 0;
  const typeDiversity = new Set(matches.map((match) => match.type)).size;
  const specificity = (amount ? .15 : 0) + (days.length ? .12 : 0) + (scopes.size > 1 || !scopes.has("general") ? .12 : 0);
  return Math.min(.95, Math.round((.35 + Math.min(.35, matches.length * .12) + specificity - Math.max(0, typeDiversity - 2) * .08) * 100) / 100);
}
