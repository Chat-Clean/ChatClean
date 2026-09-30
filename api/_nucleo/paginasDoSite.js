/**
 * As páginas fixas do site — as que o mapa estático listava antes de sair.
 *
 * ─── POR QUE ESTA LISTA EXISTE ────────────────────────────────────────────
 *
 * `public/sitemap.xml` foi removido nesta entrega porque o sistema de arquivos
 * é consultado ANTES das reescritas: deixá-lo faria a rota dinâmica existir na
 * configuração e nunca rodar, e a única forma de descobrir seria notar que o
 * conteúdo não muda. Mas ele listava cinco endereços, e removê-lo sem trazê-los
 * junto entregaria uma regressão dentro de uma melhoria — a Story 4.7 diz, com
 * estas palavras, que o mapa lista os Posts "além das URLs já listadas".
 *
 * Então esta é a lista que sobreviveu à remoção, com os mesmos endereços e a
 * mesma importância relativa. O que ela NÃO tem é `lastmod`: a data que o
 * arquivo trazia era de maio e estava congelada, e repetir uma data que ninguém
 * mantém é pior que não declarar — a Story 4.7 traz `lastmod` REAL, e é dela
 * esse trabalho.
 *
 * A Story 4.1 moveu o mapa de arquivo para função sem perder nada, e sem o
 * fazer crescer. Ele cresceu depois: os Posts entraram na Story 4.7, e as Vagas
 * Abertas na Story 5.9, depois dos Posts (`mapaDoSite`, 4º parâmetro).
 */

import { enderecoDaPaginaDaVaga } from "../../src/domain/carreiras/vaga.js";
import { ehInstanteIso } from "../../src/domain/carreiras/jobPosting.js";

/** A frequência declarada de cada Vaga no mapa (Story 5.9). */
export const FREQUENCIA_DA_VAGA = "weekly";

/** A importância declarada de cada Vaga no mapa (Story 5.9): abaixo dos Posts
 * (`0.8`) e acima da listagem `/carreiras` (`0.5`). */
export const PRIORIDADE_DA_VAGA = "0.6";

/** Caminho e importância de cada página fixa. Lista fechada. */
export const PAGINAS_DO_SITE = Object.freeze([
  Object.freeze({
    caminho: "/",
    prioridade: "1.0",
    frequencia: "weekly",
    descricao: "A plataforma: CRM e chatbot para WhatsApp com API Oficial.",
  }),
  Object.freeze({
    caminho: "/api-oficial-whatsapp",
    prioridade: "0.9",
    frequencia: "monthly",
    descricao:
      "O que e a API Oficial do WhatsApp Business, como contratar e quanto custa.",
  }),
  Object.freeze({
    caminho: "/integracoes",
    prioridade: "0.8",
    frequencia: "monthly",
    descricao:
      "Como a ChatClean se conecta a CRM, e-commerce, pagamentos e IA: webhook, API e integradores como n8n, Make e Zapier.",
  }),
  Object.freeze({
    caminho: "/sobre",
    prioridade: "0.7",
    frequencia: "monthly",
    descricao: "Quem faz a ChatClean, e de onde.",
  }),
  Object.freeze({
    caminho: "/blog",
    prioridade: "0.9",
    frequencia: "weekly",
    descricao: "Artigos sobre atendimento no WhatsApp, automacao e gestao de clientes.",
  }),
  Object.freeze({
    caminho: "/carreiras",
    prioridade: "0.5",
    frequencia: "monthly",
    descricao: "Vagas abertas e como e trabalhar aqui.",
  }),
]);

