import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { PriorityTag } from "@/components/ContentBits";
import { AndamentoPill } from "@/components/RequestBits";
import { requireProfile } from "@/lib/auth";
import { fmtDate } from "@/lib/dates";
import { REQUEST_ANDAMENTOS } from "@/lib/marketing-config";
import { listRequests, myProgress } from "@/lib/request-queries";

export default async function MinhasSolicitacoesPage({ searchParams }: { searchParams: { andamento?: string } }) {
  await requireProfile("vendedor");
  const [requests, progress] = await Promise.all([listRequests(), myProgress()]);
  const label = (id: string) => progress.get(id)?.progress ?? "Aguardando triagem";
  const list = requests.filter((r) => !searchParams.andamento || label(r.id) === searchParams.andamento);

  return (
    <>
      <PageHeader
        title="Solicitar material"
        breadcrumb={[{ label: "Vendedor" }, { label: "Solicitações" }]}
        actions={
          <ButtonLink href="/vendedor/solicitacoes/nova">
            <Plus size={16} /> Nova solicitação
          </ButtonLink>
        }
      />

      <form className="mb-6 flex gap-2">
        <Select name="andamento" defaultValue={searchParams.andamento ?? ""} className="w-60" aria-label="Andamento">
          <option value="">Todos os andamentos</option>
          {REQUEST_ANDAMENTOS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </Select>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      {list.length === 0 ? (
        <EmptyState>
          {requests.length === 0 ? "Você ainda não fez nenhuma solicitação." : "Nenhuma solicitação neste andamento."}
        </EmptyState>
      ) : (
        <Card className="divide-y divide-border">
          {list.map((r) => (
            <Link key={r.id} href={`/vendedor/solicitacoes/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-white/5">
              <div className="min-w-0">
                <p className="font-semibold">{r.title}</p>
                <p className="text-xs text-muted">
                  {r.request_type} · enviada em {fmtDate(r.created_at)}
                  {r.desired_by ? ` · preciso até ${r.desired_by.split("-").reverse().join("/")}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <PriorityTag priority={r.priority} />
                <AndamentoPill label={label(r.id)} />
              </div>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
