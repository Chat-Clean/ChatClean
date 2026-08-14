#!/usr/bin/env node
/**
 * Ferramenta de verificação da barra superior e dos padrões transversais de
 * interface (Stories 1.5 e 1.6).
 *
 * Mesmo contrato das anteriores: uma linha por asserção, código 0 se todas
 * passarem, 1 caso contrário. Uma asserção por linha da matriz de I/O — e para
 * o que é comportamento, a função é **executada**, não lida.
 *
 * Esta ferramenta NÃO repete o que a da Story 1.1 já afirma (contraste dos 13
 * pares, os três raios, não-regressão do site público). Cobre o que é desta
 * entrega:
 *
 *   (a) a barra: logo real presente em disco, sem contorno, sem `emerald`,
 *       fora de `AdminBlog.jsx` e sem conhecer domínio;
 *   (b) Restaurar: a decisão de qual aba a oferece, EXECUTADA;
 *   (c) o anel de foco: declarado uma vez, aplicado a todo elemento
 *       interativo da barra, sobrevivendo ao build, e VISÍVEL sobre a cromia
 *       (contraste calculado, não prometido);
 *   (d) notificação: `sonner` montado uma vez só, com a voz certa;
 *   (e) confirmação: o diálogo do sistema, com Cancelar no foco inicial e
 *       rótulo que nomeia a ação; o modal artesanal fora do repositório;
 *   (f) Estado: vocabulário fechado EXECUTADO — quatro palavras, um par de
 *       cor cada, falha alto para desconhecido, sem sinônimo em superfície
 *       alguma;
 *   (g) dado: `.dado` declarada, compilada e usada; formatação EXECUTADA,
 *       inclusive sob fuso de máquina diferente;
 *   (h) o que não pode regredir: `prefers-reduced-motion` global, alvo de
 *       toque, raios da direção e nenhuma cor crua no código novo.
 *
 * Uso: npm run build && npm run verificar:interface
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

/** Executa `acao` e afirma que ela LANÇA. O oposto também é asserção. */
function afirmarQueLanca(descricao, acao, detalhe = "") {
  let lancou = false;
  try {
    acao();
  } catch {
    lancou = true;
  }
  return afirmar(descricao, lancou, detalhe || "não lançou");
}

function ler(caminho) {
  return readFileSync(caminho, "utf8");
}

function lerOuFalhar(caminhoRelativo) {
  const completo = path.join(raiz, caminhoRelativo);
  try {
    const texto = ler(completo);
    afirmar(`${caminhoRelativo} legível`, true);
    return texto;
  } catch (erro) {
    afirmar(`${caminhoRelativo} legível`, false, erro.message);
    return null;
  }
}

/**
 * Remove comentários antes de procurar cor crua ou classe proibida.
 *
 * Sem isto, a própria explicação de POR QUE uma cor foi escolhida — que cita o
 * hex — seria acusada de ser a cor solta que ela justifica, e o caminho de
 * menor resistência viraria apagar o comentário.
 *
 * **Precisa saber o que é string, e a versão ingênua não sabia.** Um
 * `/\*[\s\S]*?\*\//` cru trata `accept="image/*"` como abertura de comentário e
 * apaga tudo até o próximo fechamento de bloco de verdade — no `AdminBlog.jsx` isso comia
 * cinquenta linhas, incluindo o contador de caracteres. E apagar fonte em
 * silêncio não faz asserção falhar: faz asserção passar por vacuidade, que é o
 * pior defeito que uma ferramenta de verificação pode ter. Por isso o
 * varredor anda caractere a caractere e ignora o que está dentro de aspas.
 *
 * As quebras de linha dos comentários removidos são preservadas, para que o
 * número de linha relatado continue sendo o do arquivo.
 */
function semComentarios(texto) {
  let saida = "";
  let delimitador = null;
  let i = 0;

  while (i < texto.length) {
    const c = texto[i];
    const proximo = texto[i + 1];

    if (delimitador !== null) {
      saida += c;
      if (c === "\\") {
        saida += proximo ?? "";
        i += 2;
        continue;
      }
      if (c === delimitador) delimitador = null;
      i += 1;
      continue;
    }

    if (c === '"' || c === "'" || c === "`") {
      delimitador = c;
      saida += c;
      i += 1;
      continue;
    }

    if (c === "/" && proximo === "*") {
      const fim = texto.indexOf("*/", i + 2);
      const trecho = texto.slice(i, fim === -1 ? texto.length : fim + 2);
      saida += trecho.replace(/[^\n]/g, "");
      i = fim === -1 ? texto.length : fim + 2;
      continue;
    }

    if (c === "/" && proximo === "/") {
      const fim = texto.indexOf("\n", i);
      i = fim === -1 ? texto.length : fim;
      continue;
    }

    saida += c;
    i += 1;
  }

  return saida;
}

function arquivosDe(dir, extensoes) {
  const achados = [];
  const andar = (atual) => {
    let entradas;
    try {
      entradas = readdirSync(atual, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      const completo = path.join(atual, e.name);
      if (e.isDirectory()) andar(completo);
      else if (extensoes.some((ext) => e.name.endsWith(ext))) achados.push(completo);
    }
  };
  andar(dir);
  return achados;
}

const rel = (p) => path.relative(raiz, p).split(path.sep).join("/");

function ocorrencias(arquivos, padrao, transformar = (t) => t) {
  const achados = [];
  for (const arquivo of arquivos) {
    let texto;
    try {
      texto = transformar(ler(arquivo));
    } catch {
      continue;
    }
    texto.split(/\r?\n/).forEach((linha, i) => {
      if (padrao.test(linha)) achados.push(`${rel(arquivo)}:${i + 1}`);
    });
  }
  return achados;
}

/** Quantas vezes um padrão global casa num texto. */
function contar(texto, padrao) {
  return (texto.match(padrao) ?? []).length;
}

/**
 * A tag de abertura do elemento JSX que envolve `indice`.
 *
 * Existe porque contar ocorrências no arquivo inteiro não sabe ONDE elas estão:
 * "a classe aparece 3 vezes e há 3 elementos" continua verde se as 3 estiverem
 * no mesmo elemento e um terceiro ficar sem nada. Fatiar por elemento é o que
 * transforma a soma em asserção.
 */
function tagQueContem(texto, indice) {
  let inicio = -1;
  for (let i = indice; i >= 0; i -= 1) {
    if (texto[i] === "<" && /[A-Za-z]/.test(texto[i + 1] ?? "")) {
      inicio = i;
      break;
    }
  }
  if (inicio === -1) return null;

  let profundidade = 0;
  for (let i = inicio; i < texto.length; i += 1) {
    const c = texto[i];
    if (c === "{" || c === "(") profundidade += 1;
    else if (c === "}" || c === ")") profundidade -= 1;
    else if (c === ">" && profundidade === 0) return texto.slice(inicio, i + 1);
  }
  return null;
}

/**
 * Todas as tags de abertura de um tipo (`button`, `Link`), uma a uma, para que
 * cada elemento possa ser afirmado por si — e nomeado quando falhar.
 */
function tagsDe(texto, nomes) {
  const achadas = [];
  for (const nome of nomes) {
    const padrao = new RegExp(`<${nome}\\b`, "g");
    let casou;
    while ((casou = padrao.exec(texto)) !== null) {
      const tag = tagQueContem(texto, casou.index);
      if (tag) achadas.push({ nome, tag });
    }
  }
  return achadas;
}

/**
 * O corpo da função que contém `indice`.
 *
 * Sobe do ponto até a chave que abre o bloco mais interno e, se esse bloco não
 * for corpo de função (é um `if`, um objeto), continua subindo. Devolve o corpo
 * inteiro, para que se possa perguntar o que MAIS acontece dentro dele.
 */
function corpoDaFuncaoQueContem(texto, indice) {
  let posicao = indice;
  for (let tentativa = 0; tentativa < 12; tentativa += 1) {
    let saltos = 0;
    let abertura = -1;
    for (let i = posicao; i >= 0; i -= 1) {
      const c = texto[i];
      if (c === "}") saltos += 1;
      else if (c === "{") {
        if (saltos === 0) {
          abertura = i;
          break;
        }
        saltos -= 1;
      }
    }
    if (abertura === -1) return null;

    const antes = texto.slice(Math.max(0, abertura - 40), abertura);
    const ehCorpoDeFuncao = /(=>|\)|function[\w\s]*\([^)]*\))\s*$/.test(antes);

    if (ehCorpoDeFuncao) {
      let profundidade = 0;
      for (let i = abertura; i < texto.length; i += 1) {
        if (texto[i] === "{") profundidade += 1;
        else if (texto[i] === "}") {
          profundidade -= 1;
          if (profundidade === 0) return texto.slice(abertura, i + 1);
        }
      }
      return null;
    }
    posicao = abertura - 1;
  }
  return null;
}

/* ─── Contraste WCAG 2.1 ─────────────────────────────────────────────── */

function canal(v) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminancia(hex) {
  // Três dígitos também: o minificador do build encurta `#ffffff` para `#fff`,
  // e ler só a forma longa faria a asserção de contraste sumir justamente no
  // artefato publicado.
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const bruto =
    m[1].length === 3
      ? m[1]
          .split("")
          .map((d) => d + d)
          .join("")
      : m[1];
  const n = parseInt(bruto, 16);
  return (
    0.2126 * canal((n >> 16) & 255) +
    0.7152 * canal((n >> 8) & 255) +
    0.0722 * canal(n & 255)
  );
}

