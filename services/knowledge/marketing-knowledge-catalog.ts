import { MarketingKnowledgeEngine, type KnowledgeRule, type KnowledgeSource } from "./marketing-knowledge-engine.ts";

const retrievedAt = "2026-09-01";

export const MARKETING_KNOWLEDGE_SOURCES: KnowledgeSource[] = [
  { id: "w3c-wcag-contrast", publisher: "W3C", title: "WCAG 2.2 — Contrast (Minimum)", url: "https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum", publishedAt: null, retrievedAt, type: "standard", authorityLevel: "primary" },
  { id: "w3c-wcag-reflow", publisher: "W3C", title: "WCAG 2.2 — Reflow", url: "https://www.w3.org/WAI/WCAG22/Understanding/reflow.html", publishedAt: null, retrievedAt, type: "standard", authorityLevel: "primary" },
  { id: "nng-visual-hierarchy", publisher: "Nielsen Norman Group", title: "Visual Hierarchy in UX", url: "https://www.nngroup.com/articles/visual-hierarchy-ux-definition/", publishedAt: "2021-01-17", retrievedAt, type: "research", authorityLevel: "research" },
  { id: "nng-homepage", publisher: "Nielsen Norman Group", title: "Homepage Design: 5 Fundamental Principles", url: "https://www.nngroup.com/articles/homepage-design-principles/", publishedAt: "2024-02-01", retrievedAt, type: "research", authorityLevel: "research" },
  { id: "nng-scannability", publisher: "Nielsen Norman Group", title: "How Users Read on the Web", url: "https://www.nngroup.com/articles/how-users-read-on-the-web/", publishedAt: "1997-09-30", retrievedAt, type: "research", authorityLevel: "research" },
  { id: "google-local-ranking", publisher: "Google", title: "Tips to improve your local ranking on Google", url: "https://support.google.com/business/answer/7091", publishedAt: null, retrievedAt, type: "official_documentation", authorityLevel: "primary" },
  { id: "youtube-recommendations", publisher: "YouTube", title: "How YouTube recommendations work", url: "https://support.google.com/youtube/answer/16089387", publishedAt: null, retrievedAt, type: "official_documentation", authorityLevel: "primary" },
  { id: "youtube-search", publisher: "YouTube", title: "How YouTube search works", url: "https://support.google.com/youtube/answer/16090438", publishedAt: null, retrievedAt, type: "official_documentation", authorityLevel: "primary" },
  { id: "tiktok-for-you", publisher: "TikTok", title: "How TikTok recommends videos #ForYou", url: "https://newsroom.tiktok.com/how-tik-tok-recommends-video-for-you", publishedAt: "2023-11-01", retrievedAt, type: "official_documentation", authorityLevel: "primary" },
  { id: "linkedin-feed", publisher: "LinkedIn", title: "LinkedIn relevance — Optimizing the member experience", url: "https://www.linkedin.com/help/linkedin/answer/a1339724", publishedAt: null, retrievedAt, type: "official_documentation", authorityLevel: "primary" },
  { id: "meta-instagram-recommendations", publisher: "Meta", title: "Reshape Your Instagram With a Recommendations Reset", url: "https://about.fb.com/news/2024/11/introducing-recommendations-reset-instagram/", publishedAt: "2024-11-19", retrievedAt, type: "official_documentation", authorityLevel: "primary" },
  { id: "meta-instagram-feed-system-card", publisher: "Meta", title: "Instagram Feed Ranking System Card", url: "https://ai.meta.com/tools/system-cards/instagram-feed-ranking/", publishedAt: null, retrievedAt, type: "official_documentation", authorityLevel: "primary" },
  { id: "meta-ranking-system-cards", publisher: "Meta", title: "How AI powers experiences on Facebook and Instagram", url: "https://ai.meta.com/blog/how-ai-powers-experiences-facebook-instagram-system-cards/", publishedAt: "2023-06-29", retrievedAt, type: "official_documentation", authorityLevel: "primary" },
  { id: "meta-facebook-home", publisher: "Meta", title: "Introducing Home and Feeds on Facebook", url: "https://about.fb.com/news/2022/07/home-and-feeds-on-facebook/", publishedAt: "2022-07-21", retrievedAt, type: "official_documentation", authorityLevel: "primary" },
  { id: "x-recommendations", publisher: "X", title: "Annual Systemic Risk Assessment 2025", url: "https://transparency.x.com/content/dam/transparency-twitter/dsa/2025-x-dsa-sra-summary-report.pdf", publishedAt: "2025-01-01", retrievedAt, type: "official_documentation", authorityLevel: "primary" },
  { id: "youtube-shorts-discovery", publisher: "YouTube", title: "Search and discovery tips — Shorts", url: "https://support.google.com/youtube/answer/11914225", publishedAt: null, retrievedAt, type: "official_documentation", authorityLevel: "primary" },
  { id: "pinterest-home-feed", publisher: "Pinterest", title: "Explore the home feed", url: "https://help.pinterest.com/en/article/explore-the-home-feed", publishedAt: null, retrievedAt, type: "official_documentation", authorityLevel: "primary" },
];

