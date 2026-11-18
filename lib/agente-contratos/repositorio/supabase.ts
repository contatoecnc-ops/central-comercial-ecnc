import type { SupabaseClient } from "@supabase/supabase-js";
import type { RegistroContrato, Repositorio } from "./tipos";

/**
 * Implementação para a Central (Next.js + Supabase).
 * Use um client criado com a SERVICE ROLE KEY, só no servidor (route handler / server action).
 * Tabelas e função: supabase/001_contratos.sql
 */
export class SupabaseRepositorio implements Repositorio {
  constructor(
    private db: SupabaseClient,
    private bucketContratos = "contratos",
    private bucketModelos = "modelos-contrato",
  ) {}

  async reservarNumero(ano: number) {
    const { data, error } = await this.db.rpc("reservar_numero_contrato", { p_ano: ano });
    if (error) throw new Error(`Falha ao reservar número: ${error.message}`);
    return Number(data);
  }

  async criarContrato(c: Omit<RegistroContrato, "id">) {
    const { data, error } = await this.db.from("contratos").insert(c).select().single();
    if (error) throw new Error(`Falha ao salvar contrato: ${error.message}`);
    return data as RegistroContrato;
  }

  async atualizarContrato(id: string, m: Partial<RegistroContrato>) {
    const { data, error } = await this.db
      .from("contratos").update({ ...m, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw new Error(`Falha ao atualizar contrato: ${error.message}`);
    return data as RegistroContrato;
  }

  async buscarContrato(id: string) {
    const { data, error } = await this.db.from("contratos").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as RegistroContrato) ?? null;
  }

  async salvarArquivo(caminho: string, arquivo: Buffer) {
    const { error } = await this.db.storage.from(this.bucketContratos).upload(caminho, arquivo, {
      upsert: true,
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    if (error) throw new Error(`Falha ao salvar arquivo: ${error.message}`);
    return caminho;
  }

  async registrarEvento(contrato_id: string, evento: string, por: string, detalhe?: unknown) {
    await this.db.from("contratos_eventos").insert({ contrato_id, evento, por, detalhe: detalhe ?? null });
  }

  async carregarModelo(modelo_id: string) {
    const { data, error } = await this.db.storage.from(this.bucketModelos).download(`${modelo_id}.docx`);
    if (error || !data) throw new Error(`Modelo "${modelo_id}" não encontrado no Storage.`);
    return Buffer.from(await data.arrayBuffer());
  }
}
