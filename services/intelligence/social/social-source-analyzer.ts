import type { Business } from "@prisma/client";
import { SourceAnalyzer, type EvidenceFinding, type SourceAnalysisContext, type SourceEvidence } from "../source-analyzer.ts";
import { ReputationIntelligence } from "../reputation-intelligence.ts";
import { PublicContentAnalyzer } from "./public-content-analyzer.ts";
import { SourceRelevancePlanner } from "./source-relevance-planner.ts";
import type { SocialBusinessTarget, SocialSourceProvider } from "./social-source-provider.ts";

type BusinessWithGoals = Business & { goals?: Array<{ objetivo?: string }> };

export class SocialPlatformSourceAnalyzer extends SourceAnalyzer {
  readonly type;
  readonly requiresAuth = false;
  readonly requiresPermission = false;
  readonly provider: SocialSourceProvider;
  constructor(provider: SocialSourceProvider) { super(); this.provider = provider; this.type = provider.platform; }
  isAvailable() { return true; }
  isRelevant(business: Business) {
    const plan = SourceRelevancePlanner.forPlatform(toTarget(business as BusinessWithGoals), this.provider.platform);
    return { source: this.type, relevant: plan.relevant, reason: plan.reasons.join("; "), weight: plan.score };
  }

  async analyze(business: Business, context: SourceAnalysisContext = {}): Promise<SourceEvidence> {
    const target = toTarget(business as BusinessWithGoals);
    const plan = SourceRelevancePlanner.forPlatform(target, this.provider.platform);
    const result = await this.provider.collect(target, context);
    if (!result.entityValidated || !["discovered", "partial", "analyzed"].includes(result.status)) return {
      source: this.type, status: result.status === "requires_auth" ? "requires_auth" : "unavailable", data: result, findings: [], confidence: "INSUFICIENTE", coverage: 0, evaluatedAt: new Date(), requiresAuth: result.status === "requires_auth", metadata: socialMetadata(result, plan),
    };
    if (result.status === "discovered") return { source: this.type, status: "unavailable", data: result, findings: [], confidence: "INSUFICIENTE", coverage: 0, evaluatedAt: new Date(), requiresAuth: false, metadata: socialMetadata(result, plan) };
    const publicContent = PublicContentAnalyzer.analyze(this.provider.platform, result, target);
    const reputation = ReputationIntelligence.analyze(result.comments, { objective: target.objective || "" });
    const findings: EvidenceFinding[] = [...publicContent.findings];
    for (const topic of reputation.strengths.slice(0, 4)) findings.push(reputationFinding(this.type, topic, "positive", result.urls[0], result.acquisitionMethods[0]));
    for (const topic of reputation.problems.slice(0, 4)) findings.push(reputationFinding(this.type, topic, "negative", result.urls[0], result.acquisitionMethods[0]));
    return {
      source: this.type,
      status: "evaluated",
      data: { ...result, publicContent, reputation },
      findings,
      confidence: result.entityConfidence >= .9 && result.coverage >= 55 ? "ALTA" : "MEDIA",
      coverage: result.coverage,
      evaluatedAt: new Date(),
      requiresAuth: false,
      metadata: socialMetadata(result, plan),
    };
  }
}

function toTarget(business: BusinessWithGoals): SocialBusinessTarget {
  return { businessId: business.id, name: business.nombre, industry: business.rubro, location: business.ubicacion || business.ciudad, website: business.webUrl, customerType: business.tipoCliente, objective: business.goals?.[0]?.objetivo, declaredChannels: `${business.canales || ""} ${business.otrosCanales || ""}` };
}

function reputationFinding(source: EvidenceFinding["source"], topic: ReturnType<typeof ReputationIntelligence.analyze>["topics"][number], type: "positive" | "negative", url?: string, acquisitionMethod?: EvidenceFinding["acquisitionMethod"]): EvidenceFinding {
  return {
    id: `${source}:reputation:${topic.name}:${type}`,
    category: type === "negative" ? "retencion" : "posicionamiento",
    type,
    impact: topic.commercialImpact >= .75 ? "high" : "medium",
    evidence: type === "negative" ? `${topic.independentAuthors} voces independientes mencionan “${topic.name}” en ${source}; la señal es ${topic.trend}.` : `${topic.independentAuthors} voces independientes destacan “${topic.name}” en ${source}.`,
    source,
    attribution: url || `Conversación pública en ${source}`,
    weight: Math.min(.75, topic.commercialImpact),
    confidence: topic.evidenceConfidence >= .7 ? "ALTA" : "MEDIA",
    reputationEvidenceConfidence: topic.evidenceConfidence,
    reputationTopic: topic.name,
    acquisitionMethod,
  };
}

function socialMetadata(result: Awaited<ReturnType<SocialSourceProvider["collect"]>>, plan: ReturnType<typeof SourceRelevancePlanner.forPlatform>) {
  return { purpose: result.platform, planner: plan, finalStatus: result.status, entityConfidence: result.entityConfidence, entityValidated: result.entityValidated, accountsFound: result.identity ? 1 : 0, acceptedContent: result.acceptedContentIds.length, rejectedContent: result.rejectedContentIds.length, comments: result.comments.length, limitations: result.limitations, errors: result.errors, acquisitionMethods: result.acquisitionMethods, sourceCoverage: result.sourceCoverage, acquisitionReport: result.acquisitionReport };
}
