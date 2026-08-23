import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { businessInputSchema } from "../lib/business-input.ts";
import { parseCustomTimeframe } from "../lib/timeframe.ts";
import { EvidenceAggregator, CoverageCalculator } from "../services/intelligence/evidence-aggregator.ts";
import { SourceAnalyzer } from "../services/intelligence/source-analyzer.ts";
import { buildBusinessProfile } from "../services/intelligence/business-profile.ts";
import { NuvraScoreCalculator } from "../services/intelligence/nuvra-score-calculator.ts";
import { buildProfileDiagnosis } from "../services/diagnostic/diagnostic-engine.ts";
import { buildProfileStrategy } from "../services/strategy/strategy-engine.ts";
import { SearchSourceAnalyzer } from "../services/intelligence/search-source-analyzer.ts";
import { normalizeRawFindingType } from "../services/intelligence/normalize-finding.ts";

process.env.AI_PROVIDER = "none";

const finding = (id, category, type, impact, evidence, confidence = "ALTA") => ({ id, category, type, impact, evidence, source: "other", attribution: `mock:${id}`, weight: impact === "high" ? .9 : impact === "medium" ? .7 : .5, confidence });

class FakeSource extends SourceAnalyzer {
  constructor(type, findings, data = {}) { super(); this.type = type; this.findings = findings.map((item) => ({ ...item, source: type })); this.data = data; this.requiresAuth = false; this.requiresPermission = false; }
  isAvailable() { return true; }
  isRelevant() { return { source: this.type, relevant: true, weight: .2, reason: "Proveedor falso controlado" }; }
  async analyze() { return { source: this.type, status: this.findings.length ? "evaluated" : "unavailable", data: this.data, findings: this.findings, confidence: this.findings.length ? "ALTA" : "INSUFICIENTE", coverage: this.findings.length ? 75 : 0, evaluatedAt: new Date(), requiresAuth: false }; }
}

const fixtures = [
  {
    id: "mokka", input: { nombre: "Mokka Café", rubro: "cafetería de especialidad", descripcion: "Café, pastelería y brunch en un local de barrio.", ubicacion: "Palermo, Buenos Aires", instagramHandle: "mokkacafe", canales: ["Instagram"], otrosCanales: "Tenemos pocas visitas de lunes a viernes.", objetivo: "Conseguir más clientes en el local", magnitud: 20, plazoDias: 45, plazoLabel: "45 días", inversionMarketing: 75, empleados: "Somos 2–3 personas" },
    sources: { search: [finding("m-local", "presencia", "positive", "high", "La dirección y los horarios de Mokka Café aparecen en búsquedas locales."), finding("m-category", "adquisicion", "positive", "medium", "Mokka Café aparece al buscar cafeterías de especialidad en Palermo.")], reviews: [finding("m-review", "trust", "positive", "high", "Las opiniones recientes destacan el café y la atención.")], instagram: [finding("m-social", "redes", "positive", "medium", "La bio muestra ubicación y las publicaciones recientes enseñan café y pastelería."), finding("m-visit", "conversion", "negative", "medium", "Desde Instagram no se ve de inmediato el horario completo ni cómo llegar al local.")], competitor: [finding("m-comp", "posicionamiento", "neutral", "low", "Se validaron tres cafeterías de especialidad activas en la misma zona.")] },
  },
  {
    id: "contable", input: { nombre: "Estudio Contable Norte", rubro: "estudio contable para pequeñas empresas", descripcion: "Impuestos, sueldos y asesoramiento para comercios y profesionales.", ubicacion: "Vicente López, Buenos Aires", webUrl: "https://contablenorte.example", noInstagramDeclared: true, otrosCanales: "La mayoría de los clientes llega por recomendación.", objetivo: "Conseguir más presupuestos o reuniones", magnitud: 15, plazoDias: 180, plazoLabel: "6 meses", inversionMarketing: 200, empleados: "Lo hago yo", tipoCliente: "B2B" },
    sources: { web: [finding("c-offer", "propuesta", "negative", "high", "La web enumera impuestos y sueldos, pero no aclara qué tipo de pequeña empresa atiende."), finding("c-meeting", "conversion", "negative", "high", "El formulario permite dejar datos, pero no solicitar una reunión ni elegir horario."), finding("c-team", "trust", "positive", "medium", "La web identifica al contador responsable y su matrícula.")], search: [finding("c-brand", "presencia", "positive", "low", "El estudio aparece cuando se busca su nombre exacto."), finding("c-category", "adquisicion", "negative", "medium", "No aparece entre los resultados validados para contador de pymes en Vicente López.")], external_mentions: [finding("c-chamber", "posicionamiento", "positive", "medium", "Una asociación local menciona una charla tributaria del estudio.")] },
  },
  {
    id: "barber", input: { nombre: "Distrito Barber", rubro: "barbería", descripcion: "Cortes, barba y turnos en un local físico.", ubicacion: "Córdoba Capital", noWebDeclared: true, instagramHandle: "distritobarber", canales: ["Instagram"], otrosCanales: "Casi todos preguntan por Instagram y después coordinamos por WhatsApp.", objetivo: "Conseguir más consultas", magnitud: 25, plazoDias: 42, plazoLabel: "6 semanas", inversionMarketing: 75, empleados: "Somos 2–3 personas" },
    sources: { instagram: [finding("b-work", "redes", "positive", "high", "Las publicaciones recientes muestran cortes y trabajos de barba."), finding("b-book", "conversion", "negative", "high", "La bio no muestra un enlace directo para pedir turno por WhatsApp.")], reviews: [finding("b-reviews", "trust", "positive", "medium", "Las reseñas destacan puntualidad y atención.")], search: [finding("b-local", "presencia", "positive", "medium", "La barbería aparece con dirección en búsquedas por nombre."), finding("b-category", "adquisicion", "negative", "medium", "No se validó a Distrito Barber en la búsqueda por barberías de la zona.")], competitor: [finding("b-comp", "posicionamiento", "neutral", "low", "Se validaron barberías cercanas con reserva directa desde sus perfiles.")] },
  },
  {
    id: "noma", input: { nombre: "Noma Home", rubro: "tienda online de decoración y objetos para el hogar", descripcion: "Productos de decoración, textiles y objetos para el hogar con envío nacional.", ubicacion: "Argentina", webUrl: "https://nomahome.example", instagramHandle: "nomahome", canales: ["Página web", "Instagram"], otrosCanales: "La mayoría de las ventas entra por la tienda online.", objetivo: "Conseguir más ventas", magnitud: 30, plazoDias: 150, plazoLabel: "5 meses", inversionMarketing: 500, empleados: "Somos 2–3 personas", tipoCliente: "B2C" },
    sources: { web: [finding("n-product", "propuesta", "positive", "high", "Las fichas muestran materiales, medidas y fotos de cada producto."), finding("n-shipping", "conversion", "negative", "high", "El costo y el plazo de envío aparecen recién en el último paso."), finding("n-payment", "conversion", "positive", "medium", "Los medios de pago y las cuotas aparecen en la ficha."), finding("n-proof", "trust", "negative", "medium", "No se observaron opiniones de compradores junto a los productos.")], search: [finding("n-products", "adquisicion", "positive", "medium", "Varios productos de Noma Home aparecen en búsquedas por nombre."), finding("n-brand", "presencia", "positive", "medium", "El dominio oficial aparece al buscar la marca.")], instagram: [finding("n-social", "redes", "positive", "medium", "El perfil muestra ambientes y enlaza a la tienda online.")] },
  },
];

