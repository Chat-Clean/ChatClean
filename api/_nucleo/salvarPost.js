/**
 * O núcleo da escrita: o ÚNICO caminho pelo qual um Post é gravado.
 *
 * Nenhum cliente escreve. A RLS da Story 2.1 nega escrita a `anon` e a
 * `authenticated`, e isso é deliberado — não há política de escrita, e o
 * privilégio foi revogado inclusive de `PUBLIC`. Esta função grava com a chave
 * de serviço, e é por isso que ela carrega o peso inteiro da verificação:
 *
 *   1. confere o token do chamador **contra o Supabase, no servidor**;
 *   2. valida o documento contra o schema fechado de `domain/blog` — a MESMA
 *      função que o Editor usa, importada, não uma segunda implementação;
 *   3. **deriva** `conteudo_html` pelo renderizador único;
 *   4. resolve o Autor no servidor;
 *   5. grava documento e HTML **na mesma operação**.
 *
 * ─── Por que o núcleo é separado do invólucro da plataforma ─────────────────
 *
 * Uma função escrita diretamente no formato da Vercel só é exercitável
 * publicando ou emulando a plataforma. Com o núcleo separado, a verificação
 * chama a MESMA lógica que roda em produção, com sessão real e banco real — e o
 * invólucro que fica sem cobertura (`api/posts.js`) é fino o bastante para ser
 * lido de uma vez.
 *
 * Este módulo não conhece requisição, resposta, cabeçalho nem `process.env`. Ele
 * recebe o token, o corpo e o acesso, e devolve um resultado tipado.
 *
 * ─── O que este módulo NÃO faz, de propósito ────────────────────────────────
 *
 * Ele não aceita `estado` do cliente — nem na criação, nem na edição. Post novo
 * nasce `rascunho` pelo padrão da coluna; Post existente conserva o estado que
 * tinha. As transições explícitas (publicar, agendar, arquivar) são da Story
 * 2.8, e vão passar por aqui quando chegarem. Também não aceita metadado
 * (categoria, tags, capa, SEO): é da 2.6 e da 2.14. A lista de campos aceitos é
 * FECHADA, e o que vem fora dela é ignorado e relatado — nunca gravado.
 */

import {
  ERRO_CONFIGURACAO,
  ERRO_INESPERADO,
  ERRO_NAO_ENCONTRADO,
  ERRO_PERMISSAO,
  ERRO_REDE,
} from "../../src/data/blog/resultado.js";
import { derivarHtml } from "../../src/render/blog/paraHtml.js";

/* ─── O vocabulário de erro ──────────────────────────────────────────────── */
//
// Os cinco primeiros são IMPORTADOS de `data/blog/resultado.js`, e não
// reescritos: as duas camadas falam com a mesma tela, e duas grafias de
// "permissao" seriam duas telas diferentes para a mesma coisa.
//
// Os dois últimos são novos porque uma ESCRITA tem modos de falha que uma
// leitura não tem: entrada que não serve, e colisão com o que já está gravado.
// A divergência é deliberada e está registrada aqui para não ser lida como
// esquecimento.

export const ERRO_DADOS_INVALIDOS = "dados_invalidos";
export const ERRO_CONFLITO = "conflito";

/* Os cinco importados são REEXPORTADOS aqui para que quem consome a escrita
   tenha um lugar só de onde tirar o vocabulário inteiro. Sem isto, o invólucro
   importaria cinco nomes de um módulo e dois de outro — e a próxima pessoa
   escreveria `"permissao"` à mão. */
export {
  ERRO_CONFIGURACAO,
  ERRO_INESPERADO,
  ERRO_NAO_ENCONTRADO,
  ERRO_PERMISSAO,
  ERRO_REDE,
};

export const TIPOS_DE_ERRO = Object.freeze([
  ERRO_REDE,
  ERRO_PERMISSAO,
  ERRO_NAO_ENCONTRADO,
  ERRO_CONFIGURACAO,
  ERRO_INESPERADO,
  ERRO_DADOS_INVALIDOS,
  ERRO_CONFLITO,
]);

