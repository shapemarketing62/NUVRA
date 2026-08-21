"use client";

import { useDashboardData } from "@/lib/use-dashboard-data";
import { COLORS } from "@/lib/design-tokens";
import { Btn, DemoBadge, ErrorState, PageSkeleton } from "@/components/ui";

export default function NegocioPage() {
  const { business, loading, error, isDemo } = useDashboardData();

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
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Sin información</h3>
        <p style={{ color: COLORS.inkSoft }}>
          Completá el onboarding para cargar la información de tu negocio.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 className="shp-display" style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
          Mi negocio
        </h1>
        <p style={{ color: COLORS.inkSoft, fontSize: 15 }}>
          {isDemo && <DemoBadge style={{ marginRight: 8 }} />}
          Información cargada durante el onboarding
        </p>
      </div>

      <div style={{ 
        background: "#fff", 
        borderRadius: 16, 
        padding: 24, 
        border: `1px solid ${COLORS.line}`,
        marginBottom: 24
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Información básica</h3>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 4 }}>Nombre</div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>{business.nombre}</div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 4 }}>Rubro</div>
            <div style={{ fontSize: 15 }}>{business.rubro}</div>
          </div>

          {business.objetivo && (
            <div>
              <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 4 }}>Objetivo</div>
              <div style={{ fontSize: 15 }}>{business.objetivo}</div>
            </div>
          )}

          {business.plazoLabel && (
            <div>
              <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 4 }}>Plazo</div>
              <div style={{ fontSize: 15 }}>{business.plazoLabel}</div>
            </div>
          )}

          {business.magnitud && (
            <div>
              <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 4 }}>Magnitud objetivo</div>
              <div style={{ fontSize: 15 }}>+{business.magnitud}%</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ 
        background: "#fff", 
        borderRadius: 16, 
        padding: 24, 
        border: `1px solid ${COLORS.line}`,
        marginBottom: 24
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Presencia digital</h3>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 }}>
          {business.webUrl && (
            <div>
              <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 4 }}>Sitio web</div>
              <a 
                href={business.webUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ fontSize: 15, color: COLORS.blue, textDecoration: "none" }}
              >
                {business.webUrl}
              </a>
            </div>
          )}

          <div>
            <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 4 }}>Instagram</div>
            <div style={{ fontSize: 15 }}>
              {business.instagramHandle || "No configurado"}
            </div>
          </div>
        </div>
      </div>

      <div style={{ 
        background: "#fff", 
        borderRadius: 16, 
        padding: 24, 
        border: `1px solid ${COLORS.line}`,
        marginBottom: 24
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Contexto adicional</h3>
        
        <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 16 }}>
          Esta información ayuda a personalizar tu estrategia. Podés actualizarla si hay cambios en tu negocio.
        </div>

        <Btn 
          size="sm" 
          variant="ghost"
          onClick={() => {
            // TODO: implementar edición de información del negocio
            console.log("Editar información del negocio");
          }}
        >
          Actualizar información
        </Btn>
      </div>

      <div style={{ 
        background: COLORS.paperDim, 
        borderRadius: 16, 
        padding: 24, 
        border: `1px dashed ${COLORS.line}`
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Información del onboarding</h3>
        <p style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 12 }}>
          Los datos que ves aquí fueron cargados durante el onboarding inicial. Si alguno cambió, podés actualizarlo para que tu estrategia se ajuste a la nueva realidad.
        </p>
        <p style={{ fontSize: 12, color: COLORS.inkFaint }}>
          Esta información se utiliza para generar diagnósticos y estrategias personalizadas.
        </p>
      </div>
    </div>
  );
}
