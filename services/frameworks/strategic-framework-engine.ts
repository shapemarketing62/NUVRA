export type FrameworkSlug = 
  | "STP" 
  | "VALUE_PROPOSITION" 
  | "FUNNEL" 
  | "CUSTOMER_JOURNEY" 
  | "AIDA" 
  | "MARKETING_MIX" 
  | "BRAND_POSITIONING" 
  | "CRO" 
  | "ACQUISITION" 
  | "RETENTION";

export interface Framework {
  id: FrameworkSlug;
  name: string;
  description: string;
  applicableTo: string[];
  notApplicableTo?: string[];
}

export interface FrameworkSelection {
  primary: FrameworkSlug;
  secondary: FrameworkSlug[];
  rationale: string;
}

export const FRAMEWORKS: Record<FrameworkSlug, Framework> = {
  STP: {
    id: "STP",
    name: "Segmentación, Targeting, Posicionamiento",
    description: "Marco estratégico para definir mercado, público y posicionamiento.",
    applicableTo: ["posicionamiento", "diferenciación", "público", "propuesta"],
  },
  VALUE_PROPOSITION: {
    id: "VALUE_PROPOSITION",
    name: "Propuesta de Valor",
    description: "Evaluación de problema, beneficio, diferenciación y claridad.",
    applicableTo: ["propuesta", "conversión", "diferenciación"],
  },
  FUNNEL: {
    id: "FUNNEL",
    name: "Embudo de Conversión",
    description: "Análisis de awareness, consideración, conversión y retención.",
    applicableTo: ["conversión", "tráfico", "cuello_de_botella"],
  },
  CUSTOMER_JOURNEY: {
    id: "CUSTOMER_JOURNEY",
    name: "Customer Journey",
    description: "Recorrente del cliente desde descubrimiento hasta recompra.",
    applicableTo: ["experiencia", "retención", "conversión", "fricción"],
  },
  AIDA: {
    id: "AIDA",
    name: "AIDA (Attention, Interest, Desire, Action)",
    description: "Modelo clásico para comunicación y conversión.",
    applicableTo: ["landing", "comunicación", "cta", "conversión"],
    notApplicableTo: ["retención", "servicio"],
  },
  MARKETING_MIX: {
    id: "MARKETING_MIX",
    name: "Marketing Mix (4P/7P)",
    description: "Análisis integral de producto, precio, plaza y promoción.",
    applicableTo: ["estrategia", "modelo_comercial", "precios", "canales"],
  },
  BRAND_POSITIONING: {
    id: "BRAND_POSITIONING",
    name: "Brand Positioning",
    description: "Posicionamiento de marca: categoría, atributos y diferenciación.",
    applicableTo: ["marca", "posicionamiento", "diferenciación", "percepción"],
  },
  CRO: {
    id: "CRO",
    name: "Conversion Rate Optimization",
    description: "Optimización de tasa de conversión.",
    applicableTo: ["conversión", "tráfico", "landing", "cta", "formulario"],
  },
  ACQUISITION: {
    id: "ACQUISITION",
    name: "Adquisición",
    description: "Análisis de canales de adquisición y fuentes de tráfico.",
    applicableTo: ["tráfico", "leads", "ventas", "adquisición"],
  },
  RETENTION: {
    id: "RETENTION",
    name: "Retención y Fidelización",
    description: "Estrategias para recompra y lealtad del cliente.",
    applicableTo: ["retención", "recompra", "fidelización", "clv"],
  },
};

export interface FrameworkContext {
  objetivo: string;
  bottleneck?: string;
  dimensionProblems: string[];
  score: number | null;
  hasWeb: boolean;
  hasInstagram: boolean;
}

