export type SiteType =
  | "ecommerce"
  | "restaurante"
  | "cafeteria"
  | "servicios"
  | "saas"
  | "marketplace"
  | "corporativo"
  | "lead_generation"
  | "otro";

export interface SiteTypeSignal {
  keyword: string;
  weight: number;
}

export interface SiteTypeRule {
  signals: SiteTypeSignal[];
  minScore: number;
  minSignals: number;
}

export interface SiteTypeResult {
  siteType: SiteType;
  confidence: "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE";
  evidence: string[];
}

const SITE_TYPE_RULES: Record<Exclude<SiteType, "otro">, SiteTypeRule> = {
  ecommerce: {
    signals: [
      { keyword: "carrito", weight: 3 },
      { keyword: "cart", weight: 3 },
      { keyword: "checkout", weight: 3 },
      { keyword: "compra", weight: 2 },
      { keyword: "precio", weight: 2 },
      { keyword: "add to cart", weight: 3 },
      { keyword: "catalogo", weight: 2 },
      { keyword: "catálogo", weight: 2 },
      { keyword: "producto", weight: 1 },
      { keyword: "product", weight: 1 },
      { keyword: "tienda", weight: 2 },
      { keyword: "shop", weight: 2 },
      { keyword: "envío", weight: 1 },
      { keyword: "envio", weight: 1 },
      { keyword: "shipping", weight: 1 },
      { keyword: "pagar", weight: 2 },
    ],
    minScore: 5,
    minSignals: 2,
  },
  restaurante: {
    signals: [
      { keyword: "menú", weight: 3 },
      { keyword: "menu", weight: 3 },
      { keyword: "reserva", weight: 3 },
      { keyword: "reservas", weight: 3 },
      { keyword: "pedido", weight: 2 },
      { keyword: "delivery", weight: 2 },
      { keyword: "takeaway", weight: 2 },
      { keyword: "horarios", weight: 2 },
      { keyword: "ubicación", weight: 1 },
      { keyword: "ubicacion", weight: 1 },
      { keyword: "location", weight: 1 },
      { keyword: "store locator", weight: 2 },
      { keyword: "food", weight: 1 },
      { keyword: "drinks", weight: 1 },
      { keyword: "comida", weight: 1 },
      { keyword: "bebidas", weight: 1 },
      { keyword: "establecimientos", weight: 2 },
      { keyword: "sucursales", weight: 2 },
      { keyword: "dirección", weight: 1 },
      { keyword: "direccion", weight: 1 },
      { keyword: "mapa", weight: 1 },
    ],
    minScore: 6,
    minSignals: 2,
  },
  cafeteria: {
    signals: [
      { keyword: "café", weight: 3 },
      { keyword: "cafe", weight: 3 },
      { keyword: "cafeteria", weight: 3 },
      { keyword: "cafetería", weight: 3 },
      { keyword: "coffee", weight: 3 },
      { keyword: "espresso", weight: 2 },
      { keyword: "latte", weight: 2 },
      { keyword: "cappuccino", weight: 2 },
      { keyword: "menú", weight: 2 },
      { keyword: "menu", weight: 2 },
      { keyword: "reserva", weight: 2 },
      { keyword: "reservas", weight: 2 },
      { keyword: "pedido", weight: 1 },
      { keyword: "delivery", weight: 1 },
      { keyword: "takeaway", weight: 1 },
      { keyword: "horarios", weight: 1 },
      { keyword: "sucursales", weight: 2 },
      { keyword: "establecimientos", weight: 2 },
      { keyword: "ubicación", weight: 1 },
      { keyword: "ubicacion", weight: 1 },
    ],
    minScore: 6,
    minSignals: 2,
  },
  servicios: {
    signals: [
      { keyword: "consultoría", weight: 2 },
      { keyword: "consultoria", weight: 2 },
      { keyword: "servicio", weight: 2 },
      { keyword: "profesional", weight: 2 },
      { keyword: "experto", weight: 1 },
      { keyword: "asesoría", weight: 2 },
      { keyword: "asesoria", weight: 2 },
      { keyword: "contacto", weight: 1 },
      { keyword: "formulario", weight: 1 },
      { keyword: "lead", weight: 1 },
      { keyword: "presupuesto", weight: 1 },
      { keyword: "experiencia", weight: 1 },
      { keyword: "casos de éxito", weight: 2 },
      { keyword: "testimonios", weight: 1 },
      { keyword: "portfolio", weight: 1 },
      { keyword: "proyectos", weight: 1 },
    ],
    minScore: 5,
    minSignals: 2,
  },
  saas: {
    signals: [
      { keyword: "saas", weight: 4 },
      { keyword: "software", weight: 2 },
      { keyword: "platform", weight: 2 },
      { keyword: "plataforma", weight: 2 },
      { keyword: "dashboard", weight: 2 },
      { keyword: "subscription", weight: 2 },
      { keyword: "suscripción", weight: 2 },
      { keyword: "suscripcion", weight: 2 },
      { keyword: "trial", weight: 3 },
      { keyword: "demo", weight: 2 },
      { keyword: "pricing", weight: 2 },
      { keyword: "precios", weight: 1 },
      { keyword: "integraciones", weight: 1 },
      { keyword: "integrations", weight: 1 },
      { keyword: "api", weight: 1 },
      { keyword: "cloud", weight: 1 },
    ],
    minScore: 5,
    minSignals: 2,
  },
  marketplace: {
    signals: [
      { keyword: "marketplace", weight: 4 },
      { keyword: "vendedores", weight: 3 },
      { keyword: "sellers", weight: 3 },
      { keyword: "multivendor", weight: 3 },
      { keyword: "proveedores", weight: 2 },
      { keyword: "tiendas", weight: 1 },
      { keyword: "productos", weight: 1 },
      { keyword: "catálogo", weight: 1 },
      { keyword: "catalogo", weight: 1 },
      { keyword: "compra", weight: 1 },
      { keyword: "venta", weight: 1 },
    ],
    minScore: 5,
    minSignals: 2,
  },
  corporativo: {
    signals: [
      { keyword: "empresa", weight: 2 },
      { keyword: "corporativo", weight: 3 },
      { keyword: "nosotros", weight: 2 },
      { keyword: "about", weight: 2 },
      { keyword: "equipo", weight: 2 },
      { keyword: "team", weight: 2 },
      { keyword: "investor", weight: 2 },
      { keyword: "inversores", weight: 2 },
      { keyword: "sostenibilidad", weight: 2 },
      { keyword: "sustainability", weight: 2 },
      { keyword: "governance", weight: 2 },
      { keyword: "gobierno corporativo", weight: 2 },
      { keyword: "marca", weight: 1 },
      { keyword: "historia", weight: 1 },
      { keyword: "values", weight: 1 },
      { keyword: "valores", weight: 1 },
    ],
    minScore: 5,
    minSignals: 2,
  },
  lead_generation: {
    signals: [
      { keyword: "lead generation", weight: 4 },
      { keyword: "leadgen", weight: 4 },
      { keyword: "captación de leads", weight: 3 },
      { keyword: "captacion de leads", weight: 3 },
      { keyword: "formulario", weight: 2 },
      { keyword: "contacto", weight: 1 },
      { keyword: "presupuesto", weight: 1 },
      { keyword: "demo", weight: 2 },
      { keyword: "trial", weight: 2 },
      { keyword: "cotizar", weight: 2 },
      { keyword: "cotización", weight: 2 },
      { keyword: "solicitar", weight: 1 },
      { keyword: "registro", weight: 1 },
      { keyword: "download", weight: 1 },
      { keyword: "descargar", weight: 1 },
    ],
    minScore: 5,
    minSignals: 2,
  },
};

