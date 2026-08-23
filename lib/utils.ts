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
  "Conseguir más consultas",
  "Conseguir más ventas",
  "Conseguir más reservas",
  "Conseguir más clientes en el local",
  "Hacer que más clientes vuelvan",
  "Dar a conocer más el negocio",
  "Conseguir más presupuestos o reuniones",
  "Otro",
] as const;

export const PLAZOS = [
  { id: "30d", label: "30 días", dias: 30 },
  { id: "3m", label: "3 meses", dias: 90 },
  { id: "6m", label: "6 meses", dias: 180 },
  { id: "12m", label: "12 meses", dias: 365 },
  { id: "custom", label: "Otro", dias: 0 },
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
  { slug: "presencia", name: "Qué tan fácil es encontrarte" },
  { slug: "conversion", name: "Qué tan fácil es consultar, reservar o comprar" },
  { slug: "posicionamiento", name: "Qué tanta confianza y diferenciación generás" },
  { slug: "propuesta", name: "Qué tan claro queda lo que ofrecés" },
  { slug: "redes", name: "Qué tan útiles están siendo tus redes" },
  { slug: "adquisicion", name: "Qué capacidad tenés para atraer demanda" },
] as const;

export type ScoreDimensionSlug = (typeof SCORE_DIMENSIONS)[number]["slug"];
