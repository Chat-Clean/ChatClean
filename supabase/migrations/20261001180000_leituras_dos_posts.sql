-- Leituras dos Posts: quantas vezes cada artigo foi lido, por dia.
--
-- ─── O que é guardado, e o que NÃO é ──────────────────────────────────────
--
-- Uma linha por Post por dia, com o total daquele dia. Não há linha por
-- visita, nem endereço IP, nem identificador de visitante, nem navegador: o
-- que entra aqui é um número, e ele não aponta para ninguém. O dia é o do
-- fuso de apresentação do site (`America/Sao_Paulo`), não o UTC — uma leitura
-- às 22h de Brasília pertence ao dia em que a pessoa leu.
--
-- ─── A ÚNICA escrita que sai do navegador ─────────────────────────────────
--
-- Toda escrita do projeto passa por função de servidor. Esta é a exceção, e
-- ela é estreita de propósito: `anon` não ganha privilégio nenhum na tabela.
-- O que ele pode é EXECUTAR `registrar_leitura_do_post`, que soma 1 ao dia de
-- hoje de um Post — e só de um Post que a política de leitura anônima já
-- mostra. Não escolhe o dia, não escolhe a quantia, não lê nada de volta.
--
-- A função é `security definer` porque precisa escrever onde `anon` não
-- escreve, e por isso REPETE o predicado de visibilidade de
-- `posts_leitura_anonima` (publicado, ou agendado cuja hora já passou): sob
-- `definer` a política não se aplica, e sem a repetição daria para contar
-- leitura de rascunho — e descobrir, pelo efeito, que o rascunho existe.
--
-- O limite conhecido: quem chamar a função em laço infla o número. Ele é
-- métrica interna do Painel, não decide nada no site, e não há dado a extrair.
--
-- ─── Quem lê ──────────────────────────────────────────────────────────────
--
-- Só `authenticated` (o Painel), pela tabela ou pela visão de totais. O
-- visitante não lê contagem alguma: nem política, nem privilégio.
--
-- Idempotente: reaplicar em banco já migrado termina sem erro.

create table if not exists public.leituras_dos_posts (
  post_id uuid not null references public.posts (id) on delete cascade,
  dia date not null,
  total integer not null default 0 check (total >= 0),
  primary key (post_id, dia)
);

comment on table public.leituras_dos_posts is
  'Leituras de cada Post, uma linha por Post por dia (fuso America/Sao_Paulo). Só o total: nenhum dado de visitante. Escrita apenas por registrar_leitura_do_post; leitura apenas por authenticated.';

alter table public.leituras_dos_posts enable row level security;

revoke all on table public.leituras_dos_posts from public, anon, authenticated;
grant select on table public.leituras_dos_posts to authenticated;

drop policy if exists leituras_dos_posts_leitura_autenticada on public.leituras_dos_posts;
create policy leituras_dos_posts_leitura_autenticada
  on public.leituras_dos_posts
  for select
  to authenticated
  using (true);

create or replace function public.registrar_leitura_do_post(p_post_id uuid)
  returns void
  language sql
  volatile
  security definer
  set search_path = ''
as $$
  insert into public.leituras_dos_posts as l (post_id, dia, total)
  select p.id, (now() at time zone 'America/Sao_Paulo')::date, 1
    from public.posts p
   where p.id = p_post_id
     and p.estado in ('publicado', 'agendado')
     and p.publicado_em <= now()
  on conflict (post_id, dia) do update
    set total = l.total + 1
$$;

comment on function public.registrar_leitura_do_post(uuid) is
  'Soma 1 à leitura de HOJE (fuso America/Sao_Paulo) de um Post visível ao público. security definer: anon não tem privilégio na tabela, e por isso o predicado de posts_leitura_anonima é repetido aqui. Post inexistente, rascunho ou arquivado não conta e não acusa erro. Não devolve nada.';

revoke all on function public.registrar_leitura_do_post(uuid) from public, anon, authenticated;
grant execute on function public.registrar_leitura_do_post(uuid) to anon;

create or replace view public.leituras_por_post
  with (security_invoker = true)
as
  select l.post_id,
         sum(l.total)::bigint as total,
         coalesce(
           sum(l.total) filter (
             where l.dia >= (now() at time zone 'America/Sao_Paulo')::date - 29
           ),
           0
         )::bigint as ultimos_30_dias
    from public.leituras_dos_posts l
   group by l.post_id;

comment on view public.leituras_por_post is
  'Total de leituras por Post e o total dos últimos 30 dias (hoje incluído). security_invoker: quem decide a leitura é a política de leituras_dos_posts.';

revoke all on table public.leituras_por_post from public, anon, authenticated;
grant select on table public.leituras_por_post to authenticated;

notify pgrst, 'reload schema';
