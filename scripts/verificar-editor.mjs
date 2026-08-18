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

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { JSDOM } from "jsdom";

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

/** Um navegador de mentira, mas um DOM de verdade. */
function montarNavegador() {
  const dom = new JSDOM(
    "<!doctype html><html><body><div id='area'></div></body></html>",
    { pretendToBeVisual: true, url: "https://painel.local/" },
  );
  const w = dom.window;
  const expor = (nome, valor) => {
    try {
      Object.defineProperty(globalThis, nome, {
        value: valor,
        configurable: true,
        writable: true,
      });
    } catch {
      /* propriedade sem escrita no Node: o jsdom já supre a maioria */
    }
  };
  for (const nome of Object.getOwnPropertyNames(w)) {
    if (nome in globalThis) continue;
    try {
      expor(nome, w[nome]);
    } catch {
      /* getters que estouram ao serem lidos não interessam aqui */
    }
  }
  /* Os construtores de evento do JSDOM sobrepõem os do Node, e a sobreposição
     é obrigatória, não cosmética. O Node 22+ já traz `Event` e `CustomEvent`
     globais, então o laço acima os pula (`nome in globalThis` é verdadeiro) — e
     uma biblioteca que faça `new CustomEvent(...)` produz um objeto que o
     `dispatchEvent` do jsdom RECUSA com "parameter 1 is not of type 'Event'".
     É o que acontecia ao montar o diálogo do shadcn: o Radix dispara eventos
     próprios ao abrir, e a tela inteira caía num erro que não é da tela. */
  for (const nome of ["Event", "CustomEvent", "MouseEvent", "KeyboardEvent", "FocusEvent"]) {
    if (w[nome]) expor(nome, w[nome]);
  }
  expor("window", w);
  expor("document", w.document);
  expor("navigator", w.navigator);
  /* Geometria de mentira. O jsdom não faz layout, e o ProseMirror pergunta a
     posição do cursor na tela sempre que um comando pede foco. Sem isto, cada
     comando cospe uma pilha de `getClientRects is not a function` no meio da
     saída — ruído que esconderia uma FALHA de verdade na hora de ler. */
  const retangulo = () => ({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
  });
  for (const prototipo of [w.Range.prototype, w.Element.prototype, w.Text.prototype]) {
    if (typeof prototipo.getClientRects !== "function") {
      prototipo.getClientRects = () => [retangulo()];
    }
    if (typeof prototipo.getBoundingClientRect !== "function") {
      prototipo.getBoundingClientRect = retangulo;
    }
  }
  w.Range.prototype.getClientRects = () => [retangulo()];

  /* O jsdom não implementa `ClipboardEvent`, e é dele que o caminho de colagem
     do ProseMirror depende: `view.pasteHTML` constrói um para disparar o
     pipeline real. Sem este remendo a prova de colagem não roda — e trocá-la
     por leitura de código é exatamente o que a story proíbe. */
  if (typeof globalThis.ClipboardEvent !== "function") {
    const Clipboard = class ClipboardEvent extends w.Event {
      constructor(tipo, init = {}) {
        super(tipo, init);
        this.clipboardData = init.clipboardData ?? null;
      }
    };
    expor("ClipboardEvent", Clipboard);
    w.ClipboardEvent = Clipboard;
  }
  return w;
}

/**
 * Compila os componentes React para um pacote que o Node consegue importar.
 *
 * **Roda ANTES de o DOM falso subir, e essa ordem é deliberada.** O `build` do
 * Vite é um processo de construção: ele decide plugins, ambiente e resolução
 * olhando para o processo em que roda. Com `window` e `document` de mentira
 * instalados em `globalThis`, qualquer coisa na cadeia que pergunte "estou num
 * navegador?" recebe sim, e o pacote compilado deixa de ser o que a aplicação
 * usa. Compilar primeiro, poluir depois.
 *
 * O JSX não é importável pelo Node, então ele é compilado pelo MESMO
 * empacotador que a aplicação usa — não por um transformador paralelo que
 * poderia divergir do que vai para produção.
 */
