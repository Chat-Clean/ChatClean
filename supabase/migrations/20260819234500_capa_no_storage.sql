-- A capa do Post: o bucket, as políticas do Storage e a restrição da coluna.
--
-- Story 3.1 — Upload de imagem para o Storage.
--
-- ─── O STORAGE É UM CADEADO DIFERENTE, E ISSO É DECLARADO AQUI ───────────
--
-- A regra do projeto — "nenhum cliente escreve no banco" — vale para as tabelas
-- sob RLS em `public`, e continua inteira: nenhuma política de escrita é criada
-- para `anon` nem para `authenticated` em `posts`, `categorias`, `tags`,
-- `posts_tags` ou `slugs_antigos`, e o privilégio continua revogado.
--
-- O ARQUIVO é outro recurso, com outro cadeado. Ele vai do navegador direto
-- para o Storage, com o JWT do Autor, e quem decide é a política de
-- `storage.objects`. Mandar um megabyte por uma função de servidor para
-- reescrever a mesma garantia com a chave de serviço tornaria a política
-- irrelevante e o envio uma viagem de duas pernas.
--
-- O que continua entrando no Post pela porta única de escrita é o **endereço**.
--
-- A varredura de `verificar-supabase.mjs` que reprova política de escrita para
-- papel de cliente foi REABERTA para acomodar exatamente as duas políticas
-- nomeadas abaixo — com exceção por NOME, sobre `storage.objects`, e sem
-- exceção nenhuma para as tabelas do banco. Ver a seção (a) daquele arquivo.
--
-- ─── E POR QUE A COLUNA GANHA RESTRIÇÃO ──────────────────────────────────
--
-- `posts.imagem_url` nasceu `text` nulável, sem tamanho e sem formato: hoje uma
-- imagem inteira em `data:image/png;base64,…` cabe nela e nada acusa. A defesa
-- real não é remover o código que gravava base64 (ele saiu na Story 2.6) — é
-- tornar conteúdo de arquivo NÃO REPRESENTÁVEL na coluna. A cláusula que faz
-- isso é a do esquema: só `https://` absoluto entra, e nem uma imagem de um
-- pixel começa com isso.
--
-- `public.endereco_de_imagem_e_permitido` é o espelho em SQL de
-- `enderecoDeImagemPermitido`, de `src/domain/blog/arquivos.js`, e as duas são
-- comparadas sobre um corpus por `verificar:escrita`. É a única forma de a
-- divergência entre elas aparecer como falha em vez de como conteúdo legítimo
-- recusado na gravação.
--
-- Idempotente: reaplicar em banco já migrado termina sem erro.

-- ─── (1) O bucket ────────────────────────────────────────────────────────
--
-- `public = true` é o que faz `/storage/v1/object/public/…` servir o arquivo
-- sem credencial — e é essa leitura anônima que o critério pede.
--
-- `file_size_limit` e `allowed_mime_types` são a MESMA lista de permissão que
-- `domain/blog/arquivos.js` declara, aplicada pelo próprio Storage: a tela
-- recusa antes da rede para não gastar a espera de quem errou, e o bucket
-- recusa de qualquer jeito, inclusive de quem não passou pela tela.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'imagens-do-blog',
  'imagens-do-blog',
  true,
  1048576,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ─── (2) As políticas ────────────────────────────────────────────────────
--
-- Quatro, e nenhuma a mais:
--
--   leitura   anon           — o visitante vê a capa do artigo;
--   leitura   authenticated  — o Painel vê a mesma coisa;
--   inserção  authenticated  — o envio, com a sessão do Autor;
--   remoção   authenticated  — trocar a capa e excluir o Post limpam o anterior.
--
-- NÃO há política de `update`: o envio nunca sobrescreve (cada capa nasce com
-- nome próprio), e "atualizar objeto" seria uma superfície sem uso. NÃO há
-- escrita para `anon`: bucket com escrita anônima é a cota do projeto aberta a
-- qualquer visitante.
--
-- Todas presas a `bucket_id`: elas valem para ESTE bucket, e um bucket futuro
-- nasce fechado em vez de nascer aberto por herança.

drop policy if exists "imagens_do_blog_leitura_anonima" on storage.objects;
create policy "imagens_do_blog_leitura_anonima"
  on storage.objects
  for select
  to anon
  using (bucket_id = 'imagens-do-blog');

drop policy if exists "imagens_do_blog_leitura_autenticada" on storage.objects;
create policy "imagens_do_blog_leitura_autenticada"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'imagens-do-blog');

drop policy if exists "imagens_do_blog_envio_autenticado" on storage.objects;
create policy "imagens_do_blog_envio_autenticado"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'imagens-do-blog');

drop policy if exists "imagens_do_blog_remocao_autenticada" on storage.objects;
create policy "imagens_do_blog_remocao_autenticada"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'imagens-do-blog');

