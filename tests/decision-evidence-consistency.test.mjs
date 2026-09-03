import test from "node:test";
import assert from "node:assert/strict";
import { GoalInterpreter } from "../services/intelligence/goal-interpreter.ts";
import { buildProfileDiagnosis } from "../services/diagnostic/diagnostic-engine.ts";
import { buildProfileStrategy } from "../services/strategy/strategy-engine.ts";

const evidence = (id, kind, text, polarity = "neutral", source = kind === "ObservedEvidence" ? "web" : "onboarding") => ({
  id, kind, source, text, polarity, confidence: "ALTA", journeyStage: "action", possibleImpact: "high", attribution: source,
});

function profile({ goal = "aumentar las consultas calificadas y convertir más consultas en turnos", observed = [], problems = [] } = {}) {
  const interpretation = GoalInterpreter.interpret(goal);
  return {
    businessId: "dermashape", businessName: "Dermashape Palermo", originalIndustry: "Centro de estética", inferredCategory: "salud y estética", commercialModel: "appointments",
    operatingMode: "physical", localDependency: "high", location: "Palermo", customerType: "B2C", offerings: ["tratamientos estéticos"], offeringType: "service",
    audienceSignals: ["personas interesadas en tratamientos estéticos"], primaryCustomerAction: "pedir un turno", primaryResult: "turnos solicitados", recurrence: "periodic",
    requiresAppointmentOrReservation: true, purchasePattern: "repeated", geographicArea: "Palermo", activeChannels: observed.length ? ["web"] : [], primaryChannel: observed.length ? "web" : null,
    unavailableChannels: observed.length ? ["instagram", "reviews"] : ["web", "instagram", "search", "reviews"], channelDeclarations: { web: "unknown", instagram: "unknown" }, contactMethods: [],
    trustSignals: [], declaredSignals: [], strengths: [], problems: [], contextualFindings: [], competitorsDetected: 0,
    goal: { text: goal, goalOriginalText: goal, interpretation, magnitude: null, timeframeDays: 90, timeframeLabel: "3 meses" },
    resources: { monthlyBudget: 250, executionCapacity: "media" }, additionalInformation: null, decisionFactors: { trust: 1, price: .7, reviews: 1, proximity: .8 },
    areaRelevance: {}, inferenceTrace: [], commercialEvidence: [evidence("declared:goal", "DeclaredEvidence", goal), evidence("declared:industry", "DeclaredEvidence", "Centro de estética"), ...observed],
    commercialJourney: { stages: [] }, problemCandidates: problems, strengthCandidates: [], evidenceConflicts: [], processingIssues: [],
  };
}

const weights = { presencia: .13, conversion: .17, posicionamiento: .13, propuesta: .13, redes: .12, adquisicion: .17, identidad: .15 };
const emptyScore = { total: null, dimensions: ["presencia", "conversion", "posicionamiento", "propuesta", "redes", "adquisicion", "identidad"].map((slug) => ({ slug, name: slug, points: null, weight: weights[slug], criteria: [], strengths: [], problems: [], source: "", confidence: "INSUFICIENTE", findings: [] })), weights, allFindings: [], coverage: 0 };
const business = (goal) => ({ nombre: "Dermashape Palermo", rubro: "Centro de estética", objetivo: goal, plazoDias: 90, plazoLabel: "3 meses", ubicacion: "Palermo", tipoCliente: "B2C", presupuesto: 250, capacidad: "media", canales: "", informacionComplementaria: null });

function analyze(inputProfile, score = emptyScore) {
  const context = business(inputProfile.goal.text);
  const diagnosis = buildProfileDiagnosis(context, score, inputProfile);
  const strategy = buildProfileStrategy({ ...context, businessProfile: inputProfile }, diagnosis, score, inputProfile);
  return { diagnosis, strategy };
}

test("turnos con cero áreas evaluables produce validación, no una estrategia inventada", () => {
  const result = analyze(profile());
  const text = JSON.stringify(result).toLowerCase();
  assert.doesNotMatch(text, /reducir dudas|hacer directo el paso|no priorizar pauta|no abrir nuevos canales|generar más alcance/);
  assert.match(result.diagnosis.bottleneck.title, /falta información/i);
  assert.match(result.strategy.distanciaObjetivo, /medir.*turnos solicitados/i);
  assert.ok(result.strategy.actions.length >= 1);
  assert.ok(result.strategy.actions.every((action) => action.framework === "EvidenceValidation"));
  assert.match(result.strategy.actions[0].rationale, /dos semanas|registrar cada consulta/i);
  assert.doesNotMatch(result.strategy.actions[0].evidence || "", /no se encontraron resultados.*competencia/i);
});

test("la fricción de reserva solo habilita simplificar turnos cuando tiene evidencia suficiente", () => {
  const observed = [
    evidence("observed:broken-cta", "ObservedEvidence", "Bloqueo comprobado: el botón para pedir turno devuelve un error y no permite continuar.", "negative"),
    evidence("observed:broken-form", "ObservedEvidence", "En una segunda página, el formulario de turnos tampoco permite completar el envío.", "negative"),
    evidence("observed:contact", "ObservedEvidence", "La web identifica correctamente el centro y su ubicación.", "positive"),
  ];
  const problem = { id: "problem:action", pattern: "action_path", hypothesis: "El recorrido para pedir un turno tiene bloqueos comprobados", causalExplanation: "Dos recorridos independientes no permiten completar el pedido de turno.", journeyStage: "action", evidenceFor: ["observed:broken-cta", "observed:broken-form"], evidenceAgainst: [], frequency: 2, goalImpact: 1, severity: "high", confidence: "ALTA", solvability: .9, dependencies: [], scope: "channel", priorityScore: 94, validationStatus: "validated", validationReason: "Dos bloqueos directos independientes.", evidenceStrength: .9, contradictionStrength: 0, evidenceSufficiency: { status: "strong", score: .9 }, supportingSourceCount: 2, conclusionConfidence: .9 };
  const inputProfile = profile({ observed, problems: [problem] });
  const score = { ...emptyScore, total: 52, coverage: 55, dimensions: emptyScore.dimensions.map((item, index) => ({ ...item, points: index < 2 ? 52 : null, confidence: index < 2 ? "ALTA" : "INSUFICIENTE" })) };
  const result = analyze(inputProfile, score);
  assert.match(result.strategy.actions.map((action) => action.title).join(" "), /simplificar el paso para pedir un turno/i);
  assert.equal(result.strategy.actions.some((action) => action.framework === "CorrectiveAction"), true);
});

test("awareness con evidencia insuficiente no convierte el objetivo en problema de alcance", () => {
  const inputProfile = profile({ goal: "aumentar el reconocimiento del centro en Palermo" });
  const result = analyze(inputProfile);
  const text = JSON.stringify(result).toLowerCase();
  assert.doesNotMatch(text, /el problema (es|principal es).*alcance|falta de alcance|problema de visibilidad/);
  assert.match(result.strategy.distanciaObjetivo, /medir/);
  assert.ok(result.strategy.actions.every((action) => action.framework === "EvidenceValidation"));
});
