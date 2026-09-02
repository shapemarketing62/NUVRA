"use client";

import { useEffect, useState } from "react";
import { useDashboardData } from "@/lib/use-dashboard-data";
import { Btn, Card, DemoBadge, EmptyState, ErrorState, Field, Modal, PageHeader, PageSkeleton, StatusBadge, TextArea, TextInput, Toggle } from "@/components/ui";
import { COLORS } from "@/lib/design-tokens";
import type { BusinessUnderstandingGroup, BusinessUnderstandingItem } from "@/lib/business-context-views";
import { getApiErrorMessage } from "@/lib/api-client";

const groupLabels: Record<BusinessUnderstandingGroup, string> = {
  business: "Información del negocio",
  presence: "Presencia y canales",
  goal: "Objetivo actual",
  resources: "Recursos disponibles",
};

function InformationRows({ items }: { items: BusinessUnderstandingItem[] }) {
  return <div>{items.map((item) => <div className="business-information-row" key={item.key}><div className="business-information-label">{item.label}</div><div style={{ minWidth: 0, overflowWrap: "anywhere" }}><div className="business-information-value">{item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: COLORS.blueDeep }}>{item.value}</a> : item.value}</div>{item.basis && <div className="field-hint">Base de esta lectura: {item.basis}</div>}{item.source && <div className="field-hint">Fuente: {item.source}</div>}</div></div>)}</div>;
}