/**
 * A frase padrão de cada tipo. Voz direta: diz o que houve e o que fazer.
 *
 * A frase de `permissao` é a MESMA para pedido sem token e para token forjado ou
 * vencido, e isso é requisito: distinguir os dois na resposta diria a quem
 * tenta se o token que ele inventou tem forma válida.
 */
const MENSAGENS = Object.freeze({
  [ERRO_REDE]:
    "Não conseguimos falar com o servidor para salvar. Tente de novo em instantes.",
  [ERRO_PERMISSAO]:
    "Sua sessão não autoriza esta gravação. Entre no Painel de novo e tente salvar.",
  [ERRO_NAO_ENCONTRADO]:
    "Este post não existe mais. Ele pode ter sido apagado por outra pessoa.",
  [ERRO_CONFIGURACAO]:
    "O servidor de gravação está sem configuração. Avise quem cuida da publicação.",
  [ERRO_INESPERADO]:
    "Algo saiu do previsto ao salvar. O conteúdo continua aqui — tente de novo.",
  [ERRO_DADOS_INVALIDOS]:
    "Não conseguimos salvar com o que foi enviado. Confira os campos e tente de novo.",
  [ERRO_CONFLITO]:
    "Já existe um post com este endereço. Escolha outro antes de salvar.",
});

export function ehTipoDeErro(valor) {
  return typeof valor === "string" && TIPOS_DE_ERRO.includes(valor);
}

/**
 * Falha tipada.
 *
 * `detalhe` existe para DIAGNÓSTICO e não para a tela: o invólucro registra e
 * não devolve. Tipo fora da lista não lança — vira `inesperado` com o valor
 * recebido no detalhe, pelo mesmo motivo que em `data/blog/resultado.js`.
 */
export function falha(
  tipo,
  { mensagem = "", detalhe = "", faltando = null, codigo = "", status = null } = {},
) {
  const valido = ehTipoDeErro(tipo);
  const t = valido ? tipo : ERRO_INESPERADO;
  const propria = typeof mensagem === "string" && mensagem.trim() !== "" ? mensagem : null;
  const erro = {
    tipo: t,
    mensagem: propria ?? MENSAGENS[t],
    detalhe: valido
      ? String(detalhe ?? "")
      : `tipo de erro desconhecido (${JSON.stringify(tipo)}) — ${String(detalhe ?? "")}`,
    codigo: String(codigo ?? ""),
    status: Number.isFinite(Number(status)) && status !== null ? Number(status) : null,
  };
  if (Array.isArray(faltando)) erro.faltando = Object.freeze([...faltando]);
  return Object.freeze({ ok: false, erro: Object.freeze(erro) });
}

/* ─── Os campos que a gravação aceita ────────────────────────────────────── */

/**
 * Lista FECHADA. É a lista de permissão do corpo do pedido, e a razão de ela
 * existir é a mesma do schema fechado do conteúdo: o que não está aqui não
 * chega ao banco, e não chega por construção, não por revisão.
 */
export const CAMPOS_ACEITOS = Object.freeze([
  "id",
  "slug",
  "titulo",
  "resumo",
  "conteudo",
]);

/**
 * Os campos que o cliente pode tentar enviar e que são ignorados **com nome**.
 *
 * Estão nomeados, e não só ausentes da lista acima, porque cada um é uma
 * tentativa com significado próprio, e a resposta diz qual foi descartada:
 *
 *   `conteudo_html` — HTML nunca é entrada; o gravado é o derivado.
 *   `estado`        — Post novo nasce `rascunho`; transição é da Story 2.8.
 *   `publicado_em`  — o par estado + data é da 2.8 e da 2.9.
 *   `autor_id`, `autor_nome` — o Autor é resolvido no servidor, sempre.
 */
