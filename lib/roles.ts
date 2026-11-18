import type { Role } from "@/types/database";

/** Página inicial de cada papel (o financeiro só tem a tela de envio de análises de crédito). Seguro para cliente e servidor. */
export const homeDoPapel = (role: Role) => (role === "financeiro" ? "/financeiro/analises" : `/${role}/dashboard`);
