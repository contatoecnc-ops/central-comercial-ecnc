import { randomUUID } from "node:crypto";
import { estadoInicial } from "../agente/agente";
import type { Canal, Conversa, ConversasRepo } from "./tipos";

/** Para testes e terminal. */
export class MemoriaConversas implements ConversasRepo {
  conversas = new Map<string, Conversa>();
  private travas = new Map<string, number>();
  private atualizacoes = new Set<string>();

  async abrirOuCriar(vendedor_id: string, canal: Canal) {
    const aberta = [...this.conversas.values()].find((c) => c.vendedor_id === vendedor_id && c.canal === canal && !c.encerrada);
    if (aberta) return structuredClone(aberta);
    const nova: Conversa = { id: randomUUID(), vendedor_id, canal, mensagens: [], estado: estadoInicial(), encerrada: false };
    this.conversas.set(nova.id, nova);
    return structuredClone(nova);
  }
  async salvar(c: Conversa) {
    this.conversas.set(c.id, structuredClone(c));
  }
  async encerrar(id: string) {
    const c = this.conversas.get(id);
    if (c) c.encerrada = true;
  }
  async travar(id: string, segundos: number) {
    const agora = Date.now();
    if ((this.travas.get(id) ?? 0) > agora) return false;
    this.travas.set(id, agora + segundos * 1000);
    return true;
  }
  async destravar(id: string) {
    this.travas.delete(id);
  }
  async registrarAtualizacao(canal: Canal, id: string) {
    const k = `${canal}:${id}`;
    if (this.atualizacoes.has(k)) return false;
    this.atualizacoes.add(k);
    return true;
  }
}
