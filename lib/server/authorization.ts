import "server-only";
import { randomUUID, createHash } from "crypto";
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
    organizationResolutionSource: "business.organizationId" | "business.organization.id" | "not_found" | "not_evaluated";
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
    const businessById = await prisma.business.findUnique({ where: { id: businessId }, select: { organizationId: true } });
    let organizationResolutionSource: "business.organizationId" | "business.organization.id" | "not_found" | "not_evaluated" = "not_evaluated";
    let resolvedOrganizationId: string | null = null;

    if (!businessById) {
      organizationResolutionSource = "not_found";
    } else if (businessById.organizationId) {
      resolvedOrganizationId = businessById.organizationId;
      organizationResolutionSource = "business.organizationId";
    } else {
      const businessWithOrg = await prisma.business.findFirst({
        where: { id: businessId },
        include: { organization: { select: { id: true } } },
      });
      if (businessWithOrg?.organization?.id) {
        resolvedOrganizationId = businessWithOrg.organization.id;
        organizationResolutionSource = "business.organization.id";
      } else {
        resolvedOrganizationId = null;
        organizationResolutionSource = "business.organizationId";
      }
    }

    businessInfo = { businessId, organizationId: resolvedOrganizationId, organizationResolutionSource };
    const matchingMembership = sessionUser.memberships.find((item) => item.organizationId === resolvedOrganizationId);
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

export type CandidateConsistencyProbe = {
  requestId: string;
  timestamp: string;
  probes: Array<{
    businessId: string;
    nameLookup: { organizationId: string | null };
    directRead: { found: boolean; organizationId: string | null };
    relationRead: { found: boolean; organizationId: string | null };
    authorization: { result: boolean | null; denialReason: string | null };
    consistency: { sameOrganizationId: boolean };
  }>;
};

export async function buildCandidateConsistencyProbe(
  candidateIds: string[],
  exactName: string,
  authorizedOrganizationIds: string[]
): Promise<CandidateConsistencyProbe> {
  const requestId = randomUUID();
  const timestamp = new Date().toISOString();

  const probes = await prisma.$transaction(async (tx) => {
    const results = [];
    for (const businessId of candidateIds) {
      const [nameMatches, direct, withRelation] = await Promise.all([
        tx.business.findMany({
          where: { id: businessId, nombre: exactName, organizationId: { in: authorizedOrganizationIds } },
          select: { id: true, organizationId: true },
        }),
        tx.business.findUnique({
          where: { id: businessId },
          select: { organizationId: true },
        }),
        tx.business.findFirst({
          where: { id: businessId },
          include: { organization: { select: { id: true } } },
        }),
      ]);

      const nameOrganizationId = nameMatches[0]?.organizationId ?? null;
      const directOrganizationId = direct?.organizationId ?? null;
      const relationOrganizationId = withRelation?.organization?.id ?? null;

      results.push({
        businessId,
        nameLookup: { organizationId: nameOrganizationId },
        directRead: { found: Boolean(direct), organizationId: directOrganizationId },
        relationRead: { found: Boolean(withRelation?.organization), organizationId: relationOrganizationId },
        consistency: {
          sameOrganizationId: nameOrganizationId === directOrganizationId && directOrganizationId === relationOrganizationId,
        },
      });
    }
    return results;
  });

  const authResults = await Promise.all(candidateIds.map((id) => authorizeBusiness(id, "business.read")));

  const enriched = probes.map((probe, index) => {
    const access = authResults[index];
    return {
      ...probe,
      authorization: {
        result: access.ok,
        denialReason: access.ok ? null : (access.reason ?? "forbidden"),
      },
    };
  });

  return { requestId, timestamp, probes: enriched };
}

export type DatabaseConnectionFingerprint = {
  requestId: string;
  timestamp: string;
  runtimeDatasource: "postgresql" | "sqlite" | "unknown";
  databaseIdentityHash: string | null;
  serverIdentityHash: string | null;
  currentSchema: string | null;
  searchPathHash: string | null;
  backendPid: number | null;
  connectionMode: "DIRECT" | "PROXY" | "PGBOUNCER" | "UNKNOWN";
};

