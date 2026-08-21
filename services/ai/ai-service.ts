import { z } from "zod";

export const diagnosisSchema = z.object({
  summary: z.string(),
  bottleneck: z.object({
    dimension: z.string(),
    title: z.string(),
    explanation: z.string(),
    findingId: z.string().optional(),
  }),
  strengths: z.array(z.object({ title: z.string(), evidence: z.string() })),
  weaknesses: z.array(z.object({ title: z.string(), evidence: z.string(), findingId: z.string().optional() })),
  opportunities: z.array(z.string()),
  risks: z.array(z.string()),
  priorities: z.array(z.object({ title: z.string(), reason: z.string(), order: z.number() })),
});

export const strategyActionSchema = z.object({
  title: z.string(),
  description: z.string(),
  order: z.number(),
  impact: z.enum(["alto", "medio", "bajo"]),
  difficulty: z.enum(["alta", "media", "baja"]),
  estimatedTime: z.string(),
  dependencies: z.array(z.string()),
  indicatorToImprove: z.string(),
  rationale: z.string(),
  relatedFindingIds: z.array(z.string()).optional(),
  unlocksContent: z.boolean().optional(),
  effort: z.enum(["baja", "media", "alta"]).optional(),
  timeframe: z.string().optional(),
  kpi: z.string().optional(),
  justification: z.string().optional(),
  findingIds: z.array(z.string()).optional(),
  evidence: z.string().optional(),
  inference: z.string().optional(),
  dimension: z.string().optional(),
  framework: z.string().optional(),
  confidence: z.string().optional(),
  problem: z.string().optional(),
});

export const strategySchema = z.object({
  objetivo: z.string(),
  situacionActual: z.string(),
  distanciaObjetivo: z.string(),
  principalProblema: z.string(),
  prioridades: z.array(z.string()),
  frameworks: z.array(z.object({
    id: z.string(),
    title: z.string(),
    rationale: z.string(),
    useCase: z.string(),
  })).optional(),
  actions: z.array(strategyActionSchema),
});

export type DiagnosisOutput = z.infer<typeof diagnosisSchema>;
export type StrategyOutput = z.infer<typeof strategySchema>;

export interface AIService {
  isAvailable(): boolean;
  completeStructured<T>(prompt: string, schema: z.ZodSchema<T>, systemPrompt?: string): Promise<T | null>;
}

export class NoOpAIService implements AIService {
  isAvailable() {
    return false;
  }
  async completeStructured<T>(): Promise<T | null> {
    return null;
  }
}

export class OpenAIService implements AIService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  isAvailable() {
    return !!this.apiKey;
  }

  async completeStructured<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    systemPrompt = "Respond only with valid JSON matching the requested schema. Never invent data not provided in the prompt."
  ): Promise<T | null> {
    if (!this.isAvailable()) return null;

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
        }),
      });

      if (!res.ok) return null;
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) return null;
      const parsed = JSON.parse(content);
      return schema.parse(parsed);
    } catch {
      return null;
    }
  }
}

export function createAIService(): AIService {
  const provider = process.env.AI_PROVIDER || "openai";
  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    return new OpenAIService(process.env.OPENAI_API_KEY);
  }
  if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    // Placeholder for future Anthropic implementation
    return new NoOpAIService();
  }
  return new NoOpAIService();
}
