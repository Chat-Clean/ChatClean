-- ═══════════════════════════════════════════════════════════════════════════
-- Story 5.2: as Vagas e as Classificações no banco.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Até aqui a Vaga vivia no `localStorage` de quem a criava. Esta migração cria
-- o lugar dela no banco, e a regra de quem a vê:
--
--   * o enum `public.estado_vaga` (rascunho, aberta, encerrada), espelho de
--     `src/domain/carreiras/estados.js`;
--   * as três Classificações (`departamentos`, `tipos_de_vaga`, `niveis`), com
--     nome único sem caixa nem acento e Cor/Equivalente de lista fechada;
--   * `vagas`, com os CHECKs de formato, de tamanho e o INVARIANTE DA ABERTA;
--   * os espelhos SQL da projeção reduzida da Descrição (documento e HTML);
--   * RLS: `anon` vê só a Vaga Aberta, `authenticated` vê tudo, ninguém de
--     fora escreve;
--   * as funções de entrega `situacao_da_vaga` e `vagas_abertas`, e a busca
--     do Painel `buscar_vagas_do_painel`;
--   * a semeadura com os valores de hoje.
--
-- ─── O QUE ESTA MIGRAÇÃO NÃO TOCA ───────────────────────────────────────────
--
-- Nada que já existe é alterado, removido ou redefinido. As funções do Blog
-- (`documento_do_post_e_permitido`, `html_do_post_e_seguro`,
-- `nos_do_documento`, `normalizar_busca`, `tocar_atualizado_em` e
-- `decodificar_entidades`) são CHAMADAS, nunca recriadas: a verificação da
-- escrita compara o corpo delas, e redefinir uma aqui mudaria o Blog.
--
-- Idempotente: reaplicar em banco já migrado termina sem erro.

-- ─── O vocabulário de Estado da Vaga ─────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and t.typname = 'estado_vaga'
  ) then
    create type public.estado_vaga as enum (
      'rascunho',
      'aberta',
      'encerrada'
    );
  end if;
end $$;

comment on type public.estado_vaga is
  'Estado da Vaga. Vocabulário fechado, espelho de src/domain/carreiras/estados.js; os dois são comparados pela ferramenta verificar:carreiras.';

-- ─── Os espelhos SQL da projeção reduzida da Descrição ───────────────────
--
-- A Descrição da Vaga é uma PROJEÇÃO do documento do Post
-- (`VOCABULARIO_DA_DESCRICAO`, em `src/domain/blog/schema.js`). O CHECK da
-- tabela chama PRIMEIRO a defesa do Post (`documento_do_post_e_permitido`,
-- `html_do_post_e_seguro`) e DEPOIS estas duas, que só RECORTAM: tudo o que o
-- Post recusa continua recusado, e do que ele aceita só passa o que é da
-- projeção.
--
-- As duas são LISTA DE PERMISSÃO, nunca de proibição: nó, marca, atributo,
-- etiqueta e esquema de link fora da lista reprovam. A ferramenta
-- verificar:carreiras compara cada lista com a projeção JS nos dois sentidos.
--
-- `create or replace`, e não `drop` + `create`: a restrição de `vagas`
-- depende delas, e um `drop` numa reaplicação derrubaria a migração.

create or replace function public.descricao_da_vaga_e_permitida(doc jsonb)
  returns boolean
  language sql
  immutable
  parallel safe
  set search_path = ''