export const CAMPOS_IGNORADOS = Object.freeze([
  "conteudo_html",
  "estado",
  "publicado_em",
  "autor_id",
  "autor_nome",
]);

/** O formato de slug que o banco impõe em `posts_slug_formato`. */
const FORMATO_DE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TAMANHO_MAXIMO_DO_SLUG = 200;
const TAMANHO_MAXIMO_DO_TITULO = 300;

/**
 * Tetos que o banco NÃO impõe, e que por isso precisam existir aqui.
 *
 * `titulo` e `slug` têm restrição na tabela; `resumo` e o documento não tinham
 * teto nenhum. São escolhas da IMPLEMENTAÇÃO, não decisão de produto:
 *
 *   `resumo`   600 caracteres é cerca de quatro linhas de cartão de listagem —
 *              acima disso o campo deixou de ser resumo.
 *   `conteudo` 1.000.000 caracteres de JSON, o MESMO teto que a restrição do
 *              banco impõe. Um artigo de 20 mil caracteres dá cerca de 60 kB,
 *              então é uma ordem de grandeza de folga. Ele também é o que
 *              limita a LARGURA do documento: a travessia recursiva da
 *              restrição é proporcional ao número de nós, e sem teto de tamanho
 *              um documento com centenas de milhares de irmãos transformaria
 *              cada gravação numa varredura de milhões de linhas.
 *   `ignorados` 40 nomes na lista, com a contagem inteira ao lado. O relatório
 *              de descartes do schema já tinha teto e este não tinha: dez mil
 *              chaves inventadas no corpo voltavam como dez mil strings.
 */
const TAMANHO_MAXIMO_DO_RESUMO = 600;
export const TAMANHO_MAXIMO_DO_CONTEUDO = 1_000_000;
export const LIMITE_DE_IGNORADOS = 40;

const PADRAO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ─── Classificação do que o banco e o GoTrue respondem ──────────────────── */

/**
 * Traduz a resposta do acesso num dos tipos.
 *
 * A ordem importa. Transporte primeiro, porque falha de rede vem SEM status e
 * cairia em defeito; depois credencial; depois as violações que o Postgres
 * nomeia por SQLSTATE, porque `23505` (unicidade) é conflito e `23514`
 * (restrição de verificação) é entrada que não serve — e tratá-las igual daria
 * à tela o conselho errado nos dois casos.
 */
export function classificar({ status = 0, codigo = "" } = {}) {
  const n = Number(status);
  if (!Number.isFinite(n) || n === 0 || n === 408 || n === 429 || n >= 500) {
    return ERRO_REDE;
  }
  if (n === 401 || n === 403) return ERRO_PERMISSAO;
  if (codigo === "42501") return ERRO_PERMISSAO;
  // Unicidade de slug — inclusive a que o gatilho `exigir_slug_livre` levanta
  // com o mesmo SQLSTATE quando o slug está aposentado apontando para outro
  // Post. Os dois são a mesma frase para quem escreve: escolha outro endereço.
  if (n === 409 || codigo === "23505") return ERRO_CONFLITO;
  // Restrição de verificação, coluna obrigatória, tipo inválido, chave
  // estrangeira: o pedido chegou e o que ele pede não pode existir.
  if (["23514", "23502", "23503", "22P02", "22007"].includes(codigo)) {
    return ERRO_DADOS_INVALIDOS;
  }
  /* 404 do PostgREST significa ROTA ou TABELA inexistente, não "post não
     encontrado" — traduzi-lo como ausência esconderia um schema quebrado atrás
     de uma tela calma. Ausência de linha é decidida por quem chama, sobre a
     resposta vazia. É o mesmo raciocínio de `data/blog/resultado.js`. */
  if (n === 404) return ERRO_INESPERADO;
  if (n >= 400 && n < 500) return ERRO_DADOS_INVALIDOS;
  return ERRO_INESPERADO;
}

