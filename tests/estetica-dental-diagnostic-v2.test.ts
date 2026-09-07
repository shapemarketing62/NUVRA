import test from "node:test";
import assert from "node:assert/strict";
import { buildDiagnosticFindings, buildChannelInsights, buildStrategyPlan } from "../services/diagnostic/diagnostic-finding-presenter.ts";

const estheticProfile = {
  businessId: "estetica-dental",
  businessName: "Estética Dental argentina",
  originalIndustry: "Odontología estética",
  inferredCategory: "Salud",
  commercialModel: "appointments" as const,
  operatingMode: "physical" as const,
  localDependency: "high" as const,
  location: "Recoleta, CABA",
  customerType: "B2C",
  offerings: ["Odontología estética", "Implantes", "Blanqueamiento"],
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
  trustSignals: ["5 reseñas positivas"],
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
    { id: "ev1", text: "Sitio oficial encontrado en búsquedas de estética dental en Recoleta.", source: "search", polarity: "positive", confidence: "ALTA", journeyStage: "discovery", kind: "ObservedEvidence", reputationEvidenceConfidence: 0.8 },
    { id: "ev2", text: "Posición 4 en la búsqueda 'estética dental Recoleta'.", source: "search", polarity: "positive", confidence: "MEDIA", journeyStage: "discovery", kind: "ObservedEvidence", reputationEvidenceConfidence: 0.7 },
    { id: "ev3", text: "Perfil de Instagram encontrado con bio y link.", source: "instagram", polarity: "positive", confidence: "MEDIA", journeyStage: "discovery", kind: "ObservedEvidence", reputationEvidenceConfidence: 0.6 },
    { id: "ev4", text: "5 reseñas positivas destacando profesionalismo y limpieza.", source: "reviews", polarity: "positive", confidence: "ALTA", journeyStage: "decision", kind: "ObservedEvidence", reputationEvidenceConfidence: 0.9 },
    { id: "ev5", text: "El sitio web tiene muchas páginas pero el mensaje principal no explica claramente qué tratamientos ofrecen.", source: "web", polarity: "negative", confidence: "MEDIA", journeyStage: "evaluation", kind: "ObservedEvidence", reputationEvidenceConfidence: 0.5 },
    { id: "ev6", text: "10 páginas analizadas del sitio web oficial.", source: "web", polarity: "positive", confidence: "ALTA", journeyStage: "presence", kind: "ObservedEvidence", reputationEvidenceConfidence: 0.8 },
  ],
  commercialJourney: null as any,
  problemCandidates: [
    {
      id: "problem:offer",
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
      id: "strength:visibility",
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

test("fixture Estética Dental Argentina: diagnóstico V2 genera hallazgos específicos", () => {
  const findings = buildDiagnosticFindings(estheticProfile, { total: 70, dimensions: [{ slug: "presencia", points: 78, confidence: "MEDIA" }, { slug: "conversion", points: 82, confidence: "ALTA" }, { slug: "posicionamiento", points: 76, confidence: "MEDIA" }, { slug: "propuesta", points: 56, confidence: "BAJA" }, { slug: "adquisicion", points: 68, confidence: "MEDIA" }, { slug: "identidad", points: 54, confidence: "BAJA" }] });
  assert.ok(findings.length >= 1);
  const titles = findings.map((f) => f.title);
  assert.ok(titles.some((t) => /claridad|ofrece|elegir/i.test(t)), "Debe mencionar claridad de oferta");
  assert.ok(findings.every((f) => f.whatWeSaw.length > 0), "Cada hallazgo debe tener qué vimos");
  assert.ok(findings.every((f) => f.recommendation.length > 0), "Cada hallazgo debe tener recomendación");
});

test("fixture Estética Dental Argentina: canales muestran presencia real", () => {
  const insights = buildChannelInsights(estheticProfile, { total: 70, dimensions: [] });
  const search = insights.find((i) => i.channel === "search");
  const web = insights.find((i) => i.channel === "web");
  const instagram = insights.find((i) => i.channel === "instagram");
  const reviews = insights.find((i) => i.channel === "reviews");
  assert.ok(search);
  assert.ok(web);
  assert.ok(instagram);
  assert.ok(reviews);
  assert.ok(search.summary.includes("búsquedas"));
  assert.ok(web.summary.includes("sitio web oficial"));
  assert.ok(instagram.summary.includes("Instagram"));
  assert.ok(reviews.summary.includes("reseña") || reviews.summary.includes("reseñas"));
});

test("fixture Estética Dental Argentina: estrategia genera plan temporal", () => {
  const plan = buildStrategyPlan(estheticProfile, { objetivo: "Aumentar la cantidad de consultas calificadas", plazoLabel: "3 meses", magnitud: null }, [
    { title: "Mejorar la claridad de la oferta en el sitio web", description: "Explicar tratamientos, diferencial y cómo pedir turno en las páginas principales.", timeframe: "30 días", kpi: "turnos solicitados", evidence: "El sitio web tiene muchas páginas pero el mensaje principal no explica claramente qué tratamientos ofrecen." },
    { title: "Trabajar las búsquedas en Google donde existe oportunidad", description: "Crear contenido para 'implantes dentales en Recoleta' y optimizar la página de tratamientos.", timeframe: "60 días", kpi: "visitas desde búsquedas locales", evidence: "Posición 4 en la búsqueda 'estética dental Recoleta'." },
  ]);
  assert.strictEqual(plan.objective, "Aumentar la cantidad de consultas calificadas en 3 meses");
  assert.ok(plan.phases.length >= 1);
  assert.ok(plan.phases[0].actions[0].what.includes("claridad"));
  assert.ok(plan.phases[0].actions[0].where.length > 0);
  assert.ok(plan.phases[0].actions[0].metric.length > 0);
});

test("copy quality: prohíbe lenguaje técnico en hallazgos públicos", () => {
  const findings = buildDiagnosticFindings(estheticProfile, { total: 70, dimensions: [{ slug: "presencia", points: 78, confidence: "MEDIA" }, { slug: "conversion", points: 82, confidence: "ALTA" }, { slug: "posicionamiento", points: 76, confidence: "MEDIA" }, { slug: "propuesta", points: 56, confidence: "BAJA" }, { slug: "adquisicion", points: 68, confidence: "MEDIA" }, { slug: "identidad", points: 54, confidence: "BAJA" }] });
  const text = findings.map((f) => `${f.title} ${f.whatWeSaw} ${f.recommendation}`).join(" ");
  assert.ok(!/freno probable|está en evaluación|hipótesis|señal|intervención|causal|evidencia suficiente|recorrido comercial/i.test(text), "El copy público no debe usar jerga técnica");
});

test("copy quality: prohíbe acciones genéricas", () => {
  const plan = buildStrategyPlan(estheticProfile, { objetivo: "Aumentar consultas", plazoLabel: "3 meses", magnitud: null }, [
    { title: "Mejorar la claridad de la oferta en el sitio web", description: "Explicar tratamientos, diferencial y cómo pedir turno en las páginas principales.", timeframe: "30 días", kpi: "turnos solicitados", evidence: "El sitio web tiene muchas páginas pero el mensaje principal no explica claramente qué tratamientos ofrecen." },
  ]);
  const actionText = plan.phases.flatMap((p) => p.actions.map((a) => `${a.where} ${a.why} ${a.successCriteria}`)).join(" ");
  assert.ok(!/el canal principal|Evidencia|Se considera útil cuando la métrica mejora sin empeorar/i.test(actionText), "Las acciones no deben usar placeholders genéricos");
});

test("reviews con evidencia suficiente: muestra contenido real", () => {
  const profileWithReviews = {
    ...estheticProfile,
    commercialEvidence: [
      ...estheticProfile.commercialEvidence,
      { id: "ev-r1", text: "Excelente atención y profesionalismo.", source: "reviews", polarity: "positive", confidence: "ALTA", journeyStage: "decision", kind: "ObservedEvidence", reputationEvidenceConfidence: 0.9 },
      { id: "ev-r2", text: "Muy limpio y ordenado.", source: "reviews", polarity: "positive", confidence: "ALTA", journeyStage: "decision", kind: "ObservedEvidence", reputationEvidenceConfidence: 0.9 },
      { id: "ev-r3", text: "El tiempo de espera fue largo.", source: "reviews", polarity: "negative", confidence: "MEDIA", journeyStage: "decision", kind: "ObservedEvidence", reputationEvidenceConfidence: 0.6 },
    ],
  } as any;
  const insights = buildChannelInsights(profileWithReviews, { total: 70, dimensions: [] });
  const reviews = insights.find((i) => i.channel === "reviews");
  assert.ok(reviews);
  assert.ok(reviews.summary.includes("reseñas"));
  assert.ok(reviews.summary.includes("positivas") || reviews.summary.includes("negativas"));
});

test("reviews sin evidencia suficiente: muestra aviso honesto", () => {
  const profileWithoutReviews = {
    ...estheticProfile,
    commercialEvidence: estheticProfile.commercialEvidence.filter((e: any) => e.source !== "reviews"),
  } as any;
  const insights = buildChannelInsights(profileWithoutReviews, { total: 70, dimensions: [] });
  const reviews = insights.find((i) => i.channel === "reviews");
  assert.ok(reviews);
  assert.ok(reviews.summary.includes("No encontramos suficientes reseñas verificadas"));
});
