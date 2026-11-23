import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AVISO_AGUARDANDO, linkWhatsapp, mensagemAssinatura, normalizarTelefoneWhatsapp, planejarAssinaturas, primeiroNome,
  type EntradaPlano,
} from "./assinatura-whatsapp";

const numero = (s: string | undefined) => {
  const r = normalizarTelefoneWhatsapp(s);
  return r.ok ? r.numero : null;
};

test("telefone: com máscara, com e sem DDI, +55 e zero de tronco", () => {
  assert.equal(numero("(14) 99111-2233"), "5514991112233");
  assert.equal(numero("14991112233"), "5514991112233");
  assert.equal(numero("55 14 99111-2233"), "5514991112233");
  assert.equal(numero("+55 (14) 99111-2233"), "5514991112233");
  assert.equal(numero("014 99111-2233"), "5514991112233");
  assert.equal(numero("(14) 3222-1100"), "551432221100"); // fixo: 12 dígitos
  assert.equal(numero("5514991112233"), "5514991112233"); // 13 dígitos já com DDI
});

test("telefone: DDD 55 (RS) sem DDI não é confundido com o DDI", () => {
  assert.equal(numero("(55) 99111-2233"), "5555991112233");
  assert.equal(numero("5599111-2233"), "5555991112233");
});

test("telefone: inválidos e ausentes", () => {
  for (const ruim of ["", "   ", undefined, null, "abc", "123", "9911-2233", "(14) 89111-2233", "(10) 99111-2233", "+1 415 555 2671", "1499111223344556"]) {
    const r = normalizarTelefoneWhatsapp(ruim as string | undefined);
    assert.equal(r.ok, false, `deveria rejeitar ${JSON.stringify(ruim)}`);
  }
  const vazio = normalizarTelefoneWhatsapp("");
  assert.equal(!vazio.ok && vazio.motivo, "Telefone não cadastrado");
});

test("mensagem-padrão e link wa.me codificado", () => {
  assert.equal(primeiroNome("  Maria  da Silva "), "Maria");
  const msg = mensagemAssinatura({ nome: "Maria da Silva", vendedor: "João Souza", numeroContrato: "2800/26", link: "https://app.zapsign.com.br/verificar/abc?x=1&y=2" });
  assert.equal(msg, "Olá, Maria! Aqui é João Souza da ECNC. Segue o link para a assinatura digital do contrato 2800/26: https://app.zapsign.com.br/verificar/abc?x=1&y=2");
  const href = linkWhatsapp("5514991112233", msg);
  assert.ok(href.startsWith("https://wa.me/5514991112233?text="));
  assert.equal(new URL(href).searchParams.get("text"), msg); // volta idêntica: & e ? do link não quebram o parâmetro
  assert.ok(!href.includes(" ") && !href.includes("\n"));
});

// ─────────────────────────────────────────────── plano do bloco

const base = (over: Partial<EntradaPlano> = {}): EntradaPlano => ({
  status: "enviado_cliente",
  visao: "vendedor",
  numeroContrato: "2800/26",
  vendedorNome: "João Souza",
  celularVendedor: "(14) 99888-7766",
  dados: {
    signatarios: [{ email: "Maria@cliente.com" }],
    contratante: { telefone: "(14) 3222-1100" },
    testemunha_cliente: { celular: "14 99555-4433" },
  },
  assinantes: [
    { nome: "Maria da Silva", email: "maria@cliente.com", papel: "cliente", url: "https://z/cliente" },
    { nome: "Pedro Testemunha", email: "pedro@x.com", papel: "testemunha_cliente", url: "https://z/tc" },
    { nome: "João Souza", email: "joao@ecnc.com", papel: "testemunha", url: "https://z/vendedor" },
    { nome: "Everaldo Gestor", email: "ever@ecnc.com", papel: "contratada", url: "https://z/gestor" },
  ],
  ...over,
});
const assinou = (e: EntradaPlano, n: number): EntradaPlano => ({
  ...e, assinantes: e.assinantes.map((a, i) => (i < n ? { ...a, assinou_em: "2026-11-20T15:00:00Z" } : a)),
});

