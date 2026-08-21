import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildInstagramOAuthUrl, getInstagramConfigStatus } from "@/services/instagram/meta-oauth";
import { apiError, handleApiError, readJsonBody } from "@/lib/server/api-response";
import { authorizeBusiness } from "@/lib/server/authorization";
import { z } from "zod";
import { requiresVerifiedEmail } from "@/lib/server/verification-policy";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId || businessId.length > 100) return apiError("validation_error", 400);
  const access = await authorizeBusiness(businessId, "business.read");
  if (!access.ok) return apiError(access.reason, access.reason === "unauthorized" ? 401 : 403);

  const config = getInstagramConfigStatus();
  const connection = await prisma.instagramConnection.findUnique({ where: { businessId } });

  return NextResponse.json({
    configured: config.configured,
    status: connection?.status || "not_configured",
    igUsername: connection?.igUsername,
    message: config.configured
      ? "La conexión está disponible."
      : "La integración todavía no está disponible.",
  });
}

export async function POST(req: NextRequest) {
  try {
  const { businessId } = z.object({ businessId: z.string().min(1).max(100) }).parse(await readJsonBody(req, 4_000));
  const access = await authorizeBusiness(businessId, "business.update", "integrations.standard");
  if (!access.ok) return apiError(access.reason, access.reason === "unauthorized" ? 401 : 403);
  if (requiresVerifiedEmail("integration.connect") && !access.user.emailVerifiedAt) return apiError("forbidden", 403);

  const config = getInstagramConfigStatus();
  if (!config.configured) {
    return NextResponse.json(
      {
        error: "Integración pendiente",
        status: "not_configured",
      },
      { status: 503 }
    );
  }

  const oauthUrl = buildInstagramOAuthUrl(businessId, access.user.id);
  if (!oauthUrl) {
    return NextResponse.json({ error: "No se pudo generar URL OAuth" }, { status: 500 });
  }

  return NextResponse.json({ oauthUrl });
  } catch (error) { return handleApiError(error); }
}
