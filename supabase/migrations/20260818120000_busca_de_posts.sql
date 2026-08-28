-- A busca de Posts do Painel: sem acento, sem caixa, e sem furar a RLS.
--
-- Story 2.11 — Busca e filtros.
--
-- ─── Por que existe um objeto de banco, e não um filtro no cliente ────────
--
-- A busca cobre título, Autor, Categoria e Tags. Título e Autor são colunas de
-- `posts`; Categoria e Tags vivem em OUTRAS tabelas, e alcançá-las exige
-- junção. Junção não é exprimível como filtro do PostgREST, e reproduzi-la no
-- cliente significaria filtrar o RECORTE já carregado — que funciona enquanto
-- há poucos Posts e passa a mentir exatamente quando a busca fica necessária.
--
-- ─── Por que `security invoker`, e não `definer` ──────────────────────────
--
-- `definer` executaria com os privilégios de quem CRIOU a função, e a RLS de
-- `posts` deixaria de valer para quem a chama: a função viraria um segundo
-- caminho de leitura, ao lado da política — exatamente o que a arquitetura
-- proíbe. Com `invoker`, a consulta roda como o papel do chamador e as
-- políticas da Story 2.1 continuam sendo a única guardiã: o visitante anônimo
-- que chamasse esta função veria o mesmo que vê em `/posts`, e o Painel vê
-- tudo porque a política autenticada é que diz isso — não a função.
--
-- Pela mesma razão as subconsultas de Categoria e de Tags rodam sob a RLS
-- daquelas tabelas. A busca não empresta visibilidade a ninguém.
--
-- ─── A ARMADILHA DO `unaccent`, resolvida aqui e registrada ───────────────
--
-- A Story 2.1 deixou a nota, e ela é a razão desta seção existir:
-- `extensions.unaccent(text)` é STABLE, não IMMUTABLE, porque depende do
-- dicionário — que pode ser recarregado em tempo de execução. O Postgres
-- recusa índice de expressão sobre função STABLE:
--
--   create index … on posts (lower(unaccent(titulo)));
--   ERROR: functions in index expression must be marked IMMUTABLE
--
-- A saída é o invólucro abaixo: ele chama a forma de DOIS argumentos, fixando
-- o dicionário (`extensions.unaccent`), e por isso pode se declarar IMMUTABLE
-- sem mentir — o resultado só mudaria se alguém trocasse o arquivo de regras
-- do dicionário, que é mudança de instalação, não de dado.
--
-- **E a decisão explícita sobre o índice:** nenhum índice é criado agora, de
-- propósito. O invólucro torna o índice POSSÍVEL, e ainda assim ele não
-- serviria: a comparação é por subcadeia (o termo pode estar no meio da
-- palavra), e B-tree não atende subcadeia; e metade do texto buscado vem de
-- OUTRAS tabelas, onde índice sobre `posts` não alcança. O caminho quando o
-- volume justificar é `pg_trgm` com índice GIN sobre a expressão normalizada —
-- e aí o invólucro imutável já está pronto. Fica escrito para que a próxima
-- pessoa não repita a descoberta nem crie um índice que o planejador ignora.
--
-- ─── Por que a comparação é `position`, e não `like` ──────────────────────
--
-- `like` daria semântica de PADRÃO ao termo: `%` e `_` do que a pessoa digitou
-- virariam curingas, e o PostgREST ainda traduz `*` para `%` no valor do
-- filtro. Um termo com caractere especial deixaria de ser texto e viraria
-- sintaxe. `position(termo in texto) > 0` é contenção literal: não existe
-- metacaractere, não existe escape para esquecer, e nenhum caractere pode
-- produzir erro de consulta. É a mesma escolha de lista de permissão que o
-- resto do módulo faz — o que não é padrão não vira padrão por acidente.
--
-- E é por isso também que o termo viaja como ARGUMENTO, e não como valor de
-- filtro: quem o normaliza é o banco. A normalização de acento nunca acontece
-- no cliente.
--
-- Idempotente: reaplicar em banco já migrado termina sem erro.

-- ─── 1. A normalização, uma só, para os dois lados da comparação ──────────
--
-- Os dois lados PRECISAM passar pela mesma função. Normalizar só o texto
-- guardado faria "Estratégia" digitado com acento não achar nada; normalizar
-- só o termo faria o contrário. Uma função só é o que garante a simetria que o
-- critério de aceite pede nas duas direções.

create or replace function public.normalizar_busca(p_texto text)
  returns text
  language sql
  immutable
  parallel safe
  security invoker
  set search_path = ''
