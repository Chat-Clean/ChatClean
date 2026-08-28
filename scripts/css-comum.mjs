/**
 * Leitor de CSS e cálculo de contraste — compartilhado pelas ferramentas de
 * verificação que auditam o CSS compilado.
 *
 * Nasceu dentro de `verificar-fundacao.mjs` (Story 1.1) e saiu para cá quando
 * a verificação do artigo (Story 2.3) passou a precisar exatamente do mesmo
 * leitor: o CSS compilado é minificado e aninha regras dentro de
 * `@layer`/`@media`, então a varredura conta chaves — mas precisa ignorar
 * chave e ponto e vírgula que aparecem dentro de comentário, de literal de
 * string e de `url(...)` sem aspas, senão a contagem dessincroniza e corrompe
 * em silêncio o diff de não-regressão.
 *
 * Duas cópias divergentes deste leitor seriam duas verdades sobre o mesmo
 * arquivo. Ele mora num lugar só, e as duas ferramentas leem do mesmo lugar.
 *
 * Módulo puro: não lê variável de ambiente, não escreve em disco, não imprime.
 * `acharCssCompilado` é a única função que toca o sistema de arquivos, e só
 * para leitura.
 *
 * ATENÇÃO — `casosDeAutoteste()` no fim do arquivo não é enfeite. Este módulo
 * é o alicerce de duas ferramentas e nenhuma delas consegue perceber que ele
 * está errado: medido por sabotagem, inverter a tripla RGB de `corParaRgb`
 * (um `.reverse()`) fazia `verificar-artigo` imprimir "todas as asserções
 * passaram" com TODAS as razões de contraste erradas, e desligar o ramo de
 * `url(...)` sem aspas em `mascarar()` deixava as duas ferramentas
 * inteiramente verdes. Um número de contraste que nada verifica é
 * indistinguível de um número inventado. Toda ferramenta que importa daqui
 * roda esses casos ANTES de julgar o repositório.
 */

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/* ─── Normalização ───────────────────────────────────────────────────── */

/**
 * Normaliza fim de linha. Artefato versionado pode chegar com CRLF numa
 * máquina e LF em outra, e a comparação precisa ser sobre o conteúdo, não
 * sobre a convenção de fim de linha da checkout.
 */
export function semCR(texto) {
  return texto.replace(/\r\n/g, "\n");
}

/* ─── Leitor de CSS ──────────────────────────────────────────────────── */

/**
 * Devolve uma cópia do CSS só com os comentários trocados por espaços,
 * preservando os índices. É a fonte do texto que as asserções leem: sem
 * comentário grudado no nome da declaração, mas com as strings intactas.
 */
export function mascararComentarios(css) {
  const n = css.length;
  let saida = "";
  let i = 0;
  while (i < n) {
    if (css[i] === "\\") {
      saida += css.slice(i, i + 2);
      i += 2;
    } else if (css[i] === "/" && css[i + 1] === "*") {
      const fim = css.indexOf("*/", i + 2);
      const ate = fim === -1 ? n : fim + 2;
      saida += " ".repeat(ate - i);
      i = ate;
    } else {
      saida += css[i];
      i += 1;
    }
  }
  return saida;
}

/**
 * Devolve uma cópia do CSS com comentários, strings e `url(...)` trocados por
 * espaços, preservando os índices. A varredura usa esta cópia para achar
 * posições; o texto real sai sempre da cópia sem comentários.
 */
