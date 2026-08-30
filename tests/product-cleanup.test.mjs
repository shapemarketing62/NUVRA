import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { canAccessPartnerService, getDashboardNavigation } from "../lib/product-navigation.ts";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const paths = (plan, internal = false) => getDashboardNavigation(plan, internal).flatMap((group) => group.items.map((item) => item.href));

test("A: Resultados no aparece en el sidebar", () => {
  for (const plan of ["FREE", "PRO", "PARTNER"]) assert.equal(paths(plan).includes("/dashboard/resultados"), false);
});

test("B: Nuvra AI no aparece mientras el producto no está habilitado", () => {
  assert.equal(paths("PRO").includes("/dashboard/nuvra-ai"), false);
  assert.equal(paths("PARTNER").includes("/dashboard/nuvra-ai"), false);
  assert.equal(paths("FREE", true).includes("/dashboard/nuvra-ai"), false);
});

test("C y D: Shape Partner aparece solo para Partner o acceso interno", () => {
  assert.equal(paths("FREE").includes("/dashboard/shape-partner"), false);
  assert.equal(paths("PRO").includes("/dashboard/shape-partner"), false);
  assert.ok(paths("PARTNER").includes("/dashboard/shape-partner"));
  assert.ok(paths("FREE", true).includes("/dashboard/shape-partner"));
  assert.equal(canAccessPartnerService("FREE", true), true);
});

test("E: el endpoint Partner exige acceso server-side", () => {
  const route = read("app/api/partner/service/route.ts");
  assert.match(route, /authorizeBusiness\(businessId, "business\.read", "workspace\.overview"\)/);
  assert.match(route, /return apiError\(access\.reason/);
});

test("F y J: Resultados conserva la ruta pero redirige a Evolución sin placeholders", () => {
  const results = read("app/dashboard/resultados/page.tsx");
  assert.match(results, /redirect\("\/dashboard\/evolucion"\)/);
  assert.doesNotMatch(results, /Ventas|Facturación|Consultas recibidas|Visitas al sitio|Interacción en redes/);
});

test("G: Nuvra AI no inspecciona secretos desde el cliente", () => {
  const ai = read("app/dashboard/nuvra-ai/page.tsx");
  assert.doesNotMatch(ai, /process\.env|OPENAI_API_KEY|ANTHROPIC_API_KEY/);
  assert.match(ai, /todavía no está habilitado/);
});

test("H e I: Configuración tiene una sola sección de plan e incluye Integraciones", () => {
  const settings = read("app/dashboard/configuracion/page.tsx");
  assert.equal((settings.match(/<BillingPanel/g) || []).length, 1);
  assert.equal((settings.match(/id: "plan"/g) || []).length, 1);
  assert.match(settings, /id: "integrations", label: "Integraciones"/);
  assert.match(settings, /<IntegrationManagerPanel/);
  assert.doesNotMatch(settings, /Planes de NUVRA|Actualizar cuenta|Eliminar cuenta|Guardar cambios/);
});

test("K y L: Partner se presenta como servicio y desaparece el texto de auth futura", () => {
  const partner = read("app/dashboard/shape-partner/page.tsx");
  assert.match(partner, /Tu equipo de marketing externo/);
  assert.match(partner, /Qué está haciendo el equipo de NUVRA\/Shape/);
  assert.match(partner, /Próximo entregable/);
  assert.match(partner, /Acciones en ejecución/);
  assert.doesNotMatch(partner, /white.label|multiempresa|múltiples clientes|autenticación real se conectará/i);
});

test("M: planes legacy desconocidos no rompen la navegación", () => {
  const groups = getDashboardNavigation("LEGACY_PLAN");
  assert.equal(groups.length, 3);
  assert.ok(groups[0].items.some((item) => item.href === "/dashboard"));
  assert.equal(groups.flatMap((group) => group.items.map((item) => item.href)).includes("/dashboard/shape-partner"), false);
});

test("Competencia respeta el entitlement en navegación", () => {
  assert.equal(paths("FREE").includes("/dashboard/competencia"), false);
  assert.ok(paths("PRO").includes("/dashboard/competencia"));
  assert.ok(paths("FREE", true).includes("/dashboard/competencia"));
});