as $fn$
  select case
    when doc is null then false
    when jsonb_typeof(doc) <> 'object' then false
    when doc ->> 'type' is distinct from 'doc' then false
    else not exists (
      select 1
        from public.nos_do_documento(doc) as t(n)
             cross join lateral (
               select case
                 when jsonb_typeof(t.n) <> 'object'
                   then 'valor solto onde um nó deveria estar'
                 -- (1) O NÓ está na projeção.
                 when coalesce(t.n ->> 'type', '') <> all (array[
                        'doc',
                        'paragraph',
                        'heading',
                        'bulletList',
                        'orderedList',
                        'listItem',
                        'text',
                        'hardBreak'
                      ])
                   then 'nó fora da projeção'
                 when (t.n -> 'attrs') is not null
                      and jsonb_typeof(t.n -> 'attrs') not in ('object', 'null')
                   then 'atributos fora de forma'
                 -- (2) Cada ATRIBUTO do nó está na lista do nó. Parágrafo não
                 -- tem nenhum (é aqui que `textAlign` cai), título só `level`.
                 when exists (
                   select 1
                     from jsonb_object_keys(
                            case when jsonb_typeof(t.n -> 'attrs') = 'object'
                                 then t.n -> 'attrs'
                                 else '{}'::jsonb end
                          ) as chave
                    where chave <> all (
                            case t.n ->> 'type'
                              when 'heading' then array['level']
                              when 'orderedList' then array['start', 'type']
                              else array[]::text[]
                            end
                          )
                 )
                   then 'atributo de nó fora da projeção'
                 else null
               end as problema
               union all
               select case
                 when jsonb_typeof(marca) <> 'object'
                   then 'valor solto onde uma marca deveria estar'
                 -- (3) A MARCA está na projeção.
                 when coalesce(marca ->> 'type', '') <> all (array[
                        'bold',
                        'italic',
                        'link'
                      ])
                   then 'marca fora da projeção'
                 when (marca -> 'attrs') is not null
                      and jsonb_typeof(marca -> 'attrs') not in ('object', 'null')
                   then 'atributos de marca fora de forma'
                 -- (4) Cada ATRIBUTO da marca está na lista da marca.
                 when exists (
                   select 1
                     from jsonb_object_keys(
                            case when jsonb_typeof(marca -> 'attrs') = 'object'
                                 then marca -> 'attrs'
                                 else '{}'::jsonb end
                          ) as chave
                    where chave <> all (
                            case marca ->> 'type'
                              when 'link' then array['href', 'target', 'rel', 'title', 'class']
                              else array[]::text[]
                            end
                          )
                 )
                   then 'atributo de marca fora da projeção'
                 -- (5) O ESQUEMA do link, sobre o valor DECODIFICADO (a mesma
                 -- ordem de `enderecoPermitidoNaDescricao`): só http, https e
                 -- mailto. Relativo e `tel:` ficam de fora.
                 when (marca ->> 'type') = 'link'
                      and lower(btrim(public.decodificar_entidades(
                            coalesce(marca #>> '{attrs,href}', '')
                          ))) !~ '^(https?|mailto):'
                   then 'esquema de link fora da projeção'
                 else null
               end
                 from jsonb_array_elements(
                        case when jsonb_typeof(t.n -> 'marks') = 'array'
                             then t.n -> 'marks'
                             else '[]'::jsonb end
                      ) as marca
             ) as achado
       where achado.problema is not null
    )
  end;
$fn$;

comment on function public.descricao_da_vaga_e_permitida(jsonb) is
  'Lista de PERMISSÃO da projeção reduzida da Descrição da Vaga: nó, atributo de nó, marca, atributo de marca e esquema de link (http, https, mailto, sobre o valor decodificado). Recorta o que documento_do_post_e_permitido já aceitou; as listas são comparadas com VOCABULARIO_DA_DESCRICAO por verificar:carreiras.';

create or replace function public.html_da_descricao_e_reduzido(html text)
  returns boolean
  language sql
  immutable
  parallel safe
  set search_path = ''
as $fn$
  with entrada as (
    select
      coalesce(html, '') as bruto,
      regexp_replace(coalesce(html, ''), '"[^"]*"', '~', 'g') as sem_valores
  ),
  tags as (
    select lower(m[1]) as etiqueta
      from entrada
           cross join lateral regexp_matches(
             entrada.sem_valores,
             '<[[:space:]]*/?[[:space:]]*([a-zA-Z][a-zA-Z0-9]*)([^>]*)>',
             'g'
           ) as m
  ),
  pares as (
    select lower(p[1]) as nome, p[2] as valor
      from entrada
           cross join lateral regexp_matches(
             entrada.bruto,
             '([a-zA-Z0-9:_.-]+)[[:space:]]*=[[:space:]]*"([^"]*)"',
             'g'
           ) as p
  )
  select
    html is not null
    -- Todo `<` abre uma etiqueta reconhecida: nada se esconde fora da contagem.
    and (select count(*) from tags)
        = (length((select sem_valores from entrada))
           - length(replace((select sem_valores from entrada), '<', '')))
    -- A ETIQUETA está na projeção: sem citação, código, linha, imagem, destaque.
    and not exists (
      select 1 from tags
       where tags.etiqueta <> all (array[
               'p','h2','h3','strong','em','ul','ol','li','a','br'
             ])
    )
    -- E o link emitido tem o esquema da projeção.
    and not exists (
      select 1 from pares
       where pares.nome = 'href'
         and lower(btrim(public.decodificar_entidades(pares.valor))) !~ '^(https?|mailto):'
    );
$fn$;

comment on function public.html_da_descricao_e_reduzido(text) is
  'Lista de PERMISSÃO do HTML da Descrição da Vaga: etiqueta (p, h2, h3, strong, em, ul, ol, li, a, br) e esquema do href (http, https, mailto). Recorta o que html_do_post_e_seguro já aceitou; comparada com o renderizador único por verificar:carreiras. Não saneia, recusa.';

-- ─── As Classificações ────────────────────────────────────────────────────
--
-- `cor` é a paleta fechada das Categorias (`CORES_DE_CATEGORIA`, em
-- `src/domain/blog/categorias.js`), aplicada por `style`, nunca classe. O
-- nome é único SEM caixa e SEM acento, por índice sobre `normalizar_busca`
-- (imutável; `unaccent` sozinho não serve em índice).

create table if not exists public.departamentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cor text not null default 'var(--categoria-cinza-bg)',
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint departamentos_nome_valido
    check (nome ~ '[^[:space:]]' and char_length(nome) <= 80),
  constraint departamentos_cor_na_paleta
    check (cor in (
      'var(--categoria-verde-bg)',
      'var(--categoria-azul-bg)',
      'var(--categoria-roxo-bg)',
      'var(--categoria-ambar-bg)',
      'var(--categoria-rosa-bg)',
      'var(--categoria-ciano-bg)',
      'var(--categoria-terracota-bg)',
      'var(--categoria-cinza-bg)'
    )),
  constraint departamentos_ordem_nao_negativa check (ordem >= 0)
);

