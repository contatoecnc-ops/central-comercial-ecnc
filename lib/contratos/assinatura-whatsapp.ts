/**
 * Envio dos links de assinatura por WhatsApp (tela de detalhe do contrato).
 * Funções puras: sem acesso a banco, sem log. O link de assinatura é pessoal — nada daqui grava a mensagem.
 */

export type TelefoneWhatsapp = { ok: true; numero: string } | { ok: false; motivo: string };

/**
 * Só dígitos, com DDI 55. Aceita máscara, "+55", zero de tronco e número sem DDI.
 * Válido = 12 ou 13 dígitos (55 + DDD + 8 ou 9 dígitos), DDD 11–99; com 9 dígitos, o primeiro é 9 (celular).
 */
export function normalizarTelefoneWhatsapp(bruto: string | null | undefined): TelefoneWhatsapp {
  const digitos = String(bruto ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (!digitos) return { ok: false, motivo: "Telefone não cadastrado" };
  let completo: string;
  if (digitos.length === 10 || digitos.length === 11) completo = `55${digitos}`;
  else if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) completo = digitos;
  else return { ok: false, motivo: "Telefone inválido (use DDD + número, ex.: (14) 99111-2233)" };

  const ddd = Number(completo.slice(2, 4));
  const local = completo.slice(4);
  if (ddd < 11 || ddd > 99) return { ok: false, motivo: "Telefone inválido (DDD incorreto)" };
  if (local.length === 9 && local[0] !== "9") return { ok: false, motivo: "Telefone inválido (celular começa com 9)" };
  return { ok: true, numero: completo };
}

export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}

export function mensagemAssinatura(p: { nome: string; vendedor: string; numeroContrato: string; link: string }): string {
  const ola = primeiroNome(p.nome) ? `Olá, ${primeiroNome(p.nome)}!` : "Olá!";
  return `${ola} Aqui é ${p.vendedor} da ECNC. Segue o link para a assinatura digital do contrato ${p.numeroContrato}: ${p.link}`;
}

/** https://wa.me/<telefone>?text=<mensagem codificada>. Monta na hora; não guarde o resultado. */
export function linkWhatsapp(telefone: string, mensagem: string): string {
  return `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`;
}

// ───────────────────────────────────────────────────────────── quem vê o quê

export interface AssinanteEntrada { nome: string; email: string; papel: string; url?: string; assinou_em?: string }

export interface DadosParaTelefone {
  signatarios?: { email?: string; telefone?: string }[];
  contratante?: { telefone?: string };
  testemunha_cliente?: { celular?: string };
}

export interface EntradaPlano {
  assinantes: AssinanteEntrada[];
  status: string;
  /** Quem está olhando. */
  visao: "admin" | "vendedor";
  dados?: DadosParaTelefone;
  /** Celular do vendedor (testemunha ECNC), como foi gravado no contrato a partir do perfil dele. */
  celularVendedor?: string;
  numeroContrato: string;
  vendedorNome: string;
}

export type EstadoAssinante = "assinou" | "vez" | "aguardando";

export interface ItemPlano {
  indice: number;
  nome: string;
  papel: string;
  estado: EstadoAssinante;
  assinou_em?: string;
  /** Presente só quando esta pessoa pode receber o link agora e quem olha pode ver o link. */
  acoes?: {
    url: string;
    whatsapp: { ok: true; href: string } | { ok: false; motivo: string };
  };
  /** Texto de apoio quando não há botões (ex.: "Aguardando a assinatura anterior"). */
  aviso?: string;
}

export const AVISO_AGUARDANDO = "Aguardando a assinatura anterior";

export function telefoneDoAssinante(a: AssinanteEntrada, e: Pick<EntradaPlano, "dados" | "celularVendedor" | "assinantes">): string | undefined {
  const d = e.dados;
  if (a.papel === "cliente") {
    const s = d?.signatarios?.find((x) => x.email && x.email.toLowerCase() === a.email?.toLowerCase());
    const primeiroDoComprador = e.assinantes.find((x) => x.papel === "cliente") === a;
    return s?.telefone || (primeiroDoComprador ? d?.contratante?.telefone : undefined);
  }
  if (a.papel === "testemunha_cliente") return d?.testemunha_cliente?.celular;
  if (a.papel === "testemunha") return e.celularVendedor;
  return undefined; // garantidor e gestor: sem telefone no cadastro do contrato
}

/**
 * Plano do bloco "Assinaturas". A ordem da lista é a ordem de assinatura do ZapSign.
 * Regras de segurança (link pessoal):
 *  - botões só com o contrato em "enviado_cliente" e só para o PRÓXIMO pendente;
 *  - o vendedor nunca recebe o link do gestor (contratada), nem de ninguém fora da vez;
 *  - quem não é a vez não leva a URL para o HTML (o objeto nem existe).
 */
export function planejarAssinaturas(e: EntradaPlano): ItemPlano[] {
  const proximo = e.assinantes.findIndex((a) => !a.assinou_em);
  const aberto = e.status === "enviado_cliente";
  return e.assinantes.map((a, indice) => {
    const base = { indice, nome: a.nome, papel: a.papel };
    if (a.assinou_em) return { ...base, estado: "assinou" as const, assinou_em: a.assinou_em };
    if (indice !== proximo) return { ...base, estado: "aguardando" as const, ...(aberto ? { aviso: AVISO_AGUARDANDO } : {}) };
    // é a vez desta pessoa
    if (!aberto) return { ...base, estado: "vez" as const };
    if (e.visao === "vendedor" && a.papel === "contratada") return { ...base, estado: "vez" as const, aviso: "Vez do gestor ECNC assinar" };
    if (!a.url) return { ...base, estado: "vez" as const, aviso: "Link de assinatura indisponível" };
    const tel = normalizarTelefoneWhatsapp(telefoneDoAssinante(a, e));
    const whatsapp = tel.ok
      ? { ok: true as const, href: linkWhatsapp(tel.numero, mensagemAssinatura({ nome: a.nome, vendedor: e.vendedorNome, numeroContrato: e.numeroContrato, link: a.url })) }
      : { ok: false as const, motivo: tel.motivo };
    return { ...base, estado: "vez" as const, acoes: { url: a.url, whatsapp } };
  });
}
