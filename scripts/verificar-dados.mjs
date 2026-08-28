#!/usr/bin/env node
/**
 * Ferramenta de verificação da camada de dados do blog (Story 2.2).
 *
 * Mesmo contrato das anteriores: uma linha por asserção, código 0 se todas
 * passarem, 1 caso contrário. Uma asserção por linha da matriz de I/O da
 * story — e os módulos de `src/data/blog/` são IMPORTADOS E EXECUTADOS, nunca
 * lidos como texto.
 *
 *   (a) ESTÁTICO, e só o que texto pode provar: a direção de dependência.
 *       `data/blog` não instancia cliente, não importa React, não conhece
 *       tela — e não repete o filtro de visibilidade em consulta alguma.
 *
 *   (b) O CONTRATO DE RETORNO, executado: os cinco tipos, os construtores, o
 *       tradutor que classifica resposta do PostgREST, e a validação de forma
 *       que impede `undefined` de chegar à tela.
 *
 *   (c) A ORDENAÇÃO, executada: `COALESCE(publicado_em, atualizado_em) DESC`
 *       sobre casos em que a ordem do servidor sozinha daria outro resultado.
 *
 *   (d) AMBIENTE E REDE, em subprocesso: a camada precisa produzir erro de
 *       configuração com `.env` vazio e erro de rede com o servidor fora, e os
 *       clientes são memoizados por módulo — só um processo novo, com outro
 *       ambiente, prova isso de verdade.
 *
 *   (e) COMPORTAMENTO REAL contra o projeto, e é a seção que justifica a
 *       story: com uma SESSÃO VÁLIDA ABERTA no cliente autenticado, a leitura
 *       pela camada PÚBLICA não traz rascunho — enquanto a mesma base, lida
 *       pela camada do Painel no mesmo instante, traz. Ler no código que o
 *       cliente público tem `persistSession: false` prova apenas que ele não
 *       GUARDA sessão; a garantia que o critério de aceite pede é observável.
 *
 * Sem `SUPABASE_ACCESS_TOKEN` no ambiente as asserções de (e) FALHAM como
 * ausentes — nunca são puladas em silêncio.
 *
 * Uso: npm run verificar:dados
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  executarScript,
  executarSql,
  lerToken,
  literal,
  NOME_PROJETO,
  raiz,
  REF_PROJETO,
  registrarSegredo,
  sanitizar,
  TIMEOUT_MS,
  URL_PROJETO,
} from "./supabase-comum.mjs";
// A Conta temporária nasce pelo MESMO SQL do onboarding real: uma sessão de
// teste aberta por outro caminho não provaria nada sobre o caminho de verdade.
import { sqlDeCriacaoDeConta, sqlDeRemocaoDeConta } from "./criar-conta.mjs";
/* A regra de resolução da imagem de compartilhamento é função PURA de domínio:
   ela é importada e EXECUTADA, nunca lida como texto. Vive nesta ferramenta
   porque é a dona da cadeia de dados que representa um Post — e porque ela não
   precisa de rede nenhuma para se provar. */
import {
  CAMPOS_DE_SEO,
  COMPRIMENTO_USUAL_DE_SEO,
  DEFEITO_DE_DOMINIO_AUSENTE,
  DISTANCIA_MINIMA_ENTRE_OS_DOIS,
  ESPECIES_FORA_DA_PREVIA,
  IMAGEM_PADRAO_DO_SITE,
  LOGOTIPO_DA_MARCA,
  CAMPOS_DE_TEXTO_DE_SEO,
  ORIGENS_DA_DESCRICAO,
  ORIGENS_DA_IMAGEM,
  ORIGENS_DO_TITULO,
  RECUSA_DE_ENDERECO_INALCANCAVEL,
  ROTULOS_DE_SEO,
  TETO_DE_HIGIENE_DE_SEO,
  TIPOS_NA_PREVIA,
  TIPO_POR_EXTENSAO,
  caracteresDe,
  enderecoDaImagemPadrao,
  enderecoDoLogotipo,
  metadadosDoPost,
  problemaNoTextoDeSeo,
  tipoDaImagem,
} from "../src/domain/blog/compartilhamento.js";
/* O módulo INTEIRO, para a asserção que cobra que não exista uma segunda porta
   de entrada para a mesma cadeia de herança. Nomear só o que se importa não
   permitiria perguntar o que MAIS ele exporta. */
import * as moduloDeCompartilhamento from "../src/domain/blog/compartilhamento.js";

/**
 * A parte da IMAGEM do que um Post declara, com as recusas ao lado.
 *
 * Atalho de LEITURA desta ferramenta, e não uma segunda cadeia: ele chama
 * `metadadosDoPost` — a função única — e recorta. As asserções da Story 3.3
 * foram escritas quando a função só respondia pela imagem, e mantê-las lendo o
 * mesmo formato preserva o que elas provam; o que a 3.4 acrescentou é afirmado
 * sobre o resultado INTEIRO, logo adiante.
 */
/*
 * O ATALHO DA STORY 3.3 — e por que ele é CONGELADO.
 *
 * As asserções da 3.3 falam da imagem sozinha, e várias delas perguntam pelo
 * congelamento. Enquanto este atalho devolvia um objeto novo e mutável, essas
 * asserções mediam a CÓPIA: o domínio podia parar de congelar e elas
 * continuariam verdes. Congelar aqui restabelece o que elas pensavam estar
 * medindo, e o congelamento do valor REAL é afirmado em (h), sobre o resultado
 * de `metadadosDoPost` — mais a asserção de FIDELIDADE logo abaixo dela, que
 * prende o atalho ao original campo a campo.
 */
const imagemDoPost = (post, opcoes) => {
  const metadados = metadadosDoPost(post, opcoes);
  return Object.freeze({ ...metadados.imagem, recusadas: metadados.recusadas });
};
import {
  TIPOS_DE_IMAGEM,
  enderecoDeImagemPermitido,
  problemaNoEnderecoDaImagem,
} from "../src/domain/blog/arquivos.js";

let falhas = 0;
let adiadas = 0;
/** Toda asserção emitida — passe, falhe ou seja adiada. Sustenta a conferência
 *  de que o bloco que exige sessão exercitou tudo o que promete exercitar. */
let emitidas = 0;

/**
 * Adiar por limite de taxa deixa de derrubar a execução SÓ com esta variável
 * ligada, e explicitamente. O padrão é código 1: uma execução em que a prova
 * de separação não rodou não pode terminar verde, porque um vazamento de
 * rascunho pela camada pública passaria batido exatamente aí.
 */
const TOLERA_ADIADAS = /^(1|true|sim)$/i.test(
  String(process.env.VERIFICAR_TOLERAR_ADIADAS ?? "").trim(),
);

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const DIR_DADOS = path.join(raiz, "src", "data", "blog");

function secao(titulo) {
  console.log(`\n${titulo}`);
}

/**
 * Asserção que o ambiente impediu de exercer — hoje, só o limite de taxa do
 * GoTrue. NÃO é sucesso: o veredito final avisa.
 */
function adiar(descricao, motivo) {
  adiadas += 1;
  emitidas += 1;
  console.log(`  ADIADA ${descricao} — ${sanitizar(motivo)}`);
}

/**
 * O servidor esteve indisponivel, em vez de ter respondido errado?
 *
 * Observado tres vezes em execucoes diferentes: a API respondeu 502 com pagina
 * HTML, e a execucao seguinte passou sem nenhuma alteracao no codigo. Tratar
 * isso como defeito e pior do que parece — falha que nao e falha ensina a
 * pessoa a ignorar falhas, e a suite inteira depende de verde significar algo.
 *
 * O criterio e ESTREITO de proposito: so indisponibilidade declarada pelo
 * transporte. Erro de dados, recusa por permissao e resultado errado continuam
 * sendo falha, porque sao exatamente o que estas assercoes existem para pegar.
 */
const MARCAS_DE_INDISPONIBILIDADE = [
  "502",
  "503",
  "504",
  "Bad Gateway",
  "Service Unavailable",
  "Gateway Timeout",
  "upstream connect error",
];

function indisponivel(detalhe) {
  const t = String(detalhe ?? "");
  if (!t.includes('"tipo":"rede"') && !t.includes("HTTP 5")) return false;
  return MARCAS_DE_INDISPONIBILIDADE.some((m) => t.includes(m));
}

function afirmar(descricao, condicao, detalhe = "") {
  emitidas += 1;
  if (condicao) {
    console.log(`  OK    ${descricao}`);
    return true;
  }
  // Indisponibilidade nao e defeito — mas tambem NAO e sucesso: vai para o
  // mesmo balde das adiadas, que o veredito final cobra.
  if (indisponivel(detalhe)) {
    adiadas += 1;
    console.log(
      `  ADIADA ${descricao} — servidor indisponivel agora, nao defeito: ${sanitizar(String(detalhe).slice(0, 120))}`,
    );
    return false;
  }
  falhas += 1;
  console.log(
    `  FALHA ${descricao}${detalhe ? ` — ${sanitizar(detalhe)}` : ""}`,
  );
  return false;
}

/* ─── Ambiente do navegador, reproduzido aqui ────────────────────────────── */

/**
 * Os módulos leem `import.meta.env.VITE_*` no navegador e caem para o
 * ambiente do processo fora dele. Ler `.env` aqui e plantar no `process.env`
 * ANTES do import é o que permite executar a camada de verdade, sem stub e sem
 * cópia do código de instanciação.
 *
 * **Só `.env`, nunca `.env.example`.** A queda para o exemplo parecia
 * conveniente e era mentira: como o exemplo tem os valores REAIS versionados,
 * um `.env` ausente faria `ambienteCompleto` virar verdadeiro, a camada
 * responderia 401 em toda leitura e as asserções apontariam para o produto —
 * o oposto exato da promessa de que "sem ambiente, nada abaixo prova nada".
 *
 * A leitura é ancorada e linha a linha: uma regex solta casaria com a linha
 * COMENTADA que documenta a variável, e a "chave" lida seria prosa. Comentário
 * no fim da linha (`CHAVE=valor # nota`) é descartado pelo mesmo motivo.
 */
