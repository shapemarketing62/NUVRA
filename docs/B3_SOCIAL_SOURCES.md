# B3 — Fuentes sociales públicas

Esta etapa prepara evidencia multifuentente sin simular acceso ni métricas privadas. Una cuenta solo se usa después de validar entidad y su mera existencia no genera una fortaleza ni puntos.

## Contrato común

Todos los conectores devuelven estado, identidad, `entityConfidence`, perfil, contenido público, comentarios, menciones, métricas públicas permitidas, URLs, fechas, cobertura, limitaciones y errores seguros. El agregador aplica timeout, un reintento corto y aislamiento por fuente.

## Disponibilidad por plataforma

- **X / Twitter:** conversación espontánea, menciones, respuestas, quejas, recomendaciones y actualidad. Para una lectura estable requiere X API con `tweet.read`, `users.read` y, cuando corresponda, OAuth. No se interpreta seguidores como calidad.
- **TikTok:** perfil, videos públicos, temas, llamados a la acción y comentarios cuando el mecanismo oficial los permita. La cobertura estable requiere acceso oficial aprobado. No se afirma viralidad desde datos incompletos.
- **Reddit:** posts y comentarios públicos, subreddit, fecha, URL, discusión y métricas públicas disponibles. Puede usarse mediante API o acceso público permitido; siempre se filtran homónimos y una voz no representa al mercado.
- **Facebook:** página, categoría, ubicación, contacto, publicaciones, eventos, recomendaciones y comentarios cuando Meta API lo permita. Requiere aplicación Meta y permisos aprobados para cobertura estable.
- **LinkedIn:** descripción, especialización, publicaciones, casos y señales públicas de autoridad. El acceso automatizado estable requiere una API o acuerdo oficial; no se recolectan datos personales innecesarios.
- **YouTube:** canal, videos, descripciones, búsquedas de terceros y comentarios públicos. Requiere YouTube Data API para cobertura estable. Vistas o suscriptores no equivalen automáticamente a calidad.

## Datos que no se simulan

No se inventan alcance, impresiones, ventas atribuidas, audiencia privada, sentimiento, viralidad, seguidores, comentarios ocultos ni contenido que el proveedor no haya devuelto. Sin acceso fiable la fuente queda `unavailable`, `requires_auth` o `partial`.

## Relevancia y costo

`SourceRelevancePlanner` clasifica cada fuente como `primary`, `secondary` u `optional` según modelo comercial, objetivo, público y canales declarados. Las fuentes opcionales no se consultan salvo presencia declarada o evidencia relevante. Esta clasificación es interna y no modifica todavía la fórmula global de coverage.

## Trazabilidad

`AnalysisTrace` conserva planificación, estado, cuentas encontradas, confianza de identidad, contenido aceptado/rechazado, comentarios, limitaciones, errores, diferencias entre plataformas e identidad utilizada. La interfaz comercial sigue recibiendo problemas, fortalezas, oportunidades y acciones en lenguaje simple.

## B3.5 — adquisición operativa

Cuando existe `TAVILY_API_KEY`, las fuentes relevantes utilizan un fallback indexado con consultas `site:` limitadas. El resultado siempre conserva `acquisitionMethod: search_index` y nunca se presenta como análisis completo de la plataforma.

Estados internos:

- `not_found`: no se validó evidencia.
- `discovered`: se identificó un perfil, pero no se analizó contenido.
- `partial`: existen piezas públicas indexadas o acceso incompleto.
- `analyzed`: un mecanismo oficial devolvió el conjunto de capacidades solicitado.
- `requires_auth`, `unavailable`, `error`: la fuente no aportó evidencia utilizable.

El presupuesto predeterminado es de 12 consultas globales, hasta 3 por fuente y 12 resultados aceptados por fuente. Las fuentes primarias pueden usar 3 consultas, las secundarias 2 y las opcionales 1. El proceso detiene búsquedas al alcanzar el presupuesto o evidencia suficiente y deduplica queries. La frescura es de dos horas para X, Reddit y TikTok; cuatro para YouTube; y ocho para Facebook y LinkedIn.

La evidencia registra uno de estos métodos: `official_api`, `authenticated_integration`, `public_page`, `search_index` o `declared_by_user`. Los snippets indexados solo se usan como opinión cuando contienen lenguaje experiencial explícito; si no tienen autor, todas las piezas indexadas de una plataforma cuentan como una única voz desconocida.

Google Business Profile usa `official_api` con `GOOGLE_PLACES_API_KEY`. Sin key, el fallback experimental de la página pública solo se acepta cuando la entidad supera el umbral; queda `partial` y puede fallar por cambios, captcha o rate limiting.
