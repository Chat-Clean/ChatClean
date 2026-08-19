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
  ["resultado.js", "comum.js", "posts.js", "taxonomia.js", "slugs.js"].every((n) =>
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
    const abertura = fonte.indexOf("{", i);
    if (abertura === -1) return null;
    let profundidade = 0;
    for (let i = abertura; i < fonte.length; i += 1) {
      const c = fonte[i];
      if (c === "{") profundidade += 1;
      else if (c === "}") {
        profundidade -= 1;
        if (profundidade === 0) return fonte.slice(abertura, i + 1);
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
        /(?<!function\s)\bcliente(Publico|DoPainel)OuFalha\s*\(/g,
      ),
    ].map((m) => m[1]);
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
  ];
  const DO_PAINEL = [
    ["posts.js", "listarPostsDoPainel"],
    /* A leitura que a pré-visualização usa (Story 2.13). Ela precisa do cliente
       COM sessão: sem ele o PostgREST não recusa — responde 200 com o
       subconjunto anônimo, e a prévia de um rascunho abriria vazia sem que nada
       tivesse falhado. */
    ["posts.js", "lerPostDoPainelPorId"],
    ["taxonomia.js", "listarTagsDoPostNoPainel"],
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
  chaveDeOrdenacao,
  lerPostDoPainelPorId,
  lerPostPublicoPorSlug,
  listarPostsDoPainel,
  listarPostsPublicos,
  ordenarListagem,
} = postsMod;
const { listarCategorias, listarTags } = taxonomiaMod;
const { resolverSlugAposentado } = slugsMod;

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
import { listarPostsPublicos, lerPostPublicoPorSlug } from ${JSON.stringify(urlDe("src/data/blog/posts.js"))};
import { listarCategorias, listarTags } from ${JSON.stringify(urlDe("src/data/blog/taxonomia.js"))};
import { resolverSlugAposentado } from ${JSON.stringify(urlDe("src/data/blog/slugs.js"))};
const alvos = {
  listarPostsPublicos: () => listarPostsPublicos(),
  lerPostPublicoPorSlug: () => lerPostPublicoPorSlug("qualquer-slug"),
  listarCategorias: () => listarCategorias(),
  listarTags: () => listarTags(),
  resolverSlugAposentado: () => resolverSlugAposentado("qualquer-slug"),
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
         (${literal(slug("categoria"))}, 'Categoria da camada de dados', 'flask', 'oklch(0.7 0.1 200)', 99);

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
