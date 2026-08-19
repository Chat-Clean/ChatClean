#!/usr/bin/env node
/**
 * Ferramenta de verificação da fundação de design (Story 1.1).
 *
 * Roda sobre o CSS que o `vite build` gera — o artefato que as telas de fato
 * consomem — e afirma, uma asserção por linha da matriz de I/O da story:
 *
 *   (a) `components.json` existe, parseia e declara os aliases; os quatro
 *       componentes shadcn do baseline continuam byte a byte iguais; e
 *       `src/components/ui/skeleton.jsx`, instalado pelo CLI, existe.
 *   (b) `:root` no CSS compilado mantém os neutros do shadcn e nenhuma
 *       declaração de marca — comparado declaração a declaração com o
 *       baseline, que é a evidência objetiva de não-regressão.
 *   (c) `.painel` remapeia o conjunto completo de tokens do shadcn para a
 *       marca e os valores da marca chegam íntegros ao CSS compilado.
 *   (d) `--chart-1..5` e `--sidebar*` resolvem para valor concreto.
 *   (e) contraste WCAG 2.1 dos pares que a direção visual promete.
 *   (f) `npm run lint` sai com código 0 e o gerenciador de pacotes é único.
 *
 * O baseline vive em `verificacao/baseline/` (versionado, não ignorado):
 *   - `dist-index.baseline.css`   CSS compilado antes da story
 *   - `fonte-App.baseline.css`    `src/App.css` antes da story
 *   - `componentes-ui/*.jsx`      os quatro componentes shadcn pré-existentes
 *
 * Uso:
 *   npm run build && npm run verificar
 *   node scripts/verificar-fundacao.mjs --gravar-baseline
 *
 * `--gravar-baseline` REGRAVA os três artefatos a partir do estado atual do
 * repositório. É a única forma de o script escrever em disco: sem a flag ele
 * apenas lê. Use só ao estabelecer um baseline novo e deliberado — regravar
 * por engano destrói a evidência de não-regressão, porque o baseline passa a
 * ser idêntico ao estado que deveria auditar.
 *
 * Saída: uma linha por asserção; código 0 se todas passarem, 1 caso contrário.
 */

import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* O leitor de CSS e o cálculo de contraste nasceram aqui e moram em
   `css-comum.mjs` desde que a verificação do artigo (Story 2.3) passou a
   precisar dos mesmos: duas cópias divergentes seriam duas verdades sobre o
   mesmo arquivo. */
import {
  acharCssCompilado as acharCssEm,
  analisar,
  casosDeAutoteste,
  cssCompiladosEm,
  declaracoes,
  declaracoesDe,
  indicePorSeletor,
  mascarar,
  razaoContraste,
  regras,
  resolver,
  semCR,
} from "./css-comum.mjs";
/* O vocabulário de cor de Categoria vem do DOMÍNIO, importado e executado.
   Reescrever a lista aqui mediria uma segunda lista, e a cor nova entraria no
   produto sem passar por medida nenhuma — que é exatamente o que esta seção
   existe para impedir. */
import {
  CORES_DE_CATEGORIA,
  aparenciaDaCor,
} from "../src/domain/blog/categorias.js";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const acharCssCompilado = () => acharCssEm(raiz);
const dirBaseline = path.join(raiz, "verificacao", "baseline");
const dirBaselineUi = path.join(dirBaseline, "componentes-ui");
const caminhoBaselineCss = path.join(dirBaseline, "dist-index.baseline.css");
const caminhoBaselineFonte = path.join(dirBaseline, "fonte-App.baseline.css");
const caminhoAppCss = path.join(raiz, "src", "App.css");
const dirUi = path.join(raiz, "src", "components", "ui");
const COMPONENTES_BASE = ["accordion", "badge", "button", "card"];

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

function ler(caminho) {
  return readFileSync(caminho, "utf8");
}

/**
 * Executa `acao` e devolve o valor; se a leitura estourar (arquivo ausente,
 * JSON malformado), conta uma asserção falha e devolve `null` — o script
 * segue até o fim em vez de morrer antes das seções seguintes.
 */
function lerOuFalhar(descricao, acao) {
  try {
    return acao();
  } catch (erro) {
    afirmar(descricao, false, erro.message);
    return null;
  }
}

/* ─── Gravação do baseline (única escrita do script) ─────────────────── */

function gravarBaseline() {
  const arquivoCss = acharCssCompilado();
  if (!arquivoCss) {
    console.log(
      "Não há `dist/assets/*.css` para gravar. Rode `npm run build` antes.",
    );
    process.exit(1);
  }
  mkdirSync(dirBaselineUi, { recursive: true });
  copyFileSync(arquivoCss, caminhoBaselineCss);
  copyFileSync(caminhoAppCss, caminhoBaselineFonte);
  for (const nome of COMPONENTES_BASE) {
    copyFileSync(
      path.join(dirUi, `${nome}.jsx`),
      path.join(dirBaselineUi, `${nome}.jsx`),
    );
  }
  console.log("Baseline regravado a partir do estado atual:");
  console.log(`  ${path.relative(raiz, caminhoBaselineCss)}`);
  console.log(`  ${path.relative(raiz, caminhoBaselineFonte)}`);
  for (const nome of COMPONENTES_BASE) {
    console.log(
      `  ${path.relative(raiz, path.join(dirBaselineUi, `${nome}.jsx`))}`,
    );
  }
  process.exit(0);
}

/* ─── Utilitários de arquivo ─────────────────────────────────────────── */

function arquivosJsx(dir) {
  const achados = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) achados.push(...arquivosJsx(completo));
    else if (entrada.name.endsWith(".jsx")) achados.push(completo);
  }
  return achados;
}

/**
 * Toda fonte capaz de citar um nome de classe — não só JSX.
 *
 * `.css` importa porque `src/index.css` define classes autorais que nenhum
 * `.jsx` menciona pelo nome; `.js` porque módulo utilitário monta className em
 * string. Ignora `node_modules` e não segue além de `src/`.
 */
function arquivosDeClasse(dir) {
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
      achados.push(...arquivosDeClasse(completo));
    } else if (/\.(jsx|js|css|html)$/.test(entrada.name)) {
      achados.push(completo);
    }
  }
  return achados;
}

/** Extrai o texto de cada atributo `className` de um fonte JSX. */
function atributosClassName(fonte) {
  const valores = [];
  const marcador = /className\s*=\s*/g;
  let m;
  while ((m = marcador.exec(fonte)) !== null) {
    let i = m.index + m[0].length;
    const abre = fonte[i];
    if (abre === '"' || abre === "'" || abre === "`") {
      let j = i + 1;
      while (j < fonte.length && fonte[j] !== abre) {
        if (fonte[j] === "\\") j += 1;
        j += 1;
      }
      valores.push(fonte.slice(i + 1, j));
      marcador.lastIndex = j + 1;
    } else if (abre === "{") {
      let profundidade = 1;
      let j = i + 1;
      while (j < fonte.length && profundidade > 0) {
        if (fonte[j] === "{") profundidade += 1;
        else if (fonte[j] === "}") profundidade -= 1;
        j += 1;
      }
      valores.push(fonte.slice(i + 1, j - 1));
      marcador.lastIndex = j;
    }
  }
  return valores;
}

