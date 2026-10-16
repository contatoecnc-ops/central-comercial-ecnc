"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { createUser } from "@/app/actions/users";
import { userSchema, type UserInput } from "@/lib/schemas";

export function UserForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UserInput>({
    resolver: zodResolver(userSchema),
    defaultValues: { full_name: "", email: "", password: "", role: "vendedor" },
  });

  async function onSubmit(values: UserInput) {
    setSaving(true);
    const res = await createUser(values);
    setSaving(false);
    if (res.error) return void toast.error(res.error);
    toast.success("Usuário criado");
    reset();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">
      <Field label="Nome completo" error={errors.full_name?.message}>
        <Input {...register("full_name")} />
      </Field>
      <Field label="Email" error={errors.email?.message}>
        <Input type="email" {...register("email")} />
      </Field>
      <Field label="Senha inicial" error={errors.password?.message}>
        <Input type="password" autoComplete="new-password" {...register("password")} />
      </Field>
      <Field label="Perfil">
        <Select {...register("role")}>
          <option value="vendedor">Vendedor</option>
          <option value="admin">Admin</option>
        </Select>
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Criando..." : "Criar usuário"}
        </Button>
      </div>
    </form>
  );
}
