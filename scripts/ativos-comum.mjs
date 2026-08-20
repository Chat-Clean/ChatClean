/**
 * A COMPOSIÇÃO dos ativos de prévia — pura, sem rasterizador.
 *
 * Este módulo existe separado de `gerar-imagem-padrao.mjs` por um motivo
 * medido: aquele importa o rasterizador nativo, e uma ferramenta de verificação
 * que o importasse no topo morreria INTEIRA numa máquina sem o binário da
 * plataforma — onze seções deixando de rodar por causa de um arquivo que muda
 * uma vez por ano. Aqui não há dependência nativa nenhuma: quem só precisa
 * saber ONDE o ativo mora, ou o que entra na composição, importa daqui.
 *
 * ─── POR QUE DERIVAR, E NÃO DESENHAR ──────────────────────────────────────
 *
 * Arte inventada por quem escreve o script é um arquivo que ninguém sabe de
 * onde veio, ninguém consegue reproduzir e ninguém consegue conferir contra a
 * marca. Aqui não há escolha estética a defender: a composição é uma
 * TRANSFORMAÇÃO MECÂNICA de dois artefatos que já existem no repositório — o
 * logotipo `public/chatclean.svg` (justamente o arquivo que o `og:image`
 * apontava e que as prévias não renderizam) e uma cor LIDA de um token de
 * `src/App.css`. O logotipo entra centralizado, ocupando uma fração declarada
 * da caixa. Nada mais é acrescentado.
 */

import { createHash } from "node:crypto";

import {
  IMAGEM_PADRAO_DO_SITE,
  LOGOTIPO_DA_MARCA,
} from "../src/domain/blog/compartilhamento.js";

/* ─── As entradas, todas do repositório ──────────────────────────────────── */

/** O ativo de marca do qual os dois rasters são derivados. */
export const ATIVO_DE_MARCA = "public/chatclean.svg";

/** Onde os tokens de cor são lidos. */
export const FONTE_DO_TOKEN = "src/App.css";

/**
 * Os atributos da raiz do SVG que o conteúdo HERDA.
 *
 * Lista de PERMISSÃO. O conteúdo é reparentado num `<g transform>`, e um
 * `fill` ou um `style` declarado só na raiz ficaria para trás — o desenho
 * sairia com outra cor, ou sem cor, e nada acusaria porque o arquivo
 * continuaria válido. Para o ativo de hoje não há nenhum; a lista existe para
 * o próximo.
 */
export const ATRIBUTOS_HERDAVEIS = Object.freeze([
  "fill",
  "fill-rule",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "color",
  "opacity",
  "style",
  "font-family",
  "font-size",
  "text-anchor",
]);

/**
 * As duas composições, cada uma com o token que a pinta e o quanto o logotipo
 * ocupa da caixa.
 *
 * ─── AS FRAÇÕES, E POR QUE ESTAS ──────────────────────────────────────────
 *
 * A Imagem Padrão do Site é buscada por gerador de prévia, e o WhatsApp mostra
 * o cartão PEQUENO recortado aproximadamente quadrado: de 1200×630 sobra a
 * faixa central de ~630px de largura. 0,45 põe o logotipo em 540px — dentro
 * dessa faixa, então a marca continua inteira nos dois cartões. A fração de
 * altura existe para o dia em que o ativo de marca for alto ou quadrado: a
 * escala é o MENOR dos dois ajustes, senão um logotipo quadrado sairia
 * decepado em cima e embaixo.
 *
 * O Logotipo Rasterizado não passa por recorte nenhum — ele é o próprio
 * logotipo, num quadro do tamanho dele —, então ocupa quase toda a caixa.
 *
 * ─── E A IMPRESSÃO ────────────────────────────────────────────────────────
 *
 * `impressao` é o SHA-256 do documento SVG composto. Ela prende a COMPOSIÇÃO
 * independentemente do rasterizador: mudar a fração, o token ou o ativo de
 * marca muda a impressão em qualquer máquina, enquanto uma diferença de
 * codificação do PNG entre plataformas não a toca. É o que permite distinguir
 * "alguém mexeu na composição" (defeito) de "este binário codifica diferente"
 * (infraestrutura). Regravar com `node scripts/gerar-imagem-padrao.mjs
 * --impressoes`.
 */
