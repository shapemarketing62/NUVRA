import type { Business } from "@prisma/client";
import type { SearchProvider, SearchResult } from "../providers/search-provider.ts";
import { TavilySearchProvider } from "../providers/tavily-search-provider.ts";
import type { AcquisitionMethod, SocialBusinessTarget, SocialCollector, SocialPlatform, SocialPublicContent, SocialRawCollection } from "./social-source-provider.ts";
import { SourceRelevancePlanner } from "./source-relevance-planner.ts";

const DOMAINS: Record<SocialPlatform, string> = { x: "x.com", tiktok: "tiktok.com", reddit: "reddit.com", facebook: "facebook.com", linkedin: "linkedin.com", youtube: "youtube.com" };
const cache = new Map<string, { expiresAt: number; value: SocialRawCollection }>();

export interface IndexedSearchLimits { maxGlobalQueries: number; maxQueriesPerSource: number; maxResultsPerSource: number }
export interface IndexedSearchBudget { used: number; seenQueries: Set<string> }

export class IndexedSocialSearchService {
  readonly limits: IndexedSearchLimits;
  readonly budget: IndexedSearchBudget = { used: 0, seenQueries: new Set() };
  private readonly provider: SearchProvider;
  constructor(provider: SearchProvider = new TavilySearchProvider(), limits: Partial<IndexedSearchLimits> = {}) {
    this.provider = provider;
    this.limits = { maxGlobalQueries: limits.maxGlobalQueries ?? 12, maxQueriesPerSource: limits.maxQueriesPerSource ?? 3, maxResultsPerSource: limits.maxResultsPerSource ?? 12 };
  }

  collector(platform: SocialPlatform): SocialCollector {
    return async (target, context) => this.collect(platform, target, context);
  }

