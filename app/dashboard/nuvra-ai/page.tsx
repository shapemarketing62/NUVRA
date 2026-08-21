"use client";

import { COLORS } from "@/lib/design-tokens";
import { ProBadge } from "@/components/ui";

export default function NuvraAiPage() {
  const hasAIConfigured = !!process.env.OPENAI_API_KEY || !!process.env.ANTHROPIC_API_KEY;

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 className="shp-display" style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
          Nuvra AI
        </h1>
        <p style={{ color: COLORS.inkSoft, fontSize: 15 }}>
          Asistente inteligente para tu estrategia
        </p>
      </div>

      {!hasAIConfigured ? (
        <div style={{ 
          background: COLORS.paperDim, 
          borderRadius: 16, 
          padding: 48, 
          textAlign: "center" 
        }}>
          <div style={{ marginBottom: 24 }}>
            <ProBadge style={{ fontSize: 14, padding: "4px 12px" }} />
          </div>
          
          <h2 className="shp-display" style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
            Nuvra AI
          </h2>
          
          <p style={{ fontSize: 15, color: COLORS.inkSoft, marginBottom: 24, maxWidth: 400, margin: "0 auto 24px" }}>
            Esta función está disponible en Nuvra Pro. Nuvra AI utiliza inteligencia artificial para generar diagnósticos y estrategias más avanzadas.
          </p>

          <div style={{ 
            background: "#fff", 
            borderRadius: 12, 
            padding: 24, 
            border: `1px solid ${COLORS.line}`,
            maxWidth: 500,
            margin: "0 auto"
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Capacidades de Nuvra AI:</h3>
            <ul style={{ textAlign: "left", fontSize: 14, color: COLORS.inkSoft, lineHeight: 1.8, paddingLeft: 20 }}>
              <li>Diagnósticos más profundos y personalizados</li>
              <li>Estrategias adaptativas según tu contexto</li>
              <li>Análisis de tendencias del mercado</li>
              <li>Recomendaciones de acciones específicas</li>
              <li>Chat interactivo para consultas</li>
              <li>Generación de contenido personalizado</li>
            </ul>
          </div>

          <div style={{ marginTop: 32 }}>
            <button
              type="button"
              style={{
                padding: "12px 24px",
                borderRadius: 999,
                background: COLORS.ink,
                color: COLORS.paper,
                border: "none",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Habilite Nuvra AI
            </button>
          </div>
        </div>
      ) : (
        <div style={{ 
          background: "#fff", 
          borderRadius: 16, 
          padding: 24, 
          border: `1px solid ${COLORS.line}`
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Chat con Nuvra AI</h3>
          <p style={{ color: COLORS.inkSoft, marginBottom: 16 }}>
            Interactuá con Nuvra AI para obtener recomendaciones personalizadas sobre tu estrategia.
          </p>
          
          <div style={{ 
            background: COLORS.paperDim, 
            borderRadius: 12, 
            padding: 24, 
            textAlign: "center",
            minHeight: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <p style={{ color: COLORS.inkSoft }}>
              El chat estará disponible próximamente. Por ahora, Nuvra AI se utiliza en segundo plano para mejorar diagnósticos y estrategias.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}