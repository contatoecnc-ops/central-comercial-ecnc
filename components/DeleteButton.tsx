"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DeleteButton({
  action,
  confirmText,
  redirectTo,
}: {
  action: () => Promise<{ error?: string }>;
  confirmText: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    const res = await action();
    setBusy(false);
    if (res.error) return void toast.error(res.error);
    toast.success("Excluído");
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  }

  return (
    <Button type="button" variant="danger" size="sm" disabled={busy} onClick={onClick} aria-label="Excluir">
      <Trash2 size={14} />
    </Button>
  );
}
