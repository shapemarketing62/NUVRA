import type { Business } from "@prisma/client";
import type { SourceEvidence, SourceType } from "@/services/intelligence/source-analyzer";
import type { IntegrationProvider } from "@/lib/server/integration-secrets";

export type IntegrationStatus = "connected" | "disconnected" | "requires_auth" | "expired" | "error" | "unavailable";
export type { IntegrationProvider };

export interface IntegrationContext {
  organizationId: string;
  business: Business;
  credentials: Record<string, string> | null;
  metadata: Record<string, unknown>;
}

export interface IntegrationSyncResult {
  evidence: SourceEvidence;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface IntegrationProviderAdapter {
  key: IntegrationProvider;
  sourceType: SourceType;
  configured(): boolean;
  requiredScopes: readonly string[];
  sync(context: IntegrationContext): Promise<IntegrationSyncResult>;
  refresh?(context: IntegrationContext): Promise<{ credentials: Record<string, string>; expiresAt: Date } | null>;
}

export function emptyEvidence(source: SourceType, status: "unavailable" | "requires_auth" | "not_relevant", reason: string): SourceEvidence {
  return { source, status, data: null, findings: [], confidence: "INSUFICIENTE", coverage: 0, evaluatedAt: new Date(), requiresAuth: status === "requires_auth", metadata: { reason } };
}
