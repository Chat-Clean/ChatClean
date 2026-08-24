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
 * Os Posts entram aqui na Story 4.7. Esta story move o mapa de arquivo para
 * função sem perder nada; ela não o faz crescer.
 */

/** Caminho e importância de cada página fixa. Lista fechada. */
export const PAGINAS_DO_SITE = Object.freeze([
  Object.freeze({ caminho: "/", prioridade: "1.0", frequencia: "weekly" }),
  Object.freeze({ caminho: "/api-oficial-whatsapp", prioridade: "0.9", frequencia: "monthly" }),
  Object.freeze({ caminho: "/sobre", prioridade: "0.7", frequencia: "monthly" }),
  Object.freeze({ caminho: "/blog", prioridade: "0.9", frequencia: "weekly" }),
  Object.freeze({ caminho: "/carreiras", prioridade: "0.5", frequencia: "monthly" }),
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
 */
export function mapaDoSite(raiz, paginas = PAGINAS_DO_SITE) {
  const semBarra = String(raiz).replace(/\/+$/, "");
  const nos = paginas
    .map((p) => {
      const endereco = escaparXml(`${semBarra}${p.caminho}`);
      return (
        "  <url>\n" +
        `    <loc>${endereco}</loc>\n` +
        `    <changefreq>${p.frequencia}</changefreq>\n` +
        `    <priority>${p.prioridade}</priority>\n` +
        "  </url>"
      );
    })
    .join("\n");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `${nos}\n` +
    "</urlset>\n"
  );
}
