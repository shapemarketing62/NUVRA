export type PlanTier = "FREE" | "PRO" | "PARTNER";

export type FeatureCategory = "analysis" | "workflow" | "reporting" | "integrations" | "workspace" | "ai";

export type EntitlementKey =
  | "analysis.basic"
  | "analysis.competitors"
  | "analysis.externalMentions"
  | "history.trend"
  | "diagnosis.full"
  | "actions.extended"
  | "tracking.progress"
  | "workspace.overview"
  | "workspace.compareAccounts"
  | "reports.export"
  | "reports.whiteLabel"
  | "integrations.standard"
  | "ai.nuvra"
  | "workspace.multiBusiness"
  | "workspace.multiClient"
  | "team.members"
  | "team.roles"
  | "branding.partner";

export interface FeatureDefinition {
  key: EntitlementKey;
  label: string;
  description: string;
  category: FeatureCategory;
  minimumPlan: PlanTier;
}

export type UsageLimitKey = "businesses" | "monthlyAnalyses" | "teamMembers" | "historicalMonths" | "activeActions" | "visibleCompetitors" | "monthlyReports" | "clients";
export type UsageLimits = Record<UsageLimitKey, number>;

export const FEATURES: Record<EntitlementKey, FeatureDefinition> = {
  "analysis.basic": { key: "analysis.basic", label: "Análisis básico", description: "Lectura esencial de presencia digital.", category: "analysis", minimumPlan: "FREE" },
  "analysis.competitors": { key: "analysis.competitors", label: "Competencia", description: "Competidores verificados y contexto de mercado.", category: "analysis", minimumPlan: "PRO" },
  "analysis.externalMentions": { key: "analysis.externalMentions", label: "Menciones externas", description: "Fuentes públicas relevantes sobre la marca.", category: "analysis", minimumPlan: "FREE" },
  "history.trend": { key: "history.trend", label: "Evolución", description: "Cambios del negocio a lo largo del tiempo.", category: "workflow", minimumPlan: "PRO" },
  "diagnosis.full": { key: "diagnosis.full", label: "Diagnóstico completo", description: "Problemas, oportunidades y contexto ampliado.", category: "analysis", minimumPlan: "PRO" },
  "actions.extended": { key: "actions.extended", label: "Plan de acción ampliado", description: "Más acciones priorizadas y seguimiento.", category: "workflow", minimumPlan: "PRO" },
  "tracking.progress": { key: "tracking.progress", label: "Seguimiento", description: "Estado y progreso de las acciones.", category: "workflow", minimumPlan: "PRO" },
  "workspace.overview": { key: "workspace.overview", label: "Panel general", description: "Vista central de todas las cuentas.", category: "workspace", minimumPlan: "PARTNER" },
  "workspace.compareAccounts": { key: "workspace.compareAccounts", label: "Comparación de cuentas", description: "Comparación entre negocios gestionados.", category: "workspace", minimumPlan: "PARTNER" },
  "reports.export": { key: "reports.export", label: "Exportaciones", description: "Exportación de análisis y resultados.", category: "reporting", minimumPlan: "PRO" },
  "reports.whiteLabel": { key: "reports.whiteLabel", label: "Reportes con tu marca", description: "Reportes preparados para clientes.", category: "reporting", minimumPlan: "PARTNER" },
  "integrations.standard": { key: "integrations.standard", label: "Integraciones", description: "Conexión con fuentes compatibles.", category: "integrations", minimumPlan: "PRO" },
  "ai.nuvra": { key: "ai.nuvra", label: "Nuvra AI", description: "Asistencia contextual cuando hay evidencia suficiente.", category: "ai", minimumPlan: "PRO" },
  "workspace.multiBusiness": { key: "workspace.multiBusiness", label: "Múltiples negocios", description: "Gestión de más de un negocio.", category: "workspace", minimumPlan: "PRO" },
  "workspace.multiClient": { key: "workspace.multiClient", label: "Múltiples clientes", description: "Organización de cuentas por cliente.", category: "workspace", minimumPlan: "PARTNER" },
  "team.members": { key: "team.members", label: "Equipo", description: "Acceso para colaboradores.", category: "workspace", minimumPlan: "PRO" },
  "team.roles": { key: "team.roles", label: "Roles y permisos", description: "Permisos diferenciados por integrante.", category: "workspace", minimumPlan: "PARTNER" },
  "branding.partner": { key: "branding.partner", label: "Identidad de agencia", description: "Personalización del espacio de trabajo.", category: "workspace", minimumPlan: "PARTNER" },
};

export interface PlanSnapshot {
  tier: PlanTier;
  label: string;
  audience: string;
  summary: string;
  limits: UsageLimits;
  entitlements: Record<EntitlementKey, boolean>;
  highlights: string[];
  limitations: string[];
}

