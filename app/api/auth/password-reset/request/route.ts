import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSecureToken } from "@/lib/server/secure-token";
import { apiError, handleApiError, readJsonBody } from "@/lib/server/api-response";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { accountEmailService } from "@/services/email";
import { getServerEnv } from "@/lib/server/env";
const schema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });
export async function POST(request: Request) { try {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`reset-request:${ip}`, 5, 15 * 60_000)).allowed) return apiError("rate_limited", 429);
  const { email } = schema.parse(await readJsonBody(request, 4_000)); const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } });
  let recoveryUrl: string | undefined;
  if (user) { await prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }); const value = createSecureToken(); await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: value.hash, expiresAt: new Date(Date.now() + 60 * 60_000) } }); const emailUrl=`${new URL(request.url).origin}/reset-password?token=${encodeURIComponent(value.token)}`; await accountEmailService.sendPasswordReset({to:user.email,name:user.name,url:emailUrl}); if (["development","test"].includes(getServerEnv().APP_ENV)) recoveryUrl = emailUrl; }
  return Response.json({ success: true, message: "Si la cuenta existe, vas a recibir instrucciones.", ...(recoveryUrl ? { recoveryUrl } : {}) });
} catch (error) { return handleApiError(error); } }
