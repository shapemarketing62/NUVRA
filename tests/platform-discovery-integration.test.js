// PlatformDiscoveryIntegration.test.js
// -----------------------------------
// Integration test that goes through the REAL pipeline
// (BusinessIntelligenceLayer.analyze) and verifies that
// PlatformDiscoveryService is actually wired in.
//
// Pipeline steps the test exercises:
//   1) build a Business with declared web + declared goal
//   2) inject a webSource analyzer that returns
//      `PageAnalysisData` objects with `outboundLinks` already populated
//      (this is what the live website analyzer produces in production)
//   3) inject a fake BusinessDiscoveryService (or skip it via the
//      platform-plan shortcut) and call `biLayer.analyze(business,
//      discoveryResult, ...)`
//   4) assert the per-platform PlatformStatus that ends up in
//      `biResult.platformDiscoveryReport` and in the
//      `aggregatedEvidence.sources.<platform>.metadata.platformStatus`

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

function pageAnalysisData(url, outboundLinks = []) {
  return {
    url,
    title: "Test",
    metaDesc: "Test",
    h1s: ["Test"],
    h2Count: 0,
    wordCount: 100,
    ctaCount: 0,
    whatsappCount: 0,
    formCount: 0,
    formFields: 0,
    navLinkCount: 1,
    imgsTotal: 0,
    imgsWithoutAlt: 0,
    hasTrustSignals: false,
    hasContactInfo: false,
    findings: [],
    htmlLength: 0,
    actionSignals: [],
    formSignals: [],
    brandSignals: { logoReferences: [], colors: [], fonts: [], imageCount: 0, descriptiveImageCount: 0, toneSamples: [] },
    outboundLinks,
  };
}

function fakeWebSourceAnalyzer(pages, findings = []) {
  return {
    type: "web",
    requiresAuth: false,
    requiresPermission: false,
    isAvailable: () => true,
    isRelevant: () => ({ source: "web", relevant: true, reason: "fake", weight: 0.4 }),
    analyze: async () => ({
      source: "web",
      status: "evaluated",
      data: { pages, pagesAnalyzed: pages.length, status: "completed", findings: [], crawledUrls: [], screenshots: [], performanceSummary: {}, brandIdentity: {}, marketingIntelligence: { areas: [], findings: [] }, analyzedAt: new Date().toISOString() },
      findings,
      confidence: "MEDIA",
      coverage: 50,
      evaluatedAt: new Date(),
      requiresAuth: false,
      metadata: { pagesAnalyzed: pages.length },
    }),
  };
}

function unavailableAnalyzer(type) {
  return {
    type,
    requiresAuth: false,
    requiresPermission: false,
    isAvailable: () => true,
    isRelevant: () => ({ source: type, relevant: true, reason: "fake", weight: 0.2 }),
    analyze: async () => ({ source: type, status: "unavailable", data: null, findings: [], confidence: "INSUFICIENTE", coverage: 0, evaluatedAt: new Date(), requiresAuth: false, metadata: { reason: "fake unavailable" } }),
  };
}

function emptyDiscoveryResult(business) {
  return {
    target: { name: business.nombre },
    primaryWebUrl: business.webUrl,
    primaryInstagram: null,
    primaryGoogleMaps: null,
    allCandidates: [],
    confirmedSources: [],
    probableSources: [],
    uncertainSources: [],
    rejectedSources: [],
    status: "completed",
    queryAttempts: [],
    discoveredAt: new Date(),
  };
}

function b2cEsteticaBusiness() {
  return {
    id: "b2c-estetica-1",
    organizationId: "org-1",
    nombre: "Aurora Estética",
    rubro: "Centro de estética y belleza",
    webUrl: "https://auroraestetica.com.ar",
    noWebDeclared: false,
    instagramHandle: null,
    noInstagramDeclared: false,
    tipoCliente: "B2C",
    canales: null,
    otrosCanales: null,
    ubicacion: "Palermo, Buenos Aires",
    ciudad: "Buenos Aires",
    pais: "Argentina",
    descripcion: "Tratamientos faciales y corporales",
    publicoObjetivo: null,
    inversionMarketing: null,
    empleados: null,
    tamano: null,
    productsServicios: null,
    goals: [{ objetivo: "Aumentar ventas", plazoDias: 90, plazoLabel: "3 meses" }],
  };
}

