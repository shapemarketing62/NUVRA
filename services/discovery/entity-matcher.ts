export type MatchStatus = "confirmed" | "probable" | "uncertain" | "rejected";

export type DiscoveredSourceType =
  | "web"
  | "instagram"
  | "google_maps"
  | "facebook"
  | "linkedin"
  | "x"
  | "mentions"
  | "competitors";

export type EntityRelationship =
  | "primary_entity"
  | "local_operation"
  | "brand_global"
  | "sub_brand"
  | "licensed_business"
  | "individual_location"
  | "third_party";

export interface CandidateSource {
  title: string;
  url: string;
  snippet: string;
  type: DiscoveredSourceType;
  matchScore?: number;
  status?: MatchStatus;
  entityRelationship?: EntityRelationship;
  rationale?: string;
  metadata?: Record<string, unknown>;
}

export interface BusinessEntityTarget {
  name: string;
  category?: string;
  location?: string;
  tipoCliente?: string;
  declaredWebUrl?: string;
  declaredInstagram?: string;
  phone?: string;
  address?: string;
}

const THIRD_PARTY_AGGREGATORS = [
  "tripadvisor.com",
  "yelp.com",
  "pedidosya.com",
  "rappi.com",
  "mercadolibre.com",
  "wikipedia.org",
  "paxinasgalegas.es",
  "yellowpages.com",
  "pagesjaunes.fr",
  "foursquare.com",
  "wanderlog.com",
  "play.google.com",
  "medium.com",
  "reddit.com",
  "linktr.ee",
  "beacons.ai",
  "bio.site",
  "wa.me",
];

