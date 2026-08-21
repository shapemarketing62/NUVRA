import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

export type IntegrationProvider = "google_places" | "instagram" | "google_business_profile" | "google_analytics" | "google_search_console" | "x";

function masterKey() {
  const raw = process.env.INTEGRATION_MASTER_KEY;
  if (!raw) throw new Error("Integration secret store unavailable");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("Integration secret store unavailable");
  return key;
}

function aad(organizationId: string, provider: string) { return Buffer.from(`${organizationId}:${provider}:v1`); }

export function encryptIntegrationSecret(data: Record<string, string>, organizationId: string, provider: IntegrationProvider) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  cipher.setAAD(aad(organizationId, provider));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptIntegrationSecret(payload: string, organizationId: string, provider: IntegrationProvider) {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Invalid encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "base64url"));
  decipher.setAAD(aad(organizationId, provider));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8")) as Record<string, string>;
}

export async function storeIntegrationSecret(input: { organizationId: string; businessId?: string; provider: IntegrationProvider; values: Record<string, string> }) {
  const encryptedData = encryptIntegrationSecret(input.values, input.organizationId, input.provider);
  const existing = await prisma.integrationSecret.findFirst({
    where: { organizationId: input.organizationId, businessId: input.businessId ?? null, provider: input.provider },
    select: { id: true },
  });
  const data = { encryptedData, status: "connected", keyVersion: "v1" };
  return existing
    ? prisma.integrationSecret.update({ where: { id: existing.id }, data, select: { id: true, provider: true, status: true, updatedAt: true } })
    : prisma.integrationSecret.create({ data: { ...data, organizationId: input.organizationId, businessId: input.businessId, provider: input.provider }, select: { id: true, provider: true, status: true, updatedAt: true } });
}

export async function readIntegrationSecret(input: { organizationId: string; businessId?: string; provider: IntegrationProvider }) {
  const record = await prisma.integrationSecret.findFirst({ where: { organizationId: input.organizationId, businessId: input.businessId ?? null, provider: input.provider }, select: { encryptedData: true } });
  return record ? decryptIntegrationSecret(record.encryptedData, input.organizationId, input.provider) : null;
}

export async function deleteIntegrationSecret(input: { organizationId: string; businessId?: string; provider: IntegrationProvider }) {
  return prisma.integrationSecret.deleteMany({ where: { organizationId: input.organizationId, businessId: input.businessId ?? null, provider: input.provider } });
}
