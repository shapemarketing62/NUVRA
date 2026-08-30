import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildBusinessUnderstandingView, buildCompetitionView } from "../lib/business-context-views.ts";
import { buildDashboardViewModel } from "../lib/dashboard-view-model.ts";
import { hasEntitlement } from "../lib/plans.ts";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const baseBusiness = { nombre: "Café Sur", rubro: "Cafetería de especialidad", ubicacion: "Palermo, Buenos Aires", noWebDeclared: false, noInstagramDeclared: false };
const baseProfile = { inferredCategory: "gastronomía local B2C", commercialModel: "reservations", localDependency: "high", location: "Palermo, Buenos Aires", recurrence: "frequent", primaryCustomerAction: "reservar o hacer un pedido", audienceSignals: [], offerings: [], contactMethods: [], primaryChannel: "unknown", inferenceTrace: [] };

function understanding(overrides = {}, profileOverrides = {}) {
  return buildBusinessUnderstandingView({
    business: { ...baseBusiness, ...overrides },
    goal: { objetivo: "Conseguir más reservas", plazoLabel: "3 meses" },
    snapshot: { businessProfile: { ...baseProfile, ...profileOverrides } },
  });
}

function competitor(overrides = {}) {
  return {
    name: "Café Norte",
    classification: "confirmed_competitor",
    competitorType: "direct",
    officialWebsite: "https://cafenorte.example/",
    officialSocialProfile: null,
    location: "Palermo",
    competitorRelevanceReasons: ["Mismo rubro comprobado (Cafetería)", "Mismo mercado comprobado (Palermo)", "Productos o servicios comparables"],
    evidence: [{ type: "official_source", label: "Sitio oficial Café Norte", url: "https://cafenorte.example/", snippet: "Café de especialidad en Palermo" }],
    ...overrides,
  };
}

function competition(competitors, overrides = {}) {
  return buildCompetitionView({ business: baseBusiness, profile: baseProfile, summary: { competitors }, objective: "Conseguir más reservas", sourceStatus: "analyzed", entitled: true, limit: 10, ...overrides });
}

test("A y B: conserva el rubro declarado literal y separa la categoría inferida", () => {
  const view = understanding();
  assert.equal(view.declared.find((item) => item.key === "industry")?.value, "Cafetería de especialidad");
  assert.equal(view.inferred.find((item) => item.key === "category")?.value, "gastronomía local B2C");
});

test("C: un campo sin evidencia queda desconocido", () => {
  const view = understanding();
  assert.ok(view.unknown.some((item) => item.key === "audience"));
  assert.ok(view.unknown.some((item) => item.key === "primaryChannel"));
});

test("D y E: la proyección no expone BusinessProfile crudo ni confidence técnico", () => {
  const view = understanding({}, { confidence: 0.91, inferenceTrace: [{ field: "commercialModel", value: "reservations", evidence: "rubro y objetivo", source: "inferred" }], processingIssues: [{ message: "stack interno" }] });
  const serialized = JSON.stringify(view);
  assert.doesNotMatch(serialized, /processingIssues|inferenceTrace|0\.91|stack interno|confidence/i);
  assert.match(serialized, /rubro y objetivo/);
});

test("F: datos legacy incompletos no rompen", () => {
  const view = buildBusinessUnderstandingView({ business: { nombre: "Legacy", rubro: "Servicios" }, goal: {}, snapshot: null });
  assert.equal(view.declared.find((item) => item.key === "industry")?.value, "Servicios");
  assert.ok(view.unknown.length > 0);
});

test("G: conserva ausencias declaradas de web e Instagram", () => {
  const view = understanding({ noWebDeclared: true, noInstagramDeclared: true });
  assert.match(view.declared.find((item) => item.key === "websiteAbsence")?.value || "", /no tiene página web/);
  assert.match(view.declared.find((item) => item.key === "instagramAbsence")?.value || "", /no tiene Instagram/);
});

test("H: objetivo y plazo proceden de datos persistidos", () => {
  const view = understanding();
  assert.equal(view.declared.find((item) => item.key === "objective")?.value, "Conseguir más reservas");
  assert.equal(view.declared.find((item) => item.key === "timeframe")?.value, "3 meses");
});

test("Mi negocio edita mediante el flujo seguro y no mediante un botón falso", () => {
  const page = read("app/dashboard/negocio/page.tsx");
  assert.match(page, /Editar información/);
  assert.match(page, /method: "PATCH"/);
  assert.doesNotMatch(page, /console\.log|TODO: implementar edición/);
});

