const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("module");
const ts = require("typescript");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
Module._resolveFilename = function (request, parent, isMain, opts) {
  if (request.startsWith("@/")) request = path.join(root, request.slice(2));
  return originalResolve.call(this, request, parent, isMain, opts);
};
Module._load = function (request, parent, isMain, opts) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain, opts);
};
require.extensions[".ts"] = function (module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { buildSingleRequestComparison } = require("../lib/server/internal-audit-single-request.ts");

let organization;
let user;
let business;
let otherBusiness;

test.before(async () => {
  const suffix = crypto.randomUUID();
  organization = await prisma.organization.create({
    data: { name: "Single request audit", slug: `single-request-audit-${suffix}`, planTier: "FREE" },
  });
  user = await prisma.user.create({
    data: { email: `single-request-${suffix}@test.local`, passwordHash: "test", internalRole: "INTERNAL" },
  });
  await prisma.membership.create({
    data: { userId: user.id, organizationId: organization.id, role: "viewer" },
  });
  business = await prisma.business.create({
    data: { nombre: "Estética Dental comparison", rubro: "Salud", organizationId: organization.id },
  });
  otherBusiness = await prisma.business.create({
    data: { nombre: "Otro negocio comparison", rubro: "Salud", organizationId: organization.id },
  });
  user.memberships = [{ organizationId: organization.id, role: "viewer" }];
});

test("input ID igual al candidato compara ORM y RAW dentro de un resultado consistente", async () => {
  const result = await buildSingleRequestComparison({
    user,
    inputBusinessId: business.id,
    exactName: business.nombre,
  });

  assert.equal(result.ok, true);
  const comparison = result.comparison;
  assert.deepEqual(comparison.nameLookup, { found: true, candidateId: business.id, organizationId: organization.id });
  assert.equal(comparison.inputVsDbId.strictEqual, true);
  assert.equal(comparison.inputVsDbId.firstDifferentIndex, null);
  assert.equal(comparison.inputVsDbId.inputHash, comparison.inputVsDbId.dbHash);
  assert.deepEqual(comparison.ormByInputId, { found: true, organizationId: organization.id });
  assert.deepEqual(comparison.ormByDbCandidateId, { found: true, organizationId: organization.id });
  assert.deepEqual(comparison.rawByInputId, { found: true, organizationId: organization.id });
  assert.deepEqual(comparison.rawByDbCandidateId, { found: true, organizationId: organization.id });
  assert.deepEqual(comparison.rawNameLookup, { found: true, candidateId: business.id });
  assert.deepEqual(comparison.rawCombinedIds, [{ id: business.id, organizationId: organization.id }]);
  assert.deepEqual(comparison.conclusionFlags, {
    sameString: true,
    ormResultsAgree: true,
    rawResultsAgree: true,
    ormVsRawAgree: true,
    nameLookupAgreesWithRaw: true,
  });

  if (comparison.transactionContext.backendPid === null) {
    assert.equal(comparison.transactionContext.currentSchema, null, "SQLite must use the capability guard");
  } else {
    assert.ok(comparison.transactionContext.databaseIdentityHash, "PostgreSQL should expose only a database identity hash");
  }
});

test("input ID distinto conserva el candidato obtenido por nombre y muestra la diferencia", async () => {
  const result = await buildSingleRequestComparison({ user, inputBusinessId: otherBusiness.id, exactName: business.nombre });

  assert.equal(result.ok, true);
  const comparison = result.comparison;
  assert.equal(comparison.nameLookup.candidateId, business.id);
  assert.equal(comparison.inputVsDbId.strictEqual, false);
  assert.notEqual(comparison.inputVsDbId.firstDifferentIndex, null);
  assert.deepEqual(comparison.ormByInputId, { found: true, organizationId: organization.id });
  assert.deepEqual(comparison.ormByDbCandidateId, { found: true, organizationId: organization.id });
  assert.deepEqual(comparison.rawByInputId, { found: true, organizationId: organization.id });
  assert.deepEqual(comparison.rawByDbCandidateId, { found: true, organizationId: organization.id });
  assert.deepEqual(new Set(comparison.rawCombinedIds.map((item) => item.id)), new Set([business.id, otherBusiness.id]));
  assert.equal(comparison.conclusionFlags.sameString, false);
  assert.equal(comparison.conclusionFlags.ormResultsAgree, false);
  assert.equal(comparison.conclusionFlags.rawResultsAgree, false);
  assert.equal(comparison.conclusionFlags.ormVsRawAgree, true);
  assert.equal(comparison.conclusionFlags.nameLookupAgreesWithRaw, true);
});

test("un nombre inexistente no habilita lecturas diagnósticas por ID", async () => {
  const result = await buildSingleRequestComparison({ user, inputBusinessId: business.id, exactName: "No existe" });
  assert.deepEqual(result, { ok: false, reason: "not_found" });
});

test("el modo comparativo conserva el gate INTERNAL", async () => {
  const result = await buildSingleRequestComparison({
    user: { ...user, internalRole: null },
    inputBusinessId: business.id,
    exactName: business.nombre,
  });
  assert.deepEqual(result, { ok: false, reason: "forbidden" });
});

test("la comparación no expone secretos ni identidad de conexión", async () => {
  const result = await buildSingleRequestComparison({ user, inputBusinessId: business.id, exactName: business.nombre });
  assert.equal(result.ok, true);
  const serialized = JSON.stringify(result);
  for (const forbidden of ["DATABASE_URL", "password", "hostname", "server_addr", "accessToken", "refreshToken"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test.after(async () => {
  if (organization) await prisma.organization.delete({ where: { id: organization.id } });
  if (user) await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
});
