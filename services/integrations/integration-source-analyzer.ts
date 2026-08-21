import type { Business } from "@prisma/client";
import { SourceAnalyzer, type SourceEvidence, type SourceRelevance, type SourceType } from "@/services/intelligence/source-analyzer";
import { IntegrationManager } from "./integration-manager";
import type { IntegrationProvider } from "./contracts";

export class IntegrationSourceAnalyzer extends SourceAnalyzer {
  requiresAuth = true;
  requiresPermission = true;
  constructor(public readonly type: SourceType, private readonly provider: IntegrationProvider, private readonly manager = new IntegrationManager()) { super(); }
  isAvailable(business: Business) { return Boolean(business.organizationId); }
  isRelevant(business: Business): SourceRelevance {
    const text = `${business.rubro || ""} ${business.canales || ""}`.toLowerCase();
    if (this.provider === "x") { const relevant = /tecnolog|software|saas|noticias|media|finanzas|twitter|\bx\b/.test(text); return { source: this.type, relevant, weight: relevant ? 0.1 : 0, reason: relevant ? "X es relevante para la conversación de este negocio." : "X no es una fuente prioritaria para este negocio." }; }
    const relevant = Boolean(business.instagramHandle) || /instagram|caf[eé]|restaurante|moda|belleza|retail|b2c/.test(text);
    return { source: this.type, relevant, weight: relevant ? 0.2 : 0, reason: relevant ? "Instagram aporta actividad y engagement del negocio." : "Instagram no es una fuente prioritaria para este negocio." };
  }
  async analyze(business: Business): Promise<SourceEvidence> {
    if (!business.organizationId) throw new Error("Business without organization");
    return this.manager.sync({ organizationId: business.organizationId, businessId: business.id, provider: this.provider });
  }
}