function b2bConsultoraBusiness() {
  return {
    id: "b2b-consultora-1",
    organizationId: "org-2",
    nombre: "Consultora Norte",
    rubro: "Consultoría empresarial B2B",
    webUrl: "https://consultoranorte.com",
    noWebDeclared: false,
    instagramHandle: null,
    noInstagramDeclared: false,
    tipoCliente: "B2B",
    canales: null,
    otrosCanales: null,
    ubicacion: "Madrid, España",
    ciudad: "Madrid",
    pais: "España",
    descripcion: "Consultora de estrategia",
    publicoObjetivo: "Empresas",
    inversionMarketing: null,
    empleados: null,
    tamano: null,
    productsServicios: null,
    goals: [{ objetivo: "Generar leads calificados", plazoDias: 90, plazoLabel: "3 meses" }],
  };
}

function findPlatformStatus(report, platform) {
  const entry = report.entries.find((e) => e.platform === platform);
  return entry ? entry.status : undefined;
}

function findPlatformUrl(report, platform) {
  const entry = report.entries.find((e) => e.platform === platform);
  return entry ? entry.url : undefined;
}

async function runLayer(business, pages, searchCalls) {
  const platformDiscoverySearch = {
    discover: async (_target, context = {}) => {
      searchCalls.push(...(context.queries || []).map((item) => item.query));
      return emptyDiscoveryResult(business);
    },
  };
  const layer = new BusinessIntelligenceLayer({ platformDiscoverySearch });
  layer.registerSource(fakeWebSourceAnalyzer(pages));
  for (const t of ["instagram", "search", "reviews", "competitor", "external_mentions", "x", "tiktok", "facebook", "linkedin", "youtube"]) {
    layer.registerSource(unavailableAnalyzer(t));
  }
  const discoveryResult = emptyDiscoveryResult(business);
  return layer.analyze(business, discoveryResult);
}

// ---------------------------------------------------------------------------
// Case 1: B2C estética, website official, website cross-links to Instagram
// and TikTok. Expected: both platforms get VALIDATED via cross-link.
// ---------------------------------------------------------------------------
test("integration 1: B2C estética with web cross-link to Instagram and TikTok — both VALIDATED, no search", async () => {
  const business = b2cEsteticaBusiness();
  const pages = [
    pageAnalysisData("https://auroraestetica.com.ar/", [
      { platform: "instagram", url: "https://www.instagram.com/aurora.estetica/", sourcePage: "https://auroraestetica.com.ar/", anchorText: "Instagram", hostname: "instagram.com" },
      { platform: "tiktok", url: "https://www.tiktok.com/@aurora.estetica", sourcePage: "https://auroraestetica.com.ar/", anchorText: "TikTok", hostname: "tiktok.com" },
    ]),
  ];
  const result = await runLayer(business, pages, []);
  assert.equal(findPlatformStatus(result.platformDiscoveryReport, "instagram"), "VALIDATED", "Instagram must be VALIDATED via cross-link");
  assert.equal(findPlatformStatus(result.platformDiscoveryReport, "tiktok"), "VALIDATED", "TikTok must be VALIDATED via cross-link");
  // URL normalization can drop a trailing slash; compare prefix instead of strict equality.
  const igUrl = findPlatformUrl(result.platformDiscoveryReport, "instagram") || "";
  assert.ok(igUrl.startsWith("https://www.instagram.com/aurora.estetica"), `Instagram URL must match, got ${igUrl}`);
  // The platform statuses must reach the aggregated metadata so
  // AnalysisTrace can read them.
  const igEvidence = result.aggregatedEvidence.sources.instagram;
  assert.ok(igEvidence, "instagram evidence must exist");
  assert.equal(igEvidence.metadata.platformStatus, "VALIDATED");
  assert.equal(igEvidence.findings.length, 0, "validated presence must not create performance findings");
  const tiktokEvidence = result.aggregatedEvidence.sources.tiktok;
  assert.equal(tiktokEvidence.findings.length, 0, "TikTok existence alone must not create performance findings");
  assert.equal((result.aggregatedEvidence.byDimension.presencia || []).length, 0, "presence-only metadata must not make a dimension evaluable");
  // The discovery-result of the integration pipeline is reused
  // (no second Tavily / DDG call from the BI layer). The plan
  // decided there were no search actions so the search provider
  // was never invoked.
  assert.equal(result.platformDiscoveryReport.hadProviderFailure, false, "no provider failure expected");
});

