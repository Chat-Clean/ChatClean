-- As buscas do Google: o que o Search Console mede do site, guardado aqui.
--
-- ─── De onde vem, e por que é copiado ─────────────────────────────────────
--
-- O Search Console diz quantas vezes o site apareceu no Google, quantos
-- cliques recebeu e em que posição. Ele guarda dezesseis meses, entrega com
-- dois ou três dias de atraso, e só responde a quem tem a chave de uma conta
-- do Google — que é segredo e não pode chegar ao navegador. Uma sincronização
-- diária (`scripts/sincronizar-buscas.mjs`) copia os números para cá, e o
-- Painel lê daqui: a tela abre na hora, e o histórico passa a ser nosso.
--
-- ─── Uma tabela, quatro recortes ──────────────────────────────────────────
--
-- Cada linha é um DIA, e o par (pagina, termo) diz qual recorte ela é:
--
--   pagina vazia,  termo vazio    o site inteiro naquele dia
--   pagina /x,     termo vazio    uma página naquele dia
--   pagina vazia,  termo y        um termo de busca, no site inteiro
--   pagina /x,     termo y        um termo de busca, numa página
--
-- Texto vazio, e não nulo, porque os dois fazem parte da chave primária, e
-- nulo numa chave não é igual a nulo: a mesma linha entraria duas vezes.
-- A página é o CAMINHO (`/blog/um-post`), sem o domínio. A home é `/`.
--
-- Os quatro recortes são pedidos ao Google em separado, e NÃO se somam uns a
-- partir dos outros: o Google esconde parte dos termos por privacidade, então
-- a soma dos termos de uma página é menor que o total da página. Cada número
-- mostrado sai do recorte que o mede.
--
-- ─── A posição ────────────────────────────────────────────────────────────
--
-- `posicao` é a posição média do dia, como o Google a entrega. A média de um
-- PERÍODO não é a média das médias: um dia com uma impressão pesaria igual a
-- um dia com mil. As funções de leitura ponderam pela quantidade de
-- impressões.
--
-- ─── Quem lê e quem escreve ───────────────────────────────────────────────
--
-- Só `authenticated` (o Painel) lê. Ninguém escreve pelo navegador: a
-- sincronização grava com a chave de serviço, que ignora a RLS e vive só em
-- segredo de servidor. Nada aqui é dado pessoal: o Google já entrega os
-- números agregados, e termo de busca raro ele mesmo omite.
--
-- Idempotente: reaplicar em banco já migrado termina sem erro.

create table if not exists public.buscas_do_google (
  dia date not null,
  pagina text not null default '',
  termo text not null default '',
  cliques integer not null default 0 check (cliques >= 0),
  impressoes integer not null default 0 check (impressoes >= 0),
  posicao numeric(7, 2) not null default 0 check (posicao >= 0),
  primary key (dia, pagina, termo),
  constraint buscas_do_google_pagina_e_caminho check (pagina = '' or pagina like '/%'),
  constraint buscas_do_google_tamanhos check (char_length(pagina) <= 2048 and char_length(termo) <= 512)
);

comment on table public.buscas_do_google is
  'O que o Google Search Console mede do site, por dia. pagina e termo vazios = site inteiro; só pagina = uma página; só termo = um termo no site; os dois = um termo numa página. Gravado pela sincronização diária com a chave de serviço; lido só por authenticated.';

alter table public.buscas_do_google enable row level security;

revoke all on table public.buscas_do_google from public, anon, authenticated;
grant select on table public.buscas_do_google to authenticated;

drop policy if exists buscas_do_google_leitura_autenticada on public.buscas_do_google;
create policy buscas_do_google_leitura_autenticada
  on public.buscas_do_google
  for select
  to authenticated
  using (true);

create or replace function public.buscas_por_dia(
  p_dias integer default 30,
  p_pagina text default null
)
  returns table (dia date, cliques bigint, impressoes bigint, posicao numeric)
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
         coalesce(b.cliques, 0)::bigint as cliques,
         coalesce(b.impressoes, 0)::bigint as impressoes,
         coalesce(b.posicao, 0)::numeric as posicao
    from janela j
    cross join lateral generate_series(
      j.hoje - (j.dias - 1), j.hoje, interval '1 day'
    ) as d(dia)
    left join public.buscas_do_google b
      on b.dia = d.dia::date
     and b.pagina = coalesce(p_pagina, '')
     and b.termo = ''
   order by d.dia
$$;

