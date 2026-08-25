import test from "node:test";
import assert from "node:assert/strict";
import { analyzePageHtml } from "../services/website-analyzer/page-analyzer.ts";
import { BrandIdentityAnalyzer } from "../services/website-analyzer/brand-identity-analyzer.ts";
import { journeyFindings, validateWebsiteJourneys } from "../services/website-analyzer/website-journey-validator.ts";
import { buildBusinessProfile } from "../services/intelligence/business-profile.ts";
import { NuvraScoreCalculator } from "../services/intelligence/nuvra-score-calculator.ts";
import { buildProfileDiagnosis } from "../services/diagnostic/diagnostic-engine.ts";
import { buildProfileStrategy } from "../services/strategy/strategy-engine.ts";
import { HypothesisValidationEngine } from "../services/intelligence/hypothesis-validation-engine.ts";

const baseStyle = `<style>:root{--brand:#5b3924;--accent:#d7a54a}body{font-family:Inter,Arial;color:#5b3924}.button{background:#d7a54a}</style>`;
const home = analyzePageHtml("https://lab.example/", `${baseStyle}<header><img class="brand-logo" src="/logo-lab.svg" alt="LAB Tostadores"><nav><a href="/cafes">Cafés</a><a href="/reservas">Reservar mesa</a><a href="/contacto">Contacto</a></nav></header><main><h1>Café de especialidad tostado por LAB</h1><h2>Elegí tu café</h2><p>Probá nuestros cafés o visitá el local.</p><a class="button" href="/reservas">Reservar mesa</a><a href="/tienda">Comprar café</a><img src="/cafe.jpg" alt="Café servido en LAB"></main>`, 620);
const reservationFields = Array.from({ length: 23 }, (_, index) => `<input name="dato-${index}" ${index < 2 ? "required" : ""}>`).join("");
const reservations = analyzePageHtml("https://lab.example/reservas", `${baseStyle}<header><img class="brand-logo" src="/logo-lab.svg" alt="LAB Tostadores"></header><main><h1>Reservá tu mesa</h1><h2>Elegí día y horario</h2><form action="/reservas/confirmar" method="post">${reservationFields}<button type="submit">Reservar mesa</button></form><img src="/local.jpg" alt="Mesas del local LAB"></main>`, 710);
const shop = analyzePageHtml("https://lab.example/tienda", `${baseStyle}<header><img class="brand-logo" src="/logo-lab.svg" alt="LAB Tostadores"></header><main><h1>Cafés para preparar en casa</h1><h2>Origen y molienda</h2><a class="button" href="/checkout">Comprar café</a><img src="/pack.jpg" alt="Paquete de café LAB"></main>`, 680);
const checkout = analyzePageHtml("https://lab.example/checkout", `${baseStyle}<header><img class="brand-logo" src="/logo-lab.svg" alt="LAB Tostadores"></header><main><h1>Finalizar pedido</h1><h2>Datos de entrega</h2><form action="/checkout" method="post"><input name="email" required><input name="direccion" required><button type="submit">Comprar</button></form></main>`, 690);
const pages = [home, reservations, shop, checkout];

const finding = (id, category, type, impact, evidence, attribution = "https://lab.example/") => ({ id, category, type, impact, evidence, source: "web", attribution, weight: .7, confidence: "ALTA" });

