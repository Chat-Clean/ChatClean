#!/usr/bin/env node
/**
 * Ferramenta de verificação de Carreiras (Story 5.2).
 *
 * Mesmo contrato das outras: uma linha por asserção, código 0 se todas
 * passarem, 1 caso contrário. Cobre a migração das Vagas e Classificações, o
 * domínio puro de `src/domain/carreiras/`, a camada de leitura de
 * `src/data/carreiras/` e o que o banco FAZ com tudo isso.
 *
 *   (0) a ferramenta está no encadeamento de `npm run verificar`;
 *   (a) ESTÁTICO, sobre TODAS as migrações de Carreiras (20260924120000,
 *       20260924130000, 20260924140000): regras de `verificar:supabase` e uma
 *       LISTA DE PERMISSÃO de comandos (só objetos de Carreiras; nada anterior
 *       é alterado, removido ou redefinido);
 *   (b) o DOMÍNIO, importado e executado: Estados, a tabela da máquina,
 *       Classificações, Modalidade, Link de Candidatura, `problemasParaAbrir`
 *       e a Descrição;
 *   (c) a CAMADA DE DADOS: fronteira de imports, um cliente por função, nada
 *       de filtro de Estado, e nada lança diante de ambiente ausente ou rede
 *       fora (em subprocesso);
 *   (d) REMOTO, catálogo: tabelas, RLS, políticas, privilégios de cada papel,
 *       enum, CHECKs, FKs `restrict`, índices, funções e semeadura;
 *   (e) REMOTO, espelhos JS/SQL: nós, atributos, marcas, etiquetas, esquemas
 *       de link, cores, Equivalentes e Modalidades, nos dois sentidos;
 *   (f) REMOTO, a matriz de I/O da story, SEMPRE em transação desfeita
 *       (`begin; …; set local role …; select …; rollback;`): uma Vaga Aberta
 *       de teste NUNCA é confirmada, então nenhuma leitura pública de outra
 *       sessão a vê;
 *   (g) REMOTO, pela API REST de verdade: um Rascunho CONFIRMADO (nunca uma
 *       Aberta), visto pelo visitante e por uma Conta temporária com sessão,
 *       e as leituras do Painel exercidas pelo MÓDULO com a sessão dela;
 *       resíduo zero no fim, com prefixo `zzz-verificacao-5-2-` e `finally`
 *       com as limpezas conferidas.
 *
 * Sem `SUPABASE_ACCESS_TOKEN` as asserções remotas FALHAM como ausentes, nunca
 * são puladas em silêncio. O token nunca é impresso.
 *
 * Uso: npm run verificar:carreiras
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  analisarSql,
  comandosSql,
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
import { sqlDeCriacaoDeConta, sqlDeRemocaoDeConta } from "./criar-conta.mjs";

/* O domínio e a lista do servidor vêm do CÓDIGO, importados e executados. As
   expectativas escritas aqui à mão são as da SPEC (a tabela de transições, as
   colunas das funções, a semeadura): é contra elas que o código é julgado, e
   nunca contra uma cópia dele mesmo. */
import * as estadosDaVaga from "../src/domain/carreiras/estados.js";
import * as transicoesDaVaga from "../src/domain/carreiras/transicoes.js";
import * as classificacoes from "../src/domain/carreiras/classificacoes.js";
import * as regrasDaVaga from "../src/domain/carreiras/vaga.js";
import * as descricaoDaVaga from "../src/domain/carreiras/descricao.js";
import * as schema from "../src/domain/blog/schema.js";
import { gerarSlug } from "../src/domain/blog/slug.js";
import { CORES_DE_CATEGORIA } from "../src/domain/blog/categorias.js";
import { derivarHtml } from "../src/render/blog/paraHtml.js";
import { FUNCOES_DA_ENTREGA } from "../api/_nucleo/leitura.js";

let falhas = 0;
let adiadas = 0;

function secao(titulo) {
  console.log(`\n${titulo}`);
}

function afirmar(descricao, condicao, detalhe = "") {
  if (condicao) {
    console.log(`  OK    ${descricao}`);
    return true;
  }
  falhas += 1;
  console.log(`  FALHA ${descricao}${detalhe ? ` (${sanitizar(detalhe)})` : ""}`);
  return false;
}

/** Asserção que o ambiente impediu de exercer. NÃO conta como passou. */
function adiar(descricao, motivo) {
  adiadas += 1;
  console.log(`  ADIADA ${descricao} (${sanitizar(motivo)})`);
}

function ler(relativo) {
  try {
    return readFileSync(path.join(raiz, relativo), "utf8");
  } catch {
    return null;
  }
}

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ordenado = (lista) => [...lista].sort();
const urlDe = (relativo) => pathToFileURL(path.join(raiz, relativo)).href;