create table if not exists public.tipos_de_vaga (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  equivalente_jobposting text not null,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint tipos_de_vaga_nome_valido
    check (nome ~ '[^[:space:]]' and char_length(nome) <= 80),
  constraint tipos_de_vaga_equivalente_valido
    check (equivalente_jobposting in (
      'FULL_TIME',
      'PART_TIME',
      'CONTRACTOR',
      'TEMPORARY',
      'INTERN',
      'VOLUNTEER',
      'PER_DIEM',
      'OTHER'
    )),
  constraint tipos_de_vaga_ordem_nao_negativa check (ordem >= 0)
);

create table if not exists public.niveis (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cor text not null default 'var(--categoria-cinza-bg)',
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint niveis_nome_valido
    check (nome ~ '[^[:space:]]' and char_length(nome) <= 80),
  constraint niveis_cor_na_paleta
    check (cor in (
      'var(--categoria-verde-bg)',
      'var(--categoria-azul-bg)',
      'var(--categoria-roxo-bg)',
      'var(--categoria-ambar-bg)',
      'var(--categoria-rosa-bg)',
      'var(--categoria-ciano-bg)',
      'var(--categoria-terracota-bg)',
      'var(--categoria-cinza-bg)'
    )),
  constraint niveis_ordem_nao_negativa check (ordem >= 0)
);

create unique index if not exists departamentos_nome_normalizado_unico
  on public.departamentos (public.normalizar_busca(nome));
