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

const cleanup = [];

async function createInternalUserWithMemberships(memberships) {
  const suffix = crypto.randomUUID();
  const user = await prisma.user.create({
    data: {
      email: `internal-multi-${suffix}@test.local`,
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

  cleanup.push({ userId: user.id, membershipIds: created.map((item) => item.id) });
  return { user: userWithMemberships, memberships: created };
}

function mockCurrentUser(user, memberships) {
  const sessionModule = require("../lib/server/session.ts");
  const original = sessionModule.getCurrentUser;
  sessionModule.getCurrentUser = async () => ({ ...user, memberships });
  return () => { sessionModule.getCurrentUser = original; };
}

test("authorizeBusiness usa la membership del negocio, no memberships[0]", async () => {
  const orgA = await prisma.organization.create({ data: { name: "Org A", slug: `org-a-${crypto.randomUUID()}`, planTier: "FREE" } });
  const orgB = await prisma.organization.create({ data: { name: "Org B", slug: `org-b-${crypto.randomUUID()}`, planTier: "FREE" } });

  const { user, memberships } = await createInternalUserWithMemberships([
    { organizationId: orgA.id, role: "viewer" },
    { organizationId: orgB.id, role: "owner" },
  ]);

  const business = await prisma.business.create({
    data: { nombre: "Estética Dental argentina", rubro: "Salud", organizationId: orgB.id },
  });

  const restore = mockCurrentUser(user, memberships);
  try {
    const access = await authorizeBusiness(business.id, "business.read");
    assert.equal(access.ok, true, "authorizeBusiness debe usar la membership del negocio, no memberships[0]");
    assert.equal(access.membership.organizationId, orgB.id);
    assert.equal(access.membership.role, "owner");
  } finally {
    restore();
  }
});

test("authorizeBusiness sigue siendo determinista invirtiendo el orden de memberships", async () => {
  const orgA = await prisma.organization.create({ data: { name: "Org A 2", slug: `org-a2-${crypto.randomUUID()}`, planTier: "FREE" } });
  const orgB = await prisma.organization.create({ data: { name: "Org B 2", slug: `org-b2-${crypto.randomUUID()}`, planTier: "FREE" } });

  const { user, memberships } = await createInternalUserWithMemberships([
    { organizationId: orgB.id, role: "owner" },
    { organizationId: orgA.id, role: "viewer" },
  ]);

  const business = await prisma.business.create({
    data: { nombre: "Estética Dental argentina 2", rubro: "Salud", organizationId: orgB.id },
  });

  const restore = mockCurrentUser(user, memberships);
  try {
    const access = await authorizeBusiness(business.id, "business.read");
    assert.equal(access.ok, true, "el orden de memberships no debe afectar authorizeBusiness");
    assert.equal(access.membership.organizationId, orgB.id);
    assert.equal(access.membership.role, "owner");
  } finally {
    restore();
  }
});

test("un rol invalido en la membership del negocio impide authorizeBusiness aunque haya otra membership valida en otra organizacion", async () => {
  const orgA = await prisma.organization.create({ data: { name: "Org A 3", slug: `org-a3-${crypto.randomUUID()}`, planTier: "FREE" } });
  const orgB = await prisma.organization.create({ data: { name: "Org B 3", slug: `org-b3-${crypto.randomUUID()}`, planTier: "FREE" } });

  const { user, memberships } = await createInternalUserWithMemberships([
    { organizationId: orgA.id, role: "owner" },
    { organizationId: orgB.id, role: "invalid-role" },
  ]);

  const business = await prisma.business.create({
    data: { nombre: "Estética Dental argentina 3", rubro: "Salud", organizationId: orgB.id },
  });

  const restore = mockCurrentUser(user, memberships);
  try {
    const access = await authorizeBusiness(business.id, "business.read");
    assert.equal(access.ok, false, "no debe autorizar si la membership del negocio tiene un rol invalido");
    assert.equal(access.reason, "forbidden");
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
