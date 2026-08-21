import fs from "fs";
import path from "path";

// Cargar variables de entorno desde .env
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

import { BusinessDiscoveryService } from "../services/discovery/business-discovery-service";
import { BusinessIntelligenceLayer } from "../services/intelligence/business-intelligence-layer";

async function runStarbucksTest() {
  console.log("=================================================");
  console.log("   NUVRA - PRUEBA DE DISCOVERY & BI LAYER V2");
  console.log("   (STARBUCKS - NOMBRE + RUBRO + UBICACIÓN)");
  console.log("=================================================\n");

  const discovery = new BusinessDiscoveryService();
  const biLayer = new BusinessIntelligenceLayer();

  const target = {
    name: "Starbucks",
    category: "Cafetería",
    location: "Buenos Aires, Argentina",
  };

  console.log("Datos de entrada declarados:");
  console.log(" - Nombre:", target.name);
  console.log(" - Rubro:", target.category);
  console.log(" - Ubicación:", target.location);
  console.log("\n1. Ejecutando Discovery Engine con Clasificación de Entidades Comercial...\n");

  const discoveryResult = await discovery.discover(target);

  console.log("=================================================");
  console.log("SELECCIÓN DE FUENTES WEB Y RELACIÓN DE ENTIDAD");
  console.log("=================================================");
  console.log("--> FUENTE WEB PRINCIPAL SELECCIONADA:", discoveryResult.primaryWebUrl);

  const atHomeCandidate = discoveryResult.allCandidates.find(c => c.url.includes("starbucksathome"));
  console.log("\n--> RELACIÓN DE 'starbucksathome.com':");
  if (atHomeCandidate) {
    console.log(`  - URL: ${atHomeCandidate.url}`);
    console.log(`  - Relación de Entidad: ${atHomeCandidate.entityRelationship}`);
    console.log(`  - Status: ${atHomeCandidate.status}`);
    console.log(`  - Rationale: ${atHomeCandidate.rationale}`);
  } else {
    console.log("  - No fue seleccionado como sitio principal.");
  }

  const officialArCandidate = discoveryResult.allCandidates.find(c => c.url.includes("starbucks.com.ar"));
  console.log("\n--> RELACIÓN DE 'starbucks.com.ar':");
  if (officialArCandidate) {
    console.log(`  - URL: ${officialArCandidate.url}`);
    console.log(`  - Relación de Entidad: ${officialArCandidate.entityRelationship}`);
    console.log(`  - Status: ${officialArCandidate.status}`);
    console.log(`  - Rationale: ${officialArCandidate.rationale}`);
  }

  console.log("\n2. Conectando Discovery con BusinessIntelligenceLayer (Análisis Web Real + Presencia)...\n");

  const mockBusiness: any = {
    id: "starbucks-test-id",
    nombre: target.name,
    rubro: target.category,
    ciudad: "Buenos Aires",
    webUrl: discoveryResult.primaryWebUrl,
    instagramHandle: discoveryResult.primaryInstagram,
  };

  const biResult = await biLayer.analyze(mockBusiness, discoveryResult);

  console.log("=================================================");
  console.log("ESTADO DEL NUVRA SCORE & PRESENTACIÓN");
  console.log("=================================================");
  console.log(`• Nuvra Score (${biResult.nuvraScore.statusLabel}): ${biResult.nuvraScore.total !== null ? `${biResult.nuvraScore.total}/100` : "PENDIENTE"}`);
  console.log(`• Cobertura del diagnóstico: ${biResult.coverage.overallMarketingCoverage}%`);
  console.log(`• Estado de Diagnóstico: ${biResult.nuvraScore.scoreStatus.toUpperCase()}`);
  console.log(`• Mensaje explicativo: ${biResult.nuvraScore.reason}`);

  console.log("\n=================================================");
  console.log("ESTADO DE CADA FUENTE EN EL ANÁLISIS");
  console.log("=================================================");
  Object.entries(biResult.coverage.bySource).forEach(([source, cov]) => {
    console.log(`• ${source.toUpperCase()}: ${cov.status} (Confianza: ${cov.confidence}) -> ${cov.reason}`);
  });

  console.log("\n=================================================");
  console.log("ESTADO DE DIMENSIONES (SIN PENALIZACIÓN FALSA)");
  console.log("=================================================");
  biResult.nuvraScore.dimensions.forEach((dim) => {
    const isEvaluated = dim.points !== null;
    console.log(`• ${dim.name} (${dim.slug}): ${isEvaluated ? `${dim.points}/100` : "null (Sin datos suficientes)"}`);
    if (!isEvaluated && dim.message) {
      console.log(`  └─ Razón: ${dim.message}`);
    }
  });

  console.log("\n=================================================");
  console.log("AUDITORÍA DE WHATSAPP");
  console.log("=================================================");
  const whatsappPenaltyFindings = biResult.aggregatedEvidence.findings.filter(f => f.evidence.toLowerCase().includes("whatsapp no visible"));
  console.log(`• Hallazgos negativos por WhatsApp ausente: ${whatsappPenaltyFindings.length}`);
  if (whatsappPenaltyFindings.length === 0) {
    console.log("  └─ VERIFICADO: Se eliminó la penalización automática de WhatsApp por defecto.");
  }
}

runStarbucksTest().catch((err) => {
  console.error("Error en test de Starbucks BI:", err);
  process.exit(1);
});
