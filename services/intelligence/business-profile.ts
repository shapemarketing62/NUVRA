import type { Business } from "@prisma/client";
import type { AggregatedEvidence } from "./evidence-aggregator";
import type { EvidenceFinding, SourceType } from "./source-analyzer";
import { getGoalAdjustedAction, selectBusinessPlaybook, type CommercialModel } from "../strategy/business-playbook.ts";
import { buildCommercialEvidence, type CommercialEvidence, type CommercialProcessingIssue } from "./commercial-evidence.ts";
import { CommercialJourneyEngine, type CommercialJourney } from "./commercial-journey-engine.ts";
import { buildProblemCandidates, buildStrengthCandidates, type ProblemCandidate, type StrengthCandidate } from "./commercial-candidates.ts";
import { EvidenceCorroborationEngine, type EvidenceConflict } from "./evidence/evidence-corroboration-engine.ts";
import { GoalInterpreter, goalAreaRelevance, type GoalInterpretation } from "./goal-interpreter.ts";

type GoalInput = { objetivo?: string; magnitud?: number | null; plazoDias?: number; plazoLabel?: string };
type BusinessWithGoal = Business & { goals?: GoalInput[] };

export interface ContextualFinding {
  id: string;
  findingId: string;
  area: string;
  type: "strength" | "problem" | "context";
  source: SourceType;
  evidence: string;
  attribution: string;
  interpretation: string;
  goalRelation: string;
  confidence: "ALTA" | "MEDIA" | "BAJA";
  impact: "high" | "medium" | "low";
  goalRelevance: number;
  businessRelevance: number;
  priorityScore: number;
}

export interface DeclaredSignal {
  id: string;
  type: "referrals" | "channel" | "capacity" | "demand_pattern" | "follow_up" | "general";
  evidence: string;
}

export interface BusinessProfile {
  businessId: string;
  businessName: string;
  originalIndustry: string;
  inferredCategory: string;
  commercialModel: CommercialModel;
  operatingMode: "physical" | "online" | "mixed" | "unknown";
  localDependency: "high" | "medium" | "low";
  location: string | null;
  customerType: string | null;
  offerings: string[];
  offeringType: "product" | "service" | "both" | "unknown";
  audienceSignals: string[];
  primaryCustomerAction: string;
  primaryResult: string;
  recurrence: "frequent" | "periodic" | "membership" | "occasional" | "unknown";
  requiresAppointmentOrReservation: boolean;
  purchasePattern: "single" | "repeated" | "continuous" | "unknown";
  geographicArea: string | null;
  activeChannels: SourceType[];
  primaryChannel: SourceType | null;
  unavailableChannels: SourceType[];
  channelDeclarations: { web: "present" | "absent" | "unknown"; instagram: "present" | "absent" | "unknown" };
  contactMethods: string[];
  trustSignals: string[];
  declaredSignals: DeclaredSignal[];
  strengths: ContextualFinding[];
  problems: ContextualFinding[];
  contextualFindings: ContextualFinding[];
  competitorsDetected: number;
  goal: { text: string; goalOriginalText: string; interpretation: GoalInterpretation; magnitude: number | null; timeframeDays: number | null; timeframeLabel: string | null };
  resources: { monthlyBudget: number | null; executionCapacity: string | null };
  additionalInformation: string | null;
  decisionFactors: { trust: number; price: number; reviews: number; proximity: number };
  areaRelevance: Record<string, { goalRelevance: number; businessRelevance: number }>;
  inferenceTrace: Array<{ field: string; value: string; evidence: string; source: "declared" | "observed" | "inferred" }>;
  commercialEvidence: CommercialEvidence[];
  commercialJourney: CommercialJourney;
  problemCandidates: ProblemCandidate[];
  strengthCandidates: StrengthCandidate[];
  evidenceConflicts: EvidenceConflict[];
  processingIssues: CommercialProcessingIssue[];
}

const categoryToArea = (category: string): string => {
  if (/conversion/.test(category)) return "conversion";
  if (/posicionamiento/.test(category)) return "posicionamiento";
  if (/propuesta/.test(category)) return "propuesta";
  if (/redes/.test(category)) return "redes";
  if (/adquisicion|seo/.test(category)) return "adquisicion";
  if (/retencion/.test(category)) return "retencion";
  if (/identidad|brand/.test(category)) return "identidad";
  return "presencia";
};

