import type { AggregatedEvidence } from "../intelligence/evidence-aggregator.ts";
import type { SourceEvidence } from "../intelligence/source-analyzer.ts";
import type { PlatformDiscoveryReport, PlatformDiscoveryReportEntry } from "./platform-discovery-service.ts";

export type TerminalSourceStatus =
  | "evaluated"
  | "partial"
  | "discovered"
  | "not_found"
  | "requires_auth"
  | "unavailable"
  | "not_attempted"
  | "not_relevant"
  | "error";

export interface TerminalSourceProjection {
  statuses: Record<string, TerminalSourceStatus>;
  messages: Record<string, string>;
}

/**
 * Converts analyzer and discovery outcomes into terminal states for a completed
 * AnalysisRun. This projection is persisted; the dashboard never has to infer
 * "pending" from an unavailable or intentionally skipped source.
 */
export function buildTerminalSourceProjection(
  aggregated: AggregatedEvidence,
  platformDiscovery?: PlatformDiscoveryReport,
): TerminalSourceProjection {
  const statuses: Record<string, TerminalSourceStatus> = {};
  for (const [source, evidence] of Object.entries(aggregated.sources)) {
    statuses[source] = terminalStatusFromEvidence(evidence);
  }

  for (const entry of platformDiscovery?.entries || []) {
    const key = platformSourceKey(entry);
    if (!key || !(key in statuses)) continue;
    const discoveredStatus = terminalStatusFromPlatform(entry);
    if (statuses[key] === "evaluated" && discoveredStatus !== "error") continue;
    if (discoveredStatus === "discovered" || discoveredStatus === "partial") {
      statuses[key] = discoveredStatus;
    } else if (!["discovered", "partial"].includes(statuses[key])) {
      statuses[key] = discoveredStatus;
    }
  }

  return {
    statuses,
    messages: Object.fromEntries(Object.entries(statuses).map(([source, status]) => [source, terminalSourceMessage(source, status)])),
  };
}

export function terminalStatusFromEvidence(evidence: SourceEvidence): TerminalSourceStatus {
  if (evidence.status === "evaluated") return "evaluated";
  if (evidence.status === "not_relevant") return "not_relevant";
  if (evidence.status === "requires_auth") return "requires_auth";
  const metadata = evidence.metadata || {};
  const outcome = String(metadata.outcome || "").toLowerCase();
  if (outcome === "no_results" || outcome === "not_found") return "not_found";
  if (outcome === "partial") return "partial";
  if (String((metadata.execution as Record<string, unknown> | undefined)?.status || "").toLowerCase() === "error") return "error";
  return "unavailable";
}

export function terminalStatusFromPlatform(entry: PlatformDiscoveryReportEntry): TerminalSourceStatus {
  switch (entry.status) {
    case "ANALYZED": return "evaluated";
    case "VALIDATED":
    case "CANDIDATE_FOUND": return "discovered";
    case "NO_RESULTS": return "not_found";
    case "PROVIDER_UNAVAILABLE": return "unavailable";
    case "REQUIRES_AUTH": return "requires_auth";
    case "NOT_RELEVANT": return "not_relevant";
    case "INCONSISTENT": return "partial";
    case "NOT_ATTEMPTED":
    case "NOT_EVALUABLE": return "not_attempted";
    default: return "error";
  }
}

export function terminalSourceMessage(source: string, status: TerminalSourceStatus): string {
  if (status === "evaluated") return "Analizada";
  if (status === "partial") return "Información parcial";
  if (status === "discovered") return "Encontrada";
  if (status === "not_found") return "No encontrada";
  if (status === "requires_auth") return "Requiere conexión";
  if (status === "not_relevant") return "No prioritaria para este negocio";
  if (status === "not_attempted") return "No evaluada en este análisis";
  if (status === "error" || status === "unavailable") return "No disponible en este análisis";
  return source === "web" ? "No pudimos analizarla" : "No disponible";
}

function platformSourceKey(entry: PlatformDiscoveryReportEntry): string | null {
  if (entry.platform === "website") return "web";
  if (entry.platform === "google_business_profile") return "reviews";
  return String(entry.platform);
}