export const PLAN_DEFINITIONS: Record<PlanTier, PlanSnapshot> = {
  FREE: {
    tier: "FREE",
    label: "Free",
    audience: "Para probar NUVRA con un negocio",
    summary: "Permite validar el diagnóstico base, entender el puntaje general y recibir pocas acciones prioritarias.",
    limits: {
      businesses: 1,
      monthlyAnalyses: 1,
      teamMembers: 1,
      historicalMonths: 0,
      activeActions: 3,
      visibleCompetitors: 1,
      monthlyReports: 0,
      clients: 1,
    },
    entitlements: {
      "analysis.basic": true,
      "analysis.competitors": false,
      "analysis.externalMentions": true,
      "history.trend": false,
      "diagnosis.full": false,
      "actions.extended": false,
      "tracking.progress": false,
      "workspace.overview": false,
      "workspace.compareAccounts": false,
      "reports.export": false,
      "reports.whiteLabel": false,
      "integrations.standard": false,
      "ai.nuvra": false,
      "workspace.multiBusiness": false,
      "workspace.multiClient": false,
      "team.members": false,
      "team.roles": false,
      "branding.partner": false,
    },
    highlights: [
      "1 negocio",
      "1 análisis mensual",
      "Digital Score y Nuvra Score cuando haya evidencia suficiente",
      "Diagnóstico resumido",
      "Acciones prioritarias",
    ],
    limitations: [
      "Sin evolución histórica",
      "Sin exportaciones",
      "Sin comparación de competencia",
      "Sin integraciones conectadas",
    ],
  },
  PRO: {
    tier: "PRO",
    label: "Pro",
    audience: "Para pequeñas empresas que trabajan activamente su marketing",
    summary: "Amplía el análisis, habilita seguimiento, competencia, reportes e integraciones operativas.",
    limits: {
      businesses: 5,
      monthlyAnalyses: 20,
      teamMembers: 3,
      historicalMonths: 12,
      activeActions: 30,
      visibleCompetitors: 10,
      monthlyReports: 10,
      clients: 1,
    },
    entitlements: {
      "analysis.basic": true,
      "analysis.competitors": true,
      "analysis.externalMentions": true,
      "history.trend": true,
      "diagnosis.full": true,
      "actions.extended": true,
      "tracking.progress": true,
      "workspace.overview": false,
      "workspace.compareAccounts": false,
      "reports.export": true,
      "reports.whiteLabel": false,
      "integrations.standard": true,
      "ai.nuvra": true,
      "workspace.multiBusiness": true,
      "workspace.multiClient": false,
      "team.members": true,
      "team.roles": true,
      "branding.partner": false,
    },
    highlights: [
      "Hasta 5 negocios",
      "Más fuentes y análisis frecuentes",
      "Competencia y evolución histórica",
      "Exportaciones y reportes",
      "Integraciones estándar",
      "Nuvra AI cuando corresponda",
    ],
    limitations: [
      "Sin white-label",
      "Sin gestión multi cliente avanzada",
    ],
  },
  PARTNER: {
    tier: "PARTNER",
    label: "Partner",
    audience: "Para agencias, consultores y equipos que administran múltiples cuentas",
    summary: "Agrega operación multi cliente, permisos de equipo, branding del partner y reportes reutilizables.",
    limits: {
      businesses: 100,
      monthlyAnalyses: 500,
      teamMembers: 25,
      historicalMonths: 24,
      activeActions: 500,
      visibleCompetitors: 25,
      monthlyReports: 200,
      clients: 100,
    },
    entitlements: {
      "analysis.basic": true,
      "analysis.competitors": true,
      "analysis.externalMentions": true,
      "history.trend": true,
      "diagnosis.full": true,
      "actions.extended": true,
      "tracking.progress": true,
      "workspace.overview": true,
      "workspace.compareAccounts": true,
      "reports.export": true,
      "reports.whiteLabel": true,
      "integrations.standard": true,
      "ai.nuvra": true,
      "workspace.multiBusiness": true,
      "workspace.multiClient": true,
      "team.members": true,
      "team.roles": true,
      "branding.partner": true,
    },
    highlights: [
      "Múltiples clientes y múltiples negocios",
      "Dashboard general y comparación entre cuentas",
      "Reportes white-label",
      "Permisos por equipo",
      "Branding del partner",
      "Límites mucho más altos",
    ],
    limitations: [],
  },
};

export function normalizePlanTier(value?: string | null): PlanTier {
  if (value === "PRO" || value === "PARTNER" || value === "FREE") {
    return value;
  }

  return "FREE";
}

export function getPlanSnapshot(tier?: string | null): PlanSnapshot {
  return PLAN_DEFINITIONS[normalizePlanTier(tier)];
}

export function hasEntitlement(
  plan: PlanTier | PlanSnapshot | string | null | undefined,
  entitlement: EntitlementKey,
  internalAccess = false
): boolean {
  if (internalAccess) return true;
  const snapshot = typeof plan === "object" && plan !== null && "entitlements" in plan ? plan : getPlanSnapshot(plan);
  return snapshot.entitlements[entitlement];
}

export function getUsageLimit(plan: PlanTier | PlanSnapshot | string | null | undefined, limit: UsageLimitKey): number {
  const snapshot = typeof plan === "object" && plan !== null && "limits" in plan ? plan : getPlanSnapshot(plan);
  return snapshot.limits[limit];
}

export function getMinimumPlan(feature: EntitlementKey): PlanTier {
  return FEATURES[feature].minimumPlan;
}

export function getPlanFeatures(tier: PlanTier): FeatureDefinition[] {
  const plan = PLAN_DEFINITIONS[tier];
  return Object.values(FEATURES).filter((feature) => plan.entitlements[feature.key]);
}

export function applyUsageLimit<T>(items: T[], plan: PlanTier | PlanSnapshot | string | null | undefined, limit: UsageLimitKey, internalAccess = false): T[] {
  if (internalAccess) return items;
  return items.slice(0, getUsageLimit(plan, limit));
}
