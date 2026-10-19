"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestSchema, type RequestInput } from "@/lib/schemas";
import { fromInputValue } from "@/lib/dates";
import {
  PRIORITIES,
  REQUEST_BUCKET,
  REQUEST_EXT_MIME,
  REQUEST_MAX_BYTES,
  REQUEST_MAX_FILES,
} from "@/lib/marketing-config";

type Result = { error?: string };

export type RequestFilePlan = { path: string; name: string; mime: string; size: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ext = (n: string) => n.slice(n.lastIndexOf(".") + 1).toLowerCase();

function revalidateRequests(id?: string) {
  revalidatePath("/admin", "layout"); // contador da sidebar
  revalidatePath("/vendedor/solicitacoes");
  if (id) {
    revalidatePath(`/vendedor/solicitacoes/${id}`);
    revalidatePath(`/admin/conteudo/solicitacoes/${id}`);
  }
}

/** Apaga objetos (melhor esforço; nunca registra nomes nem caminhos). Com a sessão do dono, enquanto "nova". */
async function removeObjects(paths: string[]) {
  if (paths.length === 0) return;
  try {
    await createClient().storage.from(REQUEST_BUCKET).remove(paths);
  } catch {
    // melhor esforço
  }
}

function row(v: RequestInput) {
  return {
    title: v.title,
    description: v.description,
    request_type: v.request_type,
    machine_id: v.machine_id || null,
    desired_by: v.desired_by || null,
    priority: v.priority,
  };
}

function validPlan(id: string, files: RequestFilePlan[]) {
  if (files.length > REQUEST_MAX_FILES) return false;
  return files.every(
    (f) =>
      new RegExp(`^${id}/[0-9a-f-]{36}\\.[a-z0-9]{2,4}$`, "i").test(f.path) &&
      REQUEST_EXT_MIME[ext(f.path)] === f.mime &&
      f.name.trim().length > 0 &&
      f.name.length <= 255 &&
      Number.isInteger(f.size) &&
      f.size > 0 &&
      f.size <= REQUEST_MAX_BYTES
  );
}

/** Cria a solicitação (sem anexos): o id nasce no cliente para formar o caminho dos anexos no Storage. */
export async function createRequest(id: string, input: RequestInput): Promise<Result> {
  const me = await requireProfile("vendedor");
  if (!UUID.test(id)) return { error: "Solicitação inválida" };
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await createClient()
    .from("content_requests")
    .insert({ id, requested_by: me.id, ...row(parsed.data) });
  if (error) return { error: error.message };
  revalidateRequests(id);
  return {};
}

export async function updateRequest(id: string, input: RequestInput): Promise<Result> {
  await requireProfile("vendedor");
  if (!UUID.test(id)) return { error: "Solicitação inválida" };
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { data, error } = await createClient().from("content_requests").update(row(parsed.data)).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Solicitação já encerrada: não pode mais ser editada" };
  revalidateRequests(id);
  return {};
}

export async function addRequestFiles(id: string, files: RequestFilePlan[]): Promise<Result> {
  await requireProfile("vendedor");
  const paths = files.map((f) => f.path);
  if (!UUID.test(id) || files.length === 0 || !validPlan(id, files)) {
    await removeObjects(paths);
    return { error: "Arquivo inválido" };
  }
  const { error } = await createClient()
    .from("request_files")
    .insert(files.map((f) => ({ request_id: id, storage_path: f.path, file_name: f.name.trim(), mime_type: f.mime, size_bytes: f.size })));
  if (error) {
    await removeObjects(paths);
    return { error: error.message };
  }
  revalidateRequests(id);
  return {};
}

export async function removeRequestFile(fileId: string): Promise<Result> {
  await requireProfile("vendedor");
  if (!UUID.test(fileId)) return { error: "Arquivo inválido" };
  const supabase = createClient();
  const { data: file } = await supabase.from("request_files").select("storage_path, request_id").eq("id", fileId).maybeSingle();
  if (!file) return { error: "Arquivo não encontrado" };
  const { data, error } = await supabase.from("request_files").delete().eq("id", fileId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Solicitação já encerrada: anexos travados" };
  await removeObjects([file.storage_path as string]);
  revalidateRequests(file.request_id as string);
  return {};
}

/** Cancelar apaga as linhas dos anexos no banco; os objetos saem aqui (a solicitação já deixou de ser "nova"). */
export async function cancelRequest(id: string): Promise<Result> {
  await requireProfile("vendedor");
  if (!UUID.test(id)) return { error: "Solicitação inválida" };
  const { data, error } = await createClient().rpc("cancel_request", { p_request_id: id });
  if (error) return { error: error.message };
  const paths = ((data ?? []) as string[]).filter((p) => p.startsWith(`${id}/`));
  if (paths.length > 0) {
    try {
      await createAdminClient().storage.from(REQUEST_BUCKET).remove(paths);
    } catch {
      // melhor esforço
    }
  }
  revalidateRequests(id);
  return {};
}

export async function addRequestComment(id: string, body: string): Promise<Result> {
  const me = await requireProfile(["vendedor", "admin"]);
  const text = body.trim();
  if (!UUID.test(id)) return { error: "Solicitação inválida" };
  if (!text) return { error: "Escreva um comentário" };
  if (text.length > 4000) return { error: "Comentário muito longo" };
  const { error } = await createClient().from("request_comments").insert({ request_id: id, author_id: me.id, body: text });
  if (error) return { error: error.message };
  revalidateRequests(id);
  return {};
}

export interface ApproveInput {
  title: string;
  description: string;
  priority: string;
  assigned_to: string;
  scheduled_for: string; // datetime-local ou vazio
  note: string;
}

export async function approveRequest(id: string, input: ApproveInput): Promise<Result & { contentId?: string }> {
  await requireProfile("admin");
  if (!UUID.test(id)) return { error: "Solicitação inválida" };
  if (!(PRIORITIES as readonly string[]).includes(input.priority)) return { error: "Prioridade inválida" };
  if (input.assigned_to && !UUID.test(input.assigned_to)) return { error: "Responsável inválido" };
  const { data, error } = await createClient().rpc("approve_request", {
    p_request_id: id,
    p_title: input.title,
    p_description: input.description,
    p_priority: input.priority,
    p_assigned_to: input.assigned_to || null,
    p_scheduled_for: input.scheduled_for ? fromInputValue(input.scheduled_for) : null,
    p_note: input.note || null,
  });
  if (error) return { error: error.message };
  revalidateRequests(id);
  revalidatePath("/admin/conteudo", "layout");
  return { contentId: data as string };
}

export async function rejectRequest(id: string, note: string): Promise<Result> {
  await requireProfile("admin");
  if (!UUID.test(id)) return { error: "Solicitação inválida" };
  if (!note.trim()) return { error: "Informe o motivo da recusa" };
  const { error } = await createClient().rpc("reject_request", { p_request_id: id, p_note: note });
  if (error) return { error: error.message };
  revalidateRequests(id);
  return {};
}
