import { requireProfile } from "@/lib/auth";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ButtonLink, Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { SLABadge } from "@/components/SLABadge";
import { PriorityBadge } from "@/components/PriorityBadge";
import { StatusBadge, statusLabels } from "@/components/StatusBadge";
import { listTasks, listVendedores } from "@/lib/queries";
import { getSLA, isOwnTask, sortTasks } from "@/lib/sla";
import { OriginBadge } from "@/components/OriginBadge";
import { fmtDateTime } from "@/lib/dates";

export default async function AdminTarefasPage({
  searchParams,
}: {
  searchParams: { vendedor?: string; status?: string; sla?: string; origem?: string };
}) {
  await requireProfile("admin");
  const [tasks, vendedores] = await Promise.all([
    listTasks({ assignedTo: searchParams.vendedor, status: searchParams.status }),
    listVendedores(false),
  ]);

  const filtered = sortTasks(tasks).filter((t) => {
    if (searchParams.origem === "gestor" && isOwnTask(t)) return false;
    if (searchParams.origem === "vendedor" && !isOwnTask(t)) return false;
    if (!searchParams.sla) return true;
    return getSLA(t.due_date, t.status).key === searchParams.sla;
  });

  return (
    <>
      <PageHeader
        title="Tarefas"
        breadcrumb={[{ label: "Admin" }, { label: "Tarefas" }]}
        actions={
          <ButtonLink href="/admin/tarefas/nova">
            <Plus size={16} /> Nova tarefa
          </ButtonLink>
        }
      />

      <form className="mb-6 grid gap-3 sm:grid-cols-5">
        <Select name="vendedor" defaultValue={searchParams.vendedor ?? ""}>
          <option value="">Todos os vendedores</option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.id}>
              {v.full_name}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={searchParams.status ?? ""}>
          <option value="">Todos os status</option>
          {Object.entries(statusLabels).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <Select name="sla" defaultValue={searchParams.sla ?? ""}>
          <option value="">Todos os SLAs</option>
          <option value="vencida">Vencidas</option>
          <option value="atencao">Vencendo hoje (≤ 24h)</option>
          <option value="no_prazo">No prazo</option>
        </Select>
        <Select name="origem" defaultValue={searchParams.origem ?? ""}>
          <option value="">Todas as origens</option>
          <option value="gestor">Atribuídas pelo gestor</option>
          <option value="vendedor">Criadas pelo vendedor</option>
        </Select>
        <div className="flex gap-2">
          <Button type="submit" variant="outline" className="flex-1">
            Filtrar
          </Button>
          <ButtonLink href="/admin/tarefas" variant="ghost">
            Limpar
          </ButtonLink>
        </div>
      </form>

      {filtered.length === 0 ? (
        <EmptyState>Nenhuma tarefa encontrada.</EmptyState>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Tarefa</th>
                <th className="px-4 py-3 font-semibold">Vendedor</th>
                <th className="px-4 py-3 font-semibold">Prioridade</th>
                <th className="px-4 py-3 font-semibold">SLA</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <Link href={`/admin/tarefas/${t.id}`} className="font-semibold hover:text-brand">
                      {t.title}
                    </Link>
                    {isOwnTask(t) && (
                      <span className="ml-2 align-middle">
                        <OriginBadge label="Criada pelo vendedor" />
                      </span>
                    )}
                    <p className="text-xs text-muted">
                      {t.category ? `${t.category} · ` : ""}
                      {fmtDateTime(t.due_date)}
                    </p>
                  </td>
                  <td className="px-4 py-3">{t.assignee?.full_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <PriorityBadge priority={t.priority} />
                  </td>
                  <td className="px-4 py-3">
                    <SLABadge dueDate={t.due_date} status={t.status} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ButtonLink href={`/admin/tarefas/${t.id}`} variant="outline" size="sm">
                      Abrir
                    </ButtonLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
