/**
 * Dados fixos da ECNC e regras gerais do contrato.
 * Edite aqui — o agente e as validações leem deste arquivo.
 */
export const EMPRESA = {
  razao_social: "INOVUS INDÚSTRIA DE MÁQUINAS AUTOMÁTICAS LTDA",
  nome_fantasia: "ECNC",
  cnpj: "07.187.969/0001-62",
  cidade_uf: "Garça/SP",
} as const;

export const NUMERACAO = {
  /**
   * Formato do número do contrato.
   *  {ANO}  -> 2026      {AA}   -> 26
   *  {SEQ}  -> sequencial sem zeros (2800)
   *  {SEQ4} -> sequencial com 4 dígitos
   * ECNC: 2800-26 (sequência + ano com 2 dígitos). Primeiro número: 2800
   * (no Supabase: insert into contrato_sequencias values (0, 2799)).
   */
  formato: "{SEQ}-{AA}",
  /**
   * false = sequência contínua (2800-26, 2801-26 ... 2950-27); só o sufixo do ano muda.
   * true = recomeça a cada ano. ⚠️ CONFIRMAR com o Edmar.
   */
  reinicia_por_ano: false,
};

/**
 * APROVAÇÃO ANTES DE ENVIAR AO CLIENTE
 *  "todos"   — todo contrato passa pelo gestor comercial (fase de validação do agente)
 *  "atencao" — só contratos de Atenção / Atenção máxima; os padrão saem prontos para envio
 *  "nenhum"  — nada passa por aprovação; a assinatura final do gestor é o controle
 * Comece em "todos" e vá afrouxando conforme o agente provar que acerta.
 */
export const APROVACAO = {
  modo: "todos" as "todos" | "atencao" | "nenhum",
  papel: "gestor_comercial",
};

export const REGRAS_GERAIS = {
  /** Prazo de entrega acima disso gera alerta para o aprovador. ⚠️ EXEMPLO */
  prazo_entrega_max_dias: 60,
  /** O quadro IV.4 tem 4 linhas. */
  max_acessorios: 4,
  /** Máximo de signatários do lado do cliente. */
  max_signatarios: 3,
};