/** Detalhe legível de uma resposta do acesso, para o log do servidor. */
function detalhar(resultado, oQue) {
  const partes = [oQue, `HTTP ${resultado?.status ?? "?"}`];
  if (resultado?.codigo) partes.push(String(resultado.codigo));
  if (resultado?.mensagem) partes.push(String(resultado.mensagem));
  return partes.join(" | ").slice(0, 500);
}

/**
 * A frase para o caso em que a **restrição do banco** recusou o conteúdo.
 *
 * Se isto aparecer pelo caminho da função, é sinal de que a validação e a
 * restrição divergiram — e a mensagem precisa dizer isso a quem investiga sem
 * dizer nada a quem tenta.
 */
function mensagemDeRecusaDoBanco(resultado) {
  const texto = `${resultado?.mensagem ?? ""}`;
  if (/posts_conteudo_html_seguro|posts_conteudo_no_vocabulario/.test(texto)) {
    return "O banco recusou este conteúdo: ele contém algo que um artigo não pode ter. Abra o post no Editor e salve de novo.";
  }
  return "";
}

/* ─── Validação do corpo ─────────────────────────────────────────────────── */

function texto(valor) {
  return typeof valor === "string" ? valor.trim() : null;
}

/** O tamanho do documento em caracteres de JSON, ou `null` se não serializa. */
function tamanhoDoConteudo(valor) {
  try {
    return JSON.stringify(valor)?.length ?? 0;
  } catch {
    return null;
  }
}

/**
 * Separa o que a gravação aceita do que ela ignora, e diz **tudo** o que está
 * errado de uma vez.
 *
 * Devolve `{ ok: true, campos, ignorados, totalIgnorado }` ou
 * `{ ok: false, mensagem, detalhe, faltando }`. Ela não toca no conteúdo: quem
 * valida documento é o schema, e ele é chamado depois.
 *
 * **Por que ela acumula em vez de retornar no primeiro problema.** A versão
 * anterior saía no primeiro erro de formato, então título vazio mais slug
 * malformado reportava só o slug — e quem preenche o formulário conserta um erro
 * por salvamento, descobrindo o seguinte só depois de clicar de novo. O critério
 * de aceite fala de "campo faltante indicado", no plural natural de um
 * formulário.
 */
