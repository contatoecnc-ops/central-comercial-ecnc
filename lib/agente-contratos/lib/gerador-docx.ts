import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { VARIAVEIS_DISPONIVEIS, type NomeVariavel } from "./variaveis";

const DELIMITADORES = { start: "{{", end: "}}" };

/** Mapa "variável no Word" → "variável do agente" (ver config/modelos.ts). */
export type MapaModelo = Record<string, NomeVariavel>;

const limpar = (t: string) => t.trim();

/** Qual variável do agente atende a variável do Word (pelo mapa, ou o próprio nome). */
function canonica(tag: string, mapa?: MapaModelo): string | undefined {
  const t = limpar(tag);
  if (mapa) for (const [k, v] of Object.entries(mapa)) if (limpar(k) === t) return v;
  return t in VARIAVEIS_DISPONIVEIS ? t : undefined;
}

/** Valores com as chaves do Word (sem espaços nas pontas) — o que o docxtemplater usa. */
export function valoresParaModelo(variaveis: Record<string, string>, mapa?: MapaModelo): Record<string, string> {
  const out: Record<string, string> = { ...variaveis };
  if (mapa) for (const [k, v] of Object.entries(mapa)) out[limpar(k)] = variaveis[v] ?? "";
  return out;
}

/**
 * Lista "de → para" para o ZapSign, com as variáveis EXATAMENTE como estão no modelo.
 * O ZapSign não aceita valor vazio: vazio vira "-".
 */
export function dadosZapsign(variaveis: Record<string, string>, mapa?: MapaModelo): { de: string; para: string }[] {
  const pares = mapa
    ? Object.entries(mapa).map(([k, v]) => [k, variaveis[v]] as const)
    : Object.entries(variaveis);
  return pares.map(([k, v]) => ({ de: `{{${k}}}`, para: String(v ?? "").trim() || "-" }));
}

export interface ResultadoGeracao {
  arquivo: Buffer;
  /** Variáveis que existem no modelo mas não vieram preenchidas. */
  faltando: string[];
}

/** Preenche o modelo .docx (mesma sintaxe {{VARIAVEL}} dos modelos dinâmicos do ZapSign). */
export function gerarDocx(modelo: Buffer, variaveis: Record<string, string>, mapa?: MapaModelo): ResultadoGeracao {
  const faltando = new Set<string>();
  const valores = valoresParaModelo(variaveis, mapa);
  const doc = new Docxtemplater(new PizZip(modelo), {
    delimiters: DELIMITADORES,
    paragraphLoop: true,
    linebreaks: true,
    nullGetter(part: any) {
      const nome = limpar(String(part.value ?? ""));
      faltando.add(nome);
      return `[[FALTANDO: ${nome}]]`;
    },
    parser: (tag: string) => ({ get: (escopo: any) => escopo[limpar(tag)] }),
  });
  doc.render(valores);
  const arquivo = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
  return { arquivo, faltando: [...faltando] };
}

/**
 * Confere ANTES de gerar: toda variável que o modelo usa precisa ser conhecida
 * pelo agente e estar preenchida (exceto as opcionais). Devolve os problemas.
 */
export function conferirPreenchimento(
  modelo: Buffer, variaveis: Record<string, string>, opcionais: Set<string>, mapa?: MapaModelo,
): string[] {
  const r = verificarModelo(modelo, mapa);
  const problemas: string[] = [];
  if (r.desconhecidas.length)
    problemas.push(`O modelo de contrato tem campos que o agente não conhece: ${r.desconhecidas.join(", ")}. Avise o gestor — o modelo precisa ser ajustado.`);
  const vazias = new Set<string>();
  for (const tag of r.variaveis_no_modelo) {
    const c = canonica(tag, mapa);
    if (!c || opcionais.has(c)) continue;
    if (!String(variaveis[c] ?? "").trim()) vazias.add(c);
  }
  if (vazias.size)
    problemas.push(`Campos do contrato ficariam em branco: ${[...vazias].map((c) => VARIAVEIS_DISPONIVEIS[c as NomeVariavel] ?? c).join("; ")}.`);
  return problemas;
}

export interface RelatorioModelo {
  variaveis_no_modelo: string[];
  desconhecidas: string[]; // estão no Word mas o agente não sabe preencher
  usadas: string[];        // variáveis do agente que o modelo usa
}

/** Confere um modelo .docx: avisa variável digitada errado ou que o agente não conhece. */
export function verificarModelo(modelo: Buffer, mapa?: MapaModelo): RelatorioModelo {
  const zip = new PizZip(modelo);
  const partes = Object.keys(zip.files).filter((f) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(f));
  const tags = new Set<string>();
  for (const f of partes) {
    // Junta o texto dos parágrafos (o Word costuma quebrar {{VAR}} em vários pedaços).
    const texto = zip.file(f)!.asText().replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "");
    for (const m of texto.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) tags.add(m[1]);
  }
  // Garante que o docxtemplater também consegue ler (erros de chave aberta/fechada).
  new Docxtemplater(zip, { delimiters: DELIMITADORES, paragraphLoop: true, linebreaks: true });
  const lista = [...tags];
  return {
    variaveis_no_modelo: lista,
    desconhecidas: lista.filter((t) => !canonica(t, mapa)),
    usadas: [...new Set(lista.map((t) => canonica(t, mapa)).filter(Boolean) as string[])],
  };
}
