-- A aposentadoria de Slug, e a associação de Tags — as duas escritas que
-- atravessam MAIS DE UMA TABELA e por isso não cabem no PostgREST.
--
-- Story 2.6 — Metadados do post e slug estável.
--
-- ─── Por que estas duas funções existem ───────────────────────────────────
--
-- A Story 2.5 fez a função de servidor ser o único caminho de escrita, e ela
-- grava pelo PostgREST. O PostgREST faz uma tabela por chamada: ele não tem
-- como escrever em `posts` e em `slugs_antigos` na mesma transação, e não tem
-- como trocar o conjunto de tags de um Post sem um `delete` e um `insert`
-- separados. Por isso a 2.5 RECUSOU trocar o endereço de um Post que já esteve
-- no ar, com a razão escrita no código: fazer metade produziria o "gravado pela
-- metade" que a story proíbe. Esta migração é o outro lado dessa recusa.
--
-- **Por que a aposentadoria precisa ser atômica.** São duas escritas: o Post
-- ganha endereço novo, e o antigo vai para a tabela de aposentados. Se a
-- primeira acontecer e a segunda não, o link publicado deixa de resolver e
-- ninguém fica sabendo — nem o Autor, que viu "salvo", nem o visitante, que vê
-- 404 e vai embora. É o mesmo raciocínio que fez a 2.5 gravar documento e HTML
-- juntos.
--
-- ─── A ORDEM DAS TRÊS OPERAÇÕES NÃO É ESCOLHA ────────────────────────────
--
-- O gatilho `exigir_slug_livre` da Story 2.1 impõe unicidade ATRAVÉS das duas
-- tabelas, nas duas direções. Isso fixa a ordem:
--
--   1. APAGAR de `slugs_antigos` o endereço novo, quando ele já pertence a
--      ESTE Post — é o desfazer de uma renomeação, a exceção deliberada que a
--      Story 2.1 registrou. Sem isto, o Post ficaria com o mesmo endereço ativo
--      e aposentado ao mesmo tempo, e o resolvedor de 301 apontaria para ele
--      mesmo.
--   2. TROCAR o slug do Post. O gatilho confere `slugs_antigos`: o endereço
--      novo não pode estar aposentado por OUTRO Post — e o passo 1 já tirou o
--      caso em que ele é deste.
--   3. INSERIR o endereço antigo em `slugs_antigos`. Só agora: o gatilho da
--      outra direção confere `posts`, e enquanto o passo 2 não tinha acontecido
--      o endereço antigo ainda ESTAVA em `posts` — a inserção falharia contra o
--      próprio Post que está sendo renomeado.
--
-- Inverter 2 e 3 faz a operação falhar sempre. Está escrito porque a próxima
-- pessoa vai olhar para a sequência e achar que "registra o antigo antes de
-- trocar" é mais seguro.
--
-- ─── Segurança ───────────────────────────────────────────────────────────
--
-- `security definer` com `search_path` fixo e `execute` revogado de `public`,
-- `anon` e `authenticated`: nenhum cliente escreve, e uma função de escrita
-- exposta na API pública seria exatamente o caminho novo de escrita que a
-- arquitetura proíbe. Quem chama é a função de servidor, com a chave de
-- serviço.
--
-- Idempotente: reaplicar em banco já migrado termina sem erro.

-- ─── 1. Trocar o endereço, aposentando o anterior ────────────────────────

create or replace function public.aposentar_slug_do_post(
  p_id uuid,
  p_slug_novo text
)
  returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_slug_atual text;
