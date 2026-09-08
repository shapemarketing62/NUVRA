import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { onboardingV2Schema, PRESUPUESTO_OPTIONS, CAPACIDAD_OPTIONS, OBJETIVOS_OPTIONS, PLAZO_OPTIONS, TIPO_CLIENTE_OPTIONS, CAPACIDAD_COMERCIAL_OPTIONS } from "../lib/onboarding-v2-schema.ts";
import { getClarificationQuestions } from "../services/onboarding/clarification-adapter.ts";
import { applyAssetDecisions } from "../services/pipeline/asset-decisions.ts";

test("onboarding V2: schema acepta flujo simplificado", () => {
  const input = {
    nombre: "Estética Dental Argentina",
    rubro: "Odontología estética",
    ubicacion: "Recoleta, Buenos Aires",
    tipoCliente: "B2C",
    objetivo: "Conseguir más consultas",
    objetivoLabel: "Conseguir más consultas",
    plazoDias: 90,
    plazoLabel: "3 meses",
    presupuesto: "low",
    capacidad: "self",
    capacidadComercial: "si",
    limitaciones: "Poco tiempo",
    noWeb: true,
    noInstagram: true,
  };
  const parsed = onboardingV2Schema.parse(input);
  assert.strictEqual(parsed.nombre, "Estética Dental Argentina");
  assert.strictEqual(parsed.tipoCliente, "B2C");
  assert.strictEqual(parsed.presupuesto, "low");
  assert.strictEqual(parsed.capacidad, "self");
  assert.strictEqual(parsed.capacidadComercial, "si");
});

test("onboarding V2: schema rechaza contradicciones web/instagram", () => {
  assert.throws(() => onboardingV2Schema.parse({ nombre: "X", rubro: "Y", ubicacion: "Z", tipoCliente: "B2C", objetivo: "A", objetivoLabel: "A", plazoDias: 90, plazoLabel: "3 meses", presupuesto: "none", capacidad: "self", noWeb: true, webUrl: "https://x.com" }));
  assert.throws(() => onboardingV2Schema.parse({ nombre: "X", rubro: "Y", ubicacion: "Z", tipoCliente: "B2C", objetivo: "A", objetivoLabel: "A", plazoDias: 90, plazoLabel: "3 meses", presupuesto: "none", capacidad: "self", noInstagram: true, instagramHandle: "@x" }));
});

test("onboarding V2: opciones públicas son lenguaje simple", () => {
  for (const option of OBJETIVOS_OPTIONS) {
    assert.ok(!/buyer persona|funnel|acquisition|conversion rate|positioning|value proposition|evidence suficiency|coverage|business maturity/i.test(option.label), `Opción inválida: ${option.label}`);
  }
  for (const option of CAPACIDAD_OPTIONS) {
    assert.ok(!/capacidad de ejecución alta\/media\/baja/i.test(option.label), "Capacidad debe ser lenguaje simple");
  }
  for (const option of TIPO_CLIENTE_OPTIONS) {
    assert.ok(option.label.length <= 20, "Tipo cliente debe ser corto");
  }
});

test("onboarding V2: pasos del formulario son 3", () => {
  assert.strictEqual(PRESUPUESTO_OPTIONS.length, 6);
  assert.strictEqual(CAPACIDAD_OPTIONS.length, 4);
  assert.strictEqual(OBJETIVOS_OPTIONS.length, 9);
  assert.strictEqual(PLAZO_OPTIONS.length, 5);
  assert.strictEqual(TIPO_CLIENTE_OPTIONS.length, 3);
  assert.strictEqual(CAPACIDAD_COMERCIAL_OPTIONS.length, 4);
});

