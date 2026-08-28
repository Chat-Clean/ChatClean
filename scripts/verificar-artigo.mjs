#!/usr/bin/env node
/**
 * Ferramenta de verificação do estilo canônico do artigo (Story 2.3).
 *
 * Roda sobre o CSS que o `vite build` gera — o artefato que as telas de fato
 * consomem — e afirma, uma asserção por linha da matriz de I/O da story:
 *
 *   (a) `@tailwindcss/typography` instalado e registrado pelo CSS, sem subir
 *       a major do Tailwind nem tocar o pipeline do Vite;
 *   (b) `.artigo` existe no CSS compilado, é GLOBAL — não está aninhada em
 *       `.painel` nem na fonte nem no compilado — e é adição pura;
 *   (c) alcance: todo seletor começa em `.artigo` (fora dela nada se aplica),
 *       nenhum exige `class` no HTML do artigo, e nenhum alcança `h1`;
 *   (d) cobertura: cada um dos treze elementos que a story nomeia tem regra
 *       DIRETA (`.artigo <elemento>`), os quatro que o site nunca soube
 *       renderizar cumprem o que a matriz exige de cada um, e as colisões
 *       entre elementos aninhados estão desfeitas;
 *   (e) o artigo resolve os MESMOS valores em todos os escopos que o próprio
 *       arquivo declara — `:root`, `.painel` e `.dark`;
 *   (f) contraste WCAG 2.1 de cada par de cor, calculado sobre as
 *       superfícies em que o artigo de fato assenta;
 *   (g) nenhuma cor de hex solto e movimento reduzido continua global;
 *   (h) travas para o futuro: o vocabulário do renderizador não pode passar a
 *       emitir elemento sem estilo, e todo ponto de renderização de artigo
 *       tem de envolver o conteúdo em `.artigo`.
 *
 * O leitor de CSS e o cálculo de contraste vêm de `css-comum.mjs`, e os casos
 * de autoteste DELE rodam aqui antes de qualquer julgamento: medido por
 * sabotagem, inverter a tripla RGB do cálculo de contraste fazia esta
 * ferramenta imprimir "todas as asserções passaram" com todas as razões
 * erradas. Os detectores locais são exercitados pelo mesmo motivo.
 *
 * Esta ferramenta NÃO repete o que a da Story 1.1 já afirma (não-regressão do
 * baseline, contraste dos pares da marca, os três raios).
 *
 * Uso: npm run build && npm run verificar:artigo
 *
 * Saída: uma linha por asserção; código 0 se todas passarem, 1 caso contrário.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  acharCssCompilado,
  analisar,
  casosDeAutoteste,
  cssCompiladosEm,
  declaracoes,
  declaracoesDe,
  mascararComentarios,
  razaoContraste,
  regras,
  resolver,
  seletoresDo,
} from "./css-comum.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const caminhoAppCss = path.join(raiz, "src", "App.css");
const caminhoIndexCss = path.join(raiz, "src", "index.css");
const caminhoBlogPost = path.join(raiz, "src", "pages", "BlogPost.jsx");
const caminhoBaselineCss = path.join(
  raiz,
  "verificacao",
  "baseline",
  "dist-index.baseline.css",
);

/**
 * Os elementos que `.artigo` estiliza. Treze da story original, `h1` fora de
 * propósito — e `img`/`mark` desde o Editor Tiptap avançado (imagem inline e
 * destaque de cor), que acrescentou `.artigo img` e
 * `.artigo mark[data-cor="…"]` ao CSS canônico.
 */
const ELEMENTOS = [
  "h2",
  "h3",
  "p",
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
  "img",
  "mark",
];

/** Pisos WCAG 2.1: 1.4.3 para texto, 1.4.11 para marca não textual. */
const PISO_TEXTO = 4.5;
const PISO_NAO_TEXTO = 3;

/**
 * Transparência, em toda forma que o minificador pode emitir. UMA definição:
 * duas divergentes no mesmo arquivo já tinham começado a aparecer, e a que
 * fosse mais frouxa acabaria absolvendo cor crua de verdade.
 */
const TRANSPARENTE = /^(transparent|#0000|#00000000|rgba\(0,\s*0,\s*0,\s*0\))$/i;

/** Literal de cor em qualquer notação. */
const LITERAL_DE_COR =
  /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)/g;

/** Propriedades que carregam cor, com prefixo de fornecedor opcional. */
const PROPRIEDADES_DE_COR =
  /^(-\w+-)?(color|background|background-color|outline|outline-color|border(-[\w-]+)?|text-decoration|text-decoration-color|box-shadow|caret-color|fill|stroke)$/;

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

function ler(caminho) {
  return readFileSync(caminho, "utf8");
}

/**
 * Executa `acao` e devolve o valor; se estourar (arquivo ausente, JSON
 * malformado), conta uma asserção falha e devolve `null` — o script segue até
 * o fim em vez de morrer com pilha antes das seções seguintes.
 */
function lerOuFalhar(descricao, acao) {
  try {
    return acao();
  } catch (erro) {
    afirmar(descricao, false, erro.message);
    return null;
  }
}

/** Todo `.jsx`/`.js` sob `src/`, para as varreduras de fonte. */
function fontesDeSrc(dir = path.join(raiz, "src")) {
  const achados = [];
  let entradas;
  try {
    entradas = readdirSync(dir, { withFileTypes: true });
  } catch {
    return achados;
  }
  for (const entrada of entradas) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === "node_modules") continue;
      achados.push(...fontesDeSrc(completo));
    } else if (/\.(jsx|js)$/.test(entrada.name)) {
      achados.push(completo);
    }
  }
  return achados;
}

/* ─── Anatomia de seletor ────────────────────────────────────────────────
   Tudo o que esta ferramenta afirma sobre alcance depende de ler seletor —
   qual elemento cada regra atinge, se exige classe, se chega a `h1`. Os
   detectores são exercitados com entradas sintéticas antes de julgar o
   repositório: sem isso, "nenhum seletor alcança `h1`" seria promessa. */

/**
 * Quebra um seletor nos compostos separados por combinador, respeitando
 * parênteses e colchetes — `:is(a > b)` é UM composto, não três.
 */
function compostos(seletor) {
  const partes = [];
  let atual = "";
  let profundidade = 0;
  for (const ch of seletor) {
    if (ch === "(" || ch === "[") profundidade += 1;
    else if (ch === ")" || ch === "]") profundidade -= 1;
    if (profundidade === 0 && /[\s>+~]/.test(ch)) {
      if (atual) partes.push(atual);
      atual = "";
      continue;
    }
    atual += ch;
  }
  if (atual) partes.push(atual);
  return partes;
}

/** Nome do elemento que o último composto atinge (`.artigo li::marker` → li). */
function elementoAlvo(seletor) {
  const lista = compostos(seletor);
  const ultimo = lista[lista.length - 1] ?? "";
  return (/^([a-zA-Z][\w-]*)/.exec(ultimo) ?? [])[1] ?? null;
}

/** O primeiro composto é exatamente `.artigo`? (o alcance é o invólucro) */
function ancoradoEmArtigo(seletor) {
  return compostos(seletor)[0] === ".artigo";
}

/**
 * O seletor exige `class` no HTML do artigo?
 *
 * O invólucro é a única classe permitida: qualquer classe DEPOIS dele — ou
 * qualquer sonda em `[class...]` — pediria que o renderizador emitisse
 * atributo `class`, e classe gerada em tempo de execução nunca chega ao
 * compilador do Tailwind.
 */
