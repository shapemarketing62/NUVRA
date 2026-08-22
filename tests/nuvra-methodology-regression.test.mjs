import test from "node:test";
import assert from "node:assert/strict";
import { NuvraScoreCalculator } from "../services/intelligence/nuvra-score-calculator.ts";
import { getPrimaryBusinessStep, getBudgetFocus, isRetentionObjective, isSpecificBusinessAction } from "../services/strategy/business-action-language.ts";
import fs from "node:fs";

const dimensions = ["presencia", "conversion", "posicionamiento", "propuesta", "redes", "adquisicion"];
const finding = (category, source, type, impact, evidence) => ({
  id: `${category}-${source}-${evidence}`,
  source,
  type,
  category,
  evidence,
  attribution: `https://${source}.example`,
  confidence: "ALTA",
  weight: 1,
  impact,
});

function evaluateScenario(scenario) {
  const byDimension = Object.fromEntries(dimensions.map(name => [name, []]));
  for (const item of scenario.findings) byDimension[item.category].push(item);
  const sources = Object.fromEntries([...new Set(scenario.findings.map(item => item.source))].map(source => [source, {
    source,
    status: "evaluated",
    data: {},
    findings: scenario.findings.filter(item => item.source === source),
    confidence: "ALTA",
    coverage: 60,
    evaluatedAt: new Date(),
    requiresAuth: false,
  }]));
  const aggregated = {
    businessId: scenario.id,
    sources,
    findings: scenario.findings,
    deduplicated: scenario.findings,
    byCategory: byDimension,
    byDimension,
    evaluatedAt: new Date(),
  };
  const coverage = {
    overallMarketingCoverage: 20,
    total: 20,
    bySource: {},
    evaluatedSources: Object.keys(sources),
    missingSources: [],
    relevantSources: Object.keys(sources),
    requiresAuthSources: [],
    canCalculateNuvraScore: false,
    reason: "control interno",
  };
  const score = NuvraScoreCalculator.calculate(aggregated, coverage, { objective: scenario.objective });
  return {
    name: scenario.name,
    information: [...new Set(scenario.findings.map(item => item.source))],
    dimensions: score.dimensions.filter(item => item.points !== null).map(item => item.slug),
    score: score.total,
    mainProblem: scenario.mainProblem,
    priority: scenario.priority,
    actions: [getPrimaryBusinessStep(scenario).action, ...scenario.actions].slice(0, 3),
    objective: scenario.objective,
    methodology: score.methodology,
  };
}

