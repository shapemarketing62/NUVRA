export const money = (n: number) =>
  "$" + Math.round(n).toLocaleString("es-AR");

export const pct = (n: number, d = 1) => `${n > 0 ? "+" : ""}${n.toFixed(d)}%`;

export function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function normalizeUrl(url: string): string {
  let u = url.trim();
  if (!u) throw new Error("URL vacía");
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
}

export function parseJsonSafe<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export const OBJETIVOS = [
  "Aumentar ventas",
  "Generar más consultas",
  "Conseguir leads",
  "Aumentar reservas",
  "Aumentar reconocimiento",
  "Mejorar posicionamiento",
  "Aumentar tráfico a la web",
  "Aumentar conversión",
  "Crecer en redes",
  "Fidelizar clientes",
  "Lanzar un producto",
  "Otro",
] as const;

export const PLAZOS = [
  { id: "30d", label: "30 días", dias: 30 },
  { id: "3m", label: "3 meses", dias: 90 },
  { id: "6m", label: "6 meses", dias: 180 },
  { id: "12m", label: "12 meses", dias: 365 },
  { id: "custom", label: "Personalizado", dias: 0 },
] as const;

export const RUBROS = [
  "Cafetería",
  "Restaurante",
  "Peluquería / Estética",
  "Comercio",
  "Servicios profesionales",
  "Indumentaria",
  "Salud y bienestar",
  "Tecnología",
  "Otro",
] as const;

export const TIPO_CLIENTE = ["B2C", "B2B", "Ambos"] as const;

export const TAMANOS = [
  "Solo yo",
  "2–5 empleados",
  "6–15 empleados",
  "16–50 empleados",
  "Más de 50",
] as const;

export const CANALES = [
  "Instagram",
  "TikTok",
  "Google Business",
  "Facebook",
  "WhatsApp Business",
  "Página web",
  "Meta Ads",
  "Google Ads",
  "Otros",
] as const;

export const SCORE_DIMENSIONS = [
  { slug: "presencia", name: "Presencia Digital" },
  { slug: "conversion", name: "Conversión" },
  { slug: "posicionamiento", name: "Posicionamiento" },
  { slug: "propuesta", name: "Propuesta de Valor" },
  { slug: "redes", name: "Redes Sociales" },
  { slug: "adquisicion", name: "Adquisición" },
] as const;

export type ScoreDimensionSlug = (typeof SCORE_DIMENSIONS)[number]["slug"];
