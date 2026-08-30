import test from "node:test";
import assert from "node:assert/strict";
import { buildEvolutionView, isAnalysisComparable } from "../lib/evolution-view.ts";

function history({ id, date, score = 60, method = "V3", dimensions = [{ slug: "presencia", name: "Presencia", points: 60 }], sources = { web: "evaluated" }, problem = { id: "problem:visibility", hypothesis: "Cuesta encontrar el negocio" }, strengths = [], frictions = [], opportunities = [], evidenceCount = 5, strategyId = `${id}-strategy`, status }) {
  return {
    id, createdAt: date, nuvraScoreTotal: score, strategyId, ...(status ? { status } : {}),
    snapshot: JSON.stringify({
      scoreMethodologyVersion: method,
      dimensions,
      intelligence: { coverage: 70, sourceStatuses: sources },
      businessProfile: { strengthCandidates: strengths, problemCandidates: frictions },
      analysisAudit: { selectedProblem: problem, selectedOpportunities: opportunities, survivingEvidence: { totalFindings: evidenceCount } },
    }),
  };
}

function strategy(id, actions = []) {
  return { id: `${id}-strategy`, distanciaObjetivo: "Concentrar el trabajo en la prioridad", actions };
}

test("A: primer análisis conserva el punto de partida sin comparación", () => {
  const view = buildEvolutionView({ history: [history({ id: "a", date: "2026-01-01" })], strategies: [] });
  assert.equal(view.hasCurrentAnalysis, true);
  assert.equal(view.hasComparison, false);
  assert.equal(view.globalDelta, null);
});

test("B: dos análisis con la misma metodología son comparables", () => {
  const view = buildEvolutionView({ history: [history({ id: "b", date: "2026-02-01", score: 61 }), history({ id: "a", date: "2026-01-01", score: 52 })] });
  assert.equal(isAnalysisComparable(view.previousComparableAnalysis, view.currentAnalysis), true);
  assert.equal(view.globalDelta, 9);
});

test("C y Q: metodologías diferentes permanecen en historial sin delta", () => {
  const view = buildEvolutionView({ history: [history({ id: "b", date: "2026-02-01", method: "V3" }), history({ id: "a", date: "2026-01-01", method: "V2" })] });
  assert.equal(view.hasComparison, false);
  assert.equal(view.globalDelta, null);
  assert.equal(view.history.length, 2);
  assert.match(view.history[1].comparisonLabel, /metodología anterior/);
});

test("D: score null en uno de los análisis no produce delta global", () => {
  const view = buildEvolutionView({ history: [history({ id: "b", date: "2026-02-01", score: 61 }), history({ id: "a", date: "2026-01-01", score: null })] });
  assert.equal(view.hasComparison, true);
  assert.equal(view.globalDelta, null);
});

test("E y F: null nunca se transforma en cero o en un delta artificial", () => {
  const view = buildEvolutionView({ history: [
    history({ id: "b", date: "2026-02-01", dimensions: [{ slug: "identidad", name: "Identidad", points: 70 }, { slug: "redes", name: "Redes", points: null }] }),
    history({ id: "a", date: "2026-01-01", dimensions: [{ slug: "identidad", name: "Identidad", points: null }, { slug: "redes", name: "Redes", points: 62 }] }),
  ] });
  assert.deepEqual(view.dimensionChanges.map(({ direction, delta }) => ({ direction, delta })), [
    { direction: "newly_evaluable", delta: null },
    { direction: "no_longer_evaluable", delta: null },
  ]);
});

test("G: detecta un cambio de problema principal con identidad trazable", () => {
  const view = buildEvolutionView({ history: [history({ id: "b", date: "2026-02-01", problem: { id: "problem:action", hypothesis: "Cuesta pasar a la acción" } }), history({ id: "a", date: "2026-01-01" })] });
  assert.equal(view.priorityChange.status, "changed");
  assert.match(view.priorityChange.current, /acción/);
});

test("H: mantiene la prioridad cuando conserva el mismo candidato", () => {
  const view = buildEvolutionView({ history: [history({ id: "b", date: "2026-02-01" }), history({ id: "a", date: "2026-01-01" })] });
  assert.equal(view.priorityChange.status, "same");
});

