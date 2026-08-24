import { SocialEntityResolver } from "./social-entity-resolver.ts";
import type { SocialBusinessTarget, SocialCollector, SocialPlatform, SocialProviderResult, SocialRawCollection, SocialSourceProvider } from "./social-source-provider.ts";
import { unavailableSocialResult } from "./social-source-provider.ts";
import { IndexedSocialSearchService } from "./indexed-social-search.ts";

abstract class BaseSocialProvider implements SocialSourceProvider {
  abstract readonly platform: SocialPlatform;
  abstract readonly purpose: string;
  abstract readonly requiresAuth: boolean;
  abstract readonly limitations: readonly string[];
  readonly timeoutMs = 8_000;
  readonly maxAttempts = 2;
  protected readonly collector?: SocialCollector;
  constructor(collector?: SocialCollector) { this.collector = collector; }
  isConfigured() { return Boolean(this.collector); }

  async collect(target: SocialBusinessTarget, context: { signal?: AbortSignal } = {}): Promise<SocialProviderResult> {
    if (!this.collector) return unavailableSocialResult(this.platform, this.limitations, this.requiresAuth);
    try {
      const raw = await this.collector(target, context);
      return normalizeCollection(this.platform, target, raw, this.limitations);
    } catch (error) {
      return { ...unavailableSocialResult(this.platform, this.limitations, this.requiresAuth), status: "error", errors: [{ type: error instanceof Error ? error.name : "ProviderError", message: error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180) }] };
    }
  }
}

export class XProvider extends BaseSocialProvider { readonly platform = "x" as const; readonly purpose = "conversación espontánea, actualidad, quejas y recomendaciones"; readonly requiresAuth = true; readonly limitations = ["La lectura estable de publicaciones y conversación requiere X API y sus permisos.", "No se infiere calidad desde seguidores ni métricas privadas."]; }
export class TikTokProvider extends BaseSocialProvider { readonly platform = "tiktok" as const; readonly purpose = "contenido audiovisual, percepción, preguntas y comentarios"; readonly requiresAuth = true; readonly limitations = ["El acceso fiable a contenido y comentarios requiere API o mecanismo oficialmente permitido.", "No se afirma viralidad sin alcance público suficiente."]; }
export class RedditProvider extends BaseSocialProvider { readonly platform = "reddit" as const; readonly purpose = "experiencias, preguntas, comparaciones y conversación espontánea"; readonly requiresAuth = false; readonly limitations = ["Una publicación representa una voz, no a toda la clientela.", "La búsqueda pública puede ser parcial y debe filtrar homónimos."]; }
export class FacebookProvider extends BaseSocialProvider { readonly platform = "facebook" as const; readonly purpose = "comunidad local, información comercial, eventos y recomendaciones"; readonly requiresAuth = true; readonly limitations = ["La mayoría de los datos consistentes de páginas y comentarios requiere Meta API y permisos.", "La ausencia de Facebook no se considera una debilidad por sí sola."]; }
export class LinkedInProvider extends BaseSocialProvider { readonly platform = "linkedin" as const; readonly purpose = "autoridad, especialización y actividad B2B"; readonly requiresAuth = true; readonly limitations = ["La extracción estable de páginas y publicaciones requiere acceso oficial.", "No se usan datos personales de empleados para inferencias no pertinentes."]; }
export class YouTubeProvider extends BaseSocialProvider { readonly platform = "youtube" as const; readonly purpose = "contenido profundo, tutoriales, reviews y comentarios"; readonly requiresAuth = true; readonly limitations = ["La API oficial es necesaria para cobertura estable de canales, búsquedas y comentarios.", "Las vistas no se interpretan automáticamente como calidad comercial."]; }

export const createDefaultSocialProviders = (): SocialSourceProvider[] => {
  const indexedSearch = new IndexedSocialSearchService();
  return [
    new XProvider(indexedSearch.collector("x")),
    new TikTokProvider(indexedSearch.collector("tiktok")),
    new RedditProvider(indexedSearch.collector("reddit")),
    new FacebookProvider(indexedSearch.collector("facebook")),
    new LinkedInProvider(indexedSearch.collector("linkedin")),
    new YouTubeProvider(indexedSearch.collector("youtube")),
  ];
};