export function lerCorpo(corpo, { criando }) {
  if (corpo === null || typeof corpo !== "object" || Array.isArray(corpo)) {
    return {
      ok: false,
      mensagem: "O pedido de gravação não veio no formato esperado.",
      detalhe: `esperava um objeto e veio ${
        corpo === null ? "null" : Array.isArray(corpo) ? `lista de ${corpo.length}` : typeof corpo
      }`,
      faltando: [],
    };
  }

  const todosIgnorados = Object.keys(corpo).filter(
    (chave) => !CAMPOS_ACEITOS.includes(chave),
  );

  const faltando = [];
  const problemas = [];
  const detalhes = [];
  const campos = {};

  const titulo = texto(corpo.titulo);
  if (titulo === null || titulo === "") {
    faltando.push("titulo");
  } else if (titulo.length > TAMANHO_MAXIMO_DO_TITULO) {
    problemas.push(
      `O título passa de ${TAMANHO_MAXIMO_DO_TITULO} caracteres. Encurte antes de salvar.`,
    );
    detalhes.push(`titulo com ${titulo.length} caracteres`);
  } else {
    campos.titulo = titulo;
  }

  const slug = texto(corpo.slug);
  if (slug === null || slug === "") {
    // Slug é obrigatório para NASCER (é chave de URL) e opcional na edição:
    // salvar o texto de um post sem mexer no endereço é o caso comum.
    if (criando) faltando.push("slug");
  } else if (!FORMATO_DE_SLUG.test(slug) || slug.length > TAMANHO_MAXIMO_DO_SLUG) {
    problemas.push(
      "O endereço do post aceita apenas letras minúsculas sem acento, números e hífen entre palavras.",
    );
    detalhes.push(`slug fora do formato: ${JSON.stringify(slug.slice(0, 80))}`);
  } else {
    campos.slug = slug;
  }

  if (corpo.resumo !== undefined) {
    /* `null` LIMPA o resumo, e não é erro de tipo: sem isso não havia como
       apagar um resumo já gravado — enviar vazio era recusado e omitir o campo
       preservava o antigo. */
    const resumo = corpo.resumo === null ? "" : texto(corpo.resumo);
    if (resumo === null) {
      problemas.push("O resumo do post precisa ser texto.");
      detalhes.push(`resumo veio ${typeof corpo.resumo}`);
    } else if (resumo.length > TAMANHO_MAXIMO_DO_RESUMO) {
      problemas.push(
        `O resumo passa de ${TAMANHO_MAXIMO_DO_RESUMO} caracteres. Encurte antes de salvar.`,
      );
      detalhes.push(`resumo com ${resumo.length} caracteres`);
    } else {
      campos.resumo = resumo;
    }
  }

  if (corpo.conteudo === undefined) {
    faltando.push("conteudo");
  } else {
    const tamanho = tamanhoDoConteudo(corpo.conteudo);
    if (tamanho === null) {
      problemas.push(
        "Não conseguimos ler o conteúdo enviado. Abra o post no Editor e salve de novo.",
      );
      detalhes.push("o conteúdo não pôde ser serializado como JSON");
    } else if (tamanho > TAMANHO_MAXIMO_DO_CONTEUDO) {
      problemas.push(
        "Este post é grande demais para ser gravado. Divida o conteúdo em mais de um post.",
      );
      detalhes.push(
        `conteudo com ${tamanho} caracteres de JSON (teto ${TAMANHO_MAXIMO_DO_CONTEUDO})`,
      );
    }
  }

  if (faltando.length > 0 || problemas.length > 0) {
    const frases = [];
    if (faltando.length === 1) frases.push(`Falta preencher: ${faltando[0]}.`);
    else if (faltando.length > 1) {
      frases.push(`Faltam preencher: ${faltando.join(", ")}.`);
    }
    frases.push(...problemas);
    return {
      ok: false,
      mensagem: frases.join(" "),
      detalhe: [
        faltando.length > 0 ? `campos ausentes ou vazios: ${faltando.join(", ")}` : "",
        ...detalhes,
      ]
        .filter(Boolean)
        .join(" | "),
      faltando,
    };
  }

  return {
    ok: true,
    campos,
    // Teto na LISTA, contagem sem teto — o mesmo desenho do relatório de
    // descartes do schema, e pela mesma razão: quem avisa precisa saber quantos
    // foram, e a resposta não pode virar o gargalo.
    ignorados: todosIgnorados.slice(0, LIMITE_DE_IGNORADOS),
    totalIgnorado: todosIgnorados.length,
    ignoradosTruncados: todosIgnorados.length > LIMITE_DE_IGNORADOS,
  };
}

/* ─── A escrita ──────────────────────────────────────────────────────────── */

/**
 * Grava um Post.
 *
 * `token` é o JWT do chamador; `corpo` é o que ele enviou; `acesso` é o que sabe
 * falar com o Supabase. Devolve `{ ok: true, dados }` ou `{ ok: false, erro }` —
 * **nunca lança**, porque exceção que suba daqui vira 500 sem tipo, e a tela
 * fica sem saber se deve pedir para tentar de novo ou para consertar um campo.
 */
export async function salvarPost({ token, corpo, acesso }) {
  try {
    return await gravar({ token, corpo, acesso });
  } catch (excecao) {
    return falha(ERRO_INESPERADO, {
      detalhe: `exceção não prevista: ${String(excecao?.stack ?? excecao?.message ?? excecao)}`,
      codigo: String(excecao?.name ?? ""),
    });
  }
}

