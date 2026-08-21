import "server-only";
import { prisma } from "@/lib/prisma";
import { roleCan, type MembershipRole } from "@/lib/access-policy";
import { AUDIT_ACTIONS, writeAuditEvent } from "./audit";
import { subscriptionService } from "@/services/billing";
import type { PlanTier } from "@/lib/plans";

async function requireManager(actorUserId: string, organizationId: string, ownerOnly = false) {
  const membership = await prisma.membership.findUnique({ where: { userId_organizationId: { userId: actorUserId, organizationId } } });
  if (!membership || (ownerOnly ? membership.role !== "owner" : !roleCan(membership.role, "team.manage"))) throw new Error("forbidden");
  return membership;
}

export async function addOrganizationMember(actorUserId: string, organizationId: string, userId: string, role: MembershipRole) {
  await requireManager(actorUserId, organizationId);
  const membership = await prisma.membership.create({ data: { organizationId, userId, role } });
  await writeAuditEvent({ actorUserId, organizationId, action: AUDIT_ACTIONS.memberAdded, targetType: "membership", targetId: membership.id, metadata: { role } });
  return membership;
}

export async function changeOrganizationRole(actorUserId: string, organizationId: string, membershipId: string, role: MembershipRole) {
  await requireManager(actorUserId, organizationId);
  const current = await prisma.membership.findFirst({ where: { id: membershipId, organizationId } });
  if (!current || current.role === "owner") throw new Error("forbidden");
  const membership = await prisma.membership.update({ where: { id: membershipId }, data: { role } });
  await writeAuditEvent({ actorUserId, organizationId, action: AUDIT_ACTIONS.roleChanged, targetType: "membership", targetId: membership.id, metadata: { from: current.role, to: role } });
  return membership;
}

export async function removeOrganizationMember(actorUserId: string, organizationId: string, membershipId: string) {
  await requireManager(actorUserId, organizationId);
  const current = await prisma.membership.findFirst({ where: { id: membershipId, organizationId } });
  if (!current || current.role === "owner") throw new Error("forbidden");
  await prisma.membership.delete({ where: { id: membershipId } });
  await writeAuditEvent({ actorUserId, organizationId, action: AUDIT_ACTIONS.memberRemoved, targetType: "membership", targetId: membershipId, metadata: { role: current.role, userId: current.userId } });
}

export async function changeOrganizationPlanAdministrative(actorUserId: string, organizationId: string, planTier: string) {
  await requireManager(actorUserId, organizationId, true);
  if (!(["FREE", "PRO", "PARTNER"] as string[]).includes(planTier)) throw new Error("invalid_plan");
  return subscriptionService.changePlan({ actorUserId, organizationId, plan: planTier as PlanTier });
}