/** Comentários de JS trocados por espaço: as varreduras decidem sobre código. */
function semComentarios(texto) {
  return String(texto)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * As origens de import de um módulo: `from "x"`, `import "x"` e `import("x")`.
 * `.from("vagas")`, a consulta do PostgREST, NÃO é origem: o ponto antes a
 * exclui.
 */
function origensDeImport(texto) {
  return [
    ...semComentarios(texto).matchAll(/(?<![\w$.])(?:from\s*|import\s*\(\s*|import\s+)["'`]([^"'`]+)["'`]/g),
  ].map((m) => m[1]);
}

const NOME_DA_MIGRACAO = "20260924120000_vagas_e_classificacoes.sql";
/**
 * TODAS as migrações de Carreiras, na ordem do carimbo. A primeira cria; as
 * outras só corrigem objetos que ela criou (a busca do Painel, os espelhos da
 * Descrição, o link e o invariante). A seção (a) confere que a lista cobre
 * toda migração posterior à das landings, e a (d) que todas estão aplicadas.
 */
const MIGRACOES_DE_CARREIRAS = Object.freeze([
  NOME_DA_MIGRACAO,
  "20260924130000_busca_de_vagas_recusa_estado.sql",
  "20260924140000_descricao_e_link_estritos.sql",
]);
const CARIMBO_DAS_LANDINGS = "20260922120000";
/** As restrições de `vagas`, pelo nome. As migrações de correção só podem refazer estas. */
const RESTRICOES_DE_VAGAS = Object.freeze([
  "vagas_titulo_valido",
  "vagas_slug_formato",
  "vagas_slug_unico",
  "vagas_modalidade_valida",
  "vagas_resumo_tamanho",
  "vagas_localizacao_tamanho",
  "vagas_link_de_candidatura_valido",
  "vagas_aberta_em_obrigatorio",
  "vagas_aberta_completa",
  "vagas_descricao_na_projecao",
  "vagas_descricao_html_segura",
]);
const TABELAS = Object.freeze(["vagas", "departamentos", "tipos_de_vaga", "niveis"]);
const CLASSIFICACOES = Object.freeze(["departamentos", "tipos_de_vaga", "niveis"]);

/** As funções que ESTA migração cria, e só elas. */
const FUNCOES_NOVAS = Object.freeze([
  "descricao_da_vaga_e_permitida",
  "html_da_descricao_e_reduzido",
  "situacao_da_vaga",
  "vagas_abertas",
  "buscar_vagas_do_painel",
]);
/** Os espelhos da Descrição: a restrição de `vagas` depende deles. */
const FUNCOES_DA_RESTRICAO = Object.freeze([
  "descricao_da_vaga_e_permitida",
  "html_da_descricao_e_reduzido",
]);
/** As funções existentes que a migração CHAMA e nunca redefine. */
const FUNCOES_REUSADAS = Object.freeze([
  "documento_do_post_e_permitido",
  "html_do_post_e_seguro",
  "nos_do_documento",
  "normalizar_busca",
  "tocar_atualizado_em",
  "decodificar_entidades",
  "endereco_do_post_e_permitido",
]);

/** As colunas das funções de entrega, na ordem da SPEC. */
const COLUNAS_DA_SITUACAO = Object.freeze([
  "situacao",
  "id",
  "slug",
  "titulo",
  "resumo",
  "descricao_html",
  "departamento",
  "departamento_cor",
  "tipo",
  "equivalente_jobposting",
  "nivel",
  "nivel_cor",
  "modalidade",
  "localizacao",
  "link_de_candidatura",
  "aberta_em",
  "atualizado_em",
]);
const COLUNAS_DAS_ABERTAS = Object.freeze(
  COLUNAS_DA_SITUACAO.filter((c) => c !== "descricao_html" && c !== "link_de_candidatura"),
);

/** A semeadura, como a SPEC a descreve. */
const SEMEADURA_ESPERADA = Object.freeze({
  departamentos: [
    ["Tecnologia", "var(--categoria-azul-bg)"],
    ["Atendimento", "var(--categoria-verde-bg)"],
    ["Marketing", "var(--categoria-roxo-bg)"],
    ["Comercial", "var(--categoria-ambar-bg)"],
    ["Operações", "var(--categoria-ciano-bg)"],
    ["Financeiro", "var(--categoria-terracota-bg)"],
    ["RH", "var(--categoria-rosa-bg)"],
    ["Design", "var(--categoria-cinza-bg)"],
  ],
  tipos_de_vaga: [
    ["CLT", "FULL_TIME"],
    ["PJ", "CONTRACTOR"],
    ["Estágio", "INTERN"],
    ["Freela", "CONTRACTOR"],
  ],
  niveis: [
    ["Júnior", "var(--categoria-verde-bg)"],
    ["Pleno", "var(--categoria-azul-bg)"],
    ["Sênior", "var(--categoria-roxo-bg)"],
  ],
});

await executarScript(async () => {

/* ─── (0) Autopresença ───────────────────────────────────────────────────── */

secao("(0) a ferramenta está no encadeamento de `npm run verificar`");

{
  let pkg = null;
  try {
    pkg = JSON.parse(ler("package.json") ?? "");
  } catch {
    pkg = null;
  }
  afirmar(
    "script `verificar:carreiras` declarado, rodando esta ferramenta",
    pkg?.scripts?.["verificar:carreiras"] === "node scripts/verificar-carreiras.mjs",
    `encontrado: ${pkg?.scripts?.["verificar:carreiras"] ?? "ausente"}`,
  );
  afirmar(
    "`verificar` termina encadeando `verificar:carreiras`",
    /&& npm run verificar:carreiras$/.test(pkg?.scripts?.verificar ?? ""),
    `encontrado: ${pkg?.scripts?.verificar ?? "ausente"}`,
  );
}

/* ─── (a) A migração nova, lida ──────────────────────────────────────────── */

secao(`(a) a migração ${NOME_DA_MIGRACAO}, lida`);

const sql = ler(path.join("supabase", "migrations", NOME_DA_MIGRACAO));
afirmar("a migração existe", sql !== null, "arquivo ausente em supabase/migrations");

/**
 * Classifica um comando da migração pela LISTA DE PERMISSÃO. Devolve `null`
 * quando o comando é permitido, ou a razão da recusa. `limpo` é a forma que
 * `comandosSql` produz: minúscula, espaços colapsados, literais e corpos `$$`
 * mascarados.
 *
 * A migração só pode: criar os objetos novos (tipo por bloco `do`, tabelas,
 * índices, políticas, gatilhos, funções), ligar RLS e revogar/conceder nelas,
 * comentar, semear as Classificações e avisar o PostgREST. Qualquer outro
 * comando (e qualquer um desses sobre objeto que ela não criou) reprova.
 */
function recusaDoComando(limpo) {
  const tabela = `public\\.(${TABELAS.join("|")})`;
  const funcao = `public\\.(${FUNCOES_NOVAS.join("|")})`;
  const politica = `"(${TABELAS.join("|")})_leitura_(anonima|autenticada)"`;
  const gatilho = `(${TABELAS.join("|")})_tocar_atualizado_em`;
  const restricao = `(${RESTRICOES_DE_VAGAS.join("|")})`;
  const PERMITIDOS = [
    /* A correção de uma restrição de `vagas` (migração 20260924140000): só as
       de nome conhecido, só em `vagas`, `drop … if exists` e `add … check`. */
    new RegExp(`^alter table public\\.vagas drop constraint if exists ${restricao}$`),
    new RegExp(`^alter table public\\.vagas add constraint ${restricao} check \\(`),
    /^do\s*$/,
    new RegExp(`^create table if not exists ${tabela} \\(`),
    new RegExp(`^create (unique )?index if not exists [a-z0-9_]+ on ${tabela} `),
    new RegExp(`^alter table ${tabela} enable row level security$`),
    new RegExp(`^drop policy if exists ${politica} on ${tabela}$`),
    new RegExp(`^create policy ${politica} on ${tabela} for select to (anon|authenticated) using \\(`),
    new RegExp(`^drop trigger if exists ${gatilho} on ${tabela}$`),
    new RegExp(
      `^create trigger ${gatilho} before update on ${tabela} for each row execute function public\\.tocar_atualizado_em\\(\\)$`,
    ),
    new RegExp(`^drop function if exists ${funcao}\\(`),
    new RegExp(`^create or replace function ${funcao}\\(`),
    new RegExp(`^comment on (table|column) ${tabela}(\\.[a-z_]+)? is\\s*$`),
    /^comment on type public\.estado_vaga is\s*$/,
    new RegExp(`^comment on function ${funcao}\\(`),
    new RegExp(`^revoke insert, update, delete, truncate on ${tabela} from (anon|authenticated|public)$`),
    new RegExp(`^grant select on ${tabela} to (anon|authenticated)$`),
    new RegExp(`^insert into public\\.(${CLASSIFICACOES.join("|")}) \\(`),
    /^notify pgrst,\s*$/,
  ];
  return PERMITIDOS.some((padrao) => padrao.test(limpo))
    ? null
    : "comando fora da lista de permissão da migração";
}

/* AUTOTESTE da lista de permissão, nos dois sentidos. Sem ele, um
   classificador que aceitasse tudo deixaria a seção inteira verde. */
{
  const DEVE_RECUSAR = [
    "drop table public.posts",
    "alter table public.posts add column x int",
    "alter table public.categorias enable row level security",
    "create or replace function public.normalizar_busca(p text) returns text",
    "create or replace function public.documento_do_post_e_permitido(doc jsonb) returns boolean",
    "drop function if exists public.html_do_post_e_seguro(text)",
    "grant insert on public.vagas to anon",
    "grant all on public.departamentos to authenticated",
    "update public.categorias set nome = 'x'",
    "delete from public.posts",
    'create policy "vagas_escrita" on public.vagas for insert to authenticated with check (true)',
    'create policy "vagas_leitura_anonima" on public.vagas for all to anon using (true)',
    "insert into public.categorias (nome) values",
    "create table if not exists public.leads (",
    "drop policy if exists \"posts_leitura_anonima\" on public.posts",
    "truncate public.vagas",
    "alter table public.posts drop constraint if exists posts_titulo_nao_vazio",
    "alter table public.posts add constraint posts_titulo_nao_vazio check (",
    "alter table public.vagas drop constraint vagas_aberta_completa",
    "alter table public.vagas add constraint vagas_outra check (",
    "alter table public.vagas drop column titulo",
    "alter table public.departamentos drop constraint if exists departamentos_cor_na_paleta",
  ];
  const DEVE_ACEITAR = [
    "do",
    "create table if not exists public.vagas (",
    "create unique index if not exists niveis_nome_normalizado_unico on public.niveis (",
    'create policy "vagas_leitura_anonima" on public.vagas for select to anon using (estado = )',
    "revoke insert, update, delete, truncate on public.niveis from public",
    "grant select on public.vagas to anon",
    "create or replace function public.situacao_da_vaga(p_slug text)",
    "alter table public.vagas drop constraint if exists vagas_aberta_completa",
    "alter table public.vagas add constraint vagas_link_de_candidatura_valido check (",
  ];
  const escaparam = DEVE_RECUSAR.filter((c) => recusaDoComando(c) === null);
  const barrados = DEVE_ACEITAR.filter((c) => recusaDoComando(c) !== null);
  afirmar(
    "autoteste: a lista de permissão de comandos recusa tocar objeto existente, escrever dado alheio e conceder escrita",
    escaparam.length === 0,
    `passaram: ${escaparam.join(" | ")}`,
  );
  afirmar(
    "autoteste: e aceita os comandos que a migração precisa",
    barrados.length === 0,
    `barrados: ${barrados.join(" | ")}`,
  );
}

/* TODAS AS MIGRAÇÕES DE CARREIRAS, uma a uma. As regras que valem para
   qualquer uma delas (lista de permissão, LF, carimbo, leitura, `search_path`,
   nenhuma função existente redefinida, idempotência das restrições) rodam
   sobre as três; as que descrevem o que a primeira CRIA ficam logo abaixo. */
{
  const pasta = path.join(raiz, "supabase", "migrations");
  const posteriores = existsSync(pasta)
    ? readdirSync(pasta)
        .filter((n) => /^\d{14}_.+\.sql$/.test(n) && n.slice(0, 14) > CARIMBO_DAS_LANDINGS)
        .sort()
    : [];
  afirmar(
    "a lista de migrações de Carreiras cobre TODA migração posterior à das landings, e nada além",
    igual(posteriores, [...MIGRACOES_DE_CARREIRAS]),
    `na pasta: ${posteriores.join(", ") || "nenhuma"} | na lista: ${MIGRACOES_DE_CARREIRAS.join(", ")}`,
  );
  afirmar(
    "as migrações de Carreiras estão na ordem do carimbo",
    igual([...MIGRACOES_DE_CARREIRAS].sort(), [...MIGRACOES_DE_CARREIRAS]),
  );

  for (const nome of MIGRACOES_DE_CARREIRAS) {
    const texto = ler(path.join("supabase", "migrations", nome));
    if (texto === null) {
      afirmar(`${nome}: existe`, false, "arquivo ausente em supabase/migrations");
      continue;
    }
    afirmar(`${nome}: nasce em LF (nenhum CR)`, !texto.includes("\r"));
    afirmar(
      `${nome}: o carimbo é posterior ao das landings (${CARIMBO_DAS_LANDINGS})`,
      nome.slice(0, 14) > CARIMBO_DAS_LANDINGS,
    );
    const analise = analisarSql(texto);
    afirmar(
      `${nome}: não está malformada (o leitor enxerga os comandos)`,
      analise.problemas.length === 0,
      analise.problemas.join("; "),
    );
    const cmds = comandosSql(texto);
    const recusadosAqui = cmds
      .map(({ bruto, limpo }) => [recusaDoComando(limpo), bruto])
      .filter(([razao]) => razao !== null)
      .map(([razao, bruto]) => `${razao}: ${bruto.slice(0, 90)}`);
    afirmar(
      `${nome}: todo comando está na lista de permissão (só objetos de Carreiras; nada anterior é alterado, removido ou redefinido)`,
      cmds.length > 0 && recusadosAqui.length === 0,
      recusadosAqui.slice(0, 5).join(" | ") || `${cmds.length} comando(s)`,
    );
    const limposAqui = cmds.map((c) => c.limpo);
    const redefinidasAqui = FUNCOES_REUSADAS.filter((f) =>
      new RegExp(`\\b(create(\\s+or\\s+replace)?|alter|drop)\\s+function\\s+(if\\s+exists\\s+)?public\\.${f}\\b`, "i").test(
        limposAqui.join(";\n"),
      ),
    );
    afirmar(
      `${nome}: nenhuma função existente do Blog é redefinida, alterada ou removida`,
      redefinidasAqui.length === 0,
      redefinidasAqui.join(", "),
    );
    const semPathAqui = cmds
      .filter(
        (c) =>
          /^create or replace function /.test(c.limpo) &&
          !c.bruto.toLowerCase().replace(/\s+/g, " ").includes("set search_path = ''"),
      )
      .map((c) => c.bruto.slice(0, 70));
    afirmar(`${nome}: toda função criada fixa \`search_path = ''\``, semPathAqui.length === 0, semPathAqui.join(" | "));
    const definersAqui = cmds
      .filter((c) => /^create or replace function /.test(c.limpo) && /\bsecurity definer\b/.test(c.limpo))
      .map((c) => /^create or replace function public\.([a-z_]+)\(/.exec(c.limpo)?.[1]);
    afirmar(
      `${nome}: só as duas funções de entrega podem ser \`security definer\``,
      definersAqui.every((f) => f === "situacao_da_vaga" || f === "vagas_abertas"),
      definersAqui.join(", "),
    );
    /* Restrição refeita: o `drop constraint if exists` de mesmo nome vem ANTES
       do `add constraint`, senão a reaplicação quebra. */
    const semDropDeRestricao = limposAqui
      .map((l) => /^alter table public\.vagas add constraint ([a-z_]+) /.exec(l)?.[1])
      .filter(Boolean)
      .filter((r) => {
        const iDrop = limposAqui.findIndex((l) => l === `alter table public.vagas drop constraint if exists ${r}`);
        const iAdd = limposAqui.findIndex((l) => l.startsWith(`alter table public.vagas add constraint ${r} `));
        return iDrop === -1 || iDrop > iAdd;
      });
    afirmar(
      `${nome}: toda restrição refeita tem o \`drop constraint if exists\` de mesmo nome antes do \`add\``,
      semDropDeRestricao.length === 0,
      semDropDeRestricao.join(", "),
    );
    afirmar(
      `${nome}: o último comando é \`notify pgrst, 'reload schema'\``,
      /^notify pgrst,\s*'reload schema'\s*$/.test(
        cmds.at(-1)?.bruto.replace(/--[^\n]*\n/g, "").replace(/;$/, "").trim().toLowerCase() ?? "",
      ),
      cmds.at(-1)?.bruto.slice(0, 80) ?? "",
    );
  }

  /* O que a correção 20260924140000 PRECISA refazer, lido do arquivo. O
     comportamento é conferido no banco (seções e e f); aqui só se garante que
     a migração não perdeu uma das quatro correções pelo caminho. */
  const correcao = ler(path.join("supabase", "migrations", MIGRACOES_DE_CARREIRAS[2])) ?? "";
  const refeitos = [
    ["public.descricao_da_vaga_e_permitida", /create or replace function public\.descricao_da_vaga_e_permitida\(/],
    ["public.html_da_descricao_e_reduzido", /create or replace function public\.html_da_descricao_e_reduzido\(/],
    ["vagas_link_de_candidatura_valido", /add constraint vagas_link_de_candidatura_valido\b/],
    ["vagas_aberta_completa", /add constraint vagas_aberta_completa\b/],
  ].filter(([, padrao]) => !padrao.test(correcao));
  afirmar(
    "a correção 20260924140000 refaz os dois espelhos da Descrição, o CHECK do link e o invariante da Aberta",
    refeitos.length === 0,
    `faltam: ${refeitos.map(([n]) => n).join(", ")}`,
  );
  afirmar(
    "e avisa no topo que a ORDEM das migrações é a garantia (reaplicar 20260924120000 sozinha recriaria a busca antiga)",
    /20260924120000[\s\S]{0,200}ISOLADAMENTE[\s\S]{0,400}ORDEM/.test(correcao.slice(0, 4000)),
  );
}

if (sql !== null) {
  afirmar("a migração nasce em LF (nenhum CR)", !sql.includes("\r"));
  afirmar(
    `o carimbo é posterior ao das landings (${CARIMBO_DAS_LANDINGS})`,
    NOME_DA_MIGRACAO.slice(0, 14) > CARIMBO_DAS_LANDINGS,
  );
  const analise = analisarSql(sql);
  afirmar(
    "a migração não está malformada (o leitor enxerga os comandos)",
    analise.problemas.length === 0,
    analise.problemas.join("; "),
  );
  const comandos = comandosSql(sql);
  afirmar("o leitor encontrou comandos", comandos.length > 20, `${comandos.length} comando(s)`);

  const recusados = comandos
    .map(({ bruto, limpo }) => [recusaDoComando(limpo), bruto])
    .filter(([razao]) => razao !== null)
    .map(([razao, bruto]) => `${razao}: ${bruto.slice(0, 90)}`);
  afirmar(
    "todo comando da migração está na lista de permissão: só cria objeto novo, nada existente é alterado, removido ou redefinido",
    recusados.length === 0,
    recusados.slice(0, 5).join(" | "),
  );

  const limpos = comandos.map((c) => c.limpo);
  const tem = (padrao) => limpos.some((l) => padrao.test(l));

  const semRls = TABELAS.filter(
    (t) =>
      !tem(new RegExp(`^create table if not exists public\\.${t} \\(`)) ||
      !tem(new RegExp(`^alter table public\\.${t} enable row level security$`)),
  );
  afirmar(
    "as quatro tabelas são criadas com `public.` e `if not exists`, com a RLS ligada no mesmo arquivo",
    semRls.length === 0,
    semRls.join(", "),
  );

  /* As políticas: exatamente as oito, só de leitura, cada uma com o `drop …
     if exists` de MESMA grafia antes, e com o predicado que a spec manda. */
  const politicasCriadas = comandos
    .filter((c) => /^create policy/.test(c.limpo))
    .map((c) => /^create policy "([a-z_]+)"/.exec(c.limpo)?.[1] ?? "?");
  const politicasEsperadas = TABELAS.flatMap((t) => [
    `${t}_leitura_anonima`,
    `${t}_leitura_autenticada`,
  ]);
  afirmar(
    "as políticas são EXATAMENTE as oito de leitura (anônima e autenticada de cada tabela)",
    igual(ordenado(politicasCriadas), ordenado(politicasEsperadas)),
    politicasCriadas.join(", "),
  );
  const semDrop = politicasEsperadas.filter((p) => {
    const iDrop = limpos.findIndex((l) => l.startsWith(`drop policy if exists "${p}" on `));
    const iCreate = limpos.findIndex((l) => l.startsWith(`create policy "${p}" on `));
    return iDrop === -1 || iCreate === -1 || iDrop > iCreate;
  });
  afirmar(
    "toda política tem o `drop policy if exists` de mesma grafia ANTES do `create`",
    semDrop.length === 0,
    semDrop.join(", "),
  );
  const predicado = (nome) => {
    const cmd = comandos.find((c) => c.limpo.startsWith(`create policy "${nome}" on `));
    if (!cmd) return null;
    const cru = cmd.bruto.replace(/\s+/g, " ").trim().toLowerCase();
    return /\busing\s*\((.*)\)\s*;?$/.exec(cru)?.[1]?.trim() ?? null;
  };
  afirmar(
    "a política anônima de `vagas` é `estado = 'aberta'`, e nada além",
    predicado("vagas_leitura_anonima") === "estado = 'aberta'",
    `encontrado: ${predicado("vagas_leitura_anonima")}`,
  );
  const outrasTrue = politicasEsperadas.filter(
    (p) => p !== "vagas_leitura_anonima" && predicado(p) !== "true",
  );
  afirmar(
    "as demais sete políticas são `using (true)` (o Painel vê tudo; as Classificações são vocabulário público)",
    outrasTrue.length === 0,
    outrasTrue.map((p) => `${p}: ${predicado(p)}`).join(" | "),
  );
  const papelErrado = politicasEsperadas.filter((p) => {
    const cmd = limpos.find((l) => l.startsWith(`create policy "${p}" on `)) ?? "";
    const papel = p.endsWith("_anonima") ? "anon" : "authenticated";
    return !cmd.includes(` for select to ${papel} using `);
  });
  afirmar(
    "cada política é `for select` e para o papel do nome (anônima para anon, autenticada para authenticated)",
    papelErrado.length === 0,
    papelErrado.join(", "),
  );

  /* Privilégio: revogação de escrita de cada papel, concessão de leitura. */
  const semRevoke = TABELAS.flatMap((t) =>
    ["anon", "authenticated", "public"]
      .filter((p) => !limpos.includes(`revoke insert, update, delete, truncate on public.${t} from ${p}`))
      .map((p) => `${t}/${p}`),
  );
  afirmar(
    "escrita revogada de anon, authenticated e public nas quatro tabelas",
    semRevoke.length === 0,
    semRevoke.join(", "),
  );
  const semGrant = TABELAS.flatMap((t) =>
    ["anon", "authenticated"]
      .filter((p) => !limpos.includes(`grant select on public.${t} to ${p}`))
      .map((p) => `${t}/${p}`),
  );
  afirmar(
    "leitura concedida explicitamente a anon e authenticated nas quatro tabelas",
    semGrant.length === 0,
    semGrant.join(", "),
  );

  /* Gatilhos, com o `drop` de mesma grafia antes. */
  const semGatilho = TABELAS.filter((t) => {
    const nome = `${t}_tocar_atualizado_em`;
    const iDrop = limpos.findIndex((l) => l.startsWith(`drop trigger if exists ${nome} on public.${t}`));
    const iCreate = limpos.findIndex((l) => l.startsWith(`create trigger ${nome} before update on public.${t}`));
    return iDrop === -1 || iCreate === -1 || iDrop > iCreate;
  });
  afirmar(
    "as quatro tabelas têm o gatilho `tocar_atualizado_em`, com o `drop trigger if exists` antes",
    semGatilho.length === 0,
    semGatilho.join(", "),
  );

  /* Funções: as cinco novas, e nenhuma das reusadas redefinida. */
  const criadas = comandos
    .filter((c) => /^create or replace function /.test(c.limpo))
    .map((c) => /^create or replace function public\.([a-z_]+)\(/.exec(c.limpo)?.[1] ?? "?");
  afirmar(
    "a migração cria exatamente as cinco funções novas",
    igual(ordenado(criadas), ordenado(FUNCOES_NOVAS)),
    criadas.join(", "),
  );
  const redefinidas = FUNCOES_REUSADAS.filter((f) =>
    new RegExp(`\\b(create(\\s+or\\s+replace)?|alter|drop)\\s+function\\s+(if\\s+exists\\s+)?public\\.${f}\\b`, "i").test(
      comandos.map((c) => c.limpo).join(";\n"),
    ),
  );
  afirmar(
    "nenhuma função existente é redefinida, alterada ou removida (só CHAMADA)",
    redefinidas.length === 0,
    redefinidas.join(", "),
  );
  const chamadas = ["documento_do_post_e_permitido", "html_do_post_e_seguro", "nos_do_documento", "normalizar_busca", "tocar_atualizado_em"]
    .filter((f) => !sql.includes(`public.${f}(`));
  afirmar(
    "e as cinco funções existentes que a spec nomeia são de fato reusadas por chamada",
    chamadas.length === 0,
    `não chamadas: ${chamadas.join(", ")}`,
  );
  /* As funções de entrega e a busca: `drop function if exists` de mesma
     assinatura antes. Os dois espelhos da restrição ficam só com `create or
     replace`: a restrição de `vagas` depende deles, e um `drop` numa
     reaplicação derrubaria a migração. */
  const semDropDeFuncao = FUNCOES_NOVAS.filter((f) => !FUNCOES_DA_RESTRICAO.includes(f)).filter((f) => {
    const iDrop = limpos.findIndex((l) => l.startsWith(`drop function if exists public.${f}(`));
    const iCreate = limpos.findIndex((l) => l.startsWith(`create or replace function public.${f}(`));
    return iDrop === -1 || iCreate === -1 || iDrop > iCreate;
  });
  afirmar(
    "as três funções de leitura têm o `drop function if exists` de mesma grafia antes do `create`",
    semDropDeFuncao.length === 0,
    semDropDeFuncao.join(", "),
  );
  /* O literal `''` some da forma mascarada; é o texto cru que diz. */
  const comPathFixo = (c) => c.bruto.toLowerCase().replace(/\s+/g, " ").includes("set search_path = ''");
  const definerSemPath = comandos
    .filter((c) => /\bsecurity definer\b/.test(c.limpo) && !comPathFixo(c))
    .map((c) => c.bruto.slice(0, 70));
  afirmar(
    "toda função `security definer` fixa `search_path = ''`",
    definerSemPath.length === 0,
    definerSemPath.join(" | "),
  );
  const funcoesSemPath = comandos
    .filter((c) => /^create or replace function /.test(c.limpo) && !comPathFixo(c))
    .map((c) => c.bruto.slice(0, 70));
  afirmar(
    "e toda função nova, definer ou não, fixa `search_path = ''`",
    funcoesSemPath.length === 0,
    funcoesSemPath.join(" | "),
  );
  const definers = comandos
    .filter((c) => /^create or replace function /.test(c.limpo) && /\bsecurity definer\b/.test(c.limpo))
    .map((c) => /^create or replace function public\.([a-z_]+)\(/.exec(c.limpo)?.[1]);
  afirmar(
    "só as duas funções de entrega são `security definer`",
    igual(ordenado(definers), ["situacao_da_vaga", "vagas_abertas"]),
    definers.join(", "),
  );

  afirmar(
    "o enum `public.estado_vaga` é criado por bloco que confere `pg_type` (não há `create type if not exists`)",
    /create type public\.estado_vaga as enum \(\s*'rascunho',\s*'aberta',\s*'encerrada'\s*\)/.test(sql) &&
      /t\.typname = 'estado_vaga'/.test(sql),
  );
  afirmar(
    "as FKs são `on delete restrict` e apontam para `public.`",
    ["departamentos", "tipos_de_vaga", "niveis"].every((t) =>
      new RegExp(`references public\\.${t} \\(id\\) on delete restrict`).test(sql),
    ),
  );
  const restricoesNomeadas = [
    "vagas_titulo_valido",
    "vagas_slug_formato",
    "vagas_slug_unico",
    "vagas_modalidade_valida",
    "vagas_resumo_tamanho",
    "vagas_localizacao_tamanho",
    "vagas_link_de_candidatura_valido",
    "vagas_aberta_em_obrigatorio",
    "vagas_aberta_completa",
    "vagas_descricao_na_projecao",
    "vagas_descricao_html_segura",
  ].filter((n) => !new RegExp(`constraint ${n}\\b`).test(sql));
  afirmar("as restrições de `vagas` têm os nomes que a spec usa", restricoesNomeadas.length === 0, restricoesNomeadas.join(", "));
  afirmar(
    "a restrição da Descrição chama a defesa do Post E o espelho da projeção",
    /public\.documento_do_post_e_permitido\(descricao\)\s+and public\.descricao_da_vaga_e_permitida\(descricao\)/.test(sql) &&
      /public\.html_do_post_e_seguro\(descricao_html\)\s+and public\.html_da_descricao_e_reduzido\(descricao_html\)/.test(sql),
  );
  const indices = CLASSIFICACOES.filter(
    (t) =>
      !new RegExp(
        `create unique index if not exists ${t}_nome_normalizado_unico\\s+on public\\.${t} \\(public\\.normalizar_busca\\(nome\\)\\)`,
      ).test(sql),
  );
  afirmar(
    "o nome único de cada Classificação é índice sobre `public.normalizar_busca(nome)`",
    indices.length === 0,
    indices.join(", "),
  );

  /* A semeadura: entre marcadores, uma inserção por lista, cada uma segura
     por nome normalizado. */
  const semeadura = /-- semeadura:inicio\n([\s\S]*?)-- semeadura:fim/.exec(sql)?.[1] ?? null;
  afirmar("a semeadura está entre os marcadores `semeadura:inicio` e `semeadura:fim`", semeadura !== null);
  if (semeadura !== null) {
    const insercoes = comandosSql(semeadura).map((c) => c.limpo);
    afirmar(
      "a semeadura tem uma inserção por Classificação, cada uma com `where not exists` por nome normalizado",
      insercoes.length === 3 &&
        CLASSIFICACOES.every((t) =>
          insercoes.some(
            (l) =>
              l.startsWith(`insert into public.${t} (`) &&
              /where not exists \( select 1 from public\.[a-z_]+ [a-z] where public\.normalizar_busca\([a-z]\.nome\) = public\.normalizar_busca\(v\.nome\) \)/.test(l),
          ),
        ),
      insercoes.map((l) => l.slice(0, 60)).join(" | "),
    );
  }
  afirmar(
    "o último comando é `notify pgrst, 'reload schema'`",
    /^notify pgrst,\s*'reload schema'\s*$/.test(
      comandos.at(-1)?.bruto.replace(/--[^\n]*\n/g, "").replace(/;$/, "").trim().toLowerCase() ?? "",
    ),
    comandos.at(-1)?.bruto ?? "",
  );
}

/* ─── (b) O domínio, executado ───────────────────────────────────────────── */

secao("(b) o domínio de Carreiras, importado e executado");

{
  const { ESTADOS_DA_VAGA, aparenciaDoEstadoDaVaga, ehEstadoDaVaga, SITUACOES_DA_VAGA } = estadosDaVaga;
  afirmar(
    "os Estados da Vaga são rascunho, aberta e encerrada, nesta ordem, congelados",
    igual([...ESTADOS_DA_VAGA], ["rascunho", "aberta", "encerrada"]) && Object.isFrozen(ESTADOS_DA_VAGA),
    JSON.stringify(ESTADOS_DA_VAGA),
  );
  const TOKENS = {
    rascunho: ["Rascunho", "rascunho"],
    aberta: ["Aberta", "publicado"],
    encerrada: ["Encerrada", "arquivado"],
  };
  const aparenciasErradas = Object.entries(TOKENS).filter(([estado, [rotulo, token]]) => {
    const a = aparenciaDoEstadoDaVaga(estado);
    return (
      a.rotulo !== rotulo ||
      a.fundo !== `var(--state-${token}-bg)` ||
      a.tinta !== `var(--state-${token}-ink)` ||
      !Object.isFrozen(a)
    );
  });
  afirmar(
    "o catálogo reusa os tokens de Estado (Rascunho: rascunho, Aberta: publicado, Encerrada: arquivado), sem token novo",
    aparenciasErradas.length === 0,
    aparenciasErradas.map(([e]) => e).join(", "),
  );
  const css = ler("src/App.css") ?? "";
  const tokensAusentes = ["rascunho", "publicado", "arquivado"]
    .flatMap((t) => [`--state-${t}-bg`, `--state-${t}-ink`])
    .filter((t) => !new RegExp(`${t}\\s*:`).test(css));
  afirmar("e os seis tokens usados existem em src/App.css", tokensAusentes.length === 0, tokensAusentes.join(", "));
  const naoLancaram = [undefined, null, "", "Aberta", "publicado", "arquivada", 1].filter((v) => {
    try {
      aparenciaDoEstadoDaVaga(v);
      return true;
    } catch {
      return false;
    }
  });
  afirmar(
    "`aparenciaDoEstadoDaVaga` lança fora do vocabulário (inclusive caixa diferente e Estado do Post)",
    naoLancaram.length === 0,
    JSON.stringify(naoLancaram),
  );
  afirmar(
    "`ehEstadoDaVaga` responde sem lançar",
    ehEstadoDaVaga("aberta") && !ehEstadoDaVaga("Aberta") && !ehEstadoDaVaga(null) && !ehEstadoDaVaga("publicado"),
  );
  afirmar(
    "a situação da entrega é aberta, encerrada e inexistente",
    igual([...SITUACOES_DA_VAGA], ["aberta", "encerrada", "inexistente"]),
  );
}

{
  const { acoesDoEstadoDaVaga, transicaoDaVagaPermitida, exclusaoDaVagaPermitida, motivoDaRecusa, acaoDoEstadoDaVaga } =
    transicoesDaVaga;
  /* A TABELA DA SPEC (C-FR-13), escrita aqui como expectativa independente. */
  const TABELA = {
    rascunho: [["abrir", "aberta"], ["excluir", null]],
    aberta: [["encerrar", "encerrada"]],
    encerrada: [["reabrir", "aberta"], ["excluir", null]],
  };
  const divergentes = Object.entries(TABELA).filter(([estado, esperado]) => {
    const obtido = acoesDoEstadoDaVaga(estado).map((a) => [a.chave, a.destino]);
    return !igual(obtido, esperado);
  });
  afirmar(
    "a MAQUINA é a tabela de C-FR-13: abrir, encerrar, reabrir, e excluir só de Rascunho ou Encerrada",
    divergentes.length === 0,
    divergentes
      .map(([e]) => `${e}: ${JSON.stringify(acoesDoEstadoDaVaga(e).map((a) => [a.chave, a.destino]))}`)
      .join(" | "),
  );
  const PERMITIDAS = new Set(["rascunho>aberta", "aberta>encerrada", "encerrada>aberta"]);
  const erradas = [];
  for (const de of ["rascunho", "aberta", "encerrada"]) {
    for (const para of ["rascunho", "aberta", "encerrada"]) {
      if (transicaoDaVagaPermitida(de, para) !== PERMITIDAS.has(`${de}>${para}`)) erradas.push(`${de}>${para}`);
    }
  }
  afirmar(
    "`transicaoDaVagaPermitida` nas nove combinações: só as três transições da tabela",
    erradas.length === 0,
    erradas.join(", "),
  );
  afirmar(
    "`transicaoDaVagaPermitida` não lança e recusa Estado desconhecido dos dois lados",
    transicaoDaVagaPermitida("publicado", "aberta") === false &&
      transicaoDaVagaPermitida("rascunho", "publicado") === false &&
      transicaoDaVagaPermitida(null, undefined) === false &&
      transicaoDaVagaPermitida("rascunho", null) === false,
  );
  afirmar(
    "excluir: permitido em Rascunho e Encerrada, recusado em Aberta e em valor desconhecido",
    exclusaoDaVagaPermitida("rascunho") === true &&
      exclusaoDaVagaPermitida("encerrada") === true &&
      exclusaoDaVagaPermitida("aberta") === false &&
      exclusaoDaVagaPermitida("x") === false,
  );
  let lancou = false;
  try {
    acoesDoEstadoDaVaga("publicado");
  } catch {
    lancou = true;
  }
  afirmar("`acoesDoEstadoDaVaga` lança fora do vocabulário", lancou);
  afirmar(
    "`acaoDoEstadoDaVaga` acha a ação pela chave e devolve null para o resto, sem lançar",
    acaoDoEstadoDaVaga("aberta", "encerrar")?.destino === "encerrada" &&
      acaoDoEstadoDaVaga("aberta", "excluir") === null &&
      acaoDoEstadoDaVaga("xyz", "abrir") === null,
  );
  const frases = [
    motivoDaRecusa("aberta", "rascunho"),
    motivoDaRecusa("aberta", null),
    motivoDaRecusa("rascunho", "publicado"),
    motivoDaRecusa("x", "aberta"),
    ...["rascunho", "aberta", "encerrada"].flatMap((e) =>
      acoesDoEstadoDaVaga(e).flatMap((a) => [a.rotulo, a.confirmacao]),
    ),
  ];
  afirmar(
    "rótulos, confirmações e motivos de recusa existem e não têm travessão",
    frases.every((f) => typeof f === "string" && f.trim() !== "" && !f.includes("—")),
    frases.filter((f) => typeof f !== "string" || f.includes("—")).join(" | "),
  );
  afirmar(
    "a recusa de excluir uma Aberta diz o caminho (encerrar antes)",
    /Encerr/.test(motivoDaRecusa("aberta", null)),
    motivoDaRecusa("aberta", null),
  );
  /* MOVIMENTO PERMITIDO NÃO TEM MOTIVO DE RECUSA, e o conselho "encerre
     antes" é só da Aberta. Julgado nas doze combinações (três Estados de
     origem, os três destinos e a exclusão), contra a tabela da spec. */
  const EXCLUSAO_PERMITIDA = new Set(["rascunho", "encerrada"]);
  const motivosErrados = [];
  for (const de of ["rascunho", "aberta", "encerrada"]) {
    for (const para of ["rascunho", "aberta", "encerrada", null]) {
      const permitido = para === null ? EXCLUSAO_PERMITIDA.has(de) : PERMITIDAS.has(`${de}>${para}`);
      const motivo = motivoDaRecusa(de, para);
      const conselho = typeof motivo === "string" && motivo.includes("Encerre a vaga antes");
      const certo = permitido
        ? motivo === null
        : typeof motivo === "string" && motivo !== "" && conselho === (de === "aberta" && para === null);
      if (!certo) motivosErrados.push(`${de}>${para}: ${JSON.stringify(motivo)}`);
    }
  }
  afirmar(
    "`motivoDaRecusa` devolve null para movimento permitido (rascunho>excluir, encerrada>excluir, abrir, encerrar, reabrir), frase para o resto, e \"Encerre a vaga antes\" só para excluir a Aberta",
    motivosErrados.length === 0,
    motivosErrados.join(" | "),
  );
}

{
  const c = classificacoes;
  afirmar(
    "as três listas de Classificação: departamento, tipo e nível, com as tabelas do banco",
    igual(
      c.LISTAS_DE_CLASSIFICACAO.map((l) => [l.chave, l.tabela, l.coluna]),
      [
        ["departamento", "departamentos", "departamento_id"],
        ["tipo", "tipos_de_vaga", "tipo_id"],
        ["nivel", "niveis", "nivel_id"],
      ],
    ),
  );
  afirmar(
    "Modalidades: presencial, híbrido e remoto, com rótulo",
    igual(c.MODALIDADES.map((m) => [m.valor, m.rotulo]), [
      ["presencial", "Presencial"],
      ["hibrido", "Híbrido"],
      ["remoto", "Remoto"],
    ]),
  );
  afirmar(
    "os Equivalentes JobPosting são os oito da spec",
    igual([...c.EQUIVALENTES_JOBPOSTING], [
      "FULL_TIME",
      "PART_TIME",
      "CONTRACTOR",
      "TEMPORARY",
      "INTERN",
      "VOLUNTEER",
      "PER_DIEM",
      "OTHER",
    ]),
  );
  afirmar(
    "a paleta das Classificações É a das Categorias (o mesmo objeto, não uma cópia)",
    c.CORES_DE_CLASSIFICACAO === CORES_DE_CATEGORIA,
  );
  afirmar(
    "`ehCorDeClassificacao` aceita só a paleta",
    CORES_DE_CATEGORIA.every((cor) => c.ehCorDeClassificacao(cor)) &&
      !c.ehCorDeClassificacao("#ff0000") &&
      !c.ehCorDeClassificacao("bg-blue-500") &&
      !c.ehCorDeClassificacao(null),
  );
  afirmar(
    "nome da Classificação: vazio e acima de 80 caracteres são recusados, 80 passa, o espaço é colapsado",
    c.problemaNoNomeDaClassificacao("   ") !== null &&
      c.problemaNoNomeDaClassificacao("x".repeat(81)) !== null &&
      c.problemaNoNomeDaClassificacao("x".repeat(80)) === null &&
      c.normalizarNomeDeClassificacao("  Customer   Success ") === "Customer Success",
  );
  afirmar(
    "Localização é exigida por presencial e híbrido, não por remoto",
    c.modalidadeExigeLocalizacao("presencial") &&
      c.modalidadeExigeLocalizacao("hibrido") &&
      !c.modalidadeExigeLocalizacao("remoto") &&
      !c.modalidadeExigeLocalizacao(null),
  );
}

/**
 * As formas de Link de Candidatura que a revisão da 5.2 achou passando, todas
 * recusadas pelos DOIS lados (domínio aqui, CHECK na seção f): relativo com
 * esquema, host ausente, controle C1, DEL, NBSP, separador de linha Unicode,
 * espaço depois de `//`.
 */
const MATRIZ_DO_LINK_REVISADA = Object.freeze([
  "https:x",
  "http:/x",
  "https:///x",
  "HTTPS:///x",
  "https://",
  "https://x.com/\u0085",
  "https://x.com/\u009f",
  "https://x.com/\u007f",
  "https://x.com/a b",
  "https://x.com/ ",
  "https:// x.com",
  "https:// x.com",
]);

/** Um documento de um parágrafo só, com o texto dado. */
const docDeTexto = (texto) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: texto }] }],
});

/** Uma Vaga que pode abrir: a base das tabelas de caso abaixo. */
const DOC_VALIDO = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Descrição da vaga de verificação." }] }],
};
const HTML_VALIDO = derivarHtml(DOC_VALIDO, descricaoDaVaga.VOCABULARIO_DA_VAGA).html ?? "";
const VAGA_QUE_ABRE = Object.freeze({
  titulo: "Vaga de verificação",
  slug: "vaga-de-verificacao",
  departamento_id: "11111111-1111-4111-8111-111111111111",
  tipo_id: "22222222-2222-4222-8222-222222222222",
  nivel_id: "33333333-3333-4333-8333-333333333333",
  modalidade: "presencial",
  localizacao: "Cidade de teste, RN",
  resumo: "Resumo da vaga de verificação.",
  descricao: DOC_VALIDO,
  descricao_html: HTML_VALIDO,
  link_de_candidatura: "https://exemplo.com/vaga",
});

/**
 * Os casos do INVARIANTE DA ABERTA: cada um é uma alteração sobre a Vaga que
 * abre, e o que ela deixa faltando. A mesma tabela é executada no domínio
 * (aqui) e no banco (seção f), e é isso que prova que os dois concordam.
 */
const CASOS_DO_INVARIANTE = Object.freeze([
  ["completa", {}, []],
  ["sem resumo", { resumo: "" }, ["resumo"]],
  ["resumo só de espaço", { resumo: "   " }, ["resumo"]],
  ["sem link", { link_de_candidatura: null }, ["link_de_candidatura"]],
  [
    "descrição vazia",
    { descricao: schema.documentoVazio(), descricao_html: "<p></p>" },
    ["descricao"],
  ],
  ["presencial sem localização", { localizacao: "" }, ["localizacao"]],
  ["híbrido sem localização", { modalidade: "hibrido", localizacao: "" }, ["localizacao"]],
  ["remota sem localização", { modalidade: "remoto", localizacao: "" }, []],
  ["sem modalidade", { modalidade: null }, ["modalidade"]],
  /* Só entidade ou espaço não é Descrição (revisão da 5.2): o HTML decodificado
     e o documento precisam ter um caractere que não é espaço. NBSP é espaço
     nos dois lados, qualquer que seja o locale do banco. */
  [
    "Descrição só com &nbsp;",
    { descricao: docDeTexto(" "), descricao_html: "<p>&nbsp;</p>" },
    ["descricao"],
  ],
  [
    "Descrição só com &#32;",
    { descricao: docDeTexto(" "), descricao_html: "<p>&#32;</p>" },
    ["descricao"],
  ],
  ["Resumo só com NBSP", { resumo: "  " }, ["resumo"]],
  ["presencial com Localização só de NBSP", { localizacao: " " }, ["localizacao"]],
]);

{
  const { problemasParaAbrir, linkDeCandidaturaValido, LIMITES_DA_VAGA, slugDaVaga, CAMPOS_PARA_ABRIR } = regrasDaVaga;
  afirmar("o HTML da Vaga de exemplo foi derivado pelo renderizador único", HTML_VALIDO.includes("<p>"));
  const divergentes = CASOS_DO_INVARIANTE.filter(
    ([, patch, esperado]) => !igual([...problemasParaAbrir({ ...VAGA_QUE_ABRE, ...patch })], esperado),
  );
  afirmar(
    "`problemasParaAbrir` na tabela do invariante: o campo que falta, e nada além",
    divergentes.length === 0,
    divergentes
      .map(([nome, patch]) => `${nome}: ${JSON.stringify(problemasParaAbrir({ ...VAGA_QUE_ABRE, ...patch }))}`)
      .join(" | "),
  );
  afirmar(
    "sem nada, faltam os dez campos, na ordem do formulário, e nada lança",
    igual([...problemasParaAbrir({})], [...CAMPOS_PARA_ABRIR]) &&
      igual([...problemasParaAbrir(null)], [...CAMPOS_PARA_ABRIR]) &&
      CAMPOS_PARA_ABRIR.length === 10,
    JSON.stringify(problemasParaAbrir({})),
  );
  afirmar(
    "a Descrição conta pelo documento quando não há HTML: com texto passa, vazia falta",
    problemasParaAbrir({ ...VAGA_QUE_ABRE, descricao_html: undefined }).length === 0 &&
      igual([...problemasParaAbrir({ ...VAGA_QUE_ABRE, descricao_html: undefined, descricao: schema.documentoVazio() })], [
        "descricao",
      ]),
  );
  afirmar(
    "o DOCUMENTO manda: documento vazio ao lado de um HTML com texto é Descrição faltando (o par torto não conta como preenchido)",
    igual([...problemasParaAbrir({ ...VAGA_QUE_ABRE, descricao: schema.documentoVazio() })], ["descricao"]) &&
      igual([...problemasParaAbrir({ ...VAGA_QUE_ABRE, descricao: docDeTexto("  ") })], ["descricao"]),
    JSON.stringify(problemasParaAbrir({ ...VAGA_QUE_ABRE, descricao: schema.documentoVazio() })),
  );
  afirmar(
    "e só o HTML, sem documento, também conta pelo texto DECODIFICADO (`&nbsp;` e `&#32;` são espaço; `&amp;` é texto)",
    igual([...problemasParaAbrir({ ...VAGA_QUE_ABRE, descricao: undefined, descricao_html: "<p>&nbsp;&#32;&#x20;</p>" })], [
      "descricao",
    ]) &&
      problemasParaAbrir({ ...VAGA_QUE_ABRE, descricao: undefined, descricao_html: "<p>&amp;</p>" }).length === 0 &&
      igual([...problemasParaAbrir({ ...VAGA_QUE_ABRE, descricao: undefined, descricao_html: undefined })], ["descricao"]),
  );
  /* OS TETOS de `LIMITES_DA_VAGA`: o banco recusa acima deles com outra
     restrição (tamanho), e o domínio aponta o MESMO campo antes de gravar. */
  const CASOS_DE_LIMITE = [
    ["título com 121", { titulo: "x".repeat(121) }, ["titulo"]],
    ["Resumo com 201", { resumo: "x".repeat(201) }, ["resumo"]],
    ["Localização com 81 (presencial)", { localizacao: "x".repeat(81) }, ["localizacao"]],
    ["Localização com 81 (remota: o teto vale igual)", { modalidade: "remoto", localizacao: "x".repeat(81) }, ["localizacao"]],
    ["no teto: 120, 200 e 80", { titulo: "x".repeat(120), resumo: "x".repeat(200), localizacao: "x".repeat(80) }, []],
    ["teto contado por ponto de código (120 emojis)", { titulo: "\u{1F600}".repeat(120) }, []],
  ];
  const limitesErrados = CASOS_DE_LIMITE.filter(
    ([, patch, esperado]) => !igual([...problemasParaAbrir({ ...VAGA_QUE_ABRE, ...patch })], esperado),
  );
  afirmar(
    "`problemasParaAbrir` confere os tetos: título 120, Resumo 200 e Localização 80 (em toda Modalidade), contados por ponto de código",
    limitesErrados.length === 0,
    limitesErrados.map(([nome, patch]) => `${nome}: ${JSON.stringify(problemasParaAbrir({ ...VAGA_QUE_ABRE, ...patch }))}`).join(" | "),
  );
  afirmar(
    "Link inválido, Slug fora do formato e Classificação ausente também faltam",
    igual([...problemasParaAbrir({ ...VAGA_QUE_ABRE, link_de_candidatura: "javascript:x" })], ["link_de_candidatura"]) &&
      igual([...problemasParaAbrir({ ...VAGA_QUE_ABRE, slug: "Com Espaco" })], ["slug"]) &&
      igual([...problemasParaAbrir({ ...VAGA_QUE_ABRE, nivel_id: "" })], ["nivel"]),
  );

  /* A matriz do Link de Candidatura: a da spec, mais as formas da revisão.
     TROCA REGISTRADA (revisão da 5.2): `HTTPS://x.com` passou de recusado a
     ACEITO, porque o esquema de URL não tem caixa. A mesma matriz roda no
     banco, na seção (f). */
  const MATRIZ_DO_LINK = [
    ["https://x.com/v", true],
    ["http://a.b", true],
    ["mailto:a@b", false],
    ["javascript:x", false],
    ["/vaga", false],
    ["ftp://x", false],
    ["", false],
    ["https://x .com", false],
    ["HTTPS://x.com", true],
    ["Http://a.b/Caminho", true],
    [null, false],
    [42, false],
    [`https://x.com/${"a".repeat(2048)}`, false],
  ];
  for (const valor of MATRIZ_DO_LINK_REVISADA) MATRIZ_DO_LINK.push([valor, false]);
  const linkErrado = MATRIZ_DO_LINK.filter(([valor, esperado]) => {
    try {
      return linkDeCandidaturaValido(valor) !== esperado;
    } catch {
      return true;
    }
  });
  afirmar(
    "Link de Candidatura: aceita http e https com host (qualquer caixa no esquema); recusa mailto, javascript, relativo, ftp, vazio, `https:x`, `http:/x`, `https:///x`, espaço (inclusive NBSP e U+2028), controle C0 e C1, e nunca lança",
    linkErrado.length === 0,
    linkErrado.map(([v]) => JSON.stringify(v)?.slice(0, 40)).join(", "),
  );

  /* O link DA DESCRIÇÃO (projeção): o mesmo recorte de host. */
  const hrefDaDescricao = schema.enderecoPermitidoNaDescricao;
  const DESCRICAO_ACEITA = ["https://chatclean.com.br", "HTTPS://CHATCLEAN.COM.BR", "http://a.b/x", "mailto:vagas@chatclean.com.br", "&#104;ttps://chatclean.com.br"];
  const DESCRICAO_RECUSA = ["https:relativo", "http:/x", "https:///x", "http://", "HTTPS:/x", "/carreiras", "tel:+5584999999999", "https:// x.com"];
  const hrefErrado = [
    ...DESCRICAO_ACEITA.filter((h) => hrefDaDescricao(h) !== true),
    ...DESCRICAO_RECUSA.filter((h) => hrefDaDescricao(h) !== false),
  ];
  afirmar(
    "link da Descrição: `https:relativo`, `http:/x` e `https:///x` são recusados (esquema certo, sem host); http/https com host em qualquer caixa e mailto passam",
    hrefErrado.length === 0,
    hrefErrado.join(" | "),
  );
  afirmar(
    "os limites são título 120, Resumo 200, Localização 80, Slug 200 e Link 2048",
    LIMITES_DA_VAGA.titulo === 120 &&
      LIMITES_DA_VAGA.resumo === 200 &&
      LIMITES_DA_VAGA.localizacao === 80 &&
      LIMITES_DA_VAGA.slug === 200 &&
      LIMITES_DA_VAGA.link_de_candidatura === 2048,
  );
  afirmar(
    "o Slug da Vaga é o do Post (`gerarSlug`)",
    ["Especialista em Customer Success", "Desenvolvedor(a) Sênior / Node", "!!!", "Ação & Reação"].every((t) =>
      igual(slugDaVaga(t), gerarSlug(t)),
    ) && slugDaVaga("Especialista em Customer Success").slug === "especialista-em-customer-success",
  );
}

{
  const { VOCABULARIO_DA_VAGA, validarDescricao } = descricaoDaVaga;
  const D = schema.VOCABULARIO_DA_DESCRICAO;
  afirmar(
    "o vocabulário da Vaga é a projeção (os MESMOS nós, marcas, elementos e regra de link), com mensagens próprias",
    VOCABULARIO_DA_VAGA.nos === D.nos &&
      VOCABULARIO_DA_VAGA.marcas === D.marcas &&
      VOCABULARIO_DA_VAGA.elementos === D.elementos &&
      VOCABULARIO_DA_VAGA.enderecoPermitido === D.enderecoPermitido &&
      VOCABULARIO_DA_VAGA.mensagens !== D.mensagens,
  );
  const mensagens = Object.values(VOCABULARIO_DA_VAGA.mensagens);
  afirmar(
    "as mensagens de Carreiras falam da vaga e não têm travessão",
    mensagens.length === 3 &&
      mensagens.every((m) => typeof m === "string" && /vaga/i.test(m) && !m.includes("—")),
    mensagens.join(" | "),
  );
  const sujo = {
    type: "doc",
    content: [
      { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "citado" }] }] },
      { type: "paragraph", attrs: { textAlign: "center" }, content: [{ type: "text", text: "ok" }] },
    ],
  };
  const limpo = validarDescricao(sujo);
  afirmar(
    "`validarDescricao` descarta o que não é da projeção (citação, alinhamento) sem lançar",
    limpo.ok === true &&
      limpo.totalDescartado > 0 &&
      JSON.stringify(limpo.documento) === JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "ok" }] }] }),
    JSON.stringify(limpo.documento),
  );
  const recusa = validarDescricao(null);
  afirmar(
    "e o que não é documento volta `{ ok: false }` com a frase da vaga",
    recusa.ok === false && recusa.erro?.mensagem === VOCABULARIO_DA_VAGA.mensagens.vazio,
  );
}