test("plano: ninguém assinou — só o primeiro tem ações; os demais aguardam, sem URL", () => {
  const p = planejarAssinaturas(base());
  assert.equal(p[0].estado, "vez");
  assert.ok(p[0].acoes);
  assert.equal(p[0].acoes?.whatsapp.ok, true);
  for (const x of p.slice(1)) {
    assert.equal(x.estado, "aguardando");
    assert.equal(x.aviso, AVISO_AGUARDANDO);
    assert.equal(x.acoes, undefined);
  }
  const json = JSON.stringify(p.slice(1));
  for (const url of ["https://z/tc", "https://z/vendedor", "https://z/gestor"]) assert.ok(!json.includes(url), "URL fora da vez não pode ir para a tela");
});

test("plano: cliente assinou — vez da testemunha do cliente; depois do vendedor (dono), com telefone do cadastro", () => {
  let p = planejarAssinaturas(assinou(base(), 1));
  assert.equal(p[0].estado, "assinou");
  assert.equal(p[1].estado, "vez");
  assert.equal(p[1].acoes?.whatsapp.ok && new URL(p[1].acoes.whatsapp.href).pathname, "/5514995554433");
  assert.equal(p[2].acoes, undefined);

  p = planejarAssinaturas(assinou(base(), 2));
  assert.equal(p[2].estado, "vez");
  assert.equal(p[2].acoes?.url, "https://z/vendedor");
  assert.equal(p[2].acoes?.whatsapp.ok && new URL(p[2].acoes.whatsapp.href).pathname, "/5514998887766");
  assert.equal(p[3].acoes, undefined);
});

test("plano: vendedor nunca recebe o link do gestor, nem na vez dele; o admin recebe", () => {
  const e = assinou(base(), 3);
  const v = planejarAssinaturas({ ...e, visao: "vendedor" });
  assert.equal(v[3].estado, "vez");
  assert.equal(v[3].acoes, undefined);
  assert.ok(!JSON.stringify(v).includes("https://z/gestor"));
  const a = planejarAssinaturas({ ...e, visao: "admin" });
  assert.equal(a[3].acoes?.url, "https://z/gestor");
  assert.equal(a[3].acoes?.whatsapp.ok, false); // gestor sem telefone no cadastro do contrato
});

test("plano: todos assinaram (ou contrato fora de enviado_cliente) — sem ações e sem URL", () => {
  const todos = planejarAssinaturas({ ...assinou(base(), 4), status: "assinado" });
  assert.ok(todos.every((x) => x.estado === "assinou" && !x.acoes && x.assinou_em));
  for (const status of ["aprovado", "assinado", "cancelado", "aguardando_aprovacao"]) {
    const p = planejarAssinaturas(base({ status }));
    assert.ok(p.every((x) => !x.acoes && !x.aviso || x.estado === "assinou"), status);
    assert.ok(!JSON.stringify(p).includes("https://z/"), status);
  }
});

test("plano: telefone inválido ou ausente — copiar link continua, WhatsApp desabilitado com motivo", () => {
  const semTel = planejarAssinaturas(base({ dados: { signatarios: [{ email: "maria@cliente.com" }], contratante: {} } }));
  const w = semTel[0].acoes?.whatsapp;
  assert.equal(semTel[0].acoes?.url, "https://z/cliente");
  assert.deepEqual(w, { ok: false, motivo: "Telefone não cadastrado" });

  const invalido = planejarAssinaturas(base({ dados: { signatarios: [{ email: "maria@cliente.com", telefone: "12345" }] } }));
  assert.equal(invalido[0].acoes?.whatsapp.ok, false);
});

test("plano: telefone do signatário específico vence o do contratante; cliente extra não herda o do contratante", () => {
  const e = base({
    dados: { signatarios: [{ email: "maria@cliente.com", telefone: "(11) 98888-0000" }, { email: "outro@cliente.com" }], contratante: { telefone: "(14) 3222-1100" } },
    assinantes: [
      { nome: "Maria", email: "maria@cliente.com", papel: "cliente", url: "https://z/1", assinou_em: "2026-11-20T15:00:00Z" },
      { nome: "Outro Sócio", email: "outro@cliente.com", papel: "cliente", url: "https://z/2" },
    ],
  });
  const p = planejarAssinaturas(e);
  assert.deepEqual(p[1].acoes?.whatsapp, { ok: false, motivo: "Telefone não cadastrado" });
  const q = planejarAssinaturas({ ...e, assinantes: e.assinantes.map((a, i) => (i === 0 ? { ...a, assinou_em: undefined } : a)) });
  assert.equal(q[0].acoes?.whatsapp.ok && new URL(q[0].acoes.whatsapp.href).pathname, "/5511988880000");
});
