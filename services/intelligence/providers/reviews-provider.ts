import type { Business } from "@prisma/client";
import { EntityMatcher } from "../../discovery/entity-matcher.ts";
import type { CandidateSource, BusinessEntityTarget } from "../../discovery/entity-matcher.ts";

export interface ReviewData {
  text: string;
  rating: number | null;
  url?: string | null;
  date?: string | null;
  author?: string | null;
  source?: string;
  ownerResponse?: string | null;
}

export interface ReviewsData {
  rating: number | null;
  reviewCount: number | null;
  reviews: ReviewData[];
  // Trazabilidad de Google Places API
  placeId?: string;
  placeName?: string;
  placeAddress?: string;
  placeUrl?: string;
  scope?: "brand" | "local_business" | "individual_location";
  entityMatchConfidence?: number; // 0-1
  evaluatedAt?: string;
  category?: string;
  secondaryCategories?: string[];
  phone?: string;
  website?: string;
  openingHours?: string[];
  attributes?: Record<string, unknown>;
  photoCount?: number | null;
}

export interface ReviewsProvider {
  getReviews(business: Business, discoveryResult?: any, options?: { signal?: AbortSignal }): Promise<ReviewsData>;
}

/**
 * Google Maps scraping - fallback experimental.
 * No requiere API key. Puede ser bloqueado por captcha/rate limiting.
 */
export class GoogleMapsScrapeProvider implements ReviewsProvider {
  async getReviews(business: Business, _discoveryResult?: any, options: { signal?: AbortSignal } = {}): Promise<ReviewsData> {
    const { chromium } = await import("playwright");
    const nombre = business.nombre;
    const rubro = business.rubro || "";
    const ciudad = business.ciudad || "";

    let browser: import("playwright").Browser | undefined;
    try {
      browser = await chromium.launch({ headless: true });
      const onAbort = () => { void browser?.close().catch(() => {}); };
      options.signal?.addEventListener("abort", onAbort, { once: true });
      const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; rv:124.0) Gecko/20100101 Firefox/124.0",
        locale: "es-AR",
      });
      const page = await context.newPage();

      const query = `${nombre} ${rubro}${ciudad ? ` ${ciudad}` : ""}`;
      const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;

      await page.goto(mapsUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(5000);

      const ratingData = await page.evaluate(() => {
        const ratingEl = document.querySelector('[aria-label*="estrellas"]') ||
                         document.querySelector('[aria-label*="stars"]') ||
                         document.querySelector('.fontBodyMedium');
        const ratingText = ratingEl?.getAttribute('aria-label') || ratingEl?.textContent || "";

        const reviewCountMatch = document.body.innerText.match(/(\d+[.,]?\d*)\s*(reseñas|reviews|opiniones)/i);
        const reviewCount = reviewCountMatch ? reviewCountMatch[1] : null;

        const reviewEls = Array.from(document.querySelectorAll('.jftiEf, .MyEned, .wiI7pd'));
        const reviews = reviewEls.slice(0, 10).map((el) => {
          const text = el.textContent?.trim() || "";
          const ratingMatch = text.match(/(\d+)\s*estrellas/i);
          return {
            text: text.slice(0, 500),
            rating: ratingMatch ? parseInt(ratingMatch[1]) : null,
          };
        }).filter(r => r.text.length > 20);

        return { ratingText, reviewCount, reviews };
      });

      // Reintento si no se encontró nada
      if (!ratingData.ratingText && ratingData.reviews.length === 0) {
        await page.waitForTimeout(5000);
        const retryData = await page.evaluate(() => {
          const ratingEl = document.querySelector('[aria-label*="estrellas"]') ||
                           document.querySelector('[aria-label*="stars"]');
          const ratingText = ratingEl?.getAttribute('aria-label') || "";

          const reviewCountMatch = document.body.innerText.match(/(\d+[.,]?\d*)\s*(reseñas|reviews|opiniones)/i);
          const reviewCount = reviewCountMatch ? reviewCountMatch[1] : null;

          const reviewEls = Array.from(document.querySelectorAll('.jftiEf, .MyEned, .wiI7pd'));
          const reviews = reviewEls.slice(0, 10).map((el) => {
            const text = el.textContent?.trim() || "";
            const ratingMatch = text.match(/(\d+)\s*estrellas/i);
            return {
              text: text.slice(0, 500),
              rating: ratingMatch ? parseInt(ratingMatch[1]) : null,
            };
          }).filter(r => r.text.length > 20);

          return { ratingText, reviewCount, reviews };
        });
        Object.assign(ratingData, retryData);
      }

      if (!ratingData.ratingText && ratingData.reviews.length === 0) {
        throw new Error("No se encontraron reseñas públicas para el negocio en Google Maps");
      }

      const ratingMatch = ratingData.ratingText.match(/(\d+[.,]?\d*)/);
      const rating = ratingMatch ? parseFloat(ratingMatch[1].replace(",", ".")) : null;
      const reviewCount = ratingData.reviewCount ? parseInt(ratingData.reviewCount.replace(/[.,]/g, "")) : null;
      const identity = await page.evaluate(() => ({
        name: document.querySelector("h1")?.textContent?.trim() || "",
        address: document.querySelector('[data-item-id="address"]')?.getAttribute("aria-label") || "",
        website: (document.querySelector('[data-item-id="authority"]') as HTMLAnchorElement | null)?.href || "",
        canonical: (document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.href || location.href,
      }));
      const target: BusinessEntityTarget = { name: nombre, category: rubro, location: ciudad || business.ubicacion || undefined, declaredWebUrl: business.webUrl || undefined, declaredInstagram: business.instagramHandle || undefined };
      const candidate = EntityMatcher.evaluateCandidate({ title: identity.name, url: identity.website || identity.canonical, snippet: identity.address, type: "google_maps" }, target);

      options.signal?.removeEventListener("abort", onAbort);
      return {
        rating,
        reviewCount,
        reviews: ratingData.reviews.map((review) => ({ ...review, source: "google_maps", url: identity.canonical })),
        placeName: identity.name || undefined,
        placeAddress: identity.address || undefined,
        placeUrl: identity.canonical,
        website: identity.website || undefined,
        entityMatchConfidence: candidate.matchScore,
        evaluatedAt: new Date().toISOString(),
      };
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }
}

