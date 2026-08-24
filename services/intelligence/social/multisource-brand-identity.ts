import { BrandIdentityAnalyzer } from "../../website-analyzer/brand-identity-analyzer.ts";
import type { BrandIdentityAnalysis, BrandIdentityAspect, BrandIdentitySourceEvidence } from "../../website-analyzer/types.ts";
import type { AggregatedEvidence } from "../evidence-aggregator.ts";
import type { EvidenceFinding, SourceType } from "../source-analyzer.ts";

const socialSources: SourceType[] = ["x", "tiktok", "facebook", "linkedin", "youtube"];

export function enrichMultisourceBrandIdentity(aggregated: AggregatedEvidence): BrandIdentityAnalysis | null {
  const webData = aggregated.sources.web?.data as any;
  const base = webData?.brandIdentity as BrandIdentityAnalysis | undefined;
  const sources: BrandIdentitySourceEvidence[] = [];
  if (base?.coverage?.evaluatedAspects?.length) {
    const aspects: Partial<Record<BrandIdentityAspect, number>> = {};
    for (const aspect of base.coverage.evaluatedAspects) aspects[aspect] = base.performanceScore;
    sources.push({ source: "web", aspects, evidence: base.evidence || [], contradictions: base.problems || [], observedPeriods: base.coverage.observedPeriods || 1 });
  }
  for (const source of socialSources) {
    const evidence = (aggregated.sources[source]?.data as any)?.brandIdentityEvidence as BrandIdentitySourceEvidence | undefined;
    if (evidence && Object.keys(evidence.aspects || {}).length) sources.push(evidence);
  }
  if (!sources.length) return base || null;
  const combined = BrandIdentityAnalyzer.analyze([], sources);
  if (webData && typeof webData === "object") webData.brandIdentity = combined;
  else if (aggregated.sources.web) aggregated.sources.web.data = { brandIdentity: combined };
  (aggregated as AggregatedEvidence & { multisourceBrandIdentity?: BrandIdentityAnalysis }).multisourceBrandIdentity = combined;
  if (sources.length >= 2 && combined.evidenceConfidence >= .55) {
    const finding: EvidenceFinding = {
      id: "multisource-brand-identity",
      category: "identidad",
      type: combined.coverage.contradictionCount >= 2 ? "neutral" : "positive",
      impact: "medium",
      evidence: combined.coverage.contradictionCount >= 2 ? `La identidad observada presenta diferencias entre ${sources.map((item) => item.source).join(", ")}.` : `La identidad mantiene señales consistentes entre ${sources.map((item) => item.source).join(", ")}.`,
      source: "other",
      attribution: sources.map((item) => item.source).join(" + "),
      weight: .5,
      confidence: combined.evidenceConfidence >= .78 ? "ALTA" : "MEDIA",
    };
    addFinding(aggregated, finding);
  }
  return combined;
}

function addFinding(aggregated: AggregatedEvidence, finding: EvidenceFinding) {
  if (aggregated.findings.some((item) => item.id === finding.id)) return;
  aggregated.findings.push(finding); aggregated.deduplicated.push(finding);
  (aggregated.byCategory[finding.category] ||= []).push(finding);
  (aggregated.byDimension[finding.category] ||= []).push(finding);
}
