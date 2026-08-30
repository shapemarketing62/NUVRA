import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/server/api-response";
import { authorizeBusiness } from "@/lib/server/authorization";
import { hasInternalAccess } from "@/lib/server/internal-access";
import { getUsageLimit } from "@/lib/plans";
import { buildDashboardViewModel } from "@/lib/dashboard-view-model";
import { roleCan } from "@/lib/access-policy";

export async function GET(req: NextRequest) {
  try {
    const businessId = req.nextUrl.searchParams.get("businessId");
    if (!businessId || businessId.length > 100) return apiError("validation_error", 400);

    const access = await authorizeBusiness(businessId, "business.read");
    if (!access.ok) return apiError(access.reason, access.reason === "unauthorized" ? 401 : 403);

    const internalAccess = hasInternalAccess(access.user);
    const actionLimit = internalAccess ? undefined : getUsageLimit(access.organization.planTier, "activeActions");
    const competitorLimit = internalAccess ? undefined : getUsageLimit(access.organization.planTier, "visibleCompetitors");
    const historyLimit = internalAccess ? undefined : Math.max(1, getUsageLimit(access.organization.planTier, "historicalMonths"));

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        goals: { where: { isActive: true }, orderBy: { createdAt: "desc" }, take: 1 },
        scores: { orderBy: { createdAt: "desc" }, take: 1, include: { dimensions: true } },
        diagnoses: { orderBy: { createdAt: "desc" }, take: 1 },
        strategies: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          ...(historyLimit === undefined ? {} : { take: Math.max(1, historyLimit) }),
          include: {
            diagnosis: true,
            actions: { orderBy: [{ order: "asc" }, { id: "asc" }], ...(actionLimit === undefined ? {} : { take: actionLimit }) },
          },
        },
        analysisHistory: { orderBy: { createdAt: "desc" }, ...(historyLimit === undefined ? {} : { take: historyLimit }) },
        analysisRuns: { orderBy: { queuedAt: "desc" }, take: 1 },
      },
    });

    if (!business) return apiError("not_found", 404);

    const viewModel = buildDashboardViewModel({
      ...business,
      planTier: access.organization.planTier,
      internalAccess,
    }, {
      competitorLimit,
      canUpdateActions: roleCan(access.membership.role, "business.update"),
      canUpdateBusiness: roleCan(access.membership.role, "business.update"),
    });

    return NextResponse.json(viewModel, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
