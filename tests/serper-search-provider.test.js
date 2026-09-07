const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) request = path.join(root, request.slice(2));
  return originalResolve.call(this, request, parent, isMain, options);
};
const originalLoad = Module._load;
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

const { SearchProviderRequestError } = require("../services/intelligence/providers/search-provider.ts");
const { SerperSearchProvider } = require("../services/intelligence/providers/serper-search-provider.ts");
const { TavilySearchProvider } = require("../services/intelligence/providers/tavily-search-provider.ts");
const { SmartSearchProvider } = require("../services/intelligence/search-source-analyzer.ts");
const { BusinessDiscoveryService } = require("../services/discovery/business-discovery-service.ts");
const { mergeDiscoveryStatus } = require("../services/discovery/platform-discovery-service.ts");

const business = { id: "qa", nombre: "Estética Dental argentina", rubro: "Odontología estética", ubicacion: "Recoleta, CABA, Argentina" };
const target = { name: business.nombre, category: business.rubro, location: business.ubicacion };

function preserveSearchEnv() {
  const values = { serper: process.env.SERPER_API_KEY, tavily: process.env.TAVILY_API_KEY };
  return () => {
    if (values.serper === undefined) delete process.env.SERPER_API_KEY; else process.env.SERPER_API_KEY = values.serper;
    if (values.tavily === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = values.tavily;
  };
}

test("Serper normaliza organic al contrato SearchResult", async () => {
  const restoreEnv = preserveSearchEnv();
  const previousFetch = global.fetch;
  process.env.SERPER_API_KEY = "fake-serper-key";
  try {
    global.fetch = async (_url, init) => {
      assert.equal(init.headers["X-API-KEY"], "fake-serper-key");
      return { ok: true, status: 200, json: async () => ({ organic: [{ title: "Estética Dental", link: "https://esteticadental.com.ar/", snippet: "Odontología estética en Recoleta", position: 2 }] }) };
    };
    assert.deepEqual(await new SerperSearchProvider().search("consulta", business), [{
      title: "Estética Dental",
      url: "https://esteticadental.com.ar/",
      snippet: "Odontología estética en Recoleta",
      metadata: { acquisitionProvider: "serper", position: 2 },
    }]);
  } finally { global.fetch = previousFetch; restoreEnv(); }
});

test("SmartSearch usa Serper primero y corta la cadena cuando responde", async () => {
  const restoreEnv = preserveSearchEnv();
  process.env.SERPER_API_KEY = "configured";
  process.env.TAVILY_API_KEY = "configured";
  try {
    const calls = [];
    const provider = new SmartSearchProvider();
    provider.serper = { search: async () => { calls.push("serper"); return [{ title: "Resultado", url: "https://example.com", snippet: "" }]; } };
    provider.tavily = { search: async () => { calls.push("tavily"); return []; } };
    provider.ddg = { search: async () => { calls.push("duckduckgo"); return []; } };
    assert.equal((await provider.search("consulta", business)).length, 1);
    assert.deepEqual(calls, ["serper"]);
    assert.deepEqual(provider.getAttempts("consulta"), [{ provider: "serper", status: "completed", resultCount: 1, attempt: 1 }]);
  } finally { restoreEnv(); }
});

test("SmartSearch cae Serper → Tavily → DuckDuckGo sin repetir providers", async () => {
  const restoreEnv = preserveSearchEnv();
  process.env.SERPER_API_KEY = "configured";
  process.env.TAVILY_API_KEY = "configured";
  try {
    const calls = [];
    const provider = new SmartSearchProvider();
    provider.serper = { search: async () => { calls.push("serper"); throw new SearchProviderRequestError("network"); } };
    provider.tavily = { search: async () => { calls.push("tavily"); throw new SearchProviderRequestError("plan_limit", { httpStatus: 432 }); } };
    provider.ddg = { search: async () => { calls.push("duckduckgo"); return []; } };
    assert.deepEqual(await provider.search("fallback", business), []);
    assert.deepEqual(calls, ["serper", "tavily", "duckduckgo"]);
    assert.equal(provider.getAttempts("fallback")[1].errorCategory, "plan_limit");
    assert.equal(provider.getAttempts("fallback")[1].httpStatus, 432);
  } finally { restoreEnv(); }
});

test("Tavily clasifica HTTP 432 como plan_limit sin leer body", async () => {
  const restoreEnv = preserveSearchEnv();
  const previousFetch = global.fetch;
  process.env.TAVILY_API_KEY = "fake-tavily-key";
  try {
    let bodyRead = false;
    global.fetch = async () => ({ ok: false, status: 432, text: async () => { bodyRead = true; return "private"; } });
    await assert.rejects(new TavilySearchProvider().search("consulta", business), (error) => error.category === "plan_limit" && error.httpStatus === 432);
    assert.equal(bodyRead, false);
  } finally { global.fetch = previousFetch; restoreEnv(); }
});

test("provider caído más fallback vacío conserva degradación", async () => {
  const restoreEnv = preserveSearchEnv();
  process.env.SERPER_API_KEY = "configured";
  delete process.env.TAVILY_API_KEY;
  try {
    const provider = new SmartSearchProvider();
    provider.serper = { search: async () => { throw new SearchProviderRequestError("network"); } };
    provider.ddg = { search: async () => [] };
    const discovery = await new BusinessDiscoveryService(provider).discover(target, { queries: [{ query: '"Estética Dental argentina"', intent: "identity" }] });
    assert.equal(discovery.queryAttempts[0].status, "provider_unavailable");
    assert.equal(discovery.status, "provider_unavailable");
    assert.equal(mergeDiscoveryStatus("provider_unavailable", "no_results"), "partial");
    assert.equal(mergeDiscoveryStatus("no_results", "no_results"), "no_results");
  } finally { restoreEnv(); }
});

test("fixture Serper encuentra Estética Dental y conserva EntityMatcher", async () => {
  const provider = { search: async () => [
    { title: "Estética Dental", url: "https://esteticadental.com.ar/", snippet: "Odontología estética en Recoleta, CABA", metadata: { acquisitionProvider: "serper", position: 1 } },
    { title: "Clínicas Estéticas Chile", url: "https://clinicasesteticas.cl/", snippet: "Clínicas en Santiago de Chile", metadata: { acquisitionProvider: "serper", position: 2 } },
    { title: "Dental DAS Group", url: "https://dentaldasgroup.example/", snippet: "Grupo dental", metadata: { acquisitionProvider: "serper", position: 3 } },
  ] };
  const discovery = await new BusinessDiscoveryService(provider).discover(target, { queries: [{ query: '"Estética Dental argentina" Recoleta', intent: "identity" }] });
  assert.equal(discovery.primaryWebUrl, "https://esteticadental.com.ar");
  assert.equal(discovery.allCandidates.find((candidate) => candidate.url.includes("clinicasesteticas.cl"))?.status, "rejected");
  assert.notEqual(discovery.allCandidates.find((candidate) => candidate.url.includes("dentaldasgroup"))?.status, "confirmed");
});

test("early-stop omite solo identidad/web redundante y conserva social/reviews", async () => {
  const calls = [];
  const provider = { search: async (query) => {
    calls.push(query);
    return [
      { title: "Estética Dental", url: "https://esteticadental.com.ar/", snippet: "Odontología estética en Recoleta, CABA" },
      { title: "Directorio odontológico", url: `https://directorio.example/${calls.length}`, snippet: "Odontología en Recoleta" },
      { title: "Nota sobre salud dental", url: `https://medio.example/${calls.length}`, snippet: "Salud dental en Argentina" },
    ];
  } };
  const discovery = await new BusinessDiscoveryService(provider).discover(target);
  assert.equal(discovery.primaryWebUrl, "https://esteticadental.com.ar");
  assert.equal(calls.length, 5);
  assert.ok(calls.some((query) => /Instagram/.test(query)));
  assert.ok(calls.some((query) => /opiniones/.test(query)));
});

test("early-stop no se activa con evidencia insuficiente", async () => {
  const calls = [];
  const provider = { search: async (query) => { calls.push(query); return []; } };
  await new BusinessDiscoveryService(provider).discover(target);
  assert.equal(calls.length, 8);
});

test("logs y traces no contienen keys ni headers", async () => {
  const restoreEnv = preserveSearchEnv();
  const previousError = console.error;
  process.env.SERPER_API_KEY = "private-serper-key";
  delete process.env.TAVILY_API_KEY;
  const logs = [];
  console.error = (...items) => logs.push(items);
  try {
    const provider = new SmartSearchProvider();
    provider.serper = { search: async () => { throw new SearchProviderRequestError("authentication", { httpStatus: 401, cause: new Error("X-API-KEY private-serper-key") }); } };
    provider.ddg = { search: async () => [] };
    await provider.search("segura", business);
    assert.doesNotMatch(JSON.stringify({ logs, trace: provider.getAttempts("segura") }), /private-serper-key|x-api-key|authorization/i);
  } finally { console.error = previousError; restoreEnv(); }
});
