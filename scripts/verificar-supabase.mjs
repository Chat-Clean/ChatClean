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

const tabelasCriadas = new Map(); // nome → arquivo
const rlsPorArquivo = new Map(); // arquivo → Set de tabelas com RLS ligada ali
const politicasDeEscrita = [];
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
        politicasDeEscrita.push(`${m.nome}: ${bruto.slice(0, 90)}…`);
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
  "nenhuma política concede escrita a anon, authenticated ou public",
  politicasDeEscrita.length === 0,
  politicasDeEscrita.join(" | "),
);
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
    ["posts_categoria_id_fkey", "n", "set null"],
    ["posts_autor_id_fkey", "n", "set null"],
  ]) {
    afirmar(
      `${nome} apaga com "${legenda}"`,
      acaoDe.get(nome) === acao,
      `encontrado: ${acaoDe.get(nome) ?? "chave ausente"}`,
    );
  }

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
         (${literal(slug("categoria"))}, 'Categoria de verificação', 'flask', 'oklch(0.7 0.1 200)', 99);

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

      const antesDaCategoria = await uma(
        `select
           (select count(*)::int from public.posts where slug like ${literal(marca)}) as posts,
           (select count(*)::int from public.posts
             where slug like ${literal(marca)} and categoria_id is not null) as com_categoria`,
        "posts antes de apagar a Categoria",
      );
      const catRemovida = await executarSql(
        token,
        `delete from public.categorias where slug = ${literal(slug("categoria"))}`,
      );
      const semCategoria = await uma(
        `select
           (select count(*)::int from public.posts where slug like ${literal(marca)}) as posts,
           (select count(*)::int from public.posts
             where slug like ${literal(marca)} and categoria_id is not null) as com_categoria`,
        "posts depois de apagar a Categoria",
      );
      afirmar(
        "apagar uma Categoria anula a referência sem apagar Post algum",
        catRemovida.ok &&
          !antesDaCategoria.falhou &&
          !semCategoria.falhou &&
          (antesDaCategoria.linha?.com_categoria ?? 0) > 0 &&
          semCategoria.linha?.com_categoria === 0 &&
          semCategoria.linha?.posts === antesDaCategoria.linha?.posts,
        `posts: ${antesDaCategoria.linha?.posts ?? "?"} → ${semCategoria.linha?.posts ?? "?"} | com categoria: ${antesDaCategoria.linha?.com_categoria ?? "?"} → ${semCategoria.linha?.com_categoria ?? "?"}`,
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
