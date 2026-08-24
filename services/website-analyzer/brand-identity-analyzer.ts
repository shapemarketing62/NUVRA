import type { BrandIdentityAnalysis, BrandIdentityAspect, BrandIdentitySourceEvidence, PageAnalysisData, RawFinding } from "./types.ts";

const EXPECTED_SOURCES = ["web", "instagram", "tiktok", "google_business_profile", "facebook", "linkedin", "youtube", "x"];
const ALL_ASPECTS: BrandIdentityAspect[] = ["logo", "colors", "typography", "photography", "tone", "crossChannelConsistency", "visualRecognition", "differentiation", "proposalCoherence", "temporalConsistency"];

export class BrandIdentityAnalyzer {
  static analyze(pages: PageAnalysisData[], additionalSources: BrandIdentitySourceEvidence[] = []): BrandIdentityAnalysis {
    const safePages = Array.isArray(pages) ? pages : [];
    const safeAdditional = (Array.isArray(additionalSources) ? additionalSources : []).filter((item) => item?.source && item.aspects);
    if (!safePages.length && !safeAdditional.length) return emptyAnalysis();
    const withLogo = safePages.filter((page) => page.brandSignals.logoReferences.length > 0).length;
    const withColors = safePages.filter((page) => page.brandSignals.colors.length > 0).length;
    const withFonts = safePages.filter((page) => page.brandSignals.fonts.length > 0).length;
    const photos = safePages.reduce((sum, page) => sum + page.brandSignals.imageCount, 0);
    const describedPhotos = safePages.reduce((sum, page) => sum + page.brandSignals.descriptiveImageCount, 0);
    const logoConsistency = sharedRatio(safePages.map((page) => page.brandSignals.logoReferences.map(normalizeAsset)));
    const colorConsistency = sharedRatio(safePages.map((page) => page.brandSignals.colors));
    const fontConsistency = sharedRatio(safePages.map((page) => page.brandSignals.fonts));
    const toneCoverage = safePages.filter((page) => page.brandSignals.toneSamples.length >= 2).length / safePages.length;
    const toneConsistency = vocabularyConsistency(safePages.map((page) => page.brandSignals.toneSamples.join(" ")));
    const webAspects: Partial<Record<BrandIdentityAspect, number>> = {};
    if (withLogo) webAspects.logo = Math.round(35 + logoConsistency * 65);
    if (withColors) webAspects.colors = Math.round(35 + colorConsistency * 65);
    if (withFonts) webAspects.typography = Math.round(35 + fontConsistency * 65);
    if (photos) webAspects.photography = Math.round(45 + Math.min(1, describedPhotos / Math.max(photos, 1)) * 20);
    if (toneCoverage > 0) webAspects.tone = Math.round(35 + (toneCoverage * .35 + toneConsistency * .65) * 65);
    const sourceEvidence: BrandIdentitySourceEvidence[] = [
      ...(safePages.length ? [{
        source: "web",
        aspects: webAspects,
        evidence: [`Se revisaron ${safePages.length} página(s) del sitio.`],
        contradictions: webContradictions(safePages.length, logoConsistency, colorConsistency, fontConsistency),
        observedPeriods: 1,
      }] : []),
      ...safeAdditional,
    ];
    const aspectScores = collectAspectScores(sourceEvidence);
    const evaluatedAspects = Array.from(aspectScores.keys());
    const performanceScore = evaluatedAspects.length
      ? Math.round(evaluatedAspects.reduce((sum, aspect) => sum + average(aspectScores.get(aspect) || []), 0) / evaluatedAspects.length)
      : 50;
    const analyzedSources = Array.from(new Set(sourceEvidence.map((item) => item.source)));
    const contradictionCount = sourceEvidence.reduce((sum, item) => sum + (item.contradictions?.length || 0), 0);
    const observedPeriods = Math.max(0, ...sourceEvidence.map((item) => item.observedPeriods || 1));
    const evidenceConfidence = calculateEvidenceConfidence(analyzedSources.length, evaluatedAspects.length, contradictionCount, observedPeriods);
    const evidenceCeiling = justifiedCeiling({ sourceCount: analyzedSources.length, aspectCount: evaluatedAspects.length, contradictionCount, observedPeriods, evidenceConfidence });
    const score = Math.max(0, Math.min(performanceScore, evidenceCeiling));
    const strengths: string[] = [];
    const problems: string[] = [];
    const evidence: string[] = [];
    if (logoConsistency >= .75) strengths.push("La marca usa una referencia de logo reconocible de forma consistente en el sitio.");
    else if (safePages.length >= 2 && logoConsistency < .4) problems.push("No se pudo confirmar una referencia de logo consistente entre las páginas revisadas.");
    if (colorConsistency >= .6) strengths.push("Los colores principales se repiten de forma consistente entre páginas.");
    else if (withColors >= 2) problems.push("Los colores observados cambian bastante entre páginas.");
    if (fontConsistency >= .6) strengths.push("La tipografía mantiene una línea coherente en las páginas revisadas.");
    else if (withFonts >= 2) problems.push("La tipografía no mantiene una línea clara entre páginas.");
    if (toneCoverage >= .7 && toneConsistency >= .35) strengths.push("Los títulos y descripciones mantienen palabras y temas reconocibles entre páginas.");
    if (safePages.length) evidence.push(`Se revisaron ${safePages.length} página(s), con logo observable en ${withLogo}, colores identificables en ${withColors} y tipografías identificables en ${withFonts}.`);
    if (photos) evidence.push(`Se observaron ${photos} imágenes; ${describedPhotos} tienen una descripción utilizable.`);
    evidence.push(...safeAdditional.flatMap((item) => item.evidence));
    return {
      score,
      performanceScore,
      evidenceConfidence,
      confidence: evidenceConfidence >= .78 ? "ALTA" : evidenceConfidence >= .45 ? "MEDIA" : "BAJA",
      interpretation: interpretationFor(score),
      evidenceCeiling,
      coverage: {
        analyzedSources,
        unknownSources: EXPECTED_SOURCES.filter((source) => !analyzedSources.includes(source)),
        evaluatedAspects,
        independentSourceCount: analyzedSources.length,
        contradictionCount,
        observedPeriods,
      },
      strengths,
      problems,
      evidence,
      limitations: [analyzedSources.length === 1
        ? "La evaluación describe la identidad observada en una sola fuente; no permite afirmar todavía una identidad integral entre canales."
        : "La diferenciación y el reconocimiento visual solo se afirman cuando existen señales específicas y comparables; no se infieren desde métricas privadas."],
    };
  }

