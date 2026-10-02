/**
 * O corpo do artigo, servido para quem não executa JavaScript (Story 4.4).
 *
 * ─── A 4.3 ENTREGOU A ETIQUETA; ESTA ENTREGA O PRODUTO ────────────────────
 *
 * Um rastreador de motor generativo que quer citar o artigo precisa do TEXTO no
 * HTML. Até aqui ele recebia um `<div id="root">` vazio e ia embora.
 *
 * ─── E O CORPO SERVIDO NÃO É RENDERIZADO PELA APLICAÇÃO ───────────────────
 *
 * Ele vive dentro de `<noscript>`, antes do contêiner. Isso não é uma técnica
 * de mitigação de piscada: com JavaScript ligado o navegador **não renderiza** o
 * conteúdo de `<noscript>` — ele nem entra no layout. Duplicação, piscada e
 * deslocamento não são evitados com cuidado; eles não podem acontecer.
 *
 * ─── O HTML GRAVADO É CONFERIDO ANTES DE SER SERVIDO ──────────────────────
 *
 * O banco restringe a coluna desde a Story 2.5, e essa continua sendo a
 * primeira linha. A segunda existe porque este é o módulo onde HTML entra num
 * documento — e "veio do nosso banco, é confiável" é exatamente o raciocínio
 * que transforma um caminho de escrita furado em página comprometida.
 *
 * Um `</noscript>` no conteúdo fecharia o contêiner e derramaria o resto do
 * documento na página. Ele é recusado aqui pelo mesmo motivo que `<script>`: não
 * está no vocabulário. Não há regra especial para ele — é o que torna a defesa
 * confiável.
 *
 * Puro: sem React, sem rede, sem `fs`.
 */

import {
  ATRIBUTOS_EMITIDOS,
  ETIQUETAS_EMITIDAS,
} from "../../src/render/blog/paraHtml.js";
import { NO_AR } from "../../src/domain/blog/entrega.js";
/* O ESCAPE VEM DA STORY 4.3, e não é reescrito aqui: a tabela é fechada e já
   tem autoteste nos cinco caracteres. Uma segunda implementação do mesmo escape
   é onde nasce a que esquece o `&`. */
import { escapar } from "./metadados.js";

/** Os marcadores da região do corpo. Mesma ideia da região de metadados. */
export const MARCA_CORPO_INICIO = "<!-- CORPO-DO-ARTIGO:INICIO";
export const MARCA_CORPO_FIM = "<!-- CORPO-DO-ARTIGO:FIM";

/**
 * As listas vêm do RENDERIZADOR, e não são reescritas aqui.
 *
 * Uma terceira cópia compararia duas versões do mesmo engano: o dia em que o
 * vocabulário encolhesse, a cópia continuaria aceitando o que saiu dele.
 */
export const ETIQUETAS_ACEITAS = ETIQUETAS_EMITIDAS;
export const ATRIBUTOS_ACEITOS = ATRIBUTOS_EMITIDOS;

/* Um atributo: separadores, o nome, e o valor quando há. O nome é tudo o que
   não é separador, aspa, sinal de igual ou sinal de etiqueta — de propósito
   mais largo que o formato de um nome válido, para que o nome torto seja LIDO e
   recusado pelo vocabulário, em vez de fazer a leitura parar no meio. */
