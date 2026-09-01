-- ═══════════════════════════════════════════════════════════════════════════
-- A IMAGEM DO CORPO CARREGA SOB DEMANDA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O renderizador (`src/render/blog/paraHtml.js`) passa a emitir
-- `loading="lazy"` em toda imagem do corpo do artigo. Esta migração é o que
-- deixa o HTML resultante ATRAVESSAR a defesa do banco.
--
-- ─── SÓ O HTML MUDA, E ISSO É O PONTO ─────────────────────────────────────
--
-- `documento_do_post_e_permitido` NÃO é tocada aqui, e a ausência é
-- deliberada: `loading` não é atributo de nó. Ele não existe em `NOS.image`,
-- não é editável no Painel e não sobrevive a uma volta pelo editor. É decisão
-- de ENTREGA — como a etiqueta que se escolhe para o título — e por isso
-- aparece só do lado do HTML.
--
-- A consequência prática importa: um documento que CHEGASSE com
-- `attrs.loading` continuaria sendo recusado pelo vocabulário fechado do
-- documento, exatamente como antes desta migração.
--
-- ─── O VALOR TAMBÉM É LISTA DE PERMISSÃO ──────────────────────────────────
--
-- Abrir o NOME `loading` sem prender o VALOR deixaria passar
-- `loading="eager"` — que anula a mudança sem sintoma nenhum — e qualquer
-- outra palavra. O renderizador emite uma única forma, e a cláusula (10)
-- exige essa forma: `lazy`, exatamente.
--
-- É a mesma escolha da faixa da largura em 20260901120000, e pelo mesmo
-- motivo: a lista de permissão que confere só o nome do atributo é meia lista.

-- ─── O HTML: `loading` na lista de atributos, com valor fechado ───────────

create or replace function public.html_do_post_e_seguro(html text)
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
    select m[1] as etiqueta, m[2] as regiao
      from entrada
           cross join lateral regexp_matches(
             entrada.sem_valores,
             '<[[:space:]]*/?[[:space:]]*([a-zA-Z][a-zA-Z0-9]*)([^>]*)>',
             'g'
           ) as m
  ),
  nomes as (
    select lower(n[1]) as nome
      from tags
           cross join lateral regexp_matches(tags.regiao, '([a-zA-Z0-9:_.-]+)', 'g') as n
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
    and length(coalesce(html, '')) <= 2000000
    and (length(coalesce(html, '')) - length(replace(coalesce(html, ''), '"', '')))
        = 2 * (select count(*) from pares)
    and (select count(*) from tags)
        = (length((select sem_valores from entrada))
           - length(replace((select sem_valores from entrada), '<', '')))
    and not exists (
      select 1 from tags
       where lower(tags.etiqueta) <> all (array[
               'p','h2','h3','strong','em','ul','ol','li',
               'a','blockquote','pre','code','hr','br',
               'img','mark'
             ])
    )
    and not exists (
      select 1 from tags
       where tags.regiao !~ '^([[:space:]]+[a-zA-Z][a-zA-Z0-9-]*=~)*[[:space:]]*/?$'
    )
    -- (4) NOME DE ATRIBUTO na lista de permissão. `loading` é o novo desde
    -- 20260901160000 -- e continua NÃO havendo `style`.
    and not exists (
      select 1 from nomes
       where nomes.nome <> all (array[
               'href',
               'target',
               'rel',
               'title',
               'start',
               'type',
               'tabindex',
               'data-linguagem',
               'data-alinhamento',
               'src',
               'alt',
               'data-cor',
               'width',
               'loading'
             ])
    )
    and not exists (
      select 1 from pares
       where pares.nome = 'href'
         and not public.endereco_do_post_e_permitido(pares.valor)
    )
    and coalesce(html, '') !~* '<[[:space:]]*script'
    and coalesce(html, '') !~* '<[[:space:]]*iframe'
    and not exists (
      select 1 from pares
       where regexp_replace(pares.valor, '&(amp|lt|gt|quot);', '', 'g') like '%&%'
    )
    and not exists (
      select 1 from pares
       where pares.nome = 'src'
         and not public.endereco_de_imagem_e_permitido(pares.valor)
    )
    -- (9) A LARGURA EMITIDA é número inteiro dentro da faixa. O renderizador
    -- só a emite assim, e esta cláusula é o que impede um `width` de outra
    -- origem entrar com valor arbitrário -- `width="99999"` ou `width="auto"`.
    and not exists (
      select 1 from pares
       where pares.nome = 'width'
         and (
           pares.valor !~ '^[0-9]+$'
           or pares.valor::numeric < 80
           or pares.valor::numeric > 1600
         )
    )
    -- (10) O CARREGAMENTO EMITIDO é uma palavra só. `eager` desligaria a
    -- mudança sem deixar sintoma, e por isso não é "outro valor válido": é
    -- valor recusado, como qualquer palavra fora da lista.
    and not exists (
      select 1 from pares
       where pares.nome = 'loading'
         and pares.valor <> 'lazy'
    );
$fn$;

comment on function public.html_do_post_e_seguro(text) is
  'Lista de PERMISSÃO: etiqueta (inclui img/mark desde 20260828150000), forma da região de atributos, nome de atributo (inclui src/alt/data-cor desde 20260828150000, width desde 20260901120000 e loading desde 20260901160000), esquema de endereço de link e de imagem, faixa da largura, valor do carregamento, e forma canônica do valor. Não saneia — recusa.';

-- ─── A restrição, revalidada sobre as linhas existentes ──────────────────
--
-- A lista só CRESCEU: todo HTML que passava continua passando, e a revalidação
-- é barata. Ela fica aqui porque `create or replace function` não reexecuta
-- sozinha a restrição que depende da função -- sem isto, a mudança valeria só
-- para gravação nova, e ninguém saberia.

alter table public.posts drop constraint if exists posts_conteudo_html_seguro;
alter table public.posts add constraint posts_conteudo_html_seguro
  check (public.html_do_post_e_seguro(conteudo_html));
