-- ═══════════════════════════════════════════════════════════════════════════
-- Story 2.14 — Categorias e Tags: a Categoria vira DADO, e o banco defende.
--
-- Migração NOVA, e não edição das anteriores: migração aplicada é registro
-- histórico, e o aplicador compara o que está registrado com o arquivo e acusa
-- divergência. Três coisas entram aqui, e cada uma existe por um motivo que a
-- aplicação sozinha não cobre.
--
-- ─── 1. EXCLUIR CATEGORIA EM USO PASSA A SER IMPOSSÍVEL ────────────────────
--
-- `posts.categoria_id` foi criada com `on delete set null` na Story 2.1. É o
-- defeito central desta story: hoje excluir uma Categoria **desassocia todos os
-- Posts em silêncio**, e silêncio é o modo de falha que ninguém descobre — o
-- Autor apaga "Analytics" e doze artigos ficam sem classificação sem que nada
-- na tela diga isso.
--
-- Contar Posts na função de servidor produz a mensagem útil ("três posts
-- dependem desta categoria"). O que ela não faz é cobrir os caminhos que não
-- passam por ela: o console do projeto, um script, qualquer detentor da chave
-- de serviço. `restrict` faz o BANCO recusar; a contagem existe para EXPLICAR a
-- recusa, não para ser a recusa.
--
-- ─── 2. DUAS CATEGORIAS NÃO PODEM TER O MESMO NOME ─────────────────────────
--
-- `categorias_slug_unico` existe desde a Story 2.1; unicidade de NOME não. Sem
-- ela, "Analytics" e "Analytics " (com espaço) conviveriam com endereços
-- diferentes e o menu do Editor ofereceria as duas como se fossem coisas
-- diferentes. O servidor normaliza o nome antes de gravar; esta restrição é o
-- que vale mesmo para quem não passou por ele.
--
-- ─── 3. AS SEIS CATEGORIAS DE HOJE VIRAM LINHAS ────────────────────────────
--
-- Elas moravam em constante no fonte, em três lugares que já divergiam entre
-- si: o filtro público listava CINCO — "Novidades" tinha sumido dele, e ninguém
-- percebeu, porque não havia um lugar só que dissesse quais Categorias existem.
-- A semeadura é o lugar só.
--
-- `cor` recebe o VALOR CSS (`var(--categoria-…-bg)`) do vocabulário fechado de
-- `src/domain/blog/categorias.js`, e `icone` recebe a CHAVE do mapa fechado de
-- `src/admin/blog/iconesDeCategoria.js` — exatamente o que os comentários das
-- duas colunas declaram desde a Story 2.1. As duas listas são comparadas por
-- igualdade com as do código por `verificar:supabase`.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. A exclusão de Categoria em uso é recusada pelo banco ──────────────

alter table public.posts drop constraint if exists posts_categoria_id_fkey;

alter table public.posts
  add constraint posts_categoria_id_fkey
  foreign key (categoria_id)
  references public.categorias (id)
  on delete restrict;

comment on column public.posts.categoria_id is
  'Aponta para a Categoria; o Post NÃO guarda o nome dela. É isso que faz renomear acertar todos os Posts sozinho. `on delete restrict`: excluir Categoria em uso é recusado pelo banco, não só pela aplicação.';

-- ─── 2. Unicidade de nome ─────────────────────────────────────────────────

alter table public.categorias drop constraint if exists categorias_nome_unico;

alter table public.categorias
  add constraint categorias_nome_unico unique (nome);

comment on constraint categorias_nome_unico on public.categorias is
  'Duas Categorias não podem ter o mesmo nome. A recusa diz qual já existe — quem a traduz é api/_nucleo/operacoesDaCategoria.js.';

-- ─── 3. As seis Categorias, semeadas ──────────────────────────────────────
--
-- `on conflict (slug) do nothing`: a semeadura é idempotente e NÃO reescreve o
-- que já existe. Uma Categoria renomeada pelo Painel depois desta migração não
-- pode voltar ao nome antigo por causa de uma reaplicação.

insert into public.categorias (nome, slug, icone, cor, ordem) values
  ('Tecnologia', 'tecnologia', 'chip',    'var(--categoria-azul-bg)',      1),
  ('Estratégia', 'estrategia', 'alvo',    'var(--categoria-roxo-bg)',      2),
  ('Analytics',  'analytics',  'grafico', 'var(--categoria-ciano-bg)',     3),
  ('Automação',  'automacao',  'robo',    'var(--categoria-verde-bg)',     4),
  ('Tendências', 'tendencias', 'subindo', 'var(--categoria-ambar-bg)',     5),
  -- "Novidades" existia no Painel e faltava no filtro público desde sempre.
  -- Ela entra aqui como as outras cinco: uma linha, não uma exceção.
  ('Novidades',  'novidades',  'faisca',  'var(--categoria-rosa-bg)',      6)
on conflict (slug) do nothing;
