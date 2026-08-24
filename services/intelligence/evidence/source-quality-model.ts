import type { CommercialEvidence } from "../commercial-evidence.ts";

export type EvidenceSignalType = "business_hours" | "operational_experience" | "brand_identity" | "value_proposition" | "reputation" | "commercial_path" | "general";
export type ClaimStrength = "weak" | "moderate" | "strong";

export interface EvidenceLineage {
  originId: string;
  canonicalReference: string | null;
  acquisitionMethod: NonNullable<CommercialEvidence["acquisitionMethod"]> | "unknown";
  duplicateGroupId: string;
}

export interface SourceQualityAssessment {
  score: number;
  acquisitionReliability: number;
  sourceProximity: number;
  entityValidity: number;
  recency: number;
  completeness: number;
  independence: number;
  verifiability: number;
  contextIntegrity: number;
  snippetRisk: number;
  signalType: EvidenceSignalType;
  ageDays: number | null;
  maxClaimStrength: ClaimStrength;
  reasons: string[];
}

const normalize = (value: unknown) => String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const round = (value: number) => Math.round(value * 100) / 100;

export function inferEvidenceSignalType(evidence: Pick<CommercialEvidence, "text" | "journeyStage" | "reputationTopic">): EvidenceSignalType {
  const text = normalize(`${evidence.text} ${evidence.reputationTopic || ""}`);
  if (/horario|abierto|cierra|apertura/.test(text)) return "business_hours";
  if (/demora|atencion|entrega|respuesta|experiencia|queja|rapidez/.test(text) || evidence.journeyStage === "experience") return "operational_experience";
  if (/logo|color|tipograf|fotograf|identidad|tono|visual|marca/.test(text)) return "brand_identity";
  if (/propuesta|especializ|que ofrece|servicio|producto|diferencia/.test(text)) return "value_proposition";
  if (/resena|opinion|comentario|rating|reputacion/.test(text)) return "reputation";
  if (/comprar|reserv|turno|whatsapp|contact|checkout|formulario|presupuesto|reunion/.test(text) || evidence.journeyStage === "action") return "commercial_path";
  return "general";
}

const freshnessDays: Record<EvidenceSignalType, number> = {
  business_hours: 45,
  operational_experience: 150,
  brand_identity: 720,
  value_proposition: 420,
  reputation: 240,
  commercial_path: 120,
  general: 365,
};

export class SourceQualityModel {
  static assess(evidence: CommercialEvidence, now = new Date()): SourceQualityAssessment {
    const method = evidence.acquisitionMethod || "unknown";
    const acquisitionReliability = ({ official_api: .92, authenticated_integration: .94, public_page: .78, search_index: .48, declared_by_user: .72, unknown: .5 } as const)[method];
    const sourceProximity = method === "official_api" || method === "authenticated_integration" ? .94 : method === "public_page" ? .82 : method === "declared_by_user" ? .88 : method === "search_index" ? .42 : .5;
    const entityValidity = evidence.confidence === "ALTA" ? .95 : evidence.confidence === "MEDIA" ? .7 : .4;
    const signalType = inferEvidenceSignalType(evidence);
    const parsed = evidence.timestamp ? new Date(evidence.timestamp) : null;
    const ageDays = parsed && !Number.isNaN(parsed.getTime()) ? Math.max(0, (now.getTime() - parsed.getTime()) / 86_400_000) : null;
    const recency = ageDays === null ? .55 : clamp(Math.exp(-ageDays / freshnessDays[signalType]));
    const hasReference = /https?:\/\//i.test(evidence.attribution) || method === "official_api" || method === "authenticated_integration";
    const completeness = clamp(.3 + Math.min(evidence.text.trim().length / 240, .45) + (evidence.timestamp ? .12 : 0) + (hasReference ? .13 : 0));
    const verifiability = hasReference ? .9 : method === "declared_by_user" ? .65 : .42;
    const snippetRisk = method === "search_index" ? .82 : method === "public_page" ? .18 : .08;
    const contextIntegrity = clamp(method === "search_index" ? .38 + completeness * .22 : .7 + completeness * .25);
    const independence = evidence.lineage?.independence ?? 1;
    let score = acquisitionReliability * .18 + sourceProximity * .12 + entityValidity * .16 + recency * .12 + completeness * .1 + independence * .1 + verifiability * .1 + contextIntegrity * .12;
    if (method === "declared_by_user") score = Math.min(score, .72);
    if (method === "search_index") score = Math.min(score, .58);
    score = clamp(score);
    const maxClaimStrength: ClaimStrength = method === "search_index" || method === "declared_by_user" ? (score >= .48 ? "moderate" : "weak") : score >= .75 ? "strong" : score >= .48 ? "moderate" : "weak";
    const reasons = [
      method === "search_index" ? "El contenido proviene de un índice y puede carecer de contexto." : `Adquisición mediante ${method}.`,
      ageDays === null ? "La fuente no aporta una fecha verificable." : `Antigüedad aproximada: ${Math.round(ageDays)} días; política ${signalType}.`,
      method === "declared_by_user" ? "Aporta contexto declarado, no comprobación externa." : hasReference ? "La señal conserva una referencia verificable." : "La referencia original es limitada.",
    ];
    return { score: round(score), acquisitionReliability, sourceProximity, entityValidity, recency: round(recency), completeness: round(completeness), independence: round(independence), verifiability, contextIntegrity: round(contextIntegrity), snippetRisk, signalType, ageDays: ageDays === null ? null : Math.round(ageDays), maxClaimStrength, reasons };
  }
}
