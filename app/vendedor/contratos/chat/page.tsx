import { ChatContratos } from "@/components/contratos/ChatContratos";
import { PageHeader } from "@/components/PageHeader";
import { SupabaseConversas } from "@/lib/agente-contratos";
import { carregarContrato } from "@/lib/contratos/queries";
import { mensagemDeCorrecao, paraExibicao } from "@/lib/contratos/mensagens";
import { exigirPaginaContratos, UUID_RE } from "@/lib/contratos/servidor";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function ChatContratosPage({ searchParams }: { searchParams: { corrigir?: string } }) {
  const profile = await exigirPaginaContratos("vendedor");
  const conversas = new SupabaseConversas(createAdminClient());
  let conversa = await conversas.abrirOuCriar(profile.id, "central"); // sempre a do próprio vendedor
  let rascunho: string | undefined;

  // "Corrigir" (card reprovado): só se o contrato for do vendedor e estiver reprovado (RLS + conferência).
  const alvo = searchParams.corrigir;
  if (alvo && UUID_RE.test(alvo)) {
    const c = await carregarContrato(alvo);
    if (c && c.vendedor_id === profile.id && c.status === "reprovado") {
      if (conversa.mensagens.length && conversa.contrato_id !== c.id) {
        await conversas.encerrar(conversa.id); // conversa de outro assunto: começa uma limpa para a correção
        conversa = await conversas.abrirOuCriar(profile.id, "central");
      }
      rascunho = mensagemDeCorrecao(c);
    }
  }

  const gerado = conversa.contrato_id ? await carregarContrato(conversa.contrato_id) : null;

  return (
    <>
      <PageHeader
        back="/vendedor/contratos"
        title="Novo contrato"
        breadcrumb={[{ label: "Contratos", href: "/vendedor/contratos" }, { label: "Chat com o agente" }]}
      />
      <ChatContratos
        conversaId={conversa.id}
        inicial={paraExibicao(conversa.mensagens)}
        rascunho={rascunho}
        contratoGerado={gerado ? { id: gerado.id, numero: gerado.numero } : null}
      />
    </>
  );
}
