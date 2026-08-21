import { NextRequest, NextResponse } from "next/server";
import { exchangeInstagramCode, getInstagramConfigStatus, verifyInstagramOAuthState } from "@/services/instagram/meta-oauth";
import { authorizeBusiness } from "@/lib/server/authorization";
import { IntegrationManager } from "@/services/integrations/integration-manager";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/dashboard/config?ig_error=${error}`, req.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/dashboard/config?ig_error=missing_params", req.url));
  }
  const oauthState = verifyInstagramOAuthState(state);
  if (!oauthState) return NextResponse.redirect(new URL("/dashboard/configuracion?ig_error=invalid_state", req.url));
  const access = await authorizeBusiness(oauthState.businessId, "business.update", "integrations.standard");
  if (!access.ok) return NextResponse.redirect(new URL("/login", req.url));
  if (access.user.id !== oauthState.userId) return NextResponse.redirect(new URL("/dashboard/configuracion?ig_error=invalid_state", req.url));

  const config = getInstagramConfigStatus();
  if (!config.configured) {
    return NextResponse.redirect(new URL("/dashboard/config?ig_error=not_configured", req.url));
  }

  const tokens = await exchangeInstagramCode(code);
  if (!tokens) {
    return NextResponse.redirect(
      new URL("/dashboard/config?ig_error=token_exchange_not_implemented", req.url)
    );
  }

  await new IntegrationManager().connect({ actorUserId: access.user.id, organizationId: access.organization.id, businessId: oauthState.businessId, provider: "instagram", credentials: { accessToken: tokens.accessToken }, expiresAt: new Date(Date.now() + tokens.expiresIn * 1000), metadata: { igUserId: tokens.igUserId } });

  return NextResponse.redirect(new URL(`/dashboard/config?ig_connected=1`, req.url));
}