function contraste(a, b) {
  const la = luminancia(a);
  const lb = luminancia(b);
  if (la === null || lb === null) return null;
  const [claro, escuro] = la > lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (escuro + 0.05);
}

/* ─── Artefatos ──────────────────────────────────────────────────────── */

const DIR_SRC = path.join(raiz, "src");
const DIR_DIST = path.join(raiz, "dist");

const CAMINHO_BARRA = "src/admin/shell/BarraSuperior.jsx";
const CAMINHO_FOCO = "src/admin/shell/foco.js";
const CAMINHO_NOTIFICACOES = "src/admin/shell/Notificacoes.jsx";
const CAMINHO_DIALOGO = "src/admin/shell/DialogoDeConfirmacao.jsx";
const CAMINHO_MENU = "src/admin/shell/MenuDoAutor.jsx";
const CAMINHO_PILULA = "src/admin/blog/PilulaDeEstado.jsx";
const CAMINHO_ESTADOS = "src/domain/blog/estados.js";
const CAMINHO_FORMATO = "src/domain/blog/formato.js";
const CAMINHO_PAGINA = "src/pages/AdminBlog.jsx";
const CAMINHO_PORTAO = "src/admin/shell/PortaoDeSessao.jsx";
const CAMINHO_VOZ = "src/admin/shell/voz.js";
const CAMINHO_LIMITE = "src/admin/shell/LimiteDeErro.jsx";
const CAMINHO_ALERT_DIALOG = "src/components/ui/alert-dialog.jsx";
const CAMINHO_APP_CSS = "src/App.css";
const CAMINHO_INDEX_CSS = "src/index.css";
const LOGO = "chatclean-white.svg";

/** Os arquivos que esta entrega escreve. Cor crua e raio solto valem para eles. */
const ARQUIVOS_NOVOS = [
  CAMINHO_BARRA,
  CAMINHO_FOCO,
  CAMINHO_VOZ,
  CAMINHO_LIMITE,
  CAMINHO_NOTIFICACOES,
  CAMINHO_DIALOGO,
  CAMINHO_PILULA,
  CAMINHO_ESTADOS,
  CAMINHO_FORMATO,
  CAMINHO_MENU,
];

function acharCssCompilado() {
  const dir = path.join(DIR_DIST, "assets");
  if (!existsSync(dir)) return null;
  const css = readdirSync(dir).filter((n) => n.endsWith(".css"));
  return css.length > 0 ? path.join(dir, css[0]) : null;
}

const arquivoCss = acharCssCompilado();
const cssCompilado = arquivoCss ? ler(arquivoCss) : null;

const barra = lerOuFalhar(CAMINHO_BARRA);
const pagina = lerOuFalhar(CAMINHO_PAGINA);
const notificacoes = lerOuFalhar(CAMINHO_NOTIFICACOES);
const dialogo = lerOuFalhar(CAMINHO_DIALOGO);
const menu = lerOuFalhar(CAMINHO_MENU);
const pilula = lerOuFalhar(CAMINHO_PILULA);
const appCss = lerOuFalhar(CAMINHO_APP_CSS);
const indexCss = lerOuFalhar(CAMINHO_INDEX_CSS);

/* ═════════════════════════════════════════════════════════════════════ */

secao("(a0) a ferramenta antes do que ela audita");

/*
 * O varredor de comentários é pré-requisito de quase tudo que vem depois. Se
 * ele apagar código por engano, as asserções seguintes passam por vacuidade —
 * exatamente o que acontecia enquanto `accept="image/*"` era lido como abertura
 * de comentário. Aqui ele é exercitado antes de ser usado.
 */
{
  const comStringQueParece = 'const a = 1;\n<input accept="image/*" />\nconst fim = 2;';
  const limpo = semComentarios(comStringQueParece);
  afirmar(
    "varredor: `image/*` dentro de aspas não abre comentário",
    limpo.includes("accept=\"image/*\"") && limpo.includes("const fim = 2;"),
    JSON.stringify(limpo),
  );
  afirmar(
    "varredor: comentário de bloco de verdade é removido",
    !semComentarios("a /* fora */ b").includes("fora"),
  );
  afirmar(
    "varredor: comentário de linha de verdade é removido",
    !semComentarios("a // fora\nb").includes("fora") &&
      semComentarios("a // fora\nb").includes("b"),
  );
  afirmar(
    "varredor: `//` dentro de aspas sobrevive",
    semComentarios('const u = "https://exemplo.com/x";').includes("//exemplo.com/x"),
  );
  afirmar(
    "varredor: numeração de linha não escorrega",
    semComentarios("a\n/* um\ndois */\nb").split("\n").length === 4,
  );

  /* Guarda contra vacuidade: âncoras de código que PRECISAM sobreviver ao
     varredor. Uma delas sumir significa que o resto da auditoria está lendo um
     arquivo mutilado — e passando por isso. */
  if (pagina) {
    const limpaPagina = semComentarios(pagina);
    const ANCORAS = [
      "} caracteres",
      "savePost(",
      "saveVaga(",
      'role="tabpanel"',
      "<BarraSuperior",
      "<DialogoDeConfirmacao",
    ];
    const sumiram = ANCORAS.filter((a) => !limpaPagina.includes(a));
    afirmar(
      "nenhuma âncora de código desaparece ao remover comentários da página",
      sumiram.length === 0,
      `sumiram: ${sumiram.join(", ")}`,
    );
  }
}

secao("(a) a barra superior");

afirmar(
  "há CSS compilado para auditar (`npm run build` rodou)",
  cssCompilado !== null,
  "sem dist/assets/*.css nada abaixo prova que a classe chegou à tela",
);

/* Logo real: referenciada E presente em disco. Referência sozinha é promessa —
   um caminho errado dá alt-text em produção e ninguém percebe no code review. */
if (barra) {
  afirmar(
    "a barra referencia a logo real `/chatclean-white.svg`",
    barra.includes(`/${LOGO}`),
  );
  const arquivoDaLogo = path.join(raiz, "public", LOGO);
  const existeLogo = afirmar(
    `public/${LOGO} existe`,
    existsSync(arquivoDaLogo),
  );
  if (existeLogo) {
    const svg = ler(arquivoDaLogo);
    afirmar(
      `public/${LOGO} é um SVG de verdade e não está vazio`,
      svg.length > 100 && /<svg[\s>]/i.test(svg),
      `${svg.length} bytes`,
    );
  }
  afirmar(
    "a barra usa `<img>` para a logo, não um `div` com letras",
    /<img\b[^>]*chatclean-white\.svg/.test(barra) &&
      !/>\s*CC\s*</.test(barra),
  );
}

