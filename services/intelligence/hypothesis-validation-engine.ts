import type { CommercialEvidence } from "./commercial-evidence.ts";
import type { ProblemCandidate } from "./commercial-candidates.ts";

export type HypothesisValidationStatus = "validated" | "partially_validated" | "discarded";

export interface HypothesisValidationResult {
  status: HypothesisValidationStatus;
  evidenceStrength: number;
  contradictionStrength: number;
  supportingIndependentSignals: number;
  contradictingIndependentSignals: number;
  supportingSourceCount: number;
  contradictingSourceCount: number;
  confidence: "ALTA" | "MEDIA" | "BAJA";
  reason: string;
}

export class HypothesisValidationEngine {
  static validate(candidate: Pick<ProblemCandidate, "pattern" | "journeyStage">, supporting: CommercialEvidence[], contradicting: CommercialEvidence[]): HypothesisValidationResult {
    const safeSupporting = Array.isArray(supporting) ? supporting : [];
    const safeContradicting = Array.isArray(contradicting) ? contradicting : [];
    const support = evidenceSetStrength(safeSupporting, "support");
    const contradiction = evidenceSetStrength(safeContradicting, "contradiction");
    const evidenceStrength = support.strength;
    const contradictionStrength = contradiction.strength;
    const hasDirectConfirmation = safeSupporting.some((item) => isDirectFailure(item.text));
    const hasDirectContradiction = safeContradicting.some((item) => isValidatedJourney(item.text));
    let status: HypothesisValidationStatus;
    if (evidenceStrength < .38) status = "discarded";
    else if (hasDirectContradiction && contradiction.independentSignals >= 2 && contradictionStrength >= evidenceStrength * .8) status = "discarded";
    else if (evidenceStrength >= .62 && support.independentSignals >= 2 && contradictionStrength < evidenceStrength * .65 && (hasDirectConfirmation || support.sourceCount >= 2 || support.independentSignals >= 3)) status = "validated";
    else status = "partially_validated";
    const confidence = status === "validated" && evidenceStrength >= .78 ? "ALTA" : status === "discarded" && contradictionStrength >= .7 ? "ALTA" : evidenceStrength >= .5 || contradictionStrength >= .5 ? "MEDIA" : "BAJA";
    const reason = status === "validated"
      ? "La hipótesis tiene evidencia directa o corroboración independiente y poca contradicción."
      : status === "discarded"
        ? hasDirectContradiction && contradiction.independentSignals >= 2 ? "Más de una comprobación independiente contradice la inferencia inicial." : "La señal disponible es demasiado indirecta para sostener el problema."
        : "La señal merece seguimiento, pero todavía no alcanza para presentarla como problema principal.";
    return {
      status,
      evidenceStrength: round(evidenceStrength),
      contradictionStrength: round(contradictionStrength),
      supportingIndependentSignals: support.independentSignals,
      contradictingIndependentSignals: contradiction.independentSignals,
      supportingSourceCount: support.sourceCount,
      contradictingSourceCount: contradiction.sourceCount,
      confidence,
      reason,
    };
  }
}

function evidenceValue(item: CommercialEvidence, direction: "support" | "contradiction") {
  const confidence = item.confidence === "ALTA" ? 1 : item.confidence === "MEDIA" ? .72 : .42;
  const kind = item.kind === "ObservedEvidence" ? 1 : item.kind === "DeclaredEvidence" ? .7 : .45;
  const directness = direction === "contradiction" && isValidatedJourney(item.text)
    ? 1
    : direction === "support" && isDirectFailure(item.text)
      ? 1
      : isTechnicalProxy(item.text)
        ? .28
        : direction === "support" && /no (?:se )?(?:puede|completa|funciona)|error|bloque|falla|impide|redirige mal/i.test(item.text)
          ? .9
          : .72;
  const sourceQuality = item.sourceQuality?.score ?? .58;
  const independence = item.lineage?.independence ?? 1;
  const snippetCeiling = item.acquisitionMethod === "search_index" ? .58 : 1;
  return Math.min(snippetCeiling, confidence * kind * directness * (.55 + sourceQuality * .45) * independence);
}

function evidenceSetStrength(items: CommercialEvidence[], direction: "support" | "contradiction") {
  const independent = new Map<string, number>();
  for (const item of items) {
    const key = independenceKey(item);
    independent.set(key, Math.max(independent.get(key) || 0, evidenceValue(item, direction)));
  }
  const sorted = Array.from(independent.values()).sort((a, b) => b - a);
  const sourceCount = new Set(items.map((item) => item.source)).size;
  if (!sorted.length) return { strength: 0, independentSignals: 0, sourceCount };
  const total = sorted[0] * .72 + (sorted[1] || 0) * .42 + sorted.slice(2).reduce((sum, value) => sum + value * .12, 0);
  return {
    strength: Math.min(1, total * (sourceCount >= 2 ? 1.08 : 1)),
    independentSignals: independent.size,
    sourceCount,
  };
}

function independenceKey(item: CommercialEvidence) {
  if (item.lineage?.originId) return item.lineage.originId;
  const attribution = item.attribution.toLowerCase().replace(/[?#].*$/, "").replace(/\/$/, "");
  const journeyIntent = item.text.toLowerCase().match(/(?:para|al|hasta) (comprar|reservar|consultar|pedir (?:turno|presupuesto)|solicitar|contactar)/)?.[1] || "";
  // Comentarios o menciones previamente deduplicados representan voces públicas
  // independientes aunque provengan de la misma plataforma.
  if (["reviews", "external_mentions", "x"].includes(item.source) && item.originalFindingId) return `${item.source}:${item.originalFindingId}`;
  return `${item.source}:${attribution || item.originalFindingId || item.id}:${journeyIntent}`;
}

function isValidatedJourney(text: string) {
  return /recorrido .*comprob(?:ad|[oó])|acceso directo y observable|conduce a una p[aá]gina cargada correctamente|paso .* aparece de forma clara/i.test(text);
}

function isDirectFailure(text: string) {
  return /bloqueo comprobado|enlace roto|bot[oó]n no funciona|error al (?:comprar|reservar|consultar|pedir)|no permite (?:comprar|reservar|enviar|continuar|elegir|solicitar)|impide completar|aparec(?:e|en) reci[eé]n (?:al final|en el [uú]ltimo paso)|hay que .* sin (?:saber|ver|conocer)|no coincide|difieren entre|no aclara (?:qu[eé]|para|cu[aá]l)|cuesta completar por/i.test(text);
}

function isTechnicalProxy(text: string) {
  return /no se detect|no se encontr|cantidad de (?:campos|p[aá]ginas)|\d+ campos|formulario (?:extenso|largo)|muchas p[aá]ginas|m[uú]ltiples h1|sin h1|navegaci[oó]n limitada|checkout con varios pasos|ausencia de/i.test(text);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
