import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { CONDICOES, NIVEIS, type Nivel } from "../config/condicoes-pagamento";
import { reconhecerFamilia } from "../config/equipamentos";
import { cnpjValido, formatarCnpj, somenteDigitos } from "../lib/documentos";
import type { ConsultaCnpj, DadosReceita } from "../lib/cnpj-api";
import { formatarMoeda, hojeBrasilia } from "../lib/formatacao";
import { calcularPagamento, descreverParcelas, type ResultadoPagamento } from "../lib/pagamento";
import { validarContrato } from "../lib/validacao";
import type { Repositorio } from "../repositorio/tipos";
import { gerarContratoParaAprovacao, type Vendedor } from "../servico";
import { DadosContratoSchema, PagamentoSchema } from "../tipos";

/** Estado da conversa — serializável, a Central guarda junto com as mensagens. */
export interface EstadoAgente {
  receitas: Record<string, DadosReceita>; // por CNPJ (só dígitos)
  contrato_id?: string;
  contrato_numero?: string;
}

export interface ContextoFerramentas {
  repo: Repositorio;
  vendedor: Vendedor;
  consultarCnpj: ConsultaCnpj;
  estado: EstadoAgente;
  hoje?: string;
}

const jsonSchema = (schema: z.ZodType) => {
  const j = z.toJSONSchema(schema, { io: "input" }) as any;
  delete j.$schema;
  return j;
};
const dadosJsonSchema = jsonSchema(DadosContratoSchema);
const pagamentoJsonSchema = jsonSchema(PagamentoSchema);
pagamentoJsonSchema.properties.condicao.enum = CONDICOES.map((c) => c.id);

/** Resumo do pagamento para a IA mostrar ao vendedor. */
const resumoPagamento = (r: ResultadoPagamento, final?: { nivel?: Nivel; motivos_nivel?: string[] }) => ({
  condicao: r.condicao?.nome,
  forma_pagamento_IV11: r.campos?.forma_pagamento,
  valor_entrada_IV6: r.campos?.valor_entrada,
  valor_parcela_IV10: r.campos?.valor_parcela,
  quantidade_IV12: r.campos?.quantidade_prestacoes,
  resumo: r.campos?.condicao_resumo,
  saldo: formatarMoeda(r.saldo_centavos),
  parcelas: r.parcelas_centavos.length ? descreverParcelas(r.parcelas_centavos) : undefined,
  nivel_atencao: final?.nivel ?? r.nivel,
  nivel_nome: NIVEIS[final?.nivel ?? r.nivel].nome,
  motivos_nivel: final?.motivos_nivel ?? r.motivos_nivel,
  documentos_exigidos: r.documentos,
  pontos_atencao: r.condicao?.pontos_atencao,
});

export const FERRAMENTAS: Anthropic.Tool[] = [
  {
    name: "consultar_cnpj",
    description: "Só para comprador PJ: consulta o CNPJ na Receita Federal (razão social, situação cadastral, endereço e quadro de sócios). Chame assim que o vendedor informar o CNPJ.",
    input_schema: { type: "object", properties: { cnpj: { type: "string" } }, required: ["cnpj"] },
  },
  {
    name: "listar_condicoes_pagamento",
    description: "Lista as condições de pagamento permitidas com regras, nível de aprovação e documentos exigidos.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "simular_pagamento",
    description: "Confere uma condição de pagamento contra as regras e devolve os campos do quadro (forma, entrada, parcela, quantidade), o nível de aprovação e os documentos exigidos. Valores em centavos.",
    input_schema: {
      type: "object",
      properties: {
        preco_total_centavos: { type: "integer", description: "Preço total (IV.5), com acréscimo do cartão se houver" },
        preco_base_centavos: { type: "integer", description: "Equipamento + acessórios, sem acréscimo do cartão" },
        pagamento: pagamentoJsonSchema,
      },
      required: ["preco_total_centavos", "pagamento"],
    },
  },
  {
    name: "validar_contrato",
    description: "Validação completa de todos os dados do contrato (equipamento no catálogo, documentos, valores, pagamento, Receita). Retorna erros (bloqueiam), alertas (não bloqueiam) e ajustes_automaticos (o que o sistema preencheu sozinho: marca padrão, garantia do CO₂ 90W) — mostre os ajustes ao vendedor no resumo final.",
    input_schema: { type: "object", properties: { dados: dadosJsonSchema }, required: ["dados"] },
  },
  {
    name: "gerar_contrato_para_aprovacao",
    description: "Reserva o número, gera o contrato preenchido e envia para aprovação interna. SÓ use depois que o vendedor confirmou o resumo final. Para corrigir um contrato reprovado, envie o contrato_id dele (mantém o número).",
    input_schema: {
      type: "object",
      properties: {
        dados: dadosJsonSchema,
        confirmado_pelo_vendedor: { type: "boolean", description: "true somente se o vendedor confirmou explicitamente o resumo final" },
        contrato_id: { type: "string", description: "Só para corrigir um contrato já gerado/reprovado" },
      },
      required: ["dados", "confirmado_pelo_vendedor"],
    },
  },
];

