-- Referência de caractere HTML no endereço: a última evasão da lista de permissão.
--
-- Story 2.5 — correções da segunda revisão. Migração nova, não edição de aplicada.
--
-- ─── O que passava, medido contra o projeto ───────────────────────────────
--
--   EVADIU  <a href="&#106;avascript:alert(1)">        decimal
--   EVADIU  <a href="&#0000106;avascript:...">        decimal com zeros
--   EVADIU  <a href="&#x6a;avascript:alert(1)">       hexadecimal
--   EVADIU  <a href="&#106avascript:alert(1)">        sem ponto e vírgula
--   EVADIU  <a href="java&#9;script:alert(1)">        tabulação codificada
--   EVADIU  <a href="javascript&colon;alert(1)">      nomeada
--   EVADIU  as mesmas formas dentro de `conteudo`, na marca de link
--
-- O navegador decodifica a referência de caractere no valor do atributo ANTES
-- de resolver o esquema do endereço. Então `&#106;avascript:` é `javascript:`
-- para ele — e era um caminho relativo inofensivo para a restrição e para
-- `enderecoPermitido`. Nenhum dos dois lados decodificava antes de testar, e a
-- lista de permissão de esquemas, por completa que fosse, olhava para o texto
-- errado.
--
-- ─── A correção ──────────────────────────────────────────────────────────
--
-- Decodificar em SQL, espelhando `decodificarEntidades` de
-- `src/domain/blog/schema.js` caractere por caractere. Não é a alternativa mais
-- barata — recusar `&#` cru em atributo de endereço seria uma linha —, e é a
-- escolhida por duas razões:
--
--   1. `&colon;` e `&Tab;` não contêm `&#`, e recusar `&#` deixaria as duas
--      formas nomeadas passando. Recusar TODO `&` não serve: o renderizador
--      escapa `&` como `&amp;`, e um endereço legítimo com parâmetros
--      (`/x?a=1&amp;b=2`) tem de continuar passando.
--   2. As duas implementações de "endereço permitido" são comparadas por
--      igualdade sobre um corpus na ferramenta `verificar:escrita`. Uma regra
--      mais dura no banco quebraria a comparação — e é ela que impede as duas de
--      divergirem em silêncio, que foi como esta evasão sobreviveu.
--
-- UMA passagem, como o navegador: `&amp;#106;` é o TEXTO `&#106;`, e não a letra
-- `j`. Decodificar em laço recusaria endereço legítimo que navegador nenhum
-- interpretaria.
--
-- ─── E, no HTML, uma trava a mais ────────────────────────────────────────
--
-- O valor de atributo do HTML derivado tem uma propriedade conhecida: o
-- renderizador escapa `&` como `&amp;`, então **todo `&` num valor de atributo
-- começa uma das quatro sequências que ele emite** (`&amp;`, `&lt;`, `&gt;`,
-- `&quot;`). Qualquer outra sequência com `&` não saiu dele. A cláusula (7)
-- abaixo cobra isso, e é deliberadamente mais dura que o schema: ela recusa
-- referência de caractere em atributo NENHUM, não só em endereço. É tripwire
-- sobre saída conhecida, e é a que continuaria valendo se a lista de entidades
-- nomeadas ficasse incompleta.
--
-- Idempotente: reaplicar em banco já migrado termina sem erro.

-- ─── O caractere de um ponto de código ───────────────────────────────────
--
-- Espelho de `caractereDoPonto`. Ponto zero, substituto isolado
-- (0xD800–0xDFFF) e valor acima do teto do Unicode não têm caractere: devolvem
-- NADA, exatamente como o lado JavaScript. Os dois precisam concordar até no
-- caso inválido, senão `htt&#99999999999;ps://x.com` daria vereditos
-- diferentes nos dois lados — e a comparação por corpus existe para pegar isso.

create or replace function public.caractere_do_ponto(ponto bigint)
  returns text
  language sql
  immutable
  parallel safe
  set search_path = ''
as $fn$
  select case
    when ponto is null then ''
    when ponto <= 0 or ponto > 1114111 then ''
    when ponto between 55296 and 57343 then ''
    else chr(ponto::int)
  end;
$fn$;

comment on function public.caractere_do_ponto(bigint) is
  'Espelho de caractereDoPonto de src/domain/blog/schema.js. Ponto inválido devolve string vazia, para os dois lados concordarem até no caso inválido.';

-- ─── A decodificação, uma passagem ───────────────────────────────────────

create or replace function public.decodificar_entidades(texto text)
  returns text
  language plpgsql
  immutable
  parallel safe
  set search_path = ''