/* ─── Modo gravação ──────────────────────────────────────────────────── */

if (process.argv.includes("--gravar-baseline")) gravarBaseline();

/* ─── Autoteste do leitor de CSS e do cálculo de contraste ───────────────
   O módulo compartilhado é o alicerce de tudo o que vem abaixo, e nenhuma
   asserção deste arquivo consegue perceber que ele está quebrado: medido por
   sabotagem, desligar uma guarda de `mascarar()` deixava esta ferramenta
   inteiramente verde. Os casos rodam ANTES de qualquer julgamento sobre o
   repositório, e contam no mesmo veredito. */

secao("Autoteste do leitor de CSS e do cálculo de contraste (css-comum.mjs)");

for (const [descricao, condicao, detalhe] of casosDeAutoteste()) {
  afirmar(descricao, condicao, detalhe);
}

/* ─── (a) shadcn operante ────────────────────────────────────────────── */

secao("(a) CLI do shadcn opera sobre os componentes existentes");

const components = lerOuFalhar("components.json existe e parseia", () =>
  JSON.parse(ler(path.join(raiz, "components.json"))),
);

if (components) {
  afirmar("components.json existe e parseia", true);
  const esperados = {
    components: "@/components",
    ui: "@/components/ui",
    lib: "@/lib",
    utils: "@/lib/utils",
    hooks: "@/hooks",
  };
  const aliases = components.aliases ?? {};
  for (const [chave, valor] of Object.entries(esperados)) {
    afirmar(
      `alias "${chave}" declarado como ${valor}`,
      aliases[chave] === valor,
      `encontrado: ${aliases[chave] ?? "ausente"}`,
    );
  }
  afirmar(
    "tailwind.css aponta para src/App.css",
    components.tailwind?.css === "src/App.css",
    `encontrado: ${components.tailwind?.css ?? "ausente"}`,
  );
  afirmar(
    "cssVariables habilitado e tsx desabilitado (projeto JSX)",
    components.tailwind?.cssVariables === true && components.tsx === false,
  );
}

// O CLI do shadcn precisa do mapa de caminhos para resolver o alias `@`.
const jsconfig = lerOuFalhar("jsconfig.json existe e parseia", () =>
  JSON.parse(ler(path.join(raiz, "jsconfig.json"))),
);
if (jsconfig) {
  afirmar(
    "jsconfig.json declara o alias @/* → ./src/*",
    jsconfig.compilerOptions?.paths?.["@/*"]?.[0] === "./src/*",
  );
}

if (existsSync(dirBaselineUi)) {
  for (const nome of COMPONENTES_BASE) {
    const atual = path.join(dirUi, `${nome}.jsx`);
    const anterior = path.join(dirBaselineUi, `${nome}.jsx`);
    const iguais =
      existsSync(atual) &&
      existsSync(anterior) &&
      semCR(ler(atual)) === semCR(ler(anterior));
    afirmar(`${nome}.jsx intocado desde o baseline (conteúdo idêntico)`, iguais);
  }
} else {
  afirmar(
    "snapshot dos componentes do baseline disponível",
    false,
    `ausente: ${path.relative(raiz, dirBaselineUi)}`,
  );
}

afirmar(
  "src/components/ui/skeleton.jsx existe (instalado pelo CLI)",
  existsSync(path.join(dirUi, "skeleton.jsx")),
);

/* ─── CSS compilado ──────────────────────────────────────────────────── */

secao("CSS compilado");

const cssEmDist = cssCompiladosEm(raiz).map((f) => path.basename(f));
const arquivoCss = acharCssCompilado();

afirmar(
  "dist/assets contém exatamente um .css (rode `npm run build` antes)",
  cssEmDist.length === 1,
  `encontrados: ${cssEmDist.length}${cssEmDist.length > 1 ? ` — ${cssEmDist.join(", ")}` : ""}`,
);

let cssCompilado = null;
if (arquivoCss) {
  cssCompilado = lerOuFalhar("CSS compilado legível", () => ler(arquivoCss));
  console.log(`        arquivo: ${path.relative(raiz, arquivoCss)}`);
  // Um `dist` obsoleto passaria por todas as asserções de CSS sem refletir a
  // fonte: o artefato verificado precisa ser mais novo que a fonte.
  const nascimentoCss = statSync(arquivoCss).mtimeMs;
  const nascimentoFonte = existsSync(caminhoAppCss)
    ? statSync(caminhoAppCss).mtimeMs
    : 0;
  afirmar(
    "CSS compilado é mais recente que src/App.css (build atual)",
    nascimentoCss >= nascimentoFonte,
    `css: ${new Date(nascimentoCss).toISOString()} < fonte: ${new Date(nascimentoFonte).toISOString()}`,
  );
}

const temCss = Boolean(cssCompilado);
if (temCss) {
  afirmar("varredura do CSS terminou com as chaves balanceadas", analisar(cssCompilado).balanceada);
}

const temBaselineCss = afirmar(
  "CSS do baseline presente para comparação",
  existsSync(caminhoBaselineCss),
  `esperado em ${path.relative(raiz, caminhoBaselineCss)}`,
);

const rootAtual = temCss ? declaracoesDe(cssCompilado, ":root") : new Map();
const painel = temCss ? declaracoesDe(cssCompilado, ".painel") : new Map();

/* ─── (b) `:root` intocado / não-regressão do site público ───────────── */

secao("(b) `:root` mantém o neutro do shadcn — nenhuma cor de marca");

