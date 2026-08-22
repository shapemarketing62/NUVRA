/**
 * Capa de presentación para traducir términos técnicos y estructurar hallazgos,
 * diagnósticos y acciones en lenguaje sencillo para dueños de negocios.
 */

const TECHNICAL_GLOSSARY: Array<[RegExp, string]> = [
  [/\bCTA[s]?\b/g, "botón de acción principal"],
  [/\babove-the-fold\b/gi, "primera parte visible de la página"],
  [/\bviewport\b/gi, "primera parte visible de la página"],
  [/\bprimer viewport\b/gi, "primera pantalla visible"],
  [/\bH1\b/g, "título principal"],
  [/\bH2\b/g, "subtítulo"],
  [/\bfricción de conversión\b/gi, "dificultades para convertir visitantes en clientes"],
  [/\bfricción inicial\b/gi, "dificultad inicial del visitante"],
  [/\bfricción real\b/gi, "dificultad concreta"],
  [/\badquisición\b/gi, "forma de conseguir nuevos clientes"],
  [/\bSEO técnico\b/gi, "optimización técnica para Google"],
  [/\bSEO\b/g, "visibilidad en Google"],
  [/\bmeta description\b/gi, "descripción visible en Google"],
  [/\btitle\b/gi, "título en el navegador y Google"],
  [/\bindexación\b/gi, "aparición en resultados de búsqueda"],
  [/\bleads\b/gi, "consultas de potenciales clientes"],
  [/\blead\b/gi, "consulta de un potencial cliente"],
  [/\bCRO\b/g, "optimización de ventas y consultas"],
  [/\bfunnel\b/gi, "recorrido desde el primer contacto hasta la consulta o compra"],
  [/\bcustomer journey\b/gi, "recorrido de las personas antes de consultar o comprar"],
  [/\bengagement\b/gi, "nivel de interacción de las personas"],
  [/\bframeworks?\b/gi, "método de trabajo"],
  [/\bconversión\b/gi, "capacidad de lograr consultas, reservas o compras"],
  [/\bpropuesta de valor\b/gi, "claridad de lo que ofrecés y por qué elegirte"],
  [/\bposicionamiento\b/gi, "diferencia frente a negocios parecidos"],
  [/\bdimensión prioritaria\b/gi, "área que más conviene mejorar"],
  [/\bdimensión estratégica\b/gi, "área principal del negocio"],
  [/\bdimensiones\b/gi, "áreas analizadas"],
  [/\bdimensión\b/gi, "área analizada"],
  [/\bcuello de botella\b/gi, "principal obstáculo"],
  [/\btráfico\b/gi, "visitas"],
  [/\bprospectos?\b/gi, "personas interesadas"],
  [/\bnav\/header\b/gi, "menú superior de la página"],
  [/\balt text\b/gi, "descripciones de texto en imágenes"],
  [/\borgánica\b/gi, "de forma natural y sin pagar publicidad"],
  [/\borgánico\b/gi, "sin costo publicitario directo"],
];

/**
 * Reemplaza términos técnicos por equivalentes simples.
 */
export function simplifyTechnicalText(text: string | null | undefined): string {
  if (!text) return "";
  let cleanText = text;

  for (const [regex, replacement] of TECHNICAL_GLOSSARY) {
    cleanText = cleanText.replace(regex, replacement);
  }

  return cleanText;
}

/**
 * Traduce slugs de dimensión a nombres comprensibles.
 */
export function getFriendlyDimensionName(slug: string, fallbackName?: string): string {
  switch (slug.toLowerCase()) {
    case "presencia":
      return "Qué tan fácil es encontrarte";
    case "conversion":
      return "Qué tan fácil es consultar, reservar o comprar";
    case "posicionamiento":
      return "Qué tanta confianza y diferenciación generás";
    case "propuesta":
      return "Qué tan claro queda lo que ofrecés";
    case "redes":
      return "Qué tan útiles están siendo tus redes";
    case "adquisicion":
      return "Qué capacidad tenés para atraer demanda";
    case "retencion":
      return "Qué hacés para que los clientes vuelvan";
    default:
      return fallbackName || slug;
  }
}

export interface FormattedActionDisplay {
  id: string;
  problem: string;
  importance: string;
  whatToDo: string;
  expectedResult: string;
  difficulty: string;
  estimatedTime: string;
  impact: string;
  done: boolean;
  order?: number;
}

/**
 * Formatea una acción recomendada para responder claramente a:
 * 1. Qué problema hay
 * 2. Por qué importa
 * 3. Qué debería hacer el negocio
 * 4. Qué resultado podría mejorar
 */
export function formatActionForBusiness(action: {
  id: string;
  title: string;
  description?: string | null;
  impact: string;
  difficulty: string;
  estimatedTime: string;
  rationale?: string | null;
  done: boolean;
  order?: number;
  problem?: string | null;
  inference?: string | null;
  evidence?: string | null;
  indicatorToImprove?: string | null;
}): FormattedActionDisplay {
  const simplifiedTitle = simplifyTechnicalText(action.title);
  const simplifiedDesc = simplifyTechnicalText(action.description || action.rationale || "");
  const simplifiedInference = simplifyTechnicalText(action.inference || action.rationale || "");
  const simplifiedProblem = simplifyTechnicalText(action.problem || "");
  const simplifiedKpi = simplifyTechnicalText(action.indicatorToImprove || "");

  // 1. Qué problema hay
  const problem = simplifiedProblem || simplifiedTitle;

  // 2. Por qué importa
  const importance = simplifiedInference || "Resolver esto permite que más visitantes confíen en tu propuesta y avancen hacia la compra o consulta.";

  // 3. Qué debería hacer el negocio
  const whatToDo = simplifiedDesc || simplifiedTitle;

  // 4. Qué resultado podría mejorar
  const expectedResult = simplifiedKpi
    ? simplifiedKpi
    : action.impact === "alto"
    ? "Alto impacto esperado en consultas y ventas directas"
    : action.impact === "medio"
    ? "Impacto moderado en la experiencia del cliente y su decisión de compra"
    : "Mejora continua en la claridad del sitio";

  return {
    id: action.id,
    problem,
    importance,
    whatToDo,
    expectedResult,
    difficulty: action.difficulty,
    estimatedTime: action.estimatedTime,
    impact: action.impact,
    done: action.done,
    order: action.order,
  };
}
