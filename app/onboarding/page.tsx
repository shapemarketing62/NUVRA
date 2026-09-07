"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COLORS } from "@/lib/design-tokens";
import { Btn, BrandMark, Field, TextInput, TextArea } from "@/components/ui";
import { PLAZOS } from "@/lib/utils";
import { setStoredBusinessId } from "@/lib/session";
import { getApiErrorMessage } from "@/lib/api-client";
import { parseCustomTimeframe } from "@/lib/timeframe";
import { GoalInterpreter } from "@/services/intelligence/goal-interpreter";
import { onboardingV2Schema, PRESUPUESTO_OPTIONS, CAPACIDAD_OPTIONS, OBJETIVOS_OPTIONS, PLAZO_OPTIONS, TIPO_CLIENTE_OPTIONS, CAPACIDAD_COMERCIAL_OPTIONS } from "@/lib/onboarding-v2-schema";
import { getClarificationQuestions } from "@/services/onboarding/clarification-adapter";

const TOTAL_STEPS = 3;

type OnboardingPhase = "form" | "discovery" | "confirmation" | "clarification" | "submitting";

type AssetCorrection = "confirmed" | "rejected" | "needs_update";

type DiscoveryAsset = {
  key: "web" | "instagram" | "tiktok" | "maps";
  label: string;
  value: string;
  status: "found" | "not_found" | "not_confirmed";
  correction: AssetCorrection;
  userValue?: string;
};

type ClarificationQuestion = {
  id: string;
  question: string;
  reason: string;
  impact: "high" | "medium" | "low";
  type: "single" | "multiple" | "text";
  options?: string[];
  affects: string;
};

