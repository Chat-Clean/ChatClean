-- A busca passa a olhar PALAVRA por palavra, e não a frase inteira de uma vez.
--
-- Story 2.11 — Busca e filtros. Refinamento de 20260818120000.
--
-- ─── O que estava errado, e como aparecia ─────────────────────────────────
--
-- A primeira versão procurava o termo como uma subcadeia contígua. Isso acerta
-- "atendimento" e erra "guia atalhos": o Post se chama "Guia de atalhos", o
-- "de" no meio quebra a contiguidade, e a busca responde que não existe nada —
-- que é exatamente a conclusão errada que esta story existe para impedir. Erra
-- também "automação ana", a pergunta natural de quem lembra do assunto e de
-- quem escreveu, mas não do título: as duas palavras existem, em campos
-- diferentes, e nenhuma frase contígua as contém.
--
-- Agora o termo é quebrado em palavras e o Post precisa conter **todas** elas.
-- Conjunção, não união: "automação ana" não pode devolver tudo que fala de
-- automação mais tudo que a Ana escreveu — isso seria uma lista maior a cada
-- palavra digitada, que é o oposto do que buscar significa.
--
-- A ordem deixa de importar, e é o certo: as palavras vêm de campos
-- diferentes, e não existe ordem canônica entre título, Autor, Categoria e
-- Tag.
--
-- ─── O que NÃO muda ───────────────────────────────────────────────────────
--
-- Cada palavra continua sendo comparada por `position` — contenção literal.
-- `%`, `_`, aspas e parêntese continuam sendo texto, e nenhum termo pode virar
-- padrão nem produzir erro de consulta. A função continua `security invoker`,
-- e a RLS continua sendo a única guardiã da visibilidade.
--
-- ─── Uma mudança de forma, com motivo ─────────────────────────────────────
--
-- O texto pesquisável do Post sai para um `lateral`. Sem isso ele seria
-- recalculado — subconsultas de Categoria e de Tags incluídas — uma vez POR
-- PALAVRA do termo, e uma busca de quatro palavras faria quatro vezes o
-- trabalho de uma.
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
      -- Espaço em branco de qualquer espécie vira um separador só: quem cola
      -- um trecho com quebra de linha está pedindo as mesmas palavras.
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
   where (q.estados is null or p.estado = any (q.estados))
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
  'Busca de Posts por título, Autor, Categoria e Tag, insensível a caixa e a acento, mais o filtro pelo vocabulário fechado de Estado. O termo é quebrado em palavras e TODAS precisam aparecer, em qualquer ordem e em qualquer um dos quatro campos. Cada palavra é comparada por contenção literal (position), nunca por padrão — caractere especial é texto. security invoker de propósito: a RLS da Story 2.1 continua sendo a única guardiã da visibilidade.';

notify pgrst, 'reload schema';
