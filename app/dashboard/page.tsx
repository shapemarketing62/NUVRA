"use client";

import type { CSSProperties } from "react";
import { useDashboardData } from "@/lib/use-dashboard-data";
import { Btn, Card, DemoBadge, EmptyState, ErrorState, PageHeader, PageSkeleton, ScoreRing, StatusBadge } from "@/components/ui";
import { getFriendlyDimensionName, simplifyTechnicalText } from "@/lib/simple-language-presenter";
import { AnalysisFreshnessNotice } from "@/components/dashboard/analysis-freshness-notice";

const sourceLabel = (status: string) => status === "analyzed" ? "Analizada" : status === "partial" ? "Parcial" : status === "requires_auth" ? "Requiere conexión" : status === "not_relevant" ? "No necesaria" : "Pendiente";
const sourceTone = (status: string) => status === "analyzed" ? "success" as const : status === "partial" ? "warning" as const : "neutral" as const;

export default function DashboardHomePage() {
  const data = useDashboardData();
  if (data.loading) return <PageSkeleton />;
  if (data.error) return <ErrorState message={data.error === "Sin negocio" ? "Primero necesitás registrar un negocio para ver su estado." : data.error} onRetry={() => { window.location.href = "/onboarding"; }} />;
  const { business, analysis, analysisFreshness, score, canonicalDiagnosis, actionsSummary, sources, isDemo } = data;
  const areas = score?.dimensions.filter((item) => item.applicable) || [];
  const action = actionsSummary.immediateAction;
  const priorityActions = [action, ...actionsSummary.inProgress, ...actionsSummary.pending]
    .filter((item): item is NonNullable<typeof action> => Boolean(item))
    .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 3);
  return <div className="page-container dashboard-v3">
    <PageHeader eyebrow="Resumen" title={business.nombre} subtitle={<>{isDemo && <DemoBadge style={{ marginRight: 8 }} />}{business.rubro}<span className="dashboard-objective">Objetivo: {business.objetivo || "Sin objetivo activo"}{business.plazoLabel ? ` · ${business.plazoLabel}` : ""}</span></>} action={<Btn size="sm" onClick={() => { window.location.href = "/dashboard/acciones"; }}>Ver plan de acción</Btn>} />
    <AnalysisFreshnessNotice freshness={analysisFreshness} businessId={business.id} />
    
    <section className="score-stage">
      <div className="dashboard-card-label">Nuvra Score</div>
      <div className="score-indicator">
        <ScoreRing value={score?.total ?? null} status={score?.total == null ? "PENDIENTE" : "COMPLETO"} />
        <div>
          <strong className="dashboard-score-reading" style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)" }}>
            {score?.total == null && areas.length === 0 ? "Todavía falta información para evaluar el negocio" : score?.total == null ? "Lectura en construcción" : score.total >= 70 ? "Base sólida" : score.total >= 50 ? "Base aprovechable" : "Hay fricciones importantes"}
          </strong>
          <p style={{ marginTop: "var(--space-3)", color: "var(--text-secondary)", fontSize: "15px", lineHeight: 1.5 }}>
            {score?.total == null && areas.length === 0 ? "No obtuvimos suficiente información pública todavía. Las fuentes revisadas y pendientes aparecen más abajo." : "El puntaje da contexto. La prioridad se define por tu objetivo y la información comprobada."}
          </p>
        </div>
      </div>
      <div className="score-stage-foot">Lectura actual · {areas.length} {areas.length === 1 ? "área evaluable" : "áreas evaluables"}</div>
    </section>
    
    <div className="dashboard-statusbar">
      <div style={{ display: "flex", gap: "var(--space-4)" }}>
        <strong style={{ color: "var(--text-primary)" }}>Último análisis</strong>
        <span style={{ color: "var(--text-secondary)" }}>
          {analysis.date ? new Date(analysis.date).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" }) : "Sin fecha"}
        </span>
      </div>
      <StatusBadge tone={analysis.status === "completed" ? "success" : analysis.status === "partial" ? "warning" : "neutral"}>
        {analysis.status === "completed" ? "Completo" : analysis.status === "partial" ? "Información parcial" : "Sin completar"}
      </StatusBadge>
    </div>
    
    <div className="dashboard-score-grid">
      <Card className="dashboard-areas-card">
        <div className="dashboard-card-label">Áreas evaluadas</div>
        {areas.length ? (
          <div style={{ marginTop: "var(--space-4)" }}>
            {areas.slice(0, 7).map((dimension) => (
              <div className="diagnostic-row" key={dimension.slug}>
                <span style={{ color: "var(--text-primary)", fontSize: "14px" }}>
                  {getFriendlyDimensionName(dimension.slug, dimension.name)}
                </span>
                <div className="diagnostic-track" style={{ "--value": dimension.points } as CSSProperties} />
                <strong style={{ color: "var(--text-primary)", fontSize: "15px", fontWeight: 600 }}>
                  {dimension.points}
                </strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="section-description">Sin áreas evaluables: las fuentes disponibles no alcanzaron para puntuar sin hacer suposiciones.</p>
        )}
        <p className="section-description" style={{ marginTop: "var(--space-4)" }}>
          Este resultado se calcula con la información disponible hasta el momento.
        </p>
      </Card>
      
      <Card className="dashboard-priority-card">
        <div className="dashboard-card-label">Lo más importante ahora</div>
        {canonicalDiagnosis.mainConclusion ? (
          <>
            <h2 style={{ fontSize: "20px", fontWeight: 600, lineHeight: 1.3, marginBottom: "var(--space-3)", color: "var(--text-primary)" }}>
              {simplifyTechnicalText(canonicalDiagnosis.mainConclusion.title)}
            </h2>
            <p style={{ fontSize: "15px", lineHeight: 1.5, color: "var(--text-secondary)" }}>
              {simplifyTechnicalText(canonicalDiagnosis.mainConclusion.explanation)}
            </p>
            <Btn variant="ghost" size="sm" onClick={() => { window.location.href = "/dashboard/diagnostico"; }} style={{ marginTop: "var(--space-4)" }}>
              Ver diagnóstico
            </Btn>
          </>
        ) : (
          <EmptyState title="Sin una conclusión principal" description="El próximo análisis definirá una prioridad con suficiente respaldo." />
        )}
      </Card>
    </div>
    
    <div className="dashboard-main-grid">
      <Card className="dashboard-opportunity-panel">
        <div className="dashboard-card-label">Oportunidades</div>
        <div className="dashboard-opportunities" style={{ marginTop: "var(--space-4)" }}>
          {canonicalDiagnosis.opportunities.slice(0, 3).map((item) => (
            <div key={item.text} style={{ display: "grid", gridTemplateColumns: "12px 1fr", gap: "var(--space-3)", padding: "var(--space-4) 0", borderTop: "1px solid var(--border)" }}>
              <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--accent)", marginTop: "8px" }} />
              <p style={{ fontSize: "14px", lineHeight: 1.5, color: "var(--text-secondary)" }}>
                {simplifyTechnicalText(item.text)}
              </p>
            </div>
          ))}
        </div>
        {!canonicalDiagnosis.opportunities.length && <p className="section-description">No hay oportunidades suficientes para mostrar.</p>}
      </Card>
      
      <Card className="dashboard-action-panel">
        <div className="dashboard-card-label">Qué hacer ahora</div>
        {priorityActions.length ? (
          <div className="dashboard-next-actions" style={{ marginTop: "var(--space-4)" }}>
            {priorityActions.map((item, index) => (
              <div className="dashboard-next-action" key={item.id} style={{ padding: "var(--space-4) 0", borderTop: "1px solid var(--border)" }}>
                <span style={{ display: "block", color: "var(--accent-dark)", fontSize: "12px", fontWeight: 600, marginBottom: "var(--space-2)", letterSpacing: "0.02em", textTransform: "uppercase" }}>
                  {index === 0 ? "Próxima acción" : `Prioridad ${item.order || index + 1}`}
                </span>
                <h2 style={{ fontSize: "18px", fontWeight: 600, lineHeight: 1.3, color: "var(--text-primary)" }}>
                  {simplifyTechnicalText(item.title)}
                </h2>
                {index === 0 && item.description && (
                  <p style={{ fontSize: "14px", lineHeight: 1.5, color: "var(--text-secondary)", marginTop: "var(--space-2)" }}>
                    {simplifyTechnicalText(item.description)}
                  </p>
                )}
                <div className="action-meta" style={{ marginTop: "var(--space-3)" }}>
                  <span>Impacto: {item.impact}</span>
                  <span>Esfuerzo: {item.difficulty}</span>
                  <span>Plazo: {item.estimatedTime}</span>
                </div>
              </div>
            ))}
            <Btn size="sm" onClick={() => { window.location.href = "/dashboard/acciones"; }} style={{ marginTop: "var(--space-4)" }}>
              Ver plan de acción
            </Btn>
          </div>
        ) : (
          <EmptyState title="Sin acción inmediata" description="Todavía no existe una acción respaldada para priorizar." />
        )}
      </Card>
    </div>
    
    <section className="dashboard-sources-panel">
      <div className="dashboard-card-label">Fuentes</div>
      {sources.slice(0, 7).map((source) => (
        <div className="source-row" key={source.key}>
          <span style={{ color: "var(--text-primary)", fontSize: "14px" }}>{source.label}</span>
          <StatusBadge tone={sourceTone(source.status)}>{sourceLabel(source.status)}</StatusBadge>
        </div>
      ))}
      {!sources.length && <p className="section-description">Las fuentes aparecerán con el próximo análisis.</p>}
    </section>
  </div>;
}
