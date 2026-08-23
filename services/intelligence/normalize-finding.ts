export function normalizeRawFindingType(type: string): "positive" | "negative" | "neutral" {
  if (type === "strength" || type === "positive") return "positive";
  if (type === "problem" || type === "negative") return "negative";
  return "neutral";
}
