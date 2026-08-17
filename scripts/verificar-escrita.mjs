#!/usr/bin/env node
/**
 * Ferramenta de verificação da escrita (Story 2.5).
 *
 * A story afirma três coisas que são fáceis de escrever e difíceis de provar:
 * a função é o ÚNICO caminho de escrita, o HTML é DERIVADO do documento, e o
 * conteúdo perigoso é recusado POR QUALQUER VIA. Nenhuma delas se prova lendo
 * código, então esta ferramenta **executa o núcleo** — o mesmo módulo que roda
 * em produção — com sessão real e banco real, e tenta escrever por fora dele.
 *
 *   (a) dependências e ambiente: `@tiptap/static-renderer` em versão exata
 *       igual aos demais pacotes Tiptap, o encadeamento em `verificar`, e o
 *       `.env.example` dizendo o que a função exige e onde a chave de serviço
 *       NÃO entra;
 *   (b) o renderizador único: puro, sem `class`, vocabulário de saída conferido
 *       contra o que ele realmente emite, `h1` em lugar nenhum, texto escapado,
 *       endereço executável derrubando a marca e não o texto, e nada lançando;
 *   (c) o núcleo, lido: lista fechada de campos, `conteudo_html` e `estado` na
 *       lista de ignorados, o Autor fora do comando de atualização, o invólucro
 *       sem `detalhe` na resposta, e a chave de serviço em nenhum arquivo;
 *   (d) o núcleo, EXECUTADO com acesso de mentira: cada recusa da matriz, com a
 *       prova de que nada foi gravado — contando as chamadas de escrita;
 *   (e) o núcleo, EXECUTADO contra o projeto real, com sessão real de duas
 *       Contas temporárias: gravação válida, HTML derivado, `conteudo_html` do
 *       cliente ignorado, Post novo em `rascunho` com o Autor da Conta, Autor
 *       preservado quando a outra Conta edita, e conflito de slug;
 *   (f) a linha do BANCO: escrita direta com chave de serviço — pela API e pelo
 *       console do projeto — recusada, com controle positivo antes, e as listas
 *       do SQL comparadas por igualdade com as do schema.
 *
 * A chave de serviço é pedida à Management API, registrada como segredo antes
 * de qualquer uso, mantida **em memória** e nunca gravada em arquivo. Há
 * asserção sobre isso: nenhum arquivo versionado do repositório a contém.
 *
 * Sem `SUPABASE_ACCESS_TOKEN` no ambiente as asserções remotas FALHAM como
 * ausentes — nunca são puladas em silêncio.
 *
 * Uso: npm run verificar:escrita
 *
 * Saída: uma linha por asserção; código 0 se todas passarem, 1 caso contrário.
 */

import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  executarScript,
  executarSql,
  lerToken,
  listarMigracoes,
  literal,
  NOME_PROJETO,
  raiz,
  REF_PROJETO,
  registrarSegredo,
  revelarChaves,
  sanitizar,
  TIMEOUT_MS,
  URL_PROJETO,
} from "./supabase-comum.mjs";
// A Conta temporária nasce pelo MESMO SQL do onboarding real: duplicá-lo faria
// a sessão de teste vir por um caminho que ninguém usa.
import { sqlDeCriacaoDeConta, sqlDeRemocaoDeConta } from "./criar-conta.mjs";

// O núcleo e o renderizador são IMPORTADOS e EXECUTADOS. É a diferença entre
// uma função que existe e uma função que faz o que a story diz.
import {
  COLUNAS_DO_POST,
  criarAcesso,
  lerAmbiente,
  problemaNaUrl,
  VARIAVEIS,
} from "../api/_nucleo/acesso.js";
import {
  CAMPOS_ACEITOS,
  CAMPOS_IGNORADOS,
  classificar,
  ERRO_CONFLITO,
  ERRO_DADOS_INVALIDOS,
  lerCorpo,
  LIMITE_DE_IGNORADOS,
  salvarPost,
  TAMANHO_MAXIMO_DO_CONTEUDO,
  TIPOS_DE_ERRO,
} from "../api/_nucleo/salvarPost.js";
import {
  CODIGO_HTTP,
  corpoComoObjeto,
  respostaDeErro,
  tokenDoCabecalho,
} from "../api/posts.js";
import {
  ATRIBUTOS_EMITIDOS,
  derivarHtml,
  ETIQUETAS_EMITIDAS,
  htmlDoDocumento,
  MARCAS_RENDERIZADAS,
  NOS_RENDERIZADOS,
} from "../src/render/blog/paraHtml.js";
// O vocabulário vem do DOMÍNIO, nunca de uma cópia escrita aqui: é justamente a
// divergência entre o schema e a restrição do banco que a asserção existe para
// pegar, e uma lista reescrita neste arquivo verificaria a si mesma.
import {
  decodificarEntidades,
  enderecoPermitido,
  ENTIDADES_ASCII,
  MARCAS_PERMITIDAS,
  NIVEIS_DE_TITULO,
  NOS_PERMITIDOS,
  PROTOCOLOS_DE_LINK,
} from "../src/domain/blog/schema.js";
import {
  ERRO_CONFIGURACAO,
  ERRO_INESPERADO,
  ERRO_NAO_ENCONTRADO,
  ERRO_PERMISSAO,
  ERRO_REDE,
} from "../src/data/blog/resultado.js";

let falhas = 0;
let adiadas = 0;

const CAMINHO_RENDERIZADOR = "src/render/blog/paraHtml.js";
const CAMINHO_NUCLEO = "api/_nucleo/salvarPost.js";
const CAMINHO_ACESSO = "api/_nucleo/acesso.js";
const CAMINHO_INVOLUCRO = "api/posts.js";
/**
 * A migração VIGENTE da higienização.
 *
 * `escrita_higienizada` (a primeira) escrevia a defesa como lista de PROIBIÇÃO
 * de padrões e era evadível; `escrita_higienizada_lista_de_permissao` a
 * reescreve como lista de permissão. As comparações de lista abaixo leem a
 * segunda: ler a primeira compararia o código com uma versão superada.
 */
const ROTULO_DA_MIGRACAO = "escrita_higienizada_lista_de_permissao";

/** As duas restrições, nomeadas — cada caso do banco diz qual deve recusá-lo. */
const RESTRICAO_DO_HTML = "posts_conteudo_html_seguro";
const RESTRICAO_DO_DOCUMENTO = "posts_conteudo_no_vocabulario";

/** Os pacotes Tiptap que compartilham `@tiptap/pm` e precisam casar. */
const PACOTES_TIPTAP = [
  "@tiptap/core",
  "@tiptap/pm",
  "@tiptap/react",
  "@tiptap/starter-kit",
  "@tiptap/static-renderer",
];

const ler = (relativo) => readFileSync(path.join(raiz, relativo), "utf8");

function secao(titulo) {
  console.log(`\n${titulo}`);
}

function afirmar(descricao, condicao, detalhe = "") {
  if (condicao) {
    console.log(`  OK    ${descricao}`);
  } else {
    falhas += 1;
    console.log(
      `  FALHA ${descricao}${detalhe ? ` — ${sanitizar(detalhe)}` : ""}`,
    );
  }
  return Boolean(condicao);
}

function nota(texto) {
  console.log(`        ${sanitizar(texto)}`);
}

/**
 * Asserção que o ambiente impediu de exercer — hoje só o limite de taxa do
 * GoTrue. NÃO é sucesso: o veredito final avisa e diz o que ficou sem cobertura.
 */
function adiar(descricao, motivo) {
  adiadas += 1;
  console.log(`  ADIADA ${descricao} — ${sanitizar(motivo)}`);
}

/** Executa `acao`; exceção vira asserção falha em vez de derrubar o script. */
function tentar(descricao, acao, padrao = null) {
  try {
    return acao();
  } catch (erro) {
    afirmar(descricao, false, String(erro?.message ?? erro).slice(0, 300));
    return padrao;
  }
}

const mesmoConjunto = (a, b) => {
  const x = [...new Set(a)].sort();
  const y = [...new Set(b)].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

const etiquetasDe = (html) => [
  ...new Set([...String(html).matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1])),
];

/* ─── Um documento que exercita a FRONTEIRA, não só o caminho felizes ────── */
//
// O documento anterior era o mínimo que tocava os dez elementos: link sem
// `title`, sem `rel`, sem `target="_self"`, sem `mailto:` nem `tel:`, sem
// `start=1` e sem `type` inválido. Foi por isso que a evasão do `title` com
// `onclick=` no VALOR atravessou a suíte inteira: nenhum caso tinha `title`.
//
// Cada campo abaixo existe porque a ausência dele já esconde um defeito real:
//
//   `title`            é o atributo em que valor e nome se confundem;
//   `rel` com palavra  extra prova que o renderizador não reescreve a decisão
//                      de SEO do Autor ao acrescentar `noopener`;
//   `target="_self"`   é o outro valor da lista fechada de alvos;
//   `mailto:`, `tel:`  são dois dos quatro esquemas permitidos, e nunca eram
//                      exercitados — `ftp:` passava sem ninguém notar;
//   `start: 1`         é o padrão do HTML e NÃO deve ser emitido;
//   `type: "z"`        está fora da lista fechada e NÃO deve ser emitido;
//   aspa no texto      é o que torna a contabilidade de aspas do banco sã;
//   `&`, `<`, `>`      são o escape básico, e o `<` também vem no bloco de
//                      código, onde marca nenhuma sobrevive.

const DOCUMENTO_COMPLETO = Object.freeze({
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: 'Seção com & e <b> e "aspas"' }],
    },
    { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Parte" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", marks: [{ type: "bold" }], text: "forte" },
        { type: "text", text: " e " },
        { type: "text", marks: [{ type: "italic" }], text: "inclinado" },
        { type: "text", text: " e " },
        {
          type: "text",
          marks: [
            {
              type: "link",
              attrs: {
                href: "https://chatclean.com.br/blog",
                target: "_blank",
                // `sponsored` tem de SOBREVIVER: é decisão do Autor, e a versão
                // anterior a substituía por `nofollow` ao impor o par de
                // segurança.
                rel: "noopener noreferrer sponsored",
                // O atributo em que "nome" e "valor" se confundem. Este valor
                // contém `onclick=`, que é conteúdo legítimo de um artigo sobre
                // web — e era recusado pelo banco.
                title: "veja onclick= no exemplo",
              },
            },
          ],
          text: "um link",
        },
        { type: "hardBreak" },
        {
          type: "text",
          marks: [{ type: "link", attrs: { href: "mailto:oi@chatclean.com.br", target: "_self" } }],
          text: "escreva",
        },
        { type: "text", text: " ou " },
        {
          type: "text",
          marks: [{ type: "link", attrs: { href: "tel:+5511999999999" } }],
          text: "ligue",
        },
      ],
    },
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "item" }] }] },
      ],
    },
    {
      type: "orderedList",
      attrs: { start: 3, type: "a" },
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "terceiro" }] }] },
      ],
    },
    {
      // `start: 1` é o padrão do HTML e `type: "z"` está fora da lista fechada:
      // nenhum dos dois deve aparecer no HTML.
      type: "orderedList",
      attrs: { start: 1, type: "z" },
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "primeiro" }] }] },
      ],
    },
    {
      type: "blockquote",
      content: [{ type: "paragraph", content: [{ type: "text", text: "citado" }] }],
    },
    {
      type: "codeBlock",
      attrs: { language: "js" },
      content: [{ type: "text", text: 'if (a < 2) x.onclick = "b";' }],
    },
    { type: "horizontalRule" },
  ],
});

/** O documento hostil: cada linha dele é um caso da matriz. */
const DOCUMENTO_HOSTIL = Object.freeze({
  type: "doc",
  content: [
    // Texto perigoso: tem de SOBREVIVER, escapado — não é o texto que é o
    // problema, é ele ser interpretado.
    {
      type: "paragraph",
      content: [
        { type: "text", text: "<script>alert(1)</script> e <iframe src=x> e onerror=y" },
      ],
    },
    // Nó fora do schema, nas três formas que a matriz nomeia.
    { type: "table", content: [{ type: "paragraph", content: [{ type: "text", text: "tabela" }] }] },
    { type: "image", attrs: { src: "https://exemplo/x.png" } },
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "titulo um" }] },
    // Marca fora do schema: cai, o texto fica.
    {
      type: "paragraph",
      content: [{ type: "text", marks: [{ type: "strike" }], text: "riscado sobrevive" }],
    },
    // Endereço executável: a marca cai, o texto fica.
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
          text: "texto do link mau",
        },
      ],
    },
  ],
});

/* ─── O que o banco tem de recusar, e por QUAL restrição ─────────────────── */
//
// `chave` é ASCII, minúscula e sem hífen final, e existe por um defeito real: a
// versão anterior derivava o slug do NOME em português, então "título de nível 1"
// virava `…-t-tulo-de-n-vel-` — com hífen final, inválido. A linha era recusada
// por `posts_slug_formato`, não pela cláusula que o caso queria exercitar, e o
// predicado aceitava qualquer `23514`. Quebrar a cláusula de nível de título
// mantinha tudo verde e `h1` passava a ser inserível pelo console.
//
// `restricao` é o segundo conserto do mesmo achado: cada caso FIXA qual
// restrição deve recusá-lo, em vez de aceitar qualquer violação de CHECK.
//
// As oito últimas do bloco de HTML são as EVASÕES medidas contra o projeto na
// versão de proibição por padrões. Elas são a razão de a regra ter virado lista
// de permissão, e cada uma passava:
//
//   <a/onclick="…">                     barra é separador de atributo válido
//   <a title="x"href="javascript:…">    a regra exigia espaço antes do nome
//   <p style="position:fixed;inset:0">  nome de atributo não era lista fechada
//   <a href="java{NL}script:…">         o corte de controles só rodava no doc
//   <a href="ftp://…">                  só três esquemas eram proibidos
//   <p>a"</p><a href="javascript:1">"b  aspa crua no texto desalinhava o par
//   <a href=javascript:1>               valor sem aspas
//   <a href='javascript:1'>             valor entre aspas simples

const NL = String.fromCharCode(10);

const RECUSAS_DE_HTML = Object.freeze([
  { chave: "script", descricao: "etiqueta script", html: "<p>ok</p><script>alert(1)</script>" },
  { chave: "iframe", descricao: "etiqueta iframe", html: '<p>ok</p><iframe src="https://mau"></iframe>' },
  { chave: "evento", descricao: "atributo de evento", html: '<p>ok</p><a href="/x" onclick="mau()">z</a>' },
  { chave: "executavel", descricao: "endereço executável", html: '<p>ok</p><a href="javascript:alert(1)">z</a>' },
  { chave: "etiqueta", descricao: "etiqueta fora do vocabulário", html: '<p>ok</p><img src="x" alt="y">' },
  { chave: "comentario", descricao: "comentário de HTML", html: "<!-- <script>x</script> -->" },
  { chave: "barra", descricao: "EVASÃO barra como separador de atributo", html: '<a/onclick="alert(1)">x</a>' },
  { chave: "semespaco", descricao: "EVASÃO sem espaço antes do nome do atributo", html: '<a title="x"href="javascript:alert(1)">x</a>' },
  { chave: "style", descricao: "EVASÃO atributo style (clickjacking)", html: '<p style="position:fixed;inset:0">a</p>' },
  { chave: "esquemaquebrado", descricao: "EVASÃO esquema com nova linha no meio", html: `<a href="java${NL}script:alert(1)">x</a>` },
  { chave: "ftp", descricao: "EVASÃO esquema fora da lista de permissão", html: '<a href="ftp://x/y">x</a>' },
  { chave: "aspasoltas", descricao: "EVASÃO aspa crua no texto desalinhando o par", html: '<p>a"</p><a href="javascript:1">"b</p>' },
  { chave: "semaspas", descricao: "EVASÃO valor de atributo sem aspas", html: "<a href=javascript:1>x</a>" },
  { chave: "aspasimples", descricao: "EVASÃO valor entre aspas simples", html: "<a href='javascript:1'>x</a>" },
  { chave: "espacoigual", descricao: "EVASÃO espaço em volta do igual", html: '<a href = "javascript:alert(1)">x</a>' },
  { chave: "espacotag", descricao: "EVASÃO espaço depois do menor-que", html: "< script>alert(1)</script>" },
  /* REFERÊNCIA DE CARACTERE no endereço. O navegador decodifica o valor do
     atributo ANTES de resolver o esquema, então `&#106;avascript:` é
     `javascript:` para ele — e era caminho relativo inofensivo para a restrição.
     Seis formas passavam. */
  { chave: "entdecimal", descricao: "EVASÃO entidade decimal no endereço", html: '<a href="&#106;avascript:alert(1)">x</a>' },
  { chave: "entzeros", descricao: "EVASÃO entidade decimal com zeros à esquerda", html: '<a href="&#0000106;avascript:alert(1)">x</a>' },
  { chave: "enthex", descricao: "EVASÃO entidade hexadecimal no endereço", html: '<a href="&#x6a;avascript:alert(1)">x</a>' },
  { chave: "entsemponto", descricao: "EVASÃO entidade sem ponto e vírgula", html: '<a href="&#106avascript:alert(1)">x</a>' },
  { chave: "enttab", descricao: "EVASÃO tabulação codificada no meio do esquema", html: '<a href="java&#9;script:alert(1)">x</a>' },
  { chave: "entcolon", descricao: "EVASÃO entidade nomeada &colon;", html: '<a href="javascript&colon;alert(1)">x</a>' },
  { chave: "entstyle", descricao: "EVASÃO entidade em valor de atributo qualquer", html: '<a href="/x" title="&#106;">z</a>' },
]);

