export const DEMO_BUSINESS = {
  nombre: "NEGOCIO DEMO",
  rubro: "Escenario ficticio",
  ubicacion: "Ubicación demostrativa",
  objetivoTipo: "Validar una oportunidad comercial",
  magnitud: 10,
  plazoMeses: 3,
  plazoLabel: "3 meses",
};

export const DEMO_SCORE = {
  total: 58,
  dimensions: [
    { slug: "presencia", name: "Presencia Digital", points: 68, weight: 0.15 },
    { slug: "conversion", name: "Conversión", points: 47, weight: 0.2 },
    { slug: "posicionamiento", name: "Posicionamiento", points: 52, weight: 0.15 },
    { slug: "propuesta", name: "Propuesta de Valor", points: 55, weight: 0.15 },
    { slug: "redes", name: "Redes Sociales", points: 51, weight: 0.15 },
    { slug: "adquisicion", name: "Adquisición", points: 49, weight: 0.2 },
  ],
};

export const DEMO_DIAGNOSIS = {
  summary: "NEGOCIO DEMO presenta una oportunidad comercial para validar. Estos datos son ficticios y no provienen de un análisis real.",
  bottleneck: {
    dimension: "Conversión",
    title: "CTA principal poco visible",
    explanation: "DEMO: el CTA principal aparece recién después del segundo bloque de contenido.",
  },
  priorities: [
    { title: "Mejorar CTAs en home", reason: "DEMO: CTAs poco visibles", order: 1 },
    { title: "Agregar WhatsApp en navegación", reason: "DEMO: WhatsApp no visible", order: 2 },
    { title: "Conectar Instagram", reason: "DEMO: redes sin datos reales", order: 3 },
  ],
  opportunities: [
    "Optimizar el CTA principal puede aumentar consultas en un 20–30%.",
    "Conectar Instagram y sincronizar mensajes mejora la percepción de marca.",
  ],
  risks: [
    "Sin datos de redes sociales, el diagnóstico de esa dimensión es limitado.",
  ],
};

export const DEMO_ACTIONS = [
  {
    id: "demo-1",
    title: "Mejorar visibilidad de CTAs",
    impact: "alto",
    difficulty: "baja",
    estimatedTime: "1–2 semanas",
    rationale: "DEMO: basado en hallazgo simulado de conversión.",
    done: false,
  },
  {
    id: "demo-2",
    title: "Agregar testimonios en home",
    impact: "medio",
    difficulty: "media",
    estimatedTime: "2–3 semanas",
    rationale: "DEMO: señales de confianza limitadas.",
    done: false,
  },
];

export const DEMO_STAGES = [
  {
    id: 1,
    mes: "Mes 1",
    titulo: "Conversión",
    objetivo: "DEMO: Mejorar la tasa de conversión del tráfico existente.",
    acciones: [{ id: "a1", texto: "Optimizar CTA principal", done: false }],
  },
];

export const DEMO_RESULTS = [
  { id: "r1", fecha: "2026-06-04", facturacion: 9800000, clientes: 1415, ticket: 6790 },
  { id: "r2", fecha: "2026-08-06", facturacion: 10420000, clientes: 1450, ticket: 6900 },
];

export const DEMO_COMPETITORS = [
  { nombre: "NEGOCIO DEMO", rating: 4.3, resenas: 212, actividad: 74, tuyo: true },
  { nombre: "COMPETIDOR DEMO", rating: 4.6, resenas: 388, actividad: 91 },
];
