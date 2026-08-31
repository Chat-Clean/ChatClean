-- A LARGURA ESCOLHIDA PELO AUTOR entra no vocabulário fechado do documento e
-- do HTML do Post: é o que o punho de redimensionar da imagem grava, e sem
-- esta migração todo Post com imagem redimensionada seria recusado na gravação
-- pela própria restrição que existe para proteger o banco.
--
-- Migração NOVA, e não edição da aplicada: `20260828150000_imagem_inline_e_destaque`
-- já está registrada, e o aplicador acusa divergência entre o que está gravado
-- e o arquivo. Correção vem como migração nova — é a regra do projeto.
--
-- ─── O QUE ENTRA, E ONDE ──────────────────────────────────────────────────
--
--   ATRIBUTO DE NÓ `width` — `documento_do_post_e_permitido`: o nó `image`
--                       passa a aceitar `attrs.width`, e ela é conferida
--                       contra a MESMA faixa que `src/domain/blog/schema.js`
--                       declara (`inteiroEntre(80, 1600)`). Fora da faixa, a
--                       gravação é recusada.
--   ATRIBUTO HTML `width` — `html_do_post_e_seguro`: o nome novo na lista de
--                       permissão de atributos. Sai como `width="640"`, e
--                       NUNCA como `style` — atributo de estilo continua fora
--                       do vocabulário, e a proporção é preservada pelo CSS.
--
-- Só a LARGURA entra. A altura fica de fora de propósito: a proporção é do
-- CSS (`height: auto`), e aceitar as duas abriria a porta para um par
-- inconsistente — imagem gravada esticada, que nenhum arrasto proporcional
-- consegue produzir.
--
-- Idempotente: reaplicar em banco já migrado termina sem erro.

-- ─── O documento: `width` no nó `image` ───────────────────────────────────

create or replace function public.documento_do_post_e_permitido(doc jsonb)
  returns boolean
  language sql
  immutable
  parallel safe
  set search_path = ''
as $fn$
  select case
    when doc is null then false
    when jsonb_typeof(doc) <> 'object' then false
    when doc = '{}'::jsonb then true
    when length(doc::text) > 1000000 then false
    when doc ->> 'type' is distinct from 'doc' then false
    else not exists (
      select 1
        from public.nos_do_documento(doc) as t(n)
             cross join lateral (
               select case
                 when jsonb_typeof(t.n) <> 'object'
                   then 'valor solto onde um nó deveria estar'
                 when (t.n ->> 'type') is null
                   then 'nó sem tipo'
                 when (t.n ->> 'type') <> all (array[
                        'doc',
                        'paragraph',
                        'heading',
                        'blockquote',
                        'bulletList',
                        'orderedList',
                        'listItem',
                        'codeBlock',
                        'horizontalRule',
                        'hardBreak',
                        'text',
                        'image'
                      ])
                   then 'nó fora do vocabulário'
                 when (t.n ->> 'type') = 'heading'
                      and coalesce(t.n #>> '{attrs,level}', '') <> all (array['2', '3'])
                   then 'título de nível fora do schema'
                 when (t.n ->> 'type') = 'image'
                      and (
                        coalesce(t.n #>> '{attrs,src}', '') = ''
                        or not public.endereco_de_imagem_e_permitido(t.n #>> '{attrs,src}')
                      )
                   then 'imagem sem endereço permitido'
                 -- A LARGURA, quando declarada, é inteiro dentro da faixa que
                 -- o schema do domínio declara. Ausente é legítimo: imagem sem
                 -- largura escolhida ocupa a medida do texto.
                 when (t.n ->> 'type') = 'image'
                      and (t.n #> '{attrs,width}') is not null
                      and jsonb_typeof(t.n #> '{attrs,width}') <> 'null'
                      and (
                        jsonb_typeof(t.n #> '{attrs,width}') <> 'number'
                        or (t.n #>> '{attrs,width}') !~ '^[0-9]+$'
                        or (t.n #>> '{attrs,width}')::numeric < 80
                        or (t.n #>> '{attrs,width}')::numeric > 1600
                      )
                   then 'largura de imagem fora da faixa'
                 when (t.n #>> '{attrs,href}') is not null
                      and not public.endereco_do_post_e_permitido(t.n #>> '{attrs,href}')
                   then 'endereço não permitido em atributo de nó'
                 else null
               end as problema
               union all
               select case
                 when jsonb_typeof(marca) <> 'object'
                   then 'valor solto onde uma marca deveria estar'
                 when (marca ->> 'type') is null
                   then 'marca sem tipo'
                 when (marca ->> 'type') <> all (array[
                        'bold',
                        'italic',
                        'link',
                        'highlight'
                      ])
                   then 'marca fora do vocabulário'
                 when (marca ->> 'type') = 'highlight'
                      and coalesce(marca #>> '{attrs,cor}', '') <> all (array[
                            'amarelo',
                            'verde',
                            'azul',
                            'rosa'
                          ])
                   then 'cor de destaque não permitida'
                 when (marca #>> '{attrs,href}') is not null
                      and not public.endereco_do_post_e_permitido(marca #>> '{attrs,href}')
                   then 'endereço não permitido em atributo de marca'
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

comment on function public.documento_do_post_e_permitido(jsonb) is
  'Lista de PERMISSÃO: nó (inclui image desde 20260828150000), marca (inclui highlight desde 20260828150000), nível de título, largura de imagem (desde 20260901120000) e esquema de endereço, todos comparados por igualdade com src/domain/blog/schema.js pela ferramenta verificar:escrita. Uma travessia por gravação.';

-- ─── O HTML: `width` na lista de atributos ────────────────────────────────

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
    -- (4) NOME DE ATRIBUTO na lista de permissão. `width` é o novo desde
    -- 20260901120000 -- e continua NÃO havendo `style`: a largura sai como
    -- atributo de HTML de verdade, e a proporção fica com o CSS.
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
               'width'
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
    );
$fn$;

comment on function public.html_do_post_e_seguro(text) is
  'Lista de PERMISSÃO: etiqueta (inclui img/mark desde 20260828150000), forma da região de atributos, nome de atributo (inclui src/alt/data-cor desde 20260828150000 e width desde 20260901120000), esquema de endereço de link e de imagem, faixa da largura, e forma canônica do valor. Não saneia — recusa.';

-- ─── As restrições, revalidadas sobre as linhas existentes ───────────────

alter table public.posts drop constraint if exists posts_conteudo_no_vocabulario;
alter table public.posts add constraint posts_conteudo_no_vocabulario
  check (public.documento_do_post_e_permitido(conteudo));

alter table public.posts drop constraint if exists posts_conteudo_html_seguro;
alter table public.posts add constraint posts_conteudo_html_seguro
  check (public.html_do_post_e_seguro(conteudo_html));
