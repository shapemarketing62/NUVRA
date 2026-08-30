import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, handleApiError, readJsonBody } from "@/lib/server/api-response";
import { authorizeBusiness } from "@/lib/server/authorization";
import { requiresVerifiedEmail } from "@/lib/server/verification-policy";
import { IntegrationManager } from "@/services/integrations/integration-manager";
import { buildInstagramOAuthUrl } from "@/services/instagram/meta-oauth";

const provider = z.enum(["google_places", "instagram", "google_business_profile", "google_analytics", "google_search_console", "x"]);
const manager = new IntegrationManager();

export async function GET(req: NextRequest) {
  try {
    const businessId = z.string().min(1).max(100).parse(req.nextUrl.searchParams.get("businessId"));
    const access = await authorizeBusiness(businessId, "business.read", "integrations.standard");
    if (!access.ok) return apiError(access.reason, access.reason === "unauthorized" ? 401 : 403);
    return Response.json({ integrations: await manager.list(access.organization.id, businessId) });
  } catch (error) { return handleApiError(error); }
}

export async function POST(req: NextRequest) {
  try {
    const input = z.object({ businessId: z.string().min(1).max(100), provider }).parse(await readJsonBody(req, 4_000));
    const access = await authorizeBusiness(input.businessId, "business.update", "integrations.standard");
    if (!access.ok) return apiError(access.reason, access.reason === "unauthorized" ? 401 : 403);
    if (requiresVerifiedEmail("integration.connect") && !access.user.emailVerifiedAt) return apiError("forbidden", 403);
    if (input.provider === "instagram") {
      const authorizationUrl = buildInstagramOAuthUrl(input.businessId, access.user.id);
      if (!authorizationUrl) { await manager.connect({ actorUserId: access.user.id, organizationId: access.organization.id, businessId: input.businessId, provider: input.provider }); return Response.json({ status: "unavailable" }, { status: 503 }); }
      return Response.json({ status: "requires_auth", authorizationUrl });
    }
    const integration = await manager.connect({ actorUserId: access.user.id, organizationId: access.organization.id, businessId: input.businessId, provider: input.provider });
    return Response.json({ status: integration.status });
  } catch (error) { return handleApiError(error); }
}

export async function PATCH(req: NextRequest) {
  try {
    const input = z.object({ businessId: z.string().min(1).max(100), provider }).parse(await readJsonBody(req, 4_000));
    const access = await authorizeBusiness(input.businessId, "analysis.run", "integrations.standard");
    if (!access.ok) return apiError(access.reason, access.reason === "unauthorized" ? 401 : 403);
    return Response.json({ evidence: await manager.sync({ organizationId: access.organization.id, businessId: input.businessId, provider: input.provider }) });
  } catch (error) { return handleApiError(error); }
}

export async function DELETE(req: NextRequest) {
  try {
    const input = z.object({ businessId: z.string().min(1).max(100), provider }).parse(await readJsonBody(req, 4_000));
    const access = await authorizeBusiness(input.businessId, "business.update", "integrations.standard");
    if (!access.ok) return apiError(access.reason, access.reason === "unauthorized" ? 401 : 403);
    await manager.disconnect({ actorUserId: access.user.id, organizationId: access.organization.id, businessId: input.businessId, provider: input.provider });
    return Response.json({ success: true });
  } catch (error) { return handleApiError(error); }
}
