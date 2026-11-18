import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ANALISE_PDF_MAX_BYTES } from "@/lib/contratos-config";
import { executarEmSegundoPlano } from "@/lib/contratos/background";
import { erro, resposta } from "@/lib/contratos/rota";
import { avisarAdminsTexto, logErro } from "@/lib/contratos/servidor";
import {
  documentoValido, estadoAnalise, hojeBrasilia, mascararDocumento, somenteDigitos, validadeEfetiva,
} from "@/lib/analise-credito/regras";
import {
  contextoAnalises, registrarEnvioAnalise, vincularContratosAbertosA,
} from "@/lib/analise-credito/servidor";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "Data inválida");

const Campos = z.strictObject({
  documentos: z
    .array(z.string().transform(somenteDigitos))
    .min(1, "Informe ao menos um CPF ou CNPJ.")
    .max(3, "No máximo 3 documentos.")
    .refine((l) => l.every(documentoValido), "CPF ou CNPJ inválido.")
    .transform((l) => Array.from(new Set(l))),
  cliente_nome: z.string().trim().min(1, "Informe o nome do cliente.").max(200),
  resultado: z.enum(["aprovada", "reprovada"], { message: "Informe o resultado." }),
  analisada_em: dataIso,
  validade_ate: dataIso.optional(),
});

/** Nome do arquivo só para exibição: sem caminho, sem caracteres estranhos. O caminho de armazenamento é do servidor. */
const nomeSeguro = (n: string) => (n.split(/[\\/]/).pop() ?? "analise.pdf").replace(/[^\p{L}\p{N}.\-_ ()]/gu, "_").slice(0, 120) || "analise.pdf";

// Financeiro ou admin: envia o PDF e os dados digitados. Nada é lido do PDF (só o início, para conferir que é PDF).
export async function POST(req: Request) {
  const auth = await contextoAnalises();
  if (!auth.ok) return erro(auth.status, auth.status === 401 ? "Não autenticado." : "Acesso negado.");
  const { ctx } = auth;

  if (!(req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) return erro(400, "Envie o formulário com o PDF.");
  if (Number(req.headers.get("content-length") ?? 0) > ANALISE_PDF_MAX_BYTES + 64 * 1024) return erro(413, "O arquivo passa de 10 MB.");

  let form: FormData;
  try { form = await req.formData(); } catch { return erro(400, "Requisição inválida."); }
  for (const k of Array.from(form.keys())) {
    if (!["arquivo", "documentos", "cliente_nome", "resultado", "analisada_em", "validade_ate"].includes(k)) return erro(400, "Campo não permitido.");
  }
  const bruto = {
    documentos: form.getAll("documentos").map(String).filter((d) => d.trim()),
    cliente_nome: form.get("cliente_nome") ?? "",
    resultado: form.get("resultado") ?? "",
    analisada_em: form.get("analisada_em") ?? "",
    validade_ate: String(form.get("validade_ate") ?? "").trim() || undefined,
  };
  const campos = Campos.safeParse(bruto);
  if (!campos.success) return erro(400, campos.error.issues[0]?.message ?? "Dados inválidos.");
  const v = campos.data;
  if (v.analisada_em > hojeBrasilia()) return erro(400, "A data da análise não pode ser futura.");
  const validade = validadeEfetiva(v.analisada_em, v.validade_ate);
  if (validade < v.analisada_em) return erro(400, "A validade não pode ser anterior à data da análise.");

  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return erro(400, "Anexe o PDF da análise.");
  if (arquivo.size > ANALISE_PDF_MAX_BYTES) return erro(400, "O arquivo passa de 10 MB.");
  const bytes = Buffer.from(await arquivo.arrayBuffer());
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return erro(400, "Envie um arquivo PDF."); // pelo conteúdo, não pela extensão

  if (!(await registrarEnvioAnalise(ctx.userId))) return erro(429, "Você atingiu o limite de 30 envios por hora. Tente de novo mais tarde.");

  const db = createAdminClient();
  const id = randomUUID();
  const caminho = `${new Date().getFullYear()}/${id}.pdf`; // montado pelo servidor
  const { error: upErr } = await db.storage.from("analises-credito").upload(caminho, bytes, { contentType: "application/pdf", upsert: false });
  if (upErr) {
    logErro("upload da análise", id, upErr);
    return erro(500, "Não foi possível salvar o arquivo. Tente de novo.");
  }
  const { error: insErr } = await db.from("analises_credito").insert({
    id, documentos: v.documentos, cliente_nome: v.cliente_nome, resultado: v.resultado,
    analisada_em: v.analisada_em, validade_ate: validade, arquivo_path: caminho, arquivo_nome: nomeSeguro(arquivo.name), enviado_por: ctx.userId,
  });
  if (insErr) {
    logErro("gravar análise", id, insErr);
    await db.storage.from("analises-credito").remove([caminho]);
    return erro(500, "Não foi possível salvar a análise. Tente de novo.");
  }

  // caminho inverso: contratos abertos com documento em comum
  const ligados = await vincularContratosAbertosA(id);
  executarEmSegundoPlano(async () => {
    if (!ligados.length) await avisarAdminsTexto("Nova análise de crédito na caixa de entrada.", { rotulo: "Abrir caixa de entrada", caminho: "/admin/contratos/analises" });
    for (const c of ligados) await avisarAdminsTexto(`Análise de crédito ligada ao contrato ${c.numero}.`, { rotulo: "Abrir contrato", caminho: `/admin/contratos/${c.id}` });
  });
  return resposta({ ok: true, id, vinculada: ligados.length > 0 }, 201);
}

const Consulta = z.object({
  pagina: z.coerce.number().int().min(1).max(10000).default(1),
  limite: z.coerce.number().int().min(1).max(50).default(20),
});

// Financeiro: só os próprios envios, sem nenhum dado de contrato. Admin: todos.
export async function GET(req: Request) {
  const auth = await contextoAnalises();
  if (!auth.ok) return erro(auth.status, auth.status === 401 ? "Não autenticado." : "Acesso negado.");
  const { ctx } = auth;
  const q = Consulta.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return erro(400, "Parâmetros inválidos.");
  const { pagina, limite } = q.data;

  const db = createAdminClient();
  let consulta = db
    .from("analises_credito")
    .select("id, cliente_nome, documentos, resultado, analisada_em, validade_ate, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((pagina - 1) * limite, pagina * limite - 1);
  if (ctx.papel === "financeiro") consulta = consulta.eq("enviado_por", ctx.userId);
  const { data, count, error } = await consulta;
  if (error) {
    logErro("listar análises", undefined, error);
    return erro(500, "Não foi possível listar.");
  }
  const ids = (data ?? []).map((a) => a.id);
  const { data: vinc } = ids.length ? await db.from("contratos_analises").select("analise_id").in("analise_id", ids) : { data: [] };
  const ligadas = new Set((vinc ?? []).map((v) => v.analise_id as string));
  const hoje = hojeBrasilia();
  return resposta({
    total: count ?? 0, pagina, limite,
    itens: (data ?? []).map((a) => ({
      id: a.id, cliente_nome: a.cliente_nome, documentos: (a.documentos as string[]).map(mascararDocumento),
      resultado: a.resultado, estado: estadoAnalise(a, hoje), analisada_em: a.analisada_em, validade_ate: a.validade_ate,
      created_at: a.created_at, situacao: ligadas.has(a.id) ? "vinculada" : "aguardando_contrato",
    })),
  });
}
