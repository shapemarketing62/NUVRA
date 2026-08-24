import type { EvidenceFinding } from "../source-analyzer.ts";
import type { SocialBusinessTarget, SocialPlatform, SocialProviderResult, SocialPublicContent } from "./social-source-provider.ts";

export interface PublicContentAnalysis {
  themes: Array<{ name: string; count: number }>;
  callsToAction: string[];
  answeredQuestions: number;
  unansweredQuestions: number;
  findings: EvidenceFinding[];
}

const normalize = (value: unknown) => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const STOP = new Set(["para", "como", "esta", "este", "desde", "hasta", "sobre", "todos", "todas", "nuestro", "nuestra", "https", "www"]);

export class PublicContentAnalyzer {
  static analyze(platform: SocialPlatform, result: SocialProviderResult, target: SocialBusinessTarget): PublicContentAnalysis {
    const brandContent = result.content.filter((item) => item.ownerType === "brand");
    const themes = extractThemes([...brandContent, ...result.mentions]);
    const callsToAction = Array.from(new Set(brandContent.map((item) => item.callToAction).filter((item): item is string => Boolean(item))));
    const questions = [...result.comments, ...result.mentions.map((item) => ({ text: item.text, id: item.id, source: platform }))].filter((item) => /\?|como|donde|cuando|precio|cuanto|envio|turno|reserva/i.test(item.text));
    const answeredQuestions = brandContent.filter((item) => item.responseFromBusiness?.text).length;
    const findings: EvidenceFinding[] = [];
    if (themes.length >= 2 && brandContent.length >= 3) findings.push(finding(platform, "propuesta", "neutral", "medium", `El contenido público de ${platform} prioriza ${themes.slice(0, 3).map((item) => item.name).join(", ")}.`, result, .42));
    if (callsToAction.length && brandContent.length >= 2) findings.push(finding(platform, "conversion", "positive", "medium", `En ${platform} se observaron llamados concretos a ${callsToAction.slice(0, 3).join(", ")}.`, result, .55));
    if (platform === "linkedin" && brandContent.length >= 2 && brandContent.some((item) => /caso|cliente|especializ|experiencia|equipo|proyecto/i.test(item.text))) findings.push(finding(platform, "posicionamiento", "positive", "medium", `LinkedIn aporta evidencia pública sobre la especialización o experiencia de ${target.name}.`, result, .58));
    if (platform === "youtube" && result.mentions.filter((item) => item.ownerType !== "brand").length >= 2) findings.push(finding(platform, "posicionamiento", "positive", "medium", `Se encontraron videos externos que evalúan o muestran la experiencia con ${target.name}.`, result, .55));
    // No respuesta es contexto y nunca se transforma por sí sola en una falla de atención.
    if (questions.length >= 3 && answeredQuestions > 0) findings.push(finding(platform, "redes", "neutral", "low", `Se observaron respuestas públicas de la empresa a preguntas en ${platform}.`, result, .3));
    return { themes, callsToAction, answeredQuestions, unansweredQuestions: Math.max(0, questions.length - answeredQuestions), findings };
  }
}

function finding(platform: SocialPlatform, category: string, type: "positive" | "negative" | "neutral", impact: "high" | "medium" | "low", evidence: string, result: SocialProviderResult, weight: number): EvidenceFinding {
  return { id: `${platform}:content:${Buffer.from(evidence).toString("base64url").slice(0, 18)}`, category, type, impact, evidence, source: platform, attribution: result.urls[0] || `Contenido público de ${platform}`, weight, confidence: result.entityConfidence >= .9 ? "ALTA" : "MEDIA", acquisitionMethod: result.acquisitionMethods[0] };
}

function extractThemes(content: SocialPublicContent[]) {
  const counts = new Map<string, number>();
  for (const item of content) {
    for (const explicit of item.themes || []) counts.set(normalize(explicit), (counts.get(normalize(explicit)) || 0) + 1);
    for (const token of normalize(`${item.title || ""} ${item.text}`).split(/[^a-z0-9]+/).filter((word) => word.length >= 5 && !STOP.has(word))) counts.set(token, (counts.get(token) || 0) + 1);
  }
  return Array.from(counts.entries()).filter(([, count]) => count >= 2).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
}
