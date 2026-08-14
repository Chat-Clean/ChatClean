-- Conteúdo do blog: integridade, formato e o que a política sozinha não cobre.
--
-- Story 2.1 — correções da revisão. Migração nova, não edição da anterior:
-- migração já aplicada é registro histórico e não se reescreve; o aplicador
-- compara o que está registrado com o arquivo e acusa divergência.
--
-- O que esta migração resolve:
--
--   1. `publicado` ou `agendado` sem `publicado_em` era aceito pelo banco. A
--      política escondia a linha — e só. Um Post marcado como publicado sumia
--      do site sem erro, sem log e sem nada que o Painel pudesse acusar. O
--      estado inválido passa a ser irrepresentável, não apenas invisível.
--   2. A unicidade cruzada de slug que o comentário de `slugs_antigos`
--      prometia não existia: cada tabela tinha só o seu próprio `unique`.
--      Nada impedia um Post novo assumir um slug aposentado que aponta para
--      OUTRO Post — e aí o 301 e a rota direta competiriam pela mesma URL.
--   3. `tags` era `using (true)` para `anon`: o nome da tag de um rascunho era
--      listável mesmo com o Post invisível. Para um produto não anunciado ou
--      uma campanha, o vocabulário entregava o que o Post escondia. A
--      visibilidade da tag passa a ser derivada da associação visível.
--   4. Slug não tinha formato. É chave de URL pública, do 301 e do filtro do
--      PostgREST — "não vazio" não é validação de slug.
--   5. `conteudo jsonb` aceitava `[]`, `"texto"` ou `null`, que quebrariam o
--      renderizador na LEITURA, não na escrita. E o comentário descrevia como
--      presente uma validação que só chega na Story 2.5.
--   6. `titulo` podia ser vazio ou só espaço, e `imagem_url` podia existir sem
--      texto alternativo, num projeto que verifica contraste por ferramenta.
--   7. O `revoke` não incluía o pseudo-papel `PUBLIC`, cujo privilégio é
--      herdado por `anon` e `authenticated`.
--   8. `criar_perfil_da_conta` e `tocar_atualizado_em` nunca tiveram `execute`
--      revogado — quatro avisos do linter do Supabase. Ambas retornam
--      `trigger` e falham por RPC, então o risco era nominal; revogar é uma
--      linha e fecha o aviso.

-- ─── 1. Estado publicável exige instante de publicação ───────────────────
--
-- `publicado_em` nulo continua tornando o Post invisível pela política — mas
-- agora a combinação nem chega a ser gravável. As duas travas dizem a mesma
-- coisa em tempos diferentes: a restrição na escrita, a política na leitura.

alter table public.posts drop constraint if exists posts_publicavel_exige_data;
alter table public.posts add constraint posts_publicavel_exige_data
  check (estado not in ('publicado', 'agendado') or publicado_em is not null);

-- ─── 6. Título e texto alternativo ───────────────────────────────────────

alter table public.posts drop constraint if exists posts_titulo_nao_vazio;
alter table public.posts add constraint posts_titulo_nao_vazio
  check (btrim(titulo) <> '' and char_length(titulo) <= 300);

-- Imagem sem alternativa textual é conteúdo que uma parte do público não
-- recebe. O par é obrigatório: ou não há imagem, ou há imagem com descrição.
alter table public.posts drop constraint if exists posts_imagem_exige_alt;
alter table public.posts add constraint posts_imagem_exige_alt
  check (
    imagem_url is null
    or (imagem_alt is not null and btrim(imagem_alt) <> '')
  );

-- ─── 5. `conteudo` é documento, não qualquer JSON ────────────────────────
--
-- Piso mínimo, não validação de schema: `[]`, `"texto"`, `1` e `null` deixam
-- de entrar. A validação contra o schema fechado de `domain/blog` chega com a
-- função de escrita, na Story 2.5 — até lá o comentário da coluna diz o que
-- vale hoje, não o que valerá.

alter table public.posts drop constraint if exists posts_conteudo_e_objeto;
alter table public.posts add constraint posts_conteudo_e_objeto
  check (jsonb_typeof(conteudo) = 'object');

comment on column public.posts.conteudo is
  'Documento estruturado — a fonte canônica. Hoje o banco garante apenas que é um objeto JSON; a validação contra o schema fechado de domain/blog chega com a função de escrita (Story 2.5).';

comment on column public.posts.demo is
  'Marca conteúdo de demonstração, herdado do blog em localStorage. NÃO participa da visibilidade: a política não o consulta, e um Post demo publicado aparece como qualquer outro.';

-- ─── 4. Slug tem formato ─────────────────────────────────────────────────
--
-- Minúsculas, dígitos e hífen simples entre segmentos. É o que a geração a
-- partir do título produz depois de normalizar acento, e é o que a URL
-- pública, o 301 e o filtro do PostgREST assumem sem verificar.

alter table public.posts drop constraint if exists posts_slug_formato;
alter table public.posts add constraint posts_slug_formato
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

alter table public.categorias drop constraint if exists categorias_slug_formato;
alter table public.categorias add constraint categorias_slug_formato
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

alter table public.tags drop constraint if exists tags_slug_formato;
alter table public.tags add constraint tags_slug_formato
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

