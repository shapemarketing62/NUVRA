import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transitionActionStatus } from "../lib/action-execution.ts";
import { buildAnalysisFreshness, createAnalysisInputSnapshot } from "../lib/analysis-freshness.ts";
import { buildDashboardViewModel } from "../lib/dashboard-view-model.ts";
import { buildEvolutionView } from "../lib/evolution-view.ts";
import { getDashboardNavigation } from "../lib/product-navigation.ts";

const dateA = "2026-07-01T10:00:00.000Z";
const dateB = "2026-08-01T10:00:00.000Z";

function analysisSnapshot({ method = "NUVRA_SCORE_V3", score = 60, objective = "Conseguir consultas", sourceStatuses = { web: "evaluated" } } = {}) {
  return {
    scoreMethodologyVersion: method,
    dimensions: [{ slug: "conversion", name: "Conversión", points: score, applicable: true }],
    intelligence: { coverage: 65, sourceStatuses, sourceMessages: {} },
    analysisInput: {
      business: { nombre: "Estudio Sur", rubro: "Servicios profesionales", webUrl: "https://example.test/", instagramHandle: null, noWebDeclared: false, noInstagramDeclared: true, channels: [] },
      goal: { objetivo: objective, objetivoCustom: null, magnitud: null, plazoDias: 90, plazoLabel: "3 meses" },
    },
    businessProfile: {
      goal: { objective, timeframeDays: 90, timeframeLabel: "3 meses" },
      commercialEvidence: [],
      problemCandidates: [],
    },
  };
}

function dashboardFixture(overrides = {}) {
  const snapshot = analysisSnapshot();
  return {
    id: "business-1",
    organizationId: "org-1",
    nombre: "Estudio Sur",
    rubro: "Servicios profesionales",
    webUrl: "https://example.test/",
    noWebDeclared: false,
    noInstagramDeclared: true,
    canales: "[]",
    goals: [{ objetivo: "Conseguir consultas", plazoDias: 90, plazoLabel: "3 meses" }],
    scores: [{ id: "score-b", total: 60, objetivo: "Conseguir consultas", createdAt: dateB, weights: JSON.stringify({ scoreMethodologyVersion: "NUVRA_SCORE_V3" }), dimensions: [{ slug: "conversion", name: "Conversión", points: 60, weight: 1, problems: "[]" }] }],
    diagnoses: [{ id: "diagnosis-b", summary: "Hay una oportunidad concreta.", bottleneck: JSON.stringify({ dimension: "conversion", title: "El contacto puede ser más directo", explanation: "El acceso principal no aparece al comienzo." }), priorities: JSON.stringify([{ title: "Aclarar el contacto", reason: "Acerca el objetivo.", order: 1 }, { title: "Segunda prioridad", reason: "Detalle", order: 2 }]), strengths: JSON.stringify([{ title: "Oferta clara", evidence: "La página explica el servicio." }]), weaknesses: JSON.stringify([{ title: "Contacto tardío", evidence: "El acceso aparece al final." }]), opportunities: JSON.stringify(["Hacer visible el contacto.", "Aclarar los tiempos de respuesta."]), risks: JSON.stringify(["Demora operativa"]) }],
    strategies: [{ id: "strategy-b", objetivo: "Conseguir consultas", situacionActual: "Situación actual", distanciaObjetivo: "Facilitar el contacto", prioridades: "[]", actions: [{ id: "action-b", title: "Hacer visible el contacto", status: "pending", done: false, order: 1 }] }],
    analysisHistory: [{ id: "history-b", strategyId: "strategy-b", createdAt: dateB, nuvraScoreTotal: 60, snapshot: JSON.stringify(snapshot) }],
    analysisRuns: [{ id: "run-b", status: "completed", completedAt: dateB }],
    planTier: "PRO",
    internalAccess: false,
    ...overrides,
  };
}

