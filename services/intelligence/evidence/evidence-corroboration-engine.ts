import type { CommercialEvidence } from "../commercial-evidence.ts";
import { SourceQualityModel } from "./source-quality-model.ts";

export interface EvidenceCorroboration {
  claimKey: string;
  independentOrigins: number;
  independentSources: number;
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  strength: number;
  conflict: boolean;
}

export interface EvidenceConflict { claimKey: string; supportingEvidenceIds: string[]; contradictingEvidenceIds: string[]; reason: string }

const normalize = (value: unknown) => String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const round = (value: number) => Math.round(value * 100) / 100;
function stableHash(value: string) { let hash = 0; for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0; return Math.abs(hash).toString(36); }

function canonicalReference(item: CommercialEvidence) {
  const match = item.attribution.match(/https?:\/\/[^\s)]+/i)?.[0];
  if (!match) return null;
  try { const url = new URL(match); url.hash = ""; url.search = ""; return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}`; } catch { return null; }
}

function claimKey(item: CommercialEvidence) {
  if (item.reputationTopic) return `${item.journeyStage}:${normalize(item.reputationTopic)}`;
  const text = normalize(item.text);
  const topics: Array<[string, RegExp]> = [["delay", /demora|tarda|lent|respuesta/], ["attention", /atencion|trato|amable/], ["hours", /horario|abierto|cierra/], ["action_path", /whatsapp|reserv|turno|comprar|checkout|contact|formulario/], ["trust", /resena|opinion|testimonio|confianza/], ["brand_identity", /logo|color|tipograf|fotograf|identidad|visual/], ["offer", /propuesta|servicio|producto|especializ/]];
  return `${item.journeyStage}:${topics.find(([, pattern]) => pattern.test(text))?.[0] || text.split(" ").filter((token) => token.length > 5).slice(0, 3).join("_") || "general"}`;
}

function sameUnderlyingOrigin(item: CommercialEvidence) {
  const reference = canonicalReference(item);
  const normalizedText = normalize(item.text);
  // Texto copiado conserva un único origen aunque aparezca en varios directorios.
  const contentKey = normalizedText.length >= 35 ? stableHash(normalizedText.slice(0, 280)) : "";
  return contentKey ? `content:${contentKey}` : item.originalFindingId ? `finding:${item.originalFindingId}` : reference ? `url:${reference}` : `signal:${item.source}:${stableHash(normalizedText)}`;
}

export class EvidenceCorroborationEngine {
  static enrich(input: CommercialEvidence[], now = new Date()) {
    const evidence = (Array.isArray(input) ? input : []).map((item) => ({ ...item }));
    const originCounts = new Map<string, number>();
    for (const item of evidence) { const origin = sameUnderlyingOrigin(item); originCounts.set(origin, (originCounts.get(origin) || 0) + 1); }
    for (const item of evidence) {
      const originId = sameUnderlyingOrigin(item);
      item.lineage = { originId, canonicalReference: canonicalReference(item), acquisitionMethod: item.acquisitionMethod || "unknown", duplicateGroupId: originId, independence: 1 / (originCounts.get(originId) || 1) };
      item.sourceQuality = SourceQualityModel.assess(item, now);
    }
    const groups = new Map<string, CommercialEvidence[]>();
    for (const item of evidence) { const key = claimKey(item); (groups.get(key) || groups.set(key, []).get(key)!).push(item); }
    const conflicts: EvidenceConflict[] = [];
    for (const [key, items] of Array.from(groups.entries())) {
      for (const item of items) {
        const support = items.filter((other) => other.polarity === item.polarity && other.polarity !== "neutral");
        const contradict = items.filter((other) => other.polarity !== "neutral" && item.polarity !== "neutral" && other.polarity !== item.polarity);
        const origins = new Set(support.map((other) => other.lineage?.originId));
        const sources = new Set(support.map((other) => other.source));
        const qualityByOrigin = new Map<string, number>();
        for (const other of support) {
          const origin = other.lineage?.originId || other.id;
          qualityByOrigin.set(origin, Math.max(qualityByOrigin.get(origin) || 0, other.sourceQuality?.score || 0));
        }
        const quality = Array.from(qualityByOrigin.values()).reduce((sum, value) => sum + value, 0) / Math.max(origins.size, 1);
        const strength = Math.min(1, quality * (.62 + Math.min(3, origins.size) * .12 + Math.min(2, sources.size - 1) * .08));
        item.corroboration = { claimKey: key, independentOrigins: origins.size, independentSources: sources.size, supportingEvidenceIds: support.map((other) => other.id), contradictingEvidenceIds: contradict.map((other) => other.id), strength: round(strength), conflict: contradict.length > 0 };
      }
      const positive = items.filter((item) => item.polarity === "positive"); const negative = items.filter((item) => item.polarity === "negative");
      if (positive.length && negative.length) conflicts.push({ claimKey: key, supportingEvidenceIds: positive.map((item) => item.id), contradictingEvidenceIds: negative.map((item) => item.id), reason: "Existen señales positivas y negativas sobre la misma afirmación; ambas se conservan." });
    }
    return { evidence, conflicts };
  }
}
