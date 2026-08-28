-- `data-alinhamento` entra na lista de PERMISSÃO de nomes de atributo do HTML
-- do Post. Correção de UI/UX do Editor: a barra ganhou os três controles de
-- alinhamento de texto (`domain/blog/schema.js`, `ELEMENTOS`), e o
-- renderizador único (`render/blog/paraHtml.js`) passou a emitir
-- `data-alinhamento="center"`/`"right"` em `<p>`, `<h2>` e `<h3>` — omitido
-- quando o alinhamento é `left`, o padrão.
--
-- Migração nova, não edição de aplicada: `html_do_post_e_seguro` já existe
-- desde 20260817193000_endereco_com_entidade.sql, e a cláusula (4) daquela
-- função é uma lista FECHADA de nomes de atributo. Sem esta migração, todo
-- Post com um parágrafo ou título centralizado ou alinhado à direita seria
-- recusado na gravação pela própria restrição que existe para proteger o
-- banco — `posts_conteudo_html_seguro` acusaria o HTML derivado do Editor
-- como INSEGURO, o que ele não é: o valor vem do mesmo schema fechado que
-- valida do lado do cliente e do servidor.
--
-- Nenhuma restrição de VALOR é acrescentada para este atributo — mesma
-- tratamento que `type`, `tabindex` e `data-linguagem` já recebem aqui: só
-- `href` passa pela lista de permissão de esquema (cláusula 5), porque é o
-- único atributo emitido que pode carregar um endereço. `data-alinhamento`
-- não pode: o schema (`domain/blog/schema.js`) só o gera como `"center"` ou
-- `"right"`, e um valor fora disso nunca sai do renderizador.
--
-- Idempotente: reaplicar em banco já migrado termina sem erro.

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
    -- (2) ETIQUETA na lista de permissão: as catorze do renderizador único.
    -- É esta cláusula que recusa `<script`, `<iframe`, `<object`, `<embed`,
    -- `<svg`, `<form`, `<img` e o que ainda não foi inventado.
    and not exists (
      select 1 from tags
       where lower(tags.etiqueta) <> all (array[
               'p','h2','h3','strong','em','ul','ol','li',
               'a','blockquote','pre','code','hr','br'
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
    -- (4) NOME DE ATRIBUTO na lista de permissão: os NOVE que o renderizador
    -- emite. `style`, `onclick`, `srcdoc`, `xlink:href` caem por não estarem.
    -- `data-alinhamento` é o nono, novo nesta migração (correção de UI/UX do
    -- Editor) — o único atributo dos três de alinhamento, e ele sozinho, sem
    -- valor livre: o schema só o gera como `center` ou `right`.
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
               'data-alinhamento'
             ])
    )
    -- (5) todo endereço declarado passa pela lista de permissão de esquemas —
    -- agora sobre o valor DECODIFICADO, que é o que o navegador resolve.
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
    );
$fn$;

comment on function public.html_do_post_e_seguro(text) is
  'Lista de PERMISSÃO: etiqueta, forma da região de atributos, nome de atributo (inclui data-alinhamento desde 20260827120000), esquema de endereço decodificado e forma canônica do valor. Não sanea — recusa.';

-- ─── A restrição, revalidada sobre as linhas existentes ──────────────────

alter table public.posts drop constraint if exists posts_conteudo_html_seguro;
alter table public.posts add constraint posts_conteudo_html_seguro
  check (public.html_do_post_e_seguro(conteudo_html));