function toBusiness(fixture, override = {}) {
  const parsed = businessInputSchema.parse({ ...fixture.input, ...override });
  return { id: fixture.id, userId: null, organizationId: null, nombre: parsed.nombre, rubro: parsed.rubro, descripcion: parsed.descripcion || null, ubicacion: parsed.ubicacion || null, ciudad: null, pais: null, tamano: null, tipoCliente: parsed.tipoCliente || null, publicoObjetivo: parsed.publicoObjetivo || null, productosServicios: parsed.productosServicios || null, ticketPromedio: null, empleados: parsed.empleados || null, webUrl: parsed.webUrl || null, instagramHandle: parsed.instagramHandle || null, noWebDeclared: parsed.noWebDeclared, noInstagramDeclared: parsed.noInstagramDeclared, otrosCanales: parsed.otrosCanales || null, canales: JSON.stringify(parsed.canales || []), facturacion: null, clientesMensuales: null, inversionMarketing: parsed.inversionMarketing ?? null, createdAt: new Date(), updatedAt: new Date(), goals: [{ objetivo: parsed.objetivo, magnitud: parsed.magnitud, plazoDias: parsed.plazoDias, plazoLabel: parsed.plazoLabel }] };
}

async function analyzeFixture(fixture, override = {}) {
  const business = toBusiness(fixture, override);
  const aggregator = new EvidenceAggregator();
  for (const source of ["web", "instagram", "search", "reviews", "competitor", "x", "external_mentions"]) aggregator.registerSource(new FakeSource(source, fixture.sources[source] || [], source === "competitor" ? { totalValidated: (fixture.sources.competitor || []).length ? 3 : 0 } : {}));
  const evidence = await aggregator.aggregate(business);
  const profile = buildBusinessProfile(business, evidence);
  const coverage = CoverageCalculator.calculate(evidence, business);
  const intelligenceScore = NuvraScoreCalculator.calculate(evidence, coverage, { objective: business.goals[0].objetivo, businessProfile: profile });
  const dimensions = intelligenceScore.dimensions.map((dimension) => ({ slug: dimension.slug, name: dimension.name, points: dimension.points, weight: intelligenceScore.methodology.dimensionWeights[dimension.slug]?.combinedWeight || 0, criteria: dimension.scoringSignals || [], strengths: dimension.findings.filter((item) => item.type === "positive").map((item) => item.evidence), problems: dimension.findings.filter((item) => item.type === "negative").map((item) => item.evidence), source: dimension.sources.join(", "), confidence: dimension.confidence, findings: [] }));
  const score = { total: intelligenceScore.total, dimensions, weights: { presencia: 0, conversion: 0, posicionamiento: 0, propuesta: 0, redes: 0, adquisicion: 0 }, allFindings: [], coverage: coverage.total };
  const context = { nombre: business.nombre, rubro: business.rubro, objetivo: business.goals[0].objetivo, plazoDias: business.goals[0].plazoDias, plazoLabel: business.goals[0].plazoLabel, descripcion: business.descripcion, businessProfile: profile };
  const diagnosis = buildProfileDiagnosis(context, score, profile);
  const strategy = buildProfileStrategy({ ...context, ubicacion: business.ubicacion, tipoCliente: business.tipoCliente, presupuesto: business.inversionMarketing, capacidad: business.empleados, canales: `${business.canales} ${business.otrosCanales || ""}`, informacionComplementaria: business.otrosCanales }, diagnosis, score, profile);
  return { business, evidence, profile, intelligenceScore, diagnosis, strategy };
}

