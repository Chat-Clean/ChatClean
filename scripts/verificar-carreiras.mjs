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
 * Story 5.3 (a escrita pela função única):
 *
 *   (i) LOCAL, o despacho: `api/carreiras.js` executado com `req`/`res` de
 *       mentira contra um dublê local de GoTrue e PostgREST, cobrindo a matriz
 *       de I/O de servidor, inclusive abrir e reabrir (que só existem aqui);
 *   (j) REMOTO, o gatilho `vagas_maquina_de_estados`, em transação desfeita;
 *   (k) REMOTO, a prova real em produção SÓ com Rascunho: criar, editar,
 *       Slug em colisão, excluir Rascunho e o CRUD de Classificação, com
 *       prefixo `zzz-verificacao-5-3-`. NUNCA abre uma Vaga em produção;
 *   (l) LOCAL, estática e executada: o cliente do Painel só conhece a rota
 *       nova, as frases não falam de post, nenhum travessão, e os tipos de
 *       erro do cliente são os do servidor.
 *
 * Revisão da 5.3 (migração 20260924160000): `aberta_em` só pelo banco (a
 * primeira abertura com data é recusada), o TRUNCATE com Vaga Aberta barrado
 * por um gatilho de instrução, o dublê amarrado à MAQUINA e à função vigente,
 * a seleção de frase da tradução do banco, e o transporte recusando local
 * como `dados_invalidos`.
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
  revelarChaves,
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
  /* Story 5.3: a máquina de estados imposta no banco (segunda defesa). */
  "20260924150000_maquina_de_estados_da_vaga.sql",
  /* Revisão da 5.3: `aberta_em` só pelo banco, e o TRUNCATE barrado. */
  "20260924160000_abertura_so_pelo_banco.sql",
]);
/** A migração da máquina de estados (Story 5.3). */
const MIGRACAO_DA_MAQUINA = "20260924150000_maquina_de_estados_da_vaga.sql";
/**
 * O gatilho e a função da máquina (Story 5.3). A função NÃO entra em
 * `FUNCOES_NOVAS`: aquela lista é a das cinco que a migração 20260924120000
 * cria, e duas asserções contam cinco sobre ela. A lista de permissão de
 * comandos ganha os dois nomes à parte.
 */
const GATILHO_DA_MAQUINA = "vagas_maquina_de_estados";
const FUNCAO_DA_MAQUINA = "vagas_respeitam_a_maquina";
/**
 * A correção da revisão da 5.3: redefine a função da máquina (a primeira
 * abertura com `aberta_em` enviado passa a ser recusada) e cria o gatilho de
 * INSTRUÇÃO que barra o `truncate` com Vaga Aberta, com a função dele. Os
 * dois nomes novos entram na lista de permissão de comandos à parte, como os
 * da máquina, e NÃO em `FUNCOES_NOVAS`.
 */
const MIGRACAO_DA_ABERTURA = "20260924160000_abertura_so_pelo_banco.sql";
const GATILHO_DO_TRUNCATE = "vagas_maquina_de_estados_no_truncate";
const FUNCAO_DO_TRUNCATE = "vagas_truncate_respeita_a_maquina";
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
    /* TROCA REGISTRADA (Story 5.3): a lista aceitava só o gatilho
       `<t>_tocar_atualizado_em` e as funções de `FUNCOES_NOVAS`. Ela ganha,
       pelo NOME, o gatilho da máquina de estados em `vagas` (antes de insert,
       update e delete, por linha, chamando só a função da máquina) e a
       própria função, com o `comment on` dela. Nada mais muda. */
    new RegExp(`^create or replace function public\\.${FUNCAO_DA_MAQUINA}\\(\\)`),
    new RegExp(`^comment on function public\\.${FUNCAO_DA_MAQUINA}\\(\\) is\\s*$`),
    new RegExp(`^drop trigger if exists ${GATILHO_DA_MAQUINA} on public\\.vagas$`),
    new RegExp(
      `^create trigger ${GATILHO_DA_MAQUINA} before insert or update or delete on public\\.vagas for each row execute function public\\.${FUNCAO_DA_MAQUINA}\\(\\)$`,
    ),
    /* TROCA REGISTRADA (revisão da 5.3): o gatilho de INSTRUÇÃO que barra o
       `truncate` com Vaga Aberta, e a função dele, pelo NOME: só em `vagas`,
       só `before truncate`, só `for each statement`, só com a função dele. */
    new RegExp(`^create or replace function public\\.${FUNCAO_DO_TRUNCATE}\\(\\)`),
    new RegExp(`^comment on function public\\.${FUNCAO_DO_TRUNCATE}\\(\\) is\\s*$`),
    new RegExp(`^drop trigger if exists ${GATILHO_DO_TRUNCATE} on public\\.vagas$`),
    new RegExp(
      `^create trigger ${GATILHO_DO_TRUNCATE} before truncate on public\\.vagas for each statement execute function public\\.${FUNCAO_DO_TRUNCATE}\\(\\)$`,
    ),
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
    /* Story 5.3: o gatilho da máquina, só no nome, só em `vagas`, só com a
       função dela; e a função, só ela. */
    "create trigger vagas_maquina_de_estados before insert or update or delete on public.posts for each row execute function public.vagas_respeitam_a_maquina()",
    "create trigger vagas_maquina_de_estados before insert or update or delete on public.vagas for each row execute function public.tocar_atualizado_em()",
    "create trigger outro_gatilho before insert or update or delete on public.vagas for each row execute function public.vagas_respeitam_a_maquina()",
    "drop trigger if exists vagas_maquina_de_estados on public.posts",
    "create or replace function public.vagas_respeitam_a_maquina_outra()",
    "drop function if exists public.vagas_respeitam_a_maquina()",
    "comment on function public.exigir_slug_livre() is",
    /* Revisão da 5.3: o gatilho do truncate, só no nome, só em `vagas`, só
       antes do truncate, só por instrução, só com a função dele. */
    "create trigger vagas_maquina_de_estados_no_truncate before truncate on public.posts for each statement execute function public.vagas_truncate_respeita_a_maquina()",
    "create trigger vagas_maquina_de_estados_no_truncate after truncate on public.vagas for each statement execute function public.vagas_truncate_respeita_a_maquina()",
    "create trigger vagas_maquina_de_estados_no_truncate before truncate on public.vagas for each statement execute function public.tocar_atualizado_em()",
    "create trigger outro_gatilho before truncate on public.vagas for each statement execute function public.vagas_truncate_respeita_a_maquina()",
    "create trigger vagas_maquina_de_estados_no_truncate before insert or update or delete on public.vagas for each row execute function public.vagas_truncate_respeita_a_maquina()",
    "drop trigger if exists vagas_maquina_de_estados_no_truncate on public.posts",
    "create or replace function public.vagas_truncate_respeita_a_maquina_outra()",
    "drop function if exists public.vagas_truncate_respeita_a_maquina()",
    "comment on function public.vagas_truncate_respeita_a_maquina_outra() is",
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
    "create or replace function public.vagas_respeitam_a_maquina()",
    "comment on function public.vagas_respeitam_a_maquina() is",
    "drop trigger if exists vagas_maquina_de_estados on public.vagas",
    "create trigger vagas_maquina_de_estados before insert or update or delete on public.vagas for each row execute function public.vagas_respeitam_a_maquina()",
    "create or replace function public.vagas_truncate_respeita_a_maquina()",
    "comment on function public.vagas_truncate_respeita_a_maquina() is",
    "drop trigger if exists vagas_maquina_de_estados_no_truncate on public.vagas",
    "create trigger vagas_maquina_de_estados_no_truncate before truncate on public.vagas for each statement execute function public.vagas_truncate_respeita_a_maquina()",
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

/* A MIGRAÇÃO DA MÁQUINA DE ESTADOS (Story 5.3), lida. O comportamento é
   provado no banco, em transação desfeita (seção j); aqui se fixa a FORMA:
   gatilho de linha antes das três escritas, função invoker com `search_path`
   fixo, toda recusa com 23514 e o nome do gatilho, e execução revogada. */
{
  const texto = ler(path.join("supabase", "migrations", MIGRACAO_DA_MAQUINA)) ?? "";
  afirmar(`${MIGRACAO_DA_MAQUINA}: existe`, texto !== "", "arquivo ausente em supabase/migrations");
  const cmds = comandosSql(texto);
  const limpos = cmds.map((c) => c.limpo);
  const funcao = cmds.find((c) => c.limpo.startsWith(`create or replace function public.${FUNCAO_DA_MAQUINA}()`));
  afirmar(
    "a função da máquina é de GATILHO, plpgsql, `security invoker` e fixa `search_path = ''`",
    Boolean(funcao) &&
      /^create or replace function public\.vagas_respeitam_a_maquina\(\) returns trigger language plpgsql security invoker set search_path = as$/.test(
        funcao.limpo,
      ) &&
      funcao.bruto.toLowerCase().replace(/\s+/g, " ").includes("set search_path = ''"),
    funcao?.limpo ?? "ausente",
  );
  const iDrop = limpos.indexOf(`drop trigger if exists ${GATILHO_DA_MAQUINA} on public.vagas`);
  const iCreate = limpos.findIndex((l) => l.startsWith(`create trigger ${GATILHO_DA_MAQUINA} `));
  const iFuncao = limpos.findIndex((l) => l.startsWith(`create or replace function public.${FUNCAO_DA_MAQUINA}(`));
  afirmar(
    "o gatilho `vagas_maquina_de_estados` é `before insert or update or delete` por linha, com o `drop trigger if exists` antes e a função criada antes dele",
    iFuncao !== -1 &&
      iDrop > iFuncao &&
      iCreate > iDrop &&
      limpos[iCreate] ===
        `create trigger ${GATILHO_DA_MAQUINA} before insert or update or delete on public.vagas for each row execute function public.${FUNCAO_DA_MAQUINA}()`,
    `função ${iFuncao}, drop ${iDrop}, create ${iCreate}`,
  );
  const recusas = [...String(funcao?.bruto ?? "").matchAll(/raise exception ([\s\S]*?);/g)].map((m) => m[1]);
  const recusasTortas = recusas.filter(
    (r) => !/^'vagas_maquina_de_estados: /.test(r) || !/using errcode = '23514'\s*$/.test(r.replace(/\s+/g, " ")),
  );
  afirmar(
    "toda recusa da função usa `errcode = '23514'` e começa pelo nome do gatilho (são sete: insert fora de rascunho, insert com data, exclusão de Aberta, transição, `aberta_em`, `slug`, rascunho com data)",
    recusas.length === 7 && recusasTortas.length === 0,
    `${recusas.length} recusa(s); tortas: ${recusasTortas.map((r) => r.slice(0, 60)).join(" | ")}`,
  );
  const bloco = cmds.find((c) => c.limpo === "do")?.bruto ?? "";
  afirmar(
    "a execução da função é revogada de public, anon e authenticated e concedida a postgres e service_role, no bloco `do` do molde da 20260924120000",
    /fn text := 'public\.vagas_respeitam_a_maquina\(\)'/.test(bloco) &&
      /revoke execute on function %s from public/.test(bloco) &&
      /array\['anon', 'authenticated'\][\s\S]*revoke execute on function %s from %I/.test(bloco) &&
      /array\['postgres', 'service_role'\][\s\S]*grant execute on function %s to %I/.test(bloco),
    bloco.slice(0, 120),
  );
  afirmar(
    "a função da máquina NÃO entra em `FUNCOES_NOVAS`, que continua com as cinco de 20260924120000",
    !FUNCOES_NOVAS.includes(FUNCAO_DA_MAQUINA) && FUNCOES_NOVAS.length === 5,
    FUNCOES_NOVAS.join(", "),
  );
}

/* A CORREÇÃO DA REVISÃO (20260924160000), lida. O comportamento é do banco
   (seção j, em transação desfeita, com a sabotagem feita pela sessão
   principal); aqui se fixa a FORMA: a função da máquina redefinida recusa a
   primeira abertura com `aberta_em` enviado e grava `now()` sem condição, e o
   gatilho do truncate é de instrução, antes do truncate, sobre uma função
   invoker que recusa com 23514 e o nome da máquina. */
{
  const texto = ler(path.join("supabase", "migrations", MIGRACAO_DA_ABERTURA)) ?? "";
  afirmar(`${MIGRACAO_DA_ABERTURA}: existe`, texto !== "", "arquivo ausente em supabase/migrations");
  const cmds = comandosSql(texto);
  const limpos = cmds.map((c) => c.limpo);
  const normalizado = (c) => String(c?.bruto ?? "").replace(/\s+/g, " ");
  const recusasDe = (c) => [...String(c?.bruto ?? "").matchAll(/raise exception ([\s\S]*?);/g)].map((m) => m[1]);
  const tortas = (lista) =>
    lista.filter((r) => !/^'vagas_maquina_de_estados: /.test(r) || !/using errcode = '23514'\s*$/.test(r.replace(/\s+/g, " ")));

  const maquina = cmds.find((c) => c.limpo.startsWith(`create or replace function public.${FUNCAO_DA_MAQUINA}()`));
  afirmar(
    "160000: a função da máquina é redefinida com a MESMA assinatura, de gatilho, plpgsql, `security invoker` e `search_path = ''`",
    Boolean(maquina) &&
      /^create or replace function public\.vagas_respeitam_a_maquina\(\) returns trigger language plpgsql security invoker set search_path = as$/.test(
        maquina.limpo,
      ) &&
      normalizado(maquina).toLowerCase().includes("set search_path = ''"),
    maquina?.limpo ?? "ausente",
  );
  const recusasDaMaquina = recusasDe(maquina);
  afirmar(
    "160000: as recusas da máquina são OITO (as sete de 150000 e a da primeira abertura com data), todas 23514 e com o nome do gatilho",
    recusasDaMaquina.length === 8 && tortas(recusasDaMaquina).length === 0,
    `${recusasDaMaquina.length} recusa(s); tortas: ${tortas(recusasDaMaquina).map((r) => r.slice(0, 60)).join(" | ")}`,
  );
  afirmar(
    "160000: na primeira abertura, `aberta_em` enviado é RECUSADO e o banco grava `now()` sem condição (nenhum `if new.aberta_em is null` sobrou)",
    /if new\.estado = 'aberta'::public\.estado_vaga then if new\.aberta_em is not null then raise exception 'vagas_maquina_de_estados: [^']*' using errcode = '23514'; end if; new\.aberta_em := now\(\);/.test(
      normalizado(maquina),
    ) && !/if new\.aberta_em is null then new\.aberta_em := now\(\)/.test(normalizado(maquina)),
    normalizado(maquina).slice(normalizado(maquina).indexOf("Nunca aberta"), normalizado(maquina).indexOf("Nunca aberta") + 400),
  );
  afirmar(
    "160000: o gatilho de linha da máquina NÃO é recriado (ele aponta para a função, que muda por `create or replace`)",
    !limpos.some((l) => l.startsWith(`create trigger ${GATILHO_DA_MAQUINA} `) || l.startsWith(`drop trigger if exists ${GATILHO_DA_MAQUINA} `)),
  );

  const doTruncate = cmds.find((c) => c.limpo.startsWith(`create or replace function public.${FUNCAO_DO_TRUNCATE}()`));
  afirmar(
    "160000: a função do truncate é de gatilho, plpgsql, `security invoker` e fixa `search_path = ''`",
    Boolean(doTruncate) &&
      /^create or replace function public\.vagas_truncate_respeita_a_maquina\(\) returns trigger language plpgsql security invoker set search_path = as$/.test(
        doTruncate.limpo,
      ) &&
      normalizado(doTruncate).toLowerCase().includes("set search_path = ''"),
    doTruncate?.limpo ?? "ausente",
  );
  const recusasDoTruncate = recusasDe(doTruncate);
  afirmar(
    "160000: a função do truncate recusa UMA vez, com 23514 e o nome da máquina, e SÓ quando existe Vaga Aberta",
    recusasDoTruncate.length === 1 &&
      tortas(recusasDoTruncate).length === 0 &&
      /if exists \(select 1 from public\.vagas v where v\.estado = 'aberta'::public\.estado_vaga\) then raise exception/.test(
        normalizado(doTruncate),
      ),
    `${recusasDoTruncate.length} recusa(s)`,
  );
  const iFuncao = limpos.findIndex((l) => l.startsWith(`create or replace function public.${FUNCAO_DO_TRUNCATE}(`));
  const iDrop = limpos.indexOf(`drop trigger if exists ${GATILHO_DO_TRUNCATE} on public.vagas`);
  const iCreate = limpos.findIndex((l) => l.startsWith(`create trigger ${GATILHO_DO_TRUNCATE} `));
  afirmar(
    "160000: o gatilho `vagas_maquina_de_estados_no_truncate` é `before truncate` POR INSTRUÇÃO, com o `drop trigger if exists` antes e a função criada antes dele",
    iFuncao !== -1 &&
      iDrop > iFuncao &&
      iCreate > iDrop &&
      limpos[iCreate] ===
        `create trigger ${GATILHO_DO_TRUNCATE} before truncate on public.vagas for each statement execute function public.${FUNCAO_DO_TRUNCATE}()`,
    `função ${iFuncao}, drop ${iDrop}, create ${iCreate}`,
  );
  const bloco = cmds.find((c) => c.limpo === "do")?.bruto ?? "";
  afirmar(
    "160000: a execução das DUAS funções é revogada de public, anon e authenticated e concedida a postgres e service_role",
    /array\['public\.vagas_respeitam_a_maquina\(\)', 'public\.vagas_truncate_respeita_a_maquina\(\)'\]/.test(bloco) &&
      /revoke execute on function %s from public/.test(bloco) &&
      /array\['anon', 'authenticated'\][\s\S]*revoke execute on function %s from %I/.test(bloco) &&
      /array\['postgres', 'service_role'\][\s\S]*grant execute on function %s to %I/.test(bloco),
    bloco.slice(0, 160),
  );
  afirmar(
    "160000: a função do truncate também NÃO entra em `FUNCOES_NOVAS`",
    !FUNCOES_NOVAS.includes(FUNCAO_DO_TRUNCATE) && FUNCOES_NOVAS.length === 5,
  );
}

/**
 * A função da máquina VIGENTE: a da migração MAIS RECENTE de Carreiras que a
 * define (`create or replace` substitui a anterior no banco). É dela que a
 * seção (i) lê os pares de transição, para amarrar o dublê ao banco.
 */
