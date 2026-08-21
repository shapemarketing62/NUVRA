# Primer staging de NUVRA

## Requisitos del hosting

El proveedor elegido debe ejecutar contenedores Linux, aceptar procesos web y workers separados, permitir Chromium sandboxed o mediante usuario no-root, ofrecer al menos 2 GB de RAM por worker de análisis, disco temporal, variables cifradas, logs JSON, health checks HTTP y despliegues inmutables. Debe poder comunicarse por TLS con PostgreSQL, Redis REST, email y futuras APIs. El timeout HTTP debe superar el límite global del análisis o permitir moverlo posteriormente a una cola.

## Secuencia exacta

1. **Crear PostgreSQL.** Crear una base vacía exclusiva de staging, TLS obligatorio, usuario de mínimos privilegios, backups y retención. No usar datos reales.
2. **Configurar Redis.** Proveer una API REST compatible con `RedisRateLimitStore`; verificar TLS, token, cuotas y latencia.
3. **Configurar variables.** Partir de `.env.staging.example`, usar `APP_ENV=staging`, guardar valores en el secret manager y no subir archivos `.env`.
4. **Generar master key.** Generar 32 bytes aleatorios codificados en base64, guardar una copia recuperable y definir `INTEGRATION_MASTER_KEY`.
5. **Configurar dominio staging.** Crear un subdominio aislado, HTTPS, redirects y callback URLs de staging. No reutilizar producción.
6. **Ejecutar migraciones.** Crear backup si la base ya existe y ejecutar `npm run staging:init`. Usa `prisma migrate deploy`, nunca `db push`.
7. **Levantar aplicación.** Construir la imagen con versión, commit y fecha. Iniciar como usuario no-root y comprobar que no contiene `.env`.
8. **Levantar workers.** Programar comandos independientes: `jobs:cleanup-auth`, `jobs:expire-trials`, `jobs:billing-reconcile`, `jobs:sync-integrations`, `jobs:retry-sources` y `jobs:cleanup-temporary`. Los conectores no activados deben devolver estado no configurado sin llamadas externas.
9. **Health checks.** Verificar `/api/health/live` y `/api/health/ready` desde dentro y fuera de la red del hosting.
10. **E2E.** Ejecutar `APP_ENV=staging E2E_BASE_URL=https://staging... npm run smoke:test`. Usa usuarios identificados como E2E y los limpia al terminar.
11. **Smoke tests.** Confirmar registro, verificación, login, negocio, análisis mock, dashboard, billing mock, aislamiento y logout.
12. **Prueba de backup.** Crear un backup PostgreSQL consistente, checksum, cifrado, retención y copia fuera del servicio principal.
13. **Prueba de restore.** Restaurar en una base descartable y ejecutar validación de conteos y health checks. Nunca restaurar sobre staging activo.
14. **Aprobación manual.** Revisar release check, logs, jobs, E2E, backup/restore, costos y rollback. No promover automáticamente.

## Rollback operativo

Detener nuevas escrituras, conservar evidencia del error, volver a la imagen anterior y restaurar el backup solo si la migración no es backward-compatible. Verificar conteos, permisos entre organizaciones y health checks antes de reabrir tráfico.

## Datos

`staging:init` no crea usuarios. `staging:seed-demo` es opcional, requiere confirmación explícita y crea únicamente entidades marcadas `DEMO`. Tests y smoke usan emails `e2e-*`; producción nunca debe ejecutar ninguno de estos seeds.
