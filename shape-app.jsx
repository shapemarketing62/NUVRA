import React, { useState, useEffect, useRef } from "react";

/* ============================= DESIGN TOKENS =============================
   paper #F7F7F5 · ink #14161A · ink-soft #5B5F67 · line #E2E2DE
   blue #2E4BFF (precisión) · olive #5C6B4F (crecimiento)
   display: Space Grotesk · body: Inter · data: JetBrains Mono
============================================================================ */

const FONTS_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
* { box-sizing: border-box; }
.shp { font-family:'Inter',sans-serif; color:#14161A; background:#F7F7F5; }
.shp-display { font-family:'Space Grotesk',sans-serif; }
.shp-mono { font-family:'JetBrains Mono',monospace; }
.shp ::selection { background:#2E4BFF; color:#fff; }
.shp button { font-family:'Inter',sans-serif; cursor:pointer; }
.shp input, .shp select { font-family:'Inter',sans-serif; }
.shp-scrollbar::-webkit-scrollbar{ width:8px; }
.shp-scrollbar::-webkit-scrollbar-thumb{ background:#DEDEDA; border-radius:8px; }
@keyframes shpFadeUp { from{opacity:0; transform:translateY(10px);} to{opacity:1; transform:translateY(0);} }
@keyframes shpPop { from{opacity:0; transform:scale(.92);} to{opacity:1; transform:scale(1);} }
@keyframes shpSpin { to { transform: rotate(360deg); } }
.shp-fadeup { animation: shpFadeUp .45s ease both; }
.shp-pop { animation: shpPop .3s ease both; }
`;

const COLORS = {
  paper: "#F7F7F5",
  paperDim: "#EFEFEC",
  ink: "#14161A",
  inkSoft: "#5B5F67",
  inkFaint: "#9A9DA3",
  line: "#E2E2DE",
  lineStrong: "#CFCFC9",
  blue: "#2E4BFF",
  blueSoft: "#EEF0FF",
  blueDeep: "#1E33C7",
  olive: "#5C6B4F",
  oliveSoft: "#EBEEE6",
  red: "#C2453A",
  redSoft: "#F8EAE8",
};

/* ============================= SEED / DEMO DATA ============================= */

const DEMO_BUSINESS = {
  nombre: "Noma Café",
  rubro: "Cafetería",
  ubicacion: "Palermo, Buenos Aires",
  empleados: "6",
  web: "nomacafe.com.ar",
  instagram: "@nomacafe",
  facturacion: 10000000,
  clientesMensuales: 1450,
  ticketPromedio: 6900,
  inversionMarketing: 180000,
  canales: ["Instagram", "Google Business", "WhatsApp Business"],
  objetivoTipo: "Aumentar ventas",
  magnitud: 20,
  plazoMeses: 6,
};

const STAGES_SEED = [
  {
    id: 1,
    mes: "Mes 1",
    titulo: "Preparación",
    objetivo: "Dejar la base de medición y el perfil del negocio listos para ejecutar.",
    que: "Ordenamos tu perfil digital, activamos el seguimiento de resultados y confirmamos qué canales vamos a usar.",
    porque: "Sin una base de medición clara, después no vamos a poder saber qué estrategia funcionó y cuál no.",
    acciones: [
      { id: "a1", texto: "Completar perfil de Google Business", done: true },
      { id: "a2", texto: "Activar carga semanal de resultados", done: true },
      { id: "a3", texto: "Auditar Instagram y WhatsApp Business", done: false },
    ],
    indicadores: ["Perfil completo", "Canales activos"],
  },
  {
    id: 2,
    mes: "Mes 2–3",
    titulo: "Captación",
    objetivo: "Sumar clientes nuevos — es la palanca con más margen de mejora hoy.",
    que: "Priorizamos campañas de adquisición y visibilidad en zonas cercanas a Palermo, más un sistema simple de reseñas.",
    porque: "Tu ticket promedio ya viene subiendo 6,3%, pero la cantidad de clientes solo creció 1,1%. El cuello de botella está en captación, no en monetización.",
    acciones: [
      { id: "a4", texto: "Lanzar campaña de captación en Instagram Ads", done: false },
      { id: "a5", texto: "Crear sistema de reseñas post-compra", done: false },
      { id: "a6", texto: "Optimizar horarios de mayor tráfico en Google Business", done: false },
    ],
    indicadores: ["Clientes nuevos / mes", "Reseñas nuevas", "Alcance en Instagram"],
  },
  {
    id: 3,
    mes: "Mes 4–5",
    titulo: "Optimización",
    objetivo: "Entender qué canales y horarios realmente convierten en ventas.",
    que: "Revisamos el rendimiento de cada canal activado en la etapa anterior y reasignamos presupuesto hacia lo que mejor funcionó.",
    porque: "Recién con datos de dos meses de captación activa vamos a poder distinguir señal de ruido.",
    acciones: [
      { id: "a7", texto: "Revisar rendimiento de campañas activas", done: false },
      { id: "a8", texto: "Reasignar presupuesto de marketing", done: false },
    ],
    indicadores: ["Costo por cliente nuevo", "Conversión por canal"],
  },
  {
    id: 4,
    mes: "Mes 6",
    titulo: "Escalamiento",
    objetivo: "Empujar con más fuerza lo que ya demostró funcionar.",
    que: "Aumentamos inversión y frecuencia en los canales con mejor retorno detectado en la etapa de optimización.",
    porque: "Escalar antes de tener evidencia clara hubiera sido gastar a ciegas.",
    acciones: [
      { id: "a9", texto: "Aumentar inversión en el canal top", done: false },
      { id: "a10", texto: "Evaluar resultado final vs. objetivo", done: false },
    ],
    indicadores: ["Facturación mensual", "% de avance hacia objetivo"],
  },
];

const ACTIONS_SEED = [
  {
    id: "ac1",
    grupo: "alta",
    titulo: "Crear sistema de reseñas post-compra",
    done: false,
    detalle: {
      que: "Agregar un cartel con QR en el mostrador que invite a dejar una reseña en Google inmediatamente después de la compra.",
      porque: "Tu rating actual (4.3) está por debajo del promedio de la zona (4.6). Las reseñas también mejoran tu posición en Google Business.",
      impacto: "Estimamos +15 reseñas por mes y mejor posicionamiento local en 60 días.",
      indicadores: ["Reseñas nuevas / mes", "Rating promedio"],
    },
  },
  {
    id: "ac2",
    grupo: "alta",
    titulo: "Lanzar campaña de captación en Instagram",
    done: false,
    detalle: {
      que: "Campaña de alcance geolocalizado a 3km a la redonda, con foco en gente que todavía no te sigue.",
      porque: "El 68% de tus clientes actuales llegó por Instagram, pero hace 2 meses que no corrés campañas pagas.",
      impacto: "Estimamos entre 80 y 140 clientes nuevos en 30 días con la inversión actual.",
      indicadores: ["Alcance", "Clientes nuevos atribuibles"],
    },
  },
  {
    id: "ac3",
    grupo: "semana",
    titulo: "Optimizar Google Business",
    done: false,
    detalle: {
      que: "Actualizar horarios, fotos recientes y responder las últimas 6 reseñas pendientes.",
      porque: "Un perfil completo aparece hasta 40% más en búsquedas locales tipo 'cafetería cerca'.",
      impacto: "Mejora directa en visibilidad, sin costo adicional.",
      indicadores: ["Vistas del perfil", "Clics a cómo llegar"],
    },
  },
  {
    id: "ac4",
    grupo: "semana",
    titulo: "Mejorar CTA en Instagram",
    done: false,
    detalle: {
      que: "Agregar un link directo a WhatsApp en la bio y en los últimos 3 posteos fijados.",
      porque: "Hoy el perfil no tiene ninguna acción clara para alguien que quiere hacer un pedido.",
      impacto: "Reducción de fricción entre interés y primera compra.",
      indicadores: ["Clics al link", "Consultas por WhatsApp"],
    },
  },
  {
    id: "ac5",
    grupo: "proximamente",
    titulo: "Reactivar clientes inactivos",
    done: false,
    detalle: {
      que: "Enviar un mensaje simple por WhatsApp a clientes que no compran hace más de 45 días.",
      porque: "Tenés una base de contactos que todavía no se está aprovechando para recurrencia.",
      impacto: "Palanca de mediano plazo — se activa una vez que la captación esté estabilizada.",
      indicadores: ["Clientes reactivados", "Recurrencia"],
    },
  },
];

const RESULTS_SEED = [
  { id: "r1", fecha: "2026-03-05", facturacion: 9200000, ventas: 1310, clientes: 1390, ticket: 6620, inversion: 150000, gastos: 3400000 },
  { id: "r2", fecha: "2026-04-04", facturacion: 9550000, ventas: 1340, clientes: 1402, ticket: 6720, inversion: 160000, gastos: 3450000 },
  { id: "r3", fecha: "2026-05-06", facturacion: 9800000, ventas: 1360, clientes: 1415, ticket: 6790, inversion: 165000, gastos: 3500000 },
  { id: "r4", fecha: "2026-06-04", facturacion: 10020000, ventas: 1385, clientes: 1428, ticket: 6845, inversion: 170000, gastos: 3520000 },
  { id: "r5", fecha: "2026-07-05", facturacion: 10240000, ventas: 1402, clientes: 1438, ticket: 6890, inversion: 175000, gastos: 3560000 },
  { id: "r6", fecha: "2026-08-06", facturacion: 10420000, ventas: 1418, clientes: 1450, ticket: 6900, inversion: 180000, gastos: 3600000 },
];

const VENTAS_SEED = [
  { id: "v1", fecha: "2026-08-06", producto: "Abono mensual empresas", monto: 145000, cliente: "Estudio Fig" },
  { id: "v2", fecha: "2026-08-05", producto: "Consumo local", monto: 8200, cliente: "Consumidor final" },
  { id: "v3", fecha: "2026-08-05", producto: "Pedido para eventos", monto: 62000, cliente: "Wework Palermo" },
  { id: "v4", fecha: "2026-08-04", producto: "Consumo local", monto: 6400, cliente: "Consumidor final" },
];

const CLIENTES_SEED = [
  { id: "c1", nombre: "Estudio Fig", tipo: "Recurrente", ultimaCompra: "2026-08-06", totalGastado: 890000 },
  { id: "c2", nombre: "Wework Palermo", tipo: "Recurrente", ultimaCompra: "2026-08-05", totalGastado: 610000 },
  { id: "c3", nombre: "Martina Sosa", tipo: "Nuevo", ultimaCompra: "2026-08-05", totalGastado: 8200 },
  { id: "c4", nombre: "Federico Lima", tipo: "Recurrente", ultimaCompra: "2026-08-02", totalGastado: 134000 },
];

const PRODUCTOS_SEED = [
  { id: "p1", nombre: "Café de especialidad 250g", precio: 8900, margen: "62%" },
  { id: "p2", nombre: "Abono mensual empresas", precio: 145000, margen: "48%" },
  { id: "p3", nombre: "Cold brew botella", precio: 3200, margen: "55%" },
  { id: "p4", nombre: "Combo desayuno", precio: 5400, margen: "40%" },
];

const GASTOS_SEED = [
  { id: "g1", fecha: "2026-08-01", categoria: "Insumos", monto: 1820000 },
  { id: "g2", fecha: "2026-08-01", categoria: "Alquiler", monto: 950000 },
  { id: "g3", fecha: "2026-08-03", categoria: "Marketing", monto: 180000 },
  { id: "g4", fecha: "2026-08-05", categoria: "Sueldos", monto: 650000 },
];

const COMPETITORS_SEED = [
  { nombre: "Noma Café", rating: 4.3, resenas: 212, actividad: 74, crecimiento: 8, tuyo: true },
  { nombre: "Café Registrado", rating: 4.6, resenas: 388, actividad: 91, crecimiento: 14 },
  { nombre: "Lattente", rating: 4.5, resenas: 301, actividad: 68, crecimiento: 5 },
  { nombre: "Cuervo Café", rating: 4.1, resenas: 156, actividad: 52, crecimiento: 2 },
];

const AI_SUGGESTED = [
  "¿Por qué mis ventas no están creciendo como esperábamos?",
  "¿Conviene aumentar mi inversión publicitaria?",
  "¿Qué debería priorizar durante las próximas semanas?",
];

function aiRespond(msg) {
  const m = msg.toLowerCase();
  if (m.includes("no") && m.includes("crec") || m.includes("por qué") && m.includes("venta")) {
    return {
      texto:
        "Durante los últimos 30 días tu ticket promedio subió 6,3%, pero la cantidad de clientes solo creció 1,1%. El problema hoy no es cuánto gasta cada cliente — es que están entrando pocos clientes nuevos. Por eso la etapa actual del roadmap prioriza captación.",
      tags: ["Ventas", "Clientes", "Estrategia"],
    };
  }
  if (m.includes("public") || m.includes("invers") || m.includes("ads")) {
    return {
      texto:
        "Tu inversión en marketing viene subiendo de forma constante ($150K a $180K en los últimos meses) con retorno estable. Antes de aumentarla más, conviene esperar los resultados de la campaña de captación que arranca esta semana — así sabemos si el canal actual responde a más presupuesto antes de escalarlo.",
      tags: ["Marketing", "Historial"],
    };
  }
  if (m.includes("priori") || m.includes("septiembre") || m.includes("semana")) {
    return {
      texto:
        "Con la información disponible hoy, la prioridad clara es adquisición de clientes nuevos: reseñas y campaña de Instagram. La optimización de canales todavía no tiene suficientes datos — recién vamos a poder evaluarla con resultados de por lo menos 4 semanas de captación activa.",
      tags: ["Estrategia", "Acciones"],
    };
  }
  return {
    texto:
      "Con los datos que tengo hoy de Noma Café puedo ver la evolución de ventas, clientes y ticket promedio, además del estado de tu estrategia. Contame un poco más — ¿te interesa algo puntual sobre ventas, clientes, marketing o el roadmap?",
    tags: ["Ventas", "Clientes", "Estrategia"],
  };
}

const PARTNER_MESSAGES_SEED = [
  { from: "sofia", texto: "Hola! Vi que activaste el sistema de reseñas. En la reunión del jueves te muestro cómo viene respondiendo Google Business 🙂" },
  { from: "sofia", texto: "Cualquier duda con la campaña de Instagram, escribime acá directamente." },
];

/* ============================= HELPERS ============================= */

const money = (n) =>
  "$" + Math.round(n).toLocaleString("es-AR");

const pct = (n, d = 1) => `${n > 0 ? "+" : ""}${n.toFixed(d)}%`;

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

/* ============================= SMALL UI PRIMITIVES ============================= */

function Btn({ children, variant = "primary", size = "md", onClick, disabled, style, full }) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 999,
    fontWeight: 500,
    border: "1px solid transparent",
    transition: "all .15s ease",
    width: full ? "100%" : undefined,
    opacity: disabled ? 0.45 : 1,
    pointerEvents: disabled ? "none" : "auto",
  };
  const sizes = {
    sm: { padding: "7px 14px", fontSize: 13 },
    md: { padding: "11px 20px", fontSize: 14.5 },
    lg: { padding: "14px 26px", fontSize: 15.5 },
  };
  const variants = {
    primary: { background: COLORS.ink, color: COLORS.paper },
    accent: { background: COLORS.blue, color: "#fff" },
    ghost: { background: "transparent", color: COLORS.ink, border: `1px solid ${COLORS.line}` },
    subtle: { background: COLORS.paperDim, color: COLORS.ink },
    danger: { background: COLORS.redSoft, color: COLORS.red },
  };
  const [hover, setHover] = useState(false);
  const hoverBg = {
    primary: COLORS.blue,
    accent: COLORS.blueDeep,
    ghost: COLORS.paperDim,
    subtle: COLORS.line,
    danger: COLORS.red,
  };
  const hoverColor = { danger: "#fff" };
  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...base,
        ...sizes[size],
        ...variants[variant],
        background: hover ? hoverBg[variant] : variants[variant].background,
        color: hover && hoverColor[variant] ? hoverColor[variant] : variants[variant].color,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <label style={{ display: "block", fontSize: 13.5, fontWeight: 500, marginBottom: 8, color: COLORS.ink }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: 12, color: COLORS.inkFaint, marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${COLORS.line}`,
  background: "#fff",
  fontSize: 14.5,
  color: COLORS.ink,
  outline: "none",
};

function TextInput({ value, onChange, placeholder, type = "text", disabled }) {
  const [focus, setFocus] = useState(false);
  return (
    <input
      type={type}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        ...inputStyle,
        borderColor: focus ? COLORS.blue : COLORS.line,
        boxShadow: focus ? `0 0 0 3px ${COLORS.blueSoft}` : "none",
        background: disabled ? COLORS.paperDim : "#fff",
        color: disabled ? COLORS.inkFaint : COLORS.ink,
      }}
    />
  );
}

