const { PrismaClient } = require("@prisma/client");

function readArgument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const email = readArgument("email")?.trim().toLowerCase();
const role = readArgument("role")?.trim().toUpperCase();
const confirmation = readArgument("confirm")?.trim().toLowerCase();
const allowedRoles = new Set(["INTERNAL", "ADMIN", "NONE"]);

if (!email || !role || !allowedRoles.has(role) || confirmation !== email) {
  process.stderr.write(
    "Uso: node scripts/set-internal-user.js --email usuario@dominio.com --role INTERNAL|ADMIN|NONE --confirm usuario@dominio.com\n"
  );
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, internalRole: true },
  });
  if (!existing) throw new Error("user_not_found");

  const nextRole = role === "NONE" ? null : role;
  const updated = await prisma.$transaction(async (transaction) => {
    const user = await transaction.user.update({
      where: { id: existing.id },
      data: { internalRole: nextRole },
      select: { id: true, email: true, internalRole: true },
    });
    await transaction.auditLog.create({
      data: {
        action: "user.internal_access_changed",
        targetType: "user",
        targetId: user.id,
        metadata: JSON.stringify({ from: existing.internalRole, to: nextRole, source: "operator_cli" }),
      },
    });
    return user;
  });
  process.stdout.write(
    `${updated.email}: acceso interno ${updated.internalRole || "desactivado"}. Negocios y análisis no fueron modificados.\n`
  );
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "internal_access_update_failed"}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
