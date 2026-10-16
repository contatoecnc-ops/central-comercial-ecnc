"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { createTask, updateTask } from "@/app/actions/tasks";
import { taskSchema, type TaskInput } from "@/lib/schemas";
import { statusLabels } from "@/components/StatusBadge";

interface Props {
  vendedores: { id: string; full_name: string }[];
  taskId?: string;
  defaults?: Partial<TaskInput>;
}

export function TaskForm({ vendedores, taskId, defaults }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TaskInput>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "",
      priority: "media",
      status: "pendente",
      assigned_to: "",
      due_date: "",
      ...defaults,
    },
  });

  async function onSubmit(values: TaskInput) {
    setSaving(true);
    const res = taskId ? await updateTask(taskId, values) : await createTask(values);
    setSaving(false);
    if (res.error) return void toast.error(res.error);
    toast.success(taskId ? "Tarefa atualizada" : "Tarefa criada");
    if (taskId) router.refresh();
    else router.push(`/admin/tarefas/${res.id}`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Field label="Título" error={errors.title?.message}>
        <Input placeholder="Ex: Ligar para cliente da proposta #123" {...register("title")} />
      </Field>
      <Field label="Descrição" error={errors.description?.message}>
        <Textarea {...register("description")} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Categoria" hint="Ex: Ligação, Follow-up, Proposta" error={errors.category?.message}>
          <Input {...register("category")} />
        </Field>
        <Field label="Vendedor" error={errors.assigned_to?.message}>
          <Select {...register("assigned_to")}>
            <option value="">Selecione...</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.full_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Prioridade">
          <Select {...register("priority")}>
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
          </Select>
        </Field>
        <Field label="Status">
          <Select {...register("status")}>
            {Object.entries(statusLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Prazo (SLA)" hint="Horário de Brasília" error={errors.due_date?.message}>
          <Input type="datetime-local" {...register("due_date")} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Salvando..." : taskId ? "Salvar alterações" : "Criar tarefa"}
        </Button>
      </div>
    </form>
  );
}
