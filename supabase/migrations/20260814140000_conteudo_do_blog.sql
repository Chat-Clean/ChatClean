-- Conteúdo do blog: o schema do Post e a visibilidade na camada de dados.
--
-- Story 2.1 — Schema de posts com visibilidade na camada de dados.
--
-- Invariantes que esta migração estabelece:
--
--   * A visibilidade pública mora AQUI, na política de leitura anônima de
--     `posts`, e em nenhum outro lugar. Nenhuma consulta repete o filtro; se
--     um consumidor precisar repeti-lo para estar correto, o erro está na
--     política.
--   * A política inclui `agendado` de propósito: é ela que publica. Post
--     agendado cuja hora chegou passa a ser retornado por decorrência de
--     `publicado_em <= now()` — sem cron, sem job, sem alguém virar a chave.
--     Ler o `agendado` como redundância e removê-lo quebra o agendamento
--     inteiro; a verificação comportamental existe para impedir isso.
--   * `publicado_em` é `timestamptz`. Com `timestamp` sem fuso e o Painel
--     gravando horário local, a comparação contra `now()` (UTC, na RLS)
--     publicaria o Post três horas antes do combinado.
--   * `publicado_em` nulo torna o Post invisível mesmo em `publicado`, porque
--     `null <= now()` é nulo, não verdadeiro. É o comportamento certo: Post
--     publicado sem data de publicação é dado incompleto.
--   * RLS habilitada na mesma migração que cria cada tabela.
--   * NENHUMA política concede INSERT, UPDATE ou DELETE a `anon` ou a
--     `authenticated`. O único caminho de escrita é a função de servidor
--     (AD-5), que chega na Story 2.5. A revogação de privilégio é o segundo
--     cadeado: política e privilégio são fechaduras distintas, e a Story 1.2
--     já pagou o preço de descobrir isso.
--   * O enum de `estado` tem exatamente os quatro valores de
--     `src/domain/blog/estados.js`, na mesma grafia. A verificação importa
--     aquele módulo e compara — divergência entre banco e código é falha.
--   * Idempotente: reaplicar em banco já migrado termina sem erro e sem
--     duplicar objeto.
--
-- É o modelo inteiro numa migração só porque as tabelas se referenciam:
-- aplicar metade deixaria o banco inconsistente.

-- ─── Extensões ───────────────────────────────────────────────────────────
--
-- `unaccent` é da busca sem acento da Story 2.11, mas extensão é
-- infraestrutura de schema e pertence à migração que funda o módulo. Vai para
-- o schema `extensions`, onde o Supabase mantém as demais.

create extension if not exists unaccent with schema extensions;

-- ─── O vocabulário de Estado ─────────────────────────────────────────────
--
-- Quatro valores, na ordem do ciclo de vida, idênticos aos de
-- `src/domain/blog/estados.js`. `create type` não aceita `if not exists`, daí
-- o bloco condicional.

do $$
begin
  if not exists (
    select 1 from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and t.typname = 'estado_post'
  ) then
    create type public.estado_post as enum (
      'rascunho',
      'agendado',
      'publicado',
      'arquivado'
    );
  end if;
end $$;

comment on type public.estado_post is
  'Estado do Post. Vocabulário fechado, espelho de src/domain/blog/estados.js — os dois são comparados pela ferramenta de verificação.';

-- ─── Categorias ──────────────────────────────────────────────────────────
--
-- `icone` é chave de um mapa fechado no código, não nome de componente;
-- `cor` é valor CSS aplicado por estilo, nunca classe utilitária — classe
-- gerada em tempo de execução não existe no CSS compilado.

create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null,
  icone text not null default '',
  cor text not null default '',
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint categorias_nome_nao_vazio
    check (btrim(nome) <> '' and char_length(nome) <= 120),
  constraint categorias_slug_nao_vazio
    check (btrim(slug) <> '' and char_length(slug) <= 160),
  constraint categorias_slug_unico unique (slug)
);

comment on table public.categorias is
  'Categorias do blog. Vêm de dado, não de constante no código.';
comment on column public.categorias.icone is
  'Chave de um mapa fechado no código, não nome de arquivo nem de componente.';
comment on column public.categorias.cor is
  'Valor CSS (ex.: oklch(...) ou #rrggbb), aplicado por estilo. Nunca classe utilitária.';

alter table public.categorias enable row level security;

