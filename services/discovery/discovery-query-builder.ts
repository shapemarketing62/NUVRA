import type { BusinessEntityTarget } from "./entity-matcher.ts";

export type DiscoveryQueryIntent = "identity" | "website" | "social" | "local_reviews";

export interface DiscoveryQuery {
  query: string;
  intent: DiscoveryQueryIntent;
}

/**
 * Builds short, source-oriented searches. The business name remains the anchor;
 * category and location are added separately so one noisy field cannot make
 * every query overly restrictive.
 */
export function buildDiscoveryQueries(target: BusinessEntityTarget): DiscoveryQuery[] {
  const name = clean(target.name, 90);
  if (!name) return [];

  const category = clean(target.category, 70);
  const location = clean(target.location, 90);
  const locationParts = location.split(",").map((part) => part.trim()).filter(Boolean);
  const neighborhood = locationParts[0] || "";
  const city = locationParts[1] || "";
  const country = locationParts.at(-1) || "";
  const anchor = `"${name}"`;

  return uniqueQueries([
    { query: anchor, intent: "identity" },
    category ? { query: `${anchor} ${category}`, intent: "identity" } : null,
    location ? { query: `${anchor} ${location}`, intent: "identity" } : null,
    neighborhood && neighborhood !== location ? { query: `${anchor} ${neighborhood}`, intent: "identity" } : null,
    city && city !== neighborhood ? { query: `${anchor} ${city}`, intent: "identity" } : null,
    country && country !== city && country !== neighborhood ? { query: `${anchor} ${country}`, intent: "identity" } : null,
    { query: `${anchor} sitio web`, intent: "website" },
    { query: `${anchor} Instagram`, intent: "social" },
    { query: `${anchor} opiniones`, intent: "local_reviews" },
  ]).slice(0, 9);
}

function clean(value: string | undefined, maxLength: number): string {
  return String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function uniqueQueries(items: Array<DiscoveryQuery | null>): DiscoveryQuery[] {
  const seen = new Set<string>();
  return items.filter((item): item is DiscoveryQuery => {
    if (!item) return false;
    const key = item.query.toLocaleLowerCase("es");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
