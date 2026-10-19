"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, FileSpreadsheet, FileText, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ACCEPT_ATTR,
  MAX_FILES_PER_MANUAL,
  checkLocalFile,
  fmtSize,
  kindOfMime,
} from "@/lib/manual-files";
import type { ManualFile } from "@/types/database";

/** Arquivo na lista do formulário: já registrado (existing) ou escolhido agora (file). */
export type FileItem = {
  key: string;
  name: string;
  size: number;
  mime: string;
  existing?: ManualFile;
  file?: File;
  preview?: string; // miniatura local (imagem nova)
  progress: number;
  error?: string;
};

export function itemsFromExisting(files: ManualFile[]): FileItem[] {
  return files.map((f) => ({
    key: f.id,
    name: f.file_name,
    size: f.size_bytes,
    mime: f.mime_type,
    existing: f,
    progress: 100,
  }));
}

function Thumb({ item }: { item: FileItem }) {
  const isImage = kindOfMime(item.mime) === "imagem";
  const src = item.preview ?? (item.existing && isImage ? `/api/manuais/arquivo/${item.existing.id}` : null);
  if (isImage && src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />;
  }
  const Icon = kindOfMime(item.mime) === "pdf" ? FileText : FileSpreadsheet;
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-white/5 text-muted">
      <Icon size={20} />
    </div>
  );
}

export function ManualFilesField({
  items,
  setItems,
  disabled,
}: {
  items: FileItem[];
  setItems: React.Dispatch<React.SetStateAction<FileItem[]>>;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    const room = MAX_FILES_PER_MANUAL - items.length;
    if (incoming.length > room) toast.error(`Máximo de ${MAX_FILES_PER_MANUAL} arquivos por manual.`);
    const next: FileItem[] = [];
    for (const f of incoming.slice(0, Math.max(room, 0))) {
      const check = checkLocalFile(f);
      if ("error" in check) {
        toast.error(check.error);
        continue;
      }
      next.push({
        key: crypto.randomUUID(),
        name: f.name,
        size: f.size,
        mime: check.mime,
        file: f,
        preview: check.mime.startsWith("image/") ? URL.createObjectURL(f) : undefined,
        progress: 0,
      });
    }
    if (next.length) setItems((cur) => [...cur, ...next]);
  }

  function remove(key: string) {
    setItems((cur) => {
      const it = cur.find((c) => c.key === key);
      if (it?.preview) URL.revokeObjectURL(it.preview);
      return cur.filter((c) => c.key !== key);
    });
  }

  function move(index: number, dir: -1 | 1) {
    setItems((cur) => {
      const j = index + dir;
      if (j < 0 || j >= cur.length) return cur;
      const copy = [...cur];
      [copy[index], copy[j]] = [copy[j], copy[index]];
      return copy;
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
        <span className="text-xs text-muted/70">
          PNG, JPG, WEBP, PDF, XLSX, XLS ou CSV · até 10 MB cada · máx. {MAX_FILES_PER_MANUAL} arquivos
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={it.key} className="flex items-center gap-3 rounded-md border border-border p-2">
              <Thumb item={it} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{it.name}</p>
                <p className="text-xs text-muted">{fmtSize(it.size)}</p>
                {it.file && it.progress > 0 && (
                  <div className="mt-1 h-1.5 overflow-hidden rounded bg-white/10">
                    <div className="h-full bg-brand transition-all" style={{ width: `${it.progress}%` }} />
                  </div>
                )}
                {it.error && <p className="mt-1 text-xs text-red-400">{it.error}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label="Subir"
                  disabled={disabled || i === 0}
                  onClick={() => move(i, -1)}
                  className="rounded p-1 text-muted hover:text-white disabled:opacity-30"
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Descer"
                  disabled={disabled || i === items.length - 1}
                  onClick={() => move(i, 1)}
                  className="rounded p-1 text-muted hover:text-white disabled:opacity-30"
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Remover"
                  disabled={disabled}
                  onClick={() => remove(it.key)}
                  className="rounded p-1 text-red-400 hover:text-red-300 disabled:opacity-30"
                >
                  <X size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