type Resultado = { conteudo: unknown; erro?: boolean };

export async function executarFerramenta(nome: string, entrada: any, ctx: ContextoFerramentas): Promise<Resultado> {
  const hoje = ctx.hoje ?? hojeBrasilia();
  // Só PJ tem consulta à Receita.
  const receitaDe = (c?: { tipo_pessoa?: string; documento?: string }) =>
    c?.tipo_pessoa === "PJ" && c.documento ? ctx.estado.receitas[somenteDigitos(c.documento)] : undefined;

  switch (nome) {
    case "consultar_cnpj": {
      const cnpj = somenteDigitos(entrada.cnpj);
      if (!cnpjValido(cnpj)) return { conteudo: { erro: `CNPJ ${entrada.cnpj} é inválido (dígito verificador não confere). Peça ao vendedor para conferir.` }, erro: true };
      try {
        const rf = await ctx.consultarCnpj(cnpj);
        ctx.estado.receitas[cnpj] = rf;
        return { conteudo: { ...rf, cnpj: formatarCnpj(cnpj), aviso: rf.situacao !== "ATIVA" ? `ATENÇÃO: situação ${rf.situacao} — não é possível contratar.` : undefined } };
      } catch (e: any) {
        return { conteudo: { erro: e.message, orientacao: "Siga com os dados informados pelo vendedor e avise que não foi possível conferir na Receita." }, erro: true };
      }
    }

    case "listar_condicoes_pagamento":
      return { conteudo: CONDICOES.map(({ clausula, ...c }) => c) };

    case "simular_pagamento": {
      const r = calcularPagamento({
        ...(entrada.pagamento ?? {}),
        preco_total_centavos: entrada.preco_total_centavos,
        preco_base_centavos: entrada.preco_base_centavos,
        data_contrato: hoje,
      });
      return { conteudo: { ok: r.ok, erros: r.erros, alertas: r.alertas, ...(r.ok ? resumoPagamento(r) : {}) } };
    }

    case "validar_contrato": {
      const v = validarContrato(entrada.dados, { receita: receitaDe(entrada.dados?.contratante), data_contrato: hoje });
      return {
        conteudo: {
          ok: v.ok,
          erros: v.erros,
          alertas: v.alertas,
          ajustes_automaticos: v.ajustes_automaticos,
          equipamento_normalizado: v.dados
            ? {
                familia: reconhecerFamilia(v.dados.equipamento.modelo)?.nome,
                tipo: v.dados.equipamento.tipo,
                potencia: v.dados.equipamento.potencia,
                marca_laser: v.dados.equipamento.marca_laser,
                opcionais: v.dados.acessorios.map((a) => a.descricao),
              }
            : undefined,
          equipamento_mais_acessorios: v.preco_base_centavos !== undefined ? formatarMoeda(v.preco_base_centavos) : undefined,
          ...(v.ok && v.pagamento ? resumoPagamento(v.pagamento, v) : {}),
        },
      };
    }

    case "gerar_contrato_para_aprovacao": {
      if (entrada.confirmado_pelo_vendedor !== true)
        return { conteudo: { erro: "Mostre o resumo final e aguarde a confirmação do vendedor antes de gerar." }, erro: true };
      const r = await gerarContratoParaAprovacao({
        repo: ctx.repo,
        dados: entrada.dados,
        vendedor: ctx.vendedor,
        receita: receitaDe(entrada.dados?.contratante),
        contrato_id: entrada.contrato_id,
        data_contrato: hoje,
      });
      if (!r.ok) return { conteudo: { ok: false, erros: r.erros, alertas: r.alertas }, erro: true };
      ctx.estado.contrato_id = r.contrato.id;
      ctx.estado.contrato_numero = r.contrato.numero;
      return {
        conteudo: {
          ok: true,
          contrato_id: r.contrato.id,
          numero: r.contrato.numero,
          status: r.contrato.status,
          nivel_atencao: `${r.contrato.nivel_aprovacao} — ${NIVEIS[r.contrato.nivel_aprovacao].nome}`,
          precisa_aprovacao: r.contrato.status === "aguardando_aprovacao",
          documentos_pendentes: r.contrato.documentos.filter((d) => !d.recebido).map((d) => d.nome),
          alertas: r.alertas,
          mensagem: r.contrato.status === "aguardando_aprovacao"
            ? "Contrato gerado e enviado para aprovação do gestor comercial. Só envie ao cliente depois de aprovado."
            : "Contrato gerado e pronto para envio ao cliente.",
        },
      };
    }

    default:
      return { conteudo: { erro: `Ferramenta desconhecida: ${nome}` }, erro: true };
  }
}