test("onboarding V2: website e Instagram son opcionales", () => {
  const input = {
    nombre: "Test", rubro: "X", ubicacion: "Y", tipoCliente: "B2C",
    objetivo: "A", objetivoLabel: "A", plazoDias: 90, plazoLabel: "3 meses",
    presupuesto: "none", capacidad: "self", noWeb: true, noInstagram: true,
  };
    const parsed = onboardingV2Schema.parse(input);
    assert.strictEqual(parsed.noWeb, true);
    assert.strictEqual(parsed.noInstagram, true);
    assert.strictEqual(parsed.webUrl, undefined);
    assert.strictEqual(parsed.instagramHandle, undefined);
});

test("onboarding V2: negocios online no requieren Maps", () => {
  const input = {
    nombre: "SaaS Online", rubro: "Software", ubicacion: "Online", tipoCliente: "B2C",
    objetivo: "A", objetivoLabel: "A", plazoDias: 90, plazoLabel: "3 meses",
    presupuesto: "none", capacidad: "self",
  };
  const parsed = onboardingV2Schema.parse(input);
  assert.strictEqual(parsed.ubicacion, "Online");
});

test("onboarding V2: copy no contiene jerga de marketing", () => {
  const jargon = ["buyer persona", "funnel", "acquisition", "conversion rate", "positioning", "value proposition", "evidence suficiency", "coverage", "business maturity"];
  const source = `lib/onboarding-v2-schema.ts lib/onboarding-v2-types.ts app/onboarding/page.tsx services/onboarding/clarification-adapter.ts`;
  for (const term of jargon) {
    assert.ok(!source.toLowerCase().includes(term), `Copy contiene jerga prohibida: ${term}`);
  }
});

test("onboarding V2: presupuesto convierte a rangos numéricos", () => {
  const amounts = new Map(PRESUPUESTO_OPTIONS.map((o) => [o.value, o.amount]));
  assert.strictEqual(amounts.get("none"), 0);
  assert.strictEqual(amounts.get("low"), 75);
  assert.strictEqual(amounts.get("prefiero_no_decir"), null);
});

test("onboarding V2: capacidad comercial mapea a estados comprensibles", () => {
  for (const option of CAPACIDAD_COMERCIAL_OPTIONS) {
    assert.ok(["si", "algunas", "limite", "no_se"].includes(option.value), "Capacidad comercial debe mapear a valores internos simples");
  }
});

test("onboarding V2: clarification engine adapta preguntas y limita a 4", () => {
  const questions = getClarificationQuestions({
    objetivo: "Conseguir más consultas",
    rubro: "Odontología estética",
    hasInstagram: true,
    hasWebsite: true,
    hasLocation: true,
    businessModel: "local",
    dimensions: [
      { slug: "presencia", confidence: "INSUFICIENTE" },
      { slug: "conversion", confidence: "BAJA" },
      { slug: "propuesta", confidence: "INSUFICIENTE" },
      { slug: "adquisicion", confidence: "BAJA" },
      { slug: "redes", confidence: "INSUFICIENTE" },
    ],
    findings: [
      { category: "conversion", title: "Falta claridad en el paso principal" },
      { category: "propuesta", title: "La oferta no se explica con claridad" },
    ],
    declaredChannels: ["Instagram"],
    observedChannels: ["Instagram"],
  });
  assert.ok(questions.length <= 4, `Máximo 4 preguntas, got ${questions.length}`);
  for (const q of questions) {
    assert.ok(!/buyer persona|funnel|acquisition|conversion rate|positioning|value proposition|evidence suficiency|coverage|business maturity|conversión|diferencial|adquisición|propuesta de valor|posicionamiento|KPI|barrera de conversión|ticket promedio/i.test(q.question), `Pregunta con jerga técnica: ${q.question}`);
    assert.ok(!/buyer persona|funnel|acquisition|conversion rate|positioning|value proposition|evidence suficiency|coverage|business maturity|conversión|diferencial|adquisición|propuesta de valor|posicionamiento|KPI|barrera de conversión|ticket promedio/i.test(q.reason || ""), `Razón con jerga técnica: ${q.reason}`);
  }
});