export async function buildDatabaseConnectionFingerprint(): Promise<DatabaseConnectionFingerprint> {
  const requestId = randomUUID();
  const timestamp = new Date().toISOString();

  const databaseUrl = process.env.DATABASE_URL || "";
  let runtimeDatasource: DatabaseConnectionFingerprint["runtimeDatasource"] = "unknown";
  let connectionMode: DatabaseConnectionFingerprint["connectionMode"] = "UNKNOWN";

  if (databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://")) {
    runtimeDatasource = "postgresql";
    if (databaseUrl.includes("pgbouncer=true") || databaseUrl.includes("pooling") || databaseUrl.includes("transaction") || databaseUrl.includes("statement")) {
      connectionMode = "PGBOUNCER";
    } else if (databaseUrl.includes("proxy") || databaseUrl.includes("railway") || databaseUrl.includes("render.com") || databaseUrl.includes("supabase.co") || databaseUrl.includes("neon.tech")) {
      connectionMode = "PROXY";
    } else {
      connectionMode = "DIRECT";
    }
  } else if (databaseUrl.startsWith("file:")) {
    runtimeDatasource = "sqlite";
  }

  let databaseIdentityHash: string | null = null;
  let serverIdentityHash: string | null = null;
  let backendPid: number | null = null;
  let currentSchema: string | null = null;
  let searchPathHash: string | null = null;

  if (runtimeDatasource === "postgresql") {
    try {
      const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT current_database() AS database, current_schema() AS schema, current_setting('search_path') AS search_path, pg_backend_pid() AS backend_pid, inet_server_addr() AS server_addr
      `;
      const row = rows[0];
      if (row) {
        const databaseName = String(row.database ?? "");
        const schemaName = String(row.schema ?? "");
        const searchPath = String(row.search_path ?? "");
        const serverAddr = row.server_addr ? String(row.server_addr) : "";

        const databaseIdentity = `${databaseName}:${schemaName}`;
        databaseIdentityHash = createHash("sha256").update(databaseIdentity).digest("hex").slice(0, 32);

        const serverIdentity = serverAddr ? `addr:${serverAddr}` : "addr:unknown";
        serverIdentityHash = createHash("sha256").update(serverIdentity).digest("hex").slice(0, 32);

        backendPid = Number(row.backend_pid);
        currentSchema = schemaName || null;
        searchPathHash = createHash("sha256").update(searchPath).digest("hex").slice(0, 32);
      }
    } catch {
      databaseIdentityHash = null;
      serverIdentityHash = null;
      backendPid = null;
      currentSchema = null;
      searchPathHash = null;
    }
  }

  return { requestId, timestamp, runtimeDatasource, databaseIdentityHash, serverIdentityHash, currentSchema, searchPathHash, backendPid, connectionMode };
}

export type DirectConsistencyProbe = {
  requestId: string;
  timestamp: string;
  businessId: string;
  orm: {
    findUniqueFound: boolean;
    findFirstFound: boolean;
    findManyCount: number;
    relationFound: boolean;
    organizationId: string | null;
  };
  raw: {
    found: boolean;
    organizationId: string | null;
  };
  consistency: {
    sameResult: boolean;
  };
};

export async function buildDirectConsistencyProbe(businessId: string): Promise<DirectConsistencyProbe> {
  const requestId = randomUUID();
  const timestamp = new Date().toISOString();

  const result = await prisma.$transaction(async (tx) => {
    const [uniqueResult, firstResult, manyResults, withRelation] = await Promise.all([
      tx.business.findUnique({ where: { id: businessId }, select: { id: true, organizationId: true } }),
      tx.business.findFirst({ where: { id: businessId }, select: { id: true, organizationId: true } }),
      tx.business.findMany({ where: { id: businessId }, select: { id: true, organizationId: true } }),
      tx.business.findFirst({ where: { id: businessId }, include: { organization: { select: { id: true } } } }),
    ]);

    let rawFound = false;
    let rawOrganizationId: string | null = null;
    try {
      const rawRows = await tx.$queryRaw<Array<{ id: string; organizationId: string | null }>>`
        SELECT id, organizationId FROM "Business" WHERE id = ${businessId} LIMIT 1
      `;
      const rawRow = rawRows[0];
      rawFound = Boolean(rawRow);
      rawOrganizationId = rawRow?.organizationId ?? null;
    } catch {
      rawFound = false;
      rawOrganizationId = null;
    }

    const uniqueFound = Boolean(uniqueResult);
    const firstFound = Boolean(firstResult);
    const manyCount = manyResults.length;
    const relationFound = Boolean(withRelation?.organization?.id);

    const organizationId = uniqueResult?.organizationId ?? firstResult?.organizationId ?? manyResults[0]?.organizationId ?? null;
    const sameResult = (uniqueFound === firstFound && firstFound === (manyCount > 0) && relationFound === Boolean(organizationId)) && organizationId === rawOrganizationId;

    return {
      orm: { findUniqueFound: uniqueFound, findFirstFound: firstFound, findManyCount: manyCount, relationFound, organizationId },
      raw: { found: rawFound, organizationId: rawOrganizationId },
      consistency: { sameResult },
    };
  });

  return { requestId, timestamp, businessId, ...result };
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
