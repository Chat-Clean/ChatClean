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
 * Os dez elementos que a story nomeia, na ordem em que ela os nomeia.
 * Escritos AQUI, à mão, de propósito: se a lista viesse do próprio schema, a
 * asserção diria apenas "o schema é igual a si mesmo".
 */
const DEZ_ELEMENTOS = [
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
    "`ELEMENTOS` tem exatamente dez entradas",
    Array.isArray(schema.ELEMENTOS) && schema.ELEMENTOS.length === 10,
    `encontrado: ${schema.ELEMENTOS?.length}`,
  );

  afirmar(
    "`ELEMENTOS` está congelado (a lista fechada não é editável em tempo de execução)",
    Object.isFrozen(schema.ELEMENTOS) &&
      schema.ELEMENTOS.every((elemento) => Object.isFrozen(elemento)),
  );

  afirmar(
    "os dez elementos são os que a story nomeia, na ordem declarada",
    igual(
      schema.ELEMENTOS.map((e) => e.chave),
      DEZ_ELEMENTOS.map((e) => e.chave),
    ),
    schema.ELEMENTOS.map((e) => e.chave).join(", "),
  );

  for (const esperado of DEZ_ELEMENTOS) {
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
    "imagem inline e tabela não existem no vocabulário de nós",
    !schema.NOS_PERMITIDOS.some((n) =>
      ["image", "img", "table", "tableRow", "tableCell", "iframe"].includes(n),
    ),
    schema.NOS_PERMITIDOS.join(", "),
  );

  afirmar(
    "as marcas permitidas são apenas negrito, itálico e link",
    igual([...schema.MARCAS_PERMITIDAS].sort(), ["bold", "italic", "link"]),
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
     — e a igualdade de chaves, logo abaixo, é o que a torna segura. */
  const termos = [
    ...schema.ELEMENTOS.map((e) => e.chave),
    ...schema.ELEMENTOS.map((e) => e.comando),
    ...schema.ELEMENTOS.map((e) => e.rotulo),
  ];
  for (const arquivo of [CAMINHO_BARRA, CAMINHO_EDITOR]) {
    const fonte = tentar(`${arquivo} legível`, () => ler(arquivo), "");
    const achados = termosPresentes(fonte, termos);
    afirmar(
      `${arquivo} não escreve nenhum elemento do schema à mão`,
      achados.length === 0,
      `encontrados: ${achados.join(", ")}`,
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
    // Nó fora do schema: `table`, `image` e `h1`. O que está fora cai; o resto
    // do documento sobrevive inteiro.
    const sujo = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "TITULO H1" }] },
        { type: "paragraph", content: [{ type: "text", text: "sobrevivente um" }] },
        { type: "table", content: [{ type: "tableRow", content: [] }] },
        { type: "image", attrs: { src: "x.png" } },
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
        !tipos.has("image") &&
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
        resultado.descartados.some((d) => d.especie === "no" && d.nome === "image") &&
        resultado.descartados.some((d) => d.especie === "no" && d.nome.startsWith("heading")),
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
      "}\n",
  );

  const arquivoDaTaxonomia = path.join(pasta, "duble-taxonomia.js");
  writeFileSync(
    arquivoDaTaxonomia,
    `export * from ${caminhoDeModulo(CAMINHO_TAXONOMIA)};\n` +
      'import { controle } from "./controle.js";\n' +
      "export async function listarCategorias() {\n" +
      "  return controle.categorias;\n" +
      "}\n" +
      "export async function listarTags() {\n" +
      "  return controle.tags;\n" +
      "}\n" +
      "export async function listarTagsDoPostNoPainel() {\n" +
      "  return controle.tagsDoPost;\n" +
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
    "tabela, imagem, tachado, sublinhado e código embutido não existem no editor",
    !["table", "image", "strike", "underline", "code"].some(
      (nome) => nosDoEditor.includes(nome) || marcasDoEditor.includes(nome),
    ),
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

    afirmar(
      `\`${controle.chave}\` aplica de verdade: o documento muda e o texto sobrevive`,
      resultado.aplicou === true &&
        resultado.mudou === true &&
        resultado.texto.includes(TEXTO_DE_PROVA),
      JSON.stringify(resultado).slice(0, 260),
    );

    afirmar(
      `\`${controle.chave}\` produz o \`${controle.nome}\` que declarou`,
      controle.especie === schema.MARCA
        ? resultado.marcas.includes(controle.nome)
        : resultado.tipos.includes(controle.nome),
      JSON.stringify({ tipos: resultado.tipos, marcas: resultado.marcas }),
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
    '<img src="foto.png" alt="foto">',
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
      "colagem: tabela e imagem descartadas",
      !tipos.has("table") &&
        !tipos.has("tableRow") &&
        !tipos.has("tableCell") &&
        !tipos.has("image"),
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

  return {
    alvo,
    reclamacoes,
    botoes,
    porRotulo,
    areaDeEscrita: () => alvo.querySelector('[role="textbox"]'),
    campo: () => alvo.querySelector("form input[type='text']"),
    formulario: () => alvo.querySelector("form"),
    alerta: () => alvo.querySelector("form [role='alert']"),
    avisoDoConteudo: () => alvo.querySelector("[data-gravidade]"),
    async clicar(elemento) {
      await act(async () => {
        elemento.dispatchEvent(new janela.MouseEvent("click", { bubbles: true }));
      });
    },
    async digitar(entrada, texto) {
      // O ajuste de valor precisa passar pelo `setter` nativo: o React guarda
      // o último valor no próprio nó e ignoraria um evento cujo valor ele
      // acredita já ter visto.
      const setter = Object.getOwnPropertyDescriptor(
        janela.HTMLInputElement.prototype,
        "value",
      ).set;
      await act(async () => {
        setter.call(entrada, texto);
        entrada.dispatchEvent(new janela.Event("input", { bubbles: true }));
      });
    },
    async submeter(form) {
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
      afirmar(
        "a barra desenha um botão por elemento do schema, com o rótulo de cada um",
        igual(
          botoes.map((b) => b.getAttribute("aria-label")),
          schema.ELEMENTOS.map((e) => e.rotulo),
        ),
        botoes.map((b) => b.getAttribute("aria-label")).join(" | "),
      );

      /* O ESTADO LIDO POR VALOR. A versão anterior contava `hasAttribute`, que
         é verdadeiro tanto para "true" quanto para "false" — congelar a barra
         depois do primeiro quadro deixava tudo verde. */
      afirmar(
        "quem alterna anuncia `aria-pressed=\"false\"` no início, e quem só insere não tem o atributo",
        botoes.every((botao, i) => {
          const valor = botao.getAttribute("aria-pressed");
          return controles[i].alterna ? valor === "false" : valor === null;
        }),
        botoes.map((b) => `${b.getAttribute("aria-label")}=${b.getAttribute("aria-pressed")}`).join(" | "),
      );

      afirmar(
        "`aria-keyshortcuts` traz a notação canônica, e só em quem tem atalho",
        botoes.every(
          (botao, i) =>
            (botao.getAttribute("aria-keyshortcuts") ?? null) === controles[i].atalhoCanonico,
        ) &&
          botoes.some((b) => /^Control\+/.test(b.getAttribute("aria-keyshortcuts") ?? "")) &&
          botoes.every((b) => !/[⌘⌥⇧]|Ctrl/.test(b.getAttribute("aria-keyshortcuts") ?? "")),
        botoes.map((b) => b.getAttribute("aria-keyshortcuts")).join(" | "),
      );

      /* `role="toolbar"` obriga a UMA parada de Tab, com as setas movendo
         dentro. Dez paradas de Tab entre o Autor e o texto é o defeito que o
         papel declarado sem o padrão de teclado produz. */
      afirmar(
        "a barra é UMA parada de Tab: exatamente um controle com `tabindex=0`",
        botoes.filter((b) => b.getAttribute("tabindex") === "0").length === 1 &&
          botoes.filter((b) => b.getAttribute("tabindex") === "-1").length === botoes.length - 1,
        botoes.map((b) => b.getAttribute("tabindex")).join(","),
      );
      afirmar(
        "com tudo disponível, nenhum controle se anuncia indisponível",
        botoes.every((b) => b.getAttribute("aria-disabled") === null),
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

      // Seleciona o texto do parágrafo, no DOM, como o Autor faria.
      const selecionarTudo = async () => {
        await act(async () => {
          areaDeEscrita.dispatchEvent(
            new janela.KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true }),
          );
        });
      };
      await selecionarTudo();

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

      /* ── O campo genérico: aplica, recusa, e explica a recusa ───────── */
      const link = tela.porRotulo("Link");
      afirmar(
        "o controle que pede um dado anuncia que abre algo (`aria-expanded`)",
        link.getAttribute("aria-expanded") === "false",
        String(link.getAttribute("aria-expanded")),
      );
      await tela.clicar(link);
      afirmar(
        "clicar nele abre o campo, e o controle passa a se anunciar expandido",
        tela.campo() !== null && tela.porRotulo("Link").getAttribute("aria-expanded") === "true",
        String(tela.porRotulo("Link").getAttribute("aria-expanded")),
      );
      afirmar(
        "o campo é rotulado pelo texto que o SCHEMA declara, e o rótulo aponta para ele",
        (() => {
          const campo = tela.campo();
          const rotulo = tela.alvo.querySelector(`label[for="${campo?.id}"]`);
          return (
            campo?.id &&
            rotulo?.textContent === controleDeLink.pede.rotulo &&
            campo.getAttribute("placeholder") === controleDeLink.pede.exemplo
          );
        })(),
        `${tela.campo()?.id}`,
      );

      /* Digitar não pode refocar o campo a cada tecla: o efeito depende só da
         ABERTURA. Espionar `focus` é o jeito de observar isso — o sintoma (o
         cursor voltando para o fim) não existe no jsdom, mas a causa sim. */
      {
        const campo = tela.campo();
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
      await tela.digitar(tela.campo(), "https://chatclean.com.br/blog");
      await tela.submeter(tela.formulario());
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
        "aplicado com sucesso, o campo fecha e o foco volta para o controle que o abriu",
        tela.campo() === null &&
          janela.document.activeElement === tela.porRotulo("Link"),
        String(janela.document.activeElement?.getAttribute?.("aria-label")),
      );

      // Agora a recusa por FORMATO, com a frase que o schema declara.
      await tela.clicar(tela.porRotulo("Link"));
      const antesDaRecusa = recebidos.length;
      await tela.digitar(tela.campo(), "javascript:alert(1)");
      await tela.submeter(tela.formulario());
      afirmar(
        "endereço executável não é aplicado e o campo continua aberto",
        recebidos.length === antesDaRecusa && tela.campo() !== null,
        `${antesDaRecusa} → ${recebidos.length}`,
      );
      afirmar(
        "e a recusa é MOSTRADA, com a frase que vem do schema — não de uma string do componente",
        tela.alerta()?.textContent ===
          controleDeLink.pede.recusaDeFormato("javascript:alert(1)"),
        JSON.stringify(tela.alerta()?.textContent ?? null),
      );
      afirmar(
        "a mensagem de recusa está ligada ao campo por `aria-describedby`",
        tela.campo()?.getAttribute("aria-describedby") === tela.alerta()?.id &&
          tela.campo()?.getAttribute("aria-invalid") === "true",
      );
      afirmar(
        "a frase da recusa não está escrita à mão no componente genérico",
        !mascararComentariosJs(ler(CAMINHO_BARRA)).includes("https://"),
      );

      afirmar(
        "o React não reclamou de nada durante toda a interação",
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
       rodada. */
    {
      const recebidos = [];
      const tela = await montar({
        documento: {
          type: "doc",
          content: [{ type: "codeBlock", content: [{ type: "text", text: "npm run verificar" }] }],
        },
        aoMudar: (doc) => recebidos.push(doc),
      });

      const link = tela.porRotulo("Link");
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
      const antes = recebidos.length;
      await tela.clicar(link);
      afirmar(
        "clicar num controle indisponível não abre o campo nem mexe no documento",
        tela.campo() === null && recebidos.length === antes,
        `${antes} → ${recebidos.length}`,
      );

      // E um controle que CABE num bloco de código continua disponível: a
      // indisponibilidade é por contexto, não uma barra desligada inteira.
      afirmar(
        "no mesmo lugar, um controle que cabe continua disponível",
        tela.porRotulo("Título 2")?.getAttribute("aria-disabled") === null,
      );
      await tela.desmontar();
    }

    /* ── Dois editores na mesma página não colidem ─────────────────────── */
    {
      const um = await montar({ documento: documentoLimpo() });
      const dois = await montar({ documento: documentoLimpo() });
      await um.clicar(um.porRotulo("Link"));
      await dois.clicar(dois.porRotulo("Link"));
      const campoUm = um.campo();
      const campoDois = dois.campo();
      afirmar(
        "dois editores na mesma página têm identificadores próprios, e cada rótulo aponta para o seu campo",
        campoUm?.id &&
          campoDois?.id &&
          campoUm.id !== campoDois.id &&
          um.alvo.querySelector(`label[for="${campoUm.id}"]`) !== null &&
          dois.alvo.querySelector(`label[for="${campoDois.id}"]`) !== null &&
          um.alvo.querySelector(`label[for="${campoDois.id}"]`) === null,
        `${campoUm?.id} vs ${campoDois?.id}`,
      );
      await um.desmontar();
      await dois.desmontar();
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
        campo: (nome) => alvo.querySelector(`[data-campo="${nome}"]`),
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
        const publicadoEm = new Date(Date.now() - 60_000).toISOString();
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
        /* A data que o SERVIDOR gravou volta para o campo. Sem isto, a gaveta
           continuaria mostrando o vazio de antes de publicar — e, no caso de um
           Post no ar, mostraria a data que o Autor digitou e o servidor
           deliberadamente NÃO gravou. */
        afirmar(
          "a data de publicação na gaveta passa a ser a que o servidor gravou",
          (tela.campo("publicado_em")?.value ?? "") !== "",
          `campo: ${tela.campo("publicado_em")?.value}`,
        );
        await tela.desmontar();
      }

      /* ── AGENDAR SEM DATA É RECUSADO ANTES DE VIAJAR ────────────────── */
      {
        modulo.controle.post = postNoEstado("rascunho", null);
        modulo.controle.pedidos.length = 0;
        const tela = await montarTela({ postId: ID_DO_CICLO });
        const historicoAntes = toast.getHistory().length;
        await tela.clicar(tela.acaoPorChave("agendar"));
        afirmar(
          "agendar sem data NÃO chega a viajar: nenhum pedido é enviado",
          modulo.controle.pedidos.length === 0,
          `pedidos: ${modulo.controle.pedidos.length}`,
        );
        afirmar(
          "e o campo de data é MARCADO na gaveta, em vez de uma frase solta no rodapé",
          tela.campo("publicado_em")?.getAttribute("aria-invalid") === "true",
          `aria-invalid: ${tela.campo("publicado_em")?.getAttribute("aria-invalid")}`,
        );
        {
          const novos = toast.getHistory().slice(historicoAntes);
          const aviso = novos[novos.length - 1] ?? null;
          afirmar(
            "a mensagem diz o que falta e o que fazer, e passa pelas guardas de voz",
            aviso !== null &&
              voz.diagnosticarMensagem("o que houve", String(aviso.title)) === null &&
              voz.diagnosticarMensagem("o que fazer", String(aviso.description)) === null &&
              /data/i.test(String(aviso.title) + String(aviso.description)),
            aviso ? `${aviso.title} / ${aviso.description}` : "nenhuma notificação",
          );
        }
        // Com data preenchida, a mesma ação passa — senão a asserção acima
        // estaria satisfeita por um botão que nunca funciona.
        await tela.digitar(tela.campo("publicado_em"), "2027-03-01T09:30");
        await tela.clicar(tela.acaoPorChave("agendar"));
        afirmar(
          "com a data preenchida, agendar viaja com o destino `agendado`",
          modulo.controle.pedidos.length === 1 &&
            modulo.controle.pedidos[0]?.estado === "agendado" &&
            typeof modulo.controle.pedidos[0]?.publicado_em === "string",
          `pedidos: ${modulo.controle.pedidos.length} | ${JSON.stringify(
            modulo.controle.pedidos[0]?.estado,
          )} em ${JSON.stringify(modulo.controle.pedidos[0]?.publicado_em)}`,
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
        await tela.digitar(tela.campo("publicado_em"), HORA_DE_PAREDE);
        const historicoAntes = toast.getHistory().length;
        await tela.clicar(tela.acaoPorChave("agendar"));
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
        await tela.digitar(tela.campo("publicado_em"), "2026-01-01T09:00");
        const historicoAntes = toast.getHistory().length;
        await tela.clicar(tela.acaoPorChave("agendar"));
        const novos = toast.getHistory().slice(historicoAntes);
        const recusa =
          novos.find((t) => String(t.description ?? "") === RECUSA_VENCIDA) ?? null;

        afirmar(
          "a recusa por data vencida chega INTEIRA à tela, com a frase do servidor",
          recusa !== null,
          novos.map((t) => `${t.title} / ${t.description}`).join(" | ").slice(0, 220),
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
        afirmar(
          "e o conteúdo continua intacto: uma recusa não descarta o que foi escrito",
          tela.campo("publicado_em")?.value === "2026-01-01T09:00" &&
            tela.gaveta() !== null,
          `campo: ${tela.campo("publicado_em")?.value}`,
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
        const dataAntes = tela.campo("publicado_em")?.value ?? "";
        await tela.digitar(tela.campo("titulo"), "Ciclo de vida, revisado");
        await tela.clicar(tela.acaoPorChave("salvar"));
        afirmar(
          "salvar um Post publicado pede o MESMO Estado — salvar não é transição",
          modulo.controle.pedidos.length === 1 &&
            modulo.controle.pedidos[0]?.estado === "publicado",
          `estado pedido: ${modulo.controle.pedidos[0]?.estado}`,
        );
        afirmar(
          "e a tela continua publicada, com a data de publicação onde estava",
          tela.pilula()?.getAttribute("data-estado") === "publicado" &&
            (tela.campo("publicado_em")?.value ?? "") === dataAntes &&
            dataAntes !== "",
          `${dataAntes} → ${tela.campo("publicado_em")?.value}`,
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

/* ─── Veredito ───────────────────────────────────────────────────────────── */

console.log("");
if (falhas === 0) {
  console.log("Editor visual verificado: todas as asserções passaram.");
  process.exitCode = 0;
} else {
  console.log(`Editor visual NÃO verificado: ${falhas} asserção(ões) falharam.`);
  process.exitCode = 1;
}
