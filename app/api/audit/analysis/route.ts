import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/server/api-response";
import { authorizeBusiness } from "@/lib/server/authorization";
import { hasInternalAccess } from "@/lib/server/internal-access";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id || id.length > 100) return apiError("validation_error", 400);
  const access = await authorizeBusiness(id, "business.read");
  if (!access.ok) return apiError(access.reason, access.reason === "unauthorized" ? 401 : 403);
  if (process.env.NODE_ENV === "production" && !hasInternalAccess(access.user)) return apiError("forbidden", 403);

  try {
    const business = await prisma.business.findUnique({
      where: { id },
      include: {
        goals: { orderBy: { createdAt: "desc" }, take: 1 },
        scores: { orderBy: { createdAt: "desc" }, take: 1, include: { dimensions: true } },
        diagnoses: { orderBy: { createdAt: "desc" }, take: 1 },
        strategies: { orderBy: { createdAt: "desc" }, take: 1, include: { actions: { orderBy: { order: "asc" } } } },
        analysisHistory: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    if (!business) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const score = business.scores[0];
    const diagnosis = business.diagnoses[0];
    const strategy = business.strategies[0];
    const snapshot = business.analysisHistory[0]?.snapshot ? JSON.parse(business.analysisHistory[0].snapshot) : null;

    const audit = {
      businessName: business.nombre,
      objective: business.goals?.[0]?.objetivo,
      businessProfile: snapshot?.businessProfile || null,
      pipelineAudit: snapshot?.analysisAudit || null,
      scoreTotal: score?.total,
      scoreDimensions: score?.dimensions.map((d) => ({
        name: d.name,
        slug: d.slug,
        points: d.points,
        confidence: d.confidence,
        weight: d.weight,
        criteria: JSON.parse(d.criteria || "[]"),
        problems: JSON.parse(d.problems || "[]"),
        strengths: JSON.parse(d.strengths || "[]"),
      })),
      diagnosis: {
        summary: diagnosis?.summary,
        bottleneck: JSON.parse(diagnosis?.bottleneck || "{}"),
        priorities: JSON.parse(diagnosis?.priorities || "[]"),
        strengths: JSON.parse(diagnosis?.strengths || "[]"),
        weaknesses: JSON.parse(diagnosis?.weaknesses || "[]"),
        opportunities: JSON.parse(diagnosis?.opportunities || "[]"),
        risks: JSON.parse(diagnosis?.risks || "[]"),
      },
      strategy: {
        objetivo: strategy?.objetivo,
        principalProblema: strategy?.principalProblema,
        situacionActual: strategy?.situacionActual,
        distanciaObjetivo: strategy?.distanciaObjetivo,
        prioridades: JSON.parse(strategy?.prioridades || "[]"),
        frameworks: JSON.parse(strategy?.frameworks || "[]"),
        frameworksRationale: strategy?.frameworksRationale,
        acciones: strategy?.actions.map((a) => ({
          title: a.title,
          description: a.description,
          impact: a.impact,
          difficulty: a.difficulty,
          rationale: a.rationale,
        })) || [],
      },
    };

    return NextResponse.json(audit);
  } catch (err) {
    return handleApiError(err);
  }
}
