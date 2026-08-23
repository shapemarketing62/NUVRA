import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { calculateNuvraScore } from "@/services/scoring/nuvra-score";
import { runDiagnosticEngine } from "@/services/diagnostic/diagnostic-engine";
import { runStrategyEngine } from "@/services/strategy/strategy-engine";
import { generateClarificationQuestions } from "@/services/clarification/clarification-engine";
import { selectStrategicFrameworks } from "@/services/frameworks/strategic-framework-engine";
import { classifySiteType } from "@/services/scoring/site-type-classifier";
import { BusinessIntelligenceLayer } from "@/services/intelligence/business-intelligence-layer";
import { BusinessDiscoveryService, type DiscoveryResult } from "@/services/discovery/business-discovery-service";
import { executeSource } from "@/services/intelligence/source-execution";
import { buildAnalysisTrace } from "@/services/intelligence/analysis-trace";
import { normalizeUrl } from "@/lib/utils";
import { REBUILD_TIMESTAMP } from "@/lib/rebuild-trigger";
import { currentLogContext } from "@/lib/server/logger";
import { inferCustomerType } from "@/lib/business-context";

// Force recompilation with timestamp: REBUILD_TIMESTAMP

export interface RunAnalysisResult {
  success: boolean;
  businessId: string;
  analysisId?: string;
  scoreTotal?: number;
  error?: string;
  analysisStatus?: "completed" | "partial";
  internalFailure?: {
    failedAt: string;
    errorType: string;
    message: string;
    timestamp: string;
    relevantStack?: string;
  };
}

const SECRET_PATTERN = /(api[_-]?key|access[_-]?token|token|authorization|password|secret)\s*[:=]\s*[^\s,;]+/gi;
const safeInternalText = (value: unknown, max = 500) => String(value ?? "unknown_error").replace(SECRET_PATTERN, "$1=[redacted]").slice(0, max);

const stageLog = (stage: string, payload: Record<string, unknown> | string, meta?: { startedAt?: number; endedAt?: number; durationMs?: number; error?: unknown; id?: string }) => {
  const base: Record<string, unknown> = { ...currentLogContext(), stage, payload };
  if (meta?.startedAt !== undefined) base.startedAt = meta.startedAt;
  if (meta?.endedAt !== undefined) base.endedAt = meta.endedAt;
  if (meta?.durationMs !== undefined) base.durationMs = meta.durationMs;
  if (meta?.error !== undefined) base.error = meta.error;
  if (meta?.id !== undefined) base.id = meta.id;
  console.log("[ANALYSIS_STAGE]", JSON.stringify(base));
};

// Helper para derivar confidence cuando falta
function deriveFindingConfidence(finding: any): "ALTA" | "MEDIA" | "BAJA" {
  if (finding.severity === "high" && (finding.source === "html" || finding.source === "playwright")) {
    return "ALTA";
  }
  if (finding.type === "info" || finding.type === "strength") {
    return "MEDIA";
  }
  if (finding.severity === "medium") {
    return "MEDIA";
  }
  return "BAJA";
}

