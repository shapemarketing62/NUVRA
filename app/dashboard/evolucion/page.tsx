"use client";

import { useDashboardData } from "@/lib/use-dashboard-data";
import { COLORS } from "@/lib/design-tokens";
import { Btn, DemoBadge, EmptyState, ErrorState, PageHeader, PageSkeleton, SectionHeader, StatusBadge, UpgradePanel } from "@/components/ui";
import { hasEntitlement } from "@/lib/plans";
import type { EvolutionDirection } from "@/lib/evolution-view";
import { getFriendlyDimensionName } from "@/lib/simple-language-presenter";

const SOURCE_NAMES: Record<string, string> = {
  web: "Sitio web", search: "Búsqueda", instagram: "Instagram", reviews: "Reseñas",
  competitor: "Competencia", external_mentions: "Menciones externas", google_places: "Google Maps",
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

function directionLabel(direction: EvolutionDirection) {
  if (direction === "improved") return "Mejoró";
  if (direction === "declined") return "Bajó";
  if (direction === "unchanged") return "Se mantuvo";
  if (direction === "newly_evaluable") return "Ahora puede evaluarse";
  if (direction === "no_longer_evaluable") return "Sin información suficiente ahora";
  return "No comparable";
}

export default function EvolucionPage() {
  const { evolution, score, canonicalDiagnosis, actionsSummary, loading, error, isDemo, planTier, internalAccess } = useDashboardData();
  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error} />;
  if (!hasEntitlement(planTier, "history.trend", internalAccess)) return <div className="page-container"><PageHeader eyebrow="Evolución" title="Tu progreso en el tiempo" /><UpgradePanel feature="history.trend" /></div>;

  const current = evolution.currentAnalysis;
  const previous = evolution.previousComparableAnalysis;
  if (!current) return <div className="page-container"><PageHeader eyebrow="Evolución" title="Qué cambió con el tiempo" subtitle={isDemo ? <DemoBadge /> : undefined} /><EmptyState title="Todavía no hay un análisis para seguir" description="Cuando completes un análisis, esta pantalla conservará el punto de partida para futuras comparaciones." /></div>;

  return <div className="page-container evolution-v3">
    <PageHeader eyebrow="Evolución" title="Qué cambió desde el último análisis" subtitle={<>{isDemo && <DemoBadge style={{ marginRight: 8 }} />}Primero el cambio observado; después, las acciones y la información que ayudan a interpretarlo.</>} action={<Btn size="sm" onClick={() => { window.location.href = "/dashboard/acciones"; }}>Ver acciones actuales</Btn>} />

    <section style={{ paddingBottom: 32, borderBottom: "1px solid var(--n-border)", marginBottom: 36 }}>
      <SectionHeader title={evolution.hasComparison ? "Desde tu último análisis comparable" : "Tu punto de partida actual"} />
      {evolution.hasComparison && previous ? (
        <div className="split-grid">
          <div>
            <div className="page-eyebrow">Anterior · {formatDate(previous.date)}</div>
            <div className="shp-display" style={{ fontSize: 32, fontWeight: 600 }}>{previous.score ?? "—"}</div>
            {previous.status === "partial" && <p className="section-description">Análisis parcial</p>}
          </div>
          <div>
            <div className="page-eyebrow">Actual · {formatDate(current.date)}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <span className="shp-display" style={{ fontSize: 32, fontWeight: 600 }}>{current.score ?? "—"}</span>
              {evolution.globalDelta !== null && (
                <span style={{ fontSize: 14, color: "var(--n-text-secondary)" }}>
                  {evolution.globalDelta > 0 ? "+" : ""}{evolution.globalDelta} puntos
                </span>
              )}
            </div>
            <p className="section-description">
              {evolution.generalDirection === "improved" ? "El resultado observado subió." : 
               evolution.generalDirection === "declined" ? "El resultado observado bajó; revisá las notas antes de interpretarlo." : 
               evolution.generalDirection === "unchanged" ? "El resultado general se mantuvo." : 
               "No hay una comparación general suficientemente clara."}
            </p>
          </div>
        </div>
      ) : (
        <div>
          <div className="page-eyebrow">Análisis actual · {formatDate(current.date)}</div>
          <div className="shp-display" style={{ fontSize: 32, fontWeight: 600 }}>{current.score ?? "Sin puntaje general"}</div>
          <p className="section-description" style={{ marginTop: 12 }}>
            {evolution.history.length > 1 ? 
              "Los análisis anteriores usan otra metodología o no tienen información suficiente para compararlos directamente." : 
              "Con el próximo análisis compatible podremos mostrar qué cambió y relacionarlo con el trabajo realizado."}
          </p>
        </div>
      )}
      {evolution.interpretationNotes.length > 0 && (
        <div style={{ marginTop: 20, display: "grid", gap: 12 }}>
          {evolution.interpretationNotes.map((note) => (
            <p key={note} style={{ borderLeft: "2px solid var(--n-accent)", paddingLeft: 16, fontSize: 13, lineHeight: 1.5, color: "var(--n-text-secondary)" }}>
              {note}
            </p>
          ))}
        </div>
      )}
    </section>

    {!evolution.hasComparison && (
      <section style={{ marginBottom: 36 }}>
        <SectionHeader title="Este es tu punto de partida" description="Conservamos esta lectura para compararla con el próximo análisis compatible." />
        <div className="split-grid">
          <div>
            <h3 className="section-title">Prioridad inicial</h3>
            <p className="section-description">
              {canonicalDiagnosis.mainConclusion?.title || "La primera prioridad quedará definida cuando exista una conclusión con suficiente respaldo."}
            </p>
          </div>
          <div>
            <h3 className="section-title">Acciones que empiezan ahora</h3>
            {[...actionsSummary.inProgress, ...actionsSummary.pending].slice(0, 3).length ? (
              <div className="insight-list">
                {[...actionsSummary.inProgress, ...actionsSummary.pending].slice(0, 3).map((action) => (
                  <div className="insight" key={action.id}>
                    <p className="section-description">{action.title}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="section-description">Todavía no hay acciones activas para comparar.</p>
            )}
          </div>
        </div>
        {score?.dimensions.some((dimension) => dimension.applicable) && (
          <div style={{ marginTop: 28 }}>
            <h3 className="section-title">Áreas evaluadas hoy</h3>
            <div className="insight-list" style={{ marginTop: 12 }}>
              {score.dimensions.filter((dimension) => dimension.applicable).slice(0, 5).map((dimension) => (
                <div className="insight" key={dimension.slug}>
                  <div style={{ width: "100%", display: "flex", justifyContent: "space-between", gap: 16 }}>
                    <span className="section-description">{getFriendlyDimensionName(dimension.slug, dimension.name)}</span>
                    <strong>{dimension.points}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="section-description" style={{ marginTop: 20 }}>
          En el próximo análisis comparable revisaremos el puntaje, estas áreas, la prioridad y el avance de las acciones. No atribuiremos un cambio a una acción sin evidencia suficiente.
        </p>
      </section>
    )}

    {evolution.hasComparison && <>
      <section style={{ marginBottom: 42 }}>
        <SectionHeader title="Qué cambió por área" description="Solo comparamos valores evaluables con la misma metodología." />
        {evolution.dimensionChanges.length ? <div>{evolution.dimensionChanges.map((change) => <div className="diagnostic-row" key={change.slug} style={{ gridTemplateColumns: "minmax(150px,1fr) auto auto" }}><span style={{ fontSize: 13 }}>{getFriendlyDimensionName(change.slug, change.name)}</span><span style={{ fontSize: 12.5, color: COLORS.inkSoft }}>{change.previous ?? "—"} → {change.current ?? "—"}</span><strong style={{ fontSize: 12.5, minWidth: 150, textAlign: "right" }}>{directionLabel(change.direction)}{change.delta !== null && change.delta !== 0 ? ` (${change.delta > 0 ? "+" : ""}${change.delta})` : ""}</strong></div>)}</div> : <p className="section-description">No hay áreas comparables entre estos dos análisis.</p>}
      </section>

      <section className="section-rule" style={{ marginBottom: 42 }}>
        <SectionHeader title="Cambios en la lectura del negocio" />
        <div className="split-grid">
          <div><h3 className="section-title">Señales nuevas</h3><div className="insight-list">{[...evolution.diagnosisChanges.newStrengths, ...evolution.diagnosisChanges.newFrictions, ...evolution.diagnosisChanges.newOpportunities].length ? [...evolution.diagnosisChanges.newStrengths, ...evolution.diagnosisChanges.newFrictions, ...evolution.diagnosisChanges.newOpportunities].slice(0, 6).map((item) => <div className="insight" key={item}><p className="section-description">{item}</p></div>) : <p className="section-description">No aparecieron conclusiones nuevas suficientemente diferenciadas.</p>}</div></div>
          <div><h3 className="section-title">Señales que ya no aparecen</h3><div className="insight-list">{[...evolution.diagnosisChanges.noLongerObservedStrengths, ...evolution.diagnosisChanges.noLongerObservedFrictions, ...evolution.diagnosisChanges.noLongerObservedOpportunities].length ? [...evolution.diagnosisChanges.noLongerObservedStrengths, ...evolution.diagnosisChanges.noLongerObservedFrictions, ...evolution.diagnosisChanges.noLongerObservedOpportunities].slice(0, 6).map((item) => <div className="insight" key={item}><p className="section-description">{item}</p></div>) : <p className="section-description">Las conclusiones anteriores principales siguen presentes o no pueden compararse.</p>}</div></div>
        </div>
      </section>

      <section style={{ marginBottom: 42 }}>
        <SectionHeader title="Lo que hiciste entre ambos análisis" description={`${evolution.actionActivity.counts.completed} completadas · ${evolution.actionActivity.counts.inProgress} iniciadas · ${evolution.actionActivity.counts.pending} pendientes`} />
        {[...evolution.actionActivity.completed, ...evolution.actionActivity.started].length ? <div className="action-list">{[...evolution.actionActivity.completed, ...evolution.actionActivity.started].map((action) => <article className="action-item" key={`${action.id}-${action.eventDate}`}><div className="action-marker" aria-hidden="true" /><div><div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><h3 className="section-title">{action.title}</h3><StatusBadge tone={action.status === "completed" ? "success" : "info"}>{action.status === "completed" ? "Completada" : "Iniciada"}</StatusBadge></div>{action.eventDate && <p className="section-description">{formatDate(action.eventDate)}</p>}<p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>{action.relationText}</p>{action.relatedProblem && <p className="section-description" style={{ marginTop: 7 }}>Relacionada con: {action.relatedProblem}</p>}</div></article>)}</div> : <p className="section-description">No hay inicios o finalizaciones registradas dentro de este período.</p>}
      </section>

      <section className="section-rule" style={{ marginBottom: 42 }}>
        <SectionHeader title="Nueva información disponible" description="Cambios en las fuentes pueden modificar el diagnóstico aunque el negocio no haya cambiado en la misma medida." />
        {evolution.sourceChanges.length ? <div className="insight-list">{evolution.sourceChanges.map((change) => <div className="insight" key={change.source}><div><h3 style={{ fontSize: 14, fontWeight: 650 }}>{SOURCE_NAMES[change.source] || "Otra fuente"}</h3><p className="section-description">{change.kind === "new_source" ? "Ahora aporta información al análisis." : change.kind === "more_information" ? "Ahora pudo analizarse con mayor profundidad." : change.kind === "lost_access" ? "En el análisis actual no estuvo disponible con el mismo nivel de acceso." : "Cambió su estado entre ambos análisis."}</p></div></div>)}</div> : <p className="section-description">No hubo cambios relevantes en las fuentes analizadas.</p>}
      </section>

      <section className="strategic-callout" style={{ marginBottom: 42 }}>
        <div className="page-eyebrow">Prioridad principal</div>
        {evolution.priorityChange.status === "changed" ? <><p className="section-description">Antes: {evolution.priorityChange.previous}</p><h2 style={{ fontSize: 19, lineHeight: 1.4, marginTop: 10 }}>Ahora: {evolution.priorityChange.current}</h2>{evolution.priorityChange.explanation && <p className="section-description" style={{ marginTop: 10 }}>{evolution.priorityChange.explanation}</p>}</> : evolution.priorityChange.status === "same" ? <><h2 style={{ fontSize: 19, lineHeight: 1.4 }}>{evolution.priorityChange.current}</h2><p className="section-description" style={{ marginTop: 8 }}>La prioridad principal se mantiene.</p></> : <p className="section-description">No hay información suficiente para comparar la prioridad principal.</p>}
      </section>
    </>}

    <section className="section-rule">
      <SectionHeader title="Historial de análisis" />
      <div className="insight-list">{evolution.history.map((analysis) => <div className="insight" key={analysis.id}><div style={{ width: "100%", display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}><div><h3 style={{ fontSize: 14, fontWeight: 650 }}>{formatDate(analysis.date)}</h3><p className="section-description">{analysis.status === "partial" ? "Análisis parcial" : analysis.status === "completed" ? "Análisis completo" : "Información histórica limitada"}</p>{analysis.comparisonLabel && <p className="field-hint" style={{ marginTop: 6 }}>{analysis.comparisonLabel}</p>}</div><strong className="shp-display" style={{ fontSize: 23, fontWeight: 600 }}>{analysis.score ?? "—"}</strong></div></div>)}</div>
    </section>
  </div>;
}