async function gravar({ token, corpo, acesso }) {
  /* ── 1. Quem está pedindo ──────────────────────────────────────────────── */
  //
  // Ausência de token e token forjado dão o MESMO erro, com a MESMA frase. E
  // nada de identidade vinda do corpo do pedido: quem manda o pedido também
  // mandaria o nome de quem ele quisesse ser.

  const credencial = typeof token === "string" ? token.trim() : "";
  if (credencial === "") {
    return falha(ERRO_PERMISSAO, {
      detalhe: "pedido sem credencial no cabeçalho Authorization",
    });
  }

  const identidade = await acesso.contaDoToken(credencial);
  if (!identidade.ok) {
    const tipo = classificar(identidade);
    // 401 e 403 do GoTrue são "este token não vale". Qualquer outra coisa é
    // indisponibilidade, e confundir as duas mandaria a pessoa entrar de novo
    // quando o problema é o servidor.
    return falha(tipo === ERRO_REDE ? ERRO_REDE : ERRO_PERMISSAO, {
      detalhe: detalhar(identidade, "conferência do token no Supabase"),
      codigo: identidade.codigo,
      status: identidade.status,
    });
  }

  const conta = identidade.dados ?? {};
  if (typeof conta.id !== "string" || conta.id === "") {
    return falha(ERRO_PERMISSAO, {
      detalhe: "o Supabase confirmou o token mas não devolveu identificador de Conta",
    });
  }

  /* ── 2. O que ele está pedindo ─────────────────────────────────────────── */

  const ehObjeto = corpo !== null && typeof corpo === "object" && !Array.isArray(corpo);
  if (!ehObjeto) {
    // A forma do corpo é decidida por `lerCorpo`, que já sabe descrever o que
    // veio no lugar — chamá-lo aqui evita uma segunda frase para o mesmo caso.
    const recusa = lerCorpo(corpo, { criando: true });
    return falha(ERRO_DADOS_INVALIDOS, {
      mensagem: recusa.mensagem,
      detalhe: recusa.detalhe,
      faltando: recusa.faltando,
    });
  }

  const bruto = corpo;
  const id = texto(bruto.id);
  /* `id` ausente é criação; `id` PRESENTE e fora do formato é recusa, e não
     criação silenciosa. A diferença é sutil e importa: um cliente que manda
     `id: 123` está tentando salvar um post existente, e criar um novo no lugar
     duplicaria conteúdo em vez de acusar o erro. */
  const informouId = bruto.id !== undefined && bruto.id !== null && bruto.id !== "";
  if (informouId && (id === null || !PADRAO_UUID.test(id))) {
    return falha(ERRO_DADOS_INVALIDOS, {
      mensagem: "Não reconhecemos qual post deve ser salvo.",
      detalhe: `id fora do formato de identificador: ${JSON.stringify(String(bruto.id).slice(0, 60))}`,
    });
  }
  const criando = !informouId;

  const lido = lerCorpo(bruto, { criando });
  if (!lido.ok) {
    return falha(ERRO_DADOS_INVALIDOS, {
      mensagem: lido.mensagem,
      detalhe: lido.detalhe,
      faltando: lido.faltando,
    });
  }

  /* ── 3. O conteúdo, validado e derivado no mesmo passo ─────────────────── */
  //
  // A validação é a MESMA função que o Editor usa (`validarDocumento`), e o HTML
  // sai do renderizador único. Não há segunda implementação de nenhum dos dois,
  // e não há HTML aceito de fora — `conteudo_html` do cliente já foi para a
  // lista de ignorados na leitura do corpo.

  const derivado = derivarHtml(bruto.conteudo);
  if (!derivado.ok) {
    return falha(ERRO_DADOS_INVALIDOS, {
      mensagem: derivado.erro.mensagem,
      detalhe: derivado.erro.detalhe ?? "",
    });
  }

  const conteudo = {
    conteudo: derivado.documento,
    conteudo_html: derivado.html,
  };

  /* ── 4. Gravar ─────────────────────────────────────────────────────────── */

  if (criando) {
    const autor = await resolverAutor({ acesso, conta });
    if (!autor.ok) return autor;

    /* `estado` fica FORA do comando de propósito: o padrão da coluna é
       `rascunho`, e o cliente não tem voz aqui. Post que nasce publicado por
       causa de um campo no corpo do pedido é o defeito que esta ausência
       impede. */
    const escrita = await acesso.inserirPost({
      slug: lido.campos.slug,
      titulo: lido.campos.titulo,
      resumo: lido.campos.resumo ?? "",
      ...conteudo,
      autor_id: autor.autor_id,
      autor_nome: autor.autor_nome,
    });
    if (!escrita.ok) return falhaDaEscrita(escrita, "criação do post");
    if (escrita.dados === null) {
      return falha(ERRO_INESPERADO, {
        detalhe: "a criação não devolveu a linha gravada",
      });
    }
    return sucesso({ post: escrita.dados, criado: true, lido, derivado });
  }

  const existente = await acesso.lerPost(id);
  if (!existente.ok) return falhaDaEscrita(existente, "leitura do post a atualizar");
  if (existente.dados === null) {
    return falha(ERRO_NAO_ENCONTRADO, {
      detalhe: `nenhum post com id ${id}`,
    });
  }

  /* ── O ENDEREÇO DE UM POST QUE JÁ ESTEVE NO AR NÃO MUDA POR AQUI ────────── */
  //
  // `slugs_antigos` existe como base do redirecionamento permanente (301), e
  // esta função é o único caminho de escrita — então trocar o slug aqui sem
  // aposentar o anterior quebraria, em silêncio, toda URL já publicada.
  //
  // Aposentar o slug na MESMA operação que grava o Post exige escrever em duas
  // tabelas atomicamente, o que o PostgREST não faz: precisaria de uma função no
  // banco, e o ciclo de vida do slug (geração, edição, colisão com aposentado) é
  // da Story 2.6, que é quem tem o desenho inteiro. Fazer metade aqui produziria
  // exatamente o "gravado pela metade" que a story proíbe.
  //
  // Então a escolha é recusar em vez de quebrar: rascunho troca de endereço à
  // vontade — nunca teve URL —, e Post que já esteve no ar recusa. A Story 2.6
  // substitui esta recusa pelo caminho completo, com aposentadoria.
  const jaTeveUrl =
    existente.dados.estado !== "rascunho" || existente.dados.publicado_em !== null;
  if (
    lido.campos.slug !== undefined &&
    lido.campos.slug !== existente.dados.slug &&
    jaTeveUrl
  ) {
    return falha(ERRO_CONFLITO, {
      mensagem:
        "Este post já esteve no ar com outro endereço, e trocá-lo agora quebraria os links que apontam para ele. Salve o texto mantendo o endereço atual.",
      detalhe:
        `troca de slug recusada em post com estado ${existente.dados.estado} ` +
        `(${existente.dados.slug} → ${lido.campos.slug}); a aposentadoria em slugs_antigos é da Story 2.6`,
    });
  }

  /* O AUTOR NÃO ENTRA NO COMANDO DE ATUALIZAÇÃO.
     Não é esquecimento: é a metade do critério de aceite que se perde em
     implementação distraída. Revisar o texto de alguém não pode transferir a
     autoria, então `autor_id` e `autor_nome` simplesmente não são tocados —
     ausência é a forma mais forte de "não muda", porque não há valor a
     calcular errado. `estado` fica fora pelo mesmo mecanismo: salvar não é
     transição, e transição é da Story 2.8. */
  const alteracao = { titulo: lido.campos.titulo, ...conteudo };
  if (lido.campos.slug !== undefined) alteracao.slug = lido.campos.slug;
  if (lido.campos.resumo !== undefined) alteracao.resumo = lido.campos.resumo;

  const escrita = await acesso.atualizarPost(id, alteracao);
  if (!escrita.ok) return falhaDaEscrita(escrita, "atualização do post");
  if (escrita.dados === null) {
    // A leitura acima achou a linha e o PATCH não: alguém apagou o Post entre
    // as duas chamadas. É ausência, não defeito.
    return falha(ERRO_NAO_ENCONTRADO, {
      detalhe: `o post ${id} desapareceu entre a leitura e a gravação`,
    });
  }
  return sucesso({ post: escrita.dados, criado: false, lido, derivado });
}

