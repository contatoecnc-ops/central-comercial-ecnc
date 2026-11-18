/**
 * Configuração da Central para o módulo de Contratos.
 * (As regras do agente — condições, níveis, modo de aprovação — ficam em lib/agente-contratos/config/ e não são tocadas aqui.)
 */

/**
 * Quem assina como gestor no ZapSign: sempre esta pessoa, qualquer que seja o admin que aprovou o contrato.
 * Se o nome ficar vazio, "Enviar para assinatura" recusa com uma mensagem clara.
 */
export const GESTOR_ASSINATURA = {
  nome: "Everaldo A. Bento Pereira",
  email: "everaldo@inovus.com.br",
} as const;

/** Rótulo de papel que a Central passa ao pacote quando quem age é um admin (todo admin ativo é gestor comercial). */
export const PAPEL_GESTOR = "gestor_comercial";

export const CHAT_MAX_MENSAGEM = 8000;
export const CHAT_LIMITE_POR_HORA = 30;
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const WEBHOOK_MAX_BYTES = 256 * 1024;
export const URL_ASSINADA_SEGUNDOS = 60;

export const COLUNAS_KANBAN = [
  { status: "aguardando_aprovacao", titulo: "Aguardando aprovação" },
  { status: "reprovado", titulo: "Reprovado — corrigir" },
  { status: "aprovado", titulo: "Pronto para enviar" },
  { status: "enviado_cliente", titulo: "Com o cliente" },
  { status: "assinado", titulo: "Assinado" },
] as const;

export const NIVEL_ROTULO: Record<1 | 2 | 3, string> = { 1: "Padrão", 2: "Atenção", 3: "Atenção máxima" };

export const sandboxZapsign = () => process.env.ZAPSIGN_AMBIENTE !== "producao";
