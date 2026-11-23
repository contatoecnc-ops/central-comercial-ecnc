import type { DadosContrato } from "../tipos";
import type { DadosReceita } from "../lib/cnpj-api";

/** Cliente fictício — CNPJ e CPF com dígitos válidos, mas inventados. */
const cliente = (): DadosContrato["contratante"] => ({
  tipo_pessoa: "PJ",
  razao_social: "Metalúrgica Exemplo Ltda",
  nome_fantasia: "Metal Exemplo",
  documento: "11.222.333/0001-81",
  inscricao_estadual: "123.456.789.110",
  endereco: { logradouro: "Rua das Indústrias", numero: "500", bairro: "Distrito Industrial", cidade: "Marília", uf: "SP", cep: "17512-000" },
  email: "compras@metalexemplo.com.br",
  telefone: "(14) 3333-4444",
});

const base = (): Omit<DadosContrato, "equipamento" | "acessorios" | "preco_total_centavos" | "pagamento" | "prazo_entrega"> => ({
  contratante: cliente(),
  signatarios: [{ nome: "João da Silva", cpf: "529.982.247-25", cargo: "Sócio-administrador", email: "joao@metalexemplo.com.br" }],
  // Sem avalista exigido: o garantidor é quem assina pela empresa.
  garantidor: {
    nome: "João da Silva", cpf: "529.982.247-25", email: "joao@metalexemplo.com.br",
    endereco: { logradouro: "Rua dos Ipês", numero: "88", bairro: "Jardim América", cidade: "Marília", uf: "SP", cep: "17514-000" },
  },
  testemunha_cliente: { nome: "Ana Paula Costa", cpf: "111.444.777-35", email: "ana@metalexemplo.com.br", celular: "(14) 99888-7766" },
  responsavel_frete: "COMPRADOR",
  responsavel_instalacao: "VENDEDOR",
  frete_instalacao_embutidos: false,
});

/**
 * Os 5 contratos reais enviados pelo Edmar (só os valores; cliente fictício)
 * + um caso de faturado para empresa grande.
 */
export const CASOS = {
  /** Recorte 1 — R$ 19.900 à vista no PIX, pronta entrega */
  vista_pix: (): DadosContrato => ({
    ...base(),
    equipamento: { tipo: "co2", potencia: "100W", marca_laser: "RECI", quantidade: 1, modelo: "L-1610", descricao: "Máquina de corte e gravação a laser CO₂", preco_centavos: 1990000 },
    acessorios: [],
    preco_total_centavos: 1990000,
    pagamento: { condicao: "a_vista" },
    prazo_entrega: { tipo: "pronta_entrega" },
  }),

  /** Recorte 2 — R$ 37.600, entrada 17.000, saldo em 15 boletos */
  boleto_15x: (): DadosContrato => ({
    ...base(),
    equipamento: { tipo: "co2", potencia: "90W", marca_laser: "RECI", quantidade: 1, modelo: "L-1610", descricao: "Máquina de corte a laser CO₂", preco_centavos: 3760000 },
    acessorios: [{ descricao: "Garantia estendida do tubo laser de 03 meses (totalizando 06 meses de garantia)", valor_centavos: 0 }],
    preco_total_centavos: 3760000,
    pagamento: { condicao: "entrada_boleto_nf", entrada_centavos: 1700000, parcelas: 15 },
    prazo_entrega: { tipo: "dias_corridos", dias: 5 },
  }),

  /** Recorte 3 — R$ 39.523,61 + 3 acessórios + bonificação = R$ 62.923,61, entrada 28.500 (parcelas não visíveis: assumido 6) */
  acessorios: (): DadosContrato => ({
    ...base(),
    equipamento: { tipo: "co2", potencia: "90W", marca_laser: "RECI", quantidade: 1, modelo: "L-1610", descricao: "Máquina de corte a laser CO₂", preco_centavos: 3952361 },
    acessorios: [
      { descricao: "Câmera CCD", valor_centavos: 2000000 },
      { descricao: "Colmeia", valor_centavos: 140000 },
      { descricao: "Frete + instalação presencial", valor_centavos: 200000 },
      { descricao: "03 meses de garantia estendida do tubo laser (totalizando 06 meses)", valor_centavos: 0 },
    ],
    preco_total_centavos: 6292361,
    pagamento: { condicao: "entrada_boleto_nf", entrada_centavos: 2850000, parcelas: 6 },
    prazo_entrega: { tipo: "dias_uteis", dias: 30 },
  }),

  /** Recorte 4 — o erro: 12x no cartão em 2 cartões, que saiu como "BOLETO" */
  cartao_2_cartoes: (): DadosContrato => ({
    ...base(),
    equipamento: { tipo: "fiber", potencia: "30W", marca_laser: "RAYCUS", quantidade: 1, modelo: "ECNC Fiber Marking 30W", descricao: "Máquina de marcação a laser Fiber", preco_centavos: 1100000 },
    acessorios: [],
    preco_total_centavos: 1255564,
    pagamento: { condicao: "cartao", parcelas: 12, acrescimo_cartao_centavos: 155564, divisao_cartoes_centavos: [627782, 627782] },
    prazo_entrega: { tipo: "dias_uteis", dias: 10 },
  }),

  /** Recorte 5 — R$ 18.500 + eixo rotativo R$ 2.000, entrada 10.000 no PIX, 1 boleto para 40 dias */
  boleto_40_dias: (): DadosContrato => ({
    ...base(),
    equipamento: { tipo: "fiber", potencia: "50W", marca_laser: "RAYCUS", quantidade: 1, modelo: "ECNC Fiber Marking 50W", descricao: "Máquina de marcação a laser Fiber", preco_centavos: 1850000 },
    acessorios: [{ descricao: "Eixo rotativo marking normal", valor_centavos: 200000 }],
    preco_total_centavos: 2050000,
    pagamento: { condicao: "entrada_boleto_nf", entrada_centavos: 1000000, parcelas: 1, dias_primeira_parcela: 40 },
    prazo_entrega: { tipo: "pronta_entrega" },
  }),

  /** Empresa grande: sem entrada, boleto 30 dias após receber */
  faturado: (): DadosContrato => ({
    ...base(),
    equipamento: { tipo: "fiber", potencia: "6kW", marca_laser: "RAYCUS", quantidade: 1, modelo: "ECNC Fiber 3015 6kW", descricao: "Máquina de corte a laser Fiber, mesa 3000x1500 mm, fonte 6 kW", preco_centavos: 45000000 },
    acessorios: [],
    preco_total_centavos: 45000000,
    pagamento: { condicao: "faturado_recebimento", parcelas: 1 },
    prazo_entrega: { tipo: "dias_corridos", dias: 45 },
  }),
};

