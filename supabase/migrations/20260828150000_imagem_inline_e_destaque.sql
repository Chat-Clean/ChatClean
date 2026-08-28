-- `image` e `highlight` entram no vocabulário fechado do documento e do HTML
-- do Post: imagem inline no corpo e destaque de cor, os dois recursos do
-- Editor avançado (Tiptap Dev Kit) que faltavam.
--
-- Migração nova, não edição de aplicada: `documento_do_post_e_permitido` e
-- `html_do_post_e_seguro` já existem desde migrações anteriores, e as duas
-- são listas FECHADAS — nó, marca, etiqueta e nome de atributo. Sem esta
-- migração, todo Post com uma imagem ou um destaque de cor seria recusado na
-- gravação pela própria restrição que existe para proteger o banco.
--
-- ─── O que entra, e onde ──────────────────────────────────────────────────
--
--   NÓ  `image`      — `documento_do_post_e_permitido`: entra na lista de nós;
--                       exige `attrs.src` presente e validado pela MESMA
--                       função que já valida `imagem_url`/`seo_imagem_url`
--                       (`public.endereco_de_imagem_e_permitido`, de
--                       `20260819234500_capa_no_storage.sql` — não se cria
--                       uma segunda regra de endereço).
--   MARCA `highlight` — `documento_do_post_e_permitido`: entra na lista de
--                       marcas; exige `attrs.cor` presente e dentro do
--                       vocabulário FECHADO de `CORES_DE_DESTAQUE`
--                       (`src/domain/blog/schema.js`): amarelo, verde, azul,
--                       rosa. Nunca `style` livre, nunca hexadecimal.
--   ETIQUETA `img`, `mark`         — `html_do_post_e_seguro`: as duas
--                       etiquetas que `render/blog/paraHtml.js` passa a
--                       emitir.
--   ATRIBUTO `src`, `alt`, `data-cor` — `html_do_post_e_seguro`: os três
--                       nomes novos. `src` é o único que carrega endereço, e
--                       passa pela MESMA `endereco_de_imagem_e_permitido` —
--                       a cláusula (8), nova, é o espelho de (5) para `href`.
--                       `alt` é texto livre, como `title` já é. `data-cor`
--                       NÃO ganha restrição de valor: mesma decisão que
--                       `data-alinhamento` já recebeu em
--                       `20260827120000_alinhamento_de_texto.sql` — o
--                       renderizador único só o emite a partir da lista
--                       fechada do schema, e um valor fora dela nunca sai
--                       dele.
--
-- Idempotente: reaplicar em banco já migrado termina sem erro.

