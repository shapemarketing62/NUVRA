"use client";

import { useDashboardData } from "@/lib/use-dashboard-data";
import { COLORS } from "@/lib/design-tokens";
import { DemoBadge, ProBadge, ErrorState, PageSkeleton, UpgradePanel } from "@/components/ui";
import { hasEntitlement } from "@/lib/plans";

export default function EvolucionPage() {
  const { history, score, loading, error, isDemo, planTier, internalAccess } = useDashboardData();

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error} />;
  if (!hasEntitlement(planTier, "history.trend", internalAccess)) return <div className="page-container"><div className="page-eyebrow">Evolución</div><h1 className="page-title" style={{ marginBottom: 28 }}>Tu progreso en el tiempo</h1><UpgradePanel feature="history.trend" /></div>;

  if (!history || history.length === 0) {
    return (
      <div style={{ 
        background: COLORS.paperDim, 
        borderRadius: 16, 
        padding: 32, 
        textAlign: "center" 
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Sin historial</h3>
        <p style={{ color: COLORS.inkSoft, marginBottom: 16 }}>
          Necesitás al menos dos análisis para medir la evolución de tu Nuvra Score.
        </p>
        <p style={{ fontSize: 13, color: COLORS.inkFaint }}>
          Realizá un nuevo análisis en el futuro para comparar resultados.
        </p>
      </div>
    );
  }

  const currentMethodologyVersion = history[0].scoreMethodologyVersion;
  const comparableHistory = history.filter((item) => item.scoreMethodologyVersion === currentMethodologyVersion);

  if (comparableHistory.length === 1) {
    return (
      <div>
        <div style={{ marginBottom: 32 }}>
          <h1 className="shp-display" style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
            Evolución
          </h1>
          <p style={{ color: COLORS.inkSoft, fontSize: 15 }}>
            {isDemo && <DemoBadge style={{ marginRight: 8 }} />}
            Seguimiento de tu progreso en el tiempo
          </p>
        </div>

        <div style={{ 
          background: COLORS.paperDim, 
          borderRadius: 16, 
          padding: 32, 
          textAlign: "center" 
        }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Primer análisis completado</h3>
          <p style={{ color: COLORS.inkSoft, marginBottom: 16 }}>
            Tu Nuvra Score actual es: <strong>{comparableHistory[0].nuvraScoreTotal || "N/A"}</strong>
          </p>
          <p style={{ fontSize: 13, color: COLORS.inkFaint }}>
            Realizá un nuevo análisis para comparar resultados calculados con la misma metodología.
          </p>
        </div>
      </div>
    );
  }

  const firstScore = comparableHistory[comparableHistory.length - 1].nuvraScoreTotal || 0;
  const lastScore = comparableHistory[0].nuvraScoreTotal || 0;
  const change = lastScore - firstScore;
  const changePercent = firstScore > 0 ? Math.round((change / firstScore) * 100) : 0;

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 className="shp-display" style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
          Evolución
        </h1>
        <p style={{ color: COLORS.inkSoft, fontSize: 15 }}>
          {isDemo && <DemoBadge style={{ marginRight: 8 }} />}
          Seguimiento de tu progreso en el tiempo
        </p>
      </div>

      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
        gap: 20, 
        marginBottom: 24 
      }}>
        <div style={{ 
          background: "#fff", 
          borderRadius: 16, 
          padding: 24, 
          border: `1px solid ${COLORS.line}`,
          textAlign: "center"
        }}>
          <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 8 }}>Score inicial</div>
          <div className="shp-display" style={{ fontSize: 32, fontWeight: 700 }}>
            {firstScore}
          </div>
        </div>

        <div style={{ 
          background: "#fff", 
          borderRadius: 16, 
          padding: 24, 
          border: `1px solid ${COLORS.line}`,
          textAlign: "center"
        }}>
          <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 8 }}>Score actual</div>
          <div className="shp-display" style={{ fontSize: 32, fontWeight: 700, color: COLORS.blue }}>
            {lastScore}
          </div>
        </div>

        <div style={{ 
          background: "#fff", 
          borderRadius: 16, 
          padding: 24, 
          border: `1px solid ${COLORS.line}`,
          textAlign: "center"
        }}>
          <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 8 }}>Cambio</div>
          <div className="shp-display" style={{ 
            fontSize: 32, 
            fontWeight: 700, 
            color: change >= 0 ? COLORS.olive : COLORS.red 
          }}>
            {change >= 0 ? "+" : ""}{change}
          </div>
          <div style={{ fontSize: 12, color: COLORS.inkFaint }}>
            {changePercent >= 0 ? "+" : ""}{changePercent}%
          </div>
        </div>
      </div>

      <div style={{ 
        background: "#fff", 
        borderRadius: 16, 
        padding: 24, 
        border: `1px solid ${COLORS.line}`
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Historial de análisis</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {history.map((h, i) => (
            <div key={i} style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center", 
              padding: "12px", 
              background: COLORS.paperDim, 
              borderRadius: 8 
            }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>
                  Análisis #{history.length - i}
                </div>
                <div style={{ fontSize: 12, color: COLORS.inkSoft }}>
                  {new Date(h.createdAt).toLocaleDateString("es-AR", { 
                    year: "numeric", 
                    month: "short", 
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </div>
              </div>
              <div className="shp-display" style={{ fontSize: 24, fontWeight: 700 }}>
                {h.nuvraScoreTotal || "N/A"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
