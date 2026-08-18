-- O privilégio que faltava à busca: quem executa a normalização é o CHAMADOR.
--
-- Story 2.11 — Busca e filtros. Correção da migração 20260818120000.
--
-- ─── O que a migração anterior errou, e por quê ───────────────────────────
--
-- Ela revogou `execute` de `public.normalizar_busca(text)` para todo mundo,
-- raciocinando que a função é peça interna da busca e não precisa aparecer na
-- API pública. O raciocínio está certo sobre a API e errado sobre o Postgres:
-- `buscar_posts_do_painel` é `security invoker` — de propósito, é o que faz a
-- RLS continuar valendo —, e uma função `invoker` executa **com o papel de
-- quem a chamou**. O corpo dela chama `normalizar_busca`, e a verificação de
-- privilégio dessa chamada acontece com o papel do chamador, não com o de quem
-- criou a função.
--
-- O resultado, medido: `42501 permission denied for function
-- normalizar_busca`, com a busca inteira respondendo 403 para o Painel.
--
-- **A correção NÃO é tornar a busca `security definer`.** Isso apagaria o
-- problema junto com a garantia: `definer` executaria com os privilégios de
-- quem criou a função e a RLS deixaria de valer para quem chama. Preferir o
-- 403 e conceder o privilégio é escolher a garantia sobre a conveniência.
--
-- ─── E a exposição em /rpc/, que a anterior queria evitar ─────────────────
--
-- `normalizar_busca` passa a ser chamável por `authenticated`, e portanto
-- visível como endpoint. É custo aceito, e pequeno: ela recebe texto, devolve
-- texto, não lê tabela nenhuma e não decide nada. Continua revogada de `anon`
-- e de `public`.
--
-- Idempotente: reaplicar em banco já migrado termina sem erro.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.normalizar_busca(text) to authenticated';
  end if;
end $$;

comment on function public.normalizar_busca(text) is
  'Minúsculas e sem acento. IMMUTABLE por fixar o dicionário na forma de dois argumentos de unaccent — a forma de um argumento é STABLE e o Postgres recusa índice sobre ela. Usada nos DOIS lados da comparação da busca. Executável por authenticated porque buscar_posts_do_painel é security invoker: quem paga o privilégio da chamada interna é o chamador.';

notify pgrst, 'reload schema';
