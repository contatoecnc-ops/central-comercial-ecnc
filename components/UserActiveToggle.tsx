"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setUserActive } from "@/app/actions/users";

export function UserActiveToggle({ id, active, disabled }: { id: string; active: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const res = await setUserActive(id, !active);
    setBusy(false);
    if (res.error) return void toast.error(res.error);
    toast.success(active ? "Usuário desativado" : "Usuário reativado");
    router.refresh();
  }

  return (
    <Button variant={active ? "danger" : "outline"} size="sm" onClick={toggle} disabled={busy || disabled}>
      {active ? "Desativar" : "Reativar"}
    </Button>
  );
}
