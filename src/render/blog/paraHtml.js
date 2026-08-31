/**
 * O renderizador ÚNICO de documento para HTML fora do Editor (AD-2).
 *
 * Este é o único caminho de JSON para HTML no projeto. Dentro do Editor a
 * renderização ao vivo é a única exceção, e é segura porque compartilha a mesma
 * definição de nós e marcas — o schema fechado de `domain/blog`. Nenhum outro
 * parser ou conversor existe aqui, e o parser artesanal do site público é
 * removido, não adaptado (Story 2.15).
 *
 * ─── Três invariantes, e a razão de cada uma ────────────────────────────────
 *
 * **1. HTML semântico SEM atributo `class`.** Toda aparência vem da classe
 * global `.artigo` da Story 2.3, que estiliza descendentes por nome de
 * elemento. Emitir `class` aqui obrigaria a classe a existir no CSS compilado —
 * e classe gerada em tempo de execução nunca chega ao compilador do Tailwind,
 * então ela sairia sem estilo. O `language` do bloco de código, que a
 * convenção costuma pôr em `class="language-x"`, sai em `data-linguagem`.
 *
 * **2. Nenhum atributo é copiado do documento.** Cada elemento monta a sua
 * lista fechada de atributos, um por um, a partir do que o schema declara. Um
 * `{...node.attrs}` aqui transformaria o schema numa lista de permissão com uma
 * porta aberta atrás: bastaria um atributo novo passar pela validação para ele
 * chegar ao HTML servido sem ninguém decidir isso.
 *
 * **3. O documento é validado ANTES de ser renderizado.** `derivarHtml` é o
 * caminho que a escrita usa, e ele valida contra o schema — a mesma função que
 * o Editor usa, importada, não uma segunda implementação. Sem isso o
 * renderizador seria uma segunda superfície de confiança sobre entrada de fora.
 *
 * ─── Sobre o subpath ────────────────────────────────────────────────────────
 *
 * `@tiptap/static-renderer/json/html-string` é o caminho que a arquitetura fixa
 * e o que existe no pacote — o citado na documentação (`.../html-string`, sem o
 * `json/`) não é exportado, e importá-lo falha só em tempo de execução.
 *
 * Módulo puro: sem React, sem DOM, sem rede. É por isso que ele pode rodar no
 * servidor, onde a escrita acontece, e na verificação, que o executa.
 */

import {
  escapeHTMLAttribute,
  renderJSONContentToString,
} from "@tiptap/static-renderer/json/html-string";

import {
  ALINHAMENTOS_DE_TEXTO,
  ALVOS_DE_LINK,
  CORES_DE_DESTAQUE,
  enderecoDeImagemPermitido,
  enderecoPermitido,
  NIVEIS_DE_TITULO,
  RELACOES_DE_LINK,
  TIPOS_DE_LISTA_ORDENADA,
  validarDocumento,
} from "../../domain/blog/schema.js";

/* ─── Peças de serialização ──────────────────────────────────────────────── */

/**
 * Junta o que os filhos produziram. O renderizador entrega `children` como
 * string ou lista de strings, dependendo do nó; `[].concat` normaliza os dois
 * sem ramificar.
 */
function juntar(filhos) {
  return []
    .concat(filhos ?? "")
    .filter((pedaco) => typeof pedaco === "string" && pedaco !== "")
    .join("");
}

/**
 * Um atributo, escapado para dentro de aspas duplas.
 *
 * `escapeHTMLAttribute` cobre `&`, `<`, `>` e `"`. A aspa simples fica de fora
 * e não faz falta porque TODO atributo daqui sai entre aspas duplas — e sai
 * porque esta é a única função que os emite.
 */
function atributo(nome, valor) {
  return ` ${nome}="${escapeHTMLAttribute(String(valor))}"`;
}

/**
 * `data-alinhamento`, para `paragraph` e `heading` — os dois nós em que o
 * schema declara `textAlign` (`domain/blog/schema.js`).
 *
 * Omitido quando o alinhamento é `left`: é o `defaultAlignment` da extensão
 * do Tiptap, então TODO parágrafo carrega o atributo com esse valor — emiti-lo
 * sempre poluiria cada `<p>` do artigo com um atributo que não diz nada.
 * Mesma disciplina de `orderedList.start`/`type`, logo abaixo: omitir o caso
 * comum.
 */
