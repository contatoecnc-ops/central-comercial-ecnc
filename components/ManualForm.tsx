"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Markdown } from "@/components/Markdown";
import { ManualFilesField, itemsFromExisting, type FileItem } from "@/components/ManualFilesField";
import { saveManual, type ManualFilePlan } from "@/app/actions/manuals";
import { manualSchema, type ManualInput } from "@/lib/schemas";
import { TZ } from "@/lib/dates";
import { formatInTimeZone } from "date-fns-tz";
import { fileExt } from "@/lib/manual-files";
import { removeManualObjects, uploadManualFile } from "@/lib/upload-manual-file";
import type { ManualFile } from "@/types/database";

const today = () => formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");

export function ManualForm({
  manualId,
  defaults,
  existingFiles = [],
  categories,
  onDone,
}: {
  manualId?: string;
  defaults?: Partial<ManualInput>;
  existingFiles?: ManualFile[];
  categories: string[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [items, setItems] = useState<FileItem[]>(() => itemsFromExisting(existingFiles));
  // id do manual novo gerado antes do upload (o caminho no Storage começa por ele)
  const newId = useRef<string>(crypto.randomUUID());
  const id = manualId ?? newId.current;
  // objetos já enviados nesta tentativa: chave do item → caminho
  const uploaded = useRef(new Map<string, string>());

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ManualInput>({
    resolver: zodResolver(manualSchema),
    defaultValues: {
      kind: "link",
      title: "",
      category: "",
      description: "",
      drive_url: "",
      content: "",
      valid_from: today(),
      tags: "",
      active: true,
      ...defaults,
    },
  });
  const kind = watch("kind");

  async function onSubmit(values: ManualInput) {
    const isTable = values.kind === "tabela_preco";
    if (isTable && items.length === 0) return void toast.error("Envie ao menos 1 arquivo.");

    setSaving(true);
    const newPaths: string[] = [];
    try {
      const plan: ManualFilePlan[] = [];
      if (isTable) {
        for (const it of items) {
          if (it.existing) {
            plan.push({ existingId: it.existing.id });
            continue;
          }
          let path = uploaded.current.get(it.key);
          if (!path) {
            path = `${id}/${crypto.randomUUID()}.${fileExt(it.name)}`;
            const res = await uploadManualFile(path, it.file!, it.mime, (pct) =>
              setItems((cur) => cur.map((c) => (c.key === it.key ? { ...c, progress: pct, error: undefined } : c)))
            );
            if (res.error) {
              setItems((cur) => cur.map((c) => (c.key === it.key ? { ...c, progress: 0, error: res.error } : c)));
              await removeManualObjects(Array.from(uploaded.current.values()));
              uploaded.current.clear();
              toast.error("Não foi possível enviar um dos arquivos.");
              return;
            }
            uploaded.current.set(it.key, path);
          }
          newPaths.push(path);
          plan.push({ path, name: it.name, mime: it.mime, size: it.size });
        }
      }

      const res = await saveManual(id, manualId ? "update" : "create", values, plan);
      if (res.error) {
        // a action já apagou os objetos enviados; a próxima tentativa reenvia
        uploaded.current.clear();
        setItems((cur) => cur.map((c) => (c.file ? { ...c, progress: 0 } : c)));
        return void toast.error(res.error);
      }
      toast.success(manualId ? "Manual atualizado" : "Manual criado");
      if (!manualId) {
        reset();
        setItems([]);
        uploaded.current.clear();
        newId.current = crypto.randomUUID();
      }
      onDone?.();
      router.refresh();
    } catch {
      await removeManualObjects(newPaths);
      uploaded.current.clear();
      toast.error("Falha ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">
      <Field label="Tipo" className="sm:col-span-2">
        <Select disabled={!!manualId} {...register("kind")}>
          <option value="link">Link (Google Drive)</option>
          <option value="texto">Texto (dica rápida)</option>
          <option value="tabela_preco">Tabela de preços (arquivos)</option>
        </Select>
      </Field>
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
      <Field
        label={kind === "tabela_preco" ? "Observação curta" : "Descrição"}
        hint={kind === "tabela_preco" ? "Ex.: Válida para pedidos até 30/11" : undefined}
        className="sm:col-span-2"
      >
        <Textarea className="min-h-[72px]" {...register("description")} />
      </Field>

      {kind === "link" && (
        <Field label="Link do Google Drive" error={errors.drive_url?.message} className="sm:col-span-2">
          <Input placeholder="https://drive.google.com/..." {...register("drive_url")} />
        </Field>
      )}

      {kind === "texto" && (
        <div className="space-y-1.5 sm:col-span-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Texto (Markdown)</label>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
              {preview ? "Editar" : "Pré-visualizar"}
            </Button>
          </div>
          {/* mantido montado para o valor não se perder ao alternar */}
          <Textarea
            className={preview ? "hidden" : "min-h-[200px]"}
            placeholder={"# Título\n\n- item\n- item\n\n**negrito**, *itálico*"}
            {...register("content")}
          />
          {preview && (
            <div className="min-h-[200px] rounded-md border border-border p-3">
              <Markdown source={watch("content") ?? ""} />
            </div>
          )}
          {errors.content?.message && <p className="text-xs text-red-400">{errors.content.message}</p>}
        </div>
      )}

      {kind === "tabela_preco" && (
        <>
          <Field label="Vigente desde" error={errors.valid_from?.message}>
            <Input type="date" {...register("valid_from")} />
          </Field>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Arquivos</label>
            <ManualFilesField items={items} setItems={setItems} disabled={saving} />
            <p className="text-xs text-muted/70">
              Para atualizar a tabela, remova os arquivos antigos, envie os novos e ajuste &quot;Vigente desde&quot;. Não há
              histórico de versões.
            </p>
          </div>
        </>
      )}

      <Field label="Tags" hint="Separadas por vírgula">
        <Input {...register("tags")} />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-[#E30613]" {...register("active")} />
        Ativo (visível aos vendedores)
      </label>
      <div className="flex justify-end gap-2 sm:col-span-2">
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone} disabled={saving}>
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
