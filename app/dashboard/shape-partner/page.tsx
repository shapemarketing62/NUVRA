"use client";

import { useEffect, useState } from "react";
import { useDashboardData } from "@/lib/use-dashboard-data";
import { canAccessPartnerService } from "@/lib/product-navigation";
import { Btn, Card, EmptyState, ErrorState, PageHeader, PageSkeleton, StatusBadge } from "@/components/ui";
import { COLORS } from "@/lib/design-tokens";

type PartnerService = {
  status: "active" | "pending";
  nextDeliverable: { title: string; detail?: string | null } | null;
  activeWork: Array<{ id: string; title: string; detail?: string | null }>;
  milestones: Array<{ id: string; title: string; date?: string | null }>;
  clientNeeds: Array<{ id: string; title: string; detail?: string | null }>;
  nextReviewAt: string | null;
  results: Array<{ id: string; label: string; value: string }>;
};

function ServiceEmpty({ title, description }: { title: string; description: string }) {
  return <Card><h2 className="section-title" style={{ fontSize: 17 }}>{title}</h2><p className="section-description" style={{ marginTop: 8 }}>{description}</p></Card>;
}

function ServiceList({ title, items }: { title: string; items: Array<{ id: string; title: string; detail?: string | null }> }) {
  return <Card><h2 className="section-title" style={{ fontSize: 17 }}>{title}</h2><div className="stack" style={{ marginTop: 14 }}>{items.map((item) => <div key={item.id} style={{ paddingTop: 12, borderTop: `1px solid ${COLORS.line}` }}><strong style={{ fontSize: 14 }}>{item.title}</strong>{item.detail && <p className="section-description" style={{ marginTop: 5 }}>{item.detail}</p>}</div>)}</div></Card>;
}

export default function PartnerPage() {
  const { business, planTier, internalAccess, loading, error } = useDashboardData();
  const [service, setService] = useState<PartnerService | null>(null);
  const [serviceError, setServiceError] = useState("");
  const allowed = canAccessPartnerService(planTier, internalAccess);

  useEffect(() => {
    if (loading || !allowed || !business.id) return;
    let cancelled = false;
    fetch(`/api/partner/service?businessId=${encodeURIComponent(business.id)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error();
        return body.service as PartnerService;
      })
      .then((value) => { if (!cancelled) setService(value); })
      .catch(() => { if (!cancelled) setServiceError("No pudimos cargar el estado del servicio en este momento."); });
    return () => { cancelled = true; };
  }, [allowed, business.id, loading]);

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error} />;
  if (!allowed) {
    return (
      <div className="page-container">
        <PageHeader
          eyebrow="Servicio"
          title="Shape Partner"
          subtitle="Tu equipo de marketing externo: estrategia, ejecución y seguimiento junto a tu negocio."
        />
        <EmptyState
          title="Partner no está incluido en tu plan actual"
          description="Con NUVRA Pro recibís estrategia y prioridades para ejecutar. Partner suma un equipo humano que planifica, coordina y ejecuta con vos."
          action={<Btn onClick={() => { window.location.href = "/pricing"; }}>Conocer Partner</Btn>}
        />
      </div>
    );
  }
  if (serviceError) return <ErrorState message={serviceError} />;
  if (!service) return <PageSkeleton />;

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Servicio"
        title="Shape Partner"
        subtitle="Qué está haciendo el equipo de NUVRA/Shape por tu negocio."
        action={<StatusBadge tone={service.status === "active" ? "success" : "warning"}>{service.status === "active" ? "Servicio activo" : "Activación pendiente"}</StatusBadge>}
      />

      <div className="split-grid" style={{ marginBottom: 16 }}>
        {service.nextDeliverable ? (
          <Card><div className="page-eyebrow">Próximo entregable</div><h2 className="section-title">{service.nextDeliverable.title}</h2>{service.nextDeliverable.detail && <p className="section-description">{service.nextDeliverable.detail}</p>}</Card>
        ) : <ServiceEmpty title="Próximo entregable" description="El equipo todavía no cargó un próximo entregable." />}
        {service.nextReviewAt ? (
          <Card><div className="page-eyebrow">Próxima revisión</div><h2 className="section-title">{new Date(service.nextReviewAt).toLocaleDateString("es-AR")}</h2></Card>
        ) : <ServiceEmpty title="Próxima revisión" description="Todavía no hay una revisión o reunión programada." />}
      </div>

      <div className="split-grid" style={{ marginBottom: 16 }}>
        {service.activeWork.length ? <ServiceList title="Acciones en ejecución" items={service.activeWork} /> : <ServiceEmpty title="Acciones en ejecución" description="El equipo todavía no cargó trabajos en ejecución." />}
        {service.clientNeeds.length ? <ServiceList title="Qué necesitamos de vos" items={service.clientNeeds} /> : <ServiceEmpty title="Qué necesitamos de vos" description="No hay aprobaciones, materiales ni accesos pendientes." />}
      </div>

      {service.milestones.length ? <ServiceList title="Próximos hitos" items={service.milestones.map((item) => ({ ...item, detail: item.date ? new Date(item.date).toLocaleDateString("es-AR") : null }))} /> : <ServiceEmpty title="Próximos hitos" description="Todavía no hay hitos con fecha confirmada." />}

      {service.results.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <h2 className="section-title">Seguimiento</h2>
          <div className="metric-grid" style={{ marginTop: 18 }}>
            {service.results.map((result) => <div key={result.id}><div style={{ color: COLORS.inkSoft, fontSize: 12 }}>{result.label}</div><strong style={{ fontSize: 20 }}>{result.value}</strong></div>)}
          </div>
        </Card>
      )}
    </div>
  );
}