const cases = [
  { id: "clinic", name: "Clínica estética local", rubro: "clínica de medicina estética", tipoCliente: "B2C", objective: "aumentar consultas 20%", mainProblem: "El pedido de turno no es suficientemente visible", priority: "Facilitar el pedido de turno", actions: ["Explicar tratamientos y resultados esperables", "Medir turnos solicitados por canal"], findings: [finding("conversion", "web", "negative", "high", "El pedido de turno no aparece al comienzo"), finding("adquisicion", "search", "negative", "medium", "La clínica tiene poca presencia para búsquedas locales"), finding("propuesta", "web", "positive", "medium", "Los tratamientos están explicados")] },
  { id: "gym", name: "Gimnasio boutique", rubro: "gimnasio boutique fitness", tipoCliente: "B2C", objective: "aumentar clases de prueba", mainProblem: "La clase de prueba no tiene un recorrido directo", priority: "Conseguir reservas de prueba", actions: ["Mostrar horarios y modalidad", "Medir clases reservadas y asistencias"], findings: [finding("conversion", "web", "negative", "medium", "No hay reserva directa de clase"), finding("adquisicion", "search", "positive", "medium", "El gimnasio aparece en búsquedas de la zona"), finding("redes", "instagram", "positive", "medium", "La cuenta muestra actividad reciente")] },
  { id: "restaurant", name: "Restaurante independiente", rubro: "restaurante independiente", tipoCliente: "B2C", objective: "aumentar reservas", mainProblem: "Reservar mesa requiere demasiados pasos", priority: "Simplificar reservas", actions: ["Mostrar menú y horarios actualizados", "Medir reservas y pedidos"], findings: [finding("presencia", "directory", "positive", "medium", "Horarios visibles en directorios"), finding("conversion", "web", "negative", "medium", "La reserva requiere varios pasos"), finding("posicionamiento", "reviews", "positive", "medium", "Las reseñas destacan la atención")] },
  { id: "ecommerce", name: "Ecommerce pequeño", rubro: "ecommerce tienda online", tipoCliente: "B2C", objective: "aumentar ventas", mainProblem: "El paso a compra pierde claridad", priority: "Mejorar el recorrido de compra", actions: ["Aclarar envíos y cambios", "Medir compras iniciadas y completadas"], findings: [finding("presencia", "web", "positive", "medium", "La tienda funciona en dispositivos móviles"), finding("conversion", "web", "negative", "low", "El costo de envío aparece tarde"), finding("propuesta", "web", "positive", "medium", "Los productos explican su beneficio"), finding("adquisicion", "search", "positive", "medium", "Hay productos visibles en búsquedas")] },
  { id: "b2b", name: "Servicio profesional B2B", rubro: "consultoría profesional B2B", tipoCliente: "B2B", objective: "generar reuniones comerciales", mainProblem: "La propuesta no conduce a una reunión", priority: "Conseguir conversaciones calificadas", actions: ["Mostrar casos del sector", "Medir reuniones solicitadas"], findings: [finding("conversion", "web", "negative", "high", "No hay una invitación clara a conversar"), finding("propuesta", "web", "negative", "medium", "La oferta no especifica para qué empresas es"), finding("adquisicion", "external_mentions", "positive", "medium", "Hay menciones en medios del sector")] },
  { id: "no-web", name: "Negocio sin web propia", rubro: "servicio local", tipoCliente: "B2C", objective: "recibir más consultas", mainProblem: "La información está dispersa entre perfiles externos", priority: "Unificar el punto de contacto", actions: ["Completar perfiles públicos", "Medir consultas por perfil"], findings: [finding("adquisicion", "search", "positive", "medium", "El negocio aparece en búsquedas locales"), finding("posicionamiento", "reviews", "positive", "medium", "Las reseñas identifican el servicio"), finding("propuesta", "external_mentions", "negative", "medium", "La descripción del servicio cambia entre perfiles")] },
  { id: "web-no-social", name: "Negocio con web sin redes", rubro: "servicio profesional", tipoCliente: "B2C", objective: "aumentar consultas", mainProblem: "El sitio recibe interés pero no facilita el contacto", priority: "Mejorar el contacto desde la web", actions: ["Aclarar el servicio principal", "Medir consultas desde la web"], findings: [finding("presencia", "web", "positive", "medium", "El sitio es accesible y legible"), finding("conversion", "web", "negative", "medium", "El contacto no aparece al comienzo"), finding("propuesta", "web", "negative", "low", "El título principal es genérico")] },
  { id: "instagram-only", name: "Negocio con solo Instagram", rubro: "comercio de indumentaria", objective: "conseguir más ventas", mainProblem: "La compra no tiene un paso único", priority: "Ordenar pedidos desde Instagram", actions: ["Aclarar cómo comprar", "Medir pedidos recibidos"], findings: [finding("redes", "instagram", "positive", "medium", "El perfil público está identificado"), finding("conversion", "instagram", "negative", "medium", "La forma de comprar no aparece con claridad"), finding("propuesta", "instagram", "positive", "low", "Los productos principales son visibles")] },
  { id: "physical", name: "Comercio físico local", rubro: "comercio local", objective: "conseguir más clientes en el local", mainProblem: "La ubicación cambia entre perfiles", priority: "Unificar datos locales", actions: ["Corregir horarios y ubicación", "Medir visitas que llegan desde Google"], findings: [finding("presencia", "search", "negative", "medium", "Los horarios cambian entre directorios"), finding("posicionamiento", "reviews", "positive", "medium", "Las opiniones confirman la atención en el local"), finding("adquisicion", "search", "positive", "medium", "Existe demanda para el rubro en la zona")] },
  { id: "name-location", name: "Negocio identificado por nombre y zona", rubro: "profesional independiente", objective: "conseguir más presupuestos o reuniones", mainProblem: "La información está repartida", priority: "Crear un contacto principal", actions: ["Unificar perfiles públicos", "Medir solicitudes de presupuesto"], findings: [finding("presencia", "search", "positive", "low", "El profesional aparece por nombre y ubicación"), finding("posicionamiento", "external_mentions", "positive", "low", "Un directorio relaciona al profesional con su especialidad"), finding("adquisicion", "search", "negative", "medium", "No hay un canal principal para solicitar presupuesto")] },
];

test("una única dimensión no se presenta como score general", () => {
  const scenario = { ...cases[0], findings: [cases[0].findings[0]] };
  const result = evaluateScenario(scenario);
  assert.equal(result.score, null);
  assert.deepEqual(result.dimensions, ["conversion"]);
});

test("diez negocios pequeños producen lecturas trazables y útiles con distintas combinaciones de fuentes", () => {
  const results = cases.map(evaluateScenario);
  for (const result of results) {
    assert.ok(result.dimensions.length >= 2, result.name);
    assert.notEqual(result.score, null, result.name);
    assert.equal(result.actions.length, 3, result.name);
    assert.ok(result.objective.length > 0, result.name);
  }
  assert.ok(new Set(results.map(result => result.actions[0])).size >= 5);
  assert.ok(new Set(results.map(result => `${result.score}:${result.priority}`)).size === results.length);
  console.log(JSON.stringify(results, null, 2));
});