  async collect(platform: SocialPlatform, target: SocialBusinessTarget, context: { signal?: AbortSignal } = {}): Promise<SocialRawCollection> {
    const startedAt = Date.now(); const key = cacheKey(platform, target);
    const officialCrossLink = target.validatedPlatformLinks?.[platform];
    if (officialCrossLink) {
      return {
        identity: { displayName: target.name, username: usernameFromUrl(officialCrossLink), description: null, location: target.location, category: target.industry, profileUrl: officialCrossLink, linkedUrls: target.website ? [target.website] : [] },
        profile: { profileDiscovered: true, contentAnalyzed: false, ownershipSource: "validated_official_website" },
        content: [], comments: [], mentions: [], mechanism: "public_page", accessLevel: "discovered",
        entityResolution: { confidence: .94, validated: true }, coverage: 0,
        sourceCoverage: { profile: true, bio: false, content: "none", comments: "none", mentions: "none", metrics: "none" },
        limitations: ["El perfil fue validado desde el sitio oficial; no se obtuvo contenido suficiente para evaluar desempeño."],
        acquisitionReport: { queries: [], queryCount: 0, cacheHit: false, durationMs: Date.now() - startedAt, stopReason: "validated_website_cross_link" },
      };
    }
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return { ...cached.value, acquisitionReport: { ...(cached.value.acquisitionReport || { queries: [], queryCount: 0, durationMs: 0 }), cacheHit: true } };
    if (!process.env.TAVILY_API_KEY && this.provider instanceof TavilySearchProvider) return emptyRaw("unavailable", startedAt, [], "TAVILY_API_KEY no configurada para el fallback indexado.");
    const plan = SourceRelevancePlanner.forPlatform(target, platform);
    const plannedCap = target.platformDiscoveryQueryCaps?.[platform];
    const allowed = Math.min(this.limits.maxQueriesPerSource, plannedCap ?? (plan.priority === "primary" ? 3 : plan.priority === "secondary" ? 2 : 1));
    const globalLimit = Math.min(this.limits.maxGlobalQueries, target.platformDiscoveryGlobalMaxQueries ?? this.limits.maxGlobalQueries);
    const queries = buildQueries(platform, target).slice(0, allowed);
    const usedQueries: string[] = []; const results: SearchResult[] = [];
    for (const query of queries) {
      if (context.signal?.aborted) break;
      if (this.budget.used >= globalLimit) break;
      const normalized = query.toLowerCase().replace(/\s+/g, " ").trim();
      if (this.budget.seenQueries.has(normalized)) continue;
      this.budget.seenQueries.add(normalized); this.budget.used += 1; usedQueries.push(query);
      try { results.push(...await this.provider.search(query, toBusiness(target), { signal: context.signal })); } catch { /* El reporte conserva la consulta y permite continuar con las demás. */ }
      if (new Set(results.map((item) => item.url)).size >= this.limits.maxResultsPerSource) break;
    }
    const unique = Array.from(new Map(results.filter((item) => belongsToPlatform(item.url, platform)).map((item) => [canonicalUrl(item.url), item])).values()).slice(0, this.limits.maxResultsPerSource);
    const validated = unique.map((result) => ({ result, confidence: indexedEntityConfidence(result, target) })).filter((item) => item.confidence >= .65);
    const profileResult = validated.find(({ result }) => looksLikeProfile(platform, result.url, result.title));
    const pieces = validated.filter((item) => item !== profileResult).map(({ result }) => toContent(platform, result, target));
    const content = pieces.filter((item) => item.ownerType === "brand");
    const mentions = pieces.filter((item) => item.ownerType !== "brand");
    const comments = validated.filter(({ result }) => opinionBearing(result.snippet)).map(({ result, confidence }, index) => ({ id: `search:${platform}:${index}:${hash(result.url)}`, source: platform, url: result.url, date: extractDate(result.snippet), text: result.snippet, author: null, entityConfidence: confidence, entityValidated: true, acquisitionMethod: "search_index" as AcquisitionMethod }));
    const identity = profileResult ? { displayName: profileResult.result.title, username: usernameFromUrl(profileResult.result.url), description: profileResult.result.snippet, location: target.location, category: target.industry, profileUrl: profileResult.result.url, linkedUrls: target.website ? [target.website] : [] } : (validated[0] ? { displayName: target.name, description: validated[0].result.snippet, location: target.location, category: target.industry, profileUrl: validated[0].result.url, linkedUrls: target.website ? [target.website] : [] } : null);
    const accessLevel = !validated.length ? "not_found" : profileResult && !content.length && !mentions.length && !comments.length ? "discovered" : "partial";
    const raw: SocialRawCollection = {
      identity,
      profile: profileResult ? { title: profileResult.result.title, description: profileResult.result.snippet, profileDiscovered: true, contentAnalyzed: false } : null,
      content,
      mentions,
      comments,
      mechanism: "search_index",
      accessLevel,
      entityResolution: validated.length ? { confidence: Math.max(...validated.map((item) => item.confidence)), validated: true } : { confidence: 0, validated: false },
      coverage: accessLevel === "partial" ? Math.min(45, 18 + (content.length + mentions.length) * 4 + comments.length * 3) : accessLevel === "discovered" ? 15 : 0,
      sourceCoverage: { profile: Boolean(profileResult), bio: Boolean(profileResult?.result.snippet), content: content.length ? "indexed" : "none", comments: comments.length ? "indexed" : "none", mentions: mentions.length ? "indexed" : "none", metrics: "none" },
      limitations: ["Los resultados provienen de un índice de búsqueda y no representan cobertura completa de la plataforma.", "Los comentarios completos y métricas privadas no fueron consultados."],
      acquisitionReport: { queries: usedQueries, queryCount: usedQueries.length, cacheHit: false, durationMs: Date.now() - startedAt, stopReason: this.budget.used >= globalLimit ? "global_query_limit" : validated.length >= this.limits.maxResultsPerSource ? "enough_results" : undefined },
    };
    cache.set(key, { expiresAt: Date.now() + freshnessTtl(platform), value: raw });
    return raw;
  }
}

export function clearIndexedSocialCache() { cache.clear(); }

function buildQueries(platform: SocialPlatform, target: SocialBusinessTarget) {
  const domain = DOMAINS[platform]; const location = target.location || "";
  const base = `"${target.name}" site:${domain}`;
  if (platform === "reddit") return [base, `"${target.name}" experiencia OR recomendación OR queja site:${domain}`, `"${target.name}" ${location} site:${domain}`];
  if (platform === "youtube") return [base, `"${target.name}" review OR experiencia site:${domain}`, `"${target.name}" ${target.industry} site:${domain}`];
  return [base, `"${target.name}" opiniones OR quejas OR experiencia site:${domain}`, `"${target.name}" ${location} site:${domain}`];
}
function cacheKey(platform: SocialPlatform, target: SocialBusinessTarget) { return `${platform}:${normalize(target.name)}:${normalize(target.location)}:${normalize(target.website)}`; }
function freshnessTtl(platform: SocialPlatform) { return (["x", "reddit", "tiktok"] as SocialPlatform[]).includes(platform) ? 2 * 60 * 60 * 1000 : (["facebook", "linkedin"] as SocialPlatform[]).includes(platform) ? 8 * 60 * 60 * 1000 : 4 * 60 * 60 * 1000; }

