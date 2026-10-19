/**
 * O feed RSS do blog: RSS 2.0, seguindo o RSS Best Practices Profile do RSS
 * Advisory Board (https://www.rssboard.org/rss-profile), que é o que o
 * validador do W3C cobra.
 *
 * ─── O QUE CADA ITEM DECLARA ──────────────────────────────────────────────
 *
 *   - `title` e `link`, com o endereço canônico do artigo;
 *   - `guid` PERMANENTE (`isPermaLink="false"`, o id do Post): o Slug pode ser
 *     aposentado (Story 4.5), e um `guid` que fosse o endereço mudaria junto,
 *     fazendo o leitor de feed mostrar o mesmo artigo duas vezes;
 *   - `description` com o Resumo, e `content:encoded` com o artigo inteiro: o
 *     perfil manda o resumo em `description` e o texto completo no módulo de
 *     conteúdo quando há os dois;
 *   - `dc:creator`, e não `author`: `author` exige e-mail, e o perfil diz para
 *     usar `dc:creator` quando não se quer expor um;
 *   - `category`, `pubDate` (RFC 822 com ano de quatro dígitos, em GMT) e a
 *     capa como `enclosure`, o elemento do núcleo para mídia anexada.
 *
 * ─── E ELE NÃO DECIDE O QUE ESTÁ NO AR ────────────────────────────────────
 *
 * Os Posts chegam já resolvidos pela rota, pelas MESMAS leituras do mapa do
 * site e da página do artigo. Aqui só se escreve XML.
 *
 * Puro: sem rede, sem `fs`.
 */

import { metadadosDoPost, tipoDaImagem } from "../../src/domain/blog/compartilhamento.js";
import { conferirConteudo } from "./artigo.js";
import { escapar } from "./metadados.js";

/** O caminho do feed. É o `href` do `atom:link` e da descoberta no `<head>`. */
export const CAMINHO_DO_FEED = "/feed.xml";

/** O tipo que o RSS Advisory Board registra para RSS. */
export const TIPO_DO_FEED = "application/rss+xml; charset=utf-8";

/** O nome do canal. O perfil pede o nome do site quando o feed é dele. */
export const TITULO_DO_FEED = "Blog ChatClean";

export const DESCRICAO_DO_FEED =
  "Artigos sobre atendimento no WhatsApp, automação com IA e gestão de " +
  "clientes, pela equipe da ChatClean.";

/**
 * Quantos artigos o feed carrega. Leitor de feed guarda o que já viu, então o
 * feed só precisa cobrir o intervalo entre duas visitas dele.
 */
export const ITENS_NO_FEED = 20;

/**
 * A imagem do canal. O RSS 2.0 limita a 144 de largura e 400 de altura, e o
 * ícone da marca tem 512: este é o mesmo ícone, reduzido.
 */
export const IMAGEM_DO_FEED = Object.freeze({
  caminho: "/icone-do-feed.png",
  largura: 144,
  altura: 144,
});

/** O minuto de vida do cache (`SEGUNDOS_DE_CACHE`), dito ao leitor de feed. */
export const MINUTOS_DE_TTL = 60;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Texto puro dentro de elemento de texto puro (título, categoria, autor).
 *
 * O perfil recomenda as entidades NUMÉRICAS para `&`, `<` e `>`: há leitor
 * que decodifica o texto duas vezes, e `&amp;` sobrevive menos a isso que
 * `&#x26;`.
 */
export function textoDoFeed(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&#x26;")
    .replace(/</g, "&#x3C;")
    .replace(/>/g, "&#x3E;");
}

