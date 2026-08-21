-- O teto de HIGIENE das duas colunas de texto de SEO.
--
-- Story 3.4 — Campos de SEO com herança. Migração NOVA, não edição das
-- aplicadas.
--
-- ─── O buraco ────────────────────────────────────────────────────────────
--
-- `seo_titulo` e `seo_descricao` nasceram em `20260814140000_conteudo_do_blog`
-- como `text` NULÁVEL, sem tamanho, sem formato e sem comentário. Até esta
-- story nenhuma porta as escrevia — e é a story que abre a porta. Coluna de
-- texto sem teto nenhum que vira etiqueta de metadado é problema de
-- ARMAZENAMENTO e de SAÍDA ao mesmo tempo: um `og:description` de dez mil
-- caracteres viaja em toda resposta que declara o Post.
--
-- `seo_imagem_url` já ganhou formato na Story 3.1
-- (`posts_seo_imagem_url_e_endereco`), e continua valendo sem mudança: o
-- vocabulário de esquema é o mesmo da capa, e esta story não o toca.
--
-- ─── DOIS NÚMEROS COM TRABALHOS DIFERENTES, E SÓ UM MORA AQUI ────────────
--
-- O comprimento USUAL (~60 no título, ~155 na descrição) é conselho de quem
-- exibe resultado de busca. Ele SINALIZA na tela e não chega até aqui — pôr o
-- conselho no banco transformaria "o Google corta na exibição" em "não dá para
-- salvar", que é o oposto do que o critério pede.
--
-- O que mora aqui é o teto de higiene, e ele é DELIBERADAMENTE longe do usual:
-- 300 e 1000, cinco e seis vezes e meia acima. A distância é declarada em
-- `DISTANCIA_MINIMA_ENTRE_OS_DOIS`, em `src/domain/blog/compartilhamento.js`,
-- e o módulo LANÇA se alguém a encurtar. Os números daqui são os mesmos de
-- `TETO_DE_HIGIENE_DE_SEO`, e `verificar:escrita` compara os dois lados.
--
-- ─── A FORMA É A DE `20260820093000_capa_restricoes_validadas` ───────────
--
-- Sanear, acrescentar `not valid` (que não varre e não pode abortar o arquivo
-- inteiro), validar. `validate constraint` marca `convalidated`, e a partir
-- daí a restrição vale para linha nova e antiga — declarar `not valid` e
-- esquecer de validar é meia restrição com cara de restrição inteira.
--
-- Saneia CORTANDO, e não apagando: 300 caracteres do que alguém escreveu valem
-- mais que nada, e é a mesma escolha que a migração da capa fez com
-- `imagem_alt`. Idempotente: `drop … if exists` antes de cada `add`, e o
-- `update` não encontra nada numa segunda passagem.

-- ─── 1. Sanear ───────────────────────────────────────────────────────────

update public.posts
   set seo_titulo = left(seo_titulo, 300)
 where seo_titulo is not null
   and char_length(seo_titulo) > 300;

update public.posts
   set seo_descricao = left(seo_descricao, 1000)
 where seo_descricao is not null
   and char_length(seo_descricao) > 1000;

-- ─── 2. Acrescentar sem varrer ───────────────────────────────────────────

alter table public.posts drop constraint if exists posts_seo_titulo_com_teto;
alter table public.posts add constraint posts_seo_titulo_com_teto
  check (seo_titulo is null or char_length(seo_titulo) <= 300) not valid;

alter table public.posts drop constraint if exists posts_seo_descricao_com_teto;
alter table public.posts add constraint posts_seo_descricao_com_teto
  check (seo_descricao is null or char_length(seo_descricao) <= 1000) not valid;

-- ─── 3. Validar, agora que a tabela está limpa ───────────────────────────

alter table public.posts validate constraint posts_seo_titulo_com_teto;
alter table public.posts validate constraint posts_seo_descricao_com_teto;

-- ─── 4. Os comentários que faltavam nas duas colunas ─────────────────────

comment on column public.posts.seo_titulo is
  'Titulo de busca e de previa de link. OPCIONAL: vazio HERDA o titulo do Post, e quem decide isso e metadadosDoPost em src/domain/blog/compartilhamento.js. Teto de HIGIENE de 300 (posts_seo_titulo_com_teto); o comprimento usual de ~60 e conselho de exibicao e vive na tela, nunca aqui.';
comment on column public.posts.seo_descricao is
  'Meta descricao de busca e de previa de link. OPCIONAL: vazio HERDA o Resumo, e sem Resumo fica AUSENTE, nunca vazia. Teto de HIGIENE de 1000 (posts_seo_descricao_com_teto); o comprimento usual de ~155 e conselho de exibicao e vive na tela.';