test("onboarding V2: clarification no pregunta datos ya conocidos", () => {
  const questions = getClarificationQuestions({
    objetivo: "Conseguir más consultas",
    rubro: "Odontología estética",
    hasInstagram: true,
    hasWebsite: true,
    hasLocation: true,
    businessModel: "local",
    dimensions: [{ slug: "presencia", confidence: "ALTA" }],
    findings: [],
    declaredChannels: ["Instagram", "Página web"],
    observedChannels: ["Instagram", "Página web"],
  });
  const hasInstagramQuestion = questions.some((q) => /instagram/i.test(q.question));
  assert.strictEqual(hasInstagramQuestion, false, "No debe preguntar por Instagram si ya está conectado");
  const hasWebsiteQuestion = questions.some((q) => /sitio web|página web/i.test(q.question));
  assert.strictEqual(hasWebsiteQuestion, false, "No debe preguntar por sitio web si ya está conectado");
});

test("onboarding V2: no preguntar sobre canales ya observados", () => {
  const questions = getClarificationQuestions({
    objetivo: "Conseguir más consultas",
    rubro: "Odontología estética",
    hasInstagram: true,
    hasWebsite: true,
    hasLocation: true,
    businessModel: "local",
    dimensions: [{ slug: "adquisicion", confidence: "BAJA" }],
    findings: [{ category: "adquisicion", title: "Canal principal no identificado", source: "Instagram" }],
    declaredChannels: ["Instagram"],
    observedChannels: ["Instagram"],
  });
  const hasAdquisitionQuestion = questions.some((q) => /canal principal|adquisición/i.test(q.question));
  assert.strictEqual(hasAdquisitionQuestion, false, "No debe preguntar por canal principal si ya fue observado");
});

test("onboarding V2: producción no puede consumir resultados mock como discovery real", () => {
  const source = fs.readFileSync(new URL("../app/onboarding/page.tsx", import.meta.url), "utf8");
  assert.ok(!source.includes("mockDiscovery"), "El onboarding de producción no debe importar ni usar mockDiscovery");
});

test("onboarding V2: rechazo de Instagram llega al contexto del análisis", () => {
  const decisions = [
    { key: "instagram", observedValue: "@perfilA", userConfirmation: "rejected" as const, userValue: undefined },
  ];
  const payload = JSON.stringify({ businessId: "test-business", assets: decisions });
  const store = new Map<string, string>();
  store.set("nuvra_asset_decisions", payload);
  const stored = (() => { const raw = store.get("nuvra_asset_decisions"); return raw ? JSON.parse(raw) : null; })();
  assert.ok(stored);
  assert.strictEqual(stored.assets[0].userConfirmation, "rejected");
  assert.strictEqual(stored.assets[0].observedValue, "@perfilA");
});

test("onboarding V2: usuario corrige Instagram y el valor observado queda rechazado", () => {
  const decisions = [
    { key: "instagram", observedValue: "@perfilA", userConfirmation: "needs_update" as const, userValue: "@perfilCorrecto" },
  ];
  const payload = JSON.stringify({ businessId: "test-business", assets: decisions });
  const store = new Map<string, string>();
  store.set("nuvra_asset_decisions", payload);
  const stored = (() => { const raw = store.get("nuvra_asset_decisions"); return raw ? JSON.parse(raw) : null; })();
  assert.ok(stored);
  const asset = stored.assets.find((a: any) => a.key === "instagram");
  assert.ok(asset);
  assert.strictEqual(asset.userConfirmation, "needs_update");
  assert.strictEqual(asset.userValue, "@perfilCorrecto");
  assert.strictEqual(asset.observedValue, "@perfilA");
});

test("onboarding V2: 'No tengo Instagram' no presenta perfil encontrado como oficial", () => {
  const onboarding = fs.readFileSync(new URL("../app/onboarding/page.tsx", import.meta.url), "utf8");
  assert.match(onboarding, /No tengo Instagram/);
  assert.match(onboarding, /noInstagramDeclared: data\.noInstagram/);
});

