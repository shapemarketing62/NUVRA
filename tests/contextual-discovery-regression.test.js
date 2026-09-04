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
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, moduleResolution: ts.ModuleResolutionKind.NodeJs },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { buildDiscoveryQueries } = require("../services/discovery/discovery-query-builder.ts");
const { BusinessDiscoveryService } = require("../services/discovery/business-discovery-service.ts");
const { SearchProviderUnavailableError, SmartSearchProvider } = require("../services/intelligence/search-source-analyzer.ts");
const { EntityMatcher } = require("../services/discovery/entity-matcher.ts");
const { PlatformDiscoveryPlanner } = require("../services/discovery/platform-discovery-planner.ts");
const { PlatformDiscoveryService } = require("../services/discovery/platform-discovery-service.ts");
const { buildTerminalSourceProjection } = require("../services/discovery/source-status-lifecycle.ts");
const { getDashboardSourceLabel } = require("../lib/dashboard-view-model.ts");

const target = {
  name: "Estética Dental Argentina QA",
  category: "odontología",
  location: "Recoleta, CABA, Argentina",
  tipoCliente: "B2C",
};

function searchResult(title, url, snippet, metadata) { return { title, url, snippet, ...(metadata ? { metadata } : {}) }; }

test("bootstrap produce consultas reales por marca, núcleo, ubicación, website y local", () => {
  const queries = buildDiscoveryQueries({ ...target, name: "Estética Dental argentina", category: "Estética dental" });
  assert.ok(queries.some((item) => item.query === '"Estética Dental argentina"' && item.intent === "identity"));
  assert.ok(queries.some((item) => item.query.includes('"estetica dental"') && item.intent === "website"));
  assert.ok(queries.some((item) => item.query.includes("Recoleta") && item.intent === "identity"));
  assert.ok(queries.some((item) => item.intent === "local_reviews"));
});

test("website discovery valida un dominio oficial aunque el nombre público omita el país", async () => {
  const provider = { search: async (query) => query.includes("sitio oficial") ? [searchResult("Estética Dental QA", "https://esteticadentalqa-example.com.ar/", "Odontología estética en Recoleta, CABA")] : [] };
  const result = await new BusinessDiscoveryService(provider).discover(target, { intents: ["identity", "website", "local_reviews"] });
  assert.equal(result.primaryWebUrl, "https://esteticadentalqa-example.com.ar");
  assert.equal(result.confirmedSources.find((item) => item.type === "web")?.status, "confirmed");
  assert.ok(result.queryAttempts.some((attempt) => attempt.intent === "website" && attempt.status === "completed"));
});

test("entity matcher acepta el núcleo de marca y rechaza una ubicación contradictoria", () => {
  const base = { title: "Estética Dental", url: "https://esteticadental.com.ar/", snippet: "Odontología estética", type: "web" };
  const recoleta = EntityMatcher.evaluateCandidate({ ...base, snippet: `${base.snippet} en Recoleta, CABA` }, { name: "Estética Dental Argentina", category: "odontología", location: "Recoleta, CABA, Argentina" });
  const cordoba = EntityMatcher.evaluateCandidate({ ...base, snippet: `${base.snippet} en Córdoba` }, { name: "Estética Dental Argentina", category: "odontología", location: "Recoleta, CABA, Argentina" });
  assert.equal(recoleta.status, "confirmed");
  assert.equal(cordoba.status, "rejected");
});

test("website desconocida se intenta descubrir y no consume el cupo de plataformas opcionales", () => {
  const plan = PlatformDiscoveryPlanner.plan({ target: { businessId: "qa", name: "Clínica QA", industry: "odontología estética", location: "Recoleta, CABA", website: null, phone: null, customerType: "B2C", objective: "Aumentar consultas", declaredChannels: null } });
  const website = plan.entries.find((entry) => entry.platform === "website");
  assert.equal(website.action, "search_only");
  assert.match(website.reason, /unknown|discover|sitio|website/i);
  assert.ok(PlatformDiscoveryPlanner.selectForExecution(plan).includes(website));
});

test("cross-link de website oficial valida Instagram y conserva las consultas del bootstrap en trace", async () => {
  const webCandidate = EntityMatcher.evaluateCandidate({ title: "Estética Dental QA", url: "https://esteticadentalqa-example.com.ar/", snippet: "Odontología en Recoleta", type: "web" }, target);
  const discovery = {
    target, primaryWebUrl: "https://esteticadentalqa-example.com.ar", primaryInstagram: null, primaryGoogleMaps: null,
    allCandidates: [webCandidate], confirmedSources: [webCandidate], probableSources: [], uncertainSources: [], rejectedSources: [], status: "completed",
    queryAttempts: [{ query: '"estetica dental qa" sitio oficial', intent: "website", status: "completed", resultCount: 1 }], discoveredAt: new Date(),
  };
  const report = await PlatformDiscoveryService.run({
    target: { businessId: "qa", name: target.name, industry: target.category, location: target.location, website: discovery.primaryWebUrl, phone: null, customerType: "B2C", objective: "Aumentar consultas", declaredChannels: null },
    officialWebsiteValidated: true,
    crossLinks: [{ platform: "instagram", url: "https://instagram.com/esteticadentalqa", sourcePage: "https://esteticadentalqa-example.com.ar/", anchorText: "Instagram", hostname: "instagram.com" }],
    _prebuiltDiscovery: discovery,
    sourceEvidence: { web: { source: "web", status: "evaluated", data: {}, findings: [{ id: "web-offer", category: "propuesta", type: "positive", impact: "medium", evidence: "La web explica tratamientos de estética dental.", source: "web", attribution: discovery.primaryWebUrl, weight: .4, confidence: "MEDIA" }], confidence: "MEDIA", coverage: 30, evaluatedAt: new Date(), requiresAuth: false } },
  });
  assert.equal(report.entries.find((entry) => entry.platform === "website")?.status, "ANALYZED");
  assert.equal(report.entries.find((entry) => entry.platform === "instagram")?.status, "VALIDATED");
  assert.equal(report.entries.find((entry) => entry.platform === "instagram")?.url, "https://instagram.com/esteticadentalqa");
  assert.ok(report.entries.find((entry) => entry.platform === "website")?.queryAttempts.some((attempt) => attempt.intent === "website"));
});

