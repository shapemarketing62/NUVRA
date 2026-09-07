import test from "node:test";
import assert from "node:assert/strict";
import { buildDiagnosticFindings, buildChannelInsights, buildStrategyPlan, presentPrimaryStep } from "../services/diagnostic/diagnostic-finding-presenter.ts";

const profile = {
  businessId: "test",
  businessName: "Estética Dental argentina",
  originalIndustry: "Odontología estética",
  inferredCategory: "Salud",
  commercialModel: "appointments" as const,
  operatingMode: "physical" as const,
  localDependency: "high" as const,
  location: "Recoleta, CABA",
  customerType: "B2C",
  offerings: ["Odontología estética"],
  offeringType: "service" as const,
  audienceSignals: ["personas interesadas en tratamientos estéticos"],
  primaryCustomerAction: "Pedir turno",
  primaryResult: "turnos solicitados",
  recurrence: "occasional" as const,
  requiresAppointmentOrReservation: true,
  purchasePattern: "single" as const,
  geographicArea: "Recoleta, CABA",
  activeChannels: ["search", "web", "instagram", "reviews"] as Array<"search" | "web" | "instagram" | "reviews">,
  primaryChannel: "search" as const,
  unavailableChannels: [] as string[],
  channelDeclarations: { web: "present" as const, instagram: "present" as const },
  contactMethods: ["WhatsApp"],
  trustSignals: ["reseñas positivas"],
  declaredSignals: [],
  strengths: [],
  problems: [],
  contextualFindings: [],
  competitorsDetected: 0,
  goal: { text: "Aumentar la cantidad de consultas calificadas", goalOriginalText: "Aumentar la cantidad de consultas calificadas para tratamientos de estética dental", interpretation: { goalType: "consultations", goalOriginalText: "Aumentar la cantidad de consultas calificadas para tratamientos de estética dental", goalScope: ["consultas", "tratamientos"] }, magnitude: null, timeframeDays: 90, timeframeLabel: "3 meses" },
  resources: { monthlyBudget: null, executionCapacity: null },
  additionalInformation: null,
  decisionFactors: { trust: 1, price: 0.9, reviews: 0.95, proximity: 1 },
  areaRelevance: {},
  inferenceTrace: [],
  commercialEvidence: [
    { id: "ev1", text: "El sitio oficial fue encontrado en búsquedas relacionadas con estética dental en Recoleta.", source: "search", polarity: "positive", confidence: "ALTA", journeyStage: "discovery", kind: "ObservedEvidence", reputationEvidenceConfidence: 0.8 },
    { id: "ev2", text: "Posición 4 en la búsqueda 'estética dental Recoleta'.", source: "search", polarity: "positive", confidence: "MEDIA", journeyStage: "discovery", kind: "ObservedEvidence", reputationEvidenceConfidence: 0.7 },
    { id: "ev3", text: "Perfil de Instagram encontrado con contenido público visible.", source: "instagram", polarity: "positive", confidence: "MEDIA", journeyStage: "discovery", kind: "ObservedEvidence", reputationEvidenceConfidence: 0.6 },
    { id: "ev4", text: "5 reseñas positivas destacando profesionalismo y limpieza.", source: "reviews", polarity: "positive", confidence: "ALTA", journeyStage: "decision", kind: "ObservedEvidence", reputationEvidenceConfidence: 0.9 },
    { id: "ev5", text: "El sitio web tiene muchas páginas pero el mensaje principal no explica claramente qué tratamientos ofrecen.", source: "web", polarity: "negative", confidence: "MEDIA", journeyStage: "evaluation", kind: "ObservedEvidence", reputationEvidenceConfidence: 0.5 },
  ],
  commercialJourney: null as any,
  problemCandidates: [
    {
      id: "problem:1",
      pattern: "offer_clarity",
      hypothesis: "Las personas pueden encontrar el negocio, pero no reunir suficiente claridad sobre qué ofrece y por qué les conviene elegirlo.",
      journeyStage: "evaluation",
      evidenceFor: ["ev5"],
      evidenceAgainst: [],
      frequency: 1,
      goalImpact: 0.85,
      commercialRelevance: 0.8,
      severity: "medium",
      confidence: "MEDIA",
      solvability: 0.9,
      dependencies: [],
      scope: "single_touchpoint",
      priorityScore: 50,
      causalExplanation: "El mensaje principal no comunica con claridad el beneficio diferencial; el usuario no entiende rápidamente por qué elegir este negocio.",
      evidenceStrength: 0.6,
      contradictionStrength: 0.1,
      supportingIndependentSignals: 1,
      contradictingIndependentSignals: 0,
      supportingSourceCount: 1,
      contradictingSourceCount: 0,
      validationStatus: "validated",
      validationReason: "Evidencia suficiente",
      evidenceSufficiency: { status: "partial", score: 0.6, reasons: ["Una sola fuente negativa"] },
      conclusionConfidence: 0.55,
    },
  ],
  strengthCandidates: [
    {
      id: "strength:1",
      pattern: "visibility",
      statement: "El negocio ya logra aparecer en canales donde puede ser descubierto.",
      journeyStage: "discovery",
      evidence: ["ev1", "ev2"],
      frequency: 2,
      commercialImpact: 0.8,
      confidence: "MEDIA",
      exploitability: 0.9,
      priorityScore: 60,
      evidenceSufficiency: { status: "partial", score: 0.7, reasons: [] },
      conclusionConfidence: 0.65,
    },
  ],
  evidenceConflicts: [],
  processingIssues: [],
} as any;

test("buildDiagnosticFindings genera hallazgos humanos limitados a 5", () => {
  const findings = buildDiagnosticFindings(profile, { total: 70, dimensions: [{ slug: "presencia", points: 70, confidence: "MEDIA" }] });
  assert.ok(Array.isArray(findings));
  assert.ok(findings.length <= 5);
  assert.ok(findings.some((f) => f.title.length > 0));
  assert.ok(findings.every((f) => typeof f.whatWeSaw === "string" && f.whatWeSaw.length > 0));
  assert.ok(findings.every((f) => ["fuerte", "parcial", "por validar"].includes(f.strength)));
});

test("buildChannelInsights muestra estado por canal", () => {
  const insights = buildChannelInsights(profile, { total: 70, dimensions: [] });
  const search = insights.find((i) => i.channel === "search");
  assert.ok(search);
  assert.strictEqual(search.status, "analyzed");
  assert.ok(search.summary.includes("búsquedas"));
});

test("buildStrategyPlan genera fases accionables", () => {
  const plan = buildStrategyPlan(profile, { objetivo: "Aumentar consultas", plazoLabel: "3 meses", magnitud: null }, [
    { title: "Mejorar la claridad de la oferta", description: "Explicar tratamientos y diferencial en el sitio.", timeframe: "30 días", kpi: "turnos solicitados", evidence: "Evidencia" },
  ]);
  assert.strictEqual(plan.objective, "Aumentar consultas en 3 meses");
  assert.ok(plan.phases.length >= 1);
  assert.ok(plan.phases[0].actions[0].what.length > 0);
});

test("presentPrimaryStep reconoce estética dental", () => {
  const step = presentPrimaryStep({ rubro: "Odontología estética", tipoCliente: "B2C" });
  assert.strictEqual(step.action, "Pedir turno");
  assert.strictEqual(step.result, "turnos solicitados");
});
