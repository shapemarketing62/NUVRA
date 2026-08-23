import type { SourceType } from "./source-analyzer";

export interface SourceExecutionPolicy {
  timeoutMs: number;
  retries: number;
  backoffMs: number;
}

export interface SourceFailureAudit {
  category: "timeout" | "http" | "dns" | "blocked" | "provider" | "exception";
  code?: string;
  statusCode?: number;
  message: string;
}

export interface SourceExecutionAudit {
  source: SourceType | "discovery";
  status: "completed" | "unavailable" | "error";
  durationMs: number;
  timeoutMs: number;
  attempts: number;
  failure?: SourceFailureAudit;
}

export interface SourceExecutionResult<T> {
  value?: T;
  audit: SourceExecutionAudit;
}

const SECRET_PATTERN = /(api[_-]?key|access[_-]?token|token|authorization|password|secret)\s*[:=]\s*[^\s,;]+/gi;

function safeFailure(error: unknown): SourceFailureAudit {
  const candidate = error as { name?: string; code?: string; status?: number; statusCode?: number; message?: string };
  const raw = candidate?.message || String(error);
  const message = raw.replace(SECRET_PATTERN, "$1=[redacted]").slice(0, 300);
  const statusCode = candidate?.statusCode || candidate?.status || Number(raw.match(/\b([45]\d{2})\b/)?.[1]) || undefined;
  const code = candidate?.code || candidate?.name;
  const lower = `${code || ""} ${message}`.toLowerCase();
  const category: SourceFailureAudit["category"] =
    lower.includes("timeout") || lower.includes("abort") ? "timeout" :
    statusCode ? "http" :
    /dns|enotfound|eai_again|econnrefused|resolve|dominio/.test(lower) ? "dns" :
    /blocked|robots|forbidden|ssrf|no permit/.test(lower) ? "blocked" :
    /provider|tavily|places|search/.test(lower) ? "provider" : "exception";
  return { category, code, statusCode, message };
}

function abortError(reason: string) {
  return Object.assign(new Error(reason), { name: reason });
}

function wait(ms: number, signal?: AbortSignal) {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => { clearTimeout(timer); reject(abortError("source_canceled")); };
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function attemptWithTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number, parentSignal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) onParentAbort();
  else parentSignal?.addEventListener("abort", onParentAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort("source_timeout");
          reject(abortError("source_timeout"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    parentSignal?.removeEventListener("abort", onParentAbort);
  }
}

export async function executeSource<T>(input: {
  source: SourceType | "discovery";
  operation: (signal: AbortSignal) => Promise<T>;
  policy: SourceExecutionPolicy;
  signal?: AbortSignal;
  shouldRetryResult?: (value: T) => boolean;
}): Promise<SourceExecutionResult<T>> {
  const startedAt = Date.now();
  let attempts = 0;
  let lastValue: T | undefined;
  let lastFailure: SourceFailureAudit | undefined;

  while (attempts <= input.policy.retries) {
    attempts += 1;
    try {
      const value = await attemptWithTimeout(input.operation, input.policy.timeoutMs, input.signal);
      lastValue = value;
      if (!input.shouldRetryResult?.(value)) {
        return { value, audit: { source: input.source, status: "completed", durationMs: Date.now() - startedAt, timeoutMs: input.policy.timeoutMs, attempts } };
      }
      lastFailure = { category: "provider", message: "La fuente no devolvió evidencia utilizable." };
    } catch (error) {
      lastFailure = safeFailure(error);
      if (input.signal?.aborted) break;
    }
    if (attempts <= input.policy.retries) await wait(input.policy.backoffMs * attempts, input.signal);
  }

  return {
    value: lastValue,
    audit: {
      source: input.source,
      status: lastValue === undefined ? "error" : "unavailable",
      durationMs: Date.now() - startedAt,
      timeoutMs: input.policy.timeoutMs,
      attempts,
      failure: lastFailure,
    },
  };
}
