/**
 * O vocabulário fechado de Estado do Post.
 *
 * Domínio puro (AD-1): nenhuma dependência de React, de Supabase ou de
 * armazenamento. É consumido pelo Painel hoje e pelo Blog Público no Épico 2 —
 * e é por isso que ele nasce aqui, e não dentro de um componente.
 *
 * **Nenhum Post tem Estado persistido ainda.** Isso chega no Épico 2. O que
 * este módulo entrega é a lista fechada e sua aparência, para que a tela que
 * vier consuma em vez de inventar. Um sinônimo ("publicada", "draft", "no ar")
 * numa superfície e outro em outra é exatamente o que a lista fechada impede.
 *
 * A regra que sustenta o fechamento: valor fora da lista **falha alto**. Um
 * quinto Estado só pode entrar editando este arquivo — nunca por acidente, e
 * nunca virando rótulo em branco na tela.
 *
 * O par de cor é referência a token (`var(--state-…)`), nunca hex solto: os
 * quatro pares vivem em `src/App.css` e já têm contraste WCAG AA verificado
 * pela ferramenta da Story 1.1 (entre 4,90:1 e 5,80:1).
 */

/**
 * As quatro chaves, na ordem do ciclo de vida. A ordem é significativa: é ela
 * que um filtro ou uma legenda deve seguir para não reinventar a sequência.
 */
export const ESTADOS = Object.freeze([
  "rascunho",
  "agendado",
  "publicado",
  "arquivado",
]);

/**
 * A palavra única de cada Estado e seu par de cor.
 *
 * `rotulo` é a palavra por extenso — a mesma em toda superfície, sem sinônimo,
 * sem abreviação e sem plural. `fundo` e `tinta` são referências aos tokens do
 * Painel.
 */
const CATALOGO = Object.freeze({
  rascunho: Object.freeze({
    rotulo: "Rascunho",
    fundo: "var(--state-rascunho-bg)",
    tinta: "var(--state-rascunho-ink)",
  }),
  agendado: Object.freeze({
    rotulo: "Agendado",
    fundo: "var(--state-agendado-bg)",
    tinta: "var(--state-agendado-ink)",
  }),
  publicado: Object.freeze({
    rotulo: "Publicado",
    fundo: "var(--state-publicado-bg)",
    tinta: "var(--state-publicado-ink)",
  }),
  arquivado: Object.freeze({
    rotulo: "Arquivado",
    fundo: "var(--state-arquivado-bg)",
    tinta: "var(--state-arquivado-ink)",
  }),
});

/**
 * `true` apenas para uma das quatro chaves. Existe para quem PRECISA testar
 * (um filtro que aceita "todos", uma migração que audita dados antigos) sem
 * provocar exceção. Quem vai exibir não usa isto — usa `aparenciaDoEstado`, que
 * falha alto.
 */
export function ehEstado(valor) {
  return typeof valor === "string" && Object.hasOwn(CATALOGO, valor);
}

/**
 * A aparência do Estado: `{ rotulo, fundo, tinta }`.
 *
 * Lança para qualquer valor fora da lista — inclusive `undefined`, `null`,
 * string vazia e variação de caixa. Estado desconhecido é erro de programação,
 * não caso de borda de interface: devolver um objeto neutro produziria uma
 * pílula em branco que ninguém consegue explicar meses depois.
 *
 * O objeto devolvido é congelado: quem consome não pode reescrever o par de cor
 * do Estado para todo mundo por engano.
 */
export function aparenciaDoEstado(estado) {
  if (!ehEstado(estado)) {
    throw new Error(
      `Estado de Post desconhecido: ${JSON.stringify(estado)}. ` +
        `O vocabulário é fechado — os únicos valores são: ${ESTADOS.join(", ")}.`,
    );
  }
  return CATALOGO[estado];
}

/**
 * A palavra por extenso do Estado. Mesma regra de falha alto.
 */
export function rotuloDoEstado(estado) {
  return aparenciaDoEstado(estado).rotulo;
}

/**
 * Este Post JÁ ESTEVE NO AR?
 *
 * É a pergunta que decide se existe link a preservar — e ela tem DOIS
 * consumidores, o que é a razão de morar aqui e não em `api/`:
 *
 *   * o caminho de escrita, que aposenta o endereço anterior ao trocar o Slug;
 *   * o Painel, que avisa o Autor de que links compartilhados vão parar de
 *     funcionar (Story 4.5).
 *
 * ─── E POR QUE UMA CÓPIA NO PAINEL SERIA UM DEFEITO COM DATA MARCADA ──────
 *
 * Esta regra JÁ MUDOU uma vez. Ela era `publicado_em !== null`, e deixou de
 * servir na Story 2.6, quando a gaveta passou a preencher a data: um rascunho
 * com data futura passava a ser tratado como Post no ar, aposentando endereços
 * que ninguém nunca viu. Uma cópia feita antes disso teria ficado com a versão
 * velha, e as duas telas discordariam sobre o mesmo Post.
 *
 * A resposta é a MESMA regra da política de leitura anônima: estado publicável
 * e data de publicação já atingida. Rascunho é `false` sempre — rascunho é
 * invisível por construção. Arquivado com data no passado é `true`: ele esteve
 * no ar, e o link continua na mão de quem o guardou.
 */
export function jaEsteveNoAr(post) {
  if (post?.estado === "rascunho") return false;
  const quando = post?.publicado_em ? Date.parse(post.publicado_em) : Number.NaN;
  return Number.isFinite(quando) && quando <= Date.now();
}
