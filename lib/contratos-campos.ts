/**
 * Guia "Dados que o agente vai precisar" (só interface).
 *
 * A estrutura vem do DadosContratoSchema (o que existe, o que é obrigatório e as opções de cada lista) e os nomes das
 * condições de pagamento vêm de config/condicoes-pagamento.ts. À mão ficam apenas os RÓTULOS e os exemplos:
 *  - campo que o schema não tem é descartado (nada é inventado);
 *  - campo novo no schema, sem rótulo aqui, aparece com o nome técnico em vez de sumir.
 * Somente servidor: o resultado (serializável) é entregue ao componente do chat.
 */
import { z } from "zod";
import { DadosContratoSchema } from "@/lib/agente-contratos/tipos";
import { CONDICOES } from "@/lib/agente-contratos/config/condicoes-pagamento";

export interface ItemGuia {
  rotulo: string;
  exemplo?: string;
  dica?: string;
  opcional: boolean;
  opcoes?: string[];
}
export interface GrupoGuia {
  id: string;
  titulo: string;
  nota?: string;
  /** Grupo que o contrato exige (o schema não o marca como opcional). */
  obrigatorio: boolean;
  itens: ItemGuia[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type No = any;

const VALORES: Record<string, string> = {
  PF: "PF", PJ: "PJ",
  co2: "CO₂", fiber: "Fiber", fiber_corte: "Fiber de corte", uv: "UV", solda: "Solda laser",
  pix: "PIX", transferencia: "Transferência", boleto: "Boleto",
  pronta_entrega: "Pronta entrega", dias_uteis: "Dias úteis", dias_corridos: "Dias corridos",
  COMPRADOR: "Comprador", VENDEDOR: "Vendedor (ECNC)",
};

interface Def {
  /** Caminho dentro do grupo (nomes de propriedade do schema). */
  c: string[];
  rotulo: string;
  exemplo?: string;
  dica?: string;
  /** Substitui as opções vindas do schema (ex.: nomes das condições). */
  opcoes?: string[];
}
interface GrupoDef { id: string; titulo: string; nota?: string; base: string[]; itens: Def[] }

const ENDERECO = (c: string[], rotulo = "Endereço completo com CEP"): Def[] => [
  { c, rotulo, exemplo: "Rua das Indústrias, 500, Distrito Industrial, Marília/SP, 17512-000" },
  { c: [...c, "complemento"], rotulo: "Complemento do endereço", exemplo: "Galpão 2" },
];

const GRUPOS: GrupoDef[] = [
  {
    id: "comprador", titulo: "Comprador", base: ["contratante"],
    nota: "PJ: basta o CNPJ — o agente busca razão social e endereço na Receita.",
    itens: [
      { c: ["tipo_pessoa"], rotulo: "PF ou PJ" },
      { c: ["razao_social"], rotulo: "Nome completo ou razão social", dica: "PJ: opcional se informar o CNPJ" },
      { c: ["documento"], rotulo: "CPF ou CNPJ", exemplo: "11.222.333/0001-81" },
      { c: ["nome_fantasia"], rotulo: "Nome fantasia" },
      { c: ["inscricao_estadual"], rotulo: "Inscrição estadual", dica: "PJ; PF só se for produtor rural" },
      ...ENDERECO(["endereco"]),
      { c: ["email"], rotulo: "E-mail", exemplo: "compras@empresa.com.br" },
      { c: ["telefone"], rotulo: "Telefone", exemplo: "(14) 3333-4444" },
    ],
  },
  {
    id: "assinatura", titulo: "Quem assina pelo comprador", base: ["signatarios"],
    nota: "O primeiro é o comprador (PJ: o representante legal). Pode haver mais de um signatário.",
    itens: [
      { c: ["nome"], rotulo: "Nome" },
      { c: ["cpf"], rotulo: "CPF" },
      { c: ["cargo"], rotulo: "Cargo", exemplo: "Sócio-administrador" },
      { c: ["email"], rotulo: "E-mail" },
      { c: ["telefone"], rotulo: "Telefone" },
    ],
  },
  {
    id: "garantidor", titulo: "Garantidor solidário", base: ["garantidor"],
    itens: [
      { c: ["nome"], rotulo: "Nome" },
      { c: ["cpf"], rotulo: "CPF" },
      { c: ["email"], rotulo: "E-mail" },
      ...ENDERECO(["endereco"]),
    ],
  },
  {
    id: "testemunha", titulo: "Testemunha do cliente", base: ["testemunha_cliente"],
    itens: [
      { c: ["nome"], rotulo: "Nome" },
      { c: ["cpf"], rotulo: "CPF" },
      { c: ["email"], rotulo: "E-mail" },
      { c: ["celular"], rotulo: "Celular", exemplo: "(14) 99999-0000" },
    ],
  },
  {
    id: "equipamento", titulo: "Equipamento", base: ["equipamento"],
    itens: [
      { c: ["tipo"], rotulo: "Tipo" },
      { c: ["modelo"], rotulo: "Modelo", exemplo: "ECNC Fiber 100W" },
      { c: ["potencia"], rotulo: "Potência", exemplo: "30W, 150W, 3kW" },
      { c: ["marca_laser"], rotulo: "Marca do laser", exemplo: "RAYCUS" },
      { c: ["quantidade"], rotulo: "Quantidade", dica: "1 se não informar" },
      { c: ["preco_centavos"], rotulo: "Preço do equipamento", exemplo: "R$ 118.000,00" },
      { c: ["descricao"], rotulo: "Descrição" },
    ],
  },
  {
    id: "acessorios", titulo: "Acessórios e serviços à parte", base: ["acessorios"],
    nota: "Frete, instalação, rotativo, exaustor etc. Valor 0 = bonificação.",
    itens: [
      { c: ["descricao"], rotulo: "Descrição", exemplo: "Rotativo 80mm" },
      { c: ["valor_centavos"], rotulo: "Valor", exemplo: "R$ 4.500,00 (ou 0)" },
    ],
  },
  {
    id: "total", titulo: "Preço total", base: [],
    itens: [{ c: ["preco_total_centavos"], rotulo: "Preço total da venda", dica: "O agente confere com a soma", exemplo: "R$ 125.555,64" }],
  },
  {
    id: "pagamento", titulo: "Pagamento", base: ["pagamento"],
    itens: [
      { c: ["condicao"], rotulo: "Condição de pagamento", opcoes: CONDICOES.map((c) => c.nome) },
      { c: ["entrada_centavos"], rotulo: "Valor da entrada", exemplo: "R$ 20.000,00" },
      { c: ["entrada_pagamentos", "data"], rotulo: "Data da entrada", dica: "Em mais de um pagamento: valor e data de cada um" },
      { c: ["entrada_pagamentos", "meio"], rotulo: "Meio de pagamento da entrada" },
      { c: ["parcelas"], rotulo: "Número de parcelas", exemplo: "12" },
      { c: ["dias_primeira_parcela"], rotulo: "Prazo do 1º vencimento (dias)", dica: "Ou use a data fixa abaixo", exemplo: "30" },
      { c: ["primeiro_vencimento_data"], rotulo: "Data fixa do 1º vencimento", dica: "Gera ponto de atenção para o gestor", exemplo: "2026-12-15" },
      { c: ["banco"], rotulo: "Banco", dica: "Financiamento" },
      { c: ["acrescimo_cartao_centavos"], rotulo: "Cartão: acréscimo de parcelamento", exemplo: "R$ 1.200,00" },
      { c: ["divisao_cartoes_centavos"], rotulo: "Cartão: valor em cada cartão", dica: "Quando dividir em mais de um" },
    ],
  },
  {
    id: "entrega", titulo: "Entrega", base: [],
    itens: [
      { c: ["prazo_entrega", "tipo"], rotulo: "Prazo de entrega" },
      { c: ["prazo_entrega", "dias"], rotulo: "Quantidade de dias", exemplo: "30" },
      { c: ["endereco_entrega"], rotulo: "Endereço de entrega", dica: "Só se for diferente do comprador" },
      { c: ["endereco_entrega", "complemento"], rotulo: "Complemento do endereço de entrega" },
      { c: ["responsavel_frete"], rotulo: "Quem paga o frete" },
      { c: ["responsavel_instalacao"], rotulo: "Quem paga o técnico/instalação" },
    ],
  },
];

/** Desce o JSON Schema (objeto → propriedade, array → items). `obrigatorio` só vale se todo o caminho for obrigatório. */
function descer(no: No, caminho: string[], obrigatorio: boolean): { no: No; obrigatorio: boolean } | null {
  let atual = no;
  let obrig = obrigatorio;
  for (const chave of caminho) {
    if (atual?.type === "array") atual = atual.items;
    const filho = atual?.properties?.[chave];
    if (!filho) return null;
    obrig = obrig && (atual.required ?? []).includes(chave);
    atual = filho;
  }
  return { no: atual, obrigatorio: obrig };
}

const rotuloValor = (v: string) => VALORES[v] ?? v;

export function montarGuia(): GrupoGuia[] {
  const raiz = z.toJSONSchema(DadosContratoSchema, { io: "input", reused: "inline", unrepresentable: "any" }) as No;
  const grupos: GrupoGuia[] = [];

  for (const g of GRUPOS) {
    const base = descer(raiz, g.base, true);
    if (!base) continue; // o schema não tem este grupo
    const itens: ItemGuia[] = [];
    const citados = new Set<string>();

    for (const d of g.itens) {
      const r = descer(base.no, d.c, base.obrigatorio);
      if (!r) continue; // campo que o schema não tem: não inventa
      citados.add(d.c.join("."));
      const opcoes = d.opcoes ?? (Array.isArray(r.no?.enum) ? (r.no.enum as string[]).map(rotuloValor) : undefined);
      itens.push({ rotulo: d.rotulo, exemplo: d.exemplo, dica: d.dica, opcional: !r.obrigatorio, opcoes });
    }

    // Campos do schema que não têm rótulo aqui: aparecem com o nome técnico (um campo novo nunca some do guia).
    let no = base.no;
    if (no?.type === "array") no = no.items;
    for (const chave of Object.keys(no?.properties ?? {})) {
      if (g.base.length === 0 || citados.has(chave) || g.itens.some((d) => d.c[0] === chave)) continue;
      itens.push({ rotulo: chave, opcional: !(no.required ?? []).includes(chave) || !base.obrigatorio });
    }
    if (itens.length) grupos.push({ id: g.id, titulo: g.titulo, nota: g.nota, obrigatorio: base.obrigatorio, itens });
  }
  return grupos;
}

/** Texto-modelo para o vendedor preencher e enviar de uma vez (mesma ordem dos grupos). */
export function montarRoteiro(grupos: GrupoGuia[]): string {
  return grupos
    .map((g) => {
      const linhas = g.itens.map((i) => {
        const dica = i.opcoes ? ` (${i.opcoes.join(" / ")})` : "";
        return `${i.rotulo}${i.opcional ? " (opcional)" : ""}${dica}:`;
      });
      return [`${g.titulo.toUpperCase()}`, ...linhas].join("\n");
    })
    .join("\n\n");
}