function funcaoDaMaquinaVigente() {
  for (const nome of [...MIGRACOES_DE_CARREIRAS].reverse()) {
    const cmd = comandosSql(ler(path.join("supabase", "migrations", nome)) ?? "").find((c) =>
      c.limpo.startsWith(`create or replace function public.${FUNCAO_DA_MAQUINA}()`),
    );
    if (cmd) return { migracao: nome, bruto: cmd.bruto };
  }
  return { migracao: null, bruto: "" };
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
  /* TROCA REGISTRADA (revisão da 5.3): a Classificação ausente saía como
     `nivel` (a chave da lista) e passou a sair como `nivel_id`, o nome da
     COLUNA, que é o vocabulário único de `faltando` (a leitura do corpo da
     função de escrita já usava a coluna). */
  afirmar(
    "Link inválido, Slug fora do formato e Classificação ausente também faltam (a Classificação pelo nome da COLUNA)",
    igual([...problemasParaAbrir({ ...VAGA_QUE_ABRE, link_de_candidatura: "javascript:x" })], ["link_de_candidatura"]) &&
      igual([...problemasParaAbrir({ ...VAGA_QUE_ABRE, slug: "Com Espaco" })], ["slug"]) &&
      igual([...problemasParaAbrir({ ...VAGA_QUE_ABRE, nivel_id: "" })], ["nivel_id"]) &&
      igual([...problemasParaAbrir({ ...VAGA_QUE_ABRE, departamento_id: null, tipo_id: " " })], ["departamento_id", "tipo_id"]),
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
  /* TROCA REGISTRADA (Story 5.3): a asserção afirmava que `api/carreiras.js`
     NÃO existia (fora do escopo da 5.2). A 5.3 cria a função única de escrita,
     então a metade dela vira o contrário: a rota EXISTE, e é a única de
     Carreiras em `api/`. As outras duas metades continuam iguais. */
  afirmar(
    "não existe `src/domain/comum` nem `src/render/carreiras`",
    !existsSync(path.join(raiz, "src", "domain", "comum")) &&
      !existsSync(path.join(raiz, "src", "render", "carreiras")),
  );
  const rotasDeCarreiras = existsSync(path.join(raiz, "api"))
    ? readdirSync(path.join(raiz, "api")).filter((n) => /carreira|vaga|classifica/i.test(n))
    : [];
  afirmar(
    "`api/carreiras.js` existe e é a ÚNICA rota de Carreiras em `api/` (uma função só, pelo teto do plano)",
    igual(rotasDeCarreiras, ["carreiras.js"]),
    rotasDeCarreiras.join(", ") || "nenhuma",
  );
}

{
  /* O VOCABULÁRIO DAS OPERAÇÕES (Story 5.3), importado e executado. A lista é
     a da SPEC, escrita aqui como expectativa independente. */
  let op = null;
  try {
    op = await import(urlDe("src/domain/carreiras/operacoes.js"));
  } catch (erro) {
    afirmar("src/domain/carreiras/operacoes.js importa", false, erro.message);
  }
  if (op !== null) {
    afirmar(
      "as operações de Carreiras são EXATAMENTE salvarVaga, mudarEstadoDaVaga, excluirVaga, salvarClassificacao e excluirClassificacao, congeladas",
      igual([...op.OPERACOES_DE_CARREIRAS], [
        "salvarVaga",
        "mudarEstadoDaVaga",
        "excluirVaga",
        "salvarClassificacao",
        "excluirClassificacao",
      ]) && Object.isFrozen(op.OPERACOES_DE_CARREIRAS),
      JSON.stringify(op.OPERACOES_DE_CARREIRAS),
    );
    /* A OPERAÇÃO É OBRIGATÓRIA: nada de padrão implícito. */
    const RECUSADOS = [undefined, null, "", "   ", "apagarTudo", "salvar", "constructor", "__proto__", "toString", 1, ["salvarVaga"], { x: 1 }];
    const aceitaramSemOperacao = [];
    for (const valor of RECUSADOS) {
      const r = op.operacaoPedidaDeCarreiras(valor === undefined ? {} : { operacao: valor });
      const certo = r.ok === false && typeof r.mensagem === "string" && r.mensagem !== "" && typeof r.detalhe === "string";
      if (!certo) aceitaramSemOperacao.push(JSON.stringify(valor) ?? "undefined");
    }
    for (const corpo of [null, "texto", [1], 42]) {
      const r = op.operacaoPedidaDeCarreiras(corpo);
      if (r.ok !== false) aceitaramSemOperacao.push(`corpo ${JSON.stringify(corpo)}`);
    }
    afirmar(
      "`operacaoPedidaDeCarreiras` RECUSA operação ausente, vazia, desconhecida, herdada do protótipo e de outro tipo (sem operação padrão), sem lançar",
      aceitaramSemOperacao.length === 0,
      aceitaramSemOperacao.join(", "),
    );
    afirmar(
      "e aceita cada uma das cinco, com espaço em volta aparado",
      op.OPERACOES_DE_CARREIRAS.every((o) => {
        const r = op.operacaoPedidaDeCarreiras({ operacao: ` ${o} ` });
        return r.ok === true && r.operacao === o;
      }),
    );
    const frases = [op.operacaoPedidaDeCarreiras({}).mensagem, op.operacaoPedidaDeCarreiras({ operacao: "x" }).mensagem];
    afirmar(
      "as frases da recusa falam de Carreiras, não de post, e não têm travessão",
      frases.every((f) => /Carreiras/.test(f) && !/\bposts?\b/i.test(f) && !f.includes("—")),
      frases.join(" | "),
    );
  }
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

/* O AMBIENTE DO PROCESSO, ANTES DE QUALQUER IMPORT DA CAMADA DE DADOS.
   `src/data/supabase/clientes.js` lê URL e chave UMA vez, na carga do módulo,
   e o módulo fica em cache pelo resto da execução. A seção (l) importa o
   cliente de escrita neste mesmo processo; sem isto, ela carregava
   `clientes.js` com ambiente vazio, e a seção (g) (a camada de dados contra o
   projeto) recebia `configuracao` em vez de exercitar as leituras. Os casos
   SEM ambiente continuam provados onde sempre foram: em processo novo, com o
   ambiente pedido (`sondar`). */
if (urlDoEnv && chavePublicavel) {
  process.env.VITE_SUPABASE_URL = urlDoEnv;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = chavePublicavel;
}

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

/* ─── (i) O despacho local, contra um dublê de GoTrue e PostgREST ────────── */

secao("(i) o despacho: `api/carreiras.js` executado contra um dublê local de GoTrue e PostgREST");

/**
 * Requisição e resposta de mentira, no formato que a plataforma entrega, e o
 * ambiente do processo remendado só durante a chamada (e restaurado sempre).
 * O `console.error` é capturado: é o log do servidor, e é lá que o `detalhe`
 * precisa aparecer, e não na resposta.
 */
async function dirigir(handler, { metodo = "POST", corpo = {}, cabecalhos = {}, ambiente = null }) {
  const registro = { status: null, corpo: null, cabecalhos: {}, log: [] };
  const req = { method: metodo, headers: cabecalhos, body: corpo };
  const res = {
    setHeader(nome, valor) {
      registro.cabecalhos[nome] = valor;
    },
    status(codigo) {
      registro.status = codigo;
      return res;
    },
    json(saida) {
      registro.corpo = saida;
      return res;
    },
  };
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
}

/**
 * As REGRAS do dublê que imitam o gatilho da máquina, declaradas uma vez e
 * usadas por ele. Não são confiadas: logo abaixo, uma asserção as compara com
 * a `MAQUINA` do domínio e com os pares escritos na função vigente da
 * migração. Um dublê que aceitasse uma transição que o banco recusa provaria
 * o servidor contra um banco que não existe.
 */
const TRANSICOES_DO_DUBLE = Object.freeze([
  ["rascunho", "aberta"],
  ["aberta", "encerrada"],
  ["encerrada", "aberta"],
]);
const ESTADOS_QUE_NAO_SE_EXCLUEM_NO_DUBLE = Object.freeze(["aberta"]);

{
  const par = ([de, para]) => `${de}->${para}`;
  const doDuble = ordenado(TRANSICOES_DO_DUBLE.map(par));
  const doDominio = ordenado(
    estadosDaVaga.ESTADOS_DA_VAGA.flatMap((e) =>
      transicoesDaVaga
        .acoesDoEstadoDaVaga(e)
        .filter((a) => a.exclui !== true)
        .map((a) => par([e, a.destino])),
    ),
  );
  const vigente = funcaoDaMaquinaVigente();
  const corpo = String(vigente.bruto).replace(/\s+/g, " ");
  const doBanco = ordenado(
    [...corpo.matchAll(/old\.estado = '([a-z]+)'::public\.estado_vaga and new\.estado = '([a-z]+)'::public\.estado_vaga/g)].map((m) =>
      par([m[1], m[2]]),
    ),
  );
  afirmar(
    "as transições do dublê são EXATAMENTE as da `MAQUINA` do domínio e as da função vigente da migração (a mais recente que define `vagas_respeitam_a_maquina`)",
    vigente.migracao !== null && doBanco.length > 0 && igual(doDuble, doDominio) && igual(doDuble, doBanco),
    `migração: ${vigente.migracao} | dublê: ${doDuble.join(", ")} | domínio: ${doDominio.join(", ")} | banco: ${doBanco.join(", ")}`,
  );
  const naoExcluiveisDoDominio = estadosDaVaga.ESTADOS_DA_VAGA.filter((e) => !transicoesDaVaga.exclusaoDaVagaPermitida(e));
  const naoExcluiveisDoBanco = [
    ...corpo.matchAll(/if tg_op = 'DELETE' then if old\.estado = '([a-z]+)'::public\.estado_vaga then raise exception/g),
  ].map((m) => m[1]);
  afirmar(
    "e os Estados que não se excluem no dublê são os do domínio (`exclusaoDaVagaPermitida`) e os da recusa de DELETE da função vigente",
    igual(ordenado(ESTADOS_QUE_NAO_SE_EXCLUEM_NO_DUBLE), ordenado(naoExcluiveisDoDominio)) &&
      igual(ordenado(ESTADOS_QUE_NAO_SE_EXCLUEM_NO_DUBLE), ordenado(naoExcluiveisDoBanco)),
    `dublê: ${ESTADOS_QUE_NAO_SE_EXCLUEM_NO_DUBLE.join(", ")} | domínio: ${naoExcluiveisDoDominio.join(", ")} | banco: ${naoExcluiveisDoBanco.join(", ")}`,
  );
  afirmar(
    "e a função vigente é a da correção da revisão (20260924160000), que recusa a primeira abertura com data, como o dublê",
    vigente.migracao === MIGRACAO_DA_ABERTURA,
    `vigente: ${vigente.migracao}`,
  );
}

/** A chave de comparação de nome do dublê: o `lower(unaccent(x))` do banco. */
const chaveDeNome = (n) => String(n ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * O DUBLÊ: um servidor HTTP local que responde como o GoTrue e como o
 * PostgREST para as quatro tabelas de Carreiras. Ele imita o que o banco faz
 * de relevante para a escrita (e só isso): o gatilho da máquina de estados,
 * o invariante da Aberta, o Slug único, o nome único sem caixa nem acento, e
 * as chaves estrangeiras `restrict`. É AQUI, e só aqui, que abrir e reabrir
 * são exercidos pelo servidor: em produção a verificação nunca abre uma Vaga.
 *
 * `injecoes` força uma resposta para o próximo pedido que casar (a corrida
 * entre a conferência e o comando, que o banco real só produziria por sorte).
 */
function criarDuble() {
  const CONTA = randomUUID();
  const tabelas = { departamentos: [], tipos_de_vaga: [], niveis: [], vagas: [], perfis: [{ id: CONTA, nome_exibicao: "Pessoa do Painel" }] };
  const recebidos = [];
  const injecoes = [];
  const agora = () => new Date().toISOString();
  const erroPg = (status, code, message) => [status, { code, message, details: null, hint: null }];

  const TABELAS_DE_CLASSIFICACAO = { departamentos: "departamento_id", tipos_de_vaga: "tipo_id", niveis: "nivel_id" };

  /** O gatilho `vagas_maquina_de_estados` num UPDATE, e o invariante da Aberta. */
  const regrasDoUpdate = (a, n) => {
    if (n.estado !== a.estado) {
      const ok = TRANSICOES_DO_DUBLE.some(([de, para]) => a.estado === de && n.estado === para);
      if (!ok) return erroPg(400, "23514", `vagas_maquina_de_estados: a vaga não pode ir de ${a.estado} para ${n.estado}`);
    }
    const jaAberta = a.aberta_em !== null || a.estado !== "rascunho";
    if (jaAberta) {
      if (n.aberta_em !== a.aberta_em) return erroPg(400, "23514", "vagas_maquina_de_estados: aberta_em não muda");
      if (n.slug !== a.slug) return erroPg(400, "23514", "vagas_maquina_de_estados: o slug não muda");
    } else if (n.estado === "aberta") {
      /* A regra de 20260924160000: a primeira abertura NÃO traz data. */
      if (n.aberta_em !== null && n.aberta_em !== undefined) {
        return erroPg(400, "23514", "vagas_maquina_de_estados: aberta_em é gravado pelo banco na primeira abertura");
      }
      n.aberta_em = agora();
    } else if (n.aberta_em !== null && n.aberta_em !== undefined) {
      return erroPg(400, "23514", "vagas_maquina_de_estados: um rascunho não tem aberta_em");
    }
    if (n.estado === "aberta" && regrasDaVaga.problemasParaAbrir(n).length > 0) {
      return erroPg(400, "23514", 'new row for relation "vagas" violates check constraint "vagas_aberta_completa"');
    }
    return null;
  };

  const conferirVaga = (linha, id) => {
    if (tabelas.vagas.some((v) => v.slug === linha.slug && v.id !== id)) {
      return erroPg(409, "23505", 'duplicate key value violates unique constraint "vagas_slug_unico"');
    }
    for (const [tabela, coluna] of Object.entries(TABELAS_DE_CLASSIFICACAO)) {
      if (!tabelas[tabela].some((c) => c.id === linha[coluna])) {
        return erroPg(409, "23503", `insert or update on table "vagas" violates foreign key constraint "vagas_${coluna}_fkey"`);
      }
    }
    return null;
  };

  const conferirClassificacao = (tabela, linha, id) => {
    if (tabelas[tabela].some((c) => c.id !== id && chaveDeNome(c.nome) === chaveDeNome(linha.nome))) {
      return erroPg(409, "23505", `duplicate key value violates unique constraint "${tabela}_nome_normalizado_unico"`);
    }
    if (tabela === "tipos_de_vaga" && !linha.equivalente_jobposting) {
      return erroPg(400, "23502", 'null value in column "equivalente_jobposting" violates not-null constraint');
    }
    return null;
  };

  const projetar = (linha, selecao) =>
    selecao ? Object.fromEntries(selecao.split(",").map((c) => [c, linha[c] ?? null])) : { ...linha };

  function atender(metodo, url, corpo, cabecalhos) {
    const u = new URL(url, "http://duble");
    if (u.pathname === "/auth/v1/user") {
      const credencial = String(cabecalhos.authorization ?? "");
      return credencial === "Bearer bom"
        ? [200, { id: CONTA, email: "painel@chatclean.com.br" }]
        : [401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT: unable to parse or verify signature" }];
    }
    const tabela = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname)?.[1];
    if (!tabela || !Object.hasOwn(tabelas, tabela)) {
      return [404, { code: "PGRST205", message: `Could not find the table 'public.${tabela}' in the schema cache` }];
    }
    const selecao = u.searchParams.get("select");
    const filtros = [...u.searchParams.entries()].filter(([k]) => !["select", "limit", "order", "on_conflict"].includes(k));
    /* `uuid` no Postgres não tem caixa: `eq.ABC…` casa com `abc…`. */
    const mesmoValor = (guardado, pedido) =>
      /^[0-9a-f-]{36}$/i.test(pedido) ? String(guardado).toLowerCase() === pedido.toLowerCase() : String(guardado) === pedido;
    const casa = (linha) => filtros.every(([k, v]) => v.startsWith("eq.") && mesmoValor(linha[k], v.slice(3)));
    const linhas = tabelas[tabela];

    if (metodo === "GET") {
      const achadas = linhas.filter(casa);
      const limite = Number(u.searchParams.get("limit") ?? Infinity);
      const cabecalhosExtra = /count=exact/.test(String(cabecalhos.prefer ?? ""))
        ? { "content-range": achadas.length === 0 ? "*/0" : `0-0/${achadas.length}` }
        : {};
      return [200, achadas.slice(0, limite).map((l) => projetar(l, selecao)), cabecalhosExtra];
    }
    if (metodo === "POST") {
      const base =
        tabela === "vagas"
          ? {
              id: randomUUID(),
              estado: "rascunho",
              modalidade: null,
              localizacao: "",
              resumo: "",
              descricao: { type: "doc", content: [{ type: "paragraph" }] },
              descricao_html: "",
              link_de_candidatura: null,
              aberta_em: null,
            }
          : { id: randomUUID(), ordem: 0, ...(tabela === "tipos_de_vaga" ? {} : { cor: "var(--categoria-cinza-bg)" }) };
      const linha = { ...base, ...corpo, criado_em: agora(), atualizado_em: agora() };
      if (tabela === "vagas") {
        if (linha.estado !== "rascunho") return erroPg(400, "23514", `vagas_maquina_de_estados: uma vaga nasce rascunho, e veio ${linha.estado}`);
        if (linha.aberta_em !== null) return erroPg(400, "23514", "vagas_maquina_de_estados: uma vaga nasce sem aberta_em");
        const recusa = conferirVaga(linha, linha.id);
        if (recusa) return recusa;
      } else {
        const recusa = conferirClassificacao(tabela, linha, linha.id);
        if (recusa) return recusa;
      }
      linhas.push(linha);
      return [201, [projetar(linha, selecao)]];
    }
    if (metodo === "PATCH") {
      const alvo = linhas.filter(casa);
      const novas = [];
      for (const a of alvo) {
        const n = { ...a, ...corpo, atualizado_em: agora() };
        const recusa =
          tabela === "vagas" ? regrasDoUpdate(a, n) ?? conferirVaga(n, a.id) : conferirClassificacao(tabela, n, a.id);
        if (recusa) return recusa;
        novas.push([a, n]);
      }
      for (const [a, n] of novas) linhas[linhas.indexOf(a)] = n;
      return [200, novas.map(([, n]) => projetar(n, selecao))];
    }
    if (metodo === "DELETE") {
      const alvo = linhas.filter(casa);
      for (const a of alvo) {
        if (tabela === "vagas" && ESTADOS_QUE_NAO_SE_EXCLUEM_NO_DUBLE.includes(a.estado)) {
          return erroPg(400, "23514", "vagas_maquina_de_estados: uma vaga aberta não pode ser excluída, encerre a vaga antes");
        }
        const coluna = TABELAS_DE_CLASSIFICACAO[tabela];
        if (coluna && tabelas.vagas.some((v) => v[coluna] === a.id)) {
          return erroPg(409, "23503", `update or delete on table "${tabela}" violates foreign key constraint "vagas_${coluna}_fkey" on table "vagas"`);
        }
      }
      tabelas[tabela] = linhas.filter((l) => !alvo.includes(l));
      return [200, alvo.map((l) => projetar(l, selecao))];
    }
    return [405, { message: "método fora do dublê" }];
  }

  const servidor = createServer((req, res) => {
    let bruto = "";
    req.on("data", (p) => {
      bruto += p;
    });
    req.on("end", () => {
      let corpo = null;
      try {
        corpo = bruto === "" ? null : JSON.parse(bruto);
      } catch {
        corpo = bruto;
      }
      const pedido = { metodo: req.method, url: req.url, corpo, cabecalhos: { ...req.headers } };
      recebidos.push(pedido);
      const injecao = injecoes.find((i) => i.vezes > 0 && i.quando(pedido));
      let resposta;
      if (injecao) {
        injecao.vezes -= 1;
        resposta = injecao.resposta;
      } else {
        try {
          resposta = atender(req.method, req.url, corpo, req.headers);
        } catch (erro) {
          resposta = [500, { message: `o dublê lançou: ${erro?.message ?? erro}` }];
        }
      }
      const [status, dados, extra = {}] = resposta;
      res.writeHead(status, { "Content-Type": "application/json", ...extra });
      res.end(JSON.stringify(dados));
    });
  });
  return { CONTA, tabelas, recebidos, injecoes, servidor };
}

const { createServer } = await import("node:http");
let moduloDoHandler = null;
try {
  moduloDoHandler = await import(urlDe("api/carreiras.js"));
  afirmar("api/carreiras.js importa, e tem handler padrão", typeof moduloDoHandler.default === "function");
} catch (erro) {
  afirmar("api/carreiras.js importa", false, erro.message);
}
const moduloDosPosts = await import(urlDe("api/posts.js"));
const nucleoDoPost = await import(urlDe("api/_nucleo/salvarPost.js"));
const nucleoDaVaga = await import(urlDe("api/_nucleo/operacoesDaVaga.js"));
const nucleoDaClassificacao = await import(urlDe("api/_nucleo/operacoesDaClassificacao.js"));
const operacoesDeCarreiras = await import(urlDe("src/domain/carreiras/operacoes.js"));
const { diagnosticarMensagem } = await import(urlDe("src/admin/shell/voz.js"));

/** Uma frase de Carreiras: existe, não fala de post, sem travessão, e não é vaga. */
const fraseDeCarreirasBoa = (f) =>
  typeof f === "string" && f.trim() !== "" && !/\b[Pp]osts?\b/.test(f) && !f.includes("—") && diagnosticarMensagem("frase", f) === null;

if (moduloDoHandler !== null) {
  const handler = moduloDoHandler.default;
  const duble = criarDuble();
  await new Promise((pronto) => duble.servidor.listen(0, "127.0.0.1", pronto));
  const porta = duble.servidor.address().port;
  const AMBIENTE = {
    SUPABASE_URL: `http://127.0.0.1:${porta}`,
    SUPABASE_CHAVE_PUBLICAVEL: "sb_publishable_duble_de_verificacao",
    SUPABASE_CHAVE_DE_SERVICO: "sb_secret_duble_de_verificacao",
    VITE_SUPABASE_URL: undefined,
    VITE_SUPABASE_PUBLISHABLE_KEY: undefined,
  };
  const respostas = [];
  const enviar = async (corpo, { token = "bom", metodo = "POST" } = {}) => {
    const r = await dirigir(handler, {
      metodo,
      corpo,
      cabecalhos: token === null ? {} : { authorization: `Bearer ${token}` },
      ambiente: AMBIENTE,
    });
    respostas.push(r);
    return r;
  };
  const marca = () => duble.recebidos.length;
  const escritasDesde = (n) =>
    duble.recebidos.slice(n).filter((p) => p.url.startsWith("/rest/v1/") && ["POST", "PATCH", "DELETE"].includes(p.metodo));
  const idaAoRestDesde = (n) => duble.recebidos.slice(n).filter((p) => p.url.startsWith("/rest/v1/"));
  const erroDe = (r) => r.corpo?.erro ?? {};

  /* As Classificações e as Vagas de partida. */
  const agoraIso = new Date().toISOString();
  const dep = { id: randomUUID(), nome: "Operações", cor: "var(--categoria-ciano-bg)", ordem: 1, criado_em: agoraIso, atualizado_em: agoraIso };
  const depLivre = { id: randomUUID(), nome: "Tecnologia", cor: "var(--categoria-azul-bg)", ordem: 2, criado_em: agoraIso, atualizado_em: agoraIso };
  const tipo = { id: randomUUID(), nome: "CLT", equivalente_jobposting: "FULL_TIME", ordem: 1, criado_em: agoraIso, atualizado_em: agoraIso };
  const nivel = { id: randomUUID(), nome: "Pleno", cor: "var(--categoria-azul-bg)", ordem: 1, criado_em: agoraIso, atualizado_em: agoraIso };
  duble.tabelas.departamentos.push(dep, depLivre);
  duble.tabelas.tipos_de_vaga.push(tipo);
  duble.tabelas.niveis.push(nivel);
  const vagaBase = (sufixo, estado, extra = {}) => ({
    id: randomUUID(),
    slug: `vaga-${sufixo}`,
    titulo: `Vaga ${sufixo}`,
    estado,
    departamento_id: dep.id,
    tipo_id: tipo.id,
    nivel_id: nivel.id,
    modalidade: "presencial",
    localizacao: "Natal, RN",
    resumo: "Resumo da vaga.",
    descricao: DOC_VALIDO,
    descricao_html: HTML_VALIDO,
    link_de_candidatura: "https://exemplo.com/vaga",
    aberta_em: null,
    criado_em: agoraIso,
    atualizado_em: agoraIso,
    ...extra,
  });
  const incompleta = vagaBase("incompleta", "rascunho", { link_de_candidatura: null });
  const completa = vagaBase("completa", "rascunho");
  const aberta = vagaBase("aberta", "aberta", { aberta_em: "2026-01-02T03:04:05.000Z" });
  const encerrada = vagaBase("encerrada", "encerrada", { aberta_em: "2025-12-01T00:00:00.000Z" });
  duble.tabelas.vagas.push(incompleta, completa, aberta, encerrada);
  const classificacoesCompletas = { departamento_id: dep.id, tipo_id: tipo.id, nivel_id: nivel.id };

  try {
    /* ── Método ── */
    {
      const n = marca();
      const r = await enviar({ operacao: "salvarVaga" }, { metodo: "GET" });
      afirmar(
        "GET responde 405 com `Allow: POST`, sem ida ao banco",
        r.status === 405 && r.cabecalhos.Allow === "POST" && erroDe(r).tipo === "dados_invalidos" && duble.recebidos.length === n,
        `HTTP ${r.status} Allow ${r.cabecalhos.Allow}`,
      );
    }

    /* ── Sem credencial ── */
    for (const [nome, token] of [
      ["sem Bearer", null],
      ["com token forjado", "forjado.x.y"],
    ]) {
      const n = marca();
      const r = await enviar({ operacao: "salvarVaga", titulo: "Intrusa", ...classificacoesCompletas }, { token });
      afirmar(
        `POST ${nome}: 401, frase de vaga (e não de post), e nada é escrito`,
        r.status === 401 && erroDe(r).tipo === "permissao" && /vaga/i.test(erroDe(r).mensagem) && fraseDeCarreirasBoa(erroDe(r).mensagem) && escritasDesde(n).length === 0,
        `HTTP ${r.status} ${erroDe(r).mensagem} | escritas ${escritasDesde(n).length}`,
      );
    }
    {
      /* Conta autenticada SEM perfil no Painel: autenticar não é autorizar. */
      const perfis = duble.tabelas.perfis;
      duble.tabelas.perfis = [];
      const n = marca();
      const r = await enviar({ operacao: "salvarClassificacao", lista: "nivel", nome: "Sem cadastro" });
      duble.tabelas.perfis = perfis;
      afirmar(
        "Conta sem perfil no Painel: 401, frase de cadastro que fala de Classificação, e nada é escrito",
        r.status === 401 && /cadastrada no Painel/.test(erroDe(r).mensagem) && /Departamentos, Tipos e Níveis/.test(erroDe(r).mensagem) && escritasDesde(n).length === 0,
        `HTTP ${r.status} ${erroDe(r).mensagem}`,
      );
    }

    /* ── A operação é obrigatória ── */
    for (const [nome, corpo, token] of [
      ["ausente, com sessão", { titulo: "x" }, "bom"],
      ["`apagarTudo`, com sessão", { operacao: "apagarTudo" }, "bom"],
      ["`constructor`, com sessão", { operacao: "constructor" }, "bom"],
      ["`__proto__`, com sessão", JSON.parse('{"operacao":"__proto__"}'), "bom"],
      ["ausente, sem sessão", { titulo: "x" }, null],
      ["corpo que não é objeto", "isto não é json", "bom"],
    ]) {
      /* TROCA REGISTRADA (revisão da 5.3): era "sem ida ao banco NEM à
         conferência do token". Com token presente, a operação recusada agora
         CONFERE o token no GoTrue antes de responder (quem só manda `Bearer x`
         não ouve o vocabulário). O PostgREST continua intocado; sem token,
         nada sai. */
      const n = marca();
      const r = await enviar(corpo, { token });
      const aoGoTrue = duble.recebidos.slice(n).filter((p) => p.url.startsWith("/auth/v1/user")).length;
      afirmar(
        `operação ${nome}: 422, sem ida ao PostgREST${token === null ? " nem ao GoTrue" : ", e o token é conferido UMA vez no GoTrue"}`,
        r.status === 422 &&
          erroDe(r).tipo === "dados_invalidos" &&
          idaAoRestDesde(n).length === 0 &&
          aoGoTrue === (token === null ? 0 : 1) &&
          duble.recebidos.length - n === aoGoTrue,
        `HTTP ${r.status} | pedidos ${duble.recebidos.length - n} (GoTrue ${aoGoTrue})`,
      );
    }
    {
      const SONDA = "apagarTudo-SONDA-DO-LOG-5-3";
      const comSessao = await enviar({ operacao: SONDA });
      const semSessao = await enviar({ operacao: SONDA }, { token: null });
      const forjado = await enviar({ operacao: SONDA }, { token: "forjado" });
      afirmar(
        "quem tem sessão ouve o vocabulário das cinco operações; quem não tem recebe a recusa seca, e o log não registra o que ele mandou",
        operacoesDeCarreiras.OPERACOES_DE_CARREIRAS.every((o) => erroDe(comSessao).mensagem.includes(o)) &&
          erroDe(semSessao).mensagem === moduloDosPosts.RECUSA_SEM_CREDENCIAL &&
          semSessao.log.length === 0 &&
          comSessao.log.some((l) => l.startsWith("[api/carreiras]")),
        `${erroDe(comSessao).mensagem} | ${erroDe(semSessao).mensagem} | log ${semSessao.log.length}`,
      );
      afirmar(
        "`Bearer forjado` com operação inválida: a MESMA recusa seca de quem não tem credencial (o token é conferido, não só visto), e nada no log",
        forjado.status === 422 &&
          erroDe(forjado).mensagem === moduloDosPosts.RECUSA_SEM_CREDENCIAL &&
          !operacoesDeCarreiras.OPERACOES_DE_CARREIRAS.some((o) => erroDe(forjado).mensagem.includes(o)) &&
          forjado.log.length === 0,
        `${erroDe(forjado).mensagem} | log: ${forjado.log.join(" / ")}`,
      );
      afirmar(
        "e nem a quem tem sessão o log repete o texto enviado: registra o tipo e o tamanho, nunca o valor",
        [comSessao, semSessao, forjado].every((r) => r.log.every((l) => !l.includes("SONDA") && !l.includes("apagarTudo"))) &&
          comSessao.log.some((l) => l.includes(`${SONDA.length} caractere`)),
        comSessao.log.join(" / "),
      );
    }
    afirmar(
      "`executorDe` só devolve as cinco, e nada herdado do protótipo",
      operacoesDeCarreiras.OPERACOES_DE_CARREIRAS.every((o) => typeof moduloDoHandler.executorDe(o) === "function") &&
        ["constructor", "__proto__", "toString", "salvar", "excluir", ""].every((o) => moduloDoHandler.executorDe(o) === null),
    );
    afirmar(
      "a tabela de despacho liga cada operação ao executor do núcleo, pelo mesmo objeto",
      moduloDoHandler.EXECUTORES.salvarVaga === nucleoDaVaga.salvarVaga &&
        moduloDoHandler.EXECUTORES.mudarEstadoDaVaga === nucleoDaVaga.mudarEstadoDaVaga &&
        moduloDoHandler.EXECUTORES.excluirVaga === nucleoDaVaga.excluirVaga &&
        moduloDoHandler.EXECUTORES.salvarClassificacao === nucleoDaClassificacao.salvarClassificacao &&
        moduloDoHandler.EXECUTORES.excluirClassificacao === nucleoDaClassificacao.excluirClassificacao &&
        igual(Object.keys(moduloDoHandler.EXECUTORES), [...operacoesDeCarreiras.OPERACOES_DE_CARREIRAS]),
    );

    /* ── Criar Rascunho ── */
    let criadaId = null;
    {
      const titulo = "Analista de Operações Júnior";
      const n = marca();
      const r = await enviar({ operacao: "salvarVaga", titulo, ...classificacoesCompletas });
      const vaga = r.corpo?.dados?.vaga ?? {};
      criadaId = vaga.id ?? null;
      const insercao = escritasDesde(n).find((p) => p.metodo === "POST" && p.url.startsWith("/rest/v1/vagas"));
      afirmar(
        "criar Rascunho (título e as três Classificações, sem link nem Descrição): 201, `criada`, Estado rascunho, Slug derivado do título",
        r.status === 201 &&
          r.corpo?.dados?.criada === true &&
          vaga.estado === "rascunho" &&
          vaga.slug === regrasDaVaga.slugDaVaga(titulo).slug &&
          vaga.aberta_em === null,
        `HTTP ${r.status} ${JSON.stringify(r.corpo).slice(0, 200)}`,
      );
      afirmar(
        "e o comando de criação NÃO leva `estado` nem `aberta_em` (a Vaga nasce Rascunho pelo banco)",
        insercao !== undefined && !Object.hasOwn(insercao.corpo, "estado") && !Object.hasOwn(insercao.corpo, "aberta_em"),
        JSON.stringify(insercao?.corpo ?? {}).slice(0, 200),
      );
    }

    /* ── Campo desconhecido ── */
    {
      const n = marca();
      const r = await enviar({
        operacao: "salvarVaga",
        titulo: "Vaga com campos a mais",
        ...classificacoesCompletas,
        estado: "aberta",
        aberta_em: "2020-01-01T00:00:00Z",
        descricao_html: "<p>forjado</p>",
        criado_em: "1999-01-01T00:00:00Z",
        xpto: 1,
      });
      const insercao = escritasDesde(n).find((p) => p.metodo === "POST");
      const colunas = Object.keys(insercao?.corpo ?? {});
      afirmar(
        "campo desconhecido: a Vaga nasce Rascunho, e `estado`, `aberta_em`, `descricao_html`, `criado_em` e `xpto` saem RELATADOS como ignorados",
        r.status === 201 &&
          r.corpo?.dados?.vaga?.estado === "rascunho" &&
          r.corpo?.dados?.vaga?.aberta_em === null &&
          ["estado", "aberta_em", "descricao_html", "criado_em", "xpto"].every((c) => r.corpo?.dados?.ignorados?.includes(c)),
        JSON.stringify(r.corpo?.dados?.ignorados),
      );
      afirmar(
        "e as colunas do comando são montadas à mão: só as da lista fechada, nenhum campo ignorado viaja",
        colunas.length > 0 && colunas.every((c) => nucleoDaVaga.COLUNAS_GRAVAVEIS_DA_VAGA.includes(c)),
        colunas.join(", "),
      );
    }

    /* ── Descrição fora da projeção ── */
    {
      const n = marca();
      const descricao = {
        type: "doc",
        content: [
          { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "citado" }] }] },
          { type: "image", attrs: { src: "https://chatclean.com.br/a.png", alt: "a" } },
          { type: "paragraph", content: [{ type: "text", text: "fica", marks: [{ type: "highlight", attrs: { cor: "amarelo" } }] }] },
        ],
      };
      const r = await enviar({ operacao: "salvarVaga", titulo: "Vaga com Descrição suja", ...classificacoesCompletas, descricao });
      const gravado = escritasDesde(n).find((p) => p.metodo === "POST")?.corpo ?? {};
      const tipos = JSON.stringify(gravado.descricao ?? {});
      afirmar(
        "Descrição com citação, imagem e destaque: gravada SEM eles, e a resposta relata o descarte",
        r.status === 201 &&
          (r.corpo?.dados?.descarte?.total ?? 0) >= 3 &&
          !/"(blockquote|image|highlight)"/.test(tipos) &&
          /fica/.test(tipos),
        `${JSON.stringify(r.corpo?.dados?.descarte ?? null).slice(0, 160)} | ${tipos.slice(0, 160)}`,
      );
      afirmar(
        "e o `descricao_html` gravado NO MESMO comando sai do renderizador único, sem `<blockquote>`, `<img>` nem `<mark>`",
        typeof gravado.descricao_html === "string" &&
          gravado.descricao_html === derivarHtml(gravado.descricao, descricaoDaVaga.VOCABULARIO_DA_VAGA).html &&
          !/<(blockquote|img|mark)\b/.test(gravado.descricao_html) &&
          r.corpo?.dados?.vaga?.descricao_html === gravado.descricao_html,
        String(gravado.descricao_html).slice(0, 160),
      );
    }

    /* ── Abrir incompleta, abrir, encerrar, reabrir ── */
    {
      const n = marca();
      const r = await enviar({ operacao: "mudarEstadoDaVaga", id: incompleta.id, acao: "abrir" });
      afirmar(
        "abrir um Rascunho sem Link: 422, `faltando` inclui `link_de_candidatura`, e nenhum comando sai",
        r.status === 422 && erroDe(r).faltando?.includes("link_de_candidatura") && escritasDesde(n).length === 0,
        `HTTP ${r.status} ${JSON.stringify(erroDe(r))}`.slice(0, 240),
      );
    }
    {
      const n = marca();
      const r = await enviar({ operacao: "mudarEstadoDaVaga", id: completa.id, acao: "abrir" });
      const patch = escritasDesde(n).find((p) => p.metodo === "PATCH");
      afirmar(
        "abrir um Rascunho completo: 200, Estado aberta, `aberta_em` preenchido pelo banco",
        r.status === 200 && r.corpo?.dados?.vaga?.estado === "aberta" && typeof r.corpo?.dados?.vaga?.aberta_em === "string",
        `HTTP ${r.status} ${JSON.stringify(r.corpo).slice(0, 200)}`,
      );
      afirmar(
        "e o comando leva SÓ `{ estado: \"aberta\" }` (nada de `aberta_em`), filtrado pelo Estado LIDO",
        patch !== undefined && igual(patch.corpo, { estado: "aberta" }) && /[?&]estado=eq\.rascunho(&|$)/.test(patch.url),
        `${patch?.url ?? "sem PATCH"} ${JSON.stringify(patch?.corpo ?? null)}`,
      );
    }
    {
      const n = marca();
      const encerrar = await enviar({ operacao: "mudarEstadoDaVaga", id: aberta.id, acao: "encerrar" });
      const reabrir = await enviar({ operacao: "mudarEstadoDaVaga", id: aberta.id, acao: "reabrir" });
      afirmar(
        "encerrar uma Aberta e reabrir: 200 as duas, e `aberta_em` continua o ORIGINAL",
        encerrar.status === 200 &&
          encerrar.corpo?.dados?.vaga?.estado === "encerrada" &&
          reabrir.status === 200 &&
          reabrir.corpo?.dados?.vaga?.estado === "aberta" &&
          reabrir.corpo?.dados?.vaga?.aberta_em === "2026-01-02T03:04:05.000Z" &&
          escritasDesde(n).every((p) => !Object.hasOwn(p.corpo ?? {}, "aberta_em")),
        `${encerrar.status}/${reabrir.status} ${reabrir.corpo?.dados?.vaga?.aberta_em}`,
      );
    }

    /* ── Transições proibidas ── */
    {
      const n = marca();
      const encerrarRascunho = await enviar({ operacao: "mudarEstadoDaVaga", id: incompleta.id, acao: "encerrar" });
      const reabrirAberta = await enviar({ operacao: "mudarEstadoDaVaga", id: aberta.id, acao: "reabrir" });
      const abrirEncerrada = await enviar({ operacao: "mudarEstadoDaVaga", id: encerrada.id, acao: "abrir" });
      afirmar(
        "transição proibida (`encerrar` um Rascunho, `reabrir` uma Aberta): 422 com a frase de `motivoDaRecusa`, e nenhum comando",
        encerrarRascunho.status === 422 &&
          erroDe(encerrarRascunho).mensagem === transicoesDaVaga.motivoDaRecusa("rascunho", "encerrada") &&
          reabrirAberta.status === 422 &&
          erroDe(reabrirAberta).mensagem === transicoesDaVaga.motivoDaRecusa("aberta", "aberta") &&
          escritasDesde(n).length === 0,
        `${encerrarRascunho.status} ${erroDe(encerrarRascunho).mensagem} | ${reabrirAberta.status} ${erroDe(reabrirAberta).mensagem}`,
      );
      afirmar(
        "a ação é julgada pela CHAVE no Estado gravado: `abrir` uma Encerrada é recusado (a saída dela é reabrir), com frase que nomeia as saídas",
        abrirEncerrada.status === 422 && /Reabrir vaga/.test(erroDe(abrirEncerrada).mensagem) && fraseDeCarreirasBoa(erroDe(abrirEncerrada).mensagem),
        `${abrirEncerrada.status} ${erroDe(abrirEncerrada).mensagem}`,
      );
      const excluirComoAcao = await enviar({ operacao: "mudarEstadoDaVaga", id: incompleta.id, acao: "excluir" });
      const acaoInventada = await enviar({ operacao: "mudarEstadoDaVaga", id: incompleta.id, acao: "publicar" });
      afirmar(
        "`excluir` e ação inventada não são mudança de Estado: 422",
        excluirComoAcao.status === 422 && acaoInventada.status === 422 && escritasDesde(n).length === 0,
      );
    }

    /* ── A Aberta que ficaria incompleta ── */
    {
      const n = marca();
      const r = await enviar({ operacao: "salvarVaga", id: aberta.id, link_de_candidatura: null, resumo: "" });
      afirmar(
        "salvar uma Aberta que ficaria sem Link e sem Resumo: 422 com `faltando`, e nenhum comando",
        r.status === 422 &&
          igual([...(erroDe(r).faltando ?? [])], ["resumo", "link_de_candidatura"]) &&
          escritasDesde(n).length === 0,
        `HTTP ${r.status} ${JSON.stringify(erroDe(r))}`.slice(0, 240),
      );
      const ok = await enviar({ operacao: "salvarVaga", id: aberta.id, resumo: "Resumo novo da vaga aberta." });
      afirmar(
        "e salvar uma Aberta que continua completa passa (200), sem mudar o Estado",
        ok.status === 200 && ok.corpo?.dados?.vaga?.estado === "aberta" && ok.corpo?.dados?.vaga?.resumo === "Resumo novo da vaga aberta.",
        `HTTP ${ok.status}`,
      );
    }

    /* ── Slug travado e colisão ── */
    {
      const n = marca();
      const travado = await enviar({ operacao: "salvarVaga", id: encerrada.id, slug: "outro-endereco" });
      afirmar(
        "editar o Slug de uma Encerrada (já foi aberta): 422, e nenhum comando",
        travado.status === 422 && /travou/.test(erroDe(travado).mensagem) && escritasDesde(n).length === 0,
        `HTTP ${travado.status} ${erroDe(travado).mensagem}`,
      );
      const colisao = await enviar({ operacao: "salvarVaga", titulo: "Outra", slug: aberta.slug, ...classificacoesCompletas });
      afirmar(
        "Slug de outra Vaga: 409, dizendo de QUAL vaga ele é, e nenhum comando",
        colisao.status === 409 && erroDe(colisao).mensagem.includes(aberta.titulo) && fraseDeCarreirasBoa(erroDe(colisao).mensagem) && escritasDesde(n).length === 0,
        `HTTP ${colisao.status} ${erroDe(colisao).mensagem}`,
      );
      /* A CORRIDA: a conferência disse livre, e o índice único recusou. */
      duble.injecoes.push({
        vezes: 1,
        quando: (p) => p.metodo === "POST" && p.url.startsWith("/rest/v1/vagas"),
        resposta: [409, { code: "23505", message: 'duplicate key value violates unique constraint "vagas_slug_unico"' }],
      });
      const corrida = await enviar({ operacao: "salvarVaga", titulo: "Corrida de endereço", ...classificacoesCompletas });
      afirmar(
        "o 23505 do banco (corrida entre conferir e gravar) vira 409 com frase de VAGA, nunca a de post",
        corrida.status === 409 && /vaga/i.test(erroDe(corrida).mensagem) && fraseDeCarreirasBoa(erroDe(corrida).mensagem),
        `HTTP ${corrida.status} ${erroDe(corrida).mensagem}`,
      );
    }

    /* ── O PATCH que não alcança a linha (revisão da 5.3) ──
       A gravação leva o Estado LIDO no filtro. Se outra sessão mudou o Estado
       (ou excluiu a Vaga) entre a leitura e o comando, o PostgREST devolve
       lista vazia; a injeção produz exatamente isso, e muda o dublê como a
       outra sessão teria mudado. O servidor relê e diz qual dos dois foi. */
    {
      const alvoSalvar = vagaBase("corrida-salvar", "rascunho");
      const alvoSalvarSumiu = vagaBase("corrida-salvar-sumiu", "rascunho");
      const alvoMudar = vagaBase("corrida-mudar", "rascunho");
      const alvoMudarSumiu = vagaBase("corrida-mudar-sumiu", "rascunho");
      duble.tabelas.vagas.push(alvoSalvar, alvoSalvarSumiu, alvoMudar, alvoMudarSumiu);
      const outraSessaoAbre = (id) => {
        const linha = duble.tabelas.vagas.find((v) => v.id === id);
        linha.estado = "aberta";
        linha.aberta_em = new Date().toISOString();
      };
      const outraSessaoExclui = (id) => {
        duble.tabelas.vagas = duble.tabelas.vagas.filter((v) => v.id !== id);
      };
      const patchVazio = (id, efeito) => ({
        vezes: 1,
        quando: (p) => {
          const casa = p.metodo === "PATCH" && p.url.startsWith("/rest/v1/vagas") && p.url.includes(id);
          if (casa) efeito(id);
          return casa;
        },
        resposta: [200, []],
      });

      duble.injecoes.push(patchVazio(alvoSalvar.id, outraSessaoAbre));
      const n = marca();
      const salvarMudou = await enviar({ operacao: "salvarVaga", id: alvoSalvar.id, resumo: "Resumo trocado no meio." });
      const patch = duble.recebidos.slice(n).find((p) => p.metodo === "PATCH");
      afirmar(
        "salvarVaga: o PATCH leva o filtro `estado=eq.<lido>` (aqui, rascunho), e a linha que não voltou porque o Estado mudou no meio é 409 `conflito`",
        patch !== undefined &&
          /[?&]estado=eq\.rascunho(&|$)/.test(patch.url) &&
          salvarMudou.status === 409 &&
          erroDe(salvarMudou).tipo === "conflito" &&
          fraseDeCarreirasBoa(erroDe(salvarMudou).mensagem),
        `${patch?.url ?? "sem PATCH"} | HTTP ${salvarMudou.status} ${erroDe(salvarMudou).mensagem}`,
      );
      duble.injecoes.push(patchVazio(alvoSalvarSumiu.id, outraSessaoExclui));
      const salvarSumiu = await enviar({ operacao: "salvarVaga", id: alvoSalvarSumiu.id, resumo: "Resumo de quem sumiu." });
      afirmar(
        "salvarVaga: e a linha que não voltou porque a Vaga SUMIU no meio é 404 `nao_encontrado`",
        salvarSumiu.status === 404 && erroDe(salvarSumiu).tipo === "nao_encontrado" && fraseDeCarreirasBoa(erroDe(salvarSumiu).mensagem),
        `HTTP ${salvarSumiu.status} ${erroDe(salvarSumiu).mensagem}`,
      );

      duble.injecoes.push(patchVazio(alvoMudar.id, outraSessaoAbre));
      const m = marca();
      const mudarMudou = await enviar({ operacao: "mudarEstadoDaVaga", id: alvoMudar.id, acao: "abrir" });
      const patchDaMudanca = duble.recebidos.slice(m).find((p) => p.metodo === "PATCH");
      afirmar(
        "mudarEstadoDaVaga: o PATCH filtrado pelo Estado lido que não alcança a linha (outra sessão abriu antes) é 409 `conflito`",
        patchDaMudanca !== undefined &&
          /[?&]estado=eq\.rascunho(&|$)/.test(patchDaMudanca.url) &&
          mudarMudou.status === 409 &&
          erroDe(mudarMudou).tipo === "conflito",
        `HTTP ${mudarMudou.status} ${erroDe(mudarMudou).mensagem}`,
      );
      duble.injecoes.push(patchVazio(alvoMudarSumiu.id, outraSessaoExclui));
      const mudarSumiu = await enviar({ operacao: "mudarEstadoDaVaga", id: alvoMudarSumiu.id, acao: "abrir" });
      afirmar(
        "mudarEstadoDaVaga: e quando a Vaga sumiu no meio, 404 `nao_encontrado`",
        mudarSumiu.status === 404 && erroDe(mudarSumiu).tipo === "nao_encontrado",
        `HTTP ${mudarSumiu.status} ${erroDe(mudarSumiu).mensagem}`,
      );
      afirmar(
        "e as quatro injeções foram de fato consumidas (a asserção exerceu a corrida, e não o caminho comum)",
        duble.injecoes.filter((i) => i.vezes > 0).length === 0,
        `${duble.injecoes.filter((i) => i.vezes > 0).length} injeção(ões) sobrando`,
      );
    }

    /* ── Classificação escolhida que não existe (revisão da 5.3) ── */
    {
      const inexistente = randomUUID();
      const n = marca();
      const r = await enviar({
        operacao: "salvarVaga",
        titulo: "Vaga com Departamento fantasma",
        departamento_id: inexistente,
        tipo_id: tipo.id,
        nivel_id: nivel.id,
      });
      afirmar(
        "salvarVaga com UUID VÁLIDO de um Departamento que não existe: 422, `faltando` com a COLUNA `departamento_id`, e nenhum POST",
        r.status === 422 &&
          erroDe(r).tipo === "dados_invalidos" &&
          igual([...(erroDe(r).faltando ?? [])], ["departamento_id"]) &&
          escritasDesde(n).filter((p) => p.metodo === "POST").length === 0,
        `HTTP ${r.status} ${JSON.stringify(erroDe(r)).slice(0, 200)}`,
      );
      /* A CORRIDA: a conferência achou o Nível, e ele foi excluído antes do
         comando; a chave estrangeira recusa com 23503 (HTTP 409 no PostgREST). */
      duble.injecoes.push({
        vezes: 1,
        quando: (p) => p.metodo === "POST" && p.url.startsWith("/rest/v1/vagas"),
        resposta: [409, { code: "23503", message: 'insert or update on table "vagas" violates foreign key constraint "vagas_nivel_id_fkey"' }],
      });
      const corrida = await enviar({ operacao: "salvarVaga", titulo: "Vaga da corrida do Nível", ...classificacoesCompletas });
      afirmar(
        "o 23503 da chave estrangeira no salvamento (HTTP 409 do PostgREST) é 422 com a frase da Classificação inexistente, e NUNCA a de endereço repetido",
        corrida.status === 422 &&
          erroDe(corrida).tipo === "dados_invalidos" &&
          /não existe mais/.test(erroDe(corrida).mensagem) &&
          !/endereço/.test(erroDe(corrida).mensagem),
        `HTTP ${corrida.status} ${erroDe(corrida).mensagem}`,
      );
    }

    /* ── Excluir ── */
    {
      const n = marca();
      const r = await enviar({ operacao: "excluirVaga", id: aberta.id });
      afirmar(
        "excluir uma Aberta: 422, \"encerre antes\", decidido sobre o Estado GRAVADO (nenhum DELETE chega ao banco)",
        r.status === 422 &&
          /Encerre a vaga antes/.test(erroDe(r).mensagem) &&
          escritasDesde(n).filter((p) => p.metodo === "DELETE").length === 0,
        `HTTP ${r.status} ${erroDe(r).mensagem} | DELETEs ${escritasDesde(n).filter((p) => p.metodo === "DELETE").length}`,
      );
      const rascunho = await enviar({ operacao: "excluirVaga", id: criadaId });
      afirmar(
        "excluir um Rascunho: 200, com a linha que saiu",
        rascunho.status === 200 && rascunho.corpo?.dados?.vaga?.id === criadaId && !duble.tabelas.vagas.some((v) => v.id === criadaId),
        `HTTP ${rascunho.status}`,
      );
      const denovo = await enviar({ operacao: "excluirVaga", id: criadaId });
      afirmar("excluir de novo: 404 (a Vaga já saiu)", denovo.status === 404 && fraseDeCarreirasBoa(erroDe(denovo).mensagem), `HTTP ${denovo.status}`);
      const torto = await enviar({ operacao: "excluirVaga", id: "nao-e-uuid" });
      afirmar("id torto: 422, antes de ir ao banco", torto.status === 422, `HTTP ${torto.status}`);
    }

    /* ── Classificações ── */
    {
      const n = marca();
      const repetida = await enviar({ operacao: "salvarClassificacao", lista: "departamento", nome: "operacoes" });
      afirmar(
        "Classificação duplicada (`operacoes` diante de `Operações`): 409 que NOMEIA \"Operações\", e nenhum comando",
        repetida.status === 409 && erroDe(repetida).mensagem.includes("“Operações”") && escritasDesde(n).length === 0,
        `HTTP ${repetida.status} ${erroDe(repetida).mensagem}`,
      );
      duble.injecoes.push({
        vezes: 1,
        quando: (p) => p.metodo === "POST" && p.url.startsWith("/rest/v1/niveis"),
        resposta: [409, { code: "23505", message: 'duplicate key value violates unique constraint "niveis_nome_normalizado_unico"' }],
      });
      const corrida = await enviar({ operacao: "salvarClassificacao", lista: "nivel", nome: "Sênior" });
      afirmar(
        "o 23505 do índice normalizado vira 409 com frase própria (de Nível), nunca a de post",
        corrida.status === 409 && /Nível/.test(erroDe(corrida).mensagem) && fraseDeCarreirasBoa(erroDe(corrida).mensagem),
        `HTTP ${corrida.status} ${erroDe(corrida).mensagem}`,
      );
      const nova = await enviar({ operacao: "salvarClassificacao", lista: "nivel", nome: "  Especialista   Sênior ", cor: "var(--categoria-roxo-bg)", equivalente_jobposting: "FULL_TIME" });
      afirmar(
        "criar um Nível: 201, nome com espaço colapsado, e a coluna que não é da lista (Equivalente num Nível) é ignorada e relatada",
        nova.status === 201 &&
          nova.corpo?.dados?.criada === true &&
          nova.corpo?.dados?.classificacao?.nome === "Especialista Sênior" &&
          nova.corpo?.dados?.ignorados?.includes("equivalente_jobposting") &&
          !Object.hasOwn(duble.recebidos.at(-1)?.corpo ?? {}, "equivalente_jobposting"),
        `HTTP ${nova.status} ${JSON.stringify(nova.corpo).slice(0, 200)}`,
      );
      /* O PRÓPRIO nome não colide consigo mesmo (revisão da 5.3): editar a Cor
         mandando o nome junto, com o id em MAIÚSCULAS (o formato aceita) e o
         nome com outra caixa e sem acento. */
      const proprio = await enviar({
        operacao: "salvarClassificacao",
        lista: "departamento",
        id: dep.id.toUpperCase(),
        nome: "Operações",
        cor: "var(--categoria-rosa-bg)",
      });
      const corDepois = duble.tabelas.departamentos.find((d) => d.id === dep.id)?.cor;
      const variacao = await enviar({
        operacao: "salvarClassificacao",
        lista: "departamento",
        id: dep.id.toUpperCase(),
        nome: "OPERACOES",
        cor: "var(--categoria-ciano-bg)",
      });
      const restaurado = await enviar({ operacao: "salvarClassificacao", lista: "departamento", id: dep.id, nome: "Operações" });
      afirmar(
        "editar um Departamento mandando o PRÓPRIO nome (e a variação de caixa e acento) com Cor nova, pelo id em maiúsculas: 200, e a Cor muda",
        proprio.status === 200 &&
          corDepois === "var(--categoria-rosa-bg)" &&
          variacao.status === 200 &&
          variacao.corpo?.dados?.classificacao?.cor === "var(--categoria-ciano-bg)" &&
          restaurado.status === 200 &&
          duble.tabelas.departamentos.find((d) => d.id === dep.id)?.nome === "Operações",
        `${proprio.status} ${erroDe(proprio).mensagem ?? ""} | ${variacao.status} ${erroDe(variacao).mensagem ?? ""} | ${restaurado.status}`,
      );
      /* O relatório do que foi ignorado diz o TOTAL e se foi cortado. */
      const lixo = Object.fromEntries(Array.from({ length: 55 }, (_, i) => [`campo_a_mais_${i}`, i]));
      const muitos = await enviar({ operacao: "salvarClassificacao", lista: "nivel", id: nivel.id, ordem: 2, ...lixo });
      const poucos = await enviar({ operacao: "salvarClassificacao", lista: "nivel", id: nivel.id, ordem: 1, xpto: 1 });
      const vagaComLixo = await enviar({ operacao: "salvarVaga", id: completa.id, resumo: "Resumo com lixo.", ...lixo });
      const LIMITE = nucleoDoPost.LIMITE_DE_IGNORADOS;
      afirmar(
        `Classificação e Vaga com 55 campos a mais: a lista vem cortada no teto (${LIMITE}), com \`totalIgnorado\` 55 e \`ignoradosTruncados\`; com um só, nada é cortado`,
        muitos.status === 200 &&
          muitos.corpo?.dados?.ignorados?.length === LIMITE &&
          muitos.corpo?.dados?.totalIgnorado === 55 &&
          muitos.corpo?.dados?.ignoradosTruncados === true &&
          poucos.status === 200 &&
          igual(poucos.corpo?.dados?.ignorados, ["xpto"]) &&
          poucos.corpo?.dados?.totalIgnorado === 1 &&
          poucos.corpo?.dados?.ignoradosTruncados === false &&
          vagaComLixo.status === 200 &&
          vagaComLixo.corpo?.dados?.totalIgnorado === 55 &&
          vagaComLixo.corpo?.dados?.ignoradosTruncados === true,
        `${muitos.status} ${JSON.stringify({ n: muitos.corpo?.dados?.ignorados?.length, t: muitos.corpo?.dados?.totalIgnorado, c: muitos.corpo?.dados?.ignoradosTruncados })} | ${poucos.status} | vaga ${vagaComLixo.status} ${vagaComLixo.corpo?.dados?.totalIgnorado}`,
      );
      const semEquivalente = await enviar({ operacao: "salvarClassificacao", lista: "tipo", nome: "Temporário" });
      afirmar("criar um Tipo sem Equivalente JobPosting: 422", semEquivalente.status === 422, `HTTP ${semEquivalente.status}`);
      const corFora = await enviar({ operacao: "salvarClassificacao", lista: "departamento", nome: "Jurídico", cor: "#ff0000" });
      afirmar("Cor fora da paleta: 422", corFora.status === 422, `HTTP ${corFora.status}`);
    }
    {
      const n = marca();
      const cargos = await enviar({ operacao: "salvarClassificacao", lista: "cargos", nome: "Diretor" });
      const semLista = await enviar({ operacao: "excluirClassificacao", id: dep.id });
      afirmar(
        "lista inválida (`cargos`) ou ausente: 422, e a tabela NUNCA vem do corpo (nenhum pedido ao banco)",
        cargos.status === 422 && semLista.status === 422 && idaAoRestDesde(n).filter((p) => !p.url.startsWith("/rest/v1/perfis")).length === 0 && !duble.recebidos.some((p) => /cargos/.test(p.url)),
        `HTTP ${cargos.status}/${semLista.status} | idas ${idaAoRestDesde(n).length}`,
      );
    }
    {
      const n = marca();
      const emUso = await enviar({ operacao: "excluirClassificacao", lista: "departamento", id: dep.id });
      afirmar(
        "excluir um Departamento usado por Vagas: 409 \"em uso por N vagas\", contado pela coluna da lista, e nenhum DELETE",
        emUso.status === 409 &&
          new RegExp(`em uso por ${duble.tabelas.vagas.filter((v) => v.departamento_id === dep.id).length} vagas`, "i").test(erroDe(emUso).mensagem) &&
          escritasDesde(n).length === 0,
        `HTTP ${emUso.status} ${erroDe(emUso).mensagem}`,
      );
      /* Uma vaga só usando o Nível novo: a frase é no singular. */
      const nivelNovo = duble.tabelas.niveis.find((x) => x.nome === "Especialista Sênior");
      duble.tabelas.vagas.push(vagaBase("do-nivel-novo", "rascunho", { nivel_id: nivelNovo.id }));
      const umaVaga = await enviar({ operacao: "excluirClassificacao", lista: "nivel", id: nivelNovo.id });
      afirmar(
        "excluir um Nível usado por UMA Vaga: 409 \"Em uso por 1 vaga\"",
        umaVaga.status === 409 && /em uso por 1 vaga\b/i.test(erroDe(umaVaga).mensagem),
        `HTTP ${umaVaga.status} ${erroDe(umaVaga).mensagem}`,
      );
      /* A CORRIDA: a contagem disse zero, e a chave estrangeira recusou. */
      duble.injecoes.push({
        vezes: 1,
        quando: (p) => p.metodo === "GET" && p.url.startsWith("/rest/v1/vagas?select=id&nivel_id="),
        resposta: [200, [], { "content-range": "*/0" }],
      });
      const corrida = await enviar({ operacao: "excluirClassificacao", lista: "nivel", id: nivelNovo.id });
      afirmar(
        "o 23503 da chave estrangeira (corrida entre contar e excluir) vira 409 com a contagem refeita, NUNCA 422",
        corrida.status === 409 && erroDe(corrida).tipo === "conflito" && /em uso por 1 vaga\b/i.test(erroDe(corrida).mensagem),
        `HTTP ${corrida.status} ${erroDe(corrida).mensagem}`,
      );
      /* A CORRIDA COM A RECONTAGEM FORA (revisão da 5.3): a contagem disse
         zero, a chave estrangeira recusou, e a recontagem falhou. A frase diz
         que está em uso SEM inventar número, e a falha da recontagem vai ao log. */
      const nivelDaRecontagem = { id: randomUUID(), nome: "Nível da recontagem", cor: "var(--categoria-azul-bg)", ordem: 7, criado_em: agoraIso, atualizado_em: agoraIso };
      duble.tabelas.niveis.push(nivelDaRecontagem);
      const contagemDoNivel = (p) => p.metodo === "GET" && p.url.startsWith(`/rest/v1/vagas?select=id&nivel_id=eq.${nivelDaRecontagem.id}`);
      duble.injecoes.push(
        { vezes: 1, quando: contagemDoNivel, resposta: [200, [], { "content-range": "*/0" }] },
        {
          vezes: 1,
          quando: (p) => p.metodo === "DELETE" && p.url.startsWith("/rest/v1/niveis") && p.url.includes(nivelDaRecontagem.id),
          resposta: [409, { code: "23503", message: 'update or delete on table "niveis" violates foreign key constraint "vagas_nivel_id_fkey" on table "vagas"' }],
        },
        { vezes: 1, quando: contagemDoNivel, resposta: [503, { message: "recontagem fora do ar" }] },
      );
      const semRecontagem = await enviar({ operacao: "excluirClassificacao", lista: "nivel", id: nivelDaRecontagem.id });
      afirmar(
        "23503 com a recontagem FALHANDO: 409 que diz \"em uso por vagas\" sem número nenhum, e o log registra que a recontagem falhou",
        semRecontagem.status === 409 &&
          erroDe(semRecontagem).tipo === "conflito" &&
          /em uso por vagas/.test(erroDe(semRecontagem).mensagem) &&
          !/\d/.test(erroDe(semRecontagem).mensagem) &&
          semRecontagem.log.some((l) => /recontagem falhou/.test(l)) &&
          duble.injecoes.filter((i) => i.vezes > 0).length === 0,
        `HTTP ${semRecontagem.status} ${erroDe(semRecontagem).mensagem} | log: ${semRecontagem.log.join(" / ").slice(0, 200)}`,
      );
      const livre = await enviar({ operacao: "excluirClassificacao", lista: "departamento", id: depLivre.id });
      afirmar(
        "excluir um Departamento que ninguém usa: 200",
        livre.status === 200 && livre.corpo?.dados?.id === depLivre.id && !duble.tabelas.departamentos.some((d) => d.id === depLivre.id),
        `HTTP ${livre.status}`,
      );
    }

    /* ── O que TODA resposta revela, e o que vai ao log ── */
    {
      const comDetalhe = respostas.filter((r) => r.corpo?.erro && Object.hasOwn(r.corpo.erro, "detalhe"));
      afirmar(
        `nenhuma das ${respostas.length} respostas devolve \`detalhe\` (ele vai só para o log)`,
        respostas.length > 30 && comDetalhe.length === 0,
        comDetalhe.map((r) => JSON.stringify(r.corpo.erro).slice(0, 80)).join(" | "),
      );
      const falhasComDetalheNoLog = respostas.filter((r) => r.corpo?.ok === false && r.status !== 405 && r.log.some((l) => l.startsWith("[api/carreiras] ")));
      afirmar(
        "e o log do servidor sai com o prefixo `[api/carreiras]`",
        falhasComDetalheNoLog.length > 5 && respostas.every((r) => r.log.every((l) => l.startsWith("[api/carreiras] "))),
        `${falhasComDetalheNoLog.length} falha(s) com log`,
      );
      const frasesRuins = respostas
        .filter((r) => r.corpo?.ok === false)
        .map((r) => r.corpo.erro.mensagem)
        .filter((m) => m !== moduloDosPosts.RECUSA_SEM_CREDENCIAL && !fraseDeCarreirasBoa(m));
      afirmar(
        "toda frase de recusa fala de vaga ou Classificação: nenhuma diz \"post\", nenhuma tem travessão, nenhuma é vaga",
        frasesRuins.length === 0,
        frasesRuins.slice(0, 4).join(" | "),
      );
    }
  } finally {
    await new Promise((pronto) => duble.servidor.close(pronto));
  }
}

