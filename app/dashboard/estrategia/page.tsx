"use client";
import { useDashboardData } from "@/lib/use-dashboard-data";
import { COLORS } from "@/lib/design-tokens";
import { DemoBadge, EmptyState, ErrorState, PageHeader, PageSkeleton, SectionHeader } from "@/components/ui";
import { simplifyTechnicalText, getFriendlyDimensionName } from "@/lib/simple-language-presenter";
export default function EstrategiaPage(){
 const {strategy,diagnosis,score,loading,error,isDemo}=useDashboardData(); if(loading)return <PageSkeleton/>; if(error)return <ErrorState message={error}/>; if(!strategy)return <EmptyState title="Todavía no hay estrategia" description="Completá el análisis para construir un plan alrededor de tu objetivo."/>;
 return <div className="page-container"><PageHeader eyebrow="Dirección recomendada" title="Mi estrategia" subtitle={<>{isDemo&&<DemoBadge style={{marginRight:8}}/>}Un criterio claro para decidir dónde concentrar tiempo y presupuesto.</>}/>
  <section style={{paddingBottom:34,borderBottom:"1px solid "+COLORS.line,marginBottom:36}}><div className="page-eyebrow">Objetivo que estamos trabajando</div><h2 className="shp-display" style={{fontSize:"clamp(24px,3vw,34px)",fontWeight:650,letterSpacing:"-.035em",maxWidth:760}}>{strategy.objetivo}</h2></section>
  <div className="split-grid" style={{marginBottom:40}}><section><SectionHeader title="Situación actual"/><p style={{fontSize:14,lineHeight:1.7}}>{simplifyTechnicalText(strategy.situacionActual)}</p></section><section><SectionHeader title="Qué falta para llegar"/><p style={{fontSize:14,lineHeight:1.7}}>{simplifyTechnicalText(strategy.distanciaObjetivo)}</p></section></div>
  <section className="strategic-callout" style={{marginBottom:40}}><div className="page-eyebrow">Enfoque principal</div><h2 style={{fontSize:18,fontWeight:650}}>{simplifyTechnicalText(strategy.principalProblema)}</h2>{diagnosis?.bottleneck&&<p className="section-description" style={{marginTop:10}}>Para avanzar, conviene resolver primero {getFriendlyDimensionName(diagnosis.bottleneck.dimension,diagnosis.bottleneck.dimension).toLowerCase()}: {simplifyTechnicalText(diagnosis.bottleneck.title)}</p>}</section>
  {strategy.prioridades?.length?<section><SectionHeader title="En qué conviene concentrarse" description="Una secuencia para mantener el esfuerzo enfocado."/><div className="action-list">{strategy.prioridades.map((item,index)=><article className="action-item" key={index}><div className="action-number">{String(index+1).padStart(2,"0")}</div><p style={{fontSize:14,lineHeight:1.6,fontWeight:550}}>{simplifyTechnicalText(item)}</p></article>)}</div></section>:null}
  {score&&<section className="section-rule" style={{marginTop:40,display:"flex",alignItems:"baseline",gap:16}}><strong className="shp-display" style={{fontSize:32,fontWeight:650}}>{score.total}</strong><div><div style={{fontSize:13,fontWeight:650}}>Nuvra Score actual</div><div className="section-description">Calculado con la información disponible del negocio.</div></div></section>}
 </div>;
}
