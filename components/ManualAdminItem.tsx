"use client";

import { useState } from "react";
import { ExternalLink, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteButton } from "@/components/DeleteButton";
import { ManualForm } from "@/components/ManualForm";
import { deleteManual } from "@/app/actions/manuals";
import type { Manual } from "@/types/database";

export function ManualAdminItem({ manual, categories }: { manual: Manual; categories: string[] }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <Card className="p-5">
        <ManualForm
          manualId={manual.id}
          categories={categories}
          onDone={() => setEditing(false)}
          defaults={{
            title: manual.title,
            category: manual.category,
            description: manual.description ?? "",
            drive_url: manual.drive_url,
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
        <p className="text-xs text-muted">{manual.category}</p>
      </div>
      <div className="flex gap-2">
        <a href={manual.drive_url} target="_blank" rel="noopener noreferrer" aria-label="Abrir">
          <Button variant="ghost" size="sm" type="button">
            <ExternalLink size={14} />
          </Button>
        </a>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil size={14} /> Editar
        </Button>
        <DeleteButton action={deleteManual.bind(null, manual.id)} confirmText={`Excluir "${manual.title}"?`} />
      </div>
    </div>
  );
}
