import type { SocialBusinessTarget, SocialIdentityCandidate } from "./social-source-provider.ts";

export interface SocialEntityResolution {
  confidence: number;
  validated: boolean;
  signals: Array<{ field: string; score: number; evidence: string }>;
  contradictions: string[];
}

const normalize = (value: unknown) => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const domain = (value?: string | null) => { try { return new URL(String(value)).hostname.replace(/^www\./, ""); } catch { return ""; } };

export class SocialEntityResolver {
  static readonly threshold = .78;

  static resolve(target: SocialBusinessTarget, candidate: SocialIdentityCandidate | null): SocialEntityResolution {
    if (!candidate?.profileUrl) return { confidence: 0, validated: false, signals: [], contradictions: ["No se obtuvo una identidad pública utilizable."] };
    const signals: SocialEntityResolution["signals"] = [];
    const contradictions: string[] = [];
    const declared = String(target.declaredChannels || "").toLowerCase();
    if (declared && declared.includes(candidate.profileUrl.toLowerCase())) signals.push({ field: "declared_profile", score: .42, evidence: "El perfil fue declarado directamente por el negocio." });
    const targetName = normalize(target.name);
    const displayName = normalize(candidate.displayName);
    const username = normalize(candidate.username);
    if (targetName && (displayName.includes(targetName) || targetName.includes(displayName))) signals.push({ field: "name", score: .28, evidence: "El nombre público coincide con el negocio." });
    else if (targetName && username && (username.includes(targetName) || targetName.includes(username))) signals.push({ field: "username", score: .24, evidence: "El identificador coincide con el nombre del negocio." });
    else contradictions.push("El nombre o identificador no coincide de forma suficiente.");

    const officialDomain = domain(target.website);
    const linkedDomains = (candidate.linkedUrls || []).map(domain).filter(Boolean);
    if (officialDomain && linkedDomains.includes(officialDomain)) signals.push({ field: "domain", score: .34, evidence: "El perfil enlaza el dominio oficial." });
    const declaredDomains = (String(target.declaredChannels || "").match(/https?:\/\/[^\s,;]+/gi) || []).map(domain).filter(Boolean);
    if (declaredDomains.some((item) => linkedDomains.includes(item))) signals.push({ field: "cross_link", score: .12, evidence: "El perfil coincide con enlaces cruzados declarados." });
    const candidateLocation = normalize(candidate.location);
    const targetLocation = normalize(target.location);
    if (candidateLocation && targetLocation && (candidateLocation.includes(targetLocation) || targetLocation.includes(candidateLocation))) signals.push({ field: "location", score: .14, evidence: "La ubicación es consistente." });
    if (candidate.phone && target.phone && normalize(candidate.phone) === normalize(target.phone)) signals.push({ field: "phone", score: .18, evidence: "El teléfono coincide." });
    const categoryText = normalize(`${candidate.category || ""} ${candidate.description || ""}`);
    const industry = normalize(target.industry);
    if (industry && categoryText && (categoryText.includes(industry) || tokenOverlap(target.industry, `${candidate.category || ""} ${candidate.description || ""}`) >= .35)) signals.push({ field: "category", score: .12, evidence: "La actividad descripta es compatible." });
    const confidence = Math.min(1, signals.reduce((sum, item) => sum + item.score, 0));
    return { confidence: Math.round(confidence * 100) / 100, validated: confidence >= this.threshold, signals, contradictions };
  }
}

function tokenOverlap(a: string, b: string) {
  const tokens = (value: string) => new Set(value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((item) => item.length >= 4));
  const left = tokens(a); const right = tokens(b);
  if (!left.size || !right.size) return 0;
  return Array.from(left).filter((item) => right.has(item)).length / Math.min(left.size, right.size);
}
