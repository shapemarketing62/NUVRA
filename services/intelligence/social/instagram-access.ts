import type { AcquisitionMethod, SocialSourceCoverage } from "./social-source-provider.ts";

export function buildInstagramDiscoveredAccess(input: { url: string; title?: string | null; snippet?: string | null; declared: boolean }) {
  const acquisitionMethod: AcquisitionMethod = input.declared ? "declared_by_user" : "search_index";
  const sourceCoverage: SocialSourceCoverage = { profile: true, bio: Boolean(input.snippet), content: "none", comments: "none", mentions: "none", metrics: "none" };
  return {
    status: "discovered" as const,
    data: { url: input.url, title: input.title || null, publicDescription: input.snippet || null, publicOnly: true, accessLevel: "discovered", profileDiscovered: true, contentAnalyzed: false, acquisitionMethods: [acquisitionMethod], sourceCoverage },
    acquisitionMethod,
    sourceCoverage,
    limitation: "Se identificó el perfil, pero no se analizaron publicaciones, comentarios ni métricas privadas.",
  };
}
