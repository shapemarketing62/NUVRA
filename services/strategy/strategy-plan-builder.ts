import type { BusinessProfile } from "../intelligence/business-profile.ts";

export interface StrategyPlan {
  objective: string;
  whatWeFound: string;
  biggestOpportunity: string;
  priorities: string[];
  whatNotToDoYet: string[];
  phases: Array<{
    phase: string;
    timeframe: string;
    focus: string;
    actions: Array<{
      what: string;
      where: string;
      why: string;
      how: string;
      metric: string;
      when: string;
      successCriteria: string;
    }>;
  }>;
  measurementFocus: string;
}

export function buildStrategyPlan(profile: BusinessProfile | null, context: { objetivo: string; plazoLabel: string; magnitud?: number | null }, selectedActions: Array<{ title: string; description: string; timeframe: string; kpi: string; evidence: string }>): StrategyPlan {
  const phases = [
    {
      phase: "Primer mes",
      timeframe: context.plazoLabel.split("–")[0] || "Primer mes",
      focus: "Medir qué están generando hoy los canales actuales",
      actions: selectedActions.slice(0, 2).map((a) => ({
        what: a.title,
        where: extractWhere(a.description),
        why: a.evidence || concreteWhy(a.title),
        how: concise(a.description, 180, 2),
        metric: a.kpi,
        when: a.timeframe,
        successCriteria: baselineAwareSuccessCriteria(a.kpi),
      })),
    },
    {
      phase: "Segundo mes",
      timeframe: context.plazoLabel.includes("–") ? context.plazoLabel.split("–")[1] || "Segundo mes" : "Segundo mes",
      focus: "Trabajar los puntos observados donde ya existe oportunidad",
      actions: selectedActions.slice(2, 4).map((a) => ({
        what: a.title,
        where: extractWhere(a.description),
        why: a.evidence || concreteWhy(a.title),
        how: concise(a.description, 180, 2),
        metric: a.kpi,
        when: a.timeframe,
        successCriteria: baselineAwareSuccessCriteria(a.kpi),
      })),
    },
    {
      phase: "Tercer mes",
      timeframe: context.plazoLabel.includes("–") ? context.plazoLabel.split("–")[1] || "Tercer mes" : "Tercer mes",
      focus: "Comparar resultados y decidir qué conviene mantener",
      actions: selectedActions.slice(4, 6).map((a) => ({
        what: a.title,
        where: extractWhere(a.description),
        why: a.evidence || concreteWhy(a.title),
        how: concise(a.description, 180, 2),
        metric: a.kpi,
        when: a.timeframe,
        successCriteria: baselineAwareSuccessCriteria(a.kpi),
      })),
    },
  ];

  return {
    objective: `${context.objetivo}${context.magnitud ? ` (+${context.magnitud}%)` : ""} en ${context.plazoLabel}`,
    whatWeFound: concise(profile?.problemCandidates[0]?.hypothesis || "La información revisada alcanza para definir una prioridad.", 220, 2),
    biggestOpportunity: selectedActions[0]?.title || "Ordenar el paso hacia la consulta o compra",
    priorities: selectedActions.slice(0, 3).map((a) => a.title),
    whatNotToDoYet: [
      "No abrir canales nuevos sin confirmar que el recorrido actual funciona.",
      "Antes de aumentar la inversión en publicidad, conviene medir qué están generando hoy los canales actuales.",
    ],
    phases: phases.filter((phase) => phase.actions.length > 0),
    measurementFocus: selectedActions[0]?.kpi || profile?.primaryResult || "consultas recibidas",
  };
}

function concise(value: string | null | undefined, max: number, sentenceLimit = 2): string {
  if (!value) return "";
  const clean = value.replace(/\s+/g, " ").trim();
  const sentences = clean.match(/[^.!?]+[.!?]?/g)?.map((s) => s.trim()).filter(Boolean) || [];
  const selected: string[] = [];
  for (const sentence of sentences) {
    const candidate = [...selected, sentence].join(" ");
    if (candidate.length <= max && selected.length < sentenceLimit) selected.push(sentence);
    else break;
  }
  if (selected.length) return selected.join(" ").replace(/\s+([.,;:])/g, "$1");
  const first = clean.split(/[,;:]\s+/)[0] || clean;
  if (first.length <= max) return first;
  const words = first.split(/\s+/);
  while (words.length > 3 && words.join(" ").length > max) words.pop();
  return words.join(" ");
}

function extractWhere(description: string): string {
  const match = description.match(/en\s+([^.,;]+)/i);
  if (match) return concise(match[1], 80, 1);
  if (/página|tratamiento|servicio|producto/i.test(description)) return "las páginas del sitio";
  if (/instagram|bio|publicación/i.test(description)) return "el perfil de Instagram";
  if (/tiktok/i.test(description)) return "el perfil de TikTok";
  if (/google|búsqueda|search/i.test(description)) return "Google";
  if (/whatsapp|chat/i.test(description)) return "WhatsApp";
  if (/reseña|reputación/i.test(description)) return "las reseñas";
  return "el canal principal";
}

function baselineAwareSuccessCriteria(metric: string): string {
  const normalized = metric.toLowerCase();
  if (/visitas|consultas|turnos|reservas|reuniones|pedidos|compras/.test(normalized)) {
    return `Primero registrá durante 2 semanas cuántas ${metric} recibís y desde qué canal llegan. Esa será la base para comparar.`;
  }
  if (/alcance|reproducciones|seguidores|engagement/.test(normalized)) {
    return `Primero registrá durante 2 semanas el alcance o las reproducciones actuales. Después compará si la intervención aumenta ese número.`;
  }
  return `Definir una base simple y medir el cambio después de aplicar la intervención.`;
}

function concreteWhy(title: string): string {
  if (/google|búsqueda|posicionamiento/i.test(title)) return "La presencia en búsquedas locales es una de las formas en que personas nuevas conocen el negocio.";
  if (/whatsapp|contacto|celular/i.test(title)) return "Muchas consultas llegan por WhatsApp y un acceso directo reduce pasos.";
  if (/instagram|redes|tiktok/i.test(title)) return "Las redes pueden aportar reconocimiento, pero sin conexión no se puede medir su aporte real.";
  if (/reseña|reputación|confianza/i.test(title)) return "Las reseñas ayudan a decidir a personas que todavía no conocen el negocio.";
  if (/tratamiento|servicio|propuesta|oferta/i.test(title)) return "Una oferta clara ayuda a que una persona entienda rápido si este negocio puede ayudarla.";
  if (/medir|medición|seguimiento|planilla/i.test(title)) return "Sin datos reales no es posible decidir qué canal o cambio está funcionando.";
  return "La intervención responde a una señal observada en el negocio.";
}
