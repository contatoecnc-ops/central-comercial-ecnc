import type Anthropic from "@anthropic-ai/sdk";

export interface MensagemTela { role: "user" | "assistant"; texto: string }

/** Do histórico bruto do agente (com chamadas de ferramenta) para o que o vendedor vê: só texto. */
export function paraExibicao(mensagens: Anthropic.MessageParam[]): MensagemTela[] {
  const out: MensagemTela[] = [];
  for (const m of mensagens) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const texto =
      typeof m.content === "string"
        ? m.content
        : m.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
    const limpo = texto.trim();
    if (!limpo) continue;
    if (m.role === "user" && limpo.startsWith("[Aviso do sistema]")) continue; // contexto interno da correção
    out.push({ role: m.role, texto: limpo });
  }
  return out;
}

export function mensagemDeCorrecao(c: { numero: string; id: string; motivo_reprovacao?: string }) {
  return `Quero corrigir o contrato ${c.numero} (contrato_id ${c.id}). Motivo da reprovação: ${c.motivo_reprovacao ?? "não informado"}`;
}
