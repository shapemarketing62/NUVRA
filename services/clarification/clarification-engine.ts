import type { DimensionResult, ConfidenceLevel } from "@/services/scoring/nuvra-score";
import type { RawFinding } from "@/services/website-analyzer/types";

export interface ClarificationQuestion {
  id: string;
  dimension: string;
  question: string;
  reason: string;
  impact: "high" | "medium" | "low";
  type: "single" | "multiple" | "text";
  options?: string[];
  affects: string;
}

export interface ClarificationResult {
  questions: ClarificationQuestion[];
  dimensionsNeedingClarification: string[];
  confidence: Record<string, ConfidenceLevel>;
}

export function generateClarificationQuestions(
  dimensions: DimensionResult[],
  findings: RawFinding[],
  businessContext: {
    objetivo: string;
    rubro: string;
    hasInstagram: boolean;
  }
): ClarificationResult {
  const questions: ClarificationQuestion[] = [];
  const dimensionsNeedingClarification: string[] = [];

  const add = (q: ClarificationQuestion) => {
    if (questions.some((x) => x.question === q.question && x.dimension === q.dimension)) return;
    questions.push(q);
  };

  for (const dim of dimensions) {
    if (dim.confidence === "INSUFICIENTE" || dim.confidence === "BAJA") {
      dimensionsNeedingClarification.push(dim.slug);

      switch (dim.slug) {
        case "posicionamiento": {
          add({
            id: `pos_marca_${dim.slug}`,
            dimension: "posicionamiento",
            question: "¿Tu marca ya es conocida dentro de tu mercado?",
            reason: "Evidencia SEO insuficiente para evaluar posicionamiento real de marca.",
            impact: "high",
            type: "single",
            options: ["Sí, muy conocida", "Sí, moderadamente conocida", "No, es nueva", "No lo sé"],
            affects: dim.slug,
          });
          add({
            id: `pos_diferencial_${dim.slug}`,
            dimension: "posicionamiento",
            question: "¿Cuál considerás que es tu principal diferencial frente a competidores?",
            reason: "No se detectó diferenciación clara en el contenido analizado.",
            impact: "high",
            type: "single",
            options: ["Precio", "Calidad", "Servicio", "Ubicación", "Innovación", "Especialización", "Otro"],
            affects: dim.slug,
          });
          add({
            id: `pos_fuentes_${dim.slug}`,
            dimension: "posicionamiento",
            question: "¿De dónde llegan actualmente la mayoría de tus clientes?",
            reason: "Sin información sobre fuentes de adquisición, no se puede evaluar posicionamiento efectivo.",
            impact: "high",
            type: "multiple",
            options: ["Boca a boca", "Instagram", "Google/Búsqueda", "Publicidad pagada", "Tráfico directo", "Recomendaciones", "Otro"],
            affects: dim.slug,
          });
          break;
        }
        case "adquisicion": {
          if (!findings.some((f) => f.category === "adquisicion" || f.title.includes("SEO"))) {
            add({
              id: `aq_presupuesto_${dim.slug}`,
              dimension: "adquisicion",
              question: "¿Tenés presupuesto para publicidad digital?",
              reason: "Sin evidencia de canales pagos, no se puede evaluar capacidad de adquisición.",
              impact: "high",
              type: "single",
              options: ["Sí, mensual", "Sí, ocasional", "No", "No lo sé"],
              affects: dim.slug,
            });
            add({
              id: `aq_canal_${dim.slug}`,
              dimension: "adquisicion",
              question: "¿Cuál es tu canal principal de adquisición de clientes?",
              reason: "No se detectaron canales de adquisición principales en el análisis.",
              impact: "high",
              type: "single",
              options: ["Instagram", "Google", "Boca a boca", "Publicidad pagada", "Local/presencial", "Otro"],
              affects: dim.slug,
            });
          }
          break;
        }
        case "conversion": {
          if (dim.points !== null && dim.points < 50) {
            add({
              id: `conv_friction_${dim.slug}`,
              dimension: "conversion",
              question: "¿Cuál creés que es la principal barrera para la conversión en tu web?",
              reason: "Score de conversión bajo - necesito identificar fricción específica.",
              impact: "high",
              type: "single",
              options: ["Proceso de compra complejo", "Falta de confianza", "CTAs poco claros", "Formulario extenso", "No se encuentra información", "Otro"],
              affects: dim.slug,
            });
          }
          break;
        }
        case "propuesta": {
          if (dim.confidence === "INSUFICIENTE") {
            add({
              id: `prop_unico_${dim.slug}`,
              dimension: "propuesta",
              question: "¿Qué hace único a tu negocio comparado con alternativas?",
              reason: "No se detectó diferenciación clara en la propuesta de valor.",
              impact: "high",
              type: "text",
              affects: dim.slug,
            });
          }
          break;
        }
        case "redes": {
          if (!businessContext.hasInstagram) {
            add({
              id: `red_importancia_${dim.slug}`,
              dimension: "redes",
              question: "¿Qué tan importante es Instagram para tu negocio?",
              reason: "Instagram no conectado - necesito evaluar relevancia estratégica.",
              impact: "medium",
              type: "single",
              options: ["Muy importante", "Importante", "Secundario", "No importante"],
              affects: dim.slug,
            });
          }
          break;
        }
      }
    }
  }

  if (/venta|conversi|reserv/i.test(businessContext.objetivo)) {
    if (!questions.some((q) => q.dimension === "conversion")) {
      add({
        id: `obj_ticket_${businessContext.objetivo}`,
        dimension: "conversion",
        question: "¿Cuál es tu ticket promedio aproximado?",
        reason: "Objetivo orientado a conversión - necesito contexto para evaluar estrategia.",
        impact: "medium",
        type: "single",
        options: ["Menos de $5.000", "$5.000 - $15.000", "$15.000 - $50.000", "$50.000 - $100.000", "Más de $100.000"],
        affects: "conversion",
      });
    }
  }

  if (/reconoc|marca|posicion/i.test(businessContext.objetivo)) {
    if (!questions.some((q) => q.dimension === "posicionamiento")) {
      add({
        id: `obj_awareness_${businessContext.objetivo}`,
        dimension: "posicionamiento",
        question: "¿Qué porcentaje de tu mercado objetivo conoce tu marca?",
        reason: "Objetivo de posicionamiento - necesito evaluar awareness actual.",
        impact: "high",
        type: "single",
        options: ["Menos del 10%", "10-30%", "30-50%", "50-70%", "Más del 70%"],
        affects: "posicionamiento",
      });
    }
  }

  const prioritizedQuestions = questions
    .sort((a, b) => {
      const impactOrder = { high: 0, medium: 1, low: 2 };
      return impactOrder[a.impact] - impactOrder[b.impact];
    })
    .slice(0, 5);

  const confidence: Record<string, ConfidenceLevel> = {};
  for (const dim of dimensions) {
    confidence[dim.slug] = dim.confidence;
  }

  return {
    questions: prioritizedQuestions,
    dimensionsNeedingClarification: Array.from(new Set(dimensionsNeedingClarification)),
    confidence,
  };
}