/* O NÚCLEO, pelas frases: a tradução do banco nunca devolve frase de post,
   para NENHUM código que o transporte pode trazer. */
{
  const CODIGOS = [
    { status: 0, codigo: "TypeError" },
    { status: 401, codigo: "" },
    { status: 409, codigo: "23505" },
    { status: 409, codigo: "23503" },
    { status: 400, codigo: "23514", mensagem: "vagas_maquina_de_estados: x" },
    { status: 400, codigo: "23514", mensagem: "vagas_aberta_completa" },
    { status: 400, codigo: "22P02" },
    { status: 404, codigo: "PGRST205" },
    { status: 500, codigo: "" },
  ];
  const ruins = [];
  for (const resposta of CODIGOS) {
    for (const conflito of ["", "Já existe uma vaga com este endereço. Escolha outro antes de salvar."]) {
      const f = nucleoDaVaga.falhaDaEscritaDeCarreiras({ ok: false, mensagem: "", ...resposta }, { oQue: "teste", fazer: "salvar a vaga", conflito });
      if (!fraseDeCarreirasBoa(f.erro.mensagem)) ruins.push(`${resposta.status}/${resposta.codigo}: ${f.erro.mensagem}`);
    }
  }
  afirmar(
    "`falhaDaEscritaDeCarreiras` nunca devolve frase de post nem frase vazia, para rede, permissão, conflito, 23503, gatilho, invariante, tipo torto, rota ausente e 500",
    ruins.length === 0,
    ruins.join(" | "),
  );
  const DEP = classificacoes.LISTAS_DE_CLASSIFICACAO[0];
  afirmar(
    "a frase de Classificação em uso diz o número, no singular e no plural",
    /em uso por 1 vaga\. Troque o Departamento dessa vaga/.test(nucleoDaClassificacao.fraseDeClassificacaoEmUso(DEP, "Operações", 1)) &&
      /em uso por 3 vagas\. Troque o Departamento dessas vagas/.test(nucleoDaClassificacao.fraseDeClassificacaoEmUso(DEP, "Operações", 3)),
  );
  afirmar(
    "as frases de autorização do servidor falam de vagas e de Departamentos, Tipos e Níveis, nunca de post",
    [
      nucleoDaVaga.SEM_PERMISSAO_PARA_VAGAS,
      nucleoDaVaga.SEM_CADASTRO_PARA_VAGAS,
      nucleoDaClassificacao.SEM_PERMISSAO_PARA_CLASSIFICACOES,
      nucleoDaClassificacao.SEM_CADASTRO_PARA_CLASSIFICACOES,
      moduloDoHandler?.SO_POST,
      moduloDoHandler?.SEM_CONFIGURACAO,
    ].every(fraseDeCarreirasBoa),
  );

  /* A SELEÇÃO da frase (revisão da 5.3): não basta a frase ser de Carreiras,
     ela precisa ser a CERTA para o que o banco disse. As entradas têm o HTTP
     que o PostgREST de fato manda (409 para 23503 e 23505, 400 para 23514). */
  const CONFLITO_DO_SLUG = "Já existe uma vaga com este endereço. Escolha outro antes de salvar.";
  const selecionar = (resposta) =>
    nucleoDaVaga.falhaDaEscritaDeCarreiras({ ok: false, ...resposta }, { oQue: "teste", fazer: "salvar a vaga", conflito: CONFLITO_DO_SLUG }).erro;
  const maquina = selecionar({ status: 400, codigo: "23514", mensagem: "vagas_maquina_de_estados: x" });
  const incompleta = selecionar({ status: 400, codigo: "23514", mensagem: 'new row violates check constraint "vagas_aberta_completa"' });
  const fk = selecionar({ status: 409, codigo: "23503", mensagem: 'insert or update on table "vagas" violates foreign key constraint "vagas_tipo_id_fkey"' });
  const slug = selecionar({ status: 409, codigo: "23505", mensagem: 'duplicate key value violates unique constraint "vagas_slug_unico"' });
  afirmar(
    "a tradução do banco ESCOLHE a frase certa: gatilho da máquina, invariante da Aberta, Classificação inexistente (23503, mesmo com HTTP 409) e endereço repetido (23505)",
    maquina.tipo === "dados_invalidos" &&
      /estados da vaga/.test(maquina.mensagem) &&
      incompleta.tipo === "dados_invalidos" &&
      /precisa estar completa/.test(incompleta.mensagem) &&
      fk.tipo === "dados_invalidos" &&
      /Departamento, Tipo ou Nível escolhido não existe mais/.test(fk.mensagem) &&
      slug.tipo === "conflito" &&
      slug.mensagem === CONFLITO_DO_SLUG,
    [maquina, incompleta, fk, slug].map((e) => `${e.tipo}: ${e.mensagem}`).join(" | "),
  );

  /* O DESTINO SAI DO ESTADO GRAVADO (revisão da 5.3). Com a MAQUINA de hoje
     cada chave vive num Estado só, e a primeira ocorrência coincide com a do
     Estado gravado: a diferença só aparece com uma tabela em que a MESMA
     chave leva a destinos diferentes. A tabela de mentira é injetada. */
  const TABELA_DE_MENTIRA = {
    rascunho: [{ chave: "mover", destino: "aberta", exclui: false }],
    encerrada: [{ chave: "mover", destino: "rascunho", exclui: false }, { chave: "excluir", destino: null, exclui: true }],
  };
  const acoesDe = (e) => {
    if (!Object.hasOwn(TABELA_DE_MENTIRA, e)) throw new Error(`Estado de mentira desconhecido: ${e}`);
    return TABELA_DE_MENTIRA[e];
  };
  const resolver = nucleoDaVaga.resolverAcaoNoEstado;
  afirmar(
    "`resolverAcaoNoEstado` procura a ação na linha do Estado GRAVADO: a mesma chave leva a destinos diferentes conforme o Estado, e a exclusão nunca é mudança",
    typeof resolver === "function" &&
      resolver("encerrada", "mover", { acoesDe })?.destino === "rascunho" &&
      resolver("rascunho", "mover", { acoesDe })?.destino === "aberta" &&
      resolver("aberta", "mover", { acoesDe }) === null &&
      resolver("encerrada", "excluir", { acoesDe }) === null &&
      resolver("rascunho", "abrir")?.destino === "aberta" &&
      resolver("encerrada", "abrir") === null &&
      resolver("aberta", "reabrir") === null &&
      resolver("publicado", "abrir") === null,
  );
  /* Leitura ESTÁTICA, porque o comportamento é indistinguível com a MAQUINA
     de hoje: `mudarEstadoDaVaga` tira o destino de `resolverAcaoNoEstado` sobre
     o Estado gravado, e não de uma busca da chave em todos os Estados. */
  const corpoDaMudanca = (() => {
    const fonte = semComentarios(ler("api/_nucleo/operacoesDaVaga.js") ?? "");
    const i = fonte.indexOf("export async function mudarEstadoDaVaga");
    const j = fonte.indexOf("export async function excluirVaga");
    return i === -1 || j === -1 ? "" : fonte.slice(i, j);
  })();
  afirmar(
    "`mudarEstadoDaVaga` decide o destino por `resolverAcaoNoEstado(gravada.estado, …)`, e a busca em todos os Estados só aparece para a frase (leitura estática)",
    /const acaoNoEstado = resolverAcaoNoEstado\(gravada\.estado, acao\);/.test(corpoDaMudanca) &&
      /const destino = acaoNoEstado === null \? null : acaoNoEstado\.destino;/.test(corpoDaMudanca) &&
      !/destino = [^;]*destinoNominalDaAcao/.test(corpoDaMudanca),
  );

  /* O VOCABULÁRIO DE `faltando` (revisão da 5.3): toda chave que a escrita da
     Vaga pode devolver é o nome de uma COLUNA de `vagas` e tem rótulo. As
     chaves são COLHIDAS executando as duas fontes (a leitura do corpo, com
     tudo errado, e `problemasParaAbrir` de uma Vaga vazia), e não escritas à
     mão. A terceira fonte, a Classificação inexistente, é a coluna da lista,
     exercida no dublê acima. */
  const tudoErrado = nucleoDaVaga.lerCorpoDaVaga(
    {
      titulo: 5,
      slug: "Com Espaço",
      departamento_id: "x",
      tipo_id: "x",
      nivel_id: "x",
      modalidade: "marte",
      localizacao: 5,
      resumo: 5,
      link_de_candidatura: "javascript:x",
      descricao: "não é documento",
    },
    { criando: true },
  );
  const ausentes = nucleoDaVaga.lerCorpoDaVaga({}, { criando: true });
  const possiveis = new Set([
    ...(tudoErrado.faltando ?? []),
    ...(ausentes.faltando ?? []),
    ...regrasDaVaga.problemasParaAbrir({}),
    ...classificacoes.LISTAS_DE_CLASSIFICACAO.map((l) => l.coluna),
  ]);
  const { COLUNAS_DA_VAGA_NA_ESCRITA } = await import(urlDe("api/_nucleo/acesso.js"));
  const semRotulo = [...possiveis].filter((c) => typeof regrasDaVaga.ROTULOS_DOS_CAMPOS[c] !== "string");
  const naoColuna = [...possiveis].filter((c) => !COLUNAS_DA_VAGA_NA_ESCRITA.includes(c));
  const frase = nucleoDaVaga.fraseDoQueFalta([...possiveis], { aberta: false });
  afirmar(
    "toda chave possível de `faltando` (leitura do corpo, `problemasParaAbrir` e Classificação inexistente) é o nome de uma COLUNA de `vagas` e tem rótulo em `ROTULOS_DOS_CAMPOS`",
    tudoErrado.ok === false &&
      possiveis.size >= 10 &&
      ["departamento_id", "tipo_id", "nivel_id", "link_de_candidatura", "descricao"].every((c) => tudoErrado.faltando.includes(c)) &&
      semRotulo.length === 0 &&
      naoColuna.length === 0,
    `possíveis: ${[...possiveis].join(", ")} | sem rótulo: ${semRotulo.join(", ")} | fora das colunas: ${naoColuna.join(", ")}`,
  );
  afirmar(
    "e `fraseDoQueFalta` diz o RÓTULO de cada uma, nunca a chave crua",
    [...possiveis].every((c) => frase.includes(regrasDaVaga.ROTULOS_DOS_CAMPOS[c])) &&
      ![...possiveis].some((c) => c.includes("_") && frase.includes(c)),
    frase,
  );
}

