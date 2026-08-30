import test from "node:test";
import assert from "node:assert/strict";
import { buildDashboardViewModel } from "../lib/dashboard-view-model.ts";

function fixture(overrides = {}) {
  const snapshot = {
    scoreMethodologyVersion: "NUVRA_SCORE_V3",
    dimensions: [
      { slug: "presencia", points: 72, weight: 0.3 },
      { slug: "retencion", points: null, applicable: false, weight: 0 },
    ],
    intelligence: {
      coverage: 78,
      sourceStatuses: { web: "evaluated", instagram: "requires_auth", search: "evaluated" },
      sourceMessages: { web: "Sitio analizado", instagram: "Necesita autorización", search: "Búsqueda analizada" },
      competitorSummary: { competitors: [{ name: "Competidor", competitorType: "direct", officialWebsite: "https://competitor.test", officialSocialProfile: null, classification: "confirmed_competitor", entityMatchConfidence: 0.98, entityConfidenceReasons: ["private reason"] }] },
      externalMentionsSummary: { mentions: [{ url: "https://news.test/note", title: "Nota pública", mentionType: "earned_media", source: "news.test", sentiment: "unknown", evidenceConfidence: "high", sourceQuality: 0.91 }], totalAccepted: 1, totalFound: 1, totalRejected: 0, byType: { earned_media: 1 } },
    },
    businessProfile: {
      commercialEvidence: [{
        id: "observed:web:cta",
        kind: "ObservedEvidence",
        source: "web",
        text: "El acceso para pedir turno no aparece al comienzo.",
        timestamp: "2026-08-20T10:00:00.000Z",
        attribution: "https://example.test/turnos",
        acquisitionMethod: "public_page",
        polarity: "negative",
        sourceQuality: { maxClaimStrength: "moderate", score: 0.7, evidenceCeiling: 0.8 },
        corroboration: { conflict: false, claimKey: "action_path", strength: 0.7 },
        allowsClaims: ["internal claim"],
        disallowsClaims: ["internal limitation"],
        lineage: { originId: "private-origin", independence: 1 },
      }],
      problemCandidates: [{ id: "problem:action", evidenceFor: ["observed:web:cta"], evidenceAgainst: [] }],
      prompt: "never expose",
    },
    analysisTrace: {
      prioritization: { selectedProblemId: "problem:action", rule: "private methodology" },
      conclusionContributions: { problems: [{ id: "problem:action", sufficiency: "sufficient" }] },
      scoreExplanation: { evidenceCeiling: 0.8, methodology: { privateWeight: 0.9 } },
      prompts: ["private prompt"],
    },
    analysisAudit: { internalEngine: "private", sourceQuality: 0.91 },
  };

  return {
    id: "business-1",
    organizationId: "org-1",
    nombre: "Clínica Norte",
    rubro: "Clínica estética",
    descripcion: "Tratamientos estéticos con turno.",
    ubicacion: "Buenos Aires",
    webUrl: "https://example.test",
    instagramHandle: "https://instagram.com/example",
    canales: JSON.stringify(["web", "instagram"]),
    empleados: "equipo pequeño",
    inversionMarketing: 150000,
    goals: [{ objetivo: "Aumentar consultas", plazoDias: 90, plazoLabel: "3 meses", magnitud: 20 }],
    scores: [{
      id: "score-1",
      total: 67,
      weights: JSON.stringify({ scoreMethodologyVersion: "NUVRA_SCORE_V3" }),
      createdAt: "2026-08-20T11:00:00.000Z",
      dimensions: [
        { slug: "presencia", name: "Presencia Digital", points: 72, weight: 0.3, problems: "[]" },
        { slug: "retencion", name: "Clientes que vuelven", points: -1, weight: 0, problems: "[]" },
      ],
    }],
    diagnoses: [{
      id: "diagnosis-1",
      summary: "Clínica Norte obtiene un Nuvra Score de 67/100 para su objetivo de aumentar consultas.",
      bottleneck: JSON.stringify({ dimension: "action", title: "Cuesta pasar del interés al pedido de turno", explanation: "Evidencia: el acceso para pedir turno no aparece al comienzo.", findingId: "web:cta" }),
      strengths: JSON.stringify([{ title: "La oferta se entiende", evidence: "Los tratamientos están explicados." }]),
      weaknesses: JSON.stringify([{ title: "El turno no está suficientemente visible", evidence: "El acceso aparece tarde." }]),
      opportunities: JSON.stringify(["Facilitar el pedido de turno desde la primera pantalla."]),
      risks: "[]",
      priorities: JSON.stringify([{ title: "Simplificar el turno", reason: "Es el paso más cercano al objetivo.", order: 1 }]),
      engineType: "deterministic",
    }],
    strategies: [{
      objetivo: "Aumentar consultas",
      situacionActual: "Existe interés, pero el paso siguiente puede ser más claro.",
      distanciaObjetivo: "Más personas deberían completar el pedido de turno.",
      principalProblema: "Texto alternativo que no debe desplazar el diagnóstico",
      prioridades: JSON.stringify(["Hacer visible el acceso a turnos"]),
      actions: [{ id: "action-1", title: "Agregar acceso directo a turnos", order: 1, impact: "alto", difficulty: "baja", estimatedTime: "1 semana", indicatorToImprove: "Pedidos de turno", rationale: "Resuelve el paso observado.", problem: "Cuesta pasar del interés al pedido de turno", done: false }],
    }],
    analysisHistory: [
      { id: "history-1", nuvraScoreTotal: 67, createdAt: "2026-08-20T11:00:00.000Z", snapshot: JSON.stringify(snapshot) },
      { id: "history-0", nuvraScoreTotal: 61, createdAt: "2026-07-20T11:00:00.000Z", snapshot: JSON.stringify({ scoreMethodologyVersion: "NUVRA_SCORE_V3", intelligence: { sourceStatuses: { web: "evaluated", search: "evaluated" } } }) },
    ],
    analysisRuns: [{ id: "run-1", status: "completed", completedAt: "2026-08-20T11:00:00.000Z" }],
    planTier: "PRO",
    internalAccess: false,
    ...overrides,
  };
}

