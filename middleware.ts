import { NextRequest, NextResponse } from "next/server";
const SESSION_COOKIE = "nuvra_session";
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/") && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    if (process.env.NODE_ENV === "production" && (!origin || !host)) return NextResponse.json({ error: { code: "forbidden", message: "No tenés permiso para realizar esta acción." } }, { status: 403 });
    if (origin && host) { try { if (new URL(origin).host !== host) return NextResponse.json({ error: { code: "forbidden", message: "No tenés permiso para realizar esta acción." } }, { status: 403 }); } catch { return NextResponse.json({ error: { code: "forbidden", message: "No tenés permiso para realizar esta acción." } }, { status: 403 }); } }
  }
  if (!request.nextUrl.pathname.startsWith("/dashboard") && request.nextUrl.pathname !== "/onboarding" && request.nextUrl.pathname !== "/analyze") return NextResponse.next();
  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    const login = new URL("/login", request.url); login.searchParams.set("next", request.nextUrl.pathname); return NextResponse.redirect(login);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/dashboard/:path*", "/onboarding", "/analyze", "/api/:path*"] };
