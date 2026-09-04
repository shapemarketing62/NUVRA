import test from "node:test";
import assert from "node:assert/strict";
import { BusinessDiscoveryService } from "../services/discovery/business-discovery-service.ts";
import { buildDiscoveryQueries } from "../services/discovery/discovery-query-builder.ts";
import { EntityMatcher } from "../services/discovery/entity-matcher.ts";
import { SearchProviderUnavailableError, SearchSourceAnalyzer } from "../services/intelligence/search-source-analyzer.ts";

class FixtureSearchProvider {
  constructor(resolve) { this.resolve = resolve; }
  async search(query) { return this.resolve(query); }
}

const target = (overrides = {}) => ({ name: "Casa Lumen", category: "Centro de estética", location: "Palermo, CABA, Argentina", ...overrides });
const result = (title, url, snippet, metadata) => ({ title, url, snippet, metadata });

test("discovery genera queries breves por nombre, rubro, ubicación e intención", () => {
  const queries = buildDiscoveryQueries(target()).map((item) => item.query);
  assert.ok(queries.includes('"Casa Lumen"'));
  assert.ok(queries.includes('"Casa Lumen" Centro de estética'));
  assert.ok(queries.includes('"Casa Lumen" Palermo, CABA, Argentina'));
  assert.ok(queries.some((query) => /Instagram$/i.test(query)));
  assert.ok(queries.some((query) => /sitio oficial$/i.test(query)));
  assert.ok(queries.some((query) => /opiniones Palermo$/i.test(query)));
  assert.ok(queries.every((query) => query.length < 190));
});

test("A: valida una web oficial claramente identificable", async () => {
  const provider = new FixtureSearchProvider(() => [result("Casa Lumen | Centro de estética", "https://casalumen.com.ar/tratamientos", "Centro de estética en Palermo, CABA")]);
  const discovery = await new BusinessDiscoveryService(provider).discover(target());
  assert.equal(discovery.status, "completed");
  assert.equal(discovery.primaryWebUrl, "https://casalumen.com.ar");
  assert.equal(discovery.confirmedSources.some((item) => item.type === "web"), true);
});

test("B: dos negocios homónimos no permiten elegir la ubicación contradictoria", async () => {
  const provider = new FixtureSearchProvider(() => [
    result("Brilla | Centro de estética", "https://brillacordoba.com.ar", "Centro de estética en Córdoba Capital", { location: "Córdoba Capital", category: "Centro de estética" }),
    result("Brilla Palermo", "https://brillapalermo.com.ar", "Centro de estética en Palermo, CABA", { location: "Palermo, CABA", category: "Centro de estética" }),
  ]);
  const discovery = await new BusinessDiscoveryService(provider).discover(target({ name: "Brilla" }));
  const wrong = discovery.allCandidates.find((item) => item.url.includes("cordoba"));
  assert.ok(wrong);
  assert.equal(wrong.status, "rejected");
  assert.equal(discovery.primaryWebUrl, "https://brillapalermo.com.ar");
});

test("C: conserva directorio como fuente externa y web como sitio oficial", async () => {
  const provider = new FixtureSearchProvider(() => [
    result("Casa Lumen Palermo", "https://www.yelp.com/biz/casa-lumen-palermo", "Centro de estética en Palermo"),
    result("Casa Lumen", "https://casalumen.com.ar", "Centro de estética en Palermo, CABA"),
  ]);
  const discovery = await new BusinessDiscoveryService(provider).discover(target());
  assert.equal(discovery.primaryWebUrl, "https://casalumen.com.ar");
  assert.equal(discovery.allCandidates.find((item) => item.url.includes("yelp.com"))?.type, "mentions");
});

test("D: valida Instagram cuando la web oficial enlaza el perfil", async () => {
  const provider = new FixtureSearchProvider(() => [
    result("Casa Lumen", "https://casalumen.com.ar", "Centro de estética en Palermo. Instagram: https://instagram.com/lumen.estetica.ba"),
    result("Casa Lumen Palermo", "https://instagram.com/lumen.estetica.ba", "Centro de estética en Palermo"),
  ]);
  const discovery = await new BusinessDiscoveryService(provider).discover(target());
  const instagram = discovery.allCandidates.find((item) => item.type === "instagram");
  assert.ok(instagram?.metadata?.directCorroborationCount >= 1);
  assert.ok(["confirmed", "probable"].includes(instagram?.status));
  assert.equal(discovery.primaryInstagram, "https://instagram.com/lumen.estetica.ba");
});