/** Comprador pessoa física — máquina Fiber, PIX à vista. */
export const casoPF = (): DadosContrato => ({
  contratante: {
    tipo_pessoa: "PF",
    razao_social: "Maria Oliveira Santos",
    documento: "153.509.460-56",
    endereco: { logradouro: "Rua das Flores", numero: "120", bairro: "Centro", cidade: "Garça", uf: "SP", cep: "17400-000" },
    email: "maria@exemplo.com.br",
    telefone: "(14) 99999-0000",
  },
  signatarios: [{ nome: "Maria Oliveira Santos", cpf: "153.509.460-56", cargo: "Compradora", email: "maria@exemplo.com.br" }],
  garantidor: {
    nome: "Maria Oliveira Santos", cpf: "153.509.460-56", email: "maria@exemplo.com.br",
    endereco: { logradouro: "Rua das Flores", numero: "120", bairro: "Centro", cidade: "Garça", uf: "SP", cep: "17400-000" },
  },
  testemunha_cliente: { nome: "Pedro Henrique Lima", cpf: "390.533.447-05", email: "pedro@exemplo.com.br", celular: "(14) 99777-1122" },
  equipamento: { tipo: "fiber", potencia: "5W", marca_laser: "RAYCUS", quantidade: 1, modelo: "ECNC Fiber Marking 5W", descricao: "Máquina de marcação a laser Fiber", preco_centavos: 3500000 },
  acessorios: [],
  preco_total_centavos: 3500000,
  pagamento: { condicao: "a_vista" },
  prazo_entrega: { tipo: "pronta_entrega" },
  responsavel_frete: "COMPRADOR",
  responsavel_instalacao: "COMPRADOR",
  frete_instalacao_embutidos: false,
});

export const dadosExemplo = CASOS.boleto_15x;

export const receitaExemplo = (): DadosReceita => ({
  cnpj: "11222333000181",
  razao_social: "METALURGICA EXEMPLO LTDA",
  situacao: "ATIVA",
  endereco: { logradouro: "RUA DAS INDUSTRIAS", numero: "500", bairro: "DISTRITO INDUSTRIAL", cidade: "MARILIA", uf: "SP", cep: "17512000" },
  socios: [{ nome: "JOAO DA SILVA", qualificacao: "Sócio-Administrador" }],
});
