import test from "node:test";
import assert from "node:assert/strict";
import { buildBusinessProfile } from "../services/intelligence/business-profile.ts";
import { NuvraScoreCalculator } from "../services/intelligence/nuvra-score-calculator.ts";
import { buildProfileDiagnosis } from "../services/diagnostic/diagnostic-engine.ts";
import { buildProfileStrategy } from "../services/strategy/strategy-engine.ts";

const finding = (id, category, type, impact, source, evidence, confidence = "ALTA") => ({ id, category, type, impact, source, evidence, confidence, attribution: `${source}:fixture`, weight: impact === "high" ? .9 : impact === "medium" ? .7 : .5 });
const areaFor = (category) => category === "conversion" ? "conversion" : category === "posicionamiento" ? "posicionamiento" : category === "propuesta" ? "propuesta" : category === "redes" ? "redes" : /adquisicion|seo/.test(category) ? "adquisicion" : category === "retencion" ? "retencion" : "presencia";

function analyzeFixture(input) {
  const business = {
    id: input.id, nombre: input.name, rubro: input.industry, descripcion: input.description || null, ubicacion: input.location || null, ciudad: null, pais: null, tamano: null,
    tipoCliente: input.customerType || null, publicoObjetivo: null, productosServicios: input.offerings || null, ticketPromedio: null, empleados: input.capacity || "Lo hago yo",
    webUrl: input.web === false ? null : `https://${input.id}.example`, instagramHandle: input.instagram === false ? null : `https://instagram.com/${input.id}`,
    otrosCanales: input.additional || null, canales: JSON.stringify(input.channels || []), facturacion: null, clientesMensuales: null, inversionMarketing: input.budget ?? 200,
    organizationId: null, userId: null, createdAt: new Date(), updatedAt: new Date(), goals: [{ objetivo: input.goal, magnitud: 20, plazoDias: 90, plazoLabel: "3 meses" }],
  };
  const sources = {};
  for (const source of new Set(input.findings.map((item) => item.source))) sources[source] = { source, status: "evaluated", data: source === "competitor" ? { totalValidated: 3 } : {}, findings: input.findings.filter((item) => item.source === source), confidence: "ALTA", coverage: 70, evaluatedAt: new Date(), requiresAuth: false };
  const byDimension = { presencia: [], conversion: [], posicionamiento: [], propuesta: [], redes: [], adquisicion: [], retencion: [] };
  for (const item of input.findings) byDimension[areaFor(item.category)].push(item);
  const aggregated = { businessId: input.id, sources, findings: input.findings, deduplicated: input.findings, byCategory: {}, byDimension, evaluatedAt: new Date() };
  const profile = buildBusinessProfile(business, aggregated);
  const evaluatedSources = Object.keys(sources);
  const coverage = { overallMarketingCoverage: 75, total: 75, bySource: {}, evaluatedSources, missingSources: [], relevantSources: evaluatedSources, requiresAuthSources: [], canCalculateNuvraScore: true, reason: "fixture" };
  const intelligenceScore = NuvraScoreCalculator.calculate(aggregated, coverage, { objective: input.goal, businessProfile: profile });
  const dimensions = intelligenceScore.dimensions.map((dimension) => ({ slug: dimension.slug, name: dimension.name, points: dimension.points, weight: intelligenceScore.methodology.dimensionWeights[dimension.slug]?.combinedWeight || 0, criteria: [], strengths: dimension.findings.filter((item) => item.type === "positive").map((item) => item.evidence), problems: dimension.findings.filter((item) => item.type === "negative").map((item) => item.evidence), source: dimension.sources.join(", "), confidence: dimension.confidence, findings: [] }));
  const rawFindings = input.findings.map((item) => ({ type: item.type === "positive" ? "strength" : item.type === "negative" ? "problem" : "info", category: item.category, severity: item.impact, title: item.evidence, description: item.evidence, evidence: item.evidence, pageUrl: item.attribution, source: item.source, confidence: item.confidence, impact: item.impact }));
  const score = { total: intelligenceScore.total, dimensions, weights: { presencia: .15, conversion: .2, posicionamiento: .15, propuesta: .15, redes: .15, adquisicion: .2 }, allFindings: rawFindings, coverage: 75 };
  const businessContext = { nombre: input.name, rubro: input.industry, objetivo: input.goal, plazoDias: 90, plazoLabel: "3 meses", descripcion: input.description, businessProfile: profile };
  const diagnosis = buildProfileDiagnosis(businessContext, score, profile);
  const strategy = buildProfileStrategy({ nombre: input.name, rubro: input.industry, objetivo: input.goal, plazoDias: 90, plazoLabel: "3 meses", magnitud: 20, ubicacion: input.location, tipoCliente: input.customerType, presupuesto: input.budget ?? 200, capacidad: input.capacity || "Lo hago yo", canales: [JSON.stringify(input.channels || []), input.additional].filter(Boolean).join(" "), descripcion: input.description, informacionComplementaria: input.additional, businessProfile: profile }, diagnosis, score, profile);
  return { input, profile, score, diagnosis, strategy };
}

