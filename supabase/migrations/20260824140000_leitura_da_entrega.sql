-- ─── Story 4.2: leitura do servidor por funções de propósito único ──────────
--
-- A rota do blog precisa distinguir QUATRO situações para responder com
-- honestidade: endereço no ar, endereço aposentado, Post arquivado e endereço
-- que nunca existiu. A política de leitura anônima esconde três delas — para
-- quem não tem sessão, arquivado e rascunho são indistinguíveis de inexistente.
--
-- A saída fácil seria dar à função de servidor a chave de serviço, que enxerga
-- tudo. Seria trocar um problema pequeno por um enorme: a chave que pode
-- ESCREVER tudo, num caminho que só precisa ler.
--
-- Então nascem três funções de PROPÓSITO ÚNICO, `security definer`, que veem
-- além da política e devolvem exatamente o que a entrega precisa. O que elas
-- enxergam a mais é UM BIT: que um endereço existe e está arquivado. É o preço
-- de responder "esse artigo se foi" em vez de mentir que nunca existiu, e está
-- declarado aqui para ninguém precisar deduzir depois.
--
-- ─── O QUE NÃO MUDA ─────────────────────────────────────────────────────────
--
-- `posts_leitura_anonima` fica exatamente como está. Estas funções não a
-- afrouxam: elas contornam de forma controlada, num caminho estreito e nomeado.

-- ─── A situação de um endereço, como a ENTREGA a enxerga ────────────────────
--
-- É outro vocabulário que o Estado do Post. O Estado é do domínio de quem
-- escreve — rascunho, agendado, publicado, arquivado. A situação é do domínio
-- de quem entrega. Dois agendados com datas diferentes têm o MESMO Estado e
-- situações opostas, e um endereço aposentado não tem Estado nenhum.
--
-- Não é um tipo enumerado no banco de propósito: o vocabulário vive em
-- `src/domain/blog/entrega.js`, e a verificação compara as duas listas. Um
-- enum aqui seria uma terceira declaração da mesma coisa.

drop function if exists public.situacao_do_endereco(text);

