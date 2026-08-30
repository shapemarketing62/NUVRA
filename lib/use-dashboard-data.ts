"use client";

import { useEffect, useState } from "react";
import { getStoredBusinessId, isDemoMode } from "@/lib/session";
import { DEMO_ACTIONS, DEMO_BUSINESS, DEMO_DIAGNOSIS, DEMO_SCORE } from "@/lib/demo-data";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  buildDashboardViewModel,
  createEmptyDashboardViewModel,
  type DashboardViewModel,
} from "@/lib/dashboard-view-model";

export type DashboardData = DashboardViewModel & {
  loading: boolean;
  error: string | null;
};

function demoDashboardData(): DashboardViewModel {
  return buildDashboardViewModel({
    id: "demo-business",
    nombre: DEMO_BUSINESS.nombre,
    rubro: DEMO_BUSINESS.rubro,
    ubicacion: DEMO_BUSINESS.ubicacion,
    goals: [{
      objetivo: DEMO_BUSINESS.objetivoTipo,
      plazoDias: DEMO_BUSINESS.plazoMeses * 30,
      plazoLabel: DEMO_BUSINESS.plazoLabel,
      magnitud: DEMO_BUSINESS.magnitud,
    }],
    scores: [{ ...DEMO_SCORE, createdAt: new Date().toISOString() }],
    diagnoses: [{ ...DEMO_DIAGNOSIS, engineType: "demo" }],
    strategies: [{
      objetivo: DEMO_BUSINESS.objetivoTipo,
      situacionActual: DEMO_DIAGNOSIS.summary,
      distanciaObjetivo: DEMO_DIAGNOSIS.opportunities[0],
      principalProblema: DEMO_DIAGNOSIS.bottleneck.title,
      prioridades: DEMO_DIAGNOSIS.priorities.map((priority) => priority.title),
      engineType: "demo",
      actions: DEMO_ACTIONS.map((action, index) => ({ ...action, order: index + 1, indicatorToImprove: "Consultas generadas" })),
    }],
    analysisHistory: [{
      id: "demo-analysis",
      nuvraScoreTotal: DEMO_SCORE.total,
      createdAt: new Date().toISOString(),
      snapshot: {
        scoreMethodologyVersion: "DEMO",
        dimensions: DEMO_SCORE.dimensions,
        intelligence: { coverage: 100, sourceStatuses: {}, sourceMessages: {} },
      },
    }],
    planTier: "FREE",
    internalAccess: false,
  }, { isDemo: true });
}

export function useDashboardData(): DashboardData {
  const [state, setState] = useState<DashboardData>({
    ...createEmptyDashboardViewModel(),
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (isDemoMode()) {
      setState({ ...demoDashboardData(), loading: false, error: null });
      return;
    }

    const id = getStoredBusinessId();
    if (!id) {
      setState((current) => ({ ...current, loading: false, error: "Sin negocio" }));
      return;
    }

    fetch(`/api/dashboard?businessId=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(getApiErrorMessage(data, "No pudimos cargar el negocio."));
        return data as DashboardViewModel;
      })
      .then((viewModel) => setState({ ...viewModel, loading: false, error: null }))
      .catch((error) => setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "No pudimos cargar el negocio." })));
  }, []);

  return state;
}
