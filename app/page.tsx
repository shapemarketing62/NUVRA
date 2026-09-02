"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, BrandMark } from "@/components/ui";
import { ProductFilm } from "@/components/marketing/ProductFilm";

const thinkingSteps = [
  ["Observa", "Reúne las señales que el negocio ya deja en su sitio, redes, búsquedas y otras fuentes disponibles."],
  ["Entiende", "Las interpreta según el rubro, el objetivo, la ubicación, el presupuesto y la capacidad real."],
  ["Prioriza", "Distingue qué merece atención ahora y qué todavía necesita más evidencia."],
  ["Propone", "Convierte la prioridad en una estrategia y en acciones concretas que se puedan medir."],
] as const;

const faqs = [
  ["¿Qué analiza NUVRA?", "Analiza la información que declarás y las fuentes públicas o conectadas que estén disponibles: presencia digital, sitio web, redes, reseñas, menciones y competencia, entre otras."],
  ["¿Necesito tener página web?", "No. NUVRA puede trabajar con las señales disponibles del negocio. Si una fuente no existe o no puede analizarse, no se convierte automáticamente en un puntaje negativo."],
  ["¿Necesito conectar mis redes?", "No para empezar. Las conexiones oficiales permiten ampliar el análisis cuando están disponibles, pero el diagnóstico inicial puede comenzar con información pública y declarada."],
  ["¿Cómo genera una estrategia?", "Relaciona la evidencia observada con el objetivo, el contexto y la capacidad del negocio. Las recomendaciones deben conservar una relación clara con lo que NUVRA encontró."],
  ["¿NUVRA reemplaza una agencia de marketing?", "El plan Pro ayuda a decidir, priorizar y organizar el trabajo. Partner suma acompañamiento y ejecución como servicio. Son propuestas diferentes y se explican con claridad en Planes."],
] as const;

