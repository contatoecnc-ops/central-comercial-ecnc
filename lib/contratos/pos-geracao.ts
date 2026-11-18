import { vincularAnalisesAoContrato } from "@/lib/analise-credito/servidor";
import { avisarGestor } from "@/lib/contratos/servidor";

/**
 * Depois que um contrato é gerado ou corrigido (chat da Central e Telegram): liga a análise de crédito pelo documento
 * e só então avisa o gestor, para ele já abrir o card com a análise. Nenhum dos dois lança erro.
 */
export async function aposContratoGerado(contratoId: string): Promise<void> {
  await vincularAnalisesAoContrato(contratoId);
  await avisarGestor(contratoId);
}