alter table public.slugs_antigos drop constraint if exists slugs_antigos_slug_formato;
alter table public.slugs_antigos add constraint slugs_antigos_slug_formato
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- ─── 2. Unicidade cruzada de slug ────────────────────────────────────────
--
-- Restrição `unique` não atravessa tabelas, e uma chave estrangeira não
-- expressa "este valor não pode existir ali". Sobra o gatilho.
--
-- Nas duas direções, porque as duas falham: slug de Post que já está
-- aposentado apontando para outro Post, e slug aposentado que colide com o
-- slug ativo de algum Post.
--
-- A exceção deliberada: um Post pode retomar um slug aposentado que aponta
-- para ELE MESMO — é o desfazer de uma renomeação, e o resolvedor consulta o
-- slug ativo antes do aposentado, então não há ambiguidade.

create or replace function public.exigir_slug_livre()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  onde text;
begin
  if tg_table_name = 'posts' then
    select 'slugs_antigos' into onde
      from public.slugs_antigos s
     where s.slug = new.slug
       and s.post_id is distinct from new.id
     limit 1;
  else
    select 'posts' into onde
      from public.posts p
     where p.slug = new.slug
     limit 1;
  end if;

  if onde is not null then
    raise exception using
      errcode = '23505',
      message = format('slug %L já está em uso em public.%s', new.slug, onde),
      hint = 'A unicidade de slug vale para posts e slugs_antigos em conjunto: a URL é uma só.';
  end if;

  return new;
end;
$$;

comment on function public.exigir_slug_livre() is
  'Unicidade de slug ATRAVÉS de posts e slugs_antigos. Restrição unique não cruza tabelas, e a URL pública não distingue as duas origens.';

drop trigger if exists posts_exigir_slug_livre on public.posts;
create trigger posts_exigir_slug_livre
  before insert or update of slug on public.posts
  for each row
  execute function public.exigir_slug_livre();

drop trigger if exists slugs_antigos_exigir_slug_livre on public.slugs_antigos;
create trigger slugs_antigos_exigir_slug_livre
  before insert or update of slug on public.slugs_antigos
  for each row
  execute function public.exigir_slug_livre();

-- ─── 3. A tag não conta o que o Post esconde ─────────────────────────────
--
-- Derivada, não repetida: a subconsulta sobre `posts_tags` roda sob a RLS de
-- `posts_tags`, que por sua vez deriva de `posts`. A regra de visibilidade
-- continua escrita uma única vez, na política de `posts`.
--
-- Consequência aceita: tag sem nenhuma associação visível não aparece para
-- quem não tem sessão. É o comportamento certo — uma tag que não rotula nada
-- de público não é vocabulário público.

drop policy if exists "tags_leitura_anonima" on public.tags;
create policy "tags_leitura_anonima"
  on public.tags
  for select
  to anon
  using (
    exists (select 1 from public.posts_tags pt where pt.tag_id = tags.id)
  );

-- `categorias` permanece `using (true)`: o filtro do Blog Público precisa da
-- lista inteira antes de qualquer Post ser lido, e o nome de uma categoria não
-- revela conteúdo — ao contrário do nome de uma tag, que costuma ser o próprio
-- assunto do Post que ainda não saiu.

-- ─── 7. `PUBLIC` também perde a escrita ──────────────────────────────────
--
-- Privilégio concedido ao pseudo-papel `PUBLIC` é herdado por todo papel,
-- `anon` e `authenticated` inclusive. Revogar dos dois e esquecer de `PUBLIC`
-- deixa a porta aberta por herança.

revoke insert, update, delete, truncate on public.perfis from public;
revoke insert, update, delete, truncate on public.categorias from public;
revoke insert, update, delete, truncate on public.posts from public;
revoke insert, update, delete, truncate on public.tags from public;
revoke insert, update, delete, truncate on public.posts_tags from public;
revoke insert, update, delete, truncate on public.slugs_antigos from public;

-- ─── 8. Funções de gatilho saem da API pública ───────────────────────────
--
-- As três retornam `trigger` e falhariam se chamadas por `/rest/v1/rpc/…`,
-- mas estavam executáveis por `anon` e `authenticated` — quatro avisos do
-- linter. O privilégio de EXECUTE é conferido na CRIAÇÃO do gatilho, não a
-- cada disparo, então revogar não impede o gatilho de rodar. A concessão
-- explícita a `service_role` e a `supabase_auth_admin` existe para que a
-- função de escrita da Story 2.5 e o gatilho de `auth.users` não dependam de
-- herança de `PUBLIC`, que acabou de ser revogada.

do $$
declare
  f text;
  papel text;
begin
  foreach f in array array[
    'public.criar_perfil_da_conta()',
    'public.tocar_atualizado_em()',
    'public.exigir_slug_livre()'
  ] loop
    execute format('revoke execute on function %s from public', f);
    foreach papel in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = papel) then
        execute format('revoke execute on function %s from %I', f, papel);
      end if;
    end loop;
    foreach papel in array array['postgres', 'service_role', 'supabase_auth_admin'] loop
      if exists (select 1 from pg_roles where rolname = papel) then
        execute format('grant execute on function %s to %I', f, papel);
      end if;
    end loop;
  end loop;
end $$;

-- ─── Nota para a Story 2.11 ──────────────────────────────────────────────
--
-- `unaccent(text)` é STABLE, não IMMUTABLE — depende do dicionário, que pode
-- ser recarregado. Postgres recusa índice de expressão sobre função STABLE:
--
--   create index … on posts (lower(unaccent(titulo)));
--   ERROR: functions in index expression must be marked IMMUTABLE
--
-- A saída é um invólucro `immutable` que chama `extensions.unaccent` fixando o
-- dicionário (`unaccent('unaccent', $1)`), ou uma coluna gerada normalizada.
-- Fica registrado aqui porque a extensão é habilitada por esta migração e a
-- armadilha espera exatamente quem for usá-la.
