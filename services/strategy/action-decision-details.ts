export interface ActionDecisionDetails {
  what: string;
  where: string;
  audience: string;
  steps: string[];
  why: string;
  expectedResult: string;
  estimatedCost: string;
  metric: string;
  causal?: import("./causal-decision-engine.ts").CausalDecision;
  experiment?: import("./causal-decision-engine.ts").ExperimentDesign;
}

const PREFIX = "NUVRA_ACTION_V2:";

export function encodeActionDecisionDetails(details: ActionDecisionDetails) {
  return `${PREFIX}${JSON.stringify(details)}`;
}

export function decodeActionDecisionDetails(value: unknown): ActionDecisionDetails | null {
  if (typeof value !== "string" || !value.startsWith(PREFIX)) return null;
  try {
    const parsed = JSON.parse(value.slice(PREFIX.length)) as ActionDecisionDetails;
    return parsed && typeof parsed.what === "string" && Array.isArray(parsed.steps) ? parsed : null;
  } catch { return null; }
}