test("Mokka, Contable Norte, Distrito Barber y Noma atraviesan el pipeline y producen análisis reconocibles", async () => {
  const results = await Promise.all(fixtures.map((fixture) => analyzeFixture(fixture)));
  const fingerprints = results.map((result) => result.intelligenceScore.dimensions.map((area) => area.points).join("-"));
  assert.equal(new Set(fingerprints).size, fixtures.length, fingerprints.join("\n"));
  const diagnosisFingerprints = results.map((result) => `${result.diagnosis.bottleneck.title}|${result.diagnosis.bottleneck.explanation}|${result.strategy.actions.slice(0, 3).map((action) => action.title).join("|")}`);
  assert.equal(new Set(diagnosisFingerprints).size, fixtures.length, diagnosisFingerprints.join("\n"));
  for (const result of results) {
    const selectedId = result.diagnosis.bottleneck.findingId;
    if (selectedId) assert.ok(result.profile.problemCandidates.some((candidate) => candidate.validationStatus === "validated" && candidate.evidenceFor.includes(selectedId)));
  }
  assert.equal(new Set(results.map((result) => result.strategy.actions.slice(0, 3).map((action) => action.title).join("|"))).size, fixtures.length);
  console.log("NUVRA_REAL_PIPELINE_COMPARISON=" + JSON.stringify(results.map((result) => ({ business: result.business.nombre, score: result.intelligenceScore.total, areas: Object.fromEntries(result.intelligenceScore.dimensions.map((area) => [area.slug, area.points])), strength: result.diagnosis.strengths[0]?.evidence || null, problem: result.diagnosis.bottleneck.title, opportunities: result.diagnosis.opportunities, actions: result.strategy.actions.slice(0, 5).map((action) => action.title) }))));
});

test("el detector rechaza concentración excesiva en el antiguo vector fijo", async () => {
  const results = await Promise.all(fixtures.map((fixture) => analyzeFixture(fixture)));
  const legacyValues = new Set([30, 35, 40, 42, 45, 50]);
  const allScores = results.flatMap((result) => result.intelligenceScore.dimensions.map((area) => area.points));
  const concentration = allScores.filter((score) => legacyValues.has(score)).length / allScores.length;
  assert.ok(concentration < .6, `Concentración excesiva: ${Math.round(concentration * 100)}%`);
});

test("un cambio contrafactual de evidencia cambia el área afectada sin números aleatorios", async () => {
  const noma = fixtures.find((fixture) => fixture.id === "noma");
  const base = await analyzeFixture(noma);
  const improved = structuredClone(noma);
  improved.id = "noma-improved";
  improved.sources.web = improved.sources.web.filter((item) => item.id !== "n-shipping");
  improved.sources.web.push(finding("n-shipping-clear", "conversion", "positive", "high", "El costo y el plazo de envío aparecen antes de agregar el producto al carrito."));
  const changed = await analyzeFixture(improved);
  const baseConversion = base.intelligenceScore.dimensions.find((area) => area.slug === "conversion").points;
  const changedConversion = changed.intelligenceScore.dimensions.find((area) => area.slug === "conversion").points;
  assert.ok(changedConversion > baseConversion, `${baseConversion} -> ${changedConversion}`);
  assert.notEqual(base.profile.problemCandidates.find((candidate) => candidate.pattern === "decision_information")?.validationStatus, "validated");
  assert.equal(changed.profile.problemCandidates.some((candidate) => candidate.evidenceFor.includes("observed:n-shipping")), false);
});