test("escenario 1 y 9: negocio analizado proyecta acciones pending y los datos parciales no inventan score", () => {
  const current = buildDashboardViewModel(dashboardFixture(), { canUpdateActions: true });
  assert.equal(current.actions[0].status, "pending");
  const partial = buildDashboardViewModel(dashboardFixture({ scores: [], diagnoses: [], strategies: [], analysisHistory: [{ id: "partial", createdAt: dateB, nuvraScoreTotal: null, snapshot: JSON.stringify(analysisSnapshot({ score: null, sourceStatuses: { web: "partial", instagram: "requires_auth" } })) }] }));
  assert.equal(partial.score, null);
  assert.equal(partial.sources.find((source) => source.key === "web")?.status, "partial");
  assert.doesNotMatch(JSON.stringify(partial), /"score":\{"total":(?:0|40|50)/);
});

test("escenario 2: ejecución conserva transiciones y timestamps al refrescar", () => {
  const started = transitionActionStatus({ status: "pending" }, "in_progress", new Date(dateA));
  const completed = transitionActionStatus(started, "completed", new Date(dateB));
  const refreshed = buildDashboardViewModel(dashboardFixture({ strategies: [{ id: "strategy-b", objetivo: "Conseguir consultas", actions: [{ id: "action-b", title: "Hacer visible el contacto", ...completed, updatedAt: dateB, order: 1 }] }] }), { canUpdateActions: true });
  assert.equal(refreshed.actions[0].status, "completed");
  assert.equal(refreshed.actions[0].startedAt, dateA);
  assert.equal(refreshed.actions[0].completedAt, dateB);
});

test("escenario 3: cambiar el objetivo marca stale y no reescribe la estrategia histórica", () => {
  const input = dashboardFixture({ goals: [{ objetivo: "Aumentar la recompra", plazoDias: 90, plazoLabel: "3 meses" }] });
  const view = buildDashboardViewModel(input);
  assert.equal(view.analysisFreshness.status, "stale_due_to_goal_change");
  assert.equal(view.analysisFreshness.analyzedGoal, "Conseguir consultas");
  assert.equal(view.analysisFreshness.currentGoal, "Aumentar la recompra");
  assert.equal(view.canonicalStrategy?.objective, "Conseguir consultas");
});

test("escenario 4: un reanálisis vuelve a current, crea acciones nuevas y preserva la estrategia anterior", () => {
  const oldAction = { id: "action-a", title: "Acción anterior", status: "completed", done: true, completedAt: dateA, order: 1 };
  const snapshot = analysisSnapshot({ objective: "Aumentar la recompra", score: 68 });
  const input = dashboardFixture({
    goals: [{ objetivo: "Aumentar la recompra", plazoDias: 90, plazoLabel: "3 meses" }],
    scores: [{ id: "score-c", total: 68, objetivo: "Aumentar la recompra", createdAt: dateB, weights: JSON.stringify({ scoreMethodologyVersion: "NUVRA_SCORE_V3" }), dimensions: [] }],
    strategies: [
      { id: "strategy-c", objetivo: "Aumentar la recompra", actions: [{ id: "action-c", title: "Nueva acción", status: "pending", done: false, order: 1 }] },
      { id: "strategy-a", objetivo: "Conseguir consultas", actions: [oldAction] },
    ],
    analysisHistory: [
      { id: "history-c", strategyId: "strategy-c", createdAt: dateB, nuvraScoreTotal: 68, snapshot: JSON.stringify(snapshot) },
      { id: "history-a", strategyId: "strategy-a", createdAt: dateA, nuvraScoreTotal: 60, snapshot: JSON.stringify(analysisSnapshot()) },
    ],
  });
  const view = buildDashboardViewModel(input);
  assert.equal(view.analysisFreshness.status, "current");
  assert.equal(view.actions[0].id, "action-c");
  assert.equal(view.actions[0].status, "pending");
  assert.equal(input.strategies[1].actions[0].status, "completed");
  assert.equal(view.evolution.hasComparison, true);
});

test("escenario 5: una metodología incompatible conserva historial y elimina el delta", () => {
  const evolution = buildEvolutionView({ history: [
    { id: "v3", createdAt: dateB, nuvraScoreTotal: 62, snapshot: JSON.stringify(analysisSnapshot({ method: "V3" })) },
    { id: "v2", createdAt: dateA, nuvraScoreTotal: 55, snapshot: JSON.stringify(analysisSnapshot({ method: "V2" })) },
  ] });
  assert.equal(evolution.history.length, 2);
  assert.equal(evolution.globalDelta, null);
});

test("escenarios 6, 7 y 8: navegación y proyección respetan Free, Pro, Partner e Internal", () => {
  const paths = (plan, internal = false) => getDashboardNavigation(plan, internal).flatMap((group) => group.items.map((item) => item.href));
  assert.equal(paths("FREE").includes("/dashboard/competencia"), false);
  assert.equal(paths("FREE").includes("/dashboard/shape-partner"), false);
  assert.equal(paths("PRO").includes("/dashboard/competencia"), true);
  assert.equal(paths("PRO").includes("/dashboard/shape-partner"), false);
  assert.equal(paths("PARTNER").includes("/dashboard/shape-partner"), true);
  assert.equal(paths("FREE", true).includes("/dashboard/shape-partner"), true);

  const free = buildDashboardViewModel(dashboardFixture({ planTier: "FREE" }), { canUpdateActions: true });
  assert.equal(free.actions[0].canUpdateStatus, false);
  assert.equal(free.diagnosis?.strengths.length, 0);
  assert.equal(free.diagnosis?.priorities.length, 1);
  const internal = buildDashboardViewModel(dashboardFixture({ planTier: "FREE", internalAccess: true }), { canUpdateActions: true });
  assert.equal(internal.actions[0].canUpdateStatus, true);
  assert.equal(internal.diagnosis?.strengths.length, 1);
});

test("escenario 10: negocio y acción legacy se normalizan sin romper", () => {
  const legacy = buildDashboardViewModel({ nombre: "Legacy", rubro: "", goals: [{}], scores: [], diagnoses: [], strategies: [{ id: "old", actions: [{ id: "done", title: "Acción histórica", done: true }] }], analysisHistory: [{ id: "old-history", createdAt: dateA, snapshot: null, nuvraScoreTotal: null }], planTier: "FREE" });
  assert.equal(legacy.actions[0].status, "completed");
  assert.equal(legacy.score, null);
  assert.ok(["unknown_legacy", "stale_due_to_business_change"].includes(legacy.analysisFreshness.status));
});

test("la proyección pública usa un contrato raíz explícito y excluye internals", () => {
  const view = buildDashboardViewModel(dashboardFixture());
  assert.deepEqual(Object.keys(view).sort(), [
    "actions", "actionsSummary", "analysis", "analysisFreshness", "business", "businessUnderstanding",
    "canonicalDiagnosis", "canonicalStrategy", "competition", "competitionSummary", "diagnosis", "evidence",
    "evolution", "evolutionSummary", "history", "intelligence", "internalAccess", "isDemo", "plan", "planTier",
    "score", "sources", "strategy",
  ].sort());
  const serialized = JSON.stringify(view);
  for (const forbidden of ["analysisTrace", "analysisAudit", "prompts", "sourceQuality", "evidenceCeiling", "lineage", "accessToken", "refreshToken", "tokenHash", "passwordHash", "encryptedData", "entityConfidenceReasons"]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden, "i"));
  }
});

