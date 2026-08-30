export type AnalysisFreshnessStatus =
  | "current"
  | "stale_due_to_business_change"
  | "stale_due_to_goal_change"
  | "stale_due_to_business_and_goal_change"
  | "no_analysis";

export interface AnalysisFreshnessView {
  status: AnalysisFreshnessStatus;
  needsReanalysis: boolean;
  changedFields: string[];
  analyzedGoal: string | null;
  currentGoal: string | null;
  analyzedAt: string | null;
}

type AnyRecord = Record<string, unknown>;
const record = (value: unknown): AnyRecord => value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const normalized = (value: unknown) => {
  if (Array.isArray(value)) return [...value].map(String).map((item) => item.trim().toLowerCase()).filter(Boolean).sort().join("|");
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/\/$/, "");
};

const BUSINESS_LABELS: Record<string, string> = {
  nombre: "nombre",
  rubro: "rubro",
  ubicacion: "ubicación",
  ciudad: "ciudad",
  pais: "país",
  empleados: "capacidad del equipo",
  webUrl: "página web",
  instagramHandle: "Instagram",
  noWebDeclared: "presencia web",
  noInstagramDeclared: "presencia en Instagram",
  canales: "canales",
  inversionMarketing: "inversión disponible",
};

const GOAL_LABELS: Record<string, string> = {
  objetivo: "objetivo",
  objetivoCustom: "detalle del objetivo",
  magnitud: "magnitud del objetivo",
  plazoDias: "plazo",
  plazoLabel: "plazo",
};

export function createAnalysisInputSnapshot(businessValue: unknown, goalValue: unknown) {
  const business = record(businessValue);
  const goal = record(goalValue);
  let channels: unknown = business.canales;
  if (typeof channels === "string") {
    try { channels = JSON.parse(channels); } catch { channels = []; }
  }
  return {
    version: 1,
    business: {
      nombre: text(business.nombre),
      rubro: text(business.rubro),
      ubicacion: text(business.ubicacion),
      ciudad: text(business.ciudad),
      pais: text(business.pais),
      empleados: text(business.empleados),
      webUrl: text(business.webUrl),
      instagramHandle: text(business.instagramHandle),
      noWebDeclared: business.noWebDeclared === true,
      noInstagramDeclared: business.noInstagramDeclared === true,
      canales: Array.isArray(channels) ? channels.map(String).filter(Boolean) : [],
      inversionMarketing: number(business.inversionMarketing),
    },
    goal: {
      objetivo: text(goal.objetivo),
      objetivoCustom: text(goal.objetivoCustom),
      magnitud: number(goal.magnitud),
      plazoDias: number(goal.plazoDias),
      plazoLabel: text(goal.plazoLabel),
    },
  };
}

function legacyAnalyzedInput(snapshotValue: unknown, scoreValue: unknown, strategyValue: unknown) {
  const snapshot = record(snapshotValue);
  const profile = record(snapshot.businessProfile);
  const profileGoal = record(profile.goal);
  const resources = record(profile.resources);
  const declarations = record(profile.channelDeclarations);
  const score = record(scoreValue);
  const strategy = record(strategyValue);
  return {
    version: 0,
    business: {
      nombre: text(profile.businessName),
      rubro: text(profile.originalIndustry),
      ubicacion: text(profile.location),
      empleados: text(resources.executionCapacity),
      inversionMarketing: number(resources.monthlyBudget),
      noWebDeclared: declarations.web === "absent",
      noInstagramDeclared: declarations.instagram === "absent",
    },
    goal: {
      objetivo: text(strategy.objetivo) || text(score.objetivo) || text(profileGoal.objective),
      plazoDias: number(score.plazoDias) ?? number(profileGoal.timeframeDays),
      plazoLabel: text(profileGoal.timeframeLabel),
    },
  };
}

export function buildAnalysisFreshness(input: {
  business: unknown;
  currentGoal: unknown;
  snapshot: unknown;
  score?: unknown;
  strategy?: unknown;
  analyzedAt?: string | null;
  hasAnalysis: boolean;
}): AnalysisFreshnessView {
  const current = createAnalysisInputSnapshot(input.business, input.currentGoal);
  if (!input.hasAnalysis) return {
    status: "no_analysis",
    needsReanalysis: false,
    changedFields: [],
    analyzedGoal: null,
    currentGoal: current.goal.objetivo,
    analyzedAt: null,
  };

  const snapshot = record(input.snapshot);
  const explicit = record(snapshot.analysisInput);
  const analyzed = Object.keys(explicit).length ? explicit : legacyAnalyzedInput(snapshot, input.score, input.strategy);
  const analyzedBusiness = record(analyzed.business);
  const analyzedGoal = record(analyzed.goal);
  const changedBusiness = Object.keys(BUSINESS_LABELS).filter((field) => field in analyzedBusiness && normalized(analyzedBusiness[field]) !== normalized(record(current.business)[field]));
  const changedGoal = Object.keys(GOAL_LABELS).filter((field) => field in analyzedGoal && normalized(analyzedGoal[field]) !== normalized(record(current.goal)[field]));
  const changedFields = Array.from(new Set([
    ...changedBusiness.map((field) => BUSINESS_LABELS[field]),
    ...changedGoal.map((field) => GOAL_LABELS[field]),
  ]));
  const status: AnalysisFreshnessStatus = changedBusiness.length && changedGoal.length
    ? "stale_due_to_business_and_goal_change"
    : changedGoal.length
      ? "stale_due_to_goal_change"
      : changedBusiness.length
        ? "stale_due_to_business_change"
        : "current";
  return {
    status,
    needsReanalysis: status !== "current",
    changedFields,
    analyzedGoal: text(analyzedGoal.objetivo),
    currentGoal: current.goal.objetivo,
    analyzedAt: input.analyzedAt || null,
  };
}