/* A logo falsa e a barra antiga saíram da página. */
if (pagina) {
  const semRastro = [
    ['o quadrado com "CC"', />\s*CC\s*</],
    ['o título "Admin ChatClean"', /Admin ChatClean/],
    ['o botão contornado "Ver Blog"', /Ver Blog/],
    ['o botão contornado "Ver Carreiras"', /Ver Carreiras/],
  ];
  for (const [nome, padrao] of semRastro) {
    afirmar(`${nome} não existe mais em ${CAMINHO_PAGINA}`, !padrao.test(pagina));
  }
  afirmar(
    "a página monta `<BarraSuperior`, em vez de desenhar a barra",
    /<BarraSuperior\b/.test(pagina) &&
      /from\s+["']@\/admin\/shell\/BarraSuperior["']/.test(pagina),
  );
}

/* Sem contorno e sem `emerald` NA BARRA. O corpo do Painel continua como está
   — reconstruí-lo é do Épico 2, e a story proíbe expressamente antecipá-lo. */
if (barra) {
  const codigo = semComentarios(barra);
  afirmar(
    "a barra não tem botão contornado (`border`)",
    !/\bborder(-\d|\b)(?!-(soft|strong))/.test(codigo) &&
      !/\bborder-(zinc|emerald|white|black)\b/.test(codigo),
    (codigo.match(/\bborder[\w-]*/g) ?? []).join(", "),
  );
  afirmar(
    "a barra não usa `emerald`",
    !/emerald/i.test(codigo),
  );
  afirmar(
    "a barra não usa `zinc`",
    !/\bzinc-/i.test(codigo),
  );
  afirmar(
    "a barra veste a cromia da marca por token",
    /bg-brand-chrome/.test(codigo),
  );
}

/* A casca não conhece domínio (AD-15): a barra recebe abas e ações, não sabe o
   que é Post nem o que é Vaga, e nem sequer conhece a palavra Restaurar. */
if (barra) {
  const codigo = semComentarios(barra);
  afirmar(
    "a barra não conhece Post, Vaga nem seus armazenamentos",
    !/\b(blogStore|vagasStore|getPosts|getVagas|Post\b|Vaga\b)/.test(codigo),
  );
  afirmar(
    "a barra não importa de `pages/` nem de `admin/blog/`",
    !/from\s+["']@?\/?(\.\.\/)*(src\/)?(pages|admin\/blog)\//.test(codigo),
  );
  afirmar(
    "a barra não escreve Restaurar — recebe as ações da aba por propriedade",
    !/Restaurar/i.test(codigo) && /acoesDaAba\.map\(/.test(codigo),
  );
}

/* ═════════════════════════════════════════════════════════════════════ */

secao("(b) Restaurar: a decisão de qual aba a oferece, executada");

if (pagina) {
  /*
   * Não é `grep`. O trecho que decide é extraído da página e EXECUTADO com
   * cada valor de aba. Uma condição invertida, um `||` no lugar de um `===` ou
   * um `activeTab` trocado passariam por qualquer regex e falham aqui.
   */
  const extrairDeclaracao = (texto, nome) => {
    const inicio = texto.indexOf(`const ${nome} =`);
    if (inicio === -1) return null;
    let profundidade = 0;
    for (let i = inicio; i < texto.length; i += 1) {
      const c = texto[i];
      if (c === "(" || c === "[" || c === "{") profundidade += 1;
      else if (c === ")" || c === "]" || c === "}") profundidade -= 1;
      else if (c === ";" && profundidade === 0) return texto.slice(inicio, i + 1);
    }
    return null;
  };

  const trecho = extrairDeclaracao(semComentarios(pagina), "acoesDaAba");
  const achou = afirmar(
    "a declaração de `acoesDaAba` foi encontrada na página",
    trecho !== null,
  );

  if (achou) {
    let calcular = null;
    try {
      // Dependências do trecho, dubladas: o ícone e o disparador de estado.
      calcular = new Function(
        "activeTab",
        "RotateCcw",
        "setConfirmReset",
        `${trecho}\nreturn acoesDaAba;`,
      );
    } catch (erro) {
      afirmar("o trecho de `acoesDaAba` compila isoladamente", false, erro.message);
    }

    if (calcular) {
      const paraAba = (aba) => calcular(aba, () => null, () => null);
      const noBlog = paraAba("blog");
      const emCarreiras = paraAba("carreiras");

      afirmar(
        "aba Blog: NENHUMA ação global na barra — Restaurar não aparece",
        Array.isArray(noBlog) && noBlog.length === 0,
        `recebeu: ${JSON.stringify(noBlog?.map?.((a) => a.rotulo))}`,
      );
      afirmar(
        "aba Carreiras: Restaurar continua disponível",
        Array.isArray(emCarreiras) &&
          emCarreiras.some((a) => /^Restaurar$/i.test(a.rotulo)),
        `recebeu: ${JSON.stringify(emCarreiras?.map?.((a) => a.rotulo))}`,
      );
      afirmar(
        "a ação Restaurar de Carreiras tem gatilho de verdade",
        typeof emCarreiras?.[0]?.aoAcionar === "function",
      );
      // Uma aba que ainda não existe não pode ganhar a ação destrutiva de
      // brinde: a decisão precisa ser positiva, não uma negação de "blog".
      afirmar(
        "uma aba desconhecida não recebe a ação destrutiva",
        paraAba("qualquer-outra").length === 0,
      );
    }
  }

  /* As abas que a página entrega à casca. */
  const rotulos = [...pagina.matchAll(/rotulo:\s*"([^"]+)"/g)].map((m) => m[1]);
  afirmar(
    "a página declara as abas Blog e Carreiras com contagem e link externo",
    rotulos.includes("Blog") &&
      rotulos.includes("Carreiras") &&
      contar(pagina, /contagem:\s*formatarNumero\(/g) === 2 &&
      contar(pagina, /href:\s*"\/(blog|carreiras)"/g) === 2,
  );
}

/* ═════════════════════════════════════════════════════════════════════ */

secao("(c) o anel de foco");

let ANEL_DE_FOCO = null;
let ALVO_DE_TOQUE = null;
try {
  const modulo = await import(pathToFileURL(path.join(raiz, CAMINHO_FOCO)).href);
  ANEL_DE_FOCO = modulo.ANEL_DE_FOCO;
  ALVO_DE_TOQUE = modulo.ALVO_DE_TOQUE;
  afirmar(`${CAMINHO_FOCO} importa e exporta o anel`, typeof ANEL_DE_FOCO === "string");
} catch (erro) {
  afirmar(`${CAMINHO_FOCO} importa`, false, erro.message);
}

if (typeof ANEL_DE_FOCO === "string") {
  afirmar(
    "o anel é de 2px (`ring-2`), nunca outro peso",
    /\bfocus-visible:ring-2\b/.test(ANEL_DE_FOCO) &&
      !/ring-\[|ring-(1|4|8)\b/.test(ANEL_DE_FOCO),
    ANEL_DE_FOCO,
  );
  afirmar(
    "a cor do anel é `brand-action`, e não outro token",
    /focus-visible:ring-brand-action\b/.test(ANEL_DE_FOCO) &&
      !/ring-(ring|primary|emerald)/.test(ANEL_DE_FOCO),
    ANEL_DE_FOCO,
  );
  afirmar(
    "o anel mantém contorno transparente para alto contraste (`outline-hidden`)",
    /outline-hidden/.test(ANEL_DE_FOCO) && !/\boutline-none\b/.test(ANEL_DE_FOCO),
    ANEL_DE_FOCO,
  );
}

if (typeof ALVO_DE_TOQUE === "string") {
  afirmar(
    "o alvo de toque mínimo é 40×40 (`min-h-10 min-w-10`)",
    /min-h-10/.test(ALVO_DE_TOQUE) && /min-w-10/.test(ALVO_DE_TOQUE),
    ALVO_DE_TOQUE,
  );
}

/*
 * Todo elemento interativo da barra recebe o anel — afirmado ELEMENTO A
 * ELEMENTO, não por soma.
 *
 * A soma não sabe onde as ocorrências estão: tirar o anel do `<Link>` e
 * escrevê-lo duas vezes na aba mantém a conta idêntica e a asserção verde, com
 * o único atalho para o blog publicado sem foco visível. Aqui cada tag é
 * fatiada e conferida por si, e quem falha é nomeado.
 */
if (barra) {
  const codigo = semComentarios(barra);
  const interativos = tagsDe(codigo, ["button", "Link"]);

  afirmar(
    "a barra tem elementos interativos para auditar",
    interativos.length >= 3,
    `encontrados: ${interativos.length}`,
  );

  const semAnel = interativos.filter(({ tag }) => !/\bANEL_DE_FOCO\b/.test(tag));
  afirmar(
    "todo elemento interativo da barra aplica o anel de foco",
    interativos.length > 0 && semAnel.length === 0,
    semAnel.map(({ tag }) => tag.slice(0, 60).replace(/\s+/g, " ")).join(" | "),
  );

  const semAlvo = interativos.filter(
    ({ tag }) => !/\bmin-h-10\b/.test(tag) && !/\bALVO_DE_TOQUE\b/.test(tag),
  );
  afirmar(
    "todo elemento interativo da barra declara alvo de toque de 40px",
    semAlvo.length === 0,
    semAlvo.map(({ tag }) => tag.slice(0, 60).replace(/\s+/g, " ")).join(" | "),
  );

  /* O controle que vira só ícone abaixo de `sm` precisa de largura mínima
     também — `px-3` mais um ícone de 14px dá 38px, e 38 não é 40. */
  const soIcone = interativos.filter(({ tag }) => /hidden sm:inline|<Link\b/.test(tag));
  const semLargura = soIcone.filter(
    ({ tag }) => !/\bALVO_DE_TOQUE\b/.test(tag) && !/\bmin-w-10\b/.test(tag),
  );
  afirmar(
    "o controle que vira só ícone em tela estreita tem largura mínima de 40px",
    soIcone.length > 0 && semLargura.length === 0,
    semLargura.map(({ tag }) => tag.slice(0, 60).replace(/\s+/g, " ")).join(" | "),
  );

  /* Autoteste do fatiador: sem ele, um bug que devolvesse tag vazia faria
     `semAnel` ficar vazio e as três asserções acima passarem por vacuidade. */
  const falsas = tagsDe(
    '<button className={cn("a", ANEL_DE_FOCO)}>x</button><Link className="b">y</Link>',
    ["button", "Link"],
  );
  afirmar(
    "fatiador de elementos: separa as tags e enxerga o que está em cada uma",
    falsas.length === 2 &&
      /ANEL_DE_FOCO/.test(falsas[0].tag) &&
      !/ANEL_DE_FOCO/.test(falsas[1].tag),
    `fatiou: ${falsas.length}`,
  );
}

/* Semântica de abas: o padrão inteiro, ou nada. */
if (barra && pagina) {
  const codigo = semComentarios(barra);
  afirmar(
    "as abas não mentem dizendo que navegam para outra página",
    !/aria-current/.test(codigo),
    "`aria-current=\"page\"` em botão que troca conteúdo da mesma tela é falso",
  );
  afirmar(
    "o padrão ARIA de abas está completo na barra",
    /role="tablist"/.test(codigo) &&
      /role="tab"/.test(codigo) &&
      /aria-selected=/.test(codigo) &&
      /aria-controls=/.test(codigo) &&
      /tabIndex=\{ativa \? 0 : -1\}/.test(codigo) &&
      /ArrowRight/.test(codigo),
    "tablist sem tabpanel, sem aria-selected ou sem foco itinerante é pior que padrão nenhum",
  );
  afirmar(
    "a página oferece o `tabpanel` que as abas controlam",
    /role="tabpanel"/.test(pagina) &&
      /aria-labelledby=\{idDaAba\(/.test(pagina) &&
      /id=\{ID_DO_CONTEUDO\}/.test(pagina),
  );
  afirmar(
    "o Painel tem nome próprio: `<h1>` e título de janela",
    /<h1 className="sr-only">\{titulo\}<\/h1>/.test(codigo) &&
      /document\.title = titulo/.test(codigo) &&
      /titulo="[^"]*Painel[^"]*"/.test(pagina),
    "sem isso, Painel e site público ficam indistinguíveis no histórico e no leitor de tela",
  );
  afirmar(
    "a logo declara dimensão intrínseca — a barra não desloca no primeiro carregamento",
    /width=\{LOGO_LARGURA\}/.test(codigo) && /height=\{LOGO_ALTURA\}/.test(codigo),
  );
}

/* O menu do Autor é elemento da barra: o anel dele é o mesmo, não um parecido. */
if (menu) {
  afirmar(
    "o menu do Autor usa o mesmo anel compartilhado",
    /ANEL_DE_FOCO/.test(menu) && !/ring-\[3px\]/.test(menu),
  );
}

/* O anel sobreviveu ao build — classe que o Tailwind não gerou não existe. */
if (cssCompilado) {
  afirmar(
    "`ring-brand-action` chegou ao CSS compilado apontando para o token",
    /ring-brand-action:focus-visible\{--tw-ring-color:var\(--brand-action\)\}/.test(
      cssCompilado,
    ),
  );
  afirmar(
    "o deslocamento do anel chegou ao CSS compilado",
    /ring-offset-surface:focus-visible\{--tw-ring-offset-color:var\(--surface\)\}/.test(
      cssCompilado,
    ) && /ring-offset-2:focus-visible\{--tw-ring-offset-width:2px/.test(cssCompilado),
  );

  /*
   * O anel PRECISA ser visível sobre a cromia, e isso é aritmética, não
   * opinião: `brand-action` sobre `brand-chrome` dá 1,47:1 — invisível. É por
   * isso que existe o deslocamento em `surface`. As duas fronteiras são
   * verificadas contra o piso de 3:1 de elemento não textual.
   */
  const valorDe = (nome) => {
    const m = new RegExp(`${nome}:\\s*(#[0-9a-fA-F]{3,8})\\b`).exec(cssCompilado);
    return m ? m[1] : null;
  };
  const chrome = valorDe("--brand-chrome");
  const acao = valorDe("--brand-action");
  const superficie = valorDe("--surface");
  const achouTokens = afirmar(
    "os tokens do anel e da barra estão no CSS compilado",
    Boolean(chrome && acao && superficie),
    `chrome=${chrome} action=${acao} surface=${superficie}`,
  );
  if (achouTokens) {
    const externo = contraste(acao, superficie);
    const interno = contraste(superficie, chrome);
    afirmar(
      `anel visível: \`brand-action\` sobre o deslocamento branco (${externo.toFixed(2)}:1 ≥ 3)`,
      externo >= 3,
    );
    afirmar(
      `anel visível: deslocamento branco sobre a cromia (${interno.toFixed(2)}:1 ≥ 3)`,
      interno >= 3,
    );
    const semDeslocamento = contraste(acao, chrome);
    afirmar(
      `e o deslocamento é indispensável: sem ele seriam ${semDeslocamento.toFixed(2)}:1`,
      semDeslocamento < 3,
      "se este número passar de 3:1, o deslocamento virou decoração e a asserção acima deixou de provar algo",
    );
    const textoNaBarra = contraste("#ffffff", chrome);
    afirmar(
      `texto branco sobre a cromia da barra (${textoNaBarra.toFixed(2)}:1 ≥ 4,5)`,
      textoNaBarra >= 4.5,
    );
  }
}

/* ═════════════════════════════════════════════════════════════════════ */

secao("(d) notificação");

const fontesSrc = arquivosDe(DIR_SRC, [".js", ".jsx"]);

{
  const importadores = fontesSrc.filter((a) =>
    /from\s+["']sonner["']/.test(semComentarios(ler(a))),
  );
  afirmar(
    "`sonner` é importado num único arquivo — o ponto único de notificação",
    importadores.length === 1 &&
      rel(importadores[0]) === CAMINHO_NOTIFICACOES,
    importadores.map(rel).join(", ") || "nenhum",
  );

  const montagens = ocorrencias(fontesSrc, /<(Toaster|Notificacoes)\b/, semComentarios);
  afirmar(
    "o `Toaster` é montado UMA vez só em todo o `src/`",
    montagens.length === 2, // a definição em Notificacoes.jsx + a montagem única
    montagens.join(", "),
  );
  /*
   * A montagem fica na casca, ACIMA das telas — e não dentro da página. A
   * página troca de tela cheia ao abrir um formulário; um `Toaster` montado lá
   * dentro sairia junto e levaria embora a mensagem da operação que terminou.
   */
  afirmar(
    "a montagem única está na casca, acima das telas do Painel",
    ocorrencias([path.join(raiz, CAMINHO_PORTAO)], /<Notificacoes\b/, semComentarios)
      .length === 1 &&
      ocorrencias([path.join(raiz, CAMINHO_PAGINA)], /<Notificacoes\b/, semComentarios)
        .length === 0,
  );
}

if (notificacoes) {
  const codigo = semComentarios(notificacoes);
  afirmar(
    "existe uma função para operação concluída e outra para operação falha",
    /export function notificarSucesso\(/.test(codigo) &&
      /export function notificarErro\(/.test(codigo),
  );
  afirmar(
    "erro exige as DUAS metades: o que houve e o que fazer",
    /notificarErro\(oQueHouve,\s*oQueFazer\)/.test(codigo) &&
      /diagnosticarMensagem\("o que houve"/.test(codigo) &&
      /diagnosticarMensagem\("o que fazer"/.test(codigo),
  );
  afirmar(
    "a notificação sai mesmo quando a guarda reprova o texto",
    // A guarda existe para melhorar a mensagem, não para engoli-la: engolir
    // produziria o silêncio que a matriz proíbe, causado pela própria guarda.
    /exigir\(diagnosticarMensagem[\s\S]*return toast\.(success|error)\(/.test(codigo),
  );
  afirmar(
    "o `Toaster` é renderizado dentro do escopo `.painel` (ele nasce em portal)",
    /className="painel"/.test(codigo),
  );
  afirmar(
    "a aparência da notificação vem de token, não de cor crua",
    /var\(--popover\)/.test(codigo) && !/#[0-9a-f]{3,8}\b/i.test(codigo),
  );
}

/* As mensagens que a página realmente envia nomeiam o que aconteceu. */
if (pagina) {
  const sucessos = [...pagina.matchAll(/notificarSucesso\(\s*"([^"]+)"/g)].map((m) => m[1]);
  const erros = [...pagina.matchAll(/notificarErro\(\s*\n?\s*"([^"]+)"/g)].map((m) => m[1]);
  afirmar(
    "toda conclusão notificada nomeia o que aconteceu",
    sucessos.length > 0 && sucessos.every((m) => /\s/.test(m) && m.length > 6),
    sucessos.join(" | ") || "nenhuma",
  );
  afirmar(
    "toda falha notificada nomeia o que houve",
    erros.length > 0 && erros.every((o) => o.length > 8),
    erros.join(" | ") || "nenhuma",
  );
}

/*
 * A pergunta que importa não é "há notificações suficientes?" — um piso de
 * quantidade é satisfeito pelas operações que JÁ notificam, e fica cego
 * justamente para a que ficou de fora. A pergunta é: **existe alguma operação
 * que grava sem notificar?**
 *
 * Foi assim que salvar passou despercebido. Excluir e restaurar estavam
 * protegidos — e são as que quase nunca falham, porque gravam menos do que
 * havia antes. Quem estoura a cota é salvar um post com imagem em base64, e era
 * exatamente `handleSubmit` que declarava "Salvo!" sem saber se a gravação
 * tinha acontecido.
 */
if (pagina) {
  const codigo = semComentarios(pagina);
  const GRAVAM = ["savePost", "deletePost", "resetPosts", "saveVaga", "deleteVaga", "resetVagas"];

  const semVoz = [];
  const semGuarda = [];
  let sitiosEncontrados = 0;

  for (const escrita of GRAVAM) {
    const padrao = new RegExp(`\\b${escrita}\\(`, "g");
    let casou;
    while ((casou = padrao.exec(codigo)) !== null) {
      // A própria linha de `import` não é chamada.
      const linha = codigo.slice(codigo.lastIndexOf("\n", casou.index) + 1, casou.index);
      if (/^\s*import\b/.test(linha)) continue;

      sitiosEncontrados += 1;
      const corpo = corpoDaFuncaoQueContem(codigo, casou.index);
      if (corpo === null) {
        semVoz.push(`${escrita} (função não localizada)`);
        continue;
      }
      if (!/notificarSucesso\(/.test(corpo) || !/notificarErro\(/.test(corpo)) {
        semVoz.push(escrita);
      }
      // E o sucesso não pode ser declarado antes de a gravação ter dado certo.
      if (!/try\s*\{/.test(corpo) || !/catch\s*\(/.test(corpo)) {
        semGuarda.push(escrita);
      }
    }
  }

  afirmar(
    "há operações de gravação para auditar na página",
    sitiosEncontrados >= 4,
    `encontradas: ${sitiosEncontrados}`,
  );
  afirmar(
    "NENHUMA operação que grava fica sem notificar conclusão e falha",
    semVoz.length === 0,
    semVoz.join(", "),
  );
  afirmar(
    "toda gravação está dentro de `try`/`catch` — sucesso não é declarado no escuro",
    semGuarda.length === 0,
    semGuarda.join(", "),
  );
  afirmar(
    "o `catch` captura o erro em vez de descartá-lo",
    !/catch\s*\{/.test(codigo) && /catch \(erro\)/.test(codigo),
    "`catch {}` sem vínculo obriga a afirmar uma causa que ninguém verificou",
  );
  afirmar(
    "a mensagem só fala em espaço quando o erro é mesmo de cota",
    /QuotaExceededError/.test(codigo) && /ehCotaEstourada\(/.test(codigo),
  );
  afirmar(
    "`setSaved(true)` só acontece depois da gravação bem-sucedida",
    !/savePost\([^)]*\);\s*setSaved\(true\)/.test(codigo) &&
      !/saveVaga\([^)]*\);\s*setSaved\(true\)/.test(codigo),
    "declarar sucesso na mesma respiração da gravação é declarar sem saber",
  );

  /* Autoteste do localizador de função: sem ele, um bug que devolvesse sempre
     o arquivo inteiro faria toda operação parecer notificada. */
  const amostra =
    'const a = () => { savePost(x); };\nconst b = () => { savePost(y); notificarSucesso("z"); notificarErro("p","q"); };';
  const primeiro = corpoDaFuncaoQueContem(amostra, amostra.indexOf("savePost"));
  const segundo = corpoDaFuncaoQueContem(amostra, amostra.lastIndexOf("savePost"));
  afirmar(
    "localizador de função: isola o corpo certo e acusa o que não notifica",
    primeiro !== null &&
      segundo !== null &&
      !/notificarSucesso/.test(primeiro) &&
      /notificarSucesso/.test(segundo),
    `primeiro=${JSON.stringify(primeiro)}`,
  );
}

/* ═════════════════════════════════════════════════════════════════════ */

secao("(d2) as regras de voz, executadas de verdade");

/*
 * Antes, `normalizar`, `VAGUIDADES` e `ROTULOS_GENERICOS` eram conferidos só
 * por regex sobre o texto do arquivo. Apagar `.replace(/\p{Diacritic}/gu, "")`
 * de `normalizar` faria "Não foi possível" deixar de casar com a lista — e em
 * pt-BR quase toda vaguidão é acentuada — sem mexer numa vírgula do que as
 * regexes procuravam. Agora as funções são importadas e exercidas caso a caso.
 */
let voz = null;
try {
  voz = await import(pathToFileURL(path.join(raiz, CAMINHO_VOZ)).href);
  afirmar(`${CAMINHO_VOZ} importa`, true);
} catch (erro) {
  afirmar(`${CAMINHO_VOZ} importa`, false, erro.message);
}

if (voz) {
  const { normalizar, diagnosticarMensagem, diagnosticarRotuloDeAcao, exigir } = voz;

  afirmar(
    "`normalizar` remove acento — sem isso a guarda fica cega à vaguidão em pt-BR",
    normalizar("Não foi possível") === "nao foi possivel",
    normalizar("Não foi possível"),
  );
  afirmar(
    "`normalizar` apara ANTES de cortar a pontuação",
    normalizar("Erro! ") === "erro" && normalizar("  Ops...  ") === "ops",
    `${normalizar("Erro! ")} / ${normalizar("  Ops...  ")}`,
  );
  afirmar(
    "`normalizar` corta também `?`, `:`, `;` e `,`",
    normalizar("Pronto?") === "pronto" && normalizar("Feito;") === "feito",
  );
  afirmar(
    "`normalizar` colapsa espaço interno",
    normalizar("algo   deu    errado") === "algo deu errado",
  );

  /* Mensagem: o que deve ser recusado e o que deve passar. */
  const RECUSADAS = [
    "",
    "   ",
    "Ops!",
    "Erro! ",
    "Algo deu errado",
    "Ops, algo deu errado",
    "Não foi possível",
    "  PRONTO  ",
    "Tente de novo",
    "ocorreu um erro",
  ];
  const recusouTodas = RECUSADAS.filter(
    (m) => diagnosticarMensagem("teste", m) === null,
  );
  afirmar(
    "vaguidão é recusada — inclusive acentuada, com pontuação e dentro de frase",
    recusouTodas.length === 0,
    `passaram indevidamente: ${recusouTodas.map((m) => JSON.stringify(m)).join(", ")}`,
  );
  afirmar(
    "mensagem ausente ou de tipo errado é recusada",
    [null, undefined, 7, {}].every((m) => diagnosticarMensagem("teste", m) !== null),
  );

  const ACEITAS = [
    "Post salvo",
    "Vaga excluída",
    "Vagas originais restauradas",
    "Não deu para salvar o post",
    "Não foi possível excluir o post porque ele já havia saído",
    "O armazenamento do navegador está cheio. Libere espaço e tente salvar de novo.",
    "Recarregue o Painel e tente excluir de novo. O detalhe do erro está no console.",
  ];
  const recusadasIndevidamente = ACEITAS.filter(
    (m) => diagnosticarMensagem("teste", m) !== null,
  );
  afirmar(
    "mensagem que diz o que houve passa — a guarda não é um censor",
    recusadasIndevidamente.length === 0,
    recusadasIndevidamente.map((m) => JSON.stringify(m)).join(", "),
  );

  /* Rótulo de ação: contenção, não igualdade. */
  const ROTULOS_RUINS = ["", "OK", "Sim", "Confirmar", "Confirmar ação", "Enviar", "Salvar", "Excluir", "Restaurar"];
  const passaramRuins = ROTULOS_RUINS.filter((r) => diagnosticarRotuloDeAcao(r) === null);
  afirmar(
    'rótulo genérico é recusado — inclusive com enchimento ("Confirmar ação")',
    passaramRuins.length === 0,
    `passaram indevidamente: ${passaramRuins.map((r) => JSON.stringify(r)).join(", ")}`,
  );

  const ROTULOS_BONS = ["Excluir post", "Excluir vaga", "Restaurar vagas originais", "Publicar agora"];
  const recusadosBons = ROTULOS_BONS.filter((r) => diagnosticarRotuloDeAcao(r) !== null);
  afirmar(
    "rótulo que nomeia a ação passa",
    recusadosBons.length === 0,
    recusadosBons.map((r) => JSON.stringify(r)).join(", "),
  );

  /* A política: em produção registra e segue; nunca derruba a árvore React. */
  afirmar(
    "`exigir` devolve `true` quando não há diagnóstico",
    exigir(null) === true,
  );
  {
    const originais = console.error;
    const registrado = [];
    console.error = (...args) => registrado.push(args.join(" "));
    let derrubou = false;
    let resultado = null;
    try {
      resultado = exigir("problema de teste");
    } catch {
      derrubou = true;
    }
    console.error = originais;
    afirmar(
      "fora do desenvolvimento, a violação é registrada e a interface segue de pé",
      derrubou === false && resultado === false && registrado.length === 1,
      `derrubou=${derrubou} registrou=${registrado.length}`,
    );
  }
  afirmar(
    "a política distingue desenvolvimento de produção",
    typeof voz.EM_DESENVOLVIMENTO === "boolean" &&
      /EM_DESENVOLVIMENTO/.test(ler(path.join(raiz, CAMINHO_VOZ))),
  );
}

/* Os componentes consomem a política — não reimplementam a regra. */
if (notificacoes && dialogo) {
  afirmar(
    "notificação e diálogo consomem as regras de `voz.js`, sem cópia local",
    /from "\.\/voz"/.test(notificacoes) &&
      /from "\.\/voz"/.test(dialogo) &&
      !/VAGUIDADES\s*=/.test(notificacoes) &&
      !/ROTULOS_GENERICOS\s*=/.test(dialogo),
    "duas cópias da mesma lista divergem no primeiro ajuste",
  );
}

/* Limite de erro: a rede que faltava sob o `throw`. */
{
  const limite = lerOuFalhar(CAMINHO_LIMITE);
  afirmar(
    "existe limite de erro envolvendo o Painel",
    limite !== null &&
      /getDerivedStateFromError/.test(limite) &&
      /componentDidCatch/.test(limite),
  );
  const portao = lerOuFalhar(CAMINHO_PORTAO);
  afirmar(
    "o limite de erro está montado acima do conteúdo do Painel",
    portao !== null && /<LimiteDeErro>\{children\}<\/LimiteDeErro>/.test(portao),
  );
  afirmar(
    "o `Toaster` está acima dos TRÊS ramos do portão, não só do autenticado",
    portao !== null &&
      /const conteudo =/.test(portao) &&
      /\{conteudo\}\s*\n\s*<Notificacoes \/>/.test(portao),
    "notificação disparada durante o carregamento ou na tela de entrada sumiria sem rastro",
  );
}

/* ═════════════════════════════════════════════════════════════════════ */

secao("(e) confirmação destrutiva");

{
  // Comentários fora: contar a explicação de que o modal artesanal SAIU como
  // prova de que ele ficou é o tipo de falso positivo que ensina a apagar o
  // comentário em vez de corrigir o código.
  const modais = ocorrencias(fontesSrc, /\bConfirmModal\b/, semComentarios);
  afirmar(
    "o `ConfirmModal` artesanal não existe mais em `src/`",
    modais.length === 0,
    modais.join(", "),
  );
  const zIndexAmador = ocorrencias(fontesSrc, /z-\[100\]/, semComentarios);
  afirmar(
    "o modal fixo com `z-[100]` saiu junto",
    zIndexAmador.length === 0,
    zIndexAmador.join(", "),
  );
}

afirmar(
  `${CAMINHO_ALERT_DIALOG} instalado`,
  existsSync(path.join(raiz, CAMINHO_ALERT_DIALOG)),
);

if (existsSync(path.join(raiz, CAMINHO_ALERT_DIALOG))) {
  const alerta = ler(path.join(raiz, CAMINHO_ALERT_DIALOG));
  afirmar(
    "o `alert-dialog` usa o pacote individual do Radix, não o guarda-chuva",
    /@radix-ui\/react-alert-dialog/.test(alerta) &&
      !/from\s+["']radix-ui["']/.test(alerta),
    "o guarda-chuva `radix-ui` traria uma segunda cópia de Portal e de contexto",
  );
}

if (dialogo) {
  const codigo = semComentarios(dialogo);
  afirmar(
    "o diálogo é construído sobre o `alert-dialog` do sistema",
    /from\s+["']@\/components\/ui\/alert-dialog["']/.test(codigo) &&
      /<AlertDialog\b/.test(codigo),
  );
  afirmar(
    "Cancelar é o foco inicial, explicitamente",
    /onOpenAutoFocus=/.test(codigo) &&
      /refDeCancelar/.test(codigo) &&
      /cancelar\.focus\(\)/.test(codigo),
  );
  afirmar(
    "Cancelar existe e é o caminho seguro (não dispara a ação)",
    /<AlertDialogCancel\b/.test(codigo) && !/aoConfirmar/.test(
      codigo.slice(codigo.indexOf("<AlertDialogCancel"), codigo.indexOf("</AlertDialogCancel>")),
    ),
  );
  afirmar(
    "o rótulo passa pela guarda de voz, sem lista própria",
    /diagnosticarRotuloDeAcao\(rotuloDeConfirmacao\)/.test(codigo) &&
      /exigir\(/.test(codigo),
  );
  /*
   * O conteúdo do diálogo monta em portal, preso ao `body` — fora da árvore do
   * Painel. Sem `.painel`, `var(--primary)`, `var(--card)` e `var(--destructive)`
   * resolvem para os neutros de `:root` e o diálogo sai com a cor do site
   * público. É o mesmo defeito que o `Toaster` já tinha resolvido.
   */
  afirmar(
    "o conteúdo do diálogo carrega `.painel` — ele nasce em portal",
    /<AlertDialogContent[\s\S]*?className="painel/.test(codigo),
  );
}

/*
 * Regra geral, não caso a caso: TODO componente que renderiza em portal precisa
 * reabrir o escopo `.painel`. Vale para o que vier depois — um `Popover`, um
 * `Tooltip`, um `Select` do Épico 2 herdariam o mesmo defeito em silêncio.
 */
{
  const PRIMITIVAS_EM_PORTAL = [
    ["AlertDialogContent", /@radix-ui\/react-alert-dialog|ui\/alert-dialog/],
    ["DialogContent", /ui\/dialog/],
    ["PopoverContent", /ui\/popover/],
    ["TooltipContent", /ui\/tooltip/],
    ["SelectContent", /ui\/select/],
    ["Toaster", /sonner/],
  ];
  const daCasca = arquivosDe(path.join(DIR_SRC, "admin"), [".jsx"]);
  const semEscopo = [];
  for (const arquivo of daCasca) {
    const texto = semComentarios(ler(arquivo));
    for (const [componente] of PRIMITIVAS_EM_PORTAL) {
      const padrao = new RegExp(`<${componente}\\b`, "g");
      let casou;
      while ((casou = padrao.exec(texto)) !== null) {
        const tag = tagQueContem(texto, casou.index);
        if (tag && !/className="painel|className=\{cn\("painel|className="painel /.test(tag)) {
          if (!/\bpainel\b/.test(tag)) semEscopo.push(`${rel(arquivo)}: <${componente}>`);
        }
      }
    }
  }
  afirmar(
    "todo componente do Painel que renderiza em portal reabre o escopo `.painel`",
    semEscopo.length === 0,
    semEscopo.join(", "),
  );
}

/* Os rótulos que a página realmente passa dizem o que o botão faz. */
if (pagina && voz) {
  const rotulos = [...pagina.matchAll(/rotuloDeConfirmacao=\{?[`"]([^`"]+)/g)].map(
    (m) => m[1],
  );
  // Não é uma segunda lista de genéricos: é a MESMA guarda do produto,
  // executada sobre os rótulos que a página passa de fato.
  const reprovados = rotulos.filter(
    (r) => voz.diagnosticarRotuloDeAcao(r.replace(/\$\{[^}]*\}/g, "post")) !== null,
  );
  afirmar(
    "todo rótulo de confirmação da página passa pela guarda de voz de verdade",
    rotulos.length >= 2 && reprovados.length === 0,
    `rótulos: ${rotulos.join(" | ")} — reprovados: ${reprovados.join(" | ") || "nenhum"}`,
  );
  afirmar(
    "a página usa o diálogo do sistema nos dois pontos de confirmação",
    contar(pagina, /<DialogoDeConfirmacao\b/g) === 2,
  );
  /*
   * Montagem condicional (`{alvo && <Dialogo …>}`) nunca transita de aberto
   * para fechado: desmonta. Com ela, o `onCloseAutoFocus` do Radix — que
   * devolve o foco ao botão que abriu — não roda, e quem fecha por `Esc` volta
   * a tabular do topo da página.
   */
  afirmar(
    "os diálogos são montados sempre e controlados por `aberto`",
    /aberto=\{Boolean\(deleteTarget\)\}/.test(pagina) &&
      /aberto=\{confirmReset\}/.test(pagina) &&
      !/\{deleteTarget && \(\s*<DialogoDeConfirmacao/.test(pagina) &&
      !/\{confirmReset && \(\s*<DialogoDeConfirmacao/.test(pagina),
  );
  /* Restaurar não é excluir: a gravidade tem cor própria. */
  afirmar(
    "restaurar não é pintado com o vermelho de excluir",
    contar(semComentarios(pagina), /perigo=\{false\}/g) === 1,
    `ocorrências: ${contar(semComentarios(pagina), /perigo=\{false\}/g)}`,
  );
}

/* Nome do Autor ainda carregando: esqueleto, nunca vazio nem "undefined". */
if (menu) {
  const codigo = semComentarios(menu);
  afirmar(
    "nome ainda carregando mostra esqueleto, não texto vazio",
    /perfil\.carregando/.test(codigo) && /<Skeleton\b/.test(codigo),
  );
  afirmar(
    "falha ao ler o nome vira rótulo neutro, nunca `undefined` na tela",
    /perfil\.nome\s*\?\?\s*"[^"]+"/.test(codigo) && !/\bundefined\b/.test(codigo),
  );
}

/* ═════════════════════════════════════════════════════════════════════ */

secao("(f) vocabulário de Estado — executado");

let estados = null;
try {
  estados = await import(pathToFileURL(path.join(raiz, CAMINHO_ESTADOS)).href);
  afirmar(`${CAMINHO_ESTADOS} importa`, true);
} catch (erro) {
  afirmar(`${CAMINHO_ESTADOS} importa`, false, erro.message);
}

const PALAVRAS = {
  rascunho: "Rascunho",
  agendado: "Agendado",
  publicado: "Publicado",
  arquivado: "Arquivado",
};

if (estados) {
  const { ESTADOS, aparenciaDoEstado, rotuloDoEstado, ehEstado } = estados;

  afirmar(
    "o vocabulário tem exatamente quatro Estados",
    Array.isArray(ESTADOS) && ESTADOS.length === 4,
    JSON.stringify(ESTADOS),
  );
  afirmar(
    "a lista é congelada — ninguém acrescenta um quinto em tempo de execução",
    Object.isFrozen(ESTADOS),
  );
  afirmar(
    "as quatro chaves são exatamente as previstas",
    ESTADOS.every((e) => Object.hasOwn(PALAVRAS, e)) &&
      Object.keys(PALAVRAS).every((e) => ESTADOS.includes(e)),
    JSON.stringify(ESTADOS),
  );

  for (const [chave, palavra] of Object.entries(PALAVRAS)) {
    afirmar(
      `\`${chave}\` diz "${palavra}" — a palavra única, por extenso`,
      rotuloDoEstado(chave) === palavra,
      `recebeu: ${rotuloDoEstado(chave)}`,
    );
  }

  const rotulos = ESTADOS.map(rotuloDoEstado);
  afirmar(
    "nenhum Estado repete a palavra de outro",
    new Set(rotulos).size === rotulos.length,
  );

  /* Par de cor: existe, é token, é próprio de cada Estado e RESOLVE no CSS. */
  const pares = ESTADOS.map((e) => aparenciaDoEstado(e));
  afirmar(
    "cada Estado tem par de cor por token, nunca hex solto",
    pares.every(
      ({ fundo, tinta }) =>
        /^var\(--state-[a-z]+-bg\)$/.test(fundo) &&
        /^var\(--state-[a-z]+-ink\)$/.test(tinta),
    ),
    JSON.stringify(pares),
  );
  afirmar(
    "os quatro pares são distintos entre si",
    new Set(pares.map((p) => `${p.fundo}|${p.tinta}`)).size === 4,
  );
  afirmar(
    "a aparência devolvida é congelada",
    pares.every((p) => Object.isFrozen(p)),
  );

  if (appCss && cssCompilado) {
    const tokens = pares.flatMap(({ fundo, tinta }) => [
      fundo.slice(4, -1),
      tinta.slice(4, -1),
    ]);
    const semDeclaracao = tokens.filter(
      (t) => !new RegExp(`${t}:\\s*#`).test(appCss),
    );
    afirmar(
      "todo token de Estado citado pelo domínio está declarado em App.css",
      semDeclaracao.length === 0,
      semDeclaracao.join(", "),
    );
    const semCompilar = tokens.filter((t) => !cssCompilado.includes(`${t}:`));
    afirmar(
      "todo token de Estado chega ao CSS compilado com valor",
      semCompilar.length === 0,
      semCompilar.join(", "),
    );
  }

  /* Falha alto. Cada forma de "fora da lista" é exercida uma a uma. */
  const FORA_DA_LISTA = [
    undefined,
    null,
    "",
    "   ",
    "publicada",
    "PUBLICADO",
    "Publicado",
    "draft",
    "no ar",
    5,
    {},
    ["publicado"],
  ];
  let lancaramTodas = true;
  for (const valor of FORA_DA_LISTA) {
    try {
      aparenciaDoEstado(valor);
      lancaramTodas = false;
      console.log(`        não lançou para: ${JSON.stringify(valor)}`);
    } catch {
      /* esperado */
    }
  }
  afirmar(
    "valor fora da lista falha alto — inclusive variação de caixa e sinônimo",
    lancaramTodas,
  );
  afirmarQueLanca(
    "`rotuloDoEstado` também falha alto",
    () => rotuloDoEstado("publicada"),
  );
  afirmar(
    "`ehEstado` responde sem lançar, para quem precisa apenas testar",
    ehEstado("publicado") === true && ehEstado("publicada") === false,
  );

  /* Sem sinônimo em superfície alguma: ninguém escreve a palavra à mão. */
  const forasDoDominio = fontesSrc.filter(
    (a) => rel(a) !== CAMINHO_ESTADOS,
  );
  const palavrasSoltas = ocorrencias(
    forasDoDominio,
    new RegExp(`["'\`](${Object.values(PALAVRAS).join("|")})["'\`]`),
    semComentarios,
  );
  afirmar(
    "nenhuma tela escreve a palavra de Estado à mão — todas vêm do vocabulário",
    palavrasSoltas.length === 0,
    palavrasSoltas.join(", "),
  );
}

if (pilula) {
  const codigo = semComentarios(pilula);
  afirmar(
    "a pílula consome o vocabulário, não uma tabela própria",
    /from\s+["']@\/domain\/blog\/estados["']/.test(codigo) &&
      /aparenciaDoEstado\(/.test(codigo),
  );
  afirmar(
    "a pílula traz a palavra por extenso — cor não é o único portador do Estado",
    /\{rotulo\}/.test(codigo),
  );
  afirmar(
    "a pílula usa o raio de pílula e nenhum raio solto",
    /rounded-pilula/.test(codigo) && !/rounded-(full|xl|lg|md|sm)\b/.test(codigo),
  );
  /*
   * Ausente e desconhecido não são a mesma coisa. Post sem Estado é o caso de
   * HOJE — a persistência é do Épico 2 —, então lançar para `undefined` faria a
   * primeira listagem do Épico 2 morrer inteira por causa de uma linha. Valor
   * presente e fora do vocabulário continua sendo defeito, e vai para a política
   * de `voz.js` em vez de derrubar o render.
   */
  afirmar(
    "Estado ausente não vira exceção: a pílula simplesmente não aparece",
    /estado === null \|\| estado === undefined \|\| estado === ""/.test(codigo) &&
      /return null/.test(codigo),
  );
  afirmar(
    "Estado presente e desconhecido é tratado pela política, não pelo render",
    /!ehEstado\(estado\)/.test(codigo) &&
      /exigir\(/.test(codigo) &&
      // a checagem vem ANTES da leitura que lança
      codigo.indexOf("ehEstado(estado)") < codigo.indexOf("aparenciaDoEstado(estado)"),
  );
}

/* ═════════════════════════════════════════════════════════════════════ */

secao("(g) dado: a classe e a formatação");

if (appCss) {
  const regra = /\.painel\s+\.dado\s*\{([^}]*)\}/.exec(appCss);
  afirmar("`.dado` declarada sob `.painel` em App.css", regra !== null);
  if (regra) {
    afirmar(
      "`.dado` traz numeral tabular",
      /font-variant-numeric:\s*tabular-nums/.test(regra[1]),
    );
    afirmar(
      "`.dado` traz pilha monoespaçada",
      /font-family:[^;]*monospace/.test(regra[1]),
    );
  }
}

if (cssCompilado) {
  afirmar(
    "`.dado` chegou ao CSS compilado",
    /\.painel \.dado\{[^}]*tabular-nums[^}]*\}/.test(cssCompilado) &&
      /\.painel \.dado\{[^}]*monospace[^}]*\}/.test(cssCompilado),
  );
}

/*
 * "Alguém usa a classe" não é a pergunta. O AC nomeia TRÊS dados — data,
 * contador e slug — e a contagem de aba na barra, que era o único uso, não é
 * nenhum deles: um piso de `usos.length > 0` ficava verde justamente com os
 * três de fora. Aqui cada dado nomeado é localizado no ponto onde é renderizado
 * e o elemento que o envolve é conferido.
 */
if (pagina) {
  const codigo = semComentarios(pagina);
  const DADOS_NOMEADOS = [
    ["data, no cartão da listagem", ">{post.data}<"],
    ["data, no campo do formulário", "value={post.data}"],
    ["slug, no campo do formulário", "value={post.slug}"],
    ["slug, no subtítulo do formulário", ">{post.slug}<"],
    ["contador de caracteres", "} caracteres"],
  ];

  const semDado = [];
  for (const [nome, ancora] of DADOS_NOMEADOS) {
    const indice = codigo.indexOf(ancora);
    if (indice === -1) {
      semDado.push(`${nome} (não encontrado)`);
      continue;
    }
    const tag = tagQueContem(codigo, indice);
    if (!tag || !/\bdado\b/.test(tag)) semDado.push(nome);
  }

  afirmar(
    "data, contador e slug são renderizados com `.dado`",
    semDado.length === 0,
    semDado.join(" | "),
  );

  /* Autoteste do localizador: um bug que devolvesse sempre a tag do `<div>`
     raiz faria os cinco parecerem cobertos. */
  const amostra = '<p className="x">{post.data}</p><span className="dado">{post.slug}</span>';
  afirmar(
    "localizador de elemento: distingue quem tem `.dado` de quem não tem",
    !/\bdado\b/.test(tagQueContem(amostra, amostra.indexOf("{post.data}")) ?? "") &&
      /\bdado\b/.test(tagQueContem(amostra, amostra.indexOf("{post.slug}")) ?? ""),
  );
}

/* E a contagem na barra, que é dado também. */
if (barra) {
  afirmar(
    "a contagem das abas na barra também é `.dado`",
    /"dado /.test(semComentarios(barra)),
  );
}

let formato = null;
try {
  formato = await import(pathToFileURL(path.join(raiz, CAMINHO_FORMATO)).href);
  afirmar(`${CAMINHO_FORMATO} importa`, true);
} catch (erro) {
  afirmar(`${CAMINHO_FORMATO} importa`, false, erro.message);
}

if (formato) {
  const { formatarData, formatarHora, formatarDataEHora, formatarNumero, FUSO_DE_APRESENTACAO } =
    formato;

  afirmar(
    "o fuso de apresentação é America/Sao_Paulo",
    FUSO_DE_APRESENTACAO === "America/Sao_Paulo",
    String(FUSO_DE_APRESENTACAO),
  );
  afirmar(
    "data em formato brasileiro",
    formatarData("2026-08-14T12:00:00Z") === "14/08/2026",
    formatarData("2026-08-14T12:00:00Z"),
  );
  /*
   * A asserção que importa: 02:00 UTC do dia 1º é 23:00 do dia 31 em São Paulo.
   * Formatar sem fuso declarado devolveria "01/01/2026" num servidor em UTC —
   * o post apareceria um dia inteiro adiantado.
   */
  afirmar(
    "o fuso é aplicado: 02:00Z de 1º/01 é 31/12 em São Paulo",
    formatarData("2026-01-01T02:00:00Z") === "31/12/2025",
    formatarData("2026-01-01T02:00:00Z"),
  );
  afirmar(
    "hora em 24h, no fuso do negócio",
    formatarHora("2026-08-14T12:00:00Z") === "09:00",
    formatarHora("2026-08-14T12:00:00Z"),
  );
  afirmar(
    "meia-noite é 00:00 e nunca 24:00",
    formatarHora("2026-08-14T03:00:00Z") === "00:00",
    formatarHora("2026-08-14T03:00:00Z"),
  );
  afirmar(
    "data e hora juntas",
    formatarDataEHora("2026-08-14T12:00:00Z") === "14/08/2026 09:00",
    formatarDataEHora("2026-08-14T12:00:00Z"),
  );
  afirmar(
    "número em formato brasileiro",
    formatarNumero(1234567) === "1.234.567" && formatarNumero(0) === "0",
    formatarNumero(1234567),
  );
  afirmar(
    "`Date` e milissegundos também são aceitos",
    formatarData(new Date("2026-08-14T12:00:00Z")) === "14/08/2026" &&
      formatarData(Date.parse("2026-08-14T12:00:00Z")) === "14/08/2026",
  );

  /*
   * A forma mais comum de todas — e a armadilha do módulo inteiro.
   *
   * `new Date("2026-08-14")` é meia-noite em UTC por especificação, e meia-noite
   * UTC é 21h do dia ANTERIOR em São Paulo. Tratada como instante, a data civil
   * que vem de uma coluna `date` ou de um campo de formulário perde um dia:
   * exatamente o erro que este módulo existe para impedir, entrando pela porta
   * da frente. Data civil não tem hora, então não há o que converter.
   */
  afirmar(
    "data civil `2026-08-14` NÃO perde um dia",
    formatarData("2026-08-14") === "14/08/2026",
    formatarData("2026-08-14"),
  );
  afirmar(
    "data civil de virada de mês e de ano também",
    formatarData("2026-01-01") === "01/01/2026" &&
      formatarData("2025-12-31") === "31/12/2025",
    `${formatarData("2026-01-01")} / ${formatarData("2025-12-31")}`,
  );
  afirmar(
    "data civil que não existe no calendário falha alto",
    [
      "2026-02-31",
      "2026-13-01",
      "2026-00-10",
      "2025-02-29",
    ].every((d) => {
      try {
        formatarData(d);
        return false;
      } catch {
        return true;
      }
    }),
  );
  afirmar(
    "ano bissexto de verdade continua passando",
    formatarData("2028-02-29") === "29/02/2028",
  );
  /* Sem hora não há hora a mostrar: inventar meia-noite seria dizer algo que a
     entrada não disse. */
  afirmar(
    "data civil é recusada por quem pede hora, em vez de ganhar uma inventada",
    [() => formatarHora("2026-08-14"), () => formatarDataEHora("2026-08-14")].every(
      (chamada) => {
        try {
          chamada();
          return false;
        } catch {
          return true;
        }
      },
    ),
  );

  for (const invalido of [undefined, null, "", "não é data", new Date("x"), {}, []]) {
    afirmarQueLanca(
      `data inválida falha alto: ${JSON.stringify(invalido) ?? "undefined"}`,
      () => formatarData(invalido),
    );
  }
  for (const invalido of [undefined, null, "3", NaN, Infinity, {}]) {
    afirmarQueLanca(
      `número inválido falha alto: ${JSON.stringify(invalido) ?? "undefined"}`,
      () => formatarNumero(invalido),
    );
  }

  /*
   * E a prova de que o fuso não veio da máquina: o mesmo módulo, executado num
   * processo com TZ do outro lado do mundo, precisa devolver o mesmo texto. Sem
   * isto, rodar a verificação numa máquina já em São Paulo aprovaria um módulo
   * que simplesmente não declara fuso nenhum.
   */
  const roteiro = `
    import { formatarData, formatarDataEHora } from ${JSON.stringify(
      pathToFileURL(path.join(raiz, CAMINHO_FORMATO)).href,
    )};
    process.stdout.write([
      formatarDataEHora("2026-01-01T02:00:00Z"),
      formatarData("2026-08-14"),
      formatarData("2026-01-01"),
    ].join("|"));
  `;
  // A data civil entra aqui de propósito: é justamente sob TZ diferente do
  // negócio que ela perderia o dia, e a máquina de quem roda a verificação pode
  // estar em São Paulo — onde o defeito não apareceria.
  const ESPERADO = "31/12/2025 23:00|14/08/2026|01/01/2026";
  for (const fusoDaMaquina of ["UTC", "Asia/Tokyo", "America/Los_Angeles", "Pacific/Kiritimati"]) {
    let saida = null;
    try {
      saida = execFileSync(process.execPath, ["--input-type=module", "-e", roteiro], {
        env: { ...process.env, TZ: fusoDaMaquina },
        encoding: "utf8",
        timeout: 20000,
      });
    } catch (erro) {
      saida = `erro: ${erro.message}`;
    }
    afirmar(
      `o fuso da máquina não muda o resultado, nem para data civil (TZ=${fusoDaMaquina})`,
      saida === ESPERADO,
      `esperado ${ESPERADO}, veio ${saida}`,
    );
  }
}

/* ═════════════════════════════════════════════════════════════════════ */

secao("(h) o que não pode regredir");

if (indexCss) {
  const global = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\*,\s*\*::before,\s*\*::after\s*\{/.test(
    indexCss.replace(/\r\n/g, "\n"),
  );
  afirmar(
    "`prefers-reduced-motion` continua desligando animação globalmente",
    global,
  );
}
if (cssCompilado) {
  afirmar(
    "`prefers-reduced-motion` sobrevive ao build",
    /prefers-reduced-motion/.test(cssCompilado),
  );
}

/* Cor crua e raio solto no código NOVO desta entrega. O corpo do Painel fica
   como está: reconstruí-lo é do Épico 2, e a story proíbe antecipar. */
{
  const novos = ARQUIVOS_NOVOS.map((c) => path.join(raiz, c)).filter((c) =>
    existsSync(c),
  );
  afirmar(
    "os arquivos novos da entrega existem",
    novos.length === ARQUIVOS_NOVOS.length,
    `faltam: ${ARQUIVOS_NOVOS.filter((c) => !existsSync(path.join(raiz, c))).join(", ")}`,
  );

  const crus = ocorrencias(novos, /#[0-9a-fA-F]{3,8}\b/, semComentarios);
  afirmar(
    "nenhum hex solto no código novo",
    crus.length === 0,
    crus.join(", "),
  );
  const paletaAposentada = ocorrencias(
    novos,
    /\b(emerald|zinc|slate|gray|neutral|stone)-\d{2,3}\b/,
    semComentarios,
  );
  afirmar(
    "nenhum `emerald-*`, `zinc-*` ou primo de Tailwind no código novo",
    paletaAposentada.length === 0,
    paletaAposentada.join(", "),
  );
  const raiosSoltos = ocorrencias(
    novos,
    /\brounded-(none|sm|md|lg|xl|2xl|3xl|full|\[)/,
    semComentarios,
  );
  afirmar(
    "os raios do código novo são os da direção: cartão, controle e pílula",
    raiosSoltos.length === 0,
    raiosSoltos.join(", "),
  );
}

/* O guarda-chuva `radix-ui` não pode voltar pela porta do CLI do shadcn. */
{
  const pkg = JSON.parse(ler(path.join(raiz, "package.json")));
  afirmar(
    "o pacote guarda-chuva `radix-ui` continua fora das dependências",
    !pkg.dependencies?.["radix-ui"] && !pkg.devDependencies?.["radix-ui"],
    "ele traz uma segunda cópia de Portal e de contexto, em outra versão",
  );
  afirmar(
    "`@radix-ui/react-alert-dialog` é dependência de runtime",
    Boolean(pkg.dependencies?.["@radix-ui/react-alert-dialog"]),
  );
  afirmar("`sonner` é dependência de runtime", Boolean(pkg.dependencies?.sonner));
  afirmar(
    'script "verificar:interface" declarado',
    Boolean(pkg.scripts?.["verificar:interface"]),
  );
  afirmar(
    "`verificar` encadeia também a verificação de interface",
    /verificar:interface/.test(pkg.scripts?.verificar ?? ""),
    `encontrado: ${pkg.scripts?.verificar ?? "ausente"}`,
  );
}

/* O `sonner` precisa chegar ao bundle: dependência instalada e nunca embarcada
   foi exatamente o estado que esta story encontrou. */
{
  const bundles = arquivosDe(path.join(DIR_DIST, "assets"), [".js"]);
  const temSonner = bundles.some((b) => ler(b).includes("data-sonner-toaster"));
  afirmar(
    "o `sonner` chega ao bundle publicado",
    bundles.length > 0 && temSonner,
    bundles.length === 0 ? "sem dist/assets/*.js — rode `npm run build`" : "",
  );
}

/* ─── Veredito ───────────────────────────────────────────────────────── */

console.log("");
if (falhas === 0) {
  console.log("Interface verificada: todas as asserções passaram.");
  process.exitCode = 0;
} else {
  console.log(`Interface NÃO verificada: ${falhas} asserção(ões) falharam.`);
  process.exitCode = 1;
}
