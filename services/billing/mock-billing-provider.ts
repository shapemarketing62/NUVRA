import { createHash, randomUUID } from "crypto";
import type { BillingProvider, BillingWebhookEvent, CheckoutRequest, ProviderSubscription } from "./types";
import type { PlanTier } from "@/lib/plans";

export class MockBillingProvider implements BillingProvider {
  readonly key = "mock"; private subscriptions = new Map<string, ProviderSubscription>();
  async createCustomer(_input: { organizationId: string; email?: string }) { return { customerId: `mock_customer_${randomUUID()}` }; }
  async createCheckout(input: CheckoutRequest) { return { checkoutId: `mock_checkout_${randomUUID()}`, checkoutUrl: `/dashboard/configuracion?billing=mock&plan=${input.plan}` }; }
  async createSubscription(input: CheckoutRequest) { const now = new Date(); const customer = input.customerId || (await this.createCustomer({ organizationId: input.organizationId })).customerId; const value: ProviderSubscription = { externalSubscriptionId: `mock_subscription_${randomUUID()}`, externalCustomerId: customer, plan: input.plan, status: "active", billingInterval: input.billingInterval, currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + (input.billingInterval === "yearly" ? 365 : 30) * 86_400_000) }; this.subscriptions.set(value.externalSubscriptionId, value); return value; }
  async changePlan(input: { externalSubscriptionId: string; plan: PlanTier }) { const current = this.required(input.externalSubscriptionId); const updated = { ...current, plan: input.plan }; this.subscriptions.set(input.externalSubscriptionId, updated); return updated; }
  async cancelSubscription(input: { externalSubscriptionId: string; atPeriodEnd: boolean }) { const current = this.required(input.externalSubscriptionId); const updated = { ...current, status: input.atPeriodEnd ? "active" as const : "canceled" as const }; this.subscriptions.set(input.externalSubscriptionId, updated); return updated; }
  async reactivateSubscription(input: { externalSubscriptionId: string }) { const current = this.required(input.externalSubscriptionId); const updated = { ...current, status: "active" as const }; this.subscriptions.set(input.externalSubscriptionId, updated); return updated; }
  async getSubscription(input: { externalSubscriptionId: string }) { return this.subscriptions.get(input.externalSubscriptionId) || null; }
  async handleWebhook(payload: string, signature: string | null): Promise<BillingWebhookEvent> { if (signature !== "mock-signature") throw new Error("invalid_signature"); const parsed = JSON.parse(payload); if (!parsed.id || !parsed.type || !parsed.organizationId || !parsed.occurredAt) throw new Error("invalid_webhook"); return { id: String(parsed.id), type: String(parsed.type), organizationId: String(parsed.organizationId), occurredAt: new Date(parsed.occurredAt), subscription: parsed.subscription }; }
  payloadHash(payload: string) { return createHash("sha256").update(payload).digest("hex"); }
  private required(id: string) { const value = this.subscriptions.get(id); if (!value) throw new Error("subscription_not_found"); return value; }
}