create unique index if not exists tipos_de_vaga_nome_normalizado_unico
  on public.tipos_de_vaga (public.normalizar_busca(nome));
create unique index if not exists niveis_nome_normalizado_unico
  on public.niveis (public.normalizar_busca(nome));

comment on table public.departamentos is
  'Departamento da Vaga (Classificação). Nome único sem caixa nem acento; Cor da paleta das Categorias, aplicada por style.';
comment on table public.tipos_de_vaga is
  'Tipo da Vaga (Classificação). Nome único sem caixa nem acento; Equivalente JobPosting de lista fechada.';
comment on table public.niveis is
  'Nível da Vaga (Classificação). Nome único sem caixa nem acento; Cor da paleta das Categorias, aplicada por style.';

alter table public.departamentos enable row level security;
alter table public.tipos_de_vaga enable row level security;
alter table public.niveis enable row level security;

-- ─── As Vagas ─────────────────────────────────────────────────────────────
--
-- As três Classificações são OBRIGATÓRIAS desde o Rascunho e `restrict` na
-- exclusão: uma Classificação em uso não some por baixo de uma Vaga. O
-- Rascunho pode ficar sem Modalidade, sem Resumo, sem Descrição e sem Link;
-- a Aberta, não (ver `vagas_aberta_completa`).

create table if not exists public.vagas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  slug text not null,
  estado public.estado_vaga not null default 'rascunho',
  departamento_id uuid not null
    references public.departamentos (id) on delete restrict,
  tipo_id uuid not null
    references public.tipos_de_vaga (id) on delete restrict,
  nivel_id uuid not null
    references public.niveis (id) on delete restrict,
  modalidade text,
  localizacao text not null default '',
  resumo text not null default '',
  descricao jsonb not null
    default '{"type": "doc", "content": [{"type": "paragraph"}]}'::jsonb,
  descricao_html text not null default '',
  link_de_candidatura text,
  aberta_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint vagas_titulo_valido
    check (titulo ~ '[^[:space:]]' and char_length(titulo) <= 120),
  constraint vagas_slug_formato
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 200),
  constraint vagas_slug_unico unique (slug),
  constraint vagas_modalidade_valida
    check (modalidade in ('presencial', 'hibrido', 'remoto')),
  constraint vagas_resumo_tamanho check (char_length(resumo) <= 200),
  constraint vagas_localizacao_tamanho check (char_length(localizacao) <= 80),
  constraint vagas_link_de_candidatura_valido
    check (
      link_de_candidatura is null
      or (
        char_length(link_de_candidatura) <= 2048
        and link_de_candidatura ~ '^https?://[^\s]+$'
      )
    ),
  -- `aberta_em` é o `datePosted`: gravado na primeira abertura e mantido ao
  -- reabrir. Toda Vaga que já saiu do Rascunho o tem.
  constraint vagas_aberta_em_obrigatorio
    check (estado = 'rascunho' or aberta_em is not null),
  -- O INVARIANTE DA ABERTA (C-FR-13). Espelho: `problemasParaAbrir`, em
  -- `src/domain/carreiras/vaga.js`. Descrição "não vazia" é HTML com texto
  -- fora das etiquetas.
  constraint vagas_aberta_completa
    check (
      estado <> 'aberta'
      or (
        modalidade is not null
        and resumo ~ '[^[:space:]]'
        and regexp_replace(descricao_html, '<[^>]*>', '', 'g') ~ '[^[:space:]]'
        and link_de_candidatura is not null
        and (modalidade = 'remoto' or localizacao ~ '[^[:space:]]')
      )
    ),
  constraint vagas_descricao_na_projecao
    check (
      public.documento_do_post_e_permitido(descricao)
      and public.descricao_da_vaga_e_permitida(descricao)
    ),
  constraint vagas_descricao_html_segura
    check (
      public.html_do_post_e_seguro(descricao_html)
      and public.html_da_descricao_e_reduzido(descricao_html)
    )
);

comment on table public.vagas is
  'Vagas de Carreiras. Pública só quando Aberta (política vagas_leitura_anonima); escrita só pela função de servidor.';