function exigeClasseNoConteudo(seletor) {
  const [, ...resto] = compostos(seletor);
  return resto.some((c) => c.includes(".") || /\[\s*class/i.test(c));
}

/**
 * Este COMPOSTO pode casar um elemento chamado `tag`?
 *
 * A pergunta não é "o nome aparece no texto". Três formas de alcançar `h1`
 * sem escrever `h1` como tipo, e todas passavam antes:
 *
 *   `.artigo :first-child`   pseudo-classe pura: sem tipo, casa QUALQUER um
 *   `.artigo > :not(h2)`     negar outro tipo não protege o `h1`
 *   `.artigo :is(*, h2)`     o coringa dentro da lista vale como coringa
 *
 * E o inverso também estava errado: `:not(h1)` EXCLUI `h1` por definição, e
 * acusá-lo era falso positivo. Só a forma nominal exclui — `:not(.x)` não diz
 * nada sobre o tipo do elemento.
 */
function compostoAlcanca(composto, tag) {
  const texto = String(composto).trim();
  if (!texto) return false;

  const negados = [...texto.matchAll(/:not\(([^()]*)\)/g)].flatMap((m) =>
    m[1].split(",").map((s) => s.trim()),
  );
  if (negados.includes(tag)) return false;

  const semNot = texto.replace(/:not\([^()]*\)/g, "");
  const listas = [...semNot.matchAll(/:(?:is|where|matches)\(([^()]*)\)/g)].map(
    (m) => m[1],
  );
  const nu = semNot.replace(/:(?:is|where|matches)\([^()]*\)/g, "").trim();

  const tipo = (/^([a-zA-Z][\w-]*)/.exec(nu) ?? [])[1] ?? null;
  if (tipo) return tipo === tag;
  if (nu.startsWith("*")) return true;
  if (listas.length > 0) {
    return listas.some((lista) =>
      lista.split(",").some((s) => compostoAlcanca(s.trim(), tag)),
    );
  }
  // Sem tipo e sem `:is()`: pseudo-classe pura, atributo ou classe. Casa
  // qualquer elemento — inclusive `h1`.
  return true;
}

/**
 * O seletor alcança `tag`?
 *
 * Só o ÚLTIMO composto (o sujeito) decide qual elemento é estilizado: em
 * `.artigo h2 a`, quem recebe a declaração é o `a`. E regra de um composto só
 * é o próprio invólucro — `.artigo { color }` estiliza o contêiner, não um
 * descendente, e contá-la como "alcança h1" seria falso positivo.
 */
function alcanca(seletor, tag) {
  const lista = compostos(seletor);
  if (lista.length < 2) return false;
  return compostoAlcanca(lista[lista.length - 1], tag);
}

/** Primeiro `var(--x)` ou literal de cor de um valor, inclusive shorthand. */
function corDo(valor) {
  if (!valor) return null;
  const referencia = /var\(\s*(--[\w-]+)\s*\)/.exec(valor);
  if (referencia) return `var(${referencia[1]})`;
  const literal = new RegExp(LITERAL_DE_COR.source).exec(valor);
  return literal ? literal[0] : null;
}

/**
 * Alguma fonte MONTA a classe `.dark` no DOM?
 *
 * Três mecanismos concretos, não a palavra solta: variante `dark:` do
 * Tailwind aparece em toda parte e não monta nada.
 */
function montaDark(texto) {
  if (/classList\.(add|toggle)\(\s*["'`]dark["'`]/.test(texto)) return true;
  if (/from\s*["']next-themes["']/.test(texto)) return true;
  for (const m of texto.matchAll(/class(?:Name)?\s*=\s*["']([^"']*)["']/g)) {
    if (/(^|[^\w\-:/])dark($|[^\w\-:/])/.test(m[1])) return true;
  }
  return false;
}

/* ─── Autoteste do módulo compartilhado ──────────────────────────────── */

secao("Autoteste do leitor de CSS e do cálculo de contraste (css-comum.mjs)");

for (const [descricao, condicao, detalhe] of casosDeAutoteste()) {
  afirmar(descricao, condicao, detalhe);
}

/* ─── Autoteste dos detectores locais ────────────────────────────────── */

secao("Autoteste dos detectores de seletor");

afirmar(
  "compostos: quebra por combinador sem quebrar dentro de `:is()`",
  JSON.stringify(compostos(".artigo li>ul")) ===
    JSON.stringify([".artigo", "li", "ul"]) &&
    JSON.stringify(compostos(".artigo :is(h2, h3)")) ===
      JSON.stringify([".artigo", ":is(h2, h3)"]),
);
afirmar(
  "elementoAlvo: lê o elemento do último composto",
  elementoAlvo(".artigo li::marker") === "li" &&
    elementoAlvo(".artigo pre code") === "code" &&
    elementoAlvo(".artigo a:focus-visible") === "a" &&
    elementoAlvo(".artigo") === null,
);
afirmar(
  "ancoradoEmArtigo: aceita `.artigo p`, recusa `p` e `.painel .artigo p`",
  ancoradoEmArtigo(".artigo p") &&
    !ancoradoEmArtigo("p") &&
    !ancoradoEmArtigo(".painel .artigo p"),
);
afirmar(
  "exigeClasseNoConteudo: acusa classe e sonda `[class]` depois do invólucro",
  exigeClasseNoConteudo(".artigo .destaque") &&
    exigeClasseNoConteudo('.artigo p[class~="lead"]') &&
    !exigeClasseNoConteudo(".artigo blockquote p:last-child"),
);

/* `alcanca` é o detector da proibição central da story, e é onde estavam os
   pontos cegos. Cada linha abaixo é um caso que já passou despercebido. */
afirmar(
  "alcanca: acusa `h1` nomeado e o coringa explícito",
  alcanca(".artigo h1", "h1") &&
    alcanca(".artigo :is(h1,h2)", "h1") &&
    alcanca(".artigo > * + *", "h1") &&
    alcanca(".artigo *", "h1"),
);
afirmar(
  "alcanca: acusa COMPOSTO SEM TIPO — pseudo-classe pura, `:not(outro)`, `:is(*, …)`",
  alcanca(".artigo :first-child", "h1") &&
    alcanca(".artigo > :not(h2)", "h1") &&
    alcanca(".artigo :is(*, h2)", "h1") &&
    alcanca('.artigo [data-x="1"]', "h1"),
);
afirmar(
  "alcanca: `:not(h1)` EXCLUI `h1` — acusá-lo seria falso positivo",
  !alcanca(".artigo :not(h1)", "h1") && !alcanca(".artigo :not(h1, h4)", "h1"),
);
afirmar(
  "alcanca: `:is(h2,h3)` não é coringa, e tipo diferente não alcança",
  !alcanca(".artigo :is(h2,h3)", "h1") &&
    !alcanca(".artigo h2", "h1") &&
    !alcanca(".artigo blockquote p", "h1") &&
    !alcanca(".artigo li::marker", "h1") &&
    !alcanca(".artigo p:not(.x)", "h1"),
);
afirmar(
  "alcanca: o SUJEITO é o último composto, e o invólucro sozinho não conta",
  !alcanca(".artigo", "h1") &&
    !alcanca(".artigo h1 span", "h1") &&
    alcanca(".artigo h2 h1", "h1"),
);
afirmar(
  "corDo: extrai a cor de shorthand e de declaração simples",
  corDo("3px solid var(--brand-action)") === "var(--brand-action)" &&
    corDo("var(--ink)") === "var(--ink)" &&
    corDo("2px solid #007a2a") === "#007a2a" &&
    corDo("underline var(--brand-action) .08em") === "var(--brand-action)" &&
    corDo("0") === null,
);
afirmar(
  "montaDark: acusa os três mecanismos e absolve a variante `dark:`",
  montaDark('classList.add("dark")') &&
    montaDark('<div className="dark">') &&
    montaDark('import { ThemeProvider } from "next-themes"') &&
    !montaDark('<div className="dark:bg-zinc-900 md:dark:text-white">') &&
    !montaDark("// o tema dark ainda não existe"),
);

/* ─── (a) O plugin ───────────────────────────────────────────────────── */

secao("(a) `@tailwindcss/typography` instalado e registrado pelo CSS");

const pkg = lerOuFalhar("package.json legível", () =>
  JSON.parse(ler(path.join(raiz, "package.json"))),
);

if (pkg) {
  /* Em `dependencies` OU em `devDependencies`. O plugin só roda no build, e
     `devDependencies` é onde ele funcionalmente pertence; congelar a seção
     por asserção faria a arrumação certa quebrar a verificação. O que a
     story exige é que esteja instalado. */
  const versao =
    pkg.dependencies?.["@tailwindcss/typography"] ??
    pkg.devDependencies?.["@tailwindcss/typography"];
  const seccao = pkg.dependencies?.["@tailwindcss/typography"]
    ? "dependencies"
    : "devDependencies";
  afirmar(
    "`@tailwindcss/typography` declarado no package.json",
    typeof versao === "string" && versao.length > 0,
    "ausente de dependencies e de devDependencies",
  );
  if (versao) nota(`declarado em ${seccao} como ${versao}`);
  afirmar(
    "`@tailwindcss/typography` presente em node_modules",
    existsSync(
      path.join(raiz, "node_modules", "@tailwindcss", "typography", "package.json"),
    ),
  );
  // Block If da story: instalar o plugin não pode ter subido a major do
  // Tailwind nem alterado o pipeline do Vite.
  const tw = pkg.dependencies?.tailwindcss ?? pkg.devDependencies?.tailwindcss ?? "";
  afirmar(
    "Tailwind continua na major 4",
    /^[\^~]?4\./.test(tw),
    `encontrado: ${tw || "ausente"}`,
  );
  afirmar(
    "script `verificar` encadeia `verificar:artigo`",
    (pkg.scripts?.verificar ?? "").includes("verificar:artigo") &&
      typeof pkg.scripts?.["verificar:artigo"] === "string",
    `encontrado: ${pkg.scripts?.verificar ?? "ausente"}`,
  );
}

const fonteCss = lerOuFalhar("src/App.css legível", () => ler(caminhoAppCss));

if (fonteCss) {
  /* Comentário mascarado, literal de string preservado: `@plugin` comentado
     não conta, e o nome do pacote vive dentro de aspas — `mascarar()`, que
     também apaga string, faria a asserção nunca achar a diretiva. */
  const semComentario = mascararComentarios(fonteCss);
  afirmar(
    "src/App.css registra o plugin com `@plugin` (Tailwind 4 não usa arquivo de configuração)",
    /@plugin\s+["']@tailwindcss\/typography["']/.test(semComentario),
  );

  /* `prose` estiliza `h1` e `img`, e a story proíbe os dois. A asserção tem
     de olhar a FONTE: `@apply prose` é achatado em declarações pelo
     compilador e a palavra some do artefato, então procurá-la no CSS
     compilado passaria por construção — inclusive com `@apply prose` no
     lugar. */
  const apliques = [...semComentario.matchAll(/@apply\s+([^;{}]*)/g)].map(
    (m) => m[1],
  );
  const comProse = apliques.filter((v) => /(^|[\s:])prose(?![\w-])/.test(v));
  afirmar(
    "`prose` não é aplicada por `@apply` na fonte (ela estilizaria `h1` e `img`)",
    comProse.length === 0,
    comProse.slice(0, 3).join(" | "),
  );
  // Piso: se a extração de `@apply` parasse de funcionar, a asserção acima
  // passaria por vacuidade. Ela precisa saber acusar.
  afirmar(
    "extrator de `@apply`: acusaria `@apply prose` e absolve `prose-mine`",
    /(^|[\s:])prose(?![\w-])/.test(" prose max-w-none") &&
      !/(^|[\s:])prose(?![\w-])/.test(" prose-mine"),
  );
}

afirmar(
  "nenhum `tailwind.config.*` foi criado (o registro é pelo CSS)",
  !["js", "cjs", "mjs", "ts"].some((ext) =>
    existsSync(path.join(raiz, `tailwind.config.${ext}`)),
  ),
);

{
  const vite = lerOuFalhar("vite.config.js legível", () =>
    ler(path.join(raiz, "vite.config.js")),
  );
  if (vite !== null) {
    afirmar(
      "o pipeline do Vite não foi alterado para acomodar o plugin",
      !/typography/i.test(vite),
    );
  }
}

/* ─── CSS compilado ──────────────────────────────────────────────────── */

secao("CSS compilado");

const cssEmDist = cssCompiladosEm(raiz);
const arquivoCss = acharCssCompilado(raiz);
/* Diagnóstico separado: zero `.css` é build ausente; mais de um é
   ambiguidade — `dist` sujo de uma geração anterior —, e mandar rodar o
   build de novo é o conselho errado para esse caso. */
afirmar(
  cssEmDist.length > 1
    ? "dist/assets contém exatamente um .css (há mais de um: limpe `dist` antes de rebuildar)"
    : "dist/assets contém exatamente um .css (rode `npm run build` antes)",
  cssEmDist.length === 1,
  `encontrados: ${cssEmDist.length}${cssEmDist.length > 1 ? ` — ${cssEmDist.map((f) => path.basename(f)).join(", ")}` : ""}`,
);

let cssCompilado = null;
if (arquivoCss) {
  cssCompilado = lerOuFalhar("CSS compilado legível", () => ler(arquivoCss));
  nota(`arquivo: ${path.relative(raiz, arquivoCss)}`);
  /* Um `dist` obsoleto passaria por todas as asserções sem refletir a fonte.
     As DUAS fontes contam: a seção de contraste lê a superfície pública de
     `src/index.css`, e mudar o fundo lá sem rebuildar misturaria duas
     gerações do projeto numa conta só. `statSync` vai dentro do envoltório:
     arquivo removido entre a listagem e a leitura vira asserção falha, não
     pilha de exceção. */
  const idades = lerOuFalhar("datas de modificação legíveis", () => ({
    css: statSync(arquivoCss).mtimeMs,
    fontes: [caminhoAppCss, caminhoIndexCss]
      .filter((f) => existsSync(f))
      .map((f) => ({ f, t: statSync(f).mtimeMs })),
  }));
  if (idades) {
    const maisNova = idades.fontes.reduce(
      (acc, x) => (x.t > acc.t ? x : acc),
      { f: "(nenhuma)", t: 0 },
    );
    afirmar(
      "CSS compilado é mais recente que `src/App.css` e `src/index.css` (build atual)",
      idades.css >= maisNova.t,
      `css: ${new Date(idades.css).toISOString()} < ${path.relative(raiz, maisNova.f)}: ${new Date(maisNova.t).toISOString()}`,
    );
  }
}

const temCss = Boolean(cssCompilado);

if (temCss) {
  /* Antes de confiar em QUALQUER recorte do CSS: a varredura precisa ter
     terminado com as chaves batendo. Sem esta asserção, um leitor
     dessincronizado devolveria regras truncadas e tudo abaixo julgaria
     texto picado — em silêncio, que é exatamente o modo de falha que o
     módulo compartilhado existe para evitar. */
  afirmar(
    "varredura do CSS compilado terminou com as chaves balanceadas",
    analisar(cssCompilado).balanceada,
  );
}

/**
 * Todo par (seletor, declarações) do CSS compilado em que o seletor menciona
 * `.artigo` — inclusive as menções ilegítimas, como `.painel .artigo p`, que
 * a seção (b) existe para acusar.
 */
function seletoresDoArtigo(css) {
  const achados = [];
  for (const { prelude, corpo } of regras(css)) {
    const decls = new Map(declaracoes(corpo));
    if (decls.size === 0) continue;
    for (const seletor of seletoresDo(prelude)) {
      if (!/(^|[^\w-])\.artigo([^\w-]|$)/.test(seletor)) continue;
      achados.push({ seletor, decls });
    }
  }
  return achados;
}

const doArtigo = temCss ? seletoresDoArtigo(cssCompilado) : [];

/** União das declarações das regras cujo seletor é exatamente `alvo`. */
function declsDe(alvo) {
  const mapa = new Map();
  for (const { seletor, decls } of doArtigo) {
    if (seletor !== alvo) continue;
    for (const [nome, valor] of decls) mapa.set(nome, valor);
  }
  return mapa;
}

/* ─── (b) `.artigo` é global e é adição pura ─────────────────────────── */

secao("(b) `.artigo` existe, é global e não está aninhada em `.painel`");

if (temCss) {
  afirmar(
    "`.artigo` existe no CSS compilado",
    doArtigo.length > 0,
    "nenhum seletor com `.artigo` no artefato publicado",
  );
  afirmar(
    "a regra base `.artigo` declara estilo próprio",
    declsDe(".artigo").size > 0,
  );

  // A prova central: nenhum seletor combina `.artigo` com `.painel`. Se
  // `.artigo` fosse declarada dentro do bloco `.painel` — por aninhamento na
  // fonte ou por descendência — o Tailwind emitiria `.painel .artigo …` e a
  // aparência do artigo passaria a depender do escopo do Painel.
  const escopados = doArtigo
    .map(({ seletor }) => seletor)
    .filter((s) => /(^|[^\w-])\.painel([^\w-]|$)/.test(s));
  afirmar(
    "nenhum seletor de `.artigo` está sob `.painel` no CSS compilado",
    escopados.length === 0,
    escopados.slice(0, 5).join(" | "),
  );
}

if (fonteCss) {
  // Mesma prova na fonte, e por profundidade de chaves: aninhar `.artigo`
  // dentro de `.painel` na fonte é o erro que a story nomeia, e ele precisa
  // ser acusado mesmo que o compilador achatasse o resultado.
  const limpo = mascararComentarios(fonteCss).replace(/"[^"]*"|'[^']*'/g, (s) =>
    " ".repeat(s.length),
  );
  const posicoes = [...limpo.matchAll(/(^|[^\w-])\.artigo([^\w-])/g)].map(
    (m) => m.index,
  );
  afirmar("src/App.css declara `.artigo`", posicoes.length > 0);
  const profundidadeEm = (texto, indice) => {
    let profundidade = 0;
    for (let i = 0; i < indice; i += 1) {
      if (texto[i] === "{") profundidade += 1;
      else if (texto[i] === "}") profundidade -= 1;
    }
    return profundidade;
  };
  const aninhadas = posicoes.filter((p) => profundidadeEm(limpo, p) !== 0);
  afirmar(
    "toda menção a `.artigo` na fonte está no nível de fora (fora de `.painel`, de `@layer` e de `@media`)",
    aninhadas.length === 0,
    `${aninhadas.length} menção(ões) em profundidade > 0`,
  );

  // Autoteste da medida de profundidade: sem ele, um bug em `profundidadeEm`
  // faria a asserção acima passar sobre um `.artigo` de fato aninhado.
  {
    const amostra = ".painel{ .artigo{color:red} } .artigo{color:blue}";
    const alvos = [...amostra.matchAll(/(^|[^\w-])\.artigo([^\w-])/g)].map(
      (m) => m.index,
    );
    afirmar(
      "medida de profundidade: acusa `.artigo` aninhada e absolve a do nível de fora",
      alvos.length === 2 &&
        profundidadeEm(amostra, alvos[0]) === 1 &&
        profundidadeEm(amostra, alvos[1]) === 0,
      `profundidades: ${alvos.map((a) => profundidadeEm(amostra, a)).join(", ")}`,
    );
  }
}

if (temCss && existsSync(caminhoBaselineCss)) {
  // Adição pura: `.artigo` é regra nova. A não-regressão do resto do CSS é
  // afirmada por `verificar-fundacao.mjs` e não se repete aqui.
  const baseline = lerOuFalhar("CSS do baseline legível", () =>
    ler(caminhoBaselineCss),
  );
  if (baseline !== null) {
    afirmar(
      "`.artigo` não existia no baseline — a entrega é adição pura",
      !/(^|[^\w-])\.artigo([^\w-]|$)/.test(baseline),
    );
  }
} else if (temCss) {
  afirmar(
    "CSS do baseline presente para confirmar adição pura",
    false,
    `ausente: ${path.relative(raiz, caminhoBaselineCss)}`,
  );
}

/* ─── (c) Alcance: invólucro, sem classe, sem `h1` ───────────────────── */

secao("(c) o alcance é o invólucro — sem classe no conteúdo e sem `h1`");

if (temCss) {
  const forasDoInvolucro = doArtigo
    .map(({ seletor }) => seletor)
    .filter((s) => !ancoradoEmArtigo(s));
  afirmar(
    "todo seletor começa em `.artigo` — o mesmo HTML fora dela não recebe estilo",
    forasDoInvolucro.length === 0,
    forasDoInvolucro.slice(0, 5).join(" | "),
  );

  const comClasse = doArtigo
    .map(({ seletor }) => seletor)
    .filter((s) => exigeClasseNoConteudo(s));
  afirmar(
    "nenhum seletor exige `class` no HTML do artigo",
    comClasse.length === 0,
    comClasse.slice(0, 5).join(" | "),
  );

  const tocamH1 = doArtigo
    .map(({ seletor }) => seletor)
    .filter((s) => alcanca(s, "h1"));
  afirmar(
    "nenhum seletor alcança `h1` — o título é da página, e dois `h1` por página é defeito",
    tocamH1.length === 0,
    tocamH1.slice(0, 5).join(" | "),
  );

  // Imagem inline entrou no vocabulário (Editor avançado: `NOS.image`,
  // `domain/blog/schema.js`) — o seletor precisa EXISTIR agora, e não mais
  // estar ausente. `figure` continua fora: o schema não tem esse nó.
  const tocamImg = doArtigo.map(({ seletor }) => seletor).filter((s) => alcanca(s, "img"));
  afirmar(
    "`.artigo img` existe e limita a largura à coluna (imagem inline não estoura o contêiner)",
    tocamImg.length > 0,
    tocamImg.slice(0, 5).join(" | "),
  );
  const tocamFigure = doArtigo.map(({ seletor }) => seletor).filter((s) => alcanca(s, "figure"));
  afirmar(
    "nenhum seletor estiliza `figure` — o schema não tem esse nó",
    tocamFigure.length === 0,
    tocamFigure.slice(0, 5).join(" | "),
  );
}

/* ─── (d) Cobertura dos treze elementos ──────────────────────────────── */

secao("(d) cada elemento nomeado tem regra DIRETA por descendente");

if (temCss) {
  /* A exigência é o seletor descendente direto `.artigo <elemento>`, não
     "alguma regra cujo alvo final seja este elemento". Pela regra frouxa,
     `code` passava só com `.artigo pre code` — que não estiliza código
     inline — e `li` passaria só com `.artigo li::marker`, que estiliza o
     marcador e não o item. Prova indireta não é prova. */
  for (const elemento of ELEMENTOS) {
    const direto = `.artigo ${elemento}`;
    afirmar(
      `\`${elemento}\` tem regra direta \`${direto}\``,
      declsDe(direto).size > 0,
      "só há regras indiretas (aninhadas ou de pseudo-elemento) para este elemento",
    );
  }

  /* Os quatro que o site nunca soube renderizar. */

  const link = declsDe(".artigo a");
  afirmar(
    "link: tem cor própria",
    Boolean(link.get("color")),
    `encontrado: ${link.get("color") ?? "ausente"}`,
  );
  /* "Distinguível do texto por mais que só cor". Aceita o atalho e o
     longhand: o minificador pode fundir `text-decoration-line`,
     `-color` e `-thickness` num `text-decoration` só, e uma asserção que
     conheça apenas uma das formas quebra em CSS correto. */
  const decoracao = [
    link.get("text-decoration"),
    link.get("text-decoration-line"),
    link.get("-webkit-text-decoration"),
  ]
    .filter(Boolean)
    .join(" ");
  afirmar(
    "link: distingue-se por forma, não só por cor (sublinhado permanente)",
    /underline/.test(decoracao) ||
      Boolean(link.get("border-bottom")) ||
      Boolean(link.get("box-shadow")),
    `text-decoration: ${decoracao || "ausente"}`,
  );
  afirmar(
    "link: tem indicação de foco visível pelo teclado",
    declsDe(".artigo a:focus-visible").size > 0,
  );

  const citacao = declsDe(".artigo blockquote");
  const recuo =
    citacao.get("padding-inline-start") ??
    citacao.get("padding-left") ??
    citacao.get("padding");
  const marca =
    citacao.get("border-inline-start") ??
    citacao.get("border-left") ??
    citacao.get("border-inline-start-width");
  afirmar(
    "citação: tem recuo",
    Boolean(recuo) && !/^0\w*$/.test(recuo),
    `encontrado: ${recuo ?? "ausente"}`,
  );
  afirmar(
    "citação: tem marca visual na lateral",
    Boolean(marca),
    `encontrado: ${marca ?? "ausente"}`,
  );

  const bloco = declsDe(".artigo pre");
  afirmar(
    "bloco de código: tem fundo próprio",
    Boolean(bloco.get("background-color") ?? bloco.get("background")),
    `encontrado: ${bloco.get("background-color") ?? "ausente"}`,
  );
  afirmar(
    "bloco de código: tem ROLAGEM HORIZONTAL própria — linha longa não empurra a página",
    /^(auto|scroll)$/.test(bloco.get("overflow-x") ?? "") ||
      /^(auto|scroll)$/.test(bloco.get("overflow") ?? ""),
    `overflow-x: ${bloco.get("overflow-x") ?? "ausente"}`,
  );
  afirmar(
    "bloco de código: não estoura o contêiner (`max-width`)",
    (bloco.get("max-width") ?? "") === "100%",
    `encontrado: ${bloco.get("max-width") ?? "ausente"}`,
  );
  afirmar(
    "bloco de código: preserva a quebra do autor (`white-space: pre`)",
    /^pre($|[^-])/.test(bloco.get("white-space") ?? ""),
    `encontrado: ${bloco.get("white-space") ?? "ausente"}`,
  );
  /* WCAG 2.1.1: região rolável tem de ser alcançável por teclado, e quem
     recebe foco precisa de indicador visível. O `tabindex` é atributo e vem
     do renderizador; o indicador é daqui, e sem ele o foco chegaria
     invisível no dia em que o atributo chegasse. */
  afirmar(
    "bloco de código: indicador de foco pronto para quando o bloco rolável receber `tabindex`",
    declsDe(".artigo pre:focus-visible").has("outline"),
    `encontrado: ${declsDe(".artigo pre:focus-visible").get("outline") ?? "ausente"}`,
  );
  const pilhaMono = [...doArtigo]
    .filter(({ seletor }) => seletor === ".artigo pre" || seletor === ".artigo code")
    .map(({ decls }) => decls.get("font-family"))
    .filter(Boolean);
  afirmar(
    "bloco de código: pilha monoespaçada declarada, terminando em `monospace`",
    pilhaMono.length > 0 && pilhaMono.every((v) => /monospace\s*$/.test(v)),
    `encontrado: ${pilhaMono[0] ?? "ausente"}`,
  );

  const regra = declsDe(".artigo hr");
  const larguraRegra =
    regra.get("border-block-start") ??
    regra.get("border-top") ??
    regra.get("height");
  afirmar(
    "linha divisória: régua visível declarada",
    Boolean(larguraRegra) && !/^0\w*$/.test(larguraRegra),
    `encontrado: ${larguraRegra ?? "ausente"}`,
  );
  const respiro = regra.get("margin-block") ?? regra.get("margin");
  afirmar(
    "linha divisória: tem respiro acima e abaixo",
    Boolean(respiro) && !/^0\w*$/.test(respiro),
    `encontrado: ${respiro ?? "ausente"}`,
  );

  // Código inline × bloco de código: a matriz pede estilos DISTINTOS.
  const inline = declsDe(".artigo code");
  const dentroDoBloco = declsDe(".artigo pre code");
  afirmar(
    "código inline: fundo e tinta distintos do bloco de código",
    (inline.get("background-color") ?? "") !== (bloco.get("background-color") ?? "") &&
      (inline.get("color") ?? "") !== (bloco.get("color") ?? ""),
    `inline ${inline.get("background-color")}/${inline.get("color")} × bloco ${bloco.get("background-color")}/${bloco.get("color")}`,
  );
  afirmar(
    "código dentro do bloco herda o bloco em vez de repintar-se de inline",
    (dentroDoBloco.get("color") ?? "") === "inherit" &&
      TRANSPARENTE.test(dentroDoBloco.get("background-color") ?? ""),
    `encontrado: ${dentroDoBloco.get("background-color") ?? "ausente"} / ${dentroDoBloco.get("color") ?? "ausente"}`,
  );

  /* Lista: o preflight do Tailwind zera marcador e recuo. As duas asserções
     afirmam a mesma coisa — o TIPO do marcador —, e não uma o tipo e outra a
     posição. */
  for (const [seletor, esperado] of [
    [".artigo ul", "disc"],
    [".artigo ol", "decimal"],
  ]) {
    const d = declsDe(seletor);
    const tipo = d.get("list-style-type") ?? corDoAtalhoDeLista(d.get("list-style"));
    afirmar(
      `${seletor}: tipo de marcador restaurado depois do preflight (${esperado})`,
      tipo === esperado,
      `encontrado: ${tipo ?? d.get("list-style") ?? "ausente"}`,
    );
  }

  /* Medida do texto: `prose` traria `max-width: 65ch` e não foi aplicada.
     Sem substituto, texto corrido em contêiner largo fica ilegível por
     comprimento de linha. */
  const medida = declsDe(".artigo").get("max-width") ?? "";
  afirmar(
    "medida do texto travada em `ch` — a decisão de não usar `prose` não deixou a linha solta",
    /^\d+(\.\d+)?ch$/.test(medida),
    `encontrado: ${medida || "ausente"}`,
  );

  /* Colisões entre elementos aninhados: cada uma é um defeito que duas
     declarações corretas isoladas produzem juntas. */
  secao("(d2) colisões entre elementos aninhados desfeitas");
  const colisoes = [
    [
      "ênfase dentro de citação não some (as duas eram itálicas)",
      ".artigo blockquote em",
      "font-style",
      "normal",
    ],
    [
      "negrito dentro de link mantém a cor do link",
      ".artigo a strong",
      "color",
      "inherit",
    ],
    [
      "link dentro de título 2 mantém o peso do título",
      ".artigo h2 a",
      "font-weight",
      "inherit",
    ],
    [
      "link dentro de título 3 mantém o peso do título",
      ".artigo h3 a",
      "font-weight",
      "inherit",
    ],
    [
      "parágrafo dentro de item de lista não dobra o espaçamento",
      ".artigo li>p:last-child",
      "margin-block-end",
      "0",
    ],
  ];
  for (const [rotulo, seletor, propriedade, valor] of colisoes) {
    const encontrado = declsDe(seletor).get(propriedade);
    afirmar(rotulo, encontrado === valor, `${seletor} { ${propriedade}: ${encontrado ?? "ausente"} }`);
  }
  const semUltimaMargem = ["h2", "h3", "p", "ul", "ol", "blockquote", "pre", "hr"].filter(
    (el) => declsDe(`.artigo>${el}:last-child`).get("margin-block-end") !== "0",
  );
  afirmar(
    "o último bloco do artigo não empurra o rodapé do invólucro",
    semUltimaMargem.length === 0,
    `sem zeragem: ${semUltimaMargem.join(", ")}`,
  );
}

/** Tipo de marcador dentro do atalho `list-style`, quando houver. */
function corDoAtalhoDeLista(valor) {
  if (!valor) return null;
  const m = /\b(disc|circle|square|decimal|none|lower-alpha|upper-alpha|lower-roman|upper-roman)\b/.exec(
    valor,
  );
  return m ? m[1] : null;
}

/* ─── (e) Mesmos valores em todo escopo que o arquivo declara ────────── */

secao("(e) o artigo resolve os mesmos valores em `:root`, `.painel` e `.dark`");

let tokensDoArtigo = new Set();
if (temCss) {
  const root = declaracoesDe(cssCompilado, ":root");
  const painel = declaracoesDe(cssCompilado, ".painel");
  const escopoPainel = new Map([...root, ...painel]);

  // Todo token que alguma declaração do artigo lê, direta ou transitivamente.
  const coletar = (valor, profundidade = 0) => {
    if (!valor || profundidade > 12) return;
    for (const m of valor.matchAll(/var\(\s*(--[\w-]+)\s*[,)]/g)) {
      if (tokensDoArtigo.has(m[1])) continue;
      tokensDoArtigo.add(m[1]);
      coletar(root.get(m[1]), profundidade + 1);
    }
  };
  for (const { decls } of doArtigo) {
    for (const [, valor] of decls) coletar(valor);
  }

  afirmar(
    "o artigo lê pelo menos um token (a coleta não saiu vazia)",
    tokensDoArtigo.size > 0,
  );

  const redefinidos = [...tokensDoArtigo].filter((t) => painel.has(t));
  afirmar(
    "nenhum token lido pelo artigo é redefinido sob `.painel`",
    redefinidos.length === 0,
    redefinidos.join(", "),
  );

  const divergentes = [...tokensDoArtigo].filter((t) => {
    const fora = resolver(`var(${t})`, root);
    const dentro = resolver(`var(${t})`, escopoPainel);
    return fora === null || fora !== dentro;
  });
  afirmar(
    `os ${tokensDoArtigo.size} tokens do artigo resolvem o mesmo literal dentro e fora do Painel`,
    divergentes.length === 0,
    divergentes
      .map((t) => `${t}: ${resolver(`var(${t})`, root)} × ${resolver(`var(${t})`, escopoPainel)}`)
      .join(" | "),
  );

  // Autoteste: a comparação precisa mesmo acusar um token remapeado.
  afirmar(
    "detector de divergência: `--foreground`, que `.painel` remapeia, seria acusado",
    painel.has("--foreground") &&
      resolver("var(--foreground)", root) !==
        resolver("var(--foreground)", escopoPainel),
    `fora: ${resolver("var(--foreground)", root)} × dentro: ${resolver("var(--foreground)", escopoPainel)}`,
  );
}

/* ─── (e1) O FUNDO sobre o qual o artigo é mostrado (Story 2.13) ──────── */

secao("(e1) o par texto/fundo do artigo, e não só a tinta");

/*
 * "O que se vê é o que sairá" não vale só para o TEXTO.
 *
 * O par texto/fundo é o que decide contraste, e é justamente por isso que
 * `.artigo` é global. A pré-visualização é a primeira tela a mostrar o artigo, e
 * a raiz dela é do Painel — onde `--background` resolve OUTRO valor. Pintar o
 * artigo com esse token o mostraria sobre um fundo que o site nunca usa, e a
 * promessa valeria pela metade.
 *
 * A tela declara qual token usa. Aqui esse token é resolvido nos dois escopos e
 * o par é medido — calculado, não afirmado.
 */
if (temCss) {
  const CAMINHO_DA_PREVIA = "src/admin/blog/previa.js";
  const CAMINHO_DA_TELA = "src/admin/blog/PreVisualizacaoDePost.jsx";
  const fontePrevia = existsSync(path.join(raiz, CAMINHO_DA_PREVIA))
    ? readFileSync(path.join(raiz, CAMINHO_DA_PREVIA), "utf8")
    : "";
  const fonteTela = existsSync(path.join(raiz, CAMINHO_DA_TELA))
    ? readFileSync(path.join(raiz, CAMINHO_DA_TELA), "utf8")
    : "";

  const token =
    /TOKEN_DO_FUNDO_DO_ARTIGO\s*=\s*["']([^"']+)["']/.exec(fontePrevia)?.[1] ?? "";
  const classe =
    /CLASSE_DO_FUNDO_DO_ARTIGO\s*=\s*["']([^"']+)["']/.exec(fontePrevia)?.[1] ?? "";

  const declarou = afirmar(
    "a tela DECLARA qual token pinta o fundo do artigo — o par não pode ser adivinhado pela verificação",
    token.startsWith("--") && classe !== "",
    `token: ${JSON.stringify(token)} | classe: ${JSON.stringify(classe)}`,
  );

  afirmar(
    "e ela VESTE essa classe — a constante sem uso seria uma promessa que o JSX não cumpre",
    fonteTela.includes("CLASSE_DO_FUNDO_DO_ARTIGO"),
    CAMINHO_DA_TELA,
  );

  if (declarou) {
    const root = declaracoesDe(cssCompilado, ":root");
    const painel = declaracoesDe(cssCompilado, ".painel");
    const escopoPainel = new Map([...root, ...painel]);

    const fora = resolver(`var(${token})`, root);
    const dentro = resolver(`var(${token})`, escopoPainel);
    afirmar(
      `o fundo do artigo (\`${token}\`) resolve o MESMO literal dentro e fora do Painel — senão o par mudaria ao cruzar a fronteira`,
      fora !== null && fora === dentro && !painel.has(token),
      `fora: ${fora} × dentro: ${dentro}`,
    );

    const tinta = resolver(declsDe(".artigo").get("color") ?? "", root);
    const razao = razaoContraste(tinta ?? "", fora ?? "");
    afirmar(
      "e o par tinta-do-artigo sobre esse fundo passa no piso de 4,5:1 — medido, não afirmado",
      razao !== null && razao >= 4.5,
      `${tinta} sobre ${fora} = ${razao === null ? "não resolvido" : razao.toFixed(2)}:1`,
    );

    /* AUTOTESTE: o detector precisa acusar o token ERRADO — o que o Painel
       remapeia — em vez de aprovar qualquer nome que apareça no arquivo. */
    afirmar(
      "o detector acusaria `--background`, que é justamente o token que o Painel remapeia",
      painel.has("--background") &&
        resolver("var(--background)", root) !== resolver("var(--background)", escopoPainel),
      `fora: ${resolver("var(--background)", root)} × dentro: ${resolver("var(--background)", escopoPainel)}`,
    );
  }
}

/* ─── (e2) O terceiro escopo: `.dark` ────────────────────────────────── */

secao("(e2) o terceiro escopo que o próprio arquivo declara: `.dark`");

if (temCss) {
  const root = declaracoesDe(cssCompilado, ":root");
  const dark = declaracoesDe(cssCompilado, ".dark");
  const escopoDark = new Map([...root, ...dark]);

  afirmar(
    "`.dark` existe no CSS compilado (é ela que torna a pergunta legítima)",
    dark.size > 0,
  );

  const fundoDark = resolver(dark.get("--background") ?? "", escopoDark);
  const tintaArtigo = resolver(declsDe(".artigo").get("color") ?? "", root);
  const razaoDark = razaoContraste(tintaArtigo ?? "", fundoDark ?? "");

  /* `.dark` remapeia `--background` e `--foreground`, mas não toca
     `--ink-secondary`, de onde o artigo tira a tinta. Sob `.dark`, o artigo
     seria tinta quase preta sobre superfície quase preta. A decisão
     registrada no CSS é não ter ramo escuro PORQUE ninguém monta `.dark` —
     não há provedor de tema no projeto e a classe nunca chega ao DOM.
     Esta asserção é a trava dessa decisão: no dia em que alguma fonte montar
     `.dark`, ela passa a exigir que o artigo continue legível. */
  const montadores = fontesDeSrc()
    .concat([path.join(raiz, "index.html")].filter((f) => existsSync(f)))
    .filter((arquivo) => {
      try {
        return montaDark(readFileSync(arquivo, "utf8"));
      } catch {
        return false;
      }
    });

  nota(
    `tinta do artigo ${tintaArtigo} sobre o fundo de \`.dark\` ${fundoDark} = ${razaoDark === null ? "não resolvido" : `${razaoDark.toFixed(2)}:1`}`,
  );
  nota(
    montadores.length === 0
      ? "nenhuma fonte monta `.dark` — o tema escuro não é alcançável hoje"
      : `montam \`.dark\`: ${montadores.map((f) => path.relative(raiz, f)).join(", ")}`,
  );

  afirmar(
    "ou `.dark` não é montada por ninguém, ou o artigo continua legível sob ela",
    montadores.length === 0 || (razaoDark !== null && razaoDark >= PISO_TEXTO),
    montadores.length > 0
      ? `\`.dark\` é montada e o artigo dá ${razaoDark === null ? "cor não resolvida" : `${razaoDark.toFixed(2)}:1`} — o artigo precisa de ramo escuro`
      : "",
  );

  // O número acima só vale se a conversão de oklch estiver funcionando: o
  // fundo de `.dark` é oklch, e "não resolvido" tornaria a trava vazia.
  afirmar(
    "o fundo de `.dark` foi de fato resolvido e medido (a trava não é vazia)",
    razaoDark !== null,
    `tinta: ${tintaArtigo ?? "?"} sobre fundo: ${fundoDark ?? "?"}`,
  );
}

/* ─── (f) Contraste WCAG 2.1 ─────────────────────────────────────────── */

secao("(f) contraste calculado de cada par de cor do artigo");

if (temCss) {
  const root = declaracoesDe(cssCompilado, ":root");
  const painel = declaracoesDe(cssCompilado, ".painel");

  /* As duas superfícies em que o artigo de fato assenta, lidas do projeto e
     não escolhidas à mão: o fundo do site público (`body` em index.css) e o
     fundo do Painel (`--background` sob `.painel`). Se qualquer uma mudar, a
     conta muda junto. */
  const indexCss = lerOuFalhar("src/index.css legível", () => ler(caminhoIndexCss));
  let fundoPublico = null;
  if (indexCss) {
    const corpo = declaracoesDe(indexCss, "body");
    fundoPublico = corDo(corpo.get("background") ?? corpo.get("background-color"));
  }
  const fundoPainel = resolver(
    painel.get("--background") ?? "",
    new Map([...root, ...painel]),
  );

  afirmar(
    "fundo do site público lido de `src/index.css`",
    Boolean(fundoPublico),
    `encontrado: ${fundoPublico ?? "ausente"}`,
  );
  afirmar(
    "fundo do Painel resolvido de `.painel { --background }`",
    Boolean(fundoPainel),
    `encontrado: ${fundoPainel ?? "ausente"}`,
  );

  // O artigo não pinta o próprio fundo — herda a superfície do consumidor. É
  // por isso que cada tinta é conferida contra AS DUAS superfícies.
  const base = declsDe(".artigo");
  afirmar(
    "`.artigo` não pinta o próprio fundo (herda a superfície do consumidor)",
    !base.has("background-color") && !base.has("background"),
    `encontrado: ${base.get("background-color") ?? base.get("background") ?? ""}`,
  );

  const superficies = [
    ["site público", fundoPublico],
    ["Painel", fundoPainel],
  ].filter(([, cor]) => Boolean(cor));

  const conferir = (rotulo, tinta, fundo, piso) => {
    const corTinta = resolver(tinta ?? "", root);
    const corFundo = resolver(fundo ?? "", root) ?? fundo;
    const razao = razaoContraste(corTinta ?? "", corFundo ?? "");
    if (razao === null) {
      afirmar(
        `${rotulo} ≥ ${piso.toFixed(1)}:1`,
        false,
        `cor não resolvida: ${corTinta ?? tinta} sobre ${corFundo ?? fundo}`,
      );
      return;
    }
    afirmar(
      `${rotulo} = ${razao.toFixed(2)}:1 (piso ${piso.toFixed(1)})`,
      razao >= piso,
      `${corTinta} sobre ${corFundo}`,
    );
  };

  /* Tintas que assentam sobre a superfície do consumidor. Piso de texto. */
  const link = declsDe(".artigo a");
  const tintasSobreSuperficie = [
    ["texto corrido", base.get("color")],
    ["título 2", declsDe(".artigo h2").get("color")],
    ["título 3", declsDe(".artigo h3").get("color")],
    ["negrito", declsDe(".artigo strong").get("color")],
    ["link", link.get("color")],
    ["link em hover", declsDe(".artigo a:hover").get("color")],
    ["citação", declsDe(".artigo blockquote").get("color")],
    ["marcador de lista", declsDe(".artigo li::marker").get("color")],
  ];
  for (const [rotulo, tinta] of tintasSobreSuperficie) {
    afirmar(`${rotulo}: cor declarada`, Boolean(tinta), "ausente");
    for (const [nomeSuperficie, cor] of superficies) {
      if (!tinta) continue;
      conferir(`${rotulo} sobre ${nomeSuperficie}`, tinta, cor, PISO_TEXTO);
    }
  }

  /* Tintas que assentam sobre fundo declarado pelo próprio artigo. */
  conferir(
    "código inline sobre o fundo do código inline",
    declsDe(".artigo code").get("color"),
    declsDe(".artigo code").get("background-color"),
    PISO_TEXTO,
  );
  conferir(
    "bloco de código sobre o fundo do bloco",
    declsDe(".artigo pre").get("color"),
    declsDe(".artigo pre").get("background-color"),
    PISO_TEXTO,
  );

  /* O DESTAQUE DE COR (Editor avançado): quatro pares novos, mesma disciplina
     do código — texto sobre um fundo que o PRÓPRIO elemento declara, não a
     superfície do consumidor. `.artigo mark` não define `color`: o texto
     destacado herda a tinta corrida do artigo (`base.get("color")`), e é
     ESSA tinta, não branco nem preto fixo, que precisa vencer cada uma das
     quatro cores pastel — CORES_DE_DESTAQUE, em `domain/blog/schema.js`, é o
     vocabulário fechado; os quatro seletores abaixo são a ÚNICA tradução
     para CSS que existe no projeto (mesmo comentário no próprio arquivo). */
  const CORES_DE_DESTAQUE = ["amarelo", "verde", "azul", "rosa"];
  for (const cor of CORES_DE_DESTAQUE) {
    /* SEM aspas no seletor: o minificador (Lightning CSS, via Tailwind v4)
       remove a aspa do valor do atributo quando ele já é um identificador
       CSS válido — `[data-cor=amarelo]`, não `[data-cor="amarelo"]` — no
       `dist/` compilado, que é o que `doArtigo` de fato leu. Medido contra o
       CSS gerado, não suposto: `data-alinhamento` já perde a aspa do mesmo
       jeito, mais adiante neste arquivo. */
    conferir(
      `destaque de cor "${cor}": texto sobre o próprio fundo`,
      base.get("color"),
      declsDe(`.artigo mark[data-cor=${cor}]`).get("background-color"),
      PISO_TEXTO,
    );
  }

  /* Marcas NÃO textuais que carregam significado sozinhas: a barra da
     citação, a régua do divisor, o sublinhado do link e os anéis de foco. É
     delas que a WCAG 1.4.11 fala, e o piso é 3:1.

     O fundo tênue do código inline fica fora desta lista de propósito: ele
     não carrega informação sozinho — quem informa é o texto sobre ele, e
     esse par já foi conferido acima com o piso de 4,5:1. Exigir 3:1 de um
     realce de fundo seria aplicar 1.4.11 onde ela não vale e forçaria uma
     cor que o texto sobre ela não sustentaria. */
  const corDoSublinhado =
    link.get("text-decoration-color") ??
    link.get("-webkit-text-decoration-color") ??
    corDo(link.get("text-decoration"));
  const marcas = [
    ["barra da citação", corDo(declsDe(".artigo blockquote").get("border-inline-start"))],
    ["régua do divisor", corDo(declsDe(".artigo hr").get("border-block-start"))],
    ["sublinhado do link", corDoSublinhado],
    ["anel de foco do link", corDo(declsDe(".artigo a:focus-visible").get("outline"))],
    ["anel de foco do bloco de código", corDo(declsDe(".artigo pre:focus-visible").get("outline"))],
  ];
  for (const [rotulo, cor] of marcas) {
    afirmar(`${rotulo}: cor declarada`, Boolean(cor), "ausente");
    for (const [nomeSuperficie, superficie] of superficies) {
      if (!cor) continue;
      conferir(`${rotulo} sobre ${nomeSuperficie}`, cor, superficie, PISO_NAO_TEXTO);
    }
  }

  /* O bloco de código precisa SER PERCEBIDO como bloco: a matriz pede
     "bloco com fundo". Um fundo quase igual à superfície cumpriria a letra e
     não a intenção. */
  for (const [nomeSuperficie, superficie] of superficies) {
    conferir(
      `fundo do bloco de código destaca-se da superfície do ${nomeSuperficie}`,
      declsDe(".artigo pre").get("background-color"),
      superficie,
      PISO_NAO_TEXTO,
    );
  }
}

/* ─── (g) Nenhuma cor crua; movimento reduzido intacto ───────────────── */

secao("(g) nenhuma cor de hex solto e movimento reduzido continua global");

if (temCss) {
  const cruas = [];
  for (const { seletor, decls } of doArtigo) {
    for (const [nome, valor] of decls) {
      if (!PROPRIEDADES_DE_COR.test(nome)) continue;
      for (const m of valor.matchAll(new RegExp(LITERAL_DE_COR.source, "g"))) {
        if (TRANSPARENTE.test(m[0])) continue;
        cruas.push(`${seletor} { ${nome}: ${valor} }`);
      }
    }
  }
  afirmar(
    "nenhuma cor do artigo sai de hex solto — tudo vem de token",
    cruas.length === 0,
    cruas.slice(0, 5).join(" | "),
  );
  // Piso: a lista de propriedades precisa alcançar as formas que o
  // compilador de fato emite, inclusive com prefixo de fornecedor. Uma
  // entrada que o leitor de CSS nunca produz é cobertura imaginária.
  afirmar(
    "a lista de propriedades de cor alcança prefixo de fornecedor e atalhos",
    PROPRIEDADES_DE_COR.test("-webkit-text-decoration-color") &&
      PROPRIEDADES_DE_COR.test("text-decoration") &&
      PROPRIEDADES_DE_COR.test("box-shadow") &&
      PROPRIEDADES_DE_COR.test("border-inline-start") &&
      !PROPRIEDADES_DE_COR.test("margin"),
  );
  afirmar(
    "e o leitor de CSS de fato produz nome com prefixo de fornecedor",
    new Map(declaracoes("-webkit-text-decoration-color: red")).has(
      "-webkit-text-decoration-color",
    ),
  );

  afirmar(
    "`prefers-reduced-motion` continua declarada globalmente",
    /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/.test(cssCompilado),
  );
  const animados = doArtigo.filter(
    ({ decls }) => decls.has("animation") || decls.has("animation-name"),
  );
  afirmar(
    "o artigo não introduz animação que a preferência global teria de conter",
    animados.length === 0,
    animados.map(({ seletor }) => seletor).join(" | "),
  );
}

/* ─── (h) Travas para o futuro ───────────────────────────────────────── */

secao("(h) travas: vocabulário do renderizador e aplicação de `.artigo`");

/* ─── O VOCABULÁRIO DO RENDERIZADOR, AGORA O DE VERDADE (Story 2.15) ────
 *
 * Até a Story 2.14 o "renderizador" que este bloco inventariava era o parser
 * artesanal dentro do `<article>` de `BlogPost.jsx`, e a divergência declarada
 * — `h1` e `h4` — dizia por escrito "some com o parser, na Story 2.15". O
 * parser saiu, e a declaração saiu junto: mantê-la faria a comparação por
 * igualdade acusar "declarada obsoleta", que é exatamente o que ela existe
 * para fazer.
 *
 * O inventário passou a apontar para o renderizador ÚNICO
 * (`src/render/blog/paraHtml.js`), que é quem de fato produz o `conteudo_html`
 * que as três telas mostram. E ele é EXECUTADO, não lido: `ETIQUETAS_EMITIDAS`
 * é importada e comparada por igualdade nos dois sentidos.
 *
 * `br` continua fora dos treze estilizados, e de propósito: quebra de linha não
 * tem aparência para declarar — não recebe cor, margem nem tipografia própria.
 * É a única divergência que sobra, e ela é declarada aqui pelo mesmo mecanismo
 * de antes: nem tolerância genérica, nem lista que se verifica a si mesma.
 *
 * **`br` NÃO é resíduo do parser.** As duas entradas antigas — `h1` e `h4` —
 * saíram inteiras com ele; esta é outra, e de outra natureza: `h1` e `h4` eram
 * elementos que o estilo DEVERIA cobrir e não cobria, e `br` é um elemento que
 * não tem aparência a declarar. Fica escrito aqui para o próximo leitor não
 * confundir uma coisa com a outra. */
const DIVERGENCIA_DECLARADA = {
  br: "quebra de linha não tem aparência a declarar — sem cor, sem margem, sem tipografia própria. Ela é estrutura dentro do parágrafo, e o parágrafo é quem está estilizado. Não é resto do parser: `h1` e `h4` saíram com ele.",
};
const ESTRUTURAIS = new Set(["article", "div", "span"]);

{
  const renderizador = await import(
    pathToFileURL(path.join(raiz, "src", "render", "blog", "paraHtml.js")).href
  ).then(
    (m) => m,
    (erro) => {
      afirmar(
        "o renderizador único (`src/render/blog/paraHtml.js`) importa",
        false,
        String(erro?.message ?? erro).slice(0, 200),
      );
      return null;
    },
  );

  if (renderizador) {
    afirmar("o renderizador único (`src/render/blog/paraHtml.js`) importa", true);
    const bruto = renderizador.ETIQUETAS_EMITIDAS;
    /* A GUARDA VEM ANTES DO USO. `ETIQUETAS_EMITIDAS` deixar de ser lista faz
       `[...bruto]` LANÇAR, e uma exceção aqui aborta a ferramenta inteira em
       vez de derrubar uma asserção — o veredito some, e "não rodou" é
       indistinguível de "não passou" para quem só olha o código de saída. */
    const eLista = Array.isArray(bruto);
    const emitidas = eLista ? bruto : [];

    // Piso: lista vazia faria TODA divergência desaparecer — a asserção
    // passaria no pior cenário, que é o renderizador não emitindo nada.
    afirmar(
      "o inventário do renderizador é uma lista, e não saiu vazio",
      eLista && emitidas.length > 0,
      `etiquetas: ${JSON.stringify(bruto)}`,
    );

    const semEstilo = [...emitidas].filter((t) => !ELEMENTOS.includes(t)).sort();
    const declarados = Object.keys(DIVERGENCIA_DECLARADA).sort();
    afirmar(
      "toda divergência entre o renderizador e o vocabulário estilizado está declarada, e nenhuma declarada está obsoleta",
      JSON.stringify(semEstilo) === JSON.stringify(declarados),
      `o renderizador emite sem estilo: [${semEstilo.join(", ")}] | declarado: [${declarados.join(", ")}]`,
    );
    for (const tag of semEstilo) {
      nota(`divergência conhecida \`${tag}\`: ${DIVERGENCIA_DECLARADA[tag] ?? "(não declarada)"}`);
    }
    // …e o outro sentido: todo elemento estilizado precisa ser um que o
    // renderizador emite. Estilo para um elemento que nunca chega ao HTML é
    // CSS morto, e é assim que a lista dos treze envelheceria em silêncio.
    const semRenderizador = ELEMENTOS.filter((t) => !emitidas.includes(t)).sort();
    afirmar(
      "e todo elemento estilizado é um que o renderizador de fato emite — nenhum estilo órfão",
      semRenderizador.length === 0,
      `estilizados sem emissor: [${semRenderizador.join(", ")}]`,
    );

    /* ─── Correção de UI/UX do Editor: `data-alinhamento` tem regra ──────
     * O renderizador (`paraHtml.js`) emite `data-alinhamento="center"`/
     * `"right"` em `<p>`, `<h2>` e `<h3>` — o HTML carrega o atributo, mas
     * sem regra em `.artigo` o navegador não desenha nada diferente. `left`
     * (o padrão) nunca é emitido, então não precisa — e não tem — regra. */
    afirmar(
      "`data-alinhamento` é um dos nomes de atributo que o renderizador declara emitir",
      Array.isArray(renderizador.ATRIBUTOS_EMITIDOS) &&
        renderizador.ATRIBUTOS_EMITIDOS.includes("data-alinhamento"),
      JSON.stringify(renderizador.ATRIBUTOS_EMITIDOS),
    );

    const doAlinhamento = doArtigo.filter(({ seletor }) => /data-alinhamento/.test(seletor));
    afirmar(
      "existe pelo menos uma regra `.artigo` mencionando `data-alinhamento`",
      doAlinhamento.length > 0,
      "nenhum seletor do CSS compilado menciona `data-alinhamento`",
    );

    for (const elemento of ["p", "h2", "h3"]) {
      for (const valor of ["center", "right"]) {
        const padrao = new RegExp(
          `^\\.artigo ${elemento}\\[data-alinhamento=["']?${valor}["']?\\]$`,
        );
        const regra = doAlinhamento.find(({ seletor }) => padrao.test(seletor.trim()));
        afirmar(
          `\`.artigo ${elemento}[data-alinhamento="${valor}"]\` existe e declara \`text-align: ${valor}\``,
          regra !== undefined && regra.decls.get("text-align") === valor,
          regra
            ? `seletor: ${regra.seletor} | text-align: ${regra.decls.get("text-align") ?? "ausente"}`
            : `regra não encontrada entre: ${doAlinhamento.map((r) => r.seletor).join(" | ")}`,
        );
      }
    }

    /* `left` não é emitido, e por isso não tem — nem precisa ter — regra. Uma
       regra para `data-alinhamento="left"` seria CSS morto: o atributo com
       esse valor nunca sai do renderizador (ver `alinhamentoEmitido`, em
       `paraHtml.js`), então nada no HTML publicado jamais casaria com ela. */
    afirmar(
      "não existe regra para `data-alinhamento=\"left\"` — o padrão nunca é emitido, e a regra seria morta",
      !doAlinhamento.some(({ seletor }) => /left/.test(seletor)),
      doAlinhamento.filter(({ seletor }) => /left/.test(seletor)).map((r) => r.seletor).join(" | "),
    );
  }
}

/* ─── O PARSER ARTESANAL SAIU, E A AUSÊNCIA É AFIRMADA ─────────────────
 *
 * A remoção é entrega desta story, e "a ausência não se prova sozinha": sem
 * esta asserção, alguém poderia reintroduzir um segundo renderizador dentro do
 * `<article>` e nada acusaria — o vocabulário do renderizador único continuaria
 * limpo enquanto a página emitisse `h4` por conta própria.
 *
 * A região do `<article>` continua sendo lida, mas o que se cobra dela mudou:
 * ela pode conter apenas elementos ESTRUTURAIS e elementos que o estilo cobre.
 * Um `h1` ou um `h4` escrito à mão ali dentro volta a falhar. */
{
  const blogPost = lerOuFalhar("src/pages/BlogPost.jsx legível", () =>
    ler(caminhoBlogPost),
  );
  if (blogPost) {
    /* COMENTÁRIO NÃO É REGIÃO. O cabeçalho do arquivo explica em prosa o parser
       que saiu, e a palavra `<article>` aparece ali dentro: sem mascarar, o
       recorte começava no comentário e engolia a página inteira — a asserção
       acusava `main`, `section` e `button` como se fossem conteúdo de artigo.
       Medido, não suposto: foi o primeiro resultado desta asserção. */
    const semComentarios = blogPost
      .replace(/\/\*[\s\S]*?\*\//g, (t) => t.replace(/[^\n]/g, " "))
      .replace(/(^|[^:\\])\/\/[^\n]*/g, (t, antes) =>
        antes + " ".repeat(t.length - antes.length),
      );
    const inicio = semComentarios.indexOf("<article");
    const fim = semComentarios.indexOf("</article>");
    const achou = afirmar(
      "a região do artigo em `src/pages/BlogPost.jsx` foi encontrada",
      inicio !== -1 && fim > inicio,
      "sem `<article>` a asserção seguinte passaria sobre uma região vazia",
    );
    const regiao = achou ? semComentarios.slice(inicio, fim) : "";

    /* ─── LISTA DE PERMISSÃO, E NÃO LISTA DE PROIBIÇÃO ──────────────────
     *
     * A primeira versão desta trava procurava os NOMES do parser que saiu —
     * `parseInline`, `flushUl`, os prefixos de Markdown. É a regra 3 do projeto
     * ao contrário: um segundo renderizador escrito à mão com outros nomes,
     * emitindo só `h2`, `h3` e `p`, passaria por ela e pela conferência de
     * elementos sem estilo. Lista de proibição sempre tem uma forma de evasão
     * que ninguém pensou ainda.
     *
     * O que existe agora é o vocabulário FECHADO do que a região pode conter:
     * o ponto de injeção, o ramo de artigo sem corpo, e mais nada. A comparação
     * é por igualdade nos DOIS sentidos — um nome novo falha, e um nome
     * declarado que sumiu também.
     *
     * Um renderizador artesanal precisa de nomes que não estão nesta lista:
     * `map`, `split`, `push`, `slice`, `key`, `forEach`, e os elementos que ele
     * constrói. Nenhum deles entra sem esta asserção acusar.
     */
    const VOCABULARIO_DA_REGIAO = [
      "article",
      "className",
      "html",
      "trim",
      "p",
      "data-papel",
      "ARTIGO_SEM_CONTEUDO",
      "div",
      "dangerouslySetInnerHTML",
      "__html",
    ].sort();

    /** Os nomes de uma região de JSX, com literal de texto mascarado. */
    const nomesDe = (texto) => {
      const semLiteral = String(texto)
        .replace(/"[^"]*"/g, '""')
        .replace(/'[^']*'/g, "''")
        .replace(/`[^`]*`/g, "``");
      return [...new Set(semLiteral.match(/[A-Za-z_$][\w$-]*/g) ?? [])].sort();
    };

    const nomes = nomesDe(regiao);
    afirmar(
      "o `<article>` da página pública contém EXATAMENTE o vocabulário declarado — o ponto de injeção, o ramo sem corpo, e nada mais",
      achou && JSON.stringify(nomes) === JSON.stringify(VOCABULARIO_DA_REGIAO),
      `na região: [${nomes.join(", ")}] | declarado: [${VOCABULARIO_DA_REGIAO.join(", ")}]`,
    );
    afirmar(
      "e a região tem UM ponto de injeção — nem zero (o artigo sumiria) nem dois",
      (regiao.match(/dangerouslySetInnerHTML/g) ?? []).length === 1,
      `encontrados: ${(regiao.match(/dangerouslySetInnerHTML/g) ?? []).length}`,
    );

    /* AUTOTESTE do detector, nos dois sentidos. Sem ele, um erro na extração
       devolveria conjunto vazio dos dois lados e a asserção passaria por
       vacuidade — verde justamente sobre o parser de volta. */
    {
      const artesanal = [
        '<article className="mb-16">',
        "  {post.conteudo.split(String.fromCharCode(10)).map((linha, i) =>",
        '    linha.startsWith(String.fromCharCode(35)) ? <h2 key={i}>{linha}</h2> : <p key={i}>{linha}</p>,',
        "  )}",
      ].join("\n");
      const doArtesanal = nomesDe(artesanal);
      afirmar(
        "autoteste: um renderizador artesanal plantado na região é ACUSADO — os nomes dele não estão no vocabulário",
        JSON.stringify(doArtesanal) !== JSON.stringify(VOCABULARIO_DA_REGIAO) &&
          ["map", "split", "startsWith", "key"].every((n) => doArtesanal.includes(n)),
        `nomes do artesanal: [${doArtesanal.join(", ")}]`,
      );
      afirmar(
        "autoteste: e literal de texto não vira nome — a classe dentro das aspas não entra no vocabulário",
        !nomesDe('<div className="prosa artigo mb-16" />').includes("prosa"),
        JSON.stringify(nomesDe('<div className="prosa artigo" />')),
      );
    }

    /* E o inventário de ELEMENTOS continua valendo, por outro caminho: mesmo
       dentro do vocabulário fechado, um elemento sem estilo seria defeito. */
    const emitidos = [
      ...new Set(
        [...regiao.matchAll(/<([a-z][a-z0-9]*)\b/g)]
          .map((m) => m[1])
          .filter((t) => !ESTRUTURAIS.has(t)),
      ),
    ].sort();
    const foraDoEstilo = emitidos.filter((t) => !ELEMENTOS.includes(t));
    afirmar(
      "o `<article>` da página pública não emite elemento fora do estilo",
      achou && foraDoEstilo.length === 0,
      `emitidos na região: [${emitidos.join(", ")}] | fora do estilo: [${foraDoEstilo.join(", ")}]`,
    );
  }
}

/* A TRAVA DE ADOÇÃO, QUE AGORA MORDE.
   Ela nasceu na Story 2.3 passando por AUSÊNCIA: o estilo existia e nenhuma
   tela o consumia, então "todo ponto que injeta HTML de artigo envolve o
   conteúdo em `.artigo`" era verdade sobre zero pontos — e verdade por vácuo é
   a que some sem avisar. A pré-visualização da Story 2.13 é o primeiro ponto de
   injeção do projeto, e daqui em diante a trava tem objeto: além de exigir o
   invólucro, ela exige que o objeto EXISTA. */
{
  /* ─── O RECORTE DA TAG NÃO PODE SER "DO `<` ANTERIOR AO `>` SEGUINTE" ───
     Aquele recorte quebra de três jeitos, e os três são plausíveis no JSX real:
     um atributo anterior que contenha `<` move o começo; uma expressão de
     `__html` que contenha `>` move o fim; e uma tag escrita em cinco linhas —
     que é a forma normal — só era exercitada em UMA linha pelo autoteste.

     O que existe aqui é um leitor pequeno de tag, que anda pelo texto sabendo
     quando está dentro de aspas e quando está dentro de chaves. Ele devolve a
     tag de abertura inteira, com as chaves balanceadas. */
  const mascararComentarios = (fonte) =>
    fonte
      .replace(/\/\*[\s\S]*?\*\//g, (t) => t.replace(/[^\n]/g, " "))
      .replace(/(^|[^:\\])\/\/[^\n]*/g, (t, antes) =>
        antes + " ".repeat(t.length - antes.length),
      );

  /**
   * O fim da tag de abertura que começa em `inicio`, ou -1.
   *
   * `>` dentro de aspas ou dentro de `{...}` não fecha tag nenhuma — é o que
   * faz `{{ __html: a > b }}` deixar de truncar o recorte.
   */
  const fimDaTag = (fonte, inicio) => {
    let aspas = null;
    let chaves = 0;
    for (let i = inicio + 1; i < fonte.length; i += 1) {
      const c = fonte[i];
      if (aspas !== null) {
        if (c === "\\") i += 1;
        else if (c === aspas) aspas = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        aspas = c;
        continue;
      }
      if (c === "{") chaves += 1;
      else if (c === "}") chaves -= 1;
      else if (c === ">" && chaves === 0) return i;
    }
    return -1;
  };

  /** Todas as tags de abertura do arquivo, com onde começam e onde terminam. */
  const tagsDe = (fonte) => {
    const achadas = [];
    for (let i = 0; i < fonte.length; i += 1) {
      if (fonte[i] !== "<") continue;
      const seguinte = fonte[i + 1] ?? "";
      const fechamento = seguinte === "/";
      const nome = /^[A-Za-z][\w.-]*/.exec(fonte.slice(fechamento ? i + 2 : i + 1))?.[0];
      if (!nome) continue;
      const fim = fimDaTag(fonte, i);
      if (fim === -1) continue;
      const texto = fonte.slice(i, fim + 1);
      achadas.push({
        nome,
        inicio: i,
        fim,
        texto,
        fechamento,
        autofechada: /\/\s*>$/.test(texto),
      });
      i = fim;
    }
    return achadas;
  };

  /* O invólucro é a CLASSE do elemento, e não a tag inteira.
     Medido, não suposto: com o julgamento sobre a tag inteira, trocar
     `className="artigo"` por `className="prosa"` mantinha a asserção verde —
     porque `data-papel="artigo"`, um atributo de teste na mesma tag, contém a
     palavra. O estilo do artigo vem da CLASSE; é a classe que precisa ser lida.
     Classe montada por variável, sem literal, não é reconhecida de propósito:
     ela vira "solto" e a asserção FALHA, que é o lado seguro do engano. */
  const CLASSE_NA_TAG = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([\s\S]*?)\})/;
  const envolveEmArtigo = (tag) => {
    const achado = CLASSE_NA_TAG.exec(tag ?? "");
    if (achado === null) return false;
    const classe = achado[1] ?? achado[2] ?? achado[3] ?? "";
    return /(^|[^\w-])artigo([^\w-]|$)/.test(classe);
  };

  /**
   * Os pontos de injeção de um arquivo, cada um já julgado.
   *
   * O invólucro vale no PRÓPRIO elemento ou em qualquer ANCESTRAL: `.artigo`
   * estiliza descendentes, então um artigo dentro de uma seção que já veste a
   * classe está corretamente vestido. Reportar isso como solto seria a trava
   * acusando o que ela existe para aprovar.
   */
  const injecoesDe = (bruto) => {
    const fonte = mascararComentarios(bruto);
    const tags = tagsDe(fonte);
    const pontos = [];
    for (const m of fonte.matchAll(/dangerouslySetInnerHTML/g)) {
      const propria = tags.find((t) => t.inicio < m.index && m.index < t.fim);
      const pilha = [];
      for (const t of tags) {
        if (t.inicio >= (propria?.inicio ?? m.index)) break;
        if (t.fechamento) pilha.pop();
        else if (!t.autofechada) pilha.push(t);
      }
      const ancestrais = pilha.filter((t) => t.fim < (propria?.inicio ?? m.index));
      pontos.push({
        tag: (propria?.texto ?? "").trim().replace(/\s+/g, " ").slice(0, 90),
        naPropria: envolveEmArtigo(propria?.texto),
        emAncestral: ancestrais.some((t) => envolveEmArtigo(t.texto)),
        get envolvido() {
          return this.naPropria || this.emAncestral;
        },
      });
    }
    return pontos;
  };

  const pontos = [];
  for (const arquivo of fontesDeSrc()) {
    let fonte;
    try {
      fonte = readFileSync(arquivo, "utf8");
    } catch {
      continue;
    }
    for (const ponto of injecoesDe(fonte)) {
      pontos.push({ ...ponto, envolvido: ponto.envolvido, arquivo: path.relative(raiz, arquivo) });
    }
  }
  const soltos = pontos.filter((p) => !p.envolvido);
  nota(`${pontos.length} ponto(s) de renderização de artigo encontrados`);

  /* A trava deixou de passar por ausência: existem DOIS pontos de injeção para
     ela julgar. Sem estas linhas, apagar as duas telas devolveria a asserção
     abaixo ao vácuo — verde, e sem verificar nada.

     São dois desde a Story 2.15: a prévia sob o Painel e o artigo do site
     público. Os dois mostram o MESMO `conteudo_html` gravado, e é por isso que
     "o que se vê é o que sairá" é verdade — não por coincidência de código. */
  const caminhosEsperados = [
    "src/admin/blog/PreVisualizacaoDePost.jsx",
    "src/pages/BlogPost.jsx",
  ];
  afirmar(
    "existe ao menos um ponto de injeção de HTML de artigo — a trava tem objeto, e não passa mais por ausência",
    pontos.length > 0,
    "zero pontos é a asserção seguinte passando por vácuo",
  );
  const arquivosComInjecao = new Set(
    pontos.map((p) => p.arquivo.replace(/\\/g, "/")),
  );
  const faltando = caminhosEsperados.filter(
    (alvo) => ![...arquivosComInjecao].some((a) => a.endsWith(alvo)),
  );
  afirmar(
    "e as DUAS telas que mostram artigo estão entre eles — a prévia do Painel e o artigo do site público",
    faltando.length === 0,
    `faltando: ${faltando.join(", ")} | encontrados: ${[...arquivosComInjecao].join(" | ")}`,
  );

  afirmar(
    "todo ponto que injeta HTML de artigo envolve o conteúdo em `.artigo`",
    soltos.length === 0,
    soltos.map((p) => `${p.arquivo}: ${p.tag}`).join(" | "),
  );

  /* ─── AUTOTESTE DO LEITOR E DO DETECTOR ────────────────────────────────
     Uma trava que nunca acusou nada é indistinguível de uma trava quebrada, e
     esta já passou verde sobre uma sabotagem real. Os casos abaixo cobrem os
     dois sentidos, a tag multilinha (que é a forma do código de verdade) e os
     três modos de erro do recorte antigo. */
  {
    afirmar(
      "o detector de invólucro reconhece o envoltório de verdade e ACUSA a injeção sem ele",
      envolveEmArtigo('<div className="artigo" dangerouslySetInnerHTML={{ __html: html }}>') &&
        envolveEmArtigo('<div className={cn("prosa artigo", extra)} dangerouslySetInnerHTML=>') &&
        !envolveEmArtigo("<div dangerouslySetInnerHTML={{ __html: html }}>") &&
        !envolveEmArtigo('<div className="artigos" dangerouslySetInnerHTML=>') &&
        !envolveEmArtigo('<div className="meu-artigoX" dangerouslySetInnerHTML=>'),
    );
    /* O FALSO POSITIVO QUE ELE JÁ TEVE, fixado por asserção. A versão anterior
       julgava a TAG INTEIRA: um atributo de teste chamado `artigo` no mesmo
       elemento aprovava uma injeção sem invólucro nenhum. */
    afirmar(
      "e um atributo qualquer chamado `artigo` NÃO conta como invólucro — quem estiliza é a classe",
      !envolveEmArtigo(
        '<div data-papel="artigo" className="prosa" dangerouslySetInnerHTML={{ __html: html }}>',
      ) &&
        envolveEmArtigo(
          '<div data-papel="artigo" className="artigo" dangerouslySetInnerHTML={{ __html: html }}>',
        ),
    );

    const multilinha = [
      "export function Tela() {",
      "  return (",
      "    <div",
      '      data-papel="artigo"',
      '      className="artigo"',
      "      dangerouslySetInnerHTML={{ __html: html }}",
      "    />",
      "  );",
      "}",
    ].join("\n");
    afirmar(
      "o leitor enxerga a tag ESCRITA EM VÁRIAS LINHAS — que é a forma do código de verdade, e a que o autoteste antigo nunca exercitou",
      injecoesDe(multilinha).length === 1 && injecoesDe(multilinha)[0].envolvido === true,
      JSON.stringify(injecoesDe(multilinha)),
    );
    afirmar(
      "e a mesma tag multilinha SEM a classe é acusada",
      injecoesDe(multilinha.replace('className="artigo"', 'className="prosa"'))[0]
        .envolvido === false,
    );

    /* MODO DE ERRO 1: um atributo anterior com `<` movia o começo do recorte. */
    const comMenorAntes =
      '<div title="a < b" className="artigo" dangerouslySetInnerHTML={{ __html: h }} />';
    afirmar(
      "um `<` dentro de um atributo anterior não desloca o recorte da tag",
      injecoesDe(comMenorAntes)[0]?.envolvido === true,
      JSON.stringify(injecoesDe(comMenorAntes)),
    );

    /* MODO DE ERRO 2: um `>` dentro da expressão truncava a tag. */
    const comMaiorNaExpressao =
      '<div dangerouslySetInnerHTML={{ __html: a > b ? x : y }} className="artigo" />';
    afirmar(
      "um `>` dentro da expressão de `__html` não trunca a tag antes da classe",
      injecoesDe(comMaiorNaExpressao)[0]?.envolvido === true,
      JSON.stringify(injecoesDe(comMaiorNaExpressao)),
    );

    /* MODO DE ERRO 3: `.artigo` num ANCESTRAL estiliza certo, e era acusado. */
    const emAncestral = [
      '<section className="artigo">',
      "  <div dangerouslySetInnerHTML={{ __html: html }} />",
      "</section>",
    ].join("\n");
    afirmar(
      "`.artigo` num ANCESTRAL conta como invólucro — a classe estiliza descendentes, e acusá-la seria a trava recusando o que ela aprova",
      injecoesDe(emAncestral)[0]?.envolvido === true &&
        injecoesDe(emAncestral)[0]?.naPropria === false,
      JSON.stringify(injecoesDe(emAncestral)),
    );
    afirmar(
      "mas um IRMÃO com a classe não conta — ele não envolve nada",
      injecoesDe(
        [
          "<section>",
          '  <div className="artigo" />',
          "  <div dangerouslySetInnerHTML={{ __html: html }} />",
          "</section>",
        ].join("\n"),
      )[0]?.envolvido === false,
    );
    afirmar(
      "e injeção dentro de comentário não conta como ponto — comentário não renderiza nada",
      injecoesDe(
        '/* <div dangerouslySetInnerHTML={{ __html: h }} /> */\nconst x = 1;',
      ).length === 0,
    );
  }
}

/* ─── Veredito ───────────────────────────────────────────────────────── */

console.log("");
if (falhas === 0) {
  console.log("Estilo do artigo verificado: todas as asserções passaram.");
  process.exitCode = 0;
} else {
  console.log(`Estilo do artigo NÃO verificado: ${falhas} asserção(ões) falharam.`);
  process.exitCode = 1;
}
