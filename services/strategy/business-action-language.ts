export interface BusinessActionContext {
  rubro: string;
  tipoCliente?: string | null;
  presupuesto?: number | null;
  capacidad?: string | null;
  objetivo?: string;
  ubicacion?: string | null;
}

export function getPrimaryBusinessStep(context: BusinessActionContext): { action: string; result: string } {
  const sector = `${context.rubro} ${context.tipoCliente || ""}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/clinic|medic|estetic|salud|dent/.test(sector)) return { action: "Pedir turno", result: "turnos solicitados" };
  if (/gimnas|fitness|entren/.test(sector)) return { action: "Reservar una clase", result: "clases de prueba reservadas" };
  if (/restaurante|cafe|gastronom|comida/.test(sector)) return { action: "Reservar mesa o hacer un pedido", result: "reservas y pedidos" };
  if (/ecom|tienda|retail|shop/.test(sector)) return { action: "Comprar", result: "compras iniciadas y completadas" };
  if (/b2b|empresa|corporativo|consultor/.test(sector)) return { action: "Solicitar una reunión", result: "reuniones comerciales solicitadas" };
  return { action: "Consultar", result: "consultas recibidas" };
}

export function hasConstrainedExecution(context: BusinessActionContext): boolean {
  return (context.presupuesto !== null && context.presupuesto !== undefined && context.presupuesto < 500)
    || /pequeñ|solo|1-|micro/i.test(context.capacidad || "");
}

export function isRetentionObjective(context: BusinessActionContext): boolean {
  return /recompra|retenci|volver|recurren|clientes actuales|fideliza/i.test(context.objetivo || "");
}

export function getLocalMarketLabel(context: BusinessActionContext): string {
  return context.ubicacion?.trim() || "la zona donde opera el negocio";
}

export function getBudgetFocus(context: BusinessActionContext): string {
  const budget = context.presupuesto ?? 0;
  if (budget <= 0) return "Con el presupuesto actual, conviene concentrarse en Google/Maps, reseñas, WhatsApp y mejoras propias antes de pagar publicidad.";
  const sector = context.rubro.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/ecom|tienda|indumentaria|producto|retail/.test(sector)) return `Con unos USD ${Math.round(budget)} por mes, conviene probar un solo grupo de productos y una sola campaña medible, sin repartir el dinero entre varias plataformas.`;
  if (/clinic|estetic|salud|gimnas|restaurante|cafe|comercio|local/.test(sector)) return `Con unos USD ${Math.round(budget)} por mes, conviene concentrar la inversión en búsquedas locales y una campaña pequeña para personas de ${getLocalMarketLabel(context)}, después de simplificar el camino para consultar o reservar.`;
  return `Con unos USD ${Math.round(budget)} por mes, conviene elegir un solo canal donde ya exista intención y medir consultas reales antes de ampliar la inversión.`;
}

export function isSpecificBusinessAction(action: { title?: string; description?: string; rationale?: string; evidence?: string; kpi?: string }): boolean {
  const title = action.title?.trim() || "";
  const genericOnly = /^(mejorar (redes|seo)|publicar contenido|optimizar (la )?web|hacer publicidad)$/i.test(title);
  return !genericOnly
    && title.length >= 18
    && (action.description?.trim().length || 0) >= 45
    && (action.rationale?.trim().length || 0) >= 35
    && (action.evidence?.trim().length || 0) >= 10
    && (action.kpi?.trim().length || 0) >= 5;
}
