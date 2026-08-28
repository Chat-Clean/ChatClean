/**
 * O acesso ao Supabase que a função de escrita usa — e nada além disso.
 *
 * Existe separado de `salvarPost.js` por uma razão estrutural: o núcleo da
 * escrita é a lógica (verificar quem pede, validar o que grava, derivar o HTML,
 * resolver o Autor), e lógica não deve conhecer `fetch`. Aqui mora o transporte,
 * e só ele — nenhuma decisão de produto passa por este arquivo.
 *
 * ─── A chave de serviço ─────────────────────────────────────────────────────
 *
 * A escrita vai pelo PostgREST com a **chave de serviço**, que ignora RLS e
 * privilégio. É por isso que ela existe: a RLS da Story 2.1 nega escrita a
 * `anon` e a `authenticated`, deliberadamente, e a função é o único caminho.
 *
 * A chave vive **só no servidor**: variável de ambiente sem prefixo `VITE_`
 * (que iria para o bundle do navegador), nunca em arquivo do repositório, nunca
 * impressa. `esconder()` é a segunda trava — resposta de erro de API às vezes
 * devolve o que recebeu, e um detalhe de erro que ecoasse a chave a colocaria
 * no log do servidor.
 *
 * ─── A verificação do token NÃO usa a chave de serviço ──────────────────────
 *
 * O token do chamador é conferido em `/auth/v1/user` com a chave PUBLICÁVEL no
 * cabeçalho `apikey` — o mesmo par que o navegador usa. Medido: com a chave de
 * serviço nesse cabeçalho o GoTrue responde `403 bad_jwt / missing sub claim`,
 * porque ela não representa Conta alguma. Manter a conferência na credencial
 * pública deixa claro que a identidade vem do token, e de nada mais.
 */

/* O bucket e a forma do caminho vêm do DOMÍNIO — os MESMOS que a tela usa para
   montar o envio e que a migração usa para criar o bucket. Escrever o nome do
   bucket à mão aqui criaria a segunda grafia, e a divergência apareceria como
   uma remoção silenciosamente bem-sucedida contra um bucket vazio. */
import {
  BUCKET_DAS_IMAGENS,
  ehCaminhoDeCapa,
} from "../../src/domain/blog/arquivos.js";
/* E os campos de SEO vêm do MESMO lugar de onde a porta os aceita — a lista é
   uma, e não uma por camada. */
import { CAMPOS_DE_SEO } from "../../src/domain/blog/compartilhamento.js";

/**
 * As variáveis que a função exige, e de onde ela as aceita.
 *
 * `chaveDeServico` **não** tem alternativa com prefixo `VITE_`, e essa ausência
 * é a regra: qualquer variável `VITE_*` é embutida no bundle que o navegador
 * baixa. Aceitar `VITE_…` aqui seria oferecer um jeito de vazar a chave sem
 * ninguém perceber que vazou.
 */
export const VARIAVEIS = Object.freeze({
  url: Object.freeze(["SUPABASE_URL", "VITE_SUPABASE_URL"]),
  chavePublicavel: Object.freeze([
    "SUPABASE_CHAVE_PUBLICAVEL",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  ]),
  chaveDeServico: Object.freeze(["SUPABASE_CHAVE_DE_SERVICO"]),
});

/**
 * Prazo.
 *
 * **Dois prazos, e o total é o que importa.** A plataforma mata a função entre
 * 10 e 15 segundos. Com prazo só por chamada, o núcleo faz até três chamadas
 * sequenciais e o teto interno virava 45 segundos: ele nunca disparava, a
 * plataforma cortava primeiro, e o cliente recebia um 504 cru — sem tipo, sem
 * frase, sem nada para a tela fazer. O prazo TOTAL é compartilhado entre as
 * chamadas de um mesmo pedido, e é ele que garante que o erro tipado chegue
 * antes de a plataforma desistir.
 */
export const PRAZO_TOTAL_PADRAO_MS = 9000;

/**
 * O formato de identificador, para a guarda do `DELETE`.
 *
 * Escrito aqui, e não importado de `salvarPost.js`, porque este módulo é o
 * TRANSPORTE e não conhece o núcleo — a direção de dependência é a outra. A
 * verificação compara os dois padrões sobre um corpus, que é o que impede as
 * duas cópias de divergirem em silêncio.
 */
/**
 * A resposta do Storage significa "este arquivo não existe"?
 *
 * `404` puro e `400` com `error: "not_found"` — as duas formas que o Storage
 * do Supabase usa para a mesma coisa. Exportada porque a verificação exercita
 * as duas: um ramo declarado e nunca exercido é um ramo que ninguém sabe se
 * funciona.
 */
