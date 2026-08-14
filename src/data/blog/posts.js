/**
 * Leitura de Posts — a camada de dados do blog.
 *
 * **A separação de papéis é do MÓDULO, não do chamador.** As funções públicas
 * usam exclusivamente `clientePublico()`; as do Painel, exclusivamente
 * `clienteAutenticado()`. Não há parâmetro para escolher, e é isso que torna a
 * garantia estrutural: o cliente público não guarda sessão, então não tem como
 * enviá-la — um Autor logado abrindo `/blog` na mesma origem lê exatamente o
 * que um visitante anônimo lê.
 *
 * **Nenhuma consulta aqui repete o filtro de visibilidade.** A política de RLS
 * criada na Story 2.1 é a única guardiã do que é público. Uma consulta que
 * precisasse repetir o filtro para estar correta denunciaria erro na política,
 * não falta de zelo neste arquivo.
 *
 * **Só leitura.** Toda escrita passa pela função de servidor da Story 2.5.
 *
 * Direção de dependência (AD): este módulo conhece `domain/blog` e a
 * infraestrutura de cliente, e nada mais. Não importa React, não importa
 * componente, não sabe que existe tela.
 */

import { ehEstado } from "../../domain/blog/estados.js";
import {
  clienteDoPainelOuFalha,
  clientePublicoOuFalha,
  deslocamentoValido,
  ehSlug,
  ehUuid,
  limiteValido,
} from "./comum.js";
import {
  consultar,
  descrever,
  ehFaixaAlemDoFim,
  exigirLista,
  exigirRegistro,
  naoEncontrado,
  sinalDePrazo,
  sucesso,
} from "./resultado.js";

export { LIMITE_MAXIMO, LIMITE_PADRAO } from "./comum.js";

/* ─── O que se lê de um Post ─────────────────────────────────────────────── */

/**
 * As colunas de um Post inteiro, nomeadas uma a uma e na grafia que a Story
 * 2.1 fixou no banco. `select=*` traria colunas futuras sem ninguém decidir
 * por elas, e calaria sobre uma coluna renomeada — que é justamente o que a
 * validação de formato abaixo existe para acusar.
 */
export const COLUNAS_DO_POST = Object.freeze([
  "id",
  "slug",
  "titulo",
  "resumo",
  "conteudo",
  "conteudo_html",
  "categoria_id",
  "autor_id",
  "autor_nome",
  "imagem_url",
  "imagem_alt",
  "seo_titulo",
  "seo_descricao",
  "seo_imagem_url",
  "tempo_leitura",
  "destaque",
  "demo",
  "estado",
  "publicado_em",
  "criado_em",
  "atualizado_em",
]);

/**
 * O que a LISTAGEM lê — deliberadamente sem `conteudo` nem `conteudo_html`.
 *
 * Nenhuma linha de listagem mostra o corpo do Post, e trazê-lo custa duzentos
 * documentos completos numa resposta só: a listagem que o épico promete em até
 * 2 s com 200 posts não sobreviveria a isso. Quem precisa do corpo abre o Post,
 * e aí lê o conjunto inteiro.
 */
export const COLUNAS_DA_LISTAGEM = Object.freeze(
  COLUNAS_DO_POST.filter((c) => c !== "conteudo" && c !== "conteudo_html"),
);

/**
 * A Categoria vem embutida porque um Post sem o nome da Categoria não serve
 * nem à listagem do Painel nem ao cartão do Blog Público, e uma segunda ida ao
 * servidor por linha é o problema que o recurso embutido do PostgREST resolve.
 * A leitura roda sob a RLS de `categorias`, como qualquer outra.
 */
const CATEGORIA_EMBUTIDA = "categoria:categorias(id,nome,slug,icone,cor,ordem)";
const SELECAO_COMPLETA = `${COLUNAS_DO_POST.join(",")},${CATEGORIA_EMBUTIDA}`;
const SELECAO_DA_LISTAGEM = `${COLUNAS_DA_LISTAGEM.join(",")},${CATEGORIA_EMBUTIDA}`;

/**
 * O formato mínimo de um Post. Devolve `null` quando está bem, ou a frase que
 * explica o defeito.
 *
 * O Estado é conferido contra o vocabulário fechado de `domain/blog` — é o
 * ponto exato em que banco e código poderiam divergir em silêncio, e um quinto
 * valor chegando do banco vira erro tipado de defeito em vez de virar pílula
 * em branco na tela.
 */
