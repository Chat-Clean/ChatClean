-- A busca do BLOG PÚBLICO: caminho próprio, e a política continua decidindo.
--
-- Story 2.15 — O blog público lê do Supabase.
--
-- ─── Por que uma função NOVA, e não uma concessão da busca do Painel ──────
--
-- A migração 20260818120000 revogou `execute` de `buscar_posts_do_painel` para
-- `anon` e escreveu a razão: "oferecer à API pública um caminho que ninguém usa
-- é superfície de ataque sem contrapartida". Esta story é a contrapartida — o
-- site passa a buscar de verdade —, e ainda assim conceder a função do PAINEL
-- seria a saída errada: ela aceita `p_estados`, e filtro por Estado é
-- exatamente o parâmetro que não pode existir do lado de fora. Uma função
-- própria recebe só o que o visitante pode pedir.
--
-- `buscar_posts_do_painel` continua revogada de `anon`. O que nasce aqui é
-- caminho paralelo, não porta dos fundos.
--
-- ─── Por que ela não contorna a política ──────────────────────────────────
--
-- `security invoker`, como a do Painel e pelo mesmo motivo: a consulta roda com
-- o papel de quem chamou, e a política `posts_leitura_anonima` da Story 2.1
-- continua sendo a ÚNICA guardiã do que é visível. Não há filtro de Estado no
-- corpo desta função — de propósito. Um filtro aqui seria a segunda cópia da
-- regra de visibilidade, e a segunda cópia é a que envelhece.
--
-- Pela mesma razão as subconsultas de Categoria e de Tags rodam sob a RLS
-- daquelas tabelas. A busca não empresta visibilidade a ninguém.
--
-- ─── O privilégio de `normalizar_busca` para `anon` ───────────────────────
--
-- Uma função `security invoker` executa com o papel do CHAMADOR, e a
-- verificação de privilégio da chamada interna acontece com esse papel. Foi
-- exatamente isso que a migração 20260818140000 mediu do lado autenticado:
-- sem o `grant`, a busca inteira responde `42501 permission denied for function
-- normalizar_busca`. O mesmo vale agora para `anon`.
--
-- **A alternativa seria tornar esta função `security definer`, e ela é pior:**
-- apagaria o problema junto com a garantia, porque a RLS deixaria de valer para
-- quem chama. Preferir o `grant` estreito é escolher a garantia.
--
-- O custo é o que a 20260818140000 já pesou e aceitou: `normalizar_busca`
-- recebe texto, devolve texto, não lê tabela nenhuma e não decide nada.
--
-- ─── O que a busca pública olha ───────────────────────────────────────────
--
-- Título, Resumo, Autor, Categoria e Tag. O Resumo entra porque a busca que o
-- site já oferecia — a de memória, que esta story remove — cobria título,
-- resumo e categoria: tirá-lo faria a story ENTREGAR uma busca que acha menos
-- do que a de ontem. O Estado não entra, e não há como pedi-lo.
--
-- A quebra em palavras, a comparação por `position` (contenção literal, nunca
-- padrão) e a normalização são as MESMAS da busca do Painel — a mesma função,
-- não uma segunda com as mesmas regras. Duas normalizações divergem no primeiro
-- acento.
--
-- Ordenação e recorte continuam sendo do chamador, pela expressão que a camada
-- de dados já aplica. Duas ordens em dois lugares divergem no primeiro empate.
--
-- Idempotente: reaplicar em banco já migrado termina sem erro.

create or replace function public.buscar_posts_publicos(
  p_termo text default null,
  p_categoria_id uuid default null
)
  returns setof public.posts
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  with pedido as (
    -- Espaço em branco de qualquer espécie vira um separador só: quem cola um
    -- trecho com quebra de linha está pedindo as mesmas palavras.
    select
      nullif(
        btrim(regexp_replace(public.normalizar_busca(coalesce(p_termo, '')), '\s+', ' ', 'g')),
        ''
      ) as termo,
      p_categoria_id as categoria
  )
  select p.*
    from public.posts p
    cross join pedido q
    cross join lateral (
      select public.normalizar_busca(
        coalesce(p.titulo, '')
        || ' ' || coalesce(p.resumo, '')
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
      ) as texto
    ) b
   where (q.categoria is null or p.categoria_id = q.categoria)
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

comment on function public.buscar_posts_publicos(text, uuid) is
  'Busca do Blog Público por título, resumo, Autor, Categoria e Tag, mais o filtro por Categoria. Insensível a caixa e a acento pela MESMA normalizar_busca da busca do Painel. O termo é quebrado em palavras e TODAS precisam aparecer, em qualquer ordem. Cada palavra é comparada por contenção literal (position), nunca por padrão. NÃO aceita filtro de Estado: security invoker, e a política de leitura anônima da Story 2.1 continua sendo a única guardiã da visibilidade.';

-- ─── Quem pode chamar ─────────────────────────────────────────────────────
--
-- `anon` e `authenticated`: é a busca do SITE, e o site é lido pelos dois — um
-- Autor logado no mesmo navegador abre `/blog` pelo cliente anônimo, mas a API
-- continua sendo a mesma origem, e negar a `authenticated` só produziria um
-- erro que ninguém consegue explicar.
--
-- `buscar_posts_do_painel` NÃO é tocada aqui: ela continua revogada de `anon`.

do $$
declare
  papel text;
begin
  execute 'revoke execute on function public.buscar_posts_publicos(text, uuid) from public';

  foreach papel in array array['anon', 'authenticated', 'postgres', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format(
        'grant execute on function public.buscar_posts_publicos(text, uuid) to %I', papel);
    end if;
  end loop;

  -- A normalização é chamada DENTRO de uma função invoker: quem paga o
  -- privilégio da chamada interna é o chamador. Sem isto, 42501.
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant execute on function public.normalizar_busca(text) to anon';
  end if;
end $$;

comment on function public.normalizar_busca(text) is
  'Minúsculas e sem acento. IMMUTABLE por fixar o dicionário na forma de dois argumentos de unaccent — a forma de um argumento é STABLE e o Postgres recusa índice sobre ela. Usada nos DOIS lados da comparação, pelas DUAS buscas (Painel e público). Executável por anon e por authenticated porque as duas buscas são security invoker: quem paga o privilégio da chamada interna é o chamador. Ela não lê tabela nenhuma e não decide nada.';

-- O PostgREST guarda o schema em cache; sem o aviso, a função nova só
-- apareceria no próximo recarregamento dele.
notify pgrst, 'reload schema';
