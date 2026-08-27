"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, BrandMark } from "@/components/ui";

export default function LandingPage() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);
  const steps = [
    ["Contexto", "El punto de partida", "Contanos qué hace el negocio, dónde está y qué quiere lograr."],
    ["Lectura", "Una mirada completa", "NUVRA organiza la información pública y detecta qué está funcionando."],
    ["Decisión", "Las prioridades", "Recibí un diagnóstico claro sobre qué frena hoy el objetivo."],
    ["Ejecución", "El plan", "Avanzá con acciones específicas y medibles para tu situación."],
  ];
  return <div className="landing-home">
    <nav className={`landing-nav ${scrolled ? "landing-nav-scrolled" : ""}`}>
      <BrandMark />
      <div className="landing-nav-actions">
        <a className="landing-nav-link landing-nav-link-secondary" href="#como-funciona">Cómo funciona</a>
        <a className="landing-nav-link landing-nav-link-secondary" href="/pricing">Precios</a>
        <a className="landing-nav-link" href="/login">Iniciar sesión</a>
        <Btn size="sm" onClick={() => router.push("/onboarding")}>Empezar</Btn>
      </div>
    </nav>
    <main>
      <section className="landing-hero">
        <div className="landing-hero-structure" aria-hidden="true"><span /><span /><span /></div>
        <div className="landing-hero-copy"><div className="landing-hero-mark" /><h1 className="shp-display">Una nueva forma de entender y <em>hacer crecer tu negocio.</em></h1></div>
        <div className="landing-hero-aside"><p>Hacé el diagnóstico de tu empresa gratis. Descubrí tus oportunidades de mejora y trabajá con NUVRA para convertirlas en una estrategia de crecimiento.</p><div className="landing-hero-actions"><Btn size="lg" onClick={() => router.push("/onboarding")}>Hacer mi diagnóstico gratis</Btn><a className="landing-text-link" href="#como-funciona">Conocer el proceso</a></div></div>
      </section>
      <section id="como-funciona" className="landing-section landing-section-surface">
        <div className="landing-section-inner"><div className="landing-section-heading"><div className="page-eyebrow">Cómo trabaja NUVRA</div><h2 className="page-title">De la información a un plan</h2><p>Primero entendemos el contexto. Después ordenamos lo que importa para decidir y avanzar.</p></div><div className="landing-steps">{steps.map((item) => <article key={item[0]}><div className="stage-label">{item[0]}</div><h3 className="shp-display">{item[1]}</h3><p className="section-description">{item[2]}</p></article>)}</div></div>
      </section>
      <section className="landing-section landing-section-sand"><div className="landing-section-inner landing-value-section"><div className="landing-section-heading"><div className="page-eyebrow">Una lectura útil</div><h2 className="page-title">Lo importante, en el orden correcto</h2></div><div className="landing-value-grid"><article className="landing-value"><strong>Diagnóstico</strong><h3 className="section-title">Qué está pasando</h3><p className="section-description">Una conclusión respaldada por las señales reales del negocio.</p></article><article className="landing-value"><strong>Prioridad</strong><h3 className="section-title">Qué conviene resolver primero</h3><p className="section-description">El punto con mayor impacto sobre el objetivo que querés alcanzar.</p></article><article className="landing-value"><strong>Acción</strong><h3 className="section-title">Cómo avanzar</h3><p className="section-description">Un plan concreto, medible y posible para tu capacidad actual.</p></article></div></div></section>
      <section className="landing-section landing-section-muted"><div className="landing-section-inner"><div className="landing-cta"><div><div className="stage-label">Tu próximo paso</div><h2 className="shp-display">Empezá por entender qué necesita hoy tu negocio.</h2><p>NUVRA organiza la información disponible y la convierte en decisiones claras.</p></div><Btn className="landing-cta-button" size="lg" onClick={() => router.push("/onboarding")}>Analizar mi negocio</Btn></div></div></section>
    </main>
    <footer className="landing-footer"><div className="landing-footer-inner"><BrandMark subtitle={false}/><span>Diagnóstico y estrategia para negocios reales.</span></div></footer>
  </div>;
}
