import test from "node:test";
import assert from "node:assert/strict";
import { NuvraScoreCalculator, SCORE_METHODOLOGY_VERSION } from "../services/intelligence/nuvra-score-calculator.ts";

const slugs = ["presencia", "conversion", "posicionamiento", "propuesta", "redes", "adquisicion", "identidad", "retencion"];
const finding = (id, category, source, type, impact, evidence, confidence = "ALTA") => ({ id, category, source, type, impact, evidence, attribution: `https://${source}.example/${id}`, confidence, weight: 1 });
function evaluate(name, objective, findings, extras = {}) {
  const byDimension = Object.fromEntries(slugs.map((slug) => [slug, findings.filter((item) => item.category === slug)]));
  const sources = Object.fromEntries([...new Set(findings.map((item) => item.source))].map((source) => [source, { source, status: "evaluated", data: {}, findings: findings.filter((item) => item.source === source), confidence: "ALTA", coverage: 80, evaluatedAt: new Date("2026-08-24"), requiresAuth: false }]));
  if (extras.identity) { sources.web ||= { source: "web", status: "evaluated", findings: [], data: {}, confidence: "ALTA", coverage: 80, evaluatedAt: new Date(), requiresAuth: false }; sources.web.data.brandIdentity = extras.identity; }
  const aggregated = { businessId: name, sources, findings, byDimension, byCategory: byDimension, deduplicated: findings, evaluatedAt: new Date(), multisourceBrandIdentity: extras.identity };
  const coverage = { total: extras.coverage ?? 80, overallMarketingCoverage: extras.coverage ?? 80, bySource: {}, evaluatedSources: Object.keys(sources), missingSources: [], relevantSources: Object.keys(sources), requiresAuthSources: [], canCalculateNuvraScore: true, reason: "fixture" };
  return NuvraScoreCalculator.calculate(aggregated, coverage, { objective, businessProfile: extras.profile });
}

const positivePatterns = [
  ["presencia", "Aparece correctamente en búsquedas locales"], ["conversion", "El recorrido para comprar fue comprobado y es claro"],
  ["posicionamiento", "Reseñas verificadas destacan la atención"], ["propuesta", "La propuesta especializada se entiende con claridad"],
  ["redes", "La red principal informa oferta y próximo paso"], ["adquisicion", "Productos y servicios aparecen en búsquedas relevantes"],
  ["retencion", "Clientes describen una experiencia que favorece volver"],
];
const negativePatterns = [
  ["presencia", "Datos locales inconsistentes impiden encontrar el negocio"], ["conversion", "El recorrido de compra presenta un bloqueo comprobado"],
  ["posicionamiento", "Varias experiencias recientes contradicen la confianza"], ["propuesta", "La oferta no permite entender qué se vende"],
  ["redes", "El canal activo no informa cómo avanzar"], ["adquisicion", "El negocio no aparece en búsquedas relevantes comprobadas"],
  ["retencion", "Quejas recientes muestran fallas repetidas después de la compra"],
];

function levelFixture(level) {
  const sourceCycle = ["web", "search", "reviews"];
  const findings = [];
  for (const [index, [area, text]] of positivePatterns.entries()) {
    const positiveCount = ({ very_bad: 0, bad: 1, medium: 2, good: 3, very_good: 4, excellent: 5 })[level];
    const negativeCount = ({ very_bad: 3, bad: 3, medium: 2, good: 1, very_good: 1, excellent: 0 })[level];
    const positiveAspects = ["recorrido comprobado", "información práctica completa", "autoridad verificable", "consistencia sostenida", "actualidad confirmada"];
    for (let i = 0; i < positiveCount; i++) findings.push(finding(`${level}-${area}-p${i}`, area, sourceCycle[i % (level === "excellent" ? 3 : level === "very_good" ? 2 : 1)], "positive", i === 0 ? "high" : "medium", `${positiveAspects[i]}: ${text}`));
    const negativeText = negativePatterns[index][1];
    for (let i = 0; i < negativeCount; i++) findings.push(finding(`${level}-${area}-n${i}`, area, sourceCycle[i % 2], "negative", level === "very_bad" ? "high" : "medium", `${negativeText}; problema ${i}: ${["bloqueo", "demora", "inconsistencia"][i]}`));
  }
  return evaluate(level, "aumentar ventas y consultas", findings);
}

