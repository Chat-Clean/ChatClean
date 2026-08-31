/**
 * O schema fechado do conteúdo do Post — a lista de permissão, declarada UMA vez.
 *
 * Domínio puro (AD-1): nenhuma dependência de React, de Tiptap, de Supabase ou
 * de DOM. É importável e executável fora do navegador, e é por isso que ele
 * nasce aqui e não dentro do componente do Editor.
 *
 * **Por que aqui e não na configuração do Editor.** Se a lista de elementos
 * vivesse dentro do componente React, ela só existiria no navegador — e a
 * Story 2.5, que valida no servidor antes de gravar, teria de reescrevê-la.
 * Duas listas divergem: é a premissa que AD-4 existe para eliminar. Declarada
 * em `domain/blog`, a MESMA lista serve o Editor (que deriva a barra dela), o
 * servidor (que valida contra ela) e a verificação (que a executa).
 *
 * Três coisas moram neste arquivo, e nenhuma delas em outro lugar:
 *
 *   `ELEMENTOS`         — os treze elementos que o Autor pode aplicar, na ordem
 *                         em que a barra os oferece. É a fonte da derivação:
 *                         acrescentar aqui faz o controle aparecer lá.
 *   `NOS` / `MARCAS`    — a forma de cada nó e de cada marca do documento,
 *                         incluindo os estruturais que não têm controle
 *                         (`doc`, `paragraph`, `text`, `listItem`, `hardBreak`).
 *   `validarDocumento`  — percorrer o documento descartando o que está fora
 *                         desta lista **é** a higienização. Não existe filtro
 *                         de HTML por string em lugar nenhum do projeto.
 *
 * **`h1` não existe aqui.** O título do Post é da página; um artigo com `h1`
 * próprio produziria dois por página — o defeito que o site tem hoje e que a
 * Story 2.3 registra ao recusar estilizá-lo. `heading` só aceita nível 2 e 3, e
 * nível 1 é descartado como qualquer outro nó fora da lista.
 */

/* ─── Espécies ───────────────────────────────────────────────────────────── */

/** Nó: existe na árvore do documento (parágrafo, título, lista). */
export const NO = "no";
/** Marca: veste um trecho de texto (negrito, itálico, link). */
export const MARCA = "marca";

/**
 * O que o controle faz com o que está selecionado.
 *
 * `ALTERNA` liga e desliga: o elemento passa a ter estado ativo, e o texto
 * selecionado continua existindo depois. `INSERE` acrescenta algo novo no
 * lugar do cursor e não tem estado ativo nenhum — cobrar "ativo" de uma linha
 * divisória seria inventar um requisito, e anunciá-lo na barra seria mentir.
 */
export const ALTERNA = "alterna";
export const INSERE = "insere";

/** Os níveis de título que o schema conhece. `1` está fora de propósito. */
export const NIVEIS_DE_TITULO = Object.freeze([2, 3]);

/**
 * Os três alinhamentos de texto que o schema conhece. `justify` está fora de
 * propósito — a story pede esquerda, centro e direita, na convenção de Word.
 *
 * Exportado, e não escrito à mão em `configuracao.js`: é a MESMA lista que
 * configura a extensão do Tiptap e que valida o atributo aqui embaixo, em
 * `NOS.paragraph`/`NOS.heading` — uma segunda cópia divergiria na primeira
 * mudança.
 */
export const ALINHAMENTOS_DE_TEXTO = Object.freeze(["left", "center", "right"]);

/**
 * As cores de destaque que o schema conhece. Vocabulário FECHADO — o mesmo
 * padrão de `ALINHAMENTOS_DE_TEXTO`: um nome, nunca um valor CSS livre nem um
 * hexadecimal escolhido pelo Autor. `MARCAS.highlight`, abaixo, só aceita
 * `cor` de dentro desta lista; o que sai daqui é um NOME, e é o nome que vira
 * `data-cor="…"` no HTML derivado (`render/blog/paraHtml.js`) — a aparência de
 * cada nome mora no CSS (`.artigo mark[data-cor="…"]`), nunca no documento.
 *
 * Exportada, e não escrita à mão em `configuracao.js` nem no componente da
 * barra flutuante: é a MESMA lista que valida o atributo aqui embaixo e que
 * alimenta o seletor de cor do Editor — uma segunda cópia divergiria na
 * primeira cor nova.
 */
export const CORES_DE_DESTAQUE = Object.freeze(["amarelo", "verde", "azul", "rosa"]);

/* ─── Os treze elementos, na ordem em que a barra os oferece ─────────────── */

/**
 * Cada entrada carrega tudo o que um controle precisa saber, e nada além:
 *
 *   `chave`       identidade estável — chaveia o ícone e a asserção;
 *   `especie`     `NO` ou `MARCA`;
 *   `nome`        o nome do nó ou da marca no documento;
 *   `atributos`   o que distingue este elemento de outro do mesmo nome
 *                 (título 2 e título 3 são o mesmo nó com `level` diferente);
 *   `rotulo`      o que o controle diz — a palavra que o Autor lê;
 *   `faz`         a frase de ajuda: o controle diz exatamente o que fará;
 *   `comando`     o comando do editor, pelo nome;
 *   `acao`        `ALTERNA` (liga/desliga, tem estado ativo) ou `INSERE`
 *                 (acrescenta no cursor, não tem estado ativo);
 *   `argumentos`  o que vai junto do comando;
 *   `pede`        o dado que falta para o comando rodar (só o link tem);
 *   `atalho`      a combinação de teclas, na notação do editor, ou `null`.
 *
 * A ordem é significativa: é a ordem da barra. Mudar aqui muda lá, e não há
 * um segundo lugar onde a ordem esteja escrita.
 */
