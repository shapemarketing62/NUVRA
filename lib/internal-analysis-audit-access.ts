import { roleCan } from "./access-policy.ts";

export interface InternalAuditUser {
  id: string;
  internalRole?: string | null;
  memberships: Array<{ organizationId: string; role: string }>;
}

export interface InternalAuditCandidate {
  id: string;
  name: string;
  organizationId: string;
  createdAt: Date | string;
  latestAnalysisAt: Date | string | null;
}

export type InternalAuditAccessResult<TAccess> =
  | { ok: true; access: TAccess }
  | { ok: false; reason: "unauthorized" | "forbidden" | "validation_error" | "not_found" }
  | { ok: false; reason: "ambiguous_business_name"; candidates: Array<InternalAuditCandidate & { authorized: true }> };

export async function resolveAuthorizedBusinessForInternalAudit<TAccess>(input: {
  user: InternalAuditUser | null;
  businessId: string | null;
  exactName: string | null;
  maxIdentifierLength: number;
  maxBusinessNameLength: number;
  findByExactName: (name: string, authorizedOrganizationIds: string[]) => Promise<InternalAuditCandidate[]>;
  authorizeById: (businessId: string) => Promise<{ ok: true; access: TAccess } | { ok: false; reason: "unauthorized" | "forbidden" }>;
}): Promise<InternalAuditAccessResult<TAccess>> {
  if (!input.user) return { ok: false, reason: "unauthorized" };
  if (input.user.internalRole !== "INTERNAL") return { ok: false, reason: "forbidden" };

  const businessId = input.businessId?.trim() || null;
  const exactName = input.exactName?.trim() || null;
  if ((businessId && exactName) || (!businessId && !exactName)) return { ok: false, reason: "validation_error" };

  const authorize = (id: string) => input.authorizeById(id);
  if (businessId) {
    if (businessId.length > input.maxIdentifierLength) return { ok: false, reason: "validation_error" };
    return authorize(businessId);
  }

  if (!exactName || exactName.length > input.maxBusinessNameLength) return { ok: false, reason: "validation_error" };
  const authorizedOrganizationIds = input.user.memberships
    .filter((membership) => roleCan(membership.role, "business.read"))
    .map((membership) => membership.organizationId);
  if (!authorizedOrganizationIds.length) return { ok: false, reason: "not_found" };

  const matches = await input.findByExactName(exactName, authorizedOrganizationIds);
  const authorizedMatches: Array<{ candidate: InternalAuditCandidate; access: TAccess }> = [];
  for (const candidate of matches) {
    const result = await authorize(candidate.id);
    if (result.ok) authorizedMatches.push({ candidate, access: result.access });
  }
  if (!authorizedMatches.length) return { ok: false, reason: "not_found" };
  if (authorizedMatches.length > 1) {
    return {
      ok: false,
      reason: "ambiguous_business_name",
      candidates: authorizedMatches.slice(0, 10).map(({ candidate }) => ({ ...candidate, authorized: true as const })),
    };
  }
  return { ok: true, access: authorizedMatches[0].access };
}