function alinhamentoEmitido(valor) {
  return ALINHAMENTOS_DE_TEXTO.includes(valor) && valor !== "left"
    ? atributo("data-alinhamento", valor)
    : "";
}

/**
 * Texto do documento, escapado para dentro de conteúdo de elemento.
 *
 * `escapeHTML` da biblioteca cobre `&`, `<` e `>` — o suficiente para o
 * navegador. Aqui a aspa dupla também sai, e a razão não é a renderização: é a
 * restrição do banco.
 *
 * A restrição precisa saber, sobre um valor que pode ter vindo do console, onde
 * termina um valor de atributo. Ela faz isso emparelhando aspas duplas. Com
 * aspa crua permitida no texto, um trecho com aspas desemparelhadas fazia o
 * emparelhamento escorregar e ENGOLIR uma etiqueta inteira — verificado:
 * `<p>a"</p><a href="javascript:1">"b</p>` atravessava a restrição. Escapando
 * aqui, a saída canônica tem uma propriedade que a restrição pode exigir e
 * conferir: **aspa dupla só existe delimitando valor de atributo**.
 *
 * O texto renderiza idêntico: `&quot;` é a aspa que o leitor vê.
 */
function escaparTexto(valor) {
  return escapeHTMLAttribute(String(valor));
}

/* ─── Os nós ─────────────────────────────────────────────────────────────── */

/**
 * Um handler por nó do schema. A chave é o nome do nó no documento; nó que o
 * schema conhece e que não estivesse aqui cairia em `unhandledNode` e sumiria do
 * HTML servido **em silêncio**. As chaves saem em `NOS_RENDERIZADOS`, mais
 * abaixo, e a verificação as compara com `NOS_PERMITIDOS` do schema por
 * igualdade nos dois sentidos — é o que torna essa frase verdadeira em vez de
 * pretendida.
 */
