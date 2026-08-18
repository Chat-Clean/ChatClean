/**
 * A gaveta de metadados vista de fora: quanto ela mede, como ela nasce e o que
 * o controle de recolher diz.
 *
 * Vive em módulo próprio, e não dentro de `GavetaDeMetadados.jsx`, pela mesma
 * razão que `metadados.js` e `conteudo.js` vivem fora dos seus componentes:
 * função pura em arquivo de componente quebra a recarga rápida e o lint cobra.
 * O ganho aqui, porém, é maior que o estilístico — a verificação **executa**
 * estas funções em Node, sem montar React nenhum, e é assim que "nasce
 * recolhida em tela estreita" deixa de ser uma frase e vira uma regra provada.
 *
 * ─── AS DUAS MEDIDAS SÃO VALOR, NÃO CLASSE ─────────────────────────────────
 *
 * 340px aberta, 46px recolhida. Elas saem daqui como largura de verdade,
 * aplicada no elemento, e não como classe utilitária: o jsdom não faz layout,
 * então uma classe seria só um nome de classe conferido contra outro nome de
 * classe — a asserção diria que a string bate com a string, e continuaria verde
 * com a gaveta medindo qualquer coisa. Com o valor no elemento, a verificação
 * lê a largura que o navegador leria.
 *
 * ─── O TRILHO EXISTE PARA O CONTROLE CONTINUAR VISÍVEL ─────────────────────
 *
 * 46px não é uma gaveta pequena: é o espaço mínimo para o alvo de toque de 40px
 * do controle de reabrir, mais a borda do cartão. Uma gaveta que some sem
 * deixar como voltar é pior que uma gaveta larga demais.
 *
 * ─── E O ESTADO NÃO É LEMBRADO ─────────────────────────────────────────────
 *
 * Não há leitura nem escrita de armazenamento do navegador aqui, e não pode
 * haver: a Story 1.4 proíbe `localStorage` e `sessionStorage` em `src/admin/`,
 * e a ferramenta de acesso cobra o arquivo inteiro. A previsibilidade também é
 * requisito por si — a tela abrir diferente conforme o que alguém fez semanas
 * atrás é como se perde a referência de onde as coisas estão.
 */

/** Largura da gaveta aberta. É a medida que a direção de UX fixa. */
export const LARGURA_ABERTA = "340px";

/**
 * Largura do trilho recolhido: 40px de alvo de toque mais as duas bordas do
 * cartão e a folga que impede o anel de foco de ser cortado.
 */
export const LARGURA_RECOLHIDA = "46px";

/**
 * A partir de quantos pixels de tela a gaveta pode nascer aberta.
 *
 * 1024 é o mesmo ponto de virada que o resto do Painel usa (`lg` do Tailwind).
 * Ele está aqui, em número, porque quem decide o estado inicial é esta função —
 * e não uma segunda regra responsiva no CSS, que divergiria desta na primeira
 * mudança e faria a gaveta nascer aberta com o texto espremido.
 */
export const LARGURA_MINIMA_DE_TELA = 1024;

/**
 * A gaveta nasce aberta?
 *
 * Sim, por padrão: é o que garante que ninguém deixe de preencher categoria ou
 * capa por não estar vendo os campos. Não, quando a tela é estreita — ali os
 * 340px não sobram, e abrir por cima do texto serviria pior ao mesmo Autor.
 *
 * Largura desconhecida (`null`, `undefined`, ou um valor que não é número)
 * responde **aberta**: na dúvida, mostrar os campos. Esconder por não saber
 * medir a tela seria transformar uma incerteza em campo escondido.
 */
export function nasceAberta(larguraDaTela) {
  const largura = Number(larguraDaTela);
  if (!Number.isFinite(largura) || largura <= 0) return true;
  return largura >= LARGURA_MINIMA_DE_TELA;
}

/** A largura da gaveta no estado dado. */
export function larguraDaGaveta(aberta) {
  return aberta ? LARGURA_ABERTA : LARGURA_RECOLHIDA;
}

/**
 * O nome do controle, que diz **o que ele fará** — não em que estado ele está.
 *
 * "Gaveta de metadados" nomeia a coisa e deixa a pessoa adivinhar o efeito;
 * "Recolher a gaveta de metadados" diz o que acontece ao acionar. As duas
 * frases passam pelas guardas de voz de `admin/shell/voz.js`, e a verificação
 * as submete a elas em vez de conferir o texto por regex.
 */
export const ROTULO_PARA_RECOLHER = "Recolher a gaveta de metadados";
export const ROTULO_PARA_ABRIR = "Abrir a gaveta de metadados";

export function rotuloDoControle(aberta) {
  return aberta ? ROTULO_PARA_RECOLHER : ROTULO_PARA_ABRIR;
}