{
  /* PUREZA: o domínio de Carreiras só importa de si e das funções puras de
     `domain/blog`. Sem React, sem Supabase, sem rede, sem armazenamento. */
  const dir = path.join(raiz, "src", "domain", "carreiras");
  const arquivos = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".js")) : [];
  afirmar(
    "src/domain/carreiras/ tem os cinco módulos da spec",
    ["estados.js", "transicoes.js", "classificacoes.js", "vaga.js", "descricao.js"].every((n) => arquivos.includes(n)),
    arquivos.join(", "),
  );
  const impuros = [];
  for (const nome of arquivos) {
    const texto = semComentarios(readFileSync(path.join(dir, nome), "utf8"));
    for (const origem of origensDeImport(texto)) {
      if (!((origem.startsWith("./") && !origem.includes("..")) || /^\.\.\/blog\/[a-z]+\.js$/i.test(origem))) {
        impuros.push(`${nome} → ${origem}`);
      }
    }
    if (/\b(fetch|localStorage|sessionStorage|window|document)\b/.test(texto)) impuros.push(`${nome}: rede/armazenamento/DOM`);
  }
  afirmar(
    "o domínio de Carreiras só importa de si mesmo e de `domain/blog`, e não toca rede, DOM nem armazenamento",
    impuros.length === 0,
    impuros.join(", "),
  );
  afirmar(
    "não existe `src/domain/comum`, `src/render/carreiras` nem `api/carreiras.js` (fora do escopo da 5.2)",
    !existsSync(path.join(raiz, "src", "domain", "comum")) &&
      !existsSync(path.join(raiz, "src", "render", "carreiras")) &&
      !existsSync(path.join(raiz, "api", "carreiras.js")),
  );
}

