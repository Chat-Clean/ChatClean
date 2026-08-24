#!/usr/bin/env node
/**
 * Ferramenta de verificação do Supabase (Stories 1.2 e 2.1).
 *
 * Mesmo contrato da verificação da fundação: uma linha por asserção, código 0
 * se todas passarem, 1 caso contrário. Cobre cada linha das matrizes de I/O
 * das duas stories, em quatro frentes:
 *
 *   (0)–(c) ESTÁTICO — sobre `supabase/migrations/*.sql`, sem rede: carimbo de
 *   tempo válido; RLS habilitada na mesma migração que cria a tabela; nenhuma
 *   política de escrita para `anon`/`authenticated`; toda view com
 *   `security_invoker`; toda função `security definer` com `search_path`
 *   fixo; nenhum segredo em `.env.example`; `engines.node` declarado.
 *
 *   (d) REMOTO, FUNDAÇÃO — `public.perfis` existe com RLS e as colunas
 *   esperadas; a migração consta em `supabase_migrations.schema_migrations`;
 *   `disable_signup` é `true`; e o registro pela API pública é de fato
 *   rejeitado.
 *
 *   (e) REMOTO, SCHEMA DO CONTEÚDO — as cinco tabelas do blog com RLS, o enum
 *   de estado comparado ao vocabulário de `src/domain/blog/estados.js`, tipos,
 *   restrições, chaves estrangeiras, gatilhos, índices e privilégios.
 *
 *   (f) COMPORTAMENTAL — a seção que justifica a Story 2.1. Tudo acima lê
 *   declaração; esta lê comportamento: semeia a matriz de visibilidade e
 *   consulta o projeto de três posições — com a CHAVE PUBLICÁVEL e SEM SESSÃO
 *   (o visitante), com SESSÃO REAL de uma Conta temporária (o Painel), e pela
 *   Management API (o servidor). Ler o texto de uma política não prova que o
 *   banco a aplica.
 *
 * (f) exige, além do token de conta, a CHAVE PUBLICÁVEL do projeto, lida de
 * `.env` ou `.env.example`. E ela nunca é usada como prova de negação sem
 * antes provar, com uma leitura que RETORNA 200, que a credencial é boa: 401
 * é também o que o PostgREST responde a uma chave inválida, e sem o controle
 * positivo as quinze asserções de escrita negada passariam por vacuidade.
 *
 * Sem `SUPABASE_ACCESS_TOKEN` no ambiente as asserções remotas FALHAM como
 * ausentes — nunca são puladas em silêncio. Foi o defeito corrigido na
 * verificação da Story 1.1 e não se repete aqui.
 *
 * Uso: npm run verificar:supabase
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  analisarSql,
  comandosSql,
  executarScript,
  executarSql,
  lerConfigAuth,
  lerToken,
  listarMigracoes,
  literal,
  NOME_PROJETO,
  raiz,
  registrarSegredo,
  REF_PROJETO,
  sanitizar,
  TIMEOUT_MS,
  URL_PROJETO,
} from "./supabase-comum.mjs";
// A Conta temporária da seção (f) nasce pelo MESMO SQL do onboarding real —
// duplicá-lo faria a sessão de teste vir por um caminho que ninguém usa.
import { sqlDeCriacaoDeConta, sqlDeRemocaoDeConta } from "./criar-conta.mjs";

// O vocabulário de Estado vem do domínio, não de uma cópia escrita aqui: é
// justamente a divergência entre banco e código que a asserção existe para
// pegar, e uma lista reescrita neste arquivo verificaria a si mesma.
import { ESTADOS } from "../src/domain/blog/estados.js";
/* Os vocabulários de cor e de ícone de Categoria vêm do DOMÍNIO, importados e
   EXECUTADOS contra o que está gravado. Reescrever as listas aqui compararia
   duas cópias do mesmo engano. */
import {
  ehChaveDeIconeDeCategoria,
  ehCorDeCategoria,
} from "../src/domain/blog/categorias.js";
/* O vocabulário do ARQUIVO vem do DOMÍNIO pela mesma razão (Story 3.1): o
   bucket declara teto de tamanho e lista de tipos, e a asserção compara o que
   está GRAVADO no bucket com o que o código diz — duas listas escritas à mão
   compararia duas cópias do mesmo engano. */
import {
  BUCKET_DAS_IMAGENS,
  ESPECIES_SEMPRE_RECUSADAS,
  TAMANHO_MAXIMO_DA_IMAGEM,
  TIPOS_DE_IMAGEM,
  ehCaminhoDeCapa,
} from "../src/domain/blog/arquivos.js";
/* E o vocabulário da ENTREGA (Story 4.2) vem do domínio pela mesma razão. A
   migração não declara enum de propósito — o vocabulário vive em um lugar só,
   e é esta ferramenta que confere que o banco não inventou uma quinta situação
   nem parou de devolver uma das quatro. */
import {
  ARQUIVADO,
  CAMPOS_DE_CONTEUDO,
  INEXISTENTE,
  NO_AR,
  REDIRECIONADO,
  SITUACOES_DA_ENTREGA,
} from "../src/domain/blog/entrega.js";
/* E a LISTA DE PERMISSÃO de nomes que o servidor pode chamar vem do próprio
   módulo de leitura: é ela que a asserção compara com o que existe no banco.
   Uma terceira cópia escrita aqui não pegaria divergência nenhuma. */
import { FUNCOES_DA_ENTREGA } from "../api/_nucleo/leitura.js";

/**
 * Os ENDEREÇOS das seis Categorias que a Story 2.14 semeou.
 *
 * ─── POR QUE ENDEREÇO, E NÃO NOME ───────────────────────────────────────────
 *
 * A primeira versão desta lista trazia os NOMES, e exigia que os seis
 * estivessem no banco. Isso quebrava `npm run verificar` no instante em que
 * alguém usasse a story: renomear ou excluir uma Categoria pelo Painel novo — o
 * objetivo inteiro da entrega — derrubava a ferramenta. E era a QUARTA cópia da
 * lista de Categorias, justamente o que a story veio eliminar.
 *
 * O que a asserção precisa provar é que a SEMEADURA aconteceu, e o endereço é o
 * que sobrevive a um renomear: ele é gerado uma vez e não muda sozinho, pela
 * mesma regra do Slug do Post. Excluir continua sendo possível — e por isso a
 * asserção cobra que a semeadura tenha DEIXADO MARCA (nenhum endereço
 * desconhecido, e pelo menos "novidades", que é o defeito que o critério
 * nomeia), não que as seis linhas continuem lá para sempre.
 */
const ENDERECOS_SEMEADOS = Object.freeze([
  "tecnologia",
  "estrategia",
  "analytics",
  "automacao",
  "tendencias",
  "novidades",
]);

/**
 * O endereço que o critério de aceite nomeia por extenso.
 *
 * "Novidades" existia no Painel e faltava no filtro público desde sempre; ela é
 * a razão de a semeadura existir. Excluí-la é possível pela tela nova — e, se
 * alguém o fizer, esta asserção precisa acusar, porque o produto perdeu a
 * correção que a story entregou.
 */
const ENDERECO_QUE_FALTAVA = "novidades";

let falhas = 0;
let adiadas = 0;

/** Identificador que não existe, para as tentativas que devem ser recusadas. */
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

function secao(titulo) {
  console.log(`\n${titulo}`);
}

/**
 * Asserção que o ambiente impediu de exercer — hoje, só o limite de taxa do
 * GoTrue. NÃO é sucesso: o veredito final avisa, e o texto diz o que ficou
 * sem cobertura. A alternativa (contar como OK) é a vacuidade que esta
 * ferramenta existe para não ter.
 */