test("V2 progresa desde desempeño muy malo hasta excelente sin targets exactos", () => {
  const levels = ["very_bad", "bad", "medium", "good", "very_good", "excellent"].map(levelFixture);
  const totals = levels.map((item) => item.total);
  console.log("NUVRA_SCORE_V2_LEVELS=" + JSON.stringify(totals));
  for (let index = 1; index < totals.length; index++) assert.ok(totals[index] > totals[index - 1], `${totals.join(" -> ")}`);
  assert.ok(totals.at(-1) - totals[0] >= 55);
  assert.ok(new Set(totals).size === totals.length);
  assert.ok(!totals.every((score) => score >= 45 && score <= 55));
  assert.equal(levels[0].scoreMethodologyVersion, SCORE_METHODOLOGY_VERSION);
});

test("soblepremio: una fortaleza aislada nunca vuelve excepcional al negocio", () => {
  const scenarios = [
    evaluate("web-bonita", "aumentar ventas", [finding("pretty", "identidad", "web", "positive", "high", "Web visualmente coherente")], { identity: { performanceScore: 92, evidenceConfidence: .42, evidenceCeiling: 69, coverage: { independentSourceCount: 1 }, limitations: [] } }),
    evaluate("reviews-vs-broken", "aumentar reservas", [finding("reviews", "posicionamiento", "reviews", "positive", "high", "Muchas reseñas destacan la atención"), finding("broken", "conversion", "web", "negative", "high", "La reserva tiene un bloqueo comprobado")]),
    evaluate("instagram-only", "aumentar ventas", [finding("ig", "redes", "instagram", "positive", "high", "Instagram explica la oferta y tiene CTA"), finding("hidden", "presencia", "search", "negative", "high", "El negocio es difícil de encontrar")]),
    evaluate("few-rating", "aumentar consultas", [finding("rating", "posicionamiento", "reviews", "positive", "high", "Rating alto basado en pocas opiniones")]),
    evaluate("great-web-limited", "dar a conocer la marca", [], { identity: { performanceScore: 95, evidenceConfidence: .48, evidenceCeiling: 72, coverage: { independentSourceCount: 1 }, limitations: [] }, coverage: 25 }),
  ];
  for (const scenario of scenarios) assert.ok(scenario.total < 90, `${scenario.total}`);
  assert.equal(scenarios[0].dimensions.find((item) => item.slug === "identidad").performanceScore, 92);
  assert.equal(scenarios[0].dimensions.find((item) => item.slug === "identidad").points, 69);
});

test("sobrecastigo: ausencia irrelevante, poca cobertura y contradicción aislada no restan por defecto", () => {
  const noTikTok = evaluate("local", "aumentar reservas", [finding("maps", "presencia", "search", "positive", "high", "Maps muestra ubicación y horarios"), finding("wa", "conversion", "instagram", "positive", "high", "WhatsApp permite reservar en un paso")]);
  assert.equal(noTikTok.methodology.nonApplicableDimensions.includes("redes"), true);
  assert.ok(noTikTok.total >= 60);
  const fewSourcesWorking = evaluate("limited", "aumentar ventas", [finding("journey", "conversion", "web", "positive", "high", "El recorrido de compra fue comprobado y funciona")], { coverage: 20 });
  assert.ok(fewSourcesWorking.total >= 55);
  assert.ok(fewSourcesWorking.total < 90);
  const oneComplaint = evaluate("complaint", "aumentar consultas", [finding("complaint", "posicionamiento", "x", "negative", "low", "Una persona publicó una queja"), ...Array.from({ length: 5 }, (_, index) => finding(`good-${index}`, "posicionamiento", "reviews", "positive", "medium", `Opinión independiente ${index}: atención favorable ${["rápida", "amable", "clara", "profesional", "consistente"][index]}`))]);
  assert.ok(oneComplaint.total > 55);
});

