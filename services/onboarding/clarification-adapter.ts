import { generateClarificationQuestions } from "../clarification/clarification-engine.ts";
import type { RawFinding } from "@/services/website-analyzer/types.ts";
import type { ClarificationQuestion } from "@/lib/onboarding-v2-types";

const PLAIN_LANGUAGE_MAP: Record<string, { question: string; reason?: string }> = {
  "¿Cuál considerás que es tu principal diferencial frente a competidores?": {
    question: "¿Qué dirías que hace que alguien te elija a vos y no a otra opción?",
    reason: "Queremos entender qué valoran tus clientes.",
  },
  "¿Cuál creés que es la principal barrera para la conversión en tu web?": {
    question: "¿Hay algo que haga difícil que una persona te contacte desde tu página?",
    reason: "Si hay un punto de fricción, lo podemos identificar.",
  },
  "¿Qué hace único a tu negocio comparado con alternativas?": {
    question: "¿Por qué suelen elegirte tus clientes?",
    reason: "Ayudanos a entender tu ventaja más real.",
  },
  "¿De dónde llegan actualmente la mayoría de tus clientes?": {
    question: "¿De dónde llegan hoy la mayoría de tus consultas o ventas?",
    reason: "Así sabemos qué canal conviene medir primero.",
  },
  "¿Cuál es tu canal principal de adquisición de clientes?": {
    question: "¿Por dónde llegan hoy la mayoría de tus consultas?",
    reason: "Así sabemos qué canal conviene medir primero.",
  },
  "¿Tenés presupuesto para publicidad digital?": {
    question: "¿Usás publicidad paga actualmente?",
    reason: "Para sugerir un plan realista.",
  },
  "¿Tu marca ya es conocida dentro de tu mercado?": {
    question: "¿La mayoría de las personas que querés alcanzar ya conocen tu negocio?",
    reason: "Ayuda a decidir si conviene invertir más en reconocimiento o en convertir.",
  },
  "¿Qué tan importante es Instagram para tu negocio?": {
    question: "¿Qué tan importante es Instagram para tu negocio hoy?",
    reason: "Si Instagram es clave, podemos priorizarlo en la estrategia.",
  },
  "¿Cuál es tu ticket promedio aproximado?": {
    question: "¿Cuánto suele pagar una persona por tu servicio o producto principal?",
    reason: "Ayuda a priorizar el tipo de acciones que convienen.",
  },
};

const JARGON_RE = /buyer persona|funnel|acquisition|conversion rate|positioning|value proposition|evidence sufficiency|coverage|business maturity|conversión|diferencial|adquisición|propuesta de valor|posicionamiento|KPI|barrera de conversión|ticket promedio/i;

export interface ClarificationContext {
  objetivo: string;
  rubro: string;
  hasInstagram: boolean;
  hasWebsite: boolean;
  hasLocation: boolean;
  businessModel: "local" | "online" | "mixed";
  dimensions: Array<{ slug: string; confidence: string; points?: number | null }>;
  findings: Array<{ category: string; title: string; source?: string }>;
  declaredChannels: string[];
  observedChannels: string[];
}

export function getClarificationQuestions(context: ClarificationContext): ClarificationQuestion[] {
  const effectiveFindings = context.findings.filter((f) => !context.observedChannels.includes(f.category));
  const effectiveDimensions = context.dimensions
    .filter((d) => {
      if (d.slug === "redes" && context.hasInstagram) return false;
      if (d.slug === "posicionamiento" && context.observedChannels.includes("search")) return false;
      return true;
    })
    .filter((d) => d.confidence === "INSUFICIENTE" || d.confidence === "BAJA");

  if (effectiveDimensions.length === 0 && effectiveFindings.length === 0) return [];

  const result = generateClarificationQuestions(
    effectiveDimensions.map((d) => ({
      slug: d.slug as "presencia" | "conversion" | "posicionamiento" | "propuesta" | "redes" | "adquisicion" | "identidad",
      confidence: d.confidence as "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE",
      points: d.points ?? null,
      name: "",
      weight: 0,
      criteria: [],
      strengths: [],
      problems: [],
      source: "",
      findings: [] as RawFinding[],
      message: undefined,
    })),
    effectiveFindings.map((f) => ({
      ...f,
      type: "problem" as const,
      description: "",
      evidence: "",
      pageUrl: "",
      source: f.source || "",
      confidence: "MEDIA",
      severity: "medium" as RawFinding["severity"],
      category: f.category,
    })),
    { objetivo: context.objetivo, rubro: context.rubro, hasInstagram: context.hasInstagram }
  );

  const translated = result.questions
    .map((q) => {
      const mapped = PLAIN_LANGUAGE_MAP[q.question];
      if (mapped) {
        return {
          ...q,
          question: mapped.question,
          reason: mapped.reason || q.reason,
        };
      }
      return q;
    })
    .filter((q) => {
      if (JARGON_RE.test(q.question)) return false;
      if (JARGON_RE.test(q.reason || "")) return false;
      return true;
    })
    .slice(0, 4);

  return translated;
}
