"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { setSheetName } from "@/app/actions/users";

/** Nome do vendedor exatamente como aparece na planilha de vendas (editável só pelo admin). */
export function SheetNameField({ id, value }: { id: string; value: string | null }) {
  const router = useRouter();
  const [text, setText] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  const dirty = text.trim() !== (value ?? "");

  async function save() {
    setBusy(true);
    const res = await setSheetName(id, text);
    setBusy(false);
    if (res.error) return void toast.error(res.error);
    toast.success("Nome na planilha salvo");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        title="Nome exatamente como na coluna Vendedor da planilha"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Como na coluna Vendedor"
        aria-label="Nome na planilha"
        className="h-8 min-w-[10rem] text-xs"
      />
      <Button size="sm" variant="outline" disabled={busy || !dirty} onClick={save}>
        Salvar
      </Button>
    </div>
  );
}
