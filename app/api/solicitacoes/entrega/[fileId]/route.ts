import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CONTENT_BUCKET } from "@/lib/marketing-config";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function deny(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
}

/**
 * Entrega ao vendedor: só arquivo "final" de conteúdo aprovado ou publicado da solicitação do próprio usuário.
 * A policy de content_files e a do Storage já limitam isso no banco; aqui conferimos de novo o perfil e o kind.
 */
export async function GET(request: NextRequest, { params }: { params: { fileId: string } }) {
  if (!UUID.test(params.fileId)) return deny(404, "Arquivo não encontrado");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return deny(401, "Sessão expirada");

  const { data: profile } = await supabase.from("profiles").select("role, active").eq("id", user.id).single();
  if (!profile || !profile.active || profile.role !== "vendedor") return deny(403, "Acesso negado");

  const { data: file } = await supabase
    .from("content_files")
    .select("bucket, storage_path, external_url, file_name, kind")
    .eq("id", params.fileId)
    .eq("kind", "final")
    .maybeSingle();
  if (!file || file.kind !== "final" || file.bucket !== "marketing") return deny(404, "Arquivo não encontrado");

  let target: string;
  if (file.storage_path) {
    const { data, error } = await supabase.storage
      .from(CONTENT_BUCKET)
      .createSignedUrl(file.storage_path, 60, { download: file.file_name });
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
