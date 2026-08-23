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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, moduleResolution: ts.ModuleResolutionKind.NodeJs },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { BusinessIntelligenceLayer } = require("../services/intelligence/business-intelligence-layer.ts");
const { executeSource } = require("../services/intelligence/source-execution.ts");
const { runDiagnosticEngine } = require("../services/diagnostic/diagnostic-engine.ts");
const { runStrategyEngine } = require("../services/strategy/strategy-engine.ts");

const business = {
  id: "numa-test",
  organizationId: "org-test",
  nombre: "NÜMA Home",
  rubro: "Tienda de muebles y decoración para el hogar",
  webUrl: "https://www.numahome.com.ar/",
  instagramHandle: "numahome.ok",
  ubicacion: "Buenos Aires",
  ciudad: "Buenos Aires",
  tipoCliente: "B2C",
  canales: "Web, Instagram",
  otrosCanales: null,
  descripcion: "Muebles y objetos para el hogar",
  noWebDeclared: false,
  noInstagramDeclared: false,
  goals: [{ objetivo: "Aumentar ventas", plazoDias: 90, plazoLabel: "3 meses" }],
};

function finding(source, category = "presencia") {
  return { id: `${source}-finding`, category, type: "positive", impact: "medium", evidence: `Evidencia verificable de ${source}`, source, attribution: `${source}.test`, weight: 0.5, confidence: "ALTA" };
}

function fakeSource(type, outcome = "ok", category = "presencia") {
  return {
    type,
    requiresAuth: false,
    requiresPermission: false,
    isAvailable: () => true,
    isRelevant: () => ({ source: type, relevant: true, reason: "Fuente de prueba relevante", weight: 0.2 }),
    analyze: async () => {
      if (outcome === "fail") throw Object.assign(new Error(`${type}_provider_down`), { code: "PROVIDER_DOWN" });
      return { source: type, status: "evaluated", data: { provider: type }, findings: [finding(type, category)], confidence: "ALTA", coverage: 75, evaluatedAt: new Date(), requiresAuth: false };
    },
  };
}

async function analyzeWithFailures(failures) {
  const layer = new BusinessIntelligenceLayer();
  const categories = { web: "conversion", instagram: "redes", search: "adquisicion", reviews: "posicionamiento", competitor: "propuesta", external_mentions: "posicionamiento", x: "redes" };
  for (const type of Object.keys(categories)) layer.registerSource(fakeSource(type, failures.includes(type) ? "fail" : "ok", categories[type]));
  const result = await layer.analyze(business);
  const legacyFindings = layer.getLegacyFindings(result);
  const dimensions = layer.getLegacyDimensions(result);
  const score = { total: result.nuvraScore.total, dimensions, weights: {}, allFindings: legacyFindings, coverage: result.coverage.total };
  const context = { nombre: business.nombre, rubro: business.rubro, objetivo: business.goals[0].objetivo, plazoDias: 90, plazoLabel: "3 meses", descripcion: business.descripcion, ubicacion: business.ubicacion, tipoCliente: business.tipoCliente, businessProfile: result.businessProfile };
  const diagnosis = await runDiagnosticEngine(context, score, legacyFindings, result.businessProfile);
  const strategy = await runStrategyEngine(context, diagnosis, score, legacyFindings, result.businessProfile);
  return { ...result, diagnosis, strategy };
}

test("si web falla, Instagram y Search permiten completar perfil y score", async () => {
  const result = await analyzeWithFailures(["web"]);
  assert.equal(result.aggregatedEvidence.sources.web.status, "unavailable");
  assert.equal(result.aggregatedEvidence.sources.instagram.status, "evaluated");
  assert.equal(result.aggregatedEvidence.sources.search.status, "evaluated");
  assert.ok(result.businessProfile);
  assert.equal(typeof result.nuvraScore.total, "number");
  assert.ok(result.diagnosis.summary);
  assert.ok(result.strategy.actions.length > 0);
  assert.ok(result.aggregatedEvidence.findings.length >= 2);
  assert.equal(result.aggregatedEvidence.sources.web.metadata.execution.attempts, 2);
});

test("si Search falla, la evidencia web conserva el análisis", async () => {
  const result = await analyzeWithFailures(["search"]);
  assert.equal(result.aggregatedEvidence.sources.search.status, "unavailable");
  assert.equal(result.aggregatedEvidence.sources.web.status, "evaluated");
  assert.equal(typeof result.digitalScore.total, "number");
  assert.equal(typeof result.nuvraScore.total, "number");
  assert.ok(result.diagnosis.summary);
  assert.ok(result.strategy.actions.length > 0);
});

test("si Competitors y Mentions fallan, el resto continúa", async () => {
  const result = await analyzeWithFailures(["competitor", "external_mentions"]);
  assert.equal(result.aggregatedEvidence.sources.competitor.status, "unavailable");
  assert.equal(result.aggregatedEvidence.sources.external_mentions.status, "unavailable");
  assert.equal(result.aggregatedEvidence.sources.web.status, "evaluated");
  assert.equal(result.aggregatedEvidence.sources.reviews.status, "evaluated");
  assert.ok(result.coverage.evaluatedSources.length >= 3);
  assert.equal(typeof result.nuvraScore.total, "number");
  assert.ok(result.diagnosis.summary);
  assert.ok(result.strategy.actions.length > 0);
});

test("un timeout cancela la fuente, reintenta y deja auditoría segura", async () => {
  let calls = 0;
  const result = await executeSource({
    source: "search",
    policy: { timeoutMs: 20, retries: 1, backoffMs: 1 },
    operation: (signal) => new Promise((_, reject) => {
      calls += 1;
      signal.addEventListener("abort", () => reject(Object.assign(new Error("provider timeout token=secret"), { name: "AbortError" })), { once: true });
    }),
  });
  assert.equal(calls, 2);
  assert.equal(result.audit.status, "error");
  assert.equal(result.audit.attempts, 2);
  assert.equal(result.audit.failure.category, "timeout");
  assert.doesNotMatch(JSON.stringify(result.audit), /token=secret/);
});

test("el validador SSRF usa resolución del sistema y mantiene bloqueos privados", () => {
  const validator = fs.readFileSync(path.join(root, "services/website-analyzer/url-validator.ts"), "utf8");
  assert.match(validator, /dns\.lookup\(hostname, \{ all: true/);
  assert.doesNotMatch(validator, /dns\.resolve4\(/);
  assert.match(validator, /isPrivateIp\(ip\)/);
});
