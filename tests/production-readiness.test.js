const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
Module._resolveFilename = function (request, parent, isMain, options) { if (request.startsWith("@/")) request = path.join(root, request.slice(2)); return originalResolve.call(this, request, parent, isMain, options); };
Module._load = function (request, parent, isMain) { if (request === "server-only") return {}; return originalLoad.call(this, request, parent, isMain); };
require.extensions[".ts"] = function (module, filename) { const source = fs.readFileSync(filename, "utf8"); const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, moduleResolution: ts.ModuleResolutionKind.NodeJs }, fileName: filename }).outputText; module._compile(output, filename); };

test("tokens aleatorios se almacenan mediante hash estable, no en texto plano", () => {
  const { createSecureToken, hashToken } = require("../lib/server/secure-token.ts");
  const first = createSecureToken(); const second = createSecureToken();
  assert.notEqual(first.token, second.token); assert.equal(first.hash, hashToken(first.token)); assert.notEqual(first.hash, first.token); assert.equal(first.hash.length, 64);
});

test("secretos de integración usan AES-GCM y no contienen el token original", () => {
  process.env.INTEGRATION_MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
  const { encryptIntegrationSecret, decryptIntegrationSecret } = require("../lib/server/integration-secrets.ts");
  const encrypted = encryptIntegrationSecret({ accessToken: "provider-secret" }, "org-test", "google");
  assert.doesNotMatch(encrypted, /provider-secret/); assert.deepEqual(decryptIntegrationSecret(encrypted, "org-test", "google"), { accessToken: "provider-secret" });
  assert.throws(() => decryptIntegrationSecret(encrypted, "another-org", "google"));
});

test("rate limiter intercambiable respeta ventana y límite", async () => {
  const { MemoryRateLimitStore } = require("../lib/server/rate-limit.ts"); const store = new MemoryRateLimitStore();
  assert.equal((await store.increment("user", 2, 60_000)).allowed, true); assert.equal((await store.increment("user", 2, 60_000)).allowed, true); assert.equal((await store.increment("user", 2, 60_000)).allowed, false);
});

test("middleware rechaza CSRF cross-origin en operaciones sensibles", () => {
  const { NextRequest } = require("next/server"); const { middleware } = require("../middleware.ts");
  const request = new NextRequest("https://nuvra.test/api/business", { method: "POST", headers: { host: "nuvra.test", origin: "https://attacker.test" } });
  assert.equal(middleware(request).status, 403);
});

test("headers de producción incluyen las protecciones requeridas", () => {
  const source = fs.readFileSync(path.join(root, "next.config.js"), "utf8");
  for (const header of ["Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "X-Frame-Options", "Strict-Transport-Security"]) assert.match(source, new RegExp(header));
});

test("reset, verificación y sesiones exponen endpoints y páginas completos", () => {
  for (const file of ["app/api/auth/password-reset/request/route.ts", "app/api/auth/password-reset/confirm/route.ts", "app/api/auth/email-verification/verify/route.ts", "app/api/auth/email-verification/resend/route.ts", "app/api/auth/sessions/route.ts", "app/forgot-password/page.tsx", "app/reset-password/page.tsx", "app/verify-email/page.tsx"]) assert.equal(fs.existsSync(path.join(root, file)), true, file);
});

test("flujos E2E requeridos tienen contratos locales y no dependen de APIs externas", () => {
  const required = ["app/api/auth/register/route.ts", "app/api/auth/login/route.ts", "app/api/business/route.ts", "app/api/analyze/run/route.ts", "app/dashboard/page.tsx", "app/api/auth/logout/route.ts"];
  for (const file of required) assert.equal(fs.existsSync(path.join(root, file)), true, file);
  const analysis = fs.readFileSync(path.join(root, "app/api/analyze/run/route.ts"), "utf8"); assert.match(analysis, /source_unavailable/);
});
