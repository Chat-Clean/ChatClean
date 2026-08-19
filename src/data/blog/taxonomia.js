/**
 * Leitura de Categorias e de Tags.
 *
 * Ambas pelo cliente PÚBLICO, e por um motivo de produto: o filtro do Blog
 * Público precisa da lista inteira antes de qualquer Post ser lido — abrir a
 * página com o filtro vazio enquanto os posts carregam é o defeito que isso
 * evita. O Painel usa as mesmas listas: Categoria e Tag são vocabulário
 * público, não dado restrito.
 *
 * A visibilidade continua sendo decidida no banco: `categorias` é legível por
 * todos, e `tags` só devolve tag associada a algum Post visível — derivação
 * escrita uma vez, na política, nunca repetida aqui.
 *
 * ─── A EXCEÇÃO, E POR QUE ELA EXISTE (Story 2.14) ───────────────────────────
 *
 * `listarCategoriasDoPainel` usa o cliente do PAINEL, e não o público, porque
 * ela traz a CONTAGEM de Posts de cada Categoria. A contagem roda sob a RLS de
 * `posts`: pelo cliente anônimo ela contaria só o que está no ar, e a tela
 * diria "nenhum post usa esta categoria" sobre uma Categoria com três
 * rascunhos — bem na hora em que alguém decide se pode excluí-la.
 *
 * **Nenhuma função daqui escreve.** Criar, renomear e excluir Categoria passam
 * por `data/blog/escrita.js`, que fala com a função de servidor: a RLS nega
 * escrita em `categorias`, `tags` e `posts_tags` a `anon` e a `authenticated`,
 * e isso continua intacto.
 */

import {
  clienteDoPainelOuFalha,
  clientePublicoOuFalha,
  deslocamentoValido,
  ehUuid,
  limiteValido,
} from "./comum.js";
import {
  consultar,
  descrever,
  ehFaixaAlemDoFim,
  exigirLista,
  naoEncontrado,
  sinalDePrazo,
  sucesso,
} from "./resultado.js";

export const COLUNAS_DA_CATEGORIA = Object.freeze([
  "id",
  "nome",
  "slug",
  "icone",
  "cor",
  "ordem",
]);

export const COLUNAS_DA_TAG = Object.freeze(["id", "nome", "slug"]);

/** Formato mínimo comum às duas: identificador, nome e slug. */
function problemaNoVerbete(linha) {
  if (linha === null || typeof linha !== "object" || Array.isArray(linha)) {
    return `esperava um objeto e veio ${descrever(linha)}`;
  }
  if (typeof linha.id !== "string" || linha.id === "") return "`id` ausente";
  if (typeof linha.nome !== "string" || linha.nome === "") return "`nome` ausente";
  if (typeof linha.slug !== "string" || linha.slug === "") return "`slug` ausente";
  return null;
}

/**
 * Categoria e Tag são listas curtas por natureza, mas "curta por natureza" é
 * uma expectativa, não uma garantia: o mesmo teto de `posts` vale aqui, pelo
 * mesmo motivo, e tratar risco igual de forma diferente é como uma das duas
 * acaba sem proteção.
 */
async function listarVerbetes(operacao, tabela, colunas, ordens, { limite, deslocamento }) {
  const cliente = clientePublicoOuFalha(operacao);
  if (!cliente.ok) return cliente;

  const tamanho = limiteValido(limite);
  const inicio = deslocamentoValido(deslocamento);

  const resposta = await consultar(operacao, () => {
    let consulta = cliente.dados.from(tabela).select(colunas.join(","));
    for (const coluna of ordens) {
      consulta = consulta.order(coluna, { ascending: true });
    }
    return consulta.range(inicio, inicio + tamanho - 1).abortSignal(sinalDePrazo());
  });
  if (!resposta.ok) {
    return ehFaixaAlemDoFim(resposta) ? sucesso([]) : resposta;
  }

  return exigirLista(resposta.dados, { operacao, validarItem: problemaNoVerbete });
}

/**
 * As Categorias, na ordem que o Painel definir (`ordem`) e, em empate, por
 * nome — para que a lista não mude de sequência entre dois carregamentos.
 */
export function listarCategorias({ limite, deslocamento } = {}) {
  return listarVerbetes(
    "listarCategorias",
    "categorias",
    COLUNAS_DA_CATEGORIA,
    ["ordem", "nome"],
    { limite, deslocamento },
  );
}

/** As Tags visíveis, em ordem alfabética. */
export function listarTags({ limite, deslocamento } = {}) {
  return listarVerbetes("listarTags", "tags", COLUNAS_DA_TAG, ["nome"], {
    limite,
    deslocamento,
  });
}

