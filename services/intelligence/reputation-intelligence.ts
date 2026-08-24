import { createHash } from "node:crypto";
import type { CommercialJourneyStageId } from "./commercial-evidence.ts";

export interface PublicCommentInput {
  id?: string; source: string; url?: string | null; date?: string | Date | null; rating?: number | null;
  text: string; author?: string | null; entityConfidence?: number; entityValidated?: boolean;
  acquisitionMethod?: "official_api" | "authenticated_integration" | "public_page" | "search_index" | "declared_by_user";
}
export interface ReputationComment {
  id: string; source: string; url: string | null; date: string | null; rating: number | null; text: string;
  author: string | null; entityValidated: boolean; entityConfidence: number; topics: string[];
  sentiment: "positive" | "negative" | "neutral" | "unknown"; intensity: number; confidence: number;
  duplicate: boolean; experienceType: string; journeyStage: CommercialJourneyStageId;
  acquisitionMethod?: PublicCommentInput["acquisitionMethod"];
}
export interface ReputationTopic {
  name: string; frequency: number; independentAuthors: number; recency: number; intensity: number; consistency: number;
  sourceDistribution: Record<string, number>; goalRelevance: number; commercialImpact: number;
  temporalDiversity: number; sourceDiversity: number; duplicationRate: number; entityConfidence: number;
  contradictionRatio: number; evidenceConfidence: number; positiveCount: number; negativeCount: number;
  polarity: "positive" | "negative" | "mixed" | "neutral"; trend: "emerging" | "improving" | "deteriorating" | "persistent" | "stable" | "insufficient_temporal_evidence";
  commentIds: string[];
}
export interface ReputationAnalysis {
  comments: ReputationComment[]; accepted: ReputationComment[]; duplicates: ReputationComment[]; rejectedEntity: ReputationComment[];
  topics: ReputationTopic[]; strengths: ReputationTopic[]; problems: ReputationTopic[];
  platformDifferences: Array<{ topic: string; positiveSources: string[]; negativeSources: string[]; recent: boolean; confidence: number; evidence: string }>;
  temporalClaims: Array<{ topic: string; trend: ReputationTopic["trend"]; evidence: string }>;
  coverage: { total: number; accepted: number; independentAuthors: number; dated: number; sources: string[]; evidenceConfidence: number };
}

const SEEDS: Array<[string, RegExp]> = [
  ["atención", /atenci[oó]n|atiend|amable|trato|personal|equipo/], ["precio", /precio|car[oa]|econ[oó]mic|valor/],
  ["calidad", /calidad|excelente|delicios|rico|fresco|terminaci[oó]n/], ["demora", /demora|tard|espera|lento/],
  ["ubicación", /ubicaci[oó]n|cerca|direcci[oó]n|acceso/], ["limpieza", /limpi|suci|higiene/],
  ["profesionales", /profesional|especialista|m[eé]dic|docente|asesor/], ["producto", /producto|material|caf[eé]|comida|servicio/],
  ["entrega", /entrega|env[ií]o|pedido|paquete/], ["reserva", /reserva|turno|mesa|cita/],
  ["respuesta", /respuesta|responder|contest|whatsapp|mensaje/], ["variedad", /variedad|opciones|cat[aá]logo/],
  ["ambiente", /ambiente|espacio|lugar|m[uú]sica|ruido/], ["confianza", /confianza|segur|recomiend|cumpli/],
  ["postventa", /postventa|despu[eé]s|seguimiento|devoluci[oó]n|garant[ií]a/],
];
const STOP = new Set("para como desde hasta este esta esto pero porque muy más mas una uno unos unas los las del con sin por que fue son hay tiene tuve han sus nuestro nuestra negocio lugar servicio producto experiencia".split(" "));