/** Atributo de XML (`href`, `url`). */
function atributoDoFeed(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

/**
 * HTML dentro de CDATA. Um `]]>` no conteúdo fecharia a seção cedo, e por isso
 * ele é partido em duas seções.
 */
export function cdata(html) {
  return `<![CDATA[${String(html).replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

/**
 * A data no formato do RSS (RFC 822, ano com quatro dígitos, em GMT), ou
 * `null` quando não é instante reconhecível. Data inventada é pior que data
 * ausente.
 */
export function dataDoFeed(valor) {
  if (typeof valor !== "string" || valor === "") return null;
  const ms = Date.parse(valor);
  return Number.isFinite(ms) ? new Date(ms).toUTCString() : null;
}

/**
 * Endereço relativo vira absoluto, contra o endereço do artigo.
 *
 * O Conteúdo aceita link relativo (`/sobre`, `#secao`), e o perfil proíbe
 * endereço relativo no feed: o leitor resolve contra o endereço DELE, e o link
 * vai para lugar nenhum. Endereço com esquema passa como veio.
 */
export function absolutizarEnderecos(html, base) {
  return String(html).replace(/\s(href|src)="([^"]*)"/gi, (inteiro, nome, valor) => {
    const cru = valor.replace(/&amp;/g, "&");
    if (/^[a-z][a-z0-9+.-]*:/i.test(cru)) return inteiro;
    try {
      return ` ${nome}="${escapar(new URL(cru, base).href)}"`;
    } catch {
      return inteiro;
    }
  });
}

/**
 * O item de um Post. Devolve `{ xml, defeito }`, e `xml` é `null` quando o
 * Post não tem como ser um item (sem Slug ou sem título).
 *
 * `defeito` preenchido é Conteúdo que não passou na conferência do
 * vocabulário: o item sai SEM `content:encoded`, com o Resumo, que é o mesmo
 * tratamento da página do artigo (o corpo servido é omitido e o rastro fica).
 */
export function itemDoFeed({ slug, post, raiz }) {
  const titulo = typeof post?.titulo === "string" ? post.titulo.trim() : "";
  if (typeof slug !== "string" || !SLUG.test(slug) || titulo === "") {
    return { xml: null, defeito: null };
  }

  const endereco = `${raiz}/blog/${slug}`;
  const linhas = [
    `      <title>${textoDoFeed(titulo)}</title>`,
    `      <link>${atributoDoFeed(endereco)}</link>`,
  ];

  const id = typeof post.post_id === "string" ? post.post_id.trim() : "";
  linhas.push(
    UUID.test(id)
      ? `      <guid isPermaLink="false">urn:uuid:${id.toLowerCase()}</guid>`
      : `      <guid isPermaLink="true">${atributoDoFeed(endereco)}</guid>`,
  );

  const resumo = typeof post.resumo === "string" ? post.resumo.trim() : "";
  if (resumo !== "") linhas.push(`      <description>${cdata(escapar(resumo))}</description>`);

  const autor = typeof post.autor_nome === "string" ? post.autor_nome.trim() : "";
  if (autor !== "") linhas.push(`      <dc:creator>${textoDoFeed(autor)}</dc:creator>`);

  const categoria = typeof post.categoria_nome === "string" ? post.categoria_nome.trim() : "";
  if (categoria !== "") linhas.push(`      <category>${textoDoFeed(categoria)}</category>`);

  const publicado = dataDoFeed(post.publicado_em);
  if (publicado !== null) linhas.push(`      <pubDate>${publicado}</pubDate>`);

  /* A CAPA, SÓ QUANDO É DO POST. A imagem padrão do site resolveria todo Post
     sem capa, e um feed em que metade dos itens traz o logotipo como "imagem
     do artigo" é pior que um sem imagem. `length` 0 é o que o perfil manda
     quando o tamanho não é conhecido sem baixar o arquivo. */
  const imagem = metadadosDoPost(post, { dominio: raiz }).imagem;
  const temCapa = imagem.origem !== "padrao" && tipoDaImagem(imagem.endereco) !== null;
  if (temCapa) {
    linhas.push(
      `      <enclosure url="${atributoDoFeed(imagem.endereco)}" length="0" type="${tipoDaImagem(imagem.endereco)}" />`,
    );
  }

  let defeito = null;
  const conteudo = typeof post.conteudo_html === "string" ? post.conteudo_html : "";
  if (conteudo.trim() !== "") {
    const conferido = conferirConteudo(conteudo);
    if (conferido.ok) {
      /* A capa abre o artigo também no corpo: é de onde a maioria dos leitores
         tira a imagem, mais do que do `enclosure`. */
      const capa = temCapa
        ? `<p><img src="${escapar(imagem.endereco)}" alt="${escapar(imagem.alternativo ?? "")}" /></p>\n`
        : "";
      linhas.push(
        `      <content:encoded>${cdata(capa + absolutizarEnderecos(conteudo, endereco))}</content:encoded>`,
      );
    } else {
      defeito = conferido.defeito;
    }
  }

  return { xml: ["    <item>", ...linhas, "    </item>"].join("\n"), defeito };
}

