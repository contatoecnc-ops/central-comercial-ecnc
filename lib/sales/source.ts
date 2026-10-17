import { getGoogleAccessToken } from "@/lib/google";
import { COMPANY_LABEL, SHEETS } from "@/lib/sales-config";
import { headerKey, type Cell, type Matrix } from "@/lib/sales/parse";
import type { SalesMetrics, SalesRowOut, SellerInfo } from "@/lib/sales/workbook";

export type SalesSourceKind = "mock" | "sheets" | "none";

export function getSalesSource(): SalesSourceKind {
  const v = process.env.SALES_SOURCE?.trim().toLowerCase();
  if (v === "mock") return "mock";
  const hasCreds =
    !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && !!process.env.GOOGLE_PRIVATE_KEY && !!process.env.GOOGLE_SHEET_ID;
  if ((v === "sheets" || !v) && hasCreds) return "sheets";
  return "none";
}

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

function cell(v: unknown): Cell {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" || typeof v === "boolean" || v instanceof Date) return v;
  return String(v);
}

async function googleError(res: Response): Promise<Error> {
  // só a mensagem de erro da API; nunca conteúdo de células
  let msg = "";
  try {
    msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? "";
  } catch {
    // corpo sem JSON
  }
  return Object.assign(new Error(`Google respondeu ${res.status}: ${msg || "erro"}`), {
    status: res.status,
    googleMessage: msg,
  });
}

/** Abas necessárias: vendas, resumo, meta da empresa e a aba de cada vendedor (1ª palavra do sheet_name). */
function wantedTitles(sellers: SellerInfo[]) {
  const keys = new Set<string>([SHEETS.vendas, SHEETS.resumo, SHEETS.metaEmpresa].map(headerKey));
  sellers.forEach((s) => keys.add(headerKey(s.sheet_name).split(" ")[0]));
  return (title: string) => keys.has(headerKey(title));
}

/** Planilha Google nativa: datas como número serial, valores sem formatação. */
async function readNative(token: string, sheetId: string, want: (t: string) => boolean): Promise<Record<string, Matrix>> {
  const auth = { Authorization: `Bearer ${token}` };
  const meta = await fetch(`${SHEETS_BASE}/${encodeURIComponent(sheetId)}?fields=sheets.properties.title`, {
    headers: auth,
    cache: "no-store",
  });
  if (!meta.ok) throw await googleError(meta);
  const titles = ((await meta.json()) as { sheets?: { properties: { title: string } }[] }).sheets
    ?.map((s) => s.properties.title)
    .filter(want);
  if (!titles?.length) throw new Error("Nenhuma das abas esperadas foi encontrada na planilha");

  const qs = new URLSearchParams({ valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" });
  titles.forEach((t) => qs.append("ranges", `'${t.replace(/'/g, "''")}'`));
  const res = await fetch(`${SHEETS_BASE}/${encodeURIComponent(sheetId)}/values:batchGet?${qs}`, {
    headers: auth,
    cache: "no-store",
  });
  if (!res.ok) throw await googleError(res);
  const json = (await res.json()) as { valueRanges?: { values?: unknown[][] }[] };
  const out: Record<string, Matrix> = {};
  titles.forEach((t, i) => {
    out[t] = (json.valueRanges?.[i]?.values ?? []).map((row) => row.map(cell));
  });
  return out;
}

/** Arquivo .xlsx no Drive (não é planilha Google nativa): datas chegam como Date. */
async function readXlsx(token: string, fileId: string, want: (t: string) => boolean): Promise<Record<string, Matrix>> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw await googleError(res);
  const buffer = Buffer.from(await res.arrayBuffer());
  const { default: readExcel } = await import("read-excel-file/node");
  const out: Record<string, Matrix> = {};
  for (const s of await readExcel(buffer)) {
    if (want(s.sheet)) out[s.sheet] = s.data.map((row) => row.map(cell));
  }
  return out;
}

export async function readWorkbook(sellers: SellerInfo[]): Promise<Record<string, Matrix>> {
  const sheetId = process.env.GOOGLE_SHEET_ID!;
  const token = await getGoogleAccessToken([
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
  ]);
  const want = wantedTitles(sellers);
  try {
    return await readNative(token, sheetId, want);
  } catch (e) {
    const err = e as { status?: number; googleMessage?: string };
    if (err.status === 400 && /not supported for this document/i.test(err.googleMessage ?? "")) {
      return readXlsx(token, sheetId, want);
    }
    throw e;
  }
}

/** Dados de exemplo no mesmo formato de `sales_numbers.metrics` (modo SALES_SOURCE=mock). */
export function mockRows(sellers: SellerInfo[]): SalesRowOut[] {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-11
  const hash = (s: string) => Array.from(s).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const origins = ["CLIENTES", "MERCADO LIVRE", "INSTAGRAM", "GOOGLE", "SITE", "INDICACAO DE CLIENTE"];
  const dadosAte = now.toISOString().slice(0, 10);
  const people = [...sellers.map((s) => ({ id: s.id as string | null, label: s.sheet_name })), { id: null, label: "FULANO SEM VINCULO" }];
  const rows: SalesRowOut[] = [];
  const company: Record<number, SalesMetrics> = {};

  for (const p of people) {
    for (let mo = 0; mo <= month; mo++) {
      const h = hash(`${p.label}${mo}`);
      const vendas = 150000 + (h % 350000);
      const maquinas = Math.round(vendas * (0.6 + (h % 20) / 100));
      const por_origem: Record<string, number> = {};
      origins.forEach((o, i) => (por_origem[o] = Math.round((vendas / origins.length) * (0.5 + ((h >> i) % 10) / 10))));
      const m: SalesMetrics = {
        vendas,
        meta: p.id ? 300000 : null,
        maquinas,
        pecas: vendas - maquinas,
        estornos: h % 5 === 0 ? 1200 : 0,
        por_origem,
        por_semana: {},
        dados_ate: dadosAte,
      };
      rows.push({ seller_id: p.id, seller_label: p.label, period: `${year}-${String(mo + 1).padStart(2, "0")}`, metrics: m });
      const c = (company[mo] ??= { ...m, vendas: 0, maquinas: 0, pecas: 0, estornos: 0, por_origem: {}, meta: 0 });
      c.vendas += m.vendas;
      c.maquinas += m.maquinas;
      c.pecas += m.pecas;
      c.estornos += m.estornos;
      c.meta = (c.meta ?? 0) + (m.meta ?? 0);
      Object.entries(por_origem).forEach(([k, v]) => (c.por_origem[k] = (c.por_origem[k] ?? 0) + v));
    }
  }
  Object.entries(company).forEach(([mo, m]) =>
    rows.push({ seller_id: null, seller_label: COMPANY_LABEL, period: `${year}-${String(Number(mo) + 1).padStart(2, "0")}`, metrics: m })
  );
  return rows;
}
