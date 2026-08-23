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
  [/\bperformance\b/gi, "rendimiento"],
  [/\battribution\b/gi, "origen de los resultados"],
  [/\bretención\b/gi, "capacidad de hacer que los clientes vuelvan"],
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

  return cleanText
    .replace(/\s+—\s+/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

export const PRESENTATION_LIMITS = {
  problem: 280,
  explanation: 220,
  opportunity: 160,
  action: 240,
  metric: 100,
} as const;

const AUDIT_SENTENCES = [
  /La hipótesis se apoya en[^.]*\.?/gi,
  /Se consideró evidencia favorable[^.]*\.?/gi,
  /También se consideró evidencia favorable[^.]*\.?/gi,
  /considera \d+ señal(?:es)?[^.]*\.?/gi,
  /\b\d+ señales? (?:a favor|en contra)[^.]*\.?/gi,
  /\b(?:confidence|weights?|scores?|trace|debugging)\b[^.]*\.?/gi,
];

function cleanCommercialText(value: string | null | undefined) {
  let text = simplifyTechnicalText(value);
  for (const pattern of AUDIT_SENTENCES) text = text.replace(pattern, " ");
  return text
    .replace(/\b(?:commercial_journey|problem_candidates|strength_candidates|analysis_trace)\b/gi, "")
    .replace(/\b(?:acción comercial|recorrido comercial|señales contradictorias)\b/gi, "el paso siguiente")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:ms|s|segundos?)\b/gi, "")
    .replace(/\b(?:título|texto) de \d+ caracteres\b/gi, "el texto")
    .replace(/formulario (?:con|de) \d+ campos?/gi, "formulario demasiado largo")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
}

function sentenceParts(value: string) {
  return value.match(/[^.!?]+[.!?]?/g)?.map((part) => part.trim()).filter(Boolean) || [];
}

function completeSentence(value: string) {
  const text = value.trim().replace(/[,:;\s]+$/, "");
  return text && !/[.!?]$/.test(text) ? `${text}.` : text;
}

function concise(value: string | null | undefined, max: number, sentenceLimit = 2) {
  const clean = cleanCommercialText(value);
  if (!clean) return "";
  const selected: string[] = [];
  for (const sentence of sentenceParts(clean)) {
    const candidate = completeSentence([...selected, sentence].join(" "));
    if (candidate.length <= max && selected.length < sentenceLimit) selected.push(sentence);
    else break;
  }
  if (selected.length) return completeSentence(selected.join(" "));
  const firstClause = clean.split(/[,;:]\s+/)[0]?.trim() || clean;
  if (completeSentence(firstClause).length <= max) return completeSentence(firstClause);
  const words = firstClause.split(/\s+/);
  while (words.length > 3 && completeSentence(words.join(" ")).length > max) words.pop();
  return completeSentence(words.join(" "));
}

