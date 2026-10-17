/**
 * Configuração da leitura da planilha KPI_Vendas_2026. Edite aqui sem mexer nos componentes.
 * Todos os nomes são comparados normalizados (sem acento, sem pontuação, espaços colapsados, caixa ignorada).
 */

/** Abas lidas. Troque `vendas` na virada do ano (ex.: "Vendas 2027"). */
export const SHEETS = {
  vendas: "Vendas 2026",
  resumo: "Resumo",
  /** meta total da empresa (mesmo formato das abas de vendedor) */
  metaEmpresa: "Metas",
} as const;

/** Cabeçalhos da aba de vendas (lidos por nome, nunca por posição). */
export const VENDAS_HEADERS = {
  pedido: "Pedido",
  emissao: "Emissão",
  vendedor: "Vendedor",
  valor: "Valor Total",
  origem: "C Vendas",
  tipo: "P/M", // M = máquinas, P = peças
  semana: "Semana", // WEEKNUM(Emissão) - 2, convenção da empresa (a do Looker)
} as const;

/** Cabeçalhos da aba Resumo (valores na linha 2). */
export const RESUMO_HEADERS = {
  dadosAte: "Vendas atualizadas até",
  totalAteAgora: "Vendas Totais até esta data", // Resumo!L2
  vendasMesAtual: "Vendas mês atual", // Resumo!S2
} as const;

/** Cabeçalhos das abas de meta. */
export const META_HEADERS = {
  origem: "Origem da Receita (Os 4 Baldes)",
  totalLinha: "TOTAL GERAL",
} as const;
export const MONTH_HEADERS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"] as const;

/** Nome em `C Vendas` (normalizado) → nome canônico. Junta grafias quase duplicadas. */
export const ORIGIN_ALIASES: Record<string, string> = {
  "INDICACAO CLIENTE": "INDICACAO DE CLIENTE",
};

/** Ex-vendedor (Isabela entrou no lugar do Alvaro): aparece como "Ex-vendedor" dentro do total da empresa. */
export const formerSellerNames: string[] = ["ALVARO CANUTO JUNIOR"];

/** Outras receitas (serviços não medidos por vendedor): entram no total da empresa. Lista confirmada pelo Edmar. */
export const nonSellerNames: string[] = [
  "EDVALDO BENTO PEREIRA",
  "EVERALDO ANTONIO BENTO PEREIRA",
  "MARCELO HENRIQUE CARNEIRO GUERINO",
  "INOVUS INDUSTRIA DE MAQUINAS AUTOMATICAS LTDA",
  "ECNC INDUSTRIA DE MAQUINAS LTDA",
];

/** seller_label do total da empresa em sales_numbers. */
export const COMPANY_LABEL = "__EMPRESA__";

/** Aviso se `Resumo!A2` estiver mais velho que isto. */
export const STALE_DAYS = 3;
/** Tolerância (R$) na conferência com o Resumo. */
export const CHECK_TOLERANCE = 1;
