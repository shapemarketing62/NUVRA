import { validateAndNormalizeUrl, UrlValidationError } from "../website-analyzer/url-validator.ts";
import { parseInstagramProfile } from "../../lib/instagram-profile.ts";

const ALLOWED_ASSET_KEYS = new Set(["web", "instagram", "tiktok", "maps"]);
const MAX_STRING_VALUE = 2048;

function isValidTikTokHandle(value: string): boolean {
  const clean = value.trim().replace(/^@/, "");
  return /^[a-zA-Z0-9._]{1,30}$/.test(clean);
}

export async function applyAssetDecisions(result: any, decisions: Array<{ key: string; observedValue: string; userConfirmation: string; userValue?: string }>) {
  if (!decisions || !decisions.length) return result;
  const next = { ...result };
  for (const decision of decisions) {
    if (!ALLOWED_ASSET_KEYS.has(decision.key)) continue;
    if (decision.userConfirmation === "rejected") {
      if (decision.key === "web") next.primaryWebUrl = null;
      if (decision.key === "instagram") next.primaryInstagram = null;
      if (decision.key === "tiktok") next.primaryTikTok = null;
      if (decision.key === "maps") next.primaryGoogleMaps = null;
      continue;
    }
    if ((decision.userConfirmation !== "confirmed" && decision.userConfirmation !== "needs_update") || !decision.userValue) continue;
    const trimmed = decision.userValue.trim();
    if (!trimmed || trimmed.length > MAX_STRING_VALUE) continue;
    if (decision.key === "web") {
      try {
        next.primaryWebUrl = await validateAndNormalizeUrl(trimmed);
      } catch {
        next.primaryWebUrl = null;
      }
    }
    if (decision.key === "instagram") {
      const parsed = parseInstagramProfile(trimmed);
      if (parsed) next.primaryInstagram = parsed.handle;
    }
    if (decision.key === "tiktok") {
      if (isValidTikTokHandle(trimmed)) next.primaryTikTok = trimmed.replace(/^@/, "").toLowerCase();
    }
    if (decision.key === "maps") {
      next.primaryGoogleMaps = trimmed.slice(0, 240);
    }
  }
  return next;
}
