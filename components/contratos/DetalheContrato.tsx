import { notFound } from "next/navigation";
import { AlertTriangle, Info } from "lucide-react";
import { BlocoAnalise } from "@/components/analises/BlocoAnalise";
import { SeloAnaliseBadge } from "@/components/analises/Selo";
import { AcoesContrato } from "@/components/contratos/AcoesContrato";
import { NivelBadge, SeloSandbox, StatusContratoBadge } from "@/components/contratos/Bits";
import { DocumentosChecklist } from "@/components/contratos/DocumentosChecklist";
import { nomeCondicao } from "@/components/contratos/KanbanContratos";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { zapsignAtivo } from "@/lib/agente-contratos";
import { formatarCnpj, formatarCpf } from "@/lib/agente-contratos/lib/documentos";
import { formatarMoeda } from "@/lib/agente-contratos/lib/formatacao";
import { ANALISE_CREDITO_OBRIGATORIA, GESTOR_ASSINATURA } from "@/lib/contratos-config";
import { analisesDoContrato, type AnaliseDoContrato } from "@/lib/analise-credito/queries";
import { contratoParcelado, motivoBloqueioAprovacao, type SeloAnalise } from "@/lib/analise-credito/regras";
import { selosDeContratos } from "@/lib/analise-credito/servidor";
import { carregarContrato, listarEventos, type ContratoCompleto, type EventoContrato } from "@/lib/contratos/queries";
import { UUID_RE } from "@/lib/contratos/servidor";
import { fmtDateTime } from "@/lib/dates";

const ROTULO_EVENTO: Record<string, string> = {
  gerado: "Contrato gerado",
  analise_vinculada: "Análise de crédito vinculada",
  analise_desvinculada: "Análise de crédito desvinculada",
  regerado: "Contrato corrigido (volta para aprovação)",
  aprovado: "Aprovado",
  aprovacao_parcial: "Aprovação parcial",
  reprovado: "Reprovado",
  documento_conferido: "Documento conferido",
  documento_desmarcado: "Documento desmarcado",
  enviado_cliente: "Marcado como enviado ao cliente",
  enviado_zapsign: "Enviado para assinatura (ZapSign)",
  assinatura: "Assinatura registrada",
  assinado: "Assinado por todos",
  recusado_zapsign: "Assinatura RECUSADA",
  cancelado: "Cancelado",
};

const ROTULO_PAPEL: Record<string, string> = {
  cliente: "Cliente (comprador)",
  garantidor: "Garantidor solidário",
  testemunha_cliente: "Testemunha do cliente",
  testemunha: "Testemunha ECNC (vendedor)",
  contratada: "Gestor ECNC (contratada)",
};

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wide">{titulo}</h2>
      {children}
    </Card>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor?: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-1.5 text-sm sm:grid-cols-[11rem_1fr]">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted sm:pt-0.5">{rotulo}</dt>
      <dd className="min-w-0 whitespace-pre-line break-words">{valor || <span className="text-muted">—</span>}</dd>
    </div>
  );
}

export async function DetalheContrato({ id, papel, userId }: { id: string; papel: "admin" | "vendedor"; userId?: string }) {
  if (!UUID_RE.test(id)) notFound();
  const c = await carregarContrato(id); // client do usuário: o RLS já esconde contrato alheio
  if (!c || (papel === "vendedor" && c.vendedor_id !== userId)) notFound(); // 404 genérico
  const eventos = await listarEventos(c.id);
  const pagamento = (c.dados as { pagamento?: { parcelas?: number } } | undefined)?.pagamento;
  const parcelado = contratoParcelado(c.condicao_pagamento, pagamento);
  // O vendedor recebe só o estado do selo (sem validade) e nenhum dado nem evento da análise; o admin recebe o bloco completo.
  const selo = (await selosDeContratos([{ id: c.id, condicao_pagamento: c.condicao_pagamento, parcelas: pagamento?.parcelas }], { semValidade: papel === "vendedor" })).get(c.id) ?? null;
  const analises = papel === "admin" ? await analisesDoContrato(c.id) : [];
  const bloqueioAprovar = papel === "admin" ? motivoBloqueioAprovacao(parcelado, selo, ANALISE_CREDITO_OBRIGATORIA) : null;
  const visiveis = papel === "vendedor" ? eventos.filter((e) => !e.evento.startsWith("analise_")) : eventos;
  return <VisaoContrato c={c} eventos={visiveis} papel={papel} zap={zapsignAtivo()} selo={selo} parcelado={parcelado} analises={analises} bloqueioAprovar={bloqueioAprovar} />;
}

