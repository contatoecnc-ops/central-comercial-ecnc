import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { ContentForm } from "@/components/ContentForm";
import { ContentNav } from "@/components/ContentBits";
import { requireProfile } from "@/lib/auth";
import { countPendingApproval, listStaff } from "@/lib/content-queries";
import { listMachines } from "@/lib/queries";

export default async function NovoConteudoPage() {
  const me = await requireProfile(["admin", "marketing"]);
  const [machines, staff, pending] = await Promise.all([
    listMachines(),
    listStaff(),
    me.role === "admin" ? countPendingApproval() : 0,
  ]);
  return (
    <>
      <PageHeader title="Novo conteúdo" breadcrumb={[{ label: "Conteúdo", href: "/admin/conteudo" }, { label: "Novo" }]} />
      <ContentNav role={me.role} active="/admin/conteudo/novo" pending={pending} />
      <Card className="max-w-4xl p-6">
        <ContentForm
          machines={machines.map((m) => ({ id: m.id, label: m.name }))}
          staff={staff.map((s) => ({ id: s.id, label: s.full_name }))}
          defaults={{ assigned_to: me.role === "marketing" ? me.id : "" }}
        />
      </Card>
    </>
  );
}
