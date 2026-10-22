import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { MicheleStatusBadge, MicheleTempBadge, fmtHa, fmtTelefone } from "@/components/MicheleBits";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { requireProfile } from "@/lib/auth";
import { fmtDateTime } from "@/lib/dates";
import { PAGE_SIZE, STATUS_FILTROS, STATUS_LABEL, TEMPERATURA_FILTROS, TEMPERATURA_LABEL } from "@/lib/michele/config";
import { listCampanhas, listConversas, type ConversaFiltros } from "@/lib/michele/queries";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

function href(sp: SP, page: number) {
  const p = new URLSearchParams();
  for (const k of ["q", "status", "temperatura", "campanha", "from", "to"]) if (sp[k]) p.set(k, sp[k]!);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return `/admin/michele/conversas${s ? `?${s}` : ""}`;
}

export default async function ConversasPage({ searchParams }: { searchParams: SP }) {
  await requireProfile("admin");
  const filtros: ConversaFiltros = {
    q: searchParams.q,
    status: searchParams.status,
    temperatura: searchParams.temperatura,
    campanha: searchParams.campanha,
    from: searchParams.from,
    to: searchParams.to,
    page: Number(searchParams.page) || 1,
  };

  let erro: string | null = null;
  let res: Awaited<ReturnType<typeof listConversas>> | null = null;
  let campanhas: string[] = [];
  try {
    [res, campanhas] = await Promise.all([listConversas(filtros), listCampanhas()]);
  } catch {
    erro = "Não foi possível carregar as conversas. Confira se a migração 010 foi aplicada.";
  }
  const now = Date.now();
  const pages = res ? Math.max(1, Math.ceil(res.total / PAGE_SIZE)) : 1;

  return (
    <>
      <PageHeader title="Conversas" breadcrumb={[{ label: "Admin" }, { label: "Michele IA", href: "/admin/michele" }, { label: "Conversas" }]} />

      <form method="get" className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Input name="q" defaultValue={searchParams.q} placeholder="Nome ou telefone" className="col-span-2" />
        <Select name="status" defaultValue={searchParams.status ?? ""} aria-label="Status">
          <option value="">Todos os status</option>
          {STATUS_FILTROS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select name="temperatura" defaultValue={searchParams.temperatura ?? ""} aria-label="Temperatura">
          <option value="">Toda temperatura</option>
          {TEMPERATURA_FILTROS.map((t) => (
            <option key={t} value={t}>
              {TEMPERATURA_LABEL[t]}
            </option>
          ))}
        </Select>
        <Select name="campanha" defaultValue={searchParams.campanha ?? ""} aria-label="Campanha" className="col-span-2 md:col-span-1">
          <option value="">Todas as campanhas</option>
          {campanhas.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <div className="col-span-2 flex items-center gap-2 md:col-span-1">
          <Input type="date" name="from" defaultValue={searchParams.from} aria-label="De" />
          <Input type="date" name="to" defaultValue={searchParams.to} aria-label="Até" />
        </div>
        <div className="col-span-2 flex gap-2 md:col-span-6">
          <Button type="submit" variant="outline" size="md">
            Filtrar
          </Button>
          <ButtonLink href="/admin/michele/conversas" variant="ghost" size="md">
            Limpar
          </ButtonLink>
        </div>
      </form>

      {erro && <EmptyState>{erro}</EmptyState>}

      {res &&
        (res.rows.length === 0 ? (
          <EmptyState>Nenhuma conversa encontrada.</EmptyState>
        ) : (
          <>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="px-4 py-2.5 font-semibold">Lead</th>
                    <th className="px-4 py-2.5 font-semibold">Telefone</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Temp.</th>
                    <th className="px-4 py-2.5 font-semibold">Campanha</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Msgs</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Iniciada</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Última msg</th>
                  </tr>
                </thead>
                <tbody>
                  {res.rows.map((a) => (
                    <tr key={a.id} className="border-b border-border/60 last:border-0 hover:bg-white/5">
                      <td className="px-4 py-2.5 font-medium">
                        <Link href={`/admin/michele/conversas/${a.id}`} className="hover:text-brand">
                          {a.nome || "Sem nome"}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{fmtTelefone(a.telefone)}</td>
                      <td className="px-4 py-2.5">
                        <MicheleStatusBadge status={a.status_efetivo} />
                      </td>
                      <td className="px-4 py-2.5">
                        <MicheleTempBadge temperatura={a.temperatura} />
                      </td>
                      <td className="max-w-[14rem] truncate px-4 py-2.5 text-muted">{a.campanha || "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{a.msgs_total}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-muted">{fmtDateTime(a.iniciado_em)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{fmtHa(a.ultima_atividade_em, now)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <nav className="mt-4 flex items-center justify-between text-sm text-muted">
              <span>
                {res.total} {res.total === 1 ? "conversa" : "conversas"} · página {res.page} de {pages}
              </span>
              <span className="flex gap-2">
                {res.page > 1 && (
                  <ButtonLink href={href(searchParams, res.page - 1)} variant="outline" size="sm">
                    Anterior
                  </ButtonLink>
                )}
                {res.page < pages && (
                  <ButtonLink href={href(searchParams, res.page + 1)} variant="outline" size="sm">
                    Próxima
                  </ButtonLink>
                )}
              </span>
            </nav>
          </>
        ))}
    </>
  );
}
