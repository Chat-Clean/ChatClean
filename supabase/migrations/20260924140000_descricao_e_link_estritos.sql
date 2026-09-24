-- ═══════════════════════════════════════════════════════════════════════════
-- Story 5.2 (revisão): Descrição e Link de Candidatura estritos.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A revisão da Story 5.2 achou quatro folgas nas regras que
-- `20260924120000_vagas_e_classificacoes.sql` pôs no banco. Esta migração as
-- fecha, e só toca objetos criados NESTE épico:
--
--   * o esquema do link da Descrição (documento e HTML) passa a exigir HOST:
--     `https:relativo`, `http:/x` e `https:///x` tinham o esquema certo e eram
--     endereço relativo disfarçado. Agora vale `^(https?://<host>|mailto:)`,
--     sem caixa, sobre o valor decodificado (`public.descricao_da_vaga_e_permitida`
--     e `public.html_da_descricao_e_reduzido`, por `create or replace`);
--   * o HTML reduzido passa a ler atributo SÓ de dentro das etiquetas (um
--     `href="/x"` no texto não é link), recusa atributo fora de aspas duplas (o
--     renderizador único só emite aspas duplas) e tem LISTA DE PERMISSÃO de
--     atributo por etiqueta: `a` com href, target, rel e title; `ol` com start
--     e type; as demais, nenhum. São exatamente os que `src/render/blog/paraHtml.js`
--     emite para os nós da projeção;
--   * o Link de Candidatura (`vagas_link_de_candidatura_valido`) passa a ter
--     esquema sem caixa, `//` com host, e nenhum controle (C0 e C1) nem espaço
--     Unicode, espelho de `linkDeCandidaturaValido`;
--   * o invariante da Aberta (`vagas_aberta_completa`) decodifica as entidades
--     do texto sem etiquetas ANTES de exigir um caractere que não é espaço:
--     `<p>&nbsp;</p>` e `<p>&#32;</p>` não contam como Descrição preenchida.
--
-- ─── O CONJUNTO DE ESPAÇO É ESCRITO, NÃO HERDADO DO LOCALE ─────────────────
--
-- `[:space:]` e `[:cntrl:]` dependem do locale do banco para tudo que passa de
-- 0x7F: no locale C, NBSP (U+00A0) não é espaço e os controles C1 (U+0080 a
-- U+009F) não são controle. O JavaScript (`\s` com `u`) considera NBSP espaço.
-- Para os dois lados concordarem em qualquer locale, o conjunto do `\s` do
-- JavaScript é listado caractere a caractere, ao lado das classes:
--
--   U+00A0, U+1680, U+2000 a U+200A, U+2028, U+2029, U+202F, U+205F, U+3000,
--   U+FEFF, e (só no link) U+007F a U+009F.
--
-- ─── ORDEM DAS MIGRAÇÕES ─────────────────────────────────────────────────────
--
-- Reaplicar `20260924120000_vagas_e_classificacoes.sql` ISOLADAMENTE, depois
-- desta, recriaria a busca antiga (a de CTE, corrigida em 20260924130000) e os
-- dois espelhos da Descrição na forma frouxa, e o `create table if not exists`
-- não traria de volta as restrições antigas, mas também não as de cá. A
-- garantia é a ORDEM: o aplicador roda as migrações por carimbo, e a mais nova
-- vence. Nenhuma migração aplicada é reescrita; a correção vem aqui.
--
-- Idempotente: `create or replace` nas funções (mesma assinatura, então os
-- privilégios de execução concedidos em 20260924120000 são preservados) e
-- `drop constraint if exists` seguido de `add constraint` nas restrições.

-- ─── O espelho do DOCUMENTO da Descrição ────────────────────────────────────
--
-- Igual ao de 20260924120000 em tudo, menos o item (5): o esquema do link.

create or replace function public.descricao_da_vaga_e_permitida(doc jsonb)
  returns boolean
  language sql
  immutable
  parallel safe
  set search_path = ''
