const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const projectRoot = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) request = path.join(projectRoot, request.slice(2));
  return originalResolve.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function (module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const envPath = path.join(projectRoot, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (!match || process.env[match[1].trim()]) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

const { ExternalMentionsSourceAnalyzer } = require("../services/intelligence/external-mentions-analyzer.ts");

async function main() {
  const analyzer = new ExternalMentionsSourceAnalyzer();
  const business = {
    id: "test-starbucks",
    nombre: "Starbucks",
    rubro: "Cafetería",
    ubicacion: "Buenos Aires, Argentina",
    ciudad: "Buenos Aires",
    webUrl: "https://www.starbucks.com.ar",
    instagramHandle: "starbucks_ar",
    tipoCliente: "B2C",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await analyzer.analyze(business);
  const data = result.data || {};
  console.log(JSON.stringify({
    totalFound: data.totalFound || 0,
    totalAccepted: data.totalAccepted || 0,
    totalRejected: data.totalRejected || 0,
    byType: data.byType || {},
    mentions: [...(data.mentions || []), ...(data.rejectedMentions || [])].map((mention) => ({
      accepted: mention.accepted,
      type: mention.mentionType,
      domain: mention.domain,
      title: mention.title,
      entityMatchConfidence: mention.entityMatchConfidence,
      mentionRelevanceScore: mention.mentionRelevanceScore,
      sentiment: mention.sentiment,
      evidenceConfidence: mention.evidenceConfidence,
    })),
    coverage: result.coverage,
    confidence: result.confidence,
    findings: result.findings.map((finding) => finding.evidence),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