export class EntityMatcher {
  /**
   * Evalúa un candidato descubierto y determina su matchScore, status, entityRelationship y rationale.
   */
  static evaluateCandidate(
    candidate: CandidateSource,
    target: BusinessEntityTarget
  ): CandidateSource {
    const normTargetName = this.normalizeText(target.name);
    const normTitle = this.normalizeText(candidate.title);
    const normSnippet = this.normalizeText(candidate.snippet);
    const urlLower = candidate.url.toLowerCase();

    let domain = "";
    try {
      domain = new URL(candidate.url).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      domain = candidate.url.toLowerCase();
    }

    let score = 0;
    const reasons: string[] = [];
    const signals: Record<string, number | boolean | string> = {};

    // Detectar relación de entidad (Distinguir Marca de Entidad Comercial)
    const entityRelationship = this.detectRelationship(candidate, target, domain, normTitle);

    // 1. Coincidencia de Nombre / Marca (máx 0.35)
    const brandTokens = businessNameCoreTokens(normTargetName);
    const matchesBrandInTitle = brandTokens.every(
      (token) => normTitle.includes(token) || domain.includes(token)
    );
    const matchesBrandInSnippet = brandTokens.every((token) => normSnippet.includes(token));

    if (matchesBrandInTitle) {
      score += 0.35;
      signals.name = 0.35;
      reasons.push("Nombre de marca presente en título/dominio");
    } else if (matchesBrandInSnippet) {
      score += 0.20;
      signals.name = 0.2;
      reasons.push("Nombre de marca presente en descripción");
    } else {
      reasons.push("Mención débil o parcial de marca");
    }

    // 2. Coincidencia de Dominio u Oficialidad según relación de entidad (máx 0.30)
    const isDeclaredWeb =
      target.declaredWebUrl &&
      candidate.type === "web" &&
      this.isSameDomain(candidate.url, target.declaredWebUrl);

    if (isDeclaredWeb) {
      score += 0.30;
      signals.declaredDomain = 0.3;
      reasons.push("Coincide con el sitio web declarado por el negocio");
    } else if (candidate.type === "web") {
      const isThirdParty = THIRD_PARTY_AGGREGATORS.some((agg) => domain.includes(agg));
      if (isThirdParty) {
        score -= 0.35;
        signals.thirdParty = -0.35;
        reasons.push(`Dominio de terceros o agregador de contenido (${domain}) - no es sitio oficial`);
      } else if (entityRelationship === "local_operation") {
        score += 0.30;
        signals.domain = 0.3;
        reasons.push(`Sitio web oficial de la operación local (${domain})`);
      } else if (entityRelationship === "brand_global") {
        score += 0.20;
        signals.domain = 0.2;
        reasons.push(`Sitio web oficial global de la marca (${domain})`);
      } else if (entityRelationship === "licensed_business" || entityRelationship === "sub_brand") {
        score += 0.05;
        signals.domain = 0.05;
        reasons.push(`Línea de producto o licenciatario de marca (${domain}) - no es la operación comercial directa`);
      } else if (brandTokens.some((t) => domain.includes(t))) {
        score += 0.15;
        signals.domain = 0.15;
        reasons.push(`El dominio (${domain}) contiene la marca`);
      } else {
        score += 0.05;
      }
    } else if (candidate.type === "instagram") {
      const handleMatch = this.evaluateSocialHandle(candidate.url, normTargetName);
      score += handleMatch.score;
      signals.socialHandle = handleMatch.score;
      reasons.push(handleMatch.reason);
    } else if (candidate.type === "google_maps") {
      if (domain.includes("support.google.com") || urlLower.includes("support.google")) {
        score -= 0.35;
        signals.invalidMaps = -0.35;
        reasons.push("Página de soporte de Google Help, no es una ficha de negocio de Google Maps");
      } else if (domain.includes("google.") && (urlLower.includes("/maps") || urlLower.includes("g.page"))) {
        score += 0.25;
        signals.mapsUrl = 0.25;
        reasons.push("URL oficial de Google Maps / Google Business");
      }
    } else if (["facebook", "linkedin", "x"].includes(candidate.type)) {
      if (brandTokens.some((t) => urlLower.includes(t))) {
        score += 0.20;
        signals.socialHandle = 0.2;
        reasons.push(`Perfil en ${candidate.type} alineado con la marca`);
      }
    }

    // 3. Coincidencia de Ubicación / Geografía (máx 0.20)
    if (target.location) {
      const locTokens = this.normalizeText(target.location)
        .split(/[\s,]+/)
        .filter((t) => t.length > 3 && !["buenos", "aires", "argentina"].includes(t));

      const hasLocationMatch = locTokens.some(
        (loc) => normTitle.includes(loc) || normSnippet.includes(loc) || urlLower.includes(loc)
      );

      if (hasLocationMatch) {
        score += 0.20;
        signals.location = 0.2;
        reasons.push(`Coincidencia geográfica con '${target.location}'`);
      } else {
        const contradictoryLocation = this.detectContradictoryLocation(
          normTitle + " " + normSnippet,
          target.location
        );
        if (contradictoryLocation) {
          score -= 0.45;
          signals.locationConflict = -0.45;
          reasons.push(`Conflicto de ubicación (menciona '${contradictoryLocation}')`);
        }
      }
    }

    // 4. Coincidencia de Rubro / Categoría (máx 0.15)
    if (target.category) {
      const categoryTokens = this.normalizeText(target.category)
        .split(/\s+/)
        .filter((t) => t.length > 3);
      const hasCategoryMatch = categoryTokens.some(
        (cat) => normTitle.includes(cat) || normSnippet.includes(cat)
      );

      if (hasCategoryMatch) {
        score += 0.15;
        signals.category = 0.15;
        reasons.push(`Coincidencia con el rubro '${target.category}'`);
      }
    }

    const contactMatch = this.contactMatch(candidate, target);
    score += contactMatch.score;
    if (contactMatch.score > 0) {
      signals.contact = contactMatch.score;
      reasons.push(contactMatch.reason);
    }

    const metadataConflict = this.metadataConflict(candidate, target);
    if (metadataConflict) {
      score -= 0.45;
      signals.structuredConflict = -0.45;
      reasons.push(metadataConflict);
    }

    const corroboratingSources = Array.isArray(candidate.metadata?.corroboratingSources)
      ? candidate.metadata.corroboratingSources.filter((value): value is string => typeof value === "string")
      : [];
    const directCorroborationCount = Number(candidate.metadata?.directCorroborationCount || 0);
    if (corroboratingSources.length > 0) {
      const corroborationWeight = Math.min(0.12, directCorroborationCount * 0.08 + Math.max(0, corroboratingSources.length - directCorroborationCount) * 0.03);
      score += corroborationWeight;
      signals.corroboration = corroborationWeight;
      reasons.push(`Corroborado por ${corroboratingSources.length} fuente(s) independiente(s)`);
    }

    // Normalizar score final entre 0 y 1
    const matchScore = Math.max(0, Math.min(1.0, Math.round(score * 100) / 100));

    // Determinar status según los límites requeridos
    let status: MatchStatus = "rejected";
    if (matchScore >= 0.75) {
      status = "confirmed";
    } else if (matchScore >= 0.55) {
      status = "probable";
    } else if (matchScore >= 0.35) {
      status = "uncertain";
    } else {
      status = "rejected";
    }

    // Si es un licenciatario o sub-marca, NO debe quedar como 'confirmed' si compite con la operación principal
    if (candidate.type === "web" && (entityRelationship === "licensed_business" || entityRelationship === "sub_brand")) {
      if (status === "confirmed") {
        status = "probable";
      }
    }

    // Si es un sitio de terceros intentando ser la web oficial, forzar uncertain o rejected
    if (candidate.type === "web" && THIRD_PARTY_AGGREGATORS.some((agg) => domain.includes(agg))) {
      status = status === "confirmed" ? "uncertain" : "rejected";
    }

    const domainSupportsBrand = brandTokens.some((token) => domain.includes(token));
    if (candidate.type === "web" && !isDeclaredWeb && !domainSupportsBrand && directCorroborationCount === 0) {
      status = matchScore >= 0.35 ? "uncertain" : "rejected";
      reasons.push("No hay dominio de marca ni enlace cruzado suficiente para tratarlo como sitio oficial");
    }

    const isSocial = ["instagram", "facebook", "linkedin", "x"].includes(candidate.type);
    if (isSocial && Number(signals.socialHandle || 0) < 0.15 && directCorroborationCount === 0) {
      status = matchScore >= 0.35 ? "uncertain" : "rejected";
      reasons.push("El perfil social no tiene handle coincidente ni corroboración directa");
    }

    if (metadataConflict || Number(signals.locationConflict || 0) < 0) {
      status = "rejected";
    }

    return {
      ...candidate,
      matchScore,
      status,
      entityRelationship,
      rationale: `${status.toUpperCase()} (${Math.round(matchScore * 100)}% - ${entityRelationship}): ${reasons.join("; ")}`,
      metadata: { ...candidate.metadata, matchingSignals: signals, corroboratingSources },
    };
  }