function SignalPath({ compact = false }: { compact?: boolean }) {
  return (
    <svg className={`decision-path ${compact ? "decision-path-compact" : ""}`} viewBox="0 0 1200 150" aria-hidden="true" preserveAspectRatio="none">
      <path className="decision-path-base" d="M18 110H248L350 36H655L748 82H1182" />
      <path className="decision-path-progress" d="M18 110H248L350 36H655L748 82H1182" />
      <circle cx="18" cy="110" r="8" />
      <circle cx="350" cy="36" r="8" />
      <circle cx="748" cy="82" r="8" />
      <circle className="decision-path-end" cx="1182" cy="82" r="10" />
    </svg>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const start = () => router.push("/onboarding");

  return (
    <div className="marketing-home">
      <nav className={`marketing-nav ${scrolled ? "marketing-nav-scrolled" : ""}`} aria-label="Navegación principal">
        <a href="/" aria-label="Ir al inicio"><BrandMark /></a>
        <div className="marketing-nav-links">
          <a href="#producto">Producto</a>
          <a href="#como-funciona">Cómo funciona</a>
          <a href="/pricing">Precios</a>
        </div>
        <div className="marketing-nav-actions">
          <a href="/login">Ingresar</a>
          <Btn size="sm" onClick={start}>Probar NUVRA</Btn>
        </div>
      </nav>

      <main>
        <section className="marketing-hero">
          <div className="marketing-hero-grid">
            <div className="marketing-hero-copy">
              <p className="marketing-kicker">Inteligencia de marketing para negocios reales</p>
              <h1>Una nueva forma de entender y <span>hacer crecer tu negocio</span></h1>
              <p className="marketing-hero-lead">NUVRA analiza tu presencia digital y tu contexto para mostrarte qué está pasando, qué conviene priorizar y cómo avanzar.</p>
              <div className="marketing-hero-actions">
                <Btn size="lg" onClick={start}>Hacer mi diagnóstico gratis</Btn>
                <a href="#producto" className="marketing-inline-link">Ver cómo funciona</a>
              </div>
              <p className="marketing-proofline">Sin inventar datos. Sin convertir una fuente ausente en un problema.</p>
            </div>

            <div className="marketing-hero-signal" aria-label="De las señales a una decisión de marketing">
              <div className="signal-caption signal-caption-a"><span>Sitio y canales</span><strong>Señales</strong></div>
              <div className="signal-caption signal-caption-b"><span>Contexto</span><strong>Interpretación</strong></div>
              <div className="signal-caption signal-caption-c"><span>Impacto</span><strong>Prioridad</strong></div>
              <div className="signal-caption signal-caption-d"><span>Próximo paso</span><strong>Acción</strong></div>
              <SignalPath />
              <div className="signal-result">
                <span>Prioridad actual</span>
                <strong>Saber qué validar antes de invertir más.</strong>
                <small>Negocio demo · escenario ficticio</small>
              </div>
            </div>
          </div>
        </section>

        <section id="producto" className="product-film-section" aria-labelledby="product-film-title">
          <div className="product-film-copy">
            <p className="marketing-kicker">El producto, no una promesa</p>
            <h2 id="product-film-title">NUVRA conecta la información y explica qué significa.</h2>
            <p>No suma paneles por sumar. Organiza señales reales para construir un diagnóstico, una prioridad y un plan posible.</p>
            <div className="product-film-note"><span />Demostración controlada. Los datos reales dependen de cada negocio y de las fuentes disponibles.</div>
          </div>
          <ProductFilm src="/nuvra-product-film.webm" />
        </section>

        <section className="marketing-problem">
          <div className="marketing-problem-label">El problema no suele ser la falta de datos.</div>
          <div className="marketing-problem-copy">
            <h2>Tenés métricas, redes, reseñas y opiniones. Lo difícil es saber <em>qué hacer con todo eso.</em></h2>
            <p>NUVRA conecta esas señales con el objetivo comercial del negocio. Así evita convertir observaciones aisladas en consejos genéricos.</p>
          </div>
          <SignalPath compact />
        </section>

        <section id="como-funciona" className="marketing-thinking" aria-labelledby="thinking-title">
          <header className="marketing-section-heading">
            <p className="marketing-kicker">Cómo piensa NUVRA</p>
            <h2 id="thinking-title">Un recorrido de la evidencia a la acción.</h2>
            <p>Cada conclusión debe poder volver a la señal que la originó.</p>
          </header>
          <div className="thinking-flow">
            <div className="thinking-line" aria-hidden="true"><span /><span /><span /><span /></div>
            {thinkingSteps.map(([title, description]) => (
              <article key={title}>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="marketing-product-story" aria-labelledby="story-title">
          <div className="product-story-heading">
            <p className="marketing-kicker">Una lectura completa</p>
            <h2 id="story-title">Del diagnóstico a un plan que se puede ejecutar.</h2>
          </div>
          <div className="product-story-stage" aria-label="Ejemplo controlado de una vista de NUVRA">
            <div className="product-story-score">
              <span>Nuvra Score</span>
              <strong>64<small>/100</small></strong>
              <p>Una referencia para entender el punto de partida, no una nota escolar.</p>
            </div>
            <div className="product-story-diagnosis">
              <span>Lo más importante ahora</span>
              <strong>Validar qué ayuda a que más clientes vuelvan.</strong>
              <p>La evidencia disponible todavía no demuestra una única causa.</p>
            </div>
            <div className="product-story-action">
              <span>Primera acción</span>
              <strong>Medir una intervención pequeña durante cuatro semanas.</strong>
              <div><b>KPI</b> Clientes que vuelven dentro del período definido.</div>
            </div>
            <div className="product-story-caption">Negocio demo · Escenario ficticio. La interfaz muestra únicamente conclusiones sostenidas por la información disponible.</div>
          </div>
        </section>

        <section className="marketing-outcomes" aria-labelledby="outcomes-title">
          <header>
            <p className="marketing-kicker">Lo que cambia</p>
            <h2 id="outcomes-title">Menos acciones aisladas. Más criterio para decidir.</h2>
          </header>
          <div className="outcome-list">
            <article><span>Diagnóstico</span><h3>Entender qué está frenando el objetivo.</h3><p>Con una explicación concreta y la evidencia que la sostiene.</p></article>
            <article><span>Prioridad</span><h3>Saber qué resolver primero.</h3><p>Sin confundir lo más fácil de detectar con lo más importante.</p></article>
            <article><span>Estrategia</span><h3>Elegir una dirección, no una lista de canales.</h3><p>Adaptada al presupuesto, al plazo y a la capacidad disponible.</p></article>
            <article><span>Seguimiento</span><h3>Medir si la decisión funcionó.</h3><p>Con acciones, indicadores y criterios para ajustar el próximo paso.</p></article>
          </div>
        </section>

        <section className="marketing-trust" aria-labelledby="trust-title">
          <div className="marketing-trust-copy">
            <p className="marketing-kicker">Confianza por transparencia</p>
            <h2 id="trust-title">NUVRA distingue lo que sabe, lo que declaraste y lo que todavía debe comprobar.</h2>
          </div>
          <div className="trust-principles">
            <div><strong>Basado en evidencia</strong><span>Las conclusiones importantes necesitan señales suficientes y relevantes.</span></div>
            <div><strong>Sin datos inventados</strong><span>Una fuente inaccesible no se rellena con métricas ficticias ni se convierte en cero.</span></div>
            <div><strong>Contexto real</strong><span>El objetivo, el rubro y la capacidad cambian la prioridad, no la evidencia observada.</span></div>
            <div><strong>Detalle bajo demanda</strong><span>La explicación profunda está disponible sin saturar la lectura principal.</span></div>
          </div>
        </section>

        <section className="marketing-plan-bridge">
          <div><p className="marketing-kicker">Empezá sin costo</p><h2>Primero entendé el negocio. Después elegí cuánto querés avanzar.</h2></div>
          <div><p>El diagnóstico inicial permite probar NUVRA. Los planes Pro y Partner amplían seguimiento, estrategia y acompañamiento.</p><a href="/pricing" className="marketing-inline-link">Comparar planes</a></div>
        </section>

        <section className="marketing-faq" aria-labelledby="faq-title">
          <header><p className="marketing-kicker">Preguntas frecuentes</p><h2 id="faq-title">Antes de empezar.</h2></header>
          <div className="faq-list">
            {faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
          </div>
        </section>

        <section className="marketing-final-cta">
          <SignalPath compact />
          <div><p className="marketing-kicker">Tu próximo paso</p><h2>Descubrí qué necesita hoy tu negocio.</h2><p>El diagnóstico inicial es gratuito y trabaja con la información realmente disponible.</p></div>
          <Btn size="lg" onClick={start}>Hacer mi diagnóstico gratis</Btn>
        </section>
      </main>

      <footer className="marketing-footer">
        <BrandMark subtitle={false} inverse />
        <p>Claridad para decidir qué hacer primero.</p>
        <div><a href="/pricing">Planes</a><a href="/login">Ingresar</a><a href="/onboarding">Empezar</a></div>
      </footer>
    </div>
  );
}
