#!/usr/bin/env node
/**
 * Ferramenta de verificação do Editor visual (Story 2.4).
 *
 * A story inteira depende de uma afirmação que é fácil escrever e difícil
 * provar: existe UM schema, e a barra é derivada dele. Uma barra escrita à mão
 * que hoje coincide com o schema passaria por qualquer inspeção de código e
 * divergiria na primeira mudança. Por isso esta ferramenta **importa e executa**
 * o schema, a derivação e o editor de verdade — inclusive o caminho de colagem,
 * dentro de um DOM real (`jsdom`), porque o critério de aceite fala de
 * comportamento e comportamento se observa.
 *
 *   (a) dependências: os quatro pacotes do Tiptap em versão EXATA (peers
 *       divergentes de `@tiptap/pm` produzem duas instâncias do ProseMirror e
 *       falhas que só aparecem em tempo de execução), e o encadeamento em
 *       `verificar`;
 *   (b) o schema é domínio puro: importável fora do navegador, congelado, dez
 *       elementos na ordem declarada, e `h1` em lugar nenhum;
 *   (c) a barra é DERIVADA: um controle por elemento, na mesma ordem;
 *       acrescentar um elemento faz o controle nascer; e não existe lista
 *       paralela de botões na fonte da barra;
 *   (d) validar contra o schema É a higienização: documento válido atravessa
 *       intacto, nó e marca fora da lista caem com o resto preservado, entrada
 *       que não é documento é recusada — e nada lança, nunca;
 *   (e) o editor real, montado em DOM: o que o schema não conhece não existe
 *       nele, a área de escrita veste `.artigo`, a medida não é redeclarada, e
 *       cada controle roda o comando que declarou;
 *   (f) COLAGEM, exercitada e não presumida — a rica e a sem formatação;
 *   (g) o custo do caminho puro sobre 20 mil caracteres, medido e publicado.
 *
 * Os detectores desta ferramenta são exercitados com entradas sintéticas antes
 * de julgarem o repositório: um detector que nunca acusou nada é indistinguível
 * de um detector quebrado.
 *
 * Uso: npm run verificar:editor
 *
 * Saída: uma linha por asserção; código 0 se todas passarem, 1 caso contrário.
 */

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/* O arranjo de montagem de tela mora em `montagem-comum.mjs` desde a Story
   2.13: `verificar-acesso.mjs` passou a montar a rota da pré-visualização, e
   dois JSDOM configurados à parte divergiriam no primeiro ajuste de um deles. */
import {
  caminhoDeModulo,
  comoModulo,
  compilarParaNode,
  criarPastaDeCompilacao,
  montarNavegador,
} from "./montagem-comum.mjs";

// O leitor de CSS já auditado da Story 2.3 — com máscara de comentário e 25
// autotestes próprios. Reler `.artigo` por regex aqui repetiria um trabalho
// que já foi feito e já falhou uma vez: a primeira tentativa desta asserção
// leu `65ch` de dentro de um COMENTÁRIO que explica por que 65ch não é usado.
import { declaracoesDe } from "./css-comum.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const urlDe = (relativo) => pathToFileURL(path.join(raiz, relativo)).href;
const ler = (relativo) => readFileSync(path.join(raiz, relativo), "utf8");

const CAMINHO_SCHEMA = "src/domain/blog/schema.js";
const CAMINHO_CONFIGURACAO = "src/admin/blog/configuracao.js";
const CAMINHO_CONTEUDO = "src/admin/blog/conteudo.js";
const CAMINHO_ICONES = "src/admin/blog/icones.js";
const CAMINHO_BARRA = "src/admin/blog/BarraDoEditor.jsx";
const CAMINHO_EDITOR = "src/admin/blog/Editor.jsx";
const CAMINHO_APP_CSS = "src/App.css";

/* A tela da Story 2.6, a gaveta e os dois módulos puros da Story 2.7. */
const CAMINHO_TELA = "src/admin/blog/EditorDePost.jsx";
const CAMINHO_GAVETA = "src/admin/blog/GavetaDeMetadados.jsx";
const CAMINHO_MODULO_DA_GAVETA = "src/admin/blog/gaveta.js";
const CAMINHO_METADADOS = "src/admin/blog/metadados.js";
const CAMINHO_PENDENCIA = "src/admin/blog/pendencia.js";
const CAMINHO_FOCO = "src/admin/shell/foco.js";
const CAMINHO_VOZ = "src/admin/shell/voz.js";

/* A máquina de estados da Story 2.8 — a mesma que o servidor consulta. */
const CAMINHO_TRANSICOES = "src/domain/blog/transicoes.js";
const CAMINHO_ESTADOS = "src/domain/blog/estados.js";

/* A listagem da Story 2.10 e as regras puras dela. */
const CAMINHO_LISTA = "src/admin/blog/ListaDePosts.jsx";
const CAMINHO_MODULO_DA_LISTAGEM = "src/admin/blog/listagem.js";
/* As regras puras das ações por linha (Story 2.12). Módulo próprio pela mesma
   razão que `listagem.js`: função pura em arquivo de componente quebra a
   recarga rápida — e, aqui, tornaria "a confirmação nomeia o Post" uma frase
   sobre JSX em vez de uma regra executável. */
const CAMINHO_MODULO_DAS_ACOES = "src/admin/blog/acoes.js";
/* A pré-visualização da Story 2.13: a tela e as regras puras dela. O
   renderizador entra junto para PROVAR que a tela mostra o HTML gravado e não
   um derivado na hora — as duas coisas só se distinguem quando divergem. */
const CAMINHO_PREVIA = "src/admin/blog/PreVisualizacaoDePost.jsx";
const CAMINHO_MODULO_DA_PREVIA = "src/admin/blog/previa.js";
/* Os endereços do Painel: vocabulário compartilhado entre a listagem, o Editor
   e a declaração de rotas. Eles NÃO moram no módulo da tela — um módulo
   compartilhado apontando para o módulo de uma tela é seta invertida. */
const CAMINHO_MODULO_DAS_ROTAS = "src/admin/blog/rotas.js";
/* A tela de Categorias da Story 2.14 e os módulos dela. O vocabulário fechado
   de cor e de ícone é DOMÍNIO — o servidor o consulta para recusar, e ele não
   pode importar `lucide-react`. O desenho mora no Painel, e a igualdade entre
   as duas listas é cobrada executando. */
const CAMINHO_TELA_DE_CATEGORIAS = "src/admin/blog/TelaDeCategorias.jsx";
const CAMINHO_MODULO_DAS_CATEGORIAS = "src/admin/blog/categorias.js";
const CAMINHO_CATEGORIAS_DO_DOMINIO = "src/domain/blog/categorias.js";
const CAMINHO_TAGS_DO_DOMINIO = "src/domain/blog/tags.js";
/* Story 3.1: o envio da capa. `capa.js` traz as situações e as falas do envio;
   `domain/blog/arquivos.js` traz o vocabulário fechado de espécie e o teto; e
   `data/blog/arquivos.js` é a fronteira de rede que o dublê troca. */
const CAMINHO_MODULO_DA_CAPA = "src/admin/blog/capa.js";
/* Story 3.4: a seção de SEO. `admin/blog/seo.js` traz o contador e as falas da
   herança; `domain/blog/compartilhamento.js` é quem DECIDE a herança — e a
   asserção compara a frase desenhada com a decisão dele. */
const CAMINHO_MODULO_DE_SEO = "src/admin/blog/seo.js";
/* Story 3.5: a Prévia de compartilhamento — o cartão como o link aparece. Ela
   é a PRIMEIRA CONSUMIDORA DE PRODUÇÃO de `metadadosDoPost`, e o que se prova
   aqui é que cada valor desenhado é, campo a campo, o que aquela função
   devolveu: nada nela escolhe, completa ou formata por conta própria. */
const CAMINHO_CARTAO = "src/admin/blog/CartaoDeCompartilhamento.jsx";
const CAMINHO_COMPARTILHAMENTO = "src/domain/blog/compartilhamento.js";
const CAMINHO_ARQUIVOS_DO_DOMINIO = "src/domain/blog/arquivos.js";
const CAMINHO_ARQUIVOS_DA_CAMADA = "src/data/blog/arquivos.js";
/* O FILTRO DO BLOG PÚBLICO. Ele lê as Categorias do banco desde a Story 2.14, e
   a única asserção sobre isso eram duas expressões regulares sobre o texto do
   arquivo — que continuam passando com `categoria.slug` no lugar de
   `categoria.nome`, e aí toda pastilha menos "Todos" mostra "Nenhum artigo
   encontrado". Aqui ele é MONTADO. */
const CAMINHO_BLOG_PUBLICO = "src/pages/Blog.jsx";
/* A segunda tela pública e o módulo puro das duas (Story 2.15). */
const CAMINHO_ARTIGO_PUBLICO = "src/pages/BlogPost.jsx";
const CAMINHO_MODULO_PUBLICO = "src/pages/blogPublico.js";
/* A rolagem ao trocar de rota. Ela é global e mora acima das rotas; entra no
   pacote porque a garantia "trocar de artigo volta ao topo" se observa com ela
   montada, e não duplicando a rolagem dentro da página. */
const CAMINHO_ROLAGEM = "src/components/ScrollToTop.jsx";
/* O mapa de ícone de Categoria: ele traz o DESENHO e o RÓTULO, e o rótulo é o
   nome acessível de cada opção — a chave ("faisca", "chip", "robo") é nome de
   código, sem sentido para quem ouve a tela. */
const CAMINHO_ICONES_DE_CATEGORIA = "src/admin/blog/iconesDeCategoria.js";
const CAMINHO_RENDERIZADOR = "src/render/blog/paraHtml.js";
/* O ponto único de notificação. Ele é DUBLADO na montagem: a única coisa que
   o alvo indisponível de "Ver no site" FAZ é notificar, e sem o dublê apagar
   o `onClick` dele não quebrava asserção nenhuma. O mesmo vale para a
   confirmação da exclusão e para as duas direções do Destaque — trocar o valor
   gravado pelo pedido faria a estrela dizer uma coisa e o aviso outra. */
const CAMINHO_NOTIFICACOES = "src/admin/shell/Notificacoes.jsx";

/* A fronteira de dados que a tela consome. Ela é DUBLADA na montagem — ver o
   comentário de `compilarComponentes` — e os módulos reais entram junto para
   que a forma dos dublês seja comparada com a deles, executando. */
const CAMINHO_ESCRITA = "src/data/blog/escrita.js";
const CAMINHO_POSTS = "src/data/blog/posts.js";
const CAMINHO_TAXONOMIA = "src/data/blog/taxonomia.js";

/** Os quatro pacotes que a espinha exige em versão exata. */
const PACOTES_EXATOS = [
  "@tiptap/react",
  "@tiptap/core",
  "@tiptap/pm",
  "@tiptap/starter-kit",
];

/**
 * Os treze elementos que a story nomeia, na ordem em que ela os nomeia.
 * Escritos AQUI, à mão, de propósito: se a lista viesse do próprio schema, a
 * asserção diria apenas "o schema é igual a si mesmo".
 *
 * Os três de alinhamento (correção de UI/UX do Editor) declaram `nome: null`
 * — o atributo mora num nó, mas não troca o TIPO dele (Design Notes,
 * `domain/blog/schema.js`).
 */
const TREZE_ELEMENTOS = [
  { chave: "titulo2", nome: "heading", atributos: { level: 2 } },
  { chave: "titulo3", nome: "heading", atributos: { level: 3 } },
  { chave: "negrito", nome: "bold", atributos: null },
  { chave: "italico", nome: "italic", atributos: null },
  { chave: "listaOrdenada", nome: "orderedList", atributos: null },
  { chave: "listaComMarcadores", nome: "bulletList", atributos: null },
  { chave: "link", nome: "link", atributos: null },
  { chave: "citacao", nome: "blockquote", atributos: null },
  { chave: "blocoDeCodigo", nome: "codeBlock", atributos: null },
  { chave: "linhaDivisoria", nome: "horizontalRule", atributos: null },
  { chave: "alinharEsquerda", nome: null, atributos: { textAlign: "left" } },
  { chave: "alinharCentro", nome: null, atributos: { textAlign: "center" } },
  { chave: "alinharDireita", nome: null, atributos: { textAlign: "right" } },
];

/** O piso que a story fixa para a resposta de teclado, em milissegundos. */
const LIMITE_DE_RESPOSTA_MS = 100;

let falhas = 0;

function secao(titulo) {
  console.log(`\n${titulo}`);
}

function afirmar(descricao, condicao, detalhe = "") {
  if (condicao) {
    console.log(`  OK    ${descricao}`);
  } else {
    falhas += 1;
    console.log(`  FALHA ${descricao}${detalhe ? ` — ${detalhe}` : ""}`);
  }
  return Boolean(condicao);
}

function nota(texto) {
  console.log(`        ${texto}`);
}

/** Executa `acao`; exceção vira asserção falha em vez de derrubar o script. */
function tentar(descricao, acao, padrao = null) {
  try {
    return acao();
  } catch (erro) {
    afirmar(descricao, false, String(erro?.message ?? erro).slice(0, 300));
    return padrao;
  }
}

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Igualdade profunda que NÃO depende da ordem das chaves.
 *
 * O ponto fixo da validação era comparado por serialização. Funciona hoje, em
 * memória, e deixa de funcionar na Story 2.5: o Postgres guarda `jsonb` com as
 * chaves reordenadas (por tamanho e ordem alfabética), então o documento que
 * volta do banco é o MESMO documento com outra serialização — e a asserção
 * acusaria uma regressão onde não houve nenhuma. Ordem de chave em JSON não
 * carrega significado; comparar por ela é comparar o transporte.
 */
export function igualProfundo(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => igualProfundo(item, b[i]));
  }
  if (typeof a !== "object") return false;
  const chavesA = Object.keys(a).sort();
  const chavesB = Object.keys(b).sort();
  if (!igual(chavesA, chavesB)) return false;
  return chavesA.every((chave) => igualProfundo(a[chave], b[chave]));
}

/* ─── Detectores locais, com autoteste ───────────────────────────────────── */

/**
 * O que pode vir imediatamente ANTES de uma barra que começa uma expressão
 * regular. Depois de um valor (nome, número, `)`, `]`) a barra é divisão.
 */
const ANTES_DE_REGEX = new Set([
  ..."(,=:[!&|?{};+-*%~^<>",
  "\n",
  "\r",
  "\t",
  " ",
  "",
]);
const PALAVRAS_ANTES_DE_REGEX =
  /(^|[^\w$.])(return|typeof|instanceof|in|of|new|delete|void|throw|do|else|case|yield|await)$/;

/**
 * Apaga comentários de um fonte JS/JSX, preservando o comprimento.
 *
 * Existe porque a asserção central — "não há lista de botões escrita à mão na
 * barra" — procura os nomes dos elementos no fonte, e os comentários da barra
 * MENCIONAM esses nomes ao explicar por que não estão lá. Sem máscara, a
 * asserção acusaria a própria documentação e seria desligada por incômodo.
 *
 * **Literal de expressão regular é um contexto, não um detalhe.** `schema.js`
 * contém vários, e um `/.../` tratado como divisão desviava a máquina de
 * estados: a barra de fechamento virava abertura de comentário, e o RESTO do
 * arquivo saía mascarado em silêncio. Toda asserção que lê aquele arquivo
 * passava a olhar para espaços em branco e respondia OK por vacuidade — o modo
 * de falha mais caro que este mascarador pode ter, porque não parece falha.
 *
 * A distinção entre divisão e regex é decidida pelo último caractere
 * significativo, que é a mesma heurística que os destacadores de sintaxe usam:
 * depois de um valor, `/` divide; depois de um operador ou de palavra-chave,
 * `/` abre literal.
 */
export function mascararComentariosJs(fonte) {
  let saida = "";
  let i = 0;
  let contexto = null; // "linha" | "bloco" | "aspas" | "modelo" | "regex"
  let aspa = "";
  let emClasse = false; // dentro de `[...]` de uma regex, onde `/` é literal
  // O último caractere que não é espaço nem comentário — quem decide se a
  // próxima barra divide ou abre expressão regular.
  let significativo = "";

  const podeSerRegex = () =>
    ANTES_DE_REGEX.has(significativo) ||
    PALAVRAS_ANTES_DE_REGEX.test(saida.replace(/\s+$/u, ""));

  while (i < fonte.length) {
    const ch = fonte[i];
    const proximo = fonte[i + 1];

    if (contexto === "linha") {
      if (ch === "\n") {
        contexto = null;
        saida += ch;
      } else saida += " ";
      i += 1;
      continue;
    }
    if (contexto === "bloco") {
      if (ch === "*" && proximo === "/") {
        contexto = null;
        saida += "  ";
        i += 2;
        continue;
      }
      saida += ch === "\n" ? "\n" : " ";
      i += 1;
      continue;
    }
    if (contexto === "aspas" || contexto === "modelo") {
      saida += ch;
      if (ch === "\\") {
        saida += fonte[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === aspa) {
        contexto = null;
        significativo = ch;
      }
      i += 1;
      continue;
    }
    if (contexto === "regex") {
      saida += ch;
      if (ch === "\\") {
        saida += fonte[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === "[") emClasse = true;
      else if (ch === "]") emClasse = false;
      else if (ch === "/" && !emClasse) {
        contexto = null;
        significativo = "/";
      }
      i += 1;
      continue;
    }

    if (ch === "/" && proximo === "/") {
      contexto = "linha";
      saida += "  ";
      i += 2;
      continue;
    }
    if (ch === "/" && proximo === "*") {
      contexto = "bloco";
      saida += "  ";
      i += 2;
      continue;
    }
    if (ch === "/" && podeSerRegex()) {
      contexto = "regex";
      emClasse = false;
      saida += ch;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      contexto = ch === "`" ? "modelo" : "aspas";
      aspa = ch;
      saida += ch;
      i += 1;
      continue;
    }
    saida += ch;
    if (!/\s/u.test(ch)) significativo = ch;
    i += 1;
  }
  return saida;
}

/** Os termos do schema que aparecem, como palavra inteira, num fonte. */
export function termosPresentes(fonte, termos) {
  const limpo = mascararComentariosJs(fonte);
  return termos.filter((termo) => {
    const escapado = termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}_])${escapado}($|[^\\p{L}\\p{N}_])`, "u").test(
      limpo,
    );
  });
}

/** Todo `type` que aparece na árvore de um documento. */
function tiposDeNo(no, achados = new Set()) {
  if (no === null || typeof no !== "object") return achados;
  if (typeof no.type === "string") achados.add(no.type);
  for (const filho of Array.isArray(no.content) ? no.content : []) {
    tiposDeNo(filho, achados);
  }
  return achados;
}

/** Toda marca que aparece na árvore de um documento. */
function marcasDoDocumento(no, achados = new Set()) {
  if (no === null || typeof no !== "object") return achados;
  for (const marca of Array.isArray(no.marks) ? no.marks : []) {
    if (typeof marca?.type === "string") achados.add(marca.type);
  }
  for (const filho of Array.isArray(no.content) ? no.content : []) {
    marcasDoDocumento(filho, achados);
  }
  return achados;
}

/** O texto corrido de um documento, para conferir o que sobreviveu. */
function textoBruto(no) {
  if (no === null || typeof no !== "object") return "";
  if (no.type === "text") return String(no.text ?? "");
  return (Array.isArray(no.content) ? no.content : []).map(textoBruto).join(" ");
}

/** O primeiro nó que satisfaz o teste, em profundidade. */
function acharNo(no, teste) {
  if (no === null || typeof no !== "object") return null;
  if (teste(no)) return no;
  for (const filho of Array.isArray(no.content) ? no.content : []) {
    const achado = acharNo(filho, teste);
    if (achado) return achado;
  }
  return null;
}

secao("(0) autoteste dos detectores desta ferramenta");

afirmar(
  "mascararComentariosJs apaga `//` e `/* */` e preserva string",
  mascararComentariosJs('a // titulo2\nb').includes("titulo2") === false &&
    mascararComentariosJs("a /* titulo2 */ b").includes("titulo2") === false &&
    mascararComentariosJs('const x = "titulo2";').includes("titulo2") === true,
);

afirmar(
  "mascararComentariosJs não confunde divisão nem `/` dentro de string com comentário",
  mascararComentariosJs('const r = a / b; const s = "http://x/y";').includes("http://x/y"),
);

/* Os quatro casos de literal de regex. O terceiro é o que existe de verdade em
   `schema.js` (`/\s/u.test(...)`) e o que corrompia o arquivo inteiro; o
   quarto tem uma barra DENTRO da classe de caracteres, que não fecha nada. */
afirmar(
  "mascararComentariosJs entende literal de expressão regular e não sai desalinhado",
  (() => {
    const casos = [
      ["const r = /ab/.test(x); const alvo = 1;", "alvo"],
      ["if (/\\s/u.test(v)) return false; const alvo = 1;", "alvo"],
      ["const r = a.replace(/[/]/g, ''); const alvo = 1;", "alvo"],
      ["return /x*/g; const alvo = 1;", "alvo"],
    ];
    return casos.every(([fonte, marca]) => {
      const limpo = mascararComentariosJs(fonte);
      return limpo.includes(marca) && limpo.length === fonte.length;
    });
  })(),
);

afirmar(
  "mascararComentariosJs continua tratando `/` depois de valor como divisão",
  (() => {
    const fonte = "const m = total / 2; // some\nconst alvo = 3;";
    const limpo = mascararComentariosJs(fonte);
    return limpo.includes("alvo") && !limpo.includes("some") && limpo.length === fonte.length;
  })(),
);

/* A prova que interessa: o arquivo REAL, que contém literais de regex, sai do
   mascarador com o mesmo tamanho e com o código ainda legível. Antes, ele saía
   em branco a partir da primeira regex — e toda asserção sobre ele passava por
   não encontrar nada. */
afirmar(
  "mascararComentariosJs atravessa `src/domain/blog/schema.js` sem engolir o código",
  (() => {
    const fonte = readFileSync(path.join(raiz, "src/domain/blog/schema.js"), "utf8");
    const limpo = mascararComentariosJs(fonte);
    return (
      limpo.length === fonte.length &&
      limpo.includes("export function validarDocumento") &&
      limpo.includes("PROFUNDIDADE_MAXIMA") &&
      // A última declaração do arquivo continua visível: se a máquina de
      // estados desviasse numa regex do meio, daqui para baixo seria espaço.
      limpo.includes("export function textoDoDocumento")
    );
  })(),
);

afirmar(
  "termosPresentes acusa lista escrita à mão e absolve menção em comentário",
  igual(termosPresentes('const b = [{ chave: "titulo2" }];', ["titulo2"]), ["titulo2"]) &&
    igual(termosPresentes("// escrever titulo2 aqui seria errado\n", ["titulo2"]), []),
);

afirmar(
  "termosPresentes exige palavra inteira (`link` não casa com `linkedin`)",
  igual(termosPresentes('const a = "linkedin";', ["link"]), []) &&
    igual(termosPresentes('const a = "link";', ["link"]), ["link"]),
);

afirmar(
  "igualProfundo ignora a ordem das chaves e não ignora o conteúdo",
  igualProfundo({ a: 1, b: [{ x: 1, y: 2 }] }, { b: [{ y: 2, x: 1 }], a: 1 }) &&
    !igualProfundo({ a: 1 }, { a: 2 }) &&
    !igualProfundo({ a: 1 }, { a: 1, b: 1 }) &&
    !igualProfundo([1, 2], [2, 1]) &&
    !igualProfundo({ a: null }, { a: undefined }),
);

afirmar(
  "tiposDeNo, marcasDoDocumento e textoBruto atravessam a árvore",
  (() => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "oi", marks: [{ type: "bold" }] }],
            },
          ],
        },
      ],
    };
    return (
      igual([...tiposDeNo(doc)].sort(), ["blockquote", "doc", "paragraph", "text"]) &&
      igual([...marcasDoDocumento(doc)], ["bold"]) &&
      textoBruto(doc).includes("oi") &&
      acharNo(doc, (n) => n.type === "blockquote") !== null &&
      acharNo(doc, (n) => n.type === "table") === null
    );
  })(),
);

/* ─── (a) Dependências e encadeamento ────────────────────────────────────── */

secao("(a) dependências do editor e encadeamento da auditoria");

const pkg = tentar("package.json legível", () => JSON.parse(ler("package.json")), null);

if (pkg) {
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  for (const nome of PACOTES_EXATOS) {
    const faixa = deps[nome];
    afirmar(
      `\`${nome}\` está declarado em versão EXATA, sem faixa`,
      typeof faixa === "string" && /^\d+\.\d+\.\d+$/.test(faixa),
      `declarado: ${JSON.stringify(faixa ?? null)}`,
    );
  }

  const versoes = PACOTES_EXATOS.map((nome) => deps[nome]);
  afirmar(
    "os quatro pacotes do Tiptap estão na MESMA versão",
    new Set(versoes).size === 1,
    versoes.join(" / "),
  );

  afirmar(
    "`jsdom` está em devDependencies (a prova de colagem precisa de DOM)",
    typeof (pkg.devDependencies ?? {}).jsdom === "string",
  );

  afirmar(
    "o script `verificar` encadeia `verificar:editor`",
    (pkg.scripts?.verificar ?? "").includes("verificar:editor") &&
      typeof pkg.scripts?.["verificar:editor"] === "string",
  );
}

/* Uma versão declarada não é uma versão instalada: peers divergentes de
   `@tiptap/pm` produzem DUAS instâncias do ProseMirror, e o sintoma é um erro
   de tempo de execução sem relação aparente com a causa. */
{
  const instaladas = PACOTES_EXATOS.map((nome) => {
    try {
      return JSON.parse(ler(path.join("node_modules", nome, "package.json"))).version;
    } catch {
      return null;
    }
  });
  afirmar(
    "os quatro pacotes INSTALADOS estão na mesma versão",
    instaladas.every((v) => v !== null) && new Set(instaladas).size === 1,
    PACOTES_EXATOS.map((n, i) => `${n}@${instaladas[i] ?? "ausente"}`).join(" "),
  );
  const declarada = pkg ? { ...(pkg.dependencies ?? {}) }[PACOTES_EXATOS[0]] : null;
  afirmar(
    "a versão instalada é exatamente a declarada",
    instaladas[0] !== null && instaladas[0] === declarada,
    `instalada ${instaladas[0]} / declarada ${declarada}`,
  );
}

/* ─── (b) O schema é domínio puro ────────────────────────────────────────── */

secao("(b) o schema é único, puro e fechado");

const fonteSchema = tentar("o schema é legível", () => ler(CAMINHO_SCHEMA), "");

afirmar(
  "o schema não importa React, Tiptap, Supabase nem toca o DOM",
  fonteSchema !== "" &&
    !/^\s*import\s/m.test(fonteSchema) &&
    !/\b(document|window|navigator)\b/.test(mascararComentariosJs(fonteSchema)),
  "domínio puro: nenhum import, nenhuma referência ao navegador",
);

// Importado num processo SEM DOM nenhum: é o que "executável fora do
// navegador" significa, e é a condição para a Story 2.5 usá-lo no servidor.
const schema = await tentar(
  "o schema importa e executa em Node, antes de existir qualquer DOM",
  () => import(urlDe(CAMINHO_SCHEMA)),
  null,
);

if (schema) {
  afirmar(
    "`ELEMENTOS` tem exatamente treze entradas",
    Array.isArray(schema.ELEMENTOS) && schema.ELEMENTOS.length === 13,
    `encontrado: ${schema.ELEMENTOS?.length}`,
  );

  afirmar(
    "`ELEMENTOS` está congelado (a lista fechada não é editável em tempo de execução)",
    Object.isFrozen(schema.ELEMENTOS) &&
      schema.ELEMENTOS.every((elemento) => Object.isFrozen(elemento)),
  );

  afirmar(
    "os treze elementos são os que a story nomeia, na ordem declarada",
    igual(
      schema.ELEMENTOS.map((e) => e.chave),
      TREZE_ELEMENTOS.map((e) => e.chave),
    ),
    schema.ELEMENTOS.map((e) => e.chave).join(", "),
  );

  for (const esperado of TREZE_ELEMENTOS) {
    const achado = schema.elementoPorChave(esperado.chave);
    afirmar(
      `\`${esperado.chave}\` aponta para \`${esperado.nome}\`${esperado.atributos ? ` ${JSON.stringify(esperado.atributos)}` : ""}`,
      achado?.nome === esperado.nome &&
        igual(achado?.atributos ?? null, esperado.atributos),
      JSON.stringify({ nome: achado?.nome, atributos: achado?.atributos ?? null }),
    );
  }

  for (const elemento of schema.ELEMENTOS) {
    afirmar(
      `\`${elemento.chave}\` diz o que faz (rótulo e frase de ajuda)`,
      typeof elemento.rotulo === "string" &&
        elemento.rotulo.trim() !== "" &&
        typeof elemento.faz === "string" &&
        elemento.faz.trim().length > 10,
      JSON.stringify({ rotulo: elemento.rotulo, faz: elemento.faz }),
    );
  }

  /* A proibição central da story, afirmada em todos os lugares onde `h1`
     poderia entrar: a lista de elementos, os níveis de título e o vocabulário
     de nós. O título do Post é da página. */
  afirmar(
    "`h1` não existe no schema: nem como elemento, nem como nível de título",
    igual([...schema.NIVEIS_DE_TITULO], [2, 3]) &&
      !schema.ELEMENTOS.some(
        (e) => e.nome === "heading" && (e.atributos?.level ?? 0) === 1,
      ) &&
      !schema.NOS_PERMITIDOS.includes("h1") &&
      !schema.NOS_PERMITIDOS.includes("heading1"),
    `níveis: ${JSON.stringify(schema.NIVEIS_DE_TITULO)}`,
  );

  afirmar(
    "tabela não existe no vocabulário de nós",
    !schema.NOS_PERMITIDOS.some((n) =>
      ["table", "tableRow", "tableCell", "iframe"].includes(n),
    ),
    schema.NOS_PERMITIDOS.join(", "),
  );

  afirmar(
    "imagem inline existe no vocabulário de nós",
    schema.NOS_PERMITIDOS.includes("image"),
    schema.NOS_PERMITIDOS.join(", "),
  );

  afirmar(
    "as marcas permitidas são negrito, itálico, destaque e link",
    igual([...schema.MARCAS_PERMITIDAS].sort(), [
      "bold",
      "highlight",
      "italic",
      "link",
    ]),
    schema.MARCAS_PERMITIDAS.join(", "),
  );

  afirmar(
    "todo elemento declara espécie e ação de um vocabulário fechado",
    schema.ELEMENTOS.every(
      (e) =>
        [schema.NO, schema.MARCA].includes(e.especie) &&
        [schema.ALTERNA, schema.INSERE].includes(e.acao) &&
        typeof e.comando === "string" &&
        Array.isArray(e.argumentos),
    ),
    schema.ELEMENTOS.map((e) => `${e.chave}:${e.especie}/${e.acao}`).join(" "),
  );

  afirmar(
    "os nós estruturais estão declarados e não têm controle na barra",
    igual([...schema.NOS_ESTRUTURAIS].sort(), [
      "doc",
      "hardBreak",
      "listItem",
      "paragraph",
      "text",
    ]) &&
      schema.NOS_ESTRUTURAIS.every(
        (nome) => !schema.ELEMENTOS.some((e) => e.nome === nome),
      ),
  );

  afirmar(
    "`enderecoPermitido` aceita endereço comum e recusa esquema executável",
    schema.enderecoPermitido("https://chatclean.com.br/blog") &&
      schema.enderecoPermitido("/blog/post") &&
      schema.enderecoPermitido("#secao") &&
      schema.enderecoPermitido("mailto:oi@chatclean.com.br") &&
      schema.enderecoPermitido("pagina-com-hifen") &&
      !schema.enderecoPermitido("javascript:alert(1)") &&
      !schema.enderecoPermitido("JaVaScRiPt:alert(1)") &&
      !schema.enderecoPermitido("java\nscript:alert(1)") &&
      !schema.enderecoPermitido("data:text/html,<script>x</script>") &&
      !schema.enderecoPermitido("") &&
      !schema.enderecoPermitido(null),
  );

  /* O EIXO QUE FALTAVA: endereço que PARECE interno e resolve para outro host.
     `//evil.com` é relativo de protocolo — o navegador o completa com o
     esquema da página e vai para `https://evil.com`. A checagem antiga
     classificava tudo que começa com `/` como interno, então este caminho
     inteiro nunca foi exercitado. `\` entra junto porque navegadores
     normalizam a barra invertida antes de resolver a autoridade. */
  for (const [entrada, motivo] of [
    ["//evil.com", "relativo de protocolo"],
    ["//evil.com/caminho", "relativo de protocolo com caminho"],
    ["///evil.com", "três barras"],
    ["\\\\evil.com", "UNC com barra invertida"],
    ["/\\evil.com", "barra e barra invertida"],
    ["\\/evil.com", "barra invertida e barra"],
    ["https:/\\evil.com", "esquema bom, autoridade por barra invertida"],
    ["//", "só as duas barras"],
  ]) {
    afirmar(
      `\`enderecoPermitido\` recusa \`${entrada}\` (${motivo})`,
      schema.enderecoPermitido(entrada) === false,
    );
  }

  afirmar(
    "o endereço interno legítimo continua passando (a recusa acima não pegou demais)",
    schema.enderecoPermitido("/blog") &&
      schema.enderecoPermitido("/blog/um-post-com-hifens") &&
      schema.enderecoPermitido("?busca=x") &&
      schema.enderecoPermitido("https://chatclean.com.br//caminho/duplo"),
  );

  /* `target` e `rel` eram lista ABERTA dentro de um schema que se declara
     lista de permissão fechada. A janela aberta sem `noopener` dá à página de
     destino uma referência de escrita para a aba do Painel. */
  {
    const comAlvo = (attrs) =>
      validar({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", marks: [{ type: "link", attrs }], text: "t" },
            ],
          },
        ],
      });
    const atributosDoLink = (resultado) =>
      acharNo(resultado.documento, (n) => n.type === "text")?.marks?.[0]?.attrs ?? {};

    const inventado = atributosDoLink(
      comAlvo({ href: "https://x.com.br", target: "_inventado" }),
    );
    afirmar(
      "`target` fora da lista fechada é descartado",
      !Object.hasOwn(inventado, "target") || inventado.target === null,
      JSON.stringify(inventado),
    );

    const semNoopener = atributosDoLink(
      comAlvo({ href: "https://x.com.br", target: "_blank", rel: "nofollow" }),
    );
    afirmar(
      "`target=\"_blank\"` sem `noopener` recebe o par imposto, não uma sugestão",
      semNoopener.target === "_blank" &&
        String(semNoopener.rel).includes("noopener") &&
        String(semNoopener.rel).includes("noreferrer"),
      JSON.stringify(semNoopener),
    );

    const relSujo = atributosDoLink(
      comAlvo({ href: "https://x.com.br", target: "_self", rel: "noopener me segue-me" }),
    );
    afirmar(
      "`rel` só conserva as palavras conhecidas",
      String(relSujo.rel)
        .split(" ")
        .every((p) => schema.RELACOES_DE_LINK.includes(p)),
      JSON.stringify(relSujo),
    );
  }

  /* `language` do bloco de código viaja até o renderizador de HTML da 2.5. */
  {
    const comLinguagem = (language) =>
      validar({
        type: "doc",
        content: [{ type: "codeBlock", attrs: { language }, content: [{ type: "text", text: "x" }] }],
      });
    const lidaDe = (resultado) =>
      acharNo(resultado.documento, (n) => n.type === "codeBlock")?.attrs?.language ?? null;

    afirmar(
      "`language` conhecida passa, e string arbitrária é descartada",
      lidaDe(comLinguagem("javascript")) === "javascript" &&
        lidaDe(comLinguagem("c++")) === "c++" &&
        lidaDe(comLinguagem(null)) === null &&
        lidaDe(comLinguagem('js" onload="x')) === null &&
        lidaDe(comLinguagem("a".repeat(200))) === null &&
        lidaDe(comLinguagem(42)) === null,
    );
  }

  afirmar(
    "`type` de lista ordenada só aceita os cinco valores do HTML",
    (() => {
      const com = (type) =>
        validar({
          type: "doc",
          content: [
            {
              type: "orderedList",
              attrs: { start: 1, type },
              content: [
                {
                  type: "listItem",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }],
                },
              ],
            },
          ],
        });
      const lido = (r) => acharNo(r.documento, (n) => n.type === "orderedList")?.attrs?.type ?? null;
      return lido(com("a")) === "a" && lido(com("qualquer")) === null;
    })(),
  );
}

/* ─── (c) A barra é derivada ─────────────────────────────────────────────── */

secao("(c) a barra é derivada do schema, e não existe lista paralela");

const configuracao = await tentar(
  "a derivação da barra importa e executa em Node",
  () => import(urlDe(CAMINHO_CONFIGURACAO)),
  null,
);
const icones = await tentar(
  "o mapa de ícones importa e executa em Node",
  () => import(urlDe(CAMINHO_ICONES)),
  null,
);

if (schema && configuracao) {
  const controles = configuracao.controlesDaBarra();

  afirmar(
    "a barra oferece exatamente um controle por elemento do schema, na mesma ordem",
    igual(
      controles.map((c) => c.chave),
      schema.ELEMENTOS.map((e) => e.chave),
    ),
    controles.map((c) => c.chave).join(", "),
  );

  /* A VOZ DOS CONTROLES é cobrada AQUI, e não dentro do render.
     A versão anterior chamava `exigir` dentro de `controlesDaBarra`, que roda
     num `useMemo`: um rótulo mal redigido lançava durante o render e derrubava
     a árvore React inteira — o Painel em branco, e o trabalho em aberto junto.
     Era o desfecho que o próprio `Editor.jsx` argumenta não poder acontecer.
     Rótulo ruim é defeito de quem escreve o schema, e cobra-se na auditoria. */
  {
    const problemas = configuracao.problemasDeVozDosControles();
    afirmar(
      "todo rótulo de controle diz o que o controle faz",
      problemas.length === 0,
      problemas.map((p) => `${p.chave}: ${p.problema}`).join(" | "),
    );
    afirmar(
      "a guarda de voz ACUSA um rótulo genérico — e devolve o problema em vez de lançar",
      (() => {
        const ruim = [
          { ...schema.ELEMENTOS[0], chave: "ruim", rotulo: "Aplicar" },
        ];
        let lancou = false;
        let achados = [];
        try {
          achados = configuracao.problemasDeVozDosControles(ruim);
        } catch {
          lancou = true;
        }
        return !lancou && achados.length === 1 && achados[0].chave === "ruim";
      })(),
    );
    const fonteConfig = tentar(
      `${CAMINHO_CONFIGURACAO} legível`,
      () => ler(CAMINHO_CONFIGURACAO),
      "",
    );
    afirmar(
      "a derivação da barra não lança por voz no caminho de render (`exigir` não é chamado)",
      !/\bexigir\s*\(/.test(mascararComentariosJs(fonteConfig)),
    );
  }

  /* `SUBEXTENSOES_DO_KIT` era uma segunda lista mantida à mão — o que este
     desenho existe para eliminar — e nada a comparava com o que o kit instala.
     Agora a configuração é derivada do próprio pacote, e o que sobra é a lista
     das extensões SEM nó nem marca, que precisa bater por igualdade: uma
     extensão nova, que mexa no documento sem declarar vocabulário, falha a
     auditoria em vez de entrar por omissão. */
  {
    const instaladas = configuracao.extensoesInstaladasPeloKit();
    const semVocabulario = instaladas
      .filter((e) => e.type === "extension")
      .map((e) => e.name)
      .sort();
    afirmar(
      "as extensões do kit que não declaram nó nem marca estão TODAS declaradas, e nenhuma declarada sumiu",
      igual(semVocabulario, Object.keys(configuracao.EXTENSOES_SEM_VOCABULARIO).sort()),
      `o kit instala: [${semVocabulario.join(", ")}]`,
    );
    afirmar(
      "cada extensão sem vocabulário tem a razão de estar ligada escrita junto",
      Object.values(configuracao.EXTENSOES_SEM_VOCABULARIO).every(
        (razao) => typeof razao === "string" && razao.length > 20,
      ),
    );
    afirmar(
      "a configuração do kit é derivada do que ele instala, não de uma tabela paralela",
      (() => {
        const foraDoSchema = instaladas.filter(
          (e) =>
            e.type !== "extension" &&
            !schema.NOS_PERMITIDOS.includes(e.name) &&
            !schema.MARCAS_PERMITIDAS.includes(e.name),
        );
        const desligados = Object.entries(configuracao.configuracaoDoKit()).filter(
          ([, valor]) => valor === false,
        );
        // Um desligamento por vocabulário que o schema não conhece: nem
        // sobrando (desligou o que era para ficar), nem faltando (deixou
        // entrar por omissão).
        return (
          instaladas.length > 0 &&
          foraDoSchema.length > 0 &&
          foraDoSchema.length === desligados.length
        );
      })(),
      `o kit instala ${instaladas.length} extensões; a configuração desliga ${
        Object.values(configuracao.configuracaoDoKit()).filter((v) => v === false).length
      }`,
    );
  }

  afirmar(
    "todo controle carrega rótulo e a frase do que faz, vindos do schema",
    controles.every(
      (c, i) =>
        c.rotulo === schema.ELEMENTOS[i].rotulo &&
        c.descricao === schema.ELEMENTOS[i].faz,
    ),
  );

  afirmar(
    "a barra não oferece título de nível 1",
    !controles.some((c) => c.chave.includes("titulo1")) &&
      !controles.some((c) => c.rotulo.toLowerCase().includes("título 1")),
  );

  /* A PROVA DA DERIVAÇÃO. Não é "a lista de hoje bate com a lista de hoje" —
     é acrescentar um elemento que não existe em lugar nenhum do projeto e
     observar o controle nascer. Uma barra escrita à mão passaria na asserção
     anterior e falharia nesta. */
  {
    const sintetico = Object.freeze({
      chave: "sinteticoDaVerificacao",
      especie: schema.NO,
      nome: "blockquote",
      atributos: null,
      rotulo: "Elemento sintético da verificação",
      faz: "Existe apenas durante a auditoria, para provar que a barra deriva.",
      comando: "toggleBlockquote",
      argumentos: Object.freeze([]),
      pede: null,
      atalho: null,
    });
    const estendida = configuracao.controlesDaBarra([...schema.ELEMENTOS, sintetico]);
    afirmar(
      "acrescentar um elemento ao schema faz o controle correspondente surgir",
      estendida.length === controles.length + 1 &&
        estendida[estendida.length - 1].chave === sintetico.chave &&
        estendida[estendida.length - 1].rotulo === sintetico.rotulo,
      `${controles.length} → ${estendida.length}`,
    );

    const reduzida = configuracao.controlesDaBarra(schema.ELEMENTOS.slice(0, 3));
    afirmar(
      "remover elementos do schema faz os controles sumirem (a derivação vale nos dois sentidos)",
      reduzida.length === 3,
      `${reduzida.length}`,
    );
  }

  /* Nenhuma lista de botões escrita à mão: os nomes dos elementos não aparecem
     no fonte da barra nem no do editor. O mapa de ícones é a exceção declarada
     — e a igualdade de chaves, logo abaixo, é o que a torna segura.

     A BarraFlutuante precisa nomear por CHAVE um subconjunto explícito de
     controles, para decidir ONDE cada um aparece (barra fixa vs. bolha
     flutuante) — "titulo2", "titulo3", "negrito", "italico" (agrupados na
     bolha) e "link" (que sai da barra fixa e vira gatilho de popover na
     bolha). Isso não é uma lista de botões escrita à mão: rótulo, ícone,
     estado e comportamento continuam inteiramente derivados de
     `controlesDaBarra()` — só a SELEÇÃO de chaves é nomeada. É a mesma
     exceção declarada do mapa de ícones, agora para chaves, e a checagem
     cruzada logo abaixo é o que a torna segura: se a exceção aqui divergir
     do que o arquivo realmente nomeia, ela acusa. */
  const EXCECOES_DE_CHAVE_NA_BARRA = Object.freeze({
    [CAMINHO_BARRA]: Object.freeze(["titulo2", "titulo3", "negrito", "italico", "link"]),
  });

  for (const arquivo of [CAMINHO_BARRA, CAMINHO_EDITOR]) {
    const fonte = tentar(`${arquivo} legível`, () => ler(arquivo), "");
    const excecoesDeChave = EXCECOES_DE_CHAVE_NA_BARRA[arquivo] ?? [];
    const termos = [
      ...schema.ELEMENTOS.map((e) => e.chave).filter((chave) => !excecoesDeChave.includes(chave)),
      ...schema.ELEMENTOS.map((e) => e.comando),
      ...schema.ELEMENTOS.map((e) => e.rotulo),
    ];
    const achados = termosPresentes(fonte, termos);
    afirmar(
      `${arquivo} não escreve nenhum elemento do schema à mão (além da exceção declarada de chaves)`,
      achados.length === 0,
      `encontrados: ${achados.join(", ")}`,
    );
  }

  /* A exceção acima só é segura se bater com o que BarraDoEditor.jsx REALMENTE
     nomeia — senão vira uma porta para esconder uma lista completa de botões
     escrita à mão atrás de uma "exceção declarada" cada vez maior. */
  {
    const fonteBarraCru = tentar(`${CAMINHO_BARRA} legível`, () => ler(CAMINHO_BARRA), "");
    const declaracao = /CHAVES_DA_BUBBLE_SIMPLES\s*=\s*Object\.freeze\(\[([^\]]*)\]\)/.exec(
      fonteBarraCru,
    );
    const chavesDaBubbleSimples =
      declaracao?.[1].match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1)) ?? [];
    const nomeiaLinkParaAExcecao =
      /chave\s*===\s*"link"/.test(fonteBarraCru) || /chave\s*!==\s*"link"/.test(fonteBarraCru);
    const chavesRealmenteNomeadas = [
      ...chavesDaBubbleSimples,
      ...(nomeiaLinkParaAExcecao ? ["link"] : []),
    ];
    afirmar(
      "a exceção declarada de chaves bate com o que BarraDoEditor.jsx realmente nomeia — não é uma lista escondida maior",
      igual([...chavesRealmenteNomeadas].sort(), [...EXCECOES_DE_CHAVE_NA_BARRA[CAMINHO_BARRA]].sort()),
      `no arquivo: ${chavesRealmenteNomeadas.join(", ")} | exceção declarada: ${EXCECOES_DE_CHAVE_NA_BARRA[CAMINHO_BARRA].join(", ")}`,
    );
  }

  const fonteBarra = tentar(`${CAMINHO_BARRA} legível`, () => ler(CAMINHO_BARRA), "");
  afirmar(
    "a barra percorre a lista derivada em vez de enumerar botões",
    /controlesDaBarra\s*\(/.test(fonteBarra) && /controles\.map\s*\(/.test(fonteBarra),
  );

  if (icones) {
    afirmar(
      "o mapa de ícones tem exatamente as chaves do schema — nem elemento sem ícone, nem ícone órfão",
      igual(
        Object.keys(icones.ICONES).sort(),
        schema.ELEMENTOS.map((e) => e.chave).sort(),
      ),
      `ícones: ${Object.keys(icones.ICONES).join(", ")}`,
    );
    afirmar(
      "todo ícone é um componente de verdade (nenhuma entrada vazia)",
      Object.values(icones.ICONES).every(
        (icone) => typeof icone === "function" || typeof icone === "object",
      ),
    );
  }

  afirmar(
    "o atalho legível é derivado do atalho declarado, e quem não declara não anuncia",
    configuracao.atalhoLegivel("Mod-Alt-2") === "Ctrl+Alt+2" &&
      configuracao.atalhoLegivel("Mod-b") === "Ctrl+B" &&
      configuracao.atalhoLegivel("Mod-b", true) === "⌘B" &&
      configuracao.atalhoLegivel(null) === null &&
      controles.filter((c) => c.atalhoLegivel === null).length ===
        schema.ELEMENTOS.filter((e) => e.atalho === null).length,
  );
}

/* ─── (d) Validar contra o schema É a higienização ───────────────────────── */

secao("(d) a validação é a higienização — nó e marca fora da lista caem");

/**
 * `validarDocumento`, com a promessa central da story como rede de segurança.
 *
 * A função NÃO PODE lançar — é o que a matriz de I/O exige em duas linhas.
 * Chamá-la crua espalharia esse requisito por dezenas de chamadas: medido por
 * sabotagem, bastou desligar uma checagem para a ferramenta inteira morrer com
 * pilha, sem imprimir uma única FALHA e sem executar as seções seguintes. Aqui
 * a exceção vira asserção falha, o diagnóstico aparece com nome, e o resto da
 * auditoria continua.
 */
function validar(entrada) {
  try {
    return schema.validarDocumento(entrada);
  } catch (erro) {
    afirmar(
      "validarDocumento não lança para quem chama",
      false,
      `${JSON.stringify(entrada)?.slice(0, 80)} → ${erro?.message ?? erro}`,
    );
    return { ok: false, documento: schema.documentoVazio(), descartados: [], erro: null };
  }
}

if (schema) {
  const validarDocumento = validar;

  /* Não existe filtro de HTML por string em LUGAR NENHUM: a higienização é a
     travessia do documento. A asserção varre os quatro módulos da story, e não
     só o schema — dizer "em lugar nenhum" olhando para um arquivo é afirmar
     mais do que se verificou. E lê o fonte MASCARADO: um comentário futuro
     explicando *por que não* se usa DOMPurify derrubaria a auditoria, que é
     exatamente o modo de falha que o mascarador existe para evitar. */
  {
    const suspeito = /innerHTML|<\s*script|sanitize|stripTags|DOMPurify|xss/i;
    for (const arquivo of [
      CAMINHO_SCHEMA,
      CAMINHO_CONFIGURACAO,
      CAMINHO_BARRA,
      CAMINHO_EDITOR,
    ]) {
      const codigo = mascararComentariosJs(tentar(`${arquivo} legível`, () => ler(arquivo), ""));
      afirmar(
        `${arquivo} não filtra HTML por string`,
        !suspeito.test(codigo),
        (suspeito.exec(codigo) ?? [])[0] ?? "",
      );
    }
    // O detector precisa poder acusar: sem isto ele seria uma regex que nunca
    // viu um positivo.
    afirmar(
      "o detector de filtro por string acusa quando o padrão está no CÓDIGO e absolve quando está em comentário",
      suspeito.test(mascararComentariosJs('const x = DOMPurify.sanitize(a);')) &&
        !suspeito.test(mascararComentariosJs("// não usamos DOMPurify aqui\n")),
    );
  }

  const valido = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Seção" }] },
      { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Parte" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", marks: [{ type: "bold" }], text: "forte" },
          { type: "text", text: " e " },
          { type: "text", marks: [{ type: "italic" }], text: "inclinado" },
          { type: "text", text: " e " },
          {
            type: "text",
            marks: [
              {
                type: "link",
                attrs: {
                  href: "https://chatclean.com.br/blog",
                  target: "_blank",
                  rel: "noopener noreferrer nofollow",
                  class: null,
                  title: null,
                },
              },
            ],
            text: "um link",
          },
        ],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "um" }] }],
          },
        ],
      },
      {
        type: "orderedList",
        attrs: { start: 1, type: null },
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "dois" }] }],
          },
        ],
      },
      {
        type: "blockquote",
        content: [{ type: "paragraph", content: [{ type: "text", text: "citado" }] }],
      },
      { type: "codeBlock", attrs: { language: null }, content: [{ type: "text", text: "npm run verificar" }] },
      { type: "horizontalRule" },
    ],
  };

  {
    const antes = JSON.stringify(valido);
    const resultado = validarDocumento(valido);
    afirmar(
      "documento válido é aceito SEM ALTERAÇÃO (ponto fixo, sem depender da ordem das chaves)",
      resultado.ok === true &&
        igualProfundo(resultado.documento, valido) &&
        resultado.totalDescartado === 0,
      `descartados: ${JSON.stringify(resultado.descartados)}`,
    );
    /* O mesmo documento com as chaves embaralhadas — que é como ele volta do
       Postgres na Story 2.5 — continua sendo ponto fixo. */
    const embaralhado = JSON.parse(JSON.stringify(valido), function (chave, valor) {
      if (valor === null || typeof valor !== "object" || Array.isArray(valor)) return valor;
      return Object.fromEntries(Object.entries(valor).reverse());
    });
    afirmar(
      "e continua sendo ponto fixo quando as chaves voltam em outra ordem (`jsonb` do Postgres)",
      igualProfundo(validarDocumento(embaralhado).documento, valido),
      JSON.stringify(embaralhado).slice(0, 160),
    );
    afirmar(
      "a validação não muta a entrada",
      JSON.stringify(valido) === antes,
    );
  }

  {
    // Nó fora do schema: `table`, `video` e `h1`. `image` SAIU desta lista
    // (Editor avançado: entrou no vocabulário) — `video` ocupa o lugar dela
    // como nó que continua inteiramente fora do schema. O que está fora cai;
    // o resto do documento sobrevive inteiro.
    const sujo = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "TITULO H1" }] },
        { type: "paragraph", content: [{ type: "text", text: "sobrevivente um" }] },
        { type: "table", content: [{ type: "tableRow", content: [] }] },
        { type: "video", attrs: { src: "https://exemplo/x.mp4" } },
        { type: "paragraph", content: [{ type: "text", text: "sobrevivente dois" }] },
      ],
    };
    const resultado = validarDocumento(sujo);
    const tipos = tiposDeNo(resultado.documento);
    const texto = textoBruto(resultado.documento);
    afirmar(
      "nó fora do schema é descartado e o resto do documento sobrevive",
      resultado.ok === true &&
        !tipos.has("table") &&
        !tipos.has("video") &&
        texto.includes("sobrevivente um") &&
        texto.includes("sobrevivente dois"),
      JSON.stringify(resultado.documento).slice(0, 200),
    );
    afirmar(
      "título de nível 1 é descartado como qualquer outro nó fora da lista",
      !acharNo(resultado.documento, (n) => n.type === "heading" && n.attrs?.level === 1) &&
        !texto.includes("TITULO H1"),
    );
    afirmar(
      "o que caiu fica registrado, com espécie e nome",
      resultado.descartados.some((d) => d.especie === "no" && d.nome === "table") &&
        resultado.descartados.some((d) => d.especie === "no" && d.nome === "video") &&
        resultado.descartados.some((d) => d.especie === "no" && d.nome.startsWith("heading")),
      JSON.stringify(resultado.descartados),
    );
  }

  {
    // `image` ENTROU no vocabulário — mas um `src` fora da regra de endereço
    // (relativo, sem `https://`/`http://` local) faz o atributo obrigatório
    // desaparecer, e `atributosObrigatorios` derruba o nó inteiro: uma
    // imagem sem endereço aceitável não é imagem. Caminho diferente do nó
    // "fora do schema": aqui a espécie está registrada, só o atributo falha.
    const sujo = {
      type: "doc",
      content: [{ type: "image", attrs: { src: "x.png" } }],
    };
    const resultado = validarDocumento(sujo);
    afirmar(
      "imagem com endereço fora da regra cai por atributo obrigatório ausente, não por nó fora do schema",
      resultado.ok === true &&
        !tiposDeNo(resultado.documento).has("image") &&
        resultado.descartados.some(
          (d) => d.especie === "no" && d.nome === "image (atributo obrigatório fora do schema)",
        ),
      JSON.stringify(resultado.descartados),
    );
  }

  {
    // Marca fora do schema: a marca cai, o TEXTO permanece — a diferença
    // entre marca e nó é justamente esta.
    const sujo = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              marks: [
                { type: "strike" },
                { type: "textStyle", attrs: { color: "red" } },
                { type: "bold" },
              ],
              text: "texto que fica",
            },
          ],
        },
      ],
    };
    const resultado = validarDocumento(sujo);
    const marcas = marcasDoDocumento(resultado.documento);
    afirmar(
      "marca fora do schema é descartada e o texto permanece",
      resultado.ok === true &&
        textoBruto(resultado.documento).includes("texto que fica") &&
        !marcas.has("strike") &&
        !marcas.has("textStyle") &&
        marcas.has("bold"),
      JSON.stringify([...marcas]),
    );
  }

  {
    // Link com esquema executável: a MARCA cai, o texto fica. É o caso em que
    // "descartar o nó" seria a resposta errada.
    const sujo = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
              text: "clique aqui",
            },
          ],
        },
      ],
    };
    const resultado = validarDocumento(sujo);
    afirmar(
      "link com esquema executável perde a marca e conserva o texto",
      textoBruto(resultado.documento).includes("clique aqui") &&
        !marcasDoDocumento(resultado.documento).has("link"),
      JSON.stringify(resultado.documento),
    );
  }

  {
    // Atributo fora da forma declarada some sem derrubar o nó, e `class` com
    // conteúdo é recusada: o HTML do artigo não carrega classe.
    const sujo = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { onclick: "roubar()", style: "color:red" },
          content: [
            {
              type: "text",
              marks: [
                {
                  type: "link",
                  attrs: { href: "https://x.com.br", class: "utilitario-injetado" },
                },
              ],
              text: "texto",
            },
          ],
        },
      ],
    };
    const resultado = validarDocumento(sujo);
    const serializado = JSON.stringify(resultado.documento);
    afirmar(
      "atributo fora da forma declarada é descartado sem derrubar o nó",
      resultado.ok === true &&
        !serializado.includes("onclick") &&
        !serializado.includes("color:red") &&
        !serializado.includes("utilitario-injetado") &&
        textoBruto(resultado.documento).includes("texto"),
      serializado,
    );
  }

  {
    // Marca dentro de bloco de código: código não tem negrito.
    const sujo = {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          content: [{ type: "text", marks: [{ type: "bold" }], text: "npm run" }],
        },
      ],
    };
    const resultado = validarDocumento(sujo);
    afirmar(
      "marca dentro de bloco de código é descartada e o código permanece",
      textoBruto(resultado.documento).includes("npm run") &&
        marcasDoDocumento(resultado.documento).size === 0,
      JSON.stringify(resultado.documento),
    );
  }

  {
    // Documento malformado: recusa com erro claro, sem lançar.
    const entradas = [
      null,
      undefined,
      "<p>html cru</p>",
      42,
      [],
      {},
      { type: "paragraph" },
      { type: "doc", content: "não é lista" },
    ];
    let todasRecusadas = true;
    let lancou = null;
    for (const entrada of entradas) {
      try {
        const resultado = schema.validarDocumento(entrada);
        if (resultado?.ok !== false) todasRecusadas = false;
        if (
          typeof resultado?.erro?.mensagem !== "string" ||
          resultado.erro.mensagem.trim() === "" ||
          typeof resultado?.erro?.detalhe !== "string"
        ) {
          todasRecusadas = false;
        }
      } catch (erro) {
        lancou = `${JSON.stringify(entrada)} → ${erro.message}`;
      }
    }
    afirmar(
      "entrada que não é documento é recusada com erro claro, sem lançar",
      todasRecusadas && lancou === null,
      lancou ?? "alguma entrada não foi recusada, ou o erro veio sem mensagem",
    );
  }

  /* ── Profundidade: o caso que fazia "nunca lança" ser falso ────────────
     A travessia é recursiva; a pilha do runtime é finita. O teste anterior
     usava 400 níveis, que passam sem esforço, então ele não provava nada — a
     função continuava estourando com `RangeError` num documento que cabe num
     JSON pequeno, e é ESTA função que a Story 2.5 vai chamar no servidor com
     entrada de terceiros.
     A profundidade usada aqui é aferida: primeiro se mede quantos níveis a
     pilha deste runtime aguenta, e depois se testa com folga acima disso. */
  {
    const aninhar = (niveis, folha = true) => {
      const raizDoc = { type: "doc", content: [] };
      let cursor = raizDoc;
      for (let i = 0; i < niveis; i += 1) {
        const filho = { type: "blockquote", content: [] };
        cursor.content.push(filho);
        cursor = filho;
      }
      if (folha) {
        cursor.content.push({
          type: "paragraph",
          content: [{ type: "text", text: "fundo" }],
        });
      }
      return raizDoc;
    };

    // Quantos quadros a pilha deste processo aguenta, medido agora.
    let quadros = 0;
    const sondar = () => {
      quadros += 1;
      sondar();
    };
    try {
      sondar();
    } catch {
      /* era esse o ponto: o `RangeError` marca o limite */
    }
    const fundoDeVerdade = Math.max(quadros * 4, 60000);
    nota(`a pilha deste runtime aguenta ~${quadros.toLocaleString("pt-BR")} quadros`);

    let estourou = null;
    let resultadoFundo = null;
    try {
      resultadoFundo = schema.validarDocumento(aninhar(fundoDeVerdade));
    } catch (erro) {
      estourou = `${erro?.name}: ${erro?.message}`;
    }
    afirmar(
      `validarDocumento não estoura com ${fundoDeVerdade.toLocaleString("pt-BR")} níveis de aninhamento`,
      estourou === null && resultadoFundo?.ok === true,
      estourou ?? "",
    );
    afirmar(
      "o galho fundo demais é DESCARTADO e o corte fica registrado",
      resultadoFundo?.totalDescartado > 0 &&
        resultadoFundo.descartados.some((d) => /aninhamento/.test(d.nome)),
      JSON.stringify(resultadoFundo?.descartados?.[0] ?? null),
    );

    let estourouTexto = null;
    try {
      schema.textoDoDocumento(aninhar(fundoDeVerdade));
    } catch (erro) {
      estourouTexto = `${erro?.name}: ${erro?.message}`;
    }
    afirmar(
      "textoDoDocumento também atravessa o documento fundo sem estourar a pilha",
      estourouTexto === null,
      estourouTexto ?? "",
    );

    // E o aninhamento normal de um artigo continua passando inteiro.
    const raso = schema.validarDocumento(aninhar(6));
    afirmar(
      "o aninhamento de um artigo de verdade (seis níveis) atravessa intacto",
      raso.ok === true && raso.totalDescartado === 0 && textoBruto(raso.documento).includes("fundo"),
      `descartados: ${raso.totalDescartado}`,
    );
  }

  /* O relatório do que caiu tem teto — e o teto precisa ser VISÍVEL, senão uma
     tela que diga "200 removidos" mentirá quando forem cinco mil. */
  {
    const muitos = {
      type: "doc",
      content: Array.from({ length: 5000 }, () => ({ type: "table", content: [] })).concat([
        { type: "paragraph", content: [{ type: "text", text: "sobrevivente" }] },
      ]),
    };
    const resultado = validar(muitos);
    afirmar(
      "com mais descartes que o teto do relatório, a CONTAGEM é a real e o truncamento é sinalizado",
      resultado.totalDescartado === 5000 &&
        resultado.descartados.length === schema.LIMITE_DO_RELATORIO &&
        resultado.descartadosTruncados === true &&
        textoBruto(resultado.documento).includes("sobrevivente"),
      JSON.stringify({
        total: resultado.totalDescartado,
        lista: resultado.descartados.length,
        truncado: resultado.descartadosTruncados,
      }),
    );
    const poucos = validar({
      type: "doc",
      content: [{ type: "table", content: [] }, { type: "paragraph" }],
    });
    afirmar(
      "sem truncamento, a bandeira fica baixada e a contagem bate com a lista",
      poucos.descartadosTruncados === false &&
        poucos.totalDescartado === poucos.descartados.length,
      JSON.stringify({ total: poucos.totalDescartado, lista: poucos.descartados.length }),
    );
  }

  {
    // NUNCA lança para quem chama: entradas hostis e malformadas.
    const profundo = { type: "doc", content: [] };
    let cursor = profundo;
    for (let i = 0; i < 400; i += 1) {
      const filho = { type: "blockquote", content: [] };
      cursor.content.push(filho);
      cursor = filho;
    }
    cursor.content.push({ type: "paragraph", content: [{ type: "text", text: "fundo" }] });

    const hostis = [
      profundo,
      { type: "doc", content: [{ type: "heading", attrs: null }] },
      { type: "doc", content: [{ type: "text", text: 42 }] },
      { type: "doc", content: [null, undefined, 7, "x", []] },
      { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "a", marks: "não é lista" }] }] },
      { type: "doc", content: [{ type: "horizontalRule", content: [{ type: "text", text: "x" }] }] },
      { type: "doc", content: [{ type: "listItem", content: [] }] },
      Object.assign({ type: "doc", content: [] }, { toJSON: () => { throw new Error("armadilha"); } }),
    ];
    let problema = null;
    for (const entrada of hostis) {
      try {
        const resultado = schema.validarDocumento(entrada);
        if (typeof resultado?.ok !== "boolean") problema = "resultado sem `ok`";
      } catch (erro) {
        problema = `lançou: ${erro.message}`;
      }
    }
    afirmar(
      "a validação nunca lança, nem para documento profundo ou hostil",
      problema === null,
      problema ?? "",
    );
  }

  {
    // Idempotência: validar o já validado não muda mais nada. Sem isto, uma
    // higienização poderia "limpar" indefinidamente e a Story 2.5 gravaria
    // algo diferente do que o Editor mostrou.
    const sujo = {
      type: "doc",
      content: [
        { type: "table", content: [] },
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "x" }] },
        { type: "paragraph", content: [{ type: "text", marks: [{ type: "strike" }], text: "ok" }] },
      ],
    };
    const uma = validarDocumento(sujo);
    const duas = validarDocumento(uma.documento);
    afirmar(
      "a higienização é idempotente: validar o já validado não muda nada",
      igual(uma.documento, duas.documento) && duas.descartados.length === 0,
      JSON.stringify(duas.descartados),
    );
  }

  {
    const vazio = validarDocumento({ type: "doc", content: [] });
    afirmar(
      "documento sem bloco nenhum vira o parágrafo vazio, que é o piso do formato",
      vazio.ok === true && igual(vazio.documento, schema.documentoVazio()),
      JSON.stringify(vazio.documento),
    );
  }
}

/* ─── (e) e (f) O editor de verdade, montado em DOM ──────────────────────── */

secao("(e) o editor real: só existe nele o que o schema conhece");

/* O navegador de mentira vem de `montagem-comum.mjs` — ver o comentário do
   import, no topo desta ferramenta. */

/**
 * Compila os componentes React para um pacote que o Node consegue importar.
 *
 * O empacotador em si mora em `montagem-comum.mjs`: o que fica aqui é o que é
 * DESTA ferramenta — quais módulos entram no pacote e quais dublês trocam a
 * fronteira de dados.
 */
async function compilarComponentes() {
  const pasta = criarPastaDeCompilacao("verificar-editor-");

  const alvo = path.join(raiz, CAMINHO_EDITOR).split(path.sep).join("/");
  const alvoDaConfiguracao = path
    .join(raiz, CAMINHO_CONFIGURACAO)
    .split(path.sep)
    .join("/");
  // `prepararConteudo` mudou de casa: função pura não mora em arquivo de
  // componente, senão a recarga rápida cai e o lint cobra.
  const alvoDoConteudo = path
    .join(raiz, CAMINHO_CONTEUDO)
    .split(path.sep)
    .join("/");

  /* ── A fronteira de dados, dublada ─────────────────────────────────────
     A tela da Story 2.6 fala com três módulos de `data/blog`, e os três falam
     com a rede. Aqui interessa o que a TELA faz — a gaveta que recolhe, a
     pendência que aparece e some, o conteúdo que sobrevive a uma gravação
     recusada —, e nenhuma dessas coisas se observa se o salvamento depender de
     ambiente e de servidor: `verificar:editor` roda sem rede, e "falha porque
     não havia `.env`" é exatamente a falha que não é falha.

     Os dublês trocam SÓ as funções que viajam. Tudo o mais é reexportado dos
     módulos reais com `export *`, e a igualdade dos conjuntos de exportação é
     AFIRMADA adiante, executando: um dublê que deixe de acompanhar a forma do
     módulo real é acusado em vez de mentir em silêncio. O comportamento dos
     módulos reais é provado onde ele existe — `verificar:dados` e
     `verificar:escrita`, esta última contra o Supabase de verdade. */
  const arquivoDoControle = path.join(pasta, "controle.js");
  writeFileSync(
    arquivoDoControle,
    "/* O que os dublês respondem, e o que eles registraram. */\n" +
      "export const controle = {\n" +
      "  pedidos: [],\n" +
      "  resposta: { ok: true, dados: { criado: false, post: null } },\n" +
      "  post: { ok: false, erro: { tipo: 'nao_encontrado', mensagem: 'sem post' } },\n" +
      /* O que a prévia PEDIU, ida a ida (Story 2.13). É por aqui que se prova
         que identificador fora do formato não produz pedido nenhum. */
      "  pedidos_de_post: [],\n" +
      "  aoLerPost: null,\n" +
      "  categorias: { ok: true, dados: [] },\n" +
      "  leituras_publicas_de_categoria: 0,\n" +
      /* Story 2.15: as leituras do SITE. `pedidos_publicos` guarda o que a
         listagem pública perguntou ao banco — é por aí que se prova que o termo
         digitado e a Categoria escolhida viram consulta, em vez de virarem
         filtro em memória sobre o que já estava carregado. `aoBuscarPublicos`,
         quando é função, tem precedência: é ela que permite SEGURAR a resposta
         e observar o esqueleto, que de outro modo resolve no primeiro
         microtask. */
      "  posts_publicos: { ok: true, dados: [] },\n" +
      "  pedidos_publicos: [],\n" +
      "  aoBuscarPublicos: null,\n" +
      "  post_publico: { ok: false, erro: { tipo: 'nao_encontrado', mensagem: 'Não encontramos o que você procura.' } },\n" +
      "  pedidos_de_slug: [],\n" +
      "  aoLerPostPublico: null,\n" +
      "  relacionados: { ok: true, dados: [] },\n" +
      "  pedidos_de_relacionados: [],\n" +
      "  tags_publicas: { ok: true, dados: [] },\n" +
      "  pedidos_de_tags: [],\n" +
      /* Onde a rolagem foi mandada. `ScrollToTop` é global e mora acima das
         rotas; é aqui que se observa que trocar de artigo a aciona. */
      "  rolagens: [],\n" +
      "  tags: { ok: true, dados: [] },\n" +
      "  tagsDoPost: { ok: true, dados: [] },\n" +
      /* A listagem da Story 2.10. `aoListar`, quando é função, tem precedência:
         é ela que permite SEGURAR a resposta e observar o esqueleto — uma
         resposta pronta resolve no primeiro microtask e o carregamento nunca
         chega a ser desenhado. `listagens` conta as idas, que é como se prova
         que o botão de tentar de novo relê de verdade. */
      "  listagem: { ok: true, dados: [] },\n" +
      "  aoListar: null,\n" +
      "  listagens: 0,\n" +
      /* O que a listagem PEDIU, ida a ida. É por aqui que se prova que o termo
         e os Estados chegam à camada — e que uma rajada de teclas não vira uma
         ida por tecla (Story 2.11). */
      "  pedidos_da_listagem: [],\n" +
      /* As operações da Story 2.12, pela MESMA porta. `pedidos_de_*` guarda o
         que a tela pediu — é por aí que se prova que ela manda o identificador
         do Post certo e o valor DESEJADO do Destaque, e não um pedido de
         inversão. `ao*`, quando é função, tem precedência: é ela que permite
         SEGURAR a resposta e observar o alvo desabilitado enquanto o pedido
         corre. */
      "  pedidos_de_exclusao: [],\n" +
      "  pedidos_de_destaque: [],\n" +
      "  exclusao: { ok: true, dados: { operacao: 'excluir', id: null, post: null } },\n" +
      "  destaque: { ok: true, dados: { operacao: 'destacar', id: null, destaque: true, post: null } },\n" +
      "  aoExcluir: null,\n" +
      "  aoDestacar: null,\n" +
      /* Story 2.14: a tela de Categorias. `categorias_do_painel` é o que a
         leitura devolve; `pedidos_de_categoria` guarda o que a tela mandou
         gravar e `pedidos_de_exclusao_de_categoria` o que ela mandou excluir —
         é por aí que se prova que ela passa pela porta única em vez de escrever
         no banco. `aoListarCategorias` permite SEGURAR a resposta e observar o
         esqueleto, que de outro modo resolve no primeiro microtask. */
      "  categorias_do_painel: { ok: true, dados: [] },\n" +
      "  aoListarCategorias: null,\n" +
      "  leituras_de_categoria: 0,\n" +
      "  pedidos_de_categoria: [],\n" +
      "  pedidos_de_exclusao_de_categoria: [],\n" +
      "  categoria_salva: { ok: true, dados: { operacao: 'salvarCategoria', criada: false, categoria: null } },\n" +
      "  categoria_excluida: { ok: true, dados: { operacao: 'excluirCategoria', id: null, categoria: null } },\n" +
      "  aoSalvarCategoria: null,\n" +
      "  aoExcluirCategoria: null,\n" +
      /* Story 3.1: O ENVIO DA CAPA. `pedidos_de_envio` guarda os arquivos que
         a tela mandou — é por aí que se prova que ela manda o arquivo escolhido
         e não outro. `aoEnviar`, quando é função, tem precedência: é ela que
         permite SEGURAR a resposta e observar a indicação de progresso, que de
         outro modo resolve no primeiro microtask e nunca chega a ser
         desenhada. */
      "  pedidos_de_envio: [],\n" +
      /* E as REMOÇÕES pedidas pela tela (Story 3.1, revisão): é por aqui que
         se prova que a capa enviada e nunca salva sai do bucket pela sessão,
         e que a capa GRAVADA não sai — os dois arquivos têm donos
         diferentes. */
      "  pedidos_de_remocao: [],\n" +
      /* Story 3.2: A RAIZ DO PROJETO. O módulo real a lê do ambiente, e a
         ferramenta roda sem `.env` — sem o dublê ela seria `""`, a gaveta leria
         toda capa do bucket como "de fora" e o seletor de arquivo deixaria de
         existir no meio das asserções de envio. É a MESMA raiz dos endereços
         que o dublê de envio devolve. */
      "  base_do_projeto: 'https://x.supabase.co',\n" +
      "  aoEnviar: null,\n" +
      "  envio: { ok: true, dados: { url: 'https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/0a1b2c3d-4e5f-6789-abcd-ef0123456789.png', caminho: 'capas/0a1b2c3d-4e5f-6789-abcd-ef0123456789.png' } },\n" +
      /* O que a tela ANUNCIOU, em ordem. `{ tom, oQueHouve, oQueFazer }` — as
         duas metades separadas, como `notificarErro` as exige. */
      "  avisos: [],\n" +
      "};\n",
  );

  const arquivoDaEscrita = path.join(pasta, "duble-escrita.js");
  writeFileSync(
    arquivoDaEscrita,
    `export * from ${caminhoDeModulo(CAMINHO_ESCRITA)};\n` +
      'import { controle } from "./controle.js";\n' +
      "export async function salvarPost(corpo) {\n" +
      "  controle.pedidos.push(corpo);\n" +
      "  return controle.resposta;\n" +
      "}\n" +
      "export async function excluirPost(id) {\n" +
      "  controle.pedidos_de_exclusao.push(id);\n" +
      "  if (typeof controle.aoExcluir === 'function') return controle.aoExcluir(id);\n" +
      "  return controle.exclusao;\n" +
      "}\n" +
      "export async function definirDestaque(id, destaque) {\n" +
      "  controle.pedidos_de_destaque.push({ id, destaque });\n" +
      "  if (typeof controle.aoDestacar === 'function') return controle.aoDestacar(id, destaque);\n" +
      "  return controle.destaque;\n" +
      "}\n" +
      "export async function salvarCategoria(campos, opcoes) {\n" +
      "  controle.pedidos_de_categoria.push({ campos, id: opcoes?.id ?? null });\n" +
      "  if (typeof controle.aoSalvarCategoria === 'function') return controle.aoSalvarCategoria(campos, opcoes);\n" +
      "  return controle.categoria_salva;\n" +
      "}\n" +
      "export async function excluirCategoria(id) {\n" +
      "  controle.pedidos_de_exclusao_de_categoria.push(id);\n" +
      "  if (typeof controle.aoExcluirCategoria === 'function') return controle.aoExcluirCategoria(id);\n" +
      "  return controle.categoria_excluida;\n" +
      "}\n",
  );

  /* O ENVIO DA CAPA, dublado (Story 3.1). O módulo real fala com o Storage —
     e `verificar:editor` roda sem rede. O que interessa aqui é o que a TELA
     faz: recusar, mostrar progresso, mostrar miniatura. O comportamento do
     módulo real é provado onde ele existe, em `verificar:escrita`, com as
     costuras injetáveis dele. */
  const arquivoDosArquivos = path.join(pasta, "duble-arquivos.js");
  writeFileSync(
    arquivoDosArquivos,
    `export * from ${caminhoDeModulo(CAMINHO_ARQUIVOS_DA_CAMADA)};\n` +
      'import { controle } from "./controle.js";\n' +
      "export async function enviarImagemDeCapa(arquivo) {\n" +
      "  controle.pedidos_de_envio.push(arquivo);\n" +
      "  if (typeof controle.aoEnviar === 'function') return controle.aoEnviar(arquivo);\n" +
      "  return controle.envio;\n" +
      "}\n" +
      "export async function removerImagemDeCapa(endereco) {\n" +
      "  controle.pedidos_de_remocao.push(endereco);\n" +
      "  return { ok: true, dados: { caminho: endereco } };\n" +
      "}\n" +
      /* Story 3.2: a raiz do projeto, que o Editor repassa à gaveta para ela
         saber se a capa gravada é NOSSA e abrir no modo certo. */
      "export function baseDoProjeto() {\n" +
      "  return controle.base_do_projeto;\n" +
      "}\n",
  );

  const arquivoDasNotificacoes = path.join(pasta, "duble-notificacoes.js");
  writeFileSync(
    arquivoDasNotificacoes,
    `export * from ${caminhoDeModulo(CAMINHO_NOTIFICACOES)};\n` +
      `export { default } from ${caminhoDeModulo(CAMINHO_NOTIFICACOES)};\n` +
      'import { controle } from "./controle.js";\n' +
      /* As GUARDAS DE VOZ continuam valendo: o dublê chama as reais antes de
         registrar, senão ele viraria um jeito de a tela dizer qualquer coisa
         sem ninguém cobrar. O que ele troca é só o transporte. */
      `import { notificarSucesso as sucessoReal, notificarErro as erroReal } from ${caminhoDeModulo(CAMINHO_NOTIFICACOES)};\n` +
      "export function notificarSucesso(oQueAconteceu, detalhe) {\n" +
      "  const saida = sucessoReal(oQueAconteceu, detalhe);\n" +
      "  controle.avisos.push({ tom: 'sucesso', oQueHouve: oQueAconteceu, oQueFazer: detalhe ?? '' });\n" +
      "  return saida;\n" +
      "}\n" +
      "export function notificarErro(oQueHouve, oQueFazer, saidaExtra) {\n" +
      "  const saida = erroReal(oQueHouve, oQueFazer, saidaExtra ?? null);\n" +
      "  controle.avisos.push({ tom: 'erro', oQueHouve, oQueFazer });\n" +
      "  return saida;\n" +
      "}\n",
  );

  const arquivoDosPosts = path.join(pasta, "duble-posts.js");
  writeFileSync(
    arquivoDosPosts,
    `export * from ${caminhoDeModulo(CAMINHO_POSTS)};\n` +
      'import { controle } from "./controle.js";\n' +
      /* O identificador PEDIDO é registrado: é assim que se prova que um
         identificador fora do formato não vira pedido à rede (Story 2.13). */
      "export async function lerPostDoPainelPorId(id) {\n" +
      "  controle.pedidos_de_post.push(id);\n" +
      "  if (typeof controle.aoLerPost === 'function') return controle.aoLerPost(id);\n" +
      "  return controle.post;\n" +
      "}\n" +
      "export async function listarPostsDoPainel(pedido) {\n" +
      "  controle.listagens += 1;\n" +
      "  controle.pedidos_da_listagem.push(pedido ?? null);\n" +
      "  if (typeof controle.aoListar === 'function') return controle.aoListar(pedido);\n" +
      "  return controle.listagem;\n" +
      "}\n" +
      /* As leituras do SITE (Story 2.15). O pedido é registrado porque é ele
         que prova que a busca e o filtro acontecem NO BANCO — um `includes`
         sobre a lista já carregada não produziria pedido nenhum. */
      "export async function buscarPostsPublicos(pedido) {\n" +
      "  controle.pedidos_publicos.push(pedido ?? null);\n" +
      "  if (typeof controle.aoBuscarPublicos === 'function') return controle.aoBuscarPublicos(pedido);\n" +
      "  return controle.posts_publicos;\n" +
      "}\n" +
      "export async function lerPostPublicoPorSlug(slug) {\n" +
      "  controle.pedidos_de_slug.push(slug);\n" +
      "  if (typeof controle.aoLerPostPublico === 'function') return controle.aoLerPostPublico(slug);\n" +
      "  return controle.post_publico;\n" +
      "}\n" +
      "export async function listarRelacionadosPublicos(pedido) {\n" +
      "  controle.pedidos_de_relacionados.push(pedido ?? null);\n" +
      "  return controle.relacionados;\n" +
      "}\n",
  );

  const arquivoDaTaxonomia = path.join(pasta, "duble-taxonomia.js");
  writeFileSync(
    arquivoDaTaxonomia,
    `export * from ${caminhoDeModulo(CAMINHO_TAXONOMIA)};\n` +
      'import { controle } from "./controle.js";\n' +
      "export async function listarCategorias() {\n" +
      "  controle.leituras_publicas_de_categoria += 1;\n" +
      "  return controle.categorias;\n" +
      "}\n" +
      "export async function listarTagsDoPainel() {\n" +
      "  return controle.tags;\n" +
      "}\n" +
      "export async function listarTags() {\n" +
      "  return controle.tags;\n" +
      "}\n" +
      "export async function listarTagsDoPostNoPainel() {\n" +
      "  return controle.tagsDoPost;\n" +
      "}\n" +
      /* O identificador PEDIDO é registrado: sem isso, pedir as Tags do Post
         errado passaria — a tela mostraria as tags de outro artigo. */
      "export async function listarTagsDoPostPublico(postId) {\n" +
      "  controle.pedidos_de_tags.push(postId);\n" +
      "  return controle.tags_publicas;\n" +
      "}\n" +
      "export async function listarCategoriasDoPainel() {\n" +
      "  controle.leituras_de_categoria += 1;\n" +
      "  if (typeof controle.aoListarCategorias === 'function') return controle.aoListarCategorias();\n" +
      "  return controle.categorias_do_painel;\n" +
      "}\n",
  );

  const fonteDaEntrada =
    `export { default as Editor } from ${JSON.stringify(alvo)};\n` +
      `export { prepararConteudo } from ${JSON.stringify(alvoDoConteudo)};\n` +
      `export { controlesDaBarra } from ${JSON.stringify(alvoDaConfiguracao)};\n` +
      `export { default as EditorDePost } from ${caminhoDeModulo(CAMINHO_TELA)};\n` +
      `export { default as ListaDePosts } from ${caminhoDeModulo(CAMINHO_LISTA)};\n` +
      /* A espera da digitação vem DO COMPONENTE, não de um número escrito na
         ferramenta: dois números divergem no dia em que um deles mudar, e a
         asserção passaria a provar outra coisa. */
      `export { ESPERA_DA_BUSCA_MS } from ${caminhoDeModulo(CAMINHO_LISTA)};\n` +
      `export * as regrasDaListagem from ${caminhoDeModulo(CAMINHO_MODULO_DA_LISTAGEM)};\n` +
      `export * as regrasDasAcoes from ${caminhoDeModulo(CAMINHO_MODULO_DAS_ACOES)};\n` +
      `export { default as PreVisualizacaoDePost } from ${caminhoDeModulo(CAMINHO_PREVIA)};\n` +
      `export * as regrasDaPrevia from ${caminhoDeModulo(CAMINHO_MODULO_DA_PREVIA)};\n` +
      /* A tela de Categorias da Story 2.14 e os módulos que ela consome: as
         regras puras, o vocabulário fechado do domínio e o mapa de ícone. Os
         três entram porque as asserções os EXECUTAM — a cor aplicada por
         `style` só se prova comparando o que a tela pintou com o que o
         vocabulário declara. */
      `export { default as TelaDeCategorias } from ${caminhoDeModulo(CAMINHO_TELA_DE_CATEGORIAS)};\n` +
      `export * as regrasDasCategorias from ${caminhoDeModulo(CAMINHO_MODULO_DAS_CATEGORIAS)};\n` +
      `export * as categoriasDoDominio from ${caminhoDeModulo(CAMINHO_CATEGORIAS_DO_DOMINIO)};\n` +
      `export * as regrasDasTags from ${caminhoDeModulo(CAMINHO_TAGS_DO_DOMINIO)};\n` +
      `export * as iconesDeCategoria from ${caminhoDeModulo(CAMINHO_ICONES_DE_CATEGORIA)};\n` +
      /* A gaveta, montada SOZINHA: a Categoria com cor e ícone e a entrada de
         Tag por vírgula são dela, e montá-la pelo Editor inteiro faria a
         asserção depender de tudo o que o Editor carrega. */
      `export { default as GavetaDeMetadados } from ${caminhoDeModulo(CAMINHO_GAVETA)};\n` +
      /* Story 3.1: as regras puras do envio e o vocabulário do arquivo. Os
         dois entram porque as asserções os EXECUTAM — "a indicação não mente"
         só é regra provada quando a fala é uma função chamada, e "a recusa diz
         o limite" só se confere comparando a frase com o número que o
         vocabulário declara. */
      `export * as regrasDaCapa from ${caminhoDeModulo(CAMINHO_MODULO_DA_CAPA)};\n` +
      `export * as regrasDosMetadados from ${caminhoDeModulo(CAMINHO_METADADOS)};\n` +
      `export * as arquivosDoDominio from ${caminhoDeModulo(CAMINHO_ARQUIVOS_DO_DOMINIO)};\n` +
      /* Story 3.4: o contador e as falas da herança (`admin/blog/seo.js`), e a
         função de herança do DOMÍNIO. Os dois entram porque as asserções os
         EXECUTAM — "a tela mostra o que será herdado" só é regra provada
         quando a frase desenhada é comparada com a que o domínio produziu. */
      `export * as regrasDeSeo from ${caminhoDeModulo(CAMINHO_MODULO_DE_SEO)};\n` +
      /* Story 3.5: a Prévia. Ela entra SOZINHA além de entrar pela gaveta —
         o ramo de "a herança não chegou" não é alcançável pela gaveta, que
         sempre passa um resultado, e um ramo que ninguém exercita é um ramo
         que ninguém sabe se funciona. */
      `export { default as CartaoDeCompartilhamento } from ${caminhoDeModulo(CAMINHO_CARTAO)};\n` +
      /* O leitor do Domínio Canônico. Ele lê `import.meta.env`, então precisa
         passar pelo empacotador como o resto — e os dois parâmetros dele
         existem justamente para esta ferramenta poder EXECUTAR cada combinação
         em vez de ler o código. */
      `export * as regrasDoDominio from ${caminhoDeModulo("src/admin/blog/dominio.js")};\n` +
      `export * as compartilhamentoDoDominio from ${caminhoDeModulo(CAMINHO_COMPARTILHAMENTO)};\n` +
      `export * as arquivosReal from ${caminhoDeModulo(CAMINHO_ARQUIVOS_DA_CAMADA)};\n` +
      `export * as arquivosDuble from ${comoModulo(arquivoDosArquivos)};\n` +
      `export { default as BlogPublico } from ${caminhoDeModulo(CAMINHO_BLOG_PUBLICO)};\n` +
      /* A segunda tela pública e as regras puras das duas (Story 2.15). O
         módulo entra porque as asserções o EXECUTAM: "a tela diz o que houve e
         o que fazer" só é regra provada quando a fala é uma função chamada, e
         não um trecho de JSX lido. */
      `export { default as ArtigoPublico } from ${caminhoDeModulo(CAMINHO_ARTIGO_PUBLICO)};\n` +
      `export * as regrasDoBlogPublico from ${caminhoDeModulo(CAMINHO_MODULO_PUBLICO)};\n` +
      `export { default as ScrollToTop } from ${caminhoDeModulo(CAMINHO_ROLAGEM)};\n` +
      `export * as regrasDasRotas from ${caminhoDeModulo(CAMINHO_MODULO_DAS_ROTAS)};\n` +
      `export * as renderizador from ${caminhoDeModulo(CAMINHO_RENDERIZADOR)};\n` +
      `export { controle } from ${comoModulo(arquivoDoControle)};\n` +
      `export * as notificacoesReal from ${caminhoDeModulo(CAMINHO_NOTIFICACOES)};\n` +
      `export * as notificacoesDuble from ${comoModulo(arquivoDasNotificacoes)};\n` +
      `export * as escritaReal from ${caminhoDeModulo(CAMINHO_ESCRITA)};\n` +
      `export * as escritaDuble from ${comoModulo(arquivoDaEscrita)};\n` +
      `export * as postsReal from ${caminhoDeModulo(CAMINHO_POSTS)};\n` +
      `export * as postsDuble from ${comoModulo(arquivoDosPosts)};\n` +
      `export * as taxonomiaReal from ${caminhoDeModulo(CAMINHO_TAXONOMIA)};\n` +
      `export * as taxonomiaDuble from ${comoModulo(arquivoDaTaxonomia)};\n`;

  /* A ordem importa: o apelido específico precisa vir ANTES do genérico `@`,
     senão `@/data/blog/escrita` é resolvido por ele e o dublê nunca entra (e a
     asserção de que ele entrou é o que denuncia isso). O genérico é
     acrescentado por último dentro de `compilarParaNode`. */
  return compilarParaNode({
    pasta,
    fonte: fonteDaEntrada,
    alias: {
      "@/admin/shell/Notificacoes": arquivoDasNotificacoes,
      "@/data/blog/escrita": arquivoDaEscrita,
      "@/data/blog/posts": arquivoDosPosts,
      "@/data/blog/taxonomia": arquivoDaTaxonomia,
      "@/data/blog/arquivos": arquivoDosArquivos,
    },
  });
}

const compilado = await compilarComponentes().then(
  (pronto) => {
    afirmar("os componentes do editor compilam pelo empacotador da aplicação", true);
    return pronto;
  },
  (erro) => {
    afirmar(
      "os componentes do editor compilam pelo empacotador da aplicação",
      false,
      String(erro?.message ?? erro).slice(0, 300),
    );
    return null;
  },
);

const janela = tentar("um DOM de verdade sobe em Node", montarNavegador, null);

let editor = null;
if (janela && schema && configuracao) {
  const nucleo = await tentar("`@tiptap/core` importa", () => import("@tiptap/core"), null);
  if (nucleo) {
    editor = tentar(
      "o editor monta com as extensões DERIVADAS do schema",
      () =>
        new nucleo.Editor({
          element: janela.document.getElementById("area"),
          extensions: configuracao.extensoesDoEditor(),
          ...configuracao.opcoesDoEditor(),
          content: schema.documentoVazio(),
        }),
      null,
    );
  }
}

if (editor && schema && configuracao) {
  const nosDoEditor = Object.keys(editor.schema.nodes);
  const marcasDoEditor = Object.keys(editor.schema.marks);

  afirmar(
    "todo nó do editor está no schema do domínio — nenhum entrou por omissão",
    nosDoEditor.every((nome) => schema.NOS_PERMITIDOS.includes(nome)),
    `no editor: ${nosDoEditor.join(", ")}`,
  );
  afirmar(
    "toda marca do editor está no schema do domínio",
    marcasDoEditor.every((nome) => schema.MARCAS_PERMITIDAS.includes(nome)),
    `no editor: ${marcasDoEditor.join(", ")}`,
  );
  afirmar(
    "todo nó e marca do schema existe no editor (nada ficou só no papel)",
    schema.NOS_PERMITIDOS.every((nome) => nosDoEditor.includes(nome)) &&
      schema.MARCAS_PERMITIDAS.every((nome) => marcasDoEditor.includes(nome)),
    `faltando: ${[...schema.NOS_PERMITIDOS, ...schema.MARCAS_PERMITIDAS]
      .filter((n) => !nosDoEditor.includes(n) && !marcasDoEditor.includes(n))
      .join(", ")}`,
  );

  afirmar(
    "tabela, tachado, sublinhado e código embutido não existem no editor",
    !["table", "strike", "underline", "code"].some(
      (nome) => nosDoEditor.includes(nome) || marcasDoEditor.includes(nome),
    ),
  );

  afirmar(
    "imagem inline e destaque de cor existem no editor",
    nosDoEditor.includes("image") && marcasDoEditor.includes("highlight"),
    `nós: ${nosDoEditor.join(", ")} | marcas: ${marcasDoEditor.join(", ")}`,
  );

  afirmar(
    "o editor não sabe fazer título de nível 1",
    editor.can().toggleHeading({ level: 1 }) === false &&
      editor.can().toggleHeading({ level: 2 }) === true,
  );

  /* A área de escrita veste `.artigo` — a classe global da Story 2.3. É a
     linha que faz "escrever na aparência em que será publicado" deixar de ser
     promessa: é literalmente o mesmo estilo do Blog Público. */
  const classeDaArea = editor.view.dom.className;
  afirmar(
    "a área de escrita carrega a classe `.artigo`",
    /(^|\s)artigo(\s|$)/.test(classeDaArea),
    `classe: ${classeDaArea}`,
  );

  /* E não redeclara a medida: 68ch já vive em `.artigo`. Duas fontes para a
     mesma medida divergem, e a esquecida é a que ganha. */
  const declarada = configuracao.CLASSE_DA_AREA_DE_ESCRITA;
  afirmar(
    "a área de escrita NÃO redeclara a medida do texto",
    !/\bmax-w-|\bw-\[|\bmax-width|ch\]/.test(declarada) &&
      !/\bmax-w-|\bmax-width/.test(mascararComentariosJs(ler(CAMINHO_EDITOR))) &&
      !/\bmax-w-|\bmax-width/.test(mascararComentariosJs(ler(CAMINHO_BARRA))),
    `classe declarada: ${declarada}`,
  );

  {
    const appCss = tentar("src/App.css legível", () => ler(CAMINHO_APP_CSS), "");
    const daClasse = declaracoesDe(appCss, ".artigo");
    const medida = (daClasse.get("max-width") ?? "").trim();
    afirmar(
      "a medida do texto é 68ch, e vem de `.artigo` — o único lugar onde ela existe",
      medida === "68ch",
      `encontrado: ${medida === "" ? "ausente" : medida}`,
    );
    /* A medida está no PRÓPRIO elemento, e não num contêiner: é isso que faz
       recolher a gaveta (Story 2.7) não esticar o texto — a coluna só se
       recentraliza. Um `max-width` em porcentagem, ou herdado do pai,
       responderia à largura de fora. */
    afirmar(
      "a medida é absoluta, na medida do texto — não responde à largura de quem está ao redor",
      /^\d+(\.\d+)?ch$/.test(medida),
      `encontrado: ${medida}`,
    );
  }

  /* Cada controle roda o comando que declarou, num editor de verdade. Um
     comando com nome errado passaria em qualquer inspeção de código. */
  const controles = configuracao.controlesDaBarra();
  const TEXTO_DE_PROVA = "texto de prova";
  for (const controle of controles) {
    const resultado = tentar(
      `o controle \`${controle.chave}\` executa num editor real`,
      () => {
        editor.commands.setContent({
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: TEXTO_DE_PROVA }] }],
        });
        /* Quem ALTERNA age sobre o que está selecionado; quem INSERE age no
           cursor. A distinção vem do schema, e não de um `if` pelo nome do
           elemento: selecionar o texto e mandar inserir uma linha divisória
           substituiria o texto pela linha, e a asserção acusaria um defeito
           que é da prova, não do editor.
           Seleção de TEXTO, e não `selectAll`: a seleção do documento inteiro
           abrange o fim do documento, e `isActive` responde corretamente
           "não, nem tudo está dentro do título". */
        if (controle.alterna) {
          editor.commands.setTextSelection({ from: 1, to: TEXTO_DE_PROVA.length + 1 });
        } else {
          editor.commands.setTextSelection(TEXTO_DE_PROVA.length + 1);
        }
        const antes = JSON.stringify(editor.getJSON());
        const aplicou = controle.aplicar(
          editor,
          controle.pede ? "https://chatclean.com.br/blog" : undefined,
        );
        return {
          aplicou,
          mudou: JSON.stringify(editor.getJSON()) !== antes,
          ativo: controle.estaAtivo(editor),
          texto: textoBruto(editor.getJSON()),
          tipos: [...tiposDeNo(editor.getJSON())],
          marcas: [...marcasDoDocumento(editor.getJSON())],
        };
      },
      null,
    );
    if (resultado === null) continue;

    /* `alinharEsquerda` é a EXCEÇÃO NOMEADA desta checagem: esquerda é o
       `defaultAlignment` da extensão (`configuracao.js`), então todo
       parágrafo JÁ NASCE alinhado à esquerda — aplicar o alinhamento que já
       está lá é, de verdade, um no-op no documento. O comando ainda tem
       êxito, o botão ainda acende (ver a asserção de `ativo`, abaixo); só o
       DOCUMENTO não muda, e é exatamente isso que o resto dos controles não
       compartilha com este. */
    afirmar(
      `\`${controle.chave}\` aplica de verdade: o documento muda e o texto sobrevive`,
      resultado.aplicou === true &&
        (controle.chave === "alinharEsquerda" ? true : resultado.mudou === true) &&
        resultado.texto.includes(TEXTO_DE_PROVA),
      JSON.stringify(resultado).slice(0, 260),
    );

    /* `controle.nome` é `null` para os três de alinhamento (Design Notes,
       `domain/blog/schema.js`): o atributo não troca o TIPO do nó, então não
       há nó nem marca novos para procurar em `tipos`/`marcas`. O que prova
       que o comando fez o que declarou, para estes três, é `estaAtivo` —
       a MESMA função que a barra usa para acender o botão — responder que o
       alinhamento pedido está de fato ali. */
    afirmar(
      controle.nome === null
        ? `\`${controle.chave}\` produz o alinhamento que declarou (sem nó nem marca novos)`
        : `\`${controle.chave}\` produz o \`${controle.nome}\` que declarou`,
      controle.nome === null
        ? resultado.ativo === true
        : controle.especie === schema.MARCA
          ? resultado.marcas.includes(controle.nome)
          : resultado.tipos.includes(controle.nome),
      JSON.stringify({ tipos: resultado.tipos, marcas: resultado.marcas, ativo: resultado.ativo }),
    );

    afirmar(
      controle.alterna
        ? `\`${controle.chave}\` passa a ficar ativo, e a barra tem como mostrar isso`
        : `\`${controle.chave}\` insere e NÃO finge ter estado ativo`,
      controle.alterna ? resultado.ativo === true : resultado.ativo === false,
      JSON.stringify(resultado).slice(0, 260),
    );
  }

  {
    // Endereço recusado não vira link — a mesma regra do domínio, exercitada
    // pelo caminho do controle. E a recusa vem NOMEADA: `formato`.
    const link = controles.find((c) => c.pede);
    editor.commands.setContent({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "isca" }] }],
    });
    editor.commands.selectAll();
    const recusou = link.aplicar(editor, "javascript:alert(1)");
    afirmar(
      "o controle de link recusa esquema executável em vez de aplicá-lo",
      recusou === "formato" && !marcasDoDocumento(editor.getJSON()).has("link"),
      `${recusou} | ${JSON.stringify(editor.getJSON())}`,
    );
    afirmar(
      "o endereço relativo de protocolo também é recusado pelo caminho do controle",
      link.aplicar(editor, "//evil.com") === "formato" &&
        !marcasDoDocumento(editor.getJSON()).has("link"),
    );

    /* O CONTEXTO, que antes era respondido com `true` por conveniência: dentro
       de um bloco de código o botão de link ficava aceso, o Autor digitava um
       endereço perfeito, a aplicação falhava, e a mensagem culpava o endereço.
       Agora o controle sabe que não cabe ali, e a recusa tem outro nome. */
    editor.commands.setContent({
      type: "doc",
      content: [{ type: "codeBlock", content: [{ type: "text", text: "npm run verificar" }] }],
    });
    editor.commands.setTextSelection({ from: 1, to: 5 });
    afirmar(
      "dentro de um bloco de código o controle de link se declara indisponível",
      link.podeAplicar(editor) === false,
    );
    const porContexto = link.aplicar(editor, "https://chatclean.com.br/blog");
    afirmar(
      "e, se for forçado, a recusa é por CONTEXTO — não por formato",
      porContexto === "contexto" && !marcasDoDocumento(editor.getJSON()).has("link"),
      String(porContexto),
    );
    afirmar(
      "as duas recusas têm frases diferentes, e as duas vêm do schema",
      link.recusa("formato", "xx") === link.pede.recusaDeFormato("xx") &&
        link.recusa("contexto") === link.pede.recusaDeContexto &&
        link.recusa("formato", "xx") !== link.recusa("contexto"),
    );

    // Num parágrafo, o mesmo controle volta a ficar disponível.
    editor.commands.setContent({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "cabe aqui" }] }],
    });
    editor.commands.setTextSelection({ from: 1, to: 5 });
    afirmar(
      "num parágrafo o controle de link volta a se declarar disponível",
      link.podeAplicar(editor) === true,
    );
  }

  {
    // O atalho que a dica anuncia é o atalho que a extensão realmente instala.
    for (const elemento of schema.ELEMENTOS) {
      if (!elemento.atalho) continue;
      const extensao = editor.extensionManager.extensions.find(
        (e) => e.name === elemento.nome,
      );
      const teclas = tentar(
        `atalhos de \`${elemento.nome}\` são legíveis`,
        () =>
          Object.keys(
            extensao.config.addKeyboardShortcuts.call({
              editor,
              options: extensao.options,
              name: extensao.name,
              type: null,
              storage: extensao.storage,
            }),
          ),
        [],
      );
      afirmar(
        `o atalho anunciado de \`${elemento.chave}\` (${elemento.atalho}) existe de verdade`,
        teclas.includes(elemento.atalho),
        `a extensão instala: ${teclas.join(", ")}`,
      );
    }
    const semAtalho = schema.ELEMENTOS.filter((e) => e.atalho === null).map((e) => e.chave);
    nota(`sem atalho declarado, e portanto sem atalho anunciado: ${semAtalho.join(", ")}`);
  }
}

/* ─── (f) Colagem ────────────────────────────────────────────────────────── */

secao("(f) colagem, exercitada pelo caminho real");

if (editor && schema) {
  const HTML_DE_FORA = [
    "<h1>Título de nível 1</h1>",
    "<h2>Título de seção</h2>",
    "<h3>Subtítulo</h3>",
    "<p><b>negrito preservado</b> e <i>itálico preservado</i> e <s>tachado</s> e <u>sublinhado</u></p>",
    '<p><a href="https://chatclean.com.br/blog">link preservado</a> e ',
    '<a href="javascript:alert(1)">link executável</a></p>',
    "<ul><li>item com marcador</li></ul>",
    "<ol><li>item numerado</li></ol>",
    "<blockquote><p>citado de fora</p></blockquote>",
    '<table><tbody><tr><td>celula de tabela</td></tr></tbody></table>',
    // `image` SAIU desta lista (Editor avançado: entrou no vocabulário — o
    // editor agora reconhece `<img>` de verdade, ver teste dedicado logo
    // abaixo deste bloco). `<video>` ocupa o lugar dela como tag que continua
    // inteiramente fora do vocabulário do editor, e por isso some na colagem
    // como qualquer marcação não reconhecida.
    "<video src=\"video-de-fora.mp4\"></video>",
    '<div style="color:red" class="utilitario-de-fora"><p>parágrafo em div</p></div>',
    "<script>window.roubar()</script><style>body{display:none}</style>",
    '<p><span style="font-size:44px">texto com estilo</span></p>',
  ].join("");

  const colado = tentar(
    "a colagem de HTML rico roda pelo caminho real do editor",
    () => {
      editor.commands.setContent(schema.documentoVazio());
      editor.view.pasteHTML(HTML_DE_FORA);
      return editor.getJSON();
    },
    null,
  );

  if (colado) {
    const tipos = tiposDeNo(colado);
    const marcas = marcasDoDocumento(colado);
    const texto = textoBruto(colado);

    afirmar(
      "colagem: títulos 2 e 3 preservados",
      acharNo(colado, (n) => n.type === "heading" && n.attrs?.level === 2) !== null &&
        acharNo(colado, (n) => n.type === "heading" && n.attrs?.level === 3) !== null,
      `tipos: ${[...tipos].join(", ")}`,
    );
    afirmar(
      "colagem: negrito e itálico preservados",
      marcas.has("bold") && marcas.has("italic"),
      `marcas: ${[...marcas].join(", ")}`,
    );
    afirmar(
      "colagem: lista com marcadores e lista numerada preservadas",
      tipos.has("bulletList") && tipos.has("orderedList"),
      `tipos: ${[...tipos].join(", ")}`,
    );
    afirmar(
      "colagem: link preservado com o endereço intacto",
      acharNo(
        colado,
        (n) =>
          n.type === "text" &&
          (n.marks ?? []).some(
            (m) => m.type === "link" && m.attrs?.href === "https://chatclean.com.br/blog",
          ),
      ) !== null,
    );
    afirmar(
      "colagem: citação preservada",
      tipos.has("blockquote") && texto.includes("citado de fora"),
    );

    afirmar(
      "colagem: título de nível 1 NÃO vira título — não existe no schema",
      acharNo(colado, (n) => n.type === "heading" && n.attrs?.level === 1) === null,
    );
    afirmar(
      "colagem: tabela e vídeo descartados",
      !tipos.has("table") &&
        !tipos.has("tableRow") &&
        !tipos.has("tableCell") &&
        !tipos.has("video"),
      `tipos: ${[...tipos].join(", ")}`,
    );
    afirmar(
      "colagem: tachado e sublinhado descartados, texto preservado",
      !marcas.has("strike") &&
        !marcas.has("underline") &&
        texto.includes("tachado") &&
        texto.includes("sublinhado"),
      `marcas: ${[...marcas].join(", ")}`,
    );
    afirmar(
      "colagem: link executável não sobrevive como link",
      acharNo(
        colado,
        (n) =>
          n.type === "text" &&
          (n.marks ?? []).some((m) => m.type === "link" && /javascript/i.test(String(m.attrs?.href))),
      ) === null,
    );
    afirmar(
      "colagem: script e estilo da origem não entram como texto",
      !texto.includes("window.roubar") && !texto.includes("display:none"),
      texto.slice(0, 200),
    );
    afirmar(
      "colagem: nenhuma classe nem estilo de fora entra no documento",
      !JSON.stringify(colado).includes("utilitario-de-fora") &&
        !JSON.stringify(colado).includes("font-size") &&
        !JSON.stringify(colado).includes("color:red"),
    );

    afirmar(
      "colagem: todo nó e marca do resultado estão no schema",
      [...tipos].every((t) => schema.NOS_PERMITIDOS.includes(t)) &&
        [...marcas].every((m) => schema.MARCAS_PERMITIDAS.includes(m)),
      `${[...tipos].join(", ")} | ${[...marcas].join(", ")}`,
    );

    afirmar(
      "colagem: o TEXTO dos trechos estilizados sobrevive, e não só a estrutura",
      [
        "Título de seção",
        "Subtítulo",
        "negrito preservado",
        "itálico preservado",
        "link preservado",
        "item com marcador",
        "item numerado",
        "texto com estilo",
        "parágrafo em div",
      ].every((trecho) => texto.includes(trecho)),
      texto.slice(0, 300),
    );

    const revalidado = validar(colado);
    afirmar(
      "o que o editor produz ao colar já é ponto fixo da validação do domínio",
      revalidado.ok === true &&
        igualProfundo(revalidado.documento, colado) &&
        revalidado.totalDescartado === 0,
      JSON.stringify(revalidado.descartados),
    );
  }

  /* Cobertura dedicada da capacidade NOVA: `<img>` colado de fora agora vira
     um nó `image` de verdade — `@tiptap/extension-image` reconhece
     `img[src]:not([src^="data:"])` no HTML colado, e `image` está no
     vocabulário do editor. Fica separado do bloco acima de propósito: o
     `Image` do Tiptap sempre declara `width`/`height` no seu próprio schema
     (mesmo quando a tag colada não os traz — ficam `null`), e nenhum dos dois
     está no vocabulário de `NOS.image` do domínio. Colar imagem NUNCA é
     ponto fixo estrito por causa disso — é um descarte esperado e
     documentado, não uma regressão — então este teste afirma exatamente
     isso, em vez de reaproveitar (e enfraquecer) a asserção estrita acima. */
  {
    const colado2 = tentar(
      "a colagem de uma imagem roda pelo caminho real do editor",
      () => {
        editor.commands.setContent(schema.documentoVazio());
        editor.view.pasteHTML('<img src="https://chatclean.com.br/blog/foto.png" alt="foto">');
        return editor.getJSON();
      },
      null,
    );
    if (colado2) {
      const noImagem = acharNo(colado2, (n) => n.type === "image");
      afirmar(
        "colagem: imagem com endereço absoluto sobrevive no editor, com `src` e `alt` intactos",
        noImagem !== null &&
          noImagem.attrs?.src === "https://chatclean.com.br/blog/foto.png" &&
          noImagem.attrs?.alt === "foto",
        JSON.stringify(noImagem),
      );

      const revalidado2 = validar(colado2);
      const noImagemRevalidado = acharNo(revalidado2.documento, (n) => n.type === "image");
      afirmar(
        "colagem: a imagem sobrevive à revalidação do domínio, só perdendo `width`/`height` — atributos que o Tiptap sempre declara e que não existem em `NOS.image`",
        revalidado2.ok === true &&
          noImagemRevalidado !== null &&
          noImagemRevalidado.attrs?.src === "https://chatclean.com.br/blog/foto.png" &&
          noImagemRevalidado.attrs?.alt === "foto" &&
          revalidado2.descartados.every(
            (d) => d.especie === "atributo" && (d.nome === "width" || d.nome === "height"),
          ) &&
          revalidado2.descartados.length > 0,
        JSON.stringify(revalidado2.descartados),
      );
    }
  }

  /* A ORIGEM MAJORITÁRIA. Num painel de blog quase nada é colado de HTML
     limpo: vem do Google Docs ou do Word, que emitem `<b style="font-weight:
     normal">` em volta de tudo, `<span>` com estilo em cada trecho, listas
     falsas feitas de parágrafos com `mso-list`, e comentários condicionais.
     Sem este caso, a prova de colagem cobria uma origem que quase não existe. */
  {
    const DO_GOOGLE_DOCS =
      '<meta charset="utf-8"><b style="font-weight:normal" id="docs-internal-guid-1">' +
      '<h2 dir="ltr" style="line-height:1.38;margin-top:18pt"><span style="font-size:11pt;font-family:Arial">Seção vinda do Docs</span></h2>' +
      '<p dir="ltr" style="line-height:1.38"><span style="font-weight:700">negrito do Docs</span>' +
      '<span style="font-style:italic"> e itálico do Docs</span></p>' +
      '<ul style="margin-top:0"><li dir="ltr" style="list-style-type:disc"><p dir="ltr"><span>item do Docs</span></p></li></ul>' +
      '<p><a href="https://chatclean.com.br/blog" style="text-decoration:none"><span>link do Docs</span></a></p>' +
      "</b>";

    const DO_WORD =
      '<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style><!-- p.MsoNormal {margin:0} --></style></head><body>' +
      '<!--[if gte mso 9]><xml><o:OfficeDocumentSettings/></xml><![endif]-->' +
      '<p class="MsoNormal"><b><span style="font-size:11.0pt">negrito do Word</span></b>' +
      '<span style="mso-spacerun:yes">  </span><i><span>itálico do Word</span></i></p>' +
      '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><span>item do Word</span></p>' +
      "</body></html>";

    for (const [origem, html, esperados] of [
      [
        "Google Docs",
        DO_GOOGLE_DOCS,
        ["Seção vinda do Docs", "negrito do Docs", "itálico do Docs", "item do Docs", "link do Docs"],
      ],
      ["Word", DO_WORD, ["negrito do Word", "itálico do Word", "item do Word"]],
    ]) {
      const resultado = tentar(`colagem de ${origem} roda`, () => {
        editor.commands.setContent(schema.documentoVazio());
        editor.view.pasteHTML(html);
        return editor.getJSON();
      }, null);
      if (!resultado) continue;

      const texto = textoBruto(resultado);
      const tipos = tiposDeNo(resultado);
      const marcas = marcasDoDocumento(resultado);
      const serializado = JSON.stringify(resultado);

      afirmar(
        `colagem de ${origem}: nenhum texto se perde`,
        esperados.every((trecho) => texto.includes(trecho)),
        texto.slice(0, 220),
      );
      afirmar(
        `colagem de ${origem}: negrito e itálico chegam como MARCA, não como estilo`,
        marcas.has("bold") && marcas.has("italic"),
        `marcas: ${[...marcas].join(", ")}`,
      );
      afirmar(
        `colagem de ${origem}: nada do lixo da origem entra no documento`,
        !serializado.includes("mso-") &&
          !serializado.includes("MsoNormal") &&
          !serializado.includes("font-size") &&
          !serializado.includes("docs-internal-guid") &&
          !serializado.includes("line-height") &&
          [...tipos].every((t) => schema.NOS_PERMITIDOS.includes(t)) &&
          [...marcas].every((m) => schema.MARCAS_PERMITIDAS.includes(m)),
        serializado.slice(0, 240),
      );
      afirmar(
        `colagem de ${origem}: o resultado é ponto fixo da validação`,
        igualProfundo(validar(resultado).documento, resultado),
      );
    }
  }

  /* Colar NO MEIO de um documento, que é o gesto real: o cursor está dentro de
     um parágrafo com texto antes e depois. Colar sempre num documento vazio
     esconde exatamente o modo de falha que importa — o conteúdo em volta ser
     comido pela colagem. */
  {
    const resultado = tentar("colagem no meio de um documento roda", () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "ANTES do ponto de colagem" }] },
          { type: "paragraph", content: [{ type: "text", text: "DEPOIS do ponto de colagem" }] },
        ],
      });
      // Fim do primeiro parágrafo.
      editor.commands.setTextSelection("ANTES do ponto de colagem".length + 1);
      editor.view.pasteHTML("<h2>colado no meio</h2><p><b>com negrito</b></p>");
      return editor.getJSON();
    }, null);

    if (resultado) {
      const texto = textoBruto(resultado);
      afirmar(
        "colar no meio preserva o que estava antes E o que estava depois",
        texto.includes("ANTES do ponto de colagem") &&
          texto.includes("DEPOIS do ponto de colagem") &&
          texto.includes("colado no meio"),
        texto.slice(0, 200),
      );
      afirmar(
        "e o que foi colado no meio chega formatado",
        // O título colado numa posição INLINE funde-se ao parágrafo em curso —
        // é o comportamento correto do ProseMirror, e exigir um `h2` no meio
        // de um parágrafo seria exigir um documento inválido. O que precisa
        // sobreviver é a formatação de trecho.
        marcasDoDocumento(resultado).has("bold") && textoBruto(resultado).includes("com negrito"),
        JSON.stringify(resultado).slice(0, 240),
      );
    }
  }

  /* Colagem SEM formatação: o atalho usual do sistema (Ctrl+Shift+V) leva o
     ProseMirror pelo caminho de texto puro. O que se prova aqui é que texto
     puro chega como texto puro — nem HTML, nem marcação interpretada. */
  const LITERAL = "**não é negrito** _nem itálico_ # nem título - nem lista";
  const puro = tentar(
    "a colagem sem formatação roda pelo caminho de texto do editor",
    () => {
      editor.commands.setContent(schema.documentoVazio());
      editor.view.pasteText(LITERAL);
      return editor.getJSON();
    },
    null,
  );

  if (puro) {
    afirmar(
      "colagem sem formatação: o texto chega literal, sem marca e sem virar bloco",
      textoBruto(puro) === LITERAL &&
        marcasDoDocumento(puro).size === 0 &&
        igual([...tiposDeNo(puro)].sort(), ["doc", "paragraph", "text"]),
      JSON.stringify(puro),
    );

    afirmar(
      "o editor não intercepta a colagem com um manipulador próprio (o atalho do sistema continua sendo o do navegador)",
      typeof editor.options.editorProps?.handlePaste !== "function" &&
        typeof editor.options.editorProps?.handleDrop !== "function",
    );
  }

  /* A asserção acima só vale se ela puder falhar. Com as regras de colagem
     LIGADAS — o padrão do Tiptap —, o mesmo literal vira negrito: é a
     configuração que faz "texto puro" significar o que diz, e não a sorte. */
  if (janela && configuracao) {
    const nucleo = await import("@tiptap/core");
    const StarterKit = (await import("@tiptap/starter-kit")).default;
    const contraprova = tentar(
      "a contraprova monta",
      () =>
        new nucleo.Editor({
          element: janela.document.createElement("div"),
          extensions: [StarterKit.configure(configuracao.configuracaoDoKit())],
          content: schema.documentoVazio(),
        }),
      null,
    );
    if (contraprova) {
      contraprova.view.pasteText(LITERAL);
      const comRegras = contraprova.getJSON();
      afirmar(
        "contraprova: sem `enablePasteRules: false`, o MESMO literal deixaria de ser literal",
        marcasDoDocumento(comRegras).size > 0 || textoBruto(comRegras) !== LITERAL,
        "a asserção de texto puro passaria por sorte, não por configuração",
      );
      afirmar(
        "e a configuração que a story usa desliga as regras de colagem",
        configuracao.opcoesDoEditor().enablePasteRules === false,
      );
      contraprova.destroy();
    }
  }
}

/* ─── (g) O custo do caminho puro ────────────────────────────────────────── */

secao("(g) custo do caminho puro sobre um documento de 20 mil caracteres");

if (schema) {
  /* O limite de 100 ms da story é resposta de TECLADO num navegador: não é
     observável aqui, e afirmar que foi cumprido sem medir seria pior que não
     afirmar. O que é observável é o custo do caminho puro — e o número precisa
     APARECER, para que uma regressão de ordem de grandeza fique visível. */
  const paragrafo =
    "Este é um parágrafo de prova com uma medida realista de texto corrido, " +
    "escrito para que o documento de teste tenha a forma de um artigo de verdade. ";
  const blocos = [];
  let i = 0;
  // O tamanho é MEDIDO no documento montado, não estimado: a primeira versão
  // desta contagem somava uma folga por bloco e parava com 15 mil caracteres —
  // um documento de prova 25% menor que o da story, com o número publicado
  // como se fosse dos 20 mil.
  while (schema.textoDoDocumento({ type: "doc", content: blocos }).length < 20000) {
    const resto = i % 5;
    if (resto === 0) {
      blocos.push({
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: `Seção ${i}` }],
      });
    } else if (resto === 3) {
      blocos.push({
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: paragrafo }] }],
          },
        ],
      });
    } else {
      blocos.push({
        type: "paragraph",
        content: [
          { type: "text", text: paragrafo },
          { type: "text", marks: [{ type: "bold" }], text: "um trecho forte" },
          {
            type: "text",
            marks: [{ type: "link", attrs: { href: "https://chatclean.com.br/blog" } }],
            text: " e um link",
          },
        ],
      });
    }
    i += 1;
  }
  const grande = { type: "doc", content: blocos };
  const tamanho = schema.textoDoDocumento(grande).length;

  /**
   * Mede com AQUECIMENTO e devolve a mediana de verdade.
   *
   * As duas correções são pequenas e mudavam o que o número significava. Sem
   * aquecimento, a primeira execução paga a compilação do V8 e vira o "pior
   * caso" em toda medição — o número publicado era sistematicamente o custo a
   * frio, e uma regressão real ficaria escondida atrás dele. E a "mediana" era
   * o sétimo de doze valores, que é um percentil qualquer: com número par de
   * amostras, a mediana é a média dos dois do meio.
   */
  const medir = (acao) => {
    for (let n = 0; n < 20; n += 1) acao();
    const amostras = [];
    for (let n = 0; n < 25; n += 1) {
      const inicio = process.hrtime.bigint();
      acao();
      amostras.push(Number(process.hrtime.bigint() - inicio) / 1e6);
    }
    amostras.sort((a, b) => a - b);
    const meio = Math.floor(amostras.length / 2);
    const mediana =
      amostras.length % 2 === 1
        ? amostras[meio]
        : (amostras[meio - 1] + amostras[meio]) / 2;
    return { mediana, pior: amostras[amostras.length - 1] };
  };

  const validacao = medir(() => schema.validarDocumento(grande));
  const extracao = medir(() => schema.textoDoDocumento(grande));

  nota(`documento de prova: ${tamanho.toLocaleString("pt-BR")} caracteres, ${blocos.length} blocos`);
  nota(`validarDocumento: mediana ${validacao.mediana.toFixed(2)} ms, pior ${validacao.pior.toFixed(2)} ms`);
  nota(`textoDoDocumento: mediana ${extracao.mediana.toFixed(2)} ms, pior ${extracao.pior.toFixed(2)} ms`);

  afirmar(
    "o documento de prova tem pelo menos 20 mil caracteres",
    tamanho >= 20000,
    `${tamanho}`,
  );
  afirmar(
    `o caminho puro não é o gargalo dos ${LIMITE_DE_RESPOSTA_MS} ms de resposta de teclado`,
    validacao.pior < LIMITE_DE_RESPOSTA_MS,
    `pior caso medido: ${validacao.pior.toFixed(2)} ms`,
  );
  nota(
    "a resposta de teclado no navegador NÃO é medida aqui — depende de layout e " +
      "de pintura, que não existem em Node. Fica registrada como pendência da story.",
  );
}

/* O editor da seção (e) já cumpriu o papel dele, e precisa SAIR antes de a
   tela subir: ele vive no mesmo documento, e um EditorView do ProseMirror
   reassume o foco quando a seleção do documento muda. Com ele de pé, a prova
   de navegação por teclado media a briga entre dois editores em vez de medir a
   barra — o foco saía do botão e voltava para a área de escrita da seção (e). */
if (editor) {
  editor.destroy();
  editor = null;
}

/* ─── (h) O editor montado, na tela ─────────────────────────────────────── */

secao("(h) o editor montado na tela: o que o Autor de fato encontra");

/**
 * Monta o Editor num DOM de verdade e devolve as ferramentas para mexer nele.
 *
 * As seções anteriores provam que a DERIVAÇÃO produz dez controles e que os
 * comandos funcionam quando chamados direto. Isto é outra coisa: prova que o
 * componente desenha esses controles, que clicar neles muda o documento, e que
 * o documento sai pelo canal que as Stories 2.5 e 2.6 vão consumir. Entre uma
 * coisa e outra cabe um defeito inteiro — um `map` truncado, um `return`
 * antecipado, um `onClick` que não chama nada.
 */
async function montarEditor(modulo, React, createRoot, act, props) {
  const alvo = janela.document.createElement("div");
  janela.document.body.appendChild(alvo);

  // Toda reclamação do React vira evidência: um `key` faltando, uma
  // propriedade inválida no botão, um `ref` em componente que não aceita.
  const reclamacoes = [];
  const erroOriginal = console.error;
  console.error = (...partes) => reclamacoes.push(partes.join(" "));

  const raizReact = createRoot(alvo);
  await act(async () => {
    raizReact.render(React.createElement(modulo.Editor, props));
  });

  const botoes = () => [...alvo.querySelectorAll('[role="toolbar"] button')];
  const porRotulo = (rotulo) =>
    botoes().find((b) => b.getAttribute("aria-label") === rotulo) ?? null;

  /* A BubbleMenu porta o CONTEÚDO do Popover (Radix) para `document.body` —
     fora de `alvo` — mas o GATILHO (o próprio botão "Link"/"Destaque de cor")
     fica dentro de `alvo`, como sibling do `view.dom` do editor (é
     `view.dom.parentElement` quem recebe o elemento da BubbleMenu por
     padrão). Por isso: gatilhos se buscam em `alvo` por `aria-label`, sem
     escopar a `[role="toolbar"]`; o CONTEÚDO do popover se busca em
     `document.body`. */
  const porRotuloNaTela = (rotulo) =>
    [...alvo.querySelectorAll("[aria-label]")].find(
      (b) => b.tagName === "BUTTON" && b.getAttribute("aria-label") === rotulo,
    ) ?? null;
  const botaoNoCorpoPorRotulo = (rotulo) =>
    [...janela.document.body.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === rotulo,
    ) ?? null;
  const botaoNoCorpoPorTexto = (texto) =>
    [...janela.document.body.querySelectorAll("button")].find(
      (b) => b.textContent === texto,
    ) ?? null;
  const campoNoCorpo = () => janela.document.body.querySelector("input[type='text']");
  const formularioNoCorpo = () => campoNoCorpo()?.closest("form") ?? null;
  const alertaNoCorpo = () => {
    const id = campoNoCorpo()?.getAttribute("aria-describedby");
    return id ? janela.document.body.querySelector(`#${id}`) : null;
  };

  const setterDeInput = Object.getOwnPropertyDescriptor(
    janela.HTMLInputElement.prototype,
    "value",
  ).set;

  return {
    alvo,
    reclamacoes,
    botoes,
    porRotulo,
    porRotuloNaTela,
    botaoNoCorpoPorRotulo,
    botaoNoCorpoPorTexto,
    areaDeEscrita: () => alvo.querySelector('[role="textbox"]'),
    campo: () => alvo.querySelector("form input[type='text']"),
    formulario: () => alvo.querySelector("form"),
    alerta: () => alvo.querySelector("form [role='alert']"),
    campoNoCorpo,
    formularioNoCorpo,
    alertaNoCorpo,
    avisoDoConteudo: () => alvo.querySelector("[data-gravidade]"),
    async clicar(elemento) {
      await act(async () => {
        elemento.dispatchEvent(new janela.MouseEvent("click", { bubbles: true }));
      });
    },
    /* A BubbleMenu só sobrevive a um clique dentro dela se o `mousedown`
       chegar primeiro: é ele que arma `preventHide` no plugin do Tiptap. Um
       `click` sintético isolado (sem `mousedown`/`mouseup` antes) não é o
       que um clique de verdade dispara, e some com a BubbleMenu inteira —
       inclusive o próprio gatilho — porque o `blurHandler` do plugin não
       reconhece o novo alvo do foco como "dentro" da área seguraem tempo. */
    async clicarDeVerdade(elemento) {
      await act(async () => {
        elemento.dispatchEvent(new janela.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        elemento.dispatchEvent(new janela.MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        elemento.dispatchEvent(new janela.MouseEvent("click", { bubbles: true, cancelable: true }));
      });
      // SEM espera automática aqui, de propósito: o Popover abre de forma
      // SÍNCRONA dentro do próprio `act` (medido). Esperar sempre — mesmo
      // logo depois de abrir — dá tempo para o `blurHandler` do plugin da
      // BubbleMenu decidir, depois do `campo.current?.focus()` do Popover,
      // que o editor perdeu o foco para fora da "área segura" e ESCONDER a
      // BubbleMenu inteira, gatilho incluído — o conteúdo do Popover (do
      // Radix, autônomo) sobrevive, mas o botão que o abriu some do DOM.
      // Quem chama decide se precisa esperar (`aguardarBubble`), e só
      // quando o que vem depois já não depende do GATILHO continuar
      // alcançável.
    },
    /* O plugin da BubbleMenu decide se mostra/esconde num `setTimeout` de
       `updateDelay` (250ms, o padrão do Tiptap) depois de cada transação —
       e o Popover do Radix também assenta seu próprio estado de forma
       assíncrona. Sem esperar depois de QUALQUER interação que abra, feche
       ou troque o conteúdo do Popover, a leitura seguinte corre uma corrida
       real contra esses timers — medido: sem a espera, o mesmo passo produz
       resultados diferentes em execuções diferentes. */
    async aguardarBubble() {
      await act(async () => {
        await new Promise((resolver) => setTimeout(resolver, 350));
      });
    },
    /* Poll em vez de espera fixa, para o único passo que segue flaky mesmo
       com `aguardarBubble`: sondar até a condição ficar verdadeira (ou
       estourar o teto) é mais robusto do que apostar numa duração fixa
       contra um timer cujo disparo real varia por execução. */
    async esperarAte(condicao, tentativas = 8, intervaloMs = 150) {
      for (let i = 0; i < tentativas; i += 1) {
        if (condicao()) return true;
        await act(async () => {
          await new Promise((resolver) => setTimeout(resolver, intervaloMs));
        });
      }
      return condicao();
    },
    async mostrarBubble(areaDeEscrita) {
      await act(async () => {
        areaDeEscrita.focus();
      });
      await act(async () => {
        areaDeEscrita.dispatchEvent(
          new janela.KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true }),
        );
      });
      await this.aguardarBubble();
    },
    async digitar(entrada, texto) {
      // O ajuste de valor precisa passar pelo `setter` nativo: o React guarda
      // o último valor no próprio nó e ignoraria um evento cujo valor ele
      // acredita já ter visto.
      await act(async () => {
        setterDeInput.call(entrada, texto);
        entrada.dispatchEvent(new janela.Event("input", { bubbles: true }));
      });
    },
    async submeter(form) {
      // SEM espera automática, de propósito (mesma razão de `clicarDeVerdade`):
      // o resultado do `submit` — sucesso fecha, recusa mantém aberto com o
      // alerta — já está refletido de forma SÍNCRONA dentro do próprio `act`.
      // Esperar aqui, sempre, tem custo real: medido que uma segunda espera
      // de 350ms enquanto o campo do Popover está com o foco (o editor NÃO
      // está) dá tempo do `blurHandler` da BubbleMenu decidir esconder tudo
      // — inclusive fechando o Popover que ainda deveria estar aberto
      // mostrando a recusa. Quem chama espera só quando precisa.
      await act(async () => {
        form.dispatchEvent(new janela.Event("submit", { bubbles: true, cancelable: true }));
      });
    },
    async desmontar() {
      console.error = erroOriginal;
      await act(async () => raizReact.unmount());
      alvo.remove();
    },
    restaurarConsole() {
      console.error = erroOriginal;
    },
  };
}

if (janela && schema && configuracao && compilado) {
  const ambiente = await (async () => {
    const modulo = await import(pathToFileURL(compilado.arquivo).href);
    const React = (await import("react")).default;
    const { createRoot } = await import("react-dom/client");
    const { act } = await import("react");
    // Sem isto o React 19 avisa a cada `act` e a saída fica ilegível.
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      value: true,
      configurable: true,
      writable: true,
    });
    return { modulo, React, createRoot, act };
  })().catch((erro) => {
    afirmar("o pacote compilado importa e o React monta", false, String(erro?.message ?? erro));
    return null;
  });

  if (ambiente) {
    afirmar("o pacote compilado importa e o React monta", true);
    const { modulo, React, createRoot, act } = ambiente;
    const montar = (props) => montarEditor(modulo, React, createRoot, act, props);
    const controles = configuracao.controlesDaBarra();
    const controleDeLink = controles.find((c) => c.pede);
    const TEXTO_INICIAL = "conteúdo de prova para o editor";
    const documentoLimpo = () => ({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: TEXTO_INICIAL }] }],
    });

    /* ── A barra desenhada ────────────────────────────────────────────── */
    {
      const recebidos = [];
      const tela = await montar({
        documento: documentoLimpo(),
        aoMudar: (doc) => recebidos.push(doc),
        rotulo: "Conteúdo do post",
      });

      const botoes = tela.botoes();
      /* O Link saiu da barra fixa (foi para a BubbleMenu, ver mais abaixo) —
         a barra fixa desenha os OUTROS 12 elementos do schema, na mesma
         ordem, mais três botões de mão própria que não vêm do schema:
         Inserir imagem, Desfazer e Refazer. Todos dentro do MESMO
         `[role="toolbar"]`, então `tela.botoes()` continua os encontrando. */
      const controlesFixos = controles.filter((c) => c.chave !== "link");
      const rotulosEsperados = [
        ...controlesFixos.map((c) => c.rotulo),
        "Inserir imagem",
        "Desfazer",
        "Refazer",
      ];
      afirmar(
        "a barra desenha um botão por elemento do schema (menos o link, que mudou para a BubbleMenu), mais Inserir imagem/Desfazer/Refazer, com o rótulo de cada um",
        igual(
          botoes.map((b) => b.getAttribute("aria-label")),
          rotulosEsperados,
        ),
        botoes.map((b) => b.getAttribute("aria-label")).join(" | "),
      );

      /* O ESTADO LIDO POR VALOR. A versão anterior contava `hasAttribute`, que
         é verdadeiro tanto para "true" quanto para "false" — congelar a barra
         depois do primeiro quadro deixava tudo verde.

         `alinharEsquerda` é a EXCEÇÃO NOMEADA: todo controle que alterna
         começa "false" — verdade para negrito, título etc, ausentes do texto
         de prova — mas falso para alinhamento, porque TODO parágrafo TEM um
         alinhamento, e o padrão é esquerda. "Alinhar à esquerda" começa
         legitimamente aceso, sem que o Autor tenha clicado nada.

         Inserir imagem/Desfazer/Refazer não vêm de `controlesDaBarra()` — são
         botões de mão própria, sem `alterna`/`insere` do vocabulário fechado
         — e por isso NENHUM dos três anuncia `aria-pressed` (nem `"true"`,
         nem `"false"`: o atributo simplesmente não existe). */
      afirmar(
        "quem alterna anuncia `aria-pressed` correto no início — \"false\", exceto `alinharEsquerda`, já ativo por padrão —, quem só insere não tem o atributo, e os três botões de mão própria (Inserir imagem/Desfazer/Refazer) também não",
        botoes.every((botao, i) => {
          if (i >= controlesFixos.length) return botao.getAttribute("aria-pressed") === null;
          const valor = botao.getAttribute("aria-pressed");
          if (!controlesFixos[i].alterna) return valor === null;
          return controlesFixos[i].chave === "alinharEsquerda"
            ? valor === "true"
            : valor === "false";
        }),
        botoes.map((b) => `${b.getAttribute("aria-label")}=${b.getAttribute("aria-pressed")}`).join(" | "),
      );

      afirmar(
        "`aria-keyshortcuts` traz a notação canônica só em quem tem atalho — e os três botões de mão própria não anunciam atalho nenhum (não têm `aria-keyshortcuts`)",
        botoes.every((botao, i) => {
          if (i >= controlesFixos.length) return (botao.getAttribute("aria-keyshortcuts") ?? null) === null;
          return (botao.getAttribute("aria-keyshortcuts") ?? null) === controlesFixos[i].atalhoCanonico;
        }) &&
          botoes.some((b) => /^Control\+/.test(b.getAttribute("aria-keyshortcuts") ?? "")) &&
          botoes.every((b) => !/[⌘⌥⇧]|Ctrl/.test(b.getAttribute("aria-keyshortcuts") ?? "")),
        botoes.map((b) => b.getAttribute("aria-keyshortcuts")).join(" | "),
      );

      /* `role="toolbar"` obriga a UMA parada de Tab, com as setas movendo
         dentro — mas o rodízio de `tabindex` só cobre os 12 controles fixos
         derivados do schema. Inserir imagem/Desfazer/Refazer participam da
         ordem NORMAL de Tab do navegador (nenhum `tabindex` — nem `0` nem
         `-1`), de propósito: não são um grupo de rádio do schema, e entrar
         no rodízio como um 13º/14º/15º membro fingiria que são. */
      afirmar(
        "a barra é UMA parada de Tab entre os 12 controles fixos do schema; Inserir imagem/Desfazer/Refazer ficam fora do rodízio (sem `tabindex`)",
        botoes.slice(0, controlesFixos.length).filter((b) => b.getAttribute("tabindex") === "0").length === 1 &&
          botoes.slice(0, controlesFixos.length).filter((b) => b.getAttribute("tabindex") === "-1").length ===
            controlesFixos.length - 1 &&
          botoes.slice(controlesFixos.length).every((b) => b.getAttribute("tabindex") === null),
        botoes.map((b) => b.getAttribute("tabindex")).join(","),
      );
      /* Desfazer/Refazer são indisponíveis por FALTA DE HISTÓRICO — o editor
         acabou de montar, não há nada para desfazer/refazer ainda — e não
         por o documento estar de alguma forma inválido. É uma indisponibi-
         lidade LEGÍTIMA, ortogonal a "há conteúdo disponível", e a asserção
         abaixo separa os dois: nenhum controle DERIVADO DO SCHEMA (nem
         Inserir imagem) se anuncia indisponível com tudo disponível; a prova
         de que Desfazer deixa de estar indisponível DEPOIS de uma edição vem
         logo abaixo, junto do clique em Negrito. */
      afirmar(
        "com tudo disponível, nenhum controle do schema nem Inserir imagem se anuncia indisponível — Desfazer/Refazer começam indisponíveis por falta de histórico, não por falta de conteúdo válido",
        botoes.slice(0, controlesFixos.length).every((b) => b.getAttribute("aria-disabled") === null) &&
          tela.porRotulo("Inserir imagem")?.getAttribute("aria-disabled") === null &&
          tela.porRotulo("Desfazer")?.getAttribute("aria-disabled") === "true" &&
          tela.porRotulo("Refazer")?.getAttribute("aria-disabled") === "true",
        botoes
          .map((b) => `${b.getAttribute("aria-label")}=${b.getAttribute("aria-disabled")}`)
          .join(" | "),
      );

      const negrito = tela.porRotulo("Negrito");
      afirmar(
        "a seta para a direita move o foco dentro da barra",
        await (async () => {
          const primeiro = botoes[0];
          primeiro.focus();
          await act(async () => {
            primeiro.dispatchEvent(
              new janela.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
            );
          });
          return janela.document.activeElement === tela.botoes()[1];
        })(),
        String(janela.document.activeElement?.getAttribute?.("aria-label")),
      );

      /* ── O CLIQUE APLICA, e o documento SAI por `aoMudar` ───────────── */
      const areaDeEscrita = tela.areaDeEscrita();
      afirmar(
        "o nome acessível chega ao elemento que carrega `role=\"textbox\"`, e não ao invólucro",
        areaDeEscrita?.getAttribute("aria-label") === "Conteúdo do post" &&
          /(^|\s)artigo(\s|$)/.test(areaDeEscrita?.className ?? ""),
        `${areaDeEscrita?.getAttribute("aria-label")} | ${areaDeEscrita?.className}`,
      );
      afirmar(
        "a área de escrita mostra o texto formatado no lugar, sem marcação visível",
        (areaDeEscrita?.textContent ?? "").includes(TEXTO_INICIAL) &&
          !(areaDeEscrita?.textContent ?? "").includes("**") &&
          !/pré-?visualiza|preview/i.test(tela.alvo.innerHTML),
      );

      /* Seleciona o texto do parágrafo, no DOM, como o Autor faria — e dá
         tempo para a BubbleMenu aparecer: o plugin do Tiptap decide
         mostrar/esconder num `setTimeout` de 250ms (o padrão) depois da
         transação de seleção, e é nela que Link e Destaque de cor moraram. */
      await tela.mostrarBubble(areaDeEscrita);

      const antesDoClique = recebidos.length;
      await tela.clicar(negrito);
      afirmar(
        "clicar num controle que alterna MUDA o documento",
        recebidos.length > antesDoClique,
        `${antesDoClique} → ${recebidos.length}`,
      );
      afirmar(
        "e o botão passa a anunciar `aria-pressed=\"true\"`",
        tela.porRotulo("Negrito").getAttribute("aria-pressed") === "true",
        String(tela.porRotulo("Negrito").getAttribute("aria-pressed")),
      );
      /* A prova prometida acima: a indisponibilidade inicial de Desfazer era
         falta de HISTÓRICO, não bug — agora que uma edição de verdade
         aconteceu, ele deixa de se anunciar indisponível. */
      afirmar(
        "depois de uma edição de verdade, Desfazer passa a se anunciar disponível",
        tela.porRotulo("Desfazer")?.getAttribute("aria-disabled") === null,
        String(tela.porRotulo("Desfazer")?.getAttribute("aria-disabled")),
      );

      /* `aoMudar` é o ÚNICO canal de saída do componente e o insumo das
         Stories 2.5 e 2.6. Trocar `getJSON()` por `getHTML()` — string onde se
         espera documento — passava na suíte inteira. */
      const ultimo = recebidos[recebidos.length - 1];
      afirmar(
        "`aoMudar` entrega DOCUMENTO estruturado, nunca HTML nem texto",
        ultimo !== null &&
          typeof ultimo === "object" &&
          !Array.isArray(ultimo) &&
          ultimo.type === "doc" &&
          Array.isArray(ultimo.content),
        typeof ultimo === "string" ? ultimo.slice(0, 120) : JSON.stringify(ultimo).slice(0, 160),
      );
      afirmar(
        "o que sai por `aoMudar` já é ponto fixo da validação do domínio",
        (() => {
          const revalidado = validar(ultimo);
          return revalidado.ok === true && igualProfundo(revalidado.documento, ultimo);
        })(),
        JSON.stringify(ultimo).slice(0, 200),
      );
      afirmar(
        "o negrito clicado está NO documento que saiu — o clique não foi decorativo",
        marcasDoDocumento(ultimo).has("bold") && textoBruto(ultimo).includes(TEXTO_INICIAL),
        JSON.stringify(ultimo).slice(0, 200),
      );

      /* ── O Link migrou da barra fixa para um Popover na BubbleMenu ─────
         MESMO controle de `controlesDaBarra()` (`aplicar`/`podeAplicar`/
         `valorAtual`/`recusa`) — só a casca mudou. O gatilho ("Link") vive
         dentro de `alvo`, como sibling do `view.dom` do editor; o CONTEÚDO
         do Popover (Radix) porta para `document.body` — por isso os
         helpers `campoNoCorpo`/`formularioNoCorpo`/`alertaNoCorpo`, e a
         busca do gatilho por `porRotuloNaTela` (não escopada à barra fixa).

         Nota sobre `clicarDeVerdade`: um `click` sintético isolado faz a
         BubbleMenu inteira sumir do DOM (o `blurHandler` do plugin do
         Tiptap não vê o novo alvo do foco como "dentro" da área segura sem
         o `mousedown` que arma `preventHide`) — medido por tentativa direta
         antes de encontrar a receita mousedown+mouseup+click. E toda leitura
         depois de abrir/fechar/mudar o Popover espera o assentamento
         (`aguardarBubble`, dentro de `clicarDeVerdade`/`submeter`): sem a
         espera, o mesmo passo mediu resultados diferentes em execuções
         diferentes — a causa é o debounce de 250ms do plugin somado ao
         próprio assentamento assíncrono do Popover do Radix. */
      const link = tela.porRotuloNaTela("Link");
      afirmar(
        "o Link não mora mais na barra fixa — saiu de `[role=\"toolbar\"]` e foi para a BubbleMenu",
        link !== null && tela.porRotulo("Link") === null,
      );
      afirmar(
        "o controle que pede um dado anuncia que abre algo (`aria-expanded`)",
        link.getAttribute("aria-expanded") === "false",
        String(link.getAttribute("aria-expanded")),
      );
      await tela.clicarDeVerdade(link);
      afirmar(
        "clicar nele abre o campo (portado para `document.body` pelo Popover), e o controle passa a se anunciar expandido",
        tela.campoNoCorpo() !== null &&
          tela.porRotuloNaTela("Link")?.getAttribute("aria-expanded") === "true",
        String(tela.porRotuloNaTela("Link")?.getAttribute("aria-expanded")),
      );
      afirmar(
        "o campo é rotulado pelo texto que o SCHEMA declara, e o rótulo aponta para ele",
        (() => {
          const campo = tela.campoNoCorpo();
          const rotulo = janela.document.body.querySelector(`label[for="${campo?.id}"]`);
          return (
            campo?.id &&
            rotulo?.textContent === controleDeLink.pede.rotulo &&
            campo.getAttribute("placeholder") === controleDeLink.pede.exemplo
          );
        })(),
        `${tela.campoNoCorpo()?.id}`,
      );

      /* Digitar não pode refocar o campo a cada tecla: o efeito depende só da
         ABERTURA. Espionar `focus` é o jeito de observar isso — o sintoma (o
         cursor voltando para o fim) não existe no jsdom, mas a causa sim. */
      {
        const campo = tela.campoNoCorpo();
        let focos = 0;
        const focoOriginal = campo.focus.bind(campo);
        campo.focus = () => {
          focos += 1;
          focoOriginal();
        };
        await tela.digitar(campo, "h");
        await tela.digitar(campo, "ht");
        await tela.digitar(campo, "htt");
        afirmar(
          "digitar no campo NÃO o refoca a cada caractere",
          focos === 0,
          `focos durante a digitação: ${focos}`,
        );
        campo.focus = focoOriginal;
      }

      const antesDoLink = recebidos.length;
      await tela.digitar(tela.campoNoCorpo(), "https://chatclean.com.br/blog");
      await tela.submeter(tela.formularioNoCorpo());
      const comLink = recebidos[recebidos.length - 1];
      afirmar(
        "preencher o campo e submeter APLICA o elemento no documento",
        recebidos.length > antesDoLink &&
          acharNo(
            comLink,
            (n) =>
              n.type === "text" &&
              (n.marks ?? []).some(
                (m) => m.type === "link" && m.attrs?.href === "https://chatclean.com.br/blog",
              ),
          ) !== null,
        JSON.stringify(comLink).slice(0, 220),
      );
      afirmar(
        "aplicado com sucesso, o popover fecha",
        tela.campoNoCorpo() === null,
      );

      // Reabrir: o popover nasce com o endereço JÁ aplicado (editar é a
      // mesma ação de criar) — igual ao campo inline de antes.
      await tela.clicarDeVerdade(tela.porRotuloNaTela("Link"));
      await tela.esperarAte(() => tela.campoNoCorpo() !== null);
      afirmar(
        "reabrir preenche o campo com o valor JÁ aplicado (`valorAtual`)",
        tela.campoNoCorpo()?.value === "https://chatclean.com.br/blog",
        String(tela.campoNoCorpo()?.value),
      );
      afirmar(
        "com o link ativo, o popover oferece Aplicar E Remover",
        tela.botaoNoCorpoPorTexto("Aplicar link") !== null &&
          tela.botaoNoCorpoPorTexto("Remover link") !== null,
      );

      // Agora a recusa por FORMATO, com a frase que o schema declara.
      const antesDaRecusa = recebidos.length;
      await tela.digitar(tela.campoNoCorpo(), "javascript:alert(1)");
      await tela.submeter(tela.formularioNoCorpo());
      afirmar(
        "endereço executável não é aplicado e o campo continua aberto",
        recebidos.length === antesDaRecusa && tela.campoNoCorpo() !== null,
        `${antesDaRecusa} → ${recebidos.length}`,
      );
      afirmar(
        "e a recusa é MOSTRADA, com a frase que vem do schema — não de uma string do componente",
        tela.alertaNoCorpo()?.textContent ===
          controleDeLink.pede.recusaDeFormato("javascript:alert(1)"),
        JSON.stringify(tela.alertaNoCorpo()?.textContent ?? null),
      );
      afirmar(
        "a mensagem de recusa está ligada ao campo por `aria-describedby`, com `role=\"alert\"`",
        tela.campoNoCorpo()?.getAttribute("aria-describedby") === tela.alertaNoCorpo()?.id &&
          tela.campoNoCorpo()?.getAttribute("aria-invalid") === "true" &&
          tela.alertaNoCorpo()?.getAttribute("role") === "alert",
      );
      afirmar(
        "a frase da recusa não está escrita à mão no componente genérico",
        !mascararComentariosJs(ler(CAMINHO_BARRA)).includes("https://"),
      );

      // Escape fecha o popover.
      await act(async () => {
        tela
          .campoNoCorpo()
          .dispatchEvent(
            new janela.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
          );
      });
      await tela.aguardarBubble();
      afirmar(
        "Escape fecha o popover sem aplicar a recusa",
        tela.campoNoCorpo() === null,
      );

      // Remover link: reabre, clica "Remover link", a marca sai do documento.
      await tela.clicarDeVerdade(tela.porRotuloNaTela("Link"));
      await tela.esperarAte(() => tela.botaoNoCorpoPorTexto("Remover link") !== null);
      const antesDeRemover = recebidos.length;
      await tela.clicarDeVerdade(tela.botaoNoCorpoPorTexto("Remover link"));
      const semLink = recebidos[recebidos.length - 1];
      afirmar(
        "\"Remover link\" tira a marca do documento",
        recebidos.length > antesDeRemover &&
          acharNo(
            semLink,
            (n) => n.type === "text" && (n.marks ?? []).some((m) => m.type === "link"),
          ) === null,
        JSON.stringify(semLink).slice(0, 200),
      );

      afirmar(
        "o React não reclamou de nada durante toda a interação",
        tela.reclamacoes.length === 0,
        tela.reclamacoes.slice(0, 2).join(" | ").slice(0, 300),
      );
      await tela.desmontar();
    }

    /* ── Destaque de cor: cobertura nova, dedicada ao Popover novo ────────
       Não existia antes da story. `CORES_DE_DESTAQUE` é o vocabulário
       fechado do domínio (`domain/blog/schema.js`) — a lista de botões nasce
       dele, não de uma lista escrita à mão no componente.

       Mora numa montagem PRÓPRIA, de propósito: emendado na cauda do bloco
       anterior (depois de abrir/fechar o Popover de Link várias vezes —
       aplicar, reabrir, recusar, Escape, reabrir, remover), abrir MAIS um
       popover mediu-se flaky por sabotagem direta — a mesma classe de corrida
       contra o debounce de 250ms da BubbleMenu que motivou `aguardarBubble`/
       `esperarAte`, só que desta vez sobrevivendo à espera com poll. Um
       editor fresco, com uma única transição de abertura, elimina a corrida
       em vez de tentar vencê-la de novo. */
    {
      const recebidos = [];
      const tela = await montar({
        documento: documentoLimpo(),
        aoMudar: (doc) => recebidos.push(doc),
      });
      await tela.mostrarBubble(tela.areaDeEscrita());

      const destaque = tela.porRotuloNaTela("Destaque de cor");
      afirmar(
        "o Destaque de cor é um gatilho de popover na BubbleMenu",
        destaque !== null && destaque.getAttribute("aria-haspopup") === "dialog",
      );
      await tela.clicarDeVerdade(destaque);
      const cadaCorTemBotao = () =>
        schema.CORES_DE_DESTAQUE.every(
          (cor, i) =>
            tela.botaoNoCorpoPorRotulo(
              `Destacar em ${["Amarelo", "Verde", "Azul", "Rosa"][i]}`,
            ) !== null,
        ) && tela.botaoNoCorpoPorRotulo("Remover destaque") !== null;
      await tela.esperarAte(cadaCorTemBotao);
      afirmar(
        "o popover lista um botão por cor de `CORES_DE_DESTAQUE`, mais Remover destaque",
        cadaCorTemBotao(),
      );
      const antesDoDestaque = recebidos.length;
      await tela.clicarDeVerdade(tela.botaoNoCorpoPorRotulo("Destacar em Amarelo"));
      const comDestaque = recebidos[recebidos.length - 1];
      afirmar(
        "clicar numa cor aplica a marca `highlight` com a `cor` certa, do vocabulário do domínio",
        recebidos.length > antesDoDestaque &&
          acharNo(
            comDestaque,
            (n) =>
              n.type === "text" &&
              (n.marks ?? []).some((m) => m.type === "highlight" && m.attrs?.cor === "amarelo"),
          ) !== null,
        JSON.stringify(comDestaque).slice(0, 220),
      );
      afirmar(
        "o React não reclamou de nada durante a interação com o Destaque de cor",
        tela.reclamacoes.length === 0,
        tela.reclamacoes.slice(0, 2).join(" | ").slice(0, 300),
      );
      await tela.desmontar();
    }

    /* ── Controle INDISPONÍVEL: como ele se anuncia, e o que faz ──────────
       Precisa de um estado em que algum controle de fato não caiba: dentro de
       um bloco de código, o link não cabe. Sem montar esse estado, a asserção
       "não usamos `disabled`" passava por vacuidade — com tudo disponível, o
       React nem emite o atributo, e trocar `aria-disabled` por `disabled`
       continuava verde. Foi assim que esta sabotagem escapou na primeira
       rodada.

       O Link agora só aparece com uma seleção de texto não-vazia (é a
       BubbleMenu) — por isso a seleção dentro do bloco de código, aqui, não é
       cosmética: sem ela o gatilho nem chega a existir no DOM para a
       asserção examinar. */
    {
      const recebidos = [];
      const tela = await montar({
        documento: {
          type: "doc",
          content: [{ type: "codeBlock", content: [{ type: "text", text: "npm run verificar" }] }],
        },
        aoMudar: (doc) => recebidos.push(doc),
      });

      await tela.mostrarBubble(tela.areaDeEscrita());
      const link = tela.porRotuloNaTela("Link");
      afirmar(
        "dentro de um bloco de código, o controle de link se anuncia indisponível na TELA",
        link?.getAttribute("aria-disabled") === "true",
        `aria-disabled: ${link?.getAttribute("aria-disabled")}`,
      );
      afirmar(
        "e usa `aria-disabled`, nunca `disabled` — num toolbar, `disabled` abre um buraco na navegação",
        link !== null && !link.hasAttribute("disabled"),
      );
      afirmar(
        "o controle indisponível continua alcançável pelo teclado (não sai da barra)",
        await (async () => {
          link.focus();
          return janela.document.activeElement === link;
        })(),
        String(janela.document.activeElement?.getAttribute?.("aria-label")),
      );
      /* O Popover (Radix) não recusa abrir por `aria-disabled` — só a
         `disabled` nativa faria isso, e a barra usa `aria-disabled` de
         propósito (comentário acima). Diferença real do campo inline de
         antes: o gatilho ABRE mesmo indisponível. A garantia que sobrevive
         é outra — o clique não muda o documento — e o Popover, uma vez
         aberto, recusa por CONTEXTO com a frase que o schema declara, a
         MESMA garantia de antes por um caminho diferente. */
      const antes = recebidos.length;
      await tela.clicarDeVerdade(link);
      await tela.esperarAte(() => tela.campoNoCorpo() !== null);
      afirmar(
        "clicar num controle indisponível não muda o documento",
        recebidos.length === antes,
        `${antes} → ${recebidos.length}`,
      );
      /* Valor VAZIO tenta remover — e "remover uma marca que não está lá"
         sucede trivialmente em qualquer contexto, sem testar nada. Só um
         endereço de FORMATO válido força o caminho que checa se o comando
         roda aqui, e é aí que o bloco de código recusa por CONTEXTO. */
      await tela.digitar(tela.campoNoCorpo(), "https://chatclean.com.br/blog");
      await tela.submeter(tela.formularioNoCorpo());
      afirmar(
        "e submeter dentro dele recusa por CONTEXTO, com a frase que o schema declara",
        recebidos.length === antes &&
          tela.alertaNoCorpo()?.textContent === controleDeLink.pede.recusaDeContexto,
        JSON.stringify(tela.alertaNoCorpo()?.textContent ?? null),
      );

      // E um controle que CABE num bloco de código continua disponível: a
      // indisponibilidade é por contexto, não uma barra desligada inteira.
      // "Título 2" mora na barra FIXA (não na BubbleMenu) — continua
      // alcançável do mesmo jeito de sempre.
      afirmar(
        "no mesmo lugar, um controle que cabe continua disponível",
        tela.porRotulo("Título 2")?.getAttribute("aria-disabled") === null,
      );
      await tela.desmontar();
    }

    /* ── Dois editores na mesma página não colidem ─────────────────────── */
    {
      // O Popover de Link agora porta o campo para o MESMO `document.body`,
      // qualquer que seja o editor que o abriu — não dá para ter os dois
      // abertos ao mesmo tempo e distinguir por `alvo` como antes (o campo
      // não mora mais dentro de nenhum dos dois). A prova de "não colide"
      // vira SEQUENCIAL: abre no primeiro, confere, fecha, abre no segundo,
      // confere que o identificador é outro.
      const um = await montar({ documento: documentoLimpo() });
      const dois = await montar({ documento: documentoLimpo() });

      await um.mostrarBubble(um.areaDeEscrita());
      await um.clicarDeVerdade(um.porRotuloNaTela("Link"));
      await um.esperarAte(() => um.campoNoCorpo() !== null);
      const campoUm = um.campoNoCorpo();
      const idUm = campoUm?.id;
      afirmar(
        "o Popover de Link tem identificador próprio, e o rótulo aponta para o campo certo",
        Boolean(idUm) && janela.document.body.querySelector(`label[for="${idUm}"]`) !== null,
        `${idUm}`,
      );
      await act(async () => {
        campoUm.dispatchEvent(
          new janela.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        );
      });
      await um.aguardarBubble();

      await dois.mostrarBubble(dois.areaDeEscrita());
      await dois.clicarDeVerdade(dois.porRotuloNaTela("Link"));
      await dois.esperarAte(() => dois.campoNoCorpo() !== null);
      const idDois = dois.campoNoCorpo()?.id;
      afirmar(
        "o segundo editor gera um identificador DIFERENTE do primeiro — sem colisão entre montagens",
        Boolean(idDois) && idDois !== idUm,
        `${idUm} vs ${idDois}`,
      );

      await um.desmontar();
      await dois.desmontar();
    }

    /* ── Correção de UI/UX do Editor: os três de alinhamento, na tela ────
       O laço genérico da seção (e) já prova, num editor headless, que cada
       controle roda o comando que declarou. Aqui a prova é NA TELA: o Autor
       clica, o botão acende, e — o caso que a spec nomeia — um TÍTULO
       centralizado acende `aria-pressed` também, não só um parágrafo. */
    {
      const recebidos = [];
      const tela = await montar({
        documento: {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 2 },
              content: [{ type: "text", text: "título de prova" }],
            },
          ],
        },
        aoMudar: (doc) => recebidos.push(doc),
      });

      const areaDeEscrita = tela.areaDeEscrita();
      await act(async () => {
        areaDeEscrita.dispatchEvent(
          new janela.KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true }),
        );
      });

      const centralizar = tela.porRotulo("Centralizar");
      afirmar(
        "\"Centralizar\" começa apagado num título recém-aberto (esquerda é o padrão)",
        centralizar?.getAttribute("aria-pressed") === "false",
        String(centralizar?.getAttribute("aria-pressed")),
      );

      await tela.clicar(centralizar);
      afirmar(
        "clicar em \"Centralizar\" dentro de um TÍTULO acende o botão — não só em parágrafo",
        tela.porRotulo("Centralizar")?.getAttribute("aria-pressed") === "true",
        String(tela.porRotulo("Centralizar")?.getAttribute("aria-pressed")),
      );
      const centralizado = recebidos[recebidos.length - 1];
      afirmar(
        "e o documento que saiu por `aoMudar` carrega `textAlign: \"center\"` no título",
        acharNo(centralizado, (n) => n.type === "heading")?.attrs?.textAlign === "center",
        JSON.stringify(centralizado).slice(0, 220),
      );

      /* Alternar para "Alinhar à direita" desliga "Centralizar" — os três são
         mutuamente exclusivos, como qualquer alinhamento de texto. */
      await tela.clicar(tela.porRotulo("Alinhar à direita"));
      afirmar(
        "escolher outro alinhamento desliga o anterior: são mutuamente exclusivos",
        tela.porRotulo("Alinhar à direita")?.getAttribute("aria-pressed") === "true" &&
          tela.porRotulo("Centralizar")?.getAttribute("aria-pressed") === "false",
        `direita=${tela.porRotulo("Alinhar à direita")?.getAttribute("aria-pressed")} centro=${tela.porRotulo("Centralizar")?.getAttribute("aria-pressed")}`,
      );

      afirmar(
        "o React não reclamou de nada ao alinhar um título",
        tela.reclamacoes.length === 0,
        tela.reclamacoes.slice(0, 2).join(" | ").slice(0, 300),
      );
      await tela.desmontar();
    }

    /* ── Documento SUJO: o caso que a validação da entrada existe para ── */
    {
      const sujo = {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "titulo h1" }] },
          { type: "paragraph", content: [{ type: "text", text: "TEXTO QUE PRECISA SOBREVIVER" }] },
          { type: "table", content: [{ type: "tableRow", content: [] }] },
          {
            type: "paragraph",
            content: [{ type: "text", marks: [{ type: "strike" }], text: " e este também" }],
          },
        ],
      };

      /* CONTRAPROVA — e o resultado é PIOR do que o esperado, o que torna a
         higienização da entrada mais necessária, não menos.
         O Tiptap constrói o documento com `Node.fromJSON`, que estoura em
         `RangeError: Unknown node type` diante de um nó desconhecido. Ele não
         deixa a exceção subir: captura, escreve um aviso no console e monta o
         editor VAZIO. Sem `prepararConteudo`, um post gravado com uma tabela
         dentro abriria em branco, sem nada na tela dizendo isso — e o primeiro
         salvamento da Story 2.5 tornaria a perda permanente.
         Esta asserção existe para que remover a higienização faça a seção
         falhar, em vez de apenas "mudar um aviso". */
      const nucleo = await import("@tiptap/core");
      const avisosDoTiptap = [];
      const avisoOriginal = console.warn;
      console.warn = (...partes) => avisosDoTiptap.push(partes.join(" "));
      let conteudoCru = null;
      let quebrou = null;
      try {
        const cru = new nucleo.Editor({
          element: janela.document.createElement("div"),
          extensions: configuracao.extensoesDoEditor(),
          content: sujo,
        });
        conteudoCru = textoBruto(cru.getJSON());
        cru.destroy();
      } catch (erro) {
        quebrou = String(erro?.message ?? erro);
      } finally {
        console.warn = avisoOriginal;
      }
      afirmar(
        "contraprova: sem higienizar, o editor PERDE o documento inteiro ao abrir um post com nó fora do schema",
        quebrou !== null || !String(conteudoCru).includes("TEXTO QUE PRECISA SOBREVIVER"),
        quebrou ?? `o editor cru abriu com: ${JSON.stringify(conteudoCru)}`,
      );
      afirmar(
        "e a perda é SILENCIOSA na tela: o aviso do Tiptap só chega ao console",
        quebrou !== null || avisosDoTiptap.some((a) => /invalid content/i.test(a)),
        avisosDoTiptap.join(" | ").slice(0, 160),
      );

      const avisos = [];
      const tela = await montar({ documento: sujo, aoAvisar: (a) => avisos.push(a) });
      const area = tela.areaDeEscrita();
      afirmar(
        "com higienização, o post ABRE, e o texto que podia sobreviver sobreviveu",
        area !== null && (area.textContent ?? "").includes("TEXTO QUE PRECISA SOBREVIVER"),
        (area?.textContent ?? "").slice(0, 120),
      );
      afirmar(
        "o `h1` do corpo não vira título na tela",
        tela.alvo.querySelector("h1") === null,
      );
      afirmar(
        "o Autor VÊ que houve remoção — o conteúdo não some em silêncio",
        (() => {
          const aviso = tela.avisoDoConteudo();
          return (
            aviso !== null &&
            aviso.getAttribute("role") === "alert" &&
            aviso.getAttribute("data-gravidade") === "limpo" &&
            /remov/i.test(aviso.textContent ?? "")
          );
        })(),
        tela.avisoDoConteudo()?.textContent?.slice(0, 160) ?? "nenhum aviso na tela",
      );
      afirmar(
        "o aviso nomeia QUANTOS trechos saíram e o quê — contando conteúdo, não limpeza de atributo",
        (() => {
          const texto = tela.avisoDoConteudo()?.textContent ?? "";
          // Três: o título de nível 1, a tabela e o tachado. O `level` que caiu
          // junto do `h1` é limpeza, não conteúdo, e não entra na conta.
          return (
            /\b3\b/.test(texto) &&
            /table/.test(texto) &&
            /heading/.test(texto) &&
            /strike/.test(texto) &&
            !/atributo obrigat/.test(texto) &&
            !/\blevel\b/.test(texto)
          );
        })(),
        tela.avisoDoConteudo()?.textContent?.slice(0, 200) ?? "",
      );
      afirmar(
        "e o aviso também é entregue a quem monta a tela, por `aoAvisar`",
        avisos.length === 1 && avisos[0].gravidade === "limpo",
        JSON.stringify(avisos).slice(0, 200),
      );
      afirmar(
        "o aviso é dispensável, e dispensá-lo não apaga o conteúdo",
        await (async () => {
          const fechar = tela.alvo.querySelector(
            '[aria-label="Dispensar o aviso sobre o conteúdo"]',
          );
          if (!fechar) return false;
          await tela.clicar(fechar);
          return (
            tela.avisoDoConteudo() === null &&
            (tela.areaDeEscrita()?.textContent ?? "").includes("TEXTO QUE PRECISA SOBREVIVER")
          );
        })(),
      );
      afirmar(
        "o React não reclamou ao abrir um documento sujo",
        tela.reclamacoes.length === 0,
        tela.reclamacoes.slice(0, 2).join(" | ").slice(0, 300),
      );
      await tela.desmontar();
    }

    /* ── Entrada que NÃO é documento ───────────────────────────────────── */
    {
      const avisos = [];
      const tela = await montar({
        documento: "<p>isto é HTML, não é documento</p>",
        aoAvisar: (a) => avisos.push(a),
      });
      afirmar(
        "conteúdo corrompido não derruba a tela: o Editor abre",
        tela.areaDeEscrita() !== null,
      );
      afirmar(
        "e o Autor é AVISADO de que abriu vazio, com o risco de salvar por cima dito por extenso",
        (() => {
          const aviso = tela.avisoDoConteudo();
          const texto = aviso?.textContent ?? "";
          return (
            aviso?.getAttribute("data-gravidade") === "recusado" &&
            /vazio/i.test(texto) &&
            /substitu/i.test(texto)
          );
        })(),
        tela.avisoDoConteudo()?.textContent?.slice(0, 200) ?? "nenhum aviso na tela",
      );
      afirmar(
        "o aviso de conteúdo ilegível também chega a quem monta a tela",
        avisos.length === 1 && avisos[0].gravidade === "recusado",
        JSON.stringify(avisos).slice(0, 160),
      );
      afirmar(
        "o texto do HTML cru não é interpretado nem exibido como conteúdo",
        !(tela.areaDeEscrita()?.textContent ?? "").includes("isto é HTML"),
        (tela.areaDeEscrita()?.textContent ?? "").slice(0, 80),
      );
      await tela.desmontar();
    }

    /* ── A prova de que a higienização da entrada é carregada ──────────── */
    afirmar(
      "`prepararConteudo` é pura e é ela que decide o que entra e o que se diz",
      (() => {
        const limpo = modulo.prepararConteudo(documentoLimpo());
        const comLixo = modulo.prepararConteudo({
          type: "doc",
          content: [{ type: "table", content: [] }, { type: "paragraph" }],
        });
        const ilegivel = modulo.prepararConteudo(42);
        return (
          limpo.aviso === null &&
          comLixo.aviso?.gravidade === "limpo" &&
          ilegivel.aviso?.gravidade === "recusado" &&
          igualProfundo(ilegivel.documento, schema.documentoVazio())
        );
      })(),
    );

    /* ─── (i) A gaveta retrátil e a proteção contra perda ──────────────── */

    secao("(i) a gaveta retrátil e a proteção contra perda (Story 2.7)");

    const gavetaPura = await import(urlDe(CAMINHO_MODULO_DA_GAVETA)).catch(() => null);
    const pendenciaPura = await import(urlDe(CAMINHO_PENDENCIA)).catch(() => null);
    const foco = await import(urlDe(CAMINHO_FOCO)).catch(() => null);
    const voz = await import(urlDe(CAMINHO_VOZ)).catch(() => null);
    const { toast } = await import("sonner");

    afirmar(
      "`gaveta.js`, `pendencia.js`, `foco.js` e `voz.js` importam em Node — as regras são executáveis fora do navegador",
      gavetaPura !== null && pendenciaPura !== null && foco !== null && voz !== null,
    );

    /* ── O dublê acompanha a forma do módulo real ─────────────────────────
       Sem isto, a fronteira dublada poderia perder uma exportação (ou ganhar
       uma que o módulo real não tem) e a tela continuaria montando aqui
       enquanto quebra na aplicação. */
    if (modulo.escritaReal && modulo.escritaDuble) {
      const paresDeFronteira = [
        ["escrita", modulo.escritaReal, modulo.escritaDuble],
        ["posts", modulo.postsReal, modulo.postsDuble],
        ["taxonomia", modulo.taxonomiaReal, modulo.taxonomiaDuble],
      ];
      for (const [nome, real, duble] of paresDeFronteira) {
        const daReal = Object.keys(real).sort();
        const doDuble = Object.keys(duble).sort();
        afirmar(
          `o dublê de \`data/blog/${nome}\` exporta exatamente o que o módulo real exporta`,
          // O comprimento entra na condição para que dois conjuntos VAZIOS —
          // um módulo que não carregou — não passem por igualdade vacuosa.
          daReal.length > 0 && igual(daReal, doDuble),
          `real: ${daReal.join(",")} | dublê: ${doDuble.join(",")}`,
        );
      }
    }

    /* ── As regras puras, executadas ──────────────────────────────────── */
    if (gavetaPura) {
      afirmar(
        "a gaveta NASCE ABERTA em tela larga, e recolhida em tela estreita",
        gavetaPura.nasceAberta(1440) === true &&
          gavetaPura.nasceAberta(1024) === true &&
          gavetaPura.nasceAberta(1023) === false &&
          gavetaPura.nasceAberta(390) === false,
        `1440:${gavetaPura.nasceAberta(1440)} 1024:${gavetaPura.nasceAberta(1024)} 1023:${gavetaPura.nasceAberta(1023)} 390:${gavetaPura.nasceAberta(390)}`,
      );
      afirmar(
        "largura de tela desconhecida abre a gaveta — não se esconde campo por não saber medir a tela",
        gavetaPura.nasceAberta(null) === true &&
          gavetaPura.nasceAberta(undefined) === true &&
          gavetaPura.nasceAberta("larga") === true &&
          gavetaPura.nasceAberta(0) === true,
      );
      /* As duas medidas escritas À MÃO aqui: lê-las do próprio módulo faria a
         asserção dizer apenas que ele é igual a si mesmo. */
      afirmar(
        "aberta mede 340px e recolhida mede 46px",
        gavetaPura.larguraDaGaveta(true) === "340px" &&
          gavetaPura.larguraDaGaveta(false) === "46px",
        `${gavetaPura.larguraDaGaveta(true)} / ${gavetaPura.larguraDaGaveta(false)}`,
      );
      if (voz) {
        const aberto = gavetaPura.rotuloDoControle(true);
        const fechado = gavetaPura.rotuloDoControle(false);
        afirmar(
          "o nome do controle DIZ O QUE ELE FARÁ, e muda com o estado — passa pelas guardas de voz do Painel",
          aberto !== fechado &&
            voz.diagnosticarRotuloDeAcao(aberto) === null &&
            voz.diagnosticarRotuloDeAcao(fechado) === null,
          `${aberto} | ${fechado}`,
        );
      }
    }

    if (pendenciaPura) {
      const doc = { type: "doc", content: [{ type: "paragraph" }] };
      const um = pendenciaPura.instantaneo({ titulo: "a", resumo: "b" }, doc);
      const outro = pendenciaPura.instantaneo({ resumo: "b", titulo: "a" }, doc);
      afirmar(
        "o retrato não depende da ORDEM das chaves — `jsonb` volta do Postgres reordenado, e reordenar não é alterar",
        um === outro,
        `${um} vs ${outro}`,
      );
      afirmar(
        "mas depende da ordem dos ARRAYS: trocar duas tags de lugar é alteração",
        pendenciaPura.instantaneo({ tags: ["a", "b"] }, doc) !==
          pendenciaPura.instantaneo({ tags: ["b", "a"] }, doc),
      );
      afirmar(
        "mudar o documento muda o retrato — o corpo do Post conta como alteração",
        um !==
          pendenciaPura.instantaneo(
            { titulo: "a", resumo: "b" },
            { type: "doc", content: [{ type: "paragraph" }, { type: "horizontalRule" }] },
          ),
      );
      afirmar(
        "sem referência (tela ainda carregando) NÃO há pendência — e com retrato igual também não",
        pendenciaPura.haPendencia(um, null) === false &&
          pendenciaPura.haPendencia(um, um) === false &&
          pendenciaPura.haPendencia(um, outro + "x") === true,
      );
      afirmar(
        "a descrição da saída NOMEIA o post, e diz o que se perde",
        pendenciaPura.descricaoDaSaida("Guia de atalhos").includes("Guia de atalhos") &&
          pendenciaPura.descricaoDaSaida("").includes("post"),
        pendenciaPura.descricaoDaSaida("Guia de atalhos"),
      );
      if (voz) {
        afirmar(
          "os dois rótulos do diálogo de saída dizem o que fazem",
          voz.diagnosticarRotuloDeAcao(pendenciaPura.ROTULO_PARA_SAIR) === null &&
            voz.diagnosticarRotuloDeAcao(pendenciaPura.ROTULO_PARA_FICAR) === null,
          `${pendenciaPura.ROTULO_PARA_SAIR} | ${pendenciaPura.ROTULO_PARA_FICAR}`,
        );
      }
    }

    /* ── Nada disto é lembrado entre sessões ──────────────────────────── */
    {
      const ARQUIVOS_DA_STORY = [
        CAMINHO_TELA,
        CAMINHO_GAVETA,
        CAMINHO_MODULO_DA_GAVETA,
        CAMINHO_PENDENCIA,
      ];
      const TERMOS = ["localStorage", "sessionStorage", "document.cookie", "indexedDB"];
      const procurar = (fonte) => {
        const codigo = mascararComentariosJs(fonte);
        return TERMOS.filter((termo) => codigo.includes(termo));
      };
      // Autoteste: o detector precisa acusar código e ignorar prosa.
      afirmar(
        "detector de armazenamento: acusa no código, ignora no comentário",
        procurar('const a = localStorage.getItem("x");').length === 1 &&
          procurar("/* nada aqui usa localStorage nem document.cookie */").length === 0,
      );
      const achados = [];
      for (const arquivo of ARQUIVOS_DA_STORY) {
        for (const termo of procurar(ler(arquivo))) achados.push(`${arquivo}: ${termo}`);
      }
      afirmar(
        "o estado da gaveta não é PERSISTIDO: nada nesta story toca armazenamento do navegador",
        achados.length === 0,
        achados.join(" | "),
      );
    }

    /* ── A tela montada, em DOM ───────────────────────────────────────── */

    /** Monta `EditorDePost` e devolve as ferramentas para mexer nele. */
    const montarTela = async (props) => {
      const alvo = janela.document.createElement("div");
      janela.document.body.appendChild(alvo);

      const reclamacoes = [];
      const erroOriginal = console.error;
      console.error = (...partes) => reclamacoes.push(partes.join(" "));

      const raizReact = createRoot(alvo);
      await act(async () => {
        raizReact.render(React.createElement(modulo.EditorDePost, props));
      });

      const gaveta = () => alvo.querySelector('aside[aria-label="Metadados do post"]');
      const controle = () => gaveta()?.querySelector("button[aria-controls]") ?? null;
      const campos = () => {
        const id = controle()?.getAttribute("aria-controls") ?? "";
        return id === "" ? null : janela.document.getElementById(id);
      };
      const botaoPorTexto = (dentro, texto) =>
        [...dentro.querySelectorAll("button")].find(
          (b) => (b.textContent ?? "").trim() === texto,
        ) ?? null;

      return {
        alvo,
        reclamacoes,
        gaveta,
        controle,
        campos,
        botaoPorTexto,
        colunaDoTexto: () => alvo.querySelector('[role="textbox"]'),
        /* O irmão anterior da gaveta é a coluna do texto — estrutural, e não
           por classe: uma busca por classe encontraria o invólucro de rolagem
           de dentro do Editor e a asserção mudaria de assunto sem avisar. */
        involucroDoTexto: () => gaveta()?.previousElementSibling ?? null,
        /* O campo de `publicado_em` mora, hoje, dentro do modal de
           agendamento — um `Dialog` que monta em PORTAL, fora de `alvo`
           (preso ao `body`, como todo componente do Radix). Buscar só dentro
           de `alvo` faria o helper nunca achar esse campo; buscar sempre no
           documento inteiro faria dois `EditorDePost` montados ao mesmo
           tempo (como o bloco de agendamento faz de propósito) colidir — o
           `querySelector` do documento bate sempre no campo do PRIMEIRO
           montado. A busca tenta `alvo` primeiro — a instância certa — e só
           cai para o documento inteiro se não achar, que é o caso do portal. */
        campo: (nome) =>
          alvo.querySelector(`[data-campo="${nome}"]`) ??
          janela.document.querySelector(`[data-campo="${nome}"]`),
        voltar: () => alvo.querySelector('button[aria-label="Voltar para a listagem"]'),
        /* As ações da Story 2.8, lidas pelo DADO que cada botão carrega — não
           pelo texto: casar rótulo traduzido faria a asserção mudar de assunto
           na primeira revisão de redação. */
        acoes: () => [...alvo.querySelectorAll("button[data-acao]")],
        acaoPorChave: (chave) => alvo.querySelector(`button[data-acao="${chave}"]`),
        pilula: () => alvo.querySelector("[data-estado]"),
        verNoSite: () => alvo.querySelector('a[href^="/blog/"]'),
        /* A ação de ver, seja qual for o destino. Ela deixou de sumir quando o
           Post não está publicado (Story 2.13): passou a levar à prévia. */
        acaoDeVer: () => alvo.querySelector("a[data-acao-ver]"),
        salvar: () =>
          [...alvo.querySelectorAll("button")].find((b) =>
            (b.textContent ?? "").includes("Salvar"),
          ) ?? null,
        dialogo: () => janela.document.querySelector('[role="alertdialog"]'),
        /* O modal de agendamento é um `Dialog` (Radix), não um `AlertDialog`:
           ele COLETA um dado, não confirma uma ação já decidida — por isso o
           papel é `dialog`, e não `alertdialog`. */
        modalDeAgendamento: () => janela.document.querySelector('[role="dialog"]'),
        async clicar(elemento) {
          await act(async () => {
            elemento.dispatchEvent(new janela.MouseEvent("click", { bubbles: true }));
          });
        },
        async digitar(entrada, texto) {
          const prototipo =
            entrada.tagName === "TEXTAREA"
              ? janela.HTMLTextAreaElement.prototype
              : janela.HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(prototipo, "value").set;
          await act(async () => {
            setter.call(entrada, texto);
            entrada.dispatchEvent(new janela.Event("input", { bubbles: true }));
          });
        },
        async desmontar() {
          console.error = erroOriginal;
          await act(async () => raizReact.unmount());
          alvo.remove();
        },
      };
    };

    /* A largura da tela é dado de montagem, e o jsdom deixa redefini-la. */
    const larguraOriginal = janela.innerWidth;
    const fingirLargura = (px) => {
      Object.defineProperty(janela, "innerWidth", {
        value: px,
        configurable: true,
        writable: true,
      });
    };

    /* O ouvinte de saída, contado de fora: registrar e nunca remover é um
       defeito que só aparece meses depois, quando o navegador passa a
       perguntar sem motivo. */
    let ouvintesVivos = 0;
    const adicionarOriginal = janela.addEventListener.bind(janela);
    const removerOriginal = janela.removeEventListener.bind(janela);
    janela.addEventListener = (tipo, ouvinte, opcoes) => {
      if (tipo === "beforeunload") ouvintesVivos += 1;
      return adicionarOriginal(tipo, ouvinte, opcoes);
    };
    janela.removeEventListener = (tipo, ouvinte, opcoes) => {
      if (tipo === "beforeunload") ouvintesVivos -= 1;
      return removerOriginal(tipo, ouvinte, opcoes);
    };
    /** O navegador pergunta antes de fechar ou recarregar? */
    const perguntaAoDescarregar = () => {
      const evento = new janela.Event("beforeunload", { cancelable: true });
      janela.dispatchEvent(evento);
      return evento.defaultPrevented;
    };

    /* ── Abrir, recolher, reabrir ─────────────────────────────────────── */
    fingirLargura(1440);
    {
      const tela = await montarTela({ postId: null });

      afirmar(
        "a gaveta NASCE ABERTA, medindo 340px, com os campos à vista",
        tela.gaveta()?.style.width === "340px" && tela.campos()?.hidden === false,
        `largura: ${tela.gaveta()?.style.width} | campos escondidos: ${tela.campos()?.hidden}`,
      );
      afirmar(
        "e o controle se anuncia expandido, apontando para a região que ele controla",
        tela.controle()?.getAttribute("aria-expanded") === "true" &&
          tela.campos() !== null,
        `aria-expanded: ${tela.controle()?.getAttribute("aria-expanded")}`,
      );

      /* ── Correção de UI/UX do Editor: rolagem contida ────────────────────
         A `Moldura` (`EditorDePost.jsx`) fixa `h-screen`, mas isso não impede
         o navegador de rolar quando o conteúdo excede essa altura por um
         triz — cada painel interno (Editor, Gaveta) já rola por conta
         própria, e a moldura não deveria rolar mais nenhuma vez. */
      afirmar(
        "a moldura do Editor tem `overflow-hidden` junto de `h-screen`: a tela não rola além do fim do conteúdo",
        (() => {
          const classe = tela.alvo.firstElementChild?.className ?? "";
          const tokens = classe.split(/\s+/u);
          return tokens.includes("h-screen") && tokens.includes("overflow-hidden");
        })(),
        `classe da moldura: ${tela.alvo.firstElementChild?.className}`,
      );

      /* ── Correção de UI/UX do Editor: sem padding duplicado ──────────────
         `CLASSE_DA_AREA_DE_ESCRITA` (`configuracao.js`) não pode redeclarar
         `py-*`: o invólucro em `Editor.jsx` já aplica `py-6`, e as duas
         juntas dobravam o respiro antes do primeiro caractere do post. */
      afirmar(
        "a área de escrita não redeclara padding vertical: `py-6` só existe no invólucro",
        configuracao
          ? !configuracao.CLASSE_DA_AREA_DE_ESCRITA.split(/\s+/u).some((token) =>
              /^p[ty]-/.test(token),
            )
          : false,
        `classe declarada: ${configuracao?.CLASSE_DA_AREA_DE_ESCRITA}`,
      );

      /* ── Correção de UI/UX do Editor: o anel de foco da Gaveta não corta ──
         A caixa que rola os campos (`GavetaDeMetadados.jsx`) só declarava
         `overflow-y-auto`, e por especificação CSS isso faz o navegador
         computar `overflow-x: auto` também — a caixa passa a CLIPAR o
         `box-shadow` do anel de foco bem na borda de padding. `px-1 -mx-1`
         devolve a folga sem realinhar nada. */
      afirmar(
        "o container que rola os campos da Gaveta tem `px-1 -mx-1`, a folga que evita o corte do anel de foco",
        (() => {
          const tokens = (tela.campos()?.className ?? "").split(/\s+/u);
          return (
            tokens.includes("overflow-y-auto") &&
            tokens.includes("px-1") &&
            tokens.includes("-mx-1")
          );
        })(),
        `classe: ${tela.campos()?.className}`,
      );

      if (foco) {
        const classe = tela.controle()?.className ?? "";
        const faltando = [...foco.ANEL_DE_FOCO.split(" "), ...foco.ALVO_DE_TOQUE.split(" ")]
          .filter((token) => token !== "")
          .filter((token) => !classe.split(/\s+/u).includes(token));
        afirmar(
          "o controle de recolher tem anel de foco e alvo de toque de 40px — cada classe conferida, não a soma",
          faltando.length === 0,
          `faltam: ${faltando.join(", ")}`,
        );
      }
      afirmar(
        "o controle é alcançável por teclado: é um `button` de verdade, sem `tabindex` negativo",
        tela.controle()?.tagName === "BUTTON" &&
          tela.controle()?.getAttribute("tabindex") === null &&
          !tela.controle()?.hasAttribute("disabled"),
        `${tela.controle()?.tagName} tabindex=${tela.controle()?.getAttribute("tabindex")}`,
      );

      const classeDoTextoAberta = tela.colunaDoTexto()?.className ?? "";
      const classeDoInvolucroAberta = tela.involucroDoTexto()?.className ?? "";
      const rotuloAberta = tela.controle()?.getAttribute("aria-label") ?? "";

      await tela.clicar(tela.controle());

      afirmar(
        "recolher leva a um trilho de 46px e esconde os campos",
        tela.gaveta()?.style.width === "46px" && tela.campos()?.hidden === true,
        `largura: ${tela.gaveta()?.style.width} | campos escondidos: ${tela.campos()?.hidden}`,
      );
      afirmar(
        "o controle de REABRIR continua visível dentro do trilho, e mudou de nome",
        tela.controle() !== null &&
          tela.gaveta()?.contains(tela.controle()) === true &&
          tela.controle()?.closest("[hidden]") === null &&
          (tela.controle()?.getAttribute("aria-label") ?? "") !== rotuloAberta &&
          tela.controle()?.getAttribute("aria-expanded") === "false",
        `${rotuloAberta} → ${tela.controle()?.getAttribute("aria-label")}`,
      );
      if (voz) {
        afirmar(
          "e o nome novo continua dizendo o que fará",
          voz.diagnosticarRotuloDeAcao(tela.controle()?.getAttribute("aria-label")) === null,
          String(tela.controle()?.getAttribute("aria-label")),
        );
      }

      /* A MEDIDA NÃO MUDA. O que muda é a largura do contêiner — e a coluna
         se recentraliza dentro dele, porque `.artigo` fixa 68ch no próprio
         elemento e a área de escrita é `mx-auto`. */
      afirmar(
        "recolher NÃO estica o texto: a classe da coluna é idêntica nos dois estados",
        (tela.colunaDoTexto()?.className ?? "") === classeDoTextoAberta &&
          classeDoTextoAberta !== "",
        `${classeDoTextoAberta} → ${tela.colunaDoTexto()?.className}`,
      );
      afirmar(
        "a coluna CENTRALIZA: `mx-auto` na área de escrita, e nenhuma largura declarada no invólucro",
        classeDoTextoAberta.split(/\s+/u).includes("mx-auto") &&
          (tela.involucroDoTexto()?.className ?? "") === classeDoInvolucroAberta &&
          !classeDoInvolucroAberta.includes("max-w-") &&
          !classeDoInvolucroAberta.includes("w-[") &&
          (tela.involucroDoTexto()?.style.width ?? "") === "",
        `invólucro: ${classeDoInvolucroAberta}`,
      );

      await tela.clicar(tela.controle());
      afirmar(
        "reabrir devolve os 340px e os campos",
        tela.gaveta()?.style.width === "340px" && tela.campos()?.hidden === false,
        `largura: ${tela.gaveta()?.style.width}`,
      );

      // Recolhida de novo, para provar que o estado NÃO sobrevive à montagem.
      await tela.clicar(tela.controle());
      afirmar(
        "o React não reclamou ao recolher e reabrir a gaveta",
        tela.reclamacoes.length === 0,
        tela.reclamacoes.slice(0, 2).join(" | ").slice(0, 300),
      );
      await tela.desmontar();
    }

    {
      const tela = await montarTela({ postId: null });
      afirmar(
        "a gaveta NÃO LEMBRA o estado da sessão anterior: recolhida antes, aberta agora",
        tela.gaveta()?.style.width === "340px",
        `largura: ${tela.gaveta()?.style.width}`,
      );
      await tela.desmontar();
    }

    /* ── Tela estreita ────────────────────────────────────────────────── */
    fingirLargura(800);
    {
      const tela = await montarTela({ postId: null });
      afirmar(
        "em tela estreita a gaveta NASCE RECOLHIDA — pelo mesmo mecanismo, sem regra responsiva separada",
        tela.gaveta()?.style.width === "46px" && tela.campos()?.hidden === true,
        `largura: ${tela.gaveta()?.style.width}`,
      );
      afirmar(
        "e o controle de reabrir está lá desde o primeiro quadro",
        tela.controle() !== null && tela.controle()?.closest("[hidden]") === null,
      );
      await tela.desmontar();
    }
    fingirLargura(1440);

    /* ── A proteção contra perda ──────────────────────────────────────── */
    {
      const ID_DE_PROVA = "11111111-2222-4333-8444-555555555555";
      const CORPO_SALVO = "corpo que precisa sobreviver";
      const documentoGravado = {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: CORPO_SALVO }] }],
      };

      modulo.controle.pedidos.length = 0;
      modulo.controle.resposta = {
        ok: true,
        dados: { criado: true, post: { id: ID_DE_PROVA, slug: "guia-de-atalhos" } },
      };
      modulo.controle.post = {
        ok: true,
        dados: {
          id: ID_DE_PROVA,
          slug: "guia-de-atalhos",
          titulo: "Guia de atalhos",
          resumo: "O que dá para fazer sem tirar as mãos do teclado.",
          conteudo: documentoGravado,
          categoria_id: null,
          publicado_em: null,
          tempo_leitura: 0,
          /* O Estado vem SEMPRE na linha: a camada de dados o confere contra o
             vocabulário fechado e devolve erro tipado quando ele não bate, então
             a tela pode contar com ele. Um dublê que o omitisse estaria
             simulando uma linha que a camada real nunca entrega. */
          estado: "rascunho",
        },
      };

      const saidas = [];
      const tela = await montarTela({ postId: null, aoSair: () => saidas.push(1) });

      afirmar(
        "sem alteração nenhuma, o navegador NÃO pergunta ao fechar ou recarregar — e não há ouvinte registrado",
        ouvintesVivos === 0 && perguntaAoDescarregar() === false,
        `ouvintes vivos: ${ouvintesVivos}`,
      );
      await tela.clicar(tela.voltar());
      afirmar(
        "e voltar para a listagem sai DIRETO, sem diálogo",
        saidas.length === 1 && tela.dialogo() === null,
        `saídas: ${saidas.length} | diálogo: ${tela.dialogo() !== null}`,
      );

      await tela.digitar(tela.campo("titulo"), "Guia de atalhos");
      afirmar(
        "com alteração pendente, o ouvinte de saída é REGISTRADO e o navegador passa a perguntar",
        ouvintesVivos === 1 && perguntaAoDescarregar() === true,
        `ouvintes vivos: ${ouvintesVivos}`,
      );

      await tela.clicar(tela.voltar());
      const dialogo = tela.dialogo();
      afirmar(
        "voltar para a listagem PERGUNTA antes de sair, e não sai enquanto não se responde",
        dialogo !== null && saidas.length === 1,
        `saídas: ${saidas.length}`,
      );
      afirmar(
        "o diálogo nomeia o post e diz o que se perde",
        (dialogo?.textContent ?? "").includes("Guia de atalhos") &&
          tela.botaoPorTexto(dialogo ?? tela.alvo, pendenciaPura.ROTULO_PARA_SAIR) !== null &&
          tela.botaoPorTexto(dialogo ?? tela.alvo, pendenciaPura.ROTULO_PARA_FICAR) !== null,
        (dialogo?.textContent ?? "").slice(0, 200),
      );

      await tela.clicar(tela.botaoPorTexto(dialogo, pendenciaPura.ROTULO_PARA_FICAR));
      afirmar(
        "cancelar MANTÉM TUDO como está: o diálogo fecha, ninguém sai e o texto continua no campo",
        tela.dialogo() === null &&
          saidas.length === 1 &&
          tela.campo("titulo")?.value === "Guia de atalhos",
        `saídas: ${saidas.length} | título: ${tela.campo("titulo")?.value}`,
      );

      await tela.clicar(tela.voltar());
      await tela.clicar(tela.botaoPorTexto(tela.dialogo(), pendenciaPura.ROTULO_PARA_SAIR));
      afirmar(
        "confirmar sai — a proteção pergunta, não impede",
        saidas.length === 2,
        `saídas: ${saidas.length}`,
      );

      /* ── Salvar com sucesso apaga a pendência ─────────────────────── */
      await tela.digitar(
        tela.campo("resumo"),
        "O que dá para fazer sem tirar as mãos do teclado.",
      );
      await tela.clicar(tela.salvar());
      afirmar(
        "a gravação passou pelo caminho de escrita da tela — o dublê recebeu o pedido",
        modulo.controle.pedidos.length === 1,
        `pedidos: ${modulo.controle.pedidos.length}`,
      );
      afirmar(
        "depois de salvar, o ouvinte de saída é REMOVIDO e o navegador para de perguntar",
        ouvintesVivos === 0 && perguntaAoDescarregar() === false,
        `ouvintes vivos: ${ouvintesVivos}`,
      );
      await tela.clicar(tela.voltar());
      afirmar(
        "e sair passa a ser direto de novo",
        saidas.length === 3 && tela.dialogo() === null,
        `saídas: ${saidas.length}`,
      );

      /* ── Falha ao salvar: nada é descartado ───────────────────────── */
      const RECUSA = "Já existe um post com este endereço. Escolha outro antes de salvar.";
      modulo.controle.resposta = {
        ok: false,
        erro: { tipo: "conflito", mensagem: RECUSA, faltando: null },
      };
      const historicoAntes = toast.getHistory().length;
      await tela.digitar(tela.campo("titulo"), "Guia de atalhos do editor");
      await tela.clicar(tela.salvar());

      afirmar(
        "falha ao salvar MANTÉM o Autor no Editor, com o conteúdo intacto",
        tela.campo("titulo")?.value === "Guia de atalhos do editor" &&
          (tela.colunaDoTexto()?.textContent ?? "").includes(CORPO_SALVO) &&
          tela.gaveta() !== null,
        `título: ${tela.campo("titulo")?.value} | corpo: ${(tela.colunaDoTexto()?.textContent ?? "").slice(0, 60)}`,
      );
      afirmar(
        "e a pendência CONTINUA pendente — o que não foi gravado não pode ser dado por gravado",
        perguntaAoDescarregar() === true && ouvintesVivos === 1,
        `ouvintes vivos: ${ouvintesVivos}`,
      );
      {
        const novos = toast.getHistory().slice(historicoAntes);
        const recusa = novos.find((t) => String(t.description ?? "") === RECUSA) ?? null;
        afirmar(
          "a falha produz uma mensagem ACIONÁVEL: a frase do servidor chega inteira à tela",
          recusa !== null,
          novos.map((t) => `${t.title} / ${t.description}`).join(" | ").slice(0, 220),
        );
        if (recusa && voz) {
          afirmar(
            "e as duas metades da mensagem passam pelas guardas de voz — nada de “erro inesperado”",
            voz.diagnosticarMensagem("o que houve", String(recusa.title)) === null &&
              voz.diagnosticarMensagem("o que fazer", String(recusa.description)) === null,
            `${recusa.title} / ${recusa.description}`,
          );
        }
      }
      afirmar(
        "o React não reclamou durante a proteção contra perda",
        tela.reclamacoes.length === 0,
        tela.reclamacoes.slice(0, 2).join(" | ").slice(0, 300),
      );

      await tela.desmontar();
      afirmar(
        "desmontar a tela não deixa ouvinte de saída para trás",
        ouvintesVivos === 0,
        `ouvintes vivos: ${ouvintesVivos}`,
      );
    }

    /* ─── (j) As ações por Estado (Story 2.8) ─────────────────────────── */

    secao("(j) as ações por Estado: derivadas da máquina, e o Estado à vista");

    const transicoes = await import(urlDe(CAMINHO_TRANSICOES)).catch(() => null);
    afirmar(
      "`transicoes.js` importa em Node — a máquina é executável fora do navegador, como o servidor a usa",
      transicoes !== null,
    );

    if (transicoes) {
      /* O CRITÉRIO DE ACEITE, transcrito à mão. É a fonte independente: ler a
         lista do próprio módulo faria a asserção dizer que ele é igual a si
         mesmo. Divergência entre esta tabela e a máquina é decisão de produto,
         e a story diz para bloquear em vez de escolher. */
      const ACOES_DO_CRITERIO = {
        rascunho: ["salvar", "agendar", "publicar"],
        agendado: ["salvar", "reagendar", "cancelar_agendamento", "publicar"],
        publicado: ["salvar", "arquivar"],
        arquivado: ["salvar", "republicar"],
      };

      for (const [estado, esperadas] of Object.entries(ACOES_DO_CRITERIO)) {
        const declaradas = transicoes.acoesDoEstado(estado).map((a) => a.chave);
        afirmar(
          `em ${estado} a máquina declara exatamente as ações do critério, na ordem`,
          igual(declaradas, esperadas),
          `declaradas: ${declaradas.join(", ")} | critério: ${esperadas.join(", ")}`,
        );
      }

      if (voz) {
        const rotulos = [];
        const confirmacoes = [];
        for (const estado of Object.keys(ACOES_DO_CRITERIO)) {
          for (const acao of transicoes.acoesDoEstado(estado)) {
            rotulos.push(acao.rotulo);
            confirmacoes.push(acao.confirmacao);
          }
        }
        afirmar(
          "todo rótulo de ação DIZ O QUE FARÁ — passa pelas guardas de voz do Painel",
          rotulos.every((r) => voz.diagnosticarRotuloDeAcao(r) === null),
          rotulos.filter((r) => voz.diagnosticarRotuloDeAcao(r) !== null).join(" | ") || "todos passam",
        );
        afirmar(
          "e toda confirmação diz o que ACONTECEU, sem repetir o rótulo",
          confirmacoes.every(
            (c, i) => voz.diagnosticarMensagem("o que aconteceu", c) === null && c !== rotulos[i],
          ),
          confirmacoes.join(" | "),
        );
      }

      /* ── A tela, montada em cada Estado ─────────────────────────────── */

      const ID_DO_CICLO = "22222222-3333-4444-8555-666666666666";
      const documentoDoCiclo = {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "texto do ciclo de vida" }] }],
      };
      const postNoEstado = (estado, publicado_em) => ({
        ok: true,
        dados: {
          id: ID_DO_CICLO,
          slug: "ciclo-de-vida",
          titulo: "Ciclo de vida",
          resumo: "Como um post sai do rascunho e vai ao ar.",
          conteudo: documentoDoCiclo,
          categoria_id: null,
          publicado_em,
          tempo_leitura: 3,
          estado,
        },
      });

      const NO_PASSADO = "2026-01-01T00:00:00+00:00";
      for (const estado of Object.keys(ACOES_DO_CRITERIO)) {
        modulo.controle.post = postNoEstado(estado, estado === "rascunho" ? null : NO_PASSADO);
        const tela = await montarTela({ postId: ID_DO_CICLO });
        const naTela = tela.acoes().map((b) => b.getAttribute("data-acao"));
        afirmar(
          `com o Post em ${estado}, a tela oferece exatamente essas ações — nem mais, nem menos`,
          igual(naTela, ACOES_DO_CRITERIO[estado]),
          `na tela: ${naTela.join(", ") || "nenhuma"}`,
        );
        afirmar(
          `e os rótulos desenhados são os da máquina, na mesma ordem`,
          igual(
            tela.acoes().map((b) => (b.textContent ?? "").trim()),
            transicoes.acoesDoEstado(estado).map((a) => a.rotulo),
          ),
          tela.acoes().map((b) => (b.textContent ?? "").trim()).join(" | "),
        );
        /* O Autor precisa saber ONDE está antes de escolher para onde vai. A
           pílula traz o ponto e a palavra por extenso — a mesma palavra da
           listagem e do filtro, porque vem do vocabulário fechado. */
        afirmar(
          `e a pílula mostra "${estado}" por extenso, ao lado das ações`,
          tela.pilula()?.getAttribute("data-estado") === estado &&
            (tela.pilula()?.textContent ?? "").trim() !== "",
          `pílula: ${tela.pilula()?.getAttribute("data-estado")} / ${(tela.pilula()?.textContent ?? "").trim()}`,
        );
        if (estado === "publicado") {
          afirmar(
            "e um Post publicado NÃO oferece caminho de volta: nenhum botão leva a rascunho ou a agendado",
            tela.acoes().every(
              (b) => !["rascunho", "agendado"].includes(b.getAttribute("data-destino")),
            ),
            tela.acoes().map((b) => `${b.getAttribute("data-acao")}→${b.getAttribute("data-destino")}`).join(", "),
          );
          afirmar(
            "e o link para ver no site aponta para o endereço público do Post, em aba nova",
            tela.verNoSite()?.getAttribute("href") === "/blog/ciclo-de-vida" &&
              tela.verNoSite()?.getAttribute("target") === "_blank" &&
              /noopener/.test(tela.verNoSite()?.getAttribute("rel") ?? ""),
            `${tela.verNoSite()?.getAttribute("href")} | ${tela.verNoSite()?.getAttribute("rel")}`,
          );
        }
        if (estado === "rascunho") {
          afirmar(
            "um Post que não está no ar NÃO oferece link para o site — não há o que ver lá",
            tela.verNoSite() === null,
            String(tela.verNoSite()?.getAttribute("href")),
          );
          /* ─── MAS A AÇÃO DE VER DEIXOU DE SUMIR (Story 2.13) ───────────
             Antes desta story ela simplesmente não existia para rascunho, e a
             mesma decisão na listagem produzia um botão que explicava — duas
             telas, dois tratamentos. Agora as duas levam ao mesmo lugar. */
          afirmar(
            "e a ação de ver NÃO some: ela leva à pré-visualização, sob o Painel e em aba nova",
            tela.acaoDeVer()?.getAttribute("data-acao-ver") ===
              modulo.regrasDasAcoes.DESTINO_PREVIA &&
              tela.acaoDeVer()?.getAttribute("href") ===
                `/admin/previa/${ID_DO_CICLO}` &&
              tela.acaoDeVer()?.getAttribute("target") === "_blank" &&
              /noopener/.test(tela.acaoDeVer()?.getAttribute("rel") ?? ""),
            `${tela.acaoDeVer()?.getAttribute("data-acao-ver")} ${tela.acaoDeVer()?.getAttribute("href")}`,
          );
        }
        afirmar(
          `o React não reclamou ao desenhar as ações de ${estado}`,
          tela.reclamacoes.length === 0,
          tela.reclamacoes.slice(0, 2).join(" | ").slice(0, 300),
        );
        await tela.desmontar();
      }

      /* ── PUBLICAR MANTÉM O AUTOR NO EDITOR ──────────────────────────── */
      {
        modulo.controle.post = postNoEstado("rascunho", null);
        modulo.controle.pedidos.length = 0;
        /* Segundos e milissegundos ZERADOS: o campo `datetime-local` só tem
           minuto — `paraCampoDeInstante`/`deCampoDeInstante` arredondam para
           baixo nessa granularidade. Um instante com segundos (o comum de
           `new Date().toISOString()`) faria a comparação por INSTANTE, mais
           abaixo, comparar um valor com segundos contra o mesmo valor SEM
           eles — perda de precisão que é do campo, não um defeito da tela. */
        const publicadoEm = (() => {
          const d = new Date(Date.now() - 60_000);
          d.setUTCSeconds(0, 0);
          return d.toISOString();
        })();
        modulo.controle.resposta = {
          ok: true,
          dados: {
            criado: false,
            post: {
              id: ID_DO_CICLO,
              slug: "ciclo-de-vida",
              estado: "publicado",
              publicado_em: publicadoEm,
            },
          },
        };

        const saidas = [];
        const tela = await montarTela({ postId: ID_DO_CICLO, aoSair: () => saidas.push(1) });
        await tela.clicar(tela.acaoPorChave("publicar"));

        afirmar(
          "publicar manda o DESTINO no pedido — a tela informa, o servidor decide",
          modulo.controle.pedidos.length === 1 &&
            modulo.controle.pedidos[0]?.estado === "publicado",
          `pedidos: ${modulo.controle.pedidos.length} | estado: ${modulo.controle.pedidos[0]?.estado}`,
        );
        afirmar(
          "e o Autor PERMANECE no Editor: ninguém foi devolvido para a listagem",
          saidas.length === 0 && tela.gaveta() !== null && tela.colunaDoTexto() !== null,
          `saídas: ${saidas.length}`,
        );
        afirmar(
          "o Estado mostrado muda para publicado, e as ações passam a ser as de publicado",
          tela.pilula()?.getAttribute("data-estado") === "publicado" &&
            igual(
              tela.acoes().map((b) => b.getAttribute("data-acao")),
              ACOES_DO_CRITERIO.publicado,
            ),
          `pílula: ${tela.pilula()?.getAttribute("data-estado")} | ações: ${tela
            .acoes()
            .map((b) => b.getAttribute("data-acao"))
            .join(", ")}`,
        );
        afirmar(
          "e aparece o link para ver no site — a confirmação de que o Post está no ar",
          tela.verNoSite()?.getAttribute("href") === "/blog/ciclo-de-vida",
          String(tela.verNoSite()?.getAttribute("href")),
        );
        /* A data que o SERVIDOR gravou passa a ser a que a tela guarda. Sem
           isto, o próximo `salvar` mandaria de volta o vazio de antes de
           publicar. `publicado` não oferece ação nenhuma que exija data — a
           data não tem mais campo visível neste Estado —, então a prova é
           INDIRETA: salvar de novo e conferir que o pedido leva a MESMA data
           que o servidor gravou ao publicar, comparada pelo instante. */
        await tela.clicar(tela.acaoPorChave("salvar"));
        afirmar(
          "a data que o servidor gravou ao publicar é a que um `salvar` seguinte leva de volta",
          modulo.controle.pedidos.length === 2 &&
            typeof modulo.controle.pedidos[1]?.publicado_em === "string" &&
            new Date(modulo.controle.pedidos[1].publicado_em).getTime() ===
              new Date(publicadoEm).getTime(),
          `pedido: ${modulo.controle.pedidos[1]?.publicado_em} | gravado ao publicar: ${publicadoEm}`,
        );
        await tela.desmontar();
      }

      /* ── Correção de UI/UX do Editor: "Agendar publicação" ABRE UM MODAL ──
         O campo saiu da gaveta — ele era redundante com este botão, que hoje
         não submetia mais nada, só cobrava o campo de novo. Agora ele abre
         um modal (dia/hora), e é a CONFIRMAÇÃO dele que salva. */
      {
        modulo.controle.post = postNoEstado("rascunho", null);
        modulo.controle.pedidos.length = 0;
        const tela = await montarTela({ postId: ID_DO_CICLO });

        afirmar(
          "antes de clicar em \"Agendar publicação\", não há modal nenhum na tela",
          tela.modalDeAgendamento() === null,
        );

        await tela.clicar(tela.acaoPorChave("agendar"));
        afirmar(
          "clicar em \"Agendar publicação\" ABRE O MODAL pedindo dia e hora, sem viajar pedido nenhum",
          tela.modalDeAgendamento() !== null && modulo.controle.pedidos.length === 0,
          `modal aberto: ${tela.modalDeAgendamento() !== null} | pedidos: ${modulo.controle.pedidos.length}`,
        );
        afirmar(
          "e o campo do modal nasce VAZIO — o Post ainda não tem data nenhuma",
          (tela.campo("publicado_em")?.value ?? "algo") === "",
          `campo: ${JSON.stringify(tela.campo("publicado_em")?.value)}`,
        );

        const confirmar = () =>
          tela.modalDeAgendamento()?.querySelector('[data-papel="confirmar-agendamento"]') ??
          null;

        // Confirmar sem preencher nada: a recusa aparece DENTRO do modal, e
        // não fecha nem manda pedido nenhum.
        await tela.clicar(confirmar());
        afirmar(
          "confirmar sem dia e hora recusa DENTRO do modal (`role=\"alert\"`, com conteúdo), sem fechar nem viajar pedido",
          tela.modalDeAgendamento() !== null &&
            modulo.controle.pedidos.length === 0 &&
            (() => {
              const alerta = tela.modalDeAgendamento()?.querySelector('[role="alert"]');
              return alerta !== null && (alerta.textContent ?? "").trim() !== "";
            })(),
          `alerta: ${JSON.stringify(tela.modalDeAgendamento()?.querySelector('[role="alert"]')?.textContent ?? null)}`,
        );

        // Com data preenchida, confirmar passa — senão a asserção acima
        // estaria satisfeita por um botão que nunca funciona.
        await tela.digitar(tela.campo("publicado_em"), "2027-03-01T09:30");
        await tela.clicar(confirmar());
        afirmar(
          "com a data preenchida, confirmar FECHA o modal e o pedido viaja com o destino `agendado`",
          tela.modalDeAgendamento() === null &&
            modulo.controle.pedidos.length === 1 &&
            modulo.controle.pedidos[0]?.estado === "agendado" &&
            typeof modulo.controle.pedidos[0]?.publicado_em === "string",
          `modal aberto: ${tela.modalDeAgendamento() !== null} | pedidos: ${modulo.controle.pedidos.length} | ${JSON.stringify(
            modulo.controle.pedidos[0]?.estado,
          )} em ${JSON.stringify(modulo.controle.pedidos[0]?.publicado_em)}`,
        );
        afirmar(
          "o React não reclamou de nada ao abrir, recusar e confirmar o modal",
          tela.reclamacoes.length === 0,
          tela.reclamacoes.slice(0, 2).join(" | ").slice(0, 300),
        );
        await tela.desmontar();
      }

      /* ─── (k) O agendamento, na tela (Story 2.9) ───────────────────── */

      secao("(k) o agendamento na tela: a data confirmada, e a recusa com saída");

      /* A hora de parede que o Autor digita, o instante que o servidor devolve
         e o texto que a confirmação precisa mostrar. Os três estão escritos À
         MÃO: derivar o esperado do próprio módulo de formatação faria a
         asserção dizer que ele é igual a si mesmo, e é justamente a conversão
         de fuso que se quer observar. 09:30 em São Paulo é 12:30Z, e 1º de
         março de 2027 é uma segunda-feira. */
      const HORA_DE_PAREDE = "2027-03-01T09:30";
      const INSTANTE_AGENDADO = "2027-03-01T12:30:00.000Z";
      const POR_EXTENSO = "segunda-feira, 1 de março de 2027, às 09:30";

      /* ── A CONFIRMAÇÃO DIZ A DATA ESCOLHIDA, POR EXTENSO ────────────── */
      {
        modulo.controle.post = postNoEstado("rascunho", null);
        modulo.controle.pedidos.length = 0;
        modulo.controle.resposta = {
          ok: true,
          dados: {
            criado: false,
            post: {
              id: ID_DO_CICLO,
              slug: "ciclo-de-vida",
              titulo: "Ciclo de vida",
              estado: "agendado",
              publicado_em: INSTANTE_AGENDADO,
            },
          },
        };
        const tela = await montarTela({ postId: ID_DO_CICLO });
        await tela.clicar(tela.acaoPorChave("agendar"));
        await tela.digitar(tela.campo("publicado_em"), HORA_DE_PAREDE);
        const historicoAntes = toast.getHistory().length;
        await tela.clicar(
          tela.modalDeAgendamento().querySelector('[data-papel="confirmar-agendamento"]'),
        );
        const novos = toast.getHistory().slice(historicoAntes);
        const confirmacao = novos[novos.length - 1] ?? null;
        const detalhe = String(confirmacao?.description ?? "");

        afirmar(
          "agendar confirma dizendo a DATA ESCOLHIDA por extenso, no fuso de apresentação",
          detalhe.includes(POR_EXTENSO),
          `esperado conter "${POR_EXTENSO}" | veio "${detalhe}"`,
        );
        /* Devolver o que a pessoa acabou de digitar não confirma nada. O que
           precisa aparecer é a data que o SISTEMA entendeu — é o único ponto do
           fluxo em que um erro de fuso fica visível antes de o Post ir ao ar. */
        afirmar(
          "e não devolve o texto cru do campo — é a data entendida que confirma, não a digitada",
          !detalhe.includes(HORA_DE_PAREDE) && !detalhe.includes(INSTANTE_AGENDADO),
          detalhe,
        );
        if (voz) {
          afirmar(
            "e a confirmação nomeia o que aconteceu — passa pelas guardas de voz do Painel",
            confirmacao !== null &&
              voz.diagnosticarMensagem("o que aconteceu", String(confirmacao.title)) === null,
            `${confirmacao?.title} / ${detalhe}`,
          );
        }
        afirmar(
          "o React não reclamou ao confirmar o agendamento",
          tela.reclamacoes.length === 0,
          tela.reclamacoes.slice(0, 2).join(" | ").slice(0, 300),
        );
        await tela.desmontar();
      }

      /* ── REABRIR COM DATA JÁ AGENDADA MOSTRA A DATA JÁ AGENDADA ──────── */
      {
        modulo.controle.post = postNoEstado("agendado", INSTANTE_AGENDADO);
        modulo.controle.pedidos.length = 0;
        const tela = await montarTela({ postId: ID_DO_CICLO });
        await tela.clicar(tela.acaoPorChave("reagendar"));
        afirmar(
          "reabrir o modal com um Post JÁ agendado mostra a data já escolhida — não em branco",
          tela.campo("publicado_em")?.value === HORA_DE_PAREDE,
          `campo: ${tela.campo("publicado_em")?.value}`,
        );
        await tela.desmontar();
      }

      /* ── "CANCELAR" NÃO DESFAZ NADA: O RASCUNHO É LOCAL AO MODAL ─────── *
       * Achado da revisão adversarial desta correção: o campo do modal
       * escrevia direto em `valores.publicado_em` a cada tecla, e nem
       * "Cancelar" nem o "X" revertiam isso — só fechavam o modal. Digitar
       * uma data e cancelar precisa devolver EXATAMENTE a data de antes. */
      {
        modulo.controle.post = postNoEstado("agendado", INSTANTE_AGENDADO);
        modulo.controle.pedidos.length = 0;
        const tela = await montarTela({ postId: ID_DO_CICLO });
        await tela.clicar(tela.acaoPorChave("reagendar"));
        const dataDeAntes = tela.campo("publicado_em")?.value ?? "";

        await tela.digitar(tela.campo("publicado_em"), "2027-05-20T18:00");
        const cancelar = tela.botaoPorTexto(tela.modalDeAgendamento(), "Cancelar");
        await tela.clicar(cancelar);
        afirmar(
          "\"Cancelar\" fecha o modal sem gravar nada: nenhum pedido viaja",
          tela.modalDeAgendamento() === null && modulo.controle.pedidos.length === 0,
          `modal aberto: ${tela.modalDeAgendamento() !== null} | pedidos: ${modulo.controle.pedidos.length}`,
        );

        await tela.clicar(tela.acaoPorChave("reagendar"));
        afirmar(
          "e reabrir o modal mostra a data de ANTES — nunca a que foi digitada e descartada",
          tela.campo("publicado_em")?.value === dataDeAntes &&
            tela.campo("publicado_em")?.value !== "2027-05-20T18:00",
          `esperado ${JSON.stringify(dataDeAntes)}, encontrado ${JSON.stringify(tela.campo("publicado_em")?.value)}`,
        );
        await tela.desmontar();
      }

      /* ── A RECUSA DO SERVIDOR POR `publicado_em` REABRE O MODAL ──────── *
       * Achado da revisão: o mecanismo GENÉRICO de `erro.faltando`,
       * pré-existente para os outros campos, também pode nomear
       * `publicado_em` — e a Gaveta não tem mais campo correspondente para
       * marcar. A tela precisa reabrir o modal com a frase do servidor
       * dentro dele, nunca `setFaltando(["publicado_em"])`. */
      {
        const RECUSA_DO_SERVIDOR_SOBRE_A_DATA =
          "O servidor recusou a data de publicação informada.";
        modulo.controle.post = postNoEstado("rascunho", null);
        modulo.controle.pedidos.length = 0;
        modulo.controle.resposta = {
          ok: false,
          erro: {
            tipo: "dados_invalidos",
            mensagem: RECUSA_DO_SERVIDOR_SOBRE_A_DATA,
            faltando: ["publicado_em"],
          },
        };
        const tela = await montarTela({ postId: ID_DO_CICLO });
        await tela.clicar(tela.acaoPorChave("agendar"));
        await tela.digitar(tela.campo("publicado_em"), "2027-03-01T09:30");
        await tela.clicar(
          tela.modalDeAgendamento().querySelector('[data-papel="confirmar-agendamento"]'),
        );
        afirmar(
          "a recusa do servidor por `publicado_em` REABRE o modal, com a frase dentro dele",
          (() => {
            const modal = tela.modalDeAgendamento();
            if (modal === null) return false;
            const alerta = modal.querySelector('[role="alert"]');
            return (
              alerta !== null &&
              (alerta.textContent ?? "").trim() === RECUSA_DO_SERVIDOR_SOBRE_A_DATA
            );
          })(),
          `modal aberto: ${tela.modalDeAgendamento() !== null} | alerta: ${JSON.stringify(tela.modalDeAgendamento()?.querySelector('[role="alert"]')?.textContent ?? null)}`,
        );
        afirmar(
          "e a Gaveta não marca campo nenhum — `publicado_em` não tem mais controle ali para marcar",
          tela.gaveta()?.querySelector('[data-campo="publicado_em"]') === null,
        );
        await tela.desmontar();
      }

      /* ── A RECUSA POR DATA VENCIDA OFERECE PUBLICAR AGORA ───────────── */
      //
      // É a diferença entre um beco e uma bifurcação. O servidor recusa e NOMEIA
      // a saída pela chave de uma ação; a tela procura essa chave na máquina, no
      // Estado em que o Post está, e transforma em botão o que a máquina
      // declarar — com o rótulo que já está lá.
      {
        const RECUSA_VENCIDA =
          "Esta data já passou: quinta-feira, 1 de janeiro de 2026, às 09:00. " +
          "Escolha um momento futuro para agendar, ou publique agora.";
        modulo.controle.post = postNoEstado("rascunho", null);
        modulo.controle.pedidos.length = 0;
        modulo.controle.resposta = {
          ok: false,
          erro: {
            tipo: "dados_invalidos",
            mensagem: RECUSA_VENCIDA,
            alternativa: transicoes.ACAO_PUBLICAR,
          },
        };
        const tela = await montarTela({ postId: ID_DO_CICLO });
        await tela.clicar(tela.acaoPorChave("agendar"));
        await tela.digitar(tela.campo("publicado_em"), "2026-01-01T09:00");
        const historicoAntes = toast.getHistory().length;
        await tela.clicar(
          tela.modalDeAgendamento().querySelector('[data-papel="confirmar-agendamento"]'),
        );
        const novos = toast.getHistory().slice(historicoAntes);
        const recusa =
          novos.find((t) => String(t.description ?? "") === RECUSA_VENCIDA) ?? null;

        afirmar(
          "a recusa por data vencida chega INTEIRA à tela, com a frase do servidor",
          recusa !== null,
          novos.map((t) => `${t.title} / ${t.description}`).join(" | ").slice(0, 220),
        );
        afirmar(
          "e ela NÃO é do mecanismo de `publicado_em` faltando: o modal já fechou ao confirmar, e continua fechado",
          tela.modalDeAgendamento() === null,
        );
        const doDominio = transicoes.acaoDoEstado("rascunho", transicoes.ACAO_PUBLICAR);
        afirmar(
          "e a recusa OFERECE PUBLICAR AGORA: a saída vira botão, com o rótulo que a máquina declara",
          recusa?.action?.label === doDominio.rotulo,
          `rótulo na notificação: ${JSON.stringify(recusa?.action?.label)} | na máquina: ${JSON.stringify(doDominio.rotulo)}`,
        );
        if (voz && recusa) {
          afirmar(
            "as duas metades da recusa e o rótulo da saída passam pelas guardas de voz",
            voz.diagnosticarMensagem("o que houve", String(recusa.title)) === null &&
              voz.diagnosticarMensagem("o que fazer", String(recusa.description)) === null &&
              voz.diagnosticarRotuloDeAcao(String(recusa.action?.label)) === null,
            `${recusa.title} / ${recusa.description} / ${recusa.action?.label}`,
          );
        }
        /* A RECUSA POR DATA VENCIDA NÃO SUJA `valores.publicado_em` — achado da
           revisão adversarial desta correção (achado 2): `confirmarAgendamento`
           costumava escrever o rascunho em `valores` ANTES de `salvar`
           confirmar qualquer coisa, e uma recusa como esta (que fecha o modal
           sem reabri-lo, ao contrário da recusa por `erro.faltando`) deixava o
           valor REJEITADO preso ali para sempre — sem `salvar` ter tido
           sucesso, e sem "Cancelar" (que só fecha o modal) desfazer isso. Um
           "Salvar" comum, depois, reenviaria a data vencida sem o Autor saber.
           A prova agora é a INVERSA: reabrir mostra o que está GRAVADO (vazio,
           aqui — nada foi salvo), nunca o que foi tentado e recusado. */
        afirmar(
          "e `valores.publicado_em` NÃO fica com a data recusada presa: reabrir o modal mostra vazio, não a tentativa",
          await (async () => {
            await tela.clicar(tela.acaoPorChave("agendar"));
            const vazio = (tela.campo("publicado_em")?.value ?? "") === "";
            await tela.clicar(tela.botaoPorTexto(tela.modalDeAgendamento(), "Cancelar"));
            return vazio && tela.gaveta() !== null;
          })(),
        );

        /* A OFERTA FUNCIONA. Um botão que não faz nada seria pior que nenhum
           botão: a pessoa clicaria e continuaria sem entender por que o Post
           não saiu. */
        modulo.controle.pedidos.length = 0;
        modulo.controle.resposta = {
          ok: true,
          dados: {
            criado: false,
            post: {
              id: ID_DO_CICLO,
              slug: "ciclo-de-vida",
              estado: "publicado",
              publicado_em: new Date(Date.now() - 60_000).toISOString(),
            },
          },
        };
        if (recusa?.action?.onClick) {
          await act(async () => {
            await recusa.action.onClick();
          });
        }
        afirmar(
          "acionar a saída PUBLICA de verdade: o pedido viaja com destino `publicado`",
          modulo.controle.pedidos.length === 1 &&
            modulo.controle.pedidos[0]?.estado === "publicado",
          `pedidos: ${modulo.controle.pedidos.length} | destino: ${JSON.stringify(
            modulo.controle.pedidos[0]?.estado,
          )}`,
        );
        afirmar(
          "e a tela passa a mostrar publicado, sem tirar o Autor do Editor",
          tela.pilula()?.getAttribute("data-estado") === "publicado" &&
            tela.gaveta() !== null,
          `pílula: ${tela.pilula()?.getAttribute("data-estado")}`,
        );
        await tela.desmontar();
      }

      /* ── SAÍDA QUE A MÁQUINA NÃO DECLARA NÃO VIRA BOTÃO ─────────────── */
      //
      // A busca na máquina é a LISTA DE PERMISSÃO da oferta. Sem ela, uma
      // resposta de servidor (ou um intermediário) poderia mandar a tela
      // oferecer um caminho que ela não tem — e o botão levaria a uma segunda
      // recusa, agora sem explicação nenhuma. `publicado` não tem ação
      // `publicar`: de lá só se sai arquivando.
      {
        modulo.controle.post = postNoEstado("publicado", NO_PASSADO);
        modulo.controle.pedidos.length = 0;
        modulo.controle.resposta = {
          ok: false,
          erro: {
            tipo: "dados_invalidos",
            mensagem: "Não deu para gravar este post agora. Confira os campos e salve de novo.",
            alternativa: transicoes.ACAO_PUBLICAR,
          },
        };
        afirmar(
          "a máquina não declara `publicar` para um Post publicado — é o que torna a asserção seguinte possível",
          transicoes.acaoDoEstado("publicado", transicoes.ACAO_PUBLICAR) === null,
        );
        const tela = await montarTela({ postId: ID_DO_CICLO });
        const historicoAntes = toast.getHistory().length;
        await tela.clicar(tela.acaoPorChave("salvar"));
        const novos = toast.getHistory().slice(historicoAntes);
        const recusa = novos[novos.length - 1] ?? null;
        afirmar(
          "uma saída que a máquina não declara para este Estado NÃO vira botão — a oferta é lista de permissão",
          recusa !== null && recusa.action === undefined,
          `ação na notificação: ${JSON.stringify(recusa?.action?.label ?? null)}`,
        );
        await tela.desmontar();
      }

      /* ── SALVAR UM POST PUBLICADO CONTINUA PUBLICADO ────────────────── */
      {
        modulo.controle.post = postNoEstado("publicado", NO_PASSADO);
        modulo.controle.pedidos.length = 0;
        modulo.controle.resposta = {
          ok: true,
          dados: {
            criado: false,
            post: {
              id: ID_DO_CICLO,
              slug: "ciclo-de-vida",
              estado: "publicado",
              publicado_em: NO_PASSADO,
            },
          },
        };
        const tela = await montarTela({ postId: ID_DO_CICLO });
        /* `publicado` não oferece nenhuma ação que exija data (só `salvar` e
           `arquivar`), então a data não tem mais campo nenhum na tela — ela
           saiu da gaveta, e o botão que abriria o modal não existe neste
           Estado. O que se prova aqui é que `salvar` manda a MESMA data que
           já estava gravada, sem que ninguém tenha tocado nela: comparado
           pelo INSTANTE, e não pela string — a volta por `paraCampoDeInstante`
           não existe mais neste caminho, então a comparação é direta entre o
           que veio do banco e o que o pedido levou de volta. */
        await tela.digitar(tela.campo("titulo"), "Ciclo de vida, revisado");
        await tela.clicar(tela.acaoPorChave("salvar"));
        afirmar(
          "salvar um Post publicado pede o MESMO Estado — salvar não é transição",
          modulo.controle.pedidos.length === 1 &&
            modulo.controle.pedidos[0]?.estado === "publicado",
          `estado pedido: ${modulo.controle.pedidos[0]?.estado}`,
        );
        afirmar(
          "e a tela continua publicada, com a data de publicação onde estava — ninguém a editou, e ela nem tem mais campo aqui",
          tela.pilula()?.getAttribute("data-estado") === "publicado" &&
            typeof modulo.controle.pedidos[0]?.publicado_em === "string" &&
            new Date(modulo.controle.pedidos[0].publicado_em).getTime() ===
              new Date(NO_PASSADO).getTime(),
          `pedido: ${modulo.controle.pedidos[0]?.publicado_em} | gravado: ${NO_PASSADO}`,
        );
        await tela.desmontar();
      }
    }

    /* ─── (l) A listagem do Painel (Story 2.10) ───────────────────────── */

    secao("(l) a listagem: a lista que o Autor encontra ao voltar do Editor");

    const estadosDoDominio = await import(urlDe(CAMINHO_ESTADOS)).catch(() => null);
    const regras = modulo.regrasDaListagem ?? null;

    afirmar(
      "`listagem.js` é módulo próprio e chega ao pacote — as regras da linha são executáveis, não JSX lido",
      regras !== null && typeof regras.monogramaDaCategoria === "function",
    );

    /* ── As regras puras, executadas ──────────────────────────────────── */
    if (regras) {
      afirmar(
        "o monograma é a primeira letra da Categoria em caixa alta — e Post SEM Categoria devolve vazio, não explode",
        regras.monogramaDaCategoria({ categoria: { nome: "automação" } }) === "A" &&
          regras.monogramaDaCategoria({ categoria: { nome: "Estratégia" } }) === "E" &&
          regras.monogramaDaCategoria({ categoria: null }) === "" &&
          regras.monogramaDaCategoria({}) === "" &&
          regras.monogramaDaCategoria(null) === "",
        `automação → ${JSON.stringify(regras.monogramaDaCategoria({ categoria: { nome: "automação" } }))}`,
      );
      /* As datas esperadas estão escritas À MÃO: derivá-las do próprio módulo de
         formatação faria a asserção dizer que ele é igual a si mesmo, e é
         justamente a conversão de fuso que se quer observar. 12:00Z é 09:00 em
         São Paulo, e 12:30Z do dia 1º é 09:30 do dia 1º. */
      afirmar(
        "a data da linha é `COALESCE(publicado_em, atualizado_em)` — o mesmo par que ordena a lista",
        regras.textoDaData({
          publicado_em: "2027-03-05T12:00:00.000Z",
          atualizado_em: "2026-01-02T12:00:00.000Z",
        }) === "05/03/2027" &&
          regras.textoDaData({
            publicado_em: null,
            atualizado_em: "2026-01-02T12:00:00.000Z",
          }) === "02/01/2026",
        `com publicado_em: ${regras.textoDaData({ publicado_em: "2027-03-05T12:00:00.000Z", atualizado_em: "2026-01-02T12:00:00.000Z" })}`,
      );
      afirmar(
        "data ilegível vira AUSÊNCIA, não exceção — uma linha corrompida não derruba a listagem inteira",
        regras.textoDaData({ atualizado_em: "isto não é data" }) === "" &&
          regras.textoDaData({}) === "" &&
          regras.textoDoAgendamento({ estado: "agendado", publicado_em: "nada" }) === null &&
          regras.textoDoTempoDeLeitura({ tempo_leitura: "muitos" }) === null,
      );
      afirmar(
        "só Post AGENDADO com data mostra o para-quando, e ele sai no fuso de apresentação",
        regras.textoDoAgendamento({
          estado: "agendado",
          publicado_em: "2027-03-01T12:30:00.000Z",
        }) === "01/03/2027 09:30" &&
          regras.textoDoAgendamento({
            estado: "publicado",
            publicado_em: "2027-03-01T12:30:00.000Z",
          }) === null &&
          regras.textoDoAgendamento({ estado: "agendado", publicado_em: null }) === null,
        `agendado → ${JSON.stringify(regras.textoDoAgendamento({ estado: "agendado", publicado_em: "2027-03-01T12:30:00.000Z" }))}`,
      );
      if (voz) {
        afirmar(
          "o vazio e a falha dizem coisas DIFERENTES, e as quatro frases passam pelas guardas de voz",
          regras.TITULO_DO_VAZIO !== regras.TITULO_DO_ERRO &&
            voz.diagnosticarMensagem("o que aconteceu", regras.TITULO_DO_VAZIO) === null &&
            voz.diagnosticarMensagem("o que houve", regras.TITULO_DO_ERRO) === null &&
            voz.diagnosticarRotuloDeAcao(regras.ROTULO_DO_PRIMEIRO_POST) === null &&
            voz.diagnosticarRotuloDeAcao(regras.ROTULO_DE_RECARREGAR) === null,
          `${regras.TITULO_DO_VAZIO} | ${regras.TITULO_DO_ERRO}`,
        );
        afirmar(
          "o TERCEIRO vazio — o de busca — tem título próprio, distinto dos outros dois, e passa pelas mesmas guardas",
          regras.TITULO_DO_VAZIO_DE_BUSCA !== regras.TITULO_DO_VAZIO &&
            regras.TITULO_DO_VAZIO_DE_BUSCA !== regras.TITULO_DO_ERRO &&
            voz.diagnosticarMensagem(
              "o que aconteceu",
              regras.TITULO_DO_VAZIO_DE_BUSCA,
            ) === null &&
            voz.diagnosticarRotuloDeAcao(regras.ROTULO_DE_LIMPAR_BUSCA) === null,
          `${regras.TITULO_DO_VAZIO_DE_BUSCA} | ${regras.ROTULO_DE_LIMPAR_BUSCA}`,
        );
      }

      /* ── As regras do PEDIDO de busca, executadas (Story 2.11) ─────── */
      afirmar(
        "“há busca em curso?” se responde sobre o que foi PEDIDO — e espaço em branco não é pedido",
        regras.haBuscaAtiva({}) === false &&
          regras.haBuscaAtiva({ termo: "   " }) === false &&
          regras.haBuscaAtiva({ termo: "estrategia" }) === true &&
          regras.haBuscaAtiva({ estados: ["rascunho"] }) === true &&
          regras.haBuscaAtiva({ estados: [] }) === false &&
          regras.haBuscaAtiva({ estados: ["publicada"] }) === false,
        `com estado inventado: ${regras.haBuscaAtiva({ estados: ["publicada"] })}`,
      );
      afirmar(
        "marcar e desmarcar Estado devolve sempre a ORDEM DO CICLO DE VIDA, não a ordem dos cliques",
        igual(regras.alternarEstado([], "publicado"), ["publicado"]) &&
          igual(regras.alternarEstado(["publicado"], "rascunho"), [
            "rascunho",
            "publicado",
          ]) &&
          igual(regras.alternarEstado(["rascunho", "publicado"], "publicado"), [
            "rascunho",
          ]),
        JSON.stringify(regras.alternarEstado(["publicado"], "rascunho")),
      );
      afirmar(
        "e texto solto nunca entra no filtro — o vocabulário é fechado dos dois lados",
        igual(regras.alternarEstado([], "no ar"), []) &&
          igual(regras.alternarEstado(["rascunho", "draft"], "no ar"), ["rascunho"]),
        JSON.stringify(regras.alternarEstado(["rascunho", "draft"], "no ar")),
      );
      /* ── O FILTRO DA LISTAGEM É EXCLUSIVO, não multi-seleção (bugfix da tela
         de Listagem, item 3) ── É `selecionarEstadoExclusivo`, e não
         `alternarEstado`, que os quatro botões de filtro chamam — a tabela
         acima prova o contrato ANTIGO (que continua existindo, para quem mais
         depender dele); esta prova o contrato NOVO, que é o que a tela usa. */
      afirmar(
        "clicar num Estado diferente SUBSTITUI a marcação — nunca soma",
        igual(regras.selecionarEstadoExclusivo([], "publicado"), ["publicado"]) &&
          igual(regras.selecionarEstadoExclusivo(["publicado"], "rascunho"), [
            "rascunho",
          ]),
        JSON.stringify(regras.selecionarEstadoExclusivo(["publicado"], "rascunho")),
      );
      afirmar(
        "clicar de novo no Estado JÁ marcado desmarca — filtro sem Estado nenhum é \"sem filtro\", não \"nada bate\"",
        igual(regras.selecionarEstadoExclusivo(["publicado"], "publicado"), []),
        JSON.stringify(regras.selecionarEstadoExclusivo(["publicado"], "publicado")),
      );
      afirmar(
        "e texto solto também não entra neste filtro — mesmo vocabulário fechado",
        igual(regras.selecionarEstadoExclusivo([], "no ar"), []) &&
          igual(regras.selecionarEstadoExclusivo(["rascunho", "draft"], "draft"), [
            "rascunho",
          ]),
        JSON.stringify(regras.selecionarEstadoExclusivo(["rascunho", "draft"], "draft")),
      );
      if (estadosDoDominio) {
        afirmar(
          "as palavras do filtro saem do VOCABULÁRIO, na ordem do ciclo de vida, com “ou” antes da última",
          regras.palavrasDosEstados(["publicado", "rascunho"]) ===
            `${estadosDoDominio.rotuloDoEstado("rascunho")} ou ${estadosDoDominio.rotuloDoEstado("publicado")}` &&
            regras.palavrasDosEstados([]) === "" &&
            regras.palavrasDosEstados(["arquivado"]) ===
              estadosDoDominio.rotuloDoEstado("arquivado"),
          regras.palavrasDosEstados(["publicado", "rascunho"]),
        );
      }
      afirmar(
        "a frase do vazio de busca NOMEIA o que não foi encontrado — termo e Estados, e não um “nada encontrado” genérico",
        regras
          .descricaoDoVazioDeBusca({ termo: "automação" })
          .includes("automação") &&
          regras
            .descricaoDoVazioDeBusca({ termo: "automação", estados: ["rascunho"] })
            .includes("automação") &&
          regras.descricaoDoVazioDeBusca({ termo: "automação" }) !==
            regras.descricaoDoVazioDeBusca({
              termo: "automação",
              estados: ["rascunho"],
            }) &&
          regras.descricaoDoVazioDeBusca({ estados: ["rascunho"] }) !==
            regras.descricaoDoVazioDeBusca({ termo: "automação" }),
        regras.descricaoDoVazioDeBusca({ termo: "automação", estados: ["rascunho"] }),
      );
    }

    /** Monta `ListaDePosts` e devolve as ferramentas para mexer nela. */
    const montarLista = async (props) => {
      const alvo = janela.document.createElement("div");
      janela.document.body.appendChild(alvo);

      const reclamacoes = [];
      const erroOriginal = console.error;
      console.error = (...partes) => reclamacoes.push(partes.join(" "));

      const raizReact = createRoot(alvo);
      await act(async () => {
        raizReact.render(React.createElement(modulo.ListaDePosts, props));
      });

      const regiao = () => alvo.querySelector("[data-estado-da-lista]");
      return {
        alvo,
        reclamacoes,
        regiao,
        situacao: () => regiao()?.getAttribute("data-estado-da-lista") ?? null,
        linhas: () => [...alvo.querySelectorAll("[data-post]")],
        linha: (id) => alvo.querySelector(`[data-post="${id}"]`),
        esqueletos: () => [...alvo.querySelectorAll('[data-slot="skeleton"]')],
        botaoPorTexto: (texto) =>
          [...alvo.querySelectorAll("button")].find(
            (b) => (b.textContent ?? "").trim() === texto,
          ) ?? null,
        async clicar(elemento) {
          await act(async () => {
            elemento.dispatchEvent(new janela.MouseEvent("click", { bubbles: true }));
          });
        },
        async reRenderizar(novasProps) {
          await act(async () => {
            raizReact.render(React.createElement(modulo.ListaDePosts, novasProps));
          });
        },
        async desmontar() {
          console.error = erroOriginal;
          await act(async () => raizReact.unmount());
          alvo.remove();
        },
      };
    };

    /* Quatro Posts, um por Estado, com o par de datas escolhido para que a
       ORDEM esperada não coincida com a ordem de entrada nem com a ordem por
       `publicado_em` sozinha — senão a asserção de ordenação passaria por
       acidente. As chaves de ordenação são, por `COALESCE`:
         C = 10/03/2027 (rascunho, só `atualizado_em`)
         A = 05/03/2027 (publicado)
         B = 01/03/2027 (agendado)
         D = 01/12/2026 (arquivado, só `atualizado_em`)
       O rascunho fica em cima e o arquivado embaixo por MÉRITO de data — que é
       o ponto da regra: rascunho não afunda nem domina. */
    const ID_A = "aaaaaaaa-1111-4111-8111-111111111111";
    const ID_B = "bbbbbbbb-2222-4222-8222-222222222222";
    const ID_C = "cccccccc-3333-4333-8333-333333333333";
    const ID_D = "dddddddd-4444-4444-8444-444444444444";
    const ORDEM_ESPERADA = [ID_C, ID_A, ID_B, ID_D];

    const POSTS_DE_PROVA = [
      {
        id: ID_D,
        slug: "nota-antiga",
        titulo: "Nota antiga",
        autor_nome: "Bruno Lima",
        categoria: { id: "cat-2", nome: "Novidades", slug: "novidades" },
        imagem_url: null,
        destaque: false,
        tempo_leitura: 0,
        estado: "arquivado",
        publicado_em: null,
        atualizado_em: "2026-12-01T12:00:00.000Z",
      },
      {
        id: ID_B,
        slug: "o-que-vem-por-ai",
        titulo: "O que vem por aí",
        autor_nome: "Ana Ribeiro",
        categoria: { id: "cat-3", nome: "Estratégia", slug: "estrategia" },
        imagem_url: null,
        destaque: false,
        tempo_leitura: 4,
        estado: "agendado",
        publicado_em: "2027-03-01T12:30:00.000Z",
        atualizado_em: "2027-02-01T12:00:00.000Z",
      },
      {
        id: ID_C,
        /* SEM ENDEREÇO, de propósito: é o rascunho que a Story 2.12 recusava
           com um motivo próprio ("ainda não tem endereço") e que a 2.13 abre
           assim mesmo, porque a prévia é por identificador. */
        slug: "",
        titulo: "Rascunho sem categoria",
        autor_nome: "Ana Ribeiro",
        categoria: null,
        imagem_url: null,
        destaque: false,
        tempo_leitura: 0,
        estado: "rascunho",
        publicado_em: null,
        atualizado_em: "2027-03-10T12:00:00.000Z",
      },
      {
        id: ID_A,
        slug: "guia-de-atalhos",
        titulo: "Guia de atalhos",
        autor_nome: "Ana Ribeiro",
        categoria: { id: "cat-1", nome: "Automação", slug: "automacao" },
        imagem_url: "https://exemplo.local/capa.jpg",
        imagem_alt: "Um teclado sobre a mesa",
        destaque: true,
        tempo_leitura: 7,
        estado: "publicado",
        publicado_em: "2027-03-05T12:00:00.000Z",
        atualizado_em: "2027-01-01T12:00:00.000Z",
      },
    ];

    /* ── O ESQUELETO, e não a tela em branco ──────────────────────────── */
    if (regras) {
      let liberar = null;
      modulo.controle.listagens = 0;
      modulo.controle.aoListar = () =>
        new Promise((resolver) => {
          liberar = resolver;
        });

      const contagens = [];
      const abertos = [];
      const tela = await montarLista({
        aoContar: (n) => contagens.push(n),
        aoAbrirPost: (post) => abertos.push(post?.id ?? null),
      });

      afirmar(
        "enquanto os dados vêm, a listagem mostra ESQUELETO — nunca tela em branco",
        tela.situacao() === "carregando" && tela.esqueletos().length > 0,
        `situação: ${tela.situacao()} | esqueletos: ${tela.esqueletos().length}`,
      );
      afirmar(
        "e o esqueleto é do sistema, escondido de quem ouve a tela, com o carregamento anunciado UMA vez",
        tela.alvo.querySelector('[role="status"]') !== null &&
          tela.esqueletos().every((e) => e.closest('[aria-hidden="true"]') !== null),
        `status: ${tela.alvo.querySelector('[role="status"]')?.textContent}`,
      );

      await act(async () => {
        liberar({ ok: true, dados: POSTS_DE_PROVA });
      });
      modulo.controle.aoListar = null;

      afirmar(
        "chegando os dados, o esqueleto sai e as linhas entram",
        tela.situacao() === "lista" &&
          tela.esqueletos().length === 0 &&
          tela.linhas().length === POSTS_DE_PROVA.length,
        `situação: ${tela.situacao()} | linhas: ${tela.linhas().length}`,
      );

      /* ── A ORDEM VEM DA CAMADA ─────────────────────────────────────── */
      afirmar(
        "a ordem é `COALESCE(publicado_em, atualizado_em)` decrescente — e a entrada estava embaralhada",
        igual(
          tela.linhas().map((l) => l.getAttribute("data-post")),
          ORDEM_ESPERADA,
        ),
        `na tela: ${tela.linhas().map((l) => l.getAttribute("data-post")?.slice(0, 4)).join(", ")} | esperado: ${ORDEM_ESPERADA.map((i) => i.slice(0, 4)).join(", ")}`,
      );
      afirmar(
        "e a listagem NÃO reescreve a comparação: a entrada não estava ordenada, e a ordem da tela difere dela",
        !igual(
          POSTS_DE_PROVA.map((p) => p.id),
          ORDEM_ESPERADA,
        ),
      );

      /* ── A LINHA: todos os campos do critério ──────────────────────── */
      {
        const linha = tela.linha(ID_A);
        const texto = (papel) =>
          (linha?.querySelector(`[data-papel="${papel}"]`)?.textContent ?? "").trim();
        afirmar(
          "a linha traz capa, título, Categoria, Autor e data — os campos que o critério nomeia",
          linha !== null &&
            linha.querySelector('[data-papel="capa"]')?.getAttribute("src") ===
              "https://exemplo.local/capa.jpg" &&
            (linha.textContent ?? "").includes("Guia de atalhos") &&
            texto("categoria") === "Automação" &&
            texto("autor") === "Ana Ribeiro" &&
            texto("data") === "05/03/2027",
          `categoria: ${texto("categoria")} | autor: ${texto("autor")} | data: ${texto("data")}`,
        );
        afirmar(
          "data e contagem são DADO: pilha monoespaçada e numeral tabular, pela classe `.dado`",
          (linha?.querySelector('[data-papel="data"]')?.className ?? "")
            .split(/\s+/u)
            .includes("dado") &&
            (linha?.querySelector('[data-papel="tempo-de-leitura"]')?.className ?? "")
              .split(/\s+/u)
              .includes("dado") &&
            texto("tempo-de-leitura") === "7 min",
          `tempo: ${texto("tempo-de-leitura")}`,
        );
        afirmar(
          "o Destaque aparece na linha, com PALAVRA e não só com a estrela",
          linha?.querySelector('[data-destaque="true"]') !== null &&
            (linha?.querySelector('[data-destaque="true"]')?.textContent ?? "")
              .trim()
              .toLowerCase() === "destaque" &&
            tela.linha(ID_B)?.querySelector('[data-destaque="true"]') === null,
          `na linha do destaque: ${linha?.querySelector('[data-destaque="true"]')?.textContent}`,
        );
        afirmar(
          "e a linha leva ao Editor: um controle, que NOMEIA o post em vez de dizer só “Editar”",
          linha?.querySelector(`[data-abrir="${ID_A}"]`) !== null &&
            (linha
              ?.querySelector(`[data-abrir="${ID_A}"]`)
              ?.getAttribute("aria-label") ?? "").includes("Guia de atalhos"),
          String(linha?.querySelector(`[data-abrir="${ID_A}"]`)?.getAttribute("aria-label")),
        );
        if (linha?.querySelector(`[data-abrir="${ID_A}"]`)) {
          await tela.clicar(linha.querySelector(`[data-abrir="${ID_A}"]`));
          afirmar(
            "e clicar nele abre EXATAMENTE aquele Post",
            igual(abertos, [ID_A]),
            `abertos: ${abertos.join(", ")}`,
          );
        }
      }

      /* ── SEM CAPA: monograma da Categoria; sem Categoria, a linha vive ── */
      afirmar(
        "Post sem capa mostra o MONOGRAMA da Categoria no lugar dela",
        tela
          .linha(ID_B)
          ?.querySelector('[data-papel="monograma"]')
          ?.getAttribute("data-monograma") === "E" &&
          tela.linha(ID_B)?.querySelector('[data-papel="capa"]') === null,
        `monograma: ${tela.linha(ID_B)?.querySelector('[data-papel="monograma"]')?.getAttribute("data-monograma")}`,
      );
      afirmar(
        "e Post SEM Categoria também renderiza — a linha aparece inteira, com símbolo neutro no lugar da letra",
        tela.linha(ID_C) !== null &&
          (tela.linha(ID_C)?.textContent ?? "").includes("Rascunho sem categoria") &&
          tela
            .linha(ID_C)
            ?.querySelector('[data-papel="monograma"]')
            ?.getAttribute("data-monograma") === "" &&
          tela.linha(ID_C)?.querySelector('[data-papel="categoria"]') === null,
      );

      /* ── A CAPA QUE NÃO CARREGA DEGRADA AQUI TAMBÉM (Story 3.2) ───────
         Enquanto toda capa vinha do nosso bucket, um endereço gravado
         resolvia. Desde que ela pode apontar para outro domínio, o endereço
         apodrece — e sem `onError` esta linha desenharia o ícone quebrado do
         navegador numa caixa de 64px enquanto o Editor mostra o monograma para
         o MESMO Post: as duas respostas para a mesma pergunta que a degradação
         existe para não ter.

         E o que se compara é o MONOGRAMA que a função pura devolve, não uma
         letra escrita à mão — que passaria mesmo se as duas telas divergissem. */
      {
        const imagem = tela.linha(ID_A)?.querySelector('[data-papel="capa"]');
        await act(async () => {
          imagem.dispatchEvent(new janela.Event("error", { bubbles: false }));
        });
        const caixa = tela.linha(ID_A)?.querySelector('[data-papel="monograma"]');
        const esperado = modulo.regrasDaListagem.monogramaDaCategoria(
          POSTS_DE_PROVA.find((post) => post.id === ID_A),
        );
        afirmar(
          "capa que não carrega na LISTAGEM degrada para o monograma da Categoria — e não para o ícone quebrado do navegador",
          tela.linha(ID_A)?.querySelector('[data-papel="capa"]') === null &&
            caixa !== null &&
            esperado !== "" &&
            caixa.getAttribute("data-monograma") === esperado &&
            caixa.getAttribute("data-recurso") === "letra",
          `monograma: ${JSON.stringify(caixa?.getAttribute("data-monograma"))} | esperado: ${JSON.stringify(esperado)}`,
        );
        /* E A CAIXA DA LINHA CONTINUA DECORATIVA: aqui o texto em volta já diz
           título e Categoria, e anunciar a letra de novo seria repetição. É a
           diferença deliberada em relação à gaveta, onde não há texto em volta. */
        afirmar(
          "e na linha ela continua decorativa — o texto ao lado já diz o que ela representaria",
          caixa?.getAttribute("aria-hidden") === "true" &&
            caixa?.getAttribute("role") === null,
          `aria-hidden: ${caixa?.getAttribute("aria-hidden")} | role: ${caixa?.getAttribute("role")}`,
        );
      }

      /* ── O ESTADO: PONTO **E** PALAVRA, nos quatro ─────────────────── */
      if (estadosDoDominio) {
        const semPalavra = [];
        const semPonto = [];
        for (const post of POSTS_DE_PROVA) {
          const pilula = tela.linha(post.id)?.querySelector("[data-estado]") ?? null;
          if (
            pilula?.getAttribute("data-estado") !== post.estado ||
            (pilula?.textContent ?? "").trim() !==
              estadosDoDominio.rotuloDoEstado(post.estado)
          ) {
            semPalavra.push(`${post.estado}: ${JSON.stringify(pilula?.textContent ?? null)}`);
          }
          // O ponto é elemento próprio, decorativo, com cor de fundo aplicada
          // por estilo — é ele que faz a pílula não ser só texto.
          const ponto = pilula?.querySelector('[aria-hidden="true"]') ?? null;
          if (ponto === null || (ponto.style?.backgroundColor ?? "") === "") {
            semPonto.push(post.estado);
          }
        }
        afirmar(
          "cada linha traz a pílula do Estado com a PALAVRA por extenso do vocabulário fechado",
          semPalavra.length === 0,
          semPalavra.join(" | "),
        );
        afirmar(
          "e com o PONTO colorido ao lado — cor nunca é o único portador, e palavra nunca é o único portador",
          semPonto.length === 0,
          semPonto.join(", "),
        );
      }

      /* ── AGENDADO: a data futura, à vista ──────────────────────────── */
      afirmar(
        "o Post agendado mostra a DATA FUTURA junto do rótulo — “Agendado” sozinho responde metade da pergunta",
        (
          tela.linha(ID_B)?.querySelector('[data-papel="agendado-para"]')?.textContent ?? ""
        ).trim() === "01/03/2027 09:30",
        `veio: ${tela.linha(ID_B)?.querySelector('[data-papel="agendado-para"]')?.textContent}`,
      );
      afirmar(
        "e só ele: publicado, rascunho e arquivado não ganham data futura nenhuma",
        [ID_A, ID_C, ID_D].every(
          (id) => tela.linha(id)?.querySelector('[data-papel="agendado-para"]') === null,
        ),
      );

      /* ── A contagem que a aba mostra sai daqui ─────────────────────── */
      afirmar(
        "a listagem informa quantos Posts há — é essa contagem que a aba Blog exibe",
        contagens[contagens.length - 1] === POSTS_DE_PROVA.length,
        `contagens: ${JSON.stringify(contagens)}`,
      );

      /* ── SALVAR NO EDITOR FAZ A LISTA RELER ────────────────────────── */
      const idasAntes = modulo.controle.listagens;
      await tela.reRenderizar({
        recarregarEm: 1,
        aoContar: (n) => contagens.push(n),
        aoAbrirPost: (post) => abertos.push(post?.id ?? null),
      });
      afirmar(
        "salvar no Editor faz a listagem RELER pela camada — é a costura que faltava",
        modulo.controle.listagens === idasAntes + 1,
        `idas antes: ${idasAntes} | depois: ${modulo.controle.listagens}`,
      );

      afirmar(
        "o React não reclamou ao montar a listagem",
        tela.reclamacoes.length === 0,
        tela.reclamacoes.slice(0, 2).join(" | ").slice(0, 300),
      );
      await tela.desmontar();
    }

    /* ── TROCAR SÓ O FILTRO DE ESTADO NÃO MOSTRA ESQUELETO (bugfix item 2) ──
       Trocar de filtro é um clique comum, e reencapar a lista inteira em
       esqueleto a cada troca pisca a tela e faz o Autor perder o lugar onde
       estava. A regra: com posts já na tela e sem erro, uma troca só de
       Estado mantém as linhas ANTIGAS visíveis enquanto a nova página
       chega — o esqueleto continua reservado para a carga inicial. */
    if (regras) {
      modulo.controle.listagens = 0;
      modulo.controle.aoListar = null;
      modulo.controle.listagem = { ok: true, dados: POSTS_DE_PROVA };
      const tela = await montarLista({ estados: [] });

      afirmar(
        "a carga inicial chega com as linhas, sem esqueleto pendente",
        tela.situacao() === "lista" && tela.linhas().length === POSTS_DE_PROVA.length,
        `situação: ${tela.situacao()} | linhas: ${tela.linhas().length}`,
      );

      let liberar = null;
      modulo.controle.aoListar = () =>
        new Promise((resolver) => {
          liberar = resolver;
        });
      await tela.reRenderizar({ estados: ["publicado"] });

      afirmar(
        "trocar só o filtro de Estado NÃO mostra esqueleto — a lista anterior fica na tela enquanto a nova página chega",
        tela.situacao() === "lista" &&
          tela.esqueletos().length === 0 &&
          tela.linhas().length === POSTS_DE_PROVA.length,
        `situação: ${tela.situacao()} | esqueletos: ${tela.esqueletos().length} | linhas: ${tela.linhas().length}`,
      );

      await act(async () => {
        liberar({ ok: true, dados: [POSTS_DE_PROVA.find((p) => p.id === ID_A)] });
      });
      modulo.controle.aoListar = null;

      afirmar(
        "e quando a resposta do novo filtro chega, a lista é SUBSTITUÍDA pela página nova — não somada à antiga",
        tela.situacao() === "lista" && tela.linhas().length === 1 && tela.linha(ID_A) !== null,
        `linhas: ${tela.linhas().length}`,
      );

      afirmar(
        "o React não reclamou na troca de filtro sem esqueleto",
        tela.reclamacoes.length === 0,
        tela.reclamacoes.slice(0, 2).join(" | ").slice(0, 300),
      );
      await tela.desmontar();
    }

    /* ── FALHA DE LEITURA ≠ VAZIO ─────────────────────────────────────── */
    if (regras) {
      const MENSAGEM =
        "Esta leitura exige uma sessão válida. Entre no Painel e tente de novo.";
      modulo.controle.aoListar = null;
      modulo.controle.listagens = 0;
      modulo.controle.listagem = {
        ok: false,
        erro: { tipo: "permissao", mensagem: MENSAGEM },
      };
      const tela = await montarLista({});

      afirmar(
        "falha de leitura mostra ERRO, e não o vazio inicial",
        tela.situacao() === "erro" &&
          tela.alvo.querySelector('[data-estado-da-lista="vazio"]') === null,
        `situação: ${tela.situacao()}`,
      );
      afirmar(
        "sessão expirada é erro de PERMISSÃO na tela, com a frase do erro tipado inteira — e não uma lista vazia",
        (tela.regiao()?.textContent ?? "").includes(MENSAGEM) &&
          tela.regiao()?.getAttribute("role") === "alert" &&
          !(tela.regiao()?.textContent ?? "").includes(regras.TITULO_DO_VAZIO),
        (tela.regiao()?.textContent ?? "").slice(0, 160),
      );

      const botao = tela.botaoPorTexto(regras.ROTULO_DE_RECARREGAR);
      afirmar("a falha oferece TENTAR DE NOVO — o Autor não fica sem saída", botao !== null);
      if (botao) {
        modulo.controle.listagem = { ok: true, dados: POSTS_DE_PROVA };
        await tela.clicar(botao);
        afirmar(
          "e tentar de novo RELÊ de verdade: a camada é consultada outra vez e as linhas aparecem",
          modulo.controle.listagens === 2 &&
            tela.situacao() === "lista" &&
            tela.linhas().length === POSTS_DE_PROVA.length,
          `idas à camada: ${modulo.controle.listagens} | situação: ${tela.situacao()}`,
        );
      }
      await tela.desmontar();
    }

    /* ── O VAZIO INICIAL LEVA AO PRIMEIRO POST ────────────────────────── */
    if (regras) {
      const criados = [];
      modulo.controle.aoListar = null;
      modulo.controle.listagem = { ok: true, dados: [] };
      const tela = await montarLista({ aoCriarPost: () => criados.push(1) });

      afirmar(
        "Painel sem nenhum Post mostra o VAZIO INICIAL — que não é alerta, porque não houve falha",
        tela.situacao() === "vazio" && tela.alvo.querySelector('[role="alert"]') === null,
        `situação: ${tela.situacao()}`,
      );
      afirmar(
        "o vazio diz o que fazer, e diz coisa DIFERENTE da falha de leitura",
        (tela.regiao()?.textContent ?? "").includes(regras.TITULO_DO_VAZIO) &&
          !(tela.regiao()?.textContent ?? "").includes(regras.TITULO_DO_ERRO),
        (tela.regiao()?.textContent ?? "").slice(0, 160),
      );

      const botao = tela.botaoPorTexto(regras.ROTULO_DO_PRIMEIRO_POST);
      afirmar("e oferece o caminho para o primeiro Post", botao !== null);
      if (botao) {
        await tela.clicar(botao);
        afirmar(
          "que ABRE o Editor de verdade — um convite que não leva a lugar nenhum é pior que nenhum convite",
          criados.length === 1,
          `aberturas: ${criados.length}`,
        );
      }
      afirmar(
        "o React não reclamou nas telas sem linha",
        tela.reclamacoes.length === 0,
        tela.reclamacoes.slice(0, 2).join(" | ").slice(0, 300),
      );
      await tela.desmontar();
    }

    /* ── O VAZIO DE BUSCA: o terceiro, e o único com desfazer ─────────── */
    if (regras) {
      const limpezas = [];
      modulo.controle.aoListar = null;
      modulo.controle.listagens = 0;
      modulo.controle.pedidos_da_listagem = [];
      modulo.controle.listagem = { ok: true, dados: [] };
      const tela = await montarLista({
        termo: "automação",
        estados: ["rascunho", "agendado"],
        aoLimparBusca: () => limpezas.push(1),
        aoCriarPost: () => limpezas.push("criar"),
      });

      afirmar(
        "sem correspondência, a tela é o VAZIO DE BUSCA — e não o vazio inicial nem um alerta de falha",
        tela.situacao() === "vazio-de-busca" &&
          tela.alvo.querySelector('[data-estado-da-lista="vazio"]') === null &&
          tela.alvo.querySelector('[role="alert"]') === null,
        `situação: ${tela.situacao()}`,
      );
      afirmar(
        "ele diz o que NÃO foi encontrado — o termo à vista — e não convida a escrever o primeiro post",
        (tela.regiao()?.textContent ?? "").includes(regras.TITULO_DO_VAZIO_DE_BUSCA) &&
          (tela.regiao()?.textContent ?? "").includes("automação") &&
          !(tela.regiao()?.textContent ?? "").includes(regras.TITULO_DO_VAZIO) &&
          !(tela.regiao()?.textContent ?? "").includes(regras.ROTULO_DO_PRIMEIRO_POST),
        (tela.regiao()?.textContent ?? "").slice(0, 200),
      );
      afirmar(
        "o termo e os Estados chegam à CAMADA — a tela pede o recorte, não filtra o que já tem",
        modulo.controle.pedidos_da_listagem.length === 1 &&
          modulo.controle.pedidos_da_listagem[0]?.termo === "automação" &&
          igual(modulo.controle.pedidos_da_listagem[0]?.estados, [
            "rascunho",
            "agendado",
          ]),
        JSON.stringify(modulo.controle.pedidos_da_listagem),
      );

      const botao = tela.botaoPorTexto(regras.ROTULO_DE_LIMPAR_BUSCA);
      afirmar(
        "e é o único dos três vazios com desfazer: ele oferece limpar a busca",
        botao !== null,
      );
      if (botao) {
        await tela.clicar(botao);
        afirmar(
          "que LIMPA de verdade — o convite sem destino é pior que nenhum convite",
          igual(limpezas, [1]),
          `chamadas: ${JSON.stringify(limpezas)}`,
        );
      }
      await tela.desmontar();
    }

    /* ── DIGITAÇÃO É RAJADA: uma consulta, não uma por tecla ──────────── */
    if (regras) {
      const espera = modulo.ESPERA_DA_BUSCA_MS;
      afirmar(
        "a listagem declara a espera da digitação, e a ferramenta usa o número DELA",
        Number.isFinite(espera) && espera > 0,
        `espera: ${JSON.stringify(espera)}`,
      );

      /** Deixa o relógio de verdade correr, dentro do `act`. */
      const respirar = async (ms) => {
        await act(async () => {
          await new Promise((resolver) => setTimeout(resolver, ms));
        });
      };

      modulo.controle.aoListar = null;
      modulo.controle.listagem = { ok: true, dados: POSTS_DE_PROVA };
      const tela = await montarLista({ termo: "" });
      modulo.controle.listagens = 0;
      modulo.controle.pedidos_da_listagem = [];

      // Onze teclas de "atendimento", em rajada — que é como se digita.
      const PALAVRA = "atendimento";
      for (let i = 1; i <= PALAVRA.length; i += 1) {
        await tela.reRenderizar({ termo: PALAVRA.slice(0, i) });
      }
      afirmar(
        `as ${PALAVRA.length} teclas em rajada NÃO produziram consulta nenhuma ainda`,
        modulo.controle.listagens === 0,
        `idas à camada: ${modulo.controle.listagens}`,
      );

      await respirar(espera * 3);
      afirmar(
        "parada a digitação, sai UMA consulta — e com a palavra inteira, não com um prefixo",
        modulo.controle.listagens === 1 &&
          modulo.controle.pedidos_da_listagem[0]?.termo === PALAVRA,
        `idas: ${modulo.controle.listagens} | pedidos: ${JSON.stringify(modulo.controle.pedidos_da_listagem)}`,
      );
      await tela.desmontar();
    }

    /* ── RESPOSTA ATRASADA NÃO SOBRESCREVE A MAIS NOVA ────────────────── */
    //
    // O defeito clássico da busca enquanto se digita, e ele aparece como
    // resultado de um termo que já não está no campo. Aqui as duas respostas
    // são seguradas e devolvidas FORA DE ORDEM: a nova primeiro, a velha
    // depois. Sem a guarda, a velha ganharia por chegar por último.
    if (regras) {
      const espera = modulo.ESPERA_DA_BUSCA_MS;
      const respirar = async (ms) => {
        await act(async () => {
          await new Promise((resolver) => setTimeout(resolver, ms));
        });
      };

      const seguradas = new Map();
      modulo.controle.listagens = 0;
      modulo.controle.pedidos_da_listagem = [];
      modulo.controle.aoListar = (pedido) =>
        new Promise((resolver) =>
          seguradas.set(String(pedido?.termo ?? ""), resolver),
        );

      const tela = await montarLista({ termo: "velho" });
      await tela.reRenderizar({ termo: "novo" });
      await respirar(espera * 3);

      const temAsDuas = afirmar(
        "as duas consultas estão em voo ao mesmo tempo — é a situação que produz o defeito",
        seguradas.has("velho") && seguradas.has("novo"),
        `em voo: ${[...seguradas.keys()].join(", ")}`,
      );

      if (temAsDuas) {
        // A NOVA responde primeiro…
        await act(async () => {
          seguradas.get("novo")({ ok: true, dados: [POSTS_DE_PROVA[3]] });
        });
        // …e a VELHA chega atrasada, com quatro linhas.
        await act(async () => {
          seguradas.get("velho")({ ok: true, dados: POSTS_DE_PROVA });
        });

        afirmar(
          "a resposta ATRASADA é descartada: a tela continua mostrando o resultado do termo atual",
          tela.linhas().length === 1 &&
            tela.linhas()[0]?.getAttribute("data-post") === POSTS_DE_PROVA[3].id,
          `linhas: ${tela.linhas().length} | ${tela.linhas().map((l) => l.getAttribute("data-post")?.slice(0, 4)).join(", ")}`,
        );
      }
      modulo.controle.aoListar = null;
      await tela.desmontar();
    }

    /* ── A LISTAGEM NÃO TOCA ARMAZENAMENTO DO NAVEGADOR ───────────────── */
    {
      const codigo = mascararComentariosJs(ler(CAMINHO_LISTA));
      const puro = mascararComentariosJs(ler(CAMINHO_MODULO_DA_LISTAGEM));
      const TERMOS = ["localStorage", "sessionStorage", "blogStore", "document.cookie"];
      const achados = TERMOS.filter(
        (termo) => codigo.includes(termo) || puro.includes(termo),
      );
      afirmar(
        "a listagem nova não conhece `blogStore` nem armazenamento do navegador — a origem é uma só",
        achados.length === 0,
        achados.join(", "),
      );
    }

    /* ─── (m) As ações por linha (Story 2.12) ─────────────────────────── */

    secao("(m) as ações por linha: alvos permanentes, e a exclusão que nomeia");

    const acoes = modulo.regrasDasAcoes ?? null;

    afirmar(
      "`acoes.js` é módulo próprio e chega ao pacote — as frases das ações são executáveis, não JSX lido",
      acoes !== null && typeof acoes.destinoDeVer === "function",
    );

    /* ─── NENHUM BLOCO DESTA SEÇÃO PASSA POR VACUIDADE ────────────────────
       Os blocos abaixo são guardados por `if (acoes && …)`. Sem esta linha, um
       módulo que não carregasse faria dezenas de asserções da Story 2.12
       simplesmente não rodarem, com a suíte verde — que é a forma mais
       silenciosa de uma verificação deixar de verificar. */
    afirmar(
      "e os quatro módulos de que esta seção depende carregaram — sem eles, as asserções abaixo não rodariam e ninguém saberia",
      acoes !== null &&
        regras !== null &&
        estadosDoDominio !== null &&
        voz !== null &&
        foco !== null,
      `acoes: ${acoes !== null} | listagem: ${regras !== null} | estados: ${estadosDoDominio !== null} | voz: ${voz !== null} | foco: ${foco !== null}`,
    );

    /* ── As regras puras, EXECUTADAS ──────────────────────────────────── */
    if (acoes && estadosDoDominio) {
      /* Os identificadores são `uuid` de verdade porque o endereço da prévia é
         montado a partir deles, com a MESMA conferência de formato da camada de
         dados. Um "x" no lugar faria a prévia parecer indisponível e a asserção
         provaria o contrário do que a Story 2.13 entrega. */
      const PUBLICADO = { id: "aaaaaaaa-1111-4111-8111-111111111111", titulo: "Guia de atalhos", slug: "guia-de-atalhos", estado: "publicado", destaque: true };
      const RASCUNHO = { id: "cccccccc-3333-4333-8333-333333333333", titulo: "Rascunho sem categoria", slug: "rascunho-sem-categoria", estado: "rascunho", destaque: false };
      const SEM_ENDERECO = { id: "eeeeeeee-5555-4555-8555-555555555555", titulo: "Post sem endereço", slug: "   ", estado: "publicado" };
      /* OS DOIS casos que sobraram sem destino depois da Story 2.13. Eles são
         diferentes, e por isso são dois: o Post que ainda não foi gravado (a
         saída é salvar) e o Post cujo identificador está corrompido (mandar
         salvar seria mandar refazer um trabalho já feito, por um defeito que
         não é de quem está olhando). */
      const SEM_IDENTIFICADOR = { id: null, titulo: "Post que nunca foi salvo", slug: "", estado: "rascunho" };
      const IDENTIFICADOR_CORROMPIDO = { id: "nao-e-uuid", titulo: "Post com id estragado", slug: "", estado: "rascunho" };

      afirmar(
        "Post sem título vira “post sem título” nas frases — uma confirmação que diz “Excluir “”?” é pior que nenhuma",
        acoes.tituloParaFrase({ titulo: "   " }) === "post sem título" &&
          acoes.tituloParaFrase({}) === "post sem título" &&
          acoes.tituloParaFrase(null) === "post sem título" &&
          acoes.tituloParaFrase({ titulo: "  Um título  " }) === "Um título",
        JSON.stringify(acoes.tituloParaFrase({})),
      );

      afirmar(
        "o endereço público é montado UMA vez, e Post sem endereço não produz link nenhum",
        acoes.enderecoPublico(PUBLICADO) === "/blog/guia-de-atalhos" &&
          acoes.enderecoPublico(SEM_ENDERECO) === "" &&
          acoes.enderecoPublico({}) === "" &&
          acoes.enderecoPublico(null) === "",
        acoes.enderecoPublico(PUBLICADO),
      );

      afirmar(
        "só Post PUBLICADO com endereço abre no site — rascunho, agendado e arquivado não",
        acoes.podeVerNoSite(PUBLICADO) === true &&
          acoes.podeVerNoSite(SEM_ENDERECO) === false &&
          ["rascunho", "agendado", "arquivado"].every(
            (estado) => acoes.podeVerNoSite({ ...PUBLICADO, estado }) === false,
          ),
      );

      /* ─── A AÇÃO DE VER TEM DESTINO PARA OS DOIS LADOS (Story 2.13) ────
         Antes desta story, Post não publicado caía num beco: a ação existia,
         ficava indisponível e explicava. Agora ela LEVA — e o vocabulário é um
         só, consultado pela linha e pelo Editor. */
      afirmar(
        "Post publicado vai para o SITE; rascunho, agendado e arquivado vão para a PRÉVIA — e a prévia é sob o Painel",
        acoes.destinoDeVer(PUBLICADO)?.tipo === acoes.DESTINO_SITE &&
          acoes.destinoDeVer(PUBLICADO)?.endereco === "/blog/guia-de-atalhos" &&
          ["rascunho", "agendado", "arquivado"].every((estado) => {
            const destino = acoes.destinoDeVer({ ...PUBLICADO, estado });
            return (
              destino?.tipo === acoes.DESTINO_PREVIA &&
              destino.endereco === `/admin/previa/${PUBLICADO.id}` &&
              destino.endereco.startsWith("/admin/")
            );
          }),
        JSON.stringify(acoes.destinoDeVer(RASCUNHO)),
      );
      afirmar(
        "e NÃO TER ENDEREÇO deixou de ser recusa: a prévia abre por identificador, que é o que o rascunho sempre tem",
        acoes.enderecoPublico(SEM_ENDERECO) === "" &&
          acoes.destinoDeVer(SEM_ENDERECO)?.tipo === acoes.DESTINO_PREVIA &&
          acoes.destinoDeVer(SEM_ENDERECO)?.endereco ===
            `/admin/previa/${SEM_ENDERECO.id}`,
        JSON.stringify(acoes.destinoDeVer(SEM_ENDERECO)),
      );
      afirmar(
        "os dois casos sem destino são reconhecidos, e quem TEM destino não produz motivo nenhum",
        acoes.destinoDeVer(SEM_IDENTIFICADOR) === null &&
          acoes.destinoDeVer(IDENTIFICADOR_CORROMPIDO) === null &&
          acoes.motivoDeNaoVer(PUBLICADO) === null &&
          acoes.motivoDeNaoVer(RASCUNHO) === null &&
          acoes.motivoDeNaoVer(SEM_ENDERECO) === null,
        JSON.stringify(acoes.motivoDeNaoVer(SEM_IDENTIFICADOR)),
      );
      /* ─── DUAS CAUSAS, DUAS FRASES ────────────────────────────────────
         A primeira versão dizia "ainda não foi gravado no servidor" para os
         dois — e para o identificador corrompido isso é FALSO: o Post foi
         gravado, e mandar salvar de novo manda a pessoa refazer um trabalho
         já feito por um defeito que não é dela. É o mesmo cuidado que o ramo
         "sem endereço" da Story 2.12 tinha. */
      {
        const semId = acoes.motivoDeNaoVer(SEM_IDENTIFICADOR);
        const corrompido = acoes.motivoDeNaoVer(IDENTIFICADOR_CORROMPIDO);
        afirmar(
          "cada uma das duas causas tem frase PRÓPRIA, com as duas metades e nomeando o Post",
          [semId, corrompido].every(
            (m) =>
              typeof m?.oQueHouve === "string" &&
              m.oQueHouve.trim() !== "" &&
              typeof m.oQueFazer === "string" &&
              m.oQueFazer.trim() !== "",
          ) &&
            semId.oQueHouve.includes("Post que nunca foi salvo") &&
            corrompido.oQueHouve.includes("Post com id estragado") &&
            semId.oQueHouve !== corrompido.oQueHouve &&
            semId.oQueFazer !== corrompido.oQueFazer,
          `${semId?.oQueHouve} | ${corrompido?.oQueHouve}`,
        );
        afirmar(
          "e só a do Post não gravado manda SALVAR — a outra não pede um trabalho que já foi feito",
          /salve o post/i.test(semId.oQueFazer) &&
            !/salve o post/i.test(corrompido.oQueFazer),
          corrompido.oQueFazer,
        );
      }
      afirmar(
        "identificador FORA do formato não vira endereço de prévia — o que o banco não pode ter emitido não vira link",
        ["x", "", "  ", "1234", `${PUBLICADO.id}x`, "../../etc"].every(
          (id) => acoes.destinoDeVer({ id, estado: "rascunho", titulo: "t" }) === null,
        ),
        JSON.stringify(acoes.destinoDeVer({ id: "x", estado: "rascunho" })),
      );
      /* ─── A PENDÊNCIA VIAJA NO ENDEREÇO, e só para a prévia ───────────
         A prévia lê do BANCO. Quem a abre do Editor com texto pendente confere
         uma versão que não é a que está na tela dele. O site nunca mostrou
         nada além do gravado, então o aviso não faz sentido lá. */
      afirmar(
        "o endereço da prévia carrega o aviso de alterações pendentes, e o do site NÃO carrega — lá nunca houve o que avisar",
        acoes.destinoDeVer(RASCUNHO, { pendente: true }).endereco ===
          `/admin/previa/${RASCUNHO.id}?pendente=1` &&
          acoes.destinoDeVer(RASCUNHO, { pendente: false }).endereco ===
            `/admin/previa/${RASCUNHO.id}` &&
          acoes.destinoDeVer(RASCUNHO).endereco === `/admin/previa/${RASCUNHO.id}` &&
          acoes.destinoDeVer(PUBLICADO, { pendente: true }).endereco ===
            "/blog/guia-de-atalhos",
        acoes.destinoDeVer(RASCUNHO, { pendente: true }).endereco,
      );

      afirmar(
        "o controle de Destaque diz o que FARÁ, não o estado em que o Post está",
        acoes.rotuloDeDestaque(PUBLICADO) !== acoes.rotuloDeDestaque(RASCUNHO) &&
          /tirar/i.test(acoes.rotuloDeDestaque(PUBLICADO)) &&
          !/tirar/i.test(acoes.rotuloDeDestaque(RASCUNHO)),
        `${acoes.rotuloDeDestaque(PUBLICADO)} | ${acoes.rotuloDeDestaque(RASCUNHO)}`,
      );

      {
        /* NUMA LISTA DE VINTE LINHAS, vinte controles chamados "Excluir" são
           vinte controles indistinguíveis para quem ouve a tela. Cada rótulo
           nomeia o Post, e os quatro são distintos entre si. */
        const rotulos = [
          regras.rotuloParaAbrir(PUBLICADO),
          acoes.rotuloDeVer(PUBLICADO),
          acoes.rotuloDeDestaque(PUBLICADO),
          acoes.rotuloDeExcluir(PUBLICADO),
        ];
        afirmar(
          "os quatro rótulos NOMEIAM o Post e são distintos entre si",
          rotulos.every((r) => r.includes("Guia de atalhos")) &&
            new Set(rotulos).size === 4,
          rotulos.join(" | "),
        );
        afirmar(
          "o rótulo de ver diz PARA ONDE vai — site e prévia não podem soar a mesma coisa",
          acoes.rotuloDeVer(PUBLICADO) !== acoes.rotuloDeVer(RASCUNHO) &&
            /site/i.test(acoes.rotuloDeVer(PUBLICADO)) &&
            /pr[ée]-?visualiz/i.test(acoes.rotuloDeVer(RASCUNHO)) &&
            acoes.rotuloDeVer(RASCUNHO).includes("Rascunho sem categoria"),
          `${acoes.rotuloDeVer(PUBLICADO)} | ${acoes.rotuloDeVer(RASCUNHO)}`,
        );
        afirmar(
          "e quando não há destino o rótulo diz o MOTIVO — o de cada causa, não um genérico para as duas",
          [SEM_IDENTIFICADOR, IDENTIFICADOR_CORROMPIDO].every((post) =>
            acoes.rotuloDeVer(post).includes(acoes.motivoDeNaoVer(post).oQueHouve),
          ) &&
            acoes.rotuloDeVer(SEM_IDENTIFICADOR).includes("Post que nunca foi salvo") &&
            acoes.rotuloDeVer(IDENTIFICADOR_CORROMPIDO) !==
              acoes.rotuloDeVer(SEM_IDENTIFICADOR),
          acoes.rotuloDeVer(IDENTIFICADOR_CORROMPIDO),
        );
      }

      afirmar(
        "a pergunta da exclusão traz o TÍTULO dentro dela — “tem certeza?” ensina a clicar sem ler",
        acoes.tituloDaExclusao(PUBLICADO).includes("Guia de atalhos") &&
          acoes.tituloDaExclusao({}).includes("post sem título"),
        acoes.tituloDaExclusao(PUBLICADO),
      );
      afirmar(
        "e a consequência é dita ANTES, com o aviso do link só para quem está no ar",
        acoes.descricaoDaExclusao(PUBLICADO) !== acoes.descricaoDaExclusao(RASCUNHO) &&
          /link/i.test(acoes.descricaoDaExclusao(PUBLICADO)) &&
          !/link/i.test(acoes.descricaoDaExclusao(RASCUNHO)) &&
          /desfazer/i.test(acoes.descricaoDaExclusao(RASCUNHO)),
        acoes.descricaoDaExclusao(PUBLICADO),
      );

      /* ─── E A CONSEQUÊNCIA ANUNCIADA É A QUE ACONTECE ───────────────────
         A frase prometia que o Post saía "junto com as tags". Não é o que a
         cascata faz: ela vai de `posts` para `posts_tags` — a ASSOCIAÇÃO —, e
         as Tags continuam, porque uma Tag é de todos os Posts.
         `verificar:escrita` prova o fato contra o banco, com a Tag lida depois
         da exclusão; esta linha prova que a frase continua dizendo isso.
         Aviso de consequência que exagera é aviso que ensina a desconfiar do
         aviso — e este é o único que a pessoa lê antes de algo irreversível. */
      {
        const frase = acoes.descricaoDaExclusao(RASCUNHO);
        const PROMESSA_EXAGERADA =
          /(junto com|junto das|leva|apaga|remove|exclui)\s+(as\s+)?tags/i;
        afirmar(
          "a consequência NÃO promete que as Tags somem — a cascata alcança a associação, e a Tag é de todos os Posts",
          !PROMESSA_EXAGERADA.test(frase) && /tags?\b/i.test(frase),
          frase,
        );
        afirmar(
          "e diz explicitamente que elas continuam — o que sai é o Post, e o lugar dele nas tags",
          /tags[^.]*continuam|continuam[^.]*tags/i.test(frase),
          frase,
        );
        /* AUTOTESTE: o detector precisa acusar a frase que existia antes. */
        afirmar(
          "o detector de promessa exagerada acusa a frase que a story trocou",
          PROMESSA_EXAGERADA.test(
            "O post sai do Painel junto com as tags e os endereços antigos dele.",
          ),
        );
      }

      afirmar(
        "o que está em curso é dito, e cada operação diz uma coisa — alvo desabilitado sem explicação é alvo que parou de funcionar",
        acoes.textoDaAcaoEmCurso(PUBLICADO, "excluir").includes("Guia de atalhos") &&
          acoes.textoDaAcaoEmCurso(PUBLICADO, "destacar").includes("Guia de atalhos") &&
          acoes.textoDaAcaoEmCurso(PUBLICADO, "excluir") !==
            acoes.textoDaAcaoEmCurso(PUBLICADO, "destacar") &&
          acoes.textoDaAcaoEmCurso(PUBLICADO, "salvar") === "",
        acoes.textoDaAcaoEmCurso(PUBLICADO, "excluir"),
      );

      if (voz) {
        afirmar(
          "as frases de confirmação e de falha passam pelas guardas de voz, e o rótulo do diálogo nomeia o que o botão faz",
          voz.diagnosticarMensagem("o que aconteceu", acoes.confirmacaoDaExclusao(PUBLICADO)) === null &&
            voz.diagnosticarMensagem("o que aconteceu", acoes.confirmacaoDeDestaque(PUBLICADO, true)) === null &&
            voz.diagnosticarMensagem("o que aconteceu", acoes.confirmacaoDeDestaque(PUBLICADO, false)) === null &&
            voz.diagnosticarMensagem("o que houve", acoes.falhaDaExclusao(PUBLICADO)) === null &&
            voz.diagnosticarMensagem("o que houve", acoes.falhaDeDestaque(PUBLICADO, true)) === null &&
            voz.diagnosticarRotuloDeAcao(acoes.ROTULO_DE_CONFIRMAR_EXCLUSAO) === null,
          `${acoes.confirmacaoDaExclusao(PUBLICADO)} | ${acoes.ROTULO_DE_CONFIRMAR_EXCLUSAO}`,
        );
        afirmar(
          "e as duas direções do Destaque dizem coisas diferentes — “Destaque alterado” não conta o que aconteceu",
          acoes.confirmacaoDeDestaque(PUBLICADO, true) !==
            acoes.confirmacaoDeDestaque(PUBLICADO, false) &&
            acoes.falhaDeDestaque(PUBLICADO, true) !== acoes.falhaDeDestaque(PUBLICADO, false),
          `${acoes.confirmacaoDeDestaque(PUBLICADO, true)} | ${acoes.confirmacaoDeDestaque(PUBLICADO, false)}`,
        );
      }

      afirmar(
        "nada aqui lança com dado corrompido — uma linha estragada não pode derrubar a listagem inteira",
        tentar(
          "as regras das ações com lixo",
          () => {
            for (const lixo of [null, undefined, {}, { titulo: 42 }, { estado: 7 }, []]) {
              acoes.tituloParaFrase(lixo);
              acoes.enderecoPublico(lixo);
              acoes.podeVerNoSite(lixo);
              acoes.destinoDeVer(lixo);
              acoes.motivoDeNaoVer(lixo);
              acoes.rotuloDeDestaque(lixo);
              acoes.rotuloDeExcluir(lixo);
              acoes.rotuloDeVer(lixo);
              acoes.tituloDaExclusao(lixo);
              acoes.descricaoDaExclusao(lixo);
              acoes.textoDaAcaoEmCurso(lixo, "excluir");
            }
            return true;
          },
          false,
        ),
      );
    }

    /* ── O ENDEREÇO PÚBLICO É ESCRITO UMA VEZ ─────────────────────────── */
    //
    // O comentário de `acoes.js` promete "escrito uma vez, aqui", e o Editor
    // mantinha a cópia dele: `estado === 'publicado' && valores.slug` de um
    // lado, `podeVerNoSite` do outro. Duas montagens do mesmo endereço divergem
    // no dia em que o prefixo do blog mudar, e a divergência aparece como um
    // link que erra — que é exatamente o que a ação de ver não pode ser.
    {
      const telas = [CAMINHO_LISTA, CAMINHO_TELA];
      const comCopia = telas.filter((relativo) =>
        /["'`]\/blog\//.test(mascararComentariosJs(ler(relativo))),
      );
      afirmar(
        "nenhuma tela do Painel monta o endereço público por conta própria — as duas perguntam a `acoes.js`",
        comCopia.length === 0,
        comCopia.join(", "),
      );
      /* E A DECISÃO É A MESMA NAS DUAS TELAS (Story 2.13). Não basta que cada
         uma monte o endereço pelo módulo puro: quem responde "dá para ver isto,
         e como" precisa ser a MESMA função, senão a linha oferece a prévia e o
         Editor esconde a ação para o mesmo Post. */
      const semImportar = telas.filter(
        (relativo) => !/destinoDeVer/.test(ler(relativo)) || !/rotuloDeVer/.test(ler(relativo)),
      );
      afirmar(
        "e as duas usam a MESMA função para decidir para onde ver leva, e o MESMO rótulo",
        semImportar.length === 0,
        semImportar.join(", "),
      );
      /* AUTOTESTE: o detector precisa acusar a cópia que existia. */
      afirmar(
        "o detector de endereço montado à mão acusa a forma que o Editor usava",
        /["'`]\/blog\//.test('href={`/blog/${valores.slug}`}'),
      );
    }

    /* ── OS ALVOS NA TELA: 40×40, contorno permanente, sem hover ──────── */
    if (acoes && regras && foco) {
      modulo.controle.aoListar = null;
      modulo.controle.aoExcluir = null;
      modulo.controle.aoDestacar = null;
      modulo.controle.listagem = { ok: true, dados: POSTS_DE_PROVA };
      const abertos = [];
      const tela = await montarLista({ aoAbrirPost: (post) => abertos.push(post?.id ?? null) });

      const alvosDa = (id) => [...(tela.linha(id)?.querySelectorAll("[data-acao]") ?? [])];
      const ORDEM_DAS_ACOES = ["editar", "ver", "destacar", "excluir"];

      afirmar(
        "cada linha oferece as QUATRO ações, na ordem em que a listagem as declara",
        POSTS_DE_PROVA.every((p) =>
          igual(
            alvosDa(p.id).map((a) => a.getAttribute("data-acao")),
            ORDEM_DAS_ACOES,
          ),
        ),
        alvosDa(ID_A).map((a) => a.getAttribute("data-acao")).join(", "),
      );

      {
        /* O CONTORNO É A ENTREGA. Nada de `group-hover`, nada nascendo
           transparente, nada nascendo escondido: ação revelada por ponteiro não
           existe no celular nem para quem navega por teclado. */
        const exigidas = [...foco.ALVO_DE_TOQUE.split(" "), ...foco.ANEL_DE_FOCO.split(" ")]
          .filter((t) => t !== "");
        const REVELADAS_POR_PONTEIRO =
          /^(group-hover:|hover:opacity|opacity-0$|invisible$|hidden$|sr-only$)/;
        const problemas = [];
        for (const post of POSTS_DE_PROVA) {
          for (const alvo of alvosDa(post.id)) {
            const classes = (alvo.className ?? "").split(/\s+/u).filter((c) => c !== "");
            const faltando = exigidas.filter((t) => !classes.includes(t));
            const nome = `${post.estado}/${alvo.getAttribute("data-acao")}`;
            if (faltando.length > 0) problemas.push(`${nome} sem ${faltando.join("+")}`);
            if (!classes.includes("size-10")) problemas.push(`${nome} sem os 40×40 exatos`);
            if (!classes.some((c) => c === "border" || /^border-(?!.*:)/.test(c))) {
              problemas.push(`${nome} sem contorno`);
            }
            const escondida = classes.find((c) => REVELADAS_POR_PONTEIRO.test(c));
            if (escondida) problemas.push(`${nome} revelada por ponteiro (${escondida})`);
          }
        }
        afirmar(
          "os alvos têm 40×40 e CONTORNO PERMANENTE — nenhum deles nasce escondido nem depende do ponteiro",
          problemas.length === 0,
          problemas.slice(0, 4).join(" | "),
        );
        /* AUTOTESTE do detector de revelação por ponteiro: sem ele, um padrão
           quebrado deixaria a asserção acima passar sobre alvos invisíveis. */
        afirmar(
          "o detector de “só aparece no hover” acusa as formas que ele existe para pegar",
          ["group-hover:opacity-100", "opacity-0", "invisible", "hidden", "sr-only"].every(
            (c) => REVELADAS_POR_PONTEIRO.test(c),
          ) && !REVELADAS_POR_PONTEIRO.test("hover:bg-surface-sunk"),
        );
      }

      {
        const problemas = [];
        for (const post of POSTS_DE_PROVA) {
          for (const alvo of alvosDa(post.id)) {
            const nome = `${post.estado}/${alvo.getAttribute("data-acao")}`;
            if (!["BUTTON", "A"].includes(alvo.tagName)) problemas.push(`${nome} é ${alvo.tagName}`);
            if (Number(alvo.getAttribute("tabindex")) < 0) problemas.push(`${nome} fora da ordem de tabulação`);
            const rotulo = alvo.getAttribute("aria-label") ?? "";
            if (rotulo.trim() === "" || !rotulo.includes(post.titulo)) {
              problemas.push(`${nome} sem nome que nomeie o Post: ${JSON.stringify(rotulo)}`);
            }
          }
        }
        afirmar(
          "os alvos são alcançáveis por teclado e cada um tem nome acessível que NOMEIA o Post",
          problemas.length === 0,
          problemas.slice(0, 4).join(" | "),
        );
      }

      /* ── EDITAR ─────────────────────────────────────────────────────── */
      {
        const editar = tela.linha(ID_A)?.querySelector('[data-acao="editar"]');
        afirmar(
          "editar é o MESMO controle que abre o Post, agora num alvo de 40×40",
          editar !== null && editar.getAttribute("data-abrir") === ID_A,
          String(editar?.getAttribute("data-abrir")),
        );
        if (editar) {
          await tela.clicar(editar);
          afirmar(
            "e ele abre EXATAMENTE aquele Post no Editor",
            igual(abertos, [ID_A]),
            abertos.join(", "),
          );
        }
        afirmar(
          "e não há um SEGUNDO controle para a mesma ação — o vão que cobria o cartão inteiro saiu junto",
          (tela.linha(ID_A)?.querySelectorAll(`[data-abrir="${ID_A}"]`) ?? []).length === 1,
          String((tela.linha(ID_A)?.querySelectorAll(`[data-abrir="${ID_A}"]`) ?? []).length),
        );
      }

      /* ── VER: dois destinos, os dois com link de verdade ─────────────── */
      {
        const ver = tela.linha(ID_A)?.querySelector('[data-acao="ver"]');
        afirmar(
          "Post publicado abre o endereço público em ABA NOVA, como link de verdade",
          ver?.tagName === "A" &&
            ver.getAttribute("href") === "/blog/guia-de-atalhos" &&
            ver.getAttribute("data-destino-de-ver") === acoes.DESTINO_SITE &&
            ver.getAttribute("target") === "_blank" &&
            /noopener/.test(ver.getAttribute("rel") ?? ""),
          `${ver?.tagName} href=${ver?.getAttribute("href")} target=${ver?.getAttribute("target")}`,
        );

        /* ─── E POST NÃO PUBLICADO DEIXOU DE SER UM BECO (Story 2.13) ────
           Até a Story 2.12 este alvo era um botão que só sabia explicar por que
           não dava. Agora ele LEVA — para a prévia, sob o portão, por
           identificador, inclusive quando o rascunho não tem endereço nenhum. */
        const problemas = [];
        for (const id of [ID_B, ID_C, ID_D]) {
          const alvo = tela.linha(id)?.querySelector('[data-acao="ver"]');
          const post = POSTS_DE_PROVA.find((p) => p.id === id);
          if (alvo?.tagName !== "A") problemas.push(`${post.estado}: é ${alvo?.tagName}`);
          if (alvo?.getAttribute("data-destino-de-ver") !== acoes.DESTINO_PREVIA) {
            problemas.push(`${post.estado}: destino ${alvo?.getAttribute("data-destino-de-ver")}`);
          }
          if (alvo?.getAttribute("href") !== `/admin/previa/${id}`) {
            problemas.push(`${post.estado}: endereço ${alvo?.getAttribute("href")}`);
          }
          if (alvo?.getAttribute("target") !== "_blank") {
            problemas.push(`${post.estado}: não abre em aba nova`);
          }
          if (alvo?.hasAttribute("aria-disabled")) {
            problemas.push(`${post.estado}: ainda se declara indisponível`);
          }
          if (alvo?.getAttribute("aria-label") !== acoes.rotuloDeVer(post)) {
            problemas.push(`${post.estado}: rótulo fora do vocabulário`);
          }
        }
        afirmar(
          "Post NÃO publicado leva à PRÉ-VISUALIZAÇÃO, sob `/admin` e por identificador — a ação deixou de ser indisponível",
          problemas.length === 0,
          problemas.join(" | "),
        );

        /* O rascunho de prova (ID_C) NÃO tem endereço: é o caso que a Story
           2.12 recusava por um motivo próprio, e que agora abre assim mesmo. */
        {
          const rascunho = POSTS_DE_PROVA.find((p) => p.id === ID_C);
          afirmar(
            "e o rascunho SEM endereço abre a prévia do mesmo jeito — ela não depende de slug",
            String(rascunho.slug ?? "").trim() === "" &&
              tela
                .linha(ID_C)
                ?.querySelector('[data-acao="ver"]')
                ?.getAttribute("href") === `/admin/previa/${ID_C}`,
            `slug: ${JSON.stringify(rascunho.slug)}`,
          );
        }

        /* NENHUM ALVO DE VER NOTIFICA MAIS: acionar um link não produz aviso.
           Sem esta linha, um alvo que continuasse sendo botão-que-explica
           passaria despercebido pelas asserções acima se alguém trocasse só o
           ramo publicado. */
        modulo.controle.avisos = [];
        await tela.clicar(tela.linha(ID_C)?.querySelector('[data-acao="ver"]'));
        afirmar(
          "acionar ver num Post não publicado NÃO anuncia recusa nenhuma — não há mais o que recusar",
          modulo.controle.avisos.length === 0,
          JSON.stringify(modulo.controle.avisos),
        );
      }

      await tela.desmontar();
    }

    /* ── O RAMO INDISPONÍVEL DA LINHA, QUE CONTINUA VIVO ──────────────────
       A Story 2.13 tirou o Estado do caminho, mas NÃO apagou o ramo: Post sem
       identificador utilizável continua sem ter para onde levar, e o controle
       continua existindo e explicando. Os quatro Posts de prova têm `uuid`
       válido, então esse ramo nunca é desenhado por eles — e uma lista própria
       é o que impede o `else` de virar código vivo sem prova. Sabotagem que
       passaria sem estas linhas: apagar o `onClick` que anuncia o motivo. */
    if (acoes && regras) {
      const SEM_ID = {
        id: "",
        slug: "",
        titulo: "Post que nunca foi salvo",
        autor_nome: "Ana Ribeiro",
        categoria: null,
        imagem_url: null,
        destaque: false,
        tempo_leitura: 0,
        estado: "rascunho",
        publicado_em: null,
        atualizado_em: "2027-03-10T12:00:00.000Z",
      };
      const ID_CORROMPIDO = {
        ...SEM_ID,
        id: "nao-e-uuid",
        titulo: "Post com id estragado",
      };
      const SEM_DESTINO = [SEM_ID, ID_CORROMPIDO];

      modulo.controle.aoListar = null;
      modulo.controle.listagem = { ok: true, dados: SEM_DESTINO };
      const tela = await montarLista({});

      const alvoDeVer = (id) =>
        tela.alvo.querySelector(`[data-post="${id}"] [data-acao="ver"]`);

      const problemas = [];
      for (const post of SEM_DESTINO) {
        const alvo = alvoDeVer(post.id);
        const nome = post.titulo;
        if (alvo?.tagName !== "BUTTON") problemas.push(`${nome}: é ${alvo?.tagName}`);
        if (alvo?.hasAttribute("href")) problemas.push(`${nome}: virou link`);
        if (alvo?.getAttribute("aria-disabled") !== "true") {
          problemas.push(`${nome}: não se declara indisponível`);
        }
        if (alvo?.getAttribute("aria-label") !== acoes.rotuloDeVer(post)) {
          problemas.push(`${nome}: rótulo fora do vocabulário`);
        }
      }
      afirmar(
        "Post sem identificador utilizável mantém a ação INDISPONÍVEL dizendo o motivo — nunca um link que erra",
        problemas.length === 0,
        problemas.join(" | "),
      );
      afirmar(
        "o alvo indisponível continua alcançável pelo teclado — `aria-disabled`, e não `disabled`: quem some não explica nada",
        SEM_DESTINO.every((post) => {
          const alvo = alvoDeVer(post.id);
          return alvo !== null && !alvo.hasAttribute("disabled");
        }),
      );

      /* E ELE DIZ O MOTIVO AO SER ACIONADO — que é a única coisa que ele FAZ.
         Sem esta asserção, apagar o `onClick` dele deixava um botão que não faz
         nada, com a suíte verde: o rótulo continuaria explicando, e quem
         clicasse não receberia resposta alguma. */
      for (const post of SEM_DESTINO) {
        modulo.controle.avisos = [];
        await tela.clicar(alvoDeVer(post.id));
        const motivo = acoes.motivoDeNaoVer(post);
        const aviso = modulo.controle.avisos[0] ?? null;
        afirmar(
          `acionar o alvo indisponível de “${post.titulo}” ANUNCIA o motivo, nas duas metades`,
          modulo.controle.avisos.length === 1 &&
            aviso?.tom === "erro" &&
            aviso.oQueHouve === motivo.oQueHouve &&
            aviso.oQueFazer === motivo.oQueFazer,
          JSON.stringify(modulo.controle.avisos),
        );
      }
      /* E as duas causas ANUNCIAM COISAS DIFERENTES: um anúncio só para as duas
         mandaria salvar um Post que já foi salvo. */
      afirmar(
        "e as duas causas anunciam frases diferentes — o motivo é do Post, não do ramo",
        acoes.motivoDeNaoVer(SEM_ID).oQueFazer !==
          acoes.motivoDeNaoVer(ID_CORROMPIDO).oQueFazer,
        acoes.motivoDeNaoVer(ID_CORROMPIDO).oQueFazer,
      );
      afirmar(
        "o React não reclamou ao desenhar as linhas sem destino",
        tela.reclamacoes.length === 0,
        tela.reclamacoes.slice(0, 2).join(" | ").slice(0, 300),
      );
      await tela.desmontar();
    }

    /* ── ALTERNAR DESTAQUE: efeito imediato, e reversão honesta ───────── */
    if (acoes && regras) {
      modulo.controle.aoListar = null;
      modulo.controle.aoDestacar = null;
      modulo.controle.listagem = { ok: true, dados: POSTS_DE_PROVA };
      modulo.controle.pedidos_de_destaque = [];
      const tela = await montarLista({});

      const alvoDoDestaque = (id) =>
        tela.linha(id)?.querySelector('[data-acao="destacar"]') ?? null;

      afirmar(
        "o alvo do Destaque declara o estado atual — `aria-pressed`, e não só um desenho de estrela",
        alvoDoDestaque(ID_A)?.getAttribute("aria-pressed") === "true" &&
          alvoDoDestaque(ID_C)?.getAttribute("aria-pressed") === "false",
        `publicado: ${alvoDoDestaque(ID_A)?.getAttribute("aria-pressed")} | rascunho: ${alvoDoDestaque(ID_C)?.getAttribute("aria-pressed")}`,
      );

      /* O pedido fica SEGURO no ar: é a única forma de observar o efeito
         imediato e o alvo desabilitado ao mesmo tempo. */
      let liberar = null;
      modulo.controle.aoDestacar = () =>
        new Promise((resolver) => {
          liberar = resolver;
        });

      await tela.clicar(alvoDoDestaque(ID_C));

      afirmar(
        "o pedido vai para a camada com o identificador certo e o valor DESEJADO — não um pedido de inversão",
        modulo.controle.pedidos_de_destaque.length === 1 &&
          modulo.controle.pedidos_de_destaque[0].id === ID_C &&
          modulo.controle.pedidos_de_destaque[0].destaque === true,
        JSON.stringify(modulo.controle.pedidos_de_destaque),
      );
      afirmar(
        "o efeito é IMEDIATO: a estrela muda antes de a resposta chegar",
        alvoDoDestaque(ID_C)?.getAttribute("aria-pressed") === "true" &&
          tela.linha(ID_C)?.querySelector('[data-destaque="true"]') !== null,
        `aria-pressed: ${alvoDoDestaque(ID_C)?.getAttribute("aria-pressed")}`,
      );
      afirmar(
        "e o alvo desabilita enquanto o pedido corre, dizendo o que está acontecendo",
        alvoDoDestaque(ID_C)?.hasAttribute("disabled") === true &&
          alvoDoDestaque(ID_C)?.getAttribute("aria-busy") === "true" &&
          (tela.alvo.querySelector('[data-papel="acao-em-curso"]')?.textContent ?? "").includes(
            "Rascunho sem categoria",
          ),
        `anúncio: ${tela.alvo.querySelector('[data-papel="acao-em-curso"]')?.textContent}`,
      );

      /* CLIQUE REPETIDO NÃO DUPLICA. O segundo clique no meio do primeiro é o
         caminho normal para "post inexistente" — e para dois pedidos onde o
         Autor pediu um. */
      await tela.clicar(alvoDoDestaque(ID_C));
      await tela.clicar(tela.linha(ID_A)?.querySelector('[data-acao="destacar"]'));
      afirmar(
        "clique repetido — no mesmo alvo e no de outra linha — NÃO produz um segundo pedido",
        modulo.controle.pedidos_de_destaque.length === 1,
        JSON.stringify(modulo.controle.pedidos_de_destaque),
      );

      /* ─── E O IMPEDIMENTO APARECE, EM TODAS AS LINHAS ────────────────────
         O trinco é global: um pedido de cada vez na listagem inteira. Enquanto
         ele estava preso, os alvos das OUTRAS linhas continuavam habilitados e
         o clique caía num `return` silencioso — sem notificação, sem
         `aria-busy`, sem nada. É o mesmo "alvo que parou de funcionar sem
         explicar" que a story existe para consertar, e no caso de excluir
         ainda abria um diálogo que a confirmação não conseguia fechar. */
      {
        const habilitadosDeOutraLinha = [ID_A, ID_B, ID_D].flatMap((id) =>
          [...(tela.linha(id)?.querySelectorAll('[data-acao="destacar"], [data-acao="excluir"]') ?? [])].filter(
            (alvo) => !alvo.hasAttribute("disabled"),
          ),
        );
        afirmar(
          "enquanto um pedido corre, os alvos que escrevem desabilitam em TODAS as linhas — clique que não acontece precisa parecer que não vai acontecer",
          habilitadosDeOutraLinha.length === 0,
          habilitadosDeOutraLinha
            .map((a) => a.getAttribute("aria-label"))
            .join(" | ")
            .slice(0, 200),
        );
        afirmar(
          "e editar e ver continuam disponíveis — eles não escrevem, e travá-los seria travar a leitura por causa de uma gravação",
          [ID_A, ID_B, ID_D].every((id) =>
            [...(tela.linha(id)?.querySelectorAll('[data-acao="editar"], [data-acao="ver"]') ?? [])].every(
              (alvo) => !alvo.hasAttribute("disabled"),
            ),
          ),
        );
      }

      /* A RECUSA REVERTE. Efeito imediato que não volta atrás é efeito imediato
         que mente: o Autor sai da tela achando que destacou. */
      await act(async () => {
        liberar({
          ok: false,
          erro: {
            tipo: "rede",
            mensagem: "Não conseguimos falar com o servidor. Confira a conexão e tente de novo.",
          },
        });
      });
      afirmar(
        "a recusa REVERTE a estrela, e o alvo volta a funcionar",
        alvoDoDestaque(ID_C)?.getAttribute("aria-pressed") === "false" &&
          tela.linha(ID_C)?.querySelector('[data-destaque="true"]') === null &&
          alvoDoDestaque(ID_C)?.hasAttribute("disabled") === false,
        `aria-pressed: ${alvoDoDestaque(ID_C)?.getAttribute("aria-pressed")} | desabilitado: ${alvoDoDestaque(ID_C)?.hasAttribute("disabled")}`,
      );

      /* E O QUE FICA É O VALOR GRAVADO, lido da resposta — não o que a tela
         pediu. Aqui o servidor responde `false` para um pedido de `true`, e é o
         `false` que precisa aparecer. */
      modulo.controle.aoDestacar = null;
      modulo.controle.destaque = {
        ok: true,
        dados: { operacao: "destacar", id: ID_C, destaque: false, post: null },
      };
      modulo.controle.pedidos_de_destaque = [];
      await tela.clicar(alvoDoDestaque(ID_C));
      afirmar(
        "o que fica na tela é o valor GRAVADO que voltou — confirmar o próprio pedido seria a tela conferindo a si mesma",
        modulo.controle.pedidos_de_destaque[0]?.destaque === true &&
          alvoDoDestaque(ID_C)?.getAttribute("aria-pressed") === "false",
        `pediu true, o servidor gravou false, a tela mostra ${alvoDoDestaque(ID_C)?.getAttribute("aria-pressed")}`,
      );
      afirmar(
        "e o AVISO acompanha o valor gravado, não o pedido — senão a estrela diria uma coisa e o aviso outra",
        modulo.controle.avisos.at(-1)?.oQueHouve ===
          acoes.confirmacaoDeDestaque(
            POSTS_DE_PROVA.find((x) => x.id === ID_C),
            false,
          ),
        JSON.stringify(modulo.controle.avisos.at(-1)),
      );

      /* ─── POST QUE JÁ NÃO EXISTE, TAMBÉM AQUI ────────────────────────────
         A matriz diz "Post inexistente → erro que diz isso, e a lista se
         acerta", e não distingue operação. A reconciliação existia só em
         excluir: destacar deixava na tela uma linha que o banco já não tem. */
      modulo.controle.aoDestacar = async () => ({
        ok: false,
        erro: { tipo: "nao_encontrado", mensagem: "Este post já não está no Painel." },
      });
      modulo.controle.avisos = [];
      {
        const antes = tela.linhas().length;
        await tela.clicar(alvoDoDestaque(ID_B));
        afirmar(
          "destacar um Post que JÁ NÃO EXISTE tira a linha da lista, e avisa — insistir nela é a tela mostrando o que não está lá",
          tela.linha(ID_B) === null &&
            tela.linhas().length === antes - 1 &&
            modulo.controle.avisos.at(-1)?.tom === "erro",
          `linhas: ${antes} → ${tela.linhas().length} | aviso: ${JSON.stringify(modulo.controle.avisos.at(-1))}`,
        );
      }
      modulo.controle.aoDestacar = null;

      afirmar(
        "o React não reclamou ao alternar o Destaque",
        tela.reclamacoes.length === 0,
        tela.reclamacoes.slice(0, 2).join(" | ").slice(0, 300),
      );
      await tela.desmontar();
      modulo.controle.destaque = {
        ok: true,
        dados: { operacao: "destacar", id: null, destaque: true, post: null },
      };
    }

    /* ── EXCLUIR: a confirmação que nomeia, e a lista que se acerta ───── */
    if (acoes && regras) {
      /** O conteúdo do diálogo vive em PORTAL, preso ao `body`. */
      const dialogo = () =>
        janela.document.querySelector('[data-slot="alert-dialog-content"]');
      const botaoDoDialogo = (texto) =>
        [...(dialogo()?.querySelectorAll("button") ?? [])].find(
          (b) => (b.textContent ?? "").trim() === texto,
        ) ?? null;

      modulo.controle.aoListar = null;
      modulo.controle.aoExcluir = null;
      modulo.controle.listagem = { ok: true, dados: POSTS_DE_PROVA };
      modulo.controle.pedidos_de_exclusao = [];
      const contagens = [];
      const tela = await montarLista({ aoContar: (n) => contagens.push(n) });

      const excluirDe = (id) => tela.linha(id)?.querySelector('[data-acao="excluir"]') ?? null;

      afirmar(
        "antes de qualquer clique não há diálogo nenhum aberto",
        dialogo() === null,
      );

      await tela.clicar(excluirDe(ID_A));
      afirmar(
        "acionar excluir abre o diálogo do sistema, e ele NOMEIA o Post e diz a consequência",
        dialogo() !== null &&
          (dialogo()?.textContent ?? "").includes("Guia de atalhos") &&
          (dialogo()?.textContent ?? "").includes(
            acoes.descricaoDaExclusao(POSTS_DE_PROVA.find((p) => p.id === ID_A)),
          ),
        (dialogo()?.textContent ?? "").slice(0, 200),
      );
      afirmar(
        "e é o `alert-dialog` do shadcn — com papel de alerta e o botão de confirmação nomeando o que faz",
        dialogo()?.getAttribute("role") === "alertdialog" &&
          botaoDoDialogo(acoes.ROTULO_DE_CONFIRMAR_EXCLUSAO) !== null,
        `role: ${dialogo()?.getAttribute("role")}`,
      );
      afirmar(
        "nada foi excluído só por abrir a pergunta",
        modulo.controle.pedidos_de_exclusao.length === 0,
        JSON.stringify(modulo.controle.pedidos_de_exclusao),
      );

      /* CANCELAR NÃO EXCLUI NADA. */
      const cancelar = botaoDoDialogo("Cancelar");
      afirmar("o diálogo oferece cancelar, e o foco inicial é dele", cancelar !== null);
      if (cancelar) {
        await tela.clicar(cancelar);
        afirmar(
          "cancelar fecha a pergunta e NÃO exclui — e a linha continua na lista",
          modulo.controle.pedidos_de_exclusao.length === 0 &&
            tela.linha(ID_A) !== null &&
            tela.linhas().length === POSTS_DE_PROVA.length,
          `pedidos: ${modulo.controle.pedidos_de_exclusao.length} | linhas: ${tela.linhas().length}`,
        );
      }

      /* A FALHA MANTÉM A LINHA. */
      modulo.controle.aoExcluir = async () => ({
        ok: false,
        erro: {
          tipo: "rede",
          mensagem: "Não conseguimos falar com o servidor. Confira a conexão e tente de novo.",
        },
      });
      await tela.clicar(excluirDe(ID_B));
      await tela.clicar(botaoDoDialogo(acoes.ROTULO_DE_CONFIRMAR_EXCLUSAO));
      afirmar(
        "exclusão RECUSADA mantém a linha na lista — sumir com ela seria mentir sobre o que aconteceu",
        igual(modulo.controle.pedidos_de_exclusao, [ID_B]) &&
          tela.linha(ID_B) !== null &&
          tela.linhas().length === POSTS_DE_PROVA.length,
        `linhas: ${tela.linhas().length}`,
      );

      /* A EXCLUSÃO DE VERDADE: a lista se acerta SEM recarregar. */
      modulo.controle.aoExcluir = null;
      modulo.controle.pedidos_de_exclusao = [];
      const idasAntes = modulo.controle.listagens;
      await tela.clicar(excluirDe(ID_A));
      await tela.clicar(botaoDoDialogo(acoes.ROTULO_DE_CONFIRMAR_EXCLUSAO));
      afirmar(
        "confirmada, a exclusão sai pela camada e a linha SOME da lista — sem recarregar nada",
        igual(modulo.controle.pedidos_de_exclusao, [ID_A]) &&
          tela.linha(ID_A) === null &&
          tela.linhas().length === POSTS_DE_PROVA.length - 1 &&
          modulo.controle.listagens === idasAntes,
        `linhas: ${tela.linhas().length} | releituras: ${modulo.controle.listagens - idasAntes}`,
      );
      afirmar(
        "e o Autor é AVISADO, com o Post nomeado — ação irreversível sem confirmação depois do fato deixa a pessoa sem saber o que saiu",
        modulo.controle.avisos.at(-1)?.tom === "sucesso" &&
          modulo.controle.avisos.at(-1)?.oQueHouve ===
            acoes.confirmacaoDaExclusao(POSTS_DE_PROVA.find((x) => x.id === ID_A)),
        JSON.stringify(modulo.controle.avisos.at(-1)),
      );
      {
        /* O FOCO NÃO CAI NO `body`. A linha, o alvo que abriu a ação e o
           diálogo desmontam juntos; sem destino, quem navega por teclado perde
           o lugar e recomeça do topo da página. */
        await act(async () => {
          await new Promise((resolver) => setTimeout(resolver, 40));
        });
        const focado = janela.document.activeElement;
        afirmar(
          "o foco volta para um ponto estável da lista, e não para o `body` — a linha que o tinha acabou de sair",
          focado !== null &&
            focado !== janela.document.body &&
            tela.alvo.contains(focado),
          `foco em: ${focado?.tagName}${focado?.getAttribute?.("data-acao") ? `[${focado.getAttribute("data-acao")}]` : ""}`,
        );
      }
      afirmar(
        "e a contagem da aba acompanha: o número que a aba Blog mostra é o de Posts que sobraram",
        contagens[contagens.length - 1] === POSTS_DE_PROVA.length - 1,
        JSON.stringify(contagens),
      );
      afirmar(
        "o diálogo fecha depois de excluir — a pergunta não fica pendurada sobre uma linha que já saiu",
        dialogo() === null,
      );

      /* POST QUE JÁ NÃO EXISTE: erro que diz isso, E a lista se acerta. */
      modulo.controle.aoExcluir = async () => ({
        ok: false,
        erro: { tipo: "nao_encontrado", mensagem: "Este post já não está no Painel." },
      });
      modulo.controle.pedidos_de_exclusao = [];
      await tela.clicar(excluirDe(ID_B));
      await tela.clicar(botaoDoDialogo(acoes.ROTULO_DE_CONFIRMAR_EXCLUSAO));
      afirmar(
        "excluir um Post que JÁ NÃO EXISTE também tira a linha — insistir nela seria a tela mostrando o que o banco não tem",
        igual(modulo.controle.pedidos_de_exclusao, [ID_B]) &&
          tela.linha(ID_B) === null &&
          tela.linhas().length === POSTS_DE_PROVA.length - 2,
        `linhas: ${tela.linhas().length}`,
      );

      afirmar(
        "o React não reclamou ao excluir",
        tela.reclamacoes.length === 0,
        tela.reclamacoes.slice(0, 2).join(" | ").slice(0, 300),
      );
      modulo.controle.aoExcluir = null;
      await tela.desmontar();
    }

    /* ── EXCLUIR SOB FILTRO ATIVO: a aba conta quantos EXISTEM ────────── */
    //
    // O guarda `if (!haBuscaAtiva(...))` da leitura existe para a aba não
    // anunciar o tamanho do RECORTE — e estava certo. Mas o efeito era a aba
    // continuar contando um Post que já não existe até a próxima leitura
    // completa. Decrementar o total CONHECIDO é diferente de anunciar o
    // recorte, e é o que esta asserção cobra. Sem ela, remover o guarda não
    // quebrava nada.
    if (acoes && regras) {
      const dialogo = () =>
        janela.document.querySelector('[data-slot="alert-dialog-content"]');
      const botaoDoDialogo = (texto) =>
        [...(dialogo()?.querySelectorAll("button") ?? [])].find(
          (b) => (b.textContent ?? "").trim() === texto,
        ) ?? null;

      const contagens = [];
      modulo.controle.aoListar = null;
      modulo.controle.aoExcluir = null;
      modulo.controle.pedidos_de_exclusao = [];

      /* Primeiro SEM filtro, para a listagem saber quantos existem. */
      modulo.controle.listagem = { ok: true, dados: POSTS_DE_PROVA };
      const tela = await montarLista({ aoContar: (n) => contagens.push(n) });
      afirmar(
        "a listagem sem filtro anuncia o total — é o número que a aba Blog mostra",
        contagens.at(-1) === POSTS_DE_PROVA.length,
        JSON.stringify(contagens),
      );

      /* Agora COM filtro: o recorte traz duas linhas das quatro. */
      const RECORTE = POSTS_DE_PROVA.filter((x) => [ID_A, ID_B].includes(x.id));
      modulo.controle.listagem = { ok: true, dados: RECORTE };
      await tela.reRenderizar({
        termo: "automação",
        aoContar: (n) => contagens.push(n),
      });
      /* A ESPERA DA DIGITAÇÃO é real e vale aqui: sem deixar o relógio correr,
         o termo ainda não virou consulta e a tela continua mostrando o resultado
         anterior — a asserção estaria olhando para a lista errada. */
      await act(async () => {
        await new Promise((resolver) =>
          setTimeout(resolver, modulo.ESPERA_DA_BUSCA_MS * 3),
        );
      });
      const depoisDoFiltro = contagens.length;
      afirmar(
        "e sob filtro ela NÃO anuncia o tamanho do recorte — a aba diria 2 para quem tem 4",
        contagens.at(-1) === POSTS_DE_PROVA.length && tela.linhas().length === 2,
        `contagens: ${JSON.stringify(contagens)} | linhas: ${tela.linhas().length}`,
      );

      await tela.clicar(tela.linha(ID_A)?.querySelector('[data-acao="excluir"]'));
      await tela.clicar(botaoDoDialogo(acoes.ROTULO_DE_CONFIRMAR_EXCLUSAO));
      afirmar(
        "excluir sob filtro DECREMENTA o total conhecido — a aba deixa de contar um Post que já não existe",
        igual(modulo.controle.pedidos_de_exclusao, [ID_A]) &&
          contagens.length > depoisDoFiltro &&
          contagens.at(-1) === POSTS_DE_PROVA.length - 1 &&
          tela.linhas().length === 1,
        `contagens: ${JSON.stringify(contagens)} | linhas: ${tela.linhas().length}`,
      );
      await tela.desmontar();
    }

    /* ── O DIÁLOGO NÃO FICA MUDO NEM PENDURADO ────────────────────────── */
    //
    // A região viva da listagem fica FORA do `alert-dialog`, que é
    // `aria-modal`: quem confirmou a exclusão está dentro dele e não a ouve —
    // e é exatamente quem ela existiria para servir.
    if (acoes && regras) {
      const dialogo = () =>
        janela.document.querySelector('[data-slot="alert-dialog-content"]');
      const botaoDoDialogo = (texto) =>
        [...(dialogo()?.querySelectorAll("button") ?? [])].find(
          (b) => (b.textContent ?? "").trim() === texto,
        ) ?? null;

      modulo.controle.aoListar = null;
      modulo.controle.listagem = { ok: true, dados: POSTS_DE_PROVA };
      modulo.controle.pedidos_de_exclusao = [];
      let liberar = null;
      modulo.controle.aoExcluir = () =>
        new Promise((resolver) => {
          liberar = resolver;
        });

      const tela = await montarLista({});
      await tela.clicar(tela.linha(ID_A)?.querySelector('[data-acao="excluir"]'));
      await tela.clicar(botaoDoDialogo(acoes.ROTULO_DE_CONFIRMAR_EXCLUSAO));

      const emCurso = acoes.textoDaAcaoEmCurso(
        POSTS_DE_PROVA.find((x) => x.id === ID_A),
        "excluir",
      );
      afirmar(
        "com a exclusão em voo, o que está acontecendo é dito DENTRO do modal — fora dele, quem confirmou não ouviria",
        dialogo() !== null &&
          (dialogo()?.querySelector('[data-papel="dialogo-em-curso"]')?.textContent ?? "") === emCurso &&
          emCurso !== "",
        `no diálogo: ${JSON.stringify(dialogo()?.querySelector('[data-papel="dialogo-em-curso"]')?.textContent)}`,
      );
      afirmar(
        "e o botão de confirmar desabilita, dizendo o que está em curso — a segunda confirmação não sai por cima da primeira",
        dialogo()?.querySelector('[data-papel="confirmar"]')?.hasAttribute("disabled") === true &&
          (dialogo()?.querySelector('[data-papel="confirmar"]')?.textContent ?? "").trim() === emCurso,
        `botão: ${JSON.stringify(dialogo()?.querySelector('[data-papel="confirmar"]')?.textContent)}`,
      );

      /* Clicar de novo no botão desabilitado não produz um segundo pedido. */
      await tela.clicar(dialogo()?.querySelector('[data-papel="confirmar"]'));
      afirmar(
        "confirmar duas vezes não exclui duas vezes",
        modulo.controle.pedidos_de_exclusao.length === 1,
        JSON.stringify(modulo.controle.pedidos_de_exclusao),
      );

      await act(async () => {
        liberar({ ok: true, dados: { operacao: "excluir", id: ID_A, post: null } });
      });
      afirmar(
        "e o diálogo FECHA quando a exclusão termina — pergunta pendurada sobre uma linha que já saiu é pior que nenhuma",
        dialogo() === null && tela.linha(ID_A) === null,
        `diálogo: ${dialogo() === null ? "fechado" : "aberto"}`,
      );
      modulo.controle.aoExcluir = null;
      await tela.desmontar();
    }

    /* ── E A LISTAGEM CONTINUA SEM ESCREVER NO BANCO ──────────────────── */
    {
      const codigo = mascararComentariosJs(ler(CAMINHO_LISTA));
      const puro = mascararComentariosJs(ler(CAMINHO_MODULO_DAS_ACOES));
      /* `Array` sai da mira pelo nome: `Array.from` é a construção do esqueleto
         da listagem, e não uma seleção de tabela. Sem a exceção, a asserção
         acusaria a própria tela que ela existe para proteger — e uma asserção
         que grita sem motivo acaba desligada. */
      const escritaCrua =
        /(?<!Array)\.from\s*\(|createClient|\.delete\s*\(|\.update\s*\(|\bfetch\s*\(/;
      afirmar(
        "a listagem exclui e destaca pela CAMADA — ela não fala com o banco nem com a rede por conta própria",
        !escritaCrua.test(codigo) &&
          !escritaCrua.test(puro) &&
          /from "@\/data\/blog\/escrita"/.test(ler(CAMINHO_LISTA)),
        (escritaCrua.exec(`${codigo}${puro}`) ?? [])[0] ?? "",
      );
      afirmar(
        "e o detector acusa uma escrita crua de verdade, sem confundi-la com `Array.from`",
        escritaCrua.test('cliente.from("posts").delete()') &&
          escritaCrua.test("await fetch(rota)") &&
          !escritaCrua.test("Array.from({ length: 4 }, (_, i) => i)"),
      );
    }

    /* ─── (n) A PRÉ-VISUALIZAÇÃO (Story 2.13) ─────────────────────────── */

    secao("(n) a pré-visualização: o que se vê é o que sairá");

    const previa = modulo.regrasDaPrevia ?? null;
    const rotas = modulo.regrasDasRotas ?? null;

    afirmar(
      "`previa.js` é módulo próprio e chega ao pacote — as frases e as situações são executáveis, não JSX lido",
      previa !== null &&
        typeof previa.falaDaSituacao === "function" &&
        typeof previa.situacaoDoErro === "function" &&
        typeof previa.aplicarNoindex === "function",
    );
    afirmar(
      "e os ENDEREÇOS moram em `rotas.js`, não no módulo da tela — vocabulário compartilhado não pende de uma superfície só",
      rotas !== null &&
        typeof rotas.enderecoDaPrevia === "function" &&
        typeof rotas.ehIdentificadorDePost === "function" &&
        /* A seta aponta para o vocabulário, e não o contrário: se `rotas.js`
           importasse a tela, o módulo que a listagem e o Editor consultam
           passaria a depender de uma superfície. */
        !/from\s+["']@\/admin\/blog\/previa["']/.test(ler(CAMINHO_MODULO_DAS_ROTAS)) &&
        /from\s+["']@\/admin\/blog\/rotas["']/.test(ler(CAMINHO_MODULO_DAS_ACOES)),
      "acoes.js precisa ler os endereços de rotas.js, e rotas.js não pode conhecer a tela",
    );

    if (previa && rotas) {
      /* ── As regras puras, EXECUTADAS ────────────────────────────────── */
      afirmar(
        "a rota da prévia é RELATIVA ao pai `/admin` — é isso que a faz nascer dentro do portão, e não ao lado dele",
        rotas.ROTA_DA_PREVIA === "previa/:id" &&
          !rotas.ROTA_DA_PREVIA.startsWith("/") &&
          rotas.BASE_DO_PAINEL === "/admin" &&
          rotas.ROTA_DESCONHECIDA === "*",
        `${rotas.BASE_DO_PAINEL} + ${rotas.ROTA_DA_PREVIA}`,
      );
      afirmar(
        "erro tipado vira situação da tela, e as QUATRO são DISTINTAS — ausência, permissão, falha que passa e falha que fica",
        previa.situacaoDoErro({ tipo: "nao_encontrado" }) === previa.SITUACAO_AUSENTE &&
          previa.situacaoDoErro({ tipo: "permissao" }) === previa.SITUACAO_SEM_PERMISSAO &&
          previa.situacaoDoErro({ tipo: "rede" }) === previa.SITUACAO_FALHA &&
          previa.situacaoDoErro({ tipo: "configuracao" }) ===
            previa.SITUACAO_FALHA_PERMANENTE &&
          previa.situacaoDoErro({ tipo: "inesperado" }) ===
            previa.SITUACAO_FALHA_PERMANENTE &&
          previa.situacaoDoErro(null) === previa.SITUACAO_FALHA_PERMANENTE &&
          new Set(previa.SITUACOES_SEM_ARTIGO).size === 4,
        previa.SITUACOES_SEM_ARTIGO.join(", "),
      );
      /* A LEITURA É POR LISTA DE PERMISSÃO: tipo desconhecido não vira falha de
         rede com um botão que promete o que não pode cumprir. */
      afirmar(
        "tipo de erro desconhecido cai na falha PERMANENTE, e não na que oferece repetir",
        ["quem-sabe", "", undefined, 42].every(
          (tipo) =>
            previa.situacaoDoErro({ tipo }) === previa.SITUACAO_FALHA_PERMANENTE,
        ),
        String(previa.situacaoDoErro({ tipo: "quem-sabe" })),
      );
      /* ─── A ORDEM DOS RAMOS É REGRA, E ELA É EXECUTÁVEL ──────────────
         Um identificador ruim que chega por NAVEGAÇÃO encontra `carregando`
         ainda ligado do endereço anterior. Com `carregando` julgado primeiro, a
         tela desenha o esqueleto de uma leitura que nunca vai sair — e o quadro
         em que isso acontece é curto demais para qualquer asserção de DOM
         pegar: o `act` do React descarrega o efeito antes de a leitura da tela
         acontecer. Medido: com a ordem invertida, a montagem continuava verde.
         Por isso a derivação saiu do ternário do JSX e virou tabela. */
      afirmar(
        "identificador inválido vence `carregando` na derivação — a combinação que a navegação produz não vira esqueleto eterno",
        previa.situacaoDaTela({ valido: false, carregando: true }) ===
          previa.SITUACAO_AUSENTE &&
          previa.situacaoDaTela({ valido: false, carregando: true, post: { id: 1 } }) ===
            previa.SITUACAO_AUSENTE &&
          previa.situacaoDaTela({ valido: false, carregando: false }) ===
            previa.SITUACAO_AUSENTE,
        String(previa.situacaoDaTela({ valido: false, carregando: true })),
      );
      afirmar(
        "e a tabela cobre as outras combinações: espera, erro tipado, pronta e ausência por resposta vazia",
        previa.situacaoDaTela({ valido: true, carregando: true }) ===
          previa.SITUACAO_CARREGANDO &&
          previa.situacaoDaTela({ valido: true, erro: { tipo: "permissao" } }) ===
            previa.SITUACAO_SEM_PERMISSAO &&
          previa.situacaoDaTela({ valido: true, post: { id: 1 } }) ===
            previa.SITUACAO_PRONTA &&
          previa.situacaoDaTela({ valido: true }) === previa.SITUACAO_AUSENTE &&
          previa.situacaoDaTela() === previa.SITUACAO_AUSENTE,
        String(previa.situacaoDaTela({ valido: true, carregando: true })),
      );
      /* E O ERRO VENCE O POST ANTIGO: uma releitura que falha não pode deixar na
         tela o artigo da leitura anterior como se ainda valesse. */
      afirmar(
        "erro vence post antigo — releitura que falha não deixa o artigo velho na tela como se ainda valesse",
        previa.situacaoDaTela({
          valido: true,
          erro: { tipo: "rede" },
          post: { id: 1 },
        }) === previa.SITUACAO_FALHA,
      );

      /* ─── O ESTADO INICIAL, PELO MESMO MOTIVO ────────────────────────
         Nascer `false` com identificador VÁLIDO faz o primeiro quadro dizer
         "este post não existe" sobre um Post que está sendo lido naquele
         instante — e o `act` descarrega o efeito antes de a tela ser lida, então
         a montagem não vê. Medido: a sabotagem passava verde. */
      afirmar(
        "a tela só nasce esperando quando HÁ o que esperar — e nasce esperando quando há",
        previa.nasceCarregando(true) === true &&
          previa.nasceCarregando(false) === false &&
          previa.nasceCarregando(undefined) === false &&
          previa.nasceCarregando("sim") === false,
        String(previa.nasceCarregando(true)),
      );
      afirmar(
        "e é essa função que a tela usa como estado inicial — um literal ali reabriria o engano sem ninguém acusar",
        /useState\(\s*\(\)\s*=>\s*nasceCarregando\(valido\)\s*\)/.test(ler(CAMINHO_PREVIA)),
        (/const \[carregando[^;]*;/.exec(ler(CAMINHO_PREVIA)) ?? [])[0] ?? "",
      );
      afirmar(
        "e a derivação da situação também vem do módulo — nenhum ternário de ramos na tela",
        /situacaoDaTela\(\{\s*valido,\s*carregando,\s*erro,\s*post\s*\}\)/.test(
          ler(CAMINHO_PREVIA),
        ),
        (/const situacao[^;]*;/.exec(ler(CAMINHO_PREVIA)) ?? [])[0] ?? "",
      );

      afirmar(
        "cada situação diz o que houve E o que fazer, e só oferece repetir onde repetir pode dar certo",
        previa.SITUACOES_SEM_ARTIGO.every((s) => {
          const fala = previa.falaDaSituacao(s);
          return (
            typeof fala.oQueHouve === "string" &&
            fala.oQueHouve.trim() !== "" &&
            typeof fala.oQueFazer === "string" &&
            fala.oQueFazer.trim() !== ""
          );
        }) &&
          previa.falaDaSituacao(previa.SITUACAO_FALHA).repetir === true &&
          previa.falaDaSituacao(previa.SITUACAO_AUSENTE).repetir === false &&
          previa.falaDaSituacao(previa.SITUACAO_SEM_PERMISSAO).repetir === false &&
          previa.falaDaSituacao(previa.SITUACAO_FALHA_PERMANENTE).repetir === false,
        JSON.stringify(previa.falaDaSituacao(previa.SITUACAO_AUSENTE)),
      );
      /* E AS DUAS FALHAS DIZEM COISAS DIFERENTES. A permanente não pode culpar
         a conexão: manda procurar o problema no lugar errado. */
      afirmar(
        "a falha permanente não MANDA conferir a conexão nem tentar de novo — a de rede é que faz isso",
        !/\b(confira|verifique|tente|recarregue)\b/i.test(
          previa.falaDaSituacao(previa.SITUACAO_FALHA_PERMANENTE).oQueFazer,
        ) &&
          /conex[ãa]o/i.test(previa.falaDaSituacao(previa.SITUACAO_FALHA).oQueFazer) &&
          previa.falaDaSituacao(previa.SITUACAO_FALHA_PERMANENTE).oQueHouve !==
            previa.falaDaSituacao(previa.SITUACAO_FALHA).oQueHouve,
        previa.falaDaSituacao(previa.SITUACAO_FALHA_PERMANENTE).oQueFazer,
      );
      afirmar(
        "e situação fora da lista fechada FALHA ALTO — objeto neutro produziria a tela em branco que esta story existe para impedir",
        tentar(
          "falaDaSituacao com situação inventada",
          () => {
            try {
              previa.falaDaSituacao("quase-la");
              return false;
            } catch {
              return true;
            }
          },
          false,
        ),
      );
      if (voz) {
        afirmar(
          "as frases das situações passam pelas guardas de voz — o que houve é fato, o que fazer tem saída",
          previa.SITUACOES_SEM_ARTIGO.every((s) => {
            const fala = previa.falaDaSituacao(s);
            return (
              voz.diagnosticarMensagem("o que houve", fala.oQueHouve) === null &&
              voz.diagnosticarMensagem("o que fazer", fala.oQueFazer) === null
            );
          }) &&
            voz.diagnosticarRotuloDeAcao(previa.ROTULO_DE_VOLTAR) === null &&
            voz.diagnosticarRotuloDeAcao(previa.ROTULO_DE_REPETIR) === null,
          `${previa.ROTULO_DE_VOLTAR} | ${previa.ROTULO_DE_REPETIR}`,
        );
        /* ─── E O RESTO DO VOCABULÁRIO NOVO TAMBÉM ────────────────────
           Meia cobertura é o mesmo que nenhuma para o que ficou de fora: as
           frases que a tela DIZ — o aviso permanente, o artigo vazio, o
           anúncio de carregamento, o título da tela e o detalhe da ausência —
           passam pelas mesmas guardas que as das situações. */
        {
          const frases = [
            ["AVISO_DA_PREVIA", previa.AVISO_DA_PREVIA],
            ["AVISO_DE_PENDENCIA", previa.AVISO_DE_PENDENCIA],
            ["ARTIGO_VAZIO", previa.ARTIGO_VAZIO],
            ["TEXTO_DE_CARREGANDO", previa.TEXTO_DE_CARREGANDO],
            ["TITULO_DA_TELA", previa.TITULO_DA_TELA],
            ["DETALHE_DE_IDENTIFICADOR_INVALIDO", previa.DETALHE_DE_IDENTIFICADOR_INVALIDO],
          ];
          const reprovadas = frases.filter(
            ([, frase]) => voz.diagnosticarMensagem("o que houve", frase) !== null,
          );
          afirmar(
            "e as SEIS frases restantes da tela passam pelas mesmas guardas — meia cobertura é nenhuma para o que ficou de fora",
            reprovadas.length === 0 &&
              frases.every(([, frase]) => typeof frase === "string" && frase.trim() !== ""),
            reprovadas
              .map(([nome, frase]) => `${nome}: ${voz.diagnosticarMensagem("o que houve", frase)}`)
              .join(" | "),
          );
        }
      }

      /* ── A TELA, MONTADA ────────────────────────────────────────────── */
      const roteador = await tentar(
        "`react-router-dom` importa para montar a rota da prévia",
        () => import("react-router-dom"),
        null,
      );

      /** Monta a prévia no endereço pedido, com a rota declarada pelo módulo. */
      /* AS ROTAS FILHAS SÃO AS DE `main.jsx`, inclusive a apanha-tudo: sem ela,
         `/admin/previa` sem identificador e `/admin/qualquer-coisa` não casam
         com filha nenhuma, o `Outlet` fica vazio e o Autor recebe página em
         branco. Montar só a rota feliz esconderia exatamente esse buraco. */
      const filhasDoPainel = () => [
        React.createElement(roteador.Route, {
          key: "previa",
          path: `${rotas.BASE_DO_PAINEL}/${rotas.ROTA_DA_PREVIA}`,
          element: React.createElement(modulo.PreVisualizacaoDePost),
        }),
        React.createElement(roteador.Route, {
          key: "desconhecida",
          path: `${rotas.BASE_DO_PAINEL}/${rotas.ROTA_DESCONHECIDA}`,
          element: React.createElement(modulo.PreVisualizacaoDePost),
        }),
      ];

      /** Monta a prévia. `endereco` é absoluto; `identificador` é o atalho. */
      const montarPreviaEm = async (endereco) => {
        const alvo = janela.document.createElement("div");
        janela.document.body.appendChild(alvo);
        const reclamacoes = [];
        const erroOriginal = console.error;
        console.error = (...partes) => reclamacoes.push(partes.join(" "));

        const raizReact = createRoot(alvo);
        /* O PILOTO existe para navegar DE VERDADE. `initialEntries` só vale na
           primeira montagem: redesenhar o roteador com outro endereço não
           navega, e uma asserção escrita assim provaria que nada aconteceu.
           Ele fica fora de `Routes` e não desenha nada. */
        let navegar = null;
        const Piloto = () => {
          navegar = roteador.useNavigate();
          return null;
        };
        const desenhar = (onde) =>
          React.createElement(
            roteador.MemoryRouter,
            { initialEntries: [onde] },
            React.createElement(Piloto, { key: "piloto" }),
            React.createElement(roteador.Routes, { key: "rotas" }, ...filhasDoPainel()),
          );
        await act(async () => {
          raizReact.render(desenhar(endereco));
        });
        return {
          alvo,
          reclamacoes,
          raiz: () => alvo.querySelector('[data-tela="previa"]'),
          situacao: () =>
            alvo.querySelector('[data-tela="previa"]')?.getAttribute("data-situacao") ?? null,
          artigo: () => alvo.querySelector('[data-papel="artigo"]'),
          artigoVazio: () => alvo.querySelector('[data-papel="artigo-vazio"]'),
          esqueleto: () => alvo.querySelector('[data-papel="esqueleto"]'),
          aviso: () =>
            (alvo.querySelector('[data-papel="aviso-da-previa"]')?.textContent ?? "").trim(),
          avisoDePendencia: () =>
            alvo.querySelector('[data-papel="aviso-de-pendencia"]'),
          resumo: () =>
            (alvo.querySelector('[data-papel="resumo"]')?.textContent ?? "").trim(),
          voltar: () => alvo.querySelector('[data-acao="voltar"]'),
          repetir: () => alvo.querySelector('[data-acao="repetir"]'),
          oQueHouve: () =>
            (alvo.querySelector('[data-papel="o-que-houve"]')?.textContent ?? "").trim(),
          oQueFazer: () =>
            (alvo.querySelector('[data-papel="o-que-fazer"]')?.textContent ?? "").trim(),
          detalhe: () =>
            (alvo.querySelector('[data-papel="detalhe"]')?.textContent ?? "").trim(),
          texto: () => alvo.textContent ?? "",
          /* NAVEGAR SEM DESMONTAR. É o caminho que revela a ordem dos ramos:
             um identificador ruim que chega por navegação, com `carregando`
             ainda `true` do render anterior, mostraria o esqueleto de uma
             leitura que nunca vai sair. */
          async irPara(outro) {
            await act(async () => {
              navegar(outro);
            });
          },
          async clicar(elemento) {
            await act(async () => {
              elemento.dispatchEvent(new janela.MouseEvent("click", { bubbles: true }));
            });
          },
          async desmontar() {
            console.error = erroOriginal;
            await act(async () => raizReact.unmount());
            alvo.remove();
          },
        };
      };

      const montarPrevia = (identificador) =>
        montarPreviaEm(
          `${rotas.BASE_DO_PAINEL}/${rotas.SEGMENTO_DA_PREVIA}/${identificador}`,
        );

      if (roteador) {
        const ID_DA_PREVIA = "77777777-8888-4999-8aaa-bbbbbbbbbbbb";

        /* ── O QUE SE VÊ É O QUE SAIRÁ ────────────────────────────────
           O documento e o HTML gravado DIVERGEM de propósito. É a única
           forma de distinguir "mostra o gravado" de "rederiva na hora":
           enquanto os dois coincidem, as duas implementações passam. */
        const TEXTO_GRAVADO = "ISTO VEIO DO CONTEUDO GRAVADO";
        const TEXTO_DERIVADO = "ISTO SERIA DERIVADO AGORA";
        const documentoDivergente = {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: TEXTO_DERIVADO }] },
          ],
        };
        const postDaPrevia = {
          id: ID_DA_PREVIA,
          slug: "",
          titulo: "Rascunho em conferência",
          resumo: "O resumo do rascunho",
          estado: "rascunho",
          conteudo: documentoDivergente,
          conteudo_html: `<h2>${TEXTO_GRAVADO}</h2><p>corpo do artigo</p>`,
          publicado_em: null,
          atualizado_em: "2027-03-10T12:00:00.000Z",
        };

        {
          modulo.controle.aoLerPost = null;
          modulo.controle.pedidos_de_post = [];
          modulo.controle.post = { ok: true, dados: postDaPrevia };
          const tela = await montarPrevia(ID_DA_PREVIA);

          afirmar(
            "a prévia abre o Post PELO IDENTIFICADOR — é o que o rascunho tem desde que nasce, e o endereço ele pode não ter",
            igual(modulo.controle.pedidos_de_post, [ID_DA_PREVIA]) &&
              tela.situacao() === previa.SITUACAO_PRONTA,
            `pedidos: ${JSON.stringify(modulo.controle.pedidos_de_post)} | situação: ${tela.situacao()}`,
          );

          afirmar(
            "o artigo está dentro da classe global `.artigo` — a MESMA que o Editor veste e que o site vestirá",
            /(^|\s)artigo(\s|$)/.test(tela.artigo()?.className ?? ""),
            `classe: ${tela.artigo()?.className}`,
          );

          afirmar(
            "e o HTML mostrado é o GRAVADO, não um derivado na hora — a promessa é o que sairá, não o que o renderizador de hoje produziria",
            (tela.artigo()?.innerHTML ?? "").includes(TEXTO_GRAVADO) &&
              !tela.texto().includes(TEXTO_DERIVADO),
            (tela.artigo()?.innerHTML ?? "").slice(0, 160),
          );

          /* AUTOTESTE da divergência: se o renderizador produzisse o mesmo
             texto do gravado, a asserção acima passaria por acidente. */
          if (modulo.renderizador) {
            const derivado = modulo.renderizador.htmlDoDocumento(documentoDivergente);
            afirmar(
              "e a prova não passa por acidente: rederivar o documento produziria um texto DIFERENTE do gravado",
              derivado.includes(TEXTO_DERIVADO) && !derivado.includes(TEXTO_GRAVADO),
              derivado.slice(0, 160),
            );
          }

          afirmar(
            "a tela não IMPORTA o renderizador — derivar em tempo de leitura é impossível, não apenas evitado",
            !/from\s+["']@\/render\//.test(ler(CAMINHO_PREVIA)) &&
              !/htmlDoDocumento/.test(mascararComentariosJs(ler(CAMINHO_PREVIA))),
            "a prévia mostra a projeção gravada na mesma transação",
          );

          /* O ARTIGO É MOSTRADO SOBRE O FUNDO DO SITE, e não o do Painel.
             "O que se vê é o que sairá" não vale só para o texto: o par
             texto/fundo é o que decide contraste, e é o motivo de `.artigo` ser
             global. A raiz desta tela é `.painel`, onde `--background` resolve
             OUTRO valor — pintar o artigo com ele o mostraria sobre um fundo que
             o site nunca usa. O par em si é medido em `verificar:artigo`. */
          afirmar(
            "o artigo é pintado com o token que `.painel` NÃO remapeia — o par texto/fundo é o mesmo que o visitante verá",
            (tela.artigo()?.closest(`.${previa.CLASSE_DO_FUNDO_DO_ARTIGO}`) ?? null) !==
              null,
            `classe esperada: ${previa.CLASSE_DO_FUNDO_DO_ARTIGO}`,
          );

          afirmar(
            "o Estado aparece por extenso, e a volta para a listagem existe",
            tela.raiz()?.querySelector("[data-estado]")?.getAttribute("data-estado") ===
              "rascunho" &&
              tela.voltar()?.getAttribute("href") === rotas.BASE_DO_PAINEL,
            `estado: ${tela.raiz()?.querySelector("[data-estado]")?.getAttribute("data-estado")} | volta: ${tela.voltar()?.getAttribute("href")}`,
          );

          /* O RESUMO É PARTE DO QUE SAI, e a prévia existe para conferir o que
             sai. Sem esta linha, apagá-lo do JSX ficaria verde. */
          afirmar(
            "o resumo gravado aparece na prévia — ele também é conteúdo que vai ao ar",
            tela.resumo() === postDaPrevia.resumo,
            tela.resumo(),
          );

          /* O AVISO PERMANENTE é a ÚNICA marca que distingue esta página do
             site publicado. Sem asserção, apagá-lo fica verde — e alguém confere
             um rascunho, vê a página bonita e conclui que já está no ar. */
          afirmar(
            "o aviso permanente diz que isto é uma prévia sob o Painel — é a única marca que a distingue do site",
            tela.aviso() === previa.AVISO_DA_PREVIA && previa.AVISO_DA_PREVIA.trim() !== "",
            tela.aviso(),
          );
          /* E ele não é do ramo feliz: aparece TAMBÉM quando não há artigo. */
          afirmar(
            "e ele aparece mesmo quando não há artigo nenhum na tela",
            await (async () => {
              modulo.controle.post = {
                ok: false,
                erro: { tipo: "nao_encontrado", mensagem: "sumiu" },
              };
              const outra = await montarPrevia(ID_DA_PREVIA);
              const visto = outra.aviso();
              await outra.desmontar();
              modulo.controle.post = { ok: true, dados: postDaPrevia };
              return visto === previa.AVISO_DA_PREVIA;
            })(),
          );

          /* SEM PENDÊNCIA DECLARADA, o aviso de versão antiga NÃO aparece: um
             alarme que aparece sempre é ignorado em duas semanas. */
          afirmar(
            "sem o aviso de pendência no endereço, a tela não inventa um — alarme que aparece sempre é treinado a ser ignorado",
            tela.avisoDePendencia() === null,
          );

          afirmar(
            "o React não reclamou ao desenhar a prévia",
            tela.reclamacoes.length === 0,
            tela.reclamacoes.slice(0, 2).join(" | ").slice(0, 300),
          );

          /* ── `noindex`, a SEGUNDA camada ───────────────────────────── */
          {
            const meta = janela.document.querySelector('meta[name="robots"]');
            afirmar(
              "a prévia declara `noindex` no documento ao montar — a segunda voz, dizendo o mesmo que o cabeçalho",
              meta?.getAttribute("content") === previa.VALOR_DE_NOINDEX,
              `meta: ${meta?.getAttribute("content") ?? "ausente"}`,
            );
          }

          await tela.desmontar();

          afirmar(
            "e ela DESFAZ ao sair: a prévia é uma tela, não uma mudança permanente no documento",
            janela.document.querySelector('meta[name="robots"]') === null,
            String(
              janela.document.querySelector('meta[name="robots"]')?.getAttribute("content"),
            ),
          );
        }

        /* A meta que o `index.html` serve para TODA rota é reescrita, e não
           duplicada: duas diretivas contraditórias no mesmo documento é algo
           que cada rastreador resolve do seu jeito. */
        {
          const metaDoSite = janela.document.createElement("meta");
          metaDoSite.setAttribute("name", "robots");
          metaDoSite.setAttribute("content", "index, follow");
          janela.document.head.appendChild(metaDoSite);

          modulo.controle.pedidos_de_post = [];
          const tela = await montarPrevia(ID_DA_PREVIA);
          const metas = [...janela.document.querySelectorAll('meta[name="robots"]')];
          afirmar(
            "a meta do site é REESCRITA, e não duplicada — duas diretivas contraditórias cada rastreador resolve do seu jeito",
            metas.length === 1 && metas[0].getAttribute("content") === previa.VALOR_DE_NOINDEX,
            metas.map((m) => m.getAttribute("content")).join(" | "),
          );
          await tela.desmontar();
          afirmar(
            "e o valor ANTERIOR volta ao sair — a prévia não reescreve o documento do site inteiro",
            janela.document.querySelector('meta[name="robots"]')?.getAttribute("content") ===
              "index, follow",
            String(
              janela.document.querySelector('meta[name="robots"]')?.getAttribute("content"),
            ),
          );
          metaDoSite.remove();
        }

        /* ── IDENTIFICADOR FORA DO FORMATO: ausência SEM pedido ───────── */
        {
          modulo.controle.pedidos_de_post = [];
          modulo.controle.post = { ok: true, dados: postDaPrevia };
          const tela = await montarPrevia("nao-e-um-uuid");
          afirmar(
            "identificador fora do formato vira AUSÊNCIA e NENHUM pedido sai para a rede — o que o banco não pôde emitir não vira consulta",
            tela.situacao() === previa.SITUACAO_AUSENTE &&
              modulo.controle.pedidos_de_post.length === 0,
            `situação: ${tela.situacao()} | pedidos: ${modulo.controle.pedidos_de_post.length}`,
          );
          afirmar(
            "e ela DIZ que foi isso — “não achamos” e “não havia o que procurar” não são a mesma frase",
            tela.detalhe() === previa.DETALHE_DE_IDENTIFICADOR_INVALIDO &&
              tela.oQueHouve() ===
                previa.falaDaSituacao(previa.SITUACAO_AUSENTE).oQueHouve,
            `${tela.oQueHouve()} | ${tela.detalhe()}`,
          );
          afirmar(
            "e a volta continua oferecida, com repetir ausente — Post que não existe não passa a existir por insistência",
            tela.voltar()?.getAttribute("href") === rotas.BASE_DO_PAINEL &&
              tela.repetir() === null,
            `volta: ${tela.voltar()?.getAttribute("href")} | repetir: ${tela.repetir() !== null}`,
          );
          await tela.desmontar();
        }

        /* ── POST INEXISTENTE: ausência com a volta ───────────────────── */
        {
          modulo.controle.pedidos_de_post = [];
          modulo.controle.post = {
            ok: false,
            erro: { tipo: "nao_encontrado", mensagem: "Este post não foi encontrado." },
          };
          const tela = await montarPrevia(ID_DA_PREVIA);
          afirmar(
            "identificador bem-formado que não existe vira AUSÊNCIA — e o pedido SAIU, que é a diferença do caso anterior",
            tela.situacao() === previa.SITUACAO_AUSENTE &&
              modulo.controle.pedidos_de_post.length === 1 &&
              tela.artigo() === null,
            `situação: ${tela.situacao()} | pedidos: ${modulo.controle.pedidos_de_post.length}`,
          );
          afirmar(
            "ela diz o que houve, o que fazer, e oferece a volta — nunca tela em branco",
            tela.oQueHouve() !== "" &&
              tela.oQueFazer() !== "" &&
              tela.voltar()?.getAttribute("href") === rotas.BASE_DO_PAINEL,
            `${tela.oQueHouve()} | ${tela.oQueFazer()}`,
          );
          await tela.desmontar();
        }

        /* ── FALTA DE PERMISSÃO: outra tela, outra saída ──────────────── */
        {
          modulo.controle.pedidos_de_post = [];
          modulo.controle.post = {
            ok: false,
            erro: { tipo: "permissao", mensagem: "Entre de novo para continuar." },
          };
          const tela = await montarPrevia(ID_DA_PREVIA);
          afirmar(
            "falta de permissão é uma tela PRÓPRIA, e não “não encontrado” — quem perdeu a sessão precisa saber que é isso",
            tela.situacao() === previa.SITUACAO_SEM_PERMISSAO &&
              tela.oQueHouve() ===
                previa.falaDaSituacao(previa.SITUACAO_SEM_PERMISSAO).oQueHouve &&
              tela.oQueHouve() !==
                previa.falaDaSituacao(previa.SITUACAO_AUSENTE).oQueHouve,
            `${tela.situacao()} | ${tela.oQueHouve()}`,
          );
          afirmar(
            "e a frase TIPADA da camada chega à tela — ela já diz o que fazer, e trocá-la por uma genérica apagaria a única informação útil",
            tela.detalhe() === "Entre de novo para continuar.",
            tela.detalhe(),
          );
          await tela.desmontar();
        }

        /* ── FALHA DE LEITURA: erro com repetir, que RELÊ ─────────────── */
        {
          modulo.controle.pedidos_de_post = [];
          modulo.controle.post = {
            ok: false,
            erro: { tipo: "rede", mensagem: "Não conseguimos falar com o servidor." },
          };
          const tela = await montarPrevia(ID_DA_PREVIA);
          afirmar(
            "falha de leitura vira ERRO que diz o que houve e o que fazer, com repetir — e nunca tela em branco",
            tela.situacao() === previa.SITUACAO_FALHA &&
              tela.raiz()?.querySelector('[role="alert"]') !== null &&
              tela.oQueHouve() !== "" &&
              tela.oQueFazer() !== "" &&
              tela.repetir() !== null,
            `${tela.situacao()} | repetir: ${tela.repetir() !== null}`,
          );

          /* O botão precisa REFAZER a leitura. Sem esta linha ele é enfeite:
             um `useEffect` sem dependência que mude não roda outra vez. */
          modulo.controle.post = { ok: true, dados: postDaPrevia };
          await tela.clicar(tela.repetir());
          afirmar(
            "e repetir RELÊ de verdade: o segundo pedido sai, e a tela passa a mostrar o artigo",
            modulo.controle.pedidos_de_post.length === 2 &&
              tela.situacao() === previa.SITUACAO_PRONTA &&
              (tela.artigo()?.innerHTML ?? "").includes(TEXTO_GRAVADO),
            `pedidos: ${modulo.controle.pedidos_de_post.length} | situação: ${tela.situacao()}`,
          );
          await tela.desmontar();
        }

        /* ── CARREGANDO: o esqueleto que ninguém observava ────────────── */
        {
          let liberar = null;
          modulo.controle.pedidos_de_post = [];
          modulo.controle.aoLerPost = () =>
            new Promise((resolve) => {
              liberar = resolve;
            });
          const tela = await montarPrevia(ID_DA_PREVIA);

          afirmar(
            "enquanto a leitura corre, a tela mostra o ESQUELETO e anuncia o que está acontecendo — nunca tela em branco",
            tela.situacao() === previa.SITUACAO_CARREGANDO &&
              tela.esqueleto() !== null &&
              tela.artigo() === null &&
              tela.texto().includes(previa.TEXTO_DE_CARREGANDO),
            `situação: ${tela.situacao()} | esqueleto: ${tela.esqueleto() !== null}`,
          );
          /* SABOTAGEM QUE ESTA LINHA PEGA: nascer `false` em vez de `valido`
             faria o primeiro render de um identificador VÁLIDO dizer "Este post
             não existe" — a tela afirmando o oposto do que está acontecendo. */
          afirmar(
            "e ela NÃO diz “não existe” antes de a resposta chegar — ausência e espera são coisas diferentes",
            tela.oQueHouve() === "" &&
              tela.situacao() !== previa.SITUACAO_AUSENTE,
            tela.oQueHouve(),
          );

          await act(async () => {
            liberar({ ok: true, dados: postDaPrevia });
          });
          afirmar(
            "e quando a resposta chega o esqueleto sai e o artigo entra",
            tela.situacao() === previa.SITUACAO_PRONTA &&
              tela.esqueleto() === null &&
              (tela.artigo()?.innerHTML ?? "").includes(TEXTO_GRAVADO),
            `situação: ${tela.situacao()}`,
          );
          modulo.controle.aoLerPost = null;
          await tela.desmontar();
        }

        /* ── POST SEM CORPO GRAVADO: o rascunho recém-criado ──────────── */
        {
          modulo.controle.pedidos_de_post = [];
          modulo.controle.post = {
            ok: true,
            dados: { ...postDaPrevia, conteudo_html: "" },
          };
          const tela = await montarPrevia(ID_DA_PREVIA);
          afirmar(
            "Post sem corpo gravado mostra o que fazer, e NÃO injeta um artigo vazio — é o caso do rascunho recém-criado",
            tela.situacao() === previa.SITUACAO_PRONTA &&
              tela.artigo() === null &&
              (tela.artigoVazio()?.textContent ?? "").trim() === previa.ARTIGO_VAZIO,
            `artigo: ${tela.artigo() !== null} | aviso: ${(tela.artigoVazio()?.textContent ?? "").trim()}`,
          );
          afirmar(
            "e o título continua na tela — o Post existe, o que falta é o corpo",
            tela.texto().includes(postDaPrevia.titulo),
          );
          modulo.controle.post = { ok: true, dados: postDaPrevia };
          await tela.desmontar();
        }

        /* ── ALTERAÇÕES NÃO SALVAS: a prévia diz que mostra o gravado ─── */
        {
          modulo.controle.pedidos_de_post = [];
          const comAviso = await montarPreviaEm(
            `${rotas.enderecoDaPreviaDeId(ID_DA_PREVIA, { pendente: true })}`,
          );
          afirmar(
            "aberta com alterações pendentes, a prévia DIZ que mostra a última versão gravada — senão o Autor confere o texto errado achando ser o dele",
            (comAviso.avisoDePendencia()?.textContent ?? "").trim() ===
              previa.AVISO_DE_PENDENCIA &&
              comAviso.situacao() === previa.SITUACAO_PRONTA,
            String(comAviso.avisoDePendencia()?.textContent),
          );
          await comAviso.desmontar();
        }

        /* ── ENDEREÇO DESCONHECIDO SOB O PAINEL ───────────────────────── */
        {
          for (const endereco of [
            `${rotas.BASE_DO_PAINEL}/${rotas.SEGMENTO_DA_PREVIA}`,
            `${rotas.BASE_DO_PAINEL}/qualquer-coisa`,
            `${rotas.BASE_DO_PAINEL}/${rotas.SEGMENTO_DA_PREVIA}/${ID_DA_PREVIA}/demais`,
          ]) {
            modulo.controle.pedidos_de_post = [];
            const tela = await montarPreviaEm(endereco);
            afirmar(
              `“${endereco}” cai na tela de ausência, e não em página em branco`,
              tela.raiz() !== null &&
                tela.situacao() === previa.SITUACAO_AUSENTE &&
                tela.oQueHouve() !== "" &&
                tela.voltar()?.getAttribute("href") === rotas.BASE_DO_PAINEL &&
                modulo.controle.pedidos_de_post.length === 0,
              `situação: ${tela.situacao()} | pedidos: ${modulo.controle.pedidos_de_post.length}`,
            );
            await tela.desmontar();
          }
        }

        /* ── TROCAR DE ENDEREÇO SEM DESMONTAR ─────────────────────────── */
        {
          modulo.controle.pedidos_de_post = [];
          modulo.controle.post = { ok: true, dados: postDaPrevia };
          const tela = await montarPrevia(ID_DA_PREVIA);
          const antes = tela.situacao();
          await tela.irPara(`${rotas.BASE_DO_PAINEL}/${rotas.SEGMENTO_DA_PREVIA}/lixo`);
          afirmar(
            "trocar para um identificador ruim SEM desmontar vira ausência na hora — e não o esqueleto de uma leitura que nunca vai sair",
            antes === previa.SITUACAO_PRONTA &&
              tela.situacao() === previa.SITUACAO_AUSENTE &&
              tela.esqueleto() === null &&
              tela.detalhe() === previa.DETALHE_DE_IDENTIFICADOR_INVALIDO &&
              modulo.controle.pedidos_de_post.length === 1,
            `antes: ${antes} | depois: ${tela.situacao()} | pedidos: ${modulo.controle.pedidos_de_post.length}`,
          );
          await tela.desmontar();
        }

        /* ── A CAMADA REJEITANDO: promessa quebrada não é tela em branco ─ */
        {
          /* A rede de proteção é da FERRAMENTA, não do produto: sem tratamento
             na tela, a promessa recusada vira rejeição não tratada e o Node
             derruba o processo inteiro. Derrubar a execução esconde a falha
             atrás de uma pilha, quando o que se quer é uma linha vermelha
             dizendo qual asserção caiu. */
          const rejeicoes = [];
          const guarda = (motivo) => rejeicoes.push(motivo);
          process.on("unhandledRejection", guarda);

          modulo.controle.pedidos_de_post = [];
          modulo.controle.aoLerPost = () =>
            Promise.reject(new Error("a camada quebrou o contrato"));
          const tela = await montarPrevia(ID_DA_PREVIA);
          afirmar(
            "leitura que REJEITA vira falha permanente que diz o que houve — e não um esqueleto girando para sempre",
            tela.situacao() === previa.SITUACAO_FALHA_PERMANENTE &&
              tela.esqueleto() === null &&
              tela.oQueHouve() ===
                previa.falaDaSituacao(previa.SITUACAO_FALHA_PERMANENTE).oQueHouve &&
              tela.oQueFazer() !== "" &&
              tela.repetir() === null,
            `situação: ${tela.situacao()}`,
          );
          afirmar(
            "e a mensagem da exceção chega à tela como detalhe — quem for avisar precisa ter o que dizer",
            tela.detalhe().includes("a camada quebrou o contrato"),
            tela.detalhe(),
          );
          afirmar(
            "e a rejeição foi TRATADA pela tela: nenhuma sobrou solta para o processo",
            rejeicoes.length === 0,
            rejeicoes.map((r) => String(r?.message ?? r)).join(" | "),
          );
          process.off("unhandledRejection", guarda);
          modulo.controle.aoLerPost = null;
          await tela.desmontar();
        }

        /* ── O LINK DO SITE APONTA PARA O ENDEREÇO GRAVADO ───────────── */
        {
          const ID_NO_AR = "12121212-3434-4545-8656-767676767676";
          modulo.controle.post = {
            ok: true,
            dados: {
              id: ID_NO_AR,
              slug: "endereco-gravado",
              titulo: "Post no ar",
              resumo: "resumo",
              estado: "publicado",
              conteudo: null,
              conteudo_html: "<p>corpo</p>",
              publicado_em: "2027-01-01T12:00:00.000Z",
              atualizado_em: "2027-01-01T12:00:00.000Z",
            },
          };
          const tela = await montarTela({ postId: ID_NO_AR });
          const antes = tela.acaoDeVer()?.getAttribute("href");

          /* O Autor edita o endereço e NÃO salva. O que está no ar continua
             sendo o gravado — abrir o do formulário em aba nova levaria a uma
             página que o servidor nunca viu. */
          const campoDoSlug = tela.campo("slug");
          if (campoDoSlug) await tela.digitar(campoDoSlug, "endereco-que-nao-existe");

          afirmar(
            "editar o endereço sem salvar NÃO muda para onde o link do site aponta — o que está no ar é o gravado",
            campoDoSlug !== null &&
              campoDoSlug.value === "endereco-que-nao-existe" &&
              antes === "/blog/endereco-gravado" &&
              tela.acaoDeVer()?.getAttribute("href") === "/blog/endereco-gravado",
            `campo: ${campoDoSlug?.value} | link: ${tela.acaoDeVer()?.getAttribute("href")}`,
          );

          /* E A PENDÊNCIA APARECE NO DESTINO DA PRÉVIA. O Autor mexeu em algo e
             não salvou: a prévia mostra o gravado, e precisa dizer isso. */
          modulo.controle.post = {
            ok: true,
            dados: {
              ...modulo.controle.post.dados,
              estado: "rascunho",
              slug: "",
            },
          };
          const rascunho = await montarTela({ postId: ID_NO_AR });
          const semPendencia = rascunho.acaoDeVer()?.getAttribute("href");
          const campo = rascunho.campo("titulo");
          if (campo) await rascunho.digitar(campo, "Título mexido e não salvo");
          afirmar(
            "e o destino da prévia passa a AVISAR quando há alteração pendente — a prévia lê do banco, não da tela",
            semPendencia === `/admin/previa/${ID_NO_AR}` &&
              rascunho.acaoDeVer()?.getAttribute("href") ===
                `/admin/previa/${ID_NO_AR}?pendente=1`,
            `sem: ${semPendencia} | com: ${rascunho.acaoDeVer()?.getAttribute("href")}`,
          );
          await rascunho.desmontar();
          await tela.desmontar();
        }

        /* ── A LINHA E O EDITOR LEVAM AO MESMO ENDEREÇO ───────────────── */
        {
          modulo.controle.aoListar = null;
          modulo.controle.listagem = { ok: true, dados: POSTS_DE_PROVA };
          const lista = await montarLista({});
          const daLinha = lista
            .linha(ID_C)
            ?.querySelector('[data-acao="ver"]')
            ?.getAttribute("href");
          await lista.desmontar();

          modulo.controle.post = {
            ok: true,
            dados: {
              ...POSTS_DE_PROVA.find((p) => p.id === ID_C),
              resumo: "resumo",
              conteudo: null,
              conteudo_html: "",
            },
          };
          const editor = await montarTela({ postId: ID_C });
          const doEditor = editor.acaoDeVer()?.getAttribute("href");
          await editor.desmontar();

          afirmar(
            "a linha e o Editor levam ao MESMO endereço de prévia — a decisão mora num lugar só",
            typeof daLinha === "string" &&
              daLinha === doEditor &&
              daLinha === `/admin/previa/${ID_C}`,
            `linha: ${daLinha} | editor: ${doEditor}`,
          );
        }
      }

      /* ── A PRÉVIA NÃO ESCREVE, E NÃO DECIDE ACESSO ─────────────────── */
      {
        const codigo = mascararComentariosJs(ler(CAMINHO_PREVIA));
        const puro = mascararComentariosJs(ler(CAMINHO_MODULO_DA_PREVIA));
        const escritaCrua =
          /(?<!Array)\.from\s*\(|createClient|\.delete\s*\(|\.update\s*\(|\bfetch\s*\(/;
        afirmar(
          "a prévia lê pela CAMADA e não fala com o banco nem com a rede por conta própria",
          !escritaCrua.test(codigo) &&
            !escritaCrua.test(puro) &&
            /from "@\/data\/blog\/posts"/.test(ler(CAMINHO_PREVIA)),
          (escritaCrua.exec(`${codigo}${puro}`) ?? [])[0] ?? "",
        );
        afirmar(
          "e ela não decide acesso: nenhum segundo portão, nenhuma leitura de sessão — quem decide é o portão do pai",
          !/useSessao|getSession|PortaoDeSessao|localStorage|sessionStorage/.test(codigo),
          (/useSessao|getSession|PortaoDeSessao|localStorage|sessionStorage/.exec(codigo) ??
            [])[0] ?? "",
        );
        const dasRotas = mascararComentariosJs(ler(CAMINHO_MODULO_DAS_ROTAS));
        afirmar(
          "o identificador é conferido pela MESMA regra da camada de dados, importada — não por uma terceira cópia do formato",
          /from "@\/data\/blog\/comum"/.test(ler(CAMINHO_MODULO_DAS_ROTAS)) &&
            !/\[0-9a-f\]\{8\}/.test(dasRotas) &&
            !/\[0-9a-f\]\{8\}/.test(puro),
          "uma cópia do padrão de uuid aqui divergiria da do banco no primeiro ajuste",
        );
        /* `aplicarNoindex` roda DENTRO de um efeito: uma exceção ali derruba a
           prévia para o limite de erro, e a tela que existe para nunca ficar em
           branco acabaria em branco por causa de uma diretiva de rastreamento. */
        afirmar(
          "`aplicarNoindex` nunca lança — nem sem documento, nem com documento sem `head`, nem com um que estoura ao ser lido",
          tentar(
            "aplicarNoindex com documentos hostis",
            () => {
              const hostis = [
                null,
                undefined,
                {},
                { querySelector: () => null },
                { querySelector: () => null, head: null, createElement: () => ({}) },
                {
                  querySelector: () => {
                    throw new Error("estourei");
                  },
                },
                {
                  querySelector: () => null,
                  createElement: () => {
                    throw new Error("estourei ao criar");
                  },
                  head: { appendChild: () => {} },
                },
              ];
              for (const documento of hostis) {
                const desfazer = previa.aplicarNoindex(documento);
                if (typeof desfazer !== "function") return false;
                desfazer();
              }
              return true;
            },
            false,
          ),
        );
      }
    }

    /* ═══════════════════════════════════════════════════════════════════ */

    secao("(o) as Categorias: cor do dado, ícone do mapa, e a exclusão que conta");

    {
      const regras = modulo.regrasDasCategorias ?? null;
      const dominio = modulo.categoriasDoDominio ?? null;
      const tags = modulo.regrasDasTags ?? null;
      const iconesDeCategoria = modulo.iconesDeCategoria ?? null;

      afirmar(
        "`categorias.js` é módulo próprio e chega ao pacote — as frases e as situações são executáveis, não JSX lido",
        regras !== null &&
          typeof regras.situacaoDaTela === "function" &&
          typeof regras.textoDoUso === "function" &&
          typeof regras.motivoDeNaoExcluir === "function",
      );
      afirmar(
        "e o VOCABULÁRIO de cor e de ícone é do DOMÍNIO, não da tela — é ele que o servidor consulta para recusar",
        dominio !== null &&
          Array.isArray(dominio.CORES_DE_CATEGORIA) &&
          Array.isArray(dominio.CHAVES_DE_ICONE_DE_CATEGORIA) &&
          /* A seta aponta para o domínio: a tela importa dele, e ele não sabe
             que a tela existe. */
          /from\s+["']@\/domain\/blog\/categorias["']/.test(ler(CAMINHO_TELA_DE_CATEGORIAS)) &&
          !/from\s+["']@\/admin\//.test(ler(CAMINHO_CATEGORIAS_DO_DOMINIO)),
        "a tela lê o vocabulário do domínio, e o domínio não conhece a tela",
      );

      if (regras && dominio && tags) {
        /* ── AS CINCO SITUAÇÕES, EXECUTADAS POR TABELA ─────────────────
           A ORDEM dos ramos é regra, e não detalhe de escrita: o formulário
           vence tudo (quem está escrevendo não pode ver o esqueleto de uma
           releitura passar por cima do que digitou) e o erro vence o vazio
           (erro não é vazio, e trocar um pelo outro é como alguém conclui
           que a lista inteira sumiu). Dentro de um ternário de JSX isso só
           poderia ser conferido por leitura. */
        afirmar(
          "a tela declara CINCO situações, em lista fechada e congelada",
          Object.isFrozen(regras.SITUACOES_DA_TELA) &&
            regras.SITUACOES_DA_TELA.length === 5 &&
            new Set(regras.SITUACOES_DA_TELA).size === 5,
          (regras.SITUACOES_DA_TELA ?? []).join(", "),
        );
        afirmar(
          "o formulário vence `carregando` e vence o erro — quem está escrevendo não perde o que digitou para uma releitura",
          regras.situacaoDaTela({ editando: true, carregando: true }) ===
            regras.SITUACAO_FORMULARIO &&
            regras.situacaoDaTela({ editando: true, erro: { tipo: "rede" } }) ===
              regras.SITUACAO_FORMULARIO,
          String(regras.situacaoDaTela({ editando: true, carregando: true })),
        );
        afirmar(
          "e a tabela cobre as outras: espera, erro, vazio e lista — e ERRO vence VAZIO",
          regras.situacaoDaTela({ carregando: true }) === regras.SITUACAO_CARREGANDO &&
            regras.situacaoDaTela({ erro: { tipo: "rede" }, categorias: [] }) ===
              regras.SITUACAO_ERRO &&
            regras.situacaoDaTela({ categorias: [] }) === regras.SITUACAO_VAZIA &&
            regras.situacaoDaTela({ categorias: [{ id: "1" }] }) === regras.SITUACAO_LISTA,
          [
            regras.situacaoDaTela({ carregando: true }),
            regras.situacaoDaTela({ erro: { tipo: "rede" }, categorias: [] }),
            regras.situacaoDaTela({ categorias: [] }),
            regras.situacaoDaTela({ categorias: [{ id: "1" }] }),
          ].join(" | "),
        );

        /* ── O USO, POR EXTENSO E COM CONCORDÂNCIA ─────────────────────── */
        afirmar(
          "o uso é dito por extenso e concorda em número — “1 posts” é a marca de um texto que ninguém leu",
          regras.textoDoUso({ posts: 0 }) === "Nenhum post" &&
            regras.textoDoUso({ posts: 1 }) === "1 post" &&
            regras.textoDoUso({ posts: 2 }).endsWith(" posts") &&
            /* Contagem AUSENTE é dita como desconhecida, e nunca como zero: é o
               zero que a tela leria como "pode excluir". */
            regras.textoDoUso({}) === "Uso desconhecido" &&
            regras.textoDoUso({ posts: "lixo" }) === "Uso desconhecido",
          [
            regras.textoDoUso({ posts: 0 }),
            regras.textoDoUso({ posts: 1 }),
            regras.textoDoUso({ posts: 2 }),
          ].join(" | "),
        );
        afirmar(
          "Categoria com Post não pode ser excluída, e o motivo diz o NÚMERO e nomeia a Categoria",
          regras.podeExcluir({ posts: 0 }) === true &&
            regras.podeExcluir({ posts: 1 }) === false &&
            regras.motivoDeNaoExcluir({ posts: 0 }) === null &&
            regras.motivoDeNaoExcluir({ nome: "Analytics", posts: 3 }).oQueHouve.includes("3 posts a usam") &&
            regras.motivoDeNaoExcluir({ nome: "Analytics", posts: 3 }).oQueHouve.includes("Analytics") &&
            regras.motivoDeNaoExcluir({ nome: "Analytics", posts: 1 }).oQueHouve.includes("1 post a usa"),
          JSON.stringify(regras.motivoDeNaoExcluir({ nome: "Analytics", posts: 3 })),
        );
        /* Categoria sem nome não vira frase vazia: "Excluir “”?" é pior que
           "Excluir “categoria sem nome”?". */
        afirmar(
          "Categoria sem nome ainda produz frase utilizável, e nada aqui lança",
          regras.nomeParaFrase({}) === "categoria sem nome" &&
            regras.nomeParaFrase(null) === "categoria sem nome" &&
            regras.tituloDaExclusao({}).includes("categoria sem nome"),
          regras.tituloDaExclusao({}),
        );


        /* ── AS REGRAS PURAS DO FORMULÁRIO, EXECUTADAS ─────────────────
           Elas eram exportadas e nenhuma asserção as chamava: é onde mora a
           divergência de teto que fazia a tela aprovar 5000 e a rede recusar. */
        {
          const cheio = regras.corpoDaCategoria({
            nome: "  Inteligência   Artificial  ",
            slug: "",
            cor: dominio.CORES_DE_CATEGORIA[1],
            icone: dominio.CHAVES_DE_ICONE_DE_CATEGORIA[1],
            ordem: "7",
          });
          afirmar(
            "`corpoDaCategoria` normaliza o nome, omite endereço vazio e converte a ordem",
            cheio.ok === true &&
              cheio.corpo.nome === "Inteligência Artificial" &&
              !Object.hasOwn(cheio.corpo, "slug") &&
              cheio.corpo.ordem === 7 &&
              cheio.corpo.cor === dominio.CORES_DE_CATEGORIA[1],
            JSON.stringify(cheio),
          );
          /* O TETO É O MESMO NOS DOIS LADOS. A tela aceitava quatro dígitos e o
             servidor recusava acima de mil: 5000 passava aqui e voltava
             recusado da rede, sobre um campo que a tela tinha aprovado. */
          const acimaDoTeto = regras.corpoDaCategoria({
            nome: "X",
            ordem: String(dominio.ORDEM_MAXIMA_DA_CATEGORIA + 1),
          });
          const noTeto = regras.corpoDaCategoria({
            nome: "X",
            ordem: String(dominio.ORDEM_MAXIMA_DA_CATEGORIA),
          });
          afirmar(
            "e o teto de `ordem` da tela é EXATAMENTE o do domínio — um a mais é recusado, o teto exato passa",
            acimaDoTeto.ok === false &&
              acimaDoTeto.campo === "ordem" &&
              noTeto.ok === true,
            JSON.stringify([acimaDoTeto, noTeto.ok]),
          );
          /* COR E ÍCONE LEGADOS NÃO SÃO REENVIADOS — nem sobrescritos.
             Reenviar faria o servidor recusar, e renomear uma Categoria antiga
             ficaria travado para sempre; trocar pelo padrão sobrescreveria em
             silêncio o que estava gravado. */
          const legado = regras.corpoDaCategoria({
            nome: "Antiga",
            cor: "oklch(0.7 0.1 200)",
            icone: "flask",
          });
          afirmar(
            "cor e ícone que a tela NÃO reconhece ficam de fora do pedido — omitido é 'preserva', e é o que destrava renomear uma Categoria legada",
            legado.ok === true &&
              !Object.hasOwn(legado.corpo, "cor") &&
              !Object.hasOwn(legado.corpo, "icone"),
            JSON.stringify(legado.corpo),
          );
          afirmar(
            "nome vazio é recusado nomeando o campo, para o formulário poder apontá-lo",
            regras.corpoDaCategoria({ nome: "   " }).campo === "nome" &&
              regras.faltandoNoFormulario({ nome: "   " }).length === 1 &&
              regras.faltandoNoFormulario({ nome: "Boa" }).length === 0,
            JSON.stringify(regras.faltandoNoFormulario({ nome: "   " })),
          );
          /* `valoresDaCategoria`: o que o formulário abre a partir do gravado. */
          const abertos = regras.valoresDaCategoria({
            nome: "Analytics",
            slug: "analytics",
            cor: dominio.CORES_DE_CATEGORIA[2],
            icone: dominio.CHAVES_DE_ICONE_DE_CATEGORIA[3],
            ordem: 3,
          });
          afirmar(
            "`valoresDaCategoria` abre o formulário com o que está gravado, tudo como TEXTO",
            abertos.nome === "Analytics" &&
              abertos.slug === "analytics" &&
              abertos.ordem === "3" &&
              typeof abertos.ordem === "string",
            JSON.stringify(abertos),
          );
          afirmar(
            "e `ordem` nula vira campo VAZIO — `String(null)` é o texto 'null', que a gravação depois recusa",
            regras.valoresDaCategoria({ nome: "X", ordem: null }).ordem === "" &&
              regras.valoresDaCategoria({ nome: "X" }).ordem === "" &&
              regras.valoresDaCategoria({ nome: "X", ordem: 1.5 }).ordem === "",
            JSON.stringify(regras.valoresDaCategoria({ nome: "X", ordem: null })),
          );
        }

        /* ── USO DESCONHECIDO NÃO É USO ZERO ──────────────────────────── */
        afirmar(
          "contagem ausente vira uso DESCONHECIDO — e desconhecido não libera exclusão",
          regras.usoDaCategoria({ posts: null }) === null &&
            regras.usoDaCategoria({}) === null &&
            regras.usoDaCategoria({ posts: -1 }) === null &&
            regras.podeExcluir({ posts: null }) === false &&
            regras.textoDoUso({ posts: null }) === "Uso desconhecido",
          regras.textoDoUso({ posts: null }),
        );
        afirmar(
          "e o motivo do indisponível DISTINGUE 'está em uso' de 'não deu para contar' — as saídas são diferentes",
          regras.motivoDeNaoExcluir({ nome: "A", posts: null }).oQueHouve.includes("contar") &&
            regras.motivoDeNaoExcluir({ nome: "A", posts: 2 }).oQueHouve.includes("2 posts a usam") &&
            regras.motivoDeNaoExcluir({ nome: "A", posts: null }).oQueFazer !==
              regras.motivoDeNaoExcluir({ nome: "A", posts: 2 }).oQueFazer,
          JSON.stringify(regras.motivoDeNaoExcluir({ nome: "A", posts: null })),
        );
        /* A SAÍDA DA RECUSA POR USO LEVA A ALGUM LUGAR. "Abra esses posts" não
           diz como achá-los; a busca do Painel procura na Categoria desde a
           Story 2.11, e é esse o caminho que existe. */
        afirmar(
          "a saída da recusa por uso aponta para a busca do Painel, que é o caminho que EXISTE",
          /busca do Painel/i.test(regras.motivoDeNaoExcluir({ nome: "A", posts: 2 }).oQueFazer),
          regras.motivoDeNaoExcluir({ nome: "A", posts: 2 }).oQueFazer,
        );
        /* A DESCRIÇÃO DA TELA NÃO PODE PROMETER O QUE NÃO ACONTECE. Renomear
           acerta o Painel; no site os posts ainda vêm do armazenamento local
           com o nome em texto, então a pastilha renomeada não os encontra até a
           Story 2.15. A frase diz o alcance. */
        afirmar(
          "a descrição da tela declara o ALCANCE de renomear em vez de prometer o site",
          /site/i.test(regras.DESCRICAO_DA_TELA) &&
            /Painel/i.test(regras.DESCRICAO_DA_TELA),
          regras.DESCRICAO_DA_TELA,
        );

        /* ── AS FRASES PASSAM PELAS GUARDAS DE VOZ ─────────────────────── */
        if (voz) {
          const frases = [
            ["TITULO_DA_TELA", regras.TITULO_DA_TELA],
            ["DESCRICAO_DA_TELA", regras.DESCRICAO_DA_TELA],
            ["TITULO_DO_VAZIO", regras.TITULO_DO_VAZIO],
            ["DESCRICAO_DO_VAZIO", regras.DESCRICAO_DO_VAZIO],
            ["TITULO_DO_ERRO", regras.TITULO_DO_ERRO],
            ["descricaoDaExclusao", regras.descricaoDaExclusao()],
            ["confirmacaoDaExclusao", regras.confirmacaoDaExclusao({ nome: "Analytics" })],
            ["falhaDaExclusao", regras.falhaDaExclusao({ nome: "Analytics" })],
            ["confirmacaoDoSalvamento", regras.confirmacaoDoSalvamento({ nome: "Analytics" }, true)],
            ["falhaDoSalvamento", regras.falhaDoSalvamento({ nome: "Analytics" })],
            [
              "motivoDeNaoExcluir.oQueFazer",
              regras.motivoDeNaoExcluir({ nome: "Analytics", posts: 2 }).oQueFazer,
            ],
          ];
          const reprovadas = frases.filter(
            ([, frase]) => voz.diagnosticarMensagem("o que houve", frase) !== null,
          );
          afirmar(
            "as frases da tela de Categorias passam pelas guardas de voz — nenhuma vaga, nenhuma vazia",
            reprovadas.length === 0,
            reprovadas
              .map(([nome, frase]) => `${nome}: ${voz.diagnosticarMensagem("o que houve", frase)}`)
              .join(" | "),
          );
          afirmar(
            "e o rótulo do botão que confirma NOMEIA a ação — “Excluir” sozinho obriga a reler o texto",
            voz.diagnosticarRotuloDeAcao(regras.ROTULO_DE_CONFIRMAR_EXCLUSAO) === null &&
              regras.ROTULO_DE_CONFIRMAR_EXCLUSAO.toLowerCase().includes("categoria"),
            regras.ROTULO_DE_CONFIRMAR_EXCLUSAO,
          );
        }

        /* ── AS REGRAS DA TAG DIGITADA, EXECUTADAS ─────────────────────── */
        afirmar(
          "a Tag digitada é separada por VÍRGULA, e só por vírgula",
          tags.separarTags("uma, outra").nomes.length === 2 &&
            tags.separarTags("uma; outra").nomes.length === 1 &&
            tags.separarTags("uma\noutra").nomes.length === 1,
          JSON.stringify(tags.separarTags("uma; outra").nomes),
        );
        afirmar(
          "a repetida colapsa pela CHAVE, preservando a primeira grafia",
          JSON.stringify(tags.separarTags("Vendas, vendas,  VENDAS ").nomes) ===
            JSON.stringify(["Vendas"]),
          JSON.stringify(tags.separarTags("Vendas, vendas,  VENDAS ").nomes),
        );
        afirmar(
          "pedaço vazio some sem virar Tag — a vírgula final é o jeito normal de digitar uma lista",
          tags.separarTags("uma, , outra,").nomes.length === 2 &&
            tags.separarTags("uma, , outra,").problemas.length === 0,
          JSON.stringify(tags.separarTags("uma, , outra,")),
        );
        afirmar(
          "mas Tag que não serve é RECUSADA com frase, nunca descartada em silêncio",
          tags.separarTags("boa, !!! ???").problemas.length === 1 &&
            tags.separarTags(`boa, ${"a".repeat(200)}`).problemas.length === 1,
          JSON.stringify(tags.separarTags("boa, !!! ???")),
        );
        afirmar(
          "e o texto volta na forma que a separação lê sem mudar nada — abrir e fechar o Editor não acusa pendência",
          tags.textoDasTags(["uma", "outra"]) === "uma, outra" &&
            JSON.stringify(tags.separarTags(tags.textoDasTags(["uma", "outra"])).nomes) ===
              JSON.stringify(["uma", "outra"]),
          tags.textoDasTags(["uma", "outra"]),
        );

        /* ── A TELA, MONTADA ──────────────────────────────────────────── */
        const AS_CATEGORIAS = [
          {
            id: "aaaaaaaa-1111-4111-8111-111111111111",
            nome: "Analytics",
            slug: "analytics",
            cor: dominio.CORES_DE_CATEGORIA[2],
            icone: dominio.CHAVES_DE_ICONE_DE_CATEGORIA[4],
            ordem: 1,
            /* EM USO: é esta linha que prova que o alvo de excluir fica
               indisponível DIZENDO o motivo, em vez de sumir. */
            posts: 3,
          },
          {
            id: "bbbbbbbb-2222-4222-8222-222222222222",
            nome: "Novidades",
            slug: "novidades",
            cor: dominio.CORES_DE_CATEGORIA[4],
            icone: dominio.CHAVES_DE_ICONE_DE_CATEGORIA[2],
            ordem: 2,
            posts: 0,
          },
        ];

        /* A tela tem um LINK de volta para a listagem, e link precisa de
           roteador: montar sem ele não seria montar a tela real. */
        const roteadorDasCategorias = await tentar(
          "`react-router-dom` importa para montar a tela de Categorias",
          () => import("react-router-dom"),
          null,
        );

        const montarCategorias = async () => {
          const alvo = janela.document.createElement("div");
          janela.document.body.appendChild(alvo);
          const raizReact = createRoot(alvo);
          await act(async () => {
            raizReact.render(
              React.createElement(
                roteadorDasCategorias.MemoryRouter,
                { initialEntries: ["/admin/categorias"] },
                React.createElement(modulo.TelaDeCategorias),
              ),
            );
          });
          const q = (seletor) => alvo.querySelector(seletor);
          const todos = (seletor) => [...alvo.querySelectorAll(seletor)];
          return {
            alvo,
            situacao: () =>
              q("[data-estado-da-lista]")?.getAttribute("data-estado-da-lista") ?? null,
            /* `li[...]`, e não `[data-categoria]` solto: a pílula também sai
               com o identificador como dado, e contar as duas faria a lista
               parecer ter o dobro de linhas. */
            linhas: () => todos("li[data-categoria]"),
            linhaDe: (id) => q(`li[data-categoria="${id}"]`),
            pilulas: () => todos('[data-papel="pilula-de-categoria"]'),
            acoes: (id) =>
              todos(`li[data-categoria="${id}"] [data-papel="acoes"] [data-acao]`),
            uso: (id) =>
              (q(`li[data-categoria="${id}"] [data-papel="uso"]`)?.textContent ?? "").trim(),
            dialogo: () => janela.document.querySelector('[role="alertdialog"]'),
            texto: () => alvo.textContent ?? "",
            async clicar(elemento) {
              await act(async () => {
                elemento.dispatchEvent(new janela.MouseEvent("click", { bubbles: true }));
              });
            },
            async desmontar() {
              await act(async () => raizReact.unmount());
              alvo.remove();
            },
          };
        };

        if (roteadorDasCategorias) {
        /* — CARREGANDO: a resposta é SEGURA, senão o quadro nunca é desenhado */
        {
          let liberar = null;
          modulo.controle.aoListarCategorias = () =>
            new Promise((resolve) => {
              liberar = () => resolve({ ok: true, dados: AS_CATEGORIAS });
            });
          const tela = await montarCategorias();
          afirmar(
            "enquanto a leitura corre, a tela mostra o ESQUELETO e anuncia o que está fazendo",
            tela.situacao() === regras.SITUACAO_CARREGANDO &&
              tela.alvo.querySelector('[data-papel="esqueleto"]') !== null &&
              tela.texto().includes("Carregando as categorias"),
            String(tela.situacao()),
          );
          await act(async () => {
            liberar();
          });
          afirmar(
            "e quando ela chega, a tela vira LISTA com uma linha por Categoria",
            tela.situacao() === regras.SITUACAO_LISTA &&
              tela.linhas().length === AS_CATEGORIAS.length,
            `${tela.situacao()} | linhas: ${tela.linhas().length}`,
          );
          await tela.desmontar();
          modulo.controle.aoListarCategorias = null;
        }

        /* — ERRO NÃO É VAZIO — */
        {
          modulo.controle.categorias_do_painel = {
            ok: false,
            erro: { tipo: "rede", mensagem: "Confira a conexão e tente carregar de novo." },
          };
          const tela = await montarCategorias();
          afirmar(
            "falha de leitura vira a tela de ERRO, com a frase do erro TIPADO e o botão de tentar de novo",
            tela.situacao() === regras.SITUACAO_ERRO &&
              tela.texto().includes("Confira a conexão") &&
              tela.alvo.querySelector('[data-acao="repetir"]') !== null &&
              tela.linhas().length === 0,
            `${tela.situacao()} | ${tela.texto().slice(0, 120)}`,
          );
          /* E ele RELÊ de verdade: sem uma dependência que muda, o botão vira
             enfeite. */
          const antes = modulo.controle.leituras_de_categoria;
          await tela.clicar(tela.alvo.querySelector('[data-acao="repetir"]'));
          afirmar(
            "e o botão de tentar de novo RELÊ — sem isso ele é enfeite",
            modulo.controle.leituras_de_categoria > antes,
            `leituras: ${antes} → ${modulo.controle.leituras_de_categoria}`,
          );
          await tela.desmontar();
        }

        /* — VAZIO INICIAL — */
        {
          modulo.controle.categorias_do_painel = { ok: true, dados: [] };
          const tela = await montarCategorias();
          afirmar(
            "sem Categoria nenhuma, a tela é o VAZIO que convida a criar a primeira — e não a de erro",
            tela.situacao() === regras.SITUACAO_VAZIA &&
              tela.texto().includes(regras.TITULO_DO_VAZIO) &&
              tela.alvo.querySelector('[data-acao="primeira"]') !== null,
            String(tela.situacao()),
          );
          /* E o VAZIO leva ao FORMULÁRIO, que é a quinta situação. */
          await tela.clicar(tela.alvo.querySelector('[data-acao="primeira"]'));
          afirmar(
            "criar a primeira abre o FORMULÁRIO — a quinta situação, e ela existe",
            tela.situacao() === regras.SITUACAO_FORMULARIO &&
              tela.alvo.querySelector('[data-papel="formulario"]') !== null,
            String(tela.situacao()),
          );
          await tela.desmontar();
        }

        /* — A LISTA: cor por `style`, ícone do mapa, uso à vista, alvos 40×40 */
        {
          modulo.controle.categorias_do_painel = { ok: true, dados: AS_CATEGORIAS };
          const tela = await montarCategorias();

          /* A COR VEM DO DADO E É APLICADA POR `style`. Uma classe montada em
             tempo de execução não existiria no CSS compilado — seria uma
             pílula sem cor nenhuma em produção. */
          const pilulas = tela.pilulas();
          const paresPintados = pilulas.map((p) => p.getAttribute("style") ?? "");
          const paresEsperados = AS_CATEGORIAS.map((c) => {
            const { fundo, tinta } = dominio.aparenciaDaCategoria(c);
            return { fundo, tinta };
          });
          afirmar(
            "a pílula de Categoria pinta o par do DADO por `style`, com os tokens do vocabulário",
            pilulas.length === AS_CATEGORIAS.length &&
              paresPintados.every(
                (estilo, i) =>
                  estilo.includes(paresEsperados[i].fundo) &&
                  estilo.includes(paresEsperados[i].tinta),
              ),
            JSON.stringify(paresPintados),
          );
          afirmar(
            "e nenhuma classe de cor é montada: a lista de classes da pílula não cita a cor",
            pilulas.every((p) => !/categoria-[a-z]+/.test(p.getAttribute("class") ?? "")),
            pilulas.map((p) => p.getAttribute("class")).join(" | "),
          );
          afirmar(
            "o ÍCONE é a chave do mapa fechado, e ela sai como dado na tela",
            pilulas.every(
              (p, i) => p.getAttribute("data-icone") === AS_CATEGORIAS[i].icone,
            ) &&
              pilulas.every((p) => p.querySelector("svg") !== null),
            pilulas.map((p) => p.getAttribute("data-icone")).join(", "),
          );
          afirmar(
            "e o NOME vai por extenso ao lado — cor nunca é o único portador",
            pilulas.every((p, i) => (p.textContent ?? "").includes(AS_CATEGORIAS[i].nome)),
            pilulas.map((p) => p.textContent).join(" | "),
          );

          /* A CONTAGEM DE USO APARECE ANTES DE ALGUÉM TENTAR. */
          afirmar(
            "cada linha mostra quantos Posts usam a Categoria",
            tela.uso(AS_CATEGORIAS[0].id) === regras.textoDoUso(AS_CATEGORIAS[0]) &&
              tela.uso(AS_CATEGORIAS[1].id) === regras.textoDoUso(AS_CATEGORIAS[1]),
            `${tela.uso(AS_CATEGORIAS[0].id)} | ${tela.uso(AS_CATEGORIAS[1].id)}`,
          );

          /* OS ALVOS: 40×40, contorno PERMANENTE, e nome acessível que nomeia
             a Categoria. Nada condicionado a `hover`. */
          for (const categoria of AS_CATEGORIAS) {
            const acoes = tela.acoes(categoria.id);
            const classes = acoes.map((a) => a.getAttribute("class") ?? "");
            afirmar(
              `a linha de ${categoria.nome} tem os dois alvos, em 40×40 com contorno permanente`,
              acoes.length === 2 &&
                classes.every(
                  (c) =>
                    c.includes("size-10") &&
                    c.includes("min-h-10") &&
                    c.includes("min-w-10") &&
                    /(^|\s)border(\s|$)/.test(c) &&
                    !/group-hover:|hover:border-border/.test(c),
                ),
              classes.join(" | "),
            );
            afirmar(
              `e cada um deles NOMEIA a categoria ${categoria.nome} no rótulo acessível`,
              acoes.every((a) => (a.getAttribute("aria-label") ?? "").includes(categoria.nome)),
              acoes.map((a) => a.getAttribute("aria-label")).join(" | "),
            );
          }

          /* O ALVO DE EXCLUIR DE UMA CATEGORIA EM USO EXISTE E EXPLICA. Um
             controle que some deixa a pessoa procurando o que fez de errado. */
          const emUso = tela.linhaDe(AS_CATEGORIAS[0].id).querySelector('[data-acao="excluir"]');
          modulo.controle.avisos.length = 0;
          await tela.clicar(emUso);
          const motivo = regras.motivoDeNaoExcluir(AS_CATEGORIAS[0]);
          afirmar(
            "excluir Categoria EM USO fica indisponível dizendo o motivo — e não abre diálogo nenhum",
            emUso.getAttribute("aria-disabled") === "true" &&
              emUso.hasAttribute("disabled") === false &&
              tela.dialogo() === null &&
              modulo.controle.avisos.at(-1)?.oQueHouve === motivo.oQueHouve &&
              modulo.controle.avisos.at(-1)?.oQueFazer === motivo.oQueFazer,
            JSON.stringify(modulo.controle.avisos.at(-1) ?? null),
          );

          /* — A CONFIRMAÇÃO NOMEIA A CATEGORIA, e só ela exclui — */
          const livre = tela.linhaDe(AS_CATEGORIAS[1].id).querySelector('[data-acao="excluir"]');
          modulo.controle.pedidos_de_exclusao_de_categoria.length = 0;
          await tela.clicar(livre);
          const dialogo = tela.dialogo();
          afirmar(
            "excluir Categoria SEM uso abre a confirmação do sistema, e ela NOMEIA a Categoria",
            dialogo !== null &&
              (dialogo.textContent ?? "").includes(regras.tituloDaExclusao(AS_CATEGORIAS[1])) &&
              (dialogo.textContent ?? "").includes(regras.descricaoDaExclusao()) &&
              (dialogo.textContent ?? "").includes(regras.ROTULO_DE_CONFIRMAR_EXCLUSAO),
            dialogo ? (dialogo.textContent ?? "").slice(0, 200) : "sem diálogo",
          );
          afirmar(
            "e abrir a confirmação NÃO exclui nada — só o botão de confirmar exclui",
            modulo.controle.pedidos_de_exclusao_de_categoria.length === 0,
            JSON.stringify(modulo.controle.pedidos_de_exclusao_de_categoria),
          );

          if (dialogo) {
            const confirmar = [...dialogo.querySelectorAll("button")].find((b) =>
              (b.textContent ?? "").includes(regras.ROTULO_DE_CONFIRMAR_EXCLUSAO),
            );
            modulo.controle.categoria_excluida = {
              ok: true,
              dados: {
                operacao: "excluirCategoria",
                id: AS_CATEGORIAS[1].id,
                categoria: AS_CATEGORIAS[1],
              },
            };
            modulo.controle.avisos.length = 0;
            await tela.clicar(confirmar);
            afirmar(
              "confirmar exclui PELA PORTA ÚNICA — o pedido vai para `data/blog/escrita.js`, com o identificador da Categoria",
              modulo.controle.pedidos_de_exclusao_de_categoria.length === 1 &&
                modulo.controle.pedidos_de_exclusao_de_categoria[0] === AS_CATEGORIAS[1].id,
              JSON.stringify(modulo.controle.pedidos_de_exclusao_de_categoria),
            );
            afirmar(
              "e a confirmação anunciada NOMEIA a Categoria que saiu",
              modulo.controle.avisos.some(
                (a) =>
                  a.tom === "sucesso" &&
                  a.oQueHouve === regras.confirmacaoDaExclusao(AS_CATEGORIAS[1]),
              ),
              JSON.stringify(modulo.controle.avisos),
            );
          }
          await tela.desmontar();
        }

        /* — O FORMULÁRIO: cor e ícone escolhidos do vocabulário FECHADO — */
        {
          modulo.controle.categorias_do_painel = { ok: true, dados: AS_CATEGORIAS };
          const tela = await montarCategorias();
          await tela.clicar(tela.alvo.querySelector('[data-acao="nova"]'));

          const opcoesDeCor = [...tela.alvo.querySelectorAll("[data-cor]")];
          const opcoesDeIcone = [...tela.alvo.querySelectorAll('[role="radio"][data-icone]')];
          afirmar(
            "o formulário oferece EXATAMENTE as cores do vocabulário fechado, cada uma pintada por `style`",
            opcoesDeCor.length === dominio.CORES_DE_CATEGORIA.length &&
              opcoesDeCor.every(
                (b, i) =>
                  b.getAttribute("data-cor") === dominio.CORES_DE_CATEGORIA[i] &&
                  (b.getAttribute("style") ?? "").includes(dominio.CORES_DE_CATEGORIA[i]),
              ),
            opcoesDeCor.map((b) => b.getAttribute("data-cor")).join(", "),
          );
          afirmar(
            "e EXATAMENTE os ícones do mapa fechado, cada um com o desenho",
            opcoesDeIcone.length === dominio.CHAVES_DE_ICONE_DE_CATEGORIA.length &&
              opcoesDeIcone.every(
                (b, i) =>
                  b.getAttribute("data-icone") === dominio.CHAVES_DE_ICONE_DE_CATEGORIA[i] &&
                  b.querySelector("svg") !== null,
              ),
            opcoesDeIcone.map((b) => b.getAttribute("data-icone")).join(", "),
          );


          /* A ORDEM DOS CAMPOS É DECLARADA, E AGORA É COBRADA.
             `CAMPOS_DO_FORMULARIO` era exportado, nunca importado e nunca
             conferido contra o JSX: o comentário afirmava "na ordem em que ele
             os oferece" sem nada que forçasse a ordem. Aqui a sequência lida da
             tela é comparada com a declarada. */
          const naTela = [...tela.alvo.querySelectorAll("[data-campo]")].map((e) =>
            e.getAttribute("data-campo"),
          );
          afirmar(
            "o formulário desenha EXATAMENTE os campos declarados, na ordem declarada",
            JSON.stringify(naTela) === JSON.stringify([...regras.CAMPOS_DO_FORMULARIO]),
            "na tela: " + naTela.join(", ") + " | declarados: " + regras.CAMPOS_DO_FORMULARIO.join(", "),
          );

          /* O GRUPO DE ESCOLHA SE OPERA COMO GRUPO DE RÁDIOS: uma parada de
             tabulação, e setas que percorrem. Doze botões tabuláveis com
             `role="radio"` anunciam um padrão que o teclado não cumpre. */
          const radiosDeCor = [...tela.alvo.querySelectorAll('[data-cor][role="radio"]')];
          const tabulaveis = radiosDeCor.filter((b) => b.getAttribute("tabindex") === "0");
          afirmar(
            "o grupo de cor tem UMA parada de tabulação, e ela é a opção marcada",
            radiosDeCor.length > 1 &&
              tabulaveis.length === 1 &&
              tabulaveis[0].getAttribute("aria-checked") === "true",
            "tabuláveis: " + tabulaveis.length + " de " + radiosDeCor.length,
          );
          const marcadaAntes = radiosDeCor.findIndex(
            (b) => b.getAttribute("aria-checked") === "true",
          );
          await act(async () => {
            radiosDeCor[marcadaAntes].dispatchEvent(
              new janela.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
            );
          });
          const depoisDaSeta = [
            ...tela.alvo.querySelectorAll('[data-cor][role="radio"]'),
          ].findIndex((b) => b.getAttribute("aria-checked") === "true");
          afirmar(
            "e a seta ESCOLHE a opção seguinte — sem isso o grupo anuncia um padrão que o teclado não cumpre",
            depoisDaSeta === (marcadaAntes + 1) % radiosDeCor.length,
            "marcada: " + marcadaAntes + " → " + depoisDaSeta,
          );
          /* A MARCA DENTRO DA AMOSTRA DISTINGUE AS CORES ENTRE SI.
             Ela existe para quem não distingue os tons — e era
             `rotulo.slice(0, 2)`, que dava "Ci" para Ciano E para Cinza: duas
             amostras com a mesma marca, exatamente onde a marca deveria ser o
             desempate. A sigla é do vocabulário e é única, e o que se lê aqui é
             o que a tela desenhou. */
          {
            const doVocabulario = dominio.CORES_DE_CATEGORIA.map(
              (c) => dominio.aparenciaDaCor(c).sigla,
            );
            afirmar(
              "cada cor do vocabulário tem uma marca ÚNICA — “Ci” servia a Ciano e a Cinza",
              new Set(doVocabulario).size === doVocabulario.length &&
                doVocabulario.every((s) => typeof s === "string" && s.trim() !== ""),
              doVocabulario.join(", "),
            );
            const naTela = radiosDeCor.map((b) => (b.textContent ?? "").trim());
            afirmar(
              "e a amostra desenhada mostra a marca da SUA cor, não os dois primeiros caracteres do rótulo",
              naTela.length === doVocabulario.length &&
                naTela.every((s, i) => s === doVocabulario[i]),
              naTela.join(", ") + " | esperadas: " + doVocabulario.join(", "),
            );
          }

          /* E o nome acessível do ícone é PALAVRA DE INTERFACE, não a chave. */
          const radioDeIcone = tela.alvo.querySelector('[data-icone="faisca"][role="radio"]');
          afirmar(
            "o nome acessível de um ícone é a palavra de interface, e não a chave de código",
            radioDeIcone?.getAttribute("aria-label") ===
              iconesDeCategoria.ICONES_DE_CATEGORIA.faisca.rotulo &&
              radioDeIcone?.getAttribute("aria-label") !== "faisca",
            String(radioDeIcone?.getAttribute("aria-label")),
          );

          /* SALVAR PASSA PELA PORTA ÚNICA, com o corpo que o servidor aceita. */
          const campoNome = tela.alvo.querySelector('[data-campo="nome"]');
          await act(async () => {
            const setar = Object.getOwnPropertyDescriptor(
              janela.HTMLInputElement.prototype,
              "value",
            ).set;
            setar.call(campoNome, "Inteligência Artificial");
            campoNome.dispatchEvent(new janela.Event("input", { bubbles: true }));
          });
          modulo.controle.pedidos_de_categoria.length = 0;
          modulo.controle.categoria_salva = {
            ok: true,
            dados: {
              operacao: "salvarCategoria",
              criada: true,
              categoria: { id: "cccccccc-3333-4333-8333-333333333333", nome: "Inteligência Artificial" },
            },
          };
          modulo.controle.avisos.length = 0;
          await tela.clicar(tela.alvo.querySelector('[data-acao="salvar"]'));
          const pedido = modulo.controle.pedidos_de_categoria.at(-1);
          afirmar(
            "salvar manda o pedido pela porta única, com nome normalizado, cor e ícone do vocabulário",
            modulo.controle.pedidos_de_categoria.length === 1 &&
              pedido?.id === null &&
              pedido?.campos.nome === "Inteligência Artificial" &&
              dominio.ehCorDeCategoria(pedido?.campos.cor) &&
              dominio.ehChaveDeIconeDeCategoria(pedido?.campos.icone),
            JSON.stringify(pedido),
          );
          afirmar(
            "e a confirmação distingue CRIAR de salvar, nomeando a Categoria",
            modulo.controle.avisos.some(
              (a) => a.tom === "sucesso" && a.oQueHouve.includes("criada"),
            ),
            JSON.stringify(modulo.controle.avisos),
          );
          await tela.desmontar();
        }

        /* — EDITAR MANDA O IDENTIFICADOR: é o que distingue renomear de criar */
        {
          modulo.controle.categorias_do_painel = { ok: true, dados: AS_CATEGORIAS };
          const tela = await montarCategorias();
          await tela.clicar(
            tela.linhaDe(AS_CATEGORIAS[0].id).querySelector('[data-acao="editar"]'),
          );
          const campoNome = tela.alvo.querySelector('[data-campo="nome"]');
          afirmar(
            "editar abre o formulário JÁ PREENCHIDO com o que está gravado",
            tela.situacao() === regras.SITUACAO_FORMULARIO &&
              campoNome?.value === AS_CATEGORIAS[0].nome &&
              tela.alvo.querySelector('[data-campo="slug"]')?.value === AS_CATEGORIAS[0].slug,
            `${campoNome?.value} | ${tela.alvo.querySelector('[data-campo="slug"]')?.value}`,
          );
          await act(async () => {
            const setar = Object.getOwnPropertyDescriptor(
              janela.HTMLInputElement.prototype,
              "value",
            ).set;
            setar.call(campoNome, "Análise");
            campoNome.dispatchEvent(new janela.Event("input", { bubbles: true }));
          });
          modulo.controle.pedidos_de_categoria.length = 0;
          await tela.clicar(tela.alvo.querySelector('[data-acao="salvar"]'));
          const pedido = modulo.controle.pedidos_de_categoria.at(-1);
          afirmar(
            "renomear manda o IDENTIFICADOR junto — é ele que faz o servidor editar em vez de criar uma segunda",
            pedido?.id === AS_CATEGORIAS[0].id && pedido?.campos.nome === "Análise",
            JSON.stringify(pedido),
          );
          await tela.desmontar();
        }

        }


        /* ── O FILTRO DO BLOG PÚBLICO, MONTADO ─────────────────────────
         *
         * É a única linha da matriz que nomeia um defeito DE PRODUÇÃO — a
         * pastilha "Novidades" que não existia — e ela era verificada por duas
         * expressões regulares sobre o texto do arquivo. Trocar `categoria.nome`
         * por `categoria.slug` continuava passando: as pastilhas virariam
         * `tecnologia`, `estrategia`, o `blogStore` casa por `"Tecnologia"`, e
         * toda pastilha menos "Todos" mostraria "Nenhum artigo encontrado".
         */
        if (roteadorDasCategorias) {
          /* ─── O QUE O JSDOM NÃO TEM, E A PÁGINA PÚBLICA USA ────────────
             A página é a do site, e ela anima cartões com `whileInView` —
             que pede `IntersectionObserver`, ausente no jsdom. Sem o
             substituto, montar a página derruba o processo inteiro e a
             asserção não chega a existir. Ele é inerte de propósito: o que se
             está verificando é o FILTRO, não a animação, e um observador que
             dispara mudaria o que a tela mostra durante a leitura. */
          const observadorOriginal = janela.IntersectionObserver;
          class ObservadorInerte {
            observe() {}
            unobserve() {}
            disconnect() {}
            takeRecords() {
              return [];
            }
          }
          janela.IntersectionObserver = ObservadorInerte;
          globalThis.IntersectionObserver = ObservadorInerte;

          const DO_BANCO = [
            { id: "c1", nome: "Tecnologia", slug: "tecnologia", icone: "chip", cor: dominio.CORES_DE_CATEGORIA[1], ordem: 1 },
            { id: "c2", nome: "Novidades", slug: "novidades", icone: "faisca", cor: dominio.CORES_DE_CATEGORIA[4], ordem: 6 },
            /* Uma Categoria chamada "Todos" produziria duas pastilhas iguais,
               chave de React repetida e um filtro ambíguo. */
            { id: "c3", nome: "Todos", slug: "todos", icone: "pasta", cor: dominio.CORES_DE_CATEGORIA[0], ordem: 7 },
            /* E a repetida também: o banco tem unicidade de nome, mas a tela não
               pode depender disso para não desenhar duas chaves iguais. */
            { id: "c4", nome: "Tecnologia", slug: "tecnologia-2", icone: "chip", cor: dominio.CORES_DE_CATEGORIA[1], ordem: 8 },
          ];
          modulo.controle.categorias = { ok: true, dados: DO_BANCO };
          modulo.controle.leituras_publicas_de_categoria = 0;

          const alvo = janela.document.createElement("div");
          janela.document.body.appendChild(alvo);
          const raizReact = createRoot(alvo);
          await act(async () => {
            raizReact.render(
              React.createElement(
                roteadorDasCategorias.MemoryRouter,
                { initialEntries: ["/blog"] },
                React.createElement(modulo.BlogPublico),
              ),
            );
          });

          const pastilhas = [...alvo.querySelectorAll("button")]
            .map((b) => (b.textContent ?? "").trim())
            .filter((t) => t !== "");

          afirmar(
            "o filtro público pede as Categorias à camada de dados — a lista não vem de constante nenhuma",
            modulo.controle.leituras_publicas_de_categoria === 1,
            "leituras: " + modulo.controle.leituras_publicas_de_categoria,
          );
          afirmar(
            "e as pastilhas mostram o NOME da Categoria — com `slug` no lugar do nome, toda pastilha deixaria de achar posts",
            pastilhas.includes("Tecnologia") &&
              pastilhas.includes("Novidades") &&
              !pastilhas.includes("tecnologia") &&
              !pastilhas.includes("novidades"),
            pastilhas.join(" | "),
          );
          afirmar(
            "“Novidades” está entre elas — é o defeito em produção que o critério nomeia",
            pastilhas.includes("Novidades"),
            pastilhas.join(" | "),
          );
          afirmar(
            "“Todos” aparece UMA vez: ele é a ausência de filtro, e uma Categoria com esse nome não pode virar uma segunda pastilha igual",
            pastilhas.filter((t) => t === "Todos").length === 1,
            pastilhas.join(" | "),
          );
          afirmar(
            "e nome repetido não desenha duas pastilhas — chave de React duplicada e filtro ambíguo",
            pastilhas.filter((t) => t === "Tecnologia").length === 1,
            pastilhas.join(" | "),
          );

          await act(async () => raizReact.unmount());
          alvo.remove();

          /* E A FALHA DE LEITURA É DITA. Ela era silenciosa: o filtro colapsava
             para só "Todos" e o visitante concluía que o blog tem uma
             categoria só. */
          modulo.controle.categorias = {
            ok: false,
            erro: { tipo: "rede", mensagem: "Confira a conexão." },
          };
          const alvo2 = janela.document.createElement("div");
          janela.document.body.appendChild(alvo2);
          const raiz2 = createRoot(alvo2);
          await act(async () => {
            raiz2.render(
              React.createElement(
                roteadorDasCategorias.MemoryRouter,
                { initialEntries: ["/blog"] },
                React.createElement(modulo.BlogPublico),
              ),
            );
          });
          afirmar(
            "falha ao carregar as Categorias é ANUNCIADA no filtro público, e não colapsa em silêncio para só “Todos”",
            alvo2.querySelector('[data-papel="falha-das-categorias"]') !== null,
            (alvo2.textContent ?? "").slice(0, 160),
          );
          await act(async () => raiz2.unmount());
          alvo2.remove();
          modulo.controle.categorias = { ok: true, dados: [] };

          /* ══ AS DUAS TELAS PÚBLICAS, LENDO DO BANCO (Story 2.15) ══════
           *
           * Até aqui o site servia cinco posts de exemplo guardados no
           * navegador, e o artigo era montado por um interpretador artesanal
           * de Markdown. As duas coisas saíram. O que entra no lugar é lido
           * pela camada de dados — dublada aqui, como todo o resto desta
           * ferramenta — e o que se afirma é o COMPORTAMENTO das telas: a
           * ordem, o filtro, a busca, o destaque, os estados, o artigo dentro
           * de `.artigo` com o HTML GRAVADO, e a ausência do rascunho.
           */
          {
            const publico = modulo.regrasDoBlogPublico;
            const cc = modulo.controle;
            const R = roteadorDasCategorias;

            /* As regras PURAS primeiro: elas decidem o que a tela desenha, e
               executá-las é o que transforma "a tela diz o que houve" em regra
               provada em vez de frase sobre JSX. */
            afirmar(
              "a situação da listagem distingue os quatro casos — carregando, pronta, vazia e sem-resultado",
              publico.situacaoDaLista({ carregando: true }) === publico.LISTA_CARREGANDO &&
                publico.situacaoDaLista({ posts: [{ id: "a" }] }) === publico.LISTA_PRONTA &&
                publico.situacaoDaLista({ posts: [] }) === publico.LISTA_VAZIA &&
                publico.situacaoDaLista({ posts: [], termo: "x" }) ===
                  publico.LISTA_SEM_RESULTADO &&
                publico.situacaoDaLista({ posts: [], categoria: "cat-1" }) ===
                  publico.LISTA_SEM_RESULTADO,
              JSON.stringify([
                publico.situacaoDaLista({ posts: [] }),
                publico.situacaoDaLista({ posts: [], termo: "x" }),
              ]),
            );
            /* A ORDEM DOS RAMOS É REGRA, e não detalhe de escrita: erro
               conferido DEPOIS de lista vazia faria uma queda de conexão
               aparecer como "ainda não há artigos" — a tela dizendo que o blog
               está vazio quando o que houve foi falha de rede. */
            afirmar(
              "e erro vem ANTES de lista vazia: falha de rede nunca é anunciada como “ainda não há artigos”",
              publico.situacaoDaLista({
                erro: { tipo: "rede", mensagem: "x" },
                posts: [],
              }) === publico.LISTA_FALHA &&
                publico.situacaoDaLista({
                  carregando: true,
                  erro: { tipo: "rede" },
                }) === publico.LISTA_CARREGANDO,
            );
            afirmar(
              "a fala de cada situação diz o que houve e o que fazer, e só oferece desfazer onde alguém causou o vazio",
              publico.falaDaLista(publico.LISTA_VAZIA).limpar === false &&
                publico.falaDaLista(publico.LISTA_VAZIA).repetir === false &&
                publico.falaDaLista(publico.LISTA_SEM_RESULTADO).limpar === true &&
                publico.falaDaLista(publico.LISTA_FALHA).repetir === true &&
                publico.SITUACOES_SEM_CARTAO.every((s) => {
                  const f = publico.falaDaLista(s);
                  return f.oQueHouve.trim() !== "" && f.oQueFazer.trim() !== "";
                }),
            );
            afirmar(
              "e situação desconhecida LANÇA — devolver objeto neutro produziria a página em branco que a story existe para impedir",
              (() => {
                try {
                  publico.falaDaLista("inventada");
                  return false;
                } catch {
                  return true;
                }
              })(),
            );
            /* ★ OS DOIS VOCABULÁRIOS NÃO COMPARTILHAM VALOR ★
               Enquanto `LISTA_FALHA` e `ARTIGO_FALHA` eram os dois `"falha"`,
               `falaDaLista(ARTIGO_FALHA)` NÃO lançava: devolvia a fala da outra
               tela. A guarda de situação desconhecida existe para a confusão
               plausível, e a confusão plausível entre duas telas irmãs é trocar
               uma pela outra — exatamente o caso que ela não enxergava. */
            {
              const daLista = [
                publico.LISTA_CARREGANDO,
                publico.LISTA_PRONTA,
                publico.LISTA_VAZIA,
                publico.LISTA_SEM_RESULTADO,
                publico.LISTA_FALHA,
                publico.LISTA_FALHA_PERMANENTE,
              ];
              const doArtigo = [
                publico.ARTIGO_CARREGANDO,
                publico.ARTIGO_PRONTO,
                publico.ARTIGO_AUSENTE,
                publico.ARTIGO_FALHA,
                publico.ARTIGO_FALHA_PERMANENTE,
              ];
              const emComum = daLista.filter((v) => doArtigo.includes(v));
              afirmar(
                "os dois vocabulários fechados não compartilham NENHUM valor — trocar uma tela pela outra tem de ser erro visível",
                emComum.length === 0 &&
                  new Set([...daLista, ...doArtigo]).size ===
                    daLista.length + doArtigo.length,
                `em comum: ${emComum.join(", ") || "nenhum"}`,
              );
              const lancou = (fn) => {
                try {
                  fn();
                  return false;
                } catch {
                  return true;
                }
              };
              afirmar(
                "e por isso a guarda enxerga a troca: a fala de uma tela recusa a situação da outra, nos dois sentidos",
                doArtigo.every((s) => lancou(() => publico.falaDaLista(s))) &&
                  daLista.every((s) => lancou(() => publico.falaDoArtigo(s))),
              );
            }
            /* A LISTAGEM TRADUZ O ERRO TIPADO, como o artigo. Sem isto, `.env`
               ausente fazia `/blog` dizer "confira a conexão" e oferecer um
               botão que nunca ia funcionar — o defeito que a falha permanente
               existe para evitar do outro lado. */
            afirmar(
              "a listagem TRADUZ o erro tipado: rede pede insistir, configuração e permissão não",
              publico.situacaoDoErroDaLista({ tipo: "rede" }) === publico.LISTA_FALHA &&
                publico.situacaoDoErroDaLista({ tipo: "configuracao" }) ===
                  publico.LISTA_FALHA_PERMANENTE &&
                publico.situacaoDoErroDaLista({ tipo: "permissao" }) ===
                  publico.LISTA_FALHA_PERMANENTE &&
                publico.situacaoDoErroDaLista({ tipo: "coisa-nova" }) ===
                  publico.LISTA_FALHA_PERMANENTE &&
                publico.falaDaLista(publico.LISTA_FALHA).repetir === true &&
                publico.falaDaLista(publico.LISTA_FALHA_PERMANENTE).repetir === false,
              JSON.stringify([
                publico.situacaoDoErroDaLista({ tipo: "rede" }),
                publico.situacaoDoErroDaLista({ tipo: "configuracao" }),
              ]),
            );
            /* RELER NÃO É CARREGAR. A regra é executada por tabela porque o
               quadro em que ela aparece é curto demais para o DOM sozinho. */
            afirmar(
              "releitura é distinguida da primeira carga — e só a primeira desenha esqueleto",
              publico.estaRelendo({ carregando: true, posts: [{ id: "a" }] }) === true &&
                publico.estaRelendo({ carregando: true, posts: [] }) === false &&
                publico.estaRelendo({ carregando: true, posts: null }) === false &&
                publico.estaRelendo({ carregando: false, posts: [{ id: "a" }] }) === false &&
                publico.situacaoDaLista({ carregando: true, posts: [{ id: "a" }] }) ===
                  publico.LISTA_PRONTA &&
                publico.situacaoDaLista({ carregando: true, posts: [] }) ===
                  publico.LISTA_CARREGANDO,
            );
            /* E A PAGINAÇÃO: página cheia sugere mais, página curta encerra. */
            afirmar(
              "página cheia sugere que há mais; página curta encerra a lista",
              publico.haMaisParaCarregar(
                Array.from({ length: publico.TAMANHO_DA_PAGINA }, (_, i) => i),
              ) === true &&
                publico.haMaisParaCarregar([1, 2, 3]) === false &&
                publico.haMaisParaCarregar([]) === false &&
                publico.haMaisParaCarregar(null) === false,
            );
            afirmar(
              "e o anúncio da lista tem singular, plural e vazio — “1 artigos” é o detalhe que denuncia que ninguém leu em voz alta",
              publico.anuncioDaLista(1) === "1 artigo encontrado." &&
                publico.anuncioDaLista(12) === "12 artigos encontrados." &&
                publico.anuncioDaLista(0) === "Nenhum artigo encontrado." &&
                publico.anuncioDaLista(null) === "Nenhum artigo encontrado.",
              publico.anuncioDaLista(1),
            );
            /* A DEDUPLICAÇÃO DAS CATEGORIAS É POR NOME **E** POR IDENTIFICADOR:
               o id é a chave de React e o valor do filtro, e dois nomes
               diferentes com o mesmo id acenderiam juntos. */
            afirmar(
              "o filtro colapsa Categoria repetida por NOME e por IDENTIFICADOR, e recusa uma chamada “Todos”",
              JSON.stringify(
                publico.categoriasDoFiltro([
                  { id: "c1", nome: "Tecnologia" },
                  { id: "c2", nome: "Tecnologia" },
                  { id: "c1", nome: "Outra grafia" },
                  { id: "c3", nome: publico.CATEGORIA_TODOS },
                  { id: "", nome: "Sem id" },
                  { id: "c4", nome: "  " },
                  { id: "c5", nome: "Novidades" },
                ]),
              ) === JSON.stringify([
                { id: "c1", nome: "Tecnologia" },
                { id: "c5", nome: "Novidades" },
              ]),
              JSON.stringify(
                publico.categoriasDoFiltro([
                  { id: "c1", nome: "Tecnologia" },
                  { id: "c1", nome: "Outra grafia" },
                ]),
              ),
            );
            /* O ARTIGO: `slugValido` vem antes de `carregando`, e permissão cai
               em AUSÊNCIA. Uma tela que dissesse "sua sessão não permite" sobre
               `/blog/:slug` estaria confirmando que existe algo ali para quem
               tivesse sessão — a informação exata que a ausência esconde. */
            afirmar(
              "no artigo, slug inválido vira ausência ANTES de qualquer esqueleto — mesmo com `carregando` ligado do endereço anterior",
              publico.situacaoDoArtigo({ slugValido: false, carregando: true }) ===
                publico.ARTIGO_AUSENTE &&
                publico.situacaoDoArtigo({ slugValido: true, carregando: true }) ===
                  publico.ARTIGO_CARREGANDO &&
                publico.nasceCarregandoOArtigo(false) === false &&
                publico.nasceCarregandoOArtigo(true) === true,
            );
            afirmar(
              "e permissão cai em AUSÊNCIA, não numa tela própria — dizer “sua sessão não permite” confirmaria que há algo ali",
              publico.situacaoDoArtigo({
                slugValido: true,
                erro: { tipo: "permissao" },
              }) === publico.ARTIGO_AUSENTE &&
                publico.situacaoDoArtigo({
                  slugValido: true,
                  erro: { tipo: "nao_encontrado" },
                }) === publico.ARTIGO_AUSENTE &&
                publico.situacaoDoArtigo({ slugValido: true, erro: { tipo: "rede" } }) ===
                  publico.ARTIGO_FALHA &&
                publico.situacaoDoArtigo({
                  slugValido: true,
                  erro: { tipo: "coisa-nova" },
                }) === publico.ARTIGO_FALHA_PERMANENTE,
            );
            /* DATA E TEMPO SÃO APRESENTAÇÃO, sobre o instante e o número
               gravados — e nada aqui lança: um `publicado_em` corrompido não
               pode derrubar o artigo por causa de uma linha de metadado. */
            afirmar(
              "a data sai em português a partir do INSTANTE gravado, no fuso do negócio",
              publico.textoDaData({ publicado_em: "2026-08-14T15:00:00.000Z" }) ===
                "14/08/2026" &&
                publico.textoDaData({ publicado_em: null }) === "" &&
                publico.textoDaData({ publicado_em: "isto-não-é-data" }) === "",
              publico.textoDaData({ publicado_em: "2026-08-14T15:00:00.000Z" }),
            );
            afirmar(
              "e o tempo de leitura sai POR EXTENSO a partir do número gravado",
              publico.textoDoTempoDeLeitura({ tempo_leitura: 8 }) === "8 min de leitura" &&
                publico.textoDoTempoDeLeitura({ tempo_leitura: 0 }) === "" &&
                publico.textoDoTempoDeLeitura({}) === "",
              publico.textoDoTempoDeLeitura({ tempo_leitura: 8 }),
            );
            afirmar(
              "Categoria é NULÁVEL e nada quebra: o nome vira texto vazio, e não “undefined”",
              publico.nomeDaCategoria({ categoria: null }) === "" &&
                publico.nomeDaCategoria({}) === "" &&
                publico.nomeDaCategoria({ categoria: { nome: " Tecnologia " } }) ===
                  "Tecnologia" &&
                publico.idDaCategoria({ categoria: null }) === null,
            );

            /* ── AS TELAS, MONTADAS ──────────────────────────────────── */
            const montarPublica = async (
              Componente,
              caminho,
              entrada,
              { comRolagem = false } = {},
            ) => {
              const alvo = janela.document.createElement("div");
              janela.document.body.appendChild(alvo);
              const raizReact = createRoot(alvo);
              await act(async () => {
                raizReact.render(
                  React.createElement(
                    R.MemoryRouter,
                    { initialEntries: [entrada] },
                    /* `ScrollToTop` é global e mora acima das rotas em
                       `main.jsx`. Ele entra aqui quando o que se observa é a
                       navegação ENTRE artigos — duplicar a rolagem dentro da
                       página seria uma segunda implementação da mesma regra. */
                    comRolagem ? React.createElement(modulo.ScrollToTop) : null,
                    React.createElement(
                      R.Routes,
                      null,
                      React.createElement(R.Route, {
                        path: caminho,
                        element: React.createElement(Componente),
                      }),
                    ),
                  ),
                );
              });
              return {
                alvo,
                situacao: () =>
                  alvo.querySelector("[data-situacao]")?.getAttribute("data-situacao") ??
                  null,
                texto: () => alvo.textContent ?? "",
                q: (seletor) => alvo.querySelector(seletor),
                todos: (seletor) => [...alvo.querySelectorAll(seletor)],
                async clicar(elemento) {
                  await act(async () => {
                    elemento.dispatchEvent(
                      new janela.MouseEvent("click", { bubbles: true }),
                    );
                  });
                },
                /* Link precisa de `cancelable` e de `button: 0`: sem os dois, o
                   React Router não intercepta e a navegação não acontece. */
                async clicarLink(elemento) {
                  await act(async () => {
                    elemento.dispatchEvent(
                      new janela.MouseEvent("click", {
                        bubbles: true,
                        cancelable: true,
                        button: 0,
                      }),
                    );
                  });
                },
                async digitar(elemento, valor) {
                  await act(async () => {
                    const setar = Object.getOwnPropertyDescriptor(
                      janela.HTMLInputElement.prototype,
                      "value",
                    ).set;
                    setar.call(elemento, valor);
                    elemento.dispatchEvent(new janela.Event("input", { bubbles: true }));
                  });
                },
                /* A busca do site espera antes de perguntar ao banco. Sem
                   avançar o relógio de verdade, o pedido nunca sai — e a
                   asserção provaria o contrário do que quer provar. */
                async esperarABusca() {
                  await act(async () => {
                    await new Promise((resolve) =>
                      setTimeout(resolve, publico.ESPERA_DA_BUSCA_MS + 80),
                    );
                  });
                },
                async desmontar() {
                  await act(async () => raizReact.unmount());
                  alvo.remove();
                },
              };
            };

            const ID_DESTAQUE = "11111111-1111-4111-8111-111111111111";
            const ID_ANTIGO = "22222222-2222-4222-8222-222222222222";
            const ID_NOVO = "33333333-3333-4333-8333-333333333333";
            const ID_CATEGORIA = "44444444-4444-4444-8444-444444444444";
            const CATEGORIA = {
              id: ID_CATEGORIA,
              nome: "Tecnologia",
              slug: "tecnologia",
              icone: "chip",
              cor: dominio.CORES_DE_CATEGORIA[1],
              ordem: 1,
            };
            /* A ORDEM É DE PROPÓSITO CONTRA-INTUITIVA: o Post com data mais
               ANTIGA vem primeiro na resposta da camada. Uma tela que
               reordenasse por data inverteria os dois, e é exatamente isso que
               a asserção pega — a ordem é
               `COALESCE(publicado_em, atualizado_em)` decrescente e mora na
               camada de dados, nunca aqui. */
            const OS_POSTS = [
              {
                id: ID_DESTAQUE,
                slug: "post-em-destaque",
                titulo: "Post em destaque",
                resumo: "Resumo do destaque",
                estado: "publicado",
                destaque: true,
                categoria_id: ID_CATEGORIA,
                categoria: CATEGORIA,
                autor_nome: "Ana Autora",
                tempo_leitura: 8,
                publicado_em: "2026-08-14T15:00:00.000Z",
                atualizado_em: "2026-08-14T15:00:00.000Z",
              },
              {
                id: ID_ANTIGO,
                slug: "post-antigo",
                titulo: "Post antigo",
                resumo: "Resumo antigo",
                estado: "publicado",
                destaque: false,
                categoria_id: ID_CATEGORIA,
                categoria: CATEGORIA,
                autor_nome: "Ana Autora",
                tempo_leitura: 3,
                publicado_em: "2026-01-02T12:00:00.000Z",
                atualizado_em: "2026-01-02T12:00:00.000Z",
              },
              {
                /* SEM CATEGORIA, e com data mais NOVA que o anterior. Ele prova
                   as duas coisas ao mesmo tempo: Post sem Categoria aparece, e
                   a tela não reordena. */
                id: ID_NOVO,
                slug: "post-sem-categoria",
                titulo: "Post sem categoria",
                resumo: "Resumo sem categoria",
                estado: "publicado",
                destaque: false,
                categoria_id: null,
                categoria: null,
                autor_nome: "Ana Autora",
                tempo_leitura: 0,
                publicado_em: "2026-07-01T12:00:00.000Z",
                atualizado_em: "2026-07-01T12:00:00.000Z",
              },
            ];

            /* — CARREGANDO: a resposta é SEGURA, senão o quadro nunca é desenhado — */
            {
              let liberar = null;
              cc.aoBuscarPublicos = () =>
                new Promise((resolve) => {
                  liberar = () => resolve({ ok: true, dados: OS_POSTS });
                });
              cc.categorias = { ok: true, dados: [CATEGORIA] };
              const tela = await montarPublica(modulo.BlogPublico, "/blog", "/blog");
              afirmar(
                "enquanto a leitura corre, o Blog Público mostra o ESQUELETO e anuncia o que está fazendo",
                tela.situacao() === publico.LISTA_CARREGANDO &&
                  tela.q('[data-papel="esqueleto"]') !== null &&
                  tela.texto().includes("Carregando os artigos"),
                String(tela.situacao()),
              );
              await act(async () => {
                liberar();
              });
              cc.aoBuscarPublicos = null;

              afirmar(
                "e a lista fica PRONTA quando a resposta chega — nunca página em branco entre os dois quadros",
                tela.situacao() === publico.LISTA_PRONTA,
                String(tela.situacao()),
              );

              /* — A ORDEM É A DA CAMADA — */
              const naTela = tela.todos("[data-post]").map((n) => n.getAttribute("data-post"));
              afirmar(
                "os cartões saem NA ORDEM que a camada devolveu — a tela não reordena, e uma segunda ordenação divergiria no primeiro empate",
                naTela.length === 2 && naTela[0] === ID_ANTIGO && naTela[1] === ID_NOVO,
                naTela.join(", "),
              );

              /* — O DESTAQUE — */
              afirmar(
                "o Post destacado é apresentado como destaque, e não como mais um cartão",
                tela.q('[data-papel="destaque"]') !== null &&
                  tela.q('[data-papel="destaque"]').textContent.includes("Post em destaque") &&
                  !naTela.includes(ID_DESTAQUE),
                naTela.join(", "),
              );

              /* — OS METADADOS, FORMATADOS — */
              const doDestaque = tela.q('[data-papel="destaque"]').textContent ?? "";
              afirmar(
                "o destaque mostra a Categoria pelo NOME, a data em português e o tempo por extenso — tudo derivado do que o banco guarda",
                doDestaque.includes("Tecnologia") &&
                  doDestaque.includes("14/08/2026") &&
                  doDestaque.includes("8 min de leitura") &&
                  doDestaque.includes("Ana Autora"),
                doDestaque.replace(/\s+/g, " ").slice(0, 200),
              );

              /* — CATEGORIA NULA — */
              const semCategoria = tela.todos("[data-post]").find(
                (n) => n.getAttribute("data-post") === ID_NOVO,
              );
              afirmar(
                "Post SEM Categoria aparece na lista, e nada quebra — sem pastilha, e sem “undefined” na tela",
                semCategoria !== undefined &&
                  semCategoria.textContent.includes("Post sem categoria") &&
                  !semCategoria.textContent.includes("undefined") &&
                  !semCategoria.textContent.includes("null"),
                (semCategoria?.textContent ?? "").replace(/\s+/g, " ").slice(0, 160),
              );

              /* — O FILTRO VAI AO BANCO, e não a um `includes` em memória — */
              cc.pedidos_publicos.length = 0;
              await tela.clicar(tela.q(`button[data-categoria="${ID_CATEGORIA}"]`));
              const pedidoDoFiltro = cc.pedidos_publicos.at(-1);
              afirmar(
                "escolher uma Categoria PERGUNTA ao banco, mandando o identificador — filtrar a lista já carregada mentiria a partir do 201º post",
                cc.pedidos_publicos.length === 1 &&
                  pedidoDoFiltro?.categoriaId === ID_CATEGORIA,
                JSON.stringify(pedidoDoFiltro),
              );

              /* — A BUSCA TAMBÉM, e o termo viaja CRU: quem tira o acento é o
                   Postgres, dos dois lados da comparação —
                 E ela ESPERA a digitação parar. A asserção digita uma RAJADA e
                 cobra UM pedido: com `>= 1`, ou digitando uma vez só, apagar o
                 temporizador inteiro passaria — e cada tecla viraria uma
                 consulta, com a resposta de uma podendo chegar depois da
                 seguinte. */
              cc.pedidos_publicos.length = 0;
              const campoDeBusca = tela.q('[data-campo="busca"]');
              await tela.digitar(campoDeBusca, "A");
              await tela.digitar(campoDeBusca, "Au");
              await tela.digitar(campoDeBusca, "Auto");
              await tela.digitar(campoDeBusca, "Automação");
              afirmar(
                "durante a rajada de teclas NENHUM pedido sai — a espera existe para isso",
                cc.pedidos_publicos.length === 0,
                `pedidos durante a digitação: ${cc.pedidos_publicos.length}`,
              );
              await tela.esperarABusca();
              const pedidoDaBusca = cc.pedidos_publicos.at(-1);
              afirmar(
                "e quando ela para, sai UM pedido só — com o termo como o Autor digitou, porque a normalização de acento nunca acontece no cliente",
                cc.pedidos_publicos.length === 1 &&
                  pedidoDaBusca?.termo === "Automação" &&
                  pedidoDaBusca?.categoriaId === ID_CATEGORIA,
                `${cc.pedidos_publicos.length} pedido(s): ${JSON.stringify(cc.pedidos_publicos)}`,
              );
              /* E o pedido carrega o RECORTE. Sem limite e sem deslocamento, o
                 blog para no teto da camada sem dizer nada, e o artigo seguinte
                 fica inalcançável por caminho nenhum. */
              afirmar(
                "todo pedido leva o recorte da página — limite e deslocamento, e não a listagem inteira",
                pedidoDaBusca?.limite === publico.TAMANHO_DA_PAGINA &&
                  pedidoDaBusca?.deslocamento === 0,
                JSON.stringify(pedidoDaBusca),
              );

              /* — SEM RESULTADO: diz que não achou e oferece limpar — */
              cc.posts_publicos = { ok: true, dados: [] };
              cc.pedidos_publicos.length = 0;
              await tela.digitar(tela.q('[data-campo="busca"]'), "nao-existe");
              await tela.esperarABusca();
              afirmar(
                "termo sem correspondência diz que NÃO ACHOU e oferece limpar — não é o mesmo que “ainda não há artigos”",
                tela.situacao() === publico.LISTA_SEM_RESULTADO &&
                  tela.texto().includes(
                    publico.falaDaLista(publico.LISTA_SEM_RESULTADO).oQueHouve,
                  ) &&
                  tela.q('[data-acao="limpar"]') !== null,
                String(tela.situacao()),
              );

              /* E LIMPAR DESFAZ: volta a "Todos", esvazia o campo e relê. */
              cc.posts_publicos = { ok: true, dados: OS_POSTS };
              cc.pedidos_publicos.length = 0;
              await tela.clicar(tela.q('[data-acao="limpar"]'));
              await tela.esperarABusca();
              const pedidoLimpo = cc.pedidos_publicos.at(-1);
              afirmar(
                "e limpar desfaz as duas coisas de uma vez — termo vazio e sem Categoria",
                tela.situacao() === publico.LISTA_PRONTA &&
                  (pedidoLimpo?.termo ?? "") === "" &&
                  pedidoLimpo?.categoriaId === null &&
                  tela.q('[data-campo="busca"]')?.value === "",
                JSON.stringify(pedidoLimpo),
              );

              /* ─── RELER NÃO PISCA ──────────────────────────────────────
                 Trocar filtro em memória por consulta ao banco piorou a
                 percepção: com o esqueleto ligado a cada tecla, os cartões
                 somem e voltam a cada busca. Enquanto a resposta nova não
                 chega, a antiga fica na tela — e a região viva diz que está
                 atualizando, em vez de dizer que está carregando do zero. */
              {
                let liberarReleitura = null;
                cc.aoBuscarPublicos = () =>
                  new Promise((resolve) => {
                    liberarReleitura = () => resolve({ ok: true, dados: [OS_POSTS[1]] });
                  });
                await tela.digitar(tela.q('[data-campo="busca"]'), "antigo");
                await tela.esperarABusca();
                const relendo = () =>
                  tela.q("[data-relendo]")?.getAttribute("data-relendo") ?? null;
                afirmar(
                  "enquanto RELÊ, os cartões antigos continuam na tela — o esqueleto é só da primeira carga",
                  tela.situacao() === publico.LISTA_PRONTA &&
                    relendo() === "1" &&
                    tela.q('[data-papel="esqueleto"]') === null &&
                    tela.todos("[data-post]").length > 0,
                  `${tela.situacao()} | relendo: ${relendo()}`,
                );
                afirmar(
                  "e a região viva diz que está ATUALIZANDO, e não que está carregando do zero",
                  (tela.q('[data-papel="anuncio"]')?.textContent ?? "").includes(
                    publico.TEXTO_DE_ATUALIZANDO_A_LISTA,
                  ),
                  String(tela.q('[data-papel="anuncio"]')?.textContent),
                );
                await act(async () => {
                  liberarReleitura();
                });
                cc.aoBuscarPublicos = null;
                /* E QUANDO CHEGA, A LISTA É ANUNCIADA. Sem isto, quem usa
                   leitor de tela digita na busca e a grade muda em silêncio. */
                afirmar(
                  "e quando a resposta chega, a região viva diz quantos artigos vieram",
                  (tela.q('[data-papel="anuncio"]')?.textContent ?? "").trim() ===
                    publico.anuncioDaLista(1),
                  String(tela.q('[data-papel="anuncio"]')?.textContent),
                );
              }
              await tela.desmontar();
            }

            /* ─── A CAPA DO DESTAQUE E DO CARTÃO (bugfix "post em destaque
               fica sem imagem no site", item 7) ─────────────────────────
               Um Post marcado como Destaque desenhava só o fundo `aurora-bg`,
               mesmo tendo `imagem_url` gravado — a capa nunca aparecia. Aqui a
               capa DEVE aparecer quando o endereço existe, tanto no Destaque
               quanto no cartão da grade, e degradar para o fundo (nunca um
               `<img>` quebrado) quando falta ou falha ao carregar — o mesmo
               padrão já provado em `BlogPost.jsx` (Story 3.2). */
            {
              const CAPA_DESTAQUE = "https://cdn.exemplo.com/capa-destaque.jpg";
              const CAPA_CARTAO = "https://cdn.exemplo.com/capa-cartao.jpg";
              cc.aoBuscarPublicos = null;
              cc.posts_publicos = {
                ok: true,
                dados: [
                  { ...OS_POSTS[0], imagem_url: CAPA_DESTAQUE, imagem_alt: "A capa do destaque" },
                  { ...OS_POSTS[1], imagem_url: CAPA_CARTAO, imagem_alt: "A capa do cartão" },
                  { ...OS_POSTS[2], imagem_url: null },
                ],
              };
              const tela = await montarPublica(modulo.BlogPublico, "/blog", "/blog");

              const capaDoDestaque = tela.q('[data-papel="capa-do-destaque"]');
              afirmar(
                "o Post em Destaque com `imagem_url` DESENHA a capa — antes ficava só no fundo aurora, mesmo tendo endereço gravado",
                capaDoDestaque !== null &&
                  capaDoDestaque.getAttribute("src") === CAPA_DESTAQUE &&
                  capaDoDestaque.getAttribute("alt") === "A capa do destaque",
                String(capaDoDestaque?.getAttribute("src")),
              );

              const capaDoCartao = tela.q('[data-papel="capa-do-cartao"]');
              afirmar(
                "e o cartão da grade também desenha a própria capa, quando o Post tem `imagem_url`",
                capaDoCartao !== null && capaDoCartao.getAttribute("src") === CAPA_CARTAO,
                String(capaDoCartao?.getAttribute("src")),
              );
              afirmar(
                "o cartão sem `imagem_url` (null) não desenha capa nenhuma — nunca um <img> sem endereço",
                tela.todos('[data-papel="capa-do-cartao"]').length === 1,
                String(tela.todos('[data-papel="capa-do-cartao"]').length),
              );

              await act(async () => {
                capaDoDestaque.dispatchEvent(new janela.Event("error", { bubbles: false }));
              });
              afirmar(
                "a capa do Destaque que FALHA ao carregar degrada para o fundo — nunca o ícone de imagem quebrada do navegador, e o Destaque continua inteiro",
                tela.q('[data-papel="capa-do-destaque"]') === null &&
                  (tela.q('[data-papel="destaque"]')?.textContent ?? "").includes(
                    "Post em destaque",
                  ),
                `capa ainda no DOM: ${tela.q('[data-papel="capa-do-destaque"]') !== null}`,
              );

              const cartoesAntes = tela.todos("[data-post]").length;
              await act(async () => {
                capaDoCartao.dispatchEvent(new janela.Event("error", { bubbles: false }));
              });
              afirmar(
                "e a capa do cartão que falha perde só a IMAGEM — o cartão continua na grade",
                tela.q('[data-papel="capa-do-cartao"]') === null &&
                  tela.todos("[data-post]").length === cartoesAntes,
                `cartões antes: ${cartoesAntes} | depois: ${tela.todos("[data-post]").length}`,
              );

              await tela.desmontar();
              cc.posts_publicos = { ok: true, dados: OS_POSTS };
            }

            /* ─── A PAGINAÇÃO ─────────────────────────────────────────────
               O blog parava no teto da camada sem dizer nada. Com página e
               "carregar mais", o fim da lista é uma resposta — e um Post
               destacado que só aparece na segunda página assume o papel quando
               ela chega, em vez de nunca assumi-lo. */
            {
              const PAGINA_CHEIA = Array.from(
                { length: publico.TAMANHO_DA_PAGINA },
                (_, i) => ({
                  ...OS_POSTS[1],
                  id: `pagina-1-${i}`,
                  slug: `pagina-1-${i}`,
                  titulo: `Artigo ${i}`,
                  destaque: false,
                }),
              );
              const SEGUNDA_PAGINA = [
                { ...OS_POSTS[0], id: "pagina-2-destaque", slug: "pagina-2-destaque" },
              ];
              cc.aoBuscarPublicos = (pedido) =>
                Promise.resolve({
                  ok: true,
                  dados: (pedido?.deslocamento ?? 0) === 0 ? PAGINA_CHEIA : SEGUNDA_PAGINA,
                });
              cc.pedidos_publicos.length = 0;
              const tela = await montarPublica(modulo.BlogPublico, "/blog", "/blog");
              afirmar(
                "com a página cheia, a listagem oferece carregar mais — e não para em silêncio no teto",
                tela.situacao() === publico.LISTA_PRONTA &&
                  tela.todos("[data-post]").length === publico.TAMANHO_DA_PAGINA &&
                  tela.q('[data-acao="carregar-mais"]') !== null,
                `cartões: ${tela.todos("[data-post]").length}`,
              );

              await tela.clicar(tela.q('[data-acao="carregar-mais"]'));
              const pedidoDaSegunda = cc.pedidos_publicos.at(-1);
              afirmar(
                "carregar mais pede a PÁGINA SEGUINTE pelo deslocamento, e ACRESCENTA em vez de trocar",
                pedidoDaSegunda?.deslocamento === publico.TAMANHO_DA_PAGINA &&
                  tela.todos("[data-post]").length === publico.TAMANHO_DA_PAGINA,
                `deslocamento: ${pedidoDaSegunda?.deslocamento} | cartões: ${tela.todos("[data-post]").length}`,
              );
              /* O Post da segunda página é o destacado: ele sai da grade e
                 assume o papel. Escolher o Destaque só dentro da primeira
                 página faria um Post destacado além dela perder o papel para
                 sempre. */
              afirmar(
                "e um Post destacado que só chega na segunda página ASSUME o destaque",
                tela.q('[data-papel="destaque"]') !== null &&
                  (tela.q('[data-papel="destaque"]')?.textContent ?? "").includes(
                    "Post em destaque",
                  ),
                (tela.q('[data-papel="destaque"]')?.textContent ?? "").slice(0, 120),
              );
              afirmar(
                "e a página curta encerra a lista: o controle de carregar mais some",
                tela.q('[data-acao="carregar-mais"]') === null,
                "página incompleta significa fim da lista",
              );
              cc.aoBuscarPublicos = null;
              await tela.desmontar();
            }

            /* — VAZIO INICIAL: sem filtro nenhum, e sem oferecer desfazer — */
            {
              cc.posts_publicos = { ok: true, dados: [] };
              cc.aoBuscarPublicos = null;
              const tela = await montarPublica(modulo.BlogPublico, "/blog", "/blog");
              afirmar(
                "sem nenhum Post visível e sem filtro, a página diz que ainda não há artigos — e não oferece desfazer o que ninguém fez",
                tela.situacao() === publico.LISTA_VAZIA &&
                  tela.texto().includes(publico.falaDaLista(publico.LISTA_VAZIA).oQueHouve) &&
                  tela.q('[data-acao="limpar"]') === null &&
                  tela.q('[data-acao="repetir"]') === null,
                String(tela.situacao()),
              );
              await tela.desmontar();
            }

            /* — FALHA: erro NUNCA é confundido com vazio, e repetir relê — */
            {
              cc.posts_publicos = {
                ok: false,
                erro: { tipo: "rede", mensagem: "Confira a conexão e tente de novo." },
              };
              const tela = await montarPublica(modulo.BlogPublico, "/blog", "/blog");
              afirmar(
                "falha de leitura diz o que houve e o que fazer, com repetir — e nunca vira “ainda não há artigos”",
                tela.situacao() === publico.LISTA_FALHA &&
                  tela.texto().includes(publico.falaDaLista(publico.LISTA_FALHA).oQueHouve) &&
                  tela.texto().includes("Confira a conexão") &&
                  tela.q('[data-acao="repetir"]') !== null &&
                  !tela.texto().includes(publico.falaDaLista(publico.LISTA_VAZIA).oQueHouve),
                String(tela.situacao()),
              );
              cc.posts_publicos = { ok: true, dados: OS_POSTS };
              cc.pedidos_publicos.length = 0;
              await tela.clicar(tela.q('[data-acao="repetir"]'));
              afirmar(
                "e repetir RELÊ de verdade — a página volta a mostrar os artigos",
                cc.pedidos_publicos.length === 1 &&
                  tela.situacao() === publico.LISTA_PRONTA,
                `pedidos: ${cc.pedidos_publicos.length} | situação: ${tela.situacao()}`,
              );
              await tela.desmontar();
            }

            /* ─── FALHA PERMANENTE: a listagem tem a mesma distinção do artigo
               Com `.env` ausente a camada devolve `configuracao`, e uma tela que
               só soubesse dizer "confira a conexão" mandaria o visitante
               procurar o problema no lugar errado — e ofereceria um botão que
               nunca vai funcionar. */
            {
              cc.posts_publicos = {
                ok: false,
                erro: {
                  tipo: "configuracao",
                  mensagem: "A configuração do Supabase está incompleta.",
                },
              };
              const tela = await montarPublica(modulo.BlogPublico, "/blog", "/blog");
              afirmar(
                "ambiente mal configurado vira falha PERMANENTE — outra frase, e sem o botão que não resolveria nada",
                tela.situacao() === publico.LISTA_FALHA_PERMANENTE &&
                  tela.texto().includes(
                    publico.falaDaLista(publico.LISTA_FALHA_PERMANENTE).oQueHouve,
                  ) &&
                  tela.q('[data-acao="repetir"]') === null,
                String(tela.situacao()),
              );
              await tela.desmontar();
            }

            /* ─── NENHUM TEXTO DE EXCEÇÃO CHEGA AO VISITANTE ─────────────
               A tela mostra a fala da situação. Uma exceção que escape da
               camada vira erro tipado com a frase padrão, e o texto cru fica em
               `detalhe`, que nenhuma das duas páginas renderiza — publicar
               `TypeError: x is not a function` numa página institucional é o
               que esta asserção existe para impedir. */
            {
              const SEGREDO = "TypeError: fetch__interno__ is not a function";
              cc.aoBuscarPublicos = () => Promise.reject(new Error(SEGREDO));
              const tela = await montarPublica(modulo.BlogPublico, "/blog", "/blog");
              afirmar(
                "exceção que escapa da camada NÃO vira texto na tela — sai a frase da situação, e o cru fica em `detalhe`",
                tela.situacao() === publico.LISTA_FALHA_PERMANENTE &&
                  !tela.texto().includes(SEGREDO) &&
                  !tela.texto().includes("TypeError") &&
                  tela.texto().includes(
                    publico.falaDaLista(publico.LISTA_FALHA_PERMANENTE).oQueHouve,
                  ),
                tela.texto().replace(/\s+/g, " ").slice(0, 200),
              );
              /* E a regra pura, executada: a frase é a da camada, e o cru está
                 guardado — não descartado, porque quem for depurar precisa
                 dele no console. */
              const falha = publico.falhaDeExcecao(new Error(SEGREDO));
              afirmar(
                "e `falhaDeExcecao` guarda o texto cru em `detalhe`, com a mensagem vinda das frases da camada",
                falha.mensagem !== SEGREDO &&
                  falha.mensagem.trim() !== "" &&
                  String(falha.detalhe).includes(SEGREDO),
                JSON.stringify(falha),
              );
              cc.aoBuscarPublicos = null;
              await tela.desmontar();
            }

            /* ══ O ARTIGO ══════════════════════════════════════════════ */

            const HTML_GRAVADO =
              "<h2>Título de dentro</h2><p>Parágrafo <strong>gravado</strong>.</p><blockquote><p>Citação</p></blockquote>";
            const O_POST = {
              ...OS_POSTS[0],
              conteudo: { type: "doc", content: [] },
              conteudo_html: HTML_GRAVADO,
            };

            /* — CARREGANDO — */
            {
              let liberar = null;
              cc.aoLerPostPublico = () =>
                new Promise((resolve) => {
                  liberar = () => resolve({ ok: true, dados: O_POST });
                });
              cc.tags_publicas = { ok: true, dados: [{ id: "t1", nome: "Atendimento", slug: "atendimento" }] };
              cc.relacionados = { ok: true, dados: [OS_POSTS[1]] };
              cc.pedidos_de_tags.length = 0;
              const tela = await montarPublica(
                modulo.ArtigoPublico,
                "/blog/:slug",
                "/blog/post-em-destaque",
              );
              afirmar(
                "enquanto o artigo carrega, a página diz que está carregando — nunca fica em branco",
                tela.situacao() === publico.ARTIGO_CARREGANDO &&
                  tela.q('[data-papel="esqueleto"]') !== null,
                String(tela.situacao()),
              );
              await act(async () => {
                liberar();
              });
              cc.aoLerPostPublico = null;

              /* ★ O ARTIGO É O `conteudo_html` GRAVADO, DENTRO DE `.artigo` ★ */
              const artigo = tela.q('[data-papel="artigo"]');
              afirmar(
                "o artigo é injetado dentro de `.artigo` — a classe global escrita por extenso, a mesma do Editor e da prévia",
                artigo !== null && artigo.classList.contains("artigo"),
                String(artigo?.className),
              );
              afirmar(
                "e o que ele mostra é o HTML GRAVADO, byte a byte — nada é derivado em tempo de leitura",
                artigo?.innerHTML === HTML_GRAVADO,
                String(artigo?.innerHTML).slice(0, 200),
              );
              /* E o vocabulário do Estilo do Artigo de fato chegou à árvore: o
                 parser antigo emitia `h1` e `h4`, que `.artigo` não estiliza. */
              afirmar(
                "o corpo do artigo traz os elementos que o Estilo do Artigo cobre, e nenhum `h1` nem `h4`",
                tela.q('[data-papel="artigo"] h2') !== null &&
                  tela.q('[data-papel="artigo"] blockquote') !== null &&
                  tela.q('[data-papel="artigo"] h1') === null &&
                  tela.q('[data-papel="artigo"] h4') === null,
                String(artigo?.innerHTML).slice(0, 200),
              );

              /* — OS METADADOS — */
              afirmar(
                "os metadados vêm do que o banco guarda: Categoria pelo objeto embutido, data em português e tempo por extenso",
                (tela.q('[data-papel="categoria"]')?.textContent ?? "").trim() ===
                  "Tecnologia" &&
                  (tela.q('[data-papel="data"]')?.textContent ?? "").includes("14/08/2026") &&
                  (tela.q('[data-papel="tempo-de-leitura"]')?.textContent ?? "").includes(
                    "8 min de leitura",
                  ) &&
                  (tela.q('[data-papel="autor"]')?.textContent ?? "").includes("Ana Autora"),
                tela.texto().replace(/\s+/g, " ").slice(0, 220),
              );

              /* — AS TAGS —
                 O identificador PEDIDO é cobrado, e não só o que voltou: com o
                 dublê descartando o argumento, pedir as Tags do Post errado
                 passaria — a tela mostraria as tags de outro artigo e nada
                 acusaria. É a mesma cobrança que os relacionados já tinham. */
              const pedidoDasTags = cc.pedidos_de_tags.at(-1);
              afirmar(
                "as Tags são pedidas para o Post que está aberto, e não para outro",
                cc.pedidos_de_tags.length === 1 && pedidoDasTags === ID_DESTAQUE,
                `pedidos: ${JSON.stringify(cc.pedidos_de_tags)}`,
              );
              afirmar(
                "e elas aparecem, lidas pelo caminho público",
                (tela.q('[data-papel="tags"]')?.textContent ?? "").includes("#Atendimento"),
                String(tela.q('[data-papel="tags"]')?.textContent),
              );

              /* — OS RELACIONADOS, PELA CATEGORIA E SEM O PRÓPRIO POST — */
              const pedidoDosRelacionados = cc.pedidos_de_relacionados.at(-1);
              afirmar(
                "os relacionados são pedidos pela CATEGORIA e excluindo o próprio Post — casar por nome era o que o armazenamento fazia",
                pedidoDosRelacionados?.categoriaId === ID_CATEGORIA &&
                  pedidoDosRelacionados?.exceto === ID_DESTAQUE,
                JSON.stringify(pedidoDosRelacionados),
              );
              afirmar(
                "e eles são desenhados",
                (tela.q('[data-papel="relacionados"]')?.textContent ?? "").includes(
                  "Post antigo",
                ),
                String(tela.q('[data-papel="relacionados"]')?.textContent).slice(0, 160),
              );
              await tela.desmontar();
            }

            /* ─── POST PUBLICADO SEM CORPO GRAVADO ────────────────────────
               O ramo existe no arquivo e nunca era montado — e a sabotagem que
               passava é a mais barata de todas: apagar o ternário e injetar
               `.artigo` sempre. Aí um Post publicado sem corpo renderiza um
               contêiner VAZIO, que é a página em branco que o cabeçalho do
               módulo diz existir para impedir. A prévia já tem este par de
               asserções desde a Story 2.13; aqui é o espelho dela. */
            {
              cc.post_publico = { ok: true, dados: { ...O_POST, conteudo_html: "" } };
              cc.tags_publicas = { ok: true, dados: [] };
              cc.relacionados = { ok: true, dados: [] };
              const tela = await montarPublica(
                modulo.ArtigoPublico,
                "/blog/:slug",
                "/blog/post-em-destaque",
              );
              afirmar(
                "Post publicado SEM corpo gravado diz isso — e NÃO injeta um `.artigo` vazio",
                tela.situacao() === publico.ARTIGO_PRONTO &&
                  tela.q('[data-papel="artigo-vazio"]') !== null &&
                  tela.q('[data-papel="artigo"]') === null &&
                  tela.texto().includes(publico.ARTIGO_SEM_CONTEUDO),
                `${tela.situacao()} | artigo: ${tela.q('[data-papel="artigo"]') === null ? "ausente" : "presente"}`,
              );
              /* E o título continua lá: o Post existe, o corpo é que não. */
              afirmar(
                "e o resto da página continua de pé — o que falta é o corpo, não o Post",
                (tela.q('[data-papel="titulo"]')?.textContent ?? "").includes(
                  "Post em destaque",
                ),
                String(tela.q('[data-papel="titulo"]')?.textContent),
              );
              await tela.desmontar();
            }

            /* ─── TROCAR DE ARTIGO VOLTA AO TOPO ──────────────────────────
               Os relacionados levam de `/blog/:slug` para outro sem desmontar a
               tela. Sem rolagem ao mudar o alvo, o leitor cai no MEIO do artigo
               novo. Quem cumpre isso é `ScrollToTop`, global e acima das rotas
               em `main.jsx` — e é ele que é montado aqui, junto: duplicar a
               rolagem dentro da página seria uma segunda implementação da mesma
               regra, e a segunda é a que diverge. */
            {
              cc.post_publico = { ok: true, dados: O_POST };
              cc.relacionados = { ok: true, dados: [OS_POSTS[1]] };
              cc.tags_publicas = { ok: true, dados: [] };
              cc.rolagens.length = 0;
              const rolagemOriginal = janela.scrollTo;
              janela.scrollTo = (...args) => {
                cc.rolagens.push(args[0] ?? null);
              };
              const tela = await montarPublica(
                modulo.ArtigoPublico,
                "/blog/:slug",
                "/blog/post-em-destaque",
                { comRolagem: true },
              );
              const naMontagem = cc.rolagens.length;
              const link = tela.q('[data-papel="relacionados"] a');
              const achouLink = afirmar(
                "o cartão de relacionado é um link de verdade para o outro artigo",
                link !== null && link.getAttribute("href") === "/blog/post-antigo",
                String(link?.getAttribute("href")),
              );
              if (achouLink) {
                cc.pedidos_de_slug.length = 0;
                await tela.clicarLink(link);
                afirmar(
                  "clicar num relacionado abre o outro artigo — e a página volta ao topo em vez de cair no meio dele",
                  cc.pedidos_de_slug.at(-1) === "post-antigo" &&
                    cc.rolagens.length > naMontagem,
                  `pedidos: ${JSON.stringify(cc.pedidos_de_slug)} | rolagens: ${cc.rolagens.length} (na montagem: ${naMontagem})`,
                );
              }
              await tela.desmontar();
              if (rolagemOriginal === undefined) delete janela.scrollTo;
              else janela.scrollTo = rolagemOriginal;
            }

            /* — SEM CATEGORIA: sem pastilha, sem relacionados, e nada quebra — */
            {
              cc.relacionados = { ok: true, dados: [] };
              cc.pedidos_de_relacionados.length = 0;
              cc.tags_publicas = { ok: true, dados: [] };
              cc.post_publico = {
                ok: true,
                dados: { ...OS_POSTS[2], conteudo_html: "<p>Corpo</p>" },
              };
              const tela = await montarPublica(
                modulo.ArtigoPublico,
                "/blog/:slug",
                "/blog/post-sem-categoria",
              );
              afirmar(
                "artigo de Post SEM Categoria abre normalmente: sem pastilha, e sem pedir relacionados que não existem",
                tela.situacao() === publico.ARTIGO_PRONTO &&
                  tela.q('[data-papel="categoria"]') === null &&
                  tela.q('[data-papel="relacionados"]') === null &&
                  cc.pedidos_de_relacionados.length === 0 &&
                  tela.q('[data-papel="artigo"]') !== null,
                `${tela.situacao()} | pedidos de relacionados: ${cc.pedidos_de_relacionados.length}`,
              );
              await tela.desmontar();
            }

            /* — FALHA AO LER TAG NÃO DERRUBA O ARTIGO — */
            {
              cc.tags_publicas = { ok: false, erro: { tipo: "rede", mensagem: "caiu" } };
              cc.relacionados = { ok: false, erro: { tipo: "rede", mensagem: "caiu" } };
              cc.post_publico = { ok: true, dados: O_POST };
              const tela = await montarPublica(
                modulo.ArtigoPublico,
                "/blog/:slug",
                "/blog/post-em-destaque",
              );
              afirmar(
                "falha ao ler Tag ou relacionado NÃO derruba o artigo — quem abriu veio ler o texto",
                tela.situacao() === publico.ARTIGO_PRONTO &&
                  tela.q('[data-papel="artigo"]')?.innerHTML === HTML_GRAVADO &&
                  tela.q('[data-papel="tags"]') === null &&
                  tela.q('[data-papel="relacionados"]') === null,
                String(tela.situacao()),
              );
              await tela.desmontar();
              cc.tags_publicas = { ok: true, dados: [] };
              cc.relacionados = { ok: true, dados: [] };
            }

            /* — A CAPA DE FORA QUE APODRECEU (Story 3.2) — */
            //
            // Antes desta story toda capa vinha do nosso bucket. Agora ela pode
            // apontar para outro domínio, e endereço de fora APODRECE: o host
            // sai do ar, o arquivo é removido lá, o endereço muda. Um `<img>`
            // com endereço morto desenha o ícone de imagem quebrada do
            // navegador — dentro de uma moldura com sombra, que é o defeito
            // emoldurado. "Não carregou" vira "não tem", que é o ramo que a
            // página já sabia desenhar.
            {
              const DE_FORA_PODRE = "https://cdn.que-saiu-do-ar.example/foto.jpg";
              cc.post_publico = {
                ok: true,
                dados: { ...O_POST, imagem_url: DE_FORA_PODRE, imagem_alt: "Uma sala" },
              };
              cc.relacionados = {
                ok: true,
                dados: [
                  { ...OS_POSTS[1], imagem_url: DE_FORA_PODRE, imagem_alt: "Outra sala" },
                  { ...OS_POSTS[2], imagem_url: null },
                ],
              };
              const tela = await montarPublica(
                modulo.ArtigoPublico,
                "/blog/:slug",
                "/blog/post-em-destaque",
              );
              const capaDoArtigo = tela.q('[data-papel="capa-do-artigo"]');
              afirmar(
                "o artigo desenha a capa de FORA como qualquer outra — a origem não muda o que o leitor vê",
                capaDoArtigo !== null &&
                  capaDoArtigo.getAttribute("src") === DE_FORA_PODRE &&
                  capaDoArtigo.getAttribute("alt") === "Uma sala",
                String(capaDoArtigo?.getAttribute("src")),
              );
              await act(async () => {
                capaDoArtigo.dispatchEvent(new janela.Event("error", { bubbles: false }));
              });
              afirmar(
                "e a capa que não carrega é tratada como capa AUSENTE: nenhum ícone quebrado, e o artigo continua inteiro",
                tela.q('[data-papel="capa-do-artigo"]') === null &&
                  tela.todos("img").every(
                    (i) => (i.getAttribute("src") ?? "") !== DE_FORA_PODRE ||
                      i.getAttribute("data-papel") === "capa-relacionada",
                  ) &&
                  tela.situacao() === publico.ARTIGO_PRONTO &&
                  tela.q('[data-papel="artigo"]')?.innerHTML === HTML_GRAVADO,
                `situação: ${tela.situacao()} | capa: ${tela.q('[data-papel="capa-do-artigo"]') !== null}`,
              );

              /* E O RELACIONADO TEM RESPOSTA PRÓPRIA: um cartão com a imagem
                 podre não pode esconder a do vizinho, nem sobreviver por conta
                 de o artigo já ter falhado. */
              const dosRelacionados = tela.todos('[data-papel="capa-relacionada"]');
              afirmar(
                "os relacionados desenham a própria capa, e só quem tem uma",
                dosRelacionados.length === 1 &&
                  dosRelacionados[0].getAttribute("src") === DE_FORA_PODRE,
                `capas de relacionado: ${dosRelacionados.length}`,
              );
              await act(async () => {
                dosRelacionados[0].dispatchEvent(
                  new janela.Event("error", { bubbles: false }),
                );
              });
              afirmar(
                "e o relacionado cuja imagem não carrega perde a imagem, não o cartão — o layout não quebra em nenhum dos dois",
                tela.todos('[data-papel="capa-relacionada"]').length === 0 &&
                  tela.todos('[data-papel="relacionados"] [data-post]').length === 2,
                `cartões: ${tela.todos('[data-papel="relacionados"] [data-post]').length}`,
              );

              /* ─── E O BENEFÍCIO DA DÚVIDA VOLTA A CADA POST ─────────────
                 O comentário promete que a dúvida é por ENDEREÇO, e a promessa
                 é justamente a que uma implementação com `useState` sem efeito
                 de reinício quebra em silêncio: quem lesse um artigo de capa
                 podre e clicasse num relacionado ficaria sem capa no artigo
                 seguinte, sem nada acusar. A navegação é a de verdade — o
                 mesmo `Link` do cartão, dentro do mesmo roteador —, porque
                 remontar a página do zero provaria outra coisa.

                 O segundo Post tem capa boa; se a dúvida não voltasse, ela não
                 seria desenhada. */
              cc.aoLerPostPublico = (slug) =>
                slug === "post-antigo"
                  ? {
                      ok: true,
                      dados: {
                        ...OS_POSTS[1],
                        conteudo: { type: "doc", content: [] },
                        conteudo_html: HTML_GRAVADO,
                        imagem_url: "https://cdn.exemplo.com/outra.jpg",
                        imagem_alt: "Outra sala",
                      },
                    }
                  : { ok: true, dados: { ...O_POST, imagem_url: DE_FORA_PODRE } };
              await tela.clicar(
                tela.q('[data-papel="relacionados"] a[href="/blog/post-antigo"]'),
              );
              afirmar(
                "e o benefício da dúvida volta no Post seguinte: capa podre num artigo não condena a capa do próximo",
                tela.q('[data-papel="capa-do-artigo"]')?.getAttribute("src") ===
                  "https://cdn.exemplo.com/outra.jpg",
                String(tela.q('[data-papel="capa-do-artigo"]')?.getAttribute("src")),
              );
              cc.aoLerPostPublico = null;

              await tela.desmontar();
              cc.post_publico = { ok: true, dados: O_POST };
              cc.relacionados = { ok: true, dados: [] };
            }

            /* — RASCUNHO: AUSÊNCIA, indistinguível de endereço que nunca existiu — */
            {
              const AUSENCIA = {
                ok: false,
                erro: {
                  tipo: "nao_encontrado",
                  mensagem: "Não encontramos o que você procura.",
                },
              };
              cc.post_publico = AUSENCIA;
              const doRascunho = await montarPublica(
                modulo.ArtigoPublico,
                "/blog/:slug",
                "/blog/rascunho-que-nao-esta-no-ar",
              );
              const textoDoRascunho = doRascunho.texto();
              const situacaoDoRascunho = doRascunho.situacao();
              await doRascunho.desmontar();

              const doInexistente = await montarPublica(
                modulo.ArtigoPublico,
                "/blog/:slug",
                "/blog/nunca-existiu",
              );
              const textoDoInexistente = doInexistente.texto();
              await doInexistente.desmontar();

              afirmar(
                "o endereço público de um Post não publicado responde AUSÊNCIA — a mesma tela e a mesma frase de um endereço que nunca existiu",
                situacaoDoRascunho === publico.ARTIGO_AUSENTE &&
                  textoDoRascunho === textoDoInexistente &&
                  textoDoRascunho.includes(
                    publico.falaDoArtigo(publico.ARTIGO_AUSENTE).oQueHouve,
                  ),
                `${situacaoDoRascunho} | iguais: ${textoDoRascunho === textoDoInexistente}`,
              );
              afirmar(
                "e a tela de ausência não oferece repetir — um Post que não existe não passa a existir por insistência",
                publico.falaDoArtigo(publico.ARTIGO_AUSENTE).repetir === false,
              );
            }

            /* — SLUG FORA DO FORMATO: ausência SEM pedido à rede — */
            {
              cc.pedidos_de_slug.length = 0;
              const tela = await montarPublica(
                modulo.ArtigoPublico,
                "/blog/:slug",
                "/blog/UM SLUG INVÁLIDO",
              );
              afirmar(
                "slug fora do formato vira ausência SEM pedido à rede — ele não poderia existir, e mandá-lo só trocaria uma ausência por outra mais lenta",
                tela.situacao() === publico.ARTIGO_AUSENTE &&
                  cc.pedidos_de_slug.length === 0,
                `situação: ${tela.situacao()} | pedidos: ${cc.pedidos_de_slug.length}`,
              );
              await tela.desmontar();
            }

            /* — FALHA DE LEITURA DO ARTIGO: erro com repetir, nunca em branco — */
            {
              cc.post_publico = {
                ok: false,
                erro: { tipo: "rede", mensagem: "Confira a conexão e tente de novo." },
              };
              cc.pedidos_de_slug.length = 0;
              const tela = await montarPublica(
                modulo.ArtigoPublico,
                "/blog/:slug",
                "/blog/post-em-destaque",
              );
              afirmar(
                "falha de rede no artigo diz o que houve e o que fazer, com repetir — e nunca é confundida com ausência",
                tela.situacao() === publico.ARTIGO_FALHA &&
                  tela.texto().includes(publico.falaDoArtigo(publico.ARTIGO_FALHA).oQueHouve) &&
                  tela.q('[data-acao="repetir"]') !== null,
                String(tela.situacao()),
              );
              cc.post_publico = { ok: true, dados: O_POST };
              cc.pedidos_de_slug.length = 0;
              await tela.clicar(tela.q('[data-acao="repetir"]'));
              afirmar(
                "e repetir relê o artigo de verdade",
                cc.pedidos_de_slug.length === 1 &&
                  tela.situacao() === publico.ARTIGO_PRONTO,
                `pedidos: ${cc.pedidos_de_slug.length} | situação: ${tela.situacao()}`,
              );
              await tela.desmontar();
            }

            /* Estado de controle devolvido ao padrão para o resto da execução. */
            cc.posts_publicos = { ok: true, dados: [] };
            cc.post_publico = {
              ok: false,
              erro: { tipo: "nao_encontrado", mensagem: "sem post" },
            };
            cc.categorias = { ok: true, dados: [] };
          }

          if (observadorOriginal === undefined) delete janela.IntersectionObserver;
          else janela.IntersectionObserver = observadorOriginal;
          delete globalThis.IntersectionObserver;
        }


        /* ── A IDA E A VOLTA DAS TAGS, PELO EDITOR DE VERDADE ──────────
         *
         * Era a lacuna mais cara desta entrega: `controle.tagsDoPost` ficava
         * fixado em lista VAZIA para sempre, então `valoresDoPost` só rodava no
         * único caso em que o código velho e o novo dão o mesmo resultado — e
         * nenhuma asserção lia `pedidos[0].tags`. Voltar `corpoDoPedido` para
         * `tags: [...v.tags]` deixava tudo verde: como `v.tags` agora é TEXTO,
         * o espalhamento produz `[]`, e `[]` é o pedido legítimo de "apague
         * todas as tags". Salvar qualquer post apagaria as tags de todos.
         */
        {
          const ID_COM_TAGS = "dddddddd-4444-4444-8444-444444444444";
          modulo.controle.post = {
            ok: true,
            dados: {
              id: ID_COM_TAGS,
              slug: "post-com-tags",
              titulo: "Post com tags",
              resumo: "Resumo",
              estado: "rascunho",
              conteudo: null,
              conteudo_html: "",
              publicado_em: null,
              categoria_id: null,
              tempo_leitura: 0,
              atualizado_em: "2027-01-01T00:00:00.000Z",
            },
          };
          modulo.controle.tagsDoPost = {
            ok: true,
            dados: [
              { id: "t1", nome: "Atendimento" },
              { id: "t2", nome: "Automação" },
            ],
          };
          modulo.controle.tags = { ok: true, dados: [] };
          modulo.controle.categorias = { ok: true, dados: [] };
          modulo.controle.pedidos.length = 0;
          modulo.controle.resposta = {
            ok: true,
            dados: { criado: false, post: { ...modulo.controle.post.dados } },
          };

          const tela = await montarTela({ postId: ID_COM_TAGS });
          const campoDeTags = tela.campo("tags");
          afirmar(
            "abrir um Post traz as Tags GRAVADAS para o campo, pelo NOME e separadas por vírgula",
            campoDeTags?.value === "Atendimento, Automação",
            String(campoDeTags?.value),
          );

          await tela.clicar(tela.salvar());
          const enviado = modulo.controle.pedidos.at(-1);
          afirmar(
            "e salvar SEM TOCAR nas tags devolve as mesmas ao servidor — a lista não pode encolher sozinha",
            Array.isArray(enviado?.tags) &&
              enviado.tags.length === 2 &&
              enviado.tags.includes("Atendimento") &&
              enviado.tags.includes("Automação"),
            JSON.stringify(enviado?.tags ?? null),
          );

          /* E o que é DIGITADO chega ao pedido, normalizado e sem repetida. */
          await tela.digitar(tela.campo("tags"), "Atendimento, atendimento,  Vendas  ");
          modulo.controle.pedidos.length = 0;
          await tela.clicar(tela.salvar());
          const depois = modulo.controle.pedidos.at(-1);
          afirmar(
            "o que se digita chega ao pedido como NOMES normalizados, com a repetida colapsada",
            JSON.stringify(depois?.tags) === JSON.stringify(["Atendimento", "Vendas"]),
            JSON.stringify(depois?.tags ?? null),
          );
          await tela.desmontar();
        }

        /* ── E QUANDO A LEITURA DAS TAGS FALHA, O CAMPO NÃO VIAJA ───────
           O aviso na tela era a única proteção — e aviso não impede salvar:
           `tags` sempre ia no pedido, o campo estava vazio, e o servidor lê
           lista vazia como "apague todas". Campo AUSENTE é "preserva". */
        {
          const ID_SEM_TAGS = "eeeeeeee-5555-4555-8555-555555555555";
          modulo.controle.post = {
            ok: true,
            dados: {
              id: ID_SEM_TAGS,
              slug: "post-sem-tags",
              titulo: "Post cujas tags não vieram",
              resumo: "Resumo",
              estado: "rascunho",
              conteudo: null,
              conteudo_html: "",
              publicado_em: null,
              categoria_id: null,
              tempo_leitura: 0,
              atualizado_em: "2027-01-01T00:00:00.000Z",
            },
          };
          modulo.controle.tagsDoPost = {
            ok: false,
            erro: { tipo: "rede", mensagem: "Confira a conexão." },
          };
          modulo.controle.pedidos.length = 0;
          modulo.controle.avisos.length = 0;

          const tela = await montarTela({ postId: ID_SEM_TAGS });
          afirmar(
            "a falha ao ler as Tags do Post é ANUNCIADA, e não engolida",
            modulo.controle.avisos.some(
              (a) => a.tom === "erro" && /tags deste post/i.test(a.oQueHouve),
            ),
            JSON.stringify(modulo.controle.avisos),
          );
          await tela.clicar(tela.salvar());
          const enviado = modulo.controle.pedidos.at(-1);
          afirmar(
            "e o pedido sai SEM o campo `tags` — ausente é 'preserva', e lista vazia seria 'apague todas'",
            enviado !== undefined && !Object.hasOwn(enviado, "tags"),
            JSON.stringify(Object.keys(enviado ?? {})),
          );
          await tela.desmontar();
          modulo.controle.tagsDoPost = { ok: true, dados: [] };
        }

        /* — A GAVETA: Categoria com cor e ícone, Tag por vírgula — */
        {
          const CATEGORIAS_DA_GAVETA = AS_CATEGORIAS.map((c) => ({ ...c }));
          const TAGS_JA_USADAS = [
            { id: "t1", nome: "Atendimento", slug: "atendimento" },
            { id: "t2", nome: "Automação", slug: "automacao" },
          ];
          const alvo = janela.document.createElement("div");
          janela.document.body.appendChild(alvo);
          const raizReact = createRoot(alvo);
          let valores = {
            titulo: "",
            slug: "",
            resumo: "",
            categoria_id: CATEGORIAS_DA_GAVETA[0].id,
            tags: "Atendimento, atendimento",
            publicado_em: "",
            tempo_leitura: "",
          };
          const desenhar = () =>
            React.createElement(modulo.GavetaDeMetadados, {
              valores,
              categorias: CATEGORIAS_DA_GAVETA,
              tags: TAGS_JA_USADAS,
              aoMudar: (campo, valor) => {
                valores = { ...valores, [campo]: valor };
                raizReact.render(desenhar());
              },
            });
          await act(async () => {
            raizReact.render(desenhar());
          });

          const pilula = alvo.querySelector('[data-papel="pilula-de-categoria"]');
          const esperada = dominio.aparenciaDaCategoria(CATEGORIAS_DA_GAVETA[0]);
          afirmar(
            "a gaveta mostra a Categoria escolhida COM cor e ícone — os dois já chegavam da camada de dados e eram descartados",
            pilula !== null &&
              (pilula.getAttribute("style") ?? "").includes(esperada.fundo) &&
              pilula.getAttribute("data-icone") === CATEGORIAS_DA_GAVETA[0].icone &&
              (pilula.textContent ?? "").includes(CATEGORIAS_DA_GAVETA[0].nome),
            pilula ? pilula.getAttribute("style") : "sem pílula",
          );

          const campoDeTags = alvo.querySelector('[data-campo="tags"]');
          afirmar(
            "as Tags são um campo de TEXTO, e não um menu múltiplo com “Segure Ctrl” na ajuda",
            campoDeTags !== null &&
              campoDeTags.tagName === "INPUT" &&
              !(alvo.textContent ?? "").includes("Segure Ctrl") &&
              (alvo.textContent ?? "").includes("Separe por vírgula"),
            campoDeTags ? campoDeTags.tagName : "sem campo",
          );
          const lidas = [...alvo.querySelectorAll('[data-papel="tags-lidas"] [data-tag]')];
          afirmar(
            "o que vai ser gravado aparece enquanto se digita — e a repetida já colapsou",
            lidas.length === 1 && lidas[0].getAttribute("data-tag") === "Atendimento",
            lidas.map((l) => l.getAttribute("data-tag")).join(", "),
          );
          const sugestoes = [...alvo.querySelectorAll("[data-sugestao]")];
          afirmar(
            "as já usadas são SUGERIDAS — e a que já está no campo não é oferecida de novo",
            sugestoes.length === 1 && sugestoes[0].getAttribute("data-sugestao") === "Automação",
            sugestoes.map((s) => s.getAttribute("data-sugestao")).join(", "),
          );
          await act(async () => {
            sugestoes[0].dispatchEvent(new janela.MouseEvent("click", { bubbles: true }));
          });
          /* O QUE SE ACRESCENTA É TEXTO AO TEXTO, e não a lista normalizada de
             volta. Remontar o campo a partir de `tagsLidas.nomes` descartava em
             silêncio o pedaço que estava sendo digitado e a tag recusada — a
             pessoa via texto sumir por ter clicado noutro lugar. Aqui o campo
             tinha "Atendimento, atendimento" (a repetida ainda escrita), e ela
             CONTINUA lá depois do clique. */
          afirmar(
            "clicar numa sugestão ACRESCENTA a Tag ao texto do campo, sem apagar o que já estava escrito",
            valores.tags === "Atendimento, atendimento, Automação",
            valores.tags,
          );

          /* E O SEPARADOR NÃO É REPOSTO SOBRE O QUE JÁ ESTÁ ESCRITO. Digitar
             "Atendimento, " e clicar numa sugestão produzia
             "Atendimento, , Automação": o pedaço vazio entre as duas vírgulas
             some na leitura de volta, então o campo mostrava uma coisa e o
             pedido levava outra. Os três finais que uma pessoa digita de
             verdade — sem vírgula, com vírgula, com vírgula e espaço — chegam
             ao MESMO texto. */
          {
            const finais = ["Atendimento", "Atendimento,", "Atendimento, "];
            const produzidos = [];
            for (const inicial of finais) {
              await act(async () => {
                valores = { ...valores, tags: inicial };
                raizReact.render(desenhar());
              });
              const sugestao = alvo.querySelector('[data-sugestao="Automação"]');
              await act(async () => {
                sugestao?.dispatchEvent(new janela.MouseEvent("click", { bubbles: true }));
              });
              produzidos.push(valores.tags);
            }
            afirmar(
              "e a vírgula que já está escrita não é reposta — “Atendimento, ” não vira “Atendimento, , Automação”",
              produzidos.every((t) => t === "Atendimento, Automação"),
              produzidos.map((t) => JSON.stringify(t)).join(" | "),
            );
          }

          /* E a RECUSA aparece: Tag que não serve não some em silêncio. */
          await act(async () => {
            valores = { ...valores, tags: "boa, !!! ???" };
            raizReact.render(desenhar());
          });
          const recusa = alvo.querySelector('[data-campo="tags"]')?.getAttribute("aria-invalid");
          afirmar(
            "Tag que não vira endereço é RECUSADA na gaveta, com a frase — nunca descartada calada",
            recusa === "true" && (alvo.textContent ?? "").includes("letra ou número"),
            `aria-invalid: ${recusa}`,
          );

          await act(async () => raizReact.unmount());
          alvo.remove();
        }

        /* ─── (p) A CAPA (Story 3.1) ────────────────────────────────────
           Duas montagens, e a divisão é a mesma que a arquitetura declara:
           a GAVETA sozinha, para o que é desenho (miniatura, progresso,
           recusa, descrição colada na imagem), e o EDITOR inteiro, para o
           que é coordenação (o arquivo escolhido virar envio, o endereço
           voltar para o formulário, a recusa virar frase). */
        {
          secao("(p) a capa: recusa antes da rede, progresso honesto, miniatura ao concluir");

          const capa = modulo.regrasDaCapa;
          const regrasDosMetadados = modulo.regrasDosMetadados;
          const doArquivo = modulo.arquivosDoDominio;

          /* — AS REGRAS PURAS, EXECUTADAS — */
          afirmar(
            "`capa.js` chega ao pacote e as situações do envio são um vocabulário FECHADO",
            capa !== undefined &&
              Array.isArray(capa.SITUACOES_DO_ENVIO) &&
              Object.isFrozen(capa.SITUACOES_DO_ENVIO) &&
              capa.SITUACOES_DO_ENVIO.length === 3 &&
              capa.ehSituacaoDoEnvio(capa.ENVIO_EM_CURSO) &&
              !capa.ehSituacaoDoEnvio("carregando"),
            JSON.stringify(capa?.SITUACOES_DO_ENVIO),
          );

          /* AS SITUAÇÕES NÃO COLIDEM com as das outras telas. Sem isto, a
             fala de uma tela responderia pela outra sem nada lançar — foi um
             achado real da Story 2.15, e a correção foi prefixar. */
          {
            const outras = [
              ...Object.values(modulo.regrasDaPrevia ?? {}),
              ...Object.values(modulo.regrasDoBlogPublico ?? {}),
            ].filter((v) => typeof v === "string");
            const colisoes = capa.SITUACOES_DO_ENVIO.filter((v) => outras.includes(v));
            afirmar(
              "e elas não colidem com as situações da prévia nem as do blog público — interseção vazia",
              colisoes.length === 0,
              colisoes.join(", "),
            );
          }

          /* A INDICAÇÃO NÃO MENTE: a fala do envio não tem número nenhum.
             É a asserção que impede um percentual desenhado à mão de voltar
             — e ela roda sobre a função, não sobre o JSX. */
          afirmar(
            "a fala do envio não traz percentual nem número — o que se sabe é “está enviando”, e é isso que ela diz",
            capa.falaDoEnvio(capa.ENVIO_EM_CURSO) === capa.FALA_DO_ENVIO_EM_CURSO &&
              !/[0-9]|%/.test(capa.FALA_DO_ENVIO_EM_CURSO) &&
              capa.falaDoEnvio(capa.ENVIO_PARADO) === "" &&
              capa.falaDoEnvio("inventada") === "",
            JSON.stringify(capa.FALA_DO_ENVIO_EM_CURSO),
          );

          /* A FRASE DA FALTA É A MESMA NOS DOIS LUGARES.
             `FRASES_DE_FALTA.imagem_alt` é o que a gaveta desenha embaixo do
             campo; `problemaNoTextoAlternativo` é o que a montagem do pedido
             devolve e a notificação mostra. Duas grafias seriam duas
             explicações para a mesma recusa — uma no campo e outra no aviso —, e
             o comentário de `metadados.js` promete esta comparação. */
          afirmar(
            "a frase de “falta a descrição” é a MESMA no campo e na recusa do pedido — uma promessa do comentário, agora conferida",
            regrasDosMetadados.FRASES_DE_FALTA.imagem_alt ===
              doArquivo.problemaNoTextoAlternativo("", { temCapa: true }),
            `gaveta: ${JSON.stringify(regrasDosMetadados.FRASES_DE_FALTA.imagem_alt)} | pedido: ${JSON.stringify(doArquivo.problemaNoTextoAlternativo("", { temCapa: true }))}`,
          );

          /* — A GAVETA SOZINHA: o desenho — */
          {
            const alvo = janela.document.createElement("div");
            janela.document.body.appendChild(alvo);
            const raizReact = createRoot(alvo);
            /* AS CATEGORIAS ENTRAM NA MONTAGEM (Story 3.2): é do NOME da
               Categoria escolhida que sai o monograma da degradação, e sem
               lista de Categorias a gaveta nunca teria uma para escolher —
               toda a metade "com Categoria" da degradação ficaria por provar. */
            const BASE_DO_PROJETO = "https://x.supabase.co";
            /* O DOMÍNIO CANÔNICO (Story 3.4): a gaveta precisa dele para pedir
               ao domínio o que será herdado. Ele é passado de fora, como a raiz
               do projeto — e a gaveta montada SEM ele é exercitada adiante, na
               seção da herança, onde o defeito de montagem tem de aparecer
               NOMEADO em vez de virar silêncio. */
            const DOMINIO_DO_SITE = "https://chatclean.com.br";
            const CATEGORIAS_DA_CAPA = [
              {
                id: "cccccccc-1111-4111-8111-111111111111",
                nome: "Ática",
                slug: "atica",
                cor: modulo.categoriasDoDominio.CORES_DE_CATEGORIA[1],
                icone: modulo.categoriasDoDominio.CHAVES_DE_ICONE_DE_CATEGORIA[0],
                ordem: 1,
              },
            ];
            let valores = {
              titulo: "",
              slug: "",
              resumo: "",
              imagem_url: "",
              imagem_alt: "",
              categoria_id: "",
              tags: "",
              publicado_em: "",
              tempo_leitura: "",
              seo_titulo: "",
              seo_descricao: "",
              seo_imagem_url: "",
            };
            let situacao = capa.ENVIO_PARADO;
            let recusa = null;
            const escolhidos = [];
            let removeu = 0;
            const desenhar = () =>
              React.createElement(modulo.GavetaDeMetadados, {
                valores,
                categorias: CATEGORIAS_DA_CAPA,
                /* A RAIZ DO PROJETO (Story 3.2). A gaveta não a adivinha: sem
                   ela, um endereço com a FORMA de capa pública seria julgado
                   nosso, e a capa de outro projeto Supabase abriria no modo de
                   envio com o endereço escondido num campo que ninguém opera.
                   É a mesma raiz de `ENDERECO`, mais abaixo. */
                baseDaCapaDoProjeto: BASE_DO_PROJETO,
                /* UM ENVIO POR CAMPO (Story 3.4): a gaveta tem dois controles
                   de imagem, e uma situação compartilhada faria o giro de um
                   aparecer sobre o outro. As asserções desta seção falam da
                   CAPA, e é o envio dela que a montagem move. */
                envios: { imagem_url: { situacao, recusa } },
                dominioDoSite: DOMINIO_DO_SITE,
                aoEscolherArquivo: (campoDaImagem, a) =>
                  escolhidos.push({ campo: campoDaImagem, arquivo: a }),
                aoRemoverImagem: (campoDaImagem) => {
                  removeu += 1;
                  valores = {
                    ...valores,
                    [campoDaImagem]: "",
                    ...(campoDaImagem === "imagem_url" ? { imagem_alt: "" } : {}),
                  };
                  raizReact.render(desenhar());
                },
                aoMudar: (campo, valor) => {
                  valores = { ...valores, [campo]: valor };
                  raizReact.render(desenhar());
                },
              });
            await act(async () => {
              raizReact.render(desenhar());
            });

            /* A ORDEM DOS CAMPOS. A capa é conteúdo: ela entra entre Resumo e
               Categoria, e a ordem é lida do DOCUMENTO — não da lista que a
               declara, que provaria a lista contra si mesma.

               ─── UMA LEITURA SÓ, PARA OS DOIS MODOS (Story 3.2) ──────────
               O modo de fora tem outro controle no lugar do seletor de
               arquivo, e a asserção de lá começou com uma leitura própria: sem
               o mapa e sem a adjacência. Renomear `arquivo-da-capa` quebraria
               uma e passaria pela outra, que é a divergência silenciosa que
               duas cópias sempre produzem. A leitura é uma, e as duas a usam. */
            /* O CONTROLE DA CAPA É O SELETOR DE ARQUIVO no modo de envio, e é
               ele que representa `imagem_url` na ordem: o campo de endereço
               existe escondido e sem `data-campo` de propósito, porque não é
               operável. No modo de fora o campo de endereço passa a ser o
               controle, e aí ele já se chama `imagem_url`. A tradução é
               declarada aqui, e não presumida. */
            /* A tradução vem do MAPA DECLARADO em `capa.js` (Story 3.4), e não
               de dois pares escritos aqui: os dois campos de imagem usam o
               mesmo componente, e um terceiro campo de imagem entraria lá e
               ficaria de fora daqui — a ordem passaria a ignorar em silêncio um
               controle que existe na tela. */
            const CONTROLE_DO_CAMPO = Object.fromEntries(
              capa.CAMPOS_DE_IMAGEM_DA_GAVETA.map((nome) => [
                capa.nomeDoSeletorDeArquivo(nome),
                nome,
              ]),
            );
            const ordemDosCampos = () =>
              [...alvo.querySelectorAll("[data-campo]")]
                .map((e) => e.getAttribute("data-campo"))
                .map((n) => CONTROLE_DO_CAMPO[n] ?? n)
                .filter((n) => regrasDosMetadados.CAMPOS_DA_GAVETA.includes(n));
            /** A ordem desenhada é a declarada, com a capa entre Resumo e Categoria? */
            const ordemConfere = (ordem) =>
              ordem.join(",") === regrasDosMetadados.CAMPOS_DA_GAVETA.join(",") &&
              ordem.indexOf("imagem_url") === ordem.indexOf("resumo") + 1 &&
              ordem.indexOf("imagem_alt") === ordem.indexOf("imagem_url") + 1 &&
              ordem.indexOf("categoria_id") === ordem.indexOf("imagem_alt") + 1;
            {
              const ordem = ordemDosCampos();
              afirmar(
                "a gaveta desenha os campos na ordem que `CAMPOS_DA_GAVETA` declara, com a capa entre Resumo e Categoria",
                ordemConfere(ordem),
                `desenhada: ${ordem.join(",")} | declarada: ${regrasDosMetadados.CAMPOS_DA_GAVETA.join(",")}`,
              );
            }

            /* O CAMPO DE DESCRIÇÃO É OFERECIDO JUNTO DA IMAGEM — a promessa
               central da story do lado da tela. Junto quer dizer no MESMO
               formulário e adjacente, e é isso que a asserção mede. */
            const seletor = alvo.querySelector('[data-campo="arquivo-da-capa"]');
            const descricao = alvo.querySelector('[data-campo="imagem_alt"]');
            afirmar(
              "o campo de texto alternativo é oferecido JUNTO da imagem — não num bloco de acessibilidade no fim",
              seletor !== null &&
                descricao !== null &&
                descricao.tagName === "TEXTAREA" &&
                seletor.compareDocumentPosition(descricao) &
                  janela.Node.DOCUMENT_POSITION_FOLLOWING,
              `seletor: ${seletor !== null} | descrição: ${descricao?.tagName ?? "ausente"}`,
            );

            /* O SELETOR OFERECE O QUE O VOCABULÁRIO ACEITA — derivado, e não
               escrito à mão: um `accept` fora de sincronia ofereceria ao
               Autor um formato que o envio recusaria em seguida. */
            afirmar(
              "o seletor de arquivo aceita exatamente as espécies do vocabulário do domínio",
              seletor?.getAttribute("accept") === doArquivo.TIPOS_DE_IMAGEM.join(",") &&
                doArquivo.TIPOS_DE_IMAGEM.length === 3,
              seletor?.getAttribute("accept") ?? "sem accept",
            );

            /* A AJUDA DIZ O LIMITE ANTES DE A PESSOA ESCOLHER. Dizer só
               depois da recusa é deixar quem tem um arquivo de 4 MB
               descobrir esperando. */
            afirmar(
              "a gaveta diz o limite e as espécies ANTES da escolha, e o número vem do vocabulário",
              (alvo.textContent ?? "").includes(
                doArquivo.formatarTamanho(doArquivo.TAMANHO_MAXIMO_DA_IMAGEM),
              ) &&
                doArquivo.ROTULOS_DE_IMAGEM.every((r) => (alvo.textContent ?? "").includes(r)),
              (alvo.textContent ?? "").slice(0, 200),
            );

            /* SEM CAPA: não há miniatura, e o recurso é DITO — um espaço em
               branco não informa que a capa é opcional. */
            afirmar(
              "sem capa não há miniatura, e a ausência é DITA em vez de ser um espaço em branco",
              alvo.querySelector('[data-papel="miniatura-da-capa"]') === null &&
                alvo.querySelector('[data-papel="capa-ausente"]') !== null,
              alvo.querySelector('[data-papel="capa-ausente"]')?.textContent ?? "nada",
            );

            /* ENQUANTO ENVIA: a indicação aparece, numa REGIÃO VIVA, e o
               seletor fica indisponível — escolher outro arquivo no meio do
               envio produziria dois envios e uma capa imprevisível. */
            await act(async () => {
              situacao = capa.ENVIO_EM_CURSO;
              raizReact.render(desenhar());
            });
            const emCurso = alvo.querySelector('[data-papel="envio-em-curso"]');
            afirmar(
              "durante o envio a indicação APARECE, como região viva, e diz o que está acontecendo",
              emCurso !== null &&
                emCurso.getAttribute("data-enviando") === "true" &&
                emCurso.getAttribute("role") === "status" &&
                emCurso.getAttribute("aria-live") === "polite" &&
                (emCurso.textContent ?? "").includes(capa.FALA_DO_ENVIO_EM_CURSO),
              `${emCurso?.getAttribute("role")} | ${emCurso?.textContent}`,
            );
            afirmar(
              "e a indicação NÃO desenha percentual: não há `progressbar` com valor, nem número na tela",
              alvo.querySelector('[role="progressbar"]') === null &&
                !/[0-9]+\s*%/.test(emCurso?.textContent ?? ""),
              emCurso?.textContent ?? "",
            );
            afirmar(
              "e o seletor fica indisponível enquanto o arquivo sobe — dois envios produziriam uma capa imprevisível",
              alvo.querySelector('[data-campo="arquivo-da-capa"]')?.disabled === true,
              String(alvo.querySelector('[data-campo="arquivo-da-capa"]')?.disabled),
            );

            /* AO CONCLUIR: a indicação SOME e a miniatura aparece — e ela
               aponta para o endereço PÚBLICO, que é o mesmo que o site vai
               usar. Uma pré-visualização local existiria mesmo se o envio
               tivesse falhado. */
            const ENDERECO =
              "https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/0a1b2c3d-4e5f-6789-abcd-ef0123456789.png";
            await act(async () => {
              situacao = capa.ENVIO_PARADO;
              valores = { ...valores, imagem_url: ENDERECO };
              raizReact.render(desenhar());
            });
            const miniatura = alvo.querySelector('[data-papel="miniatura-da-capa"]');
            /* A REGIÃO VIVA CONTINUA MONTADA, e o que muda é o TEXTO. Ela
               era escondida com `hidden`, e região viva que aparece e some é
               anunciada de forma inconsistente: alguns leitores só leem o que
               MUDA dentro de uma região que já estava no documento. */
            afirmar(
              "ao concluir, a indicação SOME e a miniatura aparece — apontando para o endereço público, o mesmo que o site usa",
              alvo.querySelector('[data-papel="envio-em-curso"]')?.getAttribute("data-enviando") ===
                "false" &&
                (alvo.querySelector('[data-papel="envio-em-curso"]')?.textContent ?? "x") === "" &&
                /* E ELA CONTINUA NA ÁRVORE DE ACESSIBILIDADE. `hidden` a
                   tiraria de lá, e região viva que entra e sai do documento é
                   anunciada de forma inconsistente — alguns leitores só leem o
                   que MUDA dentro de uma região que já estava presente. Sem
                   esta cláusula, pôr `hidden` de volta passava verde. */
                alvo
                  .querySelector('[data-papel="envio-em-curso"]')
                  ?.hasAttribute("hidden") === false &&
                miniatura !== null &&
                miniatura.getAttribute("src") === ENDERECO &&
                alvo.querySelector('[data-papel="capa-ausente"]') === null,
              `miniatura: ${miniatura?.getAttribute("src") ?? "ausente"}`,
            );
            afirmar(
              "e a miniatura nunca fica sem descrição: sem texto alternativo ela diz que falta um, e nunca o endereço do arquivo",
              (miniatura?.getAttribute("alt") ?? "") ===
                capa.alternativoDaMiniatura("") &&
                !(miniatura?.getAttribute("alt") ?? "").includes("http"),
              miniatura?.getAttribute("alt") ?? "sem alt",
            );

            /* O SELETOR TEM NOME ACESSÍVEL, e o nome é o rótulo da seção.
               Ele é o único controle operável da capa — visualmente escondido
               e acionado pelo botão —, e o rótulo apontava para o campo de
               endereço, que ninguém opera: quem navega por leitor de tela ouvia
               "botão para escolher arquivo" e nada mais. */
            {
              const rotulo = [...alvo.querySelectorAll("label")].find(
                (l) => l.getAttribute("for") === seletor?.id,
              );
              afirmar(
                "o seletor de arquivo tem NOME ACESSÍVEL — o rótulo da seção aponta para ele, e não para o campo escondido do endereço",
                seletor !== null &&
                  rotulo !== undefined &&
                  (rotulo.textContent ?? "").trim().startsWith("Imagem de capa"),
                `rótulo do seletor: ${rotulo?.textContent ?? "NENHUM"}`,
              );
              /* E NO MODO DE ENVIO o endereço continua guardado num campo que
                 ninguém opera: `readOnly`, escondido, e SEM `data-campo` — quem
                 representa a capa na ordem dos campos é o seletor de arquivo.
                 O modo de fora é que troca isso, e é afirmado adiante. */
              const doEndereco = alvo.querySelector('[data-valor="imagem_url"]');
              afirmar(
                "no modo de envio o endereço fica guardado num campo `readOnly` e escondido — quem se opera é o seletor",
                doEndereco !== null &&
                  doEndereco.readOnly === true &&
                  doEndereco.hasAttribute("hidden") &&
                  doEndereco.getAttribute("data-campo") === null,
                `readOnly: ${doEndereco?.readOnly} | hidden: ${doEndereco?.hasAttribute("hidden")}`,
              );
            }

            /* A RECUSA DA DESCRIÇÃO DIZ QUAL DOS DOIS MOTIVOS É.
               `problemaNoTextoAlternativo` tem duas saídas — falta e teto —, e
               a versão anterior mostrava sempre a primeira: uma descrição longa
               demais era acusada de "precisa de uma descrição", com o campo
               cheio de texto na frente da pessoa. */
            {
              const longa = "a".repeat(doArquivo.TAMANHO_MAXIMO_DO_ALTERNATIVO + 1);
              await act(async () => {
                valores = { ...valores, imagem_url: ENDERECO, imagem_alt: longa };
                raizReact.render(desenhar());
              });
              const doCampo = alvo.querySelector('[data-campo="imagem_alt"]');
              /* O alvo do `aria-describedby`, buscado por identificador em vez de
                 seletor: `CSS.escape` é do navegador e não existe no Node, e o
                 identificador do React tem dois-pontos. */
              const dito = janela.document.getElementById(
                doCampo.getAttribute("aria-describedby"),
              );
              afirmar(
                "descrição longa demais é acusada PELO TETO, e não por “precisa de uma descrição” — são dois motivos e duas frases",
                doCampo?.getAttribute("aria-invalid") === "true" &&
                  (dito?.textContent ?? "").includes(
                    String(doArquivo.TAMANHO_MAXIMO_DO_ALTERNATIVO),
                  ) &&
                  (dito?.textContent ?? "") !==
                    regrasDosMetadados.FRASES_DE_FALTA.imagem_alt,
                `dito: ${dito?.textContent ?? "nada"}`,
              );
              /* E O TEXTO NÃO É CORTADO PELO CONTROLE. `maxLength` faria o
                 parágrafo colado sumir sem aviso; o que se quer é a recusa
                 explicando, com o texto ainda lá para a pessoa encurtar. */
              afirmar(
                "e o campo não corta o texto sozinho — quem cola um parágrafo vê a recusa, não o texto sumindo",
                doCampo?.value === longa && doCampo?.getAttribute("maxlength") === null,
                `valor com ${doCampo?.value?.length} caracteres | maxlength: ${doCampo?.getAttribute("maxlength")}`,
              );
              await act(async () => {
                valores = { ...valores, imagem_alt: "Uma descrição curta" };
                raizReact.render(desenhar());
              });
            }

            /* A CAPA QUE NÃO CARREGA DEGRADA PARA O MONOGRAMA (Story 3.2), e
               não para o ícone quebrado do navegador. E é o MESMO monograma que
               a linha da listagem desenha para o mesmo Post: duas respostas
               visuais para a mesma pergunta é o que a degradação existe para
               não ter.

               A FRASE continua, ao lado — ela responde outra pergunta. Sem ela
               o Autor salvaria um Post cuja capa não existe achando que ela
               está lá, que é o defeito que a Story 3.1 fechou. */
            {
              /* SEM CATEGORIA PRIMEIRO: o recurso é o mesmo símbolo neutro da
                 listagem, e o monograma é `""`. É a metade que some quando
                 alguém "simplifica" a degradação para exigir Categoria. */
              const img = alvo.querySelector('[data-papel="miniatura-da-capa"]');
              await act(async () => {
                img.dispatchEvent(new janela.Event("error", { bubbles: false }));
              });
              const semCategoria = alvo.querySelector('[data-papel="capa-degradada"]');
              afirmar(
                "capa que não carrega e Post SEM Categoria degrada para o mesmo recurso neutro da listagem — e não para um espaço em branco",
                semCategoria !== null &&
                  semCategoria.getAttribute("data-monograma") === "" &&
                  /* O RECURSO, e não "algum ícone". `querySelector("svg")`
                     sozinho passa com qualquer desenho, e a promessa é que as
                     duas telas caiam no MESMO — que é o que o atributo diz. */
                  semCategoria.getAttribute("data-recurso") === "neutro" &&
                  semCategoria.querySelector("svg") !== null &&
                  alvo.querySelector('[data-papel="miniatura-da-capa"]') === null,
                `monograma: ${JSON.stringify(semCategoria?.getAttribute("data-monograma"))} | recurso: ${semCategoria?.getAttribute("data-recurso")}`,
              );

              /* AGORA COM CATEGORIA: a letra vem da MESMA função que a listagem
                 usa, e a comparação é com a função — não com um `"Á"` escrito à
                 mão, que passaria mesmo se as duas telas divergissem. */
              await act(async () => {
                valores = { ...valores, categoria_id: CATEGORIAS_DA_CAPA[0].id };
                raizReact.render(desenhar());
              });
              const comCategoria = alvo.querySelector('[data-papel="capa-degradada"]');
              const daListagem = modulo.regrasDaListagem.monogramaDoNome(
                CATEGORIAS_DA_CAPA[0].nome,
              );
              afirmar(
                "e com Categoria ela degrada para o MONOGRAMA da Categoria — a mesma letra que a listagem desenha, pela mesma função",
                comCategoria !== null &&
                  daListagem !== "" &&
                  comCategoria.getAttribute("data-monograma") === daListagem &&
                  (comCategoria.textContent ?? "").trim() === daListagem,
                `desenhado: ${JSON.stringify(comCategoria?.getAttribute("data-monograma"))} | listagem: ${JSON.stringify(daListagem)}`,
              );
              /* E O INVÓLUCRO QUE RECEBE POST CONTINUA VALENDO: a listagem
                 chama `monogramaDaCategoria(post)`, e as duas portas precisam
                 dar a mesma resposta para a mesma Categoria. */
              afirmar(
                "e as duas portas do monograma concordam — a que recebe nome e a que recebe Post",
                modulo.regrasDaListagem.monogramaDaCategoria({
                  categoria: { nome: CATEGORIAS_DA_CAPA[0].nome },
                }) === daListagem &&
                  modulo.regrasDaListagem.monogramaDaCategoria({}) === "" &&
                  modulo.regrasDaListagem.monogramaDoNome("  ") === "",
                `post: ${modulo.regrasDaListagem.monogramaDaCategoria({ categoria: { nome: CATEGORIAS_DA_CAPA[0].nome } })} | nome: ${daListagem}`,
              );
              /* O LAYOUT NÃO QUEBRA: o monograma ocupa exatamente o espaço que
                 a imagem ocuparia — a mesma proporção da miniatura. */
              afirmar(
                "e a degradação ocupa o espaço da imagem — mesma proporção da miniatura, layout intacto",
                /aspect-\[16\/9\]/.test(comCategoria?.className ?? "") &&
                  /w-full/.test(comCategoria?.className ?? ""),
                comCategoria?.className ?? "",
              );
              const quebrada = alvo.querySelector('[data-papel="capa-quebrada"]');
              afirmar(
                "e a frase que diz o que houve e o que fazer continua ao lado — o monograma não avisa que a capa morreu",
                quebrada !== null &&
                  quebrada.getAttribute("role") === "alert" &&
                  (quebrada.textContent ?? "").trim() === capa.FALA_DA_CAPA_QUEBRADA,
                quebrada?.textContent ?? "nada",
              );
              /* E A CAIXA É ANUNCIADA. Na listagem ela é decorativa, porque a
                 linha inteira diz título e Categoria em texto; aqui não há esse
                 texto em volta, e `aria-hidden` deixava quem usa leitor de tela
                 sem NADA no lugar da capa — sem saber se ela existe, se sumiu ou
                 se nunca foi posta. */
              afirmar(
                "e a caixa da degradação é ANUNCIADA, com a fala do módulo puro — na gaveta ela não pode ser decorativa como na linha da listagem",
                comCategoria?.getAttribute("role") === "img" &&
                  comCategoria?.getAttribute("aria-label") ===
                    capa.rotuloDaCapaDegradada({
                      categoria: CATEGORIAS_DA_CAPA[0].nome,
                      situacao: capa.CAPA_QUE_NAO_CARREGOU,
                    }) &&
                  comCategoria?.hasAttribute("aria-hidden") === false &&
                  (comCategoria?.getAttribute("aria-label") ?? "").includes(
                    CATEGORIAS_DA_CAPA[0].nome,
                  ),
                `role: ${comCategoria?.getAttribute("role")} | nome: ${comCategoria?.getAttribute("aria-label")}`,
              );
              /* E AS TRÊS FALAS SÃO TRÊS. Uma só respondendo pelas três diria
                 "não carregou" sobre um Post que nunca teve capa. */
              afirmar(
                "e a fala da caixa distingue as três situações — sem capa, não carregou, e endereço que não serve",
                new Set(
                  capa.SITUACOES_DA_CAPA_DEGRADADA.map((sit) =>
                    capa.rotuloDaCapaDegradada({ categoria: "Ática", situacao: sit }),
                  ),
                ).size === 3 &&
                  capa.SITUACOES_DA_CAPA_DEGRADADA.length === 3 &&
                  capa.rotuloDaCapaDegradada({ situacao: "inventada" }) ===
                    capa.rotuloDaCapaDegradada({ situacao: capa.CAPA_AUSENTE }),
                capa.SITUACOES_DA_CAPA_DEGRADADA.map((sit) =>
                  capa.rotuloDaCapaDegradada({ situacao: sit }),
                ).join(" | "),
              );
              await act(async () => {
                valores = { ...valores, categoria_id: "" };
                raizReact.render(desenhar());
              });
              /* E TROCAR A CAPA DEVOLVE O BENEFÍCIO DA DÚVIDA: uma falha antiga
                 não pode condenar a imagem seguinte. */
              await act(async () => {
                valores = {
                  ...valores,
                  imagem_url: ENDERECO.replace("0a1b2c3d", "0a1b2c3e"),
                };
                raizReact.render(desenhar());
              });
              afirmar(
                "e trocar a capa volta a tentar desenhar — a falha é do endereço anterior, não da seção",
                alvo.querySelector('[data-papel="miniatura-da-capa"]') !== null &&
                  alvo.querySelector('[data-papel="capa-quebrada"]') === null &&
                  alvo.querySelector('[data-papel="capa-degradada"]') === null,
                "a miniatura não voltou depois da troca",
              );
              await act(async () => {
                valores = { ...valores, imagem_url: ENDERECO };
                raizReact.render(desenhar());
              });
            }
            /* E A DESCRIÇÃO PASSA A SER OBRIGATÓRIA quando há capa: é a
               regra que o banco impõe desde a Story 2.1, dita na tela ANTES
               de o salvamento falhar. */
            {
              const rotulo = [...alvo.querySelectorAll("label")].find(
                (l) => l.getAttribute("for") === descricao?.id,
              );
              afirmar(
                "com capa, a descrição é anunciada como OBRIGATÓRIA — por extenso, e não por asterisco",
                (rotulo?.textContent ?? "").includes("obrigatório"),
                rotulo?.textContent ?? "sem rótulo",
              );
            }

            /* A DESCRIÇÃO DIGITADA CHEGA À MINIATURA. */
            await act(async () => {
              valores = { ...valores, imagem_alt: "Uma sala de reunião" };
              raizReact.render(desenhar());
            });
            afirmar(
              "a descrição digitada vira o texto alternativo da própria miniatura",
              alvo.querySelector('[data-papel="miniatura-da-capa"]')?.getAttribute("alt") ===
                "Uma sala de reunião",
              alvo.querySelector('[data-papel="miniatura-da-capa"]')?.getAttribute("alt") ?? "",
            );

            /* REMOVER A CAPA limpa o par inteiro. */
            {
              const botao = alvo.querySelector('[data-acao-da-capa="remover"]');
              await act(async () => {
                botao?.dispatchEvent(new janela.MouseEvent("click", { bubbles: true }));
              });
              afirmar(
                "remover a capa limpa o endereço E a descrição — descrição órfã viraria o texto da próxima imagem",
                removeu === 1 &&
                  valores.imagem_url === "" &&
                  valores.imagem_alt === "" &&
                  alvo.querySelector('[data-papel="miniatura-da-capa"]') === null,
                JSON.stringify({ removeu, ...valores }),
              );
            }

            /* A RECUSA APARECE NO CAMPO, com a frase de quem recusou — e a
               gaveta não a inventa: quem sabe o limite é o vocabulário. */
            {
              const frase = doArquivo.recusaDeTamanho(doArquivo.TAMANHO_MAXIMO_DA_IMAGEM + 1);
              await act(async () => {
                situacao = capa.ENVIO_RECUSADO;
                recusa = frase;
                raizReact.render(desenhar());
              });
              const campoDoArquivo = alvo.querySelector('[data-campo="arquivo-da-capa"]');
              const alerta = [...alvo.querySelectorAll('[role="alert"]')].find((e) =>
                (e.textContent ?? "").includes(frase),
              );
              afirmar(
                "a recusa aparece no campo, marcada e ligada por `aria-describedby` — quem usa leitor de tela recebe o motivo",
                campoDoArquivo?.getAttribute("aria-invalid") === "true" &&
                  alerta !== undefined &&
                  campoDoArquivo?.getAttribute("aria-describedby") === alerta.id,
                `invalid: ${campoDoArquivo?.getAttribute("aria-invalid")} | descrito por: ${campoDoArquivo?.getAttribute("aria-describedby")} | alerta: ${alerta?.id}`,
              );
              afirmar(
                "e a frase mostrada DIZ O LIMITE — a gaveta não a inventa, ela vem de quem recusou",
                (alerta?.textContent ?? "").includes(
                  doArquivo.formatarTamanho(doArquivo.TAMANHO_MAXIMO_DA_IMAGEM),
                ),
                alerta?.textContent ?? "",
              );
            }

            /* E A GAVETA CONTINUA SEM CONHECER REDE. Ela emite o arquivo e
               nada mais — a asserção é sobre o CÓDIGO porque "não fala com a
               rede" é ausência, e ausência não se observa montando. */
            {
              const codigo = mascararComentariosJs(ler(CAMINHO_GAVETA));
              const daRede =
                /(?<!Array)\.from\s*\(|createClient|\bfetch\s*\(|\bupload\s*\(|storage/i;
              afirmar(
                "a gaveta continua sem conhecer rede: nem cliente, nem envio, nem Storage — ela emite o arquivo e desenha a situação",
                !daRede.test(codigo) &&
                  /aoEscolherArquivo/.test(codigo),
                (daRede.exec(codigo) ?? [])[0] ?? "",
              );
              afirmar(
                "e o detector acusa um envio de verdade, sem confundi-lo com `Array.from`",
                daRede.test('cliente.storage.from("b").upload(c, a)') &&
                  daRede.test("await fetch(rota)") &&
                  !daRede.test("Array.from({ length: 4 }, (_, i) => i)"),
              );
            }

            /* O ARQUIVO ESCOLHIDO É EMITIDO, e o seletor é REARMADO — sem
               isso, escolher o mesmo arquivo depois de uma recusa não
               dispara evento nenhum e a tela parece travada. */
            {
              await act(async () => {
                situacao = capa.ENVIO_PARADO;
                recusa = null;
                raizReact.render(desenhar());
              });
              const campoDoArquivo = alvo.querySelector('[data-campo="arquivo-da-capa"]');
              const arquivoFalso = { name: "capa.png", size: 10, type: "image/png" };
              Object.defineProperty(campoDoArquivo, "files", {
                configurable: true,
                get: () => [arquivoFalso],
              });
              await act(async () => {
                campoDoArquivo.dispatchEvent(new janela.Event("change", { bubbles: true }));
              });
              afirmar(
                "o arquivo escolhido é EMITIDO para quem monta a tela, NOMEANDO o campo — a gaveta não o guarda nem o manda",
                escolhidos.length === 1 &&
                  escolhidos[0].arquivo === arquivoFalso &&
                  /* O CAMPO VIAJA JUNTO (Story 3.4). Sem ele, os dois controles
                     de imagem emitiriam pedidos indistinguíveis e o Editor
                     gravaria a capa no lugar da imagem de compartilhamento. */
                  escolhidos[0].campo === "imagem_url",
                `emitidos: ${escolhidos.length} | ${JSON.stringify(escolhidos[0]?.campo)}`,
              );
              afirmar(
                "e o seletor é rearmado — escolher o MESMO arquivo de novo depois de uma recusa precisa disparar",
                campoDoArquivo.value === "",
                JSON.stringify(campoDoArquivo.value),
              );
            }

            /* ═══ OS DOIS MODOS DA CAPA (Story 3.2) ═══════════════════════
               Enviar arquivo ou informar endereço. O que o Post guarda é o
               mesmo nos dois casos, e por isso o modo é estado de TELA — o que
               se prova aqui é que ele existe, que cada controle tem nome, que
               alternar não perde nada, e que o endereço é recusado ANTES do
               salvamento com a frase certa. */
            {
              /* — O VOCABULÁRIO É FECHADO, E NÃO COLIDE — */
              afirmar(
                "as origens da capa são um vocabulário FECHADO, com rótulo para cada uma",
                Array.isArray(capa.ORIGENS_DA_CAPA) &&
                  Object.isFrozen(capa.ORIGENS_DA_CAPA) &&
                  capa.ORIGENS_DA_CAPA.length === 2 &&
                  capa.ehOrigemDaCapa(capa.ORIGEM_ENVIADA) &&
                  capa.ehOrigemDaCapa(capa.ORIGEM_DE_FORA) &&
                  !capa.ehOrigemDaCapa("arquivo") &&
                  capa.ORIGENS_DA_CAPA.every((o) => capa.rotuloDaOrigem(o).trim() !== "") &&
                  capa.rotuloDaOrigem("inventada") === "",
                JSON.stringify(capa.ORIGENS_DA_CAPA),
              );
              {
                const outras = [
                  ...capa.SITUACOES_DO_ENVIO,
                  ...Object.values(modulo.regrasDaPrevia ?? {}),
                  ...Object.values(modulo.regrasDoBlogPublico ?? {}),
                ].filter((v) => typeof v === "string");
                const colisoes = capa.ORIGENS_DA_CAPA.filter((v) => outras.includes(v));
                afirmar(
                  "e elas não colidem com as situações do envio, da prévia nem do blog público — interseção vazia",
                  colisoes.length === 0,
                  colisoes.join(", "),
                );
              }

              /* — O MODO É DERIVADO DO ENDEREÇO, e a função é pura — */
              const DE_FORA = "https://cdn.exemplo.com/foto.jpg";
              afirmar(
                "o modo em que o campo nasce é DERIVADO do endereço: capa do bucket abre em envio, capa de fora abre no campo de endereço",
                capa.origemDoEndereco("", BASE_DO_PROJETO) === capa.ORIGEM_ENVIADA &&
                  capa.origemDoEndereco(ENDERECO, BASE_DO_PROJETO) === capa.ORIGEM_ENVIADA &&
                  capa.origemDoEndereco(DE_FORA, BASE_DO_PROJETO) === capa.ORIGEM_DE_FORA &&
                  capa.origemDoEndereco(null, BASE_DO_PROJETO) === capa.ORIGEM_ENVIADA,
                `bucket: ${capa.origemDoEndereco(ENDERECO, BASE_DO_PROJETO)} | de fora: ${capa.origemDoEndereco(DE_FORA, BASE_DO_PROJETO)}`,
              );
              /* ─── E A CAPA DE OUTRO PROJETO SUPABASE NÃO É NOSSA ────────
                 Ela tem a FORMA exata da nossa — mesmo prefixo do Storage,
                 mesmo bucket, mesma pasta —, e a primeira versão recortava a
                 raiz de dentro do próprio endereço e a classificava como
                 enviada. O efeito era o defeito que o docstring da função diz
                 existir para evitar: o endereço sumia dentro do campo
                 `readOnly`, invisível e ineditável, e quem fosse editá-lo não
                 tinha por onde.

                 E "não sei a raiz" responde DE FORA, não "nossa": errar para o
                 lado de mostrar custa um campo a mais; errar para o outro
                 esconde o valor. */
              {
                const DE_OUTRO_PROJETO =
                  "https://outro-projeto.example/storage/v1/object/public/imagens-do-blog/capas/abcdefgh.png";
                afirmar(
                  "a capa de OUTRO projeto Supabase é “de fora”, e não nossa — a raiz é a de verdade, e não a recortada do próprio endereço",
                  capa.origemDoEndereco(DE_OUTRO_PROJETO, BASE_DO_PROJETO) ===
                    capa.ORIGEM_DE_FORA,
                  capa.origemDoEndereco(DE_OUTRO_PROJETO, BASE_DO_PROJETO),
                );
                afirmar(
                  "e sem raiz nenhuma a resposta é “de fora” — mostrar o endereço é o erro barato; escondê-lo é o caro",
                  capa.origemDoEndereco(ENDERECO, "") === capa.ORIGEM_DE_FORA &&
                    capa.origemDoEndereco(ENDERECO) === capa.ORIGEM_DE_FORA,
                  capa.origemDoEndereco(ENDERECO, ""),
                );
              }

              /* — A TELA OFERECE OS DOIS, COM NOME ACESSÍVEL EM CADA UM — */
              await act(async () => {
                valores = { ...valores, imagem_url: ENDERECO, imagem_alt: "Uma sala" };
                raizReact.render(desenhar());
              });
              const grupo = alvo.querySelector('[data-papel="origem-da-capa"]');
              /* AS OPÇÕES SÃO LIDAS DE DENTRO DO GRUPO, e não do documento: a
                 gaveta tem DOIS controles de imagem desde a Story 3.4, e uma
                 busca no documento inteiro traria as quatro — a asserção
                 passaria a falar de um grupo que não é este. */
              const opcoes = [...grupo.querySelectorAll("[data-origem-da-capa]")];
              afirmar(
                "a gaveta oferece as DUAS origens num grupo nomeado, e cada opção tem nome acessível pelo rótulo que a envolve",
                grupo !== null &&
                  grupo.getAttribute("role") === "radiogroup" &&
                  grupo.getAttribute("aria-label") === capa.ROTULO_DA_ORIGEM_DA_CAPA &&
                  opcoes.length === 2 &&
                  opcoes.every((o) => o.type === "radio") &&
                  capa.ORIGENS_DA_CAPA.every((valor, i) => {
                    const controle = opcoes[i];
                    const rotulo = controle.closest("label");
                    return (
                      controle.getAttribute("data-origem-da-capa") === valor &&
                      rotulo !== null &&
                      (rotulo.textContent ?? "").trim() === capa.rotuloDaOrigem(valor)
                    );
                  }),
                `grupo: ${grupo?.getAttribute("aria-label")} | opções: ${opcoes.map((o) => o.getAttribute("data-origem-da-capa")).join(", ")}`,
              );
              afirmar(
                "e com capa do bucket a origem marcada é a de ENVIO — o modo derivado é o que a tela mostra",
                grupo?.getAttribute("data-origem") === capa.ORIGEM_ENVIADA &&
                  opcoes[0].checked === true &&
                  opcoes[1].checked === false,
                String(grupo?.getAttribute("data-origem")),
              );

              /* — ALTERNAR: o campo de endereço aparece e vira O campo — */
              //
              // Clique de verdade no rádio: é o evento que o React escuta para
              // `onChange` em rádio e caixa, e é a activation behavior do jsdom
              // que marca o controle. E o valor do campo de texto vai pelo
              // `setter` NATIVO — o React guarda o último valor no próprio nó e
              // ignoraria um evento cujo valor ele acredita já ter visto.
              const escolherOrigem = async (valor) => {
                const controle = alvo.querySelector(`[data-origem-da-capa="${valor}"]`);
                await act(async () => {
                  controle.dispatchEvent(new janela.MouseEvent("click", { bubbles: true }));
                });
              };
              const escreverEndereco = async (texto) => {
                const controle = alvo.querySelector('[data-campo="imagem_url"]');
                const setter = Object.getOwnPropertyDescriptor(
                  janela.HTMLInputElement.prototype,
                  "value",
                ).set;
                await act(async () => {
                  setter.call(controle, texto);
                  controle.dispatchEvent(new janela.Event("input", { bubbles: true }));
                });
              };
              await escolherOrigem(capa.ORIGEM_DE_FORA);
              const doEndereco = alvo.querySelector('[data-campo="imagem_url"]');
              afirmar(
                "escolher “informar endereço” faz aparecer um campo DIGITÁVEL de endereço — e ele deixa de ser o campo escondido e `readOnly`",
                doEndereco !== null &&
                  doEndereco.readOnly === false &&
                  doEndereco.hasAttribute("hidden") === false &&
                  doEndereco.disabled === false &&
                  alvo.querySelector('[data-campo="arquivo-da-capa"]') === null,
                `campo: ${doEndereco?.tagName} | readOnly: ${doEndereco?.readOnly}`,
              );
              {
                const rotulo = [...alvo.querySelectorAll("label")].find(
                  (l) => l.getAttribute("for") === doEndereco?.id,
                );
                afirmar(
                  "e o rótulo “Imagem de capa” passa a apontar para ELE — o rótulo nomeia o controle que a pessoa opera, nos dois modos",
                  rotulo !== undefined &&
                    (rotulo.textContent ?? "").trim().startsWith("Imagem de capa"),
                  `rótulo do endereço: ${rotulo?.textContent ?? "NENHUM"}`,
                );
              }
              /* A ORDEM DOS CAMPOS SOBREVIVE À TROCA DE MODO: no modo de fora
                 quem representa `imagem_url` é o próprio campo de endereço. */
              {
                /* A MESMA LEITURA do modo de envio — mapa e adjacência
                   inclusive. Uma segunda leitura aqui divergiria da de lá na
                   primeira renomeação de `data-campo`. */
                const ordem = ordemDosCampos();
                /* E UM CONTROLE SÓ REPRESENTA A CAPA. Montar os dois ao mesmo
                   tempo daria à pessoa dois lugares para dizer a mesma coisa —
                   e a leitura acima não o pegaria, porque o mapa traduz os dois
                   para o mesmo nome. */
                const daCapa = alvo.querySelectorAll(
                  '[data-campo="arquivo-da-capa"], [data-campo="imagem_url"]',
                );
                afirmar(
                  "e a ordem dos campos continua a que `CAMPOS_DA_GAVETA` declara, com a mesma adjacência — o campo de endereço ocupa o lugar do seletor, e não um lugar a mais",
                  ordemConfere(ordem) && daCapa.length === 1,
                  `desenhada: ${ordem.join(",")} | controles da capa: ${daCapa.length}`,
                );
              }

              /* — ALTERNAR NÃO PERDE O QUE ESTAVA NO OUTRO MODO — */
              afirmar(
                "alternar para o endereço não arrasta a capa enviada para dentro do campo — o campo de fora nasce vazio",
                doEndereco.value === "" && valores.imagem_url === "",
                `campo: ${JSON.stringify(doEndereco.value)} | valores: ${JSON.stringify(valores.imagem_url)}`,
              );
              await escreverEndereco(DE_FORA);
              afirmar(
                "o endereço digitado vira o valor do formulário e a PRÉ-VISUALIZAÇÃO aparece — a mesma miniatura, pelo endereço informado",
                valores.imagem_url === DE_FORA &&
                  alvo
                    .querySelector('[data-papel="miniatura-da-capa"]')
                    ?.getAttribute("src") === DE_FORA,
                `valor: ${JSON.stringify(valores.imagem_url)} | miniatura: ${alvo.querySelector('[data-papel="miniatura-da-capa"]')?.getAttribute("src")}`,
              );
              await escolherOrigem(capa.ORIGEM_ENVIADA);
              afirmar(
                "voltar para “enviar arquivo” DEVOLVE a capa que estava lá — o Autor pode voltar atrás sem reenviar",
                valores.imagem_url === ENDERECO &&
                  alvo.querySelector('[data-campo="arquivo-da-capa"]') !== null &&
                  alvo.querySelector('[data-campo="imagem_url"]') === null,
                JSON.stringify(valores.imagem_url),
              );
              await escolherOrigem(capa.ORIGEM_DE_FORA);
              afirmar(
                "e voltar de novo para o endereço devolve o que tinha sido DIGITADO — a preservação vale nos dois sentidos, e não só num",
                valores.imagem_url === DE_FORA &&
                  alvo.querySelector('[data-campo="imagem_url"]')?.value === DE_FORA,
                JSON.stringify(valores.imagem_url),
              );

              /* ─── E A DESCRIÇÃO VIAJA COM A IMAGEM DELA ─────────────────
                 O par capa + descrição é UM: `removerCapa` limpa os dois de
                 propósito, e o motivo está escrito lá — descrição órfã de uma
                 imagem que não existe mais reaparece como texto alternativo da
                 próxima capa. Alternar de modo levando só o endereço tinha
                 exatamente esse efeito: o Autor trocava de origem, colava outro
                 endereço, e salvava descrevendo a foto anterior.

                 A preservação vale para o par inteiro: cada modo guarda a SUA
                 descrição, e reencontra a dela ao voltar. */
              {
                const ALT_DE_FORA = "Um telhado de vidro";
                await act(async () => {
                  valores = { ...valores, imagem_alt: ALT_DE_FORA };
                  raizReact.render(desenhar());
                });
                await escolherOrigem(capa.ORIGEM_ENVIADA);
                afirmar(
                  "voltar para o arquivo devolve a descrição DAQUELA imagem — a do endereço não cola na capa enviada",
                  valores.imagem_url === ENDERECO &&
                    valores.imagem_alt === "Uma sala",
                  JSON.stringify({ url: valores.imagem_url, alt: valores.imagem_alt }),
                );
                await escolherOrigem(capa.ORIGEM_DE_FORA);
                afirmar(
                  "e voltar para o endereço devolve a descrição dele — o par viaja junto, nos dois sentidos",
                  valores.imagem_url === DE_FORA && valores.imagem_alt === ALT_DE_FORA,
                  JSON.stringify({ url: valores.imagem_url, alt: valores.imagem_alt }),
                );
              }

              /* — A RECUSA DO ENDEREÇO, ANTES DO SALVAMENTO, DIZENDO O QUÊ — */
              //
              // QUATRO motivos e quatro frases, e elas moram no DOMÍNIO, ao
              // lado da regra e de `problemaNoTextoAlternativo` — não num
              // módulo de tela, que faria o montador puro do corpo do pedido
              // depender de interface.
              //
              // Uma frase só respondendo por todos faria
              // `https://exemplo.com/café.jpg` ser acusado de esquema errado e
              // `data:` de endereço torto: mandar a pessoa consertar a coisa
              // errada é pior que não dizer nada. É a mesma correção que a
              // Story 3.1 fez na descrição da imagem.
              {
                const doDominio = modulo.arquivosDoDominio;
                const problema = doDominio.problemaNoEnderecoDaImagem;
                const LONGO =
                  "https://cdn.exemplo.com/" +
                  "a".repeat(doDominio.TAMANHO_MAXIMO_DO_ENDERECO);
                const CASOS = [
                  ["esquema", "data:image/png;base64,iVBORw0KGgo="],
                  ["esquema", "javascript:alert(1)"],
                  ["esquema", "blob:https://x.co/9a1f"],
                  ["esquema", "/capas/relativa.png"],
                  ["esquema", "http://cdn.exemplo.com/foto.jpg"],
                  ["teto", LONGO],
                  /* OS QUE A TERCEIRA FRASE ACUSAVA DE "endereço torto": eles
                     morrem na cláusula de CARACTERE, e a fala tem de dizer
                     isso — a pessoa que colou um endereço com acento não tem o
                     que conferir em "o caminho do arquivo, sem espaços". */
                  ["caractere", "https://exemplo.com/café.jpg"],
                  ["caractere", "https://cdn exemplo.com/foto.jpg"],
                  ['caractere', 'https://cdn.exemplo.com/foto.jpg?t=<script>'],
                  ["caractere", "https://cdn.exemplo.com/fo to.jpg"],
                  /* E os que sobram de verdade: esquema certo, site errado. */
                  ["site", "https://usuario:senha@cdn.exemplo.com/foto.jpg"],
                  ["site", "https://"],
                  ["site", "https://cdn.exemplo.com:99999999/foto.jpg"],
                ];
                const semRecusa = CASOS.filter(([, e]) => problema(e) === null);
                afirmar(
                  "todo endereço que o vocabulário recusa é recusado ANTES do salvamento, com frase — nenhum deles chega ao banco como violação crua",
                  semRecusa.length === 0,
                  semRecusa.map(([, e]) => e.slice(0, 50)).join(" | "),
                );

                /* CADA MOTIVO TEM A SUA FRASE, e é a frase certa para o caso —
                   não quatro frases distribuídas de qualquer jeito. A tabela
                   acima diz qual é qual, e a comparação é com a constante
                   exportada, e não com um texto repetido aqui. */
                const FALA_DO_MOTIVO = {
                  teto: doDominio.RECUSA_DE_ENDERECO_LONGO,
                  caractere: doDominio.RECUSA_DE_ENDERECO_COM_CARACTERE,
                  esquema: doDominio.RECUSA_DE_ENDERECO_SEM_ESQUEMA,
                  site: doDominio.RECUSA_DE_ENDERECO_SEM_SITE,
                };
                const trocados = CASOS.filter(
                  ([motivo, e]) => problema(e) !== FALA_DO_MOTIVO[motivo],
                );
                afirmar(
                  `cada um dos ${Object.keys(FALA_DO_MOTIVO).length} motivos recebe a SUA frase — acento não é acusado de esquema, e teto não é acusado de endereço torto`,
                  trocados.length === 0 &&
                    new Set(Object.values(FALA_DO_MOTIVO)).size === 4,
                  trocados
                    .map(([m, e]) => `${JSON.stringify(e.slice(0, 40))}: esperava ${m}`)
                    .join(" | "),
                );
                afirmar(
                  "e a do TETO diz o teto, a do ESQUEMA diz o que se aceita, e a de CARACTERE nomeia o que não vale",
                  /* As frases são lidas com um padrão para nulo: uma
                     implementação que devolvesse `null` para tudo derrubaria a
                     ferramenta com `TypeError` em vez de acusar, e sabotagem
                     que quebra o executor não é asserção que acusa. */
                  String(problema(LONGO) ?? "").includes(
                    String(doDominio.TAMANHO_MAXIMO_DO_ENDERECO),
                  ) &&
                    /https:\/\//.test(
                      String(problema("data:image/png;base64,iVBORw0KGgo=") ?? ""),
                    ) &&
                    /acento/i.test(String(problema("https://exemplo.com/café.jpg") ?? "")),
                  `${problema(LONGO)} || ${problema("https://exemplo.com/café.jpg")}`,
                );

                /* O VEREDITO É DE `enderecoDeImagemPermitido`, E NÃO UMA
                   SEGUNDA REGRA. Para todo endereço, "tem recusa" tem de ser
                   exatamente o contrário de "o domínio permite" — senão a
                   escolha de frase virou regra própria, e a tela passaria a
                   aceitar o que o banco recusa (ou o contrário). */
                afirmar(
                  "endereço vazio não é recusa nenhuma — capa é opcional, e a coluna aceita nulo",
                  problema("") === null &&
                    problema("   ") === null &&
                    problema(null) === null &&
                    doDominio.enderecoDeImagemPermitido(null) === true,
                  JSON.stringify(problema("")),
                );
                const CORPUS = [
                  ENDERECO,
                  DE_FORA,
                  "https://cdn.exemplo.com:8443/foto.jpg?v=2#topo",
                  "HttPs://cdn.exemplo.com/capa.png",
                  "http://localhost:3000/capa.png",
                  "http://127.0.0.1:54321/x.png",
                  "http://cdn.exemplo.com/capa.png",
                  "http://127.0.0.1.exemplo.com/capa.png",
                  "https://usuario:senha@cdn.exemplo.com/foto.jpg",
                  "https://",
                  "//cdn.exemplo.com/capa.png",
                  "data:image/png;base64,iVBORw0KGgo=",
                  "blob:https://x.co/9a1f",
                  "javascript:alert(1)",
                  "/capas/relativa.png",
                  "https://cdn.exemplo.com/fo to.jpg",
                  /* NÃO-ASCII e sinais de marcação: sem eles, a cláusula de
                     caractere nunca é exercida pelo corpus, e a frase que ela
                     escolhe nunca é comparada com o veredito. */
                  "https://exemplo.com/café.jpg",
                  "https://cdn.exemplo.com/fo to.jpg",
                  "https://cdn.exemplo.com/f oto.jpg",
                  'https://cdn.exemplo.com/foto.jpg?t=<script>',
                  'https://cdn.exemplo.com/"aspas".jpg',
                  "https://cdn.exemplo.com/'apostrofo'.jpg",
                  "https://cdn.exemplo.com/chave{}.jpg",
                  LONGO,
                ];
                const divergentes = CORPUS.filter(
                  (e) =>
                    (problema(e) === null) !== doDominio.enderecoDeImagemPermitido(e),
                );
                afirmar(
                  `a recusa é o VEREDITO de \`enderecoDeImagemPermitido\` nos ${CORPUS.length} endereços do corpus — a fala escolhe a explicação, nunca a regra`,
                  divergentes.length === 0,
                  divergentes
                    .map(
                      (e) =>
                        `${JSON.stringify(e.slice(0, 50))}: fala=${problema(e) === null} veredito=${doDominio.enderecoDeImagemPermitido(e)}`,
                    )
                    .join(" | "),
                );

                /* ─── A RECUSA ESPERA A PESSOA TERMINAR DE ESCREVER ──────
                   `https://` digitado letra a letra passa por `h`, `ht`,
                   `htt`… e nenhum deles é endereço válido. Pintar o campo de
                   vermelho desde o primeiro caractere de TODA digitação
                   bem-sucedida é a falha que não é falha — a que treina a
                   pessoa a ignorar a recusa que importa. */
                await escreverEndereco("h");
                const emDigitacao = alvo.querySelector('[data-campo="imagem_url"]');
                afirmar(
                  "endereço pela metade NÃO é acusado enquanto se digita — a recusa que aparece a cada tecla é a que se aprende a ignorar",
                  emDigitacao.getAttribute("aria-invalid") === null &&
                    problema("h") !== null &&
                    alvo.querySelector('[data-papel="capa-degradada"]') === null,
                  `invalid: ${emDigitacao.getAttribute("aria-invalid")} | problema puro: ${problema("h") !== null}`,
                );
                afirmar(
                  "e a caixa da capa continua desenhando o monograma, e não o vermelho: o layout não pisca a cada tecla",
                  alvo.querySelector('[data-papel="capa-ausente"]') !== null ||
                    alvo.querySelector('[data-papel="capa-degradada"]') !== null,
                  "nenhuma caixa de capa desenhada",
                );

                /* E A RECUSA APARECE QUANDO A PESSOA SAI DO CAMPO, ligada por
                   `aria-describedby`. */
                await escreverEndereco("data:image/png;base64,iVBORw0KGgo=");
                await act(async () => {
                  alvo
                    .querySelector('[data-campo="imagem_url"]')
                    /* `focusout`, e não `blur`: é o evento que borbulha, e é
                       nele que o React ancora `onBlur`. */
                    .dispatchEvent(new janela.FocusEvent("focusout", { bubbles: true }));
                });
                const recusado = alvo.querySelector('[data-campo="imagem_url"]');
                const descrito = (recusado.getAttribute("aria-describedby") ?? "")
                  .split(/\s+/)
                  .filter((id) => id !== "")
                  .map((id) => janela.document.getElementById(id))
                  .filter((e) => e !== null);
                const ditoTudo = descrito.map((e) => e.textContent ?? "").join(" ");
                afirmar(
                  "sair do campo com endereço recusado marca o campo e mostra o motivo — quem usa leitor de tela ouve o porquê",
                  recusado.getAttribute("aria-invalid") === "true" &&
                    ditoTudo.includes(problema("data:image/png;base64,iVBORw0KGgo=")),
                  `invalid: ${recusado.getAttribute("aria-invalid")} | dito: ${ditoTudo.slice(0, 120)}`,
                );
                /* O ERRO **E** A AJUDA, e não um ou outro: a ajuda é o que
                   explica que se cola o LINK e não o conteúdo, e colar o
                   conteúdo é a causa comum da recusa — some exatamente quando
                   é mais útil. */
                afirmar(
                  "e a explicação de que se cola o LINK continua junto do campo — ela não é substituída pela recusa que ela explica",
                  descrito.length === 2 && /link/i.test(ditoTudo),
                  `alvos de descrição: ${descrito.length} | ${ditoTudo.slice(0, 160)}`,
                );

                /* E ELE NUNCA VIRA `src`. O valor CONTINUA no campo — é o que a
                   pessoa digitou, e apagá-lo por baixo dela seria pior —, mas
                   nenhum elemento da gaveta o carrega como endereço a buscar.
                   A conferência é sobre `src`, e não sobre o HTML inteiro: o
                   `value` do campo é legítimo e faria a asserção acusar a si
                   mesma. */
                {
                  const comFonte = [...alvo.querySelectorAll("[src]")].filter((e) =>
                    (e.getAttribute("src") ?? "").includes("base64,iVBORw0KGgo="),
                  );
                  afirmar(
                    "e um endereço que o vocabulário recusa NUNCA vira `src` de imagem — degrada para o monograma, sem o navegador ir buscá-lo",
                    alvo.querySelector('[data-papel="miniatura-da-capa"]') === null &&
                      alvo.querySelector('[data-papel="capa-degradada"]') !== null &&
                      comFonte.length === 0 &&
                      recusado.value === "data:image/png;base64,iVBORw0KGgo=",
                    `com src: ${comFonte.length} | degradada: ${alvo.querySelector('[data-papel="capa-degradada"]') !== null} | valor do campo: ${JSON.stringify(recusado.value)}`,
                  );
                }

                /* E O PEDIDO NÃO SAI. `corpoDoPedido` recusa NOMEANDO o campo,
                   que é o que faz a gaveta poder apontá-lo. */
                const pedido = regrasDosMetadados.corpoDoPedido({
                  valores: {
                    ...regrasDosMetadados.valoresVazios(),
                    titulo: "Um post",
                    resumo: "Resumo",
                    imagem_url: "data:image/png;base64,iVBORw0KGgo=",
                    imagem_alt: "Uma descrição",
                  },
                  documento: { type: "doc", content: [] },
                });
                afirmar(
                  "e o corpo do pedido nem chega a ser montado: a recusa nomeia `imagem_url`, com a MESMA frase que o campo mostra",
                  pedido.ok === false &&
                    pedido.campo === "imagem_url" &&
                    pedido.motivo === problema("data:image/png;base64,iVBORw0KGgo="),
                  JSON.stringify(pedido),
                );
                /* E O CAMINHO POSITIVO: endereço de fora VÁLIDO monta o corpo,
                   e o que vai é o endereço. Sem isto, uma recusa que reprovasse
                   TODO endereço passaria as asserções acima. */
                const aceito = regrasDosMetadados.corpoDoPedido({
                  valores: {
                    ...regrasDosMetadados.valoresVazios(),
                    titulo: "Um post",
                    resumo: "Resumo",
                    imagem_url: DE_FORA,
                    imagem_alt: "Uma descrição",
                  },
                  documento: { type: "doc", content: [] },
                });
                afirmar(
                  "e endereço de fora VÁLIDO monta o corpo com o endereço — a recusa não reprova a story inteira",
                  aceito.ok === true && aceito.corpo.imagem_url === DE_FORA,
                  JSON.stringify(aceito.ok ? aceito.corpo.imagem_url : aceito),
                );
                /* E O MONTADOR DO CORPO NÃO DEPENDE DE INTERFACE. A regra do
                   endereço é do domínio, ao lado da do texto alternativo: o
                   corpo do pedido é código puro, e importar de um módulo de
                   tela para saber o que é endereço aceitável inverteria a seta
                   da arquitetura. */
                {
                  const doMontador = mascararComentariosJs(ler(CAMINHO_METADADOS));
                  afirmar(
                    "e a regra vem do DOMÍNIO: o montador do corpo não importa nada de `admin/blog/capa.js` para saber o que é endereço aceitável",
                    /problemaNoEnderecoDaImagem/.test(doMontador) &&
                      /from\s+["']@\/domain\/blog\/arquivos["']/.test(doMontador) &&
                      !/from\s+["']@\/admin\/blog\/capa["']/.test(doMontador),
                    (doMontador.match(/from\s+["'][^"']+["']/g) ?? []).join(" | "),
                  );
                }
              }

              /* — E O TEXTO ALTERNATIVO CONTINUA OBRIGATÓRIO COM CAPA DE FORA — */
              {
                const semDescricao = regrasDosMetadados.corpoDoPedido({
                  valores: {
                    ...regrasDosMetadados.valoresVazios(),
                    titulo: "Um post",
                    resumo: "Resumo",
                    imagem_url: DE_FORA,
                    imagem_alt: "   ",
                  },
                  documento: { type: "doc", content: [] },
                });
                afirmar(
                  "capa de FORA sem descrição é recusada igual à capa enviada — a obrigação é da capa, não da origem",
                  semDescricao.ok === false &&
                    semDescricao.campo === "imagem_alt" &&
                    semDescricao.motivo ===
                      regrasDosMetadados.FRASES_DE_FALTA.imagem_alt,
                  JSON.stringify(semDescricao),
                );
                await escreverEndereco(DE_FORA);
                await act(async () => {
                  valores = { ...valores, imagem_alt: "" };
                  raizReact.render(desenhar());
                });
                const rotulo = [...alvo.querySelectorAll("label")].find(
                  (l) => l.getAttribute("for") === alvo.querySelector('[data-campo="imagem_alt"]')?.id,
                );
                afirmar(
                  "e a tela o anuncia como OBRIGATÓRIO também no modo de fora",
                  (rotulo?.textContent ?? "").includes("obrigatório"),
                  rotulo?.textContent ?? "sem rótulo",
                );
              }

              /* — E A CAPA DE FORA QUE NÃO CARREGA DEGRADA IGUAL — */
              await act(async () => {
                valores = { ...valores, categoria_id: CATEGORIAS_DA_CAPA[0].id };
                raizReact.render(desenhar());
              });
              await act(async () => {
                alvo
                  .querySelector('[data-papel="miniatura-da-capa"]')
                  .dispatchEvent(new janela.Event("error", { bubbles: false }));
              });
              afirmar(
                "capa de FORA que não carrega degrada para o mesmo monograma — o apodrecimento do endereço de fora não tem tratamento próprio",
                alvo
                  .querySelector('[data-papel="capa-degradada"]')
                  ?.getAttribute("data-monograma") ===
                  modulo.regrasDaListagem.monogramaDoNome(CATEGORIAS_DA_CAPA[0].nome) &&
                  alvo.querySelector('[data-papel="capa-quebrada"]') !== null,
                String(alvo.querySelector('[data-papel="capa-degradada"]')?.getAttribute("data-monograma")),
              );

              /* ─── QUEBRADA **E** RECUSADA AO MESMO TEMPO ────────────────
                 A combinação que nenhuma das duas asserções acima alcança: a
                 imagem falhou ao carregar E depois o endereço foi trocado por
                 um que o vocabulário recusa. Os dois ramos escrevem na mesma
                 caixa, e a pergunta é qual fala sai — a resposta certa é a do
                 ENDEREÇO, porque é o problema que a pessoa acabou de causar e
                 o único que ela pode consertar. Dizer "não carregou" sobre um
                 `data:` que ninguém tentou carregar seria inventar um fato. */
              await escreverEndereco("data:image/png;base64,iVBORw0KGgo=");
              await act(async () => {
                alvo
                  .querySelector('[data-campo="imagem_url"]')
                  .dispatchEvent(new janela.FocusEvent("focusout", { bubbles: true }));
              });
              {
                const caixa = alvo.querySelector('[data-papel="capa-degradada"]');
                afirmar(
                  "capa que já tinha quebrado e passa a ter endereço RECUSADO anuncia o endereço, e não o carregamento — o fato inventado seria o outro",
                  caixa !== null &&
                    caixa.getAttribute("aria-label") ===
                      capa.rotuloDaCapaDegradada({
                        categoria: CATEGORIAS_DA_CAPA[0].nome,
                        situacao: capa.CAPA_COM_ENDERECO_RECUSADO,
                      }) &&
                    alvo.querySelector('[data-papel="capa-quebrada"]') === null &&
                    alvo.querySelector('[data-papel="miniatura-da-capa"]') === null,
                  `nome: ${caixa?.getAttribute("aria-label")} | frase de carregamento: ${alvo.querySelector('[data-papel="capa-quebrada"]') !== null}`,
                );
              }
            }

            await act(async () => raizReact.unmount());
            alvo.remove();
          }

          /* — O EDITOR INTEIRO: a coordenação — */
          {
            modulo.controle.pedidos_de_envio.length = 0;
            /* A RESPOSTA DO SALVAMENTO É FIXADA AQUI, e isso não é higiene de
               teste: com o Post nascendo com identificador, a tela passa a
               EDITAR e relê a linha do dublê de leitura — que carrega o Post de
               outra seção por cima deste formulário. Aconteceu na primeira
               execução, e a asserção acusou. */
            modulo.controle.resposta = { ok: true, dados: { criado: false, post: null } };
            const tela = await montarTela({ postId: null });
            const seletor = tela.campo("arquivo-da-capa");
            const arquivoFalso = { name: "capa.png", size: 10, type: "image/png" };
            Object.defineProperty(seletor, "files", {
              configurable: true,
              get: () => [arquivoFalso],
            });

            /* O ENVIO SEGURADO: é assim que a indicação de progresso chega a
               ser desenhada. Com a resposta pronta, ela resolve no primeiro
               microtask e nunca aparece. */
            let liberar = null;
            modulo.controle.aoEnviar = () =>
              new Promise((resolver) => {
                liberar = resolver;
              });

            await act(async () => {
              seletor.dispatchEvent(new janela.Event("change", { bubbles: true }));
            });
            afirmar(
              "o Editor manda o arquivo escolhido para a camada de dados — e é o arquivo escolhido, não outro",
              modulo.controle.pedidos_de_envio.length === 1 &&
                modulo.controle.pedidos_de_envio[0] === arquivoFalso,
              `pedidos: ${modulo.controle.pedidos_de_envio.length}`,
            );
            afirmar(
              "e enquanto o pedido está em voo a indicação está NA TELA",
              tela.alvo
                .querySelector('[data-papel="envio-em-curso"]')
                ?.getAttribute("data-enviando") === "true",
              String(tela.alvo.querySelector('[data-papel="envio-em-curso"]')?.outerHTML).slice(0, 120),
            );

            /* SALVAR COM O ENVIO EM VOO NÃO GRAVA. Sem esta trava, o Post
               nasceria sem capa e a miniatura apareceria depois — o Autor
               descobriria no site. */
            modulo.controle.pedidos.length = 0;
            await tela.clicar(tela.acaoPorChave("salvar"));
            afirmar(
              "salvar com a imagem ainda subindo NÃO grava, e a tela diz por quê",
              modulo.controle.pedidos.length === 0 &&
                modulo.controle.avisos.some(
                  (a) =>
                    a.tom === "erro" && /ainda está subindo/i.test(a.oQueHouve),
                ),
              `pedidos: ${modulo.controle.pedidos.length} | avisos: ${JSON.stringify(modulo.controle.avisos.at(-1))}`,
            );

            const ENDERECO =
              "https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/0a1b2c3d-4e5f-6789-abcd-ef0123456789.png";
            await act(async () => {
              liberar({ ok: true, dados: { url: ENDERECO, caminho: "capas/0a1b2c3d-4e5f-6789-abcd-ef0123456789.png" } });
            });
            afirmar(
              "concluído o envio, a indicação SOME e a miniatura aparece no Editor",
              tela.alvo
                .querySelector('[data-papel="envio-em-curso"]')
                ?.getAttribute("data-enviando") === "false" &&
                tela.alvo.querySelector('[data-papel="miniatura-da-capa"]')?.getAttribute("src") ===
                  ENDERECO,
              String(tela.alvo.querySelector('[data-papel="miniatura-da-capa"]')?.getAttribute("src")),
            );

            /* E O QUE VAI PARA A PORTA DE ESCRITA É O ENDEREÇO. */
            modulo.controle.pedidos.length = 0;
            await tela.digitar(tela.campo("titulo"), "Um post com capa");
            await tela.digitar(tela.campo("resumo"), "O resumo");
            await tela.digitar(tela.campo("imagem_alt"), "Uma sala de reunião");
            await tela.clicar(tela.acaoPorChave("salvar"));
            const enviado = modulo.controle.pedidos.at(-1);
            afirmar(
              "o corpo que sai para a porta única leva o ENDEREÇO da capa e a descrição — nunca o arquivo",
              enviado?.imagem_url === ENDERECO &&
                enviado?.imagem_alt === "Uma sala de reunião" &&
                !/data:|base64/i.test(JSON.stringify(enviado)),
              JSON.stringify({ url: enviado?.imagem_url, alt: enviado?.imagem_alt }),
            );

            /* A RECUSA DO ENVIO VIRA FRASE E NÃO DESCARTA NADA. */
            modulo.controle.aoEnviar = null;
            modulo.controle.avisos.length = 0;
            const RECUSA = doArquivo.recusaDeTamanho(doArquivo.TAMANHO_MAXIMO_DA_IMAGEM + 1);
            modulo.controle.envio = {
              ok: false,
              erro: { tipo: "dados_invalidos", mensagem: RECUSA, operacao: "enviarImagemDeCapa", detalhe: "", codigo: "", status: null },
            };
            await act(async () => {
              seletor.dispatchEvent(new janela.Event("change", { bubbles: true }));
            });
            afirmar(
              "envio recusado vira NOTIFICAÇÃO com a frase de quem recusou, e o formulário fica inteiro",
              modulo.controle.avisos.some(
                (a) => a.tom === "erro" && a.oQueFazer === RECUSA,
              ) &&
                tela.campo("titulo")?.value === "Um post com capa",
              JSON.stringify(modulo.controle.avisos.at(-1)),
            );
            afirmar(
              "e a capa que já estava lá NÃO é perdida por um envio recusado",
              tela.alvo.querySelector('[data-papel="miniatura-da-capa"]')?.getAttribute("src") ===
                ENDERECO,
              String(tela.alvo.querySelector('[data-papel="miniatura-da-capa"]')?.getAttribute("src")),
            );

            await tela.desmontar();
            modulo.controle.envio = {
              ok: true,
              dados: { url: ENDERECO, caminho: "capas/0a1b2c3d-4e5f-6789-abcd-ef0123456789.png" },
            };
          }

/* ── O EDITOR INTEIRO, AGORA PELO CAMPO DE SEO (Story 3.4) ────────
             Toda a coordenação de nível de Editor — enviar, esperar, concluir,
             remover, faxinar — só era exercitada por `arquivo-da-capa`, e a
             seção da gaveta montava com `aoEscolherArquivo: () => {}`. Duas
             sabotagens ficavam VERDES, e as duas são destrutivas:

               trocar `[campo]` por `imagem_url` em `enviarImagem` — enviar uma
               Imagem de Compartilhamento SOBRESCREVE a capa do Post;

               forçar `daCapa = true` em `removerImagem` — remover a Imagem de
               Compartilhamento APAGA o texto alternativo da capa, e como a
               gaveta recusa capa sem descrição, o salvamento seguinte falha por
               um campo que o Autor nunca tocou.

             O bloco é o mesmo da capa, dirigido ao outro seletor. */
          {
            modulo.controle.pedidos_de_envio.length = 0;
            modulo.controle.pedidos_de_remocao.length = 0;
            modulo.controle.pedidos.length = 0;
            modulo.controle.avisos.length = 0;
            modulo.controle.resposta = { ok: true, dados: { criado: false, post: null } };

            const CAPA_DA_SESSAO =
              "https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/aaaa1111-2222-4333-8444-555566667777.png";
            const IMAGEM_DE_SEO =
              "https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/bbbb2222-3333-4444-8555-666677778888.png";

            const tela = await montarTela({ postId: null });
            const arquivoFalso = { name: "imagem.png", size: 10, type: "image/png" };
            const armar = (seletor) => {
              Object.defineProperty(seletor, "files", {
                configurable: true,
                get: () => [arquivoFalso],
              });
              return seletor;
            };
            const seletorDaCapa = armar(tela.campo("arquivo-da-capa"));
            const seletorDeSeo = armar(tela.campo("arquivo-da-imagem-de-seo"));

            afirmar(
              "o Editor monta os DOIS seletores de arquivo, com nomes distintos — sem isto nada abaixo julga o campo certo",
              seletorDaCapa !== null &&
                seletorDeSeo !== null &&
                seletorDaCapa !== seletorDeSeo,
              `${seletorDaCapa?.getAttribute("data-campo")} | ${seletorDeSeo?.getAttribute("data-campo")}`,
            );

            /* ── OS DOIS ENVIOS SÃO INDEPENDENTES ─────────────────────────
               É a razão inteira de `envios` ter virado MAPA. Com um par de
               estados compartilhado, o giro de um apareceria sobre o outro e a
               recusa de um acusaria o campo errado. Os dois ficam em voo ao
               mesmo tempo, e cada um é conferido. */
            const emVoo = new Map();
            modulo.controle.aoEnviar = () =>
              new Promise((resolver) => {
                emVoo.set(emVoo.size, resolver);
              });

            await act(async () => {
              seletorDeSeo.dispatchEvent(new janela.Event("change", { bubbles: true }));
            });
            const girandoDeSeo = () =>
              tela.alvo
                .querySelector('[data-papel="envio-de-imagem-de-seo-em-curso"]')
                ?.getAttribute("data-enviando");
            const girandoDaCapa = () =>
              tela.alvo
                .querySelector('[data-papel="envio-em-curso"]')
                ?.getAttribute("data-enviando");
            afirmar(
              "enviar pela Imagem de Compartilhamento gira SÓ o indicador dela — a capa não é marcada como enviando",
              girandoDeSeo() === "true" && girandoDaCapa() === "false",
              `seo: ${girandoDeSeo()} | capa: ${girandoDaCapa()}`,
            );
            afirmar(
              "e o arquivo escolhido chega à camada de dados — um pedido, e é o arquivo escolhido",
              modulo.controle.pedidos_de_envio.length === 1 &&
                modulo.controle.pedidos_de_envio[0] === arquivoFalso,
              `pedidos: ${modulo.controle.pedidos_de_envio.length}`,
            );

            /* E O SALVAMENTO ESPERA POR ELE. A guarda "uma imagem ainda está
               subindo" percorre `CAMPOS_DE_IMAGEM_DA_GAVETA`, e até aqui só
               existia em comentário: percorrer só `imagem_url` deixaria a
               Imagem de Compartilhamento com exatamente o defeito que a guarda
               existe para impedir, e o silêncio seria idêntico. */
            modulo.controle.pedidos.length = 0;
            modulo.controle.avisos.length = 0;
            await tela.clicar(tela.acaoPorChave("salvar"));
            afirmar(
              "salvar com a IMAGEM DE COMPARTILHAMENTO ainda subindo NÃO grava, e a tela diz por quê",
              modulo.controle.pedidos.length === 0 &&
                modulo.controle.avisos.some(
                  (a) => a.tom === "erro" && /ainda está subindo/i.test(a.oQueHouve),
                ),
              `pedidos: ${modulo.controle.pedidos.length} | avisos: ${JSON.stringify(modulo.controle.avisos.at(-1))}`,
            );

            /* O SEGUNDO ENVIO ENTRA COM O PRIMEIRO AINDA EM VOO. */
            await act(async () => {
              seletorDaCapa.dispatchEvent(new janela.Event("change", { bubbles: true }));
            });
            afirmar(
              "com os DOIS em voo, os dois indicadores giram — o estado é de cada campo, e não um só compartilhado",
              girandoDeSeo() === "true" && girandoDaCapa() === "true",
              `seo: ${girandoDeSeo()} | capa: ${girandoDaCapa()}`,
            );

            /* CONCLUIR O DA CAPA NÃO CONCLUI O DE SEO. */
            const [resolverSeo, resolverCapa] = [emVoo.get(0), emVoo.get(1)];
            await act(async () => {
              resolverCapa({
                ok: true,
                dados: {
                  url: CAPA_DA_SESSAO,
                  caminho: "capas/aaaa1111-2222-4333-8444-555566667777.png",
                },
              });
            });
            afirmar(
              "concluir o envio da CAPA não conclui o da Imagem de Compartilhamento — os dois são independentes",
              girandoDaCapa() === "false" && girandoDeSeo() === "true",
              `seo: ${girandoDeSeo()} | capa: ${girandoDaCapa()}`,
            );

            await act(async () => {
              resolverSeo({
                ok: true,
                dados: {
                  url: IMAGEM_DE_SEO,
                  caminho: "capas/bbbb2222-3333-4444-8555-666677778888.png",
                },
              });
            });

            /* ── O ENDEREÇO FOI PARAR NA COLUNA CERTA ─────────────────────
               A sabotagem que sobrescreve a capa com a imagem de
               compartilhamento morre AQUI, e o que a mata é o VALOR de cada
               miniatura — uma contagem de miniaturas daria dois nos dois
               casos. */
            const srcDe = (papel) =>
              tela.alvo.querySelector(`[data-papel="${papel}"]`)?.getAttribute("src") ?? null;
            afirmar(
              "cada endereço vai para a SUA coluna: a miniatura da capa mostra a capa, e a de compartilhamento mostra a dela",
              srcDe("miniatura-da-capa") === CAPA_DA_SESSAO &&
                srcDe("miniatura-da-imagem-de-seo") === IMAGEM_DE_SEO,
              `capa: ${srcDe("miniatura-da-capa")} | seo: ${srcDe("miniatura-da-imagem-de-seo")}`,
            );
            /* E A MINIATURA DA IMAGEM DE SEO TEM NOME ACESSÍVEL. Ela não tem
               campo de descrição — a coluna de texto alternativo é da capa —,
               então o `alt` cai no padrão nomeado, e ele precisa dizer de QUAL
               imagem se trata. */
            const altDeSeo = tela.alvo
              .querySelector('[data-papel="miniatura-da-imagem-de-seo"]')
              ?.getAttribute("alt");
            afirmar(
              "a miniatura da Imagem de Compartilhamento tem `alt`, e ele NOMEIA o campo — nunca o endereço do arquivo",
              typeof altDeSeo === "string" &&
                altDeSeo === capa.alternativoDaMiniatura(null, modulo.compartilhamentoDoDominio.ROTULOS_DE_SEO.seo_imagem_url) &&
                !altDeSeo.includes("http"),
              String(altDeSeo),
            );

            modulo.controle.aoEnviar = null;

            /* ── REMOVER A IMAGEM DE SEO NÃO MEXE NA DESCRIÇÃO DA CAPA ────
               `imagem_alt` é do par da CAPA. Limpá-la ao remover a outra
               imagem apagaria a descrição de uma capa que continua lá — e,
               como o banco recusa capa sem descrição, o salvamento seguinte
               falharia por um campo que ninguém tocou. */
            await tela.digitar(tela.campo("imagem_alt"), "Uma sala de reunião");
            modulo.controle.pedidos_de_remocao.length = 0;
            await tela.clicar(
              tela.alvo.querySelector(
                '[data-acao-da-capa="remover"][data-campo-da-acao="seo_imagem_url"]',
              ),
            );
            afirmar(
              "remover a Imagem de Compartilhamento NÃO apaga a descrição da capa — ela é do par da capa",
              tela.campo("imagem_alt")?.value === "Uma sala de reunião" &&
                srcDe("miniatura-da-capa") === CAPA_DA_SESSAO &&
                srcDe("miniatura-da-imagem-de-seo") === null,
              `alt: ${JSON.stringify(tela.campo("imagem_alt")?.value)} | capa: ${srcDe("miniatura-da-capa")}`,
            );
            afirmar(
              "e o arquivo dela, que era desta sessão, sai do bucket pela sessão — o servidor nunca o viu",
              modulo.controle.pedidos_de_remocao.length === 1 &&
                modulo.controle.pedidos_de_remocao[0] === IMAGEM_DE_SEO,
              JSON.stringify(modulo.controle.pedidos_de_remocao),
            );

            /* E O CONTROLE POSITIVO DO OUTRO LADO: remover a CAPA continua
               apagando a descrição dela. Sem esta, um `daCapa` sempre falso
               passaria a asserção acima. */
            modulo.controle.pedidos_de_remocao.length = 0;
            await tela.clicar(
              tela.alvo.querySelector(
                '[data-acao-da-capa="remover"][data-campo-da-acao="imagem_url"]',
              ),
            );
            afirmar(
              "controle positivo: remover a CAPA continua apagando a descrição dela — a regra é do par, não de todo campo",
              tela.campo("imagem_alt")?.value === "" &&
                srcDe("miniatura-da-capa") === null,
              `alt: ${JSON.stringify(tela.campo("imagem_alt")?.value)}`,
            );

            await tela.desmontar();
            modulo.controle.envio = {
              ok: true,
              dados: {
                url: CAPA_DA_SESSAO,
                caminho: "capas/aaaa1111-2222-4333-8444-555566667777.png",
              },
            };
          }

          /* ── A FAXINA DO SALVAMENTO OLHA AS DUAS COLUNAS ──────────────────
             `salvas` percorre `CAMPOS_DE_IMAGEM_DA_GAVETA`. Reverter para a
             versão só-capa — a regressão exata que o comentário acima dela
             descreve — ficava verde: a linha era salva apontando para uma
             Imagem de Compartilhamento cujo arquivo o Editor apagava logo em
             seguida. Prévia com endereço morto, e nada virava resíduo, porque
             do ponto de vista do servidor a remoção deu certo. */
          {
            modulo.controle.pedidos_de_envio.length = 0;
            modulo.controle.pedidos_de_remocao.length = 0;
            modulo.controle.pedidos.length = 0;
            modulo.controle.resposta = { ok: true, dados: { criado: false, post: null } };

            const DE_SEO =
              "https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/cccc3333-4444-4555-8666-777788889999.png";
            modulo.controle.envio = {
              ok: true,
              dados: { url: DE_SEO, caminho: "capas/cccc3333-4444-4555-8666-777788889999.png" },
            };

            const tela = await montarTela({ postId: null });
            const seletorDeSeo = tela.campo("arquivo-da-imagem-de-seo");
            Object.defineProperty(seletorDeSeo, "files", {
              configurable: true,
              get: () => [{ name: "seo.png", size: 10, type: "image/png" }],
            });
            await act(async () => {
              seletorDeSeo.dispatchEvent(new janela.Event("change", { bubbles: true }));
            });

            await tela.digitar(tela.campo("titulo"), "Post com imagem de compartilhamento");
            await tela.digitar(tela.campo("resumo"), "O resumo");
            modulo.controle.pedidos_de_remocao.length = 0;
            await tela.clicar(tela.acaoPorChave("salvar"));

            const enviado = modulo.controle.pedidos.at(-1);
            afirmar(
              "o corpo que sai leva o ENDEREÇO da imagem de compartilhamento — e a capa continua vazia",
              enviado?.seo_imagem_url === DE_SEO && enviado?.imagem_url === null,
              JSON.stringify({ seo: enviado?.seo_imagem_url, capa: enviado?.imagem_url }),
            );
            afirmar(
              "e salvar NÃO apaga o arquivo que o Post acabou de passar a apontar — a faxina olha as DUAS colunas",
              !modulo.controle.pedidos_de_remocao.includes(DE_SEO),
              JSON.stringify(modulo.controle.pedidos_de_remocao),
            );

            await tela.desmontar();
          }

          /* ── O MESMO ARQUIVO NAS DUAS COLUNAS, PELA TELA ──────────────────
             Usar a mesma imagem como Capa e como Imagem de Compartilhamento é o
             caso mais provável de todos. Sem a guarda em `descartarSeNaoSalva`,
             trocar uma das duas apagaria do bucket o arquivo que a outra
             continua apontando — e o Post seria salvo com um endereço morto. */
          {
            modulo.controle.pedidos_de_envio.length = 0;
            modulo.controle.pedidos_de_remocao.length = 0;
            modulo.controle.resposta = { ok: true, dados: { criado: false, post: null } };

            const COMPARTILHADO =
              "https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/dddd4444-5555-4666-8777-888899990000.png";
            const NOVA_CAPA =
              "https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/eeee5555-6666-4777-8888-999900001111.png";

            const tela = await montarTela({ postId: null });
            const armar = (seletor) => {
              Object.defineProperty(seletor, "files", {
                configurable: true,
                get: () => [{ name: "img.png", size: 10, type: "image/png" }],
              });
              return seletor;
            };
            const seletorDaCapa = armar(tela.campo("arquivo-da-capa"));
            const seletorDeSeo = armar(tela.campo("arquivo-da-imagem-de-seo"));

            /* O MESMO endereço entra nos dois campos — é o que acontece quando
               a pessoa envia o mesmo arquivo duas vezes e o dublê devolve o
               mesmo caminho, e é também o que um Post gravado pode ter. */
            modulo.controle.envio = {
              ok: true,
              dados: {
                url: COMPARTILHADO,
                caminho: "capas/dddd4444-5555-4666-8777-888899990000.png",
              },
            };
            await act(async () => {
              seletorDaCapa.dispatchEvent(new janela.Event("change", { bubbles: true }));
            });
            await act(async () => {
              seletorDeSeo.dispatchEvent(new janela.Event("change", { bubbles: true }));
            });
            const srcDe = (papel) =>
              tela.alvo.querySelector(`[data-papel="${papel}"]`)?.getAttribute("src") ?? null;
            afirmar(
              "as duas colunas podem apontar para o MESMO arquivo — e nenhuma remoção é pedida ao pôr o segundo",
              srcDe("miniatura-da-capa") === COMPARTILHADO &&
                srcDe("miniatura-da-imagem-de-seo") === COMPARTILHADO &&
                modulo.controle.pedidos_de_remocao.length === 0,
              JSON.stringify(modulo.controle.pedidos_de_remocao),
            );

            /* AGORA A CAPA TROCA. O arquivo compartilhado NÃO pode sair: a
               Imagem de Compartilhamento continua apontando para ele. */
            modulo.controle.pedidos_de_remocao.length = 0;
            modulo.controle.envio = {
              ok: true,
              dados: {
                url: NOVA_CAPA,
                caminho: "capas/eeee5555-6666-4777-8888-999900001111.png",
              },
            };
            await act(async () => {
              seletorDaCapa.dispatchEvent(new janela.Event("change", { bubbles: true }));
            });
            afirmar(
              "trocar a capa NÃO apaga o arquivo que a Imagem de Compartilhamento ainda usa",
              !modulo.controle.pedidos_de_remocao.includes(COMPARTILHADO) &&
                srcDe("miniatura-da-imagem-de-seo") === COMPARTILHADO,
              JSON.stringify(modulo.controle.pedidos_de_remocao),
            );

            /* CONTROLE POSITIVO: quando ninguém mais o usa, ele sai. Sem isto,
               uma guarda larga demais faria o arquivo nunca sair e o vazamento
               voltaria pelo outro lado. */
            modulo.controle.pedidos_de_remocao.length = 0;
            await tela.clicar(
              tela.alvo.querySelector(
                '[data-acao-da-capa="remover"][data-campo-da-acao="seo_imagem_url"]',
              ),
            );
            afirmar(
              "controle positivo: quando NENHUMA das duas o usa mais, ele sai do bucket pela sessão",
              modulo.controle.pedidos_de_remocao.includes(COMPARTILHADO),
              JSON.stringify(modulo.controle.pedidos_de_remocao),
            );

            await tela.desmontar();
          }


          /* — REABRIR UM POST QUE JÁ TEM CAPA — */
          //
          // A asserção que faltava, e a falta era destrutiva. `valoresDoPost`
          // passou a mapear `imagem_url` e `imagem_alt`, e nada executava esse
          // mapeamento: toda a seção montava com `postId: null` e injetava
          // `valores` à mão. Apagar as duas linhas passava verde — e o efeito
          // no produto era APAGAR O ARQUIVO: o Editor abriria mostrando "sem
          // capa", o salvamento seguinte mandaria `imagem_url: null`, o
          // servidor limparia a coluna, e `removerCapaAnterior` receberia
          // `anterior = endereço` e `atual = null` e removeria o arquivo do
          // bucket. Perda silenciosa, e sem nem virar resíduo: do ponto de
          // vista do servidor a remoção deu certo.
          //
          // Os dois lados são afirmados: o que a tela DESENHA ao abrir, e o
          // que ela REENVIA ao salvar sem ninguém tocar na capa.
          {
            const ID_COM_CAPA = "33333333-4444-4555-8666-777777777777";
            const CAPA_GRAVADA =
              "https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/aaaabbbb-cccc-dddd-eeee-ffff00001111.png";
            const ALT_GRAVADO = "Uma sala de reunião vazia";

            modulo.controle.post = {
              ok: true,
              dados: {
                id: ID_COM_CAPA,
                slug: "post-com-capa",
                titulo: "Post com capa",
                resumo: "O resumo do post com capa",
                conteudo: null,
                conteudo_html: "",
                estado: "rascunho",
                publicado_em: null,
                categoria_id: null,
                tempo_leitura: 4,
                imagem_url: CAPA_GRAVADA,
                imagem_alt: ALT_GRAVADO,
                autor_nome: "Quem Escreve",
              },
            };
            modulo.controle.resposta = {
              ok: true,
              dados: { criado: false, post: null },
            };
            modulo.controle.pedidos.length = 0;

            const tela = await montarTela({ postId: ID_COM_CAPA });

            const miniatura = tela.alvo.querySelector(
              '[data-papel="miniatura-da-capa"]',
            );
            afirmar(
              "abrir um Post que JÁ TEM capa desenha a miniatura do endereço GRAVADO — e não a tela de capa ausente",
              miniatura !== null &&
                miniatura.getAttribute("src") === CAPA_GRAVADA &&
                tela.alvo.querySelector('[data-papel="capa-ausente"]') === null,
              `src: ${miniatura?.getAttribute("src") ?? "sem miniatura"}`,
            );
            afirmar(
              "e a descrição gravada volta para o campo — é ela que o `alt` da miniatura usa",
              tela.campo("imagem_alt")?.value === ALT_GRAVADO &&
                miniatura?.getAttribute("alt") === ALT_GRAVADO,
              `campo: ${JSON.stringify(tela.campo("imagem_alt")?.value)} | alt: ${JSON.stringify(miniatura?.getAttribute("alt"))}`,
            );

            /* E O SALVAMENTO REENVIA O MESMO ENDEREÇO. É esta metade que
               impede a perda: um corpo com `imagem_url: null` faria o servidor
               limpar a coluna E apagar o arquivo. */
            await tela.clicar(tela.acaoPorChave("salvar"));
            const reenviado = modulo.controle.pedidos.at(-1);
            afirmar(
              "e salvar SEM TOCAR NA CAPA reenvia o mesmo endereço — mandar `null` aqui apagaria o arquivo do bucket",
              reenviado?.imagem_url === CAPA_GRAVADA &&
                reenviado?.imagem_alt === ALT_GRAVADO,
              JSON.stringify({
                url: reenviado?.imagem_url,
                alt: reenviado?.imagem_alt,
              }),
            );

            /* E TIRAR A CAPA DE UM POST GRAVADO NÃO REMOVE NADA DAQUI:
               o arquivo ainda é o que está no ar até o salvamento, e quem o
               remove é o servidor, depois de a linha sair sem ele. */
            modulo.controle.pedidos_de_remocao.length = 0;
            await tela.clicar(
              tela.alvo.querySelector('[data-acao-da-capa="remover"]'),
            );
            afirmar(
              "tirar a capa de um Post GRAVADO não remove o arquivo pela tela — ele ainda é o que está no ar até o salvamento",
              modulo.controle.pedidos_de_remocao.length === 0 &&
                tela.campo("imagem_alt")?.value === "",
              `remoções pedidas: ${modulo.controle.pedidos_de_remocao.length}`,
            );

            await tela.desmontar();
            modulo.controle.post = {
              ok: false,
              erro: { tipo: "nao_encontrado", mensagem: "sem post" },
            };
          }

          /* — A CAPA ENVIADA E NUNCA SALVA SAI DO BUCKET PELA TELA — */
          //
          // O outro dono. O que o servidor nunca viu, o servidor nunca remove:
          // trocar a capa duas vezes antes de salvar deixava a primeira no
          // bucket PARA SEMPRE, e sem nem virar resíduo, porque não havia quem
          // a nomeasse. É também o que dá uso à política de remoção
          // autenticada — sem consumidor, ela seria capacidade concedida e
          // nunca exercida.
          {
            modulo.controle.pedidos_de_envio.length = 0;
            modulo.controle.pedidos_de_remocao.length = 0;
            modulo.controle.resposta = {
              ok: true,
              dados: { criado: false, post: null },
            };
            const tela = await montarTela({ postId: null });
            const seletor = tela.campo("arquivo-da-capa");
            const arquivoFalso = { name: "capa.png", size: 10, type: "image/png" };
            Object.defineProperty(seletor, "files", {
              configurable: true,
              get: () => [arquivoFalso],
            });

            const PRIMEIRA =
              "https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/11112222-3333-4444-5555-666677778888.png";
            const SEGUNDA =
              "https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/99998888-7777-6666-5555-444433332222.png";

            modulo.controle.envio = {
              ok: true,
              dados: { url: PRIMEIRA, caminho: "capas/11112222-3333-4444-5555-666677778888.png" },
            };
            await act(async () => {
              seletor.dispatchEvent(new janela.Event("change", { bubbles: true }));
            });
            afirmar(
              "a primeira capa enviada não é removida de nada — não havia anterior desta sessão",
              modulo.controle.pedidos_de_remocao.length === 0,
              JSON.stringify(modulo.controle.pedidos_de_remocao),
            );

            modulo.controle.envio = {
              ok: true,
              dados: { url: SEGUNDA, caminho: "capas/99998888-7777-6666-5555-444433332222.png" },
            };
            await act(async () => {
              seletor.dispatchEvent(new janela.Event("change", { bubbles: true }));
            });
            afirmar(
              "trocar a capa ANTES de salvar remove a anterior do bucket pela sessão — o servidor nunca a viu, ninguém mais viria removê-la",
              modulo.controle.pedidos_de_remocao.length === 1 &&
                modulo.controle.pedidos_de_remocao[0] === PRIMEIRA,
              JSON.stringify(modulo.controle.pedidos_de_remocao),
            );
            afirmar(
              "e a que ficou é a SEGUNDA — a faxina remove a anterior, nunca a nova",
              tela.alvo
                .querySelector('[data-papel="miniatura-da-capa"]')
                ?.getAttribute("src") === SEGUNDA,
              String(
                tela.alvo
                  .querySelector('[data-papel="miniatura-da-capa"]')
                  ?.getAttribute("src"),
              ),
            );

            /* E, DEPOIS DE SALVAR, ela deixa de ser da sessão: quem remove
               passa a ser o servidor. */
            await tela.digitar(tela.campo("titulo"), "Com capa");
            await tela.digitar(tela.campo("resumo"), "Resumo");
            await tela.digitar(tela.campo("imagem_alt"), "Descrição");
            modulo.controle.pedidos_de_remocao.length = 0;
            await tela.clicar(tela.acaoPorChave("salvar"));
            /* ─── E A CAPA QUE FOI SALVA NÃO SAI ─────────────────────────
               A faxina do salvamento descarta as capas desta sessão que o Post
               NÃO ficou usando. Descartar todas — inclusive a que acabou de ser
               gravada — apagaria do bucket exatamente a imagem que o Post
               passou a apontar, e o Autor veria a capa sumir na primeira
               recarga. É o lado oposto do órfão, e o mais destrutivo dos dois. */
            afirmar(
              "salvar NÃO remove a capa que o Post ficou usando — apagá-la aqui deixaria o Post apontando para um arquivo que acabou de sair",
              !modulo.controle.pedidos_de_remocao.includes(SEGUNDA),
              JSON.stringify(modulo.controle.pedidos_de_remocao),
            );
            modulo.controle.pedidos_de_remocao.length = 0;
            await tela.clicar(
              tela.alvo.querySelector('[data-acao-da-capa="remover"]'),
            );
            afirmar(
              "depois de salvar, tirar a capa NÃO a remove pela tela — ela passou a ser do servidor",
              modulo.controle.pedidos_de_remocao.length === 0,
              JSON.stringify(modulo.controle.pedidos_de_remocao),
            );

            await tela.desmontar();
          }

          /* — TROCAR DE ORIGEM E SALVAR NÃO DEIXA O ARQUIVO SEM DONO — */
          //
          // O caminho que a Story 3.2 abriu e quase deixou vazando: enviar um
          // arquivo (ele entra em `capasNaoSalvas`), marcar "Informar endereço",
          // colar uma URL de fora e salvar. O servidor compara o endereço
          // GRAVADO com o novo e nunca fica sabendo de um arquivo que ele
          // jamais viu; a limpeza pós-salvamento apagava o último registro
          // dele. Órfão PERMANENTE, que nenhum salvamento futuro alcança e que
          // não vira nem resíduo, porque não há quem o nomeie — exatamente o
          // defeito que `capasNaoSalvas` existe para impedir.
          //
          // E ele NÃO sai na troca de modo: alternar precisa poder ser desfeito
          // sem reenviar o arquivo. Ele sai quando o salvamento decide qual
          // endereço o Post tem de verdade.
          {
            modulo.controle.pedidos_de_envio.length = 0;
            modulo.controle.pedidos_de_remocao.length = 0;
            modulo.controle.pedidos.length = 0;
            const ENVIADA =
              "https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/abcd1234-5678-4abc-8def-000011112222.png";
            const DE_FORA = "https://cdn.exemplo.com/ja-hospedada.jpg";
            modulo.controle.envio = {
              ok: true,
              dados: { url: ENVIADA, caminho: "capas/abcd1234-5678-4abc-8def-000011112222.png" },
            };
            modulo.controle.resposta = {
              ok: true,
              dados: { criado: false, post: null },
            };

            const tela = await montarTela({ postId: null });
            const seletor = tela.campo("arquivo-da-capa");
            const arquivoFalso = { name: "capa.png", size: 10, type: "image/png" };
            Object.defineProperty(seletor, "files", {
              configurable: true,
              get: () => [arquivoFalso],
            });
            await act(async () => {
              seletor.dispatchEvent(new janela.Event("change", { bubbles: true }));
            });

            /* A TROCA DE MODO, pelo controle de verdade. */
            await tela.clicar(
              tela.alvo.querySelector('[data-origem-da-capa="capa-de-endereco"]'),
            );
            afirmar(
              "trocar de origem NÃO remove o arquivo enviado — alternar precisa poder ser desfeito sem reenviar",
              modulo.controle.pedidos_de_remocao.length === 0 &&
                tela.alvo.querySelector('[data-campo="imagem_url"]') !== null,
              JSON.stringify(modulo.controle.pedidos_de_remocao),
            );

            await tela.digitar(tela.campo("imagem_url"), DE_FORA);
            await tela.digitar(tela.campo("titulo"), "Um post com capa de fora");
            await tela.digitar(tela.campo("resumo"), "O resumo");
            await tela.digitar(tela.campo("imagem_alt"), "Uma sala de reunião");
            await tela.clicar(tela.acaoPorChave("salvar"));

            const enviado = modulo.controle.pedidos.at(-1);
            afirmar(
              "salvar depois da troca manda o endereço DE FORA — o que a pessoa escolheu por último é o que o Post guarda",
              enviado?.imagem_url === DE_FORA,
              JSON.stringify(enviado?.imagem_url),
            );
            afirmar(
              "e o arquivo enviado e ABANDONADO pela troca sai do bucket — sem isto ele fica órfão para sempre, e sem nem virar resíduo",
              modulo.controle.pedidos_de_remocao.includes(ENVIADA),
              JSON.stringify(modulo.controle.pedidos_de_remocao),
            );
            afirmar(
              "e só ele: o endereço de fora NUNCA vira pedido de remoção — ele não é do nosso bucket",
              !modulo.controle.pedidos_de_remocao.includes(DE_FORA) &&
                modulo.controle.pedidos_de_remocao.length === 1,
              JSON.stringify(modulo.controle.pedidos_de_remocao),
            );

            await tela.desmontar();
            modulo.controle.envio = {
              ok: true,
              dados: {
                url: "https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/0a1b2c3d-4e5f-6789-abcd-ef0123456789.png",
                caminho: "capas/0a1b2c3d-4e5f-6789-abcd-ef0123456789.png",
              },
            };
          }

          /* — O RESÍDUO CHEGA AO AUTOR — */
          //
          // O servidor registra no log e nomeia na resposta; até aqui isso
          // valia para o log e para o JSON, e não para quem clicou. A fala é do
          // módulo puro, e ela é um AVISO ao lado da confirmação: a operação
          // deu certo, e só o arquivo anterior não saiu.
          {
            afirmar(
              "a fala do resíduo NOMEIA o arquivo e diz que a operação foi concluída — resíduo ausente não vira fala nenhuma",
              capa.falaDoResiduo(null) === null &&
                capa.falaDoResiduo({ arquivo: "" }) === null &&
                capa.falaDoResiduo({ arquivo: "capas/x.png" })?.oQueFazer.includes(
                  "capas/x.png",
                ) === true,
              JSON.stringify(capa.falaDoResiduo({ arquivo: "capas/x.png" })),
            );

            modulo.controle.resposta = {
              ok: true,
              dados: {
                criado: false,
                post: null,
                residuo: { arquivo: "capas/ficou-para-tras.png" },
              },
            };
            modulo.controle.avisos.length = 0;
            const tela = await montarTela({ postId: null });
            await tela.digitar(tela.campo("titulo"), "Um post");
            await tela.digitar(tela.campo("resumo"), "Resumo");
            await tela.clicar(tela.acaoPorChave("salvar"));
            afirmar(
              "salvar com resíduo confirma o salvamento E avisa que o arquivo antigo ficou, nomeando-o",
              modulo.controle.avisos.some((a) => a.tom === "sucesso") &&
                modulo.controle.avisos.some(
                  (a) =>
                    a.tom === "erro" &&
                    a.oQueFazer.includes("capas/ficou-para-tras.png"),
                ),
              JSON.stringify(modulo.controle.avisos),
            );
            await tela.desmontar();
            modulo.controle.resposta = {
              ok: true,
              dados: { criado: false, post: null },
            };
          }

        /* ─── (q) A SEÇÃO DE SEO (Story 3.4) ────────────────────────────
           Três campos opcionais, a herança MOSTRADA, e um contador que
           sinaliza sem bloquear e sem truncar. Tudo montado: "não bloqueia"
           é promessa até alguém digitar e tentar salvar. */
        {
          secao("(q) os campos de SEO: opcionais, com a herança à vista e o contador que não bloqueia");

          const seo = modulo.regrasDeSeo;
          const compartilhamento = modulo.compartilhamentoDoDominio;
          const DOMINIO = "https://chatclean.com.br";
          const CAPA_GRAVADA =
            "https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/0a1b2c3d-4e5f-6789-abcd-ef0123456789.png";
          const TITULO_DO_POST = "Como limpar a base de contatos";
          const RESUMO_DO_POST = "Um roteiro de quatro passos para tirar o número morto.";

          /* ── OS PAPÉIS DOS DOIS CAMPOS DE IMAGEM, CONFERIDOS ─────────────
             O JSDoc de `PAPEIS_DO_CAMPO_DE_IMAGEM` promete que "a verificação
             cobra que ele cubra os dois campos com nomes que não se repetem", e
             essa asserção não existia. Repetir `miniatura-da-capa` nas duas
             entradas deixaria tudo verde apontando para o controle errado — que
             é exatamente o modo de falha que o mapa foi criado para impedir. */
          {
            const mapa = capa.PAPEIS_DO_CAMPO_DE_IMAGEM;
            const campos = Object.keys(mapa);
            afirmar(
              "o mapa de papéis cobre EXATAMENTE os dois campos de imagem da gaveta",
              campos.length === 2 &&
                campos.join(",") === capa.CAMPOS_DE_IMAGEM_DA_GAVETA.join(",") &&
                campos.join(",") === `imagem_url,${compartilhamento.CAMPO_DE_IMAGEM_DE_SEO}`,
              campos.join(","),
            );
            const papeisDaCapa = mapa.imagem_url;
            const papeisDeSeo = mapa[compartilhamento.CAMPO_DE_IMAGEM_DE_SEO];
            const chaves = Object.keys(papeisDaCapa);
            afirmar(
              "as duas entradas declaram as MESMAS chaves — uma chave a menos deixaria um seletor sem nome",
              chaves.length > 0 && chaves.join(",") === Object.keys(papeisDeSeo).join(","),
              `${chaves.join(",")} × ${Object.keys(papeisDeSeo).join(",")}`,
            );
            const repetidos = chaves.filter((chave) => papeisDaCapa[chave] === papeisDeSeo[chave]);
            afirmar(
              "e NENHUM nome se repete entre os dois campos — nome repetido faria a varredura julgar o controle errado",
              repetidos.length === 0 &&
                new Set([...Object.values(papeisDaCapa), ...Object.values(papeisDeSeo)]).size ===
                  chaves.length * 2,
              `repetidos: ${repetidos.join(", ") || "nenhum"}`,
            );
            /* E O CONTRATO DE TELA DA STORY 3.1 continua o que era: dez
               asserções leem `miniatura-da-capa` pelo nome, e renomeá-lo para
               ganhar simetria de string seria trocar o que importa pelo que é
               bonito — está escrito no próprio mapa. */
            afirmar(
              "e os nomes da CAPA continuam sendo os da Story 3.1 — o contrato de tela não foi renomeado por simetria",
              papeisDaCapa.miniatura === "miniatura-da-capa" &&
                papeisDaCapa.ausente === "capa-ausente" &&
                papeisDaCapa.seletor === "arquivo-da-capa",
              JSON.stringify(papeisDaCapa),
            );
          }

          /* ── O NOME DA CAPA TEM UMA GRAFIA SÓ ────────────────────────────
             Ele existia em quatro escritas independentes — a constante do
             módulo da capa, o padrão de `alternativoDaMiniatura`, o literal do
             rótulo na gaveta e a mensagem do servidor —, enquanto o lado do SEO
             tirava tudo de `ROTULOS_DE_SEO`. Agora todas derivam de
             `ROTULO_DA_CAPA`, do domínio. */
          {
            const doDominio = doArquivo.ROTULO_DA_CAPA;
            afirmar(
              "as falas da capa DERIVAM de uma grafia só — nome, rótulo do grupo e `alt` padrão saem todos dela",
              capa.NOME_DA_CAPA === doDominio.toLowerCase() &&
                capa.ROTULO_DA_ORIGEM_DA_CAPA === capa.rotuloDoGrupoDeOrigem(doDominio) &&
                capa.alternativoDaMiniatura("").startsWith(doDominio) &&
                capa.FALA_DA_CAPA_QUEBRADA.includes(doDominio.toLowerCase()),
              `${doDominio} | ${capa.NOME_DA_CAPA} | ${capa.alternativoDaMiniatura("")}`,
            );
          }

          /* ── A FALA DA HERANÇA LÊ `origem`, E SÓ ELA ─────────────────────
             O JSDoc dela falava de `{valor, origem, herdado}` e a gaveta passa
             a parte da IMAGEM, que tem `endereco` e não `valor`. Ela caía na
             frase sem valor POR ACIDENTE: renomear `endereco` para `valor` no
             domínio faria a tela imprimir a URL crua dentro das aspas. Agora
             quem decide se o valor aparece é a tabela, por origem. */
          {
            const comoAImagemVem = compartilhamento.metadadosDoPost(
              { titulo: "T", imagem_url: CAPA_GRAVADA, imagem_alt: "A capa" },
              { dominio: DOMINIO },
            ).imagem;
            afirmar(
              "a parte da imagem NÃO tem `valor` — é `endereco`, e a fala não pode depender dessa ausência",
              !Object.hasOwn(comoAImagemVem, "valor") &&
                typeof comoAImagemVem.endereco === "string",
              Object.keys(comoAImagemVem).join(","),
            );
            /* A PROVA: um objeto com a MESMA origem e um `valor` de mentira
               continua produzindo a frase SEM valor. Antes, este caso imprimia
               a string dentro das aspas. */
            afirmar(
              "e com um `valor` presente a fala da imagem continua SEM valor — a decisão é da origem, não da forma",
              seo.falaDaHeranca({ origem: "capa", valor: "https://x.co/a.png" }) ===
                seo.falaDaHeranca({ origem: "capa" }) &&
                !seo.falaDaHeranca({ origem: "capa", valor: "https://x.co/a.png" }).includes(
                  "https://x.co/a.png",
                ),
              seo.falaDaHeranca({ origem: "capa", valor: "https://x.co/a.png" }),
            );
            afirmar(
              "e as origens de TEXTO continuam mostrando o valor — é ele que o Autor reconhece",
              seo.falaDaHeranca({ origem: "titulo", valor: "O título" }).includes("O título") &&
                seo.falaDaHeranca({ origem: "resumo", valor: "O resumo" }).includes("O resumo"),
              seo.falaDaHeranca({ origem: "titulo", valor: "O título" }),
            );
          }

          /* ── A HERANÇA DO FORMULÁRIO NÃO ENGOLE DEFEITO ALHEIO ───────────
             Ela devolvia QUALQUER exceção como se fosse o defeito de montagem:
             um `TypeError` de bug real virava uma caixa vermelha
             indistinguível de "faltou a variável de ambiente", e quem lesse a
             tela procuraria o defeito no lugar errado. */
          {
            const semDominio = seo.herancaDoFormulario({ titulo: "T" }, { dominio: "" });
            afirmar(
              "sem Domínio Canônico ela devolve o DEFEITO NOMEADO, com a frase do domínio",
              semDominio.ok === false &&
                semDominio.defeito === compartilhamento.DEFEITO_DE_DOMINIO_AUSENTE,
              JSON.stringify(semDominio),
            );
            /* E O RESTO SOBE. `valores` que lança ao ser lido produz um erro
               que não é o esperado — e ele tem de chegar ao limite de erro do
               Painel, não virar a mesma caixa vermelha. */
            const valoresQueExplodem = new Proxy(
              {},
              {
                get() {
                  throw new TypeError("defeito de verdade, e não de montagem");
                },
              },
            );
            let subiu = null;
            try {
              seo.herancaDoFormulario(valoresQueExplodem, { dominio: DOMINIO });
            } catch (erro) {
              subiu = erro;
            }
            afirmar(
              "e uma exceção QUALQUER sobe em vez de ser pintada como defeito de montagem",
              subiu instanceof TypeError &&
                String(subiu.message) !== compartilhamento.DEFEITO_DE_DOMINIO_AUSENTE,
              String(subiu?.message ?? "não lançou"),
            );
          }

          /* ── O DOMÍNIO CANÔNICO VEM DA VARIÁVEL, E NÃO DA ORIGEM ─────────
             A versão anterior lia `window.location.origin` e mais nada. Em
             implantação de PRÉVIA a origem é o host efêmero, e a herança
             mostrada apontaria para um endereço que produção nunca emite — no
             ambiente feito justamente para conferir antes de publicar. E num
             host `http` de terceiro `raizDoSite` recusa, e a seção inteira
             virava caixa vermelha mandando procurar uma variável que não
             existia. */
          {
            const dominio = modulo.regrasDoDominio;
            const DE_PRODUCAO = "https://chatclean.com.br";
            const DE_PREVIA = "https://painel-abc123.vercel.app";
            afirmar(
              "a VARIÁVEL ganha da origem — inclusive numa prévia, que é onde a origem mentiria",
              dominio.dominioDoSite({ declarado: DE_PRODUCAO, origem: DE_PREVIA }) ===
                DE_PRODUCAO,
              dominio.dominioDoSite({ declarado: DE_PRODUCAO, origem: DE_PREVIA }),
            );
            afirmar(
              "sem a variável, a origem entra — é o que mantém `localhost` funcionando sem configurar nada",
              dominio.dominioDoSite({ declarado: "", origem: "http://localhost:5173" }) ===
                "http://localhost:5173" &&
                dominio.dominioDoSite({ declarado: "", origem: DE_PRODUCAO }) === DE_PRODUCAO,
              dominio.dominioDoSite({ declarado: "", origem: "http://localhost:5173" }),
            );
            afirmar(
              "e origem que NÃO serve como domínio canônico vira ausência, e não um endereço torto",
              dominio.dominioDoSite({ declarado: "", origem: "http://exemplo.com.br" }) === "" &&
                dominio.dominioDoSite({ declarado: "", origem: "" }) === "" &&
                dominio.dominioDoSite({ declarado: "", origem: "https://x.co/painel" }) === "",
              JSON.stringify([
                dominio.dominioDoSite({ declarado: "", origem: "http://exemplo.com.br" }),
                dominio.dominioDoSite({ declarado: "", origem: "https://x.co/painel" }),
              ]),
            );
            afirmar(
              "e variável TORTA não ganha da origem boa — quem julga é `raizDoSite`, do domínio",
              dominio.dominioDoSite({ declarado: "nao-e-endereco", origem: DE_PRODUCAO }) ===
                DE_PRODUCAO,
              dominio.dominioDoSite({ declarado: "nao-e-endereco", origem: DE_PRODUCAO }),
            );
            afirmar(
              "e o nome da variável é declarado no módulo — é ele que a frase de defeito cita",
              dominio.VARIAVEL_DO_DOMINIO === "VITE_DOMINIO_DO_SITE" &&
                compartilhamento.DEFEITO_DE_DOMINIO_AUSENTE.includes(dominio.VARIAVEL_DO_DOMINIO),
              `${dominio.VARIAVEL_DO_DOMINIO} | ${compartilhamento.DEFEITO_DE_DOMINIO_AUSENTE}`,
            );
          }

          /* ── OS CAMPOS DA GAVETA SÃO OS DO DOMÍNIO ──────────────────────
             `CAMPOS_DA_GAVETA` é a declaração única da ordem, e os três de SEO
             entram nela espalhados de `CAMPOS_DE_SEO`. A igualdade de conjunto
             é o que impede um quarto nome inventado de chegar ao pedido. */
          afirmar(
            "os campos de SEO da gaveta são EXATAMENTE os do domínio — nem um a menos, nem um inventado",
            regrasDosMetadados.CAMPOS_DA_GAVETA.filter((c) => c.startsWith("seo_")).join(",") ===
              compartilhamento.CAMPOS_DE_SEO.join(","),
            regrasDosMetadados.CAMPOS_DA_GAVETA.filter((c) => c.startsWith("seo_")).join(","),
          );

          /* ── O RESÍDUO DOBRADO CONTINUA DIZÍVEL ─────────────────────────
             `removerImagensAnteriores` junta os dois caminhos num resíduo só
             quando as DUAS colunas deixam arquivo para trás. Quem lê isso é
             esta fala, e um resíduo que a tela não sabe dizer é um resíduo
             silencioso com outro nome. */
          afirmar(
            "a fala do resíduo nomeia os DOIS arquivos quando os dois sobram — nenhum fica escondido atrás do outro",
            (capa.falaDoResiduo({ arquivo: "capas/a.png e capas/b.png" })?.oQueFazer ?? "")
              .includes("capas/a.png") &&
              (capa.falaDoResiduo({ arquivo: "capas/a.png e capas/b.png" })?.oQueFazer ?? "")
                .includes("capas/b.png"),
            JSON.stringify(capa.falaDoResiduo({ arquivo: "capas/a.png e capas/b.png" })),
          );

          /* — AS REGRAS PURAS, EXECUTADAS — */
          //
          // "O contador sinaliza e não bloqueia" e "a tela mostra o que será
          // herdado" são regras de FUNÇÃO antes de serem regras de JSX, e é
          // assim que elas se provam sem depender de uma consulta ao DOM.
          afirmar(
            "o contador é os DOIS números, e ele julga o comprimento APARADO — espaço nas pontas não conta como caractere escrito",
            seo.textoDoContador("seo_titulo", "abc") === "3 / 60" &&
              seo.textoDoContador("seo_titulo", "  abc  ") === "3 / 60" &&
              seo.textoDoContador("seo_descricao", "") === "0 / 155" &&
              seo.textoDoContador("inventado", "abc") === "",
            `${seo.textoDoContador("seo_titulo", "  abc  ")} | ${seo.textoDoContador("seo_descricao", "")}`,
          );
          afirmar(
            "o aviso de comprimento DIZ QUE DÁ PARA SALVAR — conselho vestido de erro treina a pessoa a ignorar o erro que importa",
            seo.avisoDeComprimento("seo_titulo", "a".repeat(60)) === null &&
              (seo.avisoDeComprimento("seo_titulo", "a".repeat(61)) ?? "").includes("60") &&
              (seo.avisoDeComprimento("seo_titulo", "a".repeat(61)) ?? "").includes(
                "Dá para salvar",
              ),
            JSON.stringify(seo.avisoDeComprimento("seo_titulo", "a".repeat(61))),
          );
          /* A FALA DA HERANÇA CARREGA O VALOR, e não só a fonte: "herda o
             título do post" sem dizer QUAL título é uma promessa que a pessoa
             ainda tem de publicar para conferir. */
          afirmar(
            "a fala da herança nomeia a FONTE e mostra o VALOR — e some quando o campo tem valor próprio",
            seo.falaDaHeranca({ valor: "Um título", origem: "titulo", herdado: true }) ===
              "Herda o título do post: “Um título”" &&
              seo.falaDaHeranca({ valor: "x", origem: "compartilhamento", herdado: false }) ===
                null &&
              seo.falaDaHeranca({ valor: null, origem: null, herdado: true }).includes(
                "ausente",
              ),
            JSON.stringify(
              seo.falaDaHeranca({ valor: "Um título", origem: "titulo", herdado: true }),
            ),
          );

          /* — A GAVETA MONTADA, COM UM POST QUE TEM O QUE HERDAR — */
          {
            const alvo = janela.document.createElement("div");
            janela.document.body.appendChild(alvo);
            const raizReact = createRoot(alvo);
            let valores = {
              ...regrasDosMetadados.valoresVazios(),
              titulo: TITULO_DO_POST,
              resumo: RESUMO_DO_POST,
              imagem_url: CAPA_GRAVADA,
              imagem_alt: "Tela do ChatClean",
            };
            let dominio = DOMINIO;
            const desenhar = () =>
              React.createElement(modulo.GavetaDeMetadados, {
                valores,
                categorias: [],
                baseDaCapaDoProjeto: "https://x.supabase.co",
                dominioDoSite: dominio,
                envios: {},
                aoEscolherArquivo: () => {},
                aoRemoverImagem: () => {},
                aoMudar: (campoMudado, valor) => {
                  valores = { ...valores, [campoMudado]: valor };
                  raizReact.render(desenhar());
                },
              });
            await act(async () => {
              raizReact.render(desenhar());
            });

            const secaoDeSeo = alvo.querySelector('[data-papel="secao-de-seo"]');
            const doCampo = (nome) => alvo.querySelector(`[data-campo="${nome}"]`);

            /* OS TRÊS EXISTEM, NUMA SEÇÃO PRÓPRIA, E TODOS SÃO OPCIONAIS.
               "Opcional que parece obrigatório é o mesmo defeito de um campo
               obrigatório escondido": o que se mede é a ausência da marca de
               obrigatoriedade que a gaveta desenha por extenso, e a ausência de
               `required` — não a de um asterisco, que este projeto não usa. */
            {
              const rotulosDaSecao = [...secaoDeSeo.querySelectorAll("label")];
              const comObrigatorio = rotulosDaSecao.filter((r) =>
                (r.textContent ?? "").includes("obrigatório"),
              );
              const comRequired = [...secaoDeSeo.querySelectorAll("input, textarea")].filter(
                (c) => c.required === true,
              );
              /* O CONTROLE DE UM CAMPO DE IMAGEM É O SELETOR DE ARQUIVO no
                 modo de envio — é ele que a pessoa opera, e é para ele que o
                 rótulo aponta. A tradução vem do mapa declarado em `capa.js`,
                 a mesma que a asserção de ordem usa. */
              const controleDe = (nome) =>
                doCampo(
                  capa.CAMPOS_DE_IMAGEM_DA_GAVETA.includes(nome)
                    ? capa.nomeDoSeletorDeArquivo(nome)
                    : nome,
                );
              afirmar(
                "a seção de SEO existe e traz os TRÊS campos, com rótulo associado a cada um",
                secaoDeSeo !== null &&
                  compartilhamento.CAMPOS_DE_SEO.every((nome) => {
                    const controle = controleDe(nome);
                    if (controle === null) return false;
                    const rotulo = rotulosDaSecao.find((r) => r.getAttribute("for") === controle.id);
                    return (
                      rotulo !== undefined &&
                      (rotulo.textContent ?? "")
                        .trim()
                        .startsWith(compartilhamento.ROTULOS_DE_SEO[nome])
                    );
                  }),
                compartilhamento.CAMPOS_DE_SEO.map((n) => `${n}: ${controleDe(n) !== null}`).join(
                  ", ",
                ),
              );
              afirmar(
                "e os três são OPCIONAIS: nenhum rótulo da seção diz “obrigatório”, e nenhum controle é `required`",
                comObrigatorio.length === 0 && comRequired.length === 0,
                `${comObrigatorio.map((r) => r.textContent).join(" | ")} | required: ${comRequired.length}`,
              );
            }

            /* O QUE SERÁ HERDADO APARECE — E O QUE SE COBRA É O VALOR.
               Uma asserção que só perguntasse "há uma frase embaixo do campo"
               passaria com a frase certa embaixo do campo errado, ou com a
               herança lendo a fonte errada. O que se compara é o TEXTO DO
               POST, capturado de dentro do bloco daquele campo. */
            {
              const blocoDe = (nome) =>
                alvo.querySelector(`[data-papel="campo-de-seo-${nome}"]`);
              const textoDoBloco = (nome) => blocoDe(nome)?.textContent ?? "";
              afirmar(
                "com o Título SEO vazio, a tela mostra QUE valor será herdado — o título do post, por extenso",
                textoDoBloco("seo_titulo").includes(TITULO_DO_POST) &&
                  !textoDoBloco("seo_titulo").includes(RESUMO_DO_POST),
                textoDoBloco("seo_titulo"),
              );
              afirmar(
                "e com a Meta Descrição vazia, o RESUMO — e não o título, que é a troca de fonte que uma contagem não pegaria",
                textoDoBloco("seo_descricao").includes(RESUMO_DO_POST) &&
                  !textoDoBloco("seo_descricao").includes(TITULO_DO_POST),
                textoDoBloco("seo_descricao"),
              );
              /* E A FRASE ESTÁ NO `aria-describedby` DO CAMPO: quem usa leitor
                 de tela precisa ouvir a herança JUNTO do campo, e não descobrir
                 depois de publicar. */
              const descrito = janela.document.getElementById(
                (doCampo("seo_titulo").getAttribute("aria-describedby") ?? "")
                  .split(" ")
                  .at(-1),
              );
              afirmar(
                "e ela é ANUNCIADA junto do campo, pelo `aria-describedby` — não é só tinta na tela",
                (descrito?.textContent ?? "").includes(TITULO_DO_POST),
                descrito?.textContent ?? "sem descritor",
              );
              /* A IMAGEM DE COMPARTILHAMENTO VAZIA DIZ QUE HERDA A CAPA. */
              afirmar(
                "e a Imagem de Compartilhamento vazia diz que HERDA A CAPA, no lugar da imagem",
                (alvo.querySelector('[data-papel="ajuda-da-imagem-de-seo-ausente"]')
                  ?.textContent ?? "").includes("imagem de capa"),
                alvo.querySelector('[data-papel="ajuda-da-imagem-de-seo-ausente"]')?.textContent ??
                  "ausente",
              );
              /* E QUEM DECIDE É O DOMÍNIO: a frase da tela é a MESMA que
                 `metadadosDoPost` produz para o mesmo formulário. Sem esta
                 comparação, a gaveta poderia montar a herança por conta
                 própria e continuar verde. */
              const doDominio = compartilhamento.metadadosDoPost(
                seo.postDosValores(valores),
                { dominio: DOMINIO },
              );
              afirmar(
                "e a frase desenhada é a que o DOMÍNIO decidiu — a gaveta não monta herança por conta própria",
                textoDoBloco("seo_titulo").includes(seo.falaDaHeranca(doDominio.titulo)) &&
                  textoDoBloco("seo_descricao").includes(seo.falaDaHeranca(doDominio.descricao)),
                `${seo.falaDaHeranca(doDominio.titulo)}`,
              );

              /* ── A RECUSA DA CADEIA, DESENHADA (Story 3.4) ──────────────
                 `metadadosDoPost` devolve `recusadas`, e até aqui o único
                 consumidor calculava a lista e a jogava fora. O caso que isso
                 escondia é real e silencioso: uma Imagem de Compartilhamento
                 cujo endereço o vocabulário de esquema ACEITA — então nenhuma
                 recusa de formulário aparece — mas cuja espécie está fora da
                 prévia (`.gif`, `.svg`, WebP) mostrava a miniatura, caía para a
                 capa, e nada dizia por quê. */
              {
                const GIF = "https://cdn.exemplo.com/animacao.gif";
                await act(async () => {
                  valores = { ...valores, seo_imagem_url: GIF };
                  raizReact.render(desenhar());
                });
                const decidido = compartilhamento.metadadosDoPost(
                  seo.postDosValores(valores),
                  { dominio: DOMINIO },
                );
                const motivo = seo.recusaDaCadeia(
                  decidido,
                  compartilhamento.CAMPO_DE_IMAGEM_DE_SEO,
                );
                afirmar(
                  "espécie fora da prévia é RECUSADA pela cadeia, e o endereço continua dentro do vocabulário de esquema — é o silêncio que este caso escondia",
                  typeof motivo === "string" &&
                    motivo.length > 0 &&
                    doArquivo.enderecoDeImagemPermitido(GIF) === true &&
                    doArquivo.problemaNoEnderecoDaImagem(GIF) === null &&
                    decidido.imagem.origem === "capa",
                  `motivo: ${motivo} | origem resolvida: ${decidido.imagem.origem}`,
                );
                const desenhada = alvo.querySelector(
                  '[data-papel="recusa-da-cadeia-da-imagem-de-seo"]',
                );
                afirmar(
                  "e a tela DESENHA essa recusa, com a MESMA frase que o domínio nomeou — não uma segunda explicação",
                  desenhada !== null && desenhada.textContent === motivo,
                  `${desenhada?.textContent ?? "não desenhada"} × ${motivo}`,
                );
                /* E ELA NÃO É UMA RECUSA DE SALVAMENTO. O valor é gravável, e
                   vestir isto de erro treinaria o Autor a ignorar o erro que
                   importa — a mesma razão pela qual o aviso do contador também
                   não usa `Recusa`. */
                const pedidoComGif = regrasDosMetadados.corpoDoPedido({
                  valores: { ...valores, titulo: "Um post", resumo: "Resumo" },
                  documento: { type: "doc", content: [] },
                });
                afirmar(
                  "e ela NÃO bloqueia o salvamento nem marca o campo como inválido — o valor é gravável, a cadeia é que não o aproveita",
                  desenhada.getAttribute("role") === null &&
                    desenhada.getAttribute("aria-invalid") === null &&
                    pedidoComGif.ok === true &&
                    pedidoComGif.corpo.seo_imagem_url === GIF,
                  `${desenhada.getAttribute("role")} | pedido: ${JSON.stringify(pedidoComGif.ok)}`,
                );

                /* CONTROLE POSITIVO: sem recusa, o parágrafo não existe. Sem
                   ele, um bloco desenhado sempre passaria a asserção acima. */
                await act(async () => {
                  valores = { ...valores, seo_imagem_url: "" };
                  raizReact.render(desenhar());
                });
                afirmar(
                  "controle positivo: sem recusa na cadeia, o bloco não é desenhado — ele não é decoração permanente",
                  alvo.querySelector('[data-papel="recusa-da-cadeia-da-imagem-de-seo"]') === null,
                  "o bloco continuou na tela sem motivo",
                );
              }

              /* ── A AUSÊNCIA NÃO INVENTA O QUE VAI ACONTECER ─────────────
                 A frase de reserva afirmava que "o artigo aparece com o
                 monograma da categoria" — falso duas vezes: o monograma é
                 recurso do PAINEL, e o que um Post sem capa declara ao ser
                 compartilhado é decidido pelo domínio. Uma tela que responde
                 "o que vai acontecer" por conta própria é a segunda opinião que
                 o AD-20 proíbe, e ela aparecia justo no ramo em que a tela já
                 está avisando que falta alguma coisa. */
              {
                /* SEM CAPA, que é o ramo em que a frase aparece. */
                await act(async () => {
                  valores = { ...valores, imagem_url: "", imagem_alt: "" };
                  raizReact.render(desenhar());
                });
                const daCapa = alvo.querySelector('[data-papel="ajuda-da-capa-ausente"]');
                afirmar(
                  "a frase de capa ausente NÃO afirma o que o artigo vai mostrar — ela diz só que falta a imagem",
                  daCapa !== null &&
                    daCapa.textContent === `Sem ${capa.NOME_DA_CAPA}.` &&
                    !/monograma/i.test(daCapa.textContent),
                  daCapa?.textContent ?? "ausente",
                );
                /* E O CAMPO QUE HERDA continua contando a herança, que é o
                   fato que ele PODE afirmar — porque quem o decidiu foi o
                   domínio. */
                const deSeo = alvo.querySelector(
                  '[data-papel="ajuda-da-imagem-de-seo-ausente"]',
                );
                afirmar(
                  "e a da Imagem de Compartilhamento continua contando a herança — esse fato o domínio decidiu, e a tela pode dizê-lo",
                  deSeo !== null &&
                    deSeo.textContent ===
                      seo.falaDaHeranca(
                        compartilhamento.metadadosDoPost(seo.postDosValores(valores), {
                          dominio: DOMINIO,
                        }).imagem,
                      ),
                  deSeo?.textContent ?? "ausente",
                );
              }
            }

            /* ─── O CONTADOR: SINALIZA, NÃO BLOQUEIA, NÃO TRUNCA ────────── */
            {
              const usual = compartilhamento.COMPRIMENTO_USUAL_DE_SEO.seo_titulo;
              const noLimite = "t".repeat(usual);
              const acima = "t".repeat(usual + 25);

              await act(async () => {
                valores = { ...valores, seo_titulo: noLimite };
                raizReact.render(desenhar());
              });
              const contador = () =>
                alvo.querySelector('[data-papel="contador-de-seo_titulo"]');
              afirmar(
                "no comprimento usual o contador NÃO sinaliza, e o número que ele mostra é o do texto",
                contador()?.getAttribute("data-acima") === "false" &&
                  (contador()?.textContent ?? "") === `${usual} / ${usual}` &&
                  alvo.querySelector('[data-papel="aviso-de-comprimento-seo_titulo"]') === null,
                `${contador()?.getAttribute("data-acima")}: ${contador()?.textContent}`,
              );

              await act(async () => {
                valores = { ...valores, seo_titulo: acima };
                raizReact.render(desenhar());
              });
              const aviso = alvo.querySelector(
                '[data-papel="aviso-de-comprimento-seo_titulo"]',
              );
              afirmar(
                "acima do usual o contador SINALIZA, com o número do texto e o aviso ao lado",
                contador()?.getAttribute("data-acima") === "true" &&
                  (contador()?.textContent ?? "") === `${usual + 25} / ${usual}` &&
                  aviso !== null &&
                  (aviso.textContent ?? "") === seo.avisoDeComprimento("seo_titulo", acima),
                `${contador()?.textContent} | ${aviso?.textContent ?? "sem aviso"}`,
              );
              /* E SINALIZAR NÃO É RECUSAR. O aviso não é `role="alert"`, o
                 campo não fica `aria-invalid`, e a tinta não é a destrutiva:
                 um conselho vestido de erro é a falha que não é falha. */
              afirmar(
                "e sinalizar NÃO é recusar: sem `role=\"alert\"`, sem `aria-invalid` e sem a tinta de recusa",
                aviso?.getAttribute("role") === null &&
                  doCampo("seo_titulo")?.getAttribute("aria-invalid") === null &&
                  !(aviso?.getAttribute("class") ?? "").includes("destructive"),
                `${aviso?.getAttribute("role")} | ${doCampo("seo_titulo")?.getAttribute("aria-invalid")}`,
              );
              /* E NÃO TRUNCA. `maxLength` faria o texto colado sumir sem
                 aviso — é a decisão que a Story 3.1 tomou para a descrição da
                 imagem, e ela vale aqui pelo mesmo motivo. */
              afirmar(
                "e não TRUNCA: o texto continua inteiro no campo, e nenhum controle da seção tem `maxlength`",
                doCampo("seo_titulo")?.value === acima &&
                  [...secaoDeSeo.querySelectorAll("input, textarea")].every(
                    (c) => c.getAttribute("maxlength") === null,
                  ),
                `${doCampo("seo_titulo")?.value?.length} caracteres`,
              );
              /* E NÃO BLOQUEIA O SALVAMENTO. É aqui que "não bloqueia" deixa
                 de ser promessa: o corpo do pedido sai, com o texto INTEIRO. */
              const pedido = regrasDosMetadados.corpoDoPedido({
                valores,
                documento: { type: "doc", content: [] },
              });
              afirmar(
                "e NÃO BLOQUEIA: o pedido sai, e leva o texto inteiro — o número usual é conselho, não regra do produto",
                pedido.ok === true && pedido.corpo.seo_titulo === acima,
                `${pedido.ok} | ${pedido.corpo?.seo_titulo?.length}`,
              );
            }

            /* ─── O TETO DE HIGIENE, ESSE SIM, RECUSA ──────────────────── */
            {
              const teto = compartilhamento.TETO_DE_HIGIENE_DE_SEO.seo_titulo;
              const enorme = "t".repeat(teto + 1);
              await act(async () => {
                valores = { ...valores, seo_titulo: enorme };
                raizReact.render(desenhar());
              });
              const marcado = doCampo("seo_titulo");
              const recusa = janela.document.getElementById(
                (marcado.getAttribute("aria-describedby") ?? "").split(" ")[0],
              );
              const pedido = regrasDosMetadados.corpoDoPedido({
                valores,
                documento: { type: "doc", content: [] },
              });
              afirmar(
                `o teto de HIGIENE (${teto}) recusa: o campo é marcado, a frase diz o teto, e o pedido NÃO sai`,
                marcado?.getAttribute("aria-invalid") === "true" &&
                  (recusa?.textContent ?? "").includes(String(teto)) &&
                  pedido.ok === false &&
                  pedido.campo === "seo_titulo",
                `${marcado?.getAttribute("aria-invalid")} | ${recusa?.textContent} | ${pedido.ok}`,
              );
              /* E OS DOIS NÚMEROS FAZEM TRABALHOS DIFERENTES SOBRE O MESMO
                 TEXTO: o que passa do usual é aceito e o que passa do teto não.
                 Um número só faria uma das duas asserções acima impossível. */
              afirmar(
                "e os dois números são mesmo dois: o texto acima do usual passou, e este, acima do teto, não",
                compartilhamento.TETO_DE_HIGIENE_DE_SEO.seo_titulo >
                  compartilhamento.COMPRIMENTO_USUAL_DE_SEO.seo_titulo *
                    compartilhamento.DISTANCIA_MINIMA_ENTRE_OS_DOIS - 1,
                `${compartilhamento.COMPRIMENTO_USUAL_DE_SEO.seo_titulo} vs ${teto}`,
              );
              await act(async () => {
                valores = { ...valores, seo_titulo: "" };
                raizReact.render(desenhar());
              });
            }

            /* ─── A IMAGEM DE COMPARTILHAMENTO É O MESMO CONTROLE ───────── */
            //
            // "Duas formas de dizer a mesma coisa na mesma gaveta é sinônimo."
            // O que se cobra é a IDENTIDADE do controle: as mesmas duas
            // origens, o mesmo `accept` do vocabulário do domínio, a mesma
            // degradação — e nomes acessíveis distintos, senão quem navega por
            // leitor de tela ouve o mesmo rótulo duas vezes.
            {
              const grupoDaCapa = alvo.querySelector('[data-papel="origem-da-capa"]');
              const grupoDeSeo = alvo.querySelector('[data-papel="origem-da-imagem-de-seo"]');
              const opcoesDe = (grupo) =>
                [...grupo.querySelectorAll("[data-origem-da-capa]")].map((o) =>
                  o.getAttribute("data-origem-da-capa"),
                );
              afirmar(
                "a Imagem de Compartilhamento oferece AS MESMAS duas origens da capa — não um campo de texto cru",
                grupoDeSeo !== null &&
                  grupoDeSeo.getAttribute("role") === "radiogroup" &&
                  opcoesDe(grupoDeSeo).join(",") === capa.ORIGENS_DA_CAPA.join(",") &&
                  opcoesDe(grupoDeSeo).join(",") === opcoesDe(grupoDaCapa).join(","),
                `${opcoesDe(grupoDeSeo).join(",")} vs ${opcoesDe(grupoDaCapa).join(",")}`,
              );
              afirmar(
                "e os dois grupos têm nomes acessíveis DISTINTOS — o mesmo rótulo duas vezes deixaria quem navega sem saber qual está operando",
                grupoDeSeo.getAttribute("aria-label") !==
                  grupoDaCapa.getAttribute("aria-label") &&
                  grupoDeSeo
                    .getAttribute("aria-label")
                    .toLowerCase()
                    .includes("compartilhamento"),
                `${grupoDaCapa.getAttribute("aria-label")} | ${grupoDeSeo.getAttribute("aria-label")}`,
              );
              const seletorDeSeo = doCampo(capa.nomeDoSeletorDeArquivo("seo_imagem_url"));
              const seletorDaCapa = doCampo(capa.nomeDoSeletorDeArquivo("imagem_url"));
              afirmar(
                "e ela ENVIA ARQUIVO como a capa, com o mesmo `accept` do vocabulário do domínio",
                seletorDeSeo !== null &&
                  seletorDeSeo.type === "file" &&
                  seletorDeSeo.getAttribute("accept") === doArquivo.TIPOS_DE_IMAGEM.join(",") &&
                  seletorDeSeo.getAttribute("accept") === seletorDaCapa.getAttribute("accept"),
                `${seletorDeSeo?.getAttribute("accept")}`,
              );
              /* A DEGRADAÇÃO É A MESMA: o monograma no lugar da imagem, com o
                 nome acessível dizendo QUAL campo falhou. */
              afirmar(
                "e ela degrada para o MESMO monograma, com o nome acessível dizendo que o campo é o de compartilhamento",
                alvo.querySelector('[data-papel="imagem-de-seo-ausente"]') !== null &&
                  (alvo
                    .querySelector('[data-papel="imagem-de-seo-ausente"]')
                    ?.getAttribute("aria-label") ?? "")
                    .toLowerCase()
                    .includes("compartilhamento"),
                alvo
                  .querySelector('[data-papel="imagem-de-seo-ausente"]')
                  ?.getAttribute("aria-label") ?? "ausente",
              );
              /* E O ENDEREÇO DELA É RECUSADO ANTES DO SALVAMENTO, pelo MESMO
                 vocabulário de esquema — a mesma frase da capa, e não uma
                 segunda opinião sobre endereço aceitável. */
              await act(async () => {
                valores = { ...valores, seo_imagem_url: "data:image/png;base64,iVBOR" };
                raizReact.render(desenhar());
              });
              const campoDeEndereco = doCampo("seo_imagem_url");
              await act(async () => {
                /* `focusout`, e não `blur`: é o evento que borbulha, e é o que o React
                     escuta para disparar `onBlur`. */
                campoDeEndereco.dispatchEvent(new janela.FocusEvent("focusout", { bubbles: true }));
              });
              const recusaVisivel = janela.document.getElementById(
                (doCampo("seo_imagem_url").getAttribute("aria-describedby") ?? "").split(" ")[0],
              );
              const pedidoComEnderecoRuim = regrasDosMetadados.corpoDoPedido({
                valores,
                documento: { type: "doc", content: [] },
              });
              afirmar(
                "e o endereço fora do vocabulário é recusado ANTES do salvamento, com a MESMA frase da capa",
                (recusaVisivel?.textContent ?? "") ===
                  doArquivo.problemaNoEnderecoDaImagem("data:image/png;base64,iVBOR") &&
                  pedidoComEnderecoRuim.ok === false &&
                  pedidoComEnderecoRuim.campo === "seo_imagem_url",
                `${recusaVisivel?.textContent} | ${pedidoComEnderecoRuim.ok}`,
              );
              await act(async () => {
                valores = { ...valores, seo_imagem_url: "" };
                raizReact.render(desenhar());
              });
            }

            /* ─── SALVAR COM OS TRÊS VAZIOS FUNCIONA ────────────────────── */
            //
            // É o critério de aceite, e é a diferença entre "opcional" escrito
            // no rótulo e opcional de verdade. Os três viajam como `null`, que
            // é o pedido explícito de HERDAR — omiti-los faria o servidor
            // preservar o que estava gravado, e apagar um Título SEO na tela
            // não teria efeito nenhum.
            {
              const pedido = regrasDosMetadados.corpoDoPedido({
                valores: { ...regrasDosMetadados.valoresVazios(), titulo: "T", resumo: "R" },
                documento: { type: "doc", content: [] },
              });
              afirmar(
                "salvar com os três campos de SEO vazios FUNCIONA, e os três viajam como `null` — vazio é o pedido de herdar",
                pedido.ok === true &&
                  compartilhamento.CAMPOS_DE_SEO.every(
                    (nome) =>
                      Object.hasOwn(pedido.corpo, nome) && pedido.corpo[nome] === null,
                  ),
                JSON.stringify(
                  compartilhamento.CAMPOS_DE_SEO.map((n) => [n, pedido.corpo?.[n]]),
                ),
              );
              /* E SÓ ESPAÇOS TAMBÉM É VAZIO no caminho do pedido: a tela apara
                 antes de mandar, senão o banco guardaria três espaços e a
                 etiqueta sairia em branco. */
              const soEspacos = regrasDosMetadados.corpoDoPedido({
                valores: {
                  ...regrasDosMetadados.valoresVazios(),
                  titulo: "T",
                  resumo: "R",
                  seo_titulo: "   ",
                  seo_descricao: "\t\n ",
                },
                documento: { type: "doc", content: [] },
              });
              afirmar(
                "e campo com só espaços vira `null` no pedido — não uma etiqueta em branco gravada na coluna",
                soEspacos.ok === true &&
                  soEspacos.corpo.seo_titulo === null &&
                  soEspacos.corpo.seo_descricao === null,
                JSON.stringify([soEspacos.corpo?.seo_titulo, soEspacos.corpo?.seo_descricao]),
              );
            }

            /* ─── E SEM O DOMÍNIO CANÔNICO, O DEFEITO APARECE NOMEADO ───── */
            //
            // A herança da imagem precisa do Domínio Canônico, e sem ele
            // `metadadosDoPost` LANÇA. Propagar a exceção derrubaria a gaveta
            // inteira — com o Título, o Resumo e o conteúdo do Post junto; e
            // engoli-la mostraria uma seção em branco, que é o silêncio que
            // este projeto proíbe. O que a tela faz é DESENHAR o defeito.
            {
              await act(async () => {
                dominio = "";
                raizReact.render(desenhar());
              });
              const dito = alvo.querySelector('[data-papel="heranca-indisponivel"]');
              afirmar(
                "sem Domínio Canônico a seção mostra o DEFEITO DE MONTAGEM nomeado — e a gaveta continua de pé",
                dito !== null &&
                  (dito.textContent ?? "") === compartilhamento.DEFEITO_DE_DOMINIO_AUSENTE &&
                  dito.getAttribute("role") === "alert" &&
                  /* A GAVETA CONTINUA INTEIRA: sem esta cláusula, uma exceção
                     propagada que apagasse a gaveta passaria pela primeira. */
                  doCampo("titulo") !== null &&
                  doCampo("seo_titulo") !== null,
                dito?.textContent ?? "nada foi dito",
              );
              await act(async () => {
                dominio = DOMINIO;
                raizReact.render(desenhar());
              });
            }

            await act(async () => raizReact.unmount());
            alvo.remove();
          }

          /* ─── E O EDITOR MANDA OS TRÊS PELO CAMINHO ÚNICO ───────────── */
          //
          // A gaveta é controlada e não grava. Quem monta o pedido e o entrega
          // à porta única é o Editor — e sem esta montagem "existe caminho de
          // escrita" continuaria sendo uma afirmação sobre `CAMPOS_ACEITOS`,
          // e não sobre o que a tela faz.
          {
            const tela = await montarTela({ postId: null });
            await tela.digitar(tela.campo("titulo"), "Um post com SEO");
            await tela.digitar(tela.campo("resumo"), "O resumo do post");
            await tela.digitar(tela.campo("seo_titulo"), "Título de busca");
            await tela.digitar(tela.campo("seo_descricao"), "Descrição de busca");
            await tela.clicar(tela.acaoPorChave("salvar"));
            const enviado = modulo.controle.pedidos.at(-1);
            afirmar(
              "o Editor manda os campos de SEO pelo caminho único, com o texto que foi digitado",
              enviado?.seo_titulo === "Título de busca" &&
                enviado?.seo_descricao === "Descrição de busca" &&
                enviado?.seo_imagem_url === null,
              JSON.stringify([
                enviado?.seo_titulo,
                enviado?.seo_descricao,
                enviado?.seo_imagem_url,
              ]),
            );
            await tela.desmontar();
          }

          secao("(r) a Prévia: o cartão como o link aparece, e nada nele decide");

          /* ── A PRIMEIRA CONSUMIDORA DE PRODUÇÃO ──────────────────────────
             `metadadosDoPost` existe desde a Story 3.4 e nunca foi chamada por
             código de produção — as duas stories que a construíram registraram
             isso como risco. O que se prova aqui NÃO é que a herança está certa
             (a seção (h) de `verificar:dados` já prova, executando a função):
             é que o cartão MOSTRA o que ela devolveu, campo a campo, sem
             escolher, completar nem formatar por conta própria. Uma segunda
             opinião numa tela é o que faria a Prévia e o emissor do Épico 4
             divergirem — e o critério pede justamente que produzam o mesmo. */
          {
            const cartaoDe = async (valores, { dominio = DOMINIO } = {}) => {
              const alvo = janela.document.createElement("div");
              janela.document.body.appendChild(alvo);
              const raiz = createRoot(alvo);
              let atuais = valores;
              const heranca = () => seo.herancaDoFormulario(atuais, { dominio });
              const desenhar = () =>
                React.createElement(modulo.CartaoDeCompartilhamento, {
                  heranca: heranca(),
                  categoria: atuais.categoria ?? "",
                  id: "cartao-de-prova",
                });
              await act(async () => {
                raiz.render(desenhar());
              });
              const ler = (papel) => alvo.querySelector(`[data-papel="${papel}"]`);
              return {
                alvo,
                ler,
                texto: (papel) => ler(papel)?.textContent ?? null,
                metadados: () => heranca().metadados ?? null,
                digitar: async (campo, valor) => {
                  atuais = { ...atuais, [campo]: valor };
                  await act(async () => {
                    raiz.render(desenhar());
                  });
                },
                desmontar: async () => {
                  await act(async () => {
                    raiz.unmount();
                  });
                  alvo.remove();
                },
              };
            };

            const BASE = {
              ...regrasDosMetadados.valoresVazios(),
              titulo: TITULO_DO_POST,
              resumo: RESUMO_DO_POST,
            };
            const P = seo.PAPEIS_DO_CARTAO;

            /* ── OS TRÊS PRÓPRIOS, E A IGUALDADE CAMPO A CAMPO ─────────────
               Esta é a asserção que a story existe para ter. Ela não confere
               "aparece um texto": confere que o texto desenhado é IDÊNTICO ao
               que `metadadosDoPost` devolveu, e que o endereço da imagem é o
               mesmo. Qualquer formatação da tela — cortar, completar, escolher
               outro elo — quebra a igualdade. */
            {
              const tela = await cartaoDe({
                ...BASE,
                seo_titulo:
                  "Título próprio de busca, escrito longo o bastante para que qualquer corte o mude",
                seo_descricao:
                  "Descrição própria de busca, também longa o bastante para que cortar em qualquer ponto plausível altere o texto e a igualdade acuse.",
                seo_imagem_url: CAPA_GRAVADA,
                imagem_alt: "Tela do ChatClean",
              });
              const m = tela.metadados();
              afirmar(
                "o cartão mostra os TRÊS efetivos, e cada um é IDÊNTICO ao que o domínio devolveu",
                tela.texto(P.valorDoTitulo) === m.titulo.valor &&
                  tela.texto(P.valorDaDescricao) === m.descricao.valor &&
                  tela.ler(P.imagem)?.getAttribute("src") === m.imagem.endereco,
                JSON.stringify([
                  tela.texto(P.valorDoTitulo),
                  tela.texto(P.valorDaDescricao),
                  tela.ler(P.imagem)?.getAttribute("src"),
                ]),
              );
              /* E NADA É FORMATADO. Sem reticências, sem corte, e sem as
                 classes que cortariam por CSS — o cabeçalho do cartão promete
                 que ele não inventa ponto de corte, e promessa em comentário
                 não falha sozinha. */
              const doTitulo = tela.ler(P.valorDoTitulo);
              const daDescricao = tela.ler(P.valorDaDescricao);
              const classes = `${doTitulo?.className ?? ""} ${daDescricao?.className ?? ""}`;
              afirmar(
                "e o cartão NÃO corta: nem reticências no texto, nem classe que corte por CSS",
                !tela.texto(P.valorDoTitulo).includes("…") &&
                  !tela.texto(P.valorDaDescricao).includes("…") &&
                  !/\btruncate\b|\bline-clamp-/.test(classes),
                classes.trim(),
              );
              /* VALOR PRÓPRIO NÃO PRODUZ FRASE DE HERANÇA — não há herança a
                 contar, e a decisão de quando a frase existe é do domínio. */
              afirmar(
                "com valor próprio não há frase de herança — e é `falaDaHeranca` quem decide isso",
                tela.ler(P.origemDoTitulo) === null &&
                  seo.falaDaHeranca(m.titulo) === null &&
                  tela.ler(P.origemDaDescricao) === null,
                `${m.titulo.origem} | ${m.descricao.origem}`,
              );
              await tela.desmontar();
            }

            /* ── OS TRÊS HERDADOS ─────────────────────────────────────────── */
            {
              const tela = await cartaoDe({
                ...BASE,
                imagem_url: CAPA_GRAVADA,
                imagem_alt: "Tela do ChatClean",
              });
              const m = tela.metadados();
              afirmar(
                "com os campos de SEO vazios o cartão mostra o HERDADO — título do Post, Resumo e Capa",
                tela.texto(P.valorDoTitulo) === TITULO_DO_POST &&
                  tela.texto(P.valorDaDescricao) === RESUMO_DO_POST &&
                  tela.ler(P.imagem)?.getAttribute("src") === CAPA_GRAVADA &&
                  m.titulo.herdado === true &&
                  m.descricao.herdado === true,
                JSON.stringify([m.titulo.origem, m.descricao.origem, m.imagem.origem]),
              );
              /* E O CARTÃO DIZ DE ONDE VEIO, com a MESMA frase que a seção de
                 SEO desenha embaixo do campo — não uma segunda redação. */
              afirmar(
                "e diz de onde veio cada um, com a frase que `falaDaHeranca` produz",
                tela.texto(P.origemDoTitulo) === seo.falaDaHeranca(m.titulo) &&
                  tela.texto(P.origemDaDescricao) === seo.falaDaHeranca(m.descricao) &&
                  tela.texto(P.origemDaImagem) === seo.falaDaHeranca(m.imagem),
                `${tela.texto(P.origemDoTitulo)} | ${tela.texto(P.origemDaImagem)}`,
              );
              await tela.desmontar();
            }

            /* ── SEM IMAGEM NENHUMA: A IMAGEM PADRÃO DO SITE ───────────────
               "que é o que realmente aparecerá" — o critério é explícito, e o
               endereço tem de ser o do ativo, montado pelo domínio. Um cartão
               vazio aqui esconderia do Autor que o link já tem imagem. */
            {
              const tela = await cartaoDe(BASE);
              const m = tela.metadados();
              afirmar(
                "sem capa e sem imagem de SEO o cartão mostra a IMAGEM PADRÃO DO SITE",
                m.imagem.origem === "padrao" &&
                  tela.ler(P.imagem)?.getAttribute("src") ===
                    compartilhamento.enderecoDaImagemPadrao(DOMINIO) &&
                  tela.ler(P.imagem)?.getAttribute("src") === m.imagem.endereco,
                tela.ler(P.imagem)?.getAttribute("src"),
              );
              await tela.desmontar();
            }

            /* ── A PRÉVIA ACOMPANHA O QUE ESTÁ DIGITADO AGORA ──────────────
               Duas direções, e a segunda é a que importa: alterar o TÍTULO DO
               POST com o Título SEO vazio muda o cartão, porque o título é
               herdado. Uma Prévia que só ouvisse os campos de SEO passaria a
               primeira e falharia a segunda — e é a segunda que o Autor vive. */
            {
              const tela = await cartaoDe(BASE);
              await tela.digitar("seo_titulo", "Agora é próprio");
              afirmar(
                "digitar no campo de SEO muda o cartão — origem DIRETA",
                tela.texto(P.valorDoTitulo) === "Agora é próprio" &&
                  tela.texto(P.valorDoTitulo) === tela.metadados().titulo.valor,
                tela.texto(P.valorDoTitulo),
              );
              await tela.digitar("seo_titulo", "");
              await tela.digitar("titulo", "O título do Post mudou");
              afirmar(
                "e mudar o TÍTULO DO POST com o de SEO vazio também muda — origem INDIRETA",
                tela.texto(P.valorDoTitulo) === "O título do Post mudou" &&
                  tela.metadados().titulo.herdado === true,
                tela.texto(P.valorDoTitulo),
              );
              await tela.desmontar();
            }

            /* ── ACIMA DO USUAL: SINALIZA, SEM INVENTAR CORTE ──────────────
               O sinal é sobre o valor EFETIVO, não sobre o digitado: um Resumo
               longo herdado por uma Meta Descrição vazia sai longo do mesmo
               jeito. E o aviso não é recusa — conselho vestido de erro treina a
               pessoa a ignorar o erro que importa. */
            {
              const LONGO = "N".repeat(compartilhamento.COMPRIMENTO_USUAL_DE_SEO.seo_titulo + 40);
              const tela = await cartaoDe({ ...BASE, seo_titulo: LONGO });
              const doTitulo = tela.ler(P.valorDoTitulo);
              afirmar(
                "acima do usual o cartão SINALIZA — e o texto continua inteiro, sem corte inventado",
                doTitulo?.getAttribute("data-acima") === "true" &&
                  tela.texto(P.valorDoTitulo) === LONGO &&
                  tela.texto(P.avisoDoTitulo) === seo.avisoDeComprimento("seo_titulo", LONGO),
                `${doTitulo?.getAttribute("data-acima")} | ${tela.texto(P.valorDoTitulo)?.length}`,
              );
              afirmar(
                "e o aviso NÃO é recusa: sem papel de alerta e sem tinta destrutiva",
                tela.ler(P.avisoDoTitulo)?.getAttribute("role") === null &&
                  !/destructive/.test(tela.ler(P.avisoDoTitulo)?.className ?? ""),
                tela.ler(P.avisoDoTitulo)?.className,
              );
              /* O HERDADO LONGO TAMBÉM SINALIZA — é o caso que uma leitura do
                 campo digitado deixaria passar. */
              const RESUMO_LONGO = "R".repeat(compartilhamento.COMPRIMENTO_USUAL_DE_SEO.seo_descricao + 40);
              const outra = await cartaoDe({ ...BASE, resumo: RESUMO_LONGO });
              afirmar(
                "e o sinal é sobre o EFETIVO: Resumo longo herdado por descrição vazia também sinaliza",
                outra.ler(P.valorDaDescricao)?.getAttribute("data-acima") === "true" &&
                  outra.texto(P.valorDaDescricao) === RESUMO_LONGO,
                outra.ler(P.valorDaDescricao)?.getAttribute("data-acima"),
              );
              await outra.desmontar();
              await tela.desmontar();
            }

            /* ── AUSENTE É DITO, NÃO DESENHADO EM BRANCO ───────────────────
               `valor: null` é a instrução de OMITIR a etiqueta. Uma linha vazia
               no cartão é indistinguível de um valor que não coube. */
            {
              const tela = await cartaoDe({
                ...regrasDosMetadados.valoresVazios(),
                titulo: TITULO_DO_POST,
              });
              afirmar(
                "sem Resumo e sem descrição de SEO a ausência é DITA, e o valor não é desenhado",
                tela.metadados().descricao.valor === null &&
                  tela.ler(P.valorDaDescricao) === null &&
                  tela.texto(P.ausenciaDaDescricao) === seo.falaDaAusenciaNoCartao("seo_descricao"),
                tela.texto(P.ausenciaDaDescricao),
              );
              await tela.desmontar();
            }

            /* ── POR QUE UM ELO NÃO FOI USADO ──────────────────────────────
               Sem esta lista o Autor veria a imagem padrão e não teria como
               saber por que o endereço que ele digitou sumiu. O motivo é a
               frase que o DOMÍNIO nomeou. */
            {
              const tela = await cartaoDe({
                ...BASE,
                seo_imagem_url: "https://cdn.exemplo.com/imagem.svg",
              });
              const recusas = seo.recusasDoCartao(tela.metadados());
              const desenhadas = [...tela.alvo.querySelectorAll("[data-recusa]")];
              afirmar(
                "a recusa da cadeia aparece no cartão, com o motivo que o domínio nomeou",
                recusas.length >= 1 &&
                  desenhadas.length === recusas.length &&
                  desenhadas[0].getAttribute("data-recusa") === recusas[0].campo &&
                  desenhadas[0].textContent.includes(recusas[0].motivo),
                JSON.stringify(recusas.map((r) => r.campo)),
              );
              afirmar(
                "e o elo seguinte foi usado — a recusa explica a queda, não a esconde",
                tela.metadados().imagem.origem !== "compartilhamento" &&
                  tela.ler(P.imagem) !== null,
                tela.metadados().imagem.origem,
              );
              await tela.desmontar();
            }

            /* ── A IMAGEM QUE NÃO CARREGA ──────────────────────────────────
               Mesma degradação das outras três telas: monograma no lugar, e
               frase dizendo o que houve. Um cartão com ícone quebrado seria a
               quarta opinião sobre a mesma pergunta. */
            {
              const tela = await cartaoDe({
                ...BASE,
                categoria: "Tecnologia",
                seo_imagem_url: "https://cdn.exemplo.com/sumiu.png",
              });
              await act(async () => {
                tela.ler(P.imagem).dispatchEvent(new janela.Event("error"));
              });
              afirmar(
                "imagem que não carrega degrada para o monograma, e o cartão DIZ o que houve",
                tela.ler(P.imagem) === null &&
                  tela.ler(P.imagemDegradada) !== null &&
                  tela.ler(P.imagemQuebrada) !== null,
                tela.texto(P.imagemQuebrada),
              );
              /* O BENEFÍCIO DA DÚVIDA VOLTA a cada endereço: uma falha antiga
                 não pode condenar a imagem seguinte. */
              await tela.digitar("seo_imagem_url", "https://cdn.exemplo.com/outra.png");
              afirmar(
                "e trocar o endereço devolve o benefício da dúvida — a nova é tentada",
                tela.ler(P.imagem)?.getAttribute("src") === "https://cdn.exemplo.com/outra.png" &&
                  tela.ler(P.imagemQuebrada) === null,
                tela.ler(P.imagem)?.getAttribute("src"),
              );
              await tela.desmontar();
            }

            /* ── DEFEITO DE MONTAGEM: DITO, E NUNCA CARTÃO EM BRANCO ───────
               Duas causas distintas, duas frases distintas. Um `catch` que
               responde por dois fatos manda procurar o defeito no lugar errado
               — foi o que a revisão da Story 3.4 encontrou. */
            {
              const alvo = janela.document.createElement("div");
              janela.document.body.appendChild(alvo);
              const raiz = createRoot(alvo);
              await act(async () => {
                raiz.render(React.createElement(modulo.CartaoDeCompartilhamento, {}));
              });
              afirmar(
                "sem herança nenhuma o cartão DIZ o defeito — e a moldura não é desenhada",
                alvo.querySelector(`[data-papel="${P.defeito}"]`)?.textContent ===
                  seo.DEFEITO_SEM_HERANCA &&
                  alvo.querySelector(`[data-papel="${P.moldura}"]`) === null,
                alvo.querySelector(`[data-papel="${P.defeito}"]`)?.textContent,
              );
              const semDominio = seo.herancaDoFormulario(BASE, { dominio: "" });
              await act(async () => {
                raiz.render(
                  React.createElement(modulo.CartaoDeCompartilhamento, { heranca: semDominio }),
                );
              });
              afirmar(
                "e sem o Domínio Canônico a frase é a do DOMÍNIO, distinta da anterior",
                semDominio.ok === false &&
                  alvo.querySelector(`[data-papel="${P.defeito}"]`)?.textContent ===
                    semDominio.defeito &&
                  semDominio.defeito !== seo.DEFEITO_SEM_HERANCA &&
                  alvo.querySelector(`[data-papel="${P.moldura}"]`) === null,
                semDominio.defeito,
              );
              await act(async () => {
                raiz.unmount();
              });
              alvo.remove();
            }

            /* ── O CARTÃO NÃO ESCOLHE NADA ────────────────────────────────
               A varredura de `verificar:interface` procura queda escrita à mão
               em `src/`; esta é a metade executada: o módulo do cartão não
               importa o domínio da herança, então não teria como decidir mesmo
               que quisesse. Ele recebe a decisão pronta. */
            {
              const fonte = ler(CAMINHO_CARTAO);
              /* O nome da função aparece três vezes na PROSA do componente,
                 explicando de onde vem o que ele desenha — e prosa não chama
                 função. O que se procura é a FORMA DE CHAMADA, que a prosa não
                 tem: ela escreve o nome entre crases, nunca seguido de parêntese.
                 `termosPresentes` seria o detector natural, e não serve aqui:
                 `mascararComentariosJs` dessincroniza em JSX — medido neste
                 arquivo, onde ela mascara as duas primeiras menções e deixa a
                 terceira passar. Está registrado como achado próprio. */
              const chamaADecisao = /metadadosDoPost\s*\(/.test(fonte);
              /* O que ele PODE trazer do domínio é VOCABULÁRIO — a lista fechada
                 de quais campos de texto existem, para iterar em vez de fixar dois.
                 O que ele NÃO pode é a função que DECIDE: importá-la seria poder
                 tomar a decisão, e a primeira consumidora de produção é justamente
                 onde a segunda opinião nasceria. Lista de PERMISSÃO, e não de
                 proibição: um símbolo novo do domínio cai aqui e precisa ser
                 julgado, em vez de entrar por não estar numa lista de proibidos. */
              const PERMITIDO_DO_DOMINIO = ["CAMPOS_DE_TEXTO_DE_SEO"];
              const DA_HERANCA =
                /import\s*\{([^}]*)\}\s*from\s*["'][^"']*domain\/blog\/compartilhamento["']/;
              const trazidosDe = (texto) => {
                const bloco = texto.match(DA_HERANCA);
                return bloco === null
                  ? []
                  : bloco[1]
                      .split(",")
                      .map((s) => s.trim())
                      .filter((s) => s !== "");
              };
              const foraDaLista = trazidosDe(fonte).filter(
                (s) => !PERMITIDO_DO_DOMINIO.includes(s),
              );
              afirmar(
                "o cartão traz do domínio só VOCABULÁRIO, e nunca a função que decide a herança",
                foraDaLista.length === 0 && chamaADecisao === false,
                `trazidos: ${trazidosDe(fonte).join(", ") || "nenhum"}`,
              );
              /* AUTOTESTE: a lista precisa ACUSAR o símbolo que ela existe para
                 barrar. Sem isto ela passaria verde num arquivo que não importa
                 nada do domínio — que é a vacuidade de sempre. */
              const plantado = fonte.replace(
                "{ CAMPOS_DE_TEXTO_DE_SEO }",
                "{ CAMPOS_DE_TEXTO_DE_SEO, metadadosDoPost }",
              );
              const acusados = trazidosDe(plantado).filter(
                (s) => !PERMITIDO_DO_DOMINIO.includes(s),
              );
              afirmar(
                "autoteste: a lista ACUSA a função de decisão trazida junto do vocabulário",
                acusados.includes("metadadosDoPost") && plantado !== fonte,
                acusados.join(", ") || "nao acusou",
              );
            }
          }

        }
        }
      }
    }

    delete janela.addEventListener;
    delete janela.removeEventListener;
    fingirLargura(larguraOriginal);
  }
}

if (compilado) {
  // Melhor esforço: no Windows o pacote importado pode ficar preso pelo
  // processo que o carregou. O que GARANTE a limpeza é a varredura na entrada
  // da próxima execução, não esta linha.
  try {
    rmSync(compilado.pasta, { recursive: true, force: true });
  } catch {
    /* fica para a próxima execução varrer */
  }
}

secao("(i) a busca da listagem: digitar, esperar o debounce, a lista responder");
{
  /* Bugfix "Correções de UI/UX na Listagem de Posts do Painel Admin", item 4:
     a investigação estática não achou defeito na consulta, na normalização,
     no debounce nem na fiação de props — a spec pedia reprodução AO VIVO antes
     de fixar a causa. Reproduzida (com o servidor de dev, contra o Supabase de
     produção) a busca respondeu certo; o que parecia quebrado era o esqueleto
     piscando por cima da lista a cada tecla (item 2) e o filtro de Estado em
     multi-seleção (item 3) — os dois já corrigidos acima. Esta seção prova o
     COMPORTAMENTO fim a fim (digitar, esperar `ESPERA_DA_BUSCA_MS`, a lista
     responder; termo sem correspondência cai no vazio de busca com "limpar
     busca"), com a tela real e um dublê de dados — não mais um script solto
     que só imprimia o que viu. */
  const pastaBusca = criarPastaDeCompilacao("verificar-editor-busca-");
  const arquivoDosPostsBusca = `${pastaBusca}/dublê-posts.js`;
  writeFileSync(
    arquivoDosPostsBusca,
    `
export const controle = { pedidos: [] };
const POSTS = [
  { id: "1", slug: "a", titulo: "5 Estratégias para Atendimento", autor_nome: "Fulano", categoria: null, imagem_url: null, destaque: false, tempo_leitura: 0, estado: "publicado", publicado_em: "2027-01-01T00:00:00Z", atualizado_em: "2027-01-01T00:00:00Z" },
  { id: "2", slug: "b", titulo: "Guia de Automação", autor_nome: "Ciclano", categoria: null, imagem_url: null, destaque: false, tempo_leitura: 0, estado: "publicado", publicado_em: "2027-01-02T00:00:00Z", atualizado_em: "2027-01-02T00:00:00Z" },
  { id: "3", slug: "c", titulo: "Rascunho de Novidades", autor_nome: "Beltrano", categoria: null, imagem_url: null, destaque: false, tempo_leitura: 0, estado: "rascunho", publicado_em: null, atualizado_em: "2027-01-03T00:00:00Z" },
];
export async function listarPostsDoPainel(pedido) {
  controle.pedidos.push(pedido ?? null);
  const termo = (pedido?.termo ?? "").trim().toLowerCase();
  const estados = Array.isArray(pedido?.estados) ? pedido.estados : [];
  let dados = termo === "" ? POSTS : POSTS.filter((p) => p.titulo.toLowerCase().includes(termo));
  if (estados.length > 0) dados = dados.filter((p) => estados.includes(p.estado));
  return { ok: true, dados };
}
export function ordenarListagem(posts) { return posts; }
`,
  );
  const arquivoDaEscritaBusca = `${pastaBusca}/dublê-escrita.js`;
  writeFileSync(
    arquivoDaEscritaBusca,
    `
export async function definirDestaque() { return { ok: true, dados: {} }; }
export async function excluirPost() { return { ok: true, dados: {} }; }
`,
  );
  const arquivoDoEditorBusca = `${pastaBusca}/dublê-editor.jsx`;
  writeFileSync(
    arquivoDoEditorBusca,
    `export default function EditorDePostDublê() { return null; }\n`,
  );

  const fonteBusca =
    `export { default as AdminBlog } from ${caminhoDeModulo("src/pages/AdminBlog.jsx")};\n` +
    `export { default as SessaoProvider } from ${caminhoDeModulo("src/admin/shell/SessaoProvider.jsx")};\n` +
    `export { controle } from ${comoModulo(arquivoDosPostsBusca)};\n` +
    /* A ESPERA VEM DO MÓDULO DE VERDADE, e não é um número escrito à mão aqui.
       Um segundo número contando a mesma coisa diverge no dia em que
       `ESPERA_DA_BUSCA_MS` mudar, e a asserção passaria a provar um tempo que
       não é mais o real — é o mesmo motivo que já vale para as seções (f) e
       (h) mais acima neste arquivo. */
    `export { ESPERA_DA_BUSCA_MS } from ${caminhoDeModulo(CAMINHO_LISTA)};\n`;

  const { arquivo: arquivoCompiladoBusca } = await compilarParaNode({
    pasta: pastaBusca,
    fonte: fonteBusca,
    alias: {
      "@/data/blog/posts": arquivoDosPostsBusca,
      "@/data/blog/escrita": arquivoDaEscritaBusca,
      "@/admin/blog/EditorDePost": arquivoDoEditorBusca,
    },
  });

  try {
    const janelaBusca = montarNavegador({ url: "https://painel.local/admin" });
    const moduloBusca = await import(pathToFileURL(arquivoCompiladoBusca).href);
    const ReactBusca = (await import("react")).default;
    const { createRoot: criarRaizBusca } = await import("react-dom/client");
    const { act: atoBusca } = await import("react");
    const { MemoryRouter: RoteadorDeMemoriaBusca } = await import("react-router-dom");
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      value: true,
      configurable: true,
      writable: true,
    });

    const alvoBusca = janelaBusca.document.createElement("div");
    janelaBusca.document.body.appendChild(alvoBusca);
    const raizBusca = criarRaizBusca(alvoBusca);

    const digitar = async (texto) => {
      const campo = alvoBusca.querySelector('input[data-busca="posts"]');
      const setter = Object.getOwnPropertyDescriptor(
        janelaBusca.HTMLInputElement.prototype,
        "value",
      ).set;
      await atoBusca(async () => {
        setter.call(campo, texto);
        campo.dispatchEvent(new janelaBusca.Event("input", { bubbles: true }));
      });
    };

    await atoBusca(async () => {
      raizBusca.render(
        ReactBusca.createElement(
          RoteadorDeMemoriaBusca,
          { initialEntries: ["/admin"] },
          ReactBusca.createElement(
            moduloBusca.SessaoProvider,
            null,
            ReactBusca.createElement(moduloBusca.AdminBlog),
          ),
        ),
      );
    });
    await atoBusca(async () => {
      await new Promise((resolver) => setTimeout(resolver, 50));
    });

    afirmar(
      "o campo de busca da listagem existe no DOM",
      alvoBusca.querySelector('input[data-busca="posts"]') !== null,
    );

    const pedidosAntesDeDigitar = moduloBusca.controle.pedidos.length;
    await digitar("atendimento");
    afirmar(
      "digitar não dispara pedido novo antes do debounce — uma consulta por tecla castigaria o banco",
      moduloBusca.controle.pedidos.length === pedidosAntesDeDigitar,
      `pedidos antes: ${pedidosAntesDeDigitar}, logo após digitar: ${moduloBusca.controle.pedidos.length}`,
    );

    await atoBusca(async () => {
      await new Promise((resolver) =>
        setTimeout(resolver, moduloBusca.ESPERA_DA_BUSCA_MS + 150),
      );
    });
    const ultimoPedidoBusca = moduloBusca.controle.pedidos.at(-1);
    afirmar(
      "passado o debounce, o pedido à camada de dados carrega o termo digitado",
      ultimoPedidoBusca?.termo === "atendimento",
      JSON.stringify(ultimoPedidoBusca),
    );
    afirmar(
      "o Post cujo termo só existe no título aparece na lista, e o que não bate some",
      alvoBusca.querySelector('[data-abrir="1"]') !== null &&
        alvoBusca.querySelector('[data-abrir="2"]') === null,
      alvoBusca.querySelector("[data-estado-da-lista]")?.getAttribute("data-estado-da-lista"),
    );

    /* ── Termo sem correspondência: o vazio DE BUSCA, não o inicial nem erro. */
    await digitar("termo-sem-post-nenhum");
    await atoBusca(async () => {
      await new Promise((resolver) =>
        setTimeout(resolver, moduloBusca.ESPERA_DA_BUSCA_MS + 150),
      );
    });
    const regiaoBusca = alvoBusca.querySelector("[data-estado-da-lista]");
    afirmar(
      "termo sem post nenhum cai no vazio DE BUSCA — distinto do vazio inicial e do erro",
      regiaoBusca?.getAttribute("data-estado-da-lista") === "vazio-de-busca",
      `estado: ${regiaoBusca?.getAttribute("data-estado-da-lista")}`,
    );

    const botaoLimparBusca = [...alvoBusca.querySelectorAll("button")].find((b) =>
      /limpar/i.test(b.textContent ?? ""),
    );
    afirmar("o vazio de busca oferece 'limpar busca'", Boolean(botaoLimparBusca));
    if (botaoLimparBusca) {
      await atoBusca(async () => {
        botaoLimparBusca.dispatchEvent(new janelaBusca.MouseEvent("click", { bubbles: true }));
      });
      afirmar(
        "clicar em 'limpar busca' esvazia o campo",
        alvoBusca.querySelector('input[data-busca="posts"]')?.value === "",
        alvoBusca.querySelector('input[data-busca="posts"]')?.value,
      );
      /* E A LISTA VOLTA A MOSTRAR OS DOIS — não basta o campo ficar vazio: o
         critério é "limpar busca" trazer de volta o que a busca escondeu. Sem
         esta metade, um botão que só limpasse o TEXTO sem refazer o pedido
         passaria na asserção de cima e deixaria a lista presa no resultado
         vazio. */
      await atoBusca(async () => {
        await new Promise((resolver) =>
          setTimeout(resolver, moduloBusca.ESPERA_DA_BUSCA_MS + 150),
        );
      });
      afirmar(
        "e a lista volta a mostrar os dois Posts — limpar busca não é só esvaziar o campo, é refazer o pedido",
        alvoBusca.querySelector('[data-estado-da-lista]')?.getAttribute("data-estado-da-lista") ===
          "lista" &&
          alvoBusca.querySelector('[data-abrir="1"]') !== null &&
          alvoBusca.querySelector('[data-abrir="2"]') !== null,
        alvoBusca.querySelector('[data-estado-da-lista]')?.getAttribute("data-estado-da-lista"),
      );
    }

    /* ── Fix item 3: o filtro de Estado é EXCLUSIVO, na tela real ────────
       A função pura já está coberta acima; aqui é a FIAÇÃO do clique —
       `AdminBlog` monta o botão certo, `aria-pressed` reflete a marcação e
       a lista É REFEITA pela camada com os Estados aplicados. Sem este
       teste, um botão que chamasse a função errada (ou não chamasse
       nenhuma) passaria pela suíte inteira. */
    const botaoDoEstado = (estado) =>
      alvoBusca.querySelector(`[data-filtro-de-estado="${estado}"]`);

    await atoBusca(async () => {
      await new Promise((resolver) =>
        setTimeout(resolver, moduloBusca.ESPERA_DA_BUSCA_MS + 150),
      );
    });
    afirmar(
      "os quatro botões de Estado existem, um por palavra do vocabulário fechado",
      ["rascunho", "agendado", "publicado", "arquivado"].every(
        (estado) => botaoDoEstado(estado) !== null,
      ),
    );
    afirmar(
      "nenhum começa marcado — sem filtro é o estado inicial",
      ["rascunho", "agendado", "publicado", "arquivado"].every(
        (estado) => botaoDoEstado(estado)?.getAttribute("aria-pressed") === "false",
      ),
    );

    await atoBusca(async () => {
      botaoDoEstado("publicado").dispatchEvent(
        new janelaBusca.MouseEvent("click", { bubbles: true }),
      );
    });
    afirmar(
      "clicar em 'publicado' marca ELE, com aria-pressed, e não só pela cor",
      botaoDoEstado("publicado")?.getAttribute("aria-pressed") === "true",
    );

    await atoBusca(async () => {
      await new Promise((resolver) =>
        setTimeout(resolver, moduloBusca.ESPERA_DA_BUSCA_MS + 150),
      );
    });
    afirmar(
      "e a lista é REFEITA pela camada com o Estado marcado — some o rascunho, ficam os publicados",
      moduloBusca.controle.pedidos.at(-1)?.estados?.includes("publicado") &&
        alvoBusca.querySelector('[data-abrir="1"]') !== null &&
        alvoBusca.querySelector('[data-abrir="2"]') !== null &&
        alvoBusca.querySelector('[data-abrir="3"]') === null,
      JSON.stringify(moduloBusca.controle.pedidos.at(-1)),
    );

    await atoBusca(async () => {
      botaoDoEstado("rascunho").dispatchEvent(
        new janelaBusca.MouseEvent("click", { bubbles: true }),
      );
    });
    afirmar(
      "clicar num Estado DIFERENTE substitui a marcação — 'publicado' desmarca, 'rascunho' marca",
      botaoDoEstado("publicado")?.getAttribute("aria-pressed") === "false" &&
        botaoDoEstado("rascunho")?.getAttribute("aria-pressed") === "true",
      `publicado: ${botaoDoEstado("publicado")?.getAttribute("aria-pressed")} | rascunho: ${botaoDoEstado("rascunho")?.getAttribute("aria-pressed")}`,
    );

    await atoBusca(async () => {
      await new Promise((resolver) =>
        setTimeout(resolver, moduloBusca.ESPERA_DA_BUSCA_MS + 150),
      );
    });
    afirmar(
      "e a lista troca para o novo Estado — nunca SOMA os dois filtros",
      moduloBusca.controle.pedidos.at(-1)?.estados?.length === 1 &&
        moduloBusca.controle.pedidos.at(-1)?.estados?.includes("rascunho") &&
        alvoBusca.querySelector('[data-abrir="3"]') !== null &&
        alvoBusca.querySelector('[data-abrir="1"]') === null,
      JSON.stringify(moduloBusca.controle.pedidos.at(-1)),
    );

    await atoBusca(async () => {
      botaoDoEstado("rascunho").dispatchEvent(
        new janelaBusca.MouseEvent("click", { bubbles: true }),
      );
    });
    afirmar(
      "clicar de novo no Estado JÁ marcado desmarca — não fica preso num filtro",
      botaoDoEstado("rascunho")?.getAttribute("aria-pressed") === "false",
    );

    await atoBusca(async () => raizBusca.unmount());
    alvoBusca.remove();
  } finally {
    try {
      rmSync(pastaBusca, { recursive: true, force: true });
    } catch {
      /* fica para a próxima execução varrer */
    }
  }
}

/* ─── Veredito ───────────────────────────────────────────────────────────── */

console.log("");
if (falhas === 0) {
  console.log("Editor visual verificado: todas as asserções passaram.");
  process.exitCode = 0;
} else {
  console.log(`Editor visual NÃO verificado: ${falhas} asserção(ões) falharam.`);
  process.exitCode = 1;
}