export const ELEMENTOS = Object.freeze([
  Object.freeze({
    chave: "titulo2",
    especie: NO,
    nome: "heading",
    atributos: Object.freeze({ level: 2 }),
    rotulo: "Título 2",
    faz: "Transforma a linha em título de seção.",
    comando: "toggleHeading",
    acao: ALTERNA,
    argumentos: Object.freeze([Object.freeze({ level: 2 })]),
    pede: null,
    atalho: "Mod-Alt-2",
  }),
  Object.freeze({
    chave: "titulo3",
    especie: NO,
    nome: "heading",
    atributos: Object.freeze({ level: 3 }),
    rotulo: "Título 3",
    faz: "Transforma a linha em subtítulo, dentro de uma seção.",
    comando: "toggleHeading",
    acao: ALTERNA,
    argumentos: Object.freeze([Object.freeze({ level: 3 })]),
    pede: null,
    atalho: "Mod-Alt-3",
  }),
  Object.freeze({
    chave: "negrito",
    especie: MARCA,
    nome: "bold",
    atributos: null,
    rotulo: "Negrito",
    faz: "Destaca o trecho selecionado em negrito.",
    comando: "toggleBold",
    acao: ALTERNA,
    argumentos: Object.freeze([]),
    pede: null,
    atalho: "Mod-b",
  }),
  Object.freeze({
    chave: "italico",
    especie: MARCA,
    nome: "italic",
    atributos: null,
    rotulo: "Itálico",
    faz: "Destaca o trecho selecionado em itálico.",
    comando: "toggleItalic",
    acao: ALTERNA,
    argumentos: Object.freeze([]),
    pede: null,
    atalho: "Mod-i",
  }),
  Object.freeze({
    chave: "listaOrdenada",
    especie: NO,
    nome: "orderedList",
    atributos: null,
    rotulo: "Lista numerada",
    faz: "Transforma as linhas em lista numerada.",
    comando: "toggleOrderedList",
    acao: ALTERNA,
    argumentos: Object.freeze([]),
    pede: null,
    atalho: "Mod-Shift-7",
  }),
  Object.freeze({
    chave: "listaComMarcadores",
    especie: NO,
    nome: "bulletList",
    atributos: null,
    rotulo: "Lista com marcadores",
    faz: "Transforma as linhas em lista com marcadores.",
    comando: "toggleBulletList",
    acao: ALTERNA,
    argumentos: Object.freeze([]),
    pede: null,
    atalho: "Mod-Shift-8",
  }),
  Object.freeze({
    chave: "link",
    especie: MARCA,
    nome: "link",
    atributos: null,
    rotulo: "Link",
    faz: "Aponta o trecho selecionado para um endereço.",
    comando: "toggleLink",
    acao: ALTERNA,
    argumentos: Object.freeze([]),
    // O único elemento que precisa de um dado do Autor para existir. O controle
    // pede, a barra mostra o campo, e nada disso é escrito por elemento.
    pede: Object.freeze({
      propriedade: "href",
      rotulo: "Endereço do link",
      exemplo: "https://exemplo.com.br/pagina",
      // Quando o trecho já é link, o mesmo controle o remove.
      comandoDeRemocao: "unsetLink",
      /* As duas recusas moram AQUI, e não no componente, pelo mesmo motivo que
         o rótulo e o exemplo: a barra é genérica, e uma frase sobre `https://`
         escrita dentro dela seria conhecimento de link vazando para um lugar
         que não deve saber o que é um link. São duas porque são causas
         diferentes — dizer "endereço inválido" quando o endereço está certo e
         o problema é o lugar manda o Autor consertar o que não está quebrado. */
      recusaDeFormato: (valor) =>
        `Não reconhecemos "${valor}" como endereço. Use um endereço que comece com ` +
        `https://, com uma barra (/blog) ou com #. Não use barra invertida.`,
      recusaDeContexto:
        "Não dá para aplicar link aqui. Bloco de código e linha divisória não " +
        "aceitam link: posicione o cursor num parágrafo, título ou item de lista.",
    }),
    atalho: null,
  }),
  Object.freeze({
    chave: "citacao",
    especie: NO,
    nome: "blockquote",
    atributos: null,
    rotulo: "Citação",
    faz: "Recua o bloco como citação.",
    comando: "toggleBlockquote",
    acao: ALTERNA,
    argumentos: Object.freeze([]),
    pede: null,
    atalho: "Mod-Shift-b",
  }),
  Object.freeze({
    chave: "blocoDeCodigo",
    especie: NO,
    nome: "codeBlock",
    atributos: null,
    rotulo: "Bloco de código",
    faz: "Transforma o bloco em código, em pilha monoespaçada.",
    comando: "toggleCodeBlock",
    acao: ALTERNA,
    argumentos: Object.freeze([]),
    pede: null,
    atalho: "Mod-Alt-c",
  }),
  Object.freeze({
    chave: "linhaDivisoria",
    especie: NO,
    nome: "horizontalRule",
    atributos: null,
    rotulo: "Linha divisória",
    faz: "Insere uma linha divisória entre dois blocos.",
    comando: "setHorizontalRule",
    acao: INSERE,
    argumentos: Object.freeze([]),
    pede: null,
    atalho: null,
  }),
  /* ─── OS TRÊS DE ALINHAMENTO ────────────────────────────────────────────
     `especie: NO` porque o atributo mora num nó (`textAlign`, em `paragraph`
     e `heading`) — mas `nome: null`, e não `"paragraph"` nem `"heading"`: o
     alinhamento não troca o TIPO do nó, então travar num nome faria o botão
     acender só na metade dos blocos onde ele de fato se aplica. É `nome:
     null` — e não `especie: "atributo"`, categoria que este schema nunca
     teve — que diz a `estaAtivo` (`configuracao.js`) para consultar
     `editor.isActive(atributos)` sem nome de nó travado, em vez de
     `editor.isActive(nome, atributos)`.

     `esquerda` é o `defaultAlignment` da extensão: todo parágrafo e todo
     título JÁ NASCEM alinhados à esquerda, então o botão começa aceso sem
     que o Autor tenha clicado nada — é o único elemento desta lista em que
     "ativo desde o início" é o comportamento certo, não um defeito. */
  Object.freeze({
    chave: "alinharEsquerda",
    especie: NO,
    nome: null,
    atributos: Object.freeze({ textAlign: "left" }),
    rotulo: "Alinhar à esquerda",
    faz: "Alinha o parágrafo ou o título à esquerda.",
    comando: "setTextAlign",
    acao: ALTERNA,
    argumentos: Object.freeze(["left"]),
    pede: null,
    atalho: null,
  }),
  Object.freeze({
    chave: "alinharCentro",
    especie: NO,
    nome: null,
    atributos: Object.freeze({ textAlign: "center" }),
    rotulo: "Centralizar",
    faz: "Centraliza o parágrafo ou o título.",
    comando: "setTextAlign",
    acao: ALTERNA,
    argumentos: Object.freeze(["center"]),
    pede: null,
    atalho: null,
  }),
  Object.freeze({
    chave: "alinharDireita",
    especie: NO,
    nome: null,
    atributos: Object.freeze({ textAlign: "right" }),
    rotulo: "Alinhar à direita",
    faz: "Alinha o parágrafo ou o título à direita.",
    comando: "setTextAlign",
    acao: ALTERNA,
    argumentos: Object.freeze(["right"]),
    pede: null,
    atalho: null,
  }),
]);

/* ─── A forma do documento ───────────────────────────────────────────────── */

/**
 * Os nós que não têm controle na barra porque não são escolha do Autor: eles
 * são a estrutura em que tudo o mais assenta. Estão no schema — não seriam
 * descartáveis — mas nunca viram botão.
 */
export const NOS_ESTRUTURAIS = Object.freeze([
  "doc",
  "paragraph",
  "text",
  "listItem",
  "hardBreak",
]);