/**
 * O feed inteiro.
 *
 * `posts` é a lista `{ slug, post }`, mais novo primeiro. `lastBuildDate` é o
 * último instante em que o CONTEÚDO mudou (o maior `atualizado_em`), e não o
 * relógio da requisição: um feed que "muda" a cada leitura faz o leitor baixá-lo
 * inteiro toda vez.
 *
 * Devolve `{ xml, defeitos }`.
 */
export function feedDoBlog({ raiz, posts = [] }) {
  const semBarra = String(raiz).replace(/\/+$/, "");
  const itens = [];
  const defeitos = [];
  let ultimaMudanca = null;

  for (const { slug, post } of Array.isArray(posts) ? posts : []) {
    const { xml, defeito } = itemDoFeed({ slug, post, raiz: semBarra });
    if (xml === null) continue;
    itens.push(xml);
    if (defeito !== null) defeitos.push(`${slug}: ${defeito}`);
    for (const instante of [post?.publicado_em, post?.atualizado_em]) {
      const ms = typeof instante === "string" ? Date.parse(instante) : NaN;
      if (Number.isFinite(ms) && (ultimaMudanca === null || ms > ultimaMudanca)) ultimaMudanca = ms;
    }
  }

  const canal = [
    `    <title>${textoDoFeed(TITULO_DO_FEED)}</title>`,
    `    <link>${atributoDoFeed(`${semBarra}/blog`)}</link>`,
    `    <description>${textoDoFeed(DESCRICAO_DO_FEED)}</description>`,
    `    <atom:link href="${atributoDoFeed(`${semBarra}${CAMINHO_DO_FEED}`)}" rel="self" type="application/rss+xml" />`,
    "    <language>pt-BR</language>",
    `    <copyright>${textoDoFeed(`© ${new Date().getUTCFullYear()} ChatClean`)}</copyright>`,
  ];
  if (ultimaMudanca !== null) {
    canal.push(`    <lastBuildDate>${new Date(ultimaMudanca).toUTCString()}</lastBuildDate>`);
  }
  canal.push(
    "    <docs>https://www.rssboard.org/rss-specification</docs>",
    `    <ttl>${MINUTOS_DE_TTL}</ttl>`,
    "    <image>",
    `      <url>${atributoDoFeed(`${semBarra}${IMAGEM_DO_FEED.caminho}`)}</url>`,
    `      <title>${textoDoFeed(TITULO_DO_FEED)}</title>`,
    `      <link>${atributoDoFeed(`${semBarra}/blog`)}</link>`,
    `      <width>${IMAGEM_DO_FEED.largura}</width>`,
    `      <height>${IMAGEM_DO_FEED.altura}</height>`,
    "    </image>",
  );

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" ' +
    'xmlns:content="http://purl.org/rss/1.0/modules/content/" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
    "  <channel>\n" +
    `${[...canal, ...itens].join("\n")}\n` +
    "  </channel>\n" +
    "</rss>\n";

  return { xml, defeitos };
}
