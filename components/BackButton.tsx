"use client";

import { createContext, useContext } from "react";
import { useRouter } from "next/navigation";

const HomeContext = createContext("/");

/** Página inicial do perfil (ex.: /vendedor/dashboard), usada quando não há histórico para voltar. */
export function BackHomeProvider({ home, children }: { home: string; children: React.ReactNode }) {
  return <HomeContext.Provider value={home}>{children}</HomeContext.Provider>;
}

/**
 * "← Voltar". Com `href`: destino fixo. Sem `href`: histórico do navegador
 * ou, se a página foi aberta direto por link, a página inicial do perfil.
 */
export function BackButton({ href }: { href?: string }) {
  const router = useRouter();
  const home = useContext(HomeContext);

  function onClick() {
    if (href) router.push(href);
    else if (window.history.length > 1) router.back();
    else router.push(home);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-2 mb-1 inline-flex min-h-[44px] items-center rounded-md px-2 text-sm font-medium text-muted transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:min-h-[36px]"
    >
      ← Voltar
    </button>
  );
}
