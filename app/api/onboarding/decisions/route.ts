import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setAssetDecisions } from "@/lib/server/asset-decisions";
import { authorizeBusiness } from "@/lib/server/authorization";
import { apiError } from "@/lib/server/api-response";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return apiError("validation_error", 400);
    const businessId = z.string().min(1).max(100).parse(body?.businessId);
    const access = await authorizeBusiness(businessId, "business.update");
    if (!access.ok) return apiError(access.reason, access.reason === "unauthorized" ? 401 : 403);
    const assets = z.array(z.object({
      key: z.string(),
      observedValue: z.string(),
      userConfirmation: z.enum(["confirmed", "rejected", "needs_update"]),
      userValue: z.string().optional(),
    })).parse(body?.assets || []);
    setAssetDecisions(businessId, assets);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError("validation_error", 400);
  }
}
