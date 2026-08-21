import "server-only";
import { prisma } from "@/lib/prisma";
import { deleteIntegrationSecret, readIntegrationSecret, storeIntegrationSecret } from "@/lib/server/integration-secrets";
import { AUDIT_ACTIONS, writeAuditEvent } from "@/lib/server/audit";
import { INTEGRATION_CATALOG } from "./catalog";
import { integrationProviders } from "./providers";
import { emptyEvidence, type IntegrationProvider, type IntegrationStatus } from "./contracts";

const SECRET_KEY = /token|secret|password|authorization|cookie|key/i;
function safeMetadata(value: Record<string, unknown> = {}) { return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET_KEY.test(key)).slice(0, 30)); }
function statusFor(record: { status: string; expiresAt: Date | null }): IntegrationStatus { return record.expiresAt && record.expiresAt <= new Date() ? "expired" : record.status as IntegrationStatus; }

export class IntegrationManager {
  async list(organizationId: string, businessId: string) {
    const records = await prisma.integration.findMany({ where: { organizationId, OR: [{ businessId }, { businessId: null }] }, orderBy: { updatedAt: "desc" } });
    return INTEGRATION_CATALOG.map((definition) => {
      const record = records.find((item) => item.provider === definition.provider && (item.businessId === businessId || item.businessId === null));
      const adapter = integrationProviders[definition.provider];
      const defaultStatus: IntegrationStatus = adapter.configured() ? (definition.provider === "google_places" ? "connected" : "requires_auth") : "unavailable";
      return { ...definition, id: record?.id, status: record ? statusFor(record) : defaultStatus, connectedAt: record?.connectedAt, lastSyncAt: record?.lastSyncAt, expiresAt: record?.expiresAt };
    });
  }

  async connect(input: { actorUserId: string; organizationId: string; businessId: string; provider: IntegrationProvider; credentials?: Record<string, string>; expiresAt?: Date; metadata?: Record<string, unknown> }) {
    const adapter = integrationProviders[input.provider];
    if (!adapter.configured()) return this.setState(input, "unavailable");
    if (input.provider !== "google_places" && !input.credentials) return this.setState(input, "requires_auth");
    if (input.credentials) await storeIntegrationSecret({ organizationId: input.organizationId, businessId: input.businessId, provider: input.provider, values: input.credentials });
    const integration = await this.setState(input, "connected", { connectedAt: new Date(), expiresAt: input.expiresAt, scopes: JSON.stringify(adapter.requiredScopes) });
    await writeAuditEvent({ actorUserId: input.actorUserId, organizationId: input.organizationId, action: AUDIT_ACTIONS.integrationConnected, targetType: "integration", targetId: integration.id, metadata: { provider: input.provider, businessId: input.businessId } });
    return integration;
  }

  async disconnect(input: { actorUserId: string; organizationId: string; businessId: string; provider: IntegrationProvider }) {
    await deleteIntegrationSecret(input);
    const integration = await this.setState(input, "disconnected", { connectedAt: null, expiresAt: null, scopes: null });
    await writeAuditEvent({ actorUserId: input.actorUserId, organizationId: input.organizationId, action: AUDIT_ACTIONS.integrationDisconnected, targetType: "integration", targetId: integration.id, metadata: { provider: input.provider, businessId: input.businessId } });
    return integration;
  }

  async sync(input: { organizationId: string; businessId: string; provider: IntegrationProvider }) {
    const adapter = integrationProviders[input.provider];
    const business = await prisma.business.findFirst({ where: { id: input.businessId, organizationId: input.organizationId } });
    if (!business) throw new Error("forbidden");
    const record = await prisma.integration.findFirst({ where: { organizationId: input.organizationId, businessId: input.businessId, provider: input.provider } });
    let credentials = await readIntegrationSecret(input);
    if (record?.expiresAt && record.expiresAt <= new Date()) {
      const refreshed = credentials && adapter.refresh ? await adapter.refresh({ organizationId: input.organizationId, business, credentials, metadata: record.metadata ? JSON.parse(record.metadata) : {} }) : null;
      if (!refreshed) { await this.setState(input, "expired"); return emptyEvidence(adapter.sourceType, "requires_auth", "La autorización venció."); }
      await storeIntegrationSecret({ ...input, values: refreshed.credentials }); credentials = refreshed.credentials; await this.setState(input, "connected", { expiresAt: refreshed.expiresAt });
    }
    try {
      const result = await adapter.sync({ organizationId: input.organizationId, business, credentials, metadata: record?.metadata ? JSON.parse(record.metadata) : {} });
      const status: IntegrationStatus = result.evidence.status === "evaluated" ? "connected" : result.evidence.status === "requires_auth" ? "requires_auth" : "unavailable";
      await this.setState(input, status, { lastSyncAt: new Date(), expiresAt: result.expiresAt, metadata: JSON.stringify(safeMetadata(result.metadata)) });
      return result.evidence;
    } catch {
      await this.setState(input, "error", { lastSyncAt: new Date(), lastErrorCode: "provider_failed" });
      return emptyEvidence(adapter.sourceType, "unavailable", "La fuente no respondió. El análisis puede continuar con las demás fuentes.");
    }
  }

  private async setState(input: { organizationId: string; businessId: string; provider: IntegrationProvider; metadata?: Record<string, unknown> }, status: IntegrationStatus, extra: Record<string, unknown> = {}) {
    const existing = await prisma.integration.findFirst({ where: { organizationId: input.organizationId, businessId: input.businessId, provider: input.provider }, select: { id: true } });
    const data = { status, metadata: JSON.stringify(safeMetadata(input.metadata)), ...extra };
    return existing ? prisma.integration.update({ where: { id: existing.id }, data }) : prisma.integration.create({ data: { organizationId: input.organizationId, businessId: input.businessId, provider: input.provider, ...data } });
  }
}