as $fn$
  select case
    when doc is null then false
    when jsonb_typeof(doc) <> 'object' then false
    when doc ->> 'type' is distinct from 'doc' then false
    else not exists (
      select 1
        from public.nos_do_documento(doc) as t(n)
             cross join lateral (
               select case
                 when jsonb_typeof(t.n) <> 'object'
                   then 'valor solto onde um nó deveria estar'
                 -- (1) O NÓ está na projeção.
                 when coalesce(t.n ->> 'type', '') <> all (array[
                        'doc',
                        'paragraph',
                        'heading',
                        'bulletList',
                        'orderedList',
                        'listItem',
                        'text',
                        'hardBreak'
                      ])
                   then 'nó fora da projeção'
                 when (t.n -> 'attrs') is not null
                      and jsonb_typeof(t.n -> 'attrs') not in ('object', 'null')
                   then 'atributos fora de forma'
                 -- (2) Cada ATRIBUTO do nó está na lista do nó. Parágrafo não
                 -- tem nenhum (é aqui que `textAlign` cai), título só `level`.
                 when exists (
                   select 1
                     from jsonb_object_keys(
                            case when jsonb_typeof(t.n -> 'attrs') = 'object'
                                 then t.n -> 'attrs'
                                 else '{}'::jsonb end
                          ) as chave
                    where chave <> all (
                            case t.n ->> 'type'
                              when 'heading' then array['level']
                              when 'orderedList' then array['start', 'type']
                              else array[]::text[]
                            end
                          )
                 )
                   then 'atributo de nó fora da projeção'
                 else null
               end as problema
               union all
               select case
                 when jsonb_typeof(marca) <> 'object'
                   then 'valor solto onde uma marca deveria estar'
                 -- (3) A MARCA está na projeção.
                 when coalesce(marca ->> 'type', '') <> all (array[
                        'bold',
                        'italic',
                        'link'
                      ])
                   then 'marca fora da projeção'
                 when (marca -> 'attrs') is not null
                      and jsonb_typeof(marca -> 'attrs') not in ('object', 'null')
                   then 'atributos de marca fora de forma'
                 -- (4) Cada ATRIBUTO da marca está na lista da marca.
                 when exists (
                   select 1
                     from jsonb_object_keys(
                            case when jsonb_typeof(marca -> 'attrs') = 'object'
                                 then marca -> 'attrs'
                                 else '{}'::jsonb end
                          ) as chave
                    where chave <> all (
                            case marca ->> 'type'
                              when 'link' then array['href', 'target', 'rel', 'title', 'class']
                              else array[]::text[]
                            end
                          )
                 )
                   then 'atributo de marca fora da projeção'
                 -- (5) O ESQUEMA do link, COM HOST, sobre o valor DECODIFICADO
                 -- (a mesma ordem de `enderecoPermitidoNaDescricao`): http ou
                 -- https seguidos de `//` e de um caractere que não é barra nem
                 -- espaço, ou mailto. Sem caixa. `https:x`, `http:/x`,
                 -- `https:///x`, relativo e `tel:` ficam de fora.
                 when (marca ->> 'type') = 'link'
                      and btrim(public.decodificar_entidades(
                            coalesce(marca #>> '{attrs,href}', '')
                          )) !~* '^(https?://[^/[:space:]   -     　﻿]|mailto:)'
                   then 'esquema de link fora da projeção'
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

comment on function public.descricao_da_vaga_e_permitida(jsonb) is
  'Lista de PERMISSÃO da projeção reduzida da Descrição da Vaga: nó, atributo de nó, marca, atributo de marca e esquema de link COM HOST (http:// ou https:// seguidos de host, ou mailto:, sem caixa, sobre o valor decodificado). Recorta o que documento_do_post_e_permitido já aceitou; as listas são comparadas com VOCABULARIO_DA_DESCRICAO por verificar:carreiras.';

-- ─── O espelho do HTML da Descrição ─────────────────────────────────────────
--
-- O renderizador único escapa `&`, `<`, `>` e `"` no texto e nos valores de
-- atributo, e só emite atributo entre aspas duplas. Então, no HTML canônico,
-- `<` e `>` só existem delimitando etiqueta, e é sobre isso que esta leitura
-- se apoia:
--
--   * toda etiqueta é `<nome …>` ou `</nome>`, e todo `<` abre uma delas;
--   * o nome está na lista da projeção;
--   * a de fechamento não tem nada depois do nome; a de abertura só tem
--     atributos na forma ` nome="valor"` (aspas simples, sem aspas e atributo
--     sem valor reprovam);
--   * o NOME de cada atributo está na lista da etiqueta, e o atributo é lido
--     de DENTRO da etiqueta, nunca do texto;
--   * o `href` tem o esquema da projeção, com host.

create or replace function public.html_da_descricao_e_reduzido(html text)
  returns boolean
  language sql
  immutable
  parallel safe
  set search_path = ''
as $fn$
  with entrada as (
    select coalesce(html, '') as bruto
  ),
  tags as (
    select lower(m[2]) as etiqueta, m[1] = '/' as fecha, m[3] as resto
      from entrada
           cross join lateral regexp_matches(
             entrada.bruto,
             '<(/?)([a-zA-Z][a-zA-Z0-9]*)([^<>]*)>',
             'g'
           ) as m
  ),
  pares as (
    select tags.etiqueta, lower(p[1]) as nome, p[2] as valor
      from tags
           cross join lateral regexp_matches(
             tags.resto,
             ' ([a-zA-Z][a-zA-Z0-9-]*)="([^"]*)"',
             'g'
           ) as p
     where not tags.fecha
  )
  select
    html is not null
    -- Todo `<` abre uma etiqueta reconhecida: nada se esconde fora da contagem.
    and (select count(*) from tags)
        = (length((select bruto from entrada))
           - length(replace((select bruto from entrada), '<', '')))
    -- A ETIQUETA está na projeção: sem citação, código, linha, imagem, destaque.
    and not exists (
      select 1 from tags
       where tags.etiqueta <> all (array[
               'p','h2','h3','strong','em','ul','ol','li','a','br'
             ])
    )
    -- A FORMA da etiqueta: fechamento nu, abertura só com ` nome="valor"`.
    and not exists (
      select 1 from tags
       where (tags.fecha and tags.resto <> '')
          or (not tags.fecha
              and tags.resto !~ '^( [a-zA-Z][a-zA-Z0-9-]*="[^"]*")*$')
    )
    -- O ATRIBUTO está na lista da etiqueta.
    and not exists (
      select 1 from pares
       where pares.nome <> all (
               case pares.etiqueta
                 when 'a' then array['href', 'target', 'rel', 'title']
                 when 'ol' then array['start', 'type']
                 else array[]::text[]
               end
             )
    )
    -- E o link emitido tem o esquema da projeção, com host.
    and not exists (
      select 1 from pares
       where pares.etiqueta = 'a'
         and pares.nome = 'href'
         and btrim(public.decodificar_entidades(pares.valor))
             !~* '^(https?://[^/[:space:]   -     　﻿]|mailto:)'
    );
$fn$;

comment on function public.html_da_descricao_e_reduzido(text) is
  'Lista de PERMISSÃO do HTML da Descrição da Vaga: etiqueta (p, h2, h3, strong, em, ul, ol, li, a, br), forma da etiqueta (atributo só entre aspas duplas), atributo por etiqueta (a: href, target, rel, title; ol: start, type; demais: nenhum), lido só de dentro da etiqueta, e esquema do href com host (http://, https://, mailto:). Recorta o que html_do_post_e_seguro já aceitou; comparada com o renderizador único por verificar:carreiras. Não saneia, recusa.';

-- ─── O Link de Candidatura ──────────────────────────────────────────────────
--
-- Espelho de `linkDeCandidaturaValido` (`src/domain/carreiras/vaga.js`):
-- esquema http ou https sem caixa, `//`, primeiro caractere do host que não é
-- barra, e nenhum controle nem espaço do começo ao fim, até 2048 caracteres.

alter table public.vagas drop constraint if exists vagas_link_de_candidatura_valido;
alter table public.vagas add constraint vagas_link_de_candidatura_valido
  check (
    link_de_candidatura is null
    or (
      char_length(link_de_candidatura) <= 2048
      and link_de_candidatura
          ~* '^https?://[^/[:space:][:cntrl:]\u007f-\u009f   -     　﻿][^[:space:][:cntrl:]\u007f-\u009f   -     　﻿]*$'
    )
  );

-- ─── O invariante da Aberta ─────────────────────────────────────────────────
--
-- Espelho de `problemasParaAbrir`. Descrição "não vazia" é: HTML sem as
-- etiquetas, com as entidades DECODIFICADAS, com ao menos um caractere que
-- não é espaço. "Não é espaço" é o mesmo conjunto do `\s` do JavaScript, e
-- vale também para o Resumo e a Localização, que o domínio mede com `\S`.

alter table public.vagas drop constraint if exists vagas_aberta_completa;
alter table public.vagas add constraint vagas_aberta_completa
  check (
    estado <> 'aberta'
    or (
      modalidade is not null
      and resumo ~ '[^[:space:]   -     　﻿]'
      and public.decodificar_entidades(regexp_replace(descricao_html, '<[^>]*>', '', 'g'))
          ~ '[^[:space:]   -     　﻿]'
      and link_de_candidatura is not null
      and (
        modalidade = 'remoto'
        or localizacao ~ '[^[:space:]   -     　﻿]'
      )
    )
  );

-- ─── Quem decide o que é público ────────────────────────────────────────────
--
-- `20260924120000` chama a política `vagas_leitura_anonima` de "a ÚNICA
-- guardiã". Ela é a única para a leitura DIRETA da tabela; as duas funções de
-- entrega (`situacao_da_vaga`, `vagas_abertas`) são `security definer`, a
-- política não se aplica dentro delas, e por necessidade elas repetem o mesmo
-- predicado (`estado = 'aberta'`). A ferramenta verificar:carreiras confere,
-- em transação desfeita e para anon e authenticated, que a política e as duas
-- funções só entregam Aberta. O comentário da tabela passa a dizer isso.

comment on table public.vagas is
  'Vagas de Carreiras. Pública só quando Aberta: a política vagas_leitura_anonima decide a leitura direta, e as funções de entrega security definer (situacao_da_vaga, vagas_abertas) repetem o mesmo predicado por necessidade, conferido por verificar:carreiras. Escrita só pela função de servidor.';

notify pgrst, 'reload schema';
