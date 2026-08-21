"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COLORS } from "@/lib/design-tokens";
import {
  Btn,
  BrandMark,
  Field,
  TextInput,
  TextArea,
  Select,
  Toggle,
} from "@/components/ui";
import {
  OBJETIVOS,
  PLAZOS,
  RUBROS,
  TIPO_CLIENTE,
} from "@/lib/utils";
import { setStoredBusinessId } from "@/lib/session";
import { getApiErrorMessage } from "@/lib/api-client";

const TOTAL_STEPS = 4;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState({
    nombre: "",
    rubro: "",
    descripcion: "",
    ubicacion: "",
    tipoCliente: "",
    webUrl: "",
    instagramHandle: "",
    otrosCanales: "",
    objetivo: "",
    objetivoCustom: "",
    magnitud: 20,
    plazoId: "6m",
    plazoCustomDate: "",
    presupuestoMarketing: "",
    capacidadEjecucion: "",
    limitaciones: "",
    canales: [] as string[],
  });

  const set = (k: string, v: unknown) => setData((d) => ({ ...d, [k]: v }));
  const toggleCanal = (c: string) =>
    setData((d) => ({
      ...d,
      canales: d.canales.includes(c) ? d.canales.filter((x) => x !== c) : [...d.canales, c],
    }));

  const plazo = PLAZOS.find((p) => p.id === data.plazoId) || PLAZOS[2];
  const plazoDias =
    data.plazoId === "custom" && data.plazoCustomDate
      ? Math.max(1, Math.ceil((new Date(data.plazoCustomDate).getTime() - Date.now()) / 86400000))
      : plazo.dias;
  const plazoLabel =
    data.plazoId === "custom" && data.plazoCustomDate
      ? `Hasta ${data.plazoCustomDate}`
      : plazo.label;

  const canContinue = () => {
    if (step === 0) return data.nombre.trim() && data.rubro && data.tipoCliente && data.ubicacion.trim() && data.descripcion.trim();
    if (step === 1) return !!data.webUrl.trim();
    if (step === 2) return !!data.objetivo && (data.objetivo !== "Otro" || !!data.objetivoCustom.trim());
    return true;
  };

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      const objetivo = data.objetivo === "Otro" ? data.objetivoCustom : data.objetivo;
      const res = await fetch("/api/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: data.nombre,
          rubro: data.rubro,
          descripcion: data.descripcion || undefined,
          ubicacion: data.ubicacion || undefined,
          tipoCliente: data.tipoCliente || undefined,
          webUrl: data.webUrl,
          instagramHandle: data.instagramHandle || undefined,
          otrosCanales: data.otrosCanales || undefined,
          canales: ["Instagram", "Página web"], // Canales principales detectados automáticamente
          objetivo,
          objetivoCustom: data.objetivo === "Otro" ? data.objetivoCustom : undefined,
          magnitud: data.magnitud,
          plazoDias,
          plazoLabel,
          inversionMarketing: data.presupuestoMarketing ? Number(data.presupuestoMarketing) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(getApiErrorMessage(json, "No pudimos guardar el negocio."));
      setStoredBusinessId(json.businessId);
      router.push(`/analyze?businessId=${json.businessId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "22px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${COLORS.line}` }}>
        <button type="button" onClick={() => router.push("/")} style={{ background: "none", border: "none" }}>
          <BrandMark subtitle={false} />
        </button>
        <div className="shp-mono" style={{ fontSize: 12.5, color: COLORS.inkSoft }}>
          Paso {step + 1} de {TOTAL_STEPS}
        </div>
      </div>
      <div style={{ height: 3, background: COLORS.line }}>
        <div style={{ height: "100%", width: `${((step + 1) / TOTAL_STEPS) * 100}%`, background: COLORS.blue, transition: "width .3s ease" }} />
      </div>

      <div style={{ flex: 1, display: "flex", justifyContent: "center", padding: "56px 24px" }}>
        <div style={{ width: "100%", maxWidth: 520 }} className="shp-fadeup" key={step}>
          {step === 0 && (
            <>
              <h2 className="shp-display" style={{ fontSize: 27, fontWeight: 700, marginBottom: 6 }}>Tu negocio</h2>
              <p style={{ color: COLORS.inkSoft, fontSize: 14.5, marginBottom: 30 }}>Información esencial para entender tu contexto.</p>
              <Field label="Nombre del negocio"><TextInput value={data.nombre} onChange={(v) => set("nombre", v)} placeholder="Ej: Noma Café" /></Field>
              <Field label="Rubro"><Select value={data.rubro} onChange={(v) => set("rubro", v)} options={RUBROS} placeholder="Elegí un rubro" /></Field>
              <Field label="Ubicación"><TextInput value={data.ubicacion} onChange={(v) => set("ubicacion", v)} placeholder="Ej: Palermo, Buenos Aires" /></Field>
              <Field label="Tipo de cliente"><Select value={data.tipoCliente} onChange={(v) => set("tipoCliente", v)} options={TIPO_CLIENTE} placeholder="B2B / B2C / Ambos" /></Field>
              <Field label="Descripción breve" hint="¿Qué hacés y para quién?"><TextArea value={data.descripcion} onChange={(v) => set("descripcion", v)} placeholder="Ej: Cafetería de especialidad en Palermo..." rows={3} /></Field>
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="shp-display" style={{ fontSize: 27, fontWeight: 700, marginBottom: 6 }}>Presencia digital</h2>
              <p style={{ color: COLORS.inkSoft, fontSize: 14.5, marginBottom: 30 }}>Nuvra analizará automáticamente tu web y detectará información.</p>
              <Field label="URL de tu sitio web" hint="Ej: tunegocio.com o https://tunegocio.com">
                <TextInput value={data.webUrl} onChange={(v) => set("webUrl", v)} placeholder="tunegocio.com" />
              </Field>
              <Field label="Instagram (opcional)" hint="Handle o URL — conexión OAuth disponible cuando Meta esté configurado">
                <TextInput value={data.instagramHandle} onChange={(v) => set("instagramHandle", v)} placeholder="@tunegocio" />
              </Field>
              <Field label="Otros canales (opcional)"><TextInput value={data.otrosCanales} onChange={(v) => set("otrosCanales", v)} placeholder="Ej: LinkedIn, email marketing" /></Field>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="shp-display" style={{ fontSize: 27, fontWeight: 700, marginBottom: 6 }}>Tu objetivo</h2>
              <p style={{ color: COLORS.inkSoft, fontSize: 14.5, marginBottom: 26 }}>¿Qué querés lograr y en cuánto tiempo?</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                {OBJETIVOS.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => set("objetivo", o)}
                    style={{
                      padding: "16px 14px",
                      borderRadius: 12,
                      textAlign: "left",
                      border: `1.5px solid ${data.objetivo === o ? COLORS.blue : COLORS.line}`,
                      background: data.objetivo === o ? COLORS.blueSoft : "#fff",
                      fontSize: 14,
                      fontWeight: 500,
                      color: data.objetivo === o ? COLORS.blueDeep : COLORS.ink,
                    }}
                  >
                    {o}
                  </button>
                ))}
              </div>
              {data.objetivo === "Otro" && (
                <Field label="Describí tu objetivo"><TextInput value={data.objetivoCustom} onChange={(v) => set("objetivoCustom", v)} placeholder="Ej: Duplicar reservas de fin de semana" /></Field>
              )}
              <div style={{ marginTop: 24 }}>
                <Field label="Plazo para alcanzarlo">
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {PLAZOS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => set("plazoId", p.id)}
                        style={{
                          flex: "1 1 100px",
                          padding: "14px 12px",
                          borderRadius: 12,
                          border: `1.5px solid ${data.plazoId === p.id ? COLORS.blue : COLORS.line}`,
                          background: data.plazoId === p.id ? COLORS.blueSoft : "#fff",
                          fontWeight: 600,
                          fontSize: 14,
                          color: data.plazoId === p.id ? COLORS.blueDeep : COLORS.ink,
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </Field>
                {data.plazoId === "custom" && (
                  <Field label="Fecha objetivo"><TextInput type="date" value={data.plazoCustomDate} onChange={(v) => set("plazoCustomDate", v)} /></Field>
                )}
                <Field label="Magnitud del objetivo (opcional)" hint="Si aplica, ¿cuánto querés crecer?">
                  <div style={{ textAlign: "center", marginBottom: 10 }}>
                    <span className="shp-display" style={{ fontSize: 32, fontWeight: 700, color: COLORS.blue }}>+{data.magnitud}%</span>
                  </div>
                  <input type="range" min={5} max={60} value={data.magnitud} onChange={(e) => set("magnitud", Number(e.target.value))} style={{ width: "100%", accentColor: COLORS.blue }} />
                </Field>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="shp-display" style={{ fontSize: 27, fontWeight: 700, marginBottom: 6 }}>Contexto final</h2>
              <p style={{ color: COLORS.inkSoft, fontSize: 14.5, marginBottom: 26 }}>Información adicional que ayuda a personalizar tu estrategia.</p>
              <Field label="Presupuesto mensual aproximado para marketing (opcional)">
                <TextInput type="number" value={data.presupuestoMarketing} onChange={(v) => set("presupuestoMarketing", v)} placeholder="Ej: 180000" />
              </Field>
              <Field label="Capacidad actual para ejecutar acciones (opcional)" hint="Tiempo disponible, equipo interno, etc.">
                <TextArea value={data.capacidadEjecucion} onChange={(v) => set("capacidadEjecucion", v)} placeholder="Ej: Tengo 2 horas semanales, trabajo solo..." rows={3} />
              </Field>
              <Field label="Limitaciones importantes (opcional)" hint="Algo que debamos tener en cuenta">
                <TextArea value={data.limitaciones} onChange={(v) => set("limitaciones", v)} placeholder="Ej: No puedo invertir en publicidad, presupuesto limitado..." rows={3} />
              </Field>
              
              <div style={{ marginTop: 32, border: `1px solid ${COLORS.line}`, borderRadius: 16, padding: 24, fontSize: 14, lineHeight: 1.8 }}>
                <div><strong>Negocio:</strong> {data.nombre}</div>
                <div><strong>Web:</strong> {data.webUrl}</div>
                <div><strong>Objetivo:</strong> {data.objetivo === "Otro" ? data.objetivoCustom : data.objetivo}</div>
                <div><strong>Plazo:</strong> {plazoLabel}</div>
                {data.instagramHandle && <div><strong>Instagram:</strong> {data.instagramHandle}</div>}
              </div>
              {error && <p style={{ color: COLORS.red, fontSize: 14, marginTop: 16 }}>{error}</p>}
            </>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 40 }}>
            <Btn variant="ghost" onClick={() => (step === 0 ? router.push("/") : setStep(step - 1))}>Atrás</Btn>
            {step < TOTAL_STEPS - 1 ? (
              <Btn variant="primary" disabled={!canContinue()} onClick={() => setStep(step + 1)}>Continuar</Btn>
            ) : (
              <Btn variant="accent" disabled={loading} onClick={submit}>{loading ? "Guardando..." : "Analizar mi negocio"}</Btn>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