/**
 * Os cinco valores que o HTML define para `type` de lista ordenada.
 *
 * Exportado, e não escrito dentro do validador, porque o renderizador único da
 * Story 2.5 precisa da MESMA lista para decidir se emite o atributo. Uma
 * segunda cópia lá seria a divergência que este arquivo existe para eliminar.
 */
export const TIPOS_DE_LISTA_ORDENADA = Object.freeze(["1", "a", "A", "i", "I"]);

/**
 * Os nós que podem aparecer onde um bloco cabe.
 *
 * `image` entra aqui, e não em `INLINE`: o nó vem do
 * `@tiptap/extension-image` configurado com `inline: false` (o padrão do
 * pacote), no mesmo nível de `horizontalRule` — pode aparecer no topo do
 * documento, dentro de uma citação ou de um item de lista, nunca no meio de
 * uma linha de texto.
 */
const BLOCOS = Object.freeze([
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "codeBlock",
  "horizontalRule",
  "image",
]);

/** O que pode aparecer dentro de uma linha de texto. */
const INLINE = Object.freeze(["text", "hardBreak"]);

/**
 * Validadores de atributo. Cada um devolve o valor aceito ou `undefined` para
 * dizer "este atributo não passa" — e o atributo some sem derrubar o nó.
 */
function inteiroEntre(minimo, maximo) {
  return (valor) =>
    Number.isInteger(valor) && valor >= minimo && valor <= maximo
      ? valor
      : undefined;
}

function umDentre(lista) {
  return (valor) => (lista.includes(valor) ? valor : undefined);
}

/**
 * O alinhamento de texto de um parágrafo ou título.
 *
 * `null`/`undefined` passam como `null` — um documento de fora de que nunca
 * ouviu falar de alinhamento continua abrindo, sem o atributo. O que sai da
 * lista fechada (`ALINHAMENTOS_DE_TEXTO`) some, como qualquer atributo fora
 * do vocabulário.
 */
function alinhamentoDeTexto(valor) {
  if (valor === null || valor === undefined) return null;
  return ALINHAMENTOS_DE_TEXTO.includes(valor) ? valor : undefined;
}

function textoOuNulo(valor) {
  if (valor === null || valor === undefined) return null;
  return typeof valor === "string" ? valor : undefined;
}

/**
 * A largura escolhida para uma imagem, em pixels — ou `null`.
 *
 * AUSENTE É LEGÍTIMO, e é por isso que esta função existe em vez de um
 * `inteiroEntre(80, 1600)` seco: imagem que ninguém redimensionou não tem
 * largura, e o Tiptap declara `width: null` em toda imagem que ele analisa.
 * Com o `inteiroEntre` sozinho, esse `null` era DESCARTADO — e descarte é
 * registrado, então colar uma imagem de fora passava a acusar perda de
 * conteúdo que não houve. Mesma disciplina de `textoOuNulo`, acima.
 *
 * Valor fora da faixa continua sumindo: é a diferença entre "não escolheram
 * largura" e "escolheram uma que o vocabulário não aceita".
 */
function larguraDaImagem(valor) {
  if (valor === null || valor === undefined) return null;
  return Number.isInteger(valor) && valor >= 80 && valor <= 1600 ? valor : undefined;
}

/**
 * A forma de cada nó: que atributos aceita, que filhos aceita, e se sobrevive
 * ficando vazio.
 *
 * `filhos: null` significa "nenhum filho" (nó atômico). `vazioSobrevive: false`
 * significa que um nó que perdeu todo o conteúdo na higienização vira lixo
 * estrutural e é descartado junto — uma lista sem itens ou um item de lista sem
 * bloco não são documento, são resto.
 */
export const NOS = Object.freeze({
  doc: Object.freeze({
    atributos: Object.freeze({}),
    filhos: BLOCOS,
    vazioSobrevive: true,
  }),
  paragraph: Object.freeze({
    // `textAlign` sobrevive à higienização pela MESMA lista que configura a
    // extensão do Tiptap (`ALINHAMENTOS_DE_TEXTO`) — sem esta entrada, o
    // alinhamento escolhido no Editor seria descartado aqui como qualquer
    // atributo fora do vocabulário, e nunca chegaria ao HTML publicado.
    atributos: Object.freeze({ textAlign: alinhamentoDeTexto }),
    filhos: INLINE,
    vazioSobrevive: true,
  }),
  heading: Object.freeze({
    // É AQUI que `h1` deixa de existir: nível fora da lista não passa, e um
    // título sem nível não é título — o nó inteiro cai.
    atributos: Object.freeze({
      level: umDentre([...NIVEIS_DE_TITULO]),
      textAlign: alinhamentoDeTexto,
    }),
    atributosObrigatorios: Object.freeze(["level"]),
    filhos: INLINE,
    vazioSobrevive: true,
  }),
  blockquote: Object.freeze({
    atributos: Object.freeze({}),
    filhos: BLOCOS,
    vazioSobrevive: false,
  }),
  bulletList: Object.freeze({
    atributos: Object.freeze({}),
    filhos: Object.freeze(["listItem"]),
    vazioSobrevive: false,
  }),
  orderedList: Object.freeze({
    atributos: Object.freeze({
      start: inteiroEntre(0, 1e6),
      // String livre aqui vira atributo no HTML derivado da Story 2.5, e é
      // por isso que a lista é fechada — e declarada uma vez, acima.
      type: (valor) =>
        valor === null || valor === undefined
          ? null
          : TIPOS_DE_LISTA_ORDENADA.includes(valor)
            ? valor
            : undefined,
    }),
    filhos: Object.freeze(["listItem"]),
    vazioSobrevive: false,
  }),
  listItem: Object.freeze({
    atributos: Object.freeze({}),
    filhos: BLOCOS,
    vazioSobrevive: false,
  }),
  codeBlock: Object.freeze({
    atributos: Object.freeze({ language: linguagemDeCodigo }),
    // Dentro do bloco de código só existe texto: marca nenhuma sobrevive, e é
    // por isso que ele não precisa de filtro de HTML — não há o que interpretar.
    filhos: Object.freeze(["text"]),
    vazioSobrevive: true,
  }),
  horizontalRule: Object.freeze({
    atributos: Object.freeze({}),
    filhos: null,
    vazioSobrevive: true,
  }),
  /**
   * A imagem inline do corpo do Post. Nó ATÔMICO (`filhos: null`), como
   * `horizontalRule`: nada é digitado dentro dela.
   *
   * `src` é obrigatório e passa pela MESMA regra que já valida
   * `imagem_url`/`seo_imagem_url` — `enderecoDeImagemPermitido`, declarada
   * acima. `alt`/`title` são texto livre ou ausentes, como `title` de
   * `MARCAS.link`. Sem `width`/`height`: o editor pode produzi-los (o
   * `@tiptap/extension-image` os declara por padrão), mas eles não estão
   * neste vocabulário — somem na higienização como qualquer atributo fora
   * da lista, e nunca chegam ao HTML servido.
   */
  image: Object.freeze({
    atributos: Object.freeze({
      src: enderecoDeImagemDoDocumento,
      alt: textoOuNulo,
      title: textoOuNulo,
      /* A LARGURA ESCOLHIDA PELO AUTOR, em pixels — o que o punho de
         redimensionar grava. Sem ela no vocabulário, redimensionar seria um
         efeito de tela: a higienização descartaria o atributo e a imagem
         voltaria ao tamanho cheio no próximo carregamento.

         Só a LARGURA, e não a altura: a proporção é preservada pelo CSS
         (`height: auto`), e guardar as duas abriria a porta para um par
         inconsistente — uma imagem gravada esticada, que nenhum arrasto
         proporcional consegue produzir.

         O teto é `LARGURA_MAXIMA_DA_IMAGEM_DO_CORPO`, o mesmo da otimização:
         guardar largura maior que a imagem que existe no bucket seria pedir
         ao navegador que a estique. O piso de 80 é o menor tamanho em que
         uma imagem ainda é imagem, e não um ponto na tela. */
      width: larguraDaImagem,
    }),
    atributosObrigatorios: Object.freeze(["src"]),
    filhos: null,
    vazioSobrevive: true,
  }),
  hardBreak: Object.freeze({
    atributos: Object.freeze({}),
    filhos: null,
    vazioSobrevive: true,
  }),
  text: Object.freeze({
    atributos: Object.freeze({}),
    filhos: null,
    vazioSobrevive: false,
    texto: true,
  }),
});

