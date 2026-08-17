-- A segunda linha de defesa, reescrita como LISTA DE PERMISSÃO.
--
-- Story 2.5 — correções da revisão. Migração nova, não edição da anterior:
-- migração já aplicada é registro histórico e não se reescreve.
--
-- ─── O que estava errado, medido contra o projeto ─────────────────────────
--
-- A versão anterior (`20260817113000`) era uma lista de PROIBIÇÃO de padrões:
-- recusava `<script`, `<iframe`, `[[:space:]]on[a-zA-Z]+=` e endereço com três
-- esquemas nomeados. Três evasões passaram, gravadas por fora da função com
-- chave de serviço — que é exatamente a via em que a restrição é a ÚNICA
-- defesa:
--
--   PASSOU  <a/onclick="alert(1)">x</a>
--   PASSOU  <a title="x"href="javascript:alert(1)">x</a>
--   PASSOU  <p style="position:fixed;inset:0">a</p>
--   PASSOU  <a href="java{nova linha}script:alert(1)">x</a>
--   PASSOU  <a href="ftp://x/y">x</a>
--
-- A primeira porque barra é separador de atributo válido em HTML: `<a/onclick=`
-- é equivalente a `<a onclick=`. A segunda porque a regra exigia espaço antes
-- do nome. A terceira mostra o problema de fundo: **nome de atributo não era
-- lista fechada**, então `style` entrava e um sobreposto de clickjacking
-- passava. A quarta porque o corte de espaços e controles só rodava sobre
-- `conteudo`, não sobre o HTML. A quinta porque só três esquemas eram
-- nomeados, e a lista de permissão do schema tem quatro.
--
-- E o outro lado da mesma moeda: as regras não distinguiam NOME de VALOR de
-- atributo, então um link legítimo com `title="veja onclick= no exemplo"` —
-- artigo técnico sobre web, o assunto deste blog — atravessava a função e era
-- RECUSADO pelo banco. Alarme que dispara sobre entrada legítima é o jeito
-- mais rápido de ensinar alguém a ignorar o alarme.
--
-- ─── A correção: permissão, não proibição ────────────────────────────────
--
-- A mesma lógica que o schema já usa para nós e marcas passa a valer para tudo:
--
--   * ETIQUETA         — as catorze que o renderizador único emite.
--   * NOME DE ATRIBUTO — os oito que ele emite. `style`, `onclick`, `srcdoc` e
--                        o que ainda não foi inventado caem por não estarem.
--   * ESQUEMA DE ENDEREÇO — os quatro de `PROTOCOLOS_DE_LINK`. `ftp:`, `blob:`
--                        e `about:` caem por não estarem.
--   * NÓ, MARCA, NÍVEL DE TÍTULO — as listas do schema fechado.
--
-- Enquanto era proibição, a próxima forma de evasão era só uma questão de
-- tempo. Toda lista abaixo é comparada por IGUALDADE, nos dois sentidos, com a
-- lista correspondente do código, pela ferramenta `verificar:escrita`.
--
-- ─── E o VALOR sai antes de o NOME ser lido ──────────────────────────────
--
-- `regexp_replace(html, '"[^"]*"', '~', 'g')` remove todo valor entre aspas
-- antes de qualquer teste de nome. É o que faz `title="veja onclick= …"` passar
-- e `<a/onclick=` cair: um é valor, o outro é nome.
--
-- Isso só é SÃO porque o renderizador escapa `"` também no TEXTO (e não apenas
-- em atributo): na saída canônica, aspa dupla só existe delimitando valor de
-- atributo. Sem essa garantia, um texto com aspas desemparelhadas fazia o
-- pareamento escorregar e engolir uma etiqueta inteira — verificado:
-- `<p>a"</p><a href="javascript:1">"b</p>` passava. A contabilidade de aspas
-- abaixo é o que impõe a garantia em vez de confiar nela.
--
-- ─── O que estas restrições NÃO garantem ─────────────────────────────────
--
-- Elas conferem `conteudo` e `conteudo_html` **separadamente**, e nada liga um
-- ao outro. Pelo console ainda é possível gravar um documento vazio ao lado de
-- um HTML de um texto que ninguém escreveu, ou um HTML desatualizado em relação
-- ao documento: as duas restrições passam porque cada valor, isolado, é bem
-- formado. Amarrar os dois exigiria derivar o HTML dentro do banco — uma
-- terceira implementação do renderizador, que a arquitetura proíbe. A garantia
-- é: nada perigoso entra por via nenhuma. A garantia que NÃO existe é: o HTML
-- corresponde ao documento. Essa depende de a escrita passar pela função.
--
-- Idempotente: reaplicar em banco já migrado termina sem erro.

