import type { PlanTier } from "@/lib/plans";

export type SubscriptionStatus = "free" | "trialing" | "active" | "past_due" | "canceled" | "expired";
export type BillingInterval = "monthly" | "yearly";
export interface CheckoutRequest { organizationId: string; plan: Exclude<PlanTier, "FREE">; billingInterval: BillingInterval; customerId?: string; }
export interface ProviderSubscription { externalSubscriptionId: string; externalCustomerId: string; plan: PlanTier; status: SubscriptionStatus; billingInterval: BillingInterval; currentPeriodStart: Date; currentPeriodEnd: Date; }
export interface BillingWebhookEvent { id: string; type: string; organizationId: string; occurredAt: Date; subscription?: Partial<ProviderSubscription>; }

export interface BillingProvider {
  readonly key: string;
  createCustomer(input: { organizationId: string; email?: string }): Promise<{ customerId: string }>;
  createCheckout(input: CheckoutRequest): Promise<{ checkoutId: string; checkoutUrl: string }>;
  createSubscription(input: CheckoutRequest): Promise<ProviderSubscription>;
  changePlan(input: { externalSubscriptionId: string; plan: PlanTier }): Promise<ProviderSubscription>;
  cancelSubscription(input: { externalSubscriptionId: string; atPeriodEnd: boolean }): Promise<ProviderSubscription>;
  reactivateSubscription(input: { externalSubscriptionId: string }): Promise<ProviderSubscription>;
  getSubscription(input: { externalSubscriptionId: string }): Promise<ProviderSubscription | null>;
  handleWebhook(payload: string, signature: string | null): Promise<BillingWebhookEvent>;
}
