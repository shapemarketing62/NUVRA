"use client";

import { Btn } from "@/components/ui";
import { COLORS } from "@/lib/design-tokens";
import type { AnalysisFreshnessView } from "@/lib/analysis-freshness";

export function AnalysisFreshnessNotice({ freshness, businessId, context = "general" }: {
  freshness: AnalysisFreshnessView;
  businessId?: string;
  context?: "general" | "diagnosis" | "strategy";
}) {
  if (!freshness.needsReanalysis) return null;
  const goalChanged = freshness.status === "stale_due_to_goal_change" || freshness.status === "stale_due_to_business_and_goal_change";
  const details = freshness.changedFields.length ? ` Cambios detectados: ${freshness.changedFields.join(", ")}.` : "";
  let title = "Este análisis necesita actualizarse";
  let message = `Cambiaste información importante después del último análisis.${details}`;
  if (goalChanged && context === "strategy") {
    title = "Esta estrategia corresponde al objetivo anterior";
    message = freshness.analyzedGoal
      ? `Fue creada para “${freshness.analyzedGoal}”. Tu objetivo actual es “${freshness.currentGoal || "otro objetivo"}”.`
      : "Cambiaste el objetivo después de crear esta estrategia.";
  } else if (goalChanged) {
    message = `El objetivo cambió después del último análisis.${details}`;
  }
  return <aside className="strategic-callout" style={{ marginBottom: 28, borderLeftColor: COLORS.blue }}>
    <h2 style={{ fontSize: 16, fontWeight: 650 }}>{title}</h2>
    <p className="section-description" style={{ marginTop: 6 }}>{message} Volvé a analizar para actualizar el diagnóstico y el plan.</p>
    {businessId && <Btn size="sm" onClick={() => { window.location.href = `/analyze?businessId=${encodeURIComponent(businessId)}`; }} style={{ marginTop: 14 }}>Volver a analizar</Btn>}
  </aside>;
}
