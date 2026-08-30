import Link from "next/link";
import { PLAN_DEFINITIONS,getPlanFeatures,type PlanTier } from "@/lib/plans";
import { BILLING_CONFIG } from "@/services/billing/config";
import { COLORS } from "@/lib/design-tokens";
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
 return <main className="pricing-commercial" style={{minHeight:"100vh",padding:"28px clamp(20px,4vw,52px) 72px",background:COLORS.paper}}><nav style={{display:"flex",justifyContent:"space-between",alignItems:"center",maxWidth:1120,margin:"0 auto 80px"}}><BrandMark/><Link href="/register" className="btn btn-primary btn-sm">Crear cuenta</Link></nav><div style={{maxWidth:1120,margin:"0 auto"}}><header style={{maxWidth:720,marginBottom:52}}><div className="page-eyebrow">Planes</div><h1 className="page-title" style={{fontSize:"clamp(38px,5vw,58px)"}}>Una estructura para cada etapa</h1><p className="page-subtitle" style={{fontSize:16,maxWidth:620}}>Empezá con un diagnóstico base y ampliá capacidades cuando necesites gestionar más marketing, negocios o clientes.</p></header><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))",gap:14}}>{tiers.map((tier)=>{const plan=PLAN_DEFINITIONS[tier];const copy=PUBLIC_PLAN_COPY[tier];const featured=tier==="PRO";return <article className={`pricing-card pricing-card-${tier.toLowerCase()}`} key={tier} style={{padding:"30px 28px 34px",border:`1px solid ${featured?COLORS.blue:COLORS.line}`,borderTop:`4px solid ${featured?COLORS.blue:COLORS.sand}`,background:featured?COLORS.blueSoft:COLORS.surface,minHeight:380}}><h2 className="section-title" style={{fontSize:24,color:featured?COLORS.blueDeep:COLORS.ink}}>{plan.label}</h2><div className="pricing-price" style={{fontSize:18,fontWeight:650,marginTop:10}}>{BILLING_CONFIG.displayPrices[tier]}</div><p className="section-description pricing-description" style={{minHeight:72,marginTop:12}}>{copy?<><strong>{copy.lead}</strong>{copy.detail}</>:plan.audience}</p><ul className="pricing-features" style={{paddingLeft:18,display:"grid",gap:10,fontSize:13,lineHeight:1.5,marginTop:20}}>{(copy?.highlights??plan.highlights).map((item)=><li key={item}>{item}</li>)}</ul><div className="pricing-capabilities" style={{borderTop:"1px solid "+COLORS.line,marginTop:24,paddingTop:14,fontSize:12,color:COLORS.inkFaint}}>{getPlanFeatures(tier).length} capacidades incluidas</div></article>})}</div></div></main>;
}
