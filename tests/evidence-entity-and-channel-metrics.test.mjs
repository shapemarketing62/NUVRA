import test from "node:test";
import assert from "node:assert/strict";
import { validateEvidenceEntity, validateSourceEvidence } from "../services/intelligence/evidence-entity-validator.ts";
import { buildChannelMetrics } from "../services/intelligence/channel-metrics.ts";
import { EntityMatcher } from "../services/discovery/entity-matcher.ts";
import { buildBusinessProfile } from "../services/intelligence/business-profile.ts";

const business = {
  id: "estetica-dental-ar",
  nombre: "Estética Dental Argentina",
  rubro: "Clínica de estética dental",
  ubicacion: "Recoleta, CABA, Argentina",
  ciudad: "CABA",
  pais: "Argentina",
  webUrl: "https://esteticadental.com.ar/",
  instagramHandle: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

test("el dominio de otro país se rechaza aunque comparta nombre y rubro", () => {
  const result = validateEvidenceEntity({ source: "external_mentions", evidence: "Estética dental, carillas e implantes", attribution: "https://www.clinicasesteticas.cl/odontologia" }, business);
  assert.equal(result.status, "REJECTED");
});

test("contenido dental genérico no se convierte en evidencia de la empresa", () => {
  const result = validateEvidenceEntity({ source: "instagram", evidence: "Implantes y carillas disponibles", attribution: "https://instagram.com/dentaldasgroup" }, business);
  assert.equal(result.status, "AMBIGUOUS");
  const source = validateSourceEvidence({ source: "instagram", status: "evaluated", data: {}, findings: [{ id: "wrong", category: "redes", type: "positive", impact: "medium", evidence: "Implantes y carillas disponibles", source: "instagram", attribution: "https://instagram.com/dentaldasgroup", weight: .6, confidence: "MEDIA" }], confidence: "MEDIA", coverage: 40, evaluatedAt: new Date(), requiresAuth: false }, business);
  assert.equal(source.findings.length, 0);
  assert.equal(source.metadata.entityValidation.rejected, 1);
  const instagramMetrics = buildChannelMetrics({
    businessId: business.id,
    findings: [], byCategory: {}, byDimension: {}, deduplicated: [], evaluatedAt: new Date(),
    sources: { instagram: { ...source, data: { profileDiscovered: true, sourceCoverage: { metrics: "none" } } } },
  }).find((item) => item.source === "instagram");
  assert.equal(instagramMetrics.metrics.find((item) => item.key === "profile").value, null);
  const profile = buildBusinessProfile({ ...business, goals: [{ objetivo: "Aumentar consultas calificadas", plazoDias: 90, plazoLabel: "3 meses" }] }, {
    businessId: business.id,
    findings: [], byCategory: {}, byDimension: {}, deduplicated: [], evaluatedAt: new Date(),
    sources: { instagram: source },
  });
  assert.equal(profile.activeChannels.includes("instagram"), false);
});

test("rubro y ubicación parecidos no alcanzan para marcar una fuente externa como probable", () => {
  const result = validateEvidenceEntity({ source: "external_mentions", evidence: "Clínica de estética dental ubicada en Recoleta, CABA, Argentina", attribution: "https://example.com/odontologia" }, business);
  assert.equal(result.status, "AMBIGUOUS");
});

test("una señal externa sin URL conserva la exigencia de identidad comercial", () => {
  const ambiguous = validateEvidenceEntity({ source: "reviews", evidence: "La atención dental fue excelente en Recoleta", attribution: "Google Maps" }, business);
  const probable = validateEvidenceEntity({ source: "reviews", evidence: "La atención fue excelente", attribution: "Google Maps: Estética Dental Argentina" }, business);
  assert.equal(ambiguous.status, "AMBIGUOUS");
  assert.equal(probable.status, "PROBABLE");
  assert.equal(probable.confidence, 0.78);
});

test("el dominio oficial respaldado se confirma", () => {
  const result = validateEvidenceEntity({ source: "web", evidence: "Tratamientos de Estética Dental Argentina", attribution: "https://esteticadental.com.ar/tratamientos" }, business);
  assert.equal(result.status, "CONFIRMED");
});

test("EntityMatcher no confunde identidad similar ni rubro compartido", () => {
  const target = { name: business.nombre, category: business.rubro, location: business.ubicacion, declaredWebUrl: business.webUrl };
  const chile = EntityMatcher.evaluateCandidate({ url: "https://clinicasesteticas.cl", title: "Estética Dental", snippet: "Carillas e implantes", type: "web", metadata: { location: "Santiago, Chile", category: "Clínica dental" } }, target);
  const unrelated = EntityMatcher.evaluateCandidate({ url: "https://instagram.com/dentaldasgroup", title: "Dental DAS Group", snippet: "Carillas e implantes", type: "instagram", metadata: { category: "Clínica dental" } }, target);
  assert.equal(chile.status, "rejected");
  assert.notEqual(unrelated.status, "confirmed");
});

test("métricas privadas de Instagram quedan null y requieren conexión", () => {
  const aggregated = {
    businessId: business.id,
    findings: [], byCategory: {}, byDimension: {}, deduplicated: [], evaluatedAt: new Date(),
    sources: {
      instagram: { source: "instagram", status: "evaluated", data: { profileDiscovered: true, acceptedContentIds: ["post-1"], sourceCoverage: { profile: true, content: "partial", metrics: "none" } }, findings: [], confidence: "MEDIA", coverage: 35, evaluatedAt: new Date(), requiresAuth: false },
    },
  };
  const instagram = buildChannelMetrics(aggregated).find((item) => item.source === "instagram");
  const privateMetrics = instagram.metrics.find((item) => item.key === "private_metrics");
  assert.equal(privateMetrics.value, null);
  assert.equal(privateMetrics.availability, "requires_connection");
  assert.equal(instagram.metrics.find((item) => item.key === "content").value, 1);
});

test("una métrica desconocida no se transforma en cero", () => {
  const aggregated = {
    businessId: business.id,
    findings: [], byCategory: {}, byDimension: {}, deduplicated: [], evaluatedAt: new Date(),
    sources: {
      web: { source: "web", status: "evaluated", data: { baseUrl: business.webUrl, pages: [], journeys: [] }, findings: [], confidence: "MEDIA", coverage: 30, evaluatedAt: new Date(), requiresAuth: false },
    },
  };
  const website = buildChannelMetrics(aggregated).find((item) => item.source === "web");
  assert.equal(website.metrics.find((item) => item.key === "load_time").value, null);
  assert.equal(website.metrics.find((item) => item.key === "mobile").value, null);
});

test("las métricas públicas distinguen observación de evaluación NUVRA", () => {
  const aggregated = {
    businessId: business.id,
    findings: [], byCategory: {}, byDimension: {}, deduplicated: [], evaluatedAt: new Date(),
    sources: {
      web: { source: "web", status: "evaluated", data: {
        baseUrl: business.webUrl,
        pagesAnalyzed: 2,
        performanceSummary: { avgLoadTimeMs: 1280 },
        pages: [{ renderedMarketingSignals: { horizontalOverflowPx: 0 } }],
        journeys: [{ status: "validated", clarity: .72, steps: 2 }],
      }, findings: [], confidence: "MEDIA", coverage: 30, evaluatedAt: new Date(), requiresAuth: false },
    },
  };
  const metrics = buildChannelMetrics(aggregated).find((item) => item.source === "web").metrics;
  assert.equal(metrics.find((item) => item.key === "load_time").label, "Carga observada");
  assert.equal(metrics.find((item) => item.key === "load_time").detail, "1,3 s");
  assert.equal(metrics.find((item) => item.key === "mobile").detail, "Se adapta correctamente al ancho de pantalla observado");
  assert.equal(metrics.find((item) => item.key === "action_clarity").label, "Claridad del contenido según NUVRA");
  assert.equal(metrics.find((item) => item.key === "action_clarity").detail, "72/100");
});
