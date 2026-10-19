import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MANUAL_BUCKET } from "@/lib/manual-files";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function deny(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
}

/** Redireciona para uma URL assinada de 60 s. Usa a sessão do usuário, então o RLS do Storage vale. */
export async function GET(request: NextRequest, { params }: { params: { fileId: string } }) {
  if (!UUID.test(params.fileId)) return deny(404, "Arquivo não encontrado");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return deny(401, "Sessão expirada");

  const { data: profile } = await supabase.from("profiles").select("role, active").eq("id", user.id).single();
  if (!profile || !profile.active) return deny(403, "Acesso negado");

  const { data: file } = await supabase
    .from("manual_files")
    .select("storage_path, file_name, manual_id")
    .eq("id", params.fileId)
    .maybeSingle();
  if (!file) return deny(404, "Arquivo não encontrado");

  if (profile.role !== "admin" && profile.role !== "marketing") {
    const { data: manual } = await supabase
      .from("manuals")
      .select("active")
      .eq("id", file.manual_id)
      .maybeSingle();
    if (!manual?.active) return deny(404, "Arquivo não encontrado");
  }

  const download = request.nextUrl.searchParams.get("download") === "1";
  const { data, error } = await supabase.storage
    .from(MANUAL_BUCKET)
    .createSignedUrl(file.storage_path, 60, download ? { download: file.file_name } : undefined);
  if (error || !data?.signedUrl) return deny(404, "Arquivo não encontrado");

  const res = NextResponse.redirect(data.signedUrl, 302);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
