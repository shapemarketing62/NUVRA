import { destroySession, getCurrentUser } from "@/lib/server/session";
import { writeAuditEvent } from "@/lib/server/audit";
export async function POST() { const user = await getCurrentUser(); await destroySession(); if (user) await writeAuditEvent({ actorUserId: user.id, organizationId: user.memberships[0]?.organizationId, action: "auth.logout", targetType: "user", targetId: user.id }); return Response.json({ success: true }); }
