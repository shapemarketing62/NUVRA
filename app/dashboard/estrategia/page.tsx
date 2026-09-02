"use client";

import { useDashboardData } from "@/lib/use-dashboard-data";
import { Btn, DemoBadge, EmptyState, ErrorState, PageHeader, PageSkeleton } from "@/components/ui";
import { simplifyTechnicalText } from "@/lib/simple-language-presenter";
import { AnalysisFreshnessNotice } from "@/components/dashboard/analysis-freshness-notice";

export default function EstrategiaPage() {
  const { business, analysisFreshness, canonicalStrategy, canonicalDiagnosis, loading, error, isDemo } = useDashboardData();
  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error} />;
  if (!canonicalStrategy) return <EmptyState title="Todavía no hay estrategia" description="Completá el análisis para construir una dirección alrededor de tu objetivo." />;
  const decisionInsight = canonicalDiagnosis.decisionInsight;
  return <div className="page-container">
    <PageHeader eyebrow="Estrategia" title="La decisión que conviene tomar" subtitle={<>{isDemo && <DemoBadge style={{ marginRight: 8 }} />}Una dirección clara para avanzar hacia el objetivo sin dispersar recursos.</>} action={<Btn size="sm" onClick={() => { window.location.href = "/dashboard/acciones"; }}>Ver acciones</Btn>} />
    <AnalysisFreshnessNotice freshness={analysisFreshness} businessId={business.id} context="strategy" />
    
    <section className="strategy-objective">
      <div className="analysis-kicker">Objetivo</div>
      <p>{simplifyTechnicalText(canonicalStrategy.objective || business.objetivo || "Objetivo por definir")}</p>
    </section>
    
    <section className="analysis-module analysis-module-accent" style={{ marginBottom: 24 }}>
      <div className="analysis-kicker">Decisión</div>
      <h2>{simplifyTechnicalText(canonicalStrategy.direction || "Necesitamos una prueba adicional antes de elegir una dirección.")}</h2>
    </section>
    
    <div className="analysis-module-grid">
      <section className="analysis-module">
        <div className="analysis-kicker">Por qué esta decisión</div>
        <ul>
          {(decisionInsight?.whyThisDecision || [canonicalStrategy.rationale]).filter(Boolean).map((item) => <li key={item!}>{simplifyTechnicalText(item!)}</li>)}
        </ul>
        {canonicalStrategy.problemOfOrigin?.title && (
          <p className="strategy-origin">
            <strong>Problema de origen:</strong> {simplifyTechnicalText(canonicalStrategy.problemOfOrigin.title)}
          </p>
        )}
      </section>
      
      <section className="analysis-module">
        <div className="analysis-kicker">Qué no vamos a priorizar ahora</div>
        <ul>
          {canonicalStrategy.notPriority.length ? (
            canonicalStrategy.notPriority.map((item) => <li key={item}>{simplifyTechnicalText(item)}</li>)
          ) : (
            <li>No ampliaremos el plan hasta validar la primera intervención.</li>
          )}
        </ul>
      </section>
    </div>
    
    <div className="strategy-measures">
      <div>
        <div className="analysis-kicker">Indicador principal</div>
        <strong>{simplifyTechnicalText(canonicalStrategy.kpi || "Indicador por definir")}</strong>
      </div>
      <div>
        <div className="analysis-kicker">Horizonte</div>
        <strong>{canonicalStrategy.horizon || "Por definir"}</strong>
      </div>
      <div>
        <div className="analysis-kicker">Resultado buscado</div>
        <strong>{simplifyTechnicalText(canonicalStrategy.expectedResult || canonicalStrategy.objective || "Resultado por definir")}</strong>
      </div>
    </div>
  </div>;
}