/**
 * A CONTAGEM de Posts embutida na consulta de Categoria (Story 2.14).
 *
 * `posts(count)` é agregação do próprio PostgREST: o banco conta e devolve o
 * número, sem trazer uma linha de Post sequer. Contar no cliente exigiria
 * carregar todos os Posts de todas as Categorias — funciona com doze e passa a
 * mentir (ou a travar) exatamente quando o número importa.
 *
 * A contagem roda sob a RLS de `posts` para o papel do cliente. Por isso esta
 * leitura é do PAINEL: com o cliente anônimo, o número contaria só os Posts
 * públicos, e a tela diria "nenhum post usa esta categoria" sobre uma Categoria
 * com três rascunhos — a frase mais perigosa possível diante de uma exclusão.
 */
const CONTAGEM_DE_POSTS = "posts(count)";

/**
 * As Categorias com quantos Posts usam cada uma — a leitura da tela de
 * Categorias do Painel.
 *
 * O número aparece na tela ANTES de a pessoa tentar excluir, e é o mesmo número
 * que a recusa do servidor diz quando ela tenta mesmo assim. Quem conta de
 * verdade, nas duas vezes, é o banco.
 *
 * Devolve `[{ id, nome, slug, icone, cor, ordem, posts }]`.
 *
 * ─── `posts` PODE SER `null`, E ISSO É O PONTO ──────────────────────────────
 *
 * A versão anterior transformava agregação ilegível em `0` — e `0` é lido pela
 * tela como "pode excluir". Ela ofereceria excluir uma Categoria possivelmente
 * em uso, que é exatamente a frase que `api/_nucleo/acesso.js` chama de "a mais
 * perigosa possível diante de uma exclusão". O `restrict` do banco salvaria o
 * dado, mas a tela teria mentido antes.
 *
 * `null` significa "não deu para contar", e a tela trata isso como indisponível
 * dizendo por quê — o mesmo desenho de `totalDaFaixa` do lado da escrita.
 */
export async function listarCategoriasDoPainel({ limite, deslocamento } = {}) {
  const operacao = "listarCategoriasDoPainel";

  const cliente = await clienteDoPainelOuFalha(operacao);
  if (!cliente.ok) return cliente;

  const tamanho = limiteValido(limite);
  const inicio = deslocamentoValido(deslocamento);

  const resposta = await consultar(operacao, () =>
    cliente.dados
      .from("categorias")
      .select(`${COLUNAS_DA_CATEGORIA.join(",")},${CONTAGEM_DE_POSTS}`)
      .order("ordem", { ascending: true })
      .order("nome", { ascending: true })
      .range(inicio, inicio + tamanho - 1)
      .abortSignal(sinalDePrazo()),
  );
  if (!resposta.ok) {
    return ehFaixaAlemDoFim(resposta) ? sucesso([]) : resposta;
  }

  const lista = exigirLista(resposta.dados, {
    operacao,
    validarItem: problemaNoVerbete,
  });
  if (!lista.ok) return lista;

  return sucesso(
    lista.dados.map((linha) => ({
      ...linha,
      posts: totalEmbutido(linha.posts),
    })),
  );
}

/**
 * O número de uma agregação embutida do PostgREST, ou `null`.
 *
 * Ela chega como `[{ count: 3 }]` — e, em alguns caminhos, como `{ count: 3 }`.
 * As duas formas entram; qualquer outra vira **`null`**, e nunca zero.
 *
 * A distinção é a mesma que `totalDaFaixa` faz no lado da escrita, e pelo mesmo
 * motivo: "nenhum post usa esta categoria" é a frase que LIBERA uma exclusão.
 * Inventá-la a partir de uma resposta que não deu para ler é o modo de falha
 * que a Story 2.14 existe para fechar.
 *
 * Exportada para ser EXECUTADA pela verificação: uma função privada só poderia
 * ser lida, e o que importa aqui é o veredito sobre cada forma de resposta.
 */
export function totalEmbutido(bruto) {
  const primeiro = Array.isArray(bruto) ? bruto[0] : bruto;
  if (primeiro === null || typeof primeiro !== "object") return null;
  const total = primeiro.count;
  return Number.isInteger(total) && total >= 0 ? total : null;
}

/**
 * O que impede uma linha de `posts_tags` de virar Tag da gaveta, ou `null`.
 *
 * ─── ELA RECUSA EM VEZ DE ENCOLHER, E ISSO É O PONTO ────────────────────────
 *
 * A versão anterior exigia só `tag_id` e transformava nome ausente em texto
 * vazio. Uma linha assim sumia do campo (`textoDasTags` filtra o vazio) — e,
 * como o salvamento manda a lista INTEIRA, o salvamento seguinte apagava a
 * associação. É o mesmo defeito que `resolverTags` bloqueia no servidor sob a
 * frase "nenhuma tag some em silêncio"; a leitura não pode ser a metade frouxa
 * do par.
 *
 * Exportada para ser EXECUTADA pela verificação: uma regra escrita dentro do
 * objeto literal da consulta só poderia ser lida.
 */
