const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const route = fs.readFileSync(path.join(root, "app/api/audit/analysis/route.ts"), "utf8");
const access = fs.readFileSync(path.join(root, "lib/internal-analysis-audit-access.ts"), "utf8");

test("diagnóstico de producción exige sesión, rol INTERNAL y acceso al negocio", () => {
  assert.match(route, /const auth = await requireUser\(\)/);
  assert.match(route, /resolveAuthorizedBusinessForInternalAudit/);
  assert.match(route, /authorizeBusiness\(id,\s*"business\.read"\)/);
  assert.match(access, /input\.user\.internalRole !== "INTERNAL"/);
  assert.match(access, /roleCan\(membership\.role, "business\.read"\)/);
  assert.ok(route.indexOf("const auth = await requireUser()") < route.indexOf("const resolved = await resolveRequestedBusiness"));
});

test("diagnóstico selecciona el history más reciente y conserva el anterior", () => {
  assert.match(route, /analysisHistory:\s*\{\s*orderBy:\s*\[\{\s*createdAt:\s*"desc"\s*\},\s*\{\s*id:\s*"desc"\s*\}\],\s*take:\s*2/);
  assert.match(route, /analysisHistoryId:\s*latestHistory\?\.id/);
  assert.match(route, /previousHistoryId:\s*business\.analysisHistory\[1\]\?\.id/);
  assert.match(route, /whetherLatestHistoryIsSelected:\s*Boolean\(latestHistory\)/);
});

test("diagnóstico acepta businessId o nombre exacto sin ampliar el acceso de organización", () => {
  assert.match(route, /searchParams\.get\("businessId"\)/);
  assert.match(route, /searchParams\.get\("name"\)/);
  assert.match(route, /where:\s*\{\s*nombre:\s*name,\s*organizationId:\s*\{\s*in:\s*authorizedOrganizationIds\s*\}/);
  assert.match(route, /error:\s*resolved\.reason,\s*candidates:\s*resolved\.candidates/);
  assert.match(access, /const result = await authorize\(candidate\.id\)/);
  assert.match(access, /authorizedMatches\.slice\(0, 10\)/);
});

test("diagnóstico expone solo readiness booleana y nunca valores de secretos", () => {
  assert.match(route, /tavilyConfigured:\s*Boolean\(process\.env\.TAVILY_API_KEY\)/);
  assert.match(route, /googlePlacesConfigured:\s*Boolean\(process\.env\.GOOGLE_PLACES_API_KEY\)/);
  assert.doesNotMatch(route, /DATABASE_URL/);
  assert.doesNotMatch(route, /tavilyApiKey\s*:/i);
  assert.doesNotMatch(route, /googlePlacesApiKey\s*:/i);
  assert.doesNotMatch(route, /passwordHash|tokenHash|accessToken|refreshToken|encryptedData/);
  assert.match(route, /Cache-Control":\s*"private, no-store"/);
});

test("diagnóstico usa el SHA real de Railway y sanea URLs y fallos", () => {
  assert.match(route, /process\.env\.RAILWAY_GIT_COMMIT_SHA \|\| process\.env\.COMMIT_SHA/);
  assert.match(route, /url\.username = ""/);
  assert.match(route, /url\.password = ""/);
  assert.match(route, /function safeFailure/);
  assert.match(route, /function websiteFailure/);
  assert.doesNotMatch(route, /stack\s*:/);
});

test("diagnóstico devuelve la ruta productiva mínima sin snapshots completos", () => {
  for (const field of ["deployment", "business", "analysis", "providers", "discovery", "candidates", "website", "platforms", "evidence", "sourceStatuses"]) {
    assert.match(route, new RegExp(`\\n\\s{6}${field}:`));
  }
  assert.doesNotMatch(route, /response\s*=\s*\{[\s\S]*?businessProfile\s*:/);
  assert.doesNotMatch(route, /response\s*=\s*\{[\s\S]*?analysisTrace\s*:/);
  assert.doesNotMatch(route, /response\s*=\s*\{[\s\S]*?strategy\s*:/);
  assert.doesNotMatch(route, /response\s*=\s*\{[\s\S]*?diagnosis\s*:/);
});
