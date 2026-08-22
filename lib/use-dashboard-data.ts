"use client";

import { useEffect, useState } from "react";
import { getStoredBusinessId, isDemoMode } from "@/lib/session";
import { DEMO_BUSINESS, DEMO_SCORE, DEMO_DIAGNOSIS, DEMO_ACTIONS } from "@/lib/demo-data";
import { parseJsonSafe } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/api-client";

export interface DashboardData {
  isDemo: boolean;
  planTier: "FREE" | "PRO" | "PARTNER";
  business: {
    id?: string;
    organizationId?: string | null;
    nombre: string;
    rubro: string;
    webUrl?: string | null;
    instagramHandle?: string | null;
    objetivo?: string;
    plazoLabel?: string;
    magnitud?: number | null;
  };
  intelligence: {
    coverage: number;
    competitorSummary?: {
      competitors: Array<{
        name: string;
        competitorType: "direct" | "partial" | "indirect";
        officialWebsite: string | null;
        officialSocialProfile: string | null;
        location?: string;
        entityMatchConfidence: number;
        competitorRelevanceScore: number;
        evidence?: Array<{ label: string; url?: string; type?: "official_source" | "earned_media" | "community" | "directory" | "social_profile" | "irrelevant" }>;
        rationale?: string;
        classification?: "confirmed_competitor" | "probable_competitor" | "uncertain" | "rejected";
        discoveryEvidenceUrls?: string[];
        entityConfidenceReasons?: string[];
        competitorRelevanceReasons?: string[];
      }>;
      totalValidated: number;
      totalCandidatesExtracted: number;
      coverage: number;
      confidence?: string;
    } | null;
    externalMentionsSummary?: {
      mentions: Array<{
        url: string;
        title: string;
        mentionType: string;
        source: string;
        entityMatchConfidence: number;
        mentionRelevanceScore: number;
        sentiment: "positive" | "negative" | "neutral" | "unknown";
        evidenceConfidence: string;
      }>;
      totalAccepted: number;
      totalFound: number;
      totalRejected?: number;
      byType: Record<string, number>;
      coverage: number;
      confidence?: string;
    } | null;
  } | null;
  score: {
    total: number;
    coverage?: number;
    dimensions: Array<{ slug: string; name: string; points: number; weight: number; problems?: string[] }>;
    engineType?: string;
  } | null;
  diagnosis: {
    summary: string;
    bottleneck: { dimension: string; title: string; explanation: string };
    priorities: Array<{ title: string; reason: string; order: number }>;
    strengths?: Array<{ title: string; evidence: string }>;
    weaknesses?: Array<{ title: string; evidence: string }>;
    opportunities?: Array<string>;
    risks?: Array<string>;
    engineType?: string;
  } | null;
  strategy: {
    objetivo: string;
    situacionActual: string;
    distanciaObjetivo: string;
    principalProblema: string;
    prioridades: string[];
    engineType?: string;
  } | null;
  actions: Array<{
    id: string;
    title: string;
    description?: string | null;
    impact: string;
    difficulty: string;
    estimatedTime: string;
    rationale: string;
    done: boolean;
    order?: number;
    findingIds?: string[];
    evidence?: string;
    inference?: string;
    dimension?: string;
    framework?: string;
    confidence?: string;
    problem?: string;
    indicatorToImprove?: string;
  }>;
  history: Array<{ nuvraScoreTotal: number | null; createdAt: string }>;
  loading: boolean;
  error: string | null;
}

