import { calculateNuvraScore } from "../services/scoring/nuvra-score";
import { runDiagnosticEngine } from "../services/diagnostic/diagnostic-engine";
import { runStrategyEngine } from "../services/strategy/strategy-engine";
import { generateClarificationQuestions } from "../services/clarification/clarification-engine";
import { selectStrategicFrameworks } from "../services/frameworks/strategic-framework-engine";
import { classifySiteType } from "../services/scoring/site-type-classifier";
import type { RawFinding } from "../services/website-analyzer/types";

const findings: RawFinding[] = [
  { type: "problem", category: "conversion", severity: "high", title: "CTA principal poco visible", description: "El CTA principal aparece recién después del segundo bloque.", evidence: "No se encontró CTA prominente en el primer viewport.", pageUrl: "https://www.starbucks.com", source: "html", confidence: "alta", impact: "alto" },
  { type: "problem", category: "conversion", severity: "medium", title: "Formulario de contacto ausente", description: "No hay formulario visible para consultas.", evidence: "Solo enlaces a redes y tiendas.", pageUrl: "https://www.starbucks.com", source: "html", confidence: "alta", impact: "medio" },
  { type: "problem", category: "propuesta", severity: "high", title: "H1 genérico", description: "El H1 principal es 'Starbucks' sin diferenciación.", evidence: "H1 = 'Starbucks'.", pageUrl: "https://www.starbucks.com", source: "html", confidence: "alta", impact: "alto" },
  { type: "info", category: "presencia", severity: "low", title: "Mobile responsive", description: "El sitio se adapta a mobile.", evidence: "Viewport meta tag presente.", pageUrl: "https://www.starbucks.com", source: "html", confidence: "alta", impact: "bajo" },
  { type: "problem", category: "adquisicion", severity: "medium", title: "Sin schema markup", description: "Falta structured data para SEO.", evidence: "No se detectó JSON-LD.", pageUrl: "https://www.starbucks.com", source: "html", confidence: "alta", impact: "medio" },
  { type: "problem", category: "redes", severity: "low", title: "Instagram no conectado", description: "No hay vinculación real de Instagram en el análisis.", evidence: "Instagram handle declarado pero sin conexión OAuth.", pageUrl: "https://www.starbucks.com", source: "user_input", confidence: "baja", impact: "bajo" },
];

const context = {
  nombre: "Starbucks",
  rubro: "Cafetería",
  objetivo: "Aumentar ventas",
  plazoDias: 90,
  plazoLabel: "3 meses",
  magnitud: 20,
};

async function main() {
  const siteTypeResult = classifySiteType({
    businessName: context.nombre,
    rubro: context.rubro,
    goal: context.objetivo,
    findings,
    url: "https://www.starbucks.com",
  });

  const scoreResult = calculateNuvraScore(findings, 1, context.objetivo, context.plazoDias, false, true);
  const diagnosis = await runDiagnosticEngine(context, scoreResult, findings);
  const frameworks = selectStrategicFrameworks({
    objetivo: context.objetivo,
    bottleneck: diagnosis.bottleneck.title,
    dimensionProblems: scoreResult.dimensions.filter((d) => d.points !== null && d.points < 50).map((d) => d.slug),
    score: scoreResult.total,
    hasWeb: true,
    hasInstagram: false,
  });
  const strategy = await runStrategyEngine(context, diagnosis, scoreResult, findings);
  const clarification = generateClarificationQuestions(scoreResult.dimensions, findings, { objetivo: context.objetivo, rubro: context.rubro, hasInstagram: false });

  console.log("SITE_TYPE=" + siteTypeResult.siteType);
  console.log("SITE_TYPE_CONFIDENCE=" + siteTypeResult.confidence);
  console.log("SITE_TYPE_EVIDENCE=" + JSON.stringify(siteTypeResult.evidence));
  console.log("SCORE=" + scoreResult.total);
  console.log("COVERAGE=" + scoreResult.coverage);
  console.log("DIMENSIONS=" + JSON.stringify(scoreResult.dimensions.map((d) => ({ slug: d.slug, points: d.points, confidence: d.confidence, criteria: d.criteria }))));
  console.log("NO_EVALUADAS=" + JSON.stringify(scoreResult.dimensions.filter((d) => d.points === null).map((d) => d.slug)));
  console.log("QUESTIONS=" + JSON.stringify(clarification.questions.map((q) => ({ id: q.id, question: q.question, dimension: q.dimension, affects: q.affects }))));
  console.log("FRAMEWORKS_PRIMARY=" + frameworks.primary);
  console.log("FRAMEWORKS_SECONDARY=" + JSON.stringify(frameworks.secondary));
  console.log("FRAMEWORKS_RATIONALE=" + frameworks.rationale);
  console.log("BOTTLENECK=" + JSON.stringify(diagnosis.bottleneck));
  console.log("STRATEGY=" + JSON.stringify({ objetivo: strategy.objetivo, situacionActual: strategy.situacionActual, distanciaObjetivo: strategy.distanciaObjetivo, principalProblema: strategy.principalProblema, prioridades: strategy.prioridades, frameworks: strategy.frameworks }));
  console.log("ACTIONS=" + JSON.stringify((strategy.actions || []).map((a) => ({ title: a.title, rationale: a.rationale, evidence: a.evidence, inference: a.inference, dimension: a.dimension, framework: a.framework, confidence: a.confidence, problem: a.problem, findingIds: a.findingIds, kpi: a.kpi, impact: a.impact, effort: a.effort, timeframe: a.timeframe }))));
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
