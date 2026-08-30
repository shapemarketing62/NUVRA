export type BusinessUnderstandingGroup = "business" | "presence" | "goal" | "resources";

export interface BusinessUnderstandingItem {
  key: string;
  label: string;
  value: string;
  group?: BusinessUnderstandingGroup;
  basis?: string;
  source?: string;
  url?: string | null;
}

export interface BusinessUnderstandingView {
  declared: BusinessUnderstandingItem[];
  observed: BusinessUnderstandingItem[];
  inferred: BusinessUnderstandingItem[];
  unknown: Array<{ key: string; label: string }>;
}

export type CompetitionValidationState = "comparable" | "probable";

export interface CompetitionEvidenceView {
  label: string;
  sourceType: string;
  url: string | null;
  context: string | null;
}

export interface CompetitionDifferenceView {
  key: string;
  text: string;
  evidenceUrls: string[];
}

export interface CompetitionCompetitorView {
  name: string;
  validation: CompetitionValidationState;
  type: "direct" | "partial" | "indirect";
  location: string | null;
  whyComparable: string[];
  channels: string[];
  observations: string[];
  differences: CompetitionDifferenceView[];
  opportunity: { text: string; evidenceUrls: string[] } | null;
  evidence: CompetitionEvidenceView[];
}

export interface CompetitionView {
  entitled: boolean;
  status: "available" | "limited" | "unavailable";
  context: string | null;
  comparable: CompetitionCompetitorView[];
  probable: CompetitionCompetitorView[];
  discardedCount: number;
}

type UnknownRecord = Record<string, any>;
const record = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
const array = (value: unknown): any[] => Array.isArray(value) ? value : [];
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const nullableText = (value: unknown): string | null => text(value) || null;

function safeUrl(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch { return null; }
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (!value) return [];
  if (typeof value === "string") {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(text).filter(Boolean) : [value.trim()].filter(Boolean); }
    catch { return [value.trim()].filter(Boolean); }
  }
  return [];
}

function formatMoney(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value)
    : null;
}

function translateModel(value: string): string | null {
  return ({
    appointments: "Servicios que funcionan con turnos",
    reservations: "Negocio que funciona con reservas o pedidos",
    commerce: "Venta de productos",
    membership: "Servicio por membresía",
    professional: "Servicios profesionales",
    local_service: "Servicio local",
  } as Record<string, string>)[value] || null;
}

function translateOperatingMode(value: string): string | null {
  return ({ physical: "Principalmente presencial", online: "Principalmente online", mixed: "Presencial y online" } as Record<string, string>)[value] || null;
}

function translateRecurrence(value: string): string | null {
  return ({ frequent: "Compra o visita frecuente", periodic: "Relación periódica", membership: "Relación por membresía", occasional: "Compra o contratación ocasional" } as Record<string, string>)[value] || null;
}

function traceBasis(profile: UnknownRecord, field: string): string | undefined {
  const item = array(profile.inferenceTrace).map(record).find((entry) => text(entry.field) === field && text(entry.source) === "inferred");
  const basis = text(item?.evidence);
  return basis && !/undefined|null/i.test(basis) ? basis.slice(0, 240) : undefined;
}

