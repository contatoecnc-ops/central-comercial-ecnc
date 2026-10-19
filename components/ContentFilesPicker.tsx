"use client";

import { useRef, useState } from "react";
import { FileText, Film, Image as ImageIcon, Link2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { fmtSize } from "@/lib/manual-files";
import {
  CONTENT_ACCEPT,
  FILE_KINDS,
  FILE_KIND_LABEL,
  checkContentFile,
  contentExt,
  isImageMime,
  isVideoMime,
  type FileKindContent,
} from "@/lib/marketing-config";
import { removeContentObjects, uploadContentFile } from "@/lib/upload-content-file";
import type { ContentFilePlan } from "@/app/actions/content";

/** Arquivo ou link escolhido, ainda não registrado. */
export type PendingItem = {
  key: string;
  kind: FileKindContent;
  name: string;
  file?: File;
  mime?: string;
  size?: number;
  url?: string;
  preview?: string;
  progress: number;
  error?: string;
};

type Setter = React.Dispatch<React.SetStateAction<PendingItem[]>>;

/**
 * Envia os arquivos pendentes ao Storage ({content_id}/{uuid}.{ext}) e devolve o lote a registrar.
 * `uploaded` guarda o que já subiu nesta tentativa (chave → caminho) para não reenviar numa nova tentativa.
 */
export async function uploadPending(
  contentId: string,
  items: PendingItem[],
  setItems: Setter,
  uploaded: Map<string, string>
): Promise<{ plan: ContentFilePlan[] } | { error: string }> {
  const plan: ContentFilePlan[] = [];
  for (const it of items) {
    if (it.url) {
      plan.push({ kind: it.kind, name: it.name, url: it.url });
      continue;
    }
    let path = uploaded.get(it.key);
    if (!path) {
      path = `${contentId}/${crypto.randomUUID()}.${contentExt(it.name)}`;
      const res = await uploadContentFile(path, it.file!, it.mime!, (pct) =>
        setItems((cur) => cur.map((c) => (c.key === it.key ? { ...c, progress: pct, error: undefined } : c)))
      );
      if (res.error) {
        setItems((cur) => cur.map((c) => (c.key === it.key ? { ...c, progress: 0, error: res.error } : c)));
        await removeContentObjects(Array.from(uploaded.values()));
        uploaded.clear();
        return { error: "Não foi possível enviar um dos arquivos." };
      }
      uploaded.set(it.key, path);
    }
    plan.push({ kind: it.kind, name: it.name, path, mime: it.mime, size: it.size });
  }
  return { plan };
}

function Thumb({ item }: { item: PendingItem }) {
  if (item.preview) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.preview} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />;
  }
  const Icon = item.url ? Link2 : isVideoMime(item.mime ?? null) ? Film : isImageMime(item.mime ?? null) ? ImageIcon : FileText;
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-white/5 text-muted">
      <Icon size={20} />
    </div>
  );
}

export function ContentFilesPicker({
  items,
  setItems,
  disabled,
  defaultKind = "arte",
  maxItems = 10,
}: {
  items: PendingItem[];
  setItems: Setter;
  disabled?: boolean;
  defaultKind?: FileKindContent;
  maxItems?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [link, setLink] = useState("");
  const [linkName, setLinkName] = useState("");

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    const room = maxItems - items.length;
    if (incoming.length > room) toast.error(`Máximo de ${maxItems} itens por envio.`);
    const next: PendingItem[] = [];
    for (const f of incoming.slice(0, Math.max(room, 0))) {
      const check = checkContentFile(f);
      if ("error" in check) {
        toast.error(check.error);
        continue;
      }
      next.push({
        key: crypto.randomUUID(),
        kind: isVideoMime(check.mime) ? "video" : defaultKind,
        name: f.name,
        file: f,
        mime: check.mime,
        size: f.size,
        preview: isImageMime(check.mime) ? URL.createObjectURL(f) : undefined,
        progress: 0,
      });
    }
    if (next.length) setItems((cur) => [...cur, ...next]);
  }

  function addLink() {
    const url = link.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) return void toast.error("Informe um link começando com http:// ou https://");
    if (items.length >= maxItems) return void toast.error(`Máximo de ${maxItems} itens por envio.`);
    let host = "link";
    try {
      host = new URL(url).hostname;
    } catch {
      // mantém "link"
    }
    setItems((cur) => [
      ...cur,
      { key: crypto.randomUUID(), kind: "video", name: linkName.trim() || host, url, progress: 0 },
    ]);
    setLink("");
    setLinkName("");
  }

  function remove(key: string) {
    setItems((cur) => {
      const it = cur.find((c) => c.key === key);
      if (it?.preview) URL.revokeObjectURL(it.preview);
      return cur.filter((c) => c.key !== key);
    });
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) addFiles(e.dataTransfer.files);
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !disabled && inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm text-muted transition-colors",
          dragging ? "border-brand bg-brand/5" : "border-border hover:border-white/30",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        <UploadCloud size={22} />
        <span>Arraste arquivos aqui ou clique para escolher</span>
        <span className="text-xs text-muted/70">PNG, JPG, WEBP, GIF, MP4, MOV, WEBM, PDF ou DOCX · até 50 MB cada</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={CONTENT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Adicionar link (Drive/YouTube): https://..." value={link} onChange={(e) => setLink(e.target.value)} className="min-w-[220px] flex-1" disabled={disabled} />
        <Input placeholder="Nome (opcional)" value={linkName} onChange={(e) => setLinkName(e.target.value)} className="w-44" disabled={disabled} />
        <Button type="button" variant="outline" className="shrink-0" disabled={disabled} onClick={addLink}>
          <Link2 size={14} /> Adicionar link
        </Button>
      </div>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.key} className="flex items-center gap-3 rounded-md border border-border p-2">
              <Thumb item={it} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{it.name}</p>
                <p className="text-xs text-muted">{it.url ? "Link externo" : fmtSize(it.size ?? 0)}</p>
                {it.file && it.progress > 0 && (
                  <div className="mt-1 h-1.5 overflow-hidden rounded bg-white/10">
                    <div className="h-full bg-brand transition-all" style={{ width: `${it.progress}%` }} />
                  </div>
                )}
                {it.error && <p className="mt-1 text-xs text-red-400">{it.error}</p>}
              </div>
              <Select
                value={it.kind}
                disabled={disabled}
                onChange={(e) =>
                  setItems((cur) => cur.map((c) => (c.key === it.key ? { ...c, kind: e.target.value as FileKindContent } : c)))
                }
                className="h-8 w-32 shrink-0 text-xs"
                aria-label="Tipo do arquivo"
              >
                {FILE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {FILE_KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
              <button
                type="button"
                aria-label="Remover"
                disabled={disabled}
                onClick={() => remove(it.key)}
                className="rounded p-1 text-red-400 hover:text-red-300 disabled:opacity-30"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
