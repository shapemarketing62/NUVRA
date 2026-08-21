import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizeUrl } from "@/lib/utils";
import { apiError, handleApiError, readJsonBody } from "@/lib/server/api-response";
import { authorizeBusiness, requireUser, roleCan } from "@/lib/server/authorization";
import { canConsume } from "@/lib/server/usage";
import { getUsageLimit } from "@/lib/plans";
import { writeAuditEvent } from "@/lib/server/audit";

const businessSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  rubro: z.string().trim().min(1).max(120),
  descripcion: z.string().max(2000).optional(),
  ubicacion: z.string().optional(),
  ciudad: z.string().optional(),
  pais: z.string().optional(),
  tamano: z.string().optional(),
  tipoCliente: z.string().optional(),
  publicoObjetivo: z.string().optional(),
  productosServicios: z.string().optional(),
  ticketPromedio: z.number().optional().nullable(),
  empleados: z.string().optional(),
  webUrl: z.string().trim().min(1).max(2048),
  instagramHandle: z.string().optional(),
  otrosCanales: z.string().optional(),
  canales: z.array(z.string()).optional(),
  facturacion: z.number().optional().nullable(),
  clientesMensuales: z.number().optional().nullable(),
  inversionMarketing: z.number().optional().nullable(),
  objetivo: z.string().min(1),
  objetivoCustom: z.string().optional(),
  magnitud: z.number().optional().nullable(),
  plazoDias: z.number().min(1),
  plazoLabel: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return apiError("unauthorized", 401);
    const membership = auth.user.memberships.find((item) => roleCan(item.role, "business.create"));
    if (!membership) return apiError("forbidden", 403);
    if (!(await canConsume(membership.organizationId, "businesses"))) return apiError("usage_limit_reached", 403);
    const body = await readJsonBody(req, 32_000);
    const data = businessSchema.parse(body);

    let webUrl = data.webUrl;
    try {
      webUrl = normalizeUrl(data.webUrl);
    } catch {
      return NextResponse.json({ error: "URL de sitio web inválida" }, { status: 400 });
    }

    const business = await prisma.business.create({
      data: {
        nombre: data.nombre,
        organizationId: membership.organizationId,
        rubro: data.rubro,
        descripcion: data.descripcion,
        ubicacion: data.ubicacion,
        ciudad: data.ciudad,
        pais: data.pais,
        tamano: data.tamano,
        tipoCliente: data.tipoCliente,
        publicoObjetivo: data.publicoObjetivo,
        productosServicios: data.productosServicios,
        ticketPromedio: data.ticketPromedio ?? undefined,
        empleados: data.empleados,
        webUrl,
        instagramHandle: data.instagramHandle,
        otrosCanales: data.otrosCanales,
        canales: JSON.stringify(data.canales || []),
        facturacion: data.facturacion ?? undefined,
        clientesMensuales: data.clientesMensuales ?? undefined,
        inversionMarketing: data.inversionMarketing ?? undefined,
        websites: { create: { url: webUrl } },
        goals: {
          create: {
            objetivo: data.objetivo,
            objetivoCustom: data.objetivoCustom,
            magnitud: data.magnitud ?? undefined,
            plazoDias: data.plazoDias,
            plazoLabel: data.plazoLabel,
          },
        },
        instagramConnection: {
          create: {
            status: process.env.META_APP_ID ? "disconnected" : "not_configured",
            igUsername: data.instagramHandle?.replace("@", ""),
          },
        },
      },
    });

    await writeAuditEvent({ actorUserId: auth.user.id, organizationId: membership.organizationId, action: "business.created", targetType: "business", targetId: business.id });

    return NextResponse.json({ businessId: business.id });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    const auth = await requireUser();
    if (!auth.ok) return apiError("unauthorized", 401);
    const businesses = await prisma.business.findMany({ where: { organization: { memberships: { some: { userId: auth.user.id } } } }, select: { id: true, nombre: true, rubro: true, organizationId: true, updatedAt: true }, orderBy: { updatedAt: "desc" } });
    return NextResponse.json({ businesses });
  }
  if (id.length > 100) return apiError("validation_error", 400);
  const access = await authorizeBusiness(id, "business.read");
  if (!access.ok) return apiError(access.reason, access.reason === "unauthorized" ? 401 : 403);

  const actionLimit = getUsageLimit(access.organization.planTier, "activeActions");
  const competitorLimit = getUsageLimit(access.organization.planTier, "visibleCompetitors");
  const historyLimit = Math.max(1, getUsageLimit(access.organization.planTier, "historicalMonths"));
  const business = await prisma.business.findUnique({
    where: { id },
    include: {
      organization: true,
      goals: { where: { isActive: true }, orderBy: { createdAt: "desc" }, take: 1 },
      instagramConnection: true,
      scores: { orderBy: { createdAt: "desc" }, take: 1, include: { dimensions: true } },
      diagnoses: { orderBy: { createdAt: "desc" }, take: 1 },
      strategies: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { actions: { orderBy: { order: "asc" }, take: actionLimit } },
      },
      analysisHistory: { orderBy: { createdAt: "desc" }, take: historyLimit },
    },
  });

  if (!business) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const { organization, ...rest } = business;
  const safeHistory = rest.analysisHistory.map((item) => {
    if (!item.snapshot) return item;
    try {
      const snapshot = JSON.parse(item.snapshot);
      const competitors = snapshot?.intelligence?.competitorSummary?.competitors;
      if (Array.isArray(competitors)) snapshot.intelligence.competitorSummary.competitors = competitors.slice(0, competitorLimit);
      return { ...item, snapshot: JSON.stringify(snapshot) };
    } catch { return { ...item, snapshot: null }; }
  });

  return NextResponse.json({
    ...rest,
    analysisHistory: safeHistory,
    planTier: organization?.planTier || "FREE",
  });
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id || id.length > 100) return apiError("validation_error", 400);
    const access = await authorizeBusiness(id, "business.delete");
    if (!access.ok) return apiError(access.reason, access.reason === "unauthorized" ? 401 : 403);
    await prisma.business.delete({ where: { id } });
    await writeAuditEvent({ actorUserId: access.user.id, organizationId: access.organization.id, action: "business.deleted", targetType: "business", targetId: id });
    return NextResponse.json({ success: true });
  } catch (error) { return handleApiError(error); }
}
