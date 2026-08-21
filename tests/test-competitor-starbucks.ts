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
  console.log("=================================================");
  console.log("   NUVRA - PRUEBA COMPETITOR ANALYZER");
  console.log("   STARBUCKS / Cafetería / Buenos Aires, Argentina");
  console.log("=================================================\n");

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

  const result = await analyzer.analyze(business);

  console.log("\n=================================================");
  console.log("RESULTADO DEL ANÁLISIS DE COMPETENCIA");
  console.log("=================================================");
  console.log(`Status: ${result.status}`);
  console.log(`Confianza: ${result.confidence}`);
  console.log(`Coverage: ${result.coverage}%`);
  console.log(`Findings: ${result.findings.length}`);

  if (result.data && typeof result.data === "object" && "competitors" in result.data) {
    const data = result.data as any;
    console.log(`\nTotal candidatos extraídos: ${data.totalCandidatesExtracted}`);
    console.log(`Total validados: ${data.totalValidated}`);
    console.log(`\nCompetidores encontrados (${data.competitors.length}):`);

    for (const comp of data.competitors) {
      console.log(`\n  - ${comp.name}`);
      console.log(`    Web: ${comp.web || "N/A"}`);
      console.log(`    Ubicación: ${comp.location || "N/A"}`);
      console.log(`    Razón: ${comp.reason}`);
      console.log(`    Relevancia: ${Math.round(comp.competitorRelevanceScore * 100)}%`);
      console.log(`    Entity confidence: ${Math.round(comp.entityMatchConfidence * 100)}%`);
      console.log(`    Estado: ${comp.status}`);
      console.log(`    Evidencia: ${comp.evidenceUrls.join(", ")}`);
    }
  }

  console.log("\n=================================================");
  console.log("FINDINGS");
  console.log("=================================================");
  for (const finding of result.findings) {
    console.log(`\n[${finding.category}] ${finding.type.toUpperCase()} (${finding.impact})`);
    console.log(`  Evidencia: ${finding.evidence}`);
    console.log(`  Atribución: ${finding.attribution}`);
    console.log(`  Peso: ${finding.weight}`);
    console.log(`  Confianza: ${finding.confidence}`);
  }

  if (result.findings.length === 0) {
    console.log("\n  (Sin findings generados - evidencia insuficiente de competidores confirmados)");
  }
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
