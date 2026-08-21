"use client";

import { usePathname, useRouter } from "next/navigation";
import { COLORS } from "@/lib/design-tokens";
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
}: {
  businessName: string;
  isDemo: boolean;
  planTier: PlanTier;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const plan = getPlanSnapshot(planTier);

  const Item = ({ item }: { item: { id: string; label: string; pro?: boolean } }) => {
    const active = pathname === item.id || (item.id === "/dashboard" && pathname === "/dashboard/");
    const locked =
      item.id === "/dashboard/competencia"
        ? !hasEntitlement(plan, "analysis.competitors")
        : item.id === "/dashboard/nuvra-ai"
        ? !hasEntitlement(plan, "ai.nuvra")
        : false;

    return (
      <button
        type="button"
        onClick={() => router.push(item.id)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "10px 14px",
          borderRadius: 10,
          border: "none",
          background: active ? COLORS.paperDim : "transparent",
          color: active ? COLORS.ink : COLORS.inkSoft,
          fontWeight: active ? 600 : 500,
          fontSize: 14,
          textAlign: "left",
          marginBottom: 3,
          cursor: "pointer",
          opacity: locked ? 0.75 : 1,
        }}
      >
        {item.label}
        {(item.pro || locked) && <ProBadge label={locked ? "PRO+" : "PRO"} />}
      </button>
    );
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand" style={{ padding: "0 8px", marginBottom: 28 }}>
        <BrandMark />
      </div>
      <nav className="sidebar-nav" aria-label="Navegación principal">
        <div><div className="sidebar-label">Trabajo</div>{NAV_MAIN.map((i) => <Item key={i.id} item={i} />)}</div>
        <div className="sidebar-divider" style={{ height: 1, background: COLORS.line, margin: "8px 8px 4px" }} />
        <div><div className="sidebar-label">Análisis avanzado</div>{NAV_PRO.map((i) => <Item key={i.id} item={i} />)}</div>
        <div className="sidebar-divider" style={{ height: 1, background: COLORS.line, margin: "8px 8px 4px" }} />
        <div><div className="sidebar-label">Cuenta</div>{NAV_END.map((i) => <Item key={i.id} item={i} />)}</div>
      </nav>
      <div style={{ flex: 1 }} />
      <div className="sidebar-account" style={{ borderTop: `1px solid ${COLORS.line}`, padding: "14px 8px 4px" }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{businessName}</div>
        <div className="shp-mono" style={{ fontSize: 11, color: COLORS.inkFaint, marginBottom: 12 }}>
          Plan {plan.label}
          {isDemo && " · DEMO"}
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: COLORS.inkSoft }}>
          {plan.summary}
        </div>
      </div>
    </aside>
  );
}
