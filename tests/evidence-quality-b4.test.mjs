import test from "node:test";
import assert from "node:assert/strict";
import { EvidenceCorroborationEngine } from "../services/intelligence/evidence/evidence-corroboration-engine.ts";
import { SourceQualityModel } from "../services/intelligence/evidence/source-quality-model.ts";
import { calculateEvidenceSufficiency } from "../services/intelligence/evidence/evidence-sufficiency.ts";

const now = new Date("2026-08-23T12:00:00Z");
function evidence(overrides = {}) {
  return {
    id: overrides.id || crypto.randomUUID(), kind: "ObservedEvidence", source: "reviews",
    text: "La atención fue clara y rápida.", timestamp: "2026-08-01T00:00:00Z",
    entity: { businessId: "b4", businessName: "Negocio B4" }, confidence: "ALTA",
    journeyStage: "experience", possibleImpact: "medium", polarity: "positive",
    allowsClaims: ["Afirmar la observación"], disallowsClaims: ["No generalizar"],
    attribution: "https://example.test/review", acquisitionMethod: "public_page", ...overrides,
  };
}

test("A: cinco snippets que copian la misma noticia equivalen a un solo origen", () => {
  const copied = "La misma noticia informa una demora operacional relevante en el negocio durante agosto.";
  const input = Array.from({ length: 5 }, (_, index) => evidence({ id: `s${index}`, source: "search", text: copied, polarity: "negative", attribution: `https://directory${index}.test/copia`, acquisitionMethod: "search_index" }));
  const enriched = EvidenceCorroborationEngine.enrich(input, now).evidence;
  assert.equal(new Set(enriched.map((item) => item.lineage.originId)).size, 1);
  assert.equal(enriched[0].corroboration.independentOrigins, 1);
  assert.notEqual(calculateEvidenceSufficiency(enriched, [], 1).status, "sufficient");
});

test("B: un comentario negativo en X no domina cien reseñas positivas recientes", () => {
  const negative = evidence({ id: "x-negative", source: "x", text: "La atención fue mala y demoró.", polarity: "negative", attribution: "https://x.com/u/status/1", acquisitionMethod: "search_index" });
  const positives = Array.from({ length: 100 }, (_, index) => evidence({ id: `r${index}`, text: `La atención fue excelente y rápida, experiencia número ${index}.`, attribution: `https://google.test/review/${index}` }));
  const enriched = EvidenceCorroborationEngine.enrich([negative, ...positives], now).evidence;
  const result = calculateEvidenceSufficiency(enriched.filter((item) => item.id === "x-negative"), enriched.filter((item) => item.id !== "x-negative"), 1);
  assert.ok(result.contradictionRatio > .9);
  assert.ok(["insufficient", "limited"].includes(result.status));
});

test("C: veinte experiencias negativas recientes independientes superan una inferencia web favorable", () => {
  const reviews = Array.from({ length: 20 }, (_, index) => evidence({ id: `delay${index}`, text: `La entrega tuvo una demora operativa de ${index + 2} días según el cliente ${index}.`, polarity: "negative", attribution: `https://google.test/review/delay-${index}` }));
  const web = evidence({ id: "web-ok", source: "web", text: "El sitio presenta un recorrido de compra claro.", journeyStage: "action", attribution: "https://business.test", acquisitionMethod: "public_page" });
  const enriched = EvidenceCorroborationEngine.enrich([...reviews, web], now).evidence;
  const result = calculateEvidenceSufficiency(enriched.filter((item) => item.id.startsWith("delay")), [], 1);
  assert.ok(["sufficient", "strong"].includes(result.status));
  assert.ok(result.independentOrigins >= 20);
});

test("D: una declaración y una fuente externa contradictorias se conservan como conflicto", () => {
  const declared = evidence({ id: "declared", kind: "DeclaredEvidence", source: "onboarding", text: "La atención siempre es rápida.", acquisitionMethod: "declared_by_user", attribution: "Información aportada", polarity: "positive" });
  const external = evidence({ id: "external", text: "La atención fue mala según clientes recientes.", polarity: "negative" });
  const result = EvidenceCorroborationEngine.enrich([declared, external], now);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.evidence.find((item) => item.id === "declared").corroboration.conflict, true);
  assert.equal(result.evidence.find((item) => item.id === "external").corroboration.conflict, true);
});

test("E: la actualidad depende del tipo de señal, no de un decay único", () => {
  const oldOperational = evidence({ id: "old-operation", text: "La entrega tenía demoras.", timestamp: "2023-01-01T00:00:00Z", acquisitionMethod: "official_api" });
  const oldIdentity = evidence({ id: "old-brand", text: "Logo, colores y tipografías mantienen identidad visual.", timestamp: "2023-01-01T00:00:00Z", acquisitionMethod: "official_api", journeyStage: "evaluation" });
  const recentPublic = evidence({ id: "recent", text: "La entrega funciona sin demoras.", timestamp: "2026-08-20T00:00:00Z", acquisitionMethod: "public_page" });
  const operational = SourceQualityModel.assess(oldOperational, now); const identity = SourceQualityModel.assess(oldIdentity, now); const recent = SourceQualityModel.assess(recentPublic, now);
  assert.ok(identity.recency > operational.recency);
  assert.ok(recent.recency > operational.recency);
});

test("F: fuentes independientes concordantes elevan suficiencia y confianza", () => {
  const one = EvidenceCorroborationEngine.enrich([evidence({ id: "g", text: "La entrega demora con frecuencia.", polarity: "negative" })], now).evidence;
  const many = EvidenceCorroborationEngine.enrich([
    evidence({ id: "g", text: "La entrega demora con frecuencia según reseñas.", polarity: "negative", source: "reviews", attribution: "https://google.test/r/1" }),
    evidence({ id: "r", text: "Usuarios mencionan demora repetida en la entrega.", polarity: "negative", source: "reddit", attribution: "https://reddit.com/r/x/1" }),
    evidence({ id: "m", text: "Una nota documenta demoras frecuentes de entrega.", polarity: "negative", source: "external_mentions", attribution: "https://medio.test/nota", acquisitionMethod: "public_page" }),
  ], now).evidence;
  const singleResult = calculateEvidenceSufficiency(one, [], 1); const manyResult = calculateEvidenceSufficiency(many, [], 1);
  assert.ok(manyResult.score > singleResult.score);
  assert.ok(manyResult.independentSources >= 3);
});
