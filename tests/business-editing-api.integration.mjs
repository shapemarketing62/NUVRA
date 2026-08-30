import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.NUVRA_TEST_URL || "http://localhost:3000";

test("edición real persiste, versiona objetivo, audita y rechaza conflictos/viewer", async () => {
  const suffix = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const user = await prisma.user.create({ data: { email: `business-edit-${suffix}@test.local`, passwordHash: "test-only" } });
  const organization = await prisma.organization.create({ data: { name: "Edición test", slug: `business-edit-${suffix}`, memberships: { create: { userId: user.id, role: "owner" } } } });
  const business = await prisma.business.create({ data: {
    organizationId: organization.id,
    nombre: "Nombre anterior",
    rubro: "Cafetería",
    webUrl: "https://old.example/",
    instagramHandle: "https://www.instagram.com/oldprofile/",
    goals: { create: { objetivo: "Conseguir reservas", plazoDias: 90, plazoLabel: "3 meses" } },
  } });
  await prisma.authSession.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 60_000) } });
  const headers = { "Content-Type": "application/json", Origin: baseUrl, Cookie: `nuvra_session=${token}` };
  try {
    const response = await fetch(`${baseUrl}/api/business?id=${business.id}`, { method: "PATCH", headers, body: JSON.stringify({
      expectedUpdatedAt: business.updatedAt.toISOString(),
      business: { nombre: "Nombre actualizado", rubro: "Cafetería de especialidad", webUrl: "new.example", instagramHandle: "@newprofile", noWebDeclared: false, noInstagramDeclared: false },
      goal: { objetivo: "Aumentar la recompra", objetivoCustom: null, magnitud: 15, plazoDias: 180, plazoLabel: "6 meses" },
    }) });
    assert.equal(response.status, 200, await response.text());

    const stored = await prisma.business.findUniqueOrThrow({ where: { id: business.id }, include: { goals: { orderBy: { createdAt: "asc" } } } });
    assert.equal(stored.nombre, "Nombre actualizado");
    assert.equal(stored.webUrl, "https://new.example/");
    assert.equal(stored.instagramHandle, "https://www.instagram.com/newprofile/");
    assert.equal(stored.goals.length, 2);
    assert.equal(stored.goals[0].isActive, false);
    assert.equal(stored.goals[1].isActive, true);
    assert.equal(stored.goals[1].objetivo, "Aumentar la recompra");
    assert.equal(await prisma.auditLog.count({ where: { organizationId: organization.id, action: { in: ["business.updated", "business.goal_changed"] } } }), 2);

    const conflict = await fetch(`${baseUrl}/api/business?id=${business.id}`, { method: "PATCH", headers, body: JSON.stringify({ expectedUpdatedAt: business.updatedAt.toISOString(), business: { nombre: "Pisada tardía" } }) });
    assert.equal(conflict.status, 409);

    await prisma.membership.updateMany({ where: { organizationId: organization.id, userId: user.id }, data: { role: "viewer" } });
    const forbidden = await fetch(`${baseUrl}/api/business?id=${business.id}`, { method: "PATCH", headers, body: JSON.stringify({ expectedUpdatedAt: stored.updatedAt.toISOString(), business: { nombre: "No autorizado" } }) });
    assert.equal(forbidden.status, 403);
  } finally {
    await prisma.auditLog.deleteMany({ where: { organizationId: organization.id } });
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