test("I, L y N: un competidor validado aparece con señales reales de oferta, modelo y mercado", () => {
  const view = competition([competitor()]);
  assert.equal(view.comparable.length, 1);
  assert.deepEqual(view.comparable[0].whyComparable, ["Mismo rubro comprobado (Cafetería)", "Mismo mercado comprobado (Palermo)", "Productos o servicios comparables"]);
  assert.match(view.context || "", /reservas/);
});

test("J: un competidor probable no se presenta como verificado", () => {
  const view = competition([competitor({ classification: "probable_competitor" })]);
  assert.equal(view.comparable.length, 0);
  assert.equal(view.probable[0].validation, "probable");
});

test("K: entidades uncertain o rejected no aparecen", () => {
  const view = competition([competitor({ classification: "uncertain" }), competitor({ name: "Descartado", classification: "rejected" })]);
  assert.equal(view.comparable.length + view.probable.length, 0);
  assert.equal(view.discardedCount, 2);
});

test("M: para un negocio local, la falta de coincidencia geográfica impide mostrarlo como comparable", () => {
  const item = competitor({ competitorRelevanceReasons: ["Mismo rubro comprobado (Cafetería)", "Productos o servicios comparables"] });
  const view = competition([item]);
  assert.equal(view.comparable.length, 0);
  assert.equal(view.probable.length, 1);
});

test("O y P: la UI no crea rankings ni fortalezas o debilidades inventadas", () => {
  const page = read("app/dashboard/competencia/page.tsx");
  assert.doesNotMatch(page, /ranking|1º|2º|3º|market share/i);
  const projected = competition([competitor()]).comparable[0];
  assert.equal("strengths" in projected, false);
  assert.equal("weaknesses" in projected, false);
});

test("Q: una reseña aislada no genera un problema reputacional", () => {
  const item = competitor({ evidence: [{ type: "directory", label: "Una reseña", url: "https://directory.example/cafe", snippet: "Una persona menciona demora" }] });
  const projected = competition([item]).comparable[0];
  assert.equal(projected.opportunity, null);
  assert.equal("reputationProblem" in projected, false);
});

test("R: una oportunidad competitiva conserva evidencia de la diferencia", () => {
  const view = competition([competitor()], { business: { ...baseBusiness, noWebDeclared: true } });
  assert.ok(view.comparable[0].opportunity);
  assert.deepEqual(view.comparable[0].opportunity?.evidenceUrls, ["https://cafenorte.example/"]);
});

test("S, T, U y V: acceso Free, Pro, Partner e Internal respeta entitlements", () => {
  assert.equal(hasEntitlement("FREE", "analysis.competitors"), false);
  assert.equal(hasEntitlement("PRO", "analysis.competitors"), true);
  assert.equal(hasEntitlement("PARTNER", "analysis.competitors"), true);
  assert.equal(hasEntitlement("FREE", "analysis.competitors", true), true);
  assert.equal(buildCompetitionView({ business: {}, profile: {}, summary: { competitors: [competitor()] }, entitled: false, limit: 10 }).comparable.length, 0);
});

test("S: DashboardViewModel no entrega datos competitivos a Free", () => {
  const raw = {
    ...baseBusiness,
    id: "business-1",
    planTier: "FREE",
    goals: [{ objetivo: "Conseguir más reservas", plazoLabel: "3 meses" }],
    scores: [], diagnoses: [], strategies: [], analysisRuns: [],
    analysisHistory: [{ id: "history-1", createdAt: "2026-01-01T00:00:00Z", snapshot: JSON.stringify({ businessProfile: baseProfile, intelligence: { sourceStatuses: { competitor: "evaluated" }, competitorSummary: { competitors: [competitor()] } } }) }],
  };
  const view = buildDashboardViewModel(raw);
  assert.equal(view.competition.entitled, false);
  assert.equal(view.competition.comparable.length, 0);
  assert.equal(view.intelligence?.competitorSummary, null);
});

test("W: sin competidores válidos produce estado limitado y empty state", () => {
  const view = competition([]);
  assert.equal(view.status, "limited");
  assert.equal(view.comparable.length, 0);
  assert.match(read("app/dashboard/competencia/page.tsx"), /No encontramos suficientes negocios comparables/);
});
