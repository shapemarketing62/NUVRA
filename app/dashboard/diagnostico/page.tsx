"use client";

import { useDashboardData } from "@/lib/use-dashboard-data";
import { Btn, DemoBadge, EmptyState, ErrorState, PageHeader, PageSkeleton, StatusBadge } from "@/components/ui";
import { simplifyTechnicalText } from "@/lib/simple-language-presenter";
import { AnalysisFreshnessNotice } from "@/components/dashboard/analysis-freshness-notice";

export default function DiagnosticoPage() {
  const { business, analysisFreshness, diagnosis, canonicalDiagnosis, evidence, loading, error, isDemo } = useDashboardData();
  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error} />;
  if (!diagnosis) return <EmptyState title="Todavía no hay diagnóstico" description="Completá el análisis para obtener una lectura del negocio." />;
  const decisionInsight = canonicalDiagnosis.decisionInsight;
  const observations = evidence.filter((item) => item.relatedConclusion).slice(0, 5);
  const evidenceOrigin = (sourceType: string, informationState: "sufficient" | "limited" | "unknown") => {
    if (sourceType === "Información aportada") return "Nos lo contaste";
    if (informationState === "unknown") return "Lo estamos validando";
    return "Lo observamos";
  };
  return <div className="page-container">
    <PageHeader eyebrow="Diagnóstico" title="Qué está frenando el objetivo" subtitle={<>{isDemo && <DemoBadge style={{ marginRight: 8 }} />}La causa más probable, el sustento disponible y lo que todavía falta comprobar.</>} action={<Btn size="sm" onClick={() => { window.location.href = "/dashboard/estrategia"; }}>Ver estrategia</Btn>} />
    <AnalysisFreshnessNotice freshness={analysisFreshness} businessId={business.id} context="diagnosis" />
    
    <div className="analysis-module-grid">
      <section className="analysis-module analysis-module-primary">
        <div className="analysis-kicker">Problema principal</div>
        <h2>{simplifyTechnicalText(canonicalDiagnosis.mainConclusion?.title || diagnosis.bottleneck?.title || "Sin una causa principal")}</h2>
        <p style={{ marginTop: 12 }}>{simplifyTechnicalText(canonicalDiagnosis.mainConclusion?.relationshipToGoal || diagnosis.bottleneck?.explanation || "")}</p>
      </section>
      
      <section className="analysis-module analysis-module-accent">
        <div className="analysis-kicker">Hipótesis principal</div>
        <h2>{simplifyTechnicalText(decisionInsight?.hypothesis || canonicalDiagnosis.mainConclusion?.explanation || "Necesitamos validar dónde se frena el recorrido comercial.")}</h2>
        <div className="analysis-tags">
          <StatusBadge tone="warning">Lo estamos validando</StatusBadge>
        </div>
      </section>
    </div>
    
    <section className="analysis-module analysis-module-wide">
      <div className="analysis-kicker">Por qué creemos que pasa</div>
      <ul>
        {(decisionInsight?.whyThisDecision || []).map((item) => <li key={item}>{simplifyTechnicalText(item)}</li>)}
      </ul>
      {!decisionInsight?.whyThisDecision.length && <p>La información actual permite orientar una prueba, pero no afirmar una causa única.</p>}
      
      {canonicalDiagnosis.frictions.length > 0 && (
        <details className="analysis-secondary-details">
          <summary>Qué observamos además</summary>
          <div className="analysis-facts">
            {canonicalDiagnosis.frictions.slice(0, 3).map((item) => (
              <div className="analysis-fact" key={item.title}>
                <strong>{simplifyTechnicalText(item.title)}</strong>
                <p>{simplifyTechnicalText(item.evidence)}</p>
              </div>
            ))}
          </div>
        </details>
      )}
      
      {canonicalDiagnosis.opportunities.length > 0 && (
        <details className="analysis-secondary-details">
          <summary>Qué significa y qué oportunidad abre</summary>
          <ul>
            {canonicalDiagnosis.opportunities.slice(0, 3).map((item) => <li key={item.text}>{simplifyTechnicalText(item.text)}</li>)}
          </ul>
        </details>
      )}
    </section>
    
    <div className="analysis-module-grid">
      <section className="analysis-module">
        <div className="analysis-kicker">Evidencia</div>
        <details>
          <summary>Ver evidencia ({Math.max(observations.length, decisionInsight?.evidenceFor.length || 0)})</summary>
          <div className="analysis-facts" style={{ marginTop: 16 }}>
            {observations.length ? (
              observations.map((item, index) => (
                <div className="analysis-fact" key={`${item.source}-${index}`}>
                  <StatusBadge tone={item.sourceType === "Información aportada" ? "neutral" : item.informationState === "unknown" ? "warning" : "info"}>
                    {evidenceOrigin(item.sourceType, item.informationState)}
                  </StatusBadge>
                  <p>{simplifyTechnicalText(item.observation)}</p>
                  <div className="field-hint">
                    {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.source}</a> : item.source}
                    {item.date ? ` · ${new Date(item.date).toLocaleDateString("es-AR")}` : ""}
                  </div>
                </div>
              ))
            ) : (
              (decisionInsight?.evidenceFor || []).map((item) => (
                <div className="analysis-fact" key={item}>
                  <StatusBadge tone="warning">Lo estamos validando</StatusBadge>
                  <p>{simplifyTechnicalText(item)}</p>
                </div>
              ))
            )}
          </div>
        </details>
      </section>
      
      <section className="analysis-module">
        <div className="analysis-kicker">Qué necesitamos validar</div>
        <ul>
          {(decisionInsight?.unknowns || canonicalDiagnosis.unknowns).slice(0, 4).map((item) => <li key={item}>{simplifyTechnicalText(item)}</li>)}
        </ul>
      </section>
    </div>
    
    <section className="analysis-module analysis-module-wide">
      <div className="analysis-kicker">Qué está funcionando</div>
      <div className="analysis-facts">
        {canonicalDiagnosis.strengths.slice(0, 3).map((item) => (
          <div className="analysis-fact" key={item.title}>
            <strong>{simplifyTechnicalText(item.title)}</strong>
            <p>{simplifyTechnicalText(item.evidence)}</p>
          </div>
        ))}
      </div>
      {!canonicalDiagnosis.strengths.length && <p>No encontramos todavía una fortaleza suficientemente comprobada.</p>}
    </section>
  </div>;
}