export class ReputationIntelligence {
  static analyze(input: PublicCommentInput[], context: { objective?: string; entityThreshold?: number; now?: Date } = {}): ReputationAnalysis {
    const threshold = context.entityThreshold ?? .72;
    const now = context.now || new Date();
    const seen = new Map<string, string>();
    const seenComments: Array<{ normalized: string; author: string; date: string | null }> = [];
    const prepared = (Array.isArray(input) ? input : []).filter((item) => typeof item?.text === "string" && item.text.trim().length >= 8).map((item, index) => {
      const normalized = normalize(item.text);
      const fingerprint = createHash("sha256").update(normalized).digest("hex").slice(0, 20);
      const normalizedAuthor = normalize(item.author || "");
      const itemDate = validDate(item.date);
      const duplicate = seen.has(fingerprint) || seenComments.some((previous) => normalizedAuthor && previous.author === normalizedAuthor && datesNear(previous.date, itemDate, 3) && tokenSimilarity(previous.normalized, normalized) >= .82);
      if (!duplicate) seen.set(fingerprint, item.id || `comment-${index}`);
      if (!duplicate) seenComments.push({ normalized, author: normalizedAuthor, date: itemDate });
      const sentiment = sentimentOf(item.text, item.rating);
      return {
        id: item.id || `${item.source}-${index}-${fingerprint.slice(0, 6)}`, source: item.source, url: item.url || null,
        date: itemDate, rating: validRating(item.rating), text: item.text.trim(), author: item.author || null,
        entityValidated: item.entityValidated !== false && (item.entityConfidence ?? 1) >= threshold,
        entityConfidence: clamp(item.entityConfidence ?? 1), topics: topicsOf(item.text), sentiment,
        intensity: intensityOf(item.text, item.rating), confidence: commentConfidence(item), duplicate,
        experienceType: experienceTypeOf(item.text), journeyStage: stageOf(item.text), acquisitionMethod: item.acquisitionMethod,
      } satisfies ReputationComment;
    });
    const rejectedEntity = prepared.filter((item) => !item.entityValidated);
    const duplicates = prepared.filter((item) => item.entityValidated && item.duplicate);
    const accepted = prepared.filter((item) => item.entityValidated && !item.duplicate);
    const topics = aggregateTopics(accepted, duplicates, context.objective || "", now);
    return {
      comments: prepared, accepted, duplicates, rejectedEntity, topics,
      strengths: topics.filter((topic) => topic.polarity === "positive" && topic.independentAuthors >= 3 && topic.consistency >= .6 && topic.evidenceConfidence >= .4),
      problems: topics.filter((topic) => topic.polarity === "negative" && topic.independentAuthors >= 3 && topic.commercialImpact >= .5 && topic.goalRelevance >= .65 && topic.contradictionRatio <= .35 && topic.evidenceConfidence >= .45 && (topic.recency >= .2 || topic.temporalDiversity >= .35 || topic.trend === "deteriorating")),
      platformDifferences: platformDifferences(accepted, topics, now),
      temporalClaims: topics.filter((topic) => topic.trend !== "insufficient_temporal_evidence" && topic.trend !== "stable").map((topic) => ({ topic: topic.name, trend: topic.trend, evidence: temporalEvidence(topic) })),
      coverage: { total: prepared.length, accepted: accepted.length, independentAuthors: new Set(accepted.map((item) => item.author || item.id)).size, dated: accepted.filter((item) => item.date).length, sources: Array.from(new Set(accepted.map((item) => item.source))), evidenceConfidence: topics.length ? average(topics.slice(0, 8).map((topic) => topic.evidenceConfidence)) : 0 },
    };
  }
}

