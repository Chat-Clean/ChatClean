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
import { pathToFileURL } from "node:url";

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
  COLUNAS_DE_IMAGEM,
  ROTULOS_DE_COLUNA_DE_IMAGEM,
  SEPARADOR_DE_ARQUIVOS_NO_RESIDUO,
  SEPARADOR_DE_MOTIVOS_NO_RESIDUO,
  TETO_DA_FONTE_HERDADA,
  TAMANHO_MAXIMO_DO_RESUMO,
  TAMANHO_MAXIMO_DO_TITULO,
  classificar,
  ERRO_CONFLITO,
  ERRO_DADOS_INVALIDOS,
  lerCorpo,
  LIMITE_DE_IGNORADOS,
  MARGEM_DE_RELOGIO_MS,
  PADRAO_UUID,
  removerCapaAnterior,
  removerImagensAnteriores,
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
/* Os módulos de `src/admin/` NÃO são importáveis aqui: eles usam o alias `@/`,
   que só existe sob o empacotador. Quem os executa é `verificar:editor`, que
   compila antes de montar — e é lá que moram a fala do resíduo dobrado e a
   conferência da lista de campos da gaveta. */

/** A outra coluna de imagem — para a asserção poder afirmar quem NÃO foi acusado. */
const outraColuna = (coluna) => COLUNAS_DE_IMAGEM.find((c) => c !== coluna);
/* Os DOIS NÚMEROS de cada campo de SEO (Story 3.4). O teto de HIGIENE é o que
   o banco cobra e o que esta ferramenta mede contra ele — escrever `300` à mão
   aqui compararia o banco com um literal, e não com a decisão do domínio. O
   comprimento USUAL entra para provar que os dois são MESMO dois: o texto
   entre eles atravessa a porta inteiro. */
import {
  CAMPOS_DE_SEO,
  CAMPOS_DE_TEXTO_DE_SEO,
  CAMPO_DE_IMAGEM_DE_SEO,
  COMPRIMENTO_USUAL_DE_SEO,
  ROTULOS_DE_SEO,
  TETO_DE_HIGIENE_DE_SEO,
  caracteresDe,
  problemaNoTextoDeSeo,
} from "../src/domain/blog/compartilhamento.js";
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
/* O vocabulário do ARQUIVO (Story 3.1), pela MESMA razão: `enderecoDeImagemPermitido`
   é comparada com `endereco_de_imagem_e_permitido` sobre um corpus, e o teto e a
   lista de espécies são comparados com o que o bucket declara. */
import {
  BUCKET_DAS_IMAGENS,
  ESPECIES_DE_IMAGEM,
  TAMANHO_MAXIMO_DA_IMAGEM,
  TAMANHO_MAXIMO_DO_ALTERNATIVO,
  TAMANHO_MAXIMO_DO_ENDERECO,
  caminhoDaCapa,
  caminhoDaCapaNoEndereco,
  ehCaminhoDeCapa,
  enderecoDeImagemPermitido,
  formatarTamanho,
  enderecoPublicoDaCapa,
  problemaNoArquivo,
} from "../src/domain/blog/arquivos.js";
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
    /* Correção de UI/UX do Editor: os três de alinhamento. `data-alinhamento`
       é o nono nome de atributo do renderizador (`ATRIBUTOS_EMITIDOS`), e sem
       um nó não-padrão AQUI a asserção "os nomes declarados são EXATAMENTE os
       emitidos" (mais abaixo) teria um nome declarado que este documento
       nunca produz. `left` (o padrão) é OMITIDO de propósito — é o que a
       asserção dedicada, logo depois deste documento, prova. */
    {
      type: "paragraph",
      attrs: { textAlign: "right" },
      content: [{ type: "text", text: "alinhado à direita" }],
    },
    {
      type: "heading",
      attrs: { level: 3, textAlign: "center" },
      content: [{ type: "text", text: "título centralizado" }],
    },
    /* Editor Tiptap avançado: imagem inline e destaque de cor. Sem estes
       dois, "os nomes declarados são EXATAMENTE os emitidos" (mais abaixo)
       teria `img`/`mark`/`src`/`alt`/`data-cor` declarados e este documento
       nunca os produzindo — a MESMA razão pela qual os três de alinhamento
       estão logo acima. */
    {
      type: "image",
      attrs: {
        src: "https://rkoxomfgkloukitqizma.supabase.co/storage/v1/object/public/imagens-do-blog/corpo/prova.png",
        alt: "descrição da imagem",
      },
    },
    {
      type: "paragraph",
      content: [{ type: "text", marks: [{ type: "highlight", attrs: { cor: "amarelo" } }], text: "destacado" }],
    },
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
    // Nó fora do schema, nas três formas que a matriz nomeia. `image` SAIU
    // desta lista (Editor avançado: entrou no vocabulário) — `video` ocupa o
    // lugar dela como nó que continua fora.
    { type: "table", content: [{ type: "paragraph", content: [{ type: "text", text: "tabela" }] }] },
    { type: "video", attrs: { src: "https://exemplo/x.mp4" } },
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "titulo um" }] },
    // Imagem com endereço EXECUTÁVEL: o nó está no schema agora, mas o `src`
    // não passa em `enderecoDeImagemPermitido` — o nó inteiro cai (uma
    // imagem sem `src` aceitável não é imagem), igual a um link sem `href`
    // aceitável.
    { type: "image", attrs: { src: "javascript:alert(1)" } },
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
  /* `img` entrou no vocabulário (Editor avançado: imagem inline) — `figure`
     continua fora dele: o schema não tem esse nó, e por isso ele continua
     provando "etiqueta fora do vocabulário" depois da mudança. */
  { chave: "etiqueta", descricao: "etiqueta fora do vocabulário", html: '<p>ok</p><figure>y</figure>' },
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

/**
 * O corpus da COLUNA DA CAPA (Story 3.1).
 *
 * O corpus acima cobre o `href` de um link DENTRO do conteúdo, e a regra de lá
 * é larga de propósito: caminho relativo, âncora, `mailto:` e `tel:` são links
 * legítimos de artigo. A coluna da capa é outra coisa — ela guarda o endereço
 * de um arquivo que o navegador vai buscar sozinho —, e a regra dela é
 * estreita: **só `https://` absoluto**.
 *
 * Ele começa com o corpus do `href` inteiro, e não com uma lista nova: toda
 * evasão que alguém já pensou para um endereço vale para o outro, e escrever
 * uma segunda lista aqui garantiria que a próxima evasão descoberta fosse
 * corrigida só de um lado.
 *
 * O que ele acrescenta é o que a story nomeia: CONTEÚDO DE ARQUIVO em qualquer
 * codificação. Nenhuma dessas linhas pode ser representável na coluna — e a
 * cláusula que as mata não é o teto de tamanho (uma imagem de um pixel cabe em
 * 100 caracteres), é o esquema.
 */
/**
 * Os casos do corpus da capa que precisam ser CALCULADOS.
 *
 * Escrever um endereço de 2048 caracteres à mão é impossível de manter e fácil
 * de errar por um. Sem eles, a cláusula de TETO das duas implementações nunca
 * roda — e a diferença entre o `String.length` do JavaScript (unidades UTF-16)
 * e o `char_length` do Postgres (pontos de código) nunca é medida.
 */
const RAIZ_DO_CORPUS = "https://x.supabase.co/";
const enderecoComTamanho = (n) =>
  RAIZ_DO_CORPUS + "a".repeat(n - RAIZ_DO_CORPUS.length);

const CORPUS_DE_COMPRIMENTO = Object.freeze([
  /* Exatamente no teto: precisa PASSAR nos dois lados. */
  enderecoComTamanho(TAMANHO_MAXIMO_DO_ENDERECO),
  /* Um caractere acima: precisa ser recusado nos dois. */
  enderecoComTamanho(TAMANHO_MAXIMO_DO_ENDERECO + 1),
  /* Um a menos, para o corpus ter os dois lados da fronteira. */
  enderecoComTamanho(TAMANHO_MAXIMO_DO_ENDERECO - 1),
]);

