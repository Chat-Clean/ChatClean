-- Perfis: privilégio explícito, integridade do nome e resiliência do gatilho.
--
-- Story 1.2 — correções da revisão. Migração nova, não edição da anterior:
-- migração já aplicada é registro histórico e não se reescreve; o aplicador
-- compara o que está registrado com o arquivo e acusa divergência.
--
-- O que esta migração resolve:
--   1. A política de leitura existia sem `grant select`. Sob RLS, política e
--      privilégio são cadeados diferentes: sem o privilégio, a leitura falha
--      mesmo com a política permitindo. Funcionava por privilégio padrão do
--      Supabase — dependência implícita que agora vira explícita.
--   2. `atualizado_em` tinha `default now()` e nada que o mantivesse: era uma
--      promessa que o schema não cumpria.
--   3. `nome_exibicao` aceitava string vazia ou só espaços — Post assinado por
--      ninguém.
--   4. Falha no gatilho abortava a criação da Conta. Como contas só nascem
--      pelo console, isso travaria a única via de acesso ao produto. Conta sem
--      perfil é recuperável; conta que não nasce, não.
--   5. `TRUNCATE` não estava entre os privilégios revogados, e RLS não o
--      restringe.

-- ─── 1. Privilégio explícito ─────────────────────────────────────────────

grant select on public.perfis to authenticated;

-- ─── 5. Revogação completa ───────────────────────────────────────────────

revoke insert, update, delete, truncate on public.perfis from anon;
revoke insert, update, delete, truncate on public.perfis from authenticated;

-- ─── 3. Integridade do nome ──────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.perfis'::regclass
       and conname = 'perfis_nome_exibicao_nao_vazio'
  ) then
    alter table public.perfis
      add constraint perfis_nome_exibicao_nao_vazio
      check (btrim(nome_exibicao) <> '' and char_length(nome_exibicao) <= 120);
  end if;
end $$;

-- ─── 2. `atualizado_em` mantido pelo banco ───────────────────────────────

create or replace function public.tocar_atualizado_em()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

comment on function public.tocar_atualizado_em() is
  'Mantém atualizado_em verdadeiro. Sem isto a coluna congelaria no instante da criação.';

drop trigger if exists perfis_tocar_atualizado_em on public.perfis;
create trigger perfis_tocar_atualizado_em
  before update on public.perfis
  for each row
  execute function public.tocar_atualizado_em();

-- ─── 4. Gatilho que não derruba a criação da Conta ───────────────────────

create or replace function public.criar_perfil_da_conta()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  insert into public.perfis (id, nome_exibicao)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'nome_exibicao'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Autor ' || left(new.id::text, 8)
    )
  )
  on conflict (id) do nothing;
  return new;
exception
  when others then
    -- Deliberado: a Conta nasce mesmo se o perfil falhar. Contas só são
    -- criadas pelo console; abortar aqui deixaria a equipe sem acesso.
    -- O aviso fica no log do Postgres e a ferramenta de verificação
    -- acusa qualquer Conta sem perfil.
    raise warning 'perfil não criado para a conta %: %', new.id, sqlerrm;
    return new;
end;
$$;

comment on function public.criar_perfil_da_conta() is
  'Cria o perfil junto da Conta. Metadado ausente não impede a criação: o nome cai para o trecho do e-mail e, na falta dele, para um rótulo derivado do id. Falha do perfil não aborta a Conta.';
