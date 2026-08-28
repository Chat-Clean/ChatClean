/**
 * A política de cache da entrega (Story 4.9).
 *
 * ─── O CASO QUE ELA EXISTE PARA IMPEDIR ───────────────────────────────────
 *
 * Um Post agendado para as 9h responde 404 às 8h59. Se esse 404 for guardado, o
 * artigo entra no ar às 9h e quem tem o link continua recebendo "não existe" —
 * por um tempo que ninguém escolheu, porque sem declaração a hospedagem decide
 * sozinha. A negativa sobrevive à publicação.
 *
 * ─── E POR QUE UM MAPA, E NÃO UM `if` POR ROTA ────────────────────────────
 *
 * Mesma razão de `STATUS_DA_SITUACAO`: um `if` espalhado é onde o status novo
 * nasce sem política — e "sem política" não é neutro, é a hospedagem decidindo.
 *
 * Puro: sem rede, sem `fs`.
 */

/**
 * O teto, em segundos.
 *
 * É a promessa da story, e é por isso que ele é uma constante conferida: "a
 * correção do Autor aparece em até 60 segundos" deixa de ser verdade no
 * instante em que este número sobe, e nada na tela acusaria.
 */
export const SEGUNDOS_DE_CACHE = 60;

/** O que se guarda, e o que não se guarda. Lista fechada por status. */
export const POLITICA_POR_STATUS = Object.freeze({
  200: `public, s-maxage=${SEGUNDOS_DE_CACHE}`,
  301: `public, s-maxage=${SEGUNDOS_DE_CACHE}`,
  /* ★ AS NEGATIVAS NÃO SE GUARDAM ★
     404 é o agendado antes da hora; 410 é o arquivado, que pode voltar; 405 e
     500 são erros, e guardar um erro transforma uma falha de um segundo numa
     falha de um minuto. */
  404: "no-store",
  405: "no-store",
  410: "no-store",
  500: "no-store",
});

/* A COMPLETUDE É CONFERIDA NO CARREGAMENTO, e LANÇA. Um status que as rotas
   emitem e o mapa não conhece sairia sem `Cache-Control` — que é o estado de
   antes desta story, e o defeito que ela conserta. */
export const STATUS_EMITIDOS = Object.freeze([200, 301, 404, 405, 410, 500]);
{
  const semPolitica = STATUS_EMITIDOS.filter(
    (s) => typeof POLITICA_POR_STATUS[s] !== "string",
  );
  if (semPolitica.length > 0) {
    throw new Error(
      `A política de cache não cobre os status [${semPolitica.join(", ")}] — ` +
        "sem declaração, quem decide por quanto tempo guardar é a hospedagem.",
    );
  }
}

/**
 * A diretiva de um status.
 *
 * Status desconhecido cai em `no-store`: o lado seguro é não guardar o que
 * ninguém classificou. Guardar por engano é o defeito; não guardar por engano é
 * só uma viagem a mais.
 */
export function politicaDeCache(status) {
  return POLITICA_POR_STATUS[status] ?? "no-store";
}

/** A coleção inteira — tudo que muda quando qualquer Post muda. */
export const ETIQUETA_DA_COLECAO = "blog";

/**
 * O vocabulário de caractere de etiqueta.
 *
 * Fechado, e por lista de PERMISSÃO. O slug já é validado na gravação, mas a
 * etiqueta vai num cabeçalho HTTP — e um caractere que quebre o cabeçalho não
 * quebraria a etiqueta, quebraria a RESPOSTA. Recusar é barato.
 */
const CARACTERE_DE_ETIQUETA = /^[a-z0-9-]+$/;

/**
 * As etiquetas de uma resposta.
 *
 * `slug` ausente ou fora do vocabulário devolve só a da coleção: a etiqueta do
 * Post é conveniência para purga futura, e nenhuma garantia desta story depende
 * dela. Derrubar a resposta por causa de uma etiqueta seria trocar o essencial
 * pelo acessório.
 */
export function etiquetasDaResposta({ slug = null, colecoes = [] } = {}) {
  const etiquetas = [ETIQUETA_DA_COLECAO, ...colecoes];
  if (typeof slug === "string" && CARACTERE_DE_ETIQUETA.test(slug)) {
    etiquetas.push(`post:${slug}`);
  }
  return etiquetas;
}