test("una ejecución terminal nunca proyecta fuentes como pendientes", () => {
  const evidence = (source, status, metadata = {}) => ({ source, status, data: null, findings: [], confidence: "INSUFICIENTE", coverage: 0, evaluatedAt: new Date(), requiresAuth: false, metadata });
  const projection = buildTerminalSourceProjection({ businessId: "qa", sources: {
    web: evidence("web", "unavailable", { outcome: "no_results" }),
    search: evidence("search", "unavailable", { outcome: "provider_unavailable" }),
    instagram: evidence("instagram", "requires_auth"),
    tiktok: evidence("tiktok", "not_relevant"),
  }, findings: [], byCategory: {}, byDimension: {}, deduplicated: [], evaluatedAt: new Date() });
  assert.deepEqual(projection.statuses, { web: "not_found", search: "unavailable", instagram: "requires_auth", tiktok: "not_relevant" });
  assert.equal(getDashboardSourceLabel("not_found"), "No encontrada");
  assert.equal(getDashboardSourceLabel("unavailable"), "No disponible");
  assert.equal(getDashboardSourceLabel("not_attempted"), "No evaluada");
  assert.equal(getDashboardSourceLabel("not_relevant"), "No prioritaria");
  assert.doesNotMatch(Object.values(projection.messages).join(" "), /pendiente/i);
});

test("Search sin resultados y Search caído conservan estados terminales distintos", () => {
  const evidence = (metadata) => ({ source: "search", status: "unavailable", data: null, findings: [], confidence: "INSUFICIENTE", coverage: 0, evaluatedAt: new Date(), requiresAuth: false, metadata });
  const base = { businessId: "qa", findings: [], byCategory: {}, byDimension: {}, deduplicated: [], evaluatedAt: new Date() };
  assert.equal(buildTerminalSourceProjection({ ...base, sources: { search: evidence({ outcome: "no_results" }) } }).statuses.search, "not_found");
  assert.equal(buildTerminalSourceProjection({ ...base, sources: { search: evidence({ outcome: "provider_unavailable" }) } }).statuses.search, "unavailable");
});

test("discovery conserva el provider real por consulta sin exponer credenciales", async () => {
  const completed = await new BusinessDiscoveryService({
    search: async () => [searchResult("Clínica QA", "https://clinica-qa.example", "Odontología en Recoleta", { acquisitionProvider: "tavily" })],
  }).discover({ ...target, name: "Clínica QA" }, { queries: [{ query: '"Clínica QA"', intent: "identity" }] });
  assert.deepEqual(completed.queryAttempts[0].providers, [{ provider: "tavily", status: "completed" }]);

  const unavailable = await new BusinessDiscoveryService({
    search: async () => { throw new SearchProviderUnavailableError([
      { provider: "tavily", status: "unavailable", errorType: "TypeError" },
      { provider: "duckduckgo", status: "unavailable", errorType: "Error" },
    ]); },
  }).discover({ ...target, name: "Clínica QA" }, { queries: [{ query: '"Clínica QA"', intent: "identity" }] });
  assert.equal(unavailable.status, "provider_unavailable");
  assert.deepEqual(unavailable.queryAttempts[0].providers, [
    { provider: "tavily", status: "unavailable", errorType: "TypeError" },
    { provider: "duckduckgo", status: "unavailable", errorType: "Error" },
  ]);
  assert.doesNotMatch(JSON.stringify(unavailable), /api[_-]?key|authorization|database_url/i);
});

test("discovery conserva provider aun cuando una consulta válida no devuelve resultados", async () => {
  const provider = {
    search: async () => [],
    getAttempts: () => [{ provider: "tavily", status: "no_results" }],
  };
  const result = await new BusinessDiscoveryService(provider).discover(
    { ...target, name: "Clínica sin índice" },
    { queries: [{ query: '"Clínica sin índice"', intent: "identity" }] },
  );
  assert.equal(result.status, "no_results");
  assert.deepEqual(result.queryAttempts[0].providers, [{ provider: "tavily", status: "no_results" }]);
});

test("SmartSearchProvider audita Tavily sin resultados sin alterar el fallback", async () => {
  const previousKey = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = ["configured", "for", "test"].join("-");
  try {
    const provider = new SmartSearchProvider();
    provider.tavily = { search: async () => [] };
    provider.ddg = { search: async () => { throw new Error("DDG no debe ejecutarse"); } };
    const results = await provider.search("consulta sin resultados", target);
    assert.deepEqual(results, []);
    assert.deepEqual(provider.getAttempts("consulta sin resultados"), [{ provider: "tavily", status: "no_results" }]);
  } finally {
    if (previousKey === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previousKey;
  }
});
