import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "./logger";

export type ApiErrorCode = "unauthorized" | "forbidden" | "validation_error" | "rate_limited" | "internal_error" | "source_unavailable" | "not_found" | "usage_limit_reached";

const SAFE_MESSAGES: Record<ApiErrorCode, string> = {
  unauthorized: "Necesitás iniciar sesión.", forbidden: "No tenés permiso para realizar esta acción.",
  validation_error: "Revisá los datos enviados.", rate_limited: "Demasiados intentos. Esperá unos minutos.",
  internal_error: "No pudimos completar la operación.", source_unavailable: "La fuente no está disponible en este momento.",
  not_found: "No encontramos el recurso solicitado.", usage_limit_reached: "Alcanzaste el límite de tu plan.",
};

export function apiError(code: ApiErrorCode, status: number, details?: unknown) {
  return NextResponse.json({ error: { code, message: SAFE_MESSAGES[code], ...(details ? { details } : {}) } }, { status });
}

export function handleApiError(error: unknown) {
  if (error instanceof ZodError) return apiError("validation_error", 400, error.issues.map(({ path, message }) => ({ field: path.join("."), message })));
  logger.error({ operation: "api.request", outcome: "failure", errorCode: error instanceof Error ? error.name : "internal_error" });
  return apiError("internal_error", 500);
}

export async function readJsonBody(request: Request, maxBytes = 32_000): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new ZodError([{ code: "custom", path: [], message: "El contenido enviado es demasiado grande." }]);
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new ZodError([{ code: "custom", path: [], message: "El contenido enviado es demasiado grande." }]);
  try { return JSON.parse(text); } catch { throw new ZodError([{ code: "custom", path: [], message: "El contenido no es JSON válido." }]); }
}