function aggregateTopics(comments: ReputationComment[], duplicates: ReputationComment[], objective: string, now: Date): ReputationTopic[] {
  const groups = new Map<string, ReputationComment[]>();
  for (const comment of comments) for (const topic of comment.topics) (groups.get(topic) || groups.set(topic, []).get(topic)!).push(comment);
  return Array.from(groups.entries()).map(([name, items]) => {
    const dated = items.filter((item) => item.date);
    const recent = dated.filter((item) => now.getTime() - new Date(item.date!).getTime() <= 120 * 86400000);
    const older = dated.filter((item) => now.getTime() - new Date(item.date!).getTime() > 365 * 86400000);
    const positive = items.filter((item) => item.sentiment === "positive").length;
    const negative = items.filter((item) => item.sentiment === "negative").length;
    const recentPositive = recent.filter((item) => item.sentiment === "positive").length;
    const recentNegative = recent.filter((item) => item.sentiment === "negative").length;
    const polarity = recent.length >= 3 && recentNegative / recent.length >= .6 ? "negative" : recent.length >= 3 && recentPositive / recent.length >= .6 ? "positive" : negative / items.length >= .6 ? "negative" : positive / items.length >= .6 ? "positive" : positive && negative ? "mixed" : "neutral";
    const sourceDistribution = Object.fromEntries(Array.from(new Set(items.map((item) => item.source))).map((source) => [source, items.filter((item) => item.source === source).length]));
    const relevance = goalRelevance(name, objective);
    const trend = temporalTrend(items, dated, recent, older, polarity, now);
    const monthBuckets = new Set(dated.map((item) => item.date!.slice(0, 7))).size;
    const temporalDiversity = Math.min(1, monthBuckets / 6);
    const sourceDiversity = Math.min(1, Object.keys(sourceDistribution).length / 3);
    const duplicateMentions = duplicates.filter((item) => item.topics.includes(name)).length;
    const duplicationRate = duplicateMentions / Math.max(1, duplicateMentions + items.length);
    const entityConfidence = average(items.map((item) => item.entityConfidence));
    const recentNegRatio = recent.filter((item) => item.sentiment === "negative").length / Math.max(recent.length, 1);
    const recentPosRatio = recent.filter((item) => item.sentiment === "positive").length / Math.max(recent.length, 1);
    const contradictionRatio = trend === "deteriorating" && polarity === "negative" ? 1 - recentNegRatio : trend === "improving" && polarity === "positive" ? 1 - recentPosRatio : polarity === "negative" ? positive / items.length : polarity === "positive" ? negative / items.length : Math.min(1, Math.min(positive, negative) / Math.max(1, Math.max(positive, negative)));
    const independentAuthors = new Set(items.map((item) => item.author || (item.acquisitionMethod === "search_index" ? `unknown-search:${item.source}` : item.id))).size;
    const recency = dated.length ? recent.length / dated.length : 0;
    const consistency = trend === "deteriorating" ? recentNegRatio : trend === "improving" ? recentPosRatio : Math.max(positive, negative) / items.length;
    const evidenceConfidence = clamp(Math.min(1, independentAuthors / 30) * .25 + sourceDiversity * .2 + temporalDiversity * .2 + recency * .12 + consistency * .1 + entityConfidence * .1 + (1 - duplicationRate) * .03);
    return { name, frequency: items.length, independentAuthors, recency, intensity: average(items.map((item) => item.intensity)), consistency, sourceDistribution, goalRelevance: relevance, commercialImpact: clamp((Math.min(1, independentAuthors / 8) * .3) + (average(items.map((item) => item.intensity)) * .2) + (relevance * .25) + (recency * .15) + (sourceDiversity * .1)), temporalDiversity, sourceDiversity, duplicationRate, entityConfidence, contradictionRatio, evidenceConfidence, positiveCount: positive, negativeCount: negative, polarity, trend, commentIds: items.map((item) => item.id) } satisfies ReputationTopic;
  }).sort((a, b) => b.commercialImpact - a.commercialImpact || b.frequency - a.frequency);
}