function labAnalysis() {
  const journeys = validateWebsiteJourneys(pages);
  const brandIdentity = BrandIdentityAnalyzer.analyze(pages);
  const evidence = [
    finding("legacy-form-count", "conversion", "negative", "medium", "Formulario con 23 campos; puede reducir la capacidad de completar una reserva.", "https://lab.example/reservas"),
    ...journeyFindings(journeys).map((item, index) => finding(`journey-${index}`, item.category, item.type === "problem" ? "negative" : "positive", item.impact === "alto" ? "high" : "medium", item.evidence, item.pageUrl)),
    ...BrandIdentityAnalyzer.findings(brandIdentity, "https://lab.example/").map((item, index) => finding(`brand-${index}`, item.category, item.type === "problem" ? "negative" : "positive", "medium", item.evidence, item.pageUrl)),
  ];
  const byDimension = { presencia: [], conversion: evidence.filter((item) => item.category === "conversion"), posicionamiento: [], propuesta: [], redes: [], adquisicion: [], retencion: [], identidad: evidence.filter((item) => item.category === "identidad") };
  const source = { source: "web", status: "evaluated", data: { pages, journeys, brandIdentity }, findings: evidence, confidence: "ALTA", coverage: 80, evaluatedAt: new Date(), requiresAuth: false };
  const aggregated = { businessId: "lab", sources: { web: source }, findings: evidence, deduplicated: evidence, byCategory: { conversion: byDimension.conversion, identidad: byDimension.identidad }, byDimension, evaluatedAt: new Date() };
  const business = {
    id: "lab", nombre: "LAB Tostadores", rubro: "Cafetería de especialidad y tostadores", descripcion: "Café de especialidad, tienda y local con mesas", ubicacion: "Buenos Aires", ciudad: null, pais: null, tamano: null, tipoCliente: "B2C", publicoObjetivo: null, productosServicios: "Café, alimentos, reservas y café en grano", ticketPromedio: null, empleados: "Equipo pequeño", webUrl: "https://lab.example/", instagramHandle: null, otrosCanales: null, canales: JSON.stringify(["Página web"]), facturacion: null, clientesMensuales: null, inversionMarketing: 150, organizationId: null, userId: null, createdAt: new Date(), updatedAt: new Date(), goals: [{ objetivo: "conseguir más visitas y pedidos", magnitud: 15, plazoDias: 90, plazoLabel: "3 meses" }],
  };
  const profile = buildBusinessProfile(business, aggregated);
  const coverage = { overallMarketingCoverage: 70, total: 70, bySource: {}, evaluatedSources: ["web"], missingSources: [], relevantSources: ["web"], requiresAuthSources: [], canCalculateNuvraScore: true, reason: "fixture B1" };
  const intelligenceScore = NuvraScoreCalculator.calculate(aggregated, coverage, { objective: business.goals[0].objetivo, businessProfile: profile });
  const dimensions = intelligenceScore.dimensions.map((dimension) => ({ slug: dimension.slug, name: dimension.name, points: dimension.points, weight: intelligenceScore.methodology.dimensionWeights[dimension.slug]?.combinedWeight || 0, criteria: [], strengths: dimension.findings.filter((item) => item.type === "positive").map((item) => item.evidence), problems: dimension.findings.filter((item) => item.type === "negative").map((item) => item.evidence), source: dimension.sources.join(", "), confidence: dimension.confidence, findings: [] }));
  const score = { total: intelligenceScore.total, dimensions, weights: {}, allFindings: [], coverage: 70 };
  const context = { nombre: business.nombre, rubro: business.rubro, objetivo: business.goals[0].objetivo, plazoDias: 90, plazoLabel: "3 meses", businessProfile: profile };
  const diagnosis = buildProfileDiagnosis(context, score, profile);
  const strategy = buildProfileStrategy({ nombre: business.nombre, rubro: business.rubro, objetivo: business.goals[0].objetivo, plazoDias: 90, plazoLabel: "3 meses", magnitud: 15, ubicacion: business.ubicacion, tipoCliente: business.tipoCliente, presupuesto: 150, capacidad: business.empleados, canales: business.canales, businessProfile: profile }, diagnosis, score, profile);
  return { journeys, brandIdentity, profile, intelligenceScore, diagnosis, strategy };
}

test("un formulario con muchos campos no demuestra dificultad si el recorrido se comprueba", () => {
  const result = labAnalysis();
  const reservation = result.journeys.find((item) => item.intent === "reserve");
  assert.equal(reservation.status, "validated");
  assert.equal(reservation.requiredFields, 2);
  const actionPath = result.profile.problemCandidates.find((item) => item.pattern === "action_path");
  assert.equal(actionPath.validationStatus, "discarded");
  assert.ok(actionPath.contradictionStrength >= actionPath.evidenceStrength);
  assert.notEqual(result.diagnosis.bottleneck.findingId, actionPath.evidenceFor[0]);
  assert.equal(result.strategy.actions.some((action) => action.findingIds?.includes(actionPath.evidenceFor[0])), false);
});

test("la comprobación web no envía formularios ni realiza compras", () => {
  const result = labAnalysis();
  assert.equal(result.journeys.some((item) => item.status === "validated" && item.steps && item.steps <= 2), true);
  assert.equal(result.journeys.every((item) => !item.evidence.join(" ").match(/compra realizada|reserva confirmada/i)), true);
});

