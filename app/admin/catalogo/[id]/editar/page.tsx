import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { MachineForm } from "@/components/MachineForm";
import { getMachine } from "@/lib/queries";

export default async function EditarMaquinaPage({ params }: { params: { id: string } }) {
  const { machine, media } = await getMachine(params.id);
  return (
    <>
      <PageHeader
        title={`Editar ${machine.name}`}
        breadcrumb={[{ label: "Catálogo", href: "/admin/catalogo" }, { label: "Editar" }]}
      />
      <Card className="max-w-4xl p-6">
        <MachineForm
          machineId={machine.id}
          defaults={{
            name: machine.name,
            category: machine.category,
            tagline: machine.tagline ?? "",
            description: machine.description ?? "",
            thumbnail_url: machine.thumbnail_url ?? "",
            active: machine.active,
            sort_order: machine.sort_order,
            specs: machine.specs ?? [],
            media: media.map((m) => ({ type: m.type, title: m.title, url: m.url })),
          }}
        />
      </Card>
    </>
  );
}