as $$
  select lower(
    extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_texto, ''))
  )
$$;

comment on function public.normalizar_busca(text) is
  'Minúsculas e sem acento. IMMUTABLE por fixar o dicionário na forma de dois argumentos de unaccent — a forma de um argumento é STABLE e o Postgres recusa índice sobre ela. Usada nos DOIS lados da comparação da busca; normalizar só um lado quebra uma das direções.';

-- ─── 2. A busca do Painel ─────────────────────────────────────────────────
--
-- `p_estados` chega como `text[]` e é convertido para o enum aqui dentro: a
-- conversão é a defesa no banco, e um valor fora do vocabulário fechado é
-- RECUSADO com erro de conversão em vez de ser ignorado em silêncio. A camada
-- de dados já recusa antes, e as duas recusas são de propósito — o que vem da
-- tela chega à consulta.
--
-- Lista nula ou vazia significa "sem filtro de Estado", e não "nenhum Estado":
-- um filtro sem nenhuma caixa marcada mostrando lista vazia seria a tela
-- dizendo que o arquivo está vazio.
--
-- Termo nulo ou só de espaços significa "sem busca". `nullif` sobre o termo já
-- normalizado é o que faz " " e "" caírem no mesmo lugar.
--
-- Ordenação e recorte NÃO estão aqui: eles continuam sendo do chamador, pela
-- mesma expressão que a listagem já usava. Duas ordens em dois lugares
-- divergem no primeiro empate.

create or replace function public.buscar_posts_do_painel(
  p_termo text default null,
  p_estados text[] default null
)
  returns setof public.posts
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  with pedido as (
    select
      nullif(public.normalizar_busca(btrim(coalesce(p_termo, ''))), '') as termo,
      case
        when p_estados is null then null
        when cardinality(p_estados) = 0 then null
        else p_estados::public.estado_post[]
      end as estados
  )
  select p.*
    from public.posts p, pedido q
   where (q.estados is null or p.estado = any (q.estados))
     and (
       q.termo is null
       or position(
            q.termo in public.normalizar_busca(
              coalesce(p.titulo, '')
              || ' ' || coalesce(p.autor_nome, '')
              || ' ' || coalesce(
                   (select c.nome
                      from public.categorias c
                     where c.id = p.categoria_id),
                   '')
              || ' ' || coalesce(
                   (select string_agg(t.nome, ' ')
                      from public.posts_tags pt
                      join public.tags t on t.id = pt.tag_id
                     where pt.post_id = p.id),
                   '')
            )
          ) > 0
     )
$$;

comment on function public.buscar_posts_do_painel(text, text[]) is
  'Busca de Posts por título, Autor, Categoria e Tag, insensível a caixa e a acento, mais o filtro pelo vocabulário fechado de Estado. security invoker de propósito: a RLS da Story 2.1 continua sendo a única guardiã da visibilidade. A comparação é por contenção literal (position), nunca por padrão — caractere especial é texto.';

-- ─── 3. Quem pode chamar ──────────────────────────────────────────────────
--
-- Só `authenticated`: é a busca do PAINEL, e o Painel exige sessão. A execução
-- por `anon` não vazaria nada (a RLS continua valendo, e é por isso que a
-- função é `invoker`), mas oferecer à API pública um caminho que ninguém usa é
-- superfície de ataque sem contrapartida.
--
-- `normalizar_busca` sai da API pública inteira: é peça interna da busca, e
-- uma função exposta em `/rpc/` é uma promessa de contrato que ninguém quis
-- fazer.

do $$
declare
  papel text;
begin
  execute 'revoke execute on function public.normalizar_busca(text) from public';
  execute 'revoke execute on function public.buscar_posts_do_painel(text, text[]) from public';

  foreach papel in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format(
        'revoke execute on function public.normalizar_busca(text) from %I', papel);
      execute format(
        'revoke execute on function public.buscar_posts_do_painel(text, text[]) from %I', papel);
    end if;
  end loop;

  foreach papel in array array['postgres', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format(
        'grant execute on function public.normalizar_busca(text) to %I', papel);
      execute format(
        'grant execute on function public.buscar_posts_do_painel(text, text[]) to %I', papel);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.buscar_posts_do_painel(text, text[]) to authenticated';
  end if;
end $$;

-- O PostgREST guarda o schema em cache; sem o aviso, a função nova só
-- apareceria no próximo recarregamento dele — e a tela reportaria "função
-- inexistente" por um tempo que ninguém consegue explicar.
notify pgrst, 'reload schema';
