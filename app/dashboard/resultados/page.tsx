"use client";

import { useDashboardData } from "@/lib/use-dashboard-data";
import { COLORS } from "@/lib/design-tokens";
import { DemoBadge, ProBadge, ErrorState, PageSkeleton } from "@/components/ui";

export default function ResultadosPage() {
  const { business, score, actions, loading, error, isDemo } = useDashboardData();

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error} />;

  if (!business) {
    return (
      <div style={{ 
        background: COLORS.paperDim, 
        borderRadius: 16, 
        padding: 32, 
        textAlign: "center" 
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Sin datos</h3>
        <p style={{ color: COLORS.inkSoft }}>
          Completá el onboarding para ver resultados.
        </p>
      </div>
    );
  }

  const completedActions = actions.filter((a) => a.done).length;
  const totalActions = actions.length;

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 className="shp-display" style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
          Resultados
        </h1>
        <p style={{ color: COLORS.inkSoft, fontSize: 15 }}>
          {isDemo && <DemoBadge style={{ marginRight: 8 }} />}
          Indicadores disponibles relacionados con tu objetivo
        </p>
      </div>

      <div style={{ 
        background: COLORS.paperDim, 
        borderRadius: 16, 
        padding: 32, 
        textAlign: "center", 
        marginBottom: 24 
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Métricas en desarrollo</h3>
        <p style={{ color: COLORS.inkSoft, marginBottom: 16 }}>
          Actualmente Nuvra se enfoca en el diagnóstico y la estrategia. Las métricas de resultados estarán disponibles próximamente.
        </p>
        <p style={{ fontSize: 13, color: COLORS.inkFaint }}>
          Para medir resultados reales —ventas, consultas y visitas— podés conectar tus sistemas o llevar un seguimiento manual.
        </p>
      </div>

      {score && (
        <div style={{ 
          background: "#fff", 
          borderRadius: 16, 
          padding: 24, 
          border: `1px solid ${COLORS.line}`,
          marginBottom: 24
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Indicadores de progreso actuales</h3>
          
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
            gap: 16 
          }}>
            <div style={{ padding: 16, background: COLORS.paperDim, borderRadius: 12 }}>
              <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 8 }}>Nuvra Score</div>
              <div className="shp-display" style={{ fontSize: 28, fontWeight: 700, color: COLORS.blue }}>
                {score.total}
              </div>
              <div style={{ fontSize: 12, color: COLORS.inkFaint, marginTop: 4 }}>
                / 100
              </div>
            </div>

            <div style={{ padding: 16, background: COLORS.paperDim, borderRadius: 12 }}>
              <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 8 }}>Acciones completadas</div>
              <div className="shp-display" style={{ fontSize: 28, fontWeight: 700, color: COLORS.olive }}>
                {completedActions}
              </div>
              <div style={{ fontSize: 12, color: COLORS.inkFaint, marginTop: 4 }}>
                de {totalActions}
              </div>
            </div>

            <div style={{ padding: 16, background: COLORS.paperDim, borderRadius: 12 }}>
              <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 8 }}>Objetivo</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 8 }}>
                {business.objetivo}
              </div>
              <div style={{ fontSize: 12, color: COLORS.inkFaint, marginTop: 4 }}>
                Plazo: {business.plazoLabel}
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ 
        background: "#fff", 
        borderRadius: 16, 
        padding: 24, 
        border: `1px solid ${COLORS.line}`
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Próximas métricas <ProBadge /></h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px", background: COLORS.paperDim, borderRadius: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: 999, background: COLORS.blue }} />
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>Ventas / Facturación</div>
              <div style={{ fontSize: 12, color: COLORS.inkSoft }}>Seguimiento de ingresos relacionados con el objetivo</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px", background: COLORS.paperDim, borderRadius: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: 999, background: COLORS.olive }} />
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>Consultas recibidas</div>
              <div style={{ fontSize: 12, color: COLORS.inkSoft }}>Personas interesadas que avanzan hacia una reserva o compra</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px", background: COLORS.paperDim, borderRadius: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: 999, background: COLORS.amber }} />
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>Visitas al sitio</div>
              <div style={{ fontSize: 12, color: COLORS.inkSoft }}>Visitantes y comportamiento en el sitio</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px", background: COLORS.paperDim, borderRadius: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: 999, background: COLORS.red }} />
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>Interacción en redes</div>
              <div style={{ fontSize: 12, color: COLORS.inkSoft }}>Personas que reaccionan, comentan o escriben desde Instagram</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