test("un destino roto sí valida una hipótesis de bloqueo", () => {
  const brokenPage = analyzePageHtml("https://broken.example/", `<h1>Reservas</h1><a href="/reservar">Reservar mesa</a>`);
  const journeys = validateWebsiteJourneys([brokenPage], [{ type: "problem", category: "presencia", severity: "high", title: "Error HTTP 500", description: "No cargó", evidence: "Error", pageUrl: "https://broken.example/reservar", source: "playwright", confidence: "alta" }]);
  const reserve = journeys.find((item) => item.intent === "reserve");
  assert.equal(reserve.status, "blocked");
  assert.ok(reserve.blockers.length > 0);
});

test("una sola falla directa queda parcial y una observación indirecta se descarta", () => {
  const base = { id: "e", kind: "ObservedEvidence", source: "web", timestamp: null, entity: { businessId: "b", businessName: "B" }, confidence: "ALTA", journeyStage: "action", possibleImpact: "high", polarity: "negative", allowsClaims: ["observado"], disallowsClaims: ["no generalizar"], attribution: "web" };
  const direct = HypothesisValidationEngine.validate({ pattern: "action_path", journeyStage: "action" }, [{ ...base, text: "Bloqueo comprobado: el botón no funciona y no permite reservar." }], []);
  const proxy = HypothesisValidationEngine.validate({ pattern: "action_path", journeyStage: "action" }, [{ ...base, text: "Se observó un formulario con 23 campos." }], []);
  assert.equal(direct.status, "partially_validated");
  assert.equal(proxy.status, "discarded");
  assert.ok(direct.evidenceStrength > proxy.evidenceStrength);
});

test("una contradicción aislada no descarta una hipótesis con apoyo suficiente", () => {
  const base = { id: "e", kind: "ObservedEvidence", source: "web", timestamp: null, entity: { businessId: "b", businessName: "B" }, confidence: "ALTA", journeyStage: "action", possibleImpact: "high", polarity: "negative", allowsClaims: ["observado"], disallowsClaims: ["no generalizar"] };
  const result = HypothesisValidationEngine.validate(
    { pattern: "action_path", journeyStage: "action" },
    [
      { ...base, id: "s1", attribution: "https://b.example/reserva", text: "Bloqueo comprobado: el botón no funciona y no permite reservar." },
      { ...base, id: "s2", attribution: "https://b.example/contacto", text: "Error al reservar: el formulario no permite continuar." },
    ],
    [{ ...base, id: "c1", attribution: "https://b.example/", polarity: "positive", text: "El paso para reservar aparece de forma clara." }],
  );
  assert.notEqual(result.status, "discarded");
  assert.equal(result.supportingIndependentSignals, 2);
  assert.equal(result.contradictingIndependentSignals, 1);
});

test("Identidad de Marca aparece como área trazable y usa señales observadas", () => {
  const result = labAnalysis();
  const identity = result.intelligenceScore.dimensions.find((item) => item.slug === "identidad");
  assert.equal(identity.name, "Qué tan sólida y reconocible es tu marca");
  assert.equal(identity.performanceScore, result.brandIdentity.performanceScore);
  assert.ok(identity.points <= result.brandIdentity.score);
  assert.ok(identity.points <= identity.evidenceCeiling);
  assert.ok(identity.points >= 60);
  assert.ok(result.brandIdentity.evidence.some((item) => /logo|colores|tipograf/i.test(item)));
  assert.ok(result.brandIdentity.limitations.some((item) => /una sola fuente|canales/i.test(item)));
});

test("LAB deja de presentar la compra o reserva como freno principal sin corroboración", () => {
  const result = labAnalysis();
  assert.doesNotMatch(result.diagnosis.bottleneck.title, /cuesta pasar.*reservar|cuesta pasar.*pedido/i);
  assert.equal(result.profile.problemCandidates.filter((item) => item.validationStatus === "validated").length, 0);
  console.log("NUVRA_LAB_B1=" + JSON.stringify({ score: result.intelligenceScore.total, identityScore: result.brandIdentity.score, identityPerformanceScore: result.brandIdentity.performanceScore, identityEvidenceConfidence: result.brandIdentity.evidenceConfidence, identityCoverage: result.brandIdentity.coverage, discardedProblem: result.profile.problemCandidates.find((item) => item.pattern === "action_path"), diagnosis: result.diagnosis.bottleneck, evidence: result.journeys.filter((item) => ["buy", "reserve"].includes(item.intent)) }));
});
