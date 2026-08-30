import { normalizeActionStatus, type ActionStatus } from "./action-execution.ts";

type RawRecord = Record<string, any>;
export type EvolutionAnalysisStatus = "completed" | "partial" | "unknown";
export type EvolutionDirection = "improved" | "unchanged" | "declined" | "newly_evaluable" | "no_longer_evaluable" | "not_comparable";
export type ActionChangeRelation = "temporal_only" | "plausible_relation" | "supported_relation";

export interface EvolutionAnalysisView {
  id: string;
  date: string;
  score: number | null;
  methodologyVersion: string | null;
  status: EvolutionAnalysisStatus;
  completion: "complete" | "partial" | "unknown";
  coverage: number | null;
  evidenceCount: number | null;
  strategyId: string | null;
  dimensions: Array<{ slug: string; name: string; points: number | null }>;
  sourceStatuses: Record<string, string>;
  mainProblem: { id: string | null; text: string } | null;
  strengths: Array<{ id: string | null; text: string }>;
  frictions: Array<{ id: string | null; text: string }>;
  opportunities: Array<{ id: string | null; text: string }>;
}

export interface EvolutionView {
  hasCurrentAnalysis: boolean;
  hasComparison: boolean;
  currentAnalysis: EvolutionAnalysisView | null;
  previousComparableAnalysis: EvolutionAnalysisView | null;
  globalDelta: number | null;
  generalDirection: "improved" | "unchanged" | "declined" | "not_comparable";
  dimensionChanges: Array<{
    slug: string;
    name: string;
    previous: number | null;
    current: number | null;
    delta: number | null;
    direction: EvolutionDirection;
  }>;
  diagnosisChanges: {
    newStrengths: string[];
    noLongerObservedStrengths: string[];
    newFrictions: string[];
    noLongerObservedFrictions: string[];
    newOpportunities: string[];
    noLongerObservedOpportunities: string[];
  };
  priorityChange: {
    status: "same" | "changed" | "unknown";
    previous: string | null;
    current: string | null;
    explanation: string | null;
  };
  actionActivity: {
    completed: EvolutionActionActivity[];
    started: EvolutionActionActivity[];
    pending: EvolutionActionActivity[];
    counts: { completed: number; inProgress: number; pending: number };
  };
  sourceChanges: Array<{
    source: string;
    previousStatus: string;
    currentStatus: string;
    kind: "new_source" | "more_information" | "lost_access" | "status_changed";
  }>;
  evidenceChanges: { previousCount: number | null; currentCount: number | null; delta: number | null };
  interpretationNotes: string[];
  history: Array<EvolutionAnalysisView & { comparableToCurrent: boolean; comparisonLabel: string | null }>;
}

export interface EvolutionActionActivity {
  id: string;
  title: string;
  status: ActionStatus;
  eventDate: string | null;
  relatedProblem: string | null;
  strategyDirection: string | null;
  dimension: string | null;
  relation: ActionChangeRelation;
  relationText: string;
}