  private static detectRelationship(
    candidate: CandidateSource,
    target: BusinessEntityTarget,
    domain: string,
    normTitle: string
  ): EntityRelationship {
    // Si el dominio pertenece a la marca oficial local, forzar tipo web y local_operation
    const normTarget = this.normalizeText(target.name);
    const brandToken = this.identityTokens(normTarget)[0];

    if (brandToken && domain.includes(brandToken)) {
      if (THIRD_PARTY_AGGREGATORS.some((agg) => domain.includes(agg))) {
        return "third_party";
      }

      if (/athome|at-home|nestle|capsula|supermercado/i.test(domain + " " + normTitle)) {
        return "licensed_business";
      }

      if (/rewards|club|loyalty|card/i.test(domain)) {
        return "sub_brand";
      }

      if (/\/local\/|\/tienda\/|\/sucursal\/|\/store\/|\/branch\/|\/articulo\//i.test(candidate.url)) {
        return "individual_location";
      }

      const isLocalTLD = Boolean(target.location && (
        (target.location.toLowerCase().includes("argentina") && (domain.endsWith(".ar") || domain.includes(".com.ar"))) ||
        (target.location.toLowerCase().includes("chile") && domain.endsWith(".cl")) ||
        (target.location.toLowerCase().includes("mexico") && (domain.endsWith(".mx") || domain.includes(".com.mx")))
      ));

      if (isLocalTLD || domain.endsWith(".ar")) {
        return "local_operation";
      }

      if (domain.endsWith(".com")) {
        return "brand_global";
      }

      return "primary_entity";
    }

    if (candidate.type === "instagram" || candidate.type === "facebook") {
      if (candidate.url.toLowerCase().includes("argentina") || candidate.url.toLowerCase().includes("_ar")) {
        return "local_operation";
      }
      return "brand_global";
    }

    return "third_party";
  }

