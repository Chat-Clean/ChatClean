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
  "criado_em",
  "atualizado_em",
]);

const SELECAO_DO_POST = COLUNAS_DO_POST.join(",");

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

    if (!resposta.ok) {
      const objeto = dados !== null && typeof dados === "object" ? dados : {};
      return {
        ok: false,
        status: resposta.status,
        dados: null,
        // O PostgREST devolve `code` (SQLSTATE) e `message`; o GoTrue devolve
        // `error_code` e `msg`. Os dois entram, porque a classificação depende
        // deles e olhar só um deixa metade dos casos em "inesperado".
        codigo: String(objeto.code ?? objeto.error_code ?? ""),
        mensagem: esconder(
          objeto.message ?? objeto.msg ?? objeto.error_description ?? texto.slice(0, 300),
        ),
      };
    }

    return { ok: true, status: resposta.status, dados, codigo: "", mensagem: "" };
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
     * o anterior.
     */
    async lerPost(id) {
      return primeira(
        await pedir(
          `/rest/v1/posts?select=id,slug,estado,publicado_em,autor_id,autor_nome&id=eq.${encodeURIComponent(id)}&limit=1`,
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