const fixtures = [
  { id: "ap", name: "AP Medicina Estética", industry: "clínica de medicina estética", goal: "conseguir más consultas", location: "Buenos Aires", additional: "La mayoría de las consultas llega por Instagram y WhatsApp Business.", channels: ["Instagram", "WhatsApp"], findings: [
    finding("ap-contact", "conversion", "negative", "high", "web", "El pedido de turno no aparece de forma visible al comienzo del sitio."),
    finding("ap-reviews", "posicionamiento", "positive", "high", "reviews", "Las reseñas recientes destacan la atención de los profesionales."),
    finding("ap-instagram", "redes", "positive", "medium", "instagram", "El perfil muestra tratamientos y actividad reciente."),
    finding("ap-offer", "propuesta", "positive", "medium", "web", "El sitio explica los tratamientos faciales disponibles."),
    finding("ap-return", "retencion", "negative", "medium", "other", "No se observó un próximo paso después de cada tratamiento."),
  ] },
  { id: "clinic-b", name: "Clínica B", industry: "odontología general", goal: "conseguir más pacientes", location: "Córdoba", findings: [
    finding("cb-presence", "presencia", "negative", "high", "search", "La clínica aparece de forma poco consistente en búsquedas de la zona."),
    finding("cb-reviews", "posicionamiento", "negative", "high", "reviews", "Se encontraron pocas opiniones recientes que expliquen la experiencia."),
    finding("cb-contact", "conversion", "positive", "medium", "web", "El teléfono y el pedido de turno están visibles al comienzo."),
    finding("cb-service", "propuesta", "positive", "low", "web", "La página enumera las especialidades odontológicas."),
    finding("cb-social", "redes", "negative", "medium", "instagram", "El perfil identificado no muestra actividad reciente observable."),
  ] },
  { id: "gym", name: "Gimnasio boutique", industry: "gimnasio boutique con membresía", goal: "conseguir nuevos socios", location: "Palermo", additional: "Tenemos pocos cupos en las clases de la tarde.", findings: [
    finding("gym-trial", "conversion", "negative", "high", "instagram", "No aparece una reserva directa para una clase de prueba."),
    finding("gym-schedule", "propuesta", "negative", "medium", "web", "Los horarios y tipos de clase están repartidos en distintas páginas."),
    finding("gym-community", "redes", "positive", "high", "instagram", "El perfil muestra clases, entrenadores y alumnos de forma reciente."),
    finding("gym-reviews", "posicionamiento", "positive", "medium", "reviews", "Las opiniones destacan el acompañamiento de los entrenadores."),
    finding("gym-local", "presencia", "positive", "medium", "search", "La ubicación y los horarios aparecen en Google."),
  ] },
  { id: "restaurant", name: "Restaurante barrial", industry: "restaurante de cocina de autor", goal: "aumentar reservas", location: "Rosario", additional: "Tenemos pocas reservas lunes y martes.", findings: [
    finding("rest-booking", "conversion", "negative", "high", "instagram", "Para reservar hay que enviar un mensaje sin saber antes si hay lugar."),
    finding("rest-hours", "presencia", "negative", "medium", "search", "Los horarios publicados no coinciden entre Google y el perfil social."),
    finding("rest-menu", "propuesta", "positive", "medium", "instagram", "El menú y los platos principales se ven en publicaciones recientes."),
    finding("rest-reviews", "posicionamiento", "positive", "high", "reviews", "Las reseñas destacan la comida y la atención."),
    finding("rest-location", "adquisicion", "positive", "medium", "search", "El restaurante aparece para búsquedas de comida en su zona."),
  ] },
  { id: "law", name: "Estudio jurídico", industry: "abogado laboral para empresas", goal: "conseguir más consultas", location: "Mendoza", customerType: "B2B", findings: [
    finding("law-meeting", "conversion", "negative", "high", "web", "No hay una forma directa de solicitar una reunión inicial."),
    finding("law-focus", "propuesta", "positive", "high", "web", "El sitio explica que trabaja con conflictos laborales de empresas."),
    finding("law-cases", "posicionamiento", "negative", "medium", "web", "No se encontraron casos o experiencias verificables del estudio."),
    finding("law-search", "adquisicion", "negative", "medium", "search", "El estudio tiene poca presencia en búsquedas vinculadas con su especialidad."),
    finding("law-mention", "presencia", "positive", "low", "external_mentions", "Una cámara empresarial menciona al estudio en una actividad del sector."),
  ] },
  { id: "shop", name: "Tienda Nativa", industry: "ecommerce de productos para el hogar", goal: "aumentar ventas", customerType: "B2C", location: "Argentina", findings: [
    finding("shop-shipping", "conversion", "negative", "high", "web", "El costo y el plazo de envío aparecen recién al final de la compra."),
    finding("shop-products", "propuesta", "positive", "high", "web", "Las páginas explican materiales, medidas y uso de cada producto."),
    finding("shop-trust", "posicionamiento", "negative", "medium", "web", "No se observan opiniones de compradores cerca de los productos."),
    finding("shop-search", "adquisicion", "positive", "medium", "search", "Varios productos aparecen en búsquedas por su nombre."),
    finding("shop-repeat", "retencion", "negative", "medium", "other", "No se observó una invitación para una segunda compra después del pedido."),
  ] },
  { id: "accounting", name: "Estudio Contable Norte", industry: "estudio contable para pymes", goal: "conseguir reuniones con empresas", location: "Buenos Aires", customerType: "B2B", additional: "La mayoría de los clientes llega por recomendación.", findings: [
    finding("acc-meeting", "conversion", "negative", "high", "web", "El formulario pide datos, pero no permite elegir una reunión."),
    finding("acc-offer", "propuesta", "negative", "high", "web", "La descripción de servicios no aclara para qué tipo de empresa trabaja."),
    finding("acc-proof", "posicionamiento", "positive", "medium", "external_mentions", "Una asociación de pymes menciona una charla del estudio."),
    finding("acc-search", "adquisicion", "negative", "low", "search", "El estudio aparece principalmente cuando se busca su nombre exacto."),
    finding("acc-contact", "presencia", "positive", "medium", "web", "El correo y el teléfono profesional están visibles."),
  ] },
  { id: "locksmith", name: "Cerrajería Centro", industry: "cerrajería de urgencias", goal: "recibir más llamadas", location: "La Plata", web: false, instagram: false, findings: [
    finding("lock-phone", "conversion", "negative", "high", "search", "El número de urgencias no aparece completo en uno de los directorios."),
    finding("lock-hours", "presencia", "negative", "high", "search", "Los horarios publicados difieren entre dos perfiles encontrados."),
    finding("lock-local", "adquisicion", "positive", "high", "search", "El negocio aparece en búsquedas de cerrajería de la zona."),
    finding("lock-reviews", "posicionamiento", "positive", "medium", "reviews", "Las reseñas destacan la rapidez de atención."),
    finding("lock-service", "propuesta", "positive", "low", "external_mentions", "Un directorio identifica el servicio de urgencias a domicilio."),
  ] },
  { id: "pets", name: "Patas Felices", industry: "peluquería canina", goal: "llenar más turnos", location: "San Isidro", findings: [
    finding("pets-book", "conversion", "positive", "high", "instagram", "El perfil ofrece un enlace visible para pedir turno por WhatsApp."),
    finding("pets-work", "redes", "positive", "high", "instagram", "Las publicaciones recientes muestran trabajos antes y después."),
    finding("pets-price", "propuesta", "negative", "medium", "instagram", "No se explica qué incluye cada tipo de baño o corte."),
    finding("pets-reviews", "posicionamiento", "positive", "medium", "reviews", "Las opiniones destacan el cuidado de las mascotas."),
    finding("pets-map", "presencia", "negative", "low", "search", "La ubicación no coincide exactamente entre Instagram y Google."),
  ] },
  { id: "printer", name: "Imprenta Sur", industry: "imprenta para comercios y empresas", goal: "conseguir más pedidos grandes", location: "Avellaneda", customerType: "B2B", findings: [
    finding("print-quote", "conversion", "negative", "high", "web", "No hay un pedido de presupuesto que permita adjuntar medidas o cantidades."),
    finding("print-products", "propuesta", "positive", "medium", "web", "El catálogo separa cartelería, packaging y material comercial."),
    finding("print-cases", "posicionamiento", "positive", "medium", "web", "El sitio muestra trabajos terminados para comercios."),
    finding("print-local", "presencia", "positive", "low", "search", "La dirección del taller aparece en Google."),
    finding("print-search", "adquisicion", "negative", "medium", "search", "La imprenta no aparece para búsquedas de packaging en la zona."),
  ] },
];

