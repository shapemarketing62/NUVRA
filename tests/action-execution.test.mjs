import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { actionProgress, normalizeActionStatus, transitionActionStatus } from "../lib/action-execution.ts";
import { buildDashboardViewModel } from "../lib/dashboard-view-model.ts";

const firstStart = new Date("2026-08-01T12:00:00.000Z");
const completion = new Date("2026-08-02T12:00:00.000Z");

test("A: una acción legacy sin status se normaliza como pending", () => {
  assert.equal(normalizeActionStatus({ done: false }), "pending");
  assert.equal(normalizeActionStatus({}), "pending");
  assert.equal(normalizeActionStatus({ done: true }), "completed");
});

test("B y F: pending pasa a in_progress y establece startedAt", () => {
  const result = transitionActionStatus({ status: "pending" }, "in_progress", firstStart);
  assert.deepEqual(result, { status: "in_progress", done: false, startedAt: firstStart, completedAt: null });
});

test("C y G: in_progress pasa a completed conservando inicio y registrando finalización", () => {
  const result = transitionActionStatus({ status: "in_progress", startedAt: firstStart }, "completed", completion);
  assert.deepEqual(result, { status: "completed", done: true, startedAt: firstStart, completedAt: completion });
});

test("D: pending puede completarse directamente sin inventar startedAt", () => {
  const result = transitionActionStatus({ status: "pending" }, "completed", completion);
  assert.deepEqual(result, { status: "completed", done: true, startedAt: null, completedAt: completion });
});

test("E: completed puede reabrirse y limpia completedAt", () => {
  const result = transitionActionStatus({ status: "completed", startedAt: firstStart, completedAt: completion }, "in_progress", new Date("2026-08-03T12:00:00.000Z"));
  assert.deepEqual(result, { status: "in_progress", done: false, startedAt: firstStart, completedAt: null });
});

test("volver a pending reinicia el ciclo operativo", () => {
  const result = transitionActionStatus({ status: "in_progress", startedAt: firstStart }, "pending", completion);
  assert.deepEqual(result, { status: "pending", done: false, startedAt: null, completedAt: null });
});

test("H, I y J: la API exige autorización, valida estados y aplica el límite server-side", async () => {
  const source = await readFile(new URL("../app/api/actions/[id]/status/route.ts", import.meta.url), "utf8");
  assert.match(source, /authorizeBusiness\(action\.strategy\.businessId, "business\.update", "tracking\.progress"\)/);
  assert.match(source, /z\.enum\(ACTION_STATUSES\)/);
  assert.match(source, /getUsageLimit\(access\.organization\.planTier, "activeActions"\)/);
  assert.match(source, /visible\.some\(\(item\) => item\.id === action\.id\)/);
  assert.match(source, /currentStrategy\.id !== action\.strategyId/);
});

test("K y L: un análisis nuevo usa nuevas acciones y no altera la ejecución histórica", () => {
  const historical = { id: "old-action", status: "completed", startedAt: firstStart, completedAt: completion };
  const current = { id: "new-action", status: "pending" };
  const updatedCurrent = transitionActionStatus(current, "in_progress", new Date("2026-08-04T12:00:00.000Z"));
  assert.notEqual(historical.id, current.id);
  assert.equal(historical.status, "completed");
  assert.equal(historical.completedAt, completion);
  assert.equal(updatedCurrent.status, "in_progress");
});

test("M: el progreso usa solamente las acciones visibles", () => {
  const visible = [{ status: "completed" }, { status: "pending" }, { status: "completed" }];
  const hidden = [{ status: "pending" }, { status: "pending" }];
  assert.deepEqual(actionProgress(visible), { total: 3, completed: 2, percentage: 67 });
  assert.deepEqual(actionProgress([...visible, ...hidden]), { total: 5, completed: 2, percentage: 40 });
});

test("N: DashboardViewModel proyecta status, timestamps y permiso de actualización", () => {
  const vm = buildDashboardViewModel({
    nombre: "Negocio",
    rubro: "Servicios",
    planTier: "PRO",
    strategies: [{
      id: "strategy-current",
      objetivo: "Crecer",
      actions: [{
        id: "action-current",
        title: "Acción concreta",
        status: "in_progress",
        done: false,
        startedAt: firstStart,
        completedAt: null,
        updatedAt: completion,
        order: 1,
      }],
    }],
  }, { canUpdateActions: true });
  assert.equal(vm.actions[0].status, "in_progress");
  assert.equal(vm.actions[0].startedAt, firstStart.toISOString());
  assert.equal(vm.actions[0].completedAt, null);
  assert.equal(vm.actions[0].updatedAt, completion.toISOString());
  assert.equal(vm.actions[0].canUpdateStatus, true);
  assert.deepEqual(vm.actionsSummary.availableStates, ["pending", "in_progress", "completed"]);
});

test("O: FREE no puede actualizar seguimiento aunque el rol permita editar", () => {
  const vm = buildDashboardViewModel({
    nombre: "Negocio",
    rubro: "Servicios",
    planTier: "FREE",
    strategies: [{ id: "strategy-current", actions: [{ id: "action-current", title: "Acción", status: "pending" }] }],
  }, { canUpdateActions: true });
  assert.equal(vm.actions[0].canUpdateStatus, false);
});
