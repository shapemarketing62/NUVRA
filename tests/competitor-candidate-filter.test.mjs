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
  for (const value of ["Starbucks", "Bonafide", "Persicco", "Café Martínez", "Burger King", "La Esquina del Café Palermo"]) {
    assert.equal(passes(value), true, value);
  }
  assert.equal(normalize("La Esquina del Café Palermo"), "La Esquina del Café Palermo");
});

test("preserva el nombre completo y los apóstrofes tipográficos", () => {
  assert.equal(normalize("McDonald’s"), "McDonald's");
  assert.equal(normalize("La Esquina del Café Palermo"), "La Esquina del Café Palermo");
});

test("separa candidatos crudos de entidades comerciales plausibles", () => {
  const pipeline = analyzer.inspectCandidatePipeline([
    {
      query: "cafeterías Buenos Aires",
      result: {
        title: "Starbucks vs McDonald’s",
        snippet: "Opciones en Seattle. Dirección: Talcahuano 120. También se mencionan Bonafide y Café Martínez.",
        url: "https://example.com/comparativa-cafeterias",
      },
    },
    {
      query: "cafeterías Buenos Aires",
      result: {
        title: "La Esquina del Café Palermo | Cafetería",
        snippet: "Café de especialidad en Palermo.",
        url: "https://laesquinadelcafepalermo.example/",
      },
    },
  ], "Negocio objetivo", "Cafetería");

  const rawNames = pipeline.rawCandidates.map((item) => item.normalizedName);
  const plausibleNames = pipeline.plausibleEntities.map((item) => item.name);
  assert.ok(rawNames.includes("Seattle"));
  assert.ok(rawNames.includes("Talcahuano"));
  assert.ok(pipeline.rawCandidates.every((item) => item.sourceTitle && item.extractor === "extractRawCandidates"));
  assert.ok(plausibleNames.includes("Starbucks"));
  assert.ok(plausibleNames.includes("McDonald's"));
  assert.ok(plausibleNames.includes("La Esquina del Café Palermo"));
  assert.equal(plausibleNames.includes("Seattle"), false);
  assert.equal(plausibleNames.includes("Talcahuano"), false);
});

test("mantiene el entity matching existente", () => {
  assert.equal(analyzer.isTargetBusiness("Starbucks", "Starbucks"), true);
  assert.equal(analyzer.isTargetBusiness("Starbucks Argentina", "Starbucks"), true);
  assert.equal(analyzer.isTargetBusiness("La Esquina del Café", "Starbucks"), false);
});

test("Starbucks recorre raw -> entidad validada -> competidor comparable sin providers reales", async () => {
  const discoveryResults = [
    { title: "Bonafide | Café de Buenos Aires", snippet: "Cafetería y café en Buenos Aires. Dirección: Talcahuano 120.", url: "https://bonafide.com.ar/" },
    { title: "Café Martínez | Cafetería", snippet: "Coffee shop con locales en Buenos Aires.", url: "https://cafemartinez.com/" },
    { title: "Persicco | Cafetería y heladería", snippet: "Café, pastelería y locales en Buenos Aires.", url: "https://persicco.com.ar/" },
    { title: "Guía de café", snippet: "Tendencias de Seattle para cafeterías.", url: "https://example.com/guia" },
  ];
  const official = {
    Bonafide: { title: "Bonafide - Sitio oficial", snippet: "Cafetería, café y locales en Buenos Aires, Argentina.", url: "https://bonafide.com.ar/" },
    "Café Martínez": { title: "Café Martínez - Sitio oficial", snippet: "Cafetería y coffee shop con locales en Buenos Aires, Argentina.", url: "https://cafemartinez.com/" },
    Persicco: { title: "Persicco - Sitio oficial", snippet: "Cafetería, café y locales en Buenos Aires, Argentina.", url: "https://persicco.com.ar/" },
  };
  const provider = {
    async search(query) {
      const quoted = query.match(/^"([^"]+)"/)?.[1];
      return quoted && official[quoted] ? [official[quoted]] : discoveryResults;
    },
  };
  const result = await new CompetitorSourceAnalyzer(provider).analyze({
    id: "starbucks-fixture",
    nombre: "Starbucks",
    rubro: "Cafetería",
    ubicacion: "Buenos Aires, Argentina",
    ciudad: "Buenos Aires",
    tipoCliente: "B2C",
    webUrl: "https://starbucks.com.ar",
    instagramHandle: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const names = result.data.competitors.map((item) => item.name);
  const audit = result.metadata.candidatePipeline;
  assert.deepEqual(names.sort(), ["Bonafide", "Café Martínez", "Persicco"].sort());
  assert.ok(audit.rawCandidates.some((item) => item.normalizedName?.includes("Talcahuano")));
  assert.ok(audit.rawCandidates.some((item) => item.normalizedName?.includes("Seattle")));
  assert.equal(audit.plausibleEntities.some((item) => item.name.includes("Talcahuano")), false);
  assert.equal(audit.plausibleEntities.some((item) => item.name.includes("Seattle")), false);
  assert.ok(audit.validation.filter((item) => item.stage === "comparable_competitor" && item.decision === "accepted").length >= 3);
});