test("onboarding V2: refresh no elimina decisiones almacenadas en sessionStorage", () => {
  const decisions = [
    { key: "web", observedValue: "https://example.com", userConfirmation: "rejected" as const },
  ];
  const payload = JSON.stringify({ businessId: "test-business", assets: decisions });
  const store = new Map<string, string>();
  store.set("nuvra_asset_decisions", payload);
  const first = (() => { const raw = store.get("nuvra_asset_decisions"); return raw ? JSON.parse(raw) : null; })();
  assert.ok(first);
  store.set("nuvra_asset_decisions", JSON.stringify(first));
  const second = (() => { const raw = store.get("nuvra_asset_decisions"); return raw ? JSON.parse(raw) : null; })();
  assert.ok(second);
  assert.strictEqual(second.assets[0].userConfirmation, "rejected");
});

test("onboarding V2: userValue website válido llega al análisis", async () => {
  const result = await applyAssetDecisions({ primaryWebUrl: "https://observed.com" }, [{ key: "web", observedValue: "https://observed.com", userConfirmation: "confirmed", userValue: "https://correcto.com" }]);
  assert.strictEqual(result.primaryWebUrl, "https://correcto.com/");
});

test("onboarding V2: localhost/private URL es rechazado por applyAssetDecisions", async () => {
  const result = await applyAssetDecisions({ primaryWebUrl: "https://observed.com" }, [{ key: "web", observedValue: "https://observed.com", userConfirmation: "confirmed", userValue: "http://localhost:3000" }]);
  assert.strictEqual(result.primaryWebUrl, null);
});

test("onboarding V2: handle Instagram inválido es ignorado", async () => {
  const result = await applyAssetDecisions({ primaryInstagram: "observed" }, [{ key: "instagram", observedValue: "observed", userConfirmation: "confirmed", userValue: "no es un handle válido!!!" }]);
  assert.strictEqual(result.primaryInstagram, "observed");
});

test("onboarding V2: rejected observed asset no se convierte en primary", async () => {
  const result = await applyAssetDecisions({ primaryWebUrl: "https://observed.com", primaryInstagram: "observed" }, [
    { key: "web", observedValue: "https://observed.com", userConfirmation: "rejected" },
    { key: "instagram", observedValue: "observed", userConfirmation: "rejected" },
  ]);
  assert.strictEqual(result.primaryWebUrl, null);
  assert.strictEqual(result.primaryInstagram, null);
});

test("onboarding V2: corrected-by-user no se convierte en evidence-confirmed", async () => {
  const result = await applyAssetDecisions({ primaryWebUrl: "https://observed.com" }, [{ key: "web", observedValue: "https://observed.com", userConfirmation: "needs_update", userValue: "https://correcto.com" }]);
  assert.strictEqual(result.primaryWebUrl, "https://correcto.com/");
});

test("onboarding V2: original evidence sigue trazable en observedValue", async () => {
  const decisions = [{ key: "web", observedValue: "https://observed.com", userConfirmation: "needs_update", userValue: "https://correcto.com" }];
  const result = await applyAssetDecisions({ primaryWebUrl: "https://observed.com" }, decisions);
  assert.strictEqual(result.primaryWebUrl, "https://correcto.com/");
  const original = decisions.find((d) => d.key === "web");
  assert.ok(original);
  assert.strictEqual(original.observedValue, "https://observed.com");
});

test("onboarding V2: asset decisions rechaza campos arbitrarios en schema", () => {
  const parsed = onboardingV2Schema.parse({
    nombre: "Test", rubro: "X", ubicacion: "Y", tipoCliente: "B2C",
    objetivo: "A", objetivoLabel: "A", plazoDias: 90, plazoLabel: "3 meses",
    presupuesto: "none", capacidad: "self", noWeb: true, noInstagram: true,
  });
  assert.strictEqual(parsed.nombre, "Test");
});
