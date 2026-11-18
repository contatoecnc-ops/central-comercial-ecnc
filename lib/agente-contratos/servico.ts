import {
  enviarParaAssinatura, lerEventoZapsign,
  type Assinante, type ConfigZapsign, type PessoaInterna,
} from "./lib/zapsign";
import { APROVACAO, NUMERACAO } from "./config/empresa";
import { modeloDoTipo } from "./config/modelos";
import type { DadosReceita } from "./lib/cnpj-api";
import { somenteDigitos } from "./lib/documentos";
import { hojeBrasilia } from "./lib/formatacao";
import { conferirPreenchimento, gerarDocx, verificarModelo } from "./lib/gerador-docx";
import { validarContrato } from "./lib/validacao";
import { montarVariaveis, VARIAVEIS_OPCIONAIS } from "./lib/variaveis";
import type { DocumentoExigido, RegistroContrato, Repositorio } from "./repositorio/tipos";
import type { DadosContratoEntrada } from "./tipos";

/** Vendedor — CPF, e-mail e celular entram no contrato como testemunha ECNC (perfil na Central). */
export interface Vendedor { id: string; nome: string; cpf?: string; email?: string; celular?: string }
export interface Aprovador { id: string; papel: string }

export function formatarNumero(ano: number, seq: number, formato = NUMERACAO.formato): string {
  return formato
    .replace("{ANO}", String(ano))
    .replace("{AA}", String(ano).slice(-2))
    .replace("{SEQ4}", String(seq).padStart(4, "0"))
    .replace("{SEQ}", String(seq));
}

export type ResultadoGerar =
  | { ok: false; erros: string[]; alertas: string[] }
  | { ok: true; contrato: RegistroContrato; alertas: string[]; faltando_no_modelo: string[] };

/**
 * Valida, calcula o nível de aprovação, reserva o número, gera o .docx e deixa
 * "aguardando_aprovacao". Com `contrato_id` (correção), mantém o MESMO número;
 * as aprovações são zeradas porque os dados mudaram.
 */