function lowerFirst(value: string) {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function upperFirst(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function humanProblemTitle(value: string) {
  const clean = cleanCommercialText(value)
    .replace(/^El principal freno parece estar entre el interés y el paso siguiente:\s*/i, "")
    .replace(/^El principal freno parece estar entre el interés y la acción:\s*/i, "")
    .replace(/^El interés puede frenarse antes de la decisión porque\s*/i, "")
    .replace(/^Las personas pueden encontrar el negocio, pero no reunir suficiente claridad sobre\s*/i, "No queda claro ")
    .replace(/^El negocio puede estar perdiendo continuidad porque\s*/i, "")
    .replace(/^Existe una fricción observada que puede dificultar que una persona avance hacia\s*/i, "Cuesta avanzar hacia ")
    .replace(/^La demanda no está distribuida de manera útil para el negocio y existen momentos concretos que necesitan una intervención propia\.?$/i, "Hay momentos con poca demanda.");
  return upperFirst(concise(clean, PRESENTATION_LIMITS.problem, 1));
}

function evidenceFromExplanation(value: string) {
  const match = value.match(/Evidencia:\s*(.*?)(?:\.\s*(?:También|Esto importa)|$)/i);
  return match?.[1]?.trim() || "";
}

export interface PresentedProblem {
  title: string;
  explanation: string;
  whyItMatters: string;
}

export function presentProblem(input: { title?: string | null; explanation?: string | null; objective?: string | null }): PresentedProblem {
  const title = humanProblemTitle(input.title || "Lo que más está frenando hoy necesita un ajuste concreto.");
  const evidence = evidenceFromExplanation(input.explanation || "");
  const source = evidence || sentenceParts(cleanCommercialText(input.explanation))[0] || "Vimos un paso que todavía puede simplificarse.";
  const explanation = concise(/^vimos/i.test(source) ? source : `Vimos que ${lowerFirst(source)}`, PRESENTATION_LIMITS.explanation, 2);
  const objective = cleanCommercialText(input.objective || "avanzar con el objetivo actual").replace(/[.]+$/, "");
  const whyItMatters = concise(`Esto importa porque hoy el objetivo es ${lowerFirst(objective)}`, PRESENTATION_LIMITS.explanation, 1);
  return { title, explanation, whyItMatters };
}

export function presentOpportunity(value: string): string {
  let clean = cleanCommercialText(value);
  const actionMatch = clean.match(/^Destrabar (?:el paso siguiente|acción comercial) para que más personas puedan ([^:]+):/i);
  const evaluationMatch = clean.match(/^Destrabar evaluación para que más personas puedan ([^:]+):/i);
  const decisionMatch = clean.match(/^Destrabar decisión para que más personas puedan ([^:]+):/i);
  const discoveryMatch = clean.match(/^Destrabar descubrimiento para que más personas puedan ([^:]+):/i);
  const retentionMatch = clean.match(/^Destrabar (?:recompra o continuidad|retención) para que más personas puedan ([^:]+):/i);
  const strengthMatch = clean.match(/^Aprovechar esta fortaleza antes de ([^:]+):/i);
  if (actionMatch) clean = `Facilitar que más personas puedan ${actionMatch[1]}`;
  else if (evaluationMatch) clean = `Aclarar mejor la información antes de ${evaluationMatch[1]}`;
  else if (decisionMatch) clean = `Resolver las dudas prácticas antes de ${decisionMatch[1]}`;
  else if (discoveryMatch) clean = `Ayudar a que más personas encuentren el negocio y puedan ${discoveryMatch[1]}`;
  else if (retentionMatch) clean = `Crear un próximo paso para que más clientes puedan ${retentionMatch[1]}`;
  else if (strengthMatch) clean = `Aprovechar lo que ya funciona antes de ${strengthMatch[1]}`;
  else clean = clean.split(/:\s+/)[0] || clean;
  return concise(clean, PRESENTATION_LIMITS.opportunity, 1);
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
    case "identidad":
      return "Qué tan sólida y reconocible es tu marca";
    default:
      return fallbackName || slug;
  }
}

export interface FormattedActionDisplay {
  id: string;
  title: string;
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
  const simplifiedTitle = concise(action.title, 120, 1);
  const simplifiedDesc = concise((action.description || action.rationale || "").split(/\s+(?:La intervención responde a|La intervención sigue resolviendo):/i)[0], PRESENTATION_LIMITS.action, 2);
  const simplifiedInference = concise(action.inference || action.rationale || "", PRESENTATION_LIMITS.explanation, 1);
  const simplifiedProblem = humanProblemTitle(action.problem || "");
  const simplifiedEvidence = concise(action.evidence || "", PRESENTATION_LIMITS.explanation, 1);
  const simplifiedKpi = concise(action.indicatorToImprove || "", Math.max(20, PRESENTATION_LIMITS.metric - 7), 1).replace(/[.]$/, "");

  // 1. Qué problema hay
  const problem = simplifiedProblem || simplifiedEvidence || simplifiedTitle;

  // 2. Por qué importa
  const importance = simplifiedInference || "Resolver esto permite que más visitantes confíen en tu propuesta y avancen hacia la compra o consulta.";

  // 3. Qué debería hacer el negocio
  const whatToDo = simplifiedDesc || simplifiedTitle;

  // 4. Qué resultado podría mejorar
  const expectedResult = simplifiedKpi
    ? concise(`Medir: ${lowerFirst(simplifiedKpi)}`, PRESENTATION_LIMITS.metric, 1)
    : action.impact === "alto"
    ? "Medir: consultas o ventas generadas por este cambio."
    : action.impact === "medio"
    ? "Medir: personas que completan el próximo paso."
    : "Medir: respuestas obtenidas después del cambio.";

  return {
    id: action.id,
    title: simplifiedTitle,
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
