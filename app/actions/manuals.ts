"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { manualSchema, type ManualInput } from "@/lib/schemas";
import { EXT_MIME, MANUAL_BUCKET, MAX_FILES_PER_MANUAL, MAX_FILE_BYTES, fileExt } from "@/lib/manual-files";

type Result = { error?: string };

/** Arquivo da tabela de preços na ordem final: já registrado (existingId) ou recém-enviado ao Storage. */
export type ManualFilePlan =
  | { existingId: string }
  | { path: string; name: string; mime: string; size: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function row(v: ManualInput) {
  return {
    kind: v.kind,
    title: v.title,
    category: v.category,
    description: v.description || null,
    drive_url: v.kind === "link" ? v.drive_url! : null,
    content: v.kind === "texto" ? v.content! : null,
    valid_from: v.kind === "tabela_preco" ? v.valid_from! : null,
    tags: (v.tags ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    active: v.active,
  };
}

function revalidateManuals() {
  revalidatePath("/admin/manuais");
  revalidatePath("/vendedor/manuais");
}

/** Remove objetos do Storage (melhor esforço; nunca registra nomes nem caminhos). */
async function removeObjects(paths: string[]) {
  if (paths.length === 0) return;
  const supabase = createClient();
  try {
    await supabase.storage.from(MANUAL_BUCKET).remove(paths);
  } catch {
    // melhor esforço
  }
}

function validateNewFile(manualId: string, f: { path: string; name: string; mime: string; size: number }) {
  const ext = fileExt(f.path);
  const pathOk = new RegExp(`^${manualId}/[0-9a-f-]{36}\\.[a-z0-9]{2,4}$`, "i").test(f.path);
  if (!pathOk || EXT_MIME[ext] !== f.mime) return false;
  if (!f.name.trim() || f.name.length > 255) return false;
  return Number.isInteger(f.size) && f.size > 0 && f.size <= MAX_FILE_BYTES;
}

export async function saveManual(
  manualId: string,
  mode: "create" | "update",
  input: ManualInput,
  files: ManualFilePlan[] = []
): Promise<Result> {
  const me = await requireProfile(["admin", "marketing"]);
  if (!UUID.test(manualId)) return { error: "Manual inválido" };

  const newPaths = files.flatMap((f) => ("path" in f ? [f.path] : []));
  const fail = async (error: string): Promise<Result> => {
    await removeObjects(newPaths);
    return { error };
  };

  const parsed = manualSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const isTable = parsed.data.kind === "tabela_preco";
  // tabela de preços é só do admin (o RLS também recusa)
  if (me.role !== "admin" && isTable) return fail("Apenas o admin gerencia tabelas de preço");

  if (isTable) {
    if (files.length < 1) return fail("Envie ao menos 1 arquivo");
    if (files.length > MAX_FILES_PER_MANUAL) return fail("Máximo de 10 arquivos por manual");
    for (const f of files) {
      if ("existingId" in f ? !UUID.test(f.existingId) : !validateNewFile(manualId, f)) {
        return fail("Arquivo inválido");
      }
    }
  } else if (files.length > 0) {
    return fail("Este tipo de manual não aceita arquivos");
  }

  const supabase = createClient();

  // Estado atual dos arquivos (para validar os existentes e achar os removidos)
  const { data: current, error: curErr } = await supabase
    .from("manual_files")
    .select("id, storage_path")
    .eq("manual_id", manualId);
  if (curErr) return fail("Não foi possível salvar o manual");
  const currentFiles = (current ?? []) as { id: string; storage_path: string }[];

  if (mode === "update") {
    const { data: existing } = await supabase.from("manuals").select("kind").eq("id", manualId).maybeSingle();
    if (!existing) return fail("Manual não encontrado");
    if (existing.kind !== parsed.data.kind) return fail("Não é possível mudar o tipo de um manual");
    if (me.role !== "admin" && existing.kind === "tabela_preco") return fail("Apenas o admin gerencia tabelas de preço");
  }

  const keptIds = new Set(files.flatMap((f) => ("existingId" in f ? [f.existingId] : [])));
  for (const id of Array.from(keptIds)) {
    if (!currentFiles.some((c) => c.id === id)) return fail("Arquivo não encontrado neste manual");
  }

  const { error: manualErr } =
    mode === "update"
      ? await supabase.from("manuals").update(row(parsed.data)).eq("id", manualId)
      : await supabase.from("manuals").insert({ id: manualId, ...row(parsed.data) });
  if (manualErr) return fail(manualErr.message);

  if (isTable) {
    // 1) remove registros descartados (libera vaga no limite de 10) 2) insere novos 3) reordena
    const removed = currentFiles.filter((c) => !keptIds.has(c.id));
    if (removed.length > 0) {
      const { error } = await supabase
        .from("manual_files")
        .delete()
        .in("id", removed.map((r) => r.id));
      if (error) return rollback(error.message);
    }

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const { error } =
        "existingId" in f
          ? await supabase.from("manual_files").update({ sort_order: i }).eq("id", f.existingId)
          : await supabase.from("manual_files").insert({
              manual_id: manualId,
              storage_path: f.path,
              file_name: f.name,
              mime_type: f.mime,
              size_bytes: f.size,
              sort_order: i,
            });
      if (error) return rollback(error.message);
    }

    await removeObjects(removed.map((r) => r.storage_path));
  }

  async function rollback(message: string): Promise<Result> {
    // Manual recém-criado e incompleto: apaga o registro (cascade nos arquivos) e os objetos enviados
    if (mode === "create") await supabase.from("manuals").delete().eq("id", manualId);
    await removeObjects(newPaths);
    return { error: message };
  }

  revalidateManuals();
  revalidatePath(`/vendedor/manuais/${manualId}`);
  return {};
}

export async function deleteManual(id: string): Promise<Result> {
  const me = await requireProfile(["admin", "marketing"]);
  if (!UUID.test(id)) return { error: "Manual inválido" };
  const supabase = createClient();

  if (me.role !== "admin") {
    const { data: m } = await supabase.from("manuals").select("kind").eq("id", id).maybeSingle();
    if (m?.kind === "tabela_preco") return { error: "Apenas o admin gerencia tabelas de preço" };
  }

  // o cascade do banco apaga os registros, mas não os objetos do Storage
  const { data: files } = await supabase.from("manual_files").select("storage_path").eq("manual_id", id);
  const { error } = await supabase.from("manuals").delete().eq("id", id);
  if (error) return { error: error.message };

  await removeObjects((files ?? []).map((f) => f.storage_path as string));
  revalidateManuals();
  return {};
}
