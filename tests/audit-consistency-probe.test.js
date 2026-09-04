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
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) request = path.join(root, request.slice(2));
  return originalResolve.call(this, request, parent, isMain, options);
};
Module._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
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
const { buildCandidateConsistencyProbe } = require("../lib/server/authorization.ts");

const cleanup = [];

async function createInternalUserWithMemberships(memberships) {
  const suffix = crypto.randomUUID();
  const user = await prisma.user.create({
    data: {
      email: `internal-consistency-${suffix}@test.local`,
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

  const userWithMemberships = await prisma.user.findUnique({
    where: { id: user.id },
    include: { memberships: true },
  });

  cleanup.push({ userId: user.id, organizationIds: created.map((item) => item.organizationId) });
  return { user: userWithMemberships, memberships: created };
}

function mockCurrentUser(user, memberships) {
  const sessionModule = require("../lib/server/session.ts");
  const original = sessionModule.getCurrentUser;
  sessionModule.getCurrentUser = async () => ({ ...user, memberships });
  return () => { sessionModule.getCurrentUser = original; };
}

test("consistency probe agrees on organizationId for modern business", async () => {
  const organization = await prisma.organization.create({
    data: { name: "Org Consistency", slug: `org-consistency-${crypto.randomUUID()}`, planTier: "FREE" },
  });

  const { user } = await createInternalUserWithMemberships([
    { organizationId: organization.id, role: "viewer" },
  ]);

  const business = await prisma.business.create({
    data: { nombre: "Estética Dental argentina", rubro: "Salud", organizationId: organization.id },
  });

  const restore = mockCurrentUser(user, user.memberships);
  try {
    const probe = await buildCandidateConsistencyProbe(
      [business.id],
      "Estética Dental argentina",
      [organization.id]
    );

    assert.equal(probe.probes.length, 1);
    const result = probe.probes[0];
    assert.equal(result.businessId, business.id);
    assert.equal(result.nameLookup.organizationId, organization.id);
    assert.equal(result.directRead.found, true);
    assert.equal(result.directRead.organizationId, organization.id);
    assert.equal(result.relationRead.found, true);
    assert.equal(result.relationRead.organizationId, organization.id);
    assert.equal(result.consistency.sameOrganizationId, true);
    assert.equal(result.authorization.result, true);
    assert.equal(result.authorization.denialReason, null);
  } finally {
    restore();
  }
});

test("consistency probe reports consistent nulls for business without organization", async () => {
  const organization = await prisma.organization.create({
    data: { name: "Org Null Consistency", slug: `org-null-consistency-${crypto.randomUUID()}`, planTier: "FREE" },
  });

  const { user } = await createInternalUserWithMemberships([
    { organizationId: organization.id, role: "viewer" },
  ]);

  const business = await prisma.business.create({
    data: { nombre: "Null Org Business", rubro: "Salud", organizationId: organization.id },
  });

  await prisma.$executeRaw`UPDATE "Business" SET "organizationId" = NULL WHERE id = ${business.id}`;

  const restore = mockCurrentUser(user, user.memberships);
  try {
    const probe = await buildCandidateConsistencyProbe(
      [business.id],
      "Null Org Business",
      [organization.id]
    );

    assert.equal(probe.probes.length, 1);
    const result = probe.probes[0];
    assert.equal(result.nameLookup.organizationId, null);
    assert.equal(result.directRead.found, true);
    assert.equal(result.directRead.organizationId, null);
    assert.equal(result.relationRead.found, false);
    assert.equal(result.relationRead.organizationId, null);
    assert.equal(result.consistency.sameOrganizationId, true);
    assert.equal(result.authorization.result, false);
    assert.equal(result.authorization.denialReason, "forbidden");
  } finally {
    restore();
  }
});

test.after(async () => {
  for (const item of cleanup) {
    await prisma.membership.deleteMany({ where: { userId: item.userId } });
    await prisma.user.delete({ where: { id: item.userId } });
  }
  await prisma.$disconnect();
});
