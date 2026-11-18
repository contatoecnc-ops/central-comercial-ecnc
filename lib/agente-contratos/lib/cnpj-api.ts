import { somenteDigitos } from "./documentos";

/** Dados da Receita Federal que interessam ao contrato. */
export interface DadosReceita {
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string;
  situacao: string; // ATIVA, BAIXADA, INAPTA, SUSPENSA...
  endereco: {
    logradouro: string; numero: string; complemento?: string;
    bairro: string; cidade: string; uf: string; cep: string;
  };
  email?: string;
  telefone?: string;
  /** Quadro de sócios e administradores. */
  socios: { nome: string; qualificacao: string }[];
}

export type ConsultaCnpj = (cnpj: string) => Promise<DadosReceita>;

/**
 * Consulta gratuita via BrasilAPI (espelho dos dados públicos da Receita).
 * Pode ser trocada por outro provedor pago sem mexer no resto do agente.
 */
export const consultarCnpjBrasilApi: ConsultaCnpj = async (cnpj) => {
  const c = somenteDigitos(cnpj);
  const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${c}`, { headers: { Accept: "application/json" } });
  if (r.status === 404) throw new Error("CNPJ não encontrado na Receita Federal.");
  if (!r.ok) throw new Error(`Consulta de CNPJ indisponível agora (HTTP ${r.status}). Confirme os dados manualmente.`);
  const j: any = await r.json();
  const tel = j.ddd_telefone_1 ? String(j.ddd_telefone_1).trim() : undefined;
  return {
    cnpj: c,
    razao_social: j.razao_social ?? "",
    nome_fantasia: j.nome_fantasia || undefined,
    situacao: String(j.descricao_situacao_cadastral ?? "").toUpperCase(),
    endereco: {
      logradouro: [j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(" "),
      numero: String(j.numero ?? ""),
      complemento: j.complemento || undefined,
      bairro: j.bairro ?? "",
      cidade: j.municipio ?? "",
      uf: j.uf ?? "",
      cep: String(j.cep ?? ""),
    },
    email: j.email || undefined,
    telefone: tel,
    socios: (j.qsa ?? []).map((s: any) => ({ nome: s.nome_socio, qualificacao: s.qualificacao_socio })),
  };
};