export const CODIGOS_DE_ARQUIVO_AUSENTE = Object.freeze([
  "404",
  "not_found",
  "Not Found",
  "NoSuchKey",
]);

export function ehArquivoAusente(resposta) {
  if (resposta?.status === 404) return true;
  if (resposta?.status !== 400) return false;
  /* Igualdade contra o vocabulário, e não busca de substring: "not_found"
     dentro de uma mensagem qualquer não é um veredito, e tratá-lo como um
     transformaria qualquer recusa que mencionasse a palavra em "o arquivo já
     não estava lá" — resíduo desaparecendo em silêncio. */
  return CODIGOS_DE_ARQUIVO_AUSENTE.includes(String(resposta?.codigo ?? ""));
}

export const PADRAO_DE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PRAZO_POR_CHAMADA_PADRAO_MS = 5000;

/**
 * As colunas que a gravação devolve.
 *
 * Lista FECHADA, como a de campos aceitos. A versão anterior pedia `select=*`:
 * a entrada era lista de permissão e a saída era tudo — então toda coluna
 * futura (uma nota interna, um campo de moderação) passaria a sair na resposta
 * da API sem ninguém decidir isso.
 */
export const COLUNAS_DO_POST = Object.freeze([
  "id",
  "slug",
  "titulo",
  "resumo",
  "conteudo",
  "conteudo_html",
  "estado",
  "publicado_em",
  /* Story 2.12: `destaque` é COLUNA de saída porque ele passou a ser escrito
     por esta porta. Sem ele na lista, a resposta de um "alternar Destaque"
     voltaria sem o valor que a operação acabou de gravar, e a tela teria de
     acreditar no que pediu em vez de ler o que ficou — que é exatamente o
     "efeito imediato que mente" que a story proíbe. */
  "destaque",
  "autor_id",
  "autor_nome",
  /* Story 3.1: a CAPA. As duas colunas saem na resposta porque a exclusão
     precisa do endereço para remover o arquivo — `excluirPost` devolve a
     linha apagada, e é dela que o caminho no bucket é derivado. Sem elas na
     lista, o arquivo de todo Post excluído ficaria órfão e nada acusaria. */
  "imagem_url",
  "imagem_alt",
  /* Story 3.4: os TRÊS campos de SEO. Eles saem na resposta pela mesma razão
     que a capa — a tela passa a mostrar o que o servidor GRAVOU, e não o que
     ela mandou, e a exclusão precisa de `seo_imagem_url` para saber qual
     arquivo sai do bucket. Sem esta última, o arquivo da imagem de
     compartilhamento de todo Post excluído ficaria órfão e nada acusaria.

     A lista vem do DOMÍNIO, e não escrita de novo: ela é a mesma que a porta
     aceita e que a gaveta desenha. */
  ...CAMPOS_DE_SEO,
  "criado_em",
  "atualizado_em",
]);

const SELECAO_DO_POST = COLUNAS_DO_POST.join(",");

/**
 * As colunas que uma gravação de Categoria devolve (Story 2.14).
 *
 * Lista FECHADA pelo mesmo motivo da do Post: a entrada é lista de permissão, e
 * uma saída `select=*` faria toda coluna futura passar a sair na resposta da
 * API sem ninguém decidir isso. Ela é a MESMA lista que a camada de leitura
 * usa (`COLUNAS_DA_CATEGORIA`, em `src/data/blog/taxonomia.js`) mais os dois
 * instantes — e a verificação compara as duas.
 */
export const COLUNAS_DA_CATEGORIA_NA_ESCRITA = Object.freeze([
  "id",
  "nome",
  "slug",
  "icone",
  "cor",
  "ordem",
  "criado_em",
  "atualizado_em",
]);

const SELECAO_DA_CATEGORIA = COLUNAS_DA_CATEGORIA_NA_ESCRITA.join(",");

/** As colunas de uma Tag. Curta, e fechada pela mesma razão. */
export const COLUNAS_DA_TAG_NA_ESCRITA = Object.freeze(["id", "nome", "slug"]);

const SELECAO_DA_TAG = COLUNAS_DA_TAG_NA_ESCRITA.join(",");

/**
 * O total de uma faixa do PostgREST (`0-0/12`, `* /12`, `0-24/*`), ou `null`.
 *
 * `null` significa "não deu para saber", e quem chama precisa tratar isso como
 * falha em vez de zero: a contagem existe para dizer quantos Posts dependem de
 * uma Categoria antes de excluí-la, e um zero inventado é a frase mais
 * perigosa que essa recusa poderia ter. `*` no lugar do total é a resposta do
 * PostgREST quando a contagem não foi pedida — também é ausência, não zero.
 */