/* ─── (c) A camada de dados ──────────────────────────────────────────────── */

secao("(c) a camada de dados de Carreiras");

const DIR_DADOS = path.join(raiz, "src", "data", "carreiras");
const arquivosDaCamada = existsSync(DIR_DADOS)
  ? readdirSync(DIR_DADOS)
      .filter((n) => n.endsWith(".js"))
      .map((n) => ({ nome: n, texto: readFileSync(path.join(DIR_DADOS, n), "utf8") }))
  : [];
afirmar(
  "src/data/carreiras/ tem o módulo de leitura",
  arquivosDaCamada.some((a) => a.nome === "leitura.js"),
  arquivosDaCamada.map((a) => a.nome).join(", ") || "nenhum",
);

/**
 * O corpo de uma função, com a assinatura, por chaves BALANCEADAS. Mesmo
 * extrator de `verificar-dados.mjs` (a lista de parâmetros primeiro, para a
 * desestruturação não fechar o corpo cedo).
 */
function corpoDaFuncao(fonte, nome) {
  const inicio = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${nome}\\s*\\(`).exec(fonte);
  if (inicio === null) return null;
  let parenteses = 1;
  let i = inicio.index + inicio[0].length;
  for (; i < fonte.length && parenteses > 0; i += 1) {
    if (fonte[i] === "(") parenteses += 1;
    else if (fonte[i] === ")") parenteses -= 1;
  }
  if (parenteses !== 0) return null;
  const assinatura = fonte.slice(inicio.index, i);
  const abertura = fonte.indexOf("{", i);
  if (abertura === -1) return null;
  let profundidade = 0;
  for (let j = abertura; j < fonte.length; j += 1) {
    if (fonte[j] === "{") profundidade += 1;
    else if (fonte[j] === "}") {
      profundidade -= 1;
      if (profundidade === 0) return assinatura + fonte.slice(abertura, j + 1);
    }
  }
  return null;
}

/** Quais clientes um corpo OBTÉM (chamada ou parâmetro padrão). */
function clientesDe(corpo) {
  return [
    ...semComentarios(corpo).matchAll(
      /(?<!function\s)\bcliente(Publico|DoPainel)OuFalha\s*\(|=\s*cliente(Publico|DoPainel)OuFalha\b/g,
    ),
  ].map((m) => m[1] ?? m[2]);
}

{
  /* AUTOTESTE dos detectores. */
  const sintetico =
    "export async function a() { const c = clientePublicoOuFalha(op); }\n" +
    "export async function b() { if (x) return clienteDoPainelOuFalha(op); const c = clientePublicoOuFalha(op); }\n";
  afirmar(
    "autoteste: o extrator de corpo e o detector de cliente distinguem uma função que ESCOLHE o cliente",
    igual(clientesDe(corpoDaFuncao(sintetico, "a") ?? ""), ["Publico"]) &&
      igual(clientesDe(corpoDaFuncao(sintetico, "b") ?? ""), ["DoPainel", "Publico"]) &&
      corpoDaFuncao(sintetico, "naoExiste") === null,
  );

  const PUBLICAS = ["listarVagasAbertas", "lerSituacaoDaVaga", "listarClassificacoes"];
  const DO_PAINEL = ["listarVagasDoPainel", "lerVagaDoPainelPorId", "listarClassificacoesDoPainel"];
  const fonte = arquivosDaCamada.find((a) => a.nome === "leitura.js")?.texto ?? "";
  const erradasPublicas = PUBLICAS.filter((n) => !igual(clientesDe(corpoDaFuncao(fonte, n) ?? "?"), ["Publico"]));
  afirmar(
    "toda leitura PÚBLICA obtém exatamente UM cliente, e ele é o anônimo",
    erradasPublicas.length === 0,
    erradasPublicas.join(", "),
  );
  const comSessao = PUBLICAS.filter((n) => /getSession|access_token|\bsessao\b/i.test(semComentarios(corpoDaFuncao(fonte, n) ?? "")));
  afirmar("e nenhuma delas pergunta se há sessão", comSessao.length === 0, comSessao.join(", "));
  const erradasDoPainel = DO_PAINEL.filter((n) => !igual(clientesDe(corpoDaFuncao(fonte, n) ?? "?"), ["DoPainel"]));
  afirmar(
    "toda leitura do PAINEL obtém exatamente UM cliente, e ele é o com sessão",
    erradasDoPainel.length === 0,
    erradasDoPainel.join(", "),
  );
  const declarados = [...PUBLICAS, ...DO_PAINEL].reduce(
    (total, n) => total + clientesDe(corpoDaFuncao(fonte, n) ?? "").length,
    0,
  );
  const existentes = arquivosDaCamada.reduce((total, a) => total + clientesDe(a.texto).length, 0);
  afirmar(
    "TODO ponto da camada que obtém cliente está numa das duas listas (a lista é fechada)",
    declarados === existentes && existentes > 0,
    `declarados: ${declarados} | existentes: ${existentes}`,
  );

  const comCreateClient = arquivosDaCamada.filter((a) => /\bcreateClient\s*\(/.test(a.texto)).map((a) => a.nome);
  afirmar("nenhum módulo de data/carreiras instancia cliente", comCreateClient.length === 0, comCreateClient.join(", "));
  const diretos = arquivosDaCamada
    .filter((a) => /\b(clientePublico|clienteAutenticado)\s*\(/.test(semComentarios(a.texto)))
    .map((a) => a.nome);
  afirmar("nenhum chama clientePublico()/clienteAutenticado() direto", diretos.length === 0, diretos.join(", "));
  const comReact = arquivosDaCamada.filter((a) => /from\s+["'](react|react-dom)/.test(a.texto)).map((a) => a.nome);
  afirmar("nenhum módulo de data/carreiras importa React", comReact.length === 0, comReact.join(", "));

  const ORIGENS_PERMITIDAS = ["../supabase/clientes.js", "../blog/resultado.js", "../blog/comum.js"];
  const origensProibidas = [];
  for (const { nome, texto } of arquivosDaCamada) {
    for (const origem of origensDeImport(texto)) {
      const permitida =
        (origem.startsWith("./") && !origem.includes("..")) ||
        ORIGENS_PERMITIDAS.includes(origem) ||
        /^\.\.\/\.\.\/domain\/[a-z]+\/[A-Za-z]+\.js$/.test(origem);
      if (!permitida) origensProibidas.push(`${nome} → ${origem}`);
    }
  }
  afirmar(
    "autoteste: o leitor de origens vê `from`, `import \"x\"` e `import(\"x\")`, e não confunde `.from(\"vagas\")` com origem",
    igual(
      origensDeImport('import a from "react";\nimport "./b.js";\nconst c = await import("../c.js");\nx.from("vagas");\nexport * from "./d.js";'),
      ["react", "./b.js", "../c.js", "./d.js"],
    ),
  );
  afirmar(
    "data/carreiras importa só de si, de data/supabase/clientes.js, de blog/resultado.js, de blog/comum.js e de domain/",
    origensProibidas.length === 0,
    origensProibidas.join(", "),
  );
  const repeticoes = [];
  for (const { nome, texto } of arquivosDaCamada) {
    for (const m of semComentarios(texto).matchAll(
      /\.(eq|neq|in|lt|lte|gt|gte|is|like|ilike|filter|match|or|not|contains)\(\s*["'`](estado|aberta_em)/g,
    )) {
      repeticoes.push(`${nome}: .${m[1]}("${m[2]}"…)`);
    }
  }
  afirmar(
    "nenhuma consulta filtra por Estado no cliente: a política e as funções de entrega são as guardiãs",
    repeticoes.length === 0,
    repeticoes.join(", "),
  );
  afirmar(
    "nenhum módulo de data/carreiras escreve (insert, update, upsert, delete)",
    arquivosDaCamada.every((a) => !/\.(insert|update|upsert|delete)\s*\(/.test(semComentarios(a.texto))),
  );
}

/* Ambiente do `.env`, só `.env` (nunca o exemplo), como em verificar-dados. */
function lerDoEnv(nome) {
  const caminho = path.join(raiz, ".env");
  if (!existsSync(caminho)) return null;
  for (const linha of readFileSync(caminho, "utf8").split(/\r?\n/)) {
    if (/^\s*#/.test(linha)) continue;
    const m = new RegExp(`^\\s*(?:export\\s+)?${nome}\\s*=\\s*(.*)$`).exec(linha);
    if (!m) continue;
    const valor = m[1].replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");
    return valor === "" ? null : valor;
  }
  return null;
}
const urlDoEnv = lerDoEnv("VITE_SUPABASE_URL");
const chavePublicavel = lerDoEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
if (chavePublicavel) registrarSegredo(chavePublicavel);

/**
 * Roda as seis leituras num processo NOVO, com o ambiente pedido. Outro
 * processo porque os clientes são memoizados no módulo; e é o teste mais
 * honesto de "nada lança": se alguma lançar, não há JSON para ler.
 */
function sondar(ambiente) {
  const codigo = `
const m = await import(${JSON.stringify(urlDe("src/data/carreiras/leitura.js"))});
const UM_UUID = "11111111-1111-4111-8111-111111111111";
const alvos = {
  listarVagasAbertas: () => m.listarVagasAbertas(),
  lerSituacaoDaVaga: () => m.lerSituacaoDaVaga("um-slug-qualquer"),
  lerSituacaoDaVagaTorta: () => m.lerSituacaoDaVaga("X y"),
  lerSituacaoDaVagaNula: () => m.lerSituacaoDaVaga(null),
  listarClassificacoes: () => m.listarClassificacoes(),
  listarVagasDoPainel: () => m.listarVagasDoPainel({ termo: "x", estado: "rascunho" }),
  listarVagasDoPainelEstadoTorto: () => m.listarVagasDoPainel({ estado: "publicado" }),
  lerVagaDoPainelPorId: () => m.lerVagaDoPainelPorId(UM_UUID),
  lerVagaDoPainelPorIdTorto: () => m.lerVagaDoPainelPorId("nao-e-uuid"),
  listarClassificacoesDoPainel: () => m.listarClassificacoesDoPainel(),
};
const saida = {};
for (const [nome, fn] of Object.entries(alvos)) {
  try { saida[nome] = await fn(); } catch (erro) { saida[nome] = { lancou: String(erro?.message ?? erro) }; }
}
process.stdout.write(JSON.stringify(saida));
`;
  try {
    const bruto = execFileSync(process.execPath, ["--input-type=module", "-e", codigo], {
      cwd: raiz,
      env: ambiente,
      encoding: "utf8",
      timeout: TIMEOUT_MS * 2,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, saida: JSON.parse(bruto) };
  } catch (erro) {
    return { ok: false, erro: String(erro?.message ?? erro).slice(0, 300) };
  }
}

const ehResultadoTipado = (r) =>
  r !== null &&
  typeof r === "object" &&
  ((r.ok === true && Object.hasOwn(r, "dados")) ||
    (r.ok === false && typeof r.erro?.tipo === "string" && typeof r.erro?.mensagem === "string" && r.erro.mensagem !== ""));

{
  const semAmbiente = { ...process.env };
  delete semAmbiente.VITE_SUPABASE_URL;
  delete semAmbiente.VITE_SUPABASE_PUBLISHABLE_KEY;
  const sonda = sondar(semAmbiente);
  afirmar("sem ambiente, o processo TERMINA: nenhuma leitura lançou", sonda.ok, sonda.erro ?? "");
  if (sonda.ok) {
    const s = sonda.saida;
    const foraDoContrato = Object.entries(s).filter(([, r]) => !ehResultadoTipado(r)).map(([n]) => n);
    afirmar("toda leitura devolve resultado tipado", foraDoContrato.length === 0, foraDoContrato.join(", "));
    const semConfiguracao = [
      "listarVagasAbertas",
      "lerSituacaoDaVaga",
      "listarClassificacoes",
      "listarVagasDoPainel",
      "lerVagaDoPainelPorId",
      "listarClassificacoesDoPainel",
    ].filter((n) => s[n]?.erro?.tipo !== "configuracao");
    afirmar(
      "sem ambiente, as seis leituras devolvem erro tipado de configuração",
      semConfiguracao.length === 0,
      semConfiguracao.map((n) => `${n}: ${JSON.stringify(s[n]).slice(0, 80)}`).join(" | "),
    );
    const vazia = (r) =>
      r?.ok === true &&
      r.dados?.situacao === "inexistente" &&
      Object.entries(r.dados).every(([k, v]) => k === "situacao" || v === null);
    afirmar(
      "Slug torto (`X y`) e nulo voltam `inexistente` com tudo nulo, SEM ir à rede (nem precisou de ambiente)",
      vazia(s.lerSituacaoDaVagaTorta) && vazia(s.lerSituacaoDaVagaNula),
      JSON.stringify(s.lerSituacaoDaVagaTorta).slice(0, 160),
    );
    afirmar(
      "Estado fora do vocabulário é recusado ANTES da rede, e id torto é não encontrado",
      s.listarVagasDoPainelEstadoTorto?.ok === false &&
        s.listarVagasDoPainelEstadoTorto.erro?.tipo === "inesperado" &&
        s.lerVagaDoPainelPorIdTorto?.erro?.tipo === "nao_encontrado",
      `${JSON.stringify(s.listarVagasDoPainelEstadoTorto).slice(0, 120)} | ${JSON.stringify(s.lerVagaDoPainelPorIdTorto).slice(0, 80)}`,
    );
  }
}

if (chavePublicavel) {
  /* Porta 9 (discard): a conexão é recusada na hora. As leituras públicas
     devolvem `rede`; as do Painel, sem sessão guardada, devolvem `permissao`
     antes mesmo de tentar. */
  const redeFora = {
    ...process.env,
    VITE_SUPABASE_URL: "http://127.0.0.1:9",
    VITE_SUPABASE_PUBLISHABLE_KEY: chavePublicavel,
  };
  const sonda = sondar(redeFora);
  afirmar("com a rede fora, o processo TERMINA: nenhuma leitura lançou", sonda.ok, sonda.erro ?? "");
  if (sonda.ok) {
    const s = sonda.saida;
    const semRede = ["listarVagasAbertas", "lerSituacaoDaVaga", "listarClassificacoes"].filter(
      (n) => s[n]?.erro?.tipo !== "rede",
    );
    afirmar(
      "com a rede fora, as leituras públicas devolvem erro tipado de rede (e não `nao_encontrado`)",
      semRede.length === 0,
      semRede.map((n) => `${n}: ${JSON.stringify(s[n]).slice(0, 100)}`).join(" | "),
    );
    const semPermissao = ["listarVagasDoPainel", "lerVagaDoPainelPorId", "listarClassificacoesDoPainel"].filter(
      (n) => s[n]?.erro?.tipo !== "permissao",
    );
    afirmar(
      "e as do Painel, sem sessão, devolvem erro tipado de permissão",
      semPermissao.length === 0,
      semPermissao.map((n) => `${n}: ${JSON.stringify(s[n]).slice(0, 100)}`).join(" | "),
    );
  }
} else {
  afirmar("a sonda de rede pôde ser exercida", false, "sem VITE_SUPABASE_PUBLISHABLE_KEY no `.env`");
}

/* ─── Remoto ─────────────────────────────────────────────────────────────── */

secao(`(d) o catálogo de ${NOME_PROJETO} (${REF_PROJETO})`);

const token = lerToken();
const temToken = afirmar(
  "SUPABASE_ACCESS_TOKEN presente no ambiente",
  Boolean(token),
  "sem ele as asserções remotas não podem rodar, e não são puladas em silêncio",
);

/** Consulta que devolve linhas; erro vira asserção falha na hora. */
async function consulta(sqlTexto, oQue) {
  const r = await executarSql(token, sqlTexto);
  if (!r.ok) {
    afirmar(`consulta respondeu: ${oQue}`, false, r.erro);
    return { falhou: true, linhas: [], linha: null, erro: r.erro };
  }
  const linhas = Array.isArray(r.dados) ? r.dados : [];
  return { falhou: false, linhas, linha: linhas[0] ?? null };
}

/**
 * SQL numa transação que SEMPRE é desfeita. A Management API devolve as
 * linhas do último `select` e desfaz tudo no `rollback`; um erro no meio
 * aborta a transação inteira. Nada do que roda aqui persiste.
 */
function desfeito(corpo) {
  return executarSql(token, `begin;\n${corpo}\nrollback;`);
}

/** Extrai os literais de texto de uma definição de restrição. */
const literaisDe = (definicao) => [...String(definicao ?? "").matchAll(/'([^']*)'/g)].map((m) => m[1]);

if (temToken) {
  /* — Tabelas e RLS — */
  const tabelas = await consulta(
    `select c.relname as nome, c.relrowsecurity as rls
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname in (${TABELAS.map(literal).join(", ")})`,
    "as quatro tabelas",
  );
  const rlsDe = new Map(tabelas.linhas.map((l) => [l.nome, l.rls]));
  afirmar(
    "as quatro tabelas existem no projeto, todas com RLS habilitada",
    TABELAS.every((t) => rlsDe.get(t) === true),
    TABELAS.map((t) => `${t}: ${rlsDe.get(t) ?? "ausente"}`).join(" | "),
  );

  /* — A migração está registrada — */
  const versoes = MIGRACOES_DE_CARREIRAS.map((n) => n.slice(0, 14));
  const registradas = await consulta(
    `select coalesce(json_agg(version order by version), '[]'::json) as v from supabase_migrations.schema_migrations
      where version in (${versoes.map(literal).join(", ")})`,
    "registro das migrações de Carreiras",
  );
  afirmar(
    `as ${versoes.length} migrações de Carreiras constam em schema_migrations (${versoes.join(", ")})`,
    igual(registradas.linha?.v, versoes),
    `registradas: ${JSON.stringify(registradas.linha?.v)}`,
  );

  /* — Políticas — */
  const politicas = await consulta(
    `select tablename as tabela, policyname as nome, cmd, array_to_string(roles, ',') as papeis, coalesce(qual, '') as qual,
            coalesce(with_check, '') as checagem
       from pg_policies where schemaname = 'public' and tablename in (${TABELAS.map(literal).join(", ")})`,
    "políticas das quatro tabelas",
  );
  const esperadas = TABELAS.flatMap((t) => [
    [`${t}_leitura_anonima`, "anon"],
    [`${t}_leitura_autenticada`, "authenticated"],
  ]);
  afirmar(
    "no projeto, as políticas são EXATAMENTE as oito de leitura, cada uma para o seu papel",
    politicas.linhas.length === 8 &&
      esperadas.every(([nome, papel]) =>
        politicas.linhas.some((p) => p.nome === nome && p.cmd === "SELECT" && p.papeis === papel),
      ),
    politicas.linhas.map((p) => `${p.nome}:${p.cmd}:${p.papeis}`).join(" | "),
  );
  const qualAnonima = politicas.linhas.find((p) => p.nome === "vagas_leitura_anonima")?.qual ?? "";
  afirmar(
    "a política anônima de `vagas` no banco é `estado = 'aberta'`, sem mais nada",
    /^\(?estado = 'aberta'::(public\.)?estado_vaga\)?$/.test(qualAnonima.trim()),
    qualAnonima,
  );

  /* — Privilégios de cada papel — */
  const privilegios = await consulta(
    `select t as tabela, p as papel,
            has_table_privilege(p, 'public.' || t, 'select') as le,
            has_table_privilege(p, 'public.' || t, 'insert') as insere,
            has_table_privilege(p, 'public.' || t, 'update') as altera,
            has_table_privilege(p, 'public.' || t, 'delete') as apaga,
            has_table_privilege(p, 'public.' || t, 'truncate') as trunca
       from unnest(array[${TABELAS.map(literal).join(", ")}]) as t
       cross join unnest(array['anon', 'authenticated']) as p`,
    "privilégios das quatro tabelas",
  );
  const privErrado = privilegios.linhas.filter(
    (l) => l.le !== true || l.insere !== false || l.altera !== false || l.apaga !== false || l.trunca !== false,
  );
  afirmar(
    "anon e authenticated LEEM as quatro tabelas e não têm privilégio de escrita nenhum (insert, update, delete, truncate)",
    privilegios.linhas.length === 8 && privErrado.length === 0,
    privErrado.map((l) => `${l.tabela}/${l.papel}`).join(", ") || `${privilegios.linhas.length} linha(s)`,
  );

  /* — O enum contra o domínio — */
  const rotulos = await consulta(
    `select coalesce(json_agg(e.enumlabel order by e.enumsortorder), '[]'::json) as r
       from pg_enum e join pg_type t on t.oid = e.enumtypid
       join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typname = 'estado_vaga'`,
    "rótulos do enum estado_vaga",
  );
  afirmar(
    "o enum `estado_vaga` é IGUAL a `ESTADOS_DA_VAGA`, na mesma ordem",
    igual(rotulos.linha?.r, [...estadosDaVaga.ESTADOS_DA_VAGA]),
    JSON.stringify(rotulos.linha?.r),
  );

  /* — Restrições, FKs, índices — */
  const restricoes = await consulta(
    `select c.conrelid::regclass::text as tabela, c.conname as nome, c.contype as tipo, c.confdeltype as ao_apagar,
            coalesce(c.confrelid::regclass::text, '') as alvo, pg_get_constraintdef(c.oid) as def
       from pg_constraint c join pg_namespace n on n.oid = c.connamespace
      where n.nspname = 'public' and c.conrelid in (${TABELAS.map((t) => `'public.${t}'::regclass`).join(", ")})`,
    "restrições das quatro tabelas",
  );
  const nomesDasRestricoes = new Set(restricoes.linhas.map((r) => r.nome));
  const ESPERADAS = [
    "vagas_titulo_valido",
    "vagas_slug_formato",
    "vagas_slug_unico",
    "vagas_modalidade_valida",
    "vagas_resumo_tamanho",
    "vagas_localizacao_tamanho",
    "vagas_link_de_candidatura_valido",
    "vagas_aberta_em_obrigatorio",
    "vagas_aberta_completa",
    "vagas_descricao_na_projecao",
    "vagas_descricao_html_segura",
    "departamentos_nome_valido",
    "departamentos_cor_na_paleta",
    "departamentos_ordem_nao_negativa",
    "tipos_de_vaga_nome_valido",
    "tipos_de_vaga_equivalente_valido",
    "tipos_de_vaga_ordem_nao_negativa",
    "niveis_nome_valido",
    "niveis_cor_na_paleta",
    "niveis_ordem_nao_negativa",
  ];
  const faltando = ESPERADAS.filter((n) => !nomesDasRestricoes.has(n));
  afirmar("as restrições nomeadas existem no banco", faltando.length === 0, faltando.join(", "));
  const fks = restricoes.linhas.filter((r) => r.tipo === "f");
  afirmar(
    "as três FKs de `vagas` são `on delete restrict` para departamentos, tipos_de_vaga e niveis",
    fks.length === 3 &&
      fks.every((f) => f.ao_apagar === "r") &&
      igual(ordenado(fks.map((f) => f.alvo.replace(/^public\./, ""))), ["departamentos", "niveis", "tipos_de_vaga"]),
    fks.map((f) => `${f.nome}:${f.ao_apagar}:${f.alvo}`).join(" | "),
  );
  const nulas = await consulta(
    `select column_name as coluna, is_nullable as nulavel from information_schema.columns
      where table_schema = 'public' and table_name = 'vagas'
        and column_name in ('departamento_id', 'tipo_id', 'nivel_id', 'titulo', 'slug', 'estado', 'descricao', 'descricao_html')`,
    "nulidade das colunas de vagas",
  );
  afirmar(
    "as Classificações, título, Slug, Estado e a Descrição são NOT NULL em `vagas`",
    nulas.linhas.length === 8 && nulas.linhas.every((l) => l.nulavel === "NO"),
    nulas.linhas.map((l) => `${l.coluna}:${l.nulavel}`).join(", "),
  );

  /* ESPELHOS de lista fechada, lidos da definição que o banco avalia. */
  const def = (nome) => restricoes.linhas.find((r) => r.nome === nome)?.def ?? "";
  for (const nome of ["departamentos_cor_na_paleta", "niveis_cor_na_paleta"]) {
    afirmar(
      `\`${nome}\` é EXATAMENTE a paleta \`CORES_DE_CATEGORIA\`, nos dois sentidos`,
      igual(ordenado(literaisDe(def(nome))), ordenado(CORES_DE_CATEGORIA)),
      def(nome),
    );
  }
  afirmar(
    "`tipos_de_vaga_equivalente_valido` é EXATAMENTE `EQUIVALENTES_JOBPOSTING`",
    igual(ordenado(literaisDe(def("tipos_de_vaga_equivalente_valido"))), ordenado(classificacoes.EQUIVALENTES_JOBPOSTING)),
    def("tipos_de_vaga_equivalente_valido"),
  );
  afirmar(
    "`vagas_modalidade_valida` é EXATAMENTE `MODALIDADES`",
    igual(ordenado(literaisDe(def("vagas_modalidade_valida"))), ordenado(classificacoes.MODALIDADES.map((m) => m.valor))),
    def("vagas_modalidade_valida"),
  );

  const indices = await consulta(
    `select indexname as nome, indexdef as def from pg_indexes
      where schemaname = 'public' and indexname in (${CLASSIFICACOES.map((t) => literal(`${t}_nome_normalizado_unico`)).join(", ")})`,
    "índices de nome normalizado",
  );
  afirmar(
    "os três índices de nome são UNIQUE sobre `normalizar_busca(nome)`",
    indices.linhas.length === 3 &&
      indices.linhas.every((i) => /^CREATE UNIQUE INDEX/.test(i.def) && /normalizar_busca\(nome\)/.test(i.def)),
    indices.linhas.map((i) => i.def).join(" | ") || "nenhum",
  );

  const gatilhos = await consulta(
    `select c.relname as tabela, t.tgname as nome, p.proname as funcao
       from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and not t.tgisinternal and c.relname in (${TABELAS.map(literal).join(", ")})`,
    "gatilhos das quatro tabelas",
  );
  afirmar(
    "as quatro tabelas têm o gatilho `<tabela>_tocar_atualizado_em` sobre `tocar_atualizado_em`",
    TABELAS.every((t) =>
      gatilhos.linhas.some((g) => g.tabela === t && g.nome === `${t}_tocar_atualizado_em` && g.funcao === "tocar_atualizado_em"),
    ),
    gatilhos.linhas.map((g) => `${g.tabela}:${g.nome}`).join(" | "),
  );

  /* — Funções — */
  const funcoes = await consulta(
    `select p.proname as nome, p.prosecdef as definer, p.provolatile as vol,
            coalesce(array_to_string(p.proconfig, ','), '') as cfg,
            has_function_privilege('anon', p.oid, 'execute') as anon,
            has_function_privilege('authenticated', p.oid, 'execute') as auth,
            has_function_privilege('service_role', p.oid, 'execute') as servico,
            p.proacl is null as acl_padrao,
            exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as publico,
            pg_get_function_result(p.oid) as resultado,
            (select l.lanname from pg_language l where l.oid = p.prolang) as linguagem,
            coalesce(obj_description(p.oid, 'pg_proc'), '') as comentario
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in (${FUNCOES_NOVAS.map(literal).join(", ")})`,
    "as cinco funções novas",
  );
  const f = new Map(funcoes.linhas.map((l) => [l.nome, l]));
  afirmar(
    "as cinco funções novas existem, uma de cada (sem sobrecarga)",
    funcoes.linhas.length === 5 && FUNCOES_NOVAS.every((n) => f.has(n)),
    funcoes.linhas.map((l) => l.nome).join(", "),
  );
  for (const nome of FUNCOES_DA_RESTRICAO) {
    const l = f.get(nome);
    afirmar(
      `${nome}: imutável, invoker, search_path fixo, e NÃO executável por anon, authenticated nem public (service_role sim)`,
      l?.vol === "i" &&
        l?.definer === false &&
        /search_path=/.test(l?.cfg ?? "") &&
        l?.anon === false &&
        l?.auth === false &&
        l?.acl_padrao === false &&
        l?.publico === false &&
        l?.servico === true,
      JSON.stringify(l ?? {}),
    );
  }
  for (const [nome, colunas] of [
    ["situacao_da_vaga", COLUNAS_DA_SITUACAO],
    ["vagas_abertas", COLUNAS_DAS_ABERTAS],
  ]) {
    const l = f.get(nome);
    afirmar(
      `${nome}: definer, STABLE, search_path fixo, executável por anon e authenticated, revogada de public, comentada`,
      l?.definer === true &&
        l?.vol === "s" &&
        /search_path=/.test(l?.cfg ?? "") &&
        l?.anon === true &&
        l?.auth === true &&
        l?.acl_padrao === false &&
        l?.publico === false &&
        (l?.comentario ?? "").length > 80,
      JSON.stringify({ ...(l ?? {}), comentario: (l?.comentario ?? "").length }),
    );
    const obtidas = [...String(l?.resultado ?? "").matchAll(/(?:TABLE\(|, )([a-z_]+) /g)].map((m) => m[1]);
    afirmar(
      `${nome} devolve exatamente as colunas da spec, nesta ordem`,
      igual(obtidas, [...colunas]),
      String(l?.resultado ?? ""),
    );
  }
  {
    const l = f.get("buscar_vagas_do_painel");
    afirmar(
      "buscar_vagas_do_painel: invoker, STABLE, search_path fixo, devolve SETOF vagas, só authenticated executa (anon e public não)",
      l?.definer === false &&
        l?.vol === "s" &&
        /search_path=/.test(l?.cfg ?? "") &&
        /^SETOF (public\.)?vagas$/.test(l?.resultado ?? "") &&
        l?.anon === false &&
        l?.auth === true &&
        l?.acl_padrao === false &&
        l?.publico === false,
      JSON.stringify(l ?? {}),
    );
    /* A correção 20260924130000 trocou a busca por PL/pgSQL, para o Estado ser
       convertido ANTES da consulta. Uma reaplicação isolada de 20260924120000
       traria de volta a versão `sql` (a de CTE, que aceitava Estado torto com
       a tabela vazia), e é o catálogo que diz qual das duas vale. */
    afirmar(
      "buscar_vagas_do_painel é `plpgsql` (a versão corrigida em 20260924130000, e não a de CTE)",
      l?.linguagem === "plpgsql",
      `linguagem: ${l?.linguagem ?? "?"}`,
    );
  }
  afirmar(
    "`FUNCOES_DA_ENTREGA` do servidor ganha `situacao_da_vaga` e `vagas_abertas` NO FIM, sem mexer nas três do Blog",
    igual([...FUNCOES_DA_ENTREGA], [
      "situacao_do_endereco",
      "posts_no_ar",
      "proxima_publicacao",
      "situacao_da_vaga",
      "vagas_abertas",
    ]),
    FUNCOES_DA_ENTREGA.join(", "),
  );

  /* — A semeadura, EXECUTADA —
     O trecho entre os marcadores roda sobre CÓPIAS VAZIAS das três tabelas
     (temporárias, `like … including all`: mesmos CHECKs, mesmo índice
     normalizado), duas vezes seguidas, e é desfeito. Isso prova a semeadura
     exata e a idempotência sem depender do que o Painel fez com os dados
     reais depois da migração. */
  const semeadura = /-- semeadura:inicio\n([\s\S]*?)-- semeadura:fim/.exec(sql ?? "")?.[1] ?? "";
  if (semeadura !== "") {
    let naCopia = semeadura;
    for (const t of CLASSIFICACOES) naCopia = naCopia.split(`public.${t} `).join(`pg_temp.${t} `);
    const simulada = await desfeito(`
      ${CLASSIFICACOES.map((t) => `create temp table ${t} (like public.${t} including all);`).join("\n")}
      ${naCopia}
      ${naCopia}
      select
        (select coalesce(json_agg(json_build_array(d.nome, d.cor) order by d.ordem), '[]'::json) from pg_temp.departamentos d) as departamentos,
        (select coalesce(json_agg(json_build_array(t.nome, t.equivalente_jobposting) order by t.ordem), '[]'::json) from pg_temp.tipos_de_vaga t) as tipos_de_vaga,
        (select coalesce(json_agg(json_build_array(n.nome, n.cor) order by n.ordem), '[]'::json) from pg_temp.niveis n) as niveis;`);
    const linha = simulada.ok ? simulada.dados?.[0] : null;
    afirmar(
      "a semeadura, rodada DUAS vezes sobre tabelas vazias, deixa exatamente 8 Departamentos, 4 Tipos e 3 Níveis, com os nomes, Cores e Equivalentes da spec, na ordem",
      simulada.ok &&
        CLASSIFICACOES.every((t) => igual(linha?.[t], SEMEADURA_ESPERADA[t])),
      simulada.erro ?? JSON.stringify(linha).slice(0, 400),
    );
    /* E NO BANCO REAL, desfeita: rodar de novo só acrescenta o que falta por
       nome normalizado (hoje, nada), e nunca duplica. */
    const valores = (t) => SEMEADURA_ESPERADA[t].map(([nome]) => `(${literal(nome)})`).join(", ");
    const faltam = (t) =>
      `(select count(*)::int from (values ${valores(t)}) as v(nome) where not exists (select 1 from public.${t} x where public.normalizar_busca(x.nome) = public.normalizar_busca(v.nome)))`;
    const real = await desfeito(`
      create temp table antes on commit drop as select
        ${CLASSIFICACOES.map((t) => `(select count(*)::int from public.${t}) as ${t}, ${faltam(t)} as faltam_${t}`).join(", ")};
      ${semeadura}
      select json_build_object(
        ${CLASSIFICACOES.map(
          (t) => `'${t}', json_build_object('antes', (select a.${t} from antes a), 'faltavam', (select a.faltam_${t} from antes a), 'depois', (select count(*)::int from public.${t}))`,
        ).join(",\n        ")}
      ) as r;`);
    const r = real.ok ? real.dados?.[0]?.r : null;
    afirmar(
      "no banco real, a semeadura rodada de novo acrescenta só o que faltava por nome normalizado, e não duplica nada",
      real.ok && CLASSIFICACOES.every((t) => r?.[t] && r[t].depois - r[t].antes === r[t].faltavam),
      real.erro ?? JSON.stringify(r),
    );
    afirmar(
      "e hoje não falta nada: a semeadura está aplicada",
      real.ok && CLASSIFICACOES.every((t) => r?.[t]?.faltavam === 0),
      JSON.stringify(r),
    );
  } else {
    afirmar("a semeadura pôde ser executada", false, "marcadores ausentes na migração");
  }
} else {
  afirmar(
    "o catálogo do projeto pôde ser consultado",
    false,
    "sem SUPABASE_ACCESS_TOKEN a asserção falha como ausente, nunca é pulada",
  );
}

/* ─── (e) Espelhos JS/SQL ────────────────────────────────────────────────── */

secao("(e) espelhos: a projeção JS e as funções SQL, nos dois sentidos");

const VAGA = descricaoDaVaga.VOCABULARIO_DA_VAGA;

/** As etiquetas que o renderizador único emite para um documento. */
const etiquetasDe = (html) => new Set([...String(html).matchAll(/<([a-z][a-z0-9]*)\b/g)].map((m) => m[1]));
const t = (texto, marks) => ({ type: "text", text: texto, ...(marks ? { marks } : {}) });
const DOC_DE_TUDO = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        t("a", [{ type: "bold" }]),
        t("b", [{ type: "italic" }]),
        { type: "hardBreak" },
        t("c", [{ type: "link", attrs: { href: "https://chatclean.com.br" } }]),
        t("c2", [
          {
            type: "link",
            attrs: { href: "https://chatclean.com.br/x", target: "_blank", rel: "nofollow", title: "Título do link" },
          },
        ]),
        t("d", [{ type: "highlight", attrs: { cor: "amarelo" } }]),
      ],
    },
    { type: "heading", attrs: { level: 2 }, content: [t("h2")] },
    { type: "heading", attrs: { level: 3 }, content: [t("h3")] },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [t("x")] }] }] },
    { type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [t("y")] }] }] },
    {
      type: "orderedList",
      attrs: { start: 3, type: "a" },
      content: [{ type: "listItem", content: [{ type: "paragraph", content: [t("z")] }] }],
    },
    { type: "blockquote", content: [{ type: "paragraph", content: [t("q")] }] },
    { type: "codeBlock", content: [t("npm")] },
    { type: "horizontalRule" },
    { type: "image", attrs: { src: "https://chatclean.com.br/a.png", alt: "a" } },
  ],
};
const htmlDoPost = derivarHtml(DOC_DE_TUDO).html ?? "";
const htmlDaVaga = derivarHtml(DOC_DE_TUDO, VAGA).html ?? "";
const ETIQUETAS_DO_POST = etiquetasDe(htmlDoPost);
const ETIQUETAS_DA_VAGA = etiquetasDe(htmlDaVaga);
/**
 * Os NOMES DE ATRIBUTO que o renderizador emite, por etiqueta, lidos do HTML
 * que ele produziu. É contra isto que a lista de permissão de atributos do
 * espelho SQL é julgada: o que o renderizador realmente emite, e não o que
 * alguém lembrou de escrever.
 */
