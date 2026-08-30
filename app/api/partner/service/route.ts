import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/server/api-response";
import { authorizeBusiness } from "@/lib/server/authorization";

export async function GET(request: NextRequest) {
  try {
    const businessId = z.string().min(1).max(100).parse(request.nextUrl.searchParams.get("businessId"));
    const access = await authorizeBusiness(businessId, "business.read", "workspace.overview");
    if (!access.ok) return apiError(access.reason, access.reason === "unauthorized" ? 401 : 403);

    return Response.json({
      service: {
        status: "pending",
        nextDeliverable: null,
        activeWork: [],
        milestones: [],
        clientNeeds: [],
        nextReviewAt: null,
        results: [],
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
