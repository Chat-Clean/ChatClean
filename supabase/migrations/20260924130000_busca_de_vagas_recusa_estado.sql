-- ═══════════════════════════════════════════════════════════════════════════
-- Story 5.2: a busca do Painel recusa Estado fora do vocabulário SEMPRE.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Em `20260924120000_vagas_e_classificacoes.sql` a conversão do Estado para o
-- enum morava numa CTE (`pedido`). O planejador só avalia a CTE quando há Vaga
-- para cruzar com ela: com a tabela vazia, `buscar_vagas_do_painel(null,
-- 'publicado')` devolvia zero linhas em vez de recusar. A ferramenta
-- verificar:carreiras acusou isso na primeira execução contra o banco.
--
-- A correção converte o Estado ANTES da consulta, em PL/pgSQL: o valor torto
-- é recusado com o erro do enum, haja Vaga ou não. Mesma assinatura e mesmo
-- tipo de retorno, então `create or replace` preserva os privilégios de
-- execução concedidos na migração anterior. A busca em si não muda.
--
-- Só redefine uma função criada neste mesmo épico. Nada anterior é tocado.

create or replace function public.buscar_vagas_do_painel(
  p_termo text default null,
  p_estado text default null
)
  returns setof public.vagas
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $$
declare
  v_estado public.estado_vaga;
  v_termo text;
begin
  -- A conversão acontece aqui, sempre: valor fora do vocabulário lança.
  v_estado := nullif(btrim(coalesce(p_estado, '')), '')::public.estado_vaga;
  v_termo := nullif(
    btrim(regexp_replace(public.normalizar_busca(coalesce(p_termo, '')), '\s+', ' ', 'g')),
    ''
  );

  return query
    select v.*
      from public.vagas v
      cross join lateral (
        select public.normalizar_busca(
          coalesce(v.titulo, '')
          || ' ' || coalesce(
               (select d.nome from public.departamentos d where d.id = v.departamento_id),
               '')
          || ' ' || coalesce(v.localizacao, '')
        ) as texto
      ) b
     where (v_estado is null or v.estado = v_estado)
       and (
         v_termo is null
         or not exists (
              select 1
                from unnest(string_to_array(v_termo, ' ')) as palavra
               where palavra <> ''
                 and position(palavra in b.texto) = 0
            )
       );
end;
$$;

comment on function public.buscar_vagas_do_painel(text, text) is
  'Busca de Vagas do Painel por título, Departamento e Localização, insensível a caixa e a acento, mais o filtro de Estado, convertido para o enum ANTES da consulta: valor fora do vocabulário é recusado mesmo com a tabela vazia. Todas as palavras do termo precisam aparecer. security invoker: a RLS continua sendo a única guardiã.';

notify pgrst, 'reload schema';