export function selectStrategicFrameworks(context: FrameworkContext): FrameworkSelection {
  const applicableFrameworks: FrameworkSlug[] = [];
  const rationale: string[] = [];

  // 1. Análisis del cuello de botella
  if (context.bottleneck) {
    const bottleneck = context.bottleneck.toLowerCase();
    
    if (/conversi|cta|formulario|contacto/i.test(bottleneck)) {
      applicableFrameworks.push("CRO", "FUNNEL", "AIDA");
      rationale.push("Cuello de botella en conversión - aplicar CRO, Funnel y AIDA");
    }
    
    if (/tráfico|visibil|adquisi|seo/i.test(bottleneck)) {
      applicableFrameworks.push("ACQUISITION", "FUNNEL");
      rationale.push("Cuello de botella en adquisición - analizar canales y embudo");
    }
    
    if (/marca|posicion|diferenci/i.test(bottleneck)) {
      applicableFrameworks.push("BRAND_POSITIONING", "STP", "VALUE_PROPOSITION");
      rationale.push("Cuello de botella en posicionamiento - aplicar frameworks de marca");
    }
    
    if (/propuesta|valor|mensaje/i.test(bottleneck)) {
      applicableFrameworks.push("VALUE_PROPOSITION", "STP");
      rationale.push("Cuello de botella en propuesta - clarificar propuesta de valor");
    }
  }

  // 2. Análisis del objetivo
  const objetivo = context.objetivo.toLowerCase();
  
  if (/venta|conversi|reserv|lead|consult/i.test(objetivo)) {
    if (!applicableFrameworks.includes("CRO")) {
      applicableFrameworks.push("CRO");
      rationale.push("Objetivo de conversión - aplicar CRO");
    }
    if (!applicableFrameworks.includes("FUNNEL")) {
      applicableFrameworks.push("FUNNEL");
      rationale.push("Objetivo de conversión - analizar embudo");
    }
  }
  
  if (/reconoc|marca|posicion/i.test(objetivo)) {
    if (!applicableFrameworks.includes("BRAND_POSITIONING")) {
      applicableFrameworks.push("BRAND_POSITIONING");
      rationale.push("Objetivo de posicionamiento - aplicar Brand Positioning");
    }
    if (!applicableFrameworks.includes("STP")) {
      applicableFrameworks.push("STP");
      rationale.push("Objetivo de posicionamiento - aplicar STP");
    }
  }
  
  if (/tráfico|visibil/i.test(objetivo)) {
    if (!applicableFrameworks.includes("ACQUISITION")) {
      applicableFrameworks.push("ACQUISITION");
      rationale.push("Objetivo de tráfico - analizar adquisición");
    }
  }
  
  if (/retención|recompra|fidel/i.test(objetivo)) {
    applicableFrameworks.push("RETENTION", "CUSTOMER_JOURNEY");
    rationale.push("Objetivo de retención - aplicar frameworks de fidelización");
  }

  // 3. Análisis de dimensiones problemáticas
  for (const problem of context.dimensionProblems) {
    if (/conversi|cta/i.test(problem) && !applicableFrameworks.includes("CRO")) {
      applicableFrameworks.push("CRO");
      rationale.push("Problemas de conversión detectados");
    }
    if (/propuesta|valor/i.test(problem) && !applicableFrameworks.includes("VALUE_PROPOSITION")) {
      applicableFrameworks.push("VALUE_PROPOSITION");
      rationale.push("Problemas de propuesta detectados");
    }
    if (/marca|posicion/i.test(problem) && !applicableFrameworks.includes("BRAND_POSITIONING")) {
      applicableFrameworks.push("BRAND_POSITIONING");
      rationale.push("Problemas de posicionamiento detectados");
    }
  }

  // 4. Frameworks por defecto según contexto
  if (applicableFrameworks.length === 0) {
    if (context.hasWeb && context.hasInstagram) {
      applicableFrameworks.push("FUNNEL", "CUSTOMER_JOURNEY");
      rationale.push("Contexto digital completo - aplicar Funnel y Customer Journey");
    } else if (context.hasWeb) {
      applicableFrameworks.push("CRO", "VALUE_PROPOSITION");
      rationale.push("Contexto web solamente - optimizar conversión y propuesta");
    } else {
      applicableFrameworks.push("STP", "MARKETING_MIX");
      rationale.push("Contexto limitado - aplicar frameworks estratégicos generales");
    }
  }

  // Eliminar duplicados manteniendo orden
  const uniqueFrameworks = Array.from(new Set(applicableFrameworks));

  // Seleccionar framework primario (primero de la lista)
  const primary = uniqueFrameworks[0] || "STP";
  const secondary = uniqueFrameworks.slice(1);

  return {
    primary,
    secondary,
    rationale: rationale.join(". "),
  };
}

export function applyFrameworkLogic(
  framework: FrameworkSlug,
  data: Record<string, unknown>
): Record<string, unknown> {
  // Implementación básica de lógica por framework
  // Esto se expandirá según necesidades específicas
  
  switch (framework) {
    case "STP":
      return {
        segmentation: analyzeSegmentation(data),
        targeting: analyzeTargeting(data),
        positioning: analyzePositioning(data),
      };
    
    case "FUNNEL":
      return {
        awareness: analyzeFunnelStage(data, "awareness"),
        consideration: analyzeFunnelStage(data, "consideration"),
        conversion: analyzeFunnelStage(data, "conversion"),
        retention: analyzeFunnelStage(data, "retention"),
      };
    
    case "AIDA":
      return {
        attention: analyzeAIDAStage(data, "attention"),
        interest: analyzeAIDAStage(data, "interest"),
        desire: analyzeAIDAStage(data, "desire"),
        action: analyzeAIDAStage(data, "action"),
      };
    
    default:
      return { framework_applied: framework, data };
  }
}

// Funciones helper para implementación de frameworks
function analyzeSegmentation(data: Record<string, unknown>): Record<string, unknown> {
  return { status: "analyzed", method: "demographic_psychographic" };
}

function analyzeTargeting(data: Record<string, unknown>): Record<string, unknown> {
  return { status: "analyzed", method: "behavioral_contextual" };
}

function analyzePositioning(data: Record<string, unknown>): Record<string, unknown> {
  return { status: "analyzed", method: "perceptual_competitive" };
}

function analyzeFunnelStage(data: Record<string, unknown>, stage: string): Record<string, unknown> {
  return { stage, status: "analyzed", metrics: [] };
}

function analyzeAIDAStage(data: Record<string, unknown>, stage: string): Record<string, unknown> {
  return { stage, status: "analyzed", tactics: [] };
}