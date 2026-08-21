export type FrameworkType =
  | "STP"
  | "Propuesta de valor"
  | "Funnel"
  | "Customer journey"
  | "AIDA"
  | "4P/7P"
  | "Brand positioning"
  | "CRO"
  | "Adquisición"
  | "Retención"
  | "SMART"
  | "Matriz impacto-esfuerzo";

export interface SelectedFramework {
  id: FrameworkType;
  title: string;
  rationale: string;
  useCase: string;
}

export interface StrategicFrameworkResult {
  frameworks: SelectedFramework[];
  rationale: string;
}

function buildFrameworksByProblem(problemText: string, objective: string, plazoDias: number, hasInstagram: boolean): SelectedFramework[] {
  const normalized = problemText.toLowerCase();
  const shortTerm = plazoDias <= 90;
  const growthGoal = /ventas|convers|lead|consult|reserv|trafic|visibil|adquis|crecer|clientes/i.test(objective);
  const awarenessGoal = /reconoc|marca|posicion|brand|presencia/i.test(objective);

  const frameworks: SelectedFramework[] = [];
  
  // Debug logging
  console.log("[BUILD_FRAMEWORKS] problemText:", problemText.substring(0, 80), "...");
  console.log("[BUILD_FRAMEWORKS] normalized sample:", normalized.substring(0, 80), "...");
  console.log("[BUILD_FRAMEWORKS] Testing /posicion|...contenido|.../i pattern");
  const patternTest = /posicion|diferenci|propuesta|valor|marca|claridad|mensaje|contenido|h1|h2|estructura/i.test(normalized);
  console.log("[BUILD_FRAMEWORKS] Pattern match result:", patternTest);

  if (/convers|cta|form|checkout|contact|lead|venta/i.test(normalized)) {
    frameworks.push({
      id: "CRO",
      title: "CRO",
      rationale: "La fricción de conversión es el cuello de botella más relevante; el foco debe estar en reducir pasos, mejorar CTA y claridad de acción.",
      useCase: "Se usa para decidir qué cambiar primero en páginas de servicio, producto o contacto para mover leads o ventas.",
    });
    frameworks.push({
      id: "Funnel",
      title: "Funnel",
      rationale: "El problema real está en la transición entre atención y acción, no solo en la presencia del sitio.",
      useCase: "Se usa para mapear el recorrido desde tráfico hasta contacto o compra y detectar fricción puntual.",
    });
    frameworks.push({
      id: "Customer journey",
      title: "Customer journey",
      rationale: "La experiencia del usuario necesita ajustarse para evitar que el visitante abandone antes del contacto o la compra.",
      useCase: "Se usa para priorizar cambios en el recorrido del usuario y la claridad del paso final.",
    });
  }

  if (/posicion|diferenci|propuesta|valor|marca|claridad|mensaje|contenido|h1|h2|estructura/i.test(normalized)) {
    frameworks.push({
      id: "STP",
      title: "STP",
      rationale: "El problema es de segmentos, mensajes y posicionamiento; se necesita distinguir mejor a quién sirve y qué beneficio comunica.",
      useCase: "Se usa para redefinir target y mensaje cuando no hay claridad de oferta ni diferencia competitiva.",
    });
    frameworks.push({
      id: "Propuesta de valor",
      title: "Propuesta de valor",
      rationale: "La oferta debe comunicar valor concreto y diferencial para convertir atención en decisión.",
      useCase: "Se usa para reescribir H1, primer bloque y mensajes principales.",
    });
    frameworks.push({
      id: "Brand positioning",
      title: "Brand positioning",
      rationale: "La percepción de marca y la diferenciación son clave cuando no hay claridad ni autoridad visible.",
      useCase: "Se usa en objetivos de marca, diferenciación o mejora de autoridad."
    });
  }

  if (growthGoal && shortTerm) {
    frameworks.push({
      id: "Matriz impacto-esfuerzo",
      title: "Matriz impacto-esfuerzo",
      rationale: "Con plazo corto, conviene priorizar los cambios que generan más impacto con menos esfuerzo y mayor velocidad de ejecución.",
      useCase: "Se usa para transformar el diagnóstico en una hoja de ruta ejecutiva de 30–90 días.",
    });
  }

  if (awarenessGoal) {
    frameworks.push({
      id: "Adquisición",
      title: "Adquisición",
      rationale: "Si el problema es visibilidad o tráfico, la estrategia debe reforzar captación y presencia antes que optimizar conversiones puntuales.",
      useCase: "Se usa para mejorar SEO, tráfico y primer contacto con la marca.",
    });
  }

  if (hasInstagram) {
    frameworks.push({
      id: "AIDA",
      title: "AIDA",
      rationale: "Las redes y la web deben trabajar de forma secuencial: atención, interés, deseo y acción.",
      useCase: "Se usa para alinear campañas o contenido con la conversión final.",
    });
  }

  return frameworks.filter((item, index, arr) => arr.findIndex((candidate) => candidate.id === item.id) === index).slice(0, 5);
}

export interface SelectedFramework {
  id: FrameworkType;
  title: string;
  rationale: string;
  useCase: string;
}

