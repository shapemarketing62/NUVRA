export type MembershipRole = "owner" | "admin" | "member" | "viewer";
export type Permission = "organization.read" | "organization.manage" | "business.read" | "business.create" | "business.update" | "business.delete" | "analysis.run" | "team.manage";
const ROLE_PERMISSIONS: Record<MembershipRole, Permission[]> = {
  owner: ["organization.read", "organization.manage", "business.read", "business.create", "business.update", "business.delete", "analysis.run", "team.manage"],
  admin: ["organization.read", "organization.manage", "business.read", "business.create", "business.update", "analysis.run", "team.manage"],
  member: ["organization.read", "business.read", "business.update", "analysis.run"],
  viewer: ["organization.read", "business.read"],
};
export function roleCan(role: string, permission: Permission): boolean { return ROLE_PERMISSIONS[role as MembershipRole]?.includes(permission) ?? false; }
export function businessAccessWhere(userId: string, businessId: string) { return { id: businessId, organization: { memberships: { some: { userId } } } } as const; }