-- ─── Tetos ───────────────────────────────────────────────────────────────
--
-- Escolhas da IMPLEMENTAÇÃO, não decisão de produto, e é por isso que estão
-- nomeadas aqui em vez de espalhadas: a travessia recursiva do documento é
-- proporcional ao número de nós, e sem teto um documento com centenas de
-- milhares de irmãos transforma cada gravação numa varredura de milhões de
-- linhas. Um artigo de 20 mil caracteres dá cerca de 60 kB de JSON — o teto é
-- uma ordem de grandeza acima disso.
--
--   documento:  1.000.000 caracteres de JSON
--   HTML:       2.000.000 caracteres

-- ─── O endereço é PERMITIDO? (espelho de `enderecoPermitido`) ─────────────
--
-- Lista de permissão de esquemas, não de proibição: a versão anterior nomeava
-- `javascript:`, `vbscript:` e `data:`, e `ftp:` passava. Os quatro esquemas
-- abaixo são os de `PROTOCOLOS_DE_LINK` em `src/domain/blog/schema.js`, e a
-- verificação compara as duas funções sobre um corpus comum de endereços — é a
-- única forma de a divergência entre elas aparecer como falha em vez de como
-- conteúdo legítimo recusado.

create or replace function public.endereco_do_post_e_permitido(endereco text)
  returns boolean
  language sql
  immutable
  parallel safe
  set search_path = ''
as $fn$
  with e as (select btrim(coalesce(endereco, '')) as v)
  select case
    when endereco is null then false
    when e.v = '' then false
    -- Barra invertida não existe em endereço legítimo e existe em quase toda
    -- evasão: navegador normaliza `\` para `/` antes de resolver a autoridade.
    when strpos(e.v, chr(92)) > 0 then false
    -- Espaço, tabulação, nova linha ou caractere de controle DENTRO do endereço
    -- é a evasão clássica: `java{nova linha}script:` é lido como `javascript:`.
    when e.v ~ '[[:space:][:cntrl:]]' then false
    -- Barra dupla no começo é endereço relativo de PROTOCOLO: `//evil.com`
    -- parece interno e o navegador resolve como `https://evil.com`.
    when left(e.v, 2) = '//' then false
    when left(e.v, 1) in ('/', '#', '?') then true
    -- Sem esquema: caminho relativo simples.
    when e.v !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' then true
    else lower(substring(e.v from '^[a-zA-Z][a-zA-Z0-9+.-]*:')) = any (array[
           'http:',
           'https:',
           'mailto:',
           'tel:'
         ])
  end
  from e;
$fn$;

comment on function public.endereco_do_post_e_permitido(text) is
  'Espelho em SQL de enderecoPermitido de src/domain/blog/schema.js: lista de PERMISSÃO de esquemas. As duas são comparadas sobre um corpus comum pela ferramenta verificar:escrita.';

