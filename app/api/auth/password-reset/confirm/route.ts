import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/server/secure-token";
import { hashPassword } from "@/lib/server/password";
import { apiError, handleApiError, readJsonBody } from "@/lib/server/api-response";
import { writeAuditEvent } from "@/lib/server/audit";
const schema = z.object({ token: z.string().min(32).max(200), password: z.string().min(10).max(128) });
export async function POST(request: Request) { try {
  const input = schema.parse(await readJsonBody(request, 8_000)); const reset = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(input.token) }, include: { user: { include: { memberships: { take: 1 } } } } });
  if (!reset || reset.usedAt || reset.expiresAt <= new Date()) return apiError("validation_error", 400, [{ field: "token", message: "El enlace venció o ya fue utilizado." }]);
  const passwordHash = await hashPassword(input.password);
  await prisma.$transaction([prisma.user.update({ where: { id: reset.userId }, data: { passwordHash } }), prisma.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } }), prisma.authSession.deleteMany({ where: { userId: reset.userId } })]);
  await writeAuditEvent({ actorUserId: reset.userId, organizationId: reset.user.memberships[0]?.organizationId, action: "auth.password_changed", targetType: "user", targetId: reset.userId });
  return Response.json({ success: true });
} catch (error) { return handleApiError(error); } }
