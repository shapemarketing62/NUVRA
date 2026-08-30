import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ACTION_STATUSES, normalizeActionStatus, transitionActionStatus } from "@/lib/action-execution";
import { getUsageLimit } from "@/lib/plans";
import { apiError, handleApiError, readJsonBody } from "@/lib/server/api-response";
import { AUDIT_ACTIONS, writeAuditEvent } from "@/lib/server/audit";
import { authorizeBusiness } from "@/lib/server/authorization";
import { hasInternalAccess } from "@/lib/server/internal-access";

const payloadSchema = z.object({ status: z.enum(ACTION_STATUSES) }).strict();
const idSchema = z.string().min(1).max(100);

export async function PATCH(request: Request, context: { params: { id: string } }) {
  try {
    const actionId = idSchema.parse(context.params.id);
    const input = payloadSchema.parse(await readJsonBody(request, 1_000));
    const action = await prisma.strategicAction.findUnique({
      where: { id: actionId },
      include: { strategy: { select: { id: true, businessId: true } } },
    });
    if (!action) return apiError("not_found", 404);

    const access = await authorizeBusiness(action.strategy.businessId, "business.update", "tracking.progress");
    if (!access.ok) return apiError(access.reason, access.reason === "unauthorized" ? 401 : 403);

    const currentStrategy = await prisma.strategy.findFirst({
      where: { businessId: action.strategy.businessId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    if (!currentStrategy || currentStrategy.id !== action.strategyId) return apiError("forbidden", 403);

    if (!hasInternalAccess(access.user)) {
      const limit = getUsageLimit(access.organization.planTier, "activeActions");
      const visible = await prisma.strategicAction.findMany({
        where: { strategyId: action.strategyId },
        orderBy: [{ order: "asc" }, { id: "asc" }],
        take: limit,
        select: { id: true },
      });
      if (!visible.some((item) => item.id === action.id)) return apiError("forbidden", 403);
    }

    const previousStatus = normalizeActionStatus(action);
    const next = transitionActionStatus(action, input.status);
    const updated = await prisma.strategicAction.update({
      where: { id: action.id },
      data: next,
      select: { id: true, status: true, done: true, startedAt: true, completedAt: true, updatedAt: true },
    });

    if (previousStatus !== next.status) {
      try {
        await writeAuditEvent({
          actorUserId: access.user.id,
          organizationId: access.organization.id,
          action: AUDIT_ACTIONS.actionStatusChanged,
          targetType: "strategic_action",
          targetId: action.id,
          metadata: { businessId: action.strategy.businessId, strategyId: action.strategyId, from: previousStatus, to: next.status },
        });
      } catch {
        // La acción ya quedó persistida; un fallo secundario de auditoría no debe devolver un estado falso al cliente.
      }
    }

    return Response.json({ action: updated }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleApiError(error);
  }
}
