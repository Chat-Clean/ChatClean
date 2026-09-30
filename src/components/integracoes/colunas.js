import { MARCAS_INTEGRADAS } from "./marcas";

/**
 * Quantas marcas cada coluna da parede leva, da esquerda para a direita.
 *
 * Cinco colunas, 3-4-3-4-3, centradas na vertical (`.integracoes-parede`,
 * em `index.css`): a coluna de 3 fica meio quadro abaixo da de 4 sem
 * nenhum deslocamento à mão, e é esse desencontro que faz a parede parecer
 * um mosaico. A soma tem de ser o total de marcas; `colunasDeMarcas` recusa
 * uma conta que não fecha, para uma marca nova não sumir da tela em silêncio.
 */
export const TAMANHOS_DAS_COLUNAS = Object.freeze([3, 4, 3, 4, 3]);

export function colunasDeMarcas(marcas, tamanhos) {
  const total = tamanhos.reduce((soma, n) => soma + n, 0);
  if (total !== marcas.length) {
    throw new Error(
      `a parede de integrações tem ${marcas.length} marcas e ${total} lugares: ajuste TAMANHOS_DAS_COLUNAS`,
    );
  }
  const colunas = [];
  let inicio = 0;
  for (const tamanho of tamanhos) {
    colunas.push(marcas.slice(inicio, inicio + tamanho));
    inicio += tamanho;
  }
  return colunas;
}

export const COLUNAS_DE_MARCAS = Object.freeze(colunasDeMarcas(MARCAS_INTEGRADAS, TAMANHOS_DAS_COLUNAS));

/** As três vantagens ao lado do título; `icone` é o nome do ícone do lucide. */
export const VANTAGENS_DA_INTEGRACAO = Object.freeze([
  Object.freeze({ texto: "Automatize processos", icone: "Workflow" }),
  Object.freeze({ texto: "Mantenha seus times em sincronia", icone: "Users" }),
  Object.freeze({ texto: "Envie mensagens pela API", icone: "Code2" }),
]);
