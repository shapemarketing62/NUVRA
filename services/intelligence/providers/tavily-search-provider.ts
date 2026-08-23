import type { SearchProvider, SearchResult } from "./search-provider.ts";
import type { Business } from "@prisma/client";

interface TavilySearchResponse {
  query: string;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
    raw_content: string | null;
  }>;
  response_time?: number;
}

/**
 * Tavily Search API - proveedor real inicial para NUVRA.
 *
 * IMPORTANTE: Tavily NO representa una SERP exacta de Google.
 * Los resultados son agregados de múltiples fuentes con un score de relevancia,
 * por lo que la posición dentro de `results` NO debe interpretarse como ranking en Google.
 *
 * Requiere TAVILY_API_KEY en process.env.
 */
export class TavilySearchProvider implements SearchProvider {
  private readonly apiUrl = "https://api.tavily.com/search";

  async search(query: string, _business: Business): Promise<SearchResult[]> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      throw new Error("TAVILY_API_KEY no configurada");
    }

    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        include_answer: false,
        max_results: 10,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Tavily API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = (await response.json()) as TavilySearchResponse;

    if (!data.results || !Array.isArray(data.results)) {
      return [];
    }

    // Mapear al contrato existente (title, url, snippet)
    return data.results.map((r) => ({
      title: r.title || "",
      url: r.url || "",
      // Tavily devuelve "content" como snippet
      snippet: r.content || "",
    }));
  }
}
