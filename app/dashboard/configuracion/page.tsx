"use client";

import { useState } from "react";
import { COLORS } from "@/lib/design-tokens";
import { Btn, Field, TextInput } from "@/components/ui";
import { useDashboardData } from "@/lib/use-dashboard-data";
import { PLAN_DEFINITIONS, getPlanSnapshot, getPlanFeatures, hasEntitlement, type PlanTier } from "@/lib/plans";
import { IntegrationManagerPanel } from "@/components/integrations/IntegrationManagerPanel";
import { BillingPanel } from "@/components/billing/BillingPanel";

export default function ConfiguracionPage() {
  const [activeTab, setActiveTab] = useState<"general" | "instagram" | "billing" | "cuenta">("general");
  const { planTier, business } = useDashboardData();
  const currentPlan = getPlanSnapshot(planTier);
  const planOrder: PlanTier[] = ["FREE", "PRO", "PARTNER"];

  return (
    <div className="page-container">
      <div style={{ marginBottom: 32 }}>
        <h1 className="page-title">
          Configuración
        </h1>
        <p style={{ color: COLORS.inkSoft, fontSize: 15 }}>
          Administra tus preferencias y conexiones
        </p>
      </div>

      <div className="settings-layout">
        <div className="settings-tabs">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { id: "general", label: "General" },
              { id: "instagram", label: "Integraciones" },
              { id: "billing", label: "Plan y facturación" },
              { id: "cuenta", label: "Cuenta" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 7,
                  border: "none",
                  background: activeTab === tab.id ? COLORS.blueSoft : "transparent",
                  color: activeTab === tab.id ? COLORS.blueDeep : COLORS.inkSoft,
                  fontSize: 14,
                  fontWeight: 500,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1 }}>
          {activeTab === "general" && (
            <div style={{ 
              background: "#fff", 
              borderRadius: 16, 
              padding: 24, 
              border: `1px solid ${COLORS.line}`
            }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Configuración general</h3>
              
              <Field label="Idioma de la interfaz">
                <select style={{ 
                  width: "100%", 
                  padding: "12px 14px", 
                  borderRadius: 10, 
                  border: `1px solid ${COLORS.line}`,
                  fontSize: 14
                }}>
                  <option>Español</option>
                  <option>English</option>
                  <option>Português</option>
                </select>
              </Field>

              <Field label="Zona horaria">
                <select style={{ 
                  width: "100%", 
                  padding: "12px 14px", 
                  borderRadius: 10, 
                  border: `1px solid ${COLORS.line}`,
                  fontSize: 14
                }}>
                  <option>Argentina (UTC-3)</option>
                  <option>México (UTC-6)</option>
                  <option>España (UTC+1)</option>
                  <option>Chile (UTC-4)</option>
                </select>
              </Field>

              <Field label="Notificaciones por email">
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <input 
                    type="checkbox" 
                    id="notifications"
                    defaultChecked
                    style={{ width: 18, height: 18 }}
                  />
                  <label htmlFor="notifications" style={{ fontSize: 14 }}>
                    Recibir actualizaciones sobre mi análisis y estrategia
                  </label>
                </div>
              </Field>

              <div style={{ marginTop: 24 }}>
                <Btn variant="primary">Guardar cambios</Btn>
              </div>

              <div id="planes" style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${COLORS.line}` }}>
                <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Planes de NUVRA</h4>
                <p style={{ fontSize: 14, color: COLORS.inkSoft, lineHeight: 1.6, marginBottom: 20 }}>
                  Elegí el nivel de profundidad y capacidad que necesita tu negocio. Los pagos todavía no están habilitados.
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
                  {planOrder.map((tier) => {
                    const plan = PLAN_DEFINITIONS[tier];
                    const active = currentPlan.tier === tier;

                    return (
                      <div
                        key={tier}
                        style={{
                          border: `1px solid ${active ? COLORS.blue : COLORS.line}`,
                          background: active ? COLORS.blueSoft : "#fff",
                          borderRadius: 16,
                          padding: 20,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <div>
                            <div style={{ fontSize: 18, fontWeight: 700 }}>{plan.label}</div>
                            <div style={{ fontSize: 12, color: COLORS.inkSoft }}>{plan.audience}</div>
                          </div>
                          {active && (
                            <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.blueDeep }}>
                              Plan actual
                            </span>
                          )}
                        </div>

                        <p style={{ fontSize: 13, color: COLORS.inkSoft, lineHeight: 1.6, marginBottom: 16 }}>
                          {plan.summary}
                        </p>

                        <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
                          <div style={{ fontSize: 13 }}><strong>Negocios:</strong> {plan.limits.businesses}</div>
                          <div style={{ fontSize: 13 }}><strong>Análisis por mes:</strong> {plan.limits.monthlyAnalyses}</div>
                          <div style={{ fontSize: 13 }}><strong>Historial:</strong> {plan.limits.historicalMonths} meses</div>
                          <div style={{ fontSize: 13 }}><strong>Equipo:</strong> {plan.limits.teamMembers} usuario(s)</div>
                        </div>

                        <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 8 }}>Incluye</div>
                        <ul style={{ paddingLeft: 18, display: "grid", gap: 6, fontSize: 13, color: COLORS.ink }}>
                          {plan.highlights.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.line}`, fontSize: 12, color: COLORS.inkSoft }}>
                          {getPlanFeatures(tier).length} capacidades incluidas
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === "instagram" && <IntegrationManagerPanel businessId={business.id} />}
          {activeTab === "billing" && <BillingPanel organizationId={business.organizationId} />}

          {activeTab === "cuenta" && (
            <div style={{ 
              background: "#fff", 
              borderRadius: 16, 
              padding: 24, 
              border: `1px solid ${COLORS.line}`
            }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Mi cuenta</h3>
              
              <Field label="Email">
                <TextInput 
                  value="" 
                  onChange={() => {}} 
                  placeholder="tu@email.com"
                />
              </Field>

              <Field label="Nuevo password (opcional)">
                <TextInput 
                  value="" 
                  onChange={() => {}} 
                  type="password"
                  placeholder="••••••••"
                />
              </Field>

              <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
                <Btn variant="primary">Actualizar cuenta</Btn>
                <Btn variant="ghost" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}>
                  Cerrar sesión
                </Btn>
                <Btn variant="ghost" style={{ color: COLORS.red }}>
                  Eliminar cuenta
                </Btn>
              </div>

              <div style={{ marginTop: 32, padding: 16, background: COLORS.paperDim, borderRadius: 12 }}>
                <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 8 }}>
                  <strong>Plan actual:</strong> {currentPlan.label}
                </div>
                <p style={{ fontSize: 12, color: COLORS.inkFaint }}>
                  {currentPlan.summary}
                </p>
                <div style={{ display: "grid", gap: 8, marginTop: 12, fontSize: 12, color: COLORS.inkSoft }}>
                  <div>Análisis de competencia: {hasEntitlement(currentPlan, "analysis.competitors") ? "incluido" : "no incluido"}</div>
                  <div>Exportaciones: {hasEntitlement(currentPlan, "reports.export") ? "incluidas" : "no incluidas"}</div>
                  <div>Integraciones estándar: {hasEntitlement(currentPlan, "integrations.standard") ? "incluidas" : "no incluidas"}</div>
                  <div>Equipo y permisos: {hasEntitlement(currentPlan, "team.roles") ? "incluidos" : "no incluidos"}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