  static findings(analysis: BrandIdentityAnalysis, pageUrl: string): RawFinding[] {
    const base = { category: "identidad", pageUrl, source: "html", confidence: analysis.confidence.toLowerCase(), impact: "medio" };
    return [
      ...analysis.strengths.map((evidence) => ({ ...base, type: "strength" as const, severity: "info", title: "Consistencia de marca observada", description: evidence, evidence })),
      ...analysis.problems.map((evidence) => ({ ...base, type: "problem" as const, severity: "medium", title: "Consistencia de marca limitada", description: evidence, evidence })),
    ];
  }
}

function emptyAnalysis(): BrandIdentityAnalysis {
  return {
    score: 50,
    performanceScore: 50,
    evidenceConfidence: 0,
    confidence: "BAJA",
    interpretation: "acceptable",
    evidenceCeiling: 64,
    coverage: { analyzedSources: [], unknownSources: [...EXPECTED_SOURCES], evaluatedAspects: [], independentSourceCount: 0, contradictionCount: 0, observedPeriods: 0 },
    strengths: [],
    problems: [],
    evidence: [],
    limitations: ["No se pudo revisar la identidad del negocio."],
  };
}

function collectAspectScores(sources: BrandIdentitySourceEvidence[]) {
  const result = new Map<BrandIdentityAspect, number[]>();
  for (const source of sources) {
    for (const aspect of ALL_ASPECTS) {
      const score = source.aspects[aspect];
      if (typeof score !== "number" || !Number.isFinite(score)) continue;
      const values = result.get(aspect) || [];
      values.push(Math.max(0, Math.min(100, score)));
      result.set(aspect, values);
    }
  }
  return result;
}

