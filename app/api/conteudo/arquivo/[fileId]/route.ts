import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CONTENT_BUCKET, isVideoMime } from "@/lib/marketing-config";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function deny(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
}

/**
 * Redireciona para uma URL assinada (60 s; 1 h para vídeo, senão a reprodução é cortada).
 * Só admin e marketing ativos. Usa a sessão do usuário, então o RLS do Storage também vale.
 */
export async function GET(request: NextRequest, { params }: { params: { fileId: string } }) {
  if (!UUID.test(params.fileId)) return deny(404, "Arquivo não encontrado");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return deny(401, "Sessão expirada");

  const { data: profile } = await supabase.from("profiles").select("role, active").eq("id", user.id).single();
  if (!profile || !profile.active || (profile.role !== "admin" && profile.role !== "marketing")) {
    return deny(403, "Acesso negado");
  }

  const { data: file } = await supabase
    .from("content_files")
    .select("bucket, storage_path, external_url, file_name, mime_type")
    .eq("id", params.fileId)
    .maybeSingle();
  if (!file) return deny(404, "Arquivo não encontrado");

  let target: string;
  if (file.storage_path) {
    const download = request.nextUrl.searchParams.get("download") === "1";
    const { data, error } = await supabase.storage
      .from(file.bucket === "solicitacoes" ? "solicitacoes" : CONTENT_BUCKET)
      .createSignedUrl(file.storage_path, isVideoMime(file.mime_type) ? 3600 : 60, download ? { download: file.file_name } : undefined);
    if (error || !data?.signedUrl) return deny(404, "Arquivo não encontrado");
    target = data.signedUrl;
  } else if (file.external_url && /^https?:\/\//i.test(file.external_url)) {
    target = file.external_url;
  } else {
    return deny(404, "Arquivo não encontrado");
  }

  const res = NextResponse.redirect(target, 302);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
