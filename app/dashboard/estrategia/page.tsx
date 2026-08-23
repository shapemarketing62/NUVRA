"use client";

import { useDashboardData } from "@/lib/use-dashboard-data";
import { COLORS } from "@/lib/design-tokens";
import { DemoBadge, ErrorState, PageSkeleton } from "@/components/ui";
import { simplifyTechnicalText, getFriendlyDimensionName } from "@/lib/simple-language-presenter";

export default function EstrategiaPage() {
  const { strategy, diagnosis, score, loading, error, isDemo } = useDashboardData();

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error} />;

  if (!strategy) {
    return (
      <div style={{ 
        background: COLORS.paperDim, 
        borderRadius: 16, 
        padding: 32, 
        textAlign: "center" 
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Sin estrategia</h3>
        <p style={{ color: COLORS.inkSoft }}>
          Completá el onboarding para generar una estrategia personalizada.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 className="shp-display" style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
          Mi estrategia
        </h1>
        <p style={{ color: COLORS.inkSoft, fontSize: 15 }}>
          {isDemo && <DemoBadge style={{ marginRight: 8 }} />}
          Plan personalizado basado en tu diagnóstico
        </p>
      </div>

      <div style={{ 
        background: "#fff", 
        borderRadius: 16, 
        padding: 24, 
        border: `1px solid ${COLORS.line}`,
        marginBottom: 24
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>El objetivo que estamos trabajando</h3>
        <div className="shp-display" style={{ fontSize: 24, fontWeight: 700, color: COLORS.blue, marginBottom: 12 }}>
          {strategy.objetivo}
        </div>
      </div>

      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", 
        gap: 20, 
        marginBottom: 24 
      }}>
        <div style={{ 
          background: "#fff", 
          borderRadius: 16, 
          padding: 24, 
          border: `1px solid ${COLORS.line}`
        }}>
          <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 8 }}>Situación actual</div>
          <div style={{ fontSize: 15, lineHeight: 1.6 }}>{simplifyTechnicalText(strategy.situacionActual)}</div>
        </div>

        <div style={{ 
          background: "#fff", 
          borderRadius: 16, 
          padding: 24, 
          border: `1px solid ${COLORS.line}`
        }}>
          <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 8 }}>Qué falta para llegar</div>
          <div style={{ fontSize: 15, lineHeight: 1.6 }}>{simplifyTechnicalText(strategy.distanciaObjetivo)}</div>
        </div>

        <div style={{ 
          background: "#fff", 
          borderRadius: 16, 
          padding: 24, 
          border: `1px solid ${COLORS.line}`
        }}>
          <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 8 }}>Problema principal</div>
          <div style={{ fontSize: 15, lineHeight: 1.6 }}>{simplifyTechnicalText(strategy.principalProblema)}</div>
        </div>
      </div>

      {strategy.prioridades && strategy.prioridades.length > 0 && (
        <div style={{ 
          background: "#fff", 
          borderRadius: 16, 
          padding: 24, 
          border: `1px solid ${COLORS.line}`,
          marginBottom: 24
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>En qué conviene concentrarse</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {strategy.prioridades.map((p, i) => (
              <div key={i} style={{ 
                display: "flex", 
                gap: 12, 
                padding: "12px", 
                background: COLORS.paperDim, 
                borderRadius: 8 
              }}>
                <div style={{ 
                  width: 24, 
                  height: 24, 
                  borderRadius: "50%", 
                  background: COLORS.blue, 
                  color: "#fff", 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center", 
                  fontSize: 12, 
                  fontWeight: 600 
                }}>
                  {i + 1}
                </div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{simplifyTechnicalText(p)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {diagnosis && diagnosis.bottleneck && (
        <div style={{ 
          background: COLORS.amberSoft, 
          borderRadius: 16, 
          padding: 24, 
          border: `1px solid ${COLORS.amber}`,
          marginBottom: 24
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: COLORS.amber }}>
            Enfoque principal
          </h3>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            Para alcanzar tu objetivo, priorizá resolver: <strong>{getFriendlyDimensionName(diagnosis.bottleneck.dimension, diagnosis.bottleneck.dimension)}</strong> — {simplifyTechnicalText(diagnosis.bottleneck.title)}
          </p>
        </div>
      )}

      {score && (
        <div style={{ 
          background: "#fff", 
          borderRadius: 16, 
          padding: 24, 
          border: `1px solid ${COLORS.line}`
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Estado general</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div className="shp-display" style={{ fontSize: 36, fontWeight: 700, color: COLORS.blue }}>
              {score.total}
            </div>
            <div>
              <div style={{ fontSize: 13, color: COLORS.inkSoft }}>Nuvra Score actual</div>
              <div style={{ fontSize: 12, color: COLORS.inkFaint }}>Calculado con la información disponible del negocio</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
