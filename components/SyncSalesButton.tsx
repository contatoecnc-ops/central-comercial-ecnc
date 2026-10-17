"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SyncSalesButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function sync() {
    setBusy(true);
    try {
      const res = await fetch("/api/sync-vendas", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro na sincronização");
      const alerts = (json.warnings as string[]).filter((w) => w.startsWith("CONFERÊNCIA")).length;
      if (alerts) toast.warning(`Sincronizado com ${alerts} divergência(s) na conferência`);
      else toast.success(`${json.rows} linhas gravadas`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na sincronização");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={sync} disabled={busy}>
      <RefreshCw size={16} className={busy ? "animate-spin" : ""} /> {busy ? "Atualizando..." : "Atualizar agora"}
    </Button>
  );
}