const NOS = Object.freeze({
  // A raiz não tem elemento próprio: o invólucro é `.artigo`, de quem monta a
  // página. Emitir um `<article>` aqui daria ao HTML derivado uma opinião sobre
  // a estrutura da página que ele não tem como ter.
  doc: ({ children }) => juntar(children),

  paragraph: ({ node, children }) => {
    const alinhamento = alinhamentoEmitido(node?.attrs?.textAlign);
    return `<p${alinhamento}>${juntar(children)}</p>`;
  },

  heading: ({ node, children }) => {
    /* O nível vem do schema, não do documento: um `level` fora da lista já
       teria derrubado o nó na validação, e o piso existe para que este arquivo
       nunca possa emitir `<hundefined>` nem — o caso que importa — um `h1`. */
    const nivel = NIVEIS_DE_TITULO.includes(node?.attrs?.level)
      ? node.attrs.level
      : NIVEIS_DE_TITULO[0];
    const alinhamento = alinhamentoEmitido(node?.attrs?.textAlign);
    return `<h${nivel}${alinhamento}>${juntar(children)}</h${nivel}>`;
  },

  blockquote: ({ children }) => `<blockquote>${juntar(children)}</blockquote>`,

  bulletList: ({ children }) => `<ul>${juntar(children)}</ul>`,

  orderedList: ({ node, children }) => {
    const attrs = node?.attrs ?? {};
    /* `start` só é emitido quando diz algo: `start="1"` é o padrão do HTML e
       poluiria todo artigo. `type` vem da lista fechada do schema — declarada
       lá e importada aqui, para não existir uma segunda cópia. */
    const inicio =
      Number.isInteger(attrs.start) && attrs.start !== 1
        ? atributo("start", attrs.start)
        : "";
    const tipo = TIPOS_DE_LISTA_ORDENADA.includes(attrs.type)
      ? atributo("type", attrs.type)
      : "";
    return `<ol${inicio}${tipo}>${juntar(children)}</ol>`;
  },

  listItem: ({ children }) => `<li>${juntar(children)}</li>`,

  codeBlock: ({ node, children }) => {
    /* `tabindex` no bloco rolável: o CSS da Story 2.3 já tem o indicador de
       foco pronto e registra que o atributo tem de vir do renderizador. Sem
       ele, quem navega por teclado não alcança o fim de uma linha longa
       (WCAG 2.1.1) no Chrome, que não dá foco a contêiner rolável sozinho.

       A linguagem vai em `data-linguagem`, e não em `class="language-x"`,
       porque este renderizador não emite `class`. O valor já foi restringido
       pelo schema — string livre aqui viraria atributo no HTML servido. */
    const linguagem =
      typeof node?.attrs?.language === "string" && node.attrs.language !== ""
        ? atributo("data-linguagem", node.attrs.language)
        : "";
    return `<pre tabindex="0"><code${linguagem}>${juntar(children)}</code></pre>`;
  },

  horizontalRule: () => "<hr>",
  hardBreak: () => "<br>",

  text: ({ node }) => escaparTexto(node?.text ?? ""),

  /**
   * A imagem inline do corpo. Nó atômico — `children` não existe, como
   * `horizontalRule`. `src` já passou por `enderecoDeImagemPermitido` na
   * validação (`domain/blog/schema.js`), mas a conferência é repetida aqui
   * pela MESMA razão que a marca `link` repete `enderecoPermitido`:
   * `htmlDoDocumento` é exportado, e alguém pode chamá-lo com um documento
   * que não passou pela validação. Endereço recusado faz a imagem inteira
   * desaparecer — não há `<img>` sem `src` aceitável, ao contrário do link,
   * que ainda tem TEXTO para mostrar sem a marca.
   *
   * Sem `class`: quem estiliza é `.artigo img`, no CSS global.
   */
  image: ({ node }) => {
    const attrs = node?.attrs ?? {};
    /* `enderecoDeImagemPermitido` aceita `null`/`undefined` — é a regra
       PARTILHADA com `imagem_url`/`seo_imagem_url`, onde ausência é "sem
       capa", legítimo. Para `NOS.image` não é: uma imagem sem `src` não é
       imagem, e a checagem sozinha deixaria passar `attrs.src` ausente para
       virar `<img src="undefined">` — o `typeof` aqui é o que faz a exigência
       de PRESENÇA valer também neste handler, e não só em `atributosObrigatorios`
       do validador (que um documento não revalidado pode não ter passado). */
    if (typeof attrs.src !== "string" || attrs.src.trim() === "") return "";
    if (!enderecoDeImagemPermitido(attrs.src)) return "";
    /* `alt` sempre sai, mesmo vazio: um `<img>` SEM o atributo faz leitor de
       tela anunciar o nome do arquivo como conteúdo — pior que declarar a
       imagem decorativa com `alt=""`. `title`, ao contrário, só sai quando
       tem algo a dizer, porque a ausência dele não confunde ninguém. */
    let tag = `<img${atributo("src", String(attrs.src).trim())}`;
    tag += atributo("alt", typeof attrs.alt === "string" ? attrs.alt : "");
    if (typeof attrs.title === "string" && attrs.title !== "") {
      tag += atributo("title", attrs.title);
    }
    /* A LARGURA SAI COMO ATRIBUTO `width`, e nunca como `style`: atributo de
       estilo não existe no vocabulário emitido por este arquivo, e abrir
       exceção para ele aqui abriria para todo o resto. `width` é atributo de
       HTML de verdade, e o CSS (`height: auto` em `.artigo img`) preserva a
       proporção sozinho a partir dele.

       A conferência é repetida — como em `src` e em `highlight` — porque
       `htmlDoDocumento` é exportado e pode receber documento que não passou
       pela validação. Largura fora da faixa simplesmente não sai, e a imagem
       volta a ocupar a medida do texto. */
    if (Number.isInteger(attrs.width) && attrs.width >= 80 && attrs.width <= 1600) {
      tag += atributo("width", String(attrs.width));
    }
    return `${tag}>`;
  },
});

/* ─── As marcas ──────────────────────────────────────────────────────────── */

