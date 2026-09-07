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
require.extensions[".ts"] = function (module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, moduleResolution: ts.ModuleResolutionKind.NodeJs },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const {
  classifySearchProviderError,
  SearchProviderRequestError,
} = require("../services/intelligence/providers/search-provider.ts");
const { TavilySearchProvider } = require("../services/intelligence/providers/tavily-search-provider.ts");
const { SmartSearchProvider } = require("../services/intelligence/search-source-analyzer.ts");

test("clasifica estados HTTP sin conservar cuerpos", () => {
  assert.deepEqual(classifySearchProviderError({ status: 401 }), { category: "authentication", httpStatus: 401 });
  assert.deepEqual(classifySearchProviderError({ status: 403 }), { category: "authentication", httpStatus: 403 });
  assert.deepEqual(classifySearchProviderError({ status: 429 }), { category: "rate_limited", httpStatus: 429 });
  assert.deepEqual(classifySearchProviderError({ status: 432 }), { category: "plan_limit", httpStatus: 432 });
  for (const status of [500, 502, 503]) {
    assert.deepEqual(classifySearchProviderError({ status }), { category: "provider_5xx", httpStatus: status });
  }
});

test("clasifica timeout, red, respuesta inválida y error desconocido", () => {
  assert.deepEqual(classifySearchProviderError(Object.assign(new Error("cancelado"), { name: "AbortError" })), { category: "timeout" });
  assert.deepEqual(classifySearchProviderError(Object.assign(new Error("socket"), { code: "ETIMEDOUT" })), { category: "timeout" });
  assert.deepEqual(classifySearchProviderError(new TypeError("fetch failed")), { category: "network" });
  assert.deepEqual(classifySearchProviderError(new SyntaxError("JSON inválido")), { category: "invalid_response" });
  assert.deepEqual(classifySearchProviderError(new Error("otro")), { category: "unknown" });
});

test("Tavily convierte HTTP e invalid response en errores seguros sin leer el body", async () => {
  const previousKey = process.env.TAVILY_API_KEY;
  const previousFetch = global.fetch;
  process.env.TAVILY_API_KEY = "test-secret-key";
  try {
    let bodyRead = false;
    global.fetch = async () => ({ ok: false, status: 401, text: async () => { bodyRead = true; return "Authorization Bearer test-secret-key"; } });
    await assert.rejects(new TavilySearchProvider().search("consulta", {}), (error) => {
      assert.deepEqual(classifySearchProviderError(error), { category: "authentication", httpStatus: 401 });
      assert.doesNotMatch(error.message, /test-secret-key|authorization/i);
      return true;
    });
    assert.equal(bodyRead, false);

    global.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("invalid JSON"); } });
    await assert.rejects(new TavilySearchProvider().search("consulta", {}), (error) => {
      assert.deepEqual(classifySearchProviderError(error), { category: "invalid_response" });
      return true;
    });
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previousKey;
  }
});

test("SmartSearch registra y traza solo campos permitidos", async () => {
  const previousKey = process.env.TAVILY_API_KEY;
  const previousError = console.error;
  process.env.TAVILY_API_KEY = "super-secret-api-key";
  const logs = [];
  console.error = (...values) => logs.push(values);
  try {
    const provider = new SmartSearchProvider();
    provider.tavily = { search: async () => { throw new SearchProviderRequestError("rate_limited", { httpStatus: 429, cause: new Error("Authorization: Bearer super-secret-api-key") }); } };
    provider.ddg = { search: async () => [] };

    assert.deepEqual(await provider.search("consulta segura", {}), []);
    assert.deepEqual(provider.getAttempts("consulta segura"), [{
      provider: "tavily",
      status: "unavailable",
      errorType: "SearchProviderRequestError",
      errorCategory: "rate_limited",
      httpStatus: 429,
      resultCount: 0,
      attempt: 1,
    }, { provider: "duckduckgo", status: "no_results", resultCount: 0, attempt: 1 }]);

    const serialized = JSON.stringify({ logs, trace: provider.getAttempts("consulta segura") });
    assert.doesNotMatch(serialized, /super-secret-api-key|authorization|bearer/i);
  } finally {
    console.error = previousError;
    if (previousKey === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previousKey;
  }
});
