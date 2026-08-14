#!/usr/bin/env node
/**
 * Ferramenta de verificação do Supabase (Story 1.2).
 *
 * Mesmo contrato da verificação da fundação: uma linha por asserção, código 0
 * se todas passarem, 1 caso contrário. Cobre cada linha da matriz de I/O da
 * story, em duas frentes:
 *
 *   ESTÁTICO — sobre `supabase/migrations/*.sql`, sem rede: carimbo de tempo
 *   válido; RLS habilitada na mesma migração que cria a tabela; nenhuma
 *   política de escrita para `anon`/`authenticated`; toda view com
 *   `security_invoker`; toda função `security definer` com `search_path`
 *   fixo; nenhum segredo em `.env.example`; `engines.node` declarado.
 *
 *   REMOTO — sobre o projeto: `public.perfis` existe com RLS e as colunas
 *   esperadas; a migração consta em `supabase_migrations.schema_migrations`;
 *   `disable_signup` é `true`; e o registro pela API pública é de fato
 *   rejeitado.
 *
 * Sem `SUPABASE_ACCESS_TOKEN` no ambiente as asserções remotas FALHAM como
 * ausentes — nunca são puladas em silêncio. Foi o defeito corrigido na
 * verificação da Story 1.1 e não se repete aqui.
 *
 * Uso: npm run verificar:supabase
 */

import { execFileSync } from "node:child_process";
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
  REF_PROJETO,
  sanitizar,
  URL_PROJETO,
} from "./supabase-comum.mjs";

let falhas = 0;

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

/* ─── Veredito ───────────────────────────────────────────────────────────── */

console.log("");
if (falhas === 0) {
  console.log("Supabase verificado: todas as asserções passaram.");
  process.exitCode = 0;
} else {
  console.log(`Supabase NÃO verificado: ${falhas} asserção(ões) falharam.`);
  process.exitCode = 1;
}

});
