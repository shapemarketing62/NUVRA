"use client";
import { useState } from "react";
import { useDashboardData } from "@/lib/use-dashboard-data";
import { COLORS } from "@/lib/design-tokens";
import { Btn, DemoBadge, EmptyState, ErrorState, PageHeader, PageSkeleton, UpgradePanel } from "@/components/ui";
import { formatActionForBusiness } from "@/lib/simple-language-presenter";
import { applyUsageLimit } from "@/lib/plans";
export default function AccionesPage(){
 const {actions,loading,error,isDemo,planTier,internalAccess}=useDashboardData(); const [filter,setFilter]=useState<"all"|"pending"|"in_progress"|"completed">("all");
 if(loading)return <PageSkeleton/>; if(error)return <ErrorState message={error}/>; if(!actions?.length)return <EmptyState title="Todavía no hay acciones" description="Completá el análisis para recibir un plan ordenado para tu negocio."/>;
 const availableActions=applyUsageLimit(actions,planTier,"activeActions",internalAccess); const filtered=availableActions.filter((a)=>{if(filter==="all")return true;if(filter==="pending")return !a.done;if(filter==="in_progress")return false;return a.done}); const completed=actions.filter((a)=>a.done).length; const progress=Math.round(completed/actions.length*100);
 return <div className="page-container"><PageHeader eyebrow="Plan de trabajo" title="Acciones" subtitle={<>{isDemo&&<DemoBadge style={{marginRight:8}}/>}Cambios concretos, ordenados para que sepas qué hacer primero.</>}/>
  <section style={{display:"grid",gridTemplateColumns:"minmax(220px,.45fr) 1fr",gap:28,alignItems:"end",paddingBottom:28,borderBottom:"1px solid "+COLORS.line}}>
   <div><div className="page-eyebrow">Avance del plan</div><div className="shp-display" style={{fontSize:36,fontWeight:650,letterSpacing:"-.04em"}}>{progress}%</div><p className="section-description">{completed} de {actions.length} acciones completadas</p></div>
   <div><div className="diagnostic-track" style={{"--value":progress} as React.CSSProperties}/></div>
  </section>
  <div style={{display:"flex",gap:7,margin:"26px 0 10px",flexWrap:"wrap"}}>{[{id:"all",label:"Todas"},{id:"pending",label:"Pendientes"},{id:"in_progress",label:"En progreso"},{id:"completed",label:"Completadas"}].map((item)=><button className={"btn btn-sm "+(filter===item.id?"btn-subtle":"btn-ghost")} key={item.id} onClick={()=>setFilter(item.id as typeof filter)}>{item.label}</button>)}</div>
  <div className="action-list">{filtered.sort((a,b)=>(a.order||0)-(b.order||0)).map((rawAction,index)=>{const action=formatActionForBusiness(rawAction);return <article className="action-item" key={action.id} style={{opacity:action.done?.72:1}}><div className="action-number">{String(action.order||index+1).padStart(2,"0")}</div><div><h2 style={{fontSize:17,fontWeight:650,lineHeight:1.35}}>{action.title}</h2><p style={{fontSize:14,lineHeight:1.65,color:COLORS.inkSoft,marginTop:8}}>{action.whatToDo}</p><p style={{fontSize:13,lineHeight:1.55,color:COLORS.olive,marginTop:9}}>{action.expectedResult}</p><div className="action-meta"><span>Esfuerzo: {action.difficulty}</span><span>Plazo: {action.estimatedTime}</span><span>Impacto: {action.impact}</span></div><details style={{marginTop:15}}><summary style={{fontSize:12.5,color:COLORS.inkSoft,cursor:"pointer"}}>Por qué recomendamos esta acción</summary><div style={{padding:"12px 0 0",display:"grid",gap:7,fontSize:12.5,lineHeight:1.55}}><p><strong>Qué observamos: </strong>{action.problem}</p><p style={{color:COLORS.inkSoft}}><strong>Por qué importa: </strong>{action.importance}</p></div></details></div><Btn size="sm" variant={action.done?"subtle":"primary"} onClick={()=>console.log("Toggle action:",action.id)}>{action.done?"Completada":"Marcar lista"}</Btn></article>})}</div>
  {!filtered.length&&<EmptyState title="No hay acciones en esta vista" description="Probá con otro filtro para ver el resto del plan."/>}
  {actions.length>availableActions.length&&<div style={{marginTop:24}}><UpgradePanel feature="actions.extended" compact/></div>}
 </div>;
}