const results = fixtures.map(analyzeFixture);
const tokenize = (text) => new Set(text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((word) => word.length > 3));
const similarity = (a, b) => { const left = tokenize(a); const right = tokenize(b); const intersection = [...left].filter((token) => right.has(token)).length; const union = new Set([...left, ...right]).size; return union ? intersection / union : 1; };

test("diez modelos diferentes no colapsan en el mismo análisis", () => {
  assert.equal(results.length, 10);
  const scoreFingerprints = results.map((result) => `${result.score.total}:${result.score.dimensions.map((dimension) => dimension.points).join("-")}`);
  assert.ok(new Set(scoreFingerprints).size >= 8, scoreFingerprints.join("\n"));
  for (let left = 0; left < results.length; left++) for (let right = left + 1; right < results.length; right++) {
    const a = results[left]; const b = results[right];
    if (a.profile.commercialModel === b.profile.commercialModel && a.input.goal === b.input.goal) continue;
    const textA = [a.diagnosis.bottleneck.title, ...a.diagnosis.opportunities, ...a.strategy.actions.slice(0, 5).map((action) => action.title)].join(" ");
    const textB = [b.diagnosis.bottleneck.title, ...b.diagnosis.opportunities, ...b.strategy.actions.slice(0, 5).map((action) => action.title)].join(" ");
    assert.ok(similarity(textA, textB) < .72, `${a.input.name} y ${b.input.name} resultaron demasiado parecidos`);
  }
});