begin
  if p_id is null or p_slug_novo is null or btrim(p_slug_novo) = '' then
    raise exception using
      errcode = '22004',
      message = 'aposentar_slug_do_post exige o post e o endereço novo',
      hint = 'Os dois argumentos são obrigatórios: sem eles não há o que trocar nem o que aposentar.';
  end if;

  -- `for update` porque duas gravações simultâneas do MESMO Post trocando o
  -- endereço produziriam dois registros de aposentadoria e um endereço perdido.
  select p.slug into v_slug_atual
    from public.posts p
   where p.id = p_id
     for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = format('nenhum post com id %L', p_id);
  end if;

  -- Nada a fazer: o endereço já é este. Devolver em vez de escrever mantém a
  -- função segura para ser chamada sem quem chama precisar comparar antes.
  if v_slug_atual = p_slug_novo then
    return v_slug_atual;
  end if;

  -- (1) o Post retoma um endereço que já foi DELE. Ver a nota de ordem acima.
  delete from public.slugs_antigos s
   where s.slug = p_slug_novo
     and s.post_id = p_id;

  -- (2) o endereço novo entra em vigor.
  update public.posts
     set slug = p_slug_novo
   where id = p_id;

  -- (3) e o anterior passa a existir só como destino de redirecionamento.
  insert into public.slugs_antigos (slug, post_id)
       values (v_slug_atual, p_id);

  return v_slug_atual;
end;
$$;

comment on function public.aposentar_slug_do_post(uuid, text) is
  'Troca o slug de um Post e aposenta o anterior em slugs_antigos, NA MESMA TRANSAÇÃO. A ordem das três operações é imposta pelo gatilho exigir_slug_livre e está documentada na migração. Chamada apenas pela função de servidor, com a chave de serviço.';

-- ─── 2. Definir o conjunto de Tags de um Post ────────────────────────────
--
-- Também duas escritas em `posts_tags` — o que saiu e o que entrou —, e pelo
-- mesmo motivo: metade aplicada deixa o Post com a lista de tags de ninguém.
-- Aqui o dano é menor que o de um endereço quebrado, e a razão de a função
-- existir é a mesma: "gravado pela metade" não é estado que este projeto
-- produza de propósito.
--
-- Tag inexistente é RECUSADA, não ignorada em silêncio: um identificador que
-- não existe é sinal de tela desatualizada ou de pedido forjado, e descartá-lo
-- calado faria o Autor salvar cinco tags e reabrir com quatro.

create or replace function public.definir_tags_do_post(
  p_id uuid,
  p_tags uuid[]
)
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_desconhecida uuid;
  v_total integer;
begin
  if p_id is null then
    raise exception using
      errcode = '22004',
      message = 'definir_tags_do_post exige o post';
  end if;

  if not exists (select 1 from public.posts p where p.id = p_id) then
    raise exception using
      errcode = 'P0002',
      message = format('nenhum post com id %L', p_id);
  end if;

  if p_tags is not null then
    select t into v_desconhecida
      from unnest(p_tags) as t
     where not exists (select 1 from public.tags g where g.id = t)
     limit 1;

    if v_desconhecida is not null then
      raise exception using
        errcode = '23503',
        message = format('tag %L não existe', v_desconhecida),
        hint = 'A lista de tags vem de public.tags; um identificador fora dela é tela desatualizada ou pedido forjado.';
    end if;
  end if;

  delete from public.posts_tags pt
   where pt.post_id = p_id
     and (p_tags is null or pt.tag_id <> all (p_tags));

  if p_tags is not null then
    insert into public.posts_tags (post_id, tag_id)
         select p_id, distintas.t
           from (select distinct unnest(p_tags) as t) as distintas
    on conflict (post_id, tag_id) do nothing;
  end if;

  select count(*) into v_total
    from public.posts_tags pt
   where pt.post_id = p_id;

  return v_total;
end;
$$;

comment on function public.definir_tags_do_post(uuid, uuid[]) is
  'Substitui o conjunto de Tags de um Post na mesma transação. Tag inexistente é recusada com 23503, nunca descartada em silêncio. Chamada apenas pela função de servidor.';

-- ─── 3. As funções saem da API pública ───────────────────────────────────
--
-- O mesmo tratamento que a migração da lista de permissão deu às funções de
-- restrição. Aqui ele importa mais: estas duas ESCREVEM. Uma delas exposta a
-- `authenticated` seria um caminho de escrita que não passa pela função de
-- servidor — o oposto exato do invariante do épico.

do $$
declare
  f text;
  papel text;
begin
  foreach f in array array[
    'public.aposentar_slug_do_post(uuid, text)',
    'public.definir_tags_do_post(uuid, uuid[])'
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
