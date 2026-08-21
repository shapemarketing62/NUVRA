import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/server/secure-token";
import { apiError, handleApiError, readJsonBody } from "@/lib/server/api-response";
const schema = z.object({ token: z.string().min(32).max(200) });
export async function POST(request: Request) { try { const { token } = schema.parse(await readJsonBody(request, 4_000)); const item = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(token) } }); if (!item || item.usedAt || item.expiresAt <= new Date()) return apiError("validation_error", 400); await prisma.$transaction([prisma.user.update({ where: { id: item.userId }, data: { emailVerifiedAt: new Date() } }), prisma.emailVerificationToken.update({ where: { id: item.id }, data: { usedAt: new Date() } })]); return Response.json({ success: true }); } catch (error) { return handleApiError(error); } }
