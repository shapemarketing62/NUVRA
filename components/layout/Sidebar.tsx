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

  const NavGlyph = ({ href }: { href: string }) => {
    const path = href === "/dashboard" ? "M3 3h4v4H3zM9 3h4v7H9zM3 9h4v4H3zM9 12h4v1H9z"
      : href.includes("diagnostico") ? "M2.5 4.5h11M2.5 8h8M2.5 11.5h5"
      : href.includes("estrategia") ? "M3 12.5 7.5 3l2.2 4.1 3.3-1.4"
      : href.includes("acciones") ? "m3 8 2.2 2.2L12.5 3"
      : href.includes("evolucion") ? "M2.5 12.5V8.8l3-2.5 2.5 1.8 5-5"
      : href.includes("negocio") ? "M3 13V5.5L8 2l5 3.5V13M6 13V9h4v4"
      : href.includes("competencia") ? "M2.5 12.5h11M4 10V6m4 4V3m4 7V7"
      : href.includes("configuracion") ? "M8 3v2m0 6v2M3 8h2m6 0h2M4.5 4.5l1.4 1.4m4.2 4.2 1.4 1.4m0-7-1.4 1.4m-4.2 4.2-1.4 1.4"
      : "M3 3h10v10H3z";
    return <svg className="sidebar-icon" viewBox="0 0 16 16" aria-hidden="true"><path d={path} /></svg>;
  };

  const Item = ({ item }: { item: DashboardNavItem }) => {
    const active = pathname === item.href || (item.href === "/dashboard" && pathname === "/dashboard/");

    return (
      <button
        type="button"
        onClick={() => router.push(item.href)}
        className={`sidebar-item ${active ? "sidebar-item-active" : ""}`}
        aria-current={active ? "page" : undefined}
      >
        <NavGlyph href={item.href} />
        <span>{item.label}</span>
      </button>
    );
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <BrandMark inverse />
      </div>
      <nav className="sidebar-nav" aria-label="Navegación principal">
        {groups.map((group) => (
          <div className="sidebar-group" key={group.label}>
            <div className="sidebar-label">{group.label}</div>
            {group.items.map((item) => <Item key={item.href} item={item} />)}
          </div>
        ))}
      </nav>
      <div className="sidebar-account">
        <div className="sidebar-business-name">{businessName}</div>
        <div className="sidebar-plan">
          Plan {plan.label}
          {isDemo && " · DEMO"}
          {internalAccess && " · acceso interno"}
        </div>
      </div>
    </aside>
  );
}