/** Parte visual do detalhe (sem acesso a dados). */
export function VisaoContrato({
  c,
  eventos,
  papel,
  zap,
  selo = null,
  parcelado = false,
  analises = [],
  bloqueioAprovar = null,
}: {
  c: ContratoCompleto;
  eventos: (EventoContrato & { quem: string })[];
  papel: "admin" | "vendedor";
  zap: boolean;
  selo?: SeloAnalise | null;
  parcelado?: boolean;
  analises?: AnaliseDoContrato[];
  bloqueioAprovar?: string | null;
}) {
  const v = c.variaveis ?? {};
  const d = c.dados;
  const docsPendentes = c.documentos.filter((x) => !x.recebido).map((x) => x.nome);
  const alertas = Array.from(new Set([...(c.motivos_nivel ?? []), ...(c.alertas ?? [])]));
  const doc = c.cliente_tipo_pessoa === "PJ" ? formatarCnpj(c.cliente_documento) : formatarCpf(c.cliente_documento);

  return (
    <>
      <PageHeader
        back={`/${papel}/contratos`}
        title={`Contrato ${c.numero}`}
        breadcrumb={[{ label: "Contratos", href: `/${papel}/contratos` }, { label: c.numero }]}
        actions={<SeloSandbox />}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <StatusContratoBadge status={c.status} />
        <NivelBadge nivel={c.nivel_aprovacao} motivos={c.motivos_nivel} />
        <SeloAnaliseBadge selo={selo} papel={papel} />
        <span className="text-sm text-muted">
          Vendedor: <span className="text-white">{c.vendedor_nome}</span> · Criado em {fmtDateTime(c.created_at)}
        </span>
      </div>

      {c.status === "reprovado" && c.motivo_reprovacao && (
        <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm">
          <p className="font-bold text-red-300">Reprovado</p>
          <p className="mt-1 whitespace-pre-line">{c.motivo_reprovacao}</p>
        </div>
      )}

      {alertas.length > 0 && (
        <div className="mb-6 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-yellow-300">
            <AlertTriangle size={16} /> Pontos de atenção
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {alertas.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {papel === "admin" && c.status === "aguardando_aprovacao" && (
        <div className="mb-6 space-y-2 rounded-lg border border-border bg-card p-4 text-sm">
          <p className="flex items-start gap-2">
            <Info size={16} className="mt-0.5 shrink-0 text-muted" />
            <span>
              <span className="font-semibold">Quem assina como gestor no ZapSign:</span>{" "}
              {GESTOR_ASSINATURA.nome || <span className="text-yellow-300">nome completo ainda não configurado</span>} ({GESTOR_ASSINATURA.email}),
              qualquer que seja o admin que aprovar.
            </span>
          </p>
          <p className="flex items-start gap-2 text-muted">
            <Info size={16} className="mt-0.5 shrink-0" />
            <span>
              Lembrete: a entrada entre 30% e 50% do valor à vista ainda não tem mínimo no agente. Confira a entrada (IV.6) antes de aprovar.
            </span>
          </p>
        </div>
      )}

      <div className="mb-8 rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">Ações</h2>
        <AcoesContrato
          id={c.id}
          status={c.status}
          papel={papel}
          zapsignAtivo={zap}
          temArquivo={!!c.arquivo_path}
          docsPendentes={docsPendentes}
          bloqueioAprovar={bloqueioAprovar}
        />
        {bloqueioAprovar && papel === "admin" && c.status === "aguardando_aprovacao" && (
          <p className="mt-3 text-xs text-yellow-300">Aprovar está desabilitado: {bloqueioAprovar}</p>
        )}
        {papel === "admin" && c.status === "aguardando_aprovacao" && docsPendentes.length > 0 && (
          <p className="mt-3 text-xs text-yellow-300">Aprovar está desabilitado: faltam documentos ({docsPendentes.join("; ")}).</p>
        )}
      </div>

      {papel === "admin" && (parcelado || analises.length > 0) && (
        <div className="mb-6">
          <BlocoAnalise contratoId={c.id} analises={analises} parcelado={parcelado} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Bloco titulo="Cliente">
          <dl>
            <Linha rotulo="Nome / razão social" valor={c.cliente_razao_social} />
            <Linha rotulo="Tipo" valor={c.cliente_tipo_pessoa === "PJ" ? "Pessoa jurídica" : "Pessoa física"} />
            <Linha rotulo={c.cliente_tipo_pessoa === "PJ" ? "CNPJ" : "CPF"} valor={doc} />
            <Linha rotulo="Inscrição estadual" valor={d?.contratante?.inscricao_estadual} />
            <Linha rotulo="Endereço" valor={v.CONTRATANTE_ENDERECO} />
            <Linha rotulo="E-mail" valor={d?.contratante?.email} />
            <Linha rotulo="Telefone" valor={d?.contratante?.telefone} />
          </dl>
        </Bloco>

        <Bloco titulo="Signatários">
          <dl>
            {(d?.signatarios ?? []).map((s, i) => (
              <Linha key={i} rotulo={i === 0 ? "Assina pelo comprador" : `Signatário ${i + 1}`} valor={`${s.nome} — ${s.cargo}\nCPF ${formatarCpf(s.cpf)} · ${s.email}`} />
            ))}
            <Linha rotulo="Garantidor solidário" valor={d?.garantidor ? `${d.garantidor.nome}\nCPF ${formatarCpf(d.garantidor.cpf)} · ${d.garantidor.email}` : undefined} />
            <Linha rotulo="Testemunha do cliente" valor={d?.testemunha_cliente ? `${d.testemunha_cliente.nome}\nCPF ${formatarCpf(d.testemunha_cliente.cpf)} · ${d.testemunha_cliente.email}` : undefined} />
            <Linha rotulo="Testemunha ECNC" valor={v.TESTEMUNHA_ECNC_NOME ? `${v.TESTEMUNHA_ECNC_NOME}\n${v.TESTEMUNHA_ECNC_EMAIL ?? ""}` : undefined} />
          </dl>
        </Bloco>

        <Bloco titulo="Equipamento">
          <dl>
            <Linha rotulo="Modelo" valor={d?.equipamento?.modelo} />
            <Linha rotulo="Tipo" valor={d?.equipamento?.tipo?.toUpperCase()} />
            <Linha rotulo="Potência / laser" valor={`${d?.equipamento?.potencia ?? ""} · ${d?.equipamento?.marca_laser ?? ""}`} />
            <Linha rotulo="Quantidade" valor={String(d?.equipamento?.quantidade ?? 1)} />
            <Linha rotulo="Preço (IV.3)" valor={v.IV3_PRECO_AQUISICAO} />
          </dl>
        </Bloco>

        <Bloco titulo="Acessórios e serviços (IV.4)">
          {d?.acessorios?.length ? (
            <ul className="space-y-1 text-sm">
              {d.acessorios.map((a, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>{a.descricao}</span>
                  <span className="tabular-nums text-muted">{a.valor_centavos ? formatarMoeda(a.valor_centavos) : "bonificação"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nenhum acessório.</p>
          )}
        </Bloco>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Bloco titulo="Quadro IV — como vai no contrato">
          <dl>
            <Linha rotulo="IV.3 Aquisição" valor={v.IV3_PRECO_AQUISICAO} />
            <Linha rotulo="IV.4 Acessórios" valor={v.IV4_ACESSORIOS} />
            <Linha rotulo="IV.5 Preço total" valor={v.IV5_PRECO_TOTAL} />
            <Linha rotulo="IV.6 Entrada" valor={v.IV6_VALOR_ENTRADA} />
            <Linha rotulo="IV.7 Prazo de entrega" valor={v.IV7_PRAZO_ENTREGA} />
            <Linha rotulo="IV.10 Valor da parcela" valor={v.IV10_VALOR_PARCELA} />
            <Linha rotulo="IV.11 Forma" valor={v.IV11_FORMA_PAGAMENTO} />
            <Linha rotulo="IV.12 Prestações" valor={v.IV12_QTD_PRESTACOES} />
            <Linha rotulo="Frete" valor={v.RESPONSAVEL_FRETE} />
            <Linha rotulo="Instalação" valor={v.RESPONSAVEL_INSTALACAO} />
          </dl>
        </Bloco>

        <Bloco titulo="Cláusula de pagamento">
          <p className="mb-3 text-xs text-muted">Condição: {nomeCondicao(c.condicao_pagamento)}</p>
          <p className="whitespace-pre-line text-sm leading-relaxed">{v.CLAUSULA_PAGAMENTO ?? v.CONDICAO_PAGAMENTO ?? "—"}</p>
        </Bloco>
      </div>

      {c.documentos.length > 0 && (
        <div className="mt-6">
          <Bloco titulo="Documentos exigidos">
            <DocumentosChecklist id={c.id} documentos={c.documentos} editavel={papel === "admin" && c.status === "aguardando_aprovacao"} />
          </Bloco>
        </div>
      )}

      {c.zapsign_assinantes && c.zapsign_assinantes.length > 0 && (
        <div className="mt-6">
          <Bloco titulo="Assinaturas (ZapSign)">
            <ol className="space-y-3">
              {c.zapsign_assinantes.map((a, i) => {
                // O vendedor não recebe o link do gestor: assinar como gestor é só do gestor.
                const mostrarLink = a.url && !a.assinou_em && !(papel === "vendedor" && a.papel === "contratada");
                return (
                  <li key={a.token ?? i} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs font-bold">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">{a.nome}</span> <span className="text-muted">· {ROTULO_PAPEL[a.papel] ?? a.papel}</span>
                    </span>
                    {a.assinou_em ? (
                      <span className="text-emerald-400">Assinou em {fmtDateTime(a.assinou_em)}</span>
                    ) : (
                      <span className="text-yellow-300">Aguardando</span>
                    )}
                    {mostrarLink && (
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-muted underline hover:text-brand">
                        Link de assinatura
                      </a>
                    )}
                  </li>
                );
              })}
            </ol>
          </Bloco>
        </div>
      )}

      <div className="mt-6">
        <Bloco titulo="Histórico">
          <ol className="space-y-2 text-sm">
            {eventos.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-3">
                <span className="w-40 shrink-0 text-xs text-muted">{fmtDateTime(e.em)}</span>
                <span className="font-medium">{ROTULO_EVENTO[e.evento] ?? e.evento}</span>
                <span className="text-muted">{e.quem}</span>
                {typeof e.detalhe?.motivo === "string" && <span className="basis-full pl-40 text-xs text-muted">Motivo: {e.detalhe.motivo}</span>}
              </li>
            ))}
          </ol>
        </Bloco>
      </div>
    </>
  );
}