function normalizeCollection(platform: SocialPlatform, target: SocialBusinessTarget, raw: SocialRawCollection, baseLimitations: readonly string[]): SocialProviderResult {
  const resolution = raw.entityResolution ? { ...raw.entityResolution, signals: [], contradictions: [] } : SocialEntityResolver.resolve(target, raw.identity);
  const allContent = [...(raw.content || []), ...(raw.mentions || [])];
  const acceptedContentIds = resolution.validated ? allContent.filter((item) => item?.id && item?.text && item?.url).map((item) => item.id) : [];
  const rejectedContentIds = resolution.validated ? allContent.filter((item) => !item?.id || !item?.text || !item?.url).map((item) => item?.id || "missing-id") : allContent.map((item) => item?.id || "missing-id");
  const comments = resolution.validated ? (raw.comments || []).filter((item) => item?.text && item?.id).map((item) => ({ ...item, source: platform, entityConfidence: resolution.confidence, entityValidated: true, acquisitionMethod: item.acquisitionMethod || raw.mechanism })) : [];
  const content = resolution.validated ? (raw.content || []).filter((item) => acceptedContentIds.includes(item.id)).map((item) => ({ ...item, acquisitionMethod: item.acquisitionMethod || raw.mechanism })) : [];
  const mentions = resolution.validated ? (raw.mentions || []).filter((item) => acceptedContentIds.includes(item.id)).map((item) => ({ ...item, acquisitionMethod: item.acquisitionMethod || raw.mechanism })) : [];
  const urls = Array.from(new Set([raw.identity?.profileUrl, ...content.map((item) => item.url), ...mentions.map((item) => item.url), ...comments.map((item) => item.url)].filter((item): item is string => Boolean(item))));
  return {
    platform,
    status: resolution.validated ? (raw.accessLevel === "unavailable" ? "unavailable" : raw.accessLevel || (content.length || comments.length || mentions.length ? "partial" : "discovered")) : (raw.accessLevel === "not_found" ? "not_found" : "unavailable"),
    identity: raw.identity,
    entityConfidence: resolution.confidence,
    entityValidated: resolution.validated,
    profile: resolution.validated ? raw.profile || null : null,
    content,
    comments,
    mentions,
    publicMetrics: resolution.validated ? raw.publicMetrics || {} : {},
    urls,
    coverage: resolution.validated ? Math.max(10, Math.min(100, raw.coverage || 20)) : 0,
    limitations: [...baseLimitations, ...(raw.limitations || []), ...(!resolution.validated ? resolution.contradictions : [])],
    errors: [],
    acceptedContentIds,
    rejectedContentIds,
    brandIdentityEvidence: resolution.validated ? brandIdentityEvidence(platform, raw, content) : undefined,
    mechanism: raw.mechanism,
    acquisitionMethods: Array.from(new Set([raw.mechanism, ...content.map((item) => item.acquisitionMethod!), ...comments.map((item) => item.acquisitionMethod!), ...mentions.map((item) => item.acquisitionMethod!)])),
    sourceCoverage: raw.sourceCoverage || { profile: Boolean(raw.identity), bio: Boolean(raw.identity?.description), content: content.length ? "partial" : "none", comments: comments.length ? "partial" : "none", mentions: mentions.length ? "partial" : "none", metrics: Object.keys(raw.publicMetrics || {}).length ? "public" : "none" },
    acquisitionReport: raw.acquisitionReport,
  };
}

function brandIdentityEvidence(platform: SocialPlatform, raw: SocialRawCollection, content: SocialRawCollection["content"]): SocialProviderResult["brandIdentityEvidence"] {
  const profile = raw.profile || {};
  const brandContent = (content || []).filter((item) => item.ownerType === "brand");
  const aspects: Record<string, number> = {};
  if (typeof profile.logoConsistent === "boolean") aspects.logo = profile.logoConsistent ? 82 : 42;
  if (typeof profile.visualConsistency === "number") aspects.crossChannelConsistency = Number(profile.visualConsistency);
  if (typeof profile.photographyConsistency === "number") aspects.photography = Number(profile.photographyConsistency);
  if (typeof profile.toneConsistency === "number") aspects.tone = Number(profile.toneConsistency);
  if (typeof profile.proposalCoherence === "number") aspects.proposalCoherence = Number(profile.proposalCoherence);
  if (!Object.keys(aspects).length || !brandContent.length) return undefined;
  return { source: platform, aspects, evidence: [`Se observaron ${brandContent.length} contenidos oficiales utilizables en ${platform}.`], contradictions: Array.isArray(profile.brandContradictions) ? profile.brandContradictions.map(String) : [], observedPeriods: Number(profile.observedPeriods || 1) };
}