-- ─── O documento: `image` e `highlight` na travessia única ────────────────

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
    -- `'{}'` é o padrão da coluna: o Post que ainda não tem nada escrito.
    when doc = '{}'::jsonb then true
    -- Teto ANTES da travessia: o `case` do Postgres é curto-circuitante, então
    -- um documento gigante é recusado sem ser percorrido.
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
                 -- `h1` deixa de ser representável AQUI. O título do Post é da
                 -- página, e dois `h1` por página é o defeito que a Story 2.3
                 -- existe para não repetir.
                 when (t.n ->> 'type') = 'heading'
                      and coalesce(t.n #>> '{attrs,level}', '') <> all (array['2', '3'])
                   then 'título de nível fora do schema'
                 -- A imagem exige `src`, e ele passa pela MESMA regra da capa
                 -- e da imagem de SEO — não uma segunda regra de endereço.
                 when (t.n ->> 'type') = 'image'
                      and (
                        coalesce(t.n #>> '{attrs,src}', '') = ''
                        or not public.endereco_de_imagem_e_permitido(t.n #>> '{attrs,src}')
                      )
                   then 'imagem sem endereço permitido'
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
                 -- O destaque exige `cor`, e ela vem só do vocabulário fechado
                 -- de `CORES_DE_DESTAQUE` (`src/domain/blog/schema.js`) — nunca
                 -- `style` livre nem hexadecimal escolhido pelo Autor.
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
  'Lista de PERMISSÃO: nó (inclui image desde 20260828150000), marca (inclui highlight desde 20260828150000), nível de título e esquema de endereço, todos comparados por igualdade com src/domain/blog/schema.js pela ferramenta verificar:escrita. Uma travessia por gravação.';

-- ─── O HTML: `img`, `mark`, `src`, `alt`, `data-cor` ───────────────────────

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
      -- O VALOR sai antes de o NOME ser lido. É o que separa
      -- `title="veja onclick= …"` (legítimo) de `<a/onclick=` (evasão).
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
    -- (0) CONTABILIDADE DE ASPAS. Toda aspa dupla do valor precisa pertencer a
    -- um par `nome="valor"`. É o que impede o pareamento de escorregar sobre
    -- texto com aspas desemparelhadas e engolir uma etiqueta inteira —
    -- `<p>a"</p><a href="javascript:1">"b</p>` passava sem isto. O renderizador
    -- escapa `"` no texto justamente para que esta conta feche.
    and (length(coalesce(html, '')) - length(replace(coalesce(html, ''), '"', '')))
        = 2 * (select count(*) from pares)
    -- (1) todo `<` do valor abre uma etiqueta bem formada. Texto legítimo traz
    -- `&lt;`, então `<` cru fora de etiqueta significa que o valor não saiu do
    -- renderizador — inclusive comentário de HTML.
    and (select count(*) from tags)
        = (length((select sem_valores from entrada))
           - length(replace((select sem_valores from entrada), '<', '')))
    -- (2) ETIQUETA na lista de permissão: as dezesseis do renderizador único —
    -- `img` e `mark` desde 20260828150000. É esta cláusula que recusa
    -- `<script`, `<iframe`, `<object`, `<embed`, `<svg`, `<form` e o que ainda
    -- não foi inventado.
    and not exists (
      select 1 from tags
       where lower(tags.etiqueta) <> all (array[
               'p','h2','h3','strong','em','ul','ol','li',
               'a','blockquote','pre','code','hr','br',
               'img','mark'
             ])
    )
    -- (3) A REGIÃO DE ATRIBUTOS tem forma: sequência de `nome="valor"`, e nada
    -- mais. Barra como separador (`<a/onclick=`), valor sem aspas
    -- (`href=javascript:1`) e valor entre aspas simples (`href='x'`) caem aqui,
    -- antes mesmo de o nome ser conferido.
    and not exists (
      select 1 from tags
       where tags.regiao !~ '^([[:space:]]+[a-zA-Z][a-zA-Z0-9-]*=~)*[[:space:]]*/?$'
    )
    -- (4) NOME DE ATRIBUTO na lista de permissão: os onze que o renderizador
    -- emite. `style`, `onclick`, `srcdoc`, `xlink:href` caem por não estarem.
    -- `src`, `alt` e `data-cor` são os três novos desde 20260828150000.
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
               'data-cor'
             ])
    )
    -- (5) todo endereço de LINK declarado passa pela lista de permissão de
    -- esquemas — sobre o valor DECODIFICADO, que é o que o navegador resolve.
    and not exists (
      select 1 from pares
       where pares.nome = 'href'
         and not public.endereco_do_post_e_permitido(pares.valor)
    )
    -- (6) as duas etiquetas que o critério de aceite nomeia, por extenso.
    -- Redundante com (2) de propósito: a asserção que as nomeia sobrevive a
    -- alguém alargar a lista de etiquetas.
    and coalesce(html, '') !~* '<[[:space:]]*script'
    and coalesce(html, '') !~* '<[[:space:]]*iframe'
    -- (7) REFERÊNCIA DE CARACTERE em valor de atributo. O renderizador escapa
    -- `&` como `&amp;`, então todo `&` num valor de atributo dele começa uma das
    -- quatro sequências abaixo. Qualquer outra — `&#106;`, `&#x6a;`, `&colon;`,
    -- `&Tab;`, ou um `&` solto — não saiu dele. Mais duro que o schema de
    -- propósito: é a cláusula que continua valendo se a lista de entidades
    -- nomeadas de (5) ficar incompleta.
    and not exists (
      select 1 from pares
       where regexp_replace(pares.valor, '&(amp|lt|gt|quot);', '', 'g') like '%&%'
    )
    -- (8) todo endereço de IMAGEM (`src`) passa pela MESMA lista de permissão
    -- que já vale para `imagem_url`/`seo_imagem_url` — o espelho de (5), com a
    -- outra função: `endereco_de_imagem_e_permitido` só aceita `https://`
    -- absoluto (mais `http://` de host local), e é essa cláusula, não o
    -- vocabulário de etiqueta, que torna `<img src="javascript:…">` e
    -- `<img src="data:…">` não representáveis aqui.
    and not exists (
      select 1 from pares
       where pares.nome = 'src'
         and not public.endereco_de_imagem_e_permitido(pares.valor)
    );
$fn$;

comment on function public.html_do_post_e_seguro(text) is
  'Lista de PERMISSÃO: etiqueta (inclui img/mark desde 20260828150000), forma da região de atributos, nome de atributo (inclui src/alt/data-cor desde 20260828150000), esquema de endereço de link e de imagem, e forma canônica do valor. Não sanea — recusa.';

-- ─── As restrições, revalidadas sobre as linhas existentes ───────────────

alter table public.posts drop constraint if exists posts_conteudo_no_vocabulario;
alter table public.posts add constraint posts_conteudo_no_vocabulario
  check (public.documento_do_post_e_permitido(conteudo));

alter table public.posts drop constraint if exists posts_conteudo_html_seguro;
alter table public.posts add constraint posts_conteudo_html_seguro
  check (public.html_do_post_e_seguro(conteudo_html));
