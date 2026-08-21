import "server-only";
import { prisma } from "@/lib/prisma";
export const AUDIT_ACTIONS = {
  login: "auth.login", logout: "auth.logout", passwordChanged: "auth.password_changed",
  businessCreated: "business.created", businessDeleted: "business.deleted",
  memberAdded: "membership.added", memberRemoved: "membership.removed", roleChanged: "membership.role_changed",
  organizationChanged: "organization.changed", planChanged: "organization.plan_changed",
  integrationConnected: "integration.connected", integrationDisconnected: "integration.disconnected",
} as const;
const FORBIDDEN_KEYS = /password|token|secret|key|authorization|cookie/i;
function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 30).map(sanitize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !FORBIDDEN_KEYS.test(key)).map(([key, item]) => [key, sanitize(item)]));
  if (typeof value === "string") return value.slice(0, 500);
  return value;
}
export async function writeAuditEvent(input: { actorUserId?: string; organizationId?: string; action: string; targetType: string; targetId?: string; metadata?: Record<string, unknown> }) {
  await prisma.auditLog.create({ data: { actorUserId: input.actorUserId, organizationId: input.organizationId, action: input.action, targetType: input.targetType, targetId: input.targetId, metadata: input.metadata ? JSON.stringify(sanitize(input.metadata)) : undefined } });
}