/* O TRANSPORTE de Carreiras (revisão da 5.3), executado com `buscar` de
   mentira que CONTA as idas à rede. Recusa local é `dados_invalidos` (nunca
   `rede`, que mandaria esperar), e não sai pedido nenhum. */
{
  const { criarAcesso } = await import(urlDe("api/_nucleo/acesso.js"));
  const { classificar } = nucleoDoPost;
  const idas = [];
  let respostaDaRede = () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  const acesso = criarAcesso({
    url: "http://transporte.invalido",
    chavePublicavel: "sb_publishable_transporte",
    chaveDeServico: "sb_secret_transporte",
    buscar: async (endereco, opcoes) => {
      idas.push({ endereco, metodo: opcoes?.method ?? "GET" });
      return respostaDaRede();
    },
  });
  const UM = "11111111-1111-4111-8111-111111111111";
  const RECUSAS_LOCAIS = [
    ["lerVaga com id torto", () => acesso.lerVaga("nao-e-uuid")],
    ["atualizarVaga com id torto", () => acesso.atualizarVaga("x", { titulo: "t" })],
    ["excluirVaga com id torto", () => acesso.excluirVaga("")],
    ["lerClassificacao com lista fora do vocabulário", () => acesso.lerClassificacao("cargos", UM)],
    ["contarVagasDaClassificacao com id torto", () => acesso.contarVagasDaClassificacao("nivel", "x")],
    ["inserirVaga com campos vazios", () => acesso.inserirVaga({})],
    ["inserirVaga com campos nulos", () => acesso.inserirVaga(null)],
    ["atualizarVaga com campos vazios", () => acesso.atualizarVaga(UM, {})],
    ["atualizarVaga com lista no lugar dos campos", () => acesso.atualizarVaga(UM, ["titulo"])],
    ["inserirClassificacao com campos vazios", () => acesso.inserirClassificacao("nivel", {})],
    ["atualizarClassificacao com campos vazios", () => acesso.atualizarClassificacao("departamento", UM, {})],
    ["vagaPorSlug com slug torto", () => acesso.vagaPorSlug("Com Espaço")],
    ["vagaPorSlug com slug vazio", () => acesso.vagaPorSlug("")],
    ["vagaPorSlug com slug nulo", () => acesso.vagaPorSlug(null)],
  ];
  const erradas = [];
  for (const [nome, chamar] of RECUSAS_LOCAIS) {
    acesso.reiniciarPrazo();
    const antes = idas.length;
    const r = await chamar();
    const tipo = r?.ok === false ? classificar(r) : "aceitou";
    if (tipo !== "dados_invalidos" || idas.length !== antes) erradas.push(`${nome}: ${tipo}, ${idas.length - antes} ida(s)`);
  }
  afirmar(
    "recusas locais do transporte (id torto, lista fora do vocabulário, campos vazios, slug torto) são `dados_invalidos` e NÃO vão à rede",
    erradas.length === 0,
    erradas.join(" | "),
  );
  const antesDoSlug = idas.length;
  acesso.reiniciarPrazo();
  const slugBom = await acesso.vagaPorSlug("vaga-boa");
  afirmar(
    "controle: um slug no formato vai à rede (a recusa acima é do formato, e não de toda busca)",
    slugBom.ok === true && idas.length === antesDoSlug + 1 && /[?&]slug=eq\.vaga-boa(&|$)/.test(idas.at(-1)?.endereco ?? ""),
    `${idas.length - antesDoSlug} ida(s) ${idas.at(-1)?.endereco ?? ""}`,
  );
  acesso.reiniciarPrazo();
  respostaDaRede = () => new Response(JSON.stringify([{ id: UM, nome: "Pleno" }]), { status: 200 });
  const lista = await acesso.listarNomesDaClassificacao("nivel");
  const enderecoDaLista = idas.at(-1)?.endereco ?? "";
  acesso.reiniciarPrazo();
  respostaDaRede = () => new Response(JSON.stringify({ id: UM, nome: "Pleno" }), { status: 200 });
  const naoLista = await acesso.listarNomesDaClassificacao("nivel");
  afirmar(
    "`listarNomesDaClassificacao` pede com limite EXPLÍCITO (`limit=1000`) e só aceita LISTA: um objeto no lugar é falha, nunca \"nenhum nome\"",
    lista.ok === true &&
      Array.isArray(lista.dados) &&
      /[?&]limit=1000(&|$)/.test(enderecoDaLista) &&
      naoLista.ok === false &&
      naoLista.dados === null,
    `${enderecoDaLista} | ${JSON.stringify({ ok: naoLista.ok, codigo: naoLista.codigo })}`,
  );
}