const parseDeclaredChannels = (value: string | null): string[] => {
  if (!value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : [value]; }
  catch { return [value]; }
};

function inferDeclaredSignals(text: string | null): DeclaredSignal[] {
  if (!text?.trim()) return [];
  const patterns: Array<[DeclaredSignal["type"], RegExp]> = [
    ["referrals", /recomendaci|referid|boca a boca/i],
    ["capacity", /pocos cupos|capacidad|agenda llena|sin cupo/i],
    ["demand_pattern", /lunes|martes|mi[eé]rcoles|jueves|viernes|fin de semana|temporada|pocas reservas/i],
    ["follow_up", /seguimiento|recordatorio|post.?venta|base de clientes/i],
    ["channel", /whatsapp|instagram|google|maps|tel[eé]fono|email/i],
  ];
  const matches = patterns.filter(([, pattern]) => pattern.test(text)).map(([type]) => ({ id: `declared:${type}`, type, evidence: text.trim() }));
  return matches.length ? matches : [{ id: "declared:general", type: "general", evidence: text.trim() }];
}

function explainFinding(finding: EvidenceFinding, primaryAction: string, model: CommercialModel): string {
  const text = `${finding.evidence} ${finding.attribution}`.toLowerCase();
  const effect = finding.type === "positive" ? "facilita" : finding.type === "negative" ? "puede dificultar" : "ayuda a entender";
  if (/horario|direcci[oó]n|ubicaci[oó]n|maps|mapa|c[oó]mo llegar/.test(text)) return `En un negocio que depende de su zona, esta información ${effect} que una persona decida visitar el lugar sin dudas.`;
  if (/env[ií]o|entrega|medio de pago|checkout|carrito/.test(text)) return `En una compra online, esta información ${effect} que el cliente pueda decidir y completar la compra sin sorpresas tardías.`;
  if (/turno|reserv|reuni[oó]n|consulta|whatsapp|formulario|contact/.test(text)) return `Esta evidencia ${effect} que una persona interesada pueda ${primaryAction} sin buscar otro canal ni dar pasos innecesarios.`;
  if (/reseña|opini[oó]n|testimonio|caso|profesional|equipo|garant[ií]a/.test(text)) return `Esta evidencia ${effect} que una persona reduzca sus dudas antes de ${primaryAction}.`;
  if (/precio|promoci[oó]n|servicio|producto|tratamiento|men[uú]|cat[aá]logo|especiali/.test(text)) return `Esta información ${effect} que la persona entienda qué puede elegir y si la propuesta responde a lo que necesita.`;
  if (finding.source === "instagram") return `Lo observado en Instagram ${effect} que el perfil explique el negocio y conduzca hacia ${primaryAction}.`;
  if (finding.source === "search" || finding.source === "external_mentions") return `Esta presencia pública ${effect} que el negocio correcto sea encontrado y reconocido antes de ${primaryAction}.`;
  if (model === "professional") return `Para un servicio profesional, esta señal ${effect} que el cliente comprenda la especialización y avance hacia ${primaryAction}.`;
  return `En este negocio, esta señal ${effect} que una persona avance hacia ${primaryAction}.`;
}

function contextualizeFinding(finding: EvidenceFinding, primaryAction: string, goal: string, goalRelevance: number, businessRelevance: number, model: CommercialModel): ContextualFinding {
  const area = categoryToArea(finding.category);
  const type = finding.type === "positive" ? "strength" : finding.type === "negative" ? "problem" : "context";
  const effect = type === "strength" ? "apoya" : type === "problem" ? "puede dificultar" : "ayuda a entender";
  const confidence = finding.confidence === "ALTA" || finding.confidence === "MEDIA" ? finding.confidence : "BAJA";
  const impactValue = finding.impact === "high" ? 1 : finding.impact === "medium" ? .7 : .4;
  const confidenceValue = confidence === "ALTA" ? 1 : confidence === "MEDIA" ? .75 : .5;
  return {
    id: `context:${finding.id}`,
    findingId: finding.id,
    area,
    type,
    source: finding.source,
    evidence: finding.evidence,
    attribution: finding.attribution,
    interpretation: explainFinding(finding, primaryAction, model),
    goalRelation: `Para “${goal}”, esto ${effect} que más personas puedan ${primaryAction}.`,
    confidence,
    impact: finding.impact,
    goalRelevance,
    businessRelevance,
    priorityScore: Math.round(impactValue * confidenceValue * goalRelevance * businessRelevance * 100),
  };
}

