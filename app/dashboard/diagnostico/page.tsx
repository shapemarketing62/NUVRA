"use client";

import { useDashboardData } from "@/lib/use-dashboard-data";
import { COLORS } from "@/lib/design-tokens";
import { DemoBadge, ErrorState, PageSkeleton } from "@/components/ui";
import { simplifyTechnicalText, getFriendlyDimensionName } from "@/lib/simple-language-presenter";

export default function DiagnosticoPage() {
  const { diagnosis, score, loading, error, isDemo } = useDashboardData();

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error} />;

  if (!diagnosis) {
    return (
      <div style={{ 
        background: COLORS.paperDim, 
        borderRadius: 16, 
        padding: 32, 
        textAlign: "center" 
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Sin diagnóstico</h3>
        <p style={{ color: COLORS.inkSoft }}>
          Completá el onboarding para generar un diagnóstico de tu negocio.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 className="shp-display" style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
          Diagnóstico
        </h1>
        <p style={{ color: COLORS.inkSoft, fontSize: 15 }}>
          {isDemo && <DemoBadge />}
          Análisis en lenguaje claro basado en datos reales de tu negocio
        </p>
      </div>

      <div style={{ 
        background: "#fff", 
        borderRadius: 16, 
        padding: 24, 
        border: `1px solid ${COLORS.line}`,
        marginBottom: 24
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Resumen ejecutivo</h3>
        <p style={{ fontSize: 15, lineHeight: 1.7, color: COLORS.ink }}>
          {simplifyTechnicalText(diagnosis.summary)}
        </p>
      </div>

      {diagnosis.bottleneck && (
        <div style={{ 
          background: COLORS.redSoft, 
          borderRadius: 16, 
          padding: 24, 
          marginBottom: 24 
        }}>
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: 12, 
            marginBottom: 16 
          }}>
            <div style={{ 
              width: 40, 
              height: 40, 
              borderRadius: "50%", 
              background: COLORS.red, 
              color: "#fff", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              fontSize: 20, 
              fontWeight: 700
            }}>
              !
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.red, marginBottom: 4 }}>
                PRINCIPAL ÁREA DE MEJORA
              </div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>
                {getFriendlyDimensionName(diagnosis.bottleneck.dimension, diagnosis.bottleneck.dimension)}: {simplifyTechnicalText(diagnosis.bottleneck.title)}
              </div>
            </div>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: COLORS.ink }}>
            {simplifyTechnicalText(diagnosis.bottleneck.explanation)}
          </p>
        </div>
      )}

      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", 
        gap: 20, 
        marginBottom: 24 
      }}>
        {diagnosis.strengths && diagnosis.strengths.length > 0 && (
          <div style={{ 
            background: "#fff", 
            borderRadius: 16, 
            padding: 24, 
            border: `1px solid ${COLORS.line}`
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: COLORS.olive }}>
              Fortalezas
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {diagnosis.strengths.map((s, i) => (
                <div key={i} style={{ paddingBottom: 12, borderBottom: i < diagnosis.strengths!.length - 1 ? `1px solid ${COLORS.line}` : "none" }}>
                  <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>{simplifyTechnicalText(s.title)}</div>
                  <div style={{ fontSize: 13, color: COLORS.inkSoft }}>{simplifyTechnicalText(s.evidence)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {diagnosis.weaknesses && diagnosis.weaknesses.length > 0 && (
          <div style={{ 
            background: "#fff", 
            borderRadius: 16, 
            padding: 24, 
            border: `1px solid ${COLORS.line}`
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: COLORS.red }}>
              Aspectos a mejorar
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {diagnosis.weaknesses.map((w, i) => (
                <div key={i} style={{ paddingBottom: 12, borderBottom: i < diagnosis.weaknesses!.length - 1 ? `1px solid ${COLORS.line}` : "none" }}>
                  <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>{simplifyTechnicalText(w.title)}</div>
                  <div style={{ fontSize: 13, color: COLORS.inkSoft }}>{simplifyTechnicalText(w.evidence)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {diagnosis.opportunities && diagnosis.opportunities.length > 0 && (
        <div style={{ 
          background: "#fff", 
          borderRadius: 16, 
          padding: 24, 
          border: `1px solid ${COLORS.line}`,
          marginBottom: 24
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Oportunidades de Crecimiento</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {diagnosis.opportunities.map((o, i) => (
              <div key={i} style={{ 
                display: "flex", 
                gap: 12, 
                padding: "12px", 
                background: COLORS.blueSoft, 
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
                <div style={{ fontSize: 14, lineHeight: 1.5 }}>{simplifyTechnicalText(o)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {diagnosis.risks && diagnosis.risks.length > 0 && (
        <div style={{ 
          background: "#fff", 
          borderRadius: 16, 
          padding: 24, 
          border: `1px solid ${COLORS.line}`,
          marginBottom: 24
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: COLORS.red }}>Riesgos a Considerar</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {diagnosis.risks.map((r, i) => (
              <div key={i} style={{ 
                display: "flex", 
                gap: 12, 
                padding: "12px", 
                background: COLORS.redSoft, 
                borderRadius: 8 
              }}>
                <div style={{ fontSize: 24, fontWeight: 700 }}>!</div>
                <div style={{ fontSize: 14, lineHeight: 1.5 }}>{simplifyTechnicalText(r)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {diagnosis.priorities && diagnosis.priorities.length > 0 && (
        <div style={{ 
          background: "#fff", 
          borderRadius: 16, 
          padding: 24, 
          border: `1px solid ${COLORS.line}`
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Prioridades recomendadas</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {diagnosis.priorities
              .sort((a, b) => a.order - b.order)
              .map((p, i) => (
              <div key={i} style={{ 
                display: "flex", 
                gap: 16, 
                padding: "16px", 
                background: COLORS.paperDim, 
                borderRadius: 12 
              }}>
                <div style={{ 
                  width: 32, 
                  height: 32, 
                  borderRadius: "50%", 
                  background: COLORS.blue, 
                  color: "#fff", 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center", 
                  fontSize: 14, 
                  fontWeight: 600 
                }}>
                  {p.order}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{simplifyTechnicalText(p.title)}</div>
                  <div style={{ fontSize: 13, color: COLORS.inkSoft }}>{simplifyTechnicalText(p.reason)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
