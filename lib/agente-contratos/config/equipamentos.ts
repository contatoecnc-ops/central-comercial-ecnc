/**
 * CATÁLOGO DE EQUIPAMENTOS
 * ------------------------------------------------------------------
 * O vendedor informa o MODELO. O tipo de máquina, as potências e as marcas de
 * laser aceitas saem daqui — não da IA. A validação (lib/normalizacao.ts) confere
 * tudo contra este catálogo e o prompt do agente é gerado dele.
 *
 * Reconhecimento do modelo (ignora maiúsculas, acentos, espaços e hífen):
 *  - famílias numeradas (L-6040, L-560, L-1060, L-1210, L-1610, F-1530): o número (com ou sem
 *    "L"/"F" e hífen) pode vir com texto ao redor ("ECNC CO2 1610 100W" → L-1610), desde que
 *    EXATAMENTE UMA família case. Se casar mais de uma ou nenhuma, o agente pede para confirmar o modelo.
 *  - Router, UV, Solda e Fiber: pela palavra-chave dentro do modelo.
 * F-1530 tem precedência sobre o Fiber genérico. O modelo é gravado no nome canônico (normalizarDados).
 */
import type { TipoMaquina } from "./modelos";

export const NOME_TIPO: Record<TipoMaquina, string> = {
  co2: "CO₂",
  fiber: "Fiber",
  fiber_corte: "Fiber de corte",
  router: "Router",
  uv: "UV",
  solda: "Solda laser",
};

/** Marca padrão do Fiber (gravação/marcação). Variações abaixo são normalizadas para este valor. */
export const MARCA_PADRAO_FIBER = "RAYCUS Q/QB";
/** Variações aceitas como a marca padrão (comparadas sem maiúsculas, espaços e barra). */
export const VARIACOES_MARCA_PADRAO_FIBER = ["RAYCUS", "RAYCUSQ", "RAYCUSQB", "RAYCUSQQB"];

/** Garantia adicional do tubo CO₂ — só o 90W tem, sempre. */
export const GARANTIA_TUBO = {
  potencia_w: 90,
  descricao: "GARANTIA ESTENDIDA DO TUBO LASER DE 03 MESES (TOTALIZANDO 06 MESES DE GARANTIA)",
  marcas: ["RECI", "SPT"],
};

export interface FamiliaEquipamento {
  id: string;
  /** Como aparece nas mensagens. */
  nome: string;
  tipo: TipoMaquina;
  /** Padrão procurado dentro do modelo (texto em minúsculas, sem acento). */
  palavra?: RegExp;
  /** Como o vendedor escreve (só para o prompt). */
  como_escreve: string;
  /** Potências aceitas em W. Ausente = livre. */
  potencias_w?: number[];
  /** A família tem potência (a validação exige). Router, UV e solda: não. */
  tem_potencia: boolean;
  /** A família tem marca de laser (a validação exige). */
  tem_marca: boolean;
  /** Marcas aceitas por potência (W). Ausente = qualquer marca. */
  marcas_por_potencia?: Record<number, string[]>;
  marca_padrao?: string;
}

const TRES = ["RECI", "PURI", "SPT"];
const DUAS = ["RECI", "SPT"];
const MARCAS_CO2: Record<number, string[]> = { 50: TRES, 60: TRES, 90: DUAS, 100: TRES, 130: TRES, 150: TRES };
const so = (watts: number[]) => Object.fromEntries(watts.map((w) => [w, MARCAS_CO2[w]]));

const co2 = (id: string, numero: string, potencias: number[], extra: Partial<FamiliaEquipamento> = {}): FamiliaEquipamento => ({
  id,
  nome: id,
  tipo: "co2",
  palavra: new RegExp(`(?<![0-9])(?:l[\\s-]*)?${numero}(?![0-9])`),
  como_escreve: `${id} (ou "${numero}")`,
  potencias_w: potencias,
  tem_potencia: true,
  tem_marca: true,
  marcas_por_potencia: so(potencias),
  ...extra,
});