test("cada acción conserva la cadena de evidencia y evita lenguaje técnico para el usuario", () => {
  const banned = /\b(adquisici[oó]n|conversi[oó]n|funnel|posicionamiento|framework|performance|engagement|attribution|dimensi[oó]n)\b/i;
  for (const result of results) for (const action of result.strategy.actions) {
    assert.ok(action.findingIds?.length, `${result.input.name}: ${action.title}`);
    assert.ok(action.evidence && action.inference && action.problem, `${result.input.name}: ${action.title}`);
    assert.doesNotMatch(`${action.title} ${action.description} ${action.rationale}`, banned);
  }
});

test("el mismo gimnasio cambia materialmente cuando el objetivo pasa de socios nuevos a renovaciones", () => {
  const acquisition = results.find((result) => result.input.id === "gym");
  const renewal = analyzeFixture({ ...acquisition.input, id: "gym-renew", goal: "lograr que los socios actuales renueven", additional: "Tenemos pocos cupos en las clases de la tarde y hacemos seguimiento por WhatsApp.", findings: [...acquisition.input.findings, finding("gym-renewal", "retencion", "negative", "high", "other", "No se observó un recordatorio antes del vencimiento de la membresía.")] });
  assert.notEqual(acquisition.diagnosis.bottleneck.findingId, renewal.diagnosis.bottleneck.findingId);
  assert.notEqual(acquisition.profile.primaryCustomerAction, renewal.profile.primaryCustomerAction);
  assert.ok(similarity(acquisition.strategy.actions.map((action) => action.title).join(" "), renewal.strategy.actions.map((action) => action.title).join(" ")) < .65);
});

