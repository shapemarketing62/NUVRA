"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COLORS } from "@/lib/design-tokens";
import { Btn, BrandMark, Field, TextInput, TextArea } from "@/components/ui";
import { OBJETIVOS, PLAZOS } from "@/lib/utils";
import { setStoredBusinessId } from "@/lib/session";
import { getApiErrorMessage } from "@/lib/api-client";
import { parseCustomTimeframe } from "@/lib/timeframe";

const TOTAL_STEPS = 3;
const BUDGETS = [
  { label: "Casi nada / solo tiempo", value: "0", amount: 0 },
  { label: "Hasta USD 100/mes", value: "100", amount: 75 },
  { label: "USD 100–300/mes", value: "300", amount: 200 },
  { label: "USD 300–700/mes", value: "700", amount: 500 },
  { label: "Más de USD 700/mes", value: "701", amount: 800 },
];
const CAPACITIES = ["Lo hago yo", "Somos 2–3 personas", "Tenemos alguien dedicado", "Tenemos apoyo externo"];

function ChoiceGrid({ options, value, onChange }: { options: readonly string[]; value: string; onChange: (value: string) => void }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>{options.map((option) => <button key={option} type="button" onClick={() => onChange(option)} style={{ padding: "13px 14px", borderRadius: 11, textAlign: "left", border: `1.5px solid ${value === option ? COLORS.blue : COLORS.line}`, background: value === option ? COLORS.blueSoft : "#fff", color: value === option ? COLORS.blueDeep : COLORS.ink, fontSize: 13.5, fontWeight: 550 }}>{option}</button>)}</div>;
}

