"use client";

import type { CSSProperties } from "react";
import { useDashboardData } from "@/lib/use-dashboard-data";
import { COLORS } from "@/lib/design-tokens";
import { Btn, DemoBadge, EmptyState, ErrorState, PageHeader, PageSkeleton, ScoreRing, SectionHeader, StatusBadge } from "@/components/ui";
import { getFriendlyDimensionName } from "@/lib/simple-language-presenter";
import { AnalysisFreshnessNotice } from "@/components/dashboard/analysis-freshness-notice";

function analysisLabel(status: ReturnType<typeof useDashboardData>["analysis"]["status"]) {
  if (status === "completed") return { tone: "success" as const, text: "Completado" };
  if (status === "partial") return { tone: "warning" as const, text: "Completado con información parcial" };
  if (status === "running") return { tone: "info" as const, text: "En proceso" };
  if (status === "pending") return { tone: "neutral" as const, text: "Pendiente" };
  if (status === "failed") return { tone: "danger" as const, text: "No se pudo completar" };
  return { tone: "neutral" as const, text: "Sin análisis reciente" };
}

export default function DashboardHomePage() {
  const { business, analysis, analysisFreshness, score, canonicalDiagnosis, actionsSummary, evolutionSummary, loading, error, isDemo } = useDashboardData();
  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error === "Sin negocio" ? "Primero necesitás registrar un negocio para ver su estado." : error} onRetry={() => { window.location.href = "/onboarding"; }} />;

  const analysisState = analysisLabel(analysis.status);
  const keyAreas = score?.dimensions.filter((dimension) => dimension.applicable).slice(0, 4) || [];
  const nextAction = actionsSummary.immediateAction;

  return <div className="page-container">
    <PageHeader
      eyebrow="Estado del negocio"
      title={business.nombre}
      subtitle={<>{isDemo && <DemoBadge style={{ marginRight: 8 }} />}<span>{business.rubro}</span>{business.objetivo && <span style={{ display: "block", marginTop: 3 }}>Objetivo actual: {business.objetivo}{business.plazoLabel ? ` · ${business.plazoLabel}` : ""}</span>}</>}
      action={<Btn variant="ghost" size="sm" onClick={() => { window.location.href = "/dashboard/acciones"; }}>Ver acciones</Btn>}
    />

    <AnalysisFreshnessNotice freshness={analysisFreshness} businessId={business.id} />

    <section style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, paddingBottom: 24, borderBottom: `1px solid ${COLORS.line}`, marginBottom: 38, flexWrap: "wrap" }}>
      <div>
        <div className="page-eyebrow">Último análisis</div>
        <div style={{ fontSize: 13, color: COLORS.inkSoft, marginTop: 5 }}>{analysis.date ? new Date(analysis.date).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" }) : "Todavía no hay una fecha disponible"}</div>
      </div>
      <StatusBadge tone={analysisState.tone}>{analysisState.text}</StatusBadge>
      {analysis.hasPartialSources && <p className="section-description" style={{ flexBasis: "100%" }}>Algunas fuentes no estuvieron disponibles o necesitan autorización. El análisis conserva la información que sí pudo comprobar.</p>}
    </section>

    <section style={{ marginBottom: 42, maxWidth: 720 }}>
      <div className="score-indicator">
        <ScoreRing value={score?.total ?? null} status={score?.total == null ? "PENDIENTE" : "COMPLETO"} />
        <div><h2 className="section-title">Nuvra Score</h2><p className="section-description">Una lectura general basada únicamente en la información disponible.</p></div>
      </div>
    </section>

    <section style={{ marginBottom: 42 }}>
      <SectionHeader title="Lo más importante que encontramos" description="La conclusión principal del análisis actual." />
      {canonicalDiagnosis.mainConclusion ? <div className="strategic-callout"><h2 style={{ fontSize: 19, lineHeight: 1.35, fontWeight: 650 }}>{canonicalDiagnosis.mainConclusion.title}</h2><p style={{ fontSize: 14, lineHeight: 1.65, color: COLORS.inkSoft, marginTop: 9 }}>{canonicalDiagnosis.mainConclusion.explanation}</p><Btn variant="ghost" size="sm" onClick={() => { window.location.href = "/dashboard/diagnostico"; }} style={{ marginTop: 16 }}>Ver diagnóstico</Btn></div> : <EmptyState title="Sin una conclusión principal" description="Necesitamos más información antes de sostener una conclusión concreta." />}
    </section>

    <section style={{ marginBottom: 42 }}>
      <SectionHeader title="Próxima acción" description="El siguiente paso priorizado en el plan actual." />
      {nextAction ? <article className="action-item"><div className="action-marker" aria-hidden="true" /><div><h2 className="shp-display" style={{ fontSize: 20, fontWeight: 500 }}>{nextAction.title}</h2>{nextAction.description && <p className="section-description">{nextAction.description}</p>}<div className="action-meta"><span>Impacto: {nextAction.impact}</span><span>Plazo: {nextAction.estimatedTime}</span></div><Btn variant="ghost" size="sm" onClick={() => { window.location.href = "/dashboard/acciones"; }} style={{ marginTop: 14 }}>Ver todas las acciones</Btn></div></article> : <EmptyState title="Sin una acción inmediata" description="Todavía no existe una acción sustentada para priorizar." />}
    </section>

    <section style={{ marginBottom: 42 }}>
      <SectionHeader title="Áreas evaluadas" description="Una lectura breve de las áreas que pudieron analizarse con información defendible." />
      {keyAreas.length ? <div>{keyAreas.map((dimension) => <div className="diagnostic-row" key={dimension.slug}><span style={{ fontSize: 12.5 }}>{getFriendlyDimensionName(dimension.slug, dimension.name)}</span><div className="diagnostic-track" style={{ "--value": dimension.points } as CSSProperties} /><strong style={{ fontSize: 12, textAlign: "right" }}>{dimension.points}</strong></div>)}</div> : <EmptyState title="Sin áreas evaluables" description="El análisis conserva lo encontrado, pero todavía no hay un puntaje defendible por área." />}
    </section>

    {evolutionSummary.hasComparableAnalysis && <section className="section-rule" style={{ marginBottom: 38 }}><SectionHeader title="Desde el análisis anterior" /><div style={{ display: "flex", alignItems: "baseline", gap: 12 }}><strong className="shp-display" style={{ fontSize: 30, fontWeight: 600 }}>{evolutionSummary.change !== null && evolutionSummary.change > 0 ? "+" : ""}{evolutionSummary.change}</strong><span className="section-description">puntos con la misma metodología</span></div></section>}

    <nav aria-label="Continuar con el análisis" style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      <Btn variant="ghost" size="sm" onClick={() => { window.location.href = "/dashboard/diagnostico"; }}>Ver diagnóstico</Btn>
      <Btn variant="ghost" size="sm" onClick={() => { window.location.href = "/dashboard/estrategia"; }}>Ver estrategia</Btn>
      <Btn variant="primary" size="sm" onClick={() => { window.location.href = "/dashboard/acciones"; }}>Ver acciones</Btn>
    </nav>
  </div>;
}
