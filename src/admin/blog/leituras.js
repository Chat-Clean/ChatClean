/**
 * As regras puras da tela de Leituras do Painel.
 *
 * Módulo próprio, fora do componente, pela razão de sempre: função pura em
 * arquivo de componente quebra a recarga rápida, e aqui a verificação pode
 * EXECUTAR a regra em vez de ler JSX. Sem React e sem rede.
 *
 * ─── O DIA É TEXTO, E NÃO INSTANTE ──────────────────────────────────────────
 *
 * O banco entrega cada dia como `AAAA-MM-DD`, já no fuso do site. Passar esse
 * texto por `new Date()` o leria como meia-noite em UTC, e num navegador a
 * oeste de Greenwich o gráfico mostraria o dia anterior em todos os pontos.
 * Aqui o dia é fatiado como texto, e nenhum fuso entra na conta.
 */

import { formatarNumero, LOCALIDADE } from "@/domain/blog/formato";

/* ─── A voz da tela ──────────────────────────────────────────────────────── */

export const TITULO_DA_TELA = "Leituras";
export const DESCRICAO_DA_TELA =
  "Quantas vezes os artigos foram lidos, dia a dia. Conta como leitura quem " +
  "fica pelo menos 15 segundos com o artigo aberto, uma vez por navegador.";
export const ROTULO_DE_VOLTAR = "Voltar ao Painel";
export const TITULO_DO_GRAFICO = "Leituras por dia";
export const TITULO_DO_RANKING = "Posts mais lidos";
export const ROTULO_DE_TODOS_OS_POSTS = "Todos os posts";
export const TITULO_DO_ERRO = "Não foi possível carregar as leituras";
export const ROTULO_DE_RECARREGAR = "Tentar de novo";
export const TITULO_DO_VAZIO = "Nenhuma leitura neste período";
export const DESCRICAO_DO_VAZIO =
  "Quando alguém ler um artigo do blog, a leitura aparece aqui no mesmo dia.";
export const ROTULO_DA_TABELA_DE_DIAS = "Ver os números de cada dia";

/* ─── O período ──────────────────────────────────────────────────────────── */

/** Os períodos que a tela oferece, do mais curto ao mais longo. */
export const PERIODOS = Object.freeze([
  Object.freeze({ dias: 7, rotulo: "7 dias" }),
  Object.freeze({ dias: 30, rotulo: "30 dias" }),
  Object.freeze({ dias: 90, rotulo: "90 dias" }),
]);

/** O período com que a tela abre. */
export const PERIODO_PADRAO = 30;

/** `nos últimos 30 dias`, para as frases que nomeiam o recorte. */
export function textoDoPeriodo(dias) {
  return `nos últimos ${formatarNumero(dias)} dias`;
}

/* ─── O dia ──────────────────────────────────────────────────────────────── */

const FORMATO_DE_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `01/10`, para o eixo. `""` quando o texto não é um dia. */
export function diaCurto(dia) {
  const partes = FORMATO_DE_DIA.exec(String(dia ?? ""));
  return partes === null ? "" : `${partes[3]}/${partes[2]}`;
}

/** `01/10/2026`, para o que se lê com calma. `""` quando o texto não é um dia. */
export function diaCompleto(dia) {
  const partes = FORMATO_DE_DIA.exec(String(dia ?? ""));
  return partes === null ? "" : `${partes[3]}/${partes[2]}/${partes[1]}`;
}

/* ─── Os números ─────────────────────────────────────────────────────────── */

/** `1 leitura`, `1.234 leituras`. */
export function textoDeLeituras(total) {
  const n = Number.isFinite(Number(total)) ? Math.max(0, Math.trunc(Number(total))) : 0;
  return `${formatarNumero(n)} ${n === 1 ? "leitura" : "leituras"}`;
}

/**
 * `3,4`: a média com uma casa, na localidade do site.
 *
 * Uma leitura em trinta dias dá 0,03, que arredondado vira "0,0" ao lado de um
 * total que diz 1. Abaixo do que uma casa consegue mostrar, a frase diz isso.
 */
export function textoDaMedia(media) {
  const n = Number.isFinite(Number(media)) ? Number(media) : 0;
  if (n > 0 && n < 0.05) return "menos de 0,1";
  return new Intl.NumberFormat(LOCALIDADE, {
    minimumFractionDigits: n > 0 && n < 10 ? 1 : 0,
    maximumFractionDigits: n < 10 ? 1 : 0,
  }).format(n);
}

/**
 * O resumo do período: total, média por dia e o melhor dia.
 *
 * `melhorDia` é `null` enquanto não há leitura — "o melhor dia foi 01/10, com
 * zero leituras" é uma frase sobre nada. No empate vale o dia MAIS RECENTE,
 * que é o que a pessoa ainda consegue relacionar com alguma coisa que fez.
 */
export function resumoDaSerie(serie) {
  const pontos = Array.isArray(serie) ? serie : [];
  let total = 0;
  let melhorDia = null;
  for (const ponto of pontos) {
    const valor = Number(ponto?.total) || 0;
    total += valor;
    if (valor > 0 && (melhorDia === null || valor >= melhorDia.total)) {
      melhorDia = { dia: ponto.dia, total: valor };
    }
  }
  return {
    total,
    mediaPorDia: pontos.length === 0 ? 0 : total / pontos.length,
    melhorDia,
  };
}

/* ─── O eixo ─────────────────────────────────────────────────────────────── */

/**
 * As marcas do eixo de valores: números redondos, de zero até um topo que
 * cobre o máximo.
 *
 * O passo é sempre 1, 2 ou 5 vezes uma potência de dez, e nunca menor que 1:
 * leitura é contagem, e um eixo com "0,5 leitura" descreve algo que não existe.
 * Com tudo zerado o topo é 4, para o gráfico ter altura e a linha ficar no chão
 * em vez de no meio do nada.
 */
export function escalaDeValores(maximo) {
  const teto = Number.isFinite(Number(maximo)) ? Math.max(0, Number(maximo)) : 0;
  if (teto <= 4) return { topo: 4, marcas: [0, 1, 2, 3, 4] };
  const bruto = teto / 4;
  const grandeza = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 5, 10].map((m) => m * grandeza).find((p) => p >= bruto) ?? 10 * grandeza;
  const intervalos = Math.ceil(teto / passo);
  return {
    topo: intervalos * passo,
    marcas: Array.from({ length: intervalos + 1 }, (_, i) => i * passo),
  };
}

/**
 * Quais pontos ganham rótulo no eixo do tempo.
 *
 * Rotular todos os dias de um período de noventa empilha os rótulos uns sobre
 * os outros. Saem no máximo `maximo` rótulos, igualmente espaçados, e o
 * primeiro e o último dia estão sempre entre eles: são os dois que dizem onde o
 * período começa e termina.
 */
export function marcasDoTempo(quantosPontos, maximo = 6) {
  const n = Math.max(0, Math.trunc(Number(quantosPontos) || 0));
  if (n === 0) return [];
  if (n <= maximo) return Array.from({ length: n }, (_, i) => i);
  const vaos = Math.max(1, maximo - 1);
  const indices = new Set();
  for (let i = 0; i <= vaos; i += 1) indices.add(Math.round((i * (n - 1)) / vaos));
  return [...indices].sort((a, b) => a - b);
}
