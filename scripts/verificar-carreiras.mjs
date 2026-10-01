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
 * Story 5.4 (o formulário de Vaga), todas LOCAIS, sem token:
 *
 *   (m) ESTÁTICA: a lista de permissão de imports de `src/admin/carreiras/**`
 *       (pelo apelido e pelo caminho relativo, com autoteste), os dados pelos
 *       apelidos exatos e as rotas novas em `main.jsx`;
 *   (n) NODE: `formulario.js`, a configuração da Descrição (os 7 controles da
 *       projeção, sem imagem nem destaque), o saneamento e as rotas;
 *   (o) MONTADA: `EditorDeVaga` compilado com dublês de
 *       `@/data/carreiras/leitura` e `@/data/carreiras/escrita` por apelido,
 *       num `MemoryRouter`, cobrindo a matriz de I/O da story.
 *
 * Story 5.5 (a aba Carreiras modular), LOCAL, sem token:
 *
 *   (p) o Carreiras antigo fora do repositório, a página só declarando a aba,
 *       `listagem.js` e a aparência da Cor executados no Node, e
 *       `AbaDeCarreiras`/`AdminBlog` montados com dublês cobrindo a matriz.
 *
 * Story 5.7 (o site público), LOCAL, sem token:
 *
 *   (r) `carreirasPublico.js` e as funções movidas para o domínio executados
 *       no Node; as regras estáticas das páginas (AD-8, dados só pelas duas
 *       leituras públicas, sem armazenamento, `<h1>` por tela, `.artigo`
 *       literal, a rota); e `Carreiras`/`VagaPublica` montadas com dublê de
 *       `@/data/carreiras/leitura` num `MemoryRouter`, cobrindo a matriz.
 *
 * Story 5.8 (a Vaga encontrável por máquina):
 *
 *   (s) LOCAL, o HTML Servido: o `JobPosting` puro executado; a leitura do
 *       servidor com `buscar` injetado; `api/carreiras.js` dirigido em GET,
 *       HEAD e método estranho contra um dublê de PostgREST, cobrindo a
 *       matriz (status, cache, etiquetas, metadados, `<noscript>` fora de
 *       `#root`, JSON-LD por Modalidade, escape, falha de leitura com o shell
 *       intacto, Slug torto sem rede); a ordem das reescritas de
 *       `vercel.json`. REMOTO, só com token: `/carreiras` e um Slug que não
 *       existe, contra o banco real, sem criar Vaga nenhuma.
 *
 * Story 5.9 (as Vagas no sitemap e no /llms.txt):
 *
 *   (t) LOCAL, `mapaDoSite` e `indiceParaLlms` contra textos escritos à mão
 *       (sem Vaga, o de hoje byte a byte); `api/sitemap.js`, `api/llms.js` e a
 *       listagem servida dirigidos contra um dublê que roteia pelo nome da
 *       função: com Vagas, sem Vagas, a falha das Vagas isolada (inclusive
 *       pendurada, com o prazo, e lançando), `no-store` na resposta degradada,
 *       as etiquetas, a dos Posts 500, as leituras em paralelo, o título
 *       escapado para Markdown e o mesmo conjunto de endereços nos três.
 *       REMOTO, só com token: as duas rotas contra o banco real.
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
import { LINK_DO_WHATSAPP } from "../src/domain/whatsapp.js";
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
  /* MIGRAÇÃO POSTERIOR QUE NÃO É DE CARREIRAS. Enquanto Carreiras foi a última
     frente a tocar o banco, "posterior à das landings" e "de Carreiras" eram a
     mesma coisa. Deixaram de ser quando o Blog ganhou a contagem de leituras.
     A lista é FECHADA e nomeada: migração nova que não esteja nem aqui nem em
     `MIGRACOES_DE_CARREIRAS` continua reprovando, que é o que a asserção
     existe para fazer. */
  const POSTERIORES_DE_OUTRAS_FRENTES = Object.freeze([
    "20261001180000_leituras_dos_posts.sql",
  ]);
  afirmar(
    "toda migração posterior nomeada como de outra frente existe na pasta — a lista não é decorativa",
    POSTERIORES_DE_OUTRAS_FRENTES.every((n) => posteriores.includes(n)),
    `na lista e fora da pasta: ${POSTERIORES_DE_OUTRAS_FRENTES.filter((n) => !posteriores.includes(n)).join(", ")}`,
  );
  const deCarreiras = posteriores.filter((n) => !POSTERIORES_DE_OUTRAS_FRENTES.includes(n));
  afirmar(
    "a lista de migrações de Carreiras cobre TODA migração posterior à das landings que não é de outra frente, e nada além",
    igual(deCarreiras, [...MIGRACOES_DE_CARREIRAS]),
    `na pasta: ${deCarreiras.join(", ") || "nenhuma"} | na lista: ${MIGRACOES_DE_CARREIRAS.join(", ")}`,
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
     `domain/blog`. Sem React, sem Supabase, sem rede, sem armazenamento.
     TROCA REGISTRADA (2026-09-29, merge da `main`): a lista de permissão
     ganhou `../whatsapp.js`, o único endereço de WhatsApp do site (uma
     constante), de onde `vaga.js` tira o link do currículo. */
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
      if (!((origem.startsWith("./") && !origem.includes("..")) || /^\.\.\/blog\/[a-z]+\.js$/i.test(origem) || origem === "../whatsapp.js")) {
        impuros.push(`${nome} → ${origem}`);
      }
    }
    if (/\b(fetch|localStorage|sessionStorage|window|document)\b/.test(texto)) impuros.push(`${nome}: rede/armazenamento/DOM`);
  }
  afirmar(
    "o domínio de Carreiras só importa de si mesmo, de `domain/blog` e de `domain/whatsapp.js`, e não toca rede, DOM nem armazenamento",
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
    /* TROCA REGISTRADA (Story 5.8): era "GET responde 405 com `Allow: POST`,
       sem ida ao banco". Desde a 5.8, GET e HEAD desta MESMA função servem a
       página (seção (s)); o método estranho continua 405 sem ida ao banco, e
       o `Allow` passou a listar os três métodos da rota, com `no-store`. */
    /* Revisão da 5.8: o `Allow` esperado vem da lista EXPORTADA, e uma
       asserção literal independente fixa que ela tem os três métodos (tirar
       HEAD dos dois lados não passa). */
    const METODOS_DA_ROTA = moduloDoHandler.METODOS_DE_CARREIRAS;
    afirmar(
      "`METODOS_DE_CARREIRAS` é exatamente GET, HEAD e POST, congelada",
      Array.isArray(METODOS_DA_ROTA) &&
        igual(ordenado(METODOS_DA_ROTA), ["GET", "HEAD", "POST"]) &&
        Object.isFrozen(METODOS_DA_ROTA),
      JSON.stringify(METODOS_DA_ROTA),
    );
    for (const metodo of ["PUT", "DELETE", "PATCH", "OPTIONS"]) {
      const n = marca();
      const r = await enviar({ operacao: "salvarVaga" }, { metodo });
      afirmar(
        `${metodo} responde 405 com \`Allow\` = os métodos da rota e \`no-store\`, sem ida ao banco`,
        r.status === 405 &&
          r.cabecalhos.Allow === (METODOS_DA_ROTA ?? []).join(", ") &&
          r.cabecalhos.Allow.includes("HEAD") &&
          r.cabecalhos["Cache-Control"] === "no-store" &&
          erroDe(r).tipo === "dados_invalidos" &&
          duble.recebidos.length === n,
        `HTTP ${r.status} Allow ${r.cabecalhos.Allow} Cache-Control ${r.cabecalhos["Cache-Control"]}`,
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
      /* TROCA REGISTRADA (Story 5.8): era `SO_POST` ("aceita apenas POST"),
         que deixou de ser verdade quando GET e HEAD passaram a servir a
         página. A frase nova do 405 passa pelo mesmo crivo. */
      moduloDoHandler?.FRASE_DO_METODO_RECUSADO,
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

/* Guardados para a seção (n) e (o) (Story 5.4, revisão): o resultado REAL
   com `faltando`, e o módulo real, para conferir os literais dos dublês. */
let resultadoComFaltandoDoCliente = null;
let clienteDaEscritaDeCarreiras = null;

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

    /* REVISÃO DA 5.4: o `faltando` do 422 ATRAVESSA o cliente real. O
       formulário marca os campos a partir dele; um cliente que o perdesse
       deixaria a tela só com a notificação. O mesmo resultado é passado a
       `errosDoServidor` na seção (n). */
    const comFaltando = await cliente.mudarEstadoDaVaga(UM, "abrir", {
      buscar: buscarQueResponde(422, {
        ok: false,
        erro: {
          tipo: "dados_invalidos",
          mensagem: "Para abrir a vaga faltam o link de candidatura e o resumo.",
          faltando: ["link_de_candidatura", "resumo"],
        },
      }),
      obterToken,
    });
    resultadoComFaltandoDoCliente = comFaltando;
    afirmar(
      "o cliente REAL repassa `faltando` do 422 (`mudarEstadoDaVaga(id, \"abrir\")`), igual ao do servidor, com a frase dele",
      comFaltando.ok === false &&
        comFaltando.erro.tipo === "dados_invalidos" &&
        igual([...(comFaltando.erro.faltando ?? [])], ["link_de_candidatura", "resumo"]) &&
        comFaltando.erro.mensagem === "Para abrir a vaga faltam o link de candidatura e o resumo.",
      JSON.stringify(comFaltando.erro ?? {}),
    );
    afirmar(
      "o cliente expõe os tipos passageiros (`rede`, `inesperado`) com a grafia do contrato de resultado",
      cliente.ERRO_REDE === "rede" &&
        cliente.ERRO_INESPERADO === "inesperado" &&
        cliente.TIPOS_DE_ERRO_DA_ESCRITA_DE_CARREIRAS.includes(cliente.ERRO_REDE) &&
        cliente.TIPOS_DE_ERRO_DA_ESCRITA_DE_CARREIRAS.includes(cliente.ERRO_INESPERADO),
    );
    clienteDaEscritaDeCarreiras = cliente;
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
    /* TROCA REGISTRADA (2026-09-29): o esvaziamento era só `delete`, e
       quebrava com uma Vaga Aberta real no projeto, porque a máquina de estados
       recusa excluir Aberta (a regra certa). Agora as Abertas são ENCERRADAS
       antes, pela própria máquina, dentro da mesma transação desfeita: nada
       persiste, e a prova volta a não depender dos dados de produção. */
    const ESVAZIAR_VAGAS_NA_TRANSACAO = `update public.vagas set estado = 'encerrada' where estado = 'aberta';
      delete from public.vagas;
      `;
    const torto = await desfeito(`${ESVAZIAR_VAGAS_NA_TRANSACAO}
      set local role authenticated;
      select count(*) from public.buscar_vagas_do_painel(null, 'publicado');`);
    afirmar(
      "busca do Painel: Estado fora do vocabulário é RECUSADO pelo enum mesmo com `vagas` VAZIA (a regressão de 20260924130000)",
      torto.ok === false && /invalid input value for enum/i.test(String(torto.erro ?? "")),
      torto.erro ?? "o Estado torto passou",
    );
    const vaziaAceita = await desfeito(`${ESVAZIAR_VAGAS_NA_TRANSACAO}
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

/* ═══ Story 5.4: o formulário de Vaga ═══════════════════════════════════════
 *
 *   (m) ESTÁTICA: a lista de permissão de imports de `src/admin/carreiras/**`,
 *       pelo apelido e pelo caminho relativo, com autoteste; as rotas novas
 *       em `main.jsx`, sem propriedade, depois do índice.
 *   (n) NODE: `formulario.js`, a configuração e o saneamento da Descrição e
 *       as rotas, importados e executados.
 *   (o) MONTADA: a tela compilada pelo empacotador da aplicação, com dublês
 *       de `@/data/carreiras/leitura` e `@/data/carreiras/escrita` por
 *       apelido, dentro de um `MemoryRouter`, cobrindo a matriz de I/O.
 *
 * As três são LOCAIS: rodam sem token e sem rede.
 */

const DIR_TELAS_DE_CARREIRAS = "src/admin/carreiras";

/** Os `.js`/`.jsx` de um diretório, recursivamente, relativos à raiz, com `/`. */
function arquivosDoDiretorio(relativo) {
  const saida = [];
  const varrer = (atual) => {
    let entradas = [];
    try {
      entradas = readdirSync(path.join(raiz, atual), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entrada of entradas) {
      const filho = `${atual}/${entrada.name}`;
      if (entrada.isDirectory()) varrer(filho);
      else if (/\.(js|jsx|mjs)$/.test(entrada.name)) saida.push(filho);
    }
  };
  varrer(relativo);
  return saida.sort();
}

/**
 * Cada import de um fonte de tela, com a CLÁUSULA: `import { a, b as c } from
 * "x"` devolve `{ origem: "x", nomes: ["a", "b"] }`. Default, namespace,
 * `export … from`, `import "x"` e import dinâmico devolvem `nomes: null` (não
 * é importação nomeada). Import dinâmico ou `require` com argumento que não é
 * literal, ou modelo com interpolação, volta como `(não literal)`, que
 * nenhuma lista de permissão aceita. Espaço em volta de `import`/`from` é
 * opcional, como na linguagem.
 */
function importsDaTela(fonte) {
  const codigo = semComentarios(fonte);
  const achados = [];
  for (const m of codigo.matchAll(
    /(?<![\w$.])(import|export)\s*([^'"`;()]*?)\s*\bfrom\s*["']([^"']+)["']/g,
  )) {
    const [, palavra, clausula, origem] = m;
    let nomes = null;
    const nomeada = /^\{([^}]*)\}$/.exec(clausula.trim());
    if (palavra === "import" && nomeada) {
      nomes = nomeada[1]
        .split(",")
        .map((parte) => parte.trim().split(/\s+as\s+/)[0].trim())
        .filter(Boolean);
    }
    achados.push({ origem, nomes });
  }
  for (const m of codigo.matchAll(/(?<![\w$.])import\s*["']([^"']+)["']/g)) {
    achados.push({ origem: m[1], nomes: null });
  }
  for (const m of codigo.matchAll(
    /(?<![\w$.])(?:import|require)\s*\(\s*(["'`])((?:(?!\1)[^\\]|\\.)*)\1\s*\)/g,
  )) {
    const [, aspa, texto] = m;
    achados.push({
      origem: aspa === "`" && texto.includes("${") ? `(não literal: ${texto})` : texto,
      nomes: null,
    });
  }
  for (const m of codigo.matchAll(/(?<![\w$.])(?:import|require)\s*\(\s*([^"'`\s)])/g)) {
    achados.push({ origem: `(não literal: ${m[1]}…)`, nomes: null });
  }
  /* REVISÃO DA 5.4: as duas outras portas de módulo do Vite. `import.meta.glob`
     traz um conjunto de arquivos por padrão de caminho, e `new URL(x,
     import.meta.url)` resolve um arquivo do projeto sem `import`: nenhuma das
     duas tem uma origem que a lista de permissão consiga julgar, então as duas
     são RECUSADAS como não literais. */
  for (const m of codigo.matchAll(/(?<![\w$])import\s*\.\s*meta\s*\.\s*(glob\w*)\s*\(/g)) {
    achados.push({ origem: `(não literal: import.meta.${m[1]})`, nomes: null });
  }
  for (const m of codigo.matchAll(/(?<![\w$.])new\s+URL\s*\(([^)]*)import\s*\.\s*meta\s*\.\s*url/g)) {
    achados.push({ origem: `(não literal: new URL(${m[1].trim()} import.meta.url))`, nomes: null });
  }
  return achados;
}

/** A origem como caminho do projeto (`src/…`, sem extensão), ou `null` para pacote. */
function caminhoDaOrigem(origem, arquivoRelativo) {
  let resolvido = null;
  if (origem.startsWith("@/")) {
    /* Apelido com `.` ou `..` depois do prefixo é RECUSADO, e não
       normalizado: `@/lib/../admin/blog/x` começa com um prefixo permitido. */
    if (/(^|\/)\.{1,2}(\/|$)/.test(origem.slice(2))) return "(apelido que sobe diretório)";
    resolvido = `src/${origem.slice(2)}`;
  } else if (origem.startsWith("./") || origem.startsWith("../")) {
    resolvido = path.posix.normalize(path.posix.join(path.posix.dirname(arquivoRelativo), origem));
  } else {
    return null;
  }
  return resolvido.replace(/\.(jsx?|mjs)$/, "");
}

const PACOTES_DAS_TELAS = Object.freeze(["react", "react-router-dom", "lucide-react"]);
const DIRETORIOS_DAS_TELAS = Object.freeze([
  "src/components/ui/",
  "src/lib/",
  "src/admin/shell/",
  "src/admin/comum/",
  "src/admin/carreiras/",
  "src/domain/carreiras/",
  "src/data/carreiras/",
]);
/** Os módulos de fora de Carreiras que a tela pode usar, e SÓ com estes nomes. */
const NOMES_RESTRITOS = Object.freeze({
  "src/domain/blog/schema": Object.freeze(["documentoVazio"]),
  "src/data/blog/comum": Object.freeze(["ehUuid"]),
});

/** As recusas de um fonte de `admin/carreiras`: origem fora da lista, ou nome fora do permitido. */
function recusasDaTela(fonte, arquivoRelativo) {
  const recusas = [];
  for (const { origem, nomes } of importsDaTela(fonte)) {
    if (origem.startsWith("(não literal")) {
      recusas.push(origem);
      continue;
    }
    const caminho = caminhoDaOrigem(origem, arquivoRelativo);
    if (caminho === null) {
      if (!PACOTES_DAS_TELAS.includes(origem)) recusas.push(origem);
      continue;
    }
    if (DIRETORIOS_DAS_TELAS.some((d) => caminho.startsWith(d) && /^[\w./-]+$/.test(caminho))) continue;
    const permitidos = NOMES_RESTRITOS[caminho];
    if (permitidos === undefined) {
      recusas.push(origem);
      continue;
    }
    if (nomes === null || nomes.length === 0 || nomes.some((n) => !permitidos.includes(n))) {
      recusas.push(`${origem} {${(nomes ?? ["(não nomeado)"]).join(", ")}}`);
    }
  }
  return recusas;
}

secao("(m) as telas de Carreiras: a lista de permissão de imports e as rotas (Story 5.4)");

{
  /* AUTOTESTE: o detector acusa cada origem recusada pela spec, pelo apelido
     e pelo caminho relativo, e absolve a lista de permissão. */
  const deTela = `${DIR_TELAS_DE_CARREIRAS}/Qualquer.jsx`;
  const recusadas = [
    'import x from "@/admin/blog/x";',
    'import EditorDePost from "@/admin/blog/EditorDePost";',
    'import x from "../blog/configuracao.js";',
    'import Pagina from "@/pages/Blog";',
    'import Pagina from "../../pages/AdminBlog.jsx";',
    'import { lerPostDoPainelPorId } from "@/data/blog/posts";',
    'import { gerarSlug } from "@/domain/blog/slug";',
    'import { gerarSlug } from "../../domain/blog/slug.js";',
    'import { validarDocumento } from "@/domain/blog/schema";',
    'import { documentoVazio, validarDocumento } from "../../domain/blog/schema.js";',
    'import * as schema from "@/domain/blog/schema";',
    'import schema from "@/domain/blog/schema";',
    'import { tokenDoPainelOuFalha } from "@/data/blog/comum";',
    'export { ehUuid } from "@/data/blog/comum";',
    'import { y } from "@/lib/../admin/blog/x";',
    'import x from "@/admin/comum/../blog/x";',
    'import{ y }from"@/admin/blog/x";',
    'export*from"@/pages/Blog";',
    'const m = await import("@/admin/blog/x");',
    "const m = await import(caminho);",
    "const m = await import(`@/admin/carreiras/${nome}`);",
    'import "@/data/supabase/clientes";',
    'import { motion } from "framer-motion";',
    'import { useEditor } from "@tiptap/react";',
    'const telas = import.meta.glob("../blog/*.jsx");',
    'const telas = import.meta.globEager("@/pages/*.jsx");',
    'const telas = import . meta . glob("./*.js", { eager: true });',
    'const endereco = new URL("../blog/EditorDePost.jsx", import.meta.url);',
    'const endereco = new URL(`./${nome}.js`, import.meta.url).href;',
  ];
  const absolvidas = [
    'import { useState } from "react";',
    'import { useParams } from "react-router-dom";',
    'import { X } from "lucide-react";',
    'import { Button } from "@/components/ui/button";',
    'import { cn } from "@/lib/utils";',
    'import DialogoDeConfirmacao from "@/admin/shell/DialogoDeConfirmacao";',
    'import EditorDeTexto from "@/admin/comum/EditorDeTexto";',
    'import { criarPrepararConteudo } from "../comum/conteudo.js";',
    'import x from "./formulario.js";',
    'import x from "@/admin/carreiras/formulario";',
    'import { acoesDoEstadoDaVaga } from "@/domain/carreiras/transicoes";',
    'import { VOCABULARIO_DA_VAGA } from "../../domain/carreiras/descricao.js";',
    'import { documentoVazio } from "@/domain/blog/schema";',
    'import { documentoVazio as vazio } from "../../domain/blog/schema.js";',
    'import { ehUuid } from "@/data/blog/comum";',
    'import { salvarVaga } from "@/data/carreiras/escrita";',
    'import { ERRO_CONFLITO } from "../../data/carreiras/escrita.js";',
    '// import x from "@/admin/blog/x";\nimport { cn } from "@/lib/utils";',
  ];
  const acusadas = recusadas.filter((fonte) => recusasDaTela(fonte, deTela).length > 0);
  afirmar(
    "autoteste: a varredura de imports de `admin/carreiras` ACUSA admin/blog, pages, outros módulos de domain/blog e data/blog, nome fora do permitido, namespace, default, reexportação, apelido que sobe diretório, import sem espaço, import não literal, `import.meta.glob`, `new URL(…, import.meta.url)` e pacote fora da lista",
    acusadas.length === recusadas.length,
    `passaram sem acusar: ${recusadas.filter((f) => !acusadas.includes(f)).join(" | ")}`,
  );
  const semRazao = absolvidas.filter((fonte) => recusasDaTela(fonte, deTela).length > 0);
  afirmar(
    "autoteste: e ABSOLVE a lista de permissão (react, react-router-dom, lucide-react, ui, lib, shell, comum, carreiras, domain/carreiras, data/carreiras, `documentoVazio` e `ehUuid`) e o import que só existe em comentário",
    semRazao.length === 0 && absolvidas.every((f) => importsDaTela(f).length > 0),
    `acusadas sem razão: ${semRazao.map((f) => `${f} → ${recusasDaTela(f, deTela).join(", ")}`).join(" | ")}`,
  );

  const arquivos = arquivosDoDiretorio(DIR_TELAS_DE_CARREIRAS);
  const ESPERADOS = [
    "rotas.js",
    "configuracaoDaDescricao.js",
    "conteudoDaDescricao.js",
    "BarraDaDescricao.jsx",
    "EditorDaDescricao.jsx",
    "formulario.js",
    "EditorDeVaga.jsx",
    /* TROCA REGISTRADA (Story 5.5): a aba Carreiras modular entra na lista
       fechada, com os três arquivos dela. */
    "listagem.js",
    "ListaDeVagas.jsx",
    "AbaDeCarreiras.jsx",
    /* TROCA REGISTRADA (revisão da 5.5): `falhaPassageira` e
       `mensagemDaFalha` saíram de `formulario.js` para um módulo neutro,
       importado pelo formulário e pela lista. */
    "falhas.js",
    /* TROCA REGISTRADA (Story 5.6): a tela de Departamentos, Tipos e Níveis
       entra na lista fechada, com o módulo puro dela. */
    "classificacoesDoPainel.js",
    "TelaDeClassificacoes.jsx",
  ].map((n) => `${DIR_TELAS_DE_CARREIRAS}/${n}`);
  /* TROCA REGISTRADA (revisão da 5.4): era "os esperados EXISTEM" (um
     arquivo a mais passava calado, fora da regra de cor e de raio de
     `verificar-interface`). Agora é IGUALDADE: a lista é fechada. */
  afirmar(
    "os arquivos de `src/admin/carreiras/` são EXATAMENTE os do formulário de Vaga e da aba Carreiras (nem a menos, nem a mais)",
    igual(ordenado(arquivos), ordenado(ESPERADOS)),
    `faltam: ${ESPERADOS.filter((a) => !arquivos.includes(a)).join(", ")} | sobram: ${arquivos.filter((a) => !ESPERADOS.includes(a)).join(", ")}`,
  );
  /* E todo arquivo dali está em `ARQUIVOS_NOVOS` de `verificar-interface`
     (conjuntos iguais): lido do TEXTO daquela ferramenta, porque a lista não
     é exportada, e só do bloco da lista, não do arquivo inteiro. */
  const fonteDaInterface = ler("scripts/verificar-interface.mjs") ?? "";
  const blocoDosNovos = /const ARQUIVOS_NOVOS = \[([\s\S]*?)\n\];/.exec(fonteDaInterface)?.[1] ?? "";
  const carreirasNaInterface = [
    ...semComentarios(blocoDosNovos).matchAll(/["'](src\/admin\/carreiras\/[^"']+)["']/g),
  ].map((m) => m[1]);
  afirmar(
    "todo arquivo de `src/admin/carreiras/` está em `ARQUIVOS_NOVOS` de `verificar-interface`, e nenhum a mais (conjuntos iguais)",
    blocoDosNovos !== "" &&
      carreirasNaInterface.length === new Set(carreirasNaInterface).size &&
      igual(ordenado(carreirasNaInterface), ordenado(arquivos)),
    `só na interface: ${carreirasNaInterface.filter((a) => !arquivos.includes(a)).join(", ")} | só no disco: ${arquivos.filter((a) => !carreirasNaInterface.includes(a)).join(", ")}`,
  );
  const foraDaLista = [];
  let totalDeOrigens = 0;
  for (const arquivo of arquivos) {
    const fonte = ler(arquivo) ?? "";
    totalDeOrigens += importsDaTela(fonte).length;
    for (const recusa of recusasDaTela(fonte, arquivo)) foraDaLista.push(`${arquivo}: ${recusa}`);
  }
  afirmar(
    "`src/admin/carreiras/**` só importa da lista de permissão: nunca `admin/blog` nem `pages`",
    arquivos.length >= ESPERADOS.length && totalDeOrigens > 0 && foraDaLista.length === 0,
    foraDaLista.join(" | ") || `${arquivos.length} arquivo(s), ${totalDeOrigens} origem(ns)`,
  );

  /* Os DADOS entram pelos apelidos exatos, para o dublê poder entrar.
     TROCA REGISTRADA (revisão da 5.4): antes, um `.js` puro podia ler
     constante `ERRO_*` de `data/carreiras` pelo caminho relativo. Mas o
     relativo puxa o módulo de dados REAL para dentro do pacote montado, por
     baixo do dublê; agora `formulario.js` recebe os tipos por parâmetro, e
     QUALQUER import de `data/carreiras` que não seja pelos dois apelidos
     exatos é recusado. */
  const dadosFora = [];
  for (const arquivo of arquivos) {
    for (const { origem, nomes } of importsDaTela(ler(arquivo) ?? "")) {
      const caminho = caminhoDaOrigem(origem, arquivo);
      if (caminho === null || !caminho.startsWith("src/data/carreiras/")) continue;
      const exato = origem === "@/data/carreiras/leitura" || origem === "@/data/carreiras/escrita";
      if (!exato) dadosFora.push(`${arquivo}: ${origem} {${(nomes ?? []).join(", ")}}`);
    }
  }
  const tela = semComentarios(ler(`${DIR_TELAS_DE_CARREIRAS}/EditorDeVaga.jsx`) ?? "");
  afirmar(
    "tudo de `data/carreiras` entra pelos apelidos EXATOS `@/data/carreiras/leitura` e `@/data/carreiras/escrita` (nada pelo caminho relativo, nem constante), e a tela traz as quatro funções de lá",
    dadosFora.length === 0 &&
      /import\s*\{[^}]*\blerVagaDoPainelPorId\b[^}]*\}\s*from\s*["']@\/data\/carreiras\/leitura["']/.test(tela) &&
      /import\s*\{[^}]*\blistarClassificacoesDoPainel\b[^}]*\}\s*from\s*["']@\/data\/carreiras\/leitura["']/.test(tela) &&
      /import\s*\{[^}]*\bsalvarVaga\b[^}]*\}\s*from\s*["']@\/data\/carreiras\/escrita["']/.test(tela) &&
      /import\s*\{[^}]*\bmudarEstadoDaVaga\b[^}]*\}\s*from\s*["']@\/data\/carreiras\/escrita["']/.test(tela),
    dadosFora.join(" | "),
  );

  const TERMOS_PROIBIDOS = ["localStorage", "sessionStorage", "indexedDB", "useBlocker"];
  const proibidos = [];
  for (const arquivo of arquivos) {
    const codigo = semComentarios(ler(arquivo) ?? "");
    for (const termo of TERMOS_PROIBIDOS) if (codigo.includes(termo)) proibidos.push(`${arquivo}: ${termo}`);
    if (codigo.includes("—")) proibidos.push(`${arquivo}: travessão`);
  }
  afirmar(
    "nada em `admin/carreiras` toca armazenamento do navegador, usa `useBlocker` ou escreve travessão fora de comentário",
    proibidos.length === 0,
    proibidos.join(" | "),
  );
  afirmar(
    "a tela é `EditorDeVaga()` SEM propriedade: o identificador vem de `useParams`, e a troca de Vaga troca a `key`",
    /export\s+default\s+function\s+EditorDeVaga\s*\(\s*\)/.test(tela) &&
      /\buseParams\s*\(/.test(tela) &&
      /<TelaDaVaga\s+key=\{/.test(tela),
  );

  /* As rotas novas em `main.jsx`: filhas de `/admin`, depois do índice, com
     `<EditorDeVaga />` sem propriedade. */
  const principal = semComentarios(ler("src/main.jsx") ?? "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\s+/g, " ");
  /* TROCA REGISTRADA (revisão da 5.4): a regex antiga casava as rotas em
     QUALQUER ponto depois do índice, e um `</Route>` qualquer depois delas; o
     import das rotas bastava trazer `ROTA_DA_VAGA`. Agora o bloco de `/admin`
     é recortado (do `path="/admin"` ao primeiro `</Route>` depois dele, já que
     as filhas se fecham sozinhas), as duas rotas têm de estar DENTRO dele,
     depois do índice, e o import tem de trazer os DOIS nomes. */
  const inicioDoAdmin = principal.indexOf('<Route path="/admin"');
  const fimDoAdmin = inicioDoAdmin < 0 ? -1 : principal.indexOf("</Route>", inicioDoAdmin);
  const blocoDoAdmin = fimDoAdmin < 0 ? "" : principal.slice(inicioDoAdmin, fimDoAdmin);
  const nomesDoImportDasRotas = (
    /import \{([^}]*)\} from ["']@\/admin\/carreiras\/rotas["']/.exec(principal)?.[1] ?? ""
  )
    .split(",")
    .map((n) => n.trim().split(/\s+as\s+/)[0].trim())
    .filter(Boolean);
  afirmar(
    "`main.jsx` monta `<EditorDeVaga />` sem propriedade em `ROTA_DA_VAGA_NOVA` e `ROTA_DA_VAGA`, DENTRO do bloco de `/admin` e depois do índice, importando os dois nomes das rotas",
    /<Route index element=\{<AdminBlog \/>\} \/>.*<Route path=\{ROTA_DA_VAGA_NOVA\} element=\{<EditorDeVaga \/>\} \/>.*<Route path=\{ROTA_DA_VAGA\} element=\{<EditorDeVaga \/>\} \/>/.test(blocoDoAdmin) &&
      (blocoDoAdmin.match(/<EditorDeVaga\b/g) ?? []).length === 2 &&
      /import EditorDeVaga from ["']@\/admin\/carreiras\/EditorDeVaga["']/.test(principal) &&
      nomesDoImportDasRotas.includes("ROTA_DA_VAGA") &&
      nomesDoImportDasRotas.includes("ROTA_DA_VAGA_NOVA") &&
      (principal.match(/<EditorDeVaga\b[^>]*\/>/g) ?? []).every((t) => t === "<EditorDeVaga />") &&
      (principal.match(/<EditorDeVaga\b/g) ?? []).length === 2,
    `bloco de /admin: ${blocoDoAdmin.length} caractere(s) | import: ${nomesDoImportDasRotas.join(", ")}`,
  );
}

/* ─── (n) Os módulos puros do formulário, executados ─────────────────────── */

secao("(n) o formulário de Vaga no Node: regras, configuração e saneamento da Descrição (Story 5.4)");

let formulario = null;
let configuracaoDaDescricao = null;
let conteudoDaDescricao = null;
let rotasDaVaga = null;
try {
  formulario = await import(urlDe("src/admin/carreiras/formulario.js"));
  configuracaoDaDescricao = await import(urlDe("src/admin/carreiras/configuracaoDaDescricao.js"));
  conteudoDaDescricao = await import(urlDe("src/admin/carreiras/conteudoDaDescricao.js"));
  rotasDaVaga = await import(urlDe("src/admin/carreiras/rotas.js"));
} catch (erro) {
  afirmar("os módulos puros de `admin/carreiras` importam no Node", false, erro.message);
}

/* Os SETE controles da projeção, como a spec os lista: título 2 e 3, negrito,
   itálico, as duas listas e link. Escritos aqui à mão de propósito: é contra a
   spec que o código é julgado, não contra ele mesmo. */
const CONTROLES_DA_PROJECAO = Object.freeze([
  "titulo2",
  "titulo3",
  "negrito",
  "italico",
  "listaOrdenada",
  "listaComMarcadores",
  "link",
]);
const UUID_DEPARTAMENTO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const UUID_TIPO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const UUID_NIVEL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";

if (configuracaoDaDescricao !== null) {
  const config = configuracaoDaDescricao.configuracaoDaDescricao;
  const chaves = config.controlesDaBarra().map((c) => c.chave);
  afirmar(
    "os controles da barra da Descrição são EXATAMENTE os 7 da projeção, na ordem dela",
    igual(chaves, CONTROLES_DA_PROJECAO) &&
      igual(chaves, descricaoDaVaga.VOCABULARIO_DA_VAGA.elementos.map((e) => e.chave)),
    chaves.join(", "),
  );
  afirmar(
    "`comImagem` e `comDestaque` são falsos, e não há cor de destaque",
    config.comImagem === false &&
      config.comDestaque === false &&
      config.coresDeDestaque.length === 0 &&
      configuracaoDaDescricao.comImagem === false &&
      configuracaoDaDescricao.comDestaque === false,
  );
  const kit = config.configuracaoDoKit();
  const nomesDasExtensoes = config.extensoesDoEditor().map((e) => e.name);
  afirmar(
    "o kit desliga citação, bloco de código e linha divisória, e não entra imagem, destaque nem alinhamento",
    kit.blockquote === false &&
      kit.codeBlock === false &&
      kit.horizontalRule === false &&
      !nomesDasExtensoes.some((n) => ["image", "highlight", "textAlign"].includes(n)),
    `${JSON.stringify({ blockquote: kit.blockquote, codeBlock: kit.codeBlock, horizontalRule: kit.horizontalRule })} | ${nomesDasExtensoes.join(", ")}`,
  );
  const fonteDaConfiguracao = semComentarios(ler("src/admin/carreiras/configuracaoDaDescricao.js") ?? "");
  afirmar(
    "a configuração é criada UMA vez, no topo do módulo, com `VOCABULARIO_DA_VAGA`, e as exportações são dela",
    (fonteDaConfiguracao.match(/criarConfiguracaoDoEditor\s*\(/g) ?? []).length === 1 &&
      /^export const configuracaoDaDescricao = criarConfiguracaoDoEditor\(VOCABULARIO_DA_VAGA\);/m.test(fonteDaConfiguracao) &&
      configuracaoDaDescricao.controlesDaDescricao === config.controlesDaBarra &&
      Object.isFrozen(config),
  );
  afirmar(
    "o rótulo padrão do editor é o da Descrição da vaga",
    config.opcoesDoEditor().editorProps.attributes["aria-label"] ===
      descricaoDaVaga.VOCABULARIO_DA_VAGA.mensagens.rotuloDoConteudo,
  );
}

if (conteudoDaDescricao !== null) {
  const preparar = conteudoDaDescricao.prepararConteudoDaDescricao;
  const comCitacao = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Texto que fica" }] },
      { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "citação" }] }] },
    ],
  };
  const limpo = preparar(comCitacao);
  afirmar(
    "a Descrição gravada com citação abre SEM ela, e com o aviso de conteúdo limpo que fala da vaga",
    limpo.aviso?.gravidade === "limpo" &&
      !JSON.stringify(limpo.documento).includes("blockquote") &&
      JSON.stringify(limpo.documento).includes("Texto que fica") &&
      /vaga/.test(limpo.aviso.mensagem) &&
      !/post/i.test(limpo.aviso.mensagem),
    JSON.stringify(limpo.aviso),
  );
  const recusado = preparar("não sou documento");
  const ausente = preparar(undefined);
  afirmar(
    "o que não é documento abre vazio com o aviso de recusa; ausência abre vazio sem aviso",
    recusado.aviso?.gravidade === "recusado" &&
      igual(recusado.documento, schema.documentoVazio()) &&
      ausente.aviso === null &&
      igual(ausente.documento, schema.documentoVazio()),
  );
}

if (rotasDaVaga !== null) {
  const UM = "11111111-1111-4111-8111-111111111111";
  /* TROCA REGISTRADA (Story 5.5): a volta era `/admin` (a aba inicial do
     Painel, que é o Blog). Agora é `/admin?aba=carreiras`, a aba Carreiras, e
     o endereço de uma Vaga continua sob `/admin` (não herda o parâmetro). */
  afirmar(
    "as rotas: `carreiras/vaga/nova`, `carreiras/vaga/:id`, o endereço de uma Vaga e a volta para `/admin?aba=carreiras`",
    rotasDaVaga.ROTA_DA_VAGA_NOVA === "carreiras/vaga/nova" &&
      rotasDaVaga.ROTA_DA_VAGA === "carreiras/vaga/:id" &&
      rotasDaVaga.enderecoDaVaga(UM) === `/admin/carreiras/vaga/${UM}` &&
      rotasDaVaga.ENDERECO_DA_VAGA_NOVA === "/admin/carreiras/vaga/nova" &&
      rotasDaVaga.ENDERECO_DA_LISTAGEM === "/admin?aba=carreiras" &&
      rotasDaVaga.PARAMETRO_DA_ABA === "aba" &&
      rotasDaVaga.ABA_DE_CARREIRAS === "carreiras",
    `${rotasDaVaga.ENDERECO_DA_LISTAGEM} | ${rotasDaVaga.enderecoDaVaga(UM)}`,
  );
  afirmar(
    "sem identificador (vazio, nulo, só espaço), o endereço da Vaga é a listagem, e nunca `/admin/carreiras/vaga/`",
    ["", null, undefined, "   "].every((id) => rotasDaVaga.enderecoDaVaga(id) === rotasDaVaga.ENDERECO_DA_LISTAGEM),
    ["", null, undefined, "   "].map((id) => rotasDaVaga.enderecoDaVaga(id)).join(" | "),
  );
}

if (formulario !== null) {
  const f = formulario;
  const vazios = f.valoresVazios();
  afirmar(
    "`valoresVazios()`: os campos do formulário, todos vazios, sem Estado nem `aberta_em`",
    Object.values(vazios).every((v) => v === "") &&
      !Object.hasOwn(vazios, "estado") &&
      !Object.hasOwn(vazios, "aberta_em") &&
      ["titulo", "slug", "departamento_id", "tipo_id", "nivel_id", "modalidade", "localizacao", "resumo", "link_de_candidatura"].every((c) => Object.hasOwn(vazios, c)),
    JSON.stringify(vazios),
  );
  const daVaga = f.valoresDaVaga({
    id: "x",
    titulo: "Analista",
    slug: "analista",
    estado: "aberta",
    aberta_em: "2026-09-01T00:00:00Z",
    modalidade: null,
    link_de_candidatura: null,
    departamento_id: UUID_DEPARTAMENTO,
  });
  afirmar(
    "`valoresDaVaga`: nulo vira texto vazio, e Estado e `aberta_em` não entram no formulário",
    daVaga.titulo === "Analista" &&
      daVaga.modalidade === "" &&
      daVaga.link_de_candidatura === "" &&
      daVaga.departamento_id === UUID_DEPARTAMENTO &&
      !Object.hasOwn(daVaga, "estado") &&
      !Object.hasOwn(daVaga, "aberta_em"),
    JSON.stringify(daVaga),
  );
  afirmar(
    "`slugTravado`: livre no Rascunho nunca aberto; travado com `aberta_em`, na Aberta e na Encerrada",
    f.slugTravado(null) === false &&
      f.slugTravado({ estado: "rascunho", aberta_em: null }) === false &&
      f.slugTravado({ estado: "rascunho", aberta_em: "2026-09-01T00:00:00Z" }) === true &&
      f.slugTravado({ estado: "aberta", aberta_em: "2026-09-01T00:00:00Z" }) === true &&
      f.slugTravado({ estado: "encerrada", aberta_em: null }) === true,
  );
  afirmar(
    "o Slug derivado do título é o da regra do domínio: \"Analista de CS\" dá `analista-de-cs`",
    f.slugDoTitulo("Analista de CS") === "analista-de-cs" &&
      f.slugDoTitulo("Analista de CS") === regrasDaVaga.slugDaVaga("Analista de CS").slug &&
      f.slugDoTitulo("!!!") === "",
  );

  const cheios = {
    ...f.valoresVazios(),
    titulo: " Analista de CS ",
    slug: "analista-de-cs",
    departamento_id: UUID_DEPARTAMENTO,
    tipo_id: UUID_TIPO,
    nivel_id: UUID_NIVEL,
    estado: "aberta",
    aberta_em: "2026-01-01T00:00:00Z",
    xpto: 1,
  };
  const corpo = f.corpoParaSalvar(cheios, null, {});
  afirmar(
    "`corpoParaSalvar` monta as colunas à mão: sem `estado`, sem `aberta_em`, sem campo estranho, título aparado, vazio vira nulo no Link e na Modalidade, e a Descrição ausente vira o documento vazio",
    igual(ordenado(Object.keys(corpo)), ordenado([
      "titulo", "slug", "departamento_id", "tipo_id", "nivel_id", "modalidade", "localizacao", "resumo", "link_de_candidatura", "descricao",
    ])) &&
      corpo.titulo === "Analista de CS" &&
      corpo.link_de_candidatura === null &&
      corpo.modalidade === null &&
      igual(corpo.descricao, schema.documentoVazio()),
    JSON.stringify(corpo),
  );
  afirmar(
    "o Slug fica de FORA quando travado, e quando a Vaga nasce sem ele (o servidor deriva); na edição livre ele viaja",
    !Object.hasOwn(f.corpoParaSalvar(cheios, null, { travado: true }), "slug") &&
      !Object.hasOwn(f.corpoParaSalvar({ ...cheios, slug: "" }, null, { criando: true }), "slug") &&
      f.corpoParaSalvar(cheios, null, { criando: false }).slug === "analista-de-cs",
  );

  const rotulos = regrasDaVaga.ROTULOS_DOS_CAMPOS;
  const semNada = f.problemasLocais(f.valoresVazios(), { criando: true });
  afirmar(
    "local: sem título e sem as Classificações, as quatro marcas, com o rótulo do domínio na frase",
    igual(ordenado(Object.keys(semNada)), ordenado(["titulo", "departamento_id", "tipo_id", "nivel_id"])) &&
      semNada.titulo.includes(rotulos.titulo) &&
      semNada.nivel_id.includes(rotulos.nivel_id),
    JSON.stringify(semNada),
  );
  const validos = { ...f.valoresVazios(), titulo: "Analista", departamento_id: UUID_DEPARTAMENTO, tipo_id: UUID_TIPO, nivel_id: UUID_NIVEL };
  afirmar(
    "local: o mínimo de um Rascunho (título e as três Classificações) passa, sem Link e sem Resumo",
    Object.keys(f.problemasLocais(validos, { criando: true })).length === 0,
  );
  const L = regrasDaVaga.LIMITES_DA_VAGA;
  const tamanhos = f.problemasLocais({
    ...validos,
    titulo: "t".repeat(L.titulo + 1),
    resumo: "r".repeat(L.resumo + 1),
    localizacao: "l".repeat(L.localizacao + 1),
  }, { criando: true });
  const noTeto = f.problemasLocais({
    ...validos,
    titulo: "t".repeat(L.titulo),
    resumo: "r".repeat(L.resumo),
    localizacao: "l".repeat(L.localizacao),
  }, { criando: true });
  afirmar(
    "local: os tetos de `LIMITES_DA_VAGA` (Resumo com 201 recusado, com 200 aceito; título e Localização idem)",
    igual(ordenado(Object.keys(tamanhos)), ordenado(["titulo", "resumo", "localizacao"])) &&
      tamanhos.resumo.includes(String(L.resumo)) &&
      tamanhos.resumo.includes(rotulos.resumo) &&
      Object.keys(noTeto).length === 0,
    JSON.stringify(tamanhos),
  );
  /* TROCA REGISTRADA (revisão da 5.4): os casos de link passavam sem
     `{ criando }`, ao contrário dos outros, e o Slug vazio caía na regra da
     edição. Agora vão com `{ criando: true }`, como os demais casos. */
  const links = ["javascript:x", "mailto:a@b.c", "https:x", "/relativo"].map(
    (link) => f.problemasLocais({ ...validos, link_de_candidatura: link }, { criando: true }).link_de_candidatura ?? null,
  );
  afirmar(
    "local: o Link de Candidatura é julgado por `linkDeCandidaturaValido` quando preenchido (`javascript:x` recusado, `https://` aceito, vazio aceito)",
    links.every((l) => typeof l === "string" && l.includes(rotulos.link_de_candidatura)) &&
      !Object.hasOwn(f.problemasLocais({ ...validos, link_de_candidatura: "https://exemplo.com/vaga" }, { criando: true }), "link_de_candidatura") &&
      !Object.hasOwn(f.problemasLocais({ ...validos, link_de_candidatura: "" }, { criando: true }), "link_de_candidatura"),
    links.join(" | "),
  );

  /* ── REVISÃO DA 5.4: as regras que faltavam, executadas ── */
  const comSlug = { ...validos, slug: "analista" };
  const slugVazioNaEdicao = f.problemasLocais({ ...validos, slug: "" }, { criando: false });
  afirmar(
    "local: na EDIÇÃO o Slug vazio é recusado com o rótulo do domínio; travado ou na criação, não",
    typeof slugVazioNaEdicao.slug === "string" &&
      slugVazioNaEdicao.slug.includes(rotulos.slug) &&
      !Object.hasOwn(f.problemasLocais({ ...validos, slug: "" }, { travado: true }), "slug") &&
      !Object.hasOwn(f.problemasLocais({ ...validos, slug: "" }, { criando: true }), "slug") &&
      !Object.hasOwn(f.problemasLocais({ ...validos, slug: "   " }, { criando: true }), "slug"),
    JSON.stringify(slugVazioNaEdicao),
  );
  const slugsTortos = ["Meu Slug", "-analista", "analista-", "a--b", "ação", "a_b"];
  const recusasDeFormato = slugsTortos.map((slug) => f.problemasLocais({ ...validos, slug }, { criando: false }).slug ?? null);
  afirmar(
    "local: o FORMATO do Slug é o do domínio (`FORMATO_DE_SLUG`), com a frase do domínio (`problemaNoSlug`); o formato bom passa; travado, não é julgado",
    recusasDeFormato.every((frase, i) => typeof frase === "string" && frase === regrasDaVaga.problemaNoSlug(slugsTortos[i].trim())) &&
      regrasDaVaga.FORMATO_DE_SLUG instanceof RegExp &&
      slugsTortos.every((s) => !regrasDaVaga.FORMATO_DE_SLUG.test(s)) &&
      !Object.hasOwn(f.problemasLocais(comSlug, { criando: false }), "slug") &&
      !Object.hasOwn(f.problemasLocais({ ...validos, slug: " analista-de-cs " }, { criando: false }), "slug") &&
      !Object.hasOwn(f.problemasLocais({ ...validos, slug: "Meu Slug" }, { travado: true }), "slug"),
    recusasDeFormato.join(" | "),
  );
  const slugLongo = f.problemasLocais({ ...validos, slug: "a".repeat(L.slug + 1) }, { criando: false });
  afirmar(
    "local: o Slug além do teto (`LIMITES_DA_VAGA.slug`) é recusado com o teto na frase; no teto, aceito; travado (não viaja), não é julgado",
    typeof slugLongo.slug === "string" &&
      slugLongo.slug.includes(String(L.slug)) &&
      slugLongo.slug.includes(rotulos.slug) &&
      !Object.hasOwn(f.problemasLocais({ ...validos, slug: "a".repeat(L.slug) }, { criando: false }), "slug") &&
      !Object.hasOwn(f.problemasLocais({ ...validos, slug: "a".repeat(L.slug + 1) }, { travado: true }), "slug"),
    JSON.stringify(slugLongo),
  );
  const tituloEmBranco = f.problemasLocais({ ...validos, titulo: "   \t " }, { criando: true });
  afirmar(
    "local: título só com espaços conta como vazio",
    typeof tituloEmBranco.titulo === "string" && tituloEmBranco.titulo.includes(rotulos.titulo),
    JSON.stringify(tituloEmBranco),
  );
  const linksRuins = ["JAVASCRIPT:x", "http://", `https://exemplo.com/${"x".repeat(L.link_de_candidatura)}`];
  const recusasDeLink = linksRuins.map(
    (link) => f.problemasLocais({ ...validos, link_de_candidatura: link }, { criando: true }).link_de_candidatura ?? null,
  );
  afirmar(
    "local: Link `JAVASCRIPT:x` (caixa alta), `http://` sem endereço e Link além de 2048 caracteres são recusados (o longo, com o teto na frase)",
    recusasDeLink.every((l) => typeof l === "string" && l.includes(rotulos.link_de_candidatura)) &&
      recusasDeLink[2].includes(String(L.link_de_candidatura)),
    recusasDeLink.join(" | "),
  );

  const gravadosLimpos = f.valoresGravados(
    { ...validos, resumo: null, xpto: "estranho", estado: "aberta" },
    { titulo: "Do servidor", link_de_candidatura: null, modalidade: null, aberta_em: "2026-01-01T00:00:00Z", outro: 1 },
  );
  afirmar(
    "`valoresGravados` devolve SÓ os campos do formulário (nada de `estado`, `aberta_em` ou campo estranho de qualquer lado) e nulo vira texto vazio",
    igual(ordenado(Object.keys(gravadosLimpos)), ordenado([...f.CAMPOS_DO_FORMULARIO])) &&
      Object.values(gravadosLimpos).every((v) => typeof v === "string") &&
      gravadosLimpos.resumo === "" &&
      gravadosLimpos.link_de_candidatura === "" &&
      gravadosLimpos.titulo === "Do servidor" &&
      gravadosLimpos.departamento_id === UUID_DEPARTAMENTO,
    JSON.stringify(gravadosLimpos),
  );

  const corpoDosVazios = f.corpoParaSalvar(
    {
      ...f.valoresVazios(),
      titulo: "  Analista  ",
      slug: " analista ",
      departamento_id: ` ${UUID_DEPARTAMENTO} `,
      tipo_id: UUID_TIPO,
      nivel_id: UUID_NIVEL,
      modalidade: "   ",
      localizacao: "",
      resumo: " \n ",
      link_de_candidatura: "",
    },
    null,
    { criando: false },
  );
  const corpoCheio = f.corpoParaSalvar(
    { ...validos, modalidade: " remoto ", localizacao: " Recife ", resumo: " Um resumo ", link_de_candidatura: " https://exemplo.com/v " },
    null,
    { criando: true },
  );
  afirmar(
    "`corpoParaSalvar`: os quatro opcionais vazios (`OPCIONAIS_NULOS_QUANDO_VAZIOS`) viajam como `null`, e todo texto vai aparado",
    igual([...f.OPCIONAIS_NULOS_QUANDO_VAZIOS], ["modalidade", "localizacao", "resumo", "link_de_candidatura"]) &&
      f.OPCIONAIS_NULOS_QUANDO_VAZIOS.every((c) => corpoDosVazios[c] === null) &&
      corpoDosVazios.titulo === "Analista" &&
      corpoDosVazios.slug === "analista" &&
      corpoDosVazios.departamento_id === UUID_DEPARTAMENTO &&
      corpoCheio.modalidade === "remoto" &&
      corpoCheio.localizacao === "Recife" &&
      corpoCheio.resumo === "Um resumo" &&
      corpoCheio.link_de_candidatura === "https://exemplo.com/v",
    `${JSON.stringify({ ...corpoDosVazios, descricao: "(doc)" })} | ${JSON.stringify({ ...corpoCheio, descricao: "(doc)" })}`,
  );

  const TIPO_DE_CONFLITO = clienteDaEscritaDeCarreiras?.ERRO_CONFLITO ?? "conflito";
  afirmar(
    "o `faltando` do cliente REAL (seção l), passado a `errosDoServidor`, marca Link e Resumo com o rótulo do domínio",
    resultadoComFaltandoDoCliente !== null &&
      igual(ordenado(Object.keys(f.errosDoServidor(resultadoComFaltandoDoCliente.erro, { tipoDeConflito: TIPO_DE_CONFLITO }))), ["link_de_candidatura", "resumo"]) &&
      f.errosDoServidor(resultadoComFaltandoDoCliente.erro, { tipoDeConflito: TIPO_DE_CONFLITO }).resumo.includes(rotulos.resumo),
    JSON.stringify(resultadoComFaltandoDoCliente?.erro ?? null),
  );
  afirmar(
    "`formulario.js` não importa `data/`: os tipos de erro chegam por parâmetro (sem o tipo, nenhum erro é tomado por conflito nem por inexistente)",
    !origensDeImport(ler("src/admin/carreiras/formulario.js") ?? "").some((o) => /(^|\/)data\//.test(o)) &&
      Object.keys(f.errosDoServidor({ tipo: "conflito", mensagem: "x" })).length === 0 &&
      f.vagaInexistente({ tipo: "nao_encontrado" }) === false,
    origensDeImport(ler("src/admin/carreiras/formulario.js") ?? "").join(", "),
  );
  const listasSujas = { departamentos: [{ id: UUID_DEPARTAMENTO, nome: "Operações" }, null, { nome: "sem id" }], tipos_de_vaga: "não é lista", niveis: null };
  const comoListas = f.classificacoesComoListas(listasSujas);
  afirmar(
    "Classificações que não são lista viram lista vazia, e item sem identificador fica de fora",
    igual(Object.keys(comoListas).sort(), ["departamentos", "niveis", "tipos_de_vaga"]) &&
      comoListas.departamentos.length === 1 &&
      igual(comoListas.tipos_de_vaga, []) &&
      igual(comoListas.niveis, []) &&
      igual(f.classificacoesComoListas(null).departamentos, []),
    JSON.stringify(comoListas),
  );
  const ausentes = f.classificacoesAusentes({ ...validos, nivel_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaff" }, {
    departamentos: [{ id: UUID_DEPARTAMENTO }],
    tipos_de_vaga: [{ id: UUID_TIPO }],
    niveis: [{ id: UUID_NIVEL }],
  });
  afirmar(
    "a Classificação gravada que saiu da lista é acusada, com o rótulo do domínio; vazia não é (a obrigatoriedade é outra regra)",
    igual(Object.keys(ausentes), ["nivel_id"]) &&
      ausentes.nivel_id.includes(rotulos.nivel_id) &&
      Object.keys(f.classificacoesAusentes({ ...validos, nivel_id: "" }, { departamentos: [{ id: UUID_DEPARTAMENTO }], tipos_de_vaga: [{ id: UUID_TIPO }], niveis: [] })).length === 0,
    JSON.stringify(ausentes),
  );
  /* TROCA REGISTRADA (revisão da 5.5): as duas funções de leitura de falha
     saíram de `formulario.js` para `falhas.js` (a lista as usa também). As
     asserções são as mesmas, feitas ao módulo novo, mais: o formulário não as
     exporta mais (uma casa só), e `falhas.js` não importa nada. */
  let fa = null;
  try {
    fa = await import(urlDe("src/admin/carreiras/falhas.js"));
  } catch (erro) {
    afirmar("`src/admin/carreiras/falhas.js` importa no Node", false, erro.message);
  }
  afirmar(
    "`falhaPassageira` e `mensagemDaFalha` moram SÓ em `falhas.js`: o formulário não as exporta, e o módulo neutro não importa nada (nem `data/`)",
    fa !== null &&
      typeof fa.falhaPassageira === "function" &&
      typeof fa.mensagemDaFalha === "function" &&
      !("falhaPassageira" in f) &&
      !("mensagemDaFalha" in f) &&
      origensDeImport(ler("src/admin/carreiras/falhas.js") ?? "").length === 0,
    origensDeImport(ler("src/admin/carreiras/falhas.js") ?? "").join(", "),
  );
  const passageiros = ["rede", "inesperado"];
  afirmar(
    "falha passageira: só os tipos que quem chama passa (`rede`, `inesperado`); `configuracao`, `permissao`, `dados_invalidos` e `conflito` não",
    fa !== null &&
      fa.falhaPassageira({ tipo: "rede" }, passageiros) === true &&
      fa.falhaPassageira({ tipo: "inesperado" }, passageiros) === true &&
      ["configuracao", "permissao", "dados_invalidos", "conflito", "nao_encontrado"].every((t) => fa.falhaPassageira({ tipo: t }, passageiros) === false) &&
      fa.falhaPassageira(null, passageiros) === false &&
      fa.falhaPassageira({ tipo: "rede" }, undefined) === false,
  );
  afirmar(
    "a frase da falha tem reserva: sem mensagem (ou só espaço), a frase de quem chama",
    fa !== null &&
      fa.mensagemDaFalha({ mensagem: "Do servidor." }, "Reserva.") === "Do servidor." &&
      fa.mensagemDaFalha({ mensagem: "  " }, "Reserva.") === "Reserva." &&
      fa.mensagemDaFalha(null, "Reserva.") === "Reserva." &&
      fa.mensagemDaFalha({}, "Reserva.") === "Reserva.",
  );

  /* TROCA REGISTRADA (revisão da 5.4): `errosDoServidor` recebe o tipo de
     conflito por parâmetro (antes o importava de `data/carreiras`). */
  const doServidor = f.errosDoServidor({
    tipo: "dados_invalidos",
    mensagem: "Falta o link.",
    faltando: ["link_de_candidatura", "resumo", "campo_que_nao_existe"],
  }, { tipoDeConflito: TIPO_DE_CONFLITO });
  afirmar(
    "servidor: cada campo de `faltando` vira marca com a frase do rótulo do domínio (campo desconhecido não marca nada)",
    igual(ordenado(Object.keys(doServidor)), ["link_de_candidatura", "resumo"]) &&
      doServidor.link_de_candidatura.includes(rotulos.link_de_candidatura) &&
      doServidor.resumo.includes(rotulos.resumo),
    JSON.stringify(doServidor),
  );
  const conflito = f.errosDoServidor({ tipo: "conflito", mensagem: "Já existe uma vaga com este endereço." }, { tipoDeConflito: TIPO_DE_CONFLITO });
  afirmar(
    "servidor: o conflito marca o Slug com a frase do servidor; rede não marca campo nenhum",
    igual(Object.keys(conflito), ["slug"]) &&
      conflito.slug === "Já existe uma vaga com este endereço." &&
      Object.keys(f.errosDoServidor({ tipo: "rede", mensagem: "x" }, { tipoDeConflito: TIPO_DE_CONFLITO })).length === 0 &&
      Object.keys(f.errosDoServidor(null, { tipoDeConflito: TIPO_DE_CONFLITO })).length === 0,
  );
  /* TROCA REGISTRADA (revisão da 5.4): o tipo "não encontrado" chega por
     parâmetro, o da leitura real. */
  const leituraReal = await import(urlDe("src/data/carreiras/leitura.js")).catch(() => null);
  const NAO_ENCONTRADO = leituraReal?.ERRO_NAO_ENCONTRADO;
  afirmar(
    "a Vaga inexistente é distinguida da leitura que falhou",
    NAO_ENCONTRADO === "nao_encontrado" &&
      f.vagaInexistente({ tipo: "nao_encontrado" }, NAO_ENCONTRADO) === true &&
      f.vagaInexistente({ tipo: "rede" }, NAO_ENCONTRADO) === false &&
      f.vagaInexistente(null, NAO_ENCONTRADO) === false,
  );
  const gravados = f.valoresGravados({ ...validos, resumo: "digitado" }, { titulo: "Do servidor", slug: "do-servidor" });
  afirmar(
    "depois de salvar, a tela mostra o que o servidor gravou, e o campo que a resposta não traz fica como estava",
    gravados.titulo === "Do servidor" && gravados.slug === "do-servidor" && gravados.resumo === "digitado",
  );
}

/* ─── (o) A tela montada ─────────────────────────────────────────────────── */

secao("(o) a tela `EditorDeVaga` montada, com dublês de leitura e escrita, cobrindo a matriz de I/O (Story 5.4)");

/*
 * A INFRAESTRUTURA (revisão da 5.4):
 *
 * - Cada montagem é um CASO com nome. Ao desmontar, o caso confere que as
 *   respostas preparadas nos dublês foram TODAS consumidas, que nenhuma escrita
 *   inesperada aconteceu (`excluir*`, Classificação) e que o React não
 *   reclamou de nada (act, key, estado depois de desmontar), salvo as exceções
 *   de `RECLAMACOES_TOLERADAS`, cada uma com o motivo.
 * - `console.error` é trocado UMA vez e restaurado num `finally` externo:
 *   uma exceção no meio não deixa o processo mudo.
 * - Nenhuma espera fixa: cada passo espera por uma CONDIÇÃO, com prazo, e o
 *   prazo estourado é uma falha com nome, não um silêncio.
 * - Clicar num elemento que não existe é uma falha com nome, e o resto do caso
 *   segue.
 */

{
  const { writeFileSync, rmSync } = await import("node:fs");
  const montagem = await import("./montagem-comum.mjs");
  const pasta = montagem.criarPastaDeCompilacao("verificar-carreiras-formulario-");

  const ID_NOVA = "22222222-2222-4222-8222-222222222222";
  const ID_RASCUNHO = "33333333-3333-4333-8333-333333333333";
  const ID_ENCERRADA = "44444444-4444-4444-8444-444444444444";
  const ID_COM_CITACAO = "55555555-5555-4555-8555-555555555555";
  const ID_QUE_NAO_EXISTE = "66666666-6666-4666-8666-666666666666";
  const ID_ABERTA = "77777777-7777-4777-8777-777777777777";
  const ID_OUTRA = "88888888-8888-4888-8888-888888888888";
  const ID_NIVEL_SUMIDO = "99999999-9999-4999-8999-999999999999";
  const ID_DADOS_NULOS = "abababab-abab-4bab-8bab-abababababab";
  const UUID_NIVEL_QUE_SUMIU = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaff";

  const arquivoDaLeitura = path.join(pasta, "duble-leitura.js");
  writeFileSync(
    arquivoDaLeitura,
    `export { ERRO_NAO_ENCONTRADO } from ${montagem.caminhoDeModulo("src/data/blog/resultado.js")};
export const controle = {
  classificacoes: null,
  vagas: {},
  falharLeitura: false,
  falharClassificacoes: false,
  lancar: false,
  dadosNulos: [],
  segurar: null,
  chamadas: [],
};
export async function listarClassificacoesDoPainel() {
  controle.chamadas.push(["classificacoes"]);
  if (controle.segurar) await controle.segurar;
  if (controle.lancar) throw new Error("dublê: a leitura lançou");
  if (controle.falharClassificacoes) {
    return { ok: false, erro: { tipo: "rede", mensagem: "Não conseguimos ler as classificações. Confira a conexão." } };
  }
  return { ok: true, dados: JSON.parse(JSON.stringify(controle.classificacoes)) };
}
export async function lerVagaDoPainelPorId(id) {
  controle.chamadas.push(["vaga", id]);
  if (controle.segurar) await controle.segurar;
  if (controle.lancar) throw new Error("dublê: a leitura lançou");
  if (controle.falharLeitura) {
    return { ok: false, erro: { tipo: "rede", mensagem: "Não conseguimos falar com o banco. Confira a conexão." } };
  }
  if (controle.dadosNulos.includes(id)) return { ok: true, dados: null };
  const vaga = controle.vagas[id];
  if (!vaga) return { ok: false, erro: { tipo: "nao_encontrado", mensagem: "Esta vaga não foi encontrada." } };
  return { ok: true, dados: JSON.parse(JSON.stringify(vaga)) };
}
`,
  );
  /* Os literais de tipo de erro do dublê de escrita: `ERRO_REDE` e
     `ERRO_INESPERADO` vêm do contrato de resultado real; `ERRO_CONFLITO` é
     escrito aqui e CONFERIDO contra o módulo real logo abaixo. */
  const arquivoDaEscrita = path.join(pasta, "duble-escrita.js");
  writeFileSync(
    arquivoDaEscrita,
    `export { ERRO_REDE, ERRO_INESPERADO } from ${montagem.caminhoDeModulo("src/data/blog/resultado.js")};
export const ERRO_CONFLITO = "conflito";
export const controle = { chamadas: [], todas: [], respostas: { salvarVaga: [], mudarEstadoDaVaga: [] } };
function registrar(chamada) {
  controle.chamadas.push(chamada);
  controle.todas.push(chamada);
}
function responder(fila, argumentos) {
  const resposta = fila.shift();
  if (typeof resposta === "function") return resposta(...argumentos);
  return resposta ?? { ok: false, erro: { tipo: "dados_invalidos", mensagem: "O dublê não tinha resposta preparada para este pedido." } };
}
export async function salvarVaga(campos, opcoes = {}) {
  registrar({ op: "salvarVaga", campos: JSON.parse(JSON.stringify(campos)), id: opcoes.id ?? null });
  return responder(controle.respostas.salvarVaga, [campos, opcoes]);
}
export async function mudarEstadoDaVaga(id, acao) {
  registrar({ op: "mudarEstadoDaVaga", id, acao });
  return responder(controle.respostas.mudarEstadoDaVaga, [id, acao]);
}
export async function excluirVaga(id) {
  registrar({ op: "excluirVaga", id });
  return { ok: true, dados: {} };
}
export async function salvarClassificacao() {
  registrar({ op: "salvarClassificacao" });
  return { ok: true, dados: {} };
}
export async function excluirClassificacao() {
  registrar({ op: "excluirClassificacao" });
  return { ok: true, dados: {} };
}
`,
  );
  /* As notificações são observadas por um dublê que PASSA pela regra de voz
     de verdade: frase vaga numa notificação da tela acusa aqui. A saída (a
     ação de resolver) é guardada, para o teste acioná-la. */
  const arquivoDasNotificacoes = path.join(pasta, "duble-notificacoes.js");
  writeFileSync(
    arquivoDasNotificacoes,
    `import { diagnosticarMensagem, diagnosticarRotuloDeAcao } from ${montagem.caminhoDeModulo("src/admin/shell/voz.js")};
export const controle = { erros: [], sucessos: [], problemasDeVoz: [], lancarUmaVez: false };
function conferir(rotulo, texto) {
  const problema = diagnosticarMensagem(rotulo, texto);
  if (problema) controle.problemasDeVoz.push(problema);
}
export function notificarErro(oQueHouve, oQueFazer, saida = null) {
  if (controle.lancarUmaVez) {
    controle.lancarUmaVez = false;
    throw new Error("dublê: a notificação lançou");
  }
  conferir("o que houve", oQueHouve);
  conferir("o que fazer", oQueFazer);
  if (saida) {
    const problema = diagnosticarRotuloDeAcao(saida.rotulo);
    if (problema) controle.problemasDeVoz.push(problema);
    if (typeof saida.aoAcionar !== "function") controle.problemasDeVoz.push("saída sem aoAcionar: " + saida.rotulo);
  }
  controle.erros.push([oQueHouve, oQueFazer, saida]);
}
export function notificarSucesso(oQueAconteceu, detalhe) {
  conferir("o que aconteceu", oQueAconteceu);
  controle.sucessos.push([oQueAconteceu, detalhe ?? ""]);
}
export default function Notificacoes() { return null; }
`,
  );

  const fonte =
    `export { default as EditorDeVaga } from ${montagem.caminhoDeModulo("src/admin/carreiras/EditorDeVaga.jsx")};\n` +
    `export { ROTA_DA_VAGA, ROTA_DA_VAGA_NOVA } from ${montagem.caminhoDeModulo("src/admin/carreiras/rotas.js")};\n` +
    `export * as dubleDaEscrita from ${montagem.comoModulo(arquivoDaEscrita)};\n` +
    `export { controle as controleDaLeitura } from ${montagem.comoModulo(arquivoDaLeitura)};\n` +
    `export { controle as controleDaEscrita } from ${montagem.comoModulo(arquivoDaEscrita)};\n` +
    `export { controle as controleDasNotificacoes } from ${montagem.comoModulo(arquivoDasNotificacoes)};\n`;

  let compilado = null;
  try {
    compilado = await montagem.compilarParaNode({
      pasta,
      fonte,
      alias: {
        "@/data/carreiras/leitura": arquivoDaLeitura,
        "@/data/carreiras/escrita": arquivoDaEscrita,
        "@/admin/shell/Notificacoes": arquivoDasNotificacoes,
      },
    });
  } catch (erro) {
    afirmar("a tela de Vaga compila pelo empacotador da aplicação", false, erro?.message ?? String(erro));
  }

  if (compilado !== null) {
    afirmar("a tela de Vaga compila pelo empacotador da aplicação", true);

    const janela = montagem.montarNavegador({ url: "https://painel.local/admin" });
    const modulo = await import(pathToFileURL(compilado.arquivo).href);
    const React = (await import("react")).default;
    const { act } = await import("react");
    const { createRoot } = await import("react-dom/client");
    const roteador = await import("react-router-dom");
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      value: true,
      configurable: true,
      writable: true,
    });
    const h = React.createElement;
    const leitura = modulo.controleDaLeitura;
    const escrita = modulo.controleDaEscrita;
    const avisos = modulo.controleDasNotificacoes;

    afirmar(
      "os literais de tipo de erro do dublê de escrita são os do módulo REAL (`conflito`, `rede`, `inesperado`)",
      clienteDaEscritaDeCarreiras !== null &&
        modulo.dubleDaEscrita.ERRO_CONFLITO === clienteDaEscritaDeCarreiras.ERRO_CONFLITO &&
        modulo.dubleDaEscrita.ERRO_REDE === clienteDaEscritaDeCarreiras.ERRO_REDE &&
        modulo.dubleDaEscrita.ERRO_INESPERADO === clienteDaEscritaDeCarreiras.ERRO_INESPERADO,
    );

    const CLASSIFICACOES_DO_BANCO = {
      departamentos: [
        { id: UUID_DEPARTAMENTO, nome: "Operações", cor: "var(--categoria-verde-bg)", ordem: 0, vagas: 0 },
        { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab1", nome: "Tecnologia", cor: "var(--categoria-azul-bg)", ordem: 1, vagas: 0 },
      ],
      tipos_de_vaga: [{ id: UUID_TIPO, nome: "CLT", equivalente_jobposting: "FULL_TIME", ordem: 0, vagas: 0 }],
      niveis: [
        { id: UUID_NIVEL, nome: "Pleno", cor: "var(--categoria-azul-bg)", ordem: 0, vagas: 0 },
        { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab3", nome: "Sênior", cor: "var(--categoria-roxo-bg)", ordem: 1, vagas: 0 },
      ],
    };
    leitura.classificacoes = CLASSIFICACOES_DO_BANCO;
    const docSimples = (texto) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: texto }] }] });
    const vagaBase = (id, extra) => ({
      id,
      titulo: "Analista de Suporte",
      slug: "analista-de-suporte",
      estado: "rascunho",
      departamento_id: UUID_DEPARTAMENTO,
      tipo_id: UUID_TIPO,
      nivel_id: UUID_NIVEL,
      modalidade: "remoto",
      localizacao: "",
      resumo: "Atender clientes.",
      descricao: docSimples("Descrição da vaga."),
      descricao_html: "<p>Descrição da vaga.</p>",
      link_de_candidatura: null,
      aberta_em: null,
      criado_em: "2026-09-01T00:00:00Z",
      atualizado_em: "2026-09-01T00:00:00Z",
      ...extra,
    });
    leitura.vagas[ID_RASCUNHO] = vagaBase(ID_RASCUNHO, {});
    leitura.vagas[ID_ENCERRADA] = vagaBase(ID_ENCERRADA, {
      titulo: "Vaga encerrada",
      slug: "vaga-encerrada",
      estado: "encerrada",
      aberta_em: "2026-08-01T12:00:00Z",
      link_de_candidatura: "https://exemplo.com/candidatura",
    });
    leitura.vagas[ID_ABERTA] = vagaBase(ID_ABERTA, {
      titulo: "Vaga aberta de verdade",
      slug: "vaga-aberta-de-verdade",
      estado: "aberta",
      aberta_em: "2026-09-10T12:00:00Z",
      link_de_candidatura: "https://exemplo.com/aberta",
    });
    leitura.vagas[ID_OUTRA] = vagaBase(ID_OUTRA, {
      titulo: "Outra vaga qualquer",
      slug: "outra-vaga-qualquer",
      resumo: "Resumo da outra.",
      descricao: docSimples("Descrição da outra vaga."),
    });
    leitura.vagas[ID_NIVEL_SUMIDO] = vagaBase(ID_NIVEL_SUMIDO, {
      titulo: "Vaga com nível sumido",
      slug: "vaga-com-nivel-sumido",
      nivel_id: UUID_NIVEL_QUE_SUMIU,
    });
    leitura.vagas[ID_COM_CITACAO] = vagaBase(ID_COM_CITACAO, {
      descricao: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Texto que fica" }] },
          { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Citação gravada à força" }] }] },
        ],
      },
    });
    leitura.dadosNulos.push(ID_DADOS_NULOS);

    /** A Vaga que o servidor devolve, a partir do que foi mandado. */
    const vagaGravada = (id, campos, extra = {}) => ({
      ...vagaBase(id, {}),
      ...campos,
      slug: campos.slug ?? "analista-de-cs",
      id,
      ...extra,
    });
    /** Uma resposta que só chega quando o teste solta. */
    const segurada = (resposta) => {
      const controle = { soltar: null };
      const promessa = new Promise((resolver) => {
        controle.soltar = () => resolver(typeof resposta === "function" ? resposta() : resposta);
      });
      return { controle, responder: () => promessa };
    };

    /* As reclamações do React que se toleram, cada uma com o MOTIVO. Vazia de
       propósito: qualquer reclamação é defeito até prova em contrário. */
    const RECLAMACOES_TOLERADAS = [];

    function Onde() {
      const local = roteador.useLocation();
      /* TROCA REGISTRADA (Story 5.5): o marcador trazia só o caminho; agora traz
         também a busca, para a volta à aba Carreiras (`?aba=carreiras`) ser
         distinguida da volta ao Blog. */
      return h("span", { "data-onde": `${local.pathname}${local.search}` });
    }
    function Listagem() {
      return h("p", { "data-papel": "listagem-de-mentira" }, "listagem");
    }
    /* A ponte para o teste navegar DENTRO do roteador montado, como um clique
       num link da listagem faria. */
    const ponte = { navegar: null };
    function Navegador() {
      const navegar = roteador.useNavigate();
      React.useEffect(() => {
        ponte.navegar = navegar;
      });
      return null;
    }

    /** Um passo de relógio dentro do `act`: efeitos, promessas e redesenho. */
    const passo = async () => {
      await act(async () => {
        await new Promise((resolver) => setTimeout(resolver, 0));
      });
    };
    /** Espera uma CONDIÇÃO, com prazo; o prazo estourado é falha com nome. */
    const esperarAte = async (condicao, descricao, prazo = 4000) => {
      const limite = Date.now() + prazo;
      for (;;) {
        await passo();
        let pronto = false;
        try {
          pronto = Boolean(condicao());
        } catch {
          pronto = false;
        }
        if (pronto) return true;
        if (Date.now() > limite) {
          afirmar(`espera com prazo: ${descricao} (${prazo} ms)`, false);
          return false;
        }
      }
    };

    const reclamacoes = [];
    const erroOriginal = console.error;
    console.error = (...partes) => reclamacoes.push(partes.map(String).join(" "));

    const montar = async (caminho, { caso, ateQue = null } = {}) => {
      const alvo = janela.document.createElement("div");
      janela.document.body.appendChild(alvo);
      const raizReact = createRoot(alvo);
      const inicioDasReclamacoes = reclamacoes.length;
      const inicioDasEscritas = escrita.todas.length;
      escrita.chamadas.length = 0;
      leitura.chamadas.length = 0;
      await act(async () => {
        raizReact.render(
          h(
            roteador.MemoryRouter,
            { initialEntries: [caminho] },
            h(Onde),
            h(Navegador),
            h(
              roteador.Routes,
              null,
              h(
                roteador.Route,
                { path: "/admin", element: h(roteador.Outlet) },
                h(roteador.Route, { index: true, element: h(Listagem) }),
                h(roteador.Route, { path: modulo.ROTA_DA_VAGA_NOVA, element: h(modulo.EditorDeVaga) }),
                h(roteador.Route, { path: modulo.ROTA_DA_VAGA, element: h(modulo.EditorDeVaga) }),
              ),
            ),
          ),
        );
      });
      const acharPorTexto = (dentro, texto) =>
        [...(dentro?.querySelectorAll("button") ?? [])].find((b) => (b.textContent ?? "").trim() === texto) ?? null;
      const tela = {
        caso,
        alvo,
        onde: () => alvo.querySelector("[data-onde]")?.getAttribute("data-onde") ?? null,
        situacao: () =>
          alvo.querySelector("[data-situacao]:not([data-situacao='sem-identificador'])")?.getAttribute("data-situacao") ?? null,
        campo: (nome) => alvo.querySelector(`[data-campo="${nome}"]`),
        acoes: () => [...alvo.querySelectorAll("button[data-acao]")].map((b) => b.getAttribute("data-acao")),
        acao: (chave) => alvo.querySelector(`button[data-acao="${chave}"]`),
        pilula: () => alvo.querySelector("[data-estado]")?.getAttribute("data-estado") ?? null,
        voltar: () => alvo.querySelector('button[aria-label="Voltar para a listagem"]'),
        dialogo: () => janela.document.querySelector('[role="alertdialog"]'),
        textoDoEditor: () => alvo.querySelector('[role="textbox"]')?.textContent ?? null,
        ocioso: () => alvo.querySelector('[aria-busy="true"]') === null,
        acharPorTexto,
        /** A recusa ligada ao campo, por um dos ids do `aria-describedby`, quando ele está inválido. */
        recusaDe(nome) {
          const el = alvo.querySelector(`[data-campo="${nome}"]`);
          if (!el || el.getAttribute("aria-invalid") !== "true") return null;
          for (const id of (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean)) {
            const descritor = janela.document.getElementById(id);
            if (descritor && descritor.getAttribute("role") === "alert" && (descritor.textContent ?? "").trim() !== "") {
              return (descritor.textContent ?? "").trim();
            }
          }
          return null;
        },
        /** Clica e espera a tela assentar (ou a condição dada). Elemento ausente é falha com nome. */
        async clicar(elemento, nome, ateQue = null) {
          if (!elemento) {
            afirmar(`${caso}: o elemento "${nome}" existe na tela para ser clicado`, false);
            return false;
          }
          await act(async () => {
            elemento.dispatchEvent(new janela.MouseEvent("click", { bubbles: true }));
          });
          return esperarAte(ateQue ?? tela.ocioso, `${caso}: a tela assenta depois de clicar em ${nome}`);
        },
        /** Dois cliques no MESMO instante: o segundo chega antes de qualquer redesenho. */
        async clicarDuasVezes(elemento, nome, ateQue) {
          if (!elemento) {
            afirmar(`${caso}: o elemento "${nome}" existe na tela para o clique duplo`, false);
            return false;
          }
          await act(async () => {
            elemento.dispatchEvent(new janela.MouseEvent("click", { bubbles: true }));
            elemento.dispatchEvent(new janela.MouseEvent("click", { bubbles: true }));
          });
          return esperarAte(ateQue, `${caso}: a tela reage ao clique duplo em ${nome}`);
        },
        async digitar(elemento, texto, nome = "campo") {
          if (!elemento) {
            afirmar(`${caso}: o ${nome} existe na tela para receber texto`, false);
            return;
          }
          const prototipo =
            elemento.tagName === "TEXTAREA"
              ? janela.HTMLTextAreaElement.prototype
              : elemento.tagName === "SELECT"
                ? janela.HTMLSelectElement.prototype
                : janela.HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(prototipo, "value").set;
          await act(async () => {
            setter.call(elemento, texto);
            elemento.dispatchEvent(
              new janela.Event(elemento.tagName === "SELECT" ? "change" : "input", { bubbles: true }),
            );
          });
        },
        async irPara(caminhoNovo, ateQueNovo) {
          if (typeof ponte.navegar !== "function") {
            afirmar(`${caso}: a ponte de navegação existe`, false);
            return false;
          }
          await act(async () => {
            ponte.navegar(caminhoNovo);
          });
          return esperarAte(ateQueNovo, `${caso}: a tela assenta depois de ir para ${caminhoNovo}`);
        },
        /** Aciona a ação de resolver da última notificação de erro. */
        async acionarSaida(ateQue = null) {
          const saida = avisos.erros.at(-1)?.[2] ?? null;
          if (!saida || typeof saida.aoAcionar !== "function") {
            afirmar(`${caso}: a última notificação de erro tem a ação de resolver`, false);
            return false;
          }
          await act(async () => {
            saida.aoAcionar();
          });
          return esperarAte(ateQue ?? tela.ocioso, `${caso}: a tela assenta depois de "${saida.rotulo}"`);
        },
        /** O navegador perguntaria ao fechar a aba? */
        perguntariaAoSair() {
          const evento = new janela.Event("beforeunload", { cancelable: true });
          janela.dispatchEvent(evento);
          return evento.defaultPrevented;
        },
        async desmontar() {
          await act(async () => raizReact.unmount());
          await passo();
          alvo.remove();
          const sobras = {
            salvarVaga: escrita.respostas.salvarVaga.length,
            mudarEstadoDaVaga: escrita.respostas.mudarEstadoDaVaga.length,
          };
          const inesperadas = escrita.todas
            .slice(inicioDasEscritas)
            .filter((c) => c.op !== "salvarVaga" && c.op !== "mudarEstadoDaVaga");
          afirmar(
            `${caso}: toda resposta preparada nos dublês foi consumida, e nenhuma escrita inesperada (excluir, Classificação) aconteceu`,
            sobras.salvarVaga === 0 && sobras.mudarEstadoDaVaga === 0 && inesperadas.length === 0,
            `sobras: ${JSON.stringify(sobras)} | inesperadas: ${JSON.stringify(inesperadas.map((c) => c.op))}`,
          );
          escrita.respostas.salvarVaga.length = 0;
          escrita.respostas.mudarEstadoDaVaga.length = 0;
          const doCaso = reclamacoes
            .slice(inicioDasReclamacoes)
            .filter((r) => !RECLAMACOES_TOLERADAS.some((t) => t.padrao.test(r)));
          afirmar(
            `${caso}: o React não reclamou de nada (act, key, estado depois de desmontar)`,
            doCaso.length === 0,
            doCaso.slice(0, 2).map((r) => r.slice(0, 300)).join(" | "),
          );
        },
      };
      await esperarAte(
        ateQue ?? (() => tela.ocioso() && tela.situacao() !== null && tela.situacao() !== "carregando"),
        `${caso}: a tela monta e assenta em ${caminho}`,
      );
      return tela;
    };

    const preencherMinimo = async (tela) => {
      await tela.digitar(tela.campo("titulo"), "Analista de CS", "título");
      await tela.digitar(tela.campo("departamento_id"), UUID_DEPARTAMENTO, "Departamento");
      await tela.digitar(tela.campo("tipo_id"), UUID_TIPO, "Tipo");
      await tela.digitar(tela.campo("nivel_id"), UUID_NIVEL, "Nível");
    };
    const rotulos = regrasDaVaga.ROTULOS_DOS_CAMPOS;
    const FALHA_DE_REDE_AO_SALVAR = {
      ok: false,
      erro: { tipo: "rede", mensagem: "Não conseguimos falar com o servidor para salvar a vaga. Confira a conexão e tente salvar de novo." },
    };

    try {
      /* ══ Nova: esqueleto, campos vazios, Classificações do banco, só Salvar ══ */
      let soltar = null;
      leitura.segurar = new Promise((resolver) => {
        soltar = resolver;
      });
      janela.document.body.style.overflow = "auto";
      const nova = await montar("/admin/carreiras/vaga/nova", {
        caso: "Nova",
        ateQue: () => janela.document.querySelector('[data-situacao="carregando"]') !== null,
      });
      afirmar(
        "Nova: enquanto carrega, esqueleto e nenhum campo (nunca tela em branco)",
        nova.alvo.querySelector('[data-situacao="carregando"]') !== null && nova.campo("titulo") === null,
      );
      afirmar(
        "a moldura trava a rolagem do documento enquanto a tela está montada",
        janela.document.body.style.overflow === "hidden",
        janela.document.body.style.overflow,
      );
      soltar();
      leitura.segurar = null;
      await esperarAte(() => nova.situacao() === "pronta", "Nova: o formulário aparece depois da carga");
      const opcoesDe = (tela, nome) => [...(tela.campo(nome)?.querySelectorAll("option") ?? [])].map((o) => o.textContent);
      afirmar(
        "Nova: campos vazios, as Classificações do banco nos `<select>` (na ordem de lá), Estado nenhum e só a ação Salvar",
        nova.campo("titulo")?.value === "" &&
          nova.campo("slug")?.value === "" &&
          igual(opcoesDe(nova, "departamento_id").slice(1), ["Operações", "Tecnologia"]) &&
          igual(opcoesDe(nova, "tipo_id").slice(1), ["CLT"]) &&
          igual(opcoesDe(nova, "nivel_id").slice(1), ["Pleno", "Sênior"]) &&
          nova.pilula() === null &&
          igual(nova.acoes(), ["salvar"]) &&
          !leitura.chamadas.some((c) => c[0] === "vaga"),
        `ações: ${nova.acoes().join(", ")} | departamentos: ${opcoesDe(nova, "departamento_id").join(", ")}`,
      );
      afirmar(
        "os campos são nativos, com rótulo, e o título e as três Classificações dizem \"(obrigatório)\" por extenso",
        ["titulo", "departamento_id", "tipo_id", "nivel_id"].every((nome) => {
          const el = nova.campo(nome);
          const rotulo = el ? nova.alvo.querySelector(`label[for="${el.id}"]`) : null;
          return rotulo !== null && (rotulo.textContent ?? "").includes("(obrigatório)");
        }) &&
          nova.campo("titulo")?.tagName === "INPUT" &&
          nova.campo("nivel_id")?.tagName === "SELECT" &&
          nova.campo("resumo")?.tagName === "TEXTAREA",
      );
      const recusasMontadas = [...nova.alvo.querySelectorAll('[data-papel="recusa"]')];
      afirmar(
        "a região de recusa de CADA campo (e da Descrição) já nasce montada, como região viva (`role=alert`, `aria-live`), e vazia",
        recusasMontadas.length === 10 &&
          recusasMontadas.every(
            (r) => r.getAttribute("role") === "alert" && r.getAttribute("aria-live") === "assertive" && (r.textContent ?? "").trim() === "" && !r.hidden,
          ),
        `${recusasMontadas.length} região(ões): ${recusasMontadas.map((r) => `${r.getAttribute("role")}/${r.getAttribute("aria-live")}`).join(", ")}`,
      );

      /* A barra da Descrição: só os controles da projeção. O link mora na
         barra flutuante, então a barra FIXA mostra os outros seis. */
      const rotulosDaBarra = [...nova.alvo.querySelectorAll('[role="toolbar"] button[aria-label]')].map((b) =>
        b.getAttribute("aria-label"),
      );
      const esperadosNaBarra = descricaoDaVaga.VOCABULARIO_DA_VAGA.elementos
        .filter((e) => e.chave !== "link")
        .map((e) => e.rotulo);
      const PROIBIDOS_NA_BARRA = ["Citação", "Bloco de código", "Linha divisória", "Alinhar à esquerda", "Centralizar", "Alinhar à direita", "Inserir imagem", "Destaque de cor"];
      afirmar(
        "Descrição reduzida: a barra tem só título 2/3, negrito, itálico e as duas listas (o link vai na flutuante), sem citação, código, imagem, destaque, alinhamento nem linha",
        igual(rotulosDaBarra.filter((r) => r !== "Desfazer" && r !== "Refazer"), esperadosNaBarra) &&
          esperadosNaBarra.length === 6 &&
          !rotulosDaBarra.some((r) => PROIBIDOS_NA_BARRA.includes(r)),
        rotulosDaBarra.join(", "),
      );
      const caixa = nova.alvo.querySelector('[role="textbox"]');
      const editorMontado = caixa?.editor ?? null;
      const nosDoEditor = Object.keys(editorMontado?.schema?.nodes ?? {});
      const marcasDoEditor = Object.keys(editorMontado?.schema?.marks ?? {});
      afirmar(
        "e o EDITOR montado não tem nó nem marca fora da projeção (nada de citação, código, linha, imagem, destaque)",
        editorMontado !== null &&
          caixa.getAttribute("aria-label") === descricaoDaVaga.VOCABULARIO_DA_VAGA.mensagens.rotuloDoConteudo &&
          nosDoEditor.every((n) => Object.hasOwn(descricaoDaVaga.VOCABULARIO_DA_VAGA.nos, n) || n === "text") &&
          marcasDoEditor.every((m) => Object.hasOwn(descricaoDaVaga.VOCABULARIO_DA_VAGA.marcas, m)) &&
          !nosDoEditor.some((n) => ["blockquote", "codeBlock", "horizontalRule", "image"].includes(n)) &&
          !marcasDoEditor.includes("highlight"),
        `nós: ${nosDoEditor.join(", ")} | marcas: ${marcasDoEditor.join(", ")}`,
      );

      /* ── A ajuda da Localização segue a Modalidade ── */
      const ajudaDaLocalizacao = () => nova.alvo.querySelector('[data-papel="ajuda-da-localizacao"]')?.textContent ?? "";
      const semModalidade = ajudaDaLocalizacao();
      await nova.digitar(nova.campo("modalidade"), "remoto", "Modalidade");
      const naRemota = ajudaDaLocalizacao();
      await nova.digitar(nova.campo("modalidade"), "presencial", "Modalidade");
      const naPresencial = ajudaDaLocalizacao();
      await nova.digitar(nova.campo("modalidade"), "", "Modalidade");
      afirmar(
        "a ajuda da Localização segue a Modalidade escolhida: sem Modalidade, remota e presencial dizem coisas diferentes, e só a remota diz que é opcional",
        new Set([semModalidade, naRemota, naPresencial]).size === 3 &&
          /opcional/i.test(naRemota) &&
          !/opcional/i.test(naPresencial) &&
          !/opcional/i.test(semModalidade) &&
          /remota/.test(semModalidade),
        `${semModalidade} | ${naRemota} | ${naPresencial}`,
      );

      /* ── Slug automático ── */
      await nova.digitar(nova.campo("titulo"), "Analista de CS", "título");
      const derivado = nova.campo("slug")?.value;
      await nova.digitar(nova.campo("slug"), "vaga-escolhida", "Slug");
      await nova.digitar(nova.campo("titulo"), "Analista de CS Sênior", "título");
      afirmar(
        "Slug automático: \"Analista de CS\" dá `analista-de-cs`; depois de editado à mão, o título deixa de reescrevê-lo",
        derivado === "analista-de-cs" && nova.campo("slug")?.value === "vaga-escolhida",
        `${derivado} | ${nova.campo("slug")?.value}`,
      );
      afirmar(
        "com alteração pendente, o navegador pergunta ao fechar a aba",
        nova.perguntariaAoSair() === true,
      );

      /* ── Local: obrigatórios ── */
      await nova.digitar(nova.campo("titulo"), "", "título");
      const errosAntes = avisos.erros.length;
      await nova.clicar(nova.acao("salvar"), "Salvar");
      afirmar(
        "Local: Salvar sem título e sem Nível marca os dois (aria-invalid, aria-describedby, role=alert), notifica, e NÃO chama o servidor",
        nova.recusaDe("titulo")?.includes(rotulos.titulo) === true &&
          nova.recusaDe("nivel_id")?.includes(rotulos.nivel_id) === true &&
          escrita.chamadas.length === 0 &&
          avisos.erros.length === errosAntes + 1,
        `título: ${nova.recusaDe("titulo")} | nível: ${nova.recusaDe("nivel_id")} | chamadas: ${escrita.chamadas.length}`,
      );
      await nova.digitar(nova.campo("titulo"), "Analista de CS", "título");
      afirmar(
        "a marca do campo some assim que a pessoa o preenche",
        nova.recusaDe("titulo") === null && nova.recusaDe("nivel_id") !== null,
      );

      /* ── Local: link ── */
      await preencherMinimo(nova);
      await nova.digitar(nova.campo("slug"), "analista-de-cs", "Slug");
      await nova.digitar(nova.campo("link_de_candidatura"), "javascript:x", "Link");
      await nova.clicar(nova.acao("salvar"), "Salvar");
      afirmar(
        "Local: `javascript:x` no Link marca o campo, e nada é enviado",
        nova.recusaDe("link_de_candidatura")?.includes(rotulos.link_de_candidatura) === true &&
          escrita.chamadas.length === 0,
        nova.recusaDe("link_de_candidatura"),
      );

      /* ── Local: Slug torto ── */
      await nova.digitar(nova.campo("link_de_candidatura"), "https://exemplo.com/vaga", "Link");
      await nova.digitar(nova.campo("slug"), "Analista De CS", "Slug");
      await nova.clicar(nova.acao("salvar"), "Salvar");
      afirmar(
        "Local: Slug fora do formato do domínio marca o Endereço com a frase do domínio, e nada é enviado",
        nova.recusaDe("slug") === regrasDaVaga.problemaNoSlug("Analista De CS") && escrita.chamadas.length === 0,
        nova.recusaDe("slug"),
      );
      await nova.digitar(nova.campo("slug"), "analista-de-cs", "Slug");

      /* ── Local: tamanho ── */
      await nova.digitar(nova.campo("resumo"), "r".repeat(regrasDaVaga.LIMITES_DA_VAGA.resumo + 1), "Resumo");
      await nova.clicar(nova.acao("salvar"), "Salvar");
      const descritoresDoResumo = (nova.campo("resumo")?.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
      afirmar(
        "Local: Resumo com 201 caracteres marca o Resumo, e nada é enviado",
        nova.recusaDe("resumo")?.includes(String(regrasDaVaga.LIMITES_DA_VAGA.resumo)) === true &&
          nova.recusaDe("link_de_candidatura") === null &&
          escrita.chamadas.length === 0,
        nova.recusaDe("resumo"),
      );
      afirmar(
        "o campo com ajuda E erro descreve-se pelos DOIS (`aria-describedby` com a ajuda e a recusa)",
        descritoresDoResumo.length === 2 &&
          descritoresDoResumo.every((id) => janela.document.getElementById(id) !== null) &&
          descritoresDoResumo.some((id) => janela.document.getElementById(id)?.getAttribute("role") === "alert") &&
          descritoresDoResumo.some((id) => /Necessário para abrir/.test(janela.document.getElementById(id)?.textContent ?? "")),
        descritoresDoResumo.join(" "),
      );

      /* ── Salvar nova ── */
      await nova.digitar(nova.campo("resumo"), "Atender clientes pelo WhatsApp.", "Resumo");
      escrita.respostas.salvarVaga.push((campos) => ({
        ok: true,
        dados: { operacao: "salvarVaga", criada: true, vaga: vagaGravada(ID_NOVA, campos, { estado: "rascunho", aberta_em: null }) },
      }));
      const chamadasDeLeituraAntes = leitura.chamadas.length;
      await nova.clicar(nova.acao("salvar"), "Salvar", () => nova.ocioso() && nova.onde() !== "/admin/carreiras/vaga/nova");
      const primeira = escrita.chamadas[0];
      afirmar(
        "Salvar nova: `salvarVaga(campos)` sem id, com as colunas à mão (sem `estado` nem `aberta_em`) e a Descrição como documento",
        escrita.chamadas.length === 1 &&
          primeira?.op === "salvarVaga" &&
          primeira.id === null &&
          primeira.campos.titulo === "Analista de CS" &&
          primeira.campos.slug === "analista-de-cs" &&
          primeira.campos.departamento_id === UUID_DEPARTAMENTO &&
          primeira.campos.link_de_candidatura === "https://exemplo.com/vaga" &&
          primeira.campos.modalidade === null &&
          primeira.campos.localizacao === null &&
          !Object.hasOwn(primeira.campos, "estado") &&
          !Object.hasOwn(primeira.campos, "aberta_em") &&
          primeira.campos.descricao?.type === "doc",
        JSON.stringify(primeira ?? {}),
      );
      afirmar(
        "ao voltar `criada`, a URL passa a `/admin/carreiras/vaga/<id>`, a tela NÃO é relida do banco, e o Estado aparece com Abrir vaga",
        nova.onde() === `/admin/carreiras/vaga/${ID_NOVA}` &&
          leitura.chamadas.length === chamadasDeLeituraAntes &&
          nova.pilula() === "rascunho" &&
          nova.campo("resumo")?.value === "Atender clientes pelo WhatsApp." &&
          igual(nova.acoes(), ["salvar", "abrir"]),
        `onde: ${nova.onde()} | leituras: ${leitura.chamadas.length - chamadasDeLeituraAntes} | ações: ${nova.acoes().join(", ")}`,
      );
      afirmar(
        "e a pendência zera: o navegador não pergunta mais, e Voltar sai sem diálogo",
        nova.perguntariaAoSair() === false,
      );
      afirmar(
        "a notificação de sucesso nomeia o que aconteceu",
        avisos.sucessos.at(-1)?.[0] === "Vaga criada",
        JSON.stringify(avisos.sucessos.at(-1)),
      );
      await nova.clicar(nova.voltar(), "Voltar");
      afirmar(
        "Voltar sem pendência vai direto para `/admin?aba=carreiras` (a aba Carreiras), sem diálogo, e a moldura RESTAURA a rolagem do documento",
        nova.onde() === "/admin?aba=carreiras" && nova.dialogo() === null && janela.document.body.style.overflow === "auto",
        `${nova.onde()} | overflow: ${janela.document.body.style.overflow}`,
      );
      await nova.desmontar();

      /* ══ Duplo clique: nem duas Vagas, nem duas mudanças de Estado ══ */
      const dupla = await montar("/admin/carreiras/vaga/nova", { caso: "Duplo clique" });
      await preencherMinimo(dupla);
      const salvarSegurado = segurada(() => ({
        ok: true,
        dados: { operacao: "salvarVaga", criada: true, vaga: vagaGravada(ID_NOVA, escrita.chamadas[0]?.campos ?? {}, { estado: "rascunho", aberta_em: null }) },
      }));
      escrita.respostas.salvarVaga.push(salvarSegurado.responder);
      await dupla.clicarDuasVezes(dupla.acao("salvar"), "Salvar", () => escrita.chamadas.length >= 1 && !dupla.ocioso());
      afirmar(
        "duplo clique em Salvar numa Vaga nova manda UM `salvarVaga` (a trava é síncrona, antes do redesenho)",
        escrita.chamadas.filter((c) => c.op === "salvarVaga").length === 1,
        JSON.stringify(escrita.chamadas.map((c) => c.op)),
      );
      afirmar(
        "enquanto a criação está em voo: campos, Salvar e Voltar desabilitados",
        dupla.campo("titulo")?.disabled === true &&
          dupla.campo("nivel_id")?.disabled === true &&
          dupla.acao("salvar")?.disabled === true &&
          dupla.voltar()?.disabled === true,
        `título ${dupla.campo("titulo")?.disabled} | salvar ${dupla.acao("salvar")?.disabled} | voltar ${dupla.voltar()?.disabled}`,
      );
      salvarSegurado.controle.soltar();
      await esperarAte(() => dupla.ocioso() && dupla.onde() === `/admin/carreiras/vaga/${ID_NOVA}`, "Duplo clique: a criação termina");
      afirmar(
        "e ao terminar: a URL é a da Vaga criada, com um único pedido, e os campos voltam a aceitar edição",
        dupla.onde() === `/admin/carreiras/vaga/${ID_NOVA}` &&
          escrita.chamadas.length === 1 &&
          dupla.campo("titulo")?.disabled === false &&
          dupla.voltar()?.disabled === false,
        dupla.onde(),
      );
      const abrirSegurado = segurada({
        ok: true,
        dados: {
          operacao: "mudarEstadoDaVaga",
          acao: "abrir",
          vaga: vagaGravada(ID_NOVA, {}, { titulo: "Analista de CS", slug: "analista-de-cs", estado: "aberta", aberta_em: "2026-09-25T12:00:00Z" }),
        },
      });
      escrita.respostas.mudarEstadoDaVaga.push(abrirSegurado.responder);
      escrita.chamadas.length = 0;
      await dupla.clicarDuasVezes(dupla.acao("abrir"), "Abrir vaga", () => escrita.chamadas.length >= 1 && !dupla.ocioso());
      afirmar(
        "duplo clique numa ação de Estado manda UM `mudarEstadoDaVaga`",
        igual(escrita.chamadas.map((c) => [c.op, c.acao ?? null]), [["mudarEstadoDaVaga", "abrir"]]),
        JSON.stringify(escrita.chamadas.map((c) => c.op)),
      );
      abrirSegurado.controle.soltar();
      await esperarAte(() => dupla.ocioso() && dupla.pilula() === "aberta", "Duplo clique: a abertura termina");

      /* ── Troca: da Vaga criada para `/nova` recarrega formulário e editor ── */
      await dupla.digitar(dupla.campo("resumo"), "Resumo que não pode vazar para a nova.", "Resumo");
      await dupla.irPara("/admin/carreiras/vaga/nova", () => dupla.situacao() === "pronta" && dupla.onde() === "/admin/carreiras/vaga/nova");
      afirmar(
        "Troca de Vaga: da Vaga criada para `/nova`, o formulário e o editor RECOMEÇAM vazios (nada da anterior vaza)",
        dupla.onde() === "/admin/carreiras/vaga/nova" &&
          dupla.campo("titulo")?.value === "" &&
          dupla.campo("resumo")?.value === "" &&
          dupla.pilula() === null &&
          igual(dupla.acoes(), ["salvar"]) &&
          (dupla.textoDoEditor() ?? "x").trim() === "",
        `título "${dupla.campo("titulo")?.value}" | resumo "${dupla.campo("resumo")?.value}" | editor "${dupla.textoDoEditor()}"`,
      );
      await dupla.desmontar();

      /* ══ Falha ao salvar uma Vaga nova, e "Tentar de novo" ══ */
      const falhaNova = await montar("/admin/carreiras/vaga/nova", { caso: "Falha ao salvar a nova" });
      await preencherMinimo(falhaNova);
      escrita.respostas.salvarVaga.push({
        ok: false,
        erro: { tipo: "configuracao", mensagem: "A função de servidor não respondeu neste ambiente. Reinicie o servidor de desenvolvimento." },
      });
      await falhaNova.clicar(falhaNova.acao("salvar"), "Salvar");
      afirmar(
        "falha de CONFIGURAÇÃO ao salvar: notifica com a frase do servidor e SEM \"Tentar de novo\" (repetir daria o mesmo)",
        avisos.erros.at(-1)?.[1] === "A função de servidor não respondeu neste ambiente. Reinicie o servidor de desenvolvimento." &&
          avisos.erros.at(-1)?.[2] === null,
        JSON.stringify(avisos.erros.at(-1)?.slice(0, 2)),
      );
      escrita.respostas.salvarVaga.push(FALHA_DE_REDE_AO_SALVAR);
      await falhaNova.clicar(falhaNova.acao("salvar"), "Salvar");
      afirmar(
        "falha de REDE ao salvar a Vaga nova: fica em `/nova`, não navega, a pendência continua, e a notificação traz \"Tentar de novo\"",
        falhaNova.onde() === "/admin/carreiras/vaga/nova" &&
          falhaNova.campo("titulo")?.value === "Analista de CS" &&
          falhaNova.perguntariaAoSair() === true &&
          escrita.chamadas.filter((c) => c.op === "salvarVaga").length === 2 &&
          avisos.erros.at(-1)?.[1] === FALHA_DE_REDE_AO_SALVAR.erro.mensagem &&
          avisos.erros.at(-1)?.[2]?.rotulo === "Tentar de novo",
        `${falhaNova.onde()} | ${JSON.stringify(avisos.erros.at(-1)?.[2]?.rotulo ?? null)}`,
      );
      escrita.respostas.salvarVaga.push(() => {
        throw new Error("dublê: a escrita lançou");
      });
      await falhaNova.clicar(falhaNova.acao("salvar"), "Salvar");
      afirmar(
        "exceção dentro do salvar: vira notificação (com \"Tentar de novo\", é `inesperado`), e a tela NÃO fica ocupada",
        falhaNova.ocioso() &&
          falhaNova.acao("salvar")?.disabled === false &&
          falhaNova.campo("titulo")?.disabled === false &&
          typeof avisos.erros.at(-1)?.[1] === "string" &&
          avisos.erros.at(-1)?.[1].trim() !== "" &&
          avisos.erros.at(-1)?.[2]?.rotulo === "Tentar de novo",
        JSON.stringify(avisos.erros.at(-1)?.slice(0, 2)),
      );
      /* Uma exceção que ESCAPA da escrita (aqui, a própria notificação de
         falha lança uma vez): a trava é solta no `finally`, e a tela avisa. */
      const errosAntesDoEscape = avisos.erros.length;
      avisos.lancarUmaVez = true;
      escrita.respostas.salvarVaga.push(FALHA_DE_REDE_AO_SALVAR);
      await falhaNova.clicar(falhaNova.acao("salvar"), "Salvar");
      afirmar(
        "exceção que escapa da escrita: a trava é solta (nada fica ocupado nem desabilitado) e a falha vira notificação",
        avisos.lancarUmaVez === false &&
          falhaNova.ocioso() &&
          falhaNova.acao("salvar")?.disabled === false &&
          falhaNova.campo("titulo")?.disabled === false &&
          falhaNova.voltar()?.disabled === false &&
          avisos.erros.length === errosAntesDoEscape + 1,
        JSON.stringify(avisos.erros.at(-1)?.slice(0, 2)),
      );
      escrita.respostas.salvarVaga.push(() => {
        throw new Error("dublê: a escrita lançou");
      });
      await falhaNova.clicar(falhaNova.acao("salvar"), "Salvar");
      await falhaNova.digitar(falhaNova.campo("resumo"), "Resumo digitado depois da falha.", "Resumo");
      escrita.respostas.salvarVaga.push((campos) => ({
        ok: true,
        dados: { operacao: "salvarVaga", criada: true, vaga: vagaGravada(ID_NOVA, campos, { estado: "rascunho", aberta_em: null }) },
      }));
      await falhaNova.acionarSaida(() => falhaNova.ocioso() && falhaNova.onde() !== "/admin/carreiras/vaga/nova");
      const repetida = escrita.chamadas.filter((c) => c.op === "salvarVaga").at(-1);
      afirmar(
        "\"Tentar de novo\" REPETE o salvar, com o que está na tela AGORA, e a Vaga nasce",
        escrita.chamadas.filter((c) => c.op === "salvarVaga").length === 6 &&
          repetida?.id === null &&
          repetida?.campos?.resumo === "Resumo digitado depois da falha." &&
          falhaNova.onde() === `/admin/carreiras/vaga/${ID_NOVA}` &&
          falhaNova.perguntariaAoSair() === false,
        `${falhaNova.onde()} | ${JSON.stringify(repetida?.campos?.resumo)}`,
      );
      await falhaNova.desmontar();

      /* ══ A tela sai no meio da criação ══ */
      const fugiu = await montar("/admin/carreiras/vaga/nova", { caso: "Saída durante a criação" });
      await preencherMinimo(fugiu);
      const criacaoSegurada = segurada(() => ({
        ok: true,
        dados: { operacao: "salvarVaga", criada: true, vaga: vagaGravada(ID_NOVA, {}, { estado: "rascunho", aberta_em: null }) },
      }));
      escrita.respostas.salvarVaga.push(criacaoSegurada.responder);
      await fugiu.clicar(fugiu.acao("salvar"), "Salvar", () => escrita.chamadas.length === 1);
      const sucessosAntesDaFuga = avisos.sucessos.length;
      await fugiu.irPara("/admin?aba=carreiras", () => fugiu.onde() === "/admin?aba=carreiras");
      criacaoSegurada.controle.soltar();
      await esperarAte(() => escrita.respostas.salvarVaga.length === 0, "Saída durante a criação: a resposta chega");
      await passo();
      await passo();
      afirmar(
        "a resposta de uma criação que chega DEPOIS de a tela sair é ignorada: a pessoa continua onde foi, sem navegação nem notificação fantasma",
        fugiu.onde() === "/admin?aba=carreiras" && avisos.sucessos.length === sucessosAntesDaFuga,
        `onde: ${fugiu.onde()} | sucessos novos: ${avisos.sucessos.length - sucessosAntesDaFuga}`,
      );
      await fugiu.desmontar();

      /* ══ A Vaga nasce, mas a resposta não traz o identificador ══ */
      const semId = await montar("/admin/carreiras/vaga/nova", { caso: "Criada sem identificador" });
      await preencherMinimo(semId);
      escrita.respostas.salvarVaga.push({ ok: true, dados: { operacao: "salvarVaga", criada: true, vaga: { titulo: "Analista de CS" } } });
      await semId.clicar(semId.acao("salvar"), "Salvar");
      afirmar(
        "criada SEM identificador na resposta: não navega, não fica editando com id nulo, e Salvar para (o próximo criaria outra Vaga)",
        semId.onde() === "/admin/carreiras/vaga/nova" &&
          semId.alvo.querySelector('[data-situacao="sem-identificador"]') !== null &&
          semId.acao("salvar")?.disabled === true &&
          semId.campo("titulo")?.value === "Analista de CS" &&
          escrita.chamadas.length === 1,
        `${semId.onde()} | salvar ${semId.acao("salvar")?.disabled}`,
      );
      await semId.clicar(semId.acao("salvar"), "Salvar (desabilitado)");
      afirmar("e o Salvar desabilitado não manda nada", escrita.chamadas.length === 1);
      await semId.desmontar();

      /* ══ Rascunho: faltando do servidor, Abrir com pendência, conflito ══ */
      const rascunho = await montar(`/admin/carreiras/vaga/${ID_RASCUNHO}`, { caso: "Rascunho" });
      afirmar(
        "Rascunho aberto: os valores do banco, a pílula de Estado do catálogo da Vaga e as ações da máquina SEM Excluir",
        rascunho.campo("titulo")?.value === "Analista de Suporte" &&
          rascunho.pilula() === "rascunho" &&
          igual(rascunho.acoes(), ["salvar", "abrir"]) &&
          rascunho.acharPorTexto(rascunho.alvo, "Excluir vaga") === null &&
          ![...rascunho.alvo.querySelectorAll("button")].some((b) => /Excluir/.test(b.textContent ?? "")) &&
          rascunho.perguntariaAoSair() === false,
        rascunho.acoes().join(", "),
      );
      await rascunho.digitar(rascunho.campo("resumo"), "Resumo editado e não salvo.", "Resumo");
      escrita.respostas.salvarVaga.push((campos, opcoes) => ({
        ok: true,
        dados: { operacao: "salvarVaga", criada: false, vaga: vagaGravada(opcoes.id, campos, { estado: "rascunho" }) },
      }));
      escrita.respostas.mudarEstadoDaVaga.push({
        ok: false,
        erro: {
          tipo: "dados_invalidos",
          mensagem: "Para abrir a vaga faltam o link de candidatura e o resumo.",
          faltando: ["link_de_candidatura", "resumo"],
        },
      });
      await rascunho.clicar(rascunho.acao("abrir"), "Abrir vaga");
      afirmar(
        "Abrir com pendência: `salvarVaga` e depois `mudarEstadoDaVaga(id, \"abrir\")`, nessa ordem",
        igual(
          escrita.chamadas.map((c) => [c.op, c.id ?? null, c.acao ?? null]),
          [
            ["salvarVaga", ID_RASCUNHO, null],
            ["mudarEstadoDaVaga", ID_RASCUNHO, "abrir"],
          ],
        ),
        JSON.stringify(escrita.chamadas.map((c) => [c.op, c.acao ?? null])),
      );
      afirmar(
        "Faltando do servidor: erro em Link e Resumo com o rótulo do domínio, os valores mantidos, e uma notificação sem \"Tentar de novo\"",
        rascunho.recusaDe("link_de_candidatura")?.includes(rotulos.link_de_candidatura) === true &&
          rascunho.recusaDe("resumo")?.includes(rotulos.resumo) === true &&
          rascunho.campo("resumo")?.value === "Resumo editado e não salvo." &&
          rascunho.pilula() === "rascunho" &&
          avisos.erros.at(-1)?.[1] === "Para abrir a vaga faltam o link de candidatura e o resumo." &&
          avisos.erros.at(-1)?.[2] === null,
        `${rascunho.recusaDe("link_de_candidatura")} | ${rascunho.recusaDe("resumo")} | ${JSON.stringify(avisos.erros.at(-1)?.slice(0, 2))}`,
      );

      escrita.chamadas.length = 0;
      await rascunho.digitar(rascunho.campo("resumo"), "Outra edição.", "Resumo");
      escrita.respostas.salvarVaga.push(FALHA_DE_REDE_AO_SALVAR);
      await rascunho.clicar(rascunho.acao("abrir"), "Abrir vaga");
      afirmar(
        "se o salvar falha, NÃO tenta abrir, e o que foi digitado continua na tela",
        igual(escrita.chamadas.map((c) => c.op), ["salvarVaga"]) &&
          rascunho.campo("resumo")?.value === "Outra edição." &&
          rascunho.perguntariaAoSair() === true,
        JSON.stringify(escrita.chamadas.map((c) => c.op)),
      );

      /* ── Conflito ── */
      escrita.chamadas.length = 0;
      await rascunho.digitar(rascunho.campo("slug"), "endereco-de-outra-vaga", "Slug");
      escrita.respostas.salvarVaga.push({
        ok: false,
        erro: { tipo: "conflito", mensagem: "Já existe uma vaga com este endereço. Escolha outro antes de salvar." },
      });
      await rascunho.clicar(rascunho.acao("salvar"), "Salvar");
      afirmar(
        "Conflito: o 409 no salvar marca o Slug com a frase do servidor, e o Slug digitado continua",
        rascunho.recusaDe("slug") === "Já existe uma vaga com este endereço. Escolha outro antes de salvar." &&
          rascunho.campo("slug")?.value === "endereco-de-outra-vaga" &&
          escrita.chamadas.length === 1,
        rascunho.recusaDe("slug"),
      );

      /* ── Abrir sem pendência, que dá certo: o Slug trava no GRAVADO ── */
      await rascunho.digitar(rascunho.campo("slug"), "analista-de-suporte", "Slug");
      await rascunho.digitar(rascunho.campo("resumo"), "Resumo editado e não salvo.", "Resumo");
      escrita.chamadas.length = 0;
      escrita.respostas.mudarEstadoDaVaga.push({
        ok: true,
        dados: {
          operacao: "mudarEstadoDaVaga",
          acao: "abrir",
          estadoAnterior: "rascunho",
          vaga: vagaGravada(ID_RASCUNHO, {}, {
            titulo: "Analista de Suporte (como gravado)",
            resumo: "Resumo editado e não salvo.",
            slug: "analista-de-suporte-2",
            estado: "aberta",
            aberta_em: "2026-09-25T12:00:00Z",
          }),
        },
      });
      await rascunho.clicar(rascunho.acao("abrir"), "Abrir vaga");
      afirmar(
        "Abrir sem pendência muda o Estado direto (sem salvar antes), e depois da abertura o Slug fica só leitura, com o motivo, e as ações passam a Encerrar",
        igual(escrita.chamadas.map((c) => c.op), ["mudarEstadoDaVaga"]) &&
          rascunho.pilula() === "aberta" &&
          rascunho.campo("slug")?.readOnly === true &&
          igual(rascunho.acoes(), ["salvar", "encerrar"]),
        `${JSON.stringify(escrita.chamadas.map((c) => c.op))} | ${rascunho.pilula()} | ${rascunho.acoes().join(", ")}`,
      );
      afirmar(
        "depois da ação, a tela mostra a Vaga DEVOLVIDA: o título do servidor, o Slug GRAVADO no campo travado, sem pendência, e a notificação usa o título devolvido",
        rascunho.campo("titulo")?.value === "Analista de Suporte (como gravado)" &&
          rascunho.campo("slug")?.value === "analista-de-suporte-2" &&
          rascunho.perguntariaAoSair() === false &&
          avisos.sucessos.at(-1)?.[0] === "Vaga aberta" &&
          avisos.sucessos.at(-1)?.[1] === "Analista de Suporte (como gravado)",
        `${rascunho.campo("titulo")?.value} | ${rascunho.campo("slug")?.value} | ${JSON.stringify(avisos.sucessos.at(-1))}`,
      );
      await rascunho.desmontar();

      /* ══ Encerrada: Slug travado, recusa em Reabrir, Reabrir com pendência ══ */
      const encerrada = await montar(`/admin/carreiras/vaga/${ID_ENCERRADA}`, { caso: "Encerrada" });
      const ajudaDoSlug = encerrada.alvo.querySelector('[data-papel="ajuda-do-slug"]')?.textContent ?? "";
      await encerrada.digitar(encerrada.campo("titulo"), "Vaga encerrada com novo título", "título");
      afirmar(
        "Slug travado: na Encerrada o Slug é só leitura, com o motivo ao lado, e o título não o reescreve",
        encerrada.campo("slug")?.readOnly === true &&
          encerrada.campo("slug")?.getAttribute("aria-readonly") === "true" &&
          encerrada.campo("slug")?.value === "vaga-encerrada" &&
          ajudaDoSlug === formulario?.MOTIVO_DO_SLUG_TRAVADO,
        ajudaDoSlug,
      );
      afirmar(
        "na Encerrada: Reabrir vaga disponível e Excluir AUSENTE",
        igual(encerrada.acoes(), ["salvar", "reabrir"]) &&
          encerrada.pilula() === "encerrada" &&
          ![...encerrada.alvo.querySelectorAll("button")].some((b) => /Excluir/.test(b.textContent ?? "")) &&
          encerrada.alvo.querySelector('button[data-acao="excluir"]') === null,
        encerrada.acoes().join(", "),
      );
      escrita.respostas.salvarVaga.push((campos, opcoes) => ({
        ok: true,
        dados: { operacao: "salvarVaga", criada: false, vaga: vagaGravada(opcoes.id, campos, { slug: "vaga-encerrada", estado: "encerrada", aberta_em: "2026-08-01T12:00:00Z" }) },
      }));
      escrita.respostas.mudarEstadoDaVaga.push({
        ok: false,
        erro: { tipo: "dados_invalidos", mensagem: "Para reabrir a vaga falta o link de candidatura.", faltando: ["link_de_candidatura"] },
      });
      await encerrada.clicar(encerrada.acao("reabrir"), "Reabrir vaga");
      const doReabrir = escrita.chamadas[0];
      afirmar(
        "Reabrir com pendência também salva antes, e o corpo do salvamento NÃO leva o Slug travado",
        igual(escrita.chamadas.map((c) => [c.op, c.acao ?? null]), [["salvarVaga", null], ["mudarEstadoDaVaga", "reabrir"]]) &&
          doReabrir?.campos?.titulo === "Vaga encerrada com novo título" &&
          !Object.hasOwn(doReabrir?.campos ?? { slug: 1 }, "slug"),
        JSON.stringify(escrita.chamadas.map((c) => [c.op, c.acao ?? null, c.campos ? Object.keys(c.campos) : null])),
      );
      afirmar(
        "recusa em REABRIR: a Vaga continua Encerrada, o campo do servidor é marcado, e os valores ficam na tela",
        encerrada.pilula() === "encerrada" &&
          encerrada.campo("titulo")?.value === "Vaga encerrada com novo título" &&
          encerrada.recusaDe("link_de_candidatura")?.includes(rotulos.link_de_candidatura) === true &&
          igual(encerrada.acoes(), ["salvar", "reabrir"]),
        `${encerrada.pilula()} | ${encerrada.campo("titulo")?.value}`,
      );
      escrita.chamadas.length = 0;
      escrita.respostas.mudarEstadoDaVaga.push({
        ok: true,
        dados: { operacao: "mudarEstadoDaVaga", acao: "reabrir", vaga: vagaGravada(ID_ENCERRADA, {}, { titulo: "Vaga encerrada com novo título", slug: "vaga-encerrada", estado: "aberta", aberta_em: "2026-08-01T12:00:00Z" }) },
      });
      await encerrada.clicar(encerrada.acao("reabrir"), "Reabrir vaga");
      afirmar(
        "e Reabrir de novo, já sem pendência (o salvar anterior gravou), só muda o Estado",
        igual(escrita.chamadas.map((c) => c.op), ["mudarEstadoDaVaga"]) && encerrada.pilula() === "aberta",
        JSON.stringify(escrita.chamadas.map((c) => c.op)),
      );
      await encerrada.desmontar();

      /* ══ Aberta: Encerrar com pendência salva antes, recusa em Encerrar, e "Tentar de novo" ══ */
      const aberta = await montar(`/admin/carreiras/vaga/${ID_ABERTA}`, { caso: "Aberta" });
      afirmar(
        "Aberta: Slug só leitura com o gravado, e a ação é Encerrar",
        aberta.pilula() === "aberta" &&
          aberta.campo("slug")?.readOnly === true &&
          aberta.campo("slug")?.value === "vaga-aberta-de-verdade" &&
          igual(aberta.acoes(), ["salvar", "encerrar"]),
        aberta.acoes().join(", "),
      );
      await aberta.digitar(aberta.campo("titulo"), "Vaga aberta com título novo", "título");
      escrita.respostas.salvarVaga.push({
        ok: false,
        erro: { tipo: "dados_invalidos", mensagem: "O título da vaga passa do tamanho permitido. Encurte antes de salvar.", faltando: ["titulo"] },
      });
      await aberta.clicar(aberta.acao("encerrar"), "Encerrar vaga");
      afirmar(
        "Encerrar com pendência SALVA ANTES; se o salvar falha, não tenta encerrar, e a Vaga continua Aberta",
        igual(escrita.chamadas.map((c) => c.op), ["salvarVaga"]) &&
          aberta.pilula() === "aberta" &&
          aberta.campo("titulo")?.value === "Vaga aberta com título novo" &&
          aberta.recusaDe("titulo")?.includes(rotulos.titulo) === true,
        JSON.stringify(escrita.chamadas.map((c) => c.op)),
      );
      escrita.chamadas.length = 0;
      escrita.respostas.salvarVaga.push((campos, opcoes) => ({
        ok: true,
        dados: { operacao: "salvarVaga", criada: false, vaga: vagaGravada(opcoes.id, campos, { slug: "vaga-aberta-de-verdade", estado: "aberta", aberta_em: "2026-09-10T12:00:00Z" }) },
      }));
      escrita.respostas.mudarEstadoDaVaga.push({
        ok: false,
        erro: { tipo: "dados_invalidos", mensagem: "A vaga mudou de estado em outra aba. Recarregue antes de encerrar." },
      });
      await aberta.clicar(aberta.acao("encerrar"), "Encerrar vaga");
      afirmar(
        "Encerrar com pendência: `salvarVaga` e depois `mudarEstadoDaVaga(id, \"encerrar\")`; a recusa em ENCERRAR mantém a Vaga Aberta, os valores na tela, e notifica sem \"Tentar de novo\"",
        igual(escrita.chamadas.map((c) => [c.op, c.acao ?? null]), [["salvarVaga", null], ["mudarEstadoDaVaga", "encerrar"]]) &&
          aberta.pilula() === "aberta" &&
          aberta.campo("titulo")?.value === "Vaga aberta com título novo" &&
          avisos.erros.at(-1)?.[1] === "A vaga mudou de estado em outra aba. Recarregue antes de encerrar." &&
          avisos.erros.at(-1)?.[2] === null,
        JSON.stringify(escrita.chamadas.map((c) => [c.op, c.acao ?? null])),
      );
      escrita.chamadas.length = 0;
      escrita.respostas.mudarEstadoDaVaga.push({
        ok: false,
        erro: { tipo: "rede", mensagem: "Não conseguimos falar com o servidor para encerrar a vaga. Confira a conexão e tente de novo." },
      });
      await aberta.clicar(aberta.acao("encerrar"), "Encerrar vaga");
      afirmar(
        "falha de REDE ao encerrar (sem pendência): só `mudarEstadoDaVaga`, a Vaga continua Aberta, e a notificação traz \"Tentar de novo\"",
        igual(escrita.chamadas.map((c) => c.op), ["mudarEstadoDaVaga"]) &&
          aberta.pilula() === "aberta" &&
          avisos.erros.at(-1)?.[2]?.rotulo === "Tentar de novo",
        JSON.stringify(avisos.erros.at(-1)?.slice(0, 2)),
      );
      escrita.chamadas.length = 0;
      escrita.respostas.mudarEstadoDaVaga.push({
        ok: true,
        dados: { operacao: "mudarEstadoDaVaga", acao: "encerrar", vaga: vagaGravada(ID_ABERTA, {}, { titulo: "Vaga aberta com título novo", slug: "vaga-aberta-de-verdade", estado: "encerrada", aberta_em: "2026-09-10T12:00:00Z" }) },
      });
      await aberta.acionarSaida();
      afirmar(
        "\"Tentar de novo\" REPETE a mudança de Estado, e a Vaga fica Encerrada",
        igual(escrita.chamadas.map((c) => [c.op, c.acao ?? null]), [["mudarEstadoDaVaga", "encerrar"]]) &&
          aberta.pilula() === "encerrada" &&
          igual(aberta.acoes(), ["salvar", "reabrir"]) &&
          avisos.sucessos.at(-1)?.[0] === "Vaga encerrada",
        `${JSON.stringify(escrita.chamadas.map((c) => c.op))} | ${aberta.pilula()}`,
      );
      await aberta.desmontar();

      /* ══ Documento fora da projeção ══ */
      const errosAntesDaCitacao = avisos.erros.length;
      const citacao = await montar(`/admin/carreiras/vaga/${ID_COM_CITACAO}`, { caso: "Documento fora da projeção" });
      const textoDoEditor = citacao.alvo.querySelector('[role="textbox"]');
      /* TROCA REGISTRADA (revisão da 5.4): antes, o aviso também virava
         notificação (+1 em `erros`). Agora ele fica SÓ no editor, que já o
         desenha: a mesma frase em dois lugares era ruído. */
      afirmar(
        "Documento fora da projeção: a Vaga com citação gravada à força abre SEM ela, com o aviso de conteúdo limpo NO EDITOR (e nenhuma notificação por cima)",
        textoDoEditor !== null &&
          textoDoEditor.querySelector("blockquote") === null &&
          (textoDoEditor.textContent ?? "").includes("Texto que fica") &&
          !(textoDoEditor.textContent ?? "").includes("Citação gravada à força") &&
          citacao.alvo.querySelector('[data-gravidade="limpo"]') !== null &&
          avisos.erros.length === errosAntesDaCitacao,
        `${textoDoEditor?.innerHTML?.slice(0, 160)} | notificações: ${avisos.erros.length - errosAntesDaCitacao}`,
      );
      await citacao.desmontar();

      /* ══ Sair com pendência ══ */
      const saida = await montar(`/admin/carreiras/vaga/${ID_RASCUNHO}`, { caso: "Sair com pendência" });
      await saida.digitar(saida.campo("resumo"), "Algo que ainda não foi salvo.", "Resumo");
      await saida.clicar(saida.voltar(), "Voltar");
      const dialogo = saida.dialogo();
      afirmar(
        "Sair com pendência: Voltar abre o diálogo com as frases de `pendencia.js` e fica na tela",
        dialogo !== null &&
          (dialogo.textContent ?? "").includes("Sair sem salvar?") &&
          (dialogo.textContent ?? "").includes("Analista de Suporte") &&
          saida.acharPorTexto(dialogo, "Sair sem salvar") !== null &&
          saida.acharPorTexto(dialogo, "Continuar editando") !== null &&
          saida.onde() === `/admin/carreiras/vaga/${ID_RASCUNHO}`,
        (dialogo?.textContent ?? "").slice(0, 200),
      );
      await saida.clicar(saida.acharPorTexto(dialogo, "Continuar editando"), "Continuar editando", () => saida.dialogo() === null);
      afirmar(
        "\"Continuar editando\" fecha o diálogo e mantém tudo",
        saida.dialogo() === null &&
          saida.campo("resumo")?.value === "Algo que ainda não foi salvo." &&
          saida.onde() === `/admin/carreiras/vaga/${ID_RASCUNHO}`,
      );
      await saida.clicar(saida.voltar(), "Voltar", () => saida.dialogo() !== null);
      const dialogoDeNovo = saida.dialogo();
      await saida.clicar(saida.acharPorTexto(dialogoDeNovo, "Sair sem salvar"), "Sair sem salvar", () => saida.onde() === "/admin?aba=carreiras");
      afirmar(
        "e \"Sair sem salvar\" volta para `/admin?aba=carreiras` (a aba Carreiras)",
        dialogoDeNovo !== null && saida.onde() === "/admin?aba=carreiras",
        saida.onde(),
      );
      await saida.desmontar();

      /* ══ Id inexistente ══ */
      const inexistente = await montar(`/admin/carreiras/vaga/${ID_QUE_NAO_EXISTE}`, { caso: "Id inexistente" });
      const blocoInexistente = inexistente.alvo.querySelector('[data-situacao="inexistente"]');
      afirmar(
        "Id inexistente: estado de erro PRÓPRIO (distinto de vazio e da falha de leitura), com volta à listagem",
        blocoInexistente !== null &&
          blocoInexistente.getAttribute("role") === "alert" &&
          inexistente.alvo.querySelector('[data-situacao="erro"]') === null &&
          inexistente.alvo.querySelector('[data-papel="tentar-de-novo"]') === null &&
          inexistente.campo("titulo") === null,
      );
      const volta = inexistente.alvo.querySelector('[data-papel="voltar-para-listagem"]');
      await inexistente.clicar(volta, "Voltar para a listagem", () => inexistente.onde() === "/admin?aba=carreiras");
      afirmar("e a volta leva a `/admin?aba=carreiras` (a aba Carreiras)", volta !== null && inexistente.onde() === "/admin?aba=carreiras", inexistente.onde());
      await inexistente.desmontar();

      /* ══ Id torto na URL, e Vaga lida como nula ══ */
      const torto = await montar("/admin/carreiras/vaga/nao-e-um-uuid", { caso: "Id torto" });
      afirmar(
        "Id torto na URL: estado \"inexistente\" SEM ir à rede (nem a Vaga, nem as Classificações são lidas)",
        torto.situacao() === "inexistente" && leitura.chamadas.length === 0,
        `${torto.situacao()} | leituras: ${JSON.stringify(leitura.chamadas)}`,
      );
      await torto.desmontar();
      const nula = await montar(`/admin/carreiras/vaga/${ID_DADOS_NULOS}`, { caso: "Vaga lida como nula" });
      afirmar(
        "leitura que responde `ok` com a Vaga nula: estado \"inexistente\", e não formulário vazio nem exceção",
        nula.situacao() === "inexistente" && nula.campo("titulo") === null,
        nula.situacao(),
      );
      await nula.desmontar();

      /* ══ Erro de carga: a Vaga, as Classificações e a exceção ══ */
      leitura.falharLeitura = true;
      const falha = await montar(`/admin/carreiras/vaga/${ID_RASCUNHO}`, { caso: "Erro de carga da Vaga" });
      const tentar = falha.alvo.querySelector('[data-papel="tentar-de-novo"]');
      afirmar(
        "Erro de carga: a leitura que falha por rede mostra o erro com \"tentar de novo\", e não o formulário vazio",
        falha.alvo.querySelector('[data-situacao="erro"]') !== null &&
          tentar !== null &&
          falha.campo("titulo") === null &&
          falha.alvo.querySelector('[data-situacao="inexistente"]') === null,
      );
      leitura.falharLeitura = false;
      await falha.clicar(tentar, "Tentar de novo", () => falha.situacao() === "pronta");
      afirmar(
        "e \"tentar de novo\" relê e abre o formulário",
        falha.alvo.querySelector('[data-situacao="pronta"]') !== null &&
          falha.campo("titulo")?.value === "Analista de Suporte",
      );
      await falha.desmontar();

      leitura.falharClassificacoes = true;
      const semListas = await montar("/admin/carreiras/vaga/nova", { caso: "Falha ao ler as Classificações" });
      afirmar(
        "falha ao ler as CLASSIFICAÇÕES: erro de carga com a frase da leitura e \"tentar de novo\", nunca o formulário sem listas",
        semListas.situacao() === "erro" &&
          semListas.campo("titulo") === null &&
          (semListas.alvo.querySelector('[data-papel="motivo-da-carga"]')?.textContent ?? "").includes("classificações") &&
          semListas.alvo.querySelector('[data-papel="tentar-de-novo"]') !== null,
        semListas.situacao(),
      );
      leitura.falharClassificacoes = false;
      await semListas.clicar(semListas.alvo.querySelector('[data-papel="tentar-de-novo"]'), "Tentar de novo", () => semListas.situacao() === "pronta");
      afirmar("e \"tentar de novo\" carrega as listas", semListas.situacao() === "pronta" && opcoesDe(semListas, "nivel_id").length === 3);
      await semListas.desmontar();

      leitura.lancar = true;
      const lancou = await montar(`/admin/carreiras/vaga/${ID_RASCUNHO}`, { caso: "Leitura que lança" });
      afirmar(
        "leitura que LANÇA: erro de carga com frase de reserva e \"tentar de novo\", nunca esqueleto eterno",
        lancou.situacao() === "erro" &&
          (lancou.alvo.querySelector('[data-papel="motivo-da-carga"]')?.textContent ?? "").trim().length > 10 &&
          lancou.alvo.querySelector('[data-papel="tentar-de-novo"]') !== null,
        lancou.situacao(),
      );
      leitura.lancar = false;
      await lancou.desmontar();

      /* ══ Lista de Classificação vazia (e o que não é lista) ══ */
      leitura.classificacoes = { ...CLASSIFICACOES_DO_BANCO, niveis: [], tipos_de_vaga: "não é lista" };
      const listaVazia = await montar("/admin/carreiras/vaga/nova", { caso: "Lista de Classificação vazia" });
      afirmar(
        "lista de Classificação vazia (ou que não é lista): o `<select>` só tem o texto de escolha, e a tela abre",
        listaVazia.situacao() === "pronta" &&
          opcoesDe(listaVazia, "nivel_id").length === 1 &&
          opcoesDe(listaVazia, "tipo_id").length === 1 &&
          opcoesDe(listaVazia, "departamento_id").length === 3,
        `${opcoesDe(listaVazia, "nivel_id").join(", ")} | ${opcoesDe(listaVazia, "tipo_id").join(", ")}`,
      );
      await listaVazia.digitar(listaVazia.campo("titulo"), "Analista de CS", "título");
      await listaVazia.digitar(listaVazia.campo("departamento_id"), UUID_DEPARTAMENTO, "Departamento");
      await listaVazia.clicar(listaVazia.acao("salvar"), "Salvar");
      afirmar(
        "e salvar sem Nível e sem Tipo marca os dois, sem ir ao servidor",
        listaVazia.recusaDe("nivel_id") !== null && listaVazia.recusaDe("tipo_id") !== null && escrita.chamadas.length === 0,
      );
      await listaVazia.desmontar();
      leitura.classificacoes = CLASSIFICACOES_DO_BANCO;

      /* ══ Classificação gravada que não está mais na lista ══ */
      const sumido = await montar(`/admin/carreiras/vaga/${ID_NIVEL_SUMIDO}`, { caso: "Classificação fora da lista" });
      const opcaoAusente = sumido.campo("nivel_id")?.querySelector('[data-papel="classificacao-ausente"]') ?? null;
      afirmar(
        "Classificação gravada fora da lista: o `<select>` mostra \"(não existe mais)\" com o id gravado, e o campo já abre marcado",
        sumido.campo("nivel_id")?.value === UUID_NIVEL_QUE_SUMIU &&
          opcaoAusente !== null &&
          (opcaoAusente.textContent ?? "").includes("(não existe mais)") &&
          (opcaoAusente.textContent ?? "").includes(UUID_NIVEL_QUE_SUMIU) &&
          sumido.recusaDe("nivel_id")?.includes(rotulos.nivel_id) === true,
        `${sumido.campo("nivel_id")?.value} | ${opcaoAusente?.textContent} | ${sumido.recusaDe("nivel_id")}`,
      );
      await sumido.digitar(sumido.campo("resumo"), "Resumo mexido.", "Resumo");
      await sumido.clicar(sumido.acao("salvar"), "Salvar");
      afirmar(
        "e salvar com ela NÃO manda o id oculto: a recusa é local",
        escrita.chamadas.length === 0 && sumido.recusaDe("nivel_id") !== null,
      );
      await sumido.digitar(sumido.campo("nivel_id"), UUID_NIVEL, "Nível");
      escrita.respostas.salvarVaga.push((campos, opcoes) => ({
        ok: true,
        dados: { operacao: "salvarVaga", criada: false, vaga: vagaGravada(opcoes.id, campos, { slug: "vaga-com-nivel-sumido" }) },
      }));
      await sumido.clicar(sumido.acao("salvar"), "Salvar");
      afirmar(
        "escolhido um Nível da lista, salva com ele, e a opção \"(não existe mais)\" some",
        escrita.chamadas.length === 1 &&
          escrita.chamadas[0].campos.nivel_id === UUID_NIVEL &&
          sumido.campo("nivel_id")?.querySelector('[data-papel="classificacao-ausente"]') === null,
        JSON.stringify(escrita.chamadas.map((c) => c.campos?.nivel_id)),
      );
      await sumido.desmontar();

      /* ══ Troca de Vaga dentro do mesmo roteador ══ */
      const troca = await montar(`/admin/carreiras/vaga/${ID_RASCUNHO}`, { caso: "Troca de Vaga" });
      const textoAntes = troca.textoDoEditor();
      await troca.irPara(`/admin/carreiras/vaga/${ID_OUTRA}`, () => troca.situacao() === "pronta" && troca.campo("titulo")?.value === "Outra vaga qualquer");
      afirmar(
        "Troca de Vaga: navegar de uma Vaga para outra RELÊ e recarrega o formulário E o editor (comportamento, não a `key` no texto)",
        troca.onde() === `/admin/carreiras/vaga/${ID_OUTRA}` &&
          troca.campo("titulo")?.value === "Outra vaga qualquer" &&
          troca.campo("resumo")?.value === "Resumo da outra." &&
          (textoAntes ?? "").includes("Descrição da vaga.") &&
          (troca.textoDoEditor() ?? "").includes("Descrição da outra vaga.") &&
          !(troca.textoDoEditor() ?? "").includes("Descrição da vaga.") &&
          leitura.chamadas.some((c) => c[0] === "vaga" && c[1] === ID_OUTRA),
        `título ${troca.campo("titulo")?.value} | editor ${troca.textoDoEditor()}`,
      );
      await troca.desmontar();

      afirmar(
        "toda notificação da tela passou pela regra de voz (nenhuma frase vaga, nenhum rótulo de ação genérico)",
        avisos.problemasDeVoz.length === 0 && avisos.erros.length > 0 && avisos.sucessos.length > 0,
        avisos.problemasDeVoz.join(" | "),
      );
    } catch (erro) {
      afirmar("a tela montada rodou até o fim sem exceção", false, erro?.stack ?? String(erro));
    } finally {
      console.error = erroOriginal;
      try {
        janela.close();
      } catch {
        /* o navegador de mentira já pode ter fechado */
      }
    }
  }
  try {
    rmSync(pasta, { recursive: true, force: true });
  } catch {
    /* presa pelo processo no Windows: a próxima execução varre na entrada */
  }
}

/* ─── (p) A aba Carreiras modular (Story 5.5) ────────────────────────────── */

secao("(p) a aba Carreiras modular: o legado fora, a listagem pura e a aba montada com dublês (Story 5.5)");

/*
 * Três partes, todas LOCAIS (sem token, sem rede):
 *
 * - ESTÁTICA: o Carreiras antigo saiu do repositório (o arquivo e todo nome
 *   dele, em qualquer fonte de `src/`); a página do Painel só declara a aba,
 *   guarda `contagemDeVagas` e monta `<AbaDeCarreiras>` no `tabpanel`; a faixa
 *   do Blog não é mais um ternário; a lista não esconde ação atrás de hover.
 * - NODE: `listagem.js` e a aparência da Cor, importados e executados.
 * - MONTADA: `AbaDeCarreiras` e `AdminBlog` compilados pelo empacotador da
 *   aplicação, com dublês de `@/data/carreiras/leitura`,
 *   `@/data/carreiras/escrita` e das notificações por apelido, cobrindo a
 *   matriz de I/O da story.
 */

{
  /* ── O legado fora ── */
  const LEGADO =
    /\b(vagasStore|getVagas|saveVaga|deleteVaga|resetVagas|QuotaExceededError|ehCotaEstourada|comoResolver)\b/;
  afirmar(
    "autoteste: o detector do legado acusa cada nome antigo e absolve os nomes novos da camada",
    LEGADO.test('import { getVagas } from "@/lib/vagasStore";') &&
      LEGADO.test("saveVaga(vaga);") &&
      LEGADO.test("setVagas(deleteVaga(id));") &&
      LEGADO.test("setVagas(resetVagas());") &&
      LEGADO.test('if (erro.name === "QuotaExceededError") return;') &&
      LEGADO.test("ehCotaEstourada(erro)") &&
      LEGADO.test('comoResolver(erro, "salvar")') &&
      !LEGADO.test('import { excluirVaga, salvarVaga } from "@/data/carreiras/escrita";') &&
      !LEGADO.test("const vagas = await listarVagasDoPainel();"),
  );
  const fontesDoSrc = arquivosDoDiretorio("src");
  const citam = fontesDoSrc.filter((arquivo) => LEGADO.test(ler(arquivo) ?? ""));
  afirmar(
    "nenhum fonte de `src/` cita `vagasStore`, `getVagas`, `saveVaga`, `deleteVaga`, `resetVagas`, `QuotaExceededError`, `ehCotaEstourada` ou `comoResolver` (nem em comentário)",
    fontesDoSrc.length > 50 && citam.length === 0,
    citam.join(", ") || `${fontesDoSrc.length} fonte(s)`,
  );
  afirmar("`src/lib/vagasStore.js` não existe", !existsSync(path.join(raiz, "src/lib/vagasStore.js")));

  const publica = semComentarios(ler("src/pages/Carreiras.jsx") ?? "");
  /* TROCA REGISTRADA (Story 5.7): a metade "mostra a lista vazia até a Story
     5.7" (`const vagas = [];`) virou "lê `listarVagasAbertas` de
     `@/data/carreiras/leitura`", e a lista vazia fixa passou a ser proibida.
     A metade do armazenamento antigo continua igual. */
  afirmar(
    "`src/pages/Carreiras.jsx` não importa o armazenamento antigo e lê `listarVagasAbertas` de `@/data/carreiras/leitura` (sem lista vazia fixa)",
    publica !== "" &&
      !/lib\/vagasStore/.test(publica) &&
      !/const vagas = \[\];/.test(publica) &&
      /import\s*\{[^}]*\blistarVagasAbertas\b[^}]*\}\s*from\s*["']@\/data\/carreiras\/leitura["']/.test(publica) &&
      /\blistarVagasAbertas\(\)/.test(publica),
  );

  /* ── A página só declara a aba ── */
  const fonteDaPagina = ler("src/pages/AdminBlog.jsx") ?? "";
  const pagina = semComentarios(fonteDaPagina);
  const estadosDaPagina = [...pagina.matchAll(/const \[(\w+), set\w+\] = useState\(/g)].map((m) => m[1]).sort();
  /* TROCA REGISTRADA (revisão da 5.5): `activeTab` saiu da lista. A aba
     ativa deixou de ser estado inicializado pela URL e passou a ser DERIVADA
     dela a cada renderização (a asserção logo abaixo, e a montada). */
  const ESTADOS_DA_PAGINA = [
    "contagemDePosts",
    "versaoDaLista",
    "blogView",
    "editingPost",
    "contagemDeVagas",
    "buscaDePosts",
    "estadosDoFiltro",
    "periodoDoFiltro",
    "filtroDeDataAberto",
  ].sort();
  afirmar(
    "`AdminBlog.jsx` guarda de Carreiras só `contagemDeVagas`: os estados da página são exatamente os do Blog, a aba ativa e essa contagem",
    igual(estadosDaPagina, ESTADOS_DA_PAGINA),
    `a mais: ${estadosDaPagina.filter((e) => !ESTADOS_DA_PAGINA.includes(e)).join(", ")} | a menos: ${ESTADOS_DA_PAGINA.filter((e) => !estadosDaPagina.includes(e)).join(", ")}`,
  );
  afirmar(
    "a aba ativa é DERIVADA do parâmetro `?aba=` (não é estado), e trocar de aba escreve o parâmetro com `replace`",
    /const activeTab = parametros\.get\(PARAMETRO_DA_ABA\) === ABA_DE_CARREIRAS \? ABA_DE_CARREIRAS : "blog";/.test(pagina) &&
      !/\bsetActiveTab\b/.test(pagina) &&
      /const \[parametros, setParametros\] = useSearchParams\(\)/.test(pagina) &&
      /setParametros\([\s\S]*?\{\s*replace:\s*true\s*\}\s*,?\s*\)/.test(pagina) &&
      /aoTrocarAba=\{trocarDeAba\}/.test(pagina),
  );
  const RESTOS = [
    "VagaForm",
    "VAGA_COLORS",
    "DEPARTAMENTOS",
    "NIVEL_COLORS",
    "EMPTY_VAGA",
    "acoesDaAba",
    "Restaurar",
    "filteredVagas",
    "vagasSearch",
    "<DialogoDeConfirmacao",
    "Buscar vagas",
    "Nova Vaga",
    'data-busca="vagas"',
  ];
  const restos = RESTOS.filter((termo) => pagina.includes(termo));
  afirmar(
    "a página não tem formulário, lista, filtro, busca nem diálogo de Vaga, nem Restaurar nem `acoesDaAba`",
    restos.length === 0,
    restos.join(", "),
  );
  afirmar(
    "a página não importa nada de `data/carreiras` (nem a escrita): a aba lê e escreve pelo módulo dela",
    !/from\s*["'][^"']*data\/carreiras\//.test(pagina),
  );
  const inicioDoPainel = pagina.indexOf('role="tabpanel"');
  const montagemDaAba = pagina.search(/\{activeTab === ABA_DE_CARREIRAS && <AbaDeCarreiras aoContar=\{setContagemDeVagas\} \/>\}/);
  afirmar(
    "`<AbaDeCarreiras aoContar={setContagemDeVagas} />` é montada DENTRO do `tabpanel`, só com a aba Carreiras ativa, e a contagem da aba é `contagemDeVagas` formatada",
    inicioDoPainel !== -1 &&
      montagemDaAba > inicioDoPainel &&
      (pagina.match(/<AbaDeCarreiras\b/g) ?? []).length === 1 &&
      /import AbaDeCarreiras from ["']@\/admin\/carreiras\/AbaDeCarreiras["']/.test(pagina) &&
      /contagem: contagemDeVagas === null \? null : formatarNumero\(contagemDeVagas\)/.test(pagina),
  );
  /* A faixa: a do Blog fica SÓ no ramo do Blog, e não há mais o ternário de
     dois ramos (`activeTab === "blog" ? (…) : (…)`) em volta dela. */
  const inicioDaFaixaDoBlog = pagina.search(/\{activeTab === "blog" && \(\s*<motion\.div/);
  const campoDoBlog = pagina.indexOf('data-busca="posts"');
  afirmar(
    "a faixa de busca não é mais um ternário: a do Blog está só no ramo do Blog, antes do `tabpanel`",
    !/activeTab\s*===\s*["']blog["']\s*\?/.test(pagina) &&
      !/activeTab\s*===\s*["']carreiras["']\s*\?/.test(pagina) &&
      inicioDaFaixaDoBlog !== -1 &&
      campoDoBlog > inicioDaFaixaDoBlog &&
      campoDoBlog < inicioDoPainel,
    `faixa ${inicioDaFaixaDoBlog} | campo ${campoDoBlog} | tabpanel ${inicioDoPainel}`,
  );

  /* ── A lista: nada escondido atrás de hover, e UM diálogo ── */
  const lista = semComentarios(ler(`${DIR_TELAS_DE_CARREIRAS}/ListaDeVagas.jsx`) ?? "");
  const aba = semComentarios(ler(`${DIR_TELAS_DE_CARREIRAS}/AbaDeCarreiras.jsx`) ?? "");
  afirmar(
    "a lista e a faixa de Vagas não revelam nada só com hover (`group-hover`, `opacity-0`, `invisible`)",
    lista !== "" && aba !== "" && ![lista, aba].some((t) => /group-hover|\bopacity-0\b|\binvisible\b/.test(t)),
  );
  afirmar(
    "a lista monta UM `DialogoDeConfirmacao`, sempre, controlado por `aberto`, com o rótulo do módulo puro",
    (lista.match(/<DialogoDeConfirmacao\b/g) ?? []).length === 1 &&
      /aberto=\{paraExcluir !== null\}/.test(lista) &&
      /rotuloDeConfirmacao=\{ROTULO_DE_CONFIRMAR_EXCLUSAO\}/.test(lista),
  );
  afirmar(
    "a lista e a aba leem e escrevem pelos apelidos exatos da camada, e as ações de Estado vêm de `listagem.js` (que as lê da tabela do domínio)",
    /import\s*\{[^}]*\blistarVagasDoPainel\b[^}]*\}\s*from\s*["']@\/data\/carreiras\/leitura["']/.test(lista) &&
      /import\s*\{[^}]*\blistarClassificacoesDoPainel\b[^}]*\}\s*from\s*["']@\/data\/carreiras\/leitura["']/.test(lista) &&
      /import\s*\{[^}]*\bmudarEstadoDaVaga\b[^}]*\}\s*from\s*["']@\/data\/carreiras\/escrita["']/.test(lista) &&
      /import\s*\{[^}]*\bexcluirVaga\b[^}]*\}\s*from\s*["']@\/data\/carreiras\/escrita["']/.test(lista) &&
      /\bacoesDoEstadoDaVaga\(/.test(semComentarios(ler(`${DIR_TELAS_DE_CARREIRAS}/listagem.js`) ?? "")),
  );
  /* Revisão da 5.5: o tipo "não encontrado" comparado com o erro de uma
     ESCRITA vem do módulo da escrita; e as funções de falha, do módulo neutro. */
  afirmar(
    "a lista compara o erro de escrita com o `ERRO_NAO_ENCONTRADO` de `@/data/carreiras/escrita` (não o da leitura), e lê as falhas de `falhas.js`, não de `formulario.js`",
    /import\s*\{[^}]*\bERRO_NAO_ENCONTRADO\b[^}]*\}\s*from\s*["']@\/data\/carreiras\/escrita["']/.test(lista) &&
      !/import\s*\{[^}]*\bERRO_NAO_ENCONTRADO\b[^}]*\}\s*from\s*["']@\/data\/carreiras\/leitura["']/.test(lista) &&
      /import\s*\{[^}]*\bfalhaPassageira\b[^}]*\}\s*from\s*["']@\/admin\/carreiras\/falhas["']/.test(lista) &&
      !/from\s*["']@\/admin\/carreiras\/formulario["']/.test(lista),
  );
  /* Leitura estática, e só porque a alternativa (fazer a tabela do domínio
     perder a exclusão para ver a carga não lançar) exigiria compilar o módulo
     com um domínio de mentira: a reserva existe, com o texto certo. */
  const fonteDaListagem = semComentarios(ler(`${DIR_TELAS_DE_CARREIRAS}/listagem.js`) ?? "");
  afirmar(
    "o rótulo de confirmar a exclusão tem reserva (`?.rotulo ?? \"Excluir vaga\"`): a carga do módulo não lança se a tabela mudar",
    /\.find\(\(acao\) => acao\.exclui === true\)\?\.rotulo \?\? "Excluir vaga"/.test(fonteDaListagem),
  );
}

/* ── Node: `listagem.js` e a aparência da Cor ── */

let listagemDeVagas = null;
try {
  listagemDeVagas = await import(urlDe("src/admin/carreiras/listagem.js"));
} catch (erro) {
  afirmar("`src/admin/carreiras/listagem.js` importa no Node", false, erro.message);
}

{
  const c = classificacoes;
  const { aparenciaDaCategoria } = await import(urlDe("src/domain/blog/categorias.js"));
  const neutra = aparenciaDaCategoria({ cor: "" });
  afirmar(
    "`aparenciaDaCorDeClassificacao` delega à paleta das Categorias: o MESMO par para cada Cor da paleta, pela Classificação ou pelo valor",
    typeof c.aparenciaDaCorDeClassificacao === "function" &&
      c.CORES_DE_CLASSIFICACAO.every(
        (cor) =>
          c.aparenciaDaCorDeClassificacao({ cor }) === aparenciaDaCategoria({ cor }) &&
          c.aparenciaDaCorDeClassificacao(cor) === aparenciaDaCategoria({ cor }),
      ),
  );
  let lancou = false;
  const tolerados = [];
  for (const valor of [null, undefined, "", "vermelho", {}, { cor: "#ff0000" }, { cor: null }, 7, []]) {
    try {
      tolerados.push(c.aparenciaDaCorDeClassificacao(valor));
    } catch {
      lancou = true;
    }
  }
  afirmar(
    "e é TOLERANTE: sem cor, cor fora do vocabulário ou lixo caem na cor neutra, sem lançar",
    !lancou && tolerados.length === 9 && tolerados.every((a) => a === neutra) && typeof neutra?.fundo === "string",
  );
}

if (listagemDeVagas !== null) {
  const l = listagemDeVagas;
  const e = estadosDaVaga;
  afirmar("a espera da busca é de 250 ms", l.ESPERA_DA_BUSCA_MS === 250);
  afirmar(
    "o filtro é de UM Estado, com os rótulos do vocabulário, na ordem do ciclo de vida",
    igual(
      l.FILTROS_DE_ESTADO.map((f) => [f.estado, f.rotulo]),
      e.ESTADOS_DA_VAGA.map((estado) => [estado, e.rotuloDoEstadoDaVaga(estado)]),
    ) &&
      l.alternarEstadoDoFiltro(null, "rascunho") === "rascunho" &&
      l.alternarEstadoDoFiltro("rascunho", "rascunho") === null &&
      l.alternarEstadoDoFiltro("rascunho", "aberta") === "aberta" &&
      l.alternarEstadoDoFiltro("aberta", "xpto") === null,
  );
  afirmar(
    "o pedido de busca apara o termo e só leva Estado do vocabulário; busca ativa é termo ou Estado",
    igual({ ...l.pedidoDeBusca({ termo: "  operacoes ", estado: "rascunho" }) }, { termo: "operacoes", estado: "rascunho" }) &&
      igual({ ...l.pedidoDeBusca({ termo: 7, estado: "Rascunho" }) }, { termo: "", estado: null }) &&
      l.haBuscaAtiva({ termo: "   " }) === false &&
      l.haBuscaAtiva({ estado: "aberta" }) === true &&
      l.haBuscaAtiva({ termo: "x" }) === true,
  );
  const s = (o) => l.situacaoDaLista(o);
  afirmar(
    "a situação da lista: carregando, depois erro (antes de qualquer vazio), vazio de busca, vazio e lista",
    igual([...l.SITUACOES_DA_LISTA], ["carregando", "erro", "vazio-de-busca", "vazio", "lista"]) &&
      s({ carregando: true, erro: { tipo: "rede" } }) === "carregando" &&
      s({ erro: { tipo: "rede" }, quantidade: 0, buscando: true }) === "erro" &&
      s({ erro: { tipo: "rede" }, quantidade: 0 }) === "erro" &&
      s({ quantidade: 0, buscando: true }) === "vazio-de-busca" &&
      s({ quantidade: 0 }) === "vazio" &&
      s({ quantidade: 2, buscando: true }) === "lista",
  );
  const okV = { ok: true, dados: [{ id: "a", titulo: "A", slug: "a", estado: "rascunho" }] };
  const okC = { ok: true, dados: { departamentos: [], tipos_de_vaga: [], niveis: [] } };
  const falhaV = { ok: false, erro: { tipo: "rede", mensagem: "sem rede" } };
  afirmar(
    "a falha de QUALQUER das duas leituras é erro (com o erro da que falhou), nunca lista vazia",
    l.combinarLeituras(okV, okC).ok === true &&
      l.combinarLeituras(okV, okC).vagas.length === 1 &&
      l.combinarLeituras(falhaV, okC).ok === false &&
      l.combinarLeituras(falhaV, okC).erro.mensagem === "sem rede" &&
      l.combinarLeituras({ ok: true, dados: [] }, falhaV).ok === false &&
      l.combinarLeituras(null, okC).ok === false &&
      l.combinarLeituras(okV, null).ok === false &&
      l.combinarLeituras({ ok: true, dados: "não é lista" }, okC).ok === false,
  );
  /* As ações da linha, como a spec as escreve (matriz I/O): é contra ELA que o
     módulo é julgado. */
  const acoes = (estado, extra = {}) =>
    l.acoesDaLinha({ id: "10000000-0000-4000-8000-000000000001", slug: "vaga-x", estado, ...extra }).map((a) => a.chave);
  afirmar(
    "as ações da linha: Rascunho (Editar, Abrir, Excluir), Aberta (Editar, Encerrar, Ver no site), Encerrada (Editar, Reabrir, Ver no site, Excluir), e Estado desconhecido só Editar",
    igual(acoes("rascunho"), ["editar", "abrir", "excluir"]) &&
      igual(acoes("aberta"), ["editar", "encerrar", "ver"]) &&
      igual(acoes("encerrada"), ["editar", "reabrir", "ver", "excluir"]) &&
      igual(acoes("xpto"), ["editar"]) &&
      igual(acoes(undefined), ["editar"]),
    `${acoes("rascunho")} | ${acoes("aberta")} | ${acoes("encerrada")} | ${acoes("xpto")}`,
  );
  const aberta = l.acoesDaLinha({ id: "10000000-0000-4000-8000-000000000001", slug: "vaga-x", estado: "aberta" });
  afirmar(
    "Editar leva ao formulário da Vaga, e Ver no site ao endereço público pelo Slug (sem Slug, nada)",
    aberta[0].endereco === "/admin/carreiras/vaga/10000000-0000-4000-8000-000000000001" &&
      aberta.find((a) => a.chave === "ver")?.endereco === "/carreiras/vaga-x" &&
      /* TROCA REGISTRADA (Story 5.7): `enderecoPublicoDaVaga` saiu de
         `listagem.js` para o domínio (`vaga.js`); os mesmos casos, lá. */
      regrasDaVaga.enderecoPublicoDaVaga({ estado: "rascunho", slug: "x" }) === null &&
      regrasDaVaga.enderecoPublicoDaVaga({ estado: "encerrada", slug: "" }) === null &&
      regrasDaVaga.enderecoPublicoDaVaga({ estado: "xpto", slug: "x" }) === null,
  );
  const indice = l.indiceDasClassificacoes({
    departamentos: [{ id: "d1", nome: "Operações", cor: "var(--categoria-verde-bg)" }],
    tipos_de_vaga: [{ id: "t1", nome: "CLT" }],
    niveis: "não é lista",
  });
  let linha = null;
  let linhaTorta = null;
  try {
    linha = l.linhaDaVaga(
      { id: "v1", titulo: " Vaga ", slug: "v", estado: "aberta", departamento_id: "d1", tipo_id: "t1", nivel_id: "n9", modalidade: "hibrido", localizacao: "Natal, RN" },
      indice,
    );
    linhaTorta = l.linhaDaVaga({ id: "v2", titulo: "T", estado: "xpto", modalidade: "voando" }, null);
  } catch (erro) {
    afirmar("a linha é montada sem lançar", false, erro.message);
  }
  afirmar(
    "a linha junta as Classificações pelo identificador (nome e Cor) e dá rótulo neutro, com a cor neutra, à que não tem par",
    linha !== null &&
      linha.titulo === "Vaga" &&
      linha.departamento.rotulo === "Operações" &&
      linha.departamento.fundo === "var(--categoria-verde-bg)" &&
      linha.tipo.rotulo === "CLT" &&
      linha.tipo.fundo === null &&
      linha.nivel.conhecida === false &&
      linha.nivel.rotulo === "Nível não encontrado" &&
      linha.nivel.fundo === classificacoes.aparenciaDaCorDeClassificacao(null).fundo &&
      linha.local === "Híbrido · Natal, RN" &&
      linha.aparenciaDoEstado === estadosDaVaga.aparenciaDoEstadoDaVaga("aberta"),
    JSON.stringify(linha),
  );
  afirmar(
    "Estado e Modalidade fora do vocabulário NÃO lançam na linha: sem aparência de Estado, só Editar, local vazio",
    linhaTorta !== null &&
      linhaTorta.estadoValido === false &&
      linhaTorta.aparenciaDoEstado === null &&
      igual(linhaTorta.acoes.map((a) => a.chave), ["editar"]) &&
      linhaTorta.local === "",
  );
  const { diagnosticarRotuloDeAcao } = await import(urlDe("src/admin/shell/voz.js"));
  afirmar(
    "o rótulo de confirmar a exclusão é o da tabela do domínio (\"Excluir vaga\") e passa pela regra de voz",
    l.ROTULO_DE_CONFIRMAR_EXCLUSAO === "Excluir vaga" &&
      l.ROTULO_DE_CONFIRMAR_EXCLUSAO === transicoesDaVaga.acoesDoEstadoDaVaga("encerrada").find((a) => a.exclui).rotulo &&
      diagnosticarRotuloDeAcao(l.ROTULO_DE_CONFIRMAR_EXCLUSAO) === null,
  );
  afirmar(
    "a pergunta do diálogo nomeia a Vaga, e o vazio de busca diz o que foi procurado",
    l.tituloDaExclusao({ titulo: "Suporte" }).includes("Suporte") &&
      l.descricaoDoVazioDeBusca({ termo: "zzz", estado: "rascunho" }).includes("zzz") &&
      l.descricaoDoVazioDeBusca({ termo: "zzz", estado: "rascunho" }).includes(
        estadosDaVaga.rotuloDoEstadoDaVaga("rascunho").toLowerCase(),
      ),
  );
  afirmar(
    "\"Tentar de novo\" é UMA constante (`ROTULO_DE_NOVA_TENTATIVA`), usada pela notificação e pela tela de erro; `ROTULO_DE_RECARREGAR` não existe mais",
    l.ROTULO_DE_NOVA_TENTATIVA === "Tentar de novo" &&
      !("ROTULO_DE_RECARREGAR" in l) &&
      diagnosticarRotuloDeAcao(l.ROTULO_DE_NOVA_TENTATIVA) === null,
  );
  {
    const { diagnosticarMensagem } = await import(urlDe("src/admin/shell/voz.js"));
    afirmar(
      "a frase da Vaga que já não existia é própria: passa pela voz, diz que a linha saiu, e não diz que a lista continua como estava",
      typeof l.TITULO_DA_VAGA_INEXISTENTE === "string" &&
        typeof l.DESCRICAO_DA_VAGA_INEXISTENTE === "string" &&
        diagnosticarMensagem("o que houve", l.TITULO_DA_VAGA_INEXISTENTE) === null &&
        diagnosticarMensagem("o que fazer", l.DESCRICAO_DA_VAGA_INEXISTENTE) === null &&
        /já não existia/.test(l.TITULO_DA_VAGA_INEXISTENTE) &&
        /saiu da lista/.test(l.DESCRICAO_DA_VAGA_INEXISTENTE) &&
        !/continua como estava|tente de novo/i.test(l.TITULO_DA_VAGA_INEXISTENTE + " " + l.DESCRICAO_DA_VAGA_INEXISTENTE) &&
        l.TITULO_DA_VAGA_INEXISTENTE !== l.FALHA_DA_EXCLUSAO,
      `${l.TITULO_DA_VAGA_INEXISTENTE} | ${l.DESCRICAO_DA_VAGA_INEXISTENTE}`,
    );
  }
  const travessoes = Object.entries(l).filter(([, v]) => typeof v === "string" && v.includes("—"));
  afirmar("nenhum texto exportado por `listagem.js` tem travessão", travessoes.length === 0, travessoes.map(([k]) => k).join(", "));
}

/* ── A aba montada ── */

{
  const { writeFileSync, rmSync } = await import("node:fs");
  const montagem = await import("./montagem-comum.mjs");
  const pasta = montagem.criarPastaDeCompilacao("verificar-carreiras-aba-");

  const ID_R = "10000000-0000-4000-8000-000000000001";
  const ID_A = "10000000-0000-4000-8000-000000000002";
  const ID_E = "10000000-0000-4000-8000-000000000003";
  const ID_S = "10000000-0000-4000-8000-000000000004";
  const ID_X = "10000000-0000-4000-8000-000000000005";
  const DEP_OPERACOES = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  const DEP_TECNOLOGIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab1";
  const TIPO_CLT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
  const NIVEL_PLENO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
  const NIVEL_SENIOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab3";
  const SEM_PAR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaff";

  const arquivoDaLeitura = path.join(pasta, "duble-leitura.js");
  writeFileSync(
    arquivoDaLeitura,
    `export { ERRO_NAO_ENCONTRADO } from ${montagem.caminhoDeModulo("src/data/blog/resultado.js")};
export const controle = {
  vagas: [],
  classificacoes: null,
  falharVagas: false,
  falharClassificacoes: false,
  lancar: false,
  segurar: null,
  trancar: false,
  trancadas: [],
  pedidos: [],
  instantes: [],
  classificacoesLidas: 0,
  outras: [],
};
const normalizar = (t) => String(t ?? "").normalize("NFD").replace(/\\p{Diacritic}/gu, "").toLowerCase();
/* A resposta é CALCULADA NA CHAMADA (o banco respondeu naquele instante) e
   só ENTREGUE depois das travas: é assim que uma resposta atrasada traz o
   estado de antes de uma escrita. Com \`trancar\`, cada pedido ganha a SUA
   trava, em \`trancadas\`, e o caso solta uma por uma, na ordem que quiser. */
export async function listarVagasDoPainel(pedido) {
  const copia = JSON.parse(JSON.stringify(pedido ?? null));
  controle.pedidos.push(copia);
  controle.instantes.push(Date.now());
  const lancar = controle.lancar;
  let resposta;
  if (controle.falharVagas) {
    resposta = { ok: false, erro: { tipo: "rede", mensagem: "Não conseguimos falar com o banco para listar as vagas. Confira a conexão." } };
  } else {
    const termo = normalizar(pedido?.termo).trim();
    const departamentos = controle.classificacoes?.departamentos ?? [];
    let dados = controle.vagas.filter((v) => {
      if (termo === "") return true;
      const dep = departamentos.find((d) => d.id === v.departamento_id)?.nome ?? "";
      const texto = normalizar(v.titulo + " " + dep + " " + (v.localizacao ?? ""));
      return termo.split(/\\s+/).every((palavra) => texto.includes(palavra));
    });
    if (pedido?.estado) dados = dados.filter((v) => v.estado === pedido.estado);
    resposta = { ok: true, dados: JSON.parse(JSON.stringify(dados)) };
  }
  if (controle.trancar) {
    await new Promise((soltar) => controle.trancadas.push({ pedido: copia, soltar }));
  }
  if (controle.segurar) await controle.segurar;
  if (lancar) throw new Error("dublê: a leitura lançou");
  return resposta;
}
export async function listarClassificacoesDoPainel() {
  controle.classificacoesLidas += 1;
  if (controle.segurar) await controle.segurar;
  if (controle.lancar) throw new Error("dublê: a leitura lançou");
  if (controle.falharClassificacoes) {
    return { ok: false, erro: { tipo: "rede", mensagem: "Não conseguimos ler as classificações. Confira a conexão." } };
  }
  return { ok: true, dados: JSON.parse(JSON.stringify(controle.classificacoes)) };
}
export async function lerVagaDoPainelPorId(id) {
  controle.outras.push(["lerVagaDoPainelPorId", id]);
  return { ok: false, erro: { tipo: "nao_encontrado", mensagem: "Esta vaga não foi encontrada." } };
}
export async function listarVagasAbertas() { controle.outras.push(["listarVagasAbertas"]); return { ok: true, dados: [] }; }
export async function lerSituacaoDaVaga() { controle.outras.push(["lerSituacaoDaVaga"]); return { ok: true, dados: null }; }
export async function listarClassificacoes() { controle.outras.push(["listarClassificacoes"]); return { ok: true, dados: {} }; }
`,
  );
  /* O dublê de escrita tem FILA para as duas escritas da lista (mudar o Estado
     e excluir), e registra toda chamada, inclusive as que a lista nunca deveria
     fazer. */
  const arquivoDaEscrita = path.join(pasta, "duble-escrita.js");
  writeFileSync(
    arquivoDaEscrita,
    `export { ERRO_REDE, ERRO_INESPERADO, ERRO_NAO_ENCONTRADO } from ${montagem.caminhoDeModulo("src/data/blog/resultado.js")};
export const ERRO_CONFLITO = "conflito";
export const controle = { todas: [], respostas: { mudarEstadoDaVaga: [], excluirVaga: [] } };
function responder(fila, argumentos) {
  const resposta = fila.shift();
  if (typeof resposta === "function") return resposta(...argumentos);
  return resposta ?? { ok: false, erro: { tipo: "dados_invalidos", mensagem: "O dublê não tinha resposta preparada para este pedido." } };
}
export async function mudarEstadoDaVaga(id, acao) {
  controle.todas.push({ op: "mudarEstadoDaVaga", id, acao });
  return responder(controle.respostas.mudarEstadoDaVaga, [id, acao]);
}
export async function excluirVaga(id) {
  controle.todas.push({ op: "excluirVaga", id });
  return responder(controle.respostas.excluirVaga, [id]);
}
export async function salvarVaga() { controle.todas.push({ op: "salvarVaga" }); return { ok: false, erro: { tipo: "dados_invalidos", mensagem: "inesperado" } }; }
export async function salvarClassificacao() { controle.todas.push({ op: "salvarClassificacao" }); return { ok: false, erro: { tipo: "dados_invalidos", mensagem: "inesperado" } }; }
export async function excluirClassificacao() { controle.todas.push({ op: "excluirClassificacao" }); return { ok: false, erro: { tipo: "dados_invalidos", mensagem: "inesperado" } }; }
`,
  );
  const arquivoDasNotificacoes = path.join(pasta, "duble-notificacoes.js");
  writeFileSync(
    arquivoDasNotificacoes,
    `import { diagnosticarMensagem, diagnosticarRotuloDeAcao } from ${montagem.caminhoDeModulo("src/admin/shell/voz.js")};
export const controle = { erros: [], sucessos: [], problemasDeVoz: [] };
function conferir(rotulo, texto) {
  const problema = diagnosticarMensagem(rotulo, texto);
  if (problema) controle.problemasDeVoz.push(problema);
}
export function notificarErro(oQueHouve, oQueFazer, saida = null) {
  conferir("o que houve", oQueHouve);
  conferir("o que fazer", oQueFazer);
  if (saida) {
    const problema = diagnosticarRotuloDeAcao(saida.rotulo);
    if (problema) controle.problemasDeVoz.push(problema);
    if (typeof saida.aoAcionar !== "function") controle.problemasDeVoz.push("saída sem aoAcionar: " + saida.rotulo);
  }
  controle.erros.push([oQueHouve, oQueFazer, saida]);
}
export function notificarSucesso(oQueAconteceu, detalhe) {
  conferir("o que aconteceu", oQueAconteceu);
  controle.sucessos.push([oQueAconteceu, detalhe ?? ""]);
}
export default function Notificacoes() { return null; }
`,
  );
  /* Os dublês do Blog, só para a página montar: a leitura de Posts registra o
     pedido (é por ele que "a busca do Blog não muda" é observada). */
  const arquivoDosPosts = path.join(pasta, "duble-posts.js");
  writeFileSync(
    arquivoDosPosts,
    `export const controle = { pedidos: [] };
export async function listarPostsDoPainel(pedido) {
  controle.pedidos.push(JSON.parse(JSON.stringify(pedido ?? null)));
  return { ok: true, dados: [] };
}
export function ordenarListagem(posts) { return posts; }
`,
  );
  const arquivoDaEscritaDoBlog = path.join(pasta, "duble-escrita-blog.js");
  writeFileSync(
    arquivoDaEscritaDoBlog,
    `export async function definirDestaque() { return { ok: true, dados: {} }; }
export async function excluirPost() { return { ok: true, dados: {} }; }
`,
  );
  /* A SESSÃO de mentira: o provedor real cria o cliente do supabase-js (o
     `.env` entra no pacote pelo empacotador), e o relógio de renovação dele
     segura o processo vivo depois do veredito. O dublê entrega o MESMO
     contexto (`ContextoDeSessao`, do módulo real) com uma Conta autenticada. */
  const arquivoDaSessao = path.join(pasta, "duble-sessao.js");
  writeFileSync(
    arquivoDaSessao,
    `import { createElement } from "react";
import { ContextoDeSessao } from ${montagem.caminhoDeModulo("src/admin/shell/useSessao.js")};
const VALOR = {
  estado: "autenticado",
  email: "autora@exemplo.com",
  perfil: { carregando: false, nome: "Autora de Teste", erro: null },
  erroDeAmbiente: null,
  erroDeSessao: null,
  entrar: async () => ({ ok: true }),
  sair: async () => {},
};
export default function SessaoDeMentira({ children }) {
  return createElement(ContextoDeSessao.Provider, { value: VALOR }, children);
}
`,
  );
  const arquivoDoEditorDePost = path.join(pasta, "duble-editor.jsx");
  writeFileSync(arquivoDoEditorDePost, "export default function EditorDePostDuble() { return null; }\n");

  const fonte =
    `export { default as AbaDeCarreiras } from ${montagem.caminhoDeModulo("src/admin/carreiras/AbaDeCarreiras.jsx")};\n` +
    `export { default as AdminBlog } from ${montagem.caminhoDeModulo("src/pages/AdminBlog.jsx")};\n` +
    `export { default as SessaoProvider } from ${montagem.comoModulo(arquivoDaSessao)};\n` +
    `export { ESPERA_DA_BUSCA_MS } from ${montagem.caminhoDeModulo("src/admin/carreiras/listagem.js")};\n` +
    `export * as dubleDaEscrita from ${montagem.comoModulo(arquivoDaEscrita)};\n` +
    `export { controle as controleDaLeitura } from ${montagem.comoModulo(arquivoDaLeitura)};\n` +
    `export { controle as controleDaEscrita } from ${montagem.comoModulo(arquivoDaEscrita)};\n` +
    `export { controle as controleDasNotificacoes } from ${montagem.comoModulo(arquivoDasNotificacoes)};\n` +
    `export { controle as controleDosPosts } from ${montagem.comoModulo(arquivoDosPosts)};\n`;

  let compilado = null;
  try {
    compilado = await montagem.compilarParaNode({
      pasta,
      fonte,
      alias: {
        "@/data/carreiras/leitura": arquivoDaLeitura,
        "@/data/carreiras/escrita": arquivoDaEscrita,
        "@/admin/shell/Notificacoes": arquivoDasNotificacoes,
        "@/data/blog/posts": arquivoDosPosts,
        "@/data/blog/escrita": arquivoDaEscritaDoBlog,
        "@/admin/blog/EditorDePost": arquivoDoEditorDePost,
      },
    });
  } catch (erro) {
    afirmar("a aba Carreiras e a página compilam pelo empacotador da aplicação", false, erro?.message ?? String(erro));
  }

  if (compilado !== null) {
    afirmar("a aba Carreiras e a página compilam pelo empacotador da aplicação", true);

    const janela = montagem.montarNavegador({ url: "https://painel.local/admin" });
    /* A seção (o) já subiu (e fechou) um navegador de mentira neste processo, e
       `montarNavegador` não sobrescreve o que já existe em `globalThis`: o
       relógio de quadro e as classes de elemento seriam os da janela FECHADA
       (e o quadro nunca chegaria). Estes nomes são religados à janela nova. */
    for (const nome of [
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "getComputedStyle",
      "HTMLElement",
      "HTMLInputElement",
      "HTMLButtonElement",
      "HTMLAnchorElement",
      "Element",
      "Node",
      "DocumentFragment",
    ]) {
      const valor = typeof janela[nome] === "function" && /^[a-z]/.test(nome) ? janela[nome].bind(janela) : janela[nome];
      if (valor !== undefined) {
        Object.defineProperty(globalThis, nome, { value: valor, configurable: true, writable: true });
      }
    }
    const modulo = await import(pathToFileURL(compilado.arquivo).href);
    const React = (await import("react")).default;
    const { act } = await import("react");
    const { createRoot } = await import("react-dom/client");
    const roteador = await import("react-router-dom");
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, configurable: true, writable: true });
    const h = React.createElement;
    const leitura = modulo.controleDaLeitura;
    const escrita = modulo.controleDaEscrita;
    const avisos = modulo.controleDasNotificacoes;
    const posts = modulo.controleDosPosts;
    const ESPERA = modulo.ESPERA_DA_BUSCA_MS;

    afirmar(
      "os literais de tipo de erro do dublê de escrita são os do módulo REAL",
      clienteDaEscritaDeCarreiras !== null &&
        modulo.dubleDaEscrita.ERRO_REDE === clienteDaEscritaDeCarreiras.ERRO_REDE &&
        modulo.dubleDaEscrita.ERRO_INESPERADO === clienteDaEscritaDeCarreiras.ERRO_INESPERADO &&
        typeof clienteDaEscritaDeCarreiras.ERRO_NAO_ENCONTRADO === "string" &&
        modulo.dubleDaEscrita.ERRO_NAO_ENCONTRADO === clienteDaEscritaDeCarreiras.ERRO_NAO_ENCONTRADO,
    );

    leitura.classificacoes = {
      departamentos: [
        { id: DEP_OPERACOES, nome: "Operações", cor: "var(--categoria-verde-bg)", ordem: 0, vagas: 2 },
        { id: DEP_TECNOLOGIA, nome: "Tecnologia", cor: "var(--categoria-azul-bg)", ordem: 1, vagas: 1 },
      ],
      tipos_de_vaga: [{ id: TIPO_CLT, nome: "CLT", equivalente_jobposting: "FULL_TIME", ordem: 0, vagas: 3 }],
      niveis: [
        { id: NIVEL_PLENO, nome: "Pleno", cor: "var(--categoria-azul-bg)", ordem: 0, vagas: 2 },
        { id: NIVEL_SENIOR, nome: "Sênior", cor: "var(--categoria-roxo-bg)", ordem: 1, vagas: 1 },
      ],
    };
    const vaga = (id, extra) => ({
      id,
      titulo: "Vaga",
      slug: "vaga",
      estado: "rascunho",
      departamento_id: DEP_OPERACOES,
      tipo_id: TIPO_CLT,
      nivel_id: NIVEL_PLENO,
      modalidade: "remoto",
      localizacao: "",
      resumo: "Resumo.",
      link_de_candidatura: null,
      aberta_em: null,
      criado_em: "2026-09-01T00:00:00Z",
      atualizado_em: "2026-09-01T00:00:00Z",
      ...extra,
    });
    const R = vaga(ID_R, { titulo: "Analista de Operações", slug: "analista-de-operacoes" });
    const A = vaga(ID_A, {
      titulo: "Desenvolvedora Front-end",
      slug: "desenvolvedora-front-end",
      estado: "aberta",
      departamento_id: DEP_TECNOLOGIA,
      nivel_id: NIVEL_SENIOR,
      modalidade: "hibrido",
      localizacao: "Natal, RN",
      aberta_em: "2026-09-10T12:00:00Z",
      link_de_candidatura: "https://exemplo.com/a",
    });
    const E = vaga(ID_E, {
      titulo: "Suporte Noturno",
      slug: "suporte-noturno",
      estado: "encerrada",
      modalidade: "presencial",
      localizacao: "São Paulo, SP",
      aberta_em: "2026-08-01T12:00:00Z",
      link_de_candidatura: "https://exemplo.com/e",
    });
    const TRES = [R, A, E];
    leitura.vagas = TRES;

    const passo = async () => {
      await act(async () => {
        await new Promise((resolver) => setTimeout(resolver, 0));
      });
    };
    const esperarAte = async (condicao, descricao, prazo = 4000) => {
      const limite = Date.now() + prazo;
      for (;;) {
        await passo();
        let pronto = false;
        try {
          pronto = Boolean(condicao());
        } catch {
          pronto = false;
        }
        if (pronto) return true;
        if (Date.now() > limite) {
          afirmar(`espera com prazo: ${descricao} (${prazo} ms)`, false);
          return false;
        }
      }
    };
    const segurar = () => {
      let soltar = null;
      leitura.segurar = new Promise((resolver) => {
        soltar = resolver;
      });
      return () => {
        leitura.segurar = null;
        soltar();
      };
    };
    const segurada = (resposta) => {
      const controle = { soltar: null };
      const promessa = new Promise((resolver) => {
        controle.soltar = () => resolver(typeof resposta === "function" ? resposta() : resposta);
      });
      return { controle, responder: () => promessa };
    };

    const reclamacoes = [];
    const erroOriginal = console.error;
    console.error = (...partes) => reclamacoes.push(partes.map(String).join(" "));

    function Onde() {
      const local = roteador.useLocation();
      return h("span", { "data-onde": `${local.pathname}${local.search}` });
    }
    /* O `navigate` do roteador da montagem, para o caso navegar com a página
       MONTADA (como o voltar do navegador faria), sem remontar nada. */
    let navegarNaMontagem = null;
    function Navegador() {
      navegarNaMontagem = roteador.useNavigate();
      return null;
    }
    function Formulario() {
      return h("p", { "data-papel": "formulario-de-mentira" }, "formulário");
    }

    /**
     * Monta a aba sozinha (`"aba"`) ou a página inteira (`"pagina"`), num
     * `MemoryRouter` com as rotas do formulário de mentira. `toleradas` são as
     * reclamações que o CASO espera (com o motivo escrito ao lado), e cada uma
     * precisa aparecer.
     */
    const montar = async (caminho, { caso, alvoDaMontagem = "aba", toleradas = [], ateQue = null } = {}) => {
      const alvo = janela.document.createElement("div");
      janela.document.body.appendChild(alvo);
      const raizReact = createRoot(alvo);
      const inicioDasReclamacoes = reclamacoes.length;
      const inicioDasEscritas = escrita.todas.length;
      const contagens = [];
      function ComContador() {
        return h(modulo.AbaDeCarreiras, { aoContar: (n) => contagens.push(n) });
      }
      const elemento =
        alvoDaMontagem === "pagina" ? h(modulo.SessaoProvider, null, h(modulo.AdminBlog)) : h(ComContador);
      await act(async () => {
        raizReact.render(
          h(
            roteador.MemoryRouter,
            { initialEntries: [caminho] },
            h(Onde),
            h(Navegador),
            h(
              roteador.Routes,
              null,
              h(roteador.Route, { path: "/admin", element: elemento }),
              h(roteador.Route, { path: "/admin/carreiras/vaga/:id", element: h(Formulario) }),
            ),
          ),
        );
      });
      const tela = {
        caso,
        alvo,
        contagens,
        onde: () => alvo.querySelector("[data-onde]")?.getAttribute("data-onde") ?? null,
        async navegar(destino) {
          await act(async () => {
            navegarNaMontagem?.(destino);
          });
          await passo();
        },
        situacao: () => alvo.querySelector("[data-estado-da-lista]")?.getAttribute("data-estado-da-lista") ?? null,
        linhas: () => [...alvo.querySelectorAll("li[data-vaga]")].map((li) => li.getAttribute("data-vaga")),
        linha: (id) => alvo.querySelector(`li[data-vaga="${id}"]`),
        acoesDe: (id) =>
          [...(alvo.querySelector(`li[data-vaga="${id}"]`)?.querySelectorAll("[data-acao]") ?? [])].map((a) =>
            a.getAttribute("data-acao"),
          ),
        acao: (id, chave) => alvo.querySelector(`li[data-vaga="${id}"] [data-acao="${chave}"]`),
        pilula: (id) => alvo.querySelector(`li[data-vaga="${id}"] [data-estado]`)?.getAttribute("data-estado") ?? null,
        busca: () => alvo.querySelector('input[data-busca="vagas"]'),
        filtro: (estado) => alvo.querySelector(`[data-filtro-de-estado-da-vaga="${estado}"]`),
        dialogo: () => janela.document.querySelector('[role="alertdialog"]'),
        emCurso: () => alvo.querySelector('[data-papel="acao-em-curso"]')?.textContent ?? "",
        ocioso: () => alvo.querySelector('[aria-busy="true"]') === null,
        async clicar(elemento, nome, ateQueClique = null) {
          if (!elemento) {
            afirmar(`${caso}: o elemento "${nome}" existe na tela para ser clicado`, false);
            return false;
          }
          await act(async () => {
            elemento.dispatchEvent(new janela.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
          });
          return esperarAte(ateQueClique ?? tela.ocioso, `${caso}: a tela assenta depois de clicar em ${nome}`);
        },
        async digitar(texto) {
          const campo = tela.busca();
          if (!campo) {
            afirmar(`${caso}: o campo de busca de vagas existe`, false);
            return;
          }
          const setter = Object.getOwnPropertyDescriptor(janela.HTMLInputElement.prototype, "value").set;
          await act(async () => {
            setter.call(campo, texto);
            campo.dispatchEvent(new janela.Event("input", { bubbles: true }));
          });
        },
        async acionarSaida(ateQueSaida) {
          const saida = avisos.erros.at(-1)?.[2] ?? null;
          if (!saida || typeof saida.aoAcionar !== "function") {
            afirmar(`${caso}: a última notificação de erro tem a ação de resolver`, false);
            return false;
          }
          await act(async () => {
            saida.aoAcionar();
          });
          return esperarAte(ateQueSaida, `${caso}: a tela assenta depois de "${saida.rotulo}"`);
        },
        async desmontar({ escritasEsperadas = null } = {}) {
          await act(async () => raizReact.unmount());
          await passo();
          alvo.remove();
          const sobras = {
            mudarEstadoDaVaga: escrita.respostas.mudarEstadoDaVaga.length,
            excluirVaga: escrita.respostas.excluirVaga.length,
          };
          const feitas = escrita.todas.slice(inicioDasEscritas).map((c) => c.op);
          const inesperadas = feitas.filter((op) => op !== "mudarEstadoDaVaga" && op !== "excluirVaga");
          afirmar(
            `${caso}: toda resposta preparada foi consumida, nenhuma escrita fora da lista aconteceu${escritasEsperadas === null ? "" : `, e as escritas foram ${escritasEsperadas}`}`,
            sobras.mudarEstadoDaVaga === 0 &&
              sobras.excluirVaga === 0 &&
              inesperadas.length === 0 &&
              (escritasEsperadas === null || feitas.length === escritasEsperadas),
            `sobras: ${JSON.stringify(sobras)} | feitas: ${feitas.join(", ")}`,
          );
          escrita.respostas.mudarEstadoDaVaga.length = 0;
          escrita.respostas.excluirVaga.length = 0;
          const doCaso = reclamacoes.slice(inicioDasReclamacoes);
          const naoToleradas = doCaso.filter((r) => !toleradas.some((t) => t.padrao.test(r)));
          const ausentes = toleradas.filter((t) => !doCaso.some((r) => t.padrao.test(r)));
          afirmar(
            `${caso}: o React não reclamou de nada fora do esperado, e o que era esperado apareceu`,
            naoToleradas.length === 0 && ausentes.length === 0,
            `${naoToleradas.slice(0, 2).map((r) => r.slice(0, 300)).join(" | ")} | ausentes: ${ausentes.map((t) => t.motivo).join(", ")}`,
          );
        },
      };
      await esperarAte(
        ateQue ?? (() => tela.situacao() !== null && tela.situacao() !== "carregando"),
        `${caso}: a tela monta e assenta em ${caminho}`,
      );
      return tela;
    };
    const estiloDe = (el) => el?.getAttribute("style") ?? "";

    try {
      /* ══ Abrir a aba: esqueleto, depois a lista do banco, e a contagem ══ */
      const soltarCarga = segurar();
      const pedidosAntes = leitura.pedidos.length;
      const aba = await montar("/admin?aba=carreiras", {
        caso: "Abrir a aba",
        ateQue: () => janela.document.querySelector('[data-estado-da-lista="carregando"]') !== null,
      });
      afirmar(
        "Abrir a aba: enquanto as leituras não voltam, esqueleto (com o anúncio) e nenhuma linha, e nenhuma contagem anunciada",
        aba.situacao() === "carregando" &&
          aba.linhas().length === 0 &&
          aba.alvo.querySelector('[data-estado-da-lista="carregando"] [role="status"]') !== null &&
          aba.contagens.length === 0,
      );
      soltarCarga();
      await esperarAte(() => aba.situacao() === "lista", "Abrir a aba: a lista aparece");
      afirmar(
        "e depois a lista do banco, na ordem que a camada devolve (atualizada primeiro), com `listarVagasDoPainel({termo: \"\", estado: null})` e as Classificações lidas",
        igual(aba.linhas(), [ID_R, ID_A, ID_E]) &&
          igual(leitura.pedidos[pedidosAntes], { termo: "", estado: null }) &&
          leitura.classificacoesLidas > 0,
        `linhas: ${aba.linhas().join(", ")} | pedido: ${JSON.stringify(leitura.pedidos[pedidosAntes])}`,
      );
      afirmar(
        "a contagem crua sobe para a página por `aoContar` (3)",
        aba.contagens.at(-1) === 3,
        JSON.stringify(aba.contagens),
      );
      const linhaR = aba.linha(ID_R);
      const linhaA = aba.linha(ID_A);
      const depR = linhaR?.querySelector('[data-papel="departamento"]');
      const nivR = linhaR?.querySelector('[data-papel="nivel"]');
      const nivA = linhaA?.querySelector('[data-papel="nivel"]');
      afirmar(
        "cada linha mostra o título, a pílula comum do Estado, Departamento e Nível com a Cor por `style`, o Tipo e Modalidade/Localização",
        (linhaR?.querySelector('[data-papel="titulo"]')?.textContent ?? "") === "Analista de Operações" &&
          aba.pilula(ID_R) === "rascunho" &&
          aba.pilula(ID_A) === "aberta" &&
          aba.pilula(ID_E) === "encerrada" &&
          (linhaR?.querySelector("[data-estado]")?.textContent ?? "").includes(estadosDaVaga.rotuloDoEstadoDaVaga("rascunho")) &&
          depR?.textContent === "Operações" &&
          estiloDe(depR).includes("var(--categoria-verde-bg)") &&
          estiloDe(depR).includes("var(--categoria-verde-ink)") &&
          nivR?.textContent === "Pleno" &&
          estiloDe(nivR).includes("var(--categoria-azul-bg)") &&
          nivA?.textContent === "Sênior" &&
          estiloDe(nivA).includes("var(--categoria-roxo-bg)") &&
          linhaR?.querySelector('[data-papel="tipo"]')?.textContent === "CLT" &&
          linhaR?.querySelector('[data-papel="local"]')?.textContent === "Remoto" &&
          linhaA?.querySelector('[data-papel="local"]')?.textContent === "Híbrido · Natal, RN" &&
          !/\bclass/.test(estiloDe(depR)),
        `${depR?.outerHTML?.slice(0, 200)} | ${nivA?.outerHTML?.slice(0, 200)}`,
      );
      afirmar(
        "as ações por linha: Rascunho (Editar, Abrir vaga, Excluir vaga), Aberta (Editar, Encerrar vaga, Ver no site), Encerrada (Editar, Reabrir vaga, Ver no site, Excluir vaga)",
        igual(aba.acoesDe(ID_R), ["editar", "abrir", "excluir"]) &&
          igual(aba.acoesDe(ID_A), ["editar", "encerrar", "ver"]) &&
          igual(aba.acoesDe(ID_E), ["editar", "reabrir", "ver", "excluir"]) &&
          (aba.acao(ID_R, "abrir")?.textContent ?? "").includes("Abrir vaga") &&
          (aba.acao(ID_E, "reabrir")?.textContent ?? "").includes("Reabrir vaga") &&
          (aba.acao(ID_A, "encerrar")?.textContent ?? "").includes("Encerrar vaga") &&
          (aba.acao(ID_E, "excluir")?.textContent ?? "").includes("Excluir vaga"),
        `${aba.acoesDe(ID_R)} | ${aba.acoesDe(ID_A)} | ${aba.acoesDe(ID_E)}`,
      );
      const verA = aba.acao(ID_A, "ver");
      const editarR = aba.acao(ID_R, "editar");
      afirmar(
        "Editar é link para o formulário da Vaga, e Ver no site abre `/carreiras/<slug>` em nova aba com `rel=\"noopener noreferrer\"`",
        editarR?.tagName === "A" &&
          editarR.getAttribute("href") === `/admin/carreiras/vaga/${ID_R}` &&
          verA?.tagName === "A" &&
          verA.getAttribute("href") === "/carreiras/desenvolvedora-front-end" &&
          verA.getAttribute("target") === "_blank" &&
          (verA.getAttribute("rel") ?? "").split(/\s+/).includes("noopener") &&
          (verA.getAttribute("rel") ?? "").split(/\s+/).includes("noreferrer") &&
          aba.acao(ID_E, "ver")?.getAttribute("href") === "/carreiras/suporte-noturno",
      );
      const todasAsAcoes = [...aba.alvo.querySelectorAll("li[data-vaga] [data-acao]")];
      const escondidas = todasAsAcoes.filter((el) => {
        const classes = [...el.classList];
        return (
          classes.some((c) => /(^|:)opacity-0$|(^|:)invisible$|(^|:)hidden$|^group-hover:/.test(c)) ||
          el.getAttribute("aria-hidden") === "true" ||
          el.hidden === true ||
          el.tabIndex < 0 ||
          (el.tagName === "BUTTON" && el.disabled) ||
          (el.tagName === "A" && !el.hasAttribute("href")) ||
          !["A", "BUTTON"].includes(el.tagName) ||
          !(el.getAttribute("aria-label") ?? "").includes(":")
        );
      });
      afirmar(
        "todas as ações ficam visíveis sem hover, alcançáveis por teclado (link com endereço ou botão habilitado) e com nome acessível que nomeia a Vaga",
        todasAsAcoes.length === 10 && escondidas.length === 0,
        escondidas.map((el) => `${el.getAttribute("data-acao")}: ${el.className}`).join(" | ") || `${todasAsAcoes.length} ação(ões)`,
      );
      const novaNaFaixa = aba.alvo.querySelector('[data-acao="nova-vaga"]');
      afirmar(
        "a faixa da aba: busca com rótulo, filtro de UM Estado (um botão por Estado, `aria-pressed`, rótulo do vocabulário) e Nova Vaga",
        aba.busca() !== null &&
          (aba.busca().getAttribute("aria-label") ?? "").length > 10 &&
          estadosDaVaga.ESTADOS_DA_VAGA.every(
            (estado) =>
              aba.filtro(estado)?.getAttribute("aria-pressed") === "false" &&
              aba.filtro(estado)?.textContent === estadosDaVaga.rotuloDoEstadoDaVaga(estado),
          ) &&
          aba.alvo.querySelector('[role="group"]')?.getAttribute("aria-label") !== null &&
          novaNaFaixa?.getAttribute("href") === "/admin/carreiras/vaga/nova",
      );
      {
        /* A hierarquia de títulos (revisão da 5.5): um `<h2>` da aba ANTES de
           todo `<h3>` (as linhas, o vazio e o erro), para quem navega por
           cabeçalhos não pular do `<h1>` da barra direto para o `<h3>`. */
        const titulos = [...aba.alvo.querySelectorAll("h1, h2, h3, h4, h5, h6")];
        const primeiroH3 = titulos.findIndex((t) => t.tagName === "H3");
        const h2s = titulos.filter((t) => t.tagName === "H2");
        afirmar(
          "a aba tem UM `<h2>` (o título da aba) acima dos `<h3>` das linhas, e nenhum `<h3>` vem antes dele",
          h2s.length === 1 &&
            (h2s[0].textContent ?? "").trim() !== "" &&
            primeiroH3 > titulos.indexOf(h2s[0]) &&
            titulos.filter((t) => t.tagName === "H3").length === 3,
          titulos.map((t) => `${t.tagName}:${(t.textContent ?? "").slice(0, 20)}`).join(" | "),
        );
      }

      /* ══ Busca e filtro ══ */
      const contagensAntes = aba.contagens.length;
      const pedidosAntesDaBusca = leitura.pedidos.length;
      await aba.digitar("ope");
      await passo();
      /* O instante ANTES da última tecla: o relógio da espera só começa depois
         dela, então o pedido não pode sair antes de `digitouEm + ESPERA`. O
         instante do pedido é o que o DUBLÊ registrou ao ser chamado (e não o
         de quando esta espera notou), sem folga de sondagem a favor. */
      const digitouEm = Date.now();
      await aba.digitar("operacoes");
      await passo();
      afirmar(
        "Busca: a digitação não vira consulta na hora (a espera de 250 ms ainda corre)",
        leitura.pedidos.length === pedidosAntesDaBusca,
        `${leitura.pedidos.length - pedidosAntesDaBusca} pedido(s) cedo demais`,
      );
      const soltarBusca = segurar();
      await esperarAte(() => leitura.pedidos.length > pedidosAntesDaBusca, "Busca: a consulta sai depois da espera");
      /* TROCA REGISTRADA (revisão da 5.5): era `esperou >= ESPERA * 0.5`,
         medido do fim da digitação até a SONDAGEM notar o pedido (a folga da
         sondagem jogava a favor, e metade da espera passava). Agora é do
         instante antes da última tecla até o instante em que o dublê foi
         CHAMADO, contra 90% da espera real. */
      const esperou = (leitura.instantes[pedidosAntesDaBusca] ?? 0) - digitouEm;
      afirmar(
        "depois da espera, UMA consulta com o termo final (`listarVagasDoPainel({termo: \"operacoes\", estado: null})`), e sem esqueleto: as linhas de antes ficam na tela até a resposta",
        leitura.pedidos.length === pedidosAntesDaBusca + 1 &&
          igual(leitura.pedidos.at(-1), { termo: "operacoes", estado: null }) &&
          aba.situacao() === "lista" &&
          aba.linhas().length === 3,
        `${JSON.stringify(leitura.pedidos.slice(pedidosAntesDaBusca))} | ${aba.situacao()}`,
      );
      afirmar(
        "e a consulta só sai depois de a digitação parar pela espera INTEIRA (pelo menos 90% de `ESPERA_DA_BUSCA_MS`, do instante da última tecla ao da chamada)",
        ESPERA === 250 && esperou >= ESPERA * 0.9,
        `${esperou} ms`,
      );
      soltarBusca();
      await esperarAte(() => aba.linhas().length === 2, "Busca: a lista traz só as de Operações");
      afirmar("e a lista traz as Vagas que a camada devolveu", igual(aba.linhas(), [ID_R, ID_E]), aba.linhas().join(", "));
      const soltarFiltro = segurar();
      await aba.clicar(aba.filtro("rascunho"), "filtro Rascunho", () => leitura.pedidos.length === pedidosAntesDaBusca + 2);
      afirmar(
        "Filtro: escolher um Estado consulta `{termo: \"operacoes\", estado: \"rascunho\"}` sem esqueleto, e o botão fica `aria-pressed`",
        igual(leitura.pedidos.at(-1), { termo: "operacoes", estado: "rascunho" }) &&
          aba.situacao() === "lista" &&
          aba.filtro("rascunho")?.getAttribute("aria-pressed") === "true" &&
          aba.filtro("aberta")?.getAttribute("aria-pressed") === "false",
        `${JSON.stringify(leitura.pedidos.at(-1))} | ${aba.situacao()}`,
      );
      soltarFiltro();
      await esperarAte(() => aba.linhas().length === 1, "Filtro: só o Rascunho de Operações");
      await aba.clicar(aba.filtro("aberta"), "filtro Aberta", () => igual(leitura.pedidos.at(-1), { termo: "operacoes", estado: "aberta" }));
      afirmar(
        "o filtro é de UM Estado: escolher outro troca (não soma), e só ele fica marcado",
        aba.filtro("aberta")?.getAttribute("aria-pressed") === "true" &&
          aba.filtro("rascunho")?.getAttribute("aria-pressed") === "false",
      );
      await esperarAte(() => aba.situacao() === "vazio-de-busca", "Filtro: nenhuma Aberta de Operações");
      afirmar(
        "a busca não mexe na contagem da aba (ela conta quantas Vagas EXISTEM)",
        aba.contagens.length === contagensAntes,
        JSON.stringify(aba.contagens.slice(contagensAntes)),
      );

      /* ══ Vazio de busca ══ */
      const vazioDeBusca = aba.alvo.querySelector('[data-estado-da-lista="vazio-de-busca"]');
      afirmar(
        "Vazio de busca: tela própria, dizendo o que foi procurado, com \"limpar busca\" e SEM o convite de criar",
        vazioDeBusca !== null &&
          (vazioDeBusca.textContent ?? "").includes("operacoes") &&
          vazioDeBusca.querySelector('[data-papel="limpar-busca"]') !== null &&
          vazioDeBusca.querySelector('[data-papel="nova-vaga"]') === null &&
          aba.alvo.querySelector('[data-estado-da-lista="vazio"]') === null,
      );
      const pedidosAntesDeLimpar = leitura.pedidos.length;
      await aba.clicar(vazioDeBusca?.querySelector('[data-papel="limpar-busca"]'), "Limpar busca", () => aba.situacao() === "lista" && aba.linhas().length === 3);
      afirmar(
        "\"limpar busca\" zera o campo e o filtro, a lista volta inteira, e a contagem é anunciada de novo",
        aba.busca()?.value === "" &&
          estadosDaVaga.ESTADOS_DA_VAGA.every((estado) => aba.filtro(estado)?.getAttribute("aria-pressed") === "false") &&
          igual(leitura.pedidos.at(-1), { termo: "", estado: null }) &&
          aba.contagens.at(-1) === 3,
        `${aba.busca()?.value} | ${JSON.stringify(leitura.pedidos.at(-1))} | ${JSON.stringify(aba.contagens)}`,
      );
      /* Revisão da 5.5: CONTAR os pedidos, não só olhar o último. Zerar só o
         termo digitado aplicaria primeiro o filtro limpo com o termo velho
         (`{termo:"operacoes", estado:null}`), e o termo vazio só depois da
         espera. Espera-se uma espera e meia a mais para um pedido atrasado ter
         tempo de aparecer. */
      await new Promise((resolver) => setTimeout(resolver, ESPERA * 1.5));
      await passo();
      afirmar(
        "e \"limpar busca\" faz UMA consulta só, já sem termo e sem filtro: nenhuma consulta intermediária com o termo velho, e nenhuma atrasada depois",
        igual(leitura.pedidos.slice(pedidosAntesDeLimpar), [{ termo: "", estado: null }]),
        JSON.stringify(leitura.pedidos.slice(pedidosAntesDeLimpar)),
      );
      await aba.desmontar({ escritasEsperadas: 0 });

      /* ══ Vazio inicial ══ */
      leitura.vagas = [];
      const vazio = await montar("/admin?aba=carreiras", { caso: "Vazio inicial" });
      const blocoVazio = vazio.alvo.querySelector('[data-estado-da-lista="vazio"]');
      const novaDoVazio = blocoVazio?.querySelector('[data-papel="nova-vaga"]');
      afirmar(
        "Vazio inicial: tela própria com Nova Vaga (link para `/admin/carreiras/vaga/nova`), sem \"limpar busca\", e contagem 0",
        blocoVazio !== null &&
          novaDoVazio?.getAttribute("href") === "/admin/carreiras/vaga/nova" &&
          blocoVazio.querySelector('[data-papel="limpar-busca"]') === null &&
          vazio.contagens.at(-1) === 0,
        JSON.stringify(vazio.contagens),
      );
      await vazio.clicar(novaDoVazio, "Nova Vaga", () => vazio.onde() === "/admin/carreiras/vaga/nova");
      afirmar("e Nova Vaga leva ao formulário novo", vazio.onde() === "/admin/carreiras/vaga/nova", vazio.onde());
      await vazio.desmontar({ escritasEsperadas: 0 });
      leitura.vagas = TRES;

      /* ══ Erro: a leitura das Vagas, a das Classificações e a exceção ══ */
      for (const [rotulo, ligar, desligar, trecho] of [
        ["das Vagas", () => (leitura.falharVagas = true), () => (leitura.falharVagas = false), "listar as vagas"],
        ["das Classificações", () => (leitura.falharClassificacoes = true), () => (leitura.falharClassificacoes = false), "classificações"],
        ["que lança", () => (leitura.lancar = true), () => (leitura.lancar = false), "Confira a conexão"],
      ]) {
        ligar();
        const falhou = await montar("/admin?aba=carreiras", {
          caso: `Erro na leitura ${rotulo}`,
          toleradas:
            rotulo === "que lança"
              ? [
                  {
                    padrao: /^\[Painel\] A leitura da lista de vagas lançou.*dublê: a leitura lançou/,
                    motivo: "o `catch` da leitura REGISTRA a exceção no console (revisão da 5.5), além de virar erro tipado",
                  },
                ]
              : [],
        });
        const bloco = falhou.alvo.querySelector('[data-estado-da-lista="erro"]');
        afirmar(
          `Erro na leitura ${rotulo}: tela de erro (com a frase da falha e "tentar de novo"), nunca o vazio, e a contagem é desanunciada`,
          bloco !== null &&
            bloco.getAttribute("role") === "alert" &&
            (bloco.querySelector('[data-papel="motivo-do-erro"]')?.textContent ?? "").includes(trecho) &&
            bloco.querySelector('[data-papel="tentar-de-novo"]') !== null &&
            falhou.alvo.querySelector('[data-estado-da-lista="vazio"]') === null &&
            falhou.linhas().length === 0 &&
            falhou.contagens.at(-1) === null,
          `${falhou.situacao()} | ${bloco?.textContent?.slice(0, 160)}`,
        );
        desligar();
        await falhou.clicar(bloco?.querySelector('[data-papel="tentar-de-novo"]'), "Tentar de novo", () => falhou.situacao() === "lista");
        afirmar(`e "tentar de novo" relê e mostra a lista (${rotulo})`, falhou.linhas().length === 3 && falhou.contagens.at(-1) === 3);
        await falhou.desmontar({ escritasEsperadas: 0 });
      }
      leitura.vagas = [];
      leitura.falharVagas = true;
      const erroSemVagas = await montar("/admin?aba=carreiras", { caso: "Erro com a lista vazia" });
      afirmar(
        "e a falha continua sendo erro mesmo quando não haveria Vaga nenhuma para mostrar",
        erroSemVagas.situacao() === "erro",
        erroSemVagas.situacao(),
      );
      leitura.falharVagas = false;
      await erroSemVagas.desmontar({ escritasEsperadas: 0 });
      leitura.vagas = TRES;

      /* ══ Abrir pela linha, a trava global, a recusa, a rede e a exceção ══ */
      const acoes = await montar("/admin?aba=carreiras", {
        caso: "Ações de Estado pela linha",
        toleradas: [
          {
            padrao: /^\[Painel\] A mudança de Estado da vaga lançou.*dublê: a escrita lançou/,
            motivo: "o `catch` da mudança de Estado REGISTRA a exceção no console (revisão da 5.5), além de virar erro tipado",
          },
        ],
      });
      const abrirSegurado = segurada(() => ({
        ok: true,
        dados: {
          operacao: "mudarEstadoDaVaga",
          vaga: { ...R, estado: "aberta", aberta_em: "2026-09-25T12:00:00Z", titulo: "Analista de Operações Pleno" },
        },
      }));
      escrita.respostas.mudarEstadoDaVaga.push(abrirSegurado.responder);
      const escritasAntes = escrita.todas.length;
      const botaoAbrir = acoes.acao(ID_R, "abrir");
      await act(async () => {
        botaoAbrir.dispatchEvent(new janela.MouseEvent("click", { bubbles: true }));
        botaoAbrir.dispatchEvent(new janela.MouseEvent("click", { bubbles: true }));
      });
      await esperarAte(() => acoes.acao(ID_R, "abrir")?.getAttribute("aria-busy") === "true", "Abrir pela linha: a ação entra em voo");
      const escritoras = [...acoes.alvo.querySelectorAll('li[data-vaga] button[data-acao]')];
      afirmar(
        "Abrir pela linha: UM pedido mesmo com clique duplo, `mudarEstadoDaVaga(id, \"abrir\")`, e a trava é GLOBAL (toda ação que escreve, em toda linha, desabilita) com `aria-busy` e o anúncio",
        escrita.todas.length === escritasAntes + 1 &&
          igual(escrita.todas.at(-1), { op: "mudarEstadoDaVaga", id: ID_R, acao: "abrir" }) &&
          escritoras.length === 5 &&
          escritoras.every((b) => b.disabled) &&
          acoes.acao(ID_R, "abrir")?.getAttribute("aria-busy") === "true" &&
          acoes.acao(ID_R, "editar")?.tagName === "A" &&
          acoes.emCurso().includes("Analista de Operações"),
        `${escrita.todas.length - escritasAntes} pedido(s) | desabilitadas ${escritoras.filter((b) => b.disabled).length}/${escritoras.length} | ${acoes.emCurso()}`,
      );
      abrirSegurado.controle.soltar();
      await esperarAte(() => acoes.pilula(ID_R) === "aberta" && acoes.ocioso(), "Abrir pela linha: a linha reflete a Vaga devolvida");
      afirmar(
        "e a linha passa a refletir a Vaga DEVOLVIDA (pílula Aberta, título do servidor, ações da Aberta), com a notificação de sucesso da tabela",
        acoes.pilula(ID_R) === "aberta" &&
          (acoes.linha(ID_R)?.querySelector('[data-papel="titulo"]')?.textContent ?? "") === "Analista de Operações Pleno" &&
          igual(acoes.acoesDe(ID_R), ["editar", "encerrar", "ver"]) &&
          acoes.acao(ID_R, "ver")?.getAttribute("href") === "/carreiras/analista-de-operacoes" &&
          igual(avisos.sucessos.at(-1), ["Vaga aberta", "Analista de Operações Pleno"]) &&
          [...acoes.alvo.querySelectorAll('li[data-vaga] button[data-acao]')].every((b) => !b.disabled),
        JSON.stringify(avisos.sucessos.at(-1)),
      );

      const errosAntes = avisos.erros.length;
      escrita.respostas.mudarEstadoDaVaga.push({
        ok: false,
        erro: { tipo: "dados_invalidos", mensagem: "Falta o Link de Candidatura para reabrir esta vaga." },
      });
      await acoes.clicar(acoes.acao(ID_E, "reabrir"), "Reabrir vaga");
      afirmar(
        "Recusa: a notificação traz a frase do SERVIDOR, sem \"Tentar de novo\" (repetir daria a mesma recusa), e a linha fica intacta",
        avisos.erros.length === errosAntes + 1 &&
          avisos.erros.at(-1)[0] === "Não deu para mudar o estado da vaga" &&
          avisos.erros.at(-1)[1] === "Falta o Link de Candidatura para reabrir esta vaga." &&
          avisos.erros.at(-1)[2] === null &&
          acoes.pilula(ID_E) === "encerrada" &&
          igual(acoes.acoesDe(ID_E), ["editar", "reabrir", "ver", "excluir"]),
        JSON.stringify(avisos.erros.at(-1)?.slice(0, 2)),
      );

      escrita.respostas.mudarEstadoDaVaga.push({
        ok: false,
        erro: { tipo: "rede", mensagem: "Não conseguimos falar com o servidor. Confira a conexão e tente de novo." },
      });
      await acoes.clicar(acoes.acao(ID_A, "encerrar"), "Encerrar vaga");
      afirmar(
        "Rede: a notificação (com o título da falha de Estado) oferece \"Tentar de novo\", e a linha fica como estava",
        avisos.erros.at(-1)?.[0] === "Não deu para mudar o estado da vaga" &&
          avisos.erros.at(-1)?.[2]?.rotulo === "Tentar de novo" &&
          acoes.pilula(ID_A) === "aberta",
        JSON.stringify(avisos.erros.at(-1)?.[2]?.rotulo),
      );
      escrita.respostas.mudarEstadoDaVaga.push({
        ok: true,
        dados: { operacao: "mudarEstadoDaVaga", vaga: { ...A, estado: "encerrada" } },
      });
      const antesDaRepeticao = escrita.todas.length;
      await acoes.acionarSaida(() => acoes.pilula(ID_A) === "encerrada" && acoes.ocioso());
      afirmar(
        "e \"Tentar de novo\" repete a MESMA mudança, e a linha passa a Encerrada",
        igual(escrita.todas.slice(antesDaRepeticao), [{ op: "mudarEstadoDaVaga", id: ID_A, acao: "encerrar" }]) &&
          acoes.pilula(ID_A) === "encerrada" &&
          igual(avisos.sucessos.at(-1), ["Vaga encerrada", "Desenvolvedora Front-end"]),
      );
      escrita.respostas.mudarEstadoDaVaga.push(() => {
        throw new Error("dublê: a escrita lançou");
      });
      await acoes.clicar(acoes.acao(ID_A, "reabrir"), "Reabrir vaga (exceção)");
      afirmar(
        "Exceção na escrita: vira notificação com o título da falha, frase de reserva e \"Tentar de novo\", e a trava é solta (nada fica desabilitado)",
        avisos.erros.at(-1)?.[0] === "Não deu para mudar o estado da vaga" &&
          (avisos.erros.at(-1)?.[1] ?? "").length > 10 &&
          avisos.erros.at(-1)?.[2]?.rotulo === "Tentar de novo" &&
          acoes.pilula(ID_A) === "encerrada" &&
          [...acoes.alvo.querySelectorAll('li[data-vaga] button[data-acao]')].every((b) => !b.disabled),
      );
      await acoes.desmontar({ escritasEsperadas: 5 });

      /* ══ Excluir ══ */
      const exclusao = await montar("/admin?aba=carreiras", { caso: "Excluir" });
      await exclusao.clicar(exclusao.acao(ID_R, "excluir"), "Excluir vaga", () => exclusao.dialogo() !== null);
      const dialogo = exclusao.dialogo();
      afirmar(
        "Excluir: abre UM diálogo que nomeia a Vaga, com o botão \"Excluir vaga\", e nada é excluído antes de confirmar",
        dialogo !== null &&
          janela.document.querySelectorAll('[role="alertdialog"]').length === 1 &&
          (dialogo.textContent ?? "").includes("Analista de Operações") &&
          (dialogo.querySelector('[data-papel="confirmar"]')?.textContent ?? "") === "Excluir vaga" &&
          !escrita.todas.some((c) => c.op === "excluirVaga"),
        (dialogo?.textContent ?? "").slice(0, 200),
      );
      const cancelar = [...(dialogo?.querySelectorAll("button") ?? [])].find((b) => (b.textContent ?? "").trim() === "Cancelar");
      await exclusao.clicar(cancelar, "Cancelar", () => exclusao.dialogo() === null);
      afirmar(
        "Cancelar fecha o diálogo sem excluir, e a linha fica",
        exclusao.dialogo() === null && !escrita.todas.some((c) => c.op === "excluirVaga") && exclusao.linha(ID_R) !== null,
      );
      await exclusao.clicar(exclusao.acao(ID_R, "excluir"), "Excluir vaga", () => exclusao.dialogo() !== null);
      const excluirSegurado = segurada({ ok: true, dados: { operacao: "excluirVaga", id: ID_R } });
      escrita.respostas.excluirVaga.push(excluirSegurado.responder);
      await exclusao.clicar(exclusao.dialogo()?.querySelector('[data-papel="confirmar"]'), "confirmar", () =>
        escrita.todas.some((c) => c.op === "excluirVaga"),
      );
      afirmar(
        "ao confirmar, `excluirVaga(id)` UMA vez, e o diálogo diz o que está acontecendo enquanto a resposta não vem",
        igual(escrita.todas.filter((c) => c.op === "excluirVaga"), [{ op: "excluirVaga", id: ID_R }]) &&
          (exclusao.dialogo()?.querySelector('[data-papel="dialogo-em-curso"]')?.textContent ?? "").includes("Excluindo"),
      );
      excluirSegurado.controle.soltar();
      await esperarAte(() => exclusao.linha(ID_R) === null && exclusao.dialogo() === null, "Excluir: a linha sai");
      await esperarAte(
        () => janela.document.activeElement === exclusao.acao(ID_A, "editar"),
        "Excluir: o foco volta ao primeiro Editar que sobrou",
      );
      afirmar(
        "a linha sai, o diálogo fecha, o foco volta a um lugar previsível (o primeiro Editar), a contagem desce e a notificação é a da tabela",
        exclusao.linha(ID_R) === null &&
          igual(exclusao.linhas(), [ID_A, ID_E]) &&
          janela.document.activeElement === exclusao.acao(ID_A, "editar") &&
          exclusao.contagens.at(-1) === 2 &&
          igual(avisos.sucessos.at(-1), ["Vaga excluída", "Analista de Operações"]),
        `foco: ${janela.document.activeElement?.getAttribute?.("data-acao")} | ${JSON.stringify(exclusao.contagens)}`,
      );
      afirmar("a Aberta não oferece Excluir", exclusao.acao(ID_A, "excluir") === null);
      await exclusao.clicar(exclusao.acao(ID_E, "excluir"), "Excluir vaga (recusa)", () => exclusao.dialogo() !== null);
      escrita.respostas.excluirVaga.push({
        ok: false,
        erro: { tipo: "dados_invalidos", mensagem: "Esta vaga não pode ser excluída agora. Encerre a vaga antes." },
      });
      await exclusao.clicar(exclusao.dialogo()?.querySelector('[data-papel="confirmar"]'), "confirmar (recusa)", () =>
        exclusao.dialogo() === null && exclusao.ocioso(),
      );
      afirmar(
        "Recusa na exclusão: a notificação traz a frase do servidor, e a linha fica",
        avisos.erros.at(-1)?.[0] === "Não deu para excluir a vaga" &&
          avisos.erros.at(-1)?.[1] === "Esta vaga não pode ser excluída agora. Encerre a vaga antes." &&
          exclusao.linha(ID_E) !== null &&
          exclusao.contagens.at(-1) === 2,
        JSON.stringify(avisos.erros.at(-1)?.slice(0, 2)),
      );
      await exclusao.desmontar({ escritasEsperadas: 2 });

      /* ══ Revisão da 5.5: a Vaga que já não existia, a rede na exclusão ══ */
      {
        const sumida = await montar("/admin?aba=carreiras", { caso: "Excluir a Vaga que já não existia" });
        const errosAntes = avisos.erros.length;
        const sucessosAntes = avisos.sucessos.length;
        await sumida.clicar(sumida.acao(ID_E, "excluir"), "Excluir vaga", () => sumida.dialogo() !== null);
        escrita.respostas.excluirVaga.push({
          ok: false,
          erro: { tipo: "nao_encontrado", mensagem: "Esta vaga já não está no Painel, alguém pode tê-la excluído antes." },
        });
        await sumida.clicar(sumida.dialogo()?.querySelector('[data-papel="confirmar"]'), "confirmar (inexistente)", () =>
          sumida.linha(ID_E) === null && sumida.dialogo() === null && sumida.ocioso(),
        );
        await esperarAte(
          () => janela.document.activeElement === sumida.acao(ID_R, "editar"),
          "Excluir a Vaga que já não existia: o foco volta ao primeiro Editar",
        );
        const aviso = avisos.erros.at(-1) ?? [];
        afirmar(
          "Exclusão de Vaga que já não existia (`nao_encontrado`): a linha sai, a contagem cai, o foco volta, e UMA notificação com frase PRÓPRIA (\"A vaga já não existia\"), sem \"a lista continua como estava\" e sem \"Tentar de novo\"",
          sumida.linha(ID_E) === null &&
            igual(sumida.linhas(), [ID_R, ID_A]) &&
            sumida.contagens.at(-1) === 2 &&
            janela.document.activeElement === sumida.acao(ID_R, "editar") &&
            avisos.erros.length === errosAntes + 1 &&
            avisos.sucessos.length === sucessosAntes &&
            aviso[0] === "A vaga já não existia" &&
            /saiu da lista/.test(aviso[1] ?? "") &&
            !/continua como estava/.test(`${aviso[0]} ${aviso[1]}`) &&
            aviso[2] === null,
          `${JSON.stringify(aviso)} | ${JSON.stringify(sumida.contagens)} | foco: ${janela.document.activeElement?.getAttribute?.("data-acao")}`,
        );

        await sumida.clicar(sumida.acao(ID_R, "excluir"), "Excluir vaga (rede)", () => sumida.dialogo() !== null);
        escrita.respostas.excluirVaga.push({
          ok: false,
          erro: { tipo: "rede", mensagem: "Não conseguimos falar com o servidor para excluir a vaga. Confira a conexão e tente excluir de novo." },
        });
        await sumida.clicar(sumida.dialogo()?.querySelector('[data-papel="confirmar"]'), "confirmar (rede)", () =>
          sumida.dialogo() === null && sumida.ocioso(),
        );
        afirmar(
          "Rede na exclusão: a linha fica, e a notificação (com o título da falha de exclusão) oferece \"Tentar de novo\"",
          sumida.linha(ID_R) !== null &&
            avisos.erros.at(-1)?.[0] === "Não deu para excluir a vaga" &&
            avisos.erros.at(-1)?.[2]?.rotulo === "Tentar de novo",
          JSON.stringify(avisos.erros.at(-1)?.slice(0, 2)),
        );
        escrita.respostas.excluirVaga.push({ ok: true, dados: { operacao: "excluirVaga", id: ID_R } });
        const antesDaRepeticao = escrita.todas.length;
        await sumida.acionarSaida(() => sumida.linha(ID_R) === null && sumida.ocioso());
        afirmar(
          "e \"Tentar de novo\" repete `excluirVaga(id)` exatamente UMA vez, sem reabrir o diálogo (a pessoa já confirmou), e a linha sai",
          igual(escrita.todas.slice(antesDaRepeticao), [{ op: "excluirVaga", id: ID_R }]) &&
            sumida.dialogo() === null &&
            sumida.linha(ID_R) === null &&
            sumida.contagens.at(-1) === 1 &&
            igual(avisos.sucessos.at(-1), ["Vaga excluída", "Analista de Operações"]),
          `${JSON.stringify(escrita.todas.slice(antesDaRepeticao))} | ${JSON.stringify(sumida.contagens)}`,
        );
        await sumida.desmontar({ escritasEsperadas: 3 });
      }

      /* ══ Revisão da 5.5: mudar o Estado da Vaga que já não existia ══ */
      {
        const sumida = await montar("/admin?aba=carreiras", { caso: "Mudar o Estado da Vaga que já não existia" });
        const errosAntes = avisos.erros.length;
        escrita.respostas.mudarEstadoDaVaga.push({
          ok: false,
          erro: { tipo: "nao_encontrado", mensagem: "Esta vaga já não está no Painel, então não dá para mudar o estado dela." },
        });
        await sumida.clicar(sumida.acao(ID_R, "abrir"), "Abrir vaga (inexistente)", () => sumida.linha(ID_R) === null && sumida.ocioso());
        await esperarAte(
          () => janela.document.activeElement === sumida.acao(ID_A, "editar"),
          "Mudar o Estado da Vaga que já não existia: o foco volta ao primeiro Editar",
        );
        const aviso = avisos.erros.at(-1) ?? [];
        afirmar(
          "Mudança de Estado com `nao_encontrado`: a linha SAI (não fica mostrando o que o banco não tem), a contagem cai, o foco volta, e a notificação diz que ela saiu, sem \"Tentar de novo\"",
          sumida.linha(ID_R) === null &&
            igual(sumida.linhas(), [ID_A, ID_E]) &&
            sumida.contagens.at(-1) === 2 &&
            janela.document.activeElement === sumida.acao(ID_A, "editar") &&
            avisos.erros.length === errosAntes + 1 &&
            aviso[0] === "Não deu para mudar o estado da vaga" &&
            /saiu da lista/.test(aviso[1] ?? "") &&
            !/continua como estava/.test(aviso[1] ?? "") &&
            aviso[2] === null,
          `${JSON.stringify(aviso)} | ${sumida.linhas().join(", ")}`,
        );
        await sumida.desmontar({ escritasEsperadas: 1 });
      }

      /* ══ Revisão da 5.5: com filtro de Estado, a linha que muda para fora dele sai ══ */
      {
        const filtrada = await montar("/admin?aba=carreiras", { caso: "Filtro Rascunho e Abrir" });
        await filtrada.clicar(filtrada.filtro("rascunho"), "filtro Rascunho", () => igual(filtrada.linhas(), [ID_R]) && filtrada.ocioso());
        const contagensAntes = filtrada.contagens.length;
        escrita.respostas.mudarEstadoDaVaga.push({
          ok: true,
          dados: { operacao: "mudarEstadoDaVaga", vaga: { ...R, estado: "aberta", aberta_em: "2026-09-25T12:00:00Z" } },
        });
        await filtrada.clicar(filtrada.acao(ID_R, "abrir"), "Abrir vaga (filtro Rascunho)", () => filtrada.linha(ID_R) === null && filtrada.ocioso());
        afirmar(
          "Filtro Rascunho + Abrir: a linha que passou a Aberta SAI da lista filtrada (sobra o vazio de busca), a contagem da aba (quantas existem) não muda, e o sucesso é notificado",
          filtrada.linha(ID_R) === null &&
            filtrada.situacao() === "vazio-de-busca" &&
            filtrada.contagens.length === contagensAntes &&
            filtrada.contagens.at(-1) === 3 &&
            igual(avisos.sucessos.at(-1), ["Vaga aberta", "Analista de Operações"]),
          `${filtrada.situacao()} | ${filtrada.linhas().join(", ")} | ${JSON.stringify(filtrada.contagens)}`,
        );
        await filtrada.desmontar({ escritasEsperadas: 1 });
      }

      /* ══ Revisão da 5.5: "Tentar de novo" depois de a aba sair da tela ══ */
      {
        const saindo = await montar("/admin?aba=carreiras", { caso: "Tentar de novo depois de desmontar" });
        escrita.respostas.mudarEstadoDaVaga.push({ ok: false, erro: { tipo: "rede", mensagem: "Não conseguimos falar com o servidor. Confira a conexão e tente de novo." } });
        await saindo.clicar(saindo.acao(ID_A, "encerrar"), "Encerrar vaga (rede)");
        const saidaDoEstado = avisos.erros.at(-1)?.[2] ?? null;
        await saindo.clicar(saindo.acao(ID_E, "excluir"), "Excluir vaga (rede)", () => saindo.dialogo() !== null);
        escrita.respostas.excluirVaga.push({ ok: false, erro: { tipo: "rede", mensagem: "Não conseguimos falar com o servidor. Confira a conexão e tente excluir de novo." } });
        await saindo.clicar(saindo.dialogo()?.querySelector('[data-papel="confirmar"]'), "confirmar (rede)", () =>
          saindo.dialogo() === null && saindo.ocioso(),
        );
        const saidaDaExclusao = avisos.erros.at(-1)?.[2] ?? null;
        await saindo.desmontar({ escritasEsperadas: 2 });
        const antes = escrita.todas.length;
        await act(async () => {
          saidaDoEstado?.aoAcionar?.();
          saidaDaExclusao?.aoAcionar?.();
        });
        await passo();
        afirmar(
          "\"Tentar de novo\" acionado DEPOIS de a aba sair da tela não chama escrita nenhuma (nem a mudança de Estado, nem a exclusão)",
          typeof saidaDoEstado?.aoAcionar === "function" &&
            typeof saidaDaExclusao?.aoAcionar === "function" &&
            escrita.todas.length === antes,
          JSON.stringify(escrita.todas.slice(antes)),
        );
      }

      /* ══ Revisão da 5.5: leituras sobrepostas, soltas em ordem inversa ══ */
      {
        const sobrepostas = await montar("/admin?aba=carreiras", { caso: "Leituras sobrepostas" });
        await sobrepostas.clicar(sobrepostas.filtro("rascunho"), "filtro Rascunho", () => igual(sobrepostas.linhas(), [ID_R]) && sobrepostas.ocioso());
        leitura.trancar = true;
        leitura.trancadas.length = 0;
        /* #1: sem recorte, com as TRÊS Vagas que o banco tinha naquele instante. */
        await sobrepostas.clicar(sobrepostas.filtro("rascunho"), "desmarcar Rascunho", () => leitura.trancadas.length === 1);
        /* O banco muda: agora são duas. */
        leitura.vagas = [R, A];
        /* #2: com o termo "zzz" (nada). #3: sem recorte, já com as DUAS. */
        await sobrepostas.digitar("zzz");
        await esperarAte(() => leitura.trancadas.length === 2, "Leituras sobrepostas: a segunda sai");
        await sobrepostas.digitar("");
        await esperarAte(() => leitura.trancadas.length === 3, "Leituras sobrepostas: a terceira sai");
        const [primeira, segunda, terceira] = leitura.trancadas;
        afirmar(
          "Leituras sobrepostas: três pedidos em voo ao mesmo tempo, cada um com a SUA trava",
          igual(primeira?.pedido, { termo: "", estado: null }) &&
            igual(segunda?.pedido, { termo: "zzz", estado: null }) &&
            igual(terceira?.pedido, { termo: "", estado: null }),
          JSON.stringify(leitura.trancadas.map((t) => t.pedido)),
        );
        terceira?.soltar();
        await esperarAte(
          () => igual(sobrepostas.linhas(), [ID_R, ID_A]) && sobrepostas.alvo.querySelector("[data-atualizando]") === null,
          "Leituras sobrepostas: a mais nova pousa",
        );
        segunda?.soltar();
        primeira?.soltar();
        for (let i = 0; i < 4; i += 1) await passo();
        afirmar(
          "soltas em ordem INVERSA, as linhas e a contagem são as da leitura MAIS NOVA: as atrasadas (a do termo \"zzz\" e a de três Vagas) são descartadas",
          igual(sobrepostas.linhas(), [ID_R, ID_A]) &&
            sobrepostas.situacao() === "lista" &&
            sobrepostas.contagens.at(-1) === 2 &&
            sobrepostas.alvo.querySelector("[data-atualizando]") === null,
          `${sobrepostas.linhas().join(", ")} | ${JSON.stringify(sobrepostas.contagens)}`,
        );
        leitura.trancar = false;
        leitura.trancadas.length = 0;
        leitura.vagas = TRES;
        await sobrepostas.desmontar({ escritasEsperadas: 0 });
      }

      /* ══ Revisão da 5.5: leitura em voo e mudança de Estado bem-sucedida ══ */
      {
        const emVoo = await montar("/admin?aba=carreiras", { caso: "Leitura em voo e mudança de Estado" });
        leitura.trancar = true;
        leitura.trancadas.length = 0;
        /* A leitura pedida ANTES da escrita: responde com o Rascunho. */
        await emVoo.digitar("analista");
        await esperarAte(() => leitura.trancadas.length === 1, "Leitura em voo: a busca sai e fica presa");
        const RAberta = { ...R, estado: "aberta", aberta_em: "2026-09-25T12:00:00Z" };
        /* A escrita muda o banco NO SERVIDOR: quando ela responde, o banco já
           tem a Aberta, e uma leitura pedida dali em diante a vê. */
        escrita.respostas.mudarEstadoDaVaga.push(() => {
          leitura.vagas = [RAberta, A, E];
          return { ok: true, dados: { operacao: "mudarEstadoDaVaga", vaga: RAberta } };
        });
        await emVoo.clicar(emVoo.acao(ID_R, "abrir"), "Abrir vaga (leitura em voo)", () => emVoo.pilula(ID_R) === "aberta" && emVoo.ocioso());
        await esperarAte(() => leitura.trancadas.length === 2, "Leitura em voo: a escrita faz a lista reler");
        leitura.trancadas[0]?.soltar();
        for (let i = 0; i < 4; i += 1) await passo();
        afirmar(
          "Leitura em voo + mudança de Estado bem-sucedida: a resposta ATRASADA (pedida antes da escrita, com o Rascunho) não desfaz a linha",
          emVoo.pilula(ID_R) === "aberta" && igual(emVoo.acoesDe(ID_R), ["editar", "encerrar", "ver"]),
          `${emVoo.pilula(ID_R)} | ${emVoo.linhas().join(", ")}`,
        );
        leitura.trancadas[1]?.soltar();
        await esperarAte(
          () => igual(emVoo.linhas(), [ID_R]) && emVoo.alvo.querySelector("[data-atualizando]") === null,
          "Leitura em voo: a releitura pousa",
        );
        afirmar(
          "e a lista é RELIDA depois da escrita: pousa a busca pedida (só \"analista\"), com a Vaga como o banco a tem agora, e nada fica \"atualizando\"",
          igual(emVoo.linhas(), [ID_R]) &&
            emVoo.pilula(ID_R) === "aberta" &&
            igual(leitura.trancadas.map((t) => t.pedido), [
              { termo: "analista", estado: null },
              { termo: "analista", estado: null },
            ]),
          `${emVoo.linhas().join(", ")} | ${JSON.stringify(leitura.trancadas.map((t) => t.pedido))}`,
        );
        leitura.trancar = false;
        leitura.trancadas.length = 0;
        leitura.vagas = TRES;
        await emVoo.desmontar({ escritasEsperadas: 1 });
      }

      /* ══ Classificação sem par e Estado desconhecido ══ */
      leitura.vagas = [
        R,
        vaga(ID_S, { titulo: "Vaga órfã", slug: "vaga-orfa", departamento_id: SEM_PAR, nivel_id: SEM_PAR }),
        vaga(ID_X, { titulo: "Vaga torta", slug: "vaga-torta", estado: "xpto" }),
      ];
      const tortas = await montar("/admin?aba=carreiras", {
        caso: "Classificação sem par e Estado desconhecido",
        toleradas: [
          {
            padrao: /\[voz do Painel\] Estado de Vaga desconhecido na listagem: "xpto"/,
            motivo: "a guarda do vocabulário ACUSA o Estado desconhecido (política de `exigir`, registrada em produção)",
          },
        ],
      });
      const orfa = tortas.linha(ID_S);
      afirmar(
        "Classificação sem par: rótulo neutro, com a cor neutra, e a lista inteira de pé",
        tortas.situacao() === "lista" &&
          igual(tortas.linhas(), [ID_R, ID_S, ID_X]) &&
          orfa?.querySelector('[data-papel="nivel"]')?.textContent === "Nível não encontrado" &&
          orfa?.querySelector('[data-papel="nivel"]')?.getAttribute("data-conhecida") === "false" &&
          orfa?.querySelector('[data-papel="departamento"]')?.textContent === "Departamento não encontrado" &&
          estiloDe(orfa?.querySelector('[data-papel="nivel"]')).includes(
            classificacoes.aparenciaDaCorDeClassificacao(null).fundo,
          ),
        orfa?.outerHTML?.slice(0, 300),
      );
      afirmar(
        "Estado desconhecido: a linha aparece só com Editar e sem pílula, e a guarda o ACUSA pela política de voz",
        igual(tortas.acoesDe(ID_X), ["editar"]) && tortas.pilula(ID_X) === null && tortas.pilula(ID_R) === "rascunho",
      );
      await tortas.desmontar({ escritasEsperadas: 0 });
      leitura.vagas = TRES;

      /* ══ A página: aba pela URL, montagem só com a aba ativa, contagem na aba ══ */
      const RECLAMACOES_DA_PAGINA = [];
      const abaDe = (tela, id) => tela.alvo.querySelector(`#aba-do-painel-${id}`);
      const pedidosAntesDaPagina = leitura.pedidos.length;
      const noBlog = await montar("/admin", {
        caso: "Página em /admin",
        alvoDaMontagem: "pagina",
        toleradas: RECLAMACOES_DA_PAGINA,
        ateQue: () => janela.document.querySelector("#aba-do-painel-blog") !== null,
      });
      await passo();
      afirmar(
        "`/admin` abre a aba Blog: a aba Carreiras NÃO é montada, e a leitura de Carreiras não é chamada",
        abaDe(noBlog, "blog")?.getAttribute("aria-selected") === "true" &&
          abaDe(noBlog, "carreiras")?.getAttribute("aria-selected") === "false" &&
          noBlog.alvo.querySelector('input[data-busca="posts"]') !== null &&
          noBlog.alvo.querySelector('[data-papel="aba-de-carreiras"]') === null &&
          leitura.pedidos.length === pedidosAntesDaPagina &&
          !/\d/.test(abaDe(noBlog, "carreiras")?.textContent ?? ""),
        `pedidos de Carreiras: ${leitura.pedidos.length - pedidosAntesDaPagina} | aba: ${abaDe(noBlog, "carreiras")?.textContent}`,
      );
      await noBlog.clicar(abaDe(noBlog, "carreiras"), "aba Carreiras", () => noBlog.alvo.querySelector('[data-estado-da-lista="lista"]') !== null);
      afirmar(
        "trocar para a aba Carreiras monta o módulo dentro do `tabpanel`, lê o banco e a aba ganha a contagem formatada",
        abaDe(noBlog, "carreiras")?.getAttribute("aria-selected") === "true" &&
          noBlog.alvo.querySelector('[role="tabpanel"] [data-papel="aba-de-carreiras"]') !== null &&
          noBlog.alvo.querySelector('input[data-busca="posts"]') === null &&
          leitura.pedidos.length > pedidosAntesDaPagina &&
          (abaDe(noBlog, "carreiras")?.textContent ?? "").includes("3"),
        abaDe(noBlog, "carreiras")?.textContent,
      );
      const pedidosDoBlogAntes = posts.pedidos.length;
      await noBlog.digitar("operacoes");
      await noBlog.clicar(abaDe(noBlog, "blog"), "aba Blog", () => noBlog.alvo.querySelector('input[data-busca="posts"]') !== null);
      await passo();
      afirmar(
        "a busca de Carreiras não muda a do Blog: de volta ao Blog, o campo dele está vazio e a leitura de Posts vai sem termo",
        noBlog.alvo.querySelector('input[data-busca="posts"]')?.value === "" &&
          posts.pedidos.length > pedidosDoBlogAntes &&
          (posts.pedidos.at(-1)?.termo ?? "") === "",
        JSON.stringify(posts.pedidos.at(-1)),
      );
      await noBlog.desmontar({ escritasEsperadas: 0 });

      for (const [caminho, esperada] of [
        ["/admin?aba=carreiras", "carreiras"],
        ["/admin?aba=xpto", "blog"],
        ["/admin?aba=Carreiras", "blog"],
      ]) {
        const pedidosAntesDaUrl = leitura.pedidos.length;
        const pelaUrl = await montar(caminho, {
          caso: `Página em ${caminho}`,
          alvoDaMontagem: "pagina",
          toleradas: RECLAMACOES_DA_PAGINA,
          ateQue: () => janela.document.querySelector("#aba-do-painel-blog") !== null,
        });
        if (esperada === "carreiras") {
          await esperarAte(() => pelaUrl.situacao() === "lista", `${caminho}: a lista de Vagas aparece`);
        } else {
          await passo();
        }
        afirmar(
          `\`${caminho}\` abre a aba ${esperada === "carreiras" ? "Carreiras (esqueleto e depois a lista, com a contagem na aba)" : "Blog, sem ler Carreiras"}`,
          abaDe(pelaUrl, esperada)?.getAttribute("aria-selected") === "true" &&
            (esperada === "carreiras"
              ? pelaUrl.linhas().length === 3 &&
                (abaDe(pelaUrl, "carreiras")?.textContent ?? "").includes("3") &&
                pelaUrl.alvo.querySelector('input[data-busca="posts"]') === null
              : leitura.pedidos.length === pedidosAntesDaUrl &&
                pelaUrl.alvo.querySelector('[data-papel="aba-de-carreiras"]') === null),
          `${abaDe(pelaUrl, esperada)?.getAttribute("aria-selected")} | ${abaDe(pelaUrl, "carreiras")?.textContent}`,
        );
        if (esperada === "carreiras") {
          /* Revisão da 5.5: a aba é DERIVADA da URL, e trocar de aba escreve a
             URL. Com a página montada: clicar no Blog tira o parâmetro, e
             navegar para `?aba=carreiras` (voltar do navegador, um link) troca
             a aba sem remontar nada. */
          await pelaUrl.clicar(abaDe(pelaUrl, "blog"), "aba Blog", () => pelaUrl.alvo.querySelector('input[data-busca="posts"]') !== null);
          afirmar(
            "trocar para a aba Blog TIRA o `?aba=carreiras` da URL (o Blog é a aba de quem não pede nenhuma)",
            pelaUrl.onde() === "/admin" && abaDe(pelaUrl, "blog")?.getAttribute("aria-selected") === "true",
            pelaUrl.onde(),
          );
          await pelaUrl.clicar(abaDe(pelaUrl, "carreiras"), "aba Carreiras", () => pelaUrl.situacao() === "lista");
          afirmar(
            "e trocar para Carreiras PÕE `?aba=carreiras` de volta",
            pelaUrl.onde() === "/admin?aba=carreiras" && abaDe(pelaUrl, "carreiras")?.getAttribute("aria-selected") === "true",
            pelaUrl.onde(),
          );
          await pelaUrl.navegar("/admin");
          await esperarAte(
            () => abaDe(pelaUrl, "blog")?.getAttribute("aria-selected") === "true",
            "navegar para /admin com a página montada volta ao Blog",
          );
          await pelaUrl.navegar("/admin?aba=carreiras");
          await esperarAte(() => pelaUrl.situacao() === "lista", "navegar para ?aba=carreiras com a página montada abre a lista");
          afirmar(
            "navegar para `/admin` e depois para `/admin?aba=carreiras` com a página MONTADA troca a aba as duas vezes (a aba segue a URL, não só a primeira)",
            pelaUrl.onde() === "/admin?aba=carreiras" &&
              abaDe(pelaUrl, "carreiras")?.getAttribute("aria-selected") === "true" &&
              pelaUrl.alvo.querySelector('[role="tabpanel"] [data-papel="aba-de-carreiras"]') !== null,
            `${pelaUrl.onde()} | ${abaDe(pelaUrl, "carreiras")?.getAttribute("aria-selected")}`,
          );
        }
        await pelaUrl.desmontar({ escritasEsperadas: 0 });
      }

      afirmar(
        "nenhuma outra leitura de Carreiras foi chamada pela aba (nem a Vaga por id, nem as públicas)",
        leitura.outras.length === 0,
        JSON.stringify(leitura.outras),
      );
      afirmar(
        "toda notificação da aba passou pela regra de voz (nenhuma frase vaga, nenhum rótulo de ação genérico)",
        avisos.problemasDeVoz.length === 0 && avisos.erros.length > 0 && avisos.sucessos.length > 0,
        avisos.problemasDeVoz.join(" | "),
      );
    } catch (erro) {
      afirmar("a aba montada rodou até o fim sem exceção", false, erro?.stack ?? String(erro));
    } finally {
      console.error = erroOriginal;
      try {
        janela.close();
      } catch {
        /* o navegador de mentira já pode ter fechado */
      }
    }
  }
  try {
    rmSync(pasta, { recursive: true, force: true });
  } catch {
    /* presa pelo processo no Windows: a próxima execução varre na entrada */
  }
}

/* ─── (q) Departamentos, Tipos e Níveis editáveis (Story 5.6) ────────────── */

secao("(q) a tela de Departamentos, Tipos e Níveis: o módulo puro, a tela montada com dublês e as listas fechadas (Story 5.6)");

/*
 * Três partes, todas LOCAIS (sem token, sem rede):
 *
 * - NODE: o domínio novo (rótulos dos Equivalentes iguais aos códigos, a Cor
 *   padrão igual à do banco, o teto da Ordem) e o módulo puro da tela,
 *   importados e executados; o teto do SERVIDOR é conferido executando a
 *   leitura do corpo dele, e não lendo o número.
 * - MONTADA: `TelaDeClassificacoes` e `AbaDeCarreiras` compiladas pelo
 *   empacotador da aplicação, com dublês de `@/data/carreiras/leitura`,
 *   `@/data/carreiras/escrita` e das notificações, cobrindo cada linha da
 *   matriz de I/O da story.
 * - ESTÁTICA: as listas fechadas (situações, campos, imports, rede, rota).
 */

const DEP_Q = classificacoes.listaDeClassificacao("departamento");
const TIPO_Q = classificacoes.listaDeClassificacao("tipo");
const NIVEL_Q = classificacoes.listaDeClassificacao("nivel");

/* ── Node: o domínio novo ── */
{
  const c = classificacoes;
  const rotulos = c.ROTULOS_DOS_EQUIVALENTES ?? {};
  afirmar(
    "os rótulos legíveis dos Equivalentes são lista FECHADA com EXATAMENTE as chaves de `EQUIVALENTES_JOBPOSTING` (nos dois sentidos), congelada, cada um texto próprio",
    Object.isFrozen(rotulos) &&
      igual(ordenado(Object.keys(rotulos)), ordenado(c.EQUIVALENTES_JOBPOSTING)) &&
      Object.values(rotulos).every((r) => typeof r === "string" && r.trim() !== "" && !r.includes("—")) &&
      new Set(Object.values(rotulos)).size === c.EQUIVALENTES_JOBPOSTING.length,
    JSON.stringify(rotulos),
  );
  afirmar(
    "`rotuloDoEquivalente` devolve o rótulo de cada código e é tolerante fora da lista (sem lançar, `null`), inclusive para nome herdado de objeto",
    c.EQUIVALENTES_JOBPOSTING.every((codigo) => c.rotuloDoEquivalente(codigo) === rotulos[codigo]) &&
      [undefined, null, "", "full_time", "SEASONAL", "constructor", "toString", 7].every((v) => c.rotuloDoEquivalente(v) === null),
  );
  /* A Cor padrão é a do BANCO: o `default` VIGENTE das duas colunas `cor`, ou
     seja, a ÚLTIMA definição dele nas migrações, na ordem do carimbo (TROCA
     REGISTRADA na revisão da 5.6: antes só a primeira migração era lida, e um
     `alter column cor set default` posterior passaria despercebido). */
  /* Comentários de SQL fora de aspas trocados por espaço: `'var(--x)'` tem
     `--` DENTRO da aspa, e não é comentário. */
  const semComentariosSql = (sql) =>
    String(sql).replace(/('(?:[^']|'')*')|--[^\n]*|\/\*[\s\S]*?\*\//g, (trecho, aspa) => aspa ?? " ");
  const padraoVigenteDaCor = (migracoes, tabela) => {
    /* `undefined` = nenhuma definição; `null` = coluna sem `default`. */
    let vigente;
    const t = `(?:public\\.)?"?${tabela}"?`;
    for (const sql of migracoes) {
      for (const comando of semComentariosSql(sql).split(";")) {
        if (new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${t}\\s*\\(`, "i").test(comando)) {
          /* Só o PRIMEIRO `create` define: um `create table if not exists`
             posterior não faz nada no banco (a tabela já existe), então não
             pode mudar o `default` lido aqui. Revisão da 5.6: a sabotagem que
             fixava "fica com a primeira criação" não acusava porque ERA a
             semântica certa; o leitor passou a segui-la, e o autoteste abaixo
             cobre duas criações. */
          const coluna = /(?:^|[(,])\s*cor\s+text\b([^,]*)/i.exec(comando);
          if (coluna && vigente === undefined) vigente = /default\s+'([^']+)'/i.exec(coluna[1])?.[1] ?? null;
        } else if (new RegExp(`alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?${t}\\b`, "i").test(comando)) {
          for (const acao of comando.matchAll(/(?:alter\s+column\s+cor\s+(?:set\s+default\s+'([^']+)'|(drop\s+default))|add\s+column\s+(?:if\s+not\s+exists\s+)?cor\s+text\b([^,]*))/gi)) {
            if (acao[1] !== undefined) vigente = acao[1];
            else if (acao[2] !== undefined) vigente = null;
            else vigente = /default\s+'([^']+)'/i.exec(acao[3] ?? "")?.[1] ?? null;
          }
        }
      }
    }
    return vigente;
  };
  const CRIA =
    "-- a tabela, com cor text default 'var(--z)' só no comentário\ncreate table if not exists public.departamentos (\n  id uuid,\n  cor text not null default 'var(--a)', -- e aqui\n  ordem integer\n);";
  afirmar(
    "autoteste: o leitor do `default` vigente da Cor fica com a ÚLTIMA definição (criação, `set default` posterior, `drop default`), ignora um `create if not exists` repetido (no banco ele não faz nada) e não confunde tabelas",
    padraoVigenteDaCor([CRIA], "departamentos") === "var(--a)" &&
      padraoVigenteDaCor([CRIA, CRIA.replace("var(--a)", "var(--c)")], "departamentos") === "var(--a)" &&
      padraoVigenteDaCor([CRIA, "alter table public.departamentos alter column cor set default 'var(--b)';", CRIA.replace("var(--a)", "var(--c)")], "departamentos") === "var(--b)" &&
      padraoVigenteDaCor([CRIA, "alter table public.departamentos alter column cor set default 'var(--b)';"], "departamentos") === "var(--b)" &&
      padraoVigenteDaCor([CRIA, "alter table only departamentos alter column cor drop default;"], "departamentos") === null &&
      padraoVigenteDaCor([CRIA, "alter table public.niveis alter column cor set default 'var(--b)';"], "departamentos") === "var(--a)" &&
      padraoVigenteDaCor([CRIA], "niveis") === undefined,
  );
  const todasAsMigracoes = existsSync(path.join(raiz, "supabase/migrations"))
    ? readdirSync(path.join(raiz, "supabase/migrations"))
        .filter((n) => n.endsWith(".sql"))
        .sort()
        .map((n) => ler(`supabase/migrations/${n}`) ?? "")
    : [];
  const padroesDoBanco = ["departamentos", "niveis"].map((t) => padraoVigenteDaCor(todasAsMigracoes, t));
  afirmar(
    "`COR_PADRAO_DE_CLASSIFICACAO` é o `default` VIGENTE de `cor` do banco (a última definição nas migrações, o cinza, nas duas tabelas) e é uma Cor da paleta",
    todasAsMigracoes.length > 0 &&
      padroesDoBanco.every((p) => p === c.COR_PADRAO_DE_CLASSIFICACAO) &&
      c.ehCorDeClassificacao(c.COR_PADRAO_DE_CLASSIFICACAO) &&
      c.aparenciaDaCorDeClassificacao(c.COR_PADRAO_DE_CLASSIFICACAO).rotulo === "Cinza",
    `banco: ${padroesDoBanco.join(", ")} | domínio: ${c.COR_PADRAO_DE_CLASSIFICACAO}`,
  );
  /* O TETO DA ORDEM tem um dono só: o domínio. O do servidor é conferido
     EXECUTANDO a leitura do corpo dele no teto e um acima. */
  const TETO = c.ORDEM_MAXIMA_DA_CLASSIFICACAO;
  const lerNoServidor = (ordem) => nucleoDaClassificacao.lerCorpoDaClassificacao({ ordem }, DEP_Q, { criando: false });
  const noTeto = lerNoServidor(TETO);
  const acima = lerNoServidor(TETO + 1);
  const textoNoTeto = lerNoServidor(String(TETO));
  const textoAcima = lerNoServidor(String(TETO + 1));
  afirmar(
    "o teto da Ordem é 100000 no domínio, e o SERVIDOR aceita exatamente até ele (executado: o teto passa, um acima é recusado, em número e em texto)",
    TETO === 100_000 &&
      noTeto.ok === true &&
      noTeto.campos.ordem === TETO &&
      textoNoTeto.ok === true &&
      acima.ok === false &&
      textoAcima.ok === false,
    `${JSON.stringify(noTeto)} | ${JSON.stringify(acima)}`,
  );
  const servidor = semComentarios(ler("api/_nucleo/operacoesDaClassificacao.js") ?? "");
  afirmar(
    "o servidor IMPORTA o teto do domínio, sem constante própria (leitura estática, porque um valor igual escrito à mão passaria no teste executado)",
    /import\s*\{[^}]*\bORDEM_MAXIMA_DA_CLASSIFICACAO\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/src\/domain\/carreiras\/classificacoes\.js["']/.test(servidor) &&
      !/\b(const|let|var)\s+ORDEM_MAXIMA_DA_CLASSIFICACAO\b/.test(servidor) &&
      nucleoDaClassificacao.ORDEM_MAXIMA_DA_CLASSIFICACAO === TETO,
  );
  /* A FRASE DA ORDEM e as de NOME REPETIDO também têm um dono só (revisão da
     5.6): o domínio. O servidor recusa com elas (executado), e as importa. */
  afirmar(
    "`FRASE_DA_ORDEM` mora no domínio, cita o teto, e é EXATAMENTE a recusa do servidor para a Ordem fora da regra (executado)",
    typeof c.FRASE_DA_ORDEM === "string" &&
      c.FRASE_DA_ORDEM.includes(String(TETO)) &&
      acima.mensagem === c.FRASE_DA_ORDEM &&
      lerNoServidor("abc").mensagem === c.FRASE_DA_ORDEM,
    `${acima.mensagem} | ${c.FRASE_DA_ORDEM}`,
  );
  const telaBruta = semComentarios(ler(`${DIR_TELAS_DE_CARREIRAS}/TelaDeClassificacoes.jsx`) ?? "");
  const moduloBruto = semComentarios(ler(`${DIR_TELAS_DE_CARREIRAS}/classificacoesDoPainel.js`) ?? "");
  const importaDoDominio = (fonte, nome, origem) =>
    new RegExp(`import\\s*\\{[^}]*\\b${nome}\\b[^}]*\\}\\s*from\\s*["']${origem}["']`).test(fonte);
  const defineLocal = (fonte, nome) => new RegExp(`\\b(const|let|var|function)\\s+${nome}\\b`).test(fonte);
  afirmar(
    "a TELA e o SERVIDOR importam `FRASE_DA_ORDEM` do domínio, e ninguém fora dele a define nem repete o texto dela",
    importaDoDominio(telaBruta, "FRASE_DA_ORDEM", "@/domain/carreiras/classificacoes") &&
      importaDoDominio(servidor, "FRASE_DA_ORDEM", "\\.\\./\\.\\./src/domain/carreiras/classificacoes\\.js") &&
      [telaBruta, moduloBruto, servidor].every((f) => !defineLocal(f, "FRASE_DA_ORDEM") && !f.includes("A ordem é um número")),
  );
  const LISTAS_DO_DOMINIO = c.LISTAS_DE_CLASSIFICACAO;
  const reconhece = (lista, frase) => c.ehFraseDeNomeRepetido(lista, frase);
  afirmar(
    "as frases de nome repetido moram no domínio; o servidor reexporta a MESMA função, e reconhecê-las é pela forma: as duas (com o nome existente e a do índice do banco) de cada lista, com qualquer nome",
    nucleoDaClassificacao.fraseDeNomeRepetido === c.fraseDeNomeRepetido &&
      LISTAS_DO_DOMINIO.every(
        (l) =>
          ["Operações", "x", "Já existe", "“aspas”"].every((n) => reconhece(l, c.fraseDeNomeRepetido(l, n))) &&
          reconhece(l, c.fraseDeNomeRepetidoNoBanco(l)),
      ) &&
      importaDoDominio(servidor, "fraseDeNomeRepetidoNoBanco", "\\.\\./\\.\\./src/domain/carreiras/classificacoes\\.js") &&
      !defineLocal(servidor, "fraseDeNomeRepetido") &&
      !servidor.includes("sem contar maiúsculas") &&
      !servidor.includes("chamado “"),
  );
  afirmar(
    "e NÃO reconhece outro conflito: a recusa por uso, o conflito genérico, a frase de OUTRA lista, frase vazia, texto que não é frase e lista torta (sem lançar)",
    !reconhece(DEP_Q, nucleoDaClassificacao.fraseDeClassificacaoEmUso(DEP_Q, "Operações", 2)) &&
      !reconhece(DEP_Q, "Houve um conflito com outro registro ao salvar o Departamento. Recarregue o Painel e tente de novo.") &&
      !reconhece(DEP_Q, c.fraseDeNomeRepetido(NIVEL_Q, "Pleno")) &&
      !reconhece(DEP_Q, c.fraseDeNomeRepetidoNoBanco(TIPO_Q)) &&
      !reconhece(DEP_Q, c.fraseDeNomeRepetido(DEP_Q, "")) &&
      !reconhece(DEP_Q, "") &&
      !reconhece(DEP_Q, null) &&
      !reconhece(null, c.fraseDeNomeRepetido(DEP_Q, "X")) &&
      !reconhece({}, c.fraseDeNomeRepetido(DEP_Q, "X")),
  );
}

/* ── Node: o módulo puro da tela ── */

let doPainel = null;
try {
  doPainel = await import(urlDe("src/admin/carreiras/classificacoesDoPainel.js"));
} catch (erro) {
  afirmar("`src/admin/carreiras/classificacoesDoPainel.js` importa no Node", false, erro.message);
}

if (doPainel !== null) {
  const m = doPainel;
  const { diagnosticarMensagem, diagnosticarRotuloDeAcao } = await import(urlDe("src/admin/shell/voz.js"));
  afirmar(
    "as situações da tela são EXATAMENTE carregando, erro, lista e formulário; o formulário vem antes de tudo e o erro antes da lista",
    igual([...m.SITUACOES_DA_TELA], ["carregando", "erro", "lista", "formulario"]) &&
      m.situacaoDaTela({ editando: true, carregando: true, erro: { tipo: "rede" } }) === "formulario" &&
      m.situacaoDaTela({ carregando: true, erro: { tipo: "rede" } }) === "carregando" &&
      m.situacaoDaTela({ erro: { tipo: "rede" } }) === "erro" &&
      m.situacaoDaTela({}) === "lista",
  );
  afirmar(
    "o uso por extenso: \"Nenhuma vaga\", \"1 vaga\", \"N vagas\", e \"Uso desconhecido\" para `null` (e para negativo, fração, texto ou ausência): `null` nunca vira zero",
    m.textoDoUso({ vagas: 0 }) === "Nenhuma vaga" &&
      m.textoDoUso({ vagas: 1 }) === "1 vaga" &&
      m.textoDoUso({ vagas: 2 }) === "2 vagas" &&
      [null, undefined, -1, 1.5, "2", NaN].every((v) => m.textoDoUso({ vagas: v }) === "Uso desconhecido") &&
      m.textoDoUso(null) === "Uso desconhecido" &&
      m.usoDaClassificacao({ vagas: null }) === null &&
      m.usoDaClassificacao({ vagas: 0 }) === 0,
  );
  afirmar(
    "só o item SABIDAMENTE sem Vaga pode ser excluído (uso 0); uso > 0 e uso desconhecido, não",
    m.podeExcluir({ vagas: 0 }) === true &&
      m.podeExcluir({ vagas: 2 }) === false &&
      m.podeExcluir({ vagas: null }) === false &&
      m.podeExcluir({}) === false,
  );
  const emUso = m.motivoDeNaoExcluir(DEP_Q, { nome: "Operações", vagas: 2 });
  const emUsoUma = m.motivoDeNaoExcluir(DEP_Q, { nome: "Operações", vagas: 1 });
  const semSaber = m.motivoDeNaoExcluir(NIVEL_Q, { nome: "Pleno", vagas: null });
  afirmar(
    "o motivo de não excluir: \"Em uso por N vaga(s)\" nomeando o item, e um motivo PRÓPRIO para o uso desconhecido; uso 0 não tem motivo",
    emUso !== null &&
      emUso.oQueHouve.includes("Em uso por 2 vagas") &&
      emUso.oQueHouve.includes("Operações") &&
      emUsoUma.oQueHouve.includes("Em uso por 1 vaga") &&
      semSaber !== null &&
      semSaber.oQueHouve.includes("Uso desconhecido") &&
      !semSaber.oQueHouve.includes("Em uso") &&
      semSaber.oQueFazer !== emUso.oQueFazer &&
      m.motivoDeNaoExcluir(DEP_Q, { nome: "X", vagas: 0 }) === null &&
      [emUso, emUsoUma, semSaber].every(
        (mo) => diagnosticarMensagem("o que houve", mo.oQueHouve) === null && diagnosticarMensagem("o que fazer", mo.oQueFazer) === null,
      ),
    JSON.stringify([emUso, semSaber]),
  );
  afirmar(
    "os rótulos das ações nomeiam o item (e o de excluir diz quando está indisponível e por quê)",
    m.rotuloDeEditar(DEP_Q, { nome: "Operações" }).includes("Operações") &&
      m.rotuloDeExcluir(DEP_Q, { nome: "Operações", vagas: 0 }).includes("Operações") &&
      !m.rotuloDeExcluir(DEP_Q, { nome: "Operações", vagas: 0 }).includes("indisponível") &&
      m.rotuloDeExcluir(DEP_Q, { nome: "Operações", vagas: 2 }).includes("Em uso por 2 vagas") &&
      m.rotuloDeEditar(TIPO_Q, { nome: "" }).includes("sem nome"),
  );
  afirmar(
    "a confirmação nomeia o item, e o botão de confirmar diz o que faz (aprovado pela regra de voz, também a reserva)",
    m.tituloDaExclusao(NIVEL_Q, { nome: "Estágio" }).includes("Estágio") &&
      LISTAS_Q().every((l) => diagnosticarRotuloDeAcao(m.rotuloDeConfirmarExclusao(l)) === null) &&
      diagnosticarRotuloDeAcao(m.ROTULO_DE_CONFIRMAR_EXCLUSAO_PADRAO) === null &&
      diagnosticarRotuloDeAcao(m.ROTULO_DE_NOVA_TENTATIVA) === null,
  );
  afirmar(
    "as frases de sucesso e de falha passam pela regra de voz e nomeiam o item",
    LISTAS_Q().every((l) => {
      const item = { nome: "Parcerias" };
      return [
        m.confirmacaoDaExclusao(l, item),
        m.falhaDaExclusao(l, item),
        m.confirmacaoDoSalvamento(l, item, true),
        m.confirmacaoDoSalvamento(l, item, false),
        m.falhaDoSalvamento(l, item),
      ].every((f) => f.includes("Parcerias") && diagnosticarMensagem("frase", f) === null);
    }) &&
      diagnosticarMensagem("o que fazer", m.RESERVA_DA_ACAO) === null &&
      diagnosticarMensagem("o que fazer", m.FRASE_DO_EQUIVALENTE_AUSENTE) === null,
  );
  afirmar(
    "os campos do formulário, por lista: nome, Cor (Departamento e Nível), Equivalente (Tipo) e Ordem",
    igual([...m.camposDoFormulario(DEP_Q)], ["nome", "cor", "ordem"]) &&
      igual([...m.camposDoFormulario(TIPO_Q)], ["nome", "equivalente_jobposting", "ordem"]) &&
      igual([...m.camposDoFormulario(NIVEL_Q)], ["nome", "cor", "ordem"]),
  );
  afirmar(
    "o Equivalente por extenso é o rótulo legível com o código; o legado aparece cru, sem lançar",
    classificacoes.EQUIVALENTES_JOBPOSTING.every(
      (codigo) => m.textoDoEquivalente(codigo) === `${classificacoes.ROTULOS_DOS_EQUIVALENTES[codigo]} (${codigo})`,
    ) &&
      m.textoDoEquivalente("SEASONAL").includes("SEASONAL") &&
      m.textoDoEquivalente(undefined) !== "",
  );
  afirmar(
    "a Cor do item traz o NOME da cor (a cor nunca é o único portador); a legada cai no par neutro, dita como fora da paleta",
    classificacoes.CORES_DE_CLASSIFICACAO.every((cor) => {
      const a = m.corDoItem({ cor });
      const p = classificacoes.aparenciaDaCorDeClassificacao(cor);
      return a.rotulo === p.rotulo && a.fundo === p.fundo && a.tinta === p.tinta && a.conhecida === true;
    }) &&
      m.corDoItem({ cor: "#ff0000" }).conhecida === false &&
      m.corDoItem({ cor: "#ff0000" }).fundo === classificacoes.aparenciaDaCorDeClassificacao(null).fundo &&
      m.corDoItem({ cor: "#ff0000" }).rotulo !== "",
  );
  const VERDE = "var(--categoria-verde-bg)";
  const corpo = (lista, valores, original = null) => m.corpoDaClassificacao(lista, valores, { original });
  const criarDep = corpo(DEP_Q, { ...m.valoresVazios(DEP_Q), nome: "  Parcerias  ", cor: VERDE });
  afirmar(
    "criar Departamento: vão nome (aparado), Cor e Ordem (vazia vale 0), e a Cor nasce na padrão do banco",
    criarDep.ok === true &&
      igual(criarDep.corpo, { nome: "Parcerias", cor: VERDE, ordem: 0 }) &&
      m.valoresVazios(DEP_Q).cor === classificacoes.COR_PADRAO_DE_CLASSIFICACAO &&
      m.valoresVazios(TIPO_Q).equivalente_jobposting === "",
    JSON.stringify(criarDep),
  );
  const tipoSem = corpo(TIPO_Q, { ...m.valoresVazios(TIPO_Q), nome: "Temporário" });
  const tipoCom = corpo(TIPO_Q, { ...m.valoresVazios(TIPO_Q), nome: "Temporário", equivalente_jobposting: "TEMPORARY", ordem: "4" });
  afirmar(
    "criar Tipo SEM Equivalente é recusado localmente no campo Equivalente; com ele, vão nome, Equivalente e Ordem, sem Cor",
    tipoSem.ok === false &&
      tipoSem.campo === "equivalente_jobposting" &&
      tipoCom.ok === true &&
      igual(tipoCom.corpo, { nome: "Temporário", equivalente_jobposting: "TEMPORARY", ordem: 4 }) &&
      corpo(TIPO_Q, { ...m.valoresVazios(TIPO_Q), nome: "X", equivalente_jobposting: "SEASONAL" }).campo === "equivalente_jobposting",
    `${JSON.stringify(tipoSem)} | ${JSON.stringify(tipoCom)}`,
  );
  const tecnologia = { id: "t", nome: "Tecnologia", cor: "var(--categoria-azul-bg)", ordem: 1, vagas: 1 };
  const renomear = corpo(DEP_Q, { ...m.valoresDaClassificacao(DEP_Q, tecnologia), nome: "Engenharia" }, tecnologia);
  const rh = { id: "r", nome: "rh", cor: VERDE, ordem: 2, vagas: 0 };
  const caixa = corpo(DEP_Q, { ...m.valoresDaClassificacao(DEP_Q, rh), nome: "RH" }, rh);
  const nada = corpo(DEP_Q, m.valoresDaClassificacao(DEP_Q, tecnologia), tecnologia);
  afirmar(
    "editar manda SÓ o que mudou: renomear leva só `nome`, mudar a caixa (\"rh\" para \"RH\") leva o nome, e nada mudado não viaja",
    renomear.ok === true &&
      igual(renomear.corpo, { nome: "Engenharia" }) &&
      caixa.ok === true &&
      igual(caixa.corpo, { nome: "RH" }) &&
      nada.ok === true &&
      nada.vazio === true &&
      igual(nada.corpo, {}),
    `${JSON.stringify(renomear)} | ${JSON.stringify(caixa)} | ${JSON.stringify(nada)}`,
  );
  const legadoCor = { id: "l", nome: "Legado", cor: "#ff0000", ordem: 3, vagas: null };
  const legadoTipo = { id: "s", nome: "Sazonal", equivalente_jobposting: "SEASONAL", ordem: 0, vagas: 0 };
  const renomearLegadoCor = corpo(DEP_Q, { ...m.valoresDaClassificacao(DEP_Q, legadoCor), nome: "Legado 2" }, legadoCor);
  const trocarCorLegada = corpo(DEP_Q, { ...m.valoresDaClassificacao(DEP_Q, legadoCor), cor: VERDE }, legadoCor);
  const renomearLegadoTipo = corpo(TIPO_Q, { ...m.valoresDaClassificacao(TIPO_Q, legadoTipo), nome: "Sazonal 2" }, legadoTipo);
  afirmar(
    "uma Cor ou um Equivalente LEGADO não é reenviado sem mudar (renomear continua possível); trocar a Cor legada por uma da paleta envia a nova",
    renomearLegadoCor.ok === true &&
      igual(renomearLegadoCor.corpo, { nome: "Legado 2" }) &&
      trocarCorLegada.ok === true &&
      igual(trocarCorLegada.corpo, { cor: VERDE }) &&
      renomearLegadoTipo.ok === true &&
      igual(renomearLegadoTipo.corpo, { nome: "Sazonal 2" }),
    `${JSON.stringify(renomearLegadoCor)} | ${JSON.stringify(trocarCorLegada)} | ${JSON.stringify(renomearLegadoTipo)}`,
  );
  const tipoLimpo = corpo(TIPO_Q, { ...m.valoresDaClassificacao(TIPO_Q, legadoTipo), equivalente_jobposting: "" }, legadoTipo);
  afirmar(
    "tirar o Equivalente de um Tipo na edição também é recusado localmente (ele é obrigatório para Tipo)",
    tipoLimpo.ok === false && tipoLimpo.campo === "equivalente_jobposting",
  );
  const TETO = classificacoes.ORDEM_MAXIMA_DA_CLASSIFICACAO;
  const ordemAcima = corpo(NIVEL_Q, { ...m.valoresVazios(NIVEL_Q), nome: "Estagiário", ordem: String(TETO + 1) });
  const ordemNoTeto = corpo(NIVEL_Q, { ...m.valoresVazios(NIVEL_Q), nome: "Estagiário", ordem: String(TETO) });
  const fraseDoServidor = nucleoDaClassificacao.lerCorpoDaClassificacao({ ordem: TETO + 1 }, NIVEL_Q, { criando: false }).mensagem;
  afirmar(
    "Ordem acima do teto do DOMÍNIO é recusada localmente no campo Ordem, com a MESMA frase do servidor; o teto passa; lixo e negativo também são recusados",
    ordemAcima.ok === false &&
      ordemAcima.campo === "ordem" &&
      ordemAcima.motivo === fraseDoServidor &&
      ordemAcima.motivo.includes(String(TETO)) &&
      ordemNoTeto.ok === true &&
      ordemNoTeto.corpo.ordem === TETO &&
      ["-1", "1.5", "abc", "1e3", "99999999"].every(
        (o) => corpo(NIVEL_Q, { ...m.valoresVazios(NIVEL_Q), nome: "N", ordem: o }).campo === "ordem",
      ),
    `${JSON.stringify(ordemAcima)} | servidor: ${fraseDoServidor}`,
  );
  afirmar(
    "nome vazio ou acima de 80 caracteres é recusado localmente no campo nome, pela regra do domínio",
    corpo(DEP_Q, { ...m.valoresVazios(DEP_Q), nome: "   " }).campo === "nome" &&
      corpo(DEP_Q, { ...m.valoresVazios(DEP_Q), nome: "x".repeat(81) }).campo === "nome" &&
      corpo(DEP_Q, { ...m.valoresVazios(DEP_Q), nome: "x".repeat(80) }).ok === true &&
      corpo(DEP_Q, { ...m.valoresVazios(DEP_Q), nome: "   " }).motivo === classificacoes.problemaNoNomeDaClassificacao(""),
  );
  let lancou = false;
  try {
    for (const lixo of [null, undefined, 7, "x", [], {}]) {
      m.textoDoUso(lixo);
      m.corDoItem(lixo);
      m.nomeParaFrase(lixo);
      m.valoresDaClassificacao(DEP_Q, lixo);
      m.corpoDaClassificacao(DEP_Q, lixo, { original: null });
      m.motivoDeNaoExcluir(DEP_Q, lixo);
    }
  } catch {
    lancou = true;
  }
  afirmar("nada no módulo puro lança com dado torto", !lancou);

  /* ── Revisão da 5.6: a Ordem desconhecida, o legado, o nome normalizado ── */
  afirmar(
    "a Ordem na linha: \"Ordem N\" para inteiro de 0 para cima, e \"Ordem não definida\" (NUNCA \"0\") para ordem ausente, nula, fracionária, em texto ou negativa",
    m.textoDaOrdem({ ordem: 0 }) === "Ordem 0" &&
      m.textoDaOrdem({ ordem: 7 }) === "Ordem 7" &&
      [null, undefined, 1.5, "2", -1, NaN].every((o) => m.textoDaOrdem({ ordem: o }) === "Ordem não definida") &&
      m.textoDaOrdem(null) === "Ordem não definida" &&
      m.TEXTO_DA_ORDEM_DESCONHECIDA === "Ordem não definida",
  );
  const semOrdem = { id: "o", nome: "Operações", cor: VERDE, ordem: null, vagas: 0 };
  const renomearSemOrdem = corpo(DEP_Q, { ...m.valoresDaClassificacao(DEP_Q, semOrdem), nome: "Operação" }, semOrdem);
  const darOrdem = corpo(DEP_Q, { ...m.valoresDaClassificacao(DEP_Q, semOrdem), ordem: "4" }, semOrdem);
  const acimaDoTeto = { id: "a", nome: "Antigo", equivalente_jobposting: "OTHER", ordem: TETO + 5, vagas: 0 };
  const renomearAcima = corpo(TIPO_Q, { ...m.valoresDaClassificacao(TIPO_Q, acimaDoTeto), nome: "Antigo 2" }, acimaDoTeto);
  const mexerAcima = corpo(TIPO_Q, { ...m.valoresDaClassificacao(TIPO_Q, acimaDoTeto), ordem: String(TETO + 6) }, acimaDoTeto);
  const trazerAcima = corpo(TIPO_Q, { ...m.valoresDaClassificacao(TIPO_Q, acimaDoTeto), ordem: "3" }, acimaDoTeto);
  afirmar(
    "Ordem desconhecida: renomear sem tocar na Ordem manda SÓ o nome (vazio não vira 0); dar uma Ordem manda a Ordem",
    renomearSemOrdem.ok === true &&
      igual(renomearSemOrdem.corpo, { nome: "Operação" }) &&
      darOrdem.ok === true &&
      igual(darOrdem.corpo, { ordem: 4 }),
    `${JSON.stringify(renomearSemOrdem)} | ${JSON.stringify(darOrdem)}`,
  );
  afirmar(
    "Ordem legada acima do teto: renomear sem tocar nela NÃO é bloqueado (e ela não viaja); mexer nela para outro valor acima é recusado, e trazê-la para a regra envia",
    renomearAcima.ok === true &&
      igual(renomearAcima.corpo, { nome: "Antigo 2" }) &&
      mexerAcima.ok === false &&
      mexerAcima.campo === "ordem" &&
      trazerAcima.ok === true &&
      igual(trazerAcima.corpo, { ordem: 3 }),
    `${JSON.stringify(renomearAcima)} | ${JSON.stringify(mexerAcima)}`,
  );
  const espacado = { id: "e", nome: "  Recursos   Humanos ", cor: VERDE, ordem: 1, vagas: 0 };
  const intocado = corpo(DEP_Q, m.valoresDaClassificacao(DEP_Q, espacado), espacado);
  const AZUL_Q = "var(--categoria-azul-bg)";
  const soCor = corpo(DEP_Q, { ...m.valoresDaClassificacao(DEP_Q, espacado), cor: AZUL_Q }, espacado);
  afirmar(
    "o nome só vai no corpo se for DIFERENTE do original normalizado: um nome gravado com espaço sobrando, intocado, não viaja (nada mudou; trocar só a Cor leva só a Cor)",
    intocado.ok === true && intocado.vazio === true && soCor.ok === true && igual(soCor.corpo, { cor: AZUL_Q }),
    `${JSON.stringify(intocado)} | ${JSON.stringify(soCor)}`,
  );
  afirmar(
    "a leitura só é legível com UMA LISTA em cada tabela de `LISTAS_DE_CLASSIFICACAO`; tabela ausente, nula, objeto ou texto não é lista vazia",
    m.leituraLegivel({ departamentos: [], tipos_de_vaga: [], niveis: [] }) === true &&
      classificacoes.LISTAS_DE_CLASSIFICACAO.every((l) => {
        const base = { departamentos: [], tipos_de_vaga: [], niveis: [] };
        return [undefined, null, {}, "x", 0].every((torto) => m.leituraLegivel({ ...base, [l.tabela]: torto }) === false);
      }) &&
      [null, undefined, [], "x"].every((d) => m.leituraLegivel(d) === false),
  );
  afirmar(
    "o id do item só vale como texto não vazio (ausente, número, vazio e objeto torto dão `null`)",
    m.idDoItem({ id: "abc" }) === "abc" &&
      [{}, { id: 7 }, { id: "" }, { id: "  " }, { id: null }, null, "abc"].every((i) => m.idDoItem(i) === null),
  );
  afirmar(
    "os textos visíveis da tela moram no módulo puro: o teto do nome vem do domínio, a Cor e o Equivalente da linha e a Cor escolhida vêm por extenso",
    m.AJUDA_DO_NOME.includes(String(classificacoes.TAMANHO_MAXIMO_DO_NOME_DE_CLASSIFICACAO)) &&
      m.textoDaCorNaLinha({ cor: VERDE }) === `Cor: ${classificacoes.aparenciaDaCorDeClassificacao(VERDE).rotulo}` &&
      m.textoDoEquivalenteNaLinha({ equivalente_jobposting: "INTERN" }) === `Google Vagas: ${m.textoDoEquivalente("INTERN")}` &&
      m.textoDoEquivalenteNaLinha({ equivalente_jobposting: "SEASONAL" }) === "Google Vagas: Fora da lista: SEASONAL" &&
      m.textoDaCorEscolhida(VERDE) === `Cor escolhida: ${classificacoes.aparenciaDaCorDeClassificacao(VERDE).rotulo}` &&
      m.rotuloDoGrupoDeCor(NIVEL_Q) === "Cor do Nível" &&
      [m.TEXTO_DE_EDITAR, m.TEXTO_DE_EXCLUIR, m.ROTULO_DO_NOME, m.ROTULO_DA_COR, m.ROTULO_DO_EQUIVALENTE, m.MARCA_DE_OBRIGATORIO, m.OPCAO_SEM_EQUIVALENTE, m.ROTULO_DA_ORDEM, m.COMPLEMENTO_DA_AJUDA_DA_ORDEM, m.EXEMPLO_DA_ORDEM].every(
        (t) => typeof t === "string" && t.trim() !== "",
      ),
  );
  afirmar(
    "as frases novas passam pela regra de voz (item sem id, ação ocupada, item que já não existia) e nomeiam o item",
    diagnosticarMensagem("o que fazer", m.FRASE_DO_ITEM_SEM_ID) === null &&
      diagnosticarMensagem("o que fazer", m.FRASE_DA_ACAO_OCUPADA) === null &&
      LISTAS_Q().every((l) => {
        const f = m.ausenciaNaExclusao(l, { nome: "Parcerias" });
        return f.includes("Parcerias") && f.includes("já não existia") && diagnosticarMensagem("o que houve", f) === null;
      }),
  );
  const saidasDeTexto = LISTAS_Q().flatMap((l) => [
    m.textoDaCorNaLinha({ cor: VERDE }),
    m.textoDoEquivalenteNaLinha({ equivalente_jobposting: "SEASONAL" }),
    m.textoDaOrdem({ ordem: null }),
    m.textoDaOrdem({ ordem: 3 }),
    m.rotuloDoGrupoDeCor(l),
    m.textoDaCorEscolhida("#fff"),
    m.ausenciaNaExclusao(l, { nome: "N" }),
  ]);
  afirmar(
    "nenhum texto DEVOLVIDO pelas funções novas do módulo puro tem travessão",
    saidasDeTexto.every((t) => typeof t === "string" && !t.includes("—")),
  );
  const travessoes = Object.entries(m).filter(([, v]) => typeof v === "string" && v.includes("—"));
  afirmar("nenhum texto exportado pelo módulo puro tem travessão", travessoes.length === 0, travessoes.map(([k]) => k).join(", "));
}

/* ── Estática: as listas fechadas ── */
{
  const tela = semComentarios(ler(`${DIR_TELAS_DE_CARREIRAS}/TelaDeClassificacoes.jsx`) ?? "");
  const brutos = [`${DIR_TELAS_DE_CARREIRAS}/TelaDeClassificacoes.jsx`, `${DIR_TELAS_DE_CARREIRAS}/classificacoesDoPainel.js`].map(
    (a) => ler(a) ?? "",
  );
  afirmar(
    "a tela lê por `listarClassificacoesDoPainel` e escreve só por `salvarClassificacao` e `excluirClassificacao`, pelos apelidos EXATOS",
    /import\s*\{[^}]*\blistarClassificacoesDoPainel\b[^}]*\}\s*from\s*["']@\/data\/carreiras\/leitura["']/.test(tela) &&
      /import\s*\{[^}]*\bsalvarClassificacao\b[^}]*\}\s*from\s*["']@\/data\/carreiras\/escrita["']/.test(tela) &&
      /import\s*\{[^}]*\bexcluirClassificacao\b[^}]*\}\s*from\s*["']@\/data\/carreiras\/escrita["']/.test(tela) &&
      !/\b(salvarVaga|excluirVaga|mudarEstadoDaVaga|listarVagasDoPainel)\b/.test(tela),
  );
  afirmar(
    "a tela itera `LISTAS_DE_CLASSIFICACAO` e lê cada lista pela TABELA (`dados[lista.tabela]`)",
    /LISTAS_DE_CLASSIFICACAO\.map\(/.test(tela) && /dados\?\.\[lista\.tabela\]/.test(tela),
  );
  const PROIBIDOS_NAS_TELAS = [
    ["admin/blog", /["'][^"']*admin\/blog[^"']*["']/],
    ["domain/blog/categorias", /["'][^"']*domain\/blog\/categorias[^"']*["']/],
    ["domain/blog/formato", /["'][^"']*domain\/blog\/formato[^"']*["']/],
    ["framer-motion", /["']framer-motion["']/],
    ["/api/", /["'`]\/api\//],
    ["fetch", /\bfetch\b/],
    ["import(", /\bimport\s*\(/],
    ["WebSocket", /\bWebSocket\b/],
  ];
  const achados = [];
  for (const [i, bruto] of brutos.entries()) {
    for (const [nome, padrao] of PROIBIDOS_NAS_TELAS) if (padrao.test(bruto)) achados.push(`${i === 0 ? "tela" : "módulo"}: ${nome}`);
  }
  afirmar(
    "autoteste: o detector acusa cada proibição (Blog, categorias e formato do Blog, `framer-motion`, `\"/api/\"`, `fetch`, `import(`, `WebSocket`) e absolve os imports da tela",
    [
      'import x from "@/admin/blog/categorias";',
      'import { COR_PADRAO } from "@/domain/blog/categorias";',
      'import { formatarNumero } from "../../domain/blog/formato.js";',
      'import { motion } from "framer-motion";',
      'const u = "/api/carreiras";',
      "// fetch no comentário também",
      "const m = import (x);",
      "new WebSocket(u);",
    ].every((t) => PROIBIDOS_NAS_TELAS.some(([, p]) => p.test(t))) &&
      !PROIBIDOS_NAS_TELAS.some(([, p]) => p.test('import { salvarClassificacao } from "@/data/carreiras/escrita";')) &&
      !PROIBIDOS_NAS_TELAS.some(([, p]) => p.test('import { aparenciaDaCorDeClassificacao } from "@/domain/carreiras/classificacoes";')),
  );
  afirmar(
    "a tela e o módulo puro não importam `admin/blog`, `domain/blog/categorias`, `domain/blog/formato` nem `framer-motion`, e não citam `\"/api/\"`, `fetch`, `import(` nem `WebSocket` (texto BRUTO, comentário incluído)",
    brutos.every((b) => b !== "") && achados.length === 0,
    achados.join(" | "),
  );
  afirmar(
    "a tela não revela nada por hover nem esconde alvo (`hover:`, `group-hover`, `opacity-0`, `invisible`)",
    tela !== "" && !/\bhover:|group-hover|\bopacity-0\b|\binvisible\b/.test(tela),
  );
  afirmar(
    "a tela monta UM `DialogoDeConfirmacao`, sempre, controlado por `aberto={paraExcluir !== null}`",
    (tela.match(/<DialogoDeConfirmacao\b/g) ?? []).length === 1 && /aberto=\{paraExcluir !== null\}/.test(tela),
  );
  /* Todo `catch` registra `console.error("[Painel] …", <o erro capturado>)`
     como primeira instrução. */
  const registra = (fonte) =>
    [...fonte.matchAll(/catch\s*\(\s*(\w+)\s*\)\s*\{\s*([^;]*;)/g)].map(([, variavel, primeira]) =>
      new RegExp(`^console\\.error\\(\\s*"\\[Painel\\][^"]*",\\s*${variavel}\\s*\\)`).test(primeira.trim()),
    );
  afirmar(
    "autoteste: o detector de registro no `catch` absolve o registro certo e acusa o mudo, o sem prefixo e o de outra variável",
    igual(registra('try{}catch (e) { console.error("[Painel] x", e); }'), [true]) &&
      igual(registra("try{}catch (e) { resultado = 1; }"), [false]) &&
      igual(registra('try{}catch (e) { console.error("x", e); }'), [false]) &&
      igual(registra('try{}catch (e) { console.error("[Painel] x", outra); }'), [false]),
  );
  /* TROCA REGISTRADA (revisão da 5.6): era `catches.length === 3`, número
     mágico. Agora: há `catch`, TODO `catch` da tela foi visto pelo detector
     (a contagem dele é a de `catch` no texto) e todos registram. */
  const catches = registra(tela);
  const catchesNoTexto = (tela.match(/\bcatch\b/g) ?? []).length;
  afirmar(
    "todo `catch` da tela registra `console.error(\"[Painel] …\", <erro capturado>)`: cada `catch` do texto foi lido pelo detector, e não há `catch` sem variável",
    catches.length > 0 && catches.length === catchesNoTexto && catches.every(Boolean) && !/catch\s*\{/.test(tela),
    `${JSON.stringify(catches)} | ${catchesNoTexto} no texto`,
  );
  /* Os textos visíveis saem do JSX (revisão da 5.6): nenhum nó de texto com
     letra entre marcas, e nenhum atributo de texto visível ou acessível com
     letra escrito à mão. Tudo vem do módulo puro, que passa pelas checagens
     de voz e de travessão. */
  const textosNoJsx = (fonte) => [
    /* texto depois de uma marca, até outra marca ou uma expressão */
    ...[...fonte.matchAll(/(?<![=-])>([^<>{}]*\p{L}[^<>{}]*)(?=<\/?[A-Za-z]|\{)/gu)].map((x) => x[1].trim()),
    /* texto depois de uma expressão, na mesma linha, até uma marca */
    ...[...fonte.matchAll(/\}([^<>{}=;\n]*\p{L}[^<>{}=;\n]*)(?=<\/?[A-Za-z])/gu)].map((x) => x[1].trim()),
    ...[...fonte.matchAll(/\b(?:placeholder|aria-label|title|alt)="([^"]*\p{L}[^"]*)"/gu)].map((x) => x[1]),
  ];
  afirmar(
    "autoteste: o detector de texto no JSX acusa nó de texto e atributo escritos à mão, e absolve a expressão, a seta, o código entre chaves e o atributo técnico",
    textosNoJsx("<span>Editar</span>").length === 1 &&
      textosNoJsx('<b className="x">\n  Cor: {a}\n</b>').length === 1 &&
      textosNoJsx("<span>{n} vagas</span>").length === 1 &&
      textosNoJsx('x: 1 },\n  classe: cn("a"),\n  conteudo: (\n<span>{y}</span>').length === 0 &&
      textosNoJsx('<input placeholder="Nome" />').length === 1 &&
      textosNoJsx('<p title="Ordem">{x}</p>').length === 1 &&
      textosNoJsx("<span>{TEXTO_DE_EDITAR}</span>").length === 0 &&
      textosNoJsx("onClick={() => aoEditar?.()}>\n  {x}\n</b>").length === 0 &&
      textosNoJsx('<p className="text-xs" data-papel="cor">{t}</p>').length === 0,
  );
  const escritosAMao = textosNoJsx(tela);
  afirmar(
    "a tela não escreve texto visível à mão no JSX (rótulos, \"Editar\", \"Excluir\", \"Cor:\", \"Google Vagas:\", ajuda da Ordem): todos vêm do módulo puro",
    tela !== "" && escritosAMao.length === 0,
    escritosAMao.slice(0, 5).join(" | "),
  );
  const principal = semComentarios(ler("src/main.jsx") ?? "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\s+/g, " ");
  const inicioDoAdmin = principal.indexOf('<Route path="/admin"');
  const fimDoAdmin = inicioDoAdmin < 0 ? -1 : principal.indexOf("</Route>", inicioDoAdmin);
  const blocoDoAdmin = fimDoAdmin < 0 ? "" : principal.slice(inicioDoAdmin, fimDoAdmin);
  const posDaTela = blocoDoAdmin.indexOf("<Route path={ROTA_DAS_CLASSIFICACOES} element={<TelaDeClassificacoes />} />");
  const posDoIndice = blocoDoAdmin.indexOf("<Route index element={<AdminBlog />} />");
  const posDaApanhaTudo = blocoDoAdmin.indexOf("<Route path={ROTA_DESCONHECIDA}");
  const nomesDoImportDasRotas = (/import \{([^}]*)\} from ["']@\/admin\/carreiras\/rotas["']/.exec(principal)?.[1] ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  afirmar(
    "`main.jsx` monta `<TelaDeClassificacoes />` SEM propriedade em `ROTA_DAS_CLASSIFICACOES`, dentro de `/admin`, depois do índice e ANTES da apanha-tudo, uma vez só",
    posDaTela > posDoIndice &&
      posDoIndice >= 0 &&
      posDaApanhaTudo > posDaTela &&
      (principal.match(/<TelaDeClassificacoes\b/g) ?? []).length === 1 &&
      /import TelaDeClassificacoes from ["']@\/admin\/carreiras\/TelaDeClassificacoes["']/.test(principal) &&
      nomesDoImportDasRotas.includes("ROTA_DAS_CLASSIFICACOES"),
    `tela ${posDaTela} | índice ${posDoIndice} | apanha-tudo ${posDaApanhaTudo}`,
  );
  let rotas = null;
  try {
    rotas = await import(urlDe("src/admin/carreiras/rotas.js"));
  } catch {
    rotas = null;
  }
  afirmar(
    "as rotas: `ROTA_DAS_CLASSIFICACOES` é `carreiras/classificacoes` (relativa ao pai) e `ENDERECO_DAS_CLASSIFICACOES` é `/admin/carreiras/classificacoes`; a volta da tela é `ENDERECO_DA_LISTAGEM`",
    rotas?.ROTA_DAS_CLASSIFICACOES === "carreiras/classificacoes" &&
      rotas?.ENDERECO_DAS_CLASSIFICACOES === "/admin/carreiras/classificacoes" &&
      /<Link\s+to=\{ENDERECO_DA_LISTAGEM\}\s+data-acao="voltar"/.test(tela),
  );
  const aba = semComentarios(ler(`${DIR_TELAS_DE_CARREIRAS}/AbaDeCarreiras.jsx`) ?? "");
  afirmar(
    "a faixa da aba Carreiras tem o link para a tela (`data-acao=\"abrir-classificacoes\"`, `to={ENDERECO_DAS_CLASSIFICACOES}`)",
    /<Link\s+to=\{ENDERECO_DAS_CLASSIFICACOES\}\s+data-acao="abrir-classificacoes"/.test(aba),
  );
}

function LISTAS_Q() {
  return [DEP_Q, TIPO_Q, NIVEL_Q];
}

/* ── A tela montada ── */
{
  const { writeFileSync, rmSync } = await import("node:fs");
  const montagem = await import("./montagem-comum.mjs");
  const pasta = montagem.criarPastaDeCompilacao("verificar-carreiras-classificacoes-");

  const DEP_OPE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
  const DEP_TEC = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
  const DEP_RH = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3";
  const DEP_LEG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4";
  const DEP_NOVO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5";
  const TIPO_CLT = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
  const TIPO_EST = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
  const NIV_PLENO = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
  const NIV_SENIOR = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
  const VERDE = "var(--categoria-verde-bg)";
  const AZUL = "var(--categoria-azul-bg)";
  const ROXO = "var(--categoria-roxo-bg)";

  const arquivoDaLeitura = path.join(pasta, "duble-leitura.js");
  writeFileSync(
    arquivoDaLeitura,
    `export const controle = { dados: null, falhar: false, lancar: false, segurar: null, lidas: 0, vagasLidas: 0 };
export async function listarClassificacoesDoPainel() {
  controle.lidas += 1;
  const resposta = controle.falhar
    ? { ok: false, erro: { tipo: "rede", mensagem: "Não conseguimos ler as classificações. Confira a conexão." } }
    : { ok: true, dados: JSON.parse(JSON.stringify(controle.dados)) };
  if (controle.segurar) await controle.segurar;
  if (controle.lancar) throw new Error("dublê: a leitura lançou");
  return resposta;
}
export async function listarVagasDoPainel() { controle.vagasLidas += 1; return { ok: true, dados: [] }; }
export async function lerVagaDoPainelPorId() { return { ok: false, erro: { tipo: "nao_encontrado", mensagem: "Esta vaga não foi encontrada." } }; }
export { ERRO_NAO_ENCONTRADO } from ${montagem.caminhoDeModulo("src/data/blog/resultado.js")};
`,
  );
  const arquivoDaEscrita = path.join(pasta, "duble-escrita.js");
  writeFileSync(
    arquivoDaEscrita,
    `export { ERRO_REDE, ERRO_INESPERADO, ERRO_NAO_ENCONTRADO } from ${montagem.caminhoDeModulo("src/data/blog/resultado.js")};
export const ERRO_CONFLITO = "conflito";
export const controle = { todas: [], respostas: { salvarClassificacao: [], excluirClassificacao: [] } };
function responder(fila, argumentos) {
  const resposta = fila.shift();
  if (typeof resposta === "function") return resposta(...argumentos);
  return resposta ?? { ok: false, erro: { tipo: "dados_invalidos", mensagem: "O dublê não tinha resposta preparada para este pedido." } };
}
export async function salvarClassificacao(lista, campos, opcoes) {
  controle.todas.push({ op: "salvarClassificacao", lista, campos: JSON.parse(JSON.stringify(campos ?? null)), id: opcoes?.id ?? null });
  return responder(controle.respostas.salvarClassificacao, [lista, campos, opcoes]);
}
export async function excluirClassificacao(lista, id) {
  controle.todas.push({ op: "excluirClassificacao", lista, id });
  return responder(controle.respostas.excluirClassificacao, [lista, id]);
}
export async function salvarVaga() { controle.todas.push({ op: "salvarVaga" }); return { ok: false, erro: { tipo: "dados_invalidos", mensagem: "inesperado" } }; }
export async function mudarEstadoDaVaga() { controle.todas.push({ op: "mudarEstadoDaVaga" }); return { ok: false, erro: { tipo: "dados_invalidos", mensagem: "inesperado" } }; }
export async function excluirVaga() { controle.todas.push({ op: "excluirVaga" }); return { ok: false, erro: { tipo: "dados_invalidos", mensagem: "inesperado" } }; }
`,
  );
  const arquivoDasNotificacoes = path.join(pasta, "duble-notificacoes.js");
  writeFileSync(
    arquivoDasNotificacoes,
    `import { diagnosticarMensagem, diagnosticarRotuloDeAcao } from ${montagem.caminhoDeModulo("src/admin/shell/voz.js")};
export const controle = { erros: [], sucessos: [], problemasDeVoz: [] };
function conferir(rotulo, texto) {
  const problema = diagnosticarMensagem(rotulo, texto);
  if (problema) controle.problemasDeVoz.push(problema);
}
export function notificarErro(oQueHouve, oQueFazer, saida = null) {
  conferir("o que houve", oQueHouve);
  conferir("o que fazer", oQueFazer);
  if (saida) {
    const problema = diagnosticarRotuloDeAcao(saida.rotulo);
    if (problema) controle.problemasDeVoz.push(problema);
    if (typeof saida.aoAcionar !== "function") controle.problemasDeVoz.push("saída sem aoAcionar: " + saida.rotulo);
  }
  controle.erros.push([oQueHouve, oQueFazer, saida]);
}
export function notificarSucesso(oQueAconteceu, detalhe) {
  conferir("o que aconteceu", oQueAconteceu);
  controle.sucessos.push([oQueAconteceu, detalhe ?? ""]);
}
export default function Notificacoes() { return null; }
`,
  );

  const fonte =
    `export { default as TelaDeClassificacoes } from ${montagem.caminhoDeModulo("src/admin/carreiras/TelaDeClassificacoes.jsx")};\n` +
    `export { default as AbaDeCarreiras } from ${montagem.caminhoDeModulo("src/admin/carreiras/AbaDeCarreiras.jsx")};\n` +
    `export { controle as controleDaLeitura } from ${montagem.comoModulo(arquivoDaLeitura)};\n` +
    `export { controle as controleDaEscrita } from ${montagem.comoModulo(arquivoDaEscrita)};\n` +
    `export { controle as controleDasNotificacoes } from ${montagem.comoModulo(arquivoDasNotificacoes)};\n`;

  let compilado = null;
  try {
    compilado = await montagem.compilarParaNode({
      pasta,
      fonte,
      alias: {
        "@/data/carreiras/leitura": arquivoDaLeitura,
        "@/data/carreiras/escrita": arquivoDaEscrita,
        "@/admin/shell/Notificacoes": arquivoDasNotificacoes,
      },
    });
  } catch (erro) {
    afirmar("a tela de Classificações e a aba compilam pelo empacotador da aplicação", false, erro?.message ?? String(erro));
  }

  if (compilado !== null) {
    afirmar("a tela de Classificações e a aba compilam pelo empacotador da aplicação", true);

    const janela = montagem.montarNavegador({ url: "https://painel.local/admin/carreiras/classificacoes" });
    /* Como na seção (p): as seções anteriores já subiram (e fecharam) um
       navegador de mentira, e `montarNavegador` não sobrescreve o que já
       existe em `globalThis`. Estes nomes são religados à janela nova. */
    for (const nome of [
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "getComputedStyle",
      "HTMLElement",
      "HTMLInputElement",
      "HTMLSelectElement",
      "HTMLButtonElement",
      "HTMLAnchorElement",
      "Element",
      "Node",
      "DocumentFragment",
    ]) {
      const valor = typeof janela[nome] === "function" && /^[a-z]/.test(nome) ? janela[nome].bind(janela) : janela[nome];
      if (valor !== undefined) {
        Object.defineProperty(globalThis, nome, { value: valor, configurable: true, writable: true });
      }
    }
    const modulo = await import(pathToFileURL(compilado.arquivo).href);
    const React = (await import("react")).default;
    const { act } = await import("react");
    const { createRoot } = await import("react-dom/client");
    const roteador = await import("react-router-dom");
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, configurable: true, writable: true });
    const h = React.createElement;
    const leitura = modulo.controleDaLeitura;
    const escrita = modulo.controleDaEscrita;
    const avisos = modulo.controleDasNotificacoes;

    const fixture = () => ({
      departamentos: [
        { id: DEP_OPE, nome: "Operações", cor: VERDE, ordem: 0, vagas: 2 },
        { id: DEP_TEC, nome: "Tecnologia", cor: AZUL, ordem: 1, vagas: 1 },
        { id: DEP_RH, nome: "rh", cor: VERDE, ordem: 2, vagas: 0 },
        { id: DEP_LEG, nome: "Legado", cor: "var(--cor-que-saiu-da-paleta)", ordem: 3, vagas: null },
      ],
      tipos_de_vaga: [
        { id: TIPO_CLT, nome: "CLT", equivalente_jobposting: "FULL_TIME", ordem: 0, vagas: 3 },
        { id: TIPO_EST, nome: "Estágio", equivalente_jobposting: "INTERN", ordem: 1, vagas: 0 },
      ],
      niveis: [
        { id: NIV_PLENO, nome: "Pleno", cor: AZUL, ordem: 0, vagas: 0 },
        { id: NIV_SENIOR, nome: "Sênior", cor: ROXO, ordem: 1, vagas: 0 },
      ],
    });
    leitura.dados = fixture();

    const passo = async () => {
      await act(async () => {
        await new Promise((resolver) => setTimeout(resolver, 0));
      });
    };
    const esperarAte = async (condicao, descricao, prazo = 4000) => {
      const limite = Date.now() + prazo;
      for (;;) {
        await passo();
        let pronto = false;
        try {
          pronto = Boolean(condicao());
        } catch {
          pronto = false;
        }
        if (pronto) return true;
        if (Date.now() > limite) {
          afirmar(`espera com prazo: ${descricao} (${prazo} ms)`, false);
          return false;
        }
      }
    };
    const segurar = () => {
      let soltar = null;
      leitura.segurar = new Promise((resolver) => {
        soltar = resolver;
      });
      return () => {
        leitura.segurar = null;
        soltar();
      };
    };
    const segurada = (resposta) => {
      const controle = { soltar: null };
      const promessa = new Promise((resolver) => {
        controle.soltar = () => resolver(typeof resposta === "function" ? resposta() : resposta);
      });
      return { controle, responder: () => promessa };
    };

    const reclamacoes = [];
    const erroOriginal = console.error;
    console.error = (...partes) => reclamacoes.push(partes.map(String).join(" "));

    function Onde() {
      const local = roteador.useLocation();
      return h("span", { "data-onde": `${local.pathname}${local.search}` });
    }

    const CAMINHO = "/admin/carreiras/classificacoes";
    const montar = async (caminho, { caso, toleradas = [], ateQue = null } = {}) => {
      const alvo = janela.document.createElement("div");
      janela.document.body.appendChild(alvo);
      const raizReact = createRoot(alvo);
      const inicioDasReclamacoes = reclamacoes.length;
      const inicioDasEscritas = escrita.todas.length;
      await act(async () => {
        raizReact.render(
          h(
            roteador.MemoryRouter,
            { initialEntries: [caminho] },
            h(Onde),
            h(
              roteador.Routes,
              null,
              h(roteador.Route, { path: "/admin", element: h(modulo.AbaDeCarreiras, { aoContar: () => {} }) }),
              h(roteador.Route, { path: CAMINHO, element: h(modulo.TelaDeClassificacoes) }),
            ),
          ),
        );
      });
      const tela = {
        caso,
        alvo,
        onde: () => alvo.querySelector("[data-onde]")?.getAttribute("data-onde") ?? null,
        situacao: () =>
          alvo.querySelector('[data-tela="classificacoes"] main[data-estado-da-lista]')?.getAttribute("data-estado-da-lista") ?? null,
        secoes: () => [...alvo.querySelectorAll("section[data-lista]")].map((s) => s.getAttribute("data-lista")),
        secao: (chave) => alvo.querySelector(`section[data-lista="${chave}"]`),
        itens: (chave) =>
          [...(alvo.querySelector(`section[data-lista="${chave}"]`)?.querySelectorAll("li[data-classificacao]") ?? [])].map((li) =>
            li.getAttribute("data-classificacao"),
          ),
        item: (id) => alvo.querySelector(`li[data-classificacao="${id}"]`),
        papel: (id, papel) => alvo.querySelector(`li[data-classificacao="${id}"] [data-papel="${papel}"]`),
        acao: (id, chave) => alvo.querySelector(`li[data-classificacao="${id}"] [data-acao="${chave}"]`),
        nova: (chave) => alvo.querySelector(`section[data-lista="${chave}"] [data-acao="nova"]`),
        formulario: () => alvo.querySelector('form[data-papel="formulario"]'),
        campo: (nome) => alvo.querySelector(`form[data-papel="formulario"] [data-campo="${nome}"]`),
        erroDoCampo: (nome) => {
          const p = alvo.querySelector(`[data-erro-do-campo="${nome}"]`);
          return p && !p.hidden ? (p.textContent ?? "") : "";
        },
        dialogo: () => janela.document.querySelector('[role="alertdialog"]'),
        emCurso: () => alvo.querySelector('[data-papel="acao-em-curso"]')?.textContent ?? "",
        ocioso: () => alvo.querySelector('[aria-busy="true"]') === null,
        async clicar(elemento, nome, ateQueClique = null) {
          if (!elemento) {
            afirmar(`${caso}: o elemento "${nome}" existe na tela para ser clicado`, false);
            return false;
          }
          await act(async () => {
            elemento.dispatchEvent(new janela.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
          });
          return esperarAte(ateQueClique ?? tela.ocioso, `${caso}: a tela assenta depois de clicar em ${nome}`);
        },
        async escrever(nome, texto) {
          const campo = tela.campo(nome);
          if (!campo) {
            afirmar(`${caso}: o campo "${nome}" existe no formulário`, false);
            return;
          }
          const setter = Object.getOwnPropertyDescriptor(janela.HTMLInputElement.prototype, "value").set;
          await act(async () => {
            setter.call(campo, texto);
            campo.dispatchEvent(new janela.Event("input", { bubbles: true }));
          });
        },
        async escolherNaLista(nome, valor) {
          const campo = tela.campo(nome);
          if (!campo) {
            afirmar(`${caso}: a lista "${nome}" existe no formulário`, false);
            return;
          }
          const setter = Object.getOwnPropertyDescriptor(janela.HTMLSelectElement.prototype, "value").set;
          await act(async () => {
            setter.call(campo, valor);
            campo.dispatchEvent(new janela.Event("change", { bubbles: true }));
          });
        },
        async salvar(ateQueSalvo = null) {
          return tela.clicar(tela.alvo.querySelector('[data-acao="salvar"]'), "salvar", ateQueSalvo);
        },
        async acionarSaida(ateQueSaida) {
          const saida = avisos.erros.at(-1)?.[2] ?? null;
          if (!saida || typeof saida.aoAcionar !== "function") {
            afirmar(`${caso}: a última notificação de erro tem a ação de resolver`, false);
            return false;
          }
          await act(async () => {
            saida.aoAcionar();
          });
          return esperarAte(ateQueSaida, `${caso}: a tela assenta depois de "${saida.rotulo}"`);
        },
        async desmontar() {
          await act(async () => raizReact.unmount());
          await passo();
          alvo.remove();
          const sobras = {
            salvarClassificacao: escrita.respostas.salvarClassificacao.length,
            excluirClassificacao: escrita.respostas.excluirClassificacao.length,
          };
          const feitas = escrita.todas.slice(inicioDasEscritas).map((c) => c.op);
          const inesperadas = feitas.filter((op) => op !== "salvarClassificacao" && op !== "excluirClassificacao");
          afirmar(
            `${caso}: toda resposta preparada foi consumida, e nenhuma escrita fora das Classificações aconteceu`,
            sobras.salvarClassificacao === 0 && sobras.excluirClassificacao === 0 && inesperadas.length === 0,
            `sobras: ${JSON.stringify(sobras)} | feitas: ${feitas.join(", ")}`,
          );
          escrita.respostas.salvarClassificacao.length = 0;
          escrita.respostas.excluirClassificacao.length = 0;
          const doCaso = reclamacoes.slice(inicioDasReclamacoes);
          const naoToleradas = doCaso.filter((r) => !toleradas.some((t) => t.padrao.test(r)));
          const ausentes = toleradas.filter((t) => !doCaso.some((r) => t.padrao.test(r)));
          afirmar(
            `${caso}: o React não reclamou de nada fora do esperado, e o que era esperado apareceu`,
            naoToleradas.length === 0 && ausentes.length === 0,
            `${naoToleradas.slice(0, 2).map((r) => r.slice(0, 300)).join(" | ")} | ausentes: ${ausentes.map((t) => t.motivo).join(", ")}`,
          );
        },
      };
      await esperarAte(
        ateQue ?? (() => tela.situacao() !== null && tela.situacao() !== "carregando"),
        `${caso}: a tela monta e assenta em ${caminho}`,
      );
      return tela;
    };
    const estiloDe = (el) => el?.getAttribute("style") ?? "";
    const rotuloDaCor = (cor) => classificacoes.aparenciaDaCorDeClassificacao(cor).rotulo;
    const ultimaEscrita = () => escrita.todas.at(-1) ?? null;

    try {
      /* ══ Abrir: esqueleto, depois as três seções ══ */
      {
        const soltar = segurar();
        const lidasAntes = leitura.lidas;
        const abrir = await montar(CAMINHO, {
          caso: "Abrir",
          ateQue: () => janela.document.querySelector('[data-tela="classificacoes"] main[data-estado-da-lista="carregando"]') !== null,
        });
        afirmar(
          "Abrir: enquanto a leitura não volta, esqueleto com o anúncio em texto para leitor de tela, e nenhum item",
          abrir.situacao() === "carregando" &&
            (abrir.alvo.querySelector('[data-papel="esqueleto"] [role="status"].sr-only')?.textContent ?? "").trim() !== "" &&
            abrir.alvo.querySelectorAll("li[data-classificacao]").length === 0,
        );
        soltar();
        await esperarAte(() => abrir.situacao() === "lista", "Abrir: as listas aparecem");
        afirmar(
          "e depois as três seções, na ordem de `LISTAS_DE_CLASSIFICACAO`, cada uma com o `<h2>` do plural e os itens na ordem da camada",
          igual(abrir.secoes(), classificacoes.LISTAS_DE_CLASSIFICACAO.map((l) => l.chave)) &&
            classificacoes.LISTAS_DE_CLASSIFICACAO.every((l) => abrir.secao(l.chave)?.querySelector("h2")?.textContent === l.plural) &&
            igual(abrir.itens("departamento"), [DEP_OPE, DEP_TEC, DEP_RH, DEP_LEG]) &&
            igual(abrir.itens("tipo"), [TIPO_CLT, TIPO_EST]) &&
            igual(abrir.itens("nivel"), [NIV_PLENO, NIV_SENIOR]) &&
            leitura.lidas === lidasAntes + 1,
          `${abrir.secoes().join(", ")} | ${abrir.itens("departamento").join(", ")}`,
        );
        const nomeOpe = abrir.papel(DEP_OPE, "nome");
        const corOpe = abrir.papel(DEP_OPE, "cor");
        afirmar(
          "cada Departamento e Nível mostra o nome com a Cor por `style` E o nome da cor em texto (a cor nunca é o único portador)",
          nomeOpe?.textContent === "Operações" &&
            estiloDe(nomeOpe).includes(VERDE) &&
            estiloDe(nomeOpe).includes("var(--categoria-verde-ink)") &&
            (corOpe?.textContent ?? "").includes(rotuloDaCor(VERDE)) &&
            (abrir.papel(NIV_SENIOR, "cor")?.textContent ?? "").includes(rotuloDaCor(ROXO)) &&
            estiloDe(abrir.papel(NIV_SENIOR, "nome")).includes(ROXO) &&
            [...abrir.alvo.querySelectorAll('section[data-lista="departamento"] li, section[data-lista="nivel"] li')].every(
              (li) => (li.querySelector('[data-papel="cor"]')?.textContent ?? "").replace(/^Cor:\s*/, "").trim() !== "",
            ) &&
            (abrir.papel(DEP_LEG, "cor")?.textContent ?? "").trim() !== "" &&
            abrir.alvo.querySelector('section[data-lista="tipo"] [data-papel="cor"]') === null,
          `${nomeOpe?.outerHTML?.slice(0, 200)} | ${corOpe?.textContent}`,
        );
        afirmar(
          "cada Tipo mostra o Equivalente com o rótulo legível (e o código), e Departamento e Nível não mostram Equivalente",
          (abrir.papel(TIPO_CLT, "equivalente")?.textContent ?? "").includes(
            `${classificacoes.ROTULOS_DOS_EQUIVALENTES.FULL_TIME} (FULL_TIME)`,
          ) &&
            (abrir.papel(TIPO_EST, "equivalente")?.textContent ?? "").includes(classificacoes.ROTULOS_DOS_EQUIVALENTES.INTERN) &&
            abrir.alvo.querySelector('section[data-lista="departamento"] [data-papel="equivalente"]') === null,
        );
        afirmar(
          "o uso por extenso: \"2 vagas\", \"1 vaga\", \"Nenhuma vaga\", e \"Uso desconhecido\" para `vagas: null` (nunca zero)",
          abrir.papel(DEP_OPE, "uso")?.textContent === "2 vagas" &&
            abrir.papel(DEP_TEC, "uso")?.textContent === "1 vaga" &&
            abrir.papel(DEP_RH, "uso")?.textContent === "Nenhuma vaga" &&
            abrir.papel(DEP_LEG, "uso")?.textContent === "Uso desconhecido" &&
            abrir.papel(DEP_LEG, "uso")?.getAttribute("data-uso") === "desconhecido",
        );
        const alvos = [
          ...abrir.alvo.querySelectorAll('[data-tela="classificacoes"] button, [data-tela="classificacoes"] a'),
        ];
        const semRegra = alvos.filter((el) => {
          const classes = String(el.getAttribute("class") ?? "");
          return (
            !classes.includes("min-h-10") ||
            !classes.includes("min-w-10") ||
            !classes.includes("focus-visible:ring-2") ||
            /(^|\s)group-hover/.test(classes) ||
            /(^|\s)(opacity-0|invisible|hidden)(\s|$)/.test(classes) ||
            el.tabIndex < 0 ||
            el.getAttribute("aria-hidden") === "true"
          );
        });
        const daLinha = [...abrir.alvo.querySelectorAll("li[data-classificacao] [data-acao]")];
        const semNome = daLinha.filter((el) => {
          const li = el.closest("li");
          const nome = li?.querySelector('[data-papel="nome"]')?.textContent ?? "\u0000";
          return (
            !(el.getAttribute("aria-label") ?? "").includes(nome) ||
            !/(^|\s)border(\s|$)/.test(String(el.getAttribute("class") ?? "")) ||
            /(^|\s)hover:/.test(String(el.getAttribute("class") ?? "")) ||
            !["BUTTON", "A"].includes(el.tagName)
          );
        });
        /* TROCA REGISTRADA (revisão da 5.6): era `daLinha.length === 16`,
           número mágico. Agora: DOIS alvos (Editar e Excluir) por item à vista. */
        const itensAVista = abrir.alvo.querySelectorAll("li[data-classificacao]").length;
        afirmar(
          "todos os alvos da tela têm `ALVO_DE_TOQUE` e `ANEL_DE_FOCO`, nenhum se esconde nem depende de `group-hover`; os da linha (dois por item) têm borda permanente, nenhum `hover:` e `aria-label` que nomeia o item",
          itensAVista > 0 &&
            daLinha.length === 2 * itensAVista &&
            alvos.length >= daLinha.length + 4 &&
            semRegra.length === 0 &&
            semNome.length === 0,
          [...semRegra, ...semNome].map((el) => `${el.getAttribute("data-acao")}: ${el.getAttribute("class")}`).join(" | ") ||
            `${alvos.length} alvo(s), ${daLinha.length} da linha, ${itensAVista} itens`,
        );
        /* TROCA REGISTRADA (revisão da 5.6): o "depois dele" passou a ser
           conferido pela posição no documento, e o seletor redundante saiu. */
        const h1s = [...abrir.alvo.querySelectorAll("h1")];
        const h2s = [...abrir.alvo.querySelectorAll("section[data-lista] h2")];
        afirmar(
          "a hierarquia de títulos: UM `<h1>`, e um `<h2>` por seção, cada um DEPOIS do `<h1>` no documento",
          h1s.length === 1 &&
            h2s.length === classificacoes.LISTAS_DE_CLASSIFICACAO.length &&
            abrir.alvo.querySelectorAll("h2").length === h2s.length &&
            h2s.every((h2) => (h1s[0].compareDocumentPosition(h2) & janela.Node.DOCUMENT_POSITION_FOLLOWING) !== 0),
        );
        afirmar(
          "a pílula do nome tem `title` com o nome completo (o nome pode ser truncado na tela)",
          [...abrir.alvo.querySelectorAll('li[data-classificacao] [data-papel="nome"]')].every(
            (el) => (el.getAttribute("title") ?? "") !== "" && el.getAttribute("title") === el.textContent,
          ) && abrir.papel(DEP_OPE, "nome")?.getAttribute("title") === "Operações",
        );
        afirmar(
          "o Voltar leva à aba Carreiras (`/admin?aba=carreiras`)",
          abrir.alvo.querySelector('[data-acao="voltar"]')?.getAttribute("href") === "/admin?aba=carreiras",
        );
        await abrir.desmontar();
      }

      /* ══ Erro: com "tentar de novo", e a exceção também vira erro ══ */
      {
        leitura.falhar = true;
        const erro = await montar(CAMINHO, { caso: "Erro na leitura" });
        const bloco = erro.alvo.querySelector('main[data-estado-da-lista="erro"] [role="alert"]');
        afirmar(
          "Erro: a leitura que falha dá o estado `erro` (nunca lista vazia), com a frase do erro tipado e \"Tentar de novo\"",
          erro.situacao() === "erro" &&
            bloco !== null &&
            (bloco.textContent ?? "").includes("Não conseguimos ler as classificações") &&
            erro.alvo.querySelectorAll("section[data-lista]").length === 0 &&
            bloco.querySelector('[data-acao="repetir"]')?.textContent === "Tentar de novo",
        );
        leitura.falhar = false;
        await erro.clicar(bloco?.querySelector('[data-acao="repetir"]'), "Tentar de novo", () => erro.situacao() === "lista");
        afirmar("e \"Tentar de novo\" relê e mostra as listas", erro.situacao() === "lista" && erro.itens("tipo").length === 2);
        await erro.desmontar();

        leitura.lancar = true;
        const lancou = await montar(CAMINHO, {
          caso: "Erro na leitura que lança",
          toleradas: [{ padrao: /\[Painel\] A leitura das classificações lançou/, motivo: "o registro do `catch` da leitura" }],
        });
        afirmar(
          "a leitura que LANÇA também vira `erro` com \"Tentar de novo\" (nunca esqueleto eterno), e o motivo vai ao console com `[Painel]`",
          lancou.situacao() === "erro" && lancou.alvo.querySelector('[data-acao="repetir"]') !== null,
        );
        leitura.lancar = false;
        await lancou.desmontar();
      }

      /* ══ Lista vazia: a chamada para criar, na própria seção ══ */
      {
        leitura.dados = { ...fixture(), niveis: [] };
        const vazia = await montar(CAMINHO, { caso: "Lista vazia" });
        const vazio = vazia.secao("nivel")?.querySelector('[data-papel="vazio"]');
        afirmar(
          "uma lista vazia mostra, NA PRÓPRIA SEÇÃO, a chamada para criar (o estado da tela continua `lista`, e as outras seções têm os itens)",
          vazia.situacao() === "lista" &&
            vazio !== null &&
            vazio.querySelector('[data-acao="primeira"]') !== null &&
            (vazio.textContent ?? "").includes("Nível") &&
            vazia.itens("departamento").length === 4 &&
            vazia.secao("departamento")?.querySelector('[data-papel="vazio"]') === null,
        );
        await vazia.clicar(vazio?.querySelector('[data-acao="primeira"]'), "Criar o primeiro Nível", () => vazia.formulario() !== null);
        afirmar(
          "e a chamada abre o formulário do Nível (Cor e Ordem, sem Equivalente)",
          vazia.situacao() === "formulario" &&
            vazia.formulario()?.getAttribute("data-lista") === "nivel" &&
            vazia.campo("cor") !== null &&
            vazia.campo("equivalente_jobposting") === null,
        );
        await vazia.escrever("nome", "Júnior");
        escrita.respostas.salvarClassificacao.push(() => {
          leitura.dados.niveis.push({ id: NIV_PLENO, nome: "Júnior", cor: AZUL, ordem: 0, vagas: 0 });
          return { ok: true, dados: { operacao: "salvarClassificacao", criada: true, lista: "nivel", classificacao: { id: NIV_PLENO, nome: "Júnior" } } };
        });
        await vazia.salvar(() => vazia.situacao() === "lista" && vazia.item(NIV_PLENO) !== null && vazia.ocioso());
        afirmar(
          "criado o primeiro, o \"Criar o primeiro\" que abriu o formulário SUMIU: o foco vai ao alvo previsível, o \"Novo Nível\" da seção",
          vazia.secao("nivel")?.querySelector('[data-acao="primeira"]') === null &&
            vazia.nova("nivel") !== null &&
            janela.document.activeElement === vazia.nova("nivel"),
          `${janela.document.activeElement?.tagName} ${janela.document.activeElement?.getAttribute("data-acao") ?? ""}`,
        );
        await vazia.desmontar();
        leitura.dados = fixture();
      }

      /* ══ Criar Departamento ══ */
      {
        const criar = await montar(CAMINHO, { caso: "Criar Departamento" });
        await criar.clicar(criar.nova("departamento"), "Novo Departamento", () => criar.formulario() !== null);
        afirmar(
          "Novo Departamento: o formulário SUBSTITUI a tela (estado `formulario`, sem as seções), com nome, Cor e Ordem, nessa ordem, e a Cor nasce na padrão",
          criar.situacao() === "formulario" &&
            criar.alvo.querySelectorAll("section[data-lista]").length === 0 &&
            igual(
              [...criar.formulario().querySelectorAll("[data-campo]")].map((c) => c.getAttribute("data-campo")),
              ["nome", "cor", "ordem"],
            ) &&
            criar.formulario().querySelector('[role="radio"][aria-checked="true"]')?.getAttribute("data-cor") ===
              classificacoes.COR_PADRAO_DE_CLASSIFICACAO,
        );
        afirmar(
          "abrir o formulário leva o FOCO ao campo Nome",
          criar.campo("nome") !== null && janela.document.activeElement === criar.campo("nome"),
          `${janela.document.activeElement?.tagName} ${janela.document.activeElement?.getAttribute("data-campo") ?? ""}`,
        );
        const regioesDeErro = [...criar.formulario().querySelectorAll("[data-erro-do-campo]")];
        afirmar(
          "a região de recusa de cada campo está SEMPRE montada, com `role=\"alert\"` desde a abertura, vazia e visível para a árvore de acessibilidade",
          igual(
            regioesDeErro.map((p) => p.getAttribute("data-erro-do-campo")),
            ["nome", "cor", "ordem"],
          ) &&
            regioesDeErro.every(
              (p) => p.getAttribute("role") === "alert" && !p.hidden && (p.textContent ?? "") === "" && p.getAttribute("aria-hidden") === null,
            ),
          regioesDeErro.map((p) => p.outerHTML.slice(0, 120)).join(" | "),
        );
        const radios = [...(criar.formulario()?.querySelectorAll('[role="radiogroup"] [role="radio"]') ?? [])];
        afirmar(
          "a Cor é um grupo de escolha acessível: um rádio por Cor da paleta, pintado por `style`, com nome acessível, UMA parada de tabulação, e a escolhida também por extenso",
          radios.length === classificacoes.CORES_DE_CLASSIFICACAO.length &&
            radios.every(
              (r, i) =>
                r.getAttribute("data-cor") === classificacoes.CORES_DE_CLASSIFICACAO[i] &&
                (r.getAttribute("aria-label") ?? "") === rotuloDaCor(classificacoes.CORES_DE_CLASSIFICACAO[i]) &&
                estiloDe(r).includes(classificacoes.CORES_DE_CLASSIFICACAO[i]),
            ) &&
            radios.filter((r) => r.tabIndex === 0).length === 1 &&
            (criar.alvo.querySelector('[data-papel="cor-escolhida"]')?.textContent ?? "").includes("Cinza"),
        );
        /* As setas percorrem e ESCOLHEM, com o foco junto. */
        const marcada = criar.formulario().querySelector('[role="radio"][aria-checked="true"]');
        await act(async () => {
          marcada?.dispatchEvent(new janela.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
        });
        await passo();
        const indicePadrao = classificacoes.CORES_DE_CLASSIFICACAO.indexOf(classificacoes.COR_PADRAO_DE_CLASSIFICACAO);
        const esperada = classificacoes.CORES_DE_CLASSIFICACAO[(indicePadrao + 1) % classificacoes.CORES_DE_CLASSIFICACAO.length];
        afirmar(
          "a seta escolhe a próxima Cor (com volta na ponta), e o foco e a parada de tabulação vão junto",
          criar.formulario().querySelector('[role="radio"][aria-checked="true"]')?.getAttribute("data-cor") === esperada &&
            janela.document.activeElement?.getAttribute("data-cor") === esperada &&
            [...criar.formulario().querySelectorAll('[role="radio"]')].filter((r) => r.tabIndex === 0).length === 1,
          `${criar.formulario().querySelector('[role="radio"][aria-checked="true"]')?.getAttribute("data-cor")} | ${esperada}`,
        );
        /* O teclado inteiro do grupo: Home, End e a volta da seta para trás. */
        const CORES = classificacoes.CORES_DE_CLASSIFICACAO;
        const teclar = async (tecla) => {
          const focada = janela.document.activeElement;
          await act(async () => {
            focada?.dispatchEvent(new janela.KeyboardEvent("keydown", { key: tecla, bubbles: true, cancelable: true }));
          });
          await passo();
          return {
            marcada: criar.formulario().querySelector('[role="radio"][aria-checked="true"]')?.getAttribute("data-cor") ?? null,
            focada: janela.document.activeElement?.getAttribute("data-cor") ?? null,
          };
        };
        const noHome = await teclar("Home");
        const voltaDaPonta = await teclar("ArrowLeft");
        const deNovoNoHome = await teclar("Home");
        const noEnd = await teclar("End");
        const voltaDoFim = await teclar("ArrowRight");
        afirmar(
          "teclado da Cor: Home vai à primeira, `ArrowLeft` na primeira DÁ A VOLTA para a última, End vai à última e `ArrowRight` na última volta à primeira, com o foco junto",
          noHome.marcada === CORES[0] &&
            noHome.focada === CORES[0] &&
            voltaDaPonta.marcada === CORES.at(-1) &&
            voltaDaPonta.focada === CORES.at(-1) &&
            deNovoNoHome.marcada === CORES[0] &&
            noEnd.marcada === CORES.at(-1) &&
            noEnd.focada === CORES.at(-1) &&
            voltaDoFim.marcada === CORES[0],
          JSON.stringify([noHome, voltaDaPonta, noEnd, voltaDoFim]),
        );
        const grupo = criar.formulario().querySelector('[role="radiogroup"]');
        const descritores = (grupo?.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
        afirmar(
          "\"Cor escolhida\" é a descrição do grupo: o `aria-describedby` do `radiogroup` aponta o elemento que diz a Cor por extenso",
          descritores.length > 0 &&
            descritores.some((id) => janela.document.getElementById(id)?.getAttribute("data-papel") === "cor-escolhida"),
          grupo?.getAttribute("aria-describedby") ?? "(sem aria-describedby)",
        );
        await criar.escrever("nome", "Parcerias");
        await criar.clicar(criar.formulario().querySelector(`[role="radio"][data-cor="${VERDE}"]`), "Cor Verde");
        const lidasAntes = leitura.lidas;
        escrita.respostas.salvarClassificacao.push(() => {
          leitura.dados.departamentos.push({ id: DEP_NOVO, nome: "Parcerias", cor: VERDE, ordem: 0, vagas: 0 });
          return { ok: true, dados: { operacao: "salvarClassificacao", criada: true, lista: "departamento", classificacao: { id: DEP_NOVO, nome: "Parcerias", cor: VERDE, ordem: 0 } } };
        });
        await criar.salvar(() => criar.situacao() === "lista" && criar.item(DEP_NOVO) !== null);
        afirmar(
          "Criar: `salvarClassificacao(\"departamento\", {nome, cor, ordem})` sem id, a lista é RELIDA, o item novo aparece na seção, e a notificação nomeia o item",
          igual(ultimaEscrita(), {
            op: "salvarClassificacao",
            lista: "departamento",
            campos: { nome: "Parcerias", cor: VERDE, ordem: 0 },
            id: null,
          }) &&
            leitura.lidas > lidasAntes &&
            criar.item(DEP_NOVO) !== null &&
            criar.itens("departamento").at(-1) === DEP_NOVO &&
            igual(avisos.sucessos.at(-1), ["Departamento Parcerias criado", ""]),
          `${JSON.stringify(ultimaEscrita())} | ${JSON.stringify(avisos.sucessos.at(-1))}`,
        );
        await criar.desmontar();
        leitura.dados = fixture();
      }

      /* ══ Criar Tipo sem Equivalente: recusa local ══ */
      {
        const tipo = await montar(CAMINHO, { caso: "Criar Tipo sem Equivalente" });
        await tipo.clicar(tipo.nova("tipo"), "Novo Tipo", () => tipo.formulario() !== null);
        const opcoes = [...(tipo.campo("equivalente_jobposting")?.querySelectorAll("option") ?? [])];
        afirmar(
          "o Equivalente é um `<select>` com a opção vazia e os rótulos legíveis de TODOS os códigos, e o Tipo não tem Cor",
          tipo.campo("equivalente_jobposting")?.tagName === "SELECT" &&
            opcoes[0]?.value === "" &&
            igual(
              opcoes.slice(1).map((o) => o.value),
              [...classificacoes.EQUIVALENTES_JOBPOSTING],
            ) &&
            opcoes.slice(1).every((o) => (o.textContent ?? "").includes(classificacoes.ROTULOS_DOS_EQUIVALENTES[o.value])) &&
            tipo.campo("cor") === null &&
            igual(
              [...tipo.formulario().querySelectorAll("[data-campo]")].map((c) => c.getAttribute("data-campo")),
              ["nome", "equivalente_jobposting", "ordem"],
            ),
        );
        const escritasAntes = escrita.todas.length;
        const errosAntes = avisos.erros.length;
        await tipo.escrever("nome", "Temporário");
        await tipo.salvar();
        afirmar(
          "Tipo sem Equivalente: recusa LOCAL no campo Equivalente (`aria-invalid` e a frase), nada enviado, e o formulário fica aberto com o que foi digitado",
          escrita.todas.length === escritasAntes &&
            tipo.situacao() === "formulario" &&
            tipo.campo("equivalente_jobposting")?.getAttribute("aria-invalid") === "true" &&
            tipo.erroDoCampo("equivalente_jobposting").includes("equivalente") &&
            tipo.campo("nome")?.value === "Temporário" &&
            avisos.erros.length === errosAntes + 1,
          `${tipo.erroDoCampo("equivalente_jobposting")} | ${escrita.todas.length - escritasAntes}`,
        );
        await tipo.escolherNaLista("equivalente_jobposting", "TEMPORARY");
        escrita.respostas.salvarClassificacao.push({
          ok: true,
          dados: { operacao: "salvarClassificacao", criada: true, lista: "tipo", classificacao: { id: "x", nome: "Temporário" } },
        });
        await tipo.salvar(() => tipo.situacao() === "lista");
        afirmar(
          "com o Equivalente escolhido, `salvarClassificacao(\"tipo\", {nome, equivalente_jobposting, ordem})`, sem Cor",
          igual(ultimaEscrita(), {
            op: "salvarClassificacao",
            lista: "tipo",
            campos: { nome: "Temporário", equivalente_jobposting: "TEMPORARY", ordem: 0 },
            id: null,
          }),
          JSON.stringify(ultimaEscrita()),
        );
        await tipo.desmontar();
      }

      /* ══ Nome repetido: a frase do servidor no campo e na notificação ══ */
      {
        const repetido = await montar(CAMINHO, { caso: "Nome repetido" });
        await repetido.clicar(repetido.nova("departamento"), "Novo Departamento", () => repetido.formulario() !== null);
        await repetido.escrever("nome", "operacoes");
        const frase = nucleoDaClassificacao.fraseDeNomeRepetido(DEP_Q, "Operações");
        escrita.respostas.salvarClassificacao.push({ ok: false, erro: { tipo: "conflito", mensagem: frase } });
        const errosAntes = avisos.erros.length;
        await repetido.salvar();
        afirmar(
          "Nome repetido: a frase do SERVIDOR (que nomeia o existente) aparece NO CAMPO nome (`aria-invalid`) e na notificação, sem \"Tentar de novo\", e o formulário fica aberto com o que foi digitado",
          repetido.situacao() === "formulario" &&
            repetido.erroDoCampo("nome") === frase &&
            frase.includes("Operações") &&
            repetido.campo("nome")?.getAttribute("aria-invalid") === "true" &&
            repetido.campo("nome")?.value === "operacoes" &&
            avisos.erros.length === errosAntes + 1 &&
            avisos.erros.at(-1)?.[1] === frase &&
            avisos.erros.at(-1)?.[2] === null,
          `${repetido.erroDoCampo("nome")} | ${JSON.stringify(avisos.erros.at(-1)?.slice(0, 2))}`,
        );
        await repetido.escrever("nome", "operacoes 2");
        afirmar(
          "mexer no nome tira a recusa do campo",
          repetido.erroDoCampo("nome") === "" && repetido.campo("nome")?.getAttribute("aria-invalid") === null,
        );
        await repetido.desmontar();
      }

      /* ══ Renomear: só o nome, com o id ══ */
      {
        const renomear = await montar(CAMINHO, { caso: "Renomear" });
        await renomear.clicar(renomear.acao(DEP_TEC, "editar"), "Editar Tecnologia", () => renomear.formulario() !== null);
        afirmar(
          "Editar abre o formulário com os valores gravados (nome, a Cor marcada, a Ordem)",
          renomear.campo("nome")?.value === "Tecnologia" &&
            renomear.formulario().querySelector('[role="radio"][aria-checked="true"]')?.getAttribute("data-cor") === AZUL &&
            renomear.campo("ordem")?.value === "1",
        );
        await renomear.escrever("nome", "Engenharia");
        escrita.respostas.salvarClassificacao.push({
          ok: true,
          dados: { operacao: "salvarClassificacao", criada: false, lista: "departamento", classificacao: { id: DEP_TEC, nome: "Engenharia" } },
        });
        await renomear.salvar(() => renomear.situacao() === "lista");
        afirmar(
          "Renomear \"Tecnologia\" para \"Engenharia\": só `nome` vai no corpo, com o `id`, e a notificação diz \"salvo\"",
          igual(ultimaEscrita(), { op: "salvarClassificacao", lista: "departamento", campos: { nome: "Engenharia" }, id: DEP_TEC }) &&
            avisos.sucessos.at(-1)?.[0] === "Departamento Engenharia salvo",
          JSON.stringify(ultimaEscrita()),
        );
        await renomear.clicar(renomear.acao(DEP_RH, "editar"), "Editar rh", () => renomear.formulario() !== null);
        await renomear.escrever("nome", "RH");
        escrita.respostas.salvarClassificacao.push({
          ok: true,
          dados: { operacao: "salvarClassificacao", criada: false, lista: "departamento", classificacao: { id: DEP_RH, nome: "RH" } },
        });
        await renomear.salvar(() => renomear.situacao() === "lista");
        afirmar(
          "Renomear o próprio item mudando só a caixa (\"rh\" para \"RH\"): vai `{nome: \"RH\"}` com o id, e é aceito",
          igual(ultimaEscrita(), { op: "salvarClassificacao", lista: "departamento", campos: { nome: "RH" }, id: DEP_RH }) &&
            avisos.sucessos.at(-1)?.[0] === "Departamento RH salvo",
          JSON.stringify(ultimaEscrita()),
        );
        /* A Cor LEGADA não é reenviada sem mudar. */
        await renomear.clicar(renomear.acao(DEP_LEG, "editar"), "Editar Legado", () => renomear.formulario() !== null);
        afirmar(
          "Editar um item com Cor legada: nenhum rádio marcado, e a escolhida é dita como fora da paleta",
          renomear.formulario().querySelector('[role="radio"][aria-checked="true"]') === null &&
            (renomear.alvo.querySelector('[data-papel="cor-escolhida"]')?.textContent ?? "").includes("fora da paleta"),
        );
        await renomear.escrever("nome", "Legado Novo");
        escrita.respostas.salvarClassificacao.push({
          ok: true,
          dados: { operacao: "salvarClassificacao", criada: false, lista: "departamento", classificacao: { id: DEP_LEG, nome: "Legado Novo" } },
        });
        await renomear.salvar(() => renomear.situacao() === "lista");
        afirmar(
          "e renomeá-lo manda SÓ o nome: a Cor legada não é reenviada",
          igual(ultimaEscrita(), { op: "salvarClassificacao", lista: "departamento", campos: { nome: "Legado Novo" }, id: DEP_LEG }),
          JSON.stringify(ultimaEscrita()),
        );
        /* Nada mudou: nada viaja. */
        const escritasAntes = escrita.todas.length;
        await renomear.clicar(renomear.acao(DEP_OPE, "editar"), "Editar Operações", () => renomear.formulario() !== null);
        await renomear.salvar(() => renomear.situacao() === "lista");
        afirmar("salvar sem mudar nada fecha o formulário sem pedido", escrita.todas.length === escritasAntes);
        await renomear.desmontar();
      }

      /* ══ Ordem acima do teto ══ */
      {
        const ordem = await montar(CAMINHO, { caso: "Ordem acima do teto" });
        await ordem.clicar(ordem.nova("nivel"), "Novo Nível", () => ordem.formulario() !== null);
        await ordem.escrever("nome", "Estagiário");
        await ordem.escrever("ordem", String(classificacoes.ORDEM_MAXIMA_DA_CLASSIFICACAO + 1));
        const escritasAntes = escrita.todas.length;
        await ordem.salvar();
        afirmar(
          "Ordem 100001: recusa LOCAL no campo Ordem com o teto do domínio, nada enviado",
          escrita.todas.length === escritasAntes &&
            ordem.situacao() === "formulario" &&
            ordem.erroDoCampo("ordem").includes(String(classificacoes.ORDEM_MAXIMA_DA_CLASSIFICACAO)) &&
            ordem.campo("ordem")?.getAttribute("aria-invalid") === "true",
          ordem.erroDoCampo("ordem"),
        );
        const regiaoDaOrdem = ordem.alvo.querySelector('[data-erro-do-campo="ordem"]');
        const noAntes = regiaoDaOrdem?.firstElementChild ?? null;
        const errosAntesDaRepeticao = avisos.erros.length;
        await ordem.salvar();
        const noDepois = ordem.alvo.querySelector('[data-erro-do-campo="ordem"]')?.firstElementChild ?? null;
        afirmar(
          "a MESMA recusa repetida é anunciada de novo: a região (a mesma, sempre montada) troca o nó do texto, e a notificação sai outra vez",
          regiaoDaOrdem !== null &&
            ordem.alvo.querySelector('[data-erro-do-campo="ordem"]') === regiaoDaOrdem &&
            noAntes !== null &&
            noDepois !== null &&
            noDepois !== noAntes &&
            noDepois.textContent === noAntes.textContent &&
            avisos.erros.length === errosAntesDaRepeticao + 1 &&
            escrita.todas.length === escritasAntes,
        );
        await ordem.clicar(ordem.alvo.querySelector('[data-acao="cancelar"]'), "Cancelar", () => ordem.situacao() === "lista");
        afirmar("Cancelar volta às listas sem pedido", ordem.situacao() === "lista" && escrita.todas.length === escritasAntes);
        afirmar(
          "e devolve o FOCO ao botão que abriu o formulário (\"Novo Nível\")",
          ordem.nova("nivel") !== null && janela.document.activeElement === ordem.nova("nivel"),
          `${janela.document.activeElement?.tagName} ${janela.document.activeElement?.getAttribute("data-acao") ?? ""}`,
        );
        await ordem.clicar(ordem.acao(NIV_SENIOR, "editar"), "Editar Sênior", () => ordem.formulario() !== null);
        const focoNoNome = janela.document.activeElement === ordem.campo("nome");
        await ordem.clicar(ordem.alvo.querySelector('[data-acao="cancelar"]'), "Cancelar", () => ordem.situacao() === "lista");
        afirmar(
          "Editar leva o foco ao Nome, e Cancelar o devolve ao Editar DAQUELE item",
          focoNoNome && ordem.acao(NIV_SENIOR, "editar") !== null && janela.document.activeElement === ordem.acao(NIV_SENIOR, "editar"),
          `${janela.document.activeElement?.getAttribute("aria-label") ?? janela.document.activeElement?.tagName}`,
        );
        await ordem.desmontar();
      }

      /* ══ Excluir em uso e uso desconhecido: sem diálogo ══ */
      {
        const emUso = await montar(CAMINHO, { caso: "Excluir em uso" });
        const alvoOpe = emUso.acao(DEP_OPE, "excluir");
        afirmar(
          "Item em uso: o alvo de excluir é `aria-disabled` (NÃO `disabled`: continua alcançável e explica), com o motivo no nome acessível",
          alvoOpe?.getAttribute("aria-disabled") === "true" &&
            alvoOpe?.disabled === false &&
            (alvoOpe?.getAttribute("aria-label") ?? "").includes("Em uso por 2 vagas"),
        );
        const errosAntes = avisos.erros.length;
        /* TROCA REGISTRADA (revisão da 5.6): "sem escrita" era olhar só a
           última escrita; agora compara o COMPRIMENTO antes e depois. */
        const escritasAntesDoClique = escrita.todas.length;
        await emUso.clicar(alvoOpe, "Excluir Operações");
        await passo();
        afirmar(
          "e o clique NOTIFICA \"Em uso por 2 vagas\", sem abrir diálogo e sem escrita nenhuma",
          emUso.dialogo() === null &&
            avisos.erros.length === errosAntes + 1 &&
            (avisos.erros.at(-1)?.[0] ?? "").includes("Em uso por 2 vagas") &&
            escrita.todas.length === escritasAntesDoClique,
          JSON.stringify(avisos.erros.at(-1)?.slice(0, 2)),
        );
        const alvoLeg = emUso.acao(DEP_LEG, "excluir");
        await emUso.clicar(alvoLeg, "Excluir Legado");
        await passo();
        afirmar(
          "Uso desconhecido: \"Uso desconhecido\" na linha, exclusão indisponível (`aria-disabled`), e o clique explica com motivo PRÓPRIO, sem diálogo",
          alvoLeg?.getAttribute("aria-disabled") === "true" &&
            emUso.dialogo() === null &&
            avisos.erros.length === errosAntes + 2 &&
            (avisos.erros.at(-1)?.[0] ?? "").includes("Uso desconhecido") &&
            !(avisos.erros.at(-1)?.[0] ?? "").includes("Em uso") &&
            !escrita.todas.some((c) => c.op === "excluirClassificacao" && (c.id === DEP_OPE || c.id === DEP_LEG)),
          JSON.stringify(avisos.erros.at(-1)?.slice(0, 2)),
        );
        afirmar(
          "item com uso 0 tem o alvo de excluir disponível (sem `aria-disabled`)",
          emUso.acao(DEP_RH, "excluir")?.getAttribute("aria-disabled") === null &&
            emUso.acao(NIV_PLENO, "excluir")?.getAttribute("aria-disabled") === null,
        );
        await emUso.desmontar();
      }

      /* ══ Excluir livre: o diálogo, a releitura, a recusa do servidor ══ */
      {
        const livre = await montar(CAMINHO, { caso: "Excluir livre" });
        await livre.clicar(livre.acao(NIV_PLENO, "excluir"), "Excluir Pleno", () => livre.dialogo() !== null);
        const dialogo = livre.dialogo();
        afirmar(
          "Excluir livre: abre UM diálogo que nomeia o item, com o botão \"Excluir Nível\", e nada sai antes de confirmar",
          dialogo !== null &&
            janela.document.querySelectorAll('[role="alertdialog"]').length === 1 &&
            (dialogo.textContent ?? "").includes("Pleno") &&
            (dialogo.querySelector('[data-papel="confirmar"]')?.textContent ?? "") === "Excluir Nível" &&
            !escrita.todas.some((c) => c.op === "excluirClassificacao" && c.id === NIV_PLENO),
          (dialogo?.textContent ?? "").slice(0, 200),
        );
        const cancelar = [...(dialogo?.querySelectorAll("button") ?? [])].find((b) => (b.textContent ?? "").trim() === "Cancelar");
        await livre.clicar(cancelar, "Cancelar", () => livre.dialogo() === null);
        afirmar("Cancelar fecha o diálogo sem excluir", !escrita.todas.some((c) => c.op === "excluirClassificacao" && c.id === NIV_PLENO));
        await livre.clicar(livre.acao(NIV_PLENO, "excluir"), "Excluir Pleno", () => livre.dialogo() !== null);
        const lidasAntes = leitura.lidas;
        const excluirSegurado = segurada(() => {
          leitura.dados.niveis = leitura.dados.niveis.filter((n) => n.id !== NIV_PLENO);
          return { ok: true, dados: { operacao: "excluirClassificacao", lista: "nivel", id: NIV_PLENO } };
        });
        escrita.respostas.excluirClassificacao.push(excluirSegurado.responder);
        await livre.clicar(livre.dialogo()?.querySelector('[data-papel="confirmar"]'), "confirmar", () =>
          escrita.todas.some((c) => c.op === "excluirClassificacao" && c.id === NIV_PLENO),
        );
        afirmar(
          "ao confirmar, `excluirClassificacao(\"nivel\", id)` UMA vez; enquanto a resposta não vem, a trava global (`aria-busy`) e a região viva dizem o que acontece",
          igual(escrita.todas.filter((c) => c.op === "excluirClassificacao"), [{ op: "excluirClassificacao", lista: "nivel", id: NIV_PLENO }]) &&
            livre.alvo.querySelector('main[aria-busy="true"]') !== null &&
            livre.emCurso().includes("Excluindo") &&
            livre.emCurso().includes("Pleno") &&
            (livre.dialogo()?.querySelector('[data-papel="dialogo-em-curso"]')?.textContent ?? "").includes("Excluindo") &&
            [...livre.alvo.querySelectorAll("li[data-classificacao] button:not([aria-disabled])")].every((b) => b.disabled),
        );
        excluirSegurado.controle.soltar();
        await esperarAte(() => livre.item(NIV_PLENO) === null && livre.dialogo() === null && livre.ocioso(), "Excluir livre: o item sai");
        afirmar(
          "depois: a lista é RELIDA, o item sai, e a notificação nomeia o item excluído",
          leitura.lidas > lidasAntes &&
            igual(livre.itens("nivel"), [NIV_SENIOR]) &&
            avisos.sucessos.at(-1)?.[0] === "Nível Pleno excluído",
          JSON.stringify(avisos.sucessos.at(-1)),
        );
        /* A recusa do servidor ("em uso" por corrida): notificada e relida. */
        await livre.clicar(livre.acao(NIV_SENIOR, "excluir"), "Excluir Sênior", () => livre.dialogo() !== null);
        const frase = nucleoDaClassificacao.fraseDeClassificacaoEmUso(NIVEL_Q, "Sênior", 1);
        escrita.respostas.excluirClassificacao.push(() => {
          leitura.dados.niveis = leitura.dados.niveis.map((n) => (n.id === NIV_SENIOR ? { ...n, vagas: 1 } : n));
          return { ok: false, erro: { tipo: "conflito", mensagem: frase } };
        });
        const lidasAntesDaRecusa = leitura.lidas;
        await livre.clicar(livre.dialogo()?.querySelector('[data-papel="confirmar"]'), "confirmar (recusa)", () =>
          livre.dialogo() === null && livre.papel(NIV_SENIOR, "uso")?.textContent === "1 vaga",
        );
        afirmar(
          "Recusa do servidor (em uso por corrida): a notificação traz a frase do servidor, sem \"Tentar de novo\", a lista é RELIDA e o uso novo aparece, com o alvo indisponível",
          avisos.erros.at(-1)?.[0] === "Não deu para excluir o Nível Sênior" &&
            avisos.erros.at(-1)?.[1] === frase &&
            avisos.erros.at(-1)?.[2] === null &&
            leitura.lidas > lidasAntesDaRecusa &&
            livre.item(NIV_SENIOR) !== null &&
            livre.acao(NIV_SENIOR, "excluir")?.getAttribute("aria-disabled") === "true",
          JSON.stringify(avisos.erros.at(-1)?.slice(0, 2)),
        );
        await livre.desmontar();
        leitura.dados = fixture();
      }

      /* ══ Falha de rede ao salvar, e a trava contra o clique duplo ══ */
      {
        const rede = await montar(CAMINHO, { caso: "Falha de rede ao salvar" });
        await rede.clicar(rede.acao(TIPO_EST, "editar"), "Editar Estágio", () => rede.formulario() !== null);
        afirmar(
          "Editar um Tipo abre o `<select>` com o Equivalente gravado",
          rede.campo("equivalente_jobposting")?.value === "INTERN",
        );
        await rede.escrever("nome", "Estágio Técnico");
        await rede.escrever("ordem", "7");
        const primeira = segurada({ ok: false, erro: { tipo: "rede", mensagem: "Não conseguimos falar com o servidor para salvar a classificação. Espere um instante e tente de novo." } });
        escrita.respostas.salvarClassificacao.push(primeira.responder);
        const escritasAntes = escrita.todas.length;
        const errosAntesDoClique = avisos.erros.length;
        const botao = rede.alvo.querySelector('[data-acao="salvar"]');
        await act(async () => {
          botao?.dispatchEvent(new janela.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
          botao?.dispatchEvent(new janela.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
        });
        await esperarAte(() => escrita.todas.length > escritasAntes, "Falha de rede: o pedido sai");
        afirmar(
          "clique duplo em salvar: UM pedido só (a trava é global), com `aria-busy` e a região viva dizendo o que está sendo salvo",
          escrita.todas.length === escritasAntes + 1 &&
            rede.alvo.querySelector('main[aria-busy="true"]') !== null &&
            rede.emCurso().includes("Salvando") &&
            rede.emCurso().includes("Estágio Técnico"),
          `${escrita.todas.length - escritasAntes} | ${rede.emCurso()}`,
        );
        primeira.controle.soltar();
        /* TROCA REGISTRADA (revisão da 5.6): a espera compara com a contagem
           de erros de ANTES do clique (antes, qualquer notificação velha já
           satisfazia a condição). */
        await esperarAte(() => rede.ocioso() && avisos.erros.length === errosAntesDoClique + 1, "Falha de rede: a notificação sai");
        afirmar(
          "Falha de rede: notificação com a frase do erro e \"Tentar de novo\", e o formulário continua com o que foi digitado",
          avisos.erros.length === errosAntesDoClique + 1 &&
            avisos.erros.at(-1)?.[0] === "Não deu para salvar o Tipo Estágio Técnico" &&
            avisos.erros.at(-1)?.[2]?.rotulo === "Tentar de novo" &&
            rede.situacao() === "formulario" &&
            rede.campo("nome")?.value === "Estágio Técnico" &&
            rede.campo("ordem")?.value === "7" &&
            rede.erroDoCampo("nome") === "",
          JSON.stringify(avisos.erros.at(-1)?.slice(0, 2)),
        );
        escrita.respostas.salvarClassificacao.push({
          ok: true,
          dados: { operacao: "salvarClassificacao", criada: false, lista: "tipo", classificacao: { id: TIPO_EST, nome: "Estágio Técnico" } },
        });
        await rede.acionarSaida(() => rede.situacao() === "lista");
        afirmar(
          "\"Tentar de novo\" REPETE o salvar, com o mesmo corpo (só o que mudou) e o mesmo id",
          escrita.todas.length === escritasAntes + 2 &&
            igual(escrita.todas.at(-1), escrita.todas.at(-2)) &&
            igual(escrita.todas.at(-1), {
              op: "salvarClassificacao",
              lista: "tipo",
              campos: { nome: "Estágio Técnico", ordem: 7 },
              id: TIPO_EST,
            }) &&
            avisos.sucessos.at(-1)?.[0] === "Tipo Estágio Técnico salvo",
          JSON.stringify(escrita.todas.slice(-2)),
        );
        await rede.desmontar();

        /* A exceção no salvar: registrada, e a trava solta. */
        const excecao = await montar(CAMINHO, {
          caso: "Exceção ao salvar",
          toleradas: [{ padrao: /\[Painel\] O salvamento da classificação lançou/, motivo: "o registro do `catch` do salvar" }],
        });
        await excecao.clicar(excecao.acao(NIV_PLENO, "editar"), "Editar Pleno", () => excecao.formulario() !== null);
        await excecao.escrever("nome", "Pleno II");
        escrita.respostas.salvarClassificacao.push(() => {
          throw new Error("dublê: a escrita lançou");
        });
        await excecao.salvar();
        afirmar(
          "a escrita que LANÇA vira notificação com \"Tentar de novo\", o formulário fica, e a trava é solta",
          avisos.erros.at(-1)?.[2]?.rotulo === "Tentar de novo" &&
            excecao.situacao() === "formulario" &&
            excecao.alvo.querySelector('[data-acao="salvar"]')?.disabled === false,
        );
        await excecao.desmontar();
      }

      /* ══ Revisão da 5.6: os caminhos de falha que faltavam ══ */
      const FRASE_OCUPADA = doPainel?.FRASE_DA_ACAO_OCUPADA ?? "(o módulo puro não importou)";
      const FRASE_SEM_ID = doPainel?.FRASE_DO_ITEM_SEM_ID ?? "(o módulo puro não importou)";
      /* Quantas exclusões do id saíram DESDE `desde` (o comprimento no começo do caso). */
      const excluidosDesde = (desde, id) =>
        escrita.todas.slice(desde).filter((c) => c.op === "excluirClassificacao" && c.id === id).length;

      /* ── Salvar um item que já não existe ── */
      {
        const sumiu = await montar(CAMINHO, { caso: "Salvar com nao_encontrado" });
        await sumiu.clicar(sumiu.acao(DEP_TEC, "editar"), "Editar Tecnologia", () => sumiu.formulario() !== null);
        await sumiu.escrever("nome", "Engenharia");
        const frase = "Este Departamento não existe mais. Ele pode ter sido excluído por outra pessoa.";
        escrita.respostas.salvarClassificacao.push(() => {
          leitura.dados.departamentos = leitura.dados.departamentos.filter((d) => d.id !== DEP_TEC);
          return { ok: false, erro: { tipo: "nao_encontrado", mensagem: frase } };
        });
        const lidasAntes = leitura.lidas;
        const errosAntes = avisos.erros.length;
        const escritasAntes = escrita.todas.length;
        await sumiu.salvar(() => sumiu.situacao() === "lista" && sumiu.item(DEP_TEC) === null && sumiu.ocioso());
        afirmar(
          "Salvar com `nao_encontrado`: volta à lista, RELÊ (o item sai), e notifica a frase do servidor SEM \"Tentar de novo\", com um pedido só",
          sumiu.situacao() === "lista" &&
            leitura.lidas > lidasAntes &&
            sumiu.item(DEP_TEC) === null &&
            escrita.todas.length === escritasAntes + 1 &&
            avisos.erros.length === errosAntes + 1 &&
            avisos.erros.at(-1)?.[1] === frase &&
            avisos.erros.at(-1)?.[2] === null,
          JSON.stringify(avisos.erros.at(-1)?.slice(0, 2)),
        );
        await sumiu.desmontar();
        leitura.dados = fixture();
      }

      /* ── Criação com `inesperado`: pode ter sido criado, então não repete ── */
      {
        const talvez = await montar(CAMINHO, { caso: "Criação com inesperado" });
        await talvez.clicar(talvez.nova("departamento"), "Novo Departamento", () => talvez.formulario() !== null);
        await talvez.escrever("nome", "Parcerias");
        const frase = "O Departamento pode ter sido criado, mas o servidor não confirmou. Recarregue a lista antes de tentar de novo.";
        escrita.respostas.salvarClassificacao.push(() => {
          leitura.dados.departamentos.push({ id: DEP_NOVO, nome: "Parcerias", cor: classificacoes.COR_PADRAO_DE_CLASSIFICACAO, ordem: 0, vagas: 0 });
          return { ok: false, erro: { tipo: "inesperado", mensagem: frase } };
        });
        const lidasAntes = leitura.lidas;
        const errosAntes = avisos.erros.length;
        const escritasAntes = escrita.todas.length;
        await talvez.salvar(() => talvez.situacao() === "lista" && talvez.item(DEP_NOVO) !== null && talvez.ocioso());
        afirmar(
          "Criação com `inesperado`: SEM \"Tentar de novo\" (repetir poderia criar outro), a notificação traz a frase do servidor, e a lista é RELIDA e mostra o que existe",
          escrita.todas.length === escritasAntes + 1 &&
            avisos.erros.length === errosAntes + 1 &&
            avisos.erros.at(-1)?.[1] === frase &&
            avisos.erros.at(-1)?.[2] === null &&
            leitura.lidas > lidasAntes &&
            talvez.item(DEP_NOVO) !== null,
          JSON.stringify(avisos.erros.at(-1)?.slice(0, 3)),
        );
        await talvez.desmontar();
        leitura.dados = fixture();
      }

      /* ── Conflito que NÃO é de nome: só na notificação ── */
      {
        const outro = await montar(CAMINHO, { caso: "Conflito que não é de nome" });
        await outro.clicar(outro.acao(DEP_TEC, "editar"), "Editar Tecnologia", () => outro.formulario() !== null);
        await outro.escrever("nome", "Engenharia");
        const frase = "Houve um conflito com outro registro ao salvar o Departamento. Recarregue o Painel e tente de novo.";
        escrita.respostas.salvarClassificacao.push({ ok: false, erro: { tipo: "conflito", mensagem: frase } });
        const errosAntes = avisos.erros.length;
        await outro.salvar(() => outro.ocioso() && avisos.erros.length === errosAntes + 1);
        afirmar(
          "um conflito que NÃO é de nome repetido fica só na notificação: o campo nome não recebe a frase nem `aria-invalid`",
          outro.situacao() === "formulario" &&
            avisos.erros.at(-1)?.[1] === frase &&
            avisos.erros.at(-1)?.[2] === null &&
            outro.erroDoCampo("nome") === "" &&
            outro.campo("nome")?.getAttribute("aria-invalid") === null,
          outro.erroDoCampo("nome"),
        );
        await outro.desmontar();
      }

      /* ── "Tentar de novo" do salvar DEPOIS de abrir outro item ── */
      {
        const troca = await montar(CAMINHO, { caso: "Repetir o salvar depois de abrir outro item" });
        await troca.clicar(troca.acao(TIPO_EST, "editar"), "Editar Estágio", () => troca.formulario() !== null);
        await troca.escrever("nome", "Estágio Técnico");
        escrita.respostas.salvarClassificacao.push({
          ok: false,
          erro: { tipo: "rede", mensagem: "Não conseguimos falar com o servidor para salvar a classificação. Espere um instante e tente de novo." },
        });
        const errosAntes = avisos.erros.length;
        await troca.salvar(() => troca.ocioso() && avisos.erros.length === errosAntes + 1);
        const saida = avisos.erros.at(-1)?.[2] ?? null;
        await troca.clicar(troca.alvo.querySelector('[data-acao="cancelar"]'), "Cancelar", () => troca.situacao() === "lista");
        await troca.clicar(troca.acao(NIV_PLENO, "editar"), "Editar Pleno", () => troca.formulario()?.getAttribute("data-lista") === "nivel");
        await troca.escrever("nome", "Pleno do formulário");
        const lidasAntes = leitura.lidas;
        const escritasAntes = escrita.todas.length;
        const repeticao = segurada({
          ok: true,
          dados: { operacao: "salvarClassificacao", criada: false, lista: "tipo", classificacao: { id: TIPO_EST, nome: "Estágio Técnico" } },
        });
        escrita.respostas.salvarClassificacao.push(repeticao.responder);
        if (typeof saida?.aoAcionar === "function") {
          await act(async () => {
            saida.aoAcionar();
          });
        }
        await esperarAte(() => escrita.todas.length === escritasAntes + 1, "Repetir o salvar: o pedido capturado sai");
        afirmar(
          "\"Tentar de novo\" grava o pedido CAPTURADO na falha (a lista, o id e o corpo do Estágio), e não o formulário aberto agora (o Pleno)",
          saida?.rotulo === "Tentar de novo" &&
            igual(escrita.todas.at(-1), { op: "salvarClassificacao", lista: "tipo", campos: { nome: "Estágio Técnico" }, id: TIPO_EST }),
          JSON.stringify(escrita.todas.at(-1)),
        );
        afirmar(
          "enquanto a repetição corre, a região viva e o `aria-busy` falam do item da TRAVA (o Tipo Estágio Técnico), e não do formulário à vista",
          troca.emCurso().includes("Salvando") &&
            troca.emCurso().includes("Tipo Estágio Técnico") &&
            !troca.emCurso().includes("Pleno") &&
            troca.alvo.querySelector('main[aria-busy="true"]') !== null,
          troca.emCurso(),
        );
        /* A trava presa: repetir de novo AGORA não some em silêncio. */
        const errosAntesDaOcupada = avisos.erros.length;
        await act(async () => {
          saida?.aoAcionar?.();
        });
        await passo();
        afirmar(
          "repetir com a trava presa NOTIFICA (a frase da ação ocupada, com \"Tentar de novo\" de novo) em vez de descartar em silêncio, e nada sai",
          escrita.todas.length === escritasAntes + 1 &&
            avisos.erros.length === errosAntesDaOcupada + 1 &&
            avisos.erros.at(-1)?.[1] === FRASE_OCUPADA &&
            avisos.erros.at(-1)?.[2]?.rotulo === "Tentar de novo",
          JSON.stringify(avisos.erros.at(-1)?.slice(0, 2)),
        );
        repeticao.controle.soltar();
        await esperarAte(() => troca.ocioso() && avisos.sucessos.at(-1)?.[0] === "Tipo Estágio Técnico salvo", "Repetir o salvar: a resposta chega");
        afirmar(
          "com o sucesso da repetição: notifica, RELÊ a lista, e o formulário do OUTRO item continua aberto com o que foi digitado, sem outra gravação",
          avisos.sucessos.at(-1)?.[0] === "Tipo Estágio Técnico salvo" &&
            leitura.lidas > lidasAntes &&
            troca.situacao() === "formulario" &&
            troca.formulario()?.getAttribute("data-lista") === "nivel" &&
            troca.campo("nome")?.value === "Pleno do formulário" &&
            escrita.todas.length === escritasAntes + 1,
        );
        await troca.desmontar();
      }

      /* ── Exclusão com falha de rede, e a repetição pela notificação ── */
      {
        const inicioDoCaso = escrita.todas.length;
        const redeEx = await montar(CAMINHO, { caso: "Exclusão com falha de rede" });
        await redeEx.clicar(redeEx.acao(NIV_PLENO, "excluir"), "Excluir Pleno", () => redeEx.dialogo() !== null);
        escrita.respostas.excluirClassificacao.push({
          ok: false,
          erro: { tipo: "rede", mensagem: "Não conseguimos falar com o servidor para excluir a classificação. Espere um instante e tente de novo." },
        });
        const lidasAntes = leitura.lidas;
        const errosAntes = avisos.erros.length;
        await redeEx.clicar(redeEx.dialogo()?.querySelector('[data-papel="confirmar"]'), "confirmar", () =>
          redeEx.dialogo() === null && redeEx.ocioso() && avisos.erros.length === errosAntes + 1,
        );
        const saida = avisos.erros.at(-1)?.[2] ?? null;
        afirmar(
          "Exclusão com `rede`: notificação com \"Tentar de novo\", NENHUMA releitura, e o item continua na lista",
          saida?.rotulo === "Tentar de novo" &&
            avisos.erros.at(-1)?.[0] === "Não deu para excluir o Nível Pleno" &&
            leitura.lidas === lidasAntes &&
            redeEx.item(NIV_PLENO) !== null &&
            excluidosDesde(inicioDoCaso, NIV_PLENO) === 1,
          JSON.stringify(avisos.erros.at(-1)?.slice(0, 2)),
        );
        /* A trava presa por OUTRA exclusão: a repetição avisa. */
        await redeEx.clicar(redeEx.acao(NIV_SENIOR, "excluir"), "Excluir Sênior", () => redeEx.dialogo() !== null);
        const outraExclusao = segurada({ ok: false, erro: { tipo: "rede", mensagem: "Não conseguimos falar com o servidor para excluir a classificação. Espere um instante e tente de novo." } });
        escrita.respostas.excluirClassificacao.push(outraExclusao.responder);
        await redeEx.clicar(redeEx.dialogo()?.querySelector('[data-papel="confirmar"]'), "confirmar Sênior", () => excluidosDesde(inicioDoCaso, NIV_SENIOR) === 1);
        const errosAntesDaOcupada = avisos.erros.length;
        await act(async () => {
          saida?.aoAcionar?.();
        });
        await passo();
        afirmar(
          "repetir a exclusão com a trava presa por outra NOTIFICA (a frase da ação ocupada, com \"Tentar de novo\"), e o Pleno não sai de novo",
          avisos.erros.length === errosAntesDaOcupada + 1 &&
            avisos.erros.at(-1)?.[1] === FRASE_OCUPADA &&
            avisos.erros.at(-1)?.[2]?.rotulo === "Tentar de novo" &&
            excluidosDesde(inicioDoCaso, NIV_PLENO) === 1,
          JSON.stringify(avisos.erros.at(-1)?.slice(0, 2)),
        );
        outraExclusao.controle.soltar();
        await esperarAte(() => redeEx.ocioso() && redeEx.dialogo() === null, "Exclusão com falha de rede: a outra termina");
        const repeticao = segurada(() => {
          leitura.dados.niveis = leitura.dados.niveis.filter((n) => n.id !== NIV_PLENO);
          return { ok: true, dados: { operacao: "excluirClassificacao", lista: "nivel", id: NIV_PLENO } };
        });
        escrita.respostas.excluirClassificacao.push(repeticao.responder);
        const lidasAntesDaRepeticao = leitura.lidas;
        await act(async () => {
          saida?.aoAcionar?.();
        });
        await esperarAte(() => excluidosDesde(inicioDoCaso, NIV_PLENO) === 2, "Exclusão com falha de rede: a repetição sai");
        afirmar(
          "\"Tentar de novo\" repete `excluirClassificacao(\"nivel\", id)` UMA vez, SEM abrir diálogo, e a região viva nomeia o item da TRAVA",
          igual(escrita.todas.filter((c) => c.op === "excluirClassificacao").slice(-1), [
            { op: "excluirClassificacao", lista: "nivel", id: NIV_PLENO },
          ]) &&
            redeEx.dialogo() === null &&
            redeEx.emCurso().includes("Excluindo") &&
            redeEx.emCurso().includes("Nível Pleno") &&
            redeEx.alvo.querySelector('main[aria-busy="true"]') !== null,
          redeEx.emCurso(),
        );
        repeticao.controle.soltar();
        await esperarAte(() => redeEx.item(NIV_PLENO) === null && redeEx.ocioso(), "Exclusão com falha de rede: o item sai");
        afirmar(
          "e o item sai: a lista é relida, a notificação nomeia o excluído, e nenhuma exclusão a mais saiu",
          redeEx.item(NIV_PLENO) === null &&
            leitura.lidas > lidasAntesDaRepeticao &&
            avisos.sucessos.at(-1)?.[0] === "Nível Pleno excluído" &&
            excluidosDesde(inicioDoCaso, NIV_PLENO) === 2,
        );
        await redeEx.desmontar();
        leitura.dados = fixture();
      }

      /* ── Exclusão que LANÇA ── */
      {
        const lanca = await montar(CAMINHO, {
          caso: "Exclusão que lança",
          toleradas: [{ padrao: /\[Painel\] A exclusão da classificação lançou/, motivo: "o registro do `catch` da exclusão" }],
        });
        await lanca.clicar(lanca.acao(NIV_PLENO, "excluir"), "Excluir Pleno", () => lanca.dialogo() !== null);
        escrita.respostas.excluirClassificacao.push(() => {
          throw new Error("dublê: a exclusão lançou");
        });
        const lidasAntes = leitura.lidas;
        const errosAntes = avisos.erros.length;
        await lanca.clicar(lanca.dialogo()?.querySelector('[data-papel="confirmar"]'), "confirmar", () =>
          lanca.dialogo() === null && lanca.ocioso() && avisos.erros.length === errosAntes + 1,
        );
        afirmar(
          "a exclusão que LANÇA vira notificação com \"Tentar de novo\", sem releitura, e a trava é solta (o alvo volta a responder)",
          avisos.erros.at(-1)?.[2]?.rotulo === "Tentar de novo" &&
            leitura.lidas === lidasAntes &&
            lanca.item(NIV_PLENO) !== null &&
            lanca.acao(NIV_PLENO, "excluir")?.disabled === false &&
            lanca.alvo.querySelector('main[aria-busy="true"]') === null,
        );
        await lanca.desmontar();
      }

      /* ── Exclusão de um item que já não existia ── */
      {
        const ausente = await montar(CAMINHO, { caso: "Exclusão com nao_encontrado" });
        await ausente.clicar(ausente.acao(NIV_PLENO, "excluir"), "Excluir Pleno", () => ausente.dialogo() !== null);
        const frase = "Este Nível já não está no Painel, alguém pode tê-lo excluído antes.";
        escrita.respostas.excluirClassificacao.push(() => {
          leitura.dados.niveis = leitura.dados.niveis.filter((n) => n.id !== NIV_PLENO);
          return { ok: false, erro: { tipo: "nao_encontrado", mensagem: frase } };
        });
        const lidasAntes = leitura.lidas;
        const errosAntes = avisos.erros.length;
        await ausente.clicar(ausente.dialogo()?.querySelector('[data-papel="confirmar"]'), "confirmar", () =>
          ausente.dialogo() === null && ausente.item(NIV_PLENO) === null && ausente.ocioso(),
        );
        afirmar(
          "Exclusão com `nao_encontrado`: a linha sai (pela releitura), a notificação diz que ele JÁ NÃO EXISTIA, com a frase do servidor, sem \"Tentar de novo\"",
          ausente.item(NIV_PLENO) === null &&
            leitura.lidas > lidasAntes &&
            avisos.erros.length === errosAntes + 1 &&
            (avisos.erros.at(-1)?.[0] ?? "").includes("já não existia") &&
            (avisos.erros.at(-1)?.[0] ?? "").includes("Pleno") &&
            avisos.erros.at(-1)?.[1] === frase &&
            avisos.erros.at(-1)?.[2] === null,
          JSON.stringify(avisos.erros.at(-1)?.slice(0, 3)),
        );
        await ausente.desmontar();
        leitura.dados = fixture();
      }

      /* ── A releitura: em curso (lista ocupada) e falhando logo depois de salvar ── */
      {
        const relendo = await montar(CAMINHO, { caso: "Releitura em curso e falhando" });
        await relendo.clicar(relendo.acao(DEP_TEC, "editar"), "Editar Tecnologia", () => relendo.formulario() !== null);
        await relendo.escrever("nome", "Engenharia");
        escrita.respostas.salvarClassificacao.push({
          ok: true,
          dados: { operacao: "salvarClassificacao", criada: false, lista: "departamento", classificacao: { id: DEP_TEC, nome: "Engenharia" } },
        });
        /* A releitura vai FALHAR (o dublê decide a resposta na chamada), e
           fica segurada: primeiro se vê a lista velha ocupada, depois o erro. */
        leitura.falhar = true;
        const soltar = segurar();
        await relendo.salvar(
          () => relendo.situacao() === "lista" && relendo.alvo.querySelector('[data-papel="listas"][aria-busy="true"]') !== null,
        );
        const liberados = [...relendo.alvo.querySelectorAll('li[data-classificacao] [data-acao="excluir"]:not([aria-disabled])')];
        afirmar(
          "durante a releitura, a lista tem `aria-busy=\"true\"` e os alvos de exclusão ficam INDISPONÍVEIS (o uso à vista pode estar velho)",
          relendo.alvo.querySelector('[data-papel="listas"]')?.getAttribute("aria-busy") === "true" &&
            liberados.length > 0 &&
            liberados.every((b) => b.disabled),
          `${liberados.length} alvo(s) liberado(s)`,
        );
        /* A releitura que FALHA logo depois do salvar. */
        soltar();
        await esperarAte(() => relendo.situacao() === "erro", "Releitura que falha: o erro aparece");
        afirmar(
          "a releitura que falha logo depois de salvar dá o estado `erro` (com \"Tentar de novo\"), e os itens velhos saem: erro nunca é a lista velha",
          avisos.sucessos.at(-1)?.[0] === "Departamento Engenharia salvo" &&
            relendo.situacao() === "erro" &&
            relendo.alvo.querySelectorAll("section[data-lista]").length === 0 &&
            relendo.alvo.querySelector('[data-acao="repetir"]') !== null,
        );
        leitura.falhar = false;
        await relendo.clicar(relendo.alvo.querySelector('[data-acao="repetir"]'), "Tentar de novo", () => relendo.situacao() === "lista");
        afirmar(
          "e \"Tentar de novo\" relê; terminada a releitura, a lista deixa de estar ocupada e a exclusão volta",
          relendo.situacao() === "lista" &&
            relendo.alvo.querySelector('[data-papel="listas"]')?.getAttribute("aria-busy") === null &&
            relendo.acao(DEP_RH, "excluir")?.disabled === false,
        );
        await relendo.desmontar();
      }

      /* ── A leitura com uma tabela que não é lista ── */
      for (const [tabela, torto] of [
        ["niveis", null],
        ["tipos_de_vaga", undefined],
        ["departamentos", { id: "x" }],
      ]) {
        leitura.dados = { ...fixture(), [tabela]: torto };
        const torta = await montar(CAMINHO, { caso: `Leitura com ${tabela} fora de forma` });
        afirmar(
          `a leitura com \`${tabela}\` ${torto === undefined ? "ausente" : `como ${JSON.stringify(torto)}`} dá o estado \`erro\` (com "Tentar de novo"), nunca uma seção vazia`,
          torta.situacao() === "erro" &&
            torta.alvo.querySelectorAll("section[data-lista]").length === 0 &&
            torta.alvo.querySelector('[data-acao="repetir"]') !== null,
          torta.situacao(),
        );
        await torta.desmontar();
      }
      leitura.dados = fixture();

      /* ── Os legados: Ordem desconhecida, Ordem acima do teto, Equivalente fora da lista, item sem id ── */
      {
        const TETO = classificacoes.ORDEM_MAXIMA_DA_CLASSIFICACAO;
        leitura.dados = {
          departamentos: [{ id: DEP_OPE, nome: "Operações", cor: VERDE, ordem: null, vagas: 0 }],
          tipos_de_vaga: [
            { id: TIPO_CLT, nome: "Sazonal", equivalente_jobposting: "SEASONAL", ordem: TETO + 5, vagas: 0 },
            { nome: "Sem id", equivalente_jobposting: "FULL_TIME", ordem: 2, vagas: 0 },
          ],
          niveis: [{ id: NIV_PLENO, nome: "Pleno", cor: AZUL, ordem: 1.5, vagas: 0 }],
        };
        const legado = await montar(CAMINHO, { caso: "Legados" });
        afirmar(
          "item com Ordem desconhecida (nula ou fracionária) mostra \"Ordem não definida\", nunca \"Ordem 0\"; a legada acima do teto aparece como está",
          legado.papel(DEP_OPE, "ordem")?.textContent === "Ordem não definida" &&
            legado.papel(NIV_PLENO, "ordem")?.textContent === "Ordem não definida" &&
            legado.papel(TIPO_CLT, "ordem")?.textContent === `Ordem ${TETO + 5}` &&
            ![...legado.alvo.querySelectorAll('[data-papel="ordem"]')].some((o) => o.textContent === "Ordem 0"),
        );
        await legado.clicar(legado.acao(DEP_OPE, "editar"), "Editar Operações", () => legado.formulario() !== null);
        await legado.escrever("nome", "Operação");
        escrita.respostas.salvarClassificacao.push({
          ok: true,
          dados: { operacao: "salvarClassificacao", criada: false, lista: "departamento", classificacao: { id: DEP_OPE, nome: "Operação" } },
        });
        await legado.salvar(() => legado.situacao() === "lista" && legado.ocioso());
        afirmar(
          "renomear o item de Ordem desconhecida SEM tocar na Ordem manda só o nome (a Ordem não viaja como 0)",
          igual(ultimaEscrita(), { op: "salvarClassificacao", lista: "departamento", campos: { nome: "Operação" }, id: DEP_OPE }),
          JSON.stringify(ultimaEscrita()),
        );
        afirmar(
          "o Tipo com Equivalente LEGADO mostra \"Fora da lista:\" com o código cru na linha",
          (legado.papel(TIPO_CLT, "equivalente")?.textContent ?? "") === "Google Vagas: Fora da lista: SEASONAL",
          legado.papel(TIPO_CLT, "equivalente")?.textContent,
        );
        await legado.clicar(legado.acao(TIPO_CLT, "editar"), "Editar Sazonal", () => legado.formulario() !== null);
        const opcoesLegadas = [...(legado.campo("equivalente_jobposting")?.querySelectorAll("option") ?? [])];
        afirmar(
          "e no formulário o `<select>` ganha UMA opção extra com o legado (\"Fora da lista: SEASONAL\"), escolhida, além da vazia e de todos os códigos",
          legado.campo("equivalente_jobposting")?.value === "SEASONAL" &&
            opcoesLegadas.length === 2 + classificacoes.EQUIVALENTES_JOBPOSTING.length &&
            opcoesLegadas.filter((o) => o.value === "SEASONAL").length === 1 &&
            (opcoesLegadas.find((o) => o.value === "SEASONAL")?.textContent ?? "") === "Fora da lista: SEASONAL",
          opcoesLegadas.map((o) => o.value).join(", "),
        );
        await legado.escrever("nome", "Sazonal 2");
        escrita.respostas.salvarClassificacao.push({
          ok: true,
          dados: { operacao: "salvarClassificacao", criada: false, lista: "tipo", classificacao: { id: TIPO_CLT, nome: "Sazonal 2" } },
        });
        await legado.salvar(() => legado.situacao() === "lista" && legado.ocioso());
        afirmar(
          "renomear o item com Ordem ACIMA do teto (e Equivalente legado) sem tocar neles passa, e manda só o nome",
          igual(ultimaEscrita(), { op: "salvarClassificacao", lista: "tipo", campos: { nome: "Sazonal 2" }, id: TIPO_CLT }),
          JSON.stringify(ultimaEscrita()),
        );
        const linhaSemId = [...(legado.secao("tipo")?.querySelectorAll("li") ?? [])].find((li) => (li.textContent ?? "").includes("Sem id"));
        await legado.clicar(linhaSemId?.querySelector('[data-acao="editar"]'), "Editar Sem id", () => legado.formulario() !== null);
        await legado.escrever("nome", "Com nome novo");
        const escritasAntes = escrita.todas.length;
        const errosAntes = avisos.erros.length;
        await legado.salvar();
        afirmar(
          "editar um item SEM `id` não envia nada (seria criar outro): notifica o erro, e o formulário fica",
          escrita.todas.length === escritasAntes &&
            avisos.erros.length === errosAntes + 1 &&
            avisos.erros.at(-1)?.[1] === FRASE_SEM_ID &&
            legado.situacao() === "formulario",
          JSON.stringify(avisos.erros.at(-1)?.slice(0, 2)),
        );
        await legado.desmontar();
        leitura.dados = fixture();
      }

      /* ══ O link da aba, e a volta ══ */
      {
        const link = await montar("/admin?aba=carreiras", {
          caso: "Link da aba",
          ateQue: () => janela.document.querySelector('[data-acao="abrir-classificacoes"]') !== null,
        });
        const alvo = link.alvo.querySelector('[data-papel="aba-de-carreiras"] [data-acao="abrir-classificacoes"]');
        afirmar(
          "a faixa da aba Carreiras tem o link \"Classificações\" para `/admin/carreiras/classificacoes`, com alvo de toque, anel de foco e nome acessível que começa pelo texto visível",
          alvo?.tagName === "A" &&
            alvo.getAttribute("href") === "/admin/carreiras/classificacoes" &&
            (alvo.textContent ?? "").trim() === "Classificações" &&
            (alvo.getAttribute("aria-label") ?? "").startsWith("Classificações") &&
            String(alvo.getAttribute("class")).includes("min-h-10") &&
            String(alvo.getAttribute("class")).includes("focus-visible:ring-2"),
        );
        await link.clicar(alvo, "Classificações", () => link.situacao() === "lista");
        afirmar("e leva à tela de Classificações", link.onde() === CAMINHO && link.secoes().length === 3, link.onde());
        await link.clicar(link.alvo.querySelector('[data-acao="voltar"]'), "Voltar", () => link.onde() === "/admin?aba=carreiras");
        afirmar(
          "e o Voltar da tela leva a `/admin?aba=carreiras`, com a aba montada",
          link.onde() === "/admin?aba=carreiras" && link.alvo.querySelector('[data-papel="aba-de-carreiras"]') !== null,
          link.onde(),
        );
        await link.desmontar();
      }

      afirmar(
        "toda notificação da tela passou pela regra de voz (nenhuma frase vaga, nenhum rótulo de ação genérico)",
        avisos.problemasDeVoz.length === 0 && avisos.erros.length > 0 && avisos.sucessos.length > 0,
        avisos.problemasDeVoz.join(" | "),
      );
    } catch (erro) {
      afirmar("a tela de Classificações montada rodou até o fim sem exceção", false, erro?.stack ?? String(erro));
    } finally {
      console.error = erroOriginal;
      try {
        janela.close();
      } catch {
        /* o navegador de mentira já pode ter fechado */
      }
    }
  }
  try {
    rmSync(pasta, { recursive: true, force: true });
  } catch {
    /* presa pelo processo no Windows: a próxima execução varre na entrada */
  }
}

secao("(r) o site público de Carreiras: `/carreiras` lendo do banco e a Página da Vaga (Story 5.7)");

/*
 * Três partes, todas LOCAIS (sem token, sem rede):
 *
 * - NODE: `src/pages/carreirasPublico.js` e as duas funções que saíram de
 *   `admin/carreiras/listagem.js` para `domain/carreiras/vaga.js`, importados
 *   e executados.
 * - ESTÁTICA: AD-8 (nenhuma página de Carreiras toca o `<head>`), dados só
 *   pelas duas leituras públicas pelo apelido exato, sem armazenamento, um
 *   `<h1>` por tela, `.artigo` literal, sem palavra de Estado à mão, a rota.
 * - MONTADA: `Carreiras` e `VagaPublica` compiladas pelo empacotador da
 *   aplicação, com dublê de `@/data/carreiras/leitura`, num `MemoryRouter`,
 *   cobrindo cada linha da matriz de I/O da story.
 */

const PAGINAS_DE_CARREIRAS = Object.freeze([
  "src/pages/Carreiras.jsx",
  "src/pages/VagaPublica.jsx",
  "src/pages/CartaoDeVaga.jsx",
  "src/pages/SemVagasAbertas.jsx",
  "src/pages/carreirasPublico.js",
  "src/pages/useChegadaDaPagina.js",
]);

/* ── Node: o módulo puro ── */

let carreirasPublico = null;
try {
  carreirasPublico = await import(urlDe("src/pages/carreirasPublico.js"));
  afirmar("`src/pages/carreirasPublico.js` importa no Node (sem React, sem rede, sem apelido)", true);
} catch (erro) {
  afirmar("`src/pages/carreirasPublico.js` importa no Node (sem React, sem rede, sem apelido)", false, erro.message);
}

{
  const fonte = semComentarios(ler("src/pages/carreirasPublico.js") ?? "");
  const origens = origensDeImport(fonte);
  afirmar(
    "o módulo puro só importa do domínio (por caminho relativo): nada de React, `data/`, rede ou DOM",
    fonte !== "" &&
      origens.length > 0 &&
      origens.every((o) => /^\.\.\/domain\/(blog|carreiras)\/[a-zA-Z]+\.js$/.test(o)) &&
      !/\b(fetch|localStorage|sessionStorage|window|document)\b/.test(fonte),
    origens.join(", "),
  );
  afirmar(
    "nenhum `throw` do módulo puro tem travessão",
    !/throw new Error\([^;]*—/.test(fonte),
  );
}

/* O contrato de resultado da camada, para conferir a grafia de `nao_encontrado`. */
let resultadoDaCamada = null;
try {
  resultadoDaCamada = await import(urlDe("src/data/blog/resultado.js"));
} catch (erro) {
  afirmar("`src/data/blog/resultado.js` importa no Node", false, erro.message);
}

/* ── Node: a regra REAL do Slug torto, na camada de verdade ──
   A montagem usa dublê da leitura; o dublê responder `inexistente` a um Slug
   torto não prova nada sobre a camada. Aqui é a `lerSituacaoDaVaga` real, num
   processo novo, com ambiente de mentira (porta 9) e o `fetch` global trocado
   por um registrador ANTES de importar a camada: o Slug torto tem de voltar
   `inexistente` com ZERO chamadas de rede, e o Slug bem formado (o controle,
   que prova que o registrador enxerga a rede) tem de chamá-lo. */
function sondarSlugTorto() {
  const codigo = `
const chamadas = [];
globalThis.fetch = async (...args) => { chamadas.push(String(args[0])); throw new TypeError("fetch failed"); };
const m = await import(${JSON.stringify(urlDe("src/data/carreiras/leitura.js"))});
const saida = {};
for (const slug of ["Slug_Torto", "X y", "a,b", "", "com.ponto"]) {
  const antes = chamadas.length;
  const r = await m.lerSituacaoDaVaga(slug);
  saida[slug] = { r, rede: chamadas.length - antes };
}
const antes = chamadas.length;
const controle = await m.lerSituacaoDaVaga("slug-bem-formado");
saida.controle = { r: controle, rede: chamadas.length - antes };
process.stdout.write(JSON.stringify(saida));
`;
  try {
    const bruto = execFileSync(process.execPath, ["--input-type=module", "-e", codigo], {
      cwd: raiz,
      env: { ...process.env, VITE_SUPABASE_URL: "http://127.0.0.1:9", VITE_SUPABASE_PUBLISHABLE_KEY: "chave-de-mentira" },
      encoding: "utf8",
      timeout: TIMEOUT_MS * 2,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, saida: JSON.parse(bruto) };
  } catch (erro) {
    return { ok: false, erro: String(erro?.message ?? erro).slice(0, 300) };
  }
}
{
  const sonda = sondarSlugTorto();
  const tortos = sonda.ok ? Object.entries(sonda.saida).filter(([k]) => k !== "controle") : [];
  afirmar(
    "a `lerSituacaoDaVaga` REAL devolve `inexistente` para Slug torto SEM ir à rede (zero chamadas ao `fetch` observado), e o controle bem formado vai à rede",
    sonda.ok &&
      tortos.length === 5 &&
      tortos.every(([, x]) => x.r?.ok === true && x.r.dados?.situacao === "inexistente" && x.rede === 0) &&
      sonda.saida.controle?.rede > 0 &&
      sonda.saida.controle?.r?.ok === false,
    sonda.ok ? JSON.stringify(Object.fromEntries(Object.entries(sonda.saida).map(([k, x]) => [k, [x.r?.dados?.situacao ?? x.r?.erro?.tipo, x.rede]]))) : sonda.erro,
  );
}

if (carreirasPublico !== null) {
  const m = carreirasPublico;
  const e = estadosDaVaga;
  afirmar(
    "a lista pública tem exatamente quatro situações, congeladas e distintas",
    Object.isFrozen(m.SITUACOES_DA_LISTA) &&
      igual([...m.SITUACOES_DA_LISTA], [m.LISTA_CARREGANDO, m.LISTA_ERRO, m.LISTA_VAZIA, m.LISTA_PRONTA]) &&
      new Set(m.SITUACOES_DA_LISTA).size === 4,
  );
  const s = (o) => m.situacaoDaLista(o);
  afirmar(
    "a situação da lista: carregando primeiro, depois o ERRO (antes de qualquer vazio), depois vazia ou pronta",
    s({ carregando: true, erro: { tipo: "rede" }, vagas: [] }) === m.LISTA_CARREGANDO &&
      s({ erro: { tipo: "rede" }, vagas: [] }) === m.LISTA_ERRO &&
      s({ erro: { tipo: "rede" }, vagas: [{ slug: "a" }] }) === m.LISTA_ERRO &&
      s({ erro: null, vagas: null }) === m.LISTA_ERRO &&
      s({ vagas: [] }) === m.LISTA_VAZIA &&
      s({ vagas: [{ slug: "a" }] }) === m.LISTA_PRONTA,
  );
  const lanca = (fn) => {
    try {
      fn();
      return false;
    } catch {
      return true;
    }
  };
  afirmar(
    "as falas da lista: o erro pede tentar de novo e não fala de \"nenhuma vaga\"; o vazio convida o currículo; situação sem fala lança",
    m.falaDaLista(m.LISTA_ERRO).repetir === true &&
      !/nenhuma/i.test(m.falaDaLista(m.LISTA_ERRO).oQueHouve + m.falaDaLista(m.LISTA_ERRO).oQueFazer) &&
      m.falaDaLista(m.LISTA_VAZIA).repetir === false &&
      /currículo/i.test(m.falaDaLista(m.LISTA_VAZIA).oQueFazer) &&
      lanca(() => m.falaDaLista(m.LISTA_PRONTA)) &&
      lanca(() => m.falaDaLista("xpto")) &&
      lanca(() => m.falaDaLista("constructor")),
  );
  afirmar(
    "a Página da Vaga tem exatamente cinco situações, congeladas e distintas",
    Object.isFrozen(m.SITUACOES_DA_VAGA_PUBLICA) &&
      igual([...m.SITUACOES_DA_VAGA_PUBLICA], [m.VAGA_CARREGANDO, m.VAGA_ABERTA, m.VAGA_ENCERRADA, m.VAGA_INEXISTENTE, m.VAGA_ERRO]) &&
      new Set(m.SITUACOES_DA_VAGA_PUBLICA).size === 5,
  );
  const v = (o) => m.situacaoDaVagaPublica(o);
  /* TROCA REGISTRADA (revisão da Story 5.7): a Aberta desta asserção ganhou
     `titulo`, porque Aberta sem título passou a ser resposta inválida (erro);
     o caso sem título virou asserção própria, logo abaixo. */
  afirmar(
    "a situação da Vaga: carregando, depois erro (distinto de inexistente), depois a situação do banco pelo vocabulário do domínio; resposta sem situação é erro",
    v({ carregando: true, erro: { tipo: "rede" } }) === m.VAGA_CARREGANDO &&
      v({ erro: { tipo: "rede" }, vaga: { situacao: e.SITUACAO_ABERTA } }) === m.VAGA_ERRO &&
      v({ vaga: { situacao: e.SITUACAO_ABERTA, titulo: "Analista" } }) === m.VAGA_ABERTA &&
      v({ vaga: { situacao: e.SITUACAO_ENCERRADA } }) === m.VAGA_ENCERRADA &&
      v({ vaga: { situacao: e.SITUACAO_INEXISTENTE } }) === m.VAGA_INEXISTENTE &&
      v({ vaga: null }) === m.VAGA_ERRO &&
      v({ vaga: { situacao: "rascunho" } }) === m.VAGA_ERRO &&
      v({ vaga: { situacao: "constructor" } }) === m.VAGA_ERRO,
  );
  /* Story 5.7, revisão: `nao_encontrado` da camada é inexistente, e os demais
     tipos continuam erro; Aberta sem título é inválida (erro). */
  afirmar(
    "a falha `nao_encontrado` da camada é a tela \"não encontrada\"; rede, permissão, configuração e inesperado continuam erro",
    v({ erro: { tipo: "nao_encontrado", mensagem: "x" } }) === m.VAGA_INEXISTENTE &&
      ["rede", "permissao", "configuracao", "inesperado", "xpto"].every(
        (tipo) => v({ erro: { tipo, mensagem: "x" } }) === m.VAGA_ERRO,
      ) &&
      v({ erro: "nao_encontrado" }) === m.VAGA_ERRO &&
      v({ carregando: true, erro: { tipo: "nao_encontrado" } }) === m.VAGA_CARREGANDO,
  );
  afirmar(
    "a grafia do tipo `nao_encontrado` no módulo puro é a MESMA da camada de dados (`ERRO_NAO_ENCONTRADO`)",
    resultadoDaCamada !== null && m.TIPO_DE_ERRO_NAO_ENCONTRADO === resultadoDaCamada.ERRO_NAO_ENCONTRADO,
    `${m.TIPO_DE_ERRO_NAO_ENCONTRADO} | ${resultadoDaCamada?.ERRO_NAO_ENCONTRADO}`,
  );
  afirmar(
    "Aberta sem título (ausente, nulo, vazio ou em branco) é resposta inválida: erro de leitura, nunca um `<h1>` vazio",
    [undefined, null, "", "   ", 7].every((titulo) => v({ vaga: { situacao: e.SITUACAO_ABERTA, titulo } }) === m.VAGA_ERRO) &&
      v({ vaga: { situacao: e.SITUACAO_ABERTA, titulo: "Analista" } }) === m.VAGA_ABERTA,
  );
  afirmar(
    "Encerrada sem título continua Encerrada, com o título de reserva (a palavra do vocabulário, sem travessão); com título, o próprio",
    [undefined, null, "", "  "].every((titulo) => v({ vaga: { situacao: e.SITUACAO_ENCERRADA, titulo } }) === m.VAGA_ENCERRADA) &&
      [undefined, null, "", "  "].every(
        (titulo) => m.tituloDaVagaPublica({ situacao: e.SITUACAO_ENCERRADA, titulo }) === m.TITULO_DE_RESERVA_DA_ENCERRADA,
      ) &&
      typeof m.TITULO_DE_RESERVA_DA_ENCERRADA === "string" &&
      m.TITULO_DE_RESERVA_DA_ENCERRADA.trim() !== "" &&
      m.TITULO_DE_RESERVA_DA_ENCERRADA.includes(e.rotuloDoEstadoDaVaga("encerrada").toLowerCase()) &&
      !m.TITULO_DE_RESERVA_DA_ENCERRADA.includes("—") &&
      m.tituloDaVagaPublica({ situacao: e.SITUACAO_ENCERRADA, titulo: " Suporte " }) === "Suporte" &&
      m.tituloDaVagaPublica({ situacao: e.SITUACAO_ABERTA, titulo: "Analista" }) === "Analista" &&
      m.tituloDaVagaPublica({ situacao: e.SITUACAO_ABERTA, titulo: "" }) === "" &&
      m.tituloDaVagaPublica(null) === "",
    m.TITULO_DE_RESERVA_DA_ENCERRADA,
  );
  afirmar(
    "as falas da Vaga: \"Vaga não encontrada\" sem tentar de novo, o erro com tentar de novo e frase própria, a Encerrada com a palavra do vocabulário; Aberta e carregando não têm fala",
    m.falaDaVaga(m.VAGA_INEXISTENTE).oQueHouve === "Vaga não encontrada" &&
      m.falaDaVaga(m.VAGA_INEXISTENTE).repetir === false &&
      m.falaDaVaga(m.VAGA_ERRO).repetir === true &&
      m.falaDaVaga(m.VAGA_ERRO).oQueHouve !== m.falaDaVaga(m.VAGA_INEXISTENTE).oQueHouve &&
      m.falaDaVaga(m.VAGA_ENCERRADA).oQueHouve.includes(e.rotuloDoEstadoDaVaga("encerrada").toLowerCase()) &&
      lanca(() => m.falaDaVaga(m.VAGA_ABERTA)) &&
      lanca(() => m.falaDaVaga(m.VAGA_CARREGANDO)) &&
      lanca(() => m.falaDaVaga(undefined)),
  );
  let abertura = null;
  let abertasTortas = null;
  try {
    abertura = m.textoDaAbertura({ aberta_em: "2026-09-10T12:00:00Z" });
    abertasTortas = [
      m.textoDaAbertura({ aberta_em: "lixo" }),
      m.textoDaAbertura({ aberta_em: null }),
      m.textoDaAbertura({ aberta_em: 7 }),
      m.textoDaAbertura({ aberta_em: "  " }),
      m.textoDaAbertura(null),
      m.textoDaAbertura(undefined),
    ];
  } catch (erro) {
    afirmar("`textoDaAbertura` nunca lança", false, erro.message);
  }
  afirmar(
    "\"Aberta em <data>\" com a palavra do vocabulário e o dia no fuso de apresentação; data ruim ou ausente dá vazio, sem lançar",
    abertura === `${e.rotuloDoEstadoDaVaga("aberta")} em 10/09/2026` &&
      m.textoDaAbertura({ aberta_em: "2026-09-10T02:00:00Z" }) === `${e.rotuloDoEstadoDaVaga("aberta")} em 09/09/2026` &&
      Array.isArray(abertasTortas) &&
      abertasTortas.every((t) => t === ""),
    `${abertura} | ${JSON.stringify(abertasTortas)}`,
  );
  let modalidades = null;
  try {
    modalidades = [
      ...classificacoes.MODALIDADES.map((mo) => m.rotuloDaModalidadeProtegido(mo.valor) === mo.rotulo),
      ...["xpto", null, undefined, "", "constructor", "Remoto", 3].map((x) => m.rotuloDaModalidadeProtegido(x) === ""),
    ];
  } catch (erro) {
    afirmar("o rótulo protegido da Modalidade nunca lança", false, erro.message);
  }
  afirmar(
    "o rótulo da Modalidade é protegido: o do domínio para cada Modalidade, vazio (sem lançar) fora do vocabulário",
    Array.isArray(modalidades) && modalidades.every(Boolean),
  );
  afirmar(
    "o local da Vaga é o do domínio: Modalidade e Localização; Modalidade fora do vocabulário fica fora da frase, sem lançar",
    m.localDaVaga({ modalidade: "hibrido", localizacao: " Natal, RN " }) === "Híbrido · Natal, RN" &&
      m.localDaVaga({ modalidade: "remoto", localizacao: null }) === "Remoto" &&
      m.localDaVaga({ modalidade: "xpto", localizacao: "Natal, RN" }) === "Natal, RN" &&
      m.localDaVaga(null) === "",
  );
  afirmar(
    "`outrasVagas` tira a atual pelo Slug e o que não tem Slug, sem lançar para lista torta",
    igual(
      m.outrasVagas([{ slug: "a" }, { slug: "b" }, null, { slug: "" }, { titulo: "sem slug" }, { slug: "c" }], "b").map((x) => x.slug),
      ["a", "c"],
    ) &&
      igual(m.outrasVagas(null, "a"), []) &&
      igual(m.outrasVagas("não é lista", "a"), []) &&
      m.outrasVagas([{ slug: "a" }], undefined).length === 1,
  );
  const LINKS_RUINS = [
    "javascript:x",
    "JavaScript:alert(1)",
    "data:text/html,oi",
    "/candidatura",
    "https:x",
    "http:/x",
    "https:///x",
    "mailto:rh@exemplo.com",
    " https://exemplo.com",
    "",
    null,
    undefined,
    7,
    {},
  ];
  /* TROCA REGISTRADA (revisão da Story 5.7): o link aprovado volta
     NORMALIZADO (`new URL(link).href`), e não como veio; `http://exemplo.com`
     passou a `http://exemplo.com/`, e entrou o caso da caixa alta. */
  afirmar(
    "`linkDeCandidaturaSeguro` só devolve `http`/`https` absoluto (a regra do domínio), NORMALIZADO; `javascript:`, `data:`, relativo e o resto viram `null`",
    m.linkDeCandidaturaSeguro("https://exemplo.com/vaga?x=1") === "https://exemplo.com/vaga?x=1" &&
      m.linkDeCandidaturaSeguro("http://exemplo.com") === "http://exemplo.com/" &&
      m.linkDeCandidaturaSeguro("HTTPS://Exemplo.COM/Vaga") === "https://exemplo.com/Vaga" &&
      LINKS_RUINS.every((l) => m.linkDeCandidaturaSeguro(l) === null) &&
      LINKS_RUINS.every((l) => regrasDaVaga.linkDeCandidaturaValido(l) === false),
  );
  const cls = m.classificacoesDaVaga({
    departamento: " Atendimento ",
    departamento_cor: "var(--categoria-verde-bg)",
    tipo: "CLT",
    nivel: "Pleno",
    nivel_cor: "var(--cor-fora-da-paleta)",
  });
  afirmar(
    "as Classificações da Vaga: Departamento, Tipo e Nível na ordem, com o par de Cor da paleta por `style` (Tipo sem Cor; Cor fora da paleta cai na neutra)",
    igual(cls.map((c) => [c.chave, c.nome]), [["departamento", "Atendimento"], ["tipo", "CLT"], ["nivel", "Pleno"]]) &&
      cls[0].fundo === "var(--categoria-verde-bg)" &&
      cls[0].tinta === "var(--categoria-verde-ink)" &&
      cls[1].fundo === null &&
      cls[2].fundo === classificacoes.aparenciaDaCorDeClassificacao(null).fundo &&
      m.classificacoesDaVaga({ tipo: "PJ" }).length === 1 &&
      m.classificacoesDaVaga(null).length === 0,
    JSON.stringify(cls),
  );
  afirmar(
    "o endereço do cartão é `/carreiras/<slug>` (Slug codificado), e sem Slug não há endereço",
    m.enderecoDaVagaPublica({ slug: "analista-de-suporte" }) === "/carreiras/analista-de-suporte" &&
      m.enderecoDaVagaPublica({ slug: "" }) === null &&
      m.enderecoDaVagaPublica(null) === null,
  );
  const registrosDaFalha = [];
  const erroDoConsole = console.error;
  console.error = (...partes) => registrosDaFalha.push(partes);
  let falha = null;
  try {
    falha = m.falhaDeExcecao(new Error("TypeError: segredo interno em modulo.js"));
  } finally {
    console.error = erroDoConsole;
  }
  afirmar(
    "a falha de exceção tem tipo e frase fixos, e o texto cru da exceção fica só no `detalhe`",
    falha?.tipo === "inesperado" && !falha.mensagem.includes("segredo") && falha.detalhe.includes("segredo"),
  );
  afirmar(
    "e a falha de exceção é REGISTRADA uma vez no console, com o prefixo `[carreiras]` e a própria falha",
    registrosDaFalha.length === 1 &&
      typeof registrosDaFalha[0][0] === "string" &&
      registrosDaFalha[0][0].startsWith("[carreiras] ") &&
      registrosDaFalha[0].includes(falha),
    JSON.stringify(registrosDaFalha).slice(0, 200),
  );
  afirmar(
    "o nome acessível do Candidatar-se começa pelo texto visível, nomeia a Vaga e avisa da nova aba",
    m.rotuloDaCandidatura({ titulo: "Analista" }).startsWith(m.ROTULO_DA_CANDIDATURA) &&
      m.rotuloDaCandidatura({ titulo: "Analista" }).includes("Analista") &&
      /nova aba/.test(m.rotuloDaCandidatura({})) &&
      m.rotuloDoCartao({ titulo: "Analista" }).startsWith(m.ROTULO_DO_CARTAO),
  );
  const PALAVRAS_DE_ESTADO = e.ESTADOS_DA_VAGA.map((estado) => e.rotuloDoEstadoDaVaga(estado));
  const textos = Object.entries(m).filter(([, valor]) => typeof valor === "string");
  afirmar(
    "nenhum texto exportado pelo módulo puro tem travessão, e nenhum é uma palavra de Estado solta",
    textos.length > 10 &&
      textos.every(([, valor]) => !valor.includes("—")) &&
      textos.every(([, valor]) => !PALAVRAS_DE_ESTADO.includes(valor)),
    textos.filter(([, valor]) => valor.includes("—")).map(([k]) => k).join(", "),
  );
}

/* Revisão da Story 5.7: os NOMES de um `import { … } from "<origem>"` viram
   uma lista, e as checagens não dependem mais da ordem em que aparecem. */
function nomesImportadosDe(fonte, origem) {
  return [...fonte.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)]
    .filter((x) => x[2] === origem)
    .flatMap((x) => x[1].split(",").map((n) => n.trim().split(/\s+as\s+/)[0].trim()))
    .filter(Boolean);
}

/* ── Node: as funções que foram para o domínio ── */
{
  const r = regrasDaVaga;
  afirmar(
    "`textoDoLocal` e `enderecoPublicoDaVaga` moram em `domain/carreiras/vaga.js`, com o comportamento de antes",
    typeof r.textoDoLocal === "function" &&
      typeof r.enderecoPublicoDaVaga === "function" &&
      r.textoDoLocal({ modalidade: "hibrido", localizacao: "Natal, RN" }) === "Híbrido · Natal, RN" &&
      r.textoDoLocal({ modalidade: "voando", localizacao: "  " }) === "" &&
      r.textoDoLocal(undefined) === "" &&
      r.enderecoPublicoDaVaga({ estado: "aberta", slug: "vaga-x" }) === "/carreiras/vaga-x" &&
      r.enderecoPublicoDaVaga({ estado: "encerrada", slug: " vaga-y " }) === "/carreiras/vaga-y" &&
      r.enderecoPublicoDaVaga({ estado: "rascunho", slug: "x" }) === null &&
      r.enderecoPublicoDaVaga({ estado: "encerrada", slug: "" }) === null &&
      r.enderecoPublicoDaVaga({ estado: "xpto", slug: "x" }) === null &&
      r.enderecoPublicoDaVaga(null) === null,
  );
  const fonteDaListagem = semComentarios(ler(`${DIR_TELAS_DE_CARREIRAS}/listagem.js`) ?? "");
  afirmar(
    "autoteste: a leitura dos nomes importados não depende da ordem nem do espaço",
    igual(ordenado(nomesImportadosDe('import { b,\n a } from "x";', "x")), ["a", "b"]) &&
      igual(ordenado(nomesImportadosDe('import {a, b} from "x"; import { c } from "y";', "x")), ["a", "b"]) &&
      nomesImportadosDe('import { a } from "y";', "x").length === 0,
  );
  const doDominioNaListagem = nomesImportadosDe(fonteDaListagem, "../../domain/carreiras/vaga.js");
  afirmar(
    "a listagem do Painel importa as duas do domínio e não as declara mais (uma casa só)",
    listagemDeVagas !== null &&
      !("textoDoLocal" in listagemDeVagas) &&
      !("enderecoPublicoDaVaga" in listagemDeVagas) &&
      doDominioNaListagem.includes("enderecoPublicoDaVaga") &&
      doDominioNaListagem.includes("textoDoLocal") &&
      !/function\s+(textoDoLocal|enderecoPublicoDaVaga)\b/.test(fonteDaListagem),
    doDominioNaListagem.join(", "),
  );
}

/* ── Estática ── */
{
  const fontes = Object.fromEntries(PAGINAS_DE_CARREIRAS.map((c) => [c, ler(c)]));
  afirmar(
    "as páginas públicas de Carreiras existem para serem varridas",
    PAGINAS_DE_CARREIRAS.every((c) => typeof fontes[c] === "string" && fontes[c] !== ""),
    PAGINAS_DE_CARREIRAS.filter((c) => !fontes[c]).join(", "),
  );
  const codigo = (c) => semComentarios(fontes[c] ?? "");

  /* AD-8: ninguém escreve no `<head>`. */
  const TOCA_O_HEAD = [
    /\bdocument\s*\.\s*(title|head)\b/,
    /\bdocument\s*\[/,
    /<\s*(meta|title|link|script)\b/,
    /createElement\(\s*["'`](meta|title|link|script)["'`]/i,
    /\bcanonical\b/i,
    /\bhelmet\b/i,
    /querySelector(All)?\(\s*["'`][^"'`]*\b(meta|link|title)\b/i,
  ];
  const tocaOHead = (texto) => TOCA_O_HEAD.some((padrao) => padrao.test(texto));
  afirmar(
    "autoteste: o detector de AD-8 acusa título, `head`, meta, canônica, `createElement` e Helmet, e absolve o `<Link>` do roteador e o título da Vaga",
    tocaOHead('document.title = "x";') &&
      tocaOHead("document.head.appendChild(m);") &&
      tocaOHead('document["title"] = "x";') &&
      tocaOHead('<meta name="description" content="x" />') &&
      tocaOHead('<link rel="canonical" href="x" />') &&
      tocaOHead('const m = document.createElement("meta");') &&
      tocaOHead('document.querySelector(\'link[rel="canonical"]\')') &&
      tocaOHead('import { Helmet } from "react-helmet-async";') &&
      tocaOHead("<title>{vaga.titulo}</title>") &&
      !tocaOHead('<Link to="/carreiras">Ver</Link>') &&
      !tocaOHead("<h1>{vaga.titulo}</h1>") &&
      !tocaOHead("const metade = 2; window.scrollTo({ top: 0 });"),
  );
  const noHead = PAGINAS_DE_CARREIRAS.filter((c) => tocaOHead(codigo(c)));
  afirmar(
    "AD-8: nenhuma página de Carreiras toca `document.title`, `document.head`, meta ou `link rel=canonical`",
    noHead.length === 0,
    noHead.join(", "),
  );

  /* Dados: só as duas leituras públicas, pelo apelido exato. */
  const importsDeDados = [];
  for (const c of PAGINAS_DE_CARREIRAS) {
    for (const m of codigo(c).matchAll(/import\s*(\{[^}]*\}|[\w$]+|\*\s*as\s+[\w$]+)\s*from\s*["'`]([^"'`]+)["'`]/g)) {
      if (/(^|\/)data\/|supabase/.test(m[2])) importsDeDados.push({ arquivo: c, nomes: m[1], origem: m[2] });
    }
    for (const origem of origensDeImport(codigo(c))) {
      if (/(^|\/)data\/|supabase/.test(origem) && !importsDeDados.some((i) => i.arquivo === c && i.origem === origem)) {
        importsDeDados.push({ arquivo: c, nomes: "?", origem });
      }
    }
  }
  const nomesDe = (i) => i.nomes.replace(/[{}]/g, "").split(",").map((n) => n.trim()).filter(Boolean);
  afirmar(
    "as páginas leem dados SÓ de `@/data/carreiras/leitura`, e só `listarVagasAbertas` e `lerSituacaoDaVaga` (nunca as leituras do Painel)",
    importsDeDados.length === 2 &&
      importsDeDados.every((i) => i.origem === "@/data/carreiras/leitura") &&
      importsDeDados.every((i) => nomesDe(i).every((n) => n === "listarVagasAbertas" || n === "lerSituacaoDaVaga")) &&
      nomesDe(importsDeDados.find((i) => i.arquivo === "src/pages/Carreiras.jsx") ?? { nomes: "" }).join() === "listarVagasAbertas" &&
      igual(
        ordenado(nomesDe(importsDeDados.find((i) => i.arquivo === "src/pages/VagaPublica.jsx") ?? { nomes: "" })),
        ["lerSituacaoDaVaga", "listarVagasAbertas"],
      ) &&
      !PAGINAS_DE_CARREIRAS.some((c) => /\b\w+DoPainel\w*\b|\bfetch\s*\(|XMLHttpRequest/.test(codigo(c))),
    JSON.stringify(importsDeDados),
  );

  const ARMAZENAMENTO = /\b(localStorage|sessionStorage|indexedDB)\b|document\.cookie/;
  afirmar(
    "autoteste: o detector de armazenamento acusa `localStorage`, `sessionStorage`, `indexedDB` e cookie, e absolve um Map",
    ARMAZENAMENTO.test("localStorage.getItem(k)") &&
      ARMAZENAMENTO.test("sessionStorage.x") &&
      ARMAZENAMENTO.test("indexedDB.open(n)") &&
      ARMAZENAMENTO.test("document.cookie") &&
      !ARMAZENAMENTO.test("memoria.get(chave)"),
  );
  const guardam = PAGINAS_DE_CARREIRAS.filter((c) => ARMAZENAMENTO.test(codigo(c)));
  afirmar("nenhuma página de Carreiras usa armazenamento do navegador", guardam.length === 0, guardam.join(", "));

  /* TROCA REGISTRADA (revisão da Story 5.7): antes o detector só pegava a
     palavra SOZINHA entre aspas ou entre `>` e `<`, e deixava passar
     "Aberta em", `Aberta em ${…}` e {"Encerrada."}. Agora é a palavra do
     vocabulário (com a caixa do rótulo) como PALAVRA INTEIRA em qualquer lugar
     do código sem comentários: nenhum identificador a contém isolada
     (`SITUACAO_ABERTA`, `ehAberta` e `VAGA_ENCERRADA` não casam). */
  const PALAVRA_A_MAO = new RegExp(
    `(?<![\\w$])(${estadosDaVaga.ESTADOS_DA_VAGA.map((x) => estadosDaVaga.rotuloDoEstadoDaVaga(x)).join("|")})(?![\\w$])`,
    "u",
  );
  afirmar(
    "autoteste: o detector de palavra de Estado à mão acusa \"Aberta\", \">Encerrada<\", \"Aberta em\", `Aberta em ${…}`, {\"Encerrada.\"} e a palavra no meio de um texto, e absolve o vocabulário e os identificadores",
    PALAVRA_A_MAO.test('const x = "Aberta";') &&
      PALAVRA_A_MAO.test("<span>Encerrada</span>") &&
      PALAVRA_A_MAO.test('const x = "Aberta em";') &&
      PALAVRA_A_MAO.test("const x = `Aberta em ${data}`;") &&
      PALAVRA_A_MAO.test('<p>{"Encerrada."}</p>') &&
      PALAVRA_A_MAO.test("<p>Esta vaga está Encerrada agora</p>") &&
      PALAVRA_A_MAO.test("const x = 'Rascunho';") &&
      !PALAVRA_A_MAO.test('rotuloDoEstadoDaVaga("aberta")') &&
      !PALAVRA_A_MAO.test("situacao === SITUACAO_ABERTA || x === VAGA_ENCERRADA") &&
      !PALAVRA_A_MAO.test("const ehAberta = ehEncerrada && $Rascunho;") &&
      !PALAVRA_A_MAO.test("const x = `Vaga ${rotuloDoEstadoDaVaga(\"encerrada\").toLowerCase()}`;"),
  );
  afirmar(
    "as palavras de Estado que as páginas mostram vêm do domínio: o módulo puro chama `rotuloDoEstadoDaVaga` para \"Aberta\" e para \"Encerrada\"",
    /rotuloDoEstadoDaVaga\(\s*"aberta"\s*\)/.test(codigo("src/pages/carreirasPublico.js")) &&
      /rotuloDoEstadoDaVaga\(\s*"encerrada"\s*\)/.test(codigo("src/pages/carreirasPublico.js")) &&
      origensDeImport(codigo("src/pages/carreirasPublico.js")).includes("../domain/carreiras/estados.js"),
  );
  const escrevem = PAGINAS_DE_CARREIRAS.filter((c) => PALAVRA_A_MAO.test(codigo(c)));
  afirmar("nenhuma página de Carreiras escreve a palavra de Estado à mão", escrevem.length === 0, escrevem.join(", "));
  const comTravessao = PAGINAS_DE_CARREIRAS.filter((c) => codigo(c).includes("—"));
  afirmar("nenhuma página de Carreiras tem travessão fora de comentário", comTravessao.length === 0, comTravessao.join(", "));

  /* O `<h1>` por POSIÇÃO: cada um num `return` diferente, e nenhum nos cartões. */
  const pagina = codigo("src/pages/VagaPublica.jsx");
  const aberturasDeH1 = [...pagina.matchAll(/<(motion\.)?h1\b/g)].map((x) => x.index);
  const retornos = [...pagina.matchAll(/\breturn\s*\(/g)].map((x) => x.index);
  const emRetornosDistintos = aberturasDeH1.every((pos, i) =>
    i === 0 ? true : retornos.some((r) => r > aberturasDeH1[i - 1] && r < pos),
  );
  afirmar(
    "`VagaPublica.jsx` tem TRÊS `<h1>` (Encerrada, Aberta e a situação ruim), cada um depois de um `return` próprio",
    aberturasDeH1.length === 3 && emRetornosDistintos,
    `h1 em ${aberturasDeH1.join(", ")} | return em ${retornos.join(", ")}`,
  );
  /* TROCA REGISTRADA (revisão da Story 5.7): a asserção que casava a FORMA
     dos `if (situacao === …) { return (` saiu daqui. A exclusão mútua das
     telas passou a ser OBSERVADA na montagem ("cada tela da Vaga montada tem
     um corpo só, o da situação"), em toda tela de todo caso. */
  const carreiras = codigo("src/pages/Carreiras.jsx");
  afirmar(
    "`Carreiras.jsx` continua com UM `<h1>` (o do hero), e os cartões e o vazio não têm `h1`",
    (carreiras.match(/<(motion\.)?h1\b/g) ?? []).length === 1 &&
      !/<(motion\.)?h1\b|["'`]h1["'`]/.test(codigo("src/pages/CartaoDeVaga.jsx") + codigo("src/pages/SemVagasAbertas.jsx")),
  );

  /* `.artigo` literal, no MESMO elemento da injeção. */
  const injecoes = [...pagina.matchAll(/<div\b[^>]*dangerouslySetInnerHTML[^>]*\/>/g)].map((x) => x[0]);
  afirmar(
    "a Descrição é injetada UMA vez, num `<div className=\"artigo\">` com `artigo` literal (nunca por variável)",
    (pagina.match(/dangerouslySetInnerHTML/g) ?? []).length === 1 &&
      injecoes.length === 1 &&
      /className="artigo"/.test(injecoes[0]) &&
      /dangerouslySetInnerHTML=\{\{\s*__html:\s*html\s*\}\}/.test(injecoes[0]) &&
      PAGINAS_DE_CARREIRAS.filter((c) => c !== "src/pages/VagaPublica.jsx").every((c) => !/dangerouslySetInnerHTML/.test(codigo(c))),
    injecoes.join(" | "),
  );

  /* TROCA REGISTRADA (revisão da Story 5.7): saiu o casamento do texto
     `situacaoDaLista({ carregando, erro, vagas })`. Que a lista decide pela
     função pura passou a ser OBSERVADO na montagem ("as quatro situações da
     lista foram vistas montadas, cada uma com só o seu conteúdo"). */
  afirmar(
    "`Carreiras.jsx` sem `nivelColors` e sem o ramo morto (`vaga.accent`), com o hero, os benefícios e o convite final",
    !/\bnivelColors\b|\bvaga\.accent\b|\bvaga\.bg\b/.test(carreiras) &&
      /Construa o futuro do/.test(carreiras) &&
      /const beneficios = \[/.test(carreiras) &&
      /Não encontrou/.test(carreiras),
  );
  /* O WhatsApp do currículo numa fonte só.
     TROCA REGISTRADA (revisão da Story 5.8): o dono era o módulo puro da
     página (`carreirasPublico.js`); passou a ser o domínio (`vaga.js`),
     porque o HTML Servido da listagem vazia também oferece o currículo e o
     servidor não importa `src/pages`. A varredura cresceu para as páginas, o
     domínio de Carreiras e a página servida; o módulo puro só reexporta.
     TROCA REGISTRADA (2026-09-29, merge da `main`): o site passou a ter UM
     endereço de WhatsApp, o link do Tintim em `src/domain/whatsapp.js`.
     Agora NENHUM arquivo de Carreiras escreve endereço de WhatsApp à mão, e o
     do currículo é exatamente `LINK_DO_WHATSAPP`. */
  const ONDE_O_NUMERO_PODE_ESTAR = [
    ...PAGINAS_DE_CARREIRAS,
    ...readdirSync(path.join(raiz, "src", "domain", "carreiras"))
      .filter((n) => n.endsWith(".js"))
      .map((n) => `src/domain/carreiras/${n}`),
    "api/_nucleo/paginaDeCarreiras.js",
  ];
  const comONumero = ONDE_O_NUMERO_PODE_ESTAR.filter((c) =>
    /5584998900718|api\.whatsapp\.com|wa\.me\/|tintim\.link/.test(semComentarios(ler(c) ?? "")),
  );
  afirmar(
    "o endereço do currículo é o `LINK_DO_WHATSAPP` do site, nenhum arquivo de Carreiras escreve endereço de WhatsApp à mão, o módulo puro o reexporta, e `Carreiras.jsx` usa a constante no convite final",
    comONumero.length === 0 &&
      typeof LINK_DO_WHATSAPP === "string" &&
      LINK_DO_WHATSAPP !== "" &&
      regrasDaVaga.ENDERECO_DO_CURRICULO === LINK_DO_WHATSAPP &&
      carreirasPublico?.ENDERECO_DO_CURRICULO === regrasDaVaga.ENDERECO_DO_CURRICULO &&
      nomesImportadosDe(carreiras, "./carreirasPublico").includes("ENDERECO_DO_CURRICULO") &&
      /href=\{ENDERECO_DO_CURRICULO\}/.test(carreiras),
    comONumero.join(", "),
  );

  const main = semComentarios(ler("src/main.jsx") ?? "");
  /* Revisão da Story 5.7: cada rota de referência TEM de ser achada; um
     `indexOf` que dá -1 não pode fazer a comparação passar. */
  const posicoesDaRota = {
    vaga: main.indexOf('<Route path="/carreiras/:slug" element={<VagaPublica />} />'),
    lista: main.indexOf('<Route path="/carreiras" element={<Carreiras />} />'),
    admin: main.indexOf('path="/admin"'),
  };
  const rotaEmOrdem = (p) =>
    Object.values(p).every((x) => x !== -1) && p.lista < p.vaga && p.vaga < p.admin;
  afirmar(
    "autoteste: a ordem da rota falha quando qualquer rota de referência não é achada",
    rotaEmOrdem({ vaga: 20, lista: 10, admin: 30 }) &&
      !rotaEmOrdem({ vaga: 20, lista: -1, admin: 30 }) &&
      !rotaEmOrdem({ vaga: -1, lista: 10, admin: 30 }) &&
      !rotaEmOrdem({ vaga: 20, lista: 10, admin: -1 }) &&
      !rotaEmOrdem({ vaga: 10, lista: 20, admin: 30 }),
  );
  afirmar(
    "a rota `/carreiras/:slug` monta `VagaPublica`, entre as públicas (depois de `/carreiras`) e FORA do bloco `/admin`",
    rotaEmOrdem(posicoesDaRota) && /import VagaPublica from "\.\/pages\/VagaPublica\.jsx";/.test(main),
    JSON.stringify(posicoesDaRota),
  );
}

/* Dois descritores de propriedade iguais (valor pelo Object.is). */
function mesmoDescritor(a, b) {
  if (a === undefined || b === undefined) return a === b;
  return (
    Object.is(a.value, b.value) &&
    a.get === b.get &&
    a.set === b.set &&
    a.writable === b.writable &&
    a.enumerable === b.enumerable &&
    a.configurable === b.configurable
  );
}

/* ── As páginas montadas ── */
{
  const { writeFileSync, rmSync } = await import("node:fs");
  const montagem = await import("./montagem-comum.mjs");
  const pasta = montagem.criarPastaDeCompilacao("verificar-carreiras-site-");

  /* O dublê captura a resposta NO MOMENTO do pedido (como a rede real: a
     resposta é a do pedido, não a do instante em que chega), e pode SEGURAR
     um pedido: todos (`segurarLista`, `segurarSituacao`) ou só o de um Slug
     (`segurarSituacaoDe`). É por ele que as corridas são observadas. */
  const arquivoDaLeitura = path.join(pasta, "duble-leitura-publica.js");
  writeFileSync(
    arquivoDaLeitura,
    `export { ERRO_NAO_ENCONTRADO } from ${montagem.caminhoDeModulo("src/data/blog/resultado.js")};
export const controle = {
  lista: null,
  situacoes: {},
  pedidosDaLista: 0,
  pedidosDaSituacao: [],
  segurarLista: null,
  segurarSituacao: null,
  segurarSituacaoDe: {},
  lancarLista: false,
  lancarSituacao: false,
  proibidas: [],
};
const copia = (v) => JSON.parse(JSON.stringify(v));
export async function listarVagasAbertas() {
  controle.pedidosDaLista += 1;
  const lancar = controle.lancarLista;
  const r = copia((typeof controle.lista === "function" ? controle.lista() : controle.lista) ?? { ok: true, dados: [] });
  const porta = controle.segurarLista;
  if (porta) await porta;
  if (lancar) throw new Error("dublê: a lista lançou");
  return r;
}
export async function lerSituacaoDaVaga(slug) {
  controle.pedidosDaSituacao.push(slug);
  const lancar = controle.lancarSituacao;
  const r = copia(
    Object.hasOwn(controle.situacoes, slug)
      ? controle.situacoes[slug]
      : { ok: true, dados: { situacao: "inexistente", slug: null, titulo: null } },
  );
  const porta = Object.hasOwn(controle.segurarSituacaoDe, slug) ? controle.segurarSituacaoDe[slug] : controle.segurarSituacao;
  if (porta) await porta;
  if (lancar) throw new Error("dublê: a situação lançou");
  return r;
}
const proibida = (nome) => async () => {
  controle.proibidas.push(nome);
  return { ok: false, erro: { tipo: "inesperado", mensagem: "proibida" } };
};
export const listarVagasDoPainel = proibida("listarVagasDoPainel");
export const lerVagaDoPainelPorId = proibida("lerVagaDoPainelPorId");
export const listarClassificacoesDoPainel = proibida("listarClassificacoesDoPainel");
export const listarClassificacoes = proibida("listarClassificacoes");
`,
  );

  const fonte =
    `export { default as Carreiras } from ${montagem.caminhoDeModulo("src/pages/Carreiras.jsx")};\n` +
    `export { default as VagaPublica } from ${montagem.caminhoDeModulo("src/pages/VagaPublica.jsx")};\n` +
    /* 2026-09-29: o `AnimatedRoutes` REAL, que envolve as rotas em `main.jsx`.
       As páginas montadas só num `<Routes>` escondiam o defeito de que, dentro
       dele, o tipo de navegação é sempre "POP". */
    `export { default as AnimatedRoutes } from ${montagem.caminhoDeModulo("src/components/animated/AnimatedRoutes.jsx")};\n` +
    `export { navegacaoVista } from ${montagem.caminhoDeModulo("src/components/animated/navegacaoReal.js")};\n` +
    `export { controle as controleDaLeitura } from ${montagem.comoModulo(arquivoDaLeitura)};\n`;

  let compilado = null;
  try {
    compilado = await montagem.compilarParaNode({
      pasta,
      fonte,
      alias: { "@/data/carreiras/leitura": arquivoDaLeitura },
    });
  } catch (erro) {
    afirmar("`Carreiras` e `VagaPublica` compilam pelo empacotador da aplicação", false, erro?.message ?? String(erro));
  }

  if (compilado !== null) {
    afirmar("`Carreiras` e `VagaPublica` compilam pelo empacotador da aplicação", true);

    /* Revisão da Story 5.7: o retrato de TODOS os globais antes da montagem,
       para o `finally` devolver cada um como achou (e apagar o que ela criou). */
    const globaisAntes = new Map(
      Object.getOwnPropertyNames(globalThis).map((nome) => [nome, Object.getOwnPropertyDescriptor(globalThis, nome)]),
    );
    const erroOriginal = console.error;

    const janela = montagem.montarNavegador({ url: "https://site.local/carreiras" });
    /* Como nas seções (p) e (q): religa à janela nova os nomes que um
       navegador de mentira anterior já deixou em `globalThis`. */
    for (const nome of [
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "getComputedStyle",
      "HTMLElement",
      "HTMLInputElement",
      "HTMLButtonElement",
      "HTMLAnchorElement",
      "Element",
      "Node",
      "DocumentFragment",
    ]) {
      const valor = typeof janela[nome] === "function" && /^[a-z]/.test(nome) ? janela[nome].bind(janela) : janela[nome];
      if (valor !== undefined) {
        Object.defineProperty(globalThis, nome, { value: valor, configurable: true, writable: true });
      }
    }
    /* A página anima com `whileInView`, e a barra observa o hero: os dois
       pedem `IntersectionObserver`, que o jsdom não tem. Inerte de propósito:
       o que se verifica é o conteúdo, não a animação. */
    class ObservadorInerte {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    janela.IntersectionObserver = ObservadorInerte;
    Object.defineProperty(globalThis, "IntersectionObserver", { value: ObservadorInerte, configurable: true, writable: true });
    /* A rolagem, registrada com os ARGUMENTOS: é por ela que "ir a uma Vaga
       sobe ao topo" e "voltar não força o topo" são observados, e o jsdom não
       a implementa. `modoDaRolagem` simula o navegador que recusa a forma com
       objeto (a página tem de cair na de reserva) e o que não rola nunca. */
    const rolagemDaJanelaAntes = janela.scrollTo;
    const rolagens = [];
    let modoDaRolagem = "normal";
    janela.scrollTo = (...args) => {
      if (modoDaRolagem === "sempre-lanca") throw new Error("dublê: este navegador não rola");
      if (modoDaRolagem === "recusa-objeto" && args[0] !== null && typeof args[0] === "object") {
        throw new TypeError("dublê: forma com objeto recusada");
      }
      rolagens.push(args);
    };
    const subiuAoTopo = () => rolagens.some((a) => a[0]?.top === 0 && a[0]?.behavior === "instant");

    const reclamacoes = [];
    console.error = (...partes) => reclamacoes.push(partes.map(String).join(" "));

    try {
      const modulo = await import(pathToFileURL(compilado.arquivo).href);
      const React = (await import("react")).default;
      const { act } = await import("react");
      const { createRoot } = await import("react-dom/client");
      const roteador = await import("react-router-dom");
      Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, configurable: true, writable: true });
      const h = React.createElement;
      const leitura = modulo.controleDaLeitura;
      const m = carreirasPublico;

      const TITULO_DO_DOCUMENTO = "Título que a página não pode mexer";
      janela.document.title = TITULO_DO_DOCUMENTO;
      const cabecaAntes = janela.document.head.innerHTML;
      const headIntacto = () =>
        janela.document.title === TITULO_DO_DOCUMENTO &&
        janela.document.head.innerHTML === cabecaAntes &&
        janela.document.querySelector('link[rel="canonical"]') === null;

      const A = {
        situacao: "aberta",
        id: "20000000-0000-4000-8000-000000000001",
        slug: "analista-de-suporte",
        titulo: "Analista de Suporte",
        resumo: "Atender clientes pelo WhatsApp com a ChatClean.",
        descricao_html: "<h2>O que você vai fazer</h2><p>Atender <strong>clientes</strong> todo dia.</p><ul><li><p>Um</p></li></ul>",
        departamento: "Atendimento",
        departamento_cor: "var(--categoria-verde-bg)",
        tipo: "CLT",
        equivalente_jobposting: "FULL_TIME",
        nivel: "Pleno",
        nivel_cor: "var(--categoria-azul-bg)",
        modalidade: "hibrido",
        localizacao: "Natal, RN",
        link_de_candidatura: "https://exemplo.com/candidatura/a",
        aberta_em: "2026-09-10T12:00:00Z",
        atualizado_em: "2026-09-12T12:00:00Z",
      };
      const B = {
        ...A,
        id: "20000000-0000-4000-8000-000000000002",
        slug: "desenvolvedora-front-end",
        titulo: "Desenvolvedora Front-end",
        resumo: "Construir o Painel.",
        departamento: "Tecnologia",
        departamento_cor: "var(--categoria-azul-bg)",
        tipo: "PJ",
        nivel: "Sênior",
        nivel_cor: "var(--categoria-roxo-bg)",
        modalidade: "remoto",
        localizacao: null,
        link_de_candidatura: "https://exemplo.com/candidatura/b",
      };
      const daLista = (v) =>
        Object.fromEntries(Object.entries(v).filter(([c]) => c !== "descricao_html" && c !== "link_de_candidatura"));
      const ABERTAS = [daLista(B), daLista(A)];
      const ENCERRADA = { situacao: "encerrada", slug: "suporte-noturno", titulo: "Suporte Noturno" };
      const SEM_CAMPOS = Object.fromEntries(estadosDaVaga.CAMPOS_SO_DA_ABERTA.map((c) => [c, null]));
      const situacaoDe = (dados) => ({ ok: true, dados: { ...SEM_CAMPOS, ...dados } });
      const FALHA_DE_REDE = { ok: false, erro: { tipo: "rede", mensagem: "sem rede" } };

      const passo = async () => {
        await act(async () => {
          await new Promise((resolver) => setTimeout(resolver, 0));
        });
      };
      const esperarAte = async (condicao, descricao, prazo = 4000) => {
        const limite = Date.now() + prazo;
        for (;;) {
          await passo();
          let pronto = false;
          try {
            pronto = Boolean(condicao());
          } catch {
            pronto = false;
          }
          if (pronto) return true;
          if (Date.now() > limite) {
            afirmar(`espera com prazo: ${descricao} (${prazo} ms)`, false);
            return false;
          }
        }
      };
      /* Segura os próximos pedidos (todos, ou os de um Slug) até `soltar()`. */
      const segurar = (chave, slug = null) => {
        let soltar = null;
        const porta = new Promise((resolver) => {
          soltar = resolver;
        });
        if (slug === null) leitura[chave] = porta;
        else leitura.segurarSituacaoDe[slug] = porta;
        return () => {
          if (slug === null) leitura[chave] = null;
          else delete leitura.segurarSituacaoDe[slug];
          soltar();
        };
      };
      const focado = () => janela.document.activeElement;

      /* A ponte com o roteador: navegar de fora (ida e volta do navegador). */
      const ponte = { navegar: null };
      function Onde() {
        const local = roteador.useLocation();
        const navegar = roteador.useNavigate();
        React.useEffect(() => {
          ponte.navegar = navegar;
        }, [navegar]);
        return h("span", { "data-onde": local.pathname });
      }

      /* ── O que se observa em TODA tela montada ──
         Revisão da Story 5.7: estas observações substituem as regex que
         casavam a forma do código (`if (situacao === …) { return (` e
         `situacaoDaLista({ carregando, erro, vagas })`). */
      const vistasDaVaga = new Map(m.SITUACOES_DA_VAGA_PUBLICA.map((s) => [s, { vezes: 0, falhas: [] }]));
      const recuos = new Map();
      const conferirVaga = (tela, momento) => {
        const s = tela.situacao();
        if (s === null) return;
        const registro = vistasDaVaga.get(s);
        if (registro === undefined) {
          afirmar(`${tela.caso}: a situação da Vaga montada é do vocabulário`, false, String(s));
          return;
        }
        registro.vezes += 1;
        const principais = tela.todos("main");
        const corpos = tela.todos("[data-corpo]");
        const h1s = tela.todos("h1");
        const esperados = s === m.VAGA_CARREGANDO ? 0 : 1;
        const problemas = [];
        if (principais.length !== 1) problemas.push(`${principais.length} <main>`);
        if (corpos.length !== 1) problemas.push(`${corpos.length} corpos`);
        else if (corpos[0].getAttribute("data-corpo") !== s) problemas.push(`corpo ${corpos[0].getAttribute("data-corpo")}`);
        if (principais.length === 1 && corpos.length === 1 && !principais[0].contains(corpos[0])) problemas.push("corpo fora do <main>");
        if (h1s.length !== esperados) problemas.push(`${h1s.length} <h1>`);
        if (!h1s.every((x) => principais[0]?.contains(x))) problemas.push("<h1> fora do <main>");
        if (!h1s.every((x) => x.getAttribute("tabindex") === "-1")) problemas.push("<h1> sem tabIndex -1");
        if (!h1s.every((x) => (x.textContent ?? "").trim() !== "")) problemas.push("<h1> vazio");
        if (s !== m.VAGA_ABERTA && (tela.q(".artigo") !== null || tela.candidatar().length > 0)) problemas.push("Descrição ou Candidatar-se fora da Aberta");
        const recuo = (corpos[0]?.getAttribute("class") ?? "").match(/(?:^|\s)(pt-\d+)(?:\s|$)/)?.[1] ?? null;
        if (!recuos.has(s)) recuos.set(s, recuo);
        if (problemas.length > 0) registro.falhas.push(`${tela.caso} (${momento}): ${problemas.join(", ")}`);
      };
      const vistasDaLista = new Map(m.SITUACOES_DA_LISTA.map((s) => [s, { vezes: 0, falhas: [] }]));
      const conferirLista = (tela, momento) => {
        const s = tela.lista();
        if (s === null) return;
        const registro = vistasDaLista.get(s);
        if (registro === undefined) {
          afirmar(`${tela.caso}: a situação da lista montada é do vocabulário`, false, String(s));
          return;
        }
        registro.vezes += 1;
        const presentes = {
          [m.LISTA_CARREGANDO]: tela.q('[data-estado-da-lista] [data-papel="esqueleto"]') !== null,
          [m.LISTA_ERRO]: tela.q('[data-estado-da-lista] [data-papel="erro"]') !== null,
          [m.LISTA_VAZIA]: tela.q('[data-estado-da-lista] [data-papel="sem-vagas"]') !== null,
          [m.LISTA_PRONTA]: tela.todos("[data-estado-da-lista] article[data-vaga]").length > 0,
        };
        const errados = Object.entries(presentes).filter(([chave, ha]) => ha !== (chave === s)).map(([chave]) => chave);
        if (errados.length > 0) registro.falhas.push(`${tela.caso} (${momento}): ${errados.join(", ")}`);
      };
      const conferir = (tela, momento) => {
        conferirVaga(tela, momento);
        conferirLista(tela, momento);
      };

      const montar = async (caminho, { caso, ateQue = null, registra = false, comAnimatedRoutes = false } = {}) => {
        const alvo = janela.document.createElement("div");
        janela.document.body.appendChild(alvo);
        const raizReact = createRoot(alvo);
        const inicioDasReclamacoes = reclamacoes.length;
        await act(async () => {
          raizReact.render(
            h(
              roteador.MemoryRouter,
              { initialEntries: [caminho] },
              h(Onde),
              h(
                /* Com `comAnimatedRoutes`, as rotas vão dentro do
                   `AnimatedRoutes` real, como em `main.jsx` (2026-09-29). */
                comAnimatedRoutes ? modulo.AnimatedRoutes : roteador.Routes,
                null,
                h(roteador.Route, { path: "/carreiras", element: h(modulo.Carreiras) }),
                h(roteador.Route, { path: "/carreiras/:slug", element: h(modulo.VagaPublica) }),
              ),
            ),
          );
        });
        const tela = {
          caso,
          alvo,
          q: (s) => alvo.querySelector(s),
          todos: (s) => [...alvo.querySelectorAll(s)],
          texto: () => alvo.textContent ?? "",
          onde: () => alvo.querySelector("[data-onde]")?.getAttribute("data-onde") ?? null,
          lista: () => alvo.querySelector("[data-estado-da-lista]")?.getAttribute("data-estado-da-lista") ?? null,
          situacao: () => alvo.querySelector('[data-tela="vaga-publica"]')?.getAttribute("data-situacao") ?? null,
          h1s: () => [...alvo.querySelectorAll("h1")].map((x) => (x.textContent ?? "").trim()),
          cartoes: () => [...alvo.querySelectorAll("article[data-vaga]")].map((x) => x.getAttribute("data-vaga")),
          candidatar: () => [...alvo.querySelectorAll('a[data-acao="candidatar"]')],
          async clicar(elemento, nome, ateQueClique) {
            if (!elemento) {
              afirmar(`${caso}: o elemento "${nome}" existe para ser clicado`, false);
              return false;
            }
            await act(async () => {
              elemento.dispatchEvent(new janela.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
            });
            const assentou = await esperarAte(ateQueClique, `${caso}: a tela assenta depois de clicar em ${nome}`);
            conferir(tela, `depois de ${nome}`);
            return assentou;
          },
          async ir(destino, ateQueChegue) {
            if (typeof ponte.navegar !== "function") {
              afirmar(`${caso}: a ponte com o roteador existe`, false);
              return false;
            }
            await act(async () => {
              ponte.navegar(destino);
            });
            const assentou = await esperarAte(ateQueChegue, `${caso}: a tela assenta depois de navegar para ${destino}`);
            conferir(tela, `depois de navegar para ${destino}`);
            return assentou;
          },
          async desmontar() {
            conferir(tela, "no fim");
            /* Revisão da Story 5.7: o `<head>` é conferido com a tela AINDA
               montada (o fim do caso), e de novo depois do desmonte. */
            const headComATela = headIntacto();
            await act(async () => raizReact.unmount());
            await passo();
            alvo.remove();
            const doCaso = reclamacoes.slice(inicioDasReclamacoes);
            const registros = doCaso.filter((r) => r.startsWith("[carreiras] "));
            const outras = doCaso.filter((r) => !r.startsWith("[carreiras] "));
            afirmar(
              `${caso}: o React não reclamou de nada, o \`<head>\` ficou intacto no fim do caso e depois do desmonte (título, canônica, metas), e ${
                registra ? "a exceção da camada foi REGISTRADA com `[carreiras]`" : "nada foi registrado como falha"
              }`,
              outras.length === 0 && headComATela && headIntacto() && (registra ? registros.length > 0 : registros.length === 0),
              `${outras.slice(0, 2).map((r) => r.slice(0, 300)).join(" | ")} | registros ${registros.length} | título: ${janela.document.title}`,
            );
          },
        };
        if (ateQue !== null) await esperarAte(ateQue, `${caso}: a tela monta e assenta em ${caminho}`);
        conferir(tela, "ao montar");
        return tela;
      };

      /* ══ /carreiras: carregando ══ */
      {
        leitura.lista = { ok: true, dados: ABERTAS };
        const soltar = segurar("segurarLista");
        const tela = await montar("/carreiras", { caso: "Lista carregando", ateQue: () => true });
        await passo();
        conferir(tela, "segurada");
        afirmar(
          "Lista carregando: esqueleto com o texto sr-only (em `role=status`), sem cartão e sem o vazio",
          tela.lista() === m.LISTA_CARREGANDO &&
            (tela.q('[data-estado-da-lista] [role="status"]')?.textContent ?? "") === m.TEXTO_DE_CARREGANDO_A_LISTA &&
            String(tela.q('[data-estado-da-lista] [role="status"]')?.getAttribute("class")).includes("sr-only") &&
            tela.q('[data-papel="esqueleto"]') !== null &&
            tela.cartoes().length === 0 &&
            tela.q('[data-papel="sem-vagas"]') === null,
          tela.lista(),
        );
        afirmar(
          "Lista montada por carregamento direto (POP): não força o topo nem rouba o foco para o `<h1>`",
          rolagens.length === 0 && focado() !== tela.q("h1"),
          `rolagens ${rolagens.length}`,
        );
        soltar();
        await esperarAte(() => tela.lista() === m.LISTA_PRONTA, "Lista carregando: a lista chega");
        conferir(tela, "pronta");

        /* ══ /carreiras: lista com vagas ══ */
        afirmar(
          "Lista com vagas: os cartões na ORDEM recebida da camada",
          igual(tela.cartoes(), [B.slug, A.slug]),
          tela.cartoes().join(", "),
        );
        const cartao = tela.q(`article[data-vaga="${A.slug}"]`);
        const dep = cartao?.querySelector('[data-classificacao="departamento"]');
        const niv = cartao?.querySelector('[data-classificacao="nivel"]');
        const tipo = cartao?.querySelector('[data-classificacao="tipo"]');
        const ver = cartao?.querySelector('a[data-acao="ver-vaga"]');
        afirmar(
          "cada cartão: título (h3), Departamento e Nível com Cor por `style` e o nome por extenso, Tipo, local, Resumo e \"Ver vaga\" para `/carreiras/<slug>`",
          cartao?.querySelector("h3")?.textContent === A.titulo &&
            (dep?.textContent ?? "") === "Atendimento" &&
            /background-color:\s*var\(--categoria-verde-bg\)/.test(dep?.getAttribute("style") ?? "") &&
            /color:\s*var\(--categoria-verde-ink\)/.test(dep?.getAttribute("style") ?? "") &&
            (niv?.textContent ?? "") === "Pleno" &&
            /background-color:\s*var\(--categoria-azul-bg\)/.test(niv?.getAttribute("style") ?? "") &&
            (tipo?.textContent ?? "") === "CLT" &&
            (cartao?.querySelector('[data-papel="local"]')?.textContent ?? "") === "Híbrido · Natal, RN" &&
            (cartao?.querySelector('[data-papel="resumo"]')?.textContent ?? "") === A.resumo &&
            ver?.getAttribute("href") === `/carreiras/${A.slug}` &&
            (ver?.textContent ?? "").trim() === m.ROTULO_DO_CARTAO,
          cartao?.outerHTML?.slice(0, 400),
        );
        afirmar(
          "e a lista pública nunca chama uma leitura do Painel, e não pede a situação de Vaga nenhuma",
          leitura.proibidas.length === 0 && leitura.pedidosDaSituacao.length === 0,
          leitura.proibidas.join(", "),
        );
        const final = tela.q('a[data-acao="curriculo-final"]');
        afirmar(
          "o convite final de `/carreiras` usa o MESMO endereço do currículo do módulo puro, em nova aba",
          final?.getAttribute("href") === m.ENDERECO_DO_CURRICULO &&
            final?.getAttribute("target") === "_blank" &&
            final?.getAttribute("rel") === "noopener noreferrer",
          final?.getAttribute("href") ?? "sem o convite final",
        );

        /* ══ Da lista para a Vaga (PUSH): rola ao topo e o foco vai ao `<h1>` ══ */
        leitura.situacoes[A.slug] = situacaoDe(A);
        rolagens.length = 0;
        await tela.clicar(ver, "Ver vaga", () => tela.situacao() === m.VAGA_ABERTA);
        afirmar(
          "\"Ver vaga\" abre a Página da Vaga (mesma chave de transição) e rola ao topo, com `scrollTo({ top: 0, behavior: \"instant\" })`",
          tela.onde() === `/carreiras/${A.slug}` && leitura.pedidosDaSituacao.at(-1) === A.slug && subiuAoTopo(),
          `${tela.onde()} | rolagens ${JSON.stringify(rolagens)}`,
        );
        afirmar(
          "e, carregada a Vaga depois do PUSH, o foco está no `<h1>` dela (com `tabIndex=-1`)",
          focado() === tela.q("h1") && tela.q("h1")?.getAttribute("tabindex") === "-1" && igual(tela.h1s(), [A.titulo]),
          `${focado()?.tagName} ${focado()?.textContent?.slice(0, 40)}`,
        );

        /* ══ De volta a /carreiras pelo link da Vaga (PUSH): sobe ao topo ══ */
        rolagens.length = 0;
        await tela.clicar(tela.q('a[data-acao="voltar"]'), "Ver todas as vagas", () => tela.lista() === m.LISTA_PRONTA);
        afirmar(
          "`/carreiras` vindo de uma Vaga (PUSH, mesma chave de transição) sobe ao topo e leva o foco ao `<h1>` do hero",
          tela.onde() === "/carreiras" && subiuAoTopo() && focado() === tela.q("h1") && tela.todos("h1").length === 1,
          `${tela.onde()} | rolagens ${rolagens.length} | foco ${focado()?.tagName}`,
        );

        /* ══ Voltar pelo navegador (POP): NÃO força o topo ══ */
        rolagens.length = 0;
        await tela.ir(-1, () => tela.situacao() === m.VAGA_ABERTA);
        afirmar(
          "voltar pelo navegador (POP) para a Vaga NÃO força o topo, nem rouba o foco",
          tela.onde() === `/carreiras/${A.slug}` && rolagens.length === 0 && focado() !== tela.q("h1"),
          `${tela.onde()} | rolagens ${rolagens.length}`,
        );
        await tela.desmontar();
      }

      /* ══ /carreiras: vazia ══ */
      {
        leitura.lista = { ok: true, dados: [] };
        const tela = await montar("/carreiras", { caso: "Lista vazia", ateQue: () => true });
        await esperarAte(() => tela.lista() === m.LISTA_VAZIA, "Lista vazia: o vazio aparece");
        const curriculo = tela.q('[data-papel="sem-vagas"] a[data-acao="enviar-curriculo"]');
        afirmar(
          "Lista vazia: o estado vazio atual, com Enviar Currículo pelo WhatsApp em nova aba",
          tela.lista() === m.LISTA_VAZIA &&
            tela.texto().includes(m.falaDaLista(m.LISTA_VAZIA).oQueHouve) &&
            curriculo?.getAttribute("href") === m.ENDERECO_DO_CURRICULO &&
            /* TROCA REGISTRADA (2026-09-29, merge da `main`): exigia o formato
               `api.whatsapp.com`; o site passou a ter um só endereço, o
               `LINK_DO_WHATSAPP` do Tintim. */
            curriculo?.getAttribute("href") === LINK_DO_WHATSAPP &&
            curriculo?.getAttribute("target") === "_blank" &&
            curriculo?.getAttribute("rel") === "noopener noreferrer" &&
            (curriculo?.textContent ?? "").trim() === m.ROTULO_DO_CURRICULO &&
            tela.cartoes().length === 0 &&
            tela.q('[data-papel="erro"]') === null,
        );
        await tela.desmontar();
      }

      /* ══ /carreiras: erro, e tentar de novo (com a leitura nova SEGURADA) ══ */
      for (const [caso, preparar, registra] of [
        ["Erro da lista", () => { leitura.lista = FALHA_DE_REDE; }, false],
        ["Lista que lança", () => { leitura.lista = { ok: true, dados: [] }; leitura.lancarLista = true; }, true],
      ]) {
        preparar();
        const tela = await montar("/carreiras", { caso, ateQue: () => true, registra });
        await esperarAte(() => tela.lista() !== null && tela.lista() !== m.LISTA_CARREGANDO, `${caso}: a lista assenta`);
        conferir(tela, "no erro");
        const alertas = tela.todos('[role="alert"]');
        const repetir = tela.q('[data-acao="repetir"]');
        afirmar(
          `${caso}: frase de erro e "tentar de novo", NUNCA o vazio nem "nenhuma vaga"`,
          tela.lista() === m.LISTA_ERRO &&
            tela.q('[data-papel="erro"]') !== null &&
            tela.texto().includes(m.falaDaLista(m.LISTA_ERRO).oQueHouve) &&
            tela.q('[data-papel="sem-vagas"]') === null &&
            !/nenhuma vaga/i.test(tela.texto()) &&
            tela.q('[data-acao="enviar-curriculo"]') === null &&
            (repetir?.textContent ?? "") === m.ROTULO_DE_RECARREGAR_A_LISTA,
          tela.lista(),
        );
        afirmar(
          `${caso}: \`role="alert"\` só no PARÁGRAFO da mensagem, e não no bloco com o botão`,
          alertas.length === 1 &&
            alertas[0].tagName === "P" &&
            alertas[0].querySelector("button, a") === null &&
            (alertas[0].textContent ?? "").includes(m.falaDaLista(m.LISTA_ERRO).oQueHouve) &&
            repetir !== null &&
            repetir.closest('[role="alert"]') === null,
          alertas.map((x) => x.tagName).join(", "),
        );
        leitura.lancarLista = false;
        leitura.lista = { ok: true, dados: ABERTAS };
        const antes = leitura.pedidosDaLista;
        const soltar = segurar("segurarLista");
        await tela.clicar(repetir, "tentar de novo", () => tela.lista() === m.LISTA_CARREGANDO);
        afirmar(
          `${caso}: com a leitura NOVA segurada, a lista mostra carregando, e nada do erro anterior nem cartão`,
          tela.lista() === m.LISTA_CARREGANDO &&
            tela.q('[data-papel="erro"]') === null &&
            tela.todos('[role="alert"]').length === 0 &&
            tela.cartoes().length === 0 &&
            leitura.pedidosDaLista === antes + 1,
          tela.lista(),
        );
        soltar();
        await esperarAte(() => tela.lista() === m.LISTA_PRONTA, `${caso}: solta a leitura, a lista chega`);
        afirmar(
          `${caso}: "tentar de novo" relê a lista (uma leitura a mais) e mostra os cartões`,
          leitura.pedidosDaLista === antes + 1 && tela.cartoes().length === 2,
          `pedidos ${leitura.pedidosDaLista - antes}`,
        );
        await tela.desmontar();
      }

      /* ══ A Vaga Aberta, completa, por carregamento direto ══ */
      {
        leitura.lista = { ok: true, dados: ABERTAS };
        leitura.situacoes[A.slug] = situacaoDe(A);
        leitura.situacoes[B.slug] = situacaoDe(B);
        rolagens.length = 0;
        const tela = await montar(`/carreiras/${A.slug}`, {
          caso: "Aberta",
          ateQue: () => janela.document.querySelector('[data-papel="outras-vagas"]') !== null,
        });
        /* TROCA REGISTRADA (revisão da Story 5.7): antes, "a página rola ao
           topo ao montar". O carregamento direto chega como POP e já nasce no
           topo: ele NÃO força a rolagem e NÃO rouba o foco. */
        afirmar(
          "Aberta por carregamento direto (POP): não força o topo e não rouba o foco para o `<h1>`",
          rolagens.length === 0 && focado() !== tela.q("h1"),
          `rolagens ${rolagens.length} | foco ${focado()?.tagName}`,
        );
        const dep = tela.q('[data-papel="classificacoes"] [data-classificacao="departamento"]');
        const niv = tela.q('[data-papel="classificacoes"] [data-classificacao="nivel"]');
        afirmar(
          "Aberta: UM `<h1>` com o título, Classificações com Cor por `style` e nome, Tipo, local, \"Aberta em\" e Resumo",
          tela.situacao() === m.VAGA_ABERTA &&
            igual(tela.h1s(), [A.titulo]) &&
            (dep?.textContent ?? "") === "Atendimento" &&
            /background-color:\s*var\(--categoria-verde-bg\)/.test(dep?.getAttribute("style") ?? "") &&
            (niv?.textContent ?? "") === "Pleno" &&
            /background-color:\s*var\(--categoria-azul-bg\)/.test(niv?.getAttribute("style") ?? "") &&
            (tela.q('[data-papel="classificacoes"] [data-classificacao="tipo"]')?.textContent ?? "") === "CLT" &&
            (tela.q('[data-papel="local"]')?.textContent ?? "") === "Híbrido · Natal, RN" &&
            (tela.q('[data-papel="abertura"]')?.textContent ?? "") === `${estadosDaVaga.rotuloDoEstadoDaVaga("aberta")} em 10/09/2026` &&
            (tela.q('[data-papel="resumo"]')?.textContent ?? "") === A.resumo,
          `${tela.situacao()} | h1: ${JSON.stringify(tela.h1s())}`,
        );
        const descricao = tela.q('div[data-papel="descricao"]');
        afirmar(
          "Aberta: a Descrição é o HTML gravado, dentro de `.artigo`",
          descricao !== null &&
            descricao.classList.contains("artigo") &&
            descricao.innerHTML === A.descricao_html &&
            descricao.querySelector("h2")?.textContent === "O que você vai fazer",
          descricao?.outerHTML?.slice(0, 200),
        );
        const botoes = tela.candidatar();
        afirmar(
          "Aberta: Candidatar-se DUAS vezes (no topo e depois da Descrição), em nova aba com `noopener noreferrer`, para o Link de Candidatura",
          botoes.length === 2 &&
            botoes.every(
              (b) =>
                b.getAttribute("href") === A.link_de_candidatura &&
                b.getAttribute("target") === "_blank" &&
                (b.getAttribute("rel") ?? "").split(/\s+/).includes("noopener") &&
                (b.getAttribute("rel") ?? "").split(/\s+/).includes("noreferrer") &&
                (b.textContent ?? "").trim() === m.ROTULO_DA_CANDIDATURA,
            ) &&
            descricao !== null &&
            (botoes[0].compareDocumentPosition(descricao) & janela.Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
            (descricao.compareDocumentPosition(botoes[1]) & janela.Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
          botoes.map((b) => `${b.getAttribute("href")} ${b.getAttribute("target")} ${b.getAttribute("rel")}`).join(" | "),
        );
        const outras = tela.q('[data-papel="outras-vagas"]');
        afirmar(
          "Aberta: \"Outras vagas abertas\" em `h2`, com os cartões em `h3`, SEM a Vaga atual",
          (outras?.querySelector("h2")?.textContent ?? "") === m.TITULO_DAS_OUTRAS_VAGAS &&
            igual(tela.cartoes(), [B.slug]) &&
            outras?.querySelector("article h3")?.textContent === B.titulo,
          tela.cartoes().join(", "),
        );

        /* ══ Trocar de Vaga (PUSH): rola ao topo, recarrega, e o foco vai ao `<h1>` novo ══ */
        rolagens.length = 0;
        const antes = leitura.pedidosDaSituacao.length;
        await tela.clicar(
          outras?.querySelector('a[data-acao="ver-vaga"]'),
          "a outra vaga",
          () => tela.situacao() === m.VAGA_ABERTA && igual(tela.h1s(), [B.titulo]),
        );
        afirmar(
          "Trocar de vaga: o clique numa outra vaga rola ao topo, carrega a situação NOVA e mostra um `<h1>` só, o dela, com o foco nele",
          tela.onde() === `/carreiras/${B.slug}` &&
            leitura.pedidosDaSituacao.length > antes &&
            leitura.pedidosDaSituacao.at(-1) === B.slug &&
            subiuAoTopo() &&
            igual(tela.h1s(), [B.titulo]) &&
            focado() === tela.q("h1"),
          `${tela.onde()} | rolagens ${rolagens.length} | foco ${focado()?.tagName} | pedidos ${JSON.stringify(leitura.pedidosDaSituacao.slice(antes))}`,
        );
        await esperarAte(() => igual(tela.cartoes(), [A.slug]), "Trocar de vaga: as outras vagas passam a excluir a nova");
        afirmar(
          "e as outras vagas passam a ser as sem a NOVA atual, e o Local remoto sem Localização sai só com a Modalidade",
          igual(tela.cartoes(), [A.slug]) && (tela.q('[data-papel="local"]')?.textContent ?? "") === "Remoto",
        );

        /* ══ Voltar pelo navegador (POP) entre Vagas: NÃO força o topo ══ */
        rolagens.length = 0;
        await tela.ir(-1, () => tela.situacao() === m.VAGA_ABERTA && igual(tela.h1s(), [A.titulo]));
        afirmar(
          "voltar pelo navegador (POP) de uma Vaga para a anterior carrega a anterior e NÃO força o topo",
          tela.onde() === `/carreiras/${A.slug}` && rolagens.length === 0,
          `${tela.onde()} | rolagens ${JSON.stringify(rolagens)}`,
        );
        afirmar("e nenhuma leitura do Painel foi chamada", leitura.proibidas.length === 0, leitura.proibidas.join(", "));
        await tela.desmontar();
      }

      /* ══ Trocar de Vaga com a leitura da NOVA segurada ══ */
      {
        leitura.lista = { ok: true, dados: ABERTAS };
        leitura.situacoes[A.slug] = situacaoDe(A);
        leitura.situacoes[B.slug] = situacaoDe(B);
        const tela = await montar(`/carreiras/${A.slug}`, {
          caso: "Troca segurada",
          ateQue: () => janela.document.querySelector('[data-papel="outras-vagas"]') !== null,
        });
        const soltarB = segurar(null, B.slug);
        await tela.clicar(
          tela.q('[data-papel="outras-vagas"] a[data-acao="ver-vaga"]'),
          "a outra vaga (segurada)",
          () => tela.onde() === `/carreiras/${B.slug}`,
        );
        await passo();
        conferir(tela, "segurada");
        afirmar(
          "Troca segurada: com a leitura de B presa, a tela é CARREGANDO, sem `<h1>`, sem Candidatar-se e sem \"outras vagas\" da Vaga anterior",
          tela.situacao() === m.VAGA_CARREGANDO &&
            tela.h1s().length === 0 &&
            tela.candidatar().length === 0 &&
            tela.q('[data-papel="outras-vagas"]') === null &&
            tela.cartoes().length === 0 &&
            !tela.texto().includes(A.titulo) &&
            tela.q(".artigo") === null,
          `${tela.situacao()} | h1: ${JSON.stringify(tela.h1s())}`,
        );
        soltarB();
        await esperarAte(() => tela.situacao() === m.VAGA_ABERTA, "Troca segurada: solta B, a Vaga B aparece");
        afirmar(
          "Troca segurada: solta a leitura, aparece B (um `<h1>`, o dela) com o foco nele",
          igual(tela.h1s(), [B.titulo]) && focado() === tela.q("h1"),
          JSON.stringify(tela.h1s()),
        );
        await tela.desmontar();
      }

      /* ══ Corrida: a resposta de A que chega DEPOIS de navegar para B ══ */
      {
        leitura.lista = { ok: true, dados: ABERTAS };
        leitura.situacoes[A.slug] = situacaoDe(A);
        leitura.situacoes[B.slug] = situacaoDe(B);
        const soltarA = segurar(null, A.slug);
        const tela = await montar(`/carreiras/${A.slug}`, { caso: "Corrida", ateQue: () => true });
        await passo();
        const antesDaLista = leitura.pedidosDaLista;
        await tela.ir(`/carreiras/${B.slug}`, () => tela.situacao() === m.VAGA_ABERTA);
        soltarA();
        for (let i = 0; i < 5; i += 1) await passo();
        conferir(tela, "depois de soltar A");
        afirmar(
          "Corrida: a resposta de A, solta DEPOIS de navegar para B, não aparece; a tela continua B, com as outras vagas de B",
          tela.onde() === `/carreiras/${B.slug}` &&
            tela.situacao() === m.VAGA_ABERTA &&
            igual(tela.h1s(), [B.titulo]) &&
            tela.candidatar().every((x) => x.getAttribute("href") === B.link_de_candidatura) &&
            leitura.pedidosDaLista - antesDaLista <= 1,
          `${tela.situacao()} | h1: ${JSON.stringify(tela.h1s())} | lista ${leitura.pedidosDaLista - antesDaLista}`,
        );
        await tela.desmontar();
      }

      /* ══ Aberta: variações que não podem quebrar a página ══ */
      for (const [caso, extra, conferirCaso] of [
        [
          "Aberta sem link válido",
          { link_de_candidatura: "javascript:x" },
          (tela) => tela.candidatar().length === 0 && tela.q('[data-papel="candidatura-final"]') === null && tela.q("div.artigo") !== null,
        ],
        [
          "Aberta com link relativo",
          { link_de_candidatura: "/candidatar" },
          (tela) => tela.candidatar().length === 0,
        ],
        [
          "Aberta com link em caixa alta",
          { link_de_candidatura: "HTTPS://Exemplo.COM/Vaga" },
          (tela) => tela.candidatar().length === 2 && tela.candidatar().every((x) => x.getAttribute("href") === "https://exemplo.com/Vaga"),
        ],
        [
          "Modalidade fora do vocabulário",
          { modalidade: "xpto" },
          (tela) => (tela.q('[data-papel="local"]')?.textContent ?? "") === "Natal, RN" && !tela.texto().includes("xpto"),
        ],
        [
          "Data ruim",
          { aberta_em: "lixo" },
          (tela) => tela.q('[data-papel="abertura"]') === null && !tela.texto().includes("lixo"),
        ],
      ]) {
        leitura.lista = { ok: true, dados: ABERTAS };
        leitura.situacoes["vaga-variada"] = situacaoDe({ ...A, slug: "vaga-variada", ...extra });
        const tela = await montar("/carreiras/vaga-variada", { caso, ateQue: () => true });
        await esperarAte(() => tela.situacao() === m.VAGA_ABERTA, `${caso}: a Vaga aparece`);
        let ok = false;
        try {
          ok = conferirCaso(tela);
        } catch {
          ok = false;
        }
        afirmar(`${caso}: a página não quebra, tem UM \`<h1>\` com o título, e o campo torto some`, ok && igual(tela.h1s(), [A.titulo]));
        await tela.desmontar();
      }

      /* ══ Aberta sem título: resposta inválida, erro de leitura ══ */
      for (const [caso, titulo] of [
        ["Aberta com título vazio", ""],
        ["Aberta com título nulo", null],
      ]) {
        leitura.lista = { ok: true, dados: ABERTAS };
        leitura.situacoes["vaga-sem-titulo"] = situacaoDe({ ...A, slug: "vaga-sem-titulo", titulo });
        const tela = await montar("/carreiras/vaga-sem-titulo", { caso, ateQue: () => true });
        await esperarAte(() => tela.situacao() !== m.VAGA_CARREGANDO, `${caso}: a tela assenta`);
        afirmar(
          `${caso}: vira ERRO de leitura (um \`<h1>\` com a frase de erro e "tentar de novo"), nunca um \`<h1>\` vazio nem a Descrição`,
          tela.situacao() === m.VAGA_ERRO &&
            igual(tela.h1s(), [m.falaDaVaga(m.VAGA_ERRO).oQueHouve]) &&
            tela.q('[data-acao="repetir"]') !== null &&
            tela.q(".artigo") === null &&
            tela.candidatar().length === 0,
          `${tela.situacao()} | h1: ${JSON.stringify(tela.h1s())}`,
        );
        await tela.desmontar();
      }

      /* ══ Aberta: a lista das outras falha em silêncio ══ */
      {
        leitura.lista = FALHA_DE_REDE;
        leitura.situacoes[A.slug] = situacaoDe(A);
        const antes = leitura.pedidosDaLista;
        const tela = await montar(`/carreiras/${A.slug}`, { caso: "Outras vagas falhando", ateQue: () => true });
        await esperarAte(() => tela.situacao() === m.VAGA_ABERTA && leitura.pedidosDaLista > antes, "Outras vagas falhando: a Vaga aparece e a lista é pedida");
        await passo();
        afirmar(
          "Outras vagas falhando: a seção some em silêncio, e a Vaga continua inteira (h1, Descrição, Candidatar-se)",
          tela.q('[data-papel="outras-vagas"]') === null &&
            tela.q('[role="alert"]') === null &&
            tela.q('[data-acao="repetir-lista"]') === null &&
            igual(tela.h1s(), [A.titulo]) &&
            tela.q("div.artigo") !== null &&
            tela.candidatar().length === 2,
        );
        await tela.desmontar();
      }

      /* ══ Encerrada ══ */
      for (const [caso, lista, dados, conferirCaso] of [
        [
          "Encerrada com vagas abertas",
          { ok: true, dados: ABERTAS },
          ENCERRADA,
          (tela) => igual(tela.cartoes(), [B.slug, A.slug]) && tela.q('[data-papel="sem-vagas"]') === null,
        ],
        [
          "Encerrada sem vaga aberta",
          { ok: true, dados: [] },
          ENCERRADA,
          (tela) =>
            tela.cartoes().length === 0 &&
            tela.q('[data-papel="sem-vagas"] a[data-acao="enviar-curriculo"]')?.getAttribute("href") === m.ENDERECO_DO_CURRICULO,
        ],
        [
          "Encerrada com a lista falhando",
          FALHA_DE_REDE,
          ENCERRADA,
          (tela) =>
            tela.cartoes().length === 0 &&
            tela.q('[data-papel="sem-vagas"]') === null &&
            tela.q('[data-papel="outras-falha"] a[data-acao="ver-as-vagas"]')?.getAttribute("href") === m.ENDERECO_DAS_VAGAS &&
            (tela.q('[data-papel="outras-falha"] [data-acao="repetir-lista"]')?.textContent ?? "") === m.ROTULO_DE_RECARREGAR_A_LISTA &&
            (tela.q('[data-papel="outras-falha"] [role="alert"]')?.textContent ?? "") === m.falaDaLista(m.LISTA_ERRO).oQueHouve &&
            !/nenhuma vaga/i.test(tela.texto()),
        ],
      ]) {
        leitura.lista = lista;
        leitura.situacoes[dados.slug] = situacaoDe(dados);
        const tela = await montar(`/carreiras/${dados.slug}`, { caso, ateQue: () => true });
        await esperarAte(
          () => tela.situacao() === m.VAGA_ENCERRADA && tela.q('[data-papel="outras-lendo"]') === null,
          `${caso}: a Encerrada assenta`,
        );
        let ok = false;
        try {
          ok = conferirCaso(tela);
        } catch {
          ok = false;
        }
        afirmar(
          `${caso}: UM \`<h1>\` com o título, a mensagem de encerrada, as Vagas Abertas (ou o vazio com currículo, ou o erro da lista); sem Descrição e sem candidatura`,
          ok &&
            igual(tela.h1s(), [dados.titulo]) &&
            tela.texto().includes(m.falaDaVaga(m.VAGA_ENCERRADA).oQueHouve) &&
            tela.q(".artigo") === null &&
            tela.q('[data-papel="descricao"]') === null &&
            tela.candidatar().length === 0 &&
            tela.todos("h2").some((x) => x.textContent === m.TITULO_DAS_VAGAS_ABERTAS),
          `${tela.situacao()} | h1: ${JSON.stringify(tela.h1s())} | cartões: ${tela.cartoes().join(", ")}`,
        );
        if (lista.ok === false) {
          /* A lista é o CONTEÚDO da Encerrada: repetir a LISTA funciona, e
             não relê a situação. */
          leitura.lista = { ok: true, dados: ABERTAS };
          const antesDaLista = leitura.pedidosDaLista;
          const antesDaSituacao = leitura.pedidosDaSituacao.length;
          await tela.clicar(tela.q('[data-acao="repetir-lista"]'), "tentar a lista de novo", () => tela.cartoes().length === 2);
          afirmar(
            `${caso}: "tentar de novo" da LISTA relê só a lista (uma leitura, e nenhuma da situação) e mostra as Vagas Abertas`,
            leitura.pedidosDaLista === antesDaLista + 1 &&
              leitura.pedidosDaSituacao.length === antesDaSituacao &&
              igual(tela.cartoes(), [B.slug, A.slug]) &&
              tela.q('[data-papel="outras-falha"]') === null &&
              igual(tela.h1s(), [dados.titulo]),
            `lista ${leitura.pedidosDaLista - antesDaLista} | situação ${leitura.pedidosDaSituacao.length - antesDaSituacao}`,
          );
        }
        await tela.desmontar();
      }
      {
        leitura.lista = { ok: true, dados: ABERTAS };
        leitura.situacoes["encerrada-sem-titulo"] = situacaoDe({ situacao: "encerrada", slug: "encerrada-sem-titulo", titulo: null });
        const tela = await montar("/carreiras/encerrada-sem-titulo", { caso: "Encerrada sem título", ateQue: () => true });
        await esperarAte(() => tela.situacao() === m.VAGA_ENCERRADA, "Encerrada sem título: a tela assenta");
        afirmar(
          "Encerrada sem título: continua Encerrada, com o título de reserva do módulo puro no `<h1>` (nunca vazio) e as Vagas Abertas",
          igual(tela.h1s(), [m.TITULO_DE_RESERVA_DA_ENCERRADA]) &&
            tela.texto().includes(m.falaDaVaga(m.VAGA_ENCERRADA).oQueHouve),
          JSON.stringify(tela.h1s()),
        );
        await tela.desmontar();
      }

      /* ══ Inexistente ══
         TROCA REGISTRADA (revisão da Story 5.7): o caso que se chamava "Slug
         torto" é o DUBLÊ respondendo inexistente, e o nome passou a dizer isso.
         A regra real (Slug torto é inexistente sem ir à rede) é a asserção
         própria da camada real, no Node, no começo desta seção. */
      for (const [caso, caminho, preparar] of [
        ["Inexistente (Rascunho)", "/carreiras/rascunho-escondido", () => {}],
        ["O dublê respondendo inexistente a um Slug torto", "/carreiras/Slug_Torto", () => {}],
        [
          "Falha `nao_encontrado` da camada",
          "/carreiras/vaga-sumida",
          () => { leitura.situacoes["vaga-sumida"] = { ok: false, erro: { tipo: "nao_encontrado", mensagem: "Não encontramos o que você procura." } }; },
        ],
      ]) {
        preparar();
        const antes = leitura.pedidosDaSituacao.length;
        const tela = await montar(caminho, { caso, ateQue: () => true });
        await esperarAte(() => tela.situacao() !== m.VAGA_CARREGANDO, `${caso}: a tela assenta`);
        afirmar(
          `${caso}: a tela "não encontrada", com UM \`<h1>\` "Vaga não encontrada" e o link para \`/carreiras\`, sem tentar de novo; a situação é perguntada à camada`,
          tela.situacao() === m.VAGA_INEXISTENTE &&
            igual(tela.h1s(), ["Vaga não encontrada"]) &&
            tela.q('[data-acao="voltar"]')?.getAttribute("href") === "/carreiras" &&
            tela.q('[data-acao="repetir"]') === null &&
            tela.q('[role="alert"]') === null &&
            leitura.pedidosDaSituacao.length === antes + 1,
          `${tela.situacao()} | ${JSON.stringify(tela.h1s())}`,
        );
        await tela.desmontar();
      }

      /* ══ Erro de leitura da Vaga, e tentar de novo (com a leitura nova SEGURADA) ══ */
      for (const [caso, preparar, registra] of [
        ["Erro de leitura da vaga", () => { leitura.situacoes["vaga-em-falha"] = FALHA_DE_REDE; }, false],
        ["Erro de permissão da vaga", () => { leitura.situacoes["vaga-em-falha"] = { ok: false, erro: { tipo: "permissao", mensagem: "x" } }; }, false],
        ["Leitura da vaga que lança", () => { leitura.situacoes["vaga-em-falha"] = situacaoDe({ ...A, slug: "vaga-em-falha" }); leitura.lancarSituacao = true; }, true],
      ]) {
        preparar();
        leitura.lista = { ok: true, dados: ABERTAS };
        const tela = await montar("/carreiras/vaga-em-falha", { caso, ateQue: () => true, registra });
        await esperarAte(() => tela.situacao() === m.VAGA_ERRO, `${caso}: a tela assenta`);
        const alertas = tela.todos('[role="alert"]');
        afirmar(
          `${caso}: UM \`<h1>\` com a frase de erro (distinta de "Vaga não encontrada") e "tentar de novo"; \`role="alert"\` só no parágrafo da mensagem`,
          igual(tela.h1s(), [m.falaDaVaga(m.VAGA_ERRO).oQueHouve]) &&
            !tela.texto().includes(m.falaDaVaga(m.VAGA_INEXISTENTE).oQueHouve) &&
            alertas.length === 1 &&
            alertas[0].tagName === "P" &&
            alertas[0].querySelector("h1, button, a") === null &&
            (tela.q('[data-acao="repetir"]')?.textContent ?? "") === m.ROTULO_DE_RECARREGAR_A_VAGA,
          JSON.stringify(tela.h1s()),
        );
        leitura.lancarSituacao = false;
        leitura.situacoes["vaga-em-falha"] = situacaoDe({ ...A, slug: "vaga-em-falha" });
        const antes = leitura.pedidosDaSituacao.length;
        const soltar = segurar(null, "vaga-em-falha");
        await tela.clicar(tela.q('[data-acao="repetir"]'), "tentar de novo", () => tela.situacao() === m.VAGA_CARREGANDO);
        afirmar(
          `${caso}: com a leitura NOVA segurada, a tela é CARREGANDO, sem o \`<h1>\` nem o alerta do erro anterior`,
          tela.situacao() === m.VAGA_CARREGANDO &&
            tela.h1s().length === 0 &&
            tela.q('[role="alert"]') === null &&
            tela.q('[data-acao="repetir"]') === null,
          `${tela.situacao()} | h1: ${JSON.stringify(tela.h1s())}`,
        );
        soltar();
        await esperarAte(() => tela.situacao() === m.VAGA_ABERTA, `${caso}: solta a leitura, a Vaga chega`);
        afirmar(
          `${caso}: "tentar de novo" relê a situação e mostra a Vaga`,
          leitura.pedidosDaSituacao.length === antes + 1 && igual(tela.h1s(), [A.titulo]),
        );
        await tela.desmontar();
      }

      /* ══ Carregando da Vaga ══ */
      {
        leitura.situacoes[A.slug] = situacaoDe(A);
        const soltar = segurar("segurarSituacao");
        const tela = await montar(`/carreiras/${A.slug}`, { caso: "Vaga carregando", ateQue: () => true });
        await passo();
        conferir(tela, "segurada");
        afirmar(
          "Vaga carregando: esqueleto com texto sr-only, nenhum `<h1>`, nenhum Candidatar-se",
          tela.situacao() === m.VAGA_CARREGANDO &&
            (tela.q('[role="status"]')?.textContent ?? "") === m.TEXTO_DE_CARREGANDO_A_VAGA &&
            tela.h1s().length === 0 &&
            tela.candidatar().length === 0,
          tela.situacao(),
        );
        soltar();
        await esperarAte(() => tela.situacao() === m.VAGA_ABERTA, "Vaga carregando: a Vaga chega");
        await tela.desmontar();
      }

      /* ══ Repetir a situação NÃO relê a lista já lida para o mesmo Slug ══ */
      {
        leitura.lista = { ok: true, dados: ABERTAS };
        leitura.situacoes["vaga-instavel"] = situacaoDe({ ...A, slug: "vaga-instavel" });
        const antesDaLista = leitura.pedidosDaLista;
        const tela = await montar("/carreiras/vaga-instavel", {
          caso: "Leituras da lista por navegação",
          ateQue: () => janela.document.querySelector('[data-papel="outras-vagas"]') !== null,
        });
        leitura.situacoes["vaga-instavel"] = FALHA_DE_REDE;
        await tela.ir("/carreiras/nao-existe-mais", () => tela.situacao() === m.VAGA_INEXISTENTE);
        await tela.ir("/carreiras/vaga-instavel", () => tela.situacao() === m.VAGA_ERRO);
        leitura.situacoes["vaga-instavel"] = situacaoDe({ ...A, slug: "vaga-instavel" });
        await tela.clicar(tela.q('[data-acao="repetir"]'), "tentar de novo", () => tela.situacao() === m.VAGA_ABERTA);
        for (let i = 0; i < 3; i += 1) await passo();
        afirmar(
          "Leituras da lista por navegação: a lista já lida para o Slug não é relida quando a SITUAÇÃO é lida de novo (uma leitura só, e as outras vagas continuam lá)",
          leitura.pedidosDaLista - antesDaLista === 1 &&
            tela.q('[data-papel="outras-vagas"]') !== null &&
            igual(tela.cartoes(), [B.slug, A.slug]) &&
            leitura.pedidosDaSituacao.filter((s) => s === "vaga-instavel").length >= 3,
          `lista ${leitura.pedidosDaLista - antesDaLista} | cartões ${tela.cartoes().join(", ")}`,
        );
        await tela.desmontar();
      }

      /* ══ A rolagem de reserva, e o navegador que não rola ══ */
      {
        leitura.lista = { ok: true, dados: ABERTAS };
        leitura.situacoes[A.slug] = situacaoDe(A);
        leitura.situacoes[B.slug] = situacaoDe(B);
        const tela = await montar(`/carreiras/${A.slug}`, {
          caso: "Rolagem de reserva",
          ateQue: () => janela.document.querySelector('[data-papel="outras-vagas"]') !== null,
        });
        rolagens.length = 0;
        modoDaRolagem = "recusa-objeto";
        await tela.clicar(
          tela.q('[data-papel="outras-vagas"] a[data-acao="ver-vaga"]'),
          "a outra vaga (sem a forma com objeto)",
          () => tela.situacao() === m.VAGA_ABERTA && igual(tela.h1s(), [B.titulo]),
        );
        afirmar(
          "Rolagem de reserva: o navegador que recusa `scrollTo({…})` recebe `scrollTo(0, 0)`, e a página segue",
          rolagens.some((a) => a[0] === 0 && a[1] === 0) && igual(tela.h1s(), [B.titulo]),
          JSON.stringify(rolagens),
        );
        modoDaRolagem = "sempre-lanca";
        await tela.clicar(tela.q('a[data-acao="voltar"]'), "Ver todas as vagas (sem rolagem)", () => tela.lista() === m.LISTA_PRONTA);
        afirmar(
          "e um navegador sem rolagem nenhuma não derruba `/carreiras` (a lista aparece e o foco vai ao `<h1>`)",
          tela.onde() === "/carreiras" && tela.cartoes().length === 2 && focado() === tela.q("h1"),
          tela.onde(),
        );
        modoDaRolagem = "normal";
        await tela.desmontar();
      }

      /* ══ Dentro do `AnimatedRoutes` REAL: ida, volta e carregamento direto ══
         Defeito achado e corrigido em 2026-09-29 (Spec Change Log da 5.7). O
         `AnimatedRoutes` passa `location` ao `<Routes>`, e o React Router 7,
         nesse caso, fixa `navigationType: "POP"` para as rotas: montadas como
         em `main.jsx`, as páginas NUNCA viam uma ida, e o foco nunca ia ao
         `<h1>`. Os casos acima montam sem o `AnimatedRoutes` e não viam isso.
         Aqui a superfície é a real: foco no `<h1>` e UMA rolagem ao topo na
         ida (a do `AnimatedRoutes`, sem uma segunda da página), nada forçado
         na volta (a posição anotada é restaurada, e nenhuma rolagem ao topo
         briga com ela) e nada no carregamento direto. A rolagem do
         `AnimatedRoutes` acontece dois quadros depois da troca: esperam-se
         quadros de verdade. */
      {
        /* A regra pura do tipo visto, executada. A página que está SAINDO de
           cena (troca de área, animação de saída) recebe o contexto da
           navegação que a tira: ela tem de ver "POP", ou agiria como se tivesse
           acabado de chegar. A montagem abaixo não passa por uma troca de área,
           então é aqui que isso se prova. */
        const v = modulo.navegacaoVista;
        afirmar(
          "`navegacaoVista`: sem provedor, o tipo do roteador; com provedor e a entrada da página, o tipo real; com provedor e OUTRA entrada (a página que sai), \"POP\"",
          typeof v === "function" &&
            igual(v(null, "k1", "PUSH"), { tipo: "PUSH", rolagemGlobal: false }) &&
            igual(v(null, "k1", "POP"), { tipo: "POP", rolagemGlobal: false }) &&
            igual(v({ tipo: "PUSH", chave: "k1" }, "k1", "POP"), { tipo: "PUSH", rolagemGlobal: true }) &&
            igual(v({ tipo: "PUSH", chave: "k2" }, "k1", "POP"), { tipo: "POP", rolagemGlobal: true }) &&
            igual(v({ tipo: "POP", chave: "k1" }, "k1", "POP"), { tipo: "POP", rolagemGlobal: true }),
        );
        const quadros = async (n = 3) => {
          await act(async () => {
            for (let i = 0; i < n; i += 1) await new Promise((pronto) => janela.requestAnimationFrame(() => pronto()));
          });
        };
        const rolagemAntes = Object.getOwnPropertyDescriptor(janela, "scrollY");
        const rolarPara = (y) => Object.defineProperty(janela, "scrollY", { value: y, configurable: true, writable: true });
        const alvos = () => rolagens.map((a) => (a[0] !== null && typeof a[0] === "object" ? a[0].top : a[1]));
        try {
          leitura.lista = { ok: true, dados: ABERTAS };
          leitura.situacoes[A.slug] = situacaoDe(A);
          leitura.situacoes[B.slug] = situacaoDe(B);
          rolagens.length = 0;
          rolarPara(0);
          const tela = await montar("/carreiras", {
            caso: "Dentro do AnimatedRoutes",
            ateQue: () => true,
            comAnimatedRoutes: true,
          });
          await esperarAte(() => tela.lista() === m.LISTA_PRONTA, "Dentro do AnimatedRoutes: a lista chega");
          await quadros();
          afirmar(
            "dentro do `AnimatedRoutes` real, carregamento direto de `/carreiras` (POP): nenhuma rolagem forçada e o foco não é roubado para o `<h1>`",
            rolagens.length === 0 && focado() !== tela.q("h1"),
            `rolagens ${JSON.stringify(alvos())} | foco ${focado()?.tagName}`,
          );

          /* Ida: /carreiras → Vaga A (PUSH, mesma chave de transição). */
          rolarPara(900);
          rolagens.length = 0;
          await tela.clicar(
            tela.q(`article[data-vaga="${A.slug}"] a[data-acao="ver-vaga"]`),
            "Ver vaga (dentro do AnimatedRoutes)",
            () => tela.situacao() === m.VAGA_ABERTA && igual(tela.h1s(), [A.titulo]),
          );
          await quadros();
          afirmar(
            "dentro do `AnimatedRoutes` real, `/carreiras` → Vaga (PUSH): o foco vai ao `<h1>` da Vaga, e a página sobe ao topo UMA vez (a rolagem é do `AnimatedRoutes`, sem uma segunda da página)",
            tela.onde() === `/carreiras/${A.slug}` && focado() === tela.q("h1") && igual(alvos(), [0]),
            `${tela.onde()} | rolagens ${JSON.stringify(alvos())} | foco ${focado()?.tagName} ${focado()?.textContent?.slice(0, 30)}`,
          );

          /* Ida: Vaga A → Vaga B, pelas outras vagas (PUSH). A posição de A
             fica anotada em 640 para a volta. */
          rolarPara(640);
          rolagens.length = 0;
          await tela.clicar(
            tela.q(`[data-papel="outras-vagas"] article[data-vaga="${B.slug}"] a[data-acao="ver-vaga"]`),
            "a outra vaga (dentro do AnimatedRoutes)",
            () => tela.situacao() === m.VAGA_ABERTA && igual(tela.h1s(), [B.titulo]),
          );
          await quadros();
          afirmar(
            "dentro do `AnimatedRoutes` real, Vaga → outra Vaga (PUSH): o foco vai ao `<h1>` da Vaga nova, e a página sobe ao topo UMA vez",
            tela.onde() === `/carreiras/${B.slug}` && focado() === tela.q("h1") && igual(alvos(), [0]),
            `${tela.onde()} | rolagens ${JSON.stringify(alvos())} | foco ${focado()?.tagName} ${focado()?.textContent?.slice(0, 30)}`,
          );

          /* Volta pelo navegador (POP) para A: a posição anotada volta, nada de
             topo, e o foco não é puxado para o `<h1>`. */
          const botao = tela.q('a[data-acao="voltar"]');
          botao?.focus();
          rolarPara(0);
          rolagens.length = 0;
          await tela.ir(-1, () => tela.situacao() === m.VAGA_ABERTA && igual(tela.h1s(), [A.titulo]));
          await quadros();
          afirmar(
            "dentro do `AnimatedRoutes` real, voltar (POP) para a Vaga anterior: a posição anotada (640) é restaurada, NENHUMA rolagem ao topo briga com ela, e o foco não vai ao `<h1>`",
            tela.onde() === `/carreiras/${A.slug}` && igual(alvos(), [640]) && focado() !== tela.q("h1"),
            `${tela.onde()} | rolagens ${JSON.stringify(alvos())} | foco ${focado()?.tagName}`,
          );
          await tela.desmontar();

          /* Carregamento direto numa Vaga, dentro do `AnimatedRoutes`. */
          rolagens.length = 0;
          const direta = await montar(`/carreiras/${B.slug}`, {
            caso: "Vaga direta dentro do AnimatedRoutes",
            ateQue: () => janela.document.querySelector('[data-papel="outras-vagas"]') !== null,
            comAnimatedRoutes: true,
          });
          await quadros();
          afirmar(
            "dentro do `AnimatedRoutes` real, carregamento direto de uma Vaga (POP): nenhuma rolagem forçada e o foco não é roubado para o `<h1>`",
            direta.situacao() === m.VAGA_ABERTA && rolagens.length === 0 && focado() !== direta.q("h1"),
            `rolagens ${JSON.stringify(alvos())} | foco ${focado()?.tagName}`,
          );
          await direta.desmontar();
        } finally {
          if (rolagemAntes === undefined) delete janela.scrollY;
          else Object.defineProperty(janela, "scrollY", rolagemAntes);
        }
      }

      /* ══ O que se viu em todas as telas ══ */
      for (const [s, visto] of vistasDaVaga) {
        afirmar(
          `a tela \`${s}\` da Vaga foi vista montada, e em TODA vez teve um corpo só (o da situação) dentro de \`<main>\`, ${
            s === m.VAGA_CARREGANDO ? "sem `<h1>`" : "com UM `<h1>` (não vazio, `tabIndex=-1`) dentro de `<main>`"
          }`,
          visto.vezes > 0 && visto.falhas.length === 0,
          `vezes ${visto.vezes} | ${visto.falhas.slice(0, 3).join(" | ")}`,
        );
      }
      afirmar(
        "o carregando da Vaga tem o MESMO recuo superior (Navbar fixa) das telas sem hero (inexistente e erro)",
        recuos.get(m.VAGA_CARREGANDO) !== null &&
          recuos.get(m.VAGA_CARREGANDO) !== undefined &&
          recuos.get(m.VAGA_CARREGANDO) === recuos.get(m.VAGA_INEXISTENTE) &&
          recuos.get(m.VAGA_CARREGANDO) === recuos.get(m.VAGA_ERRO),
        JSON.stringify(Object.fromEntries(recuos)),
      );
      for (const [s, visto] of vistasDaLista) {
        afirmar(
          `a situação \`${s}\` da lista foi vista montada, e em TODA vez com só o seu conteúdo (esqueleto, erro, vazio ou cartões)`,
          visto.vezes > 0 && visto.falhas.length === 0,
          `vezes ${visto.vezes} | ${visto.falhas.slice(0, 3).join(" | ")}`,
        );
      }

      afirmar("o `<head>` terminou como começou em todas as telas", headIntacto());
    } catch (erro) {
      afirmar("as páginas públicas montadas rodaram até o fim sem exceção", false, erro?.stack ?? String(erro));
    } finally {
      /* Revisão da Story 5.7: devolve TUDO o que a montagem trocou. */
      console.error = erroOriginal;
      janela.scrollTo = rolagemDaJanelaAntes;
      for (const nome of Object.getOwnPropertyNames(globalThis)) {
        if (globaisAntes.has(nome)) continue;
        try {
          delete globalThis[nome];
        } catch {
          /* propriedade que não se apaga: a asserção abaixo acusa */
        }
      }
      for (const [nome, descritor] of globaisAntes) {
        const agora = Object.getOwnPropertyDescriptor(globalThis, nome);
        if (mesmoDescritor(agora, descritor)) continue;
        try {
          Object.defineProperty(globalThis, nome, descritor);
        } catch {
          /* propriedade que não se redefine: a asserção abaixo acusa */
        }
      }
      try {
        janela.close();
      } catch {
        /* o navegador de mentira já pode ter fechado */
      }
    }
    const trocados = [...globaisAntes].filter(([nome, d]) => !mesmoDescritor(Object.getOwnPropertyDescriptor(globalThis, nome), d)).map(([n]) => n);
    const sobrando = Object.getOwnPropertyNames(globalThis).filter((nome) => !globaisAntes.has(nome));
    afirmar(
      "a montagem devolveu os globais como os achou (`requestAnimationFrame`, `HTMLElement`, `Node`, `IntersectionObserver`, `IS_REACT_ACT_ENVIRONMENT`, `window`… e o `console.error`), sem deixar nenhum novo",
      trocados.length === 0 && sobrando.length === 0 && console.error === erroOriginal && janela.scrollTo === rolagemDaJanelaAntes,
      `trocados: ${trocados.slice(0, 8).join(", ")} | sobrando: ${sobrando.slice(0, 8).join(", ")}`,
    );
  }
  try {
    rmSync(pasta, { recursive: true, force: true });
  } catch {
    /* presa pelo processo no Windows: a próxima execução varre na entrada */
  }
}

/* ─── (s) A Vaga encontrável por máquina (Story 5.8) ─────────────────────── */

secao("(s) a Vaga encontrável por máquina: o HTML Servido de `/carreiras` e `/carreiras/:slug`, e o `JobPosting` (Story 5.8)");

/*
 * - NODE: `src/domain/carreiras/jobPosting.js` executado contra expectativas
 *   escritas à mão a partir da SPEC (e não contra uma cópia do código);
 * - NODE: a leitura do servidor (`api/_nucleo/leitura.js`) com `buscar`
 *   injetado que conta as idas à rede;
 * - DIRIGIDA: `api/carreiras.js` em GET, HEAD e método estranho, contra um
 *   dublê de PostgREST local, cobrindo a matriz da story;
 * - ESTÁTICA: a ordem das reescritas de `vercel.json` e o teto de `api/`;
 * - REMOTA, só com token: `/carreiras` e um Slug que não existe contra o banco
 *   de verdade, sem criar Vaga nenhuma.
 */

const DOMINIO_S = "https://chatclean.com.br";

/** Igualdade de JSON sem depender da ordem das chaves. */
function jsonCanonico(valor) {
  if (Array.isArray(valor)) return `[${valor.map(jsonCanonico).join(",")}]`;
  if (valor !== null && typeof valor === "object") {
    return `{${Object.keys(valor)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${jsonCanonico(valor[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(valor);
}
const mesmoJson = (a, b) => jsonCanonico(a) === jsonCanonico(b);

let jobPostingMod = null;
let paginaMod = null;
let leituraMod = null;
let metadadosMod = null;
let artigoMod = null;
let shellMod = null;
try {
  jobPostingMod = await import(urlDe("src/domain/carreiras/jobPosting.js"));
  paginaMod = await import(urlDe("api/_nucleo/paginaDeCarreiras.js"));
  leituraMod = await import(urlDe("api/_nucleo/leitura.js"));
  metadadosMod = await import(urlDe("api/_nucleo/metadados.js"));
  artigoMod = await import(urlDe("api/_nucleo/artigo.js"));
  shellMod = await import(urlDe("api/_nucleo/shell.js"));
  afirmar("os módulos da Story 5.8 importam no Node (`jobPosting.js`, `paginaDeCarreiras.js`)", true);
} catch (erro) {
  afirmar("os módulos da Story 5.8 importam no Node (`jobPosting.js`, `paginaDeCarreiras.js`)", false, erro.message);
}

/** A Aberta de referência, na forma da linha de `situacao_da_vaga`. */
const linhaAbertaS = (extra = {}) => ({
  situacao: "aberta",
  id: "22222222-2222-4222-8222-222222222222",
  slug: "analista-de-suporte",
  titulo: "Analista de Suporte",
  resumo: "Atender clientes da ChatClean pelo WhatsApp.",
  descricao_html: HTML_VALIDO,
  departamento: "Atendimento",
  departamento_cor: "var(--categoria-verde-bg)",
  tipo: "CLT",
  equivalente_jobposting: "FULL_TIME",
  nivel: "Pleno",
  nivel_cor: "var(--categoria-azul-bg)",
  modalidade: "presencial",
  localizacao: "Natal, RN",
  link_de_candidatura: "https://exemplo.com/candidatura",
  aberta_em: "2026-09-01T12:00:00+00:00",
  atualizado_em: "2026-09-02T12:00:00+00:00",
  ...extra,
});

/** O `JobPosting` que a SPEC descreve para a Aberta de referência, escrito à mão. */
const JOBPOSTING_ESPERADO = Object.freeze({
  "@context": "https://schema.org",
  "@type": "JobPosting",
  title: "Analista de Suporte",
  description: HTML_VALIDO,
  datePosted: "2026-09-01T12:00:00+00:00",
  employmentType: "FULL_TIME",
  hiringOrganization: {
    "@type": "Organization",
    name: "ChatClean",
    sameAs: DOMINIO_S,
    logo: `${DOMINIO_S}/logotipo-chatclean.png`,
  },
  directApply: false,
  url: `${DOMINIO_S}/carreiras/analista-de-suporte`,
  jobLocation: {
    "@type": "Place",
    address: { "@type": "PostalAddress", addressLocality: "Natal", addressRegion: "RN", addressCountry: "BR" },
  },
});

/* ── Node: o JobPosting puro ── */

if (jobPostingMod !== null) {
  const j = jobPostingMod;
  const raiz = DOMINIO_S;
  afirmar(
    "autoteste: a igualdade de JSON ignora a ordem das chaves e acusa valor diferente",
    mesmoJson({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 }) &&
      !mesmoJson({ a: 1 }, { a: 2 }) &&
      !mesmoJson({ a: [1, 2] }, { a: [2, 1] }) &&
      !mesmoJson({ a: 1 }, { a: 1, b: null }),
  );
  afirmar(
    "Aberta presencial em \"Natal, RN\": o `JobPosting` é EXATAMENTE o da SPEC (título, Descrição, `datePosted` = `aberta_em`, `employmentType`, `hiringOrganization` com logotipo, `directApply: false`, `url` canônica, `jobLocation` Natal/RN/BR)",
    mesmoJson(j.jobPostingDaVaga(linhaAbertaS(), { raiz }), JOBPOSTING_ESPERADO),
    JSON.stringify(j.jobPostingDaVaga(linhaAbertaS(), { raiz })).slice(0, 400),
  );
  const hibrida = j.jobPostingDaVaga(linhaAbertaS({ modalidade: "hibrido", localizacao: "  São Paulo  " }), { raiz });
  afirmar(
    "Híbrida com Localização que não é \"Cidade, UF\": `jobLocation` com o texto inteiro em `addressLocality`, sem `addressRegion`, país BR, e sem `jobLocationType`",
    mesmoJson(hibrida?.jobLocation, {
      "@type": "Place",
      address: { "@type": "PostalAddress", addressLocality: "São Paulo", addressCountry: "BR" },
    }) && !Object.hasOwn(hibrida ?? {}, "jobLocationType"),
    JSON.stringify(hibrida?.jobLocation),
  );
  const remota = j.jobPostingDaVaga(linhaAbertaS({ modalidade: "remoto", localizacao: "" }), { raiz });
  afirmar(
    "Remota: `jobLocationType: TELECOMMUTE` e `applicantLocationRequirements` Brasil, SEM `jobLocation` (mesmo sem Localização)",
    remota !== null &&
      remota.jobLocationType === "TELECOMMUTE" &&
      mesmoJson(remota.applicantLocationRequirements, { "@type": "Country", name: "Brasil" }) &&
      !Object.hasOwn(remota, "jobLocation"),
    JSON.stringify(remota).slice(0, 300),
  );
  const remotaComLocal = j.jobPostingDaVaga(linhaAbertaS({ modalidade: "remoto", localizacao: "Natal, RN" }), { raiz });
  afirmar(
    "Remota com Localização preenchida continua TELECOMMUTE, sem `jobLocation`",
    remotaComLocal?.jobLocationType === "TELECOMMUTE" && !Object.hasOwn(remotaComLocal ?? {}, "jobLocation"),
  );
  const semEquivalente = ["XPTO", null, "", "full_time"].map((e) =>
    j.jobPostingDaVaga(linhaAbertaS({ equivalente_jobposting: e }), { raiz }),
  );
  afirmar(
    "`employmentType` é OMITIDO quando o Equivalente não está na lista fechada (XPTO, nulo, vazio, caixa errada), e o resto continua",
    semEquivalente.every((d) => d !== null && !Object.hasOwn(d, "employmentType") && d.title === "Analista de Suporte"),
  );
  afirmar(
    "cada Equivalente da lista fechada vira o `employmentType` dele",
    classificacoes.EQUIVALENTES_JOBPOSTING.every(
      (e) => j.jobPostingDaVaga(linhaAbertaS({ equivalente_jobposting: e }), { raiz })?.employmentType === e,
    ),
  );
  const NULOS = [
    ["Descrição nula (recusada por quem serve)", { descricao_html: null }],
    ["Descrição vazia", { descricao_html: "" }],
    ["Descrição só com etiquetas e espaço", { descricao_html: "<p> </p><p>&nbsp;</p>" }],
    ["título vazio", { titulo: "" }],
    ["título em branco", { titulo: "   " }],
    ["título nulo", { titulo: null }],
    ["`aberta_em` nulo", { aberta_em: null }],
    ["`aberta_em` ilegível", { aberta_em: "lixo" }],
    ["presencial sem Localização", { localizacao: "" }],
    ["híbrida com Localização em branco", { modalidade: "hibrido", localizacao: "   " }],
    ["Modalidade desconhecida", { modalidade: "xpto" }],
    ["Modalidade nula", { modalidade: null }],
    ["Slug torto", { slug: "Slug Torto" }],
    ["Slug nulo", { slug: null }],
    /* Revisão da 5.8: `datePosted` só com instante ISO 8601 (data, hora e fuso). */
    ["`aberta_em` em inglês", { aberta_em: "September 1, 2026" }],
    ["`aberta_em` com barras", { aberta_em: "2026/09/01" }],
    ["`aberta_em` só com o ano", { aberta_em: "2026" }],
    ["`aberta_em` sem hora", { aberta_em: "2026-09-01" }],
    ["`aberta_em` sem fuso", { aberta_em: "2026-09-01T12:00:00" }],
  ];
  const naoNulos = [];
  const lancaram = [];
  for (const [nome, extra] of NULOS) {
    try {
      const d = j.jobPostingDaVaga(linhaAbertaS(extra), { raiz });
      const p = j.problemaNoJobPosting(linhaAbertaS(extra), { raiz });
      if (d !== null || typeof p !== "string" || p === "") naoNulos.push(nome);
    } catch (erro) {
      lancaram.push(`${nome}: ${erro.message}`);
    }
  }
  afirmar(
    `falta campo obrigatório → \`null\` e um motivo, sem lançar (${NULOS.length} casos)`,
    naoNulos.length === 0 && lancaram.length === 0,
    `${naoNulos.join(", ")} | ${lancaram.join(", ")}`,
  );
  afirmar(
    "e a Aberta completa não tem motivo nenhum",
    j.problemaNoJobPosting(linhaAbertaS(), { raiz }) === null,
    String(j.problemaNoJobPosting(linhaAbertaS(), { raiz })),
  );
  let semRaiz = "não rodou";
  try {
    semRaiz = [undefined, "", "chatclean.com.br/x", "javascript:alert(1)", "https://chatclean.com.br/blog"].map(
      (r) => j.jobPostingDaVaga(linhaAbertaS(), { raiz: r }),
    );
  } catch (erro) {
    semRaiz = erro.message;
  }
  afirmar(
    "sem Domínio Canônico válido (ausente, vazio, sem esquema, outro esquema, com caminho) → `null`, sem lançar",
    Array.isArray(semRaiz) && semRaiz.every((d) => d === null),
    JSON.stringify(semRaiz).slice(0, 200),
  );
  afirmar(
    "Vaga ausente ou que não é objeto → `null`, sem lançar",
    [null, undefined, "x", 5].every((v) => j.jobPostingDaVaga(v, { raiz }) === null) && j.jobPostingDaVaga(linhaAbertaS()) === null,
  );
  const outraRaiz = j.jobPostingDaVaga(linhaAbertaS(), { raiz: "https://outro.exemplo.com/" });
  afirmar(
    "a `url`, o `sameAs` e o logotipo saem do Domínio Canônico passado (com a barra final aparada), e de nada mais",
    outraRaiz?.url === "https://outro.exemplo.com/carreiras/analista-de-suporte" &&
      outraRaiz?.hiringOrganization?.sameAs === "https://outro.exemplo.com" &&
      outraRaiz?.hiringOrganization?.logo === "https://outro.exemplo.com/logotipo-chatclean.png",
    JSON.stringify(outraRaiz?.hiringOrganization),
  );
  afirmar(
    "o título do `JobPosting` sai aparado",
    j.jobPostingDaVaga(linhaAbertaS({ titulo: "  Analista de Suporte  " }), { raiz })?.title === "Analista de Suporte",
  );
  afirmar(
    "o endereço de \"Cidade, UF\" só separa com UF de DUAS maiúsculas depois da vírgula",
    mesmoJson(j.enderecoPostalDaLocalizacao("Natal, RN"), { "@type": "PostalAddress", addressLocality: "Natal", addressRegion: "RN", addressCountry: "BR" }) &&
      mesmoJson(j.enderecoPostalDaLocalizacao("Mossoró,RN"), { "@type": "PostalAddress", addressLocality: "Mossoró", addressRegion: "RN", addressCountry: "BR" }) &&
      mesmoJson(j.enderecoPostalDaLocalizacao("Natal, rn"), { "@type": "PostalAddress", addressLocality: "Natal, rn", addressCountry: "BR" }) &&
      mesmoJson(j.enderecoPostalDaLocalizacao("Natal, RNX"), { "@type": "PostalAddress", addressLocality: "Natal, RNX", addressCountry: "BR" }) &&
      mesmoJson(j.enderecoPostalDaLocalizacao(", RN"), { "@type": "PostalAddress", addressLocality: ", RN", addressCountry: "BR" }) &&
      j.enderecoPostalDaLocalizacao("   ") === null &&
      /* Revisão da 5.8: só UF da lista fechada vira `addressRegion`. */
      mesmoJson(j.enderecoPostalDaLocalizacao("Natal, XX"), { "@type": "PostalAddress", addressLocality: "Natal, XX", addressCountry: "BR" }) &&
      mesmoJson(j.enderecoPostalDaLocalizacao("Lisboa, PT"), { "@type": "PostalAddress", addressLocality: "Lisboa, PT", addressCountry: "BR" }) &&
      mesmoJson(j.enderecoPostalDaLocalizacao("Brasília, DF"), { "@type": "PostalAddress", addressLocality: "Brasília", addressRegion: "DF", addressCountry: "BR" }) &&
      Array.isArray(j.UFS_DO_BRASIL) &&
      j.UFS_DO_BRASIL.length === 27 &&
      new Set(j.UFS_DO_BRASIL).size === 27 &&
      ["AC", "DF", "RN", "SP", "TO"].every((uf) => j.UFS_DO_BRASIL.includes(uf)) &&
      !j.UFS_DO_BRASIL.includes("PT") &&
      Object.isFrozen(j.UFS_DO_BRASIL) &&
      j.enderecoPostalDaLocalizacao(null) === null,
  );
  afirmar(
    /* Troca registrada em 2026-09-29 (Spec Change Log da 5.8): o Felix trocou
       o separador " — " por " | ". Antes: "{título} — Vagas ChatClean". */
    "o título servido da Vaga é \"{título} | Vagas ChatClean\" (o separador escolhido pelo Felix em 2026-09-29), aparado, e ausente para título em branco",
    j.tituloServidoDaVaga("Analista de Suporte") === "Analista de Suporte | Vagas ChatClean" &&
      j.tituloServidoDaVaga("  Analista  ") === "Analista | Vagas ChatClean" &&
      j.tituloServidoDaVaga("  ") === null &&
      j.tituloServidoDaVaga(null) === null &&
      j.TITULO_DA_LISTAGEM_DE_VAGAS === "Vagas ChatClean | Trabalhe com a gente",
  );
  afirmar(
    "o título de reserva da Encerrada é UM só: o do domínio é o MESMO que a página do navegador reexporta",
    typeof regrasDaVaga.TITULO_DE_RESERVA_DA_ENCERRADA === "string" &&
      regrasDaVaga.TITULO_DE_RESERVA_DA_ENCERRADA !== "" &&
      carreirasPublico?.TITULO_DE_RESERVA_DA_ENCERRADA === regrasDaVaga.TITULO_DE_RESERVA_DA_ENCERRADA &&
      !/\bTITULO_DE_RESERVA_DA_ENCERRADA\s*=/.test(semComentarios(ler("src/pages/carreirasPublico.js") ?? "")),
  );
  const fonteJob = semComentarios(ler("src/domain/carreiras/jobPosting.js") ?? "");
  /* Troca registrada em 2026-09-29 (Spec Change Log da 5.8). Antes: "o
     travessão do título mora numa constante só, e é o único travessão fora de
     comentário do módulo". Com o separador " | ", o módulo não precisa mais de
     travessão nenhum, e a exceção de `verificar:interface` saiu. */
  afirmar(
    "o separador do título mora numa constante só (`SEPARADOR_DO_TITULO_DA_VAGA` = \" | \"), e o módulo não tem travessão fora de comentário",
    !fonteJob.includes("—") &&
      /SEPARADOR_DO_TITULO_DA_VAGA\s*=\s*" \| "/.test(fonteJob) &&
      j.SEPARADOR_DO_TITULO_DA_VAGA === " | ",
  );
}

if (paginaMod !== null) {
  const perigoso = { a: "</script><script>alert(1)</script>", b: "<!-- x -->", c: "</SCRIPT >" };
  const serializado = paginaMod.serializarJsonLd(perigoso);
  let devolta = null;
  try {
    devolta = JSON.parse(serializado);
  } catch {
    devolta = null;
  }
  afirmar(
    "a serialização do JSON-LD escapa TODO `<` (nenhum `</script`, nenhum `<!--`) e continua sendo o MESMO JSON",
    !serializado.includes("<") && mesmoJson(devolta, perigoso),
    serializado.slice(0, 120),
  );
  afirmar(
    "as etiquetas de cache de Carreiras são próprias (sem a do Blog): a coleção, e a da Vaga só com Slug no vocabulário",
    igual(paginaMod.etiquetasDeCarreiras(), ["carreiras"]) &&
      igual(paginaMod.etiquetasDeCarreiras("analista-de-suporte"), ["carreiras", "vaga:analista-de-suporte"]) &&
      igual(paginaMod.etiquetasDeCarreiras("com espaço, e vírgula"), ["carreiras"]) &&
      igual(paginaMod.etiquetasDeCarreiras(null), ["carreiras"]),
  );
  afirmar(
    "o status de cada situação é o da SPEC (Aberta 200, Encerrada 410, inexistente 404), em mapa fechado e congelado",
    mesmoJson(paginaMod.STATUS_DA_SITUACAO_DA_VAGA, { aberta: 200, encerrada: 410, inexistente: 404 }) &&
      Object.isFrozen(paginaMod.STATUS_DA_SITUACAO_DA_VAGA) &&
      paginaMod.STATUS_DA_LISTAGEM_DE_VAGAS === 200,
  );
  afirmar(
    "o pedido: sem `slug` na consulta é a listagem; com `slug` (mesmo vazio ou repetido) é a página de uma Vaga, e o torto vira nulo",
    mesmoJson(paginaMod.pedidoDeCarreiras({ query: {} }), { pagina: "listagem" }) &&
      mesmoJson(paginaMod.pedidoDeCarreiras({}), { pagina: "listagem" }) &&
      mesmoJson(paginaMod.pedidoDeCarreiras({ query: { slug: "x" } }), { pagina: "vaga", slug: "x" }) &&
      mesmoJson(paginaMod.pedidoDeCarreiras({ query: { slug: "" } }), { pagina: "vaga", slug: null }) &&
      mesmoJson(paginaMod.pedidoDeCarreiras({ query: { slug: ["a", "b"] } }), { pagina: "vaga", slug: null }),
  );
}

/* ── Node: a leitura do servidor, com `buscar` injetado ── */

if (leituraMod !== null) {
  const AMB = { SUPABASE_URL: "http://leitura.duble", SUPABASE_CHAVE_PUBLICAVEL: "sb_publishable_leitura_5_8" };
  const buscarCom = (status, corpo, registro) => async (url, opcoes) => {
    registro.push({ url, opcoes });
    if (status === "lanca") throw new TypeError("fetch failed");
    return { ok: status >= 200 && status < 300, status, json: async () => corpo };
  };
  const TORTOS = ["../x", "Maiusculas", "", " dev", "dev ", "dev_x", "a,b", "a".repeat(201), null, undefined, ["dev"], 5, { slug: "dev" }];
  const foram = [];
  const naoInexistente = [];
  for (const slug of TORTOS) {
    const reg = [];
    const r = await leituraMod.situacaoDaVagaServida(slug, { ambiente: AMB, buscar: buscarCom(200, [linhaAbertaS()], reg) });
    if (reg.length > 0) foram.push(JSON.stringify(slug) ?? "undefined");
    if (!(r.ok === true && r.situacao === "inexistente" && r.vaga === null)) naoInexistente.push(JSON.stringify(slug) ?? "undefined");
  }
  afirmar(
    `Slug torto (${TORTOS.length} formas: \`../x\`, maiúsculas, vazio, espaço, sublinhado, vírgula, longo demais, nulo, lista, número, objeto) é inexistente com ZERO idas à rede`,
    foram.length === 0 && naoInexistente.length === 0,
    `foram à rede: ${foram.join(", ")} | não inexistente: ${naoInexistente.join(", ")}`,
  );
  {
    const reg = [];
    const r = await leituraMod.situacaoDaVagaServida("analista-de-suporte", {
      ambiente: AMB,
      buscar: buscarCom(200, [linhaAbertaS()], reg),
    });
    afirmar(
      "controle: o Slug bem formado vai UMA vez à rede, pela RPC `situacao_da_vaga` com `p_slug`, com a chave PUBLICÁVEL",
      reg.length === 1 &&
        reg[0].url === "http://leitura.duble/rest/v1/rpc/situacao_da_vaga" &&
        reg[0].opcoes?.body === JSON.stringify({ p_slug: "analista-de-suporte" }) &&
        reg[0].opcoes?.headers?.apikey === AMB.SUPABASE_CHAVE_PUBLICAVEL &&
        r.ok === true &&
        r.situacao === "aberta" &&
        r.vaga?.titulo === "Analista de Suporte" &&
        r.vaga?.descricao_html === HTML_VALIDO,
      `${reg.length} ida(s) | ${reg[0]?.url}`,
    );
    const comExtra = await leituraMod.situacaoDaVagaServida("analista-de-suporte", {
      ambiente: AMB,
      buscar: buscarCom(200, [linhaAbertaS({ coluna_nova: "vazou" })], []),
    });
    afirmar(
      "a Aberta lida passa por LISTA DE PERMISSÃO: uma coluna que a função passasse a devolver, e que ninguém listou, não chega à Vaga",
      comExtra.ok === true && !Object.hasOwn(comExtra.vaga ?? {}, "coluna_nova") && Object.hasOwn(comExtra.vaga ?? {}, "equivalente_jobposting"),
    );
  }
  const FALHAS = [
    ["HTTP 500", 500, {}],
    ["rede fora", "lanca", null],
    ["corpo que não é lista", 200, { situacao: "aberta" }],
    ["lista vazia", 200, []],
    ["duas linhas", 200, [linhaAbertaS(), linhaAbertaS()]],
    ["linha que não é objeto", 200, ["aberta"]],
    ["situação fora do vocabulário", 200, [{ situacao: "rascunho" }]],
    ["situação ausente", 200, [{ slug: "x" }]],
    ["Aberta sem título", 200, [linhaAbertaS({ titulo: "  " })]],
    ["Aberta com Slug torto", 200, [linhaAbertaS({ slug: "Torto" })]],
    ["Encerrada trazendo conteúdo", 200, [{ situacao: "encerrada", slug: "x", titulo: "X", descricao_html: "<p>vazou</p>" }]],
    /* Revisão da 5.8: o Slug da Encerrada também é conferido, e tipo errado é defeito. */
    ["Encerrada com Slug torto", 200, [{ situacao: "encerrada", slug: "Torto Demais", titulo: "X" }]],
    ["Encerrada sem Slug", 200, [{ situacao: "encerrada", slug: null, titulo: "X" }]],
    ["Encerrada com título número", 200, [{ situacao: "encerrada", slug: "x", titulo: 5 }]],
    ["Aberta com título número", 200, [linhaAbertaS({ titulo: 42 })]],
    ["Aberta com Resumo objeto", 200, [linhaAbertaS({ resumo: { texto: "x" } })]],
    ["Aberta com Localização número", 200, [linhaAbertaS({ localizacao: 5 })]],
    ["Aberta com Descrição lista", 200, [linhaAbertaS({ descricao_html: ["<p>x</p>"] })]],
    ["Aberta com `aberta_em` número", 200, [linhaAbertaS({ aberta_em: 1756728000000 })]],
  ];
  const aceitas = [];
  for (const [nome, status, corpo] of FALHAS) {
    const r = await leituraMod.situacaoDaVagaServida("analista-de-suporte", { ambiente: AMB, buscar: buscarCom(status, corpo, []) });
    if (!(r.ok === false && typeof r.defeito === "string" && r.defeito !== "")) aceitas.push(nome);
  }
  afirmar(
    `a situação lida torta é FALHA DE LEITURA com defeito nomeado, nunca inexistente (${FALHAS.length} formas)`,
    aceitas.length === 0,
    aceitas.join(", "),
  );
  const encerrada = await leituraMod.situacaoDaVagaServida("analista-de-suporte", {
    ambiente: AMB,
    buscar: buscarCom(200, [{ situacao: "encerrada", slug: "analista-de-suporte", titulo: "Analista", resumo: null }], []),
  });
  afirmar(
    "a Encerrada chega só com Slug e título",
    encerrada.ok === true && encerrada.situacao === "encerrada" && mesmoJson(encerrada.vaga, { slug: "analista-de-suporte", titulo: "Analista" }),
    JSON.stringify(encerrada),
  );
  const ABERTAS = [
    { situacao: "aberta", slug: "a-1", titulo: "A 1", modalidade: "remoto", localizacao: "", aberta_em: "2026-09-02T00:00:00Z" },
    { situacao: "aberta", slug: "a-2", titulo: "A 2", modalidade: "presencial", localizacao: "Natal, RN", aberta_em: "2026-09-01T00:00:00Z" },
  ];
  const reg = [];
  const lista = await leituraMod.vagasAbertasServidas({ ambiente: AMB, buscar: buscarCom(200, ABERTAS, reg) });
  afirmar(
    "as Vagas Abertas vêm pela RPC `vagas_abertas`, na ordem do banco",
    reg.length === 1 &&
      reg[0].url === "http://leitura.duble/rest/v1/rpc/vagas_abertas" &&
      lista.ok === true &&
      igual(lista.vagas.map((v) => v.slug), ["a-1", "a-2"]),
    JSON.stringify(lista).slice(0, 200),
  );
  const tortas = [];
  for (const [nome, status, corpo] of [
    ["HTTP 500", 500, {}],
    ["rede fora", "lanca", null],
    ["corpo que não é lista", 200, { x: 1 }],
    ["linha sem Slug", 200, [{ situacao: "aberta", titulo: "X" }]],
    ["linha que não é Aberta", 200, [{ situacao: "encerrada", slug: "x", titulo: "X" }]],
    ["linha sem título", 200, [{ situacao: "aberta", slug: "x", titulo: "" }]],
    ["linha com Modalidade objeto", 200, [{ situacao: "aberta", slug: "x", titulo: "X", modalidade: { v: 1 } }]],
    ["linha com título número", 200, [{ situacao: "aberta", slug: "x", titulo: 7 }]],
  ]) {
    const r = await leituraMod.vagasAbertasServidas({ ambiente: AMB, buscar: buscarCom(status, corpo, []) });
    if (!(r.ok === false && typeof r.defeito === "string")) tortas.push(nome);
  }
  afirmar(
    "a lista lida torta é FALHA DE LEITURA, e nunca \"nenhuma vaga\"",
    tortas.length === 0,
    tortas.join(", "),
  );
}

/* ── Dirigida: `api/carreiras.js` contra um dublê de PostgREST ── */

if (moduloDoHandler !== null && paginaMod !== null && shellMod !== null && metadadosMod !== null && artigoMod !== null) {
  const handler = moduloDoHandler.default;
  const shell = await shellMod.lerShell();
  afirmar(
    "o shell do build está embutido (`npm run build` antes de verificar)",
    shell.ok === true,
    shell.defeito ?? "",
  );

  /** As respostas do dublê, por função, trocadas a cada caso. */
  const respostasS = { situacao_da_vaga: [200, []], vagas_abertas: [200, []] };
  const pedidosS = [];
  const dubleS = createServer((req, res) => {
    let bruto = "";
    req.on("data", (p) => {
      bruto += p;
    });
    req.on("end", () => {
      pedidosS.push({ metodo: req.method, url: req.url, corpo: bruto, apikey: req.headers.apikey });
      const nome = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(req.url ?? "")?.[1];
      const [status, dados] = respostasS[nome] ?? [404, { message: "função fora do dublê" }];
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(typeof dados === "string" ? dados : JSON.stringify(dados));
    });
  });
  await new Promise((pronto) => dubleS.listen(0, "127.0.0.1", pronto));
  const URL_DO_DUBLE_S = `http://127.0.0.1:${dubleS.address().port}`;
  const AMBIENTE_S = {
    VITE_DOMINIO_DO_SITE: DOMINIO_S,
    SUPABASE_URL: URL_DO_DUBLE_S,
    SUPABASE_CHAVE_PUBLICAVEL: "sb_publishable_duble_5_8",
    VITE_SUPABASE_URL: undefined,
    VITE_SUPABASE_PUBLISHABLE_KEY: undefined,
  };

  /**
   * Dirige o handler REAL com requisição e resposta de mentira. A requisição
   * traz um `host` e uma `url` de intruso: a canônica não pode sair deles.
   */
  const pagina = async ({ metodo = "GET", query = {}, ambiente = {}, corpo = undefined, injetar = null } = {}) => {
    const r = { status: null, cabecalhos: {}, corpo: null, enviou: false, terminou: false, eventos: [], antes: pedidosS.length };
    const res = {
      setHeader(nome, valor) {
        r.cabecalhos[nome] = valor;
      },
      status(codigo) {
        r.status = codigo;
        return res;
      },
      send(saida) {
        r.enviou = true;
        r.corpo = saida;
        return res;
      },
      end(...args) {
        r.terminou = true;
        if (args.length > 0 && args[0] !== undefined && args[0] !== "") r.corpo = args[0];
        return res;
      },
      json(saida) {
        r.enviou = true;
        r.corpo = saida;
        return res;
      },
    };
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => typeof v === "string")).toString();
    const req = {
      method: metodo,
      query,
      url: `/api/carreiras${qs ? `?${qs}` : ""}`,
      headers: { host: "intruso.exemplo", "x-forwarded-host": "intruso.exemplo" },
      body: corpo,
    };
    const todos = { ...AMBIENTE_S, ...ambiente };
    const guardado = {};
    for (const [nome, valor] of Object.entries(todos)) {
      guardado[nome] = process.env[nome];
      if (valor === undefined) delete process.env[nome];
      else process.env[nome] = valor;
    }
    const aviso = console.warn;
    const erro = console.error;
    console.warn = (...p) => r.eventos.push(p.join(" "));
    console.error = (...p) => r.eventos.push(p.join(" "));
    try {
      await (injetar === null ? handler(req, res) : paginaMod.servirCarreiras(req, res, injetar));
    } catch (e) {
      r.lancou = String(e?.message ?? e);
    } finally {
      console.warn = aviso;
      console.error = erro;
      for (const [nome, valor] of Object.entries(guardado)) {
        if (valor === undefined) delete process.env[nome];
        else process.env[nome] = valor;
      }
    }
    r.pedidos = pedidosS.slice(r.antes);
    r.html = typeof r.corpo === "string" ? r.corpo : "";
    return r;
  };

  /* Leitores do documento servido. */
  const recorte = (html, inicio, fim) => {
    const i = html.indexOf(inicio);
    if (i === -1) return null;
    const j = html.indexOf(fim, i + inicio.length);
    return j === -1 ? null : html.slice(i + inicio.length, j);
  };
  const regiaoDeMeta = (html) => recorte(html, metadadosMod.MARCA_INICIO, metadadosMod.MARCA_FIM);
  const regiaoDoCorpo = (html) => recorte(html, artigoMod.MARCA_CORPO_INICIO, artigoMod.MARCA_CORPO_FIM);
  const foraDasRegioes = (html) => {
    let texto = String(html ?? "");
    for (const [inicio, fim] of [
      [metadadosMod.MARCA_INICIO, metadadosMod.MARCA_FIM],
      [artigoMod.MARCA_CORPO_INICIO, artigoMod.MARCA_CORPO_FIM],
    ]) {
      const i = texto.indexOf(inicio);
      const j = texto.indexOf(fim, i === -1 ? 0 : i);
      if (i === -1 || j === -1) return null;
      const fecha = texto.indexOf("-->", j);
      if (fecha === -1) return null;
      texto = texto.slice(0, i) + texto.slice(fecha + 3);
    }
    return texto;
  };
  const tituloDe = (html) => {
    const todos = [...String(regiaoDeMeta(html) ?? "").matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]);
    return todos.length === 1 ? todos[0] : `(${todos.length} títulos)`;
  };
  const metaDe = (html, chave, nome) => {
    const alvo = `<meta ${chave}="${nome}" content="`;
    const trechos = String(regiaoDeMeta(html) ?? "").split(alvo).slice(1);
    if (trechos.length !== 1) return trechos.length === 0 ? null : `(${trechos.length})`;
    return trechos[0].slice(0, trechos[0].indexOf('"'));
  };
  const canonicaDe = (html) => {
    const todas = [...String(html).matchAll(/<link rel="canonical" href="([^"]*)" \/>/g)].map((m) => m[1]);
    return todas.length === 1 ? todas[0] : `(${todas.length} canônicas)`;
  };
  const jsonLdsDoCorpo = (html) =>
    [...String(regiaoDoCorpo(html) ?? "").matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => {
      try {
        return JSON.parse(m[1]);
      } catch {
        return { naoEJson: m[1].slice(0, 80) };
      }
    });
  const noscriptDe = (html) => recorte(String(regiaoDoCorpo(html) ?? ""), "<noscript>", "</noscript>");
  const desescapar = (t) =>
    String(t ?? "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  afirmar(
    "autoteste dos leitores: acham título, meta, canônica e JSON-LD num documento sintético, e contam repetição",
    (() => {
      const M = metadadosMod;
      const A = artigoMod;
      const doc =
        `${M.MARCA_INICIO} -->\n<title>T</title>\n<meta name="description" content="D" />\n<link rel="canonical" href="C" />\n${M.MARCA_FIM} -->\n` +
        `${A.MARCA_CORPO_INICIO} -->\n<noscript><h1>H</h1></noscript>\n<script type="application/ld+json">{"a":1}</script>\n${A.MARCA_CORPO_FIM} -->`;
      const duplo = doc.replace("<title>T</title>", "<title>T</title><title>U</title>");
      return (
        tituloDe(doc) === "T" &&
        metaDe(doc, "name", "description") === "D" &&
        canonicaDe(doc) === "C" &&
        mesmoJson(jsonLdsDoCorpo(doc), [{ a: 1 }]) &&
        noscriptDe(doc) === "<h1>H</h1>" &&
        tituloDe(duplo) === "(2 títulos)"
      );
    })(),
  );

  /** O documento servido fica FORA de `#root`, e a região da home foi trocada inteira. */
  const conferirDocumento = (r, rotulo) => {
    const html = r.html;
    const raiz = html.indexOf('<div id="root"></div>');
    const fimDoNoscript = html.lastIndexOf("</noscript>");
    const fimDoCorpo = html.indexOf(artigoMod.MARCA_CORPO_FIM);
    afirmar(
      `${rotulo}: o \`<noscript>\` está na região do corpo, ANTES de \`<div id="root">\`, e o contêiner continua vazio`,
      raiz !== -1 && fimDoNoscript !== -1 && fimDoNoscript < fimDoCorpo && fimDoCorpo < raiz && html.split('<div id="root">').length === 2,
      `root ${raiz} | noscript ${fimDoNoscript} | fim do corpo ${fimDoCorpo}`,
    );
    const meta = regiaoDeMeta(html) ?? "";
    afirmar(
      `${rotulo}: a região de metadados da home foi trocada INTEIRA (nada de FAQPage, nem a canônica, nem o título da home), e o resto do shell é o do build`,
      meta !== "" &&
        !html.includes("FAQPage") &&
        !html.includes(`<link rel="canonical" href="${DOMINIO_S}/" />`) &&
        !/<title>CRM e ChatBot/.test(html) &&
        foraDasRegioes(html) !== null &&
        foraDasRegioes(html) === foraDasRegioes(shell.html),
      tituloDe(html),
    );
    afirmar(
      `${rotulo}: nada vem da requisição (o \`host\` de intruso não aparece em lugar nenhum), e o tipo é HTML`,
      !html.includes("intruso.exemplo") && String(r.cabecalhos["Content-Type"] ?? "").startsWith("text/html"),
    );
  };

  try {
    /* ── Aberta presencial ── */
    respostasS.situacao_da_vaga = [200, [linhaAbertaS()]];
    {
      const r = await pagina({ query: { slug: "analista-de-suporte" } });
      afirmar(
        "controle: a rota chega ao dublê pela RPC `situacao_da_vaga`, com o Slug pedido e a chave publicável",
        r.pedidos.length === 1 &&
          r.pedidos[0].url === "/rest/v1/rpc/situacao_da_vaga" &&
          r.pedidos[0].corpo === JSON.stringify({ p_slug: "analista-de-suporte" }) &&
          r.pedidos[0].apikey === "sb_publishable_duble_5_8",
        r.pedidos.map((p) => `${p.url} ${p.corpo}`).join(" | ") || r.lancou || "nenhum pedido",
      );
      afirmar(
        "Aberta: 200, `public, s-maxage=60`, diagnóstico ok, etiquetas `carreiras` e `vaga:<Slug do banco>` (sem a do Blog)",
        r.status === 200 &&
          r.cabecalhos["Cache-Control"] === "public, s-maxage=60" &&
          r.cabecalhos["X-Entrega-Diagnostico"] === "ok" &&
          r.cabecalhos["Vercel-Cache-Tag"] === "carreiras,vaga:analista-de-suporte" &&
          r.enviou === true,
        `HTTP ${r.status} | ${r.cabecalhos["Cache-Control"]} | ${r.cabecalhos["Vercel-Cache-Tag"]} | ${r.lancou ?? ""}`,
      );
      afirmar(
        "Aberta: title \"{título} | Vagas ChatClean\", descrição = Resumo, og/twitter com o título e a Imagem Padrão do Site, `og:type` website",
        tituloDe(r.html) === "Analista de Suporte | Vagas ChatClean" &&
          metaDe(r.html, "name", "description") === "Atender clientes da ChatClean pelo WhatsApp." &&
          metaDe(r.html, "property", "og:title") === "Analista de Suporte | Vagas ChatClean" &&
          metaDe(r.html, "name", "twitter:title") === "Analista de Suporte | Vagas ChatClean" &&
          metaDe(r.html, "property", "og:description") === "Atender clientes da ChatClean pelo WhatsApp." &&
          metaDe(r.html, "property", "og:type") === "website" &&
          metaDe(r.html, "property", "og:image") === `${DOMINIO_S}/imagem-padrao-do-site.png` &&
          metaDe(r.html, "name", "twitter:image") === `${DOMINIO_S}/imagem-padrao-do-site.png` &&
          metaDe(r.html, "property", "og:image:width") === "1200",
        `${tituloDe(r.html)} | ${metaDe(r.html, "name", "description")}`,
      );
      conferirDocumento(r, "Aberta");
      const ns = noscriptDe(r.html) ?? "";
      afirmar(
        "Aberta: o `<noscript>` traz UM `<h1>` com o título, as Classificações (Departamento, Tipo, Nível, local), a Descrição e o Candidatar-se",
        (ns.match(/<h1>/g) ?? []).length === 1 &&
          ns.includes("<h1>Analista de Suporte</h1>") &&
          ns.includes("<li>Departamento: Atendimento</li>") &&
          ns.includes("<li>Tipo: CLT</li>") &&
          ns.includes("<li>Nível: Pleno</li>") &&
          ns.includes(`<li>Local: ${regrasDaVaga.textoDoLocal({ modalidade: "presencial", localizacao: "Natal, RN" })}</li>`) &&
          HTML_VALIDO !== "" &&
          ns.includes(HTML_VALIDO) &&
          ns.includes('<a href="https://exemplo.com/candidatura" rel="noopener noreferrer">Candidatar-se</a>'),
        ns.slice(0, 300),
      );
      const lds = jsonLdsDoCorpo(r.html);
      afirmar(
        "Aberta presencial: UM JSON-LD no corpo, e ele é EXATAMENTE o `JobPosting` da SPEC (`jobLocation` Natal/RN/BR)",
        lds.length === 1 && mesmoJson(lds[0], JOBPOSTING_ESPERADO),
        JSON.stringify(lds).slice(0, 400),
      );
    }

    /* ── A canônica vem do Slug do BANCO, e não do pedido ── */
    respostasS.situacao_da_vaga = [200, [linhaAbertaS({ slug: "slug-do-banco" })]];
    {
      const r = await pagina({ query: { slug: "pedido-na-url" } });
      const lds = jsonLdsDoCorpo(r.html);
      afirmar(
        "a canônica, o `og:url` e a `url` do `JobPosting` são o Domínio Canônico + `/carreiras/<Slug do BANCO>`, nunca o Slug pedido nem a requisição",
        r.status === 200 &&
          canonicaDe(r.html) === `${DOMINIO_S}/carreiras/slug-do-banco` &&
          metaDe(r.html, "property", "og:url") === `${DOMINIO_S}/carreiras/slug-do-banco` &&
          lds[0]?.url === `${DOMINIO_S}/carreiras/slug-do-banco` &&
          r.cabecalhos["Vercel-Cache-Tag"] === "carreiras,vaga:slug-do-banco" &&
          !r.html.includes("pedido-na-url"),
        `${canonicaDe(r.html)} | ${lds[0]?.url}`,
      );
    }

    /* ── HEAD da Aberta ── */
    respostasS.situacao_da_vaga = [200, [linhaAbertaS()]];
    {
      const get = await pagina({ query: { slug: "analista-de-suporte" } });
      const head = await pagina({ metodo: "HEAD", query: { slug: "analista-de-suporte" } });
      afirmar(
        "HEAD da Aberta: o MESMO status e os MESMOS cabeçalhos do GET, e nenhum corpo enviado",
        head.status === 200 && mesmoJson(head.cabecalhos, get.cabecalhos) && head.enviou === false && head.terminou === true && head.corpo === null,
        `HTTP ${head.status} | enviou ${head.enviou} | ${JSON.stringify(head.cabecalhos)}`,
      );
    }

    /* ── Aberta remota ── */
    respostasS.situacao_da_vaga = [200, [linhaAbertaS({ modalidade: "remoto", localizacao: "" })]];
    {
      const r = await pagina({ query: { slug: "analista-de-suporte" } });
      const lds = jsonLdsDoCorpo(r.html);
      afirmar(
        "Aberta remota: 200, e o `JobPosting` servido traz `TELECOMMUTE` + Brasil, sem `jobLocation`",
        r.status === 200 &&
          lds.length === 1 &&
          lds[0].jobLocationType === "TELECOMMUTE" &&
          mesmoJson(lds[0].applicantLocationRequirements, { "@type": "Country", name: "Brasil" }) &&
          !Object.hasOwn(lds[0], "jobLocation"),
        JSON.stringify(lds).slice(0, 300),
      );
      afirmar(
        "Aberta remota: o local no `<noscript>` é o da Modalidade",
        (noscriptDe(r.html) ?? "").includes(`<li>Local: ${regrasDaVaga.textoDoLocal({ modalidade: "remoto" })}</li>`),
      );
    }

    /* ── Aberta híbrida ── */
    respostasS.situacao_da_vaga = [200, [linhaAbertaS({ modalidade: "hibrido", localizacao: "Mossoró, RN" })]];
    {
      const r = await pagina({ query: { slug: "analista-de-suporte" } });
      const lds = jsonLdsDoCorpo(r.html);
      afirmar(
        "Aberta híbrida: o `JobPosting` servido traz `jobLocation` com o endereço (Mossoró/RN/BR)",
        lds.length === 1 &&
          mesmoJson(lds[0].jobLocation, {
            "@type": "Place",
            address: { "@type": "PostalAddress", addressLocality: "Mossoró", addressRegion: "RN", addressCountry: "BR" },
          }),
        JSON.stringify(lds[0]?.jobLocation),
      );
    }

    /* ── Escape ── */
    const HOSTIL = `Dev "</script><script>alert('x')</script>" & <b>`;
    const RESUMO_HOSTIL = `Resumo <img src=x onerror=alert(1)> "aspas"`;
    respostasS.situacao_da_vaga = [200, [linhaAbertaS({ titulo: HOSTIL, resumo: RESUMO_HOSTIL })]];
    {
      const r = await pagina({ query: { slug: "analista-de-suporte" } });
      const lds = jsonLdsDoCorpo(r.html);
      afirmar(
        "escape: título e Resumo hostis saem escapados no `<title>`, nas metas e no `<h1>` (nenhum `<script>`/`<img` injetado), e voltam ao texto original quando desescapados",
        r.status === 200 &&
          !r.html.includes("<script>alert") &&
          !r.html.includes("<img src=x") &&
          desescapar(tituloDe(r.html)) === `${HOSTIL} | Vagas ChatClean` &&
          desescapar(metaDe(r.html, "name", "description")) === RESUMO_HOSTIL &&
          (noscriptDe(r.html) ?? "").includes(`<h1>${metadadosMod.escapar(HOSTIL)}</h1>`),
        tituloDe(r.html),
      );
      afirmar(
        "escape: o JSON-LD com o título hostil não fecha o bloco (nenhum `</script` dentro dele) e continua sendo o JSON do título original",
        lds.length === 1 && lds[0].title === HOSTIL && (regiaoDoCorpo(r.html) ?? "").split("</script>").length === 2,
        JSON.stringify(lds).slice(0, 200),
      );
    }

    /* ── Descrição recusada ── */
    respostasS.situacao_da_vaga = [200, [linhaAbertaS({ descricao_html: '<p>Oi</p><img src="x" onerror="alert(1)">' })]];
    {
      const r = await pagina({ query: { slug: "analista-de-suporte" } });
      afirmar(
        "Descrição recusada: continua 200 com `s-maxage=60`, o `<noscript>` SEM a Descrição, SEM `JobPosting`, e o diagnóstico `degradado:conteudo-recusado` com o evento registrado",
        r.status === 200 &&
          r.cabecalhos["Cache-Control"] === "public, s-maxage=60" &&
          r.cabecalhos["X-Entrega-Diagnostico"] === "degradado:conteudo-recusado" &&
          !r.html.includes("onerror") &&
          !(noscriptDe(r.html) ?? "").includes("<p>Oi</p>") &&
          (noscriptDe(r.html) ?? "").includes("<h1>Analista de Suporte</h1>") &&
          jsonLdsDoCorpo(r.html).length === 0 &&
          r.eventos.some((l) => l.includes("[entrega:evento]") && l.includes("degradado:conteudo-recusado")),
        `HTTP ${r.status} | ${r.cabecalhos["X-Entrega-Diagnostico"]} | eventos ${r.eventos.length}`,
      );
    }

    /* ── Aberta sem `aberta_em`: sem JobPosting, página de pé ── */
    respostasS.situacao_da_vaga = [200, [linhaAbertaS({ aberta_em: null })]];
    {
      const r = await pagina({ query: { slug: "analista-de-suporte" } });
      afirmar(
        "Aberta com campo obrigatório do `JobPosting` faltando (`aberta_em`): 200, a Descrição no `<noscript>`, sem JSON-LD, diagnóstico degradado",
        r.status === 200 &&
          jsonLdsDoCorpo(r.html).length === 0 &&
          (noscriptDe(r.html) ?? "").includes(HTML_VALIDO) &&
          r.cabecalhos["X-Entrega-Diagnostico"] === "degradado:conteudo-recusado",
        `HTTP ${r.status} | ${r.cabecalhos["X-Entrega-Diagnostico"]}`,
      );
    }

    /* ── Resumo vazio: a descrição é omitida ── */
    respostasS.situacao_da_vaga = [200, [linhaAbertaS({ resumo: "   " })]];
    {
      const r = await pagina({ query: { slug: "analista-de-suporte" } });
      afirmar(
        "Aberta com Resumo vazio: a descrição (`description`, `og:` e `twitter:`) é OMITIDA, e não emitida em branco",
        r.status === 200 &&
          metaDe(r.html, "name", "description") === null &&
          metaDe(r.html, "property", "og:description") === null &&
          metaDe(r.html, "name", "twitter:description") === null,
      );
    }

    /* ── Link de Candidatura inválido ── */
    respostasS.situacao_da_vaga = [200, [linhaAbertaS({ link_de_candidatura: "javascript:alert(1)" })]];
    {
      const r = await pagina({ query: { slug: "analista-de-suporte" } });
      afirmar(
        "Link de Candidatura inválido: sem Candidatar-se (nem o `javascript:`), e o `JobPosting` continua",
        r.status === 200 && !r.html.includes("Candidatar-se") && !r.html.includes("javascript:") && jsonLdsDoCorpo(r.html).length === 1,
      );
    }

    /* ── Encerrada ── */
    respostasS.situacao_da_vaga = [200, [{ situacao: "encerrada", slug: "slug-do-banco", titulo: "Analista Antigo" }]];
    {
      const r = await pagina({ query: { slug: "pedido-na-url" } });
      const ns = noscriptDe(r.html) ?? "";
      afirmar(
        "Encerrada: 410, `no-store`, sem etiqueta de cache, e SEM `JobPosting`",
        r.status === 410 &&
          r.cabecalhos["Cache-Control"] === "no-store" &&
          !Object.hasOwn(r.cabecalhos, "Vercel-Cache-Tag") &&
          jsonLdsDoCorpo(r.html).length === 0,
        `HTTP ${r.status} | ${r.cabecalhos["Cache-Control"]}`,
      );
      afirmar(
        "Encerrada: a página renderizada (title com o título, canônica pelo Slug do banco, `<noscript>` com a frase de encerrada e o link para `/carreiras`)",
        tituloDe(r.html) === "Analista Antigo | Vagas ChatClean" &&
          canonicaDe(r.html) === `${DOMINIO_S}/carreiras/slug-do-banco` &&
          ns.includes("<h1>Analista Antigo</h1>") &&
          ns.includes(metadadosMod.escapar(paginaMod.FRASE_DA_ENCERRADA)) &&
          paginaMod.FRASE_DA_ENCERRADA.includes(estadosDaVaga.rotuloDoEstadoDaVaga("encerrada").toLowerCase()) &&
          ns.includes('href="/carreiras"') &&
          !ns.includes("Candidatar-se"),
        `${tituloDe(r.html)} | ${canonicaDe(r.html)}`,
      );
      conferirDocumento(r, "Encerrada");
      const head = await pagina({ metodo: "HEAD", query: { slug: "pedido-na-url" } });
      afirmar(
        "HEAD da Encerrada: 410 com os mesmos cabeçalhos, sem corpo",
        head.status === 410 && mesmoJson(head.cabecalhos, r.cabecalhos) && head.enviou === false,
      );
    }
    respostasS.situacao_da_vaga = [200, [{ situacao: "encerrada", slug: "slug-do-banco", titulo: null }]];
    {
      const r = await pagina({ query: { slug: "slug-do-banco" } });
      afirmar(
        "Encerrada sem título: o title e o `<h1>` usam o título de reserva do domínio",
        r.status === 410 &&
          tituloDe(r.html) === `${regrasDaVaga.TITULO_DE_RESERVA_DA_ENCERRADA} | Vagas ChatClean` &&
          (noscriptDe(r.html) ?? "").includes(`<h1>${regrasDaVaga.TITULO_DE_RESERVA_DA_ENCERRADA}</h1>`),
        tituloDe(r.html),
      );
    }

    /* ── Inexistente (Rascunho) ── */
    respostasS.situacao_da_vaga = [200, [{ situacao: "inexistente" }]];
    {
      const r = await pagina({ query: { slug: "um-rascunho" } });
      afirmar(
        "Inexistente (Rascunho): 404, `no-store`, sem etiqueta, SEM `JobPosting`, title \"Vaga não encontrada | Vagas ChatClean\", canônica da listagem e link para `/carreiras`",
        r.status === 404 &&
          r.cabecalhos["Cache-Control"] === "no-store" &&
          !Object.hasOwn(r.cabecalhos, "Vercel-Cache-Tag") &&
          jsonLdsDoCorpo(r.html).length === 0 &&
          tituloDe(r.html) === "Vaga não encontrada | Vagas ChatClean" &&
          canonicaDe(r.html) === `${DOMINIO_S}/carreiras` &&
          (noscriptDe(r.html) ?? "").includes('href="/carreiras"') &&
          !r.html.includes("um-rascunho"),
        `HTTP ${r.status} | ${tituloDe(r.html)} | ${canonicaDe(r.html)}`,
      );
      conferirDocumento(r, "Inexistente");
      const head = await pagina({ metodo: "HEAD", query: { slug: "um-rascunho" } });
      afirmar(
        "HEAD da inexistente: 404 com os mesmos cabeçalhos, sem corpo",
        head.status === 404 && mesmoJson(head.cabecalhos, r.cabecalhos) && head.enviou === false,
      );
    }

    /* ── Slug torto: 404 sem ida ao banco ── */
    respostasS.situacao_da_vaga = [200, [linhaAbertaS()]];
    {
      const tortos = [];
      for (const slug of ["../x", "Maiusculas", "", ["a", "b"], "a b", "dev_x", "..%2Fx", "a".repeat(201)]) {
        const r = await pagina({ query: { slug } });
        if (!(r.status === 404 && r.cabecalhos["Cache-Control"] === "no-store" && r.pedidos.length === 0 && jsonLdsDoCorpo(r.html).length === 0)) {
          tortos.push(`${JSON.stringify(slug).slice(0, 20)}: HTTP ${r.status}, ${r.pedidos.length} pedido(s)`);
        }
      }
      afirmar(
        "Slug torto (`../x`, maiúsculas, vazio, lista, espaço, sublinhado, codificado, longo demais): 404 `no-store` com ZERO pedidos ao banco",
        tortos.length === 0,
        tortos.join(" | "),
      );
    }

    /* ── Falha de leitura: 500 com o shell INTACTO ── */
    {
      const casos = [
        ["RPC 500", [500, { message: "falhou" }], {}],
        ["rede fora", [200, [linhaAbertaS()]], { SUPABASE_URL: "http://127.0.0.1:9" }],
        ["corpo torto (não é JSON)", [200, "isto não é json"], {}],
        ["corpo torto (situação fora do vocabulário)", [200, [{ situacao: "rascunho" }]], {}],
        ["corpo torto (lista vazia)", [200, []], {}],
        ["sem ambiente de leitura", [200, [linhaAbertaS()]], { SUPABASE_URL: undefined, SUPABASE_CHAVE_PUBLICAVEL: undefined }],
      ];
      const ruins = [];
      for (const [nome, resposta, ambiente] of casos) {
        respostasS.situacao_da_vaga = resposta;
        const r = await pagina({ query: { slug: "analista-de-suporte" }, ambiente });
        if (
          !(
            r.status === 500 &&
            r.cabecalhos["Cache-Control"] === "no-store" &&
            r.cabecalhos["X-Entrega-Diagnostico"] === "degradado:leitura-falhou" &&
            r.html === shell.html &&
            !Object.hasOwn(r.cabecalhos, "Vercel-Cache-Tag") &&
            r.eventos.some((l) => l.includes("degradado:leitura-falhou"))
          )
        ) {
          ruins.push(`${nome}: HTTP ${r.status} ${r.cabecalhos["X-Entrega-Diagnostico"]} shell ${r.html === shell.html}`);
        }
      }
      afirmar(
        `falha de leitura da Vaga (${casos.length} formas: RPC 500, rede fora, corpo torto, sem ambiente): 500 \`no-store\` com o shell do build INTACTO e o diagnóstico \`degradado:leitura-falhou\``,
        ruins.length === 0,
        ruins.join(" | "),
      );
    }

    /* ── Listagem ── */
    respostasS.vagas_abertas = [
      200,
      [
        { situacao: "aberta", slug: "vaga-nova", titulo: "Vaga Nova", modalidade: "remoto", localizacao: "", aberta_em: "2026-09-10T00:00:00Z" },
        { situacao: "aberta", slug: "vaga-antiga", titulo: "Vaga <Antiga>", modalidade: "presencial", localizacao: "Natal, RN", aberta_em: "2026-09-01T00:00:00Z" },
      ],
    ];
    {
      const r = await pagina();
      const ns = noscriptDe(r.html) ?? "";
      afirmar(
        "Listagem: 200, `s-maxage=60`, etiqueta `carreiras` só, pela RPC `vagas_abertas`",
        r.status === 200 &&
          r.cabecalhos["Cache-Control"] === "public, s-maxage=60" &&
          r.cabecalhos["Vercel-Cache-Tag"] === "carreiras" &&
          r.pedidos.length === 1 &&
          r.pedidos[0].url === "/rest/v1/rpc/vagas_abertas",
        `HTTP ${r.status} | ${r.cabecalhos["Vercel-Cache-Tag"]} | ${r.pedidos.map((p) => p.url).join(",")}`,
      );
      afirmar(
        "Listagem: title \"Vagas ChatClean | Trabalhe com a gente\", descrição fixa, canônica própria `/carreiras`, sem `JobPosting`",
        tituloDe(r.html) === "Vagas ChatClean | Trabalhe com a gente" &&
          metaDe(r.html, "name", "description") === metadadosMod.escapar(paginaMod.DESCRICAO_DA_LISTAGEM_DE_VAGAS) &&
          canonicaDe(r.html) === `${DOMINIO_S}/carreiras` &&
          jsonLdsDoCorpo(r.html).length === 0,
        `${tituloDe(r.html)} | ${canonicaDe(r.html)}`,
      );
      const iNova = ns.indexOf('<a href="/carreiras/vaga-nova">Vaga Nova</a>');
      const iAntiga = ns.indexOf('<a href="/carreiras/vaga-antiga">Vaga &lt;Antiga&gt;</a>');
      afirmar(
        "Listagem: o `<noscript>` lista as Vagas Abertas na ordem do banco, cada uma com o link e o local, título escapado",
        iNova !== -1 &&
          iAntiga !== -1 &&
          iNova < iAntiga &&
          ns.includes(`(${regrasDaVaga.textoDoLocal({ modalidade: "presencial", localizacao: "Natal, RN" })})`) &&
          (ns.match(/<h1>/g) ?? []).length === 1,
        ns.slice(0, 400),
      );
      conferirDocumento(r, "Listagem");
      const head = await pagina({ metodo: "HEAD" });
      afirmar(
        "HEAD da listagem: 200 com os mesmos cabeçalhos, sem corpo",
        head.status === 200 && mesmoJson(head.cabecalhos, r.cabecalhos) && head.enviou === false,
      );
    }
    respostasS.vagas_abertas = [200, []];
    {
      const r = await pagina();
      afirmar(
        "Listagem vazia: 200 com a frase de \"sem vagas\" no `<noscript>`",
        r.status === 200 && (noscriptDe(r.html) ?? "").includes(metadadosMod.escapar(paginaMod.FRASE_SEM_VAGAS_ABERTAS)) && !(noscriptDe(r.html) ?? "").includes("<li>"),
      );
      /* Revisão da 5.8: a frase promete o WhatsApp, e o `<noscript>` dá o caminho. */
      afirmar(
        "Listagem vazia: o `<noscript>` traz o link do currículo pelo WhatsApp, o MESMO endereço do domínio (`ENDERECO_DO_CURRICULO`)",
        (noscriptDe(r.html) ?? "").includes(`<a href="${metadadosMod.escapar(regrasDaVaga.ENDERECO_DO_CURRICULO)}" rel="noopener noreferrer">`) &&
          regrasDaVaga.ENDERECO_DO_CURRICULO === LINK_DO_WHATSAPP,
      );
    }
    {
      const ruins = [];
      for (const [nome, resposta, ambiente] of [
        ["RPC 500", [500, {}], {}],
        ["rede fora", [200, []], { SUPABASE_URL: "http://127.0.0.1:9" }],
        ["corpo torto", [200, { nao: "lista" }], {}],
        ["linha torta", [200, [{ situacao: "aberta", slug: "Torto", titulo: "X" }]], {}],
      ]) {
        respostasS.vagas_abertas = resposta;
        const r = await pagina({ ambiente });
        if (!(r.status === 500 && r.cabecalhos["Cache-Control"] === "no-store" && r.html === shell.html && r.cabecalhos["X-Entrega-Diagnostico"] === "degradado:leitura-falhou")) {
          ruins.push(`${nome}: HTTP ${r.status}`);
        }
      }
      afirmar(
        "Listagem com falha de leitura (RPC 500, rede fora, corpo torto, linha torta): 500 `no-store` com o shell INTACTO, nunca 200 \"sem vagas\"",
        ruins.length === 0,
        ruins.join(" | "),
      );
      respostasS.vagas_abertas = [200, []];
    }

    /* ── Sem domínio: o 500 de defeito do Blog ── */
    {
      const r = await pagina({ query: { slug: "analista-de-suporte" }, ambiente: { VITE_DOMINIO_DO_SITE: undefined } });
      const l = await pagina({ ambiente: { VITE_DOMINIO_DO_SITE: undefined } });
      afirmar(
        "sem Domínio Canônico: o 500 de defeito do Blog (texto, `no-store`, `falha:sem-dominio`), nas duas rotas e sem ida ao banco",
        [r, l].every(
          (x) =>
            x.status === 500 &&
            String(x.cabecalhos["Content-Type"]).startsWith("text/plain") &&
            x.cabecalhos["Cache-Control"] === "no-store" &&
            x.cabecalhos["X-Entrega-Diagnostico"] === "falha:sem-dominio" &&
            x.pedidos.length === 0,
        ),
        `${r.status} ${r.cabecalhos["X-Entrega-Diagnostico"]} | ${l.status}`,
      );
    }

    /* ── Revisão da 5.8: o título servido sai de `tituloServidoDaVaga` ── */
    {
      const observados = [];
      respostasS.situacao_da_vaga = [200, [linhaAbertaS({ titulo: "Título Observado A" })]];
      const a = await pagina({ query: { slug: "analista-de-suporte" } });
      observados.push([tituloDe(a.html), jobPostingMod.tituloServidoDaVaga("Título Observado A")]);
      respostasS.situacao_da_vaga = [200, [{ situacao: "encerrada", slug: "slug-do-banco", titulo: "Título Observado E" }]];
      const e = await pagina({ query: { slug: "slug-do-banco" } });
      observados.push([tituloDe(e.html), jobPostingMod.tituloServidoDaVaga("Título Observado E")]);
      respostasS.situacao_da_vaga = [200, [{ situacao: "inexistente" }]];
      const i = await pagina({ query: { slug: "nada-aqui" } });
      observados.push([tituloDe(i.html), jobPostingMod.tituloServidoDaVaga(jobPostingMod.VAGA_NAO_ENCONTRADA)]);
      afirmar(
        "o título servido da Aberta, da Encerrada e da inexistente é, observado na saída, o que `tituloServidoDaVaga` devolve",
        observados.every(([visto, esperado]) => typeof esperado === "string" && visto === metadadosMod.escapar(esperado)),
        observados.map(([v, e]) => `${v} × ${e}`).join(" | "),
      );
      const fontePaginaS = semComentarios(ler("api/_nucleo/paginaDeCarreiras.js") ?? "");
      afirmar(
        /* 2026-09-29: acrescido o separador novo " | " (Spec Change Log da 5.8). */
        "`paginaDeCarreiras.js` não escreve travessão, o separador \" | \" nem a marca \"Vagas ChatClean\" à mão (os títulos vêm do domínio)",
        fontePaginaS !== "" &&
          !fontePaginaS.includes("—") &&
          !fontePaginaS.includes(" | ") &&
          !fontePaginaS.includes("Vagas ChatClean"),
      );
      afirmar(
        "Aberta: `twitter:card` = `summary_large_image`",
        metaDe(a.html, "name", "twitter:card") === "summary_large_image",
        String(metaDe(a.html, "name", "twitter:card")),
      );
    }

    /* ── Revisão da 5.8: nada lança para a plataforma ── */
    {
      const LANCA = () => {
        throw new Error("leitor que lança");
      };
      const REJEITA = () => Promise.reject(new Error("leitor que rejeita"));
      const casos = [
        ["leitor da Vaga que lança", { query: { slug: "analista-de-suporte" }, injetar: { lerSituacao: LANCA } }],
        ["leitor da Vaga que rejeita", { query: { slug: "analista-de-suporte" }, injetar: { lerSituacao: REJEITA } }],
        ["leitor da listagem que lança", { injetar: { lerAbertas: LANCA } }],
        ["leitor da listagem que rejeita", { injetar: { lerAbertas: REJEITA } }],
        ["shell que lança", { query: { slug: "analista-de-suporte" }, injetar: { lerShell: LANCA } }],
        ["shell que rejeita", { injetar: { lerShell: REJEITA } }],
      ];
      const ruins = [];
      for (const [nome, pedido] of casos) {
        for (const metodo of ["GET", "HEAD"]) {
          const r = await pagina({ ...pedido, metodo });
          const certo =
            r.lancou === undefined &&
            r.status === 500 &&
            String(r.cabecalhos["Content-Type"] ?? "").startsWith("text/plain") &&
            r.cabecalhos["Cache-Control"] === "no-store" &&
            r.cabecalhos["X-Entrega-Diagnostico"] === "falha:excecao" &&
            !Object.hasOwn(r.cabecalhos, "Vercel-Cache-Tag") &&
            r.eventos.some((l) => l.includes("falha:excecao")) &&
            (metodo === "HEAD" ? r.enviou === false && r.corpo === null : r.enviou === true);
          if (!certo) ruins.push(`${nome} (${metodo}): HTTP ${r.status} ${r.cabecalhos["X-Entrega-Diagnostico"]} ${r.lancou ?? ""}`);
        }
      }
      afirmar(
        `leitor ou shell que lança ou rejeita (${casos.length} formas, GET e HEAD): 500 \`no-store\` em texto, \`falha:excecao\` com o evento registrado, nunca a exceção subindo à plataforma, e o HEAD sem corpo`,
        ruins.length === 0,
        ruins.join(" | "),
      );
    }

    /* ── Revisão da 5.8: Aberta sem título é defeito, e não "não encontrada" ── */
    {
      const r = await pagina({
        query: { slug: "analista-de-suporte" },
        injetar: { lerSituacao: async () => ({ ok: true, situacao: "aberta", vaga: { ...linhaAbertaS(), titulo: "   " } }) },
      });
      afirmar(
        "Aberta sem título que escapasse da leitura: 500 de defeito em texto (`no-store`), sem página e sem o título de \"não encontrada\"",
        r.status === 500 &&
          String(r.cabecalhos["Content-Type"] ?? "").startsWith("text/plain") &&
          r.cabecalhos["Cache-Control"] === "no-store" &&
          !r.html.includes("<title>") &&
          !r.html.includes(jobPostingMod.VAGA_NAO_ENCONTRADA),
        `HTTP ${r.status} ${r.cabecalhos["X-Entrega-Diagnostico"]}`,
      );
    }

    /* ── Revisão da 5.8: os caminhos de erro, em GET e HEAD ── */
    {
      const semMarca = (html, marca) => html.split(marca).join("<!-- MARCA-REMOVIDA-NA-VERIFICACAO");
      const CASOS_DE_ERRO = [
        ["falha de leitura", 500, "degradado:leitura-falhou", "text/html", { query: { slug: "analista-de-suporte" } }, [500, { message: "x" }]],
        ["sem domínio", 500, "falha:sem-dominio", "text/plain", { query: { slug: "analista-de-suporte" }, ambiente: { VITE_DOMINIO_DO_SITE: undefined } }, null],
        ["sem shell", 500, "falha:sem-shell", "text/plain", { query: { slug: "analista-de-suporte" }, injetar: { lerShell: async () => ({ ok: false, defeito: "sem shell (verificação)" }) } }, null],
        ["região de metadados ausente", 500, "falha:regiao-ausente", "text/plain", { query: { slug: "analista-de-suporte" }, injetar: { lerShell: async () => ({ ok: true, html: semMarca(shell.html, metadadosMod.MARCA_INICIO), ativos: [] }) } }, null],
        ["região do corpo ausente", 500, "falha:regiao-ausente", "text/plain", { query: { slug: "analista-de-suporte" }, injetar: { lerShell: async () => ({ ok: true, html: semMarca(shell.html, artigoMod.MARCA_CORPO_INICIO), ativos: [] }) } }, null],
        ["situação sem status declarado", 500, "degradado:leitura-falhou", "text/plain", { query: { slug: "analista-de-suporte" }, injetar: { lerSituacao: async () => ({ ok: true, situacao: "xpto", vaga: null }) } }, null],
      ];
      const ruins = [];
      for (const [nome, status, diagnostico, tipo, pedido, respostaDoDuble] of CASOS_DE_ERRO) {
        respostasS.situacao_da_vaga = respostaDoDuble ?? [200, [linhaAbertaS()]];
        const get = await pagina({ ...pedido, metodo: "GET" });
        const head = await pagina({ ...pedido, metodo: "HEAD" });
        const certo =
          get.status === status &&
          get.cabecalhos["X-Entrega-Diagnostico"] === diagnostico &&
          String(get.cabecalhos["Content-Type"] ?? "").startsWith(tipo) &&
          get.cabecalhos["Cache-Control"] === "no-store" &&
          get.enviou === true &&
          head.status === status &&
          mesmoJson(head.cabecalhos, get.cabecalhos) &&
          head.enviou === false &&
          head.corpo === null;
        if (!certo) {
          ruins.push(
            `${nome}: GET ${get.status} ${get.cabecalhos["X-Entrega-Diagnostico"]} | HEAD ${head.status} enviou ${head.enviou} ${head.lancou ?? ""}`,
          );
        }
      }
      afirmar(
        `os caminhos de erro (falha de leitura, sem domínio, sem shell, as duas regiões ausentes, situação sem status): o status e o diagnóstico de cada um, \`no-store\`, e o HEAD com os mesmos cabeçalhos e SEM corpo`,
        ruins.length === 0,
        ruins.join(" | "),
      );
    }

    /* ── Revisão da 5.8: Encerrada e inexistente não vazam nada da Vaga ── */
    {
      const MARCADA = {
        slug: "encerrada-marcada",
        titulo: "Título Encerrado",
        resumo: "MARCADOR-RESUMO",
        descricao_html: "<p>MARCADOR-DESCRICAO</p>",
        departamento: "MARCADOR-DEPARTAMENTO",
        tipo: "MARCADOR-TIPO",
        nivel: "MARCADOR-NIVEL",
        modalidade: "presencial",
        localizacao: "MARCADOR-LOCAL",
        link_de_candidatura: "https://marcador-link.example/candidatura",
        equivalente_jobposting: "FULL_TIME",
        aberta_em: "2026-09-01T12:00:00+00:00",
      };
      const ruins = [];
      for (const [situacao, status] of [
        ["encerrada", 410],
        ["inexistente", 404],
      ]) {
        const r = await pagina({
          query: { slug: "encerrada-marcada" },
          injetar: { lerSituacao: async () => ({ ok: true, situacao, vaga: MARCADA }) },
        });
        const vazou = ["MARCADOR", "marcador-link", "Candidatar-se", "Departamento:", "Local:"].filter((m) => r.html.includes(m));
        if (r.status !== status || vazou.length > 0 || jsonLdsDoCorpo(r.html).length !== 0) {
          ruins.push(`${situacao}: HTTP ${r.status}, vazou [${vazou.join(", ")}], JSON-LD ${jsonLdsDoCorpo(r.html).length}`);
        }
      }
      afirmar(
        "Encerrada e inexistente servidas, mesmo recebendo uma Vaga cheia de marcadores: nada de Resumo, Classificações, local, Descrição, Link nem `JobPosting` no HTML",
        ruins.length === 0,
        ruins.join(" | "),
      );
    }

    /* ── Revisão da 5.8: etiquetas por lista de permissão ── */
    {
      const entregaMod = await import(urlDe("api/_nucleo/entrega.js"));
      const cacheMod = await import(urlDe("api/_nucleo/cache.js"));
      const responder = (etiquetas) => {
        const cab = {};
        const res = {
          setHeader: (k, v) => {
            cab[k] = v;
          },
          status: () => res,
          send: () => res,
        };
        const aviso = console.warn;
        console.warn = () => {};
        try {
          entregaMod.responderDocumento(res, { tipo: "text/html", corpo: "x", status: 200, etiquetas });
        } finally {
          console.warn = aviso;
        }
        return cab;
      };
      const torta = responder(["carreiras", "vaga:ok-1", "vaga:a,b", "x\ny", "", "vaga:com espaço", "a:b:c", 5, null]);
      const vazia = responder(["a,b", "x\ny", ""]);
      const nada = responder([]);
      const doBlog = responder({ slug: "artigo-x" });
      afirmar(
        "a lista pronta de etiquetas passa pela MESMA lista de permissão de `cache.js` (vírgula, quebra de linha, espaço, vazia e não texto caem) e, vazia, não vira cabeçalho; o objeto do Blog segue igual",
        torta["Vercel-Cache-Tag"] === "carreiras,vaga:ok-1" &&
          !Object.hasOwn(vazia, "Vercel-Cache-Tag") &&
          !Object.hasOwn(nada, "Vercel-Cache-Tag") &&
          doBlog["Vercel-Cache-Tag"] === "blog,post:artigo-x",
        `${JSON.stringify(torta["Vercel-Cache-Tag"])} | ${JSON.stringify(vazia["Vercel-Cache-Tag"])} | ${JSON.stringify(doBlog["Vercel-Cache-Tag"])}`,
      );
      const fonteDaPagina = semComentarios(ler("api/_nucleo/paginaDeCarreiras.js") ?? "");
      afirmar(
        "o caractere de etiqueta de Carreiras é o de `cache.js`, importado (sem cópia da expressão)",
        cacheMod.CARACTERE_DE_ETIQUETA instanceof RegExp &&
          nomesImportadosDe(fonteDaPagina, "./cache.js").includes("CARACTERE_DE_ETIQUETA") &&
          !/\[a-z0-9-\]/.test(fonteDaPagina),
      );
    }

    /* ── Método estranho e POST intacto ── */
    {
      const ruins = [];
      for (const metodo of ["PUT", "DELETE", "PATCH", "OPTIONS"]) {
        const r = await pagina({ metodo, query: { slug: "analista-de-suporte" } });
        if (!(r.status === 405 && r.cabecalhos.Allow === "GET, HEAD, POST" && r.cabecalhos["Cache-Control"] === "no-store" && r.pedidos.length === 0)) {
          ruins.push(`${metodo}: HTTP ${r.status} Allow ${r.cabecalhos.Allow}`);
        }
      }
      afirmar(
        "método estranho (PUT, DELETE, PATCH, OPTIONS): 405 com `Allow: GET, HEAD, POST` e `no-store`, sem ida ao banco",
        ruins.length === 0,
        ruins.join(" | "),
      );
      const post = await pagina({ metodo: "POST", corpo: { operacao: "salvarVaga" }, ambiente: { SUPABASE_CHAVE_DE_SERVICO: "sb_secret_duble_5_8" } });
      afirmar(
        "POST continua sendo a escrita: sem credencial é 401 em JSON, e não a página",
        post.status === 401 && typeof post.corpo === "object" && post.corpo?.ok === false && !String(post.cabecalhos["Content-Type"] ?? "").startsWith("text/html"),
        `HTTP ${post.status} ${JSON.stringify(post.corpo).slice(0, 120)}`,
      );
    }
  } finally {
    await new Promise((pronto) => dubleS.close(pronto));
  }
}

/* ── Estática: as reescritas e o teto de `api/` ── */

{
  const REESCRITAS_DE_CARREIRAS = [
    { source: "/carreiras", destination: "/api/carreiras" },
    { source: "/carreiras/:slug", destination: "/api/carreiras?slug=:slug" },
  ];
  /** Cada reescrita de Carreiras existe, com o destino exato, ANTES do apanha-tudo. */
  const problemasDaOrdem = (reescritas) => {
    const lista = Array.isArray(reescritas) ? reescritas : [];
    const apanha = lista.findIndex((r) => r?.source === "/(.*)");
    const problemas = [];
    if (apanha === -1) problemas.push("sem apanha-tudo");
    for (const rota of REESCRITAS_DE_CARREIRAS) {
      const i = lista.findIndex((r) => r?.source === rota.source);
      if (i === -1) problemas.push(`${rota.source} ausente`);
      else if (lista[i].destination !== rota.destination) problemas.push(`${rota.source} -> ${lista[i].destination}`);
      else if (apanha !== -1 && i > apanha) problemas.push(`${rota.source} depois do apanha-tudo`);
      if (lista.filter((r) => r?.source === rota.source).length > 1) problemas.push(`${rota.source} repetida`);
    }
    return problemas;
  };
  const APANHA = { source: "/(.*)", destination: "/index.html" };
  afirmar(
    "autoteste: o conferente das reescritas acusa a ordem trocada, o destino trocado, a ausente e a repetida, e absolve a certa",
    problemasDaOrdem([APANHA, ...REESCRITAS_DE_CARREIRAS]).length === 2 &&
      problemasDaOrdem([{ source: "/carreiras", destination: "/index.html" }, REESCRITAS_DE_CARREIRAS[1], APANHA]).length === 1 &&
      problemasDaOrdem([REESCRITAS_DE_CARREIRAS[0], APANHA]).length === 1 &&
      problemasDaOrdem([...REESCRITAS_DE_CARREIRAS, REESCRITAS_DE_CARREIRAS[0], APANHA]).length === 1 &&
      problemasDaOrdem([...REESCRITAS_DE_CARREIRAS, APANHA]).length === 0,
  );
  let vercel = null;
  try {
    vercel = JSON.parse(ler("vercel.json") ?? "");
  } catch {
    vercel = null;
  }
  const problemas = problemasDaOrdem(vercel?.rewrites);
  afirmar(
    "`vercel.json`: `/carreiras` → `/api/carreiras` e `/carreiras/:slug` → `/api/carreiras?slug=:slug`, as duas ANTES do apanha-tudo",
    vercel !== null && problemas.length === 0,
    problemas.join(" | ") || "vercel.json ilegível",
  );
  const funcoesNaApi = existsSync(path.join(raiz, "api"))
    ? readdirSync(path.join(raiz, "api")).filter((n) => /\.(js|mjs|ts)$/.test(n))
    : [];
  afirmar(
    "`api/` continua com 11 funções: as rotas de Carreiras NÃO ganharam arquivo próprio (a página é servida pela função da escrita)",
    funcoesNaApi.length === 11 && funcoesNaApi.filter((n) => /carreira|vaga/i.test(n)).length === 1,
    `${funcoesNaApi.length}: ${funcoesNaApi.join(", ")}`,
  );
  const fontePagina = semComentarios(ler("api/_nucleo/paginaDeCarreiras.js") ?? "");
  afirmar(
    "a página de Carreiras não toca a chave de serviço nem instancia cliente (lê só pela `chamar` de `leitura.js`)",
    fontePagina !== "" &&
      !/CHAVE_DE_SERVICO|acessoDoAmbiente|createClient|SERVICE_ROLE|sb_secret|@supabase\//.test(fontePagina) &&
      !/\bfetch\s*\(/.test(fontePagina),
  );
  afirmar(
    "nenhum `src/render/carreiras`, e o `JobPosting` mora no domínio (`src/domain/carreiras/jobPosting.js`)",
    !existsSync(path.join(raiz, "src", "render", "carreiras")) && existsSync(path.join(raiz, "src", "domain", "carreiras", "jobPosting.js")),
  );
}

/* ── Remota: o banco de verdade, sem criar Vaga ── */

if (!temToken) {
  afirmar(
    "`GET /carreiras` e um Slug que não existe, contra o banco REAL, respondem 200 e 404",
    false,
    "sem SUPABASE_ACCESS_TOKEN: a leitura real é da sessão principal",
  );
} else if (!urlDoEnv || !chavePublicavel || moduloDoHandler === null) {
  afirmar("`GET /carreiras` e um Slug inexistente contra o banco REAL", false, "sem VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY no `.env`");
} else {
  const handler = moduloDoHandler.default;
  const real = async (query) => {
    const r = { status: null, cabecalhos: {}, corpo: null, eventos: [] };
    const res = {
      setHeader: (k, v) => {
        r.cabecalhos[k] = v;
      },
      status: (c) => {
        r.status = c;
        return res;
      },
      send: (c) => {
        r.corpo = c;
        return res;
      },
      json: (c) => {
        r.corpo = c;
        return res;
      },
    };
    const extras = {
      VITE_DOMINIO_DO_SITE: DOMINIO_S,
      SUPABASE_URL: urlDoEnv,
      SUPABASE_CHAVE_PUBLICAVEL: chavePublicavel,
    };
    const guardado = {};
    for (const [k, v] of Object.entries(extras)) {
      guardado[k] = process.env[k];
      process.env[k] = v;
    }
    const aviso = console.warn;
    const erro = console.error;
    console.warn = (...p) => r.eventos.push(p.join(" "));
    console.error = (...p) => r.eventos.push(p.join(" "));
    try {
      await handler({ method: "GET", query, headers: {} }, res);
    } catch (erro) {
      /* Revisão da 5.8: a exceção vira FALHA nomeada, e não aborta a
         ferramenta. Rede e prazo são infraestrutura; o resto é defeito. */
      const texto = String(erro?.message ?? erro);
      r.lancou = /fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket|timeout|network/i.test(texto)
        ? `infraestrutura, não defeito: ${texto}`
        : `defeito: o handler lançou: ${texto}`;
    } finally {
      console.warn = aviso;
      console.error = erro;
      for (const [k, v] of Object.entries(guardado)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
    return r;
  };
  const lista = await real({});
  afirmar(
    "banco REAL: o handler não lançou em nenhuma das duas leituras reais",
    lista.lancou === undefined,
    lista.lancou ?? "",
  );
  afirmar(
    "banco REAL: `GET /carreiras` responde 200 com `s-maxage=60` e o título da listagem",
    lista.status === 200 &&
      lista.cabecalhos["Cache-Control"] === "public, s-maxage=60" &&
      String(lista.corpo ?? "").includes("<title>Vagas ChatClean | Trabalhe com a gente</title>"),
    `HTTP ${lista.status} | ${lista.cabecalhos["X-Entrega-Diagnostico"]} | ${lista.eventos.join(" ").slice(0, 200)}`,
  );
  const inexistente = await real({ slug: `zzz-verificacao-5-8-inexistente-${randomUUID().slice(0, 8)}` });
  afirmar(
    "banco REAL: um Slug que não existe responde 404 `no-store` (sem criar Vaga nenhuma)",
    inexistente.lancou === undefined && inexistente.status === 404 && inexistente.cabecalhos["Cache-Control"] === "no-store",
    `HTTP ${inexistente.status} | ${inexistente.lancou ?? ""} | ${inexistente.cabecalhos["X-Entrega-Diagnostico"]} | ${inexistente.eventos.join(" ").slice(0, 200)}`,
  );
}

/* ── Remota (revisão da 5.8): os campos que a leitura do servidor LÊ existem
   entre as colunas de retorno REAIS das duas funções ──
   A lista de campos vem do MÓDULO (`CAMPOS_LIDOS_DA_SITUACAO` e
   `CAMPOS_LIDOS_DAS_ABERTAS`), e não de cópia; as colunas vêm do catálogo
   (`pg_proc.proargnames`/`proargmodes`), numa transação desfeita. O
   comparador é função pura, com autoteste sem banco. */

/**
 * Os campos esperados que NÃO estão entre as colunas de retorno de uma
 * função. Colunas de retorno são os argumentos de modo `t` (TABLE), `o` (OUT)
 * ou `b` (INOUT). Aceita as listas como vetor ou como o texto do Postgres
 * (`{a,b}`). Nunca lança.
 */
function camposAusentesNoRetorno(esperados, nomes, modos) {
  const lista = (valor) =>
    Array.isArray(valor)
      ? valor.map(String)
      : typeof valor === "string"
        ? valor.replace(/^\{|\}$/g, "").split(",").map((x) => x.trim().replace(/^"|"$/g, "")).filter((x) => x !== "")
        : [];
  const n = lista(nomes);
  const m = lista(modos);
  const colunas = n.filter((_, i) => ["t", "o", "b"].includes(m[i]));
  return (Array.isArray(esperados) ? esperados : []).filter((campo) => !colunas.includes(campo));
}

afirmar(
  "autoteste do comparador de colunas: acusa o campo que falta e o que só existe como ARGUMENTO de entrada, absolve o que está no retorno, e lê as duas formas (vetor e texto do Postgres)",
  igual(camposAusentesNoRetorno(["situacao", "slug"], ["p_slug", "situacao", "slug"], ["i", "t", "t"]), []) &&
    igual(camposAusentesNoRetorno(["situacao", "coluna_fantasma"], ["p_slug", "situacao"], ["i", "t"]), ["coluna_fantasma"]) &&
    igual(camposAusentesNoRetorno(["p_slug"], ["p_slug", "situacao"], ["i", "t"]), ["p_slug"]) &&
    igual(camposAusentesNoRetorno(["situacao", "slug"], "{p_slug,situacao,slug}", "{i,t,t}"), []) &&
    igual(camposAusentesNoRetorno(["x"], null, null), ["x"]) &&
    igual(camposAusentesNoRetorno([...leituraMod?.CAMPOS_LIDOS_DAS_ABERTAS ?? [], "coluna_fantasma"], leituraMod?.CAMPOS_LIDOS_DAS_ABERTAS ?? [], (leituraMod?.CAMPOS_LIDOS_DAS_ABERTAS ?? []).map(() => "t")), ["coluna_fantasma"]),
);
afirmar(
  "as listas de campos lidos são as do MÓDULO de leitura, não vazias e congeladas",
  Array.isArray(leituraMod?.CAMPOS_LIDOS_DA_SITUACAO) &&
    leituraMod.CAMPOS_LIDOS_DA_SITUACAO.length > 3 &&
    Object.isFrozen(leituraMod.CAMPOS_LIDOS_DA_SITUACAO) &&
    Array.isArray(leituraMod?.CAMPOS_LIDOS_DAS_ABERTAS) &&
    leituraMod.CAMPOS_LIDOS_DAS_ABERTAS.length > 3 &&
    Object.isFrozen(leituraMod.CAMPOS_LIDOS_DAS_ABERTAS),
);

if (!temToken) {
  afirmar(
    "todo campo que `api/_nucleo/leitura.js` lê existe entre as colunas de retorno reais de `situacao_da_vaga` e `vagas_abertas`",
    false,
    "sem SUPABASE_ACCESS_TOKEN: o catálogo é lido pela sessão principal",
  );
} else {
  const r = await desfeito(
    `select p.proname as nome, p.proargnames as nomes, p.proargmodes::text[] as modos
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('situacao_da_vaga', 'vagas_abertas');`,
  );
  if (!r.ok) {
    afirmar("o catálogo das duas funções de entrega pôde ser lido (transação desfeita)", false, r.erro);
  } else {
    const linhas = Array.isArray(r.dados) ? r.dados : [];
    const de = (nome) => linhas.filter((l) => l.nome === nome);
    const situacao = de("situacao_da_vaga");
    const abertas = de("vagas_abertas");
    const faltaNaSituacao = situacao.length === 1 ? camposAusentesNoRetorno(leituraMod.CAMPOS_LIDOS_DA_SITUACAO, situacao[0].nomes, situacao[0].modos) : ["(função ausente ou sobrecarregada)"];
    const faltaNasAbertas = abertas.length === 1 ? camposAusentesNoRetorno(leituraMod.CAMPOS_LIDOS_DAS_ABERTAS, abertas[0].nomes, abertas[0].modos) : ["(função ausente ou sobrecarregada)"];
    afirmar(
      "todo campo que `api/_nucleo/leitura.js` lê existe entre as colunas de retorno reais de `situacao_da_vaga` e `vagas_abertas`",
      faltaNaSituacao.length === 0 && faltaNasAbertas.length === 0,
      `situacao_da_vaga: [${faltaNaSituacao.join(", ")}] | vagas_abertas: [${faltaNasAbertas.join(", ")}]`,
    );
  }
}

/* ═══ STORY 5.9: AS VAGAS NO SITEMAP E NO /llms.txt ═══════════════════════ */

secao("(t) as Vagas no mapa do site e no `/llms.txt`, com a falha delas isolada (Story 5.9)");

/*
 * - NODE: `mapaDoSite` e `indiceParaLlms` executados contra textos escritos
 *   À MÃO (o golden sem Vagas é o de hoje, byte a byte; nunca gerado pela
 *   própria função), o nó da Vaga, o `lastmod` ISO, o escape de XML e de
 *   Markdown e a seção `## Vagas`; `vagasIsoladas` com leitura injetada;
 * - DIRIGIDA: `api/sitemap.js`, `api/llms.js` e `api/carreiras.js` (a
 *   listagem) contra UM dublê de PostgREST que roteia pelo nome da função:
 *   com Vagas, sem Vagas, Vagas falhando de cada jeito (inclusive pendurada e
 *   lançando), Posts falhando, cache e etiquetas, as duas leituras em
 *   paralelo, e os três com o MESMO conjunto de endereços;
 * - REMOTA, só com token: as duas rotas contra o banco real respondem 200, e
 *   as Vagas que elas listam são exatamente as da leitura real.
 *
 * TROCA REGISTRADA (revisão da 5.9): a asserção ESTÁTICA que proibia palavras
 * de Estado no texto das rotas saiu. Era lista de proibição sobre texto; o
 * comportamento (as rotas listam o que a função de banco devolve, e pedem só
 * `posts_no_ar` e `vagas_abertas`) é observado pelo dublê.
 */

const DOMINIO_T = "https://chatclean.com.br";

let mapaModT = null;
let indiceModT = null;
let sitemapModT = null;
let diagModT = null;
let leituraModT = null;
let artigoModT = null;
let cacheModT = null;
try {
  mapaModT = await import(urlDe("api/_nucleo/paginasDoSite.js"));
  indiceModT = await import(urlDe("api/llms.js"));
  sitemapModT = await import(urlDe("api/sitemap.js"));
  diagModT = await import(urlDe("api/_nucleo/diagnostico.js"));
  leituraModT = await import(urlDe("api/_nucleo/leitura.js"));
  artigoModT = await import(urlDe("api/_nucleo/artigo.js"));
  cacheModT = await import(urlDe("api/_nucleo/cache.js"));
  afirmar("os módulos do mapa e do índice importam no Node (`paginasDoSite.js`, `sitemap.js`, `llms.js`)", true);
} catch (erro) {
  afirmar("os módulos do mapa e do índice importam no Node (`paginasDoSite.js`, `sitemap.js`, `llms.js`)", false, erro.message);
}

/**
 * Uma resposta de mentira, a MESMA para o dirigido local e o remoto: guarda
 * status, cabeçalhos (nome em minúsculas), corpo e se houve `end()`.
 */
function respostaFalsaT() {
  const r = { status: null, cab: {}, corpo: null, terminou: false };
  const res = {
    setHeader(nome, valor) {
      r.cab[String(nome).toLowerCase()] = valor;
    },
    status(codigo) {
      r.status = codigo;
      return res;
    },
    send(saida) {
      r.corpo = saida;
      return res;
    },
    end(saida) {
      r.terminou = true;
      if (saida !== undefined) r.corpo = saida;
      return res;
    },
    json(saida) {
      r.corpo = saida;
      return res;
    },
  };
  return { r, res };
}

/**
 * Dirige um handler com o ambiente dado, capturando o console. Exceção do
 * handler vira `lancou`, com rede/prazo nomeados como infraestrutura.
 */
async function dirigirRotaT(handler, { url, query = {}, ambiente, injecao = undefined }) {
  const { r, res } = respostaFalsaT();
  r.eventos = [];
  const guardado = {};
  for (const [nome, valor] of Object.entries(ambiente)) {
    guardado[nome] = process.env[nome];
    if (valor === undefined) delete process.env[nome];
    else process.env[nome] = valor;
  }
  const aviso = console.warn;
  const erro = console.error;
  console.warn = (...p) => r.eventos.push(p.join(" "));
  console.error = (...p) => r.eventos.push(p.join(" "));
  const inicio = Date.now();
  try {
    const req = { method: "GET", url, query, headers: { host: "intruso.exemplo", "x-forwarded-host": "intruso.exemplo" } };
    await (injecao === undefined ? handler(req, res) : handler(req, res, injecao));
  } catch (e) {
    const texto = String(e?.message ?? e);
    r.lancou = /fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket|timeout|network/i.test(texto)
      ? `infraestrutura, não defeito: ${texto}`
      : `defeito: o handler lançou: ${texto}`;
  } finally {
    r.ms = Date.now() - inicio;
    console.warn = aviso;
    console.error = erro;
    for (const [nome, valor] of Object.entries(guardado)) {
      if (valor === undefined) delete process.env[nome];
      else process.env[nome] = valor;
    }
  }
  r.texto = typeof r.corpo === "string" ? r.corpo : "";
  return r;
}

/** Os Posts de referência, na forma da linha de `posts_no_ar`. */
const POSTS_T = Object.freeze([
  Object.freeze({
    slug: "como-automatizar",
    titulo: "Como automatizar",
    resumo: "O que dá para automatizar.",
    publicado_em: "2026-08-01T10:00:00.000Z",
    atualizado_em: "2026-08-05T10:00:00.000Z",
  }),
  Object.freeze({
    slug: "sem-data",
    titulo: "Sem data",
    resumo: null,
    publicado_em: "2026-08-02T10:00:00.000Z",
    atualizado_em: null,
  }),
]);

/** As duas Vagas Abertas de referência, na forma da linha de `vagas_abertas`. */
const linhaDeVagaT = (extra = {}) => ({
  situacao: "aberta",
  id: "33333333-3333-4333-8333-333333333333",
  slug: "analista-de-suporte",
  titulo: "Analista de Suporte",
  resumo: "Atender clientes\n  pelo   WhatsApp.",
  departamento: "Atendimento",
  departamento_cor: "var(--categoria-verde-bg)",
  tipo: "CLT",
  equivalente_jobposting: "FULL_TIME",
  nivel: "Pleno",
  nivel_cor: "var(--categoria-azul-bg)",
  modalidade: "presencial",
  localizacao: "Natal, RN",
  aberta_em: "2026-09-01T12:00:00+00:00",
  atualizado_em: "2026-09-02T09:30:00-03:00",
  ...extra,
});
const VAGAS_T = Object.freeze([
  linhaDeVagaT(),
  linhaDeVagaT({
    id: "44444444-4444-4444-8444-444444444444",
    slug: "dev-remoto",
    titulo: "Desenvolvedor",
    resumo: "",
    modalidade: "remoto",
    localizacao: null,
    aberta_em: "2026-08-20T12:00:00+00:00",
    atualizado_em: null,
  }),
]);

/* O mapa de HOJE para os Posts de referência, escrito à mão. Sem Vaga Aberta,
   a rota tem de devolver EXATAMENTE isto. */
const FIXAS_DO_MAPA_T = [
  "  <url>",
  `    <loc>${DOMINIO_T}/</loc>`,
  "    <changefreq>weekly</changefreq>",
  "    <priority>1.0</priority>",
  "  </url>",
  "  <url>",
  `    <loc>${DOMINIO_T}/api-oficial-whatsapp</loc>`,
  "    <changefreq>monthly</changefreq>",
  "    <priority>0.9</priority>",
  "  </url>",
  // TROCA REGISTRADA (2026-09-30): a página /integracoes entrou nas fixas.
  "  <url>",
  `    <loc>${DOMINIO_T}/integracoes</loc>`,
  "    <changefreq>monthly</changefreq>",
  "    <priority>0.8</priority>",
  "  </url>",
  "  <url>",
  `    <loc>${DOMINIO_T}/sobre</loc>`,
  "    <changefreq>monthly</changefreq>",
  "    <priority>0.7</priority>",
  "  </url>",
  "  <url>",
  `    <loc>${DOMINIO_T}/blog</loc>`,
  "    <changefreq>weekly</changefreq>",
  "    <priority>0.9</priority>",
  "  </url>",
  "  <url>",
  `    <loc>${DOMINIO_T}/carreiras</loc>`,
  "    <changefreq>monthly</changefreq>",
  "    <priority>0.5</priority>",
  "  </url>",
  "  <url>",
  `    <loc>${DOMINIO_T}/blog/como-automatizar</loc>`,
  "    <lastmod>2026-08-05</lastmod>",
  "    <changefreq>monthly</changefreq>",
  "    <priority>0.8</priority>",
  "  </url>",
  "  <url>",
  `    <loc>${DOMINIO_T}/blog/sem-data</loc>`,
  "    <changefreq>monthly</changefreq>",
  "    <priority>0.8</priority>",
  "  </url>",
];
const NOS_DAS_VAGAS_T = [
  "  <url>",
  `    <loc>${DOMINIO_T}/carreiras/analista-de-suporte</loc>`,
  "    <lastmod>2026-09-02T12:30:00.000Z</lastmod>",
  "    <changefreq>weekly</changefreq>",
  "    <priority>0.6</priority>",
  "  </url>",
  "  <url>",
  `    <loc>${DOMINIO_T}/carreiras/dev-remoto</loc>`,
  "    <changefreq>weekly</changefreq>",
  "    <priority>0.6</priority>",
  "  </url>",
];
const embrulharMapaT = (linhas) =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...linhas,
    "</urlset>",
    "",
  ].join("\n");
const MAPA_DE_HOJE_T = embrulharMapaT(FIXAS_DO_MAPA_T);
const MAPA_COM_VAGAS_T = embrulharMapaT([...FIXAS_DO_MAPA_T, ...NOS_DAS_VAGAS_T]);

/* O índice de HOJE para os mesmos Posts, escrito à mão. */
const INDICE_DE_HOJE_LINHAS_T = [
  "# ChatClean",
  "",
  "Plataforma de CRM e chatbot para WhatsApp. Este arquivo indexa as páginas públicas do site para leitura por máquina.",
  "",
  "## Páginas",
  "",
  `- ${DOMINIO_T}/: A plataforma: CRM e chatbot para WhatsApp com API Oficial.`,
  `- ${DOMINIO_T}/api-oficial-whatsapp: O que e a API Oficial do WhatsApp Business, como contratar e quanto custa.`,
  // TROCA REGISTRADA (2026-09-30): a página /integracoes entrou nas fixas.
  `- ${DOMINIO_T}/integracoes: Como a ChatClean se conecta a CRM, e-commerce, pagamentos e IA: webhook, API e integradores como n8n, Make e Zapier.`,
  `- ${DOMINIO_T}/sobre: Quem faz a ChatClean, e de onde.`,
  `- ${DOMINIO_T}/blog: Artigos sobre atendimento no WhatsApp, automacao e gestao de clientes.`,
  `- ${DOMINIO_T}/carreiras: Vagas abertas e como e trabalhar aqui.`,
  "",
  "## Artigos",
  "",
  `- [Como automatizar](${DOMINIO_T}/blog/como-automatizar): O que dá para automatizar.`,
  `- [Sem data](${DOMINIO_T}/blog/sem-data)`,
];
const INDICE_DE_HOJE_T = [...INDICE_DE_HOJE_LINHAS_T, ""].join("\n");
const INDICE_COM_VAGAS_T = [
  ...INDICE_DE_HOJE_LINHAS_T,
  "",
  "## Vagas",
  "",
  `- [Analista de Suporte](${DOMINIO_T}/carreiras/analista-de-suporte): Atender clientes pelo WhatsApp.`,
  `- [Desenvolvedor](${DOMINIO_T}/carreiras/dev-remoto)`,
  "",
].join("\n");

/**
 * O link de um item do índice como um leitor de Markdown o lê: o texto vai
 * até o primeiro `]` NÃO escapado, e o endereço é o `(...)` logo depois.
 * `null` quando a linha não é item com link.
 */
function linkMarkdownT(linha) {
  const texto = String(linha ?? "");
  if (!texto.startsWith("- [")) return null;
  let i = 3;
  let rotulo = "";
  while (i < texto.length && texto[i] !== "]") {
    if (texto[i] === "\\" && i + 1 < texto.length) {
      rotulo += texto[i + 1];
      i += 2;
    } else {
      rotulo += texto[i];
      i += 1;
    }
  }
  if (texto[i] !== "]" || texto[i + 1] !== "(") return null;
  const fim = texto.indexOf(")", i + 2);
  if (fim === -1) return null;
  return { rotulo, endereco: texto.slice(i + 2, fim) };
}

/** Os endereços de Vaga (caminho, sem domínio) num mapa, num índice e numa listagem servida. */
const vagasNoMapaT = (xml) =>
  [...String(xml ?? "").matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1])
    .filter((u) => u.startsWith(`${DOMINIO_T}/carreiras/`))
    .map((u) => u.slice(DOMINIO_T.length));
/* Casa pelo `](endereço)` que FECHA o link (seguido de `: ` ou do fim da
   linha), e não por `[^\]]*`: um título com `]` escapado não engana. */
const vagasNoIndiceT = (texto) =>
  String(texto ?? "")
    .split("\n")
    .filter((l) => l.startsWith("- ["))
    .map((l) => /\]\((https?:\/\/[^\s()]+)\)(?=: |$)/.exec(l)?.[1] ?? null)
    .filter((u) => u !== null && u.startsWith(`${DOMINIO_T}/carreiras/`))
    .map((u) => u.slice(DOMINIO_T.length));
const vagasNaListagemT = (html) => {
  const texto = String(html ?? "");
  const i = artigoModT === null ? -1 : texto.indexOf(artigoModT.MARCA_CORPO_INICIO);
  const j = i === -1 ? -1 : texto.indexOf(artigoModT.MARCA_CORPO_FIM, i);
  if (i === -1 || j === -1) return null;
  return [...texto.slice(i, j).matchAll(/href="(\/carreiras\/[^"]+)"/g)].map((m) => m[1]);
};
const mesmoConjuntoT = (a, b) => Array.isArray(a) && Array.isArray(b) && igual([...a].sort(), [...b].sort());
const etiquetasT = (r) => String(r?.cab?.["vercel-cache-tag"] ?? "").split(",").filter(Boolean);

afirmar(
  "autoteste dos extratores: acham as Vagas no mapa, no índice e na listagem, ignoram Post, página fixa e `/carreiras` sozinha, e o do índice não se engana com `]` escapado no título",
  igual(vagasNoMapaT(MAPA_COM_VAGAS_T), ["/carreiras/analista-de-suporte", "/carreiras/dev-remoto"]) &&
    igual(vagasNoMapaT(MAPA_DE_HOJE_T), []) &&
    igual(vagasNoIndiceT(INDICE_COM_VAGAS_T), ["/carreiras/analista-de-suporte", "/carreiras/dev-remoto"]) &&
    igual(vagasNoIndiceT(INDICE_DE_HOJE_T), []) &&
    igual(vagasNoIndiceT(`- [a\\](${DOMINIO_T}/carreiras/mal)](${DOMINIO_T}/carreiras/bom): r`), ["/carreiras/bom"]) &&
    (artigoModT === null ||
      igual(
        vagasNaListagemT(`x<a href="/carreiras/fora">${artigoModT.MARCA_CORPO_INICIO}<a href="/carreiras/a">a</a><a href="/carreiras">b</a>${artigoModT.MARCA_CORPO_FIM}`),
        ["/carreiras/a"],
      )) &&
    mesmoConjuntoT(["/b", "/a"], ["/a", "/b"]) &&
    !mesmoConjuntoT(["/a"], ["/a", "/b"]),
);
afirmar(
  "autoteste do leitor de link Markdown: o texto vai até o primeiro `]` não escapado, e um título sem escape DESVIA o link",
  mesmoJson(linkMarkdownT("- [a\\](x)](https://b/c): r"), { rotulo: "a](x)", endereco: "https://b/c" }) &&
    mesmoJson(linkMarkdownT("- [a](https://mal)](https://b/c)"), { rotulo: "a", endereco: "https://mal" }) &&
    linkMarkdownT("sem link") === null,
);

/* ── Node: o mapa e o índice puros ── */

if (mapaModT !== null && indiceModT !== null) {
  const { mapaDoSite } = mapaModT;
  const { indiceParaLlms } = indiceModT;

  afirmar(
    "a frequência e a importância da Vaga são constantes do módulo, com os valores da spec (`weekly`, `0.6`)",
    mapaModT.FREQUENCIA_DA_VAGA === "weekly" && mapaModT.PRIORIDADE_DA_VAGA === "0.6",
    `${mapaModT.FREQUENCIA_DA_VAGA} | ${mapaModT.PRIORIDADE_DA_VAGA}`,
  );
  afirmar(
    "sem Vaga, o mapa é o de HOJE, byte a byte, contra o texto escrito à mão (com o 4º parâmetro vazio e sem ele)",
    mapaDoSite(DOMINIO_T, undefined, POSTS_T, []) === MAPA_DE_HOJE_T &&
      mapaDoSite(DOMINIO_T, undefined, POSTS_T) === MAPA_DE_HOJE_T,
    mapaDoSite(DOMINIO_T, undefined, POSTS_T, []).slice(-300),
  );
  afirmar(
    "sem Vaga, o índice é o de HOJE, byte a byte, contra o texto escrito à mão (sem seção `## Vagas`)",
    indiceParaLlms(DOMINIO_T, POSTS_T, []) === INDICE_DE_HOJE_T && indiceParaLlms(DOMINIO_T, POSTS_T) === INDICE_DE_HOJE_T,
    JSON.stringify(indiceParaLlms(DOMINIO_T, POSTS_T, []).slice(-200)),
  );
  afirmar(
    "com duas Vagas Abertas, o mapa é o de hoje MAIS um nó por Vaga, depois dos Posts: `lastmod` com o instante completo (UTC) só na que tem `atualizado_em`, `weekly`, `0.6`",
    mapaDoSite(DOMINIO_T, undefined, POSTS_T, VAGAS_T) === MAPA_COM_VAGAS_T,
    mapaDoSite(DOMINIO_T, undefined, POSTS_T, VAGAS_T).slice(-700),
  );
  afirmar(
    "com duas Vagas Abertas, o índice ganha `## Vagas` DEPOIS de `## Artigos`: título, endereço absoluto e Resumo em UMA linha; sem Resumo, sem os dois-pontos",
    indiceParaLlms(DOMINIO_T, POSTS_T, VAGAS_T) === INDICE_COM_VAGAS_T,
    JSON.stringify(indiceParaLlms(DOMINIO_T, POSTS_T, VAGAS_T).slice(-300)),
  );

  /* `lastmod`: o instante ISO 8601 com data, hora e fuso, e só ele. */
  const lastmodDe = (atualizado) =>
    /<lastmod>([^<]*)<\/lastmod>/.exec(mapaDoSite(DOMINIO_T, [], [], [{ slug: "x", atualizado_em: atualizado }]))?.[1] ?? null;
  afirmar(
    "o `lastmod` da Vaga é `atualizado_em` como instante W3C completo em UTC (e não só a data, como no Post)",
    lastmodDe("2026-09-02T09:30:00-03:00") === "2026-09-02T12:30:00.000Z" &&
      lastmodDe("2026-09-02T23:59:59.123+00:00") === "2026-09-02T23:59:59.123Z" &&
      lastmodDe("2026-09-02T12:00:00Z") === "2026-09-02T12:00:00.000Z",
    `${lastmodDe("2026-09-02T09:30:00-03:00")} | ${lastmodDe("2026-09-02T23:59:59.123+00:00")} | ${lastmodDe("2026-09-02T12:00:00Z")}`,
  );
  const tortasT = [
    null,
    undefined,
    "ontem de manhã",
    "",
    "   ",
    1759000000000,
    { quando: "2026-09-02" },
    "2026-09-02",
    "2026-09-02T12:00:00",
    "September 2, 2026",
    "2026/09/02 12:00",
    "Wed, 02 Sep 2026 12:00:00 GMT",
    "+002026-09-02T12:00:00Z",
    "2026-13-40T12:00:00Z",
  ];
  afirmar(
    `\`atualizado_em\` ausente, fora de ISO 8601 com data, hora e fuso, com ano estendido ou impossível OMITE o \`lastmod\`, e a Vaga continua no mapa (${tortasT.length} formas)`,
    tortasT.every((t) => lastmodDe(t) === null) &&
      tortasT.every((t) => mapaDoSite(DOMINIO_T, [], [], [{ slug: "x", atualizado_em: t }]).includes(`<loc>${DOMINIO_T}/carreiras/x</loc>`)),
    tortasT.map((t) => `${JSON.stringify(t)}→${lastmodDe(t)}`).join(", "),
  );

  /* Slug hostil: codificado pelo domínio e ESCAPADO no XML; sem endereço, fora. */
  const hostil = mapaDoSite(DOMINIO_T, [], [], [{ slug: "d'agua&<x>", atualizado_em: null }]);
  const locHostil = /<loc>([\s\S]*?)<\/loc>/.exec(hostil)?.[1] ?? null;
  afirmar(
    "Slug hostil: o endereço sai do domínio (`encodeURIComponent`) e ainda é ESCAPADO no XML (`'` vira `&apos;`); nada cru de `&`, `<` ou `'` dentro do `<loc>`",
    locHostil === `${DOMINIO_T}/carreiras/d&apos;agua%26%3Cx%3E` &&
      !/['"<>]/.test(locHostil) &&
      !/&(?!apos;|amp;|lt;|gt;|quot;)/.test(locHostil),
    locHostil ?? hostil.slice(0, 200),
  );
  const semEndereco = [{ slug: "" }, { slug: "   " }, { slug: null }, {}, null];
  afirmar(
    `Vaga cujo endereço dá \`null\` é OMITIDA do mapa e do índice (${semEndereco.length} formas), sem derrubar as outras`,
    mapaDoSite(DOMINIO_T, [], [], [...semEndereco, { slug: "fica" }]).match(/<url>/g)?.length === 1 &&
      mapaDoSite(DOMINIO_T, [], [], [...semEndereco, { slug: "fica" }]).includes("/carreiras/fica</loc>") &&
      igual(vagasNoIndiceT(indiceParaLlms(DOMINIO_T, [], [...semEndereco, { slug: "fica", titulo: "Fica" }])), ["/carreiras/fica"]),
    mapaDoSite(DOMINIO_T, [], [], [...semEndereco, { slug: "fica" }]),
  );
  afirmar(
    "só Vagas sem endereço: a seção `## Vagas` é OMITIDA (cabeçalho sozinho afirmaria uma lista vazia)",
    !indiceParaLlms(DOMINIO_T, POSTS_T, semEndereco).includes("## Vagas") &&
      indiceParaLlms(DOMINIO_T, POSTS_T, semEndereco) === INDICE_DE_HOJE_T,
  );
  const semArtigos = indiceParaLlms(DOMINIO_T, [], VAGAS_T.slice(1));
  afirmar(
    "sem Post e com Vaga: `## Vagas` vem logo depois das Páginas, e `## Artigos` continua omitida",
    !semArtigos.includes("## Artigos") &&
      semArtigos.endsWith(`- ${DOMINIO_T}/carreiras: Vagas abertas e como e trabalhar aqui.\n\n## Vagas\n\n- [Desenvolvedor](${DOMINIO_T}/carreiras/dev-remoto)\n`),
    JSON.stringify(semArtigos.slice(-160)),
  );
  const multilinha = indiceParaLlms(DOMINIO_T, [], [{ slug: "a", titulo: "Título\ncom quebra", resumo: "\n linha 1\r\n\tlinha 2 \n" }, { slug: "b", titulo: "B", resumo: "  \n\t " }]);
  afirmar(
    "Resumo e título com quebra viram UMA linha; Resumo só de espaço conta como vazio (sem `: `)",
    multilinha.includes(`\n- [Título com quebra](${DOMINIO_T}/carreiras/a): linha 1 linha 2\n`) &&
      multilinha.includes(`\n- [B](${DOMINIO_T}/carreiras/b)\n`) &&
      !multilinha.includes(`/carreiras/b):`),
    JSON.stringify(multilinha.slice(-160)),
  );

  /* Título hostil: escapado para Markdown; o link continua sendo o da Vaga. */
  const HOSTIS = [
    ["pleno", "Analista [Pleno]", `- [Analista \\[Pleno\\]](${DOMINIO_T}/carreiras/pleno)`],
    ["desvio", "a](https://mal.example)", `- [a\\](https://mal.example)](${DOMINIO_T}/carreiras/desvio)`],
    ["barra", "C:\\Pasta\\", `- [C:\\\\Pasta\\\\](${DOMINIO_T}/carreiras/barra)`],
    ["a(b)", "Parênteses", `- [Parênteses](${DOMINIO_T}/carreiras/a%28b%29)`],
  ];
  const indiceHostil = indiceParaLlms(DOMINIO_T, [], HOSTIS.map(([slug, titulo]) => ({ slug, titulo })));
  const linhasHostis = indiceHostil.split("\n").filter((l) => l.startsWith("- ["));
  const desviados = HOSTIS.filter(([slug, titulo, esperada], n) => {
    const link = linkMarkdownT(linhasHostis[n]);
    return !(
      linhasHostis[n] === esperada &&
      link !== null &&
      link.rotulo === titulo &&
      link.endereco === `${DOMINIO_T}${regrasDaVaga.enderecoDaPaginaDaVaga(slug).replace(/\(/g, "%28").replace(/\)/g, "%29")}`
    );
  });
  afirmar(
    `título de Vaga hostil no \`/llms.txt\` (${HOSTIS.length} formas): \`\\\`, \`[\`, \`]\` escapados, \`(\`/\`)\` do endereço codificados, e o link lido como Markdown aponta para a VAGA com o título inteiro como texto`,
    desviados.length === 0 && linhasHostis.length === HOSTIS.length,
    desviados.map(([s]) => `${s}: ${linhasHostis[HOSTIS.findIndex(([x]) => x === s)]}`).join(" | ") || linhasHostis.join(" | "),
  );

  /* Título de POST hostil (decisão do Felix em 2026-09-29, Spec Change Log da
     5.9): o mesmo escape das Vagas. Antes, o título do Post saía cru, e
     "a](https://mal.example)" desviava o link. Os golden de cima (sem
     colchete) continuam byte a byte: título comum não muda. */
  const POSTS_HOSTIS = [
    ["guia-2026", "Guia [2026]", `- [Guia \\[2026\\]](${DOMINIO_T}/blog/guia-2026)`],
    ["desvio-post", "a](https://mal.example)", `- [a\\](https://mal.example)](${DOMINIO_T}/blog/desvio-post)`],
    ["barra-post", "C:\\Pasta\\", `- [C:\\\\Pasta\\\\](${DOMINIO_T}/blog/barra-post)`],
  ];
  const indicePostsHostis = indiceParaLlms(DOMINIO_T, POSTS_HOSTIS.map(([slug, titulo]) => ({ slug, titulo })), []);
  const linhasPostsHostis = indicePostsHostis
    .split("\n")
    .filter((l) => l.startsWith("- [") && l.includes(`${DOMINIO_T}/blog/`));
  const postsDesviados = POSTS_HOSTIS.filter(([slug, titulo, esperada], n) => {
    const link = linkMarkdownT(linhasPostsHostis[n]);
    return !(
      linhasPostsHostis[n] === esperada &&
      link !== null &&
      link.rotulo === titulo &&
      link.endereco === `${DOMINIO_T}/blog/${slug}`
    );
  });
  afirmar(
    `título de Post hostil no \`/llms.txt\` (${POSTS_HOSTIS.length} formas): \`\\\`, \`[\`, \`]\` escapados, e o link lido como Markdown aponta para o POST com o título inteiro como texto`,
    postsDesviados.length === 0 && linhasPostsHostis.length === POSTS_HOSTIS.length,
    postsDesviados.map(([s]) => s).join(", ") + " | " + linhasPostsHostis.join(" | "),
  );
}

/* ── Node: `vagasIsoladas` nunca rejeita e tem prazo ── */

if (leituraModT !== null) {
  const iso = leituraModT.vagasIsoladas;
  afirmar(
    "o prazo da leitura das Vagas é uma constante nomeada de `leitura.js`, de 3 s",
    leituraModT.PRAZO_DA_LEITURA_DAS_VAGAS_MS === 3000,
    String(leituraModT.PRAZO_DA_LEITURA_DAS_VAGAS_MS),
  );
  const casos = [
    ["lança", () => {
      throw new Error("explodiu");
    }],
    ["rejeita", () => Promise.reject(new Error("rejeitou"))],
    ["devolve algo sem forma", () => undefined],
    ["devolve `ok` sem lista", () => ({ ok: true, vagas: null })],
  ];
  const vazaram = [];
  for (const [nome, ler] of casos) {
    let r;
    try {
      r = await iso({ ler });
    } catch (e) {
      r = { lancou: String(e?.message ?? e) };
    }
    if (!(r?.ok === false && typeof r.defeito === "string" && r.defeito !== "")) vazaram.push(`${nome}: ${JSON.stringify(r)}`);
  }
  afirmar(
    `\`vagasIsoladas\` nunca rejeita: leitura que ${casos.map(([n]) => n).join(", ")} vira \`{ok:false, defeito}\``,
    vazaram.length === 0,
    vazaram.join(" | "),
  );
  let sinalRecebido = null;
  const t0 = Date.now();
  const pendurada = await iso({
    prazoMs: 150,
    ler: ({ sinal }) => {
      sinalRecebido = sinal;
      return new Promise(() => {});
    },
  });
  const levou = Date.now() - t0;
  afirmar(
    "`vagasIsoladas`: leitura que nunca responde vence o prazo, vira `{ok:false}` dizendo o prazo, e o sinal passado à leitura é ABORTADO",
    pendurada.ok === false &&
      /prazo/.test(pendurada.defeito) &&
      levou < 1500 &&
      sinalRecebido !== null &&
      sinalRecebido.aborted === true,
    `${JSON.stringify(pendurada)} | ${levou} ms | abortado ${sinalRecebido?.aborted}`,
  );
  const boa = await iso({ ler: () => ({ ok: true, vagas: [{ slug: "a" }] }) });
  afirmar(
    "controle: leitura boa passa como veio",
    boa.ok === true && igual(boa.vagas, [{ slug: "a" }]),
    JSON.stringify(boa),
  );
}

/* ── Dirigida: o mapa, o índice e a listagem contra UM dublê ── */

if (mapaModT !== null && indiceModT !== null && sitemapModT !== null && diagModT !== null && leituraModT !== null && cacheModT !== null && moduloDoHandler !== null) {
  /** Resposta que DERRUBA a conexão: a rede caindo no meio da leitura. */
  const DERRUBAR = Symbol("derrubar");
  /** Resposta que NUNCA vem: a leitura pendurada. */
  const PENDURAR = Symbol("pendurar");
  const respostasT = { posts_no_ar: [200, POSTS_T], vagas_abertas: [200, []] };
  const pedidosT = [];
  const penduradas = [];
  /* Para medir o paralelismo: com `segurar`, o PRIMEIRO pedido que chega fica
     sem resposta até o segundo chegar (ou por 1,5 s). Leituras em sequência só
     fariam o segundo pedido DEPOIS da resposta do primeiro, e os dois nunca
     estariam pendentes ao mesmo tempo. */
  let segurar = false;
  let liberarPendente = null;
  let doisPendentes = false;
  const dubleT = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      const nome = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(req.url ?? "")?.[1] ?? null;
      pedidosT.push(nome);
      const responder = () => {
        const [status, dados] = respostasT[nome] ?? [404, { message: "função fora do dublê" }];
        if (dados === DERRUBAR) {
          req.socket.destroy();
          return;
        }
        if (dados === PENDURAR) {
          const pendurada = { socket: req.socket, fechada: false };
          req.socket.once("close", () => {
            pendurada.fechada = true;
          });
          penduradas.push(pendurada);
          return;
        }
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(typeof dados === "string" ? dados : JSON.stringify(dados));
      };
      if (segurar && liberarPendente === null) {
        const prazo = setTimeout(() => {
          liberarPendente = null;
          responder();
        }, 1500);
        liberarPendente = () => {
          clearTimeout(prazo);
          liberarPendente = null;
          responder();
        };
        return;
      }
      if (segurar && liberarPendente !== null) {
        doisPendentes = true;
        liberarPendente();
      }
      responder();
    });
  });
  await new Promise((pronto) => dubleT.listen(0, "127.0.0.1", pronto));
  const AMBIENTE_T = {
    VITE_DOMINIO_DO_SITE: DOMINIO_T,
    SUPABASE_URL: `http://127.0.0.1:${dubleT.address().port}`,
    SUPABASE_CHAVE_PUBLICAVEL: "sb_publishable_duble_5_9",
    VITE_SUPABASE_URL: undefined,
    VITE_SUPABASE_PUBLISHABLE_KEY: undefined,
  };

  const dirigirT = async (handler, url, injecao = undefined) => {
    const antes = pedidosT.length;
    const r = await dirigirRotaT(handler, { url, ambiente: AMBIENTE_T, injecao });
    r.pedidos = pedidosT.slice(antes);
    return r;
  };
  const mapaT = (injecao) => dirigirT(sitemapModT.default, "/api/sitemap", injecao);
  const indiceT = (injecao) => dirigirT(indiceModT.default, "/api/llms", injecao);
  const listagemT = () => dirigirT(moduloDoHandler.default, "/api/carreiras");
  const diag = (r) => r.cab["x-entrega-diagnostico"];
  const CACHE_SAUDAVEL = cacheModT.politicaDeCache(200);

  try {
    afirmar(
      "a política da resposta saudável é a de sempre (`public, s-maxage=60`)",
      CACHE_SAUDAVEL === "public, s-maxage=60",
      CACHE_SAUDAVEL,
    );

    /* Sem Vagas: o de hoje, byte a byte. */
    respostasT.posts_no_ar = [200, POSTS_T];
    respostasT.vagas_abertas = [200, []];
    const mapaVazio = await mapaT();
    const indiceVazio = await indiceT();
    afirmar(
      "rota, sem Vaga Aberta: `/sitemap.xml` responde 200 com o mapa de HOJE, byte a byte (texto escrito à mão), e diagnóstico `ok`",
      mapaVazio.status === 200 && mapaVazio.texto === MAPA_DE_HOJE_T && diag(mapaVazio) === diagModT.DIAGNOSTICO_OK,
      `HTTP ${mapaVazio.status} | ${diag(mapaVazio)} | ${mapaVazio.lancou ?? ""}`,
    );
    afirmar(
      "rota, sem Vaga Aberta: `/llms.txt` responde 200 com o índice de HOJE, byte a byte, sem `## Vagas`, e diagnóstico `ok`",
      indiceVazio.status === 200 && indiceVazio.texto === INDICE_DE_HOJE_T && diag(indiceVazio) === diagModT.DIAGNOSTICO_OK,
      `HTTP ${indiceVazio.status} | ${diag(indiceVazio)} | ${JSON.stringify(indiceVazio.texto.slice(-120))}`,
    );
    afirmar(
      "as duas rotas pedem `posts_no_ar` E `vagas_abertas`, uma vez cada, e nada mais",
      [mapaVazio, indiceVazio].every((r) => igual([...r.pedidos].sort(), ["posts_no_ar", "vagas_abertas"])),
      `${mapaVazio.pedidos.join(",")} | ${indiceVazio.pedidos.join(",")}`,
    );
    afirmar(
      "resposta saudável, nas duas rotas: `Cache-Control` `public, s-maxage=60`, e `Vercel-Cache-Tag` com a etiqueta de Carreiras junto das que já levavam (`blog` e a da rota)",
      mapaVazio.cab["cache-control"] === CACHE_SAUDAVEL &&
        indiceVazio.cab["cache-control"] === CACHE_SAUDAVEL &&
        igual(etiquetasT(mapaVazio), [cacheModT.ETIQUETA_DA_COLECAO, "sitemap", cacheModT.ETIQUETA_DE_CARREIRAS]) &&
        igual(etiquetasT(indiceVazio), [cacheModT.ETIQUETA_DA_COLECAO, "llms", cacheModT.ETIQUETA_DE_CARREIRAS]) &&
        cacheModT.ETIQUETA_DE_CARREIRAS === "carreiras",
      `${mapaVazio.cab["cache-control"]} [${etiquetasT(mapaVazio)}] | ${indiceVazio.cab["cache-control"]} [${etiquetasT(indiceVazio)}]`,
    );

    /* Com Vagas. */
    respostasT.vagas_abertas = [200, VAGAS_T];
    const mapaCheio = await mapaT();
    const indiceCheio = await indiceT();
    const listagemCheia = await listagemT();
    afirmar(
      "rota, com duas Vagas Abertas (uma sem `atualizado_em`): o mapa é EXATAMENTE as fixas, os Posts e as duas Vagas, `lastmod` só na que tem, diagnóstico `ok`",
      mapaCheio.status === 200 && mapaCheio.texto === MAPA_COM_VAGAS_T && diag(mapaCheio) === diagModT.DIAGNOSTICO_OK,
      `HTTP ${mapaCheio.status} | ${diag(mapaCheio)} | ${mapaCheio.texto.slice(-400)}`,
    );
    afirmar(
      "rota, com duas Vagas Abertas: o índice é EXATAMENTE o de hoje mais `## Vagas` com as duas linhas, diagnóstico `ok`",
      indiceCheio.status === 200 && indiceCheio.texto === INDICE_COM_VAGAS_T && diag(indiceCheio) === diagModT.DIAGNOSTICO_OK,
      `HTTP ${indiceCheio.status} | ${diag(indiceCheio)} | ${JSON.stringify(indiceCheio.texto.slice(-250))}`,
    );
    const noMapa = vagasNoMapaT(mapaCheio.texto);
    const noIndice = vagasNoIndiceT(indiceCheio.texto);
    const naListagem = vagasNaListagemT(listagemCheia.texto);
    afirmar(
      "o MESMO conjunto de endereços de Vaga no mapa, no índice e no `<noscript>` da `/carreiras` servida, contra o mesmo dublê (e não vazio)",
      listagemCheia.status === 200 &&
        noMapa.length === VAGAS_T.length &&
        mesmoConjuntoT(noMapa, noIndice) &&
        mesmoConjuntoT(noMapa, naListagem),
      `mapa [${noMapa.join(", ")}] | índice [${noIndice.join(", ")}] | listagem HTTP ${listagemCheia.status} [${(naListagem ?? ["(sem região)"]).join(", ")}]`,
    );

    /* Efeito na listagem da 5.8: a leitura é tudo ou nada, e o `resumo` agora
       lido entra nisso. */
    respostasT.vagas_abertas = [200, [linhaDeVagaT(), linhaDeVagaT({ slug: "outra", resumo: { x: 1 } })]];
    const listagemTorta = await listagemT();
    afirmar(
      "`/carreiras` servida com uma linha de `resumo` de tipo errado responde o 500 de leitura (`no-store`, `degradado:leitura-falhou`): a leitura é tudo ou nada, por decisão",
      listagemTorta.status === 500 &&
        listagemTorta.cab["cache-control"] === "no-store" &&
        diag(listagemTorta) === diagModT.DIAGNOSTICO_LEITURA_FALHOU,
      `HTTP ${listagemTorta.status} | ${listagemTorta.cab["cache-control"]} | ${diag(listagemTorta)}`,
    );

    /* As duas leituras em paralelo. */
    respostasT.vagas_abertas = [200, VAGAS_T];
    let paraleloNoMapa = false;
    let paraleloNoIndice = false;
    let mapaParalelo = null;
    let indiceParalelo = null;
    try {
      segurar = true;
      doisPendentes = false;
      mapaParalelo = await mapaT();
      paraleloNoMapa = doisPendentes;
      doisPendentes = false;
      indiceParalelo = await indiceT();
      paraleloNoIndice = doisPendentes;
    } finally {
      segurar = false;
      if (liberarPendente !== null) liberarPendente();
      liberarPendente = null;
    }
    afirmar(
      "as duas leituras correm em PARALELO: `posts_no_ar` e `vagas_abertas` ficam pendentes AO MESMO TEMPO (no mapa e no índice)",
      paraleloNoMapa && paraleloNoIndice && mapaParalelo?.texto === MAPA_COM_VAGAS_T && indiceParalelo?.texto === INDICE_COM_VAGAS_T,
      `mapa ${paraleloNoMapa} | índice ${paraleloNoIndice}`,
    );

    /* As Vagas falham: 200 com fixas e Posts, degradado, `no-store`, evento. */
    const degradadaCerta = (r, esperado) => {
      const evento = r.eventos.find((e) => e.includes("[entrega:evento]") && e.includes(diagModT.DIAGNOSTICO_VAGAS_FALHARAM));
      return (
        r.status === 200 &&
        r.texto === esperado &&
        diag(r) === diagModT.DIAGNOSTICO_VAGAS_FALHARAM &&
        r.cab["cache-control"] === "no-store" &&
        etiquetasT(r).length === 0 &&
        evento !== undefined &&
        /"detalhe":"[^"]+/.test(evento) &&
        r.lancou === undefined
      );
    };
    const FALHAS_DAS_VAGAS = [
      ["RPC 500", [500, { message: "erro" }]],
      ["RPC 404", [404, { message: "sem função" }]],
      ["rede cai", [200, DERRUBAR]],
      ["corpo que não é JSON", [200, "{nao e json"]],
      ["corpo que não é lista", [200, { x: 1 }]],
      ["linha torta (Encerrada)", [200, [linhaDeVagaT({ situacao: "encerrada" })]]],
      ["linha com Slug fora do formato", [200, [linhaDeVagaT({ slug: "Fora/Do&Formato" })]]],
      ["linha com campo de tipo errado", [200, [linhaDeVagaT({ resumo: { x: 1 } })]]],
    ];
    const naoIsoladas = [];
    for (const [nome, resposta] of FALHAS_DAS_VAGAS) {
      respostasT.posts_no_ar = [200, POSTS_T];
      respostasT.vagas_abertas = resposta;
      for (const [rota, dirigirRota, esperado] of [
        ["mapa", mapaT, MAPA_DE_HOJE_T],
        ["índice", indiceT, INDICE_DE_HOJE_T],
      ]) {
        const r = await dirigirRota();
        if (!degradadaCerta(r, esperado)) {
          naoIsoladas.push(`${nome} no ${rota}: HTTP ${r.status}, ${diag(r)}, ${r.cab["cache-control"]}, [${etiquetasT(r)}], ${r.lancou ?? ""}`);
        }
      }
    }
    afirmar(
      `a falha das Vagas é ISOLADA (${FALHAS_DAS_VAGAS.length} formas × 2 rotas): 200 com as fixas e os Posts de hoje, sem Vaga, \`no-store\` e sem etiqueta (a resposta incompleta não fica no cache), diagnóstico \`${diagModT.DIAGNOSTICO_VAGAS_FALHARAM}\` e evento registrado com o motivo`,
      naoIsoladas.length === 0,
      naoIsoladas.join(" | "),
    );

    /* Vagas penduradas: o prazo responde pela rota. */
    respostasT.posts_no_ar = [200, POSTS_T];
    respostasT.vagas_abertas = [200, PENDURAR];
    const prazo = leituraModT.PRAZO_DA_LEITURA_DAS_VAGAS_MS;
    const penduradasFora = [];
    for (const [rota, dirigirRota, esperado] of [
      ["mapa", mapaT, MAPA_DE_HOJE_T],
      ["índice", indiceT, INDICE_DE_HOJE_T],
    ]) {
      const r = await dirigirRota();
      if (!(degradadaCerta(r, esperado) && r.ms >= prazo - 100 && r.ms < prazo + 1500)) {
        penduradasFora.push(`${rota}: HTTP ${r.status}, ${diag(r)}, ${r.cab["cache-control"]}, ${r.ms} ms`);
      }
    }
    afirmar(
      `\`vagas_abertas\` que NUNCA responde: cada rota responde no prazo (${prazo} ms, com folga de 1,5 s), 200 com fixas e Posts, \`no-store\`, diagnóstico degradado`,
      penduradasFora.length === 0,
      penduradasFora.join(" | "),
    );
    /* O PRAZO CANCELA a chamada, e não só para de esperar por ela: a conexão
       pendurada é fechada pelo lado da rota (o sinal chega ao `fetch`). */
    await new Promise((pronto) => setTimeout(pronto, 300));
    const abertasAinda = penduradas.filter((p) => !p.fechada).length;
    afirmar(
      "e o prazo CANCELA a leitura pendurada: a conexão de `vagas_abertas` é fechada pela rota (o sinal chega ao `fetch`), nas duas rotas",
      penduradas.length === 2 && abertasAinda === 0,
      `${penduradas.length} pendurada(s), ${abertasAinda} ainda aberta(s)`,
    );
    for (const p of penduradas.splice(0)) p.socket.destroy();

    /* A leitura das Vagas LANÇA ou rejeita: o `.catch` de `vagasIsoladas`. */
    respostasT.vagas_abertas = [200, VAGAS_T];
    const lancadas = [];
    for (const [nome, ler] of [
      ["lança", () => {
        throw new Error("explodiu dentro da leitura");
      }],
      ["rejeita", () => Promise.reject(new Error("rejeitou dentro da leitura"))],
    ]) {
      for (const [rota, dirigirRota, esperado] of [
        ["mapa", mapaT, MAPA_DE_HOJE_T],
        ["índice", indiceT, INDICE_DE_HOJE_T],
      ]) {
        const r = await dirigirRota({ lerVagas: () => leituraModT.vagasIsoladas({ ler }) });
        if (!degradadaCerta(r, esperado)) lancadas.push(`${nome} no ${rota}: HTTP ${r.status}, ${diag(r)}, ${r.lancou ?? ""}`);
      }
    }
    afirmar(
      "a leitura das Vagas que LANÇA ou rejeita (injetada em `vagasIsoladas`) vira a mesma degradação, em cada rota",
      lancadas.length === 0,
      lancadas.join(" | "),
    );
    afirmar(
      "`vagasIsoladas` mora UMA vez, em `leitura.js`: as duas rotas a importam de lá e não declaram leitura de Vagas própria",
      ["api/sitemap.js", "api/llms.js"].every((arquivo) => {
        const fonte = semComentarios(ler(arquivo) ?? "");
        return /import\s*\{[^}]*\bvagasIsoladas\b[^}]*\}\s*from\s*["']\.\/_nucleo\/leitura\.js["']/.test(fonte) &&
          !/function\s+vagasIsoladas|vagasAbertasServidas/.test(fonte);
      }),
    );

    /* Os Posts falham: 500 como hoje, qualquer que seja o estado das Vagas. */
    const naoDerrubadas = [];
    for (const [nomeDasVagas, vagas] of [
      ["Vagas boas", [200, VAGAS_T]],
      ["Vagas vazias", [200, []]],
      ["Vagas falhando", [500, { message: "erro" }]],
    ]) {
      for (const [nomeDosPosts, posts] of [
        ["Posts 500", [500, { message: "erro" }]],
        ["rede dos Posts cai", [200, DERRUBAR]],
      ]) {
        respostasT.posts_no_ar = posts;
        respostasT.vagas_abertas = vagas;
        for (const [rota, dirigirRota, marca] of [
          ["mapa", mapaT, "<urlset"],
          ["índice", indiceT, "## Páginas"],
        ]) {
          const r = await dirigirRota();
          if (
            !(
              r.status === 500 &&
              diag(r) === diagModT.DIAGNOSTICO_LEITURA_FALHOU &&
              r.cab["cache-control"] === "no-store" &&
              !r.texto.includes(marca) &&
              !r.texto.includes("/carreiras/")
            )
          ) {
            naoDerrubadas.push(`${nomeDosPosts} + ${nomeDasVagas} no ${rota}: HTTP ${r.status}, ${diag(r)}`);
          }
        }
      }
    }
    afirmar(
      "a falha dos POSTS continua 500 `no-store` com `degradado:leitura-falhou`, com Vagas boas, vazias ou falhando (3 × 2 × 2 casos)",
      naoDerrubadas.length === 0,
      naoDerrubadas.join(" | "),
    );
  } finally {
    for (const p of penduradas.splice(0)) p.socket.destroy();
    dubleT.closeAllConnections?.();
    await new Promise((pronto) => dubleT.close(pronto));
  }
}

/* ── Remota: as duas rotas contra o banco real, sem criar Vaga ── */

if (!temToken) {
  afirmar(
    "banco REAL: `/sitemap.xml` e `/llms.txt` respondem 200 `ok`, e as Vagas que listam são EXATAMENTE as Abertas da leitura real (nenhuma, enquanto não houver)",
    false,
    "sem SUPABASE_ACCESS_TOKEN: a leitura real é da sessão principal",
  );
} else if (!urlDoEnv || !chavePublicavel || sitemapModT === null || indiceModT === null || leituraModT === null || diagModT === null) {
  afirmar("banco REAL: `/sitemap.xml` e `/llms.txt`", false, "sem VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY no `.env`, ou módulo ausente");
} else {
  const AMBIENTE_REAL_T = { VITE_DOMINIO_DO_SITE: DOMINIO_T, SUPABASE_URL: urlDoEnv, SUPABASE_CHAVE_PUBLICAVEL: chavePublicavel };
  const mapaReal = await dirigirRotaT(sitemapModT.default, { url: "/api/sitemap", ambiente: AMBIENTE_REAL_T });
  const indiceReal = await dirigirRotaT(indiceModT.default, { url: "/api/llms", ambiente: AMBIENTE_REAL_T });
  const lidas = await leituraModT.vagasAbertasServidas({
    ambiente: { SUPABASE_URL: urlDoEnv, SUPABASE_CHAVE_PUBLICAVEL: chavePublicavel },
  });
  const esperadas = lidas.ok
    ? lidas.vagas.map((v) => regrasDaVaga.enderecoDaPaginaDaVaga(v.slug)).filter((e) => e !== null)
    : null;
  const diagReal = (r) => r.cab["x-entrega-diagnostico"];
  afirmar(
    "banco REAL: `/sitemap.xml` e `/llms.txt` respondem 200 com diagnóstico `ok` (as duas leituras reais passaram)",
    mapaReal.lancou === undefined &&
      indiceReal.lancou === undefined &&
      mapaReal.status === 200 &&
      indiceReal.status === 200 &&
      diagReal(mapaReal) === diagModT.DIAGNOSTICO_OK &&
      diagReal(indiceReal) === diagModT.DIAGNOSTICO_OK,
    `mapa HTTP ${mapaReal.status} ${diagReal(mapaReal)} ${mapaReal.lancou ?? ""} | índice HTTP ${indiceReal.status} ${diagReal(indiceReal)} ${indiceReal.lancou ?? ""} | ${[...mapaReal.eventos, ...indiceReal.eventos].join(" ").slice(0, 200)}`,
  );
  afirmar(
    "banco REAL: as Vagas no mapa e no índice são EXATAMENTE as da leitura real de `vagas_abertas` (nenhum `/carreiras/<slug>` enquanto não houver Vaga Aberta)",
    esperadas !== null &&
      mesmoConjuntoT(vagasNoMapaT(mapaReal.texto), esperadas) &&
      mesmoConjuntoT(vagasNoIndiceT(indiceReal.texto), esperadas) &&
      (esperadas.length > 0 || (!mapaReal.texto.includes("/carreiras/") && !indiceReal.texto.includes("## Vagas"))),
    `leitura ${lidas.ok ? `${esperadas.length} Vaga(s)` : lidas.defeito} | mapa [${vagasNoMapaT(mapaReal.texto).join(", ")}] | índice [${vagasNoIndiceT(indiceReal.texto).join(", ")}]`,
  );
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