-- ─── O documento: uma travessia só, e listas fechadas ────────────────────
--
-- A versão anterior percorria o documento quatro vezes por gravação (duas
-- dentro de `tipos_do_documento`, uma para o nível de título, uma para os
-- endereços). Agora é UMA travessia, com todas as recusas resolvidas por nó.
--
-- E as listas de nó e de marca passam a ser SEPARADAS: antes eram um conjunto
-- só, então uma marca chamada `paragraph` — nome de nó — era aceita.

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
                        'text'
                      ])
                   then 'nó fora do vocabulário'
                 -- `h1` deixa de ser representável AQUI. O título do Post é da
                 -- página, e dois `h1` por página é o defeito que a Story 2.3
                 -- existe para não repetir.
                 when (t.n ->> 'type') = 'heading'
                      and coalesce(t.n #>> '{attrs,level}', '') <> all (array['2', '3'])
                   then 'título de nível fora do schema'
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
                        'link'
                      ])
                   then 'marca fora do vocabulário'
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
  'Lista de PERMISSÃO: nó, marca, nível de título e esquema de endereço, todos comparados por igualdade com src/domain/blog/schema.js pela ferramenta verificar:escrita. Uma travessia por gravação.';

-- ─── O HTML: etiqueta, forma da região de atributos, NOME e endereço ─────

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
    -- (4) NOME DE ATRIBUTO na lista de permissão: os oito que o renderizador
    -- emite. `style`, `onclick`, `srcdoc`, `xlink:href` caem por não estarem.
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
               'data-linguagem'
             ])
    )
    -- (5) todo endereço declarado passa pela lista de permissão de esquemas.
    and not exists (
      select 1 from pares
       where pares.nome = 'href'
         and not public.endereco_do_post_e_permitido(pares.valor)
    )
    -- (6) as duas etiquetas que o critério de aceite nomeia, por extenso.
    -- Redundante com (2) de propósito: a asserção que as nomeia sobrevive a
    -- alguém alargar a lista de etiquetas.
    and coalesce(html, '') !~* '<[[:space:]]*script'
    and coalesce(html, '') !~* '<[[:space:]]*iframe';
$fn$;

comment on function public.html_do_post_e_seguro(text) is
  'Lista de PERMISSÃO: etiqueta, forma da região de atributos, nome de atributo e esquema de endereço, todos comparados por igualdade com src/render/blog/paraHtml.js pela ferramenta verificar:escrita. Não sanea — recusa.';

-- ─── As restrições, revalidadas ──────────────────────────────────────────

alter table public.posts drop constraint if exists posts_conteudo_no_vocabulario;
alter table public.posts add constraint posts_conteudo_no_vocabulario
  check (public.documento_do_post_e_permitido(conteudo));

alter table public.posts drop constraint if exists posts_conteudo_html_seguro;
alter table public.posts add constraint posts_conteudo_html_seguro
  check (public.html_do_post_e_seguro(conteudo_html));

-- ─── O que a versão anterior deixou para trás ────────────────────────────
--
-- `tipos_do_documento` juntava nó e marca num conjunto só, e a travessia única
-- acima a torna desnecessária. `endereco_e_executavel` era a lista de
-- proibição que `endereco_do_post_e_permitido` substitui. Deixar as duas vivas
-- seria deixar duas listas paralelas para a próxima pessoa confundir com as
-- vigentes.

drop function if exists public.tipos_do_documento(jsonb);
drop function if exists public.endereco_e_executavel(text);

-- ─── As funções saem da API pública ──────────────────────────────────────

do $$
declare
  f text;
  papel text;
begin
  foreach f in array array[
    'public.nos_do_documento(jsonb)',
    'public.endereco_do_post_e_permitido(text)',
    'public.documento_do_post_e_permitido(jsonb)',
    'public.html_do_post_e_seguro(text)'
  ] loop
    execute format('revoke execute on function %s from public', f);
    foreach papel in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = papel) then
        execute format('revoke execute on function %s from %I', f, papel);
      end if;
    end loop;
    foreach papel in array array['postgres', 'service_role'] loop
      if exists (select 1 from pg_roles where rolname = papel) then
        execute format('grant execute on function %s to %I', f, papel);
      end if;
    end loop;
  end loop;
end $$;
