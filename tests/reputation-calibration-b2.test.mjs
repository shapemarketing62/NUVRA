import test from "node:test";
import assert from "node:assert/strict";
import { ReputationIntelligence } from "../services/intelligence/reputation-intelligence.ts";
import { StrategicKnowledgeBase, STRATEGIC_PATTERNS } from "../services/strategy/strategic-knowledge-base.ts";

const now = new Date("2026-08-23T12:00:00Z");
const daysAgo = (days) => new Date(now.getTime() - days * 86400000);
const review = ({ id, text, rating, days = 10, source = "google_maps", author = `author-${id}` }) => ({
  id,
  text,
  rating,
  source,
  author,
  url: `https://example.test/${source}/${id}`,
  date: daysAgo(days),
  entityConfidence: .94,
});

const positiveAttention = (id, options = {}) => review({ id, text: `La atención fue excelente y muy amable durante mi visita ${id}.`, rating: 5, ...options });
const negativeAttention = (id, options = {}) => review({ id, text: `La atención tuvo mucha demora y tardaron en responder mi consulta ${id}.`, rating: 1, ...options });

test("una reseña negativa no domina cien voces positivas", () => {
  const result = ReputationIntelligence.analyze([
    ...Array.from({ length: 100 }, (_, index) => positiveAttention(`positive-${index}`, { days: index % 300 })),
    negativeAttention("isolated-negative"),
  ], { objective: "aumentar consultas", now });
  const topic = result.topics.find((item) => item.name === "atención");
  assert.equal(topic?.polarity, "positive");
  assert.ok((topic?.contradictionRatio || 0) < .05);
  assert.equal(result.problems.some((item) => item.name === "atención"), false);
});

test("diez negativas recientes pueden alertar frente a cien positivas antiguas", () => {
  const result = ReputationIntelligence.analyze([
    ...Array.from({ length: 100 }, (_, index) => positiveAttention(`old-${index}`, { days: 380 + (index % 330) })),
    ...Array.from({ length: 10 }, (_, index) => negativeAttention(`recent-${index}`, { days: index * 3 })),
  ], { objective: "aumentar consultas", now });
  const topic = result.topics.find((item) => item.name === "atención");
  assert.equal(topic?.trend, "deteriorating");
  assert.equal(topic?.polarity, "negative");
  assert.ok(result.problems.some((item) => item.name === "atención"));
});

test("el mismo comentario copiado en diez sitios cuenta una sola vez", () => {
  const text = "La atención tuvo mucha demora y tardaron en responder.";
  const result = ReputationIntelligence.analyze(Array.from({ length: 10 }, (_, index) => review({
    id: `copy-${index}`,
    text,
    rating: 1,
    source: `directory-${index}`,
    author: `author-${index}`,
  })), { objective: "aumentar consultas", now });
  assert.equal(result.accepted.length, 1);
  assert.equal(result.duplicates.length, 9);
  assert.equal(result.problems.length, 0);
});

test("veinte comentarios distribuidos durante un año dan más confianza que veinte de una fecha", () => {
  const concentrated = ReputationIntelligence.analyze(Array.from({ length: 20 }, (_, index) => negativeAttention(`same-day-${index}`, { days: 5 })), { objective: "aumentar consultas", now });
  const distributed = ReputationIntelligence.analyze(Array.from({ length: 20 }, (_, index) => negativeAttention(`year-${index}`, { days: index * 18 })), { objective: "aumentar consultas", now });
  const concentratedTopic = concentrated.topics.find((item) => item.name === "atención");
  const distributedTopic = distributed.topics.find((item) => item.name === "atención");
  assert.ok((distributedTopic?.temporalDiversity || 0) > (concentratedTopic?.temporalDiversity || 0));
  assert.ok((distributedTopic?.evidenceConfidence || 0) > (concentratedTopic?.evidenceConfidence || 0));
});

test("tres fuentes independientes refuerzan el mismo problema", () => {
  const oneSource = ReputationIntelligence.analyze(Array.from({ length: 9 }, (_, index) => negativeAttention(`one-${index}`, { source: "google_maps", days: index * 12 })), { objective: "aumentar consultas", now });
  const threeSources = ReputationIntelligence.analyze(Array.from({ length: 9 }, (_, index) => negativeAttention(`three-${index}`, { source: ["google_maps", "tripadvisor", "facebook"][index % 3], days: index * 12 })), { objective: "aumentar consultas", now });
  const one = oneSource.topics.find((item) => item.name === "atención");
  const three = threeSources.topics.find((item) => item.name === "atención");
  assert.equal(three?.sourceDiversity, 1);
  assert.ok((three?.evidenceConfidence || 0) > (one?.evidenceConfidence || 0));
});

test("una fuente negativa no domina dos fuentes consistentemente positivas", () => {
  const comments = [
    ...Array.from({ length: 10 }, (_, index) => negativeAttention(`negative-${index}`, { source: "directory_a", days: index * 8 })),
    ...Array.from({ length: 10 }, (_, index) => positiveAttention(`positive-b-${index}`, { source: "directory_b", days: index * 8 })),
    ...Array.from({ length: 10 }, (_, index) => positiveAttention(`positive-c-${index}`, { source: "directory_c", days: index * 8 })),
  ];
  const result = ReputationIntelligence.analyze(comments, { objective: "aumentar consultas", now });
  const topic = result.topics.find((item) => item.name === "atención");
  assert.equal(topic?.polarity, "positive");
  assert.equal(result.problems.some((item) => item.name === "atención"), false);
});

test("la base conserva 90 patrones y no amplifica reputación débil", () => {
  const profile = {
    originalIndustry: "cafetería",
    inferredCategory: "gastronomía",
    commercialModel: "reservations",
    primaryCustomerAction: "reservar",
    primaryResult: "reservas",
    resources: { monthlyBudget: 100 },
    goal: { text: "aumentar reservas" },
  };
  const baseProblem = { validationStatus: "validated", pattern: "experience", journeyStage: "experience" };
  assert.equal(STRATEGIC_PATTERNS.length, 90);
  assert.equal(StrategicKnowledgeBase.retrieve(profile, { ...baseProblem, reputationEvidenceConfidence: .42 }).length, 0);
  assert.ok(StrategicKnowledgeBase.retrieve(profile, { ...baseProblem, reputationEvidenceConfidence: .78 }).length > 0);
});
