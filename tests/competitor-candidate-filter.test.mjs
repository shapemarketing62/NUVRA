import test from "node:test";
import assert from "node:assert/strict";
import { CompetitorSourceAnalyzer } from "../services/intelligence/competitor-analyzer.ts";

const analyzer = new CompetitorSourceAnalyzer();
const normalize = (value) => analyzer.normalizeCandidateName(value);
const passes = (value, categoryTokens = ["cafetería"]) => {
  const candidate = normalize(value);
  return candidate !== null && analyzer.looksLikeBusinessCandidate(candidate, categoryTokens);
};

test("descarta términos comerciales genéricos cuando aparecen solos", () => {
  for (const value of ["Cafe", "Café", "Tienda", "Coffee", "Store"]) {
    assert.equal(passes(value), false, value);
  }
});

test("acepta nombres reales sin imponer una cantidad de palabras", () => {
  assert.equal(passes("Starbucks"), true);
  assert.equal(passes("La Esquina del Café Palermo"), true);
  assert.equal(normalize("La Esquina del Café Palermo"), "La Esquina del Café Palermo");
});

test("mantiene el entity matching existente", () => {
  assert.equal(analyzer.isTargetBusiness("Starbucks", "Starbucks"), true);
  assert.equal(analyzer.isTargetBusiness("Starbucks Argentina", "Starbucks"), true);
  assert.equal(analyzer.isTargetBusiness("La Esquina del Café", "Starbucks"), false);
});