test("I y J: incluye acciones completadas dentro del período y excluye las externas", () => {
  const actions = [
    { id: "inside", title: "Actualizar contacto", status: "completed", completedAt: "2026-01-15", dimension: "presencia" },
    { id: "before", title: "Acción anterior", status: "completed", completedAt: "2025-12-20" },
    { id: "after", title: "Acción posterior", status: "completed", completedAt: "2026-02-10" },
  ];
  const view = buildEvolutionView({ history: [history({ id: "b", date: "2026-02-01", score: 61 }), history({ id: "a", date: "2026-01-01", score: 52 })], strategies: [strategy("a", actions)] });
  assert.deepEqual(view.actionActivity.completed.map((action) => action.id), ["inside"]);
});

test("K: las acciones del análisis nuevo no se mezclan con el período anterior", () => {
  const view = buildEvolutionView({ history: [history({ id: "b", date: "2026-02-01" }), history({ id: "a", date: "2026-01-01" })], strategies: [strategy("a", []), strategy("b", [{ id: "new", title: "Nueva", status: "pending" }])] });
  assert.equal(view.actionActivity.pending.some((action) => action.id === "new"), false);
});

test("L: detecta una fuente nueva", () => {
  const view = buildEvolutionView({ history: [history({ id: "b", date: "2026-02-01", sources: { web: "evaluated", instagram: "evaluated" } }), history({ id: "a", date: "2026-01-01", sources: { web: "evaluated", instagram: "not_found" } })] });
  assert.equal(view.sourceChanges.find((change) => change.source === "instagram")?.kind, "new_source");
});

test("M: detecta una fuente que pasa de parcial a analizada", () => {
  const view = buildEvolutionView({ history: [history({ id: "b", date: "2026-02-01", sources: { web: "evaluated" } }), history({ id: "a", date: "2026-01-01", sources: { web: "partial" } })] });
  assert.equal(view.sourceChanges[0].kind, "more_information");
});

test("N: un análisis actual parcial agrega una advertencia cautelosa", () => {
  const view = buildEvolutionView({ history: [history({ id: "b", date: "2026-02-01", sources: { web: "evaluated", search: "partial" } }), history({ id: "a", date: "2026-01-01" })] });
  assert.equal(view.currentAnalysis.status, "partial");
  assert.ok(view.interpretationNotes.some((note) => note.includes("actual fue parcial")));
});

test("O: failed, pending y running no se usan como punto de comparación", () => {
  const view = buildEvolutionView({ history: [history({ id: "failed", date: "2026-03-01", status: "failed" }), history({ id: "b", date: "2026-02-01" }), history({ id: "a", date: "2026-01-01" })] });
  assert.equal(view.currentAnalysis.id, "b");
  assert.equal(view.previousComparableAnalysis.id, "a");
});

test("P: una acción temporal no se presenta como causa del cambio", () => {
  const actions = [{ id: "action", title: "Actualizar contacto", status: "completed", completedAt: "2026-01-15", dimension: "otra_area" }];
  const view = buildEvolutionView({ history: [history({ id: "b", date: "2026-02-01", score: 61 }), history({ id: "a", date: "2026-01-01", score: 52 })], strategies: [strategy("a", actions)] });
  assert.equal(view.actionActivity.completed[0].relation, "temporal_only");
  assert.doesNotMatch(view.actionActivity.completed[0].relationText, /causó|provocó/i);
});

test("R: datos legacy incompletos no rompen la proyección", () => {
  const view = buildEvolutionView({ history: [{ id: "legacy", createdAt: "2024-01-01", score: null, snapshot: null }], strategies: [] });
  assert.equal(view.hasCurrentAnalysis, false);
  assert.equal(view.hasComparison, false);
  assert.equal(view.history.length, 1);
});

test("fixtures manuales: 52→61, V2→V3 y null→70 mantienen las reglas", () => {
  const comparable = buildEvolutionView({ history: [history({ id: "b", date: "2026-02-01", score: 61 }), history({ id: "a", date: "2026-01-01", score: 52 })] });
  const incompatible = buildEvolutionView({ history: [history({ id: "v3", date: "2026-02-01", method: "V3" }), history({ id: "v2", date: "2026-01-01", method: "V2" })] });
  const newlyEvaluable = buildEvolutionView({ history: [history({ id: "e2", date: "2026-02-01", dimensions: [{ slug: "identidad", name: "Identidad", points: 70 }] }), history({ id: "e1", date: "2026-01-01", dimensions: [{ slug: "identidad", name: "Identidad", points: null }] })] });
  assert.equal(comparable.globalDelta, 9);
  assert.equal(incompatible.globalDelta, null);
  assert.equal(newlyEvaluable.dimensionChanges[0].direction, "newly_evaluable");
  assert.equal(newlyEvaluable.dimensionChanges[0].delta, null);
});
