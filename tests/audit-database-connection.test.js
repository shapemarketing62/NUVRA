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
const { buildDatabaseConnectionFingerprint, buildDirectConsistencyProbe } = require("../lib/server/authorization.ts");

const cleanup = [];

async function createInternalUserWithMemberships(memberships) {
  const suffix = crypto.randomUUID();
  const user = await prisma.user.create({
    data: {
      email: `internal-diag-${suffix}@test.local`,
      passwordHash: "test",
      internalRole: "INTERNAL",
    },
  });

  const created = [];
  for (const data of memberships) {
    const membership = await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: data.organizationId,
        role: data.role,
      },
    });
    created.push(membership);
  }

  cleanup.push({ userId: user.id, organizationIds: created.map((item) => item.organizationId) });
  return { user, memberships: created };
}

function mockCurrentUser(user, memberships) {
  const sessionModule = require("../lib/server/session.ts");
  const original = sessionModule.getCurrentUser;
  sessionModule.getCurrentUser = async () => ({ ...user, memberships });
  return () => { sessionModule.getCurrentUser = original; };
}

test("buildDatabaseConnectionFingerprint returns sanitized sqlite-safe structure", async () => {
  const fingerprint = await buildDatabaseConnectionFingerprint();
  assert.ok(fingerprint.requestId, "requestId should be present");
  assert.ok(fingerprint.timestamp, "timestamp should be present");
  assert.equal(fingerprint.runtimeDatasource, "sqlite");
  assert.equal(fingerprint.connectionMode, "UNKNOWN");
  assert.equal(fingerprint.databaseIdentityHash, null);
  assert.equal(fingerprint.serverIdentityHash, null);
  assert.equal(fingerprint.backendPid, null);
  assert.equal(fingerprint.currentSchema, null);
  assert.equal(fingerprint.searchPathHash, null);
});

test("buildDatabaseConnectionFingerprint keeps databaseIdentityHash stable and excludes backendPid from database identity in sqlite", async () => {
  const first = await buildDatabaseConnectionFingerprint();
  const second = await buildDatabaseConnectionFingerprint();

  assert.equal(first.databaseIdentityHash, second.databaseIdentityHash, "databaseIdentityHash should be stable across calls");
  assert.equal(first.serverIdentityHash, second.serverIdentityHash, "serverIdentityHash should be stable across calls");
  assert.equal(first.databaseIdentityHash, null, "sqlite should not calculate databaseIdentityHash");
  assert.equal(first.serverIdentityHash, null, "sqlite should not calculate serverIdentityHash");
  assert.equal(first.backendPid, null);
});

test("buildDirectConsistencyProbe agrees on modern business", async () => {
  const organization = await prisma.organization.create({
    data: { name: "Org Diag", slug: `org-diag-${crypto.randomUUID()}`, planTier: "FREE" },
  });

  const { user } = await createInternalUserWithMemberships([
    { organizationId: organization.id, role: "viewer" },
  ]);

  const business = await prisma.business.create({
    data: { nombre: "Estética Dental diag", rubro: "Salud", organizationId: organization.id },
  });

  const restore = mockCurrentUser(user, user.memberships);
  try {
    const probe = await buildDirectConsistencyProbe(business.id);
    assert.equal(probe.businessId, business.id);
    assert.equal(probe.orm.findUniqueFound, true);
    assert.equal(probe.orm.findFirstFound, true);
    assert.equal(probe.orm.findManyCount, 1);
    assert.equal(probe.orm.relationFound, true);
    assert.equal(probe.orm.organizationId, organization.id);
    assert.equal(probe.raw.found, true);
    assert.equal(probe.raw.organizationId, organization.id);
    assert.equal(probe.consistency.sameResult, true);
  } finally {
    restore();
  }
});

test("buildDirectConsistencyProbe reports consistent nulls when organizationId is null", async () => {
  const organization = await prisma.organization.create({
    data: { name: "Org Null Diag", slug: `org-null-diag-${crypto.randomUUID()}`, planTier: "FREE" },
  });

  const { user } = await createInternalUserWithMemberships([
    { organizationId: organization.id, role: "viewer" },
  ]);

  const business = await prisma.business.create({
    data: { nombre: "Null Org Diag", rubro: "Salud", organizationId: organization.id },
  });

  await prisma.$executeRaw`UPDATE "Business" SET "organizationId" = NULL WHERE id = ${business.id}`;

  const restore = mockCurrentUser(user, user.memberships);
  try {
    const probe = await buildDirectConsistencyProbe(business.id);
    assert.equal(probe.businessId, business.id);
    assert.equal(probe.orm.findUniqueFound, true);
    assert.equal(probe.orm.findFirstFound, true);
    assert.equal(probe.orm.findManyCount, 1);
    assert.equal(probe.orm.relationFound, false);
    assert.equal(probe.orm.organizationId, null);
    assert.equal(probe.raw.found, true);
    assert.equal(probe.raw.organizationId, null);
    assert.equal(probe.consistency.sameResult, true);
  } finally {
    restore();
  }
});

test("buildDirectConsistencyProbe raw query uses quoted Business identifiers for camelCase columns", async () => {
  const authorizationSource = fs.readFileSync(path.join(root, "lib/server/authorization.ts"), "utf8");
  const rawQueryMatch = authorizationSource.match(/SELECT\s+"id",\s+"organizationId"\s+FROM\s+"Business"\s+WHERE\s+"id"\s*=\s*\$\{businessId\}\s+LIMIT\s+1/);
  assert.ok(rawQueryMatch, "raw query should quote Business.id and Business.organizationId for PostgreSQL compatibility");
});

test.after(async () => {
  for (const item of cleanup) {
    await prisma.membership.deleteMany({ where: { userId: item.userId } });
    await prisma.user.delete({ where: { id: item.userId } });
  }
  await prisma.$disconnect();
});
