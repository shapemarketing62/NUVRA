import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeUrl } from "@/lib/utils";
import { apiError, handleApiError, readJsonBody } from "@/lib/server/api-response";
import { authorizeBusiness, requireUser, roleCan } from "@/lib/server/authorization";
import { canConsume } from "@/lib/server/usage";
import { writeAuditEvent } from "@/lib/server/audit";
import { hasInternalAccess } from "@/lib/server/internal-access";
import { parseInstagramProfile } from "@/lib/instagram-profile";
import { businessInputSchema } from "@/lib/business-input";
import { businessUpdateSchema } from "@/lib/business-update";
import { enforceSameOrigin } from "@/lib/server/csrf";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return apiError("unauthorized", 401);
    const membership = auth.user.memberships.find((item) => roleCan(item.role, "business.create"));
    if (!membership) return apiError("forbidden", 403);
    if (!(await canConsume(membership.organizationId, "businesses", 1, auth.user.id))) return apiError("usage_limit_reached", 403);
    const body = await readJsonBody(req, 32_000);
    const data = businessInputSchema.parse(body);

    let webUrl: string | undefined;
    if (data.webUrl) {
      try { webUrl = normalizeEditableWebsite(data.webUrl) || undefined; }
      catch { return apiError("validation_error", 400, [{ field: "webUrl", message: "Ingresá una página web HTTP o HTTPS válida." }]); }
    }
    const instagram = data.instagramHandle ? parseInstagramProfile(data.instagramHandle) : null;
    if (data.instagramHandle && !instagram) return apiError("validation_error", 400, [{ field: "instagramHandle", message: "Ingresá un usuario o perfil de Instagram válido." }]);

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
        instagramHandle: instagram?.url,
        noWebDeclared: data.noWebDeclared,
        noInstagramDeclared: data.noInstagramDeclared,
        otrosCanales: data.otrosCanales,
        canales: JSON.stringify(data.canales || []),
        facturacion: data.facturacion ?? undefined,
        clientesMensuales: data.clientesMensuales ?? undefined,
        inversionMarketing: data.inversionMarketing ?? undefined,
        ...(webUrl ? { websites: { create: { url: webUrl } } } : {}),
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
            igUsername: instagram?.handle,
          },
        },
      },
    });

    try {
      await writeAuditEvent({ actorUserId: auth.user.id, organizationId: membership.organizationId, action: "business.created", targetType: "business", targetId: business.id });
    } catch {
      // El negocio ya fue persistido; un fallo secundario de auditoría no debe presentar la creación como fallida.
    }

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

  const business = await prisma.business.findUnique({
    where: { id },
    select: {
      id: true,
      organizationId: true,
      nombre: true,
      rubro: true,
      descripcion: true,
      ubicacion: true,
      ciudad: true,
      pais: true,
      tamano: true,
      tipoCliente: true,
      publicoObjetivo: true,
      productosServicios: true,
      ticketPromedio: true,
      empleados: true,
      webUrl: true,
      instagramHandle: true,
      noWebDeclared: true,
      noInstagramDeclared: true,
      otrosCanales: true,
      canales: true,
      facturacion: true,
      clientesMensuales: true,
      inversionMarketing: true,
      updatedAt: true,
      goals: { where: { isActive: true }, orderBy: { createdAt: "desc" }, take: 1 },
      instagramConnection: {
        select: { id: true, status: true, igUsername: true, tokenExpiry: true, createdAt: true, updatedAt: true },
      },
    },
  });

  if (!business) return apiError("not_found", 404);

  return NextResponse.json({
    ...business,
    planTier: access.organization.planTier || "FREE",
    internalAccess: hasInternalAccess(access.user),
  });
}

function emptyToNull(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeEditableWebsite(value: string | null | undefined) {
  const candidate = emptyToNull(value);
  if (!candidate) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate) && !/^https?:\/\//i.test(candidate)) throw new Error("invalid_website_protocol");
  const normalized = normalizeUrl(candidate);
  const parsed = new URL(normalized);
  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) throw new Error("invalid_website_url");
  parsed.hash = "";
  return parsed.toString();
}

