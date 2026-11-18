import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RegistroContrato, Repositorio } from "./tipos";

/** Guarda tudo em memória e grava os .docx numa pasta local. */
export class MemoriaRepositorio implements Repositorio {
  private seq = new Map<number, number>();
  contratos = new Map<string, RegistroContrato>();
  eventos: { contrato_id: string; evento: string; por: string; detalhe?: unknown }[] = [];

  constructor(
    private pastaSaida = "saida",
    private pastaModelos = "modelos",
    /** Último número já usado na planilha, por ano (para continuar a sequência). */
    ultimoPorAno: Record<number, number> = {},
  ) {
    for (const [a, n] of Object.entries(ultimoPorAno)) this.seq.set(Number(a), n);
  }

  async reservarNumero(ano: number) {
    const n = (this.seq.get(ano) ?? 0) + 1;
    this.seq.set(ano, n);
    return n;
  }
  async criarContrato(c: Omit<RegistroContrato, "id">) {
    const r = { ...c, id: randomUUID() };
    this.contratos.set(r.id, r);
    return r;
  }
  async atualizarContrato(id: string, m: Partial<RegistroContrato>) {
    const atual = this.contratos.get(id);
    if (!atual) throw new Error("Contrato não encontrado");
    const r = { ...atual, ...m, id };
    this.contratos.set(id, r);
    return r;
  }
  async buscarContrato(id: string) {
    return this.contratos.get(id) ?? null;
  }
  async salvarArquivo(caminho: string, arquivo: Buffer) {
    const destino = join(this.pastaSaida, caminho);
    await mkdir(dirname(destino), { recursive: true });
    await writeFile(destino, arquivo);
    return destino;
  }
  async registrarEvento(contrato_id: string, evento: string, por: string, detalhe?: unknown) {
    this.eventos.push({ contrato_id, evento, por, detalhe });
  }
  async carregarModelo(modelo_id: string) {
    return readFile(join(this.pastaModelos, `${modelo_id}.docx`));
  }
}
