import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { ContentNav, PriorityTag } from "@/components/ContentBits";
import { requireProfile } from "@/lib/auth";
import { countPendingApproval, profileNames } from "@/lib/content-queries";
import { fmtDate } from "@/lib/dates";
import { listRequests, sortInbox } from "@/lib/request-queries";
import type { ContentRequest } from "@/types/database";

const STATUS_LABEL: Record<string, string> = { aprovada: "Aprovada", recusada: "Recusada", cancelada: "Cancelada" };

function Row({ r, seller, waiting }: { r: ContentRequest; seller?: string; waiting?: boolean }) {
  return (
    <Link href={`/admin/conteudo/solicitacoes/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-white/5">
      <div className="min-w-0">
        <p className="font-semibold">{r.title}</p>
        <p className="text-xs text-muted">
          {seller ?? "—"} · {r.request_type}
          {r.desired_by ? ` · prazo ${r.desired_by.split("-").reverse().join("/")}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted">
        <PriorityTag priority={r.priority} />
        {waiting ? (
          <span>parada há {formatDistanceToNow(new Date(r.created_at), { locale: ptBR })}</span>
        ) : (
          <span>
            {STATUS_LABEL[r.status]} · {fmtDate(r.decided_at ?? r.updated_at)}
          </span>
        )}
      </div>
    </Link>
  );
}

export default async function SolicitacoesInboxPage({ searchParams }: { searchParams: { vendedor?: string } }) {
  const me = await requireProfile("admin");
  const [all, pendingApprovals] = await Promise.all([listRequests(), countPendingApproval()]);
  const names = await profileNames(all.map((r) => r.requested_by));

  const novas = sortInbox(all.filter((r) => r.status === "nova"));
  const history = all
    .filter((r) => r.status !== "nova")
    .filter((r) => !searchParams.vendedor || r.requested_by === searchParams.vendedor);
  const sellers = Array.from(new Set(all.map((r) => r.requested_by)));

  return (
    <>
      <PageHeader title="Solicitações de material" breadcrumb={[{ label: "Conteúdo", href: "/admin/conteudo" }, { label: "Solicitações" }]} />
      <ContentNav role={me.role} active="/admin/conteudo/solicitacoes" pending={pendingApprovals} requests={novas.length} />

      <section className="mb-10 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide">
          Aguardando triagem <span className="text-muted">({novas.length})</span>
        </h2>
        {novas.length === 0 ? (
          <EmptyState>Nenhuma solicitação nova.</EmptyState>
        ) : (
          <Card className="divide-y divide-border border-brand/40">
            {novas.map((r) => (
              <Row key={r.id} r={r} seller={names.get(r.requested_by)} waiting />
            ))}
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide">Histórico</h2>
          <form className="flex gap-2">
            <Select name="vendedor" defaultValue={searchParams.vendedor ?? ""} className="w-52" aria-label="Vendedor">
              <option value="">Todos os vendedores</option>
              {sellers.map((id) => (
                <option key={id} value={id}>
                  {names.get(id) ?? "—"}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="outline" size="sm" className="h-10">
              Filtrar
            </Button>
          </form>
        </div>
        {history.length === 0 ? (
          <EmptyState>Nada no histórico.</EmptyState>
        ) : (
          <Card className="divide-y divide-border">
            {history.map((r) => (
              <Row key={r.id} r={r} seller={names.get(r.requested_by)} />
            ))}
          </Card>
        )}
      </section>
    </>
  );
}