/** Falha de uma chamada de escrita, já classificada e com frase certa. */
function falhaDaEscrita(resultado, oQue) {
  const tipo = classificar(resultado);
  return falha(tipo, {
    mensagem:
      tipo === ERRO_DADOS_INVALIDOS ? mensagemDeRecusaDoBanco(resultado) : "",
    detalhe: detalhar(resultado, oQue),
    codigo: resultado.codigo,
    status: resultado.status,
  });
}

/**
 * O Autor de um Post NOVO, resolvido no servidor.
 *
 * O nome vem do perfil da Conta autenticada, sem digitação. Se ele viesse do
 * cliente, qualquer detentor de sessão assinaria um Post com o nome de outra
 * pessoa — e é por isso que `autor_nome` está na lista de campos ignorados.
 *
 * ─── O PERFIL É EXIGIDO, e é a única autorização que existe aqui ────────────
 *
 * Autenticar não é autorizar: um token válido, por si, só diz que existe uma
 * Conta. A versão anterior aceitava Conta SEM perfil e gravava com `autor_id`
 * nulo — um Post sem autoria rastreável, escrito por alguém que o Painel nunca
 * cadastrou. A barreira que sobrava era o registro público estar fechado, que é
 * configuração de projeto e não código: uma mudança de configuração passaria a
 * permitir escrita sem que uma linha de código mudasse.
 *
 * Ter perfil é o que significa "estar cadastrado no Painel": o gatilho
 * `on_auth_user_created` da Story 1.2 o cria junto da Conta, e `conta:criar`
 * falha alto se ele não nascer. Conta sem perfil é, portanto, uma das duas
 * coisas: gatilho que falhou (defeito a investigar) ou Conta que entrou por
 * fora do onboarding. Nenhuma das duas deve assinar um artigo publicado.
 */
