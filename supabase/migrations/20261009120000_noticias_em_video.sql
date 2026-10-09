-- As Notícias: os vídeos que a ChatClean grava e mostra no blog.
--
-- ─── O que é uma Notícia ──────────────────────────────────────────────────
--
-- Um vídeo com título e descrição. Ela aparece numa seção própria do blog,
-- antes dos Posts, tem a listagem dela (`/noticias`) e uma página para
-- assistir (`/noticias/:id`). Não é um Post: não tem Categoria, Tag, Slug nem
-- conteúdo rico, e por isso não mora em `posts` com uma coluna de tipo. Uma
-- tabela só faria toda consulta de Post precisar lembrar de excluir vídeo, e
-- a primeira que esquecesse misturaria os dois na grade.
--
-- ─── O vídeo mora no YouTube, e aqui fica só o identificador ──────────────
--
-- `youtube_id` são os 11 caracteres do vídeo, e não o endereço colado: o
-- Painel aceita qualquer forma de link (`watch?v=`, `youtu.be/`, `shorts/`,
-- `embed/`, `live/`), extrai o identificador e é ele que viaja. Guardar o
-- endereço cru guardaria também `&t=`, `&list=` e o que mais viesse junto, e
-- o endereço de incorporação teria de ser adivinhado a cada leitura. A
-- miniatura e o reprodutor são derivados do identificador, na tela.
--
-- ─── Quem lê e quem escreve ───────────────────────────────────────────────
--
-- `anon` lê só o que está publicado; `authenticated` (o Painel) lê tudo.
-- Ninguém escreve pelo navegador: a gravação passa pela função de servidor
-- (`api/posts.js`, operações `salvarNoticia` e `excluirNoticia`), com a chave
-- de serviço, como Post e Categoria.
--
-- `publicada_em` é gravado pelo servidor na PRIMEIRA publicação e não muda
-- depois: é ele que ordena a lista, e despublicar e republicar um vídeo não
-- pode jogá-lo para o topo.
--
-- Idempotente: reaplicar em banco já migrado termina sem erro.

create table if not exists public.noticias (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text not null default '',
  youtube_id text not null,
  publicada boolean not null default false,
  publicada_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint noticias_titulo_nao_vazio
    check (char_length(btrim(titulo)) between 1 and 160),
  constraint noticias_descricao_com_teto
    check (char_length(descricao) <= 5000),
  constraint noticias_youtube_id_formato
    check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  constraint noticias_publicada_tem_data
    check (not publicada or publicada_em is not null)
);

comment on table public.noticias is
  'As Notícias em vídeo do blog. O vídeo mora no YouTube: youtube_id são os 11 caracteres dele. anon lê só publicada = true; authenticated lê tudo; a escrita é só pela função de servidor, com a chave de serviço.';
comment on column public.noticias.youtube_id is
  'O identificador do vídeo no YouTube (11 caracteres), e não o endereço. Miniatura e reprodutor são derivados dele.';
comment on column public.noticias.publicada_em is
  'O instante da PRIMEIRA publicação, gravado pelo servidor. Ordena a lista e não muda ao despublicar e republicar.';

-- A lista pública é sempre "as publicadas, da mais nova para a mais antiga".
create index if not exists noticias_publicadas_idx
  on public.noticias (publicada_em desc, id)
  where publicada;

alter table public.noticias enable row level security;

revoke all on table public.noticias from public, anon, authenticated;
grant select on table public.noticias to anon;
grant select on table public.noticias to authenticated;

drop policy if exists "noticias_leitura_anonima" on public.noticias;
create policy "noticias_leitura_anonima"
  on public.noticias
  for select
  to anon
  using (publicada);

-- O Painel vê tudo: o que ainda não foi publicado é o que ele administra.
drop policy if exists "noticias_leitura_autenticada" on public.noticias;
create policy "noticias_leitura_autenticada"
  on public.noticias
  for select
  to authenticated
  using (true);

-- Reaproveita `public.tocar_atualizado_em()`, criada na Story 1.2.
drop trigger if exists noticias_tocar_atualizado_em on public.noticias;
create trigger noticias_tocar_atualizado_em
  before update on public.noticias
  for each row
  execute function public.tocar_atualizado_em();

notify pgrst, 'reload schema';
