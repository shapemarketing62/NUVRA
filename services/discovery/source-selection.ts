export interface WebSourceSelectionInput {
  noWebDeclared: boolean;
  declaredWebUrl?: string | null;
  storedWebUrl?: string | null;
  discoveredWebUrl?: string | null;
}

/**
 * An explicit "no website" declaration is authoritative for the current
 * business. Discovery may still report candidates for audit, but it must not
 * turn one of them into the website analyzed for that business.
 */
export function selectAnalysisWebUrl(input: WebSourceSelectionInput): string | null {
  if (input.noWebDeclared) return null;
  return input.declaredWebUrl || input.storedWebUrl || input.discoveredWebUrl || null;
}

/** A profile supplied by the owner takes precedence over a discovered match. */
export function selectPrimaryInstagram(
  declaredInstagram?: string | null,
  discoveredInstagram?: string | null,
): string | null {
  return declaredInstagram || discoveredInstagram || null;
}
