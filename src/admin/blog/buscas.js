/**
 * As regras puras da tela de Buscas no Google do Painel.
 *
 * Módulo próprio, fora do componente, pela razão de sempre: função pura em
 * arquivo de componente quebra a recarga rápida, e aqui a verificação pode
 * EXECUTAR a regra em vez de ler JSX. Sem React e sem rede.
 *
 * ─── QUATRO NÚMEROS, E DOIS DELES SÃO DERIVADOS ─────────────────────────────
 *
 * O Google entrega cliques, impressões e posição. A taxa de cliques é cliques
 * sobre impressões, calculada aqui a partir dos TOTAIS do período: a média das
 * taxas de cada dia daria o mesmo peso a um dia de uma impressão e a um dia de
 * mil. A posição do período segue a mesma lógica, ponderada pelas impressões.
 */

import { formatarNumero, LOCALIDADE } from "@/domain/blog/formato";

/* ─── A voz da tela ──────────────────────────────────────────────────────── */

export const TITULO_DA_TELA = "Buscas no Google";
export const DESCRICAO_DA_TELA =
  "Como o site aparece nas buscas do Google: quantas vezes foi exibido, quantos " +
  "cliques recebeu e em que posição. Só entra aqui quem chegou pela busca do Google.";
export const ROTULO_DE_VOLTAR = "Voltar ao Painel";
export const ROTULO_DO_SITE_INTEIRO = "Site inteiro";
export const TITULO_DAS_PAGINAS = "Páginas mais clicadas";
export const TITULO_DOS_TERMOS = "Termos de busca";
export const TITULO_DO_ERRO = "Não foi possível carregar as buscas";
export const ROTULO_DE_RECARREGAR = "Tentar de novo";
export const TITULO_SEM_DADOS = "Ainda não há dados do Google";
export const DESCRICAO_SEM_DADOS =
  "Os números chegam por uma sincronização diária com o Google Search Console. " +
  "Se ela acabou de ser configurada, os primeiros dados aparecem em até um dia.";
export const TITULO_SEM_TERMOS = "Nenhum termo de busca neste período";
export const DESCRICAO_SEM_TERMOS =
  "O Google só mostra os termos que tiveram volume suficiente; os mais raros ele omite.";
export const ROTULO_DA_TABELA_DE_DIAS = "Ver os números de cada dia";

/* ─── As medidas do gráfico ──────────────────────────────────────────────── */

/**
 * O que o gráfico pode desenhar: UMA medida por vez.
 *
 * Cliques e impressões têm escalas muito diferentes — dezenas contra milhares.
 * Desenhar as duas no mesmo gráfico exigiria dois eixos, e gráfico de dois
 * eixos faz as linhas se cruzarem onde quem desenhou escolher.
 */
export const MEDIDAS = Object.freeze([
  Object.freeze({ id: "cliques", rotulo: "Cliques" }),
  Object.freeze({ id: "impressoes", rotulo: "Impressões" }),
]);

/** A medida com que a tela abre. */
export const MEDIDA_PADRAO = "cliques";

/* ─── Os números ─────────────────────────────────────────────────────────── */

const inteiro = (valor) =>
  Number.isFinite(Number(valor)) ? Math.max(0, Math.trunc(Number(valor))) : 0;

/** `1 clique`, `1.234 cliques`. */
export function textoDeCliques(total) {
  const n = inteiro(total);
  return `${formatarNumero(n)} ${n === 1 ? "clique" : "cliques"}`;
}

/** `1 impressão`, `1.234 impressões`. */
export function textoDeImpressoes(total) {
  const n = inteiro(total);
  return `${formatarNumero(n)} ${n === 1 ? "impressão" : "impressões"}`;
}

/** O valor de um ponto do gráfico por extenso, na medida escolhida. */
export function rotularMedida(medida) {
  return medida === "impressoes" ? textoDeImpressoes : textoDeCliques;
}

/**
 * `3,8%`: cliques sobre impressões. `null` sem impressão.
 *
 * Sem impressão não há taxa: zero por cento diria que o site apareceu e ninguém
 * clicou, e ele nem apareceu.
 */
export function textoDaTaxa(cliques, impressoes) {
  const exibicoes = inteiro(impressoes);
  if (exibicoes === 0) return null;
  const taxa = (inteiro(cliques) / exibicoes) * 100;
  return `${new Intl.NumberFormat(LOCALIDADE, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(taxa)}%`;
}

/**
 * `8,4`: a posição média, com uma casa. `null` quando não há posição.
 *
 * Posição zero não existe: o primeiro resultado é o 1. Zero aqui é "sem dado".
 */
export function textoDaPosicao(posicao) {
  const n = Number(posicao);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Intl.NumberFormat(LOCALIDADE, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
}

/**
 * O resumo do período, a partir da série por dia.
 *
 * Os dois totais são somas. A posição é a média ponderada pelas impressões de
 * cada dia, e é `0` quando o período não teve impressão.
 */
export function resumoDasBuscas(serie) {
  let cliques = 0;
  let impressoes = 0;
  let posicaoPonderada = 0;
  for (const ponto of Array.isArray(serie) ? serie : []) {
    const exibicoes = inteiro(ponto?.impressoes);
    cliques += inteiro(ponto?.cliques);
    impressoes += exibicoes;
    posicaoPonderada += (Number(ponto?.posicao) || 0) * exibicoes;
  }
  return {
    cliques,
    impressoes,
    posicao: impressoes > 0 ? posicaoPonderada / impressoes : 0,
  };
}

/* ─── A série ────────────────────────────────────────────────────────────── */

/**
 * A série cortada no último dia com dado.
 *
 * O Google entrega com dois ou três dias de atraso. Sem o corte, os dias que
 * ele ainda não entregou entram como zero e a linha despenca no fim do gráfico
 * — que é ler "ninguém buscou" onde o certo é "ainda não se sabe". Sem último
 * dia conhecido a série volta inteira.
 */
export function ateOUltimoDia(serie, ultimoDia) {
  const pontos = Array.isArray(serie) ? serie : [];
  if (typeof ultimoDia !== "string" || ultimoDia === "") return pontos;
  /* `AAAA-MM-DD` ordena como texto: a comparação não passa por data nem fuso. */
  return pontos.filter((ponto) => String(ponto?.dia ?? "") <= ultimoDia);
}

/** A série na forma que o gráfico desenha: `{ dia, total }` da medida escolhida. */
export function serieDaMedida(serie, medida) {
  const campo = medida === "impressoes" ? "impressoes" : "cliques";
  return (Array.isArray(serie) ? serie : []).map((ponto) => ({
    dia: ponto.dia,
    total: inteiro(ponto?.[campo]),
  }));
}

/* ─── A página ───────────────────────────────────────────────────────────── */

/**
 * Como uma página é chamada na tela.
 *
 * Post tem título, e é ele que aparece. As demais páginas aparecem pelo
 * caminho, que é como quem cuida do site as conhece — menos a home, cujo
 * caminho é uma barra sozinha e não diz nada a ninguém.
 */
export function nomeDaPagina(linha) {
  const titulo = typeof linha?.titulo === "string" ? linha.titulo.trim() : "";
  if (titulo !== "") return titulo;
  const caminho = typeof linha?.pagina === "string" ? linha.pagina : "";
  return caminho === "/" ? "Página inicial" : caminho;
}
