-- A evolução das leituras: o que a tela de Leituras do Painel pergunta ao banco.
--
-- ─── Por que duas funções, e não a tabela lida de fora ────────────────────
--
-- `leituras_dos_posts` tem uma linha por Post por dia. A tela quer duas somas
-- sobre ela: o total de cada DIA (o gráfico) e o total de cada POST num
-- período (a tabela). Ler as linhas e somar no navegador funcionaria com dois
-- Posts e deixaria de caber com duzentos — noventa dias de duzentos Posts são
-- dezoito mil linhas, e o PostgREST corta a resposta muito antes disso, em
-- silêncio. A soma acontece aqui, e a resposta tem o tamanho do que a tela
-- desenha: no máximo um ponto por dia, e os cem Posts mais lidos.
--
-- ─── O dia é o do site, e a série não tem buraco ──────────────────────────
--
-- "Hoje" é o do fuso de apresentação (`America/Sao_Paulo`), o mesmo de
-- `registrar_leitura_do_post`: se cada lado contasse o dia num fuso, a leitura
-- das 22h cairia num dia e o gráfico a procuraria no outro. E dia sem leitura
-- volta com ZERO, em vez de não voltar — um gráfico que pula os dias vazios
-- liga dois picos por uma linha que nunca existiu.
--
-- ─── Quem decide a leitura continua sendo a política ──────────────────────
--
-- As duas são `security invoker`: rodam com os privilégios de quem chama, e a
-- RLS de `leituras_dos_posts` e de `posts` continua valendo. Só `authenticated`
-- as executa. O visitante não tem como chamá-las, e, se tivesse, a política
-- não lhe devolveria linha alguma.
--
-- O período é cortado em [1, 366] dias DENTRO da função: quem chama direto,
-- sem passar pela camada de dados, não escolhe varrer a tabela inteira.
--
-- Idempotente: reaplicar em banco já migrado termina sem erro.

create or replace function public.leituras_por_dia(
  p_dias integer default 30,
  p_post_id uuid default null
)
  returns table (dia date, total bigint)
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  with janela as (
    select (now() at time zone 'America/Sao_Paulo')::date as hoje,
           least(greatest(coalesce(p_dias, 30), 1), 366) as dias
  )
  select d.dia::date as dia,
         coalesce(sum(l.total), 0)::bigint as total
    from janela j
    cross join lateral generate_series(
      j.hoje - (j.dias - 1), j.hoje, interval '1 day'
    ) as d(dia)
    left join public.leituras_dos_posts l
      on l.dia = d.dia::date
     and (p_post_id is null or l.post_id = p_post_id)
   group by d.dia
   order by d.dia
$$;

comment on function public.leituras_por_dia(integer, uuid) is
  'Total de leituras por DIA nos últimos p_dias dias (hoje incluído, fuso America/Sao_Paulo), de todos os Posts ou de um só. Dia sem leitura volta com zero. p_dias é cortado em [1, 366]. security invoker: a RLS de leituras_dos_posts decide a leitura.';

revoke all on function public.leituras_por_dia(integer, uuid) from public, anon, authenticated;
grant execute on function public.leituras_por_dia(integer, uuid) to authenticated;

create or replace function public.leituras_por_post_no_periodo(p_dias integer default 30)
  returns table (post_id uuid, titulo text, estado text, total bigint)
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  with janela as (
    select (now() at time zone 'America/Sao_Paulo')::date as hoje,
           least(greatest(coalesce(p_dias, 30), 1), 366) as dias
  )
  select p.id as post_id,
         p.titulo,
         p.estado::text as estado,
         sum(l.total)::bigint as total
    from janela j
    join public.leituras_dos_posts l on l.dia >= j.hoje - (j.dias - 1)
    join public.posts p on p.id = l.post_id
   group by p.id, p.titulo, p.estado
  having sum(l.total) > 0
   order by sum(l.total) desc, p.titulo, p.id
   limit 100
$$;

comment on function public.leituras_por_post_no_periodo(integer) is
  'Os Posts mais lidos nos últimos p_dias dias (hoje incluído, fuso America/Sao_Paulo), com título e Estado, do mais lido para o menos lido, até cem. p_dias é cortado em [1, 366]. security invoker: a RLS de leituras_dos_posts e de posts decide a leitura.';

revoke all on function public.leituras_por_post_no_periodo(integer) from public, anon, authenticated;
grant execute on function public.leituras_por_post_no_periodo(integer) to authenticated;

notify pgrst, 'reload schema';
