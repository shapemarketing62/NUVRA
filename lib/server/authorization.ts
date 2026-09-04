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

export type AuthorizationDebug = {
  session: {
    userId: string;
    internalRole?: string | null;
    membershipCount: number;
  };
  memberships: Array<{
    organizationId: string;
    role: string;
    hasBusinessRead: boolean;
  }>;
  business?: {
    businessId: string;
    organizationId: string | null;
  };
  authorization: {
    membershipFound: boolean;
    membershipOrganizationMatch: boolean;
    role: string | null;
    hasBusinessRead: boolean;
    authorizeBusinessResult: boolean | null;
    denialReason: string | null;
  };
};

export async function buildAuthorizationDebug(businessId: string | null): Promise<AuthorizationDebug> {
  const sessionUser = await getCurrentUser();
  const session = sessionUser
    ? {
        userId: sessionUser.id,
        internalRole: sessionUser.internalRole ?? null,
        membershipCount: sessionUser.memberships.length,
      }
    : { userId: "anonymous", internalRole: null, membershipCount: 0 };

  const memberships = (sessionUser?.memberships ?? []).map((item) => ({
    organizationId: item.organizationId,
    role: item.role,
    hasBusinessRead: roleCan(item.role, "business.read"),
  }));

  let businessInfo: AuthorizationDebug["business"] | undefined;
  let authorization: AuthorizationDebug["authorization"] = {
    membershipFound: false,
    membershipOrganizationMatch: false,
    role: null,
    hasBusinessRead: false,
    authorizeBusinessResult: null,
    denialReason: "not_evaluated",
  };

  if (businessId && sessionUser) {
    const access = await authorizeBusiness(businessId, "business.read");
    const business = await prisma.business.findUnique({ where: { id: businessId }, select: { organizationId: true } });
    businessInfo = { businessId, organizationId: business?.organizationId ?? null };
    const matchingMembership = sessionUser.memberships.find((item) => item.organizationId === business?.organizationId);
    authorization = {
      membershipFound: Boolean(matchingMembership),
      membershipOrganizationMatch: Boolean(matchingMembership),
      role: matchingMembership?.role ?? null,
      hasBusinessRead: matchingMembership ? roleCan(matchingMembership.role, "business.read") : false,
      authorizeBusinessResult: access.ok,
      denialReason: access.ok ? null : (access.reason ?? "forbidden"),
    };
  }

  return { session, memberships, business: businessInfo, authorization };
}

export async function authorizeBusiness(businessId: string, permission: Permission = "business.read", feature?: EntitlementKey) {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const business = await prisma.business.findFirst({ where: businessAccessWhere(auth.user.id, businessId), include: { organization: { include: { memberships: { where: { userId: auth.user.id }, take: 1, orderBy: { id: "asc" } } } } } });
  if (!business?.organization) return { ok: false as const, reason: "forbidden" as const };
  const membership = business.organization.memberships[0];
  if (!membership || !roleCan(membership.role, permission)) return { ok: false as const, reason: "forbidden" as const };
  if (feature && !hasServerEntitlement(auth.user, business.organization.planTier, feature)) return { ok: false as const, reason: "forbidden" as const };
  return { ok: true as const, user: auth.user, business, organization: business.organization, membership };
}
