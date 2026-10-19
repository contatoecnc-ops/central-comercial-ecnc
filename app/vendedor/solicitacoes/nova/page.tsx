import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { RequestForm } from "@/components/RequestForm";
import { requireProfile } from "@/lib/auth";
import { listMachines } from "@/lib/queries";

export default async function NovaSolicitacaoPage() {
  await requireProfile("vendedor");
  const machines = await listMachines({ onlyActive: true });
  return (
    <>
      <PageHeader
        title="Nova solicitação"
        breadcrumb={[{ label: "Solicitações", href: "/vendedor/solicitacoes" }, { label: "Nova" }]}
      />
      <Card className="max-w-3xl p-6">
        <RequestForm machines={machines.map((m) => ({ id: m.id, name: m.name }))} />
      </Card>
    </>
  );
}