const RECUSAS_DE_DOCUMENTO = Object.freeze([
  { chave: "notabela", descricao: "nó fora do vocabulário", doc: { type: "doc", content: [{ type: "table" }] } },
  {
    chave: "marcariscada",
    descricao: "marca fora do vocabulário",
    doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", marks: [{ type: "strike" }], text: "x" }] }] },
  },
  {
    // O caso que passava pela razão errada: agora o slug é válido e a restrição
    // é fixada, então quebrar a cláusula de nível de título FALHA.
    chave: "nivelum",
    descricao: "título de nível 1",
    doc: { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "x" }] }] },
  },
  {
    chave: "semnivel",
    descricao: "título sem nível",
    doc: { type: "doc", content: [{ type: "heading", content: [{ type: "text", text: "x" }] }] },
  },
  {
    chave: "linkexecutavel",
    descricao: "endereço executável em marca de link",
    doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }], text: "x" }] }] },
  },
  {
    chave: "linkftp",
    descricao: "esquema fora da lista de permissão em marca de link",
    doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", marks: [{ type: "link", attrs: { href: "ftp://x/y" } }], text: "x" }] }] },
  },
  {
    chave: "linkquebrado",
    descricao: "esquema com nova linha no meio em marca de link",
    doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", marks: [{ type: "link", attrs: { href: `java${NL}script:1` } }], text: "x" }] }] },
  },
  { chave: "raiznaodoc", descricao: "raiz que não é doc", doc: { type: "paragraph" } },
  { chave: "textosolto", descricao: "texto solto dentro de content", doc: { type: "doc", content: ["texto solto"] } },
  {
    chave: "marcanomedeno",
    descricao: "marca com nome de NÓ (as duas listas são separadas)",
    doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", marks: [{ type: "paragraph" }], text: "x" }] }] },
  },
  /* As mesmas entidades, agora dentro do DOCUMENTO. Não é só o banco que
     precisava do conserto: `validarDocumento` aceitava a marca de link nas seis
     formas, então a própria função de escrita gravava o endereço. */
  ...[
    ["entdecimal", "entidade decimal", "&#106;avascript:alert(1)"],
    ["entzeros", "entidade decimal com zeros", "&#0000106;avascript:alert(1)"],
    ["enthex", "entidade hexadecimal", "&#x6a;avascript:alert(1)"],
    ["entsemponto", "entidade sem ponto e vírgula", "&#106avascript:alert(1)"],
    ["enttab", "tabulação codificada", "java&#9;script:alert(1)"],
    ["entcolon", "entidade nomeada &colon;", "javascript&colon;alert(1)"],
  ].map(([chave, oQue, href]) => ({
    chave: `link-${chave}`,
    descricao: `EVASÃO ${oQue} em marca de link`,
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", marks: [{ type: "link", attrs: { href } }], text: "x" }],
        },
      ],
    },
  })),
]);

/**
 * E o outro lado da moeda: o que o banco tem de ACEITAR.
 *
 * Alarme que dispara sobre entrada legítima é o jeito mais rápido de ensinar
 * alguém a ignorar o alarme, e a versão anterior recusava o primeiro caso
 * abaixo — um link de artigo técnico com `onclick=` dentro do `title`.
 */
const ACEITES_DE_HTML = Object.freeze([
  { chave: "titulocomevento", descricao: "onclick= no VALOR de title", html: '<a href="/x" title="veja onclick= no exemplo">z</a>' },
  { chave: "aspaescapada", descricao: "aspa escapada no texto", html: "<p>ele disse &quot;javascript:alert(1)&quot; no artigo</p>" },
  { chave: "precode", descricao: "bloco de código com linguagem", html: '<pre tabindex="0"><code data-linguagem="js">a &lt; b</code></pre>' },
  { chave: "olcompleta", descricao: "lista ordenada com start e type", html: '<ol start="3" type="a"><li><p>x</p></li></ol>' },
  { chave: "esquemas", descricao: "os quatro esquemas e os relativos", html: '<a href="mailto:a@b.co">m</a><a href="tel:+5511">t</a><a href="#x">a</a><a href="?q=1">q</a><a href="relativo/ativo">r</a>' },
  { chave: "vazio", descricao: "string vazia (o padrão da coluna)", html: "" },
  /* O `&` ESCAPADO tem de continuar passando. Sem estas duas linhas, a correção
     da entidade poderia ter sido "recuse tudo o que tem `&`" e as asserções de
     ataque ficariam verdes enquanto todo link com parâmetros era recusado. */
  { chave: "eamp", descricao: "&amp; em endereço com parâmetros", html: '<a href="/x?a=1&amp;b=2">z</a>' },
  { chave: "eampduplo", descricao: "&amp;amp; (o & literal do Autor)", html: '<a href="/x?q=a&amp;amp;b">z</a>' },
  { chave: "eamptexto", descricao: "&amp; e &lt; no texto e no title", html: '<p>a &amp; b &lt; c</p><a href="/x" title="a &amp; b">z</a>' },
]);

/**
 * Marcas que não podem aparecer no que ficou no banco. É a lista literal do
 * critério de aceite, e é sobre o VALOR GRAVADO que ela é conferida.
 *
 * Dois padrões foram corrigidos junto com a restrição do banco, e pela mesma
 * razão: exigir espaço antes de `on…=` deixava `<a/onclick=` passar, e procurar
 * `javascript:` em qualquer lugar acusaria um artigo que MENCIONA o esquema no
 * texto. Agora o primeiro aceita qualquer separador e o segundo só olha dentro
 * de valor de atributo — que é o único lugar onde um endereço executa.
 */
