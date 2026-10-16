"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { createMachine, updateMachine } from "@/app/actions/machines";
import { MACHINE_CATEGORIES, MEDIA_TYPES, machineSchema, mediaTypeLabels, type MachineInput } from "@/lib/schemas";

export function MachineForm({ machineId, defaults }: { machineId?: string; defaults?: Partial<MachineInput> }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<MachineInput>({
    resolver: zodResolver(machineSchema),
    defaultValues: {
      name: "",
      category: "CO2",
      tagline: "",
      description: "",
      thumbnail_url: "",
      active: true,
      sort_order: 0,
      specs: [],
      media: [],
      ...defaults,
    },
  });
  const specs = useFieldArray({ control, name: "specs" });
  const media = useFieldArray({ control, name: "media" });

  async function onSubmit(values: MachineInput) {
    setSaving(true);
    const res = machineId ? await updateMachine(machineId, values) : await createMachine(values);
    setSaving(false);
    if (res.error) return void toast.error(res.error);
    toast.success(machineId ? "Máquina atualizada" : "Máquina criada");
    router.push("/admin/catalogo");
    router.refresh();
  }

  const mediaError = errors.media?.find?.((m) => m?.title || m?.url);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nome" error={errors.name?.message}>
          <Input {...register("name")} />
        </Field>
        <Field label="Categoria">
          <Select {...register("category")}>
            {MACHINE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tagline" className="sm:col-span-2">
          <Input placeholder="Frase curta de posicionamento" {...register("tagline")} />
        </Field>
        <Field label="Descrição" className="sm:col-span-2">
          <Textarea className="min-h-[140px]" {...register("description")} />
        </Field>
        <Field label="URL da imagem principal" error={errors.thumbnail_url?.message} className="sm:col-span-2">
          <Input placeholder="https://..." {...register("thumbnail_url")} />
        </Field>
        <Field label="Ordem de exibição">
          <Input type="number" {...register("sort_order", { valueAsNumber: true })} />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[#E30613]" {...register("active")} />
          Publicada (visível aos vendedores)
        </label>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide">Especificações</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => specs.append({ label: "", value: "" })}>
            <Plus size={14} /> Adicionar
          </Button>
        </div>
        {specs.fields.map((f, i) => (
          <div key={f.id} className="flex gap-2">
            <Input placeholder="Potência" {...register(`specs.${i}.label`)} />
            <Input placeholder="100W" {...register(`specs.${i}.value`)} />
            <Button type="button" variant="ghost" size="sm" className="h-10" onClick={() => specs.remove(i)} aria-label="Remover">
              <X size={16} />
            </Button>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide">Mídia</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => media.append({ type: "foto", title: "", url: "" })}
          >
            <Plus size={14} /> Adicionar
          </Button>
        </div>
        {media.fields.map((f, i) => (
          <div key={f.id} className="grid gap-2 sm:grid-cols-[150px_1fr_2fr_auto]">
            <Select {...register(`media.${i}.type`)}>
              {MEDIA_TYPES.map((t) => (
                <option key={t} value={t}>
                  {mediaTypeLabels[t]}
                </option>
              ))}
            </Select>
            <Input placeholder="Título" {...register(`media.${i}.title`)} />
            <Input placeholder="https:// (Drive, YouTube, Vimeo...)" {...register(`media.${i}.url`)} />
            <Button type="button" variant="ghost" size="sm" className="h-10" onClick={() => media.remove(i)} aria-label="Remover">
              <X size={16} />
            </Button>
          </div>
        ))}
        {mediaError && (
          <p className="text-xs text-red-400">{mediaError.title?.message ?? mediaError.url?.message}</p>
        )}
      </section>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? "Salvando..." : "Salvar máquina"}
        </Button>
      </div>
    </form>
  );
}