test("un objetivo distinto cambia prioridad y acciones con la misma evidencia", async () => {
  const mokka = fixtures.find((fixture) => fixture.id === "mokka");
  const visits = await analyzeFixture(mokka);
  const returners = await analyzeFixture(mokka, { objetivo: "Hacer que más clientes vuelvan", otrosCanales: "Tenemos una lista de clientes, pero todavía no enviamos recordatorios." });
  assert.notEqual(visits.profile.primaryCustomerAction, returners.profile.primaryCustomerAction);
  assert.notDeepEqual(visits.strategy.actions.slice(0, 3).map((action) => action.title), returners.strategy.actions.slice(0, 3).map((action) => action.title));
});

test("plazo personalizado se valida y conserva para el análisis", () => {
  assert.deepEqual(parseCustomTimeframe("45 días"), { days: 45, label: "45 días" });
  assert.deepEqual(parseCustomTimeframe("6 semanas"), { days: 42, label: "6 semanas" });
  assert.deepEqual(parseCustomTimeframe("5 meses"), { days: 150, label: "5 meses" });
  assert.deepEqual(parseCustomTimeframe("1 año"), { days: 365, label: "1 año" });
  assert.equal(parseCustomTimeframe(""), null);
  assert.equal(parseCustomTimeframe("algún día"), null);
  const distrito = businessInputSchema.parse(fixtures.find((fixture) => fixture.id === "barber").input);
  assert.equal(distrito.plazoDias, 42);
  assert.equal(distrito.plazoLabel, "6 semanas");
});

test("onboarding representa y envía las declaraciones sin web e Instagram", () => {
  const onboarding = fs.readFileSync(new URL("../app/onboarding/page.tsx", import.meta.url), "utf8");
  const input = fs.readFileSync(new URL("../components/ui/index.tsx", import.meta.url), "utf8");
  assert.match(onboarding, /data\.plazoId === "custom" && <Field label="Plazo personalizado"/);
  assert.match(onboarding, /data\.plazoId !== "custom" \|\| customTimeframe/);
  assert.match(onboarding, /disabled=\{data\.noWeb\}/);
  assert.match(onboarding, /disabled=\{data\.noInstagram\}/);
  assert.match(onboarding, /noWebDeclared: data\.noWeb, noInstagramDeclared: data\.noInstagram/);
  assert.match(input, /background: disabled \? COLORS\.paperDim : "#fff"/);
  const declaredAbsent = businessInputSchema.parse({ ...fixtures[0].input, webUrl: undefined, instagramHandle: undefined, noWebDeclared: true, noInstagramDeclared: true });
  assert.equal(declaredAbsent.noWebDeclared, true);
  assert.equal(declaredAbsent.noInstagramDeclared, true);
  assert.throws(() => businessInputSchema.parse({ ...fixtures[0].input, webUrl: "https://mokka.example", noWebDeclared: true }));
});

test("la búsqueda usa nombre, zona, rubro y opiniones sin mezclar otra entidad", async () => {
  const calls = [];
  const provider = { async search(query) {
    calls.push(query);
    if (query === "cafetería de especialidad Palermo, Buenos Aires") return [
      { title: "Otra Taza", url: "https://otratasa.example", snippet: "Cafetería de especialidad en Palermo" },
      { title: "Mokka Café Palermo", url: "https://mokka.example", snippet: "Café de especialidad, dirección y horarios" },
    ];
    return [{ title: "Mokka Café", url: "https://mokka.example", snippet: "Mokka Café, cafetería de especialidad en Palermo" }];
  } };
  const analyzer = new SearchSourceAnalyzer(provider);
  const business = toBusiness(fixtures[0]);
  const evidence = await analyzer.analyze(business);
  assert.equal(calls.length, 4);
  assert.ok(calls.some((query) => /reseñas opiniones/.test(query)));
  assert.ok(calls.some((query) => query === "cafetería de especialidad Palermo, Buenos Aires"));
  assert.ok(evidence.findings.some((item) => /aparece cuando se busca su rubro/.test(item.evidence)));
  assert.doesNotMatch(JSON.stringify(evidence.findings), /Otra Taza/);
});

test("las fortalezas web conservan polaridad positiva y los problemas negativa", () => {
  assert.equal(normalizeRawFindingType("strength"), "positive");
  assert.equal(normalizeRawFindingType("problem"), "negative");
  assert.equal(normalizeRawFindingType("info"), "neutral");
});
