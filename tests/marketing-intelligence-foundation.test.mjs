import test from "node:test";
import assert from "node:assert/strict";
import { analyzePageHtml } from "../services/website-analyzer/page-analyzer.ts";
import { WebsiteMarketingAnalyzer } from "../services/website-analyzer/website-marketing-analyzer.ts";
import { MarketingKnowledgeEngine } from "../services/knowledge/marketing-knowledge-engine.ts";
import { marketingKnowledge } from "../services/knowledge/marketing-knowledge-catalog.ts";
import { PlatformMarketingIntelligence } from "../services/intelligence/platform-marketing-intelligence.ts";
import { buildCrossChannelMarketingIntelligence } from "../services/intelligence/cross-channel-marketing-intelligence.ts";

const rendered = {
  viewport: { width: 1280, height: 720 }, bodyWidthPx: 1280, horizontalOverflowPx: 0,
  sectionCount: 4, landmarkCount: 4, listCount: 1, cardLikeGroupCount: 2,
  visibleImageCount: 2, imagesAboveFold: 1, dominantColors: ["rgb(20, 20, 20)", "rgb(255, 255, 255)"], fontFamilies: ["Inter"], longParagraphCount: 0,
  textSamples: [
    { tag: "h1", text: "Café de especialidad en Palermo", fontFamily: "Inter", fontSizePx: 48, fontWeight: 600, lineHeightPx: 52, letterSpacingPx: 0, color: "rgb(20, 20, 20)", backgroundColor: "rgb(255, 255, 255)", widthPx: 620, topPx: 110 },
    { tag: "p", text: "Tostamos café y podés reservar una mesa.", fontFamily: "Inter", fontSizePx: 17, fontWeight: 400, lineHeightPx: 26, letterSpacingPx: 0, color: "rgb(70, 70, 70)", backgroundColor: "rgb(255, 255, 255)", widthPx: 540, topPx: 190 },
  ],
  actionSamples: [{ label: "Reservar mesa", topPx: 260, widthPx: 160, heightPx: 44, color: "rgb(255, 255, 255)", backgroundColor: "rgb(30, 60, 150)", visible: true }],
};

test("Website Marketing Intelligence evalúa estructura, jerarquía y CTA según contexto", () => {
  const page = analyzePageHtml("https://cafeteria.example/", `<!doctype html><html><head><title>Café Palermo</title><meta name="description" content="Café de especialidad"></head><body><header><nav><a href="/menu">Menú</a><a href="/ubicacion">Ubicación</a><a href="/contacto">Contacto</a></nav></header><main><section><h1>Café de especialidad en Palermo</h1><p>Tostamos café y podés reservar una mesa.</p><a class="button" href="/reservar">Reservar mesa</a></section><section><h2>Nuestro café</h2><ul><li>Tostado propio</li></ul><img src="cafe.jpg" alt="Taza de café"></section><section><h2>Reseñas de clientes</h2><p>Excelente atención.</p></section></main><footer>Dirección y horarios</footer></body></html>`, 500, rendered);
  const result = WebsiteMarketingAnalyzer.analyze([page], { industry: "Cafetería de especialidad", customerType: "B2C", objective: "Aumentar reservas" });
  assert.equal(result.context.expectedPrimaryIntent, "reserve");
  assert.equal(result.areas.find((item) => item.area === "hierarchy")?.status, "evaluated");
  assert.ok(result.areas.find((item) => item.area === "conversion")?.positiveSignals.some((item) => item.includes("reservar")));
  assert.ok(result.areas.every((item) => item.knowledgeRuleIds.every((id) => marketingKnowledge.getRule(id))));
});

test("bajo contraste medible produce evidencia objetiva, no una preferencia estética", () => {
  const lowContrast = structuredClone(rendered);
  lowContrast.textSamples[1].color = "rgb(180, 180, 180)";
  const page = analyzePageHtml("https://example.test/", "<html><head><title>Servicio profesional</title></head><body><h1>Servicio claro</h1><p>Texto importante para decidir.</p></body></html>", 300, lowContrast);
  const result = WebsiteMarketingAnalyzer.analyze([page], { industry: "Servicios profesionales", objective: "Conseguir consultas" });
  assert.ok(result.areas.find((item) => item.area === "color")?.frictions.length);
  assert.ok(result.findings.some((item) => item.title === "Contraste de texto insuficiente"));
});

test("sin web renderizada queda no evaluable y no se convierte en rendimiento malo", () => {
  const result = WebsiteMarketingAnalyzer.analyze([], { industry: "Estudio contable", objective: "Conseguir reuniones" });
  assert.equal(result.findings.length, 0);
  assert.ok(result.areas.every((item) => item.status === "not_evaluable"));
});

test("Knowledge Engine distingue vigencia y reglas superseded", () => {
  const source = { id: "source", publisher: "Official", title: "Doc", url: "https://example.test", publishedAt: "2025-01-01", retrievedAt: "2026-01-01", type: "official_documentation", authorityLevel: "primary" };
  const base = { domain: "platform", platform: "youtube", surface: "home", category: "recommendations", principle: "Principio", strategicMeaning: "Significado", evidenceLevel: "OFFICIAL", confidence: "ALTA", sourceId: "source", sourceDate: "2025-01-01", validFrom: "2025-01-01", lastVerifiedAt: "2026-01-01", version: "1.0.0", tags: ["youtube"] };
  const engine = new MarketingKnowledgeEngine([
    { ...base, id: "active", supersededAt: null },
    { ...base, id: "old", supersededAt: "2025-06-01" },
    { ...base, id: "future", validFrom: "2027-01-01", supersededAt: null },
  ], [source]);
  assert.deepEqual(engine.retrieve({ asOf: new Date("2026-01-01") }).map((item) => item.rule.id), ["active"]);
  assert.deepEqual(engine.retrieve({ asOf: new Date("2025-03-01") }).map((item) => item.rule.id).sort(), ["active", "old"].sort());
});

