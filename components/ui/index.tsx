"use client";

import { CSSProperties, ReactNode, ReactElement, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes, cloneElement, isValidElement, useId } from "react";
import { COLORS } from "@/lib/design-tokens";
import { FEATURES, getMinimumPlan, hasEntitlement, type EntitlementKey, type PlanTier } from "@/lib/plans";

type BtnVariant = "primary" | "accent" | "ghost" | "subtle" | "danger";
type BtnSize = "sm" | "md" | "lg";
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> { children: ReactNode; variant?: BtnVariant; size?: BtnSize; full?: boolean; }

export function Btn({ children, variant="primary", size="md", full, className="", style, type="button", ...rest }: BtnProps) {
  return <button type={type} className={`btn btn-${variant} btn-${size} ${className}`} style={{width:full?"100%":undefined,...style}} {...rest}>{children}</button>;
}

export function Field({ label, hint, children }: { label:string; hint?:string; children:ReactNode }) {
  const id=useId();
  const hasControl=isValidElement(children)&&(children.type===TextInput||children.type===TextArea||children.type===Select);
  const control=hasControl?cloneElement(children as ReactElement<{id?:string}>,{id}):children;
  return <div className="field"><label className="field-label" htmlFor={hasControl?id:undefined}>{label}</label>{control}{hint&&<div className="field-hint">{hint}</div>}</div>;
}

type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & { value:string; onChange:(value:string)=>void };
export function TextInput({ value, onChange, className="", ...rest }: TextInputProps) {
  return <input className={`input ${className}`} value={value} onChange={(event)=>onChange(event.target.value)} {...rest}/>;
}

type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> & { value:string; onChange:(value:string)=>void };
export function TextArea({ value, onChange, className="", rows=4, ...rest }: TextAreaProps) {
  return <textarea className={`input ${className}`} value={value} rows={rows} onChange={(event)=>onChange(event.target.value)} {...rest}/>;
}

export function Select({value,onChange,options,placeholder}:{value:string;onChange:(value:string)=>void;options:readonly string[]|string[];placeholder?:string}) {
  return <select className="input" value={value} onChange={(e)=>onChange(e.target.value)}>{placeholder&&<option value="">{placeholder}</option>}{options.map((option)=><option key={option} value={option}>{option}</option>)}</select>;
}

export function Toggle({active,onClick,children}:{active:boolean;onClick:()=>void;children:ReactNode}) {
  return <button type="button" className={`choice ${active?"choice-active":""}`} aria-pressed={active} onClick={onClick}>{children}</button>;
}

export function Modal({title,onClose,children,width=520}:{title:string;onClose:()=>void;children:ReactNode;width?:number}) {
  return <div role="presentation" onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(25,26,28,.48)",display:"grid",placeItems:"center",zIndex:200,padding:20}}><section role="dialog" aria-modal="true" aria-label={title} className="card panel-raised shp-pop" onClick={(e)=>e.stopPropagation()} style={{width:"100%",maxWidth:width,maxHeight:"88vh",overflowY:"auto",padding:28}}><div className="section-header"><h2 className="section-title">{title}</h2><Btn variant="subtle" size="sm" onClick={onClose}>Cerrar</Btn></div>{children}</section></div>;
}

export function Card({children,style,className=""}:{children:ReactNode;style?:CSSProperties;className?:string}) { return <section className={`card card-pad ${className}`} style={style}>{children}</section>; }

export function PageHeader({eyebrow,title,subtitle,action}:{eyebrow?:string;title:string;subtitle?:ReactNode;action?:ReactNode}) {
  return <header className="page-header"><div className="page-header-copy">{eyebrow&&<div className="page-eyebrow">{eyebrow}</div>}<h1 className="page-title">{title}</h1>{subtitle&&<div className="page-subtitle">{subtitle}</div>}</div>{action}</header>;
}

export function SectionHeader({title,description,action}:{title:string;description?:string;action?:ReactNode}) {
  return <div className="section-header"><div><h2 className="section-title">{title}</h2>{description&&<p className="section-description">{description}</p>}</div>{action}</div>;
}

export function StatusBadge({tone="neutral",children}:{tone?:"neutral"|"info"|"success"|"warning"|"danger";children:ReactNode}) { return <span className={`badge badge-${tone}`}>{children}</span>; }
export function Skeleton({height=16,width="100%",style}:{height?:number;width?:number|string;style?:CSSProperties}) { return <div className="skeleton" aria-hidden="true" style={{height,width,...style}}/>; }
export function PageSkeleton() { return <div className="page-container" aria-label="Cargando contenido"><Skeleton height={11} width={92}/><Skeleton height={40} width="40%" style={{marginTop:14}}/><div className="metric-grid" style={{marginTop:40}}><Card><Skeleton height={150}/></Card><Card><Skeleton height={18} width="38%"/><Skeleton height={10} style={{marginTop:24}}/><Skeleton height={10} style={{marginTop:20}}/><Skeleton height={10} style={{marginTop:20}}/></Card></div></div>; }

