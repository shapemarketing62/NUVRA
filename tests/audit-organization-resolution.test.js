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
const { authorizeBusiness } = require("../lib/server/authorization.ts");
const { roleCan } = require("../lib/access-policy.ts");

const cleanup = [];

async function createInternalUserWithMemberships(memberships) {
  const suffix = crypto.randomUUID();
  const user = await prisma.user.create({
    data: {
      email: `internal-org-${suffix}@test.local`,
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

test("name lookup and businessId lookup must agree on organizationId for modern business", async () => {
  const organization = await prisma.organization.create({
    data: { name: "Org Modern", slug: `org-modern-${crypto.randomUUID()}`, planTier: "FREE" },
  });

  const { user } = await createInternalUserWithMemberships([
    { organizationId: organization.id, role: "viewer" },
  ]);

  const business = await prisma.business.create({
    data: { nombre: "Estética Dental argentina", rubro: "Salud", organizationId: organization.id },
  });

  const restore = mockCurrentUser(user, user.memberships);
  try {
    const authorizedOrgIds = user.memberships
      .filter((m) => roleCan(m.role, "business.read"))
      .map((m) => m.organizationId);

    const nameMatches = await prisma.business.findMany({
      where: { nombre: "Estética Dental argentina", organizationId: { in: authorizedOrgIds } },
      select: { id: true, nombre: true, organizationId: true },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 11,
    });

    const directBusiness = await prisma.business.findUnique({
      where: { id: business.id },
      select: { organizationId: true },
    });

    const access = await authorizeBusiness(business.id, "business.read");

    assert.ok(nameMatches.some((m) => m.id === business.id), "name lookup must find the business");
    assert.equal(directBusiness?.organizationId, organization.id, "direct query must return the organizationId");
    assert.equal(access.ok, true, "authorizeBusiness must succeed");
    assert.equal(access.organization.id, organization.id, "authorized organization must match");
  } finally {
    restore();
  }
});

test("debug instrumentation must resolve organization from scalar before relation", async () => {
  const organization = await prisma.organization.create({
    data: { name: "Org Debug", slug: `org-debug-${crypto.randomUUID()}`, planTier: "FREE" },
  });

  const { user } = await createInternalUserWithMemberships([
    { organizationId: organization.id, role: "viewer" },
  ]);

  const business = await prisma.business.create({
    data: { nombre: "Estética Dental debug", rubro: "Salud", organizationId: organization.id },
  });

  const restore = mockCurrentUser(user, user.memberships);
  try {
    const { buildAuthorizationDebug } = require("../lib/server/authorization.ts");
    const debug = await buildAuthorizationDebug(business.id);
    assert.equal(debug.business?.businessId, business.id);
    assert.equal(debug.business?.organizationId, organization.id);
    assert.equal(debug.business?.organizationResolutionSource, "business.organizationId");
    assert.equal(debug.authorization.authorizeBusinessResult, true);
    assert.equal(debug.authorization.denialReason, null);
  } finally {
    restore();
  }
});

test("debug instrumentation must report null organization when scalar and relation are both missing", async () => {
  const organization = await prisma.organization.create({
    data: { name: "Org Null", slug: `org-null-${crypto.randomUUID()}`, planTier: "FREE" },
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
    const { buildAuthorizationDebug } = require("../lib/server/authorization.ts");
    const debug = await buildAuthorizationDebug(business.id);
    assert.equal(debug.business?.businessId, business.id);
    assert.equal(debug.business?.organizationId, null);
    assert.equal(debug.business?.organizationResolutionSource, "business.organizationId");
    assert.equal(debug.authorization.authorizeBusinessResult, false);
    assert.equal(debug.authorization.denialReason, "forbidden");
  } finally {
    restore();
  }
});

test("debug instrumentation must report not_found when business does not exist", async () => {
  const organization = await prisma.organization.create({
    data: { name: "Org Missing", slug: `org-missing-${crypto.randomUUID()}`, planTier: "FREE" },
  });

  const { user } = await createInternalUserWithMemberships([
    { organizationId: organization.id, role: "viewer" },
  ]);

  const restore = mockCurrentUser(user, user.memberships);
  try {
    const { buildAuthorizationDebug } = require("../lib/server/authorization.ts");
    const debug = await buildAuthorizationDebug("business-does-not-exist");
    assert.equal(debug.business?.businessId, "business-does-not-exist");
    assert.equal(debug.business?.organizationId, null);
    assert.equal(debug.business?.organizationResolutionSource, "not_found");
    assert.equal(debug.authorization.authorizeBusinessResult, false);
    assert.equal(debug.authorization.denialReason, "forbidden");
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