test("E: rechaza nombre parecido cuando el rubro estructurado contradice al negocio", () => {
  const evaluated = EntityMatcher.evaluateCandidate({
    title: "Casa Lumen Palermo",
    url: "https://casalumen.com.ar",
    snippet: "Estudio jurídico en Palermo",
    type: "web",
    metadata: { category: "Estudio jurídico", location: "Palermo" },
  }, target());
  assert.equal(evaluated.status, "rejected");
  assert.match(evaluated.rationale, /contradice el rubro/i);
});

test("F: provider unavailable no se registra como búsqueda sin resultados", async () => {
  const provider = new FixtureSearchProvider(() => { throw new SearchProviderUnavailableError([{ provider: "tavily", status: "unavailable", errorType: "TypeError" }, { provider: "duckduckgo", status: "unavailable", errorType: "Error" }]); });
  const discovery = await new BusinessDiscoveryService(provider).discover(target());
  assert.equal(discovery.status, "provider_unavailable");
  assert.equal(discovery.allCandidates.length, 0);
  assert.ok(discovery.queryAttempts.length > 0);
  assert.ok(discovery.queryAttempts.every((attempt) => attempt.status === "provider_unavailable"));
});

test("una búsqueda completada sin candidatos conserva no_results", async () => {
  const discovery = await new BusinessDiscoveryService(new FixtureSearchProvider(() => [])).discover(target());
  assert.equal(discovery.status, "no_results");
  assert.ok(discovery.queryAttempts.every((attempt) => attempt.status === "no_results"));
});

test("Linktree y un dominio sin marca no se seleccionan como web oficial", async () => {
  const provider = new FixtureSearchProvider(() => [
    result("Casa Lumen", "https://linktr.ee/casalumen", "Enlaces de Casa Lumen en Palermo"),
    result("Casa Lumen", "https://noticiaslocales.example/negocios/casa-lumen", "Centro de estética de Palermo"),
  ]);
  const discovery = await new BusinessDiscoveryService(provider).discover(target());
  assert.equal(discovery.primaryWebUrl, null);
  assert.equal(discovery.allCandidates.find((item) => item.url.includes("linktr.ee"))?.type, "mentions");
});

test("una ficha pública de Maps se reconoce sin inventar rating ni reseñas", async () => {
  const provider = new FixtureSearchProvider(() => [result("Casa Lumen Palermo", "https://www.google.com/maps/place/Casa+Lumen", "Centro de estética en Palermo, CABA")]);
  const discovery = await new BusinessDiscoveryService(provider).discover(target());
  assert.equal(discovery.primaryGoogleMaps, "https://www.google.com/maps/place/Casa+Lumen");
  const maps = discovery.allCandidates.find((item) => item.type === "google_maps");
  assert.ok(maps);
  assert.equal("rating" in (maps.metadata || {}), false);
  assert.equal("reviews" in (maps.metadata || {}), false);
});

test("teléfono coincidente puede corroborar un nombre parcial sin reemplazar la validación", () => {
  const evaluated = EntityMatcher.evaluateCandidate({
    title: "Dental Norte",
    url: "https://perfil-local.example/dental-norte",
    snippet: "Odontología en Palermo. Teléfono +54 11 5555 1234",
    type: "mentions",
  }, target({ name: "Clínica Dental Norte", category: "Odontología", phone: "+54 11 5555 1234" }));
  assert.ok(["confirmed", "probable"].includes(evaluated.status));
  assert.equal(evaluated.metadata?.matchingSignals?.contact, 0.22);
});

test("Search diferencia provider_unavailable de no_results", async () => {
  const business = { nombre: "Casa Lumen", rubro: "Centro de estética", ubicacion: "Palermo" };
  const unavailable = await new SearchSourceAnalyzer(new FixtureSearchProvider(() => { throw new Error("network blocked"); })).analyze(business);
  const noResults = await new SearchSourceAnalyzer(new FixtureSearchProvider(() => [])).analyze(business);
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.metadata?.outcome, "provider_unavailable");
  assert.equal(noResults.status, "unavailable");
  assert.equal(noResults.metadata?.outcome, "no_results");
});

test("Search parcial no transforma consultas de marca caídas en evidencia negativa", async () => {
  const business = { nombre: "Casa Lumen", rubro: "Centro de estética", ubicacion: "Palermo" };
  const provider = new FixtureSearchProvider((query) => {
    if (query.startsWith("Casa Lumen")) throw new Error("provider unavailable for brand query");
    return [result("Otros centros de estética", "https://example.test/otros", "Opciones en Palermo")];
  });
  const analyzed = await new SearchSourceAnalyzer(provider).analyze(business);
  assert.equal(analyzed.metadata?.outcome, "partial");
  assert.doesNotMatch(analyzed.findings.map((finding) => finding.evidence).join(" "), /No se pudo validar la aparición|marca no aparece/i);
});