export const COMPOSICOES = Object.freeze([
  Object.freeze({
    nome: "Imagem Padrão do Site",
    ativo: IMAGEM_PADRAO_DO_SITE,
    destino: `public${IMAGEM_PADRAO_DO_SITE.caminho}`,
    token: "--brand-wash",
    fracaoDaLargura: 0.45,
    fracaoDaAltura: 0.62,
    impressao: "8e1de1b02c21d7c34dc23b0909fb0cce2c9e8e24aa2bcad789e488418e3389b6",
  }),
  Object.freeze({
    nome: "Logotipo Rasterizado",
    ativo: LOGOTIPO_DA_MARCA,
    destino: `public${LOGOTIPO_DA_MARCA.caminho}`,
    token: "--surface",
    fracaoDaLargura: 0.9,
    fracaoDaAltura: 0.9,
    impressao: "bcedc417f8bf252186da16d8820a33576c1e2d4da8f6a56ef533230a5ea8ffda",
  }),
]);

/* ─── A leitura do token ─────────────────────────────────────────────────── */

/** Escapa o que for metacaractere, para o token entrar cru numa expressão. */
const escapar = (texto) => String(texto).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * O valor literal de um token de cor em `src/App.css`.
 *
 * Exige ocorrência ÚNICA e valor hexadecimal OPACO. Um token declarado duas
 * vezes faria a imagem nascer de uma cor que ninguém escolheu, e falhar alto é
 * melhor que rasterizar em silêncio o fundo errado.
 *
 * ─── TRÊS CUIDADOS QUE PARECEM PEDANTES E NÃO SÃO ─────────────────────────
 *
 * 1. COMENTÁRIO NÃO É DECLARAÇÃO. `src/App.css` explica em prosa por que cada
 *    cor foi escolhida, e essa prosa cita cores. Sem tirar comentário, uma
 *    linha comentada passaria a IMPEDIR a geração com a mensagem "declarado
 *    duas vezes", mandando a pessoa procurar a coisa errada.
 * 2. O NOME PRECISA ACABAR ONDE ACHA QUE ACABA. Sem a fronteira à esquerda,
 *    procurar `--surface` casaria também `--surface-sunk`.
 * 3. HEXADECIMAL OPACO. `#rgba`, `#rrggbbaa` e as formas de 5 e 7 dígitos
 *    passariam por "é hexadecimal" e rasterizariam um fundo transparente ou
 *    truncado, em silêncio.
 */
export function corDoToken(css, token) {
  const semComentarios = String(css).replace(/\/\*[\s\S]*?\*\//g, " ");
  const padrao = new RegExp(`(?:^|[^-\\w])${escapar(token)}\\s*:\\s*([^;}]+)[;}]`, "g");
  const achados = [...semComentarios.matchAll(padrao)].map((m) => m[1].trim());
  if (achados.length !== 1) {
    throw new Error(
      `${token} precisa estar declarado uma vez em ${FONTE_DO_TOKEN}; achados: ${achados.length}`,
    );
  }
  const valor = achados[0];
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(valor)) {
    throw new Error(`${token} precisa ser hexadecimal OPACO de 3 ou 6 dígitos; veio: ${valor}`);
  }
  return valor.toLowerCase();
}

/* ─── A composição ───────────────────────────────────────────────────────── */

/**
 * Onde a tag raiz termina, ignorando `>` dentro de valor de atributo.
 *
 * Parar no primeiro `>` é o defeito clássico deste projeto — foi assim que um
 * detector de `<img>` casou zero etiquetas e deixou duas asserções verdes por
 * vacuidade. Aqui o preço seria pior: um `>` dentro de um `style` cortaria o
 * documento no meio e o conteúdo sairia truncado, com o arquivo ainda válido.
 */
