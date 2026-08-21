# NUVRA — Production checklist

## Configuración y secretos

- [ ] Definir `DATABASE_URL`, `INTEGRATION_MASTER_KEY` (32 bytes base64), variables de sesión y política `REQUIRE_VERIFIED_EMAIL_FOR` en el gestor de secretos del hosting.
- [ ] Confirmar que Tavily y futuras claves de Google, Meta y X existen solo en el entorno server-side.
- [ ] Rotar claves usadas durante desarrollo y comprobar que `.env*` no está versionado.
- [ ] Documentar rotación y recuperación de la master key; sin ella los secretos cifrados no son recuperables.

## Database, migraciones y backups

- [ ] Ejecutar migraciones en staging y guardar backup verificado antes de cada release.
- [ ] Resolver el reporte de negocios legacy sin organización.
- [ ] Configurar backups automáticos, retención, restauración ensayada y alertas.
- [ ] Para PostgreSQL, seguir `docs/POSTGRESQL_MIGRATION.md`; no cambiar el provider directamente en producción.

## Red y aplicación

- [ ] Servir exclusivamente por HTTPS detrás de un proxy confiable.
- [ ] Verificar CSP, HSTS, framing, nosniff, Referrer-Policy y Permissions-Policy en el dominio final.
- [ ] Configurar hosts permitidos y probar CSRF con Origin ausente, ajeno y válido.
- [ ] Sustituir el rate limit en memoria por una implementación compartida Redis/Upstash antes de escalar a varias instancias.

## Operación

- [ ] Centralizar logging estructurado con redacción de tokens, cookies, passwords y API keys.
- [ ] Configurar monitoring de errores, latencia, colas, rate limiting, login anómalo y fuentes externas.
- [ ] Definir retención y acceso al Audit Log.
- [ ] Programar limpieza de sesiones y tokens vencidos.
- [ ] Configurar email transaccional con dominio, SPF, DKIM, DMARC, plantillas y supresión; nunca enviar tokens a logs.
- [ ] Definir workers y concurrencia para Playwright; aplicar límites de CPU, memoria, navegación y tiempo.

## Funciones todavía no habilitadas

- [ ] Billing real, webhooks idempotentes y conciliación de planes.
- [ ] Integraciones reales con Google, Meta, X, Analytics y Search Console.
- [ ] Rotación/revocación de credenciales por proveedor.

## Pruebas, deployment y rollback

- [ ] Ejecutar TypeScript, build, seguridad, producción y E2E en CI sin APIs externas reales.
- [ ] Ejecutar E2E contra staging con base aislada y datos descartables.
- [ ] Hacer smoke test de registro, verificación, onboarding, análisis simulado, dashboard, reset y logout.
- [ ] Preparar release inmutable, health checks y despliegue gradual.
- [ ] Documentar responsables, criterio de rollback, versión anterior y restauración de database.
