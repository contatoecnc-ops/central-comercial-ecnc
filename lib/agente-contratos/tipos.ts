import { z } from "zod";

/** Valores em dinheiro sempre em CENTAVOS (inteiro) para não ter erro de arredondamento. */
const centavos = z.number().int().nonnegative();

export const EnderecoSchema = z.object({
  logradouro: z.string().min(1),
  numero: z.string().min(1),
  complemento: z.string().optional(),
  bairro: z.string().min(1),
  cidade: z.string().min(1),
  uf: z.string().length(2),
  cep: z.string().min(8),
});

export const SignatarioSchema = z.object({
  nome: z.string().min(3),
  cpf: z.string().min(11),
  cargo: z.string().min(2),
  email: z.string().min(5),
  telefone: z.string().optional(),
});

/** Garantidor(a) solidário(a) — o avalista; se a análise não exigir, quem assina pela empresa. */
export const GarantidorSchema = z.object({
  nome: z.string().min(3),
  cpf: z.string().min(11),
  email: z.string().min(5),
  endereco: EnderecoSchema,
});

/** Testemunha indicada pelo cliente (assina o contrato). */
export const TestemunhaSchema = z.object({
  nome: z.string().min(3),
  cpf: z.string().min(11),
  email: z.string().min(5),
  celular: z.string().min(10),
});

export const PagamentoSchema = z.object({
  /** id de uma condição em config/condicoes-pagamento.ts */
  condicao: z.string().min(1),
  entrada_centavos: centavos.optional(),
  /**
   * Entrada em mais de um pagamento (ex.: sinal + restante). Soma = entrada.
   * Sem isso, a entrada é um pagamento único por PIX na assinatura.
   * Tudo aqui precisa estar compensado antes da saída da máquina.
   */
  entrada_pagamentos: z.array(z.object({
    valor_centavos: centavos,
    /** AAAA-MM-DD — data do pagamento (igual à do contrato = "na assinatura"). */
    data: z.string(),
    meio: z.enum(["pix", "transferencia", "boleto"]).default("pix"),
  })).optional(),
  parcelas: z.number().int().positive().optional(),
  /** Dias para o 1º vencimento, contados do gatilho da condição (NF, recebimento...). */
  dias_primeira_parcela: z.number().int().nonnegative().optional(),
  /** Alternativa: data fixa do 1º boleto (AAAA-MM-DD). Sempre gera Atenção para o gestor. */
  primeiro_vencimento_data: z.string().optional(),
  banco: z.string().optional(),
  /** Cartão: acréscimo de parcelamento cobrado do cliente (entra no preço total). */
  acrescimo_cartao_centavos: centavos.optional(),
  /** Cartão: valor em cada cartão quando dividir em mais de um. Soma = preço total. */
  divisao_cartoes_centavos: z.array(centavos).optional(),
});

export const PrazoEntregaSchema = z.object({
  tipo: z.enum(["pronta_entrega", "dias_uteis", "dias_corridos"]),
  dias: z.number().int().positive().optional(),
});

export const DadosContratoSchema = z.object({
  contratante: z.object({
    /** PF = pessoa física (CPF); PJ = empresa (CNPJ). Os mesmos modelos atendem os dois. */
    tipo_pessoa: z.enum(["PF", "PJ"]),
    /** Nome completo (PF) ou razão social (PJ). */
    razao_social: z.string().min(2),
    nome_fantasia: z.string().optional(),
    /** CPF (PF) ou CNPJ (PJ). */
    documento: z.string().min(11),
    /** PJ: inscrição estadual. PF: só se for produtor rural com IE. */
    inscricao_estadual: z.string().optional(),
    endereco: EnderecoSchema,
    email: z.string().min(5),
    telefone: z.string().min(8),
  }),
  /** O 1º é quem assina como COMPRADOR (PF: o próprio comprador; PJ: o representante). */
  signatarios: z.array(SignatarioSchema).min(1),
  garantidor: GarantidorSchema,
  testemunha_cliente: TestemunhaSchema,
  /** Máquina principal — "Preço de aquisição" (IV.3). */
  equipamento: z.object({
    /** Define qual modelo de contrato é usado (config/modelos.ts). */
    /** fiber = Fiber de gravação/marcação; fiber_corte = Fiber de corte (ainda sem modelo). */
    tipo: z.enum(["co2", "fiber", "fiber_corte", "uv", "solda"]),
    modelo: z.string().min(1),
    /** Ex.: 30W, 150W, 3kW */
    potencia: z.string().min(1),
    /** Marca da fonte/tubo laser. Ex.: RAYCUS, MAX, RECI */
    marca_laser: z.string().min(1),
    quantidade: z.number().int().positive().default(1),
    descricao: z.string().optional(),
    preco_centavos: centavos,
  }),
  /** "Acessórios vendidos separadamente" (IV.4) — inclui serviços como frete/instalação. Valor 0 = bonificação. */
  acessorios: z.array(z.object({ descricao: z.string().min(2), valor_centavos: centavos })).default([]),
  /** "Preço total de aquisição" (IV.5) informado pelo vendedor — conferido contra a soma. */
  preco_total_centavos: centavos,
  pagamento: PagamentoSchema,
  prazo_entrega: PrazoEntregaSchema,
  responsavel_frete: z.enum(["COMPRADOR", "VENDEDOR"]),
  /** Quem paga o técnico/instalação. */
  responsavel_instalacao: z.enum(["COMPRADOR", "VENDEDOR"]),
  endereco_entrega: EnderecoSchema.optional(),
});

export type DadosContrato = z.infer<typeof DadosContratoSchema>;
export type DadosContratoEntrada = z.input<typeof DadosContratoSchema>;
export type Endereco = z.infer<typeof EnderecoSchema>;

export interface ResultadoValidacao {
  ok: boolean;
  /** Bloqueiam a geração do contrato. */
  erros: string[];
  /** Não bloqueiam, mas aparecem para o aprovador. */
  alertas: string[];
}

export type StatusContrato =
  | "aguardando_aprovacao" // depende do gestor comercial
  | "reprovado"            // volta para o vendedor corrigir
  | "aprovado"             // pronto para enviar ao cliente
  | "enviado_cliente"      // vendedor enviou para assinatura
  | "assinado"             // todas as assinaturas feitas
  | "cancelado";
