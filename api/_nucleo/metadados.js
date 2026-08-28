/**
 * O emissor de metadados da página servida (Story 4.3).
 *
 * ─── QUEM LÊ O LINK PRIMEIRO NÃO É GENTE ──────────────────────────────────
 *
 * É o gerador de prévia do WhatsApp, o do LinkedIn, o rastreador do Google e o
 * de motor generativo — e nenhum deles executa JavaScript. Sem este módulo,
 * `/blog/:slug` entrega o shell do build com os metadados da HOME: todo Post
 * compartilhado se anuncia como "CRM e ChatBot para WhatsApp". Um artigo
 * compartilhado não se apresenta; ele se disfarça de home.
 *
 * ─── ELE NÃO DECIDE NADA ──────────────────────────────────────────────────
 *
 * Título, descrição e imagem saem de `metadadosDoPost`, do domínio — a MESMA
 * função que a Prévia do Painel chama (Story 3.5). A divergência entre o que o
 * Autor vê na Prévia e o que o rastreador recebe é exatamente o defeito que ela
 * existe para não ter, e um `seo_titulo || titulo` escrito aqui seria a segunda
 * opinião que diverge no primeiro campo novo. `verificar:interface` varre o
 * projeto atrás disso, e este arquivo entra na varredura.
 *
 * ─── E NADA FORA DO AR VAZA ───────────────────────────────────────────────
 *
 * Arquivado, redirecionado e inexistente recebem o metadado do SITE. Não é
 * cortesia: é a regra do épico — nada que não está publicado tem metadado
 * exposto por nenhum caminho servido.
 *
 * Puro: sem React, sem rede, sem `fs`.
 */

import {
  IMAGEM_PADRAO_DO_SITE,
  enderecoDaImagemPadrao,
  metadadosDoPost,
} from "../../src/domain/blog/compartilhamento.js";
import { NO_AR } from "../../src/domain/blog/entrega.js";

/**
 * Os marcadores que cercam a região governada no `index.html`.
 *
 * São TEXTO EXATO, e não expressão regular: o que delimita a região não pode
 * depender de espaço, de acento nem de quantos traços alguém desenhou na
 * moldura do comentário.
 */
export const MARCA_INICIO = "<!-- METADADOS-DA-PAGINA:INICIO";
export const MARCA_FIM = "<!-- METADADOS-DA-PAGINA:FIM";

/**
 * O vocabulário GOVERNADO: as etiquetas que este módulo emite, e portanto as
 * únicas que podem viver dentro da região.
 *
 * É lista FECHADA, e existe para ser comparada com o `index.html`: uma
 * `og:title` esquecida do lado de fora da região sobreviveria à troca, e o
 * rastreador leria duas — a do Post e a da home. `verificar:escrita` confere os
 * dois sentidos.
 */
export const ETIQUETAS_GOVERNADAS = Object.freeze([
  "<title>",
  'name="description"',
  'rel="canonical"',
  'rel="alternate"',
  'property="og:',
  'name="twitter:',
]);

/** A tabela de escape. FECHADA, e aplicada sempre — não "quando parecer". */
const ESCAPES = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
});

/**
 * Escapa um valor para dentro de atributo ou de texto de etiqueta.
 *
 * `&` PRIMEIRO, e por isso a substituição é feita numa passada só, por classe
 * de caractere: trocar `&` depois de `<` produziria `&amp;lt;` — o texto
 * apareceria com a entidade à mostra, e ninguém acusaria.
 */
