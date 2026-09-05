import "server-only";
import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { roleCan } from "@/lib/access-policy";
import {
  compareBusinessIdStrings,
  readBusinessTableSnapshot,
  readTransactionContext,
  type BusinessTableSnapshot,
  type TransactionContext,
} from "./authorization";

export type InternalAuditComparisonUser = {
  internalRole?: string | null;
  memberships: Array<{ organizationId: string; role: string }>;
};

export type AuthorizedAuditCandidate = {
  id: string;
  name: string;
  organizationId: string;
  createdAt: Date | string;
  latestAnalysisAt: Date | string | null;
};

type BusinessRead = { id: string; organizationId: string | null };
type SafeBusinessRead = { found: boolean; organizationId: string | null };

export type SingleRequestComparison = {
  transactionContext: TransactionContext;
  businessTableSnapshot: Pick<BusinessTableSnapshot, "count" | "latestCreatedAt">;
  nameLookup: { found: boolean; candidateId: string | null; organizationId: string | null };
  inputVsDbId: {
    strictEqual: boolean;
    inputLength: number;
    dbLength: number | null;
    inputHash: string;
    dbHash: string | null;
    firstDifferentIndex: number | null;
    inputCodePointAtDifference: number | null;
    dbCodePointAtDifference: number | null;
  };
  ormByInputId: SafeBusinessRead;
  ormByDbCandidateId: SafeBusinessRead;
  rawByInputId: SafeBusinessRead;
  rawByDbCandidateId: SafeBusinessRead;
  rawNameLookup: { found: boolean; candidateId: string | null };
  rawCombinedIds: BusinessRead[];
  conclusionFlags: {
    sameString: boolean;
    ormResultsAgree: boolean;
    rawResultsAgree: boolean;
    ormVsRawAgree: boolean;
    nameLookupAgreesWithRaw: boolean;
  };
};

export type SingleRequestComparisonResult =
  | { ok: true; comparison: SingleRequestComparison }
  | { ok: false; reason: "forbidden" | "not_found" };

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function safeRead(row: BusinessRead | null | undefined, authorizedOrganizationIds: Set<string>): SafeBusinessRead {
  if (!row?.organizationId || !authorizedOrganizationIds.has(row.organizationId)) {
    return { found: false, organizationId: null };
  }
  return { found: true, organizationId: row.organizationId };
}

function sameRead(left: SafeBusinessRead, right: SafeBusinessRead): boolean {
  return left.found === right.found && left.organizationId === right.organizationId;
}

export async function findAuthorizedAuditBusinesses(
  db: Prisma.TransactionClient | typeof prisma,
  exactName: string,
  authorizedOrganizationIds: string[],
): Promise<AuthorizedAuditCandidate[]> {
  const matches = await db.business.findMany({
    where: { nombre: exactName, organizationId: { in: authorizedOrganizationIds } },
    select: {
      id: true,
      nombre: true,
      organizationId: true,
      createdAt: true,
      analysisHistory: { orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }], take: 1, select: { createdAt: true } },
    },
    orderBy: [{ updatedAt: "desc" as const }, { id: "desc" as const }],
    take: 11,
  });

  return matches.flatMap((match) => match.organizationId ? [{
    id: match.id,
    name: match.nombre,
    organizationId: match.organizationId,
    createdAt: match.createdAt,
    latestAnalysisAt: match.analysisHistory[0]?.createdAt || null,
  }] : []);
}