test("las reglas de plataforma conservan fuente, surface y nivel oficial sin pesos secretos", () => {
  const youtube = marketingKnowledge.retrieve({ platform: "youtube", surface: "home" });
  assert.ok(youtube.length);
  assert.equal(youtube[0].rule.evidenceLevel, "OFFICIAL");
  assert.equal(youtube[0].source.authorityLevel, "primary");
  assert.equal("weight" in youtube[0].rule, false);
});

test("una plataforma sin entidad validada queda no evaluada y no se interpreta como desempeño bajo", () => {
  const result = PlatformMarketingIntelligence.analyze({
    platform: "reddit", status: "unavailable", entityValidated: false,
    profile: null, content: [], publicMetrics: {},
    coverage: { profile: false, bio: false, content: "none", comments: "none", mentions: "none", metrics: "none" },
    acquisitionMethods: ["search_index"],
  });
  assert.equal(result.status, "not_evaluated");
  assert.deepEqual(result.observedSignals, []);
  assert.ok(result.missingButNotNegative[0].includes("no se interpreta como desempeño bajo"));
});

test("TikTok parcial conserva solo señales observadas y declara sus límites", () => {
  const result = PlatformMarketingIntelligence.analyze({
    platform: "tiktok", status: "partial", entityValidated: true,
    profile: { bio: "Café de especialidad en Buenos Aires" },
    content: [{ text: "Cómo preparamos un flat white", format: "video" }], publicMetrics: {},
    coverage: { profile: true, bio: true, content: "partial", comments: "none", mentions: "none", metrics: "none" },
    acquisitionMethods: ["search_index"],
  });
  assert.equal(result.status, "partial");
  assert.ok(result.observedSignals.some((item) => item.field === "bio"));
  assert.ok(result.observedSignals.some((item) => item.field === "formats"));
  assert.ok(result.missingButNotNegative.includes("comentarios no evaluados"));
  assert.ok(result.limitations.some((item) => item.includes("integración oficial")));
});

test("Google Business Profile usa datos oficiales observados sin completar campos ausentes", () => {
  const result = PlatformMarketingIntelligence.analyze({
    platform: "google_business_profile", status: "analyzed", entityValidated: true,
    profile: { category: "Cafetería", address: "Palermo, Buenos Aires", rating: 4.6, reviewCount: 80 },
    content: [], publicMetrics: { rating: 4.6, reviewCount: 80 },
    coverage: { profile: true, bio: true, content: "none", comments: "partial", mentions: "none", metrics: "public" },
    acquisitionMethods: ["official_api"],
  });
  assert.equal(result.status, "evaluated");
  assert.ok(result.observedSignals.some((item) => item.field === "rating"));
  assert.equal(result.observedSignals.some((item) => item.field === "openingHours"), false);
  assert.ok(result.knowledge.some((item) => item.ruleId === "google.local.factors"));
});

test("la prioridad multicanal cambia con el modelo y objetivo sin fabricar desempeño", () => {
  const baseProfile = {
    businessName: "Negocio", originalIndustry: "Servicios", commercialModel: "local_service", operatingMode: "physical", localDependency: "high",
    customerType: "B2C", primaryCustomerAction: "visitar el local", primaryChannel: null,
    decisionFactors: { trust: .7, price: .4, reviews: .9, proximity: .9 },
    goal: { goalOriginalText: "Conseguir más visitas", interpretation: { goalType: "visits" } },
  };
  const evidence = (status, findings = []) => ({ status, findings, metadata: {}, data: null });
  const aggregated = { sources: { reviews: evidence("evaluated", [{}]), web: evidence("evaluated"), search: evidence("evaluated"), linkedin: evidence("evaluated"), instagram: evidence("unavailable") } };
  const local = buildCrossChannelMarketingIntelligence(baseProfile, aggregated);
  const b2b = buildCrossChannelMarketingIntelligence({ ...baseProfile, commercialModel: "professional", operatingMode: "online", localDependency: "low", customerType: "B2B", primaryCustomerAction: "solicitar una reunión", decisionFactors: { ...baseProfile.decisionFactors, reviews: .2, proximity: .1 }, goal: { goalOriginalText: "Conseguir reuniones con empresas", interpretation: { goalType: "consultations" } } }, aggregated);
  assert.equal(local.signals.find((item) => item.role === "primary")?.source, "reviews");
  assert.equal(b2b.signals.find((item) => item.role === "primary")?.source, "linkedin");
  assert.equal(local.signals.find((item) => item.source === "instagram")?.role, "not_evaluated");
});

test("knowledge interpreta evidencia pero no genera acciones automáticamente", () => {
  const result = PlatformMarketingIntelligence.analyze({
    platform: "youtube", status: "analyzed", entityValidated: true,
    profile: { description: "Consejos del estudio" }, content: [{ title: "Guía", format: "video" }], publicMetrics: {},
    coverage: { profile: true, bio: true, content: "partial", comments: "none", mentions: "none", metrics: "none" }, acquisitionMethods: ["public_page"],
  });
  assert.ok(result.knowledge.length > 0);
  assert.equal("actions" in result, false);
  assert.equal("recommendations" in result, false);
});