function topicsOf(text: string) {
  const normalized = normalize(text); const result = SEEDS.filter(([, rule]) => rule.test(normalized)).map(([name]) => name);
  const tokens = normalized.split(/\s+/).filter((word) => word.length >= 5 && !STOP.has(word) && !/^\d+$/.test(word));
  for (const token of tokens) if (!result.some((topic) => topic.includes(token) || token.includes(topic)) && tokens.filter((value) => value === token).length >= 1) result.push(token);
  return Array.from(new Set(result)).slice(0, 8);
}
function sentimentOf(text: string, rating?: number | null): ReputationComment["sentiment"] { const value = normalize(text); const neg = /mal[oa]|pesim|demora|tard|suci|caro|error|nunca|decepcion|queja|problema|ruido|lento/.test(value); const pos = /excelente|buen[oa]|genial|amable|recomiend|calidad|rico|rapido|encant/.test(value); if (neg && !pos) return "negative"; if (pos && !neg) return "positive"; if (rating != null && text.length >= 20) return rating >= 4 ? "positive" : rating <= 2 ? "negative" : "neutral"; return neg && pos ? "neutral" : "unknown"; }
function intensityOf(text: string, rating?: number | null) { const lexical = /muy|pesim|excelente|nunca|siempre|terrible|increible|much[ií]sim|demasiad/i.test(text) ? .9 : .6; const stars = rating == null ? .5 : Math.abs(rating - 3) / 2; return clamp(lexical * .65 + stars * .35); }
function commentConfidence(item: PublicCommentInput) { return clamp((item.entityConfidence ?? 1) * .55 + (item.url ? .15 : 0) + (item.date ? .1 : 0) + (item.author ? .1 : 0) + (item.rating != null ? .1 : 0)); }
function experienceTypeOf(text: string) { const value = normalize(text); if (/entrega|envio|pedido/.test(value)) return "entrega"; if (/reserva|turno|respuesta|whatsapp/.test(value)) return "contacto_y_reserva"; if (/atencion|personal|profesional/.test(value)) return "atencion"; if (/ambiente|limpieza|ruido/.test(value)) return "experiencia_en_el_lugar"; return "producto_o_servicio"; }
function stageOf(text: string): CommercialJourneyStageId { const value = normalize(text); if (/respuesta|reserva|turno|whatsapp|comprar/.test(value)) return "action"; if (/entrega|demora|atencion|limpieza|ambiente|ruido/.test(value)) return "experience"; if (/postventa|devolucion|volver/.test(value)) return "retention"; return "evaluation"; }
function goalRelevance(topic: string, objective: string) { const value = normalize(`${topic} ${objective}`); if (/reserva|consulta|turno/.test(normalize(objective)) && /respuesta|demora|reserva|atencion/.test(value)) return 1; if (/recompra|volver|retencion/.test(normalize(objective)) && /postventa|calidad|atencion|entrega/.test(value)) return 1; return .65; }
function temporalTrend(items: ReputationComment[], dated: ReputationComment[], recent: ReputationComment[], older: ReputationComment[], polarity: ReputationTopic["polarity"], now: Date): ReputationTopic["trend"] { if (dated.length < 6 || dated.length / items.length < .5) return "insufficient_temporal_evidence"; const recentShare = recent.length / dated.length; const recentNeg = recent.filter((item) => item.sentiment === "negative").length / Math.max(recent.length, 1); const olderPos = older.filter((item) => item.sentiment === "positive").length / Math.max(older.length, 1); if (recent.length >= 3 && older.length >= 3 && recentNeg >= .6 && olderPos >= .6) return "deteriorating"; if (polarity === "negative" && recent.length >= 3 && recentShare >= .45) return older.length >= 3 ? "deteriorating" : "emerging"; if (polarity === "positive" && recent.length >= 3 && older.length >= 3) return "improving"; if (recent.length >= 2 && older.length >= 2) return "persistent"; return "stable"; }
function temporalEvidence(topic: ReputationTopic) { return `${topic.frequency} opiniones independientes sostienen el tema “${topic.name}”; la distribución temporal permite clasificarlo como ${topic.trend}.`; }
function validDate(value?: string | Date | null) { if (!value) return null; const date = value instanceof Date ? value : new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function validRating(value?: number | null) { return typeof value === "number" && value >= 0 && value <= 5 ? value : null; }
function normalize(value: string) { return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function clamp(value: number) { return Math.max(0, Math.min(1, value)); }
function datesNear(a: string | null, b: string | null, days: number) { if (!a || !b) return false; return Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= days * 86400000; }
function tokenSimilarity(a: string, b: string) { const left = new Set(a.split(" ").filter(Boolean)); const right = new Set(b.split(" ").filter(Boolean)); if (!left.size || !right.size) return 0; const shared = Array.from(left).filter((item) => right.has(item)).length; return shared / Math.max(left.size, right.size); }

function platformDifferences(comments: ReputationComment[], topics: ReputationTopic[], now: Date): ReputationAnalysis["platformDifferences"] {
  const result: ReputationAnalysis["platformDifferences"] = [];
  for (const topic of topics) {
    const related = comments.filter((item) => item.topics.includes(topic.name));
    const sources = Array.from(new Set(related.map((item) => item.source)));
    const positiveSources: string[] = []; const negativeSources: string[] = [];
    for (const source of sources) {
      const items = related.filter((item) => item.source === source);
      if (items.length < 3) continue;
      const positive = items.filter((item) => item.sentiment === "positive").length / items.length;
      const negative = items.filter((item) => item.sentiment === "negative").length / items.length;
      if (positive >= .65) positiveSources.push(source);
      if (negative >= .65) negativeSources.push(source);
    }
    if (!positiveSources.length || !negativeSources.length) continue;
    const recentNegative = related.filter((item) => negativeSources.includes(item.source) && item.date && now.getTime() - new Date(item.date).getTime() <= 120 * 86400000).length;
    const confidence = clamp(Math.min(1, related.length / 30) * .4 + Math.min(1, sources.length / 3) * .35 + topic.entityConfidence * .15 + topic.temporalDiversity * .1);
    result.push({ topic: topic.name, positiveSources, negativeSources, recent: recentNegative >= 3, confidence, evidence: `La percepción sobre “${topic.name}” es favorable en ${positiveSources.join(", ")} y desfavorable en ${negativeSources.join(", ")}${recentNegative >= 3 ? " en comentarios recientes" : ""}.` });
  }
  return result;
}