/**
 * Google Places API (New) - provider principal con entity resolution.
 * Requiere API key de Google Places API (New).
 * Valida resultados con EntityMatcher antes de aceptarlos.
 */
export class GooglePlacesApiProvider implements ReviewsProvider {
  async getReviews(business: Business, discoveryResult?: any, options: { signal?: AbortSignal } = {}): Promise<ReviewsData> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_PLACES_API_KEY no configurada - usar GoogleMapsScrapeProvider como fallback");
    }

    const nombre = business.nombre;
    const rubro = business.rubro || "";
    const ciudad = business.ciudad || "";
    const ubicacion = business.ubicacion || "";
    const query = `${nombre} ${rubro}${ciudad ? ` ${ciudad}` : ""}${ubicacion ? ` ${ubicacion}` : ""}`;

    // Google Places API (New) - Text Search
    const searchResponse = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.displayName,places.rating,places.userRatingCount,places.reviews,places.id,places.formattedAddress,places.websiteUri,places.googleMapsUri,places.primaryType,places.types,places.nationalPhoneNumber,places.regularOpeningHours,places.photos",
      },
      body: JSON.stringify({ textQuery: query }),
      signal: options.signal,
    });

    if (!searchResponse.ok) {
      throw new Error(`Google Places API error: ${searchResponse.status}`);
    }

    const data = await searchResponse.json();
    const places = data.places || [];

    if (places.length === 0) {
      throw new Error("No se encontraron resultados en Google Places");
    }

    // Entity Resolution: Validar cada candidato con EntityMatcher
    const target: BusinessEntityTarget = {
      name: nombre,
      category: rubro,
      location: ciudad || ubicacion,
      tipoCliente: business.tipoCliente || undefined,
      declaredWebUrl: business.webUrl || undefined,
      declaredInstagram: business.instagramHandle || undefined,
    };

    const evaluatedCandidates: Array<{ place: any; candidate: CandidateSource }> = [];

    for (const place of places) {
      const candidate: CandidateSource = {
        title: place.displayName?.text || place.name || "",
        url: place.websiteUri || `https://www.google.com/maps/place/?q=place_id:${place.id}`,
        snippet: place.formattedAddress || "",
        type: "google_maps",
      };

      const evaluated = EntityMatcher.evaluateCandidate(candidate, target);
      evaluatedCandidates.push({ place, candidate: evaluated });
    }

    // Ordenar por matchScore descendente
    evaluatedCandidates.sort((a, b) => (b.candidate.matchScore || 0) - (a.candidate.matchScore || 0));

    // Seleccionar el mejor candidato
    const bestMatch = evaluatedCandidates[0];

    // Si el mejor candidato no es sufficiently confident, rechazar
    if (!bestMatch || (bestMatch.candidate.status !== "confirmed" && bestMatch.candidate.status !== "probable") || (bestMatch.candidate.matchScore || 0) < 0.72) {
      throw new Error(`Google Places no encontró una entidad suficientemente confiable (mejor match: ${bestMatch?.candidate.status})`);
    }

    const place = bestMatch.place;
    const candidate = bestMatch.candidate;

    // Determinar alcance de la evidencia
    let scope: "brand" | "local_business" | "individual_location" = "local_business";
    if (candidate.entityRelationship === "brand_global" || candidate.entityRelationship === "primary_entity") {
      scope = "brand";
    } else if (candidate.entityRelationship === "individual_location") {
      scope = "individual_location";
    }

    return {
      rating: place.rating ?? null,
      reviewCount: place.userRatingCount ?? null,
      reviews: (place.reviews || []).map((r: any) => ({
        text: r.text?.text || "",
        rating: r.rating ?? null,
        date: r.publishTime || r.relativePublishTimeDescription || null,
        author: r.authorAttribution?.displayName || null,
        url: r.authorAttribution?.uri || place.googleMapsUri || null,
        source: "google_maps",
        ownerResponse: r.originalText?.text || null,
      })).filter((r: any) => r.text.length > 0),
      placeId: place.id,
      placeName: place.displayName?.text || place.name,
      placeAddress: place.formattedAddress,
      placeUrl: place.googleMapsUri || place.websiteUri,
      scope,
      entityMatchConfidence: candidate.matchScore,
      evaluatedAt: new Date().toISOString(),
      category: place.primaryType,
      secondaryCategories: place.types || [],
      phone: place.nationalPhoneNumber,
      website: place.websiteUri,
      openingHours: place.regularOpeningHours?.weekdayDescriptions || [],
      photoCount: Array.isArray(place.photos) ? place.photos.length : null,
    };
  }
}