  private static evaluateSocialHandle(
    url: string,
    normTargetName: string
  ): { score: number; reason: string } {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname.toLowerCase().replace(/\/$/, "");
      const segments = pathname.split("/").filter(Boolean);

      if (segments.length === 0 || ["p", "explore", "reels", "stories", "tags"].includes(segments[0])) {
        return { score: 0, reason: "Enlace a post o sección general de Instagram, no perfil de marca" };
      }

      const handle = segments[0];
      const targetSlug = normTargetName.replace(/\s+/g, "");

      if (handle === targetSlug || handle.startsWith(targetSlug) || targetSlug.startsWith(handle)) {
        return { score: 0.25, reason: `Perfil de Instagram @${handle} coincide directamente con la marca` };
      }

      if (this.fuzzyMatch(handle, targetSlug)) {
        return { score: 0.15, reason: `Perfil de Instagram @${handle} tiene alta similitud` };
      }

      return { score: 0.05, reason: `Perfil @${handle} con coincidencia parcial` };
    } catch {
      return { score: 0, reason: "URL de red social no analizable" };
    }
  }

  private static detectContradictoryLocation(text: string, targetLoc: string): string | null {
    const normTargetLoc = this.normalizeText(targetLoc);

    const locations = [
      "espana",
      "españa",
      "mexico",
      "méxico",
      "colombia",
      "chile",
      "peru",
      "perú",
      "uruguay",
      "madrid",
      "barcelona",
      "santiago",
      "bogota",
      "lima",
      "cordoba",
      "rosario",
      "mendoza",
      "la plata",
      "mar del plata",
      "palermo",
      "belgrano",
      "caballito",
      "recoleta",
      "villa crespo",
      "san isidro",
    ];

    for (const loc of locations) {
      if (text.includes(loc) && !normTargetLoc.includes(loc)) {
        return loc;
      }
    }
    return null;
  }

  private static contactMatch(candidate: CandidateSource, target: BusinessEntityTarget): { score: number; reason: string } {
    const text = `${candidate.title} ${candidate.snippet} ${JSON.stringify(candidate.metadata || {})}`;
    const targetPhone = String(target.phone || "").replace(/\D/g, "");
    if (targetPhone.length >= 7) {
      const candidateDigits = text.replace(/\D/g, "");
      const comparable = targetPhone.slice(-8);
      if (candidateDigits.includes(comparable)) return { score: 0.22, reason: "Coincide el teléfono público" };
    }
    const targetAddress = this.normalizeText(target.address || "");
    if (targetAddress.length >= 8 && this.normalizeText(text).includes(targetAddress)) {
      return { score: 0.15, reason: "Coincide la dirección pública" };
    }
    return { score: 0, reason: "" };
  }

  private static metadataConflict(candidate: CandidateSource, target: BusinessEntityTarget): string | null {
    const candidateLocation = this.normalizeText(String(candidate.metadata?.location || ""));
    const targetLocation = this.normalizeText(target.location || "");
    if (candidateLocation && targetLocation) {
      const targetSpecific = targetLocation.split(" ").filter((token) => token.length > 3 && !["buenos", "aires", "argentina"].includes(token));
      const candidateSpecific = candidateLocation.split(" ").filter((token) => token.length > 3 && !["buenos", "aires", "argentina"].includes(token));
      if (targetSpecific.length && candidateSpecific.length && !targetSpecific.some((token) => candidateSpecific.includes(token))) {
        return `La ubicación estructurada del candidato (${candidate.metadata?.location}) contradice la del negocio`;
      }
    }

    const candidateCategory = this.normalizeText(String(candidate.metadata?.category || ""));
    const targetCategory = this.normalizeText(target.category || "");
    if (candidateCategory && targetCategory) {
      const targetTokens = targetCategory.split(" ").filter((token) => token.length > 4);
      const candidateTokens = candidateCategory.split(" ").filter((token) => token.length > 4);
      const targetFamily = this.categoryFamily(targetCategory);
      const candidateFamily = this.categoryFamily(candidateCategory);
      if (targetTokens.length && candidateTokens.length && targetFamily && candidateFamily && targetFamily !== candidateFamily && !targetTokens.some((token) => candidateTokens.includes(token))) {
        return `El rubro estructurado del candidato (${candidate.metadata?.category}) contradice el rubro declarado`;
      }
    }
    return null;
  }

  private static categoryFamily(category: string): string | null {
    if (/estetic|salud|clinic|odont|dental|medic|dermat|belleza/.test(category)) return "health_beauty";
    if (/abog|jurid|legal|escriban/.test(category)) return "legal";
    if (/caf|restaurant|gastronom|comida|bar|pasteler/.test(category)) return "food";
    if (/gimnas|fitness|entren|deport/.test(category)) return "fitness";
    if (/inmobil|propiedad|real estate/.test(category)) return "real_estate";
    if (/contab|consult|estudio profesional|servicio b2b/.test(category)) return "professional";
    if (/tienda|retail|comercio|venta|ecommerce/.test(category)) return "commerce";
    return null;
  }

  private static isSameDomain(urlA: string, urlB: string): boolean {
    try {
      const hostA = new URL(urlA).hostname.toLowerCase().replace(/^www\./, "");
      const hostB = new URL(urlB).hostname.toLowerCase().replace(/^www\./, "");
      return hostA === hostB;
    } catch {
      return false;
    }
  }

  private static identityTokens(normalizedName: string): string[] {
    return businessNameCoreTokens(normalizedName);
  }

  private static normalizeText(text: string): string {
    return normalizeDiscoveryText(text);
  }

  private static fuzzyMatch(a: string, b: string): boolean {
    if (a.includes(b) || b.includes(a)) return true;
    return false;
  }
}
import { businessNameCoreTokens, normalizeDiscoveryText } from "./business-name-normalization.ts";
