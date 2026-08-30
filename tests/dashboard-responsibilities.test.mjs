import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildDashboardViewModel } from "../lib/dashboard-view-model.ts";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const summary = read("app/dashboard/page.tsx");
const diagnosis = read("app/dashboard/diagnostico/page.tsx");
const strategy = read("app/dashboard/estrategia/page.tsx");
const actions = read("app/dashboard/acciones/page.tsx");

test("A y J: Resumen no contiene fallback 40 y presenta score null como ausencia", () => {
  assert.doesNotMatch(summary, /\?\?\s*40|\|\|\s*40|points\s*\?\?\s*40/);
  assert.match(summary, /ScoreRing value=\{score\?\.total \?\? null\}/);
  assert.match(summary, /Sin áreas evaluables/);
});

test("B: Resumen usa la conclusión y la acción canónicas", () => {
  assert.match(summary, /canonicalDiagnosis\.mainConclusion/);
  assert.match(summary, /actionsSummary\.immediateAction/);
  assert.doesNotMatch(summary, /presentProblem|diagnosis\?\.bottleneck|diagnosis\?\.weaknesses/);
});

test("C: Diagnóstico usa fortalezas y oportunidades canónicas", () => {
  assert.match(diagnosis, /canonicalDiagnosis\.strengths/);
  assert.match(diagnosis, /canonicalDiagnosis\.frictions/);
  assert.match(diagnosis, /canonicalDiagnosis\.opportunities/);
  assert.match(diagnosis, /canonicalDiagnosis\.unknowns/);
});

test("D: Diagnóstico explica evidencia pero no genera estrategia ni tareas", () => {
  assert.match(diagnosis, /evidence\.filter/);
  assert.match(diagnosis, /Qué observamos/);
  assert.match(diagnosis, /Qué significa/);
  assert.doesNotMatch(diagnosis, /canonicalStrategy|strategy\.|diagnosis\.priorities|Orden recomendado|Paso \{/);
});

test("E y F: Estrategia consume canonicalStrategy y no recalcula problema o score", () => {
  assert.match(strategy, /canonicalStrategy\.direction/);
  assert.match(strategy, /canonicalStrategy\.problemOfOrigin/);
  assert.match(strategy, /canonicalStrategy\.kpi/);
  assert.doesNotMatch(strategy, /diagnosis|score|principalProblema|prioridades\.map|presentProblem/);
});

test("G: Acciones muestra únicamente acciones persistidas del ViewModel", () => {
  assert.match(actions, /const \{ actions, canonicalStrategy/);
  assert.match(actions, /action\.rationale/);
  assert.match(actions, /action\.indicatorToImprove/);
  assert.match(actions, /action\.dependencies/);
  assert.match(actions, /action\.relatedConclusion/);
  assert.doesNotMatch(actions, /presentProblem|presentOpportunity|newAction|generateAction/);
});

test("H: En curso reaparece únicamente con estado persistente", () => {
  assert.match(actions, /type ActionStatus/);
  assert.match(actions, /in_progress: "En curso"/);
  assert.match(actions, /fetch\(`\/api\/actions\/\$\{encodeURIComponent\(action\.id\)\}\/status`/);
});

test("I: completar una acción usa la API y no un control simulado", () => {
  assert.doesNotMatch(actions, /Marcar lista|Marcar como realizada|Toggle action|console\.log/);
  assert.match(actions, /changeStatus\(action, "completed"\)/);
  assert.match(actions, /if \(!response\.ok \|\| data\.error\) throw/);
});

test("K: datos legacy incompletos producen estados vacíos sin valores inventados", () => {
  const viewModel = buildDashboardViewModel({
    id: "legacy",
    nombre: "Negocio anterior",
    rubro: "Servicios",
    goals: [],
    scores: [],
    diagnoses: [],
    strategies: [],
    analysisHistory: [{ id: "legacy-history", createdAt: "2024-01-01T00:00:00Z", snapshot: null, nuvraScoreTotal: null }],
    analysisRuns: [],
    planTier: "FREE",
  });
  assert.equal(viewModel.score, null);
  assert.equal(viewModel.diagnosis, null);
  assert.equal(viewModel.canonicalDiagnosis.mainConclusion, null);
  assert.equal(viewModel.canonicalStrategy, null);
  assert.deepEqual(viewModel.actions, []);
  assert.equal(viewModel.actionsSummary.immediateAction, null);
  assert.match(summary, /Sin una conclusión principal/);
  assert.match(diagnosis, /if \(!diagnosis\) return <EmptyState/);
  assert.match(strategy, /if \(!canonicalStrategy\) return <EmptyState/);
  assert.match(actions, /if \(!actions\.length\) return <EmptyState/);
});
