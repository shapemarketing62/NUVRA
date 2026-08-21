import { NextRequest, NextResponse } from "next/server";
import { analyzeWebsite } from "@/services/website-analyzer";
import { z } from "zod";
import { apiError, handleApiError, readJsonBody } from "@/lib/server/api-response";
import { authorizeBusiness } from "@/lib/server/authorization";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { requiresVerifiedEmail } from "@/lib/server/verification-policy";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { url, businessId } = z.object({ url: z.string().url().max(2048), businessId: z.string().min(1).max(100) }).parse(await readJsonBody(req, 8_000));
    const access = await authorizeBusiness(businessId, "analysis.run", "analysis.basic");
    if (!access.ok) return apiError(access.reason, access.reason === "unauthorized" ? 401 : 403);
    if (requiresVerifiedEmail("analysis.run") && !access.user.emailVerifiedAt) return apiError("forbidden", 403);
    if (!(await checkRateLimit(`website:${access.user.id}`, 5, 60_000)).allowed) return apiError("rate_limited", 429);

    const result = await analyzeWebsite(url);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.name === "UrlValidationError") return apiError("validation_error", 400);
    return handleApiError(err);
  }
}
