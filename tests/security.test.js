const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) { if (request.startsWith("@/")) request = path.join(root, request.slice(2)); return originalResolve.call(this, request, parent, isMain, options); };
require.extensions[".ts"] = function (module, filename) { const source = fs.readFileSync(filename, "utf8"); const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, moduleResolution: ts.ModuleResolutionKind.NodeJs }, fileName: filename }).outputText; module._compile(output, filename); };

const { PrismaClient } = require("@prisma/client");
const { businessAccessWhere, roleCan } = require("../lib/access-policy.ts");
const { getUsageLimit } = require("../lib/plans.ts");
const { validateAndNormalizeUrl, validateRedirectChain } = require("../services/website-analyzer/url-validator.ts");
const prisma = new PrismaClient();

test("usuario A no puede consultar el negocio de usuario B", async () => {
  const suffix = crypto.randomUUID();
  const userA = await prisma.user.create({ data: { email: `a-${suffix}@test.local`, passwordHash: "test" } });
  const userB = await prisma.user.create({ data: { email: `b-${suffix}@test.local`, passwordHash: "test", memberships: { create: { role: "owner", organization: { create: { name: "B", slug: `b-${suffix}` } } } } }, include: { memberships: true } });
  const business = await prisma.business.create({ data: { nombre: "Privado", rubro: "Prueba", organizationId: userB.memberships[0].organizationId } });
  try { assert.equal(await prisma.business.findFirst({ where: businessAccessWhere(userA.id, business.id) }), null); assert.ok(await prisma.business.findFirst({ where: businessAccessWhere(userB.id, business.id) })); }
  finally { await prisma.user.delete({ where: { id: userA.id } }); await prisma.user.delete({ where: { id: userB.id } }); await prisma.organization.delete({ where: { id: userB.memberships[0].organizationId } }); }
});

test("una petición sin cookie no entra al dashboard", async () => {
  const { NextRequest } = require("next/server");
  const { middleware } = require("../middleware.ts");
  const response = middleware(new NextRequest("http://localhost:3000/dashboard"));
  assert.equal(response.status, 307); assert.match(response.headers.get("location"), /\/login/);
});

test("viewer no puede modificar ni ejecutar análisis", () => { assert.equal(roleCan("viewer", "business.read"), true); assert.equal(roleCan("viewer", "business.update"), false); assert.equal(roleCan("viewer", "analysis.run"), false); });
test("FREE tiene límites estrictos", () => { assert.equal(getUsageLimit("FREE", "businesses"), 1); assert.equal(getUsageLimit("FREE", "monthlyAnalyses"), 1); assert.equal(getUsageLimit("FREE", "activeActions"), 3); });
test("localhost e IPs privadas son rechazados", async () => { for (const url of ["http://localhost", "http://127.0.0.1", "http://10.0.0.2", "file:///tmp/test", "ftp://example.com"]) await assert.rejects(validateAndNormalizeUrl(url)); });
test("redirect hacia red privada es rechazado", async () => { await assert.rejects(validateRedirectChain(["http://127.0.0.1/internal"])); });
test("respuestas de API no deben incluir secretos", () => { const sourceFiles = ["app/api/business/route.ts", "app/api/analyze/run/route.ts", "app/api/analyze/website/route.ts", "app/api/instagram/connect/route.ts"]; const secret = "test-secret-value"; process.env.TAVILY_API_KEY = secret; process.env.GOOGLE_PLACES_API_KEY = secret; for (const file of sourceFiles) assert.doesNotMatch(fs.readFileSync(path.join(root, file), "utf8"), new RegExp(secret)); });

test.after(async () => { await prisma.$disconnect(); });
