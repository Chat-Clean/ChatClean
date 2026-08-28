-- A segunda linha de defesa: o banco recusa conteúdo perigoso por QUALQUER via.
--
-- Story 2.5 — Escrita pela função única, com higienização no servidor.
--
-- Migração nova, não edição de aplicada: migração já aplicada é registro
-- histórico, e o aplicador compara o que está registrado com o arquivo e acusa
-- divergência.
--
-- ─── Por que a defesa é dupla, e por que isso não é redundância ───────────
--
-- O critério de aceite diz "por qualquer via — Painel, script, console do
-- Supabase ou chamada direta à API". A função de escrita cobre as vias que
-- passam por ela. O console do projeto, por definição, não passa: ele fala com
-- o banco com privilégio de serviço, e privilégio de serviço ignora RLS e
-- ignora política. Uma garantia que depende de todo mundo usar a porta da
-- frente não é garantia.
--
-- Esta migração é o que torna a frase verdadeira. E ela é barata, porque o
-- vocabulário permitido já está declarado uma vez, em
-- `src/domain/blog/schema.js` — as listas abaixo são a MESMA lista, e a
-- ferramenta `verificar:escrita` compara as duas por igualdade nos dois
-- sentidos. Acrescentar um nó ao schema sem acrescentá-lo aqui falha; o
-- contrário também.
--
-- ─── Sobre "não existe filtro de HTML por string em lugar nenhum" ─────────
--
-- A arquitetura proíbe SANEAR HTML por string — pegar HTML sujo e tentar
-- limpá-lo com expressões regulares, que é a técnica que nunca funcionou. Não
-- é o que acontece aqui: nada nesta migração transforma conteúdo. Ela RECUSA a
-- linha inteira, e recusa porque o único produtor legítimo de `conteudo_html` é
-- o renderizador único, cujo vocabulário de saída é fechado e conhecido. É uma
-- tripwire sobre uma saída conhecida, não um sanitizador sobre entrada
-- arbitrária. Se ela disparar pelo caminho da função, é sinal de que a
-- validação e a restrição divergiram — e é para isso que ela existe.
--
-- Idempotente: reaplicar em banco já migrado termina sem erro.

-- ─── A travessia do documento ────────────────────────────────────────────
--
-- Percorre o documento pelo eixo que o schema define para estrutura —
-- `content` — e devolve cada nó. Os três predicados abaixo se apoiam nela.
--
-- A travessia segue SÓ esse eixo, e essa precisão é o ponto: um
-- `jsonb_path_query(doc, 'strict $.**.type')` seria uma linha em vez de doze e
-- estaria errado, porque `type` também é ATRIBUTO de lista ordenada
-- (`attrs.type` vale '1', 'a', 'A', 'i' ou 'I') — e um artigo legítimo com
-- lista alfabética seria recusado.
--
-- `union all` recursivo, e não recursão de função: a profundidade de um
-- documento vindo de fora não é conhecida, e uma função recursiva teria pilha
-- finita onde esta tem só memória.

create or replace function public.nos_do_documento(doc jsonb)
  returns setof jsonb
  language sql
  immutable
  parallel safe
  set search_path = ''
as $fn$
  with recursive no as (
    select doc as n
    union all
    select filho
      from no
           cross join lateral jsonb_array_elements(
             case when jsonb_typeof(no.n -> 'content') = 'array'
                  then no.n -> 'content'
                  else '[]'::jsonb end
           ) as filho
     where jsonb_typeof(no.n) = 'object'
  )
  select no.n from no;
$fn$;

comment on function public.nos_do_documento(jsonb) is
  'Cada nó de um documento de Post, pelo eixo content. Base dos predicados de integridade do conteúdo (Story 2.5).';

-- ─── Os nomes de nó e de marca que um documento contém ───────────────────

create or replace function public.tipos_do_documento(doc jsonb)
  returns setof text
  language sql
  immutable
  parallel safe
  set search_path = ''
as $fn$
  -- Entrada que não é objeto vira um nome que NENHUMA lista contém, em vez de
  -- ser ignorada: `content: ["texto solto"]` não é documento, e passar por
  -- omissão seria o buraco mais fácil de esquecer.
  select case when jsonb_typeof(t.n) = 'object'
              then t.n ->> 'type'
              else '(nao-objeto:' || jsonb_typeof(t.n) || ')' end
    from public.nos_do_documento(doc) as t(n)
  union all
  select case when jsonb_typeof(marca) = 'object'
              then marca ->> 'type'
              else '(nao-objeto:' || jsonb_typeof(marca) || ')' end
    from public.nos_do_documento(doc) as t(n)
         cross join lateral jsonb_array_elements(
           case when jsonb_typeof(t.n -> 'marks') = 'array'
                then t.n -> 'marks'
                else '[]'::jsonb end
         ) as marca
   where jsonb_typeof(t.n) = 'object';