test("la calibración recorre de forma progresiva negocios muy malos a excelentes", () => {
  const levels = [
    { name: "muy malo", negatives: 2, positives: 0, impact: "high" },
    { name: "malo", negatives: 1, positives: 0, impact: "medium" },
    { name: "medio", negatives: 0, positives: 0, impact: "low" },
    { name: "bueno", negatives: 0, positives: 2, impact: "low" },
    { name: "excelente", negatives: 0, positives: 4, impact: "low" },
  ];
  const results = levels.map(level => {
    const findings = ["conversion", "propuesta", "adquisicion"].flatMap(category => {
      const neutral = level.name === "medio" ? [finding(category, "web", "neutral", "low", `${category} observado sin problema ni fortaleza`)] : [];
      const negatives = Array.from({ length: level.negatives }, (_, index) => finding(category, index ? "search" : "web", "negative", level.impact, `${category} problema independiente ${index}`));
      const positives = Array.from({ length: level.positives }, (_, index) => finding(category, index % 2 ? "search" : "web", "positive", "medium", `${category} fortaleza independiente ${index}`));
      return [...neutral, ...negatives, ...positives];
    });
    return evaluateScenario({ id: level.name, name: level.name, rubro: "servicio", tipoCliente: "B2C", objective: "aumentar consultas", mainProblem: level.name, priority: level.name, actions: ["Acción específica", "Métrica específica"], findings }).score;
  });
  assert.deepEqual(results, [10, 31, 38, 58, 78]);
  for (let index = 1; index < results.length; index++) assert.ok(results[index] > results[index - 1]);
});

test("manifestaciones del mismo obstáculo se penalizan una sola vez", () => {
  const base = { id: "dedupe", name: "Clínica", rubro: "clínica estética", tipoCliente: "B2C", objective: "aumentar consultas", mainProblem: "contacto", priority: "turnos", actions: ["Explicar tratamiento", "Medir turnos"] };
  const one = evaluateScenario({ ...base, findings: [finding("conversion", "web", "negative", "high", "No hay un botón claro para pedir turno")] });
  const repeated = evaluateScenario({ ...base, findings: [
    finding("conversion", "web", "negative", "high", "No hay un botón claro para pedir turno"),
    finding("conversion", "web", "negative", "medium", "El contacto está poco visible"),
    finding("conversion", "web", "negative", "medium", "Es difícil avanzar hacia una consulta"),
  ] });
  assert.equal(one.dimensions.length, 1);
  assert.equal(repeated.dimensions.length, 1);
  assert.equal(one.methodology.dimensionWeights.conversion.evidenceQuality, repeated.methodology.dimensionWeights.conversion.evidenceQuality);
});

test("dos clínicas y dos objetivos generan enfoques diferentes", () => {
  assert.equal(getPrimaryBusinessStep({ rubro: "clínica estética", tipoCliente: "B2C" }).action, "Pedir turno");
  assert.equal(isRetentionObjective({ rubro: "clínica estética", objetivo: "aumentar recompra de tratamientos" }), true);
  assert.equal(isRetentionObjective({ rubro: "clínica estética", objetivo: "aumentar consultas" }), false);
  assert.match(getBudgetFocus({ rubro: "clínica estética", ubicacion: "Palermo", presupuesto: 250 }), /USD 250.*búsquedas locales.*Palermo/);
  const strategySource = fs.readFileSync(new URL("../services/strategy/strategy-engine.ts", import.meta.url), "utf8");
  assert.match(strategySource, /clientes que vuelven y tiempo entre compras o atenciones/);
  assert.match(strategySource, /alternativas de \$\{getLocalMarketLabel\(context\)\}/);
  assert.match(strategySource, /constrainedExecution/);
});

test("las acciones genéricas sin detalle son rechazadas", () => {
  for (const title of ["Mejorar redes", "Mejorar SEO", "Publicar contenido", "Optimizar web", "Hacer publicidad"]) {
    assert.equal(isSpecificBusinessAction({ title, description: "", rationale: "", evidence: "", kpi: "" }), false);
  }
  assert.equal(isSpecificBusinessAction({
    title: "Hacer visible “Pedir turno” desde la primera pantalla",
    description: "Ubicar una única acción para pedir turno al comienzo de la página de tratamientos faciales.",
    rationale: "El objetivo es conseguir más consultas y hoy el contacto requiere pasos adicionales.",
    evidence: "El pedido de turno no aparece en la primera pantalla.",
    kpi: "turnos solicitados",
  }), true);
});

test("el dashboard prioriza valor cuando el score general no está disponible", () => {
  const dashboard = fs.readFileSync(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
  for (const heading of ["Lo más importante que encontramos", "Cómo afecta tu objetivo", "Qué haríamos primero", "Cómo medir si mejora"]) assert.match(dashboard, new RegExp(heading));
  assert.match(dashboard, /El puntaje general se completa automáticamente/);
  assert.doesNotMatch(dashboard, /CoverageBar|PRELIMINAR/);
});
