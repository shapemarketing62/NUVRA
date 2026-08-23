import type { Business } from "@prisma/client";
import { GooglePlacesApiProvider, type ReviewsData } from "../intelligence/providers/reviews-provider.ts";

export interface GoogleBusinessPublicProfile {
  provider: "google_places_api";
  entityConfidence: number;
  entityValidated: boolean;
  placeId: string | null;
  name: string | null;
  category: string | null;
  secondaryCategories: string[];
  address: string | null;
  phone: string | null;
  website: string | null;
  mapsUrl: string | null;
  openingHours: string[];
  rating: number | null;
  reviewCount: number | null;
  reviews: ReviewsData["reviews"];
  photoCount: number | null;
  attributes: Record<string, unknown>;
  evaluatedAt: string;
}

export class GoogleBusinessProfileProvider {
  private readonly places: GooglePlacesApiProvider;
  constructor(places = new GooglePlacesApiProvider()) { this.places = places; }
  configured() { return Boolean(process.env.GOOGLE_PLACES_API_KEY); }
  async collectPublicProfile(business: Business, options: { signal?: AbortSignal } = {}): Promise<GoogleBusinessPublicProfile> {
    const data = await this.places.getReviews(business, undefined, options);
    const entityConfidence = data.entityMatchConfidence ?? 0;
    return {
      provider: "google_places_api", entityConfidence, entityValidated: entityConfidence >= .72,
      placeId: data.placeId || null, name: data.placeName || null, category: data.category || null,
      secondaryCategories: data.secondaryCategories || [], address: data.placeAddress || null,
      phone: data.phone || null, website: data.website || null, mapsUrl: data.placeUrl || null,
      openingHours: data.openingHours || [], rating: data.rating, reviewCount: data.reviewCount,
      reviews: data.reviews, photoCount: data.photoCount ?? null, attributes: data.attributes || {},
      evaluatedAt: data.evaluatedAt || new Date().toISOString(),
    };
  }
}
