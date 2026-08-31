import test from "node:test";
import assert from "node:assert/strict";
import { GoalInterpreter } from "../services/intelligence/goal-interpreter.ts";
import { ActionOpportunityEngine, assessActionQuality } from "../services/strategy/action-opportunity-engine.ts";
import { buildMarketingDecisionContext } from "../services/strategy/marketing-decision-context.ts";
import { buildProfileDiagnosis } from "../services/diagnostic/diagnostic-engine.ts";
import { buildProfileStrategy } from "../services/strategy/strategy-engine.ts";

const ev = (id, source, text, kind = "ObservedEvidence") => ({ id, source, text, kind, polarity: "positive", confidence: "ALTA" });

function profile(overrides = {}) {
  const goal = overrides.goal || "aumentar las visitas y lograr más recompra";
  const interpretation = GoalInterpreter.interpret(goal);
  return {
    businessId: overrides.id || "fixture", businessName: overrides.name || "NÜMA", originalIndustry: overrides.industry || "negocio local", inferredCategory: "local", commercialModel: overrides.model || "reservations",
    operatingMode: overrides.operatingMode || "physical", localDependency: overrides.localDependency || "high", location: overrides.location || "Palermo", customerType: overrides.customerType || "B2C",
    offerings: [overrides.offer || overrides.industry || "productos y servicios"], offeringType: "both", audienceSignals: [overrides.audience || "personas de 20 a 40 años de la zona"],
    primaryCustomerAction: overrides.action || "visitar el local", primaryResult: overrides.result || "visitas al local", recurrence: "frequent", requiresAppointmentOrReservation: false, purchasePattern: "repeated", geographicArea: overrides.location || "Palermo",
    activeChannels: overrides.channels || ["instagram", "search", "other"], primaryChannel: overrides.primaryChannel || "instagram", unavailableChannels: overrides.unavailableChannels || ["web"], channelDeclarations: { web: "absent", instagram: "present" }, contactMethods: overrides.contactMethods || ["WhatsApp"], trustSignals: [],
    declaredSignals: overrides.declaredSignals || [{ id: "declared:demand_pattern", type: "demand_pattern", evidence: "Los fines de semana hay mucho movimiento, pero queremos vender más de lunes a viernes." }, { id: "declared:channel", type: "channel", evidence: "Los clientes llegan por Instagram, Google Maps y WhatsApp." }],
    strengths: [], problems: [], contextualFindings: [], competitorsDetected: 2,
    goal: { text: goal, goalOriginalText: goal, interpretation, magnitude: null, timeframeDays: 90, timeframeLabel: "3 meses" },
    resources: { monthlyBudget: overrides.budget ?? 250, executionCapacity: overrides.capacity || "media" }, additionalInformation: "Los fines de semana hay mucho movimiento, pero queremos vender más de lunes a viernes.",
    decisionFactors: { trust: .8, price: .8, reviews: .9, proximity: 1 }, areaRelevance: {}, inferenceTrace: [],
    commercialEvidence: overrides.evidence || [ev("declared:goal", "onboarding", goal, "DeclaredEvidence"), ev("declared:industry", "onboarding", overrides.industry || "negocio local", "DeclaredEvidence"), ev("declared:additional", "onboarding", "Los fines de semana hay mucho movimiento, pero queremos vender más de lunes a viernes.", "DeclaredEvidence"), ev("ig", "instagram", "El perfil muestra productos, ubicación y actividad reciente."), ev("maps", "search", "La ficha muestra el local en Palermo.")],
    commercialJourney: { stages: [] }, problemCandidates: overrides.problems || [], strengthCandidates: overrides.strengths || [], evidenceConflicts: [], processingIssues: [],
  };
}

test("Noma Café recibe decisiones específicas para días hábiles y recompra", () => {
  const noma = profile({ name: "Noma Café", industry: "cafetería de especialidad", offer: "café de especialidad y productos de cafetería" });
  const result = ActionOpportunityEngine.generate(noma, { businessName: "Noma Café", industry: noma.originalIndustry, location: "Palermo", budget: 250, capacity: "media", timeframeDays: 90, timeframeLabel: "3 meses" });
  assert.ok(result.selected.length >= 3 && result.selected.length <= 5);
  assert.match(result.selected[0].title, /lunes a viernes/i);
  assert.match(result.selected.map((item) => item.title).join(" "), /razón concreta para volver/i);
  assert.equal(result.selected.some((item) => /canal informado|\.\.\.|…|channel_mix/i.test(`${item.title} ${item.description}`)), false);
  for (const action of result.selected) assert.equal(action.quality.accepted, true);
  const score = { total: 58, dimensions: [], weights: { presencia: .13, conversion: .17, posicionamiento: .13, propuesta: .13, redes: .12, adquisicion: .17, identidad: .15 }, allFindings: [], coverage: 45 };
  const business = { nombre: "Noma Café", rubro: noma.originalIndustry, objetivo: noma.goal.text, plazoDias: 90, plazoLabel: "3 meses", descripcion: "Cafetería de especialidad ubicada en Palermo que ofrece café, pastelería artesanal, desayunos y opciones para llevar.", businessProfile: noma };
  const diagnosis = buildProfileDiagnosis(business, score, noma);
  const strategy = buildProfileStrategy({ ...business, ubicacion: "Palermo", tipoCliente: "B2C", presupuesto: 250, capacidad: "media", canales: "Instagram, Google Maps y WhatsApp", informacionComplementaria: noma.additionalInformation }, diagnosis, score, noma);
  assert.equal(strategy.prioridades[0], result.selected[0].title);
  console.log("NUVRA_NOMA_V2=" + JSON.stringify({ context: result.decisionContext, diagnosis: { conclusion: diagnosis.bottleneck, opportunities: diagnosis.opportunities }, strategy: { objective: strategy.objetivo, bet: strategy.distanciaObjetivo, priority: strategy.prioridades[0], kpi: strategy.actions[0]?.kpi }, actions: result.selected.map(({ title, where, audience, executionSteps, purpose, expectedResult, estimatedCost, metric, quality }) => ({ title, where, audience, executionSteps, purpose, expectedResult, estimatedCost, metric, quality })) }));
});

