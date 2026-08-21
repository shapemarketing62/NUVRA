import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/server/password";
import { createSession } from "@/lib/server/session";
import { apiError, handleApiError, readJsonBody } from "@/lib/server/api-response";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { createSecureToken } from "@/lib/server/secure-token";
import { writeAuditEvent } from "@/lib/server/audit";
import { accountEmailService } from "@/services/email";
import { getServerEnv } from "@/lib/server/env";

const schema = z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(10).max(128) });
export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!(await checkRateLimit(`register:${ip}`, 5, 15 * 60_000)).allowed) return apiError("rate_limited", 429);
    const input = schema.parse(await readJsonBody(request, 8_000));
    if (await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })) return apiError("validation_error", 409, [{ field: "email", message: "Este email ya está registrado." }]);
    const passwordHash = await hashPassword(input.password);
    const suffix = crypto.randomUUID().slice(0, 8);
    const user = await prisma.user.create({ data: { email: input.email, name: input.name, passwordHash, memberships: { create: { role: "owner", organization: { create: { name: `${input.name}`, slug: `workspace-${suffix}`, planTier: "FREE" } } } } }, select: { id: true, email: true, name: true } });
    const membership = await prisma.membership.findFirstOrThrow({ where: { userId: user.id } });
    const verification = createSecureToken(); await prisma.emailVerificationToken.create({ data: { userId: user.id, tokenHash: verification.hash, expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } });
    await createSession(user.id, { userAgent: request.headers.get("user-agent") || undefined, ip });
    await writeAuditEvent({ actorUserId: user.id, organizationId: membership.organizationId, action: "auth.registered", targetType: "user", targetId: user.id });
    const emailUrl = `${new URL(request.url).origin}/verify-email?token=${encodeURIComponent(verification.token)}`;
    await accountEmailService.sendVerification({ to: user.email, name: user.name, url: emailUrl });
    const verificationUrl = ["development", "test"].includes(getServerEnv().APP_ENV) ? emailUrl : undefined;
    return Response.json({ user, ...(verificationUrl ? { verificationUrl } : {}) }, { status: 201 });
  } catch (error) { return handleApiError(error); }
}
