-- As restrições da capa param de poder ABORTAR a migração.
--
-- Story 3.1 — correção da revisão. Migração NOVA, não edição das aplicadas.
--
-- ─── O defeito ───────────────────────────────────────────────────────────
--
-- `20260819234500_capa_no_storage.sql` acrescenta três restrições com
-- `alter table … add constraint`, e essa forma VALIDA todas as linhas já
-- gravadas na hora. Num banco que já tivesse um `data:` em `imagem_url` — o
-- estado exato que a story existe para tornar impossível — ou um texto
-- alternativo acima de 300 caracteres, o comando falha e o endpoint desfaz o
-- ARQUIVO INTEIRO: o bucket não nasce, as políticas não nascem, e a migração
-- fica pendente para sempre sem que ninguém entenda por quê.
--
-- Aqui passou porque a tabela estava limpa. "Passou porque tinha sorte" é a
-- definição de uma garantia que não existe.
--
-- ─── A correção ──────────────────────────────────────────────────────────
--
-- Três passos, nesta ordem, e a ordem é o conserto:
--
--   1. SANEAR o que já está gravado. Endereço que a regra recusa vira `null`,
--      e a descrição vai junto — é a mesma direção que o servidor aplica: capa
--      que sai leva a descrição, senão sobra legenda de imagem que não existe.
--      Descrição longa demais é CORTADA, não apagada: 300 caracteres do texto
--      que alguém escreveu valem mais que nada.
--   2. Acrescentar as restrições como `not valid`, que NÃO varre a tabela e
--      NÃO pode abortar.
--   3. `validate constraint`, que varre — e, se ainda houver linha ruim,
--      falha DIZENDO qual restrição, com a tabela já saneada e o resto da
--      migração aplicada.
--
-- O efeito final é idêntico ao de uma restrição comum: `validate constraint`
-- marca `convalidated`, e a partir daí ela vale para toda linha nova e antiga.
-- A diferença é que ela não pode mais derrubar o arquivo inteiro por causa de
-- um dado que a própria story existe para eliminar.
--
-- Idempotente: `drop … if exists` antes de cada `add`, e o saneamento é um
-- `update` que não encontra nada numa segunda passagem.

-- ─── 1. Sanear ───────────────────────────────────────────────────────────

update public.posts
   set imagem_url = null,
       imagem_alt = null
 where imagem_url is not null
   and not public.endereco_de_imagem_e_permitido(imagem_url);

update public.posts
   set seo_imagem_url = null
 where seo_imagem_url is not null
   and not public.endereco_de_imagem_e_permitido(seo_imagem_url);

update public.posts
   set imagem_alt = left(imagem_alt, 300)
 where imagem_alt is not null
   and char_length(imagem_alt) > 300;

-- ─── 2. Acrescentar sem varrer ───────────────────────────────────────────

alter table public.posts drop constraint if exists posts_imagem_url_e_endereco;
alter table public.posts add constraint posts_imagem_url_e_endereco
  check (public.endereco_de_imagem_e_permitido(imagem_url)) not valid;

alter table public.posts drop constraint if exists posts_seo_imagem_url_e_endereco;
alter table public.posts add constraint posts_seo_imagem_url_e_endereco
  check (public.endereco_de_imagem_e_permitido(seo_imagem_url)) not valid;

alter table public.posts drop constraint if exists posts_imagem_alt_com_teto;
alter table public.posts add constraint posts_imagem_alt_com_teto
  check (imagem_alt is null or char_length(imagem_alt) <= 300) not valid;

-- ─── 3. Validar, agora que a tabela está limpa ───────────────────────────
--
-- Sem estes três comandos as restrições valeriam só para linha nova, e um
-- `UPDATE` pelo console sobre uma linha antiga escaparia. `convalidated` é o
-- que a verificação confere no catálogo — declarar `not valid` e esquecer de
-- validar é meia restrição com cara de restrição inteira.

alter table public.posts validate constraint posts_imagem_url_e_endereco;
alter table public.posts validate constraint posts_seo_imagem_url_e_endereco;
alter table public.posts validate constraint posts_imagem_alt_com_teto;
