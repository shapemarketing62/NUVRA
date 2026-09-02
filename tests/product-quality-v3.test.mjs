import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildMarketingDecisionContext } from "../services/strategy/marketing-decision-context.ts";
import { buildCausalDecision, buildExperimentDesign } from "../services/strategy/causal-decision-engine.ts";
import { ActionOpportunityEngine } from "../services/strategy/action-opportunity-engine.ts";

function nomaProfile() {
  const evidence = [
    { id: "declared:goal", kind: "DeclaredEvidence", source: "onboarding", text: "Aumentar visitas y recurrencia.", polarity: "neutral", confidence: "ALTA", journeyStage: "discovery" },
    { id: "declared:additional", kind: "DeclaredEvidence", source: "onboarding", text: "Los fines de semana hay mucho movimiento, pero queremos vender más de lunes a viernes.", polarity: "neutral", confidence: "ALTA", journeyStage: "retention" },
    { id: "ig", kind: "ObservedEvidence", source: "instagram", text: "Instagram muestra café, pastelería y ubicación.", polarity: "positive", confidence: "MEDIA", journeyStage: "discovery" },
  ];
  return {
    businessId: "noma", businessName: "Noma Café", originalIndustry: "cafetería de especialidad", inferredCategory: "local", offerings: ["café de especialidad, desayunos y pastelería artesanal"], commercialModel: "reservations", operatingMode: "physical", location: "Palermo", geographicArea: "Palermo", customerType: "B2C", audienceSignals: ["personas de 20 a 40 años de Palermo"], primaryCustomerAction: "visitar el local", primaryResult: "visitas al local", requiresAppointment: false, recurrence: "periodic", purchasePattern: "repeated", trustImportance: "medium", priceImportance: "medium", reviewImportance: "medium", proximityImportance: "high", activeChannels: ["instagram", "search", "other"], unavailableChannels: ["web"], primaryChannel: "instagram", contactMethods: ["WhatsApp"], trustSignals: [], declaredSignals: [{ id: "demand", type: "demand_pattern", evidence: "Los fines de semana hay mucho movimiento, pero queremos vender más de lunes a viernes." }], strengths: [], problems: [], contextualFindings: [], competitorsDetected: 0, goal: { text: "aumentar visitas y recurrencia", goalOriginalText: "aumentar visitas y recurrencia", timeframeDays: 90, timeframeLabel: "3 meses", interpretation: { goalType: "growth" } }, resources: { monthlyBudget: 250, executionCapacity: "media" }, additionalInformation: "Los fines de semana hay mucho movimiento, pero queremos vender más de lunes a viernes.", commercialEvidence: evidence, commercialJourney: { stages: [] }, problemCandidates: [], strengthCandidates: [], evidenceConflicts: [], processingIssues: [], localDependency: "high" };
}

test("la decisión causal separa observación, hipótesis, dudas y alternativas", () => {
  const profile = nomaProfile();
  const context = buildMarketingDecisionContext(profile, { budget: 250, capacity: "media", timeframeDays: 90, timeframeLabel: "3 meses" });
  const decision = buildCausalDecision(profile, context);
  assert.match(decision.observation, /fines de semana|capacidad/i);
  assert.match(decision.hypothesis, /razón específica|repetir/i);
  assert.ok(decision.unknowns.length >= 3);
  assert.ok(decision.whyThisDecision.length >= 3);
  assert.ok(decision.alternativesNotPrioritized.some((item) => /pauta|canales/i.test(item)));
  assert.match(decision.counterfactual, /si .* no modifica|hipótesis/i);
});

test("cada acción conserva una prueba con línea base y criterio de decisión", () => {
  const profile = nomaProfile();
  const output = ActionOpportunityEngine.generate(profile, { businessName: profile.businessName, industry: profile.originalIndustry, location: profile.location, budget: 250, capacity: "media", timeframeDays: 90, timeframeLabel: "3 meses" });
  assert.ok(output.selected.length >= 3);
  for (const action of output.selected) {
    assert.ok(action.causalDecision.hypothesis);
    assert.match(action.experimentDesign.duration, /semanas/);
    assert.match(action.experimentDesign.baselineMetric, /antes|línea base/i);
    assert.match(action.experimentDesign.successCriteria, /línea base|sostenida/i);
    assert.ok(action.experimentDesign.ifWorks && action.experimentDesign.ifNot);
    assert.doesNotMatch(action.experimentDesign.hypothesis, /si\s*,/i);
  }
});

test("la UI presenta síntesis y no expone internals técnicos", () => {
  const files = ["app/dashboard/page.tsx", "app/dashboard/diagnostico/page.tsx", "app/dashboard/estrategia/page.tsx", "app/dashboard/acciones/page.tsx"];
  const source = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(source, /conclusionConfidence|evidenceSufficiency|priorityScore|counterfactual/i);
  assert.match(source, /Lo más importante ahora/);
  assert.match(source, /Qué necesitamos validar/);
  assert.match(source, /Qué no vamos a priorizar ahora/);
  assert.match(source, /Criterio de éxito/);
});

test("el experimento no inventa un objetivo numérico", () => {
  const profile = nomaProfile();
  const context = buildMarketingDecisionContext(profile, { budget: 250, capacity: "media", timeframeDays: 90 });
  const experiment = buildExperimentDesign(context, { title: "Probar una propuesta entre semana", description: "Comunicar una propuesta acotada.", audience: "personas de Palermo", metric: "tickets de lunes a viernes", expectedResult: "más visitas" });
  assert.doesNotMatch(experiment.successCriteria, /\b\d+%/);
  assert.match(experiment.successCriteria, /línea base/);
});