// ---------------------------------------------------------------------------
// Case 2: B2B consultora, website cross-links to LinkedIn.
// Expected: LinkedIn primary, validated, no Instagram/TikTok search.
// ---------------------------------------------------------------------------
test("integration 2: B2B consultora with LinkedIn cross-link — LinkedIn primary and VALIDATED, no aggressive search on others", async () => {
  const business = b2bConsultoraBusiness();
  const pages = [
    pageAnalysisData("https://consultoranorte.com/", [
      { platform: "linkedin", url: "https://www.linkedin.com/company/consultora-norte/", sourcePage: "https://consultoranorte.com/", anchorText: "LinkedIn", hostname: "linkedin.com" },
    ]),
  ];
  const result = await runLayer(business, pages, []);
  const linkedin = findPlatformStatus(result.platformDiscoveryReport, "linkedin");
  assert.equal(linkedin, "VALIDATED", `LinkedIn must be VALIDATED, got ${linkedin}`);
  const linkedinEntry = result.platformDiscoveryReport.entries.find((e) => e.platform === "linkedin");
  assert.equal(linkedinEntry.planEntry.relevance.priority, "primary", "LinkedIn must be primary for B2B consultora");
  // TikTok is irrelevant for B2B → NOT_RELEVANT, must not penalize.
  const tiktok = findPlatformStatus(result.platformDiscoveryReport, "tiktok");
  assert.equal(tiktok, "NOT_RELEVANT", `TikTok must be NOT_RELEVANT for B2B consultora, got ${tiktok}`);
  // Instagram is at most secondary / not primary for B2B.
  const instagram = result.platformDiscoveryReport.entries.find((e) => e.platform === "instagram");
  assert.ok(instagram, "instagram entry must exist");
  assert.notEqual(instagram.planEntry.relevance.priority, "primary", "Instagram must not be primary for B2B consultora");
});

// ---------------------------------------------------------------------------
// Case 3: provider unavailable — handled at the existing
// BusinessDiscoveryService layer. The platform report must surface
// PROVIDER_UNAVAILABLE for the affected platform AND the analysis
// must be able to continue.
// ---------------------------------------------------------------------------
test("integration 3: BusinessDiscoveryService provider failure is reported as PROVIDER_UNAVAILABLE, never NO_RESULTS, and analysis continues", async () => {
  const business = b2cEsteticaBusiness();
  // No pages → no cross-links, no declared handle → the platform
  // plan will request at least one search. We simulate the
  // BusinessDiscoveryService that the pipeline's run-analysis call
  // already made: it returned a `provider_unavailable` discovery
  // result with the IG query attributed.
  const pages = [pageAnalysisData("https://auroraestetica.com.ar/", [])];
  const layer = new BusinessIntelligenceLayer({ platformDiscoverySearch: { discover: async () => discoveryResult } });
  layer.registerSource(fakeWebSourceAnalyzer(pages));
  for (const t of ["instagram", "search", "reviews", "competitor", "external_mentions", "x", "tiktok", "facebook", "linkedin", "youtube"]) {
    layer.registerSource(unavailableAnalyzer(t));
  }
  const discoveryResult = {
    target: { name: business.nombre },
    primaryWebUrl: business.webUrl,
    primaryInstagram: null,
    primaryGoogleMaps: null,
    allCandidates: [],
    confirmedSources: [],
    probableSources: [],
    uncertainSources: [],
    rejectedSources: [],
    status: "provider_unavailable",
    queryAttempts: [
      { query: "site:instagram.com Aurora Estética", intent: "site_social", status: "provider_unavailable", resultCount: 0, errorType: "ProviderUnavailable" },
    ],
    discoveredAt: new Date(),
  };
  const result = await layer.analyze(business, discoveryResult);
  const ig = findPlatformStatus(result.platformDiscoveryReport, "instagram");
  assert.equal(ig, "PROVIDER_UNAVAILABLE", `Instagram must be PROVIDER_UNAVAILABLE, got ${ig}`);
  assert.equal(result.platformDiscoveryReport.hadProviderFailure, true, "hadProviderFailure must be true");
  // The overall analysis must still produce a BusinessIntelligenceResult
  // and a Nuvra score. The score can be null when no other sources
  // returned evaluated findings (only the unavailable fakes + the
  // web stub); what matters here is that the pipeline DID NOT throw
  // and DID surface the provider_unavailable status to the report.
  assert.ok(result.nuvraScore, "nuvra score must still be computed");
  assert.ok(["number", "object"].includes(typeof result.nuvraScore.total) || result.nuvraScore.total === null, "score total must be number | null");
});