export default function NegocioPage() {
  const { business, businessUnderstanding, loading, error, isDemo } = useDashboardData();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [form, setForm] = useState({
    nombre: "", rubro: "", descripcion: "", ubicacion: "", ciudad: "", pais: "", empleados: "",
    webUrl: "", instagramHandle: "", noWebDeclared: false, noInstagramDeclared: false,
    otrosCanales: "", canales: "", inversionMarketing: "", objetivo: "", plazoDias: "90", plazoLabel: "3 meses", magnitud: "",
  });

  useEffect(() => {
    if (!business.updatedAt) return;
    setForm({
      nombre: business.nombre || "",
      rubro: business.rubro || "",
      descripcion: business.description || "",
      ubicacion: business.location || "",
      ciudad: business.city || "",
      pais: business.country || "",
      empleados: business.employees || "",
      webUrl: business.webUrl || "",
      instagramHandle: business.instagramHandle || "",
      noWebDeclared: business.hasDeclaredNoWebsite === true,
      noInstagramDeclared: business.hasDeclaredNoInstagram === true,
      otrosCanales: business.otherChannels || "",
      canales: (business.channels || []).join(", "),
      inversionMarketing: business.marketingInvestment == null ? "" : String(business.marketingInvestment),
      objetivo: business.objetivo || "",
      plazoDias: String(business.timeframeDays || 90),
      plazoLabel: business.plazoLabel || "3 meses",
      magnitud: business.magnitud == null ? "" : String(business.magnitud),
    });
  }, [business.updatedAt]);

  const set = (field: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [field]: value }));
  const save = async () => {
    if (!business.id || !business.updatedAt) return;
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch(`/api/business?id=${encodeURIComponent(business.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedUpdatedAt: business.updatedAt,
          business: {
            nombre: form.nombre,
            rubro: form.rubro,
            descripcion: form.descripcion || null,
            ubicacion: form.ubicacion || null,
            ciudad: form.ciudad || null,
            pais: form.pais || null,
            empleados: form.empleados || null,
            webUrl: form.noWebDeclared ? null : form.webUrl || null,
            instagramHandle: form.noInstagramDeclared ? null : form.instagramHandle || null,
            noWebDeclared: form.noWebDeclared,
            noInstagramDeclared: form.noInstagramDeclared,
            otrosCanales: form.otrosCanales || null,
            canales: form.canales.split(",").map((item) => item.trim()).filter(Boolean),
            inversionMarketing: form.inversionMarketing === "" ? null : Number(form.inversionMarketing),
          },
          goal: {
            objetivo: form.objetivo,
            objetivoCustom: business.customObjective || null,
            magnitud: form.magnitud === "" ? null : Number(form.magnitud),
            plazoDias: Number(form.plazoDias),
            plazoLabel: form.plazoLabel,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(getApiErrorMessage(data, "No pudimos guardar los cambios."));
      window.location.reload();
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "No pudimos guardar los cambios.");
      setSaving(false);
    }
  };

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error} />;
  if (!business.nombre) return <EmptyState title="Todavía no hay información del negocio" description="Completá el onboarding para que NUVRA pueda organizar la información de tu negocio." />;

  return (
    <div className="page-container business-profile-v3">
      <PageHeader
        eyebrow="Mi negocio"
        title="Mi negocio"
        subtitle={<>{isDemo && <DemoBadge style={{ marginRight: 8 }} />}Lo que nos contaste, lo que observamos y lo que todavía estamos validando.</>}
        action={business.canEditDeclaredInformation ? <Btn size="sm" onClick={() => setEditing(true)}>Editar información</Btn> : undefined}
      />

      {editing && <Modal title="Editar información del negocio" onClose={() => !saving && setEditing(false)} width={720}>
        <p className="section-description" style={{ marginBottom: 22 }}>Los cambios se guardan como información declarada. Tu análisis actual no se recalcula automáticamente.</p>
        <div className="split-grid">
          <Field label="Nombre"><TextInput value={form.nombre} onChange={(value) => set("nombre", value)} maxLength={120} /></Field>
          <Field label="Rubro"><TextInput value={form.rubro} onChange={(value) => set("rubro", value)} maxLength={120} /></Field>
        </div>
        <Field label="Descripción"><TextArea value={form.descripcion} onChange={(value) => set("descripcion", value)} maxLength={2000} /></Field>
        <div className="split-grid">
          <Field label="Ubicación"><TextInput value={form.ubicacion} onChange={(value) => set("ubicacion", value)} maxLength={240} /></Field>
          <Field label="Ciudad"><TextInput value={form.ciudad} onChange={(value) => set("ciudad", value)} maxLength={120} /></Field>
        </div>
        <div className="split-grid">
          <Field label="País"><TextInput value={form.pais} onChange={(value) => set("pais", value)} maxLength={120} /></Field>
          <Field label="Capacidad del equipo"><TextInput value={form.empleados} onChange={(value) => set("empleados", value)} maxLength={120} /></Field>
        </div>
        <div style={{ margin: "20px 0" }}>
          <Toggle active={form.noWebDeclared} onClick={() => set("noWebDeclared", !form.noWebDeclared)}>No tengo página web</Toggle>
        </div>
        {!form.noWebDeclared && <Field label="Página web"><TextInput value={form.webUrl} onChange={(value) => set("webUrl", value)} inputMode="url" maxLength={2048} /></Field>}
        <div style={{ margin: "20px 0" }}>
          <Toggle active={form.noInstagramDeclared} onClick={() => set("noInstagramDeclared", !form.noInstagramDeclared)}>No tengo Instagram</Toggle>
        </div>
        {!form.noInstagramDeclared && <Field label="Instagram"><TextInput value={form.instagramHandle} onChange={(value) => set("instagramHandle", value)} maxLength={2048} /></Field>}
        <Field label="Otros canales" hint="Separalos con comas."><TextInput value={form.canales} onChange={(value) => set("canales", value)} maxLength={2000} /></Field>
        <Field label="Información adicional"><TextArea value={form.otrosCanales} onChange={(value) => set("otrosCanales", value)} maxLength={4000} /></Field>
        <Field label="Inversión mensual disponible"><TextInput value={form.inversionMarketing} onChange={(value) => set("inversionMarketing", value)} type="number" min="0" /></Field>

        <div className="section-rule" style={{ marginTop: 28, paddingTop: 24 }}>
          <h3 className="section-title">Objetivo actual</h3>
          <p className="section-description" style={{ marginBottom: 18 }}>Si cambia, conservamos el objetivo anterior en el historial y el análisis existente sigue asociado a él.</p>
          <Field label="Objetivo"><TextArea value={form.objetivo} onChange={(value) => set("objetivo", value)} maxLength={500} rows={3} /></Field>
          <div className="split-grid">
            <Field label="Plazo en días"><TextInput value={form.plazoDias} onChange={(value) => set("plazoDias", value)} type="number" min="1" max="3650" /></Field>
            <Field label="Cómo querés ver el plazo"><TextInput value={form.plazoLabel} onChange={(value) => set("plazoLabel", value)} maxLength={80} /></Field>
          </div>
          <Field label="Magnitud esperada" hint="Opcional."><TextInput value={form.magnitud} onChange={(value) => set("magnitud", value)} type="number" min="0" max="1000" /></Field>
        </div>
        {saveError && <p role="alert" style={{ color: COLORS.red, fontSize: 13, marginTop: 18 }}>{saveError}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
          <Btn variant="subtle" onClick={() => setEditing(false)} disabled={saving}>Cancelar</Btn>
          <Btn onClick={save} disabled={saving || !form.nombre.trim() || !form.rubro.trim() || !form.objetivo.trim() || !form.plazoLabel.trim()}>{saving ? "Guardando…" : "Guardar cambios"}</Btn>
        </div>
      </Modal>}

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 8 }}>
          <div><h2 className="section-title">Lo que nos contaste</h2><p className="section-description">Conservamos estos datos tal como los compartiste.</p></div>
          <StatusBadge tone="neutral">Nos lo contaste</StatusBadge>
        </div>
        {(Object.keys(groupLabels) as BusinessUnderstandingGroup[]).map((group) => {
          const items = businessUnderstanding.declared.filter((item) => item.group === group);
          return items.length ? <section key={group} style={{ marginTop: 22 }}><h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 7 }}>{groupLabels[group]}</h3><InformationRows items={items} /></section> : null;
        })}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 8 }}>
          <div><h2 className="section-title">Lo que observamos</h2><p className="section-description">Señales encontradas directamente en fuentes públicas durante el último análisis.</p></div>
          <StatusBadge tone="info">Lo observamos</StatusBadge>
        </div>
        {businessUnderstanding.observed.length ? <InformationRows items={businessUnderstanding.observed} /> : <p className="section-description" style={{ paddingTop: 14, borderTop: `1px solid ${COLORS.line}` }}>Todavía no tenemos observaciones públicas suficientes para mostrar acá.</p>}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 8 }}>
          <div><h2 className="section-title">Lo que estamos validando</h2><p className="section-description">Son hipótesis construidas con lo que nos contaste y lo que observamos. Todavía pueden cambiar.</p></div>
          <StatusBadge tone="warning">Lo estamos validando</StatusBadge>
        </div>
        {businessUnderstanding.inferred.length ? <InformationRows items={businessUnderstanding.inferred} /> : <p className="section-description" style={{ paddingTop: 14, borderTop: `1px solid ${COLORS.line}` }}>Todavía no hay suficiente información para interpretar cómo funciona el negocio.</p>}
      </Card>

      <Card>
        <h2 className="section-title">Lo que todavía no sabemos</h2>
        {businessUnderstanding.unknown.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>{businessUnderstanding.unknown.map((item) => <StatusBadge key={item.key} tone="neutral">{item.label}</StatusBadge>)}</div> : <p className="section-description">No identificamos vacíos relevantes en esta proyección.</p>}
        <p style={{ color: COLORS.inkFaint, fontSize: 12, lineHeight: 1.55, marginTop: 18 }}>Los cambios que hagas en la información declarada no modifican lo que NUVRA observó en análisis anteriores.</p>
      </Card>
    </div>
  );
}
