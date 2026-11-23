/**
 * Modelos de contrato — um por TIPO DE MÁQUINA. Atendem comprador PF e PJ.
 * O modelo é escolhido pelo `equipamento.tipo`, que sai do MODELO da máquina (config/equipamentos.ts) — a IA não escolhe.
 *
 * Os .docx são os modelos dinâmicos REAIS da ECNC, com as variáveis do jeito que
 * já estão no ZapSign ({{NOME OU RAZÃO SOCIAL}}, {{VALOR DA ENTRADA}}...). O agente
 * não mexe no Word: o MAPA_ZAPSIGN abaixo diz qual dado do agente vai em cada variável.
 *
 * Arquivos:
 *   - modelos/<id>.docx            (rodando local)
 *   - bucket "modelos-contrato"    (na Central / Supabase)
 * ZapSign: o mesmo .docx sobe como "Modelo dinâmico" em CADA ambiente (sandbox e
 * produção são contas separadas, com IDs diferentes) — cole os IDs em zapsign_template_id.
 */
import type { NomeVariavel } from "../lib/variaveis";

export type TipoMaquina = "co2" | "fiber" | "fiber_corte" | "router" | "uv" | "solda";

export interface ModeloContrato {
  id: string;
  tipo: TipoMaquina;
  nome: string;
  zapsign_template_id: { sandbox: string; producao: string };
  /** Variável como está no Word (exatamente, inclusive espaços) → dado do agente. */
  mapa?: Record<string, NomeVariavel>;
}

/**
 * Variáveis dos modelos reais da ECNC → variáveis do agente.
 * As chaves são EXATAMENTE como estão no Word/ZapSign (inclusive o espaço no fim
 * de "QUANTIDADE. EX.: 01 (HUM) " e o "CARTÃOP"), porque o ZapSign substitui por texto exato.
 */
