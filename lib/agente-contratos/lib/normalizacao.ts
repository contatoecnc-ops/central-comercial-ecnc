import {
  ehGarantiaTreMeses, ehMarcaPadraoFiber, FAMILIAS, GARANTIA_TUBO, lerPotenciaW, MARCA_PADRAO_FIBER, marcaChave, NOME_TIPO, reconhecerFamilia,
  type FamiliaEquipamento,
} from "../config/equipamentos";
import { REGRAS_GERAIS } from "../config/empresa";
import { modeloDoTipo, type TipoMaquina } from "../config/modelos";
import type { DadosContrato, DadosContratoEntrada } from "../tipos";

export interface ResultadoNormalizacao {
  dados: DadosContratoEntrada;
  /** O que o sistema ajustou sozinho (mostrado ao vendedor e ao gestor). */
  ajustes_automaticos: string[];
  /** Impede a geração (ex.: garantia automática sem espaço nos opcionais). */
  erros: string[];
}

const textoOuUndefined = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/**
 * Etapa anterior à validação. Aplica o que o catálogo manda e o vendedor não precisa informar:
 *  - marca padrão (L-6040 → SPT; Fiber → RAYCUS Q/QB) e normalização das variações do Raycus;
 *  - garantia adicional de 3 meses do tubo no CO₂ 90W (RECI/SPT), com valor R$ 0,00 (bonificação);
 *  - tipo da máquina, se não vier (se vier diferente da família, quem reclama é a validação).
 * Não altera o objeto recebido. Idempotente: normalizar um contrato já normalizado não muda nada.
 */
export function normalizarDados(entrada: DadosContratoEntrada): ResultadoNormalizacao {
  const ajustes: string[] = [];
  const erros: string[] = [];
  if (!entrada || typeof entrada !== "object" || !entrada.equipamento || typeof entrada.equipamento !== "object")
    return { dados: entrada, ajustes_automaticos: ajustes, erros };

  const dados = structuredClone(entrada) as DadosContratoEntrada;
  const eq = dados.equipamento as DadosContratoEntrada["equipamento"] & { potencia?: string; marca_laser?: string };

  // Texto vazio vira "não informado" (router não tem potência nem marca).
  eq.potencia = textoOuUndefined(eq.potencia);
  eq.marca_laser = textoOuUndefined(eq.marca_laser);

  const f = reconhecerFamilia(eq.modelo);
  if (!f) return { dados, ajustes_automaticos: ajustes, erros };
  if (!eq.tipo) eq.tipo = f.tipo;

  // ---- marca padrão
  if (f.tipo === "fiber") {
    if (!eq.marca_laser) {
      eq.marca_laser = MARCA_PADRAO_FIBER;
      ajustes.push(`Marca ${MARCA_PADRAO_FIBER} aplicada (padrão do Fiber)`);
    } else if (ehMarcaPadraoFiber(eq.marca_laser)) eq.marca_laser = MARCA_PADRAO_FIBER;
  } else if (f.marca_padrao && !eq.marca_laser) {
    eq.marca_laser = f.marca_padrao;
    ajustes.push(`Marca ${f.marca_padrao} aplicada (padrão do ${f.nome})`);
  }

  // ---- garantia adicional de 3 meses: CO₂ 90W (RECI ou SPT) sempre tem
  const potencia = lerPotenciaW(eq.potencia);
  const marcaOk = !!eq.marca_laser && GARANTIA_TUBO.marcas.includes(marcaChave(eq.marca_laser));
  if (f.tipo === "co2" && potencia === GARANTIA_TUBO.potencia_w && marcaOk) {
    const acessorios = Array.isArray(dados.acessorios) ? dados.acessorios : [];
    if (!acessorios.some((a) => typeof a?.descricao === "string" && ehGarantiaTreMeses(a.descricao))) {
      if (acessorios.length >= REGRAS_GERAIS.max_acessorios)
        erros.push(
          `Sem espaço para a garantia adicional de 3 meses do CO₂ ${GARANTIA_TUBO.potencia_w}W: o contrato tem ${REGRAS_GERAIS.max_acessorios} linhas de opcionais e todas estão ocupadas. ` +
          `Reduza os opcionais para ${REGRAS_GERAIS.max_acessorios - 1}.`,
        );
      else {
        dados.acessorios = [...acessorios, { descricao: GARANTIA_TUBO.descricao, valor_centavos: 0 }];
        ajustes.push(`Garantia adicional de 3 meses incluída (CO₂ ${GARANTIA_TUBO.potencia_w}W)`);
      }
    }
  }
  return { dados, ajustes_automaticos: ajustes, erros };
}

