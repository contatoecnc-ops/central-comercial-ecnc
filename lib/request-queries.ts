import { createClient } from "@/lib/supabase/server";
import { PRIORITY_RANK } from "@/lib/marketing-config";
import type { ContentFile, ContentRequest, RequestComment, RequestFile } from "@/types/database";

export interface RequestProgress {
  progress: string;
  has_delivery: boolean;
}

/** Andamento simplificado das solicitações do próprio vendedor (função no banco; não abre content_items). */
export async function myProgress() {
  const { data } = await createClient().rpc("my_requests_progress");
  const map = new Map<string, RequestProgress>();
  for (const r of (data ?? []) as { request_id: string; progress: string; has_delivery: boolean }[]) {
    map.set(r.request_id, { progress: r.progress, has_delivery: r.has_delivery });
  }
  return map;
}

/** RLS devolve ao vendedor só as dele e ao admin todas. */
export async function listRequests() {
  const { data } = await createClient().from("content_requests").select("*").order("created_at", { ascending: false });
  return (data ?? []) as ContentRequest[];
}

export async function getRequest(id: string) {
  const supabase = createClient();
  const { data: request } = await supabase.from("content_requests").select("*").eq("id", id).maybeSingle();
  if (!request) return null;
  const [files, comments] = await Promise.all([
    supabase.from("request_files").select("*").eq("request_id", id).order("created_at"),
    supabase.from("request_comments").select("*").eq("request_id", id).order("created_at"),
  ]);
  return {
    request: request as ContentRequest,
    files: (files.data ?? []) as RequestFile[],
    comments: (comments.data ?? []) as RequestComment[],
  };
}

/** Entregas (arquivos "final") visíveis ao dono: a policy do banco só libera conteúdo aprovado ou publicado. */
export async function listDeliveryFiles(contentId: string) {
  const { data } = await createClient()
    .from("content_files")
    .select("*")
    .eq("content_id", contentId)
    .eq("kind", "final")
    .order("created_at");
  return (data ?? []) as ContentFile[];
}

export async function countNewRequests() {
  const { count } = await createClient()
    .from("content_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "nova");
  return count ?? 0;
}

/** Caixa de entrada do admin: urgentes primeiro e, dentro da prioridade, as mais antigas. */
export function sortInbox(list: ContentRequest[]) {
  return [...list].sort(
    (a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}
