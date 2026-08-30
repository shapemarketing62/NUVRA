"use client";

import { useDashboardData } from "@/lib/use-dashboard-data";
import { COLORS } from "@/lib/design-tokens";
import { DemoBadge, EmptyState, ErrorState, PageHeader, PageSkeleton, SectionHeader } from "@/components/ui";
import { simplifyTechnicalText } from "@/lib/simple-language-presenter";
import { AnalysisFreshnessNotice } from "@/components/dashboard/analysis-freshness-notice";

export default function EstrategiaPage() {
  const { business, analysisFreshness, canonicalStrategy, loading, error, isDemo } = useDashboardData();
  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error} />;
  if (!canonicalStrategy) return <EmptyState title="Todavía no hay estrategia" description="Completá el análisis para construir una dirección alrededor de tu objetivo." />;

  return <div className="page-container">
    <PageHeader eyebrow="Dirección recomendada" title="Mi estrategia" subtitle={<>{isDemo && <DemoBadge style={{ marginRight: 8 }} />}El enfoque que conviene seguir a partir del diagnóstico.</>} />

    <AnalysisFreshnessNotice freshness={analysisFreshness} businessId={business.id} context="strategy" />

    <section style={{ paddingBottom: 34, borderBottom: `1px solid ${COLORS.line}`, marginBottom: 38 }}>
      <div className="page-eyebrow">Objetivo de este análisis</div>
      {canonicalStrategy.objective ? <h2 className="shp-display" style={{ fontSize: "clamp(24px,3vw,34px)", fontWeight: 650, letterSpacing: "-.035em", maxWidth: 760 }}>{canonicalStrategy.objective}</h2> : <p className="section-description">No hay un objetivo activo disponible.</p>}
    </section>

    <section style={{ maxWidth: 820, marginBottom: 38 }}>
      <SectionHeader title="El desafío principal" />
      {canonicalStrategy.problemOfOrigin ? <p style={{ fontSize: 15, lineHeight: 1.7 }}>{canonicalStrategy.problemOfOrigin.title}</p> : <p className="section-description">Todavía no existe una conclusión suficientemente firme para orientar la estrategia.</p>}
    </section>

    <section className="strategic-callout" style={{ marginBottom: 42 }}>
      <div className="page-eyebrow">Dirección estratégica</div>
      {canonicalStrategy.direction ? <h2 style={{ fontSize: 21, fontWeight: 650, lineHeight: 1.4 }}>{simplifyTechnicalText(canonicalStrategy.direction)}</h2> : <p className="section-description">Necesitamos más información antes de recomendar una dirección concreta.</p>}
    </section>

    <section style={{ maxWidth: 820, marginBottom: 42 }}>
      <SectionHeader title="Por qué esta dirección" />
      {canonicalStrategy.rationale ? <p style={{ fontSize: 14, lineHeight: 1.7 }}>{simplifyTechnicalText(canonicalStrategy.rationale)}</p> : <p className="section-description">La relación entre el diagnóstico y el objetivo todavía no está suficientemente documentada.</p>}
    </section>

    <div className="split-grid" style={{ marginBottom: 42 }}>
      <section><SectionHeader title="Resultado buscado" />{canonicalStrategy.expectedResult ? <p style={{ fontSize: 14, lineHeight: 1.7 }}>{simplifyTechnicalText(canonicalStrategy.expectedResult)}</p> : <p className="section-description">Todavía no hay un resultado definido.</p>}</section>
      <section><SectionHeader title="Cómo vamos a medirlo" />{canonicalStrategy.kpi ? <p style={{ fontSize: 14, lineHeight: 1.7 }}>{simplifyTechnicalText(canonicalStrategy.kpi)}</p> : <p className="section-description">La estrategia actual todavía no tiene un indicador persistido.</p>}</section>
    </div>

    <section className="section-rule">
      <SectionHeader title="Horizonte" />
      <p style={{ fontSize: 14, lineHeight: 1.7 }}>{canonicalStrategy.horizon || "No hay un plazo activo disponible."}</p>
    </section>
  </div>;
}
