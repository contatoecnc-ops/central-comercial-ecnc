import type { DadosContrato, StatusContrato } from "../tipos";

export interface RegistroContrato {
  id: string;
  numero: string;
  status: StatusContrato;
  vendedor_id: string;
  vendedor_nome: string;
  cliente_razao_social: string;
  cliente_tipo_pessoa: "PF" | "PJ";
  /** CPF ou CNPJ, só dígitos */
  cliente_documento: string;
  valor_total_centavos: number;
  condicao_pagamento: string;
  dados: DadosContrato;
  variaveis: Record<string, string>;
  alertas: string[];
  /** Nível de atenção: 1 padrão, 2 atenção, 3 atenção máxima */
  nivel_aprovacao: 1 | 2 | 3;
  motivos_nivel: string[];
  /** Papéis que precisam aprovar (vazio = saiu pronto para envio). */
  aprovacoes_necessarias: string[];
  aprovacoes: Aprovacao[];
  documentos: DocumentoExigido[];
  modelo_id: string;
  arquivo_path?: string;
  motivo_reprovacao?: string;
  aprovado_em?: string;
  enviado_em?: string;
  assinado_em?: string;
  zapsign_doc_token?: string;
  /** Links de assinatura na ordem (cliente → testemunha → gestor). */
  zapsign_assinantes?: { nome: string; email: string; papel: string; url: string; token: string; assinou_em?: string }[];
}

export interface Aprovacao { papel: string; por: string; em: string }
export interface DocumentoExigido { nome: string; recebido: boolean; por?: string; em?: string; arquivo_path?: string }

/**
 * Onde o agente guarda números, contratos e arquivos.
 * - MemoriaRepositorio: para testes e para rodar no terminal.
 * - SupabaseRepositorio: para a Central Comercial.
 */
export interface Repositorio {
  /** Reserva o próximo número de forma atômica (nunca duplica, nunca reaproveita). chave = ano, ou 0 se a sequência é contínua. */
  reservarNumero(chave: number): Promise<number>;
  criarContrato(c: Omit<RegistroContrato, "id">): Promise<RegistroContrato>;
  atualizarContrato(id: string, mudancas: Partial<RegistroContrato>): Promise<RegistroContrato>;
  buscarContrato(id: string): Promise<RegistroContrato | null>;
  salvarArquivo(caminho: string, arquivo: Buffer): Promise<string>;
  registrarEvento(contrato_id: string, evento: string, por: string, detalhe?: unknown): Promise<void>;
  /** Carrega o .docx do modelo de contrato. */
  carregarModelo(modelo_id: string): Promise<Buffer>;
}
