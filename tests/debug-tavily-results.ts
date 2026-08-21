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

import { SmartSearchProvider } from "../services/intelligence/search-source-analyzer";

async function main() {
  const provider = new SmartSearchProvider();
  const queries = [
    "competidores de Starbucks Cafetería Buenos Aires, Argentina",
    "alternativas a Starbucks Cafetería Buenos Aires, Argentina",
    "Cafetería Buenos Aires, Argentina lista negocios locales",
    "Starbucks vs Cafetería Buenos Aires, Argentina",
  ];

  for (const q of queries) {
    console.log(`\n--- Query: "${q}" ---`);
    try {
      const results = await provider.search(q, {} as any);
      console.log(`Results: ${results.length}`);
      for (const r of results) {
        console.log(`  [${r.url}]`);
        console.log(`    Title: ${r.title}`);
        console.log(`    Snippet: ${(r.snippet || "").slice(0, 120)}...`);
      }
    } catch (err) {
      console.error(`  Error:`, err);
    }
  }
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
