import { createClient } from "@/lib/supabase/server";
import { CONTENT_BUCKET, type ContentStatus } from "@/lib/marketing-config";
import type { ContentEvent, ContentFile, ContentItem } from "@/types/database";

export interface StaffUser {
  id: string;
  full_name: string;
  role: string;
}

export async function listStaff() {
  const { data } = await createClient()
    .from("profiles")
    .select("id, full_name, role")
    .in("role", ["admin", "marketing"])
    .eq("active", true)
    .order("full_name");
  return (data ?? []) as StaffUser[];
}

export async function listContent(opts?: { status?: ContentStatus[]; from?: string; to?: string }) {
  let q = createClient().from("content_items").select("*");
  if (opts?.status) q = q.in("status", opts.status);
  if (opts?.from) q = q.gte("scheduled_for", opts.from);
  if (opts?.to) q = q.lt("scheduled_for", opts.to);
  const { data } = await q
    .order("scheduled_for", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  return (data ?? []) as ContentItem[];
}

export async function listContentFiles(contentIds: string[]) {
  if (contentIds.length === 0) return [] as ContentFile[];
  const { data } = await createClient()
    .from("content_files")
    .select("*")
    .in("content_id", contentIds)
    .order("version")
    .order("created_at");
  return (data ?? []) as ContentFile[];
}

export async function getContent(id: string) {
  const supabase = createClient();
  const { data: item } = await supabase.from("content_items").select("*").eq("id", id).maybeSingle();
  if (!item) return null;
  const [files, events] = await Promise.all([
    listContentFiles([id]),
    supabase.from("content_events").select("*").eq("content_id", id).order("created_at"),
  ]);
  return { item: item as ContentItem, files, events: (events.data ?? []) as ContentEvent[] };
}

export async function countByStatus() {
  const { data } = await createClient().from("content_items").select("status");
  const counts: Record<string, number> = {};
  for (const r of data ?? []) counts[r.status as string] = (counts[r.status as string] ?? 0) + 1;
  return counts;
}

/** Arquivos da última versão de cada conteúdo. */
export function latestFiles(files: ContentFile[]) {
  const byContent = new Map<string, ContentFile[]>();
  for (const f of files) {
    const list = byContent.get(f.content_id) ?? [];
    list.push(f);
    byContent.set(f.content_id, list);
  }
  const out = new Map<string, ContentFile[]>();
  byContent.forEach((list, id) => {
    const max = Math.max(...list.map((f) => f.version));
    out.set(id, list.filter((f) => f.version === max));
  });
  return out;
}

/** URL assinada gerada no servidor com a sessão do usuário (o RLS do Storage vale). */
export async function signedContentUrl(path: string, seconds: number) {
  const { data } = await createClient().storage.from(CONTENT_BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

export async function profileNames(ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data } = await createClient().from("profiles").select("id, full_name").in("id", unique);
  for (const p of data ?? []) map.set(p.id as string, p.full_name as string);
  return map;
}

/** Pendentes de aprovação (contador da sidebar e das abas). */
export async function countPendingApproval() {
  const { count } = await createClient()
    .from("content_items")
    .select("id", { count: "exact", head: true })
    .eq("status", "em_aprovacao");
  return count ?? 0;
}
