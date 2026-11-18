import type { SupabaseClient } from "@supabase/supabase-js";
import { estadoInicial } from "../agente/agente";
import type { Canal, Conversa, ConversasRepo } from "./tipos";

/** Conversas na tabela contratos_conversas (supabase/001_contratos.sql). Só no servidor, com service role. */
export class SupabaseConversas implements ConversasRepo {
  constructor(private db: SupabaseClient) {}

  async abrirOuCriar(vendedor_id: string, canal: Canal): Promise<Conversa> {
    const { data, error } = await this.db
      .from("contratos_conversas")
      .select("id, vendedor_id, canal, mensagens, estado, contrato_id, encerrada")
      .eq("vendedor_id", vendedor_id).eq("canal", canal).eq("encerrada", false)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data as Conversa;
    const { data: nova, error: e2 } = await this.db
      .from("contratos_conversas")
      .insert({ vendedor_id, canal, mensagens: [], estado: estadoInicial() })
      .select("id, vendedor_id, canal, mensagens, estado, contrato_id, encerrada").single();
    if (e2) throw new Error(e2.message);
    return nova as Conversa;
  }

  async salvar(c: Conversa) {
    const { error } = await this.db.from("contratos_conversas").update({
      mensagens: c.mensagens, estado: c.estado, contrato_id: c.contrato_id ?? null, updated_at: new Date().toISOString(),
    }).eq("id", c.id);
    if (error) throw new Error(error.message);
  }

  async encerrar(id: string) {
    await this.db.from("contratos_conversas").update({ encerrada: true, updated_at: new Date().toISOString() }).eq("id", id);
  }

  async travar(id: string, segundos: number) {
    const agora = new Date();
    const ate = new Date(agora.getTime() + segundos * 1000).toISOString();
    const { data, error } = await this.db
      .from("contratos_conversas")
      .update({ processando_ate: ate })
      .eq("id", id)
      .or(`processando_ate.is.null,processando_ate.lt.${agora.toISOString()}`)
      .select("id");
    if (error) throw new Error(error.message);
    return (data?.length ?? 0) > 0;
  }

  async destravar(id: string) {
    await this.db.from("contratos_conversas").update({ processando_ate: null }).eq("id", id);
  }

  async registrarAtualizacao(canal: Canal, id: string) {
    const { error } = await this.db.from("canal_atualizacoes").insert({ canal, atualizacao_id: id });
    if (!error) return true;
    if (error.code === "23505") return false; // já processada
    throw new Error(error.message);
  }
}
