import { apiError } from "@/lib/server/api-response";
import { mockBillingEnabled, subscriptionService } from "@/services/billing";

export async function POST(request: Request) {
  if (!mockBillingEnabled) return apiError("source_unavailable", 503);
  const payload = await request.text(); if (Buffer.byteLength(payload, "utf8") > 128_000) return apiError("validation_error", 413);
  try { const result = await subscriptionService.handleWebhook(payload, request.headers.get("x-billing-signature")); return Response.json(result); }
  catch { return apiError("unauthorized", 401); }
}
