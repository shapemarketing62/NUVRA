import test from "node:test";
import assert from "node:assert/strict";
import { analyzePageHtml } from "../services/website-analyzer/page-analyzer.ts";
import { BrandIdentityAnalyzer } from "../services/website-analyzer/brand-identity-analyzer.ts";

const page = (url, logo, color, font, title, imageAlt = "") => analyzePageHtml(url, `
  <style>:root{--brand:${color}}body{font-family:${font},sans-serif;color:${color}}</style>
  <header><img class="brand-logo" src="/${logo}.svg" alt="${logo}"></header>
  <main><h1>${title}</h1><h2>${title} para tu día</h2><p>${title} con una propuesta clara y cercana.</p><img src="/${logo}.jpg" alt="${imageAlt}"></main>
`);

const poorPages = [
  page("https://poor.example/", "marca-a", "#ff0000", "Arial", "Productos", ""),
  page("https://poor.example/nosotros", "marca-b", "#00ff00", "Times New Roman", "Quiénes somos", ""),
  page("https://poor.example/contacto", "marca-c", "#0000ff", "Courier New", "Contacto", ""),
];

const mediumPages = [
  page("https://medium.example/", "marca", "#222222", "Arial", "Productos para tu hogar", "Producto"),
  page("https://medium.example/catalogo", "marca", "#222222", "Arial", "Catálogo de productos", "Producto del catálogo"),
];

const strongWebPages = [
  page("https://strong.example/", "origen", "#4b2d20", "Inter", "Café de origen tostado con precisión", "Café Origen"),
  page("https://strong.example/cafes", "origen", "#4b2d20", "Inter", "Café de origen para cada método", "Paquete de Café Origen"),
  page("https://strong.example/historia", "origen", "#4b2d20", "Inter", "Origen, trazabilidad y tueste", "Equipo de Café Origen"),
];

const excellentSources = [
  { source: "instagram", aspects: { logo: 94, colors: 93, photography: 94, tone: 92, crossChannelConsistency: 95, visualRecognition: 91, differentiation: 90, proposalCoherence: 94 }, evidence: ["Instagram mantiene identidad, fotografía y propuesta coherentes con la web."], contradictions: [], observedPeriods: 3 },
  { source: "google_business_profile", aspects: { logo: 93, photography: 91, tone: 90, crossChannelConsistency: 94, proposalCoherence: 93, temporalConsistency: 92 }, evidence: ["El perfil comercial mantiene la misma presentación durante tres períodos observados."], contradictions: [], observedPeriods: 3 },
  { source: "youtube", aspects: { colors: 92, typography: 91, photography: 93, tone: 94, crossChannelConsistency: 93, visualRecognition: 92, differentiation: 91, temporalConsistency: 93 }, evidence: ["Las piezas audiovisuales sostienen los códigos visuales y verbales de la marca."], contradictions: [], observedPeriods: 3 },
];

const mediumSources = [{
  source: "instagram",
  aspects: { logo: 52, colors: 50, typography: 48, photography: 46, tone: 49, crossChannelConsistency: 52, differentiation: 30, proposalCoherence: 48 },
  evidence: ["El canal mantiene elementos básicos, aunque la presentación sigue siendo genérica."],
  contradictions: ["La diferenciación visual es limitada."],
  observedPeriods: 1,
}];

const goodSources = [{
  source: "instagram",
  aspects: { logo: 88, colors: 86, typography: 84, photography: 82, tone: 85, crossChannelConsistency: 88, visualRecognition: 78, differentiation: 80, proposalCoherence: 87 },
  evidence: ["La web y el perfil social sostienen códigos reconocibles y una propuesta diferenciada."],
  contradictions: [],
  observedPeriods: 2,
}];

test("identidad pobre, media, buena y excelente crece de forma progresiva", () => {
  const poor = BrandIdentityAnalyzer.analyze(poorPages);
  const medium = BrandIdentityAnalyzer.analyze(mediumPages, mediumSources);
  const good = BrandIdentityAnalyzer.analyze(strongWebPages, goodSources);
  const excellent = BrandIdentityAnalyzer.analyze(strongWebPages, excellentSources);
  console.log("NUVRA_BRAND_CALIBRATION=" + JSON.stringify({ poor, medium, good, excellent }));
  assert.ok(poor.score < medium.score, `${poor.score} debería ser menor que ${medium.score}`);
  assert.ok(medium.score < good.score, `${medium.score} debería ser menor que ${good.score}`);
  assert.ok(good.score < excellent.score, `${good.score} debería ser menor que ${excellent.score}`);
  assert.ok(excellent.evidenceConfidence > good.evidenceConfidence);
});

test("una web muy buena no equivale a evidencia multifuentemente excelente", () => {
  const webOnly = BrandIdentityAnalyzer.analyze(strongWebPages);
  const multiSource = BrandIdentityAnalyzer.analyze(strongWebPages, excellentSources);
  assert.ok(webOnly.performanceScore >= 80);
  assert.ok(webOnly.score <= 69);
  assert.equal(webOnly.coverage.independentSourceCount, 1);
  assert.ok(webOnly.coverage.unknownSources.includes("instagram"));
  assert.ok(multiSource.score > webOnly.score);
  assert.ok(multiSource.evidenceCeiling > webOnly.evidenceCeiling);
});

test("las fuentes desconocidas limitan la afirmación pero no se cuentan como problemas", () => {
  const webOnly = BrandIdentityAnalyzer.analyze(strongWebPages);
  assert.equal(webOnly.coverage.contradictionCount, 0);
  assert.equal(webOnly.problems.some((item) => /Instagram|TikTok|Google/i.test(item)), false);
  assert.ok(webOnly.limitations.some((item) => /una sola fuente/i.test(item)));
});
