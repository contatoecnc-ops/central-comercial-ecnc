"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { salvarPerfilContrato } from "@/app/actions/contratos";

export function PerfilContratoForm({
  userId,
  isVendedor,
  inicial,
}: {
  userId: string;
  isVendedor: boolean;
  inicial: { cpf: string; celular: string; telegram_user_id: string; contratos_liberado: boolean };
}) {
  const router = useRouter();
  const [v, setV] = useState(inicial);
  const [busy, setBusy] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await salvarPerfilContrato(userId, v);
    setBusy(false);
    if (res.error) return void toast.error(res.error);
    toast.success("Dados para contrato salvos");
    router.refresh();
  }

  return (
    <form onSubmit={salvar} className="space-y-5">
      <Field label="CPF" hint="Entra no contrato como testemunha ECNC. Só números ou com pontuação.">
        <Input value={v.cpf} onChange={(e) => setV({ ...v, cpf: e.target.value })} inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" />
      </Field>
      <Field label="Celular" hint="DDD + número, ex.: (14) 99999-0000">
        <Input value={v.celular} onChange={(e) => setV({ ...v, celular: e.target.value })} inputMode="tel" autoComplete="off" placeholder="(14) 99999-0000" />
      </Field>
      <Field
        label="ID do Telegram"
        hint="O usuário descobre mandando /id ou /start para o bot de contratos. Admins cadastram o deles para receber os avisos de gestor."
      >
        <Input value={v.telegram_user_id} onChange={(e) => setV({ ...v, telegram_user_id: e.target.value })} inputMode="numeric" autoComplete="off" placeholder="123456789" />
      </Field>
      {isVendedor ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 text-sm">
          <input
            type="checkbox"
            checked={v.contratos_liberado}
            onChange={(e) => setV({ ...v, contratos_liberado: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-[#E30613]"
          />
          <span>
            <span className="font-semibold">Liberar Contratos</span>
            <span className="block text-xs text-muted">Mostra o menu e libera as rotas de Contratos e o bot do Telegram para este vendedor.</span>
          </span>
        </label>
      ) : (
        <p className="text-xs text-muted">Admins sempre têm acesso a Contratos; não precisam de liberação.</p>
      )}
      <Button type="submit" disabled={busy}>
        Salvar
      </Button>
    </form>
  );
}
