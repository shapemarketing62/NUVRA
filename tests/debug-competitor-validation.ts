import fs from "fs";
import path from "path";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

import { CompetitorSourceAnalyzer } from "../services/intelligence/competitor-analyzer";
import type { Business } from "@prisma/client";

async function main() {
  const analyzer = new CompetitorSourceAnalyzer();

  const business: Business = {
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
  } as any;

  // Manually run the extraction and validation steps with debug
  const queries = [
    `competidores de ${business.nombre} ${business.rubro} ${business.ubicacion}`,
    `alternativas a ${business.nombre} ${business.rubro} ${business.ubicacion}`,
    `${business.rubro} ${business.ubicacion} lista negocios locales`,
    `${business.nombre} vs ${business.rubro} ${business.ubicacion}`,
    `mejores cafeterías ${business.ubicacion}`,
    `coffee shops ${business.ubicacion} lista`,
    `cafés famosos ${business.ubicacion}`,
  ];

  const searchProvider = (analyzer as any).searchProvider;
  const allResults: Array<{ result: any; query: string }> = [];

  for (const query of queries) {
    try {
      const results = await searchProvider.search(query, business);
      for (const r of results) {
        allResults.push({ result: r, query });
      }
    } catch (err) {
      console.warn(`Query failed: "${query}"`, err instanceof Error ? err.message : String(err));
    }
  }

  console.log(`Total results: ${allResults.length}`);

  const candidateNames = (analyzer as any).extractCompetitorNames(allResults, business.nombre);
  console.log(`\nCandidates extracted: ${candidateNames.length}`);
  for (const c of candidateNames) {
    console.log(`  - ${c.name} (from: ${c.source})`);
  }

  for (const { name, source } of candidateNames) {
    console.log(`\n--- Validating: ${name} ---`);
    
    const presenceInfo = await (analyzer as any).searchOfficialPresence(name, business.rubro, business.ubicacion, business.nombre);
    console.log(`  officialWebsite: ${presenceInfo.officialWebsite}`);
    console.log(`  officialSocialProfile: ${presenceInfo.officialSocialProfile}`);
    console.log(`  discoveryEvidenceUrls: ${presenceInfo.discoveryEvidenceUrls.length}`);
    
    const entityResult = (analyzer as any).calculateEntityConfidence(presenceInfo, name, business.rubro, business.ubicacion);
    console.log(`  entityMatchConfidence: ${entityResult.score.toFixed(2)}`);
    console.log(`  entity reasons: ${entityResult.reasons.join(", ")}`);
    
    if (entityResult.score < 0.55) {
      console.log(`  -> REJECTED (entity confidence too low)`);
      continue;
    }
    
    const relevanceResult = (analyzer as any).calculateCompetitorRelevance(presenceInfo, name, business.rubro, business.ubicacion, business.tipoCliente);
    console.log(`  competitorRelevanceScore: ${relevanceResult.score.toFixed(2)}`);
    console.log(`  relevance reasons: ${relevanceResult.reasons.join(", ")}`);
    
    if (relevanceResult.score < 0.5) {
      console.log(`  -> REJECTED (relevance too low)`);
      continue;
    }
    
    const competitorType = (analyzer as any).calculateCompetitorType(presenceInfo, name, business.rubro, business.ubicacion, relevanceResult.score);
    console.log(`  competitorType: ${competitorType}`);
    console.log(`  -> ACCEPTED`);
  }
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
