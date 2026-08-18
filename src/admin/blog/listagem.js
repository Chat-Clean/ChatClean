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
 * Não ordena, e não consulta: a busca e o filtro acontecem no BANCO (Story
 * 2.11). O que mora aqui é o vocabulário de quem pediu a busca e a frase de
 * quando ela não acha nada — regra pura, não consulta.
 */

import {
  formatarData,
  formatarDataEHora,
  formatarNumero,
} from "@/domain/blog/formato";
import { ehEstado, ESTADOS, rotuloDoEstado } from "@/domain/blog/estados";

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

/* ─── O TERCEIRO vazio: o que a pessoa causou ────────────────────────────── */

/**
 * "Nenhum post ainda" convida a escrever; "não consegui carregar" pede outra
 * ação; este pede para trocar o termo. São três situações e três saídas, e usar
 * a mesma tela para duas delas manda a pessoa para o lugar errado — quem
 * procurou "estratégia" e viu o convite de escrever o primeiro post conclui que
 * o arquivo inteiro sumiu.
 *
 * É também o único dos três com desfazer, porque é o único que alguém causou.
 */
export const TITULO_DO_VAZIO_DE_BUSCA = "Nenhum post corresponde a essa busca";
export const ROTULO_DE_LIMPAR_BUSCA = "Limpar a busca e os filtros";

/**
 * Os Estados marcados, por extenso e na ordem do ciclo de vida — nunca na
 * ordem em que a pessoa foi clicando, que é aleatória e mudaria a frase a cada
 * leitura.
 *
 * As palavras vêm do vocabulário fechado. Escrevê-las à mão aqui criaria o
 * sinônimo que o domínio existe para impedir.
 */
export function palavrasDosEstados(estados) {
  const marcados = Array.isArray(estados) ? estados : [];
  const validos = ESTADOS.filter((e) => marcados.includes(e));
  const palavras = validos.map((e) => rotuloDoEstado(e));
  if (palavras.length === 0) return "";
  if (palavras.length === 1) return palavras[0];
  return `${palavras.slice(0, -1).join(", ")} ou ${palavras[palavras.length - 1]}`;
}

/**
 * A frase do vazio de busca: **diz o que não foi encontrado**, com o termo e os
 * Estados que a pessoa de fato pediu. Um "nada encontrado" genérico deixa quem
 * lê sem saber se o problema foi o termo, o filtro esquecido numa aba anterior,
 * ou o post que realmente não existe.
 *
 * O termo aparece entre aspas para que espaço no fim e caractere estranho
 * fiquem visíveis — é assim que a pessoa descobre que colou algo a mais.
 */
export function descricaoDoVazioDeBusca({ termo = "", estados = [] } = {}) {
  const alvo = typeof termo === "string" ? termo.trim() : "";
  const palavras = palavrasDosEstados(estados);
  const onde = "no título, na categoria, no autor ou nas tags";

  if (alvo !== "" && palavras !== "") {
    return `Nenhum post em ${palavras} tem “${alvo}” ${onde}.`;
  }
  if (alvo !== "") {
    return `Nenhum post tem “${alvo}” ${onde}.`;
  }
  if (palavras !== "") {
    return `Nenhum post está em ${palavras}.`;
  }
  return "Nenhum post atende ao que foi pedido.";
}

/* ─── O que a pessoa pediu ───────────────────────────────────────────────── */

/**
 * Há busca em curso? É o que separa o vazio de busca do vazio inicial — e a
 * pergunta precisa ser feita sobre o que foi PEDIDO, não sobre o que voltou:
 * uma lista de tamanho zero é a mesma lista nos dois casos.
 */
export function haBuscaAtiva({ termo = "", estados = [] } = {}) {
  const alvo = typeof termo === "string" ? termo.trim() : "";
  const marcados = Array.isArray(estados) ? estados : [];
  return alvo !== "" || marcados.some((e) => ehEstado(e));
}

/**
 * Marca ou desmarca um Estado no filtro, devolvendo lista nova na ordem do
 * ciclo de vida.
 *
 * A ordem canônica não é capricho: ela é o que faz a frase do vazio de busca e
 * o pedido à camada de dados serem os mesmos para o mesmo conjunto de caixas
 * marcadas, independentemente da sequência de cliques.
 *
 * Estado fora do vocabulário não entra — o filtro nunca inventa texto solto.
 */
export function alternarEstado(estados, estado) {
  const marcados = Array.isArray(estados) ? estados.filter(ehEstado) : [];
  if (!ehEstado(estado)) return ESTADOS.filter((e) => marcados.includes(e));
  const desejados = marcados.includes(estado)
    ? marcados.filter((e) => e !== estado)
    : [...marcados, estado];
  return ESTADOS.filter((e) => desejados.includes(e));
}

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
