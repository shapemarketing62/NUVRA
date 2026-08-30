"use client";

import { useEffect, useState } from "react";
import { COLORS } from "@/lib/design-tokens";
import { Btn, Card, EmptyState, ErrorState, PageSkeleton, StatusBadge, UpgradePanel } from "@/components/ui";
import { useDashboardData } from "@/lib/use-dashboard-data";
import { getPlanSnapshot, hasEntitlement } from "@/lib/plans";
import { IntegrationManagerPanel } from "@/components/integrations/IntegrationManagerPanel";
import { BillingPanel } from "@/components/billing/BillingPanel";

type SettingsTab = "account" | "plan" | "integrations" | "preferences";

export default function ConfiguracionPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("account");
  const [accountEmail, setAccountEmail] = useState("");
  const { planTier, internalAccess, business, loading, error } = useDashboardData();
  const currentPlan = getPlanSnapshot(planTier);

  useEffect(() => {
    const requested = window.location.hash === "#planes" ? "plan" : window.location.hash === "#integraciones" ? "integrations" : null;
    if (requested) setActiveTab(requested);
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => setAccountEmail(body?.user?.email || ""))
      .catch(() => setAccountEmail(""));
  }, []);

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error} />;

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: "account", label: "Cuenta" },
    { id: "plan", label: "Plan y facturación" },
    { id: "integrations", label: "Integraciones" },
    { id: "preferences", label: "Preferencias" },
  ];

  return (
    <div className="page-container">
      <div style={{ marginBottom: 32 }}>
        <h1 className="page-title">Configuración</h1>
        <p style={{ color: COLORS.inkSoft, fontSize: 15 }}>Cuenta, plan y conexiones del negocio.</p>
      </div>

      <div className="settings-layout">
        <div className="settings-tabs">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
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
          {activeTab === "account" && (
            <Card>
              <h2 className="section-title">Cuenta</h2>
              <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${COLORS.line}` }}>
                <div style={{ color: COLORS.inkFaint, fontSize: 12, marginBottom: 5 }}>Email</div>
                <div style={{ fontSize: 14 }}>{accountEmail || "No disponible"}</div>
              </div>
              <div style={{ marginTop: 20 }}>
                <Btn variant="ghost" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}>
                  Cerrar sesión
                </Btn>
              </div>
            </Card>
          )}

          {activeTab === "plan" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <StatusBadge tone="info">Plan {currentPlan.label}</StatusBadge>
                <span style={{ color: COLORS.inkSoft, fontSize: 13 }}>
                  {planTier === "PARTNER" ? "Tu equipo de marketing externo." : planTier === "PRO" ? "NUVRA piensa y planifica; vos ejecutás." : "El plan inicial para conocer NUVRA."}
                </span>
              </div>
              <BillingPanel organizationId={business.organizationId} />
            </div>
          )}

          {activeTab === "integrations" && (
            hasEntitlement(planTier, "integrations.standard", internalAccess)
              ? <IntegrationManagerPanel businessId={business.id} />
              : <UpgradePanel feature="integrations.standard" />
          )}

          {activeTab === "preferences" && (
            <EmptyState
              title="Todavía no hay preferencias configurables"
              description="La interfaz utiliza la configuración actual de NUVRA. Cuando una preferencia pueda guardarse de forma real, aparecerá acá."
            />
          )}
        </div>
      </div>
    </div>
  );
}