export async function PATCH(req: NextRequest) {
  try {
    const csrfError = enforceSameOrigin(req);
    if (csrfError) return csrfError;
    const id = req.nextUrl.searchParams.get("id");
    if (!id || id.length > 100) return apiError("validation_error", 400);
    const access = await authorizeBusiness(id, "business.update");
    if (!access.ok) return apiError(access.reason, access.reason === "unauthorized" ? 401 : 403);

    const input = businessUpdateSchema.parse(await readJsonBody(req, 32_000));
    let webUrl: string | null | undefined;
    try {
      if (input.business && ("webUrl" in input.business || input.business.noWebDeclared === true)) {
        webUrl = input.business.noWebDeclared ? null : normalizeEditableWebsite(input.business.webUrl);
      }
    } catch {
      return apiError("validation_error", 400, [{ field: "business.webUrl", message: "Ingresá una página web HTTP o HTTPS válida." }]);
    }

    let instagram: ReturnType<typeof parseInstagramProfile> | undefined;
    if (input.business && ("instagramHandle" in input.business || input.business.noInstagramDeclared === true)) {
      instagram = input.business.noInstagramDeclared ? null : parseInstagramProfile(input.business.instagramHandle);
      if (input.business.instagramHandle && !instagram) {
        return apiError("validation_error", 400, [{ field: "business.instagramHandle", message: "Ingresá un usuario o perfil de Instagram válido." }]);
      }
    }

    const expectedUpdatedAt = new Date(input.expectedUpdatedAt);
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.business.findUnique({
        where: { id },
        include: { goals: { where: { isActive: true }, orderBy: { createdAt: "desc" }, take: 1 } },
      });
      if (!current || current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) return { conflict: true as const };

      const businessData: Record<string, unknown> = {};
      const changedBusinessFields: string[] = [];
      const requested = input.business || {};
      const assign = (field: string, value: unknown, currentValue: unknown) => {
        if (value !== undefined && value !== currentValue) {
          businessData[field] = value;
          changedBusinessFields.push(field);
        }
      };
      assign("nombre", requested.nombre, current.nombre);
      assign("rubro", requested.rubro, current.rubro);
      for (const field of ["descripcion", "ubicacion", "ciudad", "pais", "empleados", "otrosCanales"] as const) {
        if (field in requested) assign(field, emptyToNull(requested[field]), current[field]);
      }
      if ("canales" in requested) {
        const serialized = JSON.stringify(Array.from(new Set(requested.canales || [])));
        assign("canales", serialized, current.canales || "[]");
      }
      if ("inversionMarketing" in requested) assign("inversionMarketing", requested.inversionMarketing ?? null, current.inversionMarketing);
      if (webUrl !== undefined) assign("webUrl", webUrl, current.webUrl);
      if ("noWebDeclared" in requested || webUrl !== undefined) assign("noWebDeclared", requested.noWebDeclared === true, current.noWebDeclared);
      if (instagram !== undefined) assign("instagramHandle", instagram?.url || null, current.instagramHandle);
      if ("noInstagramDeclared" in requested || instagram !== undefined) assign("noInstagramDeclared", requested.noInstagramDeclared === true, current.noInstagramDeclared);

      const activeGoal = current.goals[0];
      const goalChanged = Boolean(input.goal) && (!activeGoal
        || activeGoal.objetivo !== input.goal!.objetivo
        || (activeGoal.objetivoCustom || null) !== (emptyToNull(input.goal!.objetivoCustom))
        || (activeGoal.magnitud ?? null) !== (input.goal!.magnitud ?? null)
        || activeGoal.plazoDias !== input.goal!.plazoDias
        || activeGoal.plazoLabel !== input.goal!.plazoLabel);

      if (changedBusinessFields.length || goalChanged) {
        await tx.business.update({ where: { id }, data: { ...businessData, updatedAt: new Date() } });
      }
      if (webUrl && webUrl !== current.webUrl) await tx.website.create({ data: { businessId: id, url: webUrl } });
      if (instagram !== undefined) {
        await tx.instagramConnection.upsert({
          where: { businessId: id },
          create: { businessId: id, status: process.env.META_APP_ID ? "disconnected" : "not_configured", igUsername: instagram?.handle || null },
          update: { igUsername: instagram?.handle || null, ...(instagram === null ? { status: "disconnected" } : {}) },
        });
      }
      if (goalChanged && input.goal) {
        await tx.businessGoal.updateMany({ where: { businessId: id, isActive: true }, data: { isActive: false } });
        await tx.businessGoal.create({ data: {
          businessId: id,
          objetivo: input.goal.objetivo,
          objetivoCustom: emptyToNull(input.goal.objetivoCustom),
          magnitud: input.goal.magnitud ?? null,
          plazoDias: input.goal.plazoDias,
          plazoLabel: input.goal.plazoLabel,
        } });
      }

      const updated = await tx.business.findUnique({
        where: { id },
        select: { id: true, updatedAt: true, goals: { where: { isActive: true }, orderBy: { createdAt: "desc" }, take: 1 } },
      });
      return { conflict: false as const, updated, changedBusinessFields, goalChanged };
    });

    if (result.conflict) {
      return NextResponse.json({ error: { code: "conflict", message: "La información cambió mientras la estabas editando. Volvé a cargarla antes de guardar." } }, { status: 409 });
    }
    try {
      if (result.changedBusinessFields.length) await writeAuditEvent({
        actorUserId: access.user.id,
        organizationId: access.organization.id,
        action: "business.updated",
        targetType: "business",
        targetId: id,
        metadata: { changedFields: result.changedBusinessFields },
      });
      if (result.goalChanged) await writeAuditEvent({
        actorUserId: access.user.id,
        organizationId: access.organization.id,
        action: "business.goal_changed",
        targetType: "business_goal",
        targetId: result.updated?.goals[0]?.id,
        metadata: { changedFields: ["objetivo", "objetivoCustom", "magnitud", "plazoDias", "plazoLabel"] },
      });
    } catch {
      // La edición ya quedó persistida; la auditoría no debe provocar un falso error ni un reintento duplicado.
    }
    return NextResponse.json({ success: true, updatedAt: result.updated?.updatedAt.toISOString(), goal: result.updated?.goals[0] || null });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id || id.length > 100) return apiError("validation_error", 400);
    const access = await authorizeBusiness(id, "business.delete");
    if (!access.ok) return apiError(access.reason, access.reason === "unauthorized" ? 401 : 403);
    await prisma.business.delete({ where: { id } });
    try {
      await writeAuditEvent({ actorUserId: access.user.id, organizationId: access.organization.id, action: "business.deleted", targetType: "business", targetId: id });
    } catch {
      // La eliminación ya ocurrió; no devolver un error falso por una auditoría secundaria.
    }
    return NextResponse.json({ success: true });
  } catch (error) { return handleApiError(error); }
}