async function resolverAutor({ acesso, conta }) {
  const perfil = await acesso.perfilDaConta(conta.id);
  if (!perfil.ok) {
    /* Não adivinhar. O critério de aceite diz que o Autor é a Conta
       autenticada; gravar um Post assinado por palpite porque a leitura do
       nome falhou seria cumprir a letra e quebrar o sentido. */
    return falhaDaEscrita(perfil, "leitura do perfil da Conta");
  }
  if (perfil.dados === null) {
    return falha(ERRO_PERMISSAO, {
      mensagem:
        "Esta conta não está cadastrada no Painel, então não pode assinar um post. Avise quem cuida das contas.",
      detalhe: `conta ${conta.id} autenticada mas sem linha em public.perfis`,
    });
  }

  const doPerfil = texto(perfil.dados.nome_exibicao);
  const dosMetadados = texto(conta.user_metadata?.nome_exibicao);
  const doEmail = texto(conta.email);

  return {
    ok: true,
    autor_id: conta.id,
    autor_nome: doPerfil || dosMetadados || doEmail || "",
  };
}

/**
 * Sucesso.
 *
 * `ignorados` e o relatório de descartes viajam junto porque a tela precisa
 * poder dizer "o que você mandou em `conteudo_html` foi ignorado" e "a tabela
 * colada foi removida" — conteúdo que some sem aviso vira perda permanente.
 */
function sucesso({ post, criado, lido, derivado }) {
  return Object.freeze({
    ok: true,
    dados: Object.freeze({
      post,
      criado,
      ignorados: Object.freeze([...lido.ignorados]),
      totalIgnorado: lido.totalIgnorado,
      ignoradosTruncados: lido.ignoradosTruncados,
      totalDescartado: derivado.totalDescartado,
      totalSaneado: derivado.totalSaneado,
      descartados: derivado.descartados,
      descartadosTruncados: derivado.descartadosTruncados,
    }),
  });
}