const CORPUS_DE_ENDERECOS_DE_IMAGEM = Object.freeze([
  ...CORPUS_DE_COMPRIMENTO,
  ...CORPUS_DE_ENDERECOS,
  /* ── Conteúdo de arquivo, em toda codificação que alguém tentaria ──── */
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
  "data:image/webp;base64,UklGRh4AAABXRUJQ",
  "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3C%2Fsvg%3E",
  "data:image/svg+xml;utf8,<svg onload=alert(1)></svg>",
  "DATA:IMAGE/PNG;BASE64,iVBORw0KGgo=",
  "data:;base64,iVBORw0KGgo=",
  "data:text/plain,oi",
  /* ── E as outras origens que um `src` aceitaria ─────────────────────── */
  "blob:https://x.supabase.co/9a1f-4b2c",
  "filesystem:https://x.com/temporary/a.png",
  /* ── O endereço do NOSSO bucket, que precisa continuar passando ─────── */
  "https://rkoxomfgkloukitqizma.supabase.co/storage/v1/object/public/imagens-do-blog/capas/0a1b2c3d-4e5f-6789-abcd-ef0123456789.png",
  "https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/abcdefgh.webp",
  /* ── E endereços absolutos de fora, que a COLUNA aceita e o SERVIDOR
        recusa: a coluna guarda formato, e a origem é decidida em
        `salvarPost`, que é quem conhece a URL do projeto. A Story 3.2 abre
        essa porta sem tocar na restrição. ────────────────────────────── */
  "https://cdn.exemplo.com/foto.jpg",
  "https://cdn.exemplo.com:8443/foto.jpg?v=2#topo",
  /* ── HOST LOCAL: `http://` passa SÓ aqui, e é a mesma distinção que
        `problemaNaUrl` já fazia. É o endereço que o stack local e o Supabase
        de mentira produzem — sem estas linhas, a regra do banco não teria
        como ser exercida sem rede. ─────────────────────────────────────── */
  "http://127.0.0.1:54321/storage/v1/object/public/imagens-do-blog/capas/abcdefgh.png",
  "http://localhost:3000/capa.png",
  "http://LOCALHOST/capa.png",
  /* Esquema em MAIÚSCULAS: precisa passar dos dois lados. Ele é o caso
     positivo que impede a correção de "recuse o que não começa com https://"
     de virar "recuse tudo o que não é minúsculo". */
  "HTTPS://X.SUPABASE.CO/storage/v1/object/public/imagens-do-blog/capas/abcdefgh.png",
  "HttPs://cdn.exemplo.com/capa.png",
  /* E as vizinhanças que NÃO são host local — o sufixo é a evasão clássica. */
  "http://127.0.0.1.exemplo.com/capa.png",
  "http://localhost.exemplo.com/capa.png",
  "http://cdn.exemplo.com/capa.png",
  /* ── Autoridade torta ────────────────────────────────────────────────── */
  "https://",
  "https:///caminho.png",
  "https://usuario:senha@cdn.exemplo.com/foto.jpg",
  "https://cdn exemplo.com/foto.jpg",
  "https://cdn.exemplo.com:99999999/foto.jpg",
  "https://cdn.exemplo.com/foto.jpg?titulo=<script>",
  /* ── Caractere fora de ASCII imprimível: as duas implementações
        precisam concordar até aqui, e é onde `\\s` do JavaScript e
        `[[:space:]]` do Postgres divergiriam. ─────────────────────────── */
  "https://cdn.exemplo.com/fo\u00a0to.jpg",
  "https://cdn.exemplo.com/f\u2028oto.jpg",
  "https://cdn.exemplo.com/ção.jpg",
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
    "vercel.json declara exatamente as chaves permitidas — camada nova cai nesta linha",
    vercel !== null &&
      JSON.stringify(chaves) === JSON.stringify([...CHAVES_PERMITIDAS].sort()),
    `chaves: ${chaves.join(", ") || "nenhuma"} | permitidas: ${CHAVES_PERMITIDAS.join(", ")}`,
  );
  /* ── E ESTA REABRIU NA STORY 4.1, COMO ELA MESMA PREVIA ────────────────
     A linha acima dizia, por escrito, que roteamento era da Story 4.1. Ele
     chegou: as rotas do blog são servidas por função, e vêm ANTES do
     apanha-tudo. O que esta ferramenta continua garantindo é o que é dela —
     que todo destino de reescrita é do PRÓPRIO projeto, e que o apanha-tudo
     segue servindo o documento da aplicação. A ORDEM e a lista nomeada das
     rotas têm dono próprio, em `verificar:acesso`, junto do que alcança
     `/admin` — duas ferramentas julgando a mesma coisa divergiriam. */
  const reescritas = Array.isArray(vercel?.rewrites) ? vercel.rewrites : [];
  const apanhaTudo = reescritas.filter((r) => r?.source === "/(.*)");
  afirmar(
    "o apanha-tudo continua servindo o documento da aplicação, e é único",
    apanhaTudo.length === 1 && apanhaTudo[0]?.destination === "/index.html",
    JSON.stringify(reescritas),
  );
  /* NENHUM DESTINO SAI DO PROJETO. Uma reescrita para host de fora poria um
     terceiro na frente de rota do site, e é o tipo de linha que ninguém lê
     de novo depois de aprovada. */
  const foraDoProjeto = reescritas.filter(
    (r) => typeof r?.destination !== "string" || !r.destination.startsWith("/"),
  );
  afirmar(
    "e todo destino de reescrita é do PRÓPRIO projeto — nenhum aponta para fora",
    foraDoProjeto.length === 0,
    foraDoProjeto.map((r) => `${r?.source} -> ${r?.destination}`).join(" | ") || "todos internos",
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

    /* ── Correção de UI/UX do Editor: o alinhamento SOBREVIVE ao HTML ──────
       `paragraph` e `heading` ignoravam `node.attrs` por completo — o
       alinhamento escolhido no Editor nunca chegava ao HTML publicado
       (achado do loopback desta correção). Provado aqui, contra o único
       caminho documento → HTML fora do editor. */
    afirmar(
      "o parágrafo alinhado à direita sai com `data-alinhamento=\"right\"`",
      /<p data-alinhamento="right">alinhado à direita<\/p>/.test(derivado.html),
      (/<p[^>]*>alinhado à direita<\/p>/.exec(derivado.html) ?? [])[0] ?? "não encontrado",
    );
    afirmar(
      "o TÍTULO centralizado sai com `data-alinhamento=\"center\"` — não só o parágrafo",
      /<h3 data-alinhamento="center">título centralizado<\/h3>/.test(derivado.html),
      (/<h3[^>]*>título centralizado<\/h3>/.exec(derivado.html) ?? [])[0] ?? "não encontrado",
    );

    /* left é O PADRÃO, e por isso é OMITIDO — mesma disciplina de
       `orderedList.start`/`type`: emitir o caso comum poluiria todo `<p>` e
       todo título do artigo com um atributo que não diz nada. O documento
       aqui declara `textAlign: "left"` EXPLICITAMENTE, como o editor real
       emite (é o `defaultAlignment` da extensão, presente em todo nó desde a
       primeira tecla) — omissão por AUSÊNCIA do atributo já é coberta pelo
       resto de `DOCUMENTO_COMPLETO`, que nunca declara `textAlign`. */
    {
      const esquerdaExplicita = derivarHtml({
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { textAlign: "left" },
            content: [{ type: "text", text: "alinhado à esquerda" }],
          },
        ],
      });
      afirmar(
        "`textAlign: \"left\"` explícito NÃO emite `data-alinhamento` — o padrão é omitido",
        esquerdaExplicita.ok &&
          esquerdaExplicita.html === "<p>alinhado à esquerda</p>" &&
          !esquerdaExplicita.html.includes("data-alinhamento"),
        esquerdaExplicita.ok ? esquerdaExplicita.html : JSON.stringify(esquerdaExplicita.erro),
      );
    }

    /* Alinhamento fora do vocabulário (`justify`, ou qualquer string livre)
       não sobrevive à higienização do domínio — a MESMA validação que a
       Story 2.5 sempre exerceu sobre todo atributo, exercitada aqui para o
       atributo novo: um valor que o schema não conhece é descartado, e o nó
       sobrevive sem ele (como um parágrafo sem alinhamento nenhum). */
    afirmar(
      "`textAlign` fora do vocabulário (`justify`) é descartado — o nó sobrevive sem o atributo",
      (() => {
        const sujo = derivarHtml({
          type: "doc",
          content: [
            {
              type: "paragraph",
              attrs: { textAlign: "justify" },
              content: [{ type: "text", text: "sem alinhamento válido" }],
            },
          ],
        });
        return (
          sujo.ok &&
          sujo.html === "<p>sem alinhamento válido</p>" &&
          sujo.documento.content[0].attrs === undefined
        );
      })(),
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

/* ── A LISTA DOS CAMPOS DE SEO É UMA SÓ (Story 3.4) ──────────────────────
     Ela estava copiada à mão em pelo menos cinco lugares — o Editor,
     `metadados.js` em três, a porta em dois, o transporte —, e só a varredura
     de `verificar:interface` a conferia contra o domínio. `CAMPOS_DE_SEO`
     existe justamente para ser escrita "uma vez, e não em quatro lugares", e a
     quinta cópia é onde o campo novo não entra.

     O que se afirma é a IGUALDADE de conjunto em cada consumidor, e não um
     "contém": uma lista que trouxesse um quarto nome inventado passaria por
     contenção e chegaria à gravação. */
  {
    const CONSUMIDORES_DA_LISTA = [
      ["os campos aceitos pela porta", CAMPOS_ACEITOS],
      ["as colunas que a leitura seleciona", COLUNAS_DO_POST],
    ];
    for (const [onde, lista] of CONSUMIDORES_DA_LISTA) {
      const daLista = lista.filter((campo) => campo.startsWith("seo_"));
      afirmar(
        `${onde} traz EXATAMENTE os campos de SEO do domínio — nem um a menos, nem um inventado`,
        mesmoConjunto(daLista, CAMPOS_DE_SEO),
        `${daLista.join(", ") || "nenhum"} × ${CAMPOS_DE_SEO.join(", ")}`,
      );
    }

    /* E A PARTIÇÃO em texto e imagem é a do domínio, e não uma quarta divisão:
       é ela que a porta percorre para cobrar o teto e que a gaveta percorre
       para desenhar o contador. */
    afirmar(
      "os campos de TEXTO mais o de IMAGEM são exatamente os campos de SEO",
      mesmoConjunto([...CAMPOS_DE_TEXTO_DE_SEO, CAMPO_DE_IMAGEM_DE_SEO], CAMPOS_DE_SEO) &&
        !CAMPOS_DE_TEXTO_DE_SEO.includes(CAMPO_DE_IMAGEM_DE_SEO),
      `${CAMPOS_DE_TEXTO_DE_SEO.join(", ")} + ${CAMPO_DE_IMAGEM_DE_SEO}`,
    );
  }

  /* ── O ELO HERDADO CABE NO TETO DE QUEM O HERDA ─────────────────────────
     `herdarTexto`, no domínio, NÃO confere o teto no elo herdado, e a razão
     escrita lá é que `titulo` e `resumo` já têm teto próprio na gravação. Isso
     era coincidência entre quatro números em dois arquivos: subir
     `TAMANHO_MAXIMO_DO_RESUMO` para 2000 faria a Meta Descrição HERDADA passar
     do teto que a escrita à mão recusa, e nada acusaria. Agora é guarda de
     carregamento, e ela LANÇA. */
  {
    afirmar(
      "o teto de cada fonte herdada NÃO passa do teto de higiene do campo que a herda",
      TETO_DA_FONTE_HERDADA.seo_titulo === TAMANHO_MAXIMO_DO_TITULO &&
        TETO_DA_FONTE_HERDADA.seo_descricao === TAMANHO_MAXIMO_DO_RESUMO &&
        Object.entries(TETO_DA_FONTE_HERDADA).every(
          ([campo, teto]) => teto <= TETO_DE_HIGIENE_DE_SEO[campo],
        ),
      JSON.stringify(TETO_DA_FONTE_HERDADA),
    );
    /* E A DISTÂNCIA É REAL: uma fonte com teto MAIOR produziria um valor
       herdado que a porta recusaria se tivesse sido digitado — o mesmo texto,
       aceito por um caminho e recusado pelo outro. */
    const fontesMaiores = Object.entries(TETO_DA_FONTE_HERDADA).filter(
      ([campo, teto]) => teto > TETO_DE_HIGIENE_DE_SEO[campo],
    );
    afirmar(
      "e nenhuma fonte é maior que o campo que a herda — o mesmo texto não pode ser aceito por um caminho e recusado pelo outro",
      fontesMaiores.length === 0,
      fontesMaiores.map(([c, t]) => `${c}: fonte ${t} > teto ${TETO_DE_HIGIENE_DE_SEO[c]}`).join(" | "),
    );
  }

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
  /* A CAPA (Story 3.1). As duas colunas existiam desde a Story 2.1 e não
     havia caminho nenhum para preenchê-las — fora desta lista, `imagem_url`
     chegava como campo IGNORADO e era relatado com nome, que é o
     comportamento certo para um campo que a porta não conhece, e a explicação
     de por que nenhuma capa nunca foi gravada. */
  for (const campo of ["imagem_url", "imagem_alt"]) {
    afirmar(
      `\`${campo}\` é ACEITO — sem isso não existe caminho de escrita para a capa`,
      CAMPOS_ACEITOS.includes(campo) && !CAMPOS_IGNORADOS.includes(campo),
      CAMPOS_ACEITOS.join(", "),
    );
  }

  /* E A CONSEQUÊNCIA DA LISTA, EXECUTADA.
     A lista sozinha não impede a gravação: quem lê os campos é `lerCorpo`, e
     ela seguiria lendo `imagem_url` com a linha apagada daqui. O que a lista
     DECIDE é o relatório de ignorados — então é ele que a asserção observa.
     Medido: tirar as duas linhas da lista não fazia asserção nenhuma falhar,
     e o único sintoma era o Painel avisando que descartou uma capa que gravou. */
  {
    const lido = lerCorpo(
      {
        titulo: "Um post com capa",
        slug: "um-post-com-capa",
        resumo: "Resumo",
        conteudo: DOCUMENTO_COMPLETO,
        imagem_url:
          "https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/abcdefgh.png",
        imagem_alt: "Uma descrição",
      },
      { criando: true },
    );
    afirmar(
      "e um salvamento com capa não relata NADA como ignorado — a tela avisaria que descartou o que acabou de gravar",
      lido.ok === true &&
        lido.ignorados.length === 0 &&
        lido.totalIgnorado === 0 &&
        lido.campos.imagem_url !== undefined &&
        lido.campos.imagem_alt !== undefined,
      JSON.stringify({ ignorados: lido.ignorados, campos: Object.keys(lido.campos ?? {}) }),
    );
  }

  /* ── O PAR CAPA + DESCRIÇÃO, NOS DOIS SENTIDOS ────────────────────────
     Três regras, e nenhuma delas tinha asserção antes desta revisão — as três
     sabotagens passaram verdes. `posts_imagem_exige_alt` cobre UM dos lados e
     só depois da viagem; o que se cobra aqui é a recusa ANTES dela, com a
     frase certa. */
  {
    const base = {
      titulo: "Um post com capa",
      slug: "um-post-com-capa",
      resumo: "Resumo",
      conteudo: DOCUMENTO_COMPLETO,
    };
    const CAPA =
      "https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/abcdefgh.png";
    const FRASE_DO_PAR =
      "A capa precisa de uma descrição: é ela que quem não enxerga a imagem recebe no lugar dela.";

    /* (1) CAPA SEM A CHAVE `imagem_alt` NO PEDIDO.
       A versão anterior só cobrava o par quando a chave estava PRESENTE:
       um pedido com capa e sem ela atravessava, e o banco devolvia
       "violates check constraint" cru — a recusa tardia que este bloco
       existe para evitar. */
    {
      const r = lerCorpo({ ...base, imagem_url: CAPA }, { criando: true });
      afirmar(
        "capa informada SEM a chave da descrição é recusada aqui — não deixada para o banco recusar com uma frase que ninguém entende",
        r.ok === false && r.mensagem.includes(FRASE_DO_PAR),
        `${r.ok ? "PASSOU" : r.mensagem}`,
      );
    }

    /* (2) DESCRIÇÃO SÓ COM ESPAÇOS.
       `"   "` não é `""`, e a comparação com string vazia acontecia ANTES de
       aparar: três espaços viravam uma descrição gravada na coluna, que
       escapava do par aqui e era recusada pelo `btrim` do banco. */
    for (const branco of ["   ", "\t", "\n  ", "   "]) {
      const r = lerCorpo(
        { ...base, imagem_url: CAPA, imagem_alt: branco },
        { criando: true },
      );
      afirmar(
        `descrição só com espaços (${JSON.stringify(branco)}) é vazia — não uma descrição de espaços gravada na coluna`,
        r.ok === false && r.mensagem.includes(FRASE_DO_PAR),
        r.ok ? `PASSOU com ${JSON.stringify(r.campos.imagem_alt)}` : r.mensagem,
      );
    }

    /* (3) LIMPAR A CAPA LIMPA A DESCRIÇÃO — diga o pedido o que disser.
       Nenhuma restrição do banco cobre este lado: uma descrição órfã de uma
       imagem que não existe mais reapareceria como texto alternativo da
       próxima capa, que ninguém descreveu. */
    for (const [rotulo, corpo] of [
      ["sem falar da descrição", { imagem_url: null }],
      ["mandando uma descrição junto", { imagem_url: null, imagem_alt: "Sobrou" }],
      ["com a capa vazia", { imagem_url: "", imagem_alt: "Sobrou" }],
    ]) {
      const r = lerCorpo({ ...base, ...corpo }, { criando: true });
      afirmar(
        `limpar a capa ${rotulo} limpa a descrição junto — descrição órfã viraria o texto da próxima imagem`,
        r.ok === true && r.campos.imagem_url === null && r.campos.imagem_alt === null,
        JSON.stringify({ url: r.campos?.imagem_url, alt: r.campos?.imagem_alt }),
      );
    }

    /* E O CAMINHO POSITIVO CONTINUA PASSANDO. Sem ele, uma regra que
       recusasse TODO pedido com capa passaria as asserções acima. */
    {
      const r = lerCorpo(
        { ...base, imagem_url: CAPA, imagem_alt: "  Uma descrição  " },
        { criando: true },
      );
      afirmar(
        "e o par completo passa, com a descrição APARADA — o espaço em volta não é parte do que se escreveu",
        r.ok === true &&
          r.campos.imagem_url === CAPA &&
          r.campos.imagem_alt === "Uma descrição",
        JSON.stringify({ url: r.campos?.imagem_url, alt: r.campos?.imagem_alt }),
      );
    }

    /* E MEXER SÓ NA DESCRIÇÃO continua sendo possível: editar a legenda de uma
       capa que já está gravada não fala de `imagem_url`, e exigir a capa no
       pedido faria a tela ter de reenviá-la para corrigir uma vírgula. */
    {
      const r = lerCorpo(
        { ...base, imagem_alt: "Só a descrição mudou" },
        { criando: true },
      );
      afirmar(
        "e mexer SÓ na descrição não exige reenviar a capa — o pedido que não fala dela preserva o que está gravado",
        r.ok === true &&
          r.campos.imagem_url === undefined &&
          r.campos.imagem_alt === "Só a descrição mudou",
        JSON.stringify({ url: r.campos?.imagem_url, alt: r.campos?.imagem_alt }),
      );
    }
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

  /* ── OS TRÊS CAMPOS DE SEO, SEM REDE (Story 3.4) ─────────────────────────
     A metade servidor de "o teto recusa" e de "os três chegam à coluna" só era
     observada pelas asserções que falam com o projeto real. Tirar a chamada de
     `problemaNoTextoDeSeo` da porta, ou as três colunas da gravação, deixava
     TODA a verificação offline verde — e a Story 3.1 já viveu isto: o
     comentário dela registra uma asserção offline de `lerCorpo` acrescentada
     exatamente por esse motivo. */
  {
    for (const campo of CAMPOS_DE_TEXTO_DE_SEO) {
      const teto = TETO_DE_HIGIENE_DE_SEO[campo];

      const noTeto = lerCorpo(
        { ...corpoValido(), [campo]: "t".repeat(teto) },
        { criando: true },
      );
      afirmar(
        `\`${campo}\` no teto de higiene (${teto}) ATRAVESSA a leitura do corpo, com o valor inteiro`,
        noTeto.ok === true && noTeto.campos[campo] === "t".repeat(teto),
        noTeto.ok ? `${String(noTeto.campos[campo]).length} caracteres` : noTeto.mensagem,
      );

      const acima = lerCorpo(
        { ...corpoValido(), [campo]: "t".repeat(teto + 1) },
        { criando: true },
      );
      afirmar(
        `e no teto mais um a leitura RECUSA, dizendo o número e o nome do campo — sem rede`,
        acima.ok === false &&
          acima.mensagem.includes(String(teto)) &&
          acima.mensagem.includes(ROTULOS_DE_SEO[campo]) &&
          !Object.hasOwn(acima, "campos"),
        acima.ok ? "PASSOU" : acima.mensagem,
      );

      /* E O COMPRIMENTO USUAL NÃO É RECUSA, no mesmo lugar: os dois números
         precisam continuar sendo dois mesmo sem o projeto por perto. */
      const entreOsDois = lerCorpo(
        { ...corpoValido(), [campo]: "u".repeat(COMPRIMENTO_USUAL_DE_SEO[campo] + 20) },
        { criando: true },
      );
      afirmar(
        `e o texto acima do comprimento usual de \`${campo}\` atravessa inteiro — o conselho não vira regra`,
        entreOsDois.ok === true &&
          entreOsDois.campos[campo] ===
            "u".repeat(COMPRIMENTO_USUAL_DE_SEO[campo] + 20),
        entreOsDois.ok ? "" : entreOsDois.mensagem,
      );
    }

    /* ── CARACTERES, E NÃO UNIDADES UTF-16 ─────────────────────────────
       Toda asserção de teto deste projeto usava `repeat('a', …)`, e com isso a
       divergência entre `.length` e `char_length` nunca podia aparecer: um
       emoji fora do BMP é UM caractere para a restrição do banco e DOIS para
       `.length`. Uma Meta Descrição de 160 emojis seria recusada pela porta e
       aceita pelo banco — e a recusa diria um número que a pessoa não consegue
       contar em lugar nenhum. */
    {
      const campo = "seo_descricao";
      const teto = TETO_DE_HIGIENE_DE_SEO[campo];
      const EMOJI = "😀";
      afirmar(
        "o corpus de fronteira usa mesmo um caractere FORA do BMP — senão a divergência não apareceria",
        [...EMOJI].length === 1 && EMOJI.length === 2,
        `${[...EMOJI].length} ponto(s) de código em ${EMOJI.length} unidade(s) UTF-16`,
      );
      const noTeto = lerCorpo(
        { ...corpoValido(), [campo]: EMOJI.repeat(teto) },
        { criando: true },
      );
      afirmar(
        `\`${campo}\` com ${teto} emojis ATRAVESSA — a porta conta caractere, como \`char_length\``,
        noTeto.ok === true && noTeto.campos[campo] === EMOJI.repeat(teto),
        noTeto.ok ? "" : noTeto.mensagem,
      );
      const acima = lerCorpo(
        { ...corpoValido(), [campo]: EMOJI.repeat(teto + 1) },
        { criando: true },
      );
      afirmar(
        `e com ${teto + 1} emojis ela recusa — a fronteira é a mesma, medida em caracteres`,
        acima.ok === false && acima.mensagem.includes(String(teto)),
        acima.ok ? "PASSOU" : acima.mensagem,
      );
    }

    /* ── FORA DE FORMA É PROBLEMA NOMEADO, E NUNCA "LIMPAR" ────────────
       `texto()` devolve `null` para `"   "` e para `42` — e colapsar os dois em
       `campos.seo_imagem_url = null` fazia um cliente torto APAGAR a coluna com
       `ok: true` e nenhum campo descartado. Pior: `removerImagensAnteriores` lê
       isso como remoção deliberada e apaga o arquivo do bucket. */
    const FORA_DE_FORMA = [
      ["um número", 42],
      ["um booleano", true],
      ["um objeto", {}],
      ["uma lista com o endereço dentro", ["https://x.co/a.png"]],
      ["o número zero", 0],
    ];
    for (const [comoSeChama, valor] of FORA_DE_FORMA) {
      const r = lerCorpo(
        { ...corpoValido(), [CAMPO_DE_IMAGEM_DE_SEO]: valor },
        { criando: true },
      );
      afirmar(
        `\`seo_imagem_url\` como ${comoSeChama} é RECUSADO com nome — nunca "limpar o campo"`,
        r.ok === false &&
          r.mensagem.includes(ROTULOS_DE_SEO.seo_imagem_url) &&
          !Object.hasOwn(r, "campos"),
        r.ok ? `PASSOU, campos.seo_imagem_url = ${JSON.stringify(r.campos.seo_imagem_url)}` : r.mensagem,
      );
    }

    /* E OS DOIS JEITOS LEGÍTIMOS DE LIMPAR continuam limpando — sem isto, uma
       recusa larga demais faria as cinco acima passarem sem que "vazio herda"
       continuasse valendo. */
    for (const [nome, valor] of [
      ["null", null],
      ["vazio", ""],
      ["só espaços", "   "],
    ]) {
      const r = lerCorpo(
        { ...corpoValido(), [CAMPO_DE_IMAGEM_DE_SEO]: valor },
        { criando: true },
      );
      afirmar(
        `controle positivo: \`seo_imagem_url\` como ${nome} LIMPA a coluna — vazio é o pedido de herdar`,
        r.ok === true && r.campos.seo_imagem_url === null,
        r.ok ? JSON.stringify(r.campos.seo_imagem_url) : r.mensagem,
      );
    }

    /* Os dois campos de TEXTO já recusavam fora de forma; a asserção existe
       para que os três continuem dizendo a MESMA coisa. */
    for (const campo of CAMPOS_DE_TEXTO_DE_SEO) {
      const r = lerCorpo({ ...corpoValido(), [campo]: 42 }, { criando: true });
      afirmar(
        `\`${campo}\` como número é recusado com nome, igual ao irmão de imagem`,
        r.ok === false && r.mensagem.includes(ROTULOS_DE_SEO[campo]),
        r.ok ? "PASSOU" : r.mensagem,
      );
    }
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
      /* Story 3.1: `removerArquivoDaCapa` é a TERCEIRA remoção do transporte, e
         a primeira que não é do banco — ela apaga um objeto do Storage com a
         chave de serviço, que ignora política. Por isso ela tem a guarda
         equivalente à do `DELETE` sem filtro: `ehCaminhoDeCapa`, lista de
         PERMISSÃO do domínio, porque o caminho vem de um endereço gravado e um
         caminho torto apagaria coisa que ninguém pediu. */
      /* Editor Tiptap avançado: `removerArquivoDoCorpo` é a QUINTA — a MESMA
         forma de `removerArquivoDaCapa`, guarda trocada (`ehCaminhoDoCorpo`
         em vez de `ehCaminhoDeCapa`), porque a imagem INLINE do corpo do Post
         vive numa pasta própria do mesmo bucket (`corpo/`, não `capas/`). */
      "api/_nucleo/acesso.js": [
        "excluirPost",
        "excluirCategoria",
        "removerArquivoDaCapa",
        "removerArquivoDoCorpo",
      ],
      /* E o núcleo passou a ter remoção: `removerCapaAnterior` decide QUAL
         arquivo sai e QUANDO — sempre depois de a linha ser gravada ou
         apagada —, e chama o transporte. Ela nunca desfaz nada por falhar: o
         resíduo é nomeado, e é a única coisa que sobra. */
      /* Story 3.4: `removerImagensAnteriores` é a QUARTA, e ela não fala com o
         transporte — ela percorre `COLUNAS_DE_IMAGEM` e delega à anterior, uma
         vez por coluna. Ela existe porque a story abriu a escrita de
         `seo_imagem_url`: abrir uma porta de escrita para um arquivo sem abrir
         junto o caminho que o remove é criar um vazamento com data marcada.
         Ela entra NESTA lista, e não passa despercebida, que é o ponto. */
      /* Editor Tiptap avançado: `removerImagensDoCorpoAnteriores` é a SEXTA —
         irmã de `removerImagensAnteriores`, mas compara o CONTEÚDO do
         documento (todo `src` de nó `image`) entre a linha anterior e a
         atual, em vez de coluna contra coluna. Ela chama
         `acesso.removerArquivoDoCorpo` — daí o nome também aparecer nesta
         lista, ainda que a função em si esteja em `acesso.js`. */
      "api/_nucleo/salvarPost.js": [
        "removerImagensAnteriores",
        "removerImagensDoCorpoAnteriores",
        "removerCapaAnterior",
        "removerArquivoDaCapa",
        "removerArquivoDoCorpo",
      ],
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
      /* A CAPA (Story 3.1). A linha de mentira tem capa porque é dela que o
         caminho no bucket é derivado quando o Post é excluído — sem ela, a
         remoção do arquivo não teria o que remover e a asserção passaria por
         vacuidade. O endereço é montado pelo DOMÍNIO, sobre a URL do servidor
         local: escrevê-lo à mão faria a asserção provar o formato que ela
         mesma inventou. */
      imagem_url: null,
      imagem_alt: "A capa de teste",
      criado_em: "2026-01-01T00:00:00.000Z",
      atualizado_em: "2026-01-01T00:00:00.000Z",
    };

    /* O que a rota de Storage responde. Trocado pelas asserções que provam
       que falha na remoção NÃO desfaz nem impede a exclusão. */
    let respostaDoStorage = [200, { message: "removido" }];
    /* E a falha da gravação de TAGS, para provar que ela não rouba a remoção
       da capa anterior — a ordem entre as duas é o conserto de um resíduo que
       nascia sem nome. */
    let falharAoDefinirTags = false;

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
        /* ── O SELECT= É RESPEITADO (Story 3.1, revisão) ────────────────
             O servidor de mentira devolvia a linha INTEIRA em toda resposta,
             então `COLUNAS_DO_POST` não estava presa por nada: tirar
             `imagem_url` da lista passava a suíte verde e, contra o PostgREST
             de verdade, fazia TODO salvamento apagar a capa que acabou de ser
             mantida (a linha gravada volta sem o campo, `atual` vira `null`, e
             a remoção da anterior dispara). Recortar a resposta pelas colunas
             pedidas é uma função, e transforma a família inteira de asserções
             de lista de colunas em observação real. */
        const recortar = (linhas) => {
          const pedido = /[?&]select=([^&]*)/.exec(req.url)?.[1];
          if (!pedido) return linhas;
          const colunas = decodeURIComponent(pedido)
            .split(",")
            .map((c) => c.trim())
            .filter((c) => c !== "" && c !== "*");
          if (colunas.length === 0) return linhas;
          return linhas.map((linha) =>
            Object.fromEntries(
              colunas
                .filter((c) => Object.hasOwn(linha, c))
                .map((c) => [c, linha[c]]),
            ),
          );
        };
        if (req.url.startsWith("/rest/v1/posts")) {
          /* Consulta por ENDEREÇO devolve vazio: é a pergunta "alguém já usa
             este slug?", e responder que sim faria toda gravação virar conflito
             antes de o despacho ser observado. Consulta por id devolve a linha,
             que é o Post existente que destacar e excluir alcançam. */
          if (req.method === "GET") {
            return responder(
              200,
              req.url.includes("slug=eq.") ? [] : recortar([linhaDoPost]),
            );
          }
          if (req.method === "POST") return responder(201, recortar([linhaDoPost]));
          if (req.method === "PATCH") {
            return responder(200, recortar([{ ...linhaDoPost, ...corpo }]));
          }
          if (req.method === "DELETE") return responder(200, recortar([linhaDoPost]));
        }
        /* ── A ROTA DO STORAGE (Story 3.1) ──────────────────────────────
           Ela entra no Supabase de mentira pela mesma razão que as outras: a
           remoção do arquivo é comportamento, e comportamento se observa. Sem
           ela, "excluir o Post remove o arquivo" só seria conferível lendo o
           código — e trocar a ordem, ou não chamar nada, passaria verde.

           `respostaDoStorage` é o que o teste QUER que o Storage responda:
           por padrão sucesso, e a falha é armada para provar que ela não
           impede a exclusão. */
        if (req.url.startsWith("/storage/v1/object/")) {
          const [status, dados] = respostaDoStorage;
          return responder(status, dados);
        }
        if (req.url.startsWith("/rest/v1/rpc/definir_tags_do_post")) {
          if (falharAoDefinirTags) {
            return responder(500, { code: "XX000", message: "as tags nao entraram" });
          }
          return responder(200, []);
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

        /* — SALVAR COM OS TRÊS CAMPOS DE SEO, e o corpo do comando conferido —
           `colunasDeMetadado` é a metade SILENCIOSA do caminho de escrita: os
           campos passam pela lista de permissão, são validados, e o comando sai
           sem eles. Tirar as três linhas de lá deixava toda a verificação
           offline verde. O que se afirma aqui é o VALOR de cada coluna no corpo
           que chegou ao banco — uma contagem de chaves passaria com os três
           trocados entre si. */
        {
          recebidos.length = 0;
          const COM_SEO = {
            seo_titulo: "Título de busca próprio",
            seo_descricao: "Descrição de busca própria",
            seo_imagem_url:
              "https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/abcdefgh.png",
          };
          const salvouComSeo = await dirigir({
            corpo: {
              operacao: OPERACAO_SALVAR,
              slug: "um-post-com-seo",
              titulo: "Um post com SEO",
              resumo: "Resumo",
              conteudo: DOCUMENTO_COMPLETO,
              ...COM_SEO,
            },
            cabecalhos: COMO_SESSAO,
            ambiente: AMBIENTE_LOCAL,
          });
          const insercao = naTabela().find((r) => r.metodo === "POST");
          const divergentes = CAMPOS_DE_SEO.filter(
            (campo) => insercao?.corpo?.[campo] !== COM_SEO[campo],
          );
          afirmar(
            "os TRÊS campos de SEO chegam ao comando de gravação, com o valor de cada um — sem rede externa",
            salvouComSeo.status === 201 && insercao !== undefined && divergentes.length === 0,
            `HTTP ${salvouComSeo.status} | divergentes: ${divergentes.join(", ") || "nenhum"} | ${JSON.stringify(
              Object.fromEntries(CAMPOS_DE_SEO.map((c) => [c, insercao?.corpo?.[c]])),
            ).slice(0, 220)}`,
          );

          /* E VAZIO CHEGA COMO `null`, e não como ausência: a coluna precisa
             ser LIMPA, e um campo que some do corpo preserva o que estava lá. */
          recebidos.length = 0;
          await dirigir({
            corpo: {
              operacao: OPERACAO_SALVAR,
              slug: "um-post-sem-seo",
              titulo: "Um post sem SEO",
              resumo: "Resumo",
              conteudo: DOCUMENTO_COMPLETO,
              seo_titulo: "",
              seo_descricao: "   ",
              seo_imagem_url: null,
            },
            cabecalhos: COMO_SESSAO,
            ambiente: AMBIENTE_LOCAL,
          });
          const semSeo = naTabela().find((r) => r.metodo === "POST");
          afirmar(
            "e vazio chega ao comando como `null` nas três — ausência preservaria o que estava gravado",
            semSeo !== undefined &&
              CAMPOS_DE_SEO.every(
                (campo) =>
                  Object.hasOwn(semSeo.corpo ?? {}, campo) && semSeo.corpo[campo] === null,
              ),
            JSON.stringify(
              Object.fromEntries(CAMPOS_DE_SEO.map((c) => [c, semSeo?.corpo?.[c]])),
            ),
          );
        }

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

        /* ─── O SERVIDOR DE MENTIRA RESPEITA `select=`, e isso é AFIRMADO ──
           O recorte é o que prende as listas de coluna: sem ele, tirar
           `imagem_url` de `COLUNAS_DO_POST` passava verde e, contra o
           PostgREST de verdade, fazia TODO salvamento apagar a capa que
           acabou de ser mantida.

           Mas o recorte é ANDAIME, e andaime sem asserção é andaime que
           alguém desliga sem perceber — e aí a família inteira de asserções
           de coluna volta a não provar nada, em silêncio. Esta pergunta ao
           servidor de mentira é o autoteste dele. */
        {
          const resposta = await fetch(
            `${AMBIENTE_LOCAL.SUPABASE_URL}/rest/v1/posts?select=id,slug&id=eq.${ID}`,
          );
          const linhas = await resposta.json();
          const completa = await fetch(
            `${AMBIENTE_LOCAL.SUPABASE_URL}/rest/v1/posts?id=eq.${ID}`,
          ).then((r) => r.json());
          afirmar(
            "o Supabase de mentira RECORTA a resposta pelas colunas de `select=` — é isso que prende as listas de coluna",
            mesmoConjunto(Object.keys(linhas[0] ?? {}), ["id", "slug"]) &&
              Object.keys(completa[0] ?? {}).length > 5,
            `com select: ${Object.keys(linhas[0] ?? {}).join(",")} | sem select: ${Object.keys(completa[0] ?? {}).length} colunas`,
          );
          recebidos.length = 0;
        }
        /* ─── A CAPA, PELO SUPABASE DE MENTIRA (Story 3.1) ────────────────
           Quatro coisas que só se observam com o servidor local: o que chega
           ao banco no corpo do comando, o que chega ao Storage, a ORDEM entre
           os dois, e o que acontece quando a remoção falha. */

        const BASE_LOCAL = `http://127.0.0.1:${porta}`;
        const CAMINHO_DA_CAPA = caminhoDaCapa(
          "image/png",
          "0a1b2c3d-4e5f-6789-abcd-ef0123456789",
        );
        const ENDERECO_DA_CAPA = enderecoPublicoDaCapa(BASE_LOCAL, CAMINHO_DA_CAPA);

        /* — O CORPO QUE CHEGA AO BANCO LEVA ENDEREÇO, NUNCA CONTEÚDO — */
        recebidos.length = 0;
        respostaDoStorage = [200, { message: "removido" }];
        linhaDoPost.imagem_url = null;
        const comCapa = await dirigir({
          corpo: {
            operacao: OPERACAO_SALVAR,
            slug: "um-post-com-capa",
            titulo: "Um post com capa",
            resumo: "Resumo",
            conteudo: DOCUMENTO_COMPLETO,
            imagem_url: ENDERECO_DA_CAPA,
            imagem_alt: "Uma descrição da capa",
          },
          cabecalhos: COMO_SESSAO,
          ambiente: AMBIENTE_LOCAL,
        });
        const insercao = naTabela().find((r) => r.metodo === "POST");
        afirmar(
          "o corpo que chega ao banco leva o ENDEREÇO da capa e a descrição, e mais nada de arquivo",
          comCapa.corpo?.ok === true &&
            insercao !== undefined &&
            insercao.corpo?.imagem_url === ENDERECO_DA_CAPA &&
            insercao.corpo?.imagem_alt === "Uma descrição da capa",
          `HTTP ${comCapa.status} | imagem_url no comando: ${JSON.stringify(insercao?.corpo?.imagem_url)}`,
        );
        afirmar(
          "e NENHUM comando ao banco carrega conteúdo de arquivo, em codificação nenhuma",
          !recebidos.some((r) =>
            /data:[a-z/+.-]*;?base64,|blob:|filesystem:/i.test(JSON.stringify(r.corpo ?? "")),
          ),
          JSON.stringify(recebidos.map((r) => r.corpo)).slice(0, 200),
        );

        /* — CONTEÚDO DE ARQUIVO NA COLUNA É RECUSADO ANTES DO BANCO — */
        recebidos.length = 0;
        const comBase64 = await dirigir({
          corpo: {
            operacao: OPERACAO_SALVAR,
            slug: "um-post-com-base64",
            titulo: "Um post com base64",
            resumo: "Resumo",
            conteudo: DOCUMENTO_COMPLETO,
            imagem_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAA",
            imagem_alt: "Uma descrição",
          },
          cabecalhos: COMO_SESSAO,
          ambiente: AMBIENTE_LOCAL,
        });
        afirmar(
          "conteúdo de arquivo na coluna da capa é recusado pela função, SEM nenhuma ida ao banco",
          comBase64.status === CODIGO_HTTP[ERRO_DADOS_INVALIDOS] &&
            comBase64.corpo?.ok === false &&
            !naTabela().some((r) => r.metodo === "POST"),
          `HTTP ${comBase64.status} | comandos: ${naTabela().map((r) => r.metodo).join(", ") || "nenhum"}`,
        );

        /* — E CAPA DE OUTRO DOMÍNIO É ACEITA (Story 3.2) — */
        //
        // Esta asserção era o oposto até a Story 3.2, e a virada é a story
        // inteira: o banco já aceitava endereço absoluto seguro de qualquer
        // host desde a restrição da 3.1 — o corpus exige que
        // `https://cdn.exemplo.com/foto.jpg` passe —, e quem recusava era só a
        // aplicação, com a frase "endereço de imagem de fora ainda não é
        // aceita". A permissão abriu sem tocar no banco.
        //
        // O que se prova aqui é o caminho inteiro: a função aceita, o comando
        // vai ao banco, e o que ele leva é o ENDEREÇO DE FORA — não um endereço
        // do bucket, não uma cópia, não conteúdo. O endereço é referência.
        const ENDERECO_DE_FORA = "https://cdn.exemplo.com/foto.png";
        recebidos.length = 0;
        linhaDoPost.imagem_url = null;
        const deFora = await dirigir({
          corpo: {
            operacao: OPERACAO_SALVAR,
            slug: "um-post-com-capa-de-fora",
            titulo: "Um post com capa de fora",
            resumo: "Resumo",
            conteudo: DOCUMENTO_COMPLETO,
            imagem_url: ENDERECO_DE_FORA,
            imagem_alt: "Uma descrição",
          },
          cabecalhos: COMO_SESSAO,
          ambiente: AMBIENTE_LOCAL,
        });
        const insercaoDeFora = naTabela().find((r) => r.metodo === "POST");
        afirmar(
          "capa de OUTRO DOMÍNIO é aceita — a permissão que esta story abre, e o que chega ao banco é o endereço de fora",
          /* 201: o Post NASCE aqui — é criação, e não atualização. */
          deFora.status === 201 &&
            deFora.corpo?.ok === true &&
            insercaoDeFora !== undefined &&
            insercaoDeFora.corpo?.imagem_url === ENDERECO_DE_FORA &&
            enderecoDeImagemPermitido(ENDERECO_DE_FORA) === true,
          `HTTP ${deFora.status} | imagem_url no comando: ${JSON.stringify(insercaoDeFora?.corpo?.imagem_url)} | ${JSON.stringify(deFora.corpo?.erro ?? "")}`,
        );
        afirmar(
          "e a imagem de fora NÃO é baixada, copiada nem reservada — nenhuma ida ao Storage acontece por causa dela",
          !recebidos.some((r) => r.url.startsWith("/storage/v1/object/")),
          recebidos
            .filter((r) => r.url.startsWith("/storage/v1/object/"))
            .map((r) => `${r.metodo} ${r.url}`)
            .join(", "),
        );

        /* — E ABRIR A ORIGEM NÃO AFROUXOU O ESQUEMA — */
        //
        // Abrir uma permissão é o momento em que a lista vizinha costuma
        // afrouxar junto: a conferência que recusava a origem e a que recusa o
        // esquema ficavam a três linhas uma da outra. O que se prova é que os
        // esquemas fora do vocabulário continuam recusados PELAS DUAS
        // implementações — a função de servidor, aqui, e o espelho em JS, que a
        // seção do corpus compara com o SQL do banco.
        {
          const FORA_DO_VOCABULARIO = [
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ",
            "blob:https://cdn.exemplo.com/9a1f-4b2c",
            "javascript:alert(1)",
            "/capas/relativa.png",
            "//cdn.exemplo.com/foto.png",
            "http://cdn.exemplo.com/foto.png",
            "https://usuario:senha@cdn.exemplo.com/foto.png",
            "https://x.supabase.co/" + "a".repeat(TAMANHO_MAXIMO_DO_ENDERECO),
          ];
          const passaramNoDominio = FORA_DO_VOCABULARIO.filter((e) =>
            enderecoDeImagemPermitido(e),
          );
          const atravessaram = [];
          for (const endereco of FORA_DO_VOCABULARIO) {
            recebidos.length = 0;
            const tentativa = await dirigir({
              corpo: {
                operacao: OPERACAO_SALVAR,
                slug: "um-post-com-esquema-torto",
                titulo: "Um post com esquema torto",
                resumo: "Resumo",
                conteudo: DOCUMENTO_COMPLETO,
                imagem_url: endereco,
                imagem_alt: "Uma descrição",
              },
              cabecalhos: COMO_SESSAO,
              ambiente: AMBIENTE_LOCAL,
            });
            if (
              tentativa.status !== CODIGO_HTTP[ERRO_DADOS_INVALIDOS] ||
              naTabela().some((r) => r.metodo === "POST")
            ) {
              atravessaram.push(`${endereco.slice(0, 40)} → HTTP ${tentativa.status}`);
            }
          }
          afirmar(
            `abrir a origem NÃO afrouxou o esquema: os ${FORA_DO_VOCABULARIO.length} endereços fora do vocabulário continuam recusados pela função, sem nenhuma ida ao banco`,
            atravessaram.length === 0,
            atravessaram.join(" | "),
          );
          afirmar(
            "e o espelho em JavaScript recusa os MESMOS — as duas implementações não se afastaram na abertura",
            passaramNoDominio.length === 0,
            passaramNoDominio.map((e) => e.slice(0, 40)).join(" | "),
          );
        }

        /* — TROCAR A CAPA REMOVE A ANTERIOR, DEPOIS DE GRAVAR — */
        const CAMINHO_ANTIGO = caminhoDaCapa(
          "image/png",
          "11112222-3333-4444-5555-666677778888",
        );
        const ENDERECO_ANTIGO = enderecoPublicoDaCapa(BASE_LOCAL, CAMINHO_ANTIGO);
        recebidos.length = 0;
        linhaDoPost.imagem_url = ENDERECO_ANTIGO;
        const trocou = await dirigir({
          corpo: {
            operacao: OPERACAO_SALVAR,
            id: ID,
            slug: "um-post-de-teste",
            titulo: "Um post de teste",
            resumo: "Resumo",
            conteudo: DOCUMENTO_COMPLETO,
            imagem_url: ENDERECO_DA_CAPA,
            imagem_alt: "A capa nova",
          },
          cabecalhos: COMO_SESSAO,
          ambiente: AMBIENTE_LOCAL,
        });
        const noStorage = recebidos.filter((r) => r.url.startsWith("/storage/v1/object/"));
        const indiceDoPatch = recebidos.findIndex(
          (r) => r.metodo === "PATCH" && r.url.startsWith("/rest/v1/posts"),
        );
        const indiceDaRemocao = recebidos.findIndex((r) =>
          r.url.startsWith("/storage/v1/object/"),
        );
        afirmar(
          "trocar a capa REMOVE o arquivo anterior do Storage — e remove o anterior, não o novo",
          trocou.corpo?.ok === true &&
            noStorage.length === 1 &&
            noStorage[0].metodo === "DELETE" &&
            noStorage[0].url.includes(CAMINHO_ANTIGO) &&
            !noStorage[0].url.includes(CAMINHO_DA_CAPA),
          `chamadas ao Storage: ${noStorage.map((r) => `${r.metodo} ${r.url}`).join(", ") || "nenhuma"}`,
        );
        afirmar(
          "e a ORDEM é a que não perde nada: a linha é gravada ANTES de o arquivo sair",
          indiceDoPatch >= 0 && indiceDaRemocao > indiceDoPatch,
          `gravação em ${indiceDoPatch}, remoção em ${indiceDaRemocao}`,
        );

        /* — SALVAR SEM MEXER NA CAPA NÃO REMOVE NADA — */
        recebidos.length = 0;
        linhaDoPost.imagem_url = ENDERECO_DA_CAPA;
        await dirigir({
          corpo: {
            operacao: OPERACAO_SALVAR,
            id: ID,
            slug: "um-post-de-teste",
            titulo: "Um post de teste",
            resumo: "Resumo",
            conteudo: DOCUMENTO_COMPLETO,
            imagem_url: ENDERECO_DA_CAPA,
            imagem_alt: "A capa nova",
          },
          cabecalhos: COMO_SESSAO,
          ambiente: AMBIENTE_LOCAL,
        });
        afirmar(
          "salvar sem trocar a capa NÃO remove arquivo nenhum — apagar aqui apagaria a capa que acabou de ser gravada",
          !recebidos.some((r) => r.url.startsWith("/storage/v1/object/")),
          recebidos
            .filter((r) => r.url.startsWith("/storage/v1/object/"))
            .map((r) => r.url)
            .join(", "),
        );

        /* ═══ AS TRÊS COMBINAÇÕES DE TROCA DE CAPA (Story 3.2) ═════════════
           Com endereço de fora permitido, a troca deixou de ter uma forma só.
           São três, e é a interação mais fácil de errar NOS DOIS SENTIDOS:
           deixar de remover o arquivo que ninguém mais referencia, ou tentar
           remover um caminho derivado de um endereço que não é nosso — que,
           com a chave de serviço, é apagar às cegas.

           A guarda é `ehCaminhoDeCapa`, lista de PERMISSÃO do domínio, e o que
           estas três asserções fazem é exercitá-la pelos dois lados da troca em
           vez de acreditar no comentário que a descreve. */
        {
          const cabecalhoDaTroca = (imagem_url) => ({
            corpo: {
              operacao: OPERACAO_SALVAR,
              id: ID,
              slug: "um-post-de-teste",
              titulo: "Um post de teste",
              resumo: "Resumo",
              conteudo: DOCUMENTO_COMPLETO,
              imagem_url,
              imagem_alt: "A capa nova",
            },
            cabecalhos: COMO_SESSAO,
            ambiente: AMBIENTE_LOCAL,
          });
          const OUTRO_DE_FORA = "https://outro.exemplo.com/capa.jpg";
          const noStorageDe = () =>
            recebidos.filter((r) => r.url.startsWith("/storage/v1/object/"));

          /* (1) ENVIADA → DE FORA: o arquivo do bucket SAI. Ele deixou de ser
                 referenciado no mesmo instante em que a linha mudou, e não há
                 salvamento futuro que saiba o nome dele. */
          recebidos.length = 0;
          respostaDoStorage = [200, { message: "removido" }];
          linhaDoPost.imagem_url = ENDERECO_ANTIGO;
          const paraFora = await dirigir(cabecalhoDaTroca(ENDERECO_DE_FORA));
          afirmar(
            "trocar capa ENVIADA por endereço DE FORA remove o arquivo do bucket — ele deixou de ser referenciado no mesmo instante",
            paraFora.corpo?.ok === true &&
              noStorageDe().length === 1 &&
              noStorageDe()[0].metodo === "DELETE" &&
              noStorageDe()[0].url.includes(CAMINHO_ANTIGO) &&
              paraFora.corpo?.dados?.residuo === undefined,
            `HTTP ${paraFora.status} | Storage: ${noStorageDe().map((r) => `${r.metodo} ${r.url}`).join(", ") || "nenhuma"}`,
          );

          /* (2) DE FORA → ENVIADA: NENHUMA remoção é tentada. O endereço
                 anterior não é nosso, e derivar um caminho dele para apagar com
                 a chave de serviço seria apagar às cegas. E a ausência de
                 remoção não é resíduo: não havia o que remover. */
          recebidos.length = 0;
          linhaDoPost.imagem_url = ENDERECO_DE_FORA;
          const paraDentro = await dirigir(cabecalhoDaTroca(ENDERECO_DA_CAPA));
          afirmar(
            "trocar capa DE FORA por uma ENVIADA não tenta remoção NENHUMA no bucket — e não vira resíduo, porque não havia o que remover",
            paraDentro.corpo?.ok === true &&
              noStorageDe().length === 0 &&
              paraDentro.corpo?.dados?.residuo === undefined,
            `Storage: ${noStorageDe().map((r) => `${r.metodo} ${r.url}`).join(", ") || "nenhuma"}`,
          );

          /* (3) DE FORA → DE FORA: idem, e é o caso que uma guarda escrita
                 como "só não remove quando a capa nova é de fora" deixaria
                 passar — ela olharia o lado errado da troca. */
          recebidos.length = 0;
          linhaDoPost.imagem_url = ENDERECO_DE_FORA;
          const entreForas = await dirigir(cabecalhoDaTroca(OUTRO_DE_FORA));
          afirmar(
            "trocar um endereço DE FORA por outro também não tenta remoção nenhuma — quem decide é a capa ANTERIOR, não a nova",
            entreForas.corpo?.ok === true &&
              noStorageDe().length === 0 &&
              entreForas.corpo?.dados?.residuo === undefined,
            `Storage: ${noStorageDe().map((r) => `${r.metodo} ${r.url}`).join(", ") || "nenhuma"}`,
          );

          /* E O CONTROLE POSITIVO NA MESMA VARREDURA: com a capa anterior do
             bucket, a remoção ACONTECE. Sem esta linha, um `removerCapaAnterior`
             que devolvesse `null` de saída passaria as três de cima. */
          recebidos.length = 0;
          linhaDoPost.imagem_url = ENDERECO_ANTIGO;
          await dirigir(cabecalhoDaTroca(ENDERECO_DA_CAPA));
          afirmar(
            "e a remoção continua acontecendo quando a anterior ERA nossa — o controle positivo das três acima",
            noStorageDe().length === 1 &&
              noStorageDe()[0].url.includes(CAMINHO_ANTIGO),
            `Storage: ${noStorageDe().map((r) => `${r.metodo} ${r.url}`).join(", ") || "nenhuma"}`,
          );

          /* E TIRAR A CAPA DE FORA — não trocar, TIRAR — também não tenta
             nada: `atual` vira nulo, e `anterior` continua não sendo nosso. */
          recebidos.length = 0;
          linhaDoPost.imagem_url = ENDERECO_DE_FORA;
          const tirouDeFora = await dirigir({
            corpo: {
              operacao: OPERACAO_SALVAR,
              id: ID,
              slug: "um-post-de-teste",
              titulo: "Um post de teste",
              resumo: "Resumo",
              conteudo: DOCUMENTO_COMPLETO,
              imagem_url: null,
              imagem_alt: null,
            },
            cabecalhos: COMO_SESSAO,
            ambiente: AMBIENTE_LOCAL,
          });
          afirmar(
            "e TIRAR uma capa de fora não tenta remoção nenhuma — o Post deixa de apontar para lá, e lá não é nosso",
            tirouDeFora.corpo?.ok === true && noStorageDe().length === 0,
            `Storage: ${noStorageDe().map((r) => `${r.metodo} ${r.url}`).join(", ") || "nenhuma"}`,
          );
          linhaDoPost.imagem_url = null;
        }

        /* — EXCLUIR O POST REMOVE O ARQUIVO, DEPOIS DE A LINHA SAIR — */
        recebidos.length = 0;
        linhaDoPost.imagem_url = ENDERECO_DA_CAPA;
        const excluiuComCapa = await dirigir({
          corpo: { operacao: OPERACAO_EXCLUIR, id: ID },
          cabecalhos: COMO_SESSAO,
          ambiente: AMBIENTE_LOCAL,
        });
        const remocaoNaExclusao = recebidos.filter((r) =>
          r.url.startsWith("/storage/v1/object/"),
        );
        const indiceDoDelete = recebidos.findIndex(
          (r) => r.metodo === "DELETE" && r.url.startsWith("/rest/v1/posts"),
        );
        const indiceDoArquivo = recebidos.findIndex((r) =>
          r.url.startsWith("/storage/v1/object/"),
        );
        afirmar(
          "excluir o Post REMOVE o arquivo da capa do Storage",
          excluiuComCapa.corpo?.ok === true &&
            remocaoNaExclusao.length === 1 &&
            remocaoNaExclusao[0].metodo === "DELETE" &&
            remocaoNaExclusao[0].url.includes(CAMINHO_DA_CAPA),
          `chamadas ao Storage: ${remocaoNaExclusao.map((r) => `${r.metodo} ${r.url}`).join(", ") || "nenhuma"}`,
        );
        afirmar(
          "e a LINHA sai antes do arquivo — Post apontando para arquivo que não existe é pior que arquivo órfão",
          indiceDoDelete >= 0 && indiceDoArquivo > indiceDoDelete,
          `linha em ${indiceDoDelete}, arquivo em ${indiceDoArquivo}`,
        );

        /* — E FALHA AO REMOVER NÃO IMPEDE NEM DESFAZ A EXCLUSÃO — */
        recebidos.length = 0;
        respostaDoStorage = [500, { message: "o Storage caiu" }];
        linhaDoPost.imagem_url = ENDERECO_DA_CAPA;
        const excluiuComFalha = await dirigir({
          corpo: { operacao: OPERACAO_EXCLUIR, id: ID },
          cabecalhos: COMO_SESSAO,
          ambiente: AMBIENTE_LOCAL,
        });
        afirmar(
          "falha ao remover o arquivo NÃO impede a exclusão do Post — a exclusão é a operação autoritativa",
          excluiuComFalha.status === 200 &&
            excluiuComFalha.corpo?.ok === true &&
            excluiuComFalha.corpo.dados.operacao === OPERACAO_EXCLUIR,
          `HTTP ${excluiuComFalha.status} ${JSON.stringify(excluiuComFalha.corpo).slice(0, 200)}`,
        );
        afirmar(
          "e o resíduo é NOMEADO: a resposta diz qual arquivo ficou, e o log do servidor registra o motivo",
          excluiuComFalha.corpo?.dados?.residuo?.arquivo === CAMINHO_DA_CAPA &&
            excluiuComFalha.log.some(
              (l) => l.includes(CAMINHO_DA_CAPA) && /resíduo/i.test(l),
            ),
          `resíduo: ${JSON.stringify(excluiuComFalha.corpo?.dados?.residuo)} | log: ${excluiuComFalha.log.join(" | ").slice(0, 200)}`,
        );
        /* E O MOTIVO NÃO VIAJA. É a mesma regra que `respostaDeErro` aplica ao
           `detalhe`: texto do Storage, SQLSTATE e nome de restrição são
           diagnóstico de servidor, e a resposta leva só o que a tela usaria. */
        afirmar(
          "e o MOTIVO fica no log e não na resposta — detalhe interno não viaja, nem no caminho de sucesso",
          mesmoConjunto(Object.keys(excluiuComFalha.corpo?.dados?.residuo ?? {}), ["arquivo"]) &&
            excluiuComFalha.log.join(" ").length > 0,
          JSON.stringify(excluiuComFalha.corpo?.dados?.residuo),
        );

        /* — E NÃO TENTA REMOVER O QUE NÃO É NOSSO — */
        recebidos.length = 0;
        respostaDoStorage = [200, { message: "removido" }];
        linhaDoPost.imagem_url = "https://cdn.exemplo.com/foto.png";
        const excluiuDeFora = await dirigir({
          corpo: { operacao: OPERACAO_EXCLUIR, id: ID },
          cabecalhos: COMO_SESSAO,
          ambiente: AMBIENTE_LOCAL,
        });
        afirmar(
          "capa de outro domínio não gera remoção nenhuma no nosso bucket — nem resíduo",
          excluiuDeFora.corpo?.ok === true &&
            !recebidos.some((r) => r.url.startsWith("/storage/v1/object/")) &&
            excluiuDeFora.corpo?.dados?.residuo === undefined,
          `chamadas ao Storage: ${recebidos.filter((r) => r.url.startsWith("/storage/v1/object/")).length}`,
        );
        linhaDoPost.imagem_url = null;

        /* — (22) FALHA NA REMOÇÃO AO TROCAR A CAPA: a outra metade — */
        //
        // A simetria faltava: só a exclusão exercitava o caminho da falha, e a
        // TROCA — que é o caso comum — não. O resíduo dela nasce de outro
        // lugar do núcleo, e um `return` mal posto ali deixaria a capa anterior
        // órfã sem nada acusar.
        recebidos.length = 0;
        respostaDoStorage = [500, { message: "o Storage caiu" }];
        linhaDoPost.imagem_url = ENDERECO_ANTIGO;
        const trocouComFalha = await dirigir({
          corpo: {
            operacao: OPERACAO_SALVAR,
            id: ID,
            slug: "um-post-de-teste",
            titulo: "Um post de teste",
            resumo: "Resumo",
            conteudo: DOCUMENTO_COMPLETO,
            imagem_url: ENDERECO_DA_CAPA,
            imagem_alt: "A capa nova",
          },
          cabecalhos: COMO_SESSAO,
          ambiente: AMBIENTE_LOCAL,
        });
        afirmar(
          "falha ao remover a capa anterior NÃO desfaz o salvamento — a gravação é a operação autoritativa",
          trocouComFalha.status === 200 &&
            trocouComFalha.corpo?.ok === true &&
            trocouComFalha.corpo.dados.post?.imagem_url === ENDERECO_DA_CAPA,
          `HTTP ${trocouComFalha.status} ${JSON.stringify(trocouComFalha.corpo?.erro ?? "")}`,
        );
        afirmar(
          "e o resíduo da TROCA também é nomeado, com o caminho da capa ANTERIOR",
          trocouComFalha.corpo?.dados?.residuo?.arquivo === CAMINHO_ANTIGO &&
            trocouComFalha.log.some((l) => l.includes(CAMINHO_ANTIGO)),
          `resíduo: ${JSON.stringify(trocouComFalha.corpo?.dados?.residuo)}`,
        );

        /* — (5) E AS TAGS NÃO PODEM ROUBAR A REMOÇÃO — */
        //
        // `gravarTags` retornava ANTES de `removerCapaAnterior`, então uma
        // falha ao gravar tags depois de a linha já ter o endereço novo
        // deixava a capa anterior órfã PARA SEMPRE: nenhum salvamento futuro
        // teria como saber qual arquivo sobrou.
        recebidos.length = 0;
        respostaDoStorage = [200, { message: "removido" }];
        falharAoDefinirTags = true;
        linhaDoPost.imagem_url = ENDERECO_ANTIGO;
        const comTagsQuebradas = await dirigir({
          corpo: {
            operacao: OPERACAO_SALVAR,
            id: ID,
            slug: "um-post-de-teste",
            titulo: "Um post de teste",
            resumo: "Resumo",
            conteudo: DOCUMENTO_COMPLETO,
            imagem_url: ENDERECO_DA_CAPA,
            imagem_alt: "A capa nova",
            tags: ["uma"],
          },
          cabecalhos: COMO_SESSAO,
          ambiente: AMBIENTE_LOCAL,
        });
        falharAoDefinirTags = false;
        afirmar(
          "falha ao gravar as TAGS não impede a remoção da capa anterior — senão o arquivo ficaria órfão para sempre",
          comTagsQuebradas.corpo?.ok === false &&
            recebidos.some(
              (r) =>
                r.url.startsWith("/storage/v1/object/") &&
                r.url.includes(CAMINHO_ANTIGO),
            ),
          `chamadas ao Storage: ${recebidos.filter((r) => r.url.startsWith("/storage/v1/object/")).length}`,
        );

        /* — (23) OS DOIS RAMOS DECLARADOS E NUNCA EXERCIDOS — */
        //
        // "404 é sucesso" e "caminho inválido é recusado no transporte" eram
        // prosa: nenhum teste os alcançava. Ramo declarado e nunca exercido é
        // ramo que ninguém sabe se funciona.
        for (const [rotulo, resposta] of [
          ["404 puro", [404, { message: "Object not found" }]],
          ["400 com not_found no corpo", [400, { statusCode: "404", error: "not_found", message: "Object not found" }]],
        ]) {
          recebidos.length = 0;
          respostaDoStorage = resposta;
          linhaDoPost.imagem_url = ENDERECO_DA_CAPA;
          const jaAusente = await dirigir({
            corpo: { operacao: OPERACAO_EXCLUIR, id: ID },
            cabecalhos: COMO_SESSAO,
            ambiente: AMBIENTE_LOCAL,
          });
          afirmar(
            `arquivo que já não estava lá (${rotulo}) NÃO vira resíduo — ausência é o estado desejado`,
            jaAusente.corpo?.ok === true &&
              jaAusente.corpo?.dados?.residuo === undefined,
            `resíduo: ${JSON.stringify(jaAusente.corpo?.dados?.residuo)}`,
          );
        }

        /* E `not_found` DENTRO de uma mensagem qualquer não é veredito: a
           comparação é por igualdade com o vocabulário, senão qualquer recusa
           que mencionasse a palavra faria o resíduo desaparecer em silêncio. */
        recebidos.length = 0;
        respostaDoStorage = [400, { message: "bucket not_found is not the reason" }];
        linhaDoPost.imagem_url = ENDERECO_DA_CAPA;
        const mencaoSolta = await dirigir({
          corpo: { operacao: OPERACAO_EXCLUIR, id: ID },
          cabecalhos: COMO_SESSAO,
          ambiente: AMBIENTE_LOCAL,
        });
        afirmar(
          "e `not_found` dentro de uma mensagem qualquer NÃO conta como ausência — a comparação é por igualdade, não por contenção",
          mencaoSolta.corpo?.dados?.residuo?.arquivo === CAMINHO_DA_CAPA,
          `resíduo: ${JSON.stringify(mencaoSolta.corpo?.dados?.residuo)}`,
        );

        respostaDoStorage = [200, { message: "removido" }];
        linhaDoPost.imagem_url = null;
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

/* ─── (c8) O envio do arquivo (Story 3.1) ────────────────────────────────── */

secao("(c8) o envio da capa: recusa antes da rede, e endereço na volta");

{
  const envio = await import(
    new URL("../src/data/blog/arquivos.js", import.meta.url).href
  );

  /* ── O dublê do cliente ────────────────────────────────────────────────
     Ele REGISTRA cada coisa que aconteceria de verdade: obter cliente e
     mandar o arquivo. É o registro que transforma "recusa antes da rede" em
     propriedade observável — sem ele, uma recusa que acontecesse DEPOIS do
     envio devolveria o mesmo erro e a asserção passaria. */
  const criarDuble = () => {
    const registro = { clientes: 0, envios: [], caminho: null };
    const cliente = {
      storage: {
        from: (balde) => ({
          upload: async (caminho, arquivo, opcoes) => {
            registro.envios.push({ balde, caminho, tamanho: arquivo.size, opcoes });
            registro.caminho = caminho;
            return { data: { path: caminho }, error: null };
          },
          getPublicUrl: (caminho) => ({
            data: {
              publicUrl: `https://x.supabase.co/storage/v1/object/public/${balde}/${caminho}`,
            },
          }),
        }),
      },
    };
    return {
      registro,
      obterCliente: async () => {
        registro.clientes += 1;
        return { ok: true, dados: cliente };
      },
    };
  };

  /** Um arquivo de mentira que se comporta como `File` no que importa. */
  const arquivo = (tamanho, tipo, bytes) => ({
    size: tamanho,
    type: tipo,
    slice: () => ({
      arrayBuffer: async () => Uint8Array.from(bytes ?? []).buffer,
    }),
  });

  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const JPEG = [0xff, 0xd8, 0xff, 0xe0];
  const WEBP = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50];
  const PDF = [0x25, 0x50, 0x44, 0x46];

  /* ── ACIMA DO LIMITE: recusado, DIZENDO O LIMITE ────────────────────── */
  {
    const { registro, obterCliente } = criarDuble();
    const r = await envio.enviarImagemDeCapa(
      arquivo(TAMANHO_MAXIMO_DA_IMAGEM + 1, "image/png", PNG),
      { obterCliente },
    );
    afirmar(
      "arquivo acima do limite é recusado ANTES de qualquer rede — nem o cliente é obtido",
      r.ok === false && registro.clientes === 0 && registro.envios.length === 0,
      `clientes: ${registro.clientes} | envios: ${registro.envios.length}`,
    );
    /* A FRASE DIZ O LIMITE. Não "arquivo grande demais": o critério de
       aceite pede o número, e a asserção o procura na frase em vez de
       conferir que a frase existe. */
    afirmar(
      "e a recusa DIZ O LIMITE, no formato que a pessoa compara com o próprio arquivo",
      String(r.erro?.mensagem ?? "").includes(formatarTamanho(TAMANHO_MAXIMO_DA_IMAGEM)),
      r.erro?.mensagem ?? "(sem mensagem)",
    );
    afirmar(
      "e ela é `dados_invalidos`, e não `inesperado` — o arquivo não serve, e isso é diferente de defeito",
      r.erro?.tipo === "dados_invalidos",
      String(r.erro?.tipo),
    );
  }

  /* ── ESPÉCIE FORA DO VOCABULÁRIO: recusada dizendo O QUE SE ACEITA ──── */
  {
    const { registro, obterCliente } = criarDuble();
    const r = await envio.enviarImagemDeCapa(arquivo(1000, "application/pdf", PDF), {
      obterCliente,
    });
    afirmar(
      "espécie fora do vocabulário é recusada antes da rede",
      r.ok === false && registro.clientes === 0 && registro.envios.length === 0,
      `clientes: ${registro.clientes} | envios: ${registro.envios.length}`,
    );
    afirmar(
      "e a recusa nomeia TODAS as espécies aceitas — não a que veio",
      ESPECIES_DE_IMAGEM.every((e) =>
        String(r.erro?.mensagem ?? "").includes(e.rotulo),
      ),
      r.erro?.mensagem ?? "(sem mensagem)",
    );
  }

  /* ── ARQUIVO QUE MENTE A ESPÉCIE: quem decide é o CONTEÚDO ──────────── */
  {
    const { registro, obterCliente } = criarDuble();
    /* Um PDF renomeado para `.png`. O sistema operacional entrega
       `type: "image/png"` a partir da extensão, e é exatamente por isso que o
       tipo declarado não pode ser a palavra final. */
    const r = await envio.enviarImagemDeCapa(arquivo(1000, "image/png", PDF), {
      obterCliente,
    });
    afirmar(
      "arquivo que mente a espécie é recusado — quem decide é a assinatura, não o nome nem o tipo declarado",
      r.ok === false && registro.envios.length === 0,
      `envios: ${registro.envios.length} | ${r.erro?.mensagem ?? ""}`,
    );
    /* CONTROLE NEGATIVO DO DETECTOR: sem a assinatura, o mesmo arquivo
       PASSA. É o que prova que a recusa acima veio da conferência de
       conteúdo, e não de qualquer outra coisa no caminho. */
    afirmar(
      "e sem a assinatura o mesmo arquivo passaria — a recusa vem da conferência de conteúdo, e de nada mais",
      problemaNoArquivo({ tamanho: 1000, tipo: "image/png" }) === null &&
      problemaNoArquivo({ tamanho: 1000, tipo: "image/png", assinatura: PDF }) !== null,
      String(problemaNoArquivo({ tamanho: 1000, tipo: "image/png" })),
    );
  }

  /* ── ARQUIVO VAZIO ─────────────────────────────────────────────────── */
  {
    const { registro, obterCliente } = criarDuble();
    const r = await envio.enviarImagemDeCapa(arquivo(0, "image/png", []), { obterCliente });
    afirmar(
      "arquivo vazio é recusado antes da rede — 0 B não é imagem",
      r.ok === false && registro.envios.length === 0,
      `envios: ${registro.envios.length}`,
    );
  }

  /* ── AS TRÊS ESPÉCIES ACEITAS SOBEM, E O QUE VOLTA É ENDEREÇO ────────── */
  for (const [rotulo, tipo, bytes] of [
    ["PNG", "image/png", PNG],
    ["JPEG", "image/jpeg", JPEG],
    ["WebP", "image/webp", WEBP],
  ]) {
    const { registro, obterCliente } = criarDuble();
    const r = await envio.enviarImagemDeCapa(arquivo(1000, tipo, bytes), {
      obterCliente,
      novoIdentificador: () => "0a1b2c3d-4e5f-6789-abcd-ef0123456789",
    });
    afirmar(
      `${rotulo} dentro do limite é enviado, e o que volta é o ENDEREÇO público absoluto`,
      r.ok === true &&
        registro.envios.length === 1 &&
        registro.envios[0].balde === BUCKET_DAS_IMAGENS &&
        ehCaminhoDeCapa(r.dados.caminho) &&
        r.dados.url ===
          enderecoPublicoDaCapa("https://x.supabase.co", r.dados.caminho),
      `${JSON.stringify(r.erro ?? r.dados)} | envios: ${registro.envios.length}`,
    );
    afirmar(
      `e o envio do ${rotulo} não sobrescreve nada: \`upsert\` é falso e o nome é próprio`,
      registro.envios[0]?.opcoes?.upsert === false &&
        registro.envios[0]?.opcoes?.contentType === tipo,
      JSON.stringify(registro.envios[0]?.opcoes),
    );
  }

  /* ── O QUE VOLTA É ACEITÁVEL PELA COLUNA — as duas pontas se encontram ─
     Sem esta asserção, o envio poderia devolver um endereço que o servidor
     recusaria em seguida: a miniatura apareceria e o salvamento falharia por
     um motivo que o Autor não causou. */
  {
    const { obterCliente } = criarDuble();
    const r = await envio.enviarImagemDeCapa(arquivo(1000, "image/png", PNG), {
      obterCliente,
      novoIdentificador: () => "0a1b2c3d-4e5f-6789-abcd-ef0123456789",
    });
    afirmar(
      "o endereço que o envio devolve é aceitável pela regra da COLUNA — as duas pontas se encontram",
      r.ok === true &&
        enderecoDeImagemPermitido(r.dados.url) === true &&
        caminhoDaCapaNoEndereco("https://x.supabase.co", r.dados.url) === r.dados.caminho,
      JSON.stringify(r.dados ?? r.erro),
    );
  }

  /* ── O NOME DE ARQUIVO DE RESERVA PRECISA CABER NO FORMATO ──────────────
     Quando o runtime não tem `crypto.randomUUID` — jsdom antigo, navegador
     fora de contexto seguro — o envio monta o nome sozinho. A versão anterior
     usava `Math.random().toString(36).slice(2, 10)`, que devolve MENOS de oito
     caracteres com frequência nada desprezível (`(0.5).toString(36)` é `"0.i"`)
     e `""` quando o sorteio dá zero: o nome saía curto, `caminhoDaCapa` o
     reprovava, e o envio morria em `inesperado` — o problema grande que o
     comentário de lá dizia estar evitando.

     Duzentas amostras: com o defeito antigo, a chance de nenhuma sair curta é
     desprezível. E o gerador roda SEM o `randomUUID` disponível, senão o ramo
     de reserva nunca é o exercitado. */
  {
    const cryptoOriginal = globalThis.crypto;
    const semRandomUUID = {};
    for (const chave of Object.getOwnPropertyNames(Object.getPrototypeOf(cryptoOriginal ?? {}))) {
      if (chave !== "randomUUID" && chave !== "constructor") {
        try {
          semRandomUUID[chave] = cryptoOriginal[chave]?.bind?.(cryptoOriginal);
        } catch {
          /* propriedade que não dá para copiar não faz falta aqui */
        }
      }
    }
    Object.defineProperty(globalThis, "crypto", {
      value: semRandomUUID,
      configurable: true,
      writable: true,
    });

    const caminhos = [];
    try {
      for (let i = 0; i < 200; i += 1) {
        const { registro, obterCliente } = criarDuble();
        const r = await envio.enviarImagemDeCapa(arquivo(1000, "image/png", PNG), {
          obterCliente,
        });
        caminhos.push(r.ok ? r.dados.caminho : `RECUSADO: ${r.erro.tipo}`);
        if (!r.ok) break;
        void registro;
      }
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        value: cryptoOriginal,
        configurable: true,
        writable: true,
      });
    }

    const tortos = caminhos.filter((c) => !ehCaminhoDeCapa(c));
    afirmar(
      "sem `crypto.randomUUID`, o nome de reserva SEMPRE cabe no formato — 200 amostras, nenhuma curta",
      caminhos.length === 200 && tortos.length === 0,
      `amostras: ${caminhos.length} | tortas: ${tortos.slice(0, 3).join(" | ")}`,
    );
    afirmar(
      "e ele não se repete — nome que colide sobrescreveria a capa de outro Post, e o envio não faz `upsert`",
      new Set(caminhos).size === caminhos.length,
      `distintos: ${new Set(caminhos).size} de ${caminhos.length}`,
    );
  }
  /* ── OS RAMOS DE ERRO DO ENVIO, QUE ERAM CÓDIGO MORTO ─────────────────
     O dublê sempre devolvia envio bem-sucedido, então `resposta?.error`
     inteiro — sessão vencida, rede fora, exceção — nunca rodava. Ramo que a
     verificação não alcança é ramo que ninguém sabe se funciona, e estes
     decidem justamente o que a pessoa lê quando o envio falha. */
  {
    /** Um cliente que responde o erro que o teste pedir. */
    const comErro = (erro) => ({
      ok: true,
      dados: {
        storage: {
          from: () => ({
            upload: async () => ({ data: null, error: erro }),
            getPublicUrl: () => ({ data: { publicUrl: "" } }),
          }),
        },
      },
    });
    const arquivoBom = {
      size: 1000,
      type: "image/png",
      slice: () => ({
        arrayBuffer: async () => Uint8Array.from(PNG).buffer,
      }),
    };

    /* SESSÃO VENCIDA. A política do bucket recusa quem não é `authenticated`, e
       o Storage responde violação de RLS. A frase genérica da leitura ("Esta
       leitura exige uma sessão válida") fala de uma consulta que ninguém fez. */
    {
      const r = await envio.enviarImagemDeCapa(arquivoBom, {
        obterCliente: async () =>
          comErro({
            message: "new row violates row-level security policy",
            status: 403,
          }),
      });
      afirmar(
        "sessão vencida no envio vira `permissao`, e a frase manda ENTRAR DE NOVO — não falar de uma leitura que ninguém fez",
        r.ok === false &&
          r.erro.tipo === "permissao" &&
          /entre no painel/i.test(r.erro.mensagem) &&
          /envi/i.test(r.erro.mensagem),
        `${r.erro?.tipo}: ${r.erro?.mensagem}`,
      );
    }

    /* REDE FORA. Nada foi decidido pelo servidor, e a classificação precisa
       dizer isso — mandar "entre de novo" a quem não tem o que consertar é
       conselho errado. */
    {
      const r = await envio.enviarImagemDeCapa(arquivoBom, {
        obterCliente: async () =>
          comErro({ message: "Failed to fetch", name: "TypeError" }),
      });
      afirmar(
        "falha de rede no envio vira `rede`, e não `permissao` — a distinção é o que separa “tente de novo” de “entre de novo”",
        r.ok === false && r.erro.tipo === "rede",
        `${r.erro?.tipo}: ${r.erro?.mensagem}`,
      );
    }

    /* EXCEÇÃO QUE SOBE DO CLIENTE. Ela não pode escapar: uma exceção daqui
       derrubaria o Editor inteiro para o limite de erro. */
    {
      const r = await envio.enviarImagemDeCapa(arquivoBom, {
        obterCliente: async () => ({
          ok: true,
          dados: {
            storage: {
              from: () => ({
                upload: async () => {
                  throw new Error("o cliente explodiu");
                },
                getPublicUrl: () => ({ data: { publicUrl: "" } }),
              }),
            },
          },
        }),
      });
      afirmar(
        "exceção que sobe do cliente vira erro TIPADO — ela nunca escapa, senão derrubaria o Editor inteiro",
        r.ok === false && typeof r.erro.tipo === "string" && r.erro.tipo !== "",
        JSON.stringify(r.erro),
      );
    }

    /* O ENDEREÇO QUE VOLTA TORTO. O arquivo subiu, e o que não dá para fazer é
       devolver à tela um endereço que o servidor vai recusar no salvamento: a
       pessoa veria a miniatura aparecer e a gravação falhar por um motivo que
       ela não causou. */
    {
      const r = await envio.enviarImagemDeCapa(arquivoBom, {
        obterCliente: async () => ({
          ok: true,
          dados: {
            storage: {
              from: () => ({
                upload: async (caminho) => ({ data: { path: caminho }, error: null }),
                getPublicUrl: () => ({
                  data: { publicUrl: "https://outro.dominio.com/qualquer/coisa.png" },
                }),
              }),
            },
          },
        }),
        novoIdentificador: () => "0a1b2c3d-4e5f-6789-abcd-ef0123456789",
      });
      afirmar(
        "endereço público fora do formato esperado é RECUSADO na volta — a tela nunca recebe um endereço que o servidor rejeitaria",
        r.ok === false && r.erro.tipo === "configuracao",
        JSON.stringify(r.erro),
      );
    }

    /* E A REMOÇÃO DO CLIENTE só alcança o bucket das imagens. A chave aqui é a
       sessão do Autor, e apagar às cegas com ela é tão ruim quanto com a de
       serviço. */
    {
      const pedidos = [];
      const clienteQueRemove = {
        ok: true,
        dados: {
          storage: {
            from: () => ({
              remove: async (caminhos) => {
                pedidos.push(caminhos);
                return { data: caminhos, error: null };
              },
            }),
          },
        },
      };
      const deFora = await envio.removerImagemDeCapa(
        "https://outro.dominio.com/capas/abcdefgh.png",
        { obterCliente: async () => clienteQueRemove },
      );
      afirmar(
        "a remoção pela sessão NÃO alcança endereço de fora do bucket — nada é pedido ao Storage",
        deFora.ok === false &&
          deFora.erro.tipo === "nao_encontrado" &&
          pedidos.length === 0,
        `${deFora.erro?.tipo} | pedidos: ${pedidos.length}`,
      );

      const nosso = await envio.removerImagemDeCapa(
        enderecoPublicoDaCapa(
          "https://x.supabase.co",
          "capas/0a1b2c3d-4e5f-6789-abcd-ef0123456789.png",
        ),
        { obterCliente: async () => clienteQueRemove },
      );
      afirmar(
        "e alcança o do bucket, pedindo o CAMINHO — é este consumidor que dá uso à política de remoção autenticada",
        nosso.ok === true &&
          pedidos.length === 1 &&
          pedidos[0][0] === "capas/0a1b2c3d-4e5f-6789-abcd-ef0123456789.png",
        JSON.stringify(pedidos),
      );
    }
  }
  /* ── AS DUAS COSTURAS DEFENSIVAS, EXERCITADAS ───────────────────────────
     Elas falham em direções OPOSTAS, e as duas produzem SILÊNCIO se ninguém
     as escrever.

     Sem `removerArquivoDaCapa`, `removerCapaAnterior` devolvia `null` —
     indistinguível de "removeu" e de "não era nosso" — e o arquivo vazava sem
     que ninguém o nomeasse.

     Sem `baseDoProjeto` o buraco é o mesmo por outro caminho: sem a raiz,
     `caminhoDaCapaNoEndereco` devolve `null` para TODO endereço, e "não sei se
     era nosso" viraria "não era nosso" — o arquivo do bucket some do alcance de
     qualquer remoção futura sem nada acusar.

     ─── E POR QUE A PRIMEIRA ASSERÇÃO MUDOU DE SENTIDO NA STORY 3.2 ───────
     Ela dizia "acesso sem `baseDoProjeto` responde defeito nomeado, e não «a
     capa precisa ser enviada pelo Painel»". A segunda metade descreve uma
     recusa de ORIGEM que deixou de existir: endereço de fora passou a ser
     aceito, e a frase que ela proibia não está mais em lugar nenhum. A primeira
     metade — defeito de montagem é `inesperado` NOMEADO, e nunca culpa do
     Autor — continua inteira, e é o que se afirma abaixo. **A guarda não
     afrouxou: ela dobrou.** Existe antes da escrita, para o banco não ser
     tocado por um acesso que não sabe cuidar do arquivo, e existe dentro de
     `removerCapaAnterior`, que roda depois e alcança o caso que o pedido não
     menciona — a capa anterior de um salvamento que não fala de capa nenhuma. */
  {
    const CAPA =
      "https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/abcdefgh.png";
    const ANTIGA =
      "https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/hgfedcba.png";

    /* SEM `baseDoProjeto`: defeito de montagem, NOMEADO, e antes da escrita. */
    {
      const acessoTorto = {
        ...acessoDeTeste(),
      };
      delete acessoTorto.baseDoProjeto;
      const r = await salvarPost({
        token: "bom",
        corpo: corpoValido({ imagem_url: CAPA, imagem_alt: "Uma descrição" }),
        acesso: acessoTorto,
      });
      /* O DETALHE PRECISA NOMEAR A CAUSA, e não só o tipo. Sem a guarda, a
         chamada a `acesso.baseDoProjeto()` LANÇA e o `catch` do topo devolve
         `inesperado` do mesmo jeito: julgar só o tipo faria "defeito
         reportado" e "exceção que ninguém previu" serem a mesma coisa, e a
         sabotagem que remove a guarda passava verde. */
      afirmar(
        "acesso sem `baseDoProjeto` responde DEFEITO NOMEADO, e nunca culpa do Autor — a recusa de ORIGEM saiu na Story 3.2, esta guarda não",
        r.ok === false &&
          r.erro.tipo === ERRO_INESPERADO &&
          /url do projeto/i.test(r.erro.detalhe ?? "") &&
          !/exceção não prevista/i.test(r.erro.detalhe ?? ""),
        `${r.erro?.tipo}: ${r.erro?.detalhe}`,
      );
      /* E ELA ACONTECE ANTES DE O BANCO SER TOCADO. Só dentro de
         `removerCapaAnterior` — que roda DEPOIS da escrita — o defeito seria
         descoberto com a linha já gravada, e viraria resíduo sobre um Post que
         mudou em vez de recusa antes de mexer em nada. */
      afirmar(
        "e ela acontece ANTES da escrita — falhar tarde custaria uma gravação que ninguém pediu",
        /* O acesso de teste registra toda chamada por nome, e é por aí que
           "nada foi gravado" se mede em vez de se supor. Sem esta cláusula, a
           guarda dentro de `removerCapaAnterior` sozinha passaria a asserção
           acima — e ela roda DEPOIS do `UPDATE`. */
        acessoTorto.chamadas.every(
          (c) => !/^(inserirPost|atualizarPost|excluirPost|definirTags|inserirTags)$/.test(c.nome),
        ),
        acessoTorto.chamadas.map((c) => c.nome).join(", ") || "nenhuma chamada",
      );

      /* E A SEGUNDA GUARDA, dentro de `removerCapaAnterior`: ela alcança o que
         a primeira não vê — a capa ANTERIOR de um pedido que não fala de capa. */
      const semRaiz = await removerCapaAnterior({
        acesso: { removerArquivoDaCapa: async () => ({ ok: true }) },
        anterior: ANTIGA,
        atual: CAPA,
      });
      afirmar(
        "e sem `baseDoProjeto` a remoção vira RESÍDUO nomeado: “não sei se era nosso” não pode virar “não era nosso”, que tiraria o arquivo do alcance de todo mundo",
        semRaiz !== null &&
          semRaiz.arquivo === "capas/hgfedcba.png" &&
          /montagem|url do projeto/i.test(semRaiz.motivo),
        JSON.stringify(semRaiz),
      );
      /* ─── OS OUTROS TRÊS JEITOS DE `baseDoProjeto` NÃO RESPONDER ────────
         Não existir era o único tratado. Lançar, devolver `""` e devolver algo
         que não é texto davam o MESMO resultado prático — base inútil — por
         caminhos diferentes: a exceção derrubava a gravação inteira pelo
         `catch` do topo, DEPOIS de a linha já ter mudado, e as outras duas
         voltavam ao silêncio que a guarda existe para não ter. */
      const TORTAS = [
        ["que lança", () => { throw new Error("montagem quebrada"); }],
        ["que devolve vazio", () => ""],
        ["que devolve só espaços", () => "   "],
        ["que devolve não-texto", () => 42],
        ["que devolve nulo", () => null],
      ];
      const semResiduo = [];
      for (const [rotulo, baseDoProjeto] of TORTAS) {
        let saida;
        try {
          saida = await removerCapaAnterior({
            acesso: { baseDoProjeto, removerArquivoDaCapa: async () => ({ ok: true }) },
            anterior: ANTIGA,
            atual: CAPA,
          });
        } catch (excecao) {
          semResiduo.push(`${rotulo}: LANÇOU ${String(excecao?.message ?? excecao)}`);
          continue;
        }
        if (saida === null || saida.arquivo !== "capas/hgfedcba.png") {
          semResiduo.push(`${rotulo}: ${JSON.stringify(saida)}`);
        }
      }
      afirmar(
        `os ${TORTAS.length} jeitos de \`baseDoProjeto\` não responder viram o MESMO resíduo nomeado — e nenhum deles escapa como exceção`,
        semResiduo.length === 0,
        semResiduo.join(" | "),
      );

      /* ─── E RESÍDUO NÃO SE INVENTA ────────────────────────────────────
         Resíduo é uma acusação: ele diz ao Autor que um arquivo ficou para trás
         e pede que alguém o apague. Emiti-lo para um endereço que nunca esteve
         em bucket nenhum mandaria procurar um arquivo que não existe — e isso
         aconteceria na primeira vez que alguém trocasse uma capa de fora por
         outra, que é o caminho comum desta story. A pergunta que dá para
         responder sem a raiz é a de FORMA, e ela basta para separar os dois. */
      const DE_FORA_SEM_RAIZ = [
        "https://cdn.exemplo.com/foto.jpg",
        "https://cdn.exemplo.com/imagens/capas/foto.png",
        "https://outro.example/storage/v1/object/public/outro-balde/capas/abcdefgh.png",
      ];
      const inventados = [];
      for (const anterior of DE_FORA_SEM_RAIZ) {
        const saida = await removerCapaAnterior({
          acesso: { removerArquivoDaCapa: async () => ({ ok: true }) },
          anterior,
          atual: CAPA,
        });
        if (saida !== null) inventados.push(`${anterior}: ${JSON.stringify(saida)}`);
      }
      afirmar(
        "e endereço que não tem NEM A FORMA de capa pública não vira resíduo, mesmo sem a raiz — acusar aqui mandaria procurar um arquivo que nunca existiu",
        inventados.length === 0,
        inventados.join(" | "),
      );
    }

    /* SEM `removerArquivoDaCapa`: resíduo NOMEADO, e nunca silêncio. */
    {
      const semTransporte = {
        baseDoProjeto: () => "https://x.supabase.co",
      };
      const residuo = await removerCapaAnterior({
        acesso: semTransporte,
        anterior: ANTIGA,
        atual: CAPA,
      });
      afirmar(
        "acesso sem `removerArquivoDaCapa` produz RESÍDUO nomeado — devolver `null` faria o arquivo vazar em silêncio",
        residuo !== null &&
          residuo.arquivo === "capas/hgfedcba.png" &&
          /montagem/i.test(residuo.motivo),
        JSON.stringify(residuo),
      );
      /* E as duas saídas legítimas de `null` continuam sendo `null`: não havia
         anterior, e o anterior não é nosso. Sem isto, "sempre resíduo" passaria
         a asserção acima e todo salvamento anunciaria lixo que não existe. */
      const semAnterior = await removerCapaAnterior({
        acesso: semTransporte,
        anterior: null,
        atual: CAPA,
      });
      const deFora = await removerCapaAnterior({
        acesso: semTransporte,
        anterior: "https://cdn.exemplo.com/foto.png",
        atual: CAPA,
      });
      const mesmoEndereco = await removerCapaAnterior({
        acesso: semTransporte,
        anterior: CAPA,
        atual: CAPA,
      });
      afirmar(
        "e as três saídas legítimas continuam sem resíduo: não havia anterior, o anterior não é nosso, e o endereço não mudou",
        semAnterior === null && deFora === null && mesmoEndereco === null,
        JSON.stringify({ semAnterior, deFora, mesmoEndereco }),
      );
    }

    /* ── AS DUAS COLUNAS DE IMAGEM, E NÃO SÓ A CAPA (Story 3.4) ──────────
       A story abriu a escrita de `seo_imagem_url`, e a Imagem de
       Compartilhamento pode ser um arquivo do NOSSO bucket, enviado pelo mesmo
       controle da capa. Cuidar só da primeira coluna deixaria a segunda órfã
       em toda troca e em toda exclusão — um vazamento com data marcada, e sem
       nem virar resíduo, porque não haveria quem o nomeasse.

       O que se afirma é O QUE FOI PEDIDO ao transporte, e não uma contagem de
       chamadas: um laço que percorresse a mesma coluna duas vezes daria a
       mesma contagem e removeria o arquivo errado. */
    {
      const SEO_ANTIGA =
        "https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/seoantiga.png";
      const SEO_NOVA =
        "https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/seonova1.png";

      const pedidos = [];
      const acessoQueRemove = {
        baseDoProjeto: () => "https://x.supabase.co",
        removerArquivoDaCapa: async (caminho) => {
          pedidos.push(caminho);
          return { ok: true };
        },
      };

      afirmar(
        "as colunas de imagem declaradas são as DUAS que guardam endereço de arquivo",
        Array.isArray(COLUNAS_DE_IMAGEM) &&
          COLUNAS_DE_IMAGEM.length === 2 &&
          COLUNAS_DE_IMAGEM[0] === "imagem_url" &&
          COLUNAS_DE_IMAGEM[1] === "seo_imagem_url",
        JSON.stringify(COLUNAS_DE_IMAGEM),
      );

      const semResiduo = await removerImagensAnteriores({
        acesso: acessoQueRemove,
        anterior: { imagem_url: ANTIGA, seo_imagem_url: SEO_ANTIGA },
        atual: { imagem_url: CAPA, seo_imagem_url: SEO_NOVA },
      });
      afirmar(
        "trocar as DUAS imagens remove os DOIS arquivos anteriores — e são exatamente esses dois caminhos",
        semResiduo === null &&
          pedidos.length === 2 &&
          pedidos[0] === "capas/hgfedcba.png" &&
          pedidos[1] === "capas/seoantiga.png",
        JSON.stringify(pedidos),
      );

      /* SÓ A IMAGEM DE COMPARTILHAMENTO TROCA: a capa não é tocada. Sem esta,
         um laço que ignorasse `atual` apagaria a capa que ficou no ar. */
      pedidos.length = 0;
      await removerImagensAnteriores({
        acesso: acessoQueRemove,
        anterior: { imagem_url: CAPA, seo_imagem_url: SEO_ANTIGA },
        atual: { imagem_url: CAPA, seo_imagem_url: SEO_NOVA },
      });
      afirmar(
        "e trocar só a Imagem de Compartilhamento não pede a remoção da capa que ficou no ar",
        pedidos.length === 1 && pedidos[0] === "capas/seoantiga.png",
        JSON.stringify(pedidos),
      );

      /* A EXCLUSÃO leva as duas, e `atual: null` é a forma que ela usa. */
      pedidos.length = 0;
      await removerImagensAnteriores({
        acesso: acessoQueRemove,
        anterior: { imagem_url: ANTIGA, seo_imagem_url: SEO_ANTIGA },
        atual: null,
      });
      afirmar(
        "excluir o Post leva os arquivos das DUAS colunas",
        pedidos.length === 2 &&
          pedidos[0] === "capas/hgfedcba.png" &&
          pedidos[1] === "capas/seoantiga.png",
        JSON.stringify(pedidos),
      );

      /* E OS DOIS RESÍDUOS VIAJAM JUNTOS, nomeando os dois arquivos. Devolver
         só o primeiro esconderia o segundo — o silêncio que esta família de
         funções existe para não ter. */
      const dobrado = await removerImagensAnteriores({
        acesso: { baseDoProjeto: () => "https://x.supabase.co" },
        anterior: { imagem_url: ANTIGA, seo_imagem_url: SEO_ANTIGA },
        atual: null,
      });
      afirmar(
        "e quando os DOIS sobram, o resíduo nomeia os dois arquivos — nenhum fica escondido atrás do outro",
        dobrado !== null &&
          dobrado.arquivo.includes("capas/hgfedcba.png") &&
          dobrado.arquivo.includes("capas/seoantiga.png"),
        JSON.stringify(dobrado),
      );

      /* ── O MESMO ARQUIVO NAS DUAS COLUNAS ─────────────────────────────
         Usar a capa também como Imagem de Compartilhamento é o caso mais
         provável de todos, e ele DESTRUÍA: trocar uma das duas fazia
         `removerCapaAnterior` ver "o endereço mudou" e apagar do bucket o
         arquivo que a outra coluna continua apontando. A linha ficava salva com
         uma prévia de endereço morto, e nada virava resíduo — do ponto de vista
         do servidor a remoção deu certo. */
      pedidos.length = 0;
      const compartilhado = await removerImagensAnteriores({
        acesso: acessoQueRemove,
        anterior: { imagem_url: ANTIGA, seo_imagem_url: ANTIGA },
        atual: { imagem_url: CAPA, seo_imagem_url: ANTIGA },
      });
      afirmar(
        "o arquivo que a OUTRA coluna ainda usa NÃO é removido — a capa e a imagem de compartilhamento podem ser a mesma",
        compartilhado === null && pedidos.length === 0,
        `pedidos: ${JSON.stringify(pedidos)} | resíduo: ${JSON.stringify(compartilhado)}`,
      );

      /* E QUANDO ELE DEIXA DE SER USADO PELAS DUAS, sai — uma vez só. Sem esta,
         uma guarda larga demais faria o arquivo compartilhado nunca sair, e o
         vazamento voltaria pelo outro lado. */
      pedidos.length = 0;
      await removerImagensAnteriores({
        acesso: acessoQueRemove,
        anterior: { imagem_url: ANTIGA, seo_imagem_url: ANTIGA },
        atual: { imagem_url: CAPA, seo_imagem_url: SEO_NOVA },
      });
      afirmar(
        "e quando NENHUMA das duas o usa mais, ele sai — uma vez só, e é o caminho dele",
        pedidos.length === 1 && pedidos[0] === "capas/hgfedcba.png",
        JSON.stringify(pedidos),
      );

      /* E A EXCLUSÃO leva o arquivo compartilhado: com `atual` nulo não há
         coluna nenhuma o usando. */
      pedidos.length = 0;
      await removerImagensAnteriores({
        acesso: acessoQueRemove,
        anterior: { imagem_url: ANTIGA, seo_imagem_url: ANTIGA },
        atual: null,
      });
      afirmar(
        "excluir o Post leva o arquivo compartilhado — e não pede a mesma remoção duas vezes",
        pedidos.length === 1 && pedidos[0] === "capas/hgfedcba.png",
        JSON.stringify(pedidos),
      );

      /* ── AS DUAS REMOÇÕES SAEM EM PARALELO ────────────────────────────
         O pedido tem prazo TOTAL, e o vizinho `lerPost` se justifica por
         escrito por ter economizado UMA chamada. Encadear duas viagens de rede
         que não dependem uma da outra gastaria o dobro do prazo por ganho
         nenhum.

         A medição não é de tempo — tempo é frágil e mede a máquina. O dublê
         SEGURA a primeira remoção até a segunda ter sido pedida: se as chamadas
         forem sequenciais, a primeira nunca é liberada e a promessa não resolve.
         O relógio existe só para a asserção falhar em vez de pendurar. */
      {
        const pedidasAqui = [];
        let liberar = null;
        const segurar = new Promise((resolve) => {
          liberar = resolve;
        });
        const acessoQueSegura = {
          baseDoProjeto: () => "https://x.supabase.co",
          removerArquivoDaCapa: async (caminho) => {
            pedidasAqui.push(caminho);
            /* A SEGUNDA libera a PRIMEIRA. Em série, a segunda só seria
               chamada depois de a primeira voltar — e ninguém libera. */
            if (pedidasAqui.length === 2) liberar();
            await segurar;
            return { ok: true };
          },
        };
        const emParalelo = await Promise.race([
          removerImagensAnteriores({
            acesso: acessoQueSegura,
            anterior: { imagem_url: ANTIGA, seo_imagem_url: SEO_ANTIGA },
            atual: null,
          }).then(() => "concluiu"),
          new Promise((resolve) => {
            setTimeout(() => resolve("pendurou"), 1500);
          }),
        ]);
        afirmar(
          "as duas remoções são pedidas EM PARALELO — em série a primeira nunca é liberada e a chamada pendura",
          emParalelo === "concluiu" && pedidasAqui.length === 2,
          `${emParalelo} | pedidas: ${JSON.stringify(pedidasAqui)}`,
        );
        liberar();
      }

      /* ── A FORMA DO RESÍDUO DOBRADO, DECLARADA ────────────────────────
         Quando os dois sobram, `arquivo` deixa de ser um caminho e passa a ser
         uma ENUMERAÇÃO de caminhos, e `motivo` junta os dois. Isso estava
         escrito no código e afirmado em lugar nenhum: quem consome o resíduo
         (`falaDoResiduo`, na tela) precisa que a forma seja um contrato, e não
         um detalhe de implementação que a próxima refatoração troca. */
      {
        const dobrado = await removerImagensAnteriores({
          acesso: { baseDoProjeto: () => "https://x.supabase.co" },
          anterior: { imagem_url: ANTIGA, seo_imagem_url: SEO_ANTIGA },
          atual: null,
        });
        afirmar(
          "o resíduo dobrado enumera os DOIS caminhos com o separador declarado, e junta os dois motivos",
          dobrado !== null &&
            dobrado.arquivo ===
              ["capas/hgfedcba.png", "capas/seoantiga.png"].join(
                SEPARADOR_DE_ARQUIVOS_NO_RESIDUO,
              ) &&
            dobrado.motivo.split(SEPARADOR_DE_MOTIVOS_NO_RESIDUO).length === 2 &&
            Object.isFrozen(dobrado),
          JSON.stringify(dobrado),
        );

      }

      /* ── A GUARDA DE MONTAGEM NOMEIA A COLUNA QUE VEIO ────────────────
         Um Post com só `seo_imagem_url` produzia um detalhe dizendo "o arquivo
         da capa": quem fosse investigar procuraria na capa um defeito que está
         na outra coluna. */
      {
        const acessoSemBase = { ...acessoDeTeste() };
        delete acessoSemBase.baseDoProjeto;
        for (const coluna of COLUNAS_DE_IMAGEM) {
          const r = await salvarPost({
            token: "jwt",
            corpo: corpoValido({
              slug: "um-post-de-teste",
              [coluna]:
                "https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/abcdefgh.png",
              ...(coluna === "imagem_url" ? { imagem_alt: "Uma descrição" } : {}),
            }),
            acesso: acessoSemBase,
          });
          afirmar(
            `acesso sem \`baseDoProjeto\` com \`${coluna}\` acusa ESSA coluna pelo nome — e não sempre a capa`,
            r.ok === false &&
              r.erro.detalhe.includes(ROTULOS_DE_COLUNA_DE_IMAGEM[coluna]) &&
              !r.erro.detalhe.includes(ROTULOS_DE_COLUNA_DE_IMAGEM[outraColuna(coluna)]),
            r.ok ? "PASSOU" : r.erro.detalhe,
          );
        }
      }
    }
  }
  /* ── A GUARDA DO TRANSPORTE, EXERCITADA ─────────────────────────────────
     `removerArquivoDaCapa` roda com a chave de SERVIÇO, que ignora política:
     um caminho torto — `..`, barra no começo, pasta que não é `capas/`, outra
     extensão — apagaria coisa que ninguém pediu. A guarda existia e nada a
     alcançava; ramo declarado e nunca exercido é ramo que ninguém sabe se
     funciona. */
  {
    const pedidos = [];
    const acessoDeMentira = criarAcesso({
      url: "https://x.supabase.co",
      chavePublicavel: "sb_publishable_x",
      chaveDeServico: "sb_secret_x",
      buscar: async (endereco, opcoes) => {
        pedidos.push({ endereco, metodo: opcoes?.method });
        return new Response("", { status: 200 });
      },
    });
    const TORTOS = [
      "capas/../../../etc/passwd",
      "/capas/abcdefgh.png",
      "outra-pasta/abcdefgh.png",
      "capas/abcdefgh.exe",
      "capas/x.png",
      "",
      null,
    ];
    const passaram = [];
    for (const caminho of TORTOS) {
      acessoDeMentira.reiniciarPrazo();
      const r = await acessoDeMentira.removerArquivoDaCapa(caminho);
      if (r.ok || r.codigo !== "CaminhoInvalido") passaram.push(String(caminho));
    }
    afirmar(
      "a guarda do transporte recusa TODO caminho que não é o de uma capa deste bucket — e nada vai para a rede",
      passaram.length === 0 && pedidos.length === 0,
      `passaram: ${passaram.join(" | ")} | chamadas: ${pedidos.length}`,
    );
    /* CONTROLE POSITIVO: o caminho legítimo ATRAVESSA. Sem ele, uma guarda que
       recusasse tudo passaria a asserção acima e a remoção nunca aconteceria —
       o arquivo antigo ficaria para sempre, em silêncio. */
    acessoDeMentira.reiniciarPrazo();
    const legitimo = await acessoDeMentira.removerArquivoDaCapa(
      "capas/0a1b2c3d-4e5f-6789-abcd-ef0123456789.png",
    );
    afirmar(
      "e o caminho legítimo ATRAVESSA, virando um DELETE no Storage — senão a remoção nunca aconteceria",
      legitimo.ok === true &&
        pedidos.length === 1 &&
        pedidos[0].metodo === "DELETE" &&
        pedidos[0].endereco.includes(
          "/storage/v1/object/imagens-do-blog/capas/0a1b2c3d-4e5f-6789-abcd-ef0123456789.png",
        ),
      JSON.stringify(pedidos),
    );
  }

  /* ── E NADA DE LER O ARQUIVO INTEIRO ────────────────────────────────── */
  {
    /* O envio pede uma FATIA, e a fatia tem o tamanho da maior assinatura.
       Ler o arquivo inteiro para decidir a espécie seria trazer um megabyte à
       memória para olhar doze bytes — e é o primeiro passo do caminho que
       terminava em base64 na coluna. */
    const pedidos = [];
    const { obterCliente } = criarDuble();
    const espiao = {
      size: 1000,
      type: "image/png",
      slice: (inicio, fim) => {
        pedidos.push([inicio, fim]);
        return { arrayBuffer: async () => Uint8Array.from(PNG).buffer };
      },
    };
    await envio.enviarImagemDeCapa(espiao, {
      obterCliente,
      novoIdentificador: () => "0a1b2c3d-4e5f-6789-abcd-ef0123456789",
    });
    afirmar(
      "o envio lê só o CABEÇALHO do arquivo para decidir a espécie — uma fatia, do tamanho da maior assinatura",
      pedidos.length === 1 &&
        pedidos[0][0] === 0 &&
        pedidos[0][1] > 0 &&
        pedidos[0][1] <= 64,
      JSON.stringify(pedidos),
    );
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
            !/"table"|"video"|"strike"|"level":\s*1/.test(String(gravada.conteudo)),
            String(gravada.conteudo).slice(0, 200),
          );
          afirmar(
            /* A imagem de `src` executável (Editor avançado) é o mesmo caso —
               nó DENTRO do schema, atributo obrigatório que não passa — então
               ela cai por inteiro, e `"image"` também não sobrevive. */
            "a imagem com endereço executável não sobreviveu (nó inteiro caiu)",
            !/"image"/.test(String(gravada.conteudo)),
            String(gravada.conteudo).slice(0, 200),
          );
          afirmar(
            "nenhum endereço executável ficou no documento gravado",
            !/"(href|src)"\s*:\s*"[^"]*(javascript|vbscript|data)\s*:/i.test(String(gravada.conteudo)),
            (/"(href|src)"\s*:\s*"[^"]*"/i.exec(String(gravada.conteudo)) ?? [])[0] ?? "",
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

      /* — A COLUNA DA CAPA: as duas implementações concordam (Story 3.1) — */
      //
      // Mesma disciplina do corpus acima, sobre a outra regra:
      // `enderecoDeImagemPermitido` (JS, em `domain/blog/arquivos.js`) e
      // `endereco_de_imagem_e_permitido` (SQL, na restrição da coluna). Uma
      // divergência aqui apareceria como capa que a tela aceita e o banco
      // recusa — com o Autor lendo "o banco recusou" sobre uma imagem que já
      // subiu para o bucket.

      {
        const casos = CORPUS_DE_ENDERECOS_DE_IMAGEM.map((e) => `(${literal(e)})`).join(",");
        const veredito = await executarSql(
          token,
          `select v.e as endereco, public.endereco_de_imagem_e_permitido(v.e) as ok
             from (values ${casos}) as v(e)`,
        );
        const doSql = new Map(
          (veredito.dados ?? []).map((l) => [String(l.endereco), l.ok === true]),
        );
        const divergentes = CORPUS_DE_ENDERECOS_DE_IMAGEM.filter(
          (e) => doSql.get(e) !== enderecoDeImagemPermitido(e),
        );
        afirmar(
          `as duas implementações de "endereço de imagem permitido" concordam nos ${CORPUS_DE_ENDERECOS_DE_IMAGEM.length} endereços do corpus`,
          veredito.ok &&
            doSql.size === CORPUS_DE_ENDERECOS_DE_IMAGEM.length &&
            divergentes.length === 0,
          veredito.ok
            ? divergentes
                .map(
                  (e) =>
                    `${JSON.stringify(e)}: js=${enderecoDeImagemPermitido(e)} sql=${doSql.get(e)}`,
                )
                .join(" | ")
            : (veredito.erro ?? ""),
        );

        /* O CORPUS PRECISA TER OS DOIS VEREDITOS. Só negativos e a
           concordância seria trivial — e a regra da coluna é estreita, então
           a maioria das linhas do corpus do `href` cai aqui: sem esta
           asserção, uma implementação que recusasse TUDO passaria. */
        const permitidos = CORPUS_DE_ENDERECOS_DE_IMAGEM.filter((e) =>
          enderecoDeImagemPermitido(e),
        );
        afirmar(
          "o corpus da capa tem os dois vereditos representados",
          permitidos.length >= 4 &&
            permitidos.length < CORPUS_DE_ENDERECOS_DE_IMAGEM.length - 10,
          `permitidos: ${permitidos.length} de ${CORPUS_DE_ENDERECOS_DE_IMAGEM.length}`,
        );

        /* NENHUM `data:` PASSA — em nenhuma codificação. É a linha da matriz
           que diz "não é representável", e ela é conferida sobre o corpus em
           vez de sobre um caso escolhido a dedo. */
        const conteudoDeArquivo = CORPUS_DE_ENDERECOS_DE_IMAGEM.filter((e) =>
          /^(data|blob|filesystem):/i.test(e),
        );
        afirmar(
          "conteúdo de arquivo NÃO É REPRESENTÁVEL na coluna, em codificação nenhuma",
          conteudoDeArquivo.length >= 10 &&
            conteudoDeArquivo.every(
              (e) => enderecoDeImagemPermitido(e) === false && doSql.get(e) === false,
            ),
          conteudoDeArquivo
            .filter((e) => enderecoDeImagemPermitido(e) || doSql.get(e))
            .join(" | "),
        );

        const nuloDaImagem = await executarSql(
          token,
          `select public.endereco_de_imagem_e_permitido(null) as ok`,
        );
        afirmar(
          "capa nula é ACEITA nas duas implementações — capa é opcional",
          nuloDaImagem.dados?.[0]?.ok === true &&
            enderecoDeImagemPermitido(null) === true,
          JSON.stringify(nuloDaImagem.dados?.[0] ?? nuloDaImagem.erro),
        );
      }

      /* — (27) VEREDITO ABSOLUTO NA FRONTEIRA DO HOST LOCAL — */
      //
      // A concordância JS↔SQL sozinha é satisfeita por qualquer deriva
      // SIMÉTRICA: afrouxar os dois lados juntos para um `startsWith` faria
      // `http://127.0.0.1.exemplo.com/…` — host de TERCEIRO — virar gravável,
      // e o corpus continuaria concordando. O que fecha isso é veredito
      // absoluto: estes endereços têm uma resposta certa, e ela está escrita.
      {
        const ABSOLUTOS = [
          ["https://cdn.exemplo.com/capa.png", true],
          ["http://127.0.0.1:54321/storage/v1/object/public/imagens-do-blog/capas/abcdefgh.png", true],
          ["http://localhost:3000/capa.png", true],
          /* A FRONTEIRA. O sufixo é a evasão clássica, e os dois são hosts de
             terceiro que o navegador resolve na internet. */
          ["http://127.0.0.1.exemplo.com/capa.png", false],
          ["http://localhost.exemplo.com/capa.png", false],
          ["http://cdn.exemplo.com/capa.png", false],
          ["data:image/png;base64,iVBORw0KGgo=", false],
          ["blob:https://x.supabase.co/9a1f", false],
          ["//cdn.exemplo.com/capa.png", false],
          ["https://usuario:senha@cdn.exemplo.com/capa.png", false],
        ];
        const errados = ABSOLUTOS.filter(
          ([e, esperado]) => enderecoDeImagemPermitido(e) !== esperado,
        );
        afirmar(
          "o veredito da fronteira do host local é ABSOLUTO, e não só concordante — sufixo de terceiro é recusado",
          errados.length === 0,
          errados
            .map(([e, esperado]) => `${JSON.stringify(e)}: esperava ${esperado}`)
            .join(" | "),
        );
        /* E o mesmo veredito, no BANCO. Sem isto, a deriva simétrica ainda
           poderia acontecer do lado do SQL e a concordância continuaria. */
        const casosAbsolutos = ABSOLUTOS.map(([e]) => `(${literal(e)})`).join(",");
        const doBanco = await executarSql(
          token,
          `select v.e as endereco, public.endereco_de_imagem_e_permitido(v.e) as ok
             from (values ${casosAbsolutos}) as v(e)`,
        );
        const vereditos = new Map(
          (doBanco.dados ?? []).map((l) => [String(l.endereco), l.ok === true]),
        );
        const errondoBanco = ABSOLUTOS.filter(
          ([e, esperado]) => vereditos.get(e) !== esperado,
        );
        afirmar(
          "e o BANCO dá o mesmo veredito absoluto — os dois lados presos, e não só amarrados um ao outro",
          doBanco.ok && errondoBanco.length === 0,
          doBanco.ok
            ? errondoBanco
                .map(([e, esperado]) => `${JSON.stringify(e)}: banco=${vereditos.get(e)} esperava ${esperado}`)
                .join(" | ")
            : (doBanco.erro ?? ""),
        );
      }

      /* — (25) OS NÚMEROS DO BANCO SÃO OS DO DOMÍNIO, MEDIDOS — */
      //
      // `TAMANHO_MAXIMO_DO_ENDERECO` e `TAMANHO_MAXIMO_DO_ALTERNATIVO`
      // apareciam como literais na função SQL e na restrição, e nada
      // comparava os dois lados — ao contrário de `file_size_limit` e
      // `allowed_mime_types`, que SÃO comparados. Um comentário do núcleo
      // chega a se justificar dizendo que "as duas conferências precisam
      // continuar dizendo a mesma coisa se uma mudar".
      //
      // A comparação é por COMPORTAMENTO, e não por leitura do texto do SQL:
      // o que importa é onde o banco corta, e é isso que se mede.
      {
        const raiz = "https://x.supabase.co/";
        const noTeto = raiz + "a".repeat(TAMANHO_MAXIMO_DO_ENDERECO - raiz.length);
        const acimaDoTeto = noTeto + "a";
        const fronteira = await executarSql(
          token,
          `select
             public.endereco_de_imagem_e_permitido(${literal(noTeto)}) as no_teto,
             public.endereco_de_imagem_e_permitido(${literal(acimaDoTeto)}) as acima`,
        );
        afirmar(
          `o banco corta o endereço EXATAMENTE em ${TAMANHO_MAXIMO_DO_ENDERECO} caracteres — o número do domínio, medido e não lido`,
          fronteira.ok &&
            fronteira.dados?.[0]?.no_teto === true &&
            fronteira.dados?.[0]?.acima === false &&
            enderecoDeImagemPermitido(noTeto) === true &&
            enderecoDeImagemPermitido(acimaDoTeto) === false,
          fronteira.erro ?? JSON.stringify(fronteira.dados?.[0]),
        );

        /* O TETO DA DESCRIÇÃO, do mesmo jeito — e o texto do teste é DERIVADO
           da constante, e não um `301` escrito à mão. */
        const noLimite = slug("alt-no-limite");
        const acimaDoLimite = slug("alt-acima");
        const capaValida =
          "https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/abcdefgh.png";
        const cabe = await executarSql(
          token,
          `insert into public.posts (slug, titulo, imagem_url, imagem_alt)
           values (${literal(noLimite)}, 'Pelo console', ${literal(capaValida)},
                   repeat('a', ${TAMANHO_MAXIMO_DO_ALTERNATIVO}))`,
        );
        const naoCabe = await executarSql(
          token,
          `insert into public.posts (slug, titulo, imagem_url, imagem_alt)
           values (${literal(acimaDoLimite)}, 'Pelo console', ${literal(capaValida)},
                   repeat('a', ${TAMANHO_MAXIMO_DO_ALTERNATIVO + 1}))`,
        );
        afirmar(
          `o banco corta a descrição EXATAMENTE em ${TAMANHO_MAXIMO_DO_ALTERNATIVO} caracteres — o mesmo número do domínio`,
          cabe.ok &&
            !naoCabe.ok &&
            /posts_imagem_alt_com_teto/.test(naoCabe.erro ?? ""),
          cabe.ok ? (naoCabe.erro ?? "o insert acima do teto PASSOU") : (cabe.erro ?? ""),
        );
        await executarSql(
          token,
          `delete from public.posts where slug in (${literal(noLimite)}, ${literal(acimaDoLimite)})`,
        );
      }

      /* — (6) E AS TRÊS RESTRIÇÕES ESTÃO VALIDADAS — */
      //
      // Elas nasceram `not valid` na migração corretiva, para não poderem
      // ABORTAR o arquivo inteiro num banco com dado ruim. `not valid` sem o
      // `validate constraint` depois é meia restrição com cara de restrição
      // inteira: ela valeria só para linha nova, e um `UPDATE` pelo console
      // sobre uma linha antiga escaparia.
      {
        const validadas = await executarSql(
          token,
          `select coalesce(string_agg(conname || '=' || convalidated::text, ',' order by conname), '') as v
             from pg_constraint
            where conrelid = 'public.posts'::regclass
              and conname in ('posts_imagem_url_e_endereco',
                              'posts_seo_imagem_url_e_endereco',
                              'posts_imagem_alt_com_teto')`,
        );
        const texto = String(validadas.dados?.[0]?.v ?? "");
        afirmar(
          "as três restrições da capa existem e estão VALIDADAS — `not valid` sem validar é meia restrição",
          validadas.ok &&
            texto.split(",").filter(Boolean).length === 3 &&
            !texto.includes("=false"),
          validadas.erro ?? `encontrado: ${texto || "nenhuma"}`,
        );
      }
      /* — E O BANCO RECUSA DE VERDADE, pelo console (Story 3.1) — */
      //
      // A comparação acima julga a FUNÇÃO. Isto julga a RESTRIÇÃO: sem o
      // `check` na coluna, a função poderia estar perfeita e a gravação passar
      // do mesmo jeito. O caminho é o console do projeto, que função nenhuma
      // cobre — e é ele que torna "por qualquer via" verdadeiro.

      {
        const RESTRICAO_DA_CAPA = "posts_imagem_url_e_endereco";
        const RECUSAS_DE_CAPA = [
          [
            "png",
            "uma imagem inteira em base64",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
          ],
          ["svg", "um SVG com script embutido", "data:image/svg+xml;utf8,<svg onload=alert(1)></svg>"],
          ["blob", "um endereço de blob do navegador", "blob:https://x.supabase.co/9a1f"],
          ["js", "um endereço executável", "javascript:alert(1)"],
          ["relativo", "um caminho relativo", "/imagens/capa.png"],
          ["http", "um endereço sem TLS", "http://cdn.exemplo.com/capa.png"],
          ["protocolo", "um endereço relativo de protocolo", "//cdn.exemplo.com/capa.png"],
          /* A FRONTEIRA DO HOST LOCAL, pelo console: o sufixo é a evasão
             clássica, e sem este caso a concordância JS↔SQL seria satisfeita
             por qualquer afrouxamento simétrico dos dois lados. */
          ["sufixo", "um host de terceiro com sufixo de localhost", "http://localhost.exemplo.com/capa.png"],
          ["sufixoIp", "um host de terceiro com sufixo de 127.0.0.1", "http://127.0.0.1.exemplo.com/capa.png"],
        ];

        for (const [chave, descricao, valor] of RECUSAS_DE_CAPA) {
          const r = await executarSql(
            token,
            `insert into public.posts (slug, titulo, imagem_url, imagem_alt)
             values (${literal(slug(`capa-${chave}`))}, 'Pelo console', ${literal(valor)}, 'descrição')`,
          );
          afirmar(
            `escrita pelo console — ${descricao} na coluna da capa é recusada por ${RESTRICAO_DA_CAPA}`,
            !r.ok && new RegExp(RESTRICAO_DA_CAPA).test(r.erro ?? ""),
            r.ok ? "o comando PASSOU — a restrição não pega este caso" : (r.erro ?? ""),
          );
        }

        /* A MESMA restrição vale para `seo_imagem_url`. Ela não tem campo e
           nenhuma porta a escreve — e é exatamente por isso que ela seria o
           buraco por onde a regressão voltaria pelo console. */
        const seo = await executarSql(
          token,
          `insert into public.posts (slug, titulo, seo_imagem_url)
           values (${literal(slug("capa-seo"))}, 'Pelo console', 'data:image/png;base64,iVBORw0KGgo=')`,
        );
        afirmar(
          "e a coluna da imagem de compartilhamento recusa a mesma coisa, por posts_seo_imagem_url_e_endereco",
          !seo.ok && /posts_seo_imagem_url_e_endereco/.test(seo.erro ?? ""),
          seo.ok ? "o comando PASSOU" : (seo.erro ?? ""),
        );

        /* CONTROLE POSITIVO: a MESMA chave, pelo MESMO caminho, grava um
           endereço legítimo. Sem ele, uma restrição que recusasse TODA
           gravação faria as oito recusas acima passarem por vacuidade. */
        const legitimo = slug("capa-aceita");
        const bom = await executarSql(
          token,
          `insert into public.posts (slug, titulo, imagem_url, imagem_alt)
           values (${literal(legitimo)}, 'Pelo console',
                   'https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/abcdefgh.png',
                   'Uma descrição')`,
        );
        afirmar(
          "controle positivo: o banco ACEITA um endereço de capa legítimo pelo mesmo caminho",
          bom.ok,
          bom.erro ?? "",
        );

        /* E O PAR CONTINUA COBRADO. `posts_imagem_exige_alt` é da Story 2.1 e
           é a razão de o campo de descrição ser oferecido JUNTO da imagem: sem
           ela, a recusa chegaria depois do envio. */
        const semAlt = await executarSql(
          token,
          `insert into public.posts (slug, titulo, imagem_url)
           values (${literal(slug("capa-sem-alt"))}, 'Pelo console',
                   'https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/abcdefgh.png')`,
        );
        afirmar(
          "capa sem descrição continua recusada pelo banco — é por isso que o campo é oferecido junto",
          !semAlt.ok && /posts_imagem_exige_alt/.test(semAlt.erro ?? ""),
          semAlt.ok ? "o comando PASSOU" : (semAlt.erro ?? ""),
        );

        /* E o TETO da descrição, que a Story 3.1 acrescentou: a coluna aceitava
           um documento inteiro. */
        const altLongo = await executarSql(
          token,
          `insert into public.posts (slug, titulo, imagem_url, imagem_alt)
           values (${literal(slug("capa-alt-longo"))}, 'Pelo console',
                   'https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/abcdefgh.png',
                   repeat('a', 301))`,
        );
        afirmar(
          "descrição de imagem acima do teto é recusada por posts_imagem_alt_com_teto",
          !altLongo.ok && /posts_imagem_alt_com_teto/.test(altLongo.erro ?? ""),
          altLongo.ok ? "o comando PASSOU" : (altLongo.erro ?? ""),
        );

        await executarSql(
          token,
          `delete from public.posts where slug like ${literal(`${prefixo}capa-%`)}`,
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

      /* ── (e4) OS TRÊS CAMPOS DE SEO: a porta, e o teto que o BANCO cobra ── */

      secao("(e4) os três campos de SEO: o caminho de escrita, e o teto no banco (Story 3.4)");

      /*
       * A LACUNA QUE ESTA SEÇÃO FECHA.
       *
       * `seo_titulo`, `seo_descricao` e `seo_imagem_url` existem na coluna
       * desde a Story 2.1 e, até esta story, NÃO estavam em `CAMPOS_ACEITOS`:
       * quem os mandasse os via voltar na lista de descartados, com nome. Não
       * havia caminho de escrita — e é por isso que o elo de maior precedência
       * da cadeia de herança nunca podia ter valor.
       *
       * Aqui a porta é exercida contra o projeto de verdade, e o que se afirma
       * é o que ficou NA COLUNA, relido por fora da função. A resposta da
       * própria função é o que ela diz que fez.
       */
      {
        const RECADO_SEM_SESSAO = [
          "os três campos de SEO atravessam a porta única e ficam na coluna",
          "e nenhum dos três volta como campo descartado — eles são ACEITOS, e não ignorados",
          "vazio LIMPA os três, e limpar é o pedido de herdar",
          "o teto de higiene é recusado pela PORTA, com a frase dizendo o número",
          "e o comprimento usual NÃO é recusa: o texto entre os dois números atravessa inteiro",
        ];
        /* As duas da RLS ficam à parte porque elas têm um SEGUNDO jeito de não
           rodar — a linha não ter sido semeada —, e adiar uma asserção sem
           nomeá-la é o mesmo que ela não existir. */
        const RECADO_DA_RLS = [
          "controle positivo: a sessão do Painel ENXERGA a linha cujos campos de SEO ela tentará mudar",
          "escrever os campos de SEO direto no PostgREST com sessão do Painel é RECUSADO — e a coluna não mudou",
        ];

        const IMAGEM_DE_SEO =
          "https://x.supabase.co/storage/v1/object/public/imagens-do-blog/capas/seoabcde.png";
        const slugDoSeo = slug("seo");

        /* ── O QUE A SEÇÃO PROMETE ADIAR É O QUE ELA AFIRMA ───────────────
           As duas listas acima existem para que nenhuma asserção SUMA quando a
           sessão não abre — "adiada" aparece no veredito, "não rodou" não
           apareceria. Mas lista escrita à mão ao lado das chamadas é lista que
           envelhece: a asserção nova nasce dentro do ramo da sessão, ninguém a
           acrescenta aqui, e no dia do 429 ela desaparece sem rastro. Foi
           exatamente o que a revisão da Story 3.1 pegou na prova das políticas
           do Storage.

           A guarda é de IGUALDADE DE CONJUNTO, e não de piso: piso não reage
           ao que é ACRESCENTADO, que é justamente o caso que se quer pegar. */
        const nomesNoRamoDaSessao = [];
        const afirmarComSessao = (descricao, condicao, detalhe = "") => {
          nomesNoRamoDaSessao.push(descricao);
          return afirmar(descricao, condicao, detalhe);
        };

        /** O que o BANCO tem nas três colunas, lido por fora da função. */
        const colunasDeSeo = async () => {
          const r = await executarSql(
            token,
            `select seo_titulo, seo_descricao, seo_imagem_url
               from public.posts where slug = ${literal(slugDoSeo)}`,
          );
          return r.ok ? (r.dados?.[0] ?? null) : null;
        };

        if (contas[0].jwt) {
          const TITULO_DE_SEO = "Um título de busca escolhido a dedo";
          const DESCRICAO_DE_SEO = "Uma meta descrição escrita pelo Autor, e não herdada.";

          const nascimento = await salvarPost({
            token: contas[0].jwt,
            corpo: corpoValido({
              slug: slugDoSeo,
              titulo: "Post com os três campos de SEO",
              resumo: "O resumo, que os campos de SEO vazios herdariam",
              seo_titulo: TITULO_DE_SEO,
              seo_descricao: DESCRICAO_DE_SEO,
              seo_imagem_url: IMAGEM_DE_SEO,
            }),
            acesso: acessoReal(),
          });
          const idDoSeo = nascimento.ok ? (nascimento.dados.post?.id ?? null) : null;
          const gravado = await colunasDeSeo();

          /* O VALOR, e não uma contagem de colunas não nulas: uma gravação que
             pusesse o título no campo da descrição passaria por qualquer conta
             de nulos, e é exatamente o erro que uma lista de campos declarada
             em quatro lugares produz. */
          afirmarComSessao(
            "os três campos de SEO atravessam a porta única e ficam na coluna",
            nascimento.ok === true &&
              gravado?.seo_titulo === TITULO_DE_SEO &&
              gravado?.seo_descricao === DESCRICAO_DE_SEO &&
              gravado?.seo_imagem_url === IMAGEM_DE_SEO,
            nascimento.ok
              ? `no banco: ${JSON.stringify(gravado)}`
              : `${nascimento.erro.tipo}: ${nascimento.erro.mensagem}`,
          );

          /* E ELES NÃO SÃO DESCARTADOS. Antes desta story era isto que
             acontecia — e uma implementação que gravasse os três mas deixasse
             os nomes na lista de descartes faria o Autor ver um aviso de perda
             sobre o que acabou de ser salvo. */
          const descartados = nascimento.ok ? [...(nascimento.dados.ignorados ?? [])] : [];
          afirmarComSessao(
            "e nenhum dos três volta como campo descartado — eles são ACEITOS, e não ignorados",
            nascimento.ok === true &&
              CAMPOS_DE_SEO.every((campo) => !descartados.includes(campo)) &&
              CAMPOS_DE_SEO.every((campo) => CAMPOS_ACEITOS.includes(campo)),
            `descartados: ${descartados.join(", ") || "nenhum"}`,
          );

          /* VAZIO LIMPA, E LIMPAR É HERDAR. A coluna volta a `null`, e não a
             uma string em branco: `""` gravado viraria uma etiqueta declarada e
             vazia, que é pior que a herdada porque nada acusaria. */
          if (idDoSeo) {
            const limpeza = await salvarPost({
              token: contas[0].jwt,
              /* Título e conteúdo viajam porque a porta os exige em TODO
                 salvamento, e não só no nascimento — omiti-los faria a recusa
                 ser "falta preencher", que não é o que esta asserção julga. */
              corpo: {
                id: idDoSeo,
                titulo: "Post com os três campos de SEO",
                conteudo: DOCUMENTO_COMPLETO,
                seo_titulo: "   ",
                seo_descricao: "",
                seo_imagem_url: null,
              },
              acesso: acessoReal(),
            });
            const depois = await colunasDeSeo();
            afirmarComSessao(
              "vazio LIMPA os três, e limpar é o pedido de herdar",
              limpeza.ok === true &&
                depois?.seo_titulo === null &&
                depois?.seo_descricao === null &&
                depois?.seo_imagem_url === null,
              limpeza.ok
                ? `no banco: ${JSON.stringify(depois)}`
                : `${limpeza.erro.tipo}: ${limpeza.erro.mensagem}`,
            );
          } else {
            adiar("vazio LIMPA os três, e limpar é o pedido de herdar", "o Post não pôde nascer");
          }

          /* O TETO DE HIGIENE, PELA PORTA. O número vem do domínio, e a frase
             de recusa precisa DIZÊ-LO: recusa que não diz o limite deixa o
             Autor apagando texto às cegas. */
          const acimaDoTeto = await salvarPost({
            token: contas[0].jwt,
            corpo: corpoValido({
              slug: slug("seo-longo"),
              titulo: "Post com título de SEO longo demais",
              seo_titulo: "t".repeat(TETO_DE_HIGIENE_DE_SEO.seo_titulo + 1),
            }),
            acesso: acessoReal(),
          });
          const naoNasceu = await executarSql(
            token,
            `select count(*)::int as n from public.posts where slug = ${literal(slug("seo-longo"))}`,
          );
          afirmarComSessao(
            "o teto de higiene é recusado pela PORTA, com a frase dizendo o número",
            acimaDoTeto.ok === false &&
              acimaDoTeto.erro.tipo === ERRO_DADOS_INVALIDOS &&
              acimaDoTeto.erro.mensagem.includes(String(TETO_DE_HIGIENE_DE_SEO.seo_titulo)) &&
              acimaDoTeto.erro.mensagem.includes(ROTULOS_DE_SEO.seo_titulo) &&
              naoNasceu.dados?.[0]?.n === 0,
            acimaDoTeto.ok
              ? "a gravação PASSOU"
              : `${acimaDoTeto.erro.mensagem} | linhas: ${naoNasceu.dados?.[0]?.n}`,
          );

          /* E OS DOIS NÚMEROS SÃO MESMO DOIS. O texto acima do comprimento
             USUAL — o que o contador sinaliza na tela — atravessa esta porta
             INTEIRO: nem recusado, nem aparado. Sem esta asserção, um teto
             encostado no usual passaria despercebido, e o conselho de exibição
             viraria regra do produto. */
          const entreOsDois = "u".repeat(COMPRIMENTO_USUAL_DE_SEO.seo_titulo + 30);
          const slugEntre = slug("seo-entre");
          const passou = await salvarPost({
            token: contas[0].jwt,
            corpo: corpoValido({
              slug: slugEntre,
              titulo: "Post com título de SEO acima do usual",
              seo_titulo: entreOsDois,
            }),
            acesso: acessoReal(),
          });
          const inteiro = await executarSql(
            token,
            `select seo_titulo from public.posts where slug = ${literal(slugEntre)}`,
          );
          afirmarComSessao(
            "e o comprimento usual NÃO é recusa: o texto entre os dois números atravessa inteiro",
            passou.ok === true &&
              entreOsDois.length > COMPRIMENTO_USUAL_DE_SEO.seo_titulo &&
              entreOsDois.length < TETO_DE_HIGIENE_DE_SEO.seo_titulo &&
              inteiro.dados?.[0]?.seo_titulo === entreOsDois,
            passou.ok
              ? `gravado com ${String(inteiro.dados?.[0]?.seo_titulo ?? "").length} de ${entreOsDois.length} caracteres`
              : `${passou.erro.tipo}: ${passou.erro.mensagem}`,
          );

          /* ── E A RLS CONTINUA NEGANDO AS COLUNAS NOVAS ────────────────
             Abrir um caminho de escrita é o momento em que a defesa vizinha
             costuma afrouxar junto: se `authenticated` pudesse escrever estas
             três colunas direto no PostgREST, a porta única seria um caminho
             entre dois. O alvo é uma linha que EXISTE — contra identificador
             inventado o PostgREST responderia 2xx com lista vazia mesmo sem
             política, e a recusa passaria por vacuidade. */
          if (idDoSeo) {
            const pelaSessao = async (corpo, metodo = "PATCH") => {
              try {
                const r = await fetch(
                  `${URL_PROJETO}/rest/v1/posts?id=eq.${encodeURIComponent(idDoSeo)}`,
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

            /* CONTROLE POSITIVO, e ele não é cortesia: o PostgREST responde
               `200 []` quando a política ESCONDE a linha da escrita, e esse é
               um dos ramos que o veredito aceita como recusa. Contra um
               identificador que não existe, a resposta seria a MESMA — e a
               asserção passaria por vacuidade, verde num projeto sem política
               nenhuma. É a leitura com a MESMA credencial que separa as duas
               coisas: a linha está lá, e esta sessão a enxerga. */
            const leitura = await pelaSessao(undefined, "GET");
            const enxerga = leitura.status === 200 && leitura.corpo.includes(idDoSeo);
            afirmarComSessao(
              "controle positivo: a sessão do Painel ENXERGA a linha cujos campos de SEO ela tentará mudar",
              enxerga,
              `HTTP ${leitura.status} ${leitura.corpo.slice(0, 140)}`,
            );

            const INVASAO = "Título de SEO gravado por fora";
            /* O QUE A COLUNA TINHA ANTES. O veredito é "não mudou", e comparar
               com um valor esperado à mão amarraria esta asserção ao que a
               asserção anterior deixou na linha — e ela falharia por tabela,
               acusando a RLS por um defeito que não é dela. */
            const antes = await colunasDeSeo();
            const tentativa = await pelaSessao({
              seo_titulo: INVASAO,
              seo_descricao: "Descrição gravada por fora",
              seo_imagem_url: IMAGEM_DE_SEO,
            });
            const agora = await colunasDeSeo();
            const recusou =
              tentativa.status === 401 ||
              tentativa.status === 403 ||
              (tentativa.status >= 400 &&
                tentativa.status < 500 &&
                /42501|permission denied|row-level security/i.test(tentativa.corpo)) ||
              /* "Nada alterado" só vale como recusa porque o controle positivo
                 acima provou que há o que alterar e que esta credencial o vê. */
              (enxerga &&
                tentativa.status >= 200 &&
                tentativa.status < 300 &&
                /^\s*\[\s*\]\s*$/.test(tentativa.corpo));
            /* O VEREDITO É A COLUNA, e não só o código HTTP: o que a story
               promete é que o valor não entrou. */
            afirmarComSessao(
              "escrever os campos de SEO direto no PostgREST com sessão do Painel é RECUSADO — e a coluna não mudou",
              enxerga &&
                antes !== null &&
                recusou &&
                agora?.seo_titulo !== INVASAO &&
                JSON.stringify(agora) === JSON.stringify(antes),
              `HTTP ${tentativa.status} ${tentativa.corpo.slice(0, 140)} | antes: ${JSON.stringify(antes)} | agora: ${JSON.stringify(agora)}`,
            );
          } else {
            for (const descricao of RECADO_DA_RLS) {
              adiar(
                descricao,
                "o Post da seção não pôde ser semeado — sem linha existente, a recusa passaria por vacuidade",
              );
            }
          }
        } else {
          for (const descricao of [...RECADO_SEM_SESSAO, ...RECADO_DA_RLS]) {
            adiar(descricao, MOTIVO_SEM_SESSAO);
          }
        }

        /* A GUARDA DAS DUAS LISTAS, exercida só quando houve sessão: sem ela
           não há nomes a comparar, e é o ramo de adiamento que roda. */
        if (contas[0].jwt) {
          const prometidas = [...RECADO_SEM_SESSAO, ...RECADO_DA_RLS];
          afirmar(
            `as ${prometidas.length} asserções que esta seção promete adiar são EXATAMENTE as que ela faz com sessão`,
            mesmoConjunto(nomesNoRamoDaSessao, prometidas),
            `feitas: ${nomesNoRamoDaSessao.length} | prometidas: ${prometidas.length} | só numa das listas: ${[
              ...nomesNoRamoDaSessao.filter((n) => !prometidas.includes(n)),
              ...prometidas.filter((n) => !nomesNoRamoDaSessao.includes(n)),
            ].join(" | ") || "nenhuma"}`,
          );
        }

        /* ── E O BANCO COBRA O MESMO TETO, PELO CONSOLE ────────────────
           A recusa acima é da aplicação. Esta é da RESTRIÇÃO: sem o `check`
           na coluna, a porta poderia estar perfeita e um `insert` pelo console
           do projeto — caminho que função nenhuma cobre — gravaria um
           `og:description` de dez mil caracteres do mesmo jeito.

           A fronteira é DERIVADA do número do domínio, e não escrita à mão:
           `repeat` no teto exato PASSA, `repeat` no teto mais um é recusado. É
           assim que "os dois lados dizem a mesma coisa" deixa de ser promessa
           e vira medida. */
        for (const campo of ["seo_titulo", "seo_descricao"]) {
          const teto = TETO_DE_HIGIENE_DE_SEO[campo];
          const restricao = `posts_${campo}_com_teto`;
          /* O slug do banco não aceita sublinhado (`posts_slug_formato`), e o
             nome da coluna tem um — trocá-lo por hífen é o que faz o `insert`
             chegar à restrição que esta asserção julga, em vez de morrer na
             anterior. */
          const emSlug = campo.replaceAll("_", "-");
          const noTeto = slug(`${emSlug}-no-teto`);
          const acima = slug(`${emSlug}-acima`);
          const cabe = await executarSql(
            token,
            `insert into public.posts (slug, titulo, ${campo})
             values (${literal(noTeto)}, 'Pelo console', repeat('a', ${teto}))`,
          );
          const naoCabe = await executarSql(
            token,
            `insert into public.posts (slug, titulo, ${campo})
             values (${literal(acima)}, 'Pelo console', repeat('a', ${teto + 1}))`,
          );
          afirmar(
            `o banco corta \`${campo}\` EXATAMENTE em ${teto} caracteres, por ${restricao} — o número do domínio, medido`,
            cabe.ok && !naoCabe.ok && new RegExp(restricao).test(naoCabe.erro ?? ""),
            cabe.ok
              ? (naoCabe.erro ?? "o insert acima do teto PASSOU")
              : (cabe.erro ?? ""),
          );
          await executarSql(
            token,
            `delete from public.posts where slug in (${literal(noTeto)}, ${literal(acima)})`,
          );

          /* E A FRONTEIRA COM CARACTERE FORA DO BMP.
             `repeat('a', …)` nunca alcança a divergência entre `.length` e
             `char_length`: um emoji é UM caractere para a restrição e DOIS para
             `String.prototype.length`. Enquanto todo caso do corpus fosse ASCII,
             "os dois lados dizem a mesma coisa" era uma frase sobre um alfabeto
             só. O texto é montado NO BANCO por `repeat`, e a contagem do lado de
             cá é conferida contra a do lado de lá. */
          const emojiNoTeto = slug(`${emSlug}-emoji-no-teto`);
          const emojiAcima = slug(`${emSlug}-emoji-acima`);
          const cabeEmoji = await executarSql(
            token,
            `insert into public.posts (slug, titulo, ${campo})
             values (${literal(emojiNoTeto)}, 'Pelo console', repeat(chr(128512), ${teto}))`,
          );
          const naoCabeEmoji = await executarSql(
            token,
            `insert into public.posts (slug, titulo, ${campo})
             values (${literal(emojiAcima)}, 'Pelo console', repeat(chr(128512), ${teto + 1}))`,
          );
          afirmar(
            `e a fronteira de \`${campo}\` é a MESMA com caractere fora do BMP — o banco conta caractere, e o domínio também`,
            cabeEmoji.ok &&
              !naoCabeEmoji.ok &&
              new RegExp(restricao).test(naoCabeEmoji.erro ?? "") &&
              caracteresDe("😀".repeat(teto)) === teto &&
              problemaNoTextoDeSeo(campo, "😀".repeat(teto)) === null &&
              problemaNoTextoDeSeo(campo, "😀".repeat(teto + 1)) !== null,
            cabeEmoji.ok
              ? (naoCabeEmoji.erro ?? "o insert de emoji acima do teto PASSOU")
              : (cabeEmoji.erro ?? ""),
          );
          await executarSql(
            token,
            `delete from public.posts where slug in (${literal(emojiNoTeto)}, ${literal(emojiAcima)})`,
          );
        }

        /* E AS DUAS RESTRIÇÕES NOVAS ESTÃO VALIDADAS. Elas nasceram
           `not valid` para não poderem abortar o arquivo inteiro num banco com
           linha fora do formato — e `not valid` sem o `validate constraint`
           depois vale só para linha nova: um `UPDATE` pelo console sobre uma
           linha antiga escaparia. */
        {
          const nomes = ["seo_titulo", "seo_descricao"].map((c) => `posts_${c}_com_teto`);
          const validadas = await executarSql(
            token,
            `select coalesce(string_agg(conname || '=' || convalidated::text, ',' order by conname), '') as v
               from pg_constraint
              where conrelid = 'public.posts'::regclass
                and conname in (${nomes.map((n) => literal(n)).join(", ")})`,
          );
          const texto = String(validadas.dados?.[0]?.v ?? "");
          afirmar(
            "as duas restrições de teto de SEO existem e estão VALIDADAS — `not valid` sem validar é meia restrição",
            validadas.ok &&
              texto.split(",").filter(Boolean).length === nomes.length &&
              !texto.includes("=false"),
            validadas.erro ?? `encontrado: ${texto || "nenhuma"}`,
          );
        }
      }


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


/* ─── (f) as rotas servidas: o shell do build, e a falha que não se disfarça ── */
secao("(f) as rotas servidas: o shell do build, e a falha que não se disfarça");

{
  /* AS TRÊS ROTAS SÃO DIRIGIDAS DE VERDADE, com requisição e resposta
     dubladas — o mesmo molde do Supabase de mentira da Story 2.12. O que se
     grava é o que a função DECIDIU: código, tipo do documento e corpo. Ler o
     fonte e supor provaria que alguém escreveu a palavra certa no arquivo, e
     não que a rota entrega o que promete. */
  const resposta = () => {
    const r = { cabecalhos: {}, codigo: null, corpo: null };
    r.setHeader = (k, v) => {
      r.cabecalhos[String(k).toLowerCase()] = v;
    };
    r.status = (c) => {
      r.codigo = c;
      return r;
    };
    r.send = (c) => {
      r.corpo = c;
    };
    r.json = (o) => {
      r.corpo = JSON.stringify(o);
    };
    return r;
  };
  const dirigir = async (arquivo, req) => {
    const r = resposta();
    const { default: servir } = await import(
      pathToFileURL(path.join(raiz, "api", arquivo)).href
    );
    await servir(req, r);
    return r;
  };
  const comDominio = async (valor, acao) => {
    const guardado = process.env.VITE_DOMINIO_DO_SITE;
    if (valor === null) delete process.env.VITE_DOMINIO_DO_SITE;
    else process.env.VITE_DOMINIO_DO_SITE = valor;
    try {
      return await acao();
    } finally {
      if (guardado === undefined) delete process.env.VITE_DOMINIO_DO_SITE;
      else process.env.VITE_DOMINIO_DO_SITE = guardado;
    }
  };
  const DOMINIO = "https://chatclean.com.br";

  /* ── A PÁGINA SERVE O SHELL DO BUILD ─────────────────────────────────── */
  {
    /* ★ ESTA ASSERÇÃO MUDOU NA STORY 4.3, e a mudança é o ponto ★

       Ela dizia `byte a byte`, e estava certa enquanto a rota só repassava o
       shell. Agora a rota TROCA a região de metadados — é a story inteira —,
       e exigir igualdade byte a byte exigiria que a troca não acontecesse.

       O que sobrou de garantia é o que ela sempre quis dizer: o shell é o do
       BUILD. Isso é medido pelo que está FORA da região, que continua
       idêntico ao do `dist/index.html` — e a região, essa, precisa ter
       mudado, o que é afirmado logo abaixo. Trocar `===` por `includes` sem
       essa segunda metade teria deixado a assercão passar com a rota
       servindo qualquer coisa que contivesse o shell. */
    const nucleo = await import(
      pathToFileURL(path.join(raiz, "api", "_nucleo", "metadados.js")).href
    );
    /* AS DUAS REGIÕES SÃO RECORTADAS, e não só a de metadados. A Story 4.4
       acrescentou a do corpo do artigo, e deixar a assercão olhando só para uma
       delas a faria falhar por uma troca que é justamente o que se quer. O que
       ela mede continua sendo o mesmo: o shell é o do BUILD, e o que a rota
       governa são as regiões — nada além delas. */
    const corpoMod = await import(
      pathToFileURL(path.join(raiz, "api", "_nucleo", "artigo.js")).href
    );
    const REGIOES_GOVERNADAS = [
      [nucleo.MARCA_INICIO, nucleo.MARCA_FIM],
      [corpoMod.MARCA_CORPO_INICIO, corpoMod.MARCA_CORPO_FIM],
    ];
    const foraDaRegiao = (html) => {
      let texto = String(html ?? "");
      for (const [inicio, fim] of REGIOES_GOVERNADAS) {
        const i = texto.indexOf(inicio);
        const j = texto.indexOf(fim, i === -1 ? 0 : i);
        if (i === -1 || j === -1) return null;
        const fecha = texto.indexOf("-->", j);
        if (fecha === -1) return null;
        texto = texto.slice(0, i) + texto.slice(fecha + 3);
      }
      return texto;
    };

    const r = await comDominio(DOMINIO, () =>
      dirigir("blog.js", { method: "GET", url: "/api/blog" }),
    );
    const doBuild = ler("dist/index.html");
    afirmar(
      "a rota de página serve o shell do BUILD — tudo FORA da região de metadados é idêntico ao `dist/index.html`",
      r.codigo === 200 &&
        foraDaRegiao(r.corpo) !== null &&
        foraDaRegiao(r.corpo) === foraDaRegiao(doBuild),
      `${r.codigo} | ${String(r.corpo ?? "").length} × ${doBuild.length}`,
    );
    /* E A REGIÃO MUDOU. Sem esta metade, um `foraDaRegiao` que devolvesse o
       documento inteiro nos dois lados deixaria a de cima verde sem julgar
       nada — e é exatamente o engano que a troca de `===` convidava. */
    afirmar(
      "e a REGIÃO mudou — o shell do build traz o metadado da home, e o servido não pode trazer",
      String(r.corpo ?? "") !== doBuild &&
        !/<title>CRM e ChatBot/.test(String(r.corpo ?? "")),
      /<title>([^<]*)</.exec(String(r.corpo ?? ""))?.[1] ?? "sem título",
    );
    afirmar(
      "e o que ela serve NÃO aponta para o caminho do código-fonte — servir isso seria uma página que responde e não carrega",
      !String(r.corpo ?? "").includes("/src/main.jsx") &&
        /\/assets\/[^"]+\.js/.test(String(r.corpo ?? "")),
      String(r.corpo ?? "").includes("/src/main.jsx") ? "aponta para o fonte" : "aponta para o build",
    );
    afirmar(
      "e o tipo do documento é o que o endereço promete",
      String(r.cabecalhos["content-type"] ?? "").startsWith("text/html"),
      String(r.cabecalhos["content-type"] ?? ""),
    );
  }

  /* ── SEM O SHELL, ELA FALHA ALTO ─────────────────────────────────────── */
  {
    const modulo = await import(pathToFileURL(path.join(raiz, "api", "_nucleo", "shell.js")).href);
    /* A AUSÊNCIA É INJETADA, e não encenada apagando o arquivo. Esta
       ferramenta tem uma asserção — com razão — de que não grava nada, e
       apagar para restaurar depois é gravar. A costura é a mesma ideia de
       `buscar` e `obterToken` na camada de dados: o caminho de falha se
       exercita sem tocar no disco. */
    const semShell = await modulo.lerShell({
      importar: () => Promise.reject(new Error("ENOENT: shell.gerado.js")),
    });
    const vazio = await modulo.lerShell({
      importar: () => Promise.resolve({ SHELL: "" }),
    });
    afirmar(
      "sem o shell embutido a leitura devolve DEFEITO NOMEADO — nunca o `index.html` do repositório",
      semShell.ok === false && semShell.defeito === modulo.DEFEITO_SEM_SHELL,
      JSON.stringify(semShell).slice(0, 120),
    );
    /* E SHELL VAZIO CONTA COMO AUSENTE. Um módulo que existe e não traz nada
       serviria uma página em branco com sucesso — pior que a ausência, porque
       não deixa rastro. */
    afirmar(
      "e um shell VAZIO conta como ausente — módulo presente e sem conteúdo serviria página em branco com sucesso",
      vazio.ok === false && vazio.defeito === modulo.DEFEITO_SEM_SHELL,
      JSON.stringify(vazio).slice(0, 120),
    );
    afirmar(
      "e a frase do defeito é a DECLARADA, não uma montada na hora",
      typeof modulo.DEFEITO_SEM_SHELL === "string" &&
        modulo.DEFEITO_SEM_SHELL.includes("gerar-shell"),
      modulo.DEFEITO_SEM_SHELL,
    );
    /* O RECURSO NÃO EXISTE, e não é só evitado: o módulo não lê disco nenhum.
       O nome do arquivo do repositório APARECE nele — dentro da frase do
       defeito, que diz por que servi-lo seria errado —, então procurar o nome
       acusaria a explicação em vez do comportamento. O que se mede é a
       ausência de leitura de arquivo. */
    const codigoDoShell = mascararComentariosJs(ler("api/_nucleo/shell.js"));
    afirmar(
      "o módulo do shell não LÊ arquivo nenhum — o recurso ao `index.html` do repositório não existe, e não é só evitado",
      !/readFileSync|readFile|createReadStream|node:fs/.test(codigoDoShell),
      (codigoDoShell.match(/readFileSync|node:fs/g) ?? []).join(" ") || "nao le disco",
    );
    /* AUTOTESTE do detector: ele precisa acusar uma leitura de verdade. */
    afirmar(
      "autoteste: o detector de leitura de disco ACUSA uma leitura plantada",
      /readFileSync|readFile|createReadStream|node:fs/.test(codigoDoShell + '\nreadFileSync("x")'),
      "acusou",
    );
  }

  /* ── O MAPA DO SITE: AS FIXAS, E OS POSTS (Stories 4.1 e 4.7) ───────── */
  //
  // ★ ESTE BLOCO MUDOU NA STORY 4.7 ★
  //
  // Ele dirigia a rota sem banco, porque o mapa não consultava nada. Agora
  // consulta — e sem o Supabase de mentira a rota responde 500, que é o
  // comportamento CERTO e faria estas asserções acusarem a coisa errada.
  {
    const ANTES = Object.freeze([
      "/",
      "/api-oficial-whatsapp",
      "/sobre",
      "/blog",
      "/carreiras",
    ]);

    const { createServer: criarServidorDoMapa } = await import("node:http");
    /* O que `posts_no_ar()` devolve. Trocado a cada caso. */
    let postsDoMapa = [];
    let chamadasAoMapa = 0;
    const servidorDoMapa = criarServidorDoMapa((req, res) => {
      req.resume();
      req.on("end", () => {
        chamadasAoMapa += 1;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(postsDoMapa));
      });
    });
    await new Promise((pronto) => servidorDoMapa.listen(0, "127.0.0.1", pronto));
    const portaDoMapa = servidorDoMapa.address().port;

    const comBanco = async (acao) => {
      const guardado = {};
      const ambiente = {
        VITE_DOMINIO_DO_SITE: DOMINIO,
        SUPABASE_URL: `http://127.0.0.1:${portaDoMapa}`,
        SUPABASE_CHAVE_PUBLICAVEL: "sb_publishable_de_mentira",
        VITE_SUPABASE_URL: undefined,
        VITE_SUPABASE_PUBLISHABLE_KEY: undefined,
      };
      for (const [nome, valor] of Object.entries(ambiente)) {
        guardado[nome] = process.env[nome];
        if (valor === undefined) delete process.env[nome];
        else process.env[nome] = valor;
      }
      try {
        return await acao();
      } finally {
        for (const [nome, valor] of Object.entries(guardado)) {
          if (valor === undefined) delete process.env[nome];
          else process.env[nome] = valor;
        }
      }
    };
    const dirigirMapa = () =>
      comBanco(() => dirigir("sitemap.js", { method: "GET", url: "/api/sitemap" }));

    try {
    postsDoMapa = [];
    const r = await dirigirMapa();
    const servidos = [...String(r.corpo ?? "").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const perdidos = ANTES.filter((c) => !servidos.includes(`${DOMINIO}${c === "/" ? "/" : c}`));
    afirmar(
      "os cinco endereços que o mapa estático listava continuam TODOS servidos — a remoção não levou nada junto",
      perdidos.length === 0 && servidos.length === ANTES.length,
      perdidos.length > 0 ? `perdidos: ${perdidos.join(", ")}` : servidos.join(" "),
    );
    afirmar(
      "e todos são endereços ABSOLUTOS no Domínio Canônico — mapa com endereço relativo é mapa que ninguém segue",
      servidos.length > 0 && servidos.every((u) => u.startsWith(`${DOMINIO}/`)),
      servidos.find((u) => !u.startsWith(`${DOMINIO}/`)) ?? "todos absolutos",
    );
    /* CONTROLE: a rota REALMENTE consultou o banco. Sem isto, uma rota que
       voltasse a servir só as fixas passaria nas duas asserções acima. */
    afirmar(
      "o mapa CONSULTA o banco — sem isso ele listaria as fixas para sempre, e nenhum artigo",
      chamadasAoMapa > 0,
      `${chamadasAoMapa} chamada(s)`,
    );

    /* ── OS POSTS ENTRAM NO MAPA (Story 4.7) ──────────────────────────── */
    //
    // O buscador descobre artigo de dois jeitos: seguindo link, ou lendo este
    // arquivo. Sem os Posts, todo artigo dependia de alguém ter linkado.

    postsDoMapa = [
      {
        slug: "como-automatizar",
        titulo: "Como automatizar",
        publicado_em: "2026-08-01T10:00:00.000Z",
        atualizado_em: "2026-08-05T10:00:00.000Z",
      },
      {
        slug: "quanto-custa-a-api",
        titulo: "Quanto custa a API",
        publicado_em: "2026-08-02T10:00:00.000Z",
        atualizado_em: null,
      },
    ];
    const comPosts = await dirigirMapa();
    const locsComPosts = [
      ...String(comPosts.corpo ?? "").matchAll(/<loc>([^<]+)<\/loc>/g),
    ].map((m) => m[1]);
    afirmar(
      "cada Post no ar aparece no mapa, em endereço ABSOLUTO no Domínio Canônico",
      postsDoMapa.every((p) =>
        locsComPosts.includes(`${DOMINIO}/blog/${p.slug}`),
      ),
      locsComPosts.filter((u) => u.includes("/blog/")).join(" ") || "nenhum Post",
    );
    afirmar(
      "e as cinco fixas continuam junto — o mapa CRESCEU, não trocou de conteúdo",
      ANTES.every((c) => locsComPosts.includes(`${DOMINIO}${c}`)) &&
        locsComPosts.length === ANTES.length + postsDoMapa.length,
      `${locsComPosts.length} endereços (esperado ${ANTES.length + postsDoMapa.length})`,
    );

    /* ── `lastmod` É O `atualizado_em` REAL, E OMITIDO QUANDO NÃO HÁ ─── */
    //
    // Data congelada é pior que data ausente: o mapa estático trazia uma de
    // maio que ninguém mantinha. Um buscador que confia nela deixa de
    // revisitar; um que percebe a mentira desconfia de todas as datas do site.

    const nosDoMapa = [
      ...String(comPosts.corpo ?? "").matchAll(/<url>([\s\S]*?)<\/url>/g),
    ].map((m) => m[1]);
    const noDe = (endereco) =>
      nosDoMapa.find((no) => no.includes(`<loc>${endereco}</loc>`)) ?? "";
    afirmar(
      "o `lastmod` do Post é o `atualizado_em` REAL — e não uma data inventada nem o instante de agora",
      /<lastmod>2026-08-05<\/lastmod>/.test(noDe(`${DOMINIO}/blog/como-automatizar`)),
      /<lastmod>([^<]*)<\/lastmod>/.exec(noDe(`${DOMINIO}/blog/como-automatizar`))?.[1] ??
        "ausente",
    );
    afirmar(
      "e Post sem `atualizado_em` sai SEM `lastmod` — ausência é honesta, data inventada não",
      !noDe(`${DOMINIO}/blog/quanto-custa-a-api`).includes("<lastmod>"),
      /<lastmod>([^<]*)<\/lastmod>/.exec(noDe(`${DOMINIO}/blog/quanto-custa-a-api`))?.[1] ??
        "omitido",
    );
    /* E AS PÁGINAS FIXAS TAMBÉM NÃO TÊM — não há registro que diga quando
       mudaram, e inventar `now()` faria o site parecer editado a cada
       requisição. */
    afirmar(
      "as páginas fixas continuam sem `lastmod` — não há registro de quando mudaram, e `now()` faria o site parecer editado sempre",
      ANTES.every((c) => !noDe(`${DOMINIO}${c}`).includes("<lastmod>")),
      "sem lastmod",
    );

    /* ── DATA TORTA NÃO VIRA `lastmod` ────────────────────────────────── */

    postsDoMapa = [
      {
        slug: "data-torta",
        titulo: "Data torta",
        publicado_em: null,
        atualizado_em: "ontem de manhã",
      },
    ];
    const comDataTorta = await dirigirMapa();
    afirmar(
      "data que não é instante NÃO vira `lastmod` — o Post continua no mapa, sem a etiqueta",
      String(comDataTorta.corpo ?? "").includes(`${DOMINIO}/blog/data-torta`) &&
        !String(comDataTorta.corpo ?? "").includes("<lastmod>"),
      /<lastmod>([^<]*)<\/lastmod>/.exec(String(comDataTorta.corpo ?? ""))?.[1] ??
        "nenhum lastmod",
    );

    /* ── O XML CONTINUA VÁLIDO COM OS POSTS ──────────────────────────── */

    const abrem = (String(comPosts.corpo ?? "").match(/<url>/g) ?? []).length;
    const fecham = (String(comPosts.corpo ?? "").match(/<\/url>/g) ?? []).length;
    const locs = (String(comPosts.corpo ?? "").match(/<loc>/g) ?? []).length;
    afirmar(
      "o XML fecha o que abre, e há exatamente um `loc` por `url` — mapa malformado é mapa descartado inteiro",
      abrem > 0 && abrem === fecham && locs === abrem &&
        String(comPosts.corpo ?? "").startsWith('<?xml version="1.0" encoding="UTF-8"?>'),
      `${abrem} <url>, ${fecham} </url>, ${locs} <loc>`,
    );

    /* ── E O MAPA NUNCA REVELA O PAINEL ──────────────────────────────── */
    //
    // Nenhuma linha do `robots.txt` e nenhuma entrada do mapa revelam `/admin`
    // para quem não sabia dele. É a garantia da Story 2.13, e ela precisa
    // sobreviver ao mapa passar a ser gerado.

    postsDoMapa = [
      {
        slug: "admin",
        titulo: "Um Post com endereço perigoso",
        publicado_em: null,
        atualizado_em: null,
      },
    ];
    const comSlugPerigoso = await dirigirMapa();
    /* ★ O DETECTOR É ANCORADO NA RAIZ DO DOMÍNIO, e a primeira versão não era ★
       Ela procurava `/admin` em qualquer posição e ACUSOU `/blog/admin` — que é
       um Post com o endereço `admin`, e não o Painel. Um Post pode legitimamente
       se chamar assim; o que não pode aparecer é `<DOMÍNIO>/admin`, a raiz do
       Painel. Sem a âncora, esta asserção proibiria um endereço válido e
       ninguém saberia por quê até alguém tentar publicar. */
    const painelNoMapa = new RegExp(
      `<loc>${DOMINIO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/admin(?:/|<)`,
    );
    afirmar(
      "o mapa não anuncia a raiz do Painel — e um Post cujo endereço seja `admin` continua valendo, porque ele não é o Painel",
      !painelNoMapa.test(String(comSlugPerigoso.corpo ?? "")) &&
        String(comSlugPerigoso.corpo ?? "").includes(`${DOMINIO}/blog/admin`),
      (String(comSlugPerigoso.corpo ?? "").match(/<loc>[^<]*admin[^<]*<\/loc>/g) ?? []).join(" ") ||
        "não anuncia",
    );
    /* AUTOTESTE: o detector precisa acusar a raiz do Painel e a filha dela, e
       NÃO acusar o Post. Sem as três metades, um padrão errado passaria. */
    afirmar(
      "autoteste: o detector acusa `/admin` e `/admin/…`, e NÃO acusa `/blog/admin`",
      painelNoMapa.test(`<loc>${DOMINIO}/admin</loc>`) &&
        painelNoMapa.test(`<loc>${DOMINIO}/admin/posts</loc>`) &&
        !painelNoMapa.test(`<loc>${DOMINIO}/blog/admin</loc>`),
      "acusou os dois certos e poupou o Post",
    );

    /* ── LEITURA QUE FALHA ⇒ 500, E NUNCA MAPA SÓ COM AS FIXAS ──────── */
    //
    // Um mapa que lista cinco páginas e zero artigos diz ao buscador que o
    // blog está vazio, e ele DESINDEXA o que já conhecia. Um 500 diz "tente
    // de novo", e ele tenta.

    const semBanco = await (async () => {
      const guardado = process.env.SUPABASE_URL;
      const guardadoVite = process.env.VITE_SUPABASE_URL;
      process.env.SUPABASE_URL = "http://127.0.0.1:1";
      delete process.env.VITE_SUPABASE_URL;
      try {
        return await comDominio(DOMINIO, () =>
          dirigir("sitemap.js", { method: "GET", url: "/api/sitemap" }),
        );
      } finally {
        if (guardado === undefined) delete process.env.SUPABASE_URL;
        else process.env.SUPABASE_URL = guardado;
        if (guardadoVite !== undefined) process.env.VITE_SUPABASE_URL = guardadoVite;
      }
    })();
    afirmar(
      "leitura que falha derruba o mapa com 500 — servir só as fixas diria que o blog está vazio, e o buscador desindexaria",
      semBanco.codigo === 500 &&
        !String(semBanco.corpo ?? "").includes("<urlset"),
      `${semBanco.codigo} | ${String(semBanco.corpo ?? "").slice(0, 70)}`,
    );

    /* ── O DIAGNÓSTICO (Story 4.10): SITEMAP NÃO DEGRADA ─────────────── */
    //
    // O corpo continua sendo o defeito puro, e não um mapa alternativo —
    // decisão da 4.7, intacta. O que a 4.10 acrescenta é o cabeçalho.

    const diagDoMapa = await import(
      pathToFileURL(path.join(raiz, "api", "_nucleo", "diagnostico.js")).href
    );
    afirmar(
      "o mapa, servido com sucesso, tem `X-Entrega-Diagnostico: ok`",
      comPosts.cabecalhos["x-entrega-diagnostico"] === diagDoMapa.DIAGNOSTICO_OK,
      comPosts.cabecalhos["x-entrega-diagnostico"] ?? "ausente",
    );
    afirmar(
      "leitura que falha: o mapa nomeia a causa no diagnóstico, e o corpo continua sendo só o defeito — NÃO degrada, ao contrário de `/blog/:slug`",
      semBanco.cabecalhos["x-entrega-diagnostico"] === diagDoMapa.DIAGNOSTICO_LEITURA_FALHOU &&
        !String(semBanco.corpo ?? "").includes("<urlset"),
      semBanco.cabecalhos["x-entrega-diagnostico"] ?? "ausente",
    );

    /* ── A VISIBILIDADE NÃO É DECIDIDA NA ROTA ───────────────────────── */
    //
    // `posts_no_ar()` já aplica a regra, e é a MESMA que a página consulta.
    // Um filtro por Estado escrito aqui divergiria no dia em que a regra
    // mudasse, e o sintoma seria um mapa anunciando endereço que dá 404.

    const codigoDoMapa = mascararComentariosJs(ler("api/sitemap.js"));
    afirmar(
      "a rota do mapa NÃO decide visibilidade — nenhum Estado é mencionado nela; quem decide é `posts_no_ar()`",
      !/publicado|rascunho|agendado|arquivado|estado/i.test(codigoDoMapa) &&
        /postsNoAr\s*\(/.test(codigoDoMapa),
      (codigoDoMapa.match(/publicado|rascunho|agendado|arquivado|estado/gi) ?? []).join(" ") ||
        "não decide",
    );
    afirmar(
      "autoteste: o detector de decisão de visibilidade ACUSA um filtro plantado",
      /publicado|rascunho|agendado|arquivado|estado/i.test(
        codigoDoMapa + '\nposts.filter((p) => p.estado === "publicado")',
      ),
      "acusou",
    );
    } finally {
      await new Promise((pronto) => servidorDoMapa.close(pronto));
    }
  }

  /* ── O TIPO DO DOCUMENTO É O QUE O ENDEREÇO PROMETE ──────────────────── */
  {
    /* O MAPA PRECISA DO BANCO desde a Story 4.7. Sem ele a rota responde 500 —
       que e o comportamento certo — e a assercao de TIPO acusaria a coisa
       errada. O servidor de mentira sobe so para esta pergunta. */
    const { createServer: criarServidorDoTipo } = await import("node:http");
    const servidorDoTipo = criarServidorDoTipo((req, res) => {
      /* O corpo e CONSUMIDO e descartado: `posts_no_ar()` nao tem argumento,
         e guardar o que chega seria cerimonia copiada do molde da Story 2.12,
         onde ele importa. */
      req.resume();
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("[]");
      });
    });
    await new Promise((pronto) => servidorDoTipo.listen(0, "127.0.0.1", pronto));
    const guardadoDoTipo = {
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_CHAVE_PUBLICAVEL: process.env.SUPABASE_CHAVE_PUBLICAVEL,
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    };
    process.env.SUPABASE_URL = `http://127.0.0.1:${servidorDoTipo.address().port}`;
    process.env.SUPABASE_CHAVE_PUBLICAVEL = "sb_publishable_de_mentira";
    delete process.env.VITE_SUPABASE_URL;
    let mapa;
    try {
      mapa = await comDominio(DOMINIO, () =>
        dirigir("sitemap.js", { method: "GET", url: "/api/sitemap" }),
      );
    } finally {
      await new Promise((pronto) => servidorDoTipo.close(pronto));
      for (const [nome, valor] of Object.entries(guardadoDoTipo)) {
        if (valor === undefined) delete process.env[nome];
        else process.env[nome] = valor;
      }
    }
    /* O ÍNDICE TAMBÉM PASSOU A CONSULTAR O BANCO (Story 4.8), e pela MESMA
       função que o mapa. Sem leitura ele responde 500 — comportamento certo
       — e a asserção de TIPO acusaria a coisa errada. */
    const guardadoDoIndice = {
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_CHAVE_PUBLICAVEL: process.env.SUPABASE_CHAVE_PUBLICAVEL,
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    };
    const servidorDoIndice = criarServidorDoTipo((req, res) => {
      req.resume();
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("[]");
      });
    });
    await new Promise((pronto) => servidorDoIndice.listen(0, "127.0.0.1", pronto));
    process.env.SUPABASE_URL = `http://127.0.0.1:${servidorDoIndice.address().port}`;
    process.env.SUPABASE_CHAVE_PUBLICAVEL = "sb_publishable_de_mentira";
    delete process.env.VITE_SUPABASE_URL;
    let indice;
    try {
      indice = await comDominio(DOMINIO, () =>
        dirigir("llms.js", { method: "GET", url: "/api/llms" }),
      );
    } finally {
      await new Promise((pronto) => servidorDoIndice.close(pronto));
      for (const [nome, valor] of Object.entries(guardadoDoIndice)) {
        if (valor === undefined) delete process.env[nome];
        else process.env[nome] = valor;
      }
    }
    afirmar(
      "o mapa sai como XML e o índice como texto — HTML num endereço que promete outra coisa é silêncio com outra roupa",
      String(mapa.cabecalhos["content-type"] ?? "").startsWith("application/xml") &&
        String(indice.cabecalhos["content-type"] ?? "").startsWith("text/plain") &&
        String(mapa.corpo ?? "").startsWith("<?xml") &&
        !String(indice.corpo ?? "").includes("<html"),
      `${mapa.cabecalhos["content-type"]} | ${indice.cabecalhos["content-type"]}`,
    );
  }

  /* ── MÉTODO FORA DO VOCABULÁRIO É RECUSADO, DIZENDO QUAIS EXISTEM ────── */
  {
    const r = await dirigir("blog.js", { method: "POST", url: "/api/blog" });
    afirmar(
      "método fora do vocabulário é recusado, e a recusa DIZ quais existem",
      r.codigo === 405 && String(r.cabecalhos.allow ?? "").includes("GET"),
      `${r.codigo} | ${r.cabecalhos.allow}`,
    );
  }

  /* ══ STORY 4.8: O ÍNDICE PARA MOTORES GENERATIVOS ══════════════════════ */
  //
  // Um rastreador que quer citar o blog precisa saber O QUE EXISTE antes de
  // decidir o que buscar. O índice listava cinco páginas fixas, sem descrição
  // e sem nenhum artigo: dizia que o site existe, não dizia o que ele tem.
  {
    secao("(4.8) o índice para motores generativos");

    const paginas48 = await import(
      pathToFileURL(path.join(raiz, "api", "_nucleo", "paginasDoSite.js")).href
    );

    /* ── UM SERVIDOR, AS DUAS ROTAS ───────────────────────────────────── */
    //
    // ★ É ASSIM QUE O CRITÉRIO DE "MESMA CONSULTA" É MEDIDO ★
    //
    // Afirmar que os dois arquivos importam `postsNoAr` prova que alguém
    // escreveu o nome certo. Dirigir as DUAS rotas contra o mesmo servidor e
    // comparar os conjuntos prova que elas ENTREGAM o mesmo — que é o que o
    // critério quer dizer.

    const { createServer: criarFonteUnica } = await import("node:http");
    let postsDaFonte = [];
    const fonteUnica = criarFonteUnica((req, res) => {
      req.resume();
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(postsDaFonte));
      });
    });
    await new Promise((pronto) => fonteUnica.listen(0, "127.0.0.1", pronto));

    const comFonte = async (acao) => {
      const guardado = {};
      const ambiente = {
        VITE_DOMINIO_DO_SITE: DOMINIO,
        SUPABASE_URL: `http://127.0.0.1:${fonteUnica.address().port}`,
        SUPABASE_CHAVE_PUBLICAVEL: "sb_publishable_de_mentira",
        VITE_SUPABASE_URL: undefined,
        VITE_SUPABASE_PUBLISHABLE_KEY: undefined,
      };
      for (const [nome, valor] of Object.entries(ambiente)) {
        guardado[nome] = process.env[nome];
        if (valor === undefined) delete process.env[nome];
        else process.env[nome] = valor;
      }
      try {
        return await acao();
      } finally {
        for (const [nome, valor] of Object.entries(guardado)) {
          if (valor === undefined) delete process.env[nome];
          else process.env[nome] = valor;
        }
      }
    };

    try {
      postsDaFonte = [
        {
          slug: "como-automatizar",
          titulo: "Como automatizar o atendimento",
          resumo: "O que dá para automatizar sem parecer robô.",
          publicado_em: "2026-08-01T10:00:00.000Z",
          atualizado_em: "2026-08-05T10:00:00.000Z",
        },
        {
          slug: "sem-resumo",
          titulo: "Um artigo sem Resumo",
          resumo: null,
          publicado_em: "2026-08-02T10:00:00.000Z",
          atualizado_em: null,
        },
      ];

      const doIndice = await comFonte(() =>
        dirigir("llms.js", { method: "GET", url: "/api/llms" }),
      );
      const doMapa = await comFonte(() =>
        dirigir("sitemap.js", { method: "GET", url: "/api/sitemap" }),
      );
      const textoDoIndice = String(doIndice.corpo ?? "");

      /* ── CADA POST, COM AS TRÊS COISAS ────────────────────────────── */

      afirmar(
        "cada Post no ar aparece no índice com TÍTULO, endereço ABSOLUTO e Resumo",
        textoDoIndice.includes(
          `- [Como automatizar o atendimento](${DOMINIO}/blog/como-automatizar): O que dá para automatizar sem parecer robô.`,
        ),
        textoDoIndice.split("\n").find((l) => l.includes("como-automatizar")) ?? "ausente",
      );
      afirmar(
        "Post sem Resumo aparece com título e endereço, e SEM os dois-pontos — vazio leria como um resumo que é nada",
        textoDoIndice.includes(`- [Um artigo sem Resumo](${DOMINIO}/blog/sem-resumo)`) &&
          !textoDoIndice.includes(`${DOMINIO}/blog/sem-resumo): `),
        textoDoIndice.split("\n").find((l) => l.includes("sem-resumo")) ?? "ausente",
      );

      /* ── A HOME E A PÁGINA PILAR, COM DESCRIÇÃO ───────────────────── */
      //
      // O critério as nomeia. E a descrição é o que o torna um índice, e não
      // uma lista de endereços que o rastreador teria de buscar um a um.

      for (const caminho of ["/", "/api-oficial-whatsapp"]) {
        const daPagina = paginas48.PAGINAS_DO_SITE.find((p) => p.caminho === caminho);
        afirmar(
          `o índice traz \`${caminho}\` COM descrição — sem ela é lista de endereços, e não índice`,
          typeof daPagina?.descricao === "string" &&
            daPagina.descricao.trim() !== "" &&
            textoDoIndice.includes(`- ${DOMINIO}${caminho}: ${daPagina.descricao}`),
          textoDoIndice.split("\n").find((l) => l.startsWith(`- ${DOMINIO}${caminho}:`)) ??
            "ausente",
        );
      }
      /* E TODAS as fixas têm descrição — não só as duas que o critério nomeia. */
      const semDescricao = paginas48.PAGINAS_DO_SITE.filter(
        (p) => typeof p.descricao !== "string" || p.descricao.trim() === "",
      );
      afirmar(
        `as ${paginas48.PAGINAS_DO_SITE.length} páginas fixas têm descrição — uma sem descrição vira endereço solto no meio de uma lista descrita`,
        semDescricao.length === 0,
        semDescricao.map((p) => p.caminho).join(", ") || "todas descritas",
      );

      /* ── ★ O ÍNDICE E O MAPA LISTAM OS MESMOS POSTS ★ ─────────────── */
      //
      // Nos DOIS sentidos: um índice que listasse a mais anunciaria artigo que
      // o mapa não conhece, e um que listasse a menos esconderia artigo do
      // rastreador que confia nele.

      /* A EXTRACAO E POR OPERACAO DE STRING, e nao por expressao montada a
         partir do dominio. A primeira versao montava uma e o `$&` da
         substituicao foi interpretado na hora de escrever o arquivo — as duas
         listas sairam VAZIAS, e a assercao de igualdade passou... porque duas
         listas vazias sao iguais. Quem acusou foi o controle de vacuidade, e e
         exatamente para isso que ele existe. */
      const depoisDe = (texto, prefixo, ate) =>
        texto
          .split(prefixo)
          .slice(1)
          .map((pedaco) => pedaco.split(ate)[0])
          .filter((s) => s !== "");
      const doIndiceSlugs = depoisDe(textoDoIndice, `](${DOMINIO}/blog/`, ")");
      const doMapaSlugs = depoisDe(
        String(doMapa.corpo ?? ""),
        `<loc>${DOMINIO}/blog/`,
        "</loc>",
      );
      const soNoIndice = doIndiceSlugs.filter((s) => !doMapaSlugs.includes(s));
      const soNoMapa = doMapaSlugs.filter((s) => !doIndiceSlugs.includes(s));
      afirmar(
        "o índice e o mapa listam EXATAMENTE os mesmos Posts — mesma fonte, mesma consulta, medido por comportamento",
        doIndiceSlugs.length > 0 &&
          soNoIndice.length === 0 &&
          soNoMapa.length === 0,
        `só no índice: ${soNoIndice.join(", ") || "nenhum"} | só no mapa: ${soNoMapa.join(", ") || "nenhum"}`,
      );
      /* CONTROLE: os dois viram Posts de verdade. Duas listas vazias são
         iguais, e a asserção acima passaria por vacuidade. */
      afirmar(
        "controle: os dois viram os Posts que a fonte devolveu — duas listas vazias também seriam iguais",
        doIndiceSlugs.length === postsDaFonte.length &&
          doMapaSlugs.length === postsDaFonte.length,
        `índice ${doIndiceSlugs.length}, mapa ${doMapaSlugs.length}, fonte ${postsDaFonte.length}`,
      );

      /* ── SEM POSTS, A SEÇÃO DE ARTIGOS SOME INTEIRA ───────────────── */
      //
      // Um cabeçalho sozinho afirmaria que existe uma lista e que ela está
      // vazia, que é diferente de não afirmar.

      postsDaFonte = [];
      const vazio48 = await comFonte(() =>
        dirigir("llms.js", { method: "GET", url: "/api/llms" }),
      );
      afirmar(
        "sem Post no ar, a seção de artigos é OMITIDA inteira — cabeçalho sozinho afirmaria uma lista vazia",
        !String(vazio48.corpo ?? "").includes("## Artigos") &&
          String(vazio48.corpo ?? "").includes("## Páginas"),
        String(vazio48.corpo ?? "").slice(-80),
      );

      /* ── É TEXTO SIMPLES DE VERDADE ───────────────────────────────── */

      afirmar(
        "o índice é texto simples — sem etiqueta de HTML; servir outra coisa num endereço que promete texto é silêncio com outra roupa",
        !/<[a-z!/][^>]*>/i.test(textoDoIndice) &&
          String(doIndice.cabecalhos["content-type"] ?? "").startsWith("text/plain"),
        (textoDoIndice.match(/<[a-z!/][^>]*>/gi) ?? []).join(" ") || "sem etiquetas",
      );
      /* AUTOTESTE do detector: ele precisa acusar uma etiqueta plantada, e NÃO
         acusar o `- [título](endereço)` que o formato usa. */
      afirmar(
        "autoteste: o detector de HTML acusa `<p>` e poupa o formato de link do índice",
        /<[a-z!/][^>]*>/i.test("<p>x</p>") &&
          !/<[a-z!/][^>]*>/i.test("- [Título](https://x/blog/a): Resumo."),
        "acusou o certo",
      );

      /* ── LEITURA QUE FALHA ⇒ 500 ──────────────────────────────────── */

      const semLeitura = await (async () => {
        const guardado = process.env.SUPABASE_URL;
        const guardadoVite = process.env.VITE_SUPABASE_URL;
        process.env.SUPABASE_URL = "http://127.0.0.1:1";
        delete process.env.VITE_SUPABASE_URL;
        try {
          return await comDominio(DOMINIO, () =>
            dirigir("llms.js", { method: "GET", url: "/api/llms" }),
          );
        } finally {
          if (guardado === undefined) delete process.env.SUPABASE_URL;
          else process.env.SUPABASE_URL = guardado;
          if (guardadoVite !== undefined) process.env.VITE_SUPABASE_URL = guardadoVite;
        }
      })();
      afirmar(
        "leitura que falha derruba o índice com 500 — servir só as fixas diria ao rastreador que o blog está vazio",
        semLeitura.codigo === 500 &&
          !String(semLeitura.corpo ?? "").includes("## Páginas"),
        `${semLeitura.codigo} | ${String(semLeitura.corpo ?? "").slice(0, 60)}`,
      );

      /* ── O DIAGNÓSTICO (Story 4.10): O ÍNDICE TAMBÉM NÃO DEGRADA ─────── */

      const diagDoIndice = await import(
        pathToFileURL(path.join(raiz, "api", "_nucleo", "diagnostico.js")).href
      );
      afirmar(
        "o índice, servido com sucesso, tem `X-Entrega-Diagnostico: ok`",
        doIndice.cabecalhos["x-entrega-diagnostico"] === diagDoIndice.DIAGNOSTICO_OK,
        doIndice.cabecalhos["x-entrega-diagnostico"] ?? "ausente",
      );
      afirmar(
        "leitura que falha: o índice nomeia a causa, e o corpo continua sendo só o defeito — mesma decisão do mapa",
        semLeitura.cabecalhos["x-entrega-diagnostico"] === diagDoIndice.DIAGNOSTICO_LEITURA_FALHOU &&
          !String(semLeitura.corpo ?? "").includes("## Páginas"),
        semLeitura.cabecalhos["x-entrega-diagnostico"] ?? "ausente",
      );

      /* ── E NENHUMA DAS DUAS DECIDE VISIBILIDADE ───────────────────── */

      const codigoDoIndice = mascararComentariosJs(ler("api/llms.js"));
      afirmar(
        "a rota do índice NÃO decide visibilidade — quem decide é `posts_no_ar()`, a mesma do mapa",
        !/publicado|rascunho|agendado|arquivado|estado/i.test(codigoDoIndice) &&
          /postsNoAr\s*\(/.test(codigoDoIndice),
        (codigoDoIndice.match(/publicado|rascunho|agendado|arquivado|estado/gi) ?? []).join(" ") ||
          "não decide",
      );
    } finally {
      await new Promise((pronto) => fonteUnica.close(pronto));
    }
  }

  /* ── O CAMINHO DE LEITURA NÃO TOCA A CHAVE DE SERVIÇO ─────────────────── */
  //
  // A saída fácil da Story 4.2 seria dar à leitura do servidor a chave de
  // serviço, que enxerga tudo e dispensa política e função. Seria trocar um
  // problema pequeno por um enorme: a chave que pode ESCREVER tudo, num
  // caminho que só precisa ler — e num arquivo que ninguém releria depois.
  //
  // A lista é de PERMISSÃO e nomeada: um arquivo novo em `api/` que leia não
  // entra sozinho, e é o autor que decide adicioná-lo aqui.
  {
    const ARQUIVOS_DE_LEITURA = [
      "api/blog.js",
      "api/sitemap.js",
      "api/llms.js",
      /* Story 4.2: o módulo que fala com o banco pelas três funções da
         entrega. Ele é o que mais precisa desta asserção — é o único do grupo
         que tem motivo para querer uma chave. */
      "api/_nucleo/leitura.js",
    ];
    for (const arquivo of ARQUIVOS_DE_LEITURA) {
      const codigo = mascararComentariosJs(ler(arquivo));
      afirmar(
        `${arquivo} não menciona a chave de serviço nem instancia acesso ao banco — o caminho de leitura lê com a chave PUBLICÁVEL`,
        !/CHAVE_DE_SERVICO|acessoDoAmbiente|createClient|SERVICE_ROLE|sb_secret/.test(
          codigo,
        ),
        (codigo.match(/CHAVE_DE_SERVICO|acessoDoAmbiente|createClient|SERVICE_ROLE|sb_secret/g) ?? []).join(" ") || "não menciona",
      );
    }
    /* AUTOTESTE do detector: sem isto, um erro de digitação no padrão deixaria
       os quatro verdes para sempre sem julgar coisa nenhuma. */
    afirmar(
      "autoteste: o detector de chave de serviço ACUSA uma menção plantada",
      /CHAVE_DE_SERVICO|acessoDoAmbiente|createClient|SERVICE_ROLE|sb_secret/.test(
        "const x = process.env.SUPABASE_CHAVE_DE_SERVICO;",
      ),
      "acusou",
    );
  }

  /* ── A LISTA DE FUNÇÕES CHAMÁVEIS É FECHADA, E RECUSA ANTES DE VIAJAR ── */
  //
  // O nome da função entra na URL da chamada. Se ele pudesse vir de dado que
  // chegou da rede, o caminho de leitura viraria chamada arbitrária de função
  // — e ninguém saberia, porque o erro voltaria do banco e não daqui.
  //
  // A recusa é exercida DIRIGINDO o módulo, com um `buscar` que EXPLODE se for
  // chamado: ler o `includes` no arquivo não distingue "recusa" de "recusa
  // depois de já ter perguntado ao banco".
  {
    const leitura = await import(
      pathToFileURL(path.join(raiz, "api", "_nucleo", "leitura.js")).href
    );
    let buscou = 0;
    const buscarQueExplode = () => {
      buscou += 1;
      throw new Error("a leitura não devia ter chegado à rede");
    };
    const ambienteBom = {
      SUPABASE_URL: "https://exemplo.supabase.co",
      SUPABASE_CHAVE_PUBLICAVEL: "sb_publishable_x",
    };

    const forasteira = await leitura.chamar(
      "posts",
      {},
      { ambiente: ambienteBom, buscar: buscarQueExplode },
    );
    afirmar(
      "nome fora da lista de permissão é recusado SEM viajar — a recusa vem antes da rede, não depois do banco",
      forasteira.ok === false &&
        typeof forasteira.defeito === "string" &&
        forasteira.defeito.includes("posts") &&
        buscou === 0,
      `${JSON.stringify(forasteira).slice(0, 160)} | buscou ${buscou} vez(es)`,
    );

    /* CONTROLE POSITIVO. Sem ele, um módulo que recusasse TUDO passaria na
       asserção acima — e o caminho de leitura inteiro estaria morto. */
    buscou = 0;
    const boa = await leitura.chamar(
      leitura.FUNCOES_DA_ENTREGA[0],
      {},
      { ambiente: ambienteBom, buscar: buscarQueExplode },
    );
    afirmar(
      "controle positivo: um nome DA lista atravessa a guarda e chega a buscar — a recusa não é universal",
      buscou === 1 && boa.ok === false,
      `buscou ${buscou} vez(es) | ${JSON.stringify(boa).slice(0, 160)}`,
    );

    /* SEM AMBIENTE, TAMBÉM NÃO VIAJA. Uma leitura que sai com a URL `undefined`
       falha com erro de rede, e o registro diz "fetch failed" em vez de dizer
       que ninguém configurou o projeto. */
    buscou = 0;
    const semAmbiente = await leitura.chamar(
      leitura.FUNCOES_DA_ENTREGA[0],
      {},
      { ambiente: {}, buscar: buscarQueExplode },
    );
    afirmar(
      "sem URL e chave no ambiente a leitura devolve DEFEITO NOMEADO e não sai — `fetch failed` não diria que ninguém configurou o projeto",
      semAmbiente.ok === false &&
        semAmbiente.defeito === leitura.DEFEITO_SEM_AMBIENTE &&
        buscou === 0,
      `${JSON.stringify(semAmbiente).slice(0, 160)} | buscou ${buscou} vez(es)`,
    );
  }

  /* ── A SEGUNDA CAMADA: CONTEÚDO FORA DO AR VIRA DEFEITO, NÃO LIMPEZA ─── */
  //
  // O banco já não devolve conteúdo fora da situação no ar, e isso é provado
  // contra o projeto real em `verificar:supabase`. Esta é a SEGUNDA camada, e
  // ela existe porque este módulo é o que as Stories 4.3 em diante consomem: se
  // a função de banco for trocada por uma versão frouxa, alguém precisa gritar.
  //
  // E ela grita em vez de limpar em silêncio. Limpar deixaria o produto certo e
  // o defeito invisível — e o dia em que a limpeza tivesse um furo, ninguém
  // teria sido avisado de que ela estava trabalhando.
  {
    const leitura = await import(
      pathToFileURL(path.join(raiz, "api", "_nucleo", "leitura.js")).href
    );
    const dominio = await import(
      pathToFileURL(path.join(raiz, "src", "domain", "blog", "entrega.js")).href
    );
    const ambienteBom = {
      SUPABASE_URL: "https://exemplo.supabase.co",
      SUPABASE_CHAVE_PUBLICAVEL: "sb_publishable_x",
    };
    /** Um `buscar` que devolve a linha que o teste quiser. */
    const respondendo = (linha) => async () => ({
      ok: true,
      status: 200,
      json: async () => [linha],
    });
    const vazio = Object.fromEntries(
      dominio.CAMPOS_DE_CONTEUDO.map((c) => [c, null]),
    );

    for (const situacao of dominio.SITUACOES_SEM_CONTEUDO) {
      const limpo = await leitura.situacaoDoEndereco("um-endereco", {
        ambiente: ambienteBom,
        buscar: respondendo({ situacao, slug_atual: "outro", ...vazio }),
      });
      afirmar(
        `a situação ${situacao} sem conteúdo atravessa limpa — e o Post vem NULO, não um objeto de campos vazios`,
        limpo.ok === true && limpo.situacao === situacao && limpo.post === null,
        JSON.stringify(limpo).slice(0, 200),
      );
      const sujo = await leitura.situacaoDoEndereco("um-endereco", {
        ambiente: ambienteBom,
        buscar: respondendo({
          situacao,
          slug_atual: "outro",
          ...vazio,
          titulo: "vazou",
        }),
      });
      afirmar(
        `a situação ${situacao} COM conteúdo vira defeito nomeado — limpar em silêncio esconderia a função de banco trocada`,
        sujo.ok === false &&
          typeof sujo.defeito === "string" &&
          sujo.defeito.includes(situacao) &&
          sujo.defeito.includes("titulo"),
        JSON.stringify(sujo).slice(0, 220),
      );
    }

    /* E CADA CAMPO CONTA. A varredura acima planta `titulo` — se o filtro
       olhasse só para ele, os outros doze passariam despercebidos. */
    const escaparam = [];
    for (const campo of dominio.CAMPOS_DE_CONTEUDO) {
      const r = await leitura.situacaoDoEndereco("um-endereco", {
        ambiente: ambienteBom,
        buscar: respondendo({
          situacao: dominio.ARQUIVADO,
          slug_atual: "outro",
          ...vazio,
          [campo]: "vazou",
        }),
      });
      if (r.ok !== false || !String(r.defeito ?? "").includes(campo)) {
        escaparam.push(campo);
      }
    }
    afirmar(
      `os ${dominio.CAMPOS_DE_CONTEUDO.length} campos de conteúdo são conferidos UM A UM — um filtro que olhasse só o título deixaria os outros passarem`,
      escaparam.length === 0,
      `escaparam: ${escaparam.join(", ") || "nenhum"}`,
    );

    /* SITUAÇÃO FORA DO VOCABULÁRIO CAI NA MAIS FECHADA. O padrão silencioso
       seria tratá-la como no ar e servir o que veio junto. */
    const estranha = await leitura.situacaoDoEndereco("um-endereco", {
      ambiente: ambienteBom,
      buscar: respondendo({
        situacao: "publicado",
        slug_atual: "outro",
        ...vazio,
        titulo: "não devia aparecer",
      }),
    });
    afirmar(
      "situação fora do vocabulário fechado vira `inexistente` — e o conteúdo que veio junto não passa",
      estranha.ok === true &&
        estranha.situacao === dominio.INEXISTENTE &&
        estranha.post === null,
      JSON.stringify(estranha).slice(0, 200),
    );
  }
/* ══ STORY 4.3: OS METADADOS DA PÁGINA, SERVIDOS SEM JAVASCRIPT ═══════════ */
//
// Quem lê o link primeiro não é gente. É o gerador de prévia do WhatsApp, o do
// LinkedIn e o rastreador do Google — e nenhum executa JavaScript. Sem esta
// story, todo Post compartilhado se anuncia como a home.
//
// A maior parte do que segue dirige FUNÇÃO PURA, e não a rota: o emissor não
// tem rede, e provar a herança contra o banco gastaria uma viagem por caso
// para julgar uma decisão que é toda local. O que PRECISA da rota — o domínio
// ausente, os marcadores no shell do build, a resposta inteira — está adiante,
// e está dito qual é qual.
{
  secao("(4.3) os metadados da página, servidos sem JavaScript");

  const meta = await import(
    pathToFileURL(path.join(raiz, "api", "_nucleo", "metadados.js")).href
  );
  const shellMod = await import(
    pathToFileURL(path.join(raiz, "api", "_nucleo", "shell.js")).href
  );
  const RAIZ_DE_TESTE = "https://chatclean.com.br";

  /** Um Post de teste — só os campos que a herança consulta. */
  const postar = (extras) => ({
    titulo: "Um título qualquer",
    resumo: null,
    autor_nome: null,
    publicado_em: null,
    atualizado_em: null,
    imagem_url: null,
    imagem_alt: null,
    seo_titulo: null,
    seo_descricao: null,
    seo_imagem_url: null,
    ...extras,
  });
  const regiaoDe = (situacao, post, slug) =>
    meta.regiaoDeMetadados(
      meta.metadadosDaPagina({ situacao, post, slug, raiz: RAIZ_DE_TESTE }),
    );

  /* ── DOIS POSTS DIFERENTES DÃO METADADOS DIFERENTES ─────────────────── */
  //
  // É o criterio da story, e sozinho ele é fraco: um emissor que devolvesse o
  // título cru dos dois passaria. Vem acompanhado da metade que importa —
  // nenhum dos dois traz o da HOME.

  const regiaoA = regiaoDe(
    "no-ar",
    postar({ titulo: "Como automatizar o atendimento", resumo: "O primeiro." }),
    "automatizar-atendimento",
  );
  const regiaoB = regiaoDe(
    "no-ar",
    postar({ titulo: "Quanto custa a API Oficial", resumo: "O segundo." }),
    "quanto-custa-api",
  );
  afirmar(
    "dois Posts diferentes produzem metadados DIFERENTES — título, descrição e canônica",
    regiaoA !== regiaoB &&
      regiaoA.includes("Como automatizar o atendimento") &&
      regiaoB.includes("Quanto custa a API Oficial") &&
      regiaoA.includes("/blog/automatizar-atendimento") &&
      regiaoB.includes("/blog/quanto-custa-api"),
    `A: ${regiaoA.length} car. | B: ${regiaoB.length} car. | iguais? ${regiaoA === regiaoB}`,
  );

  /* O TEXTO DA HOME vem do `index.html`, e não de uma cópia escrita aqui: uma
     cópia compararia contra o que eu lembrei, e não contra o que é servido. */
  const doRepositorio = ler("index.html");
  const tituloDaHome = /<title>([^<]+)<\/title>/.exec(doRepositorio)?.[1] ?? "";
  afirmar(
    "controle: o `index.html` tem um título de home para comparar — senão a asserção seguinte não julga nada",
    tituloDaHome.length > 10 && tituloDaHome.includes("ChatClean"),
    tituloDaHome || "sem título",
  );
  afirmar(
    "e NENHUM dos dois traz o título da home — hoje todo Post compartilhado se anuncia como a página inicial",
    !regiaoA.includes(tituloDaHome) && !regiaoB.includes(tituloDaHome),
    tituloDaHome,
  );

  /* ── O VOCABULÁRIO DE ETIQUETAS: PRESENTE, E UMA VEZ SÓ ─────────────── */
  //
  // A lista vem do MÓDULO. Reescrevê-la aqui compararia duas cópias do mesmo
  // engano, e o dia em que alguém acrescentasse uma etiqueta ao emissor sem
  // acrescentá-la à lista, nada acusaria.

  for (const etiqueta of meta.ETIQUETAS_GOVERNADAS) {
    const quantas = regiaoA.split(etiqueta).length - 1;
    afirmar(
      `a região emite \`${etiqueta}\` — o vocabulário governado é emitido, e não só declarado`,
      quantas >= 1,
      `${quantas} ocorrência(s)`,
    );
  }
  afirmar(
    "Open Graph e Twitter Card estão presentes, com `og:type` `article` e imagem em endereço ABSOLUTO",
    /property="og:type" content="article"/.test(regiaoA) &&
      /name="twitter:card" content="summary_large_image"/.test(regiaoA) &&
      /property="og:image" content="https:\/\//.test(regiaoA) &&
      /name="twitter:image" content="https:\/\//.test(regiaoA),
    regiaoA.slice(0, 200),
  );

  /* ── O ESCAPE, POR TABELA FECHADA ───────────────────────────────────── */
  //
  // Um título com `</title>` fecharia a etiqueta e o resto do documento viraria
  // texto. Um com aspas quebraria o atributo. Não é hipótese: o Título é campo
  // livre, e a Story 2.12 já provou que Post hostil chega ao banco.

  const hostil = regiaoDe(
    "no-ar",
    postar({
      titulo: `Aspas " e & e </title><script>alerta()</script> e \u0027simples\u0027`,
      resumo: "Descrição com \u0022aspas\u0022 & sinais.",
    }),
    "post-hostil",
  );
  afirmar(
    "título hostil sai ESCAPADO — a região tem exatamente um `<title>`, e o `</title>` do texto não o fecha",
    hostil.split("<title>").length - 1 === 1 &&
      hostil.split("</title>").length - 1 === 1 &&
      !hostil.includes("<script>alerta"),
    `<title>: ${hostil.split("<title>").length - 1} | </title>: ${hostil.split("</title>").length - 1}`,
  );
  afirmar(
    "e o atributo não é quebrado por aspa — a descrição hostil vira entidade, não fim de atributo",
    /content="[^"]*&quot;[^"]*"/.test(hostil) && /&amp;/.test(hostil),
    (hostil.match(/&quot;|&amp;|&lt;|&gt;|&#39;/g) ?? []).slice(0, 6).join(" "),
  );

  /* AUTOTESTE do escapador, nos CINCO caracteres da tabela. Sem ele, um
     escapador que só trocasse aspas deixaria as duas asserções acima verdes
     — a de cima não testa `&`, e a de baixo não testa `<`. */
  const TABELA = [
    ["&", "&amp;"],
    ["<", "&lt;"],
    [">", "&gt;"],
    ['"', "&quot;"],
    ["\u0027", "&#39;"],
  ];
  const naoEscaparam = TABELA.filter(([c, esperado]) => meta.escapar(c) !== esperado);
  afirmar(
    `autoteste: o escapador troca os ${TABELA.length} caracteres da tabela, um a um`,
    naoEscaparam.length === 0,
    naoEscaparam.map(([c]) => c).join(" ") || "os cinco",
  );
  /* E O `&` VEM PRIMEIRO. Trocá-lo depois de `<` produziria `&amp;lt;` — o
     texto apareceria com a entidade à mostra, e nada acusaria. */
  afirmar(
    "e o `&` é trocado PRIMEIRO — `&lt;` sairia como `&amp;lt;` se a ordem fosse a outra",
    meta.escapar("<") === "&lt;" && meta.escapar("&lt;") === "&amp;lt;",
    `${meta.escapar("<")} | ${meta.escapar("&lt;")}`,
  );

  /* ── DESCRIÇÃO AUSENTE OMITE A ETIQUETA ─────────────────────────────── */
  //
  // O Épico 3 manda a descrição ficar ausente quando não há Resumo, "sem
  // inventar texto" — e uma descrição em branco é texto inventado com zero
  // letras: o rastreador a lê como declaração de que a página não tem resumo.

  const semDescricao = regiaoDe(
    "no-ar",
    postar({ titulo: "Post sem resumo nenhum", resumo: null, seo_descricao: null }),
    "sem-resumo",
  );
  afirmar(
    "sem Resumo e sem Descrição SEO, a etiqueta de descrição é OMITIDA — nunca emitida em branco",
    !semDescricao.includes('name="description"') &&
      !/og:description|twitter:description/.test(semDescricao),
    (semDescricao.match(/description/g) ?? []).join(" ") || "omitida",
  );
  /* CONTROLE POSITIVO. Sem ele, um emissor que nunca emitisse descrição
     passaria — e a página perderia a descrição em todo Post. */
  afirmar(
    "controle positivo: COM Resumo a descrição é emitida — a omissão acima não é o emissor calado",
    regiaoA.includes('name="description"') &&
      /og:description/.test(regiaoA) &&
      /twitter:description/.test(regiaoA),
    (regiaoA.match(/description/g) ?? []).length + " ocorrência(s)",
  );

  /* ── NADA FORA DO AR VAZA ───────────────────────────────────────────── */
  //
  // É a regra do épico: nada que não está publicado tem metadado exposto por
  // nenhum caminho servido. A varredura passa pelas TRÊS situações que a Story
  // 4.2 declara fora do ar, e a lista vem do domínio — acrescentar uma quarta
  // situação sem decidir de que lado ela fica não passa despercebido.

  const dominioDaEntrega = await import(
    pathToFileURL(path.join(raiz, "src", "domain", "blog", "entrega.js")).href
  );
  const TITULO_SECRETO = "Rascunho que nao pode vazar de jeito nenhum";
  for (const situacao of dominioDaEntrega.SITUACOES_SEM_CONTEUDO) {
    /* O Post é passado MESMO ASSIM — é o caso perigoso. A leitura da 4.2 já
       devolve `post: null` fora do ar; se um dia devolvesse a linha, o emissor
       não pode ser a segunda porta por onde ela sai. */
    const regiao = regiaoDe(
      situacao,
      postar({ titulo: TITULO_SECRETO, resumo: TITULO_SECRETO }),
      "endereco-qualquer",
    );
    afirmar(
      `situação ${situacao}: NENHUM metadado do Post aparece — nem título, nem descrição`,
      !regiao.includes(TITULO_SECRETO),
      regiao.includes(TITULO_SECRETO) ? "VAZOU" : "não vazou",
    );
    afirmar(
      `situação ${situacao}: \`og:type\` volta a \`website\` — declarar \`article\` afirmaria que há artigo ali`,
      /property="og:type" content="website"/.test(regiao),
      /og:type" content="([^"]*)"/.exec(regiao)?.[1] ?? "ausente",
  );
  }

  /* ── A CANÔNICA NÃO SAI DA REQUISIÇÃO ───────────────────────────────── */
  //
  // Numa rota reescrita o caminho que chega é o da FUNÇÃO. Derivar a canônica
  // dali produziria `/api/blog` — um endereço que o visitante nunca vê e que o
  // rastreador passaria a considerar o oficial.

  const canonicaDe = (regiao) => /rel="canonical" href="([^"]*)"/.exec(regiao)?.[1] ?? "";
  const todasAsRegioes = [regiaoA, regiaoB, hostil, semDescricao];
  afirmar(
    "nenhuma canônica aponta para o caminho da FUNÇÃO — `/api/blog` é o endereço que o visitante nunca vê",
    todasAsRegioes.every((r) => !r.includes("/api/")),
    todasAsRegioes.map(canonicaDe).join(" | "),
  );
  /* AUTOTESTE do detector: a MESMA condição, sobre uma região com `/api/`
     plantado, precisa dar falso. Sem isto, um `every` sobre lista vazia — ou
     um detector que procurasse a palavra errada — ficaria verde para sempre. */
  const comApiPlantado = [
    `${regiaoA}\n    <link rel="canonical" href="https://chatclean.com.br/api/blog" />`,
  ];
  afirmar(
    "autoteste: o detector de canônica de função ACUSA um `/api/` plantado",
    comApiPlantado.every((r) => !r.includes("/api/")) === false,
    "acusou",
  );

  /* ★ E O SLUG VEM DO BANCO, E NÃO DA URL ★
     `?slug=` traz o que o visitante digitou, que pode ser um APOSENTADO. A
     canônica de um aposentado é o endereço de HOJE — é para isso que a leitura
     da 4.2 devolve `slug_atual`. Usar o da URL faria dois endereços se
     declararem canônicos um do outro, e o rastreador escolheria. */
  const doAposentado = meta.metadadosDaPagina({
    situacao: "no-ar",
    post: postar({ titulo: "O artigo mudou de endereço", resumo: "Sim." }),
    slug: "endereco-de-hoje",
    raiz: RAIZ_DE_TESTE,
  });
  afirmar(
    "a canônica é montada com o slug que o BANCO devolveu — o endereço aposentado da URL não vira canônica",
    doAposentado.canonica === `${RAIZ_DE_TESTE}/blog/endereco-de-hoje`,
    doAposentado.canonica,
  );

  /* ── OS MARCADORES, NO SHELL QUE É SERVIDO ──────────────────────────── */
  //
  // No `dist/index.html`, e não no do repositório: é o `dist` que a função
  // embute e serve. Um marcador que o build comesse deixaria a troca falhar em
  // produção com a asserção verde.

  const distHtml = ler("dist/index.html");
  for (const [nome, marca] of [
    ["INICIO", meta.MARCA_INICIO],
    ["FIM", meta.MARCA_FIM],
  ]) {
    const quantos = distHtml.split(marca).length - 1;
    afirmar(
      `o marcador de ${nome} existe no \`dist/index.html\` — e UMA vez só, senão a região é ambígua`,
      quantos === 1,
      `${quantos} ocorrência(s)`,
    );
  }
  afirmar(
    "e o INÍCIO vem antes do FIM — invertidos, o corte sairia com comprimento negativo",
    distHtml.indexOf(meta.MARCA_INICIO) < distHtml.indexOf(meta.MARCA_FIM),
    `${distHtml.indexOf(meta.MARCA_INICIO)} < ${distHtml.indexOf(meta.MARCA_FIM)}`,
  );

  /* ★ NADA GOVERNADO FICOU DE FORA DA REGIÃO ★
     É a assercão que sustenta a decisão de projeto inteira. Uma `og:title`
     esquecida ABAIXO do marcador de fim sobreviveria à troca, e o rastreador
     leria duas: a do Post e a da home. O emissor não teria como saber. */
  const iIni = distHtml.indexOf(meta.MARCA_INICIO);
  const iFim = distHtml.indexOf("-->", distHtml.indexOf(meta.MARCA_FIM));
  const foraDaRegiaoDoDist =
    distHtml.slice(0, iIni) + distHtml.slice(iFim + 3);
  const escaparam = meta.ETIQUETAS_GOVERNADAS.filter((e) =>
    foraDaRegiaoDoDist.includes(e),
  );
  afirmar(
    `nenhuma das ${meta.ETIQUETAS_GOVERNADAS.length} etiquetas governadas vive FORA da região — sobreviveria à troca, ao lado da do Post`,
    escaparam.length === 0,
    `escaparam: ${escaparam.join(", ") || "nenhuma"}`,
  );
  /* AUTOTESTE: a varredura precisa acusar uma etiqueta plantada do lado de
     fora. Sem isto, um recorte errado da região deixaria tudo verde. */
  afirmar(
    "autoteste: a varredura ACUSA uma etiqueta governada plantada fora da região",
    meta.ETIQUETAS_GOVERNADAS.filter((e) =>
      (foraDaRegiaoDoDist + '<meta property="og:title" content="x" />').includes(e),
    ).length === 1,
    "acusou",
  );

  /* ── MARCADOR AUSENTE É DEFEITO, NÃO RECURSO ────────────────────────── */
  //
  // Devolver o shell intacto seria a página do Post anunciando a home, com
  // sucesso e sem rastro. A ausência é INJETADA — esta ferramenta tem asserção
  // de que não grava arquivo, e a Story 4.1 já pagou esse preço.

  const casos = [
    ["shell sem marcador nenhum", "<html><head></head></html>"],
    ["shell só com o INÍCIO", `<html>${meta.MARCA_INICIO} --></html>`],
    [
      "shell com o INÍCIO repetido — região ambígua",
      `${meta.MARCA_INICIO} -->a${meta.MARCA_INICIO} -->b${meta.MARCA_FIM} -->`,
    ],
    [
      "shell com o FIM antes do INÍCIO",
      `${meta.MARCA_FIM} -->x${meta.MARCA_INICIO} -->`,
    ],
  ];
  for (const [nome, html] of casos) {
    const r = shellMod.trocarRegiao(html, regiaoA, {
      inicio: meta.MARCA_INICIO,
      fim: meta.MARCA_FIM,
    });
    afirmar(
      `${nome}: a troca devolve DEFEITO NOMEADO — servir o shell intacto entregaria a home em todo Post`,
      r.ok === false && r.defeito === shellMod.DEFEITO_SEM_MARCADORES,
      JSON.stringify(r).slice(0, 120),
    );
  }
  /* CONTROLE POSITIVO: o shell de verdade atravessa. Sem ele, uma troca que
     recusasse TUDO passaria nos quatro casos acima com a rota morta. */
  const bom = shellMod.trocarRegiao(distHtml, regiaoA, {
    inicio: meta.MARCA_INICIO,
    fim: meta.MARCA_FIM,
  });
  afirmar(
    "controle positivo: o `dist/index.html` de verdade atravessa a troca — a recusa não é universal",
    bom.ok === true && bom.html.includes("Como automatizar o atendimento"),
    bom.ok ? `${bom.html.length} caracteres` : bom.defeito,
  );
  /* E O SHELL NÃO É DANIFICADO: os ativos com hash do build continuam lá, um a
     um, e o contêiner da aplicação também. Trocar o miolo do `<head>` não pode
     custar o `<script>` — a página carregaria em branco. */
  const shellLido = await shellMod.lerShell();
  const ativosPerdidos = (shellLido.ativos ?? []).filter(
    (a) => !bom.ok || !bom.html.includes(a),
  );
  afirmar(
    `depois da troca, os ${(shellLido.ativos ?? []).length} ativo(s) com hash do build continuam presentes, um a um`,
    (shellLido.ativos ?? []).length > 0 && ativosPerdidos.length === 0,
    `perdidos: ${ativosPerdidos.join(", ") || "nenhum"}`,
  );
  afirmar(
    "e o contêiner da aplicação sobreviveu — sem ele a página responde 200 e fica em branco",
    bom.ok === true && /id="root"/.test(bom.html),
    bom.ok && /id="root"/.test(bom.html) ? "presente" : "AUSENTE",
  );

  /* ── SEM DOMÍNIO CANÔNICO, A ROTA FALHA ALTO ────────────────────────── */
  //
  // Esta é da ROTA, e não do emissor: é ela que lê o ambiente. A alternativa
  // seria emitir canônica relativa, que rastreador nenhum resolve para o lugar
  // certo — e o sintoma seria um artigo que nunca indexa, sem nada acusando.

  /* ══ STORY 4.4: O CORPO DO ARTIGO, LEGÍVEL SEM JAVASCRIPT ══════════════ */
  //
  // A 4.3 fez o artigo se ANUNCIAR. Esta faz ele ser LIDO: um rastreador de
  // motor generativo que quer citar o artigo precisa do texto no HTML, e até
  // aqui recebia um contêiner vazio e ia embora.

  const artigo = await import(
    pathToFileURL(path.join(raiz, "api", "_nucleo", "artigo.js")).href
  );
  const renderizador = await import(
    pathToFileURL(path.join(raiz, "src", "render", "blog", "paraHtml.js")).href
  );

  /* ── O VOCABULÁRIO É O DO RENDERIZADOR, E NÃO UMA CÓPIA ─────────────── */
  //
  // Uma terceira cópia da lista compararia duas versões do mesmo engano: o dia
  // em que o vocabulário encolhesse, a cópia continuaria aceitando o que saiu
  // dele. A comparação é de IDENTIDADE — é a mesma lista, e não uma igual.

  afirmar(
    "a conferência usa AS MESMAS listas do renderizador — identidade, e não cópia com o mesmo conteúdo",
    artigo.ETIQUETAS_ACEITAS === renderizador.ETIQUETAS_EMITIDAS &&
      artigo.ATRIBUTOS_ACEITOS === renderizador.ATRIBUTOS_EMITIDOS,
    `${artigo.ETIQUETAS_ACEITAS === renderizador.ETIQUETAS_EMITIDAS} | ${artigo.ATRIBUTOS_ACEITOS === renderizador.ATRIBUTOS_EMITIDOS}`,
  );

  /* ── CADA ETIQUETA DO VOCABULÁRIO PASSA, UMA A UMA ──────────────────── */
  //
  // Sem esta metade, uma conferência que recusasse TUDO passaria em todas as
  // recusas abaixo — e o blog inteiro ficaria sem corpo servido, verde.

  const etiquetasRecusadas = renderizador.ETIQUETAS_EMITIDAS.filter((e) => {
    const html = ["hr", "br"].includes(e) ? `<${e} />` : `<${e}>texto</${e}>`;
    return !artigo.conferirConteudo(html).ok;
  });
  afirmar(
    `controle positivo: as ${renderizador.ETIQUETAS_EMITIDAS.length} etiquetas do vocabulário ATRAVESSAM a conferência, uma a uma`,
    etiquetasRecusadas.length === 0,
    `recusadas: ${etiquetasRecusadas.join(", ") || "nenhuma"}`,
  );
  const atributosRecusados = renderizador.ATRIBUTOS_EMITIDOS.filter(
    (a) => !artigo.conferirConteudo(`<a ${a}="v">x</a>`).ok,
  );
  afirmar(
    `controle positivo: os ${renderizador.ATRIBUTOS_EMITIDOS.length} atributos do vocabulário atravessam, um a um`,
    atributosRecusados.length === 0,
    `recusados: ${atributosRecusados.join(", ") || "nenhum"}`,
  );

  /* ── E AS FORASTEIRAS SÃO RECUSADAS, NOMEANDO O QUE ────────────────── */
  //
  // A lista de casos é NOMEADA e inclui a que já passou de verdade: a Story
  // 2.5 registrou `<a/onclick=`, porque barra é separador de atributo válido em
  // HTML e a defesa de então era lista de proibição.

  const FORASTEIRAS = [
    ["script", "<script>alerta()</script>"],
    ["iframe", "<IFRAME src=x></IFRAME>"],
    ["noscript — fecharia o contêiner e derramaria o documento", "<p>a</p><noscript>x</noscript>"],
    ["fechamento de noscript solto", "<p>a</p></noscript><p>b</p>"],
    ["h1 — o do artigo é o título, e a 4.6 cobra um por página", "<h1>Título</h1>"],
    ["style — passava quando a defesa era proibição de padrões", `<p style="position:fixed;inset:0">x</p>`],
    ["onclick com aspas", `<a onclick="x()">l</a>`],
    ["a barra que passou na Story 2.5", "<a/onclick=x>l</a>"],
    ["maiúsculas", "<ScRiPt>x</ScRiPt>"],
    ["comentário HTML", "<!-- escondido -->"],
    ["`<` solto — HTML gravado sem escape", "<p>5 < 6</p>"],
  ];
  const passaram = FORASTEIRAS.filter(([, html]) => artigo.conferirConteudo(html).ok);
  afirmar(
    `as ${FORASTEIRAS.length} formas forasteiras são RECUSADAS pela lista de permissão — inclusive a que passou na Story 2.5`,
    passaram.length === 0,
    `passaram: ${passaram.map(([n]) => n).join(" | ") || "nenhuma"}`,
  );
  /* E A RECUSA DIZ O QUE FOI. Uma recusa muda faz a próxima pessoa desconfiar
     do Post errado — e o Conteúdo torto continuaria no banco. */
  const semNome = FORASTEIRAS.filter(
    ([, html]) => typeof artigo.conferirConteudo(html).defeito !== "string",
  );
  afirmar(
    "e cada recusa vem com defeito NOMEADO — recusa muda faz desconfiar do Post errado",
    semNome.length === 0,
    `sem nome: ${semNome.map(([n]) => n).join(" | ") || "nenhuma"}`,
  );

  /* ── O CORPO VIVE EM `<noscript>`, ANTES DO CONTÊINER ───────────────── */
  //
  // Isto é o critério de CLS, e ele é resolvido por CONSTRUÇÃO: com JavaScript
  // ligado o navegador não renderiza o conteúdo de `<noscript>` — ele nem entra
  // no layout. Duplicação, piscada e deslocamento não são evitados com cuidado;
  // não podem acontecer. A posição é MEDIDA no documento servido.

  const CONTEUDO = "<h2>Um subtítulo</h2><p>Texto do artigo com <strong>ênfase</strong>.</p>";
  const postComCorpo = {
    titulo: "O artigo que precisa ser lido",
    resumo: "Um resumo.",
    conteudo_html: CONTEUDO,
    autor_nome: null,
    publicado_em: null,
    atualizado_em: null,
    imagem_url: null,
    imagem_alt: null,
    seo_titulo: null,
    seo_descricao: null,
    seo_imagem_url: null,
  };
  const corpoNoAr = artigo.corpoDoArtigo({
    situacao: "no-ar",
    post: postComCorpo,
    canonica: "https://chatclean.com.br/blog/o-artigo",
  });
  afirmar(
    "o Conteúdo do Post aparece no corpo servido, com a estrutura que foi gravada",
    corpoNoAr.defeito === null && corpoNoAr.html.includes(CONTEUDO),
    corpoNoAr.defeito ?? `${corpoNoAr.html.length} caracteres`,
  );
  afirmar(
    "e ele vem envolvido na classe `.artigo` — a mesma aparência do editor e do site",
    /<article class="artigo">/.test(corpoNoAr.html),
    corpoNoAr.html.slice(0, 80),
  );
  afirmar(
    "e DENTRO de `<noscript>` — com JavaScript ligado o navegador nem o coloca no layout",
    corpoNoAr.html.indexOf("<noscript>") !== -1 &&
      corpoNoAr.html.indexOf("<noscript>") < corpoNoAr.html.indexOf(CONTEUDO) &&
      corpoNoAr.html.indexOf(CONTEUDO) < corpoNoAr.html.indexOf("</noscript>"),
    `noscript em ${corpoNoAr.html.indexOf("<noscript>")}, conteúdo em ${corpoNoAr.html.indexOf(CONTEUDO)}`,
  );

  /* ── O JSON-LD CARREGA O MESMO TEXTO ────────────────────────────────── */
  //
  // `articleBody` deriva do MESMO HTML, e não de uma segunda coluna: duas
  // fontes do mesmo texto divergiriam na primeira edição, e o dado estruturado
  // passaria a citar uma versão que a página não mostra. A comparação é de
  // CONTEÚDO — conferir presença deixaria um `articleBody` vazio passar.

  const blocoLd = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(
    corpoNoAr.html,
  )?.[1];
  let dados = null;
  try {
    dados = JSON.parse(String(blocoLd ?? "").replace(/<\\\//g, "</"));
  } catch {
    dados = null;
  }
  afirmar(
    "o corpo servido traz um JSON-LD de artigo, e ele é JSON VÁLIDO",
    dados !== null && dados["@type"] === "Article",
    dados === null ? String(blocoLd ?? "").slice(0, 120) : dados["@type"],
  );
  afirmar(
    "e `articleBody` é O MESMO TEXTO do corpo — derivado do mesmo HTML, não de uma segunda coluna",
    dados?.articleBody === artigo.textoDoConteudo(CONTEUDO) &&
      String(dados?.articleBody ?? "").includes("Texto do artigo com ênfase."),
    JSON.stringify(dados?.articleBody ?? "").slice(0, 140),
  );
  /* E O TEXTO NÃO EMENDA PALAVRAS. `…subtítulo</h2><p>Texto…` viraria
     `subtítuloTexto` se o fim de bloco não virasse separador — e o rastreador
     citaria uma palavra que não existe. */
  afirmar(
    "e o texto puro não EMENDA o fim de um bloco no começo do seguinte",
    !String(dados?.articleBody ?? "").includes("subtítuloTexto"),
    JSON.stringify(dados?.articleBody ?? "").slice(0, 100),
  );
  /* E `</script>` NÃO FECHA O BLOCO. Um Conteúdo com essa sequência quebraria
     o JSON-LD e derramaria o resto na página. */
  afirmar(
    "e a serialização não deixa `</` fechar o bloco — a sequência sai escapada",
    !/<\/script>/.test(String(blocoLd ?? "")),
    "não fecha",
  );

  /* ── SEM CONTEÚDO, NÃO SE DECLARA ARTIGO ───────────────────────────── */
  //
  // Um `articleBody` vazio afirmaria que o artigo existe e não tem texto, que é
  // diferente de não afirmar. E o corpo vazio é resposta LEGÍTIMA, não defeito.

  for (const [nome, valor] of [
    ["coluna nula", null],
    ["coluna vazia", ""],
    ["só espaços", "   "],
  ]) {
    const r = artigo.corpoDoArtigo({
      situacao: "no-ar",
      post: { ...postComCorpo, conteudo_html: valor },
      canonica: "https://chatclean.com.br/blog/x",
    });
    afirmar(
      `Post sem Conteúdo (${nome}): região VAZIA e sem defeito — e nenhum JSON-LD de artigo`,
      r.html === "" && r.defeito === null,
      `${JSON.stringify(r.html).slice(0, 60)} | ${r.defeito ?? "sem defeito"}`,
    );
  }

  /* ── CONTEÚDO TORTO OMITE O CORPO E DEIXA RASTRO ───────────────────── */
  //
  // Derrubar a rota por um registro torto tiraria TODOS os artigos do ar;
  // servir HTML desconhecido é pior que os dois. Omitir deixa a página
  // funcionando no navegador e registra o defeito para quem for consertar.

  const torto = artigo.corpoDoArtigo({
    situacao: "no-ar",
    post: { ...postComCorpo, conteudo_html: "<p>ok</p><script>mau()</script>" },
    canonica: "https://chatclean.com.br/blog/x",
  });
  afirmar(
    "Conteúdo fora do vocabulário: o corpo é OMITIDO e o defeito é NOMEADO — nem serve, nem cala",
    torto.html === "" &&
      typeof torto.defeito === "string" &&
      torto.defeito.includes("script"),
    `${JSON.stringify(torto.html)} | ${torto.defeito ?? "sem defeito"}`,
  );

  /* ── NADA FORA DO AR TEM CORPO ─────────────────────────────────────── */
  //
  // Mesma regra da 4.3, e o Post é passado MESMO ASSIM — é o caso perigoso.

  for (const situacao of dominioDaEntrega.SITUACOES_SEM_CONTEUDO) {
    const r = artigo.corpoDoArtigo({
      situacao,
      post: postComCorpo,
      canonica: "https://chatclean.com.br/blog/x",
    });
    afirmar(
      `situação ${situacao}: NENHUM Conteúdo aparece no corpo servido`,
      r.html === "" && !r.html.includes("Texto do artigo"),
      JSON.stringify(r.html).slice(0, 80),
    );
  }

  /* ── OS MARCADORES DO CORPO, NO SHELL QUE É SERVIDO ─────────────────── */

  for (const [nome, marca] of [
    ["INICIO", artigo.MARCA_CORPO_INICIO],
    ["FIM", artigo.MARCA_CORPO_FIM],
  ]) {
    const quantos = distHtml.split(marca).length - 1;
    afirmar(
      `o marcador de corpo ${nome} existe no \`dist/index.html\` — e UMA vez só`,
      quantos === 1,
      `${quantos} ocorrência(s)`,
    );
  }
  /* ★ E A REGIÃO DO CORPO VEM ANTES DO CONTÊINER ★
     Depois dele, o corpo servido entraria no documento abaixo da aplicação — e
     um rastreador que corta a leitura poderia não chegar nele. */
  afirmar(
    "e a região do corpo vem ANTES do contêiner da aplicação, no documento servido",
    distHtml.indexOf(artigo.MARCA_CORPO_INICIO) !== -1 &&
      distHtml.indexOf(artigo.MARCA_CORPO_INICIO) < distHtml.indexOf('id="root"'),
    `corpo em ${distHtml.indexOf(artigo.MARCA_CORPO_INICIO)}, contêiner em ${distHtml.indexOf('id="root"')}`,
  );

  /* ── O `robots.txt` CONTINUA AUTORIZANDO OS CINCO ──────────────────── */
  //
  // O critério da story. Eles já estavam lá; o que faltava era a asserção — e
  // sem ela, uma limpeza de arquivo os removeria sem nada acusar.

  const robots = ler("public/robots.txt");
  const RASTREADORES_DE_IA = [
    "GPTBot",
    "ChatGPT-User",
    "Google-Extended",
    "PerplexityBot",
    "ClaudeBot",
  ];
  /* O detector exige `User-agent: X` seguido de `Allow`. Procurar só o NOME
     passaria com ele sob um `Disallow: /` — que é o oposto do critério. */
  const autorizado = (texto, nome) =>
    new RegExp(
      `User-agent:\\s*${nome}\\s*\\n\\s*Allow:\\s*/`,
      "i",
    ).test(texto);
  for (const nome of RASTREADORES_DE_IA) {
    afirmar(
      `\`robots.txt\` continua autorizando ${nome} — é ele que cita o artigo`,
      autorizado(robots, nome),
      autorizado(robots, nome) ? "Allow" : "NÃO autorizado",
    );
  }
  /* AUTOTESTE: o detector precisa ACUSAR um `Disallow`. Sem isto, um padrão
     que só procurasse o nome deixaria os cinco verdes sob bloqueio. */
  afirmar(
    "autoteste: o detector ACUSA um rastreador sob `Disallow` — procurar só o nome passaria sob bloqueio",
    autorizado("User-agent: GPTBot\nAllow: /", "GPTBot") === true &&
      autorizado("User-agent: GPTBot\nDisallow: /", "GPTBot") === false,
    "acusou",
  );

  /* ── E A ROTA INTEIRA, DIRIGIDA ─────────────────────────────────────── */
  //
  // O que veio acima julga o emissor. Esta julga o DOCUMENTO: a região do corpo
  // existe nele, está vazia para a listagem, e o contêiner sobreviveu.

  const daListagem = await comDominio(DOMINIO, () =>
    dirigir("blog.js", { method: "GET", url: "/api/blog" }),
  );
  afirmar(
    "a listagem `/blog` não traz corpo de artigo nenhum — e o contêiner da aplicação continua lá",
    daListagem.codigo === 200 &&
      !String(daListagem.corpo ?? "").includes('<article class="artigo">') &&
      /id="root"/.test(String(daListagem.corpo ?? "")),
    `${daListagem.codigo} | ${String(daListagem.corpo ?? "").length} caracteres`,
  );

  /* ══ STORY 4.6: DADOS ESTRUTURADOS E UM `h1` POR PÁGINA ════════════════ */
  //
  // O artigo servido tinha texto e NENHUM título: `h1` está fora do vocabulário
  // do renderizador desde a Story 2.5, então o corpo abria direto no primeiro
  // parágrafo. O rastreador recebia o artigo decapitado — sabia o que estava
  // escrito, não sabia do que se tratava.
  //
  // E é a MESMA ausência que torna a garantia possível: o Autor não consegue
  // escrever um `h1`, então o emissor pode pôr exatamente um e não existe
  // caminho pelo qual apareça um segundo. Estrutural, e não disciplina.
  {
    secao("(4.6) os dados estruturados do artigo, e o único `h1`");

    const artigo46 = await import(
      pathToFileURL(path.join(raiz, "api", "_nucleo", "artigo.js")).href
    );
    const meta46 = await import(
      pathToFileURL(path.join(raiz, "api", "_nucleo", "metadados.js")).href
    );
    const render46 = await import(
      pathToFileURL(path.join(raiz, "src", "render", "blog", "paraHtml.js")).href
    );
    const entrega46 = await import(
      pathToFileURL(path.join(raiz, "src", "domain", "blog", "entrega.js")).href
    );
    const RAIZ_46 = "https://chatclean.com.br";

    const postCompleto = {
      titulo: "O artigo que precisa de um título",
      resumo: "A descrição que vem do Resumo.",
      conteudo_html: "<h2>Um subtítulo</h2><p>O texto do artigo.</p>",
      autor_nome: "Felix",
      publicado_em: "2026-08-01T12:00:00.000Z",
      atualizado_em: "2026-08-05T12:00:00.000Z",
      imagem_url: "https://chatclean.com.br/capa.png",
      imagem_alt: "A capa do artigo",
      seo_titulo: null,
      seo_descricao: null,
      seo_imagem_url: null,
    };
    const corpoDe = (post, situacao = entrega46.NO_AR) => {
      const pg = meta46.metadadosDaPagina({
        situacao,
        post,
        slug: "o-artigo",
        raiz: RAIZ_46,
      });
      return {
        pagina: pg,
        ...artigo46.corpoDoArtigo({
          situacao,
          post,
          canonica: pg.canonica,
          pagina: pg,
        }),
      };
    };
    const ldDe = (html) => {
      const bruto = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(
        String(html ?? ""),
      )?.[1];
      try {
        return JSON.parse(String(bruto ?? "").replace(/<\\\//g, "</"));
      } catch {
        return null;
      }
    };

    const doArtigo = corpoDe(postCompleto);

    /* ── O CONTEÚDO NÃO PODE COMPETIR PELO `h1` ─────────────────────────── */
    //
    // As DUAS metades: a lista não tem `h1`, e a conferência recusa um plantado.
    // A primeira sozinha é uma lista que ninguém aplica; a segunda sozinha não
    // diz de onde vem a regra.

    afirmar(
      "`h1` está FORA do vocabulário do renderizador — é o que torna o único `h1` da página uma garantia estrutural, e não disciplina",
      !render46.ETIQUETAS_EMITIDAS.includes("h1"),
      render46.ETIQUETAS_EMITIDAS.join(", "),
    );
    /* E A CONFERÊNCIA APLICA. A lista sozinha é uma lista que ninguém consulta;
       a recusa sozinha não diz de onde vem a regra. As duas juntas fecham. */
    afirmar(
      "e a conferência da Story 4.4 RECUSA um `<h1>` plantado no Conteúdo — o Autor não consegue escrever um segundo",
      artigo46.conferirConteudo("<h1>Um título</h1>").ok === false &&
        String(artigo46.conferirConteudo("<h1>x</h1>").defeito ?? "").includes("h1"),
      String(artigo46.conferirConteudo("<h1>x</h1>").defeito ?? "").slice(0, 80),
    );

    /* ── UM `h1`, E É O TÍTULO DO POST ──────────────────────────────────── */

    const quantosH1 = (html) => (String(html ?? "").match(/<h1[\s>]/gi) ?? []).length;
    afirmar(
      "o corpo servido traz EXATAMENTE um `h1`",
      quantosH1(doArtigo.html) === 1,
      `${quantosH1(doArtigo.html)} ocorrência(s)`,
    );
    afirmar(
      "e ele é o TÍTULO do Post — o rastreador precisa saber do que o artigo trata, não só o que está escrito",
      new RegExp(`<h1>${postCompleto.titulo}</h1>`).test(doArtigo.html),
      /<h1>([^<]*)<\/h1>/.exec(doArtigo.html)?.[1] ?? "ausente",
    );
    afirmar(
      "e ele vem ANTES do conteúdo, dentro do `<article class=\"artigo\">`",
      doArtigo.html.indexOf("<h1>") > doArtigo.html.indexOf('<article class="artigo">') &&
        doArtigo.html.indexOf("<h1>") < doArtigo.html.indexOf("<h2>"),
      `article ${doArtigo.html.indexOf('<article class="artigo">')}, h1 ${doArtigo.html.indexOf("<h1>")}, h2 ${doArtigo.html.indexOf("<h2>")}`,
    );

    /* E O TÍTULO É ESCAPADO pela MESMA tabela da Story 4.3. Um título com
       `</h1>` fecharia a etiqueta e derramaria o resto na página. */
    const hostil46 = corpoDe({
      ...postCompleto,
      titulo: `Aspas " e & e </h1><script>x()</script>`,
    });
    /* ★ A ASSERÇÃO MEDE O `h1`, E NÃO O BLOCO INTEIRO ★
       A primeira versão procurava `<script>x()` no documento todo e falhava —
       com razão, e por um motivo que vale escrever: o título hostil aparece
       LITERALMENTE dentro do JSON-LD, como DADO da chave `headline`, e ali ele
       é inofensivo. O que fecharia o bloco é `</script`, e essa sequência já é
       neutralizada desde a Story 4.4. Procurar a forma errada teria me feito
       "consertar" um escape que já estava certo. */
    const oH1Hostil = /<h1>([\s\S]*?)<\/h1>/.exec(hostil46.html)?.[1] ?? "";
    afirmar(
      "título hostil no `h1` sai ESCAPADO — continua sendo exatamente um, e o `</h1>` do texto não o fecha",
      quantosH1(hostil46.html) === 1 &&
        (hostil46.html.match(/<\/h1>/gi) ?? []).length === 1 &&
        !/[<>"]/.test(oH1Hostil) &&
        oH1Hostil.includes("&lt;") &&
        oH1Hostil.includes("&amp;"),
      oH1Hostil.slice(0, 100),
    );
    /* E O BLOCO DE DADO ESTRUTURADO CONTINUA FECHANDO ONDE DEVE. O título
       hostil vive DENTRO dele como dado, e ali é inofensivo; o que não pode é a
       sequência que o encerra aparecer crua. */
    const jsonHostil =
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(
        hostil46.html,
      )?.[1] ?? "";
    afirmar(
      "e o bloco de dado estruturado não é fechado pelo texto do título — `</script` sai neutralizado",
      ldDe(hostil46.html) !== null && !/<\/script>/.test(jsonHostil),
      ldDe(hostil46.html) === null ? "não parseou" : "fecha onde deve",
    );

    /* ── ZERO `h1` ONDE NÃO HÁ ARTIGO ───────────────────────────────────── */

    for (const situacao of entrega46.SITUACOES_SEM_CONTEUDO) {
      const r = corpoDe(postCompleto, situacao);
      afirmar(
      `situação ${situacao}: NENHUM \`h1\` — não há artigo, e um título sozinho anunciaria um que não existe`,
        quantosH1(r.html) === 0,
        `${quantosH1(r.html)} ocorrência(s)`,
      );
    }
    const semConteudo46 = corpoDe({ ...postCompleto, conteudo_html: null });
    afirmar(
      "Post sem Conteúdo: nenhum `h1` e nenhum dado estruturado — não se declara artigo sem corpo",
      quantosH1(semConteudo46.html) === 0 && semConteudo46.html === "",
      JSON.stringify(semConteudo46.html).slice(0, 60),
    );

    /* ── OS CAMPOS DO DADO ESTRUTURADO, UM A UM ─────────────────────────── */
    //
    // Conferidos contra o VALOR esperado, e não por "a chave existe": um
    // emissor que pusesse a chave certa com o valor errado passaria.

    const ld = ldDe(doArtigo.html);
    afirmar(
      "o dado estruturado do artigo é JSON válido e do tipo `Article`",
      ld !== null && ld["@type"] === "Article" && ld["@context"] === "https://schema.org",
      ld === null ? "não parseou" : `${ld["@type"]} / ${ld["@context"]}`,
    );

    const ESPERADOS_DO_LD = [
      ["headline", () => ld?.headline === doArtigo.pagina.titulo],
      ["description", () => ld?.description === doArtigo.pagina.descricao],
      ["image", () => ld?.image === doArtigo.pagina.imagem.endereco],
      [
        "author",
        () => ld?.author?.name === postCompleto.autor_nome && ld?.author?.["@type"] === "Person",
      ],
      ["datePublished", () => ld?.datePublished === postCompleto.publicado_em],
      ["dateModified", () => ld?.dateModified === postCompleto.atualizado_em],
    ];
    for (const [campo, confere] of ESPERADOS_DO_LD) {
      afirmar(
        `o dado estruturado traz \`${campo}\` com o VALOR certo — a chave existir não é o critério`,
        confere(),
        JSON.stringify(ld?.[campo] ?? null).slice(0, 100),
      );
    }
    /* ★ E OS TRÊS PRIMEIROS SAEM DA MESMA CADEIA DE HERANÇA DA STORY 4.3 ★
       Comparar com `metadadosDaPagina` — e não com o Post — é o que impede a
       TERCEIRA opinião sobre título, descrição e imagem. Com Título SEO
       preenchido, o `headline` precisa segui-lo, e não o título do Post. */
    const comSeo = corpoDe({
      ...postCompleto,
      seo_titulo: "O título que o Autor escreveu para a busca",
      seo_descricao: "E a descrição dele.",
    });
    const ldComSeo = ldDe(comSeo.html);
    afirmar(
      "e `headline` e `description` seguem a HERANÇA — com campo de SEO preenchido, é ele que vale, e não o título do Post",
      ldComSeo?.headline === "O título que o Autor escreveu para a busca" &&
        ldComSeo?.description === "E a descrição dele." &&
        ldComSeo?.headline !== postCompleto.titulo,
      `${ldComSeo?.headline} | ${ldComSeo?.description}`,
    );

    /* ── CAMPO AUSENTE É OMITIDO, NUNCA VAZIO ───────────────────────────── */
    //
    // `"author": {"name": ""}` declara que o artigo tem um autor chamado nada;
    // a ausência declara que não se sabe. O validador do Google trata os dois de
    // formas diferentes, e a segunda é a verdade.

    const magro = corpoDe({
      ...postCompleto,
      autor_nome: null,
      resumo: null,
      seo_descricao: null,
    });
    const ldMagro = ldDe(magro.html);
    afirmar(
      "sem Autor e sem descrição, as CHAVES não aparecem — chave com valor vazio afirma que o campo é nada",
      ldMagro !== null &&
        !("author" in ldMagro) &&
        !("description" in ldMagro),
      Object.keys(ldMagro ?? {}).join(", "),
    );
    /* CONTROLE POSITIVO: com os dois presentes, as chaves aparecem. Sem isto,
       um emissor que nunca emitisse nenhum dos dois passaria. */
    afirmar(
      "controle positivo: com Autor e descrição, as duas chaves aparecem — a omissão acima não é o emissor calado",
      "author" in (ld ?? {}) && "description" in (ld ?? {}),
      Object.keys(ld ?? {}).join(", "),
    );
    /* E AUTOR SÓ COM ESPAÇOS conta como ausente — três espaços num campo livre
       é um campo que a pessoa não preencheu. */
    const ldEspacos = ldDe(corpoDe({ ...postCompleto, autor_nome: "   " }).html);
    afirmar(
      "Autor com só espaços conta como ausente — é um campo que ninguém preencheu",
      ldEspacos !== null && !("author" in ldEspacos),
      JSON.stringify(ldEspacos?.author ?? "omitido"),
    );

    /* ── `dateModified` CAI EM `datePublished` ──────────────────────────── */
    //
    // Um artigo nunca editado TEM data de modificação: a da publicação. Omitir
    // faria o buscador supor, e alguns supõem "hoje" — o artigo pareceria
    // perpetuamente fresco, e isso mina a confiança nas datas do site inteiro.

    const nuncaEditado = ldDe(
      corpoDe({ ...postCompleto, atualizado_em: null }).html,
    );
    afirmar(
      "artigo nunca editado tem `dateModified` IGUAL a `datePublished` — omitir faria o buscador supor \"hoje\"",
      nuncaEditado?.dateModified === postCompleto.publicado_em &&
        nuncaEditado?.datePublished === postCompleto.publicado_em,
      `${nuncaEditado?.datePublished} / ${nuncaEditado?.dateModified}`,
    );
    /* E DATA TORTA NÃO SAI. Data inventada é pior que data ausente. */
    const dataTorta = ldDe(
      corpoDe({
        ...postCompleto,
        publicado_em: "ontem de manhã",
        atualizado_em: null,
      }).html,
    );
    afirmar(
      "data que não é instante NÃO é emitida — data inventada é pior que data ausente",
      dataTorta !== null && !("datePublished" in dataTorta) && !("dateModified" in dataTorta),
      JSON.stringify({ p: dataTorta?.datePublished, m: dataTorta?.dateModified }),
    );

    /* ── O IDIOMA, DECLARADO ────────────────────────────────────────────── */

    afirmar(
      "o dado estruturado declara o idioma como `pt-BR`",
      ld?.inLanguage === "pt-BR",
      String(ld?.inLanguage ?? "ausente"),
    );

    /* ── OS DOIS `h1` DA APLICAÇÃO SÃO MUTUAMENTE EXCLUSIVOS ────────────── */
    //
    // ★ O ÉPICO ESTÁ DESATUALIZADO AQUI, E A ASSERÇÃO REGISTRA ISSO ★
    //
    // Ele diz que `BlogPost.jsx:235` transforma `# ` em outro `<h1>`. Esse
    // renderizador de markdown FOI REMOVIDO, não adaptado — está escrito no
    // cabeçalho do arquivo, porque ele emitia `h1` e `h4` que o Estilo do
    // Artigo não tem. Seguir o épico ao pé da letra me faria procurar um
    // defeito que já não existe e não olhar para o que sobrou.
    //
    // O que sobrou são DOIS `h1`: o do artigo e o da tela de erro. Eles nunca
    // coexistem porque a tela de erro está atrás de um `return` ANTECIPADO —
    // e é isso que se mede, por posição, e não a contagem, que seria 2.

    const telaDoArtigo = ler("src/pages/BlogPost.jsx");
    const posicoesDeH1 = [...telaDoArtigo.matchAll(/<(?:motion\.)?h1[\s>]/g)].map(
      (m) => m.index,
    );
    afirmar(
      "a tela do artigo tem exatamente DOIS `h1` no arquivo — o do artigo e o da tela de erro",
      posicoesDeH1.length === 2,
      `${posicoesDeH1.length} ocorrência(s)`,
    );
    /* ─── O QUE OS SEPARA É A FRONTEIRA DE `SituacaoRuim` ───────────────────
       A primeira versão desta asserção usou o `return` do caminho feliz como
       divisor, e falhou: os DOIS `h1` ficam depois dele. O motivo é que a tela
       de erro não é um ramo do mesmo `return` — ela é um COMPONENTE PRÓPRIO,
       `SituacaoRuim`, declarado adiante no arquivo.

       A exclusividade vem daí: o `h1` do artigo mora no componente principal, o
       da tela de erro mora dentro de `SituacaoRuim`, e a CHAMADA de
       `SituacaoRuim` está num `return` antecipado — antes de o artigo começar a
       desenhar. Medir o divisor errado teria acusado uma estrutura correta. */
    const inicioDeSituacaoRuim = telaDoArtigo.indexOf("function SituacaoRuim(");
    const chamadaDeSituacaoRuim = telaDoArtigo.indexOf("<SituacaoRuim");
    afirmar(
      "e eles estão em componentes DIFERENTES — o do erro vive em `SituacaoRuim`, o do artigo no componente principal",
      posicoesDeH1.length === 2 &&
        inicioDeSituacaoRuim > 0 &&
        posicoesDeH1[0] < inicioDeSituacaoRuim &&
        posicoesDeH1[1] > inicioDeSituacaoRuim,
      `h1 em ${posicoesDeH1.join(" e ")}, \`SituacaoRuim\` declarada em ${inicioDeSituacaoRuim}`,
    );
    /* ★ E HÁ UM `return` ENTRE A CHAMADA DA TELA DE ERRO E O `h1` DO ARTIGO ★
       É isto que fecha a exclusividade, e a primeira versão desta asserção
       errou o alvo: ela usava `data-tela="artigo-publico"` como marca do
       caminho feliz, e essa marca aparece DUAS vezes — a casca da tela de erro
       tem a mesma. O `indexOf` achava a primeira, que é justamente a errada.

       O que se mede é a estrutura: a chamada de `SituacaoRuim` vem antes do
       `h1` do artigo, e existe um `return` no meio. Logo, quando a tela de erro
       desenha, o artigo nem chega a ser avaliado — e mover a chamada para
       dentro do artigo derrubaria esta asserção, que é o ponto. */
    const retornoEntreOsDois =
      chamadaDeSituacaoRuim > 0 && posicoesDeH1.length === 2
        ? telaDoArtigo.slice(chamadaDeSituacaoRuim, posicoesDeH1[0]).indexOf("return (")
        : -1;
    afirmar(
      "e há um `return` entre a chamada da tela de erro e o `h1` do artigo — quando o erro desenha, o artigo nem é avaliado",
      chamadaDeSituacaoRuim > 0 &&
        chamadaDeSituacaoRuim < posicoesDeH1[0] &&
        retornoEntreOsDois !== -1,
      `chamada em ${chamadaDeSituacaoRuim}, h1 do artigo em ${posicoesDeH1[0]}, \`return (\` no meio: ${retornoEntreOsDois !== -1}`,
    );
    /* AUTOTESTE do detector: ele precisa enxergar `<motion.h1` também. A tela
       do artigo usa a versão animada, e um detector que só casasse `<h1` acharam
       um só — e a asserção de "exatamente dois" falharia pelo motivo errado. */
    afirmar(
      "autoteste: o detector enxerga `<h1` E `<motion.h1` — a tela do artigo usa a versão animada",
      [..."<h1 x><motion.h1 y>".matchAll(/<(?:motion\.)?h1[\s>]/g)].length === 2,
      "acusou os dois",
    );

    /* ── TODA IMAGEM DO CORPO SERVIDO CARREGA `alt` (Editor avançado) ─────── */
    //
    // `img` entrou no vocabulário do renderizador — imagem inline não está
    // mais fora do v1. O critério pede alternativo em toda imagem EXIBIDA, e a
    // garantia mudou de forma: não é mais "não há `<img>` no corpo servido" —
    // é "todo `<img>` que o renderizador único produz carrega o atributo
    // `alt`, mesmo vazio (decorativa), nunca AUSENTE". Medido no
    // renderizador, que é o único caminho de documento → HTML fora do
    // Editor: se ele um dia voltasse a omitir `alt` quando o Autor não
    // escreve nada, um `<img>` sem NENHUM atributo de alternativo chegaria
    // ao corpo servido, e é exatamente isso que a asserção abaixo mede.
    afirmar(
      "`img` está no vocabulário do renderizador — imagem inline não está mais fora do v1",
      render46.ETIQUETAS_EMITIDAS.includes("img"),
      render46.ETIQUETAS_EMITIDAS.join(", "),
    );
    const imagemSemAlt = render46.htmlDoDocumento({
      type: "doc",
      content: [{ type: "image", attrs: { src: "https://exemplo/x.png" } }],
    });
    afirmar(
      "uma imagem sem `alt` escrito pelo Autor ainda sai com o atributo — vazio, nunca ausente",
      /<img[^>]* alt="[^>]*>/.test(imagemSemAlt),
      imagemSemAlt,
    );
    const imagemComAlt = render46.htmlDoDocumento({
      type: "doc",
      content: [{ type: "image", attrs: { src: "https://exemplo/x.png", alt: "descrição" } }],
    });
    afirmar(
      "e uma imagem COM `alt` escrito pelo Autor preserva o texto",
      imagemComAlt.includes('alt="descrição"'),
      imagemComAlt,
    );
    afirmar(
      "se o corpo servido de fato traz uma `<img>`, ela carrega `alt` — nunca a etiqueta crua sem o atributo",
      !/<img(?![^>]*\balt=)[^>]*>/i.test(doArtigo.html),
      (doArtigo.html.match(/<img[^>]*>/gi) ?? []).join(" ") || "nenhuma no corpo desta prova",
    );
  }

  /* ══ STORY 4.5: O STATUS DIZ A VERDADE ═════════════════════════════════ */
  //
  // Desde a 4.1 a rota respondia 200 para tudo. Um artigo arquivado dizia
  // "aqui está, tudo certo" com uma página sem o artigo, e um endereço que
  // nunca existiu dizia a mesma coisa. Para o buscador isso não é página
  // faltando — é página DUPLICADA e vazia, e ele desconta o site inteiro.
  //
  // A rota é dirigida contra um SUPABASE DE MENTIRA, no molde da Story 2.12: é
  // o único jeito de percorrer as quatro situações num teste, e o que se
  // exercita é o caminho INTEIRO — leitura, emissor de metadado, corpo do
  // artigo e status. Dublar a leitura provaria só o `switch`.
  {
    secao("(4.5) o status HTTP, a canônica e o endereço estável");

    const entregaDominio = await import(
      pathToFileURL(path.join(raiz, "src", "domain", "blog", "entrega.js")).href
    );
    const estadosDominio = await import(
      pathToFileURL(path.join(raiz, "src", "domain", "blog", "estados.js")).href
    );
    const slugDominio = await import(
      pathToFileURL(path.join(raiz, "src", "domain", "blog", "slug.js")).href
    );
    const enderecosDoPainel = await import(
      pathToFileURL(path.join(raiz, "src", "admin", "blog", "enderecos.js")).href
    );

    /* ── O MAPA É FECHADO E COMPLETO ─────────────────────────────────── */
    //
    // Uma situação sem código responderia `undefined`, que vira 200 na maioria
    // dos servidores — exatamente o defeito que esta story conserta.

    const semCodigo = entregaDominio.SITUACOES_DA_ENTREGA.filter(
      (s) => !Number.isInteger(entregaDominio.STATUS_DA_SITUACAO[s]),
    );
    afirmar(
      `as ${entregaDominio.SITUACOES_DA_ENTREGA.length} situações do vocabulário têm status declarado — sem código viraria 200 na maioria dos servidores`,
      semCodigo.length === 0,
      `sem código: ${semCodigo.join(", ") || "nenhuma"}`,
    );
    const sobrando = Object.keys(entregaDominio.STATUS_DA_SITUACAO).filter(
      (s) => !entregaDominio.SITUACOES_DA_ENTREGA.includes(s),
    );
    afirmar(
      "e o mapa não declara status para nada FORA do vocabulário — os dois sentidos",
      sobrando.length === 0,
      `sobrando: ${sobrando.join(", ") || "nenhum"}`,
    );
    /* ★ E OS CÓDIGOS SÃO ESTES ★ — nomeados, e não só "algum inteiro". Um mapa
       que respondesse 200 para tudo passaria nas duas asserções acima. */
    const ESPERADO = { "no-ar": 200, arquivado: 410, redirecionado: 301, inexistente: 404 };
    const divergentes = Object.entries(ESPERADO).filter(
      ([situacao, codigo]) => entregaDominio.STATUS_DA_SITUACAO[situacao] !== codigo,
    );
    afirmar(
      "no ar 200, arquivado 410, aposentado 301, inexistente 404 — 410 sai do índice mais rápido que 404, e é a verdade",
      divergentes.length === 0,
      divergentes
        .map(([s, c]) => `${s}: ${entregaDominio.STATUS_DA_SITUACAO[s]} (esperado ${c})`)
        .join(" | ") || "os quatro",
    );
    afirmar(
      "situação fora do vocabulário não tem status — `statusDaSituacao` devolve nulo em vez de inventar",
      entregaDominio.statusDaSituacao("inventada") === null &&
        entregaDominio.statusDaSituacao(undefined) === null,
      String(entregaDominio.statusDaSituacao("inventada")),
    );

    /* ── A ROTA, DIRIGIDA CONTRA UM SUPABASE DE MENTIRA ──────────────── */

    const { createServer } = await import("node:http");
    /* O que a função de banco de mentira devolve. Trocado a cada caso. */
    let linhaDaEntrega = null;
    const pedidos = [];
    const servidorDaEntrega = createServer((req, res) => {
      let bruto = "";
      req.on("data", (p) => { bruto += p; });
      req.on("end", () => {
        pedidos.push({ url: req.url, corpo: bruto });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(linhaDaEntrega === null ? [] : [linhaDaEntrega]));
      });
    });
    await new Promise((pronto) => servidorDaEntrega.listen(0, "127.0.0.1", pronto));
    const porta = servidorDaEntrega.address().port;
    const URL_DE_MENTIRA = `http://127.0.0.1:${porta}`;

    /** Uma linha da função `situacao_do_endereco`, com tudo nulo por padrão. */
    const linha = (extras) => {
      const vazia = { situacao: null, slug_atual: null };
      for (const campo of entregaDominio.CAMPOS_DE_CONTEUDO) vazia[campo] = null;
      return { ...vazia, ...extras };
    };

    const comAmbiente = async (extras, acao) => {
      const guardado = {};
      for (const [nome, valor] of Object.entries(extras)) {
        guardado[nome] = process.env[nome];
        if (valor === undefined) delete process.env[nome];
        else process.env[nome] = valor;
      }
      try {
        return await acao();
      } finally {
        for (const [nome, valor] of Object.entries(guardado)) {
          if (valor === undefined) delete process.env[nome];
          else process.env[nome] = valor;
        }
      }
    };
    const dirigirEntrega = (slug) =>
      comAmbiente(
        {
          VITE_DOMINIO_DO_SITE: DOMINIO,
          SUPABASE_URL: URL_DE_MENTIRA,
          SUPABASE_CHAVE_PUBLICAVEL: "sb_publishable_de_mentira",
          VITE_SUPABASE_URL: undefined,
          VITE_SUPABASE_PUBLISHABLE_KEY: undefined,
        },
        () => dirigir("blog.js", { method: "GET", url: `/api/blog?slug=${slug}`, query: { slug } }),
      );

    try {
      /* CONTROLE: o servidor de mentira está de pé e a rota chega nele. Sem
         isto, uma rota que falhasse ANTES da leitura daria 500 em todos os
         casos e as asserções de status abaixo acusariam a coisa errada. */
      linhaDaEntrega = linha({ situacao: "inexistente" });
      await dirigirEntrega("qualquer-coisa");
      afirmar(
        "controle: a rota alcança a função de banco — o Supabase de mentira recebeu a chamada",
        pedidos.length > 0 &&
          pedidos.some((p) => p.url.includes("rpc/situacao_do_endereco")),
        pedidos.map((p) => p.url).join(" | ") || "nenhum pedido",
      );

      /* ── CADA SITUAÇÃO RESPONDE O SEU STATUS ──────────────────────── */

      const CASOS = [
        [
          "no-ar",
          linha({
            situacao: "no-ar",
            slug_atual: "artigo-vivo",
            titulo: "O artigo que está no ar",
            resumo: "Um resumo.",
            conteudo_html: "<p>O texto do artigo.</p>",
          }),
          200,
        ],
        ["arquivado", linha({ situacao: "arquivado", slug_atual: "artigo-velho" }), 410],
        ["inexistente", linha({ situacao: "inexistente" }), 404],
        [
          "rascunho — que chega como inexistente desde a 4.2",
          linha({ situacao: "inexistente" }),
          404,
        ],
      ];
      const respostas = new Map();
      for (const [nome, valor, esperado] of CASOS) {
        linhaDaEntrega = valor;
        const r = await dirigirEntrega("um-endereco");
        respostas.set(nome, r);
        afirmar(
          `situação ${nome}: a rota responde ${esperado}`,
          r.codigo === esperado,
          `respondeu ${r.codigo}`,
        );
      }
      /* ★ E NENHUMA DELAS RESPONDE 200, EXCETO A QUE ESTÁ NO AR ★
         É o critério, dito no sentido em que ele é violado: o defeito não é
         "o código está errado", é "tudo responde sucesso". */
      const responderam200 = [...respostas.entries()].filter(
        ([nome, r]) => r.codigo === 200 && !nome.startsWith("no-ar"),
      );
      afirmar(
        "e NENHUMA situação fora do ar responde 200 — o defeito não é o código errado, é tudo responder sucesso",
        responderam200.length === 0,
        responderam200.map(([n]) => n).join(" | ") || "nenhuma",
      );

      /* A LISTAGEM continua 200: ela é uma página que existe, e não uma
         situação omitida. */
      const listagem = await comAmbiente(
        { VITE_DOMINIO_DO_SITE: DOMINIO },
        () => dirigir("blog.js", { method: "GET", url: "/api/blog" }),
      );
      afirmar(
        "a listagem `/blog` continua 200 — ela é uma página que existe, e não uma situação esquecida",
        listagem.codigo === 200,
        String(listagem.codigo),
      );

      /* ── O 410 AINDA DESENHA, E NÃO TRAZ O ARTIGO ─────────────────── */
      //
      // O status é para a máquina; a pessoa que clicou num link velho merece
      // uma página que carrega e explica. O que não pode vir é o conteúdo.

      const doArquivado = respostas.get("arquivado");
      afirmar(
        "o 410 ainda serve a página — status é para a máquina, e quem clicou num link velho merece uma tela que carrega",
        /id="root"/.test(String(doArquivado?.corpo ?? "")) &&
          String(doArquivado?.cabecalhos["content-type"] ?? "").startsWith("text/html"),
        `${doArquivado?.codigo} | ${String(doArquivado?.corpo ?? "").length} caracteres`,
      );
      afirmar(
        "e NÃO traz o artigo — nem corpo, nem título do Post",
        !String(doArquivado?.corpo ?? "").includes('<article class="artigo">') &&
          !String(doArquivado?.corpo ?? "").includes("O artigo que está no ar"),
        "sem artigo",
      );

      /* ── O 301 NÃO SERVE NADA ─────────────────────────────────────── */
      //
      // A tentação é servir a página junto. O navegador segue o `Location` e
      // descarta o corpo, então o único efeito seria o rastreador que NÃO
      // segue enxergar conteúdo num endereço que o site acabou de declarar
      // morto — ensinando que ele é válido. É o oposto de 301.

      linhaDaEntrega = linha({
        situacao: "redirecionado",
        slug_atual: "o-endereco-de-hoje",
      });
      const doRedirecionado = await dirigirEntrega("endereco-aposentado");
      afirmar(
        "endereço aposentado responde 301 — permanente, e não 302",
        doRedirecionado.codigo === 301,
        String(doRedirecionado.codigo),
      );
      afirmar(
        "e o `Location` é ABSOLUTO, no Domínio Canônico, apontando para o endereço de HOJE",
        doRedirecionado.cabecalhos.location === `${DOMINIO}/blog/o-endereco-de-hoje`,
        String(doRedirecionado.cabecalhos.location ?? "ausente"),
      );
      const corpoDoRedirecionado = String(doRedirecionado.corpo ?? "");
      afirmar(
        "e ele NÃO serve conteúdo — nem shell, nem metadado, nem artigo: servir ensinaria que o endereço morto é válido",
        !corpoDoRedirecionado.includes("id=\"root\"") &&
          !corpoDoRedirecionado.includes("og:title") &&
          !corpoDoRedirecionado.includes("<article") &&
          corpoDoRedirecionado.length < 200,
        `${corpoDoRedirecionado.length} caracteres: ${corpoDoRedirecionado.slice(0, 80)}`,
      );

      /* ── A CANÔNICA, POR STATUS ───────────────────────────────────── */

      const doNoAr = respostas.get("no-ar");
      const canonicaDo = (r) =>
        /rel="canonical" href="([^"]*)"/.exec(String(r?.corpo ?? ""))?.[1] ?? "";
      afirmar(
        "no 200, a canônica é absoluta, no Domínio Canônico, e aponta para o PRÓPRIO Post",
        canonicaDo(doNoAr) === `${DOMINIO}/blog/artigo-vivo`,
        canonicaDo(doNoAr) || "ausente",
      );
      /* ★ E `/api/` NÃO APARECE EM RESPOSTA NENHUMA ★
         Numa rota reescrita o caminho que chega é o da FUNÇÃO. Derivar a
         canônica dali produziria `/api/blog` — um endereço que o visitante
         nunca vê e que o rastreador passaria a considerar o oficial. */
      const comApi = [...respostas.values(), doRedirecionado, listagem].filter((r) =>
        String(r?.corpo ?? "").includes("/api/"),
      );
      afirmar(
        "e `/api/` não aparece em resposta nenhuma — o caminho da função nunca vira endereço público",
        comApi.length === 0,
        `${comApi.length} resposta(s) com /api/`,
      );
      afirmar(
        "autoteste: o detector de `/api/` ACUSA um plantado",
        [{ corpo: `<link href="${DOMINIO}/api/blog" />` }].filter((r) =>
          String(r?.corpo ?? "").includes("/api/"),
        ).length === 1,
        "acusou",
      );

      /* ── STORY 4.6, NO DOCUMENTO INTEIRO ─────────────────────────── */
      //
      // O que veio na seção (4.6) julga o EMISSOR. Estas julgam o DOCUMENTO
      // que a rota devolve: é nele que o `h1` precisa ser único, e é nele que
      // os três blocos de dado estruturado convivem.

      const documentoNoAr = String(doNoAr?.corpo ?? "");
      const h1sDoDocumento = documentoNoAr.match(/<h1[\s>]/gi) ?? [];
      const oH1Servido = /<h1>([^<]*)<\/h1>/.exec(documentoNoAr)?.[1] ?? null;
      afirmar(
        "o DOCUMENTO servido de um Post tem exatamente um `h1`, e ele é o título do Post",
        h1sDoDocumento.length === 1 &&
          oH1Servido === "O artigo que está no ar",
        `${h1sDoDocumento.length} ocorrência(s): ${oH1Servido ?? "nenhuma"}`,
      );
      /* E ZERO nas páginas que NÃO são artigo. Um `h1` sobrando no 410 ou na
         listagem anunciaria um artigo que não está ali. */
      const comH1Indevido = [
        ["arquivado (410)", String(respostas.get("arquivado")?.corpo ?? "")],
        ["inexistente (404)", String(respostas.get("inexistente")?.corpo ?? "")],
        ["a listagem", String(listagem.corpo ?? "")],
      ].filter(([, html]) => (html.match(/<h1[\s>]/gi) ?? []).length !== 0);
      afirmar(
        "e ZERO `h1` no 410, no 404 e na listagem — um título sozinho anunciaria um artigo que não existe",
        comH1Indevido.length === 0,
        comH1Indevido.map(([n]) => n).join(" | ") || "as três sem h1",
      );

      /* ── OS TRÊS `@type` CONVIVEM ────────────────────────────────── */
      //
      // `Organization` e `SoftwareApplication` ficaram FORA da região governada
      // na Story 4.3, de propósito: são identidade do SITE. O bloco de artigo é
      // um terceiro tipo no mesmo documento, o que é válido e esperado — e a
      // asserção existe porque a troca de região poderia tê-los levado junto.

      const blocosLd = [
        ...documentoNoAr.matchAll(
          /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
        ),
      ].map(([, textoDoBloco]) => {
        try {
          return JSON.parse(String(textoDoBloco).replace(/<\\\//g, "</"));
        } catch {
          return null;
        }
      });
      const tiposLd = blocosLd.filter(Boolean).map((b) => b["@type"]);
      afirmar(
        "o documento traz os TRÊS tipos de dado estruturado — `Article`, `Organization` e `SoftwareApplication`",
        ["Article", "Organization", "SoftwareApplication"].every((tipo) =>
          tiposLd.includes(tipo),
        ),
        tiposLd.join(", ") || "nenhum",
      );
      afirmar(
        "e TODOS os blocos são JSON válido — um bloco quebrado invalida a página inteira no validador",
        blocosLd.length > 0 && blocosLd.every((b) => b !== null),
        `${blocosLd.filter(Boolean).length} de ${blocosLd.length} parsearam`,
      );
      /* E O `Article` SÓ APARECE NA PÁGINA DE POST. Na listagem ele declararia
         que a página de índice é um artigo. */
      afirmar(
        "e o `Article` NÃO aparece na listagem — lá ele declararia que a página de índice é um artigo",
        !String(listagem.corpo ?? "").includes('"Article"'),
        String(listagem.corpo ?? "").includes('"Article"') ? "aparece" : "ausente",
      );

      /* ── O IDIOMA, DECLARADO NO DOCUMENTO ────────────────────────── */

      afirmar(
        "o documento servido declara o idioma como `pt-BR`",
        /<html[^>]*lang="pt-BR"/.test(documentoNoAr),
        /<html[^>]*>/.exec(documentoNoAr)?.[0]?.slice(0, 60) ?? "sem <html>",
      );

      /* ── FALHA DE LEITURA NÃO VIRA 404 ───────────────────────────── */
      //
      // 404 afirmaria que o Post não existe. Ele pode existir e o banco estar
      // fora do ar — e o buscador que recebe 404 tira a página do índice.

      const semRede = await comAmbiente(
        {
          VITE_DOMINIO_DO_SITE: DOMINIO,
          SUPABASE_URL: "http://127.0.0.1:1",
          SUPABASE_CHAVE_PUBLICAVEL: "sb_publishable_de_mentira",
          VITE_SUPABASE_URL: undefined,
          VITE_SUPABASE_PUBLISHABLE_KEY: undefined,
        },
        () => dirigir("blog.js", { method: "GET", url: "/api/blog?slug=x", query: { slug: "x" } }),
      );
      afirmar(
        "leitura que falha responde 500, e NUNCA 404 — 404 afirmaria que o Post não existe, e tiraria a página do índice",
        semRede.codigo === 500,
        String(semRede.codigo),
      );
      /* ── STORY 4.9: A POLÍTICA DE CACHE ──────────────────────────── */
      //
      // O caso que ela existe para impedir e especifico: um Post agendado para
      // as 9h responde 404 as 8h59. Se esse 404 for guardado, o artigo entra no
      // ar e quem tem o link continua recebendo "nao existe" — por um tempo que
      // ninguem escolheu, porque sem declaracao a hospedagem decide sozinha.

      const cacheMod = await import(
        pathToFileURL(path.join(raiz, "api", "_nucleo", "cache.js")).href
      );
      const cacheDe = (r) => String(r?.cabecalhos["cache-control"] ?? "");

      /* ── O TETO É 60, E O NÚMERO É A PROMESSA ─────────────────────── */
      //
      // "A correcao do Autor aparece em ate 60 segundos" deixa de ser verdade
      // no instante em que este numero sobe, e nada na tela acusaria.

      afirmar(
        "o teto de cache é 60 segundos — é a promessa da story, e subir o número a quebra em silêncio",
        cacheMod.SEGUNDOS_DE_CACHE === 60,
        String(cacheMod.SEGUNDOS_DE_CACHE),
      );
      afirmar(
        "a resposta de um Post no ar declara `s-maxage=60`",
        /(^|,\s*)s-maxage=60(\s*,|$)/.test(cacheDe(doNoAr)),
        cacheDe(doNoAr) || "sem Cache-Control",
      );
      /* ★ E SEM `stale-while-revalidate` ★
         Ele e quase sempre a escolha certa — serve rapido e atualiza atras. Mas
         a promessa desta story e um NUMERO: quem chegasse no segundo 61
         receberia a versao velha e dispararia a atualizacao para o proximo, e o
         teto viraria "60 segundos mais o tempo ate alguem pedir". Para o Autor
         que acabou de corrigir o artigo que esta circulando, e a story inteira. */
      afirmar(
        "e SEM `stale-while-revalidate` — com ele o teto vira \"60 segundos mais o tempo até alguém pedir\"",
        !/stale-while-revalidate/i.test(cacheDe(doNoAr)),
        cacheDe(doNoAr),
      );

      /* ── AS NEGATIVAS NÃO SE GUARDAM ──────────────────────────────── */

      const NEGATIVAS = [
        ["arquivado (410)", respostas.get("arquivado")],
        ["inexistente (404) — o agendado antes da hora", respostas.get("inexistente")],
        ["leitura que falha (500)", semRede],
      ];
      for (const [nome, r] of NEGATIVAS) {
        afirmar(
          `${nome}: declara \`no-store\` — negativa guardada sobrevive à publicação`,
          cacheDe(r) === "no-store",
          cacheDe(r) || "sem Cache-Control",
        );
      }
      /* E NENHUMA delas traz `s-maxage`. Sem esta metade, um `no-store,
         s-maxage=60` passaria na de cima — e as duas diretivas juntas sao
         ambiguas o bastante para a hospedagem escolher a que preferir. */
      const comMaxAge = NEGATIVAS.filter(([, r]) => /s-maxage/i.test(cacheDe(r)));
      afirmar(
        "e nenhuma negativa traz `s-maxage` junto — as duas diretivas juntas deixam a hospedagem escolher",
        comMaxAge.length === 0,
        comMaxAge.map(([n]) => n).join(" | ") || "nenhuma",
      );

      /* ── O MAPA É FECHADO E COMPLETO ──────────────────────────────── */
      //
      // Um status que as rotas emitem e o mapa nao conhece sairia sem
      // `Cache-Control` — que e o estado de ANTES desta story.

      const semPolitica = cacheMod.STATUS_EMITIDOS.filter(
        (s) => typeof cacheMod.POLITICA_POR_STATUS[s] !== "string",
      );
      afirmar(
        `os ${cacheMod.STATUS_EMITIDOS.length} status que as rotas emitem têm política declarada — sem ela, quem decide é a hospedagem`,
        semPolitica.length === 0,
        semPolitica.join(", ") || "todos",
      );
      afirmar(
        "status desconhecido cai em `no-store` — o lado seguro é não guardar o que ninguém classificou",
        cacheMod.politicaDeCache(418) === "no-store" &&
          cacheMod.politicaDeCache(undefined) === "no-store",
        cacheMod.politicaDeCache(418),
      );

      /* ── NENHUM REQUISITO DEPENDE DE PURGA ───────────────────────── */
      //
      // O criterio e explicito. As etiquetas sao preparacao para o dia em que
      // alguem quiser invalidar na hora; a garantia dos 60 segundos e do TTL,
      // sozinho. Por isso a assercao mede o TTL, e nao a etiqueta.

      const tetoDeclarado = Number(
        /s-maxage=(\d+)/.exec(cacheDe(doNoAr))?.[1] ?? Number.NaN,
      );
      afirmar(
        "o TTL sozinho garante os 60 segundos — nenhuma garantia depende de alguém lembrar de purgar",
        Number.isFinite(tetoDeclarado) && tetoDeclarado <= 60,
        String(tetoDeclarado),
      );
      afirmar(
        "autoteste: a leitura do TTL ACUSA um teto maior que 60",
        Number(/s-maxage=(\d+)/.exec("public, s-maxage=3600")?.[1]) > 60,
        "acusou",
      );

      /* ── AS ETIQUETAS, POR POST E POR COLEÇÃO ────────────────────── */

      const etiquetasDe = (r) =>
        String(r?.cabecalhos["vercel-cache-tag"] ?? "").split(",").filter(Boolean);
      afirmar(
        "a resposta de um Post traz a etiqueta DELE e a da coleção",
        etiquetasDe(doNoAr).includes("post:artigo-vivo") &&
          etiquetasDe(doNoAr).includes(cacheMod.ETIQUETA_DA_COLECAO),
        etiquetasDe(doNoAr).join(",") || "sem etiquetas",
      );
      afirmar(
        "a listagem traz só a da coleção — não há Post a purgar ali",
        etiquetasDe(listagem).includes(cacheMod.ETIQUETA_DA_COLECAO) &&
          !etiquetasDe(listagem).some((e) => e.startsWith("post:")),
        etiquetasDe(listagem).join(",") || "sem etiquetas",
      );
      /* E A NEGATIVA NÃO TRAZ ETIQUETA. Numa resposta que ninguém guarda elas
         seriam ruído: não há o que purgar. */
      afirmar(
        "a resposta `no-store` NÃO traz etiqueta — não há o que purgar no que ninguém guarda",
        etiquetasDe(respostas.get("inexistente")).length === 0,
        etiquetasDe(respostas.get("inexistente")).join(",") || "nenhuma",
      );
      /* SLUG FORA DO VOCABULÁRIO DE ETIQUETA não derruba a resposta: a etiqueta
         do Post é conveniência, e trocar o essencial pelo acessório seria o
         defeito. A da coleção fica. */
      const etiquetasTortas = cacheMod.etiquetasDaResposta({ slug: "com espaço, e vírgula" });
      afirmar(
        "slug fora do vocabulário de etiqueta OMITE a etiqueta do Post e mantém a da coleção — cabeçalho quebrado derrubaria a resposta inteira",
        etiquetasTortas.includes(cacheMod.ETIQUETA_DA_COLECAO) &&
          !etiquetasTortas.some((e) => e.startsWith("post:")),
        etiquetasTortas.join(","),
      );

      /* ══ STORY 4.10: A DEGRADAÇÃO E O DIAGNÓSTICO ══════════════════ */
      //
      // Uma falha na entrega hoje só é percebida por quem olha os registros de
      // propósito, ou por um visitante que tropeça nela. Toda resposta passa a
      // se explicar — e, no caso ESPECÍFICO de `/blog/:slug` falhando ao ler o
      // Supabase, o CORPO passa a ser o shell de verdade em vez de um texto de
      // erro, sem que o STATUS deixe de ser 500 — a garantia da Story 4.5
      // continua intacta, e é isso que a primeira asserção confere de novo.

      const diagMod = await import(
        pathToFileURL(path.join(raiz, "api", "_nucleo", "diagnostico.js")).href
      );
      const diagnosticoDe = (r) =>
        String(r?.cabecalhos["x-entrega-diagnostico"] ?? "");

      /* ── A LEITURA FALHANDO: O CORPO VIRA O SHELL DE VERDADE ─────── */

      afirmar(
        "e o STATUS continua 500 nessa falha — a degradação é só do corpo, a Story 4.5 não perde a garantia",
        semRede.codigo === 500,
        String(semRede.codigo),
      );
      afirmar(
        "o CORPO da falha de leitura é o shell embutido, byte a byte igual ao `dist/index.html` — não um texto de erro",
        semRede.corpo === distHtml,
        `${String(semRede.corpo ?? "").length} × ${distHtml.length} caracteres`,
      );
      afirmar(
        "e o `X-Entrega-Diagnostico` da falha de leitura nomeia a causa",
        diagnosticoDe(semRede) === diagMod.DIAGNOSTICO_LEITURA_FALHOU,
        diagnosticoDe(semRede) || "ausente",
      );
      /* CONTROLE: o corpo do shell embutido TEM o título da home — é o sinal
         que o script de monitoramento de pausa (`monitorar-pausa.mjs`) vai
         procurar. Sem este controle, a asserção acima poderia estar comparando
         com um `distHtml` que por acaso está vazio ou igualmente quebrado. */
      afirmar(
        "controle: o shell servido na falha TEM o título da home — é o sinal que o monitor de pausa procura",
        /<title>[^<]{5,}<\/title>/.test(semRede.corpo ?? ""),
        /<title>([^<]*)<\/title>/.exec(semRede.corpo ?? "")?.[1]?.slice(0, 60) ?? "sem título",
      );

      /* ── E ISSO NÃO SE APLICA A `inexistente`/`arquivado` ─────────── */
      //
      // Essas são respostas HONESTAS da leitura — ela funcionou e classificou
      // o endereço —, não falhas dela. Continuam com metadado do SITE (Story
      // 4.3), e o diagnóstico é `ok`: nada degradou, a leitura respondeu.

      for (const nome of ["no-ar", "arquivado", "inexistente"]) {
        afirmar(
          `situação ${nome}: o diagnóstico é \`ok\` — a leitura RESPONDEU, mesmo que a resposta seja "não está no ar"`,
          diagnosticoDe(respostas.get(nome)) === diagMod.DIAGNOSTICO_OK,
          diagnosticoDe(respostas.get(nome)) || "ausente",
        );
      }
      afirmar(
        "a listagem `/blog` também tem diagnóstico `ok`",
        diagnosticoDe(listagem) === diagMod.DIAGNOSTICO_OK,
        diagnosticoDe(listagem) || "ausente",
      );
      afirmar(
        "e o endereço aposentado (301) também — redirecionar é o comportamento certo, não um desvio",
        diagnosticoDe(doRedirecionado) === diagMod.DIAGNOSTICO_OK,
        diagnosticoDe(doRedirecionado) || "ausente",
      );

      /* ── CONTEÚDO RECUSADO (4.4) TAMBÉM GANHA DIAGNÓSTICO PRÓPRIO ─── */

      linhaDaEntrega = linha({
        situacao: "no-ar",
        slug_atual: "post-com-conteudo-torto",
        titulo: "Um Post com Conteúdo torto",
        conteudo_html: "<p>ok</p><script>mau()</script>",
      });
      const comConteudoTorto = await dirigirEntrega("post-com-conteudo-torto");
      afirmar(
        "Conteúdo que a conferência da 4.4 recusa: a página continua 200, e o diagnóstico nomeia o desvio",
        comConteudoTorto.codigo === 200 &&
          diagnosticoDe(comConteudoTorto) === diagMod.DIAGNOSTICO_CONTEUDO_RECUSADO,
        `${comConteudoTorto.codigo} | ${diagnosticoDe(comConteudoTorto)}`,
      );

      /* ── SEM DOMÍNIO E SEM SHELL: FALHAS QUE NÃO DEGRADAM ─────────── */
      //
      // Não há shell alternativo nesses dois casos — sem domínio não há como
      // montar canônica nenhuma, e sem shell não há shell para servir. O
      // diagnóstico nomeia CADA UM, e não os confunde com leitura-falhou.

      const semDominioComDiag = await comDominio(null, () =>
        dirigir("blog.js", { method: "GET", url: "/api/blog?slug=x", query: { slug: "x" } }),
      );
      afirmar(
        "sem Domínio Canônico, o diagnóstico é `falha:sem-dominio` — não `leitura-falhou`, que confundiria a causa",
        semDominioComDiag.codigo === 500 &&
          diagnosticoDe(semDominioComDiag) === diagMod.DIAGNOSTICO_SEM_DOMINIO,
        diagnosticoDe(semDominioComDiag) || "ausente",
      );

      /* ── MÉTODO RECUSADO TAMBÉM DIAGNOSTICA ───────────────────────── */

      const metodoErrado = await comAmbiente(
        { VITE_DOMINIO_DO_SITE: DOMINIO },
        () => dirigir("blog.js", { method: "POST", url: "/api/blog" }),
      );
      afirmar(
        "método fora do vocabulário: 405 com diagnóstico próprio",
        metodoErrado.codigo === 405 &&
          diagnosticoDe(metodoErrado) === diagMod.DIAGNOSTICO_METODO_RECUSADO,
        `${metodoErrado.codigo} | ${diagnosticoDe(metodoErrado)}`,
      );

    } finally {
      await new Promise((pronto) => servidorDaEntrega.close(pronto));
    }

    /* ── `jaEsteveNoAr` TEM UM DONO SÓ ───────────────────────────────── */
    //
    // Ela era privada em `api/_nucleo/salvarPost.js`, e o Painel passou a
    // precisar da MESMA pergunta. Esta regra JÁ MUDOU uma vez — era
    // `publicado_em !== null`, e deixou de servir na Story 2.6 quando a gaveta
    // passou a preencher a data. Uma cópia feita antes disso teria ficado com a
    // versão velha, e as duas pontas discordariam sobre o mesmo Post.

    /* A varredura percorre `src/` e `api/` inteiros — o mesmo molde que esta
       ferramenta já usa para achar quem importa o renderizador. Uma lista de
       arquivos escrita à mão não acharia a cópia que alguém pusesse num
       arquivo novo, que é o único caso que importa. */
    const fontesDaRegra = [];
    const varrerFontes = (dir) => {
      if (!existsSync(dir)) return;
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        const completo = path.join(dir, entrada.name);
        if (entrada.isDirectory()) varrerFontes(completo);
        else if (/\.(js|jsx|mjs)$/.test(entrada.name)) fontesDaRegra.push(completo);
      }
    };
    varrerFontes(path.join(raiz, "src"));
    varrerFontes(path.join(raiz, "api"));

    const declaracoes = [];
    for (const arquivo of fontesDaRegra) {
      const relativo = path.relative(raiz, arquivo).split(path.sep).join("/");
      const codigo = mascararComentariosJs(readFileSync(arquivo, "utf8"));
      if (/function\s+jaEsteveNoAr\s*\(/.test(codigo)) declaracoes.push(relativo);
    }
    afirmar(
      "`jaEsteveNoAr` é DECLARADA num arquivo só, e é o módulo do domínio — a regra já mudou uma vez, e uma cópia teria ficado com a versão velha",
      declaracoes.length === 1 &&
        declaracoes[0] === "src/domain/blog/estados.js",
      declaracoes.join(", ") || "nenhuma declaração encontrada",
    );
    afirmar(
      "autoteste: o detector de declaração ACUSA uma cópia plantada",
      /function\s+jaEsteveNoAr\s*\(/.test("function jaEsteveNoAr(post) { return true; }"),
      "acusou",
    );

    /* E O CAMINHO DE ESCRITA A IMPORTA. Sem esta metade, apagar a chamada em
       `salvarPost.js` deixaria a asserção acima verde — e o endereço anterior
       deixaria de ser aposentado, quebrando toda URL já publicada. */
    const doSalvar = mascararComentariosJs(ler("api/_nucleo/salvarPost.js"));
    afirmar(
      "e o caminho de escrita a IMPORTA do domínio, e a USA para decidir se aposenta o endereço",
      /import\s*\{[^}]*jaEsteveNoAr[^}]*\}\s*from\s*["'][^"']*domain\/blog\/estados/.test(
        doSalvar,
      ) && /jaEsteveNoAr\s*\(/.test(doSalvar),
      doSalvar.includes("jaEsteveNoAr") ? "importa e usa" : "NÃO menciona",
    );

    /* ── A CONFIRMAÇÃO APARECE SÓ QUANDO PRECISA ─────────────────────── */
    //
    // Um aviso que aparece quando não precisa é um aviso que ninguém lê quando
    // precisa. A matriz é nomeada, caso a caso.

    const ONTEM = new Date(Date.now() - 86400000).toISOString();
    const AMANHA = new Date(Date.now() + 86400000).toISOString();
    const MATRIZ = [
      [
        "Post publicado com data no passado, endereço trocado",
        { original: { slug: "antes", estado: "publicado", publicado_em: ONTEM }, slug: "depois" },
        true,
      ],
      [
        "Post arquivado que esteve no ar, endereço trocado",
        { original: { slug: "antes", estado: "arquivado", publicado_em: ONTEM }, slug: "depois" },
        true,
      ],
      [
        "rascunho estreando endereço — ninguém viu a URL",
        { original: { slug: "antes", estado: "rascunho", publicado_em: ONTEM }, slug: "depois" },
        false,
      ],
      [
        "agendado por vir — a URL ainda não existe",
        { original: { slug: "antes", estado: "agendado", publicado_em: AMANHA }, slug: "depois" },
        false,
      ],
      [
        "endereço IGUAL ao gravado — não houve troca",
        { original: { slug: "antes", estado: "publicado", publicado_em: ONTEM }, slug: "antes" },
        false,
      ],
      [
        "Post nascendo — não há original",
        { original: null, slug: "estreia" },
        false,
      ],
      [
        "endereço vazio na tela — o salvamento vai recusar antes",
        { original: { slug: "antes", estado: "publicado", publicado_em: ONTEM }, slug: "  " },
        false,
      ],
    ];
    const erraram = MATRIZ.filter(
      ([, entrada, esperado]) =>
        slugDominio.trocaDeEnderecoQuebraLinks(entrada) !== esperado,
    );
    afirmar(
      `a confirmação de troca de endereço aparece só quando precisa — os ${MATRIZ.length} casos da matriz`,
      erraram.length === 0,
      erraram.map(([n]) => n).join(" | ") || "os sete",
    );
    /* CONTROLE: pelo menos um caso de cada lado. Uma matriz toda de um lado só
       passaria com uma função que devolvesse sempre a mesma coisa. */
    afirmar(
      "controle: a matriz tem caso dos DOIS lados — uma função que sempre devolvesse o mesmo passaria numa matriz de um lado só",
      MATRIZ.some(([, , e]) => e === true) && MATRIZ.some(([, , e]) => e === false),
      `${MATRIZ.filter(([, , e]) => e).length} sim / ${MATRIZ.filter(([, , e]) => !e).length} não`,
    );
    /* ★ E O PAINEL DECIDE PELA MESMA FUNÇÃO ★
       A decisão mora no domínio justamente porque tem dois consumidores com
       finalidades opostas: o servidor decide se APOSENTA, o Painel decide se
       PERGUNTA. Um Painel com regra própria avisaria de uma quebra que o
       servidor não vai causar — ou calaria sobre uma que vai. */
    const doEditor = mascararComentariosJs(ler("src/admin/blog/EditorDePost.jsx"));
    afirmar(
      "o Editor decide pela MESMA função do domínio — regra própria no Painel avisaria de quebra que o servidor não causa",
      /import\s*\{[^}]*trocaDeEnderecoQuebraLinks[^}]*\}\s*from\s*["'][^"']*domain\/blog\/slug/.test(
        doEditor,
      ) && /trocaDeEnderecoQuebraLinks\s*\(/.test(doEditor),
      doEditor.includes("trocaDeEnderecoQuebraLinks") ? "importa e usa" : "NÃO usa",
    );
    /* E ELE NÃO TEM SEGUNDA OPINIÃO. A regra velha, que a Story 2.6 corrigiu,
       é `publicado_em !== null` — se ela reaparecer numa tela, as duas pontas
       voltam a discordar sobre o mesmo Post. */
    afirmar(
      "e não reescreve a regra que a Story 2.6 já corrigiu — `publicado_em !== null` não decide nada no Painel",
      !/publicado_em\s*!==\s*null/.test(doEditor) &&
        !/publicado_em\s*!==\s*null/.test(mascararComentariosJs(ler("src/admin/blog/enderecos.js"))),
      "sem segunda opinião",
    );

    /* E A DESCRIÇÃO NOMEIA OS DOIS ENDEREÇOS. "O endereço vai mudar" obrigaria
       o Autor a lembrar o que digitou três campos acima. */
    const frase = enderecosDoPainel.descricaoDaTrocaDeEndereco({
      de: "endereco-antigo",
      para: "endereco-novo",
    });
    afirmar(
      "e a frase da confirmação NOMEIA os dois endereços — ver os dois lado a lado é o que a torna uma conferência",
      frase.includes("endereco-antigo") && frase.includes("endereco-novo"),
      frase.slice(0, 120),
    );

    /* ── E `jaEsteveNoAr` RESPONDE CERTO ─────────────────────────────── */
    //
    // Ela é a raiz das duas decisões, e a Story 2.6 já a corrigiu uma vez.

    const CASOS_DO_AR = [
      ["rascunho com data no passado — invisível por construção", { estado: "rascunho", publicado_em: ONTEM }, false],
      ["publicado com data no passado", { estado: "publicado", publicado_em: ONTEM }, true],
      ["agendado por vir — ninguém viu", { estado: "agendado", publicado_em: AMANHA }, false],
      ["agendado cuja hora chegou", { estado: "agendado", publicado_em: ONTEM }, true],
      ["arquivado que esteve no ar — o link continua na mão de quem guardou", { estado: "arquivado", publicado_em: ONTEM }, true],
      ["sem data nenhuma", { estado: "publicado", publicado_em: null }, false],
    ];
    const erradosNoAr = CASOS_DO_AR.filter(
      ([, post, esperado]) => estadosDominio.jaEsteveNoAr(post) !== esperado,
    );
    afirmar(
      `\`jaEsteveNoAr\` responde certo nos ${CASOS_DO_AR.length} casos — inclusive o rascunho com data, que é o engano que a Story 2.6 corrigiu`,
      erradosNoAr.length === 0,
      erradosNoAr.map(([n]) => n).join(" | ") || "os seis",
    );
  }

  const semDominio = await comDominio(null, () =>
    dirigir("blog.js", { method: "GET", url: "/api/blog?slug=qualquer" }),
  );
  afirmar(
    "sem Domínio Canônico a rota de página falha ALTO e NOMEADO — nunca serve com canônica relativa",
    semDominio.codigo === 500 &&
      String(semDominio.corpo ?? "").includes("VITE_DOMINIO_DO_SITE") &&
      !String(semDominio.corpo ?? "").includes("<html"),
    `${semDominio.codigo} | ${String(semDominio.corpo ?? "").slice(0, 90)}`,
  );

  /* ══ STORY 4.10: O VOCABULÁRIO, O REGISTRO E O MONITOR DE PAUSA ═══════ */
  //
  // O que precede julgou o COMPORTAMENTO das rotas — cabeçalho e corpo, num
  // servidor de mentira. Isto julga as peças PURAS por trás: o vocabulário
  // fechado de diagnóstico, o formato do registro, e a lógica do script que
  // detecta a pausa do Supabase — todas exercitadas por injeção.
  {
    secao("(4.10) o vocabulário de diagnóstico, o registro e o monitor de pausa");

    const diag10 = await import(
      pathToFileURL(path.join(raiz, "api", "_nucleo", "diagnostico.js")).href
    );

    /* ── O VOCABULÁRIO É FECHADO, ÚNICO E COMPLETO ────────────────────── */

    const NOMES_DE_DIAGNOSTICO = [
      "DIAGNOSTICO_OK",
      "DIAGNOSTICO_LEITURA_FALHOU",
      "DIAGNOSTICO_CONTEUDO_RECUSADO",
      "DIAGNOSTICO_SEM_DOMINIO",
      "DIAGNOSTICO_SEM_SHELL",
      "DIAGNOSTICO_REGIAO_AUSENTE",
      "DIAGNOSTICO_METODO_RECUSADO",
      "DIAGNOSTICO_SEM_NOME",
    ];
    const valoresDeclarados = NOMES_DE_DIAGNOSTICO.map((n) => diag10[n]);
    afirmar(
      `os ${NOMES_DE_DIAGNOSTICO.length} diagnósticos nomeados estão TODOS em \`DIAGNOSTICOS_CONHECIDOS\`, nos dois sentidos`,
      valoresDeclarados.every((v) => diag10.DIAGNOSTICOS_CONHECIDOS.includes(v)) &&
        diag10.DIAGNOSTICOS_CONHECIDOS.every((v) => valoresDeclarados.includes(v)),
      diag10.DIAGNOSTICOS_CONHECIDOS.join(", "),
    );
    afirmar(
      "e os valores são todos DISTINTOS — dois diagnósticos com o mesmo texto seriam indistinguíveis no registro",
      new Set(valoresDeclarados).size === valoresDeclarados.length,
      valoresDeclarados.join(", "),
    );

    /* ── O NÍVEL VEM DO PREFIXO, E O `ok` NÃO REGISTRA NADA ───────────── */

    afirmar(
      "`ok` não tem nível — é o caminho normal, e não é para logar nada",
      diag10.nivelDoDiagnostico(diag10.DIAGNOSTICO_OK) === null,
      String(diag10.nivelDoDiagnostico(diag10.DIAGNOSTICO_OK)),
    );
    for (const nome of ["DIAGNOSTICO_LEITURA_FALHOU", "DIAGNOSTICO_CONTEUDO_RECUSADO"]) {
      afirmar(
        `\`${diag10[nome]}\` (prefixo \`degradado:\`) registra em nível AVISO`,
        diag10.nivelDoDiagnostico(diag10[nome]) === "warn",
        String(diag10.nivelDoDiagnostico(diag10[nome])),
      );
    }
    for (const nome of ["DIAGNOSTICO_SEM_DOMINIO", "DIAGNOSTICO_SEM_SHELL", "DIAGNOSTICO_REGIAO_AUSENTE", "DIAGNOSTICO_METODO_RECUSADO", "DIAGNOSTICO_SEM_NOME"]) {
      afirmar(
        `\`${diag10[nome]}\` (prefixo \`falha:\`) registra em nível ERRO`,
        diag10.nivelDoDiagnostico(diag10[nome]) === "error",
        String(diag10.nivelDoDiagnostico(diag10[nome])),
      );
    }

    /* ── `registrarEvento`: O FORMATO, E A INJEÇÃO ────────────────────── */
    //
    // `escrever` é injetável pela mesma razão de `buscar` na leitura: o
    // caminho de registro se exercita sem depender de capturar saída de
    // console através de um limite de módulo.

    let capturado = null;
    diag10.registrarEvento({
      diagnostico: diag10.DIAGNOSTICO_LEITURA_FALHOU,
      rota: "blog",
      detalhe: "motivo de teste",
      escrever: (nivel, linha) => { capturado = { nivel, linha }; },
    });
    afirmar(
      "o registro sai em nível `warn` e no formato `[entrega:evento] {...}`, com diagnóstico, rota e detalhe",
      capturado?.nivel === "warn" &&
        capturado?.linha.startsWith("[entrega:evento] ") &&
        (() => {
          try {
            const dados = JSON.parse(capturado.linha.slice("[entrega:evento] ".length));
            return (
              dados.diagnostico === diag10.DIAGNOSTICO_LEITURA_FALHOU &&
              dados.rota === "blog" &&
              dados.detalhe === "motivo de teste"
            );
          } catch {
            return false;
          }
        })(),
      JSON.stringify(capturado),
    );
    /* CONTROLE: um diagnóstico `ok` NÃO chama `escrever`. Sem isto, um
       registro que sempre escrevesse passaria na asserção acima e ainda assim
       geraria log constante — ruído que ninguém lê no dia em que precisar. */
    let chamouParaOk = false;
    diag10.registrarEvento({
      diagnostico: diag10.DIAGNOSTICO_OK,
      escrever: () => { chamouParaOk = true; },
    });
    afirmar(
      "controle: um diagnóstico `ok` NÃO chama `escrever` — log constante é ruído, e a asserção acima não passa por um registro que grita sempre",
      chamouParaOk === false,
      String(chamouParaOk),
    );

    /* ── `monitorar-pausa.mjs`: A LÓGICA PURA, POR INJEÇÃO ────────────── */
    //
    // Ele busca o mapa, resolve UM Post a partir dele — não de um endereço
    // fixo escrito no código, que quebraria no dia em que aquele Post fosse
    // arquivado ou renomeado —, e compara o título dele com o da home.

    const monitor = await import(
      pathToFileURL(path.join(raiz, "scripts", "monitorar-pausa.mjs")).href
    );

    afirmar(
      "resolve o endereço do PRIMEIRO Post a partir do XML do mapa",
      monitor.enderecoDoPrimeiroPost(
        "<urlset><url><loc>https://x/</loc></url><url><loc>https://x/blog/artigo-a</loc></url></urlset>",
        "https://x",
      ) === "https://x/blog/artigo-a",
      monitor.enderecoDoPrimeiroPost("<urlset></urlset>", "https://x") ?? "nulo",
    );
    afirmar(
      "mapa sem Post nenhum devolve `null` — não um endereço inventado",
      monitor.enderecoDoPrimeiroPost("<urlset><url><loc>https://x/</loc></url></urlset>", "https://x") === null,
      String(monitor.enderecoDoPrimeiroPost("<urlset><url><loc>https://x/</loc></url></urlset>", "https://x")),
    );
    afirmar(
      "extrai o texto de `<title>`",
      monitor.extrairTitulo("<html><head><title>Um Artigo</title></head></html>") === "Um Artigo",
      monitor.extrairTitulo("<html><head><title>Um Artigo</title></head></html>") ?? "nulo",
    );
    afirmar(
      "sem `<title>`, devolve `null`",
      monitor.extrairTitulo("<html><body>sem título</body></html>") === null,
      String(monitor.extrairTitulo("<html><body>sem título</body></html>")),
    );

    /* ★ A COMPARAÇÃO: É O CORAÇÃO DO ALARME ★
       Título IGUAL ao da home é o sinal de que a rota degradou (Story 4.10) —
       o shell cru tem o título da home. Título DIFERENTE é saúde. E qualquer
       coisa que impeça a comparação (sem Post, sem título) é tratada como
       ALARME: o custo de um alarme falso é uma olhada; o custo de um silêncio
       falso é dias sem ninguém saber que o blog caiu. */
    const CASOS_DO_MONITOR = [
      [
        "título do Post diferente do da home — saudável",
        { enderecoDoPost: "https://x/blog/a", tituloDoPost: "Artigo A", tituloDaHome: "ChatClean" },
        false,
      ],
      [
        "título do Post IGUAL ao da home — sinal de degradação",
        { enderecoDoPost: "https://x/blog/a", tituloDoPost: "ChatClean", tituloDaHome: "ChatClean" },
        true,
      ],
      [
        "nenhum Post no mapa — não dá para confirmar saúde",
        { enderecoDoPost: null, tituloDoPost: null, tituloDaHome: "ChatClean" },
        true,
      ],
      [
        "o Post não respondeu com título nenhum",
        { enderecoDoPost: "https://x/blog/a", tituloDoPost: null, tituloDaHome: "ChatClean" },
        true,
      ],
      [
        "a home não respondeu com título nenhum",
        { enderecoDoPost: "https://x/blog/a", tituloDoPost: "Artigo A", tituloDaHome: null },
        true,
      ],
    ];
    const erradosNoMonitor = CASOS_DO_MONITOR.filter(
      ([, entrada, esperado]) => monitor.avaliarPausa(entrada).alerta !== esperado,
    );
    afirmar(
      `\`avaliarPausa\` decide certo nos ${CASOS_DO_MONITOR.length} casos — inclusive os de incerteza, que viram alarme e não saúde`,
      erradosNoMonitor.length === 0,
      erradosNoMonitor.map(([n]) => n).join(" | ") || `os ${CASOS_DO_MONITOR.length}`,
    );
    afirmar(
      "controle: a matriz do monitor tem caso de ALARME e de SAÚDE — uma função que sempre alarmasse passaria numa matriz de um lado só",
      CASOS_DO_MONITOR.some(([, , e]) => e === true) &&
        CASOS_DO_MONITOR.some(([, , e]) => e === false),
      `${CASOS_DO_MONITOR.filter(([, , e]) => e).length} alarme / ${CASOS_DO_MONITOR.filter(([, , e]) => !e).length} saúde`,
    );

    /* ── A ORQUESTRAÇÃO INTEIRA, COM `buscar` INJETADO ────────────────── */

    const buscarDeMentira = (respostas) => async (url) => {
      const resposta = respostas[url];
      if (resposta === undefined) return { ok: false, text: async () => "" };
      return { ok: true, text: async () => resposta };
    };

    const semDegradacao = await monitor.verificarPausa({
      raiz: "https://x",
      buscar: buscarDeMentira({
        "https://x/sitemap.xml":
          "<urlset><url><loc>https://x/blog/artigo-a</loc></url></urlset>",
        "https://x/blog/artigo-a": "<title>Artigo A</title>",
        "https://x/": "<title>ChatClean</title>",
      }),
    });
    afirmar(
      "fim a fim, saudável: título do Post diferente do da home ⇒ sem alarme",
      semDegradacao.alerta === false,
      semDegradacao.motivo,
    );

    const comDegradacao = await monitor.verificarPausa({
      raiz: "https://x",
      buscar: buscarDeMentira({
        "https://x/sitemap.xml":
          "<urlset><url><loc>https://x/blog/artigo-a</loc></url></urlset>",
        "https://x/blog/artigo-a": "<title>ChatClean</title>",
        "https://x/": "<title>ChatClean</title>",
      }),
    });
    afirmar(
      "fim a fim, degradado: o Post responde com o título da home ⇒ ALARME — é o sintoma exato da Story 4.10",
      comDegradacao.alerta === true,
      comDegradacao.motivo,
    );

    const semMapaNenhum = await monitor.verificarPausa({
      raiz: "https://x",
      buscar: buscarDeMentira({}),
    });
    afirmar(
      "fim a fim, sem `/sitemap.xml` respondendo: ALARME — sem o mapa não há como escolher um Post",
      semMapaNenhum.alerta === true,
      semMapaNenhum.motivo,
    );
  }
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