/**
 * Os protocolos que um link pode usar.
 *
 * `javascript:` e `data:` estão fora, e essa é a razão de a checagem morar no
 * domínio e não no componente: a Story 2.5 valida no servidor com esta mesma
 * função, e um link executável que passasse aqui passaria lá.
 */
export const PROTOCOLOS_DE_LINK = Object.freeze([
  "http:",
  "https:",
  "mailto:",
  "tel:",
]);

/**
 * As referências de caractere nomeadas que resolvem para ASCII.
 *
 * Só estas importam, e a razão é decisiva: **nenhuma referência nomeada do HTML
 * resolve para uma letra ou um dígito ASCII**. As letras de `javascript` só
 * podem vir de referência NUMÉRICA, que é decodificada por inteiro logo abaixo.
 * O que as nomeadas conseguem produzir é a pontuação e o espaço em branco — e é
 * exatamente aí que mora a evasão: `javascript&colon;alert(1)` e
 * `java&Tab;script:` são lidos pelo navegador como `javascript:`.
 *
 * A lista é o conjunto ASCII do HTML5, com os sinônimos. Errar por excesso aqui
 * é inofensivo: decodificar a mais no pior caso recusa um endereço estranho.
 * Errar por falta é abrir uma porta.
 */
export const ENTIDADES_ASCII = Object.freeze({
  Tab: "\t",
  NewLine: "\n",
  excl: "!",
  quot: '"',
  QUOT: '"',
  num: "#",
  dollar: "$",
  percnt: "%",
  amp: "&",
  AMP: "&",
  apos: "'",
  lpar: "(",
  rpar: ")",
  ast: "*",
  midast: "*",
  plus: "+",
  comma: ",",
  period: ".",
  sol: "/",
  colon: ":",
  semi: ";",
  lt: "<",
  LT: "<",
  equals: "=",
  gt: ">",
  GT: ">",
  quest: "?",
  commat: "@",
  lsqb: "[",
  lbrack: "[",
  bsol: "\\",
  rsqb: "]",
  rbrack: "]",
  Hat: "^",
  lowbar: "_",
  UnderBar: "_",
  grave: "`",
  DiacriticalGrave: "`",
  lcub: "{",
  lbrace: "{",
  verbar: "|",
  vert: "|",
  VerticalLine: "|",
  rcub: "}",
  rbrace: "}",
  /* `&nbsp;` resolve para ESPAÇO COMUM aqui, e não para U+00A0.
     Duas razões, e a segunda é a que decide. A primeira: o que importa desta
     entidade é que ela é espaço em branco, e é a conferência de espaço que
     recusa o endereço. A segunda: o espelho em SQL precisa produzir a MESMA
     string, e `[[:space:]]` do Postgres depende da localidade do banco para
     reconhecer U+00A0 — mapear para U+0020 faz os dois lados recusarem sem
     depender de configuração. Escrito como espaço literal de propósito: um
     U+00A0 aqui seria invisível na revisão, e foi o que aconteceu na primeira
     versão deste arquivo. */
  nbsp: " ",
  NonBreakingSpace: " ",
});

/**
 * O caractere de um ponto de código, ou um caractere de CONTROLE quando ele não
 * é representável.
 *
 * Ponto de código zero, substituto isolado (`0xD800`–`0xDFFF`) e valor acima do
 * teto do Unicode não têm caractere; devolver **nada** faz o endereço ser
 * recusado pela conferência de controle logo abaixo, em vez de a decodificação
 * lançar ou devolver algo que passe. Falhar fechado.
 */
function caractereDoPonto(ponto) {
  if (!Number.isInteger(ponto) || ponto <= 0 || ponto > 0x10ffff) return "";
  if (ponto >= 0xd800 && ponto <= 0xdfff) return "";
  try {
    return String.fromCodePoint(ponto);
  } catch {
    return "";
  }
}

/**
 * Decodifica referências de caractere HTML, UMA vez, como o navegador faz.
 *
 * **Por que isto existe.** O navegador decodifica o valor de um atributo ANTES
 * de resolver o esquema do endereço. Então `href="&#106;avascript:alert(1)"` é
 * `javascript:alert(1)` para ele — e era `&#106;avascript:…` para nós, um
 * caminho relativo inofensivo. Seis formas atravessavam a validação e o banco:
 * decimal, decimal com zeros à esquerda, hexadecimal, qualquer uma delas SEM o
 * ponto e vírgula (o navegador aceita), tabulação codificada no meio do nome do
 * esquema, e a nomeada `&colon;`.
 *
 * **Uma passagem, não repetida até estabilizar.** O navegador também decodifica
 * uma vez: `&amp;#106;` é o TEXTO `&#106;`, e não a letra `j`. Decodificar em
 * laço aqui recusaria endereço legítimo que o navegador nunca interpretaria.
 *
 * O resultado serve para DECIDIR, nunca para gravar: quem chama continua
 * guardando o valor original, senão a gravação passaria a alterar o endereço que
 * o Autor escreveu.
 */
