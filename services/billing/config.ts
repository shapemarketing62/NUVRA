import type { PlanTier } from "@/lib/plans";

const parsedDays = Number(process.env.BILLING_TRIAL_DAYS || 14);
export const BILLING_CONFIG = {
  trialDays: Number.isFinite(parsedDays) ? Math.max(0, Math.min(parsedDays, 90)) : 14,
  trialPlans: new Set<PlanTier>(["PRO"]),
  displayPrices: { FREE: "Sin cargo", PRO: process.env.PRO_PRICE_LABEL || "Próximamente", PARTNER: process.env.PARTNER_PRICE_LABEL || "Próximamente" },
} as const;