test("el mismo café cambia materialmente para visitas, recurrencia, ticket y pedidos", () => {
  const goals = ["aumentar visitas al local", "lograr que más clientes vuelvan", "aumentar el ticket promedio", "recibir más pedidos por WhatsApp"];
  const outputs = goals.map((goal) => ActionOpportunityEngine.generate(profile({ name: "Noma Café", industry: "cafetería de especialidad", goal, declaredSignals: [{ id: "declared:channel", type: "channel", evidence: "Instagram, Google Maps y WhatsApp." }] }), { businessName: "Noma Café", industry: "cafetería de especialidad", budget: 250, capacity: "media", timeframeDays: 90 }).selected.map((item) => item.title));
  assert.equal(new Set(outputs.map((items) => items[0])).size, 4);
  assert.match(outputs[1].join(" "), /razón concreta para volver/i);
  assert.match(outputs[2].join(" "), /combinación|valor/i);
  assert.match(outputs[3].join(" "), /WhatsApp/i);
});

test("presupuesto y capacidad modifican el plan sin inventar una campaña", () => {
  const base = profile({ strengths: [{ id: "path", pattern: "action_path", evidence: ["ig"], evidenceSufficiency: { status: "sufficient" } }] });
  const zero = ActionOpportunityEngine.generate(base, { businessName: base.businessName, industry: base.originalIndustry, budget: 0, capacity: "baja", timeframeDays: 90 });
  const small = ActionOpportunityEngine.generate(base, { businessName: base.businessName, industry: base.originalIndustry, budget: 250, capacity: "media", timeframeDays: 90 });
  const large = ActionOpportunityEngine.generate(base, { businessName: base.businessName, industry: base.originalIndustry, budget: 3000, capacity: "alta", timeframeDays: 90 });
  assert.equal(zero.considered.some((item) => item.lever === "paid_test"), false);
  assert.equal(small.considered.some((item) => item.lever === "paid_test"), true);
  assert.equal(large.considered.some((item) => item.lever === "paid_test"), true);
  assert.ok(zero.selected.length <= small.selected.length && small.selected.length <= large.selected.length);
});

test("evidencia parcial produce una validación prudente, no una falsa certeza", () => {
  const partial = profile({ evidence: [ev("declared:goal", "onboarding", "conseguir más consultas", "DeclaredEvidence"), ev("declared:industry", "onboarding", "servicios profesionales", "DeclaredEvidence")], unavailableChannels: ["web", "instagram", "search", "reviews"], goal: "conseguir más consultas", model: "professional", localDependency: "medium" });
  const result = ActionOpportunityEngine.generate(partial, { businessName: partial.businessName, industry: partial.originalIndustry, budget: 0, capacity: "baja", timeframeDays: 60 });
  assert.equal(result.decisionContext.evidence.isPartial, true);
  assert.ok(result.selected.some((item) => item.type === "validation"));
  assert.equal(result.selected.some((item) => /certeza|garantiza|demuestra que venderá/i.test(item.description)), false);
});

test("B2B, ecommerce y turnos reciben intervenciones no intercambiables", () => {
  const cases = [
    profile({ name: "Estudio Norte", industry: "estudio contable para pymes", model: "professional", customerType: "B2B", goal: "conseguir reuniones con empresas", action: "solicitar una reunión", result: "reuniones solicitadas", localDependency: "medium" }),
    profile({ name: "Casa Nativa", industry: "ecommerce de hogar", model: "commerce", goal: "aumentar el ticket promedio", action: "completar una compra", result: "ventas completadas", localDependency: "low", operatingMode: "online" }),
    profile({ name: "Clínica Sur", industry: "odontología", model: "appointments", goal: "conseguir más turnos", action: "pedir un turno", result: "turnos solicitados" }),
  ];
  const firstTitles = cases.map((item) => ActionOpportunityEngine.generate(item, { businessName: item.businessName, industry: item.originalIndustry, budget: 250, capacity: "media", timeframeDays: 90 }).selected[0]?.title);
  assert.equal(new Set(firstTitles).size, 3);
});

test("el control de calidad rechaza una recomendación genérica", () => {
  const context = buildMarketingDecisionContext(profile());
  const weak = { title: "Mejorar redes", description: "Publicar contenido.", where: "canal informado", audience: "público objetivo", executionSteps: [], metric: "mejorar resultados", evidenceIds: [], purpose: "Mejorar redes", lever: "content" };
  const quality = assessActionQuality(weak, context);
  assert.equal(quality.accepted, false);
  assert.ok(quality.reasons.length >= 5);
});
