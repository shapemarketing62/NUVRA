"use client";
import { useDashboardData } from "@/lib/use-dashboard-data";
import { hasEntitlement, getPlanSnapshot } from "@/lib/plans";
import { Card, ErrorState, PageSkeleton, StatusBadge, UpgradePanel } from "@/components/ui";
import { COLORS } from "@/lib/design-tokens";

const capabilities = [
  ["Panel general", "Estado y prioridades de todas las cuentas en un solo lugar."],
  ["Clientes y negocios", "Organización separada para cada cliente y sus marcas."],
  ["Equipo y permisos", "Accesos preparados según la responsabilidad de cada integrante."],
  ["Reportes con tu marca", "Documentos listos para compartir bajo la identidad de la agencia."],
  ["Comparación entre cuentas", "Lectura conjunta para detectar riesgos y oportunidades."],
  ["Gestión centralizada", "Límites, seguimiento y operaciones desde un espacio común."],
];

export default function PartnerPage() {
  const { planTier, loading, error } = useDashboardData();
  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error} />;
  if (!hasEntitlement(planTier, "workspace.overview")) return <div className="page-container"><div className="page-eyebrow">Para agencias y consultores</div><h1 className="page-title" style={{ marginBottom: 10 }}>NUVRA Partner</h1><p className="page-subtitle" style={{ marginBottom: 28 }}>Un espacio preparado para administrar clientes, negocios y equipo sin mezclar información.</p><UpgradePanel feature="workspace.overview" /></div>;
  const plan = getPlanSnapshot(planTier);
  return <div className="page-container"><header className="page-header"><div><div className="page-eyebrow">Espacio de trabajo</div><h1 className="page-title">Panel Partner</h1><p className="page-subtitle">Visión general de clientes, cuentas y capacidad disponible.</p></div><StatusBadge tone="success">Plan Partner</StatusBadge></header><div className="metric-grid" style={{ marginBottom: 16 }}><Card><div className="page-eyebrow">Capacidad</div><h2 className="section-title">Hasta {plan.limits.clients} clientes</h2><p style={{ color: COLORS.inkSoft, fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>{plan.limits.businesses} negocios · {plan.limits.teamMembers} integrantes · {plan.limits.monthlyReports} reportes mensuales</p></Card><Card><div className="page-eyebrow">Estado</div><h2 className="section-title">Espacio preparado</h2><p style={{ color: COLORS.inkSoft, fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>La estructura de permisos y límites está lista. La autenticación real se conectará en una etapa posterior.</p></Card></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>{capabilities.map(([title, description]) => <Card key={title}><h2 className="section-title" style={{ fontSize: 16 }}>{title}</h2><p style={{ color: COLORS.inkSoft, fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>{description}</p></Card>)}</div></div>;
}
