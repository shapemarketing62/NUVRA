export type InstagramConnectionStatus =
  | "not_configured"
  | "disconnected"
  | "connected"
  | "expired"
  | "error";

export function getInstagramConfigStatus(): {
  configured: boolean;
  missingVars: string[];
} {
  const missing: string[] = [];
  if (!process.env.META_APP_ID) missing.push("META_APP_ID");
  if (!process.env.META_APP_SECRET) missing.push("META_APP_SECRET");
  if (!process.env.META_REDIRECT_URI) missing.push("META_REDIRECT_URI");
  return { configured: missing.length === 0, missingVars: missing };
}

function signState(payload: string) { return createHmac("sha256", process.env.META_APP_SECRET || "").update(payload).digest("base64url"); }
export function createInstagramOAuthState(businessId: string, userId: string) { const payload = Buffer.from(JSON.stringify({ businessId, userId, expiresAt: Date.now() + 10 * 60_000 })).toString("base64url"); return `${payload}.${signState(payload)}`; }
export function verifyInstagramOAuthState(state: string) { try { const [payload, signature] = state.split("."); if (!payload || !signature) return null; const expected = signState(payload); if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null; const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); return value.expiresAt > Date.now() && typeof value.businessId === "string" && typeof value.userId === "string" ? value as { businessId: string; userId: string; expiresAt: number } : null; } catch { return null; } }

export function buildInstagramOAuthUrl(businessId: string, userId: string): string | null {
  const { configured } = getInstagramConfigStatus();
  if (!configured) return null;

  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: process.env.META_REDIRECT_URI!,
    scope: [
      "instagram_basic",
      "instagram_manage_insights",
      "pages_show_list",
      "pages_read_engagement",
    ].join(","),
    response_type: "code",
    state: createInstagramOAuthState(businessId, userId),
  });

  return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
}

export async function exchangeInstagramCode(_code: string): Promise<{
  accessToken: string;
  expiresIn: number;
  igUserId?: string;
} | null> {
  const { configured } = getInstagramConfigStatus();
  if (!configured) return null;

  // Full token exchange will be implemented when Meta credentials are available.
  // Do NOT simulate a successful connection.
  return null;
}

export interface InstagramAnalysisInput {
  igUsername?: string;
  profileData?: Record<string, unknown>;
  mediaData?: Record<string, unknown>[];
}

export function analyzeInstagramData(input: InstagramAnalysisInput): {
  findings: Array<{
    type: string;
    category: string;
    title: string;
    evidence: string;
    confidence: string;
  }>;
  status: "no_data" | "analyzed";
} {
  if (!input.profileData && !input.mediaData) {
    return {
      status: "no_data",
      findings: [
        {
          type: "info",
          category: "redes",
          title: "Instagram no conectado",
          evidence: "No hay datos de Instagram disponibles. Conectá tu cuenta profesional cuando las credenciales Meta estén configuradas.",
          confidence: "alta",
        },
      ],
    };
  }

  return { status: "analyzed", findings: [] };
}
import { createHmac, timingSafeEqual } from "crypto";
