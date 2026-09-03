import type { SocialBusinessTarget, SocialPlatform } from "./social-source-provider.ts";

export type SourcePriority = "primary" | "secondary" | "optional";
export interface PlannedSocialSource { platform: SocialPlatform; priority: SourcePriority; relevant: boolean; score: number; reasons: string[] }

const platforms: SocialPlatform[] = ["x", "tiktok", "reddit", "facebook", "linkedin", "youtube"];
const normalize = (value: unknown) => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export class SourceRelevancePlanner {
  static plan(target: SocialBusinessTarget): PlannedSocialSource[] {
    const text = normalize(`${target.industry} ${target.customerType || ""} ${target.objective || ""} ${target.location || ""}`);
    const declared = normalize(target.declaredChannels);
    const b2b = /b2b|empresa|corporativ|profesional|consultor|estudio|industrial|distribuidor/.test(text);
    const local = /cafe|restaurante|gastronom|barber|peluquer|clinica|salud|gimnas|local|turismo|hotel|estetic|odont|tienda fisica/.test(text);
    const ecommerce = /ecommerce|tienda online|producto|retail|venta online|envio|comprar/.test(text);
    const visual = /estetic|belleza|moda|decor|diseno|gastronom|fitness|turismo|arte|producto/.test(text);
    const awareness = /reconoc|awareness|alcance|descubr|marca|visibil/.test(text);
    const appointments = /turno|reserva|consulta|lead|reunion|visita/.test(text);
    return platforms.map((platform) => {
      let score = .2; const reasons: string[] = [];
      if (declared.includes(platform) || (platform === "x" && declared.includes("twitter"))) { score += .55; reasons.push("canal declarado o detectado"); }
      if (b2b && ["linkedin", "x", "youtube"].includes(platform)) { score += platform === "linkedin" ? .65 : platform === "youtube" ? .25 : .15; reasons.push("puede aportar autoridad o conversación B2B"); }
      if (local && ["facebook", "tiktok", "youtube"].includes(platform)) { score += platform === "facebook" ? .45 : .3; reasons.push("puede aportar comunidad o experiencia local"); }
      if (ecommerce && ["tiktok", "reddit", "youtube"].includes(platform)) { score += .45; reasons.push("puede aportar evaluación de productos y experiencias"); }
      if (visual && ["tiktok", "youtube", "facebook"].includes(platform)) { score += .18; reasons.push("la oferta se beneficia de demostración visual"); }
      if (awareness && ["tiktok", "youtube", "x"].includes(platform)) { score += .18; reasons.push("el objetivo prioriza descubrimiento o alcance"); }
      if (appointments && local && platform === "facebook") { score += .12; reasons.push("puede apoyar contacto y actividad local"); }
      if (/actual|reput|queja|opinion|percepcion/.test(text) && ["x", "reddit", "tiktok"].includes(platform)) { score += .3; reasons.push("el objetivo requiere conversación pública actual"); }
      score = Math.min(1, score);
      const priority: SourcePriority = score >= .7 ? "primary" : score >= .45 ? "secondary" : "optional";
      const explicitlyPresent = declared.includes(platform) || (platform === "x" && declared.includes("twitter"));
      const relevant = priority !== "optional" || explicitlyPresent;
      if (!relevant) reasons.push("baja relevancia esperada para este modelo de negocio");
      return { platform, priority, relevant, score: Math.round(score * 100) / 100, reasons };
    });
  }

  static forPlatform(target: SocialBusinessTarget, platform: SocialPlatform) {
    return this.plan(target).find((item) => item.platform === platform)!;
  }
}
