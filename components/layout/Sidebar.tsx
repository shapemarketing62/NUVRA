"use client";

import { usePathname, useRouter } from "next/navigation";
import { BrandMark } from "@/components/ui";
import { getPlanSnapshot, type PlanTier } from "@/lib/plans";
import { getDashboardNavigation, type DashboardNavItem } from "@/lib/product-navigation";

export function Sidebar({
  businessName,
  isDemo,
  planTier,
  internalAccess,
}: {
  businessName: string;
  isDemo: boolean;
  planTier: PlanTier;
  internalAccess: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const plan = getPlanSnapshot(planTier);
  const groups = getDashboardNavigation(planTier, internalAccess);

  const Item = ({ item }: { item: DashboardNavItem }) => {
    const active = pathname === item.href || (item.href === "/dashboard" && pathname === "/dashboard/");

    return (
      <button
        type="button"
        onClick={() => router.push(item.href)}
        className={`sidebar-item ${active ? "sidebar-item-active" : ""}`}
        aria-current={active ? "page" : undefined}
      >
        {item.label}
      </button>
    );
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <BrandMark />
      </div>
      <nav className="sidebar-nav" aria-label="Navegación principal">
        {groups.map((group) => (
          <div className="sidebar-group" key={group.label}>
            <div className="sidebar-label">{group.label}</div>
            {group.items.map((item) => <Item key={item.href} item={item} />)}
          </div>
        ))}
      </nav>
      <div style={{ flex: 1 }} />
      <div className="sidebar-account">
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{businessName}</div>
        <div style={{ fontSize: 11, color: "var(--n-text-faint)", marginTop: 4, marginBottom: 10 }}>
          Plan {plan.label}
          {isDemo && " · DEMO"}
          {internalAccess && " · acceso interno"}
        </div>
      </div>
    </aside>
  );
}
