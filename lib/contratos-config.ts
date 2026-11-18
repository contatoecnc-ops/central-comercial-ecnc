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

// ───────────────────────────────────────────────────────────────── Análise de crédito

/**
 * Com `false` (atual): contrato parcelado sem análise vinculada só mostra o aviso vermelho; Aprovar continua funcionando.
 * Com `true`: a rota de aprovar (e o botão, desabilitado com o motivo) recusa contrato parcelado que não tenha uma análise
 * APROVADA e DENTRO DA VALIDADE vinculada (vale a mais recente entre as vinculadas).
 */
export const ANALISE_CREDITO_OBRIGATORIA = false;

/** Validade padrão, em dias a partir da data da análise, quando o financeiro não digita a data do PDF. */
export const ANALISE_VALIDADE_PADRAO_DIAS = 60;
export const ANALISE_ENVIOS_POR_HORA = 30;
export const ANALISE_PDF_MAX_BYTES = 10 * 1024 * 1024;