function fimDaTagRaiz(texto, inicio) {
  let aspas = null;
  for (let i = inicio; i < texto.length; i += 1) {
    const c = texto[i];
    if (aspas !== null) {
      if (c === aspas) aspas = null;
      continue;
    }
    if (c === '"' || c === "'") aspas = c;
    else if (c === ">") return i;
  }
  return -1;
}

/**
 * O conteúdo, a caixa e os atributos herdáveis de um SVG, separados da raiz.
 *
 * O conteúdo é reaproveitado dentro de um `<g transform>` em vez de um `<svg>`
 * aninhado: o grupo com transformação é a construção mais antiga e mais
 * suportada das duas, e `<defs>`, `clipPath` e identificador continuam válidos
 * dentro dele. O que a raiz declarava e o grupo precisa levar junto vai em
 * `herdados`.
 */
export function desmontarSvg(texto) {
  const bruto = String(texto);
  const abre = bruto.indexOf("<svg");
  if (abre < 0) throw new Error(`${ATIVO_DE_MARCA} não tem elemento <svg>`);
  const fimAbre = fimDaTagRaiz(bruto, abre);
  const fecha = bruto.lastIndexOf("</svg>");
  if (fimAbre < 0 || fecha < 0 || fecha < fimAbre) {
    throw new Error(`${ATIVO_DE_MARCA} não tem a forma de um SVG com raiz única`);
  }
  const tagRaiz = bruto.slice(abre, fimAbre + 1);
  const conteudo = bruto.slice(fimAbre + 1, fecha);

  const atributos = new Map();
  for (const achado of tagRaiz.matchAll(
    /([a-zA-Z][a-zA-Z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
  )) {
    atributos.set(achado[1].toLowerCase(), achado[2] ?? achado[3] ?? "");
  }

  const caixa = atributos.get("viewbox");
  if (!caixa) {
    throw new Error(`${ATIVO_DE_MARCA} não declara viewBox — a escala não seria derivável`);
  }
  const [x, y, largura, altura] = caixa.trim().split(/[\s,]+/).map(Number);
  if (![x, y, largura, altura].every(Number.isFinite) || largura <= 0 || altura <= 0) {
    throw new Error(`viewBox inválido em ${ATIVO_DE_MARCA}: ${caixa}`);
  }

  const herdados = ATRIBUTOS_HERDAVEIS.filter((nome) => atributos.has(nome))
    .map((nome) => `${nome}="${atributos.get(nome).replace(/"/g, "&quot;")}"`)
    .join(" ");

  return { conteudo, x, y, largura, altura, herdados };
}

/** Arredonda para três casas: número gigante no `transform` é ruído no diff. */
const casas = (n) => Number(n.toFixed(3));

/** O documento SVG de uma composição: fundo do token, logotipo centralizado. */
export function svgDaComposicao(composicao, { marca, fundo }) {
  const { conteudo, x, y, largura: vw, altura: vh, herdados } = desmontarSvg(marca);
  const L = composicao.ativo.largura;
  const A = composicao.ativo.altura;

  /* A escala é o MENOR dos dois ajustes: um ativo de marca mais alto que largo
     caberia na largura e sairia decepado na altura. */
  const escala = Math.min(
    (L * composicao.fracaoDaLargura) / vw,
    (A * composicao.fracaoDaAltura) / vh,
  );
  const tx = (L - vw * escala) / 2 - x * escala;
  const ty = (A - vh * escala) / 2 - y * escala;

  const grupo =
    `<g ${herdados ? `${herdados} ` : ""}` +
    `transform="translate(${casas(tx)} ${casas(ty)}) scale(${casas(escala)})">`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${L}" height="${A}" viewBox="0 0 ${L} ${A}">` +
    `<rect x="0" y="0" width="${L}" height="${A}" fill="${fundo}"/>` +
    `${grupo}${conteudo}</g>` +
    `</svg>`
  );
}

/** A impressão de um documento composto — SHA-256, em hexadecimal. */
export function impressaoDaComposicao(svg) {
  return createHash("sha256").update(svg, "utf8").digest("hex");
}