function ChoiceGrid({ options, value, onChange, columns = 2 }: { options: readonly string[] | readonly { label: string; value: string }[]; value: string; onChange: (value: string) => void; columns?: number }) {
  const items = options.map((o) => (typeof o === "string" ? { label: o, value: o } : o));
  return <div className="choice-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{items.map((option) => <button key={option.value} type="button" onClick={() => onChange(option.value)} className={`choice ${value === option.value ? "choice-active" : ""}`} aria-pressed={value === option.value}>{option.label}</button>)}</div>;
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
  const [phase, setPhase] = useState<OnboardingPhase>("form");
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [discovery, setDiscovery] = useState<DiscoveryAsset[] | null>(null);
  const [clarifications, setClarifications] = useState<ClarificationQuestion[]>([]);
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({});
  const [data, setData] = useState({
    nombre: "", rubro: "", ubicacion: "", tipoCliente: "B2C" as "B2C" | "B2B" | "Ambos",
    webUrl: "", instagramHandle: "", noWeb: false, noInstagram: false,
    objetivo: "", objetivoLabel: "", plazoDias: 90, plazoLabel: "3 meses",
    presupuesto: "prefiero_no_decir", capacidad: "self", capacidadComercial: "no_se", limitaciones: "",
  });

  const set = (key: string, value: unknown) => setData((current) => ({ ...current, [key]: value }));
  const instagramOk = data.noInstagram || validInstagram(data.instagramHandle);
  const websiteOk = data.noWeb || validWebsite(data.webUrl);
  const goalInterpretation = data.objetivo.trim().length >= 4 ? GoalInterpreter.interpret(data.objetivo) : null;

  const canContinueStep0 = Boolean(data.nombre.trim() && data.rubro && data.ubicacion.trim());
  const canContinueStep1 = instagramOk && websiteOk;
  const canContinueStep2 = Boolean(data.objetivo.trim().length >= 4 && data.plazoDias > 0 && data.presupuesto && data.capacidad);
  const canContinue = step === 0 ? canContinueStep0 : step === 1 ? canContinueStep1 : canContinueStep2;

  const isOnlineBusiness = /online|ecommerce|tienda online|saas|software/i.test(data.rubro.toLowerCase()) || /online/i.test(data.ubicacion.toLowerCase());

  async function runDiscovery() {
    setPhase("discovery");
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1800));
    const assets: DiscoveryAsset[] = [];
    if (!data.noWeb && data.webUrl.trim()) {
      assets.push({ key: "web", label: "Sitio web", value: data.webUrl.trim(), status: "found", correction: "confirmed" });
    } else if (!data.noWeb) {
      assets.push({ key: "web", label: "Sitio web", value: `https://${data.nombre.toLowerCase().replace(/[^a-z0-9]/g, "")}.com.ar`, status: "not_confirmed", correction: "rejected" });
    }
    if (!data.noInstagram && data.instagramHandle.trim()) {
      const handle = data.instagramHandle.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/$/, "");
      assets.push({ key: "instagram", label: "Instagram", value: `@${handle}`, status: "found", correction: "confirmed" });
    } else if (!data.noInstagram) {
      assets.push({ key: "instagram", label: "Instagram", value: `${data.nombre.toLowerCase().replace(/[^a-z0-9]/g, "")}_oficial`, status: "not_confirmed", correction: "rejected" });
    }
    assets.push({ key: "tiktok", label: "TikTok", value: `${data.nombre.toLowerCase().replace(/[^a-z0-9]/g, "")}`, status: "not_confirmed", correction: "rejected" });
    if (!isOnlineBusiness) {
      assets.push({ key: "maps", label: "Google Maps", value: data.ubicacion, status: "not_confirmed", correction: "rejected" });
    }
    setDiscovery(assets);
    setPhase("confirmation");
    setLoading(false);
  }

  function updateAssetCorrection(key: DiscoveryAsset["key"], correction: AssetCorrection, userValue?: string) {
    setDiscovery((current) => current?.map((asset) => asset.key === key ? { ...asset, correction, userValue } : asset) || null);
  }

  function getConfirmedAssets() {
    return discovery?.filter((a) => a.correction === "confirmed") || [];
  }

  async function runClarification() {
    const confirmedAssets = getConfirmedAssets();
    const questions = getClarificationQuestions({
      objetivo: data.objetivo,
      rubro: data.rubro,
      hasInstagram: confirmedAssets.some((a) => a.key === "instagram"),
      hasWebsite: confirmedAssets.some((a) => a.key === "web"),
      hasLocation: data.ubicacion.trim().length > 0,
      businessModel: isOnlineBusiness ? "online" : "local",
      dimensions: [
        { slug: "presencia", confidence: "INSUFICIENTE" },
        { slug: "conversion", confidence: "BAJA" },
        { slug: "propuesta", confidence: "INSUFICIENTE" },
      ],
      findings: [
        { category: "conversion", title: "Falta claridad en el paso principal" },
        { category: "propuesta", title: "La oferta no se explica con claridad" },
      ],
      declaredChannels: [data.instagramHandle && !data.noInstagram ? "Instagram" : "", data.webUrl && !data.noWeb ? "Página web" : ""].filter(Boolean),
      observedChannels: confirmedAssets.map((a) => a.label),
    });
    setClarifications(questions);
    setPhase(questions.length > 0 ? "clarification" : "submitting");
  }

  async function submit() {
    setPhase("submitting");
    setLoading(true);
    setError("");
    try {
      const budget = PRESUPUESTO_OPTIONS.find((item) => item.value === data.presupuesto);
      const confirmedAssets = getConfirmedAssets();
      const channels = confirmedAssets.filter((a) => a.key === "instagram" || a.key === "web").map((a) => a.label);
      const response = await fetch("/api/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: data.nombre.trim(),
          rubro: data.rubro,
          descripcion: data.limitaciones?.trim() || undefined,
          ubicacion: data.ubicacion.trim(),
          tipoCliente: data.tipoCliente,
          webUrl: data.noWeb ? undefined : data.webUrl.trim() || undefined,
          instagramHandle: data.noInstagram ? undefined : data.instagramHandle.trim() || undefined,
          noWebDeclared: data.noWeb,
          noInstagramDeclared: data.noInstagram,
          otrosCanales: channels.join(", "),
          canales: channels,
          objetivo: data.objetivo.trim(),
          objetivoCustom: data.objetivoLabel !== data.objetivo.trim() ? data.objetivoLabel : undefined,
          magnitud: 20,
          plazoDias: data.plazoDias,
          plazoLabel: data.plazoLabel,
          inversionMarketing: budget?.amount ?? null,
          empleados: CAPACIDAD_OPTIONS.find((c) => c.value === data.capacidad)?.label || data.capacidad,
          capacidadComercial: data.capacidadComercial || undefined,
          limitaciones: data.limitaciones?.trim() || undefined,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(getApiErrorMessage(json, "No pudimos guardar el negocio."));
      setStoredBusinessId(json.businessId);
      if (discovery && discovery.length > 0) {
        const payload = discovery.map((a) => ({ key: a.key, observedValue: a.value, userConfirmation: a.correction, userValue: a.userValue }));
        try { sessionStorage.setItem("nuvra_asset_decisions", JSON.stringify(payload)); } catch {}
        await fetch("/api/onboarding/decisions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId: json.businessId, assets: payload }) }).catch(() => {});
      }
      router.push(`/analyze?businessId=${json.businessId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos guardar el negocio.");
      setPhase("confirmation");
    } finally {
      setLoading(false);
    }
  }

  const canConfirm = discovery !== null && getConfirmedAssets().length > 0;

  return <div className="onboarding-shell">
    <div className="onboarding-topbar">
      <button type="button" onClick={() => router.push("/")} style={{ background: "none", border: "none" }}><BrandMark subtitle={false} /></button>
      {phase === "form" && <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>Paso {step + 1} de {TOTAL_STEPS}</div>}
    </div>
    {phase === "form" && <div className="onboarding-progress"><div style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }} /></div>}
    <div className="onboarding-content">
      <div className="onboarding-form shp-fadeup" key={phase + step}>
        {phase === "form" && step === 0 && <>
          <h1 className="shp-display" style={{ fontSize: 28, marginBottom: 7 }}>Empecemos por tu negocio</h1>
          <p style={{ color: COLORS.inkSoft, marginBottom: 26 }}>Con algunos datos básicos, NUVRA puede investigar el resto.</p>
          <Field label="Nombre del negocio"><TextInput value={data.nombre} onChange={(value) => set("nombre", value)} placeholder="Ej: Clínica Sur" /></Field>
          <Field label="¿A qué se dedica?"><TextInput value={data.rubro} onChange={(value) => set("rubro", value)} placeholder="Odontología estética, restaurante, gimnasio..." /></Field>
          <Field label="¿Dónde trabaja principalmente tu negocio?" hint={isOnlineBusiness ? "Podés escribir Online si tu negocio no tiene local físico." : "Ciudad, barrio o zona."}><TextInput value={data.ubicacion} onChange={(value) => set("ubicacion", value)} placeholder={isOnlineBusiness ? "Online" : "Palermo, Buenos Aires"} /></Field>
          <Field label="¿A quién le vendés principalmente?">
            <ChoiceGrid options={TIPO_CLIENTE_OPTIONS} value={data.tipoCliente} onChange={(value) => set("tipoCliente", value)} columns={3} />
          </Field>
          <div style={{ marginTop: 28, border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 18, background: COLORS.surfaceMuted }}>
            <p style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 12, color: COLORS.ink }}>¿Querés ayudarnos a encontrarlo más rápido?</p>
            <p style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 14 }}>Si los tenés a mano, podés agregarlos. Si no, NUVRA intentará encontrarlos.</p>
            <Field label="Sitio web (opcional)"><TextInput disabled={data.noWeb} value={data.webUrl} onChange={(value) => set("webUrl", value)} placeholder="https://..." /></Field>
            <button type="button" aria-pressed={data.noWeb} onClick={() => setData((current) => ({ ...current, noWeb: !current.noWeb, webUrl: !current.noWeb ? "" : current.webUrl }))} style={{ border: 0, background: "none", color: COLORS.blueDeep, fontSize: 13, margin: "-10px 0 18px" }}>{data.noWeb ? "Sí tengo página web" : "No tengo página web"}</button>
            <Field label="Instagram (opcional)"><TextInput disabled={data.noInstagram} value={data.instagramHandle} onChange={(value) => set("instagramHandle", value)} placeholder="@usuario o URL" /></Field>
            <button type="button" aria-pressed={data.noInstagram} onClick={() => setData((current) => ({ ...current, noInstagram: !current.noInstagram, instagramHandle: !current.noInstagram ? "" : current.instagramHandle }))} style={{ border: 0, background: "none", color: COLORS.blueDeep, fontSize: 13, margin: "-10px 0 10px" }}>{data.noInstagram ? "Sí tengo Instagram" : "No tengo Instagram"}</button>
          </div>
        </>}

        {phase === "form" && step === 1 && <>
          <h1 className="shp-display" style={{ fontSize: 28, marginBottom: 7 }}>¿Qué querés mejorar?</h1>
          <p style={{ color: COLORS.inkSoft, marginBottom: 24 }}>Elegí el objetivo que más se parezca a lo que querés conseguir.</p>
          <div style={{ marginBottom: 22 }}>
            <Field label="Objetivo principal">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {OBJETIVOS_OPTIONS.map((option) => <button key={option.value} type="button" onClick={() => { set("objetivoLabel", option.value); if (option.value !== "Otro") set("objetivo", option.value); }} className={`choice ${data.objetivoLabel === option.value ? "choice-active" : ""}`} aria-pressed={data.objetivoLabel === option.value}>{option.label}</button>)}
              </div>
            </Field>
            {data.objetivoLabel === "Otro" && <Field label="Contanos brevemente"><TextArea value={data.objetivo} onChange={(value) => set("objetivo", value)} rows={3} placeholder="Ej: conseguir más consultas por WhatsApp" /></Field>}
            {goalInterpretation?.clarificationQuestion && data.objetivo.trim().length >= 4 && <p style={{ color: COLORS.inkSoft, fontSize: 13, lineHeight: 1.5, marginTop: 8 }}>{goalInterpretation.clarificationQuestion}</p>}
          </div>
          <Field label="¿En cuánto tiempo te gustaría ver avances?">
            <ChoiceGrid options={PLAZOS.map((p) => p.label)} value={data.plazoLabel} onChange={(label) => { const found = PLAZOS.find((p) => p.label === label); if (found) { set("plazoLabel", found.label); set("plazoDias", found.dias); } }} columns={2} />
          </Field>
        </>}

        {phase === "form" && step === 2 && <>
          <h1 className="shp-display" style={{ fontSize: 28, marginBottom: 7 }}>Tu realidad hoy</h1>
          <p style={{ color: COLORS.inkSoft, marginBottom: 24 }}>Para recomendarte algo que realmente puedas hacer.</p>
          <Field label="¿Cuánto podrías invertir por mes en marketing?">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {PRESUPUESTO_OPTIONS.map((option) => <button key={option.value} type="button" onClick={() => set("presupuesto", option.value)} className={`choice ${data.presupuesto === option.value ? "choice-active" : ""}`} aria-pressed={data.presupuesto === option.value}>{option.label}</button>)}
            </div>
          </Field>
          <Field label="¿Quién suele encargarse del marketing?">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {CAPACIDAD_OPTIONS.map((option) => <button key={option.value} type="button" onClick={() => set("capacidad", option.value)} className={`choice ${data.capacidad === option.value ? "choice-active" : ""}`} aria-pressed={data.capacidad === option.value}>{option.label}</button>)}
            </div>
          </Field>
          <Field label="Si mañana recibieras más consultas, ¿podrías atenderlas?">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {CAPACIDAD_COMERCIAL_OPTIONS.map((option) => <button key={option.value} type="button" onClick={() => set("capacidadComercial", option.value)} className={`choice ${data.capacidadComercial === option.value ? "choice-active" : ""}`} aria-pressed={data.capacidadComercial === option.value}>{option.label}</button>)}
            </div>
          </Field>
          <Field label="¿Hay algo importante que NUVRA debería saber?" hint="Opcional. Por ejemplo: poco tiempo, temporada baja, falta de personal..."><TextArea value={data.limitaciones} onChange={(value) => set("limitaciones", value)} rows={3} /></Field>
        </>}

        {phase === "discovery" && <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ width: 42, height: 42, borderRadius: "50%", border: `3px solid ${COLORS.line}`, borderTopColor: COLORS.blue, margin: "0 auto 28px", animation: "shpSpin 0.9s linear infinite" }} />
          <h1 className="shp-display" style={{ fontSize: 28, marginBottom: 12 }}>Preparando tu espacio</h1>
          <p style={{ color: COLORS.inkSoft }}>Esto puede tomar unos segundos...</p>
        </div>}

        {phase === "confirmation" && discovery && <>
          <h1 className="shp-display" style={{ fontSize: 28, marginBottom: 7 }}>Esto es lo que encontramos</h1>
          <p style={{ color: COLORS.inkSoft, marginBottom: 26 }}>Confirmá que estos datos pertenecen a tu negocio.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {discovery.map((asset) => {
              const showCorrection = asset.status === "found" || asset.status === "not_confirmed";
              return <div key={asset.key} className="card" style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div><div style={{ fontWeight: 600 }}>{asset.label}</div><div style={{ fontSize: 13, color: COLORS.inkSoft }}>{asset.value}</div></div>
                  <span className={`badge ${asset.correction === "confirmed" ? "badge-success" : asset.correction === "rejected" ? "badge-neutral" : "badge-warning"}`}>{asset.correction === "confirmed" ? "Confirmado" : asset.correction === "rejected" ? "Pendiente" : "Corregir"}</span>
                </div>
                {showCorrection && <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {asset.key === "web" && <>
                    <button type="button" className={`choice ${asset.correction === "confirmed" ? "choice-active" : ""}`} onClick={() => updateAssetCorrection(asset.key, "confirmed")}>Sí, es mi sitio</button>
                    <button type="button" className={`choice ${asset.correction === "rejected" ? "choice-active" : ""}`} onClick={() => updateAssetCorrection(asset.key, "rejected")}>No es mi sitio</button>
                    <button type="button" className={`choice ${asset.correction === "needs_update" ? "choice-active" : ""}`} onClick={() => { const v = prompt("Ingresá la URL correcta"); if (v) updateAssetCorrection(asset.key, "needs_update", v); }}>Agregar el correcto</button>
                    <button type="button" className={`choice ${asset.correction === "rejected" && !asset.userValue ? "choice-active" : ""}`} onClick={() => updateAssetCorrection(asset.key, "rejected")}>No tengo sitio web</button>
                  </>}
                  {(asset.key === "instagram" || asset.key === "tiktok") && <>
                    <button type="button" className={`choice ${asset.correction === "confirmed" ? "choice-active" : ""}`} onClick={() => updateAssetCorrection(asset.key, "confirmed")}>Sí, es mío</button>
                    <button type="button" className={`choice ${asset.correction === "rejected" ? "choice-active" : ""}`} onClick={() => updateAssetCorrection(asset.key, "rejected")}>No es mío</button>
                    <button type="button" className={`choice ${asset.correction === "needs_update" ? "choice-active" : ""}`} onClick={() => { const v = prompt("Ingresá el usuario correcto"); if (v) updateAssetCorrection(asset.key, "needs_update", v); }}>Usar otro</button>
                    <button type="button" className={`choice ${asset.correction === "rejected" && !asset.userValue ? "choice-active" : ""}`} onClick={() => updateAssetCorrection(asset.key, "rejected")}>No tengo {asset.label}</button>
                  </>}
                  {asset.key === "maps" && <>
                    <button type="button" className={`choice ${asset.correction === "confirmed" ? "choice-active" : ""}`} onClick={() => updateAssetCorrection(asset.key, "confirmed")}>Sí, corresponde</button>
                    <button type="button" className={`choice ${asset.correction === "rejected" ? "choice-active" : ""}`} onClick={() => updateAssetCorrection(asset.key, "rejected")}>No corresponde</button>
                    <button type="button" className={`choice ${asset.correction === "needs_update" ? "choice-active" : ""}`} onClick={() => { const v = prompt("Ingresá la dirección o información de la ficha"); if (v) updateAssetCorrection(asset.key, "needs_update", v); }}>Agregar información</button>
                  </>}
                </div>}
              </div>;
            })}
          </div>
          {error && <p style={{ color: COLORS.red, fontSize: 13, marginTop: 16 }}>{error}</p>}
          <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
            <Btn variant="ghost" onClick={() => { setPhase("form"); setStep(0); setDiscovery(null); }}>Corregir datos</Btn>
            <Btn variant="primary" onClick={runClarification} disabled={!canConfirm}>Todo está bien</Btn>
          </div>
        </>}

        {phase === "clarification" && <>
          <h1 className="shp-display" style={{ fontSize: 28, marginBottom: 7 }}>Últimas preguntas</h1>
          <p style={{ color: COLORS.inkSoft, marginBottom: 26 }}>Solo para ayudarnos a entender mejor tu negocio.</p>
          {clarifications.map((q, i) => <div key={q.id} style={{ marginBottom: 22 }}>
            <Field label={`${i + 1}. ${q.question}`} hint={q.reason}>
              {q.type === "single" && q.options && <ChoiceGrid options={q.options} value={clarificationAnswers[q.id] || ""} onChange={(value) => setClarificationAnswers((current) => ({ ...current, [q.id]: value }))} columns={1} />}
              {q.type === "text" && <TextArea value={clarificationAnswers[q.id] || ""} onChange={(value) => setClarificationAnswers((current) => ({ ...current, [q.id]: value }))} rows={3} />}
            </Field>
          </div>)}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 36 }}>
            <Btn variant="ghost" onClick={() => setPhase("confirmation")}>Atrás</Btn>
            <Btn variant="primary" onClick={submit} disabled={loading}>Continuar</Btn>
          </div>
        </>}

        {phase === "submitting" && <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ width: 42, height: 42, borderRadius: "50%", border: `3px solid ${COLORS.line}`, borderTopColor: COLORS.blue, margin: "0 auto 28px", animation: "shpSpin 0.9s linear infinite" }} />
          <h1 className="shp-display" style={{ fontSize: 28, marginBottom: 12 }}>Investigando tu negocio</h1>
          <p style={{ color: COLORS.inkSoft }}>Ya casi está...</p>
        </div>}
      </div>

      {phase === "form" && <div style={{ display: "flex", justifyContent: "space-between", marginTop: 36 }}>
        <Btn variant="ghost" onClick={() => step === 0 ? router.push("/") : setStep(step - 1)}>Atrás</Btn>
        {step < TOTAL_STEPS - 1 ? <Btn variant="primary" disabled={!canContinue} onClick={() => setStep(step + 1)}>Continuar</Btn> : <Btn variant="accent" disabled={!canContinue || loading} onClick={runDiscovery}>{loading ? "Procesando..." : "Investigar mi negocio"}</Btn>}
      </div>}
    </div>
  </div>;
}
