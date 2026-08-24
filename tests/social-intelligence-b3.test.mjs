import test from "node:test";
import assert from "node:assert/strict";
import { ReputationIntelligence } from "../services/intelligence/reputation-intelligence.ts";
import { SourceRelevancePlanner } from "../services/intelligence/social/source-relevance-planner.ts";
import { SocialEntityResolver } from "../services/intelligence/social/social-entity-resolver.ts";
import { XProvider, TikTokProvider, RedditProvider, LinkedInProvider, YouTubeProvider } from "../services/intelligence/social/social-providers.ts";
import { SocialPlatformSourceAnalyzer } from "../services/intelligence/social/social-source-analyzer.ts";
import { BrandIdentityAnalyzer } from "../services/website-analyzer/brand-identity-analyzer.ts";
import { inferJourneyStage } from "../services/intelligence/commercial-evidence.ts";

const now = new Date("2026-08-23T12:00:00Z");
const target = (overrides = {}) => ({ businessId: "b1", name: "Casa Numa", industry: "tienda online de muebles", location: "Buenos Aires", website: "https://casanuma.test", customerType: "B2C", objective: "aumentar compras", declaredChannels: "TikTok YouTube", ...overrides });
const identity = { displayName: "Casa Numa", username: "casanuma", description: "Muebles y decoración", location: "Buenos Aires", category: "tienda de muebles", profileUrl: "https://social.test/casanuma", linkedUrls: ["https://casanuma.test"] };
const comment = (id, text, source, author = `author-${id}`, days = 10) => ({ id, text, source, author, date: new Date(now.getTime() - days * 86400000), url: `https://${source}.test/${id}`, entityConfidence: .93 });

test("Google positivo y X negativo reciente conservan la diferencia por plataforma", () => {
  const input = [
    ...Array.from({ length: 10 }, (_, index) => comment(`g-${index}`, `Excelente atención y trato amable en la visita ${index}.`, "google_maps", undefined, 100 + index * 10)),
    ...Array.from({ length: 8 }, (_, index) => comment(`x-${index}`, `Mala atención y mucha demora para responder ${index}.`, "x", undefined, index * 3)),
  ];
  const result = ReputationIntelligence.analyze(input, { objective: "aumentar reservas", now });
  const difference = result.platformDifferences.find((item) => item.topic === "atención");
  assert.ok(difference);
  assert.deepEqual(difference.positiveSources, ["google_maps"]);
  assert.deepEqual(difference.negativeSources, ["x"]);
  assert.equal(difference.recent, true);
});

test("TikTok con varias voces sobre demora alimenta Reputation Intelligence", async () => {
  const provider = new TikTokProvider(async () => ({
    identity,
    profile: { logoConsistent: true, visualConsistency: 78, toneConsistency: 75 },
    content: Array.from({ length: 3 }, (_, index) => ({ id: `video-${index}`, ownerType: "brand", text: `Muebles para living y dormitorio ${index}`, url: `https://tiktok.test/v/${index}`, publishedAt: now.toISOString(), themes: ["muebles"], callToAction: "comprar online" })),
    comments: Array.from({ length: 12 }, (_, index) => comment(`tt-${index}`, `Mucha demora en la entrega de mi pedido ${index}.`, "tiktok", undefined, index * 9)),
    mechanism: "public_page",
    coverage: 72,
  }));
  const result = await new SocialPlatformSourceAnalyzer(provider).analyze({ id: "b1", nombre: "Casa Numa", rubro: "tienda online de muebles", ubicacion: "Buenos Aires", webUrl: "https://casanuma.test", tipoCliente: "B2C", canales: "TikTok", otrosCanales: "", goals: [{ objetivo: "aumentar compras" }] });
  assert.equal(result.status, "evaluated");
  assert.ok(result.findings.some((item) => item.reputationTopic === "demora" && item.type === "negative"));
});

test("una sola queja en Reddit no se convierte en problema", async () => {
  const provider = new RedditProvider(async () => ({ identity, comments: [comment("reddit-one", "Tuve demora en una entrega.", "reddit")], mechanism: "public_page", coverage: 30 }));
  const result = await provider.collect(target());
  const reputation = ReputationIntelligence.analyze(result.comments, { objective: "aumentar compras", now });
  assert.equal(reputation.problems.length, 0);
});

test("LinkedIn es primario para B2B y no penaliza una barbería", () => {
  const b2b = SourceRelevancePlanner.forPlatform(target({ industry: "consultoría B2B", customerType: "empresas", declaredChannels: "" }), "linkedin");
  const barber = SourceRelevancePlanner.forPlatform(target({ industry: "barbería local", customerType: "B2C", declaredChannels: "" }), "linkedin");
  assert.equal(b2b.priority, "primary");
  assert.equal(b2b.relevant, true);
  assert.equal(barber.relevant, false);
});