if (temCss && temBaselineCss) {
  const baselineCss = lerOuFalhar("CSS do baseline legível", () =>
    ler(caminhoBaselineCss),
  );
  if (baselineCss) {
    afirmar(
      "varredura do CSS do baseline terminou balanceada",
      analisar(baselineCss).balanceada,
    );

    // Índice por SELETOR, não por prelude inteiro.
    //
    // O Tailwind agrupa seletores que compartilham declaração: ao surgir
    // `.text-primary-foreground\/80`, a regra que era `.text-primary-foreground`
    // vira `.text-primary-foreground,.text-primary-foreground\/80`. Comparar
    // preludes crus leria isso como "a regra desapareceu" — falso positivo — e,
    // pior, a asserção seguinte pularia as declarações dessa regra por não
    // achar a chave, deixando de vigiar justamente o que ela existe para
    // vigiar. Por seletor, agrupar deixa de mudar a resposta.
    const antes = indicePorSeletor(baselineCss);
    const depois = indicePorSeletor(cssCompilado);

    // Uma regra do baseline pode sumir por dois motivos opostos:
    //
    //   1. Regressão: alguém quebrou algo que ainda é usado. Intolerável.
    //   2. Consequência legítima: o código que usava aquela classe foi
    //      removido, e o Tailwind deixou de compilar o utilitário.
    //
    // A diferença é observável — basta perguntar se a classe ainda aparece na
    // fonte. Sem essa distinção, a única forma de uma story que remove UI
    // passar seria editar o baseline, e um baseline editável para acomodar o
    // código deixa de ser evidência de coisa alguma.
    // O corpus precisa ser TODA fonte que pode citar uma classe, não só `.jsx`.
    // As classes autorais de `src/index.css` (`glow-ring`, `link-underline`,
    // `bg-dot`, `shimmer`, `pulse-ring`, `border-gradient`, `animate-float`)
    // não aparecem em JSX nenhum: com o corpus só de `.jsx`, apagar qualquer
    // uma delas contaria como "perda justificada" e o site público perderia
    // efeito visual com a verificação verde.
    const fontesDeClasse = arquivosDeClasse(path.join(raiz, "src"));
    const caminhosExtras = [path.join(raiz, "index.html")].filter((f) =>
      existsSync(f),
    );
    const corpus = [...fontesDeClasse, ...caminhosExtras];

    /**
     * COMENTÁRIO DE CSS NÃO É CITAÇÃO DE CLASSE.
     *
     * O escâner do Tailwind lê os arquivos de CONTEÚDO — `.jsx`, `.html` — e de
     * lá extrai candidatos até de dentro de comentários; é literalmente assim
     * que `.inline{display:inline}` nasceu, da frase "Parser de markdown
     * inline" num comentário de `BlogPost.jsx`. O CSS **não** é fonte de
     * conteúdo: nada que esteja num comentário de `src/App.css` faz o Tailwind
     * emitir utilitário nenhum.
     *
     * Sem esta máscara, a prosa do CSS respondia "sim, ainda é citada" por
     * qualquer palavra que coincidisse com o nome de um utilitário — e a perda
     * legítima de `.inline`, quando o parser saiu (Story 2.15), era acusada
     * como regressão por causa da frase "imagem inline está fora do v1".
     *
     * O comentário de JSX continua contando, e é o lado conservador do
     * julgamento: lá ele é candidato de verdade.
     */
    const semComentariosCss = (texto) =>
      String(texto).replace(/\/\*[\s\S]*?\*\//g, (t) => t.replace(/[^\n]/g, " "));

    /**
     * PALAVRA DE DIRETIVA CSS NÃO É CITAÇÃO DE CLASSE — e a máscara vale SÓ
     * dentro do CSS.
     *
     * Medido, não suposto. `src/App.css` abre com `@theme inline {`; `inline`
     * ali é o modo da diretiva do Tailwind e nunca produziu utilitário nenhum.
     * Quando o markup que fazia o Tailwind emitir `.inline{display:inline}` saiu
     * do projeto (era a palavra "inline" DENTRO de um comentário do parser
     * artesanal, que o escâner lê como candidato), a perda legítima passou a ser
     * acusada como regressão por causa dessa palavra.
     *
     * ─── POR QUE SÓ NO CSS, E ISSO FOI MEDIDO ──────────────────────────────
     *
     * A primeira versão desta máscara rodava sobre o corpus INTEIRO, e o
     * prejuízo era maior do que o falso positivo que ela fechava: o `className`
     * de `src/components/ui/card.jsx` COMEÇA com `@container/card-header`, e
     * como a expressão só para em `{`, `;` ou fim de linha, ela apagava a linha
     * inteira — `auto-rows-min`, `grid-rows-[auto_auto]` e as duas variantes
     * junto. `.auto-rows-min` é regra real do baseline e aquela linha é a ÚNICA
     * citação dela no projeto: um upgrade do Tailwind que a derrubasse do CSS
     * compilado seria classificado como perda JUSTIFICADA, com a asserção verde
     * — que é exatamente o modo de falha que o baseline existe para pegar.
     *
     * ─── E TRÊS DIRETIVAS SAÍRAM DA LISTA, PELO ARGUMENTO DE `@apply` ──────
     *
     * `@apply`, `@variant`, `@source`, `@custom-variant` e `@utility` recebem —
     * ou geram — nome de utilitário: `@source inline("…")` existe justamente
     * para FORÇAR a geração, `@custom-variant dark (&:is(.dark *))` traz `.dark`
     * no prelúdio, e `@utility nome {` declara um. Mascarar qualquer uma delas
     * absolveria a perda de uma classe que o CSS ainda pede.
     */
    const DIRETIVAS_SEM_UTILITARIO =
      /@(theme|layer|media|supports|import|plugin|config|keyframes|property|namespace|page|font-face|charset|container|reference)\b[^{;\n]*/g;
    const semDiretivas = (texto) =>
      String(texto).replace(DIRETIVAS_SEM_UTILITARIO, (t) => " ".repeat(t.length));

    /** O texto de um arquivo de CSS, como o julgamento de citação deve lê-lo. */
    const textoDeCss = (bruto) => semDiretivas(semComentariosCss(bruto));

    const textoDasFontes = corpus
      .map((f) => {
        try {
          const bruto = readFileSync(f, "utf8");
          return f.endsWith(".css") ? textoDeCss(bruto) : bruto;
        } catch {
          return "";
        }
      })
      .join("\n");

    // Piso: corpus vazio (diretório renomeado, erro de leitura) faria NENHUMA
    // classe parecer citada e, com isso, TODA perda viraria justificada — a
    // asserção passaria exatamente no pior cenário.
    afirmar(
      "há fonte suficiente para julgar as perdas do baseline",
      corpus.length > 0 && textoDasFontes.length > 0,
      "sem corpus, toda regra perdida seria absolvida por vacuidade",
    );

    /* ★ E O CORPUS PRECISA CONTINUAR CITANDO O QUE `card.jsx` CITA ★
       Medido, e é a razão de a máscara de diretiva valer só para `.css`: com
       ela rodando sobre o corpus INTEIRO, a linha de `className` que COMEÇA com
       `@container/card-header` era apagada por inteiro — e junto foi
       `auto-rows-min`, regra real do baseline cuja ÚNICA citação no projeto é
       aquela linha. A perda dela passaria a ser classificada como justificada,
       com a asserção verde.

       A conferência é sobre o corpus JÁ MONTADO, e não sobre o filtro: é a
       montagem que a máscara errada estraga, e um autoteste que alimente o
       filtro direto nunca veria isso. */
    {
      const CITACOES_DE_CARTAO = [
        "auto-rows-min",
        "grid-rows-[auto_auto]",
        "@container/card-header",
        "has-data-[slot=card-action]:grid-cols-[1fr_auto]",
      ];
      const sumiram = CITACOES_DE_CARTAO.filter((c) => !textoDasFontes.includes(c));
      afirmar(
        "o corpus continua citando os utilitários de `card.jsx` — nenhuma máscara pode apagar a linha inteira em que eles vivem",
        sumiram.length === 0,
        `sumiram do corpus: ${sumiram.join(", ")}`,
      );
    }

    /** Classes citadas no prelude de uma regra CSS, sem escapes do Tailwind. */
    const classesDe = (prelude) =>
      [...prelude.matchAll(/\.((?:\\.|[\w-])+)/g)]
        .map((m) => m[1].replace(/\\/g, ""))
        .filter(Boolean);

    /**
     * A fonte ainda pede ESTE seletor?
     *
     * Não basta a classe aparecer em algum lugar: precisa aparecer numa forma
     * que faça o Tailwind emitir exatamente o seletor que sumiu.
     *
     * Por limite de palavra, não por substring — `includes("flex")` casa dentro
     * de `flex-col`, e assim a perda de `.flex` seria absolvida por uma classe
     * que nada tem a ver com ela; `-` nunca é fronteira, por isso.
     *
     * E sem variante nem modificador: `hover:text-red-400` compila para
     * `.hover\:text-red-400:hover`, e `bg-red-500/10` para
     * `.bg-red-500\/10` — dois seletores DIFERENTES do `.text-red-400` e do
     * `.bg-red-500` nus. Contar essas formas como citação marcava como
     * regressão a consequência normal de remover o único markup que usava a
     * forma nua, e a única saída seria regravar o baseline. `:` e `/` entram
     * na fronteira justamente para separar as três formas.
     *
     * A fronteira é SIMÉTRICA. Enquanto `:` valia só à esquerda, `dark:bg-x` na
     * fonte fazia a perda de `.dark` ser acusada como regressão — e `dark:bg-x`
     * compila para `.dark\:bg-x`, que nunca emitiu `.dark`. Um lado sozinho
     * pega metade dos casos e inventa a outra metade.
     */
    const citada = (classe, texto) => {
      const escapada = classe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^\\w\\-:/])${escapada}($|[^\\w\\-:/])`).test(texto);
    };


    /**
     * Separa as perdas em injustificadas (regressão) e justificadas (o markup
     * que usava a classe saiu junto). Devolvida como função para que o
     * autoteste abaixo a exercite com fontes sintéticas.
     */
    const julgarPerdas = (perdidos, texto) => {
      const injustificadas = [];
      const justificadas = [];
      // Corpus vazio não absolve NADA. Sem esta guarda, um diretório renomeado
      // ou um erro de leitura faria nenhuma classe parecer citada e toda perda
      // viraria justificada — a asserção passaria no pior cenário possível.
      // O corpus já chega tratado: quem lê CSS aplica `textoDeCss` no arquivo,
      // e o resto entra cru. Tratar aqui de novo alcançaria também os `.jsx`,
      // que foi exatamente o defeito medido em `card.jsx`.
      const semCorpus = String(texto).trim() === "";
      const alvo = String(texto);
      for (const p of perdidos) {
        const classes = classesDe(p);
        // Regra sem classe (elemento, `:root`, pseudo) nunca some por remoção
        // de markup: se sumiu, é regressão.
        const semExplicacao =
          semCorpus || classes.length === 0 || classes.some((c) => citada(c, alvo));
        (semExplicacao ? injustificadas : justificadas).push(p);
      }
      return { injustificadas, justificadas };
    };

    // Antes de confiar no filtro, exercitá-lo: perdas que ele DEVE acusar e
    // perdas que ele DEVE absolver. Sem isto, "nenhuma perda injustificada"
    // seria uma promessa, não uma verificação.
    {
      const fonteFalsa = 'className="flex-col rounded-cartao"';
      const julgado = julgarPerdas(
        [".flex", ".rounded-cartao", ".border-red-500", "*"],
        fonteFalsa,
      );
      afirmar(
        "filtro de perdas: acusa classe ainda citada e regra sem classe",
        julgado.injustificadas.length === 2 &&
          julgado.injustificadas.includes(".rounded-cartao") &&
          julgado.injustificadas.includes("*"),
        `acusou: ${julgado.injustificadas.join(", ") || "nada"}`,
      );
      afirmar(
        "filtro de perdas: `flex-col` na fonte não absolve a perda de `.flex`",
        // Este é o furo do casamento por substring: `includes("flex")` casaria
        // dentro de `flex-col` e a perda de `.flex` seria ABSOLVIDA por uma
        // classe que nada tem a ver com ela.
        julgado.justificadas.includes(".flex"),
        `justificadas: ${julgado.justificadas.join(", ") || "nada"}`,
      );
      afirmar(
        "filtro de perdas: absolve classe que saiu da fonte junto com o markup",
        julgado.justificadas.includes(".border-red-500"),
        `justificadas: ${julgado.justificadas.join(", ") || "nada"}`,
      );
      afirmar(
        "filtro de perdas: corpus vazio não absolve nada",
        julgarPerdas([".border-red-500", ".flex"], "").injustificadas.length === 2,
      );

      // Variante e modificador compilam para OUTRO seletor. A forma nua que
      // sumiu foi mesmo removida; a forma que restou nunca a produziu.
      const soComVariante = 'className="hover:text-red-400 hover:bg-red-500/10"';
      const comVariante = julgarPerdas(
        [".text-red-400", ".bg-red-500", ".hover\\:text-red-400"],
        soComVariante,
      );
      afirmar(
        "filtro de perdas: `hover:text-red-400` na fonte não absolve… nem acusa `.text-red-400`",
        comVariante.justificadas.includes(".text-red-400") &&
          comVariante.justificadas.includes(".bg-red-500"),
        `injustificadas: ${comVariante.injustificadas.join(", ") || "nenhuma"}`,
      );
      afirmar(
        "filtro de perdas: a forma COM variante, essa sim, continua sendo acusada",
        comVariante.injustificadas.includes(".hover\\:text-red-400"),
        `justificadas: ${comVariante.justificadas.join(", ") || "nenhuma"}`,
      );
      // E o contrário: a classe nua escrita na fonte acusa como sempre acusou.
      afirmar(
        "filtro de perdas: classe nua na fonte continua acusando a perda",
        julgarPerdas([".text-red-400"], 'className="text-red-400"').injustificadas
          .length === 1,
      );
      // Fronteira DIREITA: `dark:bg-x` compila para `.dark\:bg-x` e nunca
      // emitiu `.dark`. Enquanto `:` valia só à esquerda, a perda de `.dark`
      // era acusada como regressão por causa de uma classe sem relação com ela.
      afirmar(
        "filtro de perdas: `dark:bg-x` na fonte não faz `.dark` parecer citada",
        julgarPerdas([".dark"], 'className="dark:bg-x"').justificadas.includes(".dark"),
      );
      afirmar(
        "filtro de perdas: mas `.dark` escrita de fato continua acusando",
        julgarPerdas([".dark"], '<div class="dark">').injustificadas.includes(".dark"),
      );

      /* ─── A MÁSCARA DO CSS, NOS DOIS SENTIDOS E NOS DOIS ARQUIVOS ──────
         Foi o `@theme inline` de `src/App.css` que fez a perda legítima de
         `.inline` ser acusada como regressão quando o parser artesanal saiu
         (Story 2.15) — palavra em prelúdio de diretiva nunca produziu
         utilitário nenhum. O que estas linhas cobram é que a máscara continue
         valendo SÓ para CSS, e SÓ para as diretivas que não recebem
         utilitário. */
      afirmar(
        "máscara de CSS: `@theme inline` NÃO conta como citação de `.inline` — é modo de diretiva, não classe",
        julgarPerdas([".inline"], textoDeCss("@theme inline {\n  --x: 1;\n}")).justificadas.includes(
          ".inline",
        ),
      );
      afirmar(
        "máscara de CSS: mas a classe escrita de fato continua acusando, no mesmo arquivo",
        julgarPerdas(
          [".inline"],
          textoDeCss("@theme inline {\n  --x: 1;\n}\n.inline { display: inline }"),
        ).injustificadas.includes(".inline"),
      );

      /* ★ O DEFEITO QUE A PRIMEIRA VERSÃO DESTA MÁSCARA INTRODUZIU ★
         Ela rodava sobre o corpus inteiro. O `className` de `card.jsx` COMEÇA
         com `@container/card-header`, e a máscara apagava a linha toda —
         `auto-rows-min` incluído, que é regra do baseline com UMA única
         citação no projeto. Aqui a forma real do arquivo é alimentada como
         JSX, e o que se cobra é que os utilitários seguintes continuem
         contando. */
      const CLASSE_DO_CARTAO =
        '"@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6"';
      afirmar(
        "corpus: numa linha de JSX que COMEÇA com algo parecido com diretiva, os utilitários seguintes continuam contando",
        julgarPerdas(
          [".auto-rows-min", ".grid-rows-\\[auto_auto\\]"],
          CLASSE_DO_CARTAO,
        ).injustificadas.length === 2,
        JSON.stringify(
          julgarPerdas([".auto-rows-min"], CLASSE_DO_CARTAO).justificadas,
        ),
      );
      /* E o autoteste do autoteste: a mesma linha, se fosse tratada como CSS,
         seria mesmo apagada — é o que prova que a restrição a `.css` é o que
         está segurando a garantia, e não um acaso da expressão. */
      afirmar(
        "e é a restrição a `.css` que segura isso — tratada como CSS, a mesma linha seria apagada",
        julgarPerdas(
          [".auto-rows-min"],
          textoDeCss(CLASSE_DO_CARTAO),
        ).justificadas.includes(".auto-rows-min"),
      );

      /* ─── AS CINCO DIRETIVAS QUE RECEBEM (OU GERAM) UTILITÁRIO ─────────
         Mascarar qualquer uma delas absolveria a perda de uma classe que o CSS
         ainda pede. `@source inline("…")` existe justamente para FORÇAR a
         geração; `@custom-variant dark (&:is(.dark *))` é a linha 18 de
         `src/App.css` e traz `.dark` no prelúdio; `@utility` declara um. */
      afirmar(
        "máscara de CSS: `@apply` continua contando — ele recebe utilitário de verdade",
        julgarPerdas([".prose"], textoDeCss("@layer base {\n  .x { @apply prose; }\n}")).injustificadas.includes(
          ".prose",
        ),
      );
      afirmar(
        "máscara de CSS: `@source inline(\"…\")` continua contando — ele existe para FORÇAR a geração do utilitário",
        julgarPerdas([".size-4"], textoDeCss('@source inline("size-4");')).injustificadas.includes(
          ".size-4",
        ),
      );
      afirmar(
        "máscara de CSS: `@custom-variant dark (&:is(.dark *))` continua citando `.dark`",
        julgarPerdas([".dark"], textoDeCss("@custom-variant dark (&:is(.dark *));")).injustificadas.includes(
          ".dark",
        ),
      );
      afirmar(
        "máscara de CSS: `@utility` continua contando — ele DECLARA um utilitário",
        julgarPerdas([".tabular"], textoDeCss("@utility tabular {\n  font-variant-numeric: tabular-nums;\n}")).injustificadas.includes(
          ".tabular",
        ),
      );
      afirmar(
        "máscara de CSS: `@variant` continua contando",
        julgarPerdas([".dark"], textoDeCss(".x { @variant dark { color: red } }")).injustificadas.includes(
          ".dark",
        ),
      );

      /* E a máscara de COMENTÁRIO de CSS, também nos dois sentidos. */
      afirmar(
        "corpus: comentário de CSS não vira citação de classe — a prosa do arquivo não pinta pixel",
        !/\binline\b/.test(
          semComentariosCss("/* imagem inline está fora do v1 */\n.x { color: red }"),
        ) &&
          /color: red/.test(
            semComentariosCss("/* imagem inline */\n.x { color: red }"),
          ),
        semComentariosCss("/* imagem inline */\n.x { color: red }"),
      );
      afirmar(
        "e a classe escrita FORA do comentário continua contando",
        julgarPerdas(
          [".inline"],
          textoDeCss("/* imagem inline */\n.inline { display: inline }"),
        ).injustificadas.includes(".inline"),
      );
      afirmar(
        "máscara de CSS: ela para no `{` e não engole o corpo da regra",
        julgarPerdas(
          [".rounded-cartao"],
          textoDeCss("@layer base {\n  .rounded-cartao { color: red }\n}"),
        ).injustificadas.includes(".rounded-cartao"),
      );
    }

    const preludesPerdidos = [...antes.keys()].filter((p) => !depois.has(p));
    const { injustificadas, justificadas } = julgarPerdas(
      preludesPerdidos,
      textoDasFontes,
    );
    afirmar(
      "nenhuma regra do baseline desapareceu sem que sua classe saísse da fonte",
      injustificadas.length === 0,
      injustificadas.slice(0, 5).join(" | "),
    );
    if (justificadas.length > 0) {
      // Nomeadas, não contadas: um número solto não é auditável, e é
      // justamente aqui que uma remoção indevida se esconderia.
      console.log(
        `        ${justificadas.length} regra(s) saíram junto com o markup que as usava:`,
      );
      for (const p of justificadas) console.log(`          ${p}`);
    }

    /**
     * A variável ainda é lida por alguma regra do CSS compilado?
     *
     * O Tailwind só emite a variável do tema que algum utilitário consome:
     * `--color-red-600` existe porque existia `.hover\:bg-red-600`. Removido o
     * último markup que a usava, a variável some junto — e uma variável que
     * NINGUÉM referencia não pinta pixel nenhum. Essa é a única forma de perda
     * de declaração que pode ser absolvida, e é absolvida por prova, não por
     * suposição: se qualquer regra ainda escreve `var(--x)`, a perda continua
     * sendo regressão, porque aquela regra ficou sem valor.
     */
    const referenciada = (nome, texto) => {
      const escapada = nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`var\\(\\s*${escapada}\\s*[,)]`).test(texto);
    };

    /*
     * O corpus da prova é o CSS compilado MAIS a fonte JS/JSX.
     *
     * Nem todo `var(--x)` está no CSS: esta entrega introduziu tokens lidos
     * **só do JavaScript** — `--state-*` chega à pílula de Estado por `style`,
     * e `--popover`/`--border` chegam ao `Toaster` do mesmo jeito. Olhando só o
     * CSS compilado, no dia em que esses tokens saíssem de `:root` seriam
     * absolvidos como órfãos, e as pílulas renderizariam sem cor com a
     * verificação verde.
     */
    const corpusDeReferencias = `${cssCompilado}\n${textoDasFontes}`;

    {
      const amostraCss = ".a{color:var(--viva)}:root{--viva:red;--morta:blue}";
      afirmar(
        "detector de variável órfã: acusa a que é lida e absolve a que ninguém lê",
        referenciada("--viva", amostraCss) && !referenciada("--morta", amostraCss),
      );
      afirmar(
        "detector de variável órfã: não casa por prefixo (`--viva` vs `--viva-escura`)",
        !referenciada("--viva-escura", amostraCss),
      );
      const amostraJs = 'style={{ backgroundColor: "var(--state-publicado-bg)" }}';
      afirmar(
        "detector de variável órfã: enxerga `var()` escrito em JavaScript",
        referenciada("--state-publicado-bg", amostraJs),
      );
      // E, no repositório de verdade: os tokens que só o JS lê precisam contar
      // como referenciados. Se esta asserção falhar, o corpus voltou a ser só
      // o CSS e os pares de Estado ficaram desprotegidos.
      const soNoJs = ["--state-publicado-bg", "--state-arquivado-ink"].filter(
        (t) => !referenciada(t, corpusDeReferencias),
      );
      afirmar(
        "os tokens lidos apenas pelo JavaScript contam como referenciados",
        soNoJs.length === 0,
        soNoJs.join(", "),
      );
    }

    /* `indexOf` devolvendo -1 faria `slice(0, -1)` cortar o último caractere e
       devolver quase-a-declaração-inteira como se fosse o nome. Funcionava por
       acidente: o nome errado nunca começa com `--`, então a órfã não era
       absolvida — mas o acidente não é contrato. */
    const nomeDa = (decl) => {
      const corte = decl.indexOf(":");
      return corte === -1 ? decl : decl.slice(0, corte);
    };

    const declaracoesPerdidas = [];
    const variaveisOrfas = [];
    for (const [prelude, conjunto] of antes) {
      const agora = depois.get(prelude);
      if (!agora) continue;
      const nomesAgora = new Set([...agora].map(nomeDa));
      for (const decl of conjunto) {
        if (agora.has(decl)) continue;
        const nome = nomeDa(decl);
        // Sumiu de vez (não é mudança de valor) E ninguém mais a lê.
        if (
          nome.startsWith("--") &&
          !nomesAgora.has(nome) &&
          !referenciada(nome, corpusDeReferencias)
        ) {
          variaveisOrfas.push(`${prelude} { ${decl} }`);
          continue;
        }
        declaracoesPerdidas.push(`${prelude} { ${decl} }`);
      }
    }
    afirmar(
      "nenhuma declaração do baseline foi removida ou alterada (só adição)",
      declaracoesPerdidas.length === 0,
      declaracoesPerdidas.slice(0, 8).join(" | "),
    );
    if (variaveisOrfas.length > 0) {
      // Nomeadas, não contadas: é aqui que uma remoção indevida se esconderia.
      console.log(
        `        ${variaveisOrfas.length} variável(is) do tema saíram por não ter mais quem as leia:`,
      );
      for (const v of variaveisOrfas) console.log(`          ${v}`);
    }

    // A camada base é o vetor de regressão: aplica borda e contorno a tudo.
    const regraCoringa = (css) =>
      regras(css)
        .filter(({ prelude }) => prelude === "*" || /^\*\s*,/.test(prelude))
        .map(({ prelude, corpo }) => `${prelude}{${corpo.trim()}}`)
        .join("\n");
    const baseAntes = regraCoringa(baselineCss);
    afirmar(
      "regras de `@layer base` sobre `*` idênticas ao baseline",
      baseAntes !== "" && baseAntes === regraCoringa(cssCompilado),
    );

    const rootAntes = declaracoesDe(baselineCss, ":root");
    const divergentes = [...rootAntes.entries()].filter(
      ([nome, valor]) =>
        rootAtual.get(nome) !== valor &&
        // Mesma regra da asserção acima: variável do tema que sumiu inteira e
        // que nenhuma regra lê mais não muda pixel algum. Valor ALTERADO, ou
        // variável que alguém ainda lê, continua sendo divergência.
        !(
          nome.startsWith("--") &&
          rootAtual.get(nome) === undefined &&
          !referenciada(nome, corpusDeReferencias)
        ),
    );
    afirmar(
      "toda declaração de `:root` do baseline chega intacta",
      divergentes.length === 0,
      divergentes.map(([n, v]) => `${n}: ${v}`).join(" | "),
    );
    afirmar(
      `:root declara --primary como no baseline (${rootAntes.get("--primary")})`,
      rootAtual.get("--primary") === rootAntes.get("--primary") &&
        // Aceita `0.205`, `.205` e `20.5%`: o minificador pode emitir qualquer
        // uma das três formas.
        /oklch\(\s*(0?\.205|20\.5%)/.test(rootAtual.get("--primary") ?? ""),
      `encontrado: ${rootAtual.get("--primary") ?? "ausente"}`,
    );
  }
}

