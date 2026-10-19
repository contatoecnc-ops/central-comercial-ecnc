"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { ContentFilesPicker, uploadPending, type PendingItem } from "@/components/ContentFilesPicker";
import { addContentFiles, createContent, updateContent } from "@/app/actions/content";
import { contentSchema, type ContentInput } from "@/lib/schemas";
import { CHANNELS, FORMATS, PRIORITIES, PRIORITY_LABEL } from "@/lib/marketing-config";
import { removeContentObjects } from "@/lib/upload-content-file";

interface Option {
  id: string;
  label: string;
}

/** Novo conteúdo (com arquivos) ou edição dos campos de um conteúdo existente. */
export function ContentForm({
  contentId,
  defaults,
  machines,
  staff,
  locked = false,
}: {
  contentId?: string;
  defaults?: Partial<ContentInput>;
  machines: Option[];
  staff: Option[];
  /** aprovado/publicado: tudo travado (a data é editada à parte) */
  locked?: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<PendingItem[]>([]);
  // id gerado antes do upload: o caminho no Storage começa por ele
  const newId = useRef<string>(crypto.randomUUID());
  const uploaded = useRef(new Map<string, string>());
  const id = contentId ?? newId.current;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ContentInput>({
    resolver: zodResolver(contentSchema),
    defaultValues: {
      title: "",
      caption: "",
      channels: [],
      format: "",
      machine_id: "",
      campaign: "",
      priority: "media",
      scheduled_for: "",
      assigned_to: "",
      ...defaults,
    },
  });
  const channels = watch("channels");

  async function onSubmit(values: ContentInput) {
    setSaving(true);
    try {
      if (contentId) {
        const res = await updateContent(contentId, values);
        if (res.error) return void toast.error(res.error);
        toast.success("Conteúdo atualizado");
        router.refresh();
        return;
      }

      const up = await uploadPending(id, items, setItems, uploaded.current);
      if ("error" in up) return void toast.error(up.error);
      const res = await createContent(id, values, up.plan);
      if (res.error) {
        uploaded.current.clear(); // a action já apagou os objetos enviados
        setItems((cur) => cur.map((c) => (c.file ? { ...c, progress: 0 } : c)));
        return void toast.error(res.error);
      }
      toast.success("Conteúdo criado");
      router.push(`/admin/conteudo/${id}`);
      router.refresh();
    } catch {
      await removeContentObjects(Array.from(uploaded.current.values()));
      uploaded.current.clear();
      toast.error("Falha ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  const disabled = saving || locked;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">
      <Field label="Título" error={errors.title?.message} className="sm:col-span-2">
        <Input disabled={disabled} {...register("title")} />
      </Field>
      <Field label="Legenda / texto da peça" error={errors.caption?.message} className="sm:col-span-2">
        <Textarea className="min-h-[140px]" disabled={disabled} {...register("caption")} />
      </Field>

      <div className="space-y-1.5 sm:col-span-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Canais</label>
        <div className="flex flex-wrap gap-2">
          {CHANNELS.map((c) => {
            const on = channels.includes(c);
            return (
              <button
                key={c}
                type="button"
                disabled={disabled}
                onClick={() =>
                  setValue("channels", on ? channels.filter((x) => x !== c) : [...channels, c], { shouldDirty: true })
                }
                className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50 ${
                  on ? "border-brand bg-brand/20 text-white" : "border-border text-muted hover:text-white"
                }`}
              >
                {c}
              </button>
            );
          })}
        </div>
        {errors.channels?.message && <p className="text-xs text-red-400">{errors.channels.message}</p>}
      </div>

      <Field label="Formato">
        <Select disabled={disabled} {...register("format")}>
          <option value="">—</option>
          {FORMATS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </Select>
      </Field>
      <Field label="Produto">
        <Select disabled={disabled} {...register("machine_id")}>
          <option value="">—</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Campanha">
        <Input disabled={disabled} {...register("campaign")} />
      </Field>
      <Field label="Prioridade" hint={contentId ? "Pode ser alterada em qualquer status (campo ao lado do status)" : undefined}>
        <Select disabled={saving} {...register("priority")}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Responsável">
        <Select disabled={disabled} {...register("assigned_to")}>
          <option value="">—</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>
      {!contentId && (
        <Field label="Publicar em" hint="Horário de Brasília (opcional)">
          <Input type="datetime-local" {...register("scheduled_for")} />
        </Field>
      )}

      {!contentId && (
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">Arquivos e referências</label>
          <ContentFilesPicker items={items} setItems={setItems} disabled={saving} />
        </div>
      )}

      {!locked && (
        <div className="flex justify-end gap-2 sm:col-span-2">
          {!contentId && (
            <Button type="button" variant="ghost" disabled={saving} onClick={() => (reset(), setItems([]))}>
              Limpar
            </Button>
          )}
          <Button type="submit" disabled={saving}>
            {saving ? "Salvando..." : contentId ? "Salvar alterações" : "Criar conteúdo"}
          </Button>
        </div>
      )}
    </form>
  );
}

/** Nova versão de arquivos num conteúdo existente (ideia, produção ou ajustes). */
export function AddVersionPanel({ contentId, fromRequest = false }: { contentId: string; fromRequest?: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [busy, setBusy] = useState(false);
  const uploaded = useRef(new Map<string, string>());

  async function send() {
    if (items.length === 0) return void toast.error("Escolha ao menos um arquivo ou link.");
    setBusy(true);
    try {
      const up = await uploadPending(contentId, items, setItems, uploaded.current);
      if ("error" in up) return void toast.error(up.error);
      const res = await addContentFiles(contentId, up.plan);
      if (res.error) {
        uploaded.current.clear();
        setItems((cur) => cur.map((c) => (c.file ? { ...c, progress: 0 } : c)));
        return void toast.error(res.error);
      }
      toast.success("Nova versão enviada");
      setItems([]);
      uploaded.current.clear();
      router.refresh();
    } catch {
      await removeContentObjects(Array.from(uploaded.current.values()));
      uploaded.current.clear();
      toast.error("Falha ao enviar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <ContentFilesPicker items={items} setItems={setItems} disabled={busy} warnFinal={fromRequest} />
      <div className="flex justify-end">
        <Button type="button" onClick={send} disabled={busy || items.length === 0}>
          {busy ? "Enviando..." : "Enviar como nova versão"}
        </Button>
      </div>
    </div>
  );
}
