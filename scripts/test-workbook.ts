/**
 * Testa parseSalesWorkbook contra a planilha local (SALES_FIXTURE_XLSX; nunca versionada).
 * Uso: SALES_FIXTURE_XLSX="C:/caminho/KPI Vendas 2026.xlsx" npm run test:sales
 * Valores esperados: cópia de 16/10/2026. Mudam quando a planilha mudar.
 */
import assert from "node:assert/strict";
import readXlsxFile from "read-excel-file/node";
import { parseSalesWorkbook } from "../lib/sales/workbook";
import type { Matrix } from "../lib/sales/parse";
import { parseBRL, parseDateUTC } from "../lib/sales/parse";

const near = (a: number | null | undefined, b: number, msg: string) =>
  assert.ok(a !== null && a !== undefined && Math.abs(a - b) <= 0.03, `${msg}: obtido ${a}, esperado ${b}`);

// unidades
assert.equal(parseBRL("R$ 270.000,00"), 270000);
assert.equal(parseBRL("R$ 960.000,00"), 960000);
assert.equal(parseBRL("-1.234,56"), -1234.56);
assert.equal(parseBRL("(10,50)"), -10.5);
assert.equal(parseBRL("1234.56"), 1234.56);
assert.equal(parseBRL(" "), null);
assert.equal(parseBRL("abc"), null);
assert.equal(parseDateUTC(new Date(Date.UTC(2026, 9, 1))), "2026-10-01");
assert.equal(parseDateUTC(new Date("2026-07-31T23:30:00Z")), "2026-07-31");
assert.equal(parseDateUTC("16/10/2026"), "2026-10-16");
assert.equal(parseDateUTC(46296), "2026-10-01"); // 30/12/1899 + 46296 dias

async function main() {
  const file = process.env.SALES_FIXTURE_XLSX;
  if (!file) {
    console.log("Unidades OK. Defina SALES_FIXTURE_XLSX para testar contra a planilha.");
    return;
  }
  const sheets: Record<string, Matrix> = {};
  for (const s of await readXlsxFile(file)) sheets[s.sheet] = s.data as Matrix;

  const sellers = [
    { id: "luana", sheet_name: "LUANA MICHELE ACHILLES TANIGUTI" },
    { id: "matheus", sheet_name: "MATHEUS SOUZA BENICIO" },
    { id: "isabela", sheet_name: "ISABELA ARIANE PACCOLA" },
  ];
  const r = parseSalesWorkbook(sheets, sellers, new Date("2026-10-16T12:00:00Z"));

  const year = (id: string) => r.rows.filter((x) => x.seller_id === id);
  const sum = (rows: typeof r.rows, f: (m: (typeof r.rows)[number]["metrics"]) => number | null) =>
    rows.reduce((s, x) => s + (f(x.metrics) ?? 0), 0);
  const month = (id: string, p: string) => r.rows.find((x) => x.seller_id === id && x.period === p)!;

  const expected = {
    luana: { ano: 3366360.16, out: 64595.23, metaOut: 420000, metaAno: 5170000, M: 2408977, P: 957383 },
    matheus: { ano: 1110009.66, out: 11256.48, metaOut: 250000, metaAno: 2650000, M: 981680, P: 128330 },
    isabela: { ano: 202963.33, out: 2374, metaOut: 290000, metaAno: 4200000, M: 183825, P: 19138 },
  };
  for (const [id, e] of Object.entries(expected)) {
    assert.equal(year(id).length, 12, `${id}: 12 meses`);
    near(sum(year(id), (m) => m.vendas), e.ano, `${id} vendas no ano`);
    near(month(id, "2026-10").metrics.vendas, e.out, `${id} out/2026`);
    near(month(id, "2026-10").metrics.meta, e.metaOut, `${id} meta out`);
    near(sum(year(id), (m) => m.meta), e.metaAno, `${id} meta do ano`);
    assert.ok(Math.abs(sum(year(id), (m) => m.maquinas) - e.M) < 1, `${id} máquinas no ano`);
    assert.ok(Math.abs(sum(year(id), (m) => m.pecas) - e.P) < 1, `${id} peças no ano`);
  }

  const company = r.rows.filter((x) => x.seller_label === "__EMPRESA__");
  near(sum(company, (m) => m.vendas), 6190670.36, "total empresa");
  near(company.find((x) => x.period === "2026-10")!.metrics.vendas, 80679.16, "empresa out/2026");
  near(company.find((x) => x.period === "2026-10")!.metrics.meta, 960000, "meta empresa out");
  near(sum(company, (m) => m.meta), 12020000, "meta empresa ano");
  near(r.status.total_resumo_l2, 6190670.36, "Resumo L2");
  near(r.status.total_planilha, 6190670.36, "total planilha");
  assert.equal(r.status.dados_ate, "2026-10-16");

  const alvaro = r.rows.filter((x) => x.seller_label === "ALVARO CANUTO JUNIOR");
  near(sum(alvaro, (m) => m.vendas), 1121256.34, "Alvaro");
  assert.ok(alvaro.every((x) => x.seller_id === null && x.metrics.meta === null));

  assert.equal(r.unlinkedNames.length, 0, `nomes sem vínculo: ${r.unlinkedNames.join(", ")}`);
  assert.ok(!r.warnings.some((w) => w.startsWith("CONFERÊNCIA")), "conferência com o Resumo deve bater");
  assert.ok(r.warnings.some((w) => w.includes("11375")), "aviso da coluna Mês (pedido 11375)");
  assert.equal(r.skippedRows, 0);
  // nada de cliente/produto nos dados que vão ao banco
  const json = JSON.stringify(r);
  assert.ok(!/RAZ|PRODUTO/i.test(Object.keys(r.rows[0].metrics).join()));
  assert.ok(json.length < 400_000, "saída deve ser pequena (só agregados)");

  console.log("Todos os testes passaram.");
  console.log("Avisos:", r.warnings);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
