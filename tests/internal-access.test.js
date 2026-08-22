const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

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
const { canConsume, currentPeriodKey, recordUsage } = require("../lib/server/usage.ts");
const { getUsageLimit } = require("../lib/plans.ts");
const { hasServerEntitlement } = require("../lib/server/internal-access.ts");
const cleanup = [];

async function fixture(planTier, internalRole = null) {
  const suffix = crypto.randomUUID();
  const user = await prisma.user.create({
    data: { email: `internal-${suffix}@test.local`, passwordHash: "test", internalRole },
  });
  const organization = await prisma.organization.create({
    data: {
      name: `Internal ${suffix}`,
      slug: `internal-${suffix}`,
      planTier,
      memberships: { create: { userId: user.id, role: "owner" } },
      subscription: { create: { plan: planTier, status: planTier === "FREE" ? "free" : "active" } },
    },
  });
  cleanup.push({ userId: user.id, organizationId: organization.id });
  return { user, organization };
}

async function consumeMonthlyAnalyses(organizationId, quantity) {
  await prisma.usageEvent.create({
    data: { organizationId, kind: "analysis", periodKey: currentPeriodKey(), quantity },
  });
}

test("FREE alcanza su límite mensual normal", async () => {
  const fixtureData = await fixture("FREE");
  await consumeMonthlyAnalyses(fixtureData.organization.id, getUsageLimit("FREE", "monthlyAnalyses"));
  assert.equal(
    await canConsume(fixtureData.organization.id, "monthlyAnalyses", 1, fixtureData.user.id),
    false
  );
});

test("PRO respeta su límite mensual correspondiente", async () => {
  const fixtureData = await fixture("PRO");
  await consumeMonthlyAnalyses(fixtureData.organization.id, getUsageLimit("PRO", "monthlyAnalyses"));
  assert.equal(
    await canConsume(fixtureData.organization.id, "monthlyAnalyses", 1, fixtureData.user.id),
    false
  );
});

test("INTERNAL puede analizar sin límite y recibe todos los entitlements", async () => {
  const fixtureData = await fixture("FREE", "INTERNAL");
  await consumeMonthlyAnalyses(fixtureData.organization.id, 10_000);
  for (let index = 0; index < 25; index += 1) {
    assert.equal(
      await canConsume(fixtureData.organization.id, "monthlyAnalyses", 1, fixtureData.user.id),
      true
    );
  }
  assert.equal(hasServerEntitlement(fixtureData.user, "FREE", "workspace.overview"), true);
  assert.equal(hasServerEntitlement(fixtureData.user, "FREE", "reports.whiteLabel"), true);
});

test("el análisis de una cuenta interna no aumenta usage", async () => {
  const fixtureData = await fixture("FREE", "ADMIN");
  const before = await prisma.usageEvent.count({
    where: { organizationId: fixtureData.organization.id, kind: "analysis" },
  });
  const result = await recordUsage(
    fixtureData.organization.id,
    "analysis",
    "test-business",
    1,
    fixtureData.user.id
  );
  const after = await prisma.usageEvent.count({
    where: { organizationId: fixtureData.organization.id, kind: "analysis" },
  });
  assert.equal(result, null);
  assert.equal(after, before);
});

test.after(async () => {
  for (const item of cleanup.reverse()) {
    await prisma.organization.delete({ where: { id: item.organizationId } }).catch(() => {});
    await prisma.user.delete({ where: { id: item.userId } }).catch(() => {});
  }
  await prisma.$disconnect();
});
