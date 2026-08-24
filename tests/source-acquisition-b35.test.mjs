import test from "node:test";
import assert from "node:assert/strict";
import { IndexedSocialSearchService, clearIndexedSocialCache } from "../services/intelligence/social/indexed-social-search.ts";
import { XProvider, TikTokProvider, RedditProvider, FacebookProvider, LinkedInProvider, YouTubeProvider } from "../services/intelligence/social/social-providers.ts";
import { ReputationIntelligence } from "../services/intelligence/reputation-intelligence.ts";
import { buildInstagramDiscoveredAccess } from "../services/intelligence/social/instagram-access.ts";

const target = { businessId: "b35", name: "Casa Numa", industry: "tienda de muebles", location: "Buenos Aires", website: "https://casanuma.test", customerType: "B2C", objective: "aumentar compras", declaredChannels: "" };
const result = (url, title, snippet) => ({ url, title, snippet });

class FakeSearch {
  calls = [];
  constructor(resultsByDomain) { this.resultsByDomain = resultsByDomain; }
  async search(query) { this.calls.push(query); const domain = Object.keys(this.resultsByDomain).find((item) => query.includes(`site:${item}`)); return domain ? this.resultsByDomain[domain] : []; }
}

test("X encontrado solamente mediante Search queda partial", async () => {
  clearIndexedSocialCache();
  const search = new FakeSearch({ "x.com": [result("https://x.com/casanuma/status/1", "Casa Numa", "Casa Numa tienda de muebles en Buenos Aires presenta una nueva colección 2026-08-10.")] });
  const service = new IndexedSocialSearchService(search, { maxGlobalQueries: 4, maxQueriesPerSource: 2 });
  const value = await new XProvider(service.collector("x")).collect(target);
  assert.equal(value.status, "partial");
  assert.deepEqual(value.acquisitionMethods, ["search_index"]);
  assert.equal(value.sourceCoverage.content, "indexed");
  assert.notEqual(value.status, "analyzed");
});

test("Reddit público indexado aporta posts y evidencia reputacional limitada", async () => {
  clearIndexedSocialCache();
  const search = new FakeSearch({ "reddit.com": [result("https://reddit.com/r/decoracion/comments/a1/casa_numa", "Mi experiencia con Casa Numa", "Mi experiencia con Casa Numa tienda de muebles de Buenos Aires fue excelente y recomiendo la atención. 2026-07-12")] });
  const service = new IndexedSocialSearchService(search);
  const value = await new RedditProvider(service.collector("reddit")).collect(target);
  const reputation = ReputationIntelligence.analyze(value.comments, { objective: "aumentar compras", now: new Date("2026-08-23") });
  assert.equal(value.status, "partial");
  assert.equal(value.mentions[0]?.context?.subreddit, "decoracion");
  assert.equal(reputation.accepted.length, 1);
  assert.equal(reputation.problems.length, 0);
});

test("YouTube indexado distingue una review externa", async () => {
  clearIndexedSocialCache();
  const search = new FakeSearch({ "youtube.com": [result("https://youtube.com/watch?v=review1", "Review de Casa Numa", "Review y experiencia con Casa Numa, tienda de muebles en Buenos Aires. Excelente terminación y entrega. 2026-08-01")] });
  const service = new IndexedSocialSearchService(search);
  const value = await new YouTubeProvider(service.collector("youtube")).collect(target);
  assert.equal(value.status, "partial");
  assert.equal(value.mentions[0]?.ownerType, "creator");
  assert.equal(value.mentions[0]?.acquisitionMethod, "search_index");
});

test("TikTok con solo perfil queda discovered y no genera reputación", async () => {
  clearIndexedSocialCache();
  const search = new FakeSearch({ "tiktok.com": [result("https://tiktok.com/@casanuma", "Casa Numa", "Perfil de Casa Numa, tienda de muebles y decoración en Buenos Aires.")] });
  const service = new IndexedSocialSearchService(search);
  const value = await new TikTokProvider(service.collector("tiktok")).collect(target);
  assert.equal(value.status, "discovered");
  assert.equal(value.sourceCoverage.profile, true);
  assert.equal(value.sourceCoverage.content, "none");
  assert.equal(value.comments.length, 0);
});

test("LinkedIn B2B obtiene especialización indexada pero conserva cobertura parcial", async () => {
  clearIndexedSocialCache();
  const b2b = { ...target, industry: "consultoría B2B", customerType: "empresas", objective: "conseguir reuniones" };
  const search = new FakeSearch({ "linkedin.com": [
    result("https://linkedin.com/company/casa-numa", "Casa Numa", "Casa Numa consultoría B2B especializada en empresas de Buenos Aires."),
    result("https://linkedin.com/posts/casa-numa_caso", "Casa Numa caso industrial", "Caso de Casa Numa consultoría B2B para empresas de Buenos Aires y especialización del equipo."),
  ] });
  const service = new IndexedSocialSearchService(search);
  const value = await new LinkedInProvider(service.collector("linkedin")).collect(b2b);
  assert.equal(value.status, "partial");
  assert.equal(value.sourceCoverage.profile, true);
  assert.ok(value.content.some((item) => /especializ/.test(item.text)));
});

test("Facebook not_found no aporta evidencia ni penalización", async () => {
  clearIndexedSocialCache();
  const service = new IndexedSocialSearchService(new FakeSearch({ "facebook.com": [] }));
  const value = await new FacebookProvider(service.collector("facebook")).collect(target);
  assert.equal(value.status, "not_found");
  assert.equal(value.coverage, 0);
  assert.equal(value.comments.length + value.content.length + value.mentions.length, 0);
});

test("Instagram descubierto no se presenta como contenido analizado", () => {
  const value = buildInstagramDiscoveredAccess({ url: "https://instagram.com/casanuma", title: "Casa Numa", snippet: "Muebles y decoración", declared: false });
  assert.equal(value.status, "discovered");
  assert.equal(value.data.profileDiscovered, true);
  assert.equal(value.data.contentAnalyzed, false);
  assert.equal(value.sourceCoverage.comments, "none");
});

test("la misma mención obtenida por Search y provider se deduplica", () => {
  const text = "Excelente atención de Casa Numa y muy buena experiencia de compra.";
  const reputation = ReputationIntelligence.analyze([
    { id: "search", source: "reddit", text, author: "cliente-1", date: "2026-08-10", url: "https://reddit.com/a", entityConfidence: .9, acquisitionMethod: "search_index" },
    { id: "provider", source: "reddit", text, author: "cliente-1", date: "2026-08-10", url: "https://reddit.com/a", entityConfidence: .95, acquisitionMethod: "official_api" },
  ]);
  assert.equal(reputation.accepted.length, 1);
  assert.equal(reputation.duplicates.length, 1);
});

test("el presupuesto global, stop conditions y cache evitan consultas repetidas", async () => {
  clearIndexedSocialCache();
  const search = new FakeSearch({ "x.com": [result("https://x.com/casanuma/status/2", "Casa Numa", "Casa Numa tienda de muebles en Buenos Aires comparte novedades.")] });
  const service = new IndexedSocialSearchService(search, { maxGlobalQueries: 2, maxQueriesPerSource: 3 });
  const collector = service.collector("x");
  const first = await collector(target);
  const callsAfterFirst = search.calls.length;
  const second = await collector(target);
  assert.ok(service.budget.used <= 2);
  assert.equal(search.calls.length, callsAfterFirst);
  assert.equal(second.acquisitionReport.cacheHit, true);
  assert.equal(first.acquisitionReport.queryCount, callsAfterFirst);
});