export function totalDaFaixa(faixa) {
  const texto = typeof faixa === "string" ? faixa.trim() : "";
  const casou = /\/(\d+)\s*$/.exec(texto);
  if (!casou) return null;
  const total = Number(casou[1]);
  return Number.isInteger(total) && total >= 0 ? total : null;
}

/**
 * A URL do projeto serve para receber a chave de serviço?
 *
 * Sem esta conferência, `lerAmbiente` aceitava qualquer texto e o acesso mandava
 * a chave de serviço para lá — uma variável trocada por engano no painel da
 * plataforma, ou trocada de propósito por quem tem acesso a ele, exfiltra o
 * segredo numa requisição. Devolve `null` quando está boa, ou a razão.
 */
export function problemaNaUrl(bruto) {
  let url;
  try {
    url = new URL(bruto);
  } catch {
    return "não é uma URL absoluta";
  }
  const local =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    return `exige https: (http: só para host local), e veio ${url.protocol}`;
  }
  // Credencial embutida na URL viaja em log de proxy e em histórico.
  if (url.username !== "" || url.password !== "") {
    return "não pode trazer credencial embutida";
  }
  if (url.search !== "" || url.hash !== "") {
    return "não pode trazer consulta nem fragmento";
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    return `precisa ser a raiz do projeto, e veio o caminho ${url.pathname}`;
  }
  return null;
}

/**
 * Lê a configuração do ambiente.
 *
 * Devolve `{ ok: false, faltando, invalidas }` em vez de lançar, e nomeia o que
 * falta: quem for publicar precisa saber qual variável configurar, e "algo deu
 * errado" não é a resposta.
 */
export function lerAmbiente(ambiente = {}) {
  const valores = {};
  const faltando = [];
  for (const [campo, nomes] of Object.entries(VARIAVEIS)) {
    let valor = "";
    for (const nome of nomes) {
      const bruto = ambiente[nome];
      if (typeof bruto === "string" && bruto.trim() !== "") {
        valor = bruto.trim();
        break;
      }
    }
    if (valor === "") faltando.push(nomes[0]);
    else valores[campo] = valor;
  }
  if (faltando.length > 0) return { ok: false, faltando, invalidas: [] };

  // A URL termina sem barra, para que a concatenação de caminho não produza
  // `//rest/v1` — que o PostgREST responde com 404 e ninguém entende por quê.
  valores.url = valores.url.replace(/\/+$/, "");
  const problema = problemaNaUrl(valores.url);
  if (problema !== null) {
    return {
      ok: false,
      faltando: [],
      invalidas: [`${VARIAVEIS.url[0]}: ${problema}`],
    };
  }
  return { ok: true, config: valores };
}

/* ─── O acesso ───────────────────────────────────────────────────────────── */

/**
 * O acesso ao projeto, com as credenciais já resolvidas.
 *
 * `buscar` é injetável para que a verificação possa exercitar o caminho de
 * indisponibilidade (rede fora, resposta que não é JSON) sem derrubar a
 * internet — mas o padrão é o `fetch` de verdade, e é com ele que a verificação
 * exerce o caminho principal, contra o projeto real.
 */
