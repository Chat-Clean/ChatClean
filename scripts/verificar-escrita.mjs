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
  PADRAO_DE_UUID,
  problemaNaUrl,
  totalDaFaixa,
  VARIAVEIS,
} from "../api/_nucleo/acesso.js";
/* A agregação embutida do lado da LEITURA. As duas — faixa e agregação —
   respondem à mesma pergunta em camadas diferentes, e as duas precisam recusar
   inventar zero: é o zero que a tela lê como "pode excluir". */
import { totalEmbutido } from "../src/data/blog/taxonomia.js";
import {
  CAMPOS_ACEITOS,
  CAMPOS_IGNORADOS,
  classificar,
  ERRO_CONFLITO,
  ERRO_DADOS_INVALIDOS,
  lerCorpo,
  LIMITE_DE_IGNORADOS,
  MARGEM_DE_RELOGIO_MS,
  PADRAO_UUID,
  salvarPost,
  TAMANHO_MAXIMO_DO_CONTEUDO,
  TIPOS_DE_ERRO,
} from "../api/_nucleo/salvarPost.js";
/* As operações da Story 2.12 — excluir e alternar Destaque — moram fora de
   `salvarPost.js` e são chamadas pelo MESMO invólucro. Elas são importadas e
   executadas aqui pela mesma razão que o núcleo: uma função que existe não é
   uma função que faz o que a story diz. */
import { definirDestaque, excluirPost } from "../api/_nucleo/operacoesDoPost.js";
/* O invólucro INTEIRO, e não só as peças dele: sem o export padrão, o
   despacho — a linha que escolhe qual executor roda — nunca é exercitado, e
   trocá-lo por uma chamada fixa a `salvarPost` deixaria excluir virar salvar
   com a suíte verde. */
import handler from "../api/posts.js";
import {
  CODIGO_HTTP,
  corpoComoObjeto,
  EXECUTORES,
  executorDe,
  RECUSA_SEM_CREDENCIAL,
  respostaDeErro,
  tokenDoCabecalho,
} from "../api/posts.js";
/* O vocabulário FECHADO das operações. Ele vem do domínio, e o cliente e o
   servidor importam o mesmo módulo — comparar duas listas escritas em lugares
   diferentes é justamente o que este arquivo existe para evitar. */
import {
  ehOperacao,
  OPERACAO_DESTACAR,
  OPERACAO_EXCLUIR,
  OPERACAO_EXCLUIR_CATEGORIA,
  OPERACAO_PADRAO,
  OPERACAO_SALVAR,
  OPERACAO_SALVAR_CATEGORIA,
  OPERACOES,
  operacaoPedida,
} from "../src/domain/blog/operacoes.js";
/* As operações de Categoria da Story 2.14, IMPORTADAS e executadas. */
import {
  CAMPOS_DA_CATEGORIA,
  excluirCategoria,
  fraseDeCategoriaEmUso,
  lerCorpoDaCategoria,
  ORDEM_MAXIMA_DA_CATEGORIA,
  salvarCategoria,
} from "../api/_nucleo/operacoesDaCategoria.js";
/* Os vocabulários fechados de cor e de ícone, e as regras da Tag digitada — os
   MESMOS módulos que a tela usa. */
import {
  CHAVES_DE_ICONE_DE_CATEGORIA,
  CORES_DE_CATEGORIA,
  COR_PADRAO,
  ICONE_PADRAO,
} from "../src/domain/blog/categorias.js";
import { chaveDaTag, separarTags } from "../src/domain/blog/tags.js";
/* O cliente da porta única. Ele importa em Node — a configuração do Supabase é
   lida com guarda e a falta dela vira erro TIPADO, não exceção —, e é isso que
   permite executar as recusas dele aqui em vez de lê-las. */
import * as clienteDaEscrita from "../src/data/blog/escrita.js";
/* O formato de identificador do CLIENTE, para ser comparado com os dois do
   servidor: três cópias da mesma regra é o que o cabeçalho de
   `operacoesDoPost.js` argumenta contra em outro assunto. */
import { ehUuid } from "../src/data/blog/comum.js";
/* As guardas de voz do Painel. As frases de falha do CLIENTE passam por elas
   — uma frase que diz \"tente salvar de novo\" a quem tentou excluir é a
   mesma classe de defeito que \"algo deu errado\". */
import { diagnosticarMensagem } from "../src/admin/shell/voz.js";
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
  MENSAGENS_DE_LEITURA,
} from "../src/data/blog/resultado.js";
/* A máquina de transições da Story 2.8, IMPORTADA. As asserções de transição
   comparam o que o núcleo faz com o que ela declara — reescrever a tabela aqui
   faria a comparação ser entre duas cópias do mesmo engano. */
import { ESTADOS } from "../src/domain/blog/estados.js";
import {
  ACAO_PUBLICAR,
  acoesDoEstado,
  ESTADO_INICIAL,
  EXIGE_DATA_DE_PUBLICACAO,
  transicaoPermitida,
} from "../src/domain/blog/transicoes.js";
/* O fuso do negócio vem do DOMÍNIO, e as conversões da Story 2.9 são feitas por
   ele — escrever `-03:00` aqui produziria uma asserção que aprova o dia em que
   a regra de fuso mudar e o produto quebrar. */
import {
  deCampoDeInstante,
  formatarDataEHoraPorExtenso,
  FUSO_DE_APRESENTACAO,
  paraCampoDeInstante,
} from "../src/domain/blog/formato.js";

let falhas = 0;
let adiadas = 0;