function atributosPorEtiqueta(html) {
  const mapa = new Map();
  for (const m of String(html).matchAll(/<([a-z][a-z0-9]*)((?:\s+[a-z][a-z0-9-]*="[^"]*")*)\s*>/g)) {
    const nomes = mapa.get(m[1]) ?? new Set();
    for (const a of m[2].matchAll(/([a-z][a-z0-9-]*)="/g)) nomes.add(a[1]);
    mapa.set(m[1], nomes);
  }
  return mapa;
}
const ATRIBUTOS_DA_VAGA = atributosPorEtiqueta(htmlDaVaga);
afirmar(
  "o renderizador, na projeção, emite atributo só em `a` (href, target, rel, title) e em `ol` (start, type)",
  igual(
    [...ATRIBUTOS_DA_VAGA].filter(([, s]) => s.size > 0).map(([e, s]) => [e, ordenado([...s])]).sort(),
    [
      ["a", ["href", "rel", "target", "title"]],
      ["ol", ["start", "type"]],
    ],
  ),
  JSON.stringify([...ATRIBUTOS_DA_VAGA].map(([e, s]) => [e, [...s]])),
);
afirmar(
  "o renderizador único, sobre o documento com tudo, emite para a Vaga um SUBCONJUNTO estrito do que emite para o Post",
  ETIQUETAS_DA_VAGA.size > 0 &&
    [...ETIQUETAS_DA_VAGA].every((e) => ETIQUETAS_DO_POST.has(e)) &&
    ETIQUETAS_DA_VAGA.size < ETIQUETAS_DO_POST.size,
  `Post: ${[...ETIQUETAS_DO_POST].join(",")} | Vaga: ${[...ETIQUETAS_DA_VAGA].join(",")}`,
);

if (temToken) {
  /** Avalia uma lista de [chave, expressão SQL booleana] numa consulta só. */
  async function avaliar(pares, oQue) {
    if (pares.length === 0) return new Map();
    const r = await consulta(
      `select json_object_agg(x.k, x.v) as r from (values ${pares.map(([k, e]) => `(${literal(k)}, (${e}))`).join(", ")}) as x(k, v)`,
      oQue,
    );
    return new Map(Object.entries(r.linha?.r ?? {}));
  }
  const doc = (o) => `public.descricao_da_vaga_e_permitida(${literal(JSON.stringify(o))}::jsonb)`;
  const html = (h) => `public.html_da_descricao_e_reduzido(${literal(h)})`;

  /* NÓS: todo nó do schema do Post, mais um que ninguém conhece. */
  {
    const nomes = [...Object.keys(schema.NOS), "tabela"];
    const pares = nomes.map((n) => [n, doc(n === "doc" ? { type: "doc" } : { type: "doc", content: [{ type: n }] })]);
    const obtido = await avaliar(pares, "nós contra o espelho");
    const divergentes = nomes.filter((n) => obtido.get(n) !== Object.hasOwn(VAGA.nos, n));
    afirmar(
      "NÓS: o SQL aceita exatamente os nós da projeção JS, nos dois sentidos",
      obtido.size === nomes.length && divergentes.length === 0,
      divergentes.map((n) => `${n}: sql ${obtido.get(n)}`).join(", "),
    );
  }

  /* ATRIBUTOS DE NÓ: cada atributo que o Post aceita em cada nó da projeção,
     mais `textAlign` e um estranho. */
  {
    const casos = [];
    for (const no of Object.keys(VAGA.nos)) {
      const atributos = new Set([...Object.keys(schema.NOS[no]?.atributos ?? {}), "textAlign", "estranho"]);
      for (const a of atributos) casos.push([no, a]);
    }
    const pares = casos.map(([no, a]) => {
      const attrs = { [a]: a === "level" ? 2 : a === "start" ? 1 : "x" };
      const alvo = no === "doc" ? { type: "doc", attrs } : { type: "doc", content: [{ type: no, attrs }] };
      return [`${no}.${a}`, doc(alvo)];
    });
    const obtido = await avaliar(pares, "atributos de nó contra o espelho");
    const divergentes = casos.filter(
      ([no, a]) => obtido.get(`${no}.${a}`) !== Object.hasOwn(VAGA.nos[no].atributos ?? {}, a),
    );
    afirmar(
      "ATRIBUTOS DE NÓ: o SQL aceita exatamente os atributos da projeção (parágrafo nenhum, título só `level`), nos dois sentidos",
      obtido.size === casos.length && divergentes.length === 0,
      divergentes.map(([no, a]) => `${no}.${a}: sql ${obtido.get(`${no}.${a}`)}`).join(", "),
    );
  }

  /* MARCAS e seus ATRIBUTOS. */
  {
    const nomes = [...Object.keys(schema.MARCAS), "sublinhado"];
    const comMarca = (marca) => ({ type: "doc", content: [{ type: "paragraph", content: [t("x", [marca])] }] });
    const pares = nomes.map((m) => [
      m,
      doc(comMarca(m === "link" ? { type: m, attrs: { href: "https://x.com" } } : m === "highlight" ? { type: m, attrs: { cor: "amarelo" } } : { type: m })),
    ]);
    const obtido = await avaliar(pares, "marcas contra o espelho");
    const divergentes = nomes.filter((m) => obtido.get(m) !== Object.hasOwn(VAGA.marcas, m));
    afirmar(
      "MARCAS: o SQL aceita exatamente as marcas da projeção, nos dois sentidos",
      obtido.size === nomes.length && divergentes.length === 0,
      divergentes.map((m) => `${m}: sql ${obtido.get(m)}`).join(", "),
    );
    const casos = [];
    for (const m of Object.keys(VAGA.marcas)) {
      for (const a of new Set([...Object.keys(schema.MARCAS[m]?.atributos ?? {}), "style", "estranho"])) casos.push([m, a]);
    }
    const paresA = casos.map(([m, a]) => {
      const attrs = m === "link" ? { href: "https://x.com", [a]: a === "href" ? "https://x.com" : "x" } : { [a]: "x" };
      return [`${m}.${a}`, doc(comMarca({ type: m, attrs }))];
    });
    const obtidoA = await avaliar(paresA, "atributos de marca contra o espelho");
    const divergentesA = casos.filter(([m, a]) => obtidoA.get(`${m}.${a}`) !== Object.hasOwn(VAGA.marcas[m].atributos ?? {}, a));
    afirmar(
      "ATRIBUTOS DE MARCA: o SQL aceita exatamente os da projeção, nos dois sentidos",
      obtidoA.size === casos.length && divergentesA.length === 0,
      divergentesA.map(([m, a]) => `${m}.${a}: sql ${obtidoA.get(`${m}.${a}`)}`).join(", "),
    );
  }

  /* ESQUEMAS DE LINK: cada esquema do Post e as formas relativas, no
     documento e no HTML, contra o `href` JS da projeção. */
  {
    const amostras = [
      ...schema.PROTOCOLOS_DE_LINK.map((p) => `${p}//chatclean.com.br`),
      "mailto:vagas@chatclean.com.br",
      "tel:+5584999999999",
      "HTTPS://CHATCLEAN.COM.BR",
      "&#104;ttps://chatclean.com.br",
      "/carreiras",
      "#secao",
      "pagina",
      "ftp://x.com",
      /* As formas relativas disfarçadas da revisão: esquema certo, sem host. */
      "https:relativo",
      "http:/x",
      "https:///x",
      "HTTPS:///x",
      "Mailto:vagas@chatclean.com.br",
    ];
    const esperado = (h) => VAGA.marcas.link.atributos.href(h) !== undefined;
    const noDoc = await avaliar(
      amostras.map((h) => [h, doc({ type: "doc", content: [{ type: "paragraph", content: [t("x", [{ type: "link", attrs: { href: h } }])] }] })]),
      "esquemas de link no documento",
    );
    const noHtml = await avaliar(
      amostras.map((h) => [h, html(`<p><a href="${h.replace(/&/g, "&amp;").replace(/&amp;#104;/, "&#104;")}">x</a></p>`)]),
      "esquemas de link no HTML",
    );
    const divergentes = amostras.filter((h) => noDoc.get(h) !== esperado(h) || noHtml.get(h) !== esperado(h));
    afirmar(
      "ESQUEMAS DE LINK: documento e HTML aceitam exatamente o que o `href` JS da projeção aceita (http, https, mailto), nos dois sentidos",
      noDoc.size === amostras.length && noHtml.size === amostras.length && divergentes.length === 0,
      divergentes.map((h) => `${h}: js ${esperado(h)} doc ${noDoc.get(h)} html ${noHtml.get(h)}`).join(" | "),
    );
  }

  /* ETIQUETAS: toda etiqueta que o renderizador emite para o Post, mais três
     que ele nunca emite, contra o que ele emite para a Vaga. */
  {
    const etiquetas = [...new Set([...ETIQUETAS_DO_POST, "script", "div", "span"])];
    const VAZIAS = new Set(["br", "hr", "img"]);
    const amostra = (e) =>
      e === "img"
        ? '<img src="https://chatclean.com.br/a.png" alt="a" loading="lazy">'
        : VAZIAS.has(e)
          ? `<${e}>`
          : e === "a"
            ? '<a href="https://chatclean.com.br">x</a>'
            : `<${e}>x</${e}>`;
    const obtido = await avaliar(etiquetas.map((e) => [e, html(amostra(e))]), "etiquetas contra o espelho");
    const divergentes = etiquetas.filter((e) => obtido.get(e) !== ETIQUETAS_DA_VAGA.has(e));
    afirmar(
      "ETIQUETAS: o SQL aceita exatamente as que o renderizador emite para a projeção, nos dois sentidos",
      obtido.size === etiquetas.length && divergentes.length === 0,
      divergentes.map((e) => `${e}: sql ${obtido.get(e)}`).join(", "),
    );
    const inteiro = await avaliar(
      [
        ["vaga-reduzido", html(htmlDaVaga)],
        ["vaga-seguro", `public.html_do_post_e_seguro(${literal(htmlDaVaga)})`],
        ["post-reduzido", html(htmlDoPost)],
      ],
      "o HTML inteiro nos dois espelhos",
    );
    afirmar(
      "o HTML que o renderizador deriva para a Vaga passa nos DOIS espelhos, e o do Post é recusado pelo reduzido",
      inteiro.get("vaga-reduzido") === true && inteiro.get("vaga-seguro") === true && inteiro.get("post-reduzido") === false,
      JSON.stringify(Object.fromEntries(inteiro)),
    );

    /* ATRIBUTOS NO HTML (revisão da 5.2): lidos SÓ de dentro da etiqueta, só
       entre aspas duplas, e da lista da etiqueta. O texto `href="/x"` não é
       link e não reprova. */
    const CASOS_DE_ATRIBUTO = [
      ["aspas simples no href", `<p><a href='https://x.com'>x</a></p>`, false],
      ["href sem aspas", "<p><a href=https://x.com>x</a></p>", false],
      ["atributo sem valor", '<p><a href="https://x.com" download>x</a></p>', false],
      ["style em <p>", '<p style="color:red">x</p>', false],
      ["class em <strong>", '<p><strong class="x">x</strong></p>', false],
      ["onclick em <a>", '<p><a href="https://x.com" onclick="y()">x</a></p>', false],
      ["start em <ul>", '<ul start="3"><li><p>x</p></li></ul>', false],
      ["href em <p>", '<p href="https://x.com">x</p>', false],
      ["fechamento com atributo", '<p>x</p title="t">', false],
      ["href relativo disfarçado", '<p><a href="https:relativo">x</a></p>', false],
      ["texto com href=\"/x\"", '<p>href="/x"</p>', true],
      ["texto com href=&quot;/x&quot; (a forma canônica)", "<p>href=&quot;/x&quot;</p>", true],
      ["a com href, target, rel e title", '<p><a href="https://x.com" target="_blank" rel="noopener noreferrer" title="t">x</a></p>', true],
      ["ol com start e type", '<ol start="3" type="a"><li><p>x</p></li></ol>', true],
    ];
    const obtidoAtr = await avaliar(CASOS_DE_ATRIBUTO.map(([nome, h]) => [nome, html(h)]), "atributos no HTML reduzido");
    const errAtr = CASOS_DE_ATRIBUTO.filter(([nome, , esperado]) => obtidoAtr.get(nome) !== esperado);
    afirmar(
      "HTML reduzido: aspas simples, sem aspas, atributo sem valor, `style`/`class`/`onclick` e atributo fora da etiqueta dele reprovam; texto com `href=\"/x\"` passa; os atributos que o renderizador emite passam",
      obtidoAtr.size === CASOS_DE_ATRIBUTO.length && errAtr.length === 0,
      errAtr.map(([nome]) => `${nome}: sql ${obtidoAtr.get(nome)}`).join(" | "),
    );
  }

  /* E A LISTA ESCRITA no corpo das funções, lida do catálogo. */
  {
    const corpos = await consulta(
      `select p.proname as nome, p.prosrc as corpo from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in (${FUNCOES_DA_RESTRICAO.map(literal).join(", ")})`,
      "corpo dos espelhos",
    );
    const corpo = new Map(corpos.linhas.map((l) => [l.nome, l.corpo]));
    const lista = (texto, ancora) => {
      const i = String(texto ?? "").indexOf(ancora);
      if (i === -1) return null;
      const fim = texto.indexOf("])", i);
      return literaisDe(texto.slice(i + ancora.length, fim));
    };
    const nos = lista(corpo.get("descricao_da_vaga_e_permitida"), "coalesce(t.n ->> 'type', '') <> all (array[");
    const marcas = lista(corpo.get("descricao_da_vaga_e_permitida"), "coalesce(marca ->> 'type', '') <> all (array[");
    const etiquetas = lista(corpo.get("html_da_descricao_e_reduzido"), "tags.etiqueta <> all (array[");
    afirmar(
      "a lista de nós escrita no espelho é IGUAL às chaves de `VOCABULARIO_DA_VAGA.nos`",
      nos !== null && igual(ordenado(nos), ordenado(Object.keys(VAGA.nos))),
      JSON.stringify(nos),
    );
    afirmar(
      "a lista de marcas escrita no espelho é IGUAL às chaves de `VOCABULARIO_DA_VAGA.marcas`",
      marcas !== null && igual(ordenado(marcas), ordenado(Object.keys(VAGA.marcas))),
      JSON.stringify(marcas),
    );
    afirmar(
      "a lista de etiquetas escrita no espelho é IGUAL à que o renderizador emite para a projeção",
      etiquetas !== null && igual(ordenado(etiquetas), ordenado([...ETIQUETAS_DA_VAGA])),
      JSON.stringify(etiquetas),
    );
    /* A lista de um `array[...]` de uma linha: do marcador até o primeiro `]`. */
    const listaCurta = (texto, ancora) => {
      const t = String(texto ?? "");
      const i = t.indexOf(ancora);
      if (i === -1) return null;
      const fim = t.indexOf("]", i + ancora.length);
      return fim === -1 ? null : literaisDe(t.slice(i + ancora.length, fim));
    };
    const atributosDoA = listaCurta(corpo.get("html_da_descricao_e_reduzido"), "when 'a' then array[");
    const atributosDoOl = listaCurta(corpo.get("html_da_descricao_e_reduzido"), "when 'ol' then array[");
    const outrosSemLista = (() => {
      const texto = String(corpo.get("html_da_descricao_e_reduzido") ?? "");
      const i = texto.indexOf("when 'ol' then array[");
      return i !== -1 && /^[^\]]*\]\s*else array\[\]::text\[\]/.test(texto.slice(i));
    })();
    afirmar(
      "a lista de atributos escrita no espelho do HTML é IGUAL à que o renderizador emite (a: href, target, rel, title; ol: start, type; o resto, nenhum)",
      atributosDoA !== null &&
        atributosDoOl !== null &&
        igual(ordenado(atributosDoA), ordenado([...(ATRIBUTOS_DA_VAGA.get("a") ?? [])])) &&
        igual(ordenado(atributosDoOl), ordenado([...(ATRIBUTOS_DA_VAGA.get("ol") ?? [])])) &&
        outrosSemLista,
      JSON.stringify({ a: atributosDoA, ol: atributosDoOl, demaisVazio: outrosSemLista }),
    );
  }
} else {
  afirmar("os espelhos puderam ser comparados com o banco", false, "sem SUPABASE_ACCESS_TOKEN");
}

/* ─── (f) A matriz de I/O, em transação desfeita ─────────────────────────── */

secao("(f) a matriz de I/O da story, sempre em transação desfeita");

const PREFIXO_TESTE = "zzz-verificacao-5-2-";
const nonce = randomUUID();
const prefixo = `${PREFIXO_TESTE}${nonce}-`;
const slugDe = (sufixo) => `${prefixo}${sufixo}`;
const NOME_OP = `${PREFIXO_TESTE}${nonce} Operações`;
const NOME_TEC = `${PREFIXO_TESTE}${nonce} Tecnologia`;
const NOME_TIPO = `${PREFIXO_TESTE}${nonce} Tipo`;
const NOME_NIVEL = `${PREFIXO_TESTE}${nonce} Nível`;

/**
 * As Classificações e as cinco Vagas da matriz, criadas DENTRO da transação.
 * Com `atualizado_em` no passado, para o gatilho ter o que mudar.
 */
function fixture() {
  const DOC = literal(JSON.stringify(DOC_VALIDO));
  const HTML = literal(HTML_VALIDO);
  const linha = (sufixo, titulo, estado, dep, modalidade, localizacao, resumo, link, dias) =>
    `(${literal(slugDe(sufixo))}, ${literal(titulo)}, ${literal(estado)}, ${literal(dep)}, ${modalidade === null ? "null" : literal(modalidade)}, ${literal(localizacao)}, ${literal(resumo)}, ${link === null ? "null" : literal(link)}, ${dias === null ? "null" : dias})`;
  return `
    insert into public.departamentos (nome, cor, ordem, atualizado_em) values
      (${literal(NOME_OP)}, 'var(--categoria-ciano-bg)', 900, now() - interval '3 days'),
      (${literal(NOME_TEC)}, 'var(--categoria-azul-bg)', 901, now() - interval '3 days');
    insert into public.tipos_de_vaga (nome, equivalente_jobposting, ordem, atualizado_em) values
      (${literal(NOME_TIPO)}, 'FULL_TIME', 900, now() - interval '3 days');
    insert into public.niveis (nome, cor, ordem, atualizado_em) values
      (${literal(NOME_NIVEL)}, 'var(--categoria-verde-bg)', 900, now() - interval '3 days');
    insert into public.vagas (slug, titulo, estado, departamento_id, tipo_id, nivel_id, modalidade,
                              localizacao, resumo, descricao, descricao_html, link_de_candidatura,
                              aberta_em, atualizado_em)
    select v.slug, v.titulo, v.estado::public.estado_vaga,
           (select d.id from public.departamentos d where d.nome = v.dep),
           (select x.id from public.tipos_de_vaga x where x.nome = ${literal(NOME_TIPO)}),
           (select n.id from public.niveis n where n.nome = ${literal(NOME_NIVEL)}),
           v.modalidade, v.localizacao, v.resumo, ${DOC}::jsonb, ${HTML}, v.link,
           case when v.dias is null then null else now() - make_interval(days => v.dias) end,
           now() - interval '3 days'
      from (values
        ${linha("rascunho", "Rascunho de verificação", "rascunho", NOME_OP, null, "", "", null, null)},
        ${linha("rascunho-tec", "Outro rascunho de verificação", "rascunho", NOME_TEC, null, "", "", null, null)},
        ${linha("aberta", "Aberta de verificação", "aberta", NOME_OP, "presencial", "Natal, RN", "Resumo da aberta.", "https://exemplo.com/vaga", 2)},
        ${linha("aberta-nova", "Aberta mais nova de verificação", "aberta", NOME_TEC, "remoto", "", "Resumo da nova.", "https://exemplo.com/nova", 1)},
        ${linha("encerrada", "Encerrada de verificação", "encerrada", NOME_OP, "presencial", "Natal, RN", "Resumo da encerrada.", "https://exemplo.com/fim", 5)}
      ) as v(slug, titulo, estado, dep, modalidade, localizacao, resumo, link, dias);`;
}

/** Os erros do Postgres nomeiam a restrição; é por ela que a recusa é julgada. */
const recusouPor = (r, restricao) => r.ok === false && String(r.erro ?? "").includes(restricao);

if (temToken) {
  const doTeste = `like ${literal(`${prefixo}%`)}`;

  /* RLS: o que cada papel vê, na mesma transação. */
  {
    const anon = await desfeito(`${fixture()}
      set local role anon;
      select coalesce(json_agg(v.slug order by v.slug), '[]'::json) as slugs,
             (select count(*)::int from public.departamentos d where d.nome like ${literal(`${PREFIXO_TESTE}${nonce}%`)}) as departamentos,
             (select count(*)::int from public.tipos_de_vaga x where x.nome like ${literal(`${PREFIXO_TESTE}${nonce}%`)}) as tipos_de_vaga,
             (select count(*)::int from public.niveis n where n.nome like ${literal(`${PREFIXO_TESTE}${nonce}%`)}) as niveis
        from public.vagas v where v.slug ${doTeste};`);
    const vistas = anon.ok ? anon.dados?.[0]?.slugs : null;
    afirmar(
      "RLS anônima: das cinco Vagas da matriz, `anon` vê SÓ as Abertas",
      anon.ok && igual(vistas, [slugDe("aberta"), slugDe("aberta-nova")].sort()),
      anon.erro ?? JSON.stringify(vistas),
    );
    afirmar(
      "e vê as TRÊS Classificações da matriz (vocabulário público): 2 Departamentos, 1 Tipo e 1 Nível",
      anon.ok &&
        anon.dados?.[0]?.departamentos === 2 &&
        anon.dados?.[0]?.tipos_de_vaga === 1 &&
        anon.dados?.[0]?.niveis === 1,
      JSON.stringify(anon.dados?.[0] ?? {}),
    );
    const autenticado = await desfeito(`${fixture()}
      set local role authenticated;
      select coalesce(json_agg(v.slug order by v.slug), '[]'::json) as slugs from public.vagas v where v.slug ${doTeste};`);
    afirmar(
      "RLS autenticada: `authenticated` vê as cinco (Rascunho, Aberta e Encerrada)",
      autenticado.ok && autenticado.dados?.[0]?.slugs?.length === 5,
      autenticado.erro ?? JSON.stringify(autenticado.dados?.[0]?.slugs),
    );
  }

  /* situacao_da_vaga, como anon e como authenticated. */
  {
    const CASOS = [
      ["aberta", slugDe("aberta")],
      ["encerrada", slugDe("encerrada")],
      ["rascunho", slugDe("rascunho")],
      ["desconhecido", slugDe("nunca-existiu")],
      ["torto", "X y"],
      ["nulo", null],
    ];
    const selecao = CASOS.map(
      ([k, s]) => `${literal(k)}, (select row_to_json(s) from public.situacao_da_vaga(${s === null ? "null" : literal(s)}) s)`,
    ).join(", ");
    for (const papel of ["anon", "authenticated"]) {
      const r = await desfeito(`${fixture()}
        set local role ${papel};
        select json_build_object(${selecao}) as r;`);
      const s = r.ok ? r.dados?.[0]?.r : null;
      const aberta = s?.aberta ?? {};
      afirmar(
        `situacao_da_vaga (${papel}): a Aberta volta \`aberta\` com TODAS as colunas públicas preenchidas`,
        r.ok &&
          igual(ordenado(Object.keys(aberta)), ordenado(COLUNAS_DA_SITUACAO)) &&
          aberta.situacao === "aberta" &&
          COLUNAS_DA_SITUACAO.every((c) => aberta[c] !== null && aberta[c] !== undefined) &&
          aberta.slug === slugDe("aberta") &&
          aberta.descricao_html === HTML_VALIDO &&
          aberta.link_de_candidatura === "https://exemplo.com/vaga" &&
          aberta.departamento === NOME_OP &&
          aberta.departamento_cor === "var(--categoria-ciano-bg)" &&
          aberta.equivalente_jobposting === "FULL_TIME" &&
          aberta.nivel_cor === "var(--categoria-verde-bg)",
        r.erro ?? JSON.stringify(aberta).slice(0, 300),
      );
      const encerrada = s?.encerrada ?? {};
      afirmar(
        `situacao_da_vaga (${papel}): a Encerrada volta SÓ título e Slug, todo o resto nulo`,
        r.ok &&
          encerrada.situacao === "encerrada" &&
          encerrada.titulo === "Encerrada de verificação" &&
          encerrada.slug === slugDe("encerrada") &&
          COLUNAS_DA_SITUACAO.filter((c) => !["situacao", "titulo", "slug"].includes(c)).every((c) => encerrada[c] === null),
        JSON.stringify(encerrada).slice(0, 300),
      );
      const inexistentes = ["rascunho", "desconhecido", "torto", "nulo"].filter((k) => {
        const l = s?.[k] ?? {};
        return !(
          l.situacao === "inexistente" &&
          COLUNAS_DA_SITUACAO.filter((c) => c !== "situacao").every((c) => l[c] === null)
        );
      });
      afirmar(
        `situacao_da_vaga (${papel}): Rascunho, desconhecido, \`X y\` e nulo voltam \`inexistente\` com TUDO nulo`,
        r.ok && inexistentes.length === 0,
        inexistentes.map((k) => `${k}: ${JSON.stringify(s?.[k]).slice(0, 120)}`).join(" | "),
      );
      afirmar(
        `situacao_da_vaga (${papel}) só fala o vocabulário \`SITUACOES_DA_VAGA\``,
        r.ok && Object.values(s ?? {}).every((l) => estadosDaVaga.SITUACOES_DA_VAGA.includes(l?.situacao)),
      );
    }
  }

  /* vagas_abertas, como anon. */
  {
    const r = await desfeito(`${fixture()}
      set local role anon;
      select coalesce(json_agg(to_jsonb(a) - 'ordinality' order by a.ordinality), '[]'::json) as r
        from public.vagas_abertas() with ordinality as a
       where a.slug ${doTeste};`);
    const lista = r.ok ? r.dados?.[0]?.r ?? [] : [];
    afirmar(
      "vagas_abertas (anon): só as Abertas da matriz, a mais recente primeiro (aberta_em desc)",
      r.ok && igual(lista.map((l) => l.slug), [slugDe("aberta-nova"), slugDe("aberta")]),
      r.erro ?? JSON.stringify(lista.map((l) => l.slug)),
    );
    afirmar(
      "vagas_abertas devolve as colunas da spec, SEM Descrição e SEM Link, com nomes e Cores das Classificações",
      r.ok &&
        lista.length === 2 &&
        lista.every((l) => igual(ordenado(Object.keys(l)), ordenado(COLUNAS_DAS_ABERTAS))) &&
        lista.every((l) => l.situacao === "aberta" && typeof l.departamento === "string" && typeof l.nivel_cor === "string") &&
        lista.find((l) => l.slug === slugDe("aberta"))?.departamento === NOME_OP,
      JSON.stringify(lista[0] ?? {}).slice(0, 300),
    );
  }

  /* A busca do Painel. */
  {
    const busca = (termo, estado) =>
      `(select coalesce(json_agg(b.slug order by b.slug), '[]'::json) from public.buscar_vagas_do_painel(${termo === null ? "null" : literal(termo)}, ${estado === null ? "null" : literal(estado)}) b where b.slug ${doTeste})`;
    const r = await desfeito(`${fixture()}
      set local role authenticated;
      select json_build_object(
        'operacoes_rascunho', ${busca("operacoes", "rascunho")},
        'natal', ${busca("natal", null)},
        'palavras', ${busca("  NATAL   Operações ", "aberta")},
        'tudo', ${busca(null, null)},
        'encerrada', ${busca("", "encerrada")}
      ) as r;`);
    const b = r.ok ? r.dados?.[0]?.r : null;
    afirmar(
      "busca do Painel: `('operacoes', 'rascunho')` traz SÓ os Rascunhos de Operações (sem acento, sem caixa)",
      r.ok && igual(b?.operacoes_rascunho, [slugDe("rascunho")]),
      r.erro ?? JSON.stringify(b?.operacoes_rascunho),
    );
    afirmar(
      "busca do Painel: Localização entra, todas as palavras precisam aparecer em qualquer ordem, e o Estado combina com o termo",
      r.ok &&
        igual(b?.natal, [slugDe("aberta"), slugDe("encerrada")].sort()) &&
        igual(b?.palavras, [slugDe("aberta")]) &&
        igual(b?.encerrada, [slugDe("encerrada")]) &&
        b?.tudo?.length === 5,
      JSON.stringify(b),
    );
    const anon = await desfeito(`set local role anon; select count(*) from public.buscar_vagas_do_painel(null, null);`);
    afirmar(
      "busca do Painel: `anon` NÃO executa",
      anon.ok === false && /permission denied/i.test(String(anon.erro ?? "")),
      anon.erro ?? "anon executou a busca do Painel",
    );
    /* A REGRESSÃO de 20260924130000: a versão de CTE só avaliava o Estado
       quando havia Vaga para cruzar, e aceitava o torto com a tabela vazia. A
       tabela é ESVAZIADA dentro da transação desfeita (antes de trocar de
       papel), para a prova não depender de haver Vagas reais no projeto. */
    const torto = await desfeito(`delete from public.vagas;
      set local role authenticated;
      select count(*) from public.buscar_vagas_do_painel(null, 'publicado');`);
    afirmar(
      "busca do Painel: Estado fora do vocabulário é RECUSADO pelo enum mesmo com `vagas` VAZIA (a regressão de 20260924130000)",
      torto.ok === false && /invalid input value for enum/i.test(String(torto.erro ?? "")),
      torto.erro ?? "o Estado torto passou",
    );
    const vaziaAceita = await desfeito(`delete from public.vagas;
      set local role authenticated;
      select count(*)::int as n from public.buscar_vagas_do_painel(null, 'rascunho');`);
    afirmar(
      "controle: com `vagas` vazia, um Estado do vocabulário responde zero linhas sem erro (a recusa acima é do Estado, não da tabela vazia)",
      vaziaAceita.ok === true && vaziaAceita.dados?.[0]?.n === 0,
      vaziaAceita.erro ?? JSON.stringify(vaziaAceita.dados),
    );
  }

  /* O INVARIANTE DA ABERTA: a MESMA tabela do domínio, agora no banco. Cada
     caso abre o Rascunho da matriz com a alteração do caso. */
  {
    const coluna = (valor) =>
      valor === null ? "null" : typeof valor === "object" ? `${literal(JSON.stringify(valor))}::jsonb` : literal(valor);
    const divergentes = [];
    for (const [nome, patch, esperado] of CASOS_DO_INVARIANTE) {
      const vaga = { ...VAGA_QUE_ABRE, ...patch };
      const campos = ["modalidade", "localizacao", "resumo", "descricao", "descricao_html", "link_de_candidatura"];
      const r = await desfeito(`${fixture()}
        update public.vagas set estado = 'aberta', aberta_em = now(),
          ${campos.map((c) => `${c} = ${coluna(vaga[c])}`).join(", ")}
         where slug = ${literal(slugDe("rascunho"))};
        select v.estado::text as estado from public.vagas v where v.slug = ${literal(slugDe("rascunho"))};`);
      const js = [...regrasDaVaga.problemasParaAbrir(vaga)];
      const bancoAceitou = r.ok && r.dados?.[0]?.estado === "aberta";
      const bancoRecusou = recusouPor(r, "vagas_aberta_completa");
      const certo = esperado.length === 0 ? bancoAceitou && js.length === 0 : bancoRecusou && igual(js, esperado);
      if (!certo) divergentes.push(`${nome}: banco ${r.ok ? "aceitou" : String(r.erro).slice(0, 80)} | js ${JSON.stringify(js)}`);
    }
    afirmar(
      "invariante da Aberta: sem resumo, sem link, Descrição vazia, presencial/híbrida sem Localização e sem Modalidade são recusados pelo CHECK composto; remota sem Localização passa; e `problemasParaAbrir` aponta o MESMO campo",
      divergentes.length === 0,
      divergentes.join(" | "),
    );
    const semData = await desfeito(`${fixture()}
      update public.vagas set estado = 'encerrada' where slug = ${literal(slugDe("rascunho-tec"))};`);
    afirmar(
      "sair do Rascunho sem `aberta_em` é recusado (`vagas_aberta_em_obrigatorio`)",
      recusouPor(semData, "vagas_aberta_em_obrigatorio"),
      semData.erro ?? "aceitou",
    );
  }

  /* Descrição fora da projeção, e HTML fora da projeção. */
  {
    const comDoc = (d) => `${fixture()}
      update public.vagas set descricao = ${literal(JSON.stringify(d))}::jsonb where slug = ${literal(slugDe("rascunho"))};
      select 1 as ok;`;
    const par = (texto, marca) => ({ type: "doc", content: [{ type: "paragraph", content: [t(texto, marca ? [marca] : undefined)] }] });
    const RECUSADOS = [
      ["blockquote", { type: "doc", content: [{ type: "blockquote", content: [{ type: "paragraph", content: [t("x")] }] }] }],
      ["image", { type: "doc", content: [{ type: "image", attrs: { src: "https://chatclean.com.br/a.png" } }] }],
      ["highlight", par("x", { type: "highlight", attrs: { cor: "amarelo" } })],
      ["textAlign", { type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "center" }, content: [t("x")] }] }],
      ["tel:", par("x", { type: "link", attrs: { href: "tel:+5584999999999" } })],
      ["relativo", par("x", { type: "link", attrs: { href: "/carreiras" } })],
    ];
    const ACEITOS = [
      ["mailto:", par("x", { type: "link", attrs: { href: "mailto:vagas@chatclean.com.br" } })],
      ["https:", par("x", { type: "link", attrs: { href: "https://chatclean.com.br", target: "_blank", rel: "noopener noreferrer nofollow" } })],
    ];
    const erradosD = [];
    for (const [nome, d] of RECUSADOS) {
      const r = await desfeito(comDoc(d));
      if (!recusouPor(r, "vagas_descricao_na_projecao")) erradosD.push(`${nome}: ${r.ok ? "aceitou" : String(r.erro).slice(0, 80)}`);
    }
    for (const [nome, d] of ACEITOS) {
      const r = await desfeito(comDoc(d));
      if (!r.ok) erradosD.push(`${nome}: recusou (${String(r.erro).slice(0, 80)})`);
    }
    afirmar(
      "Descrição: citação, imagem, destaque, `textAlign`, link `tel:` e relativo são recusados por `vagas_descricao_na_projecao`; link mailto e https passam",
      erradosD.length === 0,
      erradosD.join(" | "),
    );
    const HTMLS = [
      ["blockquote", "<blockquote><p>x</p></blockquote>"],
      ["img", '<img src="https://chatclean.com.br/a.png" alt="a" loading="lazy">'],
      ["pre", '<pre tabindex="0"><code>x</code></pre>'],
      ["hr", "<p>x</p><hr>"],
      ["mark", '<p><mark data-cor="amarelo">x</mark></p>'],
    ];
    const erradosH = [];
    for (const [nome, h] of HTMLS) {
      const r = await desfeito(`${fixture()}
        update public.vagas set descricao_html = ${literal(h)} where slug = ${literal(slugDe("rascunho"))};
        select 1 as ok;`);
      if (!recusouPor(r, "vagas_descricao_html_segura")) erradosH.push(`${nome}: ${r.ok ? "aceitou" : String(r.erro).slice(0, 80)}`);
    }
    afirmar(
      "HTML: `<blockquote>`, `<img>`, `<pre>`, `<hr>` e `<mark>` são recusados por `vagas_descricao_html_segura`",
      erradosH.length === 0,
      erradosH.join(" | "),
    );
  }

  /* Classificações: nome repetido, Cor e Equivalente fora da lista. */
  {
    const repetidos = [
      ["departamentos", `insert into public.departamentos (nome) values (${literal(`${PREFIXO_TESTE}${nonce} operacoes`)})`],
      ["tipos_de_vaga", `insert into public.tipos_de_vaga (nome, equivalente_jobposting) values (${literal(`${PREFIXO_TESTE}${nonce} TIPO`)}, 'OTHER')`],
      ["niveis", `insert into public.niveis (nome) values (${literal(`${PREFIXO_TESTE}${nonce} nivel`)})`],
    ];
    const errados = [];
    for (const [tabela, insercao] of repetidos) {
      const r = await desfeito(`${fixture()}\n${insercao};\nselect 1 as ok;`);
      if (!recusouPor(r, `${tabela}_nome_normalizado_unico`)) errados.push(`${tabela}: ${r.ok ? "aceitou" : String(r.erro).slice(0, 80)}`);
    }
    afirmar(
      "nome repetido sem caixa nem acento (`operacoes` diante de `Operações`) é recusado pelo índice normalizado, nas três listas",
      errados.length === 0,
      errados.join(" | "),
    );
    const cores = await desfeito(`
      insert into public.departamentos (nome, cor) values
        ${CORES_DE_CATEGORIA.map((cor, i) => `(${literal(`${PREFIXO_TESTE}${nonce} cor ${i}`)}, ${literal(cor)})`).join(",\n        ")};
      insert into public.niveis (nome, cor) values
        ${CORES_DE_CATEGORIA.map((cor, i) => `(${literal(`${PREFIXO_TESTE}${nonce} cor ${i}`)}, ${literal(cor)})`).join(",\n        ")};
      insert into public.tipos_de_vaga (nome, equivalente_jobposting) values
        ${classificacoes.EQUIVALENTES_JOBPOSTING.map((e, i) => `(${literal(`${PREFIXO_TESTE}${nonce} eq ${i}`)}, ${literal(e)})`).join(",\n        ")};
      select 1 as ok;`);
    afirmar(
      "as oito Cores da paleta e os oito Equivalentes são aceitos",
      cores.ok,
      cores.erro ?? "",
    );
    const foraDaLista = [
      ["departamentos_cor_na_paleta", `insert into public.departamentos (nome, cor) values (${literal(`${PREFIXO_TESTE}${nonce} x`)}, 'var(--categoria-laranja-bg)')`],
      ["niveis_cor_na_paleta", `insert into public.niveis (nome, cor) values (${literal(`${PREFIXO_TESTE}${nonce} x`)}, '#ff0000')`],
      ["tipos_de_vaga_equivalente_valido", `insert into public.tipos_de_vaga (nome, equivalente_jobposting) values (${literal(`${PREFIXO_TESTE}${nonce} x`)}, 'FULLTIME')`],
      ["departamentos_nome_valido", `insert into public.departamentos (nome) values ('   ')`],
      ["niveis_nome_valido", `insert into public.niveis (nome) values (${literal("x".repeat(81))})`],
      ["tipos_de_vaga_ordem_nao_negativa", `insert into public.tipos_de_vaga (nome, equivalente_jobposting, ordem) values (${literal(`${PREFIXO_TESTE}${nonce} y`)}, 'OTHER', -1)`],
    ];
    const erradosF = [];
    for (const [restricao, insercao] of foraDaLista) {
      const r = await desfeito(`${insercao};\nselect 1 as ok;`);
      if (!recusouPor(r, restricao)) erradosF.push(`${restricao}: ${r.ok ? "aceitou" : String(r.erro).slice(0, 80)}`);
    }
    afirmar(
      "Cor fora da paleta, Equivalente fora da lista, nome vazio ou longo e ordem negativa são recusados, cada um pela sua restrição",
      erradosF.length === 0,
      erradosF.join(" | "),
    );
    const restrict = await desfeito(`${fixture()}
      delete from public.departamentos where nome = ${literal(NOME_OP)};
      select 1 as ok;`);
    afirmar(
      "excluir um Departamento em uso é recusado pela FK `restrict`",
      restrict.ok === false && /foreign key|violates/i.test(String(restrict.erro ?? "")),
      restrict.erro ?? "aceitou",
    );
  }

  /* Limites e formatos de `vagas`, e o Link de Candidatura contra o domínio. */
  {
    const alterar = (atribuicao) => `${fixture()}
      update public.vagas set ${atribuicao} where slug = ${literal(slugDe("rascunho"))};
      select 1 as ok;`;
    const CASOS = [
      ["vagas_titulo_valido", `titulo = ${literal("x".repeat(121))}`],
      ["vagas_titulo_valido", "titulo = '   '"],
      ["vagas_resumo_tamanho", `resumo = ${literal("x".repeat(201))}`],
      ["vagas_localizacao_tamanho", `localizacao = ${literal("x".repeat(81))}`],
      ["vagas_slug_formato", "slug = 'Com Espaco'"],
      ["vagas_modalidade_valida", "modalidade = 'hibrida'"],
    ];
    const errados = [];
    for (const [restricao, atribuicao] of CASOS) {
      const r = await desfeito(alterar(atribuicao));
      if (!recusouPor(r, restricao)) errados.push(`${restricao} (${atribuicao.slice(0, 30)}): ${r.ok ? "aceitou" : String(r.erro).slice(0, 80)}`);
    }
    const noLimite = await desfeito(
      alterar(`titulo = ${literal("x".repeat(120))}, resumo = ${literal("x".repeat(200))}, localizacao = ${literal("x".repeat(80))}`),
    );
    if (!noLimite.ok) errados.push(`no limite: ${String(noLimite.erro).slice(0, 80)}`);
    afirmar(
      "limites e formatos: título 121 ou só espaço, Resumo 201, Localização 81, Slug torto e Modalidade fora da lista são recusados; 120/200/80 passam",
      errados.length === 0,
      errados.join(" | "),
    );
    const LINKS = [
      "https://x.com/v",
      "http://a.b",
      "mailto:a@b",
      "javascript:x",
      "/vaga",
      "ftp://x",
      "",
      "https://x .com",
      "HTTPS://x.com",
      "Http://a.b/Caminho",
      ...MATRIZ_DO_LINK_REVISADA,
    ];
    const divergentes = [];
    for (const link of LINKS) {
      const r = await desfeito(alterar(`link_de_candidatura = ${literal(link)}`));
      const banco = r.ok ? true : recusouPor(r, "vagas_link_de_candidatura_valido") ? false : `erro: ${String(r.erro).slice(0, 60)}`;
      if (banco !== regrasDaVaga.linkDeCandidaturaValido(link)) divergentes.push(`${JSON.stringify(link)}: banco ${banco}`);
    }
    afirmar(
      "Link de Candidatura: o CHECK do banco e `linkDeCandidaturaValido` concordam em toda a matriz (a da spec, caixa alta, `https:x`, `http:/x`, `https:///x`, C1, DEL, NBSP, U+2028)",
      divergentes.length === 0,
      divergentes.join(" | "),
    );
  }

  /* Padrão do Estado e o gatilho de `atualizado_em`. */
  {
    const r = await desfeito(`${fixture()}
      insert into public.vagas (slug, titulo, departamento_id, tipo_id, nivel_id)
      select ${literal(slugDe("sem-estado"))}, 'Sem estado', d.id, x.id, n.id
        from public.departamentos d, public.tipos_de_vaga x, public.niveis n
       where d.nome = ${literal(NOME_OP)} and x.nome = ${literal(NOME_TIPO)} and n.nome = ${literal(NOME_NIVEL)};
      update public.vagas set titulo = 'Retitulada' where slug = ${literal(slugDe("rascunho"))};
      update public.departamentos set cor = 'var(--categoria-rosa-bg)' where nome = ${literal(NOME_OP)};
      update public.tipos_de_vaga set ordem = 901 where nome = ${literal(NOME_TIPO)};
      update public.niveis set ordem = 901 where nome = ${literal(NOME_NIVEL)};
      select
        (select v.estado::text from public.vagas v where v.slug = ${literal(slugDe("sem-estado"))}) as padrao,
        (select v.descricao = '{"type": "doc", "content": [{"type": "paragraph"}]}'::jsonb and v.descricao_html = ''
           from public.vagas v where v.slug = ${literal(slugDe("sem-estado"))}) as descricao_padrao,
        (select v.atualizado_em = now() from public.vagas v where v.slug = ${literal(slugDe("rascunho"))}) as vaga,
        (select d.atualizado_em = now() from public.departamentos d where d.nome = ${literal(NOME_OP)}) as departamento,
        (select x.atualizado_em = now() from public.tipos_de_vaga x where x.nome = ${literal(NOME_TIPO)}) as tipo,
        (select n.atualizado_em = now() from public.niveis n where n.nome = ${literal(NOME_NIVEL)}) as nivel;`);
    const l = r.ok ? r.dados?.[0] : null;
    afirmar(
      "uma Vaga nasce `rascunho`, com a Descrição vazia padrão (documento e HTML)",
      l?.padrao === "rascunho" && l?.descricao_padrao === true,
      r.erro ?? JSON.stringify(l),
    );
    afirmar(
      "o gatilho mantém `atualizado_em` nas quatro tabelas",
      l?.vaga === true && l?.departamento === true && l?.tipo === true && l?.nivel === true,
      r.erro ?? JSON.stringify(l),
    );
  }
} else {
  afirmar("a matriz de I/O pôde ser exercida", false, "sem SUPABASE_ACCESS_TOKEN");
}