function adiar(descricao, motivo) {
  adiadas += 1;
  console.log(`  ADIADA ${descricao} — ${sanitizar(motivo)}`);
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

function lerOuFalhar(caminho, descricao) {
  try {
    return readFileSync(caminho, "utf8");
  } catch (erro) {
    afirmar(descricao, false, erro.message);
    return null;
  }
}

// Todo o corpo roda dentro de `executarScript`: exceção inesperada vira código
// de saída 1 com mensagem sanitizada, em vez de rejeição solta que engoliria o
// veredito final. Era o defeito que a Story 1.1 corrigiu e não se repete.
await executarScript(async () => {

/* ─── (0) O leitor de SQL, sobre o qual toda asserção estática decide ────── */

secao("(0) o leitor de SQL faz o que as asserções estáticas presumem");

{
  const casos = [
    {
      nome: "comentário não vira comando",
      sql: "-- create policy p on t for insert to anon;\nselect 1;",
      espera: (cmds) => cmds.length === 1 && cmds[0].limpo === "select 1",
    },
    {
      nome: "ponto e vírgula dentro de corpo $$ não divide o comando",
      sql: "create function f() returns int language plpgsql as $$ begin return 1; end; $$;",
      espera: (cmds) => cmds.length === 1,
    },
    {
      nome: "ponto e vírgula dentro de literal não divide o comando",
      sql: "select 'a;b';",
      espera: (cmds) => cmds.length === 1,
    },
    {
      nome: "aspa escapada dentro de literal não encerra o literal",
      sql: "select 'não é o ''fim''; ainda não';",
      espera: (cmds) => cmds.length === 1,
    },
    {
      nome: "identificador entre aspas sobrevive à divisão",
      sql: 'create table "tabela;estranha" (id int);',
      espera: (cmds) => cmds.length === 1 && /tabela/.test(cmds[0].limpo),
    },
  ];
  for (const caso of casos) {
    let passou = false;
    try {
      passou = caso.espera(comandosSql(caso.sql));
    } catch (erro) {
      passou = false;
      caso.detalhe = erro.message;
    }
    afirmar(`leitor: ${caso.nome}`, passou, caso.detalhe ?? "");
  }

  const quebrados = [
    ["literal sem fechamento", "select 'sem fim"],
    ["bloco $$ sem fechamento", "create function f() as $$ begin"],
    ["identificador sem fechamento", 'select * from "aberto'],
  ];
  for (const [nome, sql] of quebrados) {
    afirmar(
      `leitor acusa SQL malformado: ${nome}`,
      analisarSql(sql).problemas.length > 0,
      "SQL quebrado precisa acusar, não passar por vacuidade",
    );
  }
}

/* ─── (a) Migrações versionadas ──────────────────────────────────────────── */

secao("(a) migrações versionadas em supabase/migrations");

const migracoes = listarMigracoes();
afirmar(
  "existe pelo menos uma migração no repositório",
  migracoes.length > 0,
  "supabase/migrations está vazio",
);

for (const m of migracoes) {
  afirmar(
    `${m.nome}: nome com carimbo de tempo válido`,
    m.valida,
    "esperado <AAAAMMDDHHMMSS>_<nome>.sql com data real",
  );
}

const versoes = migracoes.map((m) => m.versao).filter(Boolean);
afirmar(
  "nenhuma versão de migração repetida",
  new Set(versoes).size === versoes.length,
  versoes.join(", "),
);

// Ordem lexicográfica é a ordem de aplicação; se ela não for cronológica, o
// arquivo mais novo pode rodar antes do que ele depende.
afirmar(
  "ordem lexicográfica dos arquivos é a ordem cronológica",
  versoes.every((v, i) => i === 0 || versoes[i - 1] < v),
  versoes.join(" → "),
);

/* ─── (b) Regras da arquitetura, lidas do SQL ────────────────────────────── */

secao("(b) o SQL respeita as regras que a arquitetura declara");

/** Nome da tabela em `create table [if not exists] <nome>`. */
function tabelaCriada(limpo) {
  const m = /^create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z0-9_."]+)/.exec(
    limpo,
  );
  return m ? m[1].replace(/"/g, "") : null;
}

/**
 * ─── A EXCEÇÃO NOMEADA DO STORAGE (Story 3.1) ──────────────────────────────
 *
 * A varredura abaixo reprova qualquer política de escrita apontando para papel
 * de cliente, e ela existe desde a Story 2.1 porque "nenhum cliente escreve no
 * banco" é a regra que sustenta a RLS inteira. A Story 3.1 a **reabre de
 * propósito**, e a reabertura é uma lista de PERMISSÃO com quatro travas, não
 * um buraco:
 *
 *   1. a política precisa estar nesta lista, POR NOME;
 *   2. ela precisa ser sobre `storage.objects` — e sobre nada mais;
 *   3. o papel precisa ser `authenticated`: `anon` e `public` continuam
 *      reprovados aqui como em qualquer outro lugar;
 *   4. a operação precisa ser `insert` ou `delete`. `all` e `update` não estão
 *      previstos, e uma política `for all` — ou sem cláusula `for`, que em
 *      Postgres é a mesma coisa — continua caindo na regra;
 *   5. e o PREDICADO precisa prender a política ao bucket desta story, por
 *      igualdade com o nome que o domínio declara.
 *
 * A quinta trava é a que faltava, e a falta era grave: sem ela,
 * `with check (true)` passava — qualquer Conta do Painel podia inserir e
 * apagar objetos de QUALQUER balde do projeto, e a promessa escrita na
 * própria migração ("todas presas a `bucket_id`… um bucket futuro nasce
 * fechado") virava mentira, com a suíte inteira verde.
 *
 * A quinta trava é a que faltava, e a falta era grave: sem ela,
 * `with check (true)` passava — e a promessa escrita na própria migração
 * ("todas presas a `bucket_id`… um bucket futuro nasce fechado") virava
 * mentira, com qualquer Conta do Painel podendo inserir e apagar objetos de
 * QUALQUER balde do projeto. Medido: a sabotagem passava a suíte inteira
 * verde.
 *
 * O que a exceção NÃO alcança: as tabelas de `public`. Escrita para papel de
 * cliente em `posts`, `categorias`, `tags`, `posts_tags` ou `slugs_antigos`
 * continua reprovada, sem exceção e sem lista — é a mesma varredura, e ela
 * continua fechada do lado que importa.
 *
 * A razão de a distinção existir está escrita no cabeçalho da migração
 * `20260819234500_capa_no_storage.sql`: o Storage é outro recurso, com outro
 * cadeado, e o ENDEREÇO continua entrando no Post pela porta única de escrita.
 */
const POLITICAS_DE_ESCRITA_NO_STORAGE = Object.freeze([
  "imagens_do_blog_envio_autenticado",
  "imagens_do_blog_remocao_autenticada",
]);

/**
 * A política de escrita é a exceção nomeada do Storage?
 *
 * Recebe o comando já normalizado (minúsculo, espaços colapsados) e devolve
 * `true` só quando as quatro travas fecham. Qualquer dúvida devolve `false`,
 * que é reprovar.
 */
function ehExcecaoDoStorage(limpo, bruto = limpo) {
  const nome = /^create\s+policy\s+"?([a-z0-9_]+)"?/.exec(limpo)?.[1] ?? "";
  if (!POLITICAS_DE_ESCRITA_NO_STORAGE.includes(nome)) return false;
  /* A TABELA-ALVO, e não "a palavra aparece em algum lugar do comando". O
     teste solto casava com uma menção a storage.objects DENTRO do predicado —
     a trava era mais fraca que a prosa que a documentava. */
  const alvo = /^create\s+policy\s+"?[a-z0-9_]+"?\s+on\s+([a-z0-9_."]+)/
    .exec(limpo)?.[1]
    ?.replace(/"/g, "");
  if (alvo !== "storage.objects") return false;
  const operacao = /\bfor\s+(select|insert|update|delete|all)\b/.exec(limpo)?.[1] ?? "";
  if (!["insert", "delete"].includes(operacao)) return false;
  const papeis = /\bto\s+([a-z0-9_,\s]+?)\s+(?:using|with)\b/.exec(limpo)?.[1] ?? "";
  const lista = papeis.split(/[,\s]+/).filter(Boolean);
  if (lista.length !== 1 || lista[0] !== "authenticated") return false;
  /* E O PREDICADO PRENDE A POLÍTICA AO BUCKET.
     `using` para `delete`, `with check` para `insert`, e a comparação é por
     IGUALDADE com a forma exata — o nome do bucket vem do DOMÍNIO, e não de um
     literal escrito aqui. Sem esta trava, `with check (true)` passava: qualquer
     Conta do Painel podia inserir e apagar objetos de QUALQUER balde do
     projeto, e a promessa escrita na migração ("todas presas a bucket_id, um
     bucket futuro nasce fechado") era falsa. Igualdade e não contenção: um
     predicado que só MENCIONE bucket_id numa comparação mais frouxa
     (`like`, `in`, `or`) não prende nada.

     `limpo` já vem em minúsculas e com espaços colapsados de `comandosSql`, e
     é por isso que a comparação pode ser de string em vez de expressão
     regular — que precisaria escapar o nome do bucket. */
  /* O PREDICADO É LIDO DO COMANDO CRU, e não do normalizado: `comandosSql`
     MASCARA literais de string — e o que ela apaga é exatamente o nome do
     bucket, que é o único texto que precisa ser comparado aqui. Ler o
     normalizado faria toda política de verdade ser reprovada e só os
     exemplos do autoteste passarem, que foi o que aconteceu na primeira
     tentativa desta correção. */
  const cru = String(bruto).replace(/\s+/g, " ").trim().toLowerCase();
  const predicado = /\b(?:using|with\s+check)\s*\((.*)\)\s*;?$/.exec(cru)?.[1] ?? "";
  return predicado.trim() === "bucket_id = '" + BUCKET_DAS_IMAGENS + "'";
}

const tabelasCriadas = new Map(); // nome → arquivo
const rlsPorArquivo = new Map(); // arquivo → Set de tabelas com RLS ligada ali
const politicasDeEscrita = [];
/** As exceções encontradas de verdade — a lista não pode ser decorativa. */
const excecoesDoStorageVistas = [];
const viewsSemInvoker = [];
const definerSemSearchPath = [];
const tabelasSemRls = [];
const sqlMalformado = [];
const semIdempotencia = [];
const privilegioConcedido = [];

for (const m of migracoes) {
  const sql = lerOuFalhar(m.caminho, `${m.nome}: legível`);
  if (sql === null) continue;

  const analise = analisarSql(sql);
  if (analise.problemas.length > 0) {
    sqlMalformado.push(`${m.nome}: ${analise.problemas.join("; ")}`);
  }

  const doArquivo = new Set();
  rlsPorArquivo.set(m.nome, doArquivo);
  const dropsNoArquivo = [];
  const criacoesNoArquivo = [];

  for (const { bruto, limpo } of comandosSql(sql)) {
    const tabela = tabelaCriada(limpo);
    if (tabela) tabelasCriadas.set(tabela, m.nome);

    if (/^alter\s+table\s+.*enable\s+row\s+level\s+security/.test(limpo)) {
      const alvo = /^alter\s+table\s+(?:if\s+exists\s+)?([a-z0-9_."]+)/.exec(
        limpo,
      );
      if (alvo) {
        // Qualificar com `public.` quando o comando omite o schema, para não
        // ler `alter table perfis` como uma tabela diferente de
        // `create table public.perfis`.
        const nome = alvo[1].replace(/"/g, "");
        doArquivo.add(nome.includes(".") ? nome : `public.${nome}`);
      }
    }

    // Política de escrita concedida a anon/authenticated/public. Em Postgres,
    // política SEM cláusula `for` equivale a `for all` — omitir a cláusula não
    // pode ser rota de fuga da regra.
    if (/^create\s+policy/.test(limpo)) {
      const forExplicito = /\bfor\s+(select|insert|update|delete|all)\b/.exec(
        limpo,
      );
      const paraEscrita =
        forExplicito === null || // sem `for` = `for all`
        ["insert", "update", "delete", "all"].includes(forExplicito[1]);
      const paraPapelAberto = /\bto\s+[^)]*\b(anon|authenticated|public)\b/.test(
        limpo,
      );
      const semPapel = !/\bto\s+/.test(limpo); // sem TO explícito = PUBLIC
      if (paraEscrita && (paraPapelAberto || semPapel)) {
        /* A EXCEÇÃO NOMEADA DO STORAGE — ver o comentário de
           `POLITICAS_DE_ESCRITA_NO_STORAGE`. Ela é conferida DEPOIS de a
           política já ter sido reconhecida como escrita para papel de cliente:
           a regra continua sendo a mesma, e o que muda é que duas políticas
           declaradas por nome, sobre `storage.objects`, para `authenticated`,
           em `insert` e `delete`, deixam de reprovar. */
        if (ehExcecaoDoStorage(limpo, bruto)) {
          excecoesDoStorageVistas.push(
            /^create\s+policy\s+"?([a-z0-9_]+)"?/.exec(limpo)?.[1] ?? "",
          );
        } else {
          politicasDeEscrita.push(`${m.nome}: ${bruto.slice(0, 90)}…`);
        }
      }
    }

    // `grant` de escrita a papel de cliente desfaz o cadeado de privilégio.
    if (
      /^grant\b/.test(limpo) &&
      /\b(insert|update|delete|truncate|all)\b/.test(limpo.split(" to ")[0] ?? "") &&
      /\bto\s+[^;]*\b(anon|authenticated|public)\b/.test(limpo)
    ) {
      privilegioConcedido.push(`${m.nome}: ${bruto.slice(0, 90)}…`);
    }

    // Idempotência: a migração declara que reaplicar não quebra. Objeto que
    // não aceita `if not exists` precisa do `drop … if exists` antes.
    if (/^create\s+(policy|trigger)\b/.test(limpo)) {
      criacoesNoArquivo.push(limpo);
    }
    if (/^drop\s+(policy|trigger)\s+if\s+exists\b/.test(limpo)) {
      dropsNoArquivo.push(limpo);
    }
    if (/^create\s+(table|index|schema)\b/.test(limpo)) {
      if (!/if\s+not\s+exists/.test(limpo)) {
        semIdempotencia.push(`${m.nome}: ${bruto.slice(0, 70)}… (sem IF NOT EXISTS)`);
      }
    }

    if (/^create\s+(or\s+replace\s+)?(recursive\s+)?view\b/.test(limpo)) {
      if (!/security_invoker\s*=\s*(true|on)/.test(limpo)) {
        viewsSemInvoker.push(`${m.nome}: ${bruto.slice(0, 90)}…`);
      }
    }

    if (/\bsecurity\s+definer\b/.test(limpo)) {
      if (!/\bset\s+search_path\s*=/.test(limpo)) {
        definerSemSearchPath.push(`${m.nome}: ${bruto.slice(0, 90)}…`);
      }
    }
  }

  // Criação de política ou gatilho sem o `drop … if exists` correspondente no
  // mesmo arquivo quebra a idempotência que a migração promete.
  for (const criacao of criacoesNoArquivo) {
    const tipo = /^create\s+(policy|trigger)/.exec(criacao)?.[1];
    const nome = new RegExp(`^create\\s+${tipo}\\s+("[^"]+"|[a-z0-9_]+)`).exec(
      criacao,
    )?.[1];
    if (!nome) continue;
    const temDrop = dropsNoArquivo.some((d) =>
      d.startsWith(`drop ${tipo} if exists ${nome}`),
    );
    if (!temDrop) {
      semIdempotencia.push(`${m.nome}: ${tipo} ${nome} sem DROP IF EXISTS antes`);
    }
  }
}

for (const [tabela, arquivo] of tabelasCriadas) {
  // "na mesma migração" precisa ser verificado por arquivo: acumular tudo e
  // comparar no fim deixaria passar tabela criada em A.sql com a RLS ligada
  // só em B.sql — exatamente o que a asserção diz impedir.
  if (!(rlsPorArquivo.get(arquivo)?.has(tabela) ?? false)) {
    tabelasSemRls.push(`${tabela} (${arquivo})`);
  }
}

afirmar(
  "toda tabela criada habilita RLS na mesma migração",
  tabelasSemRls.length === 0,
  tabelasSemRls.join(", "),
);
afirmar(
  "nenhuma migração está malformada",
  sqlMalformado.length === 0,
  sqlMalformado.join(" | "),
);
afirmar(
  "nenhuma política concede escrita a anon, authenticated ou public — exceto as duas do Storage, nomeadas",
  politicasDeEscrita.length === 0,
  politicasDeEscrita.join(" | "),
);

/* ─── A EXCEÇÃO REABERTA, JULGADA (Story 3.1) ────────────────────────────── */
//
// Uma exceção que ninguém confere é um buraco com nome bonito. Três asserções:
// ela foi USADA (senão a lista é decoração), ela é EXATAMENTE a declarada
// (senão sobra permissão que nada exerce), e o detector recusa as variações
// vizinhas — que é o autoteste que impede a reabertura de virar uma porta.

afirmar(
  "as duas políticas de escrita no Storage existem de verdade — a exceção não é decorativa",
  excecoesDoStorageVistas.length === POLITICAS_DE_ESCRITA_NO_STORAGE.length &&
    POLITICAS_DE_ESCRITA_NO_STORAGE.every((n) => excecoesDoStorageVistas.includes(n)),
  `encontradas: ${excecoesDoStorageVistas.join(", ") || "nenhuma"} — declaradas: ${POLITICAS_DE_ESCRITA_NO_STORAGE.join(", ")}`,
);

{
  /* AUTOTESTE, NOS DOIS SENTIDOS. Sem ele, um `ehExcecaoDoStorage` que
     devolvesse `true` para tudo deixaria a varredura inteira sem efeito e a
     suíte continuaria verde — sobre um repositório em que qualquer política de
     escrita para `anon` passaria a ser aceita. */
  const normalizar = (sql) => sql.trim().replace(/\s+/g, " ").toLowerCase();

  /* O BALDE DOS EXEMPLOS É O DE VERDADE. Eles usavam um balde arbitrário — o
     que, sozinho, já denunciava que o predicado não estava sendo julgado. */
  const B = BUCKET_DAS_IMAGENS;
  const DEVE_ACEITAR = [
    `create policy "imagens_do_blog_envio_autenticado" on storage.objects for insert to authenticated with check (bucket_id = '${B}')`,
    `create policy "imagens_do_blog_remocao_autenticada" on storage.objects for delete to authenticated using (bucket_id = '${B}')`,
  ];
  /* Cada linha é uma trava diferente, e a razão de ela existir: nome fora da
     lista, tabela do banco em vez do Storage, `anon` no lugar de
     `authenticated`, os dois papéis juntos, `for all` (que alcança update), e
     política sem cláusula `for` — que em Postgres É `for all`. */
  const DEVE_RECUSAR = [
    'create policy "outra_qualquer" on storage.objects for insert to authenticated with check (true)',
    'create policy "imagens_do_blog_envio_autenticado" on public.posts for insert to authenticated with check (true)',
    'create policy "imagens_do_blog_envio_autenticado" on storage.objects for insert to anon with check (true)',
    'create policy "imagens_do_blog_envio_autenticado" on storage.objects for insert to anon, authenticated with check (true)',
    'create policy "imagens_do_blog_envio_autenticado" on storage.objects for all to authenticated using (true)',
    'create policy "imagens_do_blog_envio_autenticado" on storage.objects to authenticated using (true)',
    'create policy "imagens_do_blog_remocao_autenticada" on storage.objects for update to authenticated using (true)',
    /* AS TRAVAS DO PREDICADO, uma por linha: alcançar o projeto inteiro,
       alcançar o balde errado, e prender por comparação mais frouxa sobre o
       nome certo — que não prende. */
    'create policy "imagens_do_blog_envio_autenticado" on storage.objects for insert to authenticated with check (true)',
    `create policy "imagens_do_blog_envio_autenticado" on storage.objects for insert to authenticated with check (bucket_id = 'outro-balde')`,
    `create policy "imagens_do_blog_remocao_autenticada" on storage.objects for delete to authenticated using (bucket_id like '${B}%')`,
    `create policy "imagens_do_blog_envio_autenticado" on storage.objects for insert to authenticated with check (bucket_id = '${B}' or true)`,
    /* E a MENÇÃO à tabela dentro do predicado não vale como tabela-alvo. */
    `create policy "imagens_do_blog_envio_autenticado" on public.posts for insert to authenticated with check (bucket_id = '${B}' and exists (select 1 from storage.objects))`,
  ];

  /* Os DOIS argumentos, como no uso real: o normalizado (com literais
     mascarados, que é o que a varredura tem em mãos) e o CRU (que é de onde
     o predicado sai). `mascarar` reproduz o que `comandosSql` faz aos
     literais — sem isso o autoteste exercitaria um caminho que não existe. */
  const mascarar = (t) => t.replace(/'[^']*'/g, (m) => " ".repeat(m.length));
  const julgar = (t) => ehExcecaoDoStorage(normalizar(mascarar(t)), normalizar(t));
  const escaparam = DEVE_ACEITAR.filter((s) => !julgar(s));
  const passaram = DEVE_RECUSAR.filter((s) => julgar(s));
  afirmar(
    "autoteste: a exceção do Storage reconhece as duas políticas declaradas",
    escaparam.length === 0,
    escaparam.join(" | "),
  );
  afirmar(
    "autoteste: e RECUSA nome fora da lista, tabela do banco, `anon`, papel duplo, `for all`, política sem `for` e predicado que não prende o bucket",
    passaram.length === 0,
    passaram.join(" | "),
  );
}
afirmar(
  "nenhum grant de escrita a papel de cliente",
  privilegioConcedido.length === 0,
  privilegioConcedido.join(" | "),
);
afirmar(
  "as migrações são idempotentes (IF NOT EXISTS / DROP IF EXISTS)",
  semIdempotencia.length === 0,
  semIdempotencia.join(" | "),
);
afirmar(
  "toda view declara security_invoker = true",
  viewsSemInvoker.length === 0,
  viewsSemInvoker.join(" | "),
);
afirmar(
  "toda função security definer fixa search_path",
  definerSemSearchPath.length === 0,
  definerSemSearchPath.join(" | "),
);
afirmar(
  "a migração inicial cria public.perfis",
  tabelasCriadas.has("public.perfis"),
  [...tabelasCriadas.keys()].join(", ") || "nenhuma tabela criada",
);

/* ─── (c) Ambiente e segredos ────────────────────────────────────────────── */

secao("(c) ambiente declarado, nenhum segredo versionado");

const pacote = lerOuFalhar(path.join(raiz, "package.json"), "package.json legível");
if (pacote !== null) {
  let pkg = null;
  try {
    pkg = JSON.parse(pacote);
    afirmar("package.json parseia como JSON", true);
  } catch (erro) {
    afirmar("package.json parseia como JSON", false, erro.message);
  }
  if (pkg) {
    const node = pkg.engines?.node ?? "";
    const minimo = /(\d+)/.exec(node);
    afirmar(
      "engines.node declara 22 ou superior",
      /^>=?\s*\d/.test(node) && minimo !== null && Number(minimo[1]) >= 22,
      `encontrado: ${node || "ausente"}`,
    );
    for (const script of [
      "supabase:migrar",
      "supabase:auth",
      "verificar:supabase",
    ]) {
      afirmar(`script "${script}" declarado`, Boolean(pkg.scripts?.[script]));
    }
    afirmar(
      "`verificar` encadeia fundação e Supabase",
      /verificar:fundacao/.test(pkg.scripts?.verificar ?? "") &&
        /verificar:supabase/.test(pkg.scripts?.verificar ?? ""),
      `encontrado: ${pkg.scripts?.verificar ?? "ausente"}`,
    );
  }
}

const exemplo = lerOuFalhar(path.join(raiz, ".env.example"), ".env.example existe");
if (exemplo !== null) {
  afirmar(
    ".env.example declara a URL do projeto certo",
    exemplo.includes(URL_PROJETO),
    `esperado ${URL_PROJETO}`,
  );
  afirmar(
    ".env.example declara a chave publicável",
    /VITE_SUPABASE_PUBLISHABLE_KEY\s*=\s*sb_publishable_/.test(exemplo),
  );
  // Duas varreduras, porque as marcas são de naturezas diferentes:
  //
  //  - Valor de segredo (`sb_secret_…`, token `sbp_…`, JWT de service_role) é
  //    proibido em QUALQUER lugar do arquivo, comentário inclusive: colar um
  //    segredo real numa linha comentada continua sendo vazá-lo no repositório.
  //  - Atribuição de variável sensível só conta fora de comentário — o arquivo
  //    documenta `SUPABASE_ACCESS_TOKEN` justamente para dizer que ele NÃO vem
  //    para cá, e essa explicação não pode disparar o alarme.
  const valoresProibidos = [
    /sb_secret_/i,
    /service_role/i,
    /sbp_[0-9a-f]{40}/i,
  ];
  const atribuicoesProibidas = [
    /^\s*(export\s+)?SUPABASE_ACCESS_TOKEN\s*=\s*\S/i,
    /^\s*(export\s+)?SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S/i,
    /^\s*(export\s+)?DATABASE_URL\s*=\s*postgres/i,
  ];
  const linhasVivas = exemplo
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l) && l.trim() !== "");
  const encontradas = [
    ...valoresProibidos.filter((r) => r.test(exemplo)),
    ...atribuicoesProibidas.filter((r) => linhasVivas.some((l) => r.test(l))),
  ];
  afirmar(
    ".env.example não contém segredo algum",
    encontradas.length === 0,
    encontradas.map(String).join(", "),
  );
}

const gitignore = lerOuFalhar(path.join(raiz, ".gitignore"), ".gitignore legível");
if (gitignore !== null) {
  const linhas = gitignore.split(/\r?\n/).map((l) => l.trim());
  afirmar(".gitignore exclui `.env`", linhas.includes(".env"));
}

// Presença de linha em `.gitignore` não prova nada: a ordem das regras decide,
// e um padrão de diretório derrota a negação. Quem sabe a resposta é o git.
function git(args) {
  try {
    // Sem `shell: true`: o git é executável direto, e passar argumento por
    // shell no Windows não os escapa (DEP0190).
    const saida = execFileSync("git", args, { cwd: raiz, stdio: "pipe" });
    return { ok: true, saida: String(saida) };
  } catch (erro) {
    return {
      ok: false,
      saida: `${erro.stdout ?? ""}${erro.stderr ?? ""}`,
      status: erro.status,
    };
  }
}

for (const m of migracoes) {
  const rel = `supabase/migrations/${m.nome}`;
  const ignorado = git(["check-ignore", "-q", rel]);
  // `check-ignore -q` sai 0 quando o caminho ESTÁ ignorado.
  afirmar(
    `${m.nome} não é ignorada pelo git`,
    ignorado.status === 1,
    "a regra `*.sql` engoliria o schema; a exceção precisa vir depois dela",
  );
}

afirmar(
  "`.env` não está versionado",
  git(["ls-files", "--error-unmatch", ".env"]).ok === false,
  "o arquivo de ambiente local não pode estar rastreado",
);

afirmar(
  "config.toml do CLI fecha o registro também no stack local",
  (() => {
    const caminho = path.join(raiz, "supabase", "config.toml");
    if (!existsSync(caminho)) return false;
    const toml = readFileSync(caminho, "utf8");
    return (
      /project_id\s*=\s*"[^"]+"/.test(toml) &&
      /enable_signup\s*=\s*false/.test(toml)
    );
  })(),
);

/* ─── (d) Estado remoto ──────────────────────────────────────────────────── */

secao(`(d) estado remoto do projeto ${NOME_PROJETO} (${REF_PROJETO})`);

const token = lerToken();
const temToken = afirmar(
  "SUPABASE_ACCESS_TOKEN presente no ambiente",
  Boolean(token),
  "sem ele as asserções remotas não podem rodar — e não são puladas em silêncio",
);

/**
 * Consulta que devolve uma linha. Erro de consulta é reportado como asserção
 * falha na hora — sem isto, um 401 ou um 500 chegaria às asserções seguintes
 * como "nenhuma linha", e "nenhuma política de escrita" passaria justamente
 * quando a verificação não conseguiu olhar.
 */
async function uma(sql, oQue) {
  const r = await executarSql(token, sql);
  if (!r.ok) {
    afirmar(`consulta respondeu: ${oQue}`, false, r.erro);
    return { erro: r.erro, falhou: true };
  }
  const linhas = Array.isArray(r.dados) ? r.dados : [];
  return { linha: linhas[0] ?? null, linhas };
}

if (temToken) {
  const tabela = await uma(
    `select c.relrowsecurity as rls
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'perfis'`,
    "estado de public.perfis",
  );
  afirmar(
    "public.perfis existe no projeto remoto",
    !tabela.falhou && Boolean(tabela.linha),
    tabela.erro ?? "tabela não encontrada",
  );
  afirmar(
    "public.perfis tem RLS habilitada",
    tabela.linha?.rls === true,
    `encontrado: ${tabela.linha?.rls ?? "—"}`,
  );

  const colunas = await uma(
    `select string_agg(column_name, ',' order by column_name) as nomes
       from information_schema.columns
      where table_schema = 'public' and table_name = 'perfis'`,
    "colunas de public.perfis",
  );
  const esperadas = ["atualizado_em", "criado_em", "id", "nome_exibicao"];
  const obtidas = (colunas.linha?.nomes ?? "").split(",").filter(Boolean);
  afirmar(
    "public.perfis tem as colunas esperadas",
    !colunas.falhou && esperadas.every((c) => obtidas.includes(c)),
    `encontrado: ${obtidas.join(", ") || "—"}`,
  );

  const politicas = await uma(
    `select coalesce(string_agg(policyname || ':' || cmd || ':' || array_to_string(roles, '+'), ' | '), '') as p
       from pg_policies where schemaname = 'public' and tablename = 'perfis'`,
    "políticas de public.perfis",
  );
  const listaPoliticas = politicas.linha?.p ?? "";
  afirmar(
    "nenhuma política de escrita para papel de cliente no remoto",
    !politicas.falhou &&
      !/:(INSERT|UPDATE|DELETE|ALL):(?=[^|]*\b(anon|authenticated|public)\b)/i.test(
        listaPoliticas,
      ),
    `políticas: ${listaPoliticas || "nenhuma"}`,
  );

  // Privilégio e política são cadeados distintos: a leitura só funciona com os
  // dois. Sem esta asserção, o `grant select` da segunda migração poderia
  // desaparecer e a suíte continuaria verde até o Painel não abrir.
  const privilegios = await uma(
    `select
       has_table_privilege('authenticated', 'public.perfis', 'select') as le,
       has_table_privilege('authenticated', 'public.perfis', 'insert') as escreve,
       has_table_privilege('anon', 'public.perfis', 'select') as anon_le,
       has_table_privilege('anon', 'public.perfis', 'insert') as anon_escreve`,
    "privilégios de public.perfis",
  );
  afirmar(
    "authenticated tem privilégio de leitura em perfis",
    privilegios.linha?.le === true,
    `encontrado: ${privilegios.linha?.le ?? "—"}`,
  );
  afirmar(
    "nenhum papel de cliente tem privilégio de escrita em perfis",
    privilegios.linha?.escreve === false &&
      privilegios.linha?.anon_escreve === false,
    `authenticated: ${privilegios.linha?.escreve ?? "—"} | anon: ${privilegios.linha?.anon_escreve ?? "—"}`,
  );

  const gatilhos = await uma(
    `select coalesce(string_agg(tgname, ','), '') as g from pg_trigger
      where tgrelid = 'auth.users'::regclass and not tgisinternal`,
    "gatilhos de auth.users",
  );
  afirmar(
    "o gatilho que cria o perfil junto da Conta existe",
    (gatilhos.linha?.g ?? "").split(",").includes("on_auth_user_created"),
    gatilhos.erro ?? `gatilhos: ${gatilhos.linha?.g || "nenhum"}`,
  );

  const tocar = await uma(
    `select coalesce(string_agg(tgname, ','), '') as g from pg_trigger
      where tgrelid = 'public.perfis'::regclass and not tgisinternal`,
    "gatilhos de public.perfis",
  );
  afirmar(
    "atualizado_em é mantido por gatilho, não só por default",
    (tocar.linha?.g ?? "").split(",").includes("perfis_tocar_atualizado_em"),
    `gatilhos: ${tocar.linha?.g || "nenhum"}`,
  );

  const funcoes = await uma(
    `select p.proname as nome,
            p.prosecdef as definer,
            coalesce(array_to_string(p.proconfig, ','), '') as cfg
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('criar_perfil_da_conta', 'tocar_atualizado_em')`,
    "funções do módulo",
  );
  const semSearchPath = (funcoes.linhas ?? []).filter(
    (f) => f.definer === true && !/search_path=/.test(f.cfg ?? ""),
  );
  afirmar(
    "toda função security definer no remoto fixa search_path",
    !funcoes.falhou &&
      (funcoes.linhas ?? []).length >= 2 &&
      semSearchPath.length === 0,
    semSearchPath.map((f) => f.nome).join(", ") ||
      `funções encontradas: ${(funcoes.linhas ?? []).length}`,
  );

  const registradas = await uma(
    "select coalesce(string_agg(version, ',' order by version), '') as v from supabase_migrations.schema_migrations",
    "registro de migrações",
  );
  const registro = (registradas.linha?.v ?? "").split(",").filter(Boolean);
  const naoRegistradas = migracoes
    .filter((m) => !registro.includes(m.versao))
    .map((m) => m.nome);
  afirmar(
    "toda migração do repositório consta em schema_migrations",
    !registradas.falhou && migracoes.length > 0 && naoRegistradas.length === 0,
    naoRegistradas.join(", ") || registradas.erro || "",
  );
  // O inverso também importa: versão no banco sem arquivo no repositório
  // significa schema aplicado por fora, que ninguém revisou.
  const orfas = registro.filter((v) => !migracoes.some((m) => m.versao === v));
  afirmar(
    "nenhuma versão aplicada no remoto sem arquivo no repositório",
    orfas.length === 0,
    orfas.join(", "),
  );

  // Nenhuma view existe hoje; a asserção protege o futuro, no remoto — uma view
  // criada pelo console sem `security_invoker` fura a RLS e não apareceria na
  // leitura estática das migrações.
  const views = await uma(
    `select coalesce(string_agg(c.relname, ', '), '') as v
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'
        and coalesce(array_to_string(c.reloptions, ','), '') not like '%security_invoker=%'`,
    "views sem security_invoker",
  );
  afirmar(
    "nenhuma view em public sem security_invoker",
    !views.falhou && (views.linha?.v ?? "") === "",
    `views: ${views.linha?.v ?? "—"}`,
  );

  const auth = await lerConfigAuth(token);
  afirmar("configuração de auth legível", auth.ok, auth.ok ? "" : auth.erro);
  afirmar(
    "registro público desabilitado (disable_signup = true)",
    auth.ok && auth.dados?.disable_signup === true,
    `encontrado: ${auth.ok ? auth.dados?.disable_signup : "—"}`,
  );

  // A prova final: tentar mesmo. Configuração é o que a API diz; isto é o que
  // o projeto faz.
  const chave = (() => {
    const env = lerOuFalhar(path.join(raiz, ".env.example"), ".env.example legível");
    const m = env ? /VITE_SUPABASE_PUBLISHABLE_KEY\s*=\s*(\S+)/.exec(env) : null;
    return m ? m[1] : null;
  })();

  if (chave) {
    const alvo = `verificacao+${Number(process.hrtime.bigint() % 100000000n)}@chatclean.com.br`;
    let status = 0;
    let corpo = "";
    let erroDeRede = "";
    try {
      const r = await fetch(`${URL_PROJETO}/auth/v1/signup`, {
        method: "POST",
        headers: { apikey: chave, "Content-Type": "application/json" },
        body: JSON.stringify({ email: alvo, password: `Vf${Date.now()}!aZ` }),
        signal: AbortSignal.timeout(30000),
      });
      status = r.status;
      corpo = await r.text();
    } catch (erro) {
      erroDeRede = erro.message;
    }

    // A sonda precisa ter ALCANÇADO o fluxo de registro. Chave rotacionada
    // (401), rota mudada (404) ou limite de taxa (429) devolvem "não-2xx" sem
    // testar nada — aceitar isso como prova deixaria a asserção verde para
    // sempre, justamente quando ela parou de verificar.
    const alcancou = status !== 0 && ![401, 403, 404, 429].includes(status);
    afirmar(
      "a sonda de registro alcançou o endpoint",
      alcancou,
      erroDeRede || `HTTP ${status} ${corpo.slice(0, 160)}`,
    );
    afirmar(
      "registro pela API pública é de fato rejeitado",
      alcancou &&
        status === 422 &&
        /signup.*disabled|signups?_not_allowed|signups not allowed/i.test(corpo),
      `HTTP ${status} ${corpo.slice(0, 200)}`,
    );

    // Se por acidente a conta tiver nascido, isto acusa E limpa — deixar conta
    // órfã num projeto de produção a cada verificação seria pior que o defeito.
    const sobrou = await uma(
      `select count(*)::int as n from auth.users where email = ${literal(alvo)}`,
      "contas com o e-mail da sonda",
    );
    const nasceu = (sobrou.linha?.n ?? 0) > 0;
    if (nasceu) {
      await executarSql(
        token,
        `delete from auth.users where email = ${literal(alvo)}`,
      );
    }
    afirmar(
      "a tentativa de registro não criou conta alguma",
      !nasceu,
      nasceu
        ? "uma conta nasceu e foi removida — o registro público NÃO está fechado"
        : "",
    );
  } else {
    afirmar("chave publicável disponível para o teste de registro", false);
  }

  // Conta sem perfil é o sintoma de gatilho falhando em silêncio — ele agora
  // engole a exceção para não travar o onboarding, então alguém precisa olhar.
  const semPerfil = await uma(
    `select count(*)::int as n from auth.users u
      left join public.perfis p on p.id = u.id
     where p.id is null`,
    "contas sem perfil",
  );
  afirmar(
    "nenhuma Conta existe sem o perfil correspondente",
    !semPerfil.falhou && (semPerfil.linha?.n ?? 0) === 0,
    `contas sem perfil: ${semPerfil.linha?.n ?? "?"}`,
  );
}

/* ─── (e) Schema do conteúdo do blog (Story 2.1) ─────────────────────────── */

secao("(e) schema do conteúdo do blog");

/** As tabelas do módulo, na ordem em que a migração as cria. */
const TABELAS_CONTEUDO = [
  "categorias",
  "posts",
  "tags",
  "posts_tags",
  "slugs_antigos",
];

/** As tabelas com coluna `slug`, que é chave de URL pública. */
const TABELAS_COM_SLUG = ["posts", "categorias", "tags", "slugs_antigos"];

if (!temToken) {
  // Sem `else`, as ~50 asserções desta seção sumiriam em silêncio quando o
  // token faltasse — que é exatamente o defeito que a Story 1.1 corrigiu.
  afirmar(
    "o schema do conteúdo pôde ser inspecionado",
    false,
    "sem SUPABASE_ACCESS_TOKEN não há como olhar o projeto — a asserção falha como ausente, nunca é pulada",
  );
} else {
  /* — As tabelas existem, com RLS — */

  const tabelas = await uma(
    `select coalesce(string_agg(c.relname || ':' || c.relrowsecurity, ',' order by c.relname), '') as t
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname in (${TABELAS_CONTEUDO.map(literal).join(", ")})`,
    "tabelas do conteúdo",
  );
  const estadoDasTabelas = new Map(
    (tabelas.linha?.t ?? "")
      .split(",")
      .filter(Boolean)
      .map((par) => par.split(":")),
  );
  for (const t of TABELAS_CONTEUDO) {
    afirmar(
      `public.${t} existe no projeto remoto`,
      !tabelas.falhou && estadoDasTabelas.has(t),
      tabelas.erro ?? "tabela não encontrada",
    );
    afirmar(
      `public.${t} tem RLS habilitada`,
      estadoDasTabelas.get(t) === "true",
      `encontrado: ${estadoDasTabelas.get(t) ?? "—"}`,
    );
  }

  /* — O enum é a mesma lista do código, na mesma grafia — */
  //
  // Este é o ponto onde banco e código podem divergir em silêncio: um quinto
  // Estado no código sem migração, ou um rótulo renomeado só de um lado,
  // produz uma pílula em branco na tela ou uma escrita recusada pelo banco.
  // A lista NÃO é reescrita aqui — ela é importada de `domain/blog`.

  const enumEstado = await uma(
    `select coalesce(string_agg(e.enumlabel, ',' order by e.enumsortorder), '') as v
       from pg_enum e
       join pg_type t on t.oid = e.enumtypid
       join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typname = 'estado_post'`,
    "valores do enum de estado",
  );
  afirmar(
    "o enum de estado do banco é exatamente ESTADOS de src/domain/blog/estados.js",
    !enumEstado.falhou && (enumEstado.linha?.v ?? "") === ESTADOS.join(","),
    `banco: ${enumEstado.linha?.v || "—"} | código: ${ESTADOS.join(",")}`,
  );

  /* — Os tipos e o padrão das colunas que a story fixa — */

  const colunasPosts = await uma(
    `select column_name as nome, data_type as tipo, udt_name as udt,
            coalesce(column_default, '') as padrao
       from information_schema.columns
      where table_schema = 'public' and table_name = 'posts'`,
    "colunas de public.posts",
  );
  const tipoDe = new Map(
    (colunasPosts.linhas ?? []).map((c) => [c.nome, `${c.tipo}|${c.udt}`]),
  );
  const padraoDe = new Map(
    (colunasPosts.linhas ?? []).map((c) => [c.nome, c.padrao]),
  );
  const tiposEsperados = [
    ["id", "uuid|uuid"],
    ["slug", "text|text"],
    ["titulo", "text|text"],
    ["resumo", "text|text"],
    ["conteudo", "jsonb|jsonb"],
    ["conteudo_html", "text|text"],
    ["categoria_id", "uuid|uuid"],
    ["autor_id", "uuid|uuid"],
    ["estado", "USER-DEFINED|estado_post"],
    ["publicado_em", "timestamp with time zone|timestamptz"],
    ["criado_em", "timestamp with time zone|timestamptz"],
    ["atualizado_em", "timestamp with time zone|timestamptz"],
  ];
  for (const [coluna, esperado] of tiposEsperados) {
    afirmar(
      `posts.${coluna} é ${esperado.split("|")[1]}`,
      tipoDe.get(coluna) === esperado,
      `encontrado: ${tipoDe.get(coluna) ?? "coluna ausente"}`,
    );
  }

  // O padrão da coluna é a diferença entre "nasce invisível" e "nasce no ar".
  // Quando a função de escrita da Story 2.5 gravar sem informar o estado — e
  // ela vai, para o rascunho recém-criado —, é este padrão que decide.
  afirmar(
    "posts.estado tem 'rascunho' como padrão da coluna",
    /^'rascunho'::/.test(padraoDe.get("estado") ?? ""),
    `encontrado: ${padraoDe.get("estado") || "sem padrão"}`,
  );

  // Regra geral, não caso particular: instante é sempre `timestamptz`. Uma
  // coluna de data futura criada com `timestamp` sem fuso publicaria três
  // horas antes do combinado, e é exatamente o defeito que esta linha pega
  // antes de ele existir.
  const instantes = await uma(
    `select coalesce(string_agg(table_name || '.' || column_name, ', ' order by table_name, column_name), '') as c
       from information_schema.columns
      where table_schema = 'public'
        and table_name in (${TABELAS_CONTEUDO.map(literal).join(", ")})
        and (column_name like '%\\_em' or column_name like '%\\_ate')
        and udt_name <> 'timestamptz'`,
    "colunas de instante fora de timestamptz",
  );
  afirmar(
    "toda coluna de instante do módulo é timestamptz",
    !instantes.falhou && (instantes.linha?.c ?? "") === "",
    `fora do tipo: ${instantes.linha?.c || "—"}`,
  );

  /* — Unicidade de slug — */

  const unicos = await uma(
    `select coalesce(string_agg(distinct c.relname, ',' order by c.relname), '') as t
       from pg_index i
       join pg_class c on c.oid = i.indrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and i.indisunique
        and c.relname in (${TABELAS_COM_SLUG.map(literal).join(", ")})
        and pg_get_indexdef(i.indexrelid) like '%(slug)%'`,
    "restrições de unicidade de slug",
  );
  const comSlugUnico = (unicos.linha?.t ?? "").split(",").filter(Boolean);
  for (const t of TABELAS_COM_SLUG) {
    afirmar(
      `public.${t}.slug tem restrição de unicidade`,
      !unicos.falhou && comSlugUnico.includes(t),
      `encontradas em: ${comSlugUnico.join(", ") || "nenhuma"}`,
    );
  }

  /* — As restrições de integridade da segunda migração — */

  const restricoes = await uma(
    `select coalesce(string_agg(conname, ',' order by conname), '') as c
       from pg_constraint
      where connamespace = 'public'::regnamespace and contype = 'c'`,
    "restrições de verificação do módulo",
  );
  const listaRestricoes = (restricoes.linha?.c ?? "").split(",");
  for (const nome of [
    "posts_publicavel_exige_data",
    "posts_titulo_nao_vazio",
    "posts_imagem_exige_alt",
    "posts_conteudo_e_objeto",
    "posts_slug_formato",
    "categorias_slug_formato",
    "tags_slug_formato",
    "slugs_antigos_slug_formato",
  ]) {
    afirmar(
      `restrição ${nome} existe`,
      !restricoes.falhou && listaRestricoes.includes(nome),
      restricoes.erro ?? `encontradas: ${listaRestricoes.length}`,
    );
  }

  /* — Chaves estrangeiras: a ação de exclusão é invariante, não detalhe — */
  //
  // A própria limpeza da seção (f) depende do cascade para não deixar
  // resíduo, e `categoria_id` apagando o Post junto com a Categoria seria
  // perda de conteúdo silenciosa.

  const estrangeiras = await uma(
    // `regclass::text` omite o schema quando ele está no `search_path`, então
    // comparar com 'public.posts' como TEXTO não casa nunca. O casamento é
    // pelo próprio OID.
    `select conname as nome, confdeltype as acao
       from pg_constraint
      where connamespace = 'public'::regnamespace and contype = 'f'
        and conrelid in (
          'public.posts'::regclass,
          'public.posts_tags'::regclass,
          'public.slugs_antigos'::regclass
        )`,
    "chaves estrangeiras do módulo",
  );
  const acaoDe = new Map(
    (estrangeiras.linhas ?? []).map((l) => [l.nome, l.acao]),
  );
  // 'c' = cascade, 'n' = set null.
  for (const [nome, acao, legenda] of [
    ["posts_tags_post_id_fkey", "c", "cascade"],
    ["posts_tags_tag_id_fkey", "c", "cascade"],
    ["slugs_antigos_post_id_fkey", "c", "cascade"],
    /* 'r' = restrict, desde a Story 2.14. Ela nasceu 'n' (set null) na Story
       2.1, e esse era o DEFEITO CENTRAL daquela story: excluir uma Categoria em
       uso desassociava todos os Posts em silêncio, e silêncio é o modo de falha
       que ninguém descobre. Contar Posts na função de servidor produz a
       mensagem útil; o `restrict` é o que faz a recusa valer também para quem
       não passa por ela — o console do projeto, um script, qualquer detentor da
       chave de serviço. */
    ["posts_categoria_id_fkey", "r", "restrict"],
    ["posts_autor_id_fkey", "n", "set null"],
  ]) {
    afirmar(
      `${nome} apaga com "${legenda}"`,
      acaoDe.get(nome) === acao,
      `encontrado: ${acaoDe.get(nome) ?? "chave ausente"}`,
    );
  }

  /* — Unicidade de NOME de Categoria (Story 2.14) — */
  //
  // `categorias_slug_unico` existe desde a Story 2.1; unicidade de nome não.
  // Sem ela, duas Categorias com o mesmo nome e endereços diferentes conviveriam
  // e o menu do Editor ofereceria as duas como se fossem coisas diferentes. O
  // servidor normaliza antes de gravar; esta restrição vale para quem não passou
  // por ele.
  const nomeUnico = await uma(
    `select coalesce(string_agg(pg_get_indexdef(i.indexrelid), ' | '), '') as d
       from pg_index i
       join pg_class c on c.oid = i.indrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'categorias' and i.indisunique
        and pg_get_indexdef(i.indexrelid) like '%(nome)%'`,
    "unicidade de nome de categoria",
  );
  afirmar(
    "public.categorias.nome tem restrição de unicidade",
    !nomeUnico.falhou && (nomeUnico.linha?.d ?? "") !== "",
    nomeUnico.erro ?? "sem ela, duas Categorias com o mesmo nome conviveriam no menu",
  );

  /* — AS SEIS CATEGORIAS, SEMEADAS COM COR E ÍCONE DO VOCABULÁRIO — */
  //
  // Elas moravam em constante no fonte, em três lugares que já divergiam entre
  // si: o filtro público listava CINCO, e "Novidades" não estava nele. A
  // asserção lê o BANCO e compara com as listas FECHADAS do código, importadas
  // — reescrevê-las aqui compararia duas cópias do mesmo engano.
  const semeadas = await uma(
    `select nome, slug, icone, cor, ordem from public.categorias order by ordem, nome`,
    "categorias semeadas",
  );
  const linhasDeCategoria = semeadas.linhas ?? [];
  const enderecosNoBanco = linhasDeCategoria.map((c) => c.slug);
  /* A SEMEADURA DEIXOU MARCA? O endereço sobrevive a um renomear — ele é gerado
     uma vez e não muda sozinho —, então esta é a pergunta que continua válida
     depois de alguém usar a tela nova. */
  const semeadosPresentes = ENDERECOS_SEMEADOS.filter((e) =>
    enderecosNoBanco.includes(e),
  );
  afirmar(
    "a semeadura das seis Categorias deixou marca no banco",
    !semeadas.falhou && semeadosPresentes.length > 0,
    semeadas.erro ?? `endereços no banco: ${enderecosNoBanco.join(", ") || "nenhum"}`,
  );
  afirmar(
    `"Novidades" está no banco — é o defeito em produção que o critério nomeia, e excluí-la o traria de volta`,
    !semeadas.falhou && enderecosNoBanco.includes(ENDERECO_QUE_FALTAVA),
    `endereços no banco: ${enderecosNoBanco.join(", ") || "nenhum"}`,
  );
  const corFora = linhasDeCategoria.filter((c) => !ehCorDeCategoria(c.cor));
  afirmar(
    "toda Categoria do banco tem cor do vocabulário fechado de domain/blog/categorias.js",
    !semeadas.falhou && corFora.length === 0,
    corFora.map((c) => `${c.nome}: ${JSON.stringify(c.cor)}`).join(" | "),
  );
  const iconeFora = linhasDeCategoria.filter(
    (c) => !ehChaveDeIconeDeCategoria(c.icone),
  );
  afirmar(
    "toda Categoria do banco tem ícone do mapa fechado do código",
    !semeadas.falhou && iconeFora.length === 0,
    iconeFora.map((c) => `${c.nome}: ${JSON.stringify(c.icone)}`).join(" | "),
  );

  /* — O índice da ordenação que o Épico 2 usa — */

  const indiceOrdem = await uma(
    `select coalesce(string_agg(pg_get_indexdef(i.indexrelid), ' | '), '') as d
       from pg_index i
       join pg_class c on c.oid = i.indrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'posts'
        and pg_get_indexdef(i.indexrelid) ilike '%coalesce%publicado_em%atualizado_em%'`,
    "índice de ordenação da listagem",
  );
  afirmar(
    "existe índice sobre COALESCE(publicado_em, atualizado_em) DESC",
    !indiceOrdem.falhou && (indiceOrdem.linha?.d ?? "") !== "",
    "sem ele a ordenação da listagem é varredura sequencial a cada visita",
  );

  /* — Os gatilhos, pela DEFINIÇÃO e não só pelo nome — */
  //
  // "existe um gatilho chamado assim" é o que a asserção fraca dizia. Um
  // gatilho `after update` chamando outra função passaria igual, e
  // `atualizado_em` congelaria. A prova comportamental está na seção (f); esta
  // fixa a forma.

  const definicoes = await uma(
    `select t.tgname as nome, pg_get_triggerdef(t.oid) as def
       from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and not t.tgisinternal
        and c.relname in ('posts', 'categorias', 'slugs_antigos')`,
    "definições dos gatilhos do conteúdo",
  );
  const defDe = new Map((definicoes.linhas ?? []).map((l) => [l.nome, l.def]));
  // `public.` é opcional no nome da função porque `pg_get_triggerdef` omite o
  // schema que está no `search_path` — o que a asserção precisa fixar é o
  // momento (BEFORE), o alcance (FOR EACH ROW) e QUAL função é chamada.
  for (const [nome, padrao] of [
    [
      "posts_tocar_atualizado_em",
      /BEFORE UPDATE ON public\.posts FOR EACH ROW EXECUTE FUNCTION (?:public\.)?tocar_atualizado_em\(\)/i,
    ],
    [
      "categorias_tocar_atualizado_em",
      /BEFORE UPDATE ON public\.categorias FOR EACH ROW EXECUTE FUNCTION (?:public\.)?tocar_atualizado_em\(\)/i,
    ],
    [
      "posts_exigir_slug_livre",
      /BEFORE INSERT OR UPDATE OF slug ON public\.posts FOR EACH ROW EXECUTE FUNCTION (?:public\.)?exigir_slug_livre\(\)/i,
    ],
    [
      "slugs_antigos_exigir_slug_livre",
      /BEFORE INSERT OR UPDATE OF slug ON public\.slugs_antigos FOR EACH ROW EXECUTE FUNCTION (?:public\.)?exigir_slug_livre\(\)/i,
    ],
  ]) {
    afirmar(
      `${nome} é "before", "for each row" e chama a função certa`,
      padrao.test(defDe.get(nome) ?? ""),
      `encontrado: ${defDe.get(nome) ?? "gatilho ausente"}`,
    );
  }

  /* — Privilégio: o segundo cadeado, nas cinco tabelas, três papéis — */
  //
  // `public` entra na conta porque privilégio concedido ao pseudo-papel é
  // herdado por `anon` e `authenticated`: revogar dos dois e esquecer dele
  // deixaria a porta aberta por herança.

  const privilegiosConteudo = await uma(
    `select t.tabela,
            has_table_privilege('anon', 'public.' || t.tabela, 'select') as anon_le,
            has_table_privilege('authenticated', 'public.' || t.tabela, 'select') as auth_le,
            (has_table_privilege('anon', 'public.' || t.tabela, 'insert')
             or has_table_privilege('anon', 'public.' || t.tabela, 'update')
             or has_table_privilege('anon', 'public.' || t.tabela, 'delete')
             or has_table_privilege('anon', 'public.' || t.tabela, 'truncate')) as anon_escreve,
            (has_table_privilege('authenticated', 'public.' || t.tabela, 'insert')
             or has_table_privilege('authenticated', 'public.' || t.tabela, 'update')
             or has_table_privilege('authenticated', 'public.' || t.tabela, 'delete')
             or has_table_privilege('authenticated', 'public.' || t.tabela, 'truncate')) as auth_escreve,
            (select bool_or(privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'))
               from information_schema.table_privileges
              where table_schema = 'public' and table_name = t.tabela and grantee = 'PUBLIC') as publico_escreve
       from (values ${TABELAS_CONTEUDO.map((t) => `(${literal(t)})`).join(", ")}) as t(tabela)`,
    "privilégios das tabelas do conteúdo",
  );
  const porTabela = new Map(
    (privilegiosConteudo.linhas ?? []).map((l) => [l.tabela, l]),
  );
  for (const t of TABELAS_CONTEUDO) {
    const p = porTabela.get(t);
    afirmar(
      `anon e authenticated leem public.${t}`,
      p?.anon_le === true && p?.auth_le === true,
      `anon: ${p?.anon_le ?? "—"} | authenticated: ${p?.auth_le ?? "—"}`,
    );
    afirmar(
      `nenhum papel de cliente tem privilégio de escrita em public.${t}`,
      p?.anon_escreve === false &&
        p?.auth_escreve === false &&
        p?.publico_escreve !== true,
      `anon: ${p?.anon_escreve ?? "—"} | authenticated: ${p?.auth_escreve ?? "—"} | PUBLIC: ${p?.publico_escreve ?? "nenhum"}`,
    );
  }

  /* — As funções de gatilho saíram da API pública — */

  const execucao = await uma(
    `select p.proname as nome,
            has_function_privilege('anon', p.oid, 'execute') as anon,
            has_function_privilege('authenticated', p.oid, 'execute') as auth
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('criar_perfil_da_conta', 'tocar_atualizado_em', 'exigir_slug_livre')`,
    "privilégio de execução das funções de gatilho",
  );
  const executaveis = (execucao.linhas ?? []).filter(
    (f) => f.anon === true || f.auth === true,
  );
  afirmar(
    "nenhuma função de gatilho é executável por anon ou authenticated",
    !execucao.falhou &&
      (execucao.linhas ?? []).length === 3 &&
      executaveis.length === 0,
    executaveis.map((f) => f.nome).join(", ") ||
      `funções encontradas: ${(execucao.linhas ?? []).length}`,
  );

  /* — A busca da Story 2.11: o objeto novo, sob as mesmas regras — */
  //
  // O risco desta função é específico e vale nomear: uma busca que alcança
  // Categoria e Tags precisa de junção, e a tentação é resolvê-la com
  // `security definer` — que executaria com os privilégios de quem criou a
  // função e faria a RLS da Story 2.1 deixar de valer para quem chama. Seria
  // um segundo caminho de leitura ao lado da política. `prosecdef` é onde essa
  // troca apareceria, e é por isso que ela é lida do REMOTO, e não do arquivo.

  const FUNCOES_DA_BUSCA = [
    "normalizar_busca",
    "buscar_posts_do_painel",
    // A busca do Blog Público (Story 2.15). Ela nasce sob as MESMAS regras —
    // `invoker`, `search_path` fixo — e a diferença que importa está no que
    // cada uma aceita e em quem pode chamá-la, afirmado logo abaixo.
    "buscar_posts_publicos",
  ];
  const busca = await uma(
    `select p.proname as nome,
            p.prosecdef as definer,
            p.provolatile as volatilidade,
            coalesce(array_to_string(p.proconfig, ','), '') as cfg,
            coalesce(array_to_string(p.proargnames, ','), '') as argumentos,
            has_function_privilege('anon', p.oid, 'execute') as anon,
            has_function_privilege('authenticated', p.oid, 'execute') as auth
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (${FUNCOES_DA_BUSCA.map(literal).join(", ")})`,
    "as funções da busca de posts",
  );
  const porNome = new Map((busca.linhas ?? []).map((f) => [f.nome, f]));
  afirmar(
    `as ${FUNCOES_DA_BUSCA.length} funções da busca existem em public`,
    !busca.falhou && FUNCOES_DA_BUSCA.every((n) => porNome.has(n)),
    `encontradas: ${[...porNome.keys()].join(", ") || "nenhuma"}`,
  );
  afirmar(
    "a busca é `security invoker` — a RLS continua sendo a única guardiã da visibilidade",
    FUNCOES_DA_BUSCA.every((n) => porNome.get(n)?.definer === false),
    FUNCOES_DA_BUSCA.map((n) => `${n}: definer=${porNome.get(n)?.definer ?? "—"}`).join(" | "),
  );
  FUNCOES_DA_BUSCA.forEach((n) =>
    afirmar(
      `${n} fixa search_path`,
      /search_path=/.test(porNome.get(n)?.cfg ?? ""),
      `proconfig: ${porNome.get(n)?.cfg || "vazio"}`,
    ),
  );
  // `i` é IMMUTABLE. É a resposta explícita à armadilha registrada na Story
  // 2.1: `unaccent(text)` é STABLE e o Postgres recusa índice de expressão
  // sobre ela; o invólucro fixa o dicionário e por isso pode ser imutável.
  // Perder essa marca fecharia de novo a porta que a migração abriu.
  afirmar(
    "`normalizar_busca` é IMMUTABLE — é ela que resolve o `unaccent` STABLE",
    porNome.get("normalizar_busca")?.volatilidade === "i",
    `volatilidade: ${porNome.get("normalizar_busca")?.volatilidade ?? "—"}`,
  );
  // ★ A DISTINÇÃO QUE A STORY 2.15 EXISTE PARA PRESERVAR ★
  //
  // O site passou a buscar de verdade, e a tentação era conceder a `anon` a
  // função do PAINEL. Ela aceita `p_estados` — filtro por Estado —, que é
  // exatamente o parâmetro que não pode existir do lado de fora. O que nasceu
  // foi função própria; a do Painel continua revogada de `anon`, e é isto que
  // esta asserção guarda.
  afirmar(
    "só `authenticated` executa a busca do Painel; `anon` não",
    porNome.get("buscar_posts_do_painel")?.auth === true &&
      porNome.get("buscar_posts_do_painel")?.anon === false,
    `authenticated: ${porNome.get("buscar_posts_do_painel")?.auth ?? "—"} | anon: ${porNome.get("buscar_posts_do_painel")?.anon ?? "—"}`,
  );
  afirmar(
    "a busca PÚBLICA é executável por `anon` — é ela o caminho do site, e sem isso o blog não busca",
    porNome.get("buscar_posts_publicos")?.anon === true &&
      porNome.get("buscar_posts_publicos")?.auth === true,
    `anon: ${porNome.get("buscar_posts_publicos")?.anon ?? "—"} | authenticated: ${porNome.get("buscar_posts_publicos")?.auth ?? "—"}`,
  );
  // O parâmetro é lido do REMOTO, e não do arquivo: é onde um `p_estados`
  // acrescentado depois apareceria. A busca pública recebe SÓ o que o visitante
  // pode pedir — um termo e uma Categoria —, e conceder-lhe filtro de Estado
  // seria dar ao mundo a pergunta "o que existe fora do ar?".
  {
    const argumentos = String(porNome.get("buscar_posts_publicos")?.argumentos ?? "")
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a !== "");
    afirmar(
      "a busca pública recebe só termo e Categoria — nenhum filtro de Estado, nem hoje nem por acréscimo",
      argumentos.length === 2 &&
        argumentos.includes("p_termo") &&
        argumentos.includes("p_categoria_id") &&
        !argumentos.some((a) => /estado/i.test(a)),
      `argumentos: ${argumentos.join(", ") || "nenhum"}`,
    );
    // …e a do Painel continua com o dela: sem esta linha, a asserção acima
    // passaria num mundo em que as duas funções trocaram de papel.
    const doPainel = String(porNome.get("buscar_posts_do_painel")?.argumentos ?? "");
    afirmar(
      "e é a do PAINEL que tem `p_estados` — as duas não trocaram de papel",
      /\bp_estados\b/.test(doPainel),
      `argumentos: ${doPainel || "nenhum"}`,
    );
  }
  // `normalizar_busca` PRECISA ser executável pelos dois papéis, e a razão é a
  // mesma que torna as duas buscas seguras: uma função `security invoker`
  // executa com o papel de quem chamou, então quem paga o privilégio da chamada
  // interna é o chamador. Revogá-la de `authenticated` derrubou a busca do
  // Painel inteira com 42501 — foi medido, e é o que a migração
  // 20260818140000 registra —, e o mesmo valeria para `anon` na busca pública.
  //
  // A alternativa seria `security definer`, e ela é PIOR: apagaria o problema
  // junto com a garantia, porque a RLS deixaria de valer para quem chama. O que
  // guarda a fronteira aqui é a asserção acima — a do Painel segue fora do
  // alcance de `anon` —, e não a revogação desta peça, que recebe texto,
  // devolve texto e não decide nada.
  afirmar(
    "`normalizar_busca` é executável por anon E por authenticated — consequência de as DUAS buscas serem `security invoker`, e não afrouxamento: quem paga o privilégio da chamada interna é o chamador, revogar derruba a busca com 42501, e `security definer` (a outra saída) apagaria a política junto com o problema",
    porNome.get("normalizar_busca")?.auth === true &&
      porNome.get("normalizar_busca")?.anon === true,
    `anon: ${porNome.get("normalizar_busca")?.anon ?? "—"} | authenticated: ${porNome.get("normalizar_busca")?.auth ?? "—"}`,
  );

  /* — As funções da ENTREGA: `definer` de propósito, e concedidas UMA A UMA (Story 4.2) — */
  //
  // A busca acima é `invoker` e a asserção cobra isso. Estas são o oposto, e
  // a diferença é deliberada: distinguir Post arquivado de endereço que nunca
  // existiu exige ver um bit que a política de leitura anônima esconde. Duas
  // famílias com regras opostas no mesmo arquivo pedem que cada uma seja
  // afirmada pelo que ELA é — senão a próxima pessoa copia a regra errada.
  //
  // `security definer` roda com os privilégios de quem criou a função, então
  // CONCEDER EXECUÇÃO É A DECISÃO INTEIRA. Por isso o que se mede é o
  // privilégio no REMOTO, e não o `grant` escrito no arquivo: o arquivo diz o
  // que alguém quis, o catálogo diz o que vale.

  const FUNCOES_DA_ENTREGA_NO_BANCO = [
    "situacao_do_endereco",
    "posts_no_ar",
    "proxima_publicacao",
  ];
  const entregaNoBanco = await uma(
    `select p.proname as nome,
            p.prosecdef as definer,
            p.provolatile as volatilidade,
            coalesce(array_to_string(p.proconfig, ','), '') as cfg,
            has_function_privilege('anon', p.oid, 'execute') as anon,
            has_function_privilege('authenticated', p.oid, 'execute') as auth,
            p.proacl is null as acl_padrao,
            exists (select 1 from aclexplode(p.proacl) a
                     where a.grantee = 0 and a.privilege_type = 'EXECUTE') as publico,
            coalesce(obj_description(p.oid, 'pg_proc'), '') as comentario
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (${FUNCOES_DA_ENTREGA_NO_BANCO.map(literal).join(", ")})`,
    "as funções da entrega",
  );
  const porFuncao = new Map(
    (entregaNoBanco.linhas ?? []).map((f) => [f.nome, f]),
  );
  afirmar(
    `as ${FUNCOES_DA_ENTREGA_NO_BANCO.length} funções da entrega existem em public`,
    !entregaNoBanco.falhou &&
      FUNCOES_DA_ENTREGA_NO_BANCO.every((n) => porFuncao.has(n)),
    `encontradas: ${[...porFuncao.keys()].join(", ") || "nenhuma"}`,
  );
  /* A LISTA DO BANCO É A DO CÓDIGO. `api/_nucleo/leitura.js` tem uma lista de
     permissão de nomes chamáveis; se as duas divergirem, ou o servidor chama
     o que não existe, ou existe função da família que ninguém está julgando
     aqui. Comparar nos dois sentidos é o que pega o segundo caso. */
  afirmar(
    "a lista de funções chamáveis do servidor é IGUAL à que existe no banco, nos dois sentidos",
    FUNCOES_DA_ENTREGA.length === FUNCOES_DA_ENTREGA_NO_BANCO.length &&
      FUNCOES_DA_ENTREGA.every((n) => FUNCOES_DA_ENTREGA_NO_BANCO.includes(n)) &&
      FUNCOES_DA_ENTREGA_NO_BANCO.every((n) => FUNCOES_DA_ENTREGA.includes(n)),
    `servidor: ${FUNCOES_DA_ENTREGA.join(", ")} | banco: ${FUNCOES_DA_ENTREGA_NO_BANCO.join(", ")}`,
  );
  for (const n of FUNCOES_DA_ENTREGA_NO_BANCO) {
    const f = porFuncao.get(n);
    afirmar(
      `${n} é \`security definer\` — é o que lhe permite ver o bit que a política esconde, e está declarado`,
      f?.definer === true,
      `definer: ${f?.definer ?? "—"}`,
    );
    afirmar(
      `${n} fixa search_path — sem isso \`definer\` executa contra o schema que o chamador escolher`,
      /search_path=/.test(f?.cfg ?? ""),
      `proconfig: ${f?.cfg || "vazio"}`,
    );
    /* `s` é STABLE. Uma função da entrega marcada VOLATILE perde otimização e,
       pior, sinaliza que ela escreve — numa família cujo ponto é só ler. */
    afirmar(
      `${n} é STABLE — a entrega só lê, e a marca é o que diz isso ao planejador`,
      f?.volatilidade === "s",
      `volatilidade: ${f?.volatilidade ?? "—"}`,
    );
    afirmar(
      `${n} é executável por anon E por authenticated — a entrega serve os dois pelo mesmo caminho`,
      f?.anon === true && f?.auth === true,
      `anon: ${f?.anon ?? "—"} | authenticated: ${f?.auth ?? "—"}`,
    );
    /* ★ A REVOGAÇÃO DE `public` ★ — e `proacl` nulo conta como concedida.
       Uma função nasce com EXECUTE para PUBLIC e `proacl` NULO; só o primeiro
       `grant` ou `revoke` materializa a lista. Conferir apenas a lista
       materializada passaria justamente no caso em que ninguém revogou nada. */
    afirmar(
      `${n} NÃO é executável por \`public\` — concessão a public daria execução a qualquer papel futuro sem ninguém decidir`,
      f?.acl_padrao === false && f?.publico === false,
      f?.acl_padrao === true ? "proacl nulo: EXECUTE para PUBLIC pelo padrão, ninguém revogou" : `public: ${f?.publico ?? "—"}`,
    );
    /* O comentário é o único lugar onde o PORQUÊ de `definer` sobrevive a um
       `\\df+` no console do banco, longe do repositório. */
    afirmar(
      `${n} traz comentário no banco explicando o que devolve`,
      (f?.comentario ?? "").length > 80,
      `${(f?.comentario ?? "").length} caractere(s)`,
    );
  }

  /* — Nenhuma política de escrita no remoto, nas cinco tabelas — */

  const politicasConteudo = await uma(
    `select coalesce(string_agg(tablename || ':' || policyname || ':' || cmd || ':' || array_to_string(roles, '+'), ' | ' order by tablename, policyname), '') as p
       from pg_policies
      where schemaname = 'public'
        and tablename in (${TABELAS_CONTEUDO.map(literal).join(", ")})`,
    "políticas das tabelas do conteúdo",
  );
  const listaConteudo = politicasConteudo.linha?.p ?? "";
  afirmar(
    "nenhuma política de escrita para papel de cliente nas tabelas do conteúdo",
    !politicasConteudo.falhou &&
      !/:(INSERT|UPDATE|DELETE|ALL):(?=[^|]*\b(anon|authenticated|public)\b)/i.test(
        listaConteudo,
      ),
    `políticas: ${listaConteudo || "nenhuma"}`,
  );

  // As dez políticas de leitura precisam EXISTIR. Apagar uma
  // `*_leitura_autenticada` deixaria o Painel abrindo vazio sem nada falhar —
  // a prova comportamental delas está na seção (f), com sessão real.
  for (const t of TABELAS_CONTEUDO) {
    for (const papel of ["anonima", "autenticada"]) {
      afirmar(
        `política ${t}_leitura_${papel} existe`,
        listaConteudo.includes(`${t}:${t}_leitura_${papel}:SELECT:`),
        `políticas: ${listaConteudo || "nenhuma"}`,
      );
    }
  }

  /* — A política de leitura anônima é EXATAMENTE a do critério de aceite — */
  //
  // Ler o texto da política não prova que o banco a aplica — isso é a seção
  // (f). Mas a forma importa por outro motivo: é aqui que a regressão
  // silenciosa aconteceria, alguém "simplificando" para `estado =
  // 'publicado'` por ler o `agendado` como redundância. Sem `agendado` na
  // política, o agendamento inteiro para de funcionar.

  const politicaAnonima = await uma(
    `select coalesce(qual, '') as qual from pg_policies
      where schemaname = 'public' and tablename = 'posts'
        and policyname = 'posts_leitura_anonima'`,
    "expressão da política de leitura anônima",
  );
  const qual = (politicaAnonima.linha?.qual ?? "")
    .replace(/::estado_post/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
  afirmar(
    "a política anônima de posts inclui 'agendado' — é ela que publica",
    qual.includes("'agendado'"),
    `expressão: ${qual || "política ausente"}`,
  );
  afirmar(
    "a política anônima de posts inclui 'publicado'",
    qual.includes("'publicado'"),
    `expressão: ${qual || "política ausente"}`,
  );
  afirmar(
    "a política anônima de posts compara publicado_em com now()",
    /publicado_em <= now\(\)/.test(qual),
    `expressão: ${qual || "política ausente"}`,
  );
  afirmar(
    "a política anônima de posts não menciona rascunho nem arquivado",
    !qual.includes("'rascunho'") && !qual.includes("'arquivado'"),
    `expressão: ${qual || "política ausente"}`,
  );

  /* — `unaccent`: habilitada, NO SCHEMA CERTO, e utilizável — */
  //
  // `create extension if not exists … with schema extensions` é no-op quando a
  // extensão já existe em OUTRO schema. Contar linhas em `pg_extension`
  // passaria com ela em `public`, que é justamente o cenário do no-op — e aí
  // `extensions.unaccent(...)` não existe e a busca da Story 2.11 quebra.

  const semAcento = await uma(
    `select extensions.unaccent('Ação e Coração') as texto,
            (select coalesce(string_agg(n.nspname, ','), '') from pg_extension e
              join pg_namespace n on n.oid = e.extnamespace
             where e.extname = 'unaccent') as schema`,
    "extensão unaccent",
  );
  afirmar(
    "a extensão unaccent está habilitada no schema `extensions`",
    !semAcento.falhou && semAcento.linha?.schema === "extensions",
    semAcento.erro ?? `schema: ${semAcento.linha?.schema || "não instalada"}`,
  );
  afirmar(
    "unaccent é utilizável: 'Ação e Coração' → 'Acao e Coracao'",
    semAcento.linha?.texto === "Acao e Coracao",
    `encontrado: ${semAcento.linha?.texto ?? "—"}`,
  );
}

/* ─── (f) A visibilidade, provada pelo comportamento ─────────────────────── */
//
// A seção que justifica a story. Tudo acima lê declaração; esta lê
// comportamento: insere um Post em cada situação da matriz e consulta o
// projeto de três posições — sem sessão (o visitante), com sessão real (o
// Painel) e pela Management API (o servidor).

secao("(f) comportamento: visibilidade, escrita e integridade");

/**
 * Chave publicável do ambiente.
 *
 * Lida linha a linha e ancorada: uma regex solta casaria com a linha
 * COMENTADA que documenta a variável, e a chave "lida" seria um pedaço de
 * texto explicativo — que faria toda leitura devolver 401 e toda asserção de
 * negação passar por vacuidade. As aspas são retiradas pelo mesmo motivo.
 */
const chavePublicavel = (() => {
  for (const arquivo of [".env", ".env.example"]) {
    const caminho = path.join(raiz, arquivo);
    if (!existsSync(caminho)) continue;
    for (const linha of readFileSync(caminho, "utf8").split(/\r?\n/)) {
      if (/^\s*#/.test(linha)) continue;
      const m = /^\s*(?:export\s+)?VITE_SUPABASE_PUBLISHABLE_KEY\s*=\s*(.+?)\s*$/.exec(
        linha,
      );
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  }
  return null;
})();

const temChave = afirmar(
  "chave publicável disponível para a prova comportamental",
  Boolean(chavePublicavel),
  "sem ela não há como consultar como o visitante consulta",
);

/** Chamada REST. Sem `Authorization` é o visitante; com, é o Painel. */
async function rest(caminho, opcoes = {}) {
  try {
    const r = await fetch(`${URL_PROJETO}/rest/v1/${caminho}`, {
      ...opcoes,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        apikey: chavePublicavel,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(opcoes.headers ?? {}),
      },
    });
    const corpo = await r.text();
    return { alcancou: true, status: r.status, corpo };
  } catch (erro) {
    return {
      alcancou: false,
      status: 0,
      corpo: "",
      erro: String(erro?.message ?? erro),
    };
  }
}

function comoLista(resposta) {
  try {
    const v = JSON.parse(resposta.corpo);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/* ─── O Storage, exercitado de verdade (Story 3.1) ───────────────────────── */

/**
 * Um PNG de 1x1, em bytes.
 *
 * Ele existe como bytes e não como texto porque é isso que o Storage recebe — e
 * porque a assinatura (`89 50 4E 47 …`) é o que faz o bucket aceitá-lo como
 * `image/png` de verdade. Um "arquivo" de texto com nome `.png` provaria outra
 * coisa.
 */
const PNG_DE_UM_PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** Chamada ao Storage. Sem `Authorization` é o visitante; com, é o Autor. */
async function storage(caminho, opcoes = {}) {
  try {
    const r = await fetch(`${URL_PROJETO}/storage/v1/${caminho}`, {
      ...opcoes,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        apikey: chavePublicavel,
        ...(opcoes.headers ?? {}),
      },
    });
    const corpo = await r.text();
    return { alcancou: true, status: r.status, corpo, tipo: r.headers.get("content-type") ?? "" };
  } catch (erro) {
    return {
      alcancou: false,
      status: 0,
      corpo: "",
      tipo: "",
      erro: String(erro?.message ?? erro),
    };
  }
}

/**
 * O que a seção do Storage afirma, por nome.
 *
 * Existe para que o ramo do 429 possa ADIAR cada uma pelo nome em vez de
 * deixar a seção inteira sumir — e é usada nos DOIS ramos: `provarStorage`
 * afirma a partir desta lista, então uma asserção nova sem entrada aqui é
 * acusada pela última asserção da seção, que compara o que foi dito com o que
 * está declarado. Sem essa comparação, a lista viraria documentação
 * desatualizada e o ramo do 429 voltaria a esconder o que não conhece.
 */
/**
 * As asserções da entrega que dependem da MESMA sessão real (Story 4.2).
 *
 * Existem pela mesma razão que `ASSERCOES_DO_STORAGE`: numa execução com 429
 * elas não seriam impressas, e o relatório não distinguiria isso de "todas
 * passaram". Asserção que some não conta como nada.
 */
const ASSERCOES_DA_ENTREGA_COM_SESSAO = Object.freeze([
  "com SESSÃO real, as funções da entrega respondem EXATAMENTE o mesmo que para o anônimo — `definer` não abre nada a mais para quem entrou",
  "e continuam sem trazer conteúdo para quem tem sessão — a linha do arquivado é a mesma, campo a campo",
]);

const ASSERCOES_DO_STORAGE = Object.freeze([
  "o bucket das imagens existe e é de leitura pública",
  "o teto de tamanho GRAVADO no bucket é o mesmo do vocabulário do domínio",
  "e a lista de espécies do bucket é IGUAL à do domínio, nos dois sentidos",
  "e nenhuma espécie da lista de recusa declarada entrou no bucket",
  "o caminho da prova é um caminho de capa válido pelo vocabulário do domínio",
  "envio ANÔNIMO ao bucket é recusado pela política — não há política de escrita para anon",
  "envio com SESSÃO é aceito — é a política de inserção para authenticated",
  "controle positivo: o visitante ANÔNIMO lê o arquivo pelo endereço público",
  "e o que ele recebe é a IMAGEM, com o tipo que foi enviado",
  "espécie fora do vocabulário é recusada pelo próprio BUCKET, mesmo com sessão válida",
  "e a política NÃO alcança outro balde do projeto — ela está presa ao bucket_id desta story",
  "arquivo que MENTE a espécie atravessa o bucket — quem confere o conteúdo é a tela, e isso está dito",
  "exclusão ANÔNIMA é recusada pela política",
  "e o arquivo continua NO BUCKET depois da tentativa anônima — a recusa não é só o código de status",
  "exclusão com SESSÃO é aceita — é a política de remoção para authenticated, e é ela que limpa a prova",
  "e o arquivo sumiu de verdade do bucket — perguntado ao bucket, não ao cache do endereço público",
  "nenhum arquivo da prova ficou no bucket de produção",
]);

/**
 * As quatro políticas do bucket, provadas por TENTATIVA.
 *
 * O cabeçalho desta ferramenta diz que ler o texto de uma política não prova
 * que o banco a aplica. Vale igual para o Storage — e ali a tentação é maior,
 * porque a política mora numa tabela que ninguém deste projeto criou.
 *
 * A ordem das tentativas é deliberada: **o envio anônimo é tentado ANTES do
 * autenticado**. Se fosse depois, o arquivo já existiria e um conflito de nome
 * seria confundido com a recusa da política — a asserção passaria pela razão
 * errada, que é o modo de falha que este projeto persegue.
 *
 * E há CONTROLE POSITIVO: a mesma credencial anônima que recebe as recusas
 * precisa conseguir LER o arquivo público. Sem isso, uma chave ruim faria as
 * três negações passarem por vacuidade.
 */
async function provarStorage(jwt) {
  secao("(g) o Storage: leitura pública, escrita e exclusão atrás de sessão");

  /* O QUE FOI DITO, para a lista de nomes não virar documentação vencida.
     Toda asserção desta seção passa por aqui, e a última compara o conjunto
     com `ASSERCOES_DO_STORAGE` — a mesma lista que o ramo do 429 adia. Sem a
     comparação, uma asserção nova simplesmente não teria entrada de adiamento
     e voltaria a sumir sem rastro numa execução com limite de taxa. */
  const ditas = [];
  const afirmarNoStorage = (descricao, condicao, detalhe = "") => {
    ditas.push(descricao);
    return afirmar(descricao, condicao, detalhe);
  };

  /* ── O bucket declara o MESMO vocabulário que o código ────────────────── */
  const linha = await executarSql(
    token,
    `select public, file_size_limit,
            coalesce(array_to_string(allowed_mime_types, ','), '') as tipos
       from storage.buckets where id = ${literal(BUCKET_DAS_IMAGENS)}`,
  );
  const bucket = linha.ok ? (linha.dados?.[0] ?? null) : null;
  const tiposDoBucket = String(bucket?.tipos ?? "").split(",").filter(Boolean);

  afirmarNoStorage(
    "o bucket das imagens existe e é de leitura pública",
    bucket !== null && bucket.public === true,
    linha.erro ?? `encontrado: ${JSON.stringify(bucket)}`,
  );
  afirmarNoStorage(
    "o teto de tamanho GRAVADO no bucket é o mesmo do vocabulário do domínio",
    Number(bucket?.file_size_limit) === TAMANHO_MAXIMO_DA_IMAGEM,
    `bucket: ${bucket?.file_size_limit ?? "—"} | domínio: ${TAMANHO_MAXIMO_DA_IMAGEM}`,
  );
  afirmarNoStorage(
    "e a lista de espécies do bucket é IGUAL à do domínio, nos dois sentidos",
    [...tiposDoBucket].sort().join(",") === [...TIPOS_DE_IMAGEM].sort().join(","),
    `bucket: ${tiposDoBucket.join(",") || "—"} | domínio: ${TIPOS_DE_IMAGEM.join(",")}`,
  );
  /* A LISTA DE RECUSA DECLARADA, conferida contra o bucket. Uma lista de
     permissão diz o que passa e não diz o que foi pensado e recusado: sem
     isto, alguém acrescentando SVG "porque é imagem" — o formato que carrega
     script executável — não encontraria nada que discordasse. */
  {
    const entraram = ESPECIES_SEMPRE_RECUSADAS.filter(
      (e) => tiposDoBucket.includes(e.tipo) || TIPOS_DE_IMAGEM.includes(e.tipo),
    );
    afirmarNoStorage(
      "e nenhuma espécie da lista de recusa declarada entrou no bucket",
      ESPECIES_SEMPRE_RECUSADAS.length >= 3 && entraram.length === 0,
      entraram.map((e) => `${e.tipo} (${e.motivo})`).join(" | "),
    );
  }

  const nome = `capas/zzz-verificacao-3-1-${randomUUID()}.png`;
  afirmarNoStorage(
    "o caminho da prova é um caminho de capa válido pelo vocabulário do domínio",
    ehCaminhoDeCapa(nome),
    nome,
  );

  const comoAutor = { Authorization: `Bearer ${jwt}` };
  const alvo = `object/${BUCKET_DAS_IMAGENS}/${nome}`;

  /* Tudo o que a prova cria, para a faxina do fim alcançar mesmo o que uma
     asserção esperava ver recusado. Arquivo de teste esquecido num bucket de
     PRODUÇÃO é o preço de uma regressão que a própria asserção persegue. */
  const criados = [nome];
  const espuria = `capas/zzz-verificacao-3-1-${randomUUID()}.png`;
  const mentirosa = `capas/zzz-verificacao-3-1-${randomUUID()}.png`;

  try {
    /* ── 1. Envio ANÔNIMO: recusado pela política ─────────────────────────
       Primeiro, e por isso: com o arquivo já no bucket, a recusa poderia ser
       conflito de nome em vez de política. */
    const envioAnonimo = await storage(alvo, {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: PNG_DE_UM_PIXEL,
    });
    afirmarNoStorage(
      "envio ANÔNIMO ao bucket é recusado pela política — não há política de escrita para anon",
      envioAnonimo.alcancou && envioAnonimo.status >= 400 && envioAnonimo.status < 500,
      envioAnonimo.erro ?? `HTTP ${envioAnonimo.status} ${envioAnonimo.corpo.slice(0, 200)}`,
    );

    /* ── 2. Envio AUTENTICADO: aceito ─────────────────────────────────── */
    const envio = await storage(alvo, {
      method: "POST",
      headers: { ...comoAutor, "Content-Type": "image/png" },
      body: PNG_DE_UM_PIXEL,
    });
    const enviou = afirmarNoStorage(
      "envio com SESSÃO é aceito — é a política de inserção para authenticated",
      envio.alcancou && envio.status >= 200 && envio.status < 300,
      envio.erro ?? `HTTP ${envio.status} ${envio.corpo.slice(0, 250)}`,
    );

    /* ── 3. Leitura ANÔNIMA do endereço público: permitida ────────────────
       É também o CONTROLE POSITIVO da credencial: sem uma leitura que devolve
       200, as recusas acima e abaixo passariam com uma chave inválida. */
    const publico = await storage(`object/public/${BUCKET_DAS_IMAGENS}/${nome}`);
    afirmarNoStorage(
      "controle positivo: o visitante ANÔNIMO lê o arquivo pelo endereço público",
      enviou && publico.alcancou && publico.status === 200,
      publico.erro ?? `HTTP ${publico.status} ${publico.corpo.slice(0, 120)}`,
    );
    afirmarNoStorage(
      "e o que ele recebe é a IMAGEM, com o tipo que foi enviado",
      publico.status === 200 && publico.tipo.startsWith("image/png"),
      `content-type: ${publico.tipo || "—"}`,
    );

    /* ── 4. Espécie fora do vocabulário: recusada PELO BUCKET ─────────────
       A tela recusa antes da rede, e é lá que a frase diz o que se aceita.
       Esta asserção é a segunda linha: quem não passou pela tela — um script,
       um cliente próprio — esbarra na lista de permissão do próprio bucket.

       O nome entra em `criados` ANTES do envio: se a lista de MIME for
       afrouxada — que é a regressão que esta asserção persegue —, o arquivo
       ENTRA, e sem o registro ele ficaria num bucket de produção. */
    criados.push(espuria);
    const foraDoVocabulario = await storage(`object/${BUCKET_DAS_IMAGENS}/${espuria}`, {
      method: "POST",
      headers: { ...comoAutor, "Content-Type": "application/pdf" },
      body: Buffer.from("%PDF-1.4 nao e imagem"),
    });
    afirmarNoStorage(
      "espécie fora do vocabulário é recusada pelo próprio BUCKET, mesmo com sessão válida",
      foraDoVocabulario.alcancou &&
        foraDoVocabulario.status >= 400 &&
        foraDoVocabulario.status < 500,
      foraDoVocabulario.erro ??
        `HTTP ${foraDoVocabulario.status} ${foraDoVocabulario.corpo.slice(0, 200)}`,
    );

    /* ── 5. A POLÍTICA NÃO ALCANÇA OUTRO BALDE ────────────────────────────
       O predicado `bucket_id = 'imagens-do-blog'` é o que prende as duas
       políticas de escrita a ESTE bucket, e a varredura estática o cobra no
       texto. Aqui ele é cobrado no comportamento: a mesma sessão que acabou de
       enviar não alcança outro balde. O que a asserção prova é que a
       capacidade concedida NÃO é a do projeto inteiro. */
    const outroBalde = await storage(`object/zzz-balde-que-nao-existe/${nome}`, {
      method: "POST",
      headers: { ...comoAutor, "Content-Type": "image/png" },
      body: PNG_DE_UM_PIXEL,
    });
    afirmarNoStorage(
      "e a política NÃO alcança outro balde do projeto — ela está presa ao bucket_id desta story",
      outroBalde.alcancou && outroBalde.status >= 400 && outroBalde.status < 500,
      outroBalde.erro ?? `HTTP ${outroBalde.status} ${outroBalde.corpo.slice(0, 200)}`,
    );

    /* ── 6. O ARQUIVO QUE MENTE A ESPÉCIE ATRAVESSA — e isso é DITO ───────
       O Storage decide a espécie pelo `Content-Type` DECLARADO; ele não olha
       um byte do corpo. Então bytes de PDF sob `image/png` ENTRAM no bucket, e
       a asserção afirma isso em vez de fingir o contrário.

       A linha da matriz — "quem decide é o conteúdo, não o nome" — é uma
       promessa da TELA, e é lá que ela é cumprida: `problemaNoArquivo` lê a
       assinatura antes de qualquer rede, e `verificar:escrita` prova isso
       executando. O que o bucket garante é outra coisa: tamanho e tipo
       DECLARADO. Escrever a fronteira aqui é o que impede alguém de ler a
       recusa de espécie acima como se ela cobrisse o conteúdo.

       Consequência aceita: quem chama o Storage direto, com sessão do Painel,
       consegue guardar um arquivo que não é imagem sob nome de imagem. Ele não
       vira capa de Post nenhum — o endereço só entra em `posts` pela porta
       única — e o `<img>` do site simplesmente não o desenha. */
    criados.push(mentirosa);
    const mentiu = await storage(`object/${BUCKET_DAS_IMAGENS}/${mentirosa}`, {
      method: "POST",
      headers: { ...comoAutor, "Content-Type": "image/png" },
      body: Buffer.from("%PDF-1.4 bytes de PDF sob nome de PNG"),
    });
    afirmarNoStorage(
      "arquivo que MENTE a espécie atravessa o bucket — quem confere o conteúdo é a tela, e isso está dito",
      mentiu.alcancou && mentiu.status >= 200 && mentiu.status < 300,
      mentiu.erro ??
        `HTTP ${mentiu.status} — se o bucket passou a recusar, a fronteira mudou e o comentário acima precisa mudar junto`,
    );

    /* ── 7. Exclusão ANÔNIMA: recusada ───────────────────────────────────
       E o arquivo precisa CONTINUAR LÁ depois dela: "recusou" sem conferir que
       nada saiu seria acreditar no código de status. */
    const exclusaoAnonima = await storage(alvo, { method: "DELETE" });
    afirmarNoStorage(
      "exclusão ANÔNIMA é recusada pela política",
      exclusaoAnonima.alcancou &&
        exclusaoAnonima.status >= 400 &&
        exclusaoAnonima.status < 500,
      exclusaoAnonima.erro ??
        `HTTP ${exclusaoAnonima.status} ${exclusaoAnonima.corpo.slice(0, 200)}`,
    );
    /* A MESMA pergunta, ao mesmo lugar: o objeto continua REGISTRADO no
       bucket. Ela é o controle positivo da asserção de remoção lá embaixo —
       sem ela, "sumiu" passaria num bucket em que o envio nunca chegou. */
    const aindaLa = await executarSql(
      token,
      `select count(*)::int as n from storage.objects
         where bucket_id = ${literal(BUCKET_DAS_IMAGENS)} and name = ${literal(nome)}`,
    );
    afirmarNoStorage(
      "e o arquivo continua NO BUCKET depois da tentativa anônima — a recusa não é só o código de status",
      aindaLa.ok && Number(aindaLa.dados?.[0]?.n) === 1,
      aindaLa.erro ?? `objetos com este nome: ${aindaLa.dados?.[0]?.n}`,
    );
  } finally {
    /* ── 8. Exclusão AUTENTICADA: aceita — e é ela que limpa ────────────── */
    const exclusao = await storage(alvo, { method: "DELETE", headers: comoAutor });
    afirmarNoStorage(
      "exclusão com SESSÃO é aceita — é a política de remoção para authenticated, e é ela que limpa a prova",
      exclusao.alcancou && exclusao.status >= 200 && exclusao.status < 300,
      exclusao.erro ?? `HTTP ${exclusao.status} ${exclusao.corpo.slice(0, 200)}`,
    );

    /* ── E A FAXINA ALCANÇA TUDO O QUE A PROVA CRIOU ─────────────────────
       Inclusive o que uma asserção esperava ver recusado: se a recusa deixar
       de acontecer, o arquivo entrou — e ele não pode ficar num bucket de
       PRODUÇÃO só porque a asserção já gritou. */
    for (const restante of criados) {
      await storage(`object/${BUCKET_DAS_IMAGENS}/${restante}`, {
        method: "DELETE",
        headers: comoAutor,
      });
    }

    const sobraram = await executarSql(
      token,
      `select coalesce(string_agg(name, ', ' order by name), '') as nomes
         from storage.objects
        where bucket_id = ${literal(BUCKET_DAS_IMAGENS)}
          and name like 'capas/zzz-verificacao-%'`,
    );
    afirmarNoStorage(
      "e o arquivo sumiu de verdade do bucket — perguntado ao bucket, não ao cache do endereço público",
      sobraram.ok && !String(sobraram.dados?.[0]?.nomes ?? "").includes(nome),
      sobraram.erro ?? `ainda no bucket: ${sobraram.dados?.[0]?.nomes}`,
    );
    /* A varredura é por PREFIXO, e não pelos nomes desta execução: ela é o que
       encontra o resto de uma execução anterior que morreu no meio. */
    afirmarNoStorage(
      "nenhum arquivo da prova ficou no bucket de produção",
      sobraram.ok && String(sobraram.dados?.[0]?.nomes ?? "") === "",
      sobraram.erro ?? `restos: ${sobraram.dados?.[0]?.nomes}`,
    );

    /* E A LISTA DE NOMES ESTÁ EM DIA. Sem esta comparação, uma asserção nova
       ficaria fora de `ASSERCOES_DO_STORAGE` e voltaria a sumir sem rastro no
       ramo do 429 — que é exatamente o defeito que a lista veio corrigir. */
    const faltando = ditas.filter((d) => !ASSERCOES_DO_STORAGE.includes(d));
    const sobrando = ASSERCOES_DO_STORAGE.filter((d) => !ditas.includes(d));
    afirmar(
      "a lista de asserções do Storage é EXATAMENTE o que a seção afirma — é ela que o ramo do 429 adia",
      faltando.length === 0 && sobrando.length === 0,
      `sem entrada de adiamento: ${faltando.join(" | ") || "nenhuma"} — declaradas e nunca ditas: ${sobrando.join(" | ") || "nenhuma"}`,
    );
  }
}

if (temToken && temChave) {
  /* — Controle positivo da credencial, ANTES de qualquer prova negativa — */
  //
  // 401 é o que o PostgREST responde a privilégio negado E a uma `apikey`
  // inválida, expirada ou lida errada. Sem provar primeiro que a MESMA
  // credencial obtém 200 numa leitura, as quinze asserções de escrita negada
  // passariam idênticas com uma chave lixo — verificando nada.

  const controle = await rest("posts?select=id&limit=1");
  const credencialBoa = afirmar(
    "controle positivo: a chave publicável obtém 200 numa leitura",
    controle.status === 200 && Array.isArray(comoLista(controle)),
    controle.erro ??
      `HTTP ${controle.status} ${controle.corpo.slice(0, 200)} — com a credencial ruim, toda negação abaixo seria vácuo`,
  );

  /* — Varredura de restos, ANTES de semear — */
  //
  // O `finally` cobre asserção que falha e exceção que sobe, mas não cobre o
  // processo sendo MORTO no meio (terminal fechado, cano fechado num `head`,
  // CI cancelado). Nesse caso sobram Posts de teste vivos num projeto de
  // produção — e, quando a Story 2.15 ligar o Blog Público ao banco, isso é
  // conteúdo de teste no ar. O prefixo constante é o que torna o resto
  // ENCONTRÁVEL por uma execução posterior; o nonce distingue execuções
  // simultâneas dentro dele.

  const PREFIXO_TESTE = "zzz-verificacao-2-1-";
  const MARCA_TESTE = `${PREFIXO_TESTE}%`;
  const EMAIL_TESTE = "verificacao.conteudo+%@chatclean.com.br";

  const restos = await executarSql(
    token,
    `with p as (delete from public.posts where slug like ${literal(MARCA_TESTE)} returning 1),
          t as (delete from public.tags where slug like ${literal(MARCA_TESTE)} returning 1),
          c as (delete from public.categorias where slug like ${literal(MARCA_TESTE)} returning 1),
          s as (delete from public.slugs_antigos where slug like ${literal(MARCA_TESTE)} returning 1),
          u as (delete from auth.users where email like ${literal(EMAIL_TESTE)} returning 1)
     select (select count(*) from p) + (select count(*) from t) + (select count(*) from c)
          + (select count(*) from s) + (select count(*) from u) as n`,
  );
  const quantosRestos = restos.ok ? Number(restos.dados?.[0]?.n ?? 0) : -1;
  afirmar(
    "nenhum resto de verificação sobrou de execuções anteriores",
    restos.ok && quantosRestos === 0,
    restos.ok
      ? `${quantosRestos} linha(s) de teste removida(s) agora — uma execução anterior morreu antes da limpeza`
      : (restos.erro ?? ""),
  );

  // `crypto.randomUUID` e não o relógio monotônico: `hrtime.bigint()` tem
  // origem arbitrária por processo e dá a volta, então o módulo não garante o
  // que a limpeza por nonce precisa.
  const nonce = randomUUID();
  const prefixo = `${PREFIXO_TESTE}${nonce}-`;
  const marca = `${prefixo}%`;
  const slug = (sufixo) => `${prefixo}${sufixo}`;

  // Instante tão distante que nenhuma execução interrompida deixa Post
  // visível: os dois casos que PRECISAM aparecer nascem invisíveis e só se
  // tornam públicos dentro da janela estreita do teste de leitura.
  const LONGE = "now() + interval '100 years'";

  const emailTemp = `verificacao.conteudo+${nonce}@chatclean.com.br`;
  const nomeTemp = "Conta Temporária do Conteúdo";
  const senhaTemp = `Vf-${nonce.slice(0, 8)}-${Math.random().toString(36).slice(2, 10)}!aZ9`;
  // A senha é interpolada em SQL: erro de Postgres ecoa o comando que falhou.
  registrarSegredo(senhaTemp);

  let limpeza = null;
  try {
    /* — Semear a matriz inteira, numa transação, TODA INVISÍVEL — */

    const semeadura = await executarSql(
      token,
      `insert into public.categorias (slug, nome, icone, cor, ordem) values
         (${literal(slug("categoria"))}, 'Categoria de verificação', 'etiqueta', 'var(--categoria-cinza-bg)', 99);

       insert into public.posts (slug, titulo, estado, publicado_em, categoria_id)
       select v.slug, v.titulo, v.estado::public.estado_post, v.publicado_em, c.id
         from (values
           (${literal(slug("publicado"))}, 'Publicado', 'publicado', ${LONGE}),
           (${literal(slug("agendado-passado"))}, 'Agendado cuja hora chegou', 'agendado', ${LONGE}),
           (${literal(slug("agendado-futuro"))}, 'Agendado cuja hora não chegou', 'agendado', now() + interval '7 days'),
           (${literal(slug("publicado-futuro"))}, 'Publicado com data futura', 'publicado', now() + interval '30 days'),
           (${literal(slug("rascunho"))}, 'Rascunho', 'rascunho', null),
           (${literal(slug("arquivado"))}, 'Arquivado', 'arquivado', now() - interval '1 day')
         ) as v(slug, titulo, estado, publicado_em)
         cross join public.categorias c
        where c.slug = ${literal(slug("categoria"))};

       insert into public.tags (slug, nome) values
         (${literal(slug("tag-visivel"))}, 'Tag do visível'),
         (${literal(slug("tag-oculta"))}, 'Tag do rascunho');

       insert into public.posts_tags (post_id, tag_id)
       select p.id, t.id from public.posts p, public.tags t
        where p.slug = ${literal(slug("publicado"))} and t.slug = ${literal(slug("tag-visivel"))};

       insert into public.posts_tags (post_id, tag_id)
       select p.id, t.id from public.posts p, public.tags t
        where p.slug = ${literal(slug("rascunho"))} and t.slug = ${literal(slug("tag-oculta"))};

       insert into public.slugs_antigos (slug, post_id)
       select ${literal(slug("antigo-do-visivel"))}, p.id from public.posts p
        where p.slug = ${literal(slug("publicado"))};

       insert into public.slugs_antigos (slug, post_id)
       select ${literal(slug("antigo-do-rascunho"))}, p.id from public.posts p
        where p.slug = ${literal(slug("rascunho"))};`,
    );
    const semeou = afirmar(
      "a matriz de visibilidade foi semeada no projeto",
      semeadura.ok,
      semeadura.erro ?? "",
    );

    if (semeou) {
      const ids = await uma(
        `select slug, id::text as id from public.posts where slug like ${literal(marca)}`,
        "identificadores dos posts semeados",
      );
      const idDe = new Map((ids.linhas ?? []).map((l) => [l.slug, l.id]));
      const idVisivel = idDe.get(slug("publicado")) ?? ZERO_UUID;

      /* ── A janela: os dois casos visíveis passam a ser visíveis ───────── */
      //
      // Fora dela, mesmo um processo morto deixa apenas Posts com data em
      // 2126 — invisíveis pela própria política que a story cria.

      let leitura = { status: 0, corpo: "" };
      let voltaram = [];
      try {
        const abrir = await executarSql(
          token,
          `update public.posts set publicado_em = now() - interval '1 day'
            where slug = ${literal(slug("publicado"))};
           update public.posts set publicado_em = now() - interval '1 hour'
            where slug = ${literal(slug("agendado-passado"))};`,
        );
        afirmar(
          "a janela de visibilidade foi aberta",
          abrir.ok,
          abrir.erro ?? "",
        );

        /* — A leitura anônima: exatamente quais voltam — */

        leitura = await rest(`posts?select=slug&slug=like.${prefixo}*&order=slug`);
        voltaram = (comoLista(leitura) ?? []).map((l) => l.slug).sort();
        const esperado = [slug("agendado-passado"), slug("publicado")].sort();

        afirmar(
          "a leitura anônima de posts respondeu 200",
          leitura.status === 200,
          leitura.erro ?? `HTTP ${leitura.status} ${leitura.corpo.slice(0, 200)}`,
        );
        afirmar(
          "leitura anônima devolve EXATAMENTE o publicado com data passada e o agendado cuja hora chegou",
          voltaram.length === esperado.length &&
            voltaram.every((s, i) => s === esperado[i]),
          `voltaram: ${voltaram.map((s) => s.slice(prefixo.length)).join(", ") || "nenhum"}`,
        );

        // Cada linha da matriz, nomeada — para a falha dizer QUAL caso
        // quebrou, não só que o conjunto divergiu.
        const casos = [
          ["publicado", true, "post publicado com data no passado é retornado"],
          [
            "agendado-passado",
            true,
            "post AGENDADO cuja hora chegou é retornado — a publicação autônoma",
          ],
          [
            "agendado-futuro",
            false,
            "post agendado cuja hora não chegou não é retornado",
          ],
          [
            "publicado-futuro",
            false,
            "post PUBLICADO com data futura não é retornado (o erro de operação mais provável no Painel)",
          ],
          ["rascunho", false, "rascunho não é retornado"],
          [
            "arquivado",
            false,
            "arquivado com data no passado não é retornado — o estado decide, não a data",
          ],
        ];
        for (const [sufixo, deveVoltar, descricao] of casos) {
          const veio = voltaram.includes(slug(sufixo));
          afirmar(descricao, veio === deveVoltar, `voltou: ${veio}`);
        }

        /* — Rascunho não vem nem pelo identificador direto — */

        const idRascunho = idDe.get(slug("rascunho"));
        afirmar(
          "o identificador do rascunho foi obtido para o teste direto",
          Boolean(idRascunho),
          `slugs semeados: ${[...idDe.keys()].length}`,
        );
        if (idRascunho) {
          const direto = await rest(`posts?select=id,titulo&id=eq.${idRascunho}`);
          const linhasDiretas = comoLista(direto);
          afirmar(
            "rascunho não volta nem pela consulta anônima ao identificador direto",
            direto.status === 200 &&
              Array.isArray(linhasDiretas) &&
              linhasDiretas.length === 0,
            `HTTP ${direto.status} ${direto.corpo.slice(0, 200)}`,
          );
          const porSlug = await rest(
            `posts?select=id,titulo&slug=eq.${slug("rascunho")}`,
          );
          const linhasPorSlug = comoLista(porSlug);
          afirmar(
            "rascunho não volta pela consulta anônima ao slug exato",
            porSlug.status === 200 &&
              Array.isArray(linhasPorSlug) &&
              linhasPorSlug.length === 0,
            `HTTP ${porSlug.status} ${porSlug.corpo.slice(0, 200)}`,
          );
        }

        /* — Categoria: o vocabulário público que o filtro do blog precisa — */
        //
        // Sem uma leitura POSITIVA, trocar a política de `categorias` por
        // `using (false)` deixaria tudo verde e o Blog Público abrindo com o
        // filtro vazio.

        const categorias = await rest(
          `categorias?select=slug,nome,icone,cor&slug=eq.${slug("categoria")}`,
        );
        const listaCategorias = comoLista(categorias) ?? [];
        afirmar(
          "leitura anônima de categorias devolve a linha semeada",
          categorias.status === 200 &&
            listaCategorias[0]?.slug === slug("categoria"),
          `HTTP ${categorias.status} ${categorias.corpo.slice(0, 200)}`,
        );

        /* — Tags: a visível volta; a do rascunho não existe para o anônimo — */
        //
        // Pela PRÓPRIA tabela, não só pela associação: era por `GET /tags` que
        // o nome da tag de um rascunho vazava.

        const tagsAnon = await rest(`tags?select=slug,nome&slug=like.${prefixo}*`);
        const slugsTags = (comoLista(tagsAnon) ?? []).map((l) => l.slug);
        afirmar(
          "leitura anônima de tags devolve a tag do post visível",
          tagsAnon.status === 200 && slugsTags.includes(slug("tag-visivel")),
          `HTTP ${tagsAnon.status} ${tagsAnon.corpo.slice(0, 200)}`,
        );
        afirmar(
          "a tag de um rascunho NÃO aparece em GET /tags",
          !slugsTags.includes(slug("tag-oculta")),
          `voltaram: ${slugsTags.map((s) => s.slice(prefixo.length)).join(", ") || "nenhuma"}`,
        );

        /* — A associação, com `!inner` para o filtro filtrar de verdade — */

        const assoc = await rest(
          `posts_tags?select=post_id,tags!inner(slug)&tags.slug=like.${prefixo}*`,
        );
        const linhasAssoc = comoLista(assoc) ?? [];
        afirmar(
          "a associação do post visível volta para quem não tem sessão",
          assoc.status === 200 &&
            linhasAssoc.some((l) => l.tags?.slug === slug("tag-visivel")),
          `HTTP ${assoc.status} ${assoc.corpo.slice(0, 250)}`,
        );
        afirmar(
          "a associação de um rascunho não vaza",
          !linhasAssoc.some((l) => l.tags?.slug === slug("tag-oculta")),
          assoc.corpo.slice(0, 250),
        );

        /* — Slugs aposentados: mesma derivação, mesmos dois sentidos — */

        const antigos = await rest(
          `slugs_antigos?select=slug&slug=like.${prefixo}*&order=slug`,
        );
        const slugsAntigos = (comoLista(antigos) ?? []).map((l) => l.slug);
        afirmar(
          "slug aposentado de post visível é legível por quem não tem sessão",
          antigos.status === 200 &&
            slugsAntigos.includes(slug("antigo-do-visivel")),
          `HTTP ${antigos.status} ${antigos.corpo.slice(0, 200)}`,
        );
        afirmar(
          "slug aposentado de rascunho não vaza",
          !slugsAntigos.includes(slug("antigo-do-rascunho")),
          slugsAntigos.join(", ") || "nenhum",
        );

        /* ── As três funções da ENTREGA, dirigidas de verdade (Story 4.2) ── */
        //
        // Ler o texto da migração provaria que alguém escreveu o cadeado, não
        // que ele fecha. O que segue CHAMA as três funções pelo papel anônimo,
        // com a janela aberta, contra a matriz que já está semeada — a mesma
        // que a política acabou de julgar. É de propósito que as duas leituras
        // vejam o mesmo estado do banco: a função enxerga UM BIT a mais que a
        // política, e é esse bit, e nada além dele, que precisa aparecer.

        /** Chama uma função da entrega pelo papel anônimo. */
        const entrega = async (nome, argumentos = {}, cabecalhos = {}) =>
          await rest(`rpc/${nome}`, {
            method: "POST",
            headers: cabecalhos,
            body: JSON.stringify(argumentos),
          });

        /** A primeira linha de `situacao_do_endereco`, ou `null`. */
        const situacaoDe = async (endereco, cabecalhos = {}) => {
          const r = await entrega("situacao_do_endereco", { p_slug: endereco }, cabecalhos);
          const linhas = comoLista(r);
          return { r, linha: Array.isArray(linhas) ? (linhas[0] ?? null) : null };
        };

        const noAr = await situacaoDe(slug("publicado"));
        afirmar(
          "`situacao_do_endereco` é executável pelo papel ANÔNIMO",
          noAr.r.status === 200,
          `HTTP ${noAr.r.status} ${noAr.r.corpo.slice(0, 250)}`,
        );
        afirmar(
          "endereço de Post visível responde `no-ar` — COM conteúdo, que é a única situação que pode",
          noAr.linha?.situacao === NO_AR &&
            noAr.linha?.titulo === "Publicado" &&
            typeof noAr.linha?.post_id === "string" &&
            noAr.linha?.slug_atual === slug("publicado"),
          JSON.stringify(noAr.linha).slice(0, 300),
        );

        /* — Rascunho e agendado por vir: indistinguíveis de nunca ter existido — */
        //
        // É a garantia da Story 2.13, e ela não se afrouxa por a função ser
        // `security definer`. Nem o ENDEREÇO volta: devolvê-lo já confirmaria
        // que ele está tomado, e quem sonda descobre a pauta editorial pelo
        // que dá erro de endereço ocupado.

        const doRascunho = await situacaoDe(slug("rascunho"));
        afirmar(
          "rascunho responde `inexistente` — e o endereço NÃO volta, senão confirmaria que está tomado",
          doRascunho.linha?.situacao === INEXISTENTE &&
            doRascunho.linha?.slug_atual === null,
          JSON.stringify(doRascunho.linha).slice(0, 300),
        );

        const doFuturo = await situacaoDe(slug("agendado-futuro"));
        afirmar(
          "agendado cuja hora não chegou responde `inexistente`, como o rascunho",
          doFuturo.linha?.situacao === INEXISTENTE &&
            doFuturo.linha?.slug_atual === null,
          JSON.stringify(doFuturo.linha).slice(0, 300),
        );

        /* — Arquivado: a situação, o endereço, e NADA MAIS — */

        const doArquivado = await situacaoDe(slug("arquivado"));
        afirmar(
          "Post arquivado responde `arquivado` — o bit a mais que justifica `security definer`",
          doArquivado.linha?.situacao === ARQUIVADO &&
            doArquivado.linha?.slug_atual === slug("arquivado"),
          JSON.stringify(doArquivado.linha).slice(0, 300),
        );

        /* — Aposentado vivo redireciona; aposentado morto, não — */
        //
        // Mandar o rastreador para um endereço que responde `inexistente` gasta
        // duas viagens para dar a mesma resposta, e ensina que o endereço antigo
        // é válido. A camada de dados já decidiu isso na Story 2.15; aqui é o
        // BANCO que precisa decidir igual.

        const doAposentado = await situacaoDe(slug("antigo-do-visivel"));
        afirmar(
          "endereço aposentado de Post VISÍVEL responde `redirecionado`, apontando o endereço de hoje",
          doAposentado.linha?.situacao === REDIRECIONADO &&
            doAposentado.linha?.slug_atual === slug("publicado"),
          JSON.stringify(doAposentado.linha).slice(0, 300),
        );

        const doAposentadoMorto = await situacaoDe(slug("antigo-do-rascunho"));
        afirmar(
          "endereço aposentado cujo alvo NÃO está visível responde `inexistente` — não redireciona para o nada",
          doAposentadoMorto.linha?.situacao === INEXISTENTE &&
            doAposentadoMorto.linha?.slug_atual === null,
          JSON.stringify(doAposentadoMorto.linha).slice(0, 300),
        );

        /* — Endereço torto não vira consulta — */

        const torto = await situacaoDe("NÃO É Slug -- '; drop table posts; --");
        afirmar(
          "endereço fora do formato responde `inexistente` sem consultar — o que não pôde ser gravado não precisa ser procurado",
          torto.r.status === 200 &&
            torto.linha?.situacao === INEXISTENTE &&
            torto.linha?.slug_atual === null,
          `HTTP ${torto.r.status} ${JSON.stringify(torto.linha).slice(0, 200)}`,
        );
        const vazio = await situacaoDe(null);
        afirmar(
          "endereço NULO responde `inexistente` em vez de erro — a rota chama com o que chegou da URL",
          vazio.r.status === 200 && vazio.linha?.situacao === INEXISTENTE,
          `HTTP ${vazio.r.status} ${JSON.stringify(vazio.linha).slice(0, 200)}`,
        );

        /* — COLUNA A COLUNA: nenhuma situação fora do ar traz conteúdo — */
        //
        // Conferir de olho passaria no dia em que um campo novo entrasse na
        // função e alguém esquecesse de anulá-lo num dos quatro `return query`.
        // A lista dos campos vem do DOMÍNIO: reescrevê-la aqui compararia duas
        // cópias do mesmo engano.

        const foraDoAr = [
          [ARQUIVADO, doArquivado.linha],
          [REDIRECIONADO, doAposentado.linha],
          [`${INEXISTENTE} (rascunho)`, doRascunho.linha],
          [`${INEXISTENTE} (agendado por vir)`, doFuturo.linha],
          [`${INEXISTENTE} (aposentado morto)`, doAposentadoMorto.linha],
          [`${INEXISTENTE} (endereço torto)`, torto.linha],
        ];
        for (const [nome, linha] of foraDoAr) {
          const vazando = CAMPOS_DE_CONTEUDO.filter(
            (campo) => linha?.[campo] !== null && linha?.[campo] !== undefined,
          );
          afirmar(
            `a situação ${nome} não traz NENHUM dos ${CAMPOS_DE_CONTEUDO.length} campos de conteúdo`,
            linha !== null && vazando.length === 0,
            linha === null ? "não voltou linha nenhuma" : `vazou: ${vazando.join(", ")}`,
          );
        }

        /* AUTOTESTE da varredura: ela precisa acusar um campo plantado. Sem
           isto, um erro de digitação no nome da coluna deixaria as seis linhas
           acima verdes para sempre, sem julgar nada. */
        afirmar(
          "autoteste: a varredura coluna a coluna ACUSA um campo de conteúdo plantado",
          CAMPOS_DE_CONTEUDO.filter(
            (campo) => ({ ...doArquivado.linha, titulo: "vazou" })[campo] != null,
          ).join(",") === "titulo",
          "acusou",
        );

        /* — O vocabulário do banco é o do domínio, e os QUATRO foram exercidos — */
        //
        // A migração não declara enum de propósito: o vocabulário vive em
        // `src/domain/blog/entrega.js`. Sem a segunda asserção a primeira
        // passaria por vacuidade no dia em que uma situação parasse de ser
        // devolvida — todas as que voltaram estariam na lista, e faltaria uma.

        const situacoesVistas = [
          noAr.linha,
          doArquivado.linha,
          doAposentado.linha,
          doRascunho.linha,
        ].map((l) => l?.situacao);
        afirmar(
          "toda situação devolvida pelo banco está no vocabulário fechado do domínio",
          situacoesVistas.every((s) => SITUACOES_DA_ENTREGA.includes(s)),
          situacoesVistas.join(", "),
        );
        afirmar(
          `as ${SITUACOES_DA_ENTREGA.length} situações do vocabulário foram todas exercidas — senão a comparação acima passa por vacuidade`,
          SITUACOES_DA_ENTREGA.every((s) => situacoesVistas.includes(s)),
          `faltou: ${SITUACOES_DA_ENTREGA.filter((s) => !situacoesVistas.includes(s)).join(", ") || "nenhuma"}`,
        );

        /* — `posts_no_ar`: os visíveis, e SÓ o que o mapa do site precisa — */

        const listaNoAr = await entrega("posts_no_ar");
        const noArLinhas = comoLista(listaNoAr) ?? [];
        const noArNossos = noArLinhas.filter((l) =>
          String(l.slug ?? "").startsWith(prefixo),
        );
        const noArSlugs = noArNossos.map((l) => l.slug).sort();
        afirmar(
          "`posts_no_ar` é executável pelo papel ANÔNIMO",
          listaNoAr.status === 200,
          `HTTP ${listaNoAr.status} ${listaNoAr.corpo.slice(0, 250)}`,
        );
        afirmar(
          "`posts_no_ar` traz EXATAMENTE os dois visíveis da matriz — nem o rascunho, nem os dois por vir, nem o arquivado",
          noArSlugs.length === 2 &&
            noArSlugs.includes(slug("publicado")) &&
            noArSlugs.includes(slug("agendado-passado")),
          noArSlugs.map((s) => s.slice(prefixo.length)).join(", ") || "nenhum",
        );
        const colunasNoAr = Object.keys(noArNossos[0] ?? {}).sort();
        afirmar(
          "`posts_no_ar` devolve só endereço, título e os dois instantes — conteúdo e imagem não passam por aqui",
          colunasNoAr.join(",") === "atualizado_em,publicado_em,slug,titulo",
          colunasNoAr.join(",") || "nenhuma coluna",
        );

        /* — `proxima_publicacao`: o instante, ou nulo — */

        const proxima = await entrega("proxima_publicacao");
        let instanteProximo = null;
        try {
          const v = JSON.parse(proxima.corpo);
          instanteProximo = typeof v === "string" ? v : null;
        } catch {
          instanteProximo = null;
        }
        afirmar(
          "`proxima_publicacao` é executável pelo papel ANÔNIMO",
          proxima.status === 200,
          `HTTP ${proxima.status} ${proxima.corpo.slice(0, 250)}`,
        );
        /* O agendado por vir da matriz está a sete dias. Se a função enxergasse
           o agendado cuja hora JÁ chegou, ou parasse de enxergar o futuro, o
           instante sairia desta janela. */
        const daquiA = (dias) => Date.now() + dias * 24 * 60 * 60 * 1000;
        const emMs = instanteProximo === null ? NaN : Date.parse(instanteProximo);
        afirmar(
          "`proxima_publicacao` devolve o instante do agendado por vir — no futuro, e não além do que a matriz agendou",
          Number.isFinite(emMs) && emMs > Date.now() && emMs <= daquiA(8),
          instanteProximo ?? "nulo",
        );

        afirmar(
          "nenhum título de post oculto aparece nas respostas anônimas",
          !leitura.corpo.includes("Rascunho") &&
            !leitura.corpo.includes("Agendado cuja hora não chegou") &&
            !leitura.corpo.includes("Publicado com data futura"),
          leitura.corpo.slice(0, 200),
        );
      } finally {
        // Janela fechada assim que a leitura termina: dali em diante, nem o
        // processo morto deixa Post visível.
        const fechar = await executarSql(
          token,
          `update public.posts set publicado_em = ${LONGE}
            where slug in (${literal(slug("publicado"))}, ${literal(slug("agendado-passado"))})`,
        );
        afirmar(
          "a janela de visibilidade foi fechada",
          fechar.ok,
          fechar.erro ?? "",
        );
      }

      /* ── O Painel: leitura COM sessão real ────────────────────────────── */
      //
      // As cinco políticas `*_leitura_autenticada` não eram afirmadas em lugar
      // nenhum: apagá-las, ou trocá-las por `using (false)`, deixava tudo
      // verde porque a seção só consultava sem sessão, onde o esperado já é
      // "não volta". O Painel abriria vazio e nada teria falhado.

      let contaCriada = false;
      try {
        const criacao = await executarSql(
          token,
          sqlDeCriacaoDeConta({
            email: emailTemp,
            senha: senhaTemp,
            nome: nomeTemp,
          }),
        );
        contaCriada = criacao.ok && Boolean(criacao.dados?.[0]?.id);
        afirmar(
          "a Conta temporária do Painel foi criada",
          contaCriada,
          criacao.erro ?? "",
        );

        if (contaCriada) {
          let sessao = null;
          let respostaLogin = { status: 0, corpo: "" };
          try {
            const r = await fetch(
              `${URL_PROJETO}/auth/v1/token?grant_type=password`,
              {
                method: "POST",
                signal: AbortSignal.timeout(TIMEOUT_MS),
                headers: {
                  apikey: chavePublicavel,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  email: emailTemp,
                  password: senhaTemp,
                }),
              },
            );
            respostaLogin = { status: r.status, corpo: await r.text() };
            sessao = JSON.parse(respostaLogin.corpo);
          } catch {
            sessao = null;
          }
          const jwt = sessao?.access_token ?? null;
          if (jwt) registrarSegredo(jwt);

          const MOTIVO_LIMITE =
            "o GoTrue respondeu 429 (limite de taxa). Não é defeito do produto: a asserção não pôde ser exercida agora.";

          if (respostaLogin.status === 429) {
            adiar("a sessão do Painel foi aberta", MOTIVO_LIMITE);
            adiar("o Painel vê os SEIS posts da matriz, inclusive o rascunho", MOTIVO_LIMITE);
            adiar("o Painel vê as tabelas de apoio do módulo", MOTIVO_LIMITE);
            /* E AS DO STORAGE, UMA A UMA. Elas dependem da MESMA sessão, e
               sem estas linhas a seção (g) inteira — bucket, políticas,
               envio, leitura e remoção — simplesmente não era impressa numa
               execução com 429: nem `secao("(g) …")` aparecia, e o relatório
               não distinguia isso de "todas passaram". É a regra 4 do
               projeto — asserção adiada não conta como passou, e asserção
               que some não conta como nada. */
            for (const descricao of ASSERCOES_DO_STORAGE) {
              adiar(descricao, MOTIVO_LIMITE);
            }
            for (const descricao of ASSERCOES_DA_ENTREGA_COM_SESSAO) {
              adiar(descricao, MOTIVO_LIMITE);
            }
          } else {
            afirmar(
              "a sessão do Painel foi aberta",
              Boolean(jwt),
              `HTTP ${respostaLogin.status} ${respostaLogin.corpo.slice(0, 200)}`,
            );

            const comSessao = (caminho) =>
              rest(caminho, { headers: { Authorization: `Bearer ${jwt}` } });

            const doPainel = jwt
              ? await comSessao(`posts?select=slug,estado&slug=like.${prefixo}*`)
              : { status: 0, corpo: "" };
            const slugsDoPainel = (comoLista(doPainel) ?? []).map((l) => l.slug);
            afirmar(
              "o Painel vê os SEIS posts da matriz, inclusive o rascunho",
              doPainel.status === 200 &&
                slugsDoPainel.length === 6 &&
                slugsDoPainel.includes(slug("rascunho")) &&
                slugsDoPainel.includes(slug("arquivado")),
              `HTTP ${doPainel.status} — voltaram ${slugsDoPainel.length}: ${slugsDoPainel.map((s) => s.slice(prefixo.length)).join(", ") || "nenhum"}`,
            );

            const apoio = jwt
              ? await Promise.all([
                  comSessao(`categorias?select=slug&slug=eq.${slug("categoria")}`),
                  comSessao(`tags?select=slug&slug=like.${prefixo}*`),
                  comSessao(`posts_tags?select=post_id&post_id=eq.${idDe.get(slug("rascunho")) ?? ZERO_UUID}`),
                  comSessao(`slugs_antigos?select=slug&slug=like.${prefixo}*`),
                ])
              : [];
            const tamanhos = apoio.map((r) => (comoLista(r) ?? []).length);
            afirmar(
              "o Painel vê as tabelas de apoio do módulo",
              apoio.length === 4 &&
                apoio.every((r) => r.status === 200) &&
                tamanhos[0] === 1 &&
                tamanhos[1] === 2 &&
                tamanhos[2] === 1 &&
                tamanhos[3] === 2,
              `categorias/tags/associação/slugs_antigos: ${tamanhos.join(" / ")} (esperado 1 / 2 / 1 / 2) — status ${apoio.map((r) => r.status).join(", ")}`,
            );

            /* ─── As funções da ENTREGA, agora COM SESSÃO (Story 4.2) ──────
               `security definer` roda com os privilégios de quem criou a
               função, então a resposta não deveria depender de quem chama. Se
               dependesse, o Painel e o visitante veriam blogs diferentes pelo
               MESMO caminho de entrega — e o lado que enxerga mais seria o que
               a rota serviria para quem estivesse logado.

               A janela já fechou aqui, de propósito: o Post publicado voltou a
               ser invisível, e a pergunta interessante é justamente se a sessão
               o traz de volta. Não pode trazer. */
            const enderecosDaComparacao = [
              slug("publicado"),
              slug("arquivado"),
              slug("rascunho"),
              slug("antigo-do-visivel"),
            ];
            const linhaDaEntrega = async (endereco, cabecalhos) => {
              const r = await rest(`rpc/situacao_do_endereco`, {
                method: "POST",
                headers: cabecalhos,
                body: JSON.stringify({ p_slug: endereco }),
              });
              const linhas = comoLista(r);
              return Array.isArray(linhas) ? (linhas[0] ?? null) : null;
            };
            const paresDaEntrega = jwt
              ? await Promise.all(
                  enderecosDaComparacao.map(async (endereco) => ({
                    endereco,
                    anonimo: await linhaDaEntrega(endereco, {}),
                    logado: await linhaDaEntrega(endereco, {
                      Authorization: `Bearer ${jwt}`,
                    }),
                  })),
                )
              : [];
            const divergiram = paresDaEntrega.filter(
              (p) => JSON.stringify(p.anonimo) !== JSON.stringify(p.logado),
            );
            afirmar(
              ASSERCOES_DA_ENTREGA_COM_SESSAO[0],
              paresDaEntrega.length === enderecosDaComparacao.length &&
                paresDaEntrega.every((p) => p.anonimo !== null) &&
                divergiram.length === 0,
              divergiram.length > 0
                ? divergiram
                    .map(
                      (p) =>
                        `${p.endereco.slice(prefixo.length)}: anônimo ${p.anonimo?.situacao} / logado ${p.logado?.situacao}`,
                    )
                    .join(" | ")
                : `comparou ${paresDaEntrega.length} endereço(s)`,
            );

            /* E O CONTEÚDO CONTINUA FORA. A comparação acima ficaria verde se
               as DUAS respostas vazassem conteúdo igual — iguais e erradas. */
            const logadoArquivado =
              paresDaEntrega.find((p) => p.endereco === slug("arquivado"))?.logado ??
              null;
            const vazouComSessao = CAMPOS_DE_CONTEUDO.filter(
              (campo) =>
                logadoArquivado?.[campo] !== null &&
                logadoArquivado?.[campo] !== undefined,
            );
            afirmar(
              ASSERCOES_DA_ENTREGA_COM_SESSAO[1],
              logadoArquivado !== null &&
                logadoArquivado.situacao === ARQUIVADO &&
                vazouComSessao.length === 0,
              logadoArquivado === null
                ? "não voltou linha nenhuma"
                : `situação ${logadoArquivado.situacao}; vazou: ${vazouComSessao.join(", ") || "nada"}`,
            );

            /* ─── O STORAGE, EXERCITADO (Story 3.1) ────────────────────────
               O cabeçalho desta ferramenta diz que ler o texto de uma política
               não prova que o banco a aplica, e isso vale igual para o
               Storage: as quatro políticas do bucket são conferidas por
               TENTATIVA REAL, da mesma sessão de Conta temporária que acabou
               de provar a leitura do Painel.

               A matriz é a da story, linha por linha: leitura anônima
               permitida, envio anônimo recusado, envio autenticado aceito,
               exclusão anônima recusada, exclusão autenticada aceita. */
            if (jwt) await provarStorage(jwt);
          }
        }
      } finally {
        const remocao = await executarSql(token, sqlDeRemocaoDeConta(emailTemp));
        afirmar(
          "a Conta temporária do Painel foi removida",
          remocao.ok,
          remocao.erro ?? "",
        );
      }

      /* ── Escrita por cliente: negada em toda tabela do módulo ─────────── */

      /** Instantâneo verificável de TODAS as linhas do módulo com este nonce. */
      const instantaneo = () =>
        uma(
          `select
             (select coalesce(md5(string_agg(p::text, '|' order by p.slug)), '')
                from public.posts p where p.slug like ${literal(marca)}) as posts,
             (select coalesce(md5(string_agg(c::text, '|' order by c.slug)), '')
                from public.categorias c where c.slug like ${literal(marca)}) as categorias,
             (select coalesce(md5(string_agg(t::text, '|' order by t.slug)), '')
                from public.tags t where t.slug like ${literal(marca)}) as tags,
             (select coalesce(md5(string_agg(pt::text, '|' order by pt.post_id::text)), '')
                from public.posts_tags pt join public.posts p on p.id = pt.post_id
               where p.slug like ${literal(marca)}) as posts_tags,
             (select coalesce(md5(string_agg(s::text, '|' order by s.slug)), '')
                from public.slugs_antigos s where s.slug like ${literal(marca)}) as slugs_antigos`,
          "instantâneo das linhas do módulo",
        );

      const antes = await instantaneo();

      const corpoDe = {
        posts: {
          slug: slug("intruso"),
          titulo: "Escrito por anon",
          publicado_em: "2000-01-01T00:00:00Z",
          estado: "publicado",
        },
        categorias: { slug: slug("intruso"), nome: "Escrita por anon" },
        tags: { slug: slug("intruso"), nome: "Escrita por anon" },
        slugs_antigos: { slug: slug("intruso"), post_id: idVisivel },
        posts_tags: { post_id: idVisivel, tag_id: ZERO_UUID },
      };
      const filtroDe = {
        posts: `slug=like.${prefixo}*`,
        categorias: `slug=like.${prefixo}*`,
        tags: `slug=like.${prefixo}*`,
        slugs_antigos: `slug=like.${prefixo}*`,
        posts_tags: `post_id=eq.${idVisivel}`,
      };
      // Alteração visível no instantâneo, coluna que existe em toda tabela do
      // módulo: contagem não muda em UPDATE, e era só contagem que a versão
      // anterior conferia fora de `posts`.
      const alteracaoDe = { criado_em: "2000-01-01T00:00:00Z" };

      /** Recusa é 401/403, ou 4xx cujo corpo nomeia privilégio ou RLS. */
      const recusou = (r) => {
        if (!r.alcancou) return false;
        if (r.status === 401 || r.status === 403) return true;
        return (
          r.status >= 400 &&
          r.status < 500 &&
          /42501|permission denied|row-level security|violates row-level/i.test(
            r.corpo,
          )
        );
      };

      for (const tabela of TABELAS_CONTEUDO) {
        for (const [verbo, metodo, alvo, corpo] of [
          ["INSERT", "POST", tabela, corpoDe[tabela]],
          ["UPDATE", "PATCH", `${tabela}?${filtroDe[tabela]}`, alteracaoDe],
          ["DELETE", "DELETE", `${tabela}?${filtroDe[tabela]}`, null],
        ]) {
          const r = await rest(alvo, {
            method: metodo,
            body: corpo ? JSON.stringify(corpo) : undefined,
          });
          // Amarrada ao controle positivo: sem credencial boa, um 401 não
          // prova negação nenhuma, e a asserção diz isso em vez de passar.
          afirmar(
            `${verbo} anônimo em ${tabela} é negado`,
            credencialBoa && recusou(r),
            credencialBoa
              ? (r.erro ?? `HTTP ${r.status} ${r.corpo.slice(0, 160)}`)
              : "a credencial não passou no controle positivo — 401 aqui não prova nada",
          );
        }
      }

      // O que realmente prova a negação: o estado depois das quinze tentativas
      // é BIT A BIT o estado de antes. Um 4xx pode vir de tipo, de rota ou de
      // sintaxe — o instantâneo não pode vir de outro lugar.
      const depois = await instantaneo();
      const iguais = TABELAS_CONTEUDO.filter(
        (t) => (antes.linha?.[t] ?? "?") === (depois.linha?.[t] ?? "!"),
      );
      afirmar(
        "nenhuma escrita anônima criou, alterou ou apagou linha alguma",
        !antes.falhou && !depois.falhou && iguais.length === TABELAS_CONTEUDO.length,
        `tabelas com instantâneo idêntico: ${iguais.join(", ") || "nenhuma"} (esperado as cinco)`,
      );

      /* ── O que o banco RECUSA gravar ──────────────────────────────────── */
      //
      // Cada linha aqui é um estado que a política esconderia mas que agora
      // nem chega a existir. Recusa na escrita e ocultação na leitura dizem a
      // mesma coisa em tempos diferentes.

      const recusaEsperada = async (descricao, sql, padrao) => {
        const r = await executarSql(token, sql);
        afirmar(
          descricao,
          !r.ok && padrao.test(r.erro ?? ""),
          r.ok
            ? "o comando PASSOU — a restrição não existe ou não pega este caso"
            : (r.erro ?? ""),
        );
      };
      const posto = (colunas, valores) =>
        `insert into public.posts (${colunas}) values (${valores})`;

      await recusaEsperada(
        "segundo post com o mesmo slug é recusado pela restrição de unicidade",
        posto(
          "slug, titulo",
          `${literal(slug("publicado"))}, 'Segundo com o mesmo slug'`,
        ),
        /duplicate key|unique|23505/i,
      );

      await recusaEsperada(
        "post que assume um slug APOSENTADO de outro post é recusado",
        posto(
          "slug, titulo",
          `${literal(slug("antigo-do-visivel"))}, 'Assumindo slug aposentado'`,
        ),
        /já está em uso|23505/i,
      );

      await recusaEsperada(
        "slug aposentado que colide com o slug ATIVO de um post é recusado",
        `insert into public.slugs_antigos (slug, post_id)
         values (${literal(slug("publicado"))}, ${literal(idVisivel)}::uuid)`,
        /já está em uso|23505/i,
      );

      await recusaEsperada(
        "estado fora do enum é recusado pelo banco",
        posto(
          "slug, titulo, estado",
          `${literal(slug("fora-do-enum"))}, 'Estado inexistente', 'publicando'`,
        ),
        /invalid input value|22p02|estado_post/i,
      );

      await recusaEsperada(
        "post PUBLICADO sem publicado_em é recusado — não fica só invisível",
        posto(
          "slug, titulo, estado",
          `${literal(slug("publicado-sem-data"))}, 'Publicado sem data', 'publicado'`,
        ),
        /posts_publicavel_exige_data|check constraint|23514/i,
      );

      await recusaEsperada(
        "post AGENDADO sem publicado_em é recusado",
        posto(
          "slug, titulo, estado",
          `${literal(slug("agendado-sem-data"))}, 'Agendado sem data', 'agendado'`,
        ),
        /posts_publicavel_exige_data|check constraint|23514/i,
      );

      await recusaEsperada(
        "slug fora do formato de URL é recusado",
        posto(
          "slug, titulo",
          `'Slug Com Espaço E Maiúscula', 'Slug inválido'`,
        ),
        /posts_slug_formato|check constraint|23514/i,
      );

      await recusaEsperada(
        "conteudo que não é objeto JSON é recusado",
        posto(
          "slug, titulo, conteudo",
          `${literal(slug("conteudo-invalido"))}, 'Conteúdo em lista', '[]'::jsonb`,
        ),
        /posts_conteudo_e_objeto|check constraint|23514/i,
      );

      await recusaEsperada(
        "título em branco é recusado",
        posto("slug, titulo", `${literal(slug("sem-titulo"))}, '   '`),
        /posts_titulo_nao_vazio|check constraint|23514/i,
      );

      await recusaEsperada(
        "imagem de capa sem texto alternativo é recusada",
        posto(
          "slug, titulo, imagem_url",
          `${literal(slug("sem-alt"))}, 'Com capa muda', 'https://exemplo/x.png'`,
        ),
        /posts_imagem_exige_alt|check constraint|23514/i,
      );

      /* — O padrão da coluna, observado: post nasce rascunho e invisível — */
      //
      // Todos os inserts acima declaram `estado`. Sem esta asserção, trocar o
      // padrão para `'publicado'` manteria tudo verde — e a função de escrita
      // da Story 2.5, que grava sem informar o estado, faria o Post nascer no
      // ar.

      const nascimento = await uma(
        `insert into public.posts (slug, titulo)
         values (${literal(slug("sem-estado"))}, 'Criado sem informar estado')
         returning estado::text as estado, publicado_em is null as sem_data`,
        "post criado sem informar estado",
      );
      afirmar(
        "post criado sem informar o estado nasce RASCUNHO, sem data",
        !nascimento.falhou &&
          nascimento.linha?.estado === "rascunho" &&
          nascimento.linha?.sem_data === true,
        `estado: ${nascimento.linha?.estado ?? "—"} | sem data: ${nascimento.linha?.sem_data ?? "—"}`,
      );

      const nasceInvisivel = await rest(
        `posts?select=slug&slug=eq.${slug("sem-estado")}`,
      );
      afirmar(
        "e nasce invisível para quem não tem sessão",
        nasceInvisivel.status === 200 &&
          (comoLista(nasceInvisivel) ?? []).length === 0,
        `HTTP ${nasceInvisivel.status} ${nasceInvisivel.corpo.slice(0, 160)}`,
      );

      /* — O gatilho de `atualizado_em`, exercido — */
      //
      // A seção (e) fixa a forma do gatilho; esta prova que ele MOVE a coluna.
      // Era a mesma classe de defeito que a Story 1.2 corrigiu: catálogo
      // conferido, comportamento não.

      const tocou = await uma(
        `with movido as (
           update public.posts set titulo = 'Título tocado'
            where slug = ${literal(slug("sem-estado"))}
            returning criado_em, atualizado_em
         )
         select (atualizado_em > criado_em) as moveu from movido`,
        "efeito do gatilho de atualizado_em",
      );
      afirmar(
        "um UPDATE move atualizado_em à frente de criado_em",
        !tocou.falhou && tocou.linha?.moveu === true,
        `moveu: ${tocou.linha?.moveu ?? "—"}`,
      );

      /* — Integridade referencial, exercida — */
      //
      // A própria limpeza depende do cascade; e `categoria_id` levando o Post
      // junto seria perda de conteúdo silenciosa.

      // Exclusão e contagem em CHAMADAS SEPARADAS, de propósito: num único
      // comando, o `select` e o `delete` enxergam o mesmo instantâneo, e a
      // contagem devolveria o estado de ANTES — uma asserção que falharia com
      // o cascade funcionando e passaria se o cascade fosse trocado por
      // `no action`, que é o pior dos dois mundos.
      const idRascunhoAlvo = idDe.get(slug("rascunho")) ?? ZERO_UUID;
      const exclusao = await uma(
        `delete from public.posts where id = ${literal(idRascunhoAlvo)}::uuid returning id::text as id`,
        "exclusão do post para o teste de cascade",
      );
      const cascata = await uma(
        `select
           (select count(*)::int from public.posts_tags where post_id = ${literal(idRascunhoAlvo)}::uuid) as assoc,
           (select count(*)::int from public.slugs_antigos where post_id = ${literal(idRascunhoAlvo)}::uuid) as antigos,
           (select count(*)::int from public.tags where slug = ${literal(slug("tag-oculta"))}) as tag_sobrevive`,
        "efeito do on delete cascade",
      );
      afirmar(
        "apagar um Post leva junto sua associação e seus slugs aposentados",
        !exclusao.falhou &&
          (exclusao.linhas ?? []).length === 1 &&
          !cascata.falhou &&
          cascata.linha?.assoc === 0 &&
          cascata.linha?.antigos === 0,
        `removidos: ${(exclusao.linhas ?? []).length} | associações restantes: ${cascata.linha?.assoc ?? "?"} | slugs restantes: ${cascata.linha?.antigos ?? "?"}`,
      );
      afirmar(
        "e NÃO leva a Tag junto — o cascade é da associação, não do vocabulário",
        cascata.linha?.tag_sobrevive === 1,
        `tags restantes: ${cascata.linha?.tag_sobrevive ?? "?"}`,
      );

      /* ─── EXCLUIR CATEGORIA EM USO É RECUSADO PELO BANCO (Story 2.14) ───
         Até a 2.14 esta mesma seção afirmava o OPOSTO: que apagar a Categoria
         anulava a referência sem apagar Post algum. Era `on delete set null`, e
         era o defeito central da story — doze artigos podiam perder a
         classificação sem que nada na tela dissesse isso.

         A prova é feita PELO CONSOLE (SQL via Management API), que é
         exatamente a via que função de servidor nenhuma cobre: se o bloqueio
         morasse só na aplicação, este comando passaria. */
      const antesDaCategoria = await uma(
        `select
           (select count(*)::int from public.posts where slug like ${literal(marca)}) as posts,
           (select count(*)::int from public.posts
             where slug like ${literal(marca)} and categoria_id is not null) as com_categoria`,
        "posts antes de tentar apagar a Categoria",
      );
      /* CONTROLE POSITIVO: sem a garantia de que há Post usando a Categoria, a
         recusa abaixo poderia ser sobre uma Categoria vazia — e a asserção
         passaria por vacuidade, provando nada. */
      afirmar(
        "controle positivo: há Post usando a Categoria semeada",
        !antesDaCategoria.falhou && (antesDaCategoria.linha?.com_categoria ?? 0) > 0,
        `com categoria: ${antesDaCategoria.linha?.com_categoria ?? "?"}`,
      );

      const emUso = await executarSql(
        token,
        `delete from public.categorias where slug = ${literal(slug("categoria"))}`,
      );
      const depoisDaTentativa = await uma(
        `select
           (select count(*)::int from public.posts where slug like ${literal(marca)}) as posts,
           (select count(*)::int from public.posts
             where slug like ${literal(marca)} and categoria_id is not null) as com_categoria,
           (select count(*)::int from public.categorias
             where slug = ${literal(slug("categoria"))}) as categoria`,
        "estado depois da tentativa de apagar a Categoria em uso",
      );
      afirmar(
        "o BANCO recusa apagar uma Categoria em uso — e nomeia a chave estrangeira",
        emUso.ok === false && /posts_categoria_id_fkey/.test(String(emUso.erro ?? "")),
        emUso.ok
          ? "o comando foi ACEITO — `on delete restrict` não está em vigor"
          : String(emUso.erro ?? "").slice(0, 200),
      );
      afirmar(
        "a recusa não desassocia Post nenhum, e a Categoria continua lá",
        !depoisDaTentativa.falhou &&
          depoisDaTentativa.linha?.com_categoria ===
            antesDaCategoria.linha?.com_categoria &&
          depoisDaTentativa.linha?.posts === antesDaCategoria.linha?.posts &&
          depoisDaTentativa.linha?.categoria === 1,
        `posts: ${antesDaCategoria.linha?.posts ?? "?"} → ${depoisDaTentativa.linha?.posts ?? "?"} | com categoria: ${antesDaCategoria.linha?.com_categoria ?? "?"} → ${depoisDaTentativa.linha?.com_categoria ?? "?"} | categoria: ${depoisDaTentativa.linha?.categoria ?? "?"}`,
      );

      /* E o CONTROLE POSITIVO do outro lado: sem uso, ela sai. Sem isto, a
         recusa acima passaria idêntica com uma restrição que proibisse TODA
         exclusão de Categoria — que é outro defeito, e não a garantia pedida. */
      const desassociou = await executarSql(
        token,
        `update public.posts set categoria_id = null where slug like ${literal(marca)}`,
      );
      const semUso = await executarSql(
        token,
        `delete from public.categorias where slug = ${literal(slug("categoria"))}`,
      );
      const sumiu = await uma(
        `select (select count(*)::int from public.categorias
                  where slug = ${literal(slug("categoria"))}) as categoria,
                (select count(*)::int from public.posts
                  where slug like ${literal(marca)}) as posts`,
        "estado depois de apagar a Categoria sem uso",
      );
      afirmar(
        "Categoria SEM uso é excluída normalmente, sem levar Post nenhum junto",
        desassociou.ok &&
          semUso.ok &&
          !sumiu.falhou &&
          sumiu.linha?.categoria === 0 &&
          sumiu.linha?.posts === antesDaCategoria.linha?.posts,
        `${desassociou.erro ?? ""} ${semUso.erro ?? ""} | categoria: ${sumiu.linha?.categoria ?? "?"} | posts: ${sumiu.linha?.posts ?? "?"}`,
      );

      /* — `publicado_em` nulo não é verdadeiro: a aritmética da política — */
      //
      // A linha "publicado sem data" da matriz original agora é IRREPRESENTÁVEL
      // (a restrição acima recusa a gravação). O predicado da política continua
      // sendo o que esconderia a linha se ela existisse por outro caminho, e é
      // isto que o afirma sem precisar criar dado inválido.

      const aritmetica = await uma(
        `select (null::timestamptz <= now()) is not true as escondido`,
        "aritmética de nulo no predicado da política",
      );
      afirmar(
        "publicado_em nulo NÃO satisfaz o predicado da política (null <= now() não é verdadeiro)",
        !aritmetica.falhou && aritmetica.linha?.escondido === true,
        `encontrado: ${aritmetica.linha?.escondido ?? "—"}`,
      );
    }
  } finally {
    // Remoção incondicional: uma asserção que falha no meio não pode deixar
    // Post de teste num projeto de produção.
    limpeza = await executarSql(
      token,
      `delete from public.posts where slug like ${literal(marca)};
       delete from public.tags where slug like ${literal(marca)};
       delete from public.categorias where slug like ${literal(marca)};
       delete from public.slugs_antigos where slug like ${literal(marca)};
       delete from auth.users where email = ${literal(emailTemp)};`,
    );
  }

  afirmar(
    "a semeadura foi removida do projeto",
    Boolean(limpeza?.ok),
    limpeza?.erro ?? "",
  );

  const sobrou = await uma(
    `select
       (select count(*)::int from public.posts where slug like ${literal(marca)}) as posts,
       (select count(*)::int from public.categorias where slug like ${literal(marca)}) as categorias,
       (select count(*)::int from public.tags where slug like ${literal(marca)}) as tags,
       (select count(*)::int from public.slugs_antigos where slug like ${literal(marca)}) as antigos,
       (select count(*)::int from public.posts_tags pt
          join public.posts p on p.id = pt.post_id where p.slug like ${literal(marca)}) as assoc,
       (select count(*)::int from auth.users where email = ${literal(emailTemp)}) as contas`,
    "resíduo da prova comportamental",
  );
  const residuo = ["posts", "categorias", "tags", "antigos", "assoc", "contas"];
  afirmar(
    "nenhum resíduo da prova comportamental ficou no projeto",
    !sobrou.falhou && residuo.every((c) => (sobrou.linha?.[c] ?? -1) === 0),
    residuo.map((c) => `${c}: ${sobrou.linha?.[c] ?? "?"}`).join(" | "),
  );
} else if (!temToken) {
  afirmar(
    "a prova comportamental da visibilidade pôde ser exercida",
    false,
    "sem SUPABASE_ACCESS_TOKEN não há como semear a matriz — a asserção falha como ausente, nunca é pulada em silêncio",
  );
}


/* ─── Veredito ───────────────────────────────────────────────────────────── */

console.log("");
if (adiadas > 0) {
  console.log(
    `ATENÇÃO: ${adiadas} asserção(ões) NÃO foram exercidas (limite de taxa do GoTrue). Rode de novo em alguns minutos para cobri-las.`,
  );
}
if (falhas === 0) {
  console.log(
    adiadas === 0
      ? "Supabase verificado: todas as asserções passaram."
      : `Supabase verificado com ressalva: nenhuma falha, mas ${adiadas} asserção(ões) ficaram sem exercício.`,
  );
  process.exitCode = 0;
} else {
  console.log(`Supabase NÃO verificado: ${falhas} asserção(ões) falharam.`);
  process.exitCode = 1;
}

});