if (temCss) {
  // Nenhum token do shadcn aponta para a marca dentro de `:root`.
  const tokensShadcn = [
    "--background",
    "--foreground",
    "--card",
    "--card-foreground",
    "--popover",
    "--popover-foreground",
    "--primary",
    "--primary-foreground",
    "--secondary",
    "--secondary-foreground",
    "--muted",
    "--muted-foreground",
    "--accent",
    "--accent-foreground",
    "--destructive",
    "--border",
    "--input",
    "--ring",
    "--radius",
  ];
  const marca = /#00bd42|#007a2a|#005c3a|#e8f5ec|--brand-|--surface|--ink/i;
  const contaminados = tokensShadcn.filter((nome) => {
    const valor = rootAtual.get(nome);
    return valor !== undefined && marca.test(valor);
  });
  afirmar(
    "nenhum token do shadcn aponta para a marca dentro de `:root`",
    contaminados.length === 0,
    contaminados.join(", "),
  );
}

// Verificação na fonte, independente do build.
const fonteCss = lerOuFalhar("src/App.css legível", () => ler(caminhoAppCss));

if (fonteCss && existsSync(caminhoBaselineFonte)) {
  const original = lerOuFalhar("fonte do baseline legível", () =>
    ler(caminhoBaselineFonte),
  );
  if (original) {
    const rootFonteAntes = declaracoesDe(original, ":root");
    const rootFonteDepois = declaracoesDe(fonteCss, ":root");
    const perdidas = [...rootFonteAntes.entries()].filter(
      ([nome, valor]) => rootFonteDepois.get(nome) !== valor,
    );
    afirmar(
      "src/App.css: toda declaração original de `:root` sobrevive inalterada",
      perdidas.length === 0,
      perdidas.map(([n, v]) => `${n}: ${v}`).join(" | "),
    );

    const camadaBase = (texto) =>
      (/@layer base\s*\{[\s\S]*?\n\}/.exec(semCR(texto)) ?? [""])[0];
    afirmar(
      "src/App.css: bloco `@layer base` idêntico ao baseline",
      camadaBase(fonteCss) === camadaBase(original) &&
        camadaBase(original) !== "",
    );
  }
} else if (fonteCss) {
  // Baseline ausente não pode sumir do relatório: sem ele estas duas
  // asserções simplesmente não existiriam e o script sairia 0 mesmo assim.
  afirmar(
    "fonte do baseline presente (`src/App.css` de antes da story)",
    false,
    `ausente: ${path.relative(raiz, caminhoBaselineFonte)}`,
  );
}

