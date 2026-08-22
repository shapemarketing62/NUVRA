import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError, readJsonBody } from "@/lib/server/api-response";
import { authorizeBusiness } from "@/lib/server/authorization";
import { canConsume, recordUsage } from "@/lib/server/usage";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { requiresVerifiedEmail } from "@/lib/server/verification-policy";
import { AnalysisExecutionService, automaticIdempotencyKey } from "@/services/analysis/analysis-execution-service";
import { requestId } from "@/lib/server/logger";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  try { const analysisRunId=z.string().min(1).max(100).parse(req.nextUrl.searchParams.get("analysisRunId")); const run=await (await import("@/lib/prisma")).prisma.analysisRun.findUnique({where:{id:analysisRunId},select:{id:true,businessId:true,status:true,queuedAt:true,startedAt:true,completedAt:true}}); if(!run)return apiError("not_found",404);const access=await authorizeBusiness(run.businessId,"business.read");if(!access.ok)return apiError(access.reason,access.reason==="unauthorized"?401:403);return NextResponse.json(run)}catch(error){return handleApiError(error)}
}

export async function POST(req: NextRequest) {
  try {
    const { businessId } = z.object({ businessId: z.string().min(1).max(100) }).parse(await readJsonBody(req, 4_000));
    const access = await authorizeBusiness(businessId, "analysis.run", "analysis.basic");
    if (!access.ok) return apiError(access.reason, access.reason === "unauthorized" ? 401 : 403);
    if (requiresVerifiedEmail("analysis.run") && !access.user.emailVerifiedAt) return apiError("forbidden", 403);
    if (!(await checkRateLimit(`analysis:${access.user.id}`, 5, 60_000)).allowed) return apiError("rate_limited", 429);
    if (!(await canConsume(access.organization.id, "monthlyAnalyses", 1, access.user.id))) return apiError("usage_limit_reached", 403);

    const correlationId=requestId(req.headers);const supplied=req.headers.get("idempotency-key");const idempotencyKey=supplied&&/^[A-Za-z0-9._:-]{8,128}$/.test(supplied)?supplied:automaticIdempotencyKey({organizationId:access.organization.id,businessId,userId:access.user.id});
    const execution=await new AnalysisExecutionService().run({organizationId:access.organization.id,businessId,userId:access.user.id,requestId:correlationId,idempotencyKey,signal:req.signal});
    if(execution.reused){const status=execution.run.status;return NextResponse.json({status,analysisRunId:execution.run.id,reused:true,...(execution.result||{})},{status:status==="queued"||status==="running"?202:200,headers:{"x-request-id":correlationId}})}
    if (!execution.result?.success) {
      return apiError("source_unavailable", 422);
    }
    await recordUsage(access.organization.id, "analysis", businessId, 1, access.user.id);
    return NextResponse.json({...execution.result,status:execution.run.status,analysisRunId:execution.run.id},{headers:{"x-request-id":correlationId}});
  } catch (err) {
    return handleApiError(err);
  }
}