export function decodificarEntidades(texto) {
  if (typeof texto !== "string") return "";
  return texto.replace(
    /* O teto de dígitos é largo de propósito: `&#00000000000106;` — onze zeros à
       esquerda — é decodificado pelo navegador como `j`, e um limite curto aqui
       faria a referência não casar, ficar intacta, e o endereço passar como
       caminho relativo. Ponto de código fora da faixa do Unicode cai em
       `caractereDoPonto`, que devolve nada. */
    /&(?:#([0-9]{1,32});?|#[xX]([0-9a-fA-F]{1,32});?|([a-zA-Z][a-zA-Z0-9]{0,31});?)/g,
    (inteiro, decimal, hexadecimal, nome) => {
      if (decimal !== undefined) return caractereDoPonto(Number.parseInt(decimal, 10));
      if (hexadecimal !== undefined) {
        return caractereDoPonto(Number.parseInt(hexadecimal, 16));
      }
      if (nome !== undefined && Object.hasOwn(ENTIDADES_ASCII, nome)) {
        return ENTIDADES_ASCII[nome];
      }
      // Nome desconhecido fica como está: `?a=1&bloco=2` não é entidade.
      return inteiro;
    },
  );
}

/**
 * O endereço é aceitável? Relativo (`/algo`, `#ancora`) sempre; absoluto só
 * com protocolo da lista. Qualquer outra coisa é recusada — inclusive o que
 * não é string.
 *
 * Esta função é chamada pelo servidor na Story 2.5, sobre conteúdo que vem de
 * fora. Ela é o único lugar do projeto que decide se um endereço pode existir.
 *
 * A DECODIFICAÇÃO VEM PRIMEIRO, e a ordem é o ponto: decodificar depois de
 * cortar espaços, ou depois de testar o esquema, deixaria `&#9;` e `&#106;`
 * atravessarem exatamente como atravessavam antes.
 */
export function enderecoPermitido(valor) {
  if (typeof valor !== "string") return false;
  /* O valor DECODIFICADO é o que o navegador vai resolver, e por isso é sobre ele
     que toda conferência abaixo decide. O valor original não é tocado: quem
     chama grava o que o Autor escreveu, e `&amp;` num endereço com parâmetros
     (`/x?a=1&amp;b=2`) continua passando porque decodifica para `&`. */
  const limpo = decodificarEntidades(valor).trim();
  if (limpo === "") return false;

  /* Barra invertida não existe em endereço legítimo e existe em quase toda
     evasão: `/\evil.com` e `https:/\evil.com` são lidos por navegadores como
     autoridade externa, porque eles normalizam `\` para `/` antes de resolver.
     Recusar de saída é mais barato que tentar prever a normalização de cada
     navegador. */
  if (limpo.includes("\\")) return false;

  /* Barra dupla no começo é ENDEREÇO RELATIVO DE PROTOCOLO: `//evil.com`
     parece interno para quem só olha o primeiro caractere, e o navegador o
     resolve como `https://evil.com`. Era exatamente o buraco que
     `startsWith("/")` abria — endereço externo classificado como interno. */
  if (limpo.startsWith("//")) return false;
  // Espaço, quebra de linha ou caractere de controle dentro do esquema
  // (`java\nscript:`) é a evasão clássica: o navegador os ignora e o teste
  // ingênuo os enxerga como parte do nome do esquema.
  //
  // A conferência de caractere de controle é por PONTO DE CÓDIGO, e não por
  // faixa dentro de uma expressão regular: caractere de controle escrito num
  // literal de regex é invisível na revisão, e o lint do projeto o proíbe com
  // razão.
  if (/\s/u.test(limpo)) return false;
  for (let i = 0; i < limpo.length; i += 1) {
    const ponto = limpo.charCodeAt(i);
    if (ponto < 0x20 || ponto === 0x7f) return false;
  }
  if (limpo.startsWith("/") || limpo.startsWith("#") || limpo.startsWith("?")) {
    return true;
  }
  // Sem esquema e sem barra inicial: caminho relativo simples.
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(limpo)) return true;
  const esquema = limpo.slice(0, limpo.indexOf(":") + 1).toLowerCase();
  return PROTOCOLOS_DE_LINK.includes(esquema);
}

/**
 * Onde um link pode abrir. Lista fechada: num schema que se declara lista de
 * permissão, `target` livre seria uma lista aberta escondida dentro dela.
 */
export const ALVOS_DE_LINK = Object.freeze(["_blank", "_self"]);

/** As palavras que `rel` pode conter. Qualquer outra é descartada. */
export const RELACOES_DE_LINK = Object.freeze([
  "noopener",
  "noreferrer",
  "nofollow",
  "ugc",
  "sponsored",
]);

/**
 * O `rel` obrigatório de quem abre em nova janela.
 *
 * Sem `noopener`, a página aberta recebe `window.opener` e pode reescrever a
 * aba de origem — o Painel — para onde quiser. É o par que um documento colado
 * de fora quebra com mais facilidade, porque o `target` sobrevive à colagem e o
 * `rel` não. Aqui ele não é sugerido: é imposto.
 *
 * A frase é exatamente a que o editor já emite, para que um documento válido
 * continue atravessando a validação sem mudar.
 */
export const RELACAO_DE_NOVA_JANELA = "noopener noreferrer nofollow";

/** Filtra `rel` às palavras conhecidas, preservando a ordem declarada. */
function relacoesDe(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== "string") return undefined;
  const palavras = valor
    .split(/\s+/u)
    .filter((palavra) => RELACOES_DE_LINK.includes(palavra.toLowerCase()))
    .map((palavra) => palavra.toLowerCase());
  return palavras.length > 0 ? [...new Set(palavras)].join(" ") : null;
}

/**
 * O nome da linguagem de um bloco de código.
 *
 * Restrito porque ele viaja até o renderizador de HTML da Story 2.5, que o
 * transforma em atributo. String livre num atributo é a porta que a lista de
 * permissão existe para fechar.
 */
function linguagemDeCodigo(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== "string") return undefined;
  const limpo = valor.trim().toLowerCase();
  if (limpo === "") return null;
  return /^[a-z0-9][a-z0-9+#._-]{0,31}$/.test(limpo) ? limpo : undefined;
}

/* ─── O endereço de IMAGEM (Story 3.1/3.2, e agora `NOS.image`) ──────────────
 *
 * Nasceu em `domain/blog/arquivos.js`, que continua sendo o vocabulário de
 * espécie e teto do arquivo — mas o nó `image`, abaixo, precisa validar `src`
 * DENTRO da travessia síncrona de `filtrarNo`, e este arquivo não importa
 * nada (é a condição que o mantém executável antes de qualquer DOM, e a
 * verificação afirma isso lendo o próprio texto-fonte). A regra migrou para
 * cá; `domain/blog/arquivos.js` a IMPORTA de volta e a reexporta com o MESMO
 * nome — quem já importava dela continua importando o mesmo símbolo, e
 * `src` de imagem no documento e `imagem_url`/`seo_imagem_url` da capa
 * continuam validados pela ÚNICA função, nunca por uma segunda regra.
 */

/** O teto do endereço de imagem — o mesmo que a restrição do banco cobra. */
export const TAMANHO_MAXIMO_DO_ENDERECO = 2048;