export function criarAcesso({
  url,
  chavePublicavel,
  chaveDeServico,
  buscar = globalThis.fetch,
  prazoTotalMs = PRAZO_TOTAL_PADRAO_MS,
  prazoPorChamadaMs = PRAZO_POR_CHAMADA_PADRAO_MS,
  agora = () => Date.now(),
}) {
  /** Remove eco de credencial de qualquer texto antes de ele virar detalhe. */
  const esconder = (texto) => {
    let s = String(texto ?? "");
    for (const segredo of [chaveDeServico, chavePublicavel]) {
      if (typeof segredo === "string" && segredo.length >= 8) {
        s = s.split(segredo).join("«credencial oculta»");
      }
    }
    return s;
  };

  /**
   * O prazo total é ARMADO na primeira chamada e vale para todas as seguintes.
   *
   * `api/posts.js` monta um acesso novo por requisição, então em produção a
   * primeira chamada do pedido arma o relógio sem ninguém precisar lembrar.
   * Quem reaproveita o mesmo acesso para vários pedidos — a verificação —
   * chama `reiniciarPrazo()` entre eles; esquecer disso faz as chamadas
   * seguintes falharem como `rede`, o que é visível, e não silencioso.
   */
  let armadoEm = null;
  const restanteMs = () => {
    if (armadoEm === null) armadoEm = agora();
    return prazoTotalMs - (agora() - armadoEm);
  };

  function sinal(ms) {
    try {
      return AbortSignal.timeout(ms);
    } catch {
      // Runtime sem `AbortSignal.timeout`: seguir sem prazo é ruim, abortar a
      // gravação por causa disso é pior.
      return undefined;
    }
  }

  /**
   * Uma chamada HTTP ao projeto, traduzida em valor.
   *
   * Devolve sempre `{ ok, status, dados, codigo, mensagem }`. `status: 0`
   * significa "não falamos com o servidor" — quem chama distingue isso de uma
   * recusa, e a distinção é o que separa "tente de novo" de "isso não vai dar".
   */
  async function pedir(caminho, { metodo = "GET", corpo, cabecalhos = {} } = {}) {
    const restante = restanteMs();
    if (restante <= 0) {
      // O prazo do PEDIDO acabou. Falhar aqui, com tipo, é melhor que sair na
      // chamada e deixar a plataforma cortar sem erro nenhum.
      return {
        ok: false,
        status: 0,
        dados: null,
        faixa: "",
        codigo: "PrazoEsgotado",
        mensagem: `o prazo de ${prazoTotalMs} ms do pedido terminou antes de ${caminho}`,
      };
    }

    let resposta;
    try {
      resposta = await buscar(`${url}${caminho}`, {
        method: metodo,
        signal: sinal(Math.min(prazoPorChamadaMs, restante)),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...cabecalhos,
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
    } catch (excecao) {
      return {
        ok: false,
        status: 0,
        dados: null,
        faixa: "",
        codigo: String(excecao?.name ?? ""),
        mensagem: esconder(excecao?.message ?? excecao),
      };
    }

    const texto = await resposta.text().catch(() => "");
    let dados = null;
    try {
      dados = texto === "" ? null : JSON.parse(texto);
    } catch {
      dados = null;
    }

    /* A FAIXA da resposta, quando o PostgREST a manda.
       Ela é a única forma de saber uma CONTAGEM exata sem trazer as linhas: com
       `Prefer: count=exact`, o cabeçalho volta como `0-0/12`, e é o `12` que a
       recusa de excluir Categoria em uso precisa dizer. Trazer as linhas para
       contá-las funcionaria com doze Posts e seria uma varredura com mil. */
    let faixa = "";
    try {
      faixa = String(resposta.headers?.get?.("content-range") ?? "");
    } catch {
      faixa = "";
    }

    if (!resposta.ok) {
      const objeto = dados !== null && typeof dados === "object" ? dados : {};
      return {
        ok: false,
        status: resposta.status,
        dados: null,
        faixa,
        // O PostgREST devolve `code` (SQLSTATE) e `message`; o GoTrue devolve
        // `error_code` e `msg`; o STORAGE devolve `statusCode` e `error`, e é
        // ele que responde 400 no corpo com 404 dentro quando o objeto não
        // existe. Os três entram, porque a classificação depende deles e olhar
        // só um deixa metade dos casos em "inesperado".
        codigo: String(
          objeto.code ?? objeto.error_code ?? objeto.statusCode ?? objeto.error ?? "",
        ),
        mensagem: esconder(
          objeto.message ?? objeto.msg ?? objeto.error_description ?? texto.slice(0, 300),
        ),
      };
    }

    return {
      ok: true,
      status: resposta.status,
      dados,
      faixa,
      codigo: "",
      mensagem: "",
    };
  }

  const comServico = (extra = {}) => ({
    apikey: chaveDeServico,
    Authorization: `Bearer ${chaveDeServico}`,
    ...extra,
  });

  const primeira = (resultado) => {
    if (!resultado.ok) return resultado;
    const lista = Array.isArray(resultado.dados) ? resultado.dados : [];
    return { ...resultado, dados: lista.length > 0 ? lista[0] : null };
  };

  return {
    /** Rearma o prazo total. Um acesso, um pedido — ver `restanteMs`. */
    reiniciarPrazo() {
      armadoEm = null;
    },

    /**
     * Quem está pedindo, conferido **no servidor** contra o Supabase.
     *
     * Nada de decodificar o token localmente: assinatura e validade são do
     * GoTrue, e um token forjado passa por qualquer leitura de payload.
     */
    contaDoToken(token) {
      return pedir("/auth/v1/user", {
        cabecalhos: {
          apikey: chavePublicavel,
          Authorization: `Bearer ${token}`,
        },
      });
    },

    /** O nome de exibição da Conta, que assina o Post. */
    async perfilDaConta(id) {
      return primeira(
        await pedir(
          `/rest/v1/perfis?select=id,nome_exibicao&id=eq.${encodeURIComponent(id)}&limit=1`,
          { cabecalhos: comServico() },
        ),
      );
    },

    /**
     * O Post que já existe, ou `null`.
     *
     * `publicado_em` entra porque é ele, junto de `estado`, que diz se o Post já
     * teve URL pública — e é isso que decide se trocar o endereço exige aposentar
     * o anterior. `imagem_url` entra na Story 3.1 pela mesma natureza: é o
     * endereço ANTERIOR da capa, e é ele que diz qual arquivo sai do bucket
     * quando a capa é trocada. Lê-lo da linha que já vem para a transição é
     * uma chamada a menos num pedido que tem prazo total.
     *
     * `seo_imagem_url` entra na Story 3.4 pela MESMA natureza, e a ausência
     * dela seria um vazamento silencioso: a story abriu o caminho de escrita
     * da imagem de compartilhamento, e trocar um arquivo enviado sem este
     * campo aqui deixaria o anterior no bucket para sempre — sem virar nem
     * resíduo, porque não haveria quem o nomeasse.
     */
    async lerPost(id) {
      return primeira(
        await pedir(
          `/rest/v1/posts?select=id,slug,estado,publicado_em,autor_id,autor_nome,imagem_url,seo_imagem_url&id=eq.${encodeURIComponent(id)}&limit=1`,
          { cabecalhos: comServico() },
        ),
      );
    },

    /**
     * Quem é o dono deste endereço hoje, entre os Posts ativos — ou `null`.
     *
     * Existe para que a colisão seja detectada ANTES de gravar. A restrição de
     * unicidade continua sendo a última linha; o que ela não sabe fazer é avisar
     * enquanto ainda dá para escolher outro endereço.
     */
    async postPorSlug(slug) {
      return primeira(
        await pedir(
          `/rest/v1/posts?select=id,slug&slug=eq.${encodeURIComponent(slug)}&limit=1`,
          { cabecalhos: comServico() },
        ),
      );
    },

    /**
     * O registro de aposentadoria deste endereço, ou `null`.
     *
     * Consultado junto do ativo porque a colisão é contra os DOIS: um endereço
     * aposentado ainda resolve, e dá-lo a outro Post quebraria o
     * redirecionamento em vez de um link.
     */
    async slugAposentado(slug) {
      return primeira(
        await pedir(
          `/rest/v1/slugs_antigos?select=slug,post_id&slug=eq.${encodeURIComponent(slug)}&limit=1`,
          { cabecalhos: comServico() },
        ),
      );
    },

    /**
     * Troca o endereço do Post e aposenta o anterior — **uma chamada, uma
     * transação**, porque as duas escritas são em tabelas diferentes e o
     * PostgREST faz uma tabela por vez.
     *
     * A função de banco (`aposentar_slug_do_post`) é `security definer`, com
     * `execute` revogado de `anon` e de `authenticated`: ela existe para ser
     * chamada daqui, com a chave de serviço, e de nenhum outro lugar.
     */
    async aposentarSlug(id, slugNovo) {
      return pedir("/rest/v1/rpc/aposentar_slug_do_post", {
        metodo: "POST",
        corpo: { p_id: id, p_slug_novo: slugNovo },
        cabecalhos: comServico(),
      });
    },

    /* ─── Categorias (Story 2.14) ──────────────────────────────────────────
       A Categoria virou dado, e escrever nela é escrever no banco: passa por
       aqui, com a chave de serviço, como tudo o mais. Nenhuma política de
       escrita foi criada para `categorias` — a RLS continua negando escrita a
       `anon` e a `authenticated`. */

    /** A Categoria que já existe, ou `null`. */
    async lerCategoria(id) {
      return primeira(
        await pedir(
          `/rest/v1/categorias?select=${SELECAO_DA_CATEGORIA}&id=eq.${encodeURIComponent(id)}&limit=1`,
          { cabecalhos: comServico() },
        ),
      );
    },

    /**
     * Quem já tem este nome, ou `null` — para a recusa dizer QUAL já existe.
     *
     * A restrição `categorias_nome_unico` continua sendo a última linha; o que
     * ela não sabe fazer é avisar enquanto ainda dá para escolher outro nome.
     * É o mesmo desenho de `postPorSlug`.
     */
    async categoriaPorNome(nome) {
      return primeira(
        await pedir(
          `/rest/v1/categorias?select=${SELECAO_DA_CATEGORIA}&nome=eq.${encodeURIComponent(nome)}&limit=1`,
          { cabecalhos: comServico() },
        ),
      );
    },

    /** Quem já tem este endereço, ou `null`. Mesma razão. */
    async categoriaPorSlug(slug) {
      return primeira(
        await pedir(
          `/rest/v1/categorias?select=${SELECAO_DA_CATEGORIA}&slug=eq.${encodeURIComponent(slug)}&limit=1`,
          { cabecalhos: comServico() },
        ),
      );
    },

    /**
     * Quantos Posts usam esta Categoria — a contagem que EXPLICA a recusa.
     *
     * `Prefer: count=exact` faz o PostgREST devolver `content-range: 0-0/12`
     * sem trazer as linhas. Trazer os Posts para contá-los funcionaria com doze
     * e seria uma varredura com mil — e o número precisa ser exato, porque a
     * frase o diz.
     *
     * Devolve `{ ok: true, total }` ou a falha do transporte. Faixa que não dá
     * para ler vira falha, e não zero: um zero inventado transformaria "três
     * posts dependem desta categoria" em "nenhum post depende", que é a frase
     * mais perigosa possível diante de uma exclusão.
     */
    async contarPostsDaCategoria(id) {
      const resposta = await pedir(
        `/rest/v1/posts?select=id&categoria_id=eq.${encodeURIComponent(id)}&limit=1`,
        { cabecalhos: comServico({ Prefer: "count=exact" }) },
      );
      if (!resposta.ok) return resposta;
      const total = totalDaFaixa(resposta.faixa);
      if (total === null) {
        return {
          ok: false,
          status: resposta.status,
          dados: null,
          faixa: resposta.faixa,
          codigo: "ContagemIlegivel",
          mensagem: `o PostgREST não devolveu contagem: content-range ${JSON.stringify(resposta.faixa ?? "")}`,
        };
      }
      return { ...resposta, dados: { total } };
    },

    /** Cria uma Categoria. Um comando, com as colunas montadas pelo chamador. */
    async inserirCategoria(campos) {
      return primeira(
        await pedir(`/rest/v1/categorias?select=${SELECAO_DA_CATEGORIA}`, {
          metodo: "POST",
          corpo: campos,
          cabecalhos: comServico({ Prefer: "return=representation" }),
        }),
      );
    },

    /** Atualiza uma Categoria existente. */
    async atualizarCategoria(id, campos) {
      return primeira(
        await pedir(
          `/rest/v1/categorias?select=${SELECAO_DA_CATEGORIA}&id=eq.${encodeURIComponent(id)}`,
          {
            metodo: "PATCH",
            corpo: campos,
            cabecalhos: comServico({ Prefer: "return=representation" }),
          },
        ),
      );
    },

    /**
     * Apaga uma Categoria — com a MESMA guarda do `DELETE` de Post.
     *
     * Filtro ausente ou malformado no PostgREST não é um erro: é um `DELETE` na
     * tabela inteira. O chamador já confere o identificador, e confiar nisso é
     * exatamente a suposição que um caminho novo quebraria sem ninguém notar.
     *
     * `return=representation` distingue "excluída" de "não estava lá", como na
     * exclusão de Post. E o banco recusa por `posts_categoria_id_fkey` quando
     * ela está em uso — a aplicação conta antes para explicar; o `restrict` é o
     * que garante.
     */
    async excluirCategoria(id) {
      const alvo = typeof id === "string" ? id.trim() : "";
      if (!PADRAO_DE_UUID.test(alvo)) {
        return {
          ok: false,
          status: 0,
          faixa: "",
          codigo: "IdentificadorInvalido",
          mensagem:
            "exclusão de categoria recusada no transporte: identificador ausente ou fora do formato",
          dados: null,
        };
      }
      return primeira(
        await pedir(
          `/rest/v1/categorias?select=${SELECAO_DA_CATEGORIA}&id=eq.${encodeURIComponent(alvo)}`,
          {
            metodo: "DELETE",
            cabecalhos: comServico({ Prefer: "return=representation" }),
          },
        ),
      );
    },

    /* ─── Tags por NOME (Story 2.14) ───────────────────────────────────────
       A tela passou a produzir nomes, e nome não é identificador: alguém tem
       de procurar a Tag que já existe e criar a que falta. São duas chamadas,
       nesta ordem, e a ordem importa — ver `resolverTags` no núcleo. */

    /** As Tags cujos endereços estão nesta lista. Lista vazia não vai à rede. */
    async tagsPorSlugs(slugs) {
      const lista = Array.isArray(slugs) ? slugs.filter((s) => s !== "") : [];
      if (lista.length === 0) {
        return { ok: true, status: 200, dados: [], faixa: "", codigo: "", mensagem: "" };
      }
      const filtro = lista.map((s) => `"${encodeURIComponent(s)}"`).join(",");
      return pedir(`/rest/v1/tags?select=${SELECAO_DA_TAG}&slug=in.(${filtro})`, {
        cabecalhos: comServico(),
      });
    },

    /**
     * Cria as Tags que faltam, **ignorando** as que já existem.
     *
     * `resolution=ignore-duplicates` em vez de `merge-duplicates`: mesclar
     * REESCREVERIA o nome de uma Tag que já existe porque alguém digitou com
     * outra caixa — "SEO" viraria "seo" para todos os Posts que já a usavam.
     * A grafia é de quem cadastrou primeiro; quem chega depois reaproveita.
     *
     * Ignorar duplicata é também o que faz duas gravações simultâneas do mesmo
     * nome não estourarem por unicidade: a segunda simplesmente não insere, e a
     * releitura seguinte encontra a linha da primeira.
     */
    async inserirTags(linhas) {
      const lista = Array.isArray(linhas) ? linhas : [];
      if (lista.length === 0) {
        return { ok: true, status: 200, dados: [], faixa: "", codigo: "", mensagem: "" };
      }
      return pedir(`/rest/v1/tags?select=${SELECAO_DA_TAG}&on_conflict=slug`, {
        metodo: "POST",
        corpo: lista,
        cabecalhos: comServico({
          Prefer: "return=representation,resolution=ignore-duplicates",
        }),
      });
    },

    /** Substitui o conjunto de Tags do Post, também numa transação só. */
    async definirTags(id, tags) {
      return pedir("/rest/v1/rpc/definir_tags_do_post", {
        metodo: "POST",
        corpo: { p_id: id, p_tags: tags },
        cabecalhos: comServico(),
      });
    },

    /** As Tags associadas ao Post hoje, para a resposta refletir o gravado. */
    async tagsDoPost(id) {
      return pedir(
        `/rest/v1/posts_tags?select=tag_id&post_id=eq.${encodeURIComponent(id)}`,
        { cabecalhos: comServico() },
      );
    },

    /**
     * Grava um Post novo. UM comando, com documento e HTML juntos: é o que
     * torna "os dois entram ou nenhum entra" propriedade do código em vez de
     * disciplina de quem escreve.
     */
    async inserirPost(campos) {
      return primeira(
        await pedir(`/rest/v1/posts?select=${SELECAO_DO_POST}`, {
          metodo: "POST",
          corpo: campos,
          cabecalhos: comServico({ Prefer: "return=representation" }),
        }),
      );
    },

    /** Atualiza um Post existente. Também um comando só, pelo mesmo motivo. */
    async atualizarPost(id, campos) {
      return primeira(
        await pedir(
          `/rest/v1/posts?select=${SELECAO_DO_POST}&id=eq.${encodeURIComponent(id)}`,
          {
            metodo: "PATCH",
            corpo: campos,
            cabecalhos: comServico({ Prefer: "return=representation" }),
          },
        ),
      );
    },

    /**
     * Apaga um Post (Story 2.12). Um comando só, e ele devolve a linha apagada.
     *
     * ─── Por que a resposta precisa carregar a linha ────────────────────────
     *
     * Sem `return=representation`, apagar um Post que já não existe e apagar um
     * Post de verdade respondem a MESMA coisa (204, sem corpo), e o núcleo não
     * teria como distinguir "excluído" de "não estava lá". A tela precisa da
     * distinção: uma diz "Post excluído" e a outra diz que ele já tinha sumido
     * — que é o caso normal do segundo clique numa exclusão em curso.
     *
     * ─── O que este comando arrasta junto, e por quê ────────────────────────
     *
     * `posts_tags` e `slugs_antigos` referenciam `posts (id) on delete cascade`
     * desde a Story 2.1, então as associações e os endereços aposentados saem
     * na mesma transação do banco. Apagá-los aqui, um a um, seria reimplementar
     * em três chamadas o que a chave estrangeira faz em uma — e deixar rastro
     * quando a segunda falhasse.
     */
    async excluirPost(id) {
      /* ─── A GUARDA DO TRANSPORTE ─────────────────────────────────────────
         Esta é a única chamada destrutiva do projeto, e um filtro ausente ou
         malformado no PostgREST não é um erro: é um `DELETE` na tabela inteira.
         O chamador já confere o identificador (`idDoCorpo`), e confiar nisso é
         exatamente a suposição que um caminho novo — uma operação futura, um
         script — quebraria sem ninguém notar. A conferência é barata e mora no
         lugar onde o comando é montado. */
      const alvo = typeof id === "string" ? id.trim() : "";
      if (!PADRAO_DE_UUID.test(alvo)) {
        return {
          ok: false,
          status: 0,
          faixa: "",
          codigo: "IdentificadorInvalido",
          mensagem:
            "exclusão recusada no transporte: identificador ausente ou fora do formato",
          dados: null,
        };
      }
      return primeira(
        await pedir(
          `/rest/v1/posts?select=${SELECAO_DO_POST}&id=eq.${encodeURIComponent(alvo)}`,
          {
            metodo: "DELETE",
            cabecalhos: comServico({ Prefer: "return=representation" }),
          },
        ),
      );
    },

    /* ─── O Storage (Story 3.1) ────────────────────────────────────────────
       O ENVIO não passa por aqui: o arquivo vai do navegador direto para o
       bucket, com o JWT do Autor, sob a política de `storage.objects`. O que
       passa por aqui é a REMOÇÃO — porque ela acontece do lado do servidor,
       depois de a linha sair, e quem tem a linha é esta função. */

    /**
     * O endereço público de um caminho do bucket, montado a partir da URL do
     * projeto que este acesso já conhece.
     *
     * Existe para que o núcleo possa perguntar "este endereço é do NOSSO
     * bucket?" sem ler variável de ambiente — a direção de dependência é esta,
     * e a montagem do endereço em si é do domínio, importada.
     */
    baseDoProjeto() {
      return url;
    },

    /**
     * Remove um arquivo do bucket das imagens.
     *
     * ─── A GUARDA, pela mesma razão do `DELETE` sem filtro ─────────────────
     *
     * Isto roda com a chave de serviço, que ignora política. O caminho vem de
     * um endereço GRAVADO no banco, e um caminho torto — `..`, barra no
     * começo, pasta que não é `capas/` — apagaria coisa que ninguém pediu.
     * `ehCaminhoDeCapa` é lista de PERMISSÃO, do domínio, a mesma que monta o
     * caminho do outro lado.
     *
     * Devolve o mesmo `{ ok, status, … }` de qualquer outra chamada. **204 e
     * 200 são sucesso; ARQUIVO AUSENTE também**, porque "o arquivo já não está
     * lá" é o estado desejado — tratá-lo como falha faria uma segunda exclusão
     * do mesmo Post relatar resíduo que não existe.
     *
     * E "ausente" não é só `404`: o Storage do Supabase responde **400 com
     * `{"error":"not_found"}` no corpo** para objeto que não existe, e ler só o
     * código faria o caso mais comum de ausência virar resíduo fantasma. Os
     * dois entram, e o corpo é conferido por igualdade com o vocabulário do
     * Storage, não por busca de substring: `not_found` dentro de uma mensagem
     * qualquer não é um veredito.
     */
    async removerArquivoDaCapa(caminho) {
      const alvo = typeof caminho === "string" ? caminho.trim() : "";
      if (!ehCaminhoDeCapa(alvo)) {
        return {
          ok: false,
          status: 0,
          faixa: "",
          codigo: "CaminhoInvalido",
          mensagem:
            "remoção recusada no transporte: o caminho não é o de uma capa deste bucket",
          dados: null,
        };
      }
      const resposta = await pedir(
        `/storage/v1/object/${BUCKET_DAS_IMAGENS}/${alvo
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`,
        { metodo: "DELETE", cabecalhos: comServico() },
      );
      if (!resposta.ok && ehArquivoAusente(resposta)) {
        return { ...resposta, ok: true, dados: null, codigo: "", mensagem: "" };
      }
      return resposta;
    },
  };
}

/**
 * O acesso montado a partir do ambiente do processo.
 *
 * Devolve `{ ok: false, faltando }` quando falta variável — o invólucro traduz
 * isso em erro de configuração, que é diferente de defeito e diferente de
 * credencial recusada.
 */
export function acessoDoAmbiente(ambiente, opcoes = {}) {
  const lido = lerAmbiente(ambiente);
  if (!lido.ok) return lido;
  return { ok: true, acesso: criarAcesso({ ...lido.config, ...opcoes }) };
}