const MARCAS_PROIBIDAS = [
  ["<script", /<\s*script/i],
  ["<iframe", /<\s*iframe/i],
  ["atributo de evento", /<[a-zA-Z][^>]*[^a-zA-Z0-9]on[a-zA-Z]+\s*=/i],
  ["endereço executável em atributo", /=\s*["'][^"']*(javascript|vbscript|data)\s*:/i],
];

/**
 * O corpus de endereços sobre o qual `enderecoPermitido` (JS) e
 * `endereco_do_post_e_permitido` (SQL) precisam dar o MESMO veredito.
 *
 * É a única forma de a divergência entre as duas implementações aparecer como
 * falha em vez de como conteúdo legítimo recusado no banco. Metade das linhas é
 * de evasão conhecida, metade é de endereço que precisa continuar passando.
 */
const CORPUS_DE_ENDERECOS = Object.freeze([
  /* ── REFERÊNCIA DE CARACTERE ────────────────────────────────────────────
     O navegador decodifica o valor do atributo ANTES de resolver o esquema, e
     nenhum dos dois lados decodificava: as seis primeiras linhas atravessavam a
     validação E a restrição do banco. As três últimas são o controle positivo —
     `&amp;` num endereço com parâmetros tem de continuar passando, senão a
     correção seria "recuse tudo o que tem `&`" e todo link morreria. */
  "&#106;avascript:alert(1)",
  "&#0000106;avascript:alert(1)",
  "&#00000000000106;avascript:alert(1)",
  "&#x6a;avascript:alert(1)",
  "&#X6A;avascript:alert(1)",
  "&#106avascript:alert(1)",
  `java&#9;script:alert(1)`,
  "java&Tab;script:alert(1)",
  "java&NewLine;script:alert(1)",
  "javascript&colon;alert(1)",
  "javascript&#58;alert(1)",
  "&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;x",
  "&sol;&sol;evil.com",
  "&#47;&#47;evil.com",
  "&#47;&bsol;evil.com",
  // Ponto de código inválido: os dois lados precisam concordar até aqui.
  "htt&#99999999999;ps://x.com",
  "htt&#xFFFFFFF;ps://x.com",
  "htt&#0;ps://x.com",
  "htt&#xD800;ps://x.com",
  // Controle positivo do `&` legítimo.
  "/x?a=1&amp;b=2",
  "/x?a=1&b=2",
  "https://x.com/a?b=1&amp;c=2",
  "mailto:oi@chatclean.com.br?subject=Oi&amp;body=x",
  "/x?a=1&bloco=2",
  "/x?amp=1",
  "&amp;#106;avascript:alert(1)",
  "https://x.com/a",
  "http://x.com",
  "HTTPS://X.COM",
  "mailto:oi@chatclean.com.br",
  "tel:+5511999999999",
  "/blog",
  "/blog/post?a=1#b",
  "#ancora",
  "?q=1",
  "relativo/simples",
  "relativo.html",
  "",
  "   ",
  "//evil.com",
  `/${String.fromCharCode(92)}evil.com`,
  `https:/${String.fromCharCode(92)}evil.com`,
  "javascript:alert(1)",
  "JavaScript:alert(1)",
  `java${NL}script:alert(1)`,
  `java${String.fromCharCode(9)}script:alert(1)`,
  "vbscript:msgbox",
  "data:text/html;base64,x",
  "ftp://x/y",
  "blob:https://x/y",
  "about:blank",
  "file:///etc/passwd",
  "http://x.com/a b",
  " javascript:x",
  "tel: +55",
  "mailto:",
  "a:b",
  "1https://x",
  "x+y-z.w:foo",
]);

/**
 * O corpus da DECODIFICAÇÃO, sobre o qual as duas implementações precisam
 * produzir a mesma string — e não só o mesmo veredito.
 *
 * O caso inválido é o que obriga: `htt&#99999999999;ps://x.com` decodificado
 * para `https://x.com` num lado e para `htt<controle>ps://x.com` no outro dá
 * vereditos opostos sobre o mesmo endereço.
 */
const CORPUS_DE_ENTIDADES = Object.freeze([
  ...CORPUS_DE_ENDERECOS,
  "&amp;#106;",
  "&#38;#106;",
  "&naoexiste;",
  "&naoexiste",
  "&",
  "&&&",
  "&#;",
  "&#x;",
  "a&colonb",
  "&colon",
  "&Tab;&NewLine;&sol;&bsol;&num;&quest;&semi;&lpar;&rpar;",
  "&nbsp;&NonBreakingSpace;",
  "texto sem entidade nenhuma",
  "",
]);

/* ─── Mascarador de comentário de JS (com autoteste) ─────────────────────── */

/**
 * Troca comentário de JS por espaço, preservando o comprimento.
 *
 * Existe porque as asserções de "este arquivo NÃO contém X" leem o código, e um
 * comentário futuro explicando *por que não* se usa X derrubaria a auditoria —
 * exatamente o modo de falha que a Story 2.4 já corrigiu uma vez.
 */
function mascararComentariosJs(fonte) {
  const n = fonte.length;
  let saida = "";
  let i = 0;
  const branco = (ate) => {
    saida += fonte.slice(i, ate).replace(/[^\n]/g, " ");
    i = ate;
  };
  // Contexto: depois destes tokens, `/` começa uma expressão regular; depois de
  // um identificador ou fechamento, é divisão. Sem essa distinção um literal de
  // regex desviaria a máquina de estados e corromperia o resto do arquivo.
  let podeSerRegex = true;
  while (i < n) {
    const c = fonte[i];
    if (c === "/" && fonte[i + 1] === "/") {
      const fim = fonte.indexOf("\n", i);
      branco(fim === -1 ? n : fim);
    } else if (c === "/" && fonte[i + 1] === "*") {
      const fim = fonte.indexOf("*/", i + 2);
      branco(fim === -1 ? n : fim + 2);
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n) {
        if (fonte[j] === "\\") j += 2;
        else if (fonte[j] === c) {
          j += 1;
          break;
        } else j += 1;
      }
      saida += fonte.slice(i, Math.min(j, n));
      i = Math.min(j, n);
      podeSerRegex = false;
    } else if (c === "/" && podeSerRegex) {
      let j = i + 1;
      let emClasse = false;
      while (j < n) {
        if (fonte[j] === "\\") j += 2;
        else if (fonte[j] === "[") {
          emClasse = true;
          j += 1;
        } else if (fonte[j] === "]") {
          emClasse = false;
          j += 1;
        } else if (fonte[j] === "/" && !emClasse) {
          j += 1;
          break;
        } else if (fonte[j] === "\n") break;
        else j += 1;
      }
      saida += fonte.slice(i, Math.min(j, n));
      i = Math.min(j, n);
      podeSerRegex = false;
    } else {
      if (!/\s/.test(c)) podeSerRegex = /[=(,:[!&|?{};+\-*%<>~^]/.test(c);
      saida += c;
      i += 1;
    }
  }
  return saida;
}

/**
 * Troca comentário de linha de SQL por espaço, preservando literais.
 *
 * `analisarSql` de `supabase-comum` mascara comentário E literal, e as
 * asserções desta seção precisam LER os literais (as listas de vocabulário).
 */
function semComentariosSql(sql) {
  let saida = "";
  let i = 0;
  let emLiteral = false;
  let emDolar = null;
  while (i < sql.length) {
    if (emDolar) {
      const fim = sql.indexOf(emDolar, i);
      const ate = fim === -1 ? sql.length : fim + emDolar.length;
      saida += sql.slice(i, ate);
      i = ate;
      emDolar = null;
      continue;
    }
    const c = sql[i];
    if (!emLiteral && c === "$") {
      const marca = /^\$[A-Za-z_]?[A-Za-z0-9_]*\$/.exec(sql.slice(i));
      if (marca) {
        saida += marca[0];
        i += marca[0].length;
        emDolar = marca[0];
        continue;
      }
    }
    if (!emLiteral && c === "-" && sql[i + 1] === "-") {
      const fim = sql.indexOf("\n", i);
      const ate = fim === -1 ? sql.length : fim;
      saida += sql.slice(i, ate).replace(/[^\n]/g, " ");
      i = ate;
      continue;
    }
    if (c === "'") emLiteral = !emLiteral;
    saida += c;
    i += 1;
  }
  return saida;
}

/** Os literais de texto do primeiro `array[…]` depois de `ancora`. */
function arrayDepoisDe(sql, ancora) {
  const i = sql.indexOf(ancora);
  if (i === -1) return null;
  const abre = sql.indexOf("array[", i);
  if (abre === -1) return null;
  const fecha = sql.indexOf("]", abre + "array[".length);
  if (fecha === -1) return null;
  return [...sql.slice(abre, fecha).matchAll(/'([^']*)'/g)].map((m) => m[1]);
}

/* ─── Acesso de mentira, que conta o que foi pedido ──────────────────────── */

const CONTA_FALSA = Object.freeze({
  id: "11111111-2222-3333-4444-555555555555",
  email: "pessoa@chatclean.com.br",
  user_digest: null,
  user_metadata: { nome_exibicao: "Pessoa dos Metadados" },
});

/**
 * Um acesso que registra cada chamada e devolve o que o caso precisa.
 *
 * É o que permite afirmar "nada foi gravado" em vez de esperar que não tenha
 * sido: a asserção conta as chamadas de ESCRITA, e uma recusa que gravasse
 * apareceria como contagem diferente de zero.
 */
function acessoDeTeste({
  conta = CONTA_FALSA,
  perfil = { id: CONTA_FALSA.id, nome_exibicao: "Pessoa do Perfil" },
  post = null,
  respostaDoToken = null,
  respostaDaEscrita = null,
} = {}) {
  const chamadas = [];
  const reg = (nome, argumentos) => chamadas.push({ nome, argumentos });
  const escrever = (nome, campos) => {
    reg(nome, [campos]);
    return (
      respostaDaEscrita ?? {
        ok: true,
        status: 201,
        dados: { id: post?.id ?? randomUUID(), estado: "rascunho", ...campos },
      }
    );
  };
  return {
    chamadas,
    escritas: () => chamadas.filter((c) => c.nome === "inserirPost" || c.nome === "atualizarPost"),
    contaDoToken(token) {
      reg("contaDoToken", [token]);
      if (respostaDoToken) return respostaDoToken;
      return { ok: true, status: 200, dados: conta };
    },
    perfilDaConta(id) {
      reg("perfilDaConta", [id]);
      return { ok: true, status: 200, dados: perfil };
    },
    lerPost(id) {
      reg("lerPost", [id]);
      return { ok: true, status: 200, dados: post };
    },
    inserirPost(campos) {
      return escrever("inserirPost", campos);
    },
    atualizarPost(id, campos) {
      reg("idAtualizado", [id]);
      return escrever("atualizarPost", campos);
    },
  };
}

const corpoValido = (extra = {}) => ({
  slug: "um-post-de-teste",
  titulo: "Um post de teste",
  resumo: "Resumo",
  conteudo: DOCUMENTO_COMPLETO,
  ...extra,
});

await executarScript(async () => {

/* ─── (a) Dependências e ambiente ────────────────────────────────────────── */

secao("(a) dependências, encadeamento e ambiente declarado");

const pacote = tentar("package.json legível", () => JSON.parse(ler("package.json")), null);
if (pacote) {
  const versoes = new Map(
    PACOTES_TIPTAP.map((nome) => [nome, pacote.dependencies?.[nome] ?? null]),
  );
  afirmar(
    "@tiptap/static-renderer está declarado em dependencies",
    typeof versoes.get("@tiptap/static-renderer") === "string",
    "sem ele não há renderizador único",
  );
  const exatas = [...versoes].filter(([, v]) => typeof v === "string" && /^\d+\.\d+\.\d+$/.test(v));
  afirmar(
    "os cinco pacotes Tiptap estão em versão EXATA, sem faixa",
    exatas.length === PACOTES_TIPTAP.length,
    [...versoes].map(([n, v]) => `${n}: ${v ?? "ausente"}`).join(", "),
  );
  /* Versão divergente entre pacotes que compartilham `@tiptap/pm` produz DUAS
     instâncias do ProseMirror, e a falha aparece só em tempo de execução. */
  const distintas = new Set([...versoes.values()].filter(Boolean));
  afirmar(
    "todos os pacotes Tiptap estão na MESMA versão",
    distintas.size === 1,
    `versões encontradas: ${[...distintas].join(", ") || "nenhuma"}`,
  );

  afirmar(
    'script "verificar:escrita" declarado',
    typeof pacote.scripts?.["verificar:escrita"] === "string",
  );
  afirmar(
    "`verificar` encadeia a escrita",
    /verificar:escrita/.test(pacote.scripts?.verificar ?? ""),
    `encontrado: ${pacote.scripts?.verificar ?? "ausente"}`,
  );
}

// A versão instalada, e não só a declarada: `node_modules` fora de sincronia é
// o caso em que o `package.json` diz uma coisa e o código executa outra.
{
  const instalado = path.join(raiz, "node_modules", "@tiptap", "static-renderer", "package.json");
  const versaoInstalada = existsSync(instalado)
    ? tentar("versão instalada legível", () => JSON.parse(readFileSync(instalado, "utf8")).version, null)
    : null;
  afirmar(
    "a versão instalada de @tiptap/static-renderer é a declarada",
    versaoInstalada !== null && versaoInstalada === pacote?.dependencies?.["@tiptap/static-renderer"],
    `instalada: ${versaoInstalada ?? "ausente"} | declarada: ${pacote?.dependencies?.["@tiptap/static-renderer"] ?? "ausente"}`,
  );
  // O subpath que a arquitetura fixa precisa EXISTIR no pacote: o caminho
  // citado na documentação (`/html-string`, sem `json/`) não é exportado, e a
  // falha aparece só quando alguém chama a função.
  const mapa = existsSync(instalado)
    ? tentar("mapa de exports legível", () => JSON.parse(readFileSync(instalado, "utf8")).exports, null)
    : null;
  afirmar(
    "o subpath ./json/html-string é exportado pelo pacote",
    Boolean(mapa?.["./json/html-string"]),
    `exports: ${Object.keys(mapa ?? {}).join(", ") || "nenhum"}`,
  );
}

{
  const exemplo = tentar(".env.example legível", () => ler(".env.example"), "");
  afirmar(
    ".env.example documenta SUPABASE_CHAVE_DE_SERVICO",
    /SUPABASE_CHAVE_DE_SERVICO/.test(exemplo),
    "quem for publicar precisa saber o que configurar",
  );
  // Documentada, e NÃO atribuída: a linha viva com valor é o que vaza.
  const linhasVivas = exemplo
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l) && l.trim() !== "");
  afirmar(
    ".env.example NÃO atribui valor à chave de serviço",
    !linhasVivas.some((l) => /CHAVE_DE_SERVICO\s*=/.test(l)),
    linhasVivas.filter((l) => /CHAVE_DE_SERVICO/.test(l)).join(" | "),
  );
  afirmar(
    ".env.example diz que a chave de serviço não tem variante VITE_",
    /VITE_/.test(exemplo) && /prefixo `VITE_\*`|prefixo `VITE_`/.test(exemplo),
    "sem essa frase, a próxima pessoa cria VITE_CHAVE_DE_SERVICO e a manda para o navegador",
  );
  afirmar(
    ".env.example nomeia as três variáveis que a função aceita",
    Object.values(VARIAVEIS)
      .map((nomes) => nomes[0])
      .every((nome) => exemplo.includes(nome)),
    Object.values(VARIAVEIS).map((n) => n[0]).join(", "),
  );
}

// `vercel.json` é propriedade da Story 4.1. Esta story não pode ter mexido nele.
{
  const vercel = tentar("vercel.json legível", () => JSON.parse(ler("vercel.json")), null);
  afirmar(
    "vercel.json continua só com a regra de reescrita (o roteamento é da Story 4.1)",
    vercel !== null &&
      Object.keys(vercel).length === 1 &&
      Array.isArray(vercel.rewrites),
    `chaves: ${Object.keys(vercel ?? {}).join(", ")}`,
  );
}

/* ─── (b) O renderizador único ───────────────────────────────────────────── */

secao("(b) o renderizador único: derivação, vocabulário e escape");

{
  const derivado = derivarHtml(DOCUMENTO_COMPLETO);
  const ok = afirmar(
    "derivarHtml aceita um documento válido",
    derivado.ok === true,
    derivado.ok ? "" : JSON.stringify(derivado.erro),
  );

  if (ok) {
    nota(`HTML derivado: ${derivado.html.length} caracteres`);

    /* A regra central da Story 2.3: nenhuma classe. Estilo vem de `.artigo`, e
       classe gerada em tempo de execução não existe no CSS compilado — ela
       sairia sem estilo, e a página pareceria quebrada sem erro nenhum. */
    afirmar(
      "o HTML derivado NÃO tem atributo class",
      !/\sclass\s*=/i.test(derivado.html),
      (/\sclass\s*=[^\s>]*/i.exec(derivado.html) ?? [])[0] ?? "",
    );

    // Vocabulário declarado × vocabulário emitido, por IGUALDADE: acrescentar
    // um elemento sem declará-lo falha, e declarar um que nunca sai também.
    const emitidas = etiquetasDe(derivado.html);
    afirmar(
      "as etiquetas declaradas são EXATAMENTE as que o renderizador emite",
      mesmoConjunto(emitidas, ETIQUETAS_EMITIDAS),
      `emitidas: [${[...emitidas].sort().join(", ")}] | declaradas: [${[...ETIQUETAS_EMITIDAS].sort().join(", ")}]`,
    );
    afirmar(
      "h1 não está entre as etiquetas declaradas",
      !ETIQUETAS_EMITIDAS.includes("h1"),
    );

    afirmar(
      "o bloco de código sai alcançável por teclado (tabindex no pre)",
      /<pre tabindex="0">/.test(derivado.html),
      "o CSS da Story 2.3 já tem o indicador de foco; o atributo tem de vir do renderizador",
    );
    afirmar(
      "a linguagem do bloco de código sai em data-linguagem, não em class",
      /<code data-linguagem="js">/.test(derivado.html),
    );
    afirmar(
      "a lista ordenada preserva start e type",
      /<ol start="3" type="a">/.test(derivado.html),
      (/<ol[^>]*>/.exec(derivado.html) ?? [])[0] ?? "",
    );
    afirmar(
      "start=1 (padrão do HTML) e type fora da lista fechada NÃO são emitidos",
      /<ol>/.test(derivado.html) &&
        !/start="1"/.test(derivado.html) &&
        !/type="z"/.test(derivado.html),
      [...derivado.html.matchAll(/<ol[^>]*>/g)].map((m) => m[0]).join(" "),
    );
    afirmar(
      "link em nova janela sai com rel contendo noopener e noreferrer",
      /<a href="https:\/\/chatclean\.com\.br\/blog" target="_blank" rel="[^"]*noopener[^"]*noreferrer/.test(
        derivado.html,
      ),
      (/<a [^>]*>/.exec(derivado.html) ?? [])[0] ?? "",
    );
    /* O `rel` do Autor SOBREVIVE. A versão anterior trocava o `rel` inteiro por
       `noopener noreferrer nofollow` ao impor o par de segurança, então
       `sponsored` desaparecia e uma decisão de SEO era imposta a todo link
       externo. Nenhuma asserção pegava porque o link de teste não tinha `rel`. */
    afirmar(
      "o rel declarado pelo Autor é PRESERVADO ao acrescentar o par de segurança",
      /rel="[^"]*sponsored/.test(derivado.html) && !/rel="[^"]*nofollow/.test(derivado.html),
      (/rel="[^"]*"/.exec(derivado.html) ?? [])[0] ?? "nenhum rel emitido",
    );
    afirmar(
      "o title do link é emitido, e o valor com `onclick=` sai intacto",
      /title="veja onclick= no exemplo"/.test(derivado.html),
      (/title="[^"]*"/.exec(derivado.html) ?? [])[0] ?? "nenhum title emitido",
    );
    afirmar(
      "target=_self e os esquemas mailto: e tel: são emitidos",
      /target="_self"/.test(derivado.html) &&
        /href="mailto:oi@chatclean\.com\.br"/.test(derivado.html) &&
        /href="tel:\+5511999999999"/.test(derivado.html),
      derivado.html.slice(0, 200),
    );
    /* A aspa dupla sai escapada TAMBÉM NO TEXTO. Não é preferência de estilo: é
       o que dá à saída a propriedade que a restrição do banco confere — aspa
       dupla só existe delimitando valor de atributo. Sem isso, um texto com
       aspas desemparelhadas fazia o pareamento do banco escorregar e engolir uma
       etiqueta inteira. */
    afirmar(
      "a aspa dupla no TEXTO sai escapada como &quot;",
      derivado.html.includes("&quot;aspas&quot;") && !/<h2>[^<]*"/.test(derivado.html),
      (/<h2>[^<]*<\/h2>/.exec(derivado.html) ?? [])[0] ?? "",
    );
    afirmar(
      "toda aspa dupla do HTML derivado delimita valor de atributo",
      (() => {
        const total = (derivado.html.match(/"/g) ?? []).length;
        const pares = [
          ...derivado.html.matchAll(/[a-zA-Z0-9:_.-]+\s*=\s*"[^"]*"/g),
        ].length;
        return total === 2 * pares;
      })(),
      `aspas: ${(derivado.html.match(/"/g) ?? []).length} | pares nome="valor": ${[...derivado.html.matchAll(/[a-zA-Z0-9:_.-]+\s*=\s*"[^"]*"/g)].length}`,
    );

    // Nome de atributo declarado × nome de atributo emitido, por IGUALDADE. É a
    // metade que faltava: a restrição do banco só pôde virar lista de permissão
    // de NOMES porque esta lista existe e é conferida.
    /* O VALOR sai antes de o NOME ser lido, e este extrator aprendeu isso da
       forma difícil: a primeira versão leu `onclick` de dentro de
       `title="veja onclick= no exemplo"` e acusou o renderizador de emitir um
       atributo de evento. É exatamente o defeito que a restrição do banco tinha,
       reproduzido na asserção que existe para cobrá-lo. */
    const semValores = derivado.html.replace(/"[^"]*"/g, '"~"');
    const atributosEmitidos = [
      ...new Set(
        [...semValores.matchAll(/<[a-zA-Z][^>]*>/g)]
          .flatMap((m) => [...m[0].matchAll(/\s([a-zA-Z][a-zA-Z0-9-]*)=/g)])
          .map((m) => m[1]),
      ),
    ];
    afirmar(
      "os nomes de atributo declarados são EXATAMENTE os que o renderizador emite",
      mesmoConjunto(atributosEmitidos, ATRIBUTOS_EMITIDOS),
      `emitidos: [${atributosEmitidos.sort().join(", ")}] | declarados: [${[...ATRIBUTOS_EMITIDOS].sort().join(", ")}]`,
    );
    afirmar(
      "nenhum atributo de evento nem `style` está entre os declarados",
      ATRIBUTOS_EMITIDOS.every((a) => !/^on/i.test(a)) &&
        !ATRIBUTOS_EMITIDOS.includes("style"),
      ATRIBUTOS_EMITIDOS.join(", "),
    );

    // Ponto fixo: o documento validado atravessa a validação sem mudar. Sem
    // isto, a gravação alteraria o documento em cada salvamento.
    const segundo = derivarHtml(derivado.documento);
    afirmar(
      "documento já validado é ponto fixo da derivação (documento e HTML idênticos)",
      segundo.ok &&
        segundo.html === derivado.html &&
        JSON.stringify(segundo.documento) === JSON.stringify(derivado.documento),
      segundo.ok ? "o HTML ou o documento mudou na segunda passagem" : "a segunda passagem falhou",
    );
  }
}

{
  const hostil = derivarHtml(DOCUMENTO_HOSTIL);
  const ok = afirmar(
    "derivarHtml aceita documento sujo (conteúdo sujo é caso previsto, não erro)",
    hostil.ok === true,
    hostil.ok ? "" : JSON.stringify(hostil.erro),
  );
  if (ok) {
    nota(`descartes no documento hostil: ${hostil.totalDescartado}`);
    afirmar(
      "o documento hostil produziu descartes",
      hostil.totalDescartado > 0,
      "zero descarte significa que nada foi filtrado",
    );

    for (const [nome, padrao] of MARCAS_PROIBIDAS) {
      afirmar(
        `o HTML derivado do documento hostil não contém ${nome}`,
        !padrao.test(hostil.html),
        (padrao.exec(hostil.html) ?? [])[0] ?? "",
      );
    }
    afirmar(
      "o texto perigoso SOBREVIVE, escapado (o problema é ser interpretado, não existir)",
      hostil.html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"),
      hostil.html.slice(0, 200),
    );
    afirmar(
      "nó fora do schema é descartado e o resto do documento sobrevive",
      !/tabela/.test(hostil.html) &&
        !/titulo um/.test(hostil.html) &&
        hostil.html.includes("riscado sobrevive"),
      hostil.html.slice(0, 300),
    );
    afirmar(
      "marca fora do schema cai e o texto fica",
      hostil.html.includes("riscado sobrevive") && !/<(s|del|strike)\b/.test(hostil.html),
    );
    afirmar(
      "endereço executável derruba a MARCA e preserva o texto",
      hostil.html.includes("texto do link mau") && !/<a /.test(hostil.html),
      hostil.html.slice(0, 300),
    );
    const etiquetas = etiquetasDe(hostil.html);
    afirmar(
      "nenhuma etiqueta fora do vocabulário saiu do documento hostil",
      etiquetas.every((e) => ETIQUETAS_EMITIDAS.includes(e)),
      `emitidas: ${etiquetas.join(", ")}`,
    );
  }
}

// Entrada que NÃO é documento: recusa clara, sem lançar.
for (const [nome, entrada] of [
  ["null", null],
  ["undefined", undefined],
  ["string", "só texto"],
  ["número", 42],
  ["lista", [{ type: "paragraph" }]],
  ["raiz que não é doc", { type: "paragraph" }],
  ["content que não é lista", { type: "doc", content: "x" }],
]) {
  const r = tentar(`derivarHtml(${nome}) não lança`, () => derivarHtml(entrada), null);
  afirmar(
    `derivarHtml recusa ${nome} com erro claro, sem lançar`,
    r !== null && r.ok === false && typeof r.erro?.mensagem === "string" && r.erro.mensagem !== "",
    JSON.stringify(r)?.slice(0, 160) ?? "",
  );
}

// Aninhamento hostil: a função que roda no servidor sobre entrada de terceiros
// não pode estourar a pilha. O teto de profundidade do schema é o que sustenta
// "nunca lança", e o renderizador recursa sobre o resultado dela.
{
  const aninhar = (quantos) => {
    let no = { type: "paragraph", content: [{ type: "text", text: "fundo" }] };
    for (let i = 0; i < quantos; i += 1) no = { type: "blockquote", content: [no] };
    return { type: "doc", content: [no] };
  };
  const citacoes = (html) => (html.match(/<blockquote>/g) ?? []).length;

  // Aninhamento legítimo atravessa inteiro. Sem esta metade, um corte que
  // comesse conteúdo real passaria — e a asserção de baixo passaria com ele.
  const RAZOAVEL = 20;
  const legitimo = tentar(
    `derivarHtml sobre ${RAZOAVEL} níveis não lança`,
    () => derivarHtml(aninhar(RAZOAVEL)),
    null,
  );
  afirmar(
    `aninhamento legítimo (${RAZOAVEL} níveis) atravessa a derivação inteiro`,
    legitimo?.ok === true &&
      citacoes(legitimo.html) === RAZOAVEL &&
      legitimo.html.includes("fundo"),
    `níveis emitidos: ${legitimo?.ok ? citacoes(legitimo.html) : "—"}`,
  );

  /* Aninhamento HOSTIL: é esta a função que roda no servidor sobre entrada de
     terceiros, e um `content` aninhado sessenta mil vezes cabe num JSON de
     poucas centenas de kilobytes. O renderizador recursa sobre o resultado da
     validação, então "nunca lança" tem de valer para os dois. */
  const FUNDO = 60000;
  const hostil = tentar(
    `derivarHtml sobre ${FUNDO} níveis de aninhamento não lança`,
    () => derivarHtml(aninhar(FUNDO)),
    null,
  );
  afirmar(
    `derivarHtml sobrevive a ${FUNDO} níveis de aninhamento (corta e devolve)`,
    hostil?.ok === true,
    JSON.stringify(hostil?.erro ?? {}).slice(0, 200),
  );
  if (hostil?.ok) {
    nota(
      `o galho fundo demais foi cortado no schema: ${citacoes(hostil.html)} níveis no HTML, ` +
        `${hostil.html.length} caracteres, ${hostil.totalDescartado} descarte(s)`,
    );
    /* A citação vazia não sobrevive no schema (`vazioSobrevive: false`), então
       cortar o galho no nível 100 derruba a cadeia inteira e o documento volta
       ao piso do formato — o parágrafo vazio. É comportamento correto e é o
       que o HTML precisa mostrar: nada de sessenta mil elementos. */
    afirmar(
      "o corte acontece no schema, ANTES do renderizador (o HTML não carrega o galho hostil)",
      citacoes(hostil.html) < RAZOAVEL && hostil.html.length < 200,
      `níveis: ${citacoes(hostil.html)} | tamanho: ${hostil.html.length}`,
    );
  }
}

/* ─── (b3) A referência de caractere no endereço ─────────────────────────── */
//
// O navegador decodifica o valor de um atributo ANTES de resolver o esquema, e
// nem `enderecoPermitido` nem a restrição do banco decodificavam. Seis formas
// atravessavam a validação, eram gravadas, e o navegador executava.

{
  const ataques = [
    ["decimal", "&#106;avascript:alert(1)"],
    ["decimal com zeros à esquerda", "&#0000106;avascript:alert(1)"],
    ["decimal com onze zeros", "&#00000000000106;avascript:alert(1)"],
    ["hexadecimal", "&#x6a;avascript:alert(1)"],
    ["hexadecimal maiúsculo", "&#X6A;avascript:alert(1)"],
    ["sem ponto e vírgula", "&#106avascript:alert(1)"],
    ["tabulação codificada no meio do esquema", "java&#9;script:alert(1)"],
    ["nomeada &Tab;", "java&Tab;script:alert(1)"],
    ["nomeada &NewLine;", "java&NewLine;script:alert(1)"],
    ["nomeada &colon;", "javascript&colon;alert(1)"],
    ["dois-pontos em decimal", "javascript&#58;alert(1)"],
    ["tudo codificado", "&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;x"],
    ["barra dupla nomeada", "&sol;&sol;evil.com"],
    ["barra dupla numérica", "&#47;&#47;evil.com"],
    ["barra invertida nomeada", "&#47;&bsol;evil.com"],
  ];
  for (const [nome, endereco] of ataques) {
    afirmar(
      `endereço com entidade — ${nome} é recusado`,
      enderecoPermitido(endereco) === false,
      `decodificado: ${JSON.stringify(decodificarEntidades(endereco))}`,
    );
  }

  // O documento inteiro: a marca de link cai, o texto fica.
  for (const [nome, endereco] of ataques.slice(0, 6)) {
    const r = derivarHtml({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", marks: [{ type: "link", attrs: { href: endereco } }], text: "fica" }],
        },
      ],
    });
    afirmar(
      `documento com ${nome} perde a MARCA de link e mantém o texto`,
      r.ok === true && !/<a /.test(r.html) && r.html.includes("fica"),
      r.html?.slice(0, 160) ?? "",
    );
  }

  /* O CONTROLE POSITIVO, sem o qual a correção poderia ser "recuse tudo o que
     tem `&`" com todas as asserções acima verdes e todo link com parâmetros
     morto. */
  for (const [nome, endereco] of [
    ["&amp; em parâmetro", "/x?a=1&amp;b=2"],
    ["& cru em parâmetro", "/x?a=1&b=2"],
    ["https com &amp;", "https://x.com/a?b=1&amp;c=2"],
    ["mailto com &amp;", "mailto:oi@chatclean.com.br?subject=Oi&amp;body=x"],
    ["nome que não é entidade", "/x?a=1&bloco=2"],
    ["entidade dupla é TEXTO, não letra", "&amp;#106;avascript:alert(1)"],
  ]) {
    afirmar(
      `endereço legítimo com & — ${nome} continua aceito`,
      enderecoPermitido(endereco) === true,
      `decodificado: ${JSON.stringify(decodificarEntidades(endereco))}`,
    );
  }

  // Uma passagem, como o navegador: `&amp;#106;` é o TEXTO `&#106;`.
  afirmar(
    "a decodificação é de UMA passagem: &amp;#106; vira o texto &#106;, não a letra j",
    decodificarEntidades("&amp;#106;") === "&#106;",
    JSON.stringify(decodificarEntidades("&amp;#106;")),
  );
  afirmar(
    "nome desconhecido fica intacto — `?a=1&bloco=2` não é entidade",
    decodificarEntidades("?a=1&bloco=2") === "?a=1&bloco=2",
    JSON.stringify(decodificarEntidades("?a=1&bloco=2")),
  );
  afirmar(
    "ponto de código inválido não lança e não vira caractere",
    decodificarEntidades("a&#0;b") === "ab" &&
      decodificarEntidades("a&#99999999999;b") === "ab" &&
      decodificarEntidades("a&#xD800;b") === "ab",
    [
      decodificarEntidades("a&#0;b"),
      decodificarEntidades("a&#99999999999;b"),
      decodificarEntidades("a&#xD800;b"),
    ].map((s) => JSON.stringify(s)).join(" "),
  );
  /* Nenhuma referência NOMEADA do HTML resolve para letra ou dígito ASCII — é o
     que torna a lista de nomeadas suficiente, porque as letras de `javascript`
     só podem vir de referência numérica. A asserção cobra a premissa. */
  afirmar(
    "nenhuma entidade nomeada da lista resolve para letra ou dígito ASCII",
    Object.values(ENTIDADES_ASCII).every((v) => !/[a-zA-Z0-9]/.test(v)),
    Object.entries(ENTIDADES_ASCII)
      .filter(([, v]) => /[a-zA-Z0-9]/.test(v))
      .map(([k, v]) => `${k}=${v}`)
      .join(", "),
  );
  /* NENHUM CARACTERE DE CONTROLE, e nenhum espaço invisível, no fonte do schema.
     Não é higiene genérica: a primeira versão desta correção deixou quatro
     U+0001 literais dentro de `return` e um U+00A0 no valor de `&nbsp;`, e os
     dois passaram por revisão de código sem serem vistos — foi a comparação com
     o espelho em SQL que os denunciou. O próprio arquivo já argumenta que
     caractere de controle escrito num literal é invisível na revisão. */
  {
    const fonte = tentar("schema.js legível", () => ler("src/domain/blog/schema.js"), "");
    const invisiveis = [...fonte]
      .map((c, i) => [c.codePointAt(0), i])
      .filter(([p]) => (p < 0x20 && p !== 0x0a && p !== 0x0d && p !== 0x09) || p === 0x7f || p === 0xa0);
    afirmar(
      "o fonte do schema não tem caractere de controle nem espaço invisível",
      invisiveis.length === 0,
      invisiveis.map(([p, i]) => `U+${p.toString(16).padStart(4, "0")}@${i}`).join(", "),
    );
    afirmar(
      "e o detector de caractere invisível acusa quando existe um",
      [...`a${String.fromCharCode(1)}b`].some((c) => c.codePointAt(0) < 0x20),
    );
  }
}

