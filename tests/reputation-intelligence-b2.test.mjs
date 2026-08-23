import test from "node:test";
import assert from "node:assert/strict";
import { ReputationIntelligence } from "../services/intelligence/reputation-intelligence.ts";
import { GoogleBusinessProfileProvider } from "../services/integrations/google-business-profile-provider.ts";
import { StrategicKnowledgeBase, STRATEGIC_PATTERNS } from "../services/strategy/strategic-knowledge-base.ts";
import { buildLocalCompetitiveContext } from "../services/intelligence/local-competitive-context.ts";
import { ReviewsSourceAnalyzer } from "../services/intelligence/reviews-source-analyzer.ts";

const now = new Date("2026-08-23T12:00:00Z");
const comment = (id, text, rating, days = 20, source = "google_maps") => ({ id, text, rating, source, author: `autor-${id}`, url: `https://reviews.example/${id}`, date: new Date(now.getTime() - days * 86400000), entityConfidence: .92 });

test("40 comentarios separan fortalezas y problemas sin reducirlos a sentimiento global", () => {
  const input = [
    ...Array.from({ length: 16 }, (_, i) => comment(`a-${i}`, `Muy buena atención del equipo, fueron amables en mi visita ${i}.`, 5)),
    ...Array.from({ length: 11 }, (_, i) => comment(`q-${i}`, `Excelente calidad del café y del producto que pedí ${i}.`, 5)),
    ...Array.from({ length: 8 }, (_, i) => comment(`d-${i}`, `Hubo mucha demora y tardaron en responder mi pedido ${i}.`, 2)),
    ...Array.from({ length: 5 }, (_, i) => comment(`o-${i}`, `El ambiente tiene música agradable durante la visita ${i}.`, 4)),
  ];
  const result = ReputationIntelligence.analyze(input, { objective: "aumentar reservas", now });
  assert.equal(result.accepted.length, 40);
  assert.ok(result.strengths.some((topic) => topic.name === "atención" && topic.frequency === 16));
  assert.ok(result.problems.some((topic) => topic.name === "demora" && topic.frequency === 8));
  assert.ok(result.problems.find((topic) => topic.name === "demora").goalRelevance >= .9);
});

test("un tema nuevo repetido se descubre aunque no sea una categoría cerrada", () => {
  const result = ReputationIntelligence.analyze(Array.from({ length: 18 }, (_, i) => comment(`r-${i}`, `El salón tenía eco acústico molesto durante la visita ${i}.`, 2)), { now });
  assert.ok(result.topics.some((topic) => topic.name === "acustico" && topic.frequency === 18));
});

test("200 opiniones antiguas favorables no ocultan 15 negativas recientes", () => {
  const old = Array.from({ length: 200 }, (_, i) => comment(`old-${i}`, `Excelente atención y respuesta del equipo en la experiencia ${i}.`, 5, 900));
  const recent = Array.from({ length: 15 }, (_, i) => comment(`new-${i}`, `Mala atención: mucha demora para recibir respuesta en el caso ${i}.`, 1, 20));
  const result = ReputationIntelligence.analyze([...old, ...recent], { objective: "aumentar reservas", now });
  const attention = result.topics.find((topic) => topic.name === "atención");
  assert.equal(attention?.trend, "deteriorating");
  assert.equal(attention?.polarity, "negative");
});

test("duplicados y entidad dudosa no amplifican evidencia", () => {
  const repeated = { ...comment("one", "Tardaron demasiado en responder mi consulta.", 1), author: "misma-persona" };
  const result = ReputationIntelligence.analyze([
    repeated, ...Array.from({ length: 4 }, (_, i) => ({ ...repeated, id: `copy-${i}`, source: `directory-${i}` })),
    { ...comment("wrong", "Mala atención.", 1), entityConfidence: .4 },
  ], { now });
  assert.equal(result.accepted.length, 1);
  assert.equal(result.duplicates.length, 4);
  assert.equal(result.rejectedEntity.length, 1);
});

