"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { COLORS } from "@/lib/design-tokens";
import { Btn, BrandMark } from "@/components/ui";
import { setDemoMode } from "@/lib/session";

export default function LandingPage() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  const steps = [
    { n: "01", t: "Contanos sobre tu negocio", d: "Rubro, ubicación, web, objetivo y plazo." },
    { n: "02", t: "Nuvra analiza tu presencia digital", d: "Análisis real de tu sitio web con evidencia verificable." },
    { n: "03", t: "Obtené tu Nuvra Score", d: "Puntuación personalizada según tu objetivo comercial." },
    { n: "04", t: "Recibí diagnóstico y estrategia", d: "Prioridades y acciones adaptadas a tu situación." },
  ];

  return (
    <div style={{ minHeight: "100vh" }}>
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 32px",
          background: "rgba(247,247,245,0.9)",
          backdropFilter: "blur(10px)",
          borderBottom: `1px solid ${scrolled ? COLORS.line : "transparent"}`,
        }}
      >
        <BrandMark />
        <div style={{ display: "flex", gap: 14 }}>
          <Btn variant="ghost" size="sm" onClick={() => { setDemoMode(); router.push("/dashboard"); }}>
            Probar demo
          </Btn>
          <Btn variant="primary" size="sm" onClick={() => router.push("/onboarding")}>
            Comenzar diagnóstico
          </Btn>
        </div>
      </nav>

      <section style={{ maxWidth: 720, margin: "0 auto", textAlign: "center", padding: "90px 24px 40px" }}>
        <span
          className="shp-mono"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12.5,
            color: COLORS.blue,
            background: COLORS.blueSoft,
            padding: "6px 12px",
            borderRadius: 999,
            marginBottom: 26,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.blue }} />
          Diagnóstico y estrategia de marketing
        </span>
        <h1 className="shp-display" style={{ fontSize: "clamp(34px,5vw,52px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.08, marginBottom: 20 }}>
          Entendé tu negocio.
          <br />
          <span style={{ color: COLORS.blue }}>NUVRA</span> diseña el camino.
        </h1>
        <p style={{ fontSize: 17.5, color: COLORS.inkSoft, lineHeight: 1.55, maxWidth: 520, margin: "0 auto 34px" }}>
          Analizamos tu presencia digital real, calculamos tu Nuvra Score y generamos una estrategia personalizada para alcanzar tu objetivo.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", marginBottom: 16 }}>
          <Btn variant="primary" size="lg" onClick={() => router.push("/onboarding")}>
            Comenzar diagnóstico
          </Btn>
          <Btn variant="ghost" size="lg" onClick={() => document.getElementById("como-funciona")?.scrollIntoView({ behavior: "smooth" })}>
            Ver cómo funciona
          </Btn>
        </div>
        <div style={{ fontSize: 13, color: COLORS.inkFaint }}>
          by Shape ·{" "}
          <button
            onClick={() => { setDemoMode(); router.push("/dashboard"); }}
            style={{ background: "none", border: "none", color: COLORS.blue, cursor: "pointer", fontSize: 13, textDecoration: "underline" }}
          >
            probá la demo con datos de ejemplo
          </button>
        </div>
      </section>

      <section id="como-funciona" style={{ background: COLORS.paperDim, borderTop: `1px solid ${COLORS.line}`, borderBottom: `1px solid ${COLORS.line}`, padding: "70px 24px" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 0, border: `1px solid ${COLORS.line}`, borderRadius: 16, overflow: "hidden", background: "#fff" }}>
          {steps.map((s, i) => (
            <div key={s.n} style={{ padding: "30px 26px", borderRight: i < 3 ? `1px solid ${COLORS.line}` : "none" }}>
              <div className="shp-mono" style={{ fontSize: 12, color: COLORS.blue, marginBottom: 16 }}>{s.n}</div>
              <h4 style={{ fontSize: 15.5, fontWeight: 600, marginBottom: 8 }}>{s.t}</h4>
              <p style={{ fontSize: 13.5, color: COLORS.inkSoft, lineHeight: 1.5 }}>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer style={{ borderTop: `1px solid ${COLORS.line}`, padding: "28px 24px", textAlign: "center", fontSize: 13, color: COLORS.inkFaint }}>
        © 2026 NUVRA by Shape — Diagnóstico y estrategia de marketing
      </footer>
    </div>
  );
}
