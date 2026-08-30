"use client";

import { useDashboardData } from "@/lib/use-dashboard-data";
import { COLORS } from "@/lib/design-tokens";
import { DemoBadge, EmptyState, ErrorState, PageHeader, PageSkeleton, SectionHeader } from "@/components/ui";
import { simplifyTechnicalText } from "@/lib/simple-language-presenter";
import { AnalysisFreshnessNotice } from "@/components/dashboard/analysis-freshness-notice";

export default function DiagnosticoPage() {
  const { business, analysisFreshness, diagnosis, canonicalDiagnosis, evidence, loading, error, isDemo } = useDashboardData();
  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error} />;
  if (!diagnosis) return <EmptyState title="Todavía no hay diagnóstico" description="Completá el análisis para obtener una lectura del negocio." />;

  const relatedEvidence = evidence.filter((item) => item.relatedConclusion).slice(0, 6);
  const observations = relatedEvidence.length ? relatedEvidence : evidence.slice(0, 6);

  return <div className="page-container">
    <PageHeader eyebrow="Lectura del negocio" title="Diagnóstico" subtitle={<>{isDemo && <DemoBadge style={{ marginRight: 8 }} />}Qué encontramos y qué significa para el negocio.</>} />

    <AnalysisFreshnessNotice freshness={analysisFreshness} businessId={business.id} context="diagnosis" />

    <section style={{ maxWidth: 820, marginBottom: 40 }}>
      <SectionHeader title="Lectura general" />
      <p style={{ fontSize: 16, lineHeight: 1.75 }}>{simplifyTechnicalText(diagnosis.summary)}</p>
    </section>

    <section className="section-rule" style={{ marginBottom: 42 }}>
      <SectionHeader title="Qué observamos" description="Señales concretas encontradas en las fuentes disponibles." />
      {observations.length ? <details><summary style={{ fontSize: 13, color: COLORS.inkSoft, cursor: "pointer", marginBottom: 14 }}>Ver evidencia ({observations.length})</summary><div className="insight-list">{observations.map((item, index) => <div className="insight" key={`${item.source}-${index}`}><div><p style={{ fontSize: 14, lineHeight: 1.6 }}>{item.observation}</p><div className="field-hint" style={{ marginTop: 7 }}>Fuente: {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.source}</a> : item.source}{item.date ? ` · ${new Date(item.date).toLocaleDateString("es-AR")}` : ""}</div></div></div>)}</div></details> : <EmptyState title="Sin observaciones públicas disponibles" description="El diagnóstico existe, pero este análisis anterior no conservó evidencia pública para mostrar." />}
    </section>

    <section style={{ marginBottom: 42 }}>
      <SectionHeader title="Qué significa" />
      {canonicalDiagnosis.mainConclusion ? <div style={{ maxWidth: 820 }}><p style={{ fontSize: 15, lineHeight: 1.7 }}>{canonicalDiagnosis.mainConclusion.explanation}</p>{canonicalDiagnosis.mainConclusion.relationshipToGoal && <p className="section-description" style={{ marginTop: 10 }}>{canonicalDiagnosis.mainConclusion.relationshipToGoal}</p>}</div> : <p className="section-description">La información disponible todavía no permite explicar un problema principal con suficiente sustento.</p>}
    </section>

    <section className="strategic-callout" style={{ marginBottom: 42 }}>
      <div className="page-eyebrow">Conclusión principal</div>
      {canonicalDiagnosis.mainConclusion ? <h2 style={{ fontSize: 20, fontWeight: 650, lineHeight: 1.35 }}>{canonicalDiagnosis.mainConclusion.title}</h2> : <p className="section-description">Necesitamos más información antes de sostener una conclusión concreta.</p>}
    </section>

    <div className="split-grid" style={{ marginBottom: 42 }}>
      <section><SectionHeader title="Fortalezas" /><div className="insight-list">{canonicalDiagnosis.strengths.length ? canonicalDiagnosis.strengths.map((item, index) => <div className="insight" key={index}><div><h3 style={{ fontSize: 14, fontWeight: 650 }}>{simplifyTechnicalText(item.title)}</h3>{item.evidence && <p className="section-description">{simplifyTechnicalText(item.evidence)}</p>}</div></div>) : <p className="section-description">Todavía no hay fortalezas con evidencia suficiente para mostrar.</p>}</div></section>
      <section><SectionHeader title="Fricciones y problemas" /><div className="insight-list">{canonicalDiagnosis.frictions.length ? canonicalDiagnosis.frictions.map((item, index) => <div className="insight" key={index}><div><h3 style={{ fontSize: 14, fontWeight: 650 }}>{simplifyTechnicalText(item.title)}</h3>{item.evidence && <p className="section-description">{simplifyTechnicalText(item.evidence)}</p>}</div></div>) : <p className="section-description">No hay otras fricciones sustentadas para mostrar.</p>}</div></section>
    </div>

    {canonicalDiagnosis.opportunities.length ? <section className="section-rule" style={{ marginBottom: 42 }}><SectionHeader title="Oportunidades" description="Posibilidades que surgen directamente de lo observado." /><div className="insight-list">{canonicalDiagnosis.opportunities.map((item, index) => <div className="insight" key={index}><p style={{ fontSize: 14, lineHeight: 1.6 }}>{item.text}</p></div>)}</div></section> : null}

    <section className="section-rule">
      <SectionHeader title="Lo que todavía no podemos afirmar" />
      {canonicalDiagnosis.unknowns.length ? <div className="insight-list">{canonicalDiagnosis.unknowns.map((item, index) => <div className="insight" key={index}><p style={{ fontSize: 13, lineHeight: 1.6 }}>{item}</p></div>)}</div> : <p className="section-description">No hay faltantes relevantes registrados para este análisis.</p>}
    </section>
  </div>;
}