function validInstagram(value: string) {
  if (!value.trim()) return true;
  const clean = value.trim();
  if (/^@?[a-zA-Z0-9._]{1,30}$/.test(clean)) return true;
  try { const url = new URL(/^https?:\/\//i.test(clean) ? clean : `https://${clean}`); return /(^|\.)instagram\.com$/i.test(url.hostname) && /^\/[a-zA-Z0-9._]+\/?$/.test(url.pathname); } catch { return false; }
}

function validWebsite(value: string) {
  if (!value.trim()) return true;
  try { const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); return Boolean(url.hostname.includes(".")); } catch { return false; }
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState({ nombre: "", rubro: "", descripcion: "", ubicacion: "", webUrl: "", instagramHandle: "", noWeb: false, noInstagram: false, otrosCanales: "", objetivo: "", objetivoCustom: "", magnitud: 20, plazoId: "", plazoCustom: "", presupuestoMarketing: "", capacidadEjecucion: "" });
  const set = (key: string, value: unknown) => setData((current) => ({ ...current, [key]: value }));
  const plazo = PLAZOS.find((item) => item.id === data.plazoId);
  const customTimeframe = data.plazoId === "custom" ? parseCustomTimeframe(data.plazoCustom) : null;
  const plazoDias = customTimeframe?.days ?? plazo?.dias ?? 0;
  const plazoLabel = customTimeframe?.label ?? (data.plazoId === "custom" ? "" : plazo?.label || "");
  const instagramOk = data.noInstagram || validInstagram(data.instagramHandle);
  const websiteOk = data.noWeb || validWebsite(data.webUrl);
  const canContinue = step === 0 ? Boolean(data.nombre.trim() && data.rubro && data.ubicacion.trim()) : step === 1 ? instagramOk && websiteOk : Boolean(data.objetivo && (data.objetivo !== "Otro" || data.objetivoCustom.trim()) && data.plazoId && (data.plazoId !== "custom" || customTimeframe) && data.presupuestoMarketing && data.capacidadEjecucion);

  async function submit() {
    setLoading(true); setError("");
    try {
      const budget = BUDGETS.find((item) => item.value === data.presupuestoMarketing);
      const channels = [data.instagramHandle && !data.noInstagram ? "Instagram" : "", data.webUrl && !data.noWeb ? "Página web" : ""].filter(Boolean);
      const response = await fetch("/api/business", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: data.nombre.trim(), rubro: data.rubro, descripcion: data.descripcion.trim() || undefined, ubicacion: data.ubicacion.trim(), webUrl: data.noWeb ? undefined : data.webUrl.trim() || undefined, instagramHandle: data.noInstagram ? undefined : data.instagramHandle.trim() || undefined, noWebDeclared: data.noWeb, noInstagramDeclared: data.noInstagram, otrosCanales: data.otrosCanales.trim() || undefined, canales: channels, objetivo: data.objetivo === "Otro" ? data.objetivoCustom.trim() : data.objetivo, objetivoCustom: data.objetivo === "Otro" ? data.objetivoCustom.trim() : undefined, magnitud: data.magnitud, plazoDias, plazoLabel, inversionMarketing: budget?.amount ?? null, empleados: data.capacidadEjecucion }) });
      const json = await response.json();
      if (!response.ok) throw new Error(getApiErrorMessage(json, "No pudimos guardar el negocio."));
      setStoredBusinessId(json.businessId); router.push(`/analyze?businessId=${json.businessId}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar el negocio."); } finally { setLoading(false); }
  }

  return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
    <div style={{ padding: "22px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${COLORS.line}` }}><button type="button" onClick={() => router.push("/")} style={{ background: "none", border: "none" }}><BrandMark subtitle={false} /></button><div className="shp-mono" style={{ fontSize: 12.5, color: COLORS.inkSoft }}>Paso {step + 1} de {TOTAL_STEPS}</div></div>
    <div style={{ height: 3, background: COLORS.line }}><div style={{ height: "100%", width: `${((step + 1) / TOTAL_STEPS) * 100}%`, background: COLORS.blue, transition: "width .3s ease" }} /></div>
    <div style={{ flex: 1, display: "flex", justifyContent: "center", padding: "46px 24px" }}><div style={{ width: "100%", maxWidth: 580 }} className="shp-fadeup" key={step}>
      {step === 0 && <><h1 className="shp-display" style={{ fontSize: 28, marginBottom: 7 }}>Contanos lo esencial</h1><p style={{ color: COLORS.inkSoft, marginBottom: 26 }}>Con esto podemos empezar a buscar el negocio y sus canales.</p><Field label="Nombre"><TextInput value={data.nombre} onChange={(value) => set("nombre", value)} /></Field><Field label="Rubro"><TextInput value={data.rubro} onChange={(value) => set("rubro", value)} /></Field><Field label="Ciudad o zona"><TextInput value={data.ubicacion} onChange={(value) => set("ubicacion", value)} /></Field><Field label="Descripción breve (opcional)" hint="Una frase sobre lo que ofrecés alcanza."><TextArea value={data.descripcion} onChange={(value) => set("descripcion", value)} rows={3} /></Field></>}
      {step === 1 && <><h1 className="shp-display" style={{ fontSize: 28, marginBottom: 7 }}>¿Dónde podemos encontrarte?</h1><p style={{ color: COLORS.inkSoft, marginBottom: 26 }}>Podés completar uno, ambos o ninguno. NUVRA buscará el resto automáticamente.</p><Field label="Instagram @usuario o URL" hint={data.noInstagram ? "Este campo está apagado porque indicaste que no tenés Instagram." : !instagramOk ? "Ingresá un usuario o una URL de perfil válida." : "Usaremos este dato para identificar correctamente el perfil."}><TextInput disabled={data.noInstagram} value={data.instagramHandle} onChange={(value) => set("instagramHandle", value)} /></Field><button type="button" aria-pressed={data.noInstagram} onClick={() => setData((current) => ({ ...current, noInstagram: !current.noInstagram, instagramHandle: !current.noInstagram ? "" : current.instagramHandle }))} style={{ border: 0, background: "none", color: COLORS.blueDeep, fontSize: 13, margin: "-10px 0 22px" }}>{data.noInstagram ? "Sí tengo Instagram" : "No tengo Instagram"}</button><Field label="Página web" hint={data.noWeb ? "Este campo está apagado porque indicaste que no tenés página web." : !websiteOk ? "Ingresá una dirección web válida." : undefined}><TextInput disabled={data.noWeb} value={data.webUrl} onChange={(value) => set("webUrl", value)} /></Field><button type="button" aria-pressed={data.noWeb} onClick={() => setData((current) => ({ ...current, noWeb: !current.noWeb, webUrl: !current.noWeb ? "" : current.webUrl }))} style={{ border: 0, background: "none", color: COLORS.blueDeep, fontSize: 13, margin: "-10px 0 22px" }}>{data.noWeb ? "Sí tengo página web" : "No tengo página web"}</button><Field label="Otros canales o información (opcional)" hint="Escribilo con tus palabras."><TextArea value={data.otrosCanales} onChange={(value) => set("otrosCanales", value)} rows={3} /></Field></>}
      {step === 2 && <><h1 className="shp-display" style={{ fontSize: 28, marginBottom: 7 }}>¿Qué querés conseguir?</h1><p style={{ color: COLORS.inkSoft, marginBottom: 24 }}>NUVRA va a ordenar el análisis y las acciones alrededor de este objetivo.</p><ChoiceGrid options={OBJETIVOS} value={data.objetivo} onChange={(value) => set("objetivo", value)} />{data.objetivo === "Otro" && <div style={{ marginTop: 16 }}><Field label="Contanos el objetivo"><TextInput value={data.objetivoCustom} onChange={(value) => set("objetivoCustom", value)} /></Field></div>}<div style={{ marginTop: 24 }}><Field label="¿Cuánto te gustaría mejorar?"><div style={{ textAlign: "center", marginBottom: 8, fontWeight: 700, color: COLORS.blue }}>+{data.magnitud}%</div><input type="range" min={5} max={60} value={data.magnitud} onChange={(event) => set("magnitud", Number(event.target.value))} style={{ width: "100%", accentColor: COLORS.blue }} /></Field><Field label="¿En cuánto tiempo?"><ChoiceGrid options={PLAZOS.map((item) => item.label)} value={data.plazoId === "custom" ? "Otro" : plazoLabel} onChange={(label) => set("plazoId", PLAZOS.find((item) => item.label === label)?.id || "")} /></Field>{data.plazoId === "custom" && <Field label="Plazo personalizado" hint={data.plazoCustom && !customTimeframe ? "Escribí una duración como 45 días, 6 semanas, 5 meses o 1 año." : "Podés usar días, semanas, meses o años."}><TextInput value={data.plazoCustom} onChange={(value) => set("plazoCustom", value)} /></Field>}<Field label="Presupuesto aproximado"><ChoiceGrid options={BUDGETS.map((item) => item.label)} value={BUDGETS.find((item) => item.value === data.presupuestoMarketing)?.label || ""} onChange={(label) => set("presupuestoMarketing", BUDGETS.find((item) => item.label === label)?.value || "")} /></Field><Field label="¿Quién puede llevar adelante las acciones?"><ChoiceGrid options={CAPACITIES} value={data.capacidadEjecucion} onChange={(value) => set("capacidadEjecucion", value)} /></Field></div>{error && <p style={{ color: COLORS.red, fontSize: 14, marginTop: 18 }}>{error}</p>}</>}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 36 }}><Btn variant="ghost" onClick={() => step === 0 ? router.push("/") : setStep(step - 1)}>Atrás</Btn>{step < TOTAL_STEPS - 1 ? <Btn variant="primary" disabled={!canContinue} onClick={() => setStep(step + 1)}>Continuar</Btn> : <Btn variant="accent" disabled={!canContinue || loading} onClick={submit}>{loading ? "Guardando..." : "Analizar mi negocio"}</Btn>}</div>
    </div></div>
  </div>;
}
