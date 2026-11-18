import { NextResponse } from "next/server";
import type { z } from "zod";
import type { RegistroContrato } from "@/lib/agente-contratos";
import {
  buscarContratoAutorizado, contextoContratos, logErro, mensagemSegura, repositorio,
  type CtxContratos,
} from "@/lib/contratos/servidor";

const SEM_CACHE = { "Cache-Control": "no-store" };

export const resposta = (corpo: unknown, status = 200) => NextResponse.json(corpo, { status, headers: SEM_CACHE });
export const erro = (status: number, mensagem: string) => resposta({ erro: mensagem }, status);
export const naoEncontrado = () => erro(404, "Contrato não encontrado.");

/** Lê o corpo JSON com limite de tamanho e valida com zod (z.strictObject rejeita campos extras). */
export async function lerCorpoJson<T extends z.ZodTypeAny>(
  req: Request, schema: T, maxBytes = 64 * 1024,
): Promise<{ ok: true; dados: z.infer<T> } | { ok: false; res: NextResponse }> {
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > maxBytes) return { ok: false, res: erro(413, "Requisição grande demais.") };
  let texto: string;
  try { texto = await req.text(); } catch { return { ok: false, res: erro(400, "Requisição inválida.") }; }
  if (Buffer.byteLength(texto) > maxBytes) return { ok: false, res: erro(413, "Requisição grande demais.") };
  let json: unknown;
  try { json = texto ? JSON.parse(texto) : {}; } catch { return { ok: false, res: erro(400, "JSON inválido.") }; }
  const r = schema.safeParse(json);
  if (!r.success) return { ok: false, res: erro(400, r.error.issues[0]?.message ?? "Dados inválidos.") };
  return { ok: true, dados: r.data };
}

interface OpcoesAcao<T extends z.ZodTypeAny | undefined> {
  /** admin = só admin (vendedor recebe 403 sem sequer consultar o contrato); dono_ou_admin = vendedor dono ou admin. */
  quem: "admin" | "dono_ou_admin";
  corpo?: T;
  /** Regra extra da Central antes de executar (ex.: ZapSign ligado ou desligado). Devolva uma Response para barrar. */
  antes?: (ctx: CtxContratos, contrato: RegistroContrato) => Response | null | Promise<Response | null>;
  executar: (a: {
    ctx: CtxContratos;
    contrato: RegistroContrato;
    corpo: T extends z.ZodTypeAny ? z.infer<T> : undefined;
  }) => Promise<unknown>;
  nome: string;
}

/**
 * Esqueleto das rotas POST /api/contratos/[id]/...: sessão → papel (403) → contrato do próprio vendedor (404 genérico)
 * → regra extra → corpo (zod) → função do pacote. Erros de regra do pacote voltam como mensagem; internos, genéricos.
 */
export async function acaoContrato<T extends z.ZodTypeAny | undefined = undefined>(
  req: Request, id: string, op: OpcoesAcao<T>,
): Promise<Response> {
  const auth = await contextoContratos();
  if (!auth.ok) return erro(auth.status, auth.status === 401 ? "Não autenticado." : "Acesso negado.");
  const { ctx } = auth;
  if (op.quem === "admin" && ctx.papel !== "admin") return erro(403, "Acesso negado.");

  const contrato = await buscarContratoAutorizado(id, ctx);
  if (!contrato) return naoEncontrado();

  const barrar = op.antes ? await op.antes(ctx, contrato) : null;
  if (barrar) return barrar;

  let corpo: unknown = undefined;
  if (op.corpo) {
    const lido = await lerCorpoJson(req, op.corpo);
    if (!lido.ok) return lido.res;
    corpo = lido.dados;
  }
  try {
    const dados = await op.executar({ ctx, contrato, corpo: corpo as never });
    return resposta({ ok: true, ...(dados && typeof dados === "object" ? dados : {}) });
  } catch (e) {
    logErro(op.nome, id, e);
    return erro(400, mensagemSegura(e));
  }
}

export { repositorio };
