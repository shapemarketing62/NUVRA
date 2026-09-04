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

async function createInternalUserWithMemberships(overrides = {}) {
  const suffix = crypto.randomUUID();
  const user = await prisma.user.create({
    data: {
      email: `internal-audit-${suffix}@test.local`,
      passwordHash: "test",
      internalRole: "INTERNAL",
      ...overrides.user,
    },
  });

  const memberships = [];
  for (const membershipData of (overrides.memberships || [])) {
    const membership = await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: membershipData.organizationId,
        role: membershipData.role,
      },
    });
    memberships.push(membership);
  }

  const userWithMemberships = await prisma.user.findUnique({
    where: { id: user.id },
    include: { memberships: true },
  });

  cleanup.push({ userId: user.id, organizationIds: memberships.map((m) => m.organizationId) });
  return { user: userWithMemberships, memberships };
}

async function createBusinessInOrganization(organizationId, overrides = {}) {
  return prisma.business.create({
    data: {
      nombre: overrides.nombre || "Estética Dental argentina",
      rubro: overrides.rubro || "Salud",
      organizationId,
      ...overrides,
    },
  });
}

function mockCurrentUser(user) {
  const sessionModule = require("../lib/server/session.ts");
  const original = sessionModule.getCurrentUser;
  sessionModule.getCurrentUser = async () => user;
  return () => { sessionModule.getCurrentUser = original; };
}

test("audit authorization: name lookup and businessId lookup must agree on the same business", async () => {
  const organization = await prisma.organization.create({
    data: {
      name: "Org Audit",
      slug: `org-audit-${crypto.randomUUID()}`,
      planTier: "FREE",
    },
  });

  const { user } = await createInternalUserWithMemberships({
    memberships: [{ organizationId: organization.id, role: "viewer" }],
  });

  const business = await createBusinessInOrganization(organization.id, { nombre: "Estética Dental argentina" });

  const restore = mockCurrentUser(user);
  try {
    const byId = await authorizeBusiness(business.id, "business.read");
    assert.equal(byId.ok, true, `businessId lookup must succeed for ${business.id}`);

    const sessionUser = await require("../lib/server/session.ts").getCurrentUser();
    const authorizedOrgIds = sessionUser.memberships
      .filter((m) => roleCan(m.role, "business.read"))
      .map((m) => m.organizationId);

    const matches = await prisma.business.findMany({
      where: { nombre: "Estética Dental argentina", organizationId: { in: authorizedOrgIds } },
      select: { id: true, nombre: true, organizationId: true },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 11,
    });

    assert.ok(matches.some((m) => m.id === business.id), "name lookup must find the business");

    for (const match of matches) {
      const candidateAuth = await authorizeBusiness(match.id, "business.read");
      assert.equal(candidateAuth.ok, byId.ok, `candidate ${match.id} must agree with direct businessId lookup`);
    }
  } finally {
    restore();
  }
});

test.after(async () => {
  for (const item of cleanup) {
    await prisma.membership.deleteMany({ where: { userId: item.userId } });
    await prisma.business.deleteMany({ where: { organizationId: { in: item.organizationIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: item.organizationIds } } });
    await prisma.user.delete({ where: { id: item.userId } });
  }
  await prisma.$disconnect();
});
