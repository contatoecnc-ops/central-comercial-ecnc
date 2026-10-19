import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ChannelChips, PriorityTag, StatusPill } from "@/components/ContentBits";
import { fmtDateTime } from "@/lib/dates";
import { countByStatus, listContent } from "@/lib/content-queries";
import { countNewRequests } from "@/lib/request-queries";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/marketing-config";
import type { ContentItem, Role } from "@/types/database";

function ItemList({ items, empty }: { items: ContentItem[]; empty: string }) {
  if (items.length === 0) return <p className="p-4 text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {items.slice(0, 8).map((i) => (
        <li key={i.id}>
          <Link href={`/admin/conteudo/${i.id}`} className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-white/5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {i.title} <PriorityTag priority={i.priority} className="ml-1 align-middle" />
              </p>
              <p className="text-xs text-muted">{i.scheduled_for ? fmtDateTime(i.scheduled_for) : "Sem data"}</p>
            </div>
            <div className="flex items-center gap-2">
              <ChannelChips channels={i.channels} />
              <StatusPill status={i.status} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Resumo da central de conteúdo: contagens, aprovações, ajustes, próximos 7 dias e atrasadas. */
export async function ContentSummary({ role }: { role: Role }) {
  const [counts, items, novas] = await Promise.all([countByStatus(), listContent(), role === "admin" ? countNewRequests() : 0]);
  const now = Date.now();
  const week = now + 7 * 24 * 3600 * 1000;
  const open = items.filter((i) => i.status !== "publicado" && i.status !== "arquivado");
  const waiting = items.filter((i) => i.status === "em_aprovacao");
  const changes = items.filter((i) => i.status === "ajustes");
  const next7 = open.filter((i) => i.scheduled_for && new Date(i.scheduled_for).getTime() >= now && new Date(i.scheduled_for).getTime() <= week);
  const urgent = open.filter((i) => i.priority === "urgente");
  const late = open.filter((i) => i.scheduled_for && new Date(i.scheduled_for).getTime() < now);

  const sections = [
    { title: "Aguardando aprovação", list: waiting, empty: "Nada aguardando aprovação.", highlight: role === "admin" && waiting.length > 0 },
    { title: "Ajustes pedidos", list: changes, empty: "Nenhum ajuste pendente.", highlight: role === "marketing" && changes.length > 0 },
    { title: "Próximos 7 dias", list: next7, empty: "Nenhuma publicação nos próximos 7 dias." },
    { title: "Atrasadas", list: late, empty: "Nenhuma publicação atrasada.", highlight: late.length > 0 },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {STATUS_ORDER.map((s) => (
          <Card key={s} className="p-3">
            <p className="text-2xl font-bold">{counts[s] ?? 0}</p>
            <p className="text-xs text-muted">{STATUS_LABEL[s]}</p>
          </Card>
        ))}
      </div>
      {role === "admin" && (
        <Link href="/admin/conteudo/solicitacoes" className="block">
          <Card className={novas > 0 ? "border-brand/60 p-4" : "p-4"}>
            <p className="text-2xl font-bold">{novas}</p>
            <p className="text-xs text-muted">Solicitações de vendedores aguardando triagem</p>
          </Card>
        </Link>
      )}
      <Link href="/admin/conteudo/quadro?prioridade=urgente" className="block">
        <Card className={urgent.length > 0 ? "border-[#E30613]/60 p-4" : "p-4"}>
          <p className="text-2xl font-bold">{urgent.length}</p>
          <p className="text-xs text-muted">Urgentes em aberto — ver no quadro</p>
        </Card>
      </Link>
      <div className="grid gap-4 lg:grid-cols-2">
        {sections.map((s) => (
          <Card key={s.title} className={s.highlight ? "border-brand/60" : undefined}>
            <h2 className="border-b border-border p-3 text-xs font-bold uppercase tracking-wide">
              {s.title} <span className="text-muted">({s.list.length})</span>
            </h2>
            <ItemList items={s.list} empty={s.empty} />
          </Card>
        ))}
      </div>
    </div>
  );
}