export async function gerarContratoParaAprovacao(p: {
  repo: Repositorio;
  dados: DadosContratoEntrada;
  vendedor: Vendedor;
  receita?: DadosReceita;
  contrato_id?: string;
  data_contrato?: string;
}): Promise<ResultadoGerar> {
  const data = p.data_contrato ?? hojeBrasilia();
  const v = validarContrato(p.dados, { receita: p.receita, data_contrato: data });
  if (!v.ok || !v.dados || !v.pagamento) return { ok: false, erros: v.erros, alertas: v.alertas };
  // O modelo sai do tipo de máquina — a IA não escolhe.
  const modelo = modeloDoTipo(v.dados.equipamento.tipo);
  if (!modelo)
    return { ok: false, erros: [`Ainda não há modelo de contrato para máquina "${v.dados.equipamento.tipo}" — fale com o gestor.`], alertas: v.alertas };
  const modelo_id = modelo.id;

  let existente: RegistroContrato | null = null;
  if (p.contrato_id) {
    existente = await p.repo.buscarContrato(p.contrato_id);
    if (!existente) return { ok: false, erros: ["Contrato a corrigir não encontrado."], alertas: [] };
    if (!["aguardando_aprovacao", "reprovado"].includes(existente.status))
      return { ok: false, erros: [`Contrato ${existente.numero} está "${existente.status}" e não pode mais ser alterado pelo agente.`], alertas: [] };
  }

  // Confere se TODOS os campos do modelo vão sair preenchidos — antes de gastar número.
  const arquivoModelo = await p.repo.carregarModelo(modelo_id);
  const montar = (numero: string) =>
    montarVariaveis({ numero, data_contrato: data, dados: v.dados!, pagamento: v.pagamento!, vendedor: p.vendedor });
  const problemas = conferirPreenchimento(arquivoModelo, montar("CONFERENCIA"), VARIAVEIS_OPCIONAIS, modelo.mapa);
  if ((v.dados.equipamento.quantidade ?? 1) > 1 && !verificarModelo(arquivoModelo, modelo.mapa).usadas.includes("EQUIPAMENTO_QUANTIDADE"))
    problemas.push(`O contrato "${modelo.nome}" é para 1 unidade — para mais de uma máquina, fale com o gestor.`);
  if (problemas.length) return { ok: false, erros: problemas, alertas: v.alertas };

  const ano = Number(data.slice(0, 4));
  const chaveSequencia = NUMERACAO.reinicia_por_ano ? ano : 0;
  const numero = existente?.numero ?? formatarNumero(ano, await p.repo.reservarNumero(chaveSequencia));

  const variaveis = montar(numero);
  const { arquivo, faltando } = gerarDocx(arquivoModelo, variaveis, modelo.mapa);
  if (faltando.length) throw new Error(`Erro interno: campos sem preencher após a conferência: ${faltando.join(", ")}`);
  const alertas = [...v.alertas];

  // O aviso vai no nome do arquivo: é o que o gestor vê na lista do ZapSign ao assinar.
  const nivel = v.pagamento.nivel;
  const prefixo = nivel === 3 ? "ATENÇÃO MÁXIMA - " : nivel === 2 ? "ATENÇÃO - " : "";
  const nomeArquivo = `${prefixo}${numero} - ${v.dados.contratante.razao_social}`.replace(/[\\/:*?"<>|]/g, "-");
  const arquivo_path = await p.repo.salvarArquivo(`${ano}/${nomeArquivo}.docx`, arquivo);

  // Documentos exigidos — mantém os já conferidos numa correção.
  const documentos: DocumentoExigido[] = v.pagamento.documentos.map(
    (nome) => existente?.documentos?.find((d) => d.nome === nome) ?? { nome, recebido: false },
  );

  const precisaAprovacao = APROVACAO.modo === "todos" || (APROVACAO.modo === "atencao" && nivel >= 2);
  const agora = new Date().toISOString();

  const base = {
    numero,
    status: precisaAprovacao ? ("aguardando_aprovacao" as const) : ("aprovado" as const),
    vendedor_id: p.vendedor.id,
    vendedor_nome: p.vendedor.nome,
    cliente_razao_social: v.dados.contratante.razao_social,
    cliente_tipo_pessoa: v.dados.contratante.tipo_pessoa,
    cliente_documento: somenteDigitos(v.dados.contratante.documento),
    valor_total_centavos: v.dados.preco_total_centavos,
    condicao_pagamento: v.dados.pagamento.condicao,
    dados: v.dados,
    variaveis,
    alertas,
    nivel_aprovacao: v.pagamento.nivel,
    motivos_nivel: v.pagamento.motivos_nivel,
    aprovacoes_necessarias: precisaAprovacao ? [APROVACAO.papel] : [],
    aprovacoes: [],
    documentos,
    modelo_id,
    arquivo_path,
    motivo_reprovacao: undefined,
    aprovado_em: precisaAprovacao ? undefined : agora,
  };
  const contrato = existente ? await p.repo.atualizarContrato(existente.id, base) : await p.repo.criarContrato(base);
  await p.repo.registrarEvento(contrato.id, existente ? "regerado" : "gerado", p.vendedor.id, { nivel, precisa_aprovacao: precisaAprovacao, alertas });
  return { ok: true, contrato, alertas, faltando_no_modelo: faltando };
}

const pendentes = (c: RegistroContrato) => ({
  papeis: c.aprovacoes_necessarias.filter((p) => !c.aprovacoes.some((a) => a.papel === p)),
  documentos: c.documentos.filter((d) => !d.recebido).map((d) => d.nome),
});

/** O que ainda falta para o contrato ficar pronto para envio. */
export const pendenciasAprovacao = pendentes;

/** Marca um documento exigido como conferido (tela do admin). */
export async function marcarDocumento(repo: Repositorio, contrato_id: string, nome: string, recebido: boolean, por: string, arquivo_path?: string) {
  const c = await repo.buscarContrato(contrato_id);
  if (!c) throw new Error("Contrato não encontrado");
  if (c.status !== "aguardando_aprovacao") throw new Error(`Contrato está "${c.status}"`);
  if (!c.documentos.some((d) => d.nome === nome)) throw new Error(`Documento "${nome}" não é exigido neste contrato.`);
  const documentos = c.documentos.map((d) =>
    d.nome === nome ? { ...d, recebido, por, em: new Date().toISOString(), arquivo_path: arquivo_path ?? d.arquivo_path } : d,
  );
  const r = await repo.atualizarContrato(contrato_id, { documentos });
  await repo.registrarEvento(contrato_id, recebido ? "documento_conferido" : "documento_desmarcado", por, { nome });
  return r;
}

/**
 * Aprovação do gestor comercial. Vira "aprovado" (pronto para enviar ao cliente)
 * quando todos os papéis exigidos aprovaram e os documentos exigidos foram conferidos.
 */
export async function aprovarContrato(repo: Repositorio, contrato_id: string, aprovador: Aprovador) {
  const c = await repo.buscarContrato(contrato_id);
  if (!c) throw new Error("Contrato não encontrado");
  if (c.status !== "aguardando_aprovacao") throw new Error(`Contrato está "${c.status}"`);
  if (!c.aprovacoes_necessarias.includes(aprovador.papel))
    throw new Error(`Este contrato precisa de aprovação de: ${c.aprovacoes_necessarias.join(" + ")}. Seu papel: ${aprovador.papel}.`);
  if (c.aprovacoes.some((a) => a.papel === aprovador.papel)) throw new Error(`Já aprovado por ${aprovador.papel}.`);
  const docsPendentes = pendentes(c).documentos;
  if (docsPendentes.length) throw new Error(`Faltam documentos: ${docsPendentes.join("; ")}.`);

  const aprovacoes = [...c.aprovacoes, { papel: aprovador.papel, por: aprovador.id, em: new Date().toISOString() }];
  const completo = c.aprovacoes_necessarias.every((p) => aprovacoes.some((a) => a.papel === p));
  const r = await repo.atualizarContrato(contrato_id, {
    aprovacoes,
    ...(completo ? { status: "aprovado" as const, aprovado_em: new Date().toISOString() } : {}),
  });
  await repo.registrarEvento(contrato_id, completo ? "aprovado" : "aprovacao_parcial", aprovador.id, { papel: aprovador.papel });
  return r;
}

export async function reprovarContrato(repo: Repositorio, contrato_id: string, aprovador: Aprovador, motivo: string) {
  if (!motivo?.trim()) throw new Error("Informe o motivo da reprovação.");
  const c = await repo.buscarContrato(contrato_id);
  if (!c) throw new Error("Contrato não encontrado");
  if (c.status !== "aguardando_aprovacao") throw new Error(`Contrato está "${c.status}"`);
  if (!c.aprovacoes_necessarias.includes(aprovador.papel)) throw new Error(`Papel ${aprovador.papel} não aprova este contrato.`);
  const r = await repo.atualizarContrato(contrato_id, { status: "reprovado", motivo_reprovacao: motivo, aprovacoes: [] });
  await repo.registrarEvento(contrato_id, "reprovado", aprovador.id, { papel: aprovador.papel, motivo });
  return r;
}

/** Kanban: vendedor marca que enviou ao cliente (até o ZapSign estar ligado, é manual). */
export async function marcarEnviado(repo: Repositorio, contrato_id: string, por: string) {
  const c = await repo.buscarContrato(contrato_id);
  if (!c) throw new Error("Contrato não encontrado");
  if (c.status !== "aprovado") throw new Error(c.status === "aguardando_aprovacao" ? "Contrato ainda não foi aprovado — não envie ao cliente." : `Contrato está "${c.status}"`);
  const r = await repo.atualizarContrato(contrato_id, { status: "enviado_cliente", enviado_em: new Date().toISOString() });
  await repo.registrarEvento(contrato_id, "enviado_cliente", por);
  return r;
}

/** Kanban: todas as assinaturas feitas (manual hoje; webhook do ZapSign depois). */
export async function marcarAssinado(repo: Repositorio, contrato_id: string, por: string) {
  const c = await repo.buscarContrato(contrato_id);
  if (!c) throw new Error("Contrato não encontrado");
  if (c.status !== "enviado_cliente") throw new Error(`Contrato está "${c.status}"`);
  const r = await repo.atualizarContrato(contrato_id, { status: "assinado", assinado_em: new Date().toISOString() });
  await repo.registrarEvento(contrato_id, "assinado", por);
  return r;
}

/** Cancela (venda desfeita). O número continua ocupado — nunca é reaproveitado. */
export async function cancelarContrato(repo: Repositorio, contrato_id: string, por: string, motivo: string) {
  if (!motivo?.trim()) throw new Error("Informe o motivo do cancelamento.");
  const c = await repo.buscarContrato(contrato_id);
  if (!c) throw new Error("Contrato não encontrado");
  if (c.status === "assinado" || c.status === "cancelado") throw new Error(`Contrato está "${c.status}"`);
  const r = await repo.atualizarContrato(contrato_id, { status: "cancelado" });
  await repo.registrarEvento(contrato_id, "cancelado", por, { motivo });
  return r;
}

// ---------------------------------------------------------------- ZapSign


/**
 * Botão "Enviar para assinatura" (contrato aprovado): cria no ZapSign, que manda
 * os links por e-mail na ordem cliente → testemunha → gestor. Card vai para "Com o cliente".
 */
export async function enviarContratoParaAssinatura(
  repo: Repositorio, contrato_id: string, por: string, cfg: ConfigZapsign,
  internos: { vendedor: PessoaInterna; gestor: PessoaInterna },
) {
  const c = await repo.buscarContrato(contrato_id);
  if (!c) throw new Error("Contrato não encontrado");
  if (c.zapsign_doc_token) throw new Error(`Contrato ${c.numero} já foi enviado ao ZapSign.`);
  const { doc_token, assinantes } = await enviarParaAssinatura(cfg, c, internos);
  const r = await repo.atualizarContrato(contrato_id, {
    status: "enviado_cliente", enviado_em: new Date().toISOString(), zapsign_doc_token: doc_token, zapsign_assinantes: assinantes,
  });
  await repo.registrarEvento(contrato_id, "enviado_zapsign", por, { doc_token, ambiente: cfg.ambiente });
  return { contrato: r, assinantes };
}

export interface ResultadoWebhook {
  /** O que aconteceu, para a Central decidir quem avisar. */
  acao: "ignorado" | "assinatura" | "vez_do_gestor" | "assinado" | "recusado";
  contrato?: RegistroContrato;
  quem?: string;
}

/**
 * Webhook do ZapSign. Cada assinatura dispara um doc_signed.
 *  - vendedor (testemunha) assinou → "vez_do_gestor" (avisar o gestor no Telegram com os pontos de atenção)
 *  - todos assinaram → contrato "assinado"
 *  - recusado → evento + aviso
 */
export async function processarWebhookZapsign(repo: Repositorio, payload: unknown): Promise<ResultadoWebhook> {
  const ev = lerEventoZapsign(payload);
  if (!ev.contrato_id) return { acao: "ignorado" };
  const c = await repo.buscarContrato(ev.contrato_id);
  if (!c || (c.zapsign_doc_token && ev.doc_token && c.zapsign_doc_token !== ev.doc_token)) return { acao: "ignorado" };

  if (ev.tipo === "doc_refused") {
    await repo.registrarEvento(c.id, "recusado_zapsign", "zapsign", { quem: ev.quem_assinou });
    return { acao: "recusado", contrato: c, quem: ev.quem_assinou?.nome };
  }
  if (ev.tipo !== "doc_signed") return { acao: "ignorado", contrato: c };

  const email = ev.quem_assinou?.email?.toLowerCase();
  const assinantes = (c.zapsign_assinantes ?? []).map((a) =>
    email && a.email.toLowerCase() === email && !a.assinou_em ? { ...a, assinou_em: new Date().toISOString() } : a,
  );
  const quem = assinantes.find((a) => email && a.email.toLowerCase() === email);
  await repo.registrarEvento(c.id, "assinatura", "zapsign", { nome: ev.quem_assinou?.nome, papel: quem?.papel });

  if (ev.todos_assinaram) {
    if (c.status === "assinado") return { acao: "ignorado", contrato: c }; // reenvio do webhook
    const r = await repo.atualizarContrato(c.id, { status: "assinado", assinado_em: new Date().toISOString(), zapsign_assinantes: assinantes });
    await repo.registrarEvento(c.id, "assinado", "zapsign");
    return { acao: "assinado", contrato: r, quem: ev.quem_assinou?.nome };
  }
  const r = await repo.atualizarContrato(c.id, { zapsign_assinantes: assinantes });
  return { acao: quem?.papel === "testemunha" ? "vez_do_gestor" : "assinatura", contrato: r, quem: ev.quem_assinou?.nome };
}

export type { Assinante };
