import { getCurrentUser } from "@/lib/server/session";
import { apiError } from "@/lib/server/api-response";
export async function GET() { const user = await getCurrentUser(); if (!user) return apiError("unauthorized", 401); return Response.json({ user: { id: user.id, email: user.email, name: user.name }, organizations: user.memberships.map((item) => ({ id: item.organization.id, name: item.organization.name, role: item.role, planTier: item.organization.planTier })) }); }
