/**
 * A leitura de `<meta>` e de dado estruturado, para as ferramentas de
 * verificação — uma implementação, dois consumidores.
 *
 * ─── POR QUE NÃO É EXPRESSÃO REGULAR SOLTA EM CADA FERRAMENTA ─────────────
 *
 * A primeira versão disto era uma expressão por ferramenta, e as duas exigiam
 * `property`/`name` **antes** de `content`, com exatamente um espaço e aspas
 * duplas. Medido, isso deixava três formas de evasão de pé:
 *
 *   - `<meta content="…" property="og:image" />` — atributos na outra ordem;
 *   - `<meta property='og:image' content='…' />` — aspas simples;
 *   - qualquer minificador de HTML no build, que reescreve os dois.
 *
 * Uma varredura que não vê o que ela existe para ver é pior que varredura
 * nenhuma: ela fica verde. Aqui os atributos são LIDOS, não casados em ordem.
 */

/** Os atributos de uma tag, por nome em minúsculas. Aspas simples ou duplas. */
export function atributosDaTag(tag) {
  const atributos = new Map();
  for (const achado of String(tag).matchAll(
    /([a-zA-Z][a-zA-Z0-9:_.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
  )) {
    atributos.set(achado[1].toLowerCase(), achado[2] ?? achado[3] ?? "");
  }
  return atributos;
}

/**
 * Toda `<meta>` do documento, como `{ nome, conteudo }`.
 *
 * `nome` é `property` ou `name` — os dois nomes que o Open Graph e o Twitter
 * Card usam para a mesma coisa, e ignorar um deles deixaria metade das
 * etiquetas invisível.
 */
export function etiquetasMeta(html) {
  const achadas = [];
  for (const [tag] of String(html).matchAll(/<meta\b[^>]*>/g)) {
    const atributos = atributosDaTag(tag);
    /* `itemprop` entra junto: `<meta itemprop="image" …>` é dado estruturado em
       microdata, aponta para imagem do mesmo jeito, e ficaria invisível para uma
       leitura que só olhasse `property` e `name`. */
    const nome =
      atributos.get("property") ?? atributos.get("name") ?? atributos.get("itemprop") ?? null;
    if (nome === null) continue;
    achadas.push({ nome, conteudo: atributos.get("content") ?? "", tag });
  }
  return achadas;
}

/** O conteúdo de uma `<meta>` pelo nome, ou `null`. */
export function conteudoDaMeta(html, nome) {
  const alvo = etiquetasMeta(html).find((e) => e.nome === nome);
  return alvo ? alvo.conteudo : null;
}

/** Todo `<link>` do documento, como `{ rel, href }`. */
export function etiquetasLink(html) {
  const achadas = [];
  for (const [tag] of String(html).matchAll(/<link\b[^>]*>/g)) {
    const atributos = atributosDaTag(tag);
    achadas.push({
      rel: atributos.get("rel") ?? "",
      href: atributos.get("href") ?? "",
      tipo: atributos.get("type") ?? "",
      tag,
    });
  }
  return achadas;
}

/**
 * O corpo de cada bloco `<script type="application/ld+json">`.
 *
 * Devolve o TEXTO, não o objeto: quem chama decide o que fazer com um bloco que
 * não parseia — e "não parseia" precisa virar asserção falha, nunca bloco
 * silenciosamente ignorado.
 */
export function blocosDeDadoEstruturado(html) {
  const blocos = [];
  for (const achado of String(html).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const tipo = atributosDaTag(`<script ${achado[1]}>`).get("type") ?? "";
    if (tipo.trim().toLowerCase() === "application/ld+json") blocos.push(achado[2]);
  }
  return blocos;
}