export function EmptyState({title,description,action}:{title:string;description:string;action?:ReactNode}) { return <div className="empty-state"><div className="empty-state-title">{title}</div><p className="empty-state-copy">{description}</p>{action&&<div style={{marginTop:18}}>{action}</div>}</div>; }
export function ErrorState({message,onRetry}:{message:string;onRetry?:()=>void}) { return <div className="page-container"><div className="strategic-callout" style={{maxWidth:680,margin:"70px auto"}}><StatusBadge tone="danger">No pudimos cargar esta vista</StatusBadge><p className="section-description" style={{margin:"14px 0 20px"}}>{message}</p>{onRetry&&<Btn onClick={onRetry}>Intentar de nuevo</Btn>}</div></div>; }

export function CoverageBar({value,label="Cobertura"}:{value:number;label?:string}) { const safe=Math.max(0,Math.min(100,Math.round(value))); return <div><div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:COLORS.inkSoft,marginBottom:8}}><span>{label}</span><strong style={{color:COLORS.ink}}>{safe}%</strong></div><div className="diagnostic-track" style={{"--value":safe} as CSSProperties}/></div>; }

export function ScoreRing({value}:{value:number|null;status:"PENDIENTE"|"PRELIMINAR"|"COMPLETO"}) { const safe=value===null?0:Math.max(0,Math.min(100,value)); const color=value===null?COLORS.inkFaint:safe>=65?COLORS.olive:safe>=45?COLORS.blue:COLORS.amber; return <div className="score-dial" style={{"--score":safe,"--score-color":color} as CSSProperties}><div className="score-value">{value??"—"}<small>/100</small></div></div>; }

export function Metric({label,value,detail}:{label:string;value:ReactNode;detail?:string}) { return <div><div className="page-eyebrow">{label}</div><div className="shp-display" style={{fontSize:30,fontWeight:650,letterSpacing:"-.035em"}}>{value}</div>{detail&&<p className="section-description">{detail}</p>}</div>; }
export function Insight({title,children}:{title?:string;children:ReactNode}) { return <div className="insight"><div>{title&&<h3 style={{fontSize:14,fontWeight:650,marginBottom:5}}>{title}</h3>}<div style={{fontSize:13,lineHeight:1.55,color:COLORS.inkSoft}}>{children}</div></div></div>; }
export function SourceStatus({label,detail,status}:{label:string;detail:string;status:"ready"|"partial"|"pending"|"unavailable"}) { const config=status==="ready"?{tone:"success" as const,text:"Analizada"}:status==="partial"?{tone:"warning" as const,text:"Parcial"}:status==="unavailable"?{tone:"neutral" as const,text:"No disponible"}:{tone:"neutral" as const,text:"Pendiente"}; return <div className="source-row"><div><div style={{fontSize:13,fontWeight:650}}>{label}</div><div className="field-hint" style={{marginTop:3}}>{detail}</div></div><StatusBadge tone={config.tone}>{config.text}</StatusBadge></div>; }

export function UpgradePanel({feature,compact=false}:{feature:EntitlementKey;compact?:boolean}) { const definition=FEATURES[feature]; const minimumPlan=getMinimumPlan(feature); return <div className="card" style={{padding:compact?18:26}}><StatusBadge tone="info">Plan {minimumPlan==="PARTNER"?"Partner":"Pro"}</StatusBadge><h3 className="section-title" style={{marginTop:12}}>{definition.label}</h3><p className="section-description">{definition.description} Esta vista está preparada, pero tu plan actual no la incluye.</p><Btn size="sm" style={{marginTop:16}} onClick={()=>{window.location.href="/dashboard/configuracion#planes"}}>Comparar planes</Btn></div>; }
export function FeatureGate({plan,feature,children,fallback}:{plan:PlanTier|string;feature:EntitlementKey;children:ReactNode;fallback?:ReactNode}) { return hasEntitlement(plan,feature)?<>{children}</>:<>{fallback??<UpgradePanel feature={feature}/>}</>; }
export function ProBadge({label="PRO",style}:{label?:string;style?:CSSProperties}) { return <span className="badge badge-info" style={style}>{label}</span>; }
export function DemoBadge({label="Demo",style}:{label?:string;style?:CSSProperties}) { return <span className="badge badge-warning" style={style}>{label}</span>; }
export function PendingBadge({label="Pendiente"}:{label?:string}) { return <span className="badge badge-neutral">{label}</span>; }

export function NuvraLogo({size=20,inverse=false}:{size?:number;inverse?:boolean}) { const color=inverse?"#8795D4":COLORS.blue; return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none"><path d="M4 18C4 10 9 5 18 5" stroke={color} strokeWidth="2.2" strokeLinecap="round"/><circle cx="19" cy="5" r="2.2" fill={color}/></svg>; }
export function BrandMark({subtitle=true,inverse=false}:{subtitle?:boolean;inverse?:boolean}) { return <div style={{display:"flex",flexDirection:"column",gap:subtitle?2:0,color:inverse?"white":COLORS.ink}}><div className="shp-display" style={{fontWeight:700,fontSize:18,display:"flex",alignItems:"center",gap:8,letterSpacing:"-.02em"}}><NuvraLogo size={18} inverse={inverse}/>NUVRA</div>{subtitle&&<div style={{fontSize:10,color:inverse?"#A9ABB0":COLORS.inkFaint,paddingLeft:26}}>by Shape</div>}</div>; }

export function SimpleTable({headers,rows}:{headers:string[];rows:string[][]}) { if(!rows.length)return <EmptyState title="Todavía no hay datos acá" description="La información aparecerá cuando esté disponible."/>; return <div className="table-shell"><table><thead><tr>{headers.map((header)=><th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>; }
