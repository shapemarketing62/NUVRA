import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getDashboardNavigation } from "../lib/product-navigation.ts";

const read = (file) => fs.readFileSync(file, "utf8");
const pages = {
  summary: read("app/dashboard/page.tsx"),
  diagnosis: read("app/dashboard/diagnostico/page.tsx"),
  strategy: read("app/dashboard/estrategia/page.tsx"),
  actions: read("app/dashboard/acciones/page.tsx"),
  evolution: read("app/dashboard/evolucion/page.tsx"),
};

test("cada pantalla principal ofrece un siguiente paso descriptivo", () => {
  assert.match(pages.summary, />Ver plan de acción</);
  assert.match(pages.diagnosis, />Ver estrategia</);
  assert.match(pages.strategy, />Ver acciones</);
  assert.match(pages.actions, /"Empezar acción"/);
  assert.match(pages.evolution, />Ver acciones actuales</);

  const source = Object.values(pages).join("\n");
  assert.doesNotMatch(source, />Ver más</);
  assert.doesNotMatch(source, />Continuar</);
  assert.doesNotMatch(source, />Enviar</);
  assert.doesNotMatch(source, />Ver plan</);
});

test("la interfaz distingue observación, declaración e hipótesis", () => {
  const diagnosis = pages.diagnosis;
  const business = read("app/dashboard/negocio/page.tsx");
  for (const label of ["Nos lo contaste", "Lo observamos", "Lo estamos validando"]) {
    assert.match(`${diagnosis}\n${business}`, new RegExp(label));
  }
  assert.doesNotMatch(`${diagnosis}\n${business}`, /conclusionConfidence|evidenceSufficiency|priorityScore|journeyStage/);
});

test("diagnóstico, estrategia y acciones siguen divulgación progresiva", () => {
  assert.ok(pages.diagnosis.indexOf("Problema principal") < pages.diagnosis.indexOf("Hipótesis principal"));
  assert.ok(pages.diagnosis.indexOf("Hipótesis principal") < pages.diagnosis.indexOf("Por qué creemos que pasa"));
  assert.ok(pages.diagnosis.indexOf("Por qué creemos que pasa") < pages.diagnosis.indexOf("Evidencia"));
  assert.ok(pages.diagnosis.indexOf("Qué necesitamos validar") < pages.diagnosis.indexOf("Qué está funcionando"));
  assert.ok(pages.strategy.indexOf(">Objetivo<") < pages.strategy.indexOf(">Decisión<"));
  assert.ok(pages.strategy.indexOf("Por qué esta decisión") < pages.strategy.indexOf("Indicador principal"));
  assert.match(pages.actions, /<details className="action-plan"><summary>Ver plan de ejecución<\/summary>/);
  assert.match(pages.actions, /Costo: /);
});

test("la navegación principal es corta, estable y predecible", () => {
  const groups = getDashboardNavigation("PARTNER", false);
  assert.deepEqual(groups.map((group) => group.label), ["Trabajo", "Negocio", "Cuenta"]);
  assert.deepEqual(groups[0].items.slice(0, 5).map((item) => item.label), ["Resumen", "Diagnóstico", "Estrategia", "Acciones", "Evolución"]);
  assert.equal(new Set(groups.flatMap((group) => group.items.map((item) => item.href))).size, groups.flatMap((group) => group.items).length);
});

test("los títulos principales son breves y no se exponen identificadores internos", () => {
  const source = Object.values(pages).join("\n");
  const titles = [...source.matchAll(/<PageHeader[^>]*title="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(titles.length >= 4);
  assert.ok(titles.every((title) => title.length <= 48), titles.join(" | "));
  assert.doesNotMatch(source, /\|\|\s*change\.source/);
  assert.doesNotMatch(source, />KPI:|>evidence sufficiency|>journey stage/i);
});

test("contraste y tap targets del dashboard tienen reglas explícitas", () => {
  const css = read("app/globals.css");
  assert.match(css, /--text-primary:#182033;--text-secondary:#626b7c;--text-tertiary:#626c7e/);
  assert.match(css, /\.app-main \.btn:disabled\{opacity:\.62\}/);
  assert.match(css, /@media\(max-width:960px\)\{\.sidebar-item\{min-height:44px\}\}/);
  assert.match(css, /\.app-main \.btn\{min-height:44px\}/);
  assert.match(css, /\.dashboard-score-grid[^}]*grid-template-columns/);
  assert.match(css, /@media\(max-width:900px\)\{\.dashboard-score-grid,\.dashboard-main-grid,\.analysis-module-grid\{grid-template-columns:1fr\}\}/);
});

test("Quiet Blue centraliza marca, navegación y superficies", () => {
  const css = read("app/globals.css");
  assert.match(css, /--nuvra-50:#f5f7ff/);
  assert.match(css, /--nuvra-500:#4059d7/);
  assert.match(css, /--nuvra-900:#172544/);
  assert.match(css, /--bg-base:#f7f8fa;--bg-warm:#faf8f4/);
  assert.match(css, /--accent:#c58a63/);
  assert.match(css, /\.sidebar\{[^}]*background:var\(--nuvra-900\)/);
  assert.match(css, /\.btn-primary\{background:var\(--primary\)/);
});

test("las superficies públicas usan un negocio ficticio y conservan el film accesible", () => {
  const home = read("app/page.tsx");
  const productFilm = read("components/marketing/ProductFilm.tsx");
  const poster = read("public/nuvra-product-film-poster.svg");
  const demo = read("lib/demo-data.ts");
  const publicText = `${home}\n${productFilm}\n${poster}\n${demo}`;

  assert.doesNotMatch(publicText, /Noma|nomacafe/i);
  assert.doesNotMatch(home, /¿NUVRA sirve para una pyme|negocio pequeño|pequeñas empresas/i);
  assert.match(publicText, /NEGOCIO DEMO|Negocio demo/);
  assert.match(productFilm, /autoPlay muted loop playsInline/);
  assert.match(productFilm, /poster="\/nuvra-product-film-poster\.svg"/);

  const video = fs.readFileSync("public/nuvra-product-film.webm");
  assert.ok(video.length > 500_000);
  assert.equal(video.subarray(0, 4).toString("hex"), "1a45dfa3");
});

test("la extensión no incorpora dependencias visuales pesadas", () => {
  const packageJson = JSON.parse(read("package.json"));
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  for (const dependency of ["framer-motion", "three", "lottie-react", "chart.js", "recharts"]) {
    assert.equal(dependencies[dependency], undefined);
  }
});
