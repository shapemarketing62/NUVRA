"use client";

import { useDashboardData } from "@/lib/use-dashboard-data";
import { COLORS } from "@/lib/design-tokens";
import { Btn, DemoBadge, ErrorState, PageSkeleton, UpgradePanel } from "@/components/ui";
import { formatActionForBusiness, simplifyTechnicalText } from "@/lib/simple-language-presenter";
import { applyUsageLimit } from "@/lib/plans";
import { useState } from "react";

export default function AccionesPage() {
  const { actions, loading, error, isDemo, planTier, internalAccess } = useDashboardData();
  const [filter, setFilter] = useState<"all" | "pending" | "in_progress" | "completed">("all");

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error} />;

  if (!actions || actions.length === 0) {
    return (
      <div style={{ 
        background: COLORS.paperDim, 
        borderRadius: 16, 
        padding: 32, 
        textAlign: "center" 
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Sin acciones</h3>
        <p style={{ color: COLORS.inkSoft }}>
          Completá el onboarding para generar acciones recomendadas.
        </p>
      </div>
    );
  }

  const availableActions = applyUsageLimit(actions, planTier, "activeActions", internalAccess);
  const filteredActions = availableActions.filter((a) => {
    if (filter === "all") return true;
    if (filter === "pending") return !a.done;
    if (filter === "in_progress") return false; // TODO: implementar estado in_progress
    if (filter === "completed") return a.done;
    return true;
  });

  const completedCount = actions.filter((a) => a.done).length;
  const totalCount = actions.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 className="shp-display" style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
          Acciones Recomendadas
        </h1>
        <p style={{ color: COLORS.inkSoft, fontSize: 15 }}>
          {isDemo && <DemoBadge style={{ marginRight: 8 }} />}
          Plan de trabajo claro y en lenguaje sencillo para hacer crecer tu negocio
        </p>
      </div>

      <div style={{ 
        background: "#fff", 
        borderRadius: 16, 
        padding: 24, 
        border: `1px solid ${COLORS.line}`,
        marginBottom: 24
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Progreso general</h3>
          <div style={{ fontSize: 24, fontWeight: 700, color: COLORS.blue }}>
            {progress}%
          </div>
        </div>
        <div style={{ 
          width: "100%", 
          height: 8, 
          background: COLORS.paperDim, 
          borderRadius: 4, 
          overflow: "hidden" 
        }}>
          <div style={{ 
            width: `${progress}%`, 
            height: "100%", 
            background: COLORS.blue,
            transition: "width 0.3s ease"
          }} />
        </div>
        <div style={{ fontSize: 13, color: COLORS.inkSoft, marginTop: 8 }}>
          {completedCount} de {totalCount} acciones completadas
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[
            { id: "all", label: "Todas" },
            { id: "pending", label: "Pendientes" },
            { id: "in_progress", label: "En progreso" },
            { id: "completed", label: "Completadas" },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id as any)}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: `1px solid ${filter === f.id ? COLORS.blue : COLORS.line}`,
                background: filter === f.id ? COLORS.blueSoft : "#fff",
                fontSize: 13,
                fontWeight: 500,
                color: filter === f.id ? COLORS.blueDeep : COLORS.ink,
                cursor: "pointer",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {filteredActions
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map((rawAction) => {
            const formatted = formatActionForBusiness(rawAction);
            return (
              <div 
                key={formatted.id}
                style={{ 
                  padding: 24, 
                  border: `1px solid ${COLORS.line}`, 
                  borderRadius: 16,
                  background: formatted.done ? COLORS.oliveSoft : "#fff",
                  opacity: formatted.done ? 0.7 : 1,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                      <div style={{ 
                        width: 32, 
                        height: 32, 
                        borderRadius: "50%", 
                        background: formatted.done ? COLORS.olive : COLORS.blue, 
                        color: "#fff", 
                        display: "flex", 
                        alignItems: "center", 
                        justifyContent: "center", 
                        fontSize: 14, 
                        fontWeight: 600 
                      }}>
                        {formatted.order || "?"}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: COLORS.ink }}>
                        {formatted.whatToDo}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginLeft: 16 }}>
                    <span style={{ 
                      fontSize: 12, 
                      padding: "4px 10px", 
                      borderRadius: 6, 
                      background: COLORS.paperDim,
                      fontWeight: 600,
                      color: COLORS.ink
                    }}>
                      Impacto: {formatted.impact}
                    </span>
                  </div>
                </div>

                <div style={{ 
                  display: "grid", 
                  gap: 12, 
                  background: COLORS.paperDim, 
                  padding: 16, 
                  borderRadius: 12, 
                  marginBottom: 16 
                }}>
                  <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                    <strong style={{ color: COLORS.blueDeep }}>1. ¿Qué problema hay?:</strong>{" "}
                    <span style={{ color: COLORS.ink }}>{formatted.problem}</span>
                  </div>

                  <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                    <strong style={{ color: COLORS.blueDeep }}>2. ¿Por qué importa para tu negocio?:</strong>{" "}
                    <span style={{ color: COLORS.inkSoft }}>{formatted.importance}</span>
                  </div>

                  <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                    <strong style={{ color: COLORS.blueDeep }}>3. ¿Qué debería hacer el negocio?:</strong>{" "}
                    <span style={{ color: COLORS.ink }}>{formatted.whatToDo}</span>
                  </div>

                  <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                    <strong style={{ color: COLORS.olive }}>4. ¿Qué resultado podría mejorar?:</strong>{" "}
                    <span style={{ color: COLORS.ink }}>{formatted.expectedResult}</span>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 16, fontSize: 13, color: COLORS.inkFaint }}>
                    <span>Dificultad: <strong>{formatted.difficulty}</strong></span>
                    <span>Tiempo estimado: <strong>{formatted.estimatedTime}</strong></span>
                  </div>

                  <Btn 
                    size="sm" 
                    variant={formatted.done ? "subtle" : "primary"}
                    onClick={() => {
                      console.log("Toggle action:", formatted.id);
                    }}
                  >
                    {formatted.done ? "Completada" : "Marcar como completada"}
                  </Btn>
                </div>
              </div>
            );
          })}
      </div>

      {filteredActions.length === 0 && (
        <div style={{ 
          textAlign: "center", 
          padding: 40, 
          color: COLORS.inkSoft,
          fontSize: 14 
        }}>
          No hay acciones con el filtro seleccionado.
        </div>
      )}
      {actions.length > availableActions.length && <div style={{ marginTop: 20 }}><UpgradePanel feature="actions.extended" compact /></div>}
    </div>
  );
}
