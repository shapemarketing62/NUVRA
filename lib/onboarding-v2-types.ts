export interface OnboardingV2Input {
  nombre: string;
  rubro: string;
  ubicacion: string;
  tipoCliente: "B2C" | "B2B" | "Ambos";
  objetivo: string;
  objetivoLabel: string;
  plazoDias: number;
  plazoLabel: string;
  presupuesto: "none" | "low" | "medium" | "high" | "prefiero_no_decir";
  capacidad: "self" | "team" | "agency" | "none";
  capacidadComercial?: "si" | "algunas" | "limite" | "no_se";
  limitaciones?: string;
  webUrl?: string;
  instagramHandle?: string;
  noWeb: boolean;
  noInstagram: boolean;
}

export interface DiscoveryResult {
  web?: { url: string; status: "found" | "not_found" | "ambiguous" | "rejected" };
  instagram?: { handle: string; status: "found" | "not_found" | "ambiguous" | "rejected" };
  tiktok?: { handle: string; status: "found" | "not_found" | "ambiguous" | "rejected" };
  maps?: { status: "found" | "not_found" | "not_confirmed" };
  reviews?: { status: "sufficient" | "insufficient" };
}

export interface ConfirmationState {
  confirmed: boolean;
  corrections: Record<string, string>;
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  reason: string;
  impact: "high" | "medium" | "low";
  type: "single" | "multiple" | "text";
  options?: string[];
  affects: string;
}