export function classifySiteType(input: {
  businessName?: string;
  rubro?: string;
  goal?: string;
  findings?: Array<{ category: string; title: string; evidence: string }>;
  url?: string;
}): SiteTypeResult {
  const txt = [
    input.businessName || "",
    input.rubro || "",
    input.goal || "",
    input.url || "",
    (input.findings || []).map((f) => `${f.title} ${f.evidence}`).join(" "),
  ]
    .join(" ")
    .toLowerCase();

  let bestType: Exclude<SiteType, "otro"> | null = null;
  let bestScore = 0;
  let bestSignals: string[] = [];
  const allEvidence: string[] = [];

  for (const [type, rule] of Object.entries(SITE_TYPE_RULES)) {
    let score = 0;
    const matchedSignals: string[] = [];

    for (const signal of rule.signals) {
      if (txt.includes(signal.keyword.toLowerCase())) {
        score += signal.weight;
        matchedSignals.push(signal.keyword);
      }
    }

    allEvidence.push(`${type}: score=${score}, signals=[${matchedSignals.join(", ")}]`);

    if (score > bestScore) {
      bestScore = score;
      bestType = type as Exclude<SiteType, "otro">;
      bestSignals = matchedSignals;
    }
  }

  if (!bestType || bestScore < 5 || bestSignals.length < 2) {
    return {
      siteType: "otro",
      confidence: "INSUFICIENTE",
      evidence: allEvidence.length > 0 ? allEvidence : ["Sin señales suficientes para clasificar."],
    };
  }

  const rule = SITE_TYPE_RULES[bestType];
  const confidence = bestScore >= rule.minScore && bestSignals.length >= rule.minSignals ? "ALTA" : "MEDIA";

  return {
    siteType: bestType,
    confidence,
    evidence: [`Tipo clasificado como ${bestType}`, `Puntaje: ${bestScore}`, `Señales: ${bestSignals.join(", ")}`],
  };
}
