import type { CommercialEvidence } from "../commercial-evidence.ts";

export type EvidenceSufficiencyStatus = "insufficient" | "limited" | "sufficient" | "strong";
export interface EvidenceSufficiencyResult { score: number; status: EvidenceSufficiencyStatus; independentOrigins: number; independentSources: number; contradictionRatio: number; searchOnly: boolean; reasons: string[] }
const round = (value: number) => Math.round(value * 100) / 100;

export function calculateEvidenceSufficiency(supporting: CommercialEvidence[], contradicting: CommercialEvidence[] = [], goalRelevance = .7): EvidenceSufficiencyResult {
  const support = Array.isArray(supporting) ? supporting : [];
  const against = Array.isArray(contradicting) ? contradicting : [];
  const unique = Array.from(new Map(support.map((item) => [item.lineage?.originId || item.id, item])).values());
  const sources = new Set(unique.map((item) => item.source));
  const quality = unique.reduce((sum, item) => sum + (item.sourceQuality?.score ?? .45), 0) / Math.max(unique.length, 1);
  const recency = unique.reduce((sum, item) => sum + (item.sourceQuality?.recency ?? .55), 0) / Math.max(unique.length, 1);
  const corroboration = unique.reduce((sum, item) => sum + (item.corroboration?.strength ?? 0), 0) / Math.max(unique.length, 1);
  const againstQuality = Array.from(new Map(against.map((item) => [item.lineage?.originId || item.id, item])).values()).reduce((sum, item) => sum + (item.sourceQuality?.score ?? .45), 0);
  const contradictionRatio = againstQuality / Math.max(againstQuality + quality * Math.max(unique.length, 1), .01);
  const quantity = Math.min(1, unique.length / 3);
  const diversity = Math.min(1, sources.size / 3);
  let score = quality * .28 + quantity * .16 + diversity * .14 + recency * .12 + corroboration * .18 + goalRelevance * .12;
  score *= 1 - contradictionRatio * .55;
  const searchOnly = unique.length > 0 && unique.every((item) => item.acquisitionMethod === "search_index");
  const declaredOnly = unique.length > 0 && unique.every((item) => item.acquisitionMethod === "declared_by_user");
  if (searchOnly) score = Math.min(score, .54);
  if (declaredOnly) score = Math.min(score, .5);
  const status: EvidenceSufficiencyStatus = score >= .78 && unique.length >= 3 && sources.size >= 2 ? "strong" : score >= .6 && unique.length >= 2 ? "sufficient" : score >= .38 ? "limited" : "insufficient";
  return { score: round(score), status, independentOrigins: unique.length, independentSources: sources.size, contradictionRatio: round(contradictionRatio), searchOnly, reasons: [searchOnly ? "Solo hay fragmentos de búsqueda; no pueden sostener una afirmación fuerte por sí solos." : `${unique.length} origen(es) independiente(s) en ${sources.size} fuente(s).`, contradictionRatio > .25 ? "Existe contradicción material que limita la conclusión." : "La contradicción no domina la evidencia disponible."] };
}
