"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { saveManual } from "@/app/actions/manuals";
import { manualSchema, type ManualInput } from "@/lib/schemas";

export function ManualForm({
  manualId,
  defaults,
  categories,
  onDone,
}: {
  manualId?: string;
  defaults?: Partial<ManualInput>;
  categories: string[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ManualInput>({
    resolver: zodResolver(manualSchema),
    defaultValues: { title: "", category: "", description: "", drive_url: "", tags: "", active: true, ...defaults },
  });

  async function onSubmit(values: ManualInput) {
    setSaving(true);
    const res = await saveManual(manualId ?? null, values);
    setSaving(false);
    if (res.error) return void toast.error(res.error);
    toast.success(manualId ? "Manual atualizado" : "Manual criado");
    if (!manualId) reset();
    onDone?.();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">
      <Field label="Título" error={errors.title?.message}>
        <Input {...register("title")} />
      </Field>
      <Field label="Categoria" error={errors.category?.message}>
        <Input list="manual-categories" placeholder="Prospecção, Objeções, Fechamento..." {...register("category")} />
        <datalist id="manual-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field label="Descrição" className="sm:col-span-2">
        <Textarea className="min-h-[72px]" {...register("description")} />
      </Field>
      <Field label="Link do Google Drive" error={errors.drive_url?.message} className="sm:col-span-2">
        <Input placeholder="https://drive.google.com/..." {...register("drive_url")} />
      </Field>
      <Field label="Tags" hint="Separadas por vírgula">
        <Input {...register("tags")} />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-[#E30613]" {...register("active")} />
        Ativo (visível aos vendedores)
      </label>
      <div className="flex justify-end gap-2 sm:col-span-2">
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={saving}>
          {saving ? "Salvando..." : manualId ? "Salvar" : "Adicionar manual"}
        </Button>
      </div>
    </form>
  );
}
