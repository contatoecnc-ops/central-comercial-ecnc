import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { MicheleAutoRefresh } from "@/components/MicheleAutoRefresh";
import { fmtHa, fmtTelefone } from "@/components/MicheleBits";
import { StatTileText } from "@/components/StatTileText";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { addDays, todayBR } from "@/lib/analysis/period";
import { getRelatorio, listEmAndamento } from "@/lib/michele/queries";
import type { MicheleAtendimentoLinha, MicheleRelatorio } from "@/types/database";

export const dynamic = "force-dynamic";

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

export default async function MichelePage() {
  await requireProfile("admin");
  const hoje = todayBR();
  const from = addDays(hoje, -6);

  let erro: string | null = null;
  let rel: MicheleRelatorio | null = null;
  let ativos: MicheleAtendimentoLinha[] = [];
  try {
    [rel, ativos] = await Promise.all([getRelatorio(from, hoje), listEmAndamento()]);
  } catch {
    erro = "Não foi possível carregar os atendimentos. Confira se a migração 010 foi aplicada.";
  }
  const now = Date.now();

  return (
    <>
      <MicheleAutoRefresh />
      <PageHeader
        title="Michele IA"
        breadcrumb={[{ label: "Admin" }, { label: "Michele IA" }]}
        actions={
          <>
            <ButtonLink href="/admin/michele/conversas" variant="outline" size="sm">
              Conversas
            </ButtonLink>
            <ButtonLink href="/admin/michele/relatorios" variant="outline" size="sm">
              Relatórios
            </ButtonLink>
          </>
        }
      />

      {erro && <EmptyState>{erro}</EmptyState>}

      {rel && (
        <>
          <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatTileText label="Atendimentos hoje" value={rel.hoje} />
            <StatTileText label="Em andamento agora" value={rel.em_andamento_agora} />
            <StatTileText label="Qualificados" value={rel.funil.aceitaram} hint="últimos 7 dias" />
            <StatTileText label="Recusaram" value={rel.funil.recusaram} hint="últimos 7 dias" />
            <StatTileText
              label="Taxa de conclusão"
              value={pct(rel.funil.chegaram_ao_fim, rel.funil.iniciaram)}
              hint={`${rel.funil.chegaram_ao_fim} de ${rel.funil.iniciaram} · 7 dias`}
            />
          </div>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Em andamento</h2>
            {ativos.length === 0 ? (
              <EmptyState>Nenhum atendimento em andamento (mensagem nas últimas 24 h).</EmptyState>
            ) : (
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted">
                      <th className="px-4 py-2.5 font-semibold">Lead</th>
                      <th className="px-4 py-2.5 font-semibold">Telefone</th>
                      <th className="px-4 py-2.5 font-semibold">Campanha</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Última mensagem</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Msgs do lead</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ativos.map((a) => (
                      <tr key={a.id} className="border-b border-border/60 last:border-0 hover:bg-white/5">
                        <td className="px-4 py-2.5 font-medium">
                          <Link href={`/admin/michele/conversas/${a.id}`} className="hover:text-brand">
                            {a.nome || "Sem nome"}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{fmtTelefone(a.telefone)}</td>
                        <td className="max-w-[16rem] truncate px-4 py-2.5 text-muted">{a.campanha || "—"}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{fmtHa(a.ultima_atividade_em, now)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{a.msgs_lead}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
            <p className="mt-3 text-xs text-muted">
              Atualiza sozinho a cada 30 s. Atendimentos sem mensagem há mais de 24 h aparecem como “abandonado” nas conversas.
            </p>
          </section>
        </>
      )}
    </>
  );
}
