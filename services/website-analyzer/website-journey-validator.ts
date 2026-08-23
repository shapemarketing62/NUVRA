import type { PageAnalysisData, RawFinding, WebsiteJourneyIntent, WebsiteJourneyValidation } from "./types.ts";

const intentLabels: Record<WebsiteJourneyIntent, string> = {
  buy: "comprar",
  reserve: "reservar",
  contact: "consultar",
  appointment: "pedir turno",
  quote: "pedir presupuesto",
};

const directProtocols = /^(?:https?:\/\/(?:wa\.me|api\.whatsapp\.com)|tel:|mailto:)/i;

export function validateWebsiteJourneys(pages: PageAnalysisData[], technicalFindings: RawFinding[] = []): WebsiteJourneyValidation[] {
  const safePages = Array.isArray(pages) ? pages : [];
  const pagesByUrl = new Map(safePages.map((page) => [normalizeUrl(page.url), page]));
  return (Object.keys(intentLabels) as WebsiteJourneyIntent[]).map((intent) => {
    const matches = safePages.flatMap((page) => page.actionSignals.filter((action) => action.intent === intent).map((action) => ({ page, action })));
    const forms = safePages.flatMap((page) => page.formSignals.filter((form) => form.intent === intent).map((form) => ({ page, form })));
    const traversal = traverseIntent(safePages[0], intent, pagesByUrl, technicalFindings);
    const direct = traversal.final?.direct;
    const form = traversal.final?.form;
    const failedTarget = traversal.failedTarget;
    const validated = Boolean(traversal.final);
    const observed = matches.length > 0 || forms.length > 0;
    const steps = traversal.final?.steps ?? null;
    const requiredFields = form?.form.requiredFieldCount ?? null;
    const evidence: string[] = [];
    if (direct) evidence.push(`Se encontró un acceso directo y observable para ${intentLabels[intent]} desde ${direct.page.url}.`);
    if (validated && steps && steps > 1) evidence.push(`El recorrido para ${intentLabels[intent]} se comprobó a través de ${steps} paso(s) observables desde la entrada del sitio.`);
    if (form) evidence.push(`El formulario asociado pide ${form.form.requiredFieldCount} campo(s) obligatorio(s); la cantidad total por sí sola no se interpreta como dificultad.`);
    if (failedTarget) evidence.push(`El acceso observado para ${intentLabels[intent]} condujo a una página que no pudo cargarse correctamente.`);
    if (!observed) evidence.push(`No se confirmó un acceso para ${intentLabels[intent]} en las páginas revisadas; esta ausencia parcial no demuestra que el recorrido sea difícil.`);
    const clarity = validated ? (steps === 1 ? 90 : steps === 2 ? 82 : steps && steps <= 4 ? 72 : 60) : observed ? 48 : 35;
    return {
      intent,
      status: failedTarget ? "blocked" : validated ? "validated" : observed ? "partial" : "not_found",
      steps,
      clarity,
      errors: failedTarget ? ["El destino del acceso no respondió correctamente durante la comprobación."] : [],
      blockers: failedTarget ? [`El acceso para ${intentLabels[intent]} tiene un destino que no pudo cargarse.`] : [],
      consistency: matches.length > 1 ? "consistent" : observed ? "unknown" : "unknown",
      timeToActionMs: traversal.final?.timeToActionMs ?? null,
      requiredFields,
      evidence,
      urls: Array.from(new Set([...matches.map(({ page }) => page.url), ...forms.map(({ page }) => page.url)])),
    };
  });
}

function traverseIntent(entry: PageAnalysisData | undefined, intent: WebsiteJourneyIntent, pagesByUrl: Map<string, PageAnalysisData>, technicalFindings: RawFinding[]) {
  if (!entry) return { final: null, failedTarget: null };
  const queue: Array<{ page: PageAnalysisData; depth: number; elapsed: number }> = [{ page: entry, depth: 0, elapsed: entry.loadTimeMs || 0 }];
  const visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    const key = normalizeUrl(current.page.url);
    if (visited.has(key)) continue;
    visited.add(key);
    const form = current.page.formSignals.filter((item) => item.intent === intent && item.submitLabel).sort((a, b) => a.requiredFieldCount - b.requiredFieldCount)[0];
    if (form && form.requiredFieldCount <= 8) return { final: { form: { page: current.page, form }, direct: null, steps: current.depth + 1, timeToActionMs: current.elapsed }, failedTarget: null };
    const actions = current.page.actionSignals.filter((item) => item.intent === intent && item.href);
    const direct = actions.find((item) => item.direct || directProtocols.test(item.href || ""));
    if (direct) return { final: { direct: { page: current.page, action: direct }, form: null, steps: current.depth + 1, timeToActionMs: current.elapsed }, failedTarget: null };
    for (const action of actions) {
      const failed = technicalFindings.some((finding) => /error http|error al analizar/i.test(finding.title) && sameTarget(finding.pageUrl, action.href!, current.page.url));
      if (failed) return { final: null, failedTarget: { page: current.page, action } };
      try {
        const target = pagesByUrl.get(normalizeUrl(new URL(action.href!, current.page.url).toString()));
        if (target && !visited.has(normalizeUrl(target.url))) queue.push({ page: target, depth: current.depth + 1, elapsed: current.elapsed + (target.loadTimeMs || 0) });
      } catch { /* destino no utilizable */ }
    }
  }
  return { final: null, failedTarget: null };
}

function sameTarget(findingUrl: string, href: string, baseUrl: string) {
  try { return normalizeUrl(findingUrl) === normalizeUrl(new URL(href, baseUrl).toString()); }
  catch { return false; }
}

export function journeyFindings(journeys: WebsiteJourneyValidation[]): RawFinding[] {
  const findings: RawFinding[] = [];
  for (const journey of journeys) {
    const label = intentLabels[journey.intent];
    if (journey.status === "validated") findings.push({
      type: "strength" as const,
      category: "conversion",
      severity: "info",
      title: `Recorrido para ${label} comprobado`,
      description: `Se comprobó sin completar ninguna acción irreversible.`,
      evidence: journey.evidence.join(" "),
      pageUrl: journey.urls[0] || "website-journey",
      source: "playwright",
      confidence: "alta",
      impact: "alto",
    });
    if (journey.status === "blocked") findings.push({
      type: "problem" as const,
      category: "conversion",
      severity: "high",
      title: `Bloqueo comprobado al intentar ${label}`,
      description: journey.blockers.join(" "),
      evidence: journey.evidence.join(" "),
      pageUrl: journey.urls[0] || "website-journey",
      source: "playwright",
      confidence: "alta",
      impact: "alto",
    });
  }
  return findings;
}

function normalizeUrl(value: string) {
  const parsed = new URL(value);
  parsed.hash = "";
  if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/$/, "");
  return parsed.toString();
}