const CAMINHO_RENDERIZADOR = "src/render/blog/paraHtml.js";
const CAMINHO_NUCLEO = "api/_nucleo/salvarPost.js";
const CAMINHO_ACESSO = "api/_nucleo/acesso.js";
const CAMINHO_INVOLUCRO = "api/posts.js";
/* Story 2.12: o vocabulário das operações e as duas operações novas. */
const CAMINHO_OPERACOES = "src/domain/blog/operacoes.js";
const CAMINHO_OPERACOES_DO_POST = "api/_nucleo/operacoesDoPost.js";
const CAMINHO_CLIENTE_DA_ESCRITA = "src/data/blog/escrita.js";
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
  /* Story 2.12: a leitura do perfil falhando por REDE — ramo distinto de
     "conta sem perfil", e o único em que a frase da indisponibilidade vale. */
  respostaDoPerfil = null,
  // Story 2.6: quem é o dono do endereço, entre os ativos e entre os
  // aposentados. `null` significa "ninguém", que é o caso comum.
  donoAtivo = null,
  donoAposentado = null,
  respostaDaAposentadoria = null,
  respostaDasTags = null,
  /* Story 2.14. As Tags chegam por NOME: o acesso finge o que já existe (por
     slug) e registra o que seria criado. `tagsExistentes` é a lista de linhas
     de `tags` que o banco já tem. */
  tagsExistentes = [],
  respostaDaLeituraDeTags = null,
  respostaDaCriacaoDeTags = null,
  /* E as Categorias. `categoria` é a linha que `lerCategoria` devolve;
     `donoDoNome` e `donoDoSlug` são as colisões que a recusa precisa nomear. */
  categoria = null,
  donoDoNome = null,
  donoDoSlug = null,
  postsDaCategoria = 0,
  respostaDaContagem = null,
  respostaDaEscritaDeCategoria = null,
  respostaDaExclusaoDeCategoria = null,
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
    /* As ESCRITAS incluem a aposentadoria e as tags: as duas gravam, e uma
       recusa que chamasse qualquer uma delas teria gravado. Contar só o
       `insert` e o `update` deixaria a asserção "nada foi gravado" verdadeira
       sobre uma linha nova em `slugs_antigos`. */
    escritas: () =>
      chamadas.filter((c) =>
        [
          "inserirPost",
          "atualizarPost",
          "aposentarSlug",
          "definirTags",
          /* Story 2.14: as três escritas novas. Deixá-las de fora faria "nada
             foi gravado" ser verdadeiro sobre uma Categoria recém-criada. */
          "inserirTags",
          "inserirCategoria",
          "atualizarCategoria",
          "excluirCategoria",
        ].includes(c.nome),
      ),
    contaDoToken(token) {
      reg("contaDoToken", [token]);
      if (respostaDoToken) return respostaDoToken;
      return { ok: true, status: 200, dados: conta };
    },
    perfilDaConta(id) {
      reg("perfilDaConta", [id]);
      if (respostaDoPerfil) return respostaDoPerfil;
      return { ok: true, status: 200, dados: perfil };
    },
    lerPost(id) {
      reg("lerPost", [id]);
      return { ok: true, status: 200, dados: post };
    },
    postPorSlug(slug) {
      reg("postPorSlug", [slug]);
      const achou = donoAtivo !== null && donoAtivo.slug === slug ? donoAtivo : null;
      return { ok: true, status: 200, dados: achou };
    },
    slugAposentado(slug) {
      reg("slugAposentado", [slug]);
      const achou =
        donoAposentado !== null && donoAposentado.slug === slug ? donoAposentado : null;
      return { ok: true, status: 200, dados: achou };
    },
    aposentarSlug(id, slugNovo) {
      reg("aposentarSlug", [{ id, slugNovo }]);
      return respostaDaAposentadoria ?? { ok: true, status: 200, dados: post?.slug ?? null };
    },
    definirTags(id, tags) {
      reg("definirTags", [{ id, tags }]);
      return respostaDasTags ?? { ok: true, status: 200, dados: tags.length };
    },
    inserirPost(campos) {
      return escrever("inserirPost", campos);
    },
    atualizarPost(id, campos) {
      reg("idAtualizado", [id]);
      return escrever("atualizarPost", campos);
    },

    /* ─── Story 2.14: Tags por nome ─────────────────────────────────────── */

    inserirTags(linhas) {
      reg("inserirTags", [linhas]);
      if (respostaDaCriacaoDeTags) return respostaDaCriacaoDeTags;
      /* O banco IGNORA duplicata e devolve só as inseridas. O dublê imita isso
         acrescentando as que ainda não existiam à lista do "banco". */
      const criadas = [];
      for (const linha of linhas) {
        if (tagsExistentes.some((t) => t.slug === linha.slug)) continue;
        const nova = { id: randomUUID(), nome: linha.nome, slug: linha.slug };
        tagsExistentes.push(nova);
        criadas.push(nova);
      }
      return { ok: true, status: 201, dados: criadas };
    },
    tagsPorSlugs(slugs) {
      reg("tagsPorSlugs", [slugs]);
      if (respostaDaLeituraDeTags) return respostaDaLeituraDeTags;
      return {
        ok: true,
        status: 200,
        dados: tagsExistentes.filter((t) => slugs.includes(t.slug)),
      };
    },

    /* ─── Story 2.14: Categorias ────────────────────────────────────────── */

    lerCategoria(id) {
      reg("lerCategoria", [id]);
      return { ok: true, status: 200, dados: categoria };
    },
    categoriaPorNome(nome) {
      reg("categoriaPorNome", [nome]);
      const achou = donoDoNome !== null && donoDoNome.nome === nome ? donoDoNome : null;
      return { ok: true, status: 200, dados: achou };
    },
    categoriaPorSlug(slug) {
      reg("categoriaPorSlug", [slug]);
      const achou = donoDoSlug !== null && donoDoSlug.slug === slug ? donoDoSlug : null;
      return { ok: true, status: 200, dados: achou };
    },
    contarPostsDaCategoria(id) {
      reg("contarPostsDaCategoria", [id]);
      return (
        respostaDaContagem ?? {
          ok: true,
          status: 200,
          faixa: `0-0/${postsDaCategoria}`,
          dados: { total: postsDaCategoria },
        }
      );
    },
    inserirCategoria(campos) {
      reg("inserirCategoria", [campos]);
      return (
        respostaDaEscritaDeCategoria ?? {
          ok: true,
          status: 201,
          dados: { id: randomUUID(), ...campos },
        }
      );
    },
    atualizarCategoria(id, campos) {
      reg("atualizarCategoria", [{ id, campos }]);
      return (
        respostaDaEscritaDeCategoria ?? {
          ok: true,
          status: 200,
          dados: { ...(categoria ?? { id }), ...campos },
        }
      );
    },
    excluirCategoria(id) {
      reg("excluirCategoria", [id]);
      return (
        respostaDaExclusaoDeCategoria ?? {
          ok: true,
          status: 200,
          dados: categoria ?? { id },
        }
      );
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

/* O ROTEAMENTO de `vercel.json` é propriedade da Story 4.1, e continua sendo:
   nada aqui pode ter posto um destino, um redirecionamento ou uma função na
   frente de rota. O que a Story 2.13 acrescentou foi `headers` — cabeçalho de
   resposta que declara `noindex` para `/admin`, e que ANOTA a resposta em vez
   de interceptá-la. Ele tem dono próprio: `verificar:acesso` prova o conjunto
   do que alcança `/admin`, prova que o `noindex` não encosta no site público, e
   enumera por lista de permissão as superfícies onde algo pode ficar na frente
   de uma rota. Aqui a guarda continua sendo a do roteamento. */
{
  const vercel = tentar("vercel.json legível", () => JSON.parse(ler("vercel.json")), null);
  /* A LISTA É DE PERMISSÃO, e continua fechada por construção — como era
     quando dizia `Object.keys().length === 1`. Enumerar o que é PROIBIDO
     (`routes`, `redirects`, `functions`…) deixaria passar a chave que ninguém
     pensou ainda, que é exatamente a regra 3 do projeto invertida. */
  const CHAVES_PERMITIDAS = ["headers", "rewrites"];
  const chaves = Object.keys(vercel ?? {}).sort();
  afirmar(
    "vercel.json declara exatamente as chaves permitidas — nenhum roteamento entrou (isso é da Story 4.1)",
    vercel !== null &&
      JSON.stringify(chaves) === JSON.stringify([...CHAVES_PERMITIDAS].sort()),
    `chaves: ${chaves.join(", ") || "nenhuma"} | permitidas: ${CHAVES_PERMITIDAS.join(", ")}`,
  );
  afirmar(
    "e a reescrita continua sendo a apanha-tudo que serve o documento da aplicação, sozinha",
    Array.isArray(vercel?.rewrites) &&
      vercel.rewrites.length === 1 &&
      vercel.rewrites[0]?.source === "/(.*)" &&
      vercel.rewrites[0]?.destination === "/index.html",
    JSON.stringify(vercel?.rewrites),
  );
  /* `headers` entrou na Story 2.13 e ANOTA a resposta em vez de interceptá-la.
     O conteúdo dele tem dono próprio: `verificar:acesso` prova o conjunto do
     que alcança `/admin`, que o `noindex` não encosta no site público, e
     enumera por lista de permissão as superfícies de entrega. Aqui basta que
     ele não vire roteamento por outro nome. */
  const comDestino = (vercel?.headers ?? []).filter(
    (g) => Object.hasOwn(g, "destination") || Object.hasOwn(g, "dest"),
  );
  afirmar(
    "e nenhum grupo de cabeçalhos carrega destino — cabeçalho anota a resposta, não redireciona ninguém",
    comDestino.length === 0,
    JSON.stringify(comDestino),
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
  /* `destaque` entrou nesta lista na Story 2.12, e pelo mesmo motivo dos três
     primeiros: é COLUNA que a porta escreve, mas só pela operação `destacar`.
     Sem ele aqui, um salvamento que o traga — o Editor devolvendo ao servidor
     um Post que leu do banco — cairia no relatório genérico de campo
     desconhecido em vez de ser nomeado. */
  for (const campo of ["conteudo_html", "autor_id", "autor_nome", "destaque"]) {
    afirmar(
      `\`${campo}\` está declarado como ignorado, com nome`,
      CAMPOS_IGNORADOS.includes(campo),
      CAMPOS_IGNORADOS.join(", "),
    );
  }
  /* E `operacao` é ACEITO sem ser campo do Post: ele diz qual operação está
     sendo pedida, e quem o lê é o invólucro. Está na lista para NÃO ser
     relatado como ignorado — sem isso, toda gravação avisaria o Autor de que
     descartou um campo que o próprio Painel manda de propósito. */
  afirmar(
    "`operacao` é ACEITO e não ignorado — ele é o que escolhe a operação, não um campo descartado",
    CAMPOS_ACEITOS.includes("operacao") && !CAMPOS_IGNORADOS.includes("operacao"),
    `aceitos: ${CAMPOS_ACEITOS.join(", ")} | ignorados: ${CAMPOS_IGNORADOS.join(", ")}`,
  );
  for (const campo of ["categoria_id", "tags", "publicado_em", "tempo_leitura"]) {
    afirmar(
      `\`${campo}\` é ACEITO — é metadado da gaveta da Story 2.6`,
      CAMPOS_ACEITOS.includes(campo) && !CAMPOS_IGNORADOS.includes(campo),
      CAMPOS_ACEITOS.join(", "),
    );
  }
  /* `estado` SAIU dos ignorados na Story 2.8 — e "aceito" aqui não é o mesmo
     que aceito para os metadados da 2.6. A data é dado que o Autor preenche e
     que o servidor grava como veio; o Estado é PEDIDO de transição, conferido
     contra o que já está gravado. As asserções de comportamento adiante é que
     provam a diferença; esta só registra que o campo deixou de ser ignorado em
     um lugar e não no outro. */
  afirmar(
    "`estado` é ACEITO e não ignorado — a transição da Story 2.8 passa por aqui",
    CAMPOS_ACEITOS.includes("estado") && !CAMPOS_IGNORADOS.includes("estado"),
    `aceitos: ${CAMPOS_ACEITOS.join(", ")} | ignorados: ${CAMPOS_IGNORADOS.join(", ")}`,
  );
  afirmar(
    "nenhum campo aparece nas duas listas ao mesmo tempo",
    !CAMPOS_ACEITOS.some((c) => CAMPOS_IGNORADOS.includes(c)),
  );

  /* A TABELA DE TRANSIÇÕES NÃO É REESCRITA AQUI.
     O núcleo consulta a máquina do domínio — a mesma que a tela consulta — e
     não declara Estado como chave de objeto em lugar nenhum. Uma segunda tabela
     no servidor divergiria da barra de ações na primeira mudança, e a
     divergência apareceria como botão que falha ou como caminho que a barra
     esconde e o servidor aceita. */
  const comandos = nucleo.slice(nucleo.indexOf("async function gravar"));
  afirmar(
    "o núcleo importa a máquina de transições do domínio, e não tem tabela própria",
    /from "\.\.\/\.\.\/src\/domain\/blog\/transicoes\.js"/.test(nucleo) &&
      /transicaoPermitida\(/.test(comandos) &&
      !ESTADOS.some((estado) => new RegExp(`["']${estado}["']\\s*:`).test(nucleo)),
    ESTADOS.filter((estado) => new RegExp(`["']${estado}["']\\s*:`).test(nucleo)).join(", ") ||
      "nenhum Estado usado como chave de objeto",
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
  /* A SAÍDA ATRAVESSA O INVÓLUCRO (Story 2.9). `detalhe` fica no log porque é
     diagnóstico; `alternativa` sai porque é para a TELA agir. Se ela ficasse
     pelo caminho, a recusa chegaria como uma frase que menciona publicar agora
     e um botão que não existe — o beco de volta, pela porta de trás. */
  afirmar(
    "a saída oferecida (`alternativa`) atravessa o invólucro, e só aparece quando existe",
    (() => {
      const com = respostaDeErro({
        tipo: ERRO_DADOS_INVALIDOS,
        mensagem: "frase",
        detalhe: "d",
        alternativa: ACAO_PUBLICAR,
      });
      const sem = respostaDeErro({ tipo: ERRO_PERMISSAO, mensagem: "frase", detalhe: "d" });
      return (
        com.erro.alternativa === ACAO_PUBLICAR &&
        !Object.hasOwn(sem.erro, "alternativa")
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
    "criação sem nada reporta os QUATRO campos obrigatórios de uma vez",
    tudoAusente.ok === false &&
      mesmoConjunto(tudoAusente.faltando, ["titulo", "slug", "resumo", "conteudo"]),
    JSON.stringify(tudoAusente.faltando),
  );

  const resumoLongo = lerCorpo(
    { titulo: "t", slug: "s", resumo: "x".repeat(5000), conteudo: DOCUMENTO_COMPLETO },
    { criando: true },
  );
  afirmar(
    "resumo acima do teto é recusado, com a frase dizendo para encurtar",
    resumoLongo.ok === false && /resumo passa de/i.test(resumoLongo.mensagem),
    resumoLongo.ok ? "passou" : resumoLongo.mensagem,
  );

  /* O RESUMO PASSOU A SER OBRIGATÓRIO (Story 2.6), e isso REVERTE o
     comportamento que a 2.5 tinha acabado de introduzir: lá, `resumo: null`
     limpava o campo. O critério de aceite desta story diz que Título e Resumo
     são obrigatórios e que o campo que falta é INDICADO — então apagar o resumo
     deixaria o Post num estado que a tela não consegue criar. As três formas de
     "vazio" caem no mesmo lugar, e todas nomeiam o campo. */
  for (const [comoVeio, valor] of [
    ["nulo", null],
    ["string vazia", ""],
    ["só espaços", "   "],
  ]) {
    const r = lerCorpo(
      { titulo: "t", slug: "s", resumo: valor, conteudo: DOCUMENTO_COMPLETO },
      { criando: true },
    );
    afirmar(
      `resumo ${comoVeio} é "falta preencher", e a resposta NOMEIA o campo`,
      r.ok === false && mesmoConjunto(r.faltando, ["resumo"]),
      r.ok ? "passou" : JSON.stringify(r.faltando),
    );
  }
  afirmar(
    "resumo AUSENTE na edição preserva o que está gravado (não é falta)",
    (() => {
      const r = lerCorpo(
        { titulo: "t", conteudo: DOCUMENTO_COMPLETO },
        { criando: false },
      );
      return r.ok === true && !Object.hasOwn(r.campos, "resumo");
    })(),
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
    const r = lerCorpo(
      { titulo: "t", slug: "s", resumo: "r", conteudo: largo },
      { criando: true },
    );
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
    const corpo = { titulo: "t", slug: "s", resumo: "r", conteudo: DOCUMENTO_COMPLETO };
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

/* ─── (c4) A máquina de transições, executada ────────────────────────────── */

secao("(c4) a máquina de transições: a tabela única que os dois lados consultam");

{
  /* A REGRA MAIS FORTE DA STORY, afirmada sobre a tabela executada.
     Um Post publicado tem endereço divulgado: voltar para rascunho o faria
     sumir sem deixar rastro para quem já tinha o link. A saída é arquivar, que
     tira do ar preservando o registro. */
  const dePublicado = acoesDoEstado("publicado");
  afirmar(
    "de `publicado` NENHUMA ação leva de volta a rascunho ou a agendado",
    dePublicado.every((acao) => !["rascunho", "agendado"].includes(acao.destino)) &&
      transicaoPermitida("publicado", "rascunho") === false &&
      transicaoPermitida("publicado", "agendado") === false,
    dePublicado.map((a) => `${a.chave}→${a.destino}`).join(", "),
  );
  afirmar(
    "e de `publicado` só existem salvar e arquivar — nem mais, nem menos",
    mesmoConjunto(
      dePublicado.map((a) => a.chave),
      ["salvar", "arquivar"],
    ),
    dePublicado.map((a) => a.chave).join(", "),
  );

  /* Todo Estado tem uma ação `salvar` cujo destino é ele mesmo: é o que faz
     "salvar não é transição" ser propriedade da tabela, e não comentário. */
  afirmar(
    "todo Estado sabe salvar sem mudar de Estado",
    ESTADOS.every((estado) => {
      const salvar = acoesDoEstado(estado).find((a) => a.chave === "salvar");
      return salvar !== undefined && salvar.destino === estado;
    }),
    ESTADOS.map((e) => `${e}: ${acoesDoEstado(e).find((a) => a.chave === "salvar")?.destino}`).join(", "),
  );
  afirmar(
    "todo destino declarado é um Estado do vocabulário fechado",
    ESTADOS.every((estado) =>
      acoesDoEstado(estado).every((acao) => ESTADOS.includes(acao.destino)),
    ),
  );
  afirmar(
    "cancelar agendamento é a ÚNICA volta a rascunho, e ela vem de agendado",
    ESTADOS.filter((estado) =>
      acoesDoEstado(estado).some((a) => a.destino === "rascunho" && estado !== "rascunho"),
    ).join(",") === "agendado",
    ESTADOS.filter((estado) =>
      acoesDoEstado(estado).some((a) => a.destino === "rascunho" && estado !== "rascunho"),
    ).join(", ") || "nenhum",
  );

  // Estado desconhecido FALHA ALTO na consulta de ações — quem vai desenhar não
  // pode receber lista vazia e mostrar uma barra sem botão nenhum.
  afirmar(
    "pedir as ações de um Estado inventado lança, em vez de devolver lista vazia",
    (() => {
      try {
        acoesDoEstado("no ar");
        return false;
      } catch {
        return true;
      }
    })(),
  );
  /* E a PERGUNTA de transição não lança: quem pergunta é o servidor, sobre
     valor que veio de fora, e exceção ali viraria 500 sem tipo. */
  afirmar(
    "perguntar se uma transição inventada é permitida responde `false`, sem lançar",
    tentar(
      "transicaoPermitida com lixo",
      () =>
        transicaoPermitida("no ar", "publicado") === false &&
        transicaoPermitida("publicado", null) === false &&
        transicaoPermitida(undefined, undefined) === false,
      false,
    ),
  );
  afirmar(
    "o Estado inicial da máquina é o padrão da coluna: rascunho",
    ESTADO_INICIAL === "rascunho",
    ESTADO_INICIAL,
  );

  /* ARQUIVAR NÃO APAGA — e a prova mais forte disso é que o caminho de escrita
     não sabe apagar. Não há verbo de remoção no núcleo nem no transporte. */
  const acessoLido = mascararComentariosJs(tentar(`${CAMINHO_ACESSO} legível`, () => ler(CAMINHO_ACESSO), ""));
  const nucleoLido = mascararComentariosJs(tentar(`${CAMINHO_NUCLEO} legível`, () => ler(CAMINHO_NUCLEO), ""));
  const remocao = /"DELETE"|'DELETE'|apagarPost|excluirPost|removerPost|\/rest\/v1\/rpc\/apagar/;
  afirmar(
    "arquivar não pode apagar: o núcleo da GRAVAÇÃO não tem verbo de remoção nenhum",
    !remocao.test(nucleoLido),
    (remocao.exec(nucleoLido) ?? [])[0] ?? "",
  );
  afirmar(
    "e o detector de remoção acusa uma chamada real",
    remocao.test(`metodo: ${'"DELETE"'}`),
  );
  /* ─── A FRONTEIRA MUDOU NA STORY 2.12, e não afrouxou ────────────────────
     Apagar passou a existir — mas fora do caminho de salvar, numa operação com
     nome próprio, alcançável só pelo vocabulário fechado.

     ─── E A CONFERÊNCIA É LISTA DE PERMISSÃO, não de proibição ───────────
     A primeira versão desta asserção contava ocorrências de um literal:
     `/metodo:\s*"DELETE"/g === 1`. Isso é lista de proibição de uma forma só,
     e escapa com aspas simples, template, método guardado em variável, ou um
     `apagarPost` que chame RPC — exatamente a evasão que a regra 3 do projeto
     proíbe. Agora o que se declara é o CONJUNTO das remoções que existem e a
     quem elas pertencem, e qualquer forma de remoção fora dele é acusada. */

  {
    /**
     * Toda remoção que um transporte pode emitir, em qualquer forma.
     *
     * Cada entrada é `[rótulo, padrão]`, e o padrão cobre a forma escrita E as
     * variações que a fariam passar despercebida: aspas de qualquer tipo,
     * método em variável, verbo em minúsculas, e chamada de função de banco
     * com nome de remoção.
     */
    const FORMAS_DE_REMOCAO = Object.freeze([
      ["método DELETE em literal", /['"`]delete['"`]/i],
      ["método DELETE sem aspas", /\bmetodo\s*:\s*[A-Za-z_$][\w$]*\b/],
      ["nome de remoção", /\b(apagar|remover|excluir|deletar)[A-Za-z]*\s*\(/i],
      ["função de banco de remoção", /rpc\/[a-z_]*(apagar|remover|excluir|deletar)/i],
      ["truncate ou drop", /\b(truncate|drop\s+table)\b/i],
    ]);

    /** As remoções que EXISTEM, declaradas: rótulo → onde e por quê. */
    const REMOCOES_DECLARADAS = Object.freeze({
      /* `excluirPost` desde a Story 2.12; `excluirCategoria` desde a 2.14 — e
         a segunda tem a MESMA guarda de identificador da primeira, porque um
         filtro ausente no PostgREST não é um erro: é um `DELETE` na tabela
         inteira. Acrescentar uma terceira remoção exige editar esta lista, que
         é o ponto. */
      "api/_nucleo/acesso.js": ["excluirPost", "excluirCategoria"],
      "api/_nucleo/salvarPost.js": [],
    });

    /** Os nomes de função de remoção que um arquivo declara ou chama. */
    const remocoesEm = (codigo) => [
      ...new Set(
        [...codigo.matchAll(/\b((?:apagar|remover|excluir|deletar)[A-Za-z]*)\s*\(/gi)].map(
          (m) => m[1],
        ),
      ),
    ];

    for (const [arquivo, esperadas] of Object.entries(REMOCOES_DECLARADAS)) {
      const codigo = arquivo === CAMINHO_ACESSO ? acessoLido : nucleoLido;
      const achadas = remocoesEm(codigo);
      afirmar(
        `${arquivo} tem EXATAMENTE as remoções declaradas: ${esperadas.join(", ") || "nenhuma"}`,
        mesmoConjunto(achadas, esperadas),
        `achadas: ${achadas.join(", ") || "nenhuma"}`,
      );
    }

    /* E NENHUMA OUTRA FORMA de remoção existe nos dois arquivos — nem `drop`,
       nem `truncate`, nem função de banco com nome de remoção. */
    const forasteiras = [];
    for (const [arquivo, codigo] of [
      [CAMINHO_ACESSO, acessoLido],
      [CAMINHO_NUCLEO, nucleoLido],
    ]) {
      for (const [rotulo, padrao] of FORMAS_DE_REMOCAO) {
        if (rotulo === "nome de remoção") continue; // já coberto, por igualdade
        if (rotulo === "método DELETE sem aspas") continue; // idem, adiante
        const achado = padrao.exec(codigo);
        if (!achado) continue;
        const permitido =
          arquivo === CAMINHO_ACESSO && /^['"`]delete['"`]$/i.test(achado[0]);
        if (!permitido) forasteiras.push(`${arquivo}: ${rotulo} (${achado[0]})`);
      }
    }
    afirmar(
      "e não existe outra forma de remoção nos dois arquivos — nem literal escapado, nem `drop`, nem função de banco",
      forasteiras.length === 0,
      forasteiras.join(" | "),
    );

    /* O MÉTODO NUNCA SAI DE UMA VARIÁVEL. É a forma de evasão que a contagem
       de literal não via: `const m = "DELETE"; { metodo: m }` passava. */
    afirmar(
      "todo método HTTP do transporte é literal — método vindo de variável esconderia a remoção da leitura",
      [...acessoLido.matchAll(/metodo\s*:\s*([^,\n}]+)/g)].every((m) =>
        /^\s*['"`]/.test(m[1]),
      ),
      [...acessoLido.matchAll(/metodo\s*:\s*([^,\n}]+)/g)]
        .map((m) => m[1].trim())
        .join(" | "),
    );

    /* AUTOTESTE DO DETECTOR NOVO, nos dois sentidos — o autoteste antigo cobria
       só o detector antigo, e um extrator quebrado deixaria as quatro linhas
       acima passarem por vacuidade. */
    afirmar(
      "o extrator de remoções acha o que existe e não inventa o que não existe",
      mesmoConjunto(remocoesEm("async excluirPost(id) { return apagarTudo(); }"), [
        "excluirPost",
        "apagarTudo",
      ]) && remocoesEm("async lerPost(id) { return primeira(x); }").length === 0,
      remocoesEm("async excluirPost(id) { return apagarTudo(); }").join(", "),
    );
    afirmar(
      "e as formas de evasão que a contagem de literal não via são reconhecidas",
      FORMAS_DE_REMOCAO.some(([, padrao]) => padrao.test("metodo: 'delete'")) &&
        FORMAS_DE_REMOCAO.some(([, padrao]) => padrao.test("metodo: verbo")) &&
        FORMAS_DE_REMOCAO.some(([, padrao]) =>
          padrao.test("/rest/v1/rpc/apagar_post"),
        ) &&
        FORMAS_DE_REMOCAO.some(([, padrao]) => padrao.test("truncate table posts")),
    );
  }

  afirmar(
    "e quem alcança a remoção é o módulo da operação `excluir` — a gravação não a menciona",
    /acesso\.excluirPost\(/.test(
      mascararComentariosJs(tentar(`${CAMINHO_OPERACOES_DO_POST} legível`, () => ler(CAMINHO_OPERACOES_DO_POST), "")),
    ) && !/acesso\.excluirPost\(/.test(nucleoLido),
  );

  /* E A PROVA EXECUTADA: arquivar de verdade, com um transporte que ACUSA se
     alguém tentar apagar. Sem esta linha, "arquivar não apaga" seria uma
     afirmação sobre texto — e texto não é o que roda em produção. */
  {
    const acessoQueAcusa = acessoDeTeste({
      post: {
        id: "11111111-2222-4333-8444-555555555555",
        slug: "um-post-de-teste",
        estado: "publicado",
        publicado_em: "2026-01-01T00:00:00.000Z",
        autor_id: CONTA_FALSA.id,
        autor_nome: "Autor Original",
      },
    });
    let tentouApagar = false;
    acessoQueAcusa.excluirPost = () => {
      tentouApagar = true;
      return { ok: true, status: 200, dados: null };
    };
    const arquivou = await salvarPost({
      token: "bom",
      corpo: corpoValido({ id: "11111111-2222-4333-8444-555555555555", estado: "arquivado" }),
      acesso: acessoQueAcusa,
    });
    afirmar(
      "arquivar EXECUTADO: o Post é atualizado para arquivado e nada é apagado",
      arquivou.ok === true &&
        arquivou.dados.post.estado === "arquivado" &&
        tentouApagar === false &&
        acessoQueAcusa.chamadas.every((c) => c.nome !== "excluirPost"),
      arquivou.ok
        ? `tentou apagar: ${tentouApagar}`
        : `tipo ${arquivou.erro.tipo}: ${arquivou.erro.detalhe?.slice(0, 160)}`,
    );
  }
}

/* ─── (d) O núcleo, executado sem rede ───────────────────────────────────── */

/* ─── (c5) O vocabulário fechado das operações (Story 2.12) ──────────────── */

secao("(c5) as operações: uma porta só, escolhida por lista de permissão");

{
  /* — A LISTA É A LISTA, e ela é completa — */

  /* A LISTA CRESCEU NA STORY 2.14, E ISSO FOI DELIBERADO.
     A versão anterior desta asserção dizia "as TRÊS operações, e nenhuma a
     mais" — e o `deferred` da spec da Story 2.12 registrou, por escrito, que
     uma story futura precisaria reabri-la DE PROPÓSITO, não por acidente. É o
     que a 2.14 faz: as duas operações de Categoria entram no vocabulário
     fechado, não em `api/categorias.js`. A porta continua sendo uma. */
  const OPERACOES_ESPERADAS = [
    OPERACAO_SALVAR,
    OPERACAO_EXCLUIR,
    OPERACAO_DESTACAR,
    OPERACAO_SALVAR_CATEGORIA,
    OPERACAO_EXCLUIR_CATEGORIA,
  ];
  afirmar(
    `o vocabulário declara as ${OPERACOES_ESPERADAS.length} operações da porta única, e nenhuma a mais`,
    mesmoConjunto(OPERACOES, OPERACOES_ESPERADAS) &&
      OPERACOES.length === OPERACOES_ESPERADAS.length,
    OPERACOES.join(", "),
  );
  afirmar(
    "a lista é congelada — quem importa não consegue acrescentar uma operação em tempo de execução",
    Object.isFrozen(OPERACOES) &&
      (() => {
        try {
          OPERACOES.push("apagar-tudo");
        } catch {
          /* modo estrito: lançar é o comportamento desejado */
        }
        return OPERACOES.length === OPERACOES_ESPERADAS.length;
      })(),
    OPERACOES.join(", "),
  );
  afirmar(
    "a operação padrão é `salvar` — o corpo da Story 2.5 nunca teve o campo, e exigi-lo agora recusaria toda gravação em voo",
    OPERACAO_PADRAO === OPERACAO_SALVAR,
    OPERACAO_PADRAO,
  );

  /* — LISTA DE PERMISSÃO, e não de proibição — */
  //
  // A evasão clássica de quem usa objeto como tabela de despacho: nome herdado
  // do protótipo de `Object`. `ehOperacao` responde sobre a LISTA, e é isso que
  // faz `constructor` e `__proto__` serem "não" em vez de "sim".

  const FORA_DO_VOCABULARIO = [
    "constructor",
    "__proto__",
    "toString",
    "valueOf",
    "hasOwnProperty",
    "apagar",
    "delete",
    "Excluir",
    "EXCLUIR",
    "excluir; drop table posts",
    "excluir-tudo",
  ];

  /* O NOME COM ESPAÇO é caso à parte, e a diferença é deliberada: `ehOperacao`
     e a tabela de despacho comparam o nome EXATO, e a leitura do corpo apara
     antes de comparar. Se a aparagem morasse na comparação, ela valeria também
     para a tabela — e a chave espaçada passaria a alcançar um executor. */
  const ESPACADOS = [" excluir", "excluir ", "\texcluir\n", "  salvar  "];
  const aceitosPorEngano = FORA_DO_VOCABULARIO.filter((v) => ehOperacao(v));
  afirmar(
    `nenhum dos ${FORA_DO_VOCABULARIO.length} nomes fora do vocabulário é aceito — inclusive os herdados do protótipo`,
    aceitosPorEngano.length === 0,
    aceitosPorEngano.join(", "),
  );
  afirmar(
    "e o que não é texto também não é operação",
    ![null, undefined, 0, 1, true, {}, [], Symbol.iterator].some((v) => {
      try {
        return ehOperacao(v);
      } catch {
        return true; // lançar já é falha: quem pergunta é o servidor, sobre valor de fora
      }
    }),
  );
  afirmar(
    "as três declaradas SÃO aceitas — a lista de permissão não pode recusar o que ela mesma declara",
    OPERACOES.every((o) => ehOperacao(o)),
  );
  afirmar(
    "nome com espaço em volta não é operação para quem compara o nome exato — a aparagem é da leitura do corpo, e só dela",
    ESPACADOS.every((v) => ehOperacao(v) === false && executorDe(v) === null),
    ESPACADOS.filter((v) => ehOperacao(v) || executorDe(v) !== null).join(" | "),
  );

  /* — A LEITURA DO CORPO: o que a porta faz com o campo — */

  afirmar(
    "corpo sem `operacao` é pedido de SALVAR — a compatibilidade com a Story 2.5 é explícita, não acidental",
    operacaoPedida({}).operacao === OPERACAO_SALVAR &&
      operacaoPedida({ operacao: undefined }).operacao === OPERACAO_SALVAR &&
      operacaoPedida({ operacao: null }).operacao === OPERACAO_SALVAR &&
      operacaoPedida({ operacao: "" }).operacao === OPERACAO_SALVAR,
    JSON.stringify(operacaoPedida({})),
  );
  afirmar(
    "corpo que NÃO é objeto não é recusado aqui — ele é um salvamento mal formado, e quem o descreve é a leitura do corpo",
    operacaoPedida(null).operacao === OPERACAO_SALVAR &&
      operacaoPedida("texto solto").operacao === OPERACAO_SALVAR &&
      operacaoPedida([]).operacao === OPERACAO_SALVAR,
    JSON.stringify(operacaoPedida("texto solto")),
  );
  afirmar(
    "cada operação declarada é reconhecida pelo corpo, com espaços aparados",
    OPERACOES.every(
      (o) =>
        operacaoPedida({ operacao: o }).ok === true &&
        operacaoPedida({ operacao: o }).operacao === o &&
        operacaoPedida({ operacao: `  ${o}  ` }).operacao === o,
    ) &&
      ESPACADOS.every((v) => operacaoPedida({ operacao: v }).ok === true),
    ESPACADOS.map((v) => JSON.stringify(operacaoPedida({ operacao: v }))).join(" | "),
  );
  {
    const recusados = FORA_DO_VOCABULARIO.filter(
      (v) => operacaoPedida({ operacao: v }).ok !== false,
    );
    afirmar(
      "corpo FORJADO com operação fora do vocabulário é recusado, e a recusa nomeia as operações que existem",
      recusados.length === 0 &&
        OPERACOES.every((o) =>
          operacaoPedida({ operacao: "apagar" }).mensagem.includes(o),
        ),
      recusados.length > 0
        ? `aceitos: ${recusados.join(", ")}`
        : operacaoPedida({ operacao: "apagar" }).mensagem,
    );
    afirmar(
      "e a recusa não lança: exceção daqui viraria 500 sem tipo, e a tela ficaria sem saber o que fazer",
      [null, undefined, 0, {}, [], Symbol("x")].every((v) => {
        try {
          return operacaoPedida({ operacao: v }).ok !== undefined;
        } catch {
          return false;
        }
      }),
    );
  }

  /* — A TABELA DE DESPACHO do invólucro — */

  afirmar(
    "a tabela de despacho tem EXATAMENTE as operações declaradas — nenhuma declarada sem executor, nenhum executor sem declaração",
    mesmoConjunto(Object.keys(EXECUTORES), OPERACOES),
    `declaradas: ${OPERACOES.join(", ")} | executáveis: ${Object.keys(EXECUTORES).join(", ")}`,
  );
  afirmar(
    "e cada uma delas resolve para uma função de verdade",
    OPERACOES.every((o) => typeof executorDe(o) === "function"),
    OPERACOES.map((o) => `${o}: ${typeof executorDe(o)}`).join(", "),
  );
  afirmar(
    "as funções são DISTINTAS — uma tabela que aponta duas chaves para o mesmo executor faria excluir salvar",
    new Set(OPERACOES.map((o) => executorDe(o))).size === OPERACOES.length,
  );
  afirmar(
    "cada operação aponta para a função do módulo dela — não há implementação escondida na tabela",
    executorDe(OPERACAO_EXCLUIR) === excluirPost &&
      executorDe(OPERACAO_DESTACAR) === definirDestaque &&
      executorDe(OPERACAO_SALVAR) === salvarPost &&
      executorDe(OPERACAO_SALVAR_CATEGORIA) === salvarCategoria &&
      executorDe(OPERACAO_EXCLUIR_CATEGORIA) === excluirCategoria,
  );
  {
    const alcancados = FORA_DO_VOCABULARIO.filter((v) => executorDe(v) !== null);
    afirmar(
      "nome fora do vocabulário não alcança executor NENHUM — nem pelo protótipo de `Object`",
      alcancados.length === 0 && executorDe(undefined) === null && executorDe(null) === null,
      alcancados.join(", "),
    );
  }
  /* AUTOTESTE DA ASSERÇÃO ACIMA. Sem ele, um `executorDe` que devolvesse
     sempre `null` faria a linha anterior passar por vacuidade — e a porta
     inteira pararia de funcionar com a suíte verde. */
  afirmar(
    "o detector acima não passa por vacuidade: a mesma função devolve executor para as operações reais",
    executorDe(OPERACAO_EXCLUIR) !== null && executorDe(OPERACAO_SALVAR) !== null,
  );

  /* — AS TRÊS TÊM A MESMA FORMA, e é isso que faz o invólucro não saber qual chamou — */

  afirmar(
    "as três operações recebem o mesmo pacote: `{ token, corpo, acesso }`",
    OPERACOES.map((o) => executorDe(o)).every((f) => f.length === 1),
    OPERACOES.map((o) => `${o}/${executorDe(o).length}`).join(", "),
  );

  /* — O CLIENTE FALA A MESMA LÍNGUA, e pela mesma porta — */

  afirmar(
    "o cliente expõe as três operações, e nenhuma delas é uma rota a mais",
    typeof clienteDaEscrita.salvarPost === "function" &&
      typeof clienteDaEscrita.excluirPost === "function" &&
      typeof clienteDaEscrita.definirDestaque === "function" &&
      clienteDaEscrita.ROTA_DE_ESCRITA === "/api/posts",
    `rota: ${clienteDaEscrita.ROTA_DE_ESCRITA}`,
  );
  {
    /* LEITURA ESTÁTICA, e está escrito por quê: o que o cliente PÕE no corpo só
       é observável com sessão aberta, e `tokenDoPainelOuFalha` recusa antes de
       montar o pedido. O que se pode afirmar sem sessão — e é o que importa
       para "não existe segunda grafia" — é que as palavras vêm do módulo do
       domínio e não são digitadas aqui. As recusas ANTES do pedido, logo
       abaixo, são executadas de verdade. */
    const cliente = mascararComentariosJs(ler(CAMINHO_CLIENTE_DA_ESCRITA));
    afirmar(
      "o cliente importa o vocabulário do DOMÍNIO — a mesma lista que a função de servidor confere",
      /from\s+"\.\.\/\.\.\/domain\/blog\/operacoes\.js"/.test(cliente) &&
        /OPERACAO_EXCLUIR/.test(cliente) &&
        /OPERACAO_DESTACAR/.test(cliente),
    );
    const literais = OPERACOES.filter((o) =>
      new RegExp(`["'\`]${o}["'\`]`).test(cliente),
    );
    afirmar(
      "e não escreve nenhuma delas à mão — a segunda grafia é a divergência que só aparece no dia da renomeação",
      literais.length === 0,
      literais.join(", "),
    );
    const nucleoDasOperacoes = mascararComentariosJs(ler(CAMINHO_OPERACOES_DO_POST));
    afirmar(
      "o servidor também não: as operações novas leem o vocabulário do domínio e reaproveitam o classificador do núcleo",
      /from\s+"\.\.\/\.\.\/src\/domain\/blog\/operacoes\.js"/.test(nucleoDasOperacoes) &&
        /from\s+"\.\/salvarPost\.js"/.test(nucleoDasOperacoes) &&
        /falhaDaEscrita/.test(nucleoDasOperacoes) &&
        !/function\s+classificar/.test(nucleoDasOperacoes),
    );
    const dominio = mascararComentariosJs(ler(CAMINHO_OPERACOES));
    afirmar(
      "e o módulo do vocabulário é PURO: sem React, sem rede, sem armazenamento",
      !/\bfrom\s+["']react|fetch\s*\(|localStorage|createClient/.test(dominio),
    );
  }

  /* — AS RECUSAS DO CLIENTE, EXECUTADAS: nada sai para a rede — */
  //
  // O que vem da tela chega ao servidor. Recusar cedo dá uma frase melhor que a
  // resposta de um filtro malformado — e o contador prova que o pedido nem
  // chegou a ser montado.

  {
    let idas = 0;
    const buscar = async () => {
      idas += 1;
      return new Response("{}", { status: 200 });
    };
    const semId = await clienteDaEscrita.excluirPost("nao-e-um-uuid", { buscar });
    const semIdNoDestaque = await clienteDaEscrita.definirDestaque("nao-e-um-uuid", true, {
      buscar,
    });
    afirmar(
      "excluir com identificador fora do formato é recusado ANTES de qualquer pedido, com `dados_invalidos`",
      semId.ok === false &&
        semId.erro.tipo === ERRO_DADOS_INVALIDOS &&
        semIdNoDestaque.ok === false &&
        semIdNoDestaque.erro.tipo === ERRO_DADOS_INVALIDOS &&
        idas === 0,
      `idas à rede: ${idas} | ${semId.ok ? "PASSOU" : `${semId.erro.tipo}: ${semId.erro.mensagem}`}`,
    );
    afirmar(
      "e NUNCA com `nao_encontrado`: ausência é veredito do servidor, e a tela age sobre ela tirando a linha da lista",
      semId.erro.tipo !== ERRO_NAO_ENCONTRADO &&
        semIdNoDestaque.erro.tipo !== ERRO_NAO_ENCONTRADO,
      `${semId.erro.tipo} | ${semIdNoDestaque.erro.tipo}`,
    );

    const naoBooleano = await clienteDaEscrita.definirDestaque(
      "aaaaaaaa-1111-4111-8111-111111111111",
      "true",
      { buscar },
    );
    afirmar(
      "destaque que não é booleano é recusado ANTES do pedido — `Boolean(\"false\")` é `true`, e a conversão silenciosa vira o oposto do que se pediu",
      naoBooleano.ok === false &&
        naoBooleano.erro.tipo === ERRO_DADOS_INVALIDOS &&
        idas === 0,
      `idas à rede: ${idas} | ${naoBooleano.ok ? "PASSOU" : naoBooleano.erro.mensagem}`,
    );

    const semSessao = await clienteDaEscrita.excluirPost(
      "aaaaaaaa-1111-4111-8111-111111111111",
      { buscar },
    );
    afirmar(
      "e sem sessão nenhum pedido sai: o token vem do ponto único, e sem ele a operação morre no cliente",
      semSessao.ok === false && idas === 0,
      `idas à rede: ${idas} | tipo ${semSessao.ok ? "PASSOU" : semSessao.erro.tipo}`,
    );
    /* AUTOTESTE do contador. Sem esta linha, um `buscar` que nunca fosse
       chamado por defeito da ferramenta faria as três asserções acima passarem
       sem provar nada. */
    await buscar();
    afirmar("o contador de idas à rede conta de verdade", idas === 1, `idas: ${idas}`);
  }

  /* — E AS DUAS DE CATEGORIA, TAMBÉM EXECUTADAS (Story 2.14) — */
  //
  // Elas eram as únicas funções do cliente que nenhuma asserção CHAMAVA: as
  // asserções da tela usam o dublê, que as REIMPLEMENTA, e aqui só se conferia
  // `typeof === "function"`. Três sabotagens passavam verdes — trocar o rótulo
  // para o de salvar Post (o pedido de categoria vira pedido de post), apagar o
  // `delete corpo.id` (criar vira editar uma existente) e remover a recusa por
  // `ehUuid` (identificador malformado vai para a rede).

  {
    let idas = 0;
    const pedidos = [];
    const buscar = async (rota, opcoes) => {
      idas += 1;
      pedidos.push({ rota, corpo: JSON.parse(opcoes.body) });
      return new Response(JSON.stringify({ ok: true, dados: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const obterToken = async () => ({ ok: true, dados: "t" });

    /* CRIAR: sem `id` no corpo, e com a operação do vocabulário. */
    const criou = await clienteDaEscrita.salvarCategoria(
      { nome: "Nova", cor: CORES_DE_CATEGORIA[0], icone: CHAVES_DE_ICONE_DE_CATEGORIA[0] },
      { buscar, obterToken },
    );
    afirmar(
      "criar Categoria sai pela ROTA ÚNICA, com a operação do vocabulário e SEM identificador",
      criou.ok === true &&
        pedidos.length === 1 &&
        pedidos[0].rota === clienteDaEscrita.ROTA_DE_ESCRITA &&
        pedidos[0].corpo.operacao === OPERACAO_SALVAR_CATEGORIA &&
        !Object.hasOwn(pedidos[0].corpo, "id") &&
        pedidos[0].corpo.nome === "Nova",
      JSON.stringify(pedidos[0] ?? null),
    );

    /* EDITAR: o identificador viaja, e é ele que faz o servidor editar em vez
       de criar uma segunda Categoria com o mesmo nome. */
    const ID_DA_CATEGORIA = "aaaaaaaa-1111-4111-8111-111111111111";
    await clienteDaEscrita.salvarCategoria(
      { nome: "Outra" },
      { id: ID_DA_CATEGORIA, buscar, obterToken },
    );
    afirmar(
      "editar Categoria manda o identificador no corpo, com a MESMA operação",
      pedidos[1]?.corpo.id === ID_DA_CATEGORIA &&
        pedidos[1]?.corpo.operacao === OPERACAO_SALVAR_CATEGORIA,
      JSON.stringify(pedidos[1] ?? null),
    );

    /* EXCLUIR: operação própria, identificador no corpo. */
    await clienteDaEscrita.excluirCategoria(ID_DA_CATEGORIA, { buscar, obterToken });
    afirmar(
      "excluir Categoria usa a operação PRÓPRIA dela — não a de excluir post, e não a de salvar",
      pedidos[2]?.corpo.operacao === OPERACAO_EXCLUIR_CATEGORIA &&
        pedidos[2]?.corpo.id === ID_DA_CATEGORIA &&
        pedidos[2]?.rota === clienteDaEscrita.ROTA_DE_ESCRITA,
      JSON.stringify(pedidos[2] ?? null),
    );
    afirmar(
      "e nenhuma delas viaja como operação de Post",
      !pedidos.some(
        (x) =>
          x.corpo.operacao === OPERACAO_SALVAR ||
          x.corpo.operacao === OPERACAO_EXCLUIR ||
          x.corpo.operacao === OPERACAO_DESTACAR,
      ),
      pedidos.map((x) => x.corpo.operacao).join(", "),
    );

    /* E O CORPO NÃO ESCOLHE A OPERAÇÃO: um `operacao` forjado no que a tela
       manda não pode virar a operação executada — ela é declarada depois. */
    const forjado = await clienteDaEscrita.salvarCategoria(
      { nome: "X", operacao: OPERACAO_EXCLUIR },
      { buscar, obterToken },
    );
    afirmar(
      "`operacao` forjada no corpo NÃO troca a operação de Categoria",
      forjado.ok === true &&
        pedidos.at(-1).corpo.operacao === OPERACAO_SALVAR_CATEGORIA,
      String(pedidos.at(-1)?.corpo.operacao),
    );

    /* AS RECUSAS ANTES DA REDE. */
    const antes = idas;
    const ruimAoEditar = await clienteDaEscrita.salvarCategoria(
      { nome: "X" },
      { id: "nao-e-uuid", buscar, obterToken },
    );
    const ruimAoExcluir = await clienteDaEscrita.excluirCategoria("nao-e-uuid", {
      buscar,
      obterToken,
    });
    afirmar(
      "identificador de Categoria fora do formato é recusado ANTES de qualquer pedido, com `dados_invalidos`",
      ruimAoEditar.ok === false &&
        ruimAoEditar.erro.tipo === ERRO_DADOS_INVALIDOS &&
        ruimAoExcluir.ok === false &&
        ruimAoExcluir.erro.tipo === ERRO_DADOS_INVALIDOS &&
        idas === antes,
      "idas à rede: " + (idas - antes),
    );
    afirmar(
      "e NUNCA com `nao_encontrado` — ausência é veredito do servidor, e a tela age sobre ela",
      ruimAoEditar.erro.tipo !== ERRO_NAO_ENCONTRADO &&
        ruimAoExcluir.erro.tipo !== ERRO_NAO_ENCONTRADO,
      ruimAoEditar.erro.tipo + " | " + ruimAoExcluir.erro.tipo,
    );
  }

  /* — O CORPO QUE SAI PARA A REDE, OBSERVADO — */
  //
  // Era leitura estática, e a justificativa não se sustentava: `buscar` já era
  // injetável, e o token ganhou a mesma costura. Sem isto, trocar
  // `{ ...corpo, operacao }` por `corpo` deixava TODO pedido de exclusão chegar
  // ao servidor como salvamento, com a suíte inteira verde.

  {
    const ID = "aaaaaaaa-1111-4111-8111-111111111111";
    const TOKEN = "jwt-de-mentira-da-sessao";
    const pedidos = [];
    const buscar = async (rota, opcoes) => {
      pedidos.push({ rota, opcoes, corpo: JSON.parse(opcoes.body) });
      return new Response(JSON.stringify({ ok: true, dados: { id: ID } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const obterToken = async () => ({ ok: true, dados: TOKEN });
    const costura = { buscar, obterToken };

    await clienteDaEscrita.salvarPost({ id: ID, titulo: "Um post" }, costura);
    await clienteDaEscrita.excluirPost(ID, costura);
    await clienteDaEscrita.definirDestaque(ID, true, costura);

    afirmar(
      "as três operações saem pela MESMA porta: mesma rota, mesmo método, e o token da sessão no cabeçalho",
      pedidos.length === 3 &&
        pedidos.every(
          (q) =>
            q.rota === clienteDaEscrita.ROTA_DE_ESCRITA &&
            q.opcoes.method === "POST" &&
            q.opcoes.headers.Authorization === `Bearer ${TOKEN}`,
        ),
      pedidos.map((q) => `${q.opcoes.method} ${q.rota}`).join(" | "),
    );
    afirmar(
      "e cada uma DECLARA a operação no corpo, com a palavra do vocabulário fechado",
      pedidos[0]?.corpo.operacao === OPERACAO_SALVAR &&
        pedidos[1]?.corpo.operacao === OPERACAO_EXCLUIR &&
        pedidos[2]?.corpo.operacao === OPERACAO_DESTACAR,
      pedidos.map((q) => JSON.stringify(q.corpo.operacao)).join(", "),
    );
    afirmar(
      "o pedido de exclusão leva o identificador e MAIS NADA — corpo enxuto é corpo que não carrega surpresa",
      mesmoConjunto(Object.keys(pedidos[1]?.corpo ?? {}), ["id", "operacao"]) &&
        pedidos[1]?.corpo.id === ID,
      JSON.stringify(pedidos[1]?.corpo),
    );
    afirmar(
      "e o de Destaque leva o valor DESEJADO, como booleano",
      mesmoConjunto(Object.keys(pedidos[2]?.corpo ?? {}), ["id", "destaque", "operacao"]) &&
        pedidos[2]?.corpo.destaque === true,
      JSON.stringify(pedidos[2]?.corpo),
    );

    /* A DEFESA DE ORDEM. `{ ...corpo, operacao }` e não `{ operacao, ...corpo }`:
       um corpo que traga `operacao` por engano — um Post lido do banco e
       devolvido inteiro, por exemplo — não pode escolher a operação no lugar de
       quem chamou. Inverter a ordem passava despercebido antes desta linha. */
    pedidos.length = 0;
    await clienteDaEscrita.salvarPost(
      { id: ID, titulo: "Um post", operacao: OPERACAO_EXCLUIR },
      costura,
    );
    afirmar(
      "um `operacao` forjado DENTRO do corpo não sequestra a escolha — quem chamou decide, e escreve por último",
      pedidos[0]?.corpo.operacao === OPERACAO_SALVAR,
      `saiu como: ${JSON.stringify(pedidos[0]?.corpo.operacao)}`,
    );
  }

  /* — CLIENTE E SERVIDOR CLASSIFICAM O MESMO DEFEITO IGUAL — */
  //
  // O cliente dizia `nao_encontrado` para identificador malformado, e a tela
  // trata ausência tirando a linha da lista: um id estragado fazia a linha sumir
  // e a contagem cair sem que pedido nenhum tivesse saído. O servidor sempre
  // disse `dados_invalidos`. Dois vereditos para o mesmo defeito são duas telas.

  {
    const MALFORMADOS = ["nao-e-uuid", "", "   ", "123", null, undefined, 42, {}];
    const acesso = acessoDeTeste();
    const divergentes = [];
    for (const id of MALFORMADOS) {
      const noCliente = await clienteDaEscrita.excluirPost(id, {
        buscar: async () => new Response("{}", { status: 200 }),
        obterToken: async () => ({ ok: true, dados: "t" }),
      });
      const noServidor = await excluirPost({ token: "bom", corpo: { id }, acesso });
      if (noCliente.ok || noServidor.ok) {
        divergentes.push(`${JSON.stringify(id)}: alguém ACEITOU`);
        continue;
      }
      if (noCliente.erro.tipo !== noServidor.erro.tipo) {
        divergentes.push(
          `${JSON.stringify(id)}: cliente ${noCliente.erro.tipo} × servidor ${noServidor.erro.tipo}`,
        );
      }
      if (noCliente.erro.tipo !== ERRO_DADOS_INVALIDOS) {
        divergentes.push(
          `${JSON.stringify(id)}: cliente disse ${noCliente.erro.tipo}, e ausência é veredito do servidor`,
        );
      }
    }
    afirmar(
      `identificador malformado é dados_invalidos nos DOIS lados, nos ${MALFORMADOS.length} casos — e nunca ausência`,
      divergentes.length === 0,
      divergentes.slice(0, 3).join(" | "),
    );
    afirmar(
      "e nada foi pedido ao banco por nenhum deles",
      acesso.escritas().length === 0,
      JSON.stringify(acesso.escritas().map((c) => c.nome)),
    );
  }

  /* — OS TRÊS FORMATOS DE IDENTIFICADOR CONCORDAM — */

  {
    const CORPUS = [
      randomUUID(),
      randomUUID().toUpperCase(),
      "aaaaaaaa-1111-4111-8111-111111111111",
      "aaaaaaaa11114111811111111111111",
      "aaaaaaaa-1111-4111-8111-11111111111",
      "aaaaaaaa-1111-4111-8111-1111111111111",
      "gggggggg-1111-4111-8111-111111111111",
      "",
      "nao-e-uuid",
    ];
    const divergentes = CORPUS.filter(
      (v) =>
        !(
          PADRAO_UUID.test(v) === PADRAO_DE_UUID.test(v) &&
          PADRAO_DE_UUID.test(v) === ehUuid(v)
        ),
    );
    afirmar(
      `os três formatos de identificador — núcleo, transporte e cliente — concordam nos ${CORPUS.length} casos do corpus`,
      divergentes.length === 0,
      divergentes
        .map((v) => `${JSON.stringify(v)}: ${PADRAO_UUID.test(v)}/${PADRAO_DE_UUID.test(v)}/${ehUuid(v)}`)
        .join(" | "),
    );
    afirmar(
      "o corpus tem os DOIS vereditos representados — três padrões que recusassem tudo também concordariam",
      CORPUS.some((v) => ehUuid(v)) && CORPUS.some((v) => !ehUuid(v)),
    );

    /* O ESPAÇO EM VOLTA não é divergência, é normalização — e a distinção
       precisa estar escrita, senão a próxima pessoa "conserta" o cliente para
       recusar o que ele hoje apara. O cliente aceita e APARA antes de mandar;
       os dois padrões do servidor comparam o nome exato, e é isso que faz o
       espaço nunca chegar a virar filtro. */
    {
      const COM_ESPACO = " aaaaaaaa-1111-4111-8111-111111111111 ";
      const cru = COM_ESPACO.trim();
      const pedidos = [];
      const r = await clienteDaEscrita.excluirPost(COM_ESPACO, {
        buscar: async (rota, opcoes) => {
          pedidos.push(JSON.parse(opcoes.body));
          return new Response(JSON.stringify({ ok: true, dados: {} }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        },
        obterToken: async () => ({ ok: true, dados: "t" }),
      });
      afirmar(
        "identificador com espaço em volta é APARADO pelo cliente antes de viajar — e é por isso que os padrões do servidor podem ser exatos",
        r.ok === true &&
          pedidos[0]?.id === cru &&
          ehUuid(COM_ESPACO) === true &&
          PADRAO_UUID.test(COM_ESPACO) === false &&
          PADRAO_UUID.test(cru) === true &&
          PADRAO_DE_UUID.test(cru) === true,
        `enviado: ${JSON.stringify(pedidos[0]?.id)}`,
      );
    }
  }

  /* — CADA OPERAÇÃO TEM FRASE PRÓPRIA EM CADA RAMO DE FALHA — */
  //
  // As frases genéricas do cliente diziam "salvar" e as da leitura diziam
  // "leitura", e alcançavam excluir e destacar sempre que o servidor não mandava
  // a dele: 5xx, 401 sem corpo JSON, proxy no caminho.

  {
    const TIPOS_DA_ESCRITA = clienteDaEscrita.TIPOS_DE_ERRO_DE_ESCRITA;
    const problemas = [];
    for (const tipo of TIPOS_DA_ESCRITA) {
      const frases = OPERACOES.map((o) => clienteDaEscrita.fraseDaEscrita(o, tipo));
      for (const [i, frase] of frases.entries()) {
        const ruim = diagnosticarMensagem("o que houve", frase);
        if (ruim) problemas.push(`${OPERACOES[i]}/${tipo}: ${ruim.slice(0, 80)}`);
      }
      /* `conflito` é o único que NÃO se especializa: ele só acontece ao gravar
         um endereço, e dizer "ao excluir" ali inventaria um modo de falha que a
         operação não tem. */
      if (tipo !== ERRO_CONFLITO && new Set(frases).size !== frases.length) {
        problemas.push(`${tipo}: as três operações repetem a mesma frase`);
      }
    }
    afirmar(
      `cada operação tem frase própria em cada um dos ${TIPOS_DA_ESCRITA.length} ramos de falha, e todas passam pelas guardas de voz`,
      problemas.length === 0,
      problemas.slice(0, 3).join(" | "),
    );
    afirmar(
      "nenhuma delas manda quem excluiu ou destacou tentar SALVAR de novo",
      TIPOS_DA_ESCRITA.every(
        (tipo) =>
          tipo === ERRO_CONFLITO ||
          [OPERACAO_EXCLUIR, OPERACAO_DESTACAR].every(
            (o) => !/salvar/i.test(clienteDaEscrita.fraseDaEscrita(o, tipo)),
          ),
      ),
      TIPOS_DA_ESCRITA.map((t) => clienteDaEscrita.fraseDaEscrita(OPERACAO_EXCLUIR, t))
        .join(" | ")
        .slice(0, 240),
    );

    /* E A FRASE DA LEITURA NÃO ATRAVESSA. */
    const semSessao = await clienteDaEscrita.excluirPost(
      "aaaaaaaa-1111-4111-8111-111111111111",
      {
        buscar: async () => new Response("{}", { status: 200 }),
        obterToken: async () => ({
          ok: false,
          erro: {
            tipo: ERRO_PERMISSAO,
            mensagem: MENSAGENS_DE_LEITURA[ERRO_PERMISSAO],
            operacao: "excluirPost",
            detalhe: "sem sessão",
            codigo: "",
            status: null,
          },
        }),
      },
    );
    afirmar(
      "sem sessão, quem tentou EXCLUIR não ouve a frase da leitura — a frase é a da operação",
      semSessao.ok === false &&
        semSessao.erro.tipo === ERRO_PERMISSAO &&
        semSessao.erro.mensagem !== MENSAGENS_DE_LEITURA[ERRO_PERMISSAO] &&
        /excluir/i.test(semSessao.erro.mensagem),
      semSessao.ok ? "PASSOU" : semSessao.erro.mensagem,
    );

    /* E FRASE PRÓPRIA DO MÓDULO DE ORIGEM ATRAVESSA INTACTA: a da configuração
       ausente NOMEIA as variáveis que faltam. */
    const PROPRIA = "Configuração do Supabase ausente: VITE_SUPABASE_URL.";
    const semConfig = await clienteDaEscrita.excluirPost(
      "aaaaaaaa-1111-4111-8111-111111111111",
      {
        buscar: async () => new Response("{}", { status: 200 }),
        obterToken: async () => ({
          ok: false,
          erro: {
            tipo: ERRO_CONFIGURACAO,
            mensagem: PROPRIA,
            operacao: "excluirPost",
            detalhe: "",
            codigo: "",
            status: null,
          },
        }),
      },
    );
    afirmar(
      "e a frase PRÓPRIA do módulo de origem atravessa intacta — só as genéricas da leitura são trocadas",
      semConfig.ok === false && semConfig.erro.mensagem === PROPRIA,
      semConfig.ok ? "PASSOU" : semConfig.erro.mensagem,
    );

    /* E O RAMO SEM CLASSIFICAÇÃO DO SERVIDOR: 5xx sem corpo JSON. */
    const quinhentos = await clienteDaEscrita.excluirPost(
      "aaaaaaaa-1111-4111-8111-111111111111",
      {
        buscar: async () => new Response("<html>proxy</html>", { status: 502 }),
        obterToken: async () => ({ ok: true, dados: "t" }),
      },
    );
    afirmar(
      "servidor que não classificou (502 sem JSON) também produz a frase da OPERAÇÃO, não a de salvar",
      quinhentos.ok === false &&
        quinhentos.erro.mensagem ===
          clienteDaEscrita.fraseDaEscrita(OPERACAO_EXCLUIR, quinhentos.erro.tipo) &&
        !/salvar/i.test(quinhentos.erro.mensagem),
      quinhentos.ok ? "PASSOU" : `${quinhentos.erro.tipo}: ${quinhentos.erro.mensagem}`,
    );
  }

  /* — AUTENTICAR NÃO É AUTORIZAR, TAMBÉM NAS OPERAÇÕES NOVAS — */
  //
  // A exigência de perfil valia só para `salvarPost` nas asserções. Apagar a
  // chamada de `perfilOuFalha` de `autorizar` não quebrava nada, porque toda
  // Conta usada contra excluir e destacar já tinha perfil.

  for (const [nome, executar, corpo] of [
    ["excluir", excluirPost, { id: randomUUID() }],
    ["destacar", definirDestaque, { id: randomUUID(), destaque: true }],
  ]) {
    const acesso = acessoDeTeste({ perfil: null });
    const r = await executar({ token: "bom", corpo, acesso });
    afirmar(
      `${nome}: Conta autenticada SEM cadastro no Painel é recusada, e nada é gravado`,
      r.ok === false && r.erro.tipo === ERRO_PERMISSAO && acesso.escritas().length === 0,
      r.ok ? "PASSOU" : `tipo ${r.erro.tipo} | escritas: ${acesso.escritas().length}`,
    );
    afirmar(
      `${nome}: e a frase é a de CADASTRO, e não a de assinar um post`,
      r.ok === false &&
        /cadastrada no Painel/i.test(r.erro.mensagem) &&
        !/assinar um post/i.test(r.erro.mensagem),
      r.ok ? "PASSOU" : r.erro.mensagem,
    );
    /* E A ORDEM: o cadastro é conferido ANTES de a tabela de posts ser tocada.
       Recusar depois seria "recusado, mas o banco já respondeu sobre uma linha
       que esta Conta não podia nem saber que existe". */
    afirmar(
      `${nome}: o cadastro é conferido antes de a tabela de posts ser tocada`,
      acesso.chamadas.every(
        (c) => !["lerPost", "excluirPost", "atualizarPost"].includes(c.nome),
      ),
      acesso.chamadas.map((c) => c.nome).join(", "),
    );

    /* ─── OS DOIS RAMOS DE REDE TAMBÉM FALAM A LÍNGUA DA OPERAÇÃO ────────
       Supabase fora do ar não é sessão inválida, e o vocabulário genérico do
       núcleo diz "para salvar" em todos os casos. São dois ramos, e cada um
       ignorava a frase por um motivo diferente: a conferência do token a
       forçava para vazio, e a leitura do perfil nem a recebia. */
    for (const [ondeFalha, opcoes] of [
      [
        "a conferência do token",
        {
          respostaDoToken: {
            ok: false,
            status: 0,
            codigo: "TypeError",
            mensagem: "fetch failed",
          },
        },
      ],
      ["a leitura do perfil", { respostaDoPerfil: { ok: false, status: 0, codigo: "TypeError", mensagem: "fetch failed" } }],
    ]) {
      const acessoRuim = acessoDeTeste(opcoes);
      const caiu = await executar({ token: "bom", corpo, acesso: acessoRuim });
      afirmar(
      `${nome}: rede fora em ${ondeFalha} não vira "entre de novo" nem manda SALVAR — a frase é da operação`,
        caiu.ok === false &&
          caiu.erro.tipo === ERRO_REDE &&
          !/salvar/i.test(caiu.erro.mensagem) &&
          new RegExp(nome === "excluir" ? "excluir" : "destaque", "i").test(caiu.erro.mensagem) &&
          diagnosticarMensagem("o que houve", caiu.erro.mensagem) === null,
        caiu.ok ? "PASSOU" : `${caiu.erro.tipo}: ${caiu.erro.mensagem}`,
      );
    }
  }
}

/* ─── (c6) O invólucro, DIRIGIDO de ponta a ponta ────────────────────────── */

secao("(c6) o invólucro executado: o despacho, o que a resposta revela, o que vai ao log");

{
  /**
   * Requisição e resposta de mentira, no formato que a plataforma entrega.
   *
   * O invólucro nunca era EXECUTADO: as asserções importavam `EXECUTORES`,
   * `executorDe` e `operacaoPedida` e chamavam as operações diretamente. Trocar
   * `await executor({...})` por `await salvarPost({...})` deixava as três peças
   * intactas, a suíte verde, e toda exclusão virando salvamento em produção. A
   * linha que escolhe o executor é a entrega da story, e ela precisa rodar.
   */
  const dirigir = async ({ metodo = "POST", corpo = {}, cabecalhos = {}, ambiente = null }) => {
    const registro = { status: null, corpo: null, cabecalhos: {}, log: [] };
    const req = { method: metodo, headers: cabecalhos, body: corpo };
    const res = {
      setHeader(nome, valor) { registro.cabecalhos[nome] = valor; },
      status(codigo) { registro.status = codigo; return res; },
      json(saida) { registro.corpo = saida; return res; },
    };
    /* O ambiente do processo é restaurado sempre: a ferramenta inteira roda no
       mesmo processo, e deixar `SUPABASE_*` remendado envenenaria as seções
       seguintes. */
    const antes = {};
    if (ambiente) {
      for (const [nome, valor] of Object.entries(ambiente)) {
        antes[nome] = process.env[nome];
        if (valor === undefined) delete process.env[nome];
        else process.env[nome] = valor;
      }
    }
    const erroOriginal = console.error;
    console.error = (...partes) => registro.log.push(partes.join(" "));
    try {
      await handler(req, res);
    } finally {
      console.error = erroOriginal;
      for (const [nome, valor] of Object.entries(antes)) {
        if (valor === undefined) delete process.env[nome];
        else process.env[nome] = valor;
      }
    }
    return registro;
  };

  /* O ambiente COMPLETO, mas apontando para um host que não existe: o despacho
     é observado pelo executor alcançado, não pela gravação — e uma ida à rede
     de verdade aqui tornaria a seção dependente de rede. */
  const AMBIENTE = {
    SUPABASE_URL: "https://nao-existe.invalido",
    SUPABASE_CHAVE_PUBLICAVEL: "sb_publishable_x",
    SUPABASE_CHAVE_DE_SERVICO: "sb_secret_x",
    VITE_SUPABASE_URL: undefined,
    VITE_SUPABASE_PUBLISHABLE_KEY: undefined,
  };

  /* ── QUAL EXECUTOR FOI ALCANÇADO, provado pelo que chega ao banco ────── */
  //
  // Um Supabase de MENTIRA que atende de verdade: um servidor HTTP local que
  // responde como o GoTrue e como o PostgREST. Ele existe porque o despacho é a
  // entrega da story e não dá para observá-lo de fora — sem token válido as
  // três operações recusam igual, e a resposta não diz qual executor rodou.
  // Com o servidor, quem responde a pergunta é o COMANDO que chega ao banco:
  // `salvar` manda POST, `destacar` manda PATCH com uma coluna, `excluir` manda
  // DELETE. Trocar `await executor({...})` por `await salvarPost({...})` faz
  // três asserções gritarem.
  //
  // É local, é http em 127.0.0.1 (que `problemaNaUrl` permite de propósito), e
  // fecha no `finally`.

  {
    const { createServer } = await import("node:http");
    const ID = randomUUID();
    const CONTA = randomUUID();
    const recebidos = [];

    const linhaDoPost = {
      id: ID,
      slug: "um-post-de-teste",
      titulo: "Um post de teste",
      resumo: "Resumo",
      conteudo: DOCUMENTO_COMPLETO,
      conteudo_html: "<p>x</p>",
      estado: "rascunho",
      publicado_em: null,
      destaque: false,
      autor_id: CONTA,
      autor_nome: "Autor do Perfil",
      criado_em: "2026-01-01T00:00:00.000Z",
      atualizado_em: "2026-01-01T00:00:00.000Z",
    };

    const servidor = createServer((req, res) => {
      let corpoBruto = "";
      req.on("data", (pedaco) => { corpoBruto += pedaco; });
      req.on("end", () => {
        let corpo = null;
        try { corpo = corpoBruto === "" ? null : JSON.parse(corpoBruto); } catch { corpo = corpoBruto; }
        recebidos.push({ metodo: req.method, url: req.url, corpo });
        const responder = (status, dados) => {
          res.writeHead(status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(dados));
        };
        if (req.url.startsWith("/auth/v1/user")) {
          return responder(200, { id: CONTA, email: "quem@chatclean.com.br" });
        }
        if (req.url.startsWith("/rest/v1/perfis")) {
          return responder(200, [{ id: CONTA, nome_exibicao: "Autor do Perfil" }]);
        }
        if (req.url.startsWith("/rest/v1/posts")) {
          /* Consulta por ENDEREÇO devolve vazio: é a pergunta "alguém já usa
             este slug?", e responder que sim faria toda gravação virar conflito
             antes de o despacho ser observado. Consulta por id devolve a linha,
             que é o Post existente que destacar e excluir alcançam. */
          if (req.method === "GET") {
            return responder(200, req.url.includes("slug=eq.") ? [] : [linhaDoPost]);
          }
          if (req.method === "POST") return responder(201, [linhaDoPost]);
          if (req.method === "PATCH") return responder(200, [{ ...linhaDoPost, ...corpo }]);
          if (req.method === "DELETE") return responder(200, [linhaDoPost]);
        }
        if (req.url.startsWith("/rest/v1/")) return responder(200, []);
        return responder(404, { message: "rota de mentira não prevista" });
      });
    });

    const porta = await new Promise((resolver, rejeitar) => {
      servidor.once("error", rejeitar);
      servidor.listen(0, "127.0.0.1", () => resolver(servidor.address().port));
    }).catch(() => null);

    if (porta === null) {
      afirmar(
        "o Supabase de mentira sobe em 127.0.0.1 para o despacho ser exercitado",
        false,
        "não foi possível abrir porta local — o despacho ficaria sem prova",
      );
    } else {
      try {
        const AMBIENTE_LOCAL = {
          SUPABASE_URL: `http://127.0.0.1:${porta}`,
          SUPABASE_CHAVE_PUBLICAVEL: "sb_publishable_x",
          SUPABASE_CHAVE_DE_SERVICO: "sb_secret_x",
          VITE_SUPABASE_URL: undefined,
          VITE_SUPABASE_PUBLISHABLE_KEY: undefined,
        };
        const COMO_SESSAO = { authorization: "Bearer jwt-de-mentira" };

        /** Os comandos que chegaram à tabela `posts` — o que o banco viu. */
        const naTabela = () =>
          recebidos.filter((r) => r.url.startsWith("/rest/v1/posts"));

        /* — SALVAR — */
        recebidos.length = 0;
        const salvou = await dirigir({
          corpo: {
            operacao: OPERACAO_SALVAR,
            slug: "um-post-de-teste",
            titulo: "Um post de teste",
            resumo: "Resumo",
            conteudo: DOCUMENTO_COMPLETO,
          },
          cabecalhos: COMO_SESSAO,
          ambiente: AMBIENTE_LOCAL,
        });
        const daSalvar = naTabela();
        afirmar(
          "SALVAR pelo invólucro chega ao banco como INSERÇÃO, e a resposta sai com 201",
          salvou.status === 201 &&
            salvou.corpo?.ok === true &&
            daSalvar.some((r) => r.metodo === "POST") &&
            !daSalvar.some((r) => r.metodo === "DELETE"),
          `HTTP ${salvou.status} | comandos: ${daSalvar.map((r) => r.metodo).join(", ")}`,
        );

        /* — DESTACAR — */
        recebidos.length = 0;
        const destacou = await dirigir({
          corpo: { operacao: OPERACAO_DESTACAR, id: ID, destaque: true },
          cabecalhos: COMO_SESSAO,
          ambiente: AMBIENTE_LOCAL,
        });
        const patch = naTabela().find((r) => r.metodo === "PATCH");
        afirmar(
          "DESTACAR pelo invólucro chega ao banco como ATUALIZAÇÃO de UMA coluna, com 200",
          destacou.status === 200 &&
            destacou.corpo?.ok === true &&
            destacou.corpo.dados.operacao === OPERACAO_DESTACAR &&
            patch !== undefined &&
            mesmoConjunto(Object.keys(patch.corpo ?? {}), ["destaque"]) &&
            patch.url.includes(`id=eq.${ID}`),
          `HTTP ${destacou.status} | corpo do comando: ${JSON.stringify(patch?.corpo)}`,
        );

        /* — EXCLUIR — */
        recebidos.length = 0;
        const excluiu = await dirigir({
          corpo: { operacao: OPERACAO_EXCLUIR, id: ID },
          cabecalhos: COMO_SESSAO,
          ambiente: AMBIENTE_LOCAL,
        });
        const del = naTabela().find((r) => r.metodo === "DELETE");
        afirmar(
          "EXCLUIR pelo invólucro chega ao banco como REMOÇÃO filtrada por id, com 200 — e não como salvamento",
          excluiu.status === 200 &&
            excluiu.corpo?.ok === true &&
            excluiu.corpo.dados.operacao === OPERACAO_EXCLUIR &&
            del !== undefined &&
            del.url.includes(`id=eq.${ID}`) &&
            !naTabela().some((r) => r.metodo === "POST"),
          `HTTP ${excluiu.status} | comandos: ${naTabela().map((r) => r.metodo).join(", ")}`,
        );

        afirmar(
          "as três operações produziram comandos DIFERENTES no banco — é isso que prova que o despacho escolhe, e não repete",
          daSalvar.some((r) => r.metodo === "POST") && patch !== undefined && del !== undefined,
          `salvar: POST | destacar: ${patch?.metodo} | excluir: ${del?.metodo}`,
        );

        /* — E O 201 É SÓ DE QUEM NASCEU — */
        afirmar(
          "201 é só do Post que nasceu: as operações que mexem no que já existe saem com 200",
          salvou.status === 201 && destacou.status === 200 && excluiu.status === 200,
          `${salvou.status} / ${destacou.status} / ${excluiu.status}`,
        );

        /* — E O `detalhe` NUNCA VIAJA NA RESPOSTA — */
        const recusado = await dirigir({
          corpo: { operacao: OPERACAO_EXCLUIR, id: "nao-e-uuid" },
          cabecalhos: COMO_SESSAO,
          ambiente: AMBIENTE_LOCAL,
        });
        afirmar(
          "a recusa do invólucro traz tipo e mensagem, e nunca o `detalhe` interno",
          recusado.corpo?.ok === false &&
            mesmoConjunto(Object.keys(recusado.corpo.erro), ["tipo", "mensagem"]) &&
            recusado.log.length > 0,
          JSON.stringify(recusado.corpo),
        );
      } finally {
        await new Promise((resolver) => servidor.close(resolver));
      }
    }
  }

  /* ── E AS RECUSAS QUE NÃO PRECISAM DE BANCO ──────────────────────────── */

  {
    const semNada = await dirigir({ corpo: { operacao: OPERACAO_SALVAR }, ambiente: AMBIENTE });
    afirmar(
      "pedido sem credencial é recusado pelo invólucro antes de qualquer ida ao banco",
      semNada.status === CODIGO_HTTP[ERRO_PERMISSAO] && semNada.corpo?.ok === false,
      `HTTP ${semNada.status} ${JSON.stringify(semNada.corpo)}`,
    );
  }

  /* ── OPERAÇÃO FORJADA: 4xx, e NADA de vocabulário para quem não se identificou ── */

  {
    const anonimo = await dirigir({
      corpo: { operacao: "apagar-tudo" },
      ambiente: AMBIENTE,
    });
    afirmar(
      "operação forjada é recusada pelo invólucro, com o código de dados inválidos",
      anonimo.status === CODIGO_HTTP[ERRO_DADOS_INVALIDOS] && anonimo.corpo?.ok === false,
      `HTTP ${anonimo.status} ${JSON.stringify(anonimo.corpo)}`,
    );
    afirmar(
      "e quem NÃO se identificou não recebe o vocabulário de volta — a lista das operações não é informação de quem sonda",
      anonimo.corpo?.erro?.mensagem === RECUSA_SEM_CREDENCIAL &&
        !OPERACOES.some((o) => String(anonimo.corpo?.erro?.mensagem).includes(o)),
      String(anonimo.corpo?.erro?.mensagem),
    );
    afirmar(
      "nem consegue escrever no log do servidor: sem credencial, a recusa é silenciosa",
      anonimo.log.length === 0,
      anonimo.log.join(" | ").slice(0, 200),
    );

    const comSessao = await dirigir({
      corpo: { operacao: "apagar-tudo" },
      cabecalhos: { authorization: "Bearer jwt-de-mentira" },
      ambiente: AMBIENTE,
    });
    afirmar(
      "quem TEM credencial recebe a frase completa, que nomeia as operações — é informação útil para quem integra",
      OPERACOES.every((o) => String(comSessao.corpo?.erro?.mensagem).includes(o)) &&
        comSessao.log.length > 0,
      String(comSessao.corpo?.erro?.mensagem),
    );
    afirmar(
      "e nem um nem outro revela o `detalhe` interno na resposta",
      !Object.hasOwn(anonimo.corpo?.erro ?? {}, "detalhe") &&
        !Object.hasOwn(comSessao.corpo?.erro ?? {}, "detalhe"),
      JSON.stringify(comSessao.corpo?.erro),
    );
  }

  /* ── OS DOIS RAMOS QUE ERAM MORTOS ───────────────────────────────────── */

  {
    const semPost = await dirigir({ metodo: "GET", ambiente: AMBIENTE });
    afirmar(
      "método diferente de POST sai com 405 e o cabeçalho `Allow` — a operação é dado, e não verbo",
      semPost.status === 405 && semPost.cabecalhos.Allow === "POST",
      `HTTP ${semPost.status} Allow=${semPost.cabecalhos.Allow}`,
    );

    const semAmbiente = await dirigir({
      corpo: { operacao: OPERACAO_EXCLUIR },
      ambiente: {
        SUPABASE_URL: undefined,
        SUPABASE_CHAVE_PUBLICAVEL: undefined,
        SUPABASE_CHAVE_DE_SERVICO: undefined,
        VITE_SUPABASE_URL: undefined,
        VITE_SUPABASE_PUBLISHABLE_KEY: undefined,
      },
    });
    afirmar(
      "configuração ausente sai com 500 e o que falta vai para o LOG, nunca para a resposta",
      semAmbiente.status === CODIGO_HTTP[ERRO_CONFIGURACAO] &&
        semAmbiente.log.join(" ").includes("SUPABASE") &&
        !JSON.stringify(semAmbiente.corpo).includes("SUPABASE"),
      `HTTP ${semAmbiente.status} | resposta: ${JSON.stringify(semAmbiente.corpo)}`,
    );
  }

  /* ── E A GUARDA DO TRANSPORTE: DELETE sem filtro é impossível de emitir ── */
  //
  // Esta é a única chamada destrutiva do projeto, e um filtro ausente no
  // PostgREST não é um erro: é um `DELETE` na tabela inteira. A guarda mora no
  // lugar onde o comando é montado, e não depende de o chamador ter conferido.

  {
    const enderecos = [];
    const acesso = criarAcesso({
      url: "https://nao-existe.invalido",
      chavePublicavel: "sb_publishable_x",
      chaveDeServico: "sb_secret_x",
      buscar: async (endereco) => {
        enderecos.push(String(endereco));
        return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });

    const RUINS = ["", "   ", "nao-e-uuid", "*", null, undefined, 42, {}, "1=1"];
    const aceitos = [];
    for (const ruim of RUINS) {
      const r = await acesso.excluirPost(ruim);
      if (r.ok !== false) aceitos.push(JSON.stringify(ruim));
    }
    afirmar(
      `identificador ruim NÃO vira comando: nenhum dos ${RUINS.length} chegou à rede, e nenhum foi aceito`,
      aceitos.length === 0 && enderecos.length === 0,
      `aceitos: ${aceitos.join(", ")} | endereços emitidos: ${enderecos.join(" | ")}`,
    );

    /* CONTROLE POSITIVO. Sem ele, um `excluirPost` que recusasse TUDO faria a
       linha acima passar por vacuidade — e a exclusão pararia de funcionar com
       a suíte verde. */
    const bom = randomUUID();
    await acesso.excluirPost(bom);
    afirmar(
      "e o identificador bom vira comando COM filtro por id — nunca um DELETE na tabela inteira",
      enderecos.length === 1 &&
        enderecos[0].includes(`id=eq.${bom}`) &&
        enderecos[0].includes("/rest/v1/posts?"),
      enderecos.join(" | "),
    );

    /* A MESMA GUARDA NA EXCLUSÃO DE CATEGORIA (Story 2.14). Ela é a segunda
       chamada destrutiva do projeto, e a razão da guarda é idêntica: um filtro
       ausente no PostgREST é um `DELETE` em `categorias` inteira — que, com
       `on delete restrict`, falharia ruidosamente só se houvesse Post usando
       alguma delas. Nas outras, sumiria a taxonomia do blog em silêncio. */
    enderecos.length = 0;
    const aceitosNaCategoria = [];
    for (const ruim of RUINS) {
      const r = await acesso.excluirCategoria(ruim);
      if (r.ok !== false) aceitosNaCategoria.push(JSON.stringify(ruim));
    }
    afirmar(
      `identificador ruim de CATEGORIA também não vira comando: nenhum dos ${RUINS.length} chegou à rede`,
      aceitosNaCategoria.length === 0 && enderecos.length === 0,
      `aceitos: ${aceitosNaCategoria.join(", ")} | endereços emitidos: ${enderecos.join(" | ")}`,
    );
    const boaCategoria = randomUUID();
    await acesso.excluirCategoria(boaCategoria);
    afirmar(
      "e o identificador bom de Categoria vira comando COM filtro por id",
      enderecos.length === 1 &&
        enderecos[0].includes(`id=eq.${boaCategoria}`) &&
        enderecos[0].includes("/rest/v1/categorias?"),
      enderecos.join(" | "),
    );

    /* — A CONTAGEM VEM DA FAIXA, e faixa ilegível é FALHA, nunca zero ─────
       "Nenhum post depende desta categoria" é a frase mais perigosa que a
       recusa poderia ter: dita por engano, ela libera uma exclusão que
       desassociaria o arquivo inteiro se o banco não estivesse lá. */
    {
      const comFaixa = (faixa) =>
        criarAcesso({
          url: "https://nao-existe.invalido",
          chavePublicavel: "sb_publishable_x",
          chaveDeServico: "sb_secret_x",
          buscar: async () =>
            new Response("[]", {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                ...(faixa === null ? {} : { "Content-Range": faixa }),
              },
            }),
        });
      const doze = await comFaixa("0-0/12").contarPostsDaCategoria(randomUUID());
      afirmar(
        "a contagem de Posts de uma Categoria é lida da faixa do PostgREST, sem trazer linha nenhuma",
        doze.ok === true && doze.dados.total === 12,
        JSON.stringify(doze.dados ?? doze.mensagem),
      );
      const zero = await comFaixa("*/0").contarPostsDaCategoria(randomUUID());
      afirmar(
        "e zero é zero — a faixa sem intervalo continua sendo contagem",
        zero.ok === true && zero.dados.total === 0,
        JSON.stringify(zero.dados ?? zero.mensagem),
      );
      for (const [nome, faixa] of [
        ["sem cabeçalho", null],
        ["com total desconhecido", "0-0/*"],
        ["com lixo", "não é faixa"],
      ]) {
        const r = await comFaixa(faixa).contarPostsDaCategoria(randomUUID());
        afirmar(
          `faixa ${nome} vira FALHA, e nunca zero — um zero inventado liberaria a exclusão`,
          r.ok === false && r.codigo === "ContagemIlegivel",
          `ok: ${r.ok} | codigo: ${r.codigo}`,
        );
      }
    }
  }
}

/* ─── (c7) As operações de Categoria (Story 2.14) ────────────────────────── */

secao("(c7) Categorias: vocabulário fechado de cor e de ícone, e a recusa que conta");

{

  /* — `totalDaFaixa`, EXECUTADA sobre cada forma de faixa — */
  //
  // Ela é exportada, e nenhuma outra asserção a chamava: a contagem chegava
  // pelo caminho do acesso, então trocar a expressão por uma que devolvesse
  // sempre `0` faria "nenhum post depende desta categoria" ser dito sobre
  // qualquer resposta — a frase que LIBERA uma exclusão.
  {
    const CASOS = [
      ["0-0/12", 12],
      ["*/0", 0],
      ["0-24/25", 25],
      ["  0-0/7  ", 7],
      ["0-0/*", null],
      ["", null],
      [null, null],
      [undefined, null],
      ["não é faixa", null],
      ["0-0/", null],
      [12, null],
    ];
    const divergentes = CASOS.filter(([faixa, esperado]) => totalDaFaixa(faixa) !== esperado);
    afirmar(
      "`totalDaFaixa` lê o total das faixas legíveis e devolve AUSÊNCIA para as demais — nunca zero",
      divergentes.length === 0,
      divergentes
        .map(([f, e]) => JSON.stringify(f) + ": " + totalDaFaixa(f) + " (esperado " + e + ")"),
    );
    afirmar(
      "o corpus tem os DOIS vereditos representados — uma função que devolvesse sempre `null` também 'concordaria'",
      CASOS.some(([f]) => totalDaFaixa(f) !== null) &&
        CASOS.some(([f]) => totalDaFaixa(f) === null),
    );
  }

  /* — E A AGREGAÇÃO EMBUTIDA DO LADO DA LEITURA, pela MESMA regra — */
  //
  // `totalEmbutido` inventava o zero que `totalDaFaixa` se recusa a inventar: a
  // TELA lia `0` como "pode excluir" e oferecia excluir uma Categoria
  // possivelmente em uso. O `restrict` do banco salvaria o dado; a tela teria
  // mentido antes.
  {
    const CASOS = [
      [[{ count: 3 }], 3],
      [{ count: 0 }, 0],
      [[], null],
      [null, null],
      [undefined, null],
      [[{ count: "3" }], null],
      [[{ count: -1 }], null],
      [[{ count: 1.5 }], null],
      [[{}], null],
      ["3", null],
    ];
    const divergentes = CASOS.filter(([bruto, esperado]) => totalEmbutido(bruto) !== esperado);
    afirmar(
      "`totalEmbutido` devolve AUSÊNCIA para agregação ilegível — e nunca zero, que a tela leria como 'pode excluir'",
      divergentes.length === 0,
      divergentes.map(([b]) => JSON.stringify(b) + ": " + totalEmbutido(b)),
    );
  }

  /* — A DECISÃO QUE SUSTENTA DUAS GRAVAÇÕES SIMULTÂNEAS — */
  //
  // `resolverTags` insere TODAS as tags com `resolution=ignore-duplicates` e
  // relê depois. Trocar por `merge-duplicates` reescreveria o NOME de uma Tag
  // que já existe porque alguém digitou com outra caixa — "SEO" viraria "seo"
  // para todos os posts que já a usavam. E `on_conflict=slug` é o que diz ao
  // banco qual restrição ignorar; sem ele o `insert` estoura por unicidade.
  {
    const enderecos = [];
    const cabecalhos = [];
    const acesso = criarAcesso({
      url: "https://nao-existe.invalido",
      chavePublicavel: "sb_publishable_x",
      chaveDeServico: "sb_secret_x",
      buscar: async (endereco, opcoes) => {
        enderecos.push(String(endereco));
        cabecalhos.push(opcoes.headers ?? {});
        return new Response("[]", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });
    await acesso.inserirTags([{ nome: "Uma", slug: "uma" }]);
    afirmar(
      "a criação de Tag declara `on_conflict=slug` e IGNORA duplicata — mesclar reescreveria a grafia de quem cadastrou primeiro",
      enderecos.length === 1 &&
        enderecos[0].includes("on_conflict=slug") &&
        /resolution=ignore-duplicates/.test(String(cabecalhos[0].Prefer ?? "")) &&
        !/merge-duplicates/.test(String(cabecalhos[0].Prefer ?? "")),
      enderecos.join(" | ") + " | Prefer: " + String(cabecalhos[0]?.Prefer ?? ""),
    );
    /* LISTA VAZIA NÃO VAI À REDE — nem para inserir, nem para ler. */
    const antes = enderecos.length;
    await acesso.inserirTags([]);
    await acesso.tagsPorSlugs([]);
    afirmar(
      "lista vazia de Tag não emite pedido nenhum — pedir 'nenhuma tag' é legítimo, e custaria duas idas por gravação",
      enderecos.length === antes,
      enderecos.slice(antes).join(" | "),
    );
  }
  /* — A LEITURA DO CORPO: lista fechada, cor e ícone por lista de permissão — */

  afirmar(
    "a lista de campos aceitos de uma Categoria é fechada e congelada",
    Object.isFrozen(CAMPOS_DA_CATEGORIA) &&
      mesmoConjunto(CAMPOS_DA_CATEGORIA, [
        "id",
        "nome",
        "slug",
        "icone",
        "cor",
        "ordem",
        "operacao",
      ]),
    CAMPOS_DA_CATEGORIA.join(", "),
  );

  {
    const r = lerCorpoDaCategoria(
      { nome: "  Inteligência   Artificial  ", inventado: 1, criado_em: "1999-01-01" },
      { criando: true },
    );
    afirmar(
      "o nome é aparado e tem o espaço interno colapsado antes de virar dado",
      r.ok === true && r.campos.nome === "Inteligência Artificial",
      r.ok ? r.campos.nome : r.mensagem,
    );
    afirmar(
      "o endereço é DERIVADO do nome pela mesma `gerarSlug` que o Post usa",
      r.ok === true && r.campos.slug === "inteligencia-artificial",
      r.ok ? r.campos.slug : r.mensagem,
    );
    afirmar(
      "cor e ícone ausentes na criação recebem o padrão do vocabulário",
      r.ok === true && r.campos.cor === COR_PADRAO && r.campos.icone === ICONE_PADRAO,
      r.ok ? `${r.campos.cor} | ${r.campos.icone}` : r.mensagem,
    );
    afirmar(
      "campo fora da lista é IGNORADO com nome, e não chega às colunas",
      r.ok === true &&
        mesmoConjunto(r.ignorados, ["inventado", "criado_em"]) &&
        !Object.hasOwn(r.campos, "criado_em"),
      JSON.stringify(r.ignorados ?? r.mensagem),
    );
  }

  for (const [nome, corpo, padrao] of [
    ["criar sem nome", {}, /precisa de um nome/i],
    ["nome vazio", { nome: "   " }, /precisa de um nome/i],
    ["nome longo demais", { nome: "a".repeat(200) }, /caracteres/i],
    ["nome que não vira endereço", { nome: "!!! ???" }, /letra|endereço/i],
    ["endereço fora do formato", { nome: "Boa", slug: "Com Espaço" }, /endereço/i],
    ["cor fora do vocabulário", { nome: "Boa", cor: "red" }, /cor/i],
    ["cor que é classe utilitária", { nome: "Boa", cor: "bg-red-500" }, /cor/i],
    ["cor que é hex solto", { nome: "Boa", cor: "#ff0000" }, /cor/i],
    ["ícone fora do mapa", { nome: "Boa", icone: "flask" }, /ícone/i],
    ["ícone com nome herdado do protótipo", { nome: "Boa", icone: "constructor" }, /ícone/i],
    ["ordem negativa", { nome: "Boa", ordem: -1 }, /ordem/i],
    ["ordem fracionária", { nome: "Boa", ordem: 1.5 }, /ordem/i],
    [
      "ordem acima do teto",
      { nome: "Boa", ordem: ORDEM_MAXIMA_DA_CATEGORIA + 1 },
      /ordem/i,
    ],
  ]) {
    const r = lerCorpoDaCategoria(corpo, { criando: true });
    afirmar(
      `${nome} é recusado com a frase que nomeia o campo`,
      r.ok === false && padrao.test(r.mensagem),
      r.ok ? "ACEITOU" : r.mensagem,
    );
  }

  afirmar(
    "toda cor do vocabulário É aceita — a lista de permissão não pode recusar o que ela mesma declara",
    CORES_DE_CATEGORIA.every(
      (cor) => lerCorpoDaCategoria({ nome: "Boa", cor }, { criando: true }).ok === true,
    ),
    CORES_DE_CATEGORIA.filter(
      (cor) => lerCorpoDaCategoria({ nome: "Boa", cor }, { criando: true }).ok !== true,
    ).join(", "),
  );
  afirmar(
    "e todo ícone do mapa também",
    CHAVES_DE_ICONE_DE_CATEGORIA.every(
      (icone) => lerCorpoDaCategoria({ nome: "Boa", icone }, { criando: true }).ok === true,
    ),
    CHAVES_DE_ICONE_DE_CATEGORIA.filter(
      (icone) => lerCorpoDaCategoria({ nome: "Boa", icone }, { criando: true }).ok !== true,
    ).join(", "),
  );

  /* Editar preserva o que não veio — e um pedido que não muda nada é recusado
     em vez de virar um `PATCH` vazio que o PostgREST responde com 2xx. */
  {
    const so = lerCorpoDaCategoria({ nome: "Novo Nome" }, { criando: false });
    afirmar(
      "editar só o nome não inventa cor, ícone nem endereço",
      so.ok === true &&
        Object.keys(so.campos).length === 1 &&
        so.campos.nome === "Novo Nome",
      JSON.stringify(so.campos ?? so.mensagem),
    );
    const nada = lerCorpoDaCategoria({}, { criando: false });
    afirmar(
      "pedido de edição sem nada para mudar é recusado, e não vira comando vazio",
      nada.ok === false && /nada para mudar/i.test(nada.mensagem),
      nada.ok ? "ACEITOU" : nada.mensagem,
    );
  }

  /* — AS DUAS OPERAÇÕES, EXECUTADAS COM ACESSO DE MENTIRA — */

  /* A ORDEM DA AUTORIZAÇÃO: token válido E cadastro, nessa ordem, SEMPRE antes
     de escrever. É a mesma exigência das operações de Post, e ela precisa de
     asserção própria aqui — apagar `perfilOuFalha` de uma operação nova não
     quebraria nada das outras. */
  for (const [nome, executar] of [
    ["salvar", (a, t) => salvarCategoria({ token: t, corpo: { nome: "X" }, acesso: a })],
    ["excluir", (a, t) => excluirCategoria({ token: t, corpo: { id: randomUUID() }, acesso: a })],
  ]) {
    {
      const acesso = acessoDeTeste();
      const r = await executar(acesso, "");
      afirmar(
        `${nome} categoria SEM token é recusado por permissão, e nada foi pedido ao banco`,
        r.ok === false && r.erro.tipo === ERRO_PERMISSAO && acesso.escritas().length === 0,
        r.ok ? "PASSOU" : `tipo ${r.erro.tipo} | escritas: ${acesso.escritas().length}`,
      );
      afirmar(
        `e a frase de ${nome} fala de CATEGORIA, não de post`,
        r.ok === false && /categoria/i.test(r.erro.mensagem) && !/post/i.test(r.erro.mensagem),
        r.ok ? "" : r.erro.mensagem,
      );
    }
    {
      const acesso = acessoDeTeste({ perfil: null });
      const r = await executar(acesso, "bom");
      afirmar(
        `${nome} categoria por Conta SEM cadastro é recusado — autenticar não é autorizar`,
        r.ok === false &&
          r.erro.tipo === ERRO_PERMISSAO &&
          /cadastrada no Painel/i.test(r.erro.mensagem) &&
          acesso.escritas().length === 0,
        r.ok ? "PASSOU" : `tipo ${r.erro.tipo}: ${r.erro.mensagem}`,
      );
      afirmar(
        `e o cadastro é conferido ANTES de a tabela ser tocada em ${nome}`,
        acesso.chamadas.findIndex((c) => c.nome === "perfilDaConta") <
          (acesso.chamadas.findIndex((c) =>
            ["inserirCategoria", "atualizarCategoria", "excluirCategoria"].includes(c.nome),
          ) === -1
            ? Number.POSITIVE_INFINITY
            : acesso.chamadas.findIndex((c) =>
                ["inserirCategoria", "atualizarCategoria", "excluirCategoria"].includes(c.nome),
              )),
        acesso.chamadas.map((c) => c.nome).join(" > "),
      );
    }
  }

  /* AS COLUNAS SÃO MONTADAS À MÃO. O corpo não é espalhado sobre o comando: se
     fosse, `criado_em` e `id` viajariam de carona num pedido que só queria
     renomear — é a mesma regra que `definirDestaque` fixou na Story 2.12. */
  {
    const acesso = acessoDeTeste({ categoria: { id: "ok", nome: "Antiga" } });
    const r = await salvarCategoria({
      token: "bom",
      corpo: {
        nome: "Nova",
        criado_em: "1999-01-01T00:00:00Z",
        atualizado_em: "1999-01-01T00:00:00Z",
        posts: 0,
        operacao: OPERACAO_SALVAR_CATEGORIA,
      },
      acesso,
    });
    const enviado = acesso.chamadas.find((c) => c.nome === "inserirCategoria")?.argumentos[0] ?? {};
    afirmar(
      "o comando de Categoria carrega SÓ as colunas montadas à mão — nada de carona",
      r.ok === true &&
        mesmoConjunto(Object.keys(enviado), ["nome", "slug", "cor", "icone"]) &&
        !Object.hasOwn(enviado, "criado_em"),
      JSON.stringify(Object.keys(enviado)),
    );
    afirmar(
      "`operacao` não é relatada como ignorada — ela é o campo que escolheu esta porta",
      r.ok === true && !r.dados.ignorados.includes("operacao"),
      JSON.stringify(r.dados?.ignorados),
    );
  }

  /* A COLISÃO DIZ QUAL JÁ EXISTE. "Já existe uma categoria assim" manda a
     pessoa procurar; dizer o nome resolve na hora. */
  {
    const acesso = acessoDeTeste({
      donoDoNome: { id: randomUUID(), nome: "Analytics", slug: "analytics" },
    });
    const r = await salvarCategoria({ token: "bom", corpo: { nome: "Analytics" }, acesso });
    afirmar(
      "nome repetido é CONFLITO, e a recusa nomeia a categoria que já existe",
      r.ok === false &&
        r.erro.tipo === ERRO_CONFLITO &&
        r.erro.mensagem.includes("Analytics"),
      r.ok ? "ACEITOU" : `${r.erro.tipo}: ${r.erro.mensagem}`,
    );
    afirmar(
      "e nada foi criado",
      acesso.escritas().length === 0,
      acesso.escritas().map((c) => c.nome).join(", "),
    );
  }
  {
    const acesso = acessoDeTeste({
      donoDoSlug: { id: randomUUID(), nome: "Análise de Dados", slug: "analytics" },
    });
    const r = await salvarCategoria({
      token: "bom",
      corpo: { nome: "Outro Nome", slug: "analytics" },
      acesso,
    });
    afirmar(
      "endereço repetido é CONFLITO, e a recusa nomeia a dona dele",
      r.ok === false &&
        r.erro.tipo === ERRO_CONFLITO &&
        r.erro.mensagem.includes("Análise de Dados"),
      r.ok ? "ACEITOU" : `${r.erro.tipo}: ${r.erro.mensagem}`,
    );
  }
  /* E EDITAR A SI MESMA NÃO É COLISÃO: renomear "Analytics" para "Analytics"
     (ou mexer só na cor) não pode bater na própria linha. */
  {
    const eu = { id: randomUUID(), nome: "Analytics", slug: "analytics" };
    const acesso = acessoDeTeste({ categoria: eu, donoDoNome: eu, donoDoSlug: eu });
    const r = await salvarCategoria({
      token: "bom",
      corpo: { id: eu.id, nome: "Analytics", cor: CORES_DE_CATEGORIA[1] },
      acesso,
    });
    afirmar(
      "editar a própria Categoria mantendo o nome NÃO é conflito consigo mesma",
      r.ok === true,
      r.ok ? "" : `${r.erro.tipo}: ${r.erro.mensagem}`,
    );
  }

  /* — EXCLUIR: a recusa CONTA, e diz o número — */

  {
    const alvo = { id: randomUUID(), nome: "Estratégia", slug: "estrategia" };
    for (const [quantos, esperado] of [
      [1, "1 post depende"],
      [3, "3 posts dependem"],
    ]) {
      const acesso = acessoDeTeste({ categoria: alvo, postsDaCategoria: quantos });
      const r = await excluirCategoria({ token: "bom", corpo: { id: alvo.id }, acesso });
      afirmar(
        `excluir Categoria usada por ${quantos} Post(s) é recusado DIZENDO o número`,
        r.ok === false &&
          r.erro.tipo === ERRO_CONFLITO &&
          r.erro.mensagem.includes(esperado) &&
          r.erro.mensagem.includes(alvo.nome),
        r.ok ? "ACEITOU" : `${r.erro.tipo}: ${r.erro.mensagem}`,
      );
      afirmar(
        `e o comando de exclusão NÃO chegou a ser emitido para ${quantos}`,
        !acesso.chamadas.some((c) => c.nome === "excluirCategoria"),
        acesso.chamadas.map((c) => c.nome).join(" > "),
      );
    }
    /* A frase é EXECUTADA, e não casada por regex sobre o texto do arquivo:
       singular e plural são a marca de um texto que alguém leu. */
    afirmar(
      "a frase da recusa por uso concorda em número, e nomeia a Categoria",
      fraseDeCategoriaEmUso("Analytics", 1).includes("1 post depende") &&
        fraseDeCategoriaEmUso("Analytics", 2).includes("2 posts dependem") &&
        fraseDeCategoriaEmUso("Analytics", 1).includes("Analytics"),
      `${fraseDeCategoriaEmUso("Analytics", 1)} | ${fraseDeCategoriaEmUso("Analytics", 2)}`,
    );

    const acesso = acessoDeTeste({ categoria: alvo, postsDaCategoria: 0 });
    const r = await excluirCategoria({ token: "bom", corpo: { id: alvo.id }, acesso });
    afirmar(
      "Categoria SEM uso é excluída, e a resposta carrega a linha que saiu",
      r.ok === true &&
        r.dados.operacao === OPERACAO_EXCLUIR_CATEGORIA &&
        r.dados.categoria?.id === alvo.id,
      r.ok ? "" : `${r.erro.tipo}: ${r.erro.mensagem}`,
    );

    /* E A CORRIDA: a contagem disse zero e o banco recusou mesmo assim. É o
       caso em que `on delete restrict` é a única defesa — e a frase precisa
       dizer o que houve, não "algo saiu do previsto". */
    const emCorrida = acessoDeTeste({
      categoria: alvo,
      postsDaCategoria: 0,
      respostaDaExclusaoDeCategoria: {
        ok: false,
        status: 409,
        codigo: "23503",
        mensagem:
          'update or delete on table "categorias" violates foreign key constraint "posts_categoria_id_fkey" on table "posts"',
        dados: null,
      },
    });
    const perdeu = await excluirCategoria({ token: "bom", corpo: { id: alvo.id }, acesso: emCorrida });
    afirmar(
      "quando o BANCO recusa mesmo assim, a frase diz que há posts usando — e não “algo saiu do previsto”",
      perdeu.ok === false &&
        perdeu.erro.tipo === ERRO_CONFLITO &&
        /posts usando/i.test(perdeu.erro.mensagem),
      perdeu.ok ? "ACEITOU" : `${perdeu.erro.tipo}: ${perdeu.erro.mensagem}`,
    );
  }

  /* Categoria que já saiu é AUSÊNCIA, e não sucesso silencioso — o caminho
     normal de duas abas do Painel abertas. */
  {
    const acesso = acessoDeTeste({ categoria: null });
    const r = await excluirCategoria({ token: "bom", corpo: { id: randomUUID() }, acesso });
    afirmar(
      "excluir Categoria que já não existe é AUSÊNCIA, e nada é pedido ao banco",
      r.ok === false &&
        r.erro.tipo === ERRO_NAO_ENCONTRADO &&
        acesso.escritas().length === 0,
      r.ok ? "PASSOU" : `${r.erro.tipo} | escritas: ${acesso.escritas().length}`,
    );
    const editar = await salvarCategoria({
      token: "bom",
      corpo: { id: randomUUID(), nome: "Qualquer" },
      acesso: acessoDeTeste({ categoria: null }),
    });
    afirmar(
      "editar Categoria que já não existe também é AUSÊNCIA, não defeito",
      editar.ok === false && editar.erro.tipo === ERRO_NAO_ENCONTRADO,
      editar.ok ? "PASSOU" : editar.erro.tipo,
    );
  }

  /* — TAG POR NOME: reaproveita a que existe, cria a que falta — */

  {
    const existente = {
      id: randomUUID(),
      nome: "Atendimento",
      slug: "atendimento",
    };
    /* O "banco" do dublê: ele começa com UMA Tag e é ele que diz quantas
       passaram a existir depois. Contar aqui é o que distingue "reaproveitou"
       de "criou uma segunda com o mesmo assunto". */
    const bancoDeTags = [existente];
    const acesso = acessoDeTeste({ tagsExistentes: bancoDeTags });
    const r = await salvarPost({
      token: "bom",
      corpo: corpoValido({ tags: ["atendimento", "Inteligência Artificial"] }),
      acesso,
    });
    const criadas = acesso.chamadas.find((c) => c.nome === "inserirTags")?.argumentos[0] ?? [];
    const gravadas = acesso.chamadas.find((c) => c.nome === "definirTags")?.argumentos[0].tags ?? [];
    afirmar(
      "a Tag que JÁ EXISTE é reaproveitada — o identificador gravado é o dela",
      r.ok === true && gravadas.includes(existente.id),
      `gravadas: ${JSON.stringify(gravadas)} | existente: ${existente.id}`,
    );
    afirmar(
      "e a grafia dela NÃO é reescrita: quem cadastrou primeiro escolheu o nome",
      r.ok === true && r.dados.tags.includes("Atendimento"),
      JSON.stringify(r.dados?.tags),
    );
    /* O PEDIDO DE INSERÇÃO CARREGA AS DUAS, e isso é deliberado: o banco tem
       `on conflict (slug) do nothing`, e mandar só as que "faltam" exigiria
       ler antes — deixando uma janela em que duas gravações simultâneas do
       mesmo nome tentam inserir a mesma linha e a segunda estoura por
       unicidade. Quem decide o que existe é o banco, não esta função. */
    afirmar(
      "o pedido de inserção carrega TODAS as tags digitadas, com nome e endereço do domínio",
      criadas.length === 2 &&
        criadas.every((t) => t.slug === chaveDaTag(t.nome)) &&
        criadas.map((t) => t.slug).join(",") === "atendimento,inteligencia-artificial",
      JSON.stringify(criadas),
    );
    afirmar(
      "e só a que NÃO existia passa a existir — a duplicata é ignorada pelo banco",
      bancoDeTags.length === 2 &&
        bancoDeTags.filter((t) => t.slug === "atendimento").length === 1,
      JSON.stringify(bancoDeTags.map((t) => t.slug)),
    );
    afirmar(
      "e as duas viram associação — nenhuma Tag some no caminho",
      r.ok === true && gravadas.length === 2,
      JSON.stringify(gravadas),
    );
  }

  /* TAG QUE NÃO VOLTA DO BANCO É FALHA, e nunca descarte silencioso: o Autor
     salvaria cinco tags e reabriria com quatro. */
  {
    const acesso = acessoDeTeste({
      respostaDaLeituraDeTags: { ok: true, status: 200, dados: [] },
    });
    const r = await salvarPost({
      token: "bom",
      corpo: corpoValido({ tags: ["Alguma"] }),
      acesso,
    });
    afirmar(
      "Tag que não volta do banco vira FALHA — nenhuma some em silêncio",
      r.ok === false && /tags/i.test(r.erro.mensagem),
      r.ok ? "ACEITOU" : `${r.erro.tipo}: ${r.erro.mensagem}`,
    );
    afirmar(
      "e `definirTags` não chegou a ser chamada com a lista incompleta",
      !acesso.chamadas.some((c) => c.nome === "definirTags"),
      acesso.chamadas.map((c) => c.nome).join(" > "),
    );
  }

  /* LISTA VAZIA NÃO VAI À REDE. Pedir "nenhuma tag" é legítimo (é como se
     limpam as tags de um Post), e virar duas chamadas inúteis por pedido
     custaria prazo num orçamento que já é compartilhado. */
  {
    const acesso = acessoDeTeste();
    const r = await salvarPost({
      token: "bom",
      corpo: corpoValido({ tags: [] }),
      acesso,
    });
    afirmar(
      "pedir nenhuma tag não consulta nem cria nada — mas AINDA chama `definirTags`, que é o que limpa",
      r.ok === true &&
        !acesso.chamadas.some((c) => c.nome === "inserirTags") &&
        !acesso.chamadas.some((c) => c.nome === "tagsPorSlugs") &&
        acesso.chamadas.some((c) => c.nome === "definirTags"),
      acesso.chamadas.map((c) => c.nome).join(" > "),
    );
  }
}

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
      // O cliente tenta ditar tudo o que não pode. `estado` NÃO está aqui: sem
      // pedido de transição, o Post nasce pelo padrão da coluna — é o caso que
      // esta gravação exercita, e o pedido de transição tem bloco próprio.
      conteudo_html: "<script>alert(1)</script>",
      publicado_em: "2000-01-01T00:00:00Z",
      autor_id: "99999999-9999-9999-9999-999999999999",
      autor_nome: "Nome de Outra Pessoa",
      campo_inventado: 1,
      /* Story 2.12. `destaque` precisa ser IGNORADO com nome — aceitá-lo faria
         a gaveta mudar o Destaque de passagem. E `operacao` precisa NÃO ser
         relatado: ele é o campo que o próprio cliente manda de propósito, e
         avisar que ele foi descartado seria a tela pedindo desculpa por si. */
      destaque: true,
      operacao: OPERACAO_SALVAR,
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
      "sem pedido de transição, `estado` não vai ao comando — o padrão da coluna faz o Post nascer rascunho",
      !Object.hasOwn(enviado, "estado"),
      Object.keys(enviado).join(", "),
    );
    /* `publicado_em` DEIXOU de ser ignorado na Story 2.6 — e aqui ele veio no
       corpo, então tem de chegar ao banco, normalizado em UTC. Ele não é
       forçado para agora porque não houve transição para `publicado`: quem
       decide a data é a transição, e aqui não há nenhuma. */
    afirmar(
      "`publicado_em` é enviado ao banco, normalizado em UTC",
      enviado.publicado_em === "2000-01-01T00:00:00.000Z",
      String(enviado.publicado_em),
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
      "`destaque` e `operacao` NÃO chegam ao banco — um é da outra operação, o outro nem é campo do Post",
      !Object.hasOwn(enviado, "destaque") && !Object.hasOwn(enviado, "operacao"),
      Object.keys(enviado).join(", "),
    );
    afirmar(
      "a resposta relata o que foi ignorado, com nome",
      mesmoConjunto(r.dados.ignorados, [
        "conteudo_html",
        "autor_id",
        "autor_nome",
        "destaque",
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

/* ─── O CICLO DE VIDA DO ENDEREÇO (Story 2.6) ─────────────────────────────
   A Story 2.5 RECUSAVA trocar o endereço de um Post que já esteve no ar, porque
   aposentar o anterior exige escrever em duas tabelas atomicamente e o PostgREST
   faz uma por chamada. A função de banco `aposentar_slug_do_post` é o que
   faltava — e a recusa vira o caminho completo. */
{
  const PUBLICADO = Object.freeze({
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    slug: "endereco-antigo",
    estado: "publicado",
    // No PASSADO: é o que faz o Post já ter estado visível sob a política de
    // leitura anônima, e portanto ter link a preservar.
    publicado_em: "2026-01-01T00:00:00Z",
    autor_id: "99999999-9999-9999-9999-999999999999",
    autor_nome: "Autor Original",
  });

  /* Troca de endereço de Post no ar: aposenta o anterior, PELA FUNÇÃO DE BANCO,
     e o comando comum não repete o slug — mandá-lo de novo dispararia o gatilho
     de unicidade contra a linha de aposentadoria recém-criada. */
  {
    const acesso = acessoDeTeste({ post: PUBLICADO });
    const r = await salvarPost({
      token: "bom",
      corpo: corpoValido({ id: PUBLICADO.id, slug: "endereco-novo" }),
      acesso,
    });
    const aposentadoria = acesso.chamadas.find((c) => c.nome === "aposentarSlug");
    const atualizacao = acesso.chamadas.find((c) => c.nome === "atualizarPost");
    afirmar(
      "trocar o endereço de um Post que já esteve no ar é ACEITO",
      r.ok === true,
      r.ok ? "" : `${r.erro.tipo}: ${r.erro.mensagem}`,
    );
    afirmar(
      "e a troca passa pela função de banco que aposenta o anterior na mesma transação",
      aposentadoria?.argumentos[0]?.id === PUBLICADO.id &&
        aposentadoria?.argumentos[0]?.slugNovo === "endereco-novo",
      JSON.stringify(aposentadoria?.argumentos[0] ?? null),
    );
    afirmar(
      "o comando comum de atualização NÃO repete o slug já trocado pela função",
      atualizacao !== undefined && !Object.hasOwn(atualizacao.argumentos[0], "slug"),
      Object.keys(atualizacao?.argumentos[0] ?? {}).join(", "),
    );
  }

  /* FALHA EM UMA DESFAZ A OUTRA. A atomicidade real é do Postgres — o corpo de
     uma função é uma transação —, e o que se prova aqui é a outra metade: se a
     aposentadoria falhar, o núcleo NÃO segue gravando. Sem esta guarda, o Post
     receberia o endereço novo pelo comando comum e o antigo ficaria sem
     destino. */
  {
    const acesso = acessoDeTeste({
      post: PUBLICADO,
      respostaDaAposentadoria: {
        ok: false,
        status: 409,
        codigo: "23505",
        mensagem: "slug já está em uso",
      },
    });
    const r = await salvarPost({
      token: "bom",
      corpo: corpoValido({ id: PUBLICADO.id, slug: "endereco-novo" }),
      acesso,
    });
    afirmar(
      "aposentadoria que falha interrompe a gravação — a metade que sobrou não é gravada",
      r.ok === false && r.erro.tipo === ERRO_CONFLITO,
      r.ok ? "GRAVOU MESMO ASSIM" : `tipo ${r.erro.tipo}`,
    );
    afirmar(
      "e o comando comum de atualização não chegou a ser chamado",
      !acesso.chamadas.some((c) => c.nome === "atualizarPost"),
      acesso.chamadas.map((c) => c.nome).join(", "),
    );
  }

  /* Rascunho nunca esteve visível: troca de endereço à vontade, e SEM criar uma
     linha de aposentadoria para um endereço que ninguém viu — ela só bloquearia
     o reúso daquele endereço por outro Post. */
  {
    const rascunho = { ...PUBLICADO, estado: "rascunho", publicado_em: null };
    const acesso = acessoDeTeste({ post: rascunho });
    const r = await salvarPost({
      token: "bom",
      corpo: corpoValido({ id: rascunho.id, slug: "endereco-novo" }),
      acesso,
    });
    afirmar(
      "rascunho troca de endereço à vontade — nunca teve URL para quebrar",
      r.ok === true &&
        acesso.chamadas.find((c) => c.nome === "atualizarPost")?.argumentos[0]?.slug ===
          "endereco-novo",
      r.ok ? "slug não veio no comando" : `${r.erro.tipo}`,
    );
    afirmar(
      "e nenhum endereço é aposentado por um rascunho que nunca esteve no ar",
      !acesso.chamadas.some((c) => c.nome === "aposentarSlug"),
      acesso.chamadas.map((c) => c.nome).join(", "),
    );
  }

  /* RASCUNHO COM DATA FUTURA continua sendo rascunho. A 2.5 lia
     `publicado_em !== null` como "já esteve no ar", e isso deixou de servir
     quando a gaveta passou a preencher a data: um rascunho agendado para o mês
     que vem aposentaria endereços que ninguém nunca viu. */
  {
    const futuro = {
      ...PUBLICADO,
      estado: "rascunho",
      publicado_em: new Date(Date.now() + 86_400_000).toISOString(),
    };
    const acesso = acessoDeTeste({ post: futuro });
    const r = await salvarPost({
      token: "bom",
      corpo: corpoValido({ id: futuro.id, slug: "endereco-novo" }),
      acesso,
    });
    afirmar(
      "rascunho com data de publicação FUTURA não aposenta endereço — ele nunca esteve visível",
      r.ok === true && !acesso.chamadas.some((c) => c.nome === "aposentarSlug"),
      acesso.chamadas.map((c) => c.nome).join(", "),
    );
  }

  // Salvar o texto SEM mexer no endereço continua funcionando num publicado —
  // e sem aposentar nada, senão o caso comum criaria lixo a cada salvamento.
  {
    const acesso = acessoDeTeste({ post: PUBLICADO });
    const r = await salvarPost({
      token: "bom",
      corpo: corpoValido({ id: PUBLICADO.id, slug: PUBLICADO.slug }),
      acesso,
    });
    afirmar(
      "salvar um Post publicado mantendo o endereço continua funcionando, sem aposentar nada",
      r.ok === true && !acesso.chamadas.some((c) => c.nome === "aposentarSlug"),
      r.ok ? acesso.chamadas.map((c) => c.nome).join(", ") : `${r.erro.tipo}: ${r.erro.mensagem}`,
    );
  }

  /* ── A COLISÃO É SINALIZADA ANTES DE GRAVAR ─────────────────────────────
     Contra Post ativo e contra endereço aposentado — e o "antes" importa:
     descobrir pela violação de unicidade transforma um aviso em erro de banco,
     depois de a pessoa ter escrito o artigo inteiro. */
  {
    const acesso = acessoDeTeste({
      donoAtivo: { id: "cccccccc-cccc-cccc-cccc-cccccccccccc", slug: "ja-existe" },
    });
    const r = await salvarPost({
      token: "bom",
      corpo: corpoValido({ slug: "ja-existe" }),
      acesso,
    });
    afirmar(
      "endereço em uso por Post ATIVO é conflito, sinalizado antes de gravar",
      r.ok === false && r.erro.tipo === ERRO_CONFLITO,
      r.ok ? "GRAVOU" : `tipo ${r.erro.tipo}`,
    );
    afirmar(
      "e nada foi gravado — nem o insert, nem a leitura do perfil do Autor",
      acesso.escritas().length === 0 &&
        !acesso.chamadas.some((c) => c.nome === "perfilDaConta"),
      acesso.chamadas.map((c) => c.nome).join(", "),
    );
  }
  {
    const acesso = acessoDeTeste({
      donoAposentado: {
        slug: "endereco-de-outro",
        post_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      },
    });
    const r = await salvarPost({
      token: "bom",
      corpo: corpoValido({ slug: "endereco-de-outro" }),
      acesso,
    });
    afirmar(
      "endereço APOSENTADO por outro Post também é conflito, e também antes de gravar",
      r.ok === false && r.erro.tipo === ERRO_CONFLITO,
      r.ok ? "GRAVOU" : `tipo ${r.erro.tipo}`,
    );
    afirmar(
      "a frase explica que o endereço redireciona para outro post",
      r.ok === false && /redirecionando/i.test(r.erro.mensagem),
      r.ok ? "" : r.erro.mensagem,
    );
    afirmar("e nada foi gravado", acesso.escritas().length === 0);
  }

  /* A EXCEÇÃO DELIBERADA: o Post retoma um endereço que já foi DELE. É o
     desfazer de uma renomeação, e a linha de aposentadoria precisa sair junto —
     senão o mesmo endereço ficaria ativo e aposentado ao mesmo tempo. */
  {
    const acesso = acessoDeTeste({
      post: PUBLICADO,
      donoAposentado: { slug: "endereco-de-antes", post_id: PUBLICADO.id },
    });
    const r = await salvarPost({
      token: "bom",
      corpo: corpoValido({ id: PUBLICADO.id, slug: "endereco-de-antes" }),
      acesso,
    });
    afirmar(
      "o Post pode RETOMAR um endereço aposentado que é dele mesmo",
      r.ok === true,
      r.ok ? "" : `${r.erro.tipo}: ${r.erro.mensagem}`,
    );
    afirmar(
      "e a retomada passa pela função de banco, que é quem apaga a linha de aposentadoria",
      acesso.chamadas.some(
        (c) => c.nome === "aposentarSlug" && c.argumentos[0].slugNovo === "endereco-de-antes",
      ),
      acesso.chamadas.map((c) => c.nome).join(", "),
    );
  }

  /* Um rascunho que nunca esteve no ar retomando o PRÓPRIO endereço aposentado
     também precisa da função: a linha de aposentadoria existe e tem de sair.
     Este é o caso que uma leitura apressada ("rascunho não aposenta") deixaria
     passar, e o resultado seria o mesmo endereço em duas tabelas. */
  {
    const rascunho = { ...PUBLICADO, estado: "rascunho", publicado_em: null };
    const acesso = acessoDeTeste({
      post: rascunho,
      donoAposentado: { slug: "endereco-de-antes", post_id: rascunho.id },
    });
    const r = await salvarPost({
      token: "bom",
      corpo: corpoValido({ id: rascunho.id, slug: "endereco-de-antes" }),
      acesso,
    });
    afirmar(
      "rascunho que retoma o PRÓPRIO endereço aposentado também passa pela função de banco",
      r.ok === true && acesso.chamadas.some((c) => c.nome === "aposentarSlug"),
      r.ok ? acesso.chamadas.map((c) => c.nome).join(", ") : `${r.erro.tipo}`,
    );
  }
}

/* ─── Os metadados da gaveta, no comando de escrita ───────────────────────── */
{
  const acesso = acessoDeTeste();
  const r = await salvarPost({
    token: "bom",
    corpo: corpoValido({
      categoria_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      // Story 2.14: NOMES, e não identificadores.
      tags: ["Atendimento", "Automação"],
      publicado_em: "2026-08-17T03:30:00Z",
      tempo_leitura: 7,
      estado: "publicado",
    }),
    acesso,
  });
  const enviado = acesso.chamadas.find((c) => c.nome === "inserirPost")?.argumentos[0] ?? {};
  afirmar("a gravação com metadados é aceita", r.ok === true, r.ok ? "" : JSON.stringify(r.erro));
  afirmar(
    "`categoria_id`, `publicado_em` e `tempo_leitura` chegam ao banco como colunas",
    enviado.categoria_id === "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee" &&
      enviado.publicado_em === "2026-08-17T03:30:00.000Z" &&
      enviado.tempo_leitura === 7,
    JSON.stringify({
      categoria_id: enviado.categoria_id,
      publicado_em: enviado.publicado_em,
      tempo_leitura: enviado.tempo_leitura,
    }),
  );
  afirmar(
    "`tags` NÃO vai no comando de `posts` — ela é associação, e vai pela função de banco",
    !Object.hasOwn(enviado, "tags") &&
      acesso.chamadas.some((c) => c.nome === "definirTags" && c.argumentos[0].tags.length === 2),
    Object.keys(enviado).join(", "),
  );
  /* E O QUE CHEGA À FUNÇÃO DE BANCO SÃO IDENTIFICADORES, não os nomes que a
     tela digitou: `definir_tags_do_post` recusa identificador inexistente com
     23503, e mandar nome para lá viraria erro de tipo. Quem traduz é
     `resolverTags`, e é ele que cria a Tag que ainda não existia. */
  {
    const idsGravados =
      acesso.chamadas.find((c) => c.nome === "definirTags")?.argumentos[0].tags ?? [];
    afirmar(
      "o que chega a `definirTags` são IDENTIFICADORES, resolvidos a partir dos nomes",
      idsGravados.length === 2 && idsGravados.every((id) => PADRAO_UUID.test(id)),
      JSON.stringify(idsGravados),
    );
    const criadas =
      acesso.chamadas.find((c) => c.nome === "inserirTags")?.argumentos[0] ?? [];
    afirmar(
      "as Tags digitadas são criadas com nome E endereço, e o endereço é o slug do domínio",
      criadas.length === 2 &&
        criadas.every((t) => t.slug === chaveDaTag(t.nome)) &&
        criadas.map((t) => t.slug).join(",") === "atendimento,automacao",
      JSON.stringify(criadas),
    );
  }
  /* O Post NASCE PUBLICADO quando o Autor pede a transição junto da criação —
     é o "Publicar agora" de um Post que ainda não existe. A partida é
     `rascunho`, o padrão da coluna, e a máquina declara esse caminho. A data
     enviada está no PASSADO, então ela é conservada: forçar "agora" aqui
     reescreveria uma data que o Autor escolheu. */
  afirmar(
    "`estado` pedido na criação entra no comando, validado contra a máquina",
    enviado.estado === "publicado" && !r.dados.ignorados.includes("estado"),
    `estado: ${enviado.estado} | ignorados: ${(r.dados?.ignorados ?? []).join(", ")}`,
  );
}

/* A data de publicação exige INSTANTE completo. Data civil (`2026-08-17`) é
   meia-noite em UTC para o `Date.parse`, e meia-noite UTC é 21h do dia anterior
   em São Paulo: aceitá-la publicaria o Post um dia antes do combinado, sem
   ninguém ver a conversão acontecer. */
{
  for (const [nome, valor] of [
    ["data civil sem hora", "2026-08-17"],
    ["hora sem deslocamento", "2026-08-17T00:30"],
    ["texto qualquer", "amanhã de manhã"],
    ["dia que não existe", "2026-02-31T10:00:00Z"],
  ]) {
    const r = lerCorpo(
      { titulo: "t", slug: "s", resumo: "r", conteudo: DOCUMENTO_COMPLETO, publicado_em: valor },
      { criando: true },
    );
    afirmar(
      `data de publicação como ${nome} é recusada, com o motivo`,
      r.ok === false && /data de publicação/i.test(r.mensagem),
      r.ok ? "ACEITOU" : r.mensagem,
    );
  }
  const bom = lerCorpo(
    {
      titulo: "t",
      slug: "s",
      resumo: "r",
      conteudo: DOCUMENTO_COMPLETO,
      // 00h30 em São Paulo, escrito com o deslocamento explícito.
      publicado_em: "2026-08-17T00:30:00-03:00",
    },
    { criando: true },
  );
  afirmar(
    "instante com deslocamento é aceito e normalizado em UTC",
    bom.ok === true && bom.campos.publicado_em === "2026-08-17T03:30:00.000Z",
    bom.ok ? bom.campos.publicado_em : bom.mensagem,
  );
  const limpa = lerCorpo(
    { titulo: "t", conteudo: DOCUMENTO_COMPLETO, publicado_em: null },
    { criando: false },
  );
  afirmar(
    "data de publicação nula LIMPA o campo — tirar a data é ação legítima",
    limpa.ok === true && limpa.campos.publicado_em === null,
    JSON.stringify(limpa).slice(0, 140),
  );
}

/* Tags e tempo de leitura: forma conferida antes de virar erro de banco. */
{
  const casos = [
    ["tags que não são lista", { tags: "a,b" }, /lista/i],
    /* Story 2.14: a lista é de NOMES. O que se recusa deixou de ser "não é
       identificador" e passou a ser "não vira Tag": vazia, longa demais, ou sem
       letra nenhuma para virar endereço. */
    ["tag vazia", { tags: ["   "] }, /vazia/i],
    ["tag sem letra nem número", { tags: ["!!! ???"] }, /letra ou número/i],
    ["tag longa demais", { tags: ["a".repeat(200)] }, /caracteres/i],
    ["tag que não é texto", { tags: [42] }, /texto/i],
    [
      "mais tags que o teto",
      { tags: Array.from({ length: 40 }, (_, i) => `tag numero ${i}`) },
      /no máximo/i,
    ],
    ["tempo de leitura negativo", { tempo_leitura: -3 }, /tempo de leitura/i],
    ["tempo de leitura fracionário", { tempo_leitura: 2.5 }, /tempo de leitura/i],
    ["categoria fora do formato", { categoria_id: "tecnologia" }, /categoria/i],
  ];
  for (const [nome, extra, padrao] of casos) {
    const r = lerCorpo(
      { titulo: "t", slug: "s", resumo: "r", conteudo: DOCUMENTO_COMPLETO, ...extra },
      { criando: true },
    );
    afirmar(
      `${nome} é recusado com a frase que nomeia o campo`,
      r.ok === false && padrao.test(r.mensagem),
      r.ok ? "ACEITOU" : r.mensagem,
    );
  }
  /* REPETIDA COLAPSA, E A CHAVE DE IGUALDADE É O SLUG.
     "Vendas", "vendas" e "VENDAS " produzem a mesma linha em `tags` — o slug é
     a identidade, o nome é a grafia de quem cadastrou primeiro. Colapsar por
     texto exato deixaria as três passarem, e a segunda estouraria a unicidade
     do banco com o Autor lendo um erro sobre um espaço que ele não vê. */
  const dedup = lerCorpo(
    {
      titulo: "t",
      slug: "s",
      resumo: "r",
      conteudo: DOCUMENTO_COMPLETO,
      tags: ["Vendas", "vendas", "  VENDAS  ", "vendas!"],
    },
    { criando: true },
  );
  afirmar(
    "tag repetida vira uma só, pela CHAVE (slug) e não pelo texto — e a grafia que fica é a primeira",
    dedup.ok === true &&
      dedup.campos.tags.length === 1 &&
      dedup.campos.tags[0] === "Vendas",
    JSON.stringify(dedup.campos?.tags ?? null),
  );
  /* E a MESMA regra vale na tela: a função é uma só, do domínio, e as duas
     pontas precisam concordar sobre o que é a mesma Tag. Sem esta comparação, a
     tela mostraria duas pílulas e o banco gravaria uma. */
  {
    const naTela = separarTags("Vendas, vendas,   VENDAS  , vendas!").nomes;
    afirmar(
      "a tela e o servidor colapsam a repetida do mesmo jeito — é a mesma função do domínio",
      JSON.stringify(naTela) === JSON.stringify(dedup.campos?.tags ?? null),
      `tela: ${JSON.stringify(naTela)} | servidor: ${JSON.stringify(dedup.campos?.tags ?? null)}`,
    );
  }
  /* Espaço interno colapsado: sem isso, "inteligência  artificial" e
     "inteligência artificial" produziriam o MESMO slug e a segunda seria
     recusada por unicidade. */
  {
    const espacos = lerCorpo(
      {
        titulo: "t",
        slug: "s",
        resumo: "r",
        conteudo: DOCUMENTO_COMPLETO,
        tags: ["  inteligência   artificial  "],
      },
      { criando: true },
    );
    afirmar(
      "o nome da Tag é aparado e tem o espaço interno colapsado antes de virar dado",
      espacos.ok === true && espacos.campos.tags[0] === "inteligência artificial",
      JSON.stringify(espacos.campos?.tags ?? espacos.mensagem),
    );
  }
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
  /* SALVAR NÃO É TRANSIÇÃO: o corpo não fala de Estado, e a coluna não entra
     no comando. É a ausência que garante — escrever o mesmo valor de volta
     daria o mesmo resultado hoje e deixaria a porta aberta para o dia em que o
     valor lido estivesse velho. */
  afirmar(
    "o comando de edição NÃO carrega estado quando o pedido não fala de transição",
    !Object.hasOwn(enviado, "estado"),
    Object.keys(enviado).join(", "),
  );
  afirmar(
    "o perfil da Conta não é nem consultado numa edição — não há nome a resolver",
    !acesso.chamadas.some((c) => c.nome === "perfilDaConta"),
    acesso.chamadas.map((c) => c.nome).join(", "),
  );
}

/* ─── A MATRIZ DE TRANSIÇÕES, executada contra o núcleo ───────────────────── */
//
// Dezesseis pedidos, um por par de Estados, e o veredito de cada um comparado
// com o que a máquina do domínio declara. É esta comparação que torna "a tela e
// o servidor saem da mesma tabela" observável: uma tabela paralela no servidor
// apareceria aqui como divergência, e não como uma tela que continua bonita.
//
// A cada recusa, a contagem de escritas precisa ser ZERO — "recusado" e "nada
// gravado" são duas afirmações, e a segunda é a que importa para quem já tinha
// o link.

{
  const ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const NO_PASSADO = "2026-01-01T00:00:00Z";
  const NO_FUTURO = new Date(Date.now() + 30 * 86_400_000).toISOString();

  for (const de of ESTADOS) {
    for (const para of ESTADOS) {
      const acesso = acessoDeTeste({
        post: {
          id: ID,
          slug: "um-post-de-teste",
          estado: de,
          // Rascunho é o único que pode não ter data; os publicáveis a exigem
          // por restrição do banco desde a Story 2.1.
          publicado_em: de === "rascunho" ? null : NO_PASSADO,
          autor_id: "99999999-9999-9999-9999-999999999999",
          autor_nome: "Autor Original",
        },
      });
      const r = await salvarPost({
        token: "bom",
        // A data vai no corpo porque agendar exige uma: sem ela, a recusa
        // seria pela falta de data e não pela transição, e o caso mediria
        // outra coisa.
        corpo: corpoValido({ id: ID, estado: para, publicado_em: NO_FUTURO }),
        acesso,
      });
      const permitida = transicaoPermitida(de, para);
      const escritas = acesso.escritas().length;
      afirmar(
        `${de} → ${para} ${permitida ? "é aceita" : "é RECUSADA"} pelo servidor, como a máquina declara`,
        r.ok === permitida && (permitida ? escritas === 1 : escritas === 0),
        r.ok
          ? `gravou (${escritas} escrita(s))`
          : `${r.erro.tipo}: ${r.erro.mensagem.slice(0, 90)} | escritas: ${escritas}`,
      );
    }
  }
}

/* — Salvar um Post publicado: Estado intacto, data intacta — */
{
  const ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const acesso = acessoDeTeste({
    post: {
      id: ID,
      slug: "um-post-de-teste",
      estado: "publicado",
      publicado_em: "2026-01-01T00:00:00+00:00",
    },
  });
  const r = await salvarPost({
    token: "bom",
    corpo: corpoValido({
      id: ID,
      estado: "publicado",
      // O cliente TENTA mudar a data de um Post que já está no ar.
      publicado_em: "2026-08-01T12:00:00Z",
    }),
    acesso,
  });
  const enviado = acesso.escritas()[0]?.argumentos[0] ?? {};
  afirmar("salvar alterações de um Post publicado é aceito", r.ok === true, r.ok ? "" : JSON.stringify(r.erro));
  /* A COLUNA NEM ENTRA NO COMANDO. A listagem ordena por essa data: se salvar
     uma correção de vírgula a reescrevesse, o Post pularia para o topo do blog
     como se fosse novo, e o leitor recorrente veria o mesmo artigo voltando. */
  afirmar(
    "e o comando NÃO carrega `publicado_em` — a data de quem está no ar não é reescrita",
    !Object.hasOwn(enviado, "publicado_em"),
    `publicado_em no comando: ${JSON.stringify(enviado.publicado_em)}`,
  );
  afirmar(
    "nem `estado`: continuar publicado não é transição",
    !Object.hasOwn(enviado, "estado"),
    Object.keys(enviado).join(", "),
  );
}

/* — Publicar agora, republicar e agendar: as três regras de data — */
{
  const ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const base = (estado, publicado_em) => ({
    id: ID,
    slug: "um-post-de-teste",
    estado,
    publicado_em,
  });

  {
    // Publicar um rascunho com data FUTURA na gaveta: "agora" é agora, senão o
    // Post se diria publicado e continuaria invisível pela política de leitura.
    const acesso = acessoDeTeste({ post: base("rascunho", null) });
    const futuro = new Date(Date.now() + 86_400_000).toISOString();
    const r = await salvarPost({
      token: "bom",
      corpo: corpoValido({ id: ID, estado: "publicado", publicado_em: futuro }),
      acesso,
    });
    const enviado = acesso.escritas()[0]?.argumentos[0] ?? {};
    const gravada = Date.parse(String(enviado.publicado_em));
    afirmar(
      "publicar agora grava estado publicado com data JÁ PASSADA, ainda que a gaveta trouxesse data futura",
      r.ok === true &&
        enviado.estado === "publicado" &&
        Number.isFinite(gravada) &&
        gravada <= Date.now(),
      `estado: ${enviado.estado} | publicado_em: ${enviado.publicado_em}`,
    );
    /* E a data fica UM MINUTO no passado, não "agora".
       O relógio desta máquina e o do Postgres não são o mesmo relógio — na
       medição desta story o do servidor estava dois segundos adiantado —, e a
       política de leitura compara com o relógio DO BANCO. Sem a margem, o Post
       nasce publicado e invisível por alguns segundos: o defeito que some
       sozinho antes de alguém conseguir investigar. */
    afirmar(
      "e a data fica ao menos um minuto atrás — a margem contra o relógio do servidor adiantado",
      Number.isFinite(gravada) && Date.now() - gravada >= MARGEM_DE_RELOGIO_MS,
      `atrás por ${Math.round((Date.now() - gravada) / 1000)}s | margem: ${MARGEM_DE_RELOGIO_MS / 1000}s`,
    );
  }

  {
    /* Republicar um arquivado CONSERVA a data original: ele já esteve no ar, e
       reaparecer no topo da listagem como novidade seria mentira para o leitor
       recorrente. É por isso que a regra olha "está no futuro?", e não "é
       nula?". */
    const acesso = acessoDeTeste({ post: base("arquivado", "2026-01-01T00:00:00+00:00") });
    const r = await salvarPost({
      token: "bom",
      corpo: corpoValido({ id: ID, estado: "publicado" }),
      acesso,
    });
    const enviado = acesso.escritas()[0]?.argumentos[0] ?? {};
    afirmar(
      "republicar um arquivado conserva a data original — não vira novidade na listagem",
      r.ok === true &&
        enviado.estado === "publicado" &&
        !Object.hasOwn(enviado, "publicado_em"),
      `estado: ${enviado.estado} | publicado_em: ${JSON.stringify(enviado.publicado_em)}`,
    );
  }

  {
    // Agendar sem data: recusado ANTES do banco, nomeando o campo que falta.
    const acesso = acessoDeTeste({ post: base("rascunho", null) });
    const r = await salvarPost({
      token: "bom",
      corpo: { id: ID, titulo: "T", conteudo: DOCUMENTO_COMPLETO, estado: "agendado" },
      acesso,
    });
    afirmar(
      "agendar sem data de publicação é recusado, com o motivo e o nome do campo",
      r.ok === false &&
        r.erro.tipo === ERRO_DADOS_INVALIDOS &&
        /data e a hora/i.test(r.erro.mensagem) &&
        (r.erro.faltando ?? []).includes("publicado_em"),
      r.ok ? "ACEITOU" : `${r.erro.tipo}: ${r.erro.mensagem}`,
    );
    afirmar(
      "e nada foi gravado por ela",
      acesso.escritas().length === 0,
      `escritas: ${acesso.escritas().length}`,
    );
  }

  {
    // O par estado+data do banco: a lista do domínio é a da restrição.
    afirmar(
      "os Estados que exigem data são exatamente os dois publicáveis",
      mesmoConjunto(EXIGE_DATA_DE_PUBLICACAO, ["publicado", "agendado"]),
      EXIGE_DATA_DE_PUBLICACAO.join(", "),
    );
  }

  /* ── AGENDAR PARA TRÁS: RECUSADO, E COM SAÍDA (Story 2.9) ─────────────
     Agendar para hoje mais cedo é erro de digitação comum. Gravar isso
     publicaria o Post na hora, pela política de leitura, com o Estado dizendo
     "agendado" — e o Autor descobriria pelo leitor. A recusa é a metade fácil;
     o que a story pede é que ela não seja um beco. */
  const VENCIDA = new Date(Date.now() - 3 * 3_600_000).toISOString();
  {
    const acesso = acessoDeTeste({ post: base("rascunho", null) });
    const r = await salvarPost({
      token: "bom",
      corpo: corpoValido({ id: ID, estado: "agendado", publicado_em: VENCIDA }),
      acesso,
    });
    afirmar(
      "agendar para um instante JÁ VENCIDO é recusado",
      r.ok === false && r.erro.tipo === ERRO_DADOS_INVALIDOS,
      r.ok ? "ACEITOU" : `${r.erro.tipo}: ${r.erro.mensagem.slice(0, 120)}`,
    );
    afirmar(
      "e NADA foi gravado por ela — recusa é comportamento, não texto",
      acesso.escritas().length === 0,
      `escritas: ${acesso.escritas().map((e) => e.nome).join(", ") || "nenhuma"}`,
    );
    /* A SAÍDA vem como CHAVE DE AÇÃO, e a chave é conferida contra a máquina:
       uma alternativa que a máquina não declare para o Estado de partida seria
       um botão que a tela oferece e o servidor recusa em seguida. */
    afirmar(
      "a recusa NOMEIA a saída — a chave da ação que publica agora, declarada pela máquina para este Estado",
      r.ok === false &&
        r.erro.alternativa === ACAO_PUBLICAR &&
        acoesDoEstado("rascunho").some((a) => a.chave === r.erro.alternativa),
      r.ok ? "ACEITOU" : `alternativa: ${JSON.stringify(r.erro?.alternativa)}`,
    );
    afirmar(
      "e a frase devolve a data POR EXTENSO, no fuso de apresentação — é ali que um erro de fuso aparece",
      r.ok === false && r.erro.mensagem.includes(formatarDataEHoraPorExtenso(VENCIDA)),
      r.ok ? "ACEITOU" : `${r.erro.mensagem} | esperado conter: ${formatarDataEHoraPorExtenso(VENCIDA)}`,
    );

    /* AS DUAS RECUSAS DE AGENDAMENTO SÃO DISTINTAS.
       "Faltou data" pede que se preencha um campo e o NOMEIA; "data vencida"
       pede uma escolha e NOMEIA a alternativa. Fundi-las daria à tela o
       conselho errado num dos dois casos — marcar um campo já preenchido, ou
       oferecer publicar agora a quem só esqueceu de digitar a hora. */
    const semData = await salvarPost({
      token: "bom",
      corpo: { id: ID, titulo: "T", conteudo: DOCUMENTO_COMPLETO, estado: "agendado" },
      acesso: acessoDeTeste({ post: base("rascunho", null) }),
    });
    afirmar(
      "a recusa por data vencida é DISTINTA da recusa por falta de data — outra frase, e saída no lugar de campo faltante",
      r.ok === false &&
        semData.ok === false &&
        r.erro.mensagem !== semData.erro.mensagem &&
        r.erro.alternativa === ACAO_PUBLICAR &&
        semData.erro.alternativa === undefined &&
        (semData.erro.faltando ?? []).includes("publicado_em") &&
        (r.erro.faltando ?? []).length === 0,
      `vencida: alternativa=${JSON.stringify(r.erro?.alternativa)} faltando=${JSON.stringify(r.erro?.faltando ?? [])} | ` +
        `sem data: alternativa=${JSON.stringify(semData.erro?.alternativa)} faltando=${JSON.stringify(semData.erro?.faltando ?? [])}`,
    );
  }

  {
    /* O AGENDADO VENCIDO CONTINUA SALVÁVEL, e isto não é frouxidão.
       Nada troca `agendado` por `publicado` quando a hora chega — o Estado
       guarda a intenção do Autor e quem mostra o Post é a política. Então
       "agendado com data no passado" é o estado FINAL de todo agendamento que
       deu certo, e o Post já está no ar. Recusar esse salvamento impediria a
       correção de uma vírgula num Post que o leitor já está lendo. */
    const acesso = acessoDeTeste({ post: base("agendado", VENCIDA) });
    const r = await salvarPost({
      token: "bom",
      corpo: corpoValido({ id: ID, estado: "agendado", publicado_em: VENCIDA }),
      acesso,
    });
    afirmar(
      "salvar um Post agendado cuja hora JÁ PASSOU continua permitido — ele está no ar, e a recusa impediria corrigi-lo",
      r.ok === true,
      r.ok ? "" : `${r.erro.tipo}: ${r.erro.mensagem.slice(0, 140)}`,
    );

    /* E a ida e volta pelo campo de data e hora, que não tem segundos, não
       pode contar como "mexeu na hora": o mesmo minuto é a mesma escolha. */
    const comSegundos = new Date(Date.parse(VENCIDA) + 37_000).toISOString();
    const semSegundos = acessoDeTeste({ post: base("agendado", comSegundos) });
    const volta = await salvarPost({
      token: "bom",
      corpo: corpoValido({
        id: ID,
        estado: "agendado",
        publicado_em: deCampoDeInstante(paraCampoDeInstante(comSegundos)),
      }),
      acesso: semSegundos,
    });
    afirmar(
      "e a ida e volta pelo campo de data e hora (que não tem segundos) não conta como mudança de horário",
      volta.ok === true,
      volta.ok ? "" : `${volta.erro.tipo}: ${volta.erro.mensagem.slice(0, 140)}`,
    );

    /* Mas MUDAR a hora de um agendado vencido para outra hora vencida é
       agendar para trás de novo, e é recusado como tal. Sem esta asserção, a
       exceção acima poderia ter aberto a porta inteira. */
    const outroVencido = acessoDeTeste({ post: base("agendado", VENCIDA) });
    const remarcou = await salvarPost({
      token: "bom",
      corpo: corpoValido({
        id: ID,
        estado: "agendado",
        publicado_em: new Date(Date.parse(VENCIDA) - 86_400_000).toISOString(),
      }),
      acesso: outroVencido,
    });
    afirmar(
      "mas REMARCAR um agendado para outra hora já vencida é recusado, com a mesma saída",
      remarcou.ok === false &&
        remarcou.erro.alternativa === ACAO_PUBLICAR &&
        outroVencido.escritas().length === 0,
      remarcou.ok ? "ACEITOU" : `${remarcou.erro.tipo} | escritas: ${outroVencido.escritas().length}`,
    );
  }

  {
    /* E o FUTURO continua passando. Sem esta, todas as asserções acima
       estariam satisfeitas por um servidor que simplesmente nunca agenda. */
    const acesso = acessoDeTeste({ post: base("rascunho", null) });
    const daquiAPouco = new Date(Date.now() + 5_000).toISOString();
    const r = await salvarPost({
      token: "bom",
      corpo: corpoValido({ id: ID, estado: "agendado", publicado_em: daquiAPouco }),
      acesso,
    });
    const enviado = acesso.escritas()[0]?.argumentos[0] ?? {};
    afirmar(
      "agendar para POUCOS SEGUNDOS à frente é aceito — a folga do relógio não vira exigência de antecedência",
      r.ok === true &&
        enviado.estado === "agendado" &&
        Date.parse(String(enviado.publicado_em)) === Date.parse(daquiAPouco),
      r.ok ? `publicado_em: ${enviado.publicado_em}` : `${r.erro.tipo}: ${r.erro.mensagem.slice(0, 140)}`,
    );
    /* E a margem de relógio é aplicada do lado PERMISSIVO: um instante alguns
       segundos atrás — deriva de relógio, não intenção — ainda passa. Aplicá-la
       do outro lado exigiria um minuto de antecedência para agendar, e a prova
       do agendamento autônomo (poucos segundos à frente) seria impossível. */
    const quaseAgora = new Date(Date.now() - MARGEM_DE_RELOGIO_MS / 2).toISOString();
    const tolerante = acessoDeTeste({ post: base("rascunho", null) });
    const r2 = await salvarPost({
      token: "bom",
      corpo: corpoValido({ id: ID, estado: "agendado", publicado_em: quaseAgora }),
      acesso: tolerante,
    });
    afirmar(
      "e a margem de relógio vale do lado PERMISSIVO: agendar dentro dela não é recusado por deriva de relógio",
      r2.ok === true,
      r2.ok ? "" : `${r2.erro.tipo}: ${r2.erro.mensagem.slice(0, 140)}`,
    );
  }

  {
    // Estado fora do vocabulário: recusado na leitura do corpo, antes de tudo.
    for (const valor of ["no ar", "PUBLICADO", "", null, 3]) {
      const r = lerCorpo(
        { titulo: "t", slug: "s", resumo: "r", conteudo: DOCUMENTO_COMPLETO, estado: valor },
        { criando: true },
      );
      afirmar(
        `estado ${JSON.stringify(valor)} é recusado — o vocabulário é fechado`,
        r.ok === false && /estado/i.test(r.mensagem),
        r.ok ? "ACEITOU" : r.mensagem,
      );
    }
    const bom = lerCorpo(
      { titulo: "t", slug: "s", resumo: "r", conteudo: DOCUMENTO_COMPLETO, estado: " publicado " },
      { criando: true },
    );
    afirmar(
      "e um Estado do vocabulário é aceito, aparado",
      bom.ok === true && bom.campos.estado === "publicado",
      bom.ok ? bom.campos.estado : bom.mensagem,
    );
  }
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
            t as (delete from public.tags where slug like ${literal(MARCA_TESTE)} returning 1),
            c as (delete from public.categorias where slug like ${literal(MARCA_TESTE)} returning 1),
            u as (delete from auth.users where email like ${literal(EMAIL_TESTE)} returning 1)
       select (select count(*) from p) + (select count(*) from t) + (select count(*) from c)
            + (select count(*) from u) as n`,
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

      /**
       * O Post de endereço `endereco` é visível para quem NÃO tem sessão?
       *
       * Pergunta como o visitante pergunta: a chave PUBLICÁVEL e nenhum
       * `Authorization`, que é exatamente o que o navegador dele manda. Quem
       * responde é a política de leitura anônima da Story 2.1 — nenhuma consulta
       * daqui repete o filtro dela, porque repeti-lo seria verificar a cópia.
       *
       * É uma LEITURA, e é por isso que ela serve de instrumento na prova do
       * agendamento autônomo: perguntar não escreve.
       */
      const visivelSemSessao = async (endereco) => {
        try {
          const r = await fetch(
            `${URL_PROJETO}/rest/v1/posts?select=id,slug&slug=eq.${encodeURIComponent(endereco)}`,
            {
              signal: AbortSignal.timeout(TIMEOUT_MS),
              headers: { apikey: chaves.publicavel, Accept: "application/json" },
            },
          );
          const corpo = await r.json().catch(() => null);
          return { ok: r.ok, quantos: Array.isArray(corpo) ? corpo.length : -1 };
        } catch (erro) {
          return { ok: false, quantos: -1, erro: String(erro?.message ?? erro) };
        }
      };

      /** Espera passiva. Não escreve, não consulta: só deixa o tempo passar. */
      const dormir = (ms) =>
        new Promise((resolver) => {
          setTimeout(resolver, Math.max(0, ms));
        });

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
            // `estado` NÃO está aqui: o ciclo de vida tem bloco próprio, e este
            // Post existe para provar que sem pedido de transição ele nasce
            // invisível.
            conteudo_html: '<script>alert("html do cliente")</script>',
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
              "o Post NASCEU EM RASCUNHO — sem pedido de transição, ele nasce invisível",
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

      /* — O CICLO DE VIDA INTEIRO, com sessão real (Story 2.8) — */
      //
      // Um Post só, levado por todas as transições que a máquina declara, com o
      // BANCO relido a cada passo. É a diferença entre "a função devolveu ok" e
      // "a linha ficou como devia": o comando de atualização pode ter carregado
      // a coluna certa e o banco ter recusado, ou pior, aceitado outra coisa.
      //
      // A leitura ANÔNIMA entra junto porque "arquivar tira do Blog Público" não
      // é propriedade do Painel — é a política de leitura da Story 2.1 que a
      // produz, e ela só se observa pedindo sem sessão.

      if (contas[0].jwt) {
        const enderecoDoCiclo = slug("ciclo");

        /** A linha, como o banco a tem agora. */
        const linhaDoCiclo = async () => {
          const r = await executarSql(
            token,
            `select id::text as id, estado::text as estado, titulo,
                    publicado_em::text as publicado_em
               from public.posts where slug = ${literal(enderecoDoCiclo)}`,
          );
          return r.ok ? (r.dados?.[0] ?? null) : null;
        };

        const pedir = (extra) =>
          salvarPost({
            token: contas[0].jwt,
            corpo: {
              titulo: "Ciclo de vida do post",
              conteudo: {
                type: "doc",
                content: [{ type: "paragraph", content: [{ type: "text", text: "ciclo" }] }],
              },
              ...extra,
            },
            acesso: acessoReal(),
          });

        const nasceu = await pedir({
          slug: enderecoDoCiclo,
          resumo: "O post que percorre todas as transições da máquina.",
        });
        const idCiclo = nasceu.ok ? (nasceu.dados.post?.id ?? null) : null;
        const temCiclo = afirmar(
          "o Post do ciclo de vida nasceu, em rascunho",
          nasceu.ok === true && nasceu.dados.post?.estado === "rascunho",
          nasceu.ok ? `estado: ${nasceu.dados.post?.estado}` : `${nasceu.erro.tipo}: ${nasceu.erro.detalhe.slice(0, 160)}`,
        );

        if (temCiclo) {
          /* 1. AGENDAR SEM DATA — recusado, e nada muda. */
          {
            const r = await pedir({ id: idCiclo, estado: "agendado" });
            const linha = await linhaDoCiclo();
            afirmar(
              "agendar sem data é recusado pelo servidor, e o Post continua rascunho",
              r.ok === false &&
                r.erro.tipo === ERRO_DADOS_INVALIDOS &&
                linha?.estado === "rascunho",
              r.ok ? "ACEITOU" : `${r.erro.tipo} | estado no banco: ${linha?.estado}`,
            );
          }

          /* 2. AGENDAR COM DATA — o par estado+data, como o banco exige. */
          const DATA_AGENDADA = "2027-03-01T12:30:00-03:00";
          {
            const r = await pedir({ id: idCiclo, estado: "agendado", publicado_em: DATA_AGENDADA });
            const linha = await linhaDoCiclo();
            afirmar(
              "agendar com data grava estado agendado e a data que veio da gaveta",
              r.ok === true &&
                linha?.estado === "agendado" &&
                Date.parse(String(linha?.publicado_em)) === Date.parse(DATA_AGENDADA),
              r.ok ? `estado: ${linha?.estado} | data: ${linha?.publicado_em}` : `${r.erro.tipo}: ${r.erro.detalhe.slice(0, 160)}`,
            );
            const anonimo = await visivelSemSessao(enderecoDoCiclo);
            afirmar(
              "e um agendado com data FUTURA continua invisível para quem não tem sessão",
              anonimo.ok && anonimo.quantos === 0,
              `visíveis: ${anonimo.quantos}${anonimo.erro ? ` | ${anonimo.erro}` : ""}`,
            );
          }

          /* 3. PUBLICAR AGORA — a data futura vira agora, e o Post aparece. */
          {
            const r = await pedir({ id: idCiclo, estado: "publicado" });
            const linha = await linhaDoCiclo();
            const quando = Date.parse(String(linha?.publicado_em));
            afirmar(
              "publicar agora troca a data futura do agendamento por um instante já passado",
              r.ok === true &&
                linha?.estado === "publicado" &&
                Number.isFinite(quando) &&
                quando <= Date.now(),
              r.ok ? `estado: ${linha?.estado} | data: ${linha?.publicado_em}` : `${r.erro.tipo}: ${r.erro.detalhe.slice(0, 160)}`,
            );
            const anonimo = await visivelSemSessao(enderecoDoCiclo);
            afirmar(
              "e o Post publicado passa a ser VISÍVEL para quem não tem sessão",
              anonimo.ok && anonimo.quantos === 1,
              `visíveis: ${anonimo.quantos}${anonimo.erro ? ` | ${anonimo.erro}` : ""}`,
            );
          }

          /* 4. SALVAR ALTERAÇÕES — Estado e data intactos. */
          const dataPublicada = (await linhaDoCiclo())?.publicado_em ?? null;
          {
            const r = await pedir({
              id: idCiclo,
              titulo: "Ciclo de vida do post, revisado",
              estado: "publicado",
              // O cliente TENTA mover a data de um Post que já está no ar.
              publicado_em: "2026-08-01T09:00:00-03:00",
            });
            const linha = await linhaDoCiclo();
            afirmar(
              "salvar alterações de um Post publicado grava o texto novo",
              r.ok === true && linha?.titulo === "Ciclo de vida do post, revisado",
              r.ok ? `titulo: ${linha?.titulo}` : `${r.erro.tipo}: ${r.erro.detalhe.slice(0, 160)}`,
            );
            afirmar(
              "e o Estado continua publicado, com a data de publicação INTACTA — o lugar na listagem é o mesmo",
              linha?.estado === "publicado" &&
                Date.parse(String(linha?.publicado_em)) === Date.parse(String(dataPublicada)),
              `estado: ${linha?.estado} | ${dataPublicada} → ${linha?.publicado_em}`,
            );
          }

          /* 5. PUBLICADO → RASCUNHO — recusado por chamada direta ao núcleo. */
          for (const proibido of ["rascunho", "agendado"]) {
            const r = await pedir({
              id: idCiclo,
              estado: proibido,
              publicado_em: "2027-05-05T10:00:00-03:00",
            });
            const linha = await linhaDoCiclo();
            afirmar(
              `publicado → ${proibido} é RECUSADO pelo servidor, e o Post continua publicado`,
              r.ok === false &&
                r.erro.tipo === ERRO_DADOS_INVALIDOS &&
                linha?.estado === "publicado" &&
                Date.parse(String(linha?.publicado_em)) === Date.parse(String(dataPublicada)),
              r.ok ? "ACEITOU" : `${r.erro.tipo} | estado no banco: ${linha?.estado}`,
            );
          }

          /* 6. ARQUIVAR — sai do ar, e o registro fica. */
          {
            const r = await pedir({
              id: idCiclo,
              // O título revisado vai junto porque o corpo SEMPRE o carrega: a
              // tela manda o que está na gaveta a cada gravação, e arquivar não
              // é exceção. Mandar o título padrão aqui faria a asserção de
              // "registro preservado" medir a própria distração.
              titulo: "Ciclo de vida do post, revisado",
              estado: "arquivado",
            });
            const linha = await linhaDoCiclo();
            afirmar(
              "arquivar grava estado arquivado e PRESERVA o registro — nada é apagado",
              r.ok === true &&
                linha !== null &&
                linha.estado === "arquivado" &&
                linha.titulo === "Ciclo de vida do post, revisado",
              r.ok ? `estado: ${linha?.estado} | titulo: ${linha?.titulo}` : `${r.erro.tipo}: ${r.erro.detalhe.slice(0, 160)}`,
            );
            afirmar(
              "e a data de publicação continua lá — o Post esteve no ar, e o registro disso não se apaga",
              Date.parse(String(linha?.publicado_em)) === Date.parse(String(dataPublicada)),
              `${dataPublicada} → ${linha?.publicado_em}`,
            );
            const anonimo = await visivelSemSessao(enderecoDoCiclo);
            afirmar(
              "arquivar TIRA DO BLOG PÚBLICO: quem não tem sessão deixa de ver o Post",
              anonimo.ok && anonimo.quantos === 0,
              `visíveis: ${anonimo.quantos}${anonimo.erro ? ` | ${anonimo.erro}` : ""}`,
            );
          }

          /* 7. REPUBLICAR — volta ao ar com a MESMA data. */
          {
            const r = await pedir({ id: idCiclo, estado: "publicado" });
            const linha = await linhaDoCiclo();
            afirmar(
              "republicar devolve o Post ao ar conservando a data original — ele não vira novidade",
              r.ok === true &&
                linha?.estado === "publicado" &&
                Date.parse(String(linha?.publicado_em)) === Date.parse(String(dataPublicada)),
              r.ok ? `estado: ${linha?.estado} | ${dataPublicada} → ${linha?.publicado_em}` : `${r.erro.tipo}: ${r.erro.detalhe.slice(0, 160)}`,
            );
            const anonimo = await visivelSemSessao(enderecoDoCiclo);
            afirmar(
              "e ele volta a ser visível para quem não tem sessão",
              anonimo.ok && anonimo.quantos === 1,
              `visíveis: ${anonimo.quantos}${anonimo.erro ? ` | ${anonimo.erro}` : ""}`,
            );
          }

          /* 8. ESTADO FORA DO VOCABULÁRIO, contra o projeto real. */
          {
            const r = await pedir({ id: idCiclo, estado: "no ar" });
            const linha = await linhaDoCiclo();
            afirmar(
              "estado fora do vocabulário é recusado antes do banco, e nada muda",
              r.ok === false &&
                r.erro.tipo === ERRO_DADOS_INVALIDOS &&
                linha?.estado === "publicado",
              r.ok ? "ACEITOU" : `${r.erro.tipo} | estado no banco: ${linha?.estado}`,
            );
          }
        }
      } else {
        adiar("o ciclo de vida do Post é percorrido com sessão real", MOTIVO_SEM_SESSAO);
      }

      /* — O AGENDAMENTO AUTÔNOMO, OBSERVADO ACONTECENDO (Story 2.9) — */
      //
      // A promessa central do épico: um Post agendado fica visível na hora
      // marcada SEM QUE NINGUÉM ABRA O PAINEL. Ela é decorrência da política de
      // leitura da Story 2.1 — `estado in ('publicado','agendado') and
      // publicado_em <= now()` — e de mais nada: não há cron, gatilho nem
      // processo que troque o Estado quando a hora chega.
      //
      // Ler a política e concluir que funciona é exatamente o que este projeto
      // não aceita. Aqui a coisa é observada: um Post é agendado para poucos
      // segundos à frente, o leitor anônimo é consultado antes, A ESPERA É
      // PASSIVA — entre uma consulta e a outra não há UMA escrita, nem desta
      // ferramenta nem de ninguém — e a visibilidade é perguntada de novo.
      //
      // "Nada escreveu" não é confiança na ferramenta: é medido. `atualizado_em`
      // é mantido por gatilho a cada `update`, então uma escrita no meio — de um
      // cron que alguém acrescentasse, de um gatilho, de outra execução — moveria
      // a coluna, e a asserção acusa.

      if (contas[0].jwt) {
        const enderecoAutonomo = slug("autonomo");
        const SEGUNDOS_A_FRENTE = 8;
        /* Os 60 segundos são do critério de aceite do épico, e não uma folga
           escolhida aqui: "um post agendado cuja hora chegou é visível em até
           60 segundos, sem ninguém abrir o Painel". */
        const FOLGA_DO_CRITERIO_MS = 60_000;

        /* O RELÓGIO QUE DECIDE É O DO BANCO.
           A política compara `publicado_em <= now()`, e `now()` é o relógio do
           Postgres. Marcar a hora pelo relógio desta máquina faria a asserção
           medir deriva de NTP em vez de agendamento — e falharia, ou passaria,
           por motivo nenhum. O deslocamento entre os dois relógios é medido uma
           vez, com a viagem de ida e volta descontada pelo ponto médio. */
        const antesDoRelogio = Date.now();
        const relogio = await executarSql(
          token,
          "select (extract(epoch from now()) * 1000)::bigint::text as ms",
        );
        const depoisDoRelogio = Date.now();
        const agoraNoBanco = Number(relogio.ok ? (relogio.dados?.[0]?.ms ?? Number.NaN) : Number.NaN);
        const deslocamento = agoraNoBanco - (antesDoRelogio + depoisDoRelogio) / 2;
        const temRelogio = afirmar(
          "o relógio do banco foi lido — é ele que a política de leitura consulta, não o desta máquina",
          Number.isFinite(agoraNoBanco) && Math.abs(deslocamento) < 5 * 60_000,
          relogio.ok
            ? `deslocamento banco − máquina: ${Math.round(deslocamento)}ms`
            : (relogio.erro ?? ""),
        );

        if (temRelogio) {
          const marcadoNoBanco = agoraNoBanco + SEGUNDOS_A_FRENTE * 1000;
          const marcadoAqui = marcadoNoBanco - deslocamento;
          const marcado = new Date(marcadoNoBanco).toISOString();

          const nasceu = await salvarPost({
            token: contas[0].jwt,
            corpo: {
              slug: enderecoAutonomo,
              titulo: "O post que aparece sozinho",
              resumo: "Agendado para daqui a alguns segundos, sem ninguém para virar a chave.",
              conteudo: {
                type: "doc",
                content: [
                  { type: "paragraph", content: [{ type: "text", text: "agendamento autônomo" }] },
                ],
              },
              estado: "agendado",
              publicado_em: marcado,
            },
            acesso: acessoReal(),
          });
          const agendou = afirmar(
            `o Post foi agendado para ${SEGUNDOS_A_FRENTE}s à frente, e nasceu no Estado agendado`,
            nasceu.ok === true && nasceu.dados.post?.estado === "agendado",
            nasceu.ok
              ? `estado: ${nasceu.dados.post?.estado} | ${nasceu.dados.post?.publicado_em}`
              : `${nasceu.erro.tipo}: ${nasceu.erro.detalhe.slice(0, 160)}`,
          );

          /** O retrato da linha, como o banco a tem. */
          const retrato = async () => {
            const r = await executarSql(
              token,
              `select estado::text as estado,
                      publicado_em::text as publicado_em,
                      atualizado_em::text as atualizado_em
                 from public.posts where slug = ${literal(enderecoAutonomo)}`,
            );
            return r.ok ? (r.dados?.[0] ?? null) : null;
          };

          if (agendou) {
            const antesDaHora = await visivelSemSessao(enderecoAutonomo);
            afirmar(
              "ANTES da hora marcada, o leitor anônimo não vê o Post — agendado não é publicado",
              antesDaHora.ok && antesDaHora.quantos === 0,
              `visíveis: ${antesDaHora.quantos}${antesDaHora.erro ? ` | ${antesDaHora.erro}` : ""}`,
            );
            const antes = await retrato();

            /* ── A ESPERA. Daqui até a asserção seguinte, NADA ESCREVE. ──
               O que roda entre uma coisa e outra é `setTimeout` e o mesmo GET
               anônimo que o navegador de um visitante faz. Nenhuma sessão é
               usada, nenhuma função de escrita é chamada, o Painel continua
               fechado. É essa ausência que é a prova. */
            await dormir(marcadoAqui - Date.now() + 250);

            const limite = marcadoAqui + FOLGA_DO_CRITERIO_MS;
            let visivelEm = null;
            let consultas = 0;
            while (visivelEm === null && Date.now() <= limite) {
              consultas += 1;
              const olhada = await visivelSemSessao(enderecoAutonomo);
              if (olhada.ok && olhada.quantos === 1) {
                visivelEm = Date.now();
                break;
              }
              await dormir(1500);
            }
            const atrasoMs = visivelEm === null ? null : Math.round(visivelEm - marcadoAqui);

            afirmar(
              "PASSADA A HORA, o Post agendado ficou visível para o leitor anônimo SOZINHO — ninguém abriu o Painel",
              visivelEm !== null,
              visivelEm === null
                ? `não apareceu em ${FOLGA_DO_CRITERIO_MS / 1000}s depois da hora marcada, após ${consultas} consulta(s) anônima(s)`
                : "",
            );
            afirmar(
              `e apareceu DENTRO DOS ${FOLGA_DO_CRITERIO_MS / 1000}s do critério, contados da hora marcada`,
              atrasoMs !== null && atrasoMs <= FOLGA_DO_CRITERIO_MS,
              `atraso medido: ${atrasoMs === null ? "não apareceu" : `${atrasoMs}ms`}`,
            );
            if (atrasoMs !== null) {
              nota(
                `a hora chegou e o Post apareceu ${atrasoMs}ms depois, em ${consultas} consulta(s) — a espera foi passiva.`,
              );
            }

            const depois = await retrato();
            afirmar(
              "e NADA ESCREVEU no meio: `atualizado_em` é o mesmo instante de antes da espera",
              antes !== null &&
                depois !== null &&
                depois.atualizado_em === antes.atualizado_em,
              `${antes?.atualizado_em} → ${depois?.atualizado_em}`,
            );
            /* O ESTADO NÃO MUDA. É a regra que a story marca como "nunca": o
               Estado descreve a INTENÇÃO do Autor, e a visibilidade é da
               política. Um processo que trocasse `agendado` por `publicado` na
               hora marcada acrescentaria uma peça que pode falhar, atrasar ou
               rodar duas vezes para produzir o mesmo resultado que a comparação
               de data já produz. */
            afirmar(
              "o Estado continua `agendado` depois de o Post estar no ar — quem publica é a política, não um processo",
              depois?.estado === "agendado" && depois?.publicado_em === antes?.publicado_em,
              `estado: ${depois?.estado} | data: ${antes?.publicado_em} → ${depois?.publicado_em}`,
            );

            /* CANCELAR O AGENDAMENTO É TRANSIÇÃO EXPLÍCITA.
               Este Post está no ar agora — foi a política que o pôs lá —, e
               cancelar o tira, sem apagar nada: a máquina declara
               `cancelar_agendamento` levando a `rascunho`, e rascunho é
               invisível por construção. Não existe "desagendar" implícito, do
               mesmo jeito que não existe "publicar" implícito. */
            const cancelou = await salvarPost({
              token: contas[0].jwt,
              corpo: {
                id: nasceu.dados.post.id,
                titulo: "O post que aparece sozinho",
                conteudo: {
                  type: "doc",
                  content: [
                    { type: "paragraph", content: [{ type: "text", text: "agendamento autônomo" }] },
                  ],
                },
                estado: "rascunho",
              },
              acesso: acessoReal(),
            });
            const depoisDoCancelamento = await retrato();
            afirmar(
              "cancelar o agendamento leva o Post de volta a rascunho, por transição explícita",
              cancelou.ok === true && depoisDoCancelamento?.estado === "rascunho",
              cancelou.ok
                ? `estado: ${depoisDoCancelamento?.estado}`
                : `${cancelou.erro.tipo}: ${cancelou.erro.detalhe.slice(0, 160)}`,
            );
            const semAgendamento = await visivelSemSessao(enderecoAutonomo);
            afirmar(
              "e ele sai do ar na hora — rascunho é invisível para quem não tem sessão, mesmo com a data já vencida",
              semAgendamento.ok && semAgendamento.quantos === 0,
              `visíveis: ${semAgendamento.quantos}${semAgendamento.erro ? ` | ${semAgendamento.erro}` : ""}`,
            );
          }
        }
      } else {
        adiar("o Post agendado aparece sozinho quando a hora chega", MOTIVO_SEM_SESSAO);
      }

      /* — MEIA-NOITE E MEIA EM SÃO PAULO (Story 2.9) — */
      //
      // O erro de fuso mais provável, e o mais silencioso: `new Date("…T00:30")`
      // é meia-noite e meia NO FUSO DA MÁQUINA de quem digita, e num servidor em
      // UTC isso é 21h30 do dia ANTERIOR em São Paulo — o Post sai um dia antes
      // do combinado e ninguém percebe até alguém reclamar.
      //
      // A conversão é do domínio, e quem a confere é o PRÓPRIO BANCO: a hora de
      // parede é relida pelo Postgres, no fuso do negócio. Comparar a conversão
      // do domínio com ela mesma não verificaria nada.

      if (contas[0].jwt) {
        const enderecoDaMeiaNoite = slug("meia-noite");

        /* O dia de hoje EM SÃO PAULO, lido pelo domínio — nunca por `getDate()`,
           que responde no fuso da máquina que roda esta ferramenta. */
        const hojeEmSaoPaulo = paraCampoDeInstante(Date.now()).slice(0, 10);
        const diaSeguinte = new Date(`${hojeEmSaoPaulo}T00:00:00Z`);
        diaSeguinte.setUTCDate(diaSeguinte.getUTCDate() + 1);
        const amanha = diaSeguinte.toISOString().slice(0, 10);
        const marcado = deCampoDeInstante(`${amanha}T00:30`);

        const r = await salvarPost({
          token: contas[0].jwt,
          corpo: {
            slug: enderecoDaMeiaNoite,
            titulo: "Agendado para meia-noite e meia",
            resumo: "O caso de fuso que sai um dia antes quando alguém erra a conversão.",
            conteudo: {
              type: "doc",
              content: [{ type: "paragraph", content: [{ type: "text", text: "00h30" }] }],
            },
            estado: "agendado",
            publicado_em: marcado,
          },
          acesso: acessoReal(),
        });
        const marcou = afirmar(
          "um Post agendado para 00h30 de amanhã em São Paulo é aceito",
          r.ok === true && r.dados.post?.estado === "agendado",
          r.ok ? `data: ${r.dados.post?.publicado_em}` : `${r.erro.tipo}: ${r.erro.detalhe.slice(0, 160)}`,
        );

        if (marcou) {
          const parede = await executarSql(
            token,
            `select to_char(publicado_em at time zone ${literal(FUSO_DE_APRESENTACAO)},
                            'YYYY-MM-DD HH24:MI') as parede
               from public.posts where slug = ${literal(enderecoDaMeiaNoite)}`,
          );
          const lido = parede.ok ? (parede.dados?.[0]?.parede ?? null) : null;
          afirmar(
            "o PRÓPRIO BANCO relê o instante gravado como 00:30 do dia marcado, no fuso de São Paulo",
            lido === `${amanha} 00:30`,
            `esperado ${amanha} 00:30, o banco leu ${JSON.stringify(lido)}${parede.ok ? "" : ` | ${parede.erro}`}`,
          );
          const anonimo = await visivelSemSessao(enderecoDaMeiaNoite);
          afirmar(
            `e NO DIA ANTERIOR — que é hoje, ${hojeEmSaoPaulo} em São Paulo — ele não aparece para o leitor anônimo`,
            anonimo.ok && anonimo.quantos === 0,
            `visíveis: ${anonimo.quantos}${anonimo.erro ? ` | ${anonimo.erro}` : ""}`,
          );
        }
      } else {
        adiar("agendar para 00h30 em São Paulo não aparece no dia anterior", MOTIVO_SEM_SESSAO);
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

      /* ── (e2) As operações da Story 2.12, contra o projeto ─────────────── */

      secao("(e2) excluir e alternar Destaque: a mesma porta, o mesmo banco");

      /**
       * O que o BANCO tem sobre um Post, lido por SQL.
       *
       * A resposta da própria operação NÃO serve de prova: ela é o que a função
       * diz que fez. O que a story cobra é o que ficou na coluna, e para isso a
       * pergunta precisa vir de fora da função.
       */
      const linhaDoPost = async (id) => {
        const r = await executarSql(
          token,
          `select id, slug, titulo, estado, destaque, autor_id, autor_nome
             from public.posts where id = ${literal(id)}`,
        );
        return r.ok ? (r.dados?.[0] ?? null) : null;
      };

      /* O Post do Destaque SOBREVIVE a esta seção: ele é o alvo da prova de RLS
         da seção (f), que precisa de uma linha existente para que a recusa não
         possa ser confundida com "não havia o que alterar". */
      let idParaRls = null;

      if (contas[0].jwt) {
        /* — Alternar Destaque, nas duas direções, com a coluna conferida — */

        const nascimento = await salvarPost({
          token: contas[0].jwt,
          corpo: corpoValido({
            slug: slug("destaque"),
            titulo: "Post para alternar o destaque",
          }),
          acesso: acessoReal(),
        });
        const idDestaque = nascimento.ok ? nascimento.dados.post.id : null;
        idParaRls = idDestaque;
        const semeou = afirmar(
          "o Post do Destaque foi semeado pela função única",
          Boolean(idDestaque),
          nascimento.ok ? "" : `tipo ${nascimento.erro.tipo}: ${nascimento.erro.detalhe.slice(0, 160)}`,
        );

        if (semeou) {
          const antes = await linhaDoPost(idDestaque);
          afirmar(
            "ele nasce SEM destaque — a coluna tem padrão, e a função não o liga por conta própria",
            antes !== null && antes.destaque === false,
            JSON.stringify(antes),
          );

          const ligou = await definirDestaque({
            token: contas[0].jwt,
            corpo: { id: idDestaque, destaque: true },
            acesso: acessoReal(),
          });
          const depoisDeLigar = await linhaDoPost(idDestaque);
          afirmar(
            "alternar o Destaque grava de verdade: a COLUNA passa a `true`, e a resposta carrega o valor gravado",
            ligou.ok === true &&
              ligou.dados.destaque === true &&
              ligou.dados.operacao === OPERACAO_DESTACAR &&
              depoisDeLigar?.destaque === true,
            ligou.ok
              ? `banco: ${JSON.stringify(depoisDeLigar)}`
              : `tipo ${ligou.erro.tipo}: ${ligou.erro.detalhe.slice(0, 160)}`,
          );

          /* IDEMPOTÊNCIA. O valor é o DESEJADO, não um pedido de inversão: com
             inversão, o segundo clique de um duplo-clique desfaria o primeiro e
             o Autor veria a estrela voltar sozinha. */
          const deNovo = await definirDestaque({
            token: contas[0].jwt,
            corpo: { id: idDestaque, destaque: true },
            acesso: acessoReal(),
          });
          afirmar(
            "pedir o MESMO valor outra vez tem o mesmo efeito — o clique repetido não desfaz o primeiro",
            deNovo.ok === true &&
              deNovo.dados.destaque === true &&
              (await linhaDoPost(idDestaque))?.destaque === true,
            deNovo.ok ? "" : `tipo ${deNovo.erro.tipo}`,
          );

          /* O CORPO NÃO É ESPALHADO SOBRE O COMANDO. Se fosse, este pedido
             publicaria um Post e trocaria o endereço dele sem passar pela
             máquina de transições nem pela conferência de slug — a transição
             pela porta de trás. */
          const carona = await definirDestaque({
            token: contas[0].jwt,
            corpo: {
              id: idDestaque,
              destaque: false,
              estado: "publicado",
              slug: slug("endereco-pela-porta-de-tras"),
              titulo: "Título que veio de carona",
              autor_nome: "Quem não escreveu",
            },
            acesso: acessoReal(),
          });
          const depoisDaCarona = await linhaDoPost(idDestaque);
          afirmar(
            "alternar o Destaque de volta muda UMA coluna: Estado, endereço, título e Autor ficam como estavam",
            carona.ok === true &&
              depoisDaCarona?.destaque === false &&
              antes !== null &&
              depoisDaCarona?.estado === antes?.estado &&
              depoisDaCarona?.slug === antes?.slug &&
              depoisDaCarona?.titulo === antes?.titulo &&
              /* O Autor viajou no MESMO pedido de carona, e é o campo que
                 ninguém confere por reflexo: sem ele no `select`, a asserção
                 aprovava um comando que reescrevia a autoria. */
              depoisDaCarona?.autor_id === antes?.autor_id &&
              depoisDaCarona?.autor_nome === antes?.autor_nome,
            carona.ok
              ? `antes: ${JSON.stringify(antes)} | depois: ${JSON.stringify(depoisDaCarona)}`
              : `tipo ${carona.erro.tipo}: ${carona.erro.detalhe.slice(0, 160)}`,
          );

          /* — As recusas, com a coluna conferida depois de cada uma — */

          for (const [nome, pedido, tipoEsperado] of [
            ["sem token", { token: "", corpo: { id: idDestaque, destaque: true } }, ERRO_PERMISSAO],
            [
              "com token forjado",
              { token: "nao.e.um.jwt", corpo: { id: idDestaque, destaque: true } },
              ERRO_PERMISSAO,
            ],
            [
              "com destaque que não é booleano",
              { token: contas[0].jwt, corpo: { id: idDestaque, destaque: "true" } },
              ERRO_DADOS_INVALIDOS,
            ],
            [
              "sem identificador",
              { token: contas[0].jwt, corpo: { destaque: true } },
              ERRO_DADOS_INVALIDOS,
            ],
            [
              "com identificador que não existe",
              { token: contas[0].jwt, corpo: { id: randomUUID(), destaque: true } },
              ERRO_NAO_ENCONTRADO,
            ],
          ]) {
            const r = await definirDestaque({ ...pedido, acesso: acessoReal() });
            const agora = await linhaDoPost(idDestaque);
            afirmar(
              `alternar Destaque ${nome} é recusado, e a coluna continua onde estava`,
              r.ok === false && r.erro.tipo === tipoEsperado && agora?.destaque === false,
              r.ok
                ? "PASSOU"
                : `tipo ${r.erro.tipo} (esperado ${tipoEsperado}) | banco: ${JSON.stringify(agora)}`,
            );
          }
        }

        /* — Excluir de verdade, com a linha conferida antes e depois — */

        const paraExcluir = await salvarPost({
          token: contas[0].jwt,
          corpo: corpoValido({
            slug: slug("para-excluir"),
            titulo: "Post que vai ser excluído",
          }),
          acesso: acessoReal(),
        });
        const idExcluir = paraExcluir.ok ? paraExcluir.dados.post.id : null;
        const semeouExcluir = afirmar(
          "o Post da exclusão foi semeado pela função única",
          Boolean(idExcluir),
          paraExcluir.ok
            ? ""
            : `tipo ${paraExcluir.erro.tipo}: ${paraExcluir.erro.detalhe.slice(0, 160)}`,
        );

        if (semeouExcluir) {
          /* Uma Tag associada, para que a exclusão tenha o que ARRASTAR. Sem
             ela, "as associações saem junto" seria verdade por não haver
             nenhuma — a forma mais silenciosa de uma asserção não verificar
             nada. A Tag nasce por SQL porque ela não é assunto desta porta. */
          const idDaTag = randomUUID();
          const semeouTag = await executarSql(
            token,
            `insert into public.tags (id, nome, slug)
               values (${literal(idDaTag)}, ${literal(`Tag de verificação ${prefixo}`)}, ${literal(slug("tag"))});
             insert into public.posts_tags (post_id, tag_id)
               values (${literal(idExcluir)}, ${literal(idDaTag)})`,
          );
          const associou = await executarSql(
            token,
            `select count(*)::int as n from public.posts_tags where post_id = ${literal(idExcluir)}`,
          );
          afirmar(
            "controle positivo: o Post a excluir TEM uma associação de Tag antes da exclusão",
            semeouTag.ok && Number(associou.dados?.[0]?.n ?? -1) === 1,
            semeouTag.erro ?? `associações: ${associou.dados?.[0]?.n}`,
          );

          /* As recusas vêm ANTES da exclusão de verdade: se viessem depois, a
             linha já não existiria e cada uma delas passaria por ausência. */
          for (const [nome, pedido, tipoEsperado] of [
            ["sem token", { token: "", corpo: { id: idExcluir } }, ERRO_PERMISSAO],
            [
              "com token forjado",
              { token: "nao.e.um.jwt", corpo: { id: idExcluir } },
              ERRO_PERMISSAO,
            ],
            [
              "sem identificador",
              { token: contas[0].jwt, corpo: {} },
              ERRO_DADOS_INVALIDOS,
            ],
            [
              "com identificador fora do formato",
              { token: contas[0].jwt, corpo: { id: "nao-e-uuid" } },
              ERRO_DADOS_INVALIDOS,
            ],
          ]) {
            const r = await excluirPost({ ...pedido, acesso: acessoReal() });
            afirmar(
              `excluir ${nome} é recusado, e o Post continua lá`,
              r.ok === false &&
                r.erro.tipo === tipoEsperado &&
                (await linhaDoPost(idExcluir)) !== null,
              r.ok ? "PASSOU" : `tipo ${r.erro.tipo} (esperado ${tipoEsperado})`,
            );
          }

          const saiu = await excluirPost({
            token: contas[0].jwt,
            corpo: { id: idExcluir },
            acesso: acessoReal(),
          });
          const sobrou = await linhaDoPost(idExcluir);
          afirmar(
            "excluir SOME com o Post: a linha não está mais no banco, e a resposta carrega o que saiu",
            saiu.ok === true &&
              saiu.dados.operacao === OPERACAO_EXCLUIR &&
              saiu.dados.post?.id === idExcluir &&
              sobrou === null,
            saiu.ok
              ? `no banco: ${JSON.stringify(sobrou)}`
              : `tipo ${saiu.erro.tipo}: ${saiu.erro.detalhe.slice(0, 160)}`,
          );

          const associacoes = await executarSql(
            token,
            `select
               (select count(*)::int from public.posts_tags where post_id = ${literal(idExcluir)}) as tags,
               (select count(*)::int from public.slugs_antigos where post_id = ${literal(idExcluir)}) as enderecos`,
          );
          afirmar(
            "e leva junto as ASSOCIAÇÕES de Tag e os endereços aposentados — a chave estrangeira faz em uma transação o que três chamadas fariam pela metade",
            associacoes.ok &&
              Number(associacoes.dados?.[0]?.tags ?? -1) === 0 &&
              Number(associacoes.dados?.[0]?.enderecos ?? -1) === 0,
            JSON.stringify(associacoes.dados?.[0] ?? associacoes.erro),
          );

          /* ─── MAS A TAG EM SI CONTINUA, E ISSO É O QUE A TELA PROMETE ──
             A cascata vai de `posts` para `posts_tags`, e não para `tags`: uma
             Tag é de todos os Posts, e apagá-la levaria junto os artigos dos
             outros. A confirmação da exclusão dizia que o Post saía "junto com
             as tags", prometendo uma consequência que não acontece — e aviso
             que exagera é aviso que ensina a desconfiar do aviso. A prova de
             que a frase agora diz a verdade é esta linha; a de que a FRASE
             continua dizendo isso está em `verificar:editor`. */
          const tagSobreviveu = await executarSql(
            token,
            `select count(*)::int as n from public.tags where id = ${literal(idDaTag)}`,
          );
          afirmar(
            "e a TAG EM SI continua existindo — a cascata alcança a associação, nunca a Tag, que é de todos os Posts",
            tagSobreviveu.ok && Number(tagSobreviveu.dados?.[0]?.n ?? -1) === 1,
            tagSobreviveu.erro ?? `tags restantes: ${tagSobreviveu.dados?.[0]?.n}`,
          );

          /* O SEGUNDO CLIQUE. Excluir o que já saiu é ausência, e não sucesso
             silencioso: a tela precisa distinguir para acertar a lista sem
             anunciar duas exclusões. */
          const outraVez = await excluirPost({
            token: contas[0].jwt,
            corpo: { id: idExcluir },
            acesso: acessoReal(),
          });
          afirmar(
            "excluir o que já saiu é AUSÊNCIA, não um segundo sucesso",
            outraVez.ok === false && outraVez.erro.tipo === ERRO_NAO_ENCONTRADO,
            outraVez.ok ? "PASSOU" : `tipo ${outraVez.erro.tipo}`,
          );
        }
      } else {
        adiar("excluir e alternar Destaque contra o projeto", MOTIVO_SEM_SESSAO);
      }

      /* ── (e3) As Categorias e as Tags, contra o projeto ────────────────── */

      secao("(e3) Categorias e Tags: a mesma porta, e o banco defendendo atrás dela");

      /** O que o BANCO tem sobre uma Categoria, lido por SQL — nunca a resposta. */
      const linhaDaCategoria = async (id) => {
        const r = await executarSql(
          token,
          `select id, nome, slug, icone, cor, ordem
             from public.categorias where id = ${literal(id)}`,
        );
        return r.ok ? (r.dados?.[0] ?? null) : null;
      };

      /** Uma Categoria criada pela porta única. Devolve a linha, ou `null`. */
      const criarCategoriaReal = async (campos) => {
        const r = await salvarCategoria({
          token: contas[0].jwt,
          corpo: campos,
          acesso: acessoReal(),
        });
        return r.ok ? r.dados.categoria : null;
      };

      let idDaCategoriaParaRls = null;

      if (contas[0].jwt) {
        /* — CRIAR — */

        const criada = await salvarCategoria({
          token: contas[0].jwt,
          corpo: {
            nome: `Categoria ${prefixo}`,
            slug: slug("categoria"),
            cor: CORES_DE_CATEGORIA[1],
            icone: CHAVES_DE_ICONE_DE_CATEGORIA[1],
            ordem: 42,
          },
          acesso: acessoReal(),
        });
        const idCategoria = criada.ok ? criada.dados.categoria.id : null;
        idDaCategoriaParaRls = idCategoria;
        const noBanco = idCategoria ? await linhaDaCategoria(idCategoria) : null;
        afirmar(
          "criar uma Categoria pela porta única grava de verdade — nome, endereço, cor e ícone na COLUNA",
          criada.ok === true &&
            criada.dados.criada === true &&
            noBanco?.nome === `Categoria ${prefixo}` &&
            noBanco?.slug === slug("categoria") &&
            noBanco?.cor === CORES_DE_CATEGORIA[1] &&
            noBanco?.icone === CHAVES_DE_ICONE_DE_CATEGORIA[1] &&
            noBanco?.ordem === 42,
          criada.ok
            ? `banco: ${JSON.stringify(noBanco)}`
            : `tipo ${criada.erro.tipo}: ${criada.erro.detalhe.slice(0, 200)}`,
        );

        if (idCategoria) {
          /* — COR E ÍCONE FORA DO VOCABULÁRIO SÃO RECUSADOS, CONTRA O REAL — */

          for (const [nome, corpo] of [
            ["uma cor que não está no vocabulário", { nome: `Cor ruim ${prefixo}`, cor: "#ff0000" }],
            [
              "uma classe utilitária no lugar da cor",
              { nome: `Classe ${prefixo}`, cor: "bg-red-500" },
            ],
            ["um ícone que não está no mapa", { nome: `Icone ruim ${prefixo}`, icone: "flask" }],
          ]) {
            const r = await salvarCategoria({
              token: contas[0].jwt,
              corpo,
              acesso: acessoReal(),
            });
            const criou = await executarSql(
              token,
              `select count(*)::int as n from public.categorias where nome = ${literal(corpo.nome)}`,
            );
            afirmar(
              `criar Categoria com ${nome} é recusado, e nada é gravado`,
              r.ok === false &&
                r.erro.tipo === ERRO_DADOS_INVALIDOS &&
                Number(criou.dados?.[0]?.n ?? -1) === 0,
              r.ok ? "ACEITOU" : `tipo ${r.erro.tipo} | gravadas: ${criou.dados?.[0]?.n}`,
            );
          }

          /* — RENOMEAR ACERTA TODOS OS POSTS SOZINHO — */
          //
          // O Post aponta para a Categoria e NÃO guarda o nome dela. É isto que
          // faz renomear valer para todos de uma vez — e é isto que quebraria
          // se algum consumidor copiasse o nome para uma coluna de `posts`.

          const postDaCategoria = await salvarPost({
            token: contas[0].jwt,
            corpo: corpoValido({
              slug: slug("post-da-categoria"),
              titulo: "Post que usa a categoria",
              categoria_id: idCategoria,
            }),
            acesso: acessoReal(),
          });
          const idDoPostDaCategoria = postDaCategoria.ok ? postDaCategoria.dados.post.id : null;
          afirmar(
            "o Post que usa a Categoria foi semeado pela função única",
            Boolean(idDoPostDaCategoria),
            postDaCategoria.ok
              ? ""
              : `tipo ${postDaCategoria.erro.tipo}: ${postDaCategoria.erro.detalhe.slice(0, 160)}`,
          );

          /** O que o Post mostra como Categoria, LIDO PELA JUNÇÃO — não pelo nome. */
          const categoriaDoPost = async (idPost) => {
            const r = await executarSql(
              token,
              `select c.nome as nome, p.atualizado_em::text as tocado
                 from public.posts p join public.categorias c on c.id = p.categoria_id
                where p.id = ${literal(idPost)}`,
            );
            return r.ok ? (r.dados?.[0] ?? null) : null;
          };

          if (idDoPostDaCategoria) {
            const antes = await categoriaDoPost(idDoPostDaCategoria);
            const renomeada = await salvarCategoria({
              token: contas[0].jwt,
              corpo: { id: idCategoria, nome: `Renomeada ${prefixo}` },
              acesso: acessoReal(),
            });
            const depois = await categoriaDoPost(idDoPostDaCategoria);
            afirmar(
              "renomear a Categoria muda o nome que o Post mostra — sem que o Post seja tocado",
              renomeada.ok === true &&
                renomeada.dados.criada === false &&
                antes?.nome === `Categoria ${prefixo}` &&
                depois?.nome === `Renomeada ${prefixo}` &&
                /* `atualizado_em` do POST é a prova de que ele não foi
                   escrito: o gatilho o move a cada UPDATE, e ele não se moveu. */
                depois?.tocado === antes?.tocado,
              renomeada.ok
                ? `antes: ${JSON.stringify(antes)} | depois: ${JSON.stringify(depois)}`
                : `tipo ${renomeada.erro.tipo}: ${renomeada.erro.detalhe.slice(0, 160)}`,
            );

            /* E O ENDEREÇO NÃO MUDA SOZINHO: renomear é renomear. */
            afirmar(
              "renomear NÃO muda o endereço da Categoria — quem já usa o filtro continua chegando nela",
              (await linhaDaCategoria(idCategoria))?.slug === slug("categoria"),
              JSON.stringify(await linhaDaCategoria(idCategoria)),
            );

            /* — EXCLUIR EM USO É RECUSADO, COM O NÚMERO CERTO — */

            const emUso = await excluirCategoria({
              token: contas[0].jwt,
              corpo: { id: idCategoria },
              acesso: acessoReal(),
            });
            afirmar(
              "excluir Categoria em uso é recusado contra o projeto real, DIZENDO quantos Posts dependem dela",
              emUso.ok === false &&
                emUso.erro.tipo === ERRO_CONFLITO &&
                emUso.erro.mensagem.includes("1 post depende"),
              emUso.ok ? "ACEITOU" : `${emUso.erro.tipo}: ${emUso.erro.mensagem}`,
            );
            afirmar(
              "e a Categoria continua no banco, com o Post ainda apontando para ela",
              (await linhaDaCategoria(idCategoria)) !== null &&
                (await categoriaDoPost(idDoPostDaCategoria))?.nome === `Renomeada ${prefixo}`,
              JSON.stringify(await categoriaDoPost(idDoPostDaCategoria)),
            );

            /* O SEGUNDO POST muda o NÚMERO da recusa. Sem ele, "1 post" poderia
               ser uma constante escrita na frase. */
            const segundo = await salvarPost({
              token: contas[0].jwt,
              corpo: corpoValido({
                slug: slug("segundo-da-categoria"),
                titulo: "Segundo post da mesma categoria",
                categoria_id: idCategoria,
              }),
              acesso: acessoReal(),
            });
            const comDois = await excluirCategoria({
              token: contas[0].jwt,
              corpo: { id: idCategoria },
              acesso: acessoReal(),
            });
            afirmar(
              "com DOIS Posts, a recusa diz dois — o número é contado, não escrito na frase",
              segundo.ok === true &&
                comDois.ok === false &&
                comDois.erro.mensagem.includes("2 posts dependem"),
              comDois.ok ? "ACEITOU" : `${comDois.erro?.tipo}: ${comDois.erro?.mensagem}`,
            );

            /* — E SEM USO, ELA SAI — */

            const soltou = await executarSql(
              token,
              `update public.posts set categoria_id = null
                where categoria_id = ${literal(idCategoria)}`,
            );
            const saiu = await excluirCategoria({
              token: contas[0].jwt,
              corpo: { id: idCategoria },
              acesso: acessoReal(),
            });
            afirmar(
              "sem Post usando, a Categoria é excluída — e some do banco",
              soltou.ok &&
                saiu.ok === true &&
                saiu.dados.operacao === OPERACAO_EXCLUIR_CATEGORIA &&
                (await linhaDaCategoria(idCategoria)) === null,
              saiu.ok ? "" : `${saiu.erro.tipo}: ${saiu.erro.detalhe.slice(0, 160)}`,
            );
            /* E os Posts continuam lá: a exclusão de Categoria nunca apaga Post. */
            afirmar(
              "e os Posts que a usavam continuam existindo — excluir Categoria nunca apaga Post",
              (await linhaDoPost(idDoPostDaCategoria)) !== null,
              JSON.stringify(await linhaDoPost(idDoPostDaCategoria)),
            );
            /* A Categoria já saiu; a prova de RLS abaixo precisa de uma linha
               que EXISTA, senão a recusa passaria por vacuidade. */
            idDaCategoriaParaRls = null;
          }

          /* — NOME REPETIDO, CONTRA A RESTRIÇÃO REAL — */

          const primeira = await criarCategoriaReal({
            nome: `Repetida ${prefixo}`,
            slug: slug("repetida"),
          });
          const segunda = await salvarCategoria({
            token: contas[0].jwt,
            corpo: { nome: `Repetida ${prefixo}`, slug: slug("repetida-2") },
            acesso: acessoReal(),
          });
          afirmar(
            "duas Categorias com o mesmo NOME é recusado contra o banco real, dizendo qual já existe",
            primeira !== null &&
              segunda.ok === false &&
              segunda.erro.tipo === ERRO_CONFLITO &&
              segunda.erro.mensagem.includes(`Repetida ${prefixo}`),
            segunda.ok ? "ACEITOU" : `${segunda.erro?.tipo}: ${segunda.erro?.mensagem}`,
          );
          const mesmoEndereco = await salvarCategoria({
            token: contas[0].jwt,
            corpo: { nome: `Outra ${prefixo}`, slug: slug("repetida") },
            acesso: acessoReal(),
          });
          afirmar(
            "e dois com o mesmo ENDEREÇO também",
            mesmoEndereco.ok === false && mesmoEndereco.erro.tipo === ERRO_CONFLITO,
            mesmoEndereco.ok ? "ACEITOU" : `${mesmoEndereco.erro?.tipo}: ${mesmoEndereco.erro?.mensagem}`,
          );
          if (primeira) idDaCategoriaParaRls = primeira.id;

          /* — TAG DIGITADA, CONTRA O BANCO REAL — */

          /** As Tags de um Post, lidas por SQL pelo slug delas. */
          const tagsDoPostNoBanco = async (idPost) => {
            const r = await executarSql(
              token,
              `select t.nome as nome, t.slug as slug
                 from public.posts_tags pt join public.tags t on t.id = pt.tag_id
                where pt.post_id = ${literal(idPost)} order by t.slug`,
            );
            return r.ok ? (r.dados ?? []) : [];
          };

          const comTags = await salvarPost({
            token: contas[0].jwt,
            corpo: corpoValido({
              slug: slug("post-com-tags"),
              titulo: "Post com tags digitadas",
              tags: [`Atendimento ${prefixo}`, `Automação ${prefixo}`],
            }),
            acesso: acessoReal(),
          });
          const idComTags = comTags.ok ? comTags.dados.post.id : null;
          const gravadasNoBanco = idComTags ? await tagsDoPostNoBanco(idComTags) : [];
          afirmar(
            "Tag DIGITADA vira Tag no banco: as duas foram criadas e associadas ao Post",
            comTags.ok === true &&
              gravadasNoBanco.length === 2 &&
              gravadasNoBanco.some((t) => t.nome === `Atendimento ${prefixo}`) &&
              gravadasNoBanco.some((t) => t.nome === `Automação ${prefixo}`),
            comTags.ok
              ? JSON.stringify(gravadasNoBanco)
              : `tipo ${comTags.erro.tipo}: ${comTags.erro.detalhe.slice(0, 200)}`,
          );

          if (idComTags) {
            /* REAPROVEITAR, E NÃO DUPLICAR. O segundo Post digita a MESMA Tag
               com outra caixa: ela precisa ser a mesma linha de `tags`, e a
               grafia de quem cadastrou primeiro precisa sobreviver. */
            const outro = await salvarPost({
              token: contas[0].jwt,
              corpo: corpoValido({
                slug: slug("outro-com-tags"),
                titulo: "Outro post com a mesma tag",
                tags: [`atendimento ${prefixo}`.toUpperCase(), `Novidade ${prefixo}`],
              }),
              acesso: acessoReal(),
            });
            const quantasComEsseSlug = await executarSql(
              token,
              `select count(*)::int as n from public.tags
                where slug = ${literal(chaveDaTag(`Atendimento ${prefixo}`))}`,
            );
            const doOutro = outro.ok ? await tagsDoPostNoBanco(outro.dados.post.id) : [];
            afirmar(
              "a MESMA Tag digitada com outra caixa é REAPROVEITADA — uma linha só em `tags`",
              outro.ok === true && Number(quantasComEsseSlug.dados?.[0]?.n ?? -1) === 1,
              outro.ok
                ? `linhas com o slug: ${quantasComEsseSlug.dados?.[0]?.n}`
                : `tipo ${outro.erro.tipo}: ${outro.erro.detalhe.slice(0, 160)}`,
            );
            afirmar(
              "e a grafia gravada continua sendo a de quem cadastrou primeiro",
              doOutro.some((t) => t.nome === `Atendimento ${prefixo}`),
              JSON.stringify(doOutro),
            );

            /* E O CONJUNTO É SUBSTITUÍDO, não acrescentado: salvar com uma tag
               a menos tira a associação, que é o que a gaveta promete. */
            const menos = await salvarPost({
              token: contas[0].jwt,
              corpo: corpoValido({
                id: idComTags,
                slug: slug("post-com-tags"),
                titulo: "Post com tags digitadas",
                tags: [`Atendimento ${prefixo}`],
              }),
              acesso: acessoReal(),
            });
            const agora = await tagsDoPostNoBanco(idComTags);
            afirmar(
              "salvar com uma Tag a menos TIRA a associação — o conjunto é substituído, não somado",
              menos.ok === true &&
                agora.length === 1 &&
                agora[0].nome === `Atendimento ${prefixo}`,
              menos.ok ? JSON.stringify(agora) : `tipo ${menos.erro.tipo}`,
            );
          }
        }

        /* — A RLS CONTINUA NEGANDO ESCRITA DE TAXONOMIA A `authenticated` — */
        //
        // É a mesma defesa da Story 2.5, e ela precisa continuar valendo com as
        // tabelas novas: se a tela pudesse criar Categoria pelo cliente, a
        // função de servidor seria decoração.

        if (idDaCategoriaParaRls) {
          /** Pedido cru ao PostgREST com o JWT da sessão do Painel. */
          const comSessao = async (caminho, metodo, corpo) => {
            try {
              const r = await fetch(`${URL_PROJETO}/rest/v1/${caminho}`, {
                method: metodo,
                signal: AbortSignal.timeout(TIMEOUT_MS),
                headers: {
                  apikey: chaves.publicavel,
                  Authorization: `Bearer ${contas[0].jwt}`,
                  "Content-Type": "application/json",
                  Prefer: "return=representation",
                },
                ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
              });
              return { status: r.status, corpo: sanitizar(await r.text()) };
            } catch (erro) {
              return { status: 0, corpo: String(erro?.message ?? erro) };
            }
          };

          /* CONTROLE POSITIVO: a MESMA credencial LÊ a Categoria. Sem ele, uma
             chave errada faria as três recusas abaixo passarem sem política
             nenhuma em pé. */
          const leitura = await comSessao(
            `categorias?id=eq.${encodeURIComponent(idDaCategoriaParaRls)}`,
            "GET",
            undefined,
          );
          afirmar(
            "controle positivo: a sessão do Painel ENXERGA a Categoria que as tentativas abaixo tentam mudar",
            leitura.status === 200 && leitura.corpo.includes(idDaCategoriaParaRls),
            `HTTP ${leitura.status} ${leitura.corpo.slice(0, 160)}`,
          );

          const recusou = (r) =>
            r.status === 401 ||
            r.status === 403 ||
            (r.status >= 400 &&
              r.status < 500 &&
              /42501|permission denied|row-level security/i.test(r.corpo)) ||
            (r.status >= 200 && r.status < 300 && /^\s*\[\s*\]\s*$/.test(r.corpo));

          const criacao = await comSessao("categorias", "POST", {
            nome: `Criada por authenticated ${prefixo}`,
            slug: slug("intrusa"),
          });
          const intrusa = await executarSql(
            token,
            `select count(*)::int as n from public.categorias where slug = ${literal(slug("intrusa"))}`,
          );
          afirmar(
            "criar Categoria pelo cliente autenticado, direto no PostgREST, é RECUSADO — e nada foi criado",
            recusou(criacao) && Number(intrusa.dados?.[0]?.n ?? -1) === 0,
            `HTTP ${criacao.status} ${criacao.corpo.slice(0, 160)} | criadas: ${intrusa.dados?.[0]?.n}`,
          );

          const renomeacao = await comSessao(
            `categorias?id=eq.${encodeURIComponent(idDaCategoriaParaRls)}`,
            "PATCH",
            { nome: `Renomeada por authenticated ${prefixo}` },
          );
          const aindaComNome = await linhaDaCategoria(idDaCategoriaParaRls);
          afirmar(
            "renomear Categoria pelo cliente autenticado é RECUSADO — e o nome não mudou",
            recusou(renomeacao) &&
              aindaComNome?.nome !== `Renomeada por authenticated ${prefixo}`,
            `HTTP ${renomeacao.status} ${renomeacao.corpo.slice(0, 160)} | banco: ${JSON.stringify(aindaComNome)}`,
          );

          const exclusao = await comSessao(
            `categorias?id=eq.${encodeURIComponent(idDaCategoriaParaRls)}`,
            "DELETE",
            undefined,
          );
          afirmar(
            "excluir Categoria pelo cliente autenticado é RECUSADO — e ela continua no banco",
            recusou(exclusao) && (await linhaDaCategoria(idDaCategoriaParaRls)) !== null,
            `HTTP ${exclusao.status} ${exclusao.corpo.slice(0, 160)}`,
          );

          const tagIntrusa = await comSessao("tags", "POST", {
            nome: `Tag por authenticated ${prefixo}`,
            slug: slug("tag-intrusa"),
          });
          const tagCriada = await executarSql(
            token,
            `select count(*)::int as n from public.tags where slug = ${literal(slug("tag-intrusa"))}`,
          );
          afirmar(
            "criar Tag pelo cliente autenticado também é RECUSADO — a taxonomia inteira passa pela porta única",
            recusou(tagIntrusa) && Number(tagCriada.dados?.[0]?.n ?? -1) === 0,
            `HTTP ${tagIntrusa.status} ${tagIntrusa.corpo.slice(0, 160)} | criadas: ${tagCriada.dados?.[0]?.n}`,
          );
        } else {
          afirmar(
            "a Categoria da prova de RLS pôde ser semeada",
            false,
            "sem linha existente, as recusas passariam por vacuidade",
          );
        }
      } else {
        adiar("as operações de Categoria contra o projeto", MOTIVO_SEM_SESSAO);
        adiar("a Tag digitada contra o projeto", MOTIVO_SEM_SESSAO);
        adiar(
          "escrita de taxonomia pelo cliente autenticado é recusada pela RLS",
          MOTIVO_SEM_SESSAO,
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

      /* — O PAR estado+data: a lista do domínio é a da restrição do banco — */
      //
      // `EXIGE_DATA_DE_PUBLICACAO` existe para o servidor recusar antes do
      // banco, com uma frase que diz o que preencher. Se as duas listas
      // divergirem, o Autor volta a receber erro de restrição sobre uma coluna
      // — ou, pior, o servidor exige data onde o banco não exige.

      {
        const definicao = await executarSql(
          token,
          `select pg_get_constraintdef(c.oid) as def
             from pg_constraint c
             join pg_class t on t.oid = c.conrelid
             join pg_namespace n on n.oid = t.relnamespace
            where n.nspname = 'public' and t.relname = 'posts'
              and c.conname = 'posts_publicavel_exige_data'`,
        );
        const texto = String(definicao.dados?.[0]?.def ?? "");
        const doSql = [...texto.matchAll(/'([a-z]+)'::public\.estado_post|'([a-z]+)'/g)]
          .map((m) => m[1] ?? m[2])
          .filter((v) => ESTADOS.includes(v));
        afirmar(
          "os Estados que exigem data no CÓDIGO são exatamente os da restrição do banco",
          definicao.ok && doSql.length > 0 && mesmoConjunto(doSql, EXIGE_DATA_DE_PUBLICACAO),
          definicao.ok
            ? `no SQL: [${[...new Set(doSql)].sort().join(", ")}] | no código: [${[...EXIGE_DATA_DE_PUBLICACAO].sort().join(", ")}]`
            : (definicao.erro ?? ""),
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

        /* — E OS VERBOS NOVOS DA STORY 2.12 pela MESMA porta de trás — */
        //
        // A defesa da Story 2.5 valia para o `insert`. Excluir e alternar
        // Destaque são `delete` e `update`, e uma política que só nega o
        // primeiro deixaria as duas operações novas escreverem pelo cliente —
        // que é exatamente o "só para esta operação" que a story proíbe.
        //
        // O alvo é uma linha que EXISTE: contra um identificador inventado, o
        // PostgREST responderia "nada alterado" com 2xx mesmo sem política, e a
        // recusa passaria por vacuidade.

        if (idParaRls) {
          /** Pedido cru ao PostgREST com o JWT da sessão do Painel. */
          const pelaSessao = async (metodo, corpo) => {
            try {
              const r = await fetch(
                `${URL_PROJETO}/rest/v1/posts?id=eq.${encodeURIComponent(idParaRls)}`,
                {
                  method: metodo,
                  signal: AbortSignal.timeout(TIMEOUT_MS),
                  headers: {
                    apikey: chaves.publicavel,
                    Authorization: `Bearer ${contas[0].jwt}`,
                    "Content-Type": "application/json",
                    Prefer: "return=representation",
                  },
                  ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
                },
              );
              return { status: r.status, corpo: sanitizar(await r.text()) };
            } catch (erro) {
              return { status: 0, corpo: String(erro?.message ?? erro) };
            }
          };

          /* CONTROLE POSITIVO: a MESMA credencial LÊ a linha. Sem ele, uma
             chave errada ou um identificador errado fariam as duas recusas
             abaixo passarem sem que política nenhuma estivesse em pé. */
          const leitura = await pelaSessao("GET", undefined);
          afirmar(
            "controle positivo: a sessão do Painel ENXERGA a linha que as duas tentativas abaixo tentam mudar",
            leitura.status === 200 && leitura.corpo.includes(idParaRls),
            `HTTP ${leitura.status} ${leitura.corpo.slice(0, 160)}`,
          );

          const recusou = (r) =>
            r.status === 401 ||
            r.status === 403 ||
            (r.status >= 400 &&
              r.status < 500 &&
              /42501|permission denied|row-level security/i.test(r.corpo)) ||
            /* PostgREST responde 200 com lista VAZIA quando a política esconde
               a linha da escrita. Nada alterado também é recusa — mas só vale
               como recusa porque o controle positivo acima provou que a linha
               está lá e é visível para esta mesma credencial. */
            (r.status >= 200 && r.status < 300 && /^\s*\[\s*\]\s*$/.test(r.corpo));

          const exclusao = await pelaSessao("DELETE", undefined);
          const aindaExiste = await linhaDoPost(idParaRls);
          afirmar(
            "excluir pelo cliente autenticado, direto no PostgREST, é RECUSADO — e o Post continua no banco",
            recusou(exclusao) && aindaExiste !== null,
            `HTTP ${exclusao.status} ${exclusao.corpo.slice(0, 160)} | no banco: ${JSON.stringify(aindaExiste)}`,
          );

          const destaque = await pelaSessao("PATCH", { destaque: true });
          const colunaAgora = await linhaDoPost(idParaRls);
          afirmar(
            "alternar Destaque pelo cliente autenticado, direto no PostgREST, é RECUSADO — e a coluna não mudou",
            recusou(destaque) && colunaAgora?.destaque === false,
            `HTTP ${destaque.status} ${destaque.corpo.slice(0, 160)} | no banco: ${JSON.stringify(colunaAgora)}`,
          );
        } else {
          adiar(
            "excluir e destacar pelo cliente autenticado são recusados pela RLS",
            "o Post da seção (e2) não pôde ser semeado — sem linha existente, a recusa passaria por vacuidade",
          );
        }
      } else {
        adiar("uma Conta autenticada continua sem poder escrever direto", MOTIVO_SEM_SESSAO);
        adiar(
          "excluir e destacar pelo cliente autenticado são recusados pela RLS",
          MOTIVO_SEM_SESSAO,
        );
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
          /* A Tag da prova de cascata (Story 2.12). Ela não sai junto do Post:
             a cascata vai de `posts` para `posts_tags`, e não de `posts` para
             `tags` — que é o certo, porque uma Tag é de todos os Posts. */
          `delete from public.tags where slug like ${literal(marca)}`,
          /* As Categorias da Story 2.14. Elas saem DEPOIS dos Posts, e a ordem
             não é estilo: com `on delete restrict`, apagar Categoria antes do
             Post que a usa é recusado pelo banco — e a limpeza inteira, que é
             uma transação só, falharia deixando resíduo em produção. */
          `delete from public.categorias where slug like ${literal(marca)}`,
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
         (select count(*)::int from public.tags where slug like ${literal(marca)}) as tags,
         (select count(*)::int from public.categorias where slug like ${literal(marca)}) as categorias,
         (select count(*)::int from auth.users where email like ${literal(`verificacao.escrita+${nonce}-%@chatclean.com.br`)}) as contas`,
    );
    const linha = sobrou.ok ? (sobrou.dados?.[0] ?? null) : null;
    afirmar(
      "nenhum resíduo da prova comportamental ficou no projeto",
      linha !== null &&
        Number(linha.posts) === 0 &&
        Number(linha.tags) === 0 &&
        Number(linha.categorias) === 0 &&
        Number(linha.contas) === 0,
      linha
        ? `posts: ${linha.posts} | tags: ${linha.tags} | categorias: ${linha.categorias} | contas: ${linha.contas}`
        : (sobrou.erro ?? ""),
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