export async function runFullAnalysis(businessId: string, options: { signal?: AbortSignal } = {}): Promise<RunAnalysisResult> {
  const startedAt = Date.now();
  let currentStage = "load_business";
  stageLog("1_inicio", { businessId, startedAt });
  
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      goals: { where: { isActive: true }, orderBy: { createdAt: "desc" }, take: 1 },
      websites: { orderBy: { createdAt: "desc" }, take: 1 },
      instagramConnection: true,
    },
  });

  if (!business) {
    const error = "Negocio no encontrado";
    stageLog("1_inicio", { businessId, error }, { startedAt, endedAt: Date.now(), durationMs: Date.now() - startedAt, error });
    console.error("[ANALYSIS] Business not found:", businessId);
    return { success: false, businessId, error };
  }

  const goal = business.goals[0];
  if (!goal) {
    const error = "Objetivo no definido";
    stageLog("1_inicio", { error }, { startedAt, endedAt: Date.now(), durationMs: Date.now() - startedAt, error });
    console.error("[ANALYSIS] No active goal found for business:", businessId);
    return { success: false, businessId, error };
  }

  // 1.5 Ejecutar BusinessDiscoveryService para fuentes públicas automáticas
  currentStage = "discovery";
  const discoveryStarted = Date.now();
  const discoveryService = new BusinessDiscoveryService();
  const inferredCustomerType = business.tipoCliente || inferCustomerType(business);
  const discoveryTarget = {
    name: business.nombre,
    category: business.rubro,
    location: business.ubicacion || undefined,
    tipoCliente: inferredCustomerType,
    declaredWebUrl: business.webUrl || business.websites[0]?.url || undefined,
    declaredInstagram: business.instagramHandle || undefined,
  };
  const discoveryExecution = await executeSource({
    source: "discovery",
    operation: (signal) => discoveryService.discover(discoveryTarget, { signal }),
    policy: { timeoutMs: 15_000, retries: 1, backoffMs: 300 },
    signal: options.signal,
  });
  const discoveryResult = discoveryExecution.value || emptyDiscoveryResult(discoveryTarget);

  stageLog("1_5_discovery", {
    businessId,
    confirmedCount: discoveryResult.confirmedSources.length,
    probableCount: discoveryResult.probableSources.length,
    uncertainCount: discoveryResult.uncertainSources.length,
    rejectedCount: discoveryResult.rejectedSources.length,
    primaryWebUrl: discoveryResult.primaryWebUrl,
    primaryInstagram: discoveryResult.primaryInstagram,
    primaryGoogleMaps: discoveryResult.primaryGoogleMaps,
    execution: discoveryExecution.audit,
  }, { startedAt: discoveryStarted, endedAt: Date.now(), durationMs: Date.now() - discoveryStarted });

  const rawWebUrl = business.webUrl || business.websites[0]?.url || discoveryResult.primaryWebUrl;
  stageLog("1_inicio", { businessId, nombre: business.nombre, webUrl: rawWebUrl, objetivo: goal.objetivo, plazoDias: goal.plazoDias }, { startedAt, endedAt: Date.now(), durationMs: Date.now() - startedAt });

  currentStage = "website_normalize";
  let normalizedUrl: string | null = null;
  if (rawWebUrl) {
    try {
      const normalizeStarted = Date.now();
      normalizedUrl = normalizeUrl(rawWebUrl);
      stageLog("2_website_normalize", { rawWebUrl, normalizedUrl }, { startedAt: normalizeStarted, endedAt: Date.now(), durationMs: Date.now() - normalizeStarted });
      console.log("[ANALYSIS] Normalized URL:", normalizedUrl);
    } catch (e) {
      console.warn("[ANALYSIS] URL normalization failed for:", rawWebUrl, e);
      normalizedUrl = null;
    }
  } else {
    console.log("[ANALYSIS] No website URL declared or discovered; continuing with non-web public sources.");
  }

  currentStage = "website_persist";
  let website = business.websites[0];
  if (!website && normalizedUrl) {
    const createStarted = Date.now();
    console.log("[ANALYSIS] Creating website record from discovery/input");
    website = await prisma.website.create({
      data: { businessId, url: normalizedUrl },
    });
    stageLog("2_website_persist", { businessId, normalizedUrl, websiteId: website.id }, { startedAt: createStarted, endedAt: Date.now(), durationMs: Date.now() - createStarted, id: website.id });
  }

  const websiteId = website?.id;
  const createWebsiteAnalysisStarted = Date.now();
  const websiteAnalysis = websiteId ? await prisma.websiteAnalysis.create({ data: { websiteId, status: "running" } }) : null;
  stageLog("2_website_analysis_create", { websiteId: websiteId || null, status: websiteAnalysis ? "running" : "not_applicable" }, { startedAt: createWebsiteAnalysisStarted, endedAt: Date.now(), durationMs: Date.now() - createWebsiteAnalysisStarted, id: websiteAnalysis?.id });

  let analysisResult = {
    status: "completed",
    pagesAnalyzed: 0,
    findings: [] as any[],
    screenshots: [],
    performanceSummary: {},
    errorMessage: undefined as string | undefined,
  };

  try {
    // La capa de inteligencia es la única que ejecuta las fuentes. Antes la web
    // se rastreaba aquí y volvía a rastrearse dentro de BusinessIntelligenceLayer.
    currentStage = "business_intelligence";
    const biLayerStarted = Date.now();
    const biLayer = new BusinessIntelligenceLayer();
    const biResult = await biLayer.analyze(business, discoveryResult, { signal: options.signal });
    const webEvidence = biResult.aggregatedEvidence.sources.web;
    if (webEvidence?.data && typeof webEvidence.data === "object") {
      const webResult = webEvidence.data as typeof analysisResult & { screenshots?: unknown[]; performanceSummary?: Record<string, unknown> };
      analysisResult = {
        status: webResult.status,
        pagesAnalyzed: webResult.pagesAnalyzed,
        findings: webResult.findings,
        screenshots: (webResult.screenshots || []) as any,
        performanceSummary: (webResult.performanceSummary || {}) as any,
        errorMessage: webResult.errorMessage,
      };
    } else if (webEvidence?.status === "unavailable") {
      analysisResult.status = "failed";
      analysisResult.errorMessage = String(webEvidence.metadata?.reason || "No pudimos analizar el sitio web.");
    }
    stageLog("3_website_analyzer", { normalizedUrl, pagesAnalyzed: analysisResult.pagesAnalyzed, findingsCount: analysisResult.findings.length, status: webEvidence?.status || "not_relevant", execution: webEvidence?.metadata?.execution, failure: webEvidence?.metadata?.failure }, { startedAt: biLayerStarted, endedAt: Date.now(), durationMs: Date.now() - biLayerStarted, id: websiteAnalysis?.id });
    stageLog("5_bi_layer", {
      digitalScore: biResult.digitalScore.total,
      nuvraScore: biResult.nuvraScore.total,
      coverage: biResult.coverage.total,
      canCalculateNuvraScore: biResult.coverage.canCalculateNuvraScore,
      nuvraScoreReason: biResult.nuvraScore.reason,
    }, { startedAt: biLayerStarted, endedAt: Date.now(), durationMs: Date.now() - biLayerStarted });

    currentStage = "website_analysis_persist";
    const updateWebsiteAnalysisStarted = Date.now();
    if (websiteAnalysis) await prisma.websiteAnalysis.update({
      where: { id: websiteAnalysis.id },
      data: {
        status: analysisResult.status,
        pagesAnalyzed: analysisResult.pagesAnalyzed,
        rawData: JSON.stringify(analysisResult),
        screenshots: JSON.stringify(analysisResult.screenshots),
        performanceData: JSON.stringify(analysisResult.performanceSummary),
        errorMessage: analysisResult.errorMessage,
        completedAt: new Date(),
      },
    });
    stageLog("3_website_analyzer_persist", { websiteAnalysisId: websiteAnalysis?.id || null, status: analysisResult.status, pagesAnalyzed: analysisResult.pagesAnalyzed }, { startedAt: updateWebsiteAnalysisStarted, endedAt: Date.now(), durationMs: Date.now() - updateWebsiteAnalysisStarted, id: websiteAnalysis?.id });

    // Si falló el análisis web pero tenemos un sitio web explícito, registrar advertencia pero continuar si hay otras fuentes
    if (normalizedUrl && (analysisResult.status === "failed" || analysisResult.pagesAnalyzed === 0)) {
      console.warn("[ANALYSIS] Website analysis had errors, continuing with remaining sources:", analysisResult.errorMessage);
    }

    currentStage = "findings_persist";
    const findingsPersistStarted = Date.now();
    console.log("[ANALYSIS] Saving findings to database:", analysisResult.findings.length);
    const findingIds: string[] = [];
    for (const finding of analysisResult.findings) {
      const created = await prisma.finding.create({
        data: {
          websiteAnalysisId: websiteAnalysis?.id,
          type: finding.type,
          category: finding.category,
          severity: finding.severity,
          title: finding.title,
          description: finding.description,
          evidence: finding.evidence,
          pageUrl: finding.pageUrl,
          source: finding.source,
          confidence: finding.confidence || deriveFindingConfidence(finding),
          impact: finding.impact,
        },
      });
      findingIds.push(created.id);
    }
    stageLog("4_findings_persist", { websiteAnalysisId: websiteAnalysis?.id || null, findingsCount: analysisResult.findings.length, firstFindingId: findingIds[0], lastFindingId: findingIds[findingIds.length - 1] }, { startedAt: findingsPersistStarted, endedAt: Date.now(), durationMs: Date.now() - findingsPersistStarted, id: websiteAnalysis?.id });

    console.log("[ANALYSIS] Business Intelligence completed:", {
      digitalScore: biResult.digitalScore.total,
      nuvraScore: biResult.nuvraScore.total,
      coverage: biResult.coverage.total,
    });

    // Usar findings del BI layer para compatibilidad
    const legacyFindings = biLayer.getLegacyFindings(biResult);
    const methodologicalWeights = biResult.nuvraScore.methodology.dimensionWeights;
    const scoreResult = {
      total: biResult.nuvraScore.total,
      dimensions: biLayer.getLegacyDimensions(biResult),
      weights: {
        presencia: methodologicalWeights.presencia?.combinedWeight ?? 0,
        conversion: methodologicalWeights.conversion?.combinedWeight ?? 0,
        posicionamiento: methodologicalWeights.posicionamiento?.combinedWeight ?? 0,
        propuesta: methodologicalWeights.propuesta?.combinedWeight ?? 0,
        redes: methodologicalWeights.redes?.combinedWeight ?? 0,
        adquisicion: methodologicalWeights.adquisicion?.combinedWeight ?? 0,
        identidad: methodologicalWeights.identidad?.combinedWeight ?? 0,
      },
      allFindings: legacyFindings,
      coverage: biResult.coverage.total,
    };
    const hasInstagram = business.instagramConnection?.status === "connected";
    console.log("[ANALYSIS] Nuvra Score calculated:", scoreResult.total);

    currentStage = "score_persist";
    const scoreId = randomUUID();
    const scorePersistStarted = Date.now();
    await prisma.$executeRaw`
      INSERT INTO "NuvraScore" ("id", "businessId", "total", "objetivo", "plazoDias", "weights", "createdAt")
      VALUES (${scoreId}, ${businessId}, ${scoreResult.total ?? null}, ${goal.objetivo}, ${goal.plazoDias}, ${JSON.stringify(scoreResult.weights)}, ${new Date()})
    `;
    stageLog("6_score_persist", { businessId, scoreId, total: scoreResult.total, objective: goal.objetivo, plazoDias: goal.plazoDias }, { startedAt: scorePersistStarted, endedAt: Date.now(), durationMs: Date.now() - scorePersistStarted, id: scoreId });

    for (const dim of scoreResult.dimensions) {
      const scoreDimId = randomUUID();
      const dimPersistStarted = Date.now();
      const persistPoints = dim.points ?? -1;
      await prisma.$executeRaw`
        INSERT INTO "ScoreDimension" ("id", "scoreId", "name", "slug", "points", "weight", "criteria", "strengths", "problems", "source", "confidence")
        VALUES (${scoreDimId}, ${scoreId}, ${dim.name}, ${dim.slug}, ${persistPoints}, ${dim.weight}, ${JSON.stringify(dim.criteria)}, ${JSON.stringify(dim.strengths)}, ${JSON.stringify(dim.problems)}, ${dim.source}, ${dim.confidence})
      `;
      stageLog("6_score_dimensions_persist", { scoreId, dimensionId: scoreDimId, name: dim.name, slug: dim.slug, points: dim.points, persistedPoints: persistPoints, confidence: dim.confidence, legacyDbNote: "SQLite legacy schema requires NOT NULL; -1 means 'No evaluado' explicitly." }, { startedAt: dimPersistStarted, endedAt: Date.now(), durationMs: Date.now() - dimPersistStarted, id: scoreDimId });

      for (const f of dim.findings) {
        // Asegurar que siempre haya confidence
        const confidence = f.confidence || deriveFindingConfidence(f);
        
        await prisma.finding.create({
          data: {
            dimensionId: scoreDimId,
            type: f.type,
            category: f.category,
            severity: f.severity,
            title: f.title,
            description: f.description,
            evidence: f.evidence,
            pageUrl: f.pageUrl,
            source: f.source,
            confidence,
            impact: f.impact,
          },
        });
      }
    }

    const businessContext = {
      nombre: business.nombre,
      rubro: business.rubro,
      objetivo: goal.objetivo,
      plazoDias: goal.plazoDias,
      plazoLabel: goal.plazoLabel,
      descripcion: business.descripcion,
      publicoObjetivo: business.publicoObjetivo,
      businessProfile: biResult.businessProfile,
    };

    currentStage = "diagnostic";
    const diagnosisStarted = Date.now();
    const diagnosisResult = await runDiagnosticEngine(
      businessContext,
      scoreResult,
      legacyFindings,
      biResult.businessProfile
    );
    stageLog("7_diagnostic_engine", { businessId, total: scoreResult.total, coverage: scoreResult.coverage, summary: diagnosisResult.summary, bottleneck: diagnosisResult.bottleneck, priorities: diagnosisResult.priorities }, { startedAt: diagnosisStarted, endedAt: Date.now(), durationMs: Date.now() - diagnosisStarted });

    currentStage = "diagnosis_persist";
    const diagnosisPersistStarted = Date.now();
    const diagnosis = await prisma.diagnosis.create({
      data: {
        businessId,
        summary: diagnosisResult.summary,
        bottleneck: JSON.stringify(diagnosisResult.bottleneck),
        strengths: JSON.stringify(diagnosisResult.strengths),
        weaknesses: JSON.stringify(diagnosisResult.weaknesses),
        opportunities: JSON.stringify(diagnosisResult.opportunities),
        risks: JSON.stringify(diagnosisResult.risks),
        priorities: JSON.stringify(diagnosisResult.priorities),
        engineType: diagnosisResult.engineType,
      },
    });
    stageLog("8_diagnosis_persist", { businessId, diagnosisId: diagnosis.id, summary: diagnosis.summary, engineType: diagnosisResult.engineType }, { startedAt: diagnosisPersistStarted, endedAt: Date.now(), durationMs: Date.now() - diagnosisPersistStarted, id: diagnosis.id });

    const siteTypeResult = classifySiteType({
      businessName: business.nombre,
      rubro: business.rubro,
      goal: goal.objetivo,
      findings: analysisResult.findings,
      url: normalizedUrl || undefined,
    });
    stageLog("8_0_site_type", { businessId, siteType: siteTypeResult.siteType, confidence: siteTypeResult.confidence, evidence: siteTypeResult.evidence }, { startedAt: Date.now(), endedAt: Date.now(), durationMs: 0 });

    const clarificationQuestions = generateClarificationQuestions(
      scoreResult.dimensions,
      analysisResult.findings,
      {
        objetivo: goal.objetivo,
        rubro: business.rubro,
        hasInstagram: business.instagramConnection?.status === "connected",
      }
    );
    const clarificationStarted = Date.now();
    for (const question of clarificationQuestions.questions.slice(0, 5)) {
      try {
        await (prisma as any).$executeRaw`
          INSERT INTO "ClarificationQuestion" ("id", "businessId", "analysisId", "question", "reason", "affects", "dimension", "impact", "createdAt")
          VALUES (${randomUUID()}, ${businessId}, ${websiteAnalysis?.id || null}, ${question.question}, ${question.reason}, ${question.dimension}, ${question.dimension}, ${question.impact}, ${new Date()})
        `;
      } catch (e) {
        console.warn("[ANALYSIS] Warning: ClarificationQuestion insertion failed, continuing:", e instanceof Error ? e.message : String(e));
      }
    }
    stageLog("8_1_clarification", { businessId, siteType: siteTypeResult.siteType, questionCount: clarificationQuestions.questions.length, questions: clarificationQuestions.questions }, { startedAt: clarificationStarted, endedAt: Date.now(), durationMs: Date.now() - clarificationStarted, id: diagnosis.id });

    // Seleccionar frameworks estratégicos
    const frameworksStarted = Date.now();
    const frameworkSelection = selectStrategicFrameworks({
      objetivo: goal.objetivo,
      bottleneck: diagnosisResult.bottleneck?.title,
      dimensionProblems: scoreResult.dimensions.filter(d => d.points !== null && d.points < 50).map(d => d.slug),
      score: scoreResult.total,
      hasWeb: true,
      hasInstagram: business.instagramConnection?.status === "connected",
    });
    stageLog("8_2_frameworks", { businessId, primary: frameworkSelection.primary, secondary: frameworkSelection.secondary, rationale: frameworkSelection.rationale }, { startedAt: frameworksStarted, endedAt: Date.now(), durationMs: Date.now() - frameworksStarted });

    const strategyContext = {
      nombre: business.nombre,
      rubro: business.rubro,
      objetivo: goal.objetivo,
      plazoDias: goal.plazoDias,
      plazoLabel: goal.plazoLabel,
      magnitud: goal.magnitud,
      ubicacion: business.ubicacion || business.ciudad,
      tipoCliente: inferredCustomerType,
      presupuesto: business.inversionMarketing,
      capacidad: business.empleados || business.tamano,
      canales: [business.canales, business.otrosCanales].filter(Boolean).join(" ") || null,
      descripcion: business.descripcion,
      informacionComplementaria: business.otrosCanales,
      businessProfile: biResult.businessProfile,
    };
    currentStage = "strategy";
    const strategyResult = await runStrategyEngine(
      strategyContext,
      diagnosisResult,
      scoreResult,
      legacyFindings,
      biResult.businessProfile
    );
    stageLog("9_strategy_engine", { businessId, objective: strategyContext.objetivo, plazoDias: strategyContext.plazoDias, total: scoreResult.total, frameworks: strategyResult.frameworks, priorities: strategyResult.prioridades, principalProblema: strategyResult.principalProblema, siteType: siteTypeResult.siteType }, { startedAt: frameworksStarted, endedAt: Date.now(), durationMs: Date.now() - frameworksStarted });

    currentStage = "strategy_persist";
    const strategyPersistStarted = Date.now();
    const strategyId = randomUUID();
    try {
      await (prisma as any).$executeRaw`
        INSERT INTO "Strategy" ("id", "businessId", "diagnosisId", "objetivo", "situacionActual", "distanciaObjetivo", "principalProblema", "prioridades", "frameworks", "frameworksRationale", "engineType", "createdAt")
        VALUES (${strategyId}, ${businessId}, ${diagnosis.id}, ${strategyResult.objetivo}, ${strategyResult.situacionActual}, ${strategyResult.distanciaObjetivo}, ${strategyResult.principalProblema}, ${JSON.stringify(strategyResult.prioridades)}, ${JSON.stringify(strategyResult.frameworks || [])}, ${strategyResult.frameworks?.length ? `Se seleccionaron ${strategyResult.frameworks.length} marcos para resolver el problema estratégico y priorizar acciones.` : "No se seleccionaron frameworks relevantes."}, ${strategyResult.engineType}, ${new Date()})
      `;
    } catch (e) {
      console.error("[ANALYSIS] Error persisting strategy:", e instanceof Error ? e.message : String(e));
      throw e;
    }
    stageLog("10_strategy_persist", { businessId, strategyId, objective: strategyResult.objetivo, principalProblema: strategyResult.principalProblema, actionsCount: strategyResult.actions.length, frameworksCount: strategyResult.frameworks?.length ?? 0 }, { startedAt: strategyPersistStarted, endedAt: Date.now(), durationMs: Date.now() - strategyPersistStarted, id: strategyId });

    const actionsPersistStarted = Date.now();
    const actionIds: string[] = [];
    for (const action of strategyResult.actions) {
      const actionId = randomUUID();
      try {
        await (prisma as any).$executeRaw`
          INSERT INTO "StrategicAction" ("id", "strategyId", "title", "description", "order", "impact", "difficulty", "estimatedTime", "dependencies", "indicatorToImprove", "rationale", "relatedFindingIds", "findingIds", "evidence", "inference", "dimension", "framework", "confidence", "problem", "unlocksContent", "done")
          VALUES (${actionId}, ${strategyId}, ${action.title}, ${action.description || null}, ${action.order}, ${action.impact}, ${action.difficulty}, ${action.estimatedTime}, ${JSON.stringify(action.dependencies) || null}, ${action.indicatorToImprove}, ${action.rationale}, ${JSON.stringify(action.relatedFindingIds || []) || null}, ${JSON.stringify(action.findingIds || []) || null}, ${action.evidence || null}, ${action.inference || null}, ${action.dimension || null}, ${action.framework || null}, ${action.confidence || null}, ${action.problem || null}, ${action.unlocksContent || false}, false)
        `;
        actionIds.push(actionId);
      } catch (e) {
        console.warn("[ANALYSIS] Warning: StrategicAction insertion failed, continuing:", e instanceof Error ? e.message : String(e));
      }
    }
    stageLog("10_strategy_actions_persist", { strategyId, actionCount: actionIds.length, firstActionId: actionIds[0], lastActionId: actionIds[actionIds.length - 1] }, { startedAt: actionsPersistStarted, endedAt: Date.now(), durationMs: Date.now() - actionsPersistStarted, id: strategyId });

    currentStage = "analysis_trace";
    const historyStarted = Date.now();
    const historyId = randomUUID();
    let analysisTrace: ReturnType<typeof buildAnalysisTrace> | { version: "commercial-journey-v1"; createdAt: string; failedAt: "analysis_trace"; processingIssues: unknown[] };
    try {
      analysisTrace = buildAnalysisTrace({ discovery: discoveryResult, aggregated: biResult.aggregatedEvidence, profile: biResult.businessProfile, diagnosis: diagnosisResult, strategy: strategyResult, score: biResult.nuvraScore });
    } catch (error) {
      const issue = { stage: "analysis_trace" as const, errorType: error instanceof Error ? error.name : "AnalysisTraceError", message: safeInternalText(error instanceof Error ? error.message : error, 180) };
      biResult.businessProfile.processingIssues.push(issue);
      analysisTrace = { version: "commercial-journey-v1", createdAt: new Date().toISOString(), failedAt: "analysis_trace", processingIssues: biResult.businessProfile.processingIssues };
    }
    currentStage = "history_persist";
    try {
      await (prisma as any).$executeRaw`
        INSERT INTO "AnalysisHistory" ("id", "businessId", "scoreId", "diagnosisId", "strategyId", "websiteAnalysisId", "nuvraScoreTotal", "snapshot", "createdAt")
        VALUES (${historyId}, ${businessId}, ${scoreId}, ${diagnosis.id}, ${strategyId}, ${websiteAnalysis?.id || null}, ${scoreResult.total ?? null}, ${JSON.stringify({
          score: scoreResult.total,
          dimensions: biResult.nuvraScore.dimensions.map((d) => ({ slug: d.slug, points: d.points, findings: d.findings.map((finding) => finding.id), scoringSignals: d.scoringSignals || [], weight: biResult.nuvraScore.methodology.dimensionWeights[d.slug] })),
          pagesAnalyzed: analysisResult.pagesAnalyzed,
          intelligence: {
            coverage: biResult.coverage.total,
            sourceStatuses: Object.fromEntries(Object.entries(biResult.aggregatedEvidence.sources).map(([key, value]) => [key, value.status])),
            sourceMessages: Object.fromEntries(Object.entries(biResult.aggregatedEvidence.sources).map(([key, value]) => [key, sourceUserMessage(key, value.status)])),
            discoveredInstagram: discoveryResult.primaryInstagram,
            competitorSummary: biResult.aggregatedEvidence.sources.competitor?.data || null,
            externalMentionsSummary: biResult.aggregatedEvidence.sources.external_mentions?.data || null,
          },
          businessProfile: biResult.businessProfile,
          analysisTrace,
          analysisAudit: {
            discovery: discoveryExecution.audit,
            sources: Object.fromEntries(Object.entries(biResult.aggregatedEvidence.sources).map(([source, evidence]) => [source, {
              status: evidence.status,
              coverage: evidence.coverage,
              confidence: evidence.confidence,
              execution: evidence.metadata?.execution,
              failure: evidence.metadata?.failure,
              survivingEvidenceCount: evidence.findings.length,
              findings: evidence.findings.map((finding) => ({ id: finding.id, evidence: finding.evidence, type: finding.type, category: finding.category, attribution: finding.attribution })),
            }])),
            survivingEvidence: {
              totalFindings: biResult.aggregatedEvidence.findings.length,
              evaluatedSources: biResult.coverage.evaluatedSources,
            },
            inferences: biResult.businessProfile.inferenceTrace,
            contextualFindings: biResult.businessProfile.contextualFindings,
            scoreMethodology: biResult.nuvraScore.methodology,
            selectedProblem: diagnosisResult.bottleneck,
            selectedOpportunities: diagnosisResult.opportunities,
            actionSelection: strategyResult.audit || { candidates: [] },
            finalActions: strategyResult.actions.map((action) => ({ title: action.title, findingIds: action.findingIds, evidence: action.evidence, inference: action.inference, problem: action.problem })),
          },
          engineTypes: {
            diagnosis: diagnosisResult.engineType,
            strategy: strategyResult.engineType,
          },
        })}, ${new Date()})
      `;
    } catch (e) {
      console.warn("[ANALYSIS] Warning: AnalysisHistory insertion failed, continuing:", e instanceof Error ? e.message : String(e));
    }
    stageLog("11_history_snapshot", { businessId, historyId, scoreId, diagnosisId: diagnosis.id, strategyId, websiteAnalysisId: websiteAnalysis?.id || null, score: scoreResult.total }, { startedAt: historyStarted, endedAt: Date.now(), durationMs: Date.now() - historyStarted, id: historyId });

    const finalDurationMs = Date.now() - startedAt;
    stageLog("12_finalizacion", { businessId, websiteAnalysisId: websiteAnalysis?.id || null, scoreId, diagnosisId: diagnosis.id, strategyId, historyId, success: true, finalDurationMs }, { startedAt, endedAt: Date.now(), durationMs: finalDurationMs, id: historyId });

    return {
      success: true,
      businessId,
      analysisId: websiteAnalysis?.id,
      scoreTotal: scoreResult.total ?? undefined,
      analysisStatus: biResult.coverage.evaluatedSources.length > 0 && (biResult.coverage.missingSources.length > 0 || biResult.coverage.requiresAuthSources.length > 0) ? "partial" : "completed",
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const stage = `FAILED_AT:${currentStage}`;
    const internalFailure = {
      failedAt: currentStage,
      errorType: error.name || "Error",
      message: safeInternalText(error.message),
      timestamp: new Date().toISOString(),
      relevantStack: safeInternalText(error.stack, 1_500),
    };
    console.error("[ANALYSIS] Analysis failed:", { businessId, failedAt: currentStage, errorType: internalFailure.errorType });
    stageLog(stage, { businessId, websiteAnalysisId: websiteAnalysis?.id || null, internalFailure }, { startedAt, endedAt: Date.now(), durationMs: Date.now() - startedAt, error: internalFailure.message });
    if (websiteAnalysis) {
      try {
        await prisma.websiteAnalysis.update({
          where: { id: websiteAnalysis.id },
          data: { status: "failed", errorMessage: safeInternalText(error.message), completedAt: new Date() },
        });
      } catch (persistError) {
        stageLog("FAILED_AT:failure_persist", { businessId, originalStage: currentStage, errorType: persistError instanceof Error ? persistError.name : "Error" });
      }
    }
    return {
      success: false,
      businessId,
      error: error.message,
      internalFailure,
    };
  }
}

