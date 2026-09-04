-- ═══════════════════════════════════════════════════════════════════════════
-- LEADS DA API OFICIAL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Quem pede a API Oficial pela landing e segue para o WhatsApp. Uma tabela só:
-- o formulário, a prova de consentimento e de onde a pessoa veio.
--
-- ─── SEM POLÍTICA NENHUMA, NEM DE LEITURA ────────────────────────────────
--
-- Mesma decisão de `pedidos_de_assinatura`, e pelo mesmo motivo: nome, e-mail e
-- telefone são dados pessoais. `anon` e `authenticated` não leem nem escrevem.
-- O único caminho é a função de servidor com a chave de serviço, que ignora RLS
-- e privilégio. Ligar RLS sem criar política NEGA — não é esquecimento.
--
-- ─── POR QUE O ACEITE MORA AQUI, E NÃO NO LOG ────────────────────────────
--
-- A LGPD exige poder demonstrar o consentimento. Isso é ônus de prova, e prova
-- que vive em log rotativo desaparece no mês seguinte. Três colunas guardam a
-- versão do texto aceito, o instante e o IP de origem.
--
-- ─── DUPLICADO NÃO É ERRO ────────────────────────────────────────────────
--
-- Não há `unique` em e-mail nem em telefone, de propósito. A mesma pessoa pode
-- pedir contato duas vezes, com um mês de intervalo, e a segunda vez é
-- informação comercial legítima — não um defeito a ser suprimido. Deduplicar é
-- trabalho de quem atende, não do banco.
--
-- Idempotente: reaplicar em banco já migrado termina sem erro e sem duplicar.

create table if not exists public.leads_da_api_oficial (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),

  -- Onde o lead está no atendimento. O site só escreve 'novo'; o resto é
  -- movimentado por quem atende.
  estado text not null default 'novo',

  -- O formulário. Dado pessoal: sem política de leitura, e fora do log.
  nome text not null,
  email text not null,
  telefone text not null,
  empresa text not null,

  -- Qualificação de uma pergunta só, para o time comercial abrir a conversa
  -- sabendo o tamanho da operação. Opcional de propósito.
  atendentes text,

  -- De onde veio. `origem` é o caminho da página que trouxe o clique; `campanha`
  -- guarda os parâmetros utm_* quando existirem.
  origem text,
  campanha jsonb not null default '{}'::jsonb,

  -- A prova de consentimento.
  aceite_versao text not null,
  aceite_em timestamptz not null default now(),
  aceite_ip text,

  constraint leads_estado_conhecido
    check (estado in ('novo', 'em_contato', 'convertido', 'descartado')),
  constraint leads_nome_nao_vazio check (length(btrim(nome)) > 0),
  constraint leads_email_nao_vazio check (length(btrim(email)) > 0),
  constraint leads_telefone_nao_vazio check (length(btrim(telefone)) > 0),
  constraint leads_empresa_nao_vazia check (length(btrim(empresa)) > 0)
);

-- Quem atende abre a lista pelo mais recente.
create index if not exists leads_da_api_oficial_criado_em_idx
  on public.leads_da_api_oficial (criado_em desc);

-- E filtra por quem ainda não foi atendido.
create index if not exists leads_da_api_oficial_estado_idx
  on public.leads_da_api_oficial (estado, criado_em desc);

alter table public.leads_da_api_oficial enable row level security;

-- Nenhuma policy. A ausência é a regra.
revoke all on public.leads_da_api_oficial from anon, authenticated;

comment on table public.leads_da_api_oficial is
  'Pedidos de contato da landing da API Oficial. Sem policy de RLS: leitura e escrita apenas pela funcao de servidor com a chave de servico.';