comment on column public.vagas.descricao is
  'Fonte canônica da Descrição: documento na projeção reduzida. descricao_html é derivado dela na mesma escrita.';

create index if not exists vagas_departamento_idx on public.vagas (departamento_id);
create index if not exists vagas_tipo_idx on public.vagas (tipo_id);
create index if not exists vagas_nivel_idx on public.vagas (nivel_id);

alter table public.vagas enable row level security;

-- ─── A política que decide o que é público ───────────────────────────────
--
-- A ÚNICA guardiã da visibilidade da Vaga. Nenhuma consulta pública repete o
-- filtro; as funções de entrega abaixo aplicam a MESMA regra.

drop policy if exists "vagas_leitura_anonima" on public.vagas;
create policy "vagas_leitura_anonima"
  on public.vagas
  for select
  to anon
  using (estado = 'aberta');

drop policy if exists "vagas_leitura_autenticada" on public.vagas;
create policy "vagas_leitura_autenticada"
  on public.vagas
  for select
  to authenticated
  using (true);

-- As Classificações são vocabulário público: o filtro de /carreiras precisa
-- delas, e elas não revelam Vaga nenhuma.
drop policy if exists "departamentos_leitura_anonima" on public.departamentos;
create policy "departamentos_leitura_anonima"
  on public.departamentos
  for select
  to anon
  using (true);

drop policy if exists "departamentos_leitura_autenticada" on public.departamentos;
create policy "departamentos_leitura_autenticada"
  on public.departamentos
  for select
  to authenticated
  using (true);

drop policy if exists "tipos_de_vaga_leitura_anonima" on public.tipos_de_vaga;
create policy "tipos_de_vaga_leitura_anonima"
  on public.tipos_de_vaga
  for select
  to anon
  using (true);

drop policy if exists "tipos_de_vaga_leitura_autenticada" on public.tipos_de_vaga;
create policy "tipos_de_vaga_leitura_autenticada"
  on public.tipos_de_vaga
  for select
  to authenticated
  using (true);

drop policy if exists "niveis_leitura_anonima" on public.niveis;
create policy "niveis_leitura_anonima"
  on public.niveis
  for select
  to anon
  using (true);

drop policy if exists "niveis_leitura_autenticada" on public.niveis;
create policy "niveis_leitura_autenticada"
  on public.niveis
  for select
  to authenticated
  using (true);

-- ─── Privilégios: o segundo cadeado ──────────────────────────────────────
--
-- Sem política de escrita, a RLS já nega. A revogação existe para que uma
-- política de escrita criada por engano ainda esbarre em privilégio. O
-- Supabase concede tudo a `anon` e `authenticated` por privilégio padrão, e é
-- por isso que a revogação é explícita, papel a papel.

revoke insert, update, delete, truncate on public.vagas from anon;
revoke insert, update, delete, truncate on public.vagas from authenticated;
revoke insert, update, delete, truncate on public.vagas from public;
revoke insert, update, delete, truncate on public.departamentos from anon;
revoke insert, update, delete, truncate on public.departamentos from authenticated;
revoke insert, update, delete, truncate on public.departamentos from public;
revoke insert, update, delete, truncate on public.tipos_de_vaga from anon;
revoke insert, update, delete, truncate on public.tipos_de_vaga from authenticated;
revoke insert, update, delete, truncate on public.tipos_de_vaga from public;
revoke insert, update, delete, truncate on public.niveis from anon;
revoke insert, update, delete, truncate on public.niveis from authenticated;
revoke insert, update, delete, truncate on public.niveis from public;

grant select on public.vagas to anon;
grant select on public.vagas to authenticated;
grant select on public.departamentos to anon;
grant select on public.departamentos to authenticated;
grant select on public.tipos_de_vaga to anon;
grant select on public.tipos_de_vaga to authenticated;
grant select on public.niveis to anon;
grant select on public.niveis to authenticated;

-- ─── `atualizado_em` mantido pelo banco ──────────────────────────────────