export function buildBusinessProfile(business: BusinessWithGoal, aggregated: AggregatedEvidence): BusinessProfile {
  const goal = business.goals?.[0] || {};
  const interpretedGoal = GoalInterpreter.interpret(goal.objetivo || "hacer crecer el negocio");
  const contextText = [business.rubro, business.descripcion, business.productosServicios, business.publicoObjetivo, business.otrosCanales, goal.objetivo].filter(Boolean).join(" ");
  const playbook = selectBusinessPlaybook(contextText);
  const goalAction = getGoalAdjustedAction(playbook, goal.objetivo || "hacer crecer el negocio");
  const goalRelevance = goalAreaRelevance(interpretedGoal);
  const areaRelevance = Object.fromEntries(Object.keys(playbook.areaRelevance).map((area) => [area, { goalRelevance: goalRelevance[area] ?? .5, businessRelevance: playbook.areaRelevance[area] ?? .5 }]));
  const contextualFindings = aggregated.findings.map((finding) => {
    const area = categoryToArea(finding.category);
    return contextualizeFinding(finding, goalAction.action, goal.objetivo || "hacer crecer el negocio", areaRelevance[area].goalRelevance, areaRelevance[area].businessRelevance, playbook.model);
  });
  const declaredSignals = inferDeclaredSignals(business.otrosCanales);
  for (const signal of declaredSignals) {
    const area = signal.type === "referrals" ? "adquisicion" : signal.type === "follow_up" ? "retencion" : signal.type === "demand_pattern" ? "conversion" : "presencia";
    const relevance = areaRelevance[area];
    const declaredImportance = signal.type === "capacity" || signal.type === "demand_pattern" ? 90 : signal.type === "general" ? 55 : 80;
    contextualFindings.push({ id: `context:${signal.id}`, findingId: signal.id, area, type: signal.type === "capacity" ? "context" : signal.type === "demand_pattern" ? "problem" : "strength", source: "other", evidence: signal.evidence, attribution: "Información aportada por el negocio", interpretation: `El negocio informó este dato y debe usarse para decidir qué priorizar: ${signal.evidence}`, goalRelation: `Este dato modifica cómo conviene avanzar hacia “${goal.objetivo || "hacer crecer el negocio"}”.`, confidence: "ALTA", impact: signal.type === "demand_pattern" ? "medium" : "low", goalRelevance: relevance.goalRelevance, businessRelevance: relevance.businessRelevance, priorityScore: Math.round(relevance.goalRelevance * relevance.businessRelevance * declaredImportance) });
  }

  const activeChannels = Object.entries(aggregated.sources).filter(([, evidence]) => evidence.status === "evaluated").map(([source]) => source as SourceType);
  const declaredChannels = parseDeclaredChannels(business.canales);
  if (business.webUrl && !activeChannels.includes("web")) activeChannels.push("web");
  if (business.instagramHandle && !activeChannels.includes("instagram")) activeChannels.push("instagram");
  const contactText = `${contextText} ${aggregated.findings.map((finding) => finding.evidence).join(" ")}`.toLowerCase();
  const contactMethods = [[/whatsapp/, "WhatsApp"], [/tel[eé]fono|llamar/, "teléfono"], [/email|correo/, "email"], [/formulario/, "formulario"], [/instagram|mensaje directo/, "Instagram"]].filter(([pattern]) => (pattern as RegExp).test(contactText)).map(([, label]) => label as string);
  const trustSignals = contextualFindings.filter((finding) => finding.type === "strength" && (finding.source === "reviews" || /reseña|testimonio|caso|profesional|confianza/i.test(finding.evidence))).map((finding) => finding.evidence);
  const hasPhysical = Boolean(business.ubicacion || business.ciudad || /local|presencial|domicilio/i.test(contextText));
  const hasOnline = Boolean(business.webUrl || business.instagramHandle || /online|env[ií]o|e.?commerce/i.test(contextText));
  const competitors = aggregated.sources.competitor?.data as { totalValidated?: number } | null;
  const noWebDeclared = Boolean(business.noWebDeclared);
  const noInstagramDeclared = Boolean(business.noInstagramDeclared);
  const localDependency = playbook.model === "commerce" ? "low" : hasPhysical ? "high" : playbook.model === "professional" ? "medium" : "low";
  const audienceSignals = [business.publicoObjetivo, business.tipoCliente].filter((value): value is string => Boolean(value?.trim()));
  const inferenceTrace: BusinessProfile["inferenceTrace"] = [
    { field: "commercialModel", value: playbook.model, evidence: contextText, source: "inferred" },
    { field: "primaryCustomerAction", value: goalAction.action, evidence: goal.objetivo || "Objetivo no especificado", source: "inferred" },
    { field: "goalType", value: interpretedGoal.goalType, evidence: interpretedGoal.goalOriginalText, source: "inferred" },
    { field: "goalScope", value: interpretedGoal.goalScope.join(", "), evidence: interpretedGoal.goalOriginalText, source: "inferred" },
    ...(business.ubicacion ? [{ field: "location", value: business.ubicacion, evidence: business.ubicacion, source: "declared" as const }] : []),
    ...(noWebDeclared ? [{ field: "webDeclaration", value: "absent", evidence: "El usuario declaró que no tiene página web.", source: "declared" as const }] : []),
    ...(business.webUrl ? [{ field: "webObservedOrDeclared", value: business.webUrl, evidence: business.webUrl, source: noWebDeclared ? "observed" as const : "declared" as const }] : []),
    ...(business.instagramHandle ? [{ field: "instagram", value: business.instagramHandle, evidence: business.instagramHandle, source: "declared" as const }] : noInstagramDeclared ? [{ field: "instagram", value: "absent", evidence: "El usuario declaró que no tiene Instagram.", source: "declared" as const }] : []),
  ];

  const normalizedContext = contextText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const productSignal = /producto|tienda|e.?commerce|compr|venta|catalogo|envio/.test(normalizedContext);
  const serviceSignal = /servicio|turno|consulta|reserva|reunion|tratamiento|clase|atencion|profesional/.test(normalizedContext);
  const offeringType: BusinessProfile["offeringType"] = productSignal && serviceSignal ? "both" : productSignal ? "product" : serviceSignal ? "service" : "unknown";
  const requiresAppointmentOrReservation = ["appointments", "reservations"].includes(playbook.model) || /turno|reserv|cita|reunion/.test(normalizedContext);
  const purchasePattern: BusinessProfile["purchasePattern"] = playbook.recurrence === "membership" ? "continuous" : ["frequent", "periodic"].includes(playbook.recurrence) ? "repeated" : playbook.recurrence === "occasional" ? "single" : "unknown";
  const primaryChannel = (["web", "instagram", "search", "reviews"] as SourceType[]).find((source) => activeChannels.includes(source)) || activeChannels[0] || null;
  const decisionFactors = {
    trust: playbook.model === "professional" || playbook.model === "appointments" ? 1 : .75,
    price: playbook.model === "commerce" || playbook.model === "reservations" ? .9 : .65,
    reviews: localDependency === "high" || ["appointments", "reservations"].includes(playbook.model) ? .95 : .65,
    proximity: localDependency === "high" ? 1 : operatingModeValue(hasPhysical, hasOnline) === "mixed" ? .65 : .25,
  };
  inferenceTrace.push(
    { field: "offeringType", value: offeringType, evidence: contextText, source: "inferred" },
    { field: "operatingMode", value: operatingModeValue(hasPhysical, hasOnline), evidence: [business.ubicacion, business.webUrl, business.instagramHandle, contextText].filter(Boolean).join(" · "), source: "inferred" },
    { field: "requiresAppointmentOrReservation", value: String(requiresAppointmentOrReservation), evidence: `${playbook.model} · ${contextText}`, source: "inferred" },
    { field: "purchasePattern", value: purchasePattern, evidence: `Recurrencia inferida: ${playbook.recurrence}`, source: "inferred" },
    { field: "primaryChannel", value: primaryChannel || "unknown", evidence: activeChannels.join(", ") || "Sin canales evaluados", source: "inferred" },
  );

  const processingIssues: CommercialProcessingIssue[] = Object.values(aggregated.sources || {}).flatMap((source) => {
    const raw = source?.metadata?.processingIssues;
    return Array.isArray(raw) ? raw.filter((item): item is CommercialProcessingIssue => Boolean(item && typeof item === "object" && "stage" in item && "errorType" in item && "message" in item)) : [];
  });
  const profile = {
    businessId: business.id,
    businessName: business.nombre,
    originalIndustry: business.rubro,
    inferredCategory: playbook.inferredCategory,
    commercialModel: playbook.model,
    operatingMode: hasPhysical && hasOnline ? "mixed" : hasPhysical ? "physical" : hasOnline ? "online" : "unknown",
    localDependency,
    location: business.ubicacion || business.ciudad || null,
    customerType: business.tipoCliente || null,
    offerings: [business.productosServicios, business.descripcion].filter((value): value is string => Boolean(value?.trim())),
    offeringType,
    audienceSignals,
    primaryCustomerAction: goalAction.action,
    primaryResult: goalAction.result,
    recurrence: playbook.recurrence,
    requiresAppointmentOrReservation,
    purchasePattern,
    geographicArea: business.ubicacion || business.ciudad || null,
    activeChannels: Array.from(new Set(activeChannels)),
    primaryChannel,
    unavailableChannels: Object.entries(aggregated.sources).filter(([, evidence]) => evidence.status !== "evaluated").map(([source]) => source as SourceType),
    channelDeclarations: {
      web: noWebDeclared ? "absent" : business.webUrl ? "present" : "unknown",
      instagram: noInstagramDeclared ? "absent" : business.instagramHandle ? "present" : "unknown",
    },
    contactMethods: Array.from(new Set(contactMethods)),
    trustSignals: Array.from(new Set(trustSignals)),
    declaredSignals,
    strengths: contextualFindings.filter((finding) => finding.type === "strength"),
    problems: contextualFindings.filter((finding) => finding.type === "problem"),
    contextualFindings,
    competitorsDetected: competitors?.totalValidated || 0,
    goal: { text: interpretedGoal.goalOriginalText, goalOriginalText: interpretedGoal.goalOriginalText, interpretation: interpretedGoal, magnitude: goal.magnitud ?? null, timeframeDays: goal.plazoDias ?? null, timeframeLabel: goal.plazoLabel || null },
    resources: { monthlyBudget: business.inversionMarketing ?? null, executionCapacity: business.empleados || business.tamano || null },
    additionalInformation: business.otrosCanales || null,
    decisionFactors,
    areaRelevance,
    inferenceTrace,
    commercialEvidence: [] as CommercialEvidence[],
    commercialJourney: null as unknown as CommercialJourney,
    problemCandidates: [] as ProblemCandidate[],
    strengthCandidates: [] as StrengthCandidate[],
    evidenceConflicts: [] as EvidenceConflict[],
    processingIssues,
  } satisfies BusinessProfile;
  const qualityResult = EvidenceCorroborationEngine.enrich(buildCommercialEvidence({ business, aggregated, inferences: inferenceTrace }, processingIssues));
  profile.commercialEvidence = qualityResult.evidence;
  profile.evidenceConflicts = qualityResult.conflicts;
  try {
    profile.commercialJourney = CommercialJourneyEngine.build(profile, profile.commercialEvidence);
  } catch (error) {
    processingIssues.push({ stage: "commercial_journey", errorType: error instanceof Error ? error.name : "JourneyError", message: error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180) });
    profile.commercialJourney = CommercialJourneyEngine.empty(profile);
  }
  profile.problemCandidates = buildProblemCandidates(profile, profile.commercialJourney, profile.commercialEvidence, processingIssues);
  profile.strengthCandidates = buildStrengthCandidates(profile, profile.commercialJourney, profile.commercialEvidence, processingIssues);
  return profile;
}

function operatingModeValue(hasPhysical: boolean, hasOnline: boolean): BusinessProfile["operatingMode"] {
  return hasPhysical && hasOnline ? "mixed" : hasPhysical ? "physical" : hasOnline ? "online" : "unknown";
}