function lerDoEnv(nome) {
  const caminho = path.join(raiz, ".env");
  if (!existsSync(caminho)) return null;
  for (const linha of readFileSync(caminho, "utf8").split(/\r?\n/)) {
    if (/^\s*#/.test(linha)) continue;
    const m = new RegExp(`^\\s*(?:export\\s+)?${nome}\\s*=\\s*(.*)$`).exec(linha);
    if (!m) continue;
    const valor = m[1]
      .replace(/\s+#.*$/, "")
      .trim()
      .replace(/^["']|["']$/g, "");
    return valor === "" ? null : valor;
  }
  return null;
}

const urlDoEnv = lerDoEnv("VITE_SUPABASE_URL");
const chavePublicavel = lerDoEnv("VITE_SUPABASE_PUBLISHABLE_KEY");

if (urlDoEnv) process.env.VITE_SUPABASE_URL = urlDoEnv;
if (chavePublicavel) process.env.VITE_SUPABASE_PUBLISHABLE_KEY = chavePublicavel;

const urlDe = (relativo) => pathToFileURL(path.join(raiz, relativo)).href;

/* ─── Chamada instrumentada: nada lança, tudo cumpre o contrato ──────────── */

let chamadas = 0;
const lancaram = [];
const foraDoContrato = [];

await executarScript(async () => {

const ambienteCompleto = afirmar(
  "VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY foram lidas do `.env`",
  Boolean(urlDoEnv) && Boolean(chavePublicavel),
  "sem elas a camada não tem como falar com o projeto — nada abaixo provaria nada. `.env.example` NÃO serve de substituto: seus valores reais fariam esta ferramenta passar sobre um ambiente que ninguém configurou",
);
afirmar(
  `o ambiente aponta para o mesmo projeto das ferramentas (${REF_PROJETO})`,
  !ambienteCompleto || String(urlDoEnv).includes(REF_PROJETO),
  `VITE_SUPABASE_URL=${urlDoEnv} — comparar leitura da camada com leitura anônima exigiria o mesmo projeto`,
);

/* ─── (a) A direção de dependência, que é o que texto PODE provar ────────── */

secao("(a) fronteira de camadas: data/blog só conhece domínio e cliente");

/**
 * Comentários trocados por espaço. Estas asserções decidem sobre CÓDIGO: os
 * arquivos da camada explicam em prosa exatamente a regra que a varredura
 * procura — "usam exclusivamente `clientePublico()`" — e prosa não instancia
 * cliente nem repete filtro.
 */
function semComentarios(texto) {
  return String(texto)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const arquivosDaCamada = (() => {
  try {
    return readdirSync(DIR_DADOS)
      .filter((n) => n.endsWith(".js"))
      .map((n) => ({ nome: n, texto: readFileSync(path.join(DIR_DADOS, n), "utf8") }));
  } catch {
    return [];
  }
})();

afirmar(
  "src/data/blog/ tem os módulos da story",
  ["resultado.js", "comum.js", "posts.js", "taxonomia.js", "slugs.js", "arquivos.js"].every((n) =>
    arquivosDaCamada.some((a) => a.nome === n),
  ),
  `encontrados: ${arquivosDaCamada.map((a) => a.nome).join(", ") || "nenhum"}`,
);

{
  // A obtenção de cliente vive num lugar só. Três cópias com assinaturas
  // diferentes fariam "a escolha do cliente é do módulo" virar três regras
  // parecidas — e a exigência de sessão do Painel, em especial, precisa ser
  // declarada uma única vez.
  const instanciadores = arquivosDaCamada
    .filter(
      (a) =>
        a.nome !== "comum.js" &&
        /\b(clientePublico|clienteAutenticado)\s*\(/.test(semComentarios(a.texto)),
    )
    .map((a) => a.nome);
  afirmar(
    "só `comum.js` chama clientePublico()/clienteAutenticado()",
    instanciadores.length === 0,
    instanciadores.join(", "),
  );
  const semSessao = /getSession\(\)/.test(
    semComentarios(arquivosDaCamada.find((a) => a.nome === "comum.js")?.texto ?? ""),
  );
  afirmar(
    "a exigência de sessão do Painel está declarada em `comum.js`",
    semSessao,
  );
}

/* ── A ESCOLHA DE CLIENTE É INCONDICIONAL, POR FUNÇÃO (Story 2.13) ────────
   É a incondicionalidade que faz o endereço público de um rascunho responder
   ausência TAMBÉM para o Autor logado: o cliente da leitura pública não olha se
   há sessão, então não há o que "aproveitar" quando ela existe. Um `if` que
   escolhesse o cliente do Painel quando houvesse sessão faria a página pública
   ler autenticada — e o rascunho apareceria para quem tem o Painel aberto, que
   é exatamente a razão de a prévia viver sob `/admin`.

   A asserção é por CORPO de função, e não por arquivo: os dois clientes convivem
   em `posts.js`, e olhar o arquivo inteiro não distinguiria nada. */
{
  /**
   * O corpo de uma função — exportada ou não —, com as chaves BALANCEADAS.
   *
   * A primeira versão fatiava "até o próximo `export`", e isso atribuía ao alvo
   * o código de qualquer auxiliar privado declarado depois dele: um `if
   * (temSessao) clienteDoPainelOuFalha(...)` num helper vizinho apareceria como
   * se fosse da função julgada, e o contrário também — uma escolha de cliente
   * escondida num helper passaria pela leitura da função anterior. O autoteste
   * antigo só usava duas exportadas em sequência, então nunca viu o modo de
   * erro.
   */
  function corpoDaFuncao(fonte, nome) {
    const inicio = new RegExp(
      `(?:export\\s+)?(?:async\\s+)?function\\s+${nome}\\s*\\(`,
    ).exec(fonte);
    if (inicio === null) return null;
    /* A LISTA DE PARÂMETROS PRIMEIRO. Sem isto, a desestruturação do argumento
       — `listarPostsDoPainel({ limite, termo } = {})`, que é a forma normal
       aqui — daria a primeira `{` do corpo, e o balanceamento fecharia dentro
       dos parâmetros: o corpo julgado seria vazio, e a asserção passaria a ler
       nada. */
    let parenteses = 1;
    let i = inicio.index + inicio[0].length;
    for (; i < fonte.length && parenteses > 0; i += 1) {
      if (fonte[i] === "(") parenteses += 1;
      else if (fonte[i] === ")") parenteses -= 1;
    }
    if (parenteses !== 0) return null;
    /* A LISTA DE PARÂMETROS VAI JUNTO (Story 3.1). Ela era descartada, e com
       ela ia embora a obtenção de cliente por PARÂMETRO PADRÃO —
       `{ obterCliente = clienteDoPainelOuFalha } = {}` mora na assinatura, não
       no corpo. O envio da capa obtinha o cliente do Painel e a asserção lia um
       corpo em que ele não aparecia: a função era declarada na lista de
       permissão e reprovada por não conter o que estava logo acima dela.
       Julgar a assinatura junto do corpo é o que faz a costura injetável ser
       vista pelo que ela é — uma escolha de cliente com valor padrão. */
    const assinatura = fonte.slice(inicio.index, i);
    const abertura = fonte.indexOf("{", i);
    if (abertura === -1) return null;
    let profundidade = 0;
    for (let i = abertura; i < fonte.length; i += 1) {
      const c = fonte[i];
      if (c === "{") profundidade += 1;
      else if (c === "}") {
        profundidade -= 1;
        if (profundidade === 0) return assinatura + fonte.slice(abertura, i + 1);
      }
    }
    return null;
  }

  /**
   * Quais clientes um corpo OBTÉM, na ordem em que os obtém.
   *
   * A declaração das duas funções não conta como obtenção — senão `comum.js`,
   * que é onde elas nascem, apareceria como se pedisse cliente duas vezes.
   */
  function clientesDe(corpo) {
    return [
      ...semComentarios(corpo).matchAll(
        /* DUAS FORMAS DE OBTER, e a segunda entrou na Story 3.1.

           A primeira é a CHAMADA (`clienteDoPainelOuFalha(op)`). A segunda é o
           PARÂMETRO PADRÃO (`{ obterCliente = clienteDoPainelOuFalha }`), que é
           a costura injetável que `escrita.js` estabeleceu e o envio da capa
           reusa: ali a obtenção não tem parêntese na frente, e o detector antigo
           simplesmente não a via. O envio da capa atravessou esta varredura sem
           ser julgado, e a lista "fechada" tinha um buraco do tamanho dele.

           O segundo padrão exige o `=` na frente, e não uma pontuação
           qualquer: sem isso ele casaria com a linha de IMPORT de todo módulo
           que consome as funções, e a contagem passaria a acusar sete pontos
           que não obtêm nada — foi o que aconteceu na primeira tentativa. */
        /(?<!function\s)\bcliente(Publico|DoPainel)OuFalha\s*\(|=\s*cliente(Publico|DoPainel)OuFalha\b/g,
      ),
    ].map((m) => m[1] ?? m[2]);
  }

  /* AUTOTESTE dos dois detectores. Sem ele, um extrator que devolvesse corpo
     vazio faria todas as asserções abaixo passarem sobre nada. */
  {
    const sintetico =
      "export async function publica(a) {\n" +
      "  const cliente = clientePublicoOuFalha(op);\n" +
      "}\n" +
      "export async function mista(a) {\n" +
      "  if (temSessao) return clienteDoPainelOuFalha(op);\n" +
      "  const cliente = clientePublicoOuFalha(op);\n" +
      "}\n";
    afirmar(
      "o extrator de corpo e o detector de cliente acusam a função que ESCOLHE o cliente — e não confundem uma com a outra",
      corpoDaFuncao(sintetico, "publica") !== null &&
        JSON.stringify(clientesDe(corpoDaFuncao(sintetico, "publica"))) ===
          JSON.stringify(["Publico"]) &&
        JSON.stringify(clientesDe(corpoDaFuncao(sintetico, "mista"))) ===
          JSON.stringify(["DoPainel", "Publico"]) &&
        corpoDaFuncao(sintetico, "naoExiste") === null,
      JSON.stringify(clientesDe(corpoDaFuncao(sintetico, "mista") ?? "")),
    );
    /* O MODO DE ERRO QUE O EXTRATOR ANTIGO TINHA: ele fatiava "até o próximo
       `export`", então um auxiliar PRIVADO declarado entre duas exportações
       caía no corpo da anterior — e a escolha de cliente dele era lida como se
       fosse dela. O autoteste antigo nunca viu isso porque só usava duas
       exportadas em sequência. */
    const comAuxiliar =
      "export async function alvo(a) {\n" +
      "  const cliente = clientePublicoOuFalha(op);\n" +
      "  return cliente;\n" +
      "}\n" +
      "async function auxiliarPrivado(b) {\n" +
      "  return clienteDoPainelOuFalha(op);\n" +
      "}\n" +
      "export async function outra(c) {\n" +
      "  return clienteDoPainelOuFalha(op);\n" +
      "}\n";
    /* AUTOTESTE DA FORMA NOVA. Sem ele, a expressão regular podia continuar
       cega ao parâmetro padrão e a lista fechada continuaria com o buraco —
       verde, sobre um módulo que obtém cliente e ninguém julga. */
    {
      const comPadrao =
        "export async function envia(a, { obterCliente = clienteDoPainelOuFalha } = {}) {\n" +
        "  const c = await obterCliente(op);\n" +
        "}\n";
      afirmar(
        "o detector vê a obtenção por PARÂMETRO PADRÃO, e não só a chamada direta",
        JSON.stringify(clientesDe(comPadrao)) === JSON.stringify(["DoPainel"]),
        JSON.stringify(clientesDe(comPadrao)),
      );
      /* E O EXTRATOR PRECISA ENTREGAR A ASSINATURA JUNTO. Sem isto, o detector
         acima estaria certo e a asserção continuaria falhando — a obtenção mora
         num pedaço de texto que o extrator descartava. */
      afirmar(
        "e o extrator de corpo entrega a ASSINATURA junto, que é onde o parâmetro padrão mora",
        JSON.stringify(clientesDe(corpoDaFuncao(comPadrao, "envia") ?? "")) ===
          JSON.stringify(["DoPainel"]),
        JSON.stringify(corpoDaFuncao(comPadrao, "envia")),
      );
      afirmar(
        "e continua não confundindo a DECLARAÇÃO das duas funções com uma obtenção",
        clientesDe("export async function clienteDoPainelOuFalha(operacao) {").length === 0 &&
          clientesDe("export function clientePublicoOuFalha(operacao) {").length === 0,
        JSON.stringify(clientesDe("export async function clienteDoPainelOuFalha(operacao) {")),
      );
    }

    afirmar(
      "e um auxiliar PRIVADO declarado depois não entra no corpo da função anterior — nem some da conta",
      JSON.stringify(clientesDe(corpoDaFuncao(comAuxiliar, "alvo") ?? "")) ===
        JSON.stringify(["Publico"]) &&
        JSON.stringify(
          clientesDe(corpoDaFuncao(comAuxiliar, "auxiliarPrivado") ?? ""),
        ) === JSON.stringify(["DoPainel"]),
      JSON.stringify(clientesDe(corpoDaFuncao(comAuxiliar, "alvo") ?? "")),
    );
  }

  const PUBLICAS = [
    ["posts.js", "listarPostsPublicos"],
    ["posts.js", "lerPostPublicoPorSlug"],
    /* Auxiliar PRIVADO de `taxonomia.js`, e é por ele que `listarCategorias` e
       `listarTags` obtêm cliente. Ele não é exportado — e é justamente por isso
       que precisa estar aqui: a lista de permissão só é fechada se cobrir todo
       ponto que obtém cliente, e não só os que têm `export` na frente. */
    ["taxonomia.js", "listarVerbetes"],
    ["slugs.js", "resolverSlugAposentado"],
    /* As três leituras que a Story 2.15 abriu para o site: a busca própria do
       Blog Público, os relacionados por Categoria e as Tags do artigo. Elas
       entram na lista de PERMISSÃO pela mesma razão que as de cima — é a
       incondicionalidade do cliente anônimo que faz o rascunho não vazar para o
       Autor logado no mesmo navegador, e é exatamente nas funções novas que ela
       poderia ser desfeita sem ninguém perceber. */
    ["posts.js", "buscarPostsPublicos"],
    ["posts.js", "listarRelacionadosPublicos"],
    ["taxonomia.js", "listarTagsDoPostPublico"],
  ];
  const DO_PAINEL = [
    ["posts.js", "listarPostsDoPainel"],
    /* A leitura que a pré-visualização usa (Story 2.13). Ela precisa do cliente
       COM sessão: sem ele o PostgREST não recusa — responde 200 com o
       subconjunto anônimo, e a prévia de um rascunho abriria vazia sem que nada
       tivesse falhado. */
    ["posts.js", "lerPostDoPainelPorId"],
    ["taxonomia.js", "listarTagsDoPostNoPainel"],
    /* Story 2.14: a leitura de Categorias do PAINEL traz a CONTAGEM de Posts de
       cada uma, e a contagem roda sob a RLS de `posts`. Pelo cliente anônimo
       ela contaria só o que está no ar, e a tela diria "nenhum post usa esta
       categoria" sobre uma Categoria com três rascunhos — bem na hora em que
       alguém decide se pode excluí-la. */
    ["taxonomia.js", "listarCategoriasDoPainel"],
    /* Story 3.1: o ENVIO DA CAPA. Ele obtém o cliente do Painel porque a
       política do bucket exige sessão para inserir — com o cliente anônimo o
       Storage recusa, e a recusa chegaria depois de o arquivo ter subido pela
       metade. Ele entra na lista pela mesma razão que os outros: é a
       incondicionalidade da escolha do cliente que o torna previsível. */
    ["arquivos.js", "enviarImagemDeCapa"],
    /* E a REMOÇÃO da capa que o servidor nunca viu (Story 3.1, revisão).
       Ela obtém o cliente do Painel pela mesma razão que o envio: a política
       do bucket exige sessão para remover, e é ela que dá uso à capacidade
       que o bucket concede. A lista fechada a acusou assim que ela nasceu —
       que é exatamente o que ela existe para fazer. */
    ["arquivos.js", "removerImagemDeCapa"],
    /* Editor Tiptap avançado: o ENVIO DA IMAGEM DO CORPO — espelho exato de
       `enviarImagemDeCapa`, mesma razão: a política do bucket exige sessão
       para inserir, e a incondicionalidade da escolha do cliente é o que
       torna a recusa previsível em vez de um envio pela metade. */
    ["arquivos.js", "enviarImagemDoCorpo"],
    /* E as Tags SUGERIDAS também (Story 2.14). Elas vinham do cliente público,
       e a política anônima de `tags` só devolve Tag associada a Post visível:
       uma Tag criada num rascunho nunca era sugerida — que é exatamente o caso
       em que o Autor recria "Atendimento" com outra grafia. */
    ["taxonomia.js", "listarTagsDoPainel"],
  ];
  const corpoDe = ([arquivo, nome]) => {
    const fonte = arquivosDaCamada.find((a) => a.nome === arquivo)?.texto ?? "";
    return corpoDaFuncao(fonte, nome);
  };

  const problemasPublicos = PUBLICAS.filter((alvo) => {
    const corpo = corpoDe(alvo);
    return (
      corpo === null || JSON.stringify(clientesDe(corpo)) !== JSON.stringify(["Publico"])
    );
  }).map(([a, n]) => `${a}:${n}`);
  afirmar(
    "toda leitura PÚBLICA obtém exatamente UM cliente, e ele é o anônimo — sem ramo, sem condição, sem sessão consultada",
    problemasPublicos.length === 0,
    problemasPublicos.join(", "),
  );

  const comSessaoConsultada = PUBLICAS.filter((alvo) => {
    const corpo = corpoDe(alvo) ?? "";
    return /getSession|access_token|\bsessao\b/i.test(semComentarios(corpo));
  }).map(([a, n]) => `${a}:${n}`);
  afirmar(
    "e nenhuma delas sequer PERGUNTA se há sessão — é essa incondicionalidade que faz o rascunho não vazar para o Autor logado",
    comSessaoConsultada.length === 0,
    comSessaoConsultada.join(", "),
  );

  const problemasDoPainel = DO_PAINEL.filter((alvo) => {
    const corpo = corpoDe(alvo);
    return (
      corpo === null || JSON.stringify(clientesDe(corpo)) !== JSON.stringify(["DoPainel"])
    );
  }).map(([a, n]) => `${a}:${n}`);
  afirmar(
    "e a leitura que a prévia usa obtém o cliente DO PAINEL — sem sessão o PostgREST não recusa, responde o subconjunto anônimo",
    problemasDoPainel.length === 0,
    problemasDoPainel.join(", "),
  );

  /* ─── E A LISTA É FECHADA: TODO ponto que obtém cliente está numa delas ──
     Sem esta asserção, "lista de permissão" é só um nome: uma função nova que
     obtivesse cliente — ou um auxiliar privado, que foi exatamente o caso de
     `listarVerbetes` — simplesmente não seria julgada, e a garantia teria um
     buraco do tamanho dela sem ninguém saber. A contagem é sobre OCORRÊNCIAS,
     não sobre nomes: é assim que uma segunda obtenção dentro de uma função já
     listada também cai aqui. */
  {
    const declarados = [...PUBLICAS, ...DO_PAINEL];
    const cobertas = declarados.reduce(
      (total, alvo) => total + clientesDe(corpoDe(alvo) ?? "").length,
      0,
    );
    /* `comum.js` fica de fora: é lá que as duas funções NASCEM, e o corpo delas
       fala com `clientePublico()`/`clienteAutenticado()`, não consigo mesmas. A
       asserção logo acima já cobra que ninguém mais os instancie. */
    const existentes = arquivosDaCamada
      .filter((a) => a.nome !== "comum.js")
      .reduce((total, a) => total + clientesDe(a.texto).length, 0);
    afirmar(
      "TODO ponto da camada que obtém cliente está numa das duas listas — a lista de permissão é fechada, e não uma amostra",
      cobertas === existentes && existentes > 0,
      `declarados: ${cobertas} | existentes: ${existentes} — a diferença é um ponto que ninguém está julgando`,
    );
    /* AUTOTESTE: um ponto plantado FORA das listas precisa mudar a conta. */
    afirmar(
      "e a contagem acusa um ponto plantado fora das listas",
      clientesDe(
        "async function novaFuncaoNinguemJulga() { return clienteDoPainelOuFalha(op); }",
      ).length === 1,
    );
  }
}

{
  const comCreateClient = arquivosDaCamada
    .filter((a) => /\bcreateClient\s*\(/.test(a.texto))
    .map((a) => a.nome);
  afirmar(
    "nenhum módulo de data/blog instancia cliente (AD-6)",
    comCreateClient.length === 0,
    comCreateClient.join(", "),
  );

  const comReact = arquivosDaCamada
    .filter((a) => /from\s+["'](react|react-dom)/.test(a.texto))
    .map((a) => a.nome);
  afirmar(
    "nenhum módulo de data/blog importa React",
    comReact.length === 0,
    comReact.join(", "),
  );

  // Toda origem de import declarada, conferida contra a lista permitida:
  // `domain/blog`, a infraestrutura de cliente, e os próprios vizinhos.
  const origensProibidas = [];
  for (const { nome, texto } of arquivosDaCamada) {
    for (const m of texto.matchAll(/from\s+["']([^"']+)["']/g)) {
      const origem = m[1];
      const permitida =
        origem.startsWith("./") ||
        origem === "../supabase/clientes.js" ||
        origem.startsWith("../../domain/");
      if (!permitida) origensProibidas.push(`${nome} → ${origem}`);
    }
  }
  afirmar(
    "data/blog importa apenas de domain/, de data/supabase e de si mesma",
    origensProibidas.length === 0,
    origensProibidas.join(", "),
  );
}

{
  // "Never: repetir o filtro de visibilidade em consulta alguma." O alvo são
  // os MÉTODOS DE FILTRO do PostgREST sobre `estado` e `publicado_em` —
  // `.order("publicado_em")` é ordenação e continua permitido.
  const repeticoes = [];
  for (const { nome, texto } of arquivosDaCamada) {
    for (const m of semComentarios(texto).matchAll(
      /\.(eq|neq|in|lt|lte|gt|gte|is|like|ilike|filter|match|or|not)\(\s*["'`](estado|publicado_em)/g,
    )) {
      repeticoes.push(`${nome}: .${m[1]}("${m[2]}"…)`);
    }
  }
  afirmar(
    "nenhuma consulta repete o filtro de visibilidade — a política é a única guardiã",
    repeticoes.length === 0,
    repeticoes.join(", "),
  );
}

/* ─── Import real dos módulos ────────────────────────────────────────────── */

const resultadoMod = await import(urlDe("src/data/blog/resultado.js"));
const comumMod = await import(urlDe("src/data/blog/comum.js"));
const postsMod = await import(urlDe("src/data/blog/posts.js"));
const taxonomiaMod = await import(urlDe("src/data/blog/taxonomia.js"));
const slugsMod = await import(urlDe("src/data/blog/slugs.js"));
const clientesMod = await import(urlDe("src/data/supabase/clientes.js"));

const {
  classificarErro,
  daRespostaDoSupabase,
  deExcecao,
  ehFaixaAlemDoFim,
  ehResultado,
  ERRO_CONFIGURACAO,
  ERRO_INESPERADO,
  ERRO_NAO_ENCONTRADO,
  ERRO_PERMISSAO,
  ERRO_REDE,
  exigirLista,
  exigirRegistro,
  falha,
  falhouCom,
  sucesso,
  TIPOS_DE_ERRO,
} = resultadoMod;

const {
  buscarPostsPublicos,
  chaveDeOrdenacao,
  lerPostDoPainelPorId,
  lerPostPublicoPorSlug,
  listarPostsDoPainel,
  listarPostsPublicos,
  listarRelacionadosPublicos,
  ordenarListagem,
} = postsMod;
const {
  listarCategorias,
  listarCategoriasDoPainel,
  listarTags,
  listarTagsDoPostNoPainel,
  listarTagsDoPostPublico,
  problemaNaTagDoPost,
} = taxonomiaMod;
const { resolverSlugAposentado } = slugsMod;

/* ─── A REGRA QUE IMPEDE UMA TAG DE SUMIR DA GAVETA (Story 2.14) ─────────── */
//
// `listarTagsDoPostNoPainel` exigia só `tag_id`, e transformava nome ausente em
// texto vazio: a linha sumia do campo, e como o salvamento manda a lista
// INTEIRA, o salvamento seguinte apagava a associação. É o mesmo defeito que
// `resolverTags` bloqueia no servidor sob a frase "nenhuma tag some em
// silêncio". A regra é executada aqui, caso a caso.
{
  const ACEITAS = [
    { tag_id: "t1", tags: { nome: "Atendimento" } },
    { tag_id: "t1", tags: [{ nome: "Atendimento" }] },
  ];
  const RECUSADAS = [
    null,
    undefined,
    "t1",
    [],
    { tags: { nome: "Atendimento" } },
    { tag_id: "", tags: { nome: "Atendimento" } },
    { tag_id: "t1" },
    { tag_id: "t1", tags: null },
    { tag_id: "t1", tags: [] },
    { tag_id: "t1", tags: {} },
    { tag_id: "t1", tags: { nome: "" } },
    { tag_id: "t1", tags: { nome: "   " } },
    { tag_id: "t1", tags: { nome: 42 } },
  ];
  const aceitasQueFalharam = ACEITAS.filter((l) => problemaNaTagDoPost(l) !== null);
  const recusadasQuePassaram = RECUSADAS.filter((l) => problemaNaTagDoPost(l) === null);
  afirmar(
    "linha de tag COM nome é aceita, nas duas formas que o PostgREST devolve a relação embutida",
    aceitasQueFalharam.length === 0,
    aceitasQueFalharam.map((l) => JSON.stringify(l) + ": " + problemaNaTagDoPost(l)).join(" | "),
  );
  afirmar(
    "e tag SEM nome é RECUSADA em vez de encolher — encolher faria o próximo salvamento apagar a associação",
    recusadasQuePassaram.length === 0,
    recusadasQuePassaram.map((l) => JSON.stringify(l)).join(" | "),
  );
  afirmar(
    "a recusa por nome ausente DIZ que a tag sumiria — a frase é o que explica um erro que ninguém esperava",
    /sem nome/.test(problemaNaTagDoPost({ tag_id: "t1", tags: {} }) ?? ""),
    String(problemaNaTagDoPost({ tag_id: "t1", tags: {} })),
  );
}


/**
 * Executa uma função da camada registrando as duas promessas transversais:
 * ela NÃO lança, e o que devolve cumpre o contrato. As duas viram asserção
 * única no fim da execução, contando todas as chamadas feitas aqui.
 */
async function chamar(rotulo, fn) {
  chamadas += 1;
  let devolvido;
  try {
    devolvido = await fn();
  } catch (erro) {
    lancaram.push(`${rotulo}: ${String(erro?.message ?? erro)}`);
    return { ok: false, erro: { tipo: "«lançou»", mensagem: String(erro?.message ?? erro) } };
  }
  if (!ehResultado(devolvido)) {
    foraDoContrato.push(`${rotulo}: ${JSON.stringify(devolvido)?.slice(0, 160)}`);
  }
  return devolvido;
}

/* ─── (b) O contrato de retorno, EXECUTADO ───────────────────────────────── */

secao("(b) o contrato de retorno e o tradutor de erro, executados");

afirmar(
  "os cinco tipos de erro existem, e são exatamente cinco",
  Array.isArray(TIPOS_DE_ERRO) &&
    TIPOS_DE_ERRO.length === 5 &&
    [ERRO_REDE, ERRO_PERMISSAO, ERRO_NAO_ENCONTRADO, ERRO_CONFIGURACAO, ERRO_INESPERADO].every(
      (t) => TIPOS_DE_ERRO.includes(t),
    ),
  `encontrados: ${(TIPOS_DE_ERRO ?? []).join(", ")}`,
);

afirmar(
  "sucesso devolve { ok: true, dados } e nada mais",
  (() => {
    const r = sucesso([1, 2]);
    return (
      r.ok === true &&
      Array.isArray(r.dados) &&
      Object.isFrozen(r) &&
      ehResultado(r)
    );
  })(),
);

afirmar(
  "falha devolve { ok: false, erro } com tipo, mensagem e operação",
  (() => {
    const r = falha(ERRO_REDE, { operacao: "x", detalhe: "y" });
    return (
      r.ok === false &&
      r.erro.tipo === ERRO_REDE &&
      typeof r.erro.mensagem === "string" &&
      r.erro.mensagem !== "" &&
      r.erro.operacao === "x" &&
      Object.isFrozen(r.erro) &&
      ehResultado(r)
    );
  })(),
);

afirmar(
  "as cinco mensagens padrão são DISTINTAS entre si",
  (() => {
    const frases = TIPOS_DE_ERRO.map((t) => falha(t).erro.mensagem);
    return new Set(frases).size === TIPOS_DE_ERRO.length;
  })(),
  "mensagens iguais fazem o tipo existir no código e sumir na tela",
);

afirmar(
  "tipo desconhecido vira `inesperado` e NÃO lança",
  (() => {
    try {
      const r = falha("banana");
      return r.ok === false && r.erro.tipo === ERRO_INESPERADO;
    } catch {
      return false;
    }
  })(),
  "lançar aqui contradiria a promessa central do módulo",
);

afirmar(
  "ehResultado recusa null, undefined e objeto solto",
  !ehResultado(null) &&
    !ehResultado(undefined) &&
    !ehResultado({ dados: 1 }) &&
    !ehResultado({ ok: false }) &&
    !ehResultado({ ok: false, erro: { tipo: "banana", mensagem: "x" } }),
);

/* — O tradutor: cada situação produz o tipo que a nomeia — */
{
  const casos = [
    [
      "configuração ausente (exceção do instanciador)",
      { name: "ConfiguracaoAusente", message: "faltam variáveis", faltando: ["VITE_SUPABASE_URL"] },
      undefined,
      ERRO_CONFIGURACAO,
    ],
    [
      "chave publicável inválida (401 com 'Invalid API key')",
      { message: "Invalid API key", hint: "Double check your Supabase anon key" },
      401,
      ERRO_CONFIGURACAO,
    ],
    ["rede fora (status 0)", { message: "TypeError: fetch failed" }, 0, ERRO_REDE],
    ["fetch recusado (ECONNREFUSED)", { message: "connect ECONNREFUSED 127.0.0.1:9" }, undefined, ERRO_REDE],
    ["exceção de fetch do runtime", new TypeError("fetch failed"), undefined, ERRO_REDE],
    ["tempo limite abortado", { name: "TimeoutError", message: "The operation was aborted" }, undefined, ERRO_REDE],
    ["privilégio negado do Postgres (42501)", { code: "42501", message: "permission denied for table posts" }, 403, ERRO_PERMISSAO],
    ["JWT expirado (PGRST301)", { code: "PGRST301", message: "JWT expired" }, 401, ERRO_PERMISSAO],
    ["RLS recusando escrita", { code: "42501", message: "new row violates row-level security policy" }, 403, ERRO_PERMISSAO],
    ["linha única esperada e zero vieram (PGRST116)", { code: "PGRST116", message: "JSON object requested" }, 406, ERRO_NAO_ENCONTRADO],
    ["corpo estranho sem código", { message: "algo bem estranho" }, 422, ERRO_INESPERADO],
    // A família "tente de novo": o servidor existe e não entregou. Cai em
    // `rede` de propósito — a divergência com os sete rótulos de `sessao.js`
    // está registrada no cabeçalho de `resultado.js`.
    ["limite de taxa (429)", { message: "Too Many Requests" }, 429, ERRO_REDE],
    ["erro de servidor (500)", { message: "Internal Server Error" }, 500, ERRO_REDE],
    ["serviço indisponível (503)", { message: "Service Unavailable" }, 503, ERRO_REDE],
    ["tempo esgotado no cliente (408)", { message: "Request Timeout" }, 408, ERRO_REDE],
    ["Gateway Timeout pelo texto", { message: "504 Gateway Timeout" }, undefined, ERRO_REDE],
  ];
  for (const [nome, bruto, status, esperado] of casos) {
    const obtido = classificarErro(bruto, status);
    afirmar(
      `classificarErro: ${nome} → ${esperado}`,
      obtido === esperado,
      `obtido: ${obtido}`,
    );
  }

  // A confusão que o tipo existe para impedir, afirmada pelo negativo.
  afirmar(
    "classificarErro: rede e não-encontrado NUNCA colidem",
    classificarErro({ message: "fetch failed" }, 0) !==
      classificarErro({ code: "PGRST116" }, 406),
    "confundir servidor fora com 'isso não existe' faz a tela oferecer o conselho errado",
  );
  afirmar(
    "classificarErro: permissão e não-encontrado são distintos",
    classificarErro({ code: "42501" }, 403) !== classificarErro({ code: "PGRST116" }, 406),
  );
  // 404 do PostgREST é rota/tabela inexistente — traduzi-lo como "não
  // encontrado" esconderia schema quebrado atrás de uma página 404 calma.
  afirmar(
    "classificarErro: 404 do PostgREST é DEFEITO, não 'não encontrado'",
    classificarErro({ code: "PGRST205", message: "Could not find the table" }, 404) ===
      ERRO_INESPERADO,
    `obtido: ${classificarErro({ code: "PGRST205" }, 404)}`,
  );
}

afirmar(
  "deExcecao preserva o nome do que falta na configuração",
  (() => {
    const excecao = new clientesMod.ConfiguracaoAusente([
      "VITE_SUPABASE_URL",
      "VITE_SUPABASE_PUBLISHABLE_KEY",
    ]);
    const r = deExcecao(excecao, "teste");
    return (
      r.ok === false &&
      r.erro.tipo === ERRO_CONFIGURACAO &&
      Array.isArray(r.erro.faltando) &&
      r.erro.faltando.length === 2 &&
      r.erro.mensagem.includes("VITE_SUPABASE_URL")
    );
  })(),
  "sem o nome da variável, quem lê a mensagem não tem o que consertar",
);

afirmar(
  "daRespostaDoSupabase traduz { error, status } sem lançar",
  (() => {
    const r = daRespostaDoSupabase(
      { data: null, error: { code: "42501", message: "permission denied" }, status: 403 },
      "teste",
    );
    return falhouCom(r, ERRO_PERMISSAO) && r.erro.detalhe.includes("42501");
  })(),
);

// Uma exceção que CARREGA status — `AuthError` do supabase-js é assim — não
// pode perder esse status no caminho: sem ele, um 401 lançado cairia em
// `inesperado`, e a tela diria "defeito" onde deveria dizer "entre de novo".
afirmar(
  "deExcecao repassa o status da exceção ao classificador",
  (() => {
    const comStatus = Object.assign(new Error("invalid claim: missing sub"), {
      status: 401,
    });
    const r = deExcecao(comStatus, "teste");
    return falhouCom(r, ERRO_PERMISSAO) && r.erro.status === 401;
  })(),
  `obtido: ${JSON.stringify(deExcecao(Object.assign(new Error("x"), { status: 401 })))}`,
);
afirmar(
  "o erro carrega `codigo` e `status` para quem precisar da distinção fina",
  (() => {
    const r = daRespostaDoSupabase(
      { data: null, error: { code: "PGRST103", message: "Requested range" }, status: 416 },
      "teste",
    );
    return r.erro.codigo === "PGRST103" && r.erro.status === 416;
  })(),
  "é o que evita um sexto tipo só para separar 429 de 500",
);
afirmar(
  "ehFaixaAlemDoFim reconhece 416/PGRST103 e nada mais",
  (() => {
    const faixa = daRespostaDoSupabase(
      { error: { code: "PGRST103" }, status: 416 },
      "teste",
    );
    const outro = daRespostaDoSupabase(
      { error: { code: "42501" }, status: 403 },
      "teste",
    );
    return ehFaixaAlemDoFim(faixa) && !ehFaixaAlemDoFim(outro) && !ehFaixaAlemDoFim(sucesso([]));
  })(),
);

afirmar(
  "falha ignora `mensagem` que não seja texto — a palavra \"null\" nunca chega à tela",
  (() => {
    const nula = falha(ERRO_REDE, { mensagem: null });
    const vazia = falha(ERRO_REDE, { mensagem: "   " });
    const numero = falha(ERRO_REDE, { mensagem: 42 });
    const padrao = falha(ERRO_REDE).erro.mensagem;
    return (
      nula.erro.mensagem === padrao &&
      vazia.erro.mensagem === padrao &&
      numero.erro.mensagem === padrao
    );
  })(),
);

afirmar(
  "validador de formato que LANÇA vira erro tipado, não exceção solta",
  (() => {
    try {
      const r = exigirLista([{ id: "a" }], {
        operacao: "teste",
        validarItem: () => {
          throw new Error("validador quebrado");
        },
      });
      return falhouCom(r, ERRO_INESPERADO) && r.erro.detalhe.includes("lançou");
    } catch {
      return false;
    }
  })(),
);

afirmar(
  "sinalDePrazo devolve um AbortSignal — nenhuma consulta fica sem prazo",
  (() => {
    const sinal = resultadoMod.sinalDePrazo(50);
    return Boolean(sinal) && typeof sinal.aborted === "boolean" && sinal.aborted === false;
  })(),
  "sem prazo, uma conexão pendurada trava a tela em carregamento para sempre",
);

/* — Forma da resposta: corpo fora do previsto vira DEFEITO, não `undefined` — */
{
  const casos = [
    ["corpo nulo", null],
    ["corpo string", "erro do proxy"],
    ["corpo objeto onde se esperava lista", { posts: [] }],
    ["corpo indefinido", undefined],
  ];
  for (const [nome, corpo] of casos) {
    const r = exigirLista(corpo, { operacao: "teste" });
    afirmar(
      `exigirLista: ${nome} vira erro de defeito`,
      falhouCom(r, ERRO_INESPERADO) && r.erro.detalhe !== "",
      JSON.stringify(r).slice(0, 160),
    );
  }
  afirmar(
    "exigirLista: lista boa passa e devolve os mesmos itens",
    (() => {
      const r = exigirLista([{ id: "a" }], { operacao: "teste" });
      return r.ok === true && r.dados.length === 1;
    })(),
  );
  afirmar(
    "exigirLista: item fora do formato é acusado com a POSIÇÃO",
    (() => {
      const r = exigirLista([{ id: "a" }, { id: 2 }], {
        operacao: "teste",
        validarItem: (i) => (typeof i.id === "string" ? null : "`id` não é texto"),
      });
      return falhouCom(r, ERRO_INESPERADO) && r.erro.detalhe.includes("item 1");
    })(),
  );
  afirmar(
    "exigirRegistro: lista onde se esperava um registro vira defeito",
    falhouCom(exigirRegistro([{ id: "a" }], { operacao: "teste" }), ERRO_INESPERADO),
  );
}

/* ─── (c) A ordenação, EXECUTADA ─────────────────────────────────────────── */

secao("(c) ordenação por COALESCE(publicado_em, atualizado_em) DESC");

{
  const agora = Date.parse("2026-08-14T12:00:00Z");
  const iso = (ms) => new Date(ms).toISOString();
  const dia = 86400000;

  afirmar(
    "chaveDeOrdenacao usa publicado_em quando ele existe",
    chaveDeOrdenacao({ publicado_em: iso(agora), atualizado_em: iso(agora - 10 * dia) }) ===
      agora,
  );
  afirmar(
    "chaveDeOrdenacao recorre a atualizado_em quando publicado_em é nulo",
    chaveDeOrdenacao({ publicado_em: null, atualizado_em: iso(agora - dia) }) ===
      agora - dia,
    "é o que impede rascunho de afundar ou de dominar a lista",
  );
  afirmar(
    "chaveDeOrdenacao não devolve NaN para linha sem data alguma",
    Number.isFinite(chaveDeOrdenacao({ publicado_em: null, atualizado_em: null })) ===
      false &&
      chaveDeOrdenacao({}) === Number.NEGATIVE_INFINITY,
    "NaN em comparador embaralha a lista inteira em silêncio",
  );

  // O caso que separa a expressão certa da ordem que o servidor consegue dar:
  // um rascunho recente precisa vir ANTES de um arquivado com data antiga —
  // e `publicado_em desc nullslast` faria o contrário.
  const arquivado = {
    id: "1",
    publicado_em: iso(agora - 5 * dia),
    atualizado_em: iso(agora - 30 * dia),
  };
  const rascunho = { id: "2", publicado_em: null, atualizado_em: iso(agora - dia) };
  const ordenados = ordenarListagem([arquivado, rascunho]);
  afirmar(
    "rascunho recente vem ANTES de post com publicado_em mais antigo",
    ordenados[0]?.id === "2" && ordenados[1]?.id === "1",
    `ordem obtida: ${ordenados.map((p) => p.id).join(", ")}`,
  );
  afirmar(
    "ordenarListagem não muta a lista recebida",
    (() => {
      const entrada = [arquivado, rascunho];
      ordenarListagem(entrada);
      return entrada[0] === arquivado;
    })(),
  );
  afirmar(
    "empate de chave é desempatado de forma determinística",
    (() => {
      const a = { id: "b", publicado_em: iso(agora) };
      const b = { id: "a", publicado_em: iso(agora) };
      const um = ordenarListagem([a, b]).map((p) => p.id).join();
      const dois = ordenarListagem([b, a]).map((p) => p.id).join();
      return um === dois;
    })(),
    "sem desempate, duas leituras da mesma base devolveriam sequências diferentes",
  );

  // O caso que o desempate por `id` NÃO cobria: duas linhas sem data alguma
  // dão -Infinity dos dois lados, a subtração vira NaN, e um comparador que
  // devolve NaN faz a ordem depender da ENTRADA — a mesma lista embaralhada
  // sai em sequências diferentes.
  {
    const semData = [{ id: "z" }, { id: "a" }, { id: "m" }];
    const direta = ordenarListagem(semData).map((p) => p.id).join(",");
    const invertida = ordenarListagem([...semData].reverse()).map((p) => p.id).join(",");
    afirmar(
      "linhas SEM DATA ALGUMA saem na mesma ordem, venham como vierem",
      direta === invertida,
      `entrada direta: ${direta} | entrada invertida: ${invertida}`,
    );
    afirmar(
      "e essa ordem é a do desempate por id, não a da entrada",
      direta === "a,m,z",
      `obtida: ${direta}`,
    );
    // Mistura das duas famílias: com data à frente, sem data no fim, estável.
    const misto = ordenarListagem([
      { id: "sem-2" },
      { id: "com", publicado_em: iso(agora) },
      { id: "sem-1" },
    ]).map((p) => p.id);
    afirmar(
      "linha com data precede linha sem data alguma",
      misto[0] === "com" && misto[1] === "sem-1" && misto[2] === "sem-2",
      misto.join(", "),
    );
  }
}

/* — Teto de página, deslocamento e formato de slug — */
{
  const { deslocamentoValido, ehSlug, ehUuid, LIMITE_MAXIMO, LIMITE_PADRAO, limiteValido } =
    comumMod;

  const casosDeLimite = [
    ["sem valor", undefined, LIMITE_PADRAO],
    ["zero", 0, LIMITE_PADRAO],
    ["negativo", -5, LIMITE_PADRAO],
    ["texto", "muitos", LIMITE_PADRAO],
    ["acima do teto", 10000, LIMITE_MAXIMO],
    ["fracionário", 10.9, 10],
  ];
  for (const [nome, entrada, esperado] of casosDeLimite) {
    afirmar(
      `limiteValido: ${nome} → ${esperado}`,
      limiteValido(entrada) === esperado,
      `obtido: ${limiteValido(entrada)}`,
    );
  }
  for (const [nome, entrada, esperado] of [
    ["sem valor", undefined, 0],
    ["negativo", -3, 0],
    ["texto", "x", 0],
    ["número", 42, 42],
  ]) {
    afirmar(
      `deslocamentoValido: ${nome} → ${esperado}`,
      deslocamentoValido(entrada) === esperado,
      `obtido: ${deslocamentoValido(entrada)}`,
    );
  }

  // Vírgula, ponto e parêntese são METACARACTERES do filtro do PostgREST: um
  // slug com qualquer deles produz filtro malformado e 400, que a camada
  // traduziria como defeito onde deveria dizer "não encontrado".
  for (const bom of ["post-de-teste", "a", "2026-08-14-lancamento"]) {
    afirmar(`ehSlug aceita \`${bom}\``, ehSlug(bom));
  }
  for (const ruim of [
    "a,b",
    "a.b",
    "in.(1,2)",
    "MAIUSCULA",
    "com espaço",
    "-inicio",
    "fim-",
    "duplo--hifen",
    "",
    null,
    undefined,
    "a".repeat(201),
  ]) {
    afirmar(
      `ehSlug recusa ${JSON.stringify(ruim)}`,
      !ehSlug(ruim),
      "é o mesmo formato que `posts_slug_formato` impõe no banco",
    );
  }
  afirmar(
    "ehUuid aceita uuid e recusa qualquer outra coisa",
    ehUuid("00000000-0000-0000-0000-000000000000") &&
      !ehUuid("nao-e-uuid") &&
      !ehUuid("") &&
      !ehUuid(null),
  );
}

/* — O ramo de queda de ambiente engoliu o que era esperado, e só isso — */
{
  const quedas = clientesMod.QUEDAS_DE_AMBIENTE ?? [];
  afirmar(
    "fora do navegador, a leitura de `import.meta.env` cai por TypeError — e só por ele",
    Array.isArray(quedas) &&
      quedas.length > 0 &&
      quedas.every((q) => q.nome === "TypeError"),
    JSON.stringify(quedas).slice(0, 250) ||
      "nenhuma queda registrada: o ramo do navegador não pode ter sido exercido aqui",
  );
}

/* ─── (d) Ambiente ausente e rede fora, em subprocesso ───────────────────── */

secao("(d) configuração ausente e rede fora, num processo com outro ambiente");

/**
 * Roda as leituras públicas num processo NOVO, com o ambiente que o caso
 * exige, e devolve o que cada função retornou.
 *
 * Precisa ser outro processo: os clientes são memoizados no módulo, e trocar
 * o ambiente depois do primeiro import não teria efeito nenhum. Também é o
 * teste mais honesto de "nenhuma função lança": se alguma lançar, o processo
 * morre e não há JSON para ler.
 */
function sondar(ambiente) {
  const codigo = `
import { buscarPostsPublicos, listarPostsPublicos, lerPostPublicoPorSlug, listarRelacionadosPublicos } from ${JSON.stringify(urlDe("src/data/blog/posts.js"))};
import { listarCategorias, listarTags, listarTagsDoPostPublico } from ${JSON.stringify(urlDe("src/data/blog/taxonomia.js"))};
import { resolverSlugAposentado } from ${JSON.stringify(urlDe("src/data/blog/slugs.js"))};
const UM_UUID = "11111111-1111-4111-8111-111111111111";
const alvos = {
  listarPostsPublicos: () => listarPostsPublicos(),
  lerPostPublicoPorSlug: () => lerPostPublicoPorSlug("qualquer-slug"),
  listarCategorias: () => listarCategorias(),
  listarTags: () => listarTags(),
  resolverSlugAposentado: () => resolverSlugAposentado("qualquer-slug"),
  buscarPostsPublicos: () => buscarPostsPublicos({ termo: "qualquer" }),
  listarRelacionadosPublicos: () => listarRelacionadosPublicos({ categoriaId: UM_UUID, exceto: UM_UUID }),
  listarTagsDoPostPublico: () => listarTagsDoPostPublico(UM_UUID),
};
const saida = {};
for (const [nome, fn] of Object.entries(alvos)) {
  try {
    saida[nome] = await fn();
  } catch (erro) {
    saida[nome] = { lancou: String(erro?.message ?? erro) };
  }
}
process.stdout.write(JSON.stringify(saida));
`;
  try {
    const bruto = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", codigo],
      {
        cwd: raiz,
        env: ambiente,
        encoding: "utf8",
        timeout: TIMEOUT_MS * 2,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    return { ok: true, saida: JSON.parse(bruto) };
  } catch (erro) {
    return { ok: false, erro: String(erro?.message ?? erro).slice(0, 300) };
  }
}

const NOMES_SONDADOS = [
  "listarPostsPublicos",
  "lerPostPublicoPorSlug",
  "listarCategorias",
  "listarTags",
  "resolverSlugAposentado",
  // As leituras públicas que a Story 2.15 abriu. Elas entram na MESMA sonda
  // porque a promessa é a mesma: erro tipado em vez de exceção, com `.env`
  // ausente e com a rede fora. Uma leitura nova que lançasse derrubaria a
  // página que existe para nunca ficar em branco.
  "buscarPostsPublicos",
  "listarRelacionadosPublicos",
  "listarTagsDoPostPublico",
];

/**
 * O RAMO DO NAVEGADOR, executado.
 *
 * Tudo o mais nesta ferramenta roda em Node, onde `import.meta.env` não existe
 * e `clientes.js` cai para o ambiente do processo — ou seja, exercita só o
 * ramo de queda. Se a substituição estática do Vite deixar de acontecer
 * (leitor que passe a devolver `undefined`, acesso dinâmico que o `define` do
 * Vite não alcança), no navegador as duas variáveis viram vazio,
 * `exigirAmbiente()` lança, o Painel abre em erro de configuração e TODA
 * leitura pública devolve `configuracao` — com as ferramentas verdes, porque
 * as demais asserções são sobre o TEXTO do arquivo.
 *
 * Procurar o valor no bundle não fecha esse buraco: o literal continua lá,
 * dentro de código morto, e a asserção passaria. O que fecha é REPRODUZIR a
 * substituição — um gancho de carregamento troca exatamente o mesmo texto que
 * o Vite troca — e então EXECUTAR a camada com o ambiente do processo VAZIO.
 * Se o ramo do navegador não entregar o valor, não há de onde ele vir.
 */
function sondarRamoDoNavegador() {
  const clientesUrl = urlDe("src/data/supabase/clientes.js");
  const ganchoFonte = `
export async function load(url, contexto, proximo) {
  const resultado = await proximo(url, contexto);
  if (url === ${JSON.stringify(clientesUrl)} && resultado.source) {
    let fonte = resultado.source.toString();
    fonte = fonte.split("import.meta.env.VITE_SUPABASE_URL")
      .join(JSON.stringify(process.env.SIMULACAO_VITE_URL));
    fonte = fonte.split("import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY")
      .join(JSON.stringify(process.env.SIMULACAO_VITE_CHAVE));
    return { ...resultado, source: fonte };
  }
  return resultado;
}
`;
  const codigo = `
import { register } from "node:module";
register("data:text/javascript;charset=utf-8,${encodeURIComponent(ganchoFonte)}", import.meta.url);
const { variaveisAusentes } = await import(${JSON.stringify(clientesUrl)});
const { listarPostsPublicos } = await import(${JSON.stringify(urlDe("src/data/blog/posts.js"))});
const saida = { faltando: variaveisAusentes() };
try {
  saida.listagem = await listarPostsPublicos({ limite: 1 });
} catch (erro) {
  saida.listagem = { lancou: String(erro?.message ?? erro) };
}
process.stdout.write(JSON.stringify(saida));
`;
  // O ambiente do processo NÃO tem `VITE_*`: se o valor aparecer, veio do
  // ramo do navegador e de nenhum outro lugar.
  const ambiente = { ...process.env };
  delete ambiente.VITE_SUPABASE_URL;
  delete ambiente.VITE_SUPABASE_PUBLISHABLE_KEY;
  ambiente.SIMULACAO_VITE_URL = urlDoEnv ?? "";
  ambiente.SIMULACAO_VITE_CHAVE = chavePublicavel ?? "";
  try {
    const bruto = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", codigo],
      {
        cwd: raiz,
        env: ambiente,
        encoding: "utf8",
        timeout: TIMEOUT_MS * 2,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    return { ok: true, saida: JSON.parse(bruto) };
  } catch (erro) {
    return { ok: false, erro: String(erro?.message ?? erro).slice(0, 400) };
  }
}

{
  const semAmbiente = { ...process.env };
  delete semAmbiente.VITE_SUPABASE_URL;
  delete semAmbiente.VITE_SUPABASE_PUBLISHABLE_KEY;
  const sonda = sondar(semAmbiente);
  afirmar(
    "com `.env` ausente, o processo TERMINA — nenhuma função lançou",
    sonda.ok,
    sonda.erro ?? "",
  );
  if (sonda.ok) {
    for (const nome of NOMES_SONDADOS) {
      const r = sonda.saida[nome];
      afirmar(
        `sem ambiente, ${nome} devolve erro tipado de configuração`,
        r?.ok === false && r?.erro?.tipo === ERRO_CONFIGURACAO,
        JSON.stringify(r).slice(0, 200),
      );
    }
    const comFaltando = sonda.saida.listarPostsPublicos?.erro;
    afirmar(
      "o erro de configuração NOMEIA as variáveis que faltam",
      Array.isArray(comFaltando?.faltando) &&
        comFaltando.faltando.includes("VITE_SUPABASE_URL") &&
        comFaltando.faltando.includes("VITE_SUPABASE_PUBLISHABLE_KEY"),
      JSON.stringify(comFaltando).slice(0, 250),
    );
  }
}

if (ambienteCompleto) {
  // Porta 9 é o serviço `discard`: a conexão é recusada de imediato, sem
  // esperar tempo limite — o mesmo truque da verificação de acesso.
  const redeFora = {
    ...process.env,
    VITE_SUPABASE_URL: "http://127.0.0.1:9",
    VITE_SUPABASE_PUBLISHABLE_KEY: chavePublicavel,
  };
  const sonda = sondar(redeFora);
  afirmar(
    "com o servidor inalcançável, o processo TERMINA — nenhuma função lançou",
    sonda.ok,
    sonda.erro ?? "",
  );
  if (sonda.ok) {
    for (const nome of NOMES_SONDADOS) {
      const r = sonda.saida[nome];
      afirmar(
        `com a rede fora, ${nome} devolve erro tipado de rede`,
        r?.ok === false && r?.erro?.tipo === ERRO_REDE,
        JSON.stringify(r).slice(0, 200),
      );
    }
    afirmar(
      "rede fora NÃO é confundida com 'não encontrado'",
      sonda.saida.lerPostPublicoPorSlug?.erro?.tipo === ERRO_REDE,
      "o slug não existe mesmo; o que decide é o servidor não ter respondido",
    );
  }
} else {
  afirmar("a sonda de rede pôde ser exercida", false, "sem ambiente completo");
}

if (ambienteCompleto) {
  const sonda = sondarRamoDoNavegador();
  afirmar(
    "o ramo do navegador pôde ser exercido (substituição estática reproduzida)",
    sonda.ok,
    sonda.erro ?? "",
  );
  if (sonda.ok) {
    afirmar(
      "com `import.meta.env` substituído e ambiente do processo VAZIO, nada falta",
      Array.isArray(sonda.saida.faltando) && sonda.saida.faltando.length === 0,
      `faltando: ${JSON.stringify(sonda.saida.faltando)} — o ramo do navegador não entregou o valor; no navegador o Painel abriria em erro de configuração`,
    );
    afirmar(
      "e a leitura pública funciona por esse caminho — não devolve `configuracao`",
      sonda.saida.listagem?.ok === true,
      JSON.stringify(sonda.saida.listagem).slice(0, 250),
    );
  }
}

/* ─── (e) Comportamento real: a prova da separação ───────────────────────── */

secao(`(e) separação de papéis contra ${NOME_PROJETO} (${REF_PROJETO})`);

/**
 * Tudo o que só roda COM sessão real aberta.
 *
 * Existe como lista porque o limite de taxa do GoTrue é plausível numa
 * execução de `npm run verificar` — `verificar-acesso.mjs` cria conta e faz
 * login na mesma passada. Quando o 429 vem, cada uma destas é adiada por
 * NOME, e não resumida em três linhas: o resumo escondia a prova estrela da
 * story atrás de um veredito verde, e um vazamento de rascunho pela camada
 * pública passaria batido.
 *
 * A lista é conferida contra a realidade no fim do bloco — acrescentar
 * asserção lá sem acrescentá-la aqui faz a ferramenta falhar.
 */
const ASSERCOES_QUE_EXIGEM_SESSAO = Object.freeze([
  "com sessão, o Painel vê os QUATRO posts, inclusive rascunho e arquivado",
  "a listagem do Painel vem em COALESCE(publicado_em, atualizado_em) DESC",
  "o rascunho recente vem ANTES do arquivado com publicado_em antigo",
  "com sessão, o Painel abre o rascunho pelo identificador",
  "identificador inexistente devolve NÃO ENCONTRADO, não null cru",
  "identificador malformado devolve NÃO ENCONTRADO sem ir ao servidor",
  // A taxonomia do Painel (Story 2.14). A contagem de uso e o nome da Tag só
  // são o que a tela precisa QUANDO há sessão — sem ela, a contagem contaria
  // apenas o que está no ar, e a tela ofereceria excluir uma Categoria que
  // classifica três rascunhos.
  "listarCategoriasDoPainel devolve a Categoria semeada",
  "e ela vem com a CONTAGEM de Posts que a usam, como número",
  "a contagem do Painel inclui Post que o visitante não vê",
  "as Categorias do Painel vêm ordenadas por `ordem`",
  "listarTagsDoPostNoPainel devolve as tags do rascunho com id E nome",
  "a janela de visibilidade foi aberta",
  "a sessão continua ATIVA no exato momento da leitura pública",
  "a listagem pública respondeu com sucesso",
  "listagem pública devolve EXATAMENTE o post visível da matriz",
  "SEPARAÇÃO: com sessão ativa, a camada pública NÃO traz rascunho",
  "SEPARAÇÃO: a camada pública também não traz o agendado-futuro",
  "SEPARAÇÃO: a camada pública também não traz o arquivado",
  "nenhum título de post oculto viaja na resposta pública",
  "SEPARAÇÃO: a camada do Painel, no mesmo instante, TRAZ o rascunho",
  "o visitante anônimo obteve resposta para comparar",
  "SEPARAÇÃO: o conjunto lido pela camada pública é IDÊNTICO ao do visitante anônimo",
  "post publicado é lido pelo slug, com a Categoria embutida",
  "rascunho lido pela camada pública devolve NÃO ENCONTRADO",
  "slug que nunca existiu devolve NÃO ENCONTRADO",
  "rascunho e slug inexistente são INDISTINGUÍVEIS para quem chama",
  "a resposta do rascunho não vaza o título nem o identificador dele",
  // O critério da Story 2.13: o endereço público de um Post não publicado
  // responde ausência para quem tem sessão e para quem não tem — nos TRÊS
  // Estados fora do ar, e não só no rascunho.
  "a sessão continua ABERTA no instante desta prova — sem ela, “não vaza” diria só que o anônimo não vê",
  "os TRÊS Estados fora do ar respondem AUSÊNCIA pelo endereço público — rascunho, agendado-por-vir e arquivado",
  "e os três são INDISTINGUÍVEIS de um endereço que nunca existiu — mesmo tipo e mesma frase",
  "e nenhum deles vaza título ou identificador na resposta",
  "enquanto o Post PUBLICADO continua alcançável pelo mesmo caminho — a recusa é do Estado, não da camada",
  "e a PRÉVIA abre os três pelo identificador no mesmo instante — a ausência é da camada pública, não do dado",
  "slug vazio devolve NÃO ENCONTRADO em vez de consultar o servidor",
  "listarCategorias devolve a Categoria semeada",
  "as Categorias vêm ordenadas por `ordem`",
  "listarTags devolve a Tag do post visível",
  "listarTags NÃO devolve a Tag que só rotula rascunho",
  "slug aposentado de post visível resolve para o slug atual",
  "slug aposentado de rascunho devolve NÃO ENCONTRADO",
  "slug aposentado inexistente é indistinguível do de rascunho",
  "slug com metacaractere (a,b) devolve NÃO ENCONTRADO, não defeito",
  "slug com metacaractere (in.(1,2)) devolve NÃO ENCONTRADO, não defeito",
  "slug com metacaractere (post.slug) devolve NÃO ENCONTRADO, não defeito",
  "slug com metacaractere (a)b(c) devolve NÃO ENCONTRADO, não defeito",
  "o mesmo vale para o resolvedor do 301",
  "a listagem NÃO traz `conteudo` nem `conteudo_html`",
  "a leitura unitária TRAZ o corpo do Post",
  "deslocamento além do fim devolve lista VAZIA, não erro",
  "o limite pedido é respeitado",
  "a janela de visibilidade foi fechada",
  // A busca da Story 2.11: cada campo do critério, o acento nas duas direções,
  // o caractere especial e a combinação com o filtro de Estado.
  "os sete posts da prova de busca foram semeados",
  "a busca acha o Post cujo termo só existe no título",
  "a busca acha o Post cujo termo só existe no nome da Categoria",
  "a busca acha o Post cujo termo só existe no nome do Autor",
  "a busca acha o Post cujo termo só existe numa Tag",
  "termo de duas palavras acha o Post mesmo fora de ordem e com palavra no meio",
  "e as palavras podem estar em CAMPOS diferentes — uma no Autor, outra no título",
  "acrescentar uma palavra que não existe ESTREITA até zero — é conjunção, não união",
  "termo SEM acento acha o texto acentuado — “estrategia” encontra “Estratégia”",
  "e o inverso vale: termo COM acento acha o texto sem acento",
  "maiúsculas dão o mesmo resultado que minúsculas, com ou sem acento",
  "termo com %, _, parêntese, vírgula e aspas é achado como TEXTO, sem erro de consulta",
  "`%` sozinho NÃO é curinga: acha só o Post que tem um `%` escrito",
  "`_` também não é curinga de um caractere — “achado _or” não acha “Achado por”",
  "termo sem correspondência devolve lista VAZIA com sucesso — não é erro",
  "o filtro de Estado restringe pela coluna `estado`",
  "e aceita mais de um Estado ao mesmo tempo",
  "busca e filtro COMBINAM: as duas restrições valem ao mesmo tempo",
  "e a combinação é conjunção, não união: o mesmo termo em outro Estado não volta",
  "Estado fora do vocabulário fechado é RECUSADO, não ignorado em silêncio",
  "lista de Estados VAZIA é ausência de filtro, não “nenhum Estado”",
  "termo só de espaços é ausência de busca: a listagem inteira volta",
  "com busca aplicada, a ordem continua sendo `COALESCE(publicado_em, atualizado_em)` DESC",
  "o visitante anônimo não extrai rascunho pela função de busca",
  // As leituras públicas que a Story 2.15 abriu — a busca própria do site, os
  // relacionados por Categoria e as Tags do artigo. Elas exigem sessão pela
  // mesma razão que as de cima: sem uma sessão ABERTA no instante da leitura,
  // "a busca pública não traz rascunho" diria só que o anônimo não vê, que é
  // outra coisa. É exatamente aqui que a incondicionalidade do cliente anônimo
  // poderia ser desfeita sem ninguém perceber.
  "a janela das leituras públicas novas foi aberta",
  "as duas Categorias semeadas têm identificador",
  "a sessão continua ABERTA no instante das leituras públicas novas",
  "busca pública com termo vazio devolve EXATAMENTE o mesmo conjunto que a listagem",
  "a busca pública acha sem acento e por palavra — “publico camada” encontra “Post público da camada”",
  "SEPARAÇÃO: com sessão aberta, a busca pública NÃO alcança rascunho",
  "SEPARAÇÃO: nem o agendado cuja hora não chegou",
  "o filtro por Categoria devolve só os Posts visíveis daquela Categoria",
  "categoria fora do formato é RECUSADA, não ignorada em silêncio",
  "os relacionados recusam `categoriaId` torto do mesmo jeito que a busca — e ausência continua sendo lista vazia",
  "e recusam `exceto` torto — ignorá-lo deixaria o Post aparecer nos relacionados dele mesmo",
  "os relacionados trazem outro Post VISÍVEL da mesma Categoria",
  "e nunca o próprio Post",
  "e nenhum Post fora do ar — quem decide continua sendo a política",
  "e nenhum Post de OUTRA Categoria, mesmo estando no ar",
  "Post sem Categoria não tem relacionados — lista vazia com sucesso, e não erro",
  "as Tags públicas de um Post publicado voltam com nome",
  "SEPARAÇÃO: as Tags de um rascunho NÃO voltam pelo caminho público, mesmo com sessão aberta",
  "o visitante anônimo não extrai rascunho pela função de busca PÚBLICA",
  "e ele ALCANÇA o Post publicado pela mesma função — a recusa é do Estado, não da função",
  // Cada campo do critério, isolado — a mesma matriz que a busca do Painel tem.
  "a janela por campo da busca pública foi aberta",
  "a busca pública acha o Post cujo termo só existe no título",
  "a busca pública acha o Post cujo termo só existe no resumo",
  "a busca pública acha o Post cujo termo só existe no nome do Autor",
  "a busca pública acha o Post cujo termo só existe no nome da Categoria",
  "a busca pública acha o Post cujo termo só existe numa Tag",
  "a janela das leituras públicas novas foi fechada — inclusive o `estado`, que ela também abriu",
  "e a matriz de Estados voltou ao que era antes da janela",
]);

const token = lerToken();
const temToken = afirmar(
  "SUPABASE_ACCESS_TOKEN presente no ambiente",
  Boolean(token),
  "sem ele a matriz não pode ser semeada — a asserção falha como ausente, nunca é pulada",
);

/**
 * Registra como segredo todo token que apareça num corpo bruto, sem depender
 * de o corpo ser JSON válido. É a rede de segurança de `sanitizar`: o que não
 * for registrado aqui sai legível em qualquer mensagem de falha.
 */
function registrarTokensDoCorpo(corpo) {
  for (const m of String(corpo ?? "").matchAll(
    /"(access_token|refresh_token|provider_token|provider_refresh_token|id_token)"\s*:\s*"([^"]+)"/g,
  )) {
    registrarSegredo(m[2]);
  }
}

/** Resumo de resposta HTTP seguro para o console: nunca o corpo inteiro. */
function resumo(resposta) {
  const corpo = String(resposta?.corpo ?? "");
  let motivo = "";
  try {
    const v = JSON.parse(corpo);
    motivo = String(
      v?.error_description ?? v?.error ?? v?.msg ?? v?.message ?? "",
    ).slice(0, 160);
  } catch {
    motivo = `${corpo.length} bytes ilegíveis`;
  }
  return `HTTP ${resposta?.status ?? "?"}${motivo ? ` — ${motivo}` : ""}`;
}

/** GET anônimo cru: só `apikey`, nenhuma sessão. É o visitante de verdade. */
async function anonimo(caminho) {
  try {
    const r = await fetch(`${URL_PROJETO}/rest/v1/${caminho}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { apikey: chavePublicavel, Accept: "application/json" },
    });
    const corpo = await r.text();
    let lista = null;
    try {
      const v = JSON.parse(corpo);
      lista = Array.isArray(v) ? v : null;
    } catch {
      lista = null;
    }
    return { status: r.status, corpo, lista };
  } catch (erro) {
    return { status: 0, corpo: String(erro?.message ?? erro), lista: null };
  }
}

if (temToken && ambienteCompleto) {
  /* — Varredura de restos ANTES de semear, com prefixo CONSTANTE — */
  //
  // O `finally` cobre asserção que falha e exceção que sobe, mas não cobre o
  // processo morto no meio. O prefixo constante é o que torna o resto
  // ENCONTRÁVEL pela execução seguinte, que falha uma vez e já nasce limpa.

  const PREFIXO_TESTE = "zzz-verificacao-2-2-";
  const MARCA_TESTE = `${PREFIXO_TESTE}%`;
  // `%` casaria QUALQUER conta com este prefixo local, inclusive uma real que
  // alguém criasse amanhã. O molde de `_` reproduz a forma exata do uuid que
  // esta ferramenta gera — 8-4-4-4-12 —, e nada além dela.
  const MOLDE_DE_UUID = "________-____-____-____-____________";
  const EMAIL_TESTE = `verificacao.dados+${MOLDE_DE_UUID}@chatclean.com.br`;

  // `posts_tags` é semeada e não tem coluna de slug: ela some por cascade
  // quando os posts saem. Contá-la ANTES das exclusões, no mesmo instantâneo,
  // é o que faz a varredura cobrir exatamente as tabelas semeadas — depender
  // do cascade sem afirmá-lo é confiar num comportamento que ninguém checa.
  const restos = await executarSql(
    token,
    `with alvo as (select id from public.posts where slug like ${literal(MARCA_TESTE)}),
          n_pt as (select count(*)::int as n from public.posts_tags x join alvo a on a.id = x.post_id),
          p as (delete from public.posts where slug like ${literal(MARCA_TESTE)} returning 1),
          t as (delete from public.tags where slug like ${literal(MARCA_TESTE)} returning 1),
          c as (delete from public.categorias where slug like ${literal(MARCA_TESTE)} returning 1),
          s as (delete from public.slugs_antigos where slug like ${literal(MARCA_TESTE)} returning 1),
          u as (delete from auth.users where email like ${literal(EMAIL_TESTE)} returning 1)
     select (select n from n_pt) + (select count(*) from p) + (select count(*) from t)
          + (select count(*) from c) + (select count(*) from s) + (select count(*) from u) as n`,
  );
  const quantosRestos = restos.ok ? Number(restos.dados?.[0]?.n ?? 0) : -1;
  afirmar(
    "nenhum resto de verificação sobrou de execuções anteriores",
    restos.ok && quantosRestos === 0,
    restos.ok
      ? `${quantosRestos} linha(s) removida(s) agora — uma execução anterior morreu antes da limpeza`
      : (restos.erro ?? ""),
  );

  const nonce = randomUUID();
  const prefixo = `${PREFIXO_TESTE}${nonce}-`;
  const marca = `${prefixo}%`;
  const slug = (sufixo) => `${prefixo}${sufixo}`;

  // Instante tão distante que um processo morto não deixa Post visível: os
  // casos que PRECISAM aparecer nascem invisíveis e só entram numa janela
  // estreita em torno das leituras públicas.
  const LONGE = "now() + interval '100 years'";

  const emailTemp = `verificacao.dados+${nonce}@chatclean.com.br`;
  const nomeTemp = "Conta Temporária da Camada de Dados";
  const senhaTemp = `Vf-${nonce.slice(0, 8)}-${Math.random().toString(36).slice(2, 10)}!aZ9`;
  registrarSegredo(senhaTemp);

  let limpeza = null;
  /** Ids dos posts semeados, guardados fora do `try` para a checagem de resíduo
   *  de `posts_tags` — que, sem eles, não teria como se referir às linhas
   *  depois de os posts saírem. */
  const idsSemeados = [];
  try {
    /* — Semeadura: quatro estados, toda ela invisível ao público — */
    //
    // `atualizado_em` entra explicitamente porque o gatilho que a mantém é
    // BEFORE UPDATE: no INSERT o valor dado é o que fica, e é dele que a
    // prova de ordenação depende.

    const semeadura = await executarSql(
      token,
      `insert into public.categorias (slug, nome, icone, cor, ordem) values
         (${literal(slug("categoria"))}, 'Categoria da camada de dados', 'etiqueta', 'var(--categoria-cinza-bg)', 99);

       insert into public.posts
         (slug, titulo, resumo, estado, publicado_em, atualizado_em, categoria_id)
       select v.slug, v.titulo, v.resumo, v.estado::public.estado_post,
              v.publicado_em, v.atualizado_em, c.id
         from (values
           (${literal(slug("publico"))}, 'Post público da camada', 'Resumo público',
            'publicado', ${LONGE}, now() - interval '40 days'),
           (${literal(slug("agendado-futuro"))}, 'Agendado cuja hora nao chegou', 'Resumo agendado',
            'agendado', now() + interval '7 days', now() - interval '2 days'),
           (${literal(slug("rascunho"))}, 'Rascunho que nao pode vazar', 'Resumo do rascunho',
            'rascunho', null, now() - interval '1 day'),
           (${literal(slug("arquivado"))}, 'Arquivado antigo', 'Resumo arquivado',
            'arquivado', now() - interval '5 days', now() - interval '30 days')
         ) as v(slug, titulo, resumo, estado, publicado_em, atualizado_em)
         cross join public.categorias c
        where c.slug = ${literal(slug("categoria"))};

       insert into public.tags (slug, nome) values
         (${literal(slug("tag-visivel"))}, 'Tag do post visivel'),
         (${literal(slug("tag-oculta"))}, 'Tag do rascunho');

       insert into public.posts_tags (post_id, tag_id)
       select p.id, t.id from public.posts p, public.tags t
        where p.slug = ${literal(slug("publico"))} and t.slug = ${literal(slug("tag-visivel"))};

       insert into public.posts_tags (post_id, tag_id)
       select p.id, t.id from public.posts p, public.tags t
        where p.slug = ${literal(slug("rascunho"))} and t.slug = ${literal(slug("tag-oculta"))};

       insert into public.slugs_antigos (slug, post_id)
       select ${literal(slug("antigo-do-publico"))}, p.id from public.posts p
        where p.slug = ${literal(slug("publico"))};

       insert into public.slugs_antigos (slug, post_id)
       select ${literal(slug("antigo-do-rascunho"))}, p.id from public.posts p
        where p.slug = ${literal(slug("rascunho"))};`,
    );
    const semeou = afirmar(
      "a matriz de estados foi semeada no projeto",
      semeadura.ok,
      semeadura.erro ?? "",
    );

    if (semeou) {
      const ids = await executarSql(
        token,
        `select slug, id::text as id from public.posts where slug like ${literal(marca)}`,
      );
      const idDe = new Map(
        (ids.ok && Array.isArray(ids.dados) ? ids.dados : []).map((l) => [l.slug, l.id]),
      );
      idsSemeados.push(...idDe.values());
      afirmar(
        "os quatro posts semeados têm identificador",
        idDe.size === 4,
        `obtidos: ${idDe.size}`,
      );

      /* ── SEM sessão: a leitura do Painel é recusada por permissão ─────── */
      //
      // Sem esta trava o PostgREST responderia 200 com o subconjunto ANÔNIMO
      // — o Painel abriria com metade dos posts e nada teria falhado.

      {
        const listagem = await chamar("listarPostsDoPainel (sem sessão)", () =>
          listarPostsDoPainel(),
        );
        afirmar(
          "sem sessão, a listagem do Painel devolve erro tipado de PERMISSÃO",
          falhouCom(listagem, ERRO_PERMISSAO),
          JSON.stringify(listagem).slice(0, 200),
        );
        const porId = await chamar("lerPostDoPainelPorId (sem sessão)", () =>
          lerPostDoPainelPorId(idDe.get(slug("rascunho")) ?? ZERO_UUID),
        );
        afirmar(
          "sem sessão, ler um post do Painel devolve erro tipado de PERMISSÃO",
          falhouCom(porId, ERRO_PERMISSAO),
          JSON.stringify(porId).slice(0, 200),
        );
        afirmar(
          "permissão NÃO é confundida com rede nem com não encontrado",
          listagem?.erro?.tipo !== ERRO_REDE &&
            listagem?.erro?.tipo !== ERRO_NAO_ENCONTRADO,
          `tipo: ${listagem?.erro?.tipo}`,
        );
      }

      /* ── Sessão REAL da Conta temporária, plantada no cliente do Painel ── */

      let contaCriada = false;
      let temSessao = false;
      const clienteDoPainel = clientesMod.clienteAutenticado();
      try {
        const criacao = await executarSql(
          token,
          sqlDeCriacaoDeConta({ email: emailTemp, senha: senhaTemp, nome: nomeTemp }),
        );
        contaCriada = criacao.ok && Boolean(criacao.dados?.[0]?.id);
        afirmar("a Conta temporária foi criada", contaCriada, criacao.erro ?? "");

        let respostaLogin = { status: 0, corpo: "" };
        let sessao = null;
        if (contaCriada) {
          try {
            const r = await fetch(`${URL_PROJETO}/auth/v1/token?grant_type=password`, {
              method: "POST",
              signal: AbortSignal.timeout(TIMEOUT_MS),
              headers: { apikey: chavePublicavel, "Content-Type": "application/json" },
              body: JSON.stringify({ email: emailTemp, password: senhaTemp }),
            });
            const corpo = await r.text();
            // Registrar ANTES de qualquer coisa poder imprimir. Depender de
            // `JSON.parse` para achar o token deixava um buraco real: corpo
            // truncado ou corpo de erro com o token dentro fazia o `parse`
            // falhar, `registrarSegredo` nunca era chamado, e `sanitizar` não
            // tinha o que ocultar — o token sairia inteiro no console.
            registrarTokensDoCorpo(corpo);
            respostaLogin = { status: r.status, corpo };
            sessao = JSON.parse(corpo);
          } catch {
            sessao = null;
          }
        }
        if (sessao?.access_token) registrarSegredo(sessao.access_token);
        if (sessao?.refresh_token) registrarSegredo(sessao.refresh_token);

        const MOTIVO_LIMITE =
          "o GoTrue respondeu 429 (limite de taxa). Não é defeito do produto: a asserção não pôde ser exercida agora.";

        if (respostaLogin.status === 429) {
          // Uma linha por asserção que deixou de rodar, não um resumo.
          // O resumo de três linhas escondia TRINTA E CINCO asserções — a
          // prova de separação inclusa — atrás de um veredito verde.
          adiar("a sessão real foi aberta no cliente autenticado", MOTIVO_LIMITE);
          for (const descricao of ASSERCOES_QUE_EXIGEM_SESSAO) {
            adiar(descricao, MOTIVO_LIMITE);
          }
        } else if (sessao?.access_token) {
          // É aqui que a sessão entra no MESMO cliente memoizado que a camada
          // do Painel usa — nenhum cliente extra, nenhuma injeção.
          const plantada = await clienteDoPainel.auth.setSession({
            access_token: sessao.access_token,
            refresh_token: sessao.refresh_token,
          });
          const { data: guardada } = await clienteDoPainel.auth.getSession();
          temSessao = Boolean(guardada?.session?.access_token);
          afirmar(
            "a sessão real foi aberta no cliente autenticado",
            temSessao && !plantada?.error,
            plantada?.error?.message ?? "setSession não deixou sessão viva",
          );
        } else {
          afirmar(
            "a sessão real foi aberta no cliente autenticado",
            false,
            resumo(respostaLogin),
          );
        }

        const emitidasAntesDoBloco = emitidas;
        if (temSessao) {
          /* — O Painel vê tudo — */
          const doPainel = await chamar("listarPostsDoPainel (com sessão)", () =>
            listarPostsDoPainel(),
          );
          const seeded = (doPainel?.dados ?? []).filter((p) =>
            String(p?.slug ?? "").startsWith(prefixo),
          );
          const slugsDoPainel = seeded.map((p) => p.slug);
          afirmar(
            "com sessão, o Painel vê os QUATRO posts, inclusive rascunho e arquivado",
            doPainel?.ok === true &&
              slugsDoPainel.length === 4 &&
              slugsDoPainel.includes(slug("rascunho")) &&
              slugsDoPainel.includes(slug("arquivado")),
            `voltaram ${slugsDoPainel.length}: ${slugsDoPainel.map((s) => s.slice(prefixo.length)).join(", ") || "nenhum"} ${JSON.stringify(doPainel?.erro ?? "").slice(0, 160)}`,
          );

          /* — A ordenação, sobre dados REAIS do banco — */
          //
          // A sequência esperada é calculada aqui a partir das colunas que
          // voltaram, com a mesma expressão do critério de aceite. Ordenar só
          // por `publicado_em` colocaria o arquivado ANTES do rascunho.
          {
            const esperada = [...seeded]
              .sort((a, b) => {
                const ka = Date.parse(a.publicado_em ?? a.atualizado_em);
                const kb = Date.parse(b.publicado_em ?? b.atualizado_em);
                return kb - ka || String(a.id).localeCompare(String(b.id));
              })
              .map((p) => p.slug);
            const obtida = slugsDoPainel;
            afirmar(
              "a listagem do Painel vem em COALESCE(publicado_em, atualizado_em) DESC",
              esperada.length === obtida.length &&
                esperada.every((s, i) => s === obtida[i]),
              `esperada: ${esperada.map((s) => s.slice(prefixo.length)).join(" > ")} | obtida: ${obtida.map((s) => s.slice(prefixo.length)).join(" > ")}`,
            );
            const posRascunho = obtida.indexOf(slug("rascunho"));
            const posArquivado = obtida.indexOf(slug("arquivado"));
            afirmar(
              "o rascunho recente vem ANTES do arquivado com publicado_em antigo",
              posRascunho >= 0 && posArquivado >= 0 && posRascunho < posArquivado,
              `rascunho na posição ${posRascunho}, arquivado na ${posArquivado} — ordenar só por publicado_em inverteria isso`,
            );
          }

          /* — Post do Painel por identificador — */
          {
            const r = await chamar("lerPostDoPainelPorId (rascunho)", () =>
              lerPostDoPainelPorId(idDe.get(slug("rascunho"))),
            );
            afirmar(
              "com sessão, o Painel abre o rascunho pelo identificador",
              r?.ok === true && r.dados?.slug === slug("rascunho"),
              JSON.stringify(r?.erro ?? r?.dados?.slug ?? r).slice(0, 200),
            );
            const ausente = await chamar("lerPostDoPainelPorId (inexistente)", () =>
              lerPostDoPainelPorId(ZERO_UUID),
            );
            afirmar(
              "identificador inexistente devolve NÃO ENCONTRADO, não null cru",
              falhouCom(ausente, ERRO_NAO_ENCONTRADO),
              JSON.stringify(ausente).slice(0, 200),
            );
            const lixo = await chamar("lerPostDoPainelPorId (lixo)", () =>
              lerPostDoPainelPorId("nao-e-um-uuid"),
            );
            afirmar(
              "identificador malformado devolve NÃO ENCONTRADO sem ir ao servidor",
              falhouCom(lixo, ERRO_NAO_ENCONTRADO),
              JSON.stringify(lixo).slice(0, 200),
            );
          }

          /* — A TAXONOMIA DO PAINEL (Story 2.14) — */
          {
            /* A contagem de uso, que é o número que a recusa de excluir precisa
               dizer e que a tela mostra ANTES de a pessoa tentar. Ela roda sob a
               RLS de `posts`: com sessão, ela conta rascunho também — e é
               justamente o rascunho que faria a tela mentir se a leitura fosse
               anônima. */
            const doPainel = await chamar("listarCategoriasDoPainel", () =>
              listarCategoriasDoPainel(),
            );
            const semeada = (doPainel?.dados ?? []).find(
              (c) => c.slug === slug("categoria"),
            );
            afirmar(
              "listarCategoriasDoPainel devolve a Categoria semeada",
              doPainel?.ok === true && semeada !== undefined,
              JSON.stringify(doPainel?.erro ?? (doPainel?.dados ?? []).map((c) => c.slug)).slice(0, 200),
            );
            afirmar(
              "e ela vem com a CONTAGEM de Posts que a usam, como número",
              typeof semeada?.posts === "number" && semeada.posts > 0,
              `posts: ${JSON.stringify(semeada?.posts)}`,
            );
            /* A contagem inclui o que NÃO está no ar. Sem esta asserção, uma
               leitura pelo cliente anônimo passaria — e a tela ofereceria
               excluir uma Categoria que classifica três rascunhos. */
            const publicosDaSemeada = (
              await chamar("listarPostsPublicos (para comparar a contagem)", () =>
                listarPostsPublicos({ limite: 100 }),
              )
            )?.dados?.filter((p) => p.categoria?.slug === slug("categoria")).length;
            afirmar(
              "a contagem do Painel inclui Post que o visitante não vê",
              typeof semeada?.posts === "number" &&
                typeof publicosDaSemeada === "number" &&
                semeada.posts > publicosDaSemeada,
              `painel: ${semeada?.posts} | público: ${publicosDaSemeada}`,
            );
            afirmar(
              "as Categorias do Painel vêm ordenadas por `ordem`",
              (() => {
                const ordens = (doPainel?.dados ?? [])
                  .map((c) => Number(c.ordem))
                  .filter((n) => Number.isFinite(n));
                return ordens.every((v, i) => i === 0 || ordens[i - 1] <= v);
              })(),
              (doPainel?.dados ?? []).map((c) => c.ordem).join(", "),
            );

            /* As Tags do Post, COM O NOME. Sem o nome, o campo de tags da gaveta
               abriria vazio e o primeiro salvamento apagaria as que existiam —
               o pedido diz "estas são as tags", e uma lista vazia é um pedido de
               nenhuma tag. */
            const tagsDoRascunho = await chamar("listarTagsDoPostNoPainel", () =>
              listarTagsDoPostNoPainel(idDe.get(slug("rascunho"))),
            );
            afirmar(
              "listarTagsDoPostNoPainel devolve as tags do rascunho com id E nome",
              tagsDoRascunho?.ok === true &&
                tagsDoRascunho.dados.length > 0 &&
                tagsDoRascunho.dados.every(
                  (t) => typeof t.id === "string" && typeof t.nome === "string" && t.nome !== "",
                ),
              JSON.stringify(tagsDoRascunho?.erro ?? tagsDoRascunho?.dados).slice(0, 250),
            );
          }

          /* ── A JANELA: as leituras públicas, COM a sessão ainda ativa ─── */

          try {
            const abrir = await executarSql(
              token,
              `update public.posts set publicado_em = now() - interval '1 day'
                where slug = ${literal(slug("publico"))}`,
            );
            afirmar("a janela de visibilidade foi aberta", abrir.ok, abrir.erro ?? "");

            // Controle positivo do instante: se a sessão tivesse morrido aqui,
            // a prova de separação passaria por vacuidade — "não veio rascunho"
            // seria consequência de não haver sessão, não da separação.
            const { data: viva } = await clienteDoPainel.auth.getSession();
            const sessaoViva = afirmar(
              "a sessão continua ATIVA no exato momento da leitura pública",
              Boolean(viva?.session?.access_token),
              "sem sessão viva, a prova de separação não prova nada",
            );

            const publica = await chamar("listarPostsPublicos (com sessão ativa)", () =>
              listarPostsPublicos(),
            );
            const publicos = (publica?.dados ?? [])
              .map((p) => String(p?.slug ?? ""))
              .filter((s) => s.startsWith(prefixo))
              .sort();

            afirmar(
              "a listagem pública respondeu com sucesso",
              publica?.ok === true,
              JSON.stringify(publica?.erro ?? "").slice(0, 200),
            );
            afirmar(
              "listagem pública devolve EXATAMENTE o post visível da matriz",
              publicos.length === 1 && publicos[0] === slug("publico"),
              `voltaram: ${publicos.map((s) => s.slice(prefixo.length)).join(", ") || "nenhum"}`,
            );

            /* ★ A PROVA CENTRAL ★ */
            afirmar(
              "SEPARAÇÃO: com sessão ativa, a camada pública NÃO traz rascunho",
              sessaoViva && !publicos.includes(slug("rascunho")),
              `veio: ${publicos.join(", ")}`,
            );
            for (const oculto of ["agendado-futuro", "arquivado"]) {
              afirmar(
                `SEPARAÇÃO: a camada pública também não traz o ${oculto}`,
                !publicos.includes(slug(oculto)),
              );
            }
            afirmar(
              "nenhum título de post oculto viaja na resposta pública",
              !JSON.stringify(publica?.dados ?? []).includes("Rascunho que nao pode vazar"),
            );

            // …e o contrapeso: a MESMA base, lida pela camada do Painel no
            // mesmo instante e com a mesma sessão, TRAZ o rascunho.
            const painelAgora = await chamar("listarPostsDoPainel (na janela)", () =>
              listarPostsDoPainel(),
            );
            const doPainelAgora = (painelAgora?.dados ?? [])
              .map((p) => String(p?.slug ?? ""))
              .filter((s) => s.startsWith(prefixo));
            afirmar(
              "SEPARAÇÃO: a camada do Painel, no mesmo instante, TRAZ o rascunho",
              painelAgora?.ok === true && doPainelAgora.includes(slug("rascunho")),
              `voltaram: ${doPainelAgora.map((s) => s.slice(prefixo.length)).join(", ") || "nenhum"}`,
            );

            // …e a resposta pública é IDÊNTICA à de um visitante anônimo de
            // verdade — não parecida: o mesmo conjunto.
            //
            // A comparação é RESTRITA à matriz semeada, de propósito. Confrontar
            // as duas listas inteiras poria lado a lado duas janelas de 200 com
            // ORDENAÇÕES diferentes (a camada reordena por COALESCE): passado o
            // 200º post visível, os recortes divergiriam e a asserção falharia
            // sem nada estar errado — ruído que ensinaria a ignorar vermelho.
            const visitante = await anonimo(
              `posts?select=slug&slug=like.${prefixo}*&order=slug&limit=200`,
            );
            const slugsDoVisitante = (visitante.lista ?? [])
              .map((l) => String(l.slug ?? ""))
              .sort();
            const slugsDaCamada = (publica?.dados ?? [])
              .map((p) => String(p?.slug ?? ""))
              .filter((s) => s.startsWith(prefixo))
              .sort();
            afirmar(
              "o visitante anônimo obteve resposta para comparar",
              visitante.status === 200 && Array.isArray(visitante.lista),
              `HTTP ${visitante.status} ${visitante.corpo.slice(0, 200)}`,
            );
            afirmar(
              "SEPARAÇÃO: o conjunto lido pela camada pública é IDÊNTICO ao do visitante anônimo",
              slugsDoVisitante.length > 0 &&
                slugsDaCamada.length === slugsDoVisitante.length &&
                slugsDaCamada.every((s, i) => s === slugsDoVisitante[i]),
              `camada (${slugsDaCamada.length}): ${slugsDaCamada.join(", ")} | visitante (${slugsDoVisitante.length}): ${slugsDoVisitante.join(", ")}`,
            );

            /* — Post público por slug, e o rascunho indistinguível — */
            {
              const bom = await chamar("lerPostPublicoPorSlug (publicado)", () =>
                lerPostPublicoPorSlug(slug("publico")),
              );
              afirmar(
                "post publicado é lido pelo slug, com a Categoria embutida",
                bom?.ok === true &&
                  bom.dados?.slug === slug("publico") &&
                  bom.dados?.categoria?.slug === slug("categoria"),
                JSON.stringify(bom?.erro ?? bom?.dados?.slug ?? bom).slice(0, 200),
              );

              const rascunho = await chamar("lerPostPublicoPorSlug (rascunho)", () =>
                lerPostPublicoPorSlug(slug("rascunho")),
              );
              afirmar(
                "rascunho lido pela camada pública devolve NÃO ENCONTRADO",
                falhouCom(rascunho, ERRO_NAO_ENCONTRADO),
                JSON.stringify(rascunho).slice(0, 200),
              );

              const inexistente = await chamar("lerPostPublicoPorSlug (inexistente)", () =>
                lerPostPublicoPorSlug(slug("nunca-existiu")),
              );
              afirmar(
                "slug que nunca existiu devolve NÃO ENCONTRADO",
                falhouCom(inexistente, ERRO_NAO_ENCONTRADO),
                JSON.stringify(inexistente).slice(0, 200),
              );
              afirmar(
                "rascunho e slug inexistente são INDISTINGUÍVEIS para quem chama",
                rascunho?.erro?.tipo === inexistente?.erro?.tipo &&
                  rascunho?.erro?.mensagem === inexistente?.erro?.mensagem,
                `rascunho: ${rascunho?.erro?.tipo}/"${rascunho?.erro?.mensagem}" | inexistente: ${inexistente?.erro?.tipo}/"${inexistente?.erro?.mensagem}"`,
              );
              afirmar(
                "a resposta do rascunho não vaza o título nem o identificador dele",
                !JSON.stringify(rascunho).includes("Rascunho que nao pode vazar") &&
                  !JSON.stringify(rascunho).includes(idDe.get(slug("rascunho")) ?? "«sem id»"),
                JSON.stringify(rascunho).slice(0, 200),
              );

              /* ─── OS TRÊS NÃO PUBLICADOS, PELO ENDEREÇO PÚBLICO ──────────
                 O critério da Story 2.13 é "com sessão ou sem", e ele vale para
                 os três Estados que não estão no ar — não só para o rascunho.
                 Agendado-por-vir é o mais fácil de errar: ele JÁ tem data, e uma
                 política que olhasse só o Estado o deixaria passar antes da
                 hora. Arquivado é o outro lado: já esteve no ar, e sair do ar
                 precisa significar sair do ar.

                 A prova só vale com a sessão ABERTA neste instante — senão ela
                 diria apenas que o anônimo não vê, que é outra coisa. */
              {
                const { data: aindaViva } = await clienteDoPainel.auth.getSession();
                afirmar(
                  "a sessão continua ABERTA no instante desta prova — sem ela, “não vaza” diria só que o anônimo não vê",
                  Boolean(aindaViva?.session?.access_token),
                  "sem sessão viva a prova de indistinguibilidade seria vácuo",
                );

                const OCULTOS = [
                  ["rascunho", "Rascunho que nao pode vazar"],
                  ["agendado-futuro", "Agendado cuja hora nao chegou"],
                  ["arquivado", "Arquivado antigo"],
                ];
                const respostas = new Map();
                for (const [sufixo] of OCULTOS) {
                  respostas.set(
                    sufixo,
                    await chamar(`lerPostPublicoPorSlug (${sufixo})`, () =>
                      lerPostPublicoPorSlug(slug(sufixo)),
                    ),
                  );
                }

                afirmar(
                  "os TRÊS Estados fora do ar respondem AUSÊNCIA pelo endereço público — rascunho, agendado-por-vir e arquivado",
                  OCULTOS.every(([sufixo]) =>
                    falhouCom(respostas.get(sufixo), ERRO_NAO_ENCONTRADO),
                  ),
                  OCULTOS.map(
                    ([s]) => `${s}: ${respostas.get(s)?.erro?.tipo ?? "ok"}`,
                  ).join(" | "),
                );
                afirmar(
                  "e os três são INDISTINGUÍVEIS de um endereço que nunca existiu — mesmo tipo e mesma frase",
                  OCULTOS.every(
                    ([sufixo]) =>
                      respostas.get(sufixo)?.erro?.tipo === inexistente?.erro?.tipo &&
                      respostas.get(sufixo)?.erro?.mensagem === inexistente?.erro?.mensagem,
                  ),
                  OCULTOS.map(
                    ([s]) =>
                      `${s}: ${respostas.get(s)?.erro?.tipo}/"${respostas.get(s)?.erro?.mensagem}"`,
                  ).join(" | "),
                );
                afirmar(
                  "e nenhum deles vaza título ou identificador na resposta",
                  OCULTOS.every(([sufixo, titulo]) => {
                    const corpo = JSON.stringify(respostas.get(sufixo));
                    return (
                      !corpo.includes(titulo) &&
                      !corpo.includes(idDe.get(slug(sufixo)) ?? "«sem id»")
                    );
                  }),
                  OCULTOS.map(([s]) => JSON.stringify(respostas.get(s)).slice(0, 90)).join(" | "),
                );

                /* CONTROLE POSITIVO. Sem ele, uma camada pública quebrada —
                   que respondesse ausência para tudo — passaria nas três
                   linhas acima com louvor. */
                const publicado = await chamar("lerPostPublicoPorSlug (publicado, com sessão)", () =>
                  lerPostPublicoPorSlug(slug("publico")),
                );
                afirmar(
                  "enquanto o Post PUBLICADO continua alcançável pelo mesmo caminho — a recusa é do Estado, não da camada",
                  publicado?.ok === true && publicado.dados?.slug === slug("publico"),
                  JSON.stringify(publicado?.erro ?? publicado?.dados?.slug).slice(0, 160),
                );

                /* E O DADO ESTÁ LÁ. A prévia abre os três pelo identificador,
                   no MESMO instante em que o endereço público os nega: a
                   ausência é da camada pública, não do dado. É a diferença
                   entre "não existe" e "não é para você por aqui". */
                const pelaPrevia = [];
                for (const [sufixo] of OCULTOS) {
                  pelaPrevia.push(
                    await chamar(`lerPostDoPainelPorId (${sufixo})`, () =>
                      lerPostDoPainelPorId(idDe.get(slug(sufixo)) ?? ZERO_UUID),
                    ),
                  );
                }
                afirmar(
                  "e a PRÉVIA abre os três pelo identificador no mesmo instante — a ausência é da camada pública, não do dado",
                  pelaPrevia.every((r, i) => r?.ok === true && r.dados?.slug === slug(OCULTOS[i][0])),
                  pelaPrevia.map((r) => r?.erro?.tipo ?? r?.dados?.slug).join(" | "),
                );
              }

              const vazio = await chamar("lerPostPublicoPorSlug (vazio)", () =>
                lerPostPublicoPorSlug(""),
              );
              afirmar(
                "slug vazio devolve NÃO ENCONTRADO em vez de consultar o servidor",
                falhouCom(vazio, ERRO_NAO_ENCONTRADO),
                JSON.stringify(vazio).slice(0, 200),
              );
            }

            /* — Taxonomia: o vocabulário que o filtro público precisa — */
            {
              const categorias = await chamar("listarCategorias", () => listarCategorias());
              const slugsCategorias = (categorias?.dados ?? []).map((c) => c.slug);
              afirmar(
                "listarCategorias devolve a Categoria semeada",
                categorias?.ok === true && slugsCategorias.includes(slug("categoria")),
                JSON.stringify(categorias?.erro ?? slugsCategorias).slice(0, 200),
              );
              afirmar(
                "as Categorias vêm ordenadas por `ordem`",
                (() => {
                  // Só as linhas com `ordem` numérica entram na comparação:
                  // converter ausência em zero faria uma Categoria real sem
                  // ordem quebrar a execução por um motivo que não é defeito
                  // desta camada.
                  const ordens = (categorias?.dados ?? [])
                    .map((c) => Number(c.ordem))
                    .filter((n) => Number.isFinite(n));
                  return ordens.every((v, i) => i === 0 || ordens[i - 1] <= v);
                })(),
                (categorias?.dados ?? []).map((c) => c.ordem).join(", "),
              );

              const tags = await chamar("listarTags", () => listarTags());
              const slugsTags = (tags?.dados ?? []).map((t) => t.slug);
              afirmar(
                "listarTags devolve a Tag do post visível",
                tags?.ok === true && slugsTags.includes(slug("tag-visivel")),
                JSON.stringify(tags?.erro ?? slugsTags).slice(0, 200),
              );
              afirmar(
                "listarTags NÃO devolve a Tag que só rotula rascunho",
                !slugsTags.includes(slug("tag-oculta")),
                slugsTags.join(", "),
              );
            }

            /* — Slug aposentado: mesma derivação, mesmos dois sentidos — */
            {
              const bom = await chamar("resolverSlugAposentado (visível)", () =>
                resolverSlugAposentado(slug("antigo-do-publico")),
              );
              afirmar(
                "slug aposentado de post visível resolve para o slug atual",
                bom?.ok === true &&
                  bom.dados?.slugAtual === slug("publico") &&
                  bom.dados?.postId === idDe.get(slug("publico")),
                JSON.stringify(bom?.erro ?? bom?.dados).slice(0, 200),
              );

              const oculto = await chamar("resolverSlugAposentado (de rascunho)", () =>
                resolverSlugAposentado(slug("antigo-do-rascunho")),
              );
              afirmar(
                "slug aposentado de rascunho devolve NÃO ENCONTRADO",
                falhouCom(oculto, ERRO_NAO_ENCONTRADO),
                JSON.stringify(oculto).slice(0, 200),
              );

              const nunca = await chamar("resolverSlugAposentado (inexistente)", () =>
                resolverSlugAposentado(slug("nunca-foi-slug")),
              );
              afirmar(
                "slug aposentado inexistente é indistinguível do de rascunho",
                falhouCom(nunca, ERRO_NAO_ENCONTRADO) &&
                  nunca?.erro?.mensagem === oculto?.erro?.mensagem,
                `${oculto?.erro?.mensagem} | ${nunca?.erro?.mensagem}`,
              );
            }

            /* — Metacaractere do PostgREST, corpo do Post e página vazia — */
            {
              // Vírgula, ponto e parêntese são operadores do filtro. Sem a
              // validação de formato eles produzem 400, e o visitante vê
              // defeito onde deveria ver "página não encontrada".
              for (const venenoso of ["a,b", "in.(1,2)", "post.slug", "a)b(c"]) {
                const r = await chamar(`lerPostPublicoPorSlug ${venenoso}`, () =>
                  lerPostPublicoPorSlug(venenoso),
                );
                afirmar(
                  `slug com metacaractere (${venenoso}) devolve NÃO ENCONTRADO, não defeito`,
                  falhouCom(r, ERRO_NAO_ENCONTRADO),
                  JSON.stringify(r).slice(0, 200),
                );
              }
              const antigoVenenoso = await chamar("resolverSlugAposentado a,b", () =>
                resolverSlugAposentado("a,b"),
              );
              afirmar(
                "o mesmo vale para o resolvedor do 301",
                falhouCom(antigoVenenoso, ERRO_NAO_ENCONTRADO),
                JSON.stringify(antigoVenenoso).slice(0, 200),
              );

              // A listagem não carrega o corpo; a leitura unitária carrega.
              const listagem = await chamar("listarPostsPublicos (colunas)", () =>
                listarPostsPublicos(),
              );
              const linhaDaListagem = (listagem?.dados ?? []).find(
                (p) => p?.slug === slug("publico"),
              );
              const unitario = await chamar("lerPostPublicoPorSlug (colunas)", () =>
                lerPostPublicoPorSlug(slug("publico")),
              );
              afirmar(
                "a listagem NÃO traz `conteudo` nem `conteudo_html`",
                Boolean(linhaDaListagem) &&
                  !("conteudo" in linhaDaListagem) &&
                  !("conteudo_html" in linhaDaListagem),
                `chaves: ${Object.keys(linhaDaListagem ?? {}).join(", ")} — 200 documentos completos numa resposta só é o que a listagem de 2 s não sobrevive`,
              );
              afirmar(
                "a leitura unitária TRAZ o corpo do Post",
                unitario?.ok === true &&
                  "conteudo" in (unitario.dados ?? {}) &&
                  "conteudo_html" in (unitario.dados ?? {}),
                `chaves: ${Object.keys(unitario?.dados ?? {}).join(", ")}`,
              );

              // Página além do fim é lista vazia, não erro: quem pagina uma
              // lista que encolheu cairia numa tela de defeito onde deveria
              // ver "nada mais por aqui".
              const alemDoFim = await chamar("listarPostsPublicos (fim)", () =>
                listarPostsPublicos({ deslocamento: 100000, limite: 10 }),
              );
              afirmar(
                "deslocamento além do fim devolve lista VAZIA, não erro",
                alemDoFim?.ok === true && Array.isArray(alemDoFim.dados) &&
                  alemDoFim.dados.length === 0,
                JSON.stringify(alemDoFim).slice(0, 200),
              );
              const comTeto = await chamar("listarPostsPublicos (teto)", () =>
                listarPostsPublicos({ limite: 1 }),
              );
              afirmar(
                "o limite pedido é respeitado",
                comTeto?.ok === true && comTeto.dados.length <= 1,
                `voltaram: ${comTeto?.dados?.length ?? "—"}`,
              );
            }
          } finally {
            const fechar = await executarSql(
              token,
              `update public.posts set publicado_em = ${LONGE}
                where slug = ${literal(slug("publico"))}`,
            );
            afirmar(
              "a janela de visibilidade foi fechada",
              fechar.ok,
              fechar.erro ?? "",
            );
          }

          /* ── A BUSCA, contra o projeto de verdade (Story 2.11) ────────
             É a prova que justifica ter posto a busca no banco: cada campo
             que o critério nomeia ganha um Post em que o termo aparece SÓ
             ali, e a asserção diz qual Post voltou — não quantos.

             Os marcadores carregam o nonce da execução, então nenhum deles
             pode casar com dado real do projeto nem com outra execução
             simultânea. */

          const n8 = nonce.slice(0, 8);
          const mTitulo = `tit${n8}`;
          const mCategoria = `cat${n8}`;
          const mAutor = `aut${n8}`;
          const mTag = `tag${n8}`;
          const ESPECIAL = `50%_(esp${n8}) "a,b"`;

          const semeaduraDaBusca = await executarSql(
            token,
            `insert into public.categorias (slug, nome, icone, cor, ordem) values
               (${literal(slug("categoria-de-busca"))}, ${literal(`Categoria ${mCategoria}`)}, 'flask', 'oklch(0.7 0.1 200)', 98);

             insert into public.tags (slug, nome) values
               (${literal(slug("tag-de-busca"))}, ${literal(`Tag ${mTag}`)});

             insert into public.posts
               (slug, titulo, resumo, autor_nome, estado, publicado_em, atualizado_em, categoria_id)
             select v.slug, v.titulo, 'Resumo da busca', v.autor,
                    v.estado::public.estado_post, v.publicado_em, v.atualizado_em,
                    case when v.com_categoria then c.id else null end
               from (values
                 (${literal(slug("busca-titulo"))}, ${literal(`Achado por titulo ${mTitulo}`)},
                  '', 'rascunho', null, now() - interval '11 days', false),
                 (${literal(slug("busca-categoria"))}, 'Achado por categoria',
                  '', 'publicado', ${LONGE}, now() - interval '12 days', true),
                 (${literal(slug("busca-autor"))}, 'Achado por autor',
                  ${literal(`Autor ${mAutor}`)}, 'rascunho', null, now() - interval '13 days', false),
                 (${literal(slug("busca-tag"))}, 'Achado por tag',
                  '', 'rascunho', null, now() - interval '14 days', false),
                 (${literal(slug("busca-acentuada"))}, ${literal(`Estratégia ${n8}`)},
                  '', 'rascunho', null, now() - interval '15 days', false),
                 (${literal(slug("busca-sem-acento"))}, ${literal(`Automacao ${n8}`)},
                  '', 'rascunho', null, now() - interval '16 days', false),
                 (${literal(slug("busca-especial"))}, ${literal(`Promocao ${ESPECIAL} hoje`)},
                  '', 'rascunho', null, now() - interval '17 days', false)
               ) as v(slug, titulo, autor, estado, publicado_em, atualizado_em, com_categoria)
               cross join public.categorias c
              where c.slug = ${literal(slug("categoria-de-busca"))};

             insert into public.posts_tags (post_id, tag_id)
             select p.id, t.id from public.posts p, public.tags t
              where p.slug = ${literal(slug("busca-tag"))}
                and t.slug = ${literal(slug("tag-de-busca"))};`,
          );
          const semeouBusca = afirmar(
            "os sete posts da prova de busca foram semeados",
            semeaduraDaBusca.ok,
            semeaduraDaBusca.erro ?? "",
          );

          if (semeouBusca) {
            const novosIds = await executarSql(
              token,
              `select id::text as id from public.posts
                where slug like ${literal(marca)} and slug not in (
                  ${[literal(slug("publico")), literal(slug("agendado-futuro")), literal(slug("rascunho")), literal(slug("arquivado"))].join(", ")}
                )`,
            );
            // Os ids entram na lista de resíduo: sem eles, a associação de tag
            // do post de busca sairia do projeto sem ninguém CONFERIR que saiu.
            idsSemeados.push(
              ...((novosIds.ok && Array.isArray(novosIds.dados) ? novosIds.dados : []).map(
                (l) => l.id,
              )),
            );
          }

          /** O que a busca devolveu, restrito à semeadura desta execução. */
          const buscar = async (rotulo, pedido) => {
            const r = await chamar(`listarPostsDoPainel (${rotulo})`, () =>
              listarPostsDoPainel(pedido),
            );
            return {
              resultado: r,
              sufixos: (r?.dados ?? [])
                .map((p) => String(p?.slug ?? ""))
                .filter((s) => s.startsWith(prefixo))
                .map((s) => s.slice(prefixo.length))
                .sort(),
            };
          };

          if (semeouBusca) {
            /* — Cada campo do critério, isolado — */
            for (const [onde, termo, esperado] of [
              ["no título", mTitulo, "busca-titulo"],
              ["no nome da Categoria", mCategoria, "busca-categoria"],
              ["no nome do Autor", mAutor, "busca-autor"],
              ["numa Tag", mTag, "busca-tag"],
            ]) {
              const { resultado, sufixos } = await buscar(onde, { termo });
              afirmar(
                `a busca acha o Post cujo termo só existe ${onde}`,
                resultado?.ok === true &&
                  sufixos.length === 1 &&
                  sufixos[0] === esperado,
                `voltaram: ${sufixos.join(", ") || "nenhum"} ${JSON.stringify(resultado?.erro ?? "").slice(0, 140)}`,
              );
            }

            /* — Duas palavras: todas precisam aparecer, em qualquer ordem — */
            //
            // É o que separa uma busca de uma comparação de frase. "guia
            // atalhos" precisa achar "Guia de atalhos": o "de" no meio quebra a
            // contiguidade, e uma busca que exige a frase inteira responde que
            // o Post não existe — a conclusão errada que esta story impede.
            {
              const duas = await buscar("duas palavras fora de ordem", {
                termo: `titulo achado`,
              });
              afirmar(
                "termo de duas palavras acha o Post mesmo fora de ordem e com palavra no meio",
                duas.resultado?.ok === true &&
                  duas.sufixos.length === 1 &&
                  duas.sufixos[0] === "busca-titulo",
                `voltaram: ${duas.sufixos.join(", ") || "nenhum"}`,
              );

              const cruzada = await buscar("palavras em campos diferentes", {
                termo: `${mAutor} achado`,
              });
              afirmar(
                "e as palavras podem estar em CAMPOS diferentes — uma no Autor, outra no título",
                cruzada.resultado?.ok === true &&
                  cruzada.sufixos.length === 1 &&
                  cruzada.sufixos[0] === "busca-autor",
                `voltaram: ${cruzada.sufixos.join(", ") || "nenhum"}`,
              );

              // Conjunção, não união: acrescentar palavra ESTREITA o resultado.
              // Uma busca que devolvesse mais linhas a cada palavra digitada
              // seria o oposto de buscar.
              const estreita = await buscar("palavra a mais", {
                termo: `achado ${mAutor} inexistente${n8}`,
              });
              afirmar(
                "acrescentar uma palavra que não existe ESTREITA até zero — é conjunção, não união",
                estreita.resultado?.ok === true && estreita.sufixos.length === 0,
                `voltaram: ${estreita.sufixos.join(", ") || "nenhum"}`,
              );
            }

            /* — Acento, nas DUAS direções, e caixa — */
            {
              const semAcento = await buscar("sem acento", { termo: `estrategia ${n8}` });
              afirmar(
                "termo SEM acento acha o texto acentuado — “estrategia” encontra “Estratégia”",
                semAcento.resultado?.ok === true &&
                  semAcento.sufixos.length === 1 &&
                  semAcento.sufixos[0] === "busca-acentuada",
                `voltaram: ${semAcento.sufixos.join(", ") || "nenhum"}`,
              );

              const comAcento = await buscar("com acento", { termo: `automação ${n8}` });
              afirmar(
                "e o inverso vale: termo COM acento acha o texto sem acento",
                comAcento.resultado?.ok === true &&
                  comAcento.sufixos.length === 1 &&
                  comAcento.sufixos[0] === "busca-sem-acento",
                `voltaram: ${comAcento.sufixos.join(", ") || "nenhum"}`,
              );

              const gritando = await buscar("caixa alta", { termo: `ESTRATÉGIA ${n8}` });
              afirmar(
                "maiúsculas dão o mesmo resultado que minúsculas, com ou sem acento",
                gritando.resultado?.ok === true &&
                  gritando.sufixos.length === 1 &&
                  gritando.sufixos[0] === "busca-acentuada",
                `voltaram: ${gritando.sufixos.join(", ") || "nenhum"}`,
              );
            }

            /* — Caractere especial é TEXTO, nunca padrão nem sintaxe — */
            {
              const especial = await buscar("especial", { termo: ESPECIAL });
              afirmar(
                "termo com %, _, parêntese, vírgula e aspas é achado como TEXTO, sem erro de consulta",
                especial.resultado?.ok === true &&
                  especial.sufixos.length === 1 &&
                  especial.sufixos[0] === "busca-especial",
                `voltaram: ${especial.sufixos.join(", ") || "nenhum"} ${JSON.stringify(especial.resultado?.erro ?? "").slice(0, 200)}`,
              );

              // A prova de que não é `like`: sozinho, `%` casaria TUDO se o
              // termo virasse padrão. Aqui ele só acha quem tem um `%` escrito.
              const curinga = await buscar("só o curinga", { termo: "%" });
              afirmar(
                "`%` sozinho NÃO é curinga: acha só o Post que tem um `%` escrito",
                curinga.resultado?.ok === true &&
                  curinga.sufixos.length === 1 &&
                  curinga.sufixos[0] === "busca-especial",
                `voltaram: ${curinga.sufixos.join(", ") || "nenhum"}`,
              );

              const sublinhado = await buscar("sublinhado", { termo: "achado _or" });
              afirmar(
                "`_` também não é curinga de um caractere — “achado _or” não acha “Achado por”",
                sublinhado.resultado?.ok === true && sublinhado.sufixos.length === 0,
                `voltaram: ${sublinhado.sufixos.join(", ") || "nenhum"}`,
              );

              const nada = await buscar("sem correspondência", {
                termo: `nao-existe-${n8}`,
              });
              afirmar(
                "termo sem correspondência devolve lista VAZIA com sucesso — não é erro",
                nada.resultado?.ok === true &&
                  Array.isArray(nada.resultado.dados) &&
                  nada.sufixos.length === 0,
                JSON.stringify(nada.resultado).slice(0, 200),
              );
            }

            /* — O filtro de Estado lê a coluna, e combina com a busca — */
            {
              const arquivados = await buscar("estado arquivado", {
                estados: ["arquivado"],
              });
              afirmar(
                "o filtro de Estado restringe pela coluna `estado`",
                arquivados.resultado?.ok === true &&
                  arquivados.sufixos.length === 1 &&
                  arquivados.sufixos[0] === "arquivado",
                `voltaram: ${arquivados.sufixos.join(", ") || "nenhum"}`,
              );

              const dois = await buscar("dois estados", {
                estados: ["agendado", "arquivado"],
              });
              afirmar(
                "e aceita mais de um Estado ao mesmo tempo",
                dois.resultado?.ok === true &&
                  dois.sufixos.length === 2 &&
                  dois.sufixos[0] === "agendado-futuro" &&
                  dois.sufixos[1] === "arquivado",
                `voltaram: ${dois.sufixos.join(", ") || "nenhum"}`,
              );

              const combinado = await buscar("busca + estado que casa", {
                termo: mTitulo,
                estados: ["rascunho"],
              });
              afirmar(
                "busca e filtro COMBINAM: as duas restrições valem ao mesmo tempo",
                combinado.resultado?.ok === true &&
                  combinado.sufixos.length === 1 &&
                  combinado.sufixos[0] === "busca-titulo",
                `voltaram: ${combinado.sufixos.join(", ") || "nenhum"}`,
              );

              const excludente = await buscar("busca + estado que não casa", {
                termo: mTitulo,
                estados: ["publicado"],
              });
              afirmar(
                "e a combinação é conjunção, não união: o mesmo termo em outro Estado não volta",
                excludente.resultado?.ok === true && excludente.sufixos.length === 0,
                `voltaram: ${excludente.sufixos.join(", ") || "nenhum"}`,
              );

              const inventado = await chamar("listarPostsDoPainel (estado inventado)", () =>
                listarPostsDoPainel({ estados: ["publicada"] }),
              );
              afirmar(
                "Estado fora do vocabulário fechado é RECUSADO, não ignorado em silêncio",
                inventado?.ok === false &&
                  inventado?.erro?.tipo === ERRO_INESPERADO &&
                  String(inventado?.erro?.detalhe ?? "").includes("publicada"),
                JSON.stringify(inventado).slice(0, 220),
              );

              const listaVazia = await buscar("lista de estados vazia", { estados: [] });
              afirmar(
                "lista de Estados VAZIA é ausência de filtro, não “nenhum Estado”",
                listaVazia.resultado?.ok === true && listaVazia.sufixos.length === 11,
                `voltaram ${listaVazia.sufixos.length}: ${listaVazia.sufixos.join(", ") || "nenhum"}`,
              );
            }

            /* — Campo limpo volta à listagem inteira — */
            {
              const limpo = await buscar("campo limpo", { termo: "   " });
              afirmar(
                "termo só de espaços é ausência de busca: a listagem inteira volta",
                limpo.resultado?.ok === true && limpo.sufixos.length === 11,
                `voltaram ${limpo.sufixos.length}: ${limpo.sufixos.join(", ") || "nenhum"}`,
              );
            }

            /* — A ordem continua sendo a da camada, com busca aplicada — */
            {
              const { resultado } = await buscar("ordem sob busca", { termo: n8 });
              const daBusca = (resultado?.dados ?? []).filter((p) =>
                String(p?.slug ?? "").startsWith(prefixo),
              );
              const esperada = [...daBusca]
                .sort((a, b) => {
                  const ka = Date.parse(a.publicado_em ?? a.atualizado_em);
                  const kb = Date.parse(b.publicado_em ?? b.atualizado_em);
                  return kb - ka || String(a.id).localeCompare(String(b.id));
                })
                .map((p) => p.slug);
              afirmar(
                "com busca aplicada, a ordem continua sendo `COALESCE(publicado_em, atualizado_em)` DESC",
                daBusca.length >= 2 &&
                  esperada.every((s, i) => s === daBusca[i].slug),
                `obtida: ${daBusca.map((p) => p.slug.slice(prefixo.length)).join(" > ")}`,
              );
            }

            /* — A busca NÃO empresta visibilidade a quem não tem — */
            //
            // A função é `security invoker` justamente para isto: um termo que
            // casa com um rascunho, buscado sem sessão, não pode devolver o
            // rascunho. Aqui a prova é do outro lado da mesma moeda — a camada
            // pública não tem busca, e a do Painel exige sessão; o que se
            // afirma é que a RLS continua sendo a guardiã, com a leitura
            // anônima crua contra a função.
            {
              const r = await fetch(
                `${URL_PROJETO}/rest/v1/rpc/buscar_posts_do_painel?select=slug`,
                {
                  method: "POST",
                  signal: AbortSignal.timeout(TIMEOUT_MS),
                  headers: {
                    apikey: chavePublicavel,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ p_termo: mTitulo, p_estados: null }),
                },
              );
              const corpo = await r.text();
              let vazamento = true;
              try {
                const v = JSON.parse(corpo);
                vazamento = Array.isArray(v)
                  ? v.some((l) => String(l?.slug ?? "").startsWith(prefixo))
                  : false;
              } catch {
                vazamento = false;
              }
              afirmar(
                "o visitante anônimo não extrai rascunho pela função de busca",
                !vazamento,
                `HTTP ${r.status} — ${corpo.slice(0, 200)}`,
              );
            }

            /* ─── AS LEITURAS PÚBLICAS NOVAS (Story 2.15) ─────────────────
               O site passou a ler do banco: busca própria, relacionados por
               Categoria e Tags do artigo. As três entram na MESMA matriz que
               já cobre `listarPostsPublicos` e `lerPostPublicoPorSlug`, e pelo
               mesmo motivo: é aqui que a visibilidade se prova.

               A janela é aberta de propósito com DOIS Posts visíveis na mesma
               Categoria e um terceiro visível em OUTRA. Sem o segundo da mesma
               Categoria, "os relacionados trazem outro Post" passaria por
               vacuidade; sem o de outra Categoria, "só os da mesma" também. */
            try {
              const abrir = await executarSql(
                token,
                `update public.posts
                    set estado = 'publicado', publicado_em = now() - interval '1 day'
                  where slug in (${literal(slug("publico"))}, ${literal(slug("arquivado"))}, ${literal(slug("busca-categoria"))})`,
              );
              afirmar(
                "a janela das leituras públicas novas foi aberta",
                abrir.ok,
                abrir.erro ?? "",
              );

              const idsDeCategoria = await executarSql(
                token,
                `select slug, id::text as id from public.categorias
                  where slug like ${literal(marca)}`,
              );
              const categoriaDe = new Map(
                (idsDeCategoria.ok && Array.isArray(idsDeCategoria.dados)
                  ? idsDeCategoria.dados
                  : []
                ).map((l) => [l.slug, l.id]),
              );
              const idDaCategoria = categoriaDe.get(slug("categoria")) ?? ZERO_UUID;
              afirmar(
                "as duas Categorias semeadas têm identificador",
                categoriaDe.size === 2 && idDaCategoria !== ZERO_UUID,
                `obtidas: ${categoriaDe.size}`,
              );

              /* Controle positivo do instante: sem sessão viva aqui, "a busca
                 pública não traz rascunho" diria só que o anônimo não vê — que
                 é outra coisa, e não é o que esta story promete. */
              const { data: sessaoDaBusca } = await clienteDoPainel.auth.getSession();
              const sessaoAberta = afirmar(
                "a sessão continua ABERTA no instante das leituras públicas novas",
                Boolean(sessaoDaBusca?.session?.access_token),
                "sem sessão viva, a separação não prova nada",
              );

              /** O que uma leitura pública devolveu, restrito à semeadura. */
              const sufixosDe = (resultado) =>
                (resultado?.dados ?? [])
                  .map((p) => String(p?.slug ?? ""))
                  .filter((s) => s.startsWith(prefixo))
                  .map((s) => s.slice(prefixo.length))
                  .sort();

              /* — Termo vazio devolve o MESMO conjunto que a listagem — */
              //
              // As duas precisam concordar: a página usa a busca como caminho
              // único, e `listarPostsPublicos` é a leitura direta da tabela que
              // serve de referência. Se elas divergirem, uma das duas está
              // repetindo (ou perdendo) a regra de visibilidade.
              const semTermo = await chamar("buscarPostsPublicos (sem termo)", () =>
                buscarPostsPublicos({}),
              );
              const listagemDireta = await chamar(
                "listarPostsPublicos (para comparar com a busca)",
                () => listarPostsPublicos(),
              );
              const daBusca = sufixosDe(semTermo);
              const daListagem = sufixosDe(listagemDireta);
              afirmar(
                "busca pública com termo vazio devolve EXATAMENTE o mesmo conjunto que a listagem",
                semTermo?.ok === true &&
                  listagemDireta?.ok === true &&
                  daListagem.length > 0 &&
                  daBusca.length === daListagem.length &&
                  daBusca.every((s, i) => s === daListagem[i]),
                `busca (${daBusca.length}): ${daBusca.join(", ")} | listagem (${daListagem.length}): ${daListagem.join(", ")}`,
              );

              /* — Sem acento e por palavra, como no Painel — */
              const semAcento = await chamar("buscarPostsPublicos (sem acento)", () =>
                buscarPostsPublicos({ termo: "publico camada" }),
              );
              afirmar(
                "a busca pública acha sem acento e por palavra — “publico camada” encontra “Post público da camada”",
                semAcento?.ok === true &&
                  sufixosDe(semAcento).length === 1 &&
                  sufixosDe(semAcento)[0] === "publico",
                `voltaram: ${sufixosDe(semAcento).join(", ") || "nenhum"} ${JSON.stringify(semAcento?.erro ?? "").slice(0, 140)}`,
              );

              /* ★ A SEPARAÇÃO, PELO CAMINHO NOVO ★ */
              const doRascunho = await chamar("buscarPostsPublicos (termo do rascunho)", () =>
                buscarPostsPublicos({ termo: mTitulo }),
              );
              afirmar(
                "SEPARAÇÃO: com sessão aberta, a busca pública NÃO alcança rascunho",
                sessaoAberta &&
                  doRascunho?.ok === true &&
                  sufixosDe(doRascunho).length === 0,
                `voltaram: ${sufixosDe(doRascunho).join(", ") || "nenhum"}`,
              );
              const doAgendado = await chamar("buscarPostsPublicos (termo do agendado)", () =>
                buscarPostsPublicos({ termo: "agendado hora chegou" }),
              );
              afirmar(
                "SEPARAÇÃO: nem o agendado cuja hora não chegou",
                doAgendado?.ok === true && sufixosDe(doAgendado).length === 0,
                `voltaram: ${sufixosDe(doAgendado).join(", ") || "nenhum"}`,
              );

              /* — O filtro por Categoria, que é o outro pedido do visitante — */
              const porCategoria = await chamar(
                "buscarPostsPublicos (filtro de categoria)",
                () => buscarPostsPublicos({ categoriaId: idDaCategoria }),
              );
              afirmar(
                "o filtro por Categoria devolve só os Posts visíveis daquela Categoria",
                porCategoria?.ok === true &&
                  sufixosDe(porCategoria).join(",") === "arquivado,publico",
                `voltaram: ${sufixosDe(porCategoria).join(", ") || "nenhum"}`,
              );
              const categoriaTorta = await chamar(
                "buscarPostsPublicos (categoria fora do formato)",
                () => buscarPostsPublicos({ categoriaId: "nao-e-uuid" }),
              );
              afirmar(
                "categoria fora do formato é RECUSADA, não ignorada em silêncio",
                categoriaTorta?.ok === false &&
                  categoriaTorta?.erro?.tipo === ERRO_INESPERADO,
                JSON.stringify(categoriaTorta).slice(0, 200),
              );

              /* ─── E OS RELACIONADOS RECUSAM PELO MESMO CRITÉRIO ────────
                 Duas funções irmãs com políticas opostas para o mesmo valor
                 torto é como uma delas passa a mentir sem ninguém notar. Aqui
                 as duas recusam — e AUSÊNCIA continua sendo resposta, porque
                 Post sem Categoria é estado normal. */
              const relTorta = await chamar(
                "listarRelacionadosPublicos (categoria torta)",
                () => listarRelacionadosPublicos({ categoriaId: "nao-e-uuid" }),
              );
              afirmar(
                "os relacionados recusam `categoriaId` torto do mesmo jeito que a busca — e ausência continua sendo lista vazia",
                relTorta?.ok === false && relTorta?.erro?.tipo === ERRO_INESPERADO,
                JSON.stringify(relTorta).slice(0, 200),
              );
              /* ★ O `exceto` TORTO É O PIOR DOS DOIS ★
                 Com ele virando `null`, o `neq` não era aplicado e o Post podia
                 aparecer nos relacionados DELE MESMO — a única coisa que a
                 função promete não fazer. */
              const exceptoTorto = await chamar(
                "listarRelacionadosPublicos (exceto torto)",
                () =>
                  listarRelacionadosPublicos({
                    categoriaId: idDaCategoria,
                    exceto: "nao-e-uuid",
                  }),
              );
              afirmar(
                "e recusam `exceto` torto — ignorá-lo deixaria o Post aparecer nos relacionados dele mesmo",
                exceptoTorto?.ok === false &&
                  exceptoTorto?.erro?.tipo === ERRO_INESPERADO,
                JSON.stringify(exceptoTorto).slice(0, 200),
              );

              /* — Relacionados: mesma Categoria, visíveis, sem o próprio — */
              const relacionados = await chamar("listarRelacionadosPublicos", () =>
                listarRelacionadosPublicos({
                  categoriaId: idDaCategoria,
                  exceto: idDe.get(slug("publico")),
                }),
              );
              const dosRelacionados = sufixosDe(relacionados);
              afirmar(
                "os relacionados trazem outro Post VISÍVEL da mesma Categoria",
                relacionados?.ok === true && dosRelacionados.includes("arquivado"),
                `voltaram: ${dosRelacionados.join(", ") || "nenhum"} ${JSON.stringify(relacionados?.erro ?? "").slice(0, 140)}`,
              );
              afirmar(
                "e nunca o próprio Post",
                !dosRelacionados.includes("publico"),
                `voltaram: ${dosRelacionados.join(", ") || "nenhum"}`,
              );
              afirmar(
                "e nenhum Post fora do ar — quem decide continua sendo a política",
                sessaoAberta &&
                  !dosRelacionados.includes("rascunho") &&
                  !dosRelacionados.includes("agendado-futuro"),
                `voltaram: ${dosRelacionados.join(", ") || "nenhum"}`,
              );
              afirmar(
                "e nenhum Post de OUTRA Categoria, mesmo estando no ar",
                !dosRelacionados.includes("busca-categoria"),
                `voltaram: ${dosRelacionados.join(", ") || "nenhum"}`,
              );
              const semCategoria = await chamar(
                "listarRelacionadosPublicos (sem categoria)",
                () => listarRelacionadosPublicos({ categoriaId: null, exceto: idDe.get(slug("publico")) }),
              );
              afirmar(
                "Post sem Categoria não tem relacionados — lista vazia com sucesso, e não erro",
                semCategoria?.ok === true &&
                  Array.isArray(semCategoria.dados) &&
                  semCategoria.dados.length === 0,
                JSON.stringify(semCategoria).slice(0, 200),
              );

              /* — As Tags do artigo, pelo caminho anônimo — */
              const tagsPublicas = await chamar("listarTagsDoPostPublico (publicado)", () =>
                listarTagsDoPostPublico(idDe.get(slug("publico"))),
              );
              afirmar(
                "as Tags públicas de um Post publicado voltam com nome",
                tagsPublicas?.ok === true &&
                  tagsPublicas.dados.length === 1 &&
                  tagsPublicas.dados[0]?.nome === "Tag do post visivel",
                JSON.stringify(tagsPublicas?.erro ?? tagsPublicas?.dados).slice(0, 220),
              );
              const tagsDeRascunho = await chamar("listarTagsDoPostPublico (rascunho)", () =>
                listarTagsDoPostPublico(idDe.get(slug("rascunho"))),
              );
              afirmar(
                "SEPARAÇÃO: as Tags de um rascunho NÃO voltam pelo caminho público, mesmo com sessão aberta",
                sessaoAberta &&
                  tagsDeRascunho?.ok === true &&
                  tagsDeRascunho.dados.length === 0,
                JSON.stringify(tagsDeRascunho?.erro ?? tagsDeRascunho?.dados).slice(0, 220),
              );

              /* — E o visitante ANÔNIMO CRU contra a função nova — */
              //
              // O contrapeso do bloco acima: ali a sessão está aberta e a
              // camada usa o cliente anônimo; aqui não há camada nenhuma, só a
              // função exposta em `/rpc/`. É onde um `security definer` ou uma
              // concessão larga demais apareceria.
              const cru = async (corpoDoPedido) => {
                try {
                  const r = await fetch(
                    `${URL_PROJETO}/rest/v1/rpc/buscar_posts_publicos?select=slug`,
                    {
                      method: "POST",
                      signal: AbortSignal.timeout(TIMEOUT_MS),
                      headers: {
                        apikey: chavePublicavel,
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify(corpoDoPedido),
                    },
                  );
                  const corpo = await r.text();
                  let lista = null;
                  try {
                    const v = JSON.parse(corpo);
                    lista = Array.isArray(v) ? v : null;
                  } catch {
                    lista = null;
                  }
                  return { status: r.status, corpo, lista };
                } catch (erro) {
                  return { status: 0, corpo: String(erro?.message ?? erro), lista: null };
                }
              };
              const cruDoRascunho = await cru({ p_termo: mTitulo, p_categoria_id: null });
              afirmar(
                "o visitante anônimo não extrai rascunho pela função de busca PÚBLICA",
                cruDoRascunho.status === 200 &&
                  Array.isArray(cruDoRascunho.lista) &&
                  !cruDoRascunho.lista.some((l) =>
                    String(l?.slug ?? "").startsWith(prefixo),
                  ),
                `HTTP ${cruDoRascunho.status} — ${cruDoRascunho.corpo.slice(0, 200)}`,
              );
              /* CONTROLE POSITIVO. Sem ele, uma função revogada de `anon` —
                 que respondesse 403 para tudo — passaria na linha acima com
                 louvor, e o blog inteiro estaria sem busca. */
              const cruDoPublicado = await cru({
                p_termo: "publico camada",
                p_categoria_id: null,
              });
              afirmar(
                "e ele ALCANÇA o Post publicado pela mesma função — a recusa é do Estado, não da função",
                cruDoPublicado.status === 200 &&
                  (cruDoPublicado.lista ?? []).some(
                    (l) => String(l?.slug ?? "") === slug("publico"),
                  ),
                `HTTP ${cruDoPublicado.status} — ${cruDoPublicado.corpo.slice(0, 200)}`,
              );

              /* ─── CADA CAMPO DO CRITÉRIO, ISOLADO ─────────────────────
                 O comentário da migração afirma cinco campos: Título, Resumo,
                 Autor, Categoria e Tag. Provar só o título deixava quatro
                 promessas sem asserção — e a de Tag é a mais frágil das cinco,
                 porque ela depende de a política anônima de `tags` deixar o
                 `anon` ler a tag do Post visível. Se ela negar, ou se um
                 `coalesce` cair, a busca por Tag ou por Autor para de achar e
                 tudo continua verde.

                 É a MESMA matriz que a busca do Painel já tem, e ela exige uma
                 segunda janela: os Posts com marcador por campo nasceram
                 rascunho, de propósito, porque é como rascunho que eles provam
                 a separação logo acima. Aqui eles sobem ao ar, e o marcador de
                 Resumo entra agora — os sete foram semeados com o mesmo
                 resumo, e sem um marcador próprio "só no resumo" seria
                 impossível de afirmar. */
              const mResumo = `res${n8}`;
              const POR_CAMPO = [
                ["no título", mTitulo, "busca-titulo"],
                ["no resumo", mResumo, "busca-acentuada"],
                ["no nome do Autor", mAutor, "busca-autor"],
                ["no nome da Categoria", mCategoria, "busca-categoria"],
                ["numa Tag", mTag, "busca-tag"],
              ];
              const abrirPorCampo = await executarSql(
                token,
                `update public.posts
                    set estado = 'publicado'::public.estado_post,
                        publicado_em = now() - interval '1 day'
                  where slug in (${[
                    literal(slug("busca-titulo")),
                    literal(slug("busca-autor")),
                    literal(slug("busca-tag")),
                    literal(slug("busca-acentuada")),
                  ].join(", ")});
                 update public.posts set resumo = ${literal(`Resumo ${mResumo}`)}
                  where slug = ${literal(slug("busca-acentuada"))}`,
              );
              afirmar(
                "a janela por campo da busca pública foi aberta",
                abrirPorCampo.ok,
                abrirPorCampo.erro ?? "",
              );

              for (const [onde, termo, esperado] of POR_CAMPO) {
                const r = await chamar(`buscarPostsPublicos (${onde})`, () =>
                  buscarPostsPublicos({ termo }),
                );
                const vieram = sufixosDe(r);
                afirmar(
                  `a busca pública acha o Post cujo termo só existe ${onde}`,
                  r?.ok === true && vieram.length === 1 && vieram[0] === esperado,
                  `voltaram: ${vieram.join(", ") || "nenhum"} ${JSON.stringify(r?.erro ?? "").slice(0, 140)}`,
                );
              }
            } finally {
              /* ─── FECHA O QUE ABRIU, E O QUE ABRIU FOI O ESTADO TAMBÉM ───
                 A janela anterior mexia só em `publicado_em`, e por isso abria
                 e fechava simétrica. Esta abre `estado` junto — o Post
                 `arquivado` vira `publicado` para virar relacionado visível —,
                 e um `finally` que só devolvesse a data deixaria a matriz de
                 Estados alterada no projeto de PRODUÇÃO até a limpeza final.
                 A simetria é restaurada aqui, e CONFERIDA logo abaixo: um
                 `update` que erre a linha volta verde sem a conferência. */
              /* A reversão alcança EXATAMENTE as três linhas que a abertura
                 tocou, e devolve a cada uma o valor com que ela foi semeada —
                 não um valor parecido. */
              const fechar = await executarSql(
                token,
                `update public.posts set publicado_em = ${LONGE}
                  where slug in (${literal(slug("publico"))}, ${literal(slug("busca-categoria"))});
                 update public.posts
                    set estado = 'arquivado'::public.estado_post,
                        publicado_em = now() - interval '5 days'
                  where slug = ${literal(slug("arquivado"))};
                 update public.posts
                    set estado = 'rascunho'::public.estado_post,
                        publicado_em = null,
                        resumo = 'Resumo da busca'
                  where slug in (${[
                    literal(slug("busca-titulo")),
                    literal(slug("busca-autor")),
                    literal(slug("busca-tag")),
                    literal(slug("busca-acentuada")),
                  ].join(", ")})`,
              );
              afirmar(
                "a janela das leituras públicas novas foi fechada — inclusive o `estado`, que ela também abriu",
                fechar.ok,
                fechar.erro ?? "",
              );

              /* E a matriz voltou a ser a que era. Sem esta conferência, o
                 `update` acima poderia errar uma linha e o projeto de produção
                 terminaria a execução com um Post arquivado marcado como
                 publicado — que é exatamente o tipo de resíduo que a varredura
                 do fim não procura, porque ela conta linhas e não Estados. */
              const matriz = await executarSql(
                token,
                `select slug, estado::text as estado from public.posts
                  where slug like ${literal(marca)} order by slug`,
              );
              const estadoDe = new Map(
                (matriz.ok && Array.isArray(matriz.dados) ? matriz.dados : []).map(
                  (l) => [l.slug, l.estado],
                ),
              );
              const ESPERADOS = [
                ["publico", "publicado"],
                ["arquivado", "arquivado"],
                ["agendado-futuro", "agendado"],
                ["rascunho", "rascunho"],
                ["busca-categoria", "publicado"],
                ["busca-titulo", "rascunho"],
                ["busca-autor", "rascunho"],
                ["busca-tag", "rascunho"],
                ["busca-acentuada", "rascunho"],
                ["busca-sem-acento", "rascunho"],
                ["busca-especial", "rascunho"],
              ];
              const divergentes = ESPERADOS.filter(
                ([sufixo, esperado]) => estadoDe.get(slug(sufixo)) !== esperado,
              ).map(([s, e]) => `${s}: ${estadoDe.get(slug(s)) ?? "—"} (esperado ${e})`);
              afirmar(
                "e a matriz de Estados voltou ao que era antes da janela",
                matriz.ok && estadoDe.size > 0 && divergentes.length === 0,
                divergentes.join(" | ") || (matriz.erro ?? ""),
              );
            }
          }

          // A trava que mantém a lista de adiamento honesta: acrescentar uma
          // asserção aqui sem acrescentá-la à lista faz ESTA falhar. Sem ela,
          // a lista envelheceria em silêncio e um 429 voltaria a esconder
          // asserções que ninguém sabe que existem.
          afirmar(
            `o bloco que exige sessão exerceu as ${ASSERCOES_QUE_EXIGEM_SESSAO.length} asserções que promete adiar uma a uma`,
            emitidas - emitidasAntesDoBloco === ASSERCOES_QUE_EXIGEM_SESSAO.length,
            `emitidas: ${emitidas - emitidasAntesDoBloco}, listadas: ${ASSERCOES_QUE_EXIGEM_SESSAO.length} — atualize ASSERCOES_QUE_EXIGEM_SESSAO`,
          );
        }
      } finally {
        // A sessão sai do cliente memoizado e o temporizador de renovação é
        // parado: sem isso o laço de eventos ficaria vivo depois do veredito.
        try {
          await clienteDoPainel.auth.stopAutoRefresh();
        } catch {
          /* o cliente pode nem ter chegado a iniciar a renovação */
        }
        try {
          await clienteDoPainel.auth.signOut({ scope: "local" });
        } catch {
          /* sair sem sessão não é erro que interesse ao veredito */
        }
        if (contaCriada) {
          const remocao = await executarSql(token, sqlDeRemocaoDeConta(emailTemp));
          afirmar("a Conta temporária foi removida", remocao.ok, remocao.erro ?? "");
        }
      }

      /* — Depois de sair, a leitura do Painel volta a ser recusada — */
      {
        const depois = await chamar("listarPostsDoPainel (depois de sair)", () =>
          listarPostsDoPainel(),
        );
        afirmar(
          "encerrada a sessão, a camada do Painel volta a recusar por permissão",
          falhouCom(depois, ERRO_PERMISSAO),
          JSON.stringify(depois).slice(0, 200),
        );
      }
    }
  } finally {
    // `posts_tags` sai por nome, num comando próprio antes dos posts: as
    // tabelas limpas precisam ser exatamente as tabelas semeadas, e não uma
    // lista que confia no cascade sem dizer que confia.
    limpeza = await executarSql(
      token,
      `delete from public.posts_tags pt using public.posts p
         where p.id = pt.post_id and p.slug like ${literal(marca)};
       delete from public.posts where slug like ${literal(marca)};
       delete from public.tags where slug like ${literal(marca)};
       delete from public.categorias where slug like ${literal(marca)};
       delete from public.slugs_antigos where slug like ${literal(marca)};
       delete from auth.users where email = ${literal(emailTemp)};`,
    );
  }

  afirmar("a semeadura foi removida do projeto", Boolean(limpeza?.ok), limpeza?.erro ?? "");

  const listaDeIds =
    idsSemeados.length > 0
      ? `array[${idsSemeados.map((i) => literal(i)).join(",")}]::uuid[]`
      : "array[]::uuid[]";
  const sobrou = await executarSql(
    token,
    `select
       (select count(*)::int from public.posts where slug like ${literal(marca)}) as posts,
       (select count(*)::int from public.categorias where slug like ${literal(marca)}) as categorias,
       (select count(*)::int from public.tags where slug like ${literal(marca)}) as tags,
       (select count(*)::int from public.slugs_antigos where slug like ${literal(marca)}) as antigos,
       (select count(*)::int from public.posts_tags where post_id = any(${listaDeIds})) as associacoes,
       (select count(*)::int from auth.users where email = ${literal(emailTemp)}) as contas`,
  );
  const linha = sobrou.ok && Array.isArray(sobrou.dados) ? sobrou.dados[0] : null;
  const colunas = ["posts", "categorias", "tags", "antigos", "associacoes", "contas"];
  afirmar(
    "nenhum resíduo da prova comportamental ficou no projeto",
    Boolean(linha) && colunas.every((c) => Number(linha[c] ?? -1) === 0),
    linha ? colunas.map((c) => `${c}: ${linha[c]}`).join(" | ") : (sobrou.erro ?? ""),
  );
} else if (!temToken) {
  afirmar(
    "a prova de separação pôde ser exercida",
    false,
    "sem SUPABASE_ACCESS_TOKEN não há como semear a matriz — a asserção falha como ausente, nunca é pulada em silêncio",
  );
}

/* ─── As duas promessas transversais, somadas ────────────────────────────── */

secao("(f) as promessas que valem para TODA função da camada");

afirmar(
  `nenhuma das ${chamadas} chamadas à camada lançou`,
  chamadas > 0 && lancaram.length === 0,
  lancaram.join(" | ") || (chamadas === 0 ? "nenhuma chamada foi feita" : ""),
);
afirmar(
  `as ${chamadas} respostas cumprem o contrato { ok, dados } | { ok, erro }`,
  chamadas > 0 && foraDoContrato.length === 0,
  foraDoContrato.join(" | ") || (chamadas === 0 ? "nenhuma chamada foi feita" : ""),
);

/* ─── (g) A imagem que representa um Post, EXECUTADA (Story 3.3) ─────────── */

secao("(g) a imagem que representa um Post: uma função pura, quatro combinações");

/*
 * ─── POR QUE ISTO É EXECUTADO, E NÃO LIDO ─────────────────────────────────
 *
 * A cadeia "Imagem de Compartilhamento → Imagem de Capa → Imagem Padrão do
 * Site" é uma decisão só, e ela tem DOIS consumidores futuros que precisam
 * concordar: a Prévia do Editor (Story 3.5), que promete ao Autor que o que ele
 * vê é o que o WhatsApp vai mostrar, e a Função de Borda do Épico 4, que emite
 * o metadado no HTML servido. A divergência entre os dois é o defeito que a
 * função existe para impedir — e nenhuma leitura de texto prova concordância.
 *
 * O campo `seo_imagem_url` ainda NÃO tem caminho de escrita (é a Story 3.4).
 * A função responde por ele hoje mesmo assim, e estas asserções o exercitam:
 * é o que permite à 3.4 ligar o campo sem reabrir a regra.
 */
{
  const DOMINIO = "https://chatclean.com.br";
  const PADRAO = `${DOMINIO}${IMAGEM_PADRAO_DO_SITE.caminho}`;
  const CAPA = "https://chatclean.com.br/storage/v1/object/public/imagens-do-blog/capas/abcdefgh12.png";
  const COMPARTILHAMENTO = "https://cdn.exemplo.com/previa-do-post.jpg";

  /* ── AS QUATRO COMBINAÇÕES DA MATRIZ ───────────────────────────────── */

  const semNada = imagemDoPost({ imagem_url: null, seo_imagem_url: null }, { dominio: DOMINIO });
  afirmar(
    "Post sem capa e sem imagem de compartilhamento resolve para a Imagem Padrão do Site",
    semNada.endereco === PADRAO && semNada.origem === "padrao",
    `${semNada.origem}: ${semNada.endereco}`,
  );
  afirmar(
    "e ela vem com as medidas, o tipo e a DESCRIÇÃO — quem declara a etiqueta precisa dos quatro",
    semNada.largura === IMAGEM_PADRAO_DO_SITE.largura &&
      semNada.altura === IMAGEM_PADRAO_DO_SITE.altura &&
      semNada.tipo === IMAGEM_PADRAO_DO_SITE.tipo &&
      semNada.alternativo === IMAGEM_PADRAO_DO_SITE.alternativo,
    `${semNada.largura}x${semNada.altura} ${semNada.tipo} — ${semNada.alternativo}`,
  );

  const soCapa = imagemDoPost({ imagem_url: CAPA, seo_imagem_url: null }, { dominio: DOMINIO });
  afirmar(
    "Post só com capa resolve para a capa",
    soCapa.endereco === CAPA && soCapa.origem === "capa",
    `${soCapa.origem}: ${soCapa.endereco}`,
  );

  const asDuas = imagemDoPost(
    { imagem_url: CAPA, seo_imagem_url: COMPARTILHAMENTO },
    { dominio: DOMINIO },
  );
  afirmar(
    "Post com as duas resolve para a de compartilhamento — o campo específico ganha do herdado",
    asDuas.endereco === COMPARTILHAMENTO && asDuas.origem === "compartilhamento",
    `${asDuas.origem}: ${asDuas.endereco}`,
  );

  const soCompartilhamento = imagemDoPost(
    { imagem_url: null, seo_imagem_url: COMPARTILHAMENTO },
    { dominio: DOMINIO },
  );
  afirmar(
    "Post só com imagem de compartilhamento resolve para ela",
    soCompartilhamento.endereco === COMPARTILHAMENTO &&
      soCompartilhamento.origem === "compartilhamento",
    `${soCompartilhamento.origem}: ${soCompartilhamento.endereco}`,
  );

  /* ── E AS MEDIDAS DE UMA IMAGEM QUE NÃO É NOSSA NÃO SÃO INVENTADAS ─── */
  //
  // O critério pede que os valores declarados sejam "os do arquivo real". De
  // uma capa enviada ou de fora este projeto não conhece medida nenhuma —
  // repetir 1200x630 ali seria escrever um número que o arquivo desmente. O
  // `null` é a instrução de OMITIR a etiqueta, e é a única resposta honesta.
  afirmar(
    "capa e imagem de compartilhamento vêm SEM medidas — declarar 1200x630 para elas seria mentir",
    soCapa.largura === null &&
      soCapa.altura === null &&
      asDuas.largura === null &&
      asDuas.altura === null,
    `${soCapa.largura}x${soCapa.altura} | ${asDuas.largura}x${asDuas.altura}`,
  );
  afirmar(
    "mas o tipo delas é conhecido, porque a extensão o diz",
    soCapa.tipo === "image/png" && asDuas.tipo === "image/jpeg",
    `${soCapa.tipo} | ${asDuas.tipo}`,
  );
  /* E A DESCRIÇÃO DA CAPA VEM DO POST. O banco já obriga capa a ter descrição
     desde a Story 2.1; a prévia herda a mesma, em vez de cada consumidor
     inventar a sua — que é a divergência que a função existe para impedir. */
  {
    const comDescricao = imagemDoPost(
      { imagem_url: CAPA, imagem_alt: "  Painel do ChatClean em uso  " },
      { dominio: DOMINIO },
    );
    const semDescricao = imagemDoPost({ imagem_url: CAPA }, { dominio: DOMINIO });
    afirmar(
      "a descrição da capa vem do Post, aparada — e é `null` quando o Post não tem, nunca a do ativo do site",
      comDescricao.alternativo === "Painel do ChatClean em uso" &&
        semDescricao.alternativo === null,
      `${JSON.stringify(comDescricao.alternativo)} | ${JSON.stringify(semDescricao.alternativo)}`,
    );
  }

  /* ── O QUE O VOCABULÁRIO RECUSA CAI PARA O ELO SEGUINTE ─────────────── */
  //
  // A varredura roda sobre os DOIS campos. Rodá-la só sobre `imagem_url`
  // deixava o elo de precedência MAIS ALTA sem prova — e é justamente ele que a
  // Story 3.4 vai abrir para digitação livre: remover a conferência de
  // permissão só do primeiro elo deixaria tudo verde.
  const RECUSADOS = Object.freeze([
    ["relativo", "/imagens/capa.png"],
    ["conteúdo de arquivo", "data:image/png;base64,iVBORw0KGgo="],
    ["blob", "blob:https://chatclean.com.br/9f2c"],
    ["javascript", "javascript:alert(1)"],
    ["http de host que não é local", "http://exemplo.com/capa.png"],
    ["com credencial embutida", "https://um:dois@exemplo.com/capa.png"],
    ["com espaço", "https://exemplo.com/capa 1.png"],
  ]);
  for (const campo of ["imagem_url", "seo_imagem_url"]) {
    const passaram = RECUSADOS.filter(([, endereco]) => {
      const r = imagemDoPost({ [campo]: endereco }, { dominio: DOMINIO });
      return r.endereco !== PADRAO || r.origem !== "padrao";
    }).map(([nome]) => nome);
    afirmar(
      `\`${campo}\`: os ${RECUSADOS.length} endereços que o vocabulário recusa caem para o padrão — nenhum vira prévia quebrada`,
      passaram.length === 0 && RECUSADOS.length >= 7,
      passaram.join(", "),
    );
  }
  /* E O MESMO JULGAMENTO, NÃO UM SEGUNDO. Uma cópia da regra de endereço
     divergiria na primeira mudança — a asserção prende as duas pontas. */
  const divergem = RECUSADOS.filter(([, endereco]) => enderecoDeImagemPermitido(endereco)).map(
    ([nome]) => nome,
  );
  afirmar(
    "e é o MESMO `enderecoDeImagemPermitido` que os recusa — não há segunda opinião sobre endereço bom",
    divergem.length === 0,
    divergem.join(", "),
  );

  /* ── E O QUE FOI RECUSADO SAI NOMEADO ───────────────────────────────── */
  //
  // Sem isto, a Prévia da Story 3.5 mostraria a imagem padrão e o Autor não
  // teria como saber por que o endereço que ele digitou sumiu. `origem` sozinha
  // não responde: ela diz o que ENTROU, não o que foi barrado nem por quê.
  {
    const semMotivo = RECUSADOS.filter(([, endereco]) => {
      const r = imagemDoPost({ seo_imagem_url: endereco }, { dominio: DOMINIO });
      return (
        r.recusadas.length !== 1 ||
        r.recusadas[0].campo !== "seo_imagem_url" ||
        r.recusadas[0].origem !== "compartilhamento" ||
        typeof r.recusadas[0].motivo !== "string" ||
        r.recusadas[0].motivo.trim() === ""
      );
    }).map(([nome]) => nome);
    afirmar(
      `os ${RECUSADOS.length} endereços recusados saem NOMEADOS em \`recusadas\`, com campo, origem e motivo`,
      semMotivo.length === 0,
      semMotivo.join(", "),
    );
    /* E O MOTIVO É O DA CAUSA CERTA — a mesma frase que o formulário mostraria,
       vinda de `problemaNoEnderecoDaImagem`. Um motivo genérico mandaria o
       Autor consertar a coisa errada. */
    const daCredencial = imagemDoPost(
      { seo_imagem_url: "https://um:dois@exemplo.com/capa.png" },
      { dominio: DOMINIO },
    );
    const doEsquema = imagemDoPost(
      { seo_imagem_url: "data:image/png;base64,iVBORw0KGgo=" },
      { dominio: DOMINIO },
    );
    afirmar(
      "e o motivo é o da CAUSA — a mesma frase que o formulário mostra, e não uma recusa genérica",
      /* Com `?.`: uma sabotagem que esvazie `recusadas` tem de virar FALHA
         relatada, e não uma exceção que derruba a ferramenta antes das seções
         seguintes. Medido — foi o que aconteceu na primeira sabotagem. */
      daCredencial.recusadas[0]?.motivo ===
        problemaNoEnderecoDaImagem("https://um:dois@exemplo.com/capa.png") &&
        doEsquema.recusadas[0]?.motivo ===
          problemaNoEnderecoDaImagem("data:image/png;base64,iVBORw0KGgo=") &&
        daCredencial.recusadas[0]?.motivo !== doEsquema.recusadas[0]?.motivo,
      `${daCredencial.recusadas[0]?.motivo} | ${doEsquema.recusadas[0]?.motivo}`,
    );
    afirmar(
      "e um Post cujos dois elos servem não tem recusa nenhuma a relatar",
      asDuas.recusadas.length === 0 && semNada.recusadas.length === 0,
      `${asDuas.recusadas.length} | ${semNada.recusadas.length}`,
    );
  }

  /* ── VETOR NÃO SERVE DE PRÉVIA, NEM VINDO DO POST ───────────────────── */
  //
  // É o defeito exato que esta story conserta, e ele voltaria pela porta do
  // Post se a regra valesse só para o `index.html`.
  {
    const comVetor = imagemDoPost(
      { imagem_url: "https://chatclean.com.br/chatclean.svg" },
      { dominio: DOMINIO },
    );
    const comVetorNoSeo = imagemDoPost(
      { seo_imagem_url: "https://cdn.exemplo.com/marca.svg", imagem_url: CAPA },
      { dominio: DOMINIO },
    );
    afirmar(
      "capa que aponta para vetor cai para o padrão — WhatsApp e Meta não renderizam SVG em prévia",
      comVetor.endereco === PADRAO && comVetor.origem === "padrao",
      `${comVetor.origem}: ${comVetor.endereco}`,
    );
    afirmar(
      "e vetor no campo de compartilhamento cai para o ELO SEGUINTE, que é a capa — não direto para o padrão",
      comVetorNoSeo.endereco === CAPA && comVetorNoSeo.origem === "capa",
      `${comVetorNoSeo.origem}: ${comVetorNoSeo.endereco}`,
    );
    /* O julgamento de espécie, nos dois sentidos. A consulta e a âncora saem
       antes da extensão: sem isso `foto.png?v=2` seria "espécie desconhecida"
       e uma capa legítima cairia para o padrão. */
    const ESPERADO_DE_TIPO = Object.freeze([
      ["https://x.com/a.svg", null],
      ["https://x.com/a.ico", null],
      ["https://x.com/a.gif", null],
      ["https://x.com/imagem?id=7", null],
      ["https://x.com/pasta.png/imagem", null],
      ["https://x.com/a.PNG", "image/png"],
      ["https://x.com/a.jpg", "image/jpeg"],
      ["https://x.com/a.jpeg?v=2", "image/jpeg"],
    ]);
    const erraram = ESPERADO_DE_TIPO.filter(
      ([endereco, esperado]) => tipoDaImagem(endereco) !== esperado,
    ).map(([endereco, esperado]) => `${endereco} → ${tipoDaImagem(endereco)} (esperado ${esperado})`);
    afirmar(
      `o julgamento de espécie é LISTA DE PERMISSÃO, conferido nos ${ESPERADO_DE_TIPO.length} casos: vetor, ícone, GIF e endereço sem extensão são desconhecidos`,
      erraram.length === 0 && ESPERADO_DE_TIPO.length >= 8,
      erraram.join(" | "),
    );
  }

  /* ── E O WEBP FICA DE FORA DA PRÉVIA, DE PROPÓSITO ──────────────────── */
  //
  // Ele ESTÁ no vocabulário da capa — o bucket o aceita, e a Story 3.1 o
  // decidiu. A prévia é outra pergunta: o suporte a WebP nos geradores de
  // prévia de link é irregular, e uma imagem que existe e não aparece é a MESMA
  // classe de defeito que esta story conserta. A subtração está declarada em
  // `ESPECIES_FORA_DA_PREVIA`, com o motivo escrito — sem ela, "o WebP sumiu" e
  // "ninguém lembrou do WebP" seriam indistinguíveis.
  {
    const comWebp = imagemDoPost(
      { imagem_url: "https://cdn.exemplo.com/capa.webp" },
      { dominio: DOMINIO },
    );
    afirmar(
      "capa em WebP — aceita pelo bucket — cai para o padrão na prévia, e a subtração está DECLARADA com motivo",
      comWebp.origem === "padrao" &&
        tipoDaImagem("https://x.com/a.webp") === null &&
        ESPECIES_FORA_DA_PREVIA.some(
          (e) => e.tipo === "image/webp" && typeof e.motivo === "string" && e.motivo.length > 40,
        ),
      `${comWebp.origem} | webp → ${tipoDaImagem("https://x.com/a.webp")}`,
    );
    afirmar(
      "e o vocabulário da prévia é DERIVADO do da capa menos a subtração — não uma segunda lista",
      TIPOS_NA_PREVIA.every((t) => TIPOS_DE_IMAGEM.includes(t)) &&
        TIPOS_DE_IMAGEM.filter((t) => !TIPOS_NA_PREVIA.includes(t)).join() ===
          ESPECIES_FORA_DA_PREVIA.map((e) => e.tipo).join(),
      `capa: ${TIPOS_DE_IMAGEM.join(", ")} | prévia: ${TIPOS_NA_PREVIA.join(", ")}`,
    );
    afirmar(
      "e o alias `jpeg` deriva do tipo de `jpg`, sem ser escrito de novo",
      TIPO_POR_EXTENSAO.jpeg === TIPO_POR_EXTENSAO.jpg && TIPO_POR_EXTENSAO.jpg === "image/jpeg",
      `${TIPO_POR_EXTENSAO.jpeg} | ${TIPO_POR_EXTENSAO.jpg}`,
    );
  }

  /* ── IMAGEM QUE O RASTREADOR NÃO ALCANÇA TAMBÉM NÃO SERVE ───────────── */
  //
  // Uma capa em `http://localhost:5173` é endereço que o vocabulário aceita — o
  // stack local do Supabase responde ali, e a Story 3.1 abriu isso de propósito.
  // Mas num site servido por https ela vira um `og:image` que nenhum rastreador
  // de fora busca: a prévia vazia de novo, com uma terceira causa. Em
  // desenvolvimento, com o site também local, os dois lados são locais e a
  // conferência não se aplica — senão a Prévia mentiria justamente na máquina
  // de quem desenvolve.
  {
    const emProducao = imagemDoPost(
      { imagem_url: "http://localhost:5173/capa.png" },
      { dominio: DOMINIO },
    );
    const emDesenvolvimento = imagemDoPost(
      { imagem_url: "http://localhost:5173/capa.png" },
      { dominio: "http://localhost:5173" },
    );
    afirmar(
      "capa local num site https cai para o padrão, com o motivo nomeado — o rastreador não a buscaria",
      emProducao.origem === "padrao" &&
        emProducao.recusadas[0]?.motivo === RECUSA_DE_ENDERECO_INALCANCAVEL,
      `${emProducao.origem}: ${emProducao.recusadas[0]?.motivo}`,
    );
    afirmar(
      "e num site LOCAL a mesma capa vale — senão a Prévia mentiria na máquina de quem desenvolve",
      emDesenvolvimento.origem === "capa" &&
        emDesenvolvimento.endereco === "http://localhost:5173/capa.png",
      `${emDesenvolvimento.origem}: ${emDesenvolvimento.endereco}`,
    );
  }

  /* ── TODO ENDEREÇO RESOLVIDO É ABSOLUTO ─────────────────────────────── */
  //
  // Rastreador não resolve caminho relativo: um `og:image` relativo é uma
  // prévia sem imagem com aparência de prévia com imagem.
  {
    const casos = [
      imagemDoPost(null, { dominio: DOMINIO }),
      imagemDoPost({}, { dominio: DOMINIO }),
      semNada,
      soCapa,
      asDuas,
    ];
    const relativos = casos.filter((r) => !/^https?:\/\//i.test(r.endereco));
    afirmar(
      `os ${casos.length} endereços resolvidos são absolutos, e Post nulo ou vazio não lança`,
      relativos.length === 0 && casos.every((r) => ORIGENS_DA_IMAGEM.includes(r.origem)),
      relativos.map((r) => r.endereco).join(" | "),
    );
  }

  /* ── O DOMÍNIO CANÔNICO É PARÂMETRO, E A AUSÊNCIA DELE É DEFEITO NOMEADO ── */
  //
  // Fixar o domínio no código faria a Prévia mentir em todo ambiente que não
  // fosse produção — o único momento em que alguém a olha é ANTES de publicar.
  // E devolver algo sem domínio produziria endereço relativo, que é o retângulo
  // cinza de volta com outra causa: julgar só "lançou" não bastaria, porque
  // qualquer defeito lança. O que se cobra é a frase.
  {
    const SEM_DOMINIO = [
      null,
      undefined,
      {},
      { dominio: "" },
      { dominio: "  " },
      { dominio: "chatclean.com.br" },
      { dominio: "/" },
      /* Domínio com caminho, consulta ou âncora: os três produziriam
         `https://site.com/blog?x=1/imagem-padrao-do-site.png`, que é endereço
         malformado com cara de endereço bom. */
      { dominio: "https://chatclean.com.br/blog" },
      { dominio: "https://chatclean.com.br/?utm=1" },
      { dominio: "https://chatclean.com.br/#topo" },
    ];
    const naoLancaram = [];
    const frasesErradas = [];
    for (const opcoes of SEM_DOMINIO) {
      try {
        imagemDoPost({}, opcoes);
        naoLancaram.push(JSON.stringify(opcoes ?? null));
      } catch (erro) {
        if (erro.message !== DEFEITO_DE_DOMINIO_AUSENTE) {
          frasesErradas.push(`${JSON.stringify(opcoes ?? null)} → ${erro.message}`);
        }
      }
    }
    afirmar(
      `os ${SEM_DOMINIO.length} jeitos de chamar sem Domínio Canônico utilizável falham alto, com o defeito NOMEADO`,
      naoLancaram.length === 0 && frasesErradas.length === 0,
      [...naoLancaram.map((c) => `não lançou: ${c}`), ...frasesErradas].join(" | "),
    );
    afirmar(
      "e com domínio válido o endereço dos dois ativos se monta sem barra dobrada",
      enderecoDaImagemPadrao("https://chatclean.com.br/") === PADRAO &&
        enderecoDaImagemPadrao("http://localhost:5173") ===
          `http://localhost:5173${IMAGEM_PADRAO_DO_SITE.caminho}` &&
        enderecoDoLogotipo(DOMINIO) === `${DOMINIO}${LOGOTIPO_DA_MARCA.caminho}`,
      `${enderecoDaImagemPadrao("https://chatclean.com.br/")} | ${enderecoDoLogotipo(DOMINIO)}`,
    );
  }

  /* ── E A CADEIA NÃO PODE PERDER UM ELO SEM NADA ACUSAR ──────────────── */
  //
  // Sem esta asserção, apagar a linha do `seo_imagem_url` deixaria a Story 3.4
  // sem onde ligar o campo, e as combinações acima continuariam passando se
  // alguém trocasse a ordem por engano em outro ponto. O que se cobra é o
  // vocabulário fechado das três origens, e que cada uma seja alcançável.
  {
    const alcancadas = new Set([
      imagemDoPost({ seo_imagem_url: COMPARTILHAMENTO }, { dominio: DOMINIO }).origem,
      imagemDoPost({ imagem_url: CAPA }, { dominio: DOMINIO }).origem,
      imagemDoPost({}, { dominio: DOMINIO }).origem,
    ]);
    afirmar(
      "as três origens do vocabulário são alcançáveis, e nenhuma outra aparece",
      alcancadas.size === ORIGENS_DA_IMAGEM.length &&
        ORIGENS_DA_IMAGEM.every((o) => alcancadas.has(o)),
      `${[...alcancadas].join(", ")} vs ${ORIGENS_DA_IMAGEM.join(", ")}`,
    );
  }
}

/* ─── (h) A herança dos TRÊS campos, EXECUTADA (Story 3.4) ───────────────── */

secao("(h) a herança de título, descrição e imagem: uma função, uma chamada");

/*
 * ─── POR QUE ISTO É EXECUTADO, E NÃO LIDO ─────────────────────────────────
 *
 * "Vazio herda" é a promessa central da story, e ela só é verdade se alguém a
 * calcular. A Story 3.3 provou a cadeia da IMAGEM; esta prova as três, e prova
 * que elas saem de UMA chamada — porque o dia em que houver duas funções, a
 * Prévia da Story 3.5 e o emissor do Épico 4 vão chamar cada uma a sua.
 *
 * Toda asserção daqui compara o VALOR capturado, e não uma contagem: uma
 * contagem de campos preenchidos não reage a um campo herdando da fonte errada,
 * que é o defeito realista — trocar `resumo` por `titulo` numa linha da cadeia.
 */
{
  const DOMINIO = "https://chatclean.com.br";
  const PADRAO = `${DOMINIO}${IMAGEM_PADRAO_DO_SITE.caminho}`;
  const CAPA =
    "https://chatclean.com.br/storage/v1/object/public/imagens-do-blog/capas/abcdefgh12.png";
  const COMPARTILHAMENTO = "https://cdn.exemplo.com/previa-do-post.jpg";

  /** Um Post completo do lado do conteúdo, e vazio do lado do SEO. */
  const POST = Object.freeze({
    titulo: "Como limpar a base de contatos",
    resumo: "Um roteiro de quatro passos para tirar o número morto da sua lista.",
    imagem_url: CAPA,
    imagem_alt: "Tela do ChatClean com a lista de contatos",
    seo_titulo: null,
    seo_descricao: null,
    seo_imagem_url: null,
  });

  /* ── OS TRÊS VAZIOS: O CONJUNTO FICA COMPLETO ──────────────────────── */
  {
    const m = metadadosDoPost(POST, { dominio: DOMINIO });
    afirmar(
      "com os três campos de SEO vazios, o título herda o TÍTULO DO POST — e o valor é ele, não uma contagem",
      m.titulo.valor === POST.titulo && m.titulo.origem === "titulo" && m.titulo.herdado === true,
      `${m.titulo.origem}: ${JSON.stringify(m.titulo.valor)}`,
    );
    afirmar(
      "a descrição herda o RESUMO — e não o título, que é a troca de fonte que uma contagem não pegaria",
      m.descricao.valor === POST.resumo &&
        m.descricao.valor !== POST.titulo &&
        m.descricao.origem === "resumo" &&
        m.descricao.herdado === true,
      `${m.descricao.origem}: ${JSON.stringify(m.descricao.valor)}`,
    );
    afirmar(
      "a imagem herda a CAPA, e o conjunto fica COMPLETO: nenhum dos três é nulo, e nada foi recusado",
      m.imagem.endereco === CAPA &&
        m.imagem.origem === "capa" &&
        m.imagem.herdado === true &&
        m.titulo.valor !== null &&
        m.descricao.valor !== null &&
        m.recusadas.length === 0,
      `${m.imagem.origem}: ${m.imagem.endereco} | recusadas: ${m.recusadas.length}`,
    );
    afirmar(
      "e o resultado é CONGELADO nas quatro partes — quem consome não altera a decisão de quem vem depois",
      Object.isFrozen(m) &&
        Object.isFrozen(m.titulo) &&
        Object.isFrozen(m.descricao) &&
        Object.isFrozen(m.imagem) &&
        Object.isFrozen(m.recusadas),
      `${Object.isFrozen(m)} ${Object.isFrozen(m.titulo)} ${Object.isFrozen(m.descricao)} ${Object.isFrozen(m.imagem)}`,
    );
  }

  /* ── CADA UM PREENCHIDO SOZINHO: O PRÓPRIO GANHA, OS OUTROS HERDAM ── */
  {
    const soTitulo = metadadosDoPost(
      { ...POST, seo_titulo: "Base de contatos limpa em 4 passos" },
      { dominio: DOMINIO },
    );
    afirmar(
      "só o Título SEO preenchido: ele é o PRÓPRIO, e a descrição e a imagem continuam herdando",
      soTitulo.titulo.valor === "Base de contatos limpa em 4 passos" &&
        soTitulo.titulo.origem === "compartilhamento" &&
        soTitulo.titulo.herdado === false &&
        soTitulo.descricao.valor === POST.resumo &&
        soTitulo.imagem.endereco === CAPA,
      `${soTitulo.titulo.origem} | ${soTitulo.descricao.origem} | ${soTitulo.imagem.origem}`,
    );

    const soDescricao = metadadosDoPost(
      { ...POST, seo_descricao: "Quatro passos, do diagnóstico ao arquivamento." },
      { dominio: DOMINIO },
    );
    afirmar(
      "só a Meta Descrição preenchida: ela é a PRÓPRIA, e o título e a imagem continuam herdando",
      soDescricao.descricao.valor === "Quatro passos, do diagnóstico ao arquivamento." &&
        soDescricao.descricao.origem === "compartilhamento" &&
        soDescricao.titulo.valor === POST.titulo &&
        soDescricao.imagem.endereco === CAPA,
      `${soDescricao.titulo.origem} | ${soDescricao.descricao.origem} | ${soDescricao.imagem.origem}`,
    );

    const soImagem = metadadosDoPost(
      { ...POST, seo_imagem_url: COMPARTILHAMENTO },
      { dominio: DOMINIO },
    );
    afirmar(
      "só a Imagem de Compartilhamento preenchida: ela VENCE a capa, e os dois textos continuam herdando",
      soImagem.imagem.endereco === COMPARTILHAMENTO &&
        soImagem.imagem.origem === "compartilhamento" &&
        soImagem.imagem.herdado === false &&
        soImagem.titulo.valor === POST.titulo &&
        soImagem.descricao.valor === POST.resumo,
      `${soImagem.imagem.origem}: ${soImagem.imagem.endereco}`,
    );
  }

  /* ── SÓ ESPAÇOS É VAZIO, E VAZIO HERDA ─────────────────────────────── */
  //
  // O caso é da matriz, e não é acadêmico: um campo com espaços gravado na
  // coluna produziria um `og:title` EM BRANCO — pior que o herdado, porque
  // nada acusaria. A asserção compara o valor herdado, e não "é diferente de
  // vazio": um título que caísse para a string vazia passaria por um teste de
  // desigualdade contra o valor próprio.
  {
    const ESPACOS = ["   ", "\t", "\n  \n", "   "];
    const erraram = ESPACOS.filter((branco) => {
      const m = metadadosDoPost(
        { ...POST, seo_titulo: branco, seo_descricao: branco, seo_imagem_url: branco },
        { dominio: DOMINIO },
      );
      return (
        m.titulo.valor !== POST.titulo ||
        m.titulo.origem !== "titulo" ||
        m.descricao.valor !== POST.resumo ||
        m.imagem.endereco !== CAPA ||
        m.recusadas.length !== 0
      );
    });
    afirmar(
      `os ${ESPACOS.length} campos com só espaço em branco são tratados como VAZIOS e herdam — sem virar recusa`,
      erraram.length === 0,
      erraram.map((e) => JSON.stringify(e)).join(", "),
    );
  }

  /* ── RESUMO AUSENTE: A DESCRIÇÃO FICA AUSENTE, NÃO VAZIA ───────────── */
  //
  // "Sem inventar texto" é o critério. `null` é a instrução de OMITIR a
  // etiqueta; `""` seria uma etiqueta declarada e em branco, que é o mesmo
  // defeito do `og:image` que existe e não aparece.
  {
    const semResumo = metadadosDoPost(
      { titulo: POST.titulo, resumo: "   ", seo_descricao: "  " },
      { dominio: DOMINIO },
    );
    afirmar(
      "Post sem Resumo e sem Meta Descrição: a descrição fica AUSENTE (`null`), e nunca uma string vazia",
      semResumo.descricao.valor === null &&
        semResumo.descricao.origem === null &&
        semResumo.descricao.herdado === true,
      `${JSON.stringify(semResumo.descricao)}`,
    );
    afirmar(
      "e um Post sem título nenhum também: o título fica ausente, e a imagem cai para o padrão do site",
      metadadosDoPost({}, { dominio: DOMINIO }).titulo.valor === null &&
        metadadosDoPost({}, { dominio: DOMINIO }).titulo.origem === null &&
        metadadosDoPost({}, { dominio: DOMINIO }).imagem.endereco === PADRAO,
      JSON.stringify(metadadosDoPost({}, { dominio: DOMINIO }).titulo),
    );
  }

  /* ── O TETO DE HIGIENE RECUSA, E A RECUSA CAI PARA O ELO SEGUINTE ─── */
  //
  // A mesma forma da imagem: `{ campo, origem, motivo }`. Sem isso, um texto
  // recusado sumiria e o Autor veria o título do Post no lugar do que escreveu,
  // sem nada dizendo por quê.
  for (const campo of ["seo_titulo", "seo_descricao"]) {
    const teto = TETO_DE_HIGIENE_DE_SEO[campo];
    const longo = "a".repeat(teto + 1);
    const m = metadadosDoPost({ ...POST, [campo]: longo }, { dominio: DOMINIO });
    const parte = campo === "seo_titulo" ? m.titulo : m.descricao;
    const herdadoEsperado = campo === "seo_titulo" ? POST.titulo : POST.resumo;
    afirmar(
      `\`${campo}\` acima do teto de higiene (${teto}) é RECUSADO e cai para o elo herdado — com campo, origem e motivo`,
      parte.valor === herdadoEsperado &&
        parte.herdado === true &&
        m.recusadas.length === 1 &&
        m.recusadas[0].campo === campo &&
        m.recusadas[0].origem === "compartilhamento" &&
        m.recusadas[0].motivo === problemaNoTextoDeSeo(campo, longo) &&
        m.recusadas[0].motivo.includes(String(teto)),
      `${JSON.stringify(m.recusadas)} | valor: ${JSON.stringify(parte.valor)}`,
    );
    /* E NO TETO EXATO ELE PASSA. Sem este caso, uma comparação trocada por
       `>=` recusaria o texto de tamanho exato e as duas asserções acima
       continuariam verdes — a recusa apareceria como "não consigo salvar" num
       texto que o próprio limite declara aceitável. */
    const noLimite = "a".repeat(teto);
    const exato = metadadosDoPost({ ...POST, [campo]: noLimite }, { dominio: DOMINIO });
    const parteExata = campo === "seo_titulo" ? exato.titulo : exato.descricao;
    afirmar(
      `e no teto exato (${teto}) ele PASSA — a fronteira é inclusiva, dos dois lados da mesma regra`,
      parteExata.valor === noLimite &&
        parteExata.origem === "compartilhamento" &&
        exato.recusadas.length === 0 &&
        problemaNoTextoDeSeo(campo, noLimite) === null,
      `${parteExata.origem} | recusadas: ${exato.recusadas.length}`,
    );
  }

  /* ── OS DOIS NÚMEROS, E A DISTÂNCIA ENTRE ELES ─────────────────────── */
  //
  // O comprimento USUAL sinaliza e NÃO recusa. Se ele encostasse no teto de
  // higiene, o teto passaria a disciplinar o Autor — que é exatamente o que o
  // critério proíbe. A asserção mede a distância em vez de a supor, e exercita
  // o texto que fica ENTRE os dois números: ele tem de ser aceito.
  {
    const encostados = Object.keys(COMPRIMENTO_USUAL_DE_SEO).filter(
      (campo) =>
        TETO_DE_HIGIENE_DE_SEO[campo] <
        COMPRIMENTO_USUAL_DE_SEO[campo] * DISTANCIA_MINIMA_ENTRE_OS_DOIS,
    );
    afirmar(
      `os dois números de cada campo são declarados e ficam a pelo menos ${DISTANCIA_MINIMA_ENTRE_OS_DOIS}x de distância`,
      encostados.length === 0 &&
        Object.keys(COMPRIMENTO_USUAL_DE_SEO).length === 2 &&
        COMPRIMENTO_USUAL_DE_SEO.seo_titulo === 60 &&
        COMPRIMENTO_USUAL_DE_SEO.seo_descricao === 155,
      `usual: ${JSON.stringify(COMPRIMENTO_USUAL_DE_SEO)} | teto: ${JSON.stringify(TETO_DE_HIGIENE_DE_SEO)}`,
    );

    const bloquearam = [];
    for (const campo of Object.keys(COMPRIMENTO_USUAL_DE_SEO)) {
      const usual = COMPRIMENTO_USUAL_DE_SEO[campo];
      const teto = TETO_DE_HIGIENE_DE_SEO[campo];
      /* Três pontos ENTRE os dois números, incluindo o primeiro caractere
         acima do usual: é ali que um teto disfarçado de conselho apareceria. */
      for (const tamanho of [usual + 1, Math.round((usual + teto) / 2), teto]) {
        const texto = "a".repeat(tamanho);
        if (problemaNoTextoDeSeo(campo, texto) !== null) {
          bloquearam.push(`${campo} com ${tamanho}`);
          continue;
        }
        const m = metadadosDoPost({ ...POST, [campo]: texto }, { dominio: DOMINIO });
        const parte = campo === "seo_titulo" ? m.titulo : m.descricao;
        if (parte.valor !== texto || m.recusadas.length !== 0) {
          bloquearam.push(`${campo} com ${tamanho} não virou o valor próprio`);
        }
      }
    }
    afirmar(
      "passar do comprimento usual NÃO recusa e NÃO trunca: o texto entre os dois números atravessa inteiro",
      bloquearam.length === 0,
      bloquearam.join(" | "),
    );
  }

  /* ── O VOCABULÁRIO DAS ORIGENS É FECHADO, E TODO ELO É ALCANÇÁVEL ─── */
  //
  // Sem isto, apagar a linha do elo herdado de um dos textos deixaria as
  // asserções de "campo próprio" verdes: elas nunca chegam ao segundo elo.
  {
    const doTitulo = new Set([
      metadadosDoPost({ ...POST, seo_titulo: "Próprio" }, { dominio: DOMINIO }).titulo.origem,
      metadadosDoPost(POST, { dominio: DOMINIO }).titulo.origem,
    ]);
    const daDescricao = new Set([
      metadadosDoPost({ ...POST, seo_descricao: "Própria" }, { dominio: DOMINIO }).descricao
        .origem,
      metadadosDoPost(POST, { dominio: DOMINIO }).descricao.origem,
    ]);
    afirmar(
      "as duas origens de cada texto são alcançáveis, e nenhuma outra aparece",
      ORIGENS_DO_TITULO.every((o) => doTitulo.has(o)) &&
        doTitulo.size === ORIGENS_DO_TITULO.length &&
        ORIGENS_DA_DESCRICAO.every((o) => daDescricao.has(o)) &&
        daDescricao.size === ORIGENS_DA_DESCRICAO.length,
      `título: ${[...doTitulo].join(", ")} | descrição: ${[...daDescricao].join(", ")}`,
    );
    afirmar(
      "e os três campos de SEO estão declarados num lugar só, com rótulo em palavras de gente",
      CAMPOS_DE_SEO.length === 3 &&
        CAMPOS_DE_SEO.join(",") === "seo_titulo,seo_descricao,seo_imagem_url" &&
        CAMPOS_DE_SEO.every(
          (campo) => typeof ROTULOS_DE_SEO[campo] === "string" && ROTULOS_DE_SEO[campo] !== "",
        ),
      `${CAMPOS_DE_SEO.join(", ")} → ${CAMPOS_DE_SEO.map((c) => ROTULOS_DE_SEO[c]).join(", ")}`,
    );
  }

  /* ── UMA FUNÇÃO SÓ: NÃO HÁ SEGUNDA PORTA PARA A MESMA CADEIA ──────── */
  //
  // O módulo exportava `imagemDoPost` até a Story 3.3. Se ele voltasse a
  // exportar uma segunda entrada para a cadeia, um consumidor chamaria a
  // parcial e outro a inteira — e as duas divergiriam no primeiro campo novo.
  {
    const exportados = Object.keys(moduloDeCompartilhamento);
    const segundasPortas = exportados.filter(
      (nome) => /^(imagemDoPost|tituloDoPost|descricaoDoPost|seoDoPost)$/.test(nome),
    );
  /* ── O ATALHO DESTA FERRAMENTA É FIEL AO ORIGINAL ────────────────────────
     `imagemDoPost` é uma conveniência montada no topo deste arquivo para as
     asserções da Story 3.3 continuarem lendo a imagem sozinha. Se ele derivar
     do original — uma chave a menos, um valor recalculado —, todas elas passam
     a medir uma coisa que o domínio não entrega. */
  {
    const post = {
      titulo: "O título",
      resumo: "O resumo",
      imagem_url: CAPA,
      imagem_alt: "A capa",
    };
    const original = metadadosDoPost(post, { dominio: DOMINIO }).imagem;
    const atalho = imagemDoPost(post, { dominio: DOMINIO });
    const divergentes = Object.keys(original).filter(
      (chave) => atalho[chave] !== original[chave],
    );
    afirmar(
      "o atalho desta ferramenta traz TODAS as chaves da imagem com o MESMO valor, e é congelado como o original",
      divergentes.length === 0 &&
        Object.keys(original).every((chave) => Object.hasOwn(atalho, chave)) &&
        Object.isFrozen(atalho) &&
        Array.isArray(atalho.recusadas),
      `divergentes: ${divergentes.join(", ") || "nenhuma"} | congelado: ${Object.isFrozen(atalho)}`,
    );
  }

  /* ── A ETIQUETA É DE UMA LINHA SÓ (Story 3.4) ────────────────────────────
     `seo_titulo` é digitado num `<textarea>`, que aceita Enter, e nada tirava
     quebra de linha nem caractere de controle: o valor atravessava tela, porta
     e restrição e virava um `<title>` partido ao meio. A matriz cobria "só
     espaços"; espaço em branco INTERNO não estava em lugar nenhum.

     A normalização mora no domínio, e não na gravação: a coluna guarda o que a
     pessoa escreveu — este projeto não corta texto do Autor —, e o que muda é o
     valor EMITIDO. É por isso que a tela mostra exatamente a etiqueta que o
     rastreador vai receber. */
  {
    /* Os três espaços em branco, por CÓDIGO DE CARACTERE. Digitá-los dentro
       de um literal deste arquivo os tornaria invisíveis para quem revisa — e
       um `\r` perdido numa asserção é exatamente o tipo de coisa que ninguém
       enxerga em revisão. */
    const NOVA_LINHA = String.fromCharCode(10);
    const TABULACAO = String.fromCharCode(9);
    const RETORNO = String.fromCharCode(13);
    const comQuebra = metadadosDoPost(
      {
        titulo: "T",
        resumo: "R",
        /* Montado por código de caractere, e não digitado: uma quebra de linha
           literal dentro do arquivo de verificação seria invisível na revisão. */
        seo_titulo: ["Um título", NOVA_LINHA, "com quebra", TABULACAO, "e", RETORNO, "controle no meio"].join(""),
        seo_descricao: "Uma descrição\n\ncom parágrafo",
      },
      { dominio: DOMINIO },
    );
    afirmar(
      "quebra de linha, tabulação e caractere de controle saem do TÍTULO emitido — e o texto continua inteiro",
      comQuebra.titulo.valor === "Um título com quebra e controle no meio" &&
        !/[\n\r\t]/.test(comQuebra.titulo.valor),
      JSON.stringify(comQuebra.titulo.valor),
    );
    afirmar(
      "e da DESCRIÇÃO também — uma etiqueta de metadado não tem parágrafo",
      comQuebra.descricao.valor === "Uma descrição com parágrafo",
      JSON.stringify(comQuebra.descricao.valor),
    );

    /* E NADA DE CONTEÚDO SE PERDE: a normalização não é truncagem. */
    const preservado = "Título com acento, çedilha, emoji 😀 e “aspas”";
    const intacto = metadadosDoPost(
      { titulo: "T", seo_titulo: preservado },
      { dominio: DOMINIO },
    );
    afirmar(
      "e nenhum caractere de conteúdo se perde — acento, cedilha, emoji e aspas atravessam intactos",
      intacto.titulo.valor === preservado,
      JSON.stringify(intacto.titulo.valor),
    );

    /* O ELO HERDADO passa pela MESMA normalização: um Título de Post com
       quebra de linha herdado sem tratamento produziria o mesmo `<title>`
       partido por outro caminho. */
    const herdadoComQuebra = metadadosDoPost(
      { titulo: "Título do\nPost", resumo: "Resumo\tdo Post" },
      { dominio: DOMINIO },
    );
    afirmar(
      "e o elo HERDADO passa pela mesma normalização — o defeito não pode voltar pelo outro caminho",
      herdadoComQuebra.titulo.valor === "Título do Post" &&
        herdadoComQuebra.descricao.valor === "Resumo do Post",
      `${JSON.stringify(herdadoComQuebra.titulo.valor)} | ${JSON.stringify(herdadoComQuebra.descricao.valor)}`,
    );

    /* E UM CAMPO QUE SÓ TEM CONTROLE E QUEBRA é vazio, e HERDA — como "só
       espaços", que a matriz já cobria. */
    const soControle = metadadosDoPost(
      { titulo: "Título do Post", seo_titulo: `${NOVA_LINHA}${TABULACAO}${RETORNO}  ` },
      { dominio: DOMINIO },
    );
    afirmar(
      "campo com só quebra, tabulação e controle é VAZIO e herda — como já valia para o espaço",
      soControle.titulo.valor === "Título do Post" &&
        soControle.titulo.origem === ORIGENS_DO_TITULO[1],
      JSON.stringify({ valor: soControle.titulo.valor, origem: soControle.titulo.origem }),
    );
  }

  /* ── A CONTAGEM É POR CARACTERE, E NÃO POR UNIDADE UTF-16 ────────────────
     `char_length` no Postgres conta caracteres; `.length` conta unidades, e
     todo ponto de código fora do BMP ocupa duas. Toda asserção de teto deste
     projeto usava `repeat('a', …)`, e o alfabeto escolhido era exatamente o
     único em que os dois números coincidem. */
  {
    const EMOJI = "😀";
    afirmar(
      "`caracteresDe` conta PONTO DE CÓDIGO — e o corpus tem mesmo um caractere fora do BMP",
      caracteresDe(EMOJI) === 1 && EMOJI.length === 2 && caracteresDe(EMOJI.repeat(7)) === 7,
      `${caracteresDe(EMOJI)} caractere(s) em ${EMOJI.length} unidade(s)`,
    );
    for (const campo of CAMPOS_DE_TEXTO_DE_SEO) {
      const teto = TETO_DE_HIGIENE_DE_SEO[campo];
      afirmar(
        `\`${campo}\` com ${teto} emojis PASSA, e com ${teto + 1} é recusado — a fronteira é a mesma do banco`,
        problemaNoTextoDeSeo(campo, EMOJI.repeat(teto)) === null &&
          problemaNoTextoDeSeo(campo, EMOJI.repeat(teto + 1)) !== null,
        `${caracteresDe(EMOJI.repeat(teto))} caracteres em ${EMOJI.repeat(teto).length} unidades`,
      );
    }
  }

  afirmar(
      "o módulo exporta `metadadosDoPost` e NENHUMA segunda porta para a mesma cadeia",
      typeof moduloDeCompartilhamento.metadadosDoPost === "function" &&
        segundasPortas.length === 0,
      `exportações suspeitas: ${segundasPortas.join(", ") || "nenhuma"}`,
    );
  }
}

/* ─── Veredito ───────────────────────────────────────────────────────────── */

console.log("");
if (adiadas > 0) {
  console.log(
    `ATENÇÃO: ${adiadas} asserção(ões) NÃO foram exercidas (limite de taxa do GoTrue). Rode de novo em alguns minutos para cobri-las.`,
  );
}
if (falhas > 0) {
  console.log(`Camada de dados NÃO verificada: ${falhas} asserção(ões) falharam.`);
  process.exitCode = 1;
} else if (adiadas > 0 && !TOLERA_ADIADAS) {
  // Adiada NÃO é passou. A prova de separação é a razão de esta ferramenta
  // existir; terminar verde sem tê-la exercido diria "verificado" sobre nada.
  console.log(
    `Camada de dados NÃO verificada: nenhuma falha, mas ${adiadas} asserção(ões) ficaram sem exercício — a prova de separação pode estar entre elas.`,
  );
  console.log(
    "Rode de novo em alguns minutos. Para tolerar isto numa execução local, use VERIFICAR_TOLERAR_ADIADAS=1.",
  );
  process.exitCode = 1;
} else if (adiadas > 0) {
  console.log(
    `Camada de dados verificada com ressalva TOLERADA: ${adiadas} asserção(ões) ficaram sem exercício (VERIFICAR_TOLERAR_ADIADAS ligado).`,
  );
  process.exitCode = 0;
} else {
  console.log("Camada de dados verificada: todas as asserções passaram.");
  process.exitCode = 0;
}

});
