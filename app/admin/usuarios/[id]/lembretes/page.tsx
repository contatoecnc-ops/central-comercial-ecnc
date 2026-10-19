import { requireProfile } from "@/lib/auth";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { RemindersManager } from "@/components/RemindersManager";
import { listRemindersForSeller } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

export default async function LembretesPage({ params }: { params: { id: string } }) {
  await requireProfile("admin");
  const supabase = createClient();
  const { data: seller } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", params.id)
    .maybeSingle();
  if (!seller || seller.role !== "vendedor") notFound();
  const reminders = await listRemindersForSeller(seller.id);

  return (
    <>
      <PageHeader
        title={`Lembretes — ${seller.full_name}`}
        breadcrumb={[{ label: "Usuários", href: "/admin/usuarios" }, { label: "Lembretes" }]}
      />
      <div className="max-w-3xl">
        <p className="mb-6 text-sm text-muted">
          Os lembretes ativos aparecem no topo do dashboard do vendedor. Ele só pode ler: não edita nem exclui.
        </p>
        <RemindersManager sellerId={seller.id} reminders={reminders} />
      </div>
    </>
  );
}
