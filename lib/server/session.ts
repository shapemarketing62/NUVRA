import "server-only";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "nuvra_session";
const SESSION_DAYS = 30;
import { hashToken } from "./secure-token";
const MAX_SESSIONS = Math.max(1, Math.min(Number(process.env.MAX_ACTIVE_SESSIONS || 5), 20));

export async function createSession(userId: string, metadata?: { userAgent?: string; ip?: string }) {
  await prisma.authSession.deleteMany({ where: { OR: [{ expiresAt: { lte: new Date() } }, { userId, createdAt: { lt: new Date(Date.now() - 90 * 86_400_000) } }] } });
  const active = await prisma.authSession.findMany({ where: { userId, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" }, select: { id: true } });
  if (active.length >= MAX_SESSIONS) await prisma.authSession.deleteMany({ where: { id: { in: active.slice(MAX_SESSIONS - 1).map((item) => item.id) } } });
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.authSession.create({ data: { tokenHash: hashToken(token), userId, expiresAt, userAgent: metadata?.userAgent?.slice(0, 300), ipHash: metadata?.ip ? hashToken(metadata.ip) : undefined } });
  cookies().set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt });
}

export async function destroySession() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) await prisma.authSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  cookies().set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: new Date(0) });
}

export async function getCurrentUser() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.authSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { include: { memberships: { include: { organization: true } } } } } });
  if (!session || session.expiresAt <= new Date() || session.user.disabledAt) return null;
  return session.user;
}

export async function getCurrentSessionId() { const token = cookies().get(SESSION_COOKIE)?.value; if (!token) return null; return (await prisma.authSession.findUnique({ where: { tokenHash: hashToken(token) }, select: { id: true } }))?.id || null; }
export async function cleanupExpiredSessions() { return prisma.authSession.deleteMany({ where: { expiresAt: { lte: new Date() } } }); }
