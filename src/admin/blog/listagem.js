/**
 * As regras puras da listagem de Posts do Painel.
 *
 * Vive em módulo próprio, e não dentro de `ListaDePosts.jsx`, pela mesma razão
 * que `gaveta.js`, `pendencia.js` e `metadados.js` vivem fora dos seus
 * componentes: função pura em arquivo de componente quebra a recarga rápida e o
 * lint cobra. O ganho, aqui, é o de sempre — a verificação **executa** estas
 * funções, e "a linha mostra a data do agendamento" deixa de ser uma frase
 * sobre JSX e vira uma regra provada.
 *
 * ─── NADA AQUI LANÇA ────────────────────────────────────────────────────────
 *
 * `domain/blog/formato.js` falha alto de propósito: data inválida vira exceção
 * em vez de virar "Invalid Date" na tela. Isso é certo no caminho de escrita, e
 * errado no meio de uma listagem — uma linha com `atualizado_em` corrompido
 * derrubaria a árvore React inteira e o Autor perderia a lista por causa de UM
 * Post. Aqui a exceção vira ausência: a linha aparece sem a data, e o resto da
 * listagem continua de pé.
 *
 * ─── O QUE ESTE MÓDULO NÃO FAZ ──────────────────────────────────────────────
 *
 * Não ordena: a ordem é `COALESCE(publicado_em, atualizado_em)` decrescente com
 * desempate determinístico, e ela já existe em `data/blog/posts.js`
 * (`ordenarListagem`). Escrever uma segunda comparação aqui criaria duas ordens
 * que divergem no primeiro empate — o instante em que ninguém está olhando.
 *
 * Não busca e não filtra: isso é da Story 2.11.
 */

import {
  formatarData,
  formatarDataEHora,
  formatarNumero,
} from "@/domain/blog/formato";

/* ─── A voz das duas telas sem linha ─────────────────────────────────────── */

/**
 * O vazio INICIAL. Não é erro, e a diferença é a coisa mais importante desta
 * story do ponto de vista de quem usa: "ainda não há post" convida a escrever o
 * primeiro; "não consegui carregar" pede outra ação e não pode sugerir que o
 * trabalho sumiu. Trocar uma tela pela outra é como um Autor conclui que perdeu
 * o que escreveu.
 */
export const TITULO_DO_VAZIO = "Nenhum post ainda";
export const DESCRICAO_DO_VAZIO =
  "Quando você escrever o primeiro post, ele aparece aqui — com o estado, a " +
  "categoria e a data de publicação.";
export const ROTULO_DO_PRIMEIRO_POST = "Escrever o primeiro post";

/** A falha de leitura. O "o que fazer" vem do erro tipado da camada de dados. */
export const TITULO_DO_ERRO = "Não deu para carregar os posts";
export const ROTULO_DE_RECARREGAR = "Tentar carregar os posts de novo";

/* ─── Categoria ──────────────────────────────────────────────────────────── */

/** O nome da Categoria embutida na linha, ou `""` quando o Post não tem uma. */
export function nomeDaCategoria(post) {
  const nome = post?.categoria?.nome;
  return typeof nome === "string" ? nome.trim() : "";
}

/**
 * O monograma que substitui a capa: a primeira letra da Categoria, em caixa
 * alta, sobre o fundo tênue da marca.
 *
 * Devolve `""` para Post sem Categoria — e isso não é caso de borda esquecido:
 * Categoria é opcional na gaveta, então a linha precisa renderizar sem ela. Quem
 * chama põe um símbolo neutro no lugar.
 *
 * A caixa alta é local-consciente (`pt-BR`) porque `toUpperCase()` sem local
 * erra em turco — custo zero, e a alternativa é um defeito que só aparece com o
 * navegador de outra pessoa.
 */
export function monogramaDaCategoria(post) {
  const nome = nomeDaCategoria(post);
  if (nome === "") return "";
  // Por ponto de código, e não por índice: "Ão" quebrado ao meio por um par
  // substituto viraria um caractere de reposição na tela.
  const primeira = [...nome][0] ?? "";
  return primeira.toLocaleUpperCase("pt-BR");
}

/* ─── Data ───────────────────────────────────────────────────────────────── */

/**
 * O instante que a linha mostra: `COALESCE(publicado_em, atualizado_em)`.
 *
 * É o MESMO par que ordena a lista, e é de propósito: a coluna de datas precisa
 * explicar a sequência em que as linhas aparecem. Mostrar `criado_em` ao lado de
 * uma ordem por outra coluna faz a listagem parecer desordenada.
 */
export function instanteDaLinha(post) {
  const bruto = post?.publicado_em ?? post?.atualizado_em ?? null;
  return typeof bruto === "string" && bruto.trim() !== "" ? bruto : null;
}

/** `14/08/2026` — o dia, no fuso de apresentação. `""` quando não há instante. */
export function textoDaData(post) {
  const instante = instanteDaLinha(post);
  if (instante === null) return "";
  try {
    return formatarData(instante);
  } catch {
    return "";
  }
}

/**
 * `14/08/2026 10:27` — o "para quando" de um Post agendado.
 *
 * Devolve `null` para qualquer Post que não esteja agendado com data. "Agendado"
 * responde metade da pergunta: quem abre a listagem para decidir onde continuar
 * precisa saber se o Post sai hoje à tarde ou na semana que vem, e essa
 * informação está a um campo de distância.
 */
export function textoDoAgendamento(post) {
  if (post?.estado !== "agendado") return null;
  const instante = post?.publicado_em;
  if (typeof instante !== "string" || instante.trim() === "") return null;
  try {
    return formatarDataEHora(instante);
  } catch {
    return null;
  }
}

/** `5 min` — o tempo de leitura, quando o Post declara um. */
export function textoDoTempoDeLeitura(post) {
  const minutos = Number(post?.tempo_leitura);
  if (!Number.isFinite(minutos) || minutos <= 0) return null;
  try {
    return `${formatarNumero(Math.floor(minutos))} min`;
  } catch {
    return null;
  }
}

/* ─── Rótulos que dependem do Post ───────────────────────────────────────── */

/**
 * O nome do controle que abre o Post no Editor. Diz o que fará e **nomeia o
 * Post**: numa lista de vinte linhas, vinte controles chamados "Editar" são
 * vinte controles indistinguíveis para quem navega por leitor de tela.
 */
export function rotuloParaAbrir(post) {
  const titulo = String(post?.titulo ?? "").trim();
  return titulo === "" ? "Abrir o post sem título" : `Abrir o post ${titulo}`;
}