function Select({ value, onChange, options, placeholder }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, appearance: "auto" }}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function Toggle({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 16px",
        borderRadius: 999,
        border: `1px solid ${active ? COLORS.blue : COLORS.line}`,
        background: active ? COLORS.blueSoft : "#fff",
        color: active ? COLORS.blueDeep : COLORS.inkSoft,
        fontSize: 13.5,
        fontWeight: 500,
        transition: "all .15s ease",
      }}
    >
      {children}
    </button>
  );
}

function Modal({ title, onClose, children, width = 520 }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,22,26,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="shp-pop"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "100%",
          maxWidth: width,
          maxHeight: "88vh",
          overflowY: "auto",
          padding: 30,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <h3 className="shp-display" style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em" }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            style={{ background: COLORS.paperDim, border: "none", borderRadius: 999, width: 30, height: 30, fontSize: 15, color: COLORS.inkSoft }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ProBadge() {
  return (
    <span
      className="shp-mono"
      style={{
        fontSize: 10.5,
        fontWeight: 500,
        color: COLORS.blue,
        background: COLORS.blueSoft,
        padding: "2px 7px",
        borderRadius: 6,
        letterSpacing: "0.03em",
      }}
    >
      PRO
    </span>
  );
}

/* ============================= LANDING ============================= */

