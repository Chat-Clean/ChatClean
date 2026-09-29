-- ═══════════════════════════════════════════════════════════════════════════
-- Story 5.3: a máquina de estados da Vaga imposta no banco.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A SEGUNDA DEFESA. A primeira é a função de escrita (`api/carreiras.js`), que
-- valida toda mudança de Estado contra o Estado GRAVADO pela tabela única de
-- `src/domain/carreiras/transicoes.js`. Até esta migração, só o JavaScript
-- conhecia a máquina: o banco aceitava `aberta -> rascunho`, excluir uma Vaga
-- Aberta e reescrever `aberta_em`. Qualquer caminho que não passasse pela
-- função (um servidor com defeito, um comando manual no console) podia fazer
-- isso sem que nada recusasse.
--
-- O gatilho `vagas_maquina_de_estados` recusa, antes de a linha ser gravada:
--
--   * INSERT: a Vaga nasce Rascunho e sem `aberta_em`;
--   * UPDATE: só as transições da MAQUINA (rascunho -> aberta,
--     aberta -> encerrada, encerrada -> aberta) ou nenhuma mudança de Estado;
--   * UPDATE depois da primeira abertura: `aberta_em` e `slug` não mudam;
--   * DELETE: uma Vaga Aberta não se exclui (encerre antes).
--
-- ─── `aberta_em` PASSA A SER DO BANCO ───────────────────────────────────────
--
-- `aberta_em` é o `datePosted` do JobPosting: não pode ser inventado nem mudar
-- ao reabrir. Na primeira ida para `aberta`, com `aberta_em` nulo, o gatilho
-- grava `now()`. Depois disso o valor fica travado. A função de escrita NÃO
-- envia `aberta_em` (a coluna é ignorada e relatada quando vem no corpo).
-- Um valor explícito só é aceito na própria primeira abertura, que é o que a
-- verificação usa, em transação desfeita, para ter Vagas com datas distintas.
--
-- As recusas usam o SQLSTATE 23514 (violação de restrição de verificação),
-- que a função de escrita já traduz em 422, e a mensagem começa pelo nome do
-- gatilho, `vagas_maquina_de_estados`, que é por onde a verificação as julga.
--
-- Nada anterior a este épico é tocado. A função é `security invoker` (ela só
-- lê OLD e NEW), fixa `search_path` e não é executável por cliente nenhum.
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

  -- Nunca aberta: a primeira abertura grava a data; um Rascunho não tem data.
  if new.estado = 'aberta'::public.estado_vaga then
    if new.aberta_em is null then
      new.aberta_em := now();
    end if;
  elsif new.aberta_em is not null then
    raise exception 'vagas_maquina_de_estados: um rascunho não tem aberta_em'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.vagas_respeitam_a_maquina() is
  'Gatilho vagas_maquina_de_estados: segunda defesa da máquina de estados da Vaga (src/domain/carreiras/transicoes.js). Recusa com 23514 insert fora de rascunho, transição fora da tabela, exclusão de Aberta e mudança de aberta_em ou slug depois da primeira abertura; grava aberta_em = now() na primeira abertura.';

drop trigger if exists vagas_maquina_de_estados on public.vagas;
create trigger vagas_maquina_de_estados
  before insert or update or delete on public.vagas
  for each row
  execute function public.vagas_respeitam_a_maquina();

-- ─── Privilégio de execução ──────────────────────────────────────────────
--
-- O molde de 20260924120000: revoga de todos, concede a quem escreve. O
-- gatilho dispara para qualquer papel que escreva em `vagas`; o privilégio de
-- execução só impede a função de virar chamada avulsa.

do $$
declare
  papel text;
  fn text := 'public.vagas_respeitam_a_maquina()';
begin
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
end $$;

-- O PostgREST guarda o schema em cache.
notify pgrst, 'reload schema';
