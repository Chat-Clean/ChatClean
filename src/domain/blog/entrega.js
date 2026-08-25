/**
 * O vocabulário da ENTREGA: em que situação um endereço está.
 *
 * ─── POR QUE NÃO É O VOCABULÁRIO DE ESTADO ────────────────────────────────
 *
 * O Estado do Post — rascunho, agendado, publicado, arquivado — é do domínio de
 * quem ESCREVE. A situação de um endereço é do domínio de quem ENTREGA, e as
 * duas não se correspondem uma a uma:
 *
 *   - dois Posts agendados, com datas diferentes, têm o MESMO Estado e
 *     situações opostas: um está no ar, o outro é indistinguível de inexistente;
 *   - um endereço aposentado não tem Estado nenhum, e tem situação;
 *   - rascunho e agendado por vir são Estados DIFERENTES e a mesma situação, de
 *     propósito — deixá-los distinguíveis diria a quem perguntasse que existe
 *     um Post ali, que é o que a Story 2.13 fechou.
 *
 * Tratá-los como o mesmo vocabulário faria a entrega herdar toda mudança do
 * Estado, e o Estado ganhar significado de entrega que não é dele.
 *
 * Puro: sem React, sem rede, sem banco. A função de banco devolve estas mesmas
 * palavras, e a verificação compara as duas listas — um valor novo de um lado
 * sem o outro é acusado.
 */

/** O endereço serve um Post visível agora. É a única situação com conteúdo. */
export const NO_AR = "no-ar";

/** O Post existiu e saiu do ar. A entrega responde que ele se foi. */
export const ARQUIVADO = "arquivado";

/** O endereço é antigo, e o atual está no ar. */
export const REDIRECIONADO = "redirecionado";

/** Nunca existiu, ou não é distinguível disso. */
export const INEXISTENTE = "inexistente";

/** As quatro, congeladas. A ordem é a de quem lê a resposta, não a do banco. */
export const SITUACOES_DA_ENTREGA = Object.freeze([
  NO_AR,
  ARQUIVADO,
  REDIRECIONADO,
  INEXISTENTE,
]);

/** Compara contra a LISTA, e não contra chaves de objeto. */
export function ehSituacaoDaEntrega(valor) {
  return typeof valor === "string" && SITUACOES_DA_ENTREGA.includes(valor);
}

/**
 * As situações que NÃO podem trazer conteúdo.
 *
 * Declarada em vez de derivada por negação para que acrescentar uma situação
 * obrigue a decidir de que lado ela fica — o padrão silencioso seria o lado
 * errado.
 */
export const SITUACOES_SEM_CONTEUDO = Object.freeze([
  ARQUIVADO,
  REDIRECIONADO,
  INEXISTENTE,
]);

/* A PARTIÇÃO É CONFERIDA NO CARREGAMENTO, e LANÇA. Uma situação nova que não
   entrasse em nenhum dos dois lados nasceria podendo trazer conteúdo sem
   ninguém ter decidido isso. */
{
  const comConteudo = SITUACOES_DA_ENTREGA.filter(
    (s) => !SITUACOES_SEM_CONTEUDO.includes(s),
  );
  const sobrando = SITUACOES_SEM_CONTEUDO.filter(
    (s) => !SITUACOES_DA_ENTREGA.includes(s),
  );
  if (comConteudo.length !== 1 || comConteudo[0] !== NO_AR || sobrando.length > 0) {
    throw new Error(
      "A partição das situações da entrega quebrou: exatamente uma pode trazer " +
        `conteúdo, e ela é "${NO_AR}". Com conteúdo: [${comConteudo.join(", ")}]; ` +
        `fora da lista: [${sobrando.join(", ")}].`,
    );
  }
}

/** Os campos que só existem quando o Post está no ar. Lista fechada. */
export const CAMPOS_DE_CONTEUDO = Object.freeze([
  "post_id",
  "titulo",
  "resumo",
  "conteudo_html",
  "autor_nome",
  "imagem_url",
  "imagem_alt",
  "seo_titulo",
  "seo_descricao",
  "seo_imagem_url",
  "categoria_nome",
  "publicado_em",
  "atualizado_em",
]);

/**
 * O STATUS HTTP de cada situação (Story 4.5).
 *
 * ─── POR QUE UM MAPA, E NÃO UM `if` POR CASO NA ROTA ──────────────────────
 *
 * Desde a Story 4.1 a rota respondia 200 para tudo: um artigo arquivado dizia
 * "aqui está, tudo certo" com uma página sem o artigo, e para o buscador isso
 * não é página faltando — é página DUPLICADA e vazia, e ele desconta o site
 * inteiro por isso.
 *
 * Um `if` por caso espalhado na rota é justamente onde a situação nova nasce
 * respondendo 200 sem ninguém ter decidido. O mapa força a decisão, e a guarda
 * abaixo LANÇA quando ela não foi tomada.
 *
 * ─── E POR QUE 410 PARA O ARQUIVADO ───────────────────────────────────────
 *
 * 404 diz "não sei o que é isso"; 410 diz "isto existiu e foi retirado". A
 * diferença é prática — 410 sai do índice mais rápido e não fica sendo
 * re-tentado por meses — e é a verdade: o Post existiu, e quem guardou o link
 * merece uma resposta que diga isso em vez de fingir que ele inventou o
 * endereço.
 *
 * ─── E 404, E NÃO 403, PARA O RASCUNHO ────────────────────────────────────
 *
 * 403 confirmaria que o endereço existe e está protegido — a mesma pauta
 * editorial que a Story 2.13 fechou. Rascunho e agendado por vir já chegam aqui
 * como `inexistente` (Story 4.2), e por isso não têm caso próprio: a
 * indistinguibilidade é construída lá, e aqui é só não estragá-la.
 */
export const STATUS_DA_SITUACAO = Object.freeze({
  [NO_AR]: 200,
  [ARQUIVADO]: 410,
  [REDIRECIONADO]: 301,
  [INEXISTENTE]: 404,
});

/* A COMPLETUDE É CONFERIDA NO CARREGAMENTO, e LANÇA. Uma situação nova sem
   código declarado responderia `undefined` — que vira 200 na maioria dos
   servidores, que é exatamente o defeito que esta story conserta. */
{
  const semStatus = SITUACOES_DA_ENTREGA.filter(
    (s) => !Number.isInteger(STATUS_DA_SITUACAO[s]),
  );
  const sobrando = Object.keys(STATUS_DA_SITUACAO).filter(
    (s) => !SITUACOES_DA_ENTREGA.includes(s),
  );
  if (semStatus.length > 0 || sobrando.length > 0) {
    throw new Error(
      "O mapa de status da entrega não cobre o vocabulário: sem código " +
        `[${semStatus.join(", ")}]; fora do vocabulário [${sobrando.join(", ")}].`,
    );
  }
}

/** O status de uma situação. `null` quando ela não é do vocabulário. */
export function statusDaSituacao(situacao) {
  return ehSituacaoDaEntrega(situacao) ? STATUS_DA_SITUACAO[situacao] : null;
}
