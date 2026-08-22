import "server-only";
import { hasEntitlement, type EntitlementKey } from "@/lib/plans";

export const INTERNAL_ROLES = ["INTERNAL", "ADMIN"] as const;
export type InternalRole = (typeof INTERNAL_ROLES)[number];

export function isInternalRole(value?: string | null): value is InternalRole {
  return value === "INTERNAL" || value === "ADMIN";
}

export function hasInternalAccess(user?: { internalRole?: string | null } | null): boolean {
  return isInternalRole(user?.internalRole);
}

export function hasServerEntitlement(
  user: { internalRole?: string | null },
  planTier: string | null | undefined,
  entitlement: EntitlementKey
): boolean {
  return hasInternalAccess(user) || hasEntitlement(planTier, entitlement);
}