drop trigger if exists vagas_tocar_atualizado_em on public.vagas;
create trigger vagas_tocar_atualizado_em
  before update on public.vagas
  for each row
  execute function public.tocar_atualizado_em();

drop trigger if exists departamentos_tocar_atualizado_em on public.departamentos;
create trigger departamentos_tocar_atualizado_em
  before update on public.departamentos
  for each row
  execute function public.tocar_atualizado_em();

drop trigger if exists tipos_de_vaga_tocar_atualizado_em on public.tipos_de_vaga;
create trigger tipos_de_vaga_tocar_atualizado_em
  before update on public.tipos_de_vaga
  for each row
  execute function public.tocar_atualizado_em();

drop trigger if exists niveis_tocar_atualizado_em on public.niveis;
create trigger niveis_tocar_atualizado_em
  before update on public.niveis
  for each row
  execute function public.tocar_atualizado_em();

-- ─── A situação de um endereço de Vaga ───────────────────────────────────
--
-- `security definer` pelo mesmo motivo de `situacao_do_endereco`: distinguir
-- Encerrada de inexistente exige ver um bit que a política anônima esconde. O
-- que ela devolve a mais é ESSE bit mais o título, e nada além: da Encerrada
-- vêm só título e Slug. Rascunho é indistinguível de nunca ter existido.

drop function if exists public.situacao_da_vaga(text);

