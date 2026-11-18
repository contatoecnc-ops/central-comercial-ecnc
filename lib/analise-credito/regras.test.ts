import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contratoParcelado, dataBR, documentosDoContrato, documentoValido, estadoAnalise, mascararDocumento, mascararEntrada,
  maisRecente, motivoBloqueioAprovacao, seloDe, validadeEfetiva,
} from "./regras";

const A = (o: Partial<{ resultado: "aprovada" | "reprovada"; analisada_em: string; validade_ate: string; created_at: string; id: string }> = {}) => ({
  id: "x", resultado: "aprovada" as const, analisada_em: "2026-11-01", validade_ate: "2026-12-31", created_at: "2026-11-01T10:00:00Z", ...o,
});

test("parcelado: só saldo em boleto (vem da config); à vista, cartão e financiamento não", () => {
  assert.equal(contratoParcelado("a_vista"), false);
  assert.equal(contratoParcelado("cartao", { parcelas: 12 }), false);
  assert.equal(contratoParcelado("financiamento", { parcelas: 1 }), false);
  assert.equal(contratoParcelado("entrada_boleto_nf", { parcelas: 12 }), true);
  assert.equal(contratoParcelado("faturado_recebimento", { parcelas: 3 }), true);
  assert.equal(contratoParcelado("condicao_que_nao_existe"), false);
});

test("documentos do contrato: comprador, signatários e garantidor (só dígitos, sem repetir)", () => {
  const docs = documentosDoContrato({
    contratante: { documento: "11.222.333/0001-81" },
    signatarios: [{ cpf: "529.982.247-25" }, { cpf: "153.509.460-56" }],
    garantidor: { cpf: "529.982.247-25" },
  });
  assert.deepEqual(docs.sort(), ["11222333000181", "15350946056", "52998224725"]);
  assert.deepEqual(documentosDoContrato(null), []);
  assert.deepEqual(documentosDoContrato({ contratante: { documento: "123" } }), []);
});

test("validade: usa a digitada; em branco, 60 dias depois da análise", () => {
  assert.equal(validadeEfetiva("2026-11-01", "2026-12-15"), "2026-12-15");
  assert.equal(validadeEfetiva("2026-11-01", ""), "2026-12-31");
  assert.equal(validadeEfetiva("2026-11-01", null), "2026-12-31");
});

test("estado: passou da validade = vencida (mesmo aprovada ou reprovada); no dia ainda vale", () => {
  assert.equal(estadoAnalise(A(), "2026-11-17"), "aprovada");
  assert.equal(estadoAnalise(A({ resultado: "reprovada" }), "2026-11-17"), "reprovada");
  assert.equal(estadoAnalise(A({ validade_ate: "2026-11-17" }), "2026-11-17"), "aprovada");
  assert.equal(estadoAnalise(A({ validade_ate: "2026-11-16" }), "2026-11-17"), "vencida");
  assert.equal(estadoAnalise(A({ resultado: "reprovada", validade_ate: "2026-11-16" }), "2026-11-17"), "vencida");
});

test("selo: a mais recente governa (data da análise, depois criação); sem análise = sem", () => {
  assert.deepEqual(seloDe([], "2026-11-17"), { estado: "sem" });
  const antiga = A({ id: "a", resultado: "aprovada", analisada_em: "2026-10-01", validade_ate: "2026-12-01" });
  const nova = A({ id: "n", resultado: "reprovada", analisada_em: "2026-11-10", validade_ate: "2026-12-30" });
  assert.equal(seloDe([antiga, nova], "2026-11-17").estado, "reprovada");
  const mesmoDia1 = A({ id: "1", created_at: "2026-11-10T08:00:00Z", resultado: "reprovada" });
  const mesmoDia2 = A({ id: "2", created_at: "2026-11-10T09:00:00Z", resultado: "aprovada" });
  assert.equal(maisRecente([mesmoDia1, mesmoDia2])?.id, "2");
});

test("trava de aprovação: só com a chave ligada, só parcelado e só sem análise aprovada e vigente", () => {
  const ok = { estado: "aprovada" as const };
  assert.equal(motivoBloqueioAprovacao(true, { estado: "sem" }, false), null); // chave desligada: só avisa
  assert.equal(motivoBloqueioAprovacao(false, { estado: "sem" }, true), null); // à vista
  assert.equal(motivoBloqueioAprovacao(true, ok, true), null);
  assert.match(motivoBloqueioAprovacao(true, null, true) ?? "", /sem análise/i);
  assert.match(motivoBloqueioAprovacao(true, { estado: "vencida" }, true) ?? "", /vencida/i);
  assert.match(motivoBloqueioAprovacao(true, { estado: "reprovada" }, true) ?? "", /reprovada/i);
});

test("documento válido, máscaras e data", () => {
  assert.equal(documentoValido("529.982.247-25"), true);
  assert.equal(documentoValido("111.111.111-11"), false);
  assert.equal(documentoValido("11.222.333/0001-81"), true);
  assert.equal(documentoValido("123"), false);
  assert.equal(mascararDocumento("52998224725"), "***.982.247-**");
  assert.equal(mascararDocumento("11222333000181"), "11.***.***/****-81");
  assert.equal(mascararEntrada("52998224725"), "529.982.247-25");
  assert.equal(mascararEntrada("11222333000181"), "11.222.333/0001-81");
  assert.equal(mascararEntrada("5299"), "529.9");
  assert.equal(dataBR("2026-12-05"), "05/12/2026");
});
