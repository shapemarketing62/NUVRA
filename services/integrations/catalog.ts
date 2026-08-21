import type { IntegrationProvider, IntegrationStatus } from "./contracts";

export interface IntegrationDefinition {
  provider: IntegrationProvider;
  name: string;
  contribution: string;
  scope: "business" | "organization";
  optional: boolean;
}

export const INTEGRATION_CATALOG: readonly IntegrationDefinition[] = [
  { provider: "google_places", name: "Google Places y reseñas", contribution: "Reputación pública, volumen de reseñas y contexto de ubicación.", scope: "business", optional: false },
  { provider: "instagram", name: "Instagram", contribution: "Actividad, publicaciones, frecuencia y engagement disponible.", scope: "business", optional: true },
  { provider: "google_business_profile", name: "Google Business Profile", contribution: "Datos verificados del perfil comercial y sus ubicaciones.", scope: "business", optional: true },
  { provider: "google_analytics", name: "Google Analytics 4", contribution: "Tráfico propio, adquisición, eventos y conversiones.", scope: "business", optional: true },
  { provider: "google_search_console", name: "Google Search Console", contribution: "Clicks, impresiones, consultas, páginas, CTR y posición orgánica.", scope: "business", optional: true },
  { provider: "x", name: "X", contribution: "Conversación y actividad social cuando es relevante para el negocio.", scope: "business", optional: true },
] as const;

export const SAFE_STATUS_LABELS: Record<IntegrationStatus, string> = {
  connected: "Conectada", disconnected: "Desconectada", requires_auth: "Requiere autorización",
  expired: "Necesita reconexión", error: "Necesita atención", unavailable: "No disponible",
};
