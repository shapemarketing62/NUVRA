const GENERIC_ORGANIZATION_TOKENS = new Set([
  "cafe", "tienda", "store", "centro", "clinica", "estudio", "servicios",
  "grupo", "company", "local", "casa", "home",
]);

const GEOGRAPHIC_QUALIFIERS = new Set([
  "argentina", "argentino", "argentine", "caba", "buenos", "aires",
  "chile", "mexico", "colombia", "uruguay", "peru", "espana",
]);

export function normalizeDiscoveryText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns the stable lexical core of a user-entered business name. Geographic
 * qualifiers are useful context but are not required to appear in an official
 * brand title or domain (for example, "Marca Argentina" may publish as "Marca").
 */
export function businessNameCoreTokens(value: string): string[] {
  const tokens = normalizeDiscoveryText(value).split(/\s+/).filter((token) => token.length > 2);
  const withoutGeography = tokens.filter((token) => !GEOGRAPHIC_QUALIFIERS.has(token));
  const distinctive = withoutGeography.filter((token) => !GENERIC_ORGANIZATION_TOKENS.has(token));
  return distinctive.length ? distinctive : withoutGeography.length ? withoutGeography : tokens;
}

export function businessNameCore(value: string): string {
  return businessNameCoreTokens(value).join(" ");
}
