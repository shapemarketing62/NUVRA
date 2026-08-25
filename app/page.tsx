"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { COLORS } from "@/lib/design-tokens";
import { Btn, BrandMark } from "@/components/ui";
import { setDemoMode } from "@/lib/session";

export default function LandingPage() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);
  const demo = () => { setDemoMode(); router.push("/dashboard"); };
  const steps = [
    ["01", "El punto de partida", "Contanos qué hace el negocio, dónde está y qué quiere lograr."],
    ["02", "Una lectura completa", "NUVRA organiza la información pública y detecta qué está funcionando."],
    ["03", "Las prioridades", "Recibí un diagnóstico claro sobre qué frena hoy el objetivo."],
    ["04", "El plan", "Avanzá con acciones específicas y medibles para tu situación."],
  ];
  return <div style={{ minHeight: "100vh" }}>
    <nav style={{ position:"sticky", top:0, zIndex:40, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px clamp(16px,4vw,52px)", background:"rgba(244,243,239,.94)", backdropFilter:"blur(10px)", borderBottom:scrolled ? "1px solid "+COLORS.line : "1px solid transparent" }}>
      <BrandMark />
      <div style={{ display:"flex", gap:8 }}><Btn variant="ghost" size="sm" onClick={demo}>Ver demo</Btn><Btn size="sm" onClick={() => router.push("/onboarding")}>Empezar</Btn></div>
    </nav>
    <main>
      <section className="landing-hero">
        <div><div style={{ width:52, height:2, background:COLORS.blue, marginBottom:28 }} /><h1 className="shp-display" style={{ fontSize:"clamp(44px,6vw,76px)", fontWeight:600, letterSpacing:"-.055em", lineHeight:1.02, maxWidth:780 }}>Entender el negocio.<br />Decidir con claridad.</h1></div>
        <div><p style={{ fontSize:17, lineHeight:1.65, color:COLORS.inkSoft }}>NUVRA convierte la presencia del negocio en un diagnóstico y un plan de acción concreto para alcanzar su objetivo.</p><div style={{ display:"flex", gap:9, marginTop:28, flexWrap:"wrap" }}><Btn size="lg" onClick={() => router.push("/onboarding")}>Analizar mi negocio</Btn><Btn variant="ghost" size="lg" onClick={() => document.getElementById("como-funciona")?.scrollIntoView({ behavior:"smooth" })}>Cómo funciona</Btn></div></div>
      </section>
      <section id="como-funciona" style={{ borderTop:"1px solid "+COLORS.line, borderBottom:"1px solid "+COLORS.line, background:COLORS.surface, padding:"72px 24px" }}>
        <div style={{ maxWidth:1120, margin:"0 auto" }}><div className="section-header" style={{ marginBottom:36 }}><div><div className="page-eyebrow">El proceso</div><h2 className="page-title" style={{ fontSize:32 }}>De la información a un plan</h2></div><button onClick={demo} style={{ border:0, background:"none", color:COLORS.blue, fontSize:13, fontWeight:600 }}>Explorar con datos de ejemplo</button></div><div className="landing-steps">{steps.map((item) => <article key={item[0]}><div className="action-number">{item[0]}</div><h3 style={{ fontSize:15, fontWeight:650, marginTop:18 }}>{item[1]}</h3><p className="section-description" style={{ maxWidth:240 }}>{item[2]}</p></article>)}</div></div>
      </section>
    </main>
    <footer style={{ maxWidth:1120, margin:"0 auto", padding:"30px 24px", display:"flex", justifyContent:"space-between", fontSize:12, color:COLORS.inkFaint }}><span>NUVRA by Shape</span><span>Diagnóstico y estrategia de negocio</span></footer>
  </div>;
}