export async function buildSingleRequestComparison(input: {
  user: InternalAuditComparisonUser;
  inputBusinessId: string;
  exactName: string;
}): Promise<SingleRequestComparisonResult> {
  if (input.user.internalRole !== "INTERNAL") return { ok: false, reason: "forbidden" };

  const authorizedOrganizationIds = input.user.memberships
    .filter((membership) => roleCan(membership.role, "business.read"))
    .map((membership) => membership.organizationId);
  if (!authorizedOrganizationIds.length) return { ok: false, reason: "forbidden" };
  const authorizedOrganizations = new Set(authorizedOrganizationIds);

  return prisma.$transaction(async (tx) => {
    const transactionContext = await readTransactionContext(tx);
    const snapshot = await readBusinessTableSnapshot(tx, null);
    const nameMatches = await findAuthorizedAuditBusinesses(tx, input.exactName, authorizedOrganizationIds);
    const dbCandidate = nameMatches[0] || null;
    if (!dbCandidate) return { ok: false as const, reason: "not_found" as const };

    const dbCandidateId = dbCandidate.id;
    const difference = compareBusinessIdStrings(input.inputBusinessId, dbCandidateId);

    const [ormInputRow, ormCandidateRow] = await Promise.all([
      tx.business.findUnique({ where: { id: input.inputBusinessId }, select: { id: true, organizationId: true } }),
      tx.business.findUnique({ where: { id: dbCandidateId }, select: { id: true, organizationId: true } }),
    ]);

    const [rawInputRows, rawCandidateRows, rawCombinedRows, rawNameRows] = await Promise.all([
      tx.$queryRaw<BusinessRead[]>`
        SELECT "id", "organizationId" FROM "Business" WHERE "id" = ${input.inputBusinessId} LIMIT 1
      `,
      tx.$queryRaw<BusinessRead[]>`
        SELECT "id", "organizationId" FROM "Business" WHERE "id" = ${dbCandidateId} LIMIT 1
      `,
      tx.$queryRaw<BusinessRead[]>`
        SELECT "id", "organizationId" FROM "Business" WHERE "id" IN (${input.inputBusinessId}, ${dbCandidateId})
      `,
      tx.$queryRaw<Array<BusinessRead & { nombre: string }>>`
        SELECT "id", "organizationId", "nombre"
        FROM "Business"
        WHERE "nombre" = ${input.exactName} AND "id" = ${dbCandidateId}
        LIMIT 1
      `,
    ]);

    const ormByInputId = safeRead(ormInputRow, authorizedOrganizations);
    const ormByDbCandidateId = safeRead(ormCandidateRow, authorizedOrganizations);
    const rawByInputId = safeRead(rawInputRows[0], authorizedOrganizations);
    const rawByDbCandidateId = safeRead(rawCandidateRows[0], authorizedOrganizations);
    const rawNameCandidate = rawNameRows.find((row) => row.id === dbCandidateId && row.organizationId !== null && authorizedOrganizations.has(row.organizationId));
    const rawCombinedIds = rawCombinedRows.filter((row) => row.organizationId !== null && authorizedOrganizations.has(row.organizationId));
    const strictEqual = input.inputBusinessId === dbCandidateId;
    const nameLookupAgreesWithRaw = Boolean(rawNameCandidate)
      && rawNameCandidate?.id === dbCandidateId
      && rawNameCandidate.organizationId === dbCandidate.organizationId;

    return {
      ok: true as const,
      comparison: {
        transactionContext,
        businessTableSnapshot: { count: snapshot.count, latestCreatedAt: snapshot.latestCreatedAt },
        nameLookup: { found: true, candidateId: dbCandidateId, organizationId: dbCandidate.organizationId },
        inputVsDbId: {
          strictEqual,
          inputLength: input.inputBusinessId.length,
          dbLength: dbCandidateId.length,
          inputHash: hash(input.inputBusinessId),
          dbHash: hash(dbCandidateId),
          ...difference,
        },
        ormByInputId,
        ormByDbCandidateId,
        rawByInputId,
        rawByDbCandidateId,
        rawNameLookup: { found: Boolean(rawNameCandidate), candidateId: rawNameCandidate?.id || null },
        rawCombinedIds,
        conclusionFlags: {
          sameString: strictEqual,
          ormResultsAgree: sameRead(ormByInputId, ormByDbCandidateId) && ormInputRow?.id === ormCandidateRow?.id,
          rawResultsAgree: sameRead(rawByInputId, rawByDbCandidateId) && rawInputRows[0]?.id === rawCandidateRows[0]?.id,
          ormVsRawAgree: sameRead(ormByInputId, rawByInputId)
            && sameRead(ormByDbCandidateId, rawByDbCandidateId)
            && ormInputRow?.id === rawInputRows[0]?.id
            && ormCandidateRow?.id === rawCandidateRows[0]?.id,
          nameLookupAgreesWithRaw,
        },
      },
    };
  });
}
