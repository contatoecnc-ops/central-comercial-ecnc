"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { contentSchema, type ContentInput } from "@/lib/schemas";
import { fromInputValue } from "@/lib/dates";
import {
  CONTENT_BUCKET,
  CONTENT_EXT_MIME,
  CONTENT_MAX_BYTES,
  FILE_KINDS,
  STATUS_ORDER,
  contentExt,
  type ContentStatus,
  type FileKindContent,
} from "@/lib/marketing-config";

type Result = { error?: string };

/** Arquivo de um lote: já enviado ao Storage (path) ou link externo (url). */
export type ContentFilePlan = {
  kind: FileKindContent;
  name: string;
  path?: string;
  mime?: string;
  size?: number;
  url?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidateContent(id?: string) {
  revalidatePath("/admin/conteudo", "layout");
  revalidatePath("/marketing/dashboard");
  if (id) revalidatePath(`/admin/conteudo/${id}`);
}

/** Apaga objetos do Storage (melhor esforço; nunca registra nomes nem caminhos). */
async function removeObjects(paths: string[]) {
  if (paths.length === 0) return;
  try {
    await createClient().storage.from(CONTENT_BUCKET).remove(paths);
  } catch {
    // melhor esforço
  }
}

function itemRow(v: ContentInput) {
  return {
    title: v.title,
    caption: v.caption?.trim() || null,
    channels: v.channels,
    format: v.format || null,
    machine_id: v.machine_id || null,
    campaign: v.campaign || null,
    scheduled_for: v.scheduled_for ? fromInputValue(v.scheduled_for) : null,
    assigned_to: v.assigned_to || null,
  };
}

function validatePlan(contentId: string, files: ContentFilePlan[]): string | null {
  if (files.length > 10) return "Máximo de 10 arquivos por envio";
  for (const f of files) {
    if (!FILE_KINDS.includes(f.kind) || !f.name.trim() || f.name.length > 255) return "Arquivo inválido";
    if (f.path !== undefined) {
      const ext = contentExt(f.path);
      const okPath = new RegExp(`^${contentId}/[0-9a-f-]{36}\\.[a-z0-9]{2,4}$`, "i").test(f.path);
      if (!okPath || CONTENT_EXT_MIME[ext] !== f.mime) return "Arquivo inválido";
      if (!Number.isInteger(f.size) || f.size! <= 0 || f.size! > CONTENT_MAX_BYTES) return "Arquivo inválido";
    } else if (!f.url || !/^https?:\/\/\S+$/i.test(f.url) || f.url.length > 2000) {
      return "Link inválido";
    }
  }
  return null;
}

async function insertFiles(contentId: string, version: number, files: ContentFilePlan[], uploadedBy: string) {
  if (files.length === 0) return null;
  const { error } = await createClient()
    .from("content_files")
    .insert(
      files.map((f) => ({
        content_id: contentId,
        storage_path: f.path ?? null,
        external_url: f.path ? null : f.url!,
        file_name: f.name.trim(),
        mime_type: f.path ? f.mime! : null,
        size_bytes: f.path ? f.size! : null,
        kind: f.kind,
        version,
        uploaded_by: uploadedBy,
      }))
    );
  return error?.message ?? null;
}

export async function createContent(id: string, input: ContentInput, files: ContentFilePlan[] = []): Promise<Result> {
  const me = await requireProfile(["admin", "marketing"]);
  const newPaths = files.flatMap((f) => (f.path ? [f.path] : []));
  const fail = async (error: string): Promise<Result> => {
    await removeObjects(newPaths);
    return { error };
  };
  if (!UUID.test(id)) return fail("Conteúdo inválido");
  const parsed = contentSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const planError = validatePlan(id, files);
  if (planError) return fail(planError);

  const supabase = createClient();
  const { error } = await supabase
    .from("content_items")
    .insert({ id, ...itemRow(parsed.data), status: "ideia", created_by: me.id });
  if (error) return fail(error.message);

  const fileError = await insertFiles(id, 1, files, me.id);
  if (fileError) {
    await supabase.from("content_items").delete().eq("id", id);
    return fail(fileError);
  }
  revalidateContent(id);
  return {};
}

export async function updateContent(id: string, input: ContentInput): Promise<Result> {
  await requireProfile(["admin", "marketing"]);
  if (!UUID.test(id)) return { error: "Conteúdo inválido" };
  const parsed = contentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // a data de publicação tem campo próprio (setSchedule): a edição de dados não a toca
  const { scheduled_for: _ignored, ...fields } = itemRow(parsed.data);
  void _ignored;
  const { error } = await createClient().from("content_items").update(fields).eq("id", id);
  if (error) return { error: error.message };
  revalidateContent(id);
  return {};
}

/** Em aprovado/publicado só a data muda (o trigger também garante). */
export async function setSchedule(id: string, value: string): Promise<Result> {
  await requireProfile(["admin", "marketing"]);
  if (!UUID.test(id)) return { error: "Conteúdo inválido" };
  const { error } = await createClient()
    .from("content_items")
    .update({ scheduled_for: value ? fromInputValue(value) : null })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidateContent(id);
  return {};
}

export async function changeStatus(id: string, to: ContentStatus, comment?: string): Promise<Result> {
  await requireProfile(["admin", "marketing"]);
  if (!UUID.test(id) || !STATUS_ORDER.includes(to)) return { error: "Pedido inválido" };
  const supabase = createClient();
  const text = comment?.trim() || null;

  const { error } =
    to === "aprovado"
      ? await supabase.rpc("approve_content", { p_content_id: id, p_comment: text })
      : to === "ajustes"
        ? await supabase.rpc("request_changes", { p_content_id: id, p_comment: text ?? "" })
        : await supabase.rpc("set_content_status", { p_content_id: id, p_to: to, p_comment: text });
  if (error) return { error: error.message };
  revalidateContent(id);
  return {};
}

export async function addContentComment(id: string, body: string): Promise<Result> {
  const me = await requireProfile(["admin", "marketing"]);
  const text = body.trim();
  if (!UUID.test(id)) return { error: "Conteúdo inválido" };
  if (!text) return { error: "Escreva um comentário" };
  if (text.length > 5000) return { error: "Comentário muito longo" };
  const { error } = await createClient()
    .from("content_events")
    .insert({ content_id: id, actor_id: me.id, event_type: "comment", body: text });
  if (error) return { error: error.message };
  revalidateContent(id);
  return {};
}

/** Nova versão: todos os arquivos do lote entram na próxima versão do conteúdo. */
export async function addContentFiles(id: string, files: ContentFilePlan[]): Promise<Result> {
  const me = await requireProfile(["admin", "marketing"]);
  const newPaths = files.flatMap((f) => (f.path ? [f.path] : []));
  const fail = async (error: string): Promise<Result> => {
    await removeObjects(newPaths);
    return { error };
  };
  if (!UUID.test(id)) return fail("Conteúdo inválido");
  if (files.length === 0) return fail("Nenhum arquivo para adicionar");
  const planError = validatePlan(id, files);
  if (planError) return fail(planError);

  const supabase = createClient();
  const { data: last } = await supabase
    .from("content_files")
    .select("version")
    .eq("content_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const error = await insertFiles(id, (last?.version ?? 0) + 1, files, me.id);
  if (error) return fail(error);
  revalidateContent(id);
  return {};
}

/** Só o admin apaga arquivo (RLS e esta checagem). */
export async function deleteContentFile(fileId: string): Promise<Result> {
  await requireProfile("admin");
  if (!UUID.test(fileId)) return { error: "Arquivo inválido" };
  const supabase = createClient();
  const { data: file } = await supabase
    .from("content_files")
    .select("storage_path, content_id")
    .eq("id", fileId)
    .maybeSingle();
  if (!file) return { error: "Arquivo não encontrado" };

  const { data, error } = await supabase.from("content_files").delete().eq("id", fileId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Não foi possível apagar (conteúdo aprovado ou publicado está travado)" };
  if (file.storage_path) await removeObjects([file.storage_path as string]);
  revalidateContent(file.content_id as string);
  return {};
}

export async function deleteContent(id: string): Promise<Result> {
  await requireProfile(["admin", "marketing"]);
  if (!UUID.test(id)) return { error: "Conteúdo inválido" };
  const supabase = createClient();
  const { data: files } = await supabase.from("content_files").select("storage_path").eq("content_id", id);
  const { data, error } = await supabase.from("content_items").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Sem permissão para excluir este conteúdo" };
  // o cascade apaga as linhas; os objetos do Storage saem aqui
  await removeObjects((files ?? []).flatMap((f) => (f.storage_path ? [f.storage_path as string] : [])));
  revalidateContent();
  return {};
}