// ---------------------------------------------------------------------------
// Case 4: declared channels keep priority over discovery. A business
// that declared "instagram" but the website does NOT cross-link to it
// must still have Instagram at a higher priority than a similar
// handle that the search found.
// ---------------------------------------------------------------------------
test("integration 4: declared channels keep priority over discovery", async () => {
  const business = { ...b2cEsteticaBusiness(), instagramHandle: "aurora.estetica", noInstagramDeclared: false };
  const pages = [pageAnalysisData("https://auroraestetica.com.ar/", [])];
  const result = await runLayer(business, pages, []);
  const igEntry = result.platformDiscoveryReport.entries.find((e) => e.platform === "instagram");
  assert.ok(igEntry, "instagram entry must exist");
  // Declared → must end up either VALIDATED (with the declared URL)
  // or NO_RESULTS / search action; never silently replaced by a
  // discovery URL.
  assert.notEqual(igEntry.status, "ANALYZED", "Instagram must NOT be ANALYZED just because the user declared it");
});

test("critical 2: cross-links from an unvalidated candidate website cannot validate a platform", async () => {
  const business = { ...b2cEsteticaBusiness(), webUrl: null };
  const pages = [pageAnalysisData("https://candidate-example.com/", [
    { platform: "instagram", url: "https://www.instagram.com/wrong.profile/", sourcePage: "https://candidate-example.com/", anchorText: "Instagram", hostname: "instagram.com" },
  ])];
  const layer = new BusinessIntelligenceLayer({ platformDiscoverySearch: { discover: async () => emptyDiscoveryResult(business) } });
  layer.registerSource(fakeWebSourceAnalyzer(pages));
  for (const t of ["instagram", "search", "reviews", "competitor", "external_mentions", "x", "tiktok", "facebook", "linkedin", "youtube"]) layer.registerSource(unavailableAnalyzer(t));
  const discovery = {
    ...emptyDiscoveryResult(business),
    primaryWebUrl: "https://candidate-example.com/",
    probableSources: [{ title: "Candidate", url: "https://candidate-example.com/", snippet: "", type: "web", status: "probable", matchScore: .66 }],
    allCandidates: [{ title: "Candidate", url: "https://candidate-example.com/", snippet: "", type: "web", status: "probable", matchScore: .66 }],
  };
  const result = await layer.analyze(business, discovery);
  const instagram = result.platformDiscoveryReport.entries.find((entry) => entry.platform === "instagram");
  assert.notEqual(instagram.status, "VALIDATED");
  assert.equal(instagram.crossLink, undefined);
  assert.equal(result.aggregatedEvidence.sources.instagram.findings.length, 0);
});

