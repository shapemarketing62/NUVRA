export interface LocalComparableProfile {
  id: string; name: string; entityConfidence: number; categoryMatch: number; locationMatch: number;
  rating?: number | null; reviewCount?: number | null; recentReviewCount?: number | null;
  offerVisible?: boolean | null; openingHoursVisible?: boolean | null; contactVisible?: boolean | null;
  recurringPerceptions?: string[]; evidenceUrls: string[];
}
export interface LocalCompetitiveContext {
  comparables: LocalComparableProfile[];
  observations: Array<{ statement: string; evidenceUrls: string[]; metric: string }>;
  rejected: Array<{ id: string; reason: string }>;
}

export function buildLocalCompetitiveContext(target: LocalComparableProfile, candidates: LocalComparableProfile[]): LocalCompetitiveContext {
  const rejected = candidates.filter((item) => item.entityConfidence < .72 || item.categoryMatch < .65 || item.locationMatch < .55).map((item) => ({ id: item.id, reason: "Entidad, categoría o ubicación insuficientemente comparables." }));
  const comparables = candidates.filter((item) => item.entityConfidence >= .72 && item.categoryMatch >= .65 && item.locationMatch >= .55).sort((a, b) => (b.categoryMatch + b.locationMatch) - (a.categoryMatch + a.locationMatch)).slice(0, 5);
  const observations: LocalCompetitiveContext["observations"] = [];
  const recent = comparables.map((item) => item.recentReviewCount).filter((value): value is number => typeof value === "number");
  if (typeof target.recentReviewCount === "number" && recent.length >= 2) {
    const median = [...recent].sort((a, b) => a - b)[Math.floor(recent.length / 2)]!;
    if (median >= target.recentReviewCount * 1.5 && median - target.recentReviewCount >= 3) observations.push({ statement: "Los negocios comparables encontrados muestran más reseñas recientes.", evidenceUrls: comparables.flatMap((item) => item.evidenceUrls), metric: "reseñas recientes observables" });
  }
  const visibleContact = comparables.filter((item) => item.contactVisible === true);
  if (target.contactVisible === false && visibleContact.length >= 2) observations.push({ statement: "Varios negocios comparables muestran una forma de contacto visible desde su perfil público.", evidenceUrls: visibleContact.flatMap((item) => item.evidenceUrls), metric: "contacto público visible" });
  return { comparables, observations, rejected };
}