comment on function public.buscas_por_dia(integer, text) is
  'Cliques, impressões e posição média por DIA nos últimos p_dias dias (hoje incluído, fuso America/Sao_Paulo), do site inteiro ou de uma página. Um ponto por dia: dia sem dado volta com zero. p_dias é cortado em [1, 366]. security invoker: a RLS de buscas_do_google decide a leitura.';

revoke all on function public.buscas_por_dia(integer, text) from public, anon, authenticated;
grant execute on function public.buscas_por_dia(integer, text) to authenticated;

create or replace function public.buscas_por_pagina(p_dias integer default 30)
  returns table (
    pagina text,
    titulo text,
    cliques bigint,
    impressoes bigint,
    posicao numeric,
    leituras bigint
  )
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  with janela as (
    select (now() at time zone 'America/Sao_Paulo')::date as hoje,
           least(greatest(coalesce(p_dias, 30), 1), 366) as dias
  ),
  somadas as (
    select b.pagina,
           sum(b.cliques)::bigint as cliques,
           sum(b.impressoes)::bigint as impressoes,
           case when sum(b.impressoes) > 0
                then round(sum(b.posicao * b.impressoes) / sum(b.impressoes), 1)
                else 0 end as posicao
      from janela j
      join public.buscas_do_google b
        on b.dia >= j.hoje - (j.dias - 1)
       and b.pagina <> ''
       and b.termo = ''
     group by b.pagina
  )
  select s.pagina,
         p.titulo,
         s.cliques,
         s.impressoes,
         s.posicao,
         case when p.id is null then null
              else (select coalesce(sum(l.total), 0)::bigint
                      from janela j
                      join public.leituras_dos_posts l
                        on l.post_id = p.id
                       and l.dia >= j.hoje - (j.dias - 1))
         end as leituras
    from somadas s
    left join public.posts p on s.pagina = '/blog/' || p.slug
   order by s.cliques desc, s.impressoes desc, s.pagina
   limit 100
$$;

comment on function public.buscas_por_pagina(integer) is
  'As páginas mais clicadas no Google nos últimos p_dias dias, até cem, com posição média ponderada pelas impressões. Quando a página é um Post, traz o título e as leituras do mesmo período — é onde o clique do Google e a leitura contada pelo site aparecem lado a lado; nas demais páginas os dois vêm nulos. security invoker.';

revoke all on function public.buscas_por_pagina(integer) from public, anon, authenticated;
grant execute on function public.buscas_por_pagina(integer) to authenticated;

create or replace function public.buscas_por_termo(
  p_dias integer default 30,
  p_pagina text default null
)
  returns table (termo text, cliques bigint, impressoes bigint, posicao numeric)
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  with janela as (
    select (now() at time zone 'America/Sao_Paulo')::date as hoje,
           least(greatest(coalesce(p_dias, 30), 1), 366) as dias
  )
  select b.termo,
         sum(b.cliques)::bigint as cliques,
         sum(b.impressoes)::bigint as impressoes,
         case when sum(b.impressoes) > 0
              then round(sum(b.posicao * b.impressoes) / sum(b.impressoes), 1)
              else 0 end as posicao
    from janela j
    join public.buscas_do_google b
      on b.dia >= j.hoje - (j.dias - 1)
     and b.pagina = coalesce(p_pagina, '')
     and b.termo <> ''
   group by b.termo
   order by sum(b.cliques) desc, sum(b.impressoes) desc, b.termo
   limit 100
$$;

comment on function public.buscas_por_termo(integer, text) is
  'Os termos de busca com mais cliques nos últimos p_dias dias, até cem, do site inteiro ou de uma página, com posição média ponderada pelas impressões. security invoker.';

revoke all on function public.buscas_por_termo(integer, text) from public, anon, authenticated;
grant execute on function public.buscas_por_termo(integer, text) to authenticated;

create or replace function public.buscas_ultimo_dia()
  returns date
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  select max(b.dia) from public.buscas_do_google b where b.pagina = '' and b.termo = ''
$$;

comment on function public.buscas_ultimo_dia() is
  'O dia mais recente com dado do site inteiro em buscas_do_google, ou nulo quando a sincronização ainda não rodou. O Google entrega com atraso, e a tela usa isto para dizer até onde os números vão. security invoker.';

revoke all on function public.buscas_ultimo_dia() from public, anon, authenticated;
grant execute on function public.buscas_ultimo_dia() to authenticated;

notify pgrst, 'reload schema';