test("LinkedIn validado aporta autoridad y comprensión en B2B", async () => {
  const provider = new LinkedInProvider(async () => ({ identity: { ...identity, description: "Consultoría B2B y transformación", category: "consultoría" }, profile: {}, content: [
    { id: "l1", ownerType: "brand", text: "Caso de cliente industrial y resultados del proyecto", url: "https://linkedin.test/l1" },
    { id: "l2", ownerType: "brand", text: "Especialización del equipo en empresas familiares", url: "https://linkedin.test/l2" },
  ], mechanism: "public_page", coverage: 60 }));
  const analyzer = new SocialPlatformSourceAnalyzer(provider);
  const result = await analyzer.analyze({ id: "b1", nombre: "Casa Numa", rubro: "consultoría B2B", ubicacion: "Buenos Aires", webUrl: "https://casanuma.test", tipoCliente: "empresas", canales: "LinkedIn", otrosCanales: "", goals: [{ objetivo: "conseguir reuniones" }] });
  assert.ok(result.findings.some((item) => item.category === "posicionamiento" && item.type === "positive"));
  assert.equal(inferJourneyStage(result.findings[0].evidence, "linkedin", result.findings[0].category), "evaluation");
});

test("YouTube diferencia contenido externo y puede aportar confianza", async () => {
  const provider = new YouTubeProvider(async () => ({ identity, content: [{ id: "official", ownerType: "brand", text: "Cómo elegir una mesa", url: "https://youtube.test/official" }], mentions: [
    { id: "review-1", ownerType: "creator", text: "Review de la mesa y experiencia de compra", url: "https://youtube.test/r1" },
    { id: "review-2", ownerType: "customer", text: "Experiencia con la entrega del mueble", url: "https://youtube.test/r2" },
  ], mechanism: "public_page", coverage: 55 }));
  const result = await new SocialPlatformSourceAnalyzer(provider).analyze({ id: "b1", nombre: "Casa Numa", rubro: "tienda online de muebles", ubicacion: "Buenos Aires", webUrl: "https://casanuma.test", tipoCliente: "B2C", canales: "YouTube", otrosCanales: "", goals: [{ objetivo: "aumentar compras" }] });
  assert.ok(result.findings.some((item) => /videos externos/.test(item.evidence)));
});

test("una queja copiada por la misma persona en tres plataformas cuenta una vez", () => {
  const base = "Mucha demora para responder mi pedido y coordinar la entrega.";
  const result = ReputationIntelligence.analyze([
    comment("copy-x", base, "x", "same-person", 4),
    comment("copy-reddit", `${base} !`, "reddit", "same-person", 3),
    comment("copy-facebook", `${base} #pedido`, "facebook", "same-person", 5),
  ], { objective: "aumentar compras", now });
  assert.equal(result.accepted.length, 1);
  assert.equal(result.duplicates.length, 2);
  assert.equal(result.problems.length, 0);
});

test("identidad coherente en varias redes tiene más evidenceConfidence que solo web", () => {
  const web = { source: "web", aspects: { logo: 88, colors: 84, typography: 82, photography: 80, tone: 82 }, evidence: ["Web consistente"], observedPeriods: 1 };
  const onlyWeb = BrandIdentityAnalyzer.analyze([], [web]);
  const multi = BrandIdentityAnalyzer.analyze([], [web,
    { source: "tiktok", aspects: { logo: 86, photography: 84, tone: 82, crossChannelConsistency: 86, proposalCoherence: 84 }, evidence: ["TikTok consistente"], observedPeriods: 2 },
    { source: "linkedin", aspects: { logo: 87, tone: 84, crossChannelConsistency: 85, differentiation: 81, proposalCoherence: 86 }, evidence: ["LinkedIn consistente"], observedPeriods: 2 },
    { source: "youtube", aspects: { logo: 86, photography: 83, tone: 84, crossChannelConsistency: 87, visualRecognition: 82, temporalConsistency: 84 }, evidence: ["YouTube consistente"], observedPeriods: 3 },
  ]);
  assert.ok(multi.evidenceConfidence > onlyWeb.evidenceConfidence);
  assert.ok(multi.evidenceCeiling > onlyWeb.evidenceCeiling);
});

test("entity resolution descarta homónimos aunque exista actividad", () => {
  const result = SocialEntityResolver.resolve(target(), { displayName: "Numa Software", username: "numaapp", description: "Software financiero", location: "Madrid", category: "tecnología", profileUrl: "https://social.test/numaapp", linkedUrls: ["https://numa-software.test"] });
  assert.equal(result.validated, false);
  assert.ok(result.confidence < SocialEntityResolver.threshold);
});

test("el fallo de X no impide completar TikTok", async () => {
  const failingX = new XProvider(async () => { throw new Error("provider timeout"); });
  const workingTikTok = new TikTokProvider(async () => ({ identity, content: [{ id: "v1", ownerType: "brand", text: "Nueva colección de mesas", url: "https://tiktok.test/v1" }], mechanism: "public_page", coverage: 35 }));
  const [xResult, tiktokResult] = await Promise.all([failingX.collect(target()), workingTikTok.collect(target())]);
  assert.equal(xResult.status, "error");
  assert.ok(["evaluated", "partial"].includes(tiktokResult.status));
  assert.equal(tiktokResult.entityValidated, true);
});