test("A: un análisis completo conserva el score real y la metodología", () => {
  const result = buildDashboardViewModel(fixture());
  assert.equal(result.score?.total, 67);
  assert.equal(result.analysis.methodologyVersion, "NUVRA_SCORE_V3");
  assert.equal(result.evolutionSummary.previousComparableScore, 61);
});

test("B: sin score devuelve null y nunca inventa 40", () => {
  const result = buildDashboardViewModel(fixture({ scores: [] }));
  assert.equal(result.score, null);
  assert.doesNotMatch(JSON.stringify(result), /"total":40/);
});

test("C: una dimensión no evaluada conserva points null y applicable false", () => {
  const result = buildDashboardViewModel(fixture());
  const retention = result.score?.dimensions.find((dimension) => dimension.slug === "retencion");
  assert.equal(retention?.points, null);
  assert.equal(retention?.applicable, false);
});

test("D: un análisis con fuentes parciales se proyecta como partial", () => {
  const result = buildDashboardViewModel(fixture());
  assert.equal(result.analysis.status, "partial");
  assert.equal(result.analysis.hasPartialSources, true);
  assert.equal(result.analysis.completion, "partial");
});

test("E: requires_auth se conserva en el estado público de la fuente", () => {
  const result = buildDashboardViewModel(fixture());
  assert.equal(result.sources.find((source) => source.key === "instagram")?.status, "requires_auth");
  assert.equal(result.intelligence?.sourceStatuses.instagram, "requires_auth");
});

test("F: diagnóstico, estrategia y acciones referencian la misma conclusión canónica", () => {
  const result = buildDashboardViewModel(fixture());
  const title = result.canonicalDiagnosis.mainConclusion?.title;
  assert.ok(title);
  assert.equal(result.canonicalStrategy?.problemOfOrigin?.title, title);
  assert.equal(result.strategy?.principalProblema, title);
  assert.equal(result.actionsSummary.relatedConclusion?.title, title);
  assert.equal(result.actions[0].relatedConclusion, title);
});

test("G: un análisis histórico incompleto no rompe ni se vuelve comparable", () => {
  const input = fixture({
    analysisHistory: [{ id: "legacy", nuvraScoreTotal: null, createdAt: "2024-01-01T00:00:00Z", snapshot: null }],
    analysisRuns: [],
  });
  const result = buildDashboardViewModel(input);
  assert.equal(result.analysis.comparableWithPrevious, false);
  assert.equal(result.history[0].scoreMethodologyVersion, null);
});

test("H: la evidencia pública excluye campos internos y sensibles", () => {
  const result = buildDashboardViewModel(fixture());
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].url, "https://example.test/turnos");
  const serialized = JSON.stringify(result);
  for (const forbidden of ["analysisAudit", "analysisTrace", "private methodology", "private prompt", "private-origin", "private reason", "entityMatchConfidence", "evidenceConfidence", "evidenceCeiling", "sourceQuality", "allowsClaims", "disallowsClaims"]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden, "i"));
  }
});