$fn$;

comment on function public.tipos_do_documento(jsonb) is
  'Nomes de nó e de marca de um documento de Post, pelos eixos content e marks. Base da restrição posts_conteudo_no_vocabulario.';

-- ─── Endereço executável ─────────────────────────────────────────────────
--
-- Só os três esquemas que EXECUTAM, que são os que o critério de aceite nomeia.
-- Não é o espelho de `enderecoPermitido` do schema — aquele é uma lista de
-- permissão e mora num lugar só. Este é a tripwire: recusa o que roda.
--
-- Espaço, quebra de linha e caractere de controle saem ANTES do teste, porque
-- `java\nscript:` é a evasão clássica: o navegador os ignora e o teste ingênuo
-- os enxerga como parte do nome do esquema.

create or replace function public.endereco_e_executavel(endereco text)
  returns boolean
  language sql
  immutable
  parallel safe
  set search_path = ''
as $fn$
  select endereco is not null
     and regexp_replace(endereco, '[[:space:][:cntrl:]]', '', 'g')
         ~* '^(javascript|vbscript|data):';
$fn$;

comment on function public.endereco_e_executavel(text) is
  'O endereço executa (javascript:, vbscript:, data:), ignorando espaço e caractere de controle usados para evasão.';

-- ─── O documento só contém o que o schema permite ────────────────────────
--
-- Três recusas, cada uma correspondendo a uma decisão que o schema fechado toma
-- e que, sem esta migração, valeria apenas para quem passasse pela função:
--
--   1. VOCABULÁRIO. A lista é a de `src/domain/blog/schema.js`: os onze nós
--      (`NOS_PERMITIDOS`, estruturais inclusive) e as três marcas
--      (`MARCAS_PERMITIDAS`).
--   2. NÍVEL DE TÍTULO. `heading` existe no vocabulário, mas só em nível 2 e 3
--      (`NIVEIS_DE_TITULO`). Sem esta linha, `h1` entraria pelo console — e
--      `h1` é justamente o que a Story 2.3 recusa estilizar, porque o título do
--      Post é da página e dois `h1` por página é o defeito que o site tem hoje.
--   3. ENDEREÇO EXECUTÁVEL, em atributo de nó ou de marca. É o item que o
--      critério de aceite nomeia junto de `<script>` e `<iframe>`, e sem ele um
--      `javascript:` gravado direto em `conteudo` ficaria no banco.
--
-- `'{}'::jsonb` é aceito de propósito: é o padrão da coluna, o Post que ainda
-- não tem nada escrito. Fora desse caso a raiz precisa ser `doc`.

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
    when doc ->> 'type' is distinct from 'doc' then false
    else
      -- (1) vocabulário
      not exists (
        select 1
          from public.tipos_do_documento(doc) as t
         where t is null
            or t <> all (array[
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
                 'bold',
                 'italic',
                 'link'
               ])
      )
      -- (2) nível de título
      and not exists (
        select 1
          from public.nos_do_documento(doc) as t(n)
         where jsonb_typeof(t.n) = 'object'
           and t.n ->> 'type' = 'heading'
           and coalesce(t.n #>> '{attrs,level}', '') <> all (array['2', '3'])
      )
      -- (3) endereço executável, em nó ou em marca
      and not exists (
        select 1
          from public.nos_do_documento(doc) as t(n)
               cross join lateral (
                 select t.n #>> '{attrs,href}' as endereco
                 union all
                 select marca #>> '{attrs,href}'
                   from jsonb_array_elements(
                          case when jsonb_typeof(t.n -> 'marks') = 'array'
                               then t.n -> 'marks'
                               else '[]'::jsonb end
                        ) as marca
               ) as enderecos
         where public.endereco_e_executavel(enderecos.endereco)
      )
  end;
$fn$;

comment on function public.documento_do_post_e_permitido(jsonb) is
  'O documento contém apenas o vocabulário do schema fechado de src/domain/blog/schema.js, título só em nível 2 e 3, e nenhum endereço executável. As listas são comparadas com o schema por igualdade pela ferramenta verificar:escrita.';

-- ─── O HTML derivado não contém nada executável ──────────────────────────
--
-- Quatro recusas, cada uma nomeada pelo critério de aceite:
--
--   1. ETIQUETA fora do vocabulário do renderizador. É a recusa mais ampla, e
--      é ela que pega `<script`, `<iframe`, `<object`, `<embed`, `<svg`,
--      `<form` e qualquer coisa que ainda não foi inventada. O renderizador
--      único emite exatamente catorze elementos; qualquer outro no valor da
--      coluna significa que o valor não saiu dele.
--   2. `<script` e `<iframe` ditos POR EXTENSO. Redundante com (1) de
--      propósito: são os dois que o critério de aceite nomeia, e uma asserção
--      que os nomeia sobrevive a alguém alargar a lista de etiquetas.
--   3. ATRIBUTO DE EVENTO (`onclick=`, `onerror=`, …) dentro de uma etiqueta.
--      A âncora `<[a-zA-Z][^>]*` é o que impede o falso positivo que
--      importa: um artigo sobre desenvolvimento web escreve `onclick=` no
--      texto e num bloco de código, e ali o `<` já saiu escapado como `&lt;`.
--   4. ENDEREÇO EXECUTÁVEL em atributo de endereço — `javascript:`,
--      `vbscript:`, `data:`. Ancorado na etiqueta pelo mesmo motivo.
--
-- `''` (o padrão da coluna) passa por todas: string vazia não tem etiqueta.

create or replace function public.html_do_post_e_seguro(html text)
  returns boolean
  language sql
  immutable
  parallel safe
  set search_path = ''
as $fn$
  select html is not null
     -- (1) etiqueta fora do vocabulário do renderizador único
     and not exists (
       select 1
         from regexp_matches(
                html,
                '<[[:space:]]*/?[[:space:]]*([a-zA-Z][a-zA-Z0-9]*)',
                'g'
              ) as achado
        where lower(achado[1]) <> all (array[
                'p','h2','h3','strong','em','ul','ol','li',
                'a','blockquote','pre','code','hr','br'
              ])
     )
     -- (2) as duas etiquetas que o critério de aceite nomeia
     and html !~* '<[[:space:]]*script'
     and html !~* '<[[:space:]]*iframe'
     -- (3) atributo de evento dentro de uma etiqueta
     and html !~* '<[a-zA-Z][^>]*[[:space:]]on[a-zA-Z]+[[:space:]]*='
     -- (4) endereço executável em atributo de endereço
     and html !~* '<[a-zA-Z][^>]*[[:space:]](href|src|xlink:href|action|formaction|srcdoc|data)[[:space:]]*=[[:space:]]*("|'')?[[:space:]]*(javascript|vbscript|data)[[:space:]]*:';
$fn$;

comment on function public.html_do_post_e_seguro(text) is
  'Recusa HTML com etiqueta fora do vocabulário do renderizador único, script, iframe, atributo de evento ou endereço executável. Tripwire sobre saída conhecida — não sanea, recusa.';

-- ─── As restrições ───────────────────────────────────────────────────────
--
-- É AQUI que a garantia "por qualquer via" deixa de depender de quem escreve.
-- Escrita pelo console do projeto, por script, por chamada direta à API ou por
-- qualquer detentor de chave de serviço passa por estas duas linhas.

alter table public.posts drop constraint if exists posts_conteudo_no_vocabulario;
alter table public.posts add constraint posts_conteudo_no_vocabulario
  check (public.documento_do_post_e_permitido(conteudo));

alter table public.posts drop constraint if exists posts_conteudo_html_seguro;
alter table public.posts add constraint posts_conteudo_html_seguro
  check (public.html_do_post_e_seguro(conteudo_html));

comment on column public.posts.conteudo is
  'Documento estruturado — a fonte canônica. O banco garante que é um objeto JSON e que todo nó, marca, nível de título e endereço dentro dele pertence ao vocabulário do schema fechado de src/domain/blog/schema.js (Story 2.5).';

comment on column public.posts.conteudo_html is
  'Projeção derivada do documento pelo renderizador único, gravada na mesma operação. Nunca é entrada de edição: a função de escrita ignora conteudo_html vindo do cliente. O banco recusa etiqueta fora do vocabulário do renderizador, script, iframe, atributo de evento e endereço executável (Story 2.5).';

-- ─── As funções saem da API pública ──────────────────────────────────────
--
-- Elas são predicado de restrição, não RPC. Deixá-las executáveis por `anon` e
-- `authenticated` acrescentaria rotas em `/rest/v1/rpc/…` que ninguém pediu — e
-- o linter do Supabase cobra, como cobrou pelas três da Story 2.1. O privilégio
-- de EXECUTE de um predicado de CHECK é conferido na avaliação pelo dono da
-- tabela, então revogar não desliga a restrição.

do $$
declare
  f text;
  papel text;
begin
  foreach f in array array[
    'public.nos_do_documento(jsonb)',
    'public.tipos_do_documento(jsonb)',
    'public.endereco_e_executavel(text)',
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
