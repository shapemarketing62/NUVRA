import fs from "fs";
import path from "path";

// Load .env
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

import { ReviewsSourceAnalyzer } from "../services/intelligence/reviews-source-analyzer";
import { GoogleMapsScrapeProvider } from "../services/intelligence/providers/reviews-provider";

async function auditReviews() {
  console.log("===============================================");
  console.log(" AUDITORÍA EN PROFUNDIDAD DE FUENTE REVIEWS");
  console.log("===============================================\n");

  const provider = new GoogleMapsScrapeProvider();
  const analyzer = new ReviewsSourceAnalyzer(provider);

  const mockBusiness: any = {
    id: "starbucks-audit-id",
    nombre: "Starbucks",
    rubro: "Cafetería",
    ciudad: "Buenos Aires",
  };

  console.log("1. Ejecutando GoogleMapsScrapeProvider.getReviews()...");
  const startTime = Date.now();
  try {
    const rawReviewsData = await provider.getReviews(mockBusiness);
    console.log(`\n-> Provider utilizado: GoogleMapsScrapeProvider (Playwright)`);
    console.log(`-> Tiempo de ejecución: ${Date.now() - startTime} ms`);
    console.log(`-> Rating obtenido:`, rawReviewsData.rating);
    console.log(`-> Cantidad total de reseñas indicadas:`, rawReviewsData.reviewCount);
    console.log(`-> Cantidad de reseñas individuales leídas:`, rawReviewsData.reviews.length);
    console.log(`-> Muestra de reseñas leídas:`, JSON.stringify(rawReviewsData.reviews, null, 2));

    console.log("\n2. Ejecutando ReviewsSourceAnalyzer.analyze()...");
    const evidence = await analyzer.analyze(mockBusiness);

    console.log(`\n-> Status de la fuente:`, evidence.status);
    console.log(`-> Confianza asignada:`, evidence.confidence);
    console.log(`-> Cobertura asignada:`, evidence.coverage);
    console.log(`-> Metadata:`, JSON.stringify(evidence.metadata, null, 2));
    console.log(`-> Total Findings generados:`, evidence.findings.length);
    console.log(`-> Textos de Findings generados:`);
    evidence.findings.forEach((f, idx) => {
      console.log(`   ${idx + 1}. [${f.type.toUpperCase()} / ${f.impact}] ${f.evidence} (Atribución: ${f.attribution})`);
    });
  } catch (err) {
    console.error("Error al obtener reseñas:", err);
  }
}

auditReviews().catch(err => {
  console.error("Error en auditoría:", err);
  process.exit(1);
});