export function buildBusinessUnderstandingView(input: { business: unknown; goal: unknown; snapshot: unknown }): BusinessUnderstandingView {
  const business = record(input.business);
  const goal = record(input.goal);
  const snapshot = record(input.snapshot);
  const profile = record(snapshot.businessProfile);
  const declared: BusinessUnderstandingItem[] = [];
  const addDeclared = (key: string, label: string, value: unknown, group: BusinessUnderstandingGroup, url?: string | null) => {
    const normalized = typeof value === "number" ? String(value) : text(value);
    if (normalized) declared.push({ key, label, value: normalized, group, ...(url !== undefined ? { url } : {}) });
  };

  addDeclared("name", "Nombre", business.nombre, "business");
  addDeclared("industry", "Rubro que nos indicaste", business.rubro, "business");
  addDeclared("description", "Descripción", business.descripcion, "business");
  addDeclared("location", "Ubicación", business.ubicacion, "business");
  addDeclared("city", "Ciudad", business.ciudad, "business");
  addDeclared("country", "País", business.pais, "business");
  addDeclared("offerings", "Productos o servicios", business.productosServicios, "business");
  addDeclared("audience", "Público principal", business.publicoObjetivo, "business");
  addDeclared("customerType", "Tipo de cliente", business.tipoCliente, "business");
  addDeclared("website", "Página web", business.webUrl, "presence", safeUrl(business.webUrl));
  if (business.noWebDeclared === true) addDeclared("websiteAbsence", "Página web", "Nos indicaste que el negocio no tiene página web", "presence");
  addDeclared("instagram", "Instagram", business.instagramHandle, "presence", safeUrl(business.instagramHandle));
  if (business.noInstagramDeclared === true) addDeclared("instagramAbsence", "Instagram", "Nos indicaste que el negocio no tiene Instagram", "presence");
  const channels = parseList(business.canales);
  if (channels.length) addDeclared("channels", "Otros canales", channels.join(", "), "presence");
  addDeclared("additional", "Información adicional", business.otrosCanales, "business");
  addDeclared("objective", "Objetivo actual", goal.objetivo, "goal");
  addDeclared("customObjective", "Detalle del objetivo", goal.objetivoCustom, "goal");
  if (typeof goal.magnitud === "number") addDeclared("magnitude", "Magnitud esperada", `${goal.magnitud}%`, "goal");
  addDeclared("timeframe", "Plazo", goal.plazoLabel, "goal");
  const budget = formatMoney(business.inversionMarketing);
  if (budget) addDeclared("budget", "Inversión disponible", budget, "resources");
  addDeclared("capacity", "Capacidad del equipo", business.empleados || business.tamano, "resources");

  const observed = array(profile.commercialEvidence)
    .map(record)
    .filter((item) => text(item.kind) === "ObservedEvidence" && text(item.text))
    .slice(0, 10)
    .map((item, index) => ({
      key: `observed-${index + 1}`,
      label: text(item.source) === "web" ? "Sitio web" : text(item.source) === "instagram" ? "Instagram" : text(item.source) === "reviews" ? "Reseñas" : text(item.source) === "search" ? "Búsqueda pública" : "Fuente pública",
      value: text(item.text),
      source: text(item.acquisitionMethod) === "search_index" ? "Resultado de búsqueda" : "Observación directa",
      url: safeUrl(item.attribution),
    }));

  const inferred: BusinessUnderstandingItem[] = [];
  const addInferred = (key: string, label: string, value: string | null, traceField?: string) => {
    if (value) inferred.push({ key, label, value, basis: traceBasis(profile, traceField || key) });
  };
  addInferred("category", "Cómo entendemos la categoría", nullableText(profile.inferredCategory));
  addInferred("commercialModel", "Cómo funciona comercialmente", translateModel(text(profile.commercialModel)), "commercialModel");
  addInferred("operatingMode", "Modalidad", translateOperatingMode(text(profile.operatingMode)), "operatingMode");
  addInferred("primaryAction", "Paso principal del cliente", nullableText(profile.primaryCustomerAction), "primaryCustomerAction");
  addInferred("recurrence", "Tipo de relación con clientes", translateRecurrence(text(profile.recurrence)), "purchasePattern");
  const offerings = array(profile.offerings).map(text).filter(Boolean);
  if (offerings.length) addInferred("offerings", "Oferta que identificamos", offerings.join(" · "));
  const audience = array(profile.audienceSignals).map(text).filter(Boolean);
  if (audience.length) addInferred("audience", "Cliente principal que interpretamos", audience.join(" · "));
  const contacts = array(profile.contactMethods).map(text).filter(Boolean);
  if (contacts.length) addInferred("contacts", "Formas de contacto identificadas", contacts.join(", "));
  if (nullableText(profile.primaryChannel) && text(profile.primaryChannel) !== "unknown") addInferred("primaryChannel", "Canal que parece principal", text(profile.primaryChannel), "primaryChannel");

  const unknown: BusinessUnderstandingView["unknown"] = [];
  if (!audience.length) unknown.push({ key: "audience", label: "Cliente principal" });
  if (!offerings.length) unknown.push({ key: "offerings", label: "Oferta principal" });
  if (!translateModel(text(profile.commercialModel)) || text(profile.commercialModel) === "general") unknown.push({ key: "commercialModel", label: "Modelo comercial" });
  if (!translateRecurrence(text(profile.recurrence))) unknown.push({ key: "recurrence", label: "Frecuencia con la que vuelven los clientes" });
  if (!nullableText(profile.primaryChannel) || text(profile.primaryChannel) === "unknown") unknown.push({ key: "primaryChannel", label: "Canal principal" });
  if (!contacts.length) unknown.push({ key: "contacts", label: "Formas de contacto más utilizadas" });

  return { declared, observed, inferred, unknown };
}

function evidenceProjection(competitor: UnknownRecord): CompetitionEvidenceView[] {
  return array(competitor.evidence).map(record)
    .filter((item) => text(item.type) !== "irrelevant" && (text(item.label) || safeUrl(item.url)))
    .slice(0, 6)
    .map((item) => ({
      label: text(item.label) || "Fuente pública",
      sourceType: ({ official_source: "Sitio oficial", social_profile: "Perfil social", directory: "Directorio", earned_media: "Medio o nota", community: "Comunidad" } as Record<string, string>)[text(item.type)] || "Fuente pública",
      url: safeUrl(item.url),
      context: nullableText(item.snippet),
    }));
}