/** Filtra `rel` às palavras que o schema conhece, sem repetição e na ordem. */
function relacoes(valor) {
  if (typeof valor !== "string") return [];
  return [
    ...new Set(
      valor
        .split(/\s+/u)
        .map((palavra) => palavra.toLowerCase())
        .filter((palavra) => RELACOES_DE_LINK.includes(palavra)),
    ),
  ];
}

/**
 * As palavras de `rel` sem as quais nova janela é perigosa.
 *
 * São duas, e não as três de `RELACAO_DE_NOVA_JANELA`: `noopener` e `noreferrer`
 * são segurança — sem `noopener` a página aberta recebe `window.opener` e
 * reescreve a aba de origem. `nofollow` é decisão de SEO, e impor decisão de SEO
 * a todo link externo não é papel de um renderizador.
 */
const RELACOES_OBRIGATORIAS_EM_NOVA_JANELA = Object.freeze(["noopener", "noreferrer"]);

const MARCAS = Object.freeze({
  bold: ({ children }) => `<strong>${juntar(children)}</strong>`,
  italic: ({ children }) => `<em>${juntar(children)}</em>`,

  /**
   * O destaque de cor. `cor` já passou por `umDentre(CORES_DE_DESTAQUE)` na
   * validação, mas a conferência é repetida aqui pela MESMA razão que vale
   * para `link`: `htmlDoDocumento` é exportado, e nada garante que quem o
   * chama passou pelo validador primeiro. Cor fora da lista faz a MARCA
   * cair — o texto continua, sem destaque, como um link com endereço ruim.
   *
   * Sem `style`: a aparência de cada cor mora em `.artigo mark[data-cor="…"]`,
   * no CSS global — nunca um valor livre que o Autor escolheu.
   */
  highlight: ({ mark, children }) => {
    const texto = juntar(children);
    const cor = mark?.attrs?.cor;
    if (!CORES_DE_DESTAQUE.includes(cor)) return texto;
    return `<mark${atributo("data-cor", cor)}>${texto}</mark>`;
  },

  link: ({ mark, children }) => {
    const attrs = mark?.attrs ?? {};
    const texto = juntar(children);
    /* Endereço recusado NÃO derruba o texto: a marca cai e o trecho continua
       legível — a mesma decisão que a validação toma, tomada de novo aqui
       porque `htmlDoDocumento` é exportado e alguém pode chamá-lo com um
       documento que não passou por ela. */
    if (!enderecoPermitido(attrs.href)) return texto;

    const alvo = ALVOS_DE_LINK.includes(attrs.target) ? attrs.target : null;
    /* `noopener` e `noreferrer` são ACRESCENTADOS quando o link abre em nova
       janela, não impostos por substituição. A diferença não é cosmética: a
       versão anterior trocava o `rel` inteiro por `RELACAO_DE_NOVA_JANELA`, e
       um link declarado `noopener noreferrer sponsored` — que ATRAVESSA a
       validação inteiro, porque o schema só completa quando falta segurança —
       saía sem `sponsored`. Uma decisão de SEO do Autor desaparecia, e o
       `nofollow` dele entrava no lugar. Agora o que ele declarou fica, e só o
       que falta de segurança é somado. */
    const declaradas = relacoes(attrs.rel);
    const rel = (
      alvo === "_blank"
        ? [
            ...declaradas,
            ...RELACOES_OBRIGATORIAS_EM_NOVA_JANELA.filter((p) => !declaradas.includes(p)),
          ]
        : declaradas
    ).join(" ");

    let abertura = `<a${atributo("href", String(attrs.href).trim())}`;
    if (alvo !== null) abertura += atributo("target", alvo);
    if (rel !== "") abertura += atributo("rel", rel);
    if (typeof attrs.title === "string" && attrs.title !== "") {
      abertura += atributo("title", attrs.title);
    }
    return `${abertura}>${texto}</a>`;
  },
});

/* ─── Os elementos que este renderizador pode emitir ─────────────────────── */

/**
 * O vocabulário de saída, declarado.
 *
 * Existe para ser COMPARADO: a restrição do banco (Story 2.5) mantém a mesma
 * lista de etiquetas permitidas em `conteudo_html`, e a verificação afere as
 * duas contra o HTML que este arquivo realmente produz. Uma lista declarada e
 * nunca conferida seria só um comentário com sintaxe.
 */