create or replace function public.situacao_da_vaga(p_slug text)
  returns table (
    situacao text,
    id uuid,
    slug text,
    titulo text,
    resumo text,
    descricao_html text,
    departamento text,
    departamento_cor text,
    tipo text,
    equivalente_jobposting text,
    nivel text,
    nivel_cor text,
    modalidade text,
    localizacao text,
    link_de_candidatura text,
    aberta_em timestamptz,
    atualizado_em timestamptz
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_vaga public.vagas%rowtype;
begin
  -- ENDEREÇO TORTO NÃO VIRA CONSULTA: o formato é o mesmo que a coluna cobra.
  if p_slug is null
     or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or char_length(p_slug) > 200 then
    return query select 'inexistente'::text, null::uuid, null::text, null::text,
      null::text, null::text, null::text, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::text,
      null::timestamptz, null::timestamptz;
    return;
  end if;

  select * into v_vaga from public.vagas x where x.slug = p_slug;

  if found and v_vaga.estado = 'aberta' then
    -- ABERTA: aqui, e SÓ aqui, o conteúdo vem junto.
    return query
      select 'aberta'::text, v_vaga.id, v_vaga.slug, v_vaga.titulo, v_vaga.resumo,
             v_vaga.descricao_html, d.nome, d.cor, t.nome, t.equivalente_jobposting,
             n.nome, n.cor, v_vaga.modalidade, v_vaga.localizacao,
             v_vaga.link_de_candidatura, v_vaga.aberta_em, v_vaga.atualizado_em
        from public.departamentos d
             cross join public.tipos_de_vaga t
             cross join public.niveis n
       where d.id = v_vaga.departamento_id
         and t.id = v_vaga.tipo_id
         and n.id = v_vaga.nivel_id;
    return;
  end if;

  if found and v_vaga.estado = 'encerrada' then
    -- ENCERRADA: o título e o Slug, e NADA MAIS.
    return query select 'encerrada'::text, null::uuid, v_vaga.slug, v_vaga.titulo,
      null::text, null::text, null::text, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::text,
      null::timestamptz, null::timestamptz;
    return;
  end if;

  -- RASCUNHO E ENDEREÇO QUE NUNCA EXISTIU: a mesma resposta, sem nem o Slug.
  return query select 'inexistente'::text, null::uuid, null::text, null::text,
    null::text, null::text, null::text, null::text, null::text, null::text,
    null::text, null::text, null::text, null::text, null::text,
    null::timestamptz, null::timestamptz;
end;
$$;

comment on function public.situacao_da_vaga(text) is
  'Resolve o endereço de uma Vaga para o vocabulário fechado da entrega: aberta (com a Vaga e os nomes e Cores das Classificações), encerrada (só título e Slug) ou inexistente (tudo nulo). Rascunho é indistinguível de inexistente. É security definer porque distinguir Encerrada de inexistente exige ver o bit que a política anônima esconde, e é esse bit, mais o título, que ela devolve a mais.';

-- ─── As Vagas Abertas, para /carreiras, o mapa do site e o llms.txt ──────

drop function if exists public.vagas_abertas();

create or replace function public.vagas_abertas()
  returns table (
    situacao text,
    id uuid,
    slug text,
    titulo text,
    resumo text,
    departamento text,
    departamento_cor text,
    tipo text,
    equivalente_jobposting text,
    nivel text,
    nivel_cor text,
    modalidade text,
    localizacao text,
    aberta_em timestamptz,
    atualizado_em timestamptz
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select 'aberta'::text, v.id, v.slug, v.titulo, v.resumo,
         d.nome, d.cor, t.nome, t.equivalente_jobposting, n.nome, n.cor,
         v.modalidade, v.localizacao, v.aberta_em, v.atualizado_em
    from public.vagas v
    join public.departamentos d on d.id = v.departamento_id
    join public.tipos_de_vaga t on t.id = v.tipo_id
    join public.niveis n on n.id = v.nivel_id
   where v.estado = 'aberta'
   order by v.aberta_em desc, v.id desc;
$$;

comment on function public.vagas_abertas() is
  'As Vagas Abertas, as mais recentes primeiro (aberta_em desc), com os nomes e as Cores das Classificações. Sem Descrição e sem Link de Candidatura: quem precisa deles resolve o endereço um a um por situacao_da_vaga. Rascunho e Encerrada nunca aparecem.';

-- ─── A busca do Painel ────────────────────────────────────────────────────
--
-- No molde de `buscar_posts_do_painel`: `security invoker` (a RLS continua
-- sendo a única guardiã), o termo quebrado em palavras e TODAS precisam
-- aparecer em título, nome do Departamento ou Localização, comparadas por
-- contenção literal sobre `normalizar_busca` dos dois lados. O Estado é
-- convertido para o enum AQUI: valor fora do vocabulário é recusado com erro.

drop function if exists public.buscar_vagas_do_painel(text, text);

create or replace function public.buscar_vagas_do_painel(
  p_termo text default null,
  p_estado text default null
)
  returns setof public.vagas
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  with pedido as (
    select
      nullif(
        btrim(regexp_replace(public.normalizar_busca(coalesce(p_termo, '')), '\s+', ' ', 'g')),
        ''
      ) as termo,
      nullif(btrim(coalesce(p_estado, '')), '')::public.estado_vaga as estado
  )
  select v.*
    from public.vagas v
    cross join pedido q
    cross join lateral (
      select public.normalizar_busca(
        coalesce(v.titulo, '')
        || ' ' || coalesce(
             (select d.nome from public.departamentos d where d.id = v.departamento_id),
             '')
        || ' ' || coalesce(v.localizacao, '')
      ) as texto
    ) b
   where (q.estado is null or v.estado = q.estado)
     and (
       q.termo is null
       or not exists (
            select 1
              from unnest(string_to_array(q.termo, ' ')) as palavra
             where palavra <> ''
               and position(palavra in b.texto) = 0
          )
     )
$$;

comment on function public.buscar_vagas_do_painel(text, text) is
  'Busca de Vagas do Painel por título, Departamento e Localização, insensível a caixa e a acento, mais o filtro de Estado (convertido para o enum, que recusa valor fora do vocabulário). Todas as palavras do termo precisam aparecer, por contenção literal. security invoker: a RLS continua sendo a única guardiã da visibilidade.';

-- ─── Privilégio de execução, função a função ─────────────────────────────
--
-- Toda função nasce executável por PUBLIC, e o Supabase ainda concede a
-- `anon` e `authenticated` por privilégio padrão. Então a decisão é
-- explícita: revoga de todos, concede a quem precisa.
--
--   * os espelhos da Descrição: só postgres e service_role (quem escreve);
--   * as duas funções de entrega: anon, authenticated, postgres, service_role;
--   * a busca do Painel: authenticated, postgres, service_role.

do $$
declare
  papel text;
  fn text;
begin
  foreach fn in array array[
    'public.descricao_da_vaga_e_permitida(jsonb)',
    'public.html_da_descricao_e_reduzido(text)',
    'public.situacao_da_vaga(text)',
    'public.vagas_abertas()',
    'public.buscar_vagas_do_painel(text, text)'
  ] loop
    execute format('revoke execute on function %s from public', fn);
    foreach papel in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = papel) then
        execute format('revoke execute on function %s from %I', fn, papel);
      end if;
    end loop;
    foreach papel in array array['postgres', 'service_role'] loop
      if exists (select 1 from pg_roles where rolname = papel) then
        execute format('grant execute on function %s to %I', fn, papel);
      end if;
    end loop;
  end loop;

  foreach fn in array array[
    'public.situacao_da_vaga(text)',
    'public.vagas_abertas()'
  ] loop
    foreach papel in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = papel) then
        execute format('grant execute on function %s to %I', fn, papel);
      end if;
    end loop;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.buscar_vagas_do_painel(text, text) to authenticated';
  end if;
