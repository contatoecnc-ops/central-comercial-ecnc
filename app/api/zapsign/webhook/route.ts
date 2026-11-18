import { lerEventoZapsign, processarWebhookZapsign, validarSegredoZapsign } from "@/lib/agente-contratos";
import { WEBHOOK_MAX_BYTES } from "@/lib/contratos-config";
import { executarEmSegundoPlano } from "@/lib/contratos/background";
import {
  avisarFimDeAssinatura, avisarVezDoGestor, logErro, repositorio, UUID_RE,
} from "@/lib/contratos/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ok = () => new Response("ok");

// Sem sessão: a autenticação é o segredo (Authorization: Bearer ..., tempo constante). Corpo do webhook nunca vai para o log.
export async function POST(req: Request) {
  const segredo = process.env.ZAPSIGN_WEBHOOK_SECRET ?? "";
  if (!validarSegredoZapsign(req.headers.get("authorization"), segredo)) return new Response("forbidden", { status: 403 });

  if (Number(req.headers.get("content-length") ?? 0) > WEBHOOK_MAX_BYTES) return new Response("grande demais", { status: 413 });
  const texto = await req.text();
  if (Buffer.byteLength(texto) > WEBHOOK_MAX_BYTES) return new Response("grande demais", { status: 413 });

  let payload: unknown;
  try { payload = JSON.parse(texto); } catch { return ok(); }

  try {
    // O doc_token precisa pertencer a um contrato existente; qualquer outra coisa é ignorada (200).
    const ev = lerEventoZapsign(payload);
    if (!ev.contrato_id || !UUID_RE.test(ev.contrato_id) || !ev.doc_token) return ok();
    const c = await repositorio().buscarContrato(ev.contrato_id);
    if (!c || !c.zapsign_doc_token || c.zapsign_doc_token !== ev.doc_token) return ok();

    const r = await processarWebhookZapsign(repositorio(), payload);
    const contrato = r.contrato;
    if (!contrato) return ok();
    if (r.acao === "vez_do_gestor") executarEmSegundoPlano(() => avisarVezDoGestor(contrato));
    else if (r.acao === "assinado") executarEmSegundoPlano(() => avisarFimDeAssinatura(contrato, "assinado"));
    else if (r.acao === "recusado") executarEmSegundoPlano(() => avisarFimDeAssinatura(contrato, "recusado", r.quem));
  } catch (e) {
    logErro("webhook do ZapSign", undefined, e);
  }
  return ok(); // eventos desconhecidos e falhas internas: sempre 200
}