/* ─── (g) A API REST de verdade, com um Rascunho confirmado ──────────────── */

secao("(g) a API REST: um Rascunho confirmado, visto pelo visitante e pelo Painel");

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
    return { alcancou: true, status: r.status, corpo: await r.text() };
  } catch (erro) {
    return { alcancou: false, status: 0, corpo: "", erro: String(erro?.message ?? erro) };
  }
}
const comoJson = (r) => {
  try {
    return JSON.parse(r.corpo);
  } catch {
    return null;
  }
};

const EMAIL_TESTE = "verificacao.carreiras+%@chatclean.com.br";

/** As leituras do Painel exercidas pelo módulo, com a sessão da Conta temporária. */
const LEITURAS_DO_PAINEL_PELO_MODULO = Object.freeze([
  "a camada do Painel (`listarVagasDoPainel({ estado: \"rascunho\" })`), pelo módulo e com sessão, traz o Rascunho de teste e só Rascunhos",
  "a camada do Painel (`lerVagaDoPainelPorId`) devolve o Rascunho de teste pelo id",
  "a camada do Painel (`listarClassificacoesDoPainel`) conta as Vagas: o Departamento do Rascunho tem contagem numérica >= 1, não nula",
]);

if (temToken && chavePublicavel) {
  const MARCA_NOME = `${PREFIXO_TESTE}%`;
  const restos = await executarSql(
    token,
    `with v as (delete from public.vagas where slug like ${literal(MARCA_NOME)} returning 1),
          d as (delete from public.departamentos where nome like ${literal(MARCA_NOME)} returning 1),
          x as (delete from public.tipos_de_vaga where nome like ${literal(MARCA_NOME)} returning 1),
          n as (delete from public.niveis where nome like ${literal(MARCA_NOME)} returning 1),
          u as (delete from auth.users where email like ${literal(EMAIL_TESTE)} returning 1)
     select (select count(*) from v) + (select count(*) from d) + (select count(*) from x)
          + (select count(*) from n) + (select count(*) from u) as n`,
  );
  afirmar(
    "nenhum resto de verificação sobrou de execuções anteriores",
    restos.ok && Number(restos.dados?.[0]?.n ?? -1) === 0,
    restos.ok ? `${restos.dados?.[0]?.n} linha(s) removida(s) agora` : restos.erro,
  );

  const slugRest = slugDe("rascunho-rest");
  const emailTemp = `verificacao.carreiras+${nonce}@chatclean.com.br`;
  const senhaTemp = `Vf-${nonce.slice(0, 8)}-${Math.random().toString(36).slice(2, 10)}!aZ9`;
  registrarSegredo(senhaTemp);

  try {
    /* Só RASCUNHO é confirmado. Nunca uma Aberta. */
    const criacao = await executarSql(
      token,
      `insert into public.departamentos (nome, cor, ordem) values (${literal(NOME_OP)}, 'var(--categoria-ciano-bg)', 900);
       insert into public.tipos_de_vaga (nome, equivalente_jobposting, ordem) values (${literal(NOME_TIPO)}, 'FULL_TIME', 900);
       insert into public.niveis (nome, cor, ordem) values (${literal(NOME_NIVEL)}, 'var(--categoria-verde-bg)', 900);
       insert into public.vagas (slug, titulo, estado, departamento_id, tipo_id, nivel_id)
       select ${literal(slugRest)}, 'Rascunho confirmado de verificação', 'rascunho', d.id, x.id, n.id
         from public.departamentos d, public.tipos_de_vaga x, public.niveis n
        where d.nome = ${literal(NOME_OP)} and x.nome = ${literal(NOME_TIPO)} and n.nome = ${literal(NOME_NIVEL)};`,
    );
    const criou = afirmar("o Rascunho de teste foi confirmado (só Rascunho, nunca Aberta)", criacao.ok, criacao.erro ?? "");

    if (criou) {
      const controle = await rest(`departamentos?select=nome&nome=eq.${encodeURIComponent(NOME_OP)}`);
      const credencialBoa = afirmar(
        "controle positivo: a chave publicável obtém 200 e LÊ a Classificação de teste",
        controle.status === 200 && comoJson(controle)?.length === 1,
        controle.erro ?? `HTTP ${controle.status} ${controle.corpo.slice(0, 160)}`,
      );
      if (credencialBoa) {
        const anon = await rest(`vagas?select=slug&slug=eq.${slugRest}`);
        afirmar(
          "o visitante (REST, sem sessão) NÃO vê o Rascunho",
          anon.status === 200 && igual(comoJson(anon), []),
          `HTTP ${anon.status} ${anon.corpo.slice(0, 160)}`,
        );
        const situacao = await rest("rpc/situacao_da_vaga", { method: "POST", body: JSON.stringify({ p_slug: slugRest }) });
        const linha = comoJson(situacao)?.[0] ?? null;
        afirmar(
          "e `situacao_da_vaga` responde `inexistente` com tudo nulo para o Rascunho",
          situacao.status === 200 &&
            linha?.situacao === "inexistente" &&
            COLUNAS_DA_SITUACAO.filter((c) => c !== "situacao").every((c) => linha[c] === null),
          `HTTP ${situacao.status} ${situacao.corpo.slice(0, 160)}`,
        );
        const busca = await rest("rpc/buscar_vagas_do_painel", { method: "POST", body: JSON.stringify({}) });
        afirmar(
          "o visitante NÃO executa a busca do Painel pela REST",
          busca.alcancou && busca.status >= 400 && busca.status < 500,
          `HTTP ${busca.status} ${busca.corpo.slice(0, 160)}`,
        );
        const escrita = await rest("departamentos", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ nome: `${PREFIXO_TESTE}${nonce} intruso` }),
        });
        afirmar(
          "o visitante NÃO escreve em Classificação pela REST",
          escrita.alcancou && escrita.status >= 400 && escrita.status < 500,
          `HTTP ${escrita.status} ${escrita.corpo.slice(0, 160)}`,
        );

        /* A camada de dados, executada de verdade contra o projeto. */
        if (urlDoEnv) {
          process.env.VITE_SUPABASE_URL = urlDoEnv;
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY = chavePublicavel;
          const dados = await import(urlDe("src/data/carreiras/leitura.js"));
          const situacaoPelaCamada = await dados.lerSituacaoDaVaga(slugRest);
          afirmar(
            "a camada pública (`lerSituacaoDaVaga`) diz `inexistente` para o Rascunho",
            situacaoPelaCamada.ok === true && situacaoPelaCamada.dados.situacao === "inexistente",
            JSON.stringify(situacaoPelaCamada).slice(0, 200),
          );
          const abertasPelaCamada = await dados.listarVagasAbertas();
          afirmar(
            "a camada pública (`listarVagasAbertas`) responde e não traz o Rascunho",
            abertasPelaCamada.ok === true && !abertasPelaCamada.dados.some((v) => v.slug === slugRest),
            JSON.stringify(abertasPelaCamada).slice(0, 200),
          );
          const classificacoesPelaCamada = await dados.listarClassificacoes();
          afirmar(
            "a camada pública (`listarClassificacoes`) traz as três listas, com a Classificação de teste",
            classificacoesPelaCamada.ok === true &&
              classificacoesPelaCamada.dados.departamentos.some((d) => d.nome === NOME_OP) &&
              classificacoesPelaCamada.dados.tipos_de_vaga.some((d) => d.nome === NOME_TIPO) &&
              classificacoesPelaCamada.dados.niveis.some((d) => d.nome === NOME_NIVEL),
            JSON.stringify(classificacoesPelaCamada).slice(0, 200),
          );
        } else {
          /* Nada é pulado em silêncio: sem a URL do projeto no `.env`, a camada
             não pode ser executada contra ele, e isso é uma falha. */
          afirmar(
            "a camada de dados pôde ser executada contra o projeto",
            false,
            "sem VITE_SUPABASE_URL no `.env`: as leituras públicas e as do Painel não foram exercidas",
          );
        }

        /* A Conta temporária: a sessão real do Painel. */
        const conta = await executarSql(token, sqlDeCriacaoDeConta({ email: emailTemp, senha: senhaTemp, nome: "Conta Temporária de Carreiras" }));
        const contaCriada = afirmar("a Conta temporária foi criada", conta.ok && Boolean(conta.dados?.[0]?.id), conta.erro ?? "");
        if (contaCriada) {
          let login = { status: 0, corpo: "" };
          try {
            const r = await fetch(`${URL_PROJETO}/auth/v1/token?grant_type=password`, {
              method: "POST",
              signal: AbortSignal.timeout(TIMEOUT_MS),
              headers: { apikey: chavePublicavel, "Content-Type": "application/json" },
              body: JSON.stringify({ email: emailTemp, password: senhaTemp }),
            });
            login = { status: r.status, corpo: await r.text() };
          } catch (erro) {
            login = { status: 0, corpo: String(erro?.message ?? erro) };
          }
          const jwt = comoJson(login)?.access_token ?? null;
          const refresh = comoJson(login)?.refresh_token ?? null;
          if (jwt) registrarSegredo(jwt);
          if (refresh) registrarSegredo(refresh);
          const COM_SESSAO = [
            "o Painel (REST, com sessão) VÊ o Rascunho",
            "o Painel executa a busca e acha o Rascunho pelo Estado",
            "o Painel lê a contagem de Vagas por Classificação (`vagas(count)`)",
            "nem com sessão se escreve em `vagas` pela REST",
            ...LEITURAS_DO_PAINEL_PELO_MODULO,
          ];
          if (login.status === 429) {
            for (const d of COM_SESSAO) adiar(d, "o GoTrue respondeu 429 (limite de taxa): não é defeito, a asserção não pôde ser exercida agora");
          } else if (!jwt) {
            afirmar("a sessão do Painel foi aberta", false, `HTTP ${login.status} ${login.corpo.slice(0, 160)}`);
          } else {
            const auth = { Authorization: `Bearer ${jwt}` };
            const painel = await rest(`vagas?select=slug,estado&slug=eq.${slugRest}`, { headers: auth });
            afirmar(
              COM_SESSAO[0],
              painel.status === 200 && igual(comoJson(painel), [{ slug: slugRest, estado: "rascunho" }]),
              `HTTP ${painel.status} ${painel.corpo.slice(0, 160)}`,
            );
            const busca2 = await rest(`rpc/buscar_vagas_do_painel?select=slug&slug=eq.${slugRest}`, {
              method: "POST",
              headers: auth,
              body: JSON.stringify({ p_termo: null, p_estado: "rascunho" }),
            });
            afirmar(
              COM_SESSAO[1],
              busca2.status === 200 && igual(comoJson(busca2), [{ slug: slugRest }]),
              `HTTP ${busca2.status} ${busca2.corpo.slice(0, 160)}`,
            );
            const contagem = await rest(`departamentos?select=nome,vagas(count)&nome=eq.${encodeURIComponent(NOME_OP)}`, { headers: auth });
            afirmar(
              COM_SESSAO[2],
              contagem.status === 200 && comoJson(contagem)?.[0]?.vagas?.[0]?.count === 1,
              `HTTP ${contagem.status} ${contagem.corpo.slice(0, 160)}`,
            );
            const escritaPainel = await rest(`vagas?slug=eq.${slugRest}`, {
              method: "PATCH",
              headers: { ...auth, Prefer: "return=representation" },
              body: JSON.stringify({ titulo: "Invadido" }),
            });
            const titulo = await consulta(
              `select v.titulo from public.vagas v where v.slug = ${literal(slugRest)}`,
              "título do Rascunho depois da tentativa",
            );
            afirmar(
              COM_SESSAO[3],
              escritaPainel.alcancou && escritaPainel.status >= 400 && titulo.linha?.titulo === "Rascunho confirmado de verificação",
              `HTTP ${escritaPainel.status} ${escritaPainel.corpo.slice(0, 120)} | título: ${titulo.linha?.titulo}`,
            );

            /* O CAMINHO DE SUCESSO DAS LEITURAS DO PAINEL, pelo MÓDULO (e não
               por fetch cru). A sessão da Conta temporária é injetada no MESMO
               cliente autenticado que o módulo usa (o grafo de módulos é um
               só: `clientes.js` é importado pela mesma URL). Fora do navegador
               o cliente guarda a sessão em MEMÓRIA, e nada vai para o disco. */
            if (urlDoEnv && refresh) {
              const dados = await import(urlDe("src/data/carreiras/leitura.js"));
              const { clienteAutenticado } = await import(urlDe("src/data/supabase/clientes.js"));
              const cliente = clienteAutenticado();
              const sessao = await cliente.auth.setSession({ access_token: jwt, refresh_token: refresh });
              const sessaoAberta = afirmar(
                "a sessão da Conta temporária foi injetada no cliente autenticado do módulo (em memória)",
                !sessao.error && Boolean(sessao.data?.session),
                String(sessao.error?.message ?? "sem sessão"),
              );
              if (sessaoAberta) {
                try {
                  const idDoRascunho = await consulta(
                    `select v.id::text as id from public.vagas v where v.slug = ${literal(slugRest)}`,
                    "id do Rascunho de teste",
                  );
                  const id = idDoRascunho.linha?.id ?? null;
                  const lista = await dados.listarVagasDoPainel({ estado: "rascunho" });
                  afirmar(
                    LEITURAS_DO_PAINEL_PELO_MODULO[0],
                    lista.ok === true &&
                      lista.dados.some((v) => v.slug === slugRest && v.estado === "rascunho" && v.id === id) &&
                      lista.dados.every((v) => v.estado === "rascunho"),
                    JSON.stringify(lista).slice(0, 200),
                  );
                  const uma = await dados.lerVagaDoPainelPorId(id);
                  afirmar(
                    LEITURAS_DO_PAINEL_PELO_MODULO[1],
                    uma.ok === true &&
                      uma.dados?.id === id &&
                      uma.dados?.slug === slugRest &&
                      uma.dados?.estado === "rascunho" &&
                      uma.dados?.titulo === "Rascunho confirmado de verificação",
                    JSON.stringify(uma).slice(0, 200),
                  );
                  const cls = await dados.listarClassificacoesDoPainel();
                  const dep = cls.ok ? cls.dados.departamentos.find((d) => d.nome === NOME_OP) : null;
                  afirmar(
                    LEITURAS_DO_PAINEL_PELO_MODULO[2],
                    cls.ok === true &&
                      typeof dep?.vagas === "number" &&
                      Number.isInteger(dep.vagas) &&
                      dep.vagas >= 1 &&
                      cls.dados.tipos_de_vaga.some((x) => x.nome === NOME_TIPO && typeof x.vagas === "number") &&
                      cls.dados.niveis.some((x) => x.nome === NOME_NIVEL && typeof x.vagas === "number"),
                    JSON.stringify(dep ?? cls).slice(0, 200),
                  );
                } finally {
                  /* Sem renovação no fundo e sem sessão guardada depois daqui. */
                  cliente.auth.stopAutoRefresh();
                  await cliente.auth.signOut({ scope: "local" }).catch(() => {});
                }
              }
            } else {
              afirmar(
                "as leituras do Painel puderam ser exercidas pelo módulo",
                false,
                urlDoEnv ? "o login não devolveu refresh_token" : "sem VITE_SUPABASE_URL no `.env`",
              );
            }
          }
        }
      }
    }
  } finally {
    /* As limpezas são CONFERIDAS: uma remoção que falhasse em silêncio só
       apareceria como resíduo na próxima execução, e aí sem a causa. */
    const remocao = await executarSql(token, sqlDeRemocaoDeConta(emailTemp));
    afirmar("limpeza: a remoção da Conta temporária respondeu sem erro", remocao.ok, remocao.erro ?? "");
    const limpeza = await executarSql(
      token,
      `delete from public.vagas where slug like ${literal(`${PREFIXO_TESTE}%`)};
       delete from public.departamentos where nome like ${literal(`${PREFIXO_TESTE}%`)};
       delete from public.tipos_de_vaga where nome like ${literal(`${PREFIXO_TESTE}%`)};
       delete from public.niveis where nome like ${literal(`${PREFIXO_TESTE}%`)};
       select
         (select count(*)::int from public.vagas where slug like ${literal(`${PREFIXO_TESTE}%`)})
         + (select count(*)::int from public.departamentos where nome like ${literal(`${PREFIXO_TESTE}%`)})
         + (select count(*)::int from public.tipos_de_vaga where nome like ${literal(`${PREFIXO_TESTE}%`)})
         + (select count(*)::int from public.niveis where nome like ${literal(`${PREFIXO_TESTE}%`)})
         + (select count(*)::int from auth.users where email = ${literal(emailTemp)}) as sobrou;`,
    );
    afirmar(
      "limpeza: os deletes do Rascunho e das Classificações de teste responderam sem erro, e não sobrou nada (nem a Conta)",
      limpeza.ok && limpeza.dados?.[0]?.sobrou === 0,
      limpeza.erro ?? `sobrou: ${JSON.stringify(limpeza.dados?.[0])}`,
    );
  }
} else {
  afirmar(
    "a prova pela API REST pôde ser exercida",
    false,
    temToken ? "sem VITE_SUPABASE_PUBLISHABLE_KEY no `.env`" : "sem SUPABASE_ACCESS_TOKEN",
  );
}

