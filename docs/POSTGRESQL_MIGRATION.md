# Migración futura de SQLite a PostgreSQL

NUVRA continúa usando SQLite. Este documento describe el cambio futuro; no lo ejecuta.

## Incompatibilidades a revisar

- Cambiar `provider = "sqlite"` por `provider = "postgresql"` y usar una `DATABASE_URL` TLS.
- Tratar `IntegrationSecret.businessId` nulo con un índice único parcial en PostgreSQL. La unicidad SQL con valores nulos no evita por sí sola dos secretos de organización para el mismo proveedor; la capa de servicio ya busca antes de crear.
- Validar precisión y zona horaria de todos los `DateTime`.
- Mantener los campos JSON serializados como texto en la primera migración. Convertirlos a `Json` debe ser un cambio posterior y verificable.
- Revisar tamaño de snapshots, auditoría y datos crudos antes de elegir límites y políticas de retención.

## Procedimiento

1. Detener escrituras o activar una ventana de mantenimiento.
2. Crear backup consistente de `prisma/dev.db`, calcular checksum y probar su apertura.
3. Provisionar PostgreSQL con TLS, usuario de mínimos privilegios y backups automáticos.
4. Generar una migración Prisma limpia para PostgreSQL en un entorno descartable.
5. Exportar cada tabla preservando IDs y fechas; importar primero padres y luego relaciones.
6. Recrear índices, restricciones y el índice único parcial de secretos sin `businessId`.
7. Ejecutar las validaciones posteriores y recién entonces cambiar el tráfico.

## Validaciones posteriores

- Conteo por tabla y conteo de relaciones huérfanas iguales a cero.
- Muestreo de usuarios, organizaciones, membresías, negocios, análisis e historial.
- Separación entre organizaciones y permisos por rol.
- Tokens hasheados no reversibles y secretos de integración descifrables solo con la master key correcta.
- Registro, login, reset, verificación, análisis simulado y suite completa de tests.

## Rollback

Mantener SQLite sin escrituras y el release anterior disponible hasta finalizar las validaciones. Si falla una validación, cortar tráfico al release nuevo, restaurar la aplicación anterior y reabrir el archivo SQLite respaldado. No intentar sincronización bidireccional improvisada; repetir la migración desde un backup limpio.
