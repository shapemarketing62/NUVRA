import { MockBillingProvider } from "./mock-billing-provider";
import { SubscriptionService } from "./subscription-service";

export const billingProvider = new MockBillingProvider();
export const subscriptionService = new SubscriptionService(billingProvider);
export const mockBillingEnabled = (process.env.APP_ENV || "development") !== "production" && (process.env.BILLING_PROVIDER || "mock") === "mock";