async function compilarComponentes() {
  const { build } = await import("vite");
  const plugin = (await import("@vitejs/plugin-react")).default;

  /* A pasta fica DENTRO do projeto, sob `node_modules/.cache`, e não no
     temporário do sistema: o pacote compilado importa `react` e `@tiptap/*`
     como externos, e a resolução do Node procura `node_modules` subindo a
     partir do arquivo. Fora do projeto, não há de onde resolver. */
  const cache = path.join(raiz, "node_modules", ".cache");
  mkdirSync(cache, { recursive: true });

  /* Varre o que sobrou de execuções anteriores ANTES de criar a pasta nova.
     No Windows, a pasta que acabou de ser importada fica presa pelo processo
     que a carregou, e a remoção no fim da execução falha em silêncio — uma
     execução por dia deixaria um rastro que ninguém percebe até o disco
     reclamar. Limpar na entrada resolve sem depender de a saída dar certo. */
  for (const entrada of readdirSync(cache, { withFileTypes: true })) {
    if (!entrada.isDirectory() || !entrada.name.startsWith("verificar-editor-")) continue;
    try {
      rmSync(path.join(cache, entrada.name), { recursive: true, force: true });
    } catch {
      /* presa por outro processo: a próxima execução tenta de novo */
    }
  }

  const pasta = mkdtempSync(path.join(cache, "verificar-editor-"));

  const entrada = path.join(pasta, "entrada.jsx");
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
  const caminhoReal = (relativo) =>
    JSON.stringify(path.join(raiz, relativo).split(path.sep).join("/"));

  const arquivoDoControle = path.join(pasta, "controle.js");
  writeFileSync(
    arquivoDoControle,
    "/* O que os dublês respondem, e o que eles registraram. */\n" +
      "export const controle = {\n" +
      "  pedidos: [],\n" +
      "  resposta: { ok: true, dados: { criado: false, post: null } },\n" +
      "  post: { ok: false, erro: { tipo: 'nao_encontrado', mensagem: 'sem post' } },\n" +
      "  categorias: { ok: true, dados: [] },\n" +
      "  tags: { ok: true, dados: [] },\n" +
      "  tagsDoPost: { ok: true, dados: [] },\n" +
      "};\n",
  );

  const arquivoDaEscrita = path.join(pasta, "duble-escrita.js");
  writeFileSync(
    arquivoDaEscrita,
    `export * from ${caminhoReal(CAMINHO_ESCRITA)};\n` +
      'import { controle } from "./controle.js";\n' +
      "export async function salvarPost(corpo) {\n" +
      "  controle.pedidos.push(corpo);\n" +
      "  return controle.resposta;\n" +
      "}\n",
  );

  const arquivoDosPosts = path.join(pasta, "duble-posts.js");
  writeFileSync(
    arquivoDosPosts,
    `export * from ${caminhoReal(CAMINHO_POSTS)};\n` +
      'import { controle } from "./controle.js";\n' +
      "export async function lerPostDoPainelPorId() {\n" +
      "  return controle.post;\n" +
      "}\n",
  );

  const arquivoDaTaxonomia = path.join(pasta, "duble-taxonomia.js");
  writeFileSync(
    arquivoDaTaxonomia,
    `export * from ${caminhoReal(CAMINHO_TAXONOMIA)};\n` +
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

  const comoModulo = (arquivo) =>
    JSON.stringify(arquivo.split(path.sep).join("/"));

  writeFileSync(
    entrada,
    `export { default as Editor } from ${JSON.stringify(alvo)};\n` +
      `export { prepararConteudo } from ${JSON.stringify(alvoDoConteudo)};\n` +
      `export { controlesDaBarra } from ${JSON.stringify(alvoDaConfiguracao)};\n` +
      `export { default as EditorDePost } from ${caminhoReal(CAMINHO_TELA)};\n` +
      `export { controle } from ${comoModulo(arquivoDoControle)};\n` +
      `export * as escritaReal from ${caminhoReal(CAMINHO_ESCRITA)};\n` +
      `export * as escritaDuble from ${comoModulo(arquivoDaEscrita)};\n` +
      `export * as postsReal from ${caminhoReal(CAMINHO_POSTS)};\n` +
      `export * as postsDuble from ${comoModulo(arquivoDosPosts)};\n` +
      `export * as taxonomiaReal from ${caminhoReal(CAMINHO_TAXONOMIA)};\n` +
      `export * as taxonomiaDuble from ${comoModulo(arquivoDaTaxonomia)};\n`,
  );

  /* O `build` do Vite escreve `NODE_ENV=production` no processo INTEIRO, e
     não desfaz. Isso importa aqui e é sutil: `react` já foi carregado (pelo
     mapa de ícones) na variante de desenvolvimento, e `react-dom/client`
     ainda não. Sem restaurar, cada um viria de uma variante diferente e o
     React estouraria com `dispatcher.getOwner is not a function` — medido,
     não suposto. */
  const ambienteAntes = process.env.NODE_ENV;
  try {
    await build({
      configFile: false,
      logLevel: "silent",
      plugins: [plugin()],
      /* A ordem importa: o apelido específico precisa vir ANTES do genérico,
         senão `@/data/blog/escrita` é resolvido por `@` e o dublê nunca entra
         (e a asserção de que ele entrou é o que denuncia isso). */
      resolve: {
        alias: {
          "@/data/blog/escrita": arquivoDaEscrita,
          "@/data/blog/posts": arquivoDosPosts,
          "@/data/blog/taxonomia": arquivoDaTaxonomia,
          "@": path.join(raiz, "src"),
        },
      },
      build: {
        ssr: entrada,
        outDir: path.join(pasta, "saida"),
        emptyOutDir: true,
        minify: false,
        rollupOptions: { output: { format: "es", entryFileNames: "entrada.js" } },
      },
    });
  } finally {
    if (ambienteAntes === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = ambienteAntes;
  }

  return { pasta, arquivo: path.join(pasta, "saida", "entrada.js") };
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