export const FAMILIAS: FamiliaEquipamento[] = [
  {
    id: "F-1530", nome: "F-1530", tipo: "fiber_corte", palavra: /(?<![a-z0-9])f[\s-]*1530(?![0-9])/, como_escreve: `F-1530 ("F1530")`,
    tem_potencia: true, tem_marca: false,
  },
  co2("L-6040", "6040", [50, 60], { marca_padrao: "SPT" }),
  co2("L-560", "560", [50, 60, 90, 100]),
  co2("L-1060", "1060", [90, 100, 130, 150]),
  co2("L-1210", "1210", [90, 100, 130, 150]),
  co2("L-1610", "1610", [90, 100, 130, 150]),
  { id: "Router", nome: "Router", tipo: "router", palavra: /router/, como_escreve: "Router", tem_potencia: false, tem_marca: false },
  { id: "UV", nome: "UV", tipo: "uv", palavra: /(^|[^a-z0-9])uv([^a-z0-9]|$)/, como_escreve: `"UV" no modelo`, tem_potencia: false, tem_marca: false },
  { id: "Solda", nome: "Solda laser", tipo: "solda", palavra: /solda|welding/, como_escreve: `"solda" ou "welding" no modelo`, tem_potencia: false, tem_marca: false },
  {
    id: "Fiber", nome: "Fiber / Marking", tipo: "fiber", palavra: /fiber|fibra|marking/, como_escreve: `qualquer outro "fiber", "fibra" ou "marking"`,
    tem_potencia: true, tem_marca: true, marca_padrao: MARCA_PADRAO_FIBER,
  },
];

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Família do modelo informado pelo vendedor; undefined se não bater com nenhuma. */
export function reconhecerFamilia(modelo: string | undefined): FamiliaEquipamento | undefined {
  if (!modelo?.trim()) return undefined;
  const baixo = semAcento(modelo);
  let achadas = FAMILIAS.filter((f) => f.palavra?.test(baixo));
  // F-1530 vence o Fiber genérico ("F-1530 Fiber")
  if (achadas.some((f) => f.id === "F-1530")) achadas = achadas.filter((f) => f.id !== "Fiber");
  return achadas.length === 1 ? achadas[0] : undefined;
}

/** "100w", "100 W", "100W" → 100; "3kW" → 3000. Texto que não é potência → undefined. */
export function lerPotenciaW(texto: string | undefined): number | undefined {
  if (!texto) return undefined;
  const t = texto.trim().toLowerCase().replace(",", ".");
  const m = /^(\d+(?:\.\d+)?)\s*(k)?\s*w?$/.exec(t) ?? /(\d+(?:\.\d+)?)\s*(k)?\s*w\b/.exec(t);
  if (!m) return undefined;
  const n = Number(m[1]) * (m[2] ? 1000 : 1);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Marca para comparação: maiúsculas, sem espaço, barra ou pontuação. */
export const marcaChave = (m: string) => semAcento(m).toUpperCase().replace(/[^A-Z0-9]/g, "");

export const ehMarcaPadraoFiber = (m: string) => VARIACOES_MARCA_PADRAO_FIBER.includes(marcaChave(m));

/** Garantia adicional de 3 meses: texto com "garantia" + 3/03/três meses. */
export function ehGarantiaTreMeses(descricao: string): boolean {
  const t = semAcento(descricao);
  return /garantia/.test(t) && /(?<![0-9])(?:0?3|tres)\s*(?:\([^)]*\)\s*)?mes/.test(t);
}

/** Tabela do catálogo em texto, para o prompt do agente (gerada daqui — não escrita à mão). */
export function descreverCatalogo(): string {
  return FAMILIAS.map((f) => {
    const partes: string[] = [`tipo ${f.tipo} (${NOME_TIPO[f.tipo]})`];
    if (f.potencias_w) partes.push(`potências aceitas: ${f.potencias_w.map((w) => `${w}W`).join(", ")}`);
    else if (f.tem_potencia) partes.push("potência livre");
    else partes.push("sem potência");
    if (f.marcas_por_potencia) {
      const grupos = new Map<string, number[]>();
      for (const [w, ms] of Object.entries(f.marcas_por_potencia)) grupos.set(ms.join(", "), [...(grupos.get(ms.join(", ")) ?? []), Number(w)]);
      const marcas = [...grupos].map(([ms, ws]) => `${ws.map((w) => `${w}W`).join("/")}: ${ms}`).join("; ");
      partes.push(`marca do laser — ${marcas}${f.marca_padrao ? `; se o vendedor não informar, ${f.marca_padrao}` : "; o vendedor TEM que informar (sem padrão)"}`);
    } else if (f.tem_marca) partes.push(`marca do laser: padrão ${f.marca_padrao} (outra marca é permitida, mas vai com ressalva para o gestor)`);
    else partes.push("sem marca de laser");
    return `- ${f.como_escreve} → ${partes.join("; ")}`;
  }).join("\n");
}
