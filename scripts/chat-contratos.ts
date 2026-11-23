/**
 * Chat de linha de comando com o Agente de Contratos — SÓ PARA TESTE.
 *
 *   npm run chat:contratos                 conversa interativa (Ctrl+C ou "sair" encerra)
 *   npm run chat:contratos roteiro.txt     manda as mensagens do arquivo (separadas por uma linha "---")
 *
 * Usa o MemoriaRepositorio: NADA é gravado no Supabase e nenhum número de contrato real é consumido
 * (a numeração aqui começa em 2800-26 só na memória deste processo). Os .docx saem numa pasta temporária.
 * A chave da Anthropic vem de ANTHROPIC_API_KEY no .env.local (que não entra no commit).
 */
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import Anthropic from "@anthropic-ai/sdk";
import { AgenteContratos, estadoInicial } from "../lib/agente-contratos/agente/agente";
import { MemoriaRepositorio } from "../lib/agente-contratos/repositorio/memoria";

function chaveAnthropic(): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  if (existsSync(".env.local")) {
    for (const linha of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = /^\s*ANTHROPIC_API_KEY\s*=\s*(.*?)\s*$/.exec(linha);
      if (m?.[1]) return m[1].replace(/^["']|["']$/g, "");
    }
  }
  throw new Error("Falta ANTHROPIC_API_KEY — coloque no .env.local (não vai para o commit).");
}

const pasta = mkdtempSync(join(tmpdir(), "chat-contratos-"));
const repo = new MemoriaRepositorio(pasta, "lib/agente-contratos/modelos", { 0: 2799 });
let agente: AgenteContratos;
const vendedor = { id: "demo", nome: "Vendedor Demo", cpf: "987.654.321-00", email: "demo@ecnc.com.br", celular: "(14) 99111-2233" };

let historico: Anthropic.MessageParam[] = [];
let estado = estadoInicial();

async function turno(mensagem: string) {
  const r = await agente.responder({ vendedor, mensagem, historico, estado });
  historico = r.mensagens;
  estado = r.estado;
  console.log(`\nAgente: ${r.texto}\n`);
  if (r.contrato_gerado) {
    const c = repo.contratos.get(r.contrato_gerado.id)!;
    console.log("─── contrato gerado (em memória; nada foi gravado no Supabase) ───");
    console.log(`número ${c.numero} · nível ${c.nivel_aprovacao} · status ${c.status}`);
    console.log(`modelo do contrato: ${c.modelo_id} · arquivo: ${c.arquivo_path}`);
    if (c.motivos_nivel.length) console.log(`motivos do nível: ${c.motivos_nivel.join(" | ")}`);
    console.log(`alertas: ${c.alertas.length ? "\n  - " + c.alertas.join("\n  - ") : "nenhum"}`);
    console.log(`IV.3 modelo/potência/marca: ${c.variaveis.EQUIPAMENTO_MODELO}/${c.variaveis.EQUIPAMENTO_POTENCIA}/${c.variaveis.EQUIPAMENTO_MARCA_LASER}`);
    console.log(`IV.4 opcionais:\n${c.variaveis.IV4_ACESSORIOS}`);
    console.log(`IV.6 entrada:\n${c.variaveis.IV6_VALOR_ENTRADA}`);
    console.log(`IV.7 prazo: ${c.variaveis.IV7_PRAZO_ENTREGA}`);
    console.log("───────────────────────────────────────────────────────────────\n");
  }
}

async function main() {
  agente = new AgenteContratos({ repo, anthropic: new Anthropic({ apiKey: chaveAnthropic() }) });
  const arquivo = process.argv[2];
  if (arquivo) {
    for (const msg of readFileSync(arquivo, "utf8").split(/\r?\n---\r?\n/).map((m) => m.trim()).filter(Boolean)) {
      console.log(`\nVendedor: ${msg}`);
      await turno(msg);
    }
  } else {
    console.log(`Chat de teste (sem Supabase). Arquivos em ${pasta}. Digite a mensagem do vendedor; "sair" encerra.\n`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    for (;;) {
      const msg = (await rl.question("Vendedor: ")).trim();
      if (!msg || msg.toLowerCase() === "sair") break;
      await turno(msg);
    }
    rl.close();
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
