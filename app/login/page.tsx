"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/client";

const schema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Informe a senha"),
});
type Values = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Values) {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword(values);
    if (error || !data.user) {
      toast.error("Email ou senha incorretos");
      setLoading(false);
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, active")
      .eq("id", data.user.id)
      .single();
    if (!profile || !profile.active) {
      await supabase.auth.signOut();
      toast.error("Usuário sem acesso. Fale com o administrador.");
      setLoading(false);
      return;
    }
    router.replace(`/${profile.role}/dashboard`);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-5 rounded-lg border border-border bg-card p-6"
        >
          <div>
            <h1 className="text-xl font-extrabold">Entrar</h1>
            <p className="text-sm text-muted">Acesso restrito à equipe comercial.</p>
          </div>
          <Field label="Email" error={errors.email?.message}>
            <Input type="email" autoComplete="email" placeholder="voce@ecnc.com.br" {...register("email")} />
          </Field>
          <Field label="Senha" error={errors.password?.message}>
            <Input type="password" autoComplete="current-password" {...register("password")} />
          </Field>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