function problemaNoPost(linha) {
  if (linha === null || typeof linha !== "object" || Array.isArray(linha)) {
    return `esperava um objeto e veio ${descrever(linha)}`;
  }
  if (typeof linha.id !== "string" || linha.id === "") return "`id` ausente";
  if (typeof linha.slug !== "string" || linha.slug === "") return "`slug` ausente";
  if (typeof linha.titulo !== "string") return "`titulo` ausente";
  if (!ehEstado(linha.estado)) {
    return `\`estado\` fora do vocabulário fechado: ${JSON.stringify(linha.estado)}`;
  }
  return null;
}

/* ─── Ordenação ──────────────────────────────────────────────────────────── */

/**
 * A chave de ordenação da listagem: `COALESCE(publicado_em, atualizado_em)`.
 *
 * É a convenção que impede rascunho de afundar (ordenar só por `publicado_em`
 * joga todo nulo para uma das pontas) ou de dominar a lista.
 */
export function chaveDeOrdenacao(post) {
  const bruto = post?.publicado_em ?? post?.atualizado_em ?? null;
  const instante = bruto === null ? Number.NaN : Date.parse(bruto);
  return Number.isNaN(instante) ? Number.NEGATIVE_INFINITY : instante;
}

/**
 * Ordena por `COALESCE(publicado_em, atualizado_em) DESC`, com desempate
 * determinístico por `id` para que a mesma base devolva sempre a mesma
 * sequência.
 *
 * A subtração das chaves precisa passar por `Number.isFinite`: duas linhas sem
 * data alguma dão `-Infinity` dos dois lados, e `-Infinity - (-Infinity)` é
 * `NaN`. Um comparador que devolve `NaN` faz a ordenação depender da ordem de
 * ENTRADA — a mesma lista embaralhada sai em sequências diferentes, que é
 * exatamente o que o desempate existe para impedir.
 *
 * **Por que a expressão é aplicada aqui e não só no `order` do PostgREST:** o
 * PostgREST ordena por COLUNA, não por expressão — `coalesce(...)` não é
 * exprimível na consulta. O índice que a Story 2.1 criou é sobre exatamente
 * essa expressão e continua servindo ao Postgres; o que a camada faz é
 * garantir a ordem final que o critério de aceite nomeia.
 *
 * Consequência conhecida, registrada em vez de escondida: com mais linhas que
 * `limite`, o RECORTE vem da ordem que o servidor conseguiu aplicar
 * (`publicado_em desc nullslast, atualizado_em desc`) e só a ordem DENTRO do
 * recorte é exata. Na leitura pública os dois coincidem sempre, porque a
 * política só devolve linha com `publicado_em` preenchido; no Painel a
 * diferença só apareceria além de `LIMITE_MAXIMO` posts. A correção exata é
 * uma coluna gerada ou uma view com `security_invoker`, e é mudança de schema
 * — fora do escopo desta story.
 */
export function ordenarListagem(posts) {
  return [...posts].sort((a, b) => {
    const diferenca = chaveDeOrdenacao(b) - chaveDeOrdenacao(a);
    if (Number.isFinite(diferenca) && diferenca !== 0) return diferenca;
    return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
  });
}

/** A ordem que o servidor consegue aplicar, o mais perto possível da acima. */
function ordenarNoServidor(consulta) {
  return consulta
    .order("publicado_em", { ascending: false, nullsFirst: false })
    .order("atualizado_em", { ascending: false });
}

/**
 * A listagem, comum aos dois lados menos pelo cliente que a executa. É onde a
 * página vazia além do fim deixa de ser 416 e vira lista vazia.
 */
async function listar(operacao, cliente, { limite, deslocamento }) {
  const tamanho = limiteValido(limite);
  const inicio = deslocamentoValido(deslocamento);

  const resposta = await consultar(operacao, () =>
    ordenarNoServidor(cliente.from("posts").select(SELECAO_DA_LISTAGEM))
      .range(inicio, inicio + tamanho - 1)
      .abortSignal(sinalDePrazo()),
  );
  if (!resposta.ok) {
    return ehFaixaAlemDoFim(resposta) ? sucesso([]) : resposta;
  }

  const lista = exigirLista(resposta.dados, {
    operacao,
    validarItem: problemaNoPost,
  });
  if (!lista.ok) return lista;

  return sucesso(ordenarListagem(lista.dados));
}

