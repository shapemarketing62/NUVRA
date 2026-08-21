import "server-only";
import { prisma } from "@/lib/prisma";
import { getUsageLimit, type UsageLimitKey } from "@/lib/plans";
import { subscriptionService } from "@/services/billing";

export type UsageKind = "analysis" | "report";
export function currentPeriodKey(date = new Date()) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; }

export async function getOrganizationUsage(organizationId: string) {
  await subscriptionService.getSubscription(organizationId);
  const periodKey = currentPeriodKey();
  const [organization, businesses, members, analyses, reports] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { planTier: true } }),
    prisma.business.count({ where: { organizationId } }), prisma.membership.count({ where: { organizationId } }),
    prisma.usageEvent.aggregate({ where: { organizationId, kind: "analysis", periodKey }, _sum: { quantity: true } }),
    prisma.usageEvent.aggregate({ where: { organizationId, kind: "report", periodKey }, _sum: { quantity: true } }),
  ]);
  if (!organization) return null;
  return { planTier: organization.planTier, businesses, teamMembers: members, monthlyAnalyses: analyses._sum.quantity || 0, monthlyReports: reports._sum.quantity || 0 };
}

export async function canConsume(organizationId: string, limit: UsageLimitKey, quantity = 1) {
  const usage = await getOrganizationUsage(organizationId); if (!usage) return false;
  const current = limit === "businesses" ? usage.businesses : limit === "teamMembers" ? usage.teamMembers : limit === "monthlyAnalyses" ? usage.monthlyAnalyses : limit === "monthlyReports" ? usage.monthlyReports : 0;
  return current + quantity <= getUsageLimit(usage.planTier, limit);
}

export async function recordUsage(organizationId: string, kind: UsageKind, resourceId?: string, quantity = 1) {
  return prisma.usageEvent.create({ data: { organizationId, kind, resourceId, quantity, periodKey: currentPeriodKey() } });
}