const ATRIBUTO = /[\s/]*([^\s"'<>/=]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/y;

/**
 * Confere os atributos de UMA etiqueta. Devolve `null` quando todos estão no
 * vocabulário, ou a frase do defeito.
 */
function conferirAtributos(resto, nome) {
  let posicao = 0;
  while (posicao < resto.length) {
    ATRIBUTO.lastIndex = posicao;
    const achado = ATRIBUTO.exec(resto);
    if (achado === null || achado[0].length === 0) break;
    posicao = ATRIBUTO.lastIndex;
    const atributo = achado[1];
    if (!ATRIBUTOS_ACEITOS.includes(atributo.toLowerCase())) {
      return `O Conteúdo traz o atributo \`${atributo}\` em \`${nome}\`, que não está no vocabulário do renderizador.`;
    }
  }
  /* O QUE SOBROU PRECISA SER NADA. Separador no fim é o `/` da etiqueta
     auto-fechada; qualquer outra coisa é um trecho que a leitura não entendeu,
     e o que não foi entendido não foi conferido. */
  if (/[^\s/]/.test(resto.slice(posicao))) {
    return `O Conteúdo traz a etiqueta \`${nome}\` com um atributo malformado: ${resto.slice(posicao, posicao + 40)}`;
  }
  return null;
}

/**
 * Confere o HTML gravado contra o vocabulário fechado.
 *
 * ─── LISTA DE PERMISSÃO, E NUNCA DE PROIBIÇÃO ─────────────────────────────
 *
 * A tentação é procurar `<script`, `onerror=`, `javascript:`. Lista de
 * proibição sempre tem a forma que ninguém pensou — e a Story 2.5 registrou a
 * que passou: `<a/onclick=`, porque a barra é separador de atributo válido em
 * HTML. O que se mede aqui é o NOME da etiqueta e o NOME de cada atributo,
 * contra conjuntos fechados.
 *
 * Devolve `{ok:true}` ou `{ok:false, defeito}`. Nunca lança.
 */
export function conferirConteudo(html) {
  if (typeof html !== "string") {
    return { ok: false, defeito: "O Conteúdo gravado não é texto." };
  }

  /* Toda etiqueta é capturada, inclusive a de fechamento e a auto-fechada. O
     casamento é do MENOR pedaço possível entre `<` e `>`; o que não casar não é
     etiqueta, e é conferido logo abaixo como texto solto. */
  const etiquetas = [...html.matchAll(/<([^>]*)>/g)];

  for (const [inteira, miolo] of etiquetas) {
    /* Comentário HTML não é etiqueta e não é vocabulário. Ele poderia esconder
       qualquer coisa de quem lê a página, e o renderizador não emite nenhum. */
    if (miolo.startsWith("!") || miolo.startsWith("?")) {
      return {
        ok: false,
        defeito: `O Conteúdo traz um comentário ou instrução que o renderizador não emite: ${inteira.slice(0, 40)}`,
      };
    }

    const corpo = miolo.startsWith("/") ? miolo.slice(1) : miolo;
    const nome = (/^\s*([A-Za-z][A-Za-z0-9]*)/.exec(corpo)?.[1] ?? "").toLowerCase();
    if (nome === "") {
      return {
        ok: false,
        defeito: `O Conteúdo traz uma etiqueta sem nome: ${inteira.slice(0, 40)}`,
      };
    }
    if (!ETIQUETAS_ACEITAS.includes(nome)) {
      /* `noscript` cai AQUI, e não numa regra própria. Uma regra especial para
         ele diria que as outras são menos perigosas — e no dia em que o
         contêiner mudasse, a regra especial estaria protegendo a coisa errada. */
      return {
        ok: false,
        defeito: `O Conteúdo traz a etiqueta \`${nome}\`, que não está no vocabulário do renderizador.`,
      };
    }

    /* Os NOMES DE ATRIBUTO. `/` é separador válido em HTML, e por isso entra na
       classe de separadores: senão `<a/onclick=…>` chega aqui como um atributo
       chamado `/onclick`, que não casa com nada e passaria despercebido.

       ─── O VALOR É CONSUMIDO JUNTO COM O NOME ───────────────────────────────
       A primeira versão procurava "separador seguido de palavra" na etiqueta
       INTEIRA, valores inclusive. Um endereço tem barra e tem palavra: em
       `src="https://images.unsplash.com/…"` ela lia um atributo chamado
       `images`, e em `href="https://about.fb.com/…"` um chamado `about`. Todo
       Post com link ou imagem de fora era recusado, e o blog inteiro ficava sem
       corpo servido — com a página funcionando no navegador, que é como um
       defeito desses passa meses sem ninguém ver.

       Agora a etiqueta é lida como o navegador a lê: atributo a atributo, cada
       um com o seu valor (entre aspas duplas, simples, ou sem aspas). O que não
       couber nessa leitura — aspa que não fecha, sinal de igual solto — é
       recusado, e não pulado. */
    const resto = corpo.slice(corpo.toLowerCase().indexOf(nome) + nome.length);
    const defeitoDosAtributos = conferirAtributos(resto, nome);
    if (defeitoDosAtributos !== null) return { ok: false, defeito: defeitoDosAtributos };
  }

  /* E UM `<` SOLTO É RECUSADO. Um conteúdo com `<` que não abre etiqueta
     nenhuma foi gravado sem escape, e o navegador o interpretaria de um jeito
     que este módulo não conferiu. */
  const semEtiquetas = html.replace(/<[^>]*>/g, "");
  if (semEtiquetas.includes("<")) {
    return {
      ok: false,
      defeito: "O Conteúdo traz um `<` solto — sinal de HTML gravado sem escape.",
    };
  }

  return { ok: true };
}

/**
 * O texto puro do Conteúdo, para `articleBody`.
 *
 * Deriva do MESMO HTML que é servido, e não de uma segunda coluna: duas fontes
 * do mesmo texto divergiriam na primeira edição, e o dado estruturado passaria
 * a citar uma versão que a página não mostra.
 */
export function textoDoConteudo(html) {
  if (typeof html !== "string") return "";
  return html
    /* Bloco vira separador de parágrafo, e não emenda: sem isto, "…fim.<p>Novo"
       viraria "…fim.Novo" e a última palavra colaria na primeira. */
    .replace(/<\/(p|h2|h3|li|blockquote|pre)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    /* As entidades voltam ao texto: `articleBody` é TEXTO, e `&amp;` ali seria
       o artigo citado com a entidade à mostra. A tabela é a mesma da 4.3, na
       ordem inversa — e `&amp;` por último, senão `&amp;lt;` viraria `<`. */
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * A região do corpo: o `<noscript>` com o artigo, e o dado estruturado.
 *
 * Devolve `{ html, defeito }`. `html` vazio é resposta legítima — listagem,
 * situação fora do ar, Post sem Conteúdo. `defeito` preenchido significa que
 * havia Conteúdo e ele NÃO passou na conferência: o corpo é omitido e o rastro
 * fica, porque derrubar a rota por um registro torto tiraria o blog inteiro do
 * ar, e servir HTML desconhecido é pior que os dois.
 */
export function corpoDoArtigo({ situacao, post, canonica, pagina = null }) {
  if (situacao !== NO_AR || post === null || post === undefined) {
    return { html: "", defeito: null };
  }

  const conteudo = post.conteudo_html;
  if (typeof conteudo !== "string" || conteudo.trim() === "") {
    /* Post sem Conteúdo não declara artigo. Um `articleBody` vazio afirmaria
       que o artigo existe e não tem texto, que é diferente de não afirmar. */
    return { html: "", defeito: null };
  }

  const conferido = conferirConteudo(conteudo);
  if (!conferido.ok) return { html: "", defeito: conferido.defeito };

  /* O TÍTULO, A DESCRIÇÃO E A IMAGEM VÊM DE `metadadosDaPagina` (Story 4.6),
     que por sua vez sai de `metadadosDoPost`. Relê-los do Post aqui seria a
     TERCEIRA opinião sobre a mesma cadeia de herança — e a que ninguém lembraria
     de atualizar. Quando `pagina` não vem, o título cai no do Post: é o caminho
     de quem chama sem os metadados resolvidos, e ele não inventa nada. */
  const titulo = pagina?.titulo ?? post.titulo ?? "";
  const dados = { "@context": "https://schema.org", "@type": "Article" };

  /* CADA CAMPO É POSTO SÓ SE TIVER VALOR. `"author": {"name": ""}` declara que
     o artigo tem um autor chamado nada; a ausência declara que não se sabe. O
     validador do Google trata os dois de formas diferentes, e a segunda é a
     verdade. Por isso a montagem é campo a campo, e não um objeto literal com
     `?? ""` espalhado. */
  const por = (chave, valor) => {
    if (valor === null || valor === undefined || valor === "") return;
    dados[chave] = valor;
  };

  por("headline", titulo);
  por("description", pagina?.descricao ?? null);
  por("image", pagina?.imagem?.endereco ?? null);
  por("articleBody", textoDoConteudo(conteudo));

  const autor = typeof post.autor_nome === "string" ? post.autor_nome.trim() : "";
  if (autor !== "") dados.author = { "@type": "Person", name: autor };

  /* DATA INVENTADA É PIOR QUE DATA AUSENTE, e por isso a que não é reconhecível
     como instante simplesmente não sai. */
  const instante = (valor) => {
    if (typeof valor !== "string" || valor === "") return null;
    return Number.isFinite(Date.parse(valor)) ? valor : null;
  };
  const publicado = instante(post.publicado_em);
  por("datePublished", publicado);
  /* `dateModified` CAI EM `datePublished`, e é o único campo desta lista com
     padrão. Um artigo nunca editado TEM data de modificação: a da publicação.
     Omiti-la faria o buscador supor, e alguns supõem "hoje" — o que faz o
     artigo parecer perpetuamente fresco e mina a confiança nas datas do site
     inteiro. O padrão aqui é a verdade, e não uma conveniência. */
  por("dateModified", instante(post.atualizado_em) ?? publicado);

  por("inLanguage", "pt-BR");
  por("mainEntityOfPage", canonica ? { "@type": "WebPage", "@id": canonica } : null);

  /* `JSON.stringify` é o que escapa aqui, e ele já resolve `<` e `&` dentro de
     string JSON — mas NÃO resolve `</script>`, que fecharia o bloco. A troca
     abaixo é sobre a saída JÁ SERIALIZADA, e é a única que este módulo faz. */
  const json = JSON.stringify(dados, null, 2).replace(/<\//g, "<\\/");

  return {
    html: [
      /* `<noscript>` ANTES do contêiner: é o que o critério pede, e é o que faz
         o navegador com JavaScript nunca desenhar isto. */
      "    <noscript>",
      '      <article class="artigo">',
      /* ★ O ÚNICO `h1` DA PÁGINA (Story 4.6) ★
         Ele vem do TÍTULO, e não do conteúdo — e não existe caminho pelo qual
         apareça um segundo: `h1` está fora de `ETIQUETAS_EMITIDAS` desde a
         Story 2.5, então o Autor não consegue escrever um, e a conferência
         acima recusaria. A garantia é estrutural, e não disciplina. */
      `        <h1>${escapar(titulo)}</h1>`,
      `        ${conteudo}`,
      "      </article>",
      "    </noscript>",
      '    <script type="application/ld+json">',
      json,
      "    </script>",
    ].join("\n"),
    defeito: null,
  };
}

/**
 * A região do corpo da LISTAGEM `/blog`: um link por Post no ar.
 *
 * ─── POR QUE A LISTAGEM TAMBÉM TEM CORPO ───────────────────────────────────
 *
 * Sem isto, quem não executa JavaScript recebe `/blog` sem link nenhum para
 * artigo algum: a única porta para os Posts era o mapa do site. Um rastreador
 * que chega pela listagem — que é para onde o menu aponta — não achava o
 * caminho, e a página não passava adiante a relevância que recebe.
 *
 * O endereço é ABSOLUTO e sai da mesma raiz que a canônica, e o título e o
 * Resumo são texto: passam pelo escape, nunca entram como HTML.
 *
 * ─── E NÃO TEM `h1` ────────────────────────────────────────────────────────
 *
 * O `h1` servido é o título de um ARTIGO (Story 4.6), e a listagem não é um.
 * O título da página de listagem é desenhado pela aplicação; aqui vai só o
 * que faltava: os links.
 *
 * Devolve `""` quando não há Post utilizável — lista vazia não declara nada.
 */
export function corpoDaListagem({ posts, raiz }) {
  const semBarra = typeof raiz === "string" ? raiz.replace(/\/+$/, "") : "";
  if (semBarra === "") return "";

  const itens = [];
  for (const post of Array.isArray(posts) ? posts : []) {
    const slug = typeof post?.slug === "string" ? post.slug.trim() : "";
    const titulo = typeof post?.titulo === "string" ? post.titulo.trim() : "";
    if (slug === "" || titulo === "") continue;
    const resumo = typeof post?.resumo === "string" ? post.resumo.trim() : "";
    itens.push(
      [
        "          <li>",
        `            <a href="${escapar(`${semBarra}/blog/${slug}`)}">${escapar(titulo)}</a>`,
        ...(resumo === "" ? [] : [`            <p>${escapar(resumo)}</p>`]),
        "          </li>",
      ].join("\n"),
    );
  }
  if (itens.length === 0) return "";

  return [
    "    <noscript>",
    '      <section class="artigo">',
    "        <ul>",
    ...itens,
    "        </ul>",
    "      </section>",
    "    </noscript>",
  ].join("\n");
}