export const ETIQUETAS_EMITIDAS = Object.freeze([
  "p",
  "h2",
  "h3",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "a",
  "blockquote",
  "pre",
  "code",
  "hr",
  "br",
  "img",
  "mark",
]);

/**
 * Os NOMES DE ATRIBUTO que este renderizador pode emitir.
 *
 * Existe pela mesma razão que a lista acima, e é a metade que faltava: a
 * restrição do banco precisava passar de lista de PROIBIÇÃO de padrões
 * (`on[a-z]+=`, `javascript:`) para lista de PERMISSÃO de nomes. Enquanto era
 * proibição, `<a/onclick=` passava — barra é separador de atributo válido em
 * HTML — e `style="position:fixed;inset:0"` passava porque `style` não estava
 * proibido. Nome de atributo é lista fechada, como nó e marca.
 */
export const ATRIBUTOS_EMITIDOS = Object.freeze([
  "href",
  "target",
  "rel",
  "title",
  "start",
  "type",
  "tabindex",
  "data-linguagem",
  "data-alinhamento",
  "src",
  "alt",
  "data-cor",
  "width",
]);

/**
 * Os nós e as marcas para os quais existe handler AQUI.
 *
 * Exportados para serem COMPARADOS com `NOS_PERMITIDOS` e `MARCAS_PERMITIDAS`
 * do schema. Sem isso, o cabeçalho deste arquivo prometia uma conferência que
 * não existia: um nó novo no schema sem handler correspondente cairia em
 * `unhandledNode` e desapareceria do HTML servido em silêncio.
 */
export const NOS_RENDERIZADOS = Object.freeze(Object.keys(NOS));
export const MARCAS_RENDERIZADAS = Object.freeze(Object.keys(MARCAS));

/* ─── O renderizador ─────────────────────────────────────────────────────── */

const renderizar = renderJSONContentToString({
  nodeMapping: { ...NOS },
  markMapping: { ...MARCAS },
  /* Nó ou marca sem handler não pode derrubar a renderização: o elemento cai e
     o conteúdo dele sobrevive, que é exatamente o que a validação faz. Com o
     documento validado antes, isto é inalcançável — e é por isso que ele não
     lança: um caminho inalcançável que lança é um caminho que derruba a
     gravação no dia em que alguém o alcançar. */
  unhandledNode: ({ children }) => juntar(children),
  unhandledMark: ({ children }) => juntar(children),
});

/**
 * O HTML de um documento **já validado**.
 *
 * Exportado para quem já tem o documento saneado em mãos (a pré-visualização
 * da Story 2.13 é o caso). Quem recebe documento de fora usa `derivarHtml`.
 */
export function htmlDoDocumento(documento) {
  return renderizar({ content: documento });
}

/**
 * Valida e deriva: o caminho que a escrita usa.
 *
 * Devolve `{ ok: true, documento, html, ... }` — com `documento` sendo o
 * SANEADO, que é o que precisa ser gravado junto do HTML — ou
 * `{ ok: false, erro }` quando a entrada não é um documento. Nunca lança:
 * exceção que suba daqui derrubaria a função de escrita, e o contrato do
 * projeto é que a exceção vira valor.
 */
export function derivarHtml(entrada) {
  const validado = validarDocumento(entrada);
  if (!validado.ok) return { ok: false, erro: validado.erro };

  let html;
  try {
    html = htmlDoDocumento(validado.documento);
  } catch (excecao) {
    return {
      ok: false,
      erro: {
        mensagem:
          "Não conseguimos preparar a versão publicável deste conteúdo. Tente salvar de novo.",
        detalhe: `o renderizador lançou: ${String(excecao?.message ?? excecao)}`,
      },
    };
  }

  return {
    ok: true,
    documento: validado.documento,
    html,
    descartados: validado.descartados,
    totalDescartado: validado.totalDescartado,
    totalSaneado: validado.totalSaneado,
    descartadosTruncados: validado.descartadosTruncados,
  };
}
