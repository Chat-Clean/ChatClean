-- ─── Story 4.8: o Resumo entra em `posts_no_ar()` ───────────────────────────
--
-- O índice para motores generativos precisa de título, endereço e RESUMO de
-- cada Post. `posts_no_ar()` nasceu na Story 4.2 devolvendo o mínimo que o mapa
-- do site precisava — e o mínimo não incluía o Resumo.
--
-- ─── POR QUE A FUNÇÃO CRESCE, E NÃO NASCE UMA SEGUNDA ───────────────────────
--
-- A Story 4.8 diz, com estas palavras, que o mapa e o índice vêm "da mesma
-- fonte e da mesma consulta". A saída fácil seria um `select` solto dentro de
-- `api/llms.js`: resolve em três linhas e não mexe no banco.
--
-- É exatamente o que o critério proíbe, e o motivo é concreto: no dia em que a
-- regra de visibilidade mudar, esta função muda e a consulta solta não — e o
-- índice passa a anunciar artigo que a página responde 404. O custo de uma
-- migração é pago uma vez; o de duas fontes é pago para sempre.
--
-- ─── E ISSO NÃO AMPLIA O QUE É EXPOSTO ──────────────────────────────────────
--
-- `resumo` já é legível por `anon` para Post visível, pela política de leitura
-- anônima desde a Story 2.1. O índice mostra o que a listagem do blog já mostra.
-- O que continua FORA é o conteúdo do artigo e as imagens: quem precisa deles
-- resolve o endereço um a um, e é `situacao_do_endereco` que decide.

drop function if exists public.posts_no_ar();

create or replace function public.posts_no_ar()
  returns table (
    slug text,
    titulo text,
    resumo text,
    publicado_em timestamptz,
    atualizado_em timestamptz
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select p.slug, p.titulo, p.resumo, p.publicado_em, p.atualizado_em
    from public.posts p
   where p.estado in ('publicado', 'agendado')
     and p.publicado_em is not null
     and p.publicado_em <= now()
   order by p.publicado_em desc, p.id desc;
$$;

comment on function public.posts_no_ar() is
  'Os Posts visíveis agora, com o que o mapa do site e o índice para LLMs precisam: endereço, título, Resumo e os dois instantes. O Resumo entrou na Story 4.8 — o índice o exige, e o critério manda o mapa e o índice virem da MESMA consulta. Sem conteúdo do artigo e sem imagem: quem precisa deles resolve o endereço um a um. Rascunho e agendado por vir nunca aparecem.';

-- O `drop` acima levou junto as concessões: elas são da FUNÇÃO, e a função é
-- outra. Reconcedê-las é obrigatório, e é o mesmo bloco da Story 4.2 — revogar
-- de `public` antes, e conceder papel a papel, porque `security definer` roda
-- com os privilégios de quem a criou e conceder a `public` daria execução a
-- qualquer papel futuro sem ninguém decidir.
do $$
declare
  papel text;
begin
  execute 'revoke execute on function public.posts_no_ar() from public';
  foreach papel in array array['anon', 'authenticated', 'postgres', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('grant execute on function public.posts_no_ar() to %I', papel);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
