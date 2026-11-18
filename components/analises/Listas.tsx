import Link from "next/link";
import { Download } from "lucide-react";
import { BotaoDesvincular, BotaoVincular } from "@/components/analises/AcoesAnalise";
import { Card, EmptyState } from "@/components/ui/card";
import { dataBR } from "@/lib/analise-credito/regras";
import type { AnaliseLinha } from "@/lib/analise-credito/queries";
import { fmtDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

const COR = {
  aprovada: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  reprovada: "border-red-500/50 bg-red-500/10 text-red-300",
  vencida: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
} as const;

export function EstadoBadge({ a }: { a: Pick<AnaliseLinha, "estado" | "resultado"> }) {
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium capitalize", COR[a.estado])}>
      {a.estado === "vencida" ? `Vencida (${a.resultado})` : a.estado}
    </span>
  );
}

function Paginacao({ base, pagina, total, porPagina }: { base: string; pagina: number; total: number; porPagina: number }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas <= 1) return null;
  const sep = base.includes("?") ? "&" : "?";
  return (
    <nav className="mt-4 flex items-center justify-between text-xs text-muted" aria-label="Paginação">
      <span>Página {pagina} de {paginas} · {total} análises</span>
      <span className="flex gap-3">
        {pagina > 1 && <Link className="font-semibold text-white hover:text-brand" href={`${base}${sep}pagina=${pagina - 1}`}>← Anterior</Link>}
        {pagina < paginas && <Link className="font-semibold text-white hover:text-brand" href={`${base}${sep}pagina=${pagina + 1}`}>Próxima →</Link>}
      </span>
    </nav>
  );
}

/** Lista dos envios do financeiro: situação "Aguardando contrato" ou "Vinculada", sem nenhum dado de contrato. */
export function ListaEnvios({ itens, total, pagina, porPagina, mostrarAutor }: { itens: AnaliseLinha[]; total: number; pagina: number; porPagina: number; mostrarAutor?: boolean }) {
  if (!itens.length) return <EmptyState>Nenhuma análise enviada ainda.</EmptyState>;
  return (
    <>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-semibold">Cliente</th>
              <th className="px-4 py-3 font-semibold">Documento</th>
              <th className="px-4 py-3 font-semibold">Resultado</th>
              <th className="px-4 py-3 font-semibold">Análise</th>
              <th className="px-4 py-3 font-semibold">Validade</th>
              <th className="px-4 py-3 font-semibold">Situação</th>
              {mostrarAutor && <th className="px-4 py-3 font-semibold">Enviado por</th>}
            </tr>
          </thead>
          <tbody>
            {itens.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-semibold">{a.cliente_nome}</td>
                <td className="px-4 py-3 text-muted">{a.documentos.map((d) => <div key={d}>{d}</div>)}</td>
                <td className="px-4 py-3"><EstadoBadge a={a} /></td>
                <td className="px-4 py-3 text-muted">{dataBR(a.analisada_em)}</td>
                <td className="px-4 py-3 text-muted">{dataBR(a.validade_ate)}</td>
                <td className="px-4 py-3">
                  {a.vinculos.length ? <span className="text-emerald-300">Vinculada</span> : <span className="text-yellow-300">Aguardando contrato</span>}
                </td>
                {mostrarAutor && <td className="px-4 py-3 text-muted">{a.enviado_por_nome}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Paginacao base="/financeiro/analises" pagina={pagina} total={total} porPagina={porPagina} />
    </>
  );
}

/** Caixa de entrada do admin: documento mascarado, com abrir PDF, vincular e desvincular. */
export function ListaCaixa({ itens, total, pagina, porPagina, base, aba }: { itens: AnaliseLinha[]; total: number; pagina: number; porPagina: number; base: string; aba: "aguardando" | "vinculadas" }) {
  if (!itens.length) return <EmptyState>{aba === "aguardando" ? "Nenhuma análise aguardando contrato." : "Nenhuma análise vinculada."}</EmptyState>;
  return (
    <>
      <div className="space-y-3">
        {itens.map((a) => (
          <Card key={a.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
              <div className="min-w-0">
                <p className="font-semibold">{a.cliente_nome}</p>
                <p className="text-xs text-muted">{a.documentos.join(" · ")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                <EstadoBadge a={a} />
                <span>Análise {dataBR(a.analisada_em)}</span>
                <span className={a.estado === "vencida" ? "font-semibold text-yellow-300" : ""}>
                  {a.estado === "vencida" ? "Vencida em " : "Vale até "}{dataBR(a.validade_ate)}
                </span>
                <span>Enviada por {a.enviado_por_nome} em {fmtDateTime(a.created_at)}</span>
              </div>
            </div>
            {a.vinculos.length > 0 && (
              <ul className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
                {a.vinculos.map((v) => (
                  <li key={v.contrato_id} className="flex flex-wrap items-center gap-3">
                    <Link href={`/admin/contratos/${v.contrato_id}`} className="font-semibold hover:text-brand">{v.numero}</Link>
                    <span className="min-w-0 flex-1 truncate text-muted">{v.cliente}</span>
                    <span className="text-xs text-muted">{v.origem === "automatico" ? "ligada automaticamente" : "ligada manualmente"}</span>
                    <BotaoDesvincular analiseId={a.id} contratoId={v.contrato_id} />
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap items-start gap-2">
              <a href={`/api/analises/${a.id}/arquivo`} className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold hover:bg-white/5">
                <Download size={14} /> Abrir PDF
              </a>
              <BotaoVincular analiseId={a.id} />
            </div>
          </Card>
        ))}
      </div>
      <Paginacao base={base} pagina={pagina} total={total} porPagina={porPagina} />
    </>
  );
}