// `htmlDoDocumento` exportado é o mesmo caminho, só sem revalidar.
afirmar(
  "htmlDoDocumento sobre documento validado devolve o mesmo HTML de derivarHtml",
  htmlDoDocumento(derivarHtml(DOCUMENTO_COMPLETO).documento) ===
    derivarHtml(DOCUMENTO_COMPLETO).html,
);

/* Existe UM handler por nó e por marca do schema. O cabeçalho do renderizador
   afirmava que "a verificação compara as duas listas" e ela não comparava: as
   chaves dos handlers não eram exportadas. Um nó novo no schema sem handler
   correspondente cairia em `unhandledNode` e sumiria do HTML servido em
   silêncio — e o comentário continuaria prometendo o contrário. */
afirmar(
  "existe um handler de nó para EXATAMENTE os nós do schema",
  mesmoConjunto(NOS_RENDERIZADOS, NOS_PERMITIDOS),
  `no renderizador: [${[...NOS_RENDERIZADOS].sort().join(", ")}] | no schema: [${[...NOS_PERMITIDOS].sort().join(", ")}]`,
);
afirmar(
  "existe um handler de marca para EXATAMENTE as marcas do schema",
  mesmoConjunto(MARCAS_RENDERIZADAS, MARCAS_PERMITIDAS),
  `no renderizador: [${[...MARCAS_RENDERIZADAS].sort().join(", ")}] | no schema: [${[...MARCAS_PERMITIDAS].sort().join(", ")}]`,
);

/* ─── (b2) O renderizador é ÚNICO ────────────────────────────────────────── */

{
  const fontes = [];
  const varrer = (dir) => {
    if (!existsSync(dir)) return;
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) varrer(completo);
      else if (/\.(js|jsx|mjs)$/.test(entrada.name)) fontes.push(completo);
    }
  };
  varrer(path.join(raiz, "src"));
  varrer(path.join(raiz, "api"));

  const importam = fontes
    .filter((f) => /@tiptap\/static-renderer/.test(readFileSync(f, "utf8")))
    .map((f) => path.relative(raiz, f).replace(/\\/g, "/"));
  afirmar(
    "só um arquivo importa o renderizador estático (AD-2: um caminho de JSON para HTML)",
    importam.length === 1 && importam[0] === CAMINHO_RENDERIZADOR,
    `importam: ${importam.join(", ") || "nenhum"}`,
  );

  const suspeito = /innerHTML|<\s*script|sanitize|stripTags|DOMPurify|xss/i;
  for (const arquivo of [CAMINHO_RENDERIZADOR, CAMINHO_NUCLEO, CAMINHO_ACESSO, CAMINHO_INVOLUCRO]) {
    const codigo = mascararComentariosJs(tentar(`${arquivo} legível`, () => ler(arquivo), ""));
    afirmar(
      `${arquivo} não filtra HTML por string`,
      !suspeito.test(codigo),
      (suspeito.exec(codigo) ?? [])[0] ?? "",
    );
  }
  // O detector precisa poder acusar, e precisa absolver comentário: sem os dois
  // lados ele é uma regex que nunca viu um positivo.
  afirmar(
    "o detector de filtro por string acusa no código e absolve em comentário",
    suspeito.test(mascararComentariosJs("const x = DOMPurify.sanitize(a);")) &&
      !suspeito.test(mascararComentariosJs("// não usamos DOMPurify aqui\n")) &&
      !suspeito.test(mascararComentariosJs("/* nada de innerHTML */\n")),
  );
  afirmar(
    "o mascarador de comentários não se perde num literal de expressão regular",
    mascararComentariosJs("const r = /a\\/b/; // fim\nconst y = 1;").includes("const y = 1;") &&
      !mascararComentariosJs("const r = /a\\/b/; // fim\nconst y = 1;").includes("fim"),
  );
}

/* ─── (c) O núcleo e o invólucro, lidos ──────────────────────────────────── */

secao("(c) o núcleo: lista fechada, Autor no servidor, resposta sem detalhe");