export function escapar(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Uma etiqueta `<meta>`. Devolve `""` quando o valor está ausente. */
function meta(chave, atributo, valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  return `    <meta ${chave}="${escapar(atributo)}" content="${escapar(valor)}" />`;
}

/**
 * O que o SITE declara — a resposta de tudo que não está no ar.
 *
 * Ela é o padrão, e não um caso especial. Uma situação nova que ninguém
 * classificasse cairia aqui, que é o lado seguro.
 */
function doSite(raiz, caminho) {
  const imagem = enderecoDaImagemPadrao(raiz);
  return {
    titulo: "Blog ChatClean | CRM e ChatBot para WhatsApp",
    descricao:
      "Artigos sobre atendimento no WhatsApp, automação com IA e gestão de " +
      "clientes, pela equipe da ChatClean.",
    canonica: `${raiz}${caminho}`,
    tipo: "website",
    imagem: {
      endereco: imagem,
      largura: IMAGEM_PADRAO_DO_SITE.largura,
      altura: IMAGEM_PADRAO_DO_SITE.altura,
      tipo: IMAGEM_PADRAO_DO_SITE.tipo,
      alternativo: IMAGEM_PADRAO_DO_SITE.alternativo,
    },
  };
}

/**
 * O que este endereço declara — a decisão inteira, num lugar só.
 *
 * `situacao` e `post` vêm da leitura da Story 4.2. `slug` é o que o BANCO
 * devolveu (`slug_atual`), e não o que veio na URL: a URL pode trazer um
 * endereço aposentado, e a canônica de um aposentado é o endereço de HOJE.
 * Usar o da URL faria dois endereços se declararem canônicos um do outro.
 */
export function metadadosDaPagina({ situacao, post, slug, raiz }) {
  /* SÓ NO AR TEM METADADO DE POST. A comparação é positiva de propósito:
     `situacao !== ARQUIVADO` seria lista de proibição, e uma situação nova
     nasceria vazando. */
  if (situacao !== NO_AR || post === null || post === undefined) {
    const caminho = typeof slug === "string" && slug !== "" ? `/blog/${slug}` : "/blog";
    return doSite(raiz, caminho);
  }

  const doPost = metadadosDoPost(post, { dominio: raiz });
  const site = doSite(raiz, `/blog/${slug}`);

  return {
    /* O título do Post é obrigatório na coluna, mas a herança pode devolver
       ausente se a linha vier torta. Cair no do site é melhor que emitir uma
       etiqueta em branco, que é pior que a herdada porque nada acusaria. */
    titulo: doPost.titulo.valor ?? site.titulo,
    /* AUSENTE, e não vazio: sem Título SEO e sem Resumo, a etiqueta é OMITIDA.
       O critério do Épico 3 manda a descrição ficar ausente "sem inventar
       texto", e uma descrição em branco é texto inventado com zero letras. */
    descricao: doPost.descricao.valor,
    canonica: `${raiz}/blog/${slug}`,
    tipo: "article",
    imagem: {
      endereco: doPost.imagem.endereco,
      largura: doPost.imagem.largura,
      altura: doPost.imagem.altura,
      tipo: doPost.imagem.tipo,
      alternativo: doPost.imagem.alternativo,
    },
    publicadoEm: post.publicado_em ?? null,
    atualizadoEm: post.atualizado_em ?? null,
    autor: post.autor_nome ?? null,
  };
}

/**
 * A região inteira, em HTML.
 *
 * Ela é MONTADA, e nunca remendada: não há caminho neste módulo que edite o
 * que já existe. É o que torna a substituição total, e é por isso que a
 * etiqueta esquecida do lado de fora é a única forma de sobrevivência da home
 * — e há asserção justamente sobre ela.
 */
export function regiaoDeMetadados(pagina) {
  const { titulo, descricao, canonica, tipo, imagem } = pagina;
  const linhas = [
    `    <title>${escapar(titulo)}</title>`,
    meta("name", "description", descricao),
    `    <link rel="canonical" href="${escapar(canonica)}" />`,
    `    <link rel="alternate" hreflang="pt-BR" href="${escapar(canonica)}" />`,
    `    <link rel="alternate" hreflang="x-default" href="${escapar(canonica)}" />`,
    "",
    meta("property", "og:type", tipo),
    meta("property", "og:site_name", "ChatClean"),
    meta("property", "og:locale", "pt_BR"),
    meta("property", "og:title", titulo),
    meta("property", "og:description", descricao),
    meta("property", "og:url", canonica),
    meta("property", "og:image", imagem.endereco),
    meta("property", "og:image:type", imagem.tipo),
    meta("property", "og:image:width", imagem.largura),
    meta("property", "og:image:height", imagem.altura),
    meta("property", "og:image:alt", imagem.alternativo),
    "",
    /* `summary_large_image` porque a imagem é 1200x630 — o cartão pequeno
       cortaria o que a Story 3.3 gerou para ser grande. */
    meta("name", "twitter:card", "summary_large_image"),
    meta("name", "twitter:title", titulo),
    meta("name", "twitter:description", descricao),
    meta("name", "twitter:image", imagem.endereco),
    meta("name", "twitter:image:alt", imagem.alternativo),
  ];

  /* As datas e o autor SÓ existem em artigo. Emiti-las numa página `website`
     declararia data de publicação para a listagem do blog. */
  if (tipo === "article") {
    linhas.push(
      "",
      meta("property", "article:published_time", pagina.publicadoEm),
      meta("property", "article:modified_time", pagina.atualizadoEm),
      meta("property", "article:author", pagina.autor),
    );
  }

  return linhas.filter((l) => l !== "").join("\n");
}
