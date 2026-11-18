import Anthropic from "@anthropic-ai/sdk";
import { consultarCnpjBrasilApi, type ConsultaCnpj } from "../lib/cnpj-api";
import { hojeBrasilia, formatarData } from "../lib/formatacao";
import type { Repositorio } from "../repositorio/tipos";
import type { Vendedor } from "../servico";
import { executarFerramenta, FERRAMENTAS, type EstadoAgente } from "./ferramentas";
import { montarPromptSistema } from "./prompt";

export const MODELO_PADRAO_IA = "claude-sonnet-5-5";

export interface OpcoesAgente {
  repo: Repositorio;
  anthropic?: Anthropic;
  /** Padrão: claude-sonnet-5-5 */
  modelo?: string;
  consultarCnpj?: ConsultaCnpj;
  maxPassos?: number;
}

export interface RespostaAgente {
  /** Texto para mostrar ao vendedor. */
  texto: string;
  /** Histórico completo atualizado — a Central salva e devolve na próxima chamada. */
  mensagens: Anthropic.MessageParam[];
  estado: EstadoAgente;
  /** Preenchido quando um contrato foi gerado neste turno. */
  contrato_gerado?: { id: string; numero: string };
}

export const estadoInicial = (): EstadoAgente => ({ receitas: {} });

/**
 * Agente sem estado próprio: a cada mensagem do vendedor, a Central (ou o
 * webhook do WhatsApp) chama `responder` com o histórico e o estado salvos.
 */
export class AgenteContratos {
  private anthropic: Anthropic;
  private modelo: string;
  private consultarCnpj: ConsultaCnpj;
  private maxPassos: number;

  constructor(private opts: OpcoesAgente) {
    this.anthropic = opts.anthropic ?? new Anthropic(); // usa ANTHROPIC_API_KEY
    this.modelo = opts.modelo ?? MODELO_PADRAO_IA;
    this.consultarCnpj = opts.consultarCnpj ?? consultarCnpjBrasilApi;
    this.maxPassos = opts.maxPassos ?? 12;
  }

  async responder(p: {
    vendedor: Vendedor;
    mensagem: string;
    historico?: Anthropic.MessageParam[];
    estado?: EstadoAgente;
  }): Promise<RespostaAgente> {
    const estado: EstadoAgente = structuredClone(p.estado ?? estadoInicial());
    const mensagens: Anthropic.MessageParam[] = [...(p.historico ?? []), { role: "user", content: p.mensagem }];
    const hoje = hojeBrasilia();
    const sistema = montarPromptSistema({ vendedor_nome: p.vendedor.nome, hoje: formatarData(hoje) });
    let gerado: { id: string; numero: string } | undefined;

    for (let passo = 0; passo < this.maxPassos; passo++) {
      const resp = await this.anthropic.messages.create({
        model: this.modelo,
        max_tokens: 4096,
        system: [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }],
        tools: FERRAMENTAS,
        messages: mensagens,
      });
      mensagens.push({ role: "assistant", content: resp.content });

      const chamadas = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (resp.stop_reason !== "tool_use" || !chamadas.length) {
        const texto = resp.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
        return { texto, mensagens, estado, contrato_gerado: gerado };
      }

      const resultados: Anthropic.ToolResultBlockParam[] = [];
      for (const ch of chamadas) {
        const r = await executarFerramenta(ch.name, ch.input, {
          repo: this.opts.repo, vendedor: p.vendedor, consultarCnpj: this.consultarCnpj, estado, hoje,
        });
        if (ch.name === "gerar_contrato_para_aprovacao" && !r.erro)
          gerado = { id: estado.contrato_id!, numero: estado.contrato_numero! };
        resultados.push({ type: "tool_result", tool_use_id: ch.id, content: JSON.stringify(r.conteudo), is_error: r.erro });
      }
      mensagens.push({ role: "user", content: resultados });
    }
    throw new Error("O agente excedeu o número máximo de passos nesta mensagem.");
  }
}
