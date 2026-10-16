"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fromInputValue } from "@/lib/dates";
import { taskSchema, type TaskInput } from "@/lib/schemas";

type Result = { error?: string; id?: string };

function revalidateTasks(id?: string) {
  revalidatePath("/admin", "layout");
  revalidatePath("/vendedor", "layout");
  if (id) {
    revalidatePath(`/admin/tarefas/${id}`);
    revalidatePath(`/vendedor/tarefas/${id}`);
  }
}

function toRow(v: TaskInput) {
  const completed = v.status === "concluida";
  return {
    title: v.title,
    description: v.description || null,
    category: v.category || null,
    priority: v.priority,
    status: v.status,
    assigned_to: v.assigned_to,
    due_date: fromInputValue(v.due_date),
    completed_at: completed ? new Date().toISOString() : null,
  };
}

export async function createTask(input: TaskInput): Promise<Result> {
  const profile = await requireProfile("admin");
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert({ ...toRow(parsed.data), created_by: profile.id })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidateTasks();
  return { id: data.id };
}

export async function updateTask(id: string, input: TaskInput): Promise<Result> {
  await requireProfile("admin");
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = createClient();
  const { data: current } = await supabase.from("tasks").select("status, completed_at").eq("id", id).single();
  const row = toRow(parsed.data);
  // preserva a data de conclusão original se já estava concluída
  if (row.status === "concluida" && current?.status === "concluida" && current.completed_at) {
    row.completed_at = current.completed_at;
  }
  const { error } = await supabase.from("tasks").update(row).eq("id", id);
  if (error) return { error: error.message };
  revalidateTasks(id);
  return { id };
}

export async function addComment(taskId: string, body: string): Promise<Result> {
  const profile = await requireProfile();
  const text = body.trim();
  if (!text) return { error: "Escreva um comentário" };

  const supabase = createClient();
  const { error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, author_id: profile.id, body: text });
  if (error) return { error: `Não foi possível comentar: ${error.message}` };
  revalidateTasks(taskId);
  return {};
}

export async function startTask(taskId: string): Promise<Result> {
  await requireProfile();
  const supabase = createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status: "em_andamento" })
    .eq("id", taskId)
    .eq("status", "pendente");
  if (error) return { error: error.message };
  revalidateTasks(taskId);
  return {};
}

export async function completeTask(taskId: string, finalComment?: string): Promise<Result> {
  await requireProfile();
  const supabase = createClient();

  // Status + comentário final na mesma transação (função SQL complete_task)
  const { error } = await supabase.rpc("complete_task", {
    p_task_id: taskId,
    p_comment: finalComment?.trim() || null,
  });
  if (error) return { error: `Não foi possível concluir: ${error.message}` };
  revalidateTasks(taskId);
  return {};
}