function emptyDiscoveryResult(target: DiscoveryResult["target"]): DiscoveryResult {
  return {
    target,
    primaryWebUrl: target.declaredWebUrl || null,
    primaryInstagram: target.declaredInstagram || null,
    primaryGoogleMaps: null,
    allCandidates: [],
    confirmedSources: [],
    probableSources: [],
    uncertainSources: [],
    rejectedSources: [],
    discoveredAt: new Date(),
  };
}

function sourceUserMessage(source: string, status: string): string {
  if (status === "evaluated") return "Analizada";
  if (status === "requires_auth") return "Necesita autorización";
  if (status === "not_relevant") return "No necesaria para este negocio";
  if (source === "web") return "No pudimos analizarlo";
  return "No disponible en este momento";
}

function detectSiteType(input: { businessName?: string; rubro?: string; goal?: string; findings?: Array<{ category: string; title: string; evidence: string }>; url?: string }): string {
  const txt = [input.businessName || "", input.rubro || "", input.goal || "", input.url || "", (input.findings || []).map((f) => `${f.title} ${f.evidence}`).join(" ")].join(" ").toLowerCase();

  if (/ecommerce|shop|tienda|cart|checkout|producto|catalog|product/i.test(txt)) return "ecommerce";
  if (/restaurante|cafe|bar|pizza|burger|food|menu|reserv/i.test(txt)) return "restaurante";
  if (/servicio|consult|abogado|clinic|dent|psic|arquitect|agency|studio|profesional/i.test(txt)) return "servicios";
  if (/saas|software|platform|app|dashboard|subscription|crm|b2b/i.test(txt)) return "saas";
  if (/marketplace|market|vendor|proveedor|dealers|multivendor/i.test(txt)) return "marketplace";
  if (/lead generation|leadgen|lead|contacto|formulario|captacion/i.test(txt)) return "lead generation";
  if (/corporativo|empresa|about|nosotros|institucional|brand/i.test(txt)) return "marca corporativa";
  return "otro";
}