test("las APIs sensibles aplican ownership, rol y entitlement del lado servidor", async () => {
  const read = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const business = await read("app/api/business/route.ts");
  const actions = await read("app/api/actions/[id]/status/route.ts");
  const integrations = await read("app/api/integrations/route.ts");
  const instagram = await read("app/api/instagram/connect/route.ts");
  const partner = await read("app/api/partner/service/route.ts");
  assert.match(business, /authorizeBusiness\(id, "business\.read"\)/);
  assert.match(business, /instagramConnection:\s*\{\s*select:/s);
  assert.doesNotMatch(business.match(/instagramConnection:\s*\{\s*select:[\s\S]*?\}\s*,/m)?.[0] || "", /accessToken/);
  assert.doesNotMatch(business, /analysisHistory:\s*\{/);
  assert.match(actions, /authorizeBusiness\(action\.strategy\.businessId, "business\.update", "tracking\.progress"\)/);
  assert.match(integrations, /authorizeBusiness\(businessId, "business\.read", "integrations\.standard"\)/);
  assert.match(instagram, /authorizeBusiness\(businessId, "business\.read", "integrations\.standard"\)/);
  assert.match(partner, /authorizeBusiness\(businessId, "business\.read", "workspace\.overview"\)/);
  assert.match(partner, /status: "pending"/);
});

test("una auditoría secundaria no puede transformar una escritura persistida en un falso error", async () => {
  const business = await readFile(new URL("../app/api/business/route.ts", import.meta.url), "utf8");
  assert.match(business, /negocio ya fue persistido/);
  assert.match(business, /edición ya quedó persistida/);
  assert.match(business, /eliminación ya ocurrió/);
});

test("un análisis nuevo toma un snapshot nuevo y freshness vuelve a current", () => {
  const changedBusiness = { nombre: "Estudio Sur", rubro: "Consultoría", webUrl: "https://new.example/", noWebDeclared: false, instagramHandle: null, noInstagramDeclared: true, canales: "[]" };
  const changedGoal = { objetivo: "Aumentar la recompra", plazoDias: 120, plazoLabel: "4 meses" };
  const oldSnapshot = { analysisInput: createAnalysisInputSnapshot({ ...changedBusiness, rubro: "Servicios", webUrl: "https://old.example/" }, { ...changedGoal, objetivo: "Conseguir consultas" }) };
  const stale = buildAnalysisFreshness({ business: changedBusiness, currentGoal: changedGoal, snapshot: oldSnapshot, hasAnalysis: true });
  assert.equal(stale.status, "stale_due_to_business_and_goal_change");
  const newSnapshot = { analysisInput: createAnalysisInputSnapshot(changedBusiness, changedGoal) };
  const current = buildAnalysisFreshness({ business: changedBusiness, currentGoal: changedGoal, snapshot: newSnapshot, hasAnalysis: true });
  assert.equal(current.status, "current");
});
