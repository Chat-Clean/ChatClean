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
 * Importa um módulo do projeto, transformando a falha em asserção.
 *
 * Devolve `null` quando não dá — e a asserção falha alto, para que um módulo
 * que deixou de existir apareça como falha em vez de fazer a seção inteira
 * sumir em silêncio.
 */
async function tentarImportar(caminhoRelativo) {
  try {
    const modulo = await import(
      pathToFileURL(path.join(raiz, caminhoRelativo)).href
    );
    afirmar(`${caminhoRelativo} importa`, true);
    return modulo;
  } catch (erro) {
    afirmar(`${caminhoRelativo} importa`, false, String(erro?.message ?? erro));
    return null;
  }
}

/** Dois conjuntos com os mesmos elementos, ignorando ordem e repetição. */
function igualComoConjunto(a, b) {
  const x = [...new Set(a)].sort();
  const y = [...new Set(b)].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/** Lê um arquivo do projeto; ausência vira asserção falha, não exceção. */
function lerRelativoOuVazio(descricao, caminhoRelativo) {
  try {
    return ler(path.join(raiz, caminhoRelativo));
  } catch (erro) {
    afirmar(descricao, false, String(erro?.message ?? erro));
    return "";
  }
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
const CAMINHO_GAVETA = "src/admin/blog/GavetaDeMetadados.jsx";
const CAMINHO_PILULA = "src/admin/blog/PilulaDeEstado.jsx";
const CAMINHO_LISTA = "src/admin/blog/ListaDePosts.jsx";
/* A pré-visualização da Story 2.13 e o módulo puro dela. Elas entram na lista
   fechada pela mesma razão que a listagem entrou na 2.10: superfície nova do
   Painel que fica de fora não é julgada por hex solto, paleta aposentada nem
   raio da direção — e uma tela escrita com `zinc` e um hex passaria verde. */
const CAMINHO_PREVIA = "src/admin/blog/PreVisualizacaoDePost.jsx";
const CAMINHO_MODULO_DA_PREVIA = "src/admin/blog/previa.js";
const CAMINHO_MODULO_DAS_ROTAS = "src/admin/blog/rotas.js";
/* A tela de Categorias da Story 2.14 e os módulos dela. O comentário acima
   registra que a omissão de uma tela nova nesta lista já foi o defeito uma vez;
   esta é a primeira tela em que um dado do BANCO vira aparência, que é
   exatamente quando a tentação do hex solto e da classe montada aparece. */
const CAMINHO_TELA_DE_CATEGORIAS = "src/admin/blog/TelaDeCategorias.jsx";
const CAMINHO_PILULA_DE_CATEGORIA = "src/admin/blog/PilulaDeCategoria.jsx";
const CAMINHO_MODULO_DAS_CATEGORIAS = "src/admin/blog/categorias.js";
const CAMINHO_ICONES_DE_CATEGORIA = "src/admin/blog/iconesDeCategoria.js";
const CAMINHO_CATEGORIAS_DO_DOMINIO = "src/domain/blog/categorias.js";
const CAMINHO_TAGS_DO_DOMINIO = "src/domain/blog/tags.js";
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
  /* A listagem da Story 2.10 nasce sob as mesmas regras: toda cor por token,
     raio da direção, nada de `zinc` nem de hex solto. Ela é o primeiro pedaço do
     CORPO do Painel reconstruído — o corpo escuro que sobrou é o que a Story 1.5
     deixou explicitamente para o Épico 2. */
  CAMINHO_LISTA,
  /* A pré-visualização da Story 2.13 — a primeira tela do Painel com endereço
     próprio, e a primeira a mostrar o artigo. Ela veste tokens do Painel e do
     site ao mesmo tempo, o que a torna exatamente o tipo de superfície em que
     um hex solto passa despercebido. */
  CAMINHO_PREVIA,
  CAMINHO_MODULO_DA_PREVIA,
  CAMINHO_MODULO_DAS_ROTAS,
  /* A Story 2.14: a tela de Categorias, a pílula que a cor do dado pinta, e os
     vocabulários fechados que as duas consomem. */
  CAMINHO_TELA_DE_CATEGORIAS,
  CAMINHO_PILULA_DE_CATEGORIA,
  CAMINHO_MODULO_DAS_CATEGORIAS,
  CAMINHO_ICONES_DE_CATEGORIA,
  CAMINHO_CATEGORIAS_DO_DOMINIO,
  CAMINHO_TAGS_DO_DOMINIO,
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
const gaveta = lerOuFalhar(CAMINHO_GAVETA);
const pilula = lerOuFalhar(CAMINHO_PILULA);
const lista = lerOuFalhar(CAMINHO_LISTA);
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
    /* A Story 2.6 trocou o formulario de Post pela tela nova, entao as ancoras
       que citavam `savePost(` e o contador de caracteres deixaram de existir
       AQUI. As de agora sao o que a pagina tem hoje: a casca, o dialogo, as
       abas e a porta para a tela de edicao. */
    const ANCORAS = [
      "saveVaga(",
      'role="tabpanel"',
      "<BarraSuperior",
      "<DialogoDeConfirmacao",
      "<EditorDePost",
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

  /* As abas que a página entrega à casca.
     A contagem do Blog ganhou uma guarda na Story 2.10 — ela é `null` enquanto a
     listagem carrega, para a barra omitir o número em vez de anunciar zero a
     quem tem doze posts —, então o padrão não exige `formatarNumero` colado ao
     `contagem:`. O que ele continua exigindo é o que importa: as duas contagens
     passam pela FORMATAÇÃO. Trocar `formatarNumero` por interpolação crua
     continua falhando aqui. */
  const rotulos = [...pagina.matchAll(/rotulo:\s*"([^"]+)"/g)].map((m) => m[1]);
  afirmar(
    "a página declara as abas Blog e Carreiras com contagem formatada e link externo",
    rotulos.includes("Blog") &&
      rotulos.includes("Carreiras") &&
      contar(semComentarios(pagina), /contagem:[^,\n]*formatarNumero\(/g) === 2 &&
      contar(pagina, /href:\s*"\/(blog|carreiras)"/g) === 2,
    `contagens formatadas: ${contar(semComentarios(pagina), /contagem:[^,\n]*formatarNumero\(/g)}`,
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
    // As duas continuam POSICIONAIS E SEM PADRÃO: um valor padrão em qualquer
    // uma delas permitiria a chamada com uma metade só, que é o beco que a
    // assinatura existe para impedir. O que veio depois delas é opcional.
    /notificarErro\(oQueHouve,\s*oQueFazer\s*[,)]/.test(codigo) &&
      !/notificarErro\(oQueHouve\s*=/.test(codigo) &&
      !/notificarErro\(oQueHouve,\s*oQueFazer\s*=/.test(codigo) &&
      /diagnosticarMensagem\("o que houve"/.test(codigo) &&
      /diagnosticarMensagem\("o que fazer"/.test(codigo),
  );
  /*
   * A SAÍDA OPCIONAL (Story 2.9). Quando a recusa tem alternativa conhecida —
   * agendar para o passado, cuja saída é publicar agora —, ela vira um botão na
   * própria notificação. O rótulo passa pela guarda de RÓTULO DE AÇÃO, e não
   * pela de mensagem: a pessoa lê o botão antes de clicar, e aqui ela está
   * prestes a pôr um post no ar.
   */
  afirmar(
    "a saída opcional do erro vira botão, com o rótulo passando pela guarda de rótulo de ação",
    /notificarErro\(oQueHouve,\s*oQueFazer,\s*saida\s*=\s*null\)/.test(codigo) &&
      /exigir\(diagnosticarRotuloDeAcao\(saida\.rotulo\)\)/.test(codigo) &&
      /action\s*=\s*\{\s*label:\s*saida\.rotulo|action:\s*\{\s*label:\s*saida\.rotulo/.test(codigo),
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
  const encontradas = [];
  let sitiosEncontrados = 0;

  for (const escrita of GRAVAM) {
    const padrao = new RegExp(`\\b${escrita}\\(`, "g");
    let casou;
    while ((casou = padrao.exec(codigo)) !== null) {
      // A própria linha de `import` não é chamada.
      const linha = codigo.slice(codigo.lastIndexOf("\n", casou.index) + 1, casou.index);
      if (/^\s*import\b/.test(linha)) continue;

      sitiosEncontrados += 1;
      if (!encontradas.includes(escrita)) encontradas.push(escrita);
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

  /* QUAIS gravações a página faz, e não apenas quantas.
     O piso numérico era 4 e a Story 2.10 o teria derrubado para 3: excluir Post
     saiu junto com o `blogStore`, e o que sobrou na página é Carreiras. Um piso
     solto se ajusta a qualquer perda futura sem dizer nada; a lista NOMEADA
     acusa nas duas direções — uma gravação de vaga que desapareça (regressão em
     módulo fora de escopo) e uma gravação de Post que ressuscite no
     armazenamento do navegador. */
  const GRAVACOES_DE_CARREIRAS = ["saveVaga", "deleteVaga", "resetVagas"];
  const GRAVACOES_DE_POST = ["savePost", "deletePost", "resetPosts"];
  afirmar(
    "as gravações da página são exatamente as de Carreiras — Post não grava mais daqui",
    GRAVACOES_DE_CARREIRAS.every((f) => encontradas.includes(f)) &&
      GRAVACOES_DE_POST.every((f) => !encontradas.includes(f)) &&
      sitiosEncontrados >= GRAVACOES_DE_CARREIRAS.length,
    `encontradas: ${encontradas.join(", ") || "nenhuma"} (${sitiosEncontrados} sítios)`,
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

secao("(f2) Categoria: cor por token, ícone por mapa fechado (Story 2.14)");

{
  const categoriasDominio = await tentarImportar(
    "src/domain/blog/categorias.js",
  );
  const iconesDeCategoria = await tentarImportar(
    "src/admin/blog/iconesDeCategoria.js",
  );

  if (categoriasDominio) {
    const {
      CORES_DE_CATEGORIA,
      CHAVES_DE_ICONE_DE_CATEGORIA,
      COR_PADRAO,
      ICONE_PADRAO,
      aparenciaDaCor,
      aparenciaDaCategoria,
      ehCorDeCategoria,
      ehChaveDeIconeDeCategoria,
      iconeDaCategoria,
    } = categoriasDominio;

    afirmar(
      "o vocabulário de cor é uma lista congelada e não vazia",
      Object.isFrozen(CORES_DE_CATEGORIA) && CORES_DE_CATEGORIA.length > 0,
      JSON.stringify(CORES_DE_CATEGORIA),
    );
    afirmar(
      "o vocabulário de ícone é uma lista congelada e não vazia",
      Object.isFrozen(CHAVES_DE_ICONE_DE_CATEGORIA) &&
        CHAVES_DE_ICONE_DE_CATEGORIA.length > 0,
      JSON.stringify(CHAVES_DE_ICONE_DE_CATEGORIA),
    );
    afirmar(
      "a cor padrão e o ícone padrão estão dentro dos próprios vocabulários",
      ehCorDeCategoria(COR_PADRAO) && ehChaveDeIconeDeCategoria(ICONE_PADRAO),
      `${COR_PADRAO} | ${ICONE_PADRAO}`,
    );

    /* A CONFERÊNCIA É CONTRA A LISTA, e não contra as chaves de um objeto: com
       objeto, `ehCorDeCategoria("constructor")` responderia verdadeiro e a
       busca no catálogo devolveria uma função que ninguém declarou. É a mesma
       armadilha que `ehOperacao` evita, e ela vale aqui porque `cor` chega da
       rede no corpo de um pedido de escrita. */
    const HERDADOS = ["constructor", "__proto__", "toString", "hasOwnProperty"];
    afirmar(
      "nome herdado do protótipo não é cor nem ícone",
      HERDADOS.every((n) => !ehCorDeCategoria(n) && !ehChaveDeIconeDeCategoria(n)),
      HERDADOS.filter((n) => ehCorDeCategoria(n) || ehChaveDeIconeDeCategoria(n)).join(", "),
    );

    const pares = CORES_DE_CATEGORIA.map((c) => aparenciaDaCor(c));
    afirmar(
      "cada cor tem par por TOKEN, nunca hex solto e nunca classe utilitária",
      pares.every(
        ({ fundo, tinta }) =>
          /^var\(--categoria-[a-z]+-bg\)$/.test(fundo) &&
          /^var\(--categoria-[a-z]+-ink\)$/.test(tinta),
      ),
      JSON.stringify(pares),
    );
    afirmar(
      "os pares são distintos entre si",
      new Set(pares.map((p) => `${p.fundo}|${p.tinta}`)).size === pares.length,
    );
    afirmar(
      "a aparência devolvida é congelada",
      pares.every((p) => Object.isFrozen(p)),
    );

    afirmarQueLanca(
      "cor fora do vocabulário falha alto em `aparenciaDaCor`",
      () => aparenciaDaCor("red"),
    );
    /* Mas a LEITURA de uma linha do banco não pode lançar: a coluna nasce com
       `''`, e uma listagem inteira não pode cair por causa de uma linha. */
    afirmar(
      "Categoria sem cor cai na cor padrão em vez de derrubar a tela",
      aparenciaDaCategoria({ cor: "" }).fundo === COR_PADRAO &&
        aparenciaDaCategoria({}).fundo === COR_PADRAO &&
        aparenciaDaCategoria({ cor: "red" }).fundo === COR_PADRAO,
    );
    afirmar(
      "Categoria sem ícone cai no ícone padrão",
      iconeDaCategoria({}) === ICONE_PADRAO &&
        iconeDaCategoria({ icone: "inexistente" }) === ICONE_PADRAO,
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
        "todo token de Categoria citado pelo domínio está declarado em App.css",
        semDeclaracao.length === 0,
        semDeclaracao.join(", "),
      );
      const semCompilar = tokens.filter((t) => !cssCompilado.includes(`${t}:`));
      afirmar(
        "todo token de Categoria chega ao CSS compilado com valor",
        semCompilar.length === 0,
        semCompilar.join(", "),
      );
    }

    if (iconesDeCategoria) {
      /* A AUDITORIA BIDIRECIONAL: chave órfã falha, chave faltando falha. É a
         mesma trava do mapa de ícones do Editor, e ela existe porque a lista
         (que o SERVIDOR consulta para recusar) e o desenho (que só o Painel
         conhece) moram em arquivos diferentes de propósito — `api/` não importa
         `lucide-react` nem `admin/blog`. */
      afirmar(
        "o mapa de ícone de Categoria tem exatamente as chaves do vocabulário — nem chave sem desenho, nem desenho órfão",
        igualComoConjunto(
          Object.keys(iconesDeCategoria.ICONES_DE_CATEGORIA),
          [...CHAVES_DE_ICONE_DE_CATEGORIA],
        ),
        `mapa: ${Object.keys(iconesDeCategoria.ICONES_DE_CATEGORIA).join(", ")} | vocabulário: ${CHAVES_DE_ICONE_DE_CATEGORIA.join(", ")}`,
      );
      afirmar(
        "todo desenho é um componente de verdade (nenhuma entrada vazia)",
        Object.values(iconesDeCategoria.ICONES_DE_CATEGORIA).every(
          (icone) => typeof icone === "function" || typeof icone === "object",
        ),
      );
      afirmar(
        "o mapa é congelado — ninguém acrescenta um ícone em tempo de execução",
        Object.isFrozen(iconesDeCategoria.ICONES_DE_CATEGORIA),
      );
    }
  }

  /* A pílula de Categoria: o par vai por `style`, e o nome por extenso. */
  const fontePilulaDeCategoria = lerRelativoOuVazio(
    "src/admin/blog/PilulaDeCategoria.jsx legível",
    "src/admin/blog/PilulaDeCategoria.jsx",
  );
  if (fontePilulaDeCategoria) {
    const codigo = semComentarios(fontePilulaDeCategoria);
    afirmar(
      "a pílula de Categoria consome o vocabulário do domínio, não uma tabela própria",
      /from\s+["']@\/domain\/blog\/categorias["']/.test(codigo) &&
        /aparenciaDaCategoria\(/.test(codigo),
    );
    afirmar(
      "o par de cor é aplicado por `style`, com os valores do dado",
      /style=\{\{\s*backgroundColor:\s*fundo,\s*color:\s*tinta\s*\}\}/.test(codigo),
    );
    afirmar(
      "o ícone vem do mapa fechado, indexado pela chave do vocabulário",
      /ICONES_DE_CATEGORIA\[chave\]/.test(codigo),
    );
    afirmar(
      "a pílula de Categoria usa o raio de pílula e nenhum raio solto",
      /rounded-pilula/.test(codigo) && !/rounded-(full|xl|lg|md|sm)\b/.test(codigo),
    );
  }

  /* ─── NENHUMA LISTA DE CATEGORIA EXISTE NO FONTE ─────────────────────────
   *
   * Era o defeito que a Story 2.14 veio desfazer: as Categorias moravam em
   * constante, em TRÊS lugares que já divergiam entre si — e o terceiro, o
   * filtro público, tinha CINCO. "Novidades" não estava nele, e um post
   * publicado nela não era alcançável por filtro nenhum no site. Ninguém
   * percebeu porque não havia um lugar só que dissesse quais Categorias
   * existem.
   *
   * A asserção é sobre o FONTE, e por isso ela é estática: o que se cobra é a
   * ausência de uma segunda fonte de verdade. Que a leitura funciona está
   * provado em `verificar:dados`, contra o banco.
   */
  {
    /* Os nomes que estavam nas constantes. Eles são procurados como LITERAL de
       string no fonte inteiro — se alguém recriar a lista, o nome dela volta a
       aparecer escrito à mão. */
    const NOMES_QUE_ERAM_CONSTANTE = [
      "Tecnologia",
      "Estratégia",
      "Analytics",
      "Automação",
      "Tendências",
      "Novidades",
    ];
    /* A EXCEÇÃO SAIU COM O ARQUIVO (Story 2.15).
       Havia uma aqui: `src/data/blogPosts.js`, o conteúdo herdado do
       armazenamento no navegador, ficava de fora da varredura porque cada post
       dele declarava a categoria DELE. A exceção dizia por escrito que sairia
       nesta story, e saiu junto com o arquivo. Deixar a exceção depois do
       arquivo seria deixar a porta aberta para o próximo que precisar de "só
       mais uma listinha no fonte" — e a asserção logo abaixo cobra que o
       arquivo de fato não existe mais, senão a varredura teria voltado a
       tolerá-lo sem que ninguém decidisse isso. */
    const doFonte = fontesSrc;
    const comLista = [];
    for (const arquivo of doFonte) {
      const texto = semComentarios(ler(arquivo));
      /* DOIS nomes ou mais no MESMO arquivo é o sinal: um nome sozinho pode ser
         um exemplo num `placeholder`; dois são uma lista. */
      const achados = NOMES_QUE_ERAM_CONSTANTE.filter((nome) =>
        new RegExp(`["'\`]${nome}["'\`]`).test(texto),
      );
      if (achados.length >= 2) comLista.push(`${rel(arquivo)}: ${achados.join(", ")}`);
    }
    afirmar(
      "nenhuma lista de Categoria existe no fonte — elas vêm do banco, e só de lá",
      comLista.length === 0,
      comLista.join(" | "),
    );
    /* AUTOTESTE do detector: sem ele, um erro na expressão faria a varredura
       devolver zero achados e a asserção passaria por vacuidade — verde
       justamente sobre o repositório com a constante de volta. */
    {
      const amostra = `const categorias = ["Todos", "Tecnologia", "Estratégia"];`;
      const achados = NOMES_QUE_ERAM_CONSTANTE.filter((nome) =>
        new RegExp(`["'\`]${nome}["'\`]`).test(amostra),
      );
      afirmar(
        "autoteste: o detector encontra a constante que a story removeu",
        achados.length === 2,
        achados.join(", "),
      );
    }

    const filtroPublico = lerRelativoOuVazio(
      "src/pages/Blog.jsx legível",
      "src/pages/Blog.jsx",
    );
    afirmar(
      "o filtro do Blog Público lê as Categorias pela camada de dados",
      /from\s+["']@\/data\/blog\/taxonomia["']/.test(semComentarios(filtroPublico)) &&
        /listarCategorias\s*\(/.test(semComentarios(filtroPublico)),
      "sem isso, o filtro voltaria a ser uma constante — e foi de uma constante que “Novidades” sumiu",
    );

    /* E OS POSTS TAMBÉM VÊM DA CAMADA (Story 2.15). Até aqui a lista de
       Categorias vinha do banco e os Posts do armazenamento no navegador — a
       pastilha "Novidades" existia e não encontrava nada. As duas origens agora
       são a mesma. */
    afirmar(
      "a listagem do Blog Público lê os Posts pela camada de dados, com busca e filtro no banco",
      /from\s+["']@\/data\/blog\/posts["']/.test(semComentarios(filtroPublico)) &&
        /buscarPostsPublicos\s*\(/.test(semComentarios(filtroPublico)),
      "sem isso, os Posts voltariam a vir do armazenamento no navegador",
    );

    const artigoPublico = lerRelativoOuVazio(
      "src/pages/BlogPost.jsx legível",
      "src/pages/BlogPost.jsx",
    );
    afirmar(
      "o artigo público lê o Post pela camada de dados, pelo caminho anônimo por slug",
      /from\s+["']@\/data\/blog\/posts["']/.test(semComentarios(artigoPublico)) &&
        /lerPostPublicoPorSlug\s*\(/.test(semComentarios(artigoPublico)),
    );
    /* E NÃO DERIVA HTML. O renderizador único existe para a ESCRITA; a leitura
       mostra o que ficou gravado. Um `htmlDoDocumento` aqui faria o site
       mostrar o que o código de HOJE produziria, e não o que o Autor conferiu
       na prévia — é a mesma trava que a Story 2.13 pôs sobre a prévia. */
    afirmar(
      "e não deriva HTML em tempo de leitura: o artigo é o `conteudo_html` gravado",
      !/from\s+["']@\/render\//.test(artigoPublico) &&
        !/htmlDoDocumento/.test(semComentarios(artigoPublico)) &&
        /htmlGravado\s*\(/.test(semComentarios(artigoPublico)) &&
        /conteudo_html/.test(
          semComentarios(
            lerRelativoOuVazio(
              "src/pages/blogPublico.js legível",
              "src/pages/blogPublico.js",
            ),
          ),
        ),
      "derivar na hora mostraria o que o renderizador de hoje faria, não o que está no ar",
    );
  }
}

/* ═════════════════════════════════════════════════════════════════════ */

secao("(f3) nenhuma classe do Tailwind é montada em tempo de execução");

/*
 * A LACUNA QUE ESTA SEÇÃO FECHA.
 *
 * "Classe utilitária gerada em tempo de execução não existe no CSS compilado"
 * é uma das regras mais repetidas do projeto — e até a Story 2.14 ela existia
 * em DOIS COMENTÁRIOS e em nenhuma asserção. Comentário não falha.
 *
 * O Tailwind lê o código-fonte como TEXTO e só gera o utilitário cuja string
 * completa ele encontra. `bg-${cor}-500`, `` `text-state-${estado}` `` e
 * `"rounded-" + tamanho` produzem, em produção, elementos sem estilo nenhum —
 * e em desenvolvimento eles às vezes funcionam por acidente, porque a variante
 * inteira foi escrita em outro lugar. É o modo de falha mais difícil de ver: a
 * tela não quebra, ela só fica sem cor.
 *
 * O detector procura, dentro de literais de template e de concatenações, um
 * PREFIXO de utilitário conhecido seguido de interpolação. Ele é exercitado
 * antes de julgar o repositório — detector que nunca foi visto acusando é uma
 * promessa, não uma verificação.
 */
{
  /* Os prefixos de utilitário que carregam cor, tamanho e raio — os três que
     alguém teria motivo para montar a partir de dado. Lista de PERMISSÃO ao
     contrário não existe aqui: o que se procura é a FORMA da montagem, e a
     lista de prefixos serve para não acusar `${classe}` genérico, que é
     composição legítima (é o que `cn()` faz o tempo todo). */
  const PREFIXOS = [
    "bg", "text", "border", "ring", "fill", "stroke", "from", "via", "to",
    "rounded", "shadow", "size", "w", "h", "p", "m", "gap", "grid-cols",
  ].join("|");

  /** A classe é montada com interpolação? Devolve o trecho, ou `null`. */
  const classeInterpolada = (texto) => {
    const padroes = [
      // dentro de template: `bg-${x}`, `text-state-${x}`, `rounded-${x}`
      new RegExp(`(?:${PREFIXOS})-[a-z0-9-]*\\$\\{`),
      // por concatenação: "bg-" + x
      new RegExp(`["'](?:${PREFIXOS})-[a-z0-9-]*["']\\s*\\+`),
      // e o inverso: x + "-500"
      new RegExp(`\\+\\s*["']-[a-z0-9]+["']`),
    ];
    for (const padrao of padroes) {
      const casou = padrao.exec(texto);
      if (casou) return casou[0];
    }
    return null;
  };

  /* AUTOTESTE — os dois sentidos. Sem ele, uma expressão quebrada faria a
     varredura devolver zero achados e a asserção passaria por vacuidade,
     verde justamente sobre o repositório com o defeito. */
  const DEVE_ACUSAR = [
    "className={`bg-${cor}-500`}",
    'className={"text-" + estado}',
    "const c = `rounded-${tamanho}`;",
    "className={`border-state-${estado}-bg`}",
    'const c = prefixo + "-500";',
  ];
  const NAO_DEVE_ACUSAR = [
    'className={cn("bg-surface", className)}',
    "className={`${ANEL_DE_FOCO} rounded-controle`}",
    'style={{ backgroundColor: fundo }}',
    "const rotulo = `Excluir a categoria ${nome}`;",
    'const url = `/blog/${slug}`;',
  ];
  const escaparam = DEVE_ACUSAR.filter((t) => classeInterpolada(t) === null);
  const falsos = NAO_DEVE_ACUSAR.filter((t) => classeInterpolada(t) !== null);
  afirmar(
    "autoteste do detector: acusa classe montada por interpolação",
    escaparam.length === 0,
    `escaparam: ${escaparam.join(" | ")}`,
  );
  afirmar(
    "autoteste do detector: não acusa composição legítima nem interpolação de texto",
    falsos.length === 0,
    `falsos positivos: ${falsos.join(" | ")}`,
  );

  /* E agora o repositório. O alcance é o PAINEL inteiro — `admin/`, o domínio
     que ele consome e a página que o hospeda —, e não só os arquivos novos:
     a proibição vale em lugar nenhum do Painel, e restringi-la aos arquivos
     desta entrega deixaria o resto de fora justamente quando um dado do banco
     começa a chegar perto de virar aparência. */
  const doPainel = fontesSrc.filter((a) => {
    const caminho = rel(a);
    return (
      caminho.startsWith("src/admin/") ||
      caminho.startsWith("src/domain/blog/") ||
      caminho === CAMINHO_PAGINA
    );
  });
  afirmar(
    "há arquivos do Painel para varrer",
    doPainel.length > 0,
    "uma lista vazia faria a asserção seguinte passar por vacuidade",
  );
  const montadas = [];
  for (const arquivo of doPainel) {
    const texto = semComentarios(ler(arquivo));
    texto.split(/\r?\n/).forEach((linha, i) => {
      const achado = classeInterpolada(linha);
      if (achado !== null) montadas.push(`${rel(arquivo)}:${i + 1} (${achado})`);
    });
  }
  afirmar(
    "nenhuma classe do Tailwind é montada por interpolação em lugar nenhum do Painel",
    montadas.length === 0,
    montadas.slice(0, 8).join(" | "),
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
if (lista) {
  const codigo = semComentarios(lista);
  /* Onde cada dado vive DEPOIS da Story 2.10. O formulario de Post saiu da
     pagina na 2.6 (virou `EditorDePost` + `GavetaDeMetadados`) e a LISTAGEM
     saiu na 2.10 (virou `ListaDePosts`) — a pagina nao renderiza mais dado
     nenhum. A regra continua valendo, e precisa de guardiao no lugar novo:
     trocar de arquivo nao pode ser o jeito de perder a cobertura.

     Sao dois dados na linha: a data (`COALESCE(publicado_em, atualizado_em)`) e
     a contagem de minutos de leitura. O "para quando" do Post agendado tambem
     e data, e entra na lista pelo mesmo motivo. */
  const DADOS_NOMEADOS = [
    ["data, na linha da listagem", ">{data}<"],
    ["tempo de leitura, na linha da listagem", ">{tempo}<"],
    ["data do agendamento, ao lado do rótulo", ">{agendamento}<"],
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
    "na linha da listagem, data, tempo de leitura e a data do agendado usam `.dado`",
    semDado.length === 0,
    semDado.join(" | "),
  );

  /* E a PÁGINA não renderiza mais dado nenhum: se voltasse a renderizar, seria
     a listagem antiga ressuscitando ao lado da nova — que é exatamente a
     duplicidade de origem que esta story existe para acabar. */
  if (pagina) {
    const daPagina = semComentarios(pagina);
    afirmar(
      "a página não desenha mais linha de post: a listagem inteira vive em `ListaDePosts`",
      !/\{post\.\w+\}/.test(daPagina) && /<ListaDePosts\b/.test(daPagina),
      (daPagina.match(/\{post\.\w+\}/g) ?? []).join(", "),
    );
  }

  /* O dado migrou de casa na Story 2.6: slug, Data de Publicacao e tempo de
     leitura agora vivem na gaveta. A regra da Story 1.6 continua valendo, e
     precisa de guardiao no lugar novo — senao trocar de arquivo teria sido o
     jeito de perder a cobertura sem ninguem notar. */
  if (gaveta) {
    const codigoDaGaveta = semComentarios(gaveta);
    const NA_GAVETA = ["slug", "publicado_em", "tempo_leitura"];
    const semDadoNaGaveta = NA_GAVETA.filter((campo) => {
      const i = codigoDaGaveta.indexOf('campo("' + campo + '"');
      if (i === -1) return true;
      // A chamada declara `extra: "dado"` no proprio argumento do campo.
      const trecho = codigoDaGaveta.slice(i, i + 240);
      return !trecho.includes("dado");
    });
    afirmar(
      "na gaveta, slug, Data de Publicação e tempo de leitura usam `.dado`",
      semDadoNaGaveta.length === 0,
      semDadoNaGaveta.join(", "),
    );
    afirmar(
      "a data exibida em São Paulo também é dado, não prosa",
      /data-papel="data-em-sao-paulo"/.test(codigoDaGaveta) &&
        /className="dado"[^>]*data-papel="data-em-sao-paulo"|data-papel="data-em-sao-paulo"[^>]*className="dado"|className="dado"[sS]{0,80}data-papel="data-em-sao-paulo"/.test(codigoDaGaveta),
      "a exibição da data precisa da pilha monoespaçada",
    );
  }

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
  const {
    formatarData,
    formatarHora,
    formatarDataEHora,
    formatarDataEHoraPorExtenso,
    formatarNumero,
    FUSO_DE_APRESENTACAO,
  } = formato;

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
  /*
   * A DATA POR EXTENSO (Story 2.9). É o texto com que o Painel confirma um
   * agendamento, e o dia da semana está nele de propósito: é o que torna um
   * erro de fuso legível ANTES de o post ir ao ar.
   *
   * O par abaixo é o caso da meia-noite e meia, o erro de fuso mais silencioso
   * que existe aqui. Uma hora de diferença no instante muda o dia, o mês E o
   * dia da semana no texto — "terça-feira, 1º de setembro" contra
   * "segunda-feira, 31 de agosto". Ninguém confunde os dois; `01/09` e `31/08`,
   * de relance, sim.
   */
  afirmar(
    "data por extenso, com dia da semana, no fuso do negócio",
    formatarDataEHoraPorExtenso("2026-08-14T12:00:00Z") ===
      "sexta-feira, 14 de agosto de 2026, às 09:00",
    formatarDataEHoraPorExtenso("2026-08-14T12:00:00Z"),
  );
  afirmar(
    "00h30 em São Paulo é lido como o dia marcado, e não como o anterior",
    formatarDataEHoraPorExtenso("2026-09-01T03:30:00Z") ===
      "terça-feira, 1 de setembro de 2026, às 00:30" &&
      formatarDataEHoraPorExtenso("2026-09-01T02:30:00Z") ===
        "segunda-feira, 31 de agosto de 2026, às 23:30",
    `${formatarDataEHoraPorExtenso("2026-09-01T03:30:00Z")} | ${formatarDataEHoraPorExtenso("2026-09-01T02:30:00Z")}`,
  );
  afirmarQueLanca(
    "data civil não vira agendamento por extenso: sem hora não há instante",
    () => formatarDataEHoraPorExtenso("2026-08-14"),
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
    import {
      formatarData,
      formatarDataEHora,
      formatarDataEHoraPorExtenso,
      deCampoDeInstante,
    } from ${JSON.stringify(pathToFileURL(path.join(raiz, CAMINHO_FORMATO)).href)};
    process.stdout.write([
      formatarDataEHora("2026-01-01T02:00:00Z"),
      formatarData("2026-08-14"),
      formatarData("2026-01-01"),
      formatarDataEHoraPorExtenso("2026-09-01T03:30:00Z"),
      deCampoDeInstante("2026-09-01T00:30"),
    ].join("|"));
  `;
  /*
   * A data civil entra aqui de propósito: é justamente sob TZ diferente do
   * negócio que ela perderia o dia, e a máquina de quem roda a verificação pode
   * estar em São Paulo — onde o defeito não apareceria. A data por extenso entra
   * pelo mesmo motivo e diz mais: sob TZ errado, o dia da SEMANA muda junto.
   *
   * `deCampoDeInstante` é o SENTIDO CONTRÁRIO, e é o que faltava aqui — o
   * caminho por onde o agendamento entra. `new Date("2026-09-01T00:30")` é
   * meia-noite e meia no fuso da MÁQUINA: numa máquina em São Paulo ele produz
   * exatamente o valor certo, e uma substituição ingênua passaria despercebida
   * por quem desenvolve daqui. Sob `Asia/Tokyo` ela erra por doze horas.
   */
  const ESPERADO =
    "31/12/2025 23:00|14/08/2026|01/01/2026|" +
    "terça-feira, 1 de setembro de 2026, às 00:30|" +
    "2026-09-01T03:30:00.000Z";
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

/* ─── A FRONTEIRA DO MÓDULO MIGRADO (Story 2.10) ────────────────────────
 *
 * A aba Blog passou a ler o Supabase; a aba Carreiras continua no armazenamento
 * do navegador, de propósito — é módulo irmão, fora do escopo do módulo Blog, e
 * migrá-lo por simetria seria trabalho não pedido em código que ninguém revisou
 * nesta linha. A fronteira entre os dois é exatamente o que não pode escorregar:
 * uma leitura antiga que sobrevive "por segurança" na aba Blog é como o Painel
 * chegou a mostrar de uma origem e gravar noutra. */
{
  /* O detector é exercitado ANTES de julgar o repositório: um detector que nunca
     foi visto acusando é uma promessa, não uma verificação. */
  const importaDe = (fonte, modulo) =>
    new RegExp(`from\\s+["'][^"']*${modulo}["']`).test(semComentarios(fonte));

  /** O símbolo veio de FORA, por importação — e não de uma declaração local com
      o mesmo nome, que é como uma leitura de verdade vira dublê em silêncio. */
  const importaSimbolo = (fonte, simbolo, modulo) =>
    new RegExp(
      `import\\s*\\{[^}]*\\b${simbolo}\\b[^}]*\\}\\s*from\\s*["'][^"']*${modulo}["']`,
    ).test(semComentarios(fonte));

  afirmar(
    "detector de importação: acusa no código, ignora no comentário",
    importaDe('import { getPosts } from "@/lib/blogStore";', "blogStore") &&
      !importaDe("/* antes isto vinha de @/lib/blogStore */", "blogStore") &&
      !importaDe('import { getVagas } from "@/lib/vagasStore";', "blogStore"),
  );
  afirmar(
    "detector de símbolo importado: distingue o que vem do módulo do que é declarado ali mesmo",
    importaSimbolo(
      'import { listarPostsDoPainel, ordenarListagem } from "@/data/blog/posts";',
      "listarPostsDoPainel",
      "data/blog/posts",
    ) &&
      !importaSimbolo(
        'import { ordenarListagem } from "@/data/blog/posts";\nconst listarPostsDoPainel = async () => ({ ok: true, dados: [] });',
        "listarPostsDoPainel",
        "data/blog/posts",
      ),
  );

  if (pagina) {
    const daPagina = semComentarios(pagina);
    afirmar(
      "a aba Blog NÃO lê mais `blogStore`: nem a importação, nem uma chamada sobrevivente",
      !importaDe(pagina, "blogStore") &&
        !/\b(getPosts|savePost|deletePost|getPostBySlug)\s*\(/.test(daPagina),
      (daPagina.match(/\b(blogStore|getPosts|savePost|deletePost)\b/g) ?? []).join(", "),
    );
    afirmar(
      "e a aba Carreiras continua exatamente onde estava: `vagasStore` importado e as quatro funções em uso",
      importaDe(pagina, "vagasStore") &&
        ["getVagas", "saveVaga", "deleteVaga", "resetVagas"].every((f) =>
          new RegExp(`\\b${f}\\s*\\(`).test(daPagina),
        ),
      "Carreiras está fora de escopo e não pode regredir",
    );

    /* A costura, EXECUTADA: o trecho que a página roda quando o Editor salva é
       extraído e chamado. Um `handleSavePost` que não mexesse na versão passaria
       por qualquer leitura — e o Autor voltaria para uma lista que ainda não
       sabe do Post, que é o defeito inteiro desta story. */
    const extrair = (texto, nome) => {
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
    const trecho = extrair(daPagina, "handleSavePost");
    const achou = afirmar(
      "a declaração de `handleSavePost` foi encontrada na página",
      trecho !== null,
    );
    if (achou) {
      let versao = 7;
      try {
        const rodar = new Function(
          "setVersaoDaLista",
          `${trecho}\nreturn handleSavePost;`,
        );
        rodar((atualizar) => {
          versao = typeof atualizar === "function" ? atualizar(versao) : atualizar;
        })();
        afirmar(
          "salvar no Editor MUDA a versão da lista — é o que faz a listagem reler e o Post aparecer",
          versao === 8,
          `versão depois de salvar: ${versao}`,
        );
      } catch (erro) {
        afirmar("o trecho de `handleSavePost` roda isoladamente", false, erro.message);
      }
    }
    afirmar(
      "e a versão é o que a página entrega à listagem, por propriedade",
      /recarregarEm=\{versaoDaLista\}/.test(daPagina),
    );
  }

  if (lista) {
    const daLista = semComentarios(lista);
    afirmar(
      "quem lê os Posts é a camada de dados, com sessão — `listarPostsDoPainel`, e nada montado na tela",
      importaSimbolo(lista, "listarPostsDoPainel", "data/blog/posts") &&
        /\blistarPostsDoPainel\s*\(/.test(daLista) &&
        !importaDe(lista, "supabase") &&
        !/\.select\s*\(/.test(daLista),
    );
    afirmar(
      "e a ORDEM vem da camada: `ordenarListagem` importada, sem comparação escrita na tela",
      importaSimbolo(lista, "ordenarListagem", "data/blog/posts") &&
        /\bordenarListagem\s*\(/.test(daLista) &&
        !/\.sort\s*\(/.test(daLista),
    );
  }

  {
    const doPainel = arquivosDe(path.join(DIR_SRC, "admin"), [".js", ".jsx"]);
    const suspeitos = ocorrencias(doPainel, /\bblogStore\b/, semComentarios);
    afirmar(
      "nenhum arquivo do Painel conhece `blogStore` — a origem antiga não sobrevive em canto nenhum",
      doPainel.length > 0 && suspeitos.length === 0,
      suspeitos.join(", "),
    );
  }

  /* ─── O ARMAZENAMENTO NO NAVEGADOR SAIU DO PROJETO (Story 2.15) ───────
   *
   * A proibição existia para o Painel desde a Story 2.10, com uma fronteira: a
   * aba Blog não podia conhecer `blogStore`, mas as páginas públicas ainda
   * liam de lá — era de lá que os cinco posts de exemplo vinham. Agora o site
   * lê do banco, e a regra vale para o projeto INTEIRO, sem exceção.
   *
   * Carreiras continua com `vagasStore`, e continua fora de escopo: o que sai
   * é o armazenamento de POST, não a API do navegador. Proibir a API inteira
   * quebraria um módulo irmão que ninguém revisou nesta linha. */
  {
    const REMOVIDOS = ["src/lib/blogStore.js", "src/data/blogPosts.js"];
    const sobreviventes = REMOVIDOS.filter((c) => existsSync(path.join(raiz, c)));
    afirmar(
      "o armazenamento de Post no navegador e os posts de exemplo saíram do projeto",
      sobreviventes.length === 0,
      sobreviventes.join(", "),
    );

    const todosOsFontes = fontesSrc;
    afirmar(
      "há arquivos de `src/` para varrer",
      todosOsFontes.length > 0,
      "uma lista vazia faria as asserções seguintes passarem por vacuidade",
    );
    const PADRAO_REMOVIDO = /\b(blogStore|blogPosts)\b/;
    const PADRAO_ARMAZENAMENTO = /\b(localStorage|sessionStorage)\b|document\.cookie/;

    /* AUTOTESTE dos dois detectores, ANTES de julgar o repositório: uma
       varredura que nunca foi vista acusando é uma promessa, não uma
       verificação — e um erro na expressão devolveria zero achados, deixando as
       asserções verdes justamente sobre o armazenamento de volta. */
    afirmar(
      "autoteste dos detectores: acusam o que foi removido e ignoram o que é legítimo",
      PADRAO_REMOVIDO.test('import { getPosts } from "@/lib/blogStore";') &&
        PADRAO_REMOVIDO.test('import { blogPosts } from "@/data/blogPosts";') &&
        !PADRAO_REMOVIDO.test('import { getVagas } from "@/lib/vagasStore";') &&
        PADRAO_ARMAZENAMENTO.test("localStorage.setItem(KEY, valor);") &&
        PADRAO_ARMAZENAMENTO.test("const t = document.cookie;") &&
        !PADRAO_ARMAZENAMENTO.test("const guardado = memoria.get(chave);"),
    );

    const conhecem = ocorrencias(todosOsFontes, PADRAO_REMOVIDO, semComentarios);
    afirmar(
      "nenhum arquivo do projeto importa ou menciona o que foi removido — nem no Painel, nem nas páginas públicas",
      conhecem.length === 0,
      conhecem.join(", "),
    );

    /* E as duas páginas públicas não guardam Post no navegador por outro nome.
       A varredura é sobre ELAS, e não sobre `src/pages/` inteiro, porque
       `AdminBlog.jsx` e `Carreiras.jsx` hospedam Carreiras, que usa
       `localStorage` legitimamente e está fora de escopo. */
    const PUBLICAS = ["src/pages/Blog.jsx", "src/pages/BlogPost.jsx"];
    const publicas = PUBLICAS.map((c) => path.join(raiz, c)).filter((c) =>
      existsSync(c),
    );
    afirmar(
      "as duas páginas públicas do blog existem para serem varridas",
      publicas.length === PUBLICAS.length,
      `faltam: ${PUBLICAS.filter((c) => !existsSync(path.join(raiz, c))).join(", ")}`,
    );
    const guardam = ocorrencias(publicas, PADRAO_ARMAZENAMENTO, semComentarios);
    afirmar(
      "e nenhuma delas lê ou escreve Post no armazenamento do navegador — limpar os dados não muda post visível nenhum",
      guardam.length === 0,
      guardam.join(", "),
    );

    /* ─── E NENHUMA DELAS ALCANÇA A LEITURA DO PAINEL ──────────────────
     *
     * Antes desta story as páginas públicas não importavam `data/blog` nenhum;
     * agora as duas importam de `@/data/blog/posts` e de
     * `@/data/blog/taxonomia`, e a leitura do Painel mora nos MESMOS módulos, a
     * uma linha de distância. Ela usa o cliente com sessão: um Autor logado no
     * mesmo navegador passaria a ver rascunho em `/blog`, e nada mais no
     * projeto acusaria isso.
     *
     * A lista é de PROIBIÇÃO por natureza — são os nomes que existem — mas ela
     * é cobrada por IGUALDADE contra o que o módulo de dados de fato exporta
     * com "DoPainel" no nome: uma leitura do Painel nova entra na lista sozinha,
     * e uma que suma faz esta asserção falhar em vez de encolher em silêncio. */
    const LEITURAS_DO_PAINEL = [
      "listarPostsDoPainel",
      "lerPostDoPainelPorId",
      "listarCategoriasDoPainel",
      "listarTagsDoPainel",
      "listarTagsDoPostNoPainel",
    ].sort();
    {
      const exportadas = ["src/data/blog/posts.js", "src/data/blog/taxonomia.js"]
        .flatMap((rel) => {
          const fonte = existsSync(path.join(raiz, rel))
            ? semComentarios(ler(path.join(raiz, rel)))
            : "";
          /* `DoPainel` e `NoPainel`: o projeto usa as duas preposições
             (`lerPostDoPainelPorId`, `listarTagsDoPostNoPainel`), e uma só
             deixaria metade das leituras do Painel fora da lista. */
          return [
            ...fonte.matchAll(/export\s+(?:async\s+)?function\s+(\w*(?:Do|No)Painel\w*)/g),
          ].map((m) => m[1]);
        })
        .sort();
      afirmar(
        "a lista de leituras do Painel é EXATAMENTE o que a camada de dados exporta com esse nome — nem amostra, nem lista velha",
        JSON.stringify(exportadas) === JSON.stringify(LEITURAS_DO_PAINEL),
        `exportadas: [${exportadas.join(", ")}] | listadas: [${LEITURAS_DO_PAINEL.join(", ")}]`,
      );
    }
    const comLeituraDoPainel = [];
    for (const arquivo of publicas) {
      const texto = semComentarios(ler(arquivo));
      for (const nome of LEITURAS_DO_PAINEL) {
        if (new RegExp(`\\b${nome}\\b`).test(texto)) {
          comLeituraDoPainel.push(`${rel(arquivo)}: ${nome}`);
        }
      }
    }
    afirmar(
      "nenhuma página pública toca a leitura do PAINEL — ela usa o cliente com sessão, e o site inteiro passaria a mostrar rascunho a quem está logado",
      comLeituraDoPainel.length === 0,
      comLeituraDoPainel.join(" | "),
    );
    /* AUTOTESTE do detector: sem ele, um erro na expressão devolveria zero
       achados e a asserção passaria por vacuidade. */
    afirmar(
      "autoteste: o detector de leitura do Painel acusa o nome e ignora o parecido",
      LEITURAS_DO_PAINEL.some((n) =>
        new RegExp(`\\b${n}\\b`).test('const r = await listarPostsDoPainel();'),
      ) &&
        !LEITURAS_DO_PAINEL.some((n) =>
          new RegExp(`\\b${n}\\b`).test("const r = await listarPostsPublicos();"),
        ),
    );
  }
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

/* O ambiente do Supabase precisa CHEGAR ao artefato publicado.
 *
 * `src/data/supabase/clientes.js` lê `import.meta.env.VITE_*`, que o Vite
 * substitui estaticamente no build. Se o valor não estiver configurado na hora
 * de compilar, o bundle sai com a variável vazia, `exigirAmbiente()` lança e o
 * Painel abre em erro de configuração — sem nada falhar aqui, porque as demais
 * asserções são sobre o TEXTO do fonte.
 *
 * O que esta asserção prova e o que NÃO prova: ela confirma que o valor real
 * está no artefato. Ela NÃO prova que o valor é ALCANÇADO em tempo de execução
 * — um literal dentro de código morto continuaria presente. Essa prova é
 * executável e vive em `verificar:dados`, que reproduz a substituição estática
 * num gancho de carregamento e roda a camada com o ambiente do processo vazio.
 * As duas são complementares: esta pega ambiente ausente no build, aquela pega
 * o ramo do navegador quebrado. */
{
  const lerDoEnvDeVerdade = (nome) => {
    // Só `.env`, e nunca `.env.example`: cair para o exemplo faria a asserção
    // comparar o bundle com um valor que ninguém configurou.
    const caminho = path.join(raiz, ".env");
    if (!existsSync(caminho)) return null;
    for (const linha of readFileSync(caminho, "utf8").split(/\r?\n/)) {
      if (/^\s*#/.test(linha)) continue;
      const m = new RegExp(`^\\s*(?:export\\s+)?${nome}\\s*=\\s*(.*)$`).exec(linha);
      if (!m) continue;
      return m[1]
        .replace(/\s+#.*$/, "")
        .trim()
        .replace(/^["']|["']$/g, "");
    }
    return null;
  };

  const bundles = arquivosDe(path.join(DIR_DIST, "assets"), [".js"]);
  const juntos = bundles.map((b) => ler(b)).join("\n");
  for (const nome of ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"]) {
    const valor = lerDoEnvDeVerdade(nome);
    const temValor = afirmar(
      `${nome} está declarada em .env`,
      Boolean(valor),
      "sem ela não há como afirmar o que o bundle deveria conter",
    );
    if (temValor) {
      afirmar(
        `o valor real de ${nome} chega ao bundle publicado (substituição estática do Vite)`,
        bundles.length > 0 && juntos.includes(valor),
        bundles.length === 0
          ? "sem dist/assets/*.js — rode `npm run build`"
          : "o valor não foi inlined: o navegador abriria com ambiente vazio e toda leitura viraria erro de configuração",
      );
    }
  }
}

/* ─── (i) O par de erro, medido em vez de suposto ─────────────────────── */

secao("(i) o cartão de erro: tinta destrutiva sobre o próprio tom, calculada");

/*
 * O cartão de erro da listagem existe desde a Story 2.10, e a pré-visualização o
 * herdou. O par nunca passou por contraste: as ferramentas mediam pares OPACOS,
 * e este é COMPOSTO — a cor entra com alfa sobre o fundo do Painel.
 *
 * Compor à mão é o que faltava para a medida existir. Ela apontou um defeito
 * real: `--destructive` como TINTA sobre um tom dela mesma a 10% dava 3,71:1,
 * abaixo do piso de 4,5:1 — a mensagem que mais importa ler era a menos legível
 * da tela. `--destructive` continua como está (ele é cor de SUPERFÍCIE, com
 * tinta clara por cima, e nesse papel está certo); quem entrou foi
 * `--destructive-ink`, para o papel oposto.
 *
 * A medida é calculada, não afirmada, e usa o mesmo módulo autotestado das
 * outras ferramentas.
 */
{
  const { acharCssCompilado, corParaRgb, declaracoesDe, razaoContraste, resolver } =
    await import("./css-comum.mjs");

  const arquivo = acharCssCompilado(raiz);
  const css = arquivo ? readFileSync(arquivo, "utf8") : null;
  const temCss = afirmar(
    "há CSS compilado para medir o par de erro",
    css !== null,
    "rode `npm run build`",
  );

  /* AS TELAS QUE MONTAM O CARTÃO usam a tinta, e não a superfície. Sem esta
     linha a medida abaixo julgaria um token que ninguém veste. */
  {
    const cartoes = [CAMINHO_LISTA, CAMINHO_PREVIA];
    const erradas = cartoes.filter((relativo) => {
      const fonte = existsSync(path.join(raiz, relativo))
        ? readFileSync(path.join(raiz, relativo), "utf8")
        : "";
      return (
        !/text-destructive-ink\b/.test(fonte) ||
        /(?:^|[\s"'`])(?:text|bg|border)-destructive\/(?!.*-ink)/.test(fonte)
      );
    });
    afirmar(
      "os cartões de erro vestem a TINTA de perigo, e não a superfície — o papel é o oposto, e o token também",
      erradas.length === 0,
      erradas.join(", "),
    );
  }

  if (temCss) {
    const root = declaracoesDe(css, ":root");
    const painel = declaracoesDe(css, ".painel");
    const escopo = new Map([...root, ...painel]);

    const tinta = corParaRgb(resolver("var(--destructive-ink)", escopo) ?? "");
    const fundoDaTela = corParaRgb(resolver("var(--background)", escopo) ?? "");

    const resolveu = afirmar(
      "as duas cores do cartão de erro resolvem no escopo do Painel",
      tinta !== null && fundoDaTela !== null,
      `tinta: ${resolver("var(--destructive-ink)", escopo)} | fundo: ${resolver("var(--background)", escopo)}`,
    );

    if (resolveu) {
      /** A cor com alfa, achatada sobre o que está atrás dela. */
      const compor = (frente, atras, alfa) =>
        frente.map((c, i) => Math.round(c * alfa + atras[i] * (1 - alfa)));
      const paraHex = (rgb) =>
        `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;

      const fundoDoCartao = compor(tinta, fundoDaTela, 0.1);
      const borda = compor(tinta, fundoDaTela, 0.7);

      const razaoDoTexto = razaoContraste(paraHex(tinta), paraHex(fundoDoCartao));
      afirmar(
        "a tinta destrutiva sobre o fundo composto do cartão passa no piso de 4,5:1 — texto",
        razaoDoTexto !== null && razaoDoTexto >= 4.5,
        `${paraHex(tinta)} sobre ${paraHex(fundoDoCartao)} = ${razaoDoTexto?.toFixed(2)}:1`,
      );

      const razaoDaBorda = razaoContraste(paraHex(borda), paraHex(fundoDaTela));
      afirmar(
        "e a borda composta se distingue do fundo da tela no piso de 3:1 — elemento não textual",
        razaoDaBorda !== null && razaoDaBorda >= 3,
        `${paraHex(borda)} sobre ${paraHex(fundoDaTela)} = ${razaoDaBorda?.toFixed(2)}:1`,
      );

      /* AUTOTESTE da composição: alfa 1 é a própria cor, alfa 0 é o fundo. Sem
         isto, uma composição invertida daria números plausíveis e errados. */
      afirmar(
        "a composição por alfa é exercitada nos dois extremos — alfa 1 é a cor, alfa 0 é o fundo",
        paraHex(compor(tinta, fundoDaTela, 1)) === paraHex(tinta) &&
          paraHex(compor(tinta, fundoDaTela, 0)) === paraHex(fundoDaTela),
      );
    }
  }
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
