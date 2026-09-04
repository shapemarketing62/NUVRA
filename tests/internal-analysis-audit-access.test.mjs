import test from "node:test";
import assert from "node:assert/strict";
import { resolveAuthorizedBusinessForInternalAudit } from "../lib/internal-analysis-audit-access.ts";

const candidate = (id, organizationId = "org-a") => ({
  id,
  name: "Business",
  organizationId,
  createdAt: "2026-01-01T00:00:00.000Z",
  latestAnalysisAt: "2026-02-01T00:00:00.000Z",
});

function fixture({ internalRole = "INTERNAL", role = "owner", visible = [candidate("business-a")], authorized = ["business-a"] } = {}) {
  const user = { id: "user-a", internalRole, memberships: [{ organizationId: "org-a", role }] };
  const authorizeCalls = [];
  return {
    user,
    authorizeCalls,
    deps: {
      findByExactName: async (_name, organizationIds) => visible.filter((item) => organizationIds.includes(item.organizationId)),
      authorizeById: async (businessId) => {
        authorizeCalls.push(businessId);
        return authorized.includes(businessId)
          ? { ok: true, access: { businessId } }
          : { ok: false, reason: "forbidden" };
      },
    },
  };
}

function resolve(input, state) {
  return resolveAuthorizedBusinessForInternalAudit({
    user: state.user,
    businessId: input.businessId || null,
    exactName: input.exactName || null,
    maxIdentifierLength: 100,
    maxBusinessNameLength: 160,
    ...state.deps,
  });
}

test("A: INTERNAL puede resolver por nombre y consultar por ID el mismo negocio autorizado", async () => {
  const state = fixture();
  const byName = await resolve({ exactName: "Business" }, state);
  assert.deepEqual(byName, { ok: true, access: { businessId: "business-a" } });
  const byId = await resolve({ businessId: "business-a" }, state);
  assert.deepEqual(byId, { ok: true, access: { businessId: "business-a" } });
});

test("B: un negocio no autorizado no aparece por nombre y falla también por ID", async () => {
  const state = fixture({ visible: [candidate("business-a"), candidate("business-b")], authorized: ["business-a"] });
  const byName = await resolve({ exactName: "Business" }, state);
  assert.deepEqual(byName, { ok: true, access: { businessId: "business-a" } });
  const byId = await resolve({ businessId: "business-b" }, state);
  assert.deepEqual(byId, { ok: false, reason: "forbidden" });
});

test("C: dos negocios autorizados generan 409 lógico y cada ID devuelto es consultable", async () => {
  const state = fixture({ visible: [candidate("business-a"), candidate("business-b")], authorized: ["business-a", "business-b"] });
  const result = await resolve({ exactName: "Business" }, state);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "ambiguous_business_name");
  assert.deepEqual(result.candidates.map((item) => item.id), ["business-a", "business-b"]);
  assert.ok(result.candidates.every((item) => item.authorized === true));
  for (const item of result.candidates) {
    const byId = await resolve({ businessId: item.id }, state);
    assert.equal(byId.ok, true);
  }
});

test("D: una cuenta normal FREE/PRO/PARTNER no puede resolver por nombre ni por ID", async () => {
  for (const internalRole of [null, "ADMIN"]) {
    const state = fixture({ internalRole });
    assert.deepEqual(await resolve({ exactName: "Business" }, state), { ok: false, reason: "forbidden" });
    assert.deepEqual(await resolve({ businessId: "business-a" }, state), { ok: false, reason: "forbidden" });
  }
});

test("E: una request sin sesión se rechaza antes de consultar negocios", async () => {
  const state = fixture();
  state.user = null;
  assert.deepEqual(await resolve({ exactName: "Business" }, state), { ok: false, reason: "unauthorized" });
  assert.deepEqual(await resolve({ businessId: "business-a" }, state), { ok: false, reason: "unauthorized" });
  assert.deepEqual(state.authorizeCalls, []);
});

test("una membresía sin business.read no participa del lookup por nombre", async () => {
  const state = fixture({ role: "invalid-role" });
  const result = await resolve({ exactName: "Business" }, state);
  assert.deepEqual(result, { ok: false, reason: "not_found" });
  assert.deepEqual(state.authorizeCalls, []);
});
