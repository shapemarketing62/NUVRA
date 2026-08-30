import { EmptyState, PageHeader } from "@/components/ui";

export default function NuvraAiPage() {
  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Asistencia"
        title="Nuvra AI"
        subtitle="Esta función todavía no está disponible como parte del producto."
      />
      <EmptyState
        title="Nuvra AI todavía no está habilitado"
        description="Cuando pueda trabajar de forma segura con el contexto real de tu negocio, aparecerá en la navegación correspondiente."
      />
    </div>
  );
}
