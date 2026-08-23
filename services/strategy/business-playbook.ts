export type CommercialModel = "appointments" | "reservations" | "commerce" | "membership" | "professional" | "local_service" | "general";

export interface BusinessPlaybook {
  model: CommercialModel;
  inferredCategory: string;
  primaryAction: string;
  primaryResult: string;
  recurrence: "frequent" | "periodic" | "membership" | "occasional" | "unknown";
  areaRelevance: Record<string, number>;
}

const PLAYBOOKS: Record<CommercialModel, Omit<BusinessPlaybook, "model">> = {
  appointments: { inferredCategory: "servicios con turnos", primaryAction: "pedir un turno", primaryResult: "turnos solicitados", recurrence: "periodic", areaRelevance: { presencia: .75, conversion: 1, posicionamiento: .9, propuesta: .85, redes: .7, adquisicion: .8, retencion: .8 } },
  reservations: { inferredCategory: "negocio local con reservas o pedidos", primaryAction: "reservar o hacer un pedido", primaryResult: "reservas o pedidos", recurrence: "frequent", areaRelevance: { presencia: 1, conversion: 1, posicionamiento: .8, propuesta: .75, redes: .8, adquisicion: .95, retencion: .7 } },
  commerce: { inferredCategory: "venta de productos", primaryAction: "completar una compra", primaryResult: "compras completadas", recurrence: "periodic", areaRelevance: { presencia: .75, conversion: 1, posicionamiento: .8, propuesta: 1, redes: .65, adquisicion: .9, retencion: .9 } },
  membership: { inferredCategory: "servicio por membresía", primaryAction: "probar el servicio o asociarse", primaryResult: "pruebas y nuevas membresías", recurrence: "membership", areaRelevance: { presencia: .8, conversion: 1, posicionamiento: .8, propuesta: .9, redes: .8, adquisicion: .8, retencion: 1 } },
  professional: { inferredCategory: "servicio profesional", primaryAction: "solicitar una consulta o reunión", primaryResult: "consultas o reuniones solicitadas", recurrence: "occasional", areaRelevance: { presencia: .7, conversion: .9, posicionamiento: 1, propuesta: 1, redes: .35, adquisicion: .75, retencion: .55 } },
  local_service: { inferredCategory: "servicio local", primaryAction: "consultar o visitar el negocio", primaryResult: "consultas o visitas", recurrence: "periodic", areaRelevance: { presencia: 1, conversion: .85, posicionamiento: .8, propuesta: .75, redes: .55, adquisicion: .9, retencion: .7 } },
  general: { inferredCategory: "negocio de servicios o productos", primaryAction: "dar el próximo paso", primaryResult: "consultas, reservas o compras", recurrence: "unknown", areaRelevance: { presencia: .8, conversion: .85, posicionamiento: .8, propuesta: .85, redes: .6, adquisicion: .8, retencion: .65 } },
};

const MODEL_SIGNALS: Array<{ model: CommercialModel; pattern: RegExp; weight: number }> = [
  { model: "appointments", pattern: /turno|paciente|tratamiento|consulta m[eé]dica|odont|cl[ií]nic|salud|est[eé]tic|peluquer|terapia/, weight: 3 },
  { model: "reservations", pattern: /reserv|mesa|pedido|men[uú]|restaurante|caf[eé]|gastronom|bar|hotel|alojamiento/, weight: 3 },
  { model: "commerce", pattern: /compr|producto|carrito|env[ií]o|tienda|e.?commerce|venta online|cat[aá]logo/, weight: 3 },
  { model: "membership", pattern: /membres[ií]a|socio|cuota|clase|gimnas|fitness|academia|club/, weight: 3 },
  { model: "professional", pattern: /reuni[oó]n|presupuesto|empresa|b2b|estudio|consultor|abogad|contador|contable|software|agencia/, weight: 3 },
  { model: "local_service", pattern: /local|visita|domicilio|zona|barrio|cerrajer|taller|reparaci[oó]n|imprenta|servicio/, weight: 2 },
];

export function selectBusinessPlaybook(text: string): BusinessPlaybook {
  const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const scores = new Map<CommercialModel, number>();
  for (const signal of MODEL_SIGNALS) {
    if (signal.pattern.test(normalized)) scores.set(signal.model, (scores.get(signal.model) || 0) + signal.weight);
  }
  const model: CommercialModel = Array.from(scores.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "general";
  return { model, ...PLAYBOOKS[model] };
}

export function getGoalAreaRelevance(goal: string): Record<string, number> {
  const text = goal.toLowerCase();
  if (/volver|vuelv|recompra|renov|recurren|fideliza|clientes actuales|socios actuales/.test(text)) return { presencia: .35, conversion: .55, posicionamiento: .55, propuesta: .65, redes: .45, adquisicion: .25, retencion: 1 };
  if (/marca|reconoc|confianza|reputaci|posicion/.test(text)) return { presencia: .7, conversion: .55, posicionamiento: 1, propuesta: .9, redes: .85, adquisicion: .7, retencion: .45 };
  if (/consulta|turno|reserv|socio|venta|compr|cliente|reuni[oó]n|presupuesto/.test(text)) return { presencia: .7, conversion: 1, posicionamiento: .7, propuesta: .85, redes: .55, adquisicion: .9, retencion: .35 };
  return { presencia: .7, conversion: .8, posicionamiento: .75, propuesta: .8, redes: .6, adquisicion: .75, retencion: .55 };
}

export function getGoalAdjustedAction(playbook: BusinessPlaybook, goal: string): { action: string; result: string } {
  if (!/volver|vuelv|recompra|renov|recurren|fideliza|clientes actuales|socios actuales/i.test(goal)) return { action: playbook.primaryAction, result: playbook.primaryResult };
  if (playbook.model === "membership") return { action: "renovar su membresía", result: "membresías renovadas" };
  if (playbook.model === "appointments") return { action: "volver para una nueva atención", result: "clientes que vuelven a atenderse" };
  if (playbook.model === "commerce") return { action: "volver a comprar", result: "compras repetidas" };
  if (playbook.model === "reservations") return { action: "volver a reservar o pedir", result: "clientes que vuelven" };
  if (playbook.model === "professional") return { action: "continuar trabajando con el negocio", result: "clientes que continúan" };
  return { action: "volver", result: "clientes que vuelven" };
}