test("el objetivo cambia los pesos globales sin reescribir el desempeño observado", () => {
  const findings = [
    finding("discovery", "presencia", "search", "positive", "high", "El negocio aparece en búsquedas relevantes"),
    finding("purchase", "conversion", "web", "negative", "high", "El recorrido de compra presenta un bloqueo comprobado"),
    finding("brand", "identidad", "web", "positive", "high", "La identidad observada es coherente"),
  ];
  const sales = evaluate("same-business-sales", "aumentar ventas", findings);
  const awareness = evaluate("same-business-awareness", "dar a conocer la marca", findings);
  for (const slug of ["presencia", "conversion"]) {
    assert.equal(sales.dimensions.find((area) => area.slug === slug).performanceScore, awareness.dimensions.find((area) => area.slug === slug).performanceScore);
  }
  assert.ok(sales.methodology.dimensionWeights.conversion.combinedWeight > awareness.methodology.dimensionWeights.conversion.combinedWeight);
  assert.ok(awareness.methodology.dimensionWeights.presencia.combinedWeight > sales.methodology.dimensionWeights.presencia.combinedWeight);
});

test("ocho fixtures comerciales conservan diferencias defendibles y trazables", () => {
  const fixtures = [
    ["Cafetería local", "aumentar visitas", [["presencia", "search", "positive", "Ubicación y horarios consistentes"], ["posicionamiento", "reviews", "positive", "Atención destacada en reseñas"], ["conversion", "web", "negative", "La reserva no está disponible"]]],
    ["Barbería", "aumentar turnos", [["redes", "instagram", "positive", "Trabajos recientes y ubicación visibles"], ["conversion", "instagram", "positive", "WhatsApp permite pedir turno"]]],
    ["Clínica", "aumentar consultas", [["posicionamiento", "reviews", "positive", "Profesionales y atención generan confianza"], ["propuesta", "web", "positive", "Tratamientos explicados"], ["conversion", "web", "negative", "Pedir turno requiere pasos adicionales"]]],
    ["Ecommerce", "aumentar ventas", [["propuesta", "web", "positive", "Productos y condiciones claras"], ["conversion", "web", "positive", "Compra comprobada"], ["presencia", "search", "positive", "Productos indexados"]]],
    ["Estudio profesional", "conseguir consultas", [["posicionamiento", "external_mentions", "positive", "Especialización respaldada externamente"], ["propuesta", "web", "positive", "Servicios para empresas claros"]]],
    ["B2B", "solicitar reuniones", [["posicionamiento", "linkedin", "positive", "Casos sectoriales verificables"], ["conversion", "web", "negative", "No hay solicitud clara de reunión"], ["adquisicion", "external_mentions", "positive", "Menciones en medios del sector"]]],
    ["Casi sin presencia", "conseguir clientes", [["presencia", "search", "negative", "Información pública inconsistente"]]],
    ["Gran presencia digital", "aumentar ventas", [["presencia", "search", "positive", "Marca y productos visibles"], ["conversion", "web", "positive", "Compra comprobada"], ["posicionamiento", "reviews", "positive", "Reputación consistente"], ["propuesta", "web", "positive", "Oferta diferenciada"], ["redes", "instagram", "positive", "Canal útil y conectado"]]],
  ].map(([name, objective, rows]) => {
    const findings = rows.map((row, index) => finding(`${name}-${index}`, row[0], row[1], row[2], "high", row[3]));
    const score = evaluate(name, objective, findings);
    const strongest = score.dimensions.flatMap((area) => area.contributions).sort((a, b) => b.effectiveStrength - a.effectiveStrength);
    return { name, global: score.total, areas: Object.fromEntries(score.dimensions.filter((area) => area.points !== null).map((area) => [area.slug, area.points])), nonApplicable: score.methodology.nonApplicableDimensions, mainStrength: strongest.find((item) => item.direction === "positive")?.label || null, mainProblem: strongest.find((item) => item.direction === "negative")?.label || null, evidenceConfidence: score.methodology.evidenceQuality, explanation: score.methodology.totalContribution };
  });
  assert.ok(new Set(fixtures.map((item) => `${item.global}:${Object.keys(item.areas).join(",")}`)).size >= 7);
  assert.ok(fixtures.find((item) => item.name === "Gran presencia digital").global > fixtures.find((item) => item.name === "Casi sin presencia").global);
  console.log("NUVRA_SCORE_V2_FIXTURES=" + JSON.stringify(fixtures));
});
