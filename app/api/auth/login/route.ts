import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/server/password";
import { createSession } from "@/lib/server/session";
import { apiError, handleApiError, readJsonBody } from "@/lib/server/api-response";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { writeAuditEvent } from "@/lib/server/audit";
const schema = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(128) });
export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!(await checkRateLimit(`login:${ip}`, 10, 15 * 60_000)).allowed) return apiError("rate_limited", 429);
    const input = schema.parse(await readJsonBody(request, 8_000));
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || user.disabledAt || !(await verifyPassword(input.password, user.passwordHash))) return apiError("unauthorized", 401);
    await createSession(user.id, { userAgent: request.headers.get("user-agent") || undefined, ip });
    const membership = await prisma.membership.findFirst({ where: { userId: user.id }, select: { organizationId: true } });
    await writeAuditEvent({ actorUserId: user.id, organizationId: membership?.organizationId, action: "auth.login", targetType: "user", targetId: user.id });
    return Response.json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) { return handleApiError(error); }
}
