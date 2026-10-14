-- O filtro de Estado do Painel passa a seguir o relógio, como a pílula.
--
-- ─── O que estava errado, e como aparecia ─────────────────────────────────
--
-- Um Post agendado continua `agendado` no banco depois que a hora chega — é a
-- política de leitura anônima que o publica pela passagem do tempo, e isso NÃO
-- muda aqui. Mas o Painel agora mostra esse Post como "Publicado" (com o
-- relógio que conta que ele saiu pelo agendamento), e o filtro comparava o
-- Estado gravado: clicar em "Publicado" não trazia o Post que a pílula chama de
-- publicado, e clicar em "Agendado" trazia Posts que já estão no ar.
--
-- Agora o filtro compara o Estado APARENTE, a mesma regra de
-- `estadoAparente` em `src/domain/blog/estados.js`: agendado com
-- `publicado_em <= now()` conta como `publicado`. O resto da função (busca por
-- palavras, `security invoker`, RLS como única guardiã) fica exatamente igual
-- à de 20260818160000.
--
-- Idempotente: reaplicar em banco já migrado termina sem erro.

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
      nullif(
        btrim(regexp_replace(public.normalizar_busca(coalesce(p_termo, '')), '\s+', ' ', 'g')),
        ''
      ) as termo,
      case
        when p_estados is null then null
        when cardinality(p_estados) = 0 then null
        else p_estados::public.estado_post[]
      end as estados
  )
  select p.*
    from public.posts p
    cross join pedido q
    cross join lateral (
      select public.normalizar_busca(
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
      ) as texto
    ) b
   where (
       q.estados is null
       or (
         case
           when p.estado = 'agendado' and p.publicado_em <= now()
             then 'publicado'::public.estado_post
           else p.estado
         end
       ) = any (q.estados)
     )
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

comment on function public.buscar_posts_do_painel(text, text[]) is
  'Busca de Posts por título, Autor, Categoria e Tag, insensível a caixa e a acento, mais o filtro pelo vocabulário fechado de Estado. O filtro compara o Estado APARENTE: agendado cuja hora já chegou conta como publicado, como a pílula do Painel o mostra. O termo é quebrado em palavras e TODAS precisam aparecer, em qualquer ordem e em qualquer um dos quatro campos. Cada palavra é comparada por contenção literal (position), nunca por padrão — caractere especial é texto. security invoker de propósito: a RLS da Story 2.1 continua sendo a única guardiã da visibilidade.';

notify pgrst, 'reload schema';