export const MAPA_ZAPSIGN: Record<string, NomeVariavel> = {
  "CONTRATO": "CONTRATO_NUMERO",
  "DATA DE HOJE POR EXTENSO": "CONTRATO_DATA",
  // (II) Comprador(a)
  "NOME OU RAZÃO SOCIAL": "CONTRATANTE_RAZAO_SOCIAL",
  "ENDEREÇO REGISTRADO NA RECEITA FEDERAL": "CONTRATANTE_ENDERECO_SEDE",
  "BAIRRO": "CONTRATANTE_BAIRRO",
  "CIDADE": "CONTRATANTE_CIDADE_UF",
  "CPF OU CNPJ": "CONTRATANTE_DOCUMENTO",
  "E-MAIL": "CONTRATANTE_EMAIL",
  "TELEFONE": "CONTRATANTE_TELEFONE",
  "COMPRADOR": "COMPRADOR_NOME",
  "CPF COMPRADOR": "COMPRADOR_CPF",
  // (III) Garantidor(a) solidário(a)
  "AVALISTA OU SE A ANÁLISE NÃO EXIGIR AVALISTA COLOQUE QUEM ASSINA PELA EMPRESA": "GARANTIDOR_NOME",
  "ENDEREÇO COMPLETO": "GARANTIDOR_ENDERECO",
  "CPF AVALISTA": "GARANTIDOR_CPF",          // modelo Fiber
  "CPF DO AVALISTA": "GARANTIDOR_CPF",       // modelo CO₂
  "E-MAIL AVALISTA": "GARANTIDOR_EMAIL",     // modelo Fiber
  "E-MAIL DO AVALISTA": "GARANTIDOR_EMAIL",  // modelo CO₂
  // (IV) Bem e pagamento
  "MODELO": "EQUIPAMENTO_MODELO",
  "POTÊNCIA": "EQUIPAMENTO_POTENCIA",
  "MARCA DO LASER": "EQUIPAMENTO_MARCA_LASER",
  "QUANTIDADE. EX.: 01 (HUM) ": "EQUIPAMENTO_QUANTIDADE",
  "CIDADE DE ENTREGA": "ENTREGA_CIDADE",
  "ENDEREÇO DE ENTREGA": "ENTREGA_ENDERECO",
  "VALOR DO EQUIPAMENTO": "IV3_PRECO_AQUISICAO",
  "VALOR POR EXTENSO": "IV3_PRECO_AQUISICAO_EXTENSO",
  "OPCIONAL1": "ACESSORIO_1",
  "VALOR DO OPCIONAL 1": "ACESSORIO_1_VALOR",
  "OPCIONAL2": "ACESSORIO_2",
  "VALOR DO OPCIONAL 2": "ACESSORIO_2_VALOR",
  "OPCIONAL3": "ACESSORIO_3",
  "VALOR DO OPCIONAL 3": "ACESSORIO_3_VALOR",
  "OPCIONAL4": "ACESSORIO_4",
  "VALOR DO OPCIONAL 4": "ACESSORIO_4_VALOR",
  "VALOR TOTAL DO CONTRATO": "IV5_PRECO_TOTAL",
  "VALOR TOTAL POR EXTENSO": "IV5_PRECO_TOTAL_EXTENSO",
  "VALOR DA ENTRADA": "IV6_VALOR_ENTRADA",
  "PRAZO DE ENTREGA": "IV7_PRAZO_ENTREGA",
  "VALOR DA PARCELA": "IV10_VALOR_PARCELA",
  "FORMA DE PAGAMENTO DA PARCELA (BOLETO, CARTÃOP DE CRÉDITO OU PIX)": "IV11_FORMA_PAGAMENTO",
  "QUANTIDADE DE PRESTAÇÕES": "IV12_QTD_PRESTACOES",
  "RESPONSÁVEL POR PAGAR FRETE (VENDEDOR OU COMPRADOR)": "RESPONSAVEL_FRETE",
  "RESPONSÁVEL POR PAGAR TÉCNICO (VENDEDOR OU COMPRADOR)": "RESPONSAVEL_INSTALACAO",
  // Testemunhas
  "TESTEMUNHA CLIENTE": "TESTEMUNHA_CLIENTE_NOME",
  "CPF TESTEMUNHA CLIENTE": "TESTEMUNHA_CLIENTE_CPF",
  "EMAIL TESTEMUNHA CLIENTE": "TESTEMUNHA_CLIENTE_EMAIL",
  "CELULAR TESTEMUNHA CLIENTE": "TESTEMUNHA_CLIENTE_CELULAR",
  "TESTEMUNHA ECNC": "TESTEMUNHA_ECNC_NOME",
  "CPF TESTEMUNHA ECNC": "TESTEMUNHA_ECNC_CPF",
  "EMAIL TESTEMUNHA ECNC": "TESTEMUNHA_ECNC_EMAIL",
  "CELULAR TESTEMUNHA ECNC": "TESTEMUNHA_ECNC_CELULAR",
};

export const MODELOS: ModeloContrato[] = [
  {
    id: "contrato-fiber",
    tipo: "fiber",
    nome: "Máquina de gravação a laser — Fiber",
    zapsign_template_id: { sandbox: "3d996002-faf9-44cc-a12a-42433955baea", producao: "" },
    mapa: MAPA_ZAPSIGN,
  },
  {
    id: "contrato-co2",
    tipo: "co2",
    nome: "Máquina de corte e gravação a laser — CO₂ (220V, 1 unidade)",
    zapsign_template_id: { sandbox: "bdbc19d9-769a-42d2-8c7e-485758f941c4", producao: "" },
    mapa: MAPA_ZAPSIGN,
  },
  // Fiber de corte, Router, UV e solda: ainda sem modelo — o agente avisa o vendedor para falar com o gestor.
];

export const modeloDoTipo = (tipo: TipoMaquina) => MODELOS.find((m) => m.tipo === tipo);
