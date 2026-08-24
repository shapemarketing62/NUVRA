import type { AggregatedEvidence } from "../evidence-aggregator.ts";
import { ReputationIntelligence, type PublicCommentInput } from "../reputation-intelligence.ts";
import type { EvidenceFinding, SourceType } from "../source-analyzer.ts";

const socialSources: SourceType[] = ["x", "tiktok", "reddit", "facebook", "linkedin", "youtube"];

export function enrichCrossSourceReputation(aggregated: AggregatedEvidence, objective = "") {
  const comments: PublicCommentInput[] = [];
  const reviews = (aggregated.sources.reviews?.data as any)?.reputation?.accepted || [];
  comments.push(...reviews.map((item: any) => ({ ...item, source: item.source || "google_maps" })));
  for (const source of socialSources) {
    const data = aggregated.sources[source]?.data as any;
    if (Array.isArray(data?.comments)) comments.push(...data.comments);
  }
  const reputation = ReputationIntelligence.analyze(comments, { objective });
  const findings: EvidenceFinding[] = reputation.platformDifferences.filter((difference) => difference.confidence >= .55).map((difference) => ({
    id: `cross-source:${difference.topic}`,
    category: "posicionamiento",
    type: "neutral",
    impact: difference.recent ? "high" : "medium",
    evidence: `${difference.evidence} No conviene promediar ambas señales sin revisar el cambio por plataforma.`,
    source: "other",
    attribution: [...difference.positiveSources, ...difference.negativeSources].join(" + "),
    weight: Math.min(.65, difference.confidence),
    confidence: difference.confidence >= .72 ? "ALTA" : "MEDIA",
    reputationEvidenceConfidence: difference.confidence,
    reputationTopic: difference.topic,
  }));
  for (const finding of findings) addFinding(aggregated, finding);
  (aggregated as AggregatedEvidence & { crossSourceReputation?: typeof reputation }).crossSourceReputation = reputation;
  return reputation;
}

function addFinding(aggregated: AggregatedEvidence, finding: EvidenceFinding) {
  if (aggregated.findings.some((item) => item.id === finding.id)) return;
  aggregated.findings.push(finding); aggregated.deduplicated.push(finding);
  (aggregated.byCategory[finding.category] ||= []).push(finding);
  (aggregated.byDimension[finding.category] ||= []).push(finding);
}