{
  const nucleo = mascararComentariosJs(tentar(`${CAMINHO_NUCLEO} legível`, () => ler(CAMINHO_NUCLEO), ""));

  // A validação é a MESMA função, importada. Uma segunda implementação no
  // servidor é exatamente o que a story proíbe.
  afirmar(
    "o núcleo chega ao schema pelo renderizador único, e não reimplementa a validação",
    /from "\.\.\/\.\.\/src\/render\/blog\/paraHtml\.js"/.test(nucleo) &&
      !/NOS_PERMITIDOS|MARCAS_PERMITIDAS|filtrarNo|ehNoPermitido/.test(nucleo),
    "o núcleo não pode ter conhecimento próprio do vocabulário",
  );

  afirmar(
    "a lista de campos aceitos é fechada e não inclui conteudo_html",
    !CAMPOS_ACEITOS.includes("conteudo_html"),
    CAMPOS_ACEITOS.join(", "),
  );
  for (const campo of ["conteudo_html", "estado", "autor_id", "autor_nome", "publicado_em"]) {
    afirmar(
      `\`${campo}\` está declarado como ignorado, com nome`,
      CAMPOS_IGNORADOS.includes(campo),
      CAMPOS_IGNORADOS.join(", "),
    );
  }
  afirmar(
    "nenhum campo aparece nas duas listas ao mesmo tempo",
    !CAMPOS_ACEITOS.some((c) => CAMPOS_IGNORADOS.includes(c)),
  );

  // `estado` fora dos comandos de escrita: é o padrão da coluna que faz o Post
  // nascer rascunho, e o cliente não pode ter voz aqui.
  const comandos = nucleo.slice(nucleo.indexOf("async function gravar"));
  afirmar(
    "o núcleo nunca envia `estado` ao banco",
    !/\bestado\s*:/.test(comandos),
    (/\bestado\s*:[^,\n]*/.exec(comandos) ?? [])[0] ?? "",
  );
  // O Autor NÃO entra no comando de atualização. É a metade do critério de
  // aceite que se perde em implementação distraída.
  const trechoDaAtualizacao = nucleo.slice(
    nucleo.indexOf("const alteracao = {"),
    nucleo.indexOf("atualizarPost(id, alteracao)"),
  );
  afirmar(
    "o comando de atualização não menciona autor_id nem autor_nome",
    trechoDaAtualizacao !== "" && !/autor_/.test(trechoDaAtualizacao),
    trechoDaAtualizacao.slice(0, 200),
  );

  const acesso = mascararComentariosJs(tentar(`${CAMINHO_ACESSO} legível`, () => ler(CAMINHO_ACESSO), ""));
  afirmar(
    "a chave de serviço NÃO tem variante com prefixo VITE_",
    VARIAVEIS.chaveDeServico.every((n) => !/^VITE_/.test(n)) &&
      !/VITE_[A-Z_]*SERVIC/i.test(acesso),
    VARIAVEIS.chaveDeServico.join(", "),
  );
  afirmar(
    "o acesso esconde a credencial antes de ela virar detalhe de erro",
    /esconder\(/.test(acesso) && /credencial oculta/.test(acesso),
  );
  afirmar(
    "o token do chamador é conferido no servidor, contra /auth/v1/user",
    /\/auth\/v1\/user/.test(acesso) && !/jwt\.decode|atob\(|Buffer\.from\([^)]*base64/.test(acesso),
    "decodificar o token localmente aceitaria token forjado",
  );
  afirmar(
    "documento e HTML são gravados no MESMO comando",
    /conteudo:\s*derivado\.documento,\s*\n?\s*conteudo_html:\s*derivado\.html/.test(
      mascararComentariosJs(ler(CAMINHO_NUCLEO)),
    ),
    "derivado desatualizado é pior que ausente",
  );

  const involucro = mascararComentariosJs(tentar(`${CAMINHO_INVOLUCRO} legível`, () => ler(CAMINHO_INVOLUCRO), ""));
  afirmar(
    "o invólucro não devolve `detalhe` ao chamador",
    !/detalhe/.test(
      involucro.slice(involucro.indexOf("export function respostaDeErro"), involucro.indexOf("export default")),
    ),
    "detalhe é diagnóstico, e diagnóstico vai para o log",
  );
  afirmar(
    "o invólucro registra o detalhe no log do servidor",
    /console\.error/.test(involucro) && /erro\.detalhe/.test(involucro),
  );
  afirmar(
    "o token vem do CABEÇALHO, nunca do corpo do pedido",
    /authorization/i.test(involucro) && tokenDoCabecalho({ authorization: "Bearer abc" }) === "abc",
  );
  afirmar(
    "cabeçalho ausente ou malformado não produz token",
    tokenDoCabecalho({}) === "" &&
      tokenDoCabecalho({ authorization: "abc" }) === "" &&
      tokenDoCabecalho({ authorization: "Basic abc" }) === "",
  );

  /* `corpoComoObjeto` era a única peça exportada do invólucro com ramo de
     verdade e não tinha asserção nenhuma: inverter a guarda para
     `if (typeof corpo === "string") return corpo;` fazia TODA gravação responder
     422 "não veio no formato esperado" em qualquer runtime que entregue o corpo
     como texto — a variação que a função existe para absorver — com a suíte
     verde. Cinco formas, e o `Buffer` é a que a plataforma entrega quando o tipo
     de conteúdo não é JSON: ele É um objeto, então passaria pela conferência de
     forma e cairia como "falta título" sobre um pedido bem formado. */
  {
    const objeto = { titulo: "x" };
    const casos = [
      ["objeto já desserializado", objeto, (r) => r === objeto],
      ["texto JSON", '{"titulo":"x"}', (r) => r?.titulo === "x"],
      ["texto vazio", "   ", (r) => r === null],
      ["texto que não é JSON", "isto não é json", (r) => r === "isto não é json"],
      [
        "Buffer com JSON (tipo de conteúdo não-JSON)",
        Buffer.from('{"titulo":"x"}', "utf8"),
        (r) => r?.titulo === "x",
      ],
      [
        "Uint8Array com JSON",
        new TextEncoder().encode('{"titulo":"ç"}'),
        (r) => r?.titulo === "ç",
      ],
      [
        "Buffer que não é JSON",
        Buffer.from("isto não é json", "utf8"),
        (r) => r === "isto não é json",
      ],
      ["null", null, (r) => r === null],
    ];
    for (const [nome, entrada, esperado] of casos) {
      const r = tentar(`corpoComoObjeto(${nome}) não lança`, () => corpoComoObjeto(entrada), undefined);
      afirmar(`corpoComoObjeto: ${nome}`, esperado(r), JSON.stringify(r)?.slice(0, 120) ?? String(r));
    }
    // E o resultado precisa ATRAVESSAR o núcleo: uma forma que a função absorve
    // e o núcleo recusa depois não teria absorvido nada.
    const r = await salvarPost({
      token: "bom",
      corpo: corpoComoObjeto(Buffer.from(JSON.stringify(corpoValido()), "utf8")),
      acesso: acessoDeTeste(),
    });
    afirmar(
      "um corpo que chegou como Buffer atravessa o núcleo e grava",
      r.ok === true,
      r.ok ? "" : `${r.erro.tipo}: ${r.erro.mensagem}`,
    );
  }

  /* A SAÍDA também é lista fechada. Com `select=*`, toda coluna futura — uma
     nota interna, um campo de moderação — passaria a sair na resposta da API sem
     ninguém decidir isso. */
  afirmar(
    "a gravação não pede `select=*`: as colunas de saída são nomeadas",
    !/select=\*/.test(acesso) && COLUNAS_DO_POST.length > 0,
    (/select=[^`&"']*/.exec(acesso) ?? [])[0] ?? "",
  );
  afirmar(
    "nenhuma coluna de saída é desconhecida da tabela",
    COLUNAS_DO_POST.every((c) => /^[a-z][a-z0-9_]*$/.test(c)),
    COLUNAS_DO_POST.join(", "),
  );

  // A resposta de erro sai tipada, e todo tipo tem código HTTP.
  afirmar(
    "todo tipo de erro do núcleo tem código HTTP declarado",
    TIPOS_DE_ERRO.every((t) => Number.isInteger(CODIGO_HTTP[t])),
    TIPOS_DE_ERRO.map((t) => `${t}: ${CODIGO_HTTP[t] ?? "—"}`).join(", "),
  );
  afirmar(
    "a resposta de erro carrega tipo e mensagem, e nada de interno",
    (() => {
      const corpo = respostaDeErro({
        tipo: ERRO_PERMISSAO,
        mensagem: "frase",
        detalhe: "SQLSTATE 42501 na tabela posts",
        codigo: "42501",
        status: 401,
      });
      const texto = JSON.stringify(corpo);
      return (
        corpo.erro.tipo === ERRO_PERMISSAO &&
        corpo.erro.mensagem === "frase" &&
        !texto.includes("42501") &&
        !texto.includes("SQLSTATE")
      );
    })(),
  );

  // O classificador, exercitado: é ele que decide se a tela pede para tentar de
  // novo, para consertar um campo ou para entrar outra vez.
  for (const [descricao, entrada, esperado] of [
    ["rede fora (status 0)", { status: 0 }, ERRO_REDE],
    ["servidor caído (500)", { status: 500 }, ERRO_REDE],
    ["limite de taxa (429)", { status: 429 }, ERRO_REDE],
    ["credencial recusada (401)", { status: 401 }, ERRO_PERMISSAO],
    ["privilégio negado (42501)", { status: 400, codigo: "42501" }, ERRO_PERMISSAO],
    ["slug duplicado (23505)", { status: 409, codigo: "23505" }, ERRO_CONFLITO],
    ["restrição de verificação (23514)", { status: 400, codigo: "23514" }, ERRO_DADOS_INVALIDOS],
    ["rota inexistente (404)", { status: 404 }, ERRO_INESPERADO],
  ]) {
    afirmar(
      `classificar: ${descricao} → ${esperado}`,
      classificar(entrada) === esperado,
      `veio ${classificar(entrada)}`,
    );
  }
}

/* ─── (c2) O transporte, exercitado com `buscar` injetado ────────────────── */

secao("(c2) o transporte: ocultação de credencial, prazo total e URL de destino");

{
  /* A trava da chave de serviço era verificada por GREP do próprio código
     (`/esconder\(/.test(acesso)`). Estreitar o laço para cobrir só a chave
     publicável, ou subir o piso de comprimento, mantinha a regex passando — e um
     4xx do PostgREST que ecoe o cabeçalho `apikey` levaria a chave de serviço
     para o log de produção. `criarAcesso` aceita `buscar` injetável justamente
     para isto, e a verificação nunca usava. */
  const CHAVE_FALSA_DE_SERVICO = "sb_secret_esta_e_a_chave_de_servico_de_teste_123";
  const CHAVE_FALSA_PUBLICAVEL = "sb_publishable_esta_e_a_publicavel_de_teste_456";

  const respondendo = (corpo, status = 400) => async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => corpo,
  });

  const comEco = (corpo, status = 400) =>
    criarAcesso({
      url: "https://exemplo.supabase.co",
      chavePublicavel: CHAVE_FALSA_PUBLICAVEL,
      chaveDeServico: CHAVE_FALSA_DE_SERVICO,
      buscar: respondendo(corpo, status),
    });

  for (const [nome, corpo] of [
    [
      "resposta de erro que ecoa o cabeçalho apikey",
      JSON.stringify({
        code: "PGRST301",
        message: `No API key found: apikey=${CHAVE_FALSA_DE_SERVICO}`,
      }),
    ],
    ["resposta que não é JSON e traz a chave", `erro na borda: ${CHAVE_FALSA_DE_SERVICO}`],
  ]) {
    const r = await comEco(corpo).inserirPost({ titulo: "x" });
    afirmar(
      `${nome}: a chave de serviço NÃO aparece no resultado`,
      r.ok === false && !JSON.stringify(r).includes(CHAVE_FALSA_DE_SERVICO),
      JSON.stringify(r).slice(0, 200),
    );
    afirmar(
      `${nome}: o marcador de ocultação aparece no lugar dela`,
      JSON.stringify(r).includes("credencial oculta"),
      JSON.stringify(r).slice(0, 200),
    );
  }
  // A publicável também é ocultada — ela não é segredo, mas um eco dela no log
  // significa que o mesmo caminho ecoaria a outra.
  {
    const r = await comEco(
      JSON.stringify({ message: `apikey=${CHAVE_FALSA_PUBLICAVEL}` }),
    ).contaDoToken("tok");
    afirmar(
      "a chave publicável também é ocultada no resultado",
      !JSON.stringify(r).includes(CHAVE_FALSA_PUBLICAVEL),
      JSON.stringify(r).slice(0, 160),
    );
  }
  // E o detector precisa poder acusar: sem `esconder`, o texto sairia cru.
  afirmar(
    "o eco de credencial de fato existiria sem a ocultação (o teste não é vazio)",
    JSON.stringify({ message: `apikey=${CHAVE_FALSA_DE_SERVICO}` }).includes(
      CHAVE_FALSA_DE_SERVICO,
    ),
  );

  /* O PRAZO TOTAL, com relógio de mentira. Antes eram 15 s por chamada e nada
     por pedido: três chamadas sequenciais davam 45 s de teto interno contra os
     10–15 s da plataforma, então o prazo interno nunca disparava e o cliente
     recebia um 504 cru, sem tipo. */
  {
    let instante = 0;
    const acessoLento = criarAcesso({
      url: "https://exemplo.supabase.co",
      chavePublicavel: CHAVE_FALSA_PUBLICAVEL,
      chaveDeServico: CHAVE_FALSA_DE_SERVICO,
      prazoTotalMs: 1000,
      prazoPorChamadaMs: 900,
      agora: () => instante,
      // Cada chamada "gasta" 600 ms do relógio de mentira.
      buscar: async () => {
        instante += 600;
        return { ok: true, status: 200, text: async () => "[]" };
      },
    });
    const primeira = await acessoLento.lerPost("11111111-1111-1111-1111-111111111111");
    const segunda = await acessoLento.lerPost("11111111-1111-1111-1111-111111111111");
    const terceira = await acessoLento.lerPost("11111111-1111-1111-1111-111111111111");
    afirmar(
      "o prazo do PEDIDO é compartilhado: a terceira chamada não sai depois de o total esgotar",
      primeira.ok === true &&
        segunda.ok === true &&
        terceira.ok === false &&
        terceira.status === 0 &&
        terceira.codigo === "PrazoEsgotado",
      `1ª ${primeira.ok} | 2ª ${segunda.ok} | 3ª ${terceira.ok} (${terceira.codigo})`,
    );
    afirmar(
      "prazo esgotado é classificado como `rede` — a tela pede para tentar de novo",
      classificar(terceira) === ERRO_REDE,
      classificar(terceira),
    );
    acessoLento.reiniciarPrazo();
    instante += 1;
    const depoisDeReiniciar = await acessoLento.lerPost(
      "11111111-1111-1111-1111-111111111111",
    );
    afirmar(
      "reiniciarPrazo() rearma o relógio para o pedido seguinte",
      depoisDeReiniciar.ok === true,
      JSON.stringify(depoisDeReiniciar).slice(0, 120),
    );
    afirmar(
      "o prazo total é menor que o teto da plataforma (10 s)",
      (await import("../api/_nucleo/acesso.js")).PRAZO_TOTAL_PADRAO_MS < 10000,
    );
  }

  /* A URL DE DESTINO é conferida antes de a chave de serviço viajar para ela.
     Sem isto, `lerAmbiente` aceitava qualquer texto: uma variável trocada no
     painel da plataforma exfiltrava o segredo numa requisição. */
  for (const [nome, url, deveAceitar] of [
    ["o projeto real", URL_PROJETO, true],
    ["host local em http", "http://127.0.0.1:54321", true],
    ["localhost em http", "http://localhost:54321", true],
    ["http em host remoto", "http://exemplo.supabase.co", false],
    ["texto que não é URL", "nao-e-url", false],
    ["credencial embutida", "https://usuario:senha@exemplo.supabase.co", false],
    ["consulta na URL", "https://exemplo.supabase.co?x=1", false],
    ["fragmento na URL", "https://exemplo.supabase.co#x", false],
    ["caminho além da raiz", "https://exemplo.supabase.co/rest/v1", false],
    ["esquema executável", "javascript:alert(1)", false],
    ["destino de exfiltração", "https://coletor.exemplo.com/", true],
  ]) {
    afirmar(
      `URL de destino — ${nome}: ${deveAceitar ? "aceita" : "recusada"}`,
      (problemaNaUrl(url) === null) === deveAceitar,
      String(problemaNaUrl(url) ?? "aceita"),
    );
  }
  /* A última linha acima é deliberadamente `true`, e é a fronteira honesta desta
     conferência: ela recusa URL malformada, insegura ou com credencial, mas NÃO
     sabe qual host é o do projeto — quem controla o painel da plataforma controla
     o destino. A trava contra isso é o controle de acesso ao painel, e não
     código. Fica dito para não ser lido como cobertura que não existe. */
  nota(
    "a conferência de URL recusa forma insegura, não host errado: quem controla o painel da plataforma controla o destino.",
  );

  {
    const invalida = lerAmbiente({
      SUPABASE_URL: "http://exemplo.supabase.co",
      SUPABASE_CHAVE_PUBLICAVEL: "sb_publishable_x",
      SUPABASE_CHAVE_DE_SERVICO: "sb_secret_x",
    });
    afirmar(
      "lerAmbiente RECUSA a montagem quando a URL não serve, nomeando a variável",
      invalida.ok === false &&
        (invalida.invalidas ?? []).some((t) => t.startsWith(VARIAVEIS.url[0])),
      JSON.stringify(invalida),
    );
  }
}

/* ─── (c3) A leitura do corpo, exercitada ────────────────────────────────── */

secao("(c3) a leitura do corpo: todos os problemas de uma vez, e os tetos");

{
  /* `lerCorpo` saía no PRIMEIRO problema de formato: título vazio mais slug
     malformado reportava só o slug, e quem preenche o formulário conserta um
     erro por salvamento, descobrindo o seguinte só depois de clicar de novo. */
  const varios = lerCorpo(
    { titulo: "   ", slug: "Slug Com Espaço", resumo: 7, conteudo: DOCUMENTO_COMPLETO },
    { criando: true },
  );
  afirmar(
    "corpo com três problemas reporta os TRÊS, não só o primeiro",
    varios.ok === false &&
      /titulo/.test(varios.mensagem) &&
      /endereço do post/i.test(varios.mensagem) &&
      /resumo/i.test(varios.mensagem),
    varios.ok ? "passou" : varios.mensagem,
  );
  afirmar(
    "e `faltando` lista só o que está de fato ausente",
    varios.ok === false && mesmoConjunto(varios.faltando, ["titulo"]),
    JSON.stringify(varios.faltando),
  );

  const tudoAusente = lerCorpo({}, { criando: true });
  afirmar(
    "criação sem nada reporta os três campos obrigatórios de uma vez",
    tudoAusente.ok === false &&
      mesmoConjunto(tudoAusente.faltando, ["titulo", "slug", "conteudo"]),
    JSON.stringify(tudoAusente.faltando),
  );

  // `resumo` não tinha teto (título e slug tinham) e não havia como limpá-lo:
  // enviar nulo era recusado como erro de tipo.
  const resumoLongo = lerCorpo(
    { titulo: "t", slug: "s", resumo: "x".repeat(5000), conteudo: DOCUMENTO_COMPLETO },
    { criando: true },
  );
  afirmar(
    "resumo acima do teto é recusado, com a frase dizendo para encurtar",
    resumoLongo.ok === false && /resumo passa de/i.test(resumoLongo.mensagem),
    resumoLongo.ok ? "passou" : resumoLongo.mensagem,
  );
  const resumoLimpo = lerCorpo(
    { titulo: "t", slug: "s", resumo: null, conteudo: DOCUMENTO_COMPLETO },
    { criando: true },
  );
  afirmar(
    "resumo nulo LIMPA o campo em vez de ser erro de tipo",
    resumoLimpo.ok === true && resumoLimpo.campos.resumo === "",
    JSON.stringify(resumoLimpo).slice(0, 160),
  );

  // Teto de tamanho: é ele que limita também a LARGURA do documento, e é o que
  // impede a travessia da restrição do banco de virar varredura de milhões de
  // linhas por gravação.
  {
    const largo = {
      type: "doc",
      content: Array.from({ length: 40000 }, () => ({
        type: "paragraph",
        content: [{ type: "text", text: "irmão".repeat(4) }],
      })),
    };
    const tamanho = JSON.stringify(largo).length;
    const r = lerCorpo({ titulo: "t", slug: "s", conteudo: largo }, { criando: true });
    afirmar(
      `documento de ${tamanho} caracteres de JSON é recusado pelo teto de ${TAMANHO_MAXIMO_DO_CONTEUDO}`,
      tamanho > TAMANHO_MAXIMO_DO_CONTEUDO &&
        r.ok === false &&
        /grande demais/i.test(r.mensagem),
      r.ok ? "passou" : r.mensagem,
    );
  }

  // `ignorados` não tinha teto enquanto o relatório de descartes do schema tinha:
  // dez mil chaves inventadas no corpo voltavam como dez mil strings.
  {
    const corpo = { titulo: "t", slug: "s", conteudo: DOCUMENTO_COMPLETO };
    for (let i = 0; i < 5000; i += 1) corpo[`inventado_${i}`] = 1;
    const r = lerCorpo(corpo, { criando: true });
    afirmar(
      `a lista de ignorados tem teto de ${LIMITE_DE_IGNORADOS}, e a contagem inteira vem ao lado`,
      r.ok === true &&
        r.ignorados.length === LIMITE_DE_IGNORADOS &&
        r.totalIgnorado === 5000 &&
        r.ignoradosTruncados === true,
      r.ok ? `lista ${r.ignorados.length} | total ${r.totalIgnorado}` : "recusou",
    );
  }
}

/* ─── (d) O núcleo, executado sem rede ───────────────────────────────────── */

secao("(d) o núcleo executado: cada recusa da matriz, e nada gravado");

{
  const casos = [
    {
      nome: "pedido SEM token é recusado",
      token: "",
      corpo: corpoValido(),
      acesso: acessoDeTeste(),
      tipo: ERRO_PERMISSAO,
    },
    {
      nome: "token forjado é recusado",
      token: "nao.e.um.jwt",
      corpo: corpoValido(),
      acesso: acessoDeTeste({
        respostaDoToken: { ok: false, status: 403, codigo: "bad_jwt", mensagem: "invalid JWT" },
      }),
      tipo: ERRO_PERMISSAO,
    },
    {
      nome: "token vencido é recusado",
      token: "vencido",
      corpo: corpoValido(),
      acesso: acessoDeTeste({
        respostaDoToken: { ok: false, status: 401, codigo: "token_expired", mensagem: "expired" },
      }),
      tipo: ERRO_PERMISSAO,
    },
    {
      nome: "Supabase indisponível na conferência do token não vira 'entre de novo'",
      token: "qualquer",
      corpo: corpoValido(),
      acesso: acessoDeTeste({
        respostaDoToken: { ok: false, status: 0, codigo: "TypeError", mensagem: "fetch failed" },
      }),
      tipo: ERRO_REDE,
    },
    {
      nome: "corpo que não é objeto é recusado",
      token: "bom",
      corpo: "não é objeto",
      acesso: acessoDeTeste(),
      tipo: ERRO_DADOS_INVALIDOS,
    },
    {
      nome: "título ausente é recusado, nomeando o campo",
      token: "bom",
      corpo: corpoValido({ titulo: "   " }),
      acesso: acessoDeTeste(),
      tipo: ERRO_DADOS_INVALIDOS,
      faltando: ["titulo"],
    },
    {
      nome: "conteúdo ausente é recusado, nomeando o campo",
      token: "bom",
      corpo: (() => {
        const c = corpoValido();
        delete c.conteudo;
        return c;
      })(),
      acesso: acessoDeTeste(),
      tipo: ERRO_DADOS_INVALIDOS,
      faltando: ["conteudo"],
    },
    {
      nome: "criação sem slug é recusada",
      token: "bom",
      corpo: corpoValido({ slug: undefined }),
      acesso: acessoDeTeste(),
      tipo: ERRO_DADOS_INVALIDOS,
      faltando: ["slug"],
    },
    {
      nome: "slug fora do formato de URL é recusado",
      token: "bom",
      corpo: corpoValido({ slug: "Slug Com Espaço" }),
      acesso: acessoDeTeste(),
      tipo: ERRO_DADOS_INVALIDOS,
    },
    {
      nome: "identificador fora do formato é recusado, e não vira criação silenciosa",
      token: "bom",
      corpo: corpoValido({ id: 123 }),
      acesso: acessoDeTeste(),
      tipo: ERRO_DADOS_INVALIDOS,
    },
    {
      nome: "conteúdo que não é documento é recusado",
      token: "bom",
      corpo: corpoValido({ conteudo: "só texto" }),
      acesso: acessoDeTeste(),
      tipo: ERRO_DADOS_INVALIDOS,
    },
    {
      nome: "Post inexistente na edição é ausência, não defeito",
      token: "bom",
      corpo: corpoValido({ id: randomUUID() }),
      acesso: acessoDeTeste({ post: null }),
      tipo: ERRO_NAO_ENCONTRADO,
    },
    {
      nome: "colisão de slug vira conflito, não defeito",
      token: "bom",
      corpo: corpoValido(),
      acesso: acessoDeTeste({
        respostaDaEscrita: {
          ok: false,
          status: 409,
          codigo: "23505",
          mensagem: 'duplicate key value violates unique constraint "posts_slug_unico"',
        },
      }),
      tipo: ERRO_CONFLITO,
    },
    {
      nome: "recusa do banco pela restrição de higienização vira dados inválidos",
      token: "bom",
      corpo: corpoValido(),
      acesso: acessoDeTeste({
        respostaDaEscrita: {
          ok: false,
          status: 400,
          codigo: "23514",
          mensagem: 'violates check constraint "posts_conteudo_html_seguro"',
        },
      }),
      tipo: ERRO_DADOS_INVALIDOS,
    },
  ];

  const mensagens = new Map();
  for (const caso of casos) {
    const r = await salvarPost({ token: caso.token, corpo: caso.corpo, acesso: caso.acesso });
    const tipoCerto = r.ok === false && r.erro.tipo === caso.tipo;
    afirmar(
      caso.nome,
      tipoCerto,
      r.ok ? "o pedido PASSOU" : `tipo ${r.erro.tipo} (esperado ${caso.tipo}): ${r.erro.detalhe.slice(0, 120)}`,
    );
    if (caso.faltando) {
      afirmar(
        `${caso.nome} — e diz qual campo falta`,
        r.ok === false && mesmoConjunto(r.erro.faltando ?? [], caso.faltando),
        JSON.stringify(r.ok ? null : (r.erro.faltando ?? null)),
      );
    }
    // A prova de que "nada gravado" não é esperança: quando a recusa vem ANTES
    // da escrita, nenhuma escrita foi pedida.
    if (caso.tipo !== ERRO_CONFLITO && caso.tipo !== ERRO_DADOS_INVALIDOS) {
      afirmar(
        `${caso.nome} — e nenhuma escrita foi tentada`,
        caso.acesso.escritas().length === 0,
        `escritas: ${caso.acesso.escritas().map((c) => c.nome).join(", ")}`,
      );
    }
    if (r.ok === false && r.erro.tipo === ERRO_PERMISSAO) {
      mensagens.set(caso.nome, r.erro.mensagem);
    }
  }

  // Sem token, token forjado e token vencido dizem a MESMA coisa. Distinguir na
  // resposta diria a quem tenta se o token que ele inventou tem forma válida.
  const frases = new Set(mensagens.values());
  afirmar(
    "sem token, token forjado e token vencido são INDISTINGUÍVEIS na resposta",
    mensagens.size === 3 && frases.size === 1,
    `${mensagens.size} casos, ${frases.size} frase(s): ${[...frases].join(" | ")}`,
  );
}

/* — A gravação válida, com acesso de mentira: o que é enviado ao banco — */

{
  const acesso = acessoDeTeste();
  const r = await salvarPost({
    token: "bom",
    corpo: corpoValido({
      // O cliente tenta ditar tudo o que não pode.
      conteudo_html: "<script>alert(1)</script>",
      estado: "publicado",
      publicado_em: "2000-01-01T00:00:00Z",
      autor_id: "99999999-9999-9999-9999-999999999999",
      autor_nome: "Nome de Outra Pessoa",
      campo_inventado: 1,
    }),
    acesso,
  });

  const ok = afirmar("a gravação válida é aceita", r.ok === true, r.ok ? "" : JSON.stringify(r.erro));
  if (ok) {
    const escritas = acesso.escritas();
    afirmar(
      "houve EXATAMENTE uma escrita — documento e HTML entram juntos ou não entram",
      escritas.length === 1,
      `escritas: ${escritas.length}`,
    );
    const enviado = escritas[0]?.argumentos[0] ?? {};
    afirmar(
      "o comando de escrita carrega conteudo E conteudo_html",
      Object.hasOwn(enviado, "conteudo") && Object.hasOwn(enviado, "conteudo_html"),
      Object.keys(enviado).join(", "),
    );
    afirmar(
      "o conteudo_html gravado é o DERIVADO, não o enviado pelo cliente",
      enviado.conteudo_html === derivarHtml(DOCUMENTO_COMPLETO).html &&
        !/script/i.test(String(enviado.conteudo_html)),
      String(enviado.conteudo_html).slice(0, 120),
    );
    afirmar(
      "`estado` não é enviado ao banco (o padrão da coluna faz o Post nascer rascunho)",
      !Object.hasOwn(enviado, "estado"),
      Object.keys(enviado).join(", "),
    );
    afirmar(
      "`publicado_em` não é enviado ao banco",
      !Object.hasOwn(enviado, "publicado_em"),
    );
    afirmar(
      "o Autor gravado é o do PERFIL da Conta autenticada, não o enviado",
      enviado.autor_nome === "Pessoa do Perfil" && enviado.autor_id === CONTA_FALSA.id,
      `autor_nome: ${enviado.autor_nome} | autor_id: ${enviado.autor_id}`,
    );
    afirmar(
      "campo inventado pelo cliente não chega ao banco",
      !Object.hasOwn(enviado, "campo_inventado"),
      Object.keys(enviado).join(", "),
    );
    afirmar(
      "a resposta relata o que foi ignorado, com nome",
      mesmoConjunto(r.dados.ignorados, [
        "conteudo_html",
        "estado",
        "publicado_em",
        "autor_id",
        "autor_nome",
        "campo_inventado",
      ]),
      (r.dados.ignorados ?? []).join(", "),
    );
    afirmar(
      "a resposta relata que o Post nasceu",
      r.dados.criado === true,
    );
  }
}

/* AUTENTICAR NÃO É AUTORIZAR.
   A versão anterior aceitava Conta sem perfil e gravava com `autor_id` nulo — um
   Post sem autoria rastreável, escrito por alguém que o Painel nunca cadastrou.
   A barreira que sobrava era o registro público estar fechado, que é configuração
   de projeto: uma mudança de configuração passaria a permitir escrita sem que uma
   linha de código mudasse. Ter perfil é o que significa estar cadastrado. */
{
  const acesso = acessoDeTeste({ perfil: null });
  const r = await salvarPost({ token: "bom", corpo: corpoValido(), acesso });
  afirmar(
    "Conta autenticada SEM perfil no Painel é RECUSADA — autenticar não é autorizar",
    r.ok === false && r.erro.tipo === ERRO_PERMISSAO,
    r.ok ? "GRAVOU" : `tipo ${r.erro.tipo}`,
  );
  afirmar(
    "e nada foi gravado por ela",
    acesso.escritas().length === 0,
    `escritas: ${acesso.escritas().length}`,
  );
  afirmar(
    "a frase diz o que houve e a quem recorrer, sem revelar detalhe interno",
    r.ok === false &&
      /não está cadastrada no Painel/i.test(r.erro.mensagem) &&
      !r.erro.mensagem.includes("perfis"),
    r.ok ? "" : r.erro.mensagem,
  );
}

/* O ENDEREÇO DE UM POST QUE JÁ ESTEVE NO AR NÃO MUDA POR AQUI.
   `slugs_antigos` é a base do 301 e esta função é o único caminho de escrita:
   trocar o slug sem aposentar o anterior quebraria toda URL publicada, em
   silêncio. Aposentar exige escrever em duas tabelas atomicamente — função no
   banco — e o ciclo de vida do slug é da Story 2.6. Recusar é o que não quebra
   nada enquanto isso. */
{
  const publicado = {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    slug: "endereco-antigo",
    estado: "publicado",
    publicado_em: "2026-01-01T00:00:00Z",
    autor_id: "99999999-9999-9999-9999-999999999999",
    autor_nome: "Autor Original",
  };
  const acesso = acessoDeTeste({ post: publicado });
  const r = await salvarPost({
    token: "bom",
    corpo: corpoValido({ id: publicado.id, slug: "endereco-novo" }),
    acesso,
  });
  afirmar(
    "trocar o endereço de um Post que já esteve no ar é RECUSADO, não gravado em silêncio",
    r.ok === false && r.erro.tipo === ERRO_CONFLITO,
    r.ok ? "GRAVOU e quebrou a URL antiga" : `tipo ${r.erro.tipo}`,
  );
  afirmar(
    "e nada foi gravado",
    acesso.escritas().length === 0,
    `escritas: ${acesso.escritas().length}`,
  );

  // Rascunho nunca teve URL: troca de endereço à vontade.
  const rascunho = { ...publicado, estado: "rascunho", publicado_em: null };
  const acessoRascunho = acessoDeTeste({ post: rascunho });
  const rr = await salvarPost({
    token: "bom",
    corpo: corpoValido({ id: rascunho.id, slug: "endereco-novo" }),
    acesso: acessoRascunho,
  });
  afirmar(
    "rascunho troca de endereço à vontade — nunca teve URL para quebrar",
    rr.ok === true && acessoRascunho.escritas()[0]?.argumentos[0]?.slug === "endereco-novo",
    rr.ok ? JSON.stringify(acessoRascunho.escritas()[0]?.argumentos[0]?.slug) : `${rr.erro.tipo}`,
  );

  // Salvar o texto SEM mexer no endereço continua funcionando num publicado —
  // senão a recusa acima teria travado o caso comum.
  const acessoMesmoSlug = acessoDeTeste({ post: publicado });
  const rm = await salvarPost({
    token: "bom",
    corpo: corpoValido({ id: publicado.id, slug: publicado.slug }),
    acesso: acessoMesmoSlug,
  });
  afirmar(
    "salvar um Post publicado mantendo o endereço continua funcionando",
    rm.ok === true,
    rm.ok ? "" : `${rm.erro.tipo}: ${rm.erro.mensagem}`,
  );
}

// A edição, com acesso de mentira: o Autor não é tocado.
{
  const acesso = acessoDeTeste({
    post: {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      // O MESMO slug que o corpo envia: trocar o endereço de um Post publicado é
      // recusado, e esta asserção é sobre o Autor, não sobre o endereço.
      slug: "um-post-de-teste",
      estado: "publicado",
      publicado_em: "2026-01-01T00:00:00Z",
      autor_id: "99999999-9999-9999-9999-999999999999",
      autor_nome: "Autor Original",
    },
  });
  const r = await salvarPost({
    token: "bom",
    corpo: corpoValido({ id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", autor_nome: "Invasor" }),
    acesso,
  });
  const enviado = acesso.escritas()[0]?.argumentos[0] ?? {};
  afirmar(
    "a edição é aceita",
    r.ok === true,
    r.ok ? "" : JSON.stringify(r.erro),
  );
  afirmar(
    "o comando de edição NÃO carrega autor_id nem autor_nome",
    !Object.hasOwn(enviado, "autor_id") && !Object.hasOwn(enviado, "autor_nome"),
    Object.keys(enviado).join(", "),
  );
  afirmar(
    "o comando de edição NÃO carrega estado",
    !Object.hasOwn(enviado, "estado"),
    Object.keys(enviado).join(", "),
  );
  afirmar(
    "o perfil da Conta não é nem consultado numa edição — não há nome a resolver",
    !acesso.chamadas.some((c) => c.nome === "perfilDaConta"),
    acesso.chamadas.map((c) => c.nome).join(", "),
  );
}

/* ─── (e) e (f): o projeto real ──────────────────────────────────────────── */

secao(`(e) o núcleo contra o projeto ${NOME_PROJETO} (${REF_PROJETO}), com sessão real`);

const token = lerToken();
const temToken = afirmar(
  "SUPABASE_ACCESS_TOKEN presente no ambiente",
  Boolean(token),
  "sem ele as asserções remotas não podem rodar — e não são puladas em silêncio",
);

if (!temToken) {
  afirmar(
    "a prova comportamental da escrita pôde ser exercida",
    false,
    "sem SUPABASE_ACCESS_TOKEN não há como pedir a chave de serviço nem abrir sessão — a asserção falha como ausente",
  );
} else {
  /* — A chave de serviço, pedida à Management API e mantida em memória — */

  const chaves = await revelarChaves(token);
  const temChaves = afirmar(
    "a Management API revelou a chave publicável e a de serviço",
    chaves.ok === true && Boolean(chaves.publicavel) && Boolean(chaves.servico),
    chaves.ok ? "uma das chaves não veio" : (chaves.erro ?? ""),
  );
  if (temChaves) {
    // Registrada como segredo ANTES de qualquer uso — `revelarChaves` já o faz,
    // e aqui a intenção fica explícita para quem lê.
    registrarSegredo(chaves.servico);
    registrarSegredo(chaves.publicavel);
    afirmar(
      "a chave de serviço é ocultada em toda saída sanitizada",
      !sanitizar(`vazou: ${chaves.servico}`).includes(chaves.servico),
    );
  }

  /* — Nenhum arquivo VERSIONADO contém a chave — */

  if (temChaves) {
    const { execFileSync } = await import("node:child_process");
    const rastreados = tentar(
      "lista de arquivos versionados",
      () =>
        String(execFileSync("git", ["ls-files"], { cwd: raiz, stdio: "pipe" }))
          .split(/\r?\n/)
          .filter((l) => l.trim() !== ""),
      [],
    );
    const comSegredo = [];
    for (const relativo of rastreados) {
      const completo = path.join(raiz, relativo);
      let info;
      try {
        info = statSync(completo);
      } catch {
        continue;
      }
      if (!info.isFile() || info.size > 4_000_000) continue;
      let conteudo;
      try {
        conteudo = readFileSync(completo, "utf8");
      } catch {
        continue;
      }
      if (conteudo.includes(chaves.servico)) comSegredo.push(relativo);
    }
    afirmar(
      `nenhum dos ${rastreados.length} arquivos versionados contém a chave de serviço`,
      comSegredo.length === 0,
      comSegredo.join(", "),
    );
    const dotEnv = path.join(raiz, ".env");
    afirmar(
      "a chave de serviço também não está no `.env` local",
      !existsSync(dotEnv) || !readFileSync(dotEnv, "utf8").includes(chaves.servico),
      "ela é pedida à Management API a cada execução, e não guardada",
    );
    // E a ferramenta não sabe escrever arquivo: é o que sustenta "nunca gravada".
    /* A CHAMADA, e não o nome: esta linha é a única do arquivo que menciona os
       nomes, e uma busca pelo nome puro acusaria a si mesma — o falso positivo
       mais bobo possível numa asserção que existe para pegar vazamento. */
    const propria = mascararComentariosJs(ler("scripts/verificar-escrita.mjs"));
    const gravaArquivo =
      /(writeFileSync|appendFileSync|writeFile|createWriteStream|mkdtempSync|copyFileSync)\s*\(/;
    afirmar(
      "esta ferramenta não grava arquivo algum",
      !gravaArquivo.test(propria),
      (gravaArquivo.exec(propria) ?? [])[0] ?? "",
    );
    /* E o detector precisa acusar quando a chamada existe de verdade. A amostra
       é MONTADA por concatenação: escrita inteira num literal, ela seria uma
       chamada aparente dentro deste arquivo e a asserção acima acusaria a si
       mesma — que é o mesmo falso positivo, pela porta de trás. */
    afirmar(
      "o detector de gravação em arquivo acusa uma chamada real",
      gravaArquivo.test(`writeFileSync${"("}caminho, chave)`),
    );
  }

  /* — A configuração que a função monta a partir do ambiente — */

  {
    const vazio = lerAmbiente({});
    afirmar(
      "ambiente vazio produz erro de configuração nomeando o que falta",
      vazio.ok === false && mesmoConjunto(vazio.faltando, Object.values(VARIAVEIS).map((n) => n[0])),
      JSON.stringify(vazio),
    );
    const semServico = lerAmbiente({
      VITE_SUPABASE_URL: URL_PROJETO,
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
    });
    afirmar(
      "sem a chave de serviço a função NÃO monta — não há escrita sem ela",
      semServico.ok === false && semServico.faltando.includes(VARIAVEIS.chaveDeServico[0]),
      JSON.stringify(semServico),
    );
    const completo = lerAmbiente({
      SUPABASE_URL: `${URL_PROJETO}/`,
      SUPABASE_CHAVE_PUBLICAVEL: "sb_publishable_x",
      SUPABASE_CHAVE_DE_SERVICO: "sb_secret_x",
    });
    afirmar(
      "a URL é normalizada sem barra final (senão o PostgREST responde 404)",
      completo.ok === true && completo.config.url === URL_PROJETO,
      JSON.stringify(completo.config ?? {}),
    );
    afirmar(
      "erro de configuração tem código HTTP 500, e não 4xx",
      CODIGO_HTTP[ERRO_CONFIGURACAO] === 500,
    );
  }

  if (temChaves) {
    const acessoRealBase = criarAcesso({
      url: URL_PROJETO,
      chavePublicavel: chaves.publicavel,
      chaveDeServico: chaves.servico,
    });

    /* O prazo do acesso é do PEDIDO, e esta ferramenta faz muitos pedidos com o
       mesmo acesso ao longo de minutos. `acessoReal` é o mesmo objeto com o
       relógio rearmado — em produção `api/posts.js` monta um acesso novo por
       requisição, então lá a primeira chamada arma sozinha. */
    const acessoReal = () => {
      acessoRealBase.reiniciarPrazo();
      return acessoRealBase;
    };

    /* — Varredura de restos ANTES de semear — */
    //
    // O `finally` cobre asserção que falha e exceção que sobe, mas não cobre o
    // processo sendo MORTO no meio. O prefixo constante é o que torna o resto
    // encontrável por uma execução posterior.

    const PREFIXO_TESTE = "zzz-verificacao-2-5-";
    const MARCA_TESTE = `${PREFIXO_TESTE}%`;
    const EMAIL_TESTE = "verificacao.escrita+%@chatclean.com.br";

    const restos = await executarSql(
      token,
      `with p as (delete from public.posts where slug like ${literal(MARCA_TESTE)} returning 1),
            u as (delete from auth.users where email like ${literal(EMAIL_TESTE)} returning 1)
       select (select count(*) from p) + (select count(*) from u) as n`,
    );
    const quantos = restos.ok ? Number(restos.dados?.[0]?.n ?? 0) : -1;
    afirmar(
      "nenhum resto de verificação sobrou de execuções anteriores",
      restos.ok && quantos === 0,
      restos.ok
        ? `${quantos} linha(s) removida(s) agora — uma execução anterior morreu antes da limpeza`
        : (restos.erro ?? ""),
    );

    const nonce = randomUUID();
    const prefixo = `${PREFIXO_TESTE}${nonce}-`;
    const marca = `${prefixo}%`;
    const slug = (sufixo) => `${prefixo}${sufixo}`;

    const contas = [1, 2].map((i) => {
      const senha = `Vf-${randomUUID().slice(0, 8)}-${i}-aZ9!`;
      registrarSegredo(senha);
      return {
        email: `verificacao.escrita+${nonce}-${i}@chatclean.com.br`,
        nome: `Autor de Verificação ${i}`,
        senha,
        jwt: null,
      };
    });

    let limpeza = null;
    try {
      /* — Duas Contas reais: uma escreve, a outra edita — */

      let abriuSessao = true;
      for (const conta of contas) {
        const criacao = await executarSql(
          token,
          sqlDeCriacaoDeConta({ email: conta.email, senha: conta.senha, nome: conta.nome }),
        );
        conta.id = criacao.ok ? (criacao.dados?.[0]?.id ?? null) : null;
        if (!afirmar(`a Conta temporária "${conta.nome}" foi criada`, Boolean(conta.id), criacao.erro ?? "")) {
          abriuSessao = false;
          continue;
        }

        let resposta = { status: 0, corpo: "" };
        try {
          const r = await fetch(`${URL_PROJETO}/auth/v1/token?grant_type=password`, {
            method: "POST",
            signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: { apikey: chaves.publicavel, "Content-Type": "application/json" },
            body: JSON.stringify({ email: conta.email, password: conta.senha }),
          });
          resposta = { status: r.status, corpo: await r.text() };
        } catch (erro) {
          resposta = { status: 0, corpo: String(erro?.message ?? erro) };
        }
        if (resposta.status === 429) {
          adiar(
            `a sessão real de "${conta.nome}" foi aberta`,
            "o GoTrue respondeu 429 (limite de taxa). Não é defeito do produto: a asserção não pôde ser exercida agora.",
          );
          abriuSessao = false;
          continue;
        }
        try {
          conta.jwt = JSON.parse(resposta.corpo)?.access_token ?? null;
        } catch {
          conta.jwt = null;
        }
        if (conta.jwt) registrarSegredo(conta.jwt);
        if (
          !afirmar(
            `a sessão real de "${conta.nome}" foi aberta`,
            Boolean(conta.jwt),
            `HTTP ${resposta.status} ${resposta.corpo.slice(0, 160)}`,
          )
        ) {
          abriuSessao = false;
        }
      }

      const MOTIVO_SEM_SESSAO = "a sessão real não pôde ser aberta (ver a asserção acima)";

      /* — O token forjado, contra o Supabase de verdade — */

      if (contas[0].jwt) {
        for (const [nome, forjado] of [
          ["um token que não é JWT", "nao.e.um.jwt"],
          ["um JWT com assinatura trocada", `${contas[0].jwt.slice(0, -6)}AAAAAA`],
        ]) {
          const r = await salvarPost({
            token: forjado,
            corpo: corpoValido({ slug: slug("forjado") }),
            acesso: acessoReal(),
          });
          afirmar(
            `${nome} é recusado pelo Supabase, e nada é gravado`,
            r.ok === false && r.erro.tipo === ERRO_PERMISSAO,
            r.ok ? "PASSOU" : `tipo ${r.erro.tipo}: ${r.erro.detalhe.slice(0, 140)}`,
          );
        }
        const sobrou = await executarSql(
          token,
          `select count(*)::int as n from public.posts where slug = ${literal(slug("forjado"))}`,
        );
        afirmar(
          "nenhum Post nasceu das tentativas com token forjado",
          sobrou.ok && Number(sobrou.dados?.[0]?.n ?? -1) === 0,
          sobrou.erro ?? `linhas: ${sobrou.dados?.[0]?.n}`,
        );
      } else {
        adiar("token forjado é recusado pelo Supabase", MOTIVO_SEM_SESSAO);
      }

      /* — A gravação válida, de verdade — */

      let idDoPost = null;
      if (contas[0].jwt) {
        const r = await salvarPost({
          token: contas[0].jwt,
          corpo: corpoValido({
            slug: slug("post"),
            titulo: "Post gravado pela função única",
            resumo: "Resumo do post de verificação",
            // Tudo o que o cliente não pode ditar, enviado de propósito.
            conteudo_html: '<script>alert("html do cliente")</script>',
            estado: "publicado",
            publicado_em: "2000-01-01T00:00:00Z",
            autor_nome: "Nome Inventado pelo Cliente",
            autor_id: contas[1].id,
          }),
          acesso: acessoReal(),
        });
        const gravou = afirmar(
          "a gravação com sessão real é aceita",
          r.ok === true,
          r.ok ? "" : `${r.erro.tipo}: ${r.erro.detalhe.slice(0, 200)}`,
        );
        if (gravou) {
          idDoPost = r.dados.post?.id ?? null;
          const linha = await executarSql(
            token,
            `select id::text as id, estado::text as estado, autor_id::text as autor_id,
                    autor_nome, conteudo::text as conteudo, conteudo_html
               from public.posts where slug = ${literal(slug("post"))}`,
          );
          const gravada = linha.ok ? (linha.dados?.[0] ?? null) : null;
          afirmar(
            "o Post está no banco, relido pela Management API",
            gravada !== null,
            linha.erro ?? "nenhuma linha",
          );
          if (gravada) {
            const esperado = derivarHtml(DOCUMENTO_COMPLETO);
            afirmar(
              "o conteudo_html gravado é EXATAMENTE o derivado do documento",
              gravada.conteudo_html === esperado.html,
              `gravado: ${String(gravada.conteudo_html).slice(0, 120)}`,
            );
            afirmar(
              "o conteudo_html enviado pelo cliente foi ignorado",
              !/script/i.test(String(gravada.conteudo_html)),
              String(gravada.conteudo_html).slice(0, 120),
            );
            afirmar(
              "o HTML gravado não tem atributo class",
              !/\sclass\s*=/i.test(String(gravada.conteudo_html)),
            );
            afirmar(
              "o documento gravado é o SANEADO (documento e HTML na mesma linha)",
              JSON.stringify(JSON.parse(gravada.conteudo)) !== "{}" &&
                JSON.parse(gravada.conteudo).type === "doc",
              String(gravada.conteudo).slice(0, 120),
            );
            afirmar(
              "o Post NASCEU EM RASCUNHO, ainda que o cliente tenha pedido publicado",
              gravada.estado === "rascunho",
              `estado: ${gravada.estado}`,
            );
            afirmar(
              "o Autor é a Conta autenticada, sem digitação",
              gravada.autor_nome === contas[0].nome && gravada.autor_id === contas[0].id,
              `autor_nome: ${gravada.autor_nome} | autor_id: ${gravada.autor_id}`,
            );
            afirmar(
              "o nome enviado pelo cliente NÃO foi gravado",
              gravada.autor_nome !== "Nome Inventado pelo Cliente" &&
                gravada.autor_id !== contas[1].id,
              `autor_nome: ${gravada.autor_nome}`,
            );
          }
        }
      } else {
        adiar("a gravação com sessão real é aceita", MOTIVO_SEM_SESSAO);
      }

      /* — A OUTRA Conta edita: o Autor não muda — */

      if (idDoPost && contas[1].jwt) {
        const r = await salvarPost({
          token: contas[1].jwt,
          corpo: {
            id: idDoPost,
            titulo: "Título revisado pela segunda Conta",
            conteudo: {
              type: "doc",
              content: [{ type: "paragraph", content: [{ type: "text", text: "revisado" }] }],
            },
          },
          acesso: acessoReal(),
        });
        afirmar(
          "a segunda Conta consegue salvar o Post da primeira",
          r.ok === true,
          r.ok ? "" : `${r.erro.tipo}: ${r.erro.detalhe.slice(0, 200)}`,
        );
        const depois = await executarSql(
          token,
          `select titulo, autor_id::text as autor_id, autor_nome, estado::text as estado, conteudo_html
             from public.posts where id = ${literal(idDoPost)}::uuid`,
        );
        const linha = depois.ok ? (depois.dados?.[0] ?? null) : null;
        afirmar(
          "o AUTOR ORIGINAL não mudou quando a outra Conta editou",
          linha !== null &&
            linha.autor_nome === contas[0].nome &&
            linha.autor_id === contas[0].id,
          `autor_nome: ${linha?.autor_nome} | esperado: ${contas[0].nome}`,
        );
        afirmar(
          "a edição gravou o texto novo (a asserção do Autor não passou por nada ter acontecido)",
          linha?.titulo === "Título revisado pela segunda Conta" &&
            String(linha?.conteudo_html) === "<p>revisado</p>",
          `titulo: ${linha?.titulo} | html: ${String(linha?.conteudo_html).slice(0, 80)}`,
        );
        afirmar(
          "salvar não mexeu no estado do Post",
          linha?.estado === "rascunho",
          `estado: ${linha?.estado}`,
        );
      } else if (!contas[1].jwt) {
        adiar("o Autor original não muda quando outra Conta edita", MOTIVO_SEM_SESSAO);
      }

      /* — Conteúdo perigoso PELA FUNÇÃO — */

      if (contas[0].jwt) {
        const r = await salvarPost({
          token: contas[0].jwt,
          corpo: corpoValido({
            slug: slug("hostil"),
            titulo: "Post hostil",
            conteudo: DOCUMENTO_HOSTIL,
          }),
          acesso: acessoReal(),
        });
        afirmar(
          "documento hostil é aceito pela função (o que está fora do schema é descartado, não recusado)",
          r.ok === true,
          r.ok ? "" : `${r.erro.tipo}: ${r.erro.detalhe.slice(0, 200)}`,
        );
        const linha = await executarSql(
          token,
          `select conteudo::text as conteudo, conteudo_html
             from public.posts where slug = ${literal(slug("hostil"))}`,
        );
        const gravada = linha.ok ? (linha.dados?.[0] ?? null) : null;
        afirmar(
          "o Post hostil está no banco (senão as asserções abaixo passariam por vacuidade)",
          gravada !== null,
          linha.erro ?? "nenhuma linha",
        );
        if (gravada) {
          /* O que a coluna SERVIDA não pode conter é markup: é ela que a página
             pública e o HTML servido leem. O documento estruturado é dado — um
             nó de TEXTO cuja palavra é `<script>` é inerte, e apagá-lo seria
             censurar um artigo que fala de segurança. A distinção é exatamente
             a razão de o projeto ter duas colunas, e as duas asserções abaixo
             dizem cada metade. */
          for (const [nome, padrao] of MARCAS_PROIBIDAS) {
            afirmar(
              `o conteudo_html que ficou no banco não contém ${nome}`,
              !padrao.test(String(gravada.conteudo_html)),
              (padrao.exec(String(gravada.conteudo_html)) ?? [])[0] ?? "",
            );
          }
          afirmar(
            "nó e marca fora do schema não ficaram no documento gravado",
            !/"table"|"image"|"strike"|"level":\s*1/.test(String(gravada.conteudo)),
            String(gravada.conteudo).slice(0, 200),
          );
          afirmar(
            "nenhum endereço executável ficou no documento gravado",
            !/"href"\s*:\s*"[^"]*(javascript|vbscript|data)\s*:/i.test(String(gravada.conteudo)),
            (/"href"\s*:\s*"[^"]*"/i.exec(String(gravada.conteudo)) ?? [])[0] ?? "",
          );
          afirmar(
            "e o texto legítimo do Post hostil sobreviveu",
            String(gravada.conteudo_html).includes("riscado sobrevive"),
            String(gravada.conteudo_html).slice(0, 200),
          );
        }
      } else {
        adiar("conteúdo perigoso pela função não deixa nada disso no banco", MOTIVO_SEM_SESSAO);
      }

      /* — Colisão de slug, de verdade — */

      if (contas[0].jwt && idDoPost) {
        const r = await salvarPost({
          token: contas[0].jwt,
          corpo: corpoValido({ slug: slug("post"), titulo: "Outro com o mesmo endereço" }),
          acesso: acessoReal(),
        });
        afirmar(
          "segundo Post com o mesmo slug é recusado como CONFLITO, não como defeito",
          r.ok === false && r.erro.tipo === ERRO_CONFLITO,
          r.ok ? "PASSOU" : `tipo ${r.erro.tipo}: ${r.erro.detalhe.slice(0, 140)}`,
        );
      }

      /* — Post inexistente — */

      if (contas[0].jwt) {
        const r = await salvarPost({
          token: contas[0].jwt,
          corpo: corpoValido({ id: randomUUID(), slug: undefined }),
          acesso: acessoReal(),
        });
        afirmar(
          "editar um Post que não existe é ausência, não defeito",
          r.ok === false && r.erro.tipo === ERRO_NAO_ENCONTRADO,
          r.ok ? "PASSOU" : `tipo ${r.erro.tipo}`,
        );
      }

      /* ── (f) A linha do BANCO: escrita por fora da função ──────────────── */

      secao("(f) a linha do banco: escrita por fora da função é recusada");

      /** Escrita crua no PostgREST com a CHAVE DE SERVIÇO — a "chamada direta". */
      const escreverDireto = async (campos) => {
        try {
          const r = await fetch(`${URL_PROJETO}/rest/v1/posts`, {
            method: "POST",
            signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: {
              apikey: chaves.servico,
              Authorization: `Bearer ${chaves.servico}`,
              "Content-Type": "application/json",
              Prefer: "return=representation",
            },
            body: JSON.stringify(campos),
          });
          return { alcancou: true, status: r.status, corpo: sanitizar(await r.text()) };
        } catch (erro) {
          return { alcancou: false, status: 0, corpo: sanitizar(String(erro?.message ?? erro)) };
        }
      };

      /* CONTROLE POSITIVO, antes de qualquer prova negativa.
         Sem provar que a MESMA chave de serviço CONSEGUE gravar conteúdo
         legítimo, toda recusa abaixo passaria idêntica com uma chave lixo — e a
         seção verificaria nada. */
      const controle = await escreverDireto({
        slug: slug("controle"),
        titulo: "Controle positivo da chave de serviço",
        conteudo: derivarHtml(DOCUMENTO_COMPLETO).documento,
        conteudo_html: derivarHtml(DOCUMENTO_COMPLETO).html,
      });
      const chaveBoa = afirmar(
        "controle positivo: a chave de serviço GRAVA conteúdo legítimo, ignorando a RLS",
        controle.status === 201,
        `HTTP ${controle.status} ${controle.corpo.slice(0, 200)} — com a credencial ruim, toda recusa abaixo seria vácuo`,
      );

      /**
       * A recusa veio da restrição CERTA?
       *
       * O predicado anterior aceitava qualquer `23514`, e um dos casos era
       * recusado por `posts_slug_formato` — porque o slug era derivado do nome em
       * português e saía com hífen final. O caso passava, a cláusula que ele
       * queria exercitar podia estar quebrada, e as asserções ficavam verdes.
       */
      const recusouPor = (r, restricao) =>
        r.alcancou &&
        r.status >= 400 &&
        r.status < 500 &&
        new RegExp(restricao).test(r.corpo);

      for (const caso of RECUSAS_DE_HTML) {
        const r = await escreverDireto({
          slug: slug(`direto-html-${caso.chave}`),
          titulo: "Escrita direta com chave de serviço",
          conteudo_html: caso.html,
        });
        afirmar(
          `chamada direta à API — ${caso.descricao} em conteudo_html é recusada por ${RESTRICAO_DO_HTML}`,
          chaveBoa && recusouPor(r, RESTRICAO_DO_HTML),
          chaveBoa
            ? `HTTP ${r.status} ${r.corpo.slice(0, 180)}`
            : "a chave não passou no controle positivo — a recusa não prova nada",
        );
      }

      for (const caso of RECUSAS_DE_DOCUMENTO) {
        const r = await escreverDireto({
          slug: slug(`direto-doc-${caso.chave}`),
          titulo: "Escrita direta com chave de serviço",
          conteudo: caso.doc,
        });
        afirmar(
          `chamada direta à API — ${caso.descricao} em conteudo é recusado por ${RESTRICAO_DO_DOCUMENTO}`,
          chaveBoa && recusouPor(r, RESTRICAO_DO_DOCUMENTO),
          chaveBoa
            ? `HTTP ${r.status} ${r.corpo.slice(0, 180)}`
            : "a chave não passou no controle positivo — a recusa não prova nada",
        );
      }

      /* — E O OUTRO LADO DA MOEDA: o que o banco tem de ACEITAR — */
      //
      // Uma restrição só é boa se recusar o perigoso E aceitar o legítimo. A
      // versão anterior recusava o primeiro caso — um link de artigo técnico com
      // `onclick=` dentro do `title` —, e o Autor recebia "O banco recusou este
      // conteúdo" sobre conteúdo correto.

      for (const caso of ACEITES_DE_HTML) {
        const alvo = slug(`aceite-${caso.chave}`);
        const r = await escreverDireto({
          slug: alvo,
          titulo: "Conteúdo legítimo gravado direto",
          conteudo_html: caso.html,
        });
        afirmar(
          `o banco ACEITA conteúdo legítimo — ${caso.descricao}`,
          r.alcancou && r.status === 201,
          `HTTP ${r.status} ${r.corpo.slice(0, 200)}`,
        );
        if (r.status === 201) {
          await executarSql(token, `delete from public.posts where slug = ${literal(alvo)}`);
        }
      }

      /* — O CONSOLE DO PROJETO: SQL direto, o caminho que função nenhuma cobre — */

      for (const caso of RECUSAS_DE_HTML) {
        const r = await executarSql(
          token,
          `insert into public.posts (slug, titulo, conteudo_html)
           values (${literal(slug(`console-${caso.chave}`))}, 'Pelo console', ${literal(caso.html)})`,
        );
        afirmar(
          `escrita pelo console — ${caso.descricao} é recusada por ${RESTRICAO_DO_HTML}`,
          !r.ok && new RegExp(RESTRICAO_DO_HTML).test(r.erro ?? ""),
          r.ok ? "o comando PASSOU — a restrição não pega este caso" : (r.erro ?? ""),
        );
      }

      for (const caso of RECUSAS_DE_DOCUMENTO) {
        const r = await executarSql(
          token,
          `insert into public.posts (slug, titulo, conteudo)
           values (${literal(slug(`consoledoc-${caso.chave}`))}, 'Pelo console', ${literal(JSON.stringify(caso.doc))}::jsonb)`,
        );
        afirmar(
          `escrita pelo console — ${caso.descricao} é recusado por ${RESTRICAO_DO_DOCUMENTO}`,
          !r.ok && new RegExp(RESTRICAO_DO_DOCUMENTO).test(r.erro ?? ""),
          r.ok ? "o comando PASSOU — a restrição não pega este caso" : (r.erro ?? ""),
        );
      }

      // Um UPDATE também passa pela restrição — sem isto, a linha nasceria limpa
      // e seria envenenada depois.
      if (idDoPost) {
        for (const [coluna, valor, restricao] of [
          ["conteudo_html", literal('<a/onclick="alert(1)">x</a>'), RESTRICAO_DO_HTML],
          [
            "conteudo",
            `${literal('{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"x"}]}]}')}::jsonb`,
            RESTRICAO_DO_DOCUMENTO,
          ],
        ]) {
          const r = await executarSql(
            token,
            `update public.posts set ${coluna} = ${valor} where id = ${literal(idDoPost)}::uuid`,
          );
          afirmar(
            `UPDATE pelo console envenenando ${coluna} de um Post existente é recusado por ${restricao}`,
            !r.ok && new RegExp(restricao).test(r.erro ?? ""),
            r.ok ? "o UPDATE PASSOU" : (r.erro ?? ""),
          );
        }
      }

      /* — As duas implementações de "endereço permitido" concordam — */
      //
      // É a única forma de a divergência entre `enderecoPermitido` (JS, no
      // schema) e `endereco_do_post_e_permitido` (SQL, no banco) aparecer como
      // FALHA em vez de como conteúdo legítimo recusado na gravação.

      {
        const casos = CORPUS_DE_ENDERECOS.map((e) => `(${literal(e)})`).join(",");
        const veredito = await executarSql(
          token,
          `select v.e as endereco, public.endereco_do_post_e_permitido(v.e) as ok
             from (values ${casos}) as v(e)`,
        );
        const doSql = new Map(
          (veredito.dados ?? []).map((l) => [String(l.endereco), l.ok === true]),
        );
        const divergentes = CORPUS_DE_ENDERECOS.filter(
          (e) => doSql.get(e) !== enderecoPermitido(e),
        );
        afirmar(
          `as duas implementações de "endereço permitido" concordam nos ${CORPUS_DE_ENDERECOS.length} endereços do corpus`,
          veredito.ok && doSql.size === CORPUS_DE_ENDERECOS.length && divergentes.length === 0,
          veredito.ok
            ? divergentes
                .map((e) => `${JSON.stringify(e)}: js=${enderecoPermitido(e)} sql=${doSql.get(e)}`)
                .join(" | ")
            : (veredito.erro ?? ""),
        );
        // O corpus precisa ter os dois lados: só negativos, ou só positivos, e a
        // concordância seria trivial.
        const positivos = CORPUS_DE_ENDERECOS.filter((e) => enderecoPermitido(e)).length;
        afirmar(
          "o corpus de endereços tem os dois vereditos representados",
          positivos > 5 && positivos < CORPUS_DE_ENDERECOS.length - 5,
          `permitidos: ${positivos} de ${CORPUS_DE_ENDERECOS.length}`,
        );
        const nulo = await executarSql(
          token,
          `select public.endereco_do_post_e_permitido(null) as ok`,
        );
        afirmar(
          "endereço nulo é recusado nas duas implementações",
          nulo.dados?.[0]?.ok === false && enderecoPermitido(null) === false,
          JSON.stringify(nulo.dados?.[0] ?? nulo.erro),
        );
      }

      // O que sobrou no banco depois de todas as tentativas por fora: só o
      // controle positivo e os Posts que a função gravou.
      const inventario = await executarSql(
        token,
        `select coalesce(string_agg(replace(slug, ${literal(prefixo)}, ''), ',' order by slug), '') as slugs
           from public.posts where slug like ${literal(marca)}`,
      );
      const presentes = String(inventario.dados?.[0]?.slugs ?? "").split(",").filter(Boolean);
      const forasteiros = presentes.filter((s) =>
        /^(direto-|console-|consoledoc-|aceite-|pela-sessao)/.test(s),
      );
      afirmar(
        "nenhuma das escritas por fora deixou linha no banco",
        inventario.ok && forasteiros.length === 0,
        `slugs presentes: ${presentes.join(", ") || "nenhum"}`,
      );

      /* — As listas do SQL são as MESMAS listas do schema — */

      {
        // O leitor de comentários precisa acusar e absolver, como todo detector.
        afirmar(
          "o leitor de SQL apaga comentário e preserva literal",
          !semComentariosSql("-- array['fantasma']\nselect 1").includes("fantasma") &&
            semComentariosSql("select 'array[--nao-e-comentario]'").includes("nao-e-comentario"),
        );

        /* AS LISTAS SÃO LIDAS DO CATÁLOGO, não do arquivo de migração.
           Elas viveram em duas migrações diferentes ao longo desta story — a de
           proibição, superada, e as duas de permissão —, e ler o arquivo faria a
           comparação recair sobre corpo de função que não está mais em vigor. O
           `pg_get_functiondef` é a única fonte que não pode ficar velha: é o que
           o banco de fato avalia a cada gravação. */
        const definicoes = new Map();
        const defs = await executarSql(
          token,
          `select p.proname as nome, pg_get_functiondef(p.oid) as corpo
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('documento_do_post_e_permitido', 'html_do_post_e_seguro',
                                'endereco_do_post_e_permitido', 'decodificar_entidades')`,
        );
        for (const linha of defs.dados ?? []) {
          definicoes.set(String(linha.nome), semComentariosSql(String(linha.corpo)));
        }
        afirmar(
          "as quatro funções da defesa foram lidas do catálogo do projeto",
          defs.ok && definicoes.size === 4,
          defs.erro ?? `lidas: ${[...definicoes.keys()].join(", ")}`,
        );

        /* SETE listas, todas por IGUALDADE nos dois sentidos. Acrescentar ao
           código sem acrescentar ao SQL falha; o contrário também. É o que
           transforma "as duas listas são a mesma" de intenção em propriedade. */
        for (const [nome, funcao, ancora, esperada] of [
          ["nó", "documento_do_post_e_permitido", "(t.n ->> 'type') <> all", NOS_PERMITIDOS],
          ["marca", "documento_do_post_e_permitido", "(marca ->> 'type') <> all", MARCAS_PERMITIDAS],
          ["nível de título", "documento_do_post_e_permitido", "'{attrs,level}'", NIVEIS_DE_TITULO.map(String)],
          ["esquema de endereço", "endereco_do_post_e_permitido", "lower(substring(e.v from", PROTOCOLOS_DE_LINK],
          ["etiqueta", "html_do_post_e_seguro", "lower(tags.etiqueta) <> all", ETIQUETAS_EMITIDAS],
          ["nome de atributo", "html_do_post_e_seguro", "nomes.nome <> all", ATRIBUTOS_EMITIDOS],
          ["entidade nomeada", "decodificar_entidades", "nomes_de_entidade text[] :=", Object.keys(ENTIDADES_ASCII)],
        ]) {
          const corpo = definicoes.get(funcao) ?? "";
          const doSql = arrayDepoisDe(corpo, ancora);
          afirmar(
            `a lista de ${nome} do banco é EXATAMENTE a do código`,
            doSql !== null && mesmoConjunto(doSql, esperada),
            `no SQL: [${(doSql ?? []).sort().join(", ")}] | no código: [${[...esperada].sort().join(", ")}]`,
          );
        }
        const niveis = arrayDepoisDe(definicoes.get("documento_do_post_e_permitido") ?? "", "'{attrs,level}'");
        afirmar(
          "h1 não é representável: a lista de níveis do banco não contém 1",
          !(niveis ?? []).includes("1"),
          (niveis ?? []).join(", "),
        );
        /* Os dois tetos do banco existem, e o do documento é o MESMO do núcleo:
           um teto no núcleo mais frouxo que o do banco produziria recusa do
           banco sobre pedido que o núcleo aceitou — erro de defeito onde
           deveria ser erro de campo. */
        afirmar(
          "o teto de tamanho do documento no banco é o mesmo do núcleo",
          (definicoes.get("documento_do_post_e_permitido") ?? "").includes(
            `> ${TAMANHO_MAXIMO_DO_CONTEUDO}`,
          ),
          `esperado "> ${TAMANHO_MAXIMO_DO_CONTEUDO}" no corpo da função`,
        );
        afirmar(
          "o HTML também tem teto de tamanho no banco",
          /length\(coalesce\(html, ''\)\) <= \d+/.test(definicoes.get("html_do_post_e_seguro") ?? ""),
          "sem teto, a travessia de um valor gigante é o custo de cada gravação",
        );
        /* A cláusula (7) do HTML — todo `&` num valor de atributo começa uma das
           quatro sequências que o renderizador emite — é a que continua valendo
           se a lista de entidades nomeadas ficar incompleta. */
        afirmar(
          "a restrição do HTML confere a forma canônica do `&` em valor de atributo",
          /&\(amp\|lt\|gt\|quot\);/.test(definicoes.get("html_do_post_e_seguro") ?? ""),
          "sem esta cláusula, uma entidade nomeada não prevista volta a passar",
        );
        /* A migração vigente precisa DIZER o que ela não garante: as duas
           restrições conferem `conteudo` e `conteudo_html` separadamente, e nada
           liga um ao outro — pelo console dá para gravar HTML de um texto que
           ninguém escreveu. */
        {
          const arquivo = listarMigracoes().find((m) => m.rotulo === ROTULO_DA_MIGRACAO);
          const bruto = arquivo ? readFileSync(arquivo.caminho, "utf8") : "";
          afirmar(
            `a migração ${ROTULO_DA_MIGRACAO} existe e registra que NÃO amarra o HTML ao documento`,
            /separadamente/i.test(bruto) && /NÃO existe/i.test(bruto),
            arquivo
              ? "sem esse parágrafo o arquivo promete uma garantia que não tem"
              : listarMigracoes().map((m) => m.rotulo).join(", "),
          );
        }
        // As duas funções da versão de proibição foram REMOVIDAS: deixá-las
        // vivas deixaria duas listas paralelas para confundir com as vigentes.
        {
          const sobreviventes = await executarSql(
            token,
            `select coalesce(string_agg(p.proname, ',' order by p.proname), '(nenhuma)') as r
               from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('tipos_do_documento', 'endereco_e_executavel')`,
          );
          afirmar(
            "as funções da versão de PROIBIÇÃO não existem mais no projeto",
            sobreviventes.ok && String(sobreviventes.dados?.[0]?.r ?? "") === "(nenhuma)",
            sobreviventes.erro ?? String(sobreviventes.dados?.[0]?.r ?? ""),
          );
        }
      }

      /* — A DECODIFICAÇÃO: as duas implementações produzem o MESMO texto — */
      //
      // Não basta os vereditos coincidirem: os dois decodificadores precisam
      // produzir a mesma string, inclusive no caso inválido. Sem isto,
      // `htt&#99999999999;ps://x.com` daria `https://x.com` num lado e
      // `htt<controle>ps://x.com` no outro — mesmo endereço, vereditos opostos.

      {
        // O corpus é comparado DEDUPLICADO, e a razão é aritmética: ele nasce de
        // `[...CORPUS_DE_ENDERECOS, …extras]`, onde a string vazia aparece nas
        // duas metades. `doSql` é um Map — 72 chaves para 73 entradas —, então
        // comparar `size` com `length` acusava divergência que não existia, com
        // detalhe vazio porque nenhum caso divergia de fato. Uma asserção que
        // falha sem apontar nada é a que ensina a ignorar asserções.
        const unicos = [...new Set(CORPUS_DE_ENTIDADES)];
        const casos = unicos.map((e) => `(${literal(e)})`).join(",");
        const r = await executarSql(
          token,
          `select v.e as entrada, public.decodificar_entidades(v.e) as saida
             from (values ${casos}) as v(e)`,
        );
        const doSql = new Map((r.dados ?? []).map((l) => [String(l.entrada), String(l.saida)]));
        const divergentes = unicos.filter(
          (e) => doSql.get(e) !== decodificarEntidades(e),
        );
        const faltando = unicos.filter((e) => !doSql.has(e));
        afirmar(
          `as duas decodificações produzem o mesmo texto nos ${unicos.length} casos do corpus`,
          r.ok && faltando.length === 0 && divergentes.length === 0,
          r.ok
            ? [
                ...divergentes.map(
                  (e) =>
                    `${JSON.stringify(e)}: js=${JSON.stringify(decodificarEntidades(e))} sql=${JSON.stringify(doSql.get(e))}`,
                ),
                ...(faltando.length > 0
                  ? [`sem resposta do SQL: ${faltando.map((e) => JSON.stringify(e)).join(", ")}`]
                  : []),
              ].join(" | ")
            : (r.erro ?? ""),
        );
        // Uma passagem, como o navegador: `&amp;#106;` é o TEXTO `&#106;`, e não
        // a letra `j`. Decodificar em laço recusaria endereço legítimo.
        afirmar(
          "a decodificação é de UMA passagem nos dois lados",
          decodificarEntidades("&amp;#106;") === "&#106;" &&
            doSql.get("&amp;#106;") === "&#106;",
          `js=${JSON.stringify(decodificarEntidades("&amp;#106;"))} sql=${JSON.stringify(doSql.get("&amp;#106;"))}`,
        );
      }

      /* — O CONTROLE POSITIVO da decodificação: `&amp;` legítimo continua vivo — */
      //
      // Sem esta metade, a correção da entidade poderia ter sido "recuse tudo o
      // que tem `&`" e as asserções de ataque ficariam verdes enquanto todo link
      // com parâmetros era recusado.

      {
        const legitimos = [
          "/x?a=1&b=2",
          "/x?a=1&bloco=2",
          "https://x.com/a?b=1&c=2&d=3",
          "mailto:oi@chatclean.com.br?subject=Oi&body=x",
          "/x#a&b",
        ];
        const aceitosNoJs = legitimos.filter((h) => enderecoPermitido(h));
        afirmar(
          "endereço legítimo com `&` em parâmetro continua aceito pelo schema",
          aceitosNoJs.length === legitimos.length,
          `recusados: ${legitimos.filter((h) => !enderecoPermitido(h)).join(", ")}`,
        );
        // E o HTML DERIVADO deles é aceito pelo banco: o renderizador escapa o
        // `&`, então a cláusula da forma canônica nunca dispara sobre ele.
        const html = derivarHtml({
          type: "doc",
          content: legitimos.map((href) => ({
            type: "paragraph",
            content: [{ type: "text", marks: [{ type: "link", attrs: { href } }], text: "x" }],
          })),
        });
        const veredito = await executarSql(
          token,
          `select public.html_do_post_e_seguro(${literal(html.html)}) as h,
                  public.documento_do_post_e_permitido(${literal(JSON.stringify(html.documento))}::jsonb) as c`,
        );
        afirmar(
          "o HTML derivado de endereços com `&` é aceito pelas DUAS restrições",
          veredito.dados?.[0]?.h === true && veredito.dados?.[0]?.c === true,
          `html=${veredito.dados?.[0]?.h} documento=${veredito.dados?.[0]?.c} | ${html.html.slice(0, 160)}`,
        );
        afirmar(
          "e o `&` sai escapado no HTML derivado (é por isso que a cláusula não dispara)",
          html.html.includes("&amp;") && !/href="[^"]*&(?!amp;)/.test(html.html),
          html.html.slice(0, 200),
        );
      }

      /* — As restrições existem no catálogo, e são CHECK sobre posts — */

      {
        const catalogo = await executarSql(
          token,
          `select coalesce(string_agg(c.conname || ':' || c.contype::text, ',' order by c.conname), '') as r
             from pg_constraint c
             join pg_class t on t.oid = c.conrelid
             join pg_namespace n on n.oid = t.relnamespace
            where n.nspname = 'public' and t.relname = 'posts'
              and c.conname in ('posts_conteudo_no_vocabulario', 'posts_conteudo_html_seguro')`,
        );
        const encontrado = String(catalogo.dados?.[0]?.r ?? "");
        afirmar(
          "as duas restrições existem em public.posts, como CHECK",
          encontrado.includes("posts_conteudo_no_vocabulario:c") &&
            encontrado.includes("posts_conteudo_html_seguro:c"),
          encontrado || (catalogo.erro ?? "nenhuma"),
        );
      }

      /* — As funções da restrição não são RPC pública — */

      {
        const privilegio = await executarSql(
          token,
          `select coalesce(string_agg(p.proname || ':' || papel, ', ' order by p.proname, papel), '(nenhum)') as r
             from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
             cross join unnest(array['anon','authenticated','public']) as papel
            where n.nspname = 'public'
              and p.proname in ('nos_do_documento','endereco_do_post_e_permitido',
                                'documento_do_post_e_permitido','html_do_post_e_seguro',
                                'caractere_do_ponto','decodificar_entidades')
              and has_function_privilege(papel, p.oid, 'execute')`,
        );
        afirmar(
          "nenhuma função da restrição é executável por anon, authenticated ou public",
          privilegio.ok && String(privilegio.dados?.[0]?.r ?? "") === "(nenhum)",
          privilegio.erro ?? String(privilegio.dados?.[0]?.r ?? ""),
        );
      }

      /* — A RLS continua negando escrita a quem tem sessão do Painel — */
      //
      // A função é o único caminho: se `authenticated` pudesse escrever, ela
      // seria um caminho entre dois.

      if (contas[0].jwt) {
        let resposta = { status: 0, corpo: "" };
        try {
          const r = await fetch(`${URL_PROJETO}/rest/v1/posts`, {
            method: "POST",
            signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: {
              apikey: chaves.publicavel,
              Authorization: `Bearer ${contas[0].jwt}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ slug: slug("pela-sessao"), titulo: "Pela sessão do Painel" }),
          });
          resposta = { status: r.status, corpo: sanitizar(await r.text()) };
        } catch (erro) {
          resposta = { status: 0, corpo: String(erro?.message ?? erro) };
        }
        afirmar(
          "uma Conta autenticada continua SEM poder escrever direto — a função é o único caminho",
          resposta.status === 401 ||
            resposta.status === 403 ||
            (resposta.status >= 400 &&
              resposta.status < 500 &&
              /42501|permission denied|row-level security/i.test(resposta.corpo)),
          `HTTP ${resposta.status} ${resposta.corpo.slice(0, 160)}`,
        );
      } else {
        adiar("uma Conta autenticada continua sem poder escrever direto", MOTIVO_SEM_SESSAO);
      }

      if (!abriuSessao) {
        nota("parte das asserções desta seção ficou sem exercício: ver as linhas ADIADA acima.");
      }
    } finally {
      // Remoção incondicional: asserção que falha no meio não pode deixar Post
      // de teste nem Conta temporária num projeto de produção.
      limpeza = await executarSql(
        token,
        [
          `delete from public.posts where slug like ${literal(marca)}`,
          // Pelo MESMO SQL do `conta:remover`, e não por um `delete` escrito
          // aqui: a Conta de teste sai pelo caminho que uma Conta real sai.
          ...contas.map((conta) => sqlDeRemocaoDeConta(conta.email)),
          // Rede de segurança para a Conta cuja criação ficou pela metade.
          `delete from auth.users where email like ${literal(`verificacao.escrita+${nonce}-%@chatclean.com.br`)}`,
        ].join(";\n"),
      );
    }

    afirmar("a semeadura foi removida do projeto", Boolean(limpeza?.ok), limpeza?.erro ?? "");

    const sobrou = await executarSql(
      token,
      `select
         (select count(*)::int from public.posts where slug like ${literal(marca)}) as posts,
         (select count(*)::int from auth.users where email like ${literal(`verificacao.escrita+${nonce}-%@chatclean.com.br`)}) as contas`,
    );
    const linha = sobrou.ok ? (sobrou.dados?.[0] ?? null) : null;
    afirmar(
      "nenhum resíduo da prova comportamental ficou no projeto",
      linha !== null && Number(linha.posts) === 0 && Number(linha.contas) === 0,
      linha ? `posts: ${linha.posts} | contas: ${linha.contas}` : (sobrou.erro ?? ""),
    );
  }
}

/* ─── Veredito ───────────────────────────────────────────────────────────── */

/* ADIADA NÃO SAI COM CÓDIGO 0.
   A versão anterior imprimia o aviso e saía 0: o limite de taxa do GoTrue podia
   deixar a garantia INTEIRA sem exercício — nenhuma sessão real, nenhuma prova de
   autoria, nenhuma escrita contra o banco — e a suíte passava. Uma verificação
   cujo verde não distingue "provado" de "não pôde provar" não verifica nada, e a
   ferramenta da Story 2.2 já pagou esse preço. O código 2 diz "não é falha do
   produto, mas também não é aprovação". */
console.log("");
if (adiadas > 0) {
  console.log(
    `ATENÇÃO: ${adiadas} asserção(ões) NÃO foram exercidas (limite de taxa do GoTrue). Rode de novo em alguns minutos para cobri-las.`,
  );
}
if (falhas > 0) {
  console.log(`Escrita NÃO verificada: ${falhas} asserção(ões) falharam.`);
  process.exitCode = 1;
} else if (adiadas > 0) {
  console.log(
    `Escrita NÃO verificada: nenhuma falha, mas ${adiadas} asserção(ões) ficaram sem exercício — verde aqui significaria "provado", e não foi.`,
  );
  process.exitCode = 2;
} else {
  console.log("Escrita verificada: todas as asserções passaram.");
  process.exitCode = 0;
}

});