function comparisonSignals(competitor: UnknownRecord): string[] {
  return array(competitor.competitorRelevanceReasons).map(text).filter((reason) => /rubro|categor|mercado|zona|ubicaci|producto|servicio|oferta|modelo comercial|cliente|presencia física|ocasión/i.test(reason)).slice(0, 4);
}

function buildDifferences(competitor: UnknownRecord, business: UnknownRecord, evidence: CompetitionEvidenceView[]): CompetitionDifferenceView[] {
  const differences: CompetitionDifferenceView[] = [];
  const urls = evidence.map((item) => item.url).filter((url): url is string => Boolean(url));
  if (nullableText(competitor.officialWebsite) && business.noWebDeclared === true) {
    differences.push({ key: "website", text: "Este negocio tiene un sitio oficial verificado y vos nos indicaste que actualmente no tenés página web.", evidenceUrls: urls });
  }
  if (nullableText(competitor.officialSocialProfile) && business.noInstagramDeclared === true) {
    differences.push({ key: "social", text: "Encontramos un perfil social oficial de este negocio y vos nos indicaste que actualmente no tenés Instagram.", evidenceUrls: urls });
  }
  return differences;
}

function competitiveOpportunity(differences: CompetitionDifferenceView[], objective: string | null): CompetitionCompetitorView["opportunity"] {
  if (!differences.length) return null;
  const evidenceUrls = Array.from(new Set(differences.flatMap((item) => item.evidenceUrls)));
  const context = objective ? ` para avanzar hacia “${objective}”` : "";
  if (differences.some((item) => item.key === "website")) return { text: `La presencia web que observamos en este comparable muestra un espacio que podría ser relevante${context}.`, evidenceUrls };
  if (differences.some((item) => item.key === "social")) return { text: `La presencia social verificada en este comparable muestra un canal que podría ser relevante${context}.`, evidenceUrls };
  return null;
}

export function buildCompetitionView(input: {
  business: unknown;
  profile: unknown;
  summary: unknown;
  objective?: string | null;
  sourceStatus?: string | null;
  entitled: boolean;
  limit: number;
}): CompetitionView {
  if (!input.entitled) return { entitled: false, status: "unavailable", context: null, comparable: [], probable: [], discardedCount: 0 };
  const business = record(input.business);
  const profile = record(input.profile);
  const rawCompetitors = array(record(input.summary).competitors);
  const localBusiness = text(profile.localDependency) === "high";
  const model = translateModel(text(profile.commercialModel));
  const contextParts = [model, nullableText(profile.location) ? `mercado: ${text(profile.location)}` : null].filter(Boolean);
  const projected: CompetitionCompetitorView[] = [];
  let discardedCount = 0;

  for (const item of rawCompetitors.map(record)) {
    const classification = text(item.classification);
    if (classification === "rejected" || classification === "uncertain" || !text(item.name)) { discardedCount += 1; continue; }
    const signals = comparisonSignals(item);
    const hasCategory = signals.some((reason) => /rubro|categor/i.test(reason));
    const hasCommercialFit = signals.some((reason) => /producto|servicio|oferta|modelo comercial|cliente|ocasión/i.test(reason));
    const hasLocation = signals.some((reason) => /mercado|zona|ubicaci|presencia física/i.test(reason));
    const qualifiesAsComparable = classification === "confirmed_competitor" && hasCategory && hasCommercialFit && (!localBusiness || hasLocation);
    const evidence = evidenceProjection(item);
    const differences = buildDifferences(item, business, evidence);
    const channels = [nullableText(item.officialWebsite) ? "Sitio oficial" : null, nullableText(item.officialSocialProfile) ? "Perfil social oficial" : null].filter((value): value is string => Boolean(value));
    projected.push({
      name: text(item.name),
      validation: qualifiesAsComparable ? "comparable" : "probable",
      type: ["direct", "partial", "indirect"].includes(text(item.competitorType)) ? item.competitorType : "indirect",
      location: nullableText(item.location),
      whyComparable: signals,
      channels,
      observations: evidence.map((item) => item.context || item.label).filter(Boolean).slice(0, 4) as string[],
      differences,
      opportunity: competitiveOpportunity(differences, input.objective || null),
      evidence,
    });
  }

  const comparable = projected.filter((item) => item.validation === "comparable").slice(0, input.limit);
  const probable = projected.filter((item) => item.validation === "probable").slice(0, Math.max(0, input.limit - comparable.length));
  const status = comparable.length ? "available" : text(input.sourceStatus) === "analyzed" || text(input.sourceStatus) === "evaluated" ? "limited" : "unavailable";
  return { entitled: true, status, context: contextParts.length ? `La comparación considera ${contextParts.join(" y ")}.` : null, comparable, probable, discardedCount };
}
