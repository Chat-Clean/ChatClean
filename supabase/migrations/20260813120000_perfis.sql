-- Perfis: o nome de exibição que assina os Posts, vinculado à Conta.
--
-- Story 1.2 — Projeto Supabase com schema versionado.
--
-- Invariantes que esta migração estabelece:
--   * RLS habilitada na mesma migração que cria a tabela.
--   * Leitura para `authenticated`; NENHUMA política de escrita. O único
--     caminho de escrita é a função de servidor (AD-5), que chega no Épico 2.
--   * A função é `security definer` porque escreve em `public` a partir do
--     contexto de `auth` — e por isso fixa `search_path` explicitamente.
--   * Idempotente: reaplicar em banco já migrado termina sem erro e sem
--     duplicar objeto.

-- ─── Tabela ──────────────────────────────────────────────────────────────

create table if not exists public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome_exibicao text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.perfis is
  'Nome de exibição do Autor, vinculado 1:1 à Conta em auth.users. Nasce pelo gatilho on_auth_user_created.';
comment on column public.perfis.nome_exibicao is
  'Assina os Posts. Vem dos metadados da Conta ou é derivado do e-mail.';

-- ─── RLS ─────────────────────────────────────────────────────────────────

alter table public.perfis enable row level security;

-- Leitura para conta autenticada. Todas as contas têm os mesmos poderes:
-- qualquer Autor precisa ler o nome de qualquer outro para exibir assinatura.
drop policy if exists "perfis_leitura_autenticada" on public.perfis;
create policy "perfis_leitura_autenticada"
  on public.perfis
  for select
  to authenticated
  using (true);

-- Nenhuma política de INSERT, UPDATE ou DELETE — deliberado. Ausência de
-- política já nega a escrita sob RLS; a revogação abaixo é o segundo cadeado,
-- para que uma política futura criada por engano ainda esbarre em privilégio.
-- `service_role` ignora RLS e privilégio, e é por ele que a função de servidor
-- do Épico 2 vai escrever.
revoke insert, update, delete on public.perfis from anon;
revoke insert, update, delete on public.perfis from authenticated;

-- ─── Gatilho: Conta e perfil nascem na mesma operação ────────────────────

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
end;
$$;

comment on function public.criar_perfil_da_conta() is
  'Cria o perfil junto da Conta. Metadado ausente nao impede a criacao: o nome cai para o trecho do e-mail e, na falta dele, para um rotulo derivado do id.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.criar_perfil_da_conta();