/* ─── (c) `.painel` carrega a marca ──────────────────────────────────── */

secao("(c) `.painel` remapeia os tokens para a marca");

if (temCss) {
  afirmar("bloco `.painel` presente no CSS compilado", painel.size > 0);

  // Conjunto completo: um componente shadcn instalado não pode renderizar
  // metade marca, metade neutro.
  const remapeamentos = {
    "--background": "var(--surface-sunk)",
    "--foreground": "var(--ink)",
    "--card": "var(--surface)",
    "--card-foreground": "var(--ink)",
    "--popover": "var(--surface)",
    "--popover-foreground": "var(--ink)",
    "--primary": "var(--brand-action)",
    "--primary-foreground": "#ffffff",
    "--secondary": "var(--brand-wash)",
    "--secondary-foreground": "var(--brand-action)",
    "--muted": "var(--surface-sunk)",
    "--muted-foreground": "var(--ink-muted)",
    "--accent": "var(--brand-wash)",
    "--accent-foreground": "var(--brand-action)",
    "--border": "var(--border-soft)",
    "--input": "var(--border-strong)",
    "--ring": "var(--brand-action)",
    "--radius": "var(--radius-controle)",
  };
  for (const [nome, esperado] of Object.entries(remapeamentos)) {
    const encontrado = (painel.get(nome) ?? "").toLowerCase();
    const aceito =
      encontrado === esperado ||
      // O minificador encurta `#ffffff` para `#fff`.
      (esperado === "#ffffff" && encontrado === "#fff");
    afirmar(
      `.painel remapeia ${nome} → ${esperado}`,
      aceito,
      `encontrado: ${painel.get(nome) ?? "ausente"}`,
    );
  }

  // `--destructive` fica de fora de propósito: o DESIGN.md não define cor de
  // perigo, então o Painel herda o vermelho do sistema.
  afirmar(
    "`--destructive` herda o valor do sistema (sem cor de perigo na direção)",
    !painel.has("--destructive"),
    `encontrado: ${painel.get("--destructive") ?? ""}`,
  );

  // Todo token do shadcn ou é remapeado, ou herda de `:root` conscientemente.
  const semValor = Object.keys(remapeamentos).filter(
    (nome) => !painel.has(nome) && !rootAtual.has(nome),
  );
  afirmar(
    "todo token remapeado tem origem alcançável",
    semValor.length === 0,
    semValor.join(", "),
  );

  const marcaEsperada = {
    "--brand-chrome": ["#005c3a"],
    "--brand-action": ["#007a2a"],
    "--brand-vivid": ["#00bd42"],
    "--brand-wash": ["#e8f5ec"],
    "--ink": ["#0f172a"],
    "--ink-secondary": ["#37414f"],
    "--ink-muted": ["#5b6672"],
    "--surface": ["#ffffff", "#fff"],
    "--surface-sunk": ["#f4f7f5"],
    "--border-soft": ["#e6eae8"],
    "--border-strong": ["#cfd6d2"],
    "--radius-cartao": ["14px"],
    "--radius-controle": ["12px"],
    "--radius-pilula": ["999px"],
  };
  for (const [nome, aceitos] of Object.entries(marcaEsperada)) {
    const valor = (rootAtual.get(nome) ?? "").toLowerCase();
    afirmar(
      `${nome} vale ${aceitos[0]} no CSS compilado`,
      aceitos.includes(valor),
      `encontrado: ${rootAtual.get(nome) ?? "ausente"}`,
    );
  }

  // Os raios são declarados duas vezes na fonte (chave do tema e `:root`).
  // Quantas cópias chegam ao CSS compilado é decisão do Tailwind, que só
  // emite a variável de tema quando alguma regra a referencia — por isso a
  // asserção é sobre concordância, não sobre contagem. A duplicação em si
  // está travada na fonte, logo abaixo.
  for (const raio of ["--radius-cartao", "--radius-controle", "--radius-pilula"]) {
    const copias = regras(cssCompilado)
      .map(({ corpo }) => new Map(declaracoes(corpo)).get(raio))
      .filter((v) => v !== undefined);
    const distintas = [...new Set(copias.map((v) => v.toLowerCase()))];
    afirmar(
      `${raio}: as cópias no CSS compilado concordam (${copias.length})`,
      copias.length >= 1 && distintas.length === 1,
      `cópias: ${copias.length}, valores: ${distintas.join(" | ")}`,
    );
  }
}

