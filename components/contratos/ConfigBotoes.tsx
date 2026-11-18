"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Botões "Configurar webhook" (Telegram e ZapSign). A rota confere que quem clica é admin. */
export function ConfigBotao({ rota, rotulo, sucesso }: { rota: string; rotulo: string; sucesso: string }) {
  const [busy, setBusy] = useState(false);
  async function clicar() {
    setBusy(true);
    try {
      const r = await fetch(rota, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return void toast.error(j.erro ?? "Não foi possível configurar.");
      toast.success(sucesso);
    } catch {
      toast.error("Sem conexão. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="outline" disabled={busy} onClick={clicar}>
      {rotulo}
    </Button>
  );
}