create or replace function public.situacao_do_endereco(p_slug text)
  returns table (
    situacao text,
    slug_atual text,
    post_id uuid,
    titulo text,
    resumo text,
    conteudo_html text,
    autor_nome text,
    imagem_url text,
    imagem_alt text,
    seo_titulo text,
    seo_descricao text,
    seo_imagem_url text,
    categoria_nome text,
    publicado_em timestamptz,
    atualizado_em timestamptz
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_post public.posts%rowtype;
  v_alvo uuid;
  v_visivel boolean;
begin
  -- ENDEREÇO TORTO NÃO VIRA CONSULTA. O formato é o mesmo que a coluna cobra;
  -- o que não pode ter sido gravado não precisa ser procurado.
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    return query select 'inexistente'::text, null::text, null::uuid, null::text,
      null::text, null::text, null::text, null::text, null::text, null::text,
      null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  select * into v_post from public.posts p where p.slug = p_slug;

  if found then
    -- A MESMA REGRA DA POLÍTICA, e não uma segunda opinião sobre visibilidade.
    v_visivel := v_post.estado in ('publicado', 'agendado')
                 and v_post.publicado_em is not null
                 and v_post.publicado_em <= now();

    if v_visivel then
      -- NO AR: aqui, e SÓ aqui, o conteúdo vem junto.
      return query
        select 'no-ar'::text, v_post.slug, v_post.id, v_post.titulo, v_post.resumo,
               v_post.conteudo_html, v_post.autor_nome, v_post.imagem_url,
               v_post.imagem_alt, v_post.seo_titulo, v_post.seo_descricao,
               v_post.seo_imagem_url,
               (select c.nome from public.categorias c where c.id = v_post.categoria_id),
               v_post.publicado_em, v_post.atualizado_em;
      return;
    end if;

    if v_post.estado = 'arquivado' then
      -- ARQUIVADO: a situação, e NADA MAIS. É o bit que justifica `definer`.
      -- Devolver a linha com um campo de situação ao lado deixaria o vazamento
      -- a um `if` de distância, e o `if` errado nunca é acusado por nada.
      return query select 'arquivado'::text, v_post.slug, null::uuid, null::text,
        null::text, null::text, null::text, null::text, null::text, null::text,
        null::text, null::text, null::text, null::timestamptz, null::timestamptz;
      return;
    end if;

    -- RASCUNHO E AGENDADO POR VIR são INDISTINGUÍVEIS de nunca ter existido.
    -- É a garantia da Story 2.13, e ela não se afrouxa aqui: nem o endereço
    -- volta, porque devolvê-lo já confirmaria que ele está tomado.
    return query select 'inexistente'::text, null::text, null::uuid, null::text,
      null::text, null::text, null::text, null::text, null::text, null::text,
      null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  -- ENDEREÇO APOSENTADO. Só redireciona se o alvo estiver VISÍVEL: mandar o
  -- rastreador para um endereço que responde inexistente gasta duas viagens
  -- para dar a mesma resposta, e ensina que o endereço antigo é válido. A
  -- camada de dados já decidiu isso na Story 2.15.
  select s.post_id into v_alvo
    from public.slugs_antigos s
   where s.slug = p_slug;

  if found then
    select * into v_post from public.posts p where p.id = v_alvo;
    if found
       and v_post.estado in ('publicado', 'agendado')
       and v_post.publicado_em is not null
       and v_post.publicado_em <= now() then
      return query select 'redirecionado'::text, v_post.slug, null::uuid, null::text,
        null::text, null::text, null::text, null::text, null::text, null::text,
        null::text, null::text, null::text, null::timestamptz, null::timestamptz;
      return;
    end if;
  end if;

  return query select 'inexistente'::text, null::text, null::uuid, null::text,
    null::text, null::text, null::text, null::text, null::text, null::text,
    null::text, null::text, null::text, null::timestamptz, null::timestamptz;
end;
$$;

comment on function public.situacao_do_endereco(text) is
  'Resolve um endereço para o vocabulário fechado da entrega: no-ar, arquivado, redirecionado, inexistente. Conteúdo vem SÓ na situação no-ar — nas outras os campos são nulos, e isso é medido coluna a coluna pela verificação. Rascunho e agendado por vir são indistinguíveis de inexistente (Story 2.13). Endereço aposentado cujo alvo não está visível responde inexistente, e não redirecionado. É security definer porque distinguir arquivado de inexistente exige ver um bit que a política de leitura anônima esconde — e é esse bit, e nada além dele, que ela devolve a mais.';

-- ─── Os Posts no ar, para o mapa do site e a listagem servida ───────────────
--
-- Esta poderia ser `invoker`: a política já libera exatamente o que ela
-- devolve. É `definer` pelo mesmo motivo que a irmã — para que a REGRA de
-- visibilidade viva num lugar só. Duas funções da mesma família, uma lendo a
-- política e outra escrevendo a condição à mão, divergiriam no dia em que a
-- política mudasse.

drop function if exists public.posts_no_ar();

create or replace function public.posts_no_ar()
  returns table (
    slug text,
    titulo text,
    publicado_em timestamptz,
    atualizado_em timestamptz
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select p.slug, p.titulo, p.publicado_em, p.atualizado_em
    from public.posts p
   where p.estado in ('publicado', 'agendado')
     and p.publicado_em is not null
     and p.publicado_em <= now()
   order by p.publicado_em desc, p.id desc;
$$;

comment on function public.posts_no_ar() is
  'Os Posts visíveis agora, com o mínimo que o mapa do site e a listagem servida precisam: endereço, título e os dois instantes. Sem conteúdo, sem resumo e sem imagem — quem precisa deles resolve o endereço um a um. Rascunho e agendado por vir nunca aparecem.';

-- ─── Quando é a próxima publicação futura ───────────────────────────────────
--
-- Um agendado vira visível sozinho, pela passagem do tempo, sem ninguém
-- escrever nada. Quem serve com cache precisa saber até quando a resposta de
-- hoje continua verdadeira — é a Story 4.9 que usa isto.
--
-- Devolve NULO quando não há nenhum. Nulo é ausência; uma data inventada seria
-- uma promessa de que algo muda naquele instante.

drop function if exists public.proxima_publicacao();

create or replace function public.proxima_publicacao()
  returns timestamptz
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select min(p.publicado_em)
    from public.posts p
   where p.estado = 'agendado'
     and p.publicado_em is not null
     and p.publicado_em > now();
$$;

comment on function public.proxima_publicacao() is
  'O instante da próxima publicação agendada, ou NULO quando não há nenhuma. Nulo é ausência — data inventada seria promessa de que algo muda naquele instante. Não revela nada do Post: só quando o conjunto do que é visível pode mudar sozinho.';

-- ─── Privilégio: as três são do papel ANÔNIMO ───────────────────────────────
--
-- `security definer` roda com os privilégios de quem a criou, então conceder
-- execução é a decisão inteira — e por isso ela é explícita, papel a papel, e
-- revogada de `public` antes. Conceder a `public` daria execução a qualquer
-- papel futuro sem ninguém decidir.

do $$
declare
  papel text;
  fn text;
begin
  foreach fn in array array[
    'public.situacao_do_endereco(text)',
    'public.posts_no_ar()',
    'public.proxima_publicacao()'
  ] loop
    execute format('revoke execute on function %s from public', fn);
    foreach papel in array array['anon', 'authenticated', 'postgres', 'service_role'] loop
      if exists (select 1 from pg_roles where rolname = papel) then
        execute format('grant execute on function %s to %I', fn, papel);
      end if;
    end loop;
  end loop;
end $$;

-- O PostgREST guarda o schema em cache; sem o aviso, as funções novas só
-- apareceriam no próximo recarregamento dele.
notify pgrst, 'reload schema';
