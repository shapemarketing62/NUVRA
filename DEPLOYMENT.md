# Deployment de NUVRA

NUVRA mantiene SQLite para desarrollo. Staging y producción usan el schema PostgreSQL versionado en `prisma/postgresql`.

## Ambientes

- Development: SQLite, email de desarrollo, billing mock, rate limit en memoria.
- Test: SQLite descartable, proveedores falsos y browser E2E sin fuentes externas.
- Staging: PostgreSQL aislado, datos sintéticos, email de prueba, billing e integraciones mock, Redis opcional para una instancia y obligatorio al probar escalado.
- Production: PostgreSQL administrado con TLS, email real, billing real y rate limit distribuido. La validación de entorno impide iniciar con mocks críticos.

## Variables

Partir de `.env.staging.example`. No copiar secretos entre ambientes ni versionar archivos `.env`. `APP_ENV`, `DATABASE_URL`, `INTEGRATION_MASTER_KEY`, `EMAIL_PROVIDER`, `BILLING_PROVIDER` y Redis son críticos en producción. Las claves de análisis e integraciones son server-side.

## PostgreSQL y migración

1. Detener escrituras y ejecutar `npm run db:backup`.
2. Guardar el archivo y manifiesto fuera del servidor; verificar SHA-256.
3. Ejecutar `npm run db:postgres:prepare` y revisar `migration.sql`.
4. Aplicar la migración inicial a una base PostgreSQL vacía mediante `prisma migrate deploy --schema prisma/postgresql/schema.prisma`.
5. Ejecutar `npm run db:export` sobre SQLite.
6. Definir `POSTGRES_DATABASE_URL` y ejecutar `npm run db:import:postgres`.
7. Ejecutar `npm run db:validate:postgres`. Todo mismatch bloquea el cambio.
8. Ejecutar tests y smoke tests antes de habilitar tráfico.

El export contiene información sensible y debe cifrarse, restringirse y eliminarse después de la retención acordada. La importación espera una base vacía. Nunca usar `db push --accept-data-loss` en staging o producción.

## Backup, restore y rollback

`npm run db:backup` crea copia y manifiesto. `npm run db:test-restore` prueba una restauración descartable. `db-restore.js` exige ruta explícita y `--confirm`, conserva una copia previa. Programar backups PostgreSQL, PITR y pruebas periódicas de restauración con el proveedor elegido.

Para rollback, detener tráfico, volver al release anterior y restaurar el backup compatible. No realizar sincronización bidireccional improvisada entre SQLite y PostgreSQL.

## Email

`DevelopmentEmailProvider` usa un outbox en memoria y nunca registra enlaces. Antes de producción implementar `EmailProvider`, configurar dominio, SPF, DKIM, DMARC, rebotes y supresión. Verificación, reset, invitaciones, alertas y billing usan el mismo contrato.

## Redis

Development usa memoria. `REDIS_REST_URL` y `REDIS_REST_TOKEN` habilitan el store distribuido compatible con REST. Producción exige ambos. Verificar TLS, timeouts, cuotas y comportamiento fail-closed de endpoints costosos.

## Jobs

Ejecutar desde cron o worker externo, nunca mediante `setInterval`:

- `npm run jobs:cleanup-auth`: sesiones y tokens vencidos.
- `npm run jobs:expire-trials`: trials vencidos.
- `npm run jobs:billing-reconcile`: reconciliación futura, sin llamadas mientras no haya provider.
- `npm run jobs:sync-integrations`: sincronización futura, sin llamadas para conectores inactivos.
- `npm run jobs:run`: mantenimiento completo.

Reconciliación de billing, sincronización de integraciones, reintentos y limpieza temporal tienen contratos idempotentes preparados, pero deben conectarse a sus proveedores y políticas antes de producción.

## Logging y monitoring

Los logs son JSON e incluyen request/organization/business ID cuando corresponde, operación, duración, outcome y errorCode. La sanitización elimina passwords, tokens, cookies, API keys y payloads. `ErrorTracker` permite agregar un proveedor posteriormente.

Configurar retención, acceso, alertas de seguridad, errores, latencia, jobs fallidos, DB y colas.

## Health checks

- `/api/health/live`: proceso vivo.
- `/api/health/ready`: conexión DB y estado básico de dependencias.

No exponen versiones, URLs, credenciales ni detalles de excepciones.

## Playwright y CI

Instalar Chromium con `npx playwright install --with-deps chromium`. CI genera Prisma, valida tipos, ejecuta todas las suites, compila y luego corre el flujo browser contra una base descartable. Las fuentes externas se interceptan y no reciben tráfico real.

## Dominio, HTTPS y release

Configurar dominio, HTTPS obligatorio, proxy headers confiables, cookies secure, CSP y HSTS. Usar releases inmutables, migraciones previas compatibles, health checks y despliegue gradual.

Promoción staging → production: backup, migración ensayada, suite completa, smoke test, aprobación manual, despliegue gradual, observación y criterio de rollback documentado. No hay deployment automático a producción.