export function problemaNaTagDoPost(linha) {
  if (linha === null || typeof linha !== "object" || Array.isArray(linha)) {
    return `esperava { tag_id, tags } e veio ${descrever(linha)}`;
  }
  if (typeof linha.tag_id !== "string" || linha.tag_id === "") {
    return "`tag_id` ausente";
  }
  // A relação embutida chega como objeto quando é para-um e como lista em
  // alguns caminhos. As duas formas entram.
  const embutida = Array.isArray(linha.tags) ? linha.tags[0] : linha.tags;
  const nome = embutida?.nome;
  if (typeof nome !== "string" || nome.trim() === "") {
    return `a tag ${linha.tag_id} veio sem nome — ela sumiria do campo, e o próximo salvamento apagaria a associação`;
  }
  return null;
}

/**
 * TODAS as Tags, do lado do PAINEL — as que a gaveta sugere.
 *
 * ─── POR QUE ELA NÃO PODE SER `listarTags` ──────────────────────────────────
 *
 * `listarTags` usa o cliente público, e a política anônima de `tags` só devolve
 * Tag associada a algum Post **visível**. Uma Tag criada num rascunho — o caso
 * normal de quem está escrevendo agora — nunca seria sugerida, e é exatamente
 * nesse caso que o Autor recria "Atendimento" com outra grafia. A sugestão
 * existe para reaproveitar em vez de recriar; sugerir só o que já está no ar a
 * torna inútil justamente quando ela serviria.
 *
 * É a mesma razão que mandou a contagem de uso de Categoria para o cliente do
 * Painel: o que a tela do Painel precisa ver é o que o Painel administra.
 */
export function listarTagsDoPainel({ limite, deslocamento } = {}) {
  const operacao = "listarTagsDoPainel";
  return (async () => {
    const cliente = await clienteDoPainelOuFalha(operacao);
    if (!cliente.ok) return cliente;

    const tamanho = limiteValido(limite);
    const inicio = deslocamentoValido(deslocamento);

    const resposta = await consultar(operacao, () =>
      cliente.dados
        .from("tags")
        .select(COLUNAS_DA_TAG.join(","))
        .order("nome", { ascending: true })
        .range(inicio, inicio + tamanho - 1)
        .abortSignal(sinalDePrazo()),
    );
    if (!resposta.ok) {
      return ehFaixaAlemDoFim(resposta) ? sucesso([]) : resposta;
    }
    return exigirLista(resposta.dados, { operacao, validarItem: problemaNoVerbete });
  })();
}

/**
 * As Tags de um Post, do lado do PAINEL.
 *
 * Pelo cliente autenticado, e não pelo público como as duas de cima: a política
 * anônima de `posts_tags` deriva da visibilidade do Post, então as tags de um
 * rascunho não voltariam — e é justamente o rascunho que o Editor abre. Ler o
 * subconjunto anônimo aqui faria a gaveta abrir com nenhuma tag marcada e o
 * primeiro salvamento APAGAR as que existiam.
 *
 * Devolve a lista de `{ id, nome }` das tags associadas.
 *
 * ─── O NOME VIAJA JUNTO DESDE A STORY 2.14 ──────────────────────────────────
 *
 * A gaveta deixou de escolher identificadores e passou a ser um campo de texto:
 * o que ela mostra, e o que ela manda de volta, é NOME. Sem o nome aqui, abrir
 * um Post para editar mostraria o campo de tags vazio e o primeiro salvamento
 * APAGARIA as que existiam — exatamente o defeito que o comentário acima
 * descreve para o cliente errado, pela outra causa.
 *
 * O nome vem embutido na consulta (`tags(nome)`), e não de uma segunda ida ao
 * banco: duas leituras para uma tela é como uma delas fica para trás.
 */
export async function listarTagsDoPostNoPainel(postId) {
  const operacao = "listarTagsDoPostNoPainel";
  if (!ehUuid(postId)) {
    return naoEncontrado({
      operacao,
      detalhe: "identificador de post ausente ou fora do formato uuid",
    });
  }

  const cliente = await clienteDoPainelOuFalha(operacao);
  if (!cliente.ok) return cliente;

  const resposta = await consultar(operacao, () =>
    cliente.dados
      .from("posts_tags")
      .select("tag_id,tags(nome)")
      .eq("post_id", postId.trim())
      .abortSignal(sinalDePrazo()),
  );
  if (!resposta.ok) return resposta;

  /* O NOME É EXIGIDO, e a leitura RECUSA em vez de encolher — ver
     `problemaNaTagDoPost`, que é a regra e é executável. */
  const lista = exigirLista(resposta.dados, {
    operacao,
    validarItem: problemaNaTagDoPost,
  });
  if (!lista.ok) return lista;

  return sucesso(
    lista.dados.map((linha) => {
      // A relação embutida chega como objeto quando é para-um e como lista em
      // alguns caminhos. As duas formas entram — e o nome já foi exigido.
      const embutida = Array.isArray(linha.tags) ? linha.tags[0] : linha.tags;
      return { id: linha.tag_id, nome: embutida.nome };
    }),
  );
}
