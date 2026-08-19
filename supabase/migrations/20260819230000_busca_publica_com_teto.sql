-- O teto da busca pública passa a existir NO BANCO, e não só no cliente.
--
-- Story 2.15 — O blog público lê do Supabase. Refinamento de 20260819210000.
--
-- ─── O que estava aberto, e como se alcançava ─────────────────────────────
--
-- `buscar_posts_publicos` é executável por `anon`, e `anon` é o papel da chave
-- publicável — que, por construção, vive no bundle do navegador. Quem chama a
-- função direto, sem passar pela camada de dados, escapa dos dois tetos que ela
-- aplica: o do termo (`TAMANHO_MAXIMO_DO_TERMO`, 200 pontos de código) e o do
-- recorte (`LIMITE_MAXIMO`, 500 linhas).
--
-- É o mesmo raciocínio que `comum.js` registra para a listagem — "listagem sem
-- limite é varredura sem limite" —, e ele não pode morar só do lado que dá para
-- contornar. Um termo de um megabyte faz o Postgres normalizar um megabyte por
-- palavra do texto de cada Post; um pedido sem recorte varre a tabela inteira.
--
-- ─── O que muda, e o que NÃO muda ─────────────────────────────────────────
--
-- O termo é CORTADO, não recusado: quem digitou demais recebe a busca do que
-- coube, e não um erro. O corte é por caractere sobre o texto já normalizado, o
-- que é seguro aqui porque `normalizar_busca` não produz par substituto novo.
--
-- O teto de linhas é aplicado com `limit` dentro da função. O recorte fino
-- continua sendo do chamador (`range` do PostgREST, sobre o resultado): o que
-- esta camada garante é que nenhuma chamada varra a tabela inteira.
--
-- A visibilidade continua sendo da política, e a função continua
-- `security invoker`. Nada aqui filtra Estado.
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
    -- Espaço em branco de qualquer espécie vira um separador só, e o termo é
    -- cortado no teto: o corte acontece DEPOIS da normalização para que o
    -- número valha sobre o mesmo texto que a comparação usa.
    select
      nullif(
        left(
          btrim(regexp_replace(public.normalizar_busca(coalesce(p_termo, '')), '\s+', ' ', 'g')),
          200
        ),
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
   -- O teto de varredura. A ordem final e o recorte de página continuam sendo
   -- do chamador; o que este `limit` impede é a varredura sem fim.
   limit 500
$$;

comment on function public.buscar_posts_publicos(text, uuid) is
  'Busca do Blog Público por título, resumo, Autor, Categoria e Tag, mais o filtro por Categoria. Insensível a caixa e a acento pela MESMA normalizar_busca da busca do Painel. O termo é quebrado em palavras e TODAS precisam aparecer, em qualquer ordem; cada palavra é comparada por contenção literal (position), nunca por padrão. Termo cortado em 200 caracteres e resultado limitado a 500 linhas DENTRO da função, porque anon pode chamá-la sem passar pela camada de dados. NÃO aceita filtro de Estado: security invoker, e a política de leitura anônima da Story 2.1 continua sendo a única guardiã da visibilidade.';

notify pgrst, 'reload schema';
