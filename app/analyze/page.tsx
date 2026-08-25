"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { COLORS } from "@/lib/design-tokens";
import { setStoredBusinessId } from "@/lib/session";
import { getApiErrorMessage } from "@/lib/api-client";

const STEPS = [
  "Revisando presencia pública",
  "Organizando la información",
  "Identificando señales relevantes",
  "Evaluando el estado del negocio",
  "Preparando el diagnóstico",
  "Ordenando las próximas acciones",
];

function AnalyzeContent() {
  const router = useRouter();
  const params = useSearchParams();
  const businessId = params.get("businessId");
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState("");
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    if (!businessId) {
      router.push("/onboarding");
      return;
    }

    setStoredBusinessId(businessId);

    let stepTimer: ReturnType<typeof setInterval>;
    stepTimer = setInterval(() => {
      setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
    }, 4000);

    fetch("/api/analyze/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId }),
    })
      .then(async (res) => {
        clearInterval(stepTimer);
        const json = await res.json();
        if (!res.ok) throw new Error(getApiErrorMessage(json, "No pudimos completar el análisis."));
        setCurrentStep(STEPS.length);
        setScore(json.scoreTotal);
        setTimeout(() => router.push("/dashboard"), 1200);
      })
      .catch((e) => {
        clearInterval(stepTimer);
        setError(e instanceof Error ? e.message : "Error desconocido");
      });

    return () => clearInterval(stepTimer);
  }, [businessId, router]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section style={{ width: "100%", maxWidth: 520, borderTop: `2px solid ${COLORS.blue}`, paddingTop: 28 }} aria-live="polite">
        {!error ? (
          <>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: "50%",
                border: `3px solid ${COLORS.line}`,
                borderTopColor: COLORS.blue,
                margin: "0 0 28px",
                animation: score !== null ? "none" : "shpSpin 0.9s linear infinite",
              }}
            />
            <h1 className="shp-display" style={{ fontSize: 28, fontWeight: 650, marginBottom: 8, letterSpacing: "-.03em" }}>
              {score !== null ? "Análisis completado" : "Analizando tu negocio"}
            </h1>
            {score !== null && (
              <p className="shp-display" style={{ fontSize: 30, fontWeight: 650, color: COLORS.ink, marginBottom: 20 }}>
                Nuvra Score: {score}/100
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 0, textAlign: "left", marginTop: 26, borderTop: `1px solid ${COLORS.line}` }}>
              {STEPS.map((it, i) => (
                <div key={it} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 44, borderBottom: `1px solid ${COLORS.line}`, opacity: i <= currentStep ? 1 : 0.35, transition: "opacity .3s" }}>
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 3,
                      background: i < currentStep || score !== null ? COLORS.olive : i === currentStep ? COLORS.blue : COLORS.line,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      flexShrink: 0,
                    }}
                  >
                    {i < currentStep || score !== null ? "✓" : ""}
                  </span>
                  <span style={{ fontSize: 14.5 }}>{it}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: COLORS.inkFaint, marginTop: 24 }}>
              Este proceso puede tomar unos minutos.
            </p>
          </>
        ) : (
          <div>
            <h2 className="shp-display" style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: COLORS.red }}>
              Error en el análisis
            </h2>
            <p style={{ fontSize: 14, color: COLORS.inkSoft, marginBottom: 24 }}>{error}</p>
            <button
              type="button"
              onClick={() => router.push("/onboarding")}
              style={{ padding: "11px 20px", borderRadius: 999, background: COLORS.ink, color: COLORS.paper, border: "none", cursor: "pointer" }}
            >
              Volver al onboarding
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

export default function AnalyzePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>Cargando...</div>}>
      <AnalyzeContent />
    </Suspense>
  );
}