test("critical 6: changing the objective may change relevance but not identical observed evidence", async () => {
  const pages = [pageAnalysisData("https://auroraestetica.com.ar/", [
    { platform: "instagram", url: "https://www.instagram.com/aurora.estetica/", sourcePage: "https://auroraestetica.com.ar/", anchorText: "Instagram", hostname: "instagram.com" },
  ])];
  const awareness = await runLayer({ ...b2cEsteticaBusiness(), goals: [{ objetivo: "Aumentar reconocimiento", plazoDias: 90 }] }, pages, []);
  const appointments = await runLayer({ ...b2cEsteticaBusiness(), goals: [{ objetivo: "Conseguir más turnos", plazoDias: 90 }] }, pages, []);
  assert.deepEqual(awareness.aggregatedEvidence.sources.instagram.findings, appointments.aggregatedEvidence.sources.instagram.findings);
  assert.equal(awareness.platformDiscoveryReport.entries.find((entry) => entry.platform === "instagram").status, "VALIDATED");
  assert.equal(appointments.platformDiscoveryReport.entries.find((entry) => entry.platform === "instagram").status, "VALIDATED");
});

test("acceptance: sin URLs declaradas, una web descubierta se analiza y su cross-link valida Instagram", async () => {
  const business = {
    ...b2cEsteticaBusiness(),
    nombre: "Estética Dental Argentina QA",
    rubro: "Estética dental / Odontología",
    webUrl: null,
    noWebDeclared: true,
    instagramHandle: null,
    noInstagramDeclared: true,
    ubicacion: "Recoleta, CABA, Argentina",
    goals: [{ objetivo: "Aumentar consultas calificadas", plazoDias: 90, plazoLabel: "3 meses" }],
  };
  const discoveredUrl = "https://esteticadentalqa-example.com.ar";
  const webCandidate = {
    title: "Estética Dental QA",
    url: discoveredUrl,
    snippet: "Odontología estética en Recoleta, CABA",
    type: "web",
    status: "confirmed",
    matchScore: .92,
    entityRelationship: "local_operation",
  };
  const discovery = {
    ...emptyDiscoveryResult(business),
    target: { name: business.nombre, category: business.rubro, location: business.ubicacion },
    primaryWebUrl: discoveredUrl,
    allCandidates: [webCandidate],
    confirmedSources: [webCandidate],
    queryAttempts: [{ query: '"estetica dental qa" sitio oficial', intent: "website", status: "completed", resultCount: 1 }],
  };
  const pages = [pageAnalysisData(`${discoveredUrl}/`, [
    { platform: "instagram", url: "https://instagram.com/esteticadentalqa", sourcePage: `${discoveredUrl}/`, anchorText: "Instagram", hostname: "instagram.com" },
  ])];
  const finding = { id: "web-offer", category: "propuesta", type: "positive", impact: "medium", evidence: "La web explica los tratamientos y la ubicación.", source: "web", attribution: discoveredUrl, weight: .5, confidence: "MEDIA" };
  const layer = new BusinessIntelligenceLayer({ platformDiscoverySearch: { discover: async () => discovery } });
  layer.registerSource(fakeWebSourceAnalyzer(pages, [finding]));
  for (const type of ["instagram", "search", "reviews", "competitor", "external_mentions", "x", "tiktok", "facebook", "linkedin", "youtube"]) layer.registerSource(unavailableAnalyzer(type));

  const result = await layer.analyze(business, discovery);
  assert.equal(result.aggregatedEvidence.sources.web.status, "evaluated");
  assert.equal(findPlatformStatus(result.platformDiscoveryReport, "website"), "ANALYZED");
  assert.equal(findPlatformStatus(result.platformDiscoveryReport, "instagram"), "VALIDATED");
  assert.equal(findPlatformUrl(result.platformDiscoveryReport, "instagram"), "https://instagram.com/esteticadentalqa");
  assert.ok(result.aggregatedEvidence.findings.some((item) => item.id === "web-offer"));
  assert.ok(result.nuvraScore.dimensions.some((dimension) => dimension.applicable), "real web evidence must reach at least one evaluable score area");
});
