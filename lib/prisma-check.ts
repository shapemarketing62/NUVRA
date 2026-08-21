import { prisma } from "@/lib/prisma";

export async function validatePrismaModels(): Promise<{
  available: string[];
  missing: string[];
}> {
  const available: string[] = [];
  const missing: string[] = [];

  const models = [
    "business",
    "website",
    "websiteAnalysis",
    "finding",
    "nuvraScore",
    "scoreDimension",
    "diagnosis",
    "strategy",
    "strategicAction",
    "clarificationQuestion",
    "analysisHistory",
    "instagramConnection",
  ];

  for (const model of models) {
    try {
      const prismaModel = (prisma as any)[model];
      if (prismaModel && typeof prismaModel.findMany === "function") {
        available.push(model);
      } else {
        missing.push(`${model} (no findMany)`);
      }
    } catch {
      missing.push(`${model} (error)`);
    }
  }

  return { available, missing };
}