export const MARKETING_KNOWLEDGE_RULES: KnowledgeRule[] = [
  rule("web.contrast.minimum", "accessibility", "contrast", "El texto normal necesita contraste suficiente con su fondo; el texto grande admite un umbral menor.", "Un contraste medible insuficiente puede impedir comprender la propuesta o completar una acción.", "OFFICIAL", "w3c-wcag-contrast", ["color", "legibility"]),
  rule("web.reflow.mobile", "accessibility", "responsive", "El contenido debe reacomodarse sin pérdida ni scroll horizontal en anchos reducidos.", "El desborde horizontal comprobado es una fricción de lectura y acción en mobile.", "OFFICIAL", "w3c-wcag-reflow", ["layout", "mobile"]),
  rule("web.hierarchy.focus", "visual_design", "hierarchy", "La jerarquía visual debe orientar la atención hacia los elementos más importantes mediante escala, contraste y agrupación.", "Si título, contenido y acciones compiten con igual peso, cuesta identificar el próximo paso.", "OBSERVED", "nng-visual-hierarchy", ["hierarchy", "cta"]),
  rule("web.home.value-proposition", "website", "proposition", "La portada debe explicar qué ofrece el negocio y por qué elegirlo.", "Una propuesta visible ayuda a evaluar rápidamente si el negocio responde a la necesidad del visitante.", "OBSERVED", "nng-homepage", ["hero", "proposition"]),
  rule("web.home.primary-action", "conversion", "cta", "Las tareas prioritarias deben tener etiquetas descriptivas y prominencia acorde.", "La acción comercial principal debe poder identificarse sin competir con múltiples acciones equivalentes.", "OBSERVED", "nng-homepage", ["hero", "cta", "conversion"]),
  rule("web.content.scannable", "website", "scannability", "Los usuarios suelen escanear; subtítulos, listas y párrafos acotados facilitan encontrar información.", "La estructura del contenido debe permitir comprender la oferta sin leer todo de principio a fin.", "OBSERVED", "nng-scannability", ["copy", "scannability"]),
  platformRule("google.local.factors", "google_business_profile", "local_results", "local_discovery", "Google describe relevancia, distancia y prominencia como factores principales de resultados locales, sin publicar pesos.", "google-local-ranking"),
  platformRule("youtube.home.personalized", "youtube", "home", "recommendations", "Home es una superficie personalizada; el historial y las respuestas del espectador participan en las recomendaciones.", "youtube-recommendations"),
  platformRule("youtube.search.relevance", "youtube", "search", "search", "YouTube Search considera relevancia, engagement y calidad, con importancia variable según la búsqueda.", "youtube-search"),
  platformRule("youtube.shorts.personalized", "youtube", "shorts", "recommendations", "Shorts es una superficie personalizada y YouTube declara que no favorece un formato universal; interpreta respuesta del espectador y contexto.", "youtube-shorts-discovery"),
  platformRule("tiktok.for-you.personalized", "tiktok", "for_you", "recommendations", "For You personaliza contenido usando señales de interacción e información del contenido y del usuario.", "tiktok-for-you"),
  platformRule("linkedin.feed.context", "linkedin", "feed", "recommendations", "LinkedIn evalúa señales de identidad, contenido y actividad para ordenar información profesional relevante.", "linkedin-feed"),
  platformRule("instagram.feed.personalized", "instagram", "feed", "recommendations", "Feed ordena contenido de manera personalizada mediante predicciones de interacción; la plataforma no publica un peso útil para una receta universal.", "meta-instagram-feed-system-card"),
  platformRule("instagram.reels.personalized", "instagram", "reels", "recommendations", "Reels cuenta con un sistema de ranking propio y personalizado; no debe tratarse como equivalente a Feed.", "meta-ranking-system-cards"),
  platformRule("instagram.stories.personalized", "instagram", "stories", "recommendations", "Stories cuenta con un sistema de ranking propio y personalizado; su función no se infiere a partir de Feed o Reels.", "meta-ranking-system-cards"),
  platformRule("instagram.explore.personalized", "instagram", "explore", "recommendations", "Explore es una superficie de descubrimiento con recomendaciones personalizadas; no equivale al contenido visto por seguidores.", "meta-instagram-recommendations"),
  platformRule("facebook.home.personalized", "facebook", "home", "recommendations", "Home combina conexiones y descubrimiento mediante recomendaciones personalizadas; Feeds cumple una función distinta.", "meta-facebook-home"),
  platformRule("facebook.reels.personalized", "facebook", "reels", "recommendations", "Facebook Reels cuenta con un sistema de recomendación propio; no se extrapolan pesos ni resultados desde Feed.", "meta-ranking-system-cards"),
  platformRule("x.recommendations.personalized", "x", "for_you", "recommendations", "X declara que sus recomendaciones consideran intereses, cuentas/temas seguidos e interacciones, entre otras señales.", "x-recommendations"),
  platformRule("pinterest.home.personalized", "pinterest", "home", "recommendations", "Pinterest personaliza Home con actividad reciente, tableros, Pins e información buscada; Explore cumple una función distinta.", "pinterest-home-feed"),
];

function rule(id: string, domain: KnowledgeRule["domain"], category: string, principle: string, strategicMeaning: string, evidenceLevel: KnowledgeRule["evidenceLevel"], sourceId: string, tags: string[]): KnowledgeRule {
  return { id, domain, category, principle, strategicMeaning, evidenceLevel, confidence: evidenceLevel === "OFFICIAL" ? "ALTA" : "MEDIA", sourceId, sourceDate: MARKETING_KNOWLEDGE_SOURCES.find((source) => source.id === sourceId)?.publishedAt || null, validFrom: "2025-01-01", lastVerifiedAt: retrievedAt, supersededAt: null, version: "1.0.0", tags };
}

function platformRule(id: string, platform: NonNullable<KnowledgeRule["platform"]>, surface: string, category: string, principle: string, sourceId: string): KnowledgeRule {
  return { ...rule(id, "platform", category, principle, "Sirve para interpretar datos reales de esa superficie; no autoriza a inventar pesos ni a recomendar un formato por defecto.", "OFFICIAL", sourceId, [platform, surface]), platform, surface };
}

export const marketingKnowledge = new MarketingKnowledgeEngine(MARKETING_KNOWLEDGE_RULES, MARKETING_KNOWLEDGE_SOURCES);