-- ─── Posts ───────────────────────────────────────────────────────────────

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  titulo text not null,
  resumo text not null default '',

  -- Fonte canônica: o documento estruturado. `conteudo_html` é projeção
  -- derivada, gravada na mesma transação — derivado desatualizado é pior que
  -- ausente. Nenhum consumidor deriva HTML em tempo de leitura, e nenhum
  -- trata o HTML derivado como entrada de edição.
  conteudo jsonb not null default '{}'::jsonb,
  conteudo_html text not null default '',

  categoria_id uuid references public.categorias (id) on delete set null,

  -- `autor_id` aponta para a Conta; `autor_nome` é a assinatura congelada no
  -- momento em que o Post nasceu — ela não muda quando outra Conta edita.
  autor_id uuid references public.perfis (id) on delete set null,
  autor_nome text not null default '',

  imagem_url text,
  imagem_alt text,
  seo_titulo text,
  seo_descricao text,
  seo_imagem_url text,
  tempo_leitura integer not null default 0,
  destaque boolean not null default false,
  demo boolean not null default false,

  -- O par que decide a visibilidade. Post nasce rascunho, sempre.
  estado public.estado_post not null default 'rascunho',
  publicado_em timestamptz,

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint posts_slug_nao_vazio
    check (btrim(slug) <> '' and char_length(slug) <= 200),
  constraint posts_slug_unico unique (slug),
  constraint posts_tempo_leitura_nao_negativo check (tempo_leitura >= 0)
);

comment on table public.posts is
  'O Post. A visibilidade pública é decidida pela política posts_leitura_anonima e por nada mais.';
comment on column public.posts.conteudo is
  'Documento estruturado — a fonte canônica. Validado contra o schema fechado de domain/blog na escrita.';
comment on column public.posts.conteudo_html is
  'Projeção derivada do documento, gravada na mesma transação. Nunca é entrada de edição.';
comment on column public.posts.publicado_em is
  'timestamptz por necessidade: a comparação da RLS roda em UTC. Nulo torna o Post invisível mesmo em estado publicado.';
comment on column public.posts.autor_nome is
  'Assinatura congelada na criação. Não muda quando outra Conta edita o Post.';

alter table public.posts enable row level security;

-- Ordenação da listagem: rascunho não tem `publicado_em`, e ordenar só por ela
-- faria os nulos afundarem ou dominarem. O índice espelha exatamente a
-- expressão que o Épico 2 usa.
create index if not exists posts_ordem_idx
  on public.posts ((coalesce(publicado_em, atualizado_em)) desc);

-- A política de leitura anônima filtra por estas duas colunas em toda leitura
-- pública; sem índice, cada visita é varredura sequencial.
create index if not exists posts_estado_publicado_em_idx
  on public.posts (estado, publicado_em desc);

create index if not exists posts_categoria_idx
  on public.posts (categoria_id);

-- ─── Tags e a associação ─────────────────────────────────────────────────

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null,
  criado_em timestamptz not null default now(),
  constraint tags_nome_nao_vazio
    check (btrim(nome) <> '' and char_length(nome) <= 80),
  constraint tags_slug_nao_vazio
    check (btrim(slug) <> '' and char_length(slug) <= 120),
  constraint tags_slug_unico unique (slug)
);

comment on table public.tags is 'Tags do blog, normalizadas para a busca e o filtro.';

alter table public.tags enable row level security;

