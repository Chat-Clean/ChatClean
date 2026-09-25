-- ═══════════════════════════════════════════════════════════════════════════
-- Story 5.3, revisão: a data de abertura é SÓ do banco, e TRUNCATE não
-- contorna a regra de que uma Vaga Aberta não se exclui.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Corrige 20260924150000_maquina_de_estados_da_vaga.sql, que já está aplicada
-- e por isso não se reescreve. Dois furos da segunda defesa:
--
-- 1. `aberta_em` INVENTÁVEL. A função do gatilho aceitava, na PRIMEIRA ida
--    para `aberta`, um `aberta_em` enviado no próprio comando, e só gravava
--    `now()` quando ele vinha nulo. Qualquer caminho que não passasse pela
--    função de escrita podia abrir uma Vaga com data retroativa ou futura, e
--    essa data é o `datePosted` do JobPosting. Agora a primeira abertura com
--    `aberta_em` preenchido é RECUSADA (23514, `vagas_maquina_de_estados`),
--    e sem ele o banco grava `now()`. Recusar, em vez de sobrescrever em
--    silêncio, diz a quem mandou a data que ela não vale.
--
--    Quem precisa de Vagas com datas distintas (a verificação, para provar a
--    ordenação de `vagas_abertas`) desliga o gatilho DENTRO de uma transação
--    que é desfeita, como já faz para exercer o CHECK sozinho.
--
-- 2. TRUNCATE. O gatilho de linha não dispara em `truncate`, e
--    `truncate public.vagas` (ou um `truncate ... cascade` numa Classificação)
--    apagaria Vagas Abertas sem passar por "encerre antes". O gatilho novo,
--    `vagas_maquina_de_estados_no_truncate`, é de INSTRUÇÃO (`for each
--    statement`), antes do truncate, e recusa com 23514 se houver ao menos
--    uma Vaga Aberta. Sem nenhuma Aberta, o truncate segue.
--
-- As recusas continuam começando pelo nome `vagas_maquina_de_estados`, que é
-- por onde a função de escrita e a verificação as reconhecem.
--
-- Só objetos de Carreiras: a função da máquina é redefinida com a MESMA
-- assinatura (o gatilho `vagas_maquina_de_estados` de 20260924150000 continua
-- apontando para ela e não é recriado), e a função e o gatilho do truncate
-- são novos. As duas funções são `security invoker`, fixam `search_path` e
-- não são executáveis por cliente nenhum. A do truncate lê `public.vagas`
-- com o papel de quem trunca: só o dono da tabela e `service_role` têm o
-- privilégio de truncar, e os dois enxergam todas as linhas.
-- Idempotente: reaplicar termina sem erro.

create or replace function public.vagas_respeitam_a_maquina()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_ja_aberta boolean;
begin
  if tg_op = 'INSERT' then
    if new.estado is distinct from 'rascunho'::public.estado_vaga then
      raise exception 'vagas_maquina_de_estados: uma vaga nasce rascunho, e veio %', new.estado
        using errcode = '23514';
    end if;
    if new.aberta_em is not null then
      raise exception 'vagas_maquina_de_estados: uma vaga nasce sem aberta_em, que é gravado na primeira abertura'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.estado = 'aberta'::public.estado_vaga then
      raise exception 'vagas_maquina_de_estados: uma vaga aberta não pode ser excluída, encerre a vaga antes'
        using errcode = '23514';
    end if;
    return old;
  end if;

  -- UPDATE. Primeiro a transição: só as três da MAQUINA, ou nenhuma.
  if new.estado is distinct from old.estado then
    if not (
      (old.estado = 'rascunho'::public.estado_vaga and new.estado = 'aberta'::public.estado_vaga)
      or (old.estado = 'aberta'::public.estado_vaga and new.estado = 'encerrada'::public.estado_vaga)
      or (old.estado = 'encerrada'::public.estado_vaga and new.estado = 'aberta'::public.estado_vaga)
    ) then
      raise exception 'vagas_maquina_de_estados: a vaga não pode ir de % para %', old.estado, new.estado
        using errcode = '23514';
    end if;
  end if;

  -- Já foi aberta alguma vez? Então o endereço e a data de abertura travaram.
  v_ja_aberta := old.aberta_em is not null or old.estado <> 'rascunho'::public.estado_vaga;

  if v_ja_aberta then
    if new.aberta_em is distinct from old.aberta_em then
      raise exception 'vagas_maquina_de_estados: aberta_em não muda depois da primeira abertura'
        using errcode = '23514';
    end if;
    if new.slug is distinct from old.slug then
      raise exception 'vagas_maquina_de_estados: o slug não muda depois da primeira abertura'
        using errcode = '23514';
    end if;
    return new;
  end if;

  -- Nunca aberta. A primeira abertura NÃO traz data: quem grava é o banco.
  -- Um Rascunho que continua Rascunho também não tem data.
  if new.estado = 'aberta'::public.estado_vaga then
    if new.aberta_em is not null then
      raise exception 'vagas_maquina_de_estados: aberta_em é gravado pelo banco na primeira abertura, e não vem no comando'
        using errcode = '23514';
    end if;
    new.aberta_em := now();
  elsif new.aberta_em is not null then
    raise exception 'vagas_maquina_de_estados: um rascunho não tem aberta_em'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.vagas_respeitam_a_maquina() is
  'Gatilho vagas_maquina_de_estados: segunda defesa da máquina de estados da Vaga (src/domain/carreiras/transicoes.js). Recusa com 23514 insert fora de rascunho, transição fora da tabela, exclusão de Aberta, aberta_em enviado na primeira abertura e mudança de aberta_em ou slug depois dela; grava aberta_em = now() na primeira abertura (redefinida em 20260924160000).';

create or replace function public.vagas_truncate_respeita_a_maquina()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  if exists (select 1 from public.vagas v where v.estado = 'aberta'::public.estado_vaga) then
    raise exception 'vagas_maquina_de_estados: há vaga aberta, e uma vaga aberta não pode ser excluída nem por truncate, encerre as vagas antes'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

comment on function public.vagas_truncate_respeita_a_maquina() is
  'Gatilho vagas_maquina_de_estados_no_truncate: recusa com 23514 o truncate de public.vagas (direto ou em cascata) enquanto houver Vaga Aberta. O gatilho de linha vagas_maquina_de_estados não dispara em truncate.';

drop trigger if exists vagas_maquina_de_estados_no_truncate on public.vagas;
create trigger vagas_maquina_de_estados_no_truncate
  before truncate on public.vagas
  for each statement
  execute function public.vagas_truncate_respeita_a_maquina();

-- ─── Privilégio de execução ──────────────────────────────────────────────
--
-- O molde de 20260924150000, para as duas funções: revoga de todos, concede a
-- quem escreve. `create or replace` preserva o que já havia; repetir aqui
-- deixa a migração correta mesmo sozinha.

do $$
declare
  papel text;
  fn text;
begin
  foreach fn in array array['public.vagas_respeitam_a_maquina()', 'public.vagas_truncate_respeita_a_maquina()'] loop
    execute format('revoke execute on function %s from public', fn);
    foreach papel in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = papel) then
        execute format('revoke execute on function %s from %I', fn, papel);
      end if;
    end loop;
    foreach papel in array array['postgres', 'service_role'] loop
      if exists (select 1 from pg_roles where rolname = papel) then
        execute format('grant execute on function %s to %I', fn, papel);
      end if;
    end loop;
  end loop;
end $$;

-- O PostgREST guarda o schema em cache.
notify pgrst, 'reload schema';
