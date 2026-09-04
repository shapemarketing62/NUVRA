import type { BusinessEntityTarget } from "./entity-matcher.ts";
import { businessNameCore } from "./business-name-normalization.ts";

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
  const anchor = `"${name}"`;
  const coreName = businessNameCore(name);
  const coreAnchor = coreName && coreName.toLocaleLowerCase("es") !== name.toLocaleLowerCase("es") ? `"${coreName}"` : anchor;

  return uniqueQueries([
    { query: anchor, intent: "identity" },
    category ? { query: `${anchor} ${category}`, intent: "identity" } : null,
    location ? { query: `${anchor} ${location}`, intent: "identity" } : null,
    coreAnchor !== anchor && location ? { query: `${coreAnchor} ${location}`, intent: "identity" } : null,
    coreAnchor !== anchor && category ? { query: `${coreAnchor} ${category}`, intent: "identity" } : null,
    { query: `${coreAnchor} sitio oficial`, intent: "website" },
    { query: `${coreAnchor} Instagram`, intent: "social" },
    { query: `${coreAnchor} opiniones${neighborhood ? ` ${neighborhood}` : ""}`, intent: "local_reviews" },
  ]).slice(0, 8);
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