export function mascarar(css) {
  const n = css.length;
  let saida = "";
  let i = 0;
  while (i < n) {
    const c = css[i];
    if (c === "\\") {
      // Escape de identificador (`.\[\&\:\'size-\'\]`): a barra invertida vale
      // fora de string também, e é o que impede que uma aspa escapada em
      // seletor do Tailwind seja lida como abertura de literal.
      saida += css.slice(i, i + 2);
      i += 2;
    } else if (c === "/" && css[i + 1] === "*") {
      const fim = css.indexOf("*/", i + 2);
      const ate = fim === -1 ? n : fim + 2;
      saida += " ".repeat(ate - i);
      i = ate;
    } else if (c === '"' || c === "'") {
      const aspas = c;
      let j = i + 1;
      while (j < n && css[j] !== aspas) {
        if (css[j] === "\\") j += 1;
        j += 1;
      }
      j = Math.min(j + 1, n);
      saida += " ".repeat(j - i);
      i = j;
    } else if (
      /^url\(/i.test(css.slice(i, i + 4)) &&
      (i === 0 || !/[\w-]/.test(css[i - 1]))
    ) {
      // `url("...")` cai no ramo de aspas na volta seguinte; aqui só o
      // conteúdo sem aspas, que pode conter chave e ponto e vírgula.
      const resto = css.slice(i + 4);
      const primeiro = resto.trimStart()[0];
      saida += "url(";
      i += 4;
      if (primeiro !== '"' && primeiro !== "'") {
        let j = i;
        while (j < n && css[j] !== ")") j += 1;
        saida += " ".repeat(j - i);
        i = j;
      }
    } else {
      saida += c;
      i += 1;
    }
  }
  return saida;
}

const cacheAnalise = new Map();

/** Enumera toda regra do CSS como { prelude, corpo }, inclusive aninhadas. */
export function analisar(css) {
  const emCache = cacheAnalise.get(css);
  if (emCache) return emCache;

  const limpo = mascarar(css);
  const texto = mascararComentarios(css);
  const encontradas = [];
  let corte = 0;
  let profundidade = 0;
  let truncada = false;

  for (let i = 0; i < limpo.length; i += 1) {
    const c = limpo[i];
    if (c === "{") {
      profundidade += 1;
      const prelude = texto.slice(corte, i).trim().replace(/\s+/g, " ");
      let interna = 1;
      let j = i + 1;
      while (j < limpo.length && interna > 0) {
        if (limpo[j] === "{") interna += 1;
        else if (limpo[j] === "}") interna -= 1;
        j += 1;
      }
      if (interna > 0) truncada = true;
      encontradas.push({ prelude, corpo: texto.slice(i + 1, j - 1) });
      corte = i + 1;
    } else if (c === "}") {
      profundidade -= 1;
      corte = i + 1;
    } else if (c === ";") {
      corte = i + 1;
    }
  }

  const resultado = {
    regras: encontradas,
    balanceada: profundidade === 0 && !truncada,
  };
  cacheAnalise.set(css, resultado);
  return resultado;
}

export function regras(css) {
  return analisar(css).regras;
}

/** Declarações no nível do corpo, ignorando blocos aninhados. */
export function declaracoes(corpoBruto) {
  // O texto lido nunca traz comentário grudado no nome da declaração.
  const corpo = mascararComentarios(corpoBruto);
  const limpo = mascarar(corpoBruto);
  const pares = [];
  let profundidade = 0;
  let inicio = 0;

  const fecharSegmento = (fim) => {
    const trechoLimpo = limpo.slice(inicio, fim);
    const dentroDeBloco = /\{/.test(trechoLimpo);
    if (!dentroDeBloco) {
      const posDoisPontos = trechoLimpo.indexOf(":");
      if (posDoisPontos !== -1) {
        const nome = corpo
          .slice(inicio, inicio + posDoisPontos)
          .trim()
          .replace(/\s+/g, " ");
        const valor = corpo
          .slice(inicio + posDoisPontos + 1, fim)
          .trim()
          .replace(/\s+/g, " ");
        // Sobra de seletor de regra aninhada não é declaração: o nome precisa
        // ser uma propriedade CSS, uma custom property ou uma propriedade com
        // prefixo de fornecedor.
        //
        // O prefixo simples (`-webkit-text-decoration-color`) entrou depois:
        // sem ele o leitor DESCARTAVA silenciosamente toda declaração
        // prefixada que o Tailwind emite, e qualquer auditoria sobre elas —
        // cor crua, por exemplo — passava por vacuidade. `--` continua sendo
        // custom property; `-x-` é fornecedor; `--` no meio não é nem um nem
        // outro e continua fora.
        if (/^(--[\w-]+|-?[a-zA-Z][\w-]*)$/.test(nome)) pares.push([nome, valor]);
      }
    }
    inicio = fim + 1;
  };

  for (let i = 0; i < limpo.length; i += 1) {
    const c = limpo[i];
    if (c === "{") profundidade += 1;
    else if (c === "}") {
      profundidade -= 1;
      inicio = i + 1;
    } else if (c === ";" && profundidade === 0) fecharSegmento(i);
  }
  if (inicio < limpo.length) fecharSegmento(limpo.length);
  return pares;
}

/**
 * Divide um prelude nos seletores que ele agrupa.
 *
 * A vírgula só separa no nível de fora: `:is(a, b)` é UM seletor, e prelude de
 * at-rule (`@supports (color:color-mix(in lab,red,red))`) não se divide de
 * jeito nenhum — quebrá-lo produziria chaves que não existem.
 */
export function seletoresDo(prelude) {
  if (prelude.startsWith("@")) return [prelude];
  const partes = [];
  let atual = "";
  let profundidade = 0;
  for (const ch of prelude) {
    if (ch === "(" || ch === "[") profundidade += 1;
    else if (ch === ")" || ch === "]") profundidade -= 1;
    if (ch === "," && profundidade === 0) {
      partes.push(atual.trim());
      atual = "";
      continue;
    }
    atual += ch;
  }
  partes.push(atual.trim());
  return partes.filter(Boolean);
}

/** Uma entrada por regra cujo seletor inclui `alvo`, na ordem do arquivo. */
export function regrasDe(css, alvo) {
  return regras(css)
    .filter(({ prelude }) =>
      prelude
        .split(",")
        .map((s) => s.trim())
        .includes(alvo),
    )
    .map(({ corpo }) => new Map(declaracoes(corpo)));
}

/** União das declarações de todas as regras cujo seletor inclui `alvo`. */
export function declaracoesDe(css, alvo) {
  const mapa = new Map();
  for (const regra of regrasDe(css, alvo)) {
    for (const [nome, valor] of regra) mapa.set(nome, valor);
  }
  return mapa;
}

/** Índice prelude → conjunto de "nome:valor", com um seletor por chave. */
export function indicePorSeletor(css) {
  const mapa = new Map();
  for (const { prelude, corpo } of regras(css)) {
    const decls = [...declaracoes(corpo)].map(
      ([nome, valor]) => `${nome}:${valor}`,
    );
    if (decls.length === 0) continue;
    for (const seletor of seletoresDo(prelude)) {
      const conjunto = mapa.get(seletor) ?? new Set();
      for (const d of decls) conjunto.add(d);
      mapa.set(seletor, conjunto);
    }
  }
  return mapa;
}

/* ─── Contraste WCAG 2.1 ─────────────────────────────────────────────── */

export function hexParaRgb(valor) {
  const limpo = valor.trim().toLowerCase();
  const curto = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(limpo);
  if (curto) {
    return curto.slice(1).map((d) => parseInt(d + d, 16));
  }
  const longo = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(limpo);
  if (longo) return longo.slice(1).map((d) => parseInt(d, 16));
  if (limpo === "white") return [255, 255, 255];
  if (limpo === "black") return [0, 0, 0];
  return null;
}

/** Codificação gama de sRGB: canal linear 0..1 → byte 0..255. */
function gama(canalLinear) {
  const c = Math.min(1, Math.max(0, canalLinear));
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(v * 255);
}

/**
 * `oklab(L a b)` → sRGB 0..255, pela matriz do CSS Color 4.
 *
 * Existe porque metade da paleta do projeto é `oklch` — os neutros do shadcn,
 * `:root` inteiro e o bloco `.dark`. Sem esta conversão, todo par que
 * envolvesse um deles saía como "cor não resolvida", e a única cobertura
 * possível seria a metade hexadecimal da paleta.
 */
function oklabParaRgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return [
    gama(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gama(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gama(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** Lê `0.145`, `14.5%` ou `.145`; `escala` converte a forma percentual. */
function numeroCss(texto, escala = 1) {
  const limpo = String(texto).trim();
  const valor = Number.parseFloat(limpo);
  if (Number.isNaN(valor)) return null;
  return limpo.endsWith("%") ? (valor / 100) * escala : valor;
}

/**
 * Qualquer forma de cor que o projeto emite → sRGB 0..255, ou `null`.
 *
 * `null` é falha declarada: quem chama transforma em asserção falha, nunca em
 * silêncio. É de propósito que não há palpite — inventar um valor aqui
 * corromperia toda conta de contraste do projeto de uma vez.
 */
export function corParaRgb(valor) {
  if (valor === undefined || valor === null) return null;
  const limpo = String(valor).trim().toLowerCase();

  const hex = hexParaRgb(limpo);
  if (hex) return hex;

  // `oklch(L C H)` e `oklch(L C H / alpha)`. O alfa é ignorado: contraste
  // sobre cor translúcida depende do que está atrás, e chutar seria pior.
  const lch = /^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+(-?[\d.]+)(?:deg)?\s*(?:\/[^)]*)?\)$/.exec(
    limpo,
  );
  if (lch) {
    const L = numeroCss(lch[1]);
    const C = numeroCss(lch[2], 0.4);
    const H = numeroCss(lch[3]);
    if (L === null || C === null || H === null) return null;
    const rad = (H * Math.PI) / 180;
    return oklabParaRgb(L, C * Math.cos(rad), C * Math.sin(rad));
  }

  const lab = /^oklab\(\s*([\d.]+%?)\s+(-?[\d.]+%?)\s+(-?[\d.]+%?)\s*(?:\/[^)]*)?\)$/.exec(
    limpo,
  );
  if (lab) {
    const L = numeroCss(lab[1]);
    const a = numeroCss(lab[2], 0.4);
    const b = numeroCss(lab[3], 0.4);
    if (L === null || a === null || b === null) return null;
    return oklabParaRgb(L, a, b);
  }

  return null;
}

export function luminancia([r, g, b]) {
  const canal = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

export function razaoContraste(corA, corB) {
  const a = corParaRgb(corA);
  const b = corParaRgb(corB);
  if (!a || !b) return null;
  const la = luminancia(a);
  const lb = luminancia(b);
  const claro = Math.max(la, lb);
  const escuro = Math.min(la, lb);
  return (claro + 0.05) / (escuro + 0.05);
}

/** Resolve uma cadeia `var(--x)` até um valor literal. */
export function resolver(valor, mapa, profundidade = 0) {
  if (valor === undefined || valor === null || profundidade > 12) return null;
  const referencia = /^var\(\s*(--[\w-]+)\s*\)$/.exec(valor.trim());
  if (!referencia) return valor.trim();
  return resolver(mapa.get(referencia[1]), mapa, profundidade + 1);
}

/* ─── Artefato do build ──────────────────────────────────────────────── */

/** Todo `.css` de `dist/assets`, em caminho absoluto. Lista vazia se não há. */
export function cssCompiladosEm(raiz) {
  const dirAssets = path.join(raiz, "dist", "assets");
  if (!existsSync(dirAssets)) return [];
  return readdirSync(dirAssets)
    .filter((f) => f.endsWith(".css"))
    .map((f) => path.join(dirAssets, f));
}

/**
 * O único `.css` de `dist/assets`. Devolve `null` se `dist` não existe ou se
 * há mais de um candidato — ambiguidade é falha, não escolha arbitrária.
 */
export function acharCssCompilado(raiz) {
  const candidatos = cssCompiladosEm(raiz);
  return candidatos.length === 1 ? candidatos[0] : null;
}

/* ─── Autoteste do módulo ────────────────────────────────────────────────
   Devolve `[descricao, condicao, detalhe]` para que cada ferramenta os passe
   pela SUA função de asserção — assim eles entram na contagem e no código de
   saída de quem importa, em vez de virarem um `console.log` que ninguém lê.

   Os casos são escolhidos para falhar sob as sabotagens que de fato passaram
   despercebidas, e as respostas são independentes: valor definicional (21:1
   entre preto e branco), invariantes (simetria, identidade), a ORDEM dos
   canais (que é o que um `.reverse()` inverte) e um valor de referência
   público (#777 sobre branco = 4,48:1). Nenhum deles é um número copiado da
   saída da própria ferramenta. */

export function casosDeAutoteste() {
  const casos = [];
  const caso = (descricao, condicao, detalhe = "") =>
    casos.push([descricao, Boolean(condicao), detalhe]);

  /* --- Contraste: respostas conhecidas ------------------------------- */

  const preto = razaoContraste("#000000", "#ffffff");
  caso(
    "contraste: preto sobre branco é exatamente 21:1",
    preto !== null && Math.abs(preto - 21) < 1e-9,
    `encontrado: ${preto}`,
  );
  caso(
    "contraste: cor contra ela mesma é 1:1",
    Math.abs(razaoContraste("#37414f", "#37414f") - 1) < 1e-9,
  );
  caso(
    "contraste: a razão é simétrica",
    Math.abs(
      razaoContraste("#007a2a", "#ffffff") - razaoContraste("#ffffff", "#007a2a"),
    ) < 1e-9,
  );
  const cinza = razaoContraste("#777777", "#ffffff");
  caso(
    "contraste: #777 sobre branco é 4,48:1 (valor de referência público)",
    cinza !== null && cinza > 4.47 && cinza < 4.49,
    `encontrado: ${cinza?.toFixed(4)}`,
  );

  /* A ORDEM dos canais. É esta família que pega o `.reverse()`: os três
     primários têm pesos de luminância muito diferentes (R 0,2126 / G 0,7152 /
     B 0,0722), então trocar R por B inverte a resposta. */
  const vermelho = razaoContraste("#ff0000", "#ffffff");
  const verde = razaoContraste("#00ff00", "#ffffff");
  const azul = razaoContraste("#0000ff", "#ffffff");
  caso(
    "contraste: a ordem dos canais é R,G,B — verde é o primário mais claro e azul o mais escuro",
    verde !== null &&
      vermelho !== null &&
      azul !== null &&
      verde < vermelho &&
      vermelho < azul,
    `verde ${verde?.toFixed(2)} < vermelho ${vermelho?.toFixed(2)} < azul ${azul?.toFixed(2)}`,
  );
  caso(
    "contraste: cinza mais escuro contrasta mais com o branco (monotonia)",
    razaoContraste("#333333", "#ffffff") > razaoContraste("#999999", "#ffffff"),
  );
  caso(
    "contraste: cor irreconhecível devolve null em vez de palpite",
    razaoContraste("var(--nao-resolvido)", "#ffffff") === null &&
      razaoContraste("chartreuse", "#ffffff") === null,
  );

  /* --- oklch: a metade da paleta que o hexadecimal não alcança -------- */

  caso(
    "oklch: `oklch(1 0 0)` é branco e `oklch(0 0 0)` é preto",
    JSON.stringify(corParaRgb("oklch(1 0 0)")) === JSON.stringify([255, 255, 255]) &&
      JSON.stringify(corParaRgb("oklch(0 0 0)")) === JSON.stringify([0, 0, 0]),
    `encontrado: ${JSON.stringify(corParaRgb("oklch(1 0 0)"))} / ${JSON.stringify(corParaRgb("oklch(0 0 0)"))}`,
  );
  caso(
    "oklch: branco em oklch contra preto em hexadecimal dá os mesmos 21:1",
    Math.abs(razaoContraste("oklch(1 0 0)", "#000000") - 21) < 1e-6,
    `encontrado: ${razaoContraste("oklch(1 0 0)", "#000000")}`,
  );
  caso(
    "oklch: a forma percentual e a decimal descrevem a mesma cor",
    JSON.stringify(corParaRgb("oklch(55.6% 0 0)")) ===
      JSON.stringify(corParaRgb("oklch(0.556 0 0)")),
  );
  {
    // `oklch(0.145 0 0)` é o fundo do bloco `.dark` deste projeto: cinza
    // muito escuro. Croma zero implica os três canais iguais.
    const escuro = corParaRgb("oklch(0.145 0 0)");
    caso(
      "oklch: croma zero produz cinza neutro, e 0.145 cai no quase-preto",
      Array.isArray(escuro) &&
        escuro[0] === escuro[1] &&
        escuro[1] === escuro[2] &&
        escuro[0] > 2 &&
        escuro[0] < 25,
      `encontrado: ${JSON.stringify(escuro)}`,
    );
  }
  caso(
    "oklch: matiz muda a cor (croma diferente de zero não vira cinza)",
    JSON.stringify(corParaRgb("oklch(0.6 0.2 30)")) !==
      JSON.stringify(corParaRgb("oklch(0.6 0.2 150)")),
  );

  /* --- `mascarar()`: as três guardas, uma por caso ------------------- */

  const preludesDe = (css) => analisar(css).regras.map((r) => r.prelude);

  {
    // Comentário: a chave dentro dele não pode abrir regra.
    const amostra = ".a{color:red}/* } .b{color:blue} */.c{color:green}";
    const p = preludesDe(amostra);
    caso(
      "mascarar: chave dentro de COMENTÁRIO não abre regra",
      analisar(amostra).balanceada && JSON.stringify(p) === JSON.stringify([".a", ".c"]),
      `preludes: ${JSON.stringify(p)}`,
    );
  }
  {
    // Literal de string: `}` dentro de aspas não fecha regra.
    const amostra = '.a{content:"}"}.b{color:red}';
    const p = preludesDe(amostra);
    caso(
      "mascarar: `}` dentro de LITERAL DE STRING não fecha regra",
      analisar(amostra).balanceada && JSON.stringify(p) === JSON.stringify([".a", ".b"]),
      `preludes: ${JSON.stringify(p)}`,
    );
  }
  {
    // `url(...)` SEM aspas: foi esta guarda que, desligada, deixou as duas
    // ferramentas inteiramente verdes.
    const amostra =
      ".a{background:url(data:image/svg+xml;utf8,<svg>{}</svg>)}.b{color:red}";
    const p = preludesDe(amostra);
    caso(
      "mascarar: chave dentro de `url(...)` SEM ASPAS não abre regra",
      analisar(amostra).balanceada && JSON.stringify(p) === JSON.stringify([".a", ".b"]),
      `preludes: ${JSON.stringify(p)}`,
    );
  }
  {
    const amostra = '.a{background:url("x{y}z")}.b{color:red}';
    const p = preludesDe(amostra);
    caso(
      "mascarar: `url(...)` COM aspas cai no ramo de string e também não abre regra",
      analisar(amostra).balanceada && JSON.stringify(p) === JSON.stringify([".a", ".b"]),
      `preludes: ${JSON.stringify(p)}`,
    );
  }
  caso(
    "analisar: CSS truncado é reportado como NÃO balanceado",
    !analisar(".a{color:red").balanceada,
  );

  /* --- `declaracoes()` ---------------------------------------------- */

  {
    const d = new Map(
      declaracoes(
        '--tok: 1px; color: red; -webkit-text-decoration-color: blue; content: "a;b"',
      ),
    );
    caso(
      "declaracoes: lê custom property, propriedade simples e PREFIXO DE FORNECEDOR",
      d.get("--tok") === "1px" &&
        d.get("color") === "red" &&
        d.get("-webkit-text-decoration-color") === "blue",
      `encontrado: ${JSON.stringify([...d])}`,
    );
    caso(
      "declaracoes: `;` dentro de literal não parte a declaração",
      d.get("content") === '"a;b"',
      `encontrado: ${d.get("content")}`,
    );
  }
  caso(
    "declaracoes: sobra de seletor aninhado não vira declaração",
    new Map(declaracoes("color:red; & .filho { color: blue }")).has("& .filho") === false,
  );

  /* --- `seletoresDo()` e `resolver()` -------------------------------- */

  caso(
    "seletoresDo: vírgula dentro de `:is()` não separa; at-rule não se divide",
    JSON.stringify(seletoresDo(":is(a, b), c")) === JSON.stringify([":is(a, b)", "c"]) &&
      seletoresDo("@supports (color:color-mix(in lab,red,red))").length === 1,
  );
  {
    const mapa = new Map([
      ["--a", "var(--b)"],
      ["--b", "#123456"],
      ["--ciclo", "var(--ciclo)"],
    ]);
    caso(
      "resolver: segue a cadeia de `var()` até o literal",
      resolver("var(--a)", mapa) === "#123456",
      `encontrado: ${resolver("var(--a)", mapa)}`,
    );
    caso(
      "resolver: cadeia circular devolve null em vez de estourar a pilha",
      resolver("var(--ciclo)", mapa) === null,
    );
    caso(
      "resolver: token ausente devolve null",
      resolver("var(--nunca-declarado)", mapa) === null,
    );
  }

  caso("semCR: normaliza CRLF para LF", semCR("a\r\nb") === "a\nb");

  return casos;
}