function emptyRaw(level: "not_found" | "partial" | "discovered" | "analyzed" | "unavailable", startedAt: number, queries: string[], limitation: string): SocialRawCollection {
  return { identity: null, mechanism: "search_index", accessLevel: level, coverage: 0, sourceCoverage: { profile: false, bio: false, content: "none", comments: "none", mentions: "none", metrics: "none" }, limitations: [limitation], acquisitionReport: { queries, queryCount: queries.length, cacheHit: false, durationMs: Date.now() - startedAt } };
}
function toBusiness(target: SocialBusinessTarget) { return { id: target.businessId, nombre: target.name, rubro: target.industry, ubicacion: target.location, webUrl: target.website } as Business; }
function belongsToPlatform(url: string, platform: SocialPlatform) { try { return new URL(url).hostname.replace(/^www\./, "").endsWith(DOMAINS[platform]); } catch { return false; } }
function canonicalUrl(url: string) { try { const value = new URL(url); value.hash = ""; value.search = ""; return value.toString().replace(/\/$/, ""); } catch { return url; } }
function indexedEntityConfidence(result: SearchResult, target: SocialBusinessTarget) { const text = normalize(`${result.title} ${result.snippet}`); const nameTokens = normalize(target.name).split(" ").filter((item) => item.length > 2); let score = nameTokens.length && nameTokens.every((item) => text.includes(item)) ? .48 : nameTokens.some((item) => text.includes(item)) ? .22 : 0; const industryTokens = normalize(target.industry).split(" ").filter((item) => item.length > 4); if (industryTokens.some((item) => text.includes(item))) score += .17; const locationTokens = normalize(target.location).split(" ").filter((item) => item.length > 3); if (locationTokens.some((item) => text.includes(item))) score += .18; if (target.website && result.snippet.toLowerCase().includes(host(target.website))) score += .25; return Math.min(1, Math.round(score * 100) / 100); }
function looksLikeProfile(platform: SocialPlatform, url: string, title: string) { const path = (() => { try { return new URL(url).pathname; } catch { return ""; } })(); if (platform === "youtube") return /\/(@|channel\/|c\/)/.test(path); if (platform === "linkedin") return /\/company\//.test(path); if (platform === "reddit") return false; return path.split("/").filter(Boolean).length <= 2 && !/status|video|watch|posts|reel/i.test(path + title); }
function toContent(platform: SocialPlatform, result: SearchResult, target: SocialBusinessTarget): SocialPublicContent { const external = platform === "youtube" || platform === "reddit" || !normalize(result.title).includes(normalize(target.name)); return { id: `search:${platform}:${hash(result.url)}`, ownerType: external ? (platform === "youtube" ? "creator" : "customer") : "brand", title: result.title, text: result.snippet, url: result.url, publishedAt: extractDate(result.snippet), acquisitionMethod: "search_index", context: platform === "reddit" ? { subreddit: subredditFromUrl(result.url) } : {} }; }
function opinionBearing(text: string) { return text.length >= 35 && /recomiend|mi experiencia|me atend|excelente|pesim|queja|demora|tardaron|no cumpli|muy buen|muy mal/i.test(text); }
function extractDate(text: string) { const match = text.match(/\b(20\d{2})[-\/]([01]?\d)[-\/]([0-3]?\d)\b/); if (!match) return null; const date = new Date(`${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}T00:00:00Z`); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function usernameFromUrl(url: string) { try { return new URL(url).pathname.split("/").filter(Boolean).pop()?.replace(/^@/, "") || null; } catch { return null; } }
function subredditFromUrl(url: string) { try { const parts = new URL(url).pathname.split("/").filter(Boolean); const index = parts.indexOf("r"); return index >= 0 ? parts[index + 1] || null : null; } catch { return null; } }
function host(url: string) { try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } }
function normalize(value: unknown) { return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
function hash(value: string) { let result = 0; for (let index = 0; index < value.length; index++) result = ((result << 5) - result + value.charCodeAt(index)) | 0; return Math.abs(result).toString(36); }