/**
 * O endereço tem caractere que o vocabulário de imagem não aceita?
 *
 * SÓ ASCII IMPRIMÍVEL, de `!` a `~` — mais duro que "sem espaço e sem
 * controle" de propósito: `[[:space:]]` do Postgres depende do locale e
 * `\s` do JavaScript inclui U+00A0 e companhia. A conferência é por PONTO DE
 * CÓDIGO porque um literal de expressão regular com caractere de controle
 * dentro não sobrevive a uma cópia.
 */
export function temCaractereForaDoEndereco(endereco) {
  for (const caractere of endereco) {
    const ponto = caractere.codePointAt(0);
    if (ponto < 0x21 || ponto > 0x7e) return true;
  }
  return /[\\<>"'`{}|^]/.test(endereco);
}

/**
 * O endereço serve para um `src` de imagem (capa, SEO ou `NOS.image` do
 * documento)?
 *
 * **Espelho em JavaScript de `public.endereco_de_imagem_e_permitido`**, e as
 * duas são comparadas sobre um corpus por `verificar:escrita`. É lista de
 * PERMISSÃO, e a permissão é estreita de propósito: **`https://` absoluto**,
 * mais `http://` para host local. `null`/`undefined` passam: nem toda coluna
 * de imagem é obrigatória — quem exige `src` (o nó `image`, abaixo) cobra a
 * presença à parte, com `atributosObrigatorios`.
 */
export function enderecoDeImagemPermitido(endereco) {
  if (endereco === null || endereco === undefined) return true;
  if (typeof endereco !== "string") return false;
  if (endereco === "") return false;
  if (endereco.length > TAMANHO_MAXIMO_DO_ENDERECO) return false;
  if (temCaractereForaDoEndereco(endereco)) return false;

  const comTls = /^https:\/\//i.test(endereco);
  const semTls = /^http:\/\//i.test(endereco);
  if (!comTls && !semTls) return false;

  const autoridade = endereco.slice(comTls ? 8 : 7).replace(/[/?#].*$/s, "");
  if (autoridade === "") return false;
  if (autoridade.includes("@")) return false;
  if (!/^[a-z0-9.-]+(:[0-9]{1,5})?$/i.test(autoridade)) return false;

  if (comTls) return true;
  const host = autoridade.replace(/:[0-9]{1,5}$/, "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

/**
 * O `src` de um nó `image`: obrigatório, e validado pela MESMA regra que a
 * capa e a imagem de SEO. String vazia ou fora da regra faz o atributo
 * desaparecer — e `atributosObrigatorios` derruba o nó inteiro, porque uma
 * imagem sem endereço não é imagem.
 */
function enderecoDeImagemDoDocumento(valor) {
  if (typeof valor !== "string" || valor === "") return undefined;
  return enderecoDeImagemPermitido(valor) ? valor : undefined;
}

/**
 * A forma de cada marca. `atributos` lista o que sobrevive; o resto some.
 * `normalizar` roda depois, para as regras que dependem de mais de um atributo.
 *
 * `class` aparece aqui porque o editor a materializa como `null` e descartá-la
 * faria a validação alterar um documento válido. Mas ela só sobrevive VAZIA:
 * o HTML do artigo não carrega classe — quem estiliza é o invólucro `.artigo`,
 * e classe gerada em tempo de execução nunca chega ao compilador do Tailwind.
 */
export const MARCAS = Object.freeze({
  bold: Object.freeze({ atributos: Object.freeze({}) }),
  italic: Object.freeze({ atributos: Object.freeze({}) }),
  /**
   * O destaque de cor. `cor` é OBRIGATÓRIA e vem só de `CORES_DE_DESTAQUE`,
   * a lista fechada declarada no alto deste arquivo — nunca `style` livre
   * nem hexadecimal escolhido pelo Autor. Uma marca sem cor aceitável não é
   * highlight: ela cai inteira, como `link` sem `href` aceitável.
   */
  highlight: Object.freeze({
    atributos: Object.freeze({
      cor: umDentre([...CORES_DE_DESTAQUE]),
    }),
    atributosObrigatorios: Object.freeze(["cor"]),
  }),
  link: Object.freeze({
    atributos: Object.freeze({
      href: (valor) => (enderecoPermitido(valor) ? valor.trim() : undefined),
      target: (valor) =>
        valor === null || valor === undefined
          ? null
          : ALVOS_DE_LINK.includes(valor)
            ? valor
            : undefined,
      rel: relacoesDe,
      title: textoOuNulo,
      class: (valor) => (valor === null || valor === undefined ? null : undefined),
    }),
    atributosObrigatorios: Object.freeze(["href"]),
    /**
     * O par `target="_blank"` + `rel` com `noopener` é imposto aqui, e não
     * torcido para que venha certo de fora. A atribuição preserva a POSIÇÃO da
     * chave no objeto: reordenar faria um documento válido deixar de ser ponto
     * fixo da própria validação.
     */
    normalizar(atributos) {
      if (atributos.target !== "_blank") return atributos;
      const palavras = String(atributos.rel ?? "").split(/\s+/u);
      if (palavras.includes("noopener") && palavras.includes("noreferrer")) {
        return atributos;
      }
      if (Object.hasOwn(atributos, "rel")) {
        atributos.rel = RELACAO_DE_NOVA_JANELA;
        return atributos;
      }
      return { ...atributos, rel: RELACAO_DE_NOVA_JANELA };
    },
  }),
});

/** Todo nome de nó que o schema conhece. */
export const NOS_PERMITIDOS = Object.freeze(Object.keys(NOS));
/** Todo nome de marca que o schema conhece. */
export const MARCAS_PERMITIDAS = Object.freeze(Object.keys(MARCAS));

export function ehNoPermitido(nome) {
  return typeof nome === "string" && Object.hasOwn(NOS, nome);
}

export function ehMarcaPermitida(nome) {
  return typeof nome === "string" && Object.hasOwn(MARCAS, nome);
}

/** O elemento da barra com esta chave, ou `undefined`. */
export function elementoPorChave(chave) {
  return ELEMENTOS.find((elemento) => elemento.chave === chave);
}

/** O documento de um Post que ainda não tem nada escrito. */
export function documentoVazio() {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/* ─── A higienização ─────────────────────────────────────────────────────── */

/**
 * Até onde o documento pode aninhar.
 *
 * Não é gosto: é o que separa "nunca lança" de "nunca lança até alguém tentar".
 * A travessia é recursiva, o runtime tem pilha finita, e um `content` aninhado
 * dez mil vezes cabe num JSON de poucas centenas de kilobytes — que é
 * exatamente o tamanho de corpo que a função do servidor da Story 2.5 vai
 * aceitar sem piscar. Cem níveis é ordens de grandeza além de qualquer artigo
 * real (citação dentro de item dentro de lista dentro de citação raramente
 * passa de seis).
 */
export const PROFUNDIDADE_MAXIMA = 100;

/** Quantos descartes o relatório carrega antes de passar a só contar. */
export const LIMITE_DO_RELATORIO = 200;

/**
 * Filtra os atributos de um nó ou marca pela forma declarada.
 * Devolve `null` quando falta um atributo obrigatório — quem chama descarta.
 */
function filtrarAtributos(forma, atributos, registrar, caminho) {
  const declarados = forma.atributos ?? {};
  const obrigatorios = forma.atributosObrigatorios ?? [];
  const entrada =
    atributos !== null && typeof atributos === "object" && !Array.isArray(atributos)
      ? atributos
      : {};

  const saida = {};
  for (const [nome, valor] of Object.entries(entrada)) {
    if (!Object.hasOwn(declarados, nome)) {
      registrar("atributo", nome, caminho);
      continue;
    }
    const aceito = declarados[nome](valor);
    if (aceito === undefined) {
      registrar("atributo", nome, caminho);
      continue;
    }
    saida[nome] = aceito;
  }

  for (const nome of obrigatorios) {
    if (!Object.hasOwn(saida, nome)) return null;
  }
  // Preserva a ausência: nó sem atributos continua sem a chave `attrs`, para
  // que um documento válido atravesse a validação sem mudar de forma.
  return Object.keys(saida).length > 0 ? saida : null;
}

/** As marcas de um trecho de texto, filtradas pela lista de permissão. */
function filtrarMarcas(marcas, registrar, caminho) {
  if (marcas === undefined) return undefined;
  if (!Array.isArray(marcas)) {
    registrar("marca", "(não é lista)", caminho);
    return undefined;
  }

  const saida = [];
  for (const marca of marcas) {
    const nome = marca?.type;
    if (!ehMarcaPermitida(nome)) {
      registrar("marca", typeof nome === "string" ? nome : String(nome), caminho);
      continue;
    }
    const forma = MARCAS[nome];
    let attrs = filtrarAtributos(forma, marca.attrs, registrar, `${caminho}/${nome}`);
    if (attrs === null && (forma.atributosObrigatorios ?? []).length > 0) {
      // Link sem endereço aceitável não é link — a MARCA cai, o texto fica.
      registrar("marca", nome, caminho);
      continue;
    }
    // Regras que dependem de mais de um atributo rodam depois de todos eles
    // terem sido filtrados — é o caso do par `target`/`rel`.
    if (attrs !== null && typeof forma.normalizar === "function") {
      attrs = forma.normalizar(attrs);
    }
    saida.push(attrs === null ? { type: nome } : { type: nome, attrs });
  }
  return saida.length > 0 ? saida : undefined;
}

/**
 * Higieniza um nó. Devolve o nó saneado, ou `null` quando ele não sobrevive —
 * porque está fora da lista, porque perdeu atributo obrigatório, ou porque
 * ficou vazio e vazio não é forma válida para ele.
 */
function filtrarNo(no, permitidos, registrar, caminho, semMarcas = false, profundidade = 0) {
  /* O TETO DE PROFUNDIDADE. Sem ele, "esta função nunca lança" era falso: um
     documento aninhado fundo o bastante estoura a pilha com `RangeError`, e é
     esta a função que o servidor da Story 2.5 vai chamar sobre conteúdo de
     terceiros. Um `content` aninhado dez mil vezes cabe num JSON de poucas
     centenas de kilobytes.
     O corte é DESCARTE, não erro: o galho fundo demais cai como qualquer nó
     fora da lista, fica registrado, e o resto do documento sobrevive. */
  if (profundidade > PROFUNDIDADE_MAXIMA) {
    registrar("no", `(aninhamento além de ${PROFUNDIDADE_MAXIMA} níveis)`, caminho);
    return null;
  }
  if (no === null || typeof no !== "object" || Array.isArray(no)) {
    registrar("no", `(${no === null ? "null" : typeof no})`, caminho);
    return null;
  }

  const nome = no.type;
  if (!ehNoPermitido(nome)) {
    registrar("no", typeof nome === "string" ? nome : String(nome), caminho);
    return null;
  }
  if (permitidos !== null && !permitidos.includes(nome)) {
    // O nó existe no schema mas não NESTE lugar (um `listItem` solto no topo).
    registrar("no", `${nome} (fora de lugar)`, caminho);
    return null;
  }

  const forma = NOS[nome];
  const aqui = `${caminho}/${nome}`;

  if (forma.texto) {
    if (typeof no.text !== "string" || no.text === "") {
      registrar("no", "text (sem texto)", aqui);
      return null;
    }
    // Dentro do bloco de código não existe marca: negrito em código é ruído
    // que o renderizador teria de emitir e o estilo não prevê.
    const marcas = semMarcas
      ? (Array.isArray(no.marks) && no.marks.length > 0
          ? (registrar("marca", "(dentro de bloco de código)", aqui), undefined)
          : undefined)
      : filtrarMarcas(no.marks, registrar, aqui);
    // `marks` antes de `text`, na ordem em que o editor emite: assim um
    // documento válido atravessa a validação idêntico até na serialização, e a
    // asserção de ponto fixo pode ser byte a byte em vez de aproximada.
    return marcas
      ? { type: "text", marks: marcas, text: no.text }
      : { type: "text", text: no.text };
  }

  const attrs = filtrarAtributos(forma, no.attrs, registrar, aqui);
  if (attrs === null && (forma.atributosObrigatorios ?? []).length > 0) {
    // Título sem nível, ou com nível 1: o nó inteiro cai.
    registrar("no", `${nome} (atributo obrigatório fora do schema)`, aqui);
    return null;
  }

  const saida = { type: nome };
  if (attrs !== null) saida.attrs = attrs;

  if (forma.filhos === null) {
    // Nó atômico: conteúdo que venha junto é descartado sem derrubá-lo.
    if (Array.isArray(no.content) && no.content.length > 0) {
      registrar("no", `${nome} (conteúdo em nó atômico)`, aqui);
    }
    return saida;
  }

  const filhoSemMarcas = semMarcas || nome === "codeBlock";
  const conteudo = [];
  if (Array.isArray(no.content)) {
    for (const filho of no.content) {
      const saneado = filtrarNo(
        filho,
        forma.filhos,
        registrar,
        aqui,
        filhoSemMarcas,
        profundidade + 1,
      );
      if (saneado !== null) conteudo.push(saneado);
    }
  } else if (no.content !== undefined) {
    registrar("no", `${nome} (conteúdo não é lista)`, aqui);
  }

  // Nó que ficou sem conteúdo: ou o vazio é forma válida para ele (parágrafo,
  // título, bloco de código), e aí ele sai SEM a chave `content` — como o
  // editor mesmo o emite —, ou ele é resto estrutural e cai junto.
  if (conteudo.length === 0) return forma.vazioSobrevive ? saida : null;

  saida.content = conteudo;
  return saida;
}

/**
 * Valida um documento contra o schema — que é o mesmo que higienizá-lo.
 *
 * **Nunca lança.** Devolve `{ ok: true, documento, descartados }` para
 * qualquer coisa que SEJA um documento, ainda que cheia de nó proibido, e
 * `{ ok: false, erro }` para o que não é documento nenhum. A distinção
 * importa: conteúdo sujo é caso previsto e tem conserto (descartar); entrada
 * que não é documento é defeito de quem chamou e precisa aparecer como tal.
 *
 * `descartados` é a lista do que caiu, com espécie, nome e caminho — é o que
 * permite a uma tela dizer "a tabela colada foi removida" em vez de a pessoa
 * descobrir sozinha que faltou conteúdo. A lista tem teto, e por isso vem
 * acompanhada de `totalDescartado` e `descartadosTruncados`: uma tela que
 * contasse o tamanho da lista diria "200 removidos" quando foram cinco mil.
 */
export function validarDocumento(entrada) {
  if (entrada === null || entrada === undefined) {
    return {
      ok: false,
      erro: {
        mensagem: "O conteúdo do post está vazio. Escreva algo antes de salvar.",
        detalhe: `esperava um documento e veio ${entrada === null ? "null" : "undefined"}`,
      },
    };
  }
  if (typeof entrada !== "object" || Array.isArray(entrada)) {
    return {
      ok: false,
      erro: {
        mensagem:
          "O conteúdo do post não está no formato de documento. Abra o post no Editor e salve de novo.",
        detalhe: `esperava um documento e veio ${Array.isArray(entrada) ? `lista de ${entrada.length}` : typeof entrada}`,
      },
    };
  }
  if (entrada.type !== "doc") {
    return {
      ok: false,
      erro: {
        mensagem:
          "O conteúdo do post não está no formato de documento. Abra o post no Editor e salve de novo.",
        detalhe: `a raiz precisa ser \`doc\` e veio ${JSON.stringify(entrada.type ?? null)}`,
      },
    };
  }
  if (entrada.content !== undefined && !Array.isArray(entrada.content)) {
    return {
      ok: false,
      erro: {
        mensagem:
          "O conteúdo do post não está no formato de documento. Abra o post no Editor e salve de novo.",
        detalhe: `\`content\` da raiz precisa ser uma lista e veio ${typeof entrada.content}`,
      },
    };
  }

  const descartados = [];
  let totalDescartado = 0;
  let totalSaneado = 0;
  const registrar = (especie, nome, caminho) => {
    /* Duas contagens, porque são duas coisas.
       `totalDescartado` conta nó e marca: CONTEÚDO que sumiu, e é o número que
       uma tela mostra ao Autor. `totalSaneado` conta atributo: o conteúdo
       ficou, mais limpo. Somar os dois inflava o aviso — um `h1` descartado
       aparecia como dois trechos removidos, porque o nível caiu antes do nó.
       Teto na LISTA, contagem sem teto: um documento adversário com um milhão
       de nós proibidos não pode transformar o relatório no gargalo, mas quem
       for avisar o Autor precisa saber quantos foram de verdade. */
    if (especie === "atributo") totalSaneado += 1;
    else totalDescartado += 1;
    if (descartados.length < LIMITE_DO_RELATORIO) {
      descartados.push({ especie, nome, caminho });
    }
  };

  const documento = filtrarNo(entrada, null, registrar, "");

  // A raiz sobrevive sempre (`doc.vazioSobrevive`), mas um documento sem bloco
  // nenhum não é editável: o parágrafo vazio é o piso do formato.
  const saida =
    documento === null || !Array.isArray(documento.content) || documento.content.length === 0
      ? documentoVazio()
      : documento;

  return {
    ok: true,
    documento: saida,
    descartados: Object.freeze(descartados),
    totalDescartado,
    totalSaneado,
    descartadosTruncados: totalDescartado + totalSaneado > descartados.length,
  };
}

/**
 * Todo `src` de nó `image` dentro do documento, na ordem em que aparecem —
 * repetido inclui, porque quem chama (`api/_nucleo/salvarPost.js`, limpando
 * imagem órfã do corpo) precisa saber que um mesmo endereço usado duas vezes
 * continua em uso mesmo que uma das duas caia.
 *
 * Mesma disciplina de pilha de `textoDoDocumento`, logo abaixo: percorre sem
 * recursão, porque o documento que chega aqui é o mesmo conteúdo de
 * terceiros que `validarDocumento` trata — ainda que, neste caminho
 * específico, ele já tenha passado pela validação antes de chegar ao banco.
 */
export function enderecosDeImagemDoDocumento(no) {
  const enderecos = [];
  if (no === null || typeof no !== "object") return enderecos;

  const pilha = [no];
  while (pilha.length > 0) {
    const atual = pilha.pop();
    if (atual === null || typeof atual !== "object" || Array.isArray(atual)) continue;
    if (atual.type === "image" && typeof atual.attrs?.src === "string" && atual.attrs.src !== "") {
      enderecos.push(atual.attrs.src);
    }
    if (Array.isArray(atual.content)) {
      for (let i = atual.content.length - 1; i >= 0; i -= 1) pilha.push(atual.content[i]);
    }
  }
  return enderecos;
}

/**
 * O texto corrido do documento, sem marcação nenhuma. Existe para o contador
 * de caracteres e para a busca — e para a verificação medir o custo do caminho
 * puro sobre um documento grande.
 *
 * Percorre a árvore com uma PILHA PRÓPRIA, e não por recursão: ela é chamada
 * sobre o mesmo conteúdo de terceiros que `validarDocumento` recebe, e uma
 * versão recursiva estouraria a pilha do runtime exatamente onde a outra tomou
 * o cuidado de não estourar. Aqui não há teto de profundidade porque não há
 * profundidade de pilha — só memória, proporcional ao documento.
 */
export function textoDoDocumento(no) {
  if (no === null || typeof no !== "object") return "";

  const pedacos = [];
  /* A pilha guarda nós e, entre eles, o separador já resolvido — uma string
     solta. Como o desempilhamento é ao contrário, os filhos entram do último
     para o primeiro, com o separador logo depois de cada um que tem sucessor. */
  const pilha = [no];
  while (pilha.length > 0) {
    const atual = pilha.pop();
    if (typeof atual === "string") {
      pedacos.push(atual);
      continue;
    }
    if (atual === null || typeof atual !== "object") continue;
    if (atual.type === "text") {
      if (typeof atual.text === "string") pedacos.push(atual.text);
      continue;
    }
    if (!Array.isArray(atual.content)) continue;
    const separador =
      atual.type === "doc" || NOS[atual.type]?.filhos === BLOCOS ? "\n" : "";
    for (let i = atual.content.length - 1; i >= 0; i -= 1) {
      pilha.push(atual.content[i]);
      if (separador !== "" && i > 0) pilha.push(separador);
    }
  }
  return pedacos.join("");
}