-- ─── (3) O endereço que a coluna aceita ──────────────────────────────────
--
-- Espelho de `enderecoDeImagemPermitido`. `null` passa: capa é opcional, e o
-- par com o texto alternativo já é cobrado por `posts_imagem_exige_alt`, desde
-- a Story 2.1.
--
-- As cláusulas, na ordem:
--
--   vazio                      — coluna presente sem valor é `null`, não `''`;
--   acima de 2048 caracteres   — endereço não tem esse tamanho; conteúdo tem;
--   fora de ASCII imprimível   — espaço, controle e o que quebra um atributo;
--   fora do vocabulário de HTML— `\ < > " ' ` { } | ^`;
--   sem `https://` no começo   — A CLÁUSULA QUE IMPORTA: é ela que torna
--                                `data:`, `blob:`, `javascript:` e qualquer
--                                codificação de conteúdo não representáveis;
--   autoridade vazia, com `@`  — credencial embutida e `https:///caminho`;
--   autoridade fora do formato — só letra, dígito, ponto, hífen e porta.

create or replace function public.endereco_de_imagem_e_permitido(endereco text)
  returns boolean
  language sql
  immutable
  parallel safe
  set search_path = ''
as $fn$
  with e as (
    select
      endereco as v,
      case
        when endereco ~* '^https://'
          then regexp_replace(substring(endereco from 9), '[/?#].*$', '')
        else null
      end as autoridade
  )
  select case
    when e.v is null then true
    when e.v = '' then false
    when char_length(e.v) > 2048 then false
    -- Fora de ASCII imprimível (`!` a `~`). Mais duro que "sem espaço" de
    -- propósito: `[[:space:]]` depende do locale e o `\s` do JavaScript inclui
    -- U+00A0 e companhia — as duas implementações divergiriam justamente nos
    -- caracteres que ninguém testa.
    when e.v ~ '[^!-~]' then false
    when e.v ~ '[\\<>"''`{}|^]' then false
    when e.autoridade is null then false
    when e.autoridade = '' then false
    when strpos(e.autoridade, '@') > 0 then false
    when e.autoridade !~* '^[a-z0-9.-]+(:[0-9]{1,5})?$' then false
    else true
  end
  from e;
$fn$;

comment on function public.endereco_de_imagem_e_permitido(text) is
  'Espelho em SQL de enderecoDeImagemPermitido de src/domain/blog/arquivos.js: lista de PERMISSAO de endereco de imagem, so https:// absoluto. E ela que torna conteudo de arquivo nao representavel na coluna. As duas sao comparadas sobre um corpus pela ferramenta verificar:escrita.';

alter table public.posts drop constraint if exists posts_imagem_url_e_endereco;
alter table public.posts add constraint posts_imagem_url_e_endereco
  check (public.endereco_de_imagem_e_permitido(imagem_url));

-- `seo_imagem_url` entra na MESMA restrição, e isso não é a Story 3.4 chegando
-- cedo: a coluna existe, é `text` sem formato, e nenhuma porta a escreve hoje —
-- então ela é exatamente o buraco por onde a regressão voltaria pelo console.
-- A regra é a mesma e o vocabulário é o mesmo; o que a 3.4 vai construir é o
-- CAMPO, não a restrição.
alter table public.posts drop constraint if exists posts_seo_imagem_url_e_endereco;
alter table public.posts add constraint posts_seo_imagem_url_e_endereco
  check (public.endereco_de_imagem_e_permitido(seo_imagem_url));

-- ─── (4) O texto alternativo tem teto ────────────────────────────────────
--
-- `posts_imagem_exige_alt` já cobra que ele EXISTA quando há capa. O que
-- faltava era tamanho: a coluna aceitava um documento inteiro, e descrição de
-- imagem com dez mil caracteres é a mesma classe de defeito que o endereço sem
-- formato. O número é o mesmo de `TAMANHO_MAXIMO_DO_ALTERNATIVO`.

alter table public.posts drop constraint if exists posts_imagem_alt_com_teto;
alter table public.posts add constraint posts_imagem_alt_com_teto
  check (imagem_alt is null or char_length(imagem_alt) <= 300);

-- ─── (5) Os comentários que faltavam nas colunas ─────────────────────────

comment on column public.posts.imagem_url is
  'Endereco publico ABSOLUTO da capa. Nunca o conteudo do arquivo: posts_imagem_url_e_endereco so aceita https:// absoluto, e por isso base64 nao e representavel aqui. O arquivo vive no bucket imagens-do-blog.';
comment on column public.posts.imagem_alt is
  'Descricao da capa, obrigatoria quando ha capa (posts_imagem_exige_alt) e limitada a 300 caracteres.';
comment on column public.posts.seo_imagem_url is
  'Endereco publico ABSOLUTO da imagem de compartilhamento. Mesma restricao de imagem_url. O CAMPO que a preenche e da Story 3.4; a restricao existe desde a 3.1 para a coluna nao ser a porta dos fundos.';