test("Google Business Profile conserva datos públicos y exige entity confidence", async () => {
  const fakePlaces = { async getReviews() { return { rating: 4.8, reviewCount: 600, reviews: [{ text: "Muy buena atención", rating: 5 }], placeId: "p1", placeName: "Café Uno", placeAddress: "Calle 1", placeUrl: "https://maps.example/p1", entityMatchConfidence: .91, category: "coffee_shop", secondaryCategories: ["cafe"], phone: "123", website: "https://cafe.example", openingHours: ["lunes: 8–20"], photoCount: 8, evaluatedAt: now.toISOString() }; } };
  const profile = await new GoogleBusinessProfileProvider(fakePlaces).collectPublicProfile({ nombre: "Café Uno" });
  assert.equal(profile.entityValidated, true);
  assert.equal(profile.reviewCount, 600);
  assert.equal(profile.openingHours.length, 1);
});

test("ReviewsSourceAnalyzer usa temas reputacionales y no convierte estrellas directamente en score", async () => {
  const reviews = [
    ...Array.from({ length: 4 }, (_, i) => ({ text: `Muy buena atención del equipo en visita ${i}.`, rating: 5, author: `a${i}`, date: now.toISOString(), url: `https://maps/r${i}`, source: "google_maps" })),
    ...Array.from({ length: 4 }, (_, i) => ({ text: `Tardaron mucho en responder la reserva ${i}.`, rating: 2, author: `d${i}`, date: now.toISOString(), url: `https://maps/d${i}`, source: "google_maps" })),
  ];
  const provider = { async getReviews() { return { rating: 4.8, reviewCount: 600, reviews, placeId: "p", placeName: "Café", placeUrl: "https://maps/p", entityMatchConfidence: .94 }; } };
  const result = await new ReviewsSourceAnalyzer(provider, provider).analyze({ nombre: "Café", rubro: "cafetería", ciudad: "Buenos Aires", goals: [{ objetivo: "aumentar reservas" }] });
  assert.equal(result.status, "evaluated");
  assert.ok(result.data.reputation.strengths.some((item) => item.name === "atención"));
  assert.ok(result.data.reputation.problems.some((item) => item.name === "respuesta"));
  assert.equal(result.findings.some((item) => /4\.8\/5|600 reseñas/.test(item.evidence)), false);
});

const profile = (industry, model, action) => ({ originalIndustry: industry, inferredCategory: industry, commercialModel: model, primaryCustomerAction: action, primaryResult: action, resources: { monthlyBudget: 100 }, goal: { text: "aumentar resultados" } });
const problem = { validationStatus: "validated", pattern: "action_path", journeyStage: "action" };

test("la KB contiene 90 patrones estructurados y no crea problemas no validados", () => {
  assert.equal(STRATEGIC_PATTERNS.length, 90);
  assert.ok(STRATEGIC_PATTERNS.every((item) => item.requiredSignals.length && item.doesNotApplyWhen.length && item.vectorText.length));
  assert.equal(StrategicKnowledgeBase.retrieve(profile("barbería", "appointments", "pedir turno"), { ...problem, validationStatus: "partially_validated" }).length, 0);
});

test("el mismo bloqueo recupera contexto distinto para barbería y ecommerce", () => {
  const barber = StrategicKnowledgeBase.retrieve(profile("barbería", "appointments", "pedir turno"), problem)[0];
  const shop = StrategicKnowledgeBase.retrieve(profile("ecommerce", "commerce", "comprar"), problem)[0];
  assert.notEqual(barber.pattern.archetype, shop.pattern.archetype);
  assert.notEqual(barber.pattern.objectives[0], shop.pattern.objectives[0]);
});

test("contexto local solo compara entidades suficientemente equivalentes", () => {
  const target = { id: "t", name: "T", entityConfidence: 1, categoryMatch: 1, locationMatch: 1, recentReviewCount: 2, contactVisible: false, evidenceUrls: [] };
  const result = buildLocalCompetitiveContext(target, [
    { id: "a", name: "A", entityConfidence: .9, categoryMatch: .9, locationMatch: .9, recentReviewCount: 12, contactVisible: true, evidenceUrls: ["a"] },
    { id: "b", name: "B", entityConfidence: .9, categoryMatch: .85, locationMatch: .8, recentReviewCount: 10, contactVisible: true, evidenceUrls: ["b"] },
    { id: "wrong", name: "Otro", entityConfidence: .4, categoryMatch: .2, locationMatch: .9, evidenceUrls: ["x"] },
  ]);
  assert.equal(result.comparables.length, 2);
  assert.equal(result.rejected.length, 1);
  assert.ok(result.observations.some((item) => /más reseñas recientes/.test(item.statement)));
});