export interface StrategicFrameworkResult {
  frameworks: SelectedFramework[];
  rationale: string;
}

export function selectStrategicFrameworks(input: {
  objective: string;
  plazoDias: number;
  bottleneck?: string;
  diagnosisSummary?: string;
  availableData: {
    hasWebsite: boolean;
    hasInstagram: boolean;
    hasCompetitorData: boolean;
    hasBusinessInfo: boolean;
  };
}): StrategicFrameworkResult {
  const { objective, plazoDias, bottleneck, diagnosisSummary, availableData } = input;
  const fallbackProblem = bottleneck || diagnosisSummary || objective;
  
  // DEBUG: Log what we're working with
  if (fallbackProblem) {
    console.log("[FRAMEWORK_DEBUG] fallbackProblem:", fallbackProblem.substring(0, 100));
    console.log("[FRAMEWORK_DEBUG] Testing patterns...");
    const testPatterns = [
      /convers|cta|form|checkout|contact|lead|venta/i,
      /posicion|diferenci|propuesta|valor|marca|claridad|mensaje|contenido|h1|h2|estructura/i,
    ];
    testPatterns.forEach((p, idx) => {
      const matches = p.test(fallbackProblem.toLowerCase());
      console.log(`[FRAMEWORK_DEBUG] Pattern ${idx} (${p.source.substring(0, 50)}): ${matches}`);
    });
  }
  
  const selected = buildFrameworksByProblem(fallbackProblem || objective, objective, plazoDias, availableData.hasInstagram);
  console.log("[FRAMEWORK_DEBUG] Selected from buildFrameworksByProblem:", selected.length, selected.map(f => f.id));

  const extras: SelectedFramework[] = [];
  const shortTerm = plazoDias <= 90;
  const growthGoal = /ventas|convers|lead|consult|reserv|trafic|visibil|adquis|crecer|clientes/i.test(objective);
  const awarenessGoal = /reconoc|marca|posicion|tráfico|trafico|brand|presencia/i.test(objective);
  const retentionGoal = /fidel|retenci|cliente|recompra|upsell|lealtad/i.test(objective);

  if (availableData.hasBusinessInfo && !selected.some((f) => f.id === "STP")) {
    extras.push({
      id: "STP",
      title: "STP",
      rationale: "Segmentación, targeting y posicionamiento ayudan a priorizar el objetivo correcto y no dispersar esfuerzos.",
      useCase: "Se usa cuando el negocio necesita clarificar a quién sirve y qué mensaje comunica.",
    });
  }

  if (growthGoal && !selected.some((f) => f.id === "Funnel")) {
    extras.push({
      id: "Funnel",
      title: "Funnel",
      rationale: "Un objetivo de crecimiento necesita mapear la ruta desde la atención hasta la acción buscada.",
      useCase: "Se usa para mejorar el flujo de leads, consultas, reservas o ventas.",
    });
  }

  if (shortTerm && growthGoal && !selected.some((f) => f.id === "CRO")) {
    extras.push({
      id: "CRO",
      title: "CRO",
      rationale: "El plazo corto exige mejorar la fricción y las decisiones de acción antes que expandir más canales.",
      useCase: "Se usa para optimizar conversiones en páginas clave.",
    });
  }

  if (awarenessGoal && !selected.some((f) => f.id === "Brand positioning")) {
    extras.push({
      id: "Brand positioning",
      title: "Brand positioning",
      rationale: "La diferenciación y la consistencia de marca son esenciales para aumentar reconocimiento y autoridad.",
      useCase: "Se usa cuando la marca necesita claridad y consistencia en su mensaje.",
    });
  }

  if (availableData.hasWebsite && growthGoal && !selected.some((f) => f.id === "Customer journey")) {
    extras.push({
      id: "Customer journey",
      title: "Customer journey",
      rationale: "El sitio debe sostener la ruta del usuario desde la primera visita hasta la acción final sin fricción innecesaria.",
      useCase: "Se usa para detectar dónde se pierde el usuario antes de contactar o comprar.",
    });
  }

  if (retentionGoal && !selected.some((f) => f.id === "Retención")) {
    extras.push({
      id: "Retención",
      title: "Retención",
      rationale: "Cuando el objetivo incluye clientes recurrentes, hay que priorizar experiencia, seguimiento y relación posterior a la conversión.",
      useCase: "Se usa para de clientes recurrentes, reservas o fidelización.",
    });
  }

  const deduped = [...selected, ...extras].filter(
    (item, index, arr) => arr.findIndex((candidate) => candidate.id === item.id) === index
  );

  const selectedFrameworks = deduped.slice(0, 5);

  return {
    frameworks: selectedFrameworks,
    rationale:
      bottleneck || diagnosisSummary
        ? `Se priorizan los marcos que mejor encajan con el problema principal: ${bottleneck || diagnosisSummary}. La selección debe cambiar con la dimensión prioritária y no solo con el objetivo general.`
        : "Los frameworks se seleccionan según el objetivo, el plazo y la dimensión más afectada, y se descartan los que no encajan con la evidencia real.",
  };
}
