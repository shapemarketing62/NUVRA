import "server-only";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { BILLING_CONFIG } from "./config";
import { PLAN_DEFINITIONS, getPlanSnapshot, type PlanTier, type UsageLimitKey } from "@/lib/plans";
import type { BillingInterval, BillingProvider, SubscriptionStatus } from "./types";
import { writeAuditEvent } from "@/lib/server/audit";

const ALLOWED_PLANS = new Set<PlanTier>(["FREE", "PRO", "PARTNER"]);
export class SubscriptionService {
  constructor(private readonly provider: BillingProvider) {}

  async getSubscription(organizationId: string, now = new Date()) {
    let subscription = await prisma.subscription.findUnique({ where: { organizationId } });
    if (!subscription) subscription = await prisma.subscription.create({ data: { organizationId, plan: "FREE", status: "free" } });
    const trialExpired = subscription.status === "trialing" && subscription.trialEndsAt && subscription.trialEndsAt <= now;
    const canceledExpired = subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd && subscription.currentPeriodEnd <= now;
    if (trialExpired || canceledExpired) subscription = await this.applyPlan(organizationId, "FREE", trialExpired ? "expired" : "canceled", { currentPeriodEnd: now, cancelAtPeriodEnd: false });
    return subscription;
  }

  async startTrial(input: { actorUserId: string; organizationId: string; plan: PlanTier; now?: Date }) {
    if (!BILLING_CONFIG.trialPlans.has(input.plan) || BILLING_CONFIG.trialDays <= 0) throw new Error("trial_unavailable");
    const current = await this.getSubscription(input.organizationId, input.now); if (current.trialStartedAt) throw new Error("trial_already_used");
    const started = input.now || new Date(); const ends = new Date(started.getTime() + BILLING_CONFIG.trialDays * 86_400_000);
    const result = await this.applyPlan(input.organizationId, input.plan, "trialing", { trialStartedAt: started, trialEndsAt: ends, currentPeriodStart: started, currentPeriodEnd: ends });
    await this.audit(input.actorUserId, input.organizationId, "subscription.trial_started", result.id, { plan: input.plan }); return result;
  }

  async changePlan(input: { actorUserId: string; organizationId: string; plan: PlanTier; billingInterval?: BillingInterval }) {
    if (!ALLOWED_PLANS.has(input.plan)) throw new Error("invalid_plan"); const current = await this.getSubscription(input.organizationId);
    if (input.plan === "FREE") { const result = await this.applyPlan(input.organizationId, "FREE", "free", { cancelAtPeriodEnd: false, canceledAt: new Date(), currentPeriodEnd: new Date() }); await this.audit(input.actorUserId, input.organizationId, "subscription.plan_changed", result.id, { from: current.plan, to: "FREE" }); return result; }
    let providerSubscription;
    if (current.externalSubscriptionId && current.billingProvider === this.provider.key) providerSubscription = await this.provider.changePlan({ externalSubscriptionId: current.externalSubscriptionId, plan: input.plan });
    else providerSubscription = await this.provider.createSubscription({ organizationId: input.organizationId, plan: input.plan, billingInterval: input.billingInterval || "monthly", customerId: current.externalCustomerId || undefined });
    const result = await this.applyPlan(input.organizationId, input.plan, providerSubscription.status, { billingInterval: providerSubscription.billingInterval, currentPeriodStart: providerSubscription.currentPeriodStart, currentPeriodEnd: providerSubscription.currentPeriodEnd, externalCustomerId: providerSubscription.externalCustomerId, externalSubscriptionId: providerSubscription.externalSubscriptionId, billingProvider: this.provider.key, cancelAtPeriodEnd: false, canceledAt: null });
    await this.audit(input.actorUserId, input.organizationId, "subscription.plan_changed", result.id, { from: current.plan, to: input.plan }); return result;
  }

  async cancel(input: { actorUserId: string; organizationId: string }) { const current = await this.getSubscription(input.organizationId); if (!current.externalSubscriptionId) return this.changePlan({ ...input, plan: "FREE" }); await this.provider.cancelSubscription({ externalSubscriptionId: current.externalSubscriptionId, atPeriodEnd: true }); const result = await prisma.subscription.update({ where: { organizationId: input.organizationId }, data: { cancelAtPeriodEnd: true, canceledAt: new Date() } }); await this.audit(input.actorUserId, input.organizationId, "subscription.canceled", result.id); return result; }
  async reactivate(input: { actorUserId: string; organizationId: string }) { const current = await this.getSubscription(input.organizationId); if (!current.externalSubscriptionId || !current.cancelAtPeriodEnd) throw new Error("subscription_not_reactivatable"); await this.provider.reactivateSubscription({ externalSubscriptionId: current.externalSubscriptionId }); const result = await prisma.subscription.update({ where: { organizationId: input.organizationId }, data: { cancelAtPeriodEnd: false, canceledAt: null, status: "active" } }); await this.audit(input.actorUserId, input.organizationId, "subscription.reactivated", result.id); return result; }