/* ─── Leituras públicas ──────────────────────────────────────────────────── */

/**
 * A listagem do Blog Público.
 *
 * Devolve só o que a política de leitura anônima libera: publicado e agendado
 * cuja hora já passou. Não há filtro de estado nesta consulta — de propósito.
 */
export async function listarPostsPublicos({ limite, deslocamento } = {}) {
  const operacao = "listarPostsPublicos";
  const cliente = clientePublicoOuFalha(operacao);
  if (!cliente.ok) return cliente;
  return listar(operacao, cliente.dados, { limite, deslocamento });
}

/**
 * Um Post pelo slug, do lado público.
 *
 * Rascunho responde erro de NÃO ENCONTRADO, com a mesma mensagem de um slug
 * que nunca existiu: distinguir os dois entregaria a existência do rascunho a
 * quem não pode vê-lo. Quem esconde a linha é a política; o que esta função
 * garante é que a AUSÊNCIA não vaze pela forma do erro.
 *
 * Slug fora do formato do banco não chega a virar consulta: ele não poderia
 * existir, e mandá-lo ao PostgREST só trocaria "não encontrado" por um 400
 * traduzido como defeito.
 */
export async function lerPostPublicoPorSlug(slug) {
  const operacao = "lerPostPublicoPorSlug";
  const alvo = typeof slug === "string" ? slug.trim() : "";
  if (!ehSlug(alvo)) {
    return naoEncontrado({
      operacao,
      detalhe: "slug ausente ou fora do formato que o banco aceita",
    });
  }
  const cliente = clientePublicoOuFalha(operacao);
  if (!cliente.ok) return cliente;

  const resposta = await consultar(operacao, () =>
    cliente.dados
      .from("posts")
      .select(SELECAO_COMPLETA)
      .eq("slug", alvo)
      .limit(1)
      .abortSignal(sinalDePrazo()),
  );
  if (!resposta.ok) return resposta;

  const lista = exigirLista(resposta.dados, {
    operacao,
    validarItem: problemaNoPost,
  });
  if (!lista.ok) return lista;

  if (lista.dados.length === 0) {
    return naoEncontrado({ operacao, detalhe: "nenhum post visível com este slug" });
  }
  return sucesso(lista.dados[0]);
}

/* ─── Leituras do Painel ─────────────────────────────────────────────────── */

/**
 * A listagem do Painel: todos os Posts, inclusive rascunho e arquivado.
 *
 * O que devolve tudo é a política de leitura autenticada, não um filtro daqui.
 */
export async function listarPostsDoPainel({ limite, deslocamento } = {}) {
  const operacao = "listarPostsDoPainel";
  const cliente = await clienteDoPainelOuFalha(operacao);
  if (!cliente.ok) return cliente;
  return listar(operacao, cliente.dados, { limite, deslocamento });
}

/**
 * Um Post pelo identificador, do lado do Painel — é assim que o Editor e a
 * pré-visualização abrem um Post que ainda não é público.
 */
export async function lerPostDoPainelPorId(id) {
  const operacao = "lerPostDoPainelPorId";
  if (!ehUuid(id)) {
    return naoEncontrado({
      operacao,
      detalhe: "identificador ausente ou fora do formato uuid",
    });
  }
  const cliente = await clienteDoPainelOuFalha(operacao);
  if (!cliente.ok) return cliente;

  const resposta = await consultar(operacao, () =>
    cliente.dados
      .from("posts")
      .select(SELECAO_COMPLETA)
      .eq("id", id.trim())
      .limit(1)
      .abortSignal(sinalDePrazo()),
  );
  if (!resposta.ok) return resposta;

  const lista = exigirLista(resposta.dados, {
    operacao,
    validarItem: problemaNoPost,
  });
  if (!lista.ok) return lista;

  if (lista.dados.length === 0) {
    return naoEncontrado({ operacao, detalhe: "nenhum post com este identificador" });
  }
  return exigirRegistro(lista.dados[0], { operacao, validar: problemaNoPost });
}
