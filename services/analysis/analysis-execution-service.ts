import "server-only";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { runFullAnalysis, type RunAnalysisResult } from "@/services/pipeline/run-analysis";
import { logger, runWithLogContext } from "@/lib/server/logger";

export type AnalysisRunStatus = "queued" | "running" | "completed" | "partial" | "failed";
const timeoutMs = Math.max(10_000, Math.min(Number(process.env.ANALYSIS_TIMEOUT_MS || 115_000), 115_000));

export function automaticIdempotencyKey(input: { organizationId: string; businessId: string; userId: string; now?: Date }) {
  const bucket = Math.floor((input.now || new Date()).getTime() / (5 * 60_000));
  return createHash("sha256").update(`${input.organizationId}:${input.businessId}:${input.userId}:${bucket}`).digest("hex");
}

function safeResult(result: RunAnalysisResult) { return { success: result.success, businessId: result.businessId, analysisId: result.analysisId, scoreTotal: result.scoreTotal }; }
async function controlled<T>(operation: Promise<T>, signal?: AbortSignal) {
  let timer: ReturnType<typeof setTimeout> | undefined; let abort: (() => void) | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error("analysis_timeout"), { name: "analysis_timeout" })), timeoutMs); });
  const canceled = new Promise<never>((_, reject) => { abort = () => reject(Object.assign(new Error("analysis_canceled"), { name: "analysis_canceled" })); signal?.addEventListener("abort", abort, { once: true }); });
  try { return await Promise.race([operation, timeout, canceled]); }
  finally { if (timer) clearTimeout(timer); if (abort) signal?.removeEventListener("abort", abort); }
}
async function detectedPartial(businessId: string) {
  const latest = await prisma.analysisHistory.findFirst({ where: { businessId }, orderBy: { createdAt: "desc" }, select: { snapshot: true } });
  if (!latest?.snapshot) return false;
  try { const sources = Object.values(JSON.parse(latest.snapshot)?.intelligence?.aggregatedEvidence?.sources || {}) as Array<{ status?: string }>; return sources.some(source => source.status === "evaluated") && sources.some(source => ["unavailable", "requires_auth"].includes(source.status || "")); }
  catch { return false; }
}

export class AnalysisExecutionService {
  constructor(private readonly execute: (businessId: string) => Promise<RunAnalysisResult> = runFullAnalysis) {}
  async run(input: { organizationId: string; businessId: string; userId: string; requestId: string; idempotencyKey: string; signal?: AbortSignal }) {
    let run = await prisma.analysisRun.findUnique({ where: { organizationId_idempotencyKey: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey } } });
    if (run) return { run, reused: true, result: run.result ? JSON.parse(run.result) : undefined };
    try { run = await prisma.analysisRun.create({ data: { organizationId: input.organizationId, businessId: input.businessId, idempotencyKey: input.idempotencyKey, requestId: input.requestId, status: "queued" } }); }
    catch { run = await prisma.analysisRun.findUnique({ where: { organizationId_idempotencyKey: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey } } }); if (!run) throw new Error("analysis_lock_failed"); return { run, reused: true, result: run.result ? JSON.parse(run.result) : undefined }; }
    await prisma.analysisRun.update({ where: { id: run.id }, data: { status: "running", startedAt: new Date() } });
    return runWithLogContext({ requestId: input.requestId, organizationId: input.organizationId, businessId: input.businessId }, async () => {
      const started = Date.now(); logger.info({ operation: "analysis.run", outcome: "success", phase: "started" });
      try {
        const result = await controlled(this.execute(input.businessId), input.signal);
        const status: AnalysisRunStatus = result.success ? (result.analysisStatus || (await detectedPartial(input.businessId) ? "partial" : "completed")) : "failed";
        const saved = safeResult(result); const updated = await prisma.analysisRun.update({ where: { id: run.id }, data: { status, result: JSON.stringify(saved), errorCode: result.success ? null : "source_unavailable", completedAt: new Date() } });
        logger.info({ operation: "analysis.run", durationMs: Date.now() - started, outcome: result.success ? "success" : "failure", analysisRunId: run.id, status }); return { run: updated, reused: false, result: saved };
      } catch (error) {
        const code = error instanceof Error ? error.name : "analysis_failed"; const updated = await prisma.analysisRun.update({ where: { id: run.id }, data: { status: "failed", errorCode: code, completedAt: new Date() } }); logger.error({ operation: "analysis.run", durationMs: Date.now() - started, outcome: "failure", errorCode: code, analysisRunId: run.id }); return { run: updated, reused: false };
      }
    });
  }
}
