"use client";
import { useDashboardData } from "@/lib/use-dashboard-data";
import { applyUsageLimit, hasEntitlement } from "@/lib/plans";
import { Card, EmptyState, ErrorState, PageSkeleton, StatusBadge, UpgradePanel } from "@/components/ui";
import { COLORS } from "@/lib/design-tokens";

export default function CompetenciaPage() {
  const { intelligence, planTier, loading, error } = useDashboardData();
  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error} />;
  if (!hasEntitlement(planTier, "analysis.competitors")) return <div className="page-container"><div className="page-eyebrow">Análisis avanzado</div><h1 className="page-title" style={{ marginBottom: 10 }}>Competencia</h1><p className="page-subtitle" style={{ marginBottom: 28 }}>Entendé quién compite por el mismo cliente y con qué nivel de evidencia.</p><UpgradePanel feature="analysis.competitors" /></div>;

  const all = intelligence?.competitorSummary?.competitors || [];
  const competitors = applyUsageLimit(all, planTier, "visibleCompetitors");
  return <div className="page-container"><header className="page-header"><div><div className="page-eyebrow">Mercado</div><h1 className="page-title">Competencia</h1><p className="page-subtitle">Solo mostramos empresas respaldadas por evidencia pública.</p></div><StatusBadge tone={all.length ? "success" : "neutral"}>{all.length} verificadas</StatusBadge></header>
    {competitors.length ? <div className="stack">{competitors.map((item) => <Card key={item.name}><div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start" }}><div><h2 className="section-title">{item.name}</h2><p style={{ color: COLORS.inkSoft, fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>{item.rationale || "La evidencia disponible confirma que participa del mismo mercado."}</p></div><StatusBadge tone={item.classification === "confirmed_competitor" ? "success" : item.classification === "uncertain" ? "warning" : "info"}>{item.competitorType === "direct" ? "Directa" : item.competitorType === "partial" ? "Parcial" : "Indirecta"}</StatusBadge></div><div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${COLORS.line}`, color: COLORS.inkSoft, fontSize: 12 }}><span>Identidad: {Math.round(item.entityMatchConfidence * 100)}%</span><span>Relevancia: {Math.round(item.competitorRelevanceScore * 100)}%</span><span>{item.officialWebsite ? "Sitio oficial verificado" : "Sitio oficial no verificado"}</span></div></Card>)}</div> : <EmptyState title="Sin competidores confirmados" description="La evidencia disponible no alcanza para mostrar empresas con confianza. NUVRA no completa esta lista por cantidad." />}
  </div>;
}
