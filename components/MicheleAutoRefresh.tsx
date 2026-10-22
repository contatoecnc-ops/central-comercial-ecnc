"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { REFRESH_MS } from "@/lib/michele/config";

/** Atualiza os dados da página a cada 30 s; pausa com a aba escondida e atualiza ao voltar. */
export function MicheleAutoRefresh({ ms = REFRESH_MS }: { ms?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) timer = setInterval(() => router.refresh(), ms);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        router.refresh();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, ms]);

  return null;
}
