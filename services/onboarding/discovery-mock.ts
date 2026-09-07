import type { DiscoveryResult } from "@/lib/onboarding-v2-types";

export function mockDiscovery(input: { nombre: string; rubro: string; ubicacion: string; webUrl?: string; instagramHandle?: string }): DiscoveryResult {
  const web = input.webUrl && !input.webUrl.includes("ejemplo")
    ? { url: input.webUrl, status: "found" as const }
    : { url: `https://${input.nombre.toLowerCase().replace(/[^a-z0-9]/g, "")}.com.ar`, status: "ambiguous" as const };

  const instagram = input.instagramHandle
    ? { handle: input.instagramHandle.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/$/, ""), status: "found" as const }
    : { handle: `${input.nombre.toLowerCase().replace(/[^a-z0-9]/g, "")}_oficial`, status: "found" as const };

  const tiktok = { handle: `${input.nombre.toLowerCase().replace(/[^a-z0-9]/g, "")}`, status: "found" as const };

  return {
    web,
    instagram,
    tiktok,
    maps: { status: "not_confirmed" as const },
    reviews: { status: "insufficient" as const },
  };
}