function record(value: unknown): RawRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as RawRecord : {}; }
function array(value: unknown): any[] { return Array.isArray(value) ? value : []; }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function nullableText(value: unknown): string | null { const result = text(value); return result || null; }
function number(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function date(value: unknown): string | null { const parsed = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null; return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null; }
function json(value: unknown, fallback: unknown = null): any { if (typeof value !== "string") return value ?? fallback; try { return JSON.parse(value); } catch { return fallback; } }
function normalize(value: unknown): string { return text(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }

function item(value: unknown, textFields: string[]): { id: string | null; text: string } | null {
  if (typeof value === "string") return value.trim() ? { id: null, text: value.trim() } : null;
  const source = record(value);
  const itemText = textFields.map((field) => text(source[field])).find(Boolean) || "";
  return itemText ? { id: nullableText(source.id), text: itemText } : null;
}

function items(value: unknown, fields: string[]) {
  return array(json(value, [])).map((entry) => item(entry, fields)).filter((entry): entry is { id: string | null; text: string } => Boolean(entry));
}

function sourceStatus(value: unknown): string {
  const status = normalize(value).replace(/ /g, "_");
  if (status === "evaluated") return "analyzed";
  return status || "unknown";
}

function analysisStatus(sourceStatuses: Record<string, string>): EvolutionAnalysisStatus {
  const statuses = Object.values(sourceStatuses);
  if (!statuses.length) return "unknown";
  return statuses.some((status) => ["partial", "unavailable", "requires_auth", "error", "not_found"].includes(status)) ? "partial" : "completed";
}

function strategyMap(rawStrategies: unknown) {
  return new Map(array(rawStrategies).map((value) => {
    const strategy = record(value);
    return [text(strategy.id), strategy] as const;
  }).filter(([id]) => id));
}

function projectAnalysis(rawValue: unknown, strategies: Map<string, RawRecord>): EvolutionAnalysisView | null {
  const raw = record(rawValue);
  const id = text(raw.id);
  const createdAt = date(raw.createdAt);
  if (!id || !createdAt) return null;
  const snapshot = record(json(raw.snapshot, {}));
  const intelligence = record(snapshot.intelligence);
  const sourceStatuses = Object.fromEntries(Object.entries(record(intelligence.sourceStatuses)).map(([key, value]) => [key, sourceStatus(value)]));
  const persistedStatus = normalize(raw.status).replace(/ /g, "_");
  const status = ["failed", "pending", "running", "queued"].includes(persistedStatus) ? "unknown" : analysisStatus(sourceStatuses);
  const strategyId = nullableText(raw.strategyId);
  const strategy = strategyId ? record(strategies.get(strategyId)) : {};
  const diagnosis = record(strategy.diagnosis);
  const audit = record(snapshot.analysisAudit);
  const profile = record(snapshot.businessProfile);
  const selectedProblem = item(audit.selectedProblem, ["hypothesis", "title", "explanation"])
    || item(json(diagnosis.bottleneck, null), ["title", "hypothesis", "explanation"])
    || (text(strategy.principalProblema) ? { id: null, text: text(strategy.principalProblema) } : null);
  const strengths = items(profile.strengthCandidates, ["statement", "title"]);
  const frictions = items(profile.problemCandidates, ["hypothesis", "title"]).filter((candidate) => {
    const source = array(profile.problemCandidates).find((entry) => nullableText(record(entry).id) === candidate.id);
    return !source || !["discarded"].includes(text(record(source).validationStatus));
  });
  const opportunities = items(audit.selectedOpportunities, ["text", "title", "hypothesis"]);
  return {
    id,
    date: createdAt,
    score: number(raw.nuvraScoreTotal ?? snapshot.score),
    methodologyVersion: nullableText(snapshot.scoreMethodologyVersion),
    status,
    completion: status === "completed" ? "complete" : status === "partial" ? "partial" : "unknown",
    coverage: number(intelligence.coverage),
    evidenceCount: number(record(audit.survivingEvidence).totalFindings),
    strategyId,
    dimensions: array(snapshot.dimensions).map((value) => {
      const dimension = record(value);
      return { slug: text(dimension.slug), name: text(dimension.name) || text(dimension.slug), points: number(dimension.points) };
    }).filter((dimension) => dimension.slug),
    sourceStatuses,
    mainProblem: selectedProblem,
    strengths: strengths.length ? strengths : items(diagnosis.strengths, ["title", "evidence"]),
    frictions: frictions.length ? frictions : items(diagnosis.weaknesses, ["title", "evidence"]),
    opportunities: opportunities.length ? opportunities : items(diagnosis.opportunities, ["text", "title"]),
  };
}

function validForEvolution(analysis: EvolutionAnalysisView) {
  return analysis.status === "completed" || analysis.status === "partial";
}

export function isAnalysisComparable(previous: EvolutionAnalysisView | null, current: EvolutionAnalysisView | null): boolean {
  if (!previous || !current || !validForEvolution(previous) || !validForEvolution(current)) return false;
  return Boolean(previous.methodologyVersion && current.methodologyVersion && previous.methodologyVersion === current.methodologyVersion);
}

function identity(entry: { id: string | null; text: string }) { return entry.id ? `id:${entry.id}` : `text:${normalize(entry.text)}`; }
function listDifference(current: Array<{ id: string | null; text: string }>, previous: Array<{ id: string | null; text: string }>) {
  const previousKeys = new Set(previous.map(identity));
  return current.filter((entry) => !previousKeys.has(identity(entry))).map((entry) => entry.text);
}

function dimensions(previous: EvolutionAnalysisView, current: EvolutionAnalysisView) {
  const previousBySlug = new Map(previous.dimensions.map((dimension) => [dimension.slug, dimension]));
  const currentBySlug = new Map(current.dimensions.map((dimension) => [dimension.slug, dimension]));
  return Array.from(new Set([...Array.from(previousBySlug.keys()), ...Array.from(currentBySlug.keys())])).map((slug) => {
    const before = previousBySlug.get(slug);
    const after = currentBySlug.get(slug);
    const previousPoints = before?.points ?? null;
    const currentPoints = after?.points ?? null;
    const name = after?.name || before?.name || slug;
    if (previousPoints === null && currentPoints !== null) return { slug, name, previous: null, current: currentPoints, delta: null, direction: "newly_evaluable" as const };
    if (previousPoints !== null && currentPoints === null) return { slug, name, previous: previousPoints, current: null, delta: null, direction: "no_longer_evaluable" as const };
    if (previousPoints === null || currentPoints === null) return { slug, name, previous: previousPoints, current: currentPoints, delta: null, direction: "not_comparable" as const };
    const delta = currentPoints - previousPoints;
    return { slug, name, previous: previousPoints, current: currentPoints, delta, direction: delta > 0 ? "improved" as const : delta < 0 ? "declined" as const : "unchanged" as const };
  });
}

function sourceChanges(previous: EvolutionAnalysisView, current: EvolutionAnalysisView): EvolutionView["sourceChanges"] {
  return Array.from(new Set([...Object.keys(previous.sourceStatuses), ...Object.keys(current.sourceStatuses)])).flatMap((source) => {
    const before = previous.sourceStatuses[source] || "unknown";
    const after = current.sourceStatuses[source] || "unknown";
    if (before === after) return [];
    const beforeUseful = ["analyzed", "partial"].includes(before);
    const afterUseful = ["analyzed", "partial"].includes(after);
    const kind = !beforeUseful && afterUseful ? "new_source" : before === "partial" && after === "analyzed" ? "more_information" : beforeUseful && !afterUseful ? "lost_access" : "status_changed";
    return [{ source, previousStatus: before, currentStatus: after, kind }];
  });
}

function inPeriod(value: unknown, start: string, end: string) {
  const eventDate = date(value);
  return Boolean(eventDate && eventDate > start && eventDate <= end);
}

function actionActivity(previous: EvolutionAnalysisView, current: EvolutionAnalysisView, strategies: Map<string, RawRecord>, dimensionChanges: EvolutionView["dimensionChanges"]): EvolutionView["actionActivity"] {
  const strategy = previous.strategyId ? record(strategies.get(previous.strategyId)) : {};
  const actions = array(strategy.actions);
  const project = (rawValue: unknown, eventDate: string | null): EvolutionActionActivity => {
    const raw = record(rawValue);
    const dimension = nullableText(raw.dimension);
    const relatedDimension = dimension ? dimensionChanges.find((change) => normalize(change.slug) === normalize(dimension) || normalize(change.name) === normalize(dimension)) : null;
    const supported = raw.causalEvidence === true;
    const plausible = Boolean(relatedDimension && ["improved", "declined"].includes(relatedDimension.direction));
    const relation: ActionChangeRelation = supported ? "supported_relation" : plausible ? "plausible_relation" : "temporal_only";
    return {
      id: text(raw.id),
      title: text(raw.title),
      status: normalizeActionStatus(raw),
      eventDate,
      relatedProblem: nullableText(raw.problem),
      strategyDirection: nullableText(strategy.distanciaObjetivo),
      dimension,
      relation,
      relationText: supported
        ? "La evidencia del análisis vincula esta acción con el cambio observado."
        : plausible
          ? "El cambio observado coincide con el área sobre la que trabajaste."
          : "Esta acción ocurrió antes del nuevo análisis; no alcanza para atribuirle el cambio.",
    };
  };
  const completed = actions.filter((action) => inPeriod(record(action).completedAt, previous.date, current.date)).map((action) => project(action, date(record(action).completedAt)));
  const started = actions.filter((action) => inPeriod(record(action).startedAt, previous.date, current.date) && !completed.some((completedAction) => completedAction.id === text(record(action).id))).map((action) => project(action, date(record(action).startedAt)));
  const pending = actions.filter((action) => {
    const raw = record(action);
    return !inPeriod(raw.startedAt, previous.date, current.date) && !inPeriod(raw.completedAt, previous.date, current.date) && (!date(raw.startedAt) || date(raw.startedAt)! > current.date);
  }).map((action) => project(action, null));
  return { completed, started, pending, counts: { completed: completed.length, inProgress: started.length, pending: pending.length } };
}

export function buildEvolutionView(input: { history: unknown; strategies?: unknown }): EvolutionView {
  const strategies = strategyMap(input.strategies);
  const analyses = array(input.history).map((value) => projectAnalysis(value, strategies)).filter((value): value is EvolutionAnalysisView => Boolean(value)).sort((a, b) => b.date.localeCompare(a.date));
  const current = analyses.find(validForEvolution) || null;
  const previous = current ? analyses.slice(analyses.indexOf(current) + 1).find((analysis) => isAnalysisComparable(analysis, current)) || null : null;
  const hasComparison = isAnalysisComparable(previous, current);
  const globalDelta = hasComparison && previous && current && previous.score !== null && current.score !== null ? current.score - previous.score : null;
  const dimensionChanges = hasComparison && previous && current ? dimensions(previous, current) : [];
  const changedSources = hasComparison && previous && current ? sourceChanges(previous, current) : [];
  const previousEvidence = previous?.evidenceCount ?? null;
  const currentEvidence = current?.evidenceCount ?? null;
  const evidenceDelta = previousEvidence !== null && currentEvidence !== null ? currentEvidence - previousEvidence : null;
  const notes: string[] = [];
  if (current?.status === "partial") notes.push("El análisis actual fue parcial; los cambios deben leerse con cautela.");
  if (previous?.status === "partial") notes.push("El análisis anterior también utilizó información parcial.");
  if ((evidenceDelta !== null && evidenceDelta > 0) || changedSources.some((change) => ["new_source", "more_information"].includes(change.kind))) notes.push("Parte de la diferencia puede deberse a que el análisis actual contó con más información.");
  if (changedSources.some((change) => change.kind === "lost_access")) notes.push("El análisis actual tuvo menos acceso a alguna fuente; una baja no implica necesariamente que el negocio haya empeorado.");
  const currentProblem = current?.mainProblem || null;
  const previousProblem = previous?.mainProblem || null;
  const samePriority = currentProblem && previousProblem ? identity(currentProblem) === identity(previousProblem) : null;
  const activity = hasComparison && previous && current ? actionActivity(previous, current, strategies, dimensionChanges) : { completed: [], started: [], pending: [], counts: { completed: 0, inProgress: 0, pending: 0 } };
  return {
    hasCurrentAnalysis: Boolean(current),
    hasComparison,
    currentAnalysis: current,
    previousComparableAnalysis: previous,
    globalDelta,
    generalDirection: globalDelta === null ? "not_comparable" : globalDelta > 0 ? "improved" : globalDelta < 0 ? "declined" : "unchanged",
    dimensionChanges,
    diagnosisChanges: {
      newStrengths: current && previous ? listDifference(current.strengths, previous.strengths) : [],
      noLongerObservedStrengths: current && previous ? listDifference(previous.strengths, current.strengths) : [],
      newFrictions: current && previous ? listDifference(current.frictions, previous.frictions) : [],
      noLongerObservedFrictions: current && previous ? listDifference(previous.frictions, current.frictions) : [],
      newOpportunities: current && previous ? listDifference(current.opportunities, previous.opportunities) : [],
      noLongerObservedOpportunities: current && previous ? listDifference(previous.opportunities, current.opportunities) : [],
    },
    priorityChange: {
      status: samePriority === null ? "unknown" : samePriority ? "same" : "changed",
      previous: previousProblem?.text || null,
      current: currentProblem?.text || null,
      explanation: samePriority === false && notes.some((note) => note.includes("más información")) ? "La prioridad cambió al mismo tiempo que aumentó la información disponible; no asumimos que el negocio haya cambiado en la misma medida." : null,
    },
    actionActivity: activity,
    sourceChanges: changedSources,
    evidenceChanges: { previousCount: previousEvidence, currentCount: currentEvidence, delta: evidenceDelta },
    interpretationNotes: notes,
    history: analyses.map((analysis) => ({
      ...analysis,
      comparableToCurrent: Boolean(current && isAnalysisComparable(analysis, current)),
      comparisonLabel: current && analysis.id !== current.id && !isAnalysisComparable(analysis, current) ? "Análisis realizado con una metodología anterior o información insuficiente para compararlo." : null,
    })),
  };
}