  async summary(organizationId: string) { const subscription = await this.getSubscription(organizationId); const plan = getPlanSnapshot(subscription.plan); const periodKey = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth()+1).padStart(2,"0")}`; const [businesses,teamMembers,analyses,reports]=await Promise.all([prisma.business.count({where:{organizationId}}),prisma.membership.count({where:{organizationId}}),prisma.usageEvent.aggregate({where:{organizationId,kind:"analysis",periodKey},_sum:{quantity:true}}),prisma.usageEvent.aggregate({where:{organizationId,kind:"report",periodKey},_sum:{quantity:true}})]); const used:Partial<Record<UsageLimitKey,number>>={businesses,teamMembers,monthlyAnalyses:analyses._sum.quantity||0,monthlyReports:reports._sum.quantity||0}; const usage=Object.fromEntries(Object.entries(plan.limits).map(([key,limit])=>{const consumed=used[key as UsageLimitKey]||0;return[key,{used:consumed,limit,remaining:Math.max(0,limit-consumed),overLimit:consumed>limit}]})); return { subscription, plan, usage, developmentMode: this.provider.key === "mock" }; }

  async handleWebhook(payload: string, signature: string | null) { const event = await this.provider.handleWebhook(payload, signature); const payloadHash=createHash("sha256").update(payload).digest("hex"); const existing=await prisma.billingWebhookEvent.findUnique({where:{provider_eventId:{provider:this.provider.key,eventId:event.id}}}); if(existing)return{duplicate:true}; return prisma.$transaction(async(tx)=>{await tx.billingWebhookEvent.create({data:{provider:this.provider.key,eventId:event.id,eventType:event.type,organizationId:event.organizationId,occurredAt:event.occurredAt,payloadHash,status:"processing"}}); const current=await tx.subscription.findUnique({where:{organizationId:event.organizationId}}); if(current?.lastProviderEventAt&&current.lastProviderEventAt>event.occurredAt){await tx.billingWebhookEvent.update({where:{provider_eventId:{provider:this.provider.key,eventId:event.id}},data:{status:"ignored_out_of_order",processedAt:new Date()}});return{duplicate:false,ignored:true};} if(event.subscription?.plan&&ALLOWED_PLANS.has(event.subscription.plan)){const status=(event.subscription.status||"active") as SubscriptionStatus;await tx.subscription.upsert({where:{organizationId:event.organizationId},create:{organizationId:event.organizationId,plan:event.subscription.plan,status,lastProviderEventAt:event.occurredAt,billingProvider:this.provider.key},update:{plan:event.subscription.plan,status,lastProviderEventAt:event.occurredAt}});await tx.organization.update({where:{id:event.organizationId},data:{planTier:event.subscription.plan}});} await tx.billingWebhookEvent.update({where:{provider_eventId:{provider:this.provider.key,eventId:event.id}},data:{status:"processed",processedAt:new Date()}});return{duplicate:false,ignored:false};}); }

  private async applyPlan(organizationId:string,plan:PlanTier,status:SubscriptionStatus,extra:Record<string,unknown>){const counts=await Promise.all([prisma.business.count({where:{organizationId}}),prisma.membership.count({where:{organizationId}})]);const limits=PLAN_DEFINITIONS[plan].limits;const limitState=JSON.stringify({businesses:{used:counts[0],limit:limits.businesses,exceededBy:Math.max(0,counts[0]-limits.businesses)},teamMembers:{used:counts[1],limit:limits.teamMembers,exceededBy:Math.max(0,counts[1]-limits.teamMembers)}});return prisma.$transaction(async tx=>{const subscription=await tx.subscription.upsert({where:{organizationId},create:{organizationId,plan,status,limitState,...extra},update:{plan,status,limitState,...extra}});await tx.organization.update({where:{id:organizationId},data:{planTier:plan,subscriptionStatus:status,currentPeriodEnd:subscription.currentPeriodEnd}});return subscription;});}
  private audit(actorUserId:string,organizationId:string,action:string,targetId:string,metadata?:Record<string,unknown>){return writeAuditEvent({actorUserId,organizationId,action,targetType:"subscription",targetId,metadata});}
}