if (fonteCss) {
  // Mesma trava na fonte: `@theme inline` × `:root`.
  const blocoTema = /@theme inline\s*\{([\s\S]*?)\n\}/.exec(fonteCss);
  const temaFonte = blocoTema ? new Map(declaracoes(blocoTema[1])) : new Map();
  const rootFonte = declaracoesDe(fonteCss, ":root");
  for (const raio of ["--radius-cartao", "--radius-controle", "--radius-pilula"]) {
    afirmar(
      `src/App.css: ${raio} igual em \`@theme inline\` e \`:root\``,
      temaFonte.get(raio) !== undefined &&
        temaFonte.get(raio) === rootFonte.get(raio),
      `tema: ${temaFonte.get(raio) ?? "ausente"} | root: ${rootFonte.get(raio) ?? "ausente"}`,
    );
  }

  // Todo token mapeado em `@theme inline` tem origem alcançável.
  const semOrigem = [];
  for (const [, valor] of temaFonte) {
    const alvo = /^var\(\s*(--[\w-]+)\s*\)$/.exec(valor);
    if (!alvo) continue;
    if (!rootFonte.has(alvo[1])) semOrigem.push(alvo[1]);
  }
  afirmar(
    "todo token mapeado em `@theme inline` tem valor definido em `:root`",
    blocoTema !== null && semOrigem.length === 0,
    semOrigem.join(", "),
  );
}

