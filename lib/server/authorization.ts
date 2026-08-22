import "server-only";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "./session";
import { type EntitlementKey } from "@/lib/plans";
import { hasServerEntitlement } from "./internal-access";
import { businessAccessWhere, roleCan, type Permission } from "@/lib/access-policy";
export { roleCan } from "@/lib/access-policy";

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, reason: "unauthorized" as const };
  return { ok: true as const, user };
}

export async function authorizeOrganization(organizationId: string, permission: Permission = "organization.read") {
  const auth = await requireUser(); if (!auth.ok) return auth;
  const membership = auth.user.memberships.find((item) => item.organizationId === organizationId);
  if (!membership || !roleCan(membership.role, permission)) return { ok: false as const, reason: "forbidden" as const };
  return { ok: true as const, user: auth.user, membership, organization: membership.organization };
}

export async function authorizeBusiness(businessId: string, permission: Permission = "business.read", feature?: EntitlementKey) {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const business = await prisma.business.findFirst({ where: businessAccessWhere(auth.user.id, businessId), include: { organization: { include: { memberships: { where: { userId: auth.user.id }, take: 1 } } } } });
  if (!business?.organization) return { ok: false as const, reason: "forbidden" as const };
  const membership = business.organization.memberships[0];
  if (!membership || !roleCan(membership.role, permission)) return { ok: false as const, reason: "forbidden" as const };
  if (feature && !hasServerEntitlement(auth.user, business.organization.planTier, feature)) return { ok: false as const, reason: "forbidden" as const };
  return { ok: true as const, user: auth.user, business, organization: business.organization, membership };
}
