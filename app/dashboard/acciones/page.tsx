"use client";

import { useEffect, useState } from "react";
import { useDashboardData } from "@/lib/use-dashboard-data";
import { COLORS } from "@/lib/design-tokens";
import { Btn, DemoBadge, EmptyState, ErrorState, PageHeader, PageSkeleton, StatusBadge, UpgradePanel } from "@/components/ui";
import { applyUsageLimit } from "@/lib/plans";
import { simplifyTechnicalText } from "@/lib/simple-language-presenter";
import { actionProgress, type ActionStatus } from "@/lib/action-execution";
import { getApiErrorMessage } from "@/lib/api-client";
import type { DashboardActionView } from "@/lib/dashboard-view-model";

const STATUS_LABELS: Record<ActionStatus, string> = { pending: "Pendiente", in_progress: "En curso", completed: "Completada" };
const STATUS_TONES = { pending: "neutral", in_progress: "info", completed: "success" } as const;

export default function AccionesPage() {
  const { actions, canonicalStrategy, loading, error, isDemo, planTier, internalAccess } = useDashboardData();
  const [filter, setFilter] = useState<"all" | ActionStatus>("all");
  const [localActions, setLocalActions] = useState<DashboardActionView[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  useEffect(() => setLocalActions(actions), [actions]);
  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error} />;
  if (!actions.length) return <EmptyState title="Todavía no hay acciones" description="El análisis aún no produjo acciones suficientemente sustentadas para mostrar." />;

  const availableActions = applyUsageLimit(localActions.length ? localActions : actions, planTier, "activeActions", internalAccess);
  const filtered = availableActions.filter((action) => filter === "all" || action.state === filter);
  const progress = actionProgress(availableActions);

  async function changeStatus(action: DashboardActionView, status: ActionStatus) {
    if (!action.canUpdateStatus || updatingId) return;
    setUpdatingId(action.id);
    setUpdateError(null);
    try {
      const response = await fetch(`/api/actions/${encodeURIComponent(action.id)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(getApiErrorMessage(data, "No pudimos actualizar la acción."));
      setLocalActions((current) => current.map((item) => item.id === action.id ? {
        ...item,
        status: data.action.status,
        state: data.action.status,
        done: data.action.done,
        startedAt: data.action.startedAt,
        completedAt: data.action.completedAt,
        updatedAt: data.action.updatedAt,
      } : item));
    } catch (statusError) {
      setUpdateError(statusError instanceof Error ? statusError.message : "No pudimos actualizar la acción.");
    } finally {
      setUpdatingId(null);
    }
  }

  return <div className="page-container">
    <PageHeader eyebrow="Plan de trabajo" title="Acciones" subtitle={<>{isDemo && <DemoBadge style={{ marginRight: 8 }} />}Qué hacer concretamente, en el orden recomendado por el análisis.</>} />

    <section className="dashboard-action-progress" style={{ borderBottom: `1px solid ${COLORS.line}` }}>
      <div><div className="page-eyebrow">Progreso de este plan</div><div className="shp-display" style={{ fontSize: 36, fontWeight: 650, letterSpacing: "-.04em" }}>{progress.percentage}%</div><p className="section-description">{progress.completed} de {progress.total} acciones visibles completadas</p></div>
      <div><div className="diagnostic-track" style={{ "--value": progress.percentage } as React.CSSProperties} /></div>
    </section>

    {updateError && <div role="alert" style={{ borderLeft: `2px solid ${COLORS.red}`, padding: "10px 14px", marginTop: 20, color: COLORS.inkSoft, fontSize: 13 }}>{updateError}</div>}

    <div style={{ display: "flex", gap: 7, margin: "26px 0 10px", flexWrap: "wrap" }}>
      {[{ id: "all", label: "Todas" }, { id: "pending", label: "Pendientes" }, { id: "in_progress", label: "En curso" }, { id: "completed", label: "Completadas" }].map((item) => <button className={`btn btn-sm ${filter === item.id ? "btn-subtle" : "btn-ghost"}`} key={item.id} onClick={() => setFilter(item.id as typeof filter)}>{item.label}</button>)}
    </div>

    <div className="action-list">
      {[...filtered].sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)).map((action, index) => <article className="action-item" key={action.id} style={{ opacity: action.done ? .72 : 1 }}>
        <div className="action-marker" aria-hidden="true" />
        <div>
          <div className="action-rank">Prioridad {action.order ?? index + 1}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}><h2 className="shp-display" style={{ fontSize: 20, fontWeight: 500, lineHeight: 1.25 }}>{simplifyTechnicalText(action.title)}</h2><StatusBadge tone={STATUS_TONES[action.state]}>{STATUS_LABELS[action.state]}</StatusBadge></div>
          {action.description && <p style={{ fontSize: 14, lineHeight: 1.65, color: COLORS.inkSoft, marginTop: 8 }}>{simplifyTechnicalText(action.description)}</p>}

          <div className="action-meta">
            <span>Impacto: {action.impact}</span>
            <span>Dificultad: {action.difficulty}</span>
            <span>Plazo: {action.estimatedTime}</span>
            {action.dimension && <span>Área relacionada: {simplifyTechnicalText(action.dimension)}</span>}
          </div>

          {(action.details?.expectedResult || action.indicatorToImprove) && <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 15 }}><strong>Resultado buscado: </strong>{simplifyTechnicalText(action.details?.expectedResult || action.indicatorToImprove)}</p>}
          {action.startedAt && <p className="section-description">Iniciada el {new Date(action.startedAt).toLocaleDateString("es-AR")}</p>}
          {action.completedAt && <p className="section-description">Completada el {new Date(action.completedAt).toLocaleDateString("es-AR")}</p>}

          {(action.details?.steps.length || action.evidence || action.inference) && <details style={{ marginTop: 15 }}><summary style={{ fontSize: 12.5, color: COLORS.inkSoft, cursor: "pointer" }}>Ver plan de ejecución</summary><div style={{ padding: "12px 0 0", display: "grid", gap: 9, fontSize: 12.5, lineHeight: 1.55 }}>{action.details?.where && <p><strong>Dónde hacerlo: </strong>{simplifyTechnicalText(action.details.where)}</p>}{action.details?.audience && <p><strong>Para quién: </strong>{simplifyTechnicalText(action.details.audience)}</p>}{action.relatedConclusion && <p><strong>Qué estamos intentando resolver: </strong>{simplifyTechnicalText(action.relatedConclusion)}</p>}{canonicalStrategy?.direction && <p><strong>Dirección del plan: </strong>{simplifyTechnicalText(canonicalStrategy.direction)}</p>}{action.rationale && <p><strong>Por qué recomendamos esta acción: </strong>{simplifyTechnicalText(action.rationale)}</p>}{action.details?.steps.length ? <ol style={{ paddingLeft: 20, display: "grid", gap: 6 }}>{action.details.steps.map((step) => <li key={step}>{simplifyTechnicalText(step)}</li>)}</ol> : null}{(action.details?.metric || action.indicatorToImprove) && <p><strong>Cómo medirla: </strong>{simplifyTechnicalText(action.details?.metric || action.indicatorToImprove)}</p>}{action.details?.estimatedCost && <p><strong>Costo estimado: </strong>{simplifyTechnicalText(action.details.estimatedCost)}</p>}{action.dependencies?.length ? <p><strong>Antes de empezar: </strong>{action.dependencies.map(simplifyTechnicalText).join(" · ")}</p> : null}{action.evidence && <p><strong>Qué observamos: </strong>{simplifyTechnicalText(action.evidence)}</p>}{action.inference && <p style={{ color: COLORS.inkSoft }}><strong>Qué significa: </strong>{simplifyTechnicalText(action.inference)}</p>}</div></details>}

          {action.canUpdateStatus && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 17 }}>
            {action.state === "pending" && <><Btn size="sm" variant="primary" disabled={updatingId === action.id} onClick={() => changeStatus(action, "in_progress")}>{updatingId === action.id ? "Guardando…" : "Empezar"}</Btn><Btn size="sm" variant="ghost" disabled={updatingId === action.id} onClick={() => changeStatus(action, "completed")}>Marcar como completada</Btn></>}
            {action.state === "in_progress" && <><Btn size="sm" variant="primary" disabled={updatingId === action.id} onClick={() => changeStatus(action, "completed")}>{updatingId === action.id ? "Guardando…" : "Marcar como completada"}</Btn><Btn size="sm" variant="ghost" disabled={updatingId === action.id} onClick={() => changeStatus(action, "pending")}>Volver a pendiente</Btn></>}
            {action.state === "completed" && <Btn size="sm" variant="ghost" disabled={updatingId === action.id} onClick={() => changeStatus(action, "in_progress")}>{updatingId === action.id ? "Guardando…" : "Reabrir"}</Btn>}
          </div>}
        </div>
      </article>)}
    </div>

    {!filtered.length && <EmptyState title="No hay acciones en esta vista" description="Probá con otro filtro para consultar el resto del plan." />}
    {actions.length > availableActions.length && <div style={{ marginTop: 24 }}><UpgradePanel feature="actions.extended" compact /></div>}
  </div>;
}
