import type { Business } from "@prisma/client";
import { categoryForHttpStatus, SearchProviderRequestError, type SearchProvider, type SearchResult } from "./search-provider.ts";

interface SerperOrganicResult {
  title?: unknown;
  link?: unknown;
  snippet?: unknown;
  position?: unknown;
}

interface SerperSearchResponse {
  organic?: unknown;
}

/** Official Serper Google Search API adapter. Credentials remain server-side. */
export class SerperSearchProvider implements SearchProvider {
  private readonly apiUrl = "https://google.serper.dev/search";

  async search(query: string, _business: Business, options: { signal?: AbortSignal } = {}): Promise<SearchResult[]> {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) throw new SearchProviderRequestError("authentication");

    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({ q: query, num: 10 }),
      signal: options.signal,
    });

    if (!response.ok) {
      throw new SearchProviderRequestError(categoryForHttpStatus(response.status), { httpStatus: response.status });
    }

    let data: SerperSearchResponse;
    try {
      data = await response.json() as SerperSearchResponse;
    } catch (error) {
      throw new SearchProviderRequestError("invalid_response", { cause: error });
    }

    if (!data || typeof data !== "object") throw new SearchProviderRequestError("invalid_response");
    if (data.organic === undefined) return [];
    if (!Array.isArray(data.organic)) throw new SearchProviderRequestError("invalid_response");

    return (data.organic as SerperOrganicResult[])
      .filter((result) => result && typeof result === "object" && typeof result.link === "string")
      .map((result) => ({
        title: typeof result.title === "string" ? result.title : "",
        url: result.link as string,
        snippet: typeof result.snippet === "string" ? result.snippet : "",
        metadata: {
          acquisitionProvider: "serper",
          ...(typeof result.position === "number" ? { position: result.position } : {}),
        },
      }));
  }
}