end $$;

-- ─── A semeadura ──────────────────────────────────────────────────────────
--
-- Os valores de hoje, no padrão robusto de
-- `20260819190000_categorias_semeadura_robusta.sql`: cada linha só entra se
-- não houver outra com o mesmo nome NORMALIZADO (a mesma comparação do índice
-- único). Idempotente, e não reescreve nada: uma Classificação renomeada pelo
-- Painel continua com o nome que lhe deram. A ferramenta verificar:carreiras
-- executa o trecho entre os marcadores abaixo.

-- semeadura:inicio
insert into public.departamentos (nome, cor, ordem)
select v.nome, v.cor, v.ordem
  from (values
    ('Tecnologia',  'var(--categoria-azul-bg)',      1),
    ('Atendimento', 'var(--categoria-verde-bg)',     2),
    ('Marketing',   'var(--categoria-roxo-bg)',      3),
    ('Comercial',   'var(--categoria-ambar-bg)',     4),
    ('Operações',   'var(--categoria-ciano-bg)',     5),
    ('Financeiro',  'var(--categoria-terracota-bg)', 6),
    ('RH',          'var(--categoria-rosa-bg)',      7),
    ('Design',      'var(--categoria-cinza-bg)',     8)
  ) as v(nome, cor, ordem)
 where not exists (
   select 1 from public.departamentos d
    where public.normalizar_busca(d.nome) = public.normalizar_busca(v.nome)
 );

insert into public.tipos_de_vaga (nome, equivalente_jobposting, ordem)
select v.nome, v.equivalente, v.ordem
  from (values
    ('CLT',     'FULL_TIME',  1),
    ('PJ',      'CONTRACTOR', 2),
    ('Estágio', 'INTERN',     3),
    ('Freela',  'CONTRACTOR', 4)
  ) as v(nome, equivalente, ordem)
 where not exists (
   select 1 from public.tipos_de_vaga t
    where public.normalizar_busca(t.nome) = public.normalizar_busca(v.nome)
 );

insert into public.niveis (nome, cor, ordem)
select v.nome, v.cor, v.ordem
  from (values
    ('Júnior', 'var(--categoria-verde-bg)', 1),
    ('Pleno',  'var(--categoria-azul-bg)',  2),
    ('Sênior', 'var(--categoria-roxo-bg)',  3)
  ) as v(nome, cor, ordem)
 where not exists (
   select 1 from public.niveis n
    where public.normalizar_busca(n.nome) = public.normalizar_busca(v.nome)
 );
-- semeadura:fim

-- O PostgREST guarda o schema em cache; sem o aviso, as tabelas e funções
-- novas só apareceriam no próximo recarregamento dele.
notify pgrst, 'reload schema';
