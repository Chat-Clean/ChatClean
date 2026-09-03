-- ═══════════════════════════════════════════════════════════════════════════
-- PEDIDOS DE ASSINATURA, EVENTOS DO ASAAS E PROVISIONAMENTOS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O checkout mensal por Pix e boleto, do lado do banco. Três tabelas, e cada
-- uma existe por um motivo diferente:
--
--   * `pedidos_de_assinatura` — o formulário preenchido, o que foi contratado,
--     os identificadores do Asaas e o estado. É o registro central.
--   * `eventos_do_asaas` — todo webhook recebido, com o `id` do Asaas como
--     CHAVE PRIMÁRIA. É a trava de idempotência da entrada, e a trilha de
--     auditoria de quem disse o quê.
--   * `provisionamentos` — cada tentativa de chamar o webhook que cria a conta,
--     com a resposta. É o que permite reprocessar sem duplicar.
--
-- ─── POR QUE A IDEMPOTÊNCIA MORA AQUI, E NÃO NA APLICAÇÃO ─────────────────
--
-- A API do Asaas **não tem cabeçalho de idempotência**. A documentação deles é
-- explícita: em caso de timeout, consulte antes de repetir, porque repetir cria
-- cobrança duplicada. E os webhooks são entregues no modelo *at least once* —
-- o mesmo evento chega mais de uma vez, sempre com o mesmo `id`.
--
-- Duas travas, as duas no banco, porque `if (jaProcessei)` em JavaScript perde
-- para duas requisições simultâneas e o `unique` não perde:
--
--   1. `pedidos_de_assinatura.referencia_externa` é única. É a string que vai
--      para o `externalReference` do Asaas, e é por ela que consultamos antes
--      de criar qualquer coisa lá.
--   2. `eventos_do_asaas.id` é a chave primária. Evento repetido colide no
--      `insert` e é descartado, sem a aplicação precisar decidir nada.
--
-- ─── NENHUMA POLÍTICA DE ESCRITA, E NENHUMA DE LEITURA ───────────────────
--
-- Diferente das tabelas do blog, aqui nem leitura é liberada: são dados
-- pessoais de cliente — nome, e-mail, telefone, CNPJ. `anon` e `authenticated`
-- não leem nem escrevem. O único caminho é a função de servidor com a chave de
-- serviço, que ignora RLS e privilégio.
--
-- Idempotente: reaplicar em banco já migrado termina sem erro e sem duplicar.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. PEDIDOS
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.pedidos_de_assinatura (
  id uuid primary key default gen_random_uuid(),

  estado text not null default 'rascunho',

  -- O formulário. Dado pessoal: sem política de leitura, e fora do log.
  nome text not null,
  email text not null,
  telefone text not null,
  cnpj text not null,
  razao_social text not null,

  -- O que foi contratado. O valor é o que o SERVIDOR calculou a partir da
  -- tabela do domínio, nunca o que o navegador mandou.
  plano_id text not null,
  usuarios integer not null,
  conexoes integer not null,
  dia_de_vencimento integer not null,
  valor_centavos integer not null,

  -- A amarração com o Asaas.
  --
  -- `referencia_externa` é COLUNA GERADA, e isso é a metade da idempotência que
  -- não depende de ninguém lembrar: ela deriva do `id` no próprio banco, então
  -- não existe caminho em que o que foi para o `externalReference` do Asaas
  -- divirja do pedido. A aplicação não a escreve; ela a lê.
  referencia_externa text
    generated always as ('chatclean:pedido:' || id::text) stored,
  asaas_cliente_id text,
  asaas_assinatura_id text,
  asaas_cobranca_id text,
  fatura_url text,

  -- O consentimento, como prova: versão do texto aceito, quando, de onde.
  termos_versao text not null,
  termos_aceitos_em timestamptz not null default now(),
  termos_ip text,

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.pedidos_de_assinatura is
  'Checkout da assinatura mensal. Dado pessoal: RLS sem política nenhuma, nem de leitura. Escrita só pela função de servidor.';
comment on column public.pedidos_de_assinatura.referencia_externa is
  'Coluna GERADA a partir do id. Vai para externalReference no Asaas e é única: é a trava que impede criar duas assinaturas para o mesmo pedido, já que a API do Asaas não tem cabeçalho de idempotência.';
comment on column public.pedidos_de_assinatura.valor_centavos is
  'Calculado no servidor por src/domain/assinatura/planos.js. Em centavos inteiros: somar reais em ponto flutuante produz 1049.7000000000003.';
comment on column public.pedidos_de_assinatura.termos_versao is
  'Versão do texto que a pessoa aceitou. Sem ela, o aceite não prova nada — o texto muda.';

-- ─── A referência externa é única ────────────────────────────────────────

create unique index if not exists pedidos_de_assinatura_referencia_externa_unica
  on public.pedidos_de_assinatura (referencia_externa);

-- ─── Um pedido pendente por CNPJ, no máximo ──────────────────────────────
--
-- Índice PARCIAL, e o recorte é o ponto: um CNPJ pode assinar hoje, cancelar e
-- assinar de novo — o histórico continua permitido. O que não pode é ter duas
-- cobranças abertas ao mesmo tempo, que é exatamente o que um duplo clique na
-- página produz. O núcleo consulta e reaproveita o pedido pendente; este índice
-- é o que garante quando duas requisições chegam no mesmo instante.

create unique index if not exists pedidos_de_assinatura_um_pendente_por_cnpj
  on public.pedidos_de_assinatura (cnpj)
  where estado in ('rascunho', 'aguardando_pagamento');

-- ─── As restrições ───────────────────────────────────────────────────────
--
-- Todas repetem o que `src/domain/assinatura/` já valida, e a repetição é
-- deliberada: a defesa do banco não confia na aplicação. Se um dia alguém
-- chamar o PostgREST com a chave de serviço direto, a regra continua valendo.

alter table public.pedidos_de_assinatura
  drop constraint if exists pedidos_estado_conhecido;
alter table public.pedidos_de_assinatura
  add constraint pedidos_estado_conhecido check (
    estado in (
      'rascunho',
      'aguardando_pagamento',
      'pago',
      'provisionando',
      'ativo',
      'vencido',
      'cancelado',
      'falha_no_provisionamento'
    )
  );

alter table public.pedidos_de_assinatura
  drop constraint if exists pedidos_plano_conhecido;
alter table public.pedidos_de_assinatura
  add constraint pedidos_plano_conhecido check (
    plano_id in ('starter', 'pro', 'business')
  );

-- As faixas espelham `LIMITES` e `DIA_DE_VENCIMENTO` do domínio. Dia 28 é o
-- teto porque dia 30 não existe em fevereiro.
alter table public.pedidos_de_assinatura
  drop constraint if exists pedidos_dimensionamento_na_faixa;
alter table public.pedidos_de_assinatura
  add constraint pedidos_dimensionamento_na_faixa check (
    usuarios between 1 and 200
    and conexoes between 1 and 30
    and dia_de_vencimento between 1 and 28
  );

alter table public.pedidos_de_assinatura
  drop constraint if exists pedidos_valor_positivo;
alter table public.pedidos_de_assinatura
  add constraint pedidos_valor_positivo check (
    valor_centavos > 0 and valor_centavos <= 100000000
  );

-- CNPJ gravado como catorze dígitos, sem pontuação. Guardar
-- "12.345.678/0001-95" e "12345678000195" na mesma coluna faz o índice único
-- por CNPJ parar de funcionar exatamente quando importa.
alter table public.pedidos_de_assinatura
  drop constraint if exists pedidos_cnpj_normalizado;
alter table public.pedidos_de_assinatura
  add constraint pedidos_cnpj_normalizado check (cnpj ~ '^[0-9]{14}$');

alter table public.pedidos_de_assinatura
  drop constraint if exists pedidos_telefone_normalizado;
alter table public.pedidos_de_assinatura
  add constraint pedidos_telefone_normalizado check (telefone ~ '^[0-9]{10,11}$');

alter table public.pedidos_de_assinatura
  drop constraint if exists pedidos_email_com_forma;
alter table public.pedidos_de_assinatura
  add constraint pedidos_email_com_forma check (
    email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[a-zA-Z]{2,}$'
    and length(email) <= 254
    and email = lower(email)
  );

alter table public.pedidos_de_assinatura
  drop constraint if exists pedidos_textos_com_teto;
alter table public.pedidos_de_assinatura
  add constraint pedidos_textos_com_teto check (
    length(nome) between 3 and 120
    and length(razao_social) between 3 and 200
    and length(termos_versao) between 1 and 40
  );

-- ─── A transição de estado é defendida no banco ──────────────────────────
--
-- A tabela de transições existe em `src/domain/assinatura/pedido.js`, e existe
-- de novo aqui. Não é duplicação por descuido: sem esta função, um `update`
-- feito à mão no painel do Supabase poderia levar um pedido de `cancelado`
-- direto para `ativo`, e o provisionamento aconteceria sem pagamento.

create or replace function public.transicao_do_pedido_e_permitida(de text, para text)
  returns boolean
  language sql
  immutable
  parallel safe
  set search_path = ''
as $fn$
  select case
    when de = para then true
    when de = 'rascunho' then para in ('aguardando_pagamento', 'cancelado')
    when de = 'aguardando_pagamento' then para in ('pago', 'vencido', 'cancelado')
    when de = 'pago' then para = 'provisionando'
    when de = 'provisionando' then para in ('ativo', 'falha_no_provisionamento')
    when de = 'falha_no_provisionamento' then para = 'provisionando'
    when de = 'vencido' then para in ('pago', 'cancelado')
    when de = 'ativo' then para = 'cancelado'
    when de = 'cancelado' then false
    else false
  end;
$fn$;

comment on function public.transicao_do_pedido_e_permitida(text, text) is
  'Lista de PERMISSÃO das transições de estado do pedido. Espelha TRANSICOES em src/domain/assinatura/pedido.js.';

create or replace function public.recusar_transicao_invalida()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if not public.transicao_do_pedido_e_permitida(old.estado, new.estado) then
    raise exception
      'transição de estado recusada: % → %', old.estado, new.estado
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists pedidos_transicao_defendida on public.pedidos_de_assinatura;
create trigger pedidos_transicao_defendida
  before update of estado on public.pedidos_de_assinatura
  for each row
  execute function public.recusar_transicao_invalida();

-- ─── `atualizado_em` mantido pelo banco ──────────────────────────────────
--
-- Reaproveita `public.tocar_atualizado_em()`, criada na Story 1.2.

drop trigger if exists pedidos_tocar_atualizado_em on public.pedidos_de_assinatura;
create trigger pedidos_tocar_atualizado_em
  before update on public.pedidos_de_assinatura
  for each row
  execute function public.tocar_atualizado_em();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. EVENTOS DO ASAAS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `id` é o identificador do evento no Asaas (formato `evt_...`), e é a chave
-- primária. Isso É a idempotência: `insert ... on conflict do nothing` e o
-- segundo envio do mesmo evento não vira segundo processamento.

create table if not exists public.eventos_do_asaas (
  id text primary key,
  evento text not null,
  pedido_id uuid references public.pedidos_de_assinatura (id) on delete set null,
  corpo jsonb not null,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  erro text
);

comment on table public.eventos_do_asaas is
  'Todo webhook recebido do Asaas. A chave primária é o id do evento no Asaas: entrega at-least-once, então evento repetido colide aqui em vez de virar processamento duplicado.';
comment on column public.eventos_do_asaas.processado_em is
  'Nulo enquanto pendente. Persistir primeiro e processar depois é o que permite responder 200 rápido — 15 falhas consecutivas fazem o Asaas pausar a fila, e evento parado é descartado em 14 dias.';

alter table public.eventos_do_asaas
  drop constraint if exists eventos_id_com_forma;
alter table public.eventos_do_asaas
  add constraint eventos_id_com_forma check (
    length(id) between 3 and 200 and id !~ '[[:space:]]'
  );

alter table public.eventos_do_asaas
  drop constraint if exists eventos_nome_com_forma;
alter table public.eventos_do_asaas
  add constraint eventos_nome_com_forma check (evento ~ '^[A-Z_]{3,60}$');

-- Fila de pendentes: índice parcial, porque a consulta só olha o que não foi
-- processado — e essa fatia é minúscula perto do histórico.
create index if not exists eventos_do_asaas_pendentes
  on public.eventos_do_asaas (recebido_em)
  where processado_em is null;

create index if not exists eventos_do_asaas_por_pedido
  on public.eventos_do_asaas (pedido_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. PROVISIONAMENTOS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cada tentativa de chamar o webhook que cria a conta do cliente. O par
-- (pedido, tentativa) é único: uma retentativa que corresse duas vezes com o
-- mesmo número esbarra no índice, e não em `if`.

create table if not exists public.provisionamentos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos_de_assinatura (id) on delete cascade,
  tentativa integer not null,
  chave_de_idempotencia text not null,
  enviado_em timestamptz not null default now(),
  respondido_em timestamptz,
  status_http integer,
  resposta text,
  ok boolean not null default false
);

comment on table public.provisionamentos is
  'Tentativas de chamar o webhook de criação da conta. A chave de idempotência é enviada no cabeçalho para o outro lado poder descartar repetição.';

alter table public.provisionamentos
  drop constraint if exists provisionamentos_tentativa_positiva;
alter table public.provisionamentos
  add constraint provisionamentos_tentativa_positiva check (
    tentativa between 1 and 20
  );

alter table public.provisionamentos
  drop constraint if exists provisionamentos_resposta_com_teto;
alter table public.provisionamentos
  add constraint provisionamentos_resposta_com_teto check (
    resposta is null or length(resposta) <= 4000
  );

create unique index if not exists provisionamentos_pedido_e_tentativa
  on public.provisionamentos (pedido_id, tentativa);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RLS: NENHUMA POLÍTICA, EM NENHUMA DAS TRÊS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ausência de política já nega tudo sob RLS. A revogação de privilégio é o
-- segundo cadeado: se alguém criar uma política por engano no futuro, ela
-- ainda esbarra em `revoke`. E aqui `select` também é revogado — nas tabelas do
-- blog a leitura é liberada porque o conteúdo é público; estes dados não são.

alter table public.pedidos_de_assinatura enable row level security;
alter table public.eventos_do_asaas enable row level security;
alter table public.provisionamentos enable row level security;

revoke all on public.pedidos_de_assinatura from anon;
revoke all on public.pedidos_de_assinatura from authenticated;
revoke all on public.eventos_do_asaas from anon;
revoke all on public.eventos_do_asaas from authenticated;
revoke all on public.provisionamentos from anon;
revoke all on public.provisionamentos from authenticated;