/* ─── (h) Resíduo zero ───────────────────────────────────────────────────── */

secao("(h) resíduo zero");

if (temToken) {
  const sobrou = await consulta(
    `select
       (select count(*)::int from public.vagas where slug like ${literal(`${PREFIXO_TESTE}%`)}) as vagas,
       (select count(*)::int from public.departamentos where nome like ${literal(`${PREFIXO_TESTE}%`)}) as departamentos,
       (select count(*)::int from public.tipos_de_vaga where nome like ${literal(`${PREFIXO_TESTE}%`)}) as tipos,
       (select count(*)::int from public.niveis where nome like ${literal(`${PREFIXO_TESTE}%`)}) as niveis,
       (select count(*)::int from auth.users where email like ${literal(EMAIL_TESTE)}) as contas,
       (select count(*)::int from public.vagas where estado = 'aberta' and slug like 'zzz-%') as abertas_de_teste`,
    "resíduo da verificação",
  );
  const campos = ["vagas", "departamentos", "tipos", "niveis", "contas", "abertas_de_teste"];
  afirmar(
    "nenhum resíduo da verificação ficou no projeto, e nenhuma Vaga Aberta de teste existe",
    !sobrou.falhou && campos.every((c) => sobrou.linha?.[c] === 0),
    campos.map((c) => `${c}: ${sobrou.linha?.[c] ?? "?"}`).join(" | "),
  );
} else {
  afirmar("o resíduo pôde ser conferido", false, "sem SUPABASE_ACCESS_TOKEN");
}

/* ─── Veredito ───────────────────────────────────────────────────────────── */

console.log("");
if (adiadas > 0) {
  console.log(`ATENÇÃO: ${adiadas} asserção(ões) NÃO foram exercidas. Rode de novo em alguns minutos.`);
}
if (falhas === 0 && adiadas === 0) {
  console.log("Carreiras verificado: todas as asserções passaram.");
  process.exitCode = 0;
} else {
  console.log(`Carreiras NÃO verificado: ${falhas} falha(s), ${adiadas} adiada(s).`);
  process.exitCode = 1;
}

});
