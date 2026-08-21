import "server-only";
export type VerifiedEmailCapability = "analysis.run" | "integration.connect" | "team.invite";
export function requiresVerifiedEmail(capability: VerifiedEmailCapability): boolean {
  const configured = (process.env.REQUIRE_VERIFIED_EMAIL_FOR || "integration.connect,team.invite").split(",").map((item) => item.trim());
  return configured.includes(capability);
}
