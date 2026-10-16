import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { MachineForm } from "@/components/MachineForm";

export default function NovaMaquinaPage() {
  return (
    <>
      <PageHeader
        title="Nova máquina"
        breadcrumb={[{ label: "Catálogo", href: "/admin/catalogo" }, { label: "Nova" }]}
      />
      <Card className="max-w-4xl p-6">
        <MachineForm />
      </Card>
    </>
  );
}
