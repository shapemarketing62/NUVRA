const { PrismaClient } = require("@prisma/client");
const fs = require("node:fs");
const path = require("node:path");

const prisma = new PrismaClient();

async function main() {
  const legacy = await prisma.business.findMany({
    where: { organizationId: null },
    select: { id: true, nombre: true, userId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const report = { generatedAt: new Date().toISOString(), detected: legacy.length, assigned: [], manualReview: [] };

  for (const business of legacy) {
    if (!business.userId) {
      report.manualReview.push({ businessId: business.id, name: business.nombre, reason: "missing_legacy_user" });
      continue;
    }
    const memberships = await prisma.membership.findMany({ where: { userId: business.userId }, select: { organizationId: true, role: true } });
    if (memberships.length !== 1) {
      report.manualReview.push({ businessId: business.id, name: business.nombre, reason: memberships.length ? "ambiguous_memberships" : "no_membership", candidateOrganizations: memberships.map((item) => item.organizationId) });
      continue;
    }
    const evidence = memberships[0];
    const updated = await prisma.business.updateMany({ where: { id: business.id, organizationId: null, userId: business.userId }, data: { organizationId: evidence.organizationId } });
    if (updated.count === 1) report.assigned.push({ businessId: business.id, organizationId: evidence.organizationId, evidence: "single_membership" });
  }

  const output = path.join(process.cwd(), "legacy-business-migration-report.json");
  fs.writeFileSync(output, JSON.stringify(report, null, 2), { encoding: "utf8", flag: "w" });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\nReport: ${output}\n`);
}

main().catch((error) => { process.stderr.write(`Legacy migration failed: ${error instanceof Error ? error.message : "unknown error"}\n`); process.exitCode = 1; }).finally(() => prisma.$disconnect());
