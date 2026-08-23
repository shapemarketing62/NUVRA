import type { Business } from "@prisma/client";
import type { AggregatedEvidence } from "./evidence-aggregator.ts";
import type { EvidenceFinding, SourceType } from "./source-analyzer.ts";

export type CommercialEvidenceKind = "ObservedEvidence" | "DeclaredEvidence" | "InferredEvidence";
export type CommercialJourneyStageId = "discovery" | "evaluation" | "decision" | "action" | "experience" | "retention";

export interface CommercialEvidence {
  id: string;
  kind: CommercialEvidenceKind;
  source: SourceType | "onboarding" | "business_profile";
  text: string;
  timestamp: string | null;
  entity: { businessId: string; businessName: string };
  confidence: "ALTA" | "MEDIA" | "BAJA";
  journeyStage: CommercialJourneyStageId;
  possibleImpact: "high" | "medium" | "low";
  polarity: "positive" | "negative" | "neutral";
  allowsClaims: string[];
  disallowsClaims: string[];
  attribution: string;
  originalFindingId?: string;
}

type BusinessInput = Business & { goals?: Array<{ objetivo?: string; plazoDias?: number; plazoLabel?: string; magnitud?: number | null }> };

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function inferJourneyStage(text: string, source: string, category = ""): CommercialJourneyStageId {
  const value = normalize(`${text} ${category}`);
  if (/pocas (reservas|visitas|ventas|consultas)|baja demanda|lunes|martes|miercoles|jueves|temporada baja/.test(value)) return "action";
  if (/retencion|recompra|volver|renov|seguimiento|recordatorio|fidel|post.?venta|clientes actuales|proximo paso|despues de cada/.test(value)) return "retention";
  if (/entrega|recibi|experiencia|atencion|demora|rapidez|calidad del servicio|respuesta del negocio/.test(value)) return "experience";
  if (/whatsapp|boton|cta|formulario|checkout|carrito|reserv|turno|pedir|comprar|llamar|contactar|inscrib/.test(value)) return "action";
  if (/precio|pago|envio|horario|ubicacion|direccion|disponibilidad|cuota|condicion|presupuesto/.test(value)) return "decision";
  if (/resena|opinion|testimonio|confianza|caso|trabajo|producto|servicio|especializ|propuesta|bio/.test(value)) return "evaluation";
  if (["search", "external_mentions", "instagram", "x"].includes(source) || /google|busqueda|encontr|aparece|visibilidad|mencion/.test(value)) return "discovery";
  return "evaluation";
}

function observedClaims(finding: EvidenceFinding): { allows: string[]; disallows: string[] } {
  const stage = inferJourneyStage(finding.evidence, finding.source, finding.category);
  const allows = [`Afirmar que se observó esta señal en ${finding.attribution}.`, `Usar la señal para analizar la etapa ${stage}.`];
  const disallows = ["No permite afirmar resultados comerciales, ventas o reservas que la fuente no informó.", "No permite generalizar esta observación a todos los clientes."];
  if (finding.source === "instagram") disallows.push("No permite inferir alcance, interacción o ventas privadas.");
  if (finding.source === "reviews") disallows.push("No permite atribuir la opinión a toda la clientela ni inventar temas no repetidos.");
  if (finding.source === "search") disallows.push("No permite afirmar una posición estable en Google ni tráfico propio.");
  return { allows, disallows };
}

function observedEvidence(business: BusinessInput, aggregated: AggregatedEvidence): CommercialEvidence[] {
  return aggregated.findings.map((finding) => {
    const claims = observedClaims(finding);
    return {
      id: `observed:${finding.id}`,
      kind: "ObservedEvidence",
      source: finding.source,
      text: finding.evidence,
      timestamp: aggregated.sources[finding.source]?.evaluatedAt?.toISOString?.() || null,
      entity: { businessId: business.id, businessName: business.nombre },
      confidence: finding.confidence,
      journeyStage: inferJourneyStage(finding.evidence, finding.source, finding.category),
      possibleImpact: finding.impact,
      polarity: finding.type,
      allowsClaims: claims.allows,
      disallowsClaims: claims.disallows,
      attribution: finding.attribution,
      originalFindingId: finding.id,
    };
  });
}