export function useDashboardData(): DashboardData {
  const [state, setState] = useState<DashboardData>({
    isDemo: false,
    planTier: "FREE",
    business: { nombre: "", rubro: "" },
    intelligence: null,
    score: null,
    diagnosis: null,
    strategy: null,
    actions: [],
    history: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (isDemoMode()) {
      setState({
        isDemo: true,
        planTier: "FREE",
        business: {
          nombre: DEMO_BUSINESS.nombre,
          rubro: DEMO_BUSINESS.rubro,
          objetivo: DEMO_BUSINESS.objetivoTipo,
          plazoLabel: DEMO_BUSINESS.plazoLabel,
          magnitud: DEMO_BUSINESS.magnitud,
        },
        intelligence: null,
        score: { total: DEMO_SCORE.total, dimensions: DEMO_SCORE.dimensions },
        diagnosis: { ...DEMO_DIAGNOSIS, engineType: "demo" },
        strategy: null,
        actions: DEMO_ACTIONS.map((a) => ({ ...a, description: a.rationale })),
        history: [],
        loading: false,
        error: null,
      });
      return;
    }

    const id = getStoredBusinessId();
    if (!id) {
      setState((s) => ({ ...s, loading: false, error: "Sin negocio" }));
      return;
    }

    fetch(`/api/business?id=${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(getApiErrorMessage(data, "No pudimos cargar el negocio."));
        const goal = data.goals?.[0];
        const score = data.scores?.[0];
        const diagnosis = data.diagnoses?.[0];
        const strategy = data.strategies?.[0];
        const latestHistory = data.analysisHistory?.[0];
        const snapshot = parseJsonSafe<Record<string, any> | null>(latestHistory?.snapshot, null);

        setState({
          isDemo: false,
          planTier: data.planTier || "FREE",
          business: {
            id: data.id,
            organizationId: data.organizationId,
            nombre: data.nombre,
            rubro: data.rubro,
            webUrl: data.webUrl,
            instagramHandle: data.instagramHandle,
            objetivo: goal?.objetivo,
            plazoLabel: goal?.plazoLabel,
            magnitud: goal?.magnitud,
          },
          intelligence: snapshot?.intelligence
            ? {
                coverage: snapshot.intelligence.coverage || 0,
                competitorSummary: snapshot.intelligence.competitorSummary || null,
                externalMentionsSummary: snapshot.intelligence.externalMentionsSummary || null,
              }
            : null,
          score: score
            ? {
                total: score.total,
                coverage: snapshot?.intelligence?.coverage || 0,
                dimensions: score.dimensions.map((d: { slug: string; name: string; points: number; weight: number; problems: string }) => ({
                  slug: d.slug,
                  name: d.name,
                  points: d.points === -1 ? null : d.points,
                  weight: d.weight,
                  problems: parseJsonSafe<string[]>(d.problems, []),
                })),
              }
            : null,
          diagnosis: diagnosis
            ? {
                summary: diagnosis.summary,
                bottleneck: parseJsonSafe(diagnosis.bottleneck, { dimension: "", title: "", explanation: "" }),
                priorities: parseJsonSafe(diagnosis.priorities, []),
                strengths: parseJsonSafe(diagnosis.strengths, []),
                weaknesses: parseJsonSafe(diagnosis.weaknesses, []),
                opportunities: parseJsonSafe(diagnosis.opportunities, []),
                risks: parseJsonSafe(diagnosis.risks, []),
                engineType: diagnosis.engineType,
              }
            : null,
          strategy: strategy
            ? {
                objetivo: strategy.objetivo,
                situacionActual: strategy.situacionActual,
                distanciaObjetivo: strategy.distanciaObjetivo,
                principalProblema: strategy.principalProblema,
                prioridades: parseJsonSafe(strategy.prioridades, []),
                engineType: strategy.engineType,
              }
            : null,
          actions: (strategy?.actions || []).map((a: { id: string; title: string; description?: string; impact: string; difficulty: string; estimatedTime: string; indicatorToImprove: string; rationale: string; done: boolean; order: number; findingIds?: string; evidence?: string; inference?: string; dimension?: string; framework?: string; confidence?: string; problem?: string }) => ({
            id: a.id,
            title: a.title,
            description: a.description,
            impact: a.impact,
            difficulty: a.difficulty,
            estimatedTime: a.estimatedTime,
            rationale: a.rationale,
            done: a.done,
            order: a.order,
            findingIds: a.findingIds ? JSON.parse(a.findingIds) : [],
            evidence: a.evidence,
            inference: a.inference,
            dimension: a.dimension,
            framework: a.framework,
            confidence: a.confidence,
            problem: a.problem,
            indicatorToImprove: a.indicatorToImprove,
          })),
          history: (data.analysisHistory || []).map((h: { nuvraScoreTotal: number | null; createdAt: string }) => ({
            nuvraScoreTotal: h.nuvraScoreTotal,
            createdAt: h.createdAt,
          })),
          loading: false,
          error: null,
        });
      })
      .catch((e) => setState((s) => ({ ...s, loading: false, error: e.message })));
  }, []);

  return state;
}
