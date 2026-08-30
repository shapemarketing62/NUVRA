import { hasEntitlement, normalizePlanTier } from "./plans.ts";

export type DashboardNavItem = {
  href: string;
  label: string;
};

export type DashboardNavGroup = {
  label: "Trabajo" | "Negocio" | "Cuenta";
  items: DashboardNavItem[];
};

export const PRODUCT_AVAILABILITY = {
  nuvraAi: false,
  commercialResults: false,
} as const;

export function canAccessPartnerService(planTier?: string | null, internalAccess = false): boolean {
  return hasEntitlement(normalizePlanTier(planTier), "workspace.overview", internalAccess);
}

export function getDashboardNavigation(planTier?: string | null, internalAccess = false): DashboardNavGroup[] {
  const plan = normalizePlanTier(planTier);
  const work: DashboardNavItem[] = [
    { href: "/dashboard", label: "Resumen" },
    { href: "/dashboard/diagnostico", label: "Diagnóstico" },
    { href: "/dashboard/estrategia", label: "Estrategia" },
    { href: "/dashboard/acciones", label: "Acciones" },
    { href: "/dashboard/evolucion", label: "Evolución" },
  ];

  if (PRODUCT_AVAILABILITY.nuvraAi && hasEntitlement(plan, "ai.nuvra", internalAccess)) {
    work.push({ href: "/dashboard/nuvra-ai", label: "Nuvra AI" });
  }

  const business: DashboardNavItem[] = [{ href: "/dashboard/negocio", label: "Mi negocio" }];
  if (hasEntitlement(plan, "analysis.competitors", internalAccess)) {
    business.push({ href: "/dashboard/competencia", label: "Competencia" });
  }
  if (canAccessPartnerService(plan, internalAccess)) {
    business.push({ href: "/dashboard/shape-partner", label: "Shape Partner" });
  }

  return [
    { label: "Trabajo", items: work },
    { label: "Negocio", items: business },
    { label: "Cuenta", items: [{ href: "/dashboard/configuracion", label: "Configuración" }] },
  ];
}
