// CrossLinkCorroboration
// -----------------------
// Applies the project's corroboration rules to platform candidates that
// come from a website cross-link (i.e. the business's own validated web
// page has an outbound link to that platform profile).
//
// Critical rules implemented here:
//   * A single page with two links to the same platform is ONE source of
//     evidence, not two. We deduplicate by (platform, normalized URL).
//   * Two different VALIDATED pages on the same domain that each link to
//     the same platform URL still count as ONE source (same business
//     domain, same URL). We do not multiply the corroboration signal.
//   * Two different VALIDATED pages linking to two DIFFERENT platform
//     profiles count as ONE corroboration only when both pages agree
//     about which platform URL is canonical. Otherwise the analyzer
//     must escalate to "uncertain" and let Marketing Knowledge decide.
//   * A single page that links to TWO different social profiles of the
//     same platform (e.g. two Instagram URLs) is a SIGNAL of
//     inconsistency, not stronger corroboration.
//
// This module is a pure function. It does not call the network and is
// safe to use in tests.

import type { CrossLinkPlatform, WebsiteCrossLink } from "./website-cross-link-extractor.ts";

export type CorroborationLevel = "strong" | "single_page" | "inconsistent" | "none";

export interface CorroborationInput {
  /** Cross-links grouped by platform, as produced by the extractor. */
  links: WebsiteCrossLink[];
  /** Business name, normalized lowercase (for inconsistency checks). */
  businessName?: string;
}

export interface PlatformCorroboration {
  platform: CrossLinkPlatform;
  level: CorroborationLevel;
  /** Distinct URLs the business's own pages link to, normalized. */
  urls: string[];
  /** Distinct pages that contain the link(s). */
  sourcePages: string[];
  /** Total number of <a href> occurrences (pre-dedup). */
  rawLinkCount: number;
  /** Reasons that explain the level (used in AnalysisTrace). */
  reasons: string[];
}

function normalizeUrl(u: string): string {
  try {
    const parsed = new URL(u);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return u;
  }
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export class CrossLinkCorroboration {
  static evaluate(input: CorroborationInput): PlatformCorroboration[] {
    const groups = new Map<CrossLinkPlatform, WebsiteCrossLink[]>();
    for (const link of input.links) {
      const list = groups.get(link.platform);
      if (list) list.push(link);
      else groups.set(link.platform, [link]);
    }
    const out: PlatformCorroboration[] = [];
    const entries: Array<[CrossLinkPlatform, WebsiteCrossLink[]]> = Array.from(groups.entries());
    for (const entry of entries) {
      const platform = entry[0];
      const links = entry[1];
      const urls = unique(links.map((l: WebsiteCrossLink) => normalizeUrl(l.url))).filter((u): u is string => Boolean(u));
      const sourcePages: string[] = unique(links.map((l: WebsiteCrossLink) => l.sourcePage));
      const rawLinkCount = links.length;
      const reasons: string[] = [];
      let level: CorroborationLevel = "none";

      if (urls.length === 0) {
        level = "none";
        reasons.push("no usable cross-link URLs");
      } else if (urls.length > 1) {
        // Two or more different platform profiles linked from the same
        // business domain = inconsistency. Do NOT upgrade corroboration.
        level = "inconsistent";
        reasons.push(`${urls.length} distinct ${platform} URLs linked from the business web — inconsistent`);
      } else if (sourcePages.length >= 2) {
        // Same single URL appears on multiple pages of the business web.
        // Per project rules this is still ONE source of evidence.
        level = "single_page";
        reasons.push(`${sourcePages.length} pages link to the same ${platform} URL — counted as one source`);
      } else {
        level = "strong";
        reasons.push(`1 page links to a single ${platform} URL`);
      }
      out.push({ platform, level, urls, sourcePages, rawLinkCount, reasons });
    }
    return out;
  }
}
