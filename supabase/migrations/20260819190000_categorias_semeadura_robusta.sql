-- ═══════════════════════════════════════════════════════════════════════════
-- Story 2.14 — correção da semeadura de Categorias, e do que a migração
-- anterior AFIRMAVA sobre a unicidade de nome.
--
-- Migração NOVA porque `20260819143000_categorias_como_dado.sql` já foi
-- aplicada, e migração aplicada é registro histórico: o aplicador compara o que
-- está registrado com o arquivo e acusa divergência. Duas coisas entram aqui.
--
-- ─── 1. O COMENTÁRIO DA RESTRIÇÃO AFIRMAVA O QUE ELA NÃO FAZ ───────────────
--
-- Ele dizia que a unicidade de nome impedia "Analytics" e "Analytics " (com
-- espaço) de conviverem. É falso: para o Postgres os dois textos são
-- diferentes, e `unique (nome)` aceita os dois. Quem de fato impede a dupla é o
-- par que já existia — o ENDEREÇO único, porque os dois nomes produzem o mesmo
-- slug, mais a normalização do servidor, que apara e colapsa o espaço interno
-- antes de gravar. A restrição de nome serve a outra coisa, e é boa: ela impede
-- duas Categorias com o MESMO nome exato e endereços diferentes, que é o que
-- faria o menu do Editor oferecer duas linhas indistinguíveis.
--
-- Comentário que afirma garantia que não existe é pior que comentário nenhum:
-- ele é lido como especificação.
--
-- ─── 2. A SEMEADURA PRECISA SER SEGURA POR NOME, E NÃO SÓ POR ENDEREÇO ─────
--
-- A anterior usava `on conflict (slug) do nothing`, que protege contra endereço
-- repetido e NÃO contra nome repetido: num banco onde alguém já tivesse
-- cadastrado "Analytics" com outro endereço, o `insert` violaria
-- `categorias_nome_unico` e derrubaria a migração inteira — que é transacional,
-- então nada seria aplicado e o projeto ficaria travado.
--
-- Aqui a semeadura é reescrita na forma correta: cada linha só entra se NÃO
-- houver outra com aquele nome nem com aquele endereço. Ela é idempotente e não
-- reescreve nada — uma Categoria renomeada pelo Painel (que é o objetivo desta
-- story) continua com o nome que o Autor deu.
--
-- ─── O QUE ESTA MIGRAÇÃO NÃO CONSEGUE DESFAZER ─────────────────────────────
--
-- Se um banco já tivesse nomes DUPLICADOS em `categorias` antes da migração
-- anterior, o `add constraint categorias_nome_unico` daquela teria abortado
-- antes de esta existir. Nada aqui alcança esse caso, e reescrever a anterior é
-- o que a regra do projeto proíbe. O caminho, se ele acontecer, é deduplicar os
-- nomes no banco e reaplicar — e é isto que fica escrito para quem chegar lá.
-- ═══════════════════════════════════════════════════════════════════════════

comment on constraint categorias_nome_unico on public.categorias is
  'Duas Categorias não podem ter o mesmo nome EXATO. Ela NÃO impede "Analytics" e "Analytics " de coexistirem — quem impede é categorias_slug_unico (os dois produzem o mesmo slug) mais a normalização do servidor. A recusa diz qual já existe: api/_nucleo/operacoesDaCategoria.js.';

-- A semeadura, na forma que não derruba a migração num banco com dados.
-- `where not exists` sobre nome E endereço: `on conflict` só alcança UMA
-- restrição por comando, e as duas podem ser violadas.
insert into public.categorias (nome, slug, icone, cor, ordem)
select v.nome, v.slug, v.icone, v.cor, v.ordem
  from (values
    ('Tecnologia', 'tecnologia', 'chip',    'var(--categoria-azul-bg)',      1),
    ('Estratégia', 'estrategia', 'alvo',    'var(--categoria-roxo-bg)',      2),
    ('Analytics',  'analytics',  'grafico', 'var(--categoria-ciano-bg)',     3),
    ('Automação',  'automacao',  'robo',    'var(--categoria-verde-bg)',     4),
    ('Tendências', 'tendencias', 'subindo', 'var(--categoria-ambar-bg)',     5),
    ('Novidades',  'novidades',  'faisca',  'var(--categoria-rosa-bg)',      6)
  ) as v(nome, slug, icone, cor, ordem)
 where not exists (select 1 from public.categorias c where c.nome = v.nome)
   and not exists (select 1 from public.categorias c where c.slug = v.slug);
