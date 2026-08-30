"use client";

import { useDashboardData } from "@/lib/use-dashboard-data";
import { hasEntitlement } from "@/lib/plans";
import { Card, EmptyState, ErrorState, PageHeader, PageSkeleton, StatusBadge, UpgradePanel } from "@/components/ui";
import { COLORS } from "@/lib/design-tokens";
import type { CompetitionCompetitorView } from "@/lib/business-context-views";

function EvidenceLinks({ item }: { item: CompetitionCompetitorView }) {
  if (!item.evidence.length) return null;
  return <div style={{ marginTop: 18, paddingTop: 15, borderTop: `1px solid ${COLORS.line}` }}><div style={{ fontSize: 12, color: COLORS.inkFaint, marginBottom: 8 }}>Fuentes consultadas</div><div style={{ display: "flex", flexWrap: "wrap", gap: 10, overflowWrap: "anywhere" }}>{item.evidence.map((evidence, index) => evidence.url ? <a key={`${evidence.url}-${index}`} href={evidence.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: COLORS.blueDeep }}>{evidence.sourceType}: {evidence.label}</a> : <span key={`${evidence.label}-${index}`} style={{ fontSize: 12, color: COLORS.inkSoft }}>{evidence.sourceType}: {evidence.label}</span>)}</div></div>;
}

function ComparableBusiness({ item }: { item: CompetitionCompetitorView }) {
  return <Card><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18 }}><div><h2 className="section-title">{item.name}</h2>{item.location && <p style={{ fontSize: 12, color: COLORS.inkFaint, marginTop: 5 }}>{item.location}</p>}</div><StatusBadge tone="success">Comparable</StatusBadge></div>
    <section style={{ marginTop: 20 }}><h3 style={{ fontSize: 13, fontWeight: 600 }}>Por qué tiene sentido compararlo</h3><ul style={{ paddingLeft: 18, display: "grid", gap: 7, marginTop: 10, color: COLORS.inkSoft, fontSize: 13, lineHeight: 1.55 }}>{item.whyComparable.map((reason) => <li key={reason}>{reason}</li>)}</ul></section>
    {item.observations.length > 0 && <section style={{ marginTop: 20 }}><h3 style={{ fontSize: 13, fontWeight: 600 }}>Qué observamos</h3><ul style={{ paddingLeft: 18, display: "grid", gap: 7, marginTop: 10, color: COLORS.inkSoft, fontSize: 13, lineHeight: 1.55 }}>{item.observations.map((observation, index) => <li key={`${observation}-${index}`}>{observation}</li>)}</ul></section>}
    {item.differences.length > 0 && <section style={{ marginTop: 20 }}><h3 style={{ fontSize: 13, fontWeight: 600 }}>Diferencias respecto de tu negocio</h3><div style={{ display: "grid", gap: 8, marginTop: 10 }}>{item.differences.map((difference) => <p key={difference.key} style={{ color: COLORS.inkSoft, fontSize: 13, lineHeight: 1.55 }}>{difference.text}</p>)}</div></section>}
    {item.opportunity && <section style={{ marginTop: 20, paddingLeft: 14, borderLeft: `2px solid ${COLORS.blue}` }}><h3 style={{ fontSize: 13, fontWeight: 600 }}>Oportunidad que revela</h3><p style={{ color: COLORS.inkSoft, fontSize: 13, lineHeight: 1.55, marginTop: 6 }}>{item.opportunity.text}</p></section>}
    <EvidenceLinks item={item} />
  </Card>;
}

export default function CompetenciaPage() {
  const { competition, planTier, internalAccess, loading, error } = useDashboardData();
  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error} />;
  if (!hasEntitlement(planTier, "analysis.competitors", internalAccess) || !competition.entitled) return <div className="page-container"><PageHeader eyebrow="Mercado" title="Competencia" subtitle="Comparaciones con negocios realmente relevantes para tu contexto." /><UpgradePanel feature="analysis.competitors" /></div>;

  return <div className="page-container"><PageHeader eyebrow="Mercado" title="Competencia" subtitle="Con quién tiene sentido compararte y qué diferencias pudimos sostener con evidencia." action={<StatusBadge tone={competition.comparable.length ? "success" : "neutral"}>{competition.comparable.length} comparables</StatusBadge>} />
    {competition.context && <p style={{ color: COLORS.inkSoft, fontSize: 13, lineHeight: 1.6, marginBottom: 22 }}>{competition.context}</p>}

    {competition.comparable.length ? <section><h2 className="section-title" style={{ marginBottom: 14 }}>Negocios comparables</h2><div className="stack">{competition.comparable.map((item) => <ComparableBusiness key={item.name} item={item} />)}</div></section> : <EmptyState title="No encontramos suficientes negocios comparables" description="Los candidatos encontrados no tienen evidencia suficiente de categoría, modelo y ubicación para hacer una comparación confiable." />}

    {competition.probable.length > 0 && <section style={{ marginTop: 32 }}><h2 className="section-title">Posibles comparables por confirmar</h2><p className="section-description">Pueden ser relevantes, pero todavía falta evidencia para compararlos en las mismas condiciones.</p><div className="stack" style={{ marginTop: 14 }}>{competition.probable.map((item) => <Card key={item.name}><div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><div><h3 className="section-title" style={{ fontSize: 16 }}>{item.name}</h3>{item.location && <p style={{ color: COLORS.inkFaint, fontSize: 12, marginTop: 5 }}>{item.location}</p>}</div><StatusBadge tone="warning">Por confirmar</StatusBadge></div>{item.whyComparable.length > 0 && <p style={{ color: COLORS.inkSoft, fontSize: 13, lineHeight: 1.55, marginTop: 14 }}>{item.whyComparable.join(" · ")}</p>}<EvidenceLinks item={item} /></Card>)}</div></section>}
  </div>;
}