create table if not exists public.posts_tags (
  post_id uuid not null references public.posts (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (post_id, tag_id)
);

comment on table public.posts_tags is
  'Associação Post↔Tag. A leitura anônima é derivada da visibilidade do Post: nenhuma tag de rascunho aparece.';

alter table public.posts_tags enable row level security;

create index if not exists posts_tags_tag_idx
  on public.posts_tags (tag_id);

-- ─── Slugs aposentados ───────────────────────────────────────────────────
--
-- Slug de Post publicado que mudou. É a base do redirecionamento permanente
-- (301) e o segundo lugar contra o qual a unicidade de slug é validada.

create table if not exists public.slugs_antigos (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  post_id uuid not null references public.posts (id) on delete cascade,
  criado_em timestamptz not null default now(),
  constraint slugs_antigos_slug_nao_vazio
    check (btrim(slug) <> '' and char_length(slug) <= 200),
  constraint slugs_antigos_slug_unico unique (slug)
);

comment on table public.slugs_antigos is
  'Slugs aposentados, para o 301 permanente. A unicidade de slug é validada contra esta tabela também.';

alter table public.slugs_antigos enable row level security;

create index if not exists slugs_antigos_post_idx
  on public.slugs_antigos (post_id);

-- ─── A política que decide o que é público ───────────────────────────────
--
-- A ÚNICA guardiã da visibilidade. Está escrita exatamente como o critério de
-- aceite manda, e a verificação comportamental prova que o banco a aplica —
-- ler o texto de uma política não prova nada.

drop policy if exists "posts_leitura_anonima" on public.posts;
create policy "posts_leitura_anonima"
  on public.posts
  for select
  to anon
  using (estado in ('publicado', 'agendado') and publicado_em <= now());

-- O Painel vê tudo: rascunho, agendado por vir e arquivado são exatamente o
-- que ele existe para administrar.
drop policy if exists "posts_leitura_autenticada" on public.posts;
create policy "posts_leitura_autenticada"
  on public.posts
  for select
  to authenticated
  using (true);

-- Categorias e tags são vocabulário público: o filtro do Blog Público precisa
-- delas antes de qualquer Post ser lido, e elas não revelam conteúdo.
drop policy if exists "categorias_leitura_anonima" on public.categorias;
create policy "categorias_leitura_anonima"
  on public.categorias
  for select
  to anon
  using (true);

drop policy if exists "categorias_leitura_autenticada" on public.categorias;
create policy "categorias_leitura_autenticada"
  on public.categorias
  for select
  to authenticated
  using (true);

drop policy if exists "tags_leitura_anonima" on public.tags;
create policy "tags_leitura_anonima"
  on public.tags
  for select
  to anon
  using (true);

drop policy if exists "tags_leitura_autenticada" on public.tags;
create policy "tags_leitura_autenticada"
  on public.tags
  for select
  to authenticated
  using (true);

-- A associação e os slugs aposentados NÃO repetem o filtro de visibilidade:
-- eles o derivam. A subconsulta sobre `posts` roda sob a RLS de `posts` para
-- o mesmo papel, então "o Post é visível" é decidido uma única vez, na
-- política acima. Trocar isto por `using (true)` faria a tag e o slug antigo
-- de um rascunho vazarem; reescrever o filtro aqui criaria a segunda cópia
-- que a arquitetura proíbe.
drop policy if exists "posts_tags_leitura_anonima" on public.posts_tags;
create policy "posts_tags_leitura_anonima"
  on public.posts_tags
  for select
  to anon
  using (
    exists (select 1 from public.posts p where p.id = posts_tags.post_id)
  );

drop policy if exists "posts_tags_leitura_autenticada" on public.posts_tags;
create policy "posts_tags_leitura_autenticada"
  on public.posts_tags
  for select
  to authenticated
  using (true);

drop policy if exists "slugs_antigos_leitura_anonima" on public.slugs_antigos;
create policy "slugs_antigos_leitura_anonima"
  on public.slugs_antigos
  for select
  to anon
  using (
    exists (select 1 from public.posts p where p.id = slugs_antigos.post_id)
  );

drop policy if exists "slugs_antigos_leitura_autenticada" on public.slugs_antigos;
create policy "slugs_antigos_leitura_autenticada"
  on public.slugs_antigos
  for select
  to authenticated
  using (true);

-- ─── Privilégios: o segundo cadeado ──────────────────────────────────────
--
-- Ausência de política já nega a escrita sob RLS. A revogação existe para que
-- uma política de escrita criada por engano ainda esbarre em privilégio.
-- `TRUNCATE` entra na lista porque RLS não o restringe.
-- `service_role` ignora RLS e privilégio — é por ele que a função de servidor
-- da Story 2.5 vai escrever.

revoke insert, update, delete, truncate on public.categorias from anon;
revoke insert, update, delete, truncate on public.categorias from authenticated;
revoke insert, update, delete, truncate on public.posts from anon;
revoke insert, update, delete, truncate on public.posts from authenticated;
revoke insert, update, delete, truncate on public.tags from anon;
revoke insert, update, delete, truncate on public.tags from authenticated;
revoke insert, update, delete, truncate on public.posts_tags from anon;
revoke insert, update, delete, truncate on public.posts_tags from authenticated;
revoke insert, update, delete, truncate on public.slugs_antigos from anon;
revoke insert, update, delete, truncate on public.slugs_antigos from authenticated;

-- Concessão explícita de leitura. A Story 1.2 descobriu que a leitura vinha
-- funcionando por privilégio padrão implícito do Supabase; dependência
-- implícita não é invariante.
grant select on public.categorias to anon;
grant select on public.categorias to authenticated;
grant select on public.posts to anon;
grant select on public.posts to authenticated;
grant select on public.tags to anon;
grant select on public.tags to authenticated;
grant select on public.posts_tags to anon;
grant select on public.posts_tags to authenticated;
grant select on public.slugs_antigos to anon;
grant select on public.slugs_antigos to authenticated;

-- ─── `atualizado_em` mantido pelo banco ──────────────────────────────────
--
-- Reaproveita `public.tocar_atualizado_em()`, criada na Story 1.2. Coluna com
-- `default now()` e nada que a mantenha foi defeito corrigido lá e não se
-- repete aqui: a ordenação da listagem depende dela ser verdadeira.

drop trigger if exists posts_tocar_atualizado_em on public.posts;
create trigger posts_tocar_atualizado_em
  before update on public.posts
  for each row
  execute function public.tocar_atualizado_em();

drop trigger if exists categorias_tocar_atualizado_em on public.categorias;
create trigger categorias_tocar_atualizado_em
  before update on public.categorias
  for each row
  execute function public.tocar_atualizado_em();
