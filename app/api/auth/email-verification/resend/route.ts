import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/authorization";
import { createSecureToken } from "@/lib/server/secure-token";
import { apiError, handleApiError } from "@/lib/server/api-response";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { accountEmailService } from "@/services/email";
import { getServerEnv } from "@/lib/server/env";
export async function POST(request: Request) { try { const auth = await requireUser(); if (!auth.ok) return apiError("unauthorized", 401); if (auth.user.emailVerifiedAt) return Response.json({ success: true, alreadyVerified: true }); if (!(await checkRateLimit(`verify-resend:${auth.user.id}`, 3, 60 * 60_000)).allowed) return apiError("rate_limited", 429); await prisma.emailVerificationToken.updateMany({ where: { userId: auth.user.id, usedAt: null }, data: { usedAt: new Date() } }); const value = createSecureToken(); await prisma.emailVerificationToken.create({ data: { userId: auth.user.id, tokenHash: value.hash, expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } }); const emailUrl=`${new URL(request.url).origin}/verify-email?token=${encodeURIComponent(value.token)}`;await accountEmailService.sendVerification({to:auth.user.email,name:auth.user.name,url:emailUrl});const verificationUrl = ["development","test"].includes(getServerEnv().APP_ENV) ? emailUrl : undefined; return Response.json({ success: true, ...(verificationUrl ? { verificationUrl } : {}) }); } catch (error) { return handleApiError(error); } }
