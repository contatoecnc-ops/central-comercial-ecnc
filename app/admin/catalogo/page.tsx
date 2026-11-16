import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { DeleteButton } from "@/components/DeleteButton";
import { deleteMachine } from "@/app/actions/machines";
import { requireProfile } from "@/lib/auth";
import { listMachines } from "@/lib/queries";

export default async function AdminCatalogoPage() {
  const me = await requireProfile(["admin", "marketing", "analista"]);
  const ro = me.role === "analista"; // somente leitura: sem criar, editar nem excluir
  const machines = await listMachines();
  return (
    <>
      <PageHeader
        title="Catálogo"
        breadcrumb={[{ label: "Admin" }, { label: "Catálogo" }]}
        actions={
          ro ? undefined : (
            <ButtonLink href="/admin/catalogo/nova">
              <Plus size={16} /> Nova máquina
            </ButtonLink>
          )
        }
      />
      {machines.length === 0 ? (
        <EmptyState>Nenhuma máquina cadastrada.</EmptyState>
      ) : (
        <Card className="divide-y divide-border">
          {machines.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                {ro ? (
                  <span className="font-semibold">{m.name}</span>
                ) : (
                  <Link href={`/admin/catalogo/${m.id}/editar`} className="font-semibold hover:text-brand">
                    {m.name}
                  </Link>
                )}
                <p className="text-xs text-muted">
                  {m.category} · ordem {m.sort_order} · {m.active ? "Publicada" : "Rascunho"}
                </p>
              </div>
              {!ro && (
                <div className="flex gap-2">
                  <ButtonLink href={`/admin/catalogo/${m.id}/editar`} variant="outline" size="sm">
                    <Pencil size={14} /> Editar
                  </ButtonLink>
                  <DeleteButton
                    action={deleteMachine.bind(null, m.id)}
                    confirmText={`Excluir "${m.name}" e toda a sua mídia?`}
                  />
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