function declaredEvidence(business: BusinessInput): CommercialEvidence[] {
  const goal = business.goals?.[0];
  const declarations: Array<{ id: string; text?: string | number | null; stage: CommercialJourneyStageId; impact: "high" | "medium" | "low"; polarity?: "positive" | "negative" | "neutral" }> = [
    { id: "industry", text: business.rubro, stage: "evaluation", impact: "medium" },
    { id: "description", text: business.descripcion, stage: "evaluation", impact: "medium" },
    { id: "offerings", text: business.productosServicios, stage: "evaluation", impact: "high" },
    { id: "audience", text: business.publicoObjetivo || business.tipoCliente, stage: "discovery", impact: "medium" },
    { id: "location", text: business.ubicacion || business.ciudad, stage: "decision", impact: "medium" },
    { id: "channels", text: business.canales, stage: "discovery", impact: "medium" },
    { id: "additional", text: business.otrosCanales, stage: inferJourneyStage(business.otrosCanales || "", "onboarding"), impact: "high", polarity: /pocas (reservas|visitas|ventas|consultas)|demora|queja|sin seguimiento|no (tenemos|hacemos)/i.test(business.otrosCanales || "") ? "negative" : /recomendaci|llega por|funciona|destaca/i.test(business.otrosCanales || "") ? "positive" : "neutral" },
    { id: "capacity", text: business.empleados || business.tamano, stage: "experience", impact: "high" },
    { id: "budget", text: business.inversionMarketing, stage: "action", impact: "medium" },
    { id: "goal", text: goal?.objetivo, stage: /volv|vuelv|recompra|renov|clientes actuales/i.test(goal?.objetivo || "") ? "retention" : "action", impact: "high" },
    { id: "timeframe", text: goal?.plazoLabel, stage: "action", impact: "medium" },
  ];
  return declarations.filter((item) => item.text !== null && item.text !== undefined && String(item.text).trim()).map((item) => ({
    id: `declared:${item.id}`,
    kind: "DeclaredEvidence",
    source: "onboarding",
    text: String(item.text).trim(),
    timestamp: null,
    entity: { businessId: business.id, businessName: business.nombre },
    confidence: "ALTA",
    journeyStage: item.stage,
    possibleImpact: item.impact,
    polarity: item.polarity || "neutral",
    allowsClaims: ["Permite afirmar que el negocio declaró este dato y usarlo como contexto de decisión."],
    disallowsClaims: ["No permite afirmar que el dato fue verificado externamente.", "No debe convertirse por sí solo en una evaluación de desempeño."],
    attribution: "Onboarding del negocio",
  }));
}

export function buildCommercialEvidence(input: {
  business: BusinessInput;
  aggregated: AggregatedEvidence;
  inferences: Array<{ field: string; value: string; evidence: string; source: "declared" | "observed" | "inferred" }>;
}): CommercialEvidence[] {
  const inferred: CommercialEvidence[] = input.inferences.filter((item) => item.source === "inferred").map((item) => ({
    id: `inferred:${item.field}`,
    kind: "InferredEvidence",
    source: "business_profile",
    text: `${item.field}: ${item.value}`,
    timestamp: null,
    entity: { businessId: input.business.id, businessName: input.business.nombre },
    confidence: "MEDIA",
    journeyStage: inferJourneyStage(`${item.field} ${item.value} ${item.evidence}`, "business_profile"),
    possibleImpact: "medium",
    polarity: "neutral",
    allowsClaims: [`Permite usar “${item.value}” como hipótesis de contexto respaldada por: ${item.evidence}.`],
    disallowsClaims: ["No permite presentarlo como un hecho observado.", "Debe revisarse si aparece evidencia que lo contradiga."],
    attribution: item.evidence,
  }));
  return [...observedEvidence(input.business, input.aggregated), ...declaredEvidence(input.business), ...inferred];
}
