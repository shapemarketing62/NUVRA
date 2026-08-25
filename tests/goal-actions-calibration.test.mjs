import test from "node:test";
import assert from "node:assert/strict";
import { GoalInterpreter } from "../services/intelligence/goal-interpreter.ts";
import { ActionOpportunityEngine } from "../services/strategy/action-opportunity-engine.ts";

test("GoalInterpreter conserva el texto y distingue seis objetivos naturales", () => {
  const cases = [
    ["Quiero conseguir 20 clientes nuevos.", "growth", "clients"],
    ["Quiero aumentar los turnos de lunes a miércoles.", "reservations", "reservations"],
    ["Quiero vender más pero sin gastar más en publicidad.", "sales", "sales"],
    ["Quiero que mis clientes vuelvan.", "retention", null],
    ["Quiero conseguir empresas más grandes como clientes.", "larger_clients", "consultations"],
    ["Quiero ser más conocido en Palermo.", "awareness", null],
  ].map(([text, type, metric]) => ({ text, type, metric, result: GoalInterpreter.interpret(text) }));
  for (const item of cases) {
    assert.equal(item.result.goalOriginalText, item.text);
    assert.equal(item.result.goalType, item.type);
    assert.equal(item.result.targetMetric, item.metric);
    assert.ok(item.result.confidence >= .45);
  }
  assert.deepEqual(cases[1].result.targetDays, ["lunes", "martes", "miércoles"]);
  assert.equal(cases[2].result.constraints.some((item) => item.type === "budget"), true);
  assert.equal(cases[4].result.desiredCustomer, "empresas o clientes de mayor tamaño");
  assert.equal(cases[5].result.geography, "Palermo");
  const vague = GoalInterpreter.interpret("Quiero crecer.");
  assert.ok(vague.clarificationQuestion);
  console.log("NUVRA_FREE_GOALS=" + JSON.stringify(cases.map((item) => item.result)));
});

test("Barbería y estudio reciben tres palancas ejecutables y no intercambiables", () => {
  const barber = profile({
    name: "NEGRO Urban Barber Palermo", industry: "barbería urbana", model: "appointments", recurrence: "periodic", localDependency: "high", location: "Palermo", goal: "Quiero aumentar los turnos de lunes a miércoles.", action: "pedir un turno", result: "turnos solicitados", channels: ["instagram", "search", "reviews"],
    evidence: [
      ev("declared:goal", "onboarding", "Quiero aumentar los turnos de lunes a miércoles."), ev("declared:industry", "onboarding", "barbería urbana"), ev("declared:location", "onboarding", "Palermo"),
      ev("ig-work", "instagram", "Instagram muestra trabajos recientes y conduce al sistema de turnos."), ev("maps", "search", "La barbería aparece en búsquedas de Palermo."), ev("review", "reviews", "Reseñas recientes destacan los cortes y la atención."), ev("booking", "web", "El recorrido para pedir turno fue comprobado."),
    ], actionStrength: ["booking"],
  });
  const studio = profile({
    name: "Estudio Contable Maroni", industry: "estudio contable para empresas", model: "professional", recurrence: "occasional", localDependency: "medium", location: "Buenos Aires", goal: "Quiero conseguir empresas más grandes como clientes.", action: "solicitar una consulta o reunión", result: "consultas o reuniones solicitadas", channels: ["web", "search", "external_mentions"], declaredSignals: [{ id: "declared:referrals", type: "referrals", evidence: "La mayoría de los clientes llega por recomendación." }],
    evidence: [ev("declared:goal", "onboarding", "Quiero conseguir empresas más grandes como clientes."), ev("declared:industry", "onboarding", "estudio contable para empresas"), ev("declared:description", "onboarding", "Impuestos, sueldos y asesoramiento para empresas."), ev("declared:additional", "onboarding", "La mayoría de los clientes llega por recomendación."), ev("authority", "external_mentions", "Una asociación empresarial menciona una charla tributaria del estudio.")],
  });
  const barberResult = ActionOpportunityEngine.generate(barber, { businessName: barber.businessName, industry: barber.originalIndustry, location: barber.location, budget: 200, capacity: "Somos 2–3 personas", timeframeDays: 45 });
  const studioResult = ActionOpportunityEngine.generate(studio, { businessName: studio.businessName, industry: studio.originalIndustry, location: studio.location, budget: 75, capacity: "Lo hago yo", timeframeDays: 180 });
  for (const result of [barberResult, studioResult]) {
    assert.equal(result.selected.length, 3);
    assert.equal(new Set(result.selected.map((item) => item.lever)).size, 3);
    for (const action of result.selected) {
      assert.doesNotMatch(action.title, /^(conservar|mantener|seguir haciendo)\b/i);
      assert.ok(action.description.length >= 80);
      assert.ok(action.metric.length >= 8);
      assert.ok(action.evidenceIds.length > 0);
    }
  }
  assert.notDeepEqual(barberResult.selected.map((item) => item.title), studioResult.selected.map((item) => item.title));
  assert.ok(barberResult.selected.some((item) => /lunes|miércoles|Palermo|turno/i.test(`${item.title} ${item.description}`)));
  assert.ok(studioResult.selected.some((item) => /situaciones|empresas|recomendaciones/i.test(`${item.title} ${item.description}`)));
  console.log("NUVRA_ACTION_COMPARISON=" + JSON.stringify({ barberia: barberResult.selected, estudio: studioResult.selected }));
});

test("el presupuesto habilita una prueba paga solo dentro del rango previsto", () => {
  const business = profile({ name: "Comercio", industry: "tienda local", model: "commerce", recurrence: "periodic", localDependency: "high", location: "Palermo", goal: "Quiero vender más.", action: "completar una compra", result: "ventas completadas", channels: ["web", "search"], evidence: [ev("declared:goal", "onboarding", "Quiero vender más."), ev("declared:industry", "onboarding", "tienda local"), ev("search", "search", "Los productos aparecen en búsquedas."), ev("purchase", "web", "La compra fue comprobada.")], actionStrength: ["purchase"] });
  const noBudget = ActionOpportunityEngine.generate(business, { businessName: "Comercio", industry: "tienda local", budget: 75, timeframeDays: 60 });
  const withBudget = ActionOpportunityEngine.generate(business, { businessName: "Comercio", industry: "tienda local", budget: 500, timeframeDays: 60 });
  assert.equal(noBudget.considered.some((item) => item.lever === "paid_test"), false);
  assert.equal(withBudget.considered.some((item) => item.lever === "paid_test"), true);
});

function ev(id, source, text) { return { id, source, text, polarity: "positive", confidence: "ALTA" }; }
function profile(input) {
  const interpretation = GoalInterpreter.interpret(input.goal);
  return {
    businessName: input.name, originalIndustry: input.industry, commercialModel: input.model, recurrence: input.recurrence, localDependency: input.localDependency, location: input.location, customerType: input.model === "professional" ? "B2B" : "B2C", offerings: [input.industry], primaryCustomerAction: input.action, primaryResult: input.result, primaryChannel: input.channels[0], activeChannels: input.channels, declaredSignals: input.declaredSignals || [], resources: { monthlyBudget: null, executionCapacity: null },
    goal: { text: input.goal, goalOriginalText: input.goal, interpretation }, commercialEvidence: input.evidence, problemCandidates: [], strengthCandidates: input.actionStrength ? [{ id: "action-strength", pattern: "action_path", evidence: input.actionStrength, evidenceSufficiency: { status: "sufficient" } }] : [],
  };
}
