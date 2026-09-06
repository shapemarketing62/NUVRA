import type { Business } from "@prisma/client";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  metadata?: {
    location?: string;
    category?: string;
    phone?: string;
    address?: string;
    [key: string]: unknown;
  };
}

export interface SearchProvider {
  search(query: string, business: Business, options?: { signal?: AbortSignal }): Promise<SearchResult[]>;
  getAttempts?(query: string): SearchProviderTraceAttempt[];
}

export interface SearchProviderTraceAttempt {
  provider: "tavily" | "duckduckgo";
  status: "completed" | "no_results" | "unavailable";
  errorType?: string;
  errorCategory?: SearchProviderErrorCategory;
  httpStatus?: number;
  attempt?: number;
}

export type SearchProviderErrorCategory =
  | "authentication"
  | "rate_limited"
  | "timeout"
  | "provider_5xx"
  | "network"
  | "invalid_response"
  | "unknown";

export interface SafeSearchProviderError {
  category: SearchProviderErrorCategory;
  httpStatus?: number;
}

export class SearchProviderRequestError extends Error {
  readonly category: SearchProviderErrorCategory;
  readonly httpStatus?: number;

  constructor(category: SearchProviderErrorCategory, options: { httpStatus?: number; cause?: unknown } = {}) {
    super(`search_provider_${category}`, { cause: options.cause });
    this.name = "SearchProviderRequestError";
    this.category = category;
    this.httpStatus = options.httpStatus;
  }
}

/** Returns only allow-listed diagnostics. It never returns messages, bodies or request data. */
export function classifySearchProviderError(error: unknown): SafeSearchProviderError {
  if (error instanceof SearchProviderRequestError) {
    return { category: error.category, ...(error.httpStatus ? { httpStatus: error.httpStatus } : {}) };
  }

  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const status = typeof value.status === "number" ? value.status : undefined;
  if (status === 401 || status === 403) return { category: "authentication", httpStatus: status };
  if (status === 429) return { category: "rate_limited", httpStatus: status };
  if (status !== undefined && status >= 500 && status <= 599) return { category: "provider_5xx", httpStatus: status };

  const name = typeof value.name === "string" ? value.name : "";
  const code = typeof value.code === "string" ? value.code.toUpperCase() : "";
  if (name === "AbortError" || ["ETIMEDOUT", "ESOCKETTIMEDOUT"].includes(code)) return { category: "timeout" };
  if (error instanceof SyntaxError) return { category: "invalid_response" };
  if (error instanceof TypeError || ["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"].includes(code)) {
    return { category: "network" };
  }
  return { category: "unknown" };
}

/**
 * DuckDuckGo HTML scraping - fallback experimental.
 * No requiere API key. Puede ser bloqueado por rate limiting.
 */
export class DuckDuckGoProvider implements SearchProvider {
  async search(query: string, business: Business, options: { signal?: AbortSignal } = {}): Promise<SearchResult[]> {
    const { chromium } = await import("playwright");
    let browser: import("playwright").Browser | undefined;
    try {
      browser = await chromium.launch({ headless: true });
      const onAbort = () => { void browser?.close().catch(() => {}); };
      options.signal?.addEventListener("abort", onAbort, { once: true });
      const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; rv:124.0) Gecko/20100101 Firefox/124.0",
      });
      const page = await context.newPage();

      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(2000);

      const results = await page.$$eval(".result", (els) => {
        return els.slice(0, 10).map((el) => {
          const titleEl = el.querySelector(".result__a");
          const snippetEl = el.querySelector(".result__snippet");
          const urlEl = el.querySelector(".result__url");
          return {
            title: titleEl?.textContent?.trim() || "",
            url: urlEl?.textContent?.trim() || "",
            snippet: snippetEl?.textContent?.trim() || "",
          };
        }).filter(r => r.title || r.url);
      });

      options.signal?.removeEventListener("abort", onAbort);
      return results.map((result) => ({ ...result, metadata: { acquisitionProvider: "duckduckgo" } }));
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }
}

/**
 * Placeholder para un futuro proveedor de Search API estable.
 * NO usar Google Custom Search JSON API (cerrado a nuevos clientes).
 * 
 * Para conectar un proveedor real:
 * 1. Implementar esta interfaz con la API elegida
 * 2. Leer la API key desde process.env
 * 3. Si no hay key, lanzar error para que el fallback se use
 */
export class SearchApiProvider implements SearchProvider {
  async search(query: string, business: Business, options: { signal?: AbortSignal } = {}): Promise<SearchResult[]> {
    // TODO: Conectar proveedor de Search API estable (no Google Custom Search)
    // Ejemplo de estructura:
    // const apiKey = process.env.SEARCH_API_KEY;
    // if (!apiKey) throw new Error("SEARCH_API_KEY no configurada");
    // const response = await fetch(`https://api.searchprovider.com/search?q=${encodeURIComponent(query)}`, {
    //   headers: { Authorization: `Bearer ${apiKey}` },
    // });
    // const data = await response.json();
    // return data.results.map((r: any) => ({ title: r.title, url: r.link, snippet: r.snippet }));
    
    throw new Error("SearchApiProvider no configurado - usar DuckDuckGoProvider como fallback");
  }
}
