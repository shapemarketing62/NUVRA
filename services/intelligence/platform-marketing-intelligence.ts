import { marketingKnowledge } from "../knowledge/marketing-knowledge-catalog.ts";
import type { AcquisitionMethod, SocialProviderStatus, SocialSourceCoverage } from "./social/social-source-provider.ts";

export type MarketingPlatform = "instagram" | "google_business_profile" | "tiktok" | "linkedin" | "youtube" | "x" | "facebook" | "reddit" | "pinterest";

export interface PlatformMarketingSnapshot {
  platform: MarketingPlatform;
  status: SocialProviderStatus;
  entityValidated: boolean;
  profile: Record<string, unknown> | null;
  content: Array<{ text?: string | null; title?: string | null; format?: string | null; callToAction?: string | null; publishedAt?: string | null }>;
  publicMetrics: Record<string, number>;
  coverage: SocialSourceCoverage;
  acquisitionMethods: AcquisitionMethod[];
}

export interface PlatformMarketingInterpretation {
  platform: MarketingPlatform;
  status: "evaluated" | "partial" | "not_evaluated";
  observedSignals: Array<{ field: string; evidence: string }>;
  missingButNotNegative: string[];
  knowledge: Array<{ ruleId: string; surface: string | null; evidenceLevel: string; sourceUrl: string }>;
  limitations: string[];
}

export class PlatformMarketingIntelligence {
  static analyze(snapshot: PlatformMarketingSnapshot): PlatformMarketingInterpretation {
    if (!snapshot.entityValidated || !["partial", "analyzed"].includes(snapshot.status)) {
      return {
        platform: snapshot.platform,
        status: "not_evaluated",
        observedSignals: [],
        missingButNotNegative: ["La fuente no tiene una entidad validada y cobertura suficiente; no se interpreta como desempeño bajo."],
        knowledge: [],
        limitations: [`Estado de la fuente: ${snapshot.status}.`],
      };
    }

    const profile = snapshot.profile || {};
    const observedSignals = profileSignals(snapshot.platform, profile, snapshot.content);
    const rules = marketingKnowledge.retrieve({ platform: snapshot.platform });
    return {
      platform: snapshot.platform,
      status: snapshot.status === "analyzed" ? "evaluated" : "partial",
      observedSignals,
      missingButNotNegative: missingCoverage(snapshot.coverage),
      knowledge: rules.map(({ rule, source }) => ({ ruleId: rule.id, surface: rule.surface || null, evidenceLevel: rule.evidenceLevel, sourceUrl: source.url })),
      limitations: [
        ...(!snapshot.acquisitionMethods.includes("official_api") && !snapshot.acquisitionMethods.includes("authenticated_integration") ? ["La cobertura no proviene de una integración oficial completa."] : []),
        ...(!Object.keys(snapshot.publicMetrics).length ? ["No hay métricas públicas o autorizadas suficientes; no se inventan resultados."] : []),
      ],
    };
  }
}

function profileSignals(platform: MarketingPlatform, profile: Record<string, unknown>, content: PlatformMarketingSnapshot["content"]): PlatformMarketingInterpretation["observedSignals"] {
  const signals: PlatformMarketingInterpretation["observedSignals"] = [];
  const add = (field: string, condition: unknown, evidence: string) => { if (condition) signals.push({ field, evidence }); };
  if (platform === "instagram") {
    add("bio", text(profile.bio || profile.description), "La bio pública es observable.");
    add("link", text(profile.link || profile.website), "El perfil muestra un enlace de salida.");
    add("business_info", text(profile.category || profile.location || profile.contact), "El perfil muestra información comercial pública.");
    add("highlights", count(profile.highlights) > 0, `Se observaron ${count(profile.highlights)} Highlights.`);
    add("pinned_posts", count(profile.pinnedPosts) > 0, `Se observaron ${count(profile.pinnedPosts)} publicaciones fijadas.`);
  } else if (platform === "google_business_profile") {
    for (const field of ["category", "address", "openingHours", "phone", "website", "products", "services", "photos", "rating", "reviewCount"]) add(field, present(profile[field]), `La ficha aporta ${field}.`);
  } else if (platform === "tiktok") {
    add("bio", text(profile.bio || profile.description), "La bio pública es observable.");
    add("link", text(profile.link || profile.website), "El perfil muestra un enlace.");
    add("formats", content.some((item) => item.format), "Se observaron formatos de contenido identificables.");
  } else if (platform === "linkedin") {
    for (const field of ["tagline", "about", "industry", "companySize", "specialties", "website", "callToAction"]) add(field, present(profile[field]), `La página aporta ${field}.`);
  } else if (platform === "youtube") {
    for (const field of ["banner", "description", "links", "trailer", "featuredVideo", "sections", "playlists"]) add(field, present(profile[field]), `El canal aporta ${field}.`);
    add("shorts", content.some((item) => String(item.format || "").toLowerCase() === "short"), "Se observaron Shorts en el contenido utilizable.");
  } else {
    add("description", text(profile.description || profile.bio), "La descripción pública es observable.");
    add("content", content.length > 0, `Se observaron ${content.length} contenidos públicos utilizables.`);
  }
  const formats = Array.from(new Set(content.map((item) => item.format).filter((item): item is string => Boolean(item))));
  if (formats.length) signals.push({ field: "content_formats", evidence: `Formatos observados: ${formats.join(", ")}.` });
  return signals;
}

function missingCoverage(coverage: SocialSourceCoverage) {
  const missing: string[] = [];
  if (!coverage.profile) missing.push("perfil no evaluado");
  if (!coverage.bio) missing.push("bio/descripción no evaluada");
  if (coverage.content === "none") missing.push("contenido no evaluado");
  if (coverage.comments === "none") missing.push("comentarios no evaluados");
  if (coverage.mentions === "none") missing.push("menciones no evaluadas");
  if (coverage.metrics === "none") missing.push("métricas no evaluadas");
  return missing;
}

function present(value: unknown) { return Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== ""; }
function text(value: unknown) { return typeof value === "string" && value.trim().length > 0; }
function count(value: unknown) { return Array.isArray(value) ? value.length : 0; }
