"use client";

import { useState } from "react";
import { ExternalLink, Pencil } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteButton } from "@/components/DeleteButton";
import { ManualForm } from "@/components/ManualForm";
import { deleteManual } from "@/app/actions/manuals";
import type { Manual, ManualFile, ManualKind } from "@/types/database";

const KIND_LABEL: Record<ManualKind, string> = {
  link: "Link",
  texto: "Texto",
  tabela_preco: "Tabela de preços",
};

function fmtBr(date: string) {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

export function ManualAdminItem({
  manual,
  files,
  categories,
}: {
  manual: Manual;
  files: ManualFile[];
  categories: string[];
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <Card className="p-5">
        <ManualForm
          manualId={manual.id}
          categories={categories}
          existingFiles={files}
          onDone={() => setEditing(false)}
          defaults={{
            kind: manual.kind,
            title: manual.title,
            category: manual.category,
            description: manual.description ?? "",
            drive_url: manual.drive_url ?? "",
            content: manual.content ?? "",
            valid_from: manual.valid_from ?? undefined,
            tags: manual.tags.join(", "),
            active: manual.active,
          }}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="font-semibold">
          {manual.title}
          {!manual.active && <span className="ml-2 text-xs font-normal text-muted">(inativo)</span>}
        </p>
        <p className="text-xs text-muted">
          {manual.category} · {KIND_LABEL[manual.kind]}
          {manual.kind === "tabela_preco" && (
            <>
              {" "}
              · Vigente desde {manual.valid_from ? fmtBr(manual.valid_from) : "—"} · {files.length}{" "}
              {files.length === 1 ? "arquivo" : "arquivos"}
            </>
          )}
        </p>
      </div>
      <div className="flex gap-2">
        {manual.kind === "link" && manual.drive_url && (
          <a href={manual.drive_url} target="_blank" rel="noopener noreferrer" aria-label="Abrir">
            <Button variant="ghost" size="sm" type="button">
              <ExternalLink size={14} />
            </Button>
          </a>
        )}
        {manual.kind !== "link" && (
          <Link href={`/admin/manuais/${manual.id}`} aria-label="Ver">
            <Button variant="ghost" size="sm" type="button">
              <ExternalLink size={14} />
            </Button>
          </Link>
        )}
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil size={14} /> Editar
        </Button>
        <DeleteButton action={deleteManual.bind(null, manual.id)} confirmText={`Excluir "${manual.title}"?`} />
      </div>
    </div>
  );
}
