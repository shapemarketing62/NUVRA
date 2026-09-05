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
const { buildBusinessIdInputDebug, compareBusinessIdStrings, buildBusinessIdComparisonDebug } = require("../lib/server/authorization.ts");

const cleanup = [];

async function createInternalUserWithMemberships(memberships) {
  const suffix = crypto.randomUUID();
  const user = await prisma.user.create({
    data: {
      email: `internal-id-${suffix}@test.local`,
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

test("buildBusinessIdInputDebug reports exact values and suspicious characters", () => {
  const input = "abc ";
  const debug = buildBusinessIdInputDebug(input);

  assert.equal(debug.raw, "abc ");
  assert.equal(debug.rawLength, 4);
  assert.equal(debug.trimmed, "abc");
  assert.equal(debug.trimmedLength, 3);
  assert.equal(debug.asciiOnly, true);
  assert.equal(debug.equalsTrimmed, false);
  assert.equal(debug.normalized, "abc ");
  assert.equal(debug.normalizedLength, 4);
  assert.equal(debug.rawHash.length, 32);
  assert.equal(debug.trimmedHash.length, 32);
  assert.equal(debug.codePoints.length, 4);
  assert.equal(debug.codePoints[3].category, "whitespace");
  assert.equal(debug.suspicious, true);
  assert.ok(debug.suspiciousReasons.some((reason) => reason.includes("whitespace")));
  assert.equal(debug.json, JSON.stringify("abc "));
});

test("buildBusinessIdInputDebug treats exact id as non suspicious", () => {
  const debug = buildBusinessIdInputDebug("cmtme481f0005r1015xoep569");
  assert.equal(debug.suspicious, false);
  assert.equal(debug.suspiciousReasons.length, 0);
  assert.equal(debug.equalsTrimmed, true);
});

test("compareBusinessIdStrings detects first difference", () => {
  const result = compareBusinessIdStrings("abc ", "abc");
  assert.equal(result.firstDifferentIndex, 3);
  assert.equal(result.inputCodePointAtDifference, 0x20);
  assert.equal(result.dbCodePointAtDifference, null);
});

test("compareBusinessIdStrings returns null when equal", () => {
  const result = compareBusinessIdStrings("abc", "abc");
  assert.equal(result.firstDifferentIndex, null);
  assert.equal(result.inputCodePointAtDifference, null);
  assert.equal(result.dbCodePointAtDifference, null);
});

test("buildBusinessIdComparisonDebug reports nearby candidates and exact match", async () => {
  const organization = await prisma.organization.create({
    data: { name: "Org ID Diag", slug: `org-id-diag-${crypto.randomUUID()}`, planTier: "FREE" },
  });

  const { user } = await createInternalUserWithMemberships([
    { organizationId: organization.id, role: "viewer" },
  ]);

  const business = await prisma.business.create({
    data: { nombre: "ID Diag", rubro: "Salud", organizationId: organization.id },
  });

  const restore = mockCurrentUser(user, user.memberships);
  try {
    const debug = await buildBusinessIdComparisonDebug(`${business.id} `, business.id, business.id, business.id);
    console.log("debug", JSON.stringify(debug, null, 2));
    assert.equal(debug.input.rawLength, business.id.length + 1);
    assert.equal(debug.input.trimmedLength, business.id.length);
    assert.equal(debug.exactMatchInDb, false);
    assert.equal(debug.trimmedMatchInDb, true);
    assert.equal(debug.normalizedMatchInDb, false);
    assert.equal(debug.firstDifferentIndex, business.id.length);
    assert.ok(debug.nearbyCandidates.some((candidate) => candidate.exactEqualsTrimmedInput));
    assert.ok(debug.nearbyCandidates.every((candidate) => candidate.exactEqualsTrimmedInput));
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