/* ─── (l) O cliente do Painel e as regras estáticas da escrita ───────────── */

secao("(l) o cliente do Painel (`src/data/carreiras/escrita.js`) e as regras estáticas da escrita");

{
  let cliente = null;
  try {
    cliente = await import(urlDe("src/data/carreiras/escrita.js"));
  } catch (erro) {
    afirmar("src/data/carreiras/escrita.js importa", false, erro.message);
  }
  const fonteDoCliente = semComentarios(ler("src/data/carreiras/escrita.js") ?? "");
  afirmar(
    "o cliente conhece SÓ a rota nova: `\"/api/carreiras\"`, e nunca `/api/posts`",
    cliente?.ROTA_DA_ESCRITA_DE_CARREIRAS === "/api/carreiras" &&
      /["'`]\/api\/carreiras["'`]/.test(fonteDoCliente) &&
      !/\/api\/posts/.test(fonteDoCliente),
  );
  afirmar(
    "o cliente não importa `data/blog/escrita.js` (as frases de lá são de post)",
    !origensDeImport(fonteDoCliente).some((o) => /blog\/escrita(\.js)?$/.test(o)) &&
      origensDeImport(fonteDoCliente).length > 0,
    origensDeImport(fonteDoCliente).join(", "),
  );
  afirmar(
    "o cliente não escreve pelo banco: nenhum `.from(`, `.rpc(`, `.insert(`, `.update(`, `.upsert(` ou `.delete(`",
    !/\.(from|rpc|insert|update|upsert|delete)\s*\(/.test(fonteDoCliente),
  );
  if (cliente !== null) {
    afirmar(
      "os tipos de erro do cliente são EXATAMENTE os do servidor, na mesma ordem",
      igual([...cliente.TIPOS_DE_ERRO_DA_ESCRITA_DE_CARREIRAS], [...nucleoDoPost.TIPOS_DE_ERRO]) &&
        cliente.ERRO_DADOS_INVALIDOS === nucleoDoPost.ERRO_DADOS_INVALIDOS &&
        cliente.ERRO_CONFLITO === nucleoDoPost.ERRO_CONFLITO,
      `cliente: ${cliente.TIPOS_DE_ERRO_DA_ESCRITA_DE_CARREIRAS.join(", ")} | servidor: ${nucleoDoPost.TIPOS_DE_ERRO.join(", ")}`,
    );
    afirmar(
      "cada operação do vocabulário tem frase própria no cliente, e nenhuma a mais",
      igual(ordenado(cliente.OPERACOES_COM_FRASE), ordenado(operacoesDeCarreiras.OPERACOES_DE_CARREIRAS)),
      cliente.OPERACOES_COM_FRASE.join(", "),
    );
    const ruins = [];
    for (const operacao of operacoesDeCarreiras.OPERACOES_DE_CARREIRAS) {
      for (const tipo of cliente.TIPOS_DE_ERRO_DA_ESCRITA_DE_CARREIRAS) {
        const f = cliente.fraseDaEscritaDeCarreiras(operacao, tipo);
        if (!fraseDeCarreirasBoa(f)) ruins.push(`${operacao}/${tipo}: ${f}`);
      }
    }
    afirmar(
      "as frases do cliente, em toda combinação de operação e tipo, não falam de post, não têm travessão e não são vagas",
      ruins.length === 0,
      ruins.slice(0, 4).join(" | "),
    );

    /* O PEDIDO QUE SAIRIA, observado pela costura `buscar`. */
    const pedidos = [];
    const buscarQueResponde = (status, corpo) => async (rota, opcoes) => {
      pedidos.push({ rota, opcoes, corpo: JSON.parse(opcoes.body) });
      return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => (corpo === undefined ? "" : JSON.stringify(corpo)),
      };
    };
    const obterToken = async () => ({ ok: true, dados: "token-do-painel" });
    const UM = "11111111-1111-4111-8111-111111111111";
    const sucessoDoServidor = { ok: true, dados: { operacao: "x" } };

    const salvo = await cliente.salvarVaga({ titulo: "t", operacao: "excluirVaga" }, { id: UM, buscar: buscarQueResponde(200, sucessoDoServidor), obterToken });
    const ultimo = pedidos.at(-1);
    afirmar(
      "salvarVaga vai por POST à rota nova, com o token no cabeçalho, e a operação é a do cliente (a do corpo não escolhe)",
      salvo.ok === true &&
        ultimo.rota === "/api/carreiras" &&
        ultimo.opcoes.method === "POST" &&
        ultimo.opcoes.headers.Authorization === "Bearer token-do-painel" &&
        ultimo.corpo.operacao === "salvarVaga" &&
        ultimo.corpo.id === UM,
      JSON.stringify(ultimo?.corpo ?? {}),
    );
    await cliente.mudarEstadoDaVaga(UM, "abrir", { buscar: buscarQueResponde(200, sucessoDoServidor), obterToken });
    await cliente.excluirVaga(UM, { buscar: buscarQueResponde(200, sucessoDoServidor), obterToken });
    await cliente.salvarClassificacao("departamento", { nome: "Jurídico" }, { buscar: buscarQueResponde(201, sucessoDoServidor), obterToken });
    await cliente.excluirClassificacao("nivel", UM, { buscar: buscarQueResponde(200, sucessoDoServidor), obterToken });
    afirmar(
      "as cinco funções mandam a SUA operação, com os campos certos (`acao`, `lista`, `id`)",
      igual(
        pedidos.slice(-4).map((p) => [p.corpo.operacao, p.corpo.acao ?? null, p.corpo.lista ?? null, p.corpo.id ?? null]),
        [
          ["mudarEstadoDaVaga", "abrir", null, UM],
          ["excluirVaga", null, null, UM],
          ["salvarClassificacao", null, "departamento", null],
          ["excluirClassificacao", null, "nivel", UM],
        ],
      ),
      JSON.stringify(pedidos.slice(-4).map((p) => p.corpo)),
    );
    const antes = pedidos.length;
    const tortos = [
      await cliente.salvarVaga({}, { id: "x", buscar: buscarQueResponde(200, sucessoDoServidor), obterToken }),
      await cliente.mudarEstadoDaVaga("x", "abrir", { buscar: buscarQueResponde(200, sucessoDoServidor), obterToken }),
      await cliente.excluirVaga(null, { buscar: buscarQueResponde(200, sucessoDoServidor), obterToken }),
      await cliente.excluirClassificacao("nivel", "x", { buscar: buscarQueResponde(200, sucessoDoServidor), obterToken }),
    ];
    afirmar(
      "id torto é recusado ANTES da rede, como `dados_invalidos` (nunca `nao_encontrado`)",
      tortos.every((r) => r.ok === false && r.erro.tipo === "dados_invalidos") && pedidos.length === antes,
    );
    const doServidor = await cliente.excluirClassificacao("departamento", UM, {
      buscar: buscarQueResponde(409, { ok: false, erro: { tipo: "conflito", mensagem: "Não dá para excluir o Departamento “X”: em uso por 1 vaga." } }),
      obterToken,
    });
    const cincoZeroZero = await cliente.excluirVaga(UM, { buscar: buscarQueResponde(502, undefined), obterToken });
    const rotaAusente = await cliente.salvarVaga({ titulo: "t" }, { buscar: buscarQueResponde(404, undefined), obterToken });
    let lancou = false;
    let redeFora = null;
    try {
      redeFora = await cliente.salvarVaga({ titulo: "t" }, {
        buscar: async () => {
          throw new TypeError("fetch failed");
        },
        obterToken,
      });
    } catch {
      lancou = true;
    }
    afirmar(
      "a frase do servidor atravessa; sem ela, a frase é da OPERAÇÃO (5xx e rede), e a rota ausente diz que a função não respondeu; nada lança",
      doServidor.ok === false &&
        doServidor.erro.tipo === "conflito" &&
        /em uso por 1 vaga/.test(doServidor.erro.mensagem) &&
        cincoZeroZero.erro?.tipo === "rede" &&
        /excluir a vaga/.test(cincoZeroZero.erro.mensagem) &&
        rotaAusente.erro?.tipo === "configuracao" &&
        /\/api\/carreiras/.test(rotaAusente.erro.mensagem) &&
        !lancou &&
        redeFora?.erro?.tipo === "rede" &&
        /salvar a vaga/.test(redeFora.erro.mensagem),
      `${cincoZeroZero.erro?.mensagem} | ${rotaAusente.erro?.mensagem} | ${redeFora?.erro?.mensagem}`,
    );
    const semSessao = await cliente.excluirVaga(UM, {
      buscar: buscarQueResponde(200, sucessoDoServidor),
      obterToken: async () => ({ ok: false, erro: { tipo: "permissao", mensagem: "Esta leitura exige uma sessão válida. Entre no Painel e tente de novo." } }),
    });
    afirmar(
      "sem sessão, a frase genérica da LEITURA é trocada pela da operação",
      semSessao.ok === false && semSessao.erro.tipo === "permissao" && /excluir a vaga/.test(semSessao.erro.mensagem),
      semSessao.erro?.mensagem,
    );
  }

  /* NENHUM TRAVESSÃO fora de comentário nos arquivos novos da 5.3. */
  const NOVOS = [
    "api/carreiras.js",
    "api/_nucleo/operacoesDaVaga.js",
    "api/_nucleo/operacoesDaClassificacao.js",
    "src/data/carreiras/escrita.js",
    "src/domain/carreiras/operacoes.js",
  ];
  const comTravessao = NOVOS.filter((a) => (semComentarios(ler(a) ?? "—")).includes("—"));
  afirmar(
    "nenhum travessão fora de comentário nos arquivos novos da escrita de Carreiras",
    comTravessao.length === 0,
    comTravessao.join(", "),
  );
  /* O invólucro REUSA as peças do de posts pelo mesmo objeto, e a lógica de
     escrita não usa a tradução de erro de post. */
  const involucro = semComentarios(ler("api/carreiras.js") ?? "");
  afirmar(
    "o invólucro importa de `api/posts.js` o código HTTP, o token do cabeçalho, o corpo e a resposta sem `detalhe`, em vez de copiá-los",
    /import\s*\{[^}]*\bCODIGO_HTTP\b[^}]*\bcorpoComoObjeto\b[^}]*\brespostaDeErro\b[^}]*\btokenDoCabecalho\b[^}]*\}\s*from\s*["']\.\/posts\.js["']/.test(involucro) &&
      !/function\s+(respostaDeErro|tokenDoCabecalho|corpoComoObjeto)\b/.test(involucro),
  );
  const nucleos = ["api/_nucleo/operacoesDaVaga.js", "api/_nucleo/operacoesDaClassificacao.js"].map((a) => semComentarios(ler(a) ?? ""));
  afirmar(
    "as operações de Carreiras não usam `falhaDaEscrita` (a de post) nem a frase padrão do núcleo",
    nucleos.every((t) => !/\bfalhaDaEscrita\s*\(/.test(t)),
  );
  const funcoesNaApi = existsSync(path.join(raiz, "api"))
    ? readdirSync(path.join(raiz, "api")).filter((n) => /\.(js|mjs|ts)$/.test(n))
    : [];
  afirmar(
    "`api/` continua dentro do teto de 12 funções do plano",
    funcoesNaApi.length > 0 && funcoesNaApi.length <= 12,
    `${funcoesNaApi.length}: ${funcoesNaApi.join(", ")}`,
  );
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

  /* — A máquina de estados no banco (Story 5.3), pela DEFINIÇÃO — */
  const maquina = await consulta(
    `select pg_get_triggerdef(t.oid) as def, t.tgenabled as ligado,
            p.prosecdef as definer, coalesce(array_to_string(p.proconfig, ','), '') as cfg,
            (select l.lanname from pg_language l where l.oid = p.prolang) as linguagem,
            has_function_privilege('anon', p.oid, 'execute') as anon,
            has_function_privilege('authenticated', p.oid, 'execute') as auth,
            exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as publico,
            p.proacl is null as acl_padrao
       from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'vagas' and t.tgname = ${literal(GATILHO_DA_MAQUINA)}`,
    "o gatilho da máquina de estados",
  );
  const m = maquina.linha ?? {};
  afirmar(
    "o gatilho `vagas_maquina_de_estados` existe, ligado, BEFORE INSERT, UPDATE e DELETE, por linha, sobre `vagas_respeitam_a_maquina()`",
    /^CREATE TRIGGER vagas_maquina_de_estados BEFORE /.test(m.def ?? "") &&
      ["INSERT", "UPDATE", "DELETE"].every((e) => new RegExp(`\\b${e}\\b`).test((m.def ?? "").split(" ON ")[0])) &&
      / ON public\.vagas FOR EACH ROW EXECUTE FUNCTION (public\.)?vagas_respeitam_a_maquina\(\)$/.test(m.def ?? "") &&
      m.ligado === "O",
    `${m.def ?? "ausente"} (ligado: ${m.ligado ?? "?"})`,
  );
  afirmar(
    "e a função dele é plpgsql, `security invoker`, com `search_path` fixo, e NÃO executável por anon, authenticated nem public",
    m.linguagem === "plpgsql" &&
      m.definer === false &&
      /search_path=/.test(m.cfg ?? "") &&
      m.anon === false &&
      m.auth === false &&
      m.publico === false &&
      m.acl_padrao === false,
    JSON.stringify({ ...m, def: undefined }),
  );

  /* — O gatilho do truncate (revisão da 5.3, 20260924160000) — */
  const doTruncate = await consulta(
    `select pg_get_triggerdef(t.oid) as def, t.tgenabled as ligado,
            p.prosecdef as definer, coalesce(array_to_string(p.proconfig, ','), '') as cfg,
            (select l.lanname from pg_language l where l.oid = p.prolang) as linguagem,
            has_function_privilege('anon', p.oid, 'execute') as anon,
            has_function_privilege('authenticated', p.oid, 'execute') as auth,
            exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as publico,
            p.proacl is null as acl_padrao
       from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'vagas' and t.tgname = ${literal(GATILHO_DO_TRUNCATE)}`,
    "o gatilho do truncate",
  );
  const tt = doTruncate.linha ?? {};
  afirmar(
    "o gatilho `vagas_maquina_de_estados_no_truncate` existe, ligado, BEFORE TRUNCATE, por INSTRUÇÃO, sobre `vagas_truncate_respeita_a_maquina()`",
    /^CREATE TRIGGER vagas_maquina_de_estados_no_truncate BEFORE TRUNCATE ON public\.vagas FOR EACH STATEMENT EXECUTE FUNCTION (public\.)?vagas_truncate_respeita_a_maquina\(\)$/.test(
      tt.def ?? "",
    ) && tt.ligado === "O",
    `${tt.def ?? "ausente"} (ligado: ${tt.ligado ?? "?"})`,
  );
  afirmar(
    "e a função dele é plpgsql, `security invoker`, com `search_path` fixo, e NÃO executável por anon, authenticated nem public",
    tt.linguagem === "plpgsql" &&
      tt.definer === false &&
      /search_path=/.test(tt.cfg ?? "") &&
      tt.anon === false &&
      tt.auth === false &&
      tt.publico === false &&
      tt.acl_padrao === false,
    JSON.stringify({ ...tt, def: undefined }),
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
 *
 * TROCA REGISTRADA (Story 5.3): as Vagas eram inseridas já `aberta` e
 * `encerrada`, e o gatilho `vagas_maquina_de_estados` passou a recusar isso
 * (uma Vaga nasce Rascunho). Agora as cinco nascem Rascunho, e três seguem
 * pela máquina com `update`: abrir (com o `aberta_em` explícito da primeira
 * abertura, que dá a cada Aberta uma data distinta) e, a Encerrada, encerrar.
 * Os dois Rascunhos não são tocados depois de inseridos, e continuam com o
 * `atualizado_em` no passado que a asserção do gatilho de tempo usa.
 *
 * TROCA REGISTRADA (revisão da 5.3): a migração 20260924160000 passou a
 * RECUSAR `aberta_em` enviado na primeira abertura. As três Vagas abrem pela
 * máquina, sem data (o banco grava `now()`), e a data distinta de cada uma é
 * ajustada com o gatilho DESLIGADO, dentro da mesma transação desfeita, e
 * religado logo depois: o resto da matriz roda com ele ligado.
 */
function fixture() {
  const DOC = literal(JSON.stringify(DOC_VALIDO));
  const HTML = literal(HTML_VALIDO);
  const linha = (sufixo, titulo, dep, modalidade, localizacao, resumo, link, dias) =>
    `(${literal(slugDe(sufixo))}, ${literal(titulo)}, ${literal(dep)}, ${modalidade === null ? "null" : literal(modalidade)}, ${literal(localizacao)}, ${literal(resumo)}, ${link === null ? "null" : literal(link)}, ${dias === null ? "null" : dias})`;
  return `
    insert into public.departamentos (nome, cor, ordem, atualizado_em) values
      (${literal(NOME_OP)}, 'var(--categoria-ciano-bg)', 900, now() - interval '3 days'),
      (${literal(NOME_TEC)}, 'var(--categoria-azul-bg)', 901, now() - interval '3 days');
    insert into public.tipos_de_vaga (nome, equivalente_jobposting, ordem, atualizado_em) values
      (${literal(NOME_TIPO)}, 'FULL_TIME', 900, now() - interval '3 days');
    insert into public.niveis (nome, cor, ordem, atualizado_em) values
      (${literal(NOME_NIVEL)}, 'var(--categoria-verde-bg)', 900, now() - interval '3 days');
    create temp table fixture_das_vagas on commit drop as
    select * from (values
        ${linha("rascunho", "Rascunho de verificação", NOME_OP, null, "", "", null, null)},
        ${linha("rascunho-tec", "Outro rascunho de verificação", NOME_TEC, null, "", "", null, null)},
        ${linha("aberta", "Aberta de verificação", NOME_OP, "presencial", "Natal, RN", "Resumo da aberta.", "https://exemplo.com/vaga", 2)},
        ${linha("aberta-nova", "Aberta mais nova de verificação", NOME_TEC, "remoto", "", "Resumo da nova.", "https://exemplo.com/nova", 1)},
        ${linha("encerrada", "Encerrada de verificação", NOME_OP, "presencial", "Natal, RN", "Resumo da encerrada.", "https://exemplo.com/fim", 5)}
      ) as v(slug, titulo, dep, modalidade, localizacao, resumo, link, dias);
    insert into public.vagas (slug, titulo, departamento_id, tipo_id, nivel_id, modalidade,
                              localizacao, resumo, descricao, descricao_html, link_de_candidatura,
                              atualizado_em)
    select v.slug, v.titulo,
           (select d.id from public.departamentos d where d.nome = v.dep),
           (select x.id from public.tipos_de_vaga x where x.nome = ${literal(NOME_TIPO)}),
           (select n.id from public.niveis n where n.nome = ${literal(NOME_NIVEL)}),
           v.modalidade, v.localizacao, v.resumo, ${DOC}::jsonb, ${HTML}, v.link,
           now() - interval '3 days'
      from pg_temp.fixture_das_vagas v;
    update public.vagas x set estado = 'aberta'
      from pg_temp.fixture_das_vagas v
     where x.slug = v.slug and v.dias is not null;
    alter table public.vagas disable trigger ${GATILHO_DA_MAQUINA};
    update public.vagas x set aberta_em = now() - make_interval(days => v.dias)
      from pg_temp.fixture_das_vagas v
     where x.slug = v.slug and v.dias is not null;
    alter table public.vagas enable trigger ${GATILHO_DA_MAQUINA};
    update public.vagas set estado = 'encerrada' where slug = ${literal(slugDe("encerrada"))};`;
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
      /* TROCA REGISTRADA (revisão da 5.3): o comando mandava `aberta_em =
         now()`, que 20260924160000 recusa. Agora abre sem data, e quem a
         grava é o banco; a recusa esperada continua sendo a do CHECK. */
      const r = await desfeito(`${fixture()}
        update public.vagas set estado = 'aberta',
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
    /* TROCA REGISTRADA (Story 5.3): `rascunho -> encerrada` era recusado pelo
       CHECK `vagas_aberta_em_obrigatorio`. Agora o gatilho da máquina recusa
       ANTES (a transição não existe), e a asserção passa a julgar as duas
       defesas: com o gatilho, a recusa é dele; com o gatilho DESLIGADO dentro
       da transação desfeita, o CHECK continua recusando sozinho. */
    const semData = await desfeito(`${fixture()}
      update public.vagas set estado = 'encerrada' where slug = ${literal(slugDe("rascunho-tec"))};`);
    afirmar(
      "sair do Rascunho direto para Encerrada é recusado pelo gatilho `vagas_maquina_de_estados`",
      recusouPor(semData, GATILHO_DA_MAQUINA),
      semData.erro ?? "aceitou",
    );
    const semDataSemGatilho = await desfeito(`${fixture()}
      alter table public.vagas disable trigger ${GATILHO_DA_MAQUINA};
      update public.vagas set estado = 'encerrada' where slug = ${literal(slugDe("rascunho-tec"))};`);
    afirmar(
      "e, com o gatilho desligado (em transação desfeita), o CHECK `vagas_aberta_em_obrigatorio` ainda recusa sair do Rascunho sem `aberta_em`",
      recusouPor(semDataSemGatilho, "vagas_aberta_em_obrigatorio"),
      semDataSemGatilho.erro ?? "aceitou",
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

/* ─── (j) O gatilho da máquina de estados, em transação desfeita ─────────── */

secao("(j) o gatilho `vagas_maquina_de_estados`, em transação desfeita (Story 5.3)");

/**
 * Roda UM comando sobre a matriz, como o papel dado, e diz o que o banco
 * respondeu: `aceito` ou o SQLSTATE com a mensagem. O comando roda dentro de
 * um bloco com exceção, que o isola num ponto de salvamento: a leitura que
 * vem depois (`leitura`) enxerga o estado da tabela depois do comando.
 * Tudo é desfeito no fim. O resultado viaja por uma configuração local da
 * transação, que qualquer papel pode escrever.
 */
async function tentarNoBanco({ comando, papel = "service_role", preparo = "", leitura = "null::text" }) {
  const r = await desfeito(`${fixture()}
    ${preparo}
    ${papel === "postgres" ? "" : `set local role ${papel};`}
    do $verificacao$
    begin
      begin
        ${comando};
        perform set_config('verificacao.resultado', 'aceito', true);
      exception when others then
        perform set_config('verificacao.resultado', sqlstate || '|' || sqlerrm, true);
      end;
    end
    $verificacao$;
    select current_setting('verificacao.resultado', true) as resultado, (${leitura})::text as leitura;`);
  if (!r.ok) return { ok: false, erro: r.erro, resultado: null, leitura: null };
  return { ok: true, resultado: r.dados?.[0]?.resultado ?? null, leitura: r.dados?.[0]?.leitura ?? null };
}

/** Recusado pelo gatilho: SQLSTATE 23514 e o nome dele na mensagem. */
const recusadoPelaMaquina = (r) =>
  r.ok === true && typeof r.resultado === "string" && r.resultado.startsWith("23514|") && r.resultado.includes(`${GATILHO_DA_MAQUINA}:`);

if (temToken) {
  const vaga = (sufixo) => literal(slugDe(sufixo));
  const doTesteComum = `(select d.id from public.departamentos d where d.nome = ${literal(NOME_OP)}),
           (select x.id from public.tipos_de_vaga x where x.nome = ${literal(NOME_TIPO)}),
           (select n.id from public.niveis n where n.nome = ${literal(NOME_NIVEL)})`;
  const RECUSAS = [
    [
      "inserir uma Vaga já `aberta` (completa), como service_role",
      `insert into public.vagas (slug, titulo, estado, departamento_id, tipo_id, nivel_id, modalidade, localizacao, resumo,
                                 descricao, descricao_html, link_de_candidatura, aberta_em)
       select ${vaga("direta")}, 'Aberta direta', 'aberta', ${doTesteComum}, 'remoto', '', 'Resumo.',
              ${literal(JSON.stringify(DOC_VALIDO))}::jsonb, ${literal(HTML_VALIDO)}, 'https://exemplo.com/v', now()`,
      "service_role",
    ],
    [
      "inserir uma Vaga já `aberta`, como postgres (o SQL manual também esbarra)",
      `insert into public.vagas (slug, titulo, estado, departamento_id, tipo_id, nivel_id, modalidade, localizacao, resumo,
                                 descricao, descricao_html, link_de_candidatura, aberta_em)
       select ${vaga("direta-manual")}, 'Aberta direta', 'aberta', ${doTesteComum}, 'remoto', '', 'Resumo.',
              ${literal(JSON.stringify(DOC_VALIDO))}::jsonb, ${literal(HTML_VALIDO)}, 'https://exemplo.com/v', now()`,
      "postgres",
    ],
    [
      "inserir um Rascunho com `aberta_em`",
      `insert into public.vagas (slug, titulo, departamento_id, tipo_id, nivel_id, aberta_em)
       select ${vaga("rascunho-datado")}, 'Rascunho datado', ${doTesteComum}, now()`,
      "service_role",
    ],
    ["`aberta -> rascunho`", `update public.vagas set estado = 'rascunho' where slug = ${vaga("aberta")}`, "service_role"],
    ["`encerrada -> rascunho`", `update public.vagas set estado = 'rascunho' where slug = ${vaga("encerrada")}`, "service_role"],
    ["`rascunho -> encerrada`", `update public.vagas set estado = 'encerrada' where slug = ${vaga("rascunho")}`, "service_role"],
    ["excluir uma Aberta", `delete from public.vagas where slug = ${vaga("aberta")}`, "service_role"],
    ["mudar `aberta_em` de uma Aberta", `update public.vagas set aberta_em = now() where slug = ${vaga("aberta")}`, "service_role"],
    ["apagar `aberta_em` de uma Encerrada", `update public.vagas set aberta_em = null where slug = ${vaga("encerrada")}`, "service_role"],
    ["mudar o `slug` de uma Aberta", `update public.vagas set slug = ${vaga("outro-endereco")} where slug = ${vaga("aberta")}`, "service_role"],
    ["mudar o `slug` de uma Encerrada", `update public.vagas set slug = ${vaga("outro-endereco")} where slug = ${vaga("encerrada")}`, "service_role"],
    ["dar `aberta_em` a um Rascunho que continua Rascunho", `update public.vagas set aberta_em = now() where slug = ${vaga("rascunho")}`, "service_role"],
  ];
  const naoRecusadas = [];
  for (const [nome, comando, papel] of RECUSAS) {
    const r = await tentarNoBanco({ comando, papel });
    if (!recusadoPelaMaquina(r)) naoRecusadas.push(`${nome}: ${r.ok ? r.resultado : `falhou: ${String(r.erro).slice(0, 80)}`}`);
  }
  afirmar(
    "o banco RECUSA, com 23514 e `vagas_maquina_de_estados`: inserir Aberta (como service_role e como postgres), Rascunho com data, `aberta -> rascunho`, `encerrada -> rascunho`, `rascunho -> encerrada`, excluir Aberta, mudar `aberta_em` ou `slug` depois de aberta, e dar data a um Rascunho",
    naoRecusadas.length === 0,
    naoRecusadas.join(" | "),
  );

  /* O QUE A MÁQUINA PERMITE, e o que ela faz com `aberta_em`. */
  const completar = `update public.vagas set modalidade = 'presencial', localizacao = 'Natal, RN', resumo = 'Resumo.',
                            link_de_candidatura = 'https://exemplo.com/v' where slug = ${vaga("rascunho")};`;
  const abrir = await tentarNoBanco({
    preparo: completar,
    comando: `update public.vagas set estado = 'aberta' where slug = ${vaga("rascunho")}`,
    leitura: `select v.estado::text || '|' || (v.aberta_em = now())::text from public.vagas v where v.slug = ${vaga("rascunho")}`,
  });
  afirmar(
    "abrir um Rascunho completo SEM mandar `aberta_em` é aceito, e o banco grava `aberta_em = now()`",
    abrir.ok && abrir.resultado === "aceito" && abrir.leitura === "aberta|true",
    `${abrir.resultado ?? abrir.erro} | ${abrir.leitura}`,
  );
  /* REVISÃO DA 5.3 (20260924160000): a primeira abertura com data enviada é
     RECUSADA, com o Rascunho COMPLETO, para a recusa não poder ser do CHECK
     do invariante. Sabotagem de banco: da sessão principal. */
  const inventada = [];
  for (const [nome, data] of [
    ["retroativa", "now() - interval '30 days'"],
    ["futura", "now() + interval '30 days'"],
    ["igual a agora", "now()"],
  ]) {
    const r = await tentarNoBanco({
      preparo: completar,
      comando: `update public.vagas set estado = 'aberta', aberta_em = ${data} where slug = ${vaga("rascunho")}`,
      leitura: `select v.estado::text || '|' || coalesce(v.aberta_em::text, 'sem data') from public.vagas v where v.slug = ${vaga("rascunho")}`,
    });
    if (!recusadoPelaMaquina(r) || !/^rascunho\|sem data$/.test(r.leitura ?? "")) {
      inventada.push(`${nome}: ${r.ok ? `${r.resultado} / ${r.leitura}` : String(r.erro).slice(0, 80)}`);
    }
  }
  afirmar(
    "abrir um Rascunho completo MANDANDO `aberta_em` (retroativa, futura ou igual a agora) é recusado com 23514 e `vagas_maquina_de_estados`, e a Vaga continua Rascunho sem data",
    inventada.length === 0,
    inventada.join(" | "),
  );

  /* O TRUNCATE (20260924160000): o gatilho de linha não dispara nele, e o de
     instrução recusa enquanto houver Vaga Aberta. A matriz tem duas Abertas.
     Sabotagem de banco: da sessão principal. */
  const truncar = await tentarNoBanco({
    papel: "postgres",
    comando: "truncate public.vagas",
    leitura: "select count(*) from public.vagas",
  });
  const cascata = await tentarNoBanco({
    papel: "postgres",
    comando: "truncate public.niveis cascade",
    leitura: "select count(*) from public.vagas",
  });
  afirmar(
    "`truncate public.vagas`, e o truncate em cascata de uma Classificação, são RECUSADOS com 23514 e `vagas_maquina_de_estados` enquanto há Vaga Aberta",
    recusadoPelaMaquina(truncar) &&
      Number(truncar.leitura) > 0 &&
      recusadoPelaMaquina(cascata) &&
      Number(cascata.leitura) > 0,
    `${truncar.resultado ?? truncar.erro} | ${cascata.resultado ?? cascata.erro}`,
  );
  const semAberta = await tentarNoBanco({
    papel: "postgres",
    preparo: "update public.vagas set estado = 'encerrada' where estado = 'aberta';",
    comando: "truncate public.vagas",
    leitura: "select count(*) from public.vagas",
  });
  afirmar(
    "controle: sem nenhuma Vaga Aberta (todas encerradas pela máquina, na transação desfeita), o truncate é ACEITO",
    semAberta.ok && semAberta.resultado === "aceito" && semAberta.leitura === "0",
    `${semAberta.resultado ?? semAberta.erro} | ${semAberta.leitura}`,
  );
  const reabrir = await tentarNoBanco({
    comando: `update public.vagas set estado = 'aberta' where slug = ${vaga("encerrada")}`,
    leitura: `select v.estado::text || '|' || (v.aberta_em = now() - interval '5 days')::text from public.vagas v where v.slug = ${vaga("encerrada")}`,
  });
  afirmar(
    "reabrir uma Encerrada é aceito, e `aberta_em` continua o ORIGINAL (o da primeira abertura, não o de agora)",
    reabrir.ok && reabrir.resultado === "aceito" && reabrir.leitura === "aberta|true",
    `${reabrir.resultado ?? reabrir.erro} | ${reabrir.leitura}`,
  );
  const encerrar = await tentarNoBanco({
    comando: `update public.vagas set estado = 'encerrada' where slug = ${vaga("aberta")}`,
    leitura: `select v.estado::text || '|' || (v.aberta_em = now() - interval '2 days')::text from public.vagas v where v.slug = ${vaga("aberta")}`,
  });
  afirmar(
    "encerrar uma Aberta é aceito, com `aberta_em` intacto",
    encerrar.ok && encerrar.resultado === "aceito" && encerrar.leitura === "encerrada|true",
    `${encerrar.resultado ?? encerrar.erro} | ${encerrar.leitura}`,
  );
  const ACEITOS = [
    ["editar o título de uma Aberta (sem mudar o Estado)", `update public.vagas set titulo = 'Retitulada' where slug = ${vaga("aberta")}`],
    ["mudar o `slug` de um Rascunho (nunca aberto)", `update public.vagas set slug = ${vaga("rascunho-renomeado")} where slug = ${vaga("rascunho")}`],
    ["excluir um Rascunho", `delete from public.vagas where slug = ${vaga("rascunho")}`],
    ["excluir uma Encerrada", `delete from public.vagas where slug = ${vaga("encerrada")}`],
    [
      "inserir um Rascunho sem Estado nem data",
      `insert into public.vagas (slug, titulo, departamento_id, tipo_id, nivel_id) select ${vaga("novo")}, 'Novo', ${doTesteComum}`,
    ],
  ];
  const recusadosIndevidos = [];
  for (const [nome, comando] of ACEITOS) {
    const r = await tentarNoBanco({ comando });
    if (!(r.ok && r.resultado === "aceito")) recusadosIndevidos.push(`${nome}: ${r.ok ? r.resultado : String(r.erro).slice(0, 80)}`);
  }
  afirmar(
    "e ACEITA o que a máquina permite: editar sem mudar de Estado, mudar o Slug de quem nunca abriu, excluir Rascunho e Encerrada, inserir Rascunho",
    recusadosIndevidos.length === 0,
    recusadosIndevidos.join(" | "),
  );
  /* CONTROLE do capturador: um comando que o banco recusa por OUTRA razão não
     pode aparecer como recusa da máquina. */
  const outraRazao = await tentarNoBanco({ comando: `update public.vagas set titulo = '   ' where slug = ${vaga("rascunho")}` });
  afirmar(
    "controle: a recusa de outra restrição (`vagas_titulo_valido`) é 23514 SEM o nome do gatilho, e não conta como recusa da máquina",
    outraRazao.ok && /^23514\|/.test(outraRazao.resultado ?? "") && !recusadoPelaMaquina(outraRazao),
    outraRazao.resultado ?? outraRazao.erro,
  );
} else {
  afirmar("o gatilho da máquina pôde ser exercido no banco", false, "sem SUPABASE_ACCESS_TOKEN");
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

/* ─── (k) A prova real em produção, só com Rascunho ──────────────────────── */

secao("(k) a escrita de verdade, em produção, SÓ com Rascunho (Story 5.3)");

/**
 * O handler de `api/carreiras.js`, executado com o ambiente de produção (a
 * chave de serviço pedida à Management API e mantida em MEMÓRIA, nunca em
 * arquivo) e o JWT de uma Conta temporária. Cobre criar, editar, Slug em
 * colisão, a recusa de Classificação em uso, excluir Rascunho e o CRUD das
 * três Classificações. NUNCA chama `abrir` nem `reabrir`: uma Vaga Aberta
 * confirmada apareceria em /carreiras, no mapa do site e no Google Vagas. O
 * caminho de abrir é provado no dublê (seção i) e no banco em transação
 * desfeita (seção j).
 */
const PREFIXO_DA_ESCRITA = "zzz-verificacao-5-3-";
if (temToken && moduloDoHandler !== null) {
  const handler = moduloDoHandler.default;
  const MARCA = `${PREFIXO_DA_ESCRITA}%`;
  const nonceK = randomUUID();
  const nome = (sufixo) => `${PREFIXO_DA_ESCRITA}${nonceK} ${sufixo}`;
  const emailK = `verificacao.carreiras+53-${nonceK}@chatclean.com.br`;
  const senhaK = `Vf-${nonceK.slice(0, 8)}-${Math.random().toString(36).slice(2, 10)}!aZ9`;
  registrarSegredo(senhaK);

  /* A LIMPEZA PRÉVIA, em comandos SEQUENCIAIS (revisão da 5.3). Eram CTEs
     irmãs num só comando: todas enxergam o MESMO instantâneo, então a Vaga
     apagada numa CTE ainda existe para a chave estrangeira `restrict` quando
     a CTE irmã apaga a Classificação dela, e a limpeza inteira caía com o
     resto que ela existia para tirar. Agora: as Vagas primeiro, depois as
     Classificações, depois as Contas, cada passo com o resultado do anterior
     já visível. */
  const passosDaLimpeza = [
    ["vagas", `with v as (delete from public.vagas where slug like ${literal(MARCA)} and estado <> 'aberta' returning 1) select count(*)::int as n from v`],
    [
      "classificações",
      `with d as (delete from public.departamentos where nome like ${literal(MARCA)} returning 1),
            x as (delete from public.tipos_de_vaga where nome like ${literal(MARCA)} returning 1),
            n as (delete from public.niveis where nome like ${literal(MARCA)} returning 1)
       select ((select count(*) from d) + (select count(*) from x) + (select count(*) from n))::int as n`,
    ],
    ["contas", `with u as (delete from auth.users where email like 'verificacao.carreiras+53-%@chatclean.com.br' returning 1) select count(*)::int as n from u`],
  ];
  let removidos = 0;
  const errosDaLimpeza = [];
  for (const [oQue, comando] of passosDaLimpeza) {
    const r = await executarSql(token, comando);
    if (r.ok) removidos += Number(r.dados?.[0]?.n ?? 0);
    else errosDaLimpeza.push(`${oQue}: ${r.erro}`);
  }
  afirmar(
    "nenhum resto da prova da escrita sobrou de execuções anteriores (limpeza em passos: Vagas, Classificações, Contas)",
    errosDaLimpeza.length === 0 && removidos === 0,
    errosDaLimpeza.length > 0 ? errosDaLimpeza.join(" | ") : `${removidos} linha(s) removida(s) agora`,
  );

  const chaves = await revelarChaves(token);
  const temChaves = afirmar(
    "a Management API revelou a chave publicável e a de serviço (mantidas só em memória)",
    chaves.ok === true && Boolean(chaves.publicavel) && Boolean(chaves.servico),
    chaves.ok ? "uma das chaves não veio" : (chaves.erro ?? ""),
  );

  try {
    if (temChaves) {
      registrarSegredo(chaves.servico);
      registrarSegredo(chaves.publicavel);
      const conta = await executarSql(token, sqlDeCriacaoDeConta({ email: emailK, senha: senhaK, nome: "Conta Temporária da Escrita de Carreiras" }));
      const contaCriada = afirmar("a Conta temporária da prova foi criada", conta.ok && Boolean(conta.dados?.[0]?.id), conta.erro ?? "");
      let jwt = null;
      let statusDoLogin = 0;
      if (contaCriada) {
        try {
          const r = await fetch(`${URL_PROJETO}/auth/v1/token?grant_type=password`, {
            method: "POST",
            signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: { apikey: chaves.publicavel, "Content-Type": "application/json" },
            body: JSON.stringify({ email: emailK, password: senhaK }),
          });
          statusDoLogin = r.status;
          jwt = (await r.json().catch(() => null))?.access_token ?? null;
        } catch {
          jwt = null;
        }
        if (jwt) registrarSegredo(jwt);
      }
      const PASSOS = [
        "prova real: as três Classificações de teste são criadas pela função (201 cada)",
        "prova real: um nome repetido com outra caixa e sem acento é recusado (409)",
        "prova real: criar um Rascunho (201), Estado rascunho, sem `aberta_em`, Slug derivado do título",
        "prova real: editar o Rascunho com Descrição suja grava sem a citação, e o descarte é relatado",
        "prova real: o Slug de outra Vaga é recusado (409), e nada é criado",
        "prova real: excluir um Departamento em uso é recusado (409, em uso por 1 vaga)",
        "prova real: `encerrar` um Rascunho é recusado pela máquina (422), sem abrir nada",
        "prova real: excluir o Rascunho (200), e ele sai do banco",
        "prova real: renomear um Nível e excluir as três Classificações (200)",
      ];
      if (statusDoLogin === 429) {
        for (const d of PASSOS) adiar(d, "o GoTrue respondeu 429 (limite de taxa): não é defeito, a asserção não pôde ser exercida agora");
      } else if (!jwt) {
        afirmar("a sessão da Conta temporária da prova foi aberta", false, `HTTP ${statusDoLogin}`);
      } else {
        const AMBIENTE_REAL = {
          SUPABASE_URL: URL_PROJETO,
          SUPABASE_CHAVE_PUBLICAVEL: chaves.publicavel,
          SUPABASE_CHAVE_DE_SERVICO: chaves.servico,
          VITE_SUPABASE_URL: undefined,
          VITE_SUPABASE_PUBLISHABLE_KEY: undefined,
        };
        const enviar = (corpo) =>
          dirigir(handler, { corpo, cabecalhos: { authorization: `Bearer ${jwt}` }, ambiente: AMBIENTE_REAL });
        const doBanco = async (sqlTexto) => (await consulta(sqlTexto, "leitura da prova")).linha;

        const dep = await enviar({ operacao: "salvarClassificacao", lista: "departamento", nome: nome("Departamento Ação"), cor: "var(--categoria-ciano-bg)", ordem: 900 });
        const tip = await enviar({ operacao: "salvarClassificacao", lista: "tipo", nome: nome("Tipo"), equivalente_jobposting: "FULL_TIME", ordem: 900 });
        const niv = await enviar({ operacao: "salvarClassificacao", lista: "nivel", nome: nome("Nível"), cor: "var(--categoria-verde-bg)", ordem: 900 });
        const idDe = (r) => r.corpo?.dados?.classificacao?.id ?? null;
        afirmar(
          PASSOS[0],
          [dep, tip, niv].every((r) => r.status === 201 && r.corpo?.dados?.criada === true && typeof idDe(r) === "string"),
          [dep, tip, niv].map((r) => `${r.status} ${r.corpo?.erro?.mensagem ?? ""}`).join(" | "),
        );
        const repetido = await enviar({ operacao: "salvarClassificacao", lista: "departamento", nome: nome("DEPARTAMENTO ACAO") });
        afirmar(
          PASSOS[1],
          repetido.status === 409 && repetido.corpo?.erro?.mensagem?.includes(nome("Departamento Ação")),
          `HTTP ${repetido.status} ${repetido.corpo?.erro?.mensagem ?? ""}`,
        );

        const titulo = nome("Vaga de prova");
        const criada = await enviar({ operacao: "salvarVaga", titulo, departamento_id: idDe(dep), tipo_id: idDe(tip), nivel_id: idDe(niv), estado: "aberta" });
        const vagaId = criada.corpo?.dados?.vaga?.id ?? null;
        const gravadaNoBanco = vagaId
          ? await doBanco(`select v.estado::text as estado, v.aberta_em, v.slug from public.vagas v where v.id = ${literal(vagaId)}`)
          : null;
        afirmar(
          PASSOS[2],
          criada.status === 201 &&
            gravadaNoBanco?.estado === "rascunho" &&
            gravadaNoBanco?.aberta_em === null &&
            gravadaNoBanco?.slug === regrasDaVaga.slugDaVaga(titulo).slug &&
            criada.corpo?.dados?.ignorados?.includes("estado"),
          `HTTP ${criada.status} ${criada.corpo?.erro?.mensagem ?? ""} | ${JSON.stringify(gravadaNoBanco)}`,
        );

        const editada = await enviar({
          operacao: "salvarVaga",
          id: vagaId,
          resumo: "Resumo da prova.",
          descricao: {
            type: "doc",
            content: [
              { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "citado" }] }] },
              { type: "paragraph", content: [{ type: "text", text: "Texto da prova." }] },
            ],
          },
        });
        const html = vagaId ? await doBanco(`select v.descricao_html as h from public.vagas v where v.id = ${literal(vagaId)}`) : null;
        afirmar(
          PASSOS[3],
          editada.status === 200 &&
            (editada.corpo?.dados?.descarte?.total ?? 0) >= 1 &&
            typeof html?.h === "string" &&
            html.h.includes("Texto da prova.") &&
            !/<blockquote/.test(html.h),
          `HTTP ${editada.status} ${editada.corpo?.erro?.mensagem ?? ""} | ${html?.h}`,
        );

        const colisao = await enviar({
          operacao: "salvarVaga",
          titulo: nome("Outra vaga"),
          slug: gravadaNoBanco?.slug,
          departamento_id: idDe(dep),
          tipo_id: idDe(tip),
          nivel_id: idDe(niv),
        });
        const quantas = await doBanco(`select count(*)::int as n from public.vagas where slug like ${literal(MARCA)}`);
        afirmar(PASSOS[4], colisao.status === 409 && quantas?.n === 1, `HTTP ${colisao.status} | vagas de teste: ${quantas?.n}`);

        const emUso = await enviar({ operacao: "excluirClassificacao", lista: "departamento", id: idDe(dep) });
        afirmar(PASSOS[5], emUso.status === 409 && /em uso por 1 vaga\b/i.test(emUso.corpo?.erro?.mensagem ?? ""), `HTTP ${emUso.status} ${emUso.corpo?.erro?.mensagem ?? ""}`);

        const encerrar = await enviar({ operacao: "mudarEstadoDaVaga", id: vagaId, acao: "encerrar" });
        const aindaRascunho = vagaId ? await doBanco(`select v.estado::text as estado from public.vagas v where v.id = ${literal(vagaId)}`) : null;
        afirmar(PASSOS[6], encerrar.status === 422 && aindaRascunho?.estado === "rascunho", `HTTP ${encerrar.status} | ${aindaRascunho?.estado}`);

        const excluida = await enviar({ operacao: "excluirVaga", id: vagaId });
        const sumiu = await doBanco(`select count(*)::int as n from public.vagas where slug like ${literal(MARCA)}`);
        afirmar(PASSOS[7], excluida.status === 200 && sumiu?.n === 0, `HTTP ${excluida.status} | restantes: ${sumiu?.n}`);

        const renomeado = await enviar({ operacao: "salvarClassificacao", lista: "nivel", id: idDe(niv), nome: nome("Nível Renomeado") });
        const apagadas = [
          await enviar({ operacao: "excluirClassificacao", lista: "departamento", id: idDe(dep) }),
          await enviar({ operacao: "excluirClassificacao", lista: "tipo", id: idDe(tip) }),
          await enviar({ operacao: "excluirClassificacao", lista: "nivel", id: idDe(niv) }),
        ];
        afirmar(
          PASSOS[8],
          renomeado.status === 200 &&
            renomeado.corpo?.dados?.classificacao?.nome === nome("Nível Renomeado") &&
            apagadas.every((r) => r.status === 200),
          `${renomeado.status} | ${apagadas.map((r) => `${r.status} ${r.corpo?.erro?.mensagem ?? ""}`).join(" | ")}`,
        );
      }
    }
  } finally {
    const remocao = await executarSql(token, sqlDeRemocaoDeConta(emailK));
    afirmar("limpeza da prova: a remoção da Conta temporária respondeu sem erro", remocao.ok, remocao.erro ?? "");
    const limpeza = await executarSql(
      token,
      `delete from public.vagas where slug like ${literal(MARCA)} and estado <> 'aberta';
       delete from public.departamentos where nome like ${literal(MARCA)};
       delete from public.tipos_de_vaga where nome like ${literal(MARCA)};
       delete from public.niveis where nome like ${literal(MARCA)};
       select
         (select count(*)::int from public.vagas where slug like ${literal(MARCA)})
         + (select count(*)::int from public.departamentos where nome like ${literal(MARCA)})
         + (select count(*)::int from public.tipos_de_vaga where nome like ${literal(MARCA)})
         + (select count(*)::int from public.niveis where nome like ${literal(MARCA)})
         + (select count(*)::int from auth.users where email = ${literal(emailK)}) as sobrou;`,
    );
    afirmar(
      "limpeza da prova: nada sobrou (Vagas, Classificações e a Conta), e nenhuma Vaga de teste está Aberta",
      limpeza.ok && limpeza.dados?.[0]?.sobrou === 0,
      limpeza.erro ?? `sobrou: ${JSON.stringify(limpeza.dados?.[0])}`,
    );
  }
} else {
  afirmar(
    "a prova real da escrita pôde ser exercida",
    false,
    temToken ? "api/carreiras.js não importou" : "sem SUPABASE_ACCESS_TOKEN",
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
       (select count(*)::int from public.vagas where estado = 'aberta' and slug like 'zzz-%') as abertas_de_teste,
       (select count(*)::int from public.vagas where slug like ${literal(`${PREFIXO_DA_ESCRITA}%`)})
         + (select count(*)::int from public.departamentos where nome like ${literal(`${PREFIXO_DA_ESCRITA}%`)})
         + (select count(*)::int from public.tipos_de_vaga where nome like ${literal(`${PREFIXO_DA_ESCRITA}%`)})
         + (select count(*)::int from public.niveis where nome like ${literal(`${PREFIXO_DA_ESCRITA}%`)}) as da_escrita`,
    "resíduo da verificação",
  );
  const campos = ["vagas", "departamentos", "tipos", "niveis", "contas", "abertas_de_teste", "da_escrita"];
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
