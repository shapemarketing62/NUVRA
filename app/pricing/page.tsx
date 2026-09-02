import Link from "next/link";
import { PLAN_DEFINITIONS,getPlanFeatures,type PlanTier } from "@/lib/plans";
import { BILLING_CONFIG } from "@/services/billing/config";
import { BrandMark } from "@/components/ui";

const PUBLIC_PLAN_COPY: Partial<Record<PlanTier,{lead:string;detail:string;highlights:string[]}>> = {
 PRO: {
  lead: "Tu estrategia de marketing, siempre actualizada.",
  detail: "NUVRA piensa y planifica; vos la llevás a la práctica.",
  highlights: [
   "Estrategias y prioridades durante todo el mes",
   "Recomendaciones, acciones e ideas de contenido",
   "Análisis profundos, competencia y evolución",
   "Seguimiento y nuevas estrategias según los resultados",
   "NUVRA indica qué hacer y cómo medirlo",
   "Vos organizás, publicás e implementás",
  ],
 },
 PARTNER: {
  lead: "Tu equipo de marketing externo.",
  detail: "Planificamos, ejecutamos y hacemos seguimiento junto con vos.",
  highlights: [
   "Estrategia y planificación mensual integral",
   "Calendario, contenidos, acciones y campañas",
   "Coordinación de producción y ejecución",
   "Seguimiento, medición y ajustes",
   "Reuniones y acompañamiento continuo",
   "Gestionamos el marketing con vos",
  ],
 },
};

export default function PricingPage(){
 const tiers:PlanTier[]=["FREE","PRO","PARTNER"];
 return <main className="pricing-commercial"><nav className="pricing-nav"><BrandMark/><Link href="/register" className="btn btn-primary btn-sm">Crear cuenta</Link></nav><div className="pricing-shell"><header className="pricing-header"><div className="page-eyebrow">Planes</div><h1 className="page-title">Una estructura para cada etapa</h1><p className="page-subtitle">Empezá con un diagnóstico base y ampliá capacidades cuando necesites gestionar más marketing, negocios o clientes.</p></header><div className="pricing-grid">{tiers.map((tier)=>{const plan=PLAN_DEFINITIONS[tier];const copy=PUBLIC_PLAN_COPY[tier];return <article className={`pricing-card pricing-card-${tier.toLowerCase()}`} key={tier}><h2 className="section-title">{plan.label}</h2><div className="pricing-price">{BILLING_CONFIG.displayPrices[tier]}</div><p className="section-description pricing-description">{copy?<><strong>{copy.lead}</strong>{copy.detail}</>:plan.audience}</p><ul className="pricing-features">{(copy?.highlights??plan.highlights).map((item)=><li key={item}>{item}</li>)}</ul><div className="pricing-capabilities">{getPlanFeatures(tier).length} capacidades incluidas</div></article>})}</div></div></main>;
}
