import type Anthropic from "@anthropic-ai/sdk";
import type { EstadoAgente } from "../agente/ferramentas";

export type Canal = "central" | "telegram" | "whatsapp";

/** Uma conversa do vendedor com o agente (um contrato por conversa). */
export interface Conversa {
  id: string;
  vendedor_id: string;
  canal: Canal;
  mensagens: Anthropic.MessageParam[];
  estado: EstadoAgente;
  contrato_id?: string;
  encerrada: boolean;
}

/**
 * Onde as conversas ficam guardadas — o agente não guarda nada sozinho.
 * Serve para qualquer canal (Central, Telegram, WhatsApp).
 */
export interface ConversasRepo {
  /** Conversa aberta do vendedor naquele canal; cria uma se não houver. */
  abrirOuCriar(vendedor_id: string, canal: Canal): Promise<Conversa>;
  salvar(c: Conversa): Promise<void>;
  /** "Novo contrato": encerra a conversa aberta. */
  encerrar(conversa_id: string): Promise<void>;
  /**
   * Trava a conversa enquanto o agente responde (evita duas respostas ao mesmo
   * tempo se o vendedor mandar mensagens seguidas). false = já está ocupada.
   */
  travar(conversa_id: string, segundos: number): Promise<boolean>;
  destravar(conversa_id: string): Promise<void>;
  /** Telegram reenvia a mesma atualização se demorar: true = primeira vez, pode processar. */
  registrarAtualizacao(canal: Canal, id: string): Promise<boolean>;
}
