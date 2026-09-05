import type { Business } from "@prisma/client";
import { businessNameCoreTokens } from "../discovery/business-name-normalization.ts";
import type { EvidenceFinding, SourceEvidence } from "./source-analyzer.ts";

export type EvidenceEntityStatus = "CONFIRMED" | "PROBABLE" | "AMBIGUOUS" | "REJECTED";

export interface EvidenceEntityDecision {
  status: EvidenceEntityStatus;
  confidence: number;
  reasons: string[];
}

const SOCIAL_SOURCES = new Set(["instagram", "tiktok", "facebook", "linkedin", "youtube", "x"]);

/**
 * Last identity gate before a source finding can influence the analysis.
 * Source analyzers remain responsible for discovery; this layer prevents an
 * explicit third-party URL from being treated as the business merely because
 * it shares category words.
 */
export function validateEvidenceEntity(
  finding: Pick<EvidenceFinding, "source" | "evidence" | "attribution">,
  business: Business,
): EvidenceEntityDecision {
  const candidateUrl = httpUrl(finding.attribution);
  const candidateHost = host(candidateUrl);
  const officialHost = host(business.webUrl || "");
  const combined = normalize(`${finding.evidence} ${finding.attribution}`);
  const normalizedBusinessName = normalize(business.nombre);
  const industryTokens = new Set(normalize(business.rubro || "").split(/\s+/).filter(Boolean));
  const core = businessNameCoreTokens(business.nombre);
  const exactBusinessName = normalizedBusinessName.length > 0 && combined.includes(normalizedBusinessName);
  const distinctiveCore = core.filter((token) => !industryTokens.has(token));
  const completeName = exactBusinessName || (distinctiveCore.length > 0 && core.every((token) => combined.includes(token)));
  const officialDomain = Boolean(candidateHost && officialHost && sameRegistrableHost(candidateHost, officialHost));
  const countryConflict = hasCountryDomainConflict(candidateHost, business.ubicacion || business.pais || "");

  if (countryConflict) {
    return { status: "REJECTED", confidence: 0, reasons: ["El dominio corresponde a otro país que contradice la ubicación del negocio."] };
  }
  if (finding.source === "web" && candidateHost && officialHost && !officialDomain) {
    return { status: "REJECTED", confidence: 0.05, reasons: ["La evidencia web no pertenece al dominio oficial validado."] };
  }
  if (officialDomain) {
    return { status: "CONFIRMED", confidence: 0.98, reasons: ["La evidencia pertenece al dominio oficial del negocio."] };
  }

  const identitySensitive = SOCIAL_SOURCES.has(finding.source) || ["external_mentions", "competitor", "search", "reviews"].includes(finding.source);
  if (identitySensitive && !completeName) {
    return { status: "AMBIGUOUS", confidence: 0.42, reasons: ["La fuente externa no contiene una identidad comercial suficientemente distintiva del negocio."] };
  }
  if (completeName) {
    return { status: "PROBABLE", confidence: 0.78, reasons: ["El nombre comercial completo aparece en la evidencia."] };
  }

  // Findings agregados sin URL ya atravesaron el matcher específico de su
  // provider. Se conservan como probables, pero nunca se elevan a confirmados.
  return { status: "PROBABLE", confidence: 0.68, reasons: ["La fuente informó una señal agregada sin una URL de entidad contradictoria."] };
}

export function validateSourceEvidence(evidence: SourceEvidence, business: Business): SourceEvidence {
  const rejected: Array<{ findingId: string; status: EvidenceEntityStatus; reasons: string[] }> = [];
  const findings = (Array.isArray(evidence.findings) ? evidence.findings : []).flatMap((finding) => {
    const decision = validateEvidenceEntity(finding, business);
    const enriched: EvidenceFinding = { ...finding, entityValidation: decision };
    if (decision.status === "CONFIRMED" || (decision.status === "PROBABLE" && decision.confidence >= 0.65)) return [enriched];
    rejected.push({ findingId: finding.id, status: decision.status, reasons: decision.reasons });
    return [];
  });
  return {
    ...evidence,
    findings,
    metadata: {
      ...(evidence.metadata || {}),
      entityValidation: {
        accepted: findings.length,
        rejected: rejected.length,
        rejectedFindings: rejected,
      },
    },
  };
}

function httpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch { return ""; }
}
function host(value: string) { try { return new URL(value).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } }
function sameRegistrableHost(a: string, b: string) { return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`); }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function hasCountryDomainConflict(domain: string, location: string) {
  const expected = normalize(location).includes("argentina") ? "ar" : normalize(location).includes("chile") ? "cl" : null;
  const actual = domain.match(/\.([a-z]{2})$/)?.[1] || null;
  return Boolean(expected && actual && ["ar", "cl", "mx", "co", "uy", "pe", "es", "br"].includes(actual) && actual !== expected);
}
