import { NextResponse } from "next/server";
import { URL_ASSINADA_SEGUNDOS } from "@/lib/contratos-config";
import { erro, naoEncontrado } from "@/lib/contratos/rota";
import { buscarContratoAutorizado, contextoContratos, logErro, nomeDoArquivo } from "@/lib/contratos/servidor";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * URL assinada de 60 segundos, gerada só depois de checar a permissão (vendedor: só o próprio; admin: qualquer).
 * Sem parâmetro: o .docx do contrato. Com ?doc=N: o arquivo do N-ésimo documento do checklist.
 * O caminho vem sempre do banco, nunca do navegador. Responde com redirecionamento (serve para <a href>).
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await contextoContratos();
  if (!auth.ok) return erro(auth.status, auth.status === 401 ? "Não autenticado." : "Acesso negado.");
  const contrato = await buscarContratoAutorizado(params.id, auth.ctx);
  if (!contrato) return naoEncontrado();

  const docParam = new URL(req.url).searchParams.get("doc");
  let caminho: string | undefined = contrato.arquivo_path;
  if (docParam !== null) {
    if (!/^\d{1,3}$/.test(docParam)) return naoEncontrado();
    caminho = contrato.documentos[Number(docParam)]?.arquivo_path;
  }
  if (!caminho) return naoEncontrado();

  const { data, error } = await createAdminClient().storage.from("contratos")
    .createSignedUrl(caminho, URL_ASSINADA_SEGUNDOS, { download: nomeDoArquivo(caminho) });
  if (error || !data?.signedUrl) {
    logErro("url assinada", contrato.id, error ?? new Error("sem url"));
    return erro(500, "Não foi possível gerar o link do arquivo.");
  }
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "Cache-Control": "no-store" } });
}
