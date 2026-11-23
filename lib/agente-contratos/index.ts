// Ponto de entrada do pacote — é isso que a Central importa.
export { AgenteContratos, estadoInicial, MODELO_PADRAO_IA, type RespostaAgente } from "./agente/agente";
export type { EstadoAgente } from "./agente/ferramentas";
export { gerarContratoParaAprovacao, aprovarContrato, reprovarContrato, marcarDocumento, pendenciasAprovacao, marcarEnviado, marcarAssinado, cancelarContrato, formatarNumero, type Vendedor, type Aprovador } from "./servico";
export { validarContrato } from "./lib/validacao";
export { calcularPagamento } from "./lib/pagamento";
export { normalizarDados, conferirEquipamento } from "./lib/normalizacao";
export { FAMILIAS, reconhecerFamilia, descreverCatalogo } from "./config/equipamentos";
export { verificarModelo, gerarDocx } from "./lib/gerador-docx";
export { VARIAVEIS_DISPONIVEIS } from "./lib/variaveis";
export {
  enviarParaAssinatura, zapsignAtivo, configZapsignDoAmbiente, registrarWebhookZapsign, validarSegredoZapsign, lerEventoZapsign, pastaPorNivel,
  type ConfigZapsign,
} from "./lib/zapsign";
export { enviarContratoParaAssinatura, processarWebhookZapsign, type ResultadoWebhook } from "./servico";
export { consultarCnpjBrasilApi } from "./lib/cnpj-api";
export { MemoriaRepositorio } from "./repositorio/memoria";
export { SupabaseRepositorio } from "./repositorio/supabase";
export type { Repositorio, RegistroContrato } from "./repositorio/tipos";
export { CONDICOES, NIVEIS } from "./config/condicoes-pagamento";
export { MODELOS, MAPA_ZAPSIGN } from "./config/modelos";
export * from "./tipos";
export { MemoriaConversas } from "./conversas/memoria";
export { SupabaseConversas } from "./conversas/supabase";
export type { Conversa, ConversasRepo, Canal } from "./conversas/tipos";
export {
  TelegramApi, processarAtualizacaoTelegram, validarSegredoTelegram,
  avisarGestorNovoContrato, avisarVendedorAprovado, avisarVendedorReprovado, resumoParaGestor, pontosDeAtencao, avisarVendedorEnviado, avisarGestorSuaVez, avisarAssinado, avisarRecusado,
} from "./canais/telegram";
