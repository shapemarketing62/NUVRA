export interface WebSourceSelectionInput {
  noWebDeclared: boolean;
  declaredWebUrl?: string | null;
  storedWebUrl?: string | null;
  discoveredWebUrl?: string | null;
}

/**
 * A user's "no website" declaration describes what they know at onboarding
 * time; it must not suppress a later, independently validated public website.
 * Declared/stored URLs remain ignored in that case, while a current discovery
 * candidate may be analyzed and kept as observed evidence.
 */
export function selectAnalysisWebUrl(input: WebSourceSelectionInput): string | null {
  if (input.noWebDeclared) return input.discoveredWebUrl || null;
  return input.declaredWebUrl || input.storedWebUrl || input.discoveredWebUrl || null;
}

/** A profile supplied by the owner takes precedence over a discovered match. */
export function selectPrimaryInstagram(
  declaredInstagram?: string | null,
  discoveredInstagram?: string | null,
): string | null {
  return declaredInstagram || discoveredInstagram || null;
}