test("AP cambia materialmente entre conseguir consultas y hacer que vuelvan pacientes", () => {
  const acquisition = results.find((result) => result.input.id === "ap");
  const repeat = analyzeFixture({ ...acquisition.input, id: "ap-repeat", goal: "hacer que vuelvan más pacientes" });
  assert.notEqual(acquisition.diagnosis.bottleneck.findingId, repeat.diagnosis.bottleneck.findingId);
  assert.notEqual(acquisition.profile.primaryCustomerAction, repeat.profile.primaryCustomerAction);
  assert.notDeepEqual(acquisition.strategy.actions.slice(0, 3).map((action) => action.title), repeat.strategy.actions.slice(0, 3).map((action) => action.title));
  console.log("NUVRA_AP_GOALS=" + JSON.stringify({ consultas: { score: acquisition.score.total, problem: acquisition.diagnosis.bottleneck.title, actions: acquisition.strategy.actions.slice(0, 5).map((action) => action.title) }, pacientesQueVuelven: { score: repeat.score.total, problem: repeat.diagnosis.bottleneck.title, actions: repeat.strategy.actions.slice(0, 5).map((action) => action.title) } }));
});

test("dos clínicas con fortalezas y problemas opuestos reciben diagnósticos distintos", () => {
  const clinicA = results.find((result) => result.input.id === "ap");
  const clinicB = results.find((result) => result.input.id === "clinic-b");
  assert.notEqual(clinicA.diagnosis.bottleneck.title, clinicB.diagnosis.bottleneck.title);
  assert.notDeepEqual(clinicA.score.dimensions.map((dimension) => dimension.points), clinicB.score.dimensions.map((dimension) => dimension.points));
  assert.notDeepEqual(clinicA.strategy.actions.slice(0, 3).map((action) => action.title), clinicB.strategy.actions.slice(0, 3).map((action) => action.title));
});

test("el texto libre sobre origen de clientes cambia las acciones", () => {
  const base = results.find((result) => result.input.id === "accounting").input;
  const referrals = analyzeFixture({ ...base, id: "accounting-referrals", additional: "La mayoría de los clientes llega por recomendación." });
  const instagram = analyzeFixture({ ...base, id: "accounting-instagram", additional: "La mayoría de los clientes llega por Instagram." });
  assert.ok(referrals.strategy.actions.some((action) => /recomendaciones/i.test(action.title)));
  assert.ok(instagram.strategy.actions.some((action) => /canal informado/i.test(action.title)));
  assert.notDeepEqual(referrals.strategy.actions.map((action) => action.title), instagram.strategy.actions.map((action) => action.title));
});

test("comparación metodológica legible", () => {
  const selected = ["ap", "gym", "restaurant", "shop", "accounting"].map((id) => results.find((result) => result.input.id === id));
  console.log("NUVRA_COMPARISON=" + JSON.stringify(selected.map((result) => ({ business: result.input.name, score: result.score.total, areas: Object.fromEntries(result.score.dimensions.map((dimension) => [dimension.slug, dimension.points])), strength: result.diagnosis.strengths[0]?.evidence || null, problem: result.diagnosis.bottleneck.title, opportunities: result.diagnosis.opportunities.slice(0, 3), actions: result.strategy.actions.slice(0, 5).map((action) => action.title) }))));
  assert.equal(selected.length, 5);
});
