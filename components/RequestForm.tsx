"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { FileText, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { addRequestFiles, createRequest, removeRequestFile, updateRequest } from "@/app/actions/requests";
import { requestSchema, type RequestInput } from "@/lib/schemas";
import { fmtSize } from "@/lib/manual-files";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  REQUEST_ACCEPT,
  REQUEST_MAX_FILES,
  REQUEST_TYPES,
  checkRequestFile,
} from "@/lib/marketing-config";
import { removeRequestObjects, uploadRequestFile } from "@/lib/upload-request-file";
import type { RequestFile } from "@/types/database";

type Pending = { key: string; file: File; mime: string; progress: number; error?: string };

/** Nova solicitação (com anexos) ou edição de uma solicitação ainda "nova". */
export function RequestForm({
  requestId,
  defaults,
  existingFiles = [],
  machines,
}: {
  requestId?: string;
  defaults?: Partial<RequestInput>;
  existingFiles?: RequestFile[];
  machines: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const newId = useRef<string>(crypto.randomUUID());
  const id = requestId ?? newId.current;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RequestInput>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      title: "",
      description: "",
      request_type: "",
      machine_id: "",
      desired_by: "",
      priority: "media",
      ...defaults,
    },
  });
  const priority = watch("priority");
  const room = REQUEST_MAX_FILES - existingFiles.length - pending.length;

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    if (incoming.length > room) toast.error(`Máximo de ${REQUEST_MAX_FILES} anexos por solicitação.`);
    const next: Pending[] = [];
    for (const f of incoming.slice(0, Math.max(room, 0))) {
      const check = checkRequestFile(f);
      if ("error" in check) {
        toast.error(check.error);
        continue;
      }
      next.push({ key: crypto.randomUUID(), file: f, mime: check.mime, progress: 0 });
    }
    if (next.length) setPending((cur) => [...cur, ...next]);
  }

  /** Envia os anexos pendentes e registra. Devolve false se algo falhou (já limpou o que subiu). */
  async function sendFiles(): Promise<boolean> {
    if (pending.length === 0) return true;
    const sent: { path: string; name: string; mime: string; size: number }[] = [];
    for (const p of pending) {
      const path = `${id}/${crypto.randomUUID()}.${p.file.name.slice(p.file.name.lastIndexOf(".") + 1).toLowerCase()}`;
      const res = await uploadRequestFile(path, p.file, p.mime, (pct) =>
        setPending((cur) => cur.map((c) => (c.key === p.key ? { ...c, progress: pct, error: undefined } : c)))
      );
      if (res.error) {
        setPending((cur) => cur.map((c) => (c.key === p.key ? { ...c, progress: 0, error: res.error } : c)));
        await removeRequestObjects(sent.map((s) => s.path));
        toast.error("Não foi possível enviar um dos anexos.");
        return false;
      }
      sent.push({ path, name: p.file.name, mime: p.mime, size: p.file.size });
    }
    const res = await addRequestFiles(id, sent);
    if (res.error) {
      toast.error(res.error);
      return false;
    }
    setPending([]);
    return true;
  }

  async function onSubmit(values: RequestInput) {
    setSaving(true);
    try {
      if (requestId) {
        const res = await updateRequest(requestId, values);
        if (res.error) return void toast.error(res.error);
        if (!(await sendFiles())) return;
        toast.success("Solicitação atualizada");
        router.refresh();
        return;
      }
      const res = await createRequest(id, values);
      if (res.error) return void toast.error(res.error);
      const filesOk = await sendFiles();
      toast[filesOk ? "success" : "warning"](
        filesOk ? "Solicitação enviada" : "Solicitação criada, mas os anexos falharam. Anexe de novo pela tela da solicitação."
      );
      router.push(`/vendedor/solicitacoes/${id}`);
      router.refresh();
    } catch {
      toast.error("Falha ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">
      <Field label="Título" error={errors.title?.message} className="sm:col-span-2">
        <Input maxLength={140} placeholder="Ex.: Arte de lançamento da fibra 3 kW" {...register("title")} />
      </Field>
      <Field
        label="O que você precisa"
        error={errors.description?.message}
        hint="Diga para quem é, onde vai ser usado e o prazo."
        className="sm:col-span-2"
      >
        <Textarea className="min-h-[140px]" maxLength={4000} {...register("description")} />
      </Field>
      <Field label="Tipo" error={errors.request_type?.message}>
        <Select {...register("request_type")}>
          <option value="">Escolha...</option>
          {REQUEST_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
      </Field>
      <Field label="Máquina (opcional)">
        <Select {...register("machine_id")}>
          <option value="">—</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Preciso até (opcional)" error={errors.desired_by?.message}>
        <Input type="date" {...register("desired_by")} />
      </Field>
      <Field
        label="Prioridade sugerida"
        hint={
          priority === "urgente"
            ? "Urgente: explique na descrição o motivo da urgência."
            : "Use Urgente só com justificativa na descrição. O admin define a prioridade final."
        }
      >
        <Select {...register("priority")}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </Select>
      </Field>

      <div className="space-y-2 sm:col-span-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">
          Anexos de referência ({existingFiles.length + pending.length}/{REQUEST_MAX_FILES})
        </label>
        {room > 0 && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-center text-sm text-muted transition-colors ${
              dragging ? "border-brand bg-brand/5" : "border-border hover:border-white/30"
            }`}
          >
            <UploadCloud size={20} />
            <span>Arraste ou clique para anexar</span>
            <span className="text-xs text-muted/70">PNG, JPG, WEBP, PDF, DOCX ou XLSX · até 10 MB cada</span>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={REQUEST_ACCEPT}
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        )}

        <ul className="space-y-2">
          {existingFiles.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-md border border-border p-2 text-sm">
              <FileText size={16} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate">{f.file_name}</span>
              <span className="text-xs text-muted">{fmtSize(f.size_bytes)}</span>
              <button
                type="button"
                aria-label="Remover anexo"
                disabled={saving}
                onClick={async () => {
                  const res = await removeRequestFile(f.id);
                  if (res.error) return void toast.error(res.error);
                  router.refresh();
                }}
                className="rounded p-1 text-red-400 hover:text-red-300"
              >
                <X size={16} />
              </button>
            </li>
          ))}
          {pending.map((p) => (
            <li key={p.key} className="rounded-md border border-border p-2 text-sm">
              <div className="flex items-center gap-3">
                <FileText size={16} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate">{p.file.name}</span>
                <span className="text-xs text-muted">{fmtSize(p.file.size)}</span>
                <button
                  type="button"
                  aria-label="Remover"
                  disabled={saving}
                  onClick={() => setPending((cur) => cur.filter((c) => c.key !== p.key))}
                  className="rounded p-1 text-red-400 hover:text-red-300"
                >
                  <X size={16} />
                </button>
              </div>
              {p.progress > 0 && (
                <div className="mt-1 h-1.5 overflow-hidden rounded bg-white/10">
                  <div className="h-full bg-brand transition-all" style={{ width: `${p.progress}%` }} />
                </div>
              )}
              {p.error && <p className="mt-1 text-xs text-red-400">{p.error}</p>}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Enviando..." : requestId ? "Salvar alterações" : "Enviar solicitação"}
        </Button>
      </div>
    </form>
  );
}
