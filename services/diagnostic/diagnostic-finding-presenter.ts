import type { BusinessProfile } from "../intelligence/business-profile.ts";
import type { ProblemCandidate, StrengthCandidate } from "../intelligence/commercial-candidates.ts";
import type { DiagnosticFinding, ChannelInsight, ChannelPresenceStatus, GoogleInsight, MapsInsight, ReviewsInsight, InstagramInsight, TikTokInsight, WebsiteInsight, StrategyPlan, StrategyPhase, ActionDetail } from "./diagnostic-v2-types.ts";
import type { SourceType } from "../intelligence/source-analyzer.ts";

const sourceLabel = (source: string) => {
  const map: Record<string, string> = {
    web: "el sitio web",
    instagram: "Instagram",
    search: "Google",
    reviews: "las reseñas",
    competitor: "los negocios similares",
    external_mentions: "las menciones externas",
    x: "X",
    tiktok: "TikTok",
    facebook: "Facebook",
    linkedin: "LinkedIn",
    youtube: "YouTube",
    other: "la información aportada",
  };
  return map[source] || "la evidencia encontrada";
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function concise(value: string | null | undefined, max: number, sentenceLimit = 2): string {
  if (!value) return "";
  const clean = value.replace(/\s+/g, " ").trim();
  const sentences = clean.match(/[^.!?]+[.!?]?/g)?.map((s) => s.trim()).filter(Boolean) || [];
  const selected: string[] = [];
  for (const sentence of sentences) {
    const candidate = [...selected, sentence].join(" ");
    if (candidate.length <= max && selected.length < sentenceLimit) selected.push(sentence);
    else break;
  }
  if (selected.length) return selected.join(" ").replace(/\s+([.,;:])/g, "$1");
  const first = clean.split(/[,;:]\s+/)[0] || clean;
  if (first.length <= max) return first;
  const words = first.split(/\s+/);
  while (words.length > 3 && words.join(" ").length > max) words.pop();
  return words.join(" ");
}

export function presentPrimaryStep(context: { rubro: string; tipoCliente?: string | null; presupuesto?: number | null; capacidad?: string | null; objetivo?: string | null; ubicacion?: string | null }) {
  const sector = `${context.rubro} ${context.tipoCliente || ""}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/clinic|medic|estetic|salud|dent/.test(sector)) return { action: "Pedir turno", result: "turnos solicitados" };
  if (/gimnas|fitness|entren/.test(sector)) return { action: "Reservar una clase", result: "clases de prueba reservadas" };
  if (/restaurante|cafe|gastronom|comida/.test(sector)) return { action: "Reservar mesa o hacer un pedido", result: "reservas y pedidos" };
  if (/ecom|tienda|retail|shop/.test(sector)) return { action: "Comprar", result: "compras iniciadas y completadas" };
  if (/b2b|empresa|corporativo|consultor/.test(sector)) return { action: "Solicitar una reunión", result: "reuniones comerciales solicitadas" };
  return { action: "Consultar", result: "consultas recibidas" };
}

export function buildDiagnosticFindings(profile: BusinessProfile, scoreResult: { total: number | null; dimensions: Array<{ slug: string; points: number | null; confidence: string; name?: string }> }): DiagnosticFinding[] {
  const problems = profile.problemCandidates.filter((c) => c.validationStatus === "validated").sort((a, b) => b.priorityScore - a.priorityScore);
  const strengths = profile.strengthCandidates.filter((c) => ["sufficient", "strong"].includes((c as any).evidenceSufficiency?.status || "limited")).sort((a, b) => b.priorityScore - a.priorityScore);
  const findings: DiagnosticFinding[] = [];

  for (const problem of problems.slice(0, 4)) {
    const evidence = problem.evidenceFor.map((id) => profile.commercialEvidence.find((item) => item.id === id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const sources = Array.from(new Set(evidence.map((item) => item.source)));
    const channel = sources.map((s) => sourceLabel(s)).join(" y ") || "el canal observado";

    findings.push({
      id: problem.id,
      title: humanizeProblem(problem),
      channel,
      whatWeSaw: concise(evidence.map((e) => e.text).join(" · "), 220, 2) || "Señal observada en el recorrido comercial.",
      whatItMeans: concise(problem.causalExplanation, 220, 2),
      whyItMatters: concise(`Para “${profile.goal.text}”, esto puede frenar el paso hacia ${profile.primaryCustomerAction}.`, 180, 1),
      recommendation: concise(recommendationForProblem(problem, profile), 240, 2),
      unknowns: problem.dependencies.length ? problem.dependencies.slice(0, 2) : ["Cómo responde el público objetivo a la corrección."],
      evidenceIds: problem.evidenceFor,
      strength: problem.conclusionConfidence >= .7 ? "fuerte" : problem.conclusionConfidence >= .5 ? "parcial" : "por validar",
    });
  }

  for (const strength of strengths.slice(0, 2)) {
    const evidence = strength.evidence.map((id) => profile.commercialEvidence.find((item) => item.id === id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const sources = Array.from(new Set(evidence.map((item) => item.source)));
    const channel = sources.map((s) => sourceLabel(s)).join(" y ") || "el canal observado";

    findings.push({
      id: strength.id,
      title: strength.statement,
      channel,
      whatWeSaw: concise(evidence.map((e) => e.text).join(" · "), 200, 2) || "Señal favorable observada.",
      whatItMeans: concise("Esto ayuda a reducir dudas y facilita el avance hacia la consulta o compra.", 180, 1),
      whyItMatters: concise(`Para “${profile.goal.text}”, esta señal apoya la decisión de ${profile.primaryCustomerAction}.`, 180, 1),
      recommendation: concise(`Mantener esta señal visible y cerca del paso para ${profile.primaryCustomerAction}.`, 220, 1),
      unknowns: ["Cuánto aporta esta señal al total de consultas."],
      evidenceIds: strength.evidence,
      strength: strength.conclusionConfidence >= .7 ? "fuerte" : strength.conclusionConfidence >= .5 ? "parcial" : "por validar",
    });
  }

  return findings.slice(0, 5);
}

export function buildChannelInsights(profile: BusinessProfile, scoreResult: { total: number | null; dimensions: Array<{ slug: string; points: number | null; confidence: string }> }): ChannelInsight[] {
  const insights: ChannelInsight[] = [];
  const evaluated = profile.activeChannels.filter((channel) => {
    const evidence = profile.commercialEvidence.filter((e) => e.source === channel);
    return evidence.length > 0;
  });

  for (const channel of evaluated) {
    const evidence = profile.commercialEvidence.filter((e) => e.source === channel);
    const positives = evidence.filter((e) => e.polarity === "positive");
    const negatives = evidence.filter((e) => e.polarity === "negative");
    const status: ChannelPresenceStatus = evidence.length > 0 ? "analyzed" : "not_found";

    let summary = "";
    switch (channel) {
      case "search":
        summary = buildGoogleInsight(profile, evidence, positives, negatives);
        break;
      case "web":
        summary = buildWebsiteInsight(profile, evidence, positives, negatives);
        break;
      case "instagram":
        summary = buildInstagramInsight(profile, evidence, positives, negatives);
        break;
      case "tiktok":
        summary = buildTikTokInsight(profile, evidence, positives, negatives);
        break;
      case "reviews":
        summary = buildReviewsInsight(profile, evidence, positives, negatives);
        break;
      default:
        summary = concise(evidence.map((e) => e.text).join(" · "), 180, 2) || `Analizamos ${channel}.`;
    }

    insights.push({
      channel,
      label: channelLabel(channel),
      status,
      summary,
      evidenceCount: evidence.length,
      positiveCount: positives.length,
      negativeCount: negatives.length,
      hasPrivateMetrics: false,
      privateMetricsStatus: "requires_connection",
    });
  }

  const allChannels = ["google_maps", "facebook", "x", "linkedin", "youtube", "reviews", "search", "web", "instagram", "tiktok"];
  const notFound = allChannels.filter((channel) => !evaluated.includes(channel as any) && profile.activeChannels.includes(channel as any));
  for (const channel of notFound) {
    const summary = channel === "reviews"
      ? "No encontramos suficientes reseñas verificadas para sacar una conclusión."
      : channel === "google_maps"
        ? "No pudimos confirmar todavía la ficha de Google Maps."
        : `No pudimos confirmar todavía la presencia en ${channelLabel(channel)}.`;
    insights.push({
      channel: channel as SourceType,
      label: channelLabel(channel),
      status: "not_confirmed",
      summary,
      evidenceCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      hasPrivateMetrics: false,
      privateMetricsStatus: "requires_connection",
    });
  }

  return insights;
}

export function buildStrategyPlan(profile: BusinessProfile | null, context: { objetivo: string; plazoLabel: string; magnitud?: number | null }, selectedActions: Array<{ title: string; description: string; timeframe: string; kpi: string; evidence: string }>): StrategyPlan {
  const [firstMonth, secondMonth] = context.plazoLabel.includes("–")
    ? context.plazoLabel.split("–").map((s) => s.trim())
    : [context.plazoLabel, context.plazoLabel];

  const phases = [
    {
      phase: "Primer mes",
      timeframe: firstMonth || "Primer mes",
      focus: "Medir qué están generando hoy los canales actuales",
      actions: selectedActions.slice(0, 2).map((a) => ({
        what: a.title,
        where: extractWhere(a.description),
        why: a.evidence || concreteWhy(a.title),
        how: concise(a.description, 180, 2),
        metric: a.kpi,
        when: a.timeframe,
        successCriteria: baselineAwareSuccessCriteria(a.kpi),
      })),
    },
    {
      phase: "Segundo mes",
      timeframe: secondMonth || "Segundo mes",
      focus: "Trabajar los puntos observados donde ya existe oportunidad",
      actions: selectedActions.slice(2, 4).map((a) => ({
        what: a.title,
        where: extractWhere(a.description),
        why: a.evidence || concreteWhy(a.title),
        how: concise(a.description, 180, 2),
        metric: a.kpi,
        when: a.timeframe,
        successCriteria: baselineAwareSuccessCriteria(a.kpi),
      })),
    },
    {
      phase: "Tercer mes",
      timeframe: secondMonth || "Tercer mes",
      focus: "Comparar resultados y decidir qué conviene mantener",
      actions: selectedActions.slice(4, 6).map((a) => ({
        what: a.title,
        where: extractWhere(a.description),
        why: a.evidence || concreteWhy(a.title),
        how: concise(a.description, 180, 2),
        metric: a.kpi,
        when: a.timeframe,
        successCriteria: baselineAwareSuccessCriteria(a.kpi),
      })),
    },
  ];

  return {
    objective: `${context.objetivo}${context.magnitud ? ` (+${context.magnitud}%)` : ""} en ${context.plazoLabel}`,
    whatWeFound: concise(profile?.problemCandidates[0]?.hypothesis || "La información revisada alcanza para definir una prioridad.", 220, 2),
    biggestOpportunity: selectedActions[0]?.title || "Ordenar el paso hacia la consulta o compra",
    priorities: selectedActions.slice(0, 3).map((a) => a.title),
    whatNotToDoYet: [
      "No abrir canales nuevos sin confirmar que el recorrido actual funciona.",
      "Antes de aumentar la inversión en publicidad, conviene medir qué están generando hoy los canales actuales.",
    ],
    phases: phases.filter((phase) => phase.actions.length > 0),
    measurementFocus: selectedActions[0]?.kpi || profile?.primaryResult || "consultas recibidas",
  };
}

function baselineAwareSuccessCriteria(metric: string): string {
  const normalized = metric.toLowerCase();
  if (/visitas|consultas|turnos|reservas|reuniones|pedidos|compras/.test(normalized)) {
    return `Primero registrá durante 2 semanas cuántas ${metric} recibís y desde qué canal llegan. Esa será la base para comparar.`;
  }
  if (/alcance|reproducciones|seguidores|engagement/.test(normalized)) {
    return `Primero registrá durante 2 semanas el alcance o las reproducciones actuales. Después compará si la intervención aumenta ese número.`;
  }
  return `Definir una base simple y medir el cambio después de aplicar la intervención.`;
}

function concreteWhy(title: string): string {
  if (/google|búsqueda|posicionamiento/i.test(title)) return "La presencia en búsquedas locales es una de las formas en que personas nuevas conocen el negocio.";
  if (/whatsapp|contacto|celular/i.test(title)) return "Muchas consultas llegan por WhatsApp y un acceso directo reduce pasos.";
  if (/instagram|redes|tiktok/i.test(title)) return "Las redes pueden aportar reconocimiento, pero sin conexión no se puede medir su aporte real.";
  if (/reseña|reputación|confianza/i.test(title)) return "Las reseñas ayudan a decidir a personas que todavía no conocen el negocio.";
  if (/tratamiento|servicio|propuesta|oferta/i.test(title)) return "Una oferta clara ayuda a que una persona entienda rápido si este negocio puede ayudarla.";
  if (/medir|medición|seguimiento|planilla/i.test(title)) return "Sin datos reales no es posible decidir qué canal o cambio está funcionando.";
  return "La intervención responde a una señal observada en el negocio.";
}

export function humanizeProblem(problem: ProblemCandidate): string {
  const base = problem.hypothesis.replace(/\.$/, "");
  if (problem.pattern === "offer_clarity") return "Hay oportunidades para explicar más rápido por qué elegir este negocio";
  if (problem.pattern === "action_path") return "Cuesta avanzar desde la información hasta la consulta o compra";
  if (problem.pattern === "trust") return "Faltan pruebas que ayuden a confiar antes de decidir";
  if (problem.pattern === "decision_information") return "Falta información práctica para decidir";
  if (problem.pattern === "visibility") return "El negocio puede ser más fácil de encontrar en Google";
  if (problem.pattern === "retention") return "Falta un próximo paso para que los clientes vuelvan";
  if (problem.pattern === "demand_pattern") return "Hay momentos con demanda y otros con capacidad disponible";
  return concise(base, 140, 1);
}

function recommendationForProblem(problem: ProblemCandidate, profile: BusinessProfile): string {
  const action = profile.primaryCustomerAction;
  if (problem.pattern === "offer_clarity") return `Explicar en el sitio qué ofrece el negocio, para quién es y cómo pedir ${action}.`;
  if (problem.pattern === "action_path") return `Dejar un único camino claro hacia ${action} y probarlo en celular.`;
  if (problem.pattern === "trust") return `Mostrar pruebas verificables cerca del paso para ${action}.`;
  if (problem.pattern === "decision_information") return `Completar la información práctica que falta antes de ${action}.`;
  if (problem.pattern === "visibility") return `Alinear nombre, actividad y ubicación en los canales públicos.`;
  if (problem.pattern === "retention") return `Definir un contacto útil después de la experiencia.`;
  if (problem.pattern === "demand_pattern") return `Trabajar los momentos con menor demanda con una propuesta concreta.`;
  return `Corregir la señal observada antes de ${action}.`;
}

function extractWhere(description: string): string {
  const match = description.match(/en\s+([^.,;]+)/i);
  if (match) return concise(match[1], 80, 1);
  if (/página|tratamiento|servicio|producto/i.test(description)) return "las páginas del sitio";
  if (/instagram|bio|publicación/i.test(description)) return "el perfil de Instagram";
  if (/tiktok/i.test(description)) return "el perfil de TikTok";
  if (/google|búsqueda|search/i.test(description)) return "Google";
  if (/whatsapp|chat/i.test(description)) return "WhatsApp";
  if (/reseña|reputación/i.test(description)) return "las reseñas";
  return "el canal principal";
}

function channelLabel(channel: string): string {
  const map: Record<string, string> = {
    web: "Sitio web",
    instagram: "Instagram",
    search: "Google",
    reviews: "Reseñas",
    competitor: "Competencia",
    external_mentions: "Menciones externas",
    x: "X",
    tiktok: "TikTok",
    facebook: "Facebook",
    linkedin: "LinkedIn",
    youtube: "YouTube",
    google_maps: "Google Maps",
  };
  return map[channel] || channel;
}

function buildGoogleInsight(_profile: BusinessProfile, evidence: BusinessProfile["commercialEvidence"], positives: BusinessProfile["commercialEvidence"], negatives: BusinessProfile["commercialEvidence"]): string {
  if (!evidence.length) return "No obtuvimos datos de búsqueda suficientes para evaluar esta parte.";
  const mentions = positives.length + negatives.length;
  const position = evidence.find((e) => /posici[oó]n|posición|ranking/i.test(e.text));
  if (position) return `En ${evidence.length} búsquedas analizadas, el negocio apareció asociado en ${mentions} resultados. En una búsqueda observada se registró posición ${position.text.match(/\d+/)?.[0] || "observada"}.`;
  return `Analizamos ${evidence.length} búsquedas relacionadas con el negocio. Encontramos ${mentions} resultados asociados a la empresa.`;
}

function buildWebsiteInsight(profile: BusinessProfile, evidence: BusinessProfile["commercialEvidence"], _positives: BusinessProfile["commercialEvidence"], _negatives: BusinessProfile["commercialEvidence"]): string {
  if (!evidence.length) return "No obtuvimos datos del sitio web.";
  const pages = evidence.filter((e) => /p[aá]gina|p[aá]ginas/i.test(e.text));
  const cta = evidence.find((e) => /CTA|bot[oó]n|llamada/i.test(e.text));
  const whatsapp = evidence.find((e) => /whatsapp/i.test(e.text));
  const loadTime = evidence.find((e) => /carga|lenta|r[aá]pida|segundo/i.test(e.text));
  const pageCount = pages.length ? `Se revisaron ${pages.length} páginas.` : "Se revisó la estructura general.";
  const ctaText = cta ? "Hay llamados a la acción presentes." : "Conviene revisar el llamado a la acción principal.";
  const whatsappText = whatsapp ? "Se encontró acceso a WhatsApp." : "No se detectó un acceso directo a WhatsApp.";
  const loadText = loadTime ? `El sitio carga en ${concise(loadTime.text.replace(/\.$/, ""), 60, 1)}.` : "";
  return `Analizamos el sitio web oficial. ${pageCount} ${loadText} ${ctaText} ${whatsappText}`.replace(/\s+/g, " ").trim();
}

function buildInstagramInsight(profile: BusinessProfile, evidence: BusinessProfile["commercialEvidence"], _positives: BusinessProfile["commercialEvidence"], _negatives: BusinessProfile["commercialEvidence"]): string {
  if (!evidence.length) return "No obtuvimos datos públicos suficientes de Instagram.";
  const hasLink = evidence.some((e) => /link|enlace/i.test(e.text));
  const hasContent = evidence.some((e) => /publicaci[oó]n|post|contenido/i.test(e.text));
  return `Encontramos el perfil de Instagram del negocio. ${hasLink ? "Tiene un link disponible." : "No se detectó un link en la bio."} ${hasContent ? "Hay contenido público visible." : "No se pudo analizar el contenido público."} Sin conectar la cuenta, no podemos ver métricas privadas como alcance o interacciones.`;
}

function buildTikTokInsight(_profile: BusinessProfile, evidence: BusinessProfile["commercialEvidence"], _positives: BusinessProfile["commercialEvidence"], _negatives: BusinessProfile["commercialEvidence"]): string {
  if (!evidence.length) return "No obtuvimos datos públicos suficientes de TikTok.";
  return `Encontramos el perfil de TikTok del negocio. Sin conectar la cuenta, no podemos ver métricas privadas como reproducciones o seguidores.`;
}

function buildReviewsInsight(profile: BusinessProfile, evidence: BusinessProfile["commercialEvidence"], positives: BusinessProfile["commercialEvidence"], negatives: BusinessProfile["commercialEvidence"]): string {
  if (!evidence.length) return "No encontramos suficientes reseñas verificadas para sacar una conclusión.";
  const positive = positives.length;
  const negative = negatives.length;
  const total = positive + negative;
  if (total < 3) return `Encontramos ${total} reseña${total === 1 ? "" : "s"}, pero todavía no son suficientes para sacar una conclusión representativa.`;
  return `Analizamos ${total} reseñas. ${positive > negative ? `La mayoría son positivas.` : negative > positive ? `Hay varias reseñas negativas recientes.` : `Hay mezcla de opiniones.`} ${positive ? `Lo más valorado: ${concise(positives[0]?.text || "", 100, 1)}.` : ""} ${negative ? `El tema que más se repite: ${concise(negatives[0]?.text || "", 100, 1)}.` : ""}`;
}
