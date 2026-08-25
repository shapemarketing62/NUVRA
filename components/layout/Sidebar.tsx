"use client";

import { usePathname, useRouter } from "next/navigation";
import { BrandMark, ProBadge } from "@/components/ui";
import { getPlanSnapshot, hasEntitlement, type PlanTier } from "@/lib/plans";

const NAV_MAIN = [
  { id: "/dashboard", label: "Resumen" },
  { id: "/dashboard/diagnostico", label: "Diagnóstico" },
  { id: "/dashboard/estrategia", label: "Mi estrategia" },
  { id: "/dashboard/acciones", label: "Acciones" },
  { id: "/dashboard/evolucion", label: "Evolución" },
  { id: "/dashboard/resultados", label: "Resultados" },
  { id: "/dashboard/negocio", label: "Mi negocio" },
];

const NAV_PRO = [
  { id: "/dashboard/competencia", label: "Competencia", pro: true },
  { id: "/dashboard/nuvra-ai", label: "Nuvra AI", pro: true },
];

const NAV_END = [
  { id: "/dashboard/shape-partner", label: "Shape Partner" },
  { id: "/dashboard/configuracion", label: "Configuración" },
];

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

  const Item = ({ item }: { item: { id: string; label: string; pro?: boolean } }) => {
    const active = pathname === item.id || (item.id === "/dashboard" && pathname === "/dashboard/");
    const locked =
      item.id === "/dashboard/competencia"
        ? !hasEntitlement(plan, "analysis.competitors", internalAccess)
        : item.id === "/dashboard/nuvra-ai"
        ? !hasEntitlement(plan, "ai.nuvra", internalAccess)
        : false;

    return (
      <button
        type="button"
        onClick={() => router.push(item.id)}
        className={`sidebar-item ${active ? "sidebar-item-active" : ""}`}
        style={{ opacity: locked ? 0.7 : 1 }}
        aria-current={active ? "page" : undefined}
      >
        {item.label}
        {(item.pro || locked) && <ProBadge label={locked ? "PRO+" : "PRO"} />}
      </button>
    );
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <BrandMark />
      </div>
      <nav className="sidebar-nav" aria-label="Navegación principal">
        <div className="sidebar-group"><div className="sidebar-label">Trabajo</div>{NAV_MAIN.map((i) => <Item key={i.id} item={i} />)}</div>
        <div className="sidebar-group"><div className="sidebar-label">Análisis avanzado</div>{NAV_PRO.map((i) => <Item key={i.id} item={i} />)}</div>
        <div className="sidebar-group"><div className="sidebar-label">Cuenta</div>{NAV_END.map((i) => <Item key={i.id} item={i} />)}</div>
      </nav>
      <div style={{ flex: 1 }} />
      <div className="sidebar-account">
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{businessName}</div>
        <div style={{ fontSize: 11, color: "var(--n-text-faint)", marginTop: 4, marginBottom: 10 }}>
          Plan {plan.label}
          {isDemo && " · DEMO"}
          {internalAccess && " · acceso interno"}
        </div>
        <div style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--n-text-soft)" }}>
          {plan.summary}
        </div>
      </div>
    </aside>
  );
}
