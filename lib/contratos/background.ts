import { waitUntil } from "@vercel/functions";
import { logErro } from "@/lib/contratos/servidor";

/**
 * Next 14 não tem `after()` (só do 15 em diante): usa `waitUntil` de @vercel/functions.
 * A resposta HTTP sai na hora e o trabalho continua dentro do limite de `maxDuration` da rota.
 */
export function executarEmSegundoPlano(tarefa: () => Promise<void>) {
  waitUntil(tarefa().catch((e) => logErro("segundo plano", undefined, e)));
}
