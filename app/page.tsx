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
    ["Contexto", "El punto de partida", "Contanos qué hace el negocio, dónde está y qué quiere lograr."],
    ["Lectura", "Una mirada completa", "NUVRA organiza la información pública y detecta qué está funcionando."],
    ["Decisión", "Las prioridades", "Recibí un diagnóstico claro sobre qué frena hoy el objetivo."],
    ["Ejecución", "El plan", "Avanzá con acciones específicas y medibles para tu situación."],
  ];
  return <div style={{ minHeight: "100vh" }}>
    <nav className={`landing-nav ${scrolled ? "landing-nav-scrolled" : ""}`}>
      <BrandMark />
      <div style={{ display:"flex", gap:8 }}><Btn variant="ghost" size="sm" onClick={demo}>Ver demo</Btn><Btn size="sm" onClick={() => router.push("/onboarding")}>Empezar</Btn></div>
    </nav>
    <main>
      <section className="landing-hero">
        <div><div className="landing-hero-mark" /><h1 className="shp-display" style={{ fontSize:"clamp(48px,6.5vw,82px)", fontWeight:500, letterSpacing:"-.045em", lineHeight:.98, maxWidth:780 }}>Entender el negocio.<br /><em>Decidir con claridad.</em></h1></div>
        <div><p style={{ fontSize:17, lineHeight:1.65, color:COLORS.inkSoft }}>NUVRA convierte la presencia del negocio en un diagnóstico y un plan de acción concreto para alcanzar su objetivo.</p><div style={{ display:"flex", gap:9, marginTop:28, flexWrap:"wrap" }}><Btn size="lg" onClick={() => router.push("/onboarding")}>Analizar mi negocio</Btn><Btn variant="ghost" size="lg" onClick={() => document.getElementById("como-funciona")?.scrollIntoView({ behavior:"smooth" })}>Cómo funciona</Btn></div></div>
      </section>
      <section id="como-funciona" className="landing-section landing-section-surface">
        <div className="landing-section-inner"><div className="section-header" style={{ marginBottom:36 }}><div><div className="page-eyebrow">Cómo trabaja NUVRA</div><h2 className="page-title" style={{ fontSize:36 }}>De la información a un plan</h2></div><button onClick={demo} style={{ border:0, background:"none", color:COLORS.blue, fontSize:13, fontWeight:600 }}>Explorar con datos de ejemplo</button></div><div className="landing-steps">{steps.map((item) => <article key={item[0]}><div className="stage-label">{item[0]}</div><h3 className="shp-display" style={{ fontSize:19, fontWeight:500, marginTop:16 }}>{item[1]}</h3><p className="section-description" style={{ maxWidth:240 }}>{item[2]}</p></article>)}</div></div>
      </section>
      <section className="landing-section landing-section-sand"><div className="landing-section-inner"><div className="section-header" style={{marginBottom:34}}><div><div className="page-eyebrow">Una lectura útil</div><h2 className="page-title" style={{fontSize:36}}>Lo importante, en el orden correcto</h2></div></div><div className="landing-value-grid"><article className="landing-value"><strong>Diagnóstico</strong><h3 className="section-title" style={{fontSize:20}}>Qué está pasando</h3><p className="section-description">Una conclusión respaldada por las señales reales del negocio.</p></article><article className="landing-value"><strong>Prioridad</strong><h3 className="section-title" style={{fontSize:20}}>Qué conviene resolver primero</h3><p className="section-description">El punto con mayor impacto sobre el objetivo que querés alcanzar.</p></article><article className="landing-value"><strong>Acción</strong><h3 className="section-title" style={{fontSize:20}}>Cómo avanzar</h3><p className="section-description">Un plan concreto, medible y posible para tu capacidad actual.</p></article></div></div></section>
      <section className="landing-section landing-section-surface"><div className="landing-section-inner"><div className="landing-cta"><div><div className="stage-label" style={{color:"var(--n-copper-light)"}}>Tu próximo paso</div><h2 className="shp-display" style={{fontSize:"clamp(28px,4vw,42px)",fontWeight:500,marginTop:10}}>Empezá por entender qué necesita hoy tu negocio.</h2><p style={{fontSize:14,lineHeight:1.65,marginTop:12,maxWidth:620}}>NUVRA organiza la información disponible y la convierte en decisiones claras.</p></div><Btn size="lg" onClick={() => router.push("/onboarding")}>Analizar mi negocio</Btn></div></div></section>
    </main>
    <footer className="landing-footer"><div style={{ maxWidth:1120, margin:"0 auto", padding:"30px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:24, fontSize:12, color:COLORS.inkFaint }}><BrandMark subtitle={false}/><span>Diagnóstico y estrategia de negocio</span></div></footer>
  </div>;
}