const listaModelos = () => FAMILIAS.map((f) => f.como_escreve).join("; ");

export const mensagemConfirmeModelo = (modelo: string) =>
  `Modelo "${modelo}" não bate com nenhum do catálogo — peça ao vendedor para confirmar o modelo. Aceitos: ${listaModelos()}.`;

export const mensagemSemModelo = (tipo: TipoMaquina) =>
  `Ainda não há modelo de contrato para máquina "${NOME_TIPO[tipo] ?? tipo}" — fale com o gestor.`;

/**
 * Confere o equipamento (já normalizado e com o schema aprovado) contra o catálogo.
 * Devolve erros que bloqueiam e alertas para o gestor.
 */
export function conferirEquipamento(d: DadosContrato): { erros: string[]; alertas: string[]; familia?: FamiliaEquipamento } {
  const erros: string[] = [];
  const alertas: string[] = [];
  const eq = d.equipamento;
  const f = reconhecerFamilia(eq.modelo);
  if (!f) {
    erros.push(mensagemConfirmeModelo(eq.modelo));
    return { erros, alertas };
  }

  if (eq.tipo !== f.tipo)
    erros.push(`${f.nome} é sempre ${NOME_TIPO[f.tipo]} — o tipo informado foi "${NOME_TIPO[eq.tipo]}". Confirme o modelo com o vendedor.`);

  const watts = lerPotenciaW(eq.potencia);
  if (f.tem_potencia) {
    if (!eq.potencia) erros.push(`Informe a potência do ${f.nome}.`);
    else if (f.potencias_w) {
      if (watts === undefined) erros.push(`Não entendi a potência "${eq.potencia}" — use o formato 100W.`);
      else if (!f.potencias_w.includes(watts))
        erros.push(`${f.nome} não existe em ${watts}W. Potências aceitas: ${f.potencias_w.map((w) => `${w}W`).join(", ")}.`);
    }
  }

  if (f.tem_marca) {
    if (!eq.marca_laser) erros.push(`Informe a marca do laser — o ${f.nome} não tem marca padrão.`);
    else if (f.marcas_por_potencia && watts !== undefined && f.marcas_por_potencia[watts]) {
      const aceitas = f.marcas_por_potencia[watts];
      if (!aceitas.includes(marcaChave(eq.marca_laser)))
        erros.push(`Marca ${eq.marca_laser.toUpperCase()} não é aceita para ${f.nome} de ${watts}W. Aceitas: ${aceitas.join(", ")}.`);
    }
  }

  if (f.tipo === "fiber" && eq.marca_laser && !ehMarcaPadraoFiber(eq.marca_laser))
    alertas.push(`Fiber com marca ${eq.marca_laser.toUpperCase()} — padrão é ${MARCA_PADRAO_FIBER}`);

  if (f.tipo === "co2" && watts !== undefined && watts !== GARANTIA_TUBO.potencia_w && d.acessorios.some((a) => ehGarantiaTreMeses(a.descricao)))
    alertas.push(`Garantia adicional de 3 meses para CO₂ de ${watts}W — fora da política, só o ${GARANTIA_TUBO.potencia_w}W tem`);

  // UV, solda, Fiber de corte e Router: reconhecidos, mas ainda sem modelo de contrato.
  if (!modeloDoTipo(f.tipo)) erros.push(mensagemSemModelo(f.tipo));
  return { erros, alertas, familia: f };
}