function Landing({ onStart, onDemo }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  const steps = [
    { n: "01", t: "Contanos sobre tu negocio", d: "Rubro, ubicación, canales y una foto rápida de tu situación actual." },
    { n: "02", t: "Definí dónde querés llegar", d: "Elegís el objetivo, la magnitud y el plazo en el que lo querés lograr." },
    { n: "03", t: "Shape construye tu estrategia", d: "Un roadmap por etapas, armado con lo que sabemos de tu negocio." },
    { n: "04", t: "Medimos y ajustamos el camino", d: "El plan se actualiza a medida que llegan resultados reales." },
  ];

  return (
    <div className="shp" style={{ minHeight: "100vh" }}>
      <style>{FONTS_CSS}</style>
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
        <div className="shp-display" style={{ fontWeight: 700, fontSize: 20, display: "flex", alignItems: "center", gap: 8 }}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
            <path d="M4 18C4 10 9 5 18 5" stroke={COLORS.blue} strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="19" cy="5" r="2.4" fill={COLORS.blue} />
          </svg>
          Shape
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          <Btn variant="ghost" size="sm" onClick={onDemo}>
            Probar demo
          </Btn>
          <Btn variant="primary" size="sm" onClick={onStart}>
            Crear mi estrategia
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
          Plataforma de crecimiento para negocios
        </span>
        <h1 className="shp-display" style={{ fontSize: "clamp(34px,5vw,52px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.08, marginBottom: 20 }}>
          Tu negocio tiene un objetivo.
          <br />
          <span style={{ color: COLORS.blue }}>Shape</span> diseña el camino para alcanzarlo.
        </h1>
        <p style={{ fontSize: 17.5, color: COLORS.inkSoft, lineHeight: 1.55, maxWidth: 520, margin: "0 auto 34px" }}>
          Le contás dónde está tu negocio y adónde querés llegar. Shape arma una estrategia a medida, la sigue de cerca y la ajusta con cada resultado nuevo.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", marginBottom: 16 }}>
          <Btn variant="primary" size="lg" onClick={onStart}>
            Crear mi estrategia
          </Btn>
          <Btn variant="ghost" size="lg" onClick={() => document.getElementById("como-funciona")?.scrollIntoView({ behavior: "smooth" })}>
            Ver cómo funciona
          </Btn>
        </div>
        <div style={{ fontSize: 13, color: COLORS.inkFaint }}>
          o <button onClick={onDemo} style={{ background: "none", border: "none", color: COLORS.blue, cursor: "pointer", fontSize: 13, textDecoration: "underline" }}>probá la demo con datos de ejemplo</button>
        </div>
      </section>

      <section id="como-funciona" style={{ background: COLORS.paperDim, borderTop: `1px solid ${COLORS.line}`, borderBottom: `1px solid ${COLORS.line}`, padding: "70px 24px" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 0, border: `1px solid ${COLORS.line}`, borderRadius: 16, overflow: "hidden", background: "#fff" }}>
          {steps.map((s, i) => (
            <div key={s.n} style={{ padding: "30px 26px", borderRight: i < 3 ? `1px solid ${COLORS.line}` : "none" }}>
              <div className="shp-mono" style={{ fontSize: 12, color: COLORS.blue, marginBottom: 16 }}>
                {s.n}
              </div>
              <h4 style={{ fontSize: 15.5, fontWeight: 600, marginBottom: 8 }}>{s.t}</h4>
              <p style={{ fontSize: 13.5, color: COLORS.inkSoft, lineHeight: 1.5 }}>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: "80px 24px", maxWidth: 1040, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <span className="shp-mono" style={{ fontSize: 12, color: COLORS.inkSoft, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Planes
          </span>
          <h2 className="shp-display" style={{ fontSize: 30, fontWeight: 700, marginTop: 10 }}>
            Elegís cuánto querés que Shape haga con vos
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 18 }}>
          {[
            { n: "Free", p: "Decime qué hacer.", items: ["Objetivos y plazos", "Estrategia básica", "Acciones", "Seguimiento manual"], featured: false },
            { n: "Pro", p: "Ayudame a hacerlo y entenderlo.", items: ["Todo lo de Free", "Shape AI", "Competencia y benchmark", "Gestión de ventas y clientes"], featured: true },
            { n: "Partner", p: "Trabajemos juntos.", items: ["Todo lo de Pro", "Estratega humano", "Reuniones periódicas", "Chat directo"], featured: false },
          ].map((pl) => (
            <div
              key={pl.n}
              style={{
                border: `1px solid ${pl.featured ? COLORS.ink : COLORS.line}`,
                borderRadius: 16,
                padding: 28,
                background: pl.featured ? COLORS.ink : "#fff",
                color: pl.featured ? COLORS.paper : COLORS.ink,
                transform: pl.featured ? "translateY(-6px)" : "none",
              }}
            >
              <div className="shp-display" style={{ fontSize: 19, fontWeight: 700, marginBottom: 4 }}>
                {pl.n}
              </div>
              <div className="shp-mono" style={{ fontSize: 12.5, padding: "8px 12px", borderRadius: 8, background: pl.featured ? "rgba(247,247,245,0.1)" : COLORS.paperDim, margin: "12px 0 18px", color: pl.featured ? "rgba(247,247,245,0.75)" : COLORS.inkSoft }}>
                "{pl.p}"
              </div>
              <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 9, marginBottom: 22, fontSize: 13.5 }}>
                {pl.items.map((it) => (
                  <li key={it} style={{ display: "flex", gap: 8 }}>
                    <span style={{ color: pl.featured ? "#8FA4FF" : COLORS.olive }}>—</span>
                    {it}
                  </li>
                ))}
              </ul>
              <Btn variant={pl.featured ? "subtle" : "ghost"} full onClick={onStart} style={pl.featured ? { background: "#fff", color: COLORS.ink } : {}}>
                Empezar
              </Btn>
            </div>
          ))}
        </div>
      </section>

      <footer style={{ borderTop: `1px solid ${COLORS.line}`, padding: "28px 24px", textAlign: "center", fontSize: 13, color: COLORS.inkFaint }}>
        © 2026 Shape — Plataforma de crecimiento para negocios
      </footer>
    </div>
  );
}

/* ============================= ONBOARDING ============================= */

const OBJETIVOS = ["Aumentar ventas", "Conseguir más clientes", "Aumentar recurrencia", "Mejorar reconocimiento", "Lanzar un producto", "Otro"];
const CANALES = ["Instagram", "TikTok", "Google Business", "Facebook", "WhatsApp Business", "Página web", "Meta Ads", "Google Ads", "Otros"];
const RUBROS = ["Cafetería", "Restaurante", "Peluquería / Estética", "Comercio", "Servicios profesionales", "Indumentaria", "Otro"];

function Onboarding({ initial, onFinish, onCancel }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState(
    initial || {
      nombre: "",
      rubro: "",
      ubicacion: "",
      empleados: "",
      web: "",
      instagram: "",
      facturacion: "",
      facturacionNoSe: false,
      clientesMensuales: "",
      clientesNoSe: false,
      ticketPromedio: "",
      inversionMarketing: "",
      canales: [],
      objetivoTipo: "",
      magnitud: 20,
      plazoMeses: 6,
      plazoFecha: "",
    }
  );

  const totalSteps = 6;
  const set = (k, v) => setData((d) => ({ ...d, [k]: v }));
  const toggleCanal = (c) =>
    setData((d) => ({
      ...d,
      canales: d.canales.includes(c) ? d.canales.filter((x) => x !== c) : [...d.canales, c],
    }));

  const canContinue = () => {
    if (step === 0) return data.nombre.trim() && data.rubro;
    if (step === 3) return !!data.objetivoTipo;
    return true;
  };

  const factNum = Number(data.facturacion) || 10000000;
  const objetivoMonto = Math.round(factNum * (1 + data.magnitud / 100));

  return (
    <div className="shp" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{FONTS_CSS}</style>
      <div style={{ padding: "22px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${COLORS.line}` }}>
        <button onClick={onCancel} className="shp-display" style={{ background: "none", border: "none", fontWeight: 700, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
            <path d="M4 18C4 10 9 5 18 5" stroke={COLORS.blue} strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="19" cy="5" r="2.4" fill={COLORS.blue} />
          </svg>
          Shape
        </button>
        <div className="shp-mono" style={{ fontSize: 12.5, color: COLORS.inkSoft }}>
          Paso {step + 1} de {totalSteps}
        </div>
      </div>
      <div style={{ height: 3, background: COLORS.line }}>
        <div style={{ height: "100%", width: `${((step + 1) / totalSteps) * 100}%`, background: COLORS.blue, transition: "width .3s ease" }} />
      </div>

      <div style={{ flex: 1, display: "flex", justifyContent: "center", padding: "56px 24px" }}>
        <div style={{ width: "100%", maxWidth: 520 }} className="shp-fadeup" key={step}>
          {step === 0 && (
            <>
              <h2 className="shp-display" style={{ fontSize: 27, fontWeight: 700, marginBottom: 6 }}>
                Contanos sobre tu negocio
              </h2>
              <p style={{ color: COLORS.inkSoft, fontSize: 14.5, marginBottom: 30 }}>Lo esencial primero. El resto lo completamos más adelante.</p>
              <Field label="Nombre del negocio">
                <TextInput value={data.nombre} onChange={(v) => set("nombre", v)} placeholder="Ej: Noma Café" />
              </Field>
              <Field label="Rubro">
                <Select value={data.rubro} onChange={(v) => set("rubro", v)} options={RUBROS} placeholder="Elegí un rubro" />
              </Field>
              <Field label="Ubicación">
                <TextInput value={data.ubicacion} onChange={(v) => set("ubicacion", v)} placeholder="Ej: Palermo, Buenos Aires" />
              </Field>
              <Field label="Cantidad de empleados">
                <TextInput type="number" value={data.empleados} onChange={(v) => set("empleados", v)} placeholder="Ej: 6" />
              </Field>
              <Field label="Página web (opcional)">
                <TextInput value={data.web} onChange={(v) => set("web", v)} placeholder="Ej: tunegocio.com" />
              </Field>
              <Field label="Instagram (opcional)">
                <TextInput value={data.instagram} onChange={(v) => set("instagram", v)} placeholder="Ej: @tunegocio" />
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="shp-display" style={{ fontSize: 27, fontWeight: 700, marginBottom: 6 }}>
                Tu situación actual
              </h2>
              <p style={{ color: COLORS.inkSoft, fontSize: 14.5, marginBottom: 30 }}>Si no tenés un número exacto, no pasa nada — marcá "no lo sé".</p>
              <Field label="Facturación mensual aproximada">
                <div style={{ display: "flex", gap: 10 }}>
                  <TextInput type="number" disabled={data.facturacionNoSe} value={data.facturacion} onChange={(v) => set("facturacion", v)} placeholder="Ej: 10000000" />
                  <Toggle active={data.facturacionNoSe} onClick={() => set("facturacionNoSe", !data.facturacionNoSe)}>
                    No lo sé
                  </Toggle>
                </div>
              </Field>
              <Field label="Cantidad aproximada de clientes por mes">
                <div style={{ display: "flex", gap: 10 }}>
                  <TextInput type="number" disabled={data.clientesNoSe} value={data.clientesMensuales} onChange={(v) => set("clientesMensuales", v)} placeholder="Ej: 1450" />
                  <Toggle active={data.clientesNoSe} onClick={() => set("clientesNoSe", !data.clientesNoSe)}>
                    No lo sé
                  </Toggle>
                </div>
              </Field>
              <Field label="Ticket promedio">
                <TextInput type="number" value={data.ticketPromedio} onChange={(v) => set("ticketPromedio", v)} placeholder="Ej: 6900" />
              </Field>
              <Field label="Inversión mensual en marketing">
                <TextInput type="number" value={data.inversionMarketing} onChange={(v) => set("inversionMarketing", v)} placeholder="Ej: 180000" />
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="shp-display" style={{ fontSize: 27, fontWeight: 700, marginBottom: 6 }}>
                Presencia digital
              </h2>
              <p style={{ color: COLORS.inkSoft, fontSize: 14.5, marginBottom: 26 }}>Elegí los canales que ya usás. Podés cambiar esto después.</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {CANALES.map((c) => (
                  <Toggle key={c} active={data.canales.includes(c)} onClick={() => toggleCanal(c)}>
                    {c}
                  </Toggle>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="shp-display" style={{ fontSize: 27, fontWeight: 700, marginBottom: 6 }}>
                ¿Dónde querés llevar tu negocio?
              </h2>
              <p style={{ color: COLORS.inkSoft, fontSize: 14.5, marginBottom: 26 }}>Elegí el objetivo principal para los próximos meses.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {OBJETIVOS.map((o) => (
                  <button
                    key={o}
                    onClick={() => set("objetivoTipo", o)}
                    style={{
                      padding: "18px 16px",
                      borderRadius: 12,
                      textAlign: "left",
                      border: `1.5px solid ${data.objetivoTipo === o ? COLORS.blue : COLORS.line}`,
                      background: data.objetivoTipo === o ? COLORS.blueSoft : "#fff",
                      fontSize: 14.5,
                      fontWeight: 500,
                      color: data.objetivoTipo === o ? COLORS.blueDeep : COLORS.ink,
                    }}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="shp-display" style={{ fontSize: 27, fontWeight: 700, marginBottom: 6 }}>
                ¿Cuánto querés {data.objetivoTipo === "Aumentar ventas" ? "aumentar tus ventas" : "avanzar"}?
              </h2>
              <p style={{ color: COLORS.inkSoft, fontSize: 14.5, marginBottom: 34 }}>Deslizá para ajustar la magnitud del objetivo.</p>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <span className="shp-display" style={{ fontSize: 52, fontWeight: 700, color: COLORS.blue }}>
                  +{data.magnitud}%
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={60}
                value={data.magnitud}
                onChange={(e) => set("magnitud", Number(e.target.value))}
                style={{ width: "100%", accentColor: COLORS.blue, marginBottom: 30 }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", background: COLORS.paperDim, borderRadius: 12, padding: "18px 20px" }}>
                <div>
                  <div className="shp-mono" style={{ fontSize: 11.5, color: COLORS.inkFaint, marginBottom: 4 }}>
                    FACTURACIÓN ACTUAL
                  </div>
                  <div className="shp-display" style={{ fontSize: 18, fontWeight: 600 }}>
                    {money(factNum)}
                  </div>
                </div>
                <div style={{ alignSelf: "center", color: COLORS.inkFaint }}>→</div>
                <div>
                  <div className="shp-mono" style={{ fontSize: 11.5, color: COLORS.blue, marginBottom: 4 }}>
                    OBJETIVO
                  </div>
                  <div className="shp-display" style={{ fontSize: 18, fontWeight: 700, color: COLORS.blue }}>
                    {money(objetivoMonto)}
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <h2 className="shp-display" style={{ fontSize: 27, fontWeight: 700, marginBottom: 6 }}>
                ¿En cuánto tiempo?
              </h2>
              <p style={{ color: COLORS.inkSoft, fontSize: 14.5, marginBottom: 26 }}>Elegí el plazo para alcanzar tu objetivo.</p>
              <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                {[3, 6, 12].map((m) => (
                  <button
                    key={m}
                    onClick={() => set("plazoMeses", m)}
                    style={{
                      flex: "1 1 100px",
                      padding: "20px 14px",
                      borderRadius: 12,
                      border: `1.5px solid ${data.plazoMeses === m ? COLORS.blue : COLORS.line}`,
                      background: data.plazoMeses === m ? COLORS.blueSoft : "#fff",
                      color: data.plazoMeses === m ? COLORS.blueDeep : COLORS.ink,
                      fontWeight: 600,
                      fontSize: 15,
                    }}
                  >
                    {m} meses
                  </button>
                ))}
                <button
                  onClick={() => set("plazoMeses", "custom")}
                  style={{
                    flex: "1 1 100px",
                    padding: "20px 14px",
                    borderRadius: 12,
                    border: `1.5px solid ${data.plazoMeses === "custom" ? COLORS.blue : COLORS.line}`,
                    background: data.plazoMeses === "custom" ? COLORS.blueSoft : "#fff",
                    color: data.plazoMeses === "custom" ? COLORS.blueDeep : COLORS.ink,
                    fontWeight: 600,
                    fontSize: 15,
                  }}
                >
                  Personalizado
                </button>
              </div>
              {data.plazoMeses === "custom" && (
                <Field label="Fecha objetivo">
                  <TextInput type="date" value={data.plazoFecha} onChange={(v) => set("plazoFecha", v)} />
                </Field>
              )}
            </>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 40 }}>
            <Btn variant="ghost" onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}>
              Atrás
            </Btn>
            {step < totalSteps - 1 ? (
              <Btn variant="primary" disabled={!canContinue()} onClick={() => setStep(step + 1)}>
                Continuar
              </Btn>
            ) : (
              <Btn variant="accent" onClick={() => onFinish(data)}>
                Crear mi estrategia
              </Btn>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================= GENERATING ============================= */

function Generating({ data, onDone }) {
  const items = ["Situación actual", "Objetivo", "Canales", "Oportunidades", "Estrategia"];
  const [checked, setChecked] = useState(0);

  useEffect(() => {
    if (checked >= items.length) {
      const t = setTimeout(onDone, 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setChecked((c) => c + 1), 480);
    return () => clearTimeout(t);
  }, [checked]);

  return (
    <div className="shp" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{FONTS_CSS}</style>
      <div style={{ textAlign: "center", width: 320 }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: "50%",
            border: `3px solid ${COLORS.line}`,
            borderTopColor: COLORS.blue,
            margin: "0 auto 30px",
            animation: "shpSpin 0.9s linear infinite",
          }}
        />
        <h2 className="shp-display" style={{ fontSize: 20, fontWeight: 700, marginBottom: 26 }}>
          Analizando tu negocio
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 13, textAlign: "left" }}>
          {items.map((it, i) => (
            <div key={it} style={{ display: "flex", alignItems: "center", gap: 12, opacity: i < checked ? 1 : 0.3, transition: "opacity .3s" }}>
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: i < checked ? COLORS.olive : COLORS.line,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  flexShrink: 0,
                }}
              >
                {i < checked ? "✓" : ""}
              </span>
              <span style={{ fontSize: 14.5 }}>{it}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================= STRATEGY READY ============================= */

function StrategyReady({ data, onContinue }) {
  const factNum = Number(data.facturacion) || 10000000;
  const objetivoMonto = Math.round(factNum * (1 + data.magnitud / 100));
  const plazoLabel = data.plazoMeses === "custom" ? data.plazoFecha : `${data.plazoMeses} meses`;

  return (
    <div className="shp" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{FONTS_CSS}</style>
      <div className="shp-fadeup" style={{ maxWidth: 480, textAlign: "center" }}>
        <div style={{ width: 54, height: 54, borderRadius: "50%", background: COLORS.oliveSoft, color: COLORS.olive, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, margin: "0 auto 26px" }}>
          ✓
        </div>
        <h1 className="shp-display" style={{ fontSize: 30, fontWeight: 700, marginBottom: 10, letterSpacing: "-0.02em" }}>
          Tu estrategia está lista.
        </h1>
        <p style={{ color: COLORS.inkSoft, fontSize: 15, marginBottom: 34 }}>
          Armamos un plan en 4 etapas para {data.nombre || "tu negocio"}, pensado para el plazo que definiste.
        </p>
        <div style={{ border: `1px solid ${COLORS.line}`, borderRadius: 16, padding: 26, textAlign: "left", marginBottom: 30 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <span className="shp-mono" style={{ fontSize: 12, color: COLORS.inkFaint }}>
              OBJETIVO
            </span>
            <span style={{ fontWeight: 600, fontSize: 14.5 }}>
              {data.objetivoTipo} +{data.magnitud}%
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <span className="shp-mono" style={{ fontSize: 12, color: COLORS.inkFaint }}>
              SITUACIÓN ACTUAL
            </span>
            <span style={{ fontWeight: 600, fontSize: 14.5 }}>{money(factNum)}/mes</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <span className="shp-mono" style={{ fontSize: 12, color: COLORS.inkFaint }}>
              OBJETIVO
            </span>
            <span style={{ fontWeight: 700, fontSize: 14.5, color: COLORS.blue }}>{money(objetivoMonto)}/mes</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="shp-mono" style={{ fontSize: 12, color: COLORS.inkFaint }}>
              PLAZO
            </span>
            <span style={{ fontWeight: 600, fontSize: 14.5 }}>{plazoLabel}</span>
          </div>
        </div>
        <Btn variant="accent" size="lg" full onClick={onContinue}>
          Ver mi estrategia
        </Btn>
      </div>
    </div>
  );
}

/* ============================= APP SHELL ============================= */

const NAV_MAIN = [
  { id: "inicio", label: "Inicio" },
  { id: "estrategia", label: "Mi estrategia" },
  { id: "acciones", label: "Acciones" },
  { id: "resultados", label: "Resultados" },
  { id: "negocio", label: "Mi negocio" },
];
const NAV_PRO = [
  { id: "competencia", label: "Competencia", pro: true },
  { id: "shapeai", label: "Shape AI", pro: true },
];
const NAV_END = [
  { id: "partner", label: "Shape Partner" },
  { id: "config", label: "Configuración" },
];

function Sidebar({ active, setActive, plan, setPlan, business }) {
  const Item = ({ item }) => (
    <button
      onClick={() => setActive(item.id)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "10px 14px",
        borderRadius: 10,
        border: "none",
        background: active === item.id ? COLORS.paperDim : "transparent",
        color: active === item.id ? COLORS.ink : COLORS.inkSoft,
        fontWeight: active === item.id ? 600 : 500,
        fontSize: 14,
        textAlign: "left",
        marginBottom: 3,
      }}
    >
      {item.label}
      {item.pro && plan === "free" && <ProBadge />}
    </button>
  );
  return (
    <div
      style={{
        width: 232,
        flexShrink: 0,
        borderRight: `1px solid ${COLORS.line}`,
        padding: "22px 16px",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "sticky",
        top: 0,
      }}
    >
      <div className="shp-display" style={{ fontWeight: 700, fontSize: 19, display: "flex", alignItems: "center", gap: 8, padding: "0 8px", marginBottom: 30 }}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
          <path d="M4 18C4 10 9 5 18 5" stroke={COLORS.blue} strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="19" cy="5" r="2.4" fill={COLORS.blue} />
        </svg>
        Shape
      </div>
      <div style={{ marginBottom: 18 }}>
        {NAV_MAIN.map((i) => (
          <Item key={i.id} item={i} />
        ))}
      </div>
      <div style={{ height: 1, background: COLORS.line, margin: "6px 8px 14px" }} />
      <div style={{ marginBottom: 18 }}>
        {NAV_PRO.map((i) => (
          <Item key={i.id} item={i} />
        ))}
      </div>
      <div style={{ height: 1, background: COLORS.line, margin: "6px 8px 14px" }} />
      <div>
        {NAV_END.map((i) => (
          <Item key={i.id} item={i} />
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ borderTop: `1px solid ${COLORS.line}`, paddingTop: 14, padding: "14px 8px 4px" }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{business.nombre}</div>
        <div className="shp-mono" style={{ fontSize: 11, color: COLORS.inkFaint, marginBottom: 12 }}>
          Plan {plan === "free" ? "Free" : "Pro"} · demo
        </div>
        <Btn size="sm" variant="subtle" full onClick={() => setPlan(plan === "free" ? "pro" : "free")}>
          {plan === "free" ? "Simular upgrade a Pro" : "Volver a plan Free"}
        </Btn>
      </div>
    </div>
  );
}

/* ============================= DASHBOARD (INICIO) ============================= */

function Inicio({ business, results, roadmapProgress, goTo }) {
  const last = results[results.length - 1];
  const first = results[0];
  const variacion = ((last.facturacion - first.facturacion) / first.facturacion) * 100;
  const objetivoMonto = Math.round(business.facturacion * (1 + business.magnitud / 100));
  const avanceObjetivo = ((last.facturacion - business.facturacion) / (objetivoMonto - business.facturacion)) * 100;
  const dia = 43;
  const totalDias = business.plazoMeses === "custom" ? 180 : business.plazoMeses * 30;

  return (
    <div style={{ maxWidth: 860 }}>
      <h1 className="shp-display" style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>
        Buen día.
      </h1>
      <p style={{ color: COLORS.inkSoft, fontSize: 15, marginBottom: 34 }}>Así viene avanzando {business.nombre} hacia su objetivo.</p>

      <div style={{ border: `1px solid ${COLORS.line}`, borderRadius: 16, padding: 28, marginBottom: 20 }}>
        <div className="shp-mono" style={{ fontSize: 11.5, color: COLORS.inkFaint, marginBottom: 8 }}>
          TU OBJETIVO
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div className="shp-display" style={{ fontSize: 22, fontWeight: 700 }}>
              {business.objetivoTipo} +{business.magnitud}%
            </div>
            <div style={{ fontSize: 14, color: COLORS.inkSoft, marginTop: 4 }}>
              {money(business.facturacion)} → {money(objetivoMonto)}
            </div>
          </div>
          <div className="shp-mono" style={{ fontSize: 12.5, color: COLORS.inkSoft }}>
            Día {dia} de {totalDias}
          </div>
        </div>
        <div style={{ height: 8, background: COLORS.paperDim, borderRadius: 999, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(100, (dia / totalDias) * 100)}%`, background: COLORS.blue }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 20 }}>
        <div style={{ border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: 20 }}>
          <div className="shp-mono" style={{ fontSize: 11, color: COLORS.inkFaint, marginBottom: 8 }}>
            FACTURACIÓN ACTUAL
          </div>
          <div className="shp-display" style={{ fontSize: 21, fontWeight: 700 }}>
            {money(last.facturacion)}
          </div>
        </div>
        <div style={{ border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: 20 }}>
          <div className="shp-mono" style={{ fontSize: 11, color: COLORS.inkFaint, marginBottom: 8 }}>
            VARIACIÓN (6M)
          </div>
          <div className="shp-display" style={{ fontSize: 21, fontWeight: 700, color: COLORS.olive }}>
            {pct(variacion)}
          </div>
        </div>
        <div style={{ border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: 20 }}>
          <div className="shp-mono" style={{ fontSize: 11, color: COLORS.inkFaint, marginBottom: 8 }}>
            ESTADO
          </div>
          <div className="shp-display" style={{ fontSize: 17, fontWeight: 700, color: COLORS.blue }}>
            En camino
          </div>
        </div>
      </div>

      <div style={{ border: `1px solid ${COLORS.line}`, borderRadius: 16, padding: 26, background: COLORS.paperDim }}>
        <div className="shp-mono" style={{ fontSize: 11.5, color: COLORS.blue, marginBottom: 10 }}>
          PRIORIDAD ACTUAL
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Aumentar adquisición de clientes</h3>
        <p style={{ fontSize: 14, color: COLORS.inkSoft, lineHeight: 1.55, marginBottom: 20 }}>
          El ticket promedio aumentó 6,3%, pero la cantidad de clientes solamente aumentó 1,1%. Durante las próximas semanas conviene priorizar adquisición.
        </p>
        <Btn variant="accent" onClick={() => goTo("acciones")}>
          Ver acciones
        </Btn>
      </div>
    </div>
  );
}

/* ============================= ESTRATEGIA (ROADMAP) ============================= */

function Estrategia({ stages, toggleAction, business }) {
  const [openId, setOpenId] = useState(stages[1].id);
  const allActions = stages.flatMap((s) => s.acciones);
  const done = allActions.filter((a) => a.done).length;
  const progress = Math.round((done / allActions.length) * 100);

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 30, flexWrap: "wrap", gap: 14 }}>
        <div>
          <h1 className="shp-display" style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>
            Mi estrategia
          </h1>
          <p style={{ color: COLORS.inkSoft, fontSize: 14.5 }}>
            {business.objetivoTipo} +{business.magnitud}% en {business.plazoMeses === "custom" ? business.plazoFecha : `${business.plazoMeses} meses`}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="shp-display" style={{ fontSize: 22, fontWeight: 700, color: COLORS.blue }}>
            {progress}%
          </div>
          <div className="shp-mono" style={{ fontSize: 11.5, color: COLORS.inkFaint }}>
            avance de acciones
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 30 }}>
        {stages.map((s) => {
          const d = s.acciones.filter((a) => a.done).length;
          const full = d === s.acciones.length;
          return (
            <div
              key={s.id}
              onClick={() => setOpenId(s.id)}
              style={{
                flex: 1,
                cursor: "pointer",
                padding: "14px 14px",
                borderRadius: 10,
                border: `1.5px solid ${openId === s.id ? COLORS.blue : COLORS.line}`,
                background: openId === s.id ? COLORS.blueSoft : "#fff",
              }}
            >
              <div className="shp-mono" style={{ fontSize: 10.5, color: full ? COLORS.olive : COLORS.inkFaint, marginBottom: 6 }}>
                {s.mes.toUpperCase()} {full ? "· ✓" : ""}
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: openId === s.id ? COLORS.blueDeep : COLORS.ink }}>{s.titulo}</div>
            </div>
          );
        })}
      </div>

      {stages
        .filter((s) => s.id === openId)
        .map((s) => (
          <div key={s.id} className="shp-fadeup" style={{ border: `1px solid ${COLORS.line}`, borderRadius: 16, padding: 30 }}>
            <div className="shp-mono" style={{ fontSize: 11.5, color: COLORS.blue, marginBottom: 8 }}>
              {s.mes.toUpperCase()} · OBJETIVO DE LA ETAPA
            </div>
            <h3 style={{ fontSize: 19, fontWeight: 700, marginBottom: 20 }}>{s.objetivo}</h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.inkFaint, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Qué vamos a hacer
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.55 }}>{s.que}</p>
              </div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.inkFaint, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Por qué
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.55 }}>{s.porque}</p>
              </div>
            </div>

            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.inkFaint, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Acciones
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {s.acciones.map((a) => (
                  <label
                    key={a.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      borderRadius: 10,
                      background: a.done ? COLORS.oliveSoft : COLORS.paperDim,
                      cursor: "pointer",
                    }}
                  >
                    <input type="checkbox" checked={a.done} onChange={() => toggleAction(s.id, a.id)} style={{ accentColor: COLORS.olive, width: 16, height: 16 }} />
                    <span style={{ fontSize: 14, textDecoration: a.done ? "line-through" : "none", color: a.done ? COLORS.inkSoft : COLORS.ink }}>{a.texto}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.inkFaint, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Indicadores que vamos a observar
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {s.indicadores.map((ind) => (
                  <span key={ind} className="shp-mono" style={{ fontSize: 12, padding: "6px 12px", borderRadius: 999, border: `1px solid ${COLORS.line}`, color: COLORS.inkSoft }}>
                    {ind}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}

/* ============================= ACCIONES ============================= */

function Acciones({ actions, toggleAction }) {
  const [openAction, setOpenAction] = useState(null);
  const groups = [
    { id: "alta", label: "Prioridad alta" },
    { id: "semana", label: "Esta semana" },
    { id: "proximamente", label: "Próximamente" },
  ];

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 className="shp-display" style={{ fontSize: 26, fontWeight: 700, marginBottom: 30 }}>
        Acciones
      </h1>
      {groups.map((g) => {
        const items = actions.filter((a) => a.grupo === g.id);
        if (!items.length) return null;
        return (
          <div key={g.id} style={{ marginBottom: 32 }}>
            <div className="shp-mono" style={{ fontSize: 12, color: COLORS.inkFaint, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {g.label}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((a) => (
                <div
                  key={a.id}
                  onClick={() => setOpenAction(a)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "16px 18px",
                    borderRadius: 12,
                    border: `1px solid ${COLORS.line}`,
                    cursor: "pointer",
                    background: a.done ? COLORS.oliveSoft : "#fff",
                  }}
                >
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      border: `1.5px solid ${a.done ? COLORS.olive : COLORS.lineStrong}`,
                      background: a.done ? COLORS.olive : "transparent",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      flexShrink: 0,
                    }}
                  >
                    {a.done ? "✓" : ""}
                  </span>
                  <span style={{ fontSize: 14.5, fontWeight: 500, textDecoration: a.done ? "line-through" : "none", color: a.done ? COLORS.inkSoft : COLORS.ink, flex: 1 }}>
                    {a.titulo}
                  </span>
                  <span style={{ color: COLORS.inkFaint, fontSize: 13 }}>→</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {openAction && (
        <Modal title={openAction.titulo} onClose={() => setOpenAction(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, fontSize: 14, lineHeight: 1.55 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.inkFaint, marginBottom: 6, textTransform: "uppercase" }}>Qué hacer</div>
              {openAction.detalle.que}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.inkFaint, marginBottom: 6, textTransform: "uppercase" }}>Por qué Shape lo recomienda</div>
              {openAction.detalle.porque}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.inkFaint, marginBottom: 6, textTransform: "uppercase" }}>Impacto esperado</div>
              {openAction.detalle.impacto}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.inkFaint, marginBottom: 8, textTransform: "uppercase" }}>Indicadores relacionados</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {openAction.detalle.indicadores.map((i) => (
                  <span key={i} className="shp-mono" style={{ fontSize: 11.5, padding: "5px 10px", borderRadius: 999, border: `1px solid ${COLORS.line}`, color: COLORS.inkSoft }}>
                    {i}
                  </span>
                ))}
              </div>
            </div>
            <Btn variant={openAction.done ? "subtle" : "accent"} full onClick={() => { toggleAction(openAction.id); setOpenAction({ ...openAction, done: !openAction.done }); }}>
              {openAction.done ? "Marcada como completada ✓" : "Marcar como completada"}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ============================= RESULTADOS ============================= */

function Resultados({ results, addResult }) {
  const [filter, setFilter] = useState("6m");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ fecha: "", facturacion: "", ventas: "", clientes: "", ticket: "", inversion: "", gastos: "" });

  const filters = [
    { id: "7d", l: "7 días" },
    { id: "30d", l: "30 días" },
    { id: "3m", l: "3 meses" },
    { id: "6m", l: "6 meses" },
    { id: "12m", l: "12 meses" },
    { id: "custom", l: "Personalizado" },
  ];

  const max = Math.max(...results.map((r) => r.facturacion));
  const min = Math.min(...results.map((r) => r.facturacion));

  const submit = () => {
    if (!form.fecha || !form.facturacion) return;
    addResult({
      id: "r" + Date.now(),
      fecha: form.fecha,
      facturacion: Number(form.facturacion),
      ventas: Number(form.ventas) || 0,
      clientes: Number(form.clientes) || 0,
      ticket: Number(form.ticket) || 0,
      inversion: Number(form.inversion) || 0,
      gastos: Number(form.gastos) || 0,
    });
    setForm({ fecha: "", facturacion: "", ventas: "", clientes: "", ticket: "", inversion: "", gastos: "" });
    setShowModal(false);
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <h1 className="shp-display" style={{ fontSize: 26, fontWeight: 700 }}>
          Resultados
        </h1>
        <Btn variant="accent" onClick={() => setShowModal(true)}>
          + Agregar datos
        </Btn>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              padding: "7px 14px",
              borderRadius: 999,
              fontSize: 13,
              border: `1px solid ${filter === f.id ? COLORS.blue : COLORS.line}`,
              background: filter === f.id ? COLORS.blueSoft : "#fff",
              color: filter === f.id ? COLORS.blueDeep : COLORS.inkSoft,
              fontWeight: 500,
            }}
          >
            {f.l}
          </button>
        ))}
      </div>

      <div style={{ border: `1px solid ${COLORS.line}`, borderRadius: 16, padding: 28, marginBottom: 26 }}>
        <div className="shp-mono" style={{ fontSize: 11.5, color: COLORS.inkFaint, marginBottom: 20 }}>
          FACTURACIÓN MENSUAL
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 160 }}>
          {results.map((r) => {
            const h = 20 + ((r.facturacion - min) / (max - min || 1)) * 120;
            return (
              <div key={r.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{ width: "100%", height: h, background: COLORS.blueSoft, borderRadius: "6px 6px 0 0", position: "relative" }}>
                  <div style={{ position: "absolute", inset: 0, background: COLORS.blue, borderRadius: "6px 6px 0 0", opacity: 0.85 }} />
                </div>
                <div className="shp-mono" style={{ fontSize: 10, color: COLORS.inkFaint }}>
                  {r.fecha.slice(5)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ border: `1px solid ${COLORS.line}`, borderRadius: 16, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: COLORS.paperDim, textAlign: "left" }}>
              {["Fecha", "Facturación", "Ventas", "Clientes", "Ticket", "Inversión", "Gastos"].map((h) => (
                <th key={h} style={{ padding: "12px 16px", fontWeight: 600, color: COLORS.inkSoft, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...results].reverse().map((r) => (
              <tr key={r.id} style={{ borderTop: `1px solid ${COLORS.line}` }}>
                <td style={{ padding: "12px 16px" }}>{r.fecha}</td>
                <td style={{ padding: "12px 16px", fontWeight: 600 }}>{money(r.facturacion)}</td>
                <td style={{ padding: "12px 16px" }}>{r.ventas}</td>
                <td style={{ padding: "12px 16px" }}>{r.clientes}</td>
                <td style={{ padding: "12px 16px" }}>{money(r.ticket)}</td>
                <td style={{ padding: "12px 16px" }}>{money(r.inversion)}</td>
                <td style={{ padding: "12px 16px" }}>{money(r.gastos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title="Agregar datos" onClose={() => setShowModal(false)}>
          <Field label="Fecha">
            <TextInput type="date" value={form.fecha} onChange={(v) => setForm({ ...form, fecha: v })} />
          </Field>
          <Field label="Facturación">
            <TextInput type="number" value={form.facturacion} onChange={(v) => setForm({ ...form, facturacion: v })} placeholder="Ej: 10500000" />
          </Field>
          <Field label="Cantidad de ventas">
            <TextInput type="number" value={form.ventas} onChange={(v) => setForm({ ...form, ventas: v })} placeholder="Ej: 1420" />
          </Field>
          <Field label="Clientes">
            <TextInput type="number" value={form.clientes} onChange={(v) => setForm({ ...form, clientes: v })} placeholder="Ej: 1460" />
          </Field>
          <Field label="Ticket promedio">
            <TextInput type="number" value={form.ticket} onChange={(v) => setForm({ ...form, ticket: v })} placeholder="Ej: 6950" />
          </Field>
          <Field label="Inversión publicitaria">
            <TextInput type="number" value={form.inversion} onChange={(v) => setForm({ ...form, inversion: v })} placeholder="Ej: 190000" />
          </Field>
          <Field label="Gastos básicos">
            <TextInput type="number" value={form.gastos} onChange={(v) => setForm({ ...form, gastos: v })} placeholder="Ej: 3650000" />
          </Field>
          <Btn variant="accent" full onClick={submit}>
            Guardar
          </Btn>
        </Modal>
      )}
    </div>
  );
}

/* ============================= MI NEGOCIO ============================= */

function MiNegocio({ ventas, setVentas, clientes, setClientes, productos, setProductos, gastos, setGastos }) {
  const [tab, setTab] = useState("resumen");
  const [modal, setModal] = useState(null);
  const tabs = [
    { id: "resumen", l: "Resumen" },
    { id: "ventas", l: "Ventas" },
    { id: "clientes", l: "Clientes" },
    { id: "productos", l: "Productos" },
    { id: "gastos", l: "Gastos" },
  ];

  const [vForm, setVForm] = useState({ producto: "", monto: "", cliente: "" });
  const [cForm, setCForm] = useState({ nombre: "", tipo: "Nuevo" });
  const [pForm, setPForm] = useState({ nombre: "", precio: "", margen: "" });
  const [gForm, setGForm] = useState({ categoria: "", monto: "" });

  const today = () => new Date().toISOString().slice(0, 10);

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 className="shp-display" style={{ fontSize: 26, fontWeight: 700, marginBottom: 22 }}>
        Mi negocio
      </h1>
      <div style={{ display: "flex", gap: 4, marginBottom: 26, borderBottom: `1px solid ${COLORS.line}` }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 16px",
              border: "none",
              background: "none",
              fontSize: 14,
              fontWeight: 500,
              color: tab === t.id ? COLORS.ink : COLORS.inkFaint,
              borderBottom: `2px solid ${tab === t.id ? COLORS.blue : "transparent"}`,
            }}
          >
            {t.l}
          </button>
        ))}
      </div>

      {tab === "resumen" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
          {[
            ["Ventas registradas", ventas.length],
            ["Clientes", clientes.length],
            ["Productos activos", productos.length],
            ["Gastos del mes", money(gastos.reduce((s, g) => s + g.monto, 0))],
          ].map(([l, v]) => (
            <div key={l} style={{ border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: 20 }}>
              <div className="shp-mono" style={{ fontSize: 11, color: COLORS.inkFaint, marginBottom: 8 }}>
                {l.toUpperCase()}
              </div>
              <div className="shp-display" style={{ fontSize: 20, fontWeight: 700 }}>
                {v}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "ventas" && (
        <div>
          <Btn variant="accent" size="sm" onClick={() => setModal("venta")} style={{ marginBottom: 16 }}>
            + Agregar venta
          </Btn>
          <SimpleTable
            headers={["Fecha", "Producto", "Cliente", "Monto"]}
            rows={ventas.map((v) => [v.fecha, v.producto, v.cliente, money(v.monto)])}
          />
        </div>
      )}

      {tab === "clientes" && (
        <div>
          <Btn variant="accent" size="sm" onClick={() => setModal("cliente")} style={{ marginBottom: 16 }}>
            + Agregar cliente
          </Btn>
          <SimpleTable
            headers={["Nombre", "Tipo", "Última compra", "Total gastado"]}
            rows={clientes.map((c) => [c.nombre, c.tipo, c.ultimaCompra, money(c.totalGastado)])}
          />
        </div>
      )}

      {tab === "productos" && (
        <div>
          <Btn variant="accent" size="sm" onClick={() => setModal("producto")} style={{ marginBottom: 16 }}>
            + Agregar producto
          </Btn>
          <SimpleTable headers={["Nombre", "Precio", "Margen"]} rows={productos.map((p) => [p.nombre, money(p.precio), p.margen])} />
        </div>
      )}

      {tab === "gastos" && (
        <div>
          <Btn variant="accent" size="sm" onClick={() => setModal("gasto")} style={{ marginBottom: 16 }}>
            + Agregar gasto
          </Btn>
          <SimpleTable headers={["Fecha", "Categoría", "Monto"]} rows={gastos.map((g) => [g.fecha, g.categoria, money(g.monto)])} />
        </div>
      )}

      {modal === "venta" && (
        <Modal title="Agregar venta" onClose={() => setModal(null)}>
          <Field label="Producto / servicio">
            <TextInput value={vForm.producto} onChange={(v) => setVForm({ ...vForm, producto: v })} placeholder="Ej: Combo desayuno" />
          </Field>
          <Field label="Cliente">
            <TextInput value={vForm.cliente} onChange={(v) => setVForm({ ...vForm, cliente: v })} placeholder="Ej: Consumidor final" />
          </Field>
          <Field label="Monto">
            <TextInput type="number" value={vForm.monto} onChange={(v) => setVForm({ ...vForm, monto: v })} placeholder="Ej: 6400" />
          </Field>
          <Btn
            variant="accent"
            full
            onClick={() => {
              if (!vForm.producto || !vForm.monto) return;
              setVentas([{ id: "v" + Date.now(), fecha: today(), producto: vForm.producto, cliente: vForm.cliente || "Consumidor final", monto: Number(vForm.monto) }, ...ventas]);
              setVForm({ producto: "", monto: "", cliente: "" });
              setModal(null);
            }}
          >
            Guardar venta
          </Btn>
        </Modal>
      )}

      {modal === "cliente" && (
        <Modal title="Agregar cliente" onClose={() => setModal(null)}>
          <Field label="Nombre">
            <TextInput value={cForm.nombre} onChange={(v) => setCForm({ ...cForm, nombre: v })} placeholder="Ej: Julián Pérez" />
          </Field>
          <Field label="Tipo">
            <Select value={cForm.tipo} onChange={(v) => setCForm({ ...cForm, tipo: v })} options={["Nuevo", "Recurrente"]} placeholder="Elegí" />
          </Field>
          <Btn
            variant="accent"
            full
            onClick={() => {
              if (!cForm.nombre) return;
              setClientes([{ id: "c" + Date.now(), nombre: cForm.nombre, tipo: cForm.tipo, ultimaCompra: today(), totalGastado: 0 }, ...clientes]);
              setCForm({ nombre: "", tipo: "Nuevo" });
              setModal(null);
            }}
          >
            Guardar cliente
          </Btn>
        </Modal>
      )}

      {modal === "producto" && (
        <Modal title="Agregar producto" onClose={() => setModal(null)}>
          <Field label="Nombre">
            <TextInput value={pForm.nombre} onChange={(v) => setPForm({ ...pForm, nombre: v })} placeholder="Ej: Té de especialidad" />
          </Field>
          <Field label="Precio">
            <TextInput type="number" value={pForm.precio} onChange={(v) => setPForm({ ...pForm, precio: v })} placeholder="Ej: 4500" />
          </Field>
          <Field label="Margen aproximado">
            <TextInput value={pForm.margen} onChange={(v) => setPForm({ ...pForm, margen: v })} placeholder="Ej: 55%" />
          </Field>
          <Btn
            variant="accent"
            full
            onClick={() => {
              if (!pForm.nombre || !pForm.precio) return;
              setProductos([{ id: "p" + Date.now(), nombre: pForm.nombre, precio: Number(pForm.precio), margen: pForm.margen || "—" }, ...productos]);
              setPForm({ nombre: "", precio: "", margen: "" });
              setModal(null);
            }}
          >
            Guardar producto
          </Btn>
        </Modal>
      )}

      {modal === "gasto" && (
        <Modal title="Agregar gasto" onClose={() => setModal(null)}>
          <Field label="Categoría">
            <TextInput value={gForm.categoria} onChange={(v) => setGForm({ ...gForm, categoria: v })} placeholder="Ej: Insumos" />
          </Field>
          <Field label="Monto">
            <TextInput type="number" value={gForm.monto} onChange={(v) => setGForm({ ...gForm, monto: v })} placeholder="Ej: 120000" />
          </Field>
          <Btn
            variant="accent"
            full
            onClick={() => {
              if (!gForm.categoria || !gForm.monto) return;
              setGastos([{ id: "g" + Date.now(), fecha: today(), categoria: gForm.categoria, monto: Number(gForm.monto) }, ...gastos]);
              setGForm({ categoria: "", monto: "" });
              setModal(null);
            }}
          >
            Guardar gasto
          </Btn>
        </Modal>
      )}
    </div>
  );
}

function SimpleTable({ headers, rows }) {
  if (!rows.length)
    return (
      <div style={{ border: `1px dashed ${COLORS.line}`, borderRadius: 12, padding: 30, textAlign: "center", color: COLORS.inkFaint, fontSize: 14 }}>
        Todavía no hay datos acá. Agregá el primero arriba.
      </div>
    );
  return (
    <div style={{ border: `1px solid ${COLORS.line}`, borderRadius: 14, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
        <thead>
          <tr style={{ background: COLORS.paperDim }}>
            {headers.map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "11px 16px", fontSize: 11.5, color: COLORS.inkSoft, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${COLORS.line}` }}>
              {r.map((c, j) => (
                <td key={j} style={{ padding: "11px 16px" }}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ============================= COMPETENCIA (PRO) ============================= */

function Competencia({ plan, unlockPro }) {
  if (plan === "free") {
    return (
      <div style={{ maxWidth: 720 }}>
        <h1 className="shp-display" style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>
          Competencia
        </h1>
        <p style={{ color: COLORS.inkSoft, fontSize: 14.5, marginBottom: 26 }}>Compará tu presencia digital con negocios similares en tu zona.</p>
        <div style={{ position: "relative", border: `1px solid ${COLORS.line}`, borderRadius: 16, overflow: "hidden" }}>
          <div style={{ filter: "blur(5px)", opacity: 0.6, padding: 26 }}>
            <CompetenciaTable />
          </div>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              background: "rgba(247,247,245,0.55)",
            }}
          >
            <ProBadge />
            <p style={{ fontSize: 14.5, fontWeight: 600, maxWidth: 260, textAlign: "center" }}>Vas a poder ver tu posición frente a tu competencia</p>
            <Btn variant="primary" onClick={unlockPro}>
              Desbloquear con Shape Pro
            </Btn>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ maxWidth: 780 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <h1 className="shp-display" style={{ fontSize: 26, fontWeight: 700 }}>
          Competencia
        </h1>
        <ProBadge />
      </div>
      <p style={{ color: COLORS.inkSoft, fontSize: 14.5, marginBottom: 8 }}>Cómo se compara Noma Café con negocios similares en Palermo.</p>
      <div className="shp-mono" style={{ fontSize: 11.5, color: COLORS.inkFaint, marginBottom: 24 }}>
        * Datos de demostración, no representan información real de negocios existentes.
      </div>
      <CompetenciaTable />
    </div>
  );
}

function CompetenciaTable() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {COMPETITORS_SEED.map((c) => (
        <div
          key={c.nombre}
          style={{
            border: `1px solid ${c.tuyo ? COLORS.blue : COLORS.line}`,
            background: c.tuyo ? COLORS.blueSoft : "#fff",
            borderRadius: 12,
            padding: "16px 20px",
            display: "grid",
            gridTemplateColumns: "1.3fr 0.7fr 0.7fr 1fr 0.7fr",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 14.5 }}>
            {c.nombre} {c.tuyo && <span className="shp-mono" style={{ fontSize: 10.5, color: COLORS.blue }}>(vos)</span>}
          </div>
          <div style={{ fontSize: 13 }}>★ {c.rating}</div>
          <div style={{ fontSize: 13 }}>{c.resenas} reseñas</div>
          <div>
            <div style={{ height: 6, borderRadius: 999, background: COLORS.paperDim, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${c.actividad}%`, background: c.tuyo ? COLORS.blue : COLORS.inkFaint }} />
            </div>
          </div>
          <div style={{ fontSize: 13, color: c.crecimiento >= 8 ? COLORS.olive : COLORS.inkSoft, fontWeight: 600 }}>+{c.crecimiento}%</div>
        </div>
      ))}
    </div>
  );
}

/* ============================= SHAPE AI (PRO) ============================= */

function ShapeAI({ plan, unlockPro }) {
  const [messages, setMessages] = useState([
    { from: "ai", texto: "Hola, soy Shape AI. Tengo contexto completo de Noma Café — ventas, clientes, marketing y tu estrategia. ¿En qué te puedo ayudar?", tags: [] },
  ]);
  const [input, setInput] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = (text) => {
    const t = text || input;
    if (!t.trim()) return;
    setMessages((m) => [...m, { from: "user", texto: t }]);
    setInput("");
    setTimeout(() => {
      const r = aiRespond(t);
      setMessages((m) => [...m, { from: "ai", texto: r.texto, tags: r.tags }]);
    }, 550);
  };

  if (plan === "free") {
    return (
      <div style={{ maxWidth: 640 }}>
        <h1 className="shp-display" style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>
          Shape AI
        </h1>
        <p style={{ color: COLORS.inkSoft, fontSize: 14.5, marginBottom: 26 }}>
          Una capa de inteligencia sobre los datos de tu negocio — no un chat genérico.
        </p>
        <div style={{ border: `1px solid ${COLORS.line}`, borderRadius: 16, padding: 40, textAlign: "center" }}>
          <ProBadge />
          <p style={{ fontSize: 15, fontWeight: 600, margin: "14px 0 20px" }}>Shape AI está disponible en el plan Pro</p>
          <Btn variant="primary" onClick={unlockPro}>
            Desbloquear con Shape Pro
          </Btn>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680, display: "flex", flexDirection: "column", height: "calc(100vh - 100px)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <h1 className="shp-display" style={{ fontSize: 24, fontWeight: 700 }}>
          Shape AI
        </h1>
        <ProBadge />
      </div>
      <div className="shp-scrollbar" style={{ flex: 1, overflowY: "auto", border: `1px solid ${COLORS.line}`, borderRadius: 16, padding: 22, marginBottom: 16 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 18, display: "flex", flexDirection: "column", alignItems: m.from === "user" ? "flex-end" : "flex-start" }}>
            <div
              style={{
                maxWidth: "80%",
                padding: "12px 16px",
                borderRadius: 14,
                fontSize: 14,
                lineHeight: 1.5,
                background: m.from === "user" ? COLORS.ink : COLORS.paperDim,
                color: m.from === "user" ? COLORS.paper : COLORS.ink,
              }}
            >
              {m.texto}
            </div>
            {m.tags && m.tags.length > 0 && (
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10.5, color: COLORS.inkFaint, alignSelf: "center" }}>usando:</span>
                {m.tags.map((t) => (
                  <span key={t} className="shp-mono" style={{ fontSize: 10.5, padding: "3px 9px", borderRadius: 999, background: COLORS.blueSoft, color: COLORS.blueDeep }}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {AI_SUGGESTED.map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            style={{ fontSize: 12.5, padding: "7px 12px", borderRadius: 999, border: `1px solid ${COLORS.line}`, background: "#fff", color: COLORS.inkSoft }}
          >
            {q}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <TextInput value={input} onChange={setInput} placeholder="Preguntale algo a Shape AI sobre tu negocio..." />
        <Btn variant="accent" onClick={() => send()}>
          Enviar
        </Btn>
      </div>
    </div>
  );
}

/* ============================= SHAPE PARTNER ============================= */

function Partner() {
  const [messages, setMessages] = useState(PARTNER_MESSAGES_SEED);
  const [input, setInput] = useState("");

  const send = () => {
    if (!input.trim()) return;
    setMessages((m) => [...m, { from: "user", texto: input }]);
    setInput("");
    setTimeout(() => {
      setMessages((m) => [...m, { from: "sofia", texto: "Recibido, lo reviso y te cuento en la próxima reunión 👍" }]);
    }, 700);
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 className="shp-display" style={{ fontSize: 26, fontWeight: 700, marginBottom: 22 }}>
        Tu estratega
      </h1>
      <div style={{ display: "flex", gap: 18, alignItems: "center", border: `1px solid ${COLORS.line}`, borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: COLORS.blueSoft, color: COLORS.blueDeep, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 19 }} className="shp-display">
          SM
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Sofía Márquez</div>
          <div style={{ fontSize: 13.5, color: COLORS.inkSoft }}>Estratega de crecimiento</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
        <div style={{ border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: 18 }}>
          <div className="shp-mono" style={{ fontSize: 11, color: COLORS.inkFaint, marginBottom: 6 }}>
            PRÓXIMA REUNIÓN
          </div>
          <div style={{ fontWeight: 600, fontSize: 14.5 }}>Jueves 20 de agosto · 11:00</div>
        </div>
        <div style={{ border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: 18 }}>
          <div className="shp-mono" style={{ fontSize: 11, color: COLORS.inkFaint, marginBottom: 6 }}>
            ÚLTIMA REVISIÓN
          </div>
          <div style={{ fontWeight: 600, fontSize: 14.5 }}>5 de agosto</div>
        </div>
      </div>

      <div style={{ border: `1px solid ${COLORS.line}`, borderRadius: 16, padding: 20, marginBottom: 24 }}>
        <div className="shp-mono" style={{ fontSize: 11.5, color: COLORS.inkFaint, marginBottom: 10 }}>
          ÚLTIMAS RECOMENDACIONES
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.8, color: COLORS.ink }}>
          <li>Priorizar captación por sobre optimización este mes.</li>
          <li>Sumar reseñas antes de aumentar inversión publicitaria.</li>
        </ul>
      </div>

      <div className="shp-mono" style={{ fontSize: 11.5, color: COLORS.inkFaint, marginBottom: 10 }}>
        CHAT CON SOFÍA
      </div>
      <div style={{ border: `1px solid ${COLORS.line}`, borderRadius: 16, padding: 20, marginBottom: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 14, display: "flex", flexDirection: "column", alignItems: m.from === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "78%", padding: "11px 15px", borderRadius: 14, fontSize: 13.5, lineHeight: 1.5, background: m.from === "user" ? COLORS.ink : COLORS.oliveSoft, color: m.from === "user" ? COLORS.paper : COLORS.ink }}>
              {m.texto}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <TextInput value={input} onChange={setInput} placeholder="Escribile a tu estratega..." />
        <Btn variant="accent" onClick={send}>
          Enviar
        </Btn>
      </div>
    </div>
  );
}

/* ============================= CONFIG ============================= */

function Config({ business, plan, setPlan }) {
  return (
    <div style={{ maxWidth: 600 }}>
      <h1 className="shp-display" style={{ fontSize: 26, fontWeight: 700, marginBottom: 26 }}>
        Configuración
      </h1>
      <div style={{ border: `1px solid ${COLORS.line}`, borderRadius: 16, padding: 26, marginBottom: 18 }}>
        <div className="shp-mono" style={{ fontSize: 11.5, color: COLORS.inkFaint, marginBottom: 14 }}>
          PERFIL DEL NEGOCIO
        </div>
        {[
          ["Nombre", business.nombre],
          ["Rubro", business.rubro],
          ["Ubicación", business.ubicacion],
          ["Objetivo", `${business.objetivoTipo} +${business.magnitud}%`],
        ].map(([l, v]) => (
          <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: `1px solid ${COLORS.line}`, fontSize: 14 }}>
            <span style={{ color: COLORS.inkSoft }}>{l}</span>
            <span style={{ fontWeight: 500 }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ border: `1px solid ${COLORS.line}`, borderRadius: 16, padding: 26 }}>
        <div className="shp-mono" style={{ fontSize: 11.5, color: COLORS.inkFaint, marginBottom: 14 }}>
          PLAN ACTUAL
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{plan === "free" ? "Shape Free" : "Shape Pro"}</div>
          <Btn variant="subtle" size="sm" onClick={() => setPlan(plan === "free" ? "pro" : "free")}>
            {plan === "free" ? "Simular upgrade" : "Volver a Free"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* ============================= APP ROOT ============================= */

export default function ShapeApp() {
  const [view, setView] = useState("landing"); // landing | onboarding | generating | ready | app
  const [onboardData, setOnboardData] = useState(null);
  const [business, setBusiness] = useState(DEMO_BUSINESS);
  const [plan, setPlan] = useState("free");
  const [section, setSection] = useState("inicio");

  const [stages, setStages] = useState(STAGES_SEED);
  const [actions, setActions] = useState(ACTIONS_SEED);
  const [results, setResults] = useState(RESULTS_SEED);
  const [ventas, setVentas] = useState(VENTAS_SEED);
  const [clientes, setClientes] = useState(CLIENTES_SEED);
  const [productos, setProductos] = useState(PRODUCTOS_SEED);
  const [gastos, setGastos] = useState(GASTOS_SEED);

  const toggleStageAction = (stageId, actionId) => {
    setStages((prev) => prev.map((s) => (s.id !== stageId ? s : { ...s, acciones: s.acciones.map((a) => (a.id !== actionId ? a : { ...a, done: !a.done })) })));
  };
  const toggleAction = (id) => {
    setActions((prev) => prev.map((a) => (a.id !== id ? a : { ...a, done: !a.done })));
  };
  const addResult = (r) => setResults((prev) => [...prev, r].sort((a, b) => a.fecha.localeCompare(b.fecha)));

  const startOnboarding = () => {
    setOnboardData(null);
    setView("onboarding");
  };

  const finishOnboarding = (data) => {
    setBusiness({
      nombre: data.nombre || "Tu negocio",
      rubro: data.rubro,
      ubicacion: data.ubicacion,
      empleados: data.empleados,
      web: data.web,
      instagram: data.instagram,
      facturacion: Number(data.facturacion) || 10000000,
      clientesMensuales: Number(data.clientesMensuales) || 1450,
      ticketPromedio: Number(data.ticketPromedio) || 6900,
      inversionMarketing: Number(data.inversionMarketing) || 180000,
      canales: data.canales,
      objetivoTipo: data.objetivoTipo || "Aumentar ventas",
      magnitud: data.magnitud,
      plazoMeses: data.plazoMeses,
      plazoFecha: data.plazoFecha,
    });
    setOnboardData(data);
    setView("generating");
  };

  const startDemo = () => {
    setBusiness(DEMO_BUSINESS);
    setOnboardData(DEMO_BUSINESS);
    setSection("inicio");
    setPlan("free");
    setView("app");
  };

  if (view === "landing") return <Landing onStart={startOnboarding} onDemo={startDemo} />;

  if (view === "onboarding")
    return <Onboarding initial={onboardData} onFinish={finishOnboarding} onCancel={() => setView("landing")} />;

  if (view === "generating") return <Generating data={onboardData} onDone={() => setView("ready")} />;

  if (view === "ready")
    return (
      <StrategyReady
        data={onboardData}
        onContinue={() => {
          setSection("estrategia");
          setView("app");
        }}
      />
    );

  return (
    <div className="shp" style={{ display: "flex", minHeight: "100vh" }}>
      <style>{FONTS_CSS}</style>
      <Sidebar active={section} setActive={setSection} plan={plan} setPlan={setPlan} business={business} />
      <div className="shp-scrollbar" style={{ flex: 1, padding: "36px 40px", overflowY: "auto" }}>
        {section === "inicio" && <Inicio business={business} results={results} goTo={setSection} />}
        {section === "estrategia" && <Estrategia stages={stages} toggleAction={toggleStageAction} business={business} />}
        {section === "acciones" && <Acciones actions={actions} toggleAction={toggleAction} />}
        {section === "resultados" && <Resultados results={results} addResult={addResult} />}
        {section === "negocio" && (
          <MiNegocio
            ventas={ventas}
            setVentas={setVentas}
            clientes={clientes}
            setClientes={setClientes}
            productos={productos}
            setProductos={setProductos}
            gastos={gastos}
            setGastos={setGastos}
          />
        )}
        {section === "competencia" && <Competencia plan={plan} unlockPro={() => setPlan("pro")} />}
        {section === "shapeai" && <ShapeAI plan={plan} unlockPro={() => setPlan("pro")} />}
        {section === "partner" && <Partner />}
        {section === "config" && <Config business={business} plan={plan} setPlan={setPlan} />}
      </div>
    </div>
  );
}