function calculateEvidenceConfidence(sourceCount: number, aspectCount: number, contradictionCount: number, observedPeriods: number) {
  if (!sourceCount || !aspectCount) return 0;
  const sourceBreadth = Math.min(1, sourceCount / 3);
  const aspectBreadth = Math.min(1, aspectCount / ALL_ASPECTS.length);
  const temporalDepth = Math.min(1, observedPeriods / 3);
  const contradictionClarity = Math.max(.35, 1 - contradictionCount * .12);
  return round(sourceBreadth * .3 + aspectBreadth * .35 + temporalDepth * .15 + contradictionClarity * .2);
}

function justifiedCeiling(input: { sourceCount: number; aspectCount: number; contradictionCount: number; observedPeriods: number; evidenceConfidence: number }) {
  if (!input.sourceCount) return 64;
  if (input.sourceCount >= 4 && input.aspectCount >= 9 && input.observedPeriods >= 2 && input.evidenceConfidence >= .88 && input.contradictionCount === 0) return 100;
  if (input.sourceCount >= 3 && input.aspectCount >= 8 && input.evidenceConfidence >= .72 && input.contradictionCount <= 1) return 89;
  if (input.sourceCount >= 2 && input.aspectCount >= 6 && input.evidenceConfidence >= .55 && input.contradictionCount <= 2) return 79;
  return 69;
}

function interpretationFor(score: number): BrandIdentityAnalysis["interpretation"] {
  if (score >= 90) return "exceptional";
  if (score >= 80) return "very_good";
  if (score >= 65) return "good";
  if (score >= 50) return "acceptable";
  if (score >= 30) return "weak";
  return "serious_or_unproven";
}

function webContradictions(pageCount: number, logo: number, colors: number, fonts: number) {
  const result: string[] = [];
  if (pageCount >= 2 && logo < .4) result.push("El logo no se mantiene de manera consistente entre páginas.");
  if (pageCount >= 2 && colors < .4) result.push("Los colores cambian de manera importante entre páginas.");
  if (pageCount >= 2 && fonts < .4) result.push("Las tipografías cambian de manera importante entre páginas.");
  return result;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeAsset(value: string) {
  return value.toLowerCase().replace(/^https?:\/\/[^/]+/i, "").replace(/[?#].*$/, "");
}

function vocabularyConsistency(texts: string[]) {
  const stop = new Set(["para", "desde", "hasta", "como", "con", "del", "las", "los", "una", "que", "por", "más", "and", "the"]);
  const groups = texts.map((text) => new Set(text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((word) => word.length >= 4 && !stop.has(word)))).filter((group) => group.size > 0);
  if (groups.length < 2) return groups.length ? .45 : 0;
  const recurring = Array.from(groups[0]).filter((word) => groups.slice(1).some((group) => group.has(word))).length;
  return Math.min(1, recurring / Math.max(2, Math.min(8, groups[0].size)));
}

function sharedRatio(groups: string[][]) {
  const populated = groups.filter((group) => group.length > 0).map((group) => new Set(group.map((item) => item.toLowerCase())));
  if (!populated.length) return 0;
  if (populated.length === 1) return .55;
  const shared = Array.from(populated[0]).filter((item) => populated.every((group) => group.has(item))).length;
  const union = new Set(populated.flatMap((group) => Array.from(group))).size;
  return union ? Math.min(1, (shared / union) * 2.5) : 0;
}
