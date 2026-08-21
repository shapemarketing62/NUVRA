import type { IntegrationProviderAdapter } from "./contracts";
import { emptyEvidence } from "./contracts";
import { GooglePlacesApiProvider } from "@/services/intelligence/providers/reviews-provider";

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

export const integrationProviders: Record<IntegrationProviderAdapter["key"], IntegrationProviderAdapter> = {
  google_places: googlePlacesAdapter,
  instagram: { ...prepared("instagram", "instagram", ["META_APP_ID", "META_APP_SECRET", "META_REDIRECT_URI"], ["instagram_basic", "instagram_manage_insights", "pages_show_list", "pages_read_engagement"]), refresh: async () => null },
  google_business_profile: prepared("google_business_profile", "other", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], ["business.manage"]),
  google_analytics: prepared("google_analytics", "other", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], ["analytics.readonly"]),
  google_search_console: prepared("google_search_console", "search", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], ["webmasters.readonly"]),
  x: prepared("x", "x", ["X_CLIENT_ID", "X_CLIENT_SECRET"], ["tweet.read", "users.read", "offline.access"]),
};