as $fn$
declare
  /* A lista de referências NOMEADAS que resolvem para ASCII. Só estas importam,
     e a razão é decisiva: nenhuma referência nomeada do HTML resolve para letra
     ou dígito ASCII, então as letras de `javascript` só podem vir de referência
     NUMÉRICA — decodificada por inteiro abaixo. O que as nomeadas produzem é
     pontuação e espaço em branco, e é aí que mora a evasão (`&colon;`, `&Tab;`).
     Comparada por igualdade com ENTIDADES_ASCII pela ferramenta de verificação. */
  nomes_de_entidade text[] := array[
    'Tab', 'NewLine', 'excl', 'quot', 'QUOT', 'num', 'dollar', 'percnt',
    'amp', 'AMP', 'apos', 'lpar', 'rpar', 'ast', 'midast', 'plus', 'comma',
    'period', 'sol', 'colon', 'semi', 'lt', 'LT', 'equals', 'gt', 'GT',
    'quest', 'commat', 'lsqb', 'lbrack', 'bsol', 'rsqb', 'rbrack', 'Hat',
    'lowbar', 'UnderBar', 'grave', 'DiacriticalGrave', 'lcub', 'lbrace',
    'verbar', 'vert', 'VerticalLine', 'rcub', 'rbrace', 'nbsp',
    'NonBreakingSpace'
  ];
  valores_de_entidade text[] := array[
    chr(9), chr(10), '!', '"', '"', '#', '$', '%',
    '&', '&', '''', '(', ')', '*', '*', '+', ',',
    '.', '/', ':', ';', '<', '<', '=', '>', '>',
    '?', '@', '[', '[', chr(92), ']', ']', '^',
    '_', '_', '`', '`', '{', '{',
    '|', '|', '|', '}', '}', chr(32),
    chr(32)
  ];
  entrada text := coalesce(texto, '');
  saida text := '';
  achado text[];
  corpo text;
  pos int;
  digitos text;
  indice int;
  substituto text;
begin
  loop
    achado := regexp_match(
      entrada,
      '&(#[0-9]{1,32};?|#[xX][0-9a-fA-F]{1,32};?|[a-zA-Z][a-zA-Z0-9]{0,31};?)'
    );
    exit when achado is null;
    corpo := achado[1];
    -- `regexp_match` devolve o casamento MAIS À ESQUERDA, e o próprio texto
    -- casado começa com `&`, então a primeira ocorrência dele é o casamento.
    pos := strpos(entrada, '&' || corpo);
    exit when pos = 0;

    saida := saida || substr(entrada, 1, pos - 1);
    entrada := substr(entrada, pos + length(corpo) + 1);

    if left(corpo, 2) in ('#x', '#X') then
      digitos := ltrim(rtrim(substr(corpo, 3), ';'), '0');
      if digitos = '' or length(digitos) > 6 then
        substituto := '';
      else
        substituto := public.caractere_do_ponto(
          ('x' || lpad(digitos, 16, '0'))::bit(64)::bigint
        );
      end if;
    elsif left(corpo, 1) = '#' then
      digitos := ltrim(rtrim(substr(corpo, 2), ';'), '0');
      if digitos = '' or length(digitos) > 7 then
        substituto := '';
      else
        substituto := public.caractere_do_ponto(digitos::bigint);
      end if;
    else
      indice := array_position(nomes_de_entidade, rtrim(corpo, ';'));
      -- Nome desconhecido fica como está: `?a=1&bloco=2` não é entidade.
      substituto := case
        when indice is null then '&' || corpo
        else valores_de_entidade[indice]
      end;
    end if;

    saida := saida || substituto;
  end loop;
  return saida || entrada;
end;
$fn$;

comment on function public.decodificar_entidades(text) is
  'Espelho de decodificarEntidades de src/domain/blog/schema.js: uma passagem, como o navegador. As duas são comparadas sobre um corpus pela ferramenta verificar:escrita.';

-- ─── O endereço, testado sobre o valor DECODIFICADO ──────────────────────
--
-- A decodificação vem primeiro, e a ordem é o ponto: decodificar depois de
-- cortar espaços, ou depois de testar o esquema, deixaria `&#9;` e `&#106;`
-- atravessarem exatamente como atravessavam.

create or replace function public.endereco_do_post_e_permitido(endereco text)
  returns boolean
  language sql
  immutable
  parallel safe
  set search_path = ''
as $fn$
  with e as (select btrim(public.decodificar_entidades(coalesce(endereco, ''))) as v)
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
  'Espelho em SQL de enderecoPermitido de src/domain/blog/schema.js: decodifica a referência de caractere e só então aplica a lista de PERMISSÃO de esquemas. As duas são comparadas sobre um corpus pela ferramenta verificar:escrita.';

-- ─── O HTML: a cláusula (7), sobre a forma canônica do valor ─────────────

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
  'Lista de PERMISSÃO: etiqueta, forma da região de atributos, nome de atributo, esquema de endereço decodificado e forma canônica do valor (todo & começa uma das quatro sequências que o renderizador emite). Não sanea — recusa.';

-- ─── As restrições, revalidadas sobre as linhas existentes ───────────────

alter table public.posts drop constraint if exists posts_conteudo_no_vocabulario;
alter table public.posts add constraint posts_conteudo_no_vocabulario
  check (public.documento_do_post_e_permitido(conteudo));

alter table public.posts drop constraint if exists posts_conteudo_html_seguro;
alter table public.posts add constraint posts_conteudo_html_seguro
  check (public.html_do_post_e_seguro(conteudo_html));

-- ─── As funções novas saem da API pública ────────────────────────────────

do $$
declare
  f text;
  papel text;
begin
  foreach f in array array[
    'public.caractere_do_ponto(bigint)',
    'public.decodificar_entidades(text)'
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
