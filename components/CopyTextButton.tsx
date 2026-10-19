"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyTextButton({ text, label = "Copiar texto" }: { text: string; label?: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Texto copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      <Copy size={14} /> {label}
    </Button>
  );
}
