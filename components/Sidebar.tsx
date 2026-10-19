"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Cpu,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  TrendingUp,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { logout } from "@/app/actions/auth";
import type { Role } from "@/types/database";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV: Record<Role, NavItem[]> = {
  admin: [
    { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/tarefas", label: "Tarefas", icon: ListChecks },
    { href: "/admin/vendas", label: "Vendas", icon: TrendingUp },
    { href: "/admin/catalogo", label: "Catálogo", icon: Cpu },
    { href: "/admin/manuais", label: "Manuais", icon: BookOpen },
    { href: "/admin/usuarios", label: "Usuários", icon: Users },
  ],
  marketing: [
    { href: "/marketing/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/catalogo", label: "Catálogo", icon: Cpu },
    { href: "/admin/manuais", label: "Manuais", icon: BookOpen },
  ],
  vendedor: [
    { href: "/vendedor/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/vendedor/tarefas", label: "Minhas Tarefas", icon: ListChecks },
    { href: "/vendedor/catalogo", label: "Catálogo", icon: Cpu },
    { href: "/vendedor/manuais", label: "Manuais", icon: BookOpen },
  ],
};

export function Sidebar({ role, name }: { role: Role; name: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const panel = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b border-border px-5">
        <Logo />
        <button className="text-muted md:hidden" onClick={() => setOpen(false)} aria-label="Fechar menu">
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV[role].map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-md border-l-2 px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-brand bg-brand/10 text-white"
                  : "border-transparent text-muted hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon size={18} className={active ? "text-brand" : ""} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold">
            {initials(name)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="text-xs capitalize text-muted">{role}</p>
          </div>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut size={16} /> Sair
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background px-4 md:hidden">
        <button onClick={() => setOpen(true)} aria-label="Abrir menu" className="text-white">
          <Menu size={22} />
        </button>
        <Logo />
      </div>

      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-border bg-card md:block">{panel}</aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-border bg-card">{panel}</aside>
        </div>
      )}
    </>
  );
}
