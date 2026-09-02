import type { IntegrationProviderAdapter } from "./contracts";
import { emptyEvidence } from "./contracts";
import { GooglePlacesApiProvider } from "@/services/intelligence/providers/reviews-provider";
import { GoogleBusinessProfileProvider } from "./google-business-profile-provider";
import { PlatformMarketingIntelligence } from "@/services/intelligence/platform-marketing-intelligence";

const prepared = (key: IntegrationProviderAdapter["key"], sourceType: IntegrationProviderAdapter["sourceType"], envNames: string[], scopes: readonly string[]): IntegrationProviderAdapter => ({
  key, sourceType, requiredScopes: scopes,
  configured: () => envNames.every((name) => Boolean(process.env[name])),
  async sync(context) {
    if (!this.configured()) return { evidence: emptyEvidence(sourceType, "unavailable", "La conexión todavía no está habilitada.") };
    if (!context.credentials) return { evidence: emptyEvidence(sourceType, "requires_auth", "La cuenta necesita autorización.") };
    return { evidence: emptyEvidence(sourceType, "unavailable", "El proveedor está preparado pero la sincronización todavía no fue activada.") };
  },
});

export const googlePlacesAdapter: IntegrationProviderAdapter = {
  key: "google_places", sourceType: "reviews", requiredScopes: [], configured: () => Boolean(process.env.GOOGLE_PLACES_API_KEY),
  async sync(context) {
    if (!this.configured()) return { evidence: emptyEvidence("reviews", "unavailable", "Google Places API no está configurada; el fallback experimental permanece separado.") };
    const data = await new GooglePlacesApiProvider().getReviews(context.business);
    const useful = data.rating !== null || data.reviews.length > 0;
    return { evidence: { source: "reviews", status: useful ? "evaluated" : "unavailable", data, findings: [], confidence: useful ? "ALTA" : "INSUFICIENTE", coverage: useful ? Math.min(100, 45 + Math.min(data.reviews.length, 5) * 8) : 0, evaluatedAt: new Date(), requiresAuth: false, metadata: { provider: "google_places", verifiedSource: true, entityMatchConfidence: data.entityMatchConfidence } } };
  },
};

export const googleBusinessProfileAdapter: IntegrationProviderAdapter = {
  key: "google_business_profile", sourceType: "other", requiredScopes: ["business.manage"],
  configured: () => Boolean(process.env.GOOGLE_PLACES_API_KEY),
  async sync(context) {
    if (!this.configured()) return { evidence: emptyEvidence("other", "unavailable", "Google Places API no está configurada.") };
    const profile = await new GoogleBusinessProfileProvider().collectPublicProfile(context.business);
    if (!profile.entityValidated) return { evidence: emptyEvidence("other", "unavailable", "No se pudo validar con seguridad la ficha del negocio.") };
    const sourceCoverage = { profile: true, bio: Boolean(profile.category), content: profile.photoCount ? "partial" as const : "none" as const, comments: profile.reviews.length ? "partial" as const : "none" as const, mentions: "none" as const, metrics: profile.rating !== null ? "public" as const : "none" as const };
    const platformMarketing = PlatformMarketingIntelligence.analyze({
      platform: "google_business_profile", status: "analyzed", entityValidated: true,
      profile: profile as unknown as Record<string, unknown>, content: [],
      publicMetrics: Object.fromEntries(Object.entries({ rating: profile.rating, reviewCount: profile.reviewCount, photoCount: profile.photoCount }).filter(([, value]) => typeof value === "number")) as Record<string, number>,
      coverage: sourceCoverage, acquisitionMethods: ["official_api"],
    });
    return { evidence: { source: "other", status: "evaluated", data: { ...profile, platformMarketing }, findings: [], confidence: profile.entityConfidence >= .85 ? "ALTA" : "MEDIA", coverage: Math.min(100, 35 + (profile.address ? 10 : 0) + (profile.openingHours.length ? 10 : 0) + (profile.reviews.length ? 20 : 0) + (profile.website ? 10 : 0)), evaluatedAt: new Date(), requiresAuth: false, metadata: { provider: profile.provider, entityConfidence: profile.entityConfidence, placeId: profile.placeId, sourceCoverage } } };
  },
};

export const integrationProviders: Record<IntegrationProviderAdapter["key"], IntegrationProviderAdapter> = {
  google_places: googlePlacesAdapter,
  instagram: { ...prepared("instagram", "instagram", ["META_APP_ID", "META_APP_SECRET", "META_REDIRECT_URI"], ["instagram_basic", "instagram_manage_insights", "pages_show_list", "pages_read_engagement"]), refresh: async () => null },
  google_business_profile: googleBusinessProfileAdapter,
  google_analytics: prepared("google_analytics", "other", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], ["analytics.readonly"]),
  google_search_console: prepared("google_search_console", "search", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], ["webmasters.readonly"]),
  x: prepared("x", "x", ["X_CLIENT_ID", "X_CLIENT_SECRET"], ["tweet.read", "users.read", "offline.access"]),
};