/** Escapa o que vai dentro de um nó de XML. Endereço com `&` é o caso real. */
export function escaparXml(texto) {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * O mapa do site, em XML válido.
 *
 * `raiz` é o Domínio Canônico já resolvido — o mapa exige endereço ABSOLUTO, e
 * montá-lo a partir da requisição daria o caminho da própria função, que é o
 * engano que a Story 4.5 registra por escrito.
 *
 * `vagas` (Story 5.9) são as linhas de `vagasAbertasServidas` (Slug e
 * `atualizado_em` são os campos lidos), já filtradas pela função de banco:
 * nenhuma regra de visibilidade mora aqui. Cada uma vira um nó depois dos
 * Posts; a que tem endereço `null` (sem Slug) fica de fora. Vazio (o padrão),
 * o mapa é exatamente o de antes.
 */
export function mapaDoSite(raiz, paginas = PAGINAS_DO_SITE, posts = [], vagas = []) {
  const semBarra = String(raiz).replace(/\/+$/, "");

  const noDaPagina = (p) =>
    "  <url>\n" +
    `    <loc>${escaparXml(`${semBarra}${p.caminho}`)}</loc>\n` +
    `    <changefreq>${p.frequencia}</changefreq>\n` +
    `    <priority>${p.prioridade}</priority>\n` +
    "  </url>";

  /**
   * O nó de um Post (Story 4.7).
   *
   * `lastmod` é o `atualizado_em` REAL, e é OMITIDO quando não há ou quando não
   * é reconhecível como instante. Data congelada é pior que data ausente: o
   * mapa estático trazia uma de maio que ninguém mantinha — um buscador que
   * confia nela deixa de revisitar, e um que percebe a mentira passa a
   * desconfiar de todas as datas do site.
   */
  const noDoPost = (post) => {
    const slug = String(post?.slug ?? "").trim();
    if (slug === "") return null;

    const bruto = post?.atualizado_em;
    const quando =
      typeof bruto === "string" && Number.isFinite(Date.parse(bruto))
        ? new Date(bruto).toISOString().slice(0, 10)
        : null;

    return (
      "  <url>\n" +
      `    <loc>${escaparXml(`${semBarra}/blog/${slug}`)}</loc>\n` +
      (quando === null ? "" : `    <lastmod>${quando}</lastmod>\n`) +
      "    <changefreq>monthly</changefreq>\n" +
      "    <priority>0.8</priority>\n" +
      "  </url>"
    );
  };

  /**
   * O nó de uma Vaga Aberta (Story 5.9).
   *
   * O endereço sai do domínio (`enderecoDaPaginaDaVaga`), o mesmo que a
   * listagem servida usa; sem endereço, a Vaga fica de fora. A lista já chega
   * filtrada pela função de banco: nenhuma regra de visibilidade mora aqui.
   *
   * `lastmod` é o INSTANTE completo de `atualizado_em`, e não só a data como
   * no Post: uma Vaga editada duas vezes no mesmo dia mudaria sem o mapa
   * acusar. Só vale ISO 8601 com data, hora e fuso (`ehInstanteIso`, a mesma
   * regra do `datePosted`); ausente, em outro formato ou com ano estendido, o
   * `lastmod` é OMITIDO. Sem reserva em `aberta_em`: o banco sempre preenche
   * `atualizado_em`.
   */
  const noDaVaga = (vaga) => {
    const caminho = enderecoDaPaginaDaVaga(vaga?.slug);
    if (caminho === null) return null;

    const bruto = vaga?.atualizado_em;
    const quando = ehInstanteIso(bruto) ? new Date(bruto).toISOString() : null;

    return (
      "  <url>\n" +
      `    <loc>${escaparXml(`${semBarra}${caminho}`)}</loc>\n` +
      (quando === null ? "" : `    <lastmod>${quando}</lastmod>\n`) +
      `    <changefreq>${FREQUENCIA_DA_VAGA}</changefreq>\n` +
      `    <priority>${PRIORIDADE_DA_VAGA}</priority>\n` +
      "  </url>"
    );
  };

  const nos = [
    ...paginas.map(noDaPagina),
    ...(Array.isArray(posts) ? posts.map(noDoPost) : []),
    ...(Array.isArray(vagas) ? vagas.map(noDaVaga) : []),
  ].filter((no) => no !== null);

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `${nos.join("\n")}\n` +
    "</urlset>\n"
  );
}
