const decisions = new Map<string, {
  assets: Array<{
    key: string;
    observedValue: string;
    userConfirmation: "confirmed" | "rejected" | "needs_update";
    userValue?: string;
  }>;
  updatedAt: number;
}>();

const TTL_MS = 1000 * 60 * 60 * 24;

export function setAssetDecisions(businessId: string, assets: Array<{
  key: string;
  observedValue: string;
  userConfirmation: "confirmed" | "rejected" | "needs_update";
  userValue?: string;
}>) {
  decisions.set(businessId, { assets, updatedAt: Date.now() });
}

export function getAssetDecisions(businessId: string) {
  const entry = decisions.get(businessId);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > TTL_MS) {
    decisions.delete(businessId);
    return null;
  }
  return entry.assets;
}

export function clearAssetDecisions(businessId: string) {
  decisions.delete(businessId);
}