/* ─── Regra dos verdes: brand-vivid nunca carrega texto branco ───────── */

secao("Regra dos verdes: brand-vivid nunca carrega texto branco");

{
  // A trava real é nos fontes: o Tailwind emite `.bg-brand-vivid{}` e
  // `.text-white{}` como regras separadas, então procurar as duas
  // declarações na mesma regra compilada nunca acharia a composição proibida.
  const dirSrc = path.join(raiz, "src");
  const ocorrencias = [];
  if (existsSync(dirSrc)) {
    for (const arquivo of arquivosJsx(dirSrc)) {
      const fonte = lerOuFalhar(`${path.relative(raiz, arquivo)} legível`, () =>
        ler(arquivo),
      );
      if (!fonte) continue;
      for (const atributo of atributosClassName(fonte)) {
        const temVivid = /(^|[\s"'`:[{(])bg-brand-vivid(?![\w-])/.test(atributo);
        const temBranco = /(^|[\s"'`:[{(])text-white(\/\d+)?(?![\w-])/.test(
          atributo,
        );
        if (temVivid && temBranco) {
          ocorrencias.push(
            `${path.relative(raiz, arquivo)}: ${atributo.trim().slice(0, 90)}`,
          );
        }
      }
    }
  }
  afirmar(
    "nenhum className compõe bg-brand-vivid com text-white",
    ocorrencias.length === 0,
    ocorrencias.slice(0, 5).join(" | "),
  );
}

if (temCss && temBaselineCss) {
  // Complemento: regra autoral nova que já traga o par pronto.
  const assinatura = ({ prelude, corpo }) =>
    `${prelude}{${corpo.replace(/\s+/g, "")}}`;
  const baselineCss = ler(caminhoBaselineCss);
  const anteriores = new Set(regras(baselineCss).map(assinatura));
  const autorais = regras(cssCompilado)
    .filter((regra) => !anteriores.has(assinatura(regra)))
    .filter(({ corpo }) => {
      const d = new Map(declaracoes(corpo));
      const fundo = (
        d.get("background") ??
        d.get("background-color") ??
        ""
      ).toLowerCase();
      const tinta = (d.get("color") ?? "").toLowerCase();
      return (
        /#00bd42|var\(--brand-vivid\)/.test(fundo) &&
        /^(#fff|#ffffff|white)$/.test(tinta)
      );
    })
    .map(({ prelude }) => prelude);
  afirmar(
    "nenhuma regra nova produz texto branco sobre brand-vivid",
    autorais.length === 0,
    autorais.join(", "),
  );
}

/* ─── (d) Tokens antes mortos ────────────────────────────────────────── */

secao("(d) tokens antes mortos resolvem para valor concreto");

if (temCss) {
  const mortos = [
    "--chart-1",
    "--chart-2",
    "--chart-3",
    "--chart-4",
    "--chart-5",
    "--sidebar",
    "--sidebar-foreground",
    "--sidebar-primary",
    "--sidebar-primary-foreground",
    "--sidebar-accent",
    "--sidebar-accent-foreground",
    "--sidebar-border",
    "--sidebar-ring",
  ];
  for (const nome of mortos) {
    const valor = rootAtual.get(nome);
    afirmar(
      `${nome} tem valor concreto`,
      Boolean(valor) && !valor.includes("var("),
      `encontrado: ${valor ?? "ausente"}`,
    );
  }

  const ciclos = [
    ...mascarar(cssCompilado).matchAll(/(--[\w-]+)\s*:\s*var\(\s*\1\s*\)/g),
  ].map((m) => m[1]);
  afirmar(
    "nenhuma custom property se auto-referencia",
    ciclos.length === 0,
    [...new Set(ciclos)].join(", "),
  );
}

/* ─── (e) Contraste WCAG 2.1 ─────────────────────────────────────────── */

secao("(e) contraste WCAG 2.1 dos pares que a direção visual promete");

if (temCss) {
  const escopoPainel = new Map([...rootAtual, ...painel]);
  const PISO = 4.5;

  const conferir = (rotulo, tinta, fundo, mapa) => {
    const corTinta = resolver(tinta, mapa);
    const corFundo = resolver(fundo, mapa);
    const razao = razaoContraste(corTinta ?? "", corFundo ?? "");
    if (razao === null) {
      afirmar(
        `${rotulo} ≥ ${PISO.toFixed(1)}:1`,
        false,
        `cor não resolvida: ${corTinta ?? tinta} sobre ${corFundo ?? fundo}`,
      );
      return;
    }
    afirmar(
      `${rotulo} = ${razao.toFixed(2)}:1 (piso ${PISO.toFixed(1)})`,
      razao >= PISO,
      `${corTinta} sobre ${corFundo}`,
    );
  };

  conferir("branco sobre brand-action", "#ffffff", "var(--brand-action)", escopoPainel);
  conferir("ink sobre brand-vivid", "var(--ink)", "var(--brand-vivid)", escopoPainel);

  for (const estado of ["publicado", "agendado", "rascunho", "arquivado"]) {
    conferir(
      `estado ${estado}: tinta sobre fundo`,
      `var(--state-${estado}-ink)`,
      `var(--state-${estado}-bg)`,
      escopoPainel,
    );
  }

  /* ─── O par de cada cor de Categoria (Story 2.14) ──────────────────────
     Cor que ninguém mede é cor que ninguém sabe se dá para ler. O vocabulário
     é FECHADO justamente para caber aqui: "valor CSS aplicado por style"
     permite qualquer cor, e qualquer cor inclui as ilegíveis. A lista é
     IMPORTADA do domínio — reescrevê-la aqui mediria uma segunda lista, e a
     cor nova entraria sem passar por medida nenhuma. */
  {
    afirmar(
      "o vocabulário de cor de Categoria não está vazio",
      CORES_DE_CATEGORIA.length > 0,
      "sem cores declaradas, as medidas abaixo passariam por vacuidade",
    );
    for (const cor of CORES_DE_CATEGORIA) {
      const { rotulo, fundo, tinta } = aparenciaDaCor(cor);
      /* A cor gravada em `categorias.cor` é o FUNDO. Se ela deixar de ser uma
         referência a token, a resolução falha e a asserção acusa em vez de
         medir outra coisa. */
      afirmar(
        `categoria ${rotulo}: a cor gravada é o token do fundo, nunca hex solto`,
        cor === fundo && /^var\(--categoria-[a-z]+-bg\)$/.test(fundo),
        `cor: ${cor} | fundo: ${fundo}`,
      );
      conferir(`categoria ${rotulo}: tinta sobre fundo`, tinta, fundo, escopoPainel);
    }
  }

  // Pares que o próprio bloco `.painel` cria.
  const paresPainel = [
    ["texto sobre fundo do Painel", "--foreground", "--background"],
    ["texto sobre cartão", "--card-foreground", "--card"],
    ["texto sobre popover", "--popover-foreground", "--popover"],
    ["tinta primária sobre primário", "--primary-foreground", "--primary"],
    ["texto de apoio sobre muted", "--muted-foreground", "--muted"],
    ["texto sobre secondary", "--secondary-foreground", "--secondary"],
    ["texto sobre accent", "--accent-foreground", "--accent"],
  ];
  for (const [rotulo, tinta, fundo] of paresPainel) {
    conferir(
      rotulo,
      escopoPainel.get(tinta) ?? "",
      escopoPainel.get(fundo) ?? "",
      escopoPainel,
    );
  }
}

/* ─── (f) Lint e gerenciador único ───────────────────────────────────── */

secao("(f) lint executa e o gerenciador de pacotes é único");

const pkg = lerOuFalhar("package.json legível", () =>
  JSON.parse(ler(path.join(raiz, "package.json"))),
);
if (pkg) {
  afirmar(
    "package.json não declara `packageManager`",
    !("packageManager" in pkg),
    `encontrado: ${pkg.packageManager ?? ""}`,
  );
  afirmar(
    "script `lint` declarado no package.json",
    typeof pkg.scripts?.lint === "string",
  );
}
afirmar(
  "package-lock.json presente (npm é o gerenciador único)",
  existsSync(path.join(raiz, "package-lock.json")),
);
afirmar(
  "nenhum pnpm-lock.yaml no repositório",
  !existsSync(path.join(raiz, "pnpm-lock.yaml")),
);
afirmar("eslint.config.js presente", existsSync(path.join(raiz, "eslint.config.js")));

// Roda o comando que a story promete — não um equivalente. `npx` iria à rede
// e divergiria assim que o script `lint` ganhasse uma flag.
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
try {
  // `npm.cmd` no Windows só é executável através do shell.
  execFileSync(npm, ["run", "lint"], {
    cwd: raiz,
    stdio: "pipe",
    shell: process.platform === "win32",
  });
  afirmar("`npm run lint` termina com código 0", true);
} catch (erro) {
  if (erro.code === "ENOENT") {
    afirmar(
      "`npm run lint` termina com código 0",
      false,
      `ferramenta ausente: ${npm} não foi encontrado no PATH`,
    );
  } else {
    const saida = `${erro.stdout ?? ""}${erro.stderr ?? ""}`.trim();
    afirmar(
      "`npm run lint` termina com código 0",
      false,
      `saiu com código ${erro.status}: ${saida.slice(0, 1500)}`,
    );
  }
}

/* ─── Veredito ───────────────────────────────────────────────────────── */

console.log("");
if (falhas === 0) {
  console.log("Fundação verificada: todas as asserções passaram.");
  process.exitCode = 0;
} else {
  console.log(`Fundação NÃO verificada: ${falhas} asserção(ões) falharam.`);
  process.exitCode = 1;
}
