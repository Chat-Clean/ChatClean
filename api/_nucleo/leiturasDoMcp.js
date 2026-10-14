/**
 * As leituras do MCP.
 *
 * O Painel lê com a sessão de quem entrou, e a RLS decide. O MCP não tem essa
 * sessão: quem chega é um token do MCP, conferido em `mcp.js` ANTES de qualquer
 * leitura. Depois dessa conferência a leitura usa a chave de serviço, a mesma
 * que as funções de escrita já usam no servidor.
 *
 * Por isso este módulo não aceita caminho de fora: cada leitura é uma função
 * com a tabela, as colunas e o filtro escritos aqui. Nada de consulta genérica.
 */

const PRAZO_MS = 8000;

const COLUNAS_DO_POST_NA_LISTA = [
  "id",
  "slug",
  "titulo",
  "estado",
  "publicado_em",
  "atualizado_em",
  "destaque",
  "categoria_id",
].join(",");

const COLUNAS_DO_POST = [
  "id",
  "slug",
  "titulo",
  "resumo",
  "conteudo",
  "categoria_id",
  "autor_nome",
  "imagem_url",
  "imagem_alt",
  "seo_titulo",
  "seo_descricao",
  "seo_imagem_url",
  "tempo_leitura",
  "destaque",
  "estado",
  "publicado_em",
  "criado_em",
  "atualizado_em",
].join(",");

/* As colunas da Vaga, as mesmas de `src/data/carreiras/leitura.js`. Copiadas
   e não importadas: aquele módulo é do navegador e traz o cliente do Supabase
   junto. A verificação do MCP confere que as duas listas continuam iguais. */
export const COLUNAS_DA_VAGA = Object.freeze([
  "id",
  "titulo",
  "slug",
  "estado",
  "departamento_id",
  "tipo_id",
  "nivel_id",
  "modalidade",
  "localizacao",
  "resumo",
  "descricao",
  "link_de_candidatura",
  "aberta_em",
  "criado_em",
  "atualizado_em",
]);
const COLUNAS_DA_LISTAGEM_DE_VAGAS = COLUNAS_DA_VAGA.filter((c) => c !== "descricao");

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ehIdentificador(valor) {
  return typeof valor === "string" && uuid.test(valor);
}

/**
 * `{ url, chaveDeServico }` vêm de `lerAmbiente` (`acesso.js`). Cada método
 * devolve `{ ok: true, dados }` ou `{ ok: false, mensagem }`.
 */
export function criarLeitor({ url, chaveDeServico, buscar = globalThis.fetch }) {
  async function pedir(caminho, { metodo = "GET", corpo } = {}) {
    let resposta;
    try {
      resposta = await buscar(`${url}${caminho}`, {
        method: metodo,
        signal: AbortSignal.timeout(PRAZO_MS),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          apikey: chaveDeServico,
          Authorization: `Bearer ${chaveDeServico}`,
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
    } catch (excecao) {
      return { ok: false, mensagem: `Sem resposta do banco (${String(excecao?.name ?? "erro")}).` };
    }
    const texto = await resposta.text().catch(() => "");
    let dados = null;
    try {
      dados = texto === "" ? null : JSON.parse(texto);
    } catch {
      dados = null;
    }
    if (!resposta.ok) {
      // A mensagem do PostgREST é técnica, mas não carrega segredo: ajuda o
      // Claude a entender o que pedir de outro jeito.
      const motivo = dados && typeof dados === "object" ? dados.message ?? "" : "";
      return { ok: false, mensagem: `O banco recusou a leitura (${resposta.status}). ${motivo}`.trim() };
    }
    return { ok: true, dados };
  }

  const um = (r) => (r.ok ? { ok: true, dados: Array.isArray(r.dados) ? (r.dados[0] ?? null) : r.dados } : r);
  const id = encodeURIComponent;

  return {
    /** Busca do Painel (título, Autor, Categoria, Tag), com o filtro de Estado aparente. */
    listarPosts({ termo = null, estado = null, limite = 30 } = {}) {
      const consulta = `select=${COLUNAS_DO_POST_NA_LISTA},categoria:categorias(nome)` +
        `&order=publicado_em.desc.nullslast,atualizado_em.desc&limit=${limite}`;
      return pedir(`/rest/v1/rpc/buscar_posts_do_painel?${consulta}`, {
        metodo: "POST",
        corpo: { p_termo: termo, p_estados: estado ? [estado] : null },
      });
    },
    async lerPost(postId) {
      return um(
        await pedir(
          `/rest/v1/posts?id=eq.${id(postId)}&select=${COLUNAS_DO_POST},` +
            "categoria:categorias(id,nome),posts_tags(tag:tags(nome))&limit=1",
        ),
      );
    },
    listarCategorias() {
      return pedir("/rest/v1/categorias?select=id,nome,slug,icone,cor,ordem&order=ordem,nome");
    },
    listarNoticias() {
      return pedir(
        "/rest/v1/noticias?select=id,titulo,descricao,youtube_id,publicada,publicada_em,atualizado_em" +
          "&order=criado_em.desc&limit=100",
      );
    },
    async lerNoticia(noticiaId) {
      return um(
        await pedir(`/rest/v1/noticias?id=eq.${id(noticiaId)}&select=id,titulo,descricao,youtube_id,publicada&limit=1`),
      );
    },
    listarVagas() {
      return pedir(
        `/rest/v1/vagas?select=${COLUNAS_DA_LISTAGEM_DE_VAGAS.join(",")}&order=atualizado_em.desc&limit=100`,
      );
    },
    async lerVaga(vagaId) {
      return um(await pedir(`/rest/v1/vagas?id=eq.${id(vagaId)}&select=${COLUNAS_DA_VAGA.join(",")}&limit=1`));
    },
    async listarClassificacoes() {
      const [departamentos, tipos, niveis] = await Promise.all([
        pedir("/rest/v1/departamentos?select=id,nome,ordem&order=ordem"),
        pedir("/rest/v1/tipos_de_vaga?select=id,nome,equivalente_jobposting,ordem&order=ordem"),
        pedir("/rest/v1/niveis?select=id,nome,ordem&order=ordem"),
      ]);
      const falhou = [departamentos, tipos, niveis].find((r) => !r.ok);
      if (falhou) return falhou;
      return { ok: true, dados: { departamentos: departamentos.dados, tipos: tipos.dados, niveis: niveis.dados } };
    },
    leiturasPorDia(dias, postId = null) {
      return pedir("/rest/v1/rpc/leituras_por_dia", { metodo: "POST", corpo: { p_dias: dias, p_post_id: postId } });
    },
    leiturasPorPost(dias) {
      return pedir("/rest/v1/rpc/leituras_por_post_no_periodo", { metodo: "POST", corpo: { p_dias: dias } });
    },
    buscasPorDia(dias, pagina = null) {
      return pedir("/rest/v1/rpc/buscas_por_dia", { metodo: "POST", corpo: { p_dias: dias, p_pagina: pagina } });
    },
    buscasPorPagina(dias) {
      return pedir("/rest/v1/rpc/buscas_por_pagina", { metodo: "POST", corpo: { p_dias: dias } });
    },
    buscasPorTermo(dias, pagina = null) {
      return pedir("/rest/v1/rpc/buscas_por_termo", { metodo: "POST", corpo: { p_dias: dias, p_pagina: pagina } });
    },
    ultimoDiaDeBuscas() {
      return pedir("/rest/v1/rpc/buscas_ultimo_dia", { metodo: "POST", corpo: {} });
    },
  };
}
