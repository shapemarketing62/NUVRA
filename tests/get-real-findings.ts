import { prisma } from "../lib/prisma";
import { classifySiteType } from "../services/scoring/site-type-classifier";

async function main() {
  const businessId = "cmsuzna6v000ovd1cz4e3yrcm";

  const websiteAnalysis = await prisma.websiteAnalysis.findFirst({
    where: { website: { businessId } },
    orderBy: { createdAt: "desc" },
    include: { findings: true },
  });

  if (!websiteAnalysis) {
    console.log("NO_WEBSITE_ANALYSIS");
    return;
  }

  const findings = websiteAnalysis.findings.map((f) => ({
    type: f.type as any,
    category: f.category,
    severity: f.severity,
    title: f.title,
    description: f.description,
    evidence: f.evidence,
    pageUrl: f.pageUrl || undefined,
    source: f.source,
    confidence: f.confidence,
    impact: f.impact as any,
  }));

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { goals: { where: { isActive: true }, take: 1 } },
  });

  const siteTypeResult = classifySiteType({
    businessName: business?.nombre,
    rubro: business?.rubro,
    goal: business?.goals?.[0]?.objetivo,
    findings,
    url: business?.webUrl || undefined,
  });

  console.log("ANALYSIS_ID=" + websiteAnalysis.id);
  console.log("FINDINGS_COUNT=" + findings.length);
  console.log("FINDINGS_CATEGORIES=" + JSON.stringify(findings.map(f => f.category)));
  console.log("SITE_TYPE=" + siteTypeResult.siteType);
  console.log("SITE_TYPE_CONFIDENCE=" + siteTypeResult.confidence);
  console.log("SITE_TYPE_EVIDENCE=" + JSON.stringify(siteTypeResult.evidence));
  console.log("FINDINGS=" + JSON.stringify(findings.slice(0, 20)));
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
