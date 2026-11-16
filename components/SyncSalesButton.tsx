"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SyncSalesButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sync-vendas", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Erro na sincronização");
      const alerts = (json.warnings as string[]).filter((w) => w.startsWith("CONFERÊNCIA")).length;
      if (alerts) toast.warning(`Sincronizado com ${alerts} divergência(s) na conferência`);
      else toast.success(`${json.rows} linhas gravadas`);
      router.refresh();
    } catch (e) {
      // a data da última sincronização com sucesso continua a do painel abaixo (não é alterada na falha)
      setError(e instanceof Error ? e.message : "Erro na sincronização");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={sync} disabled={busy}>
        <RefreshCw size={16} className={busy ? "animate-spin" : ""} /> {busy ? "Atualizando..." : "Atualizar agora"}
      </Button>
      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm font-semibold text-red-400">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            Falha na sincronização: {error}
            <span className="block text-xs font-normal text-muted">Os números abaixo são da última sincronização com sucesso.</span>
          </span>
        </p>
      )}
    </div>
  );
}
