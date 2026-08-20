-- O endereço da capa aceita `http://` de host LOCAL.
--
-- Story 3.1 — correção. Migração NOVA, não edição da aplicada: o aplicador
-- compara o que está registrado com o arquivo e acusa divergência, e migração
-- aplicada é registro histórico.
--
-- ─── O que a versão anterior impedia ─────────────────────────────────────
--
-- `endereco_de_imagem_e_permitido` aceitava só `https://`. Isso está certo para
-- produção e torna a regra IMPOSSÍVEL DE EXERCITAR: tanto o stack local do
-- Supabase (`supabase start`) quanto o Supabase de mentira de
-- `verificar-escrita.mjs` respondem em `http://127.0.0.1`, então o endereço
-- público que eles produzem era recusado pela própria restrição. A prova de que
-- "o corpo que chega ao banco leva endereço, nunca conteúdo" não tinha como
-- rodar sem rede.
--
-- Uma regra que ninguém consegue exercer é uma regra que ninguém verifica — e
-- afrouxá-la para o teste seria pior: seria uma segunda regra.
--
-- ─── A correção, e por que ela não é um afrouxamento ─────────────────────
--
-- `https://` para qualquer host, e `http://` **só** para `localhost` e
-- `127.0.0.1`. É a MESMA distinção que `problemaNaUrl`, em
-- `api/_nucleo/acesso.js`, já faz desde a Story 2.5 para a URL do projeto —
-- não é um precedente novo, é o mesmo. Um endereço `http://127.0.0.1/…` gravado
-- em produção não alcança nada e não vaza nada; um `http://cdn.exemplo.com/…`
-- continua recusado, que é o caso que importa.
--
-- `[::1]` fica de fora nas duas implementações: o literal de IPv6 exige
-- colchete, que não está no vocabulário de autoridade, e alargá-lo nos dois
-- lados para ganhar um caso que ninguém usa é superfície sem contrapartida.
--
-- Espelho de `enderecoDeImagemPermitido`, de `src/domain/blog/arquivos.js`. As
-- duas continuam comparadas sobre um corpus por `verificar:escrita`.
--
-- Idempotente: `create or replace` reaplicado termina sem erro.

create or replace function public.endereco_de_imagem_e_permitido(endereco text)
  returns boolean
  language sql
  immutable
  parallel safe
  set search_path = ''
as $fn$
  with e as (
    select
      endereco as v,
      endereco ~* '^https://' as com_tls,
      endereco ~* '^http://' as sem_tls,
      case
        when endereco ~* '^https://'
          then regexp_replace(substring(endereco from 9), '[/?#].*$', '')
        when endereco ~* '^http://'
          then regexp_replace(substring(endereco from 8), '[/?#].*$', '')
        else null
      end as autoridade
  )
  select case
    when e.v is null then true
    when e.v = '' then false
    when char_length(e.v) > 2048 then false
    -- Fora de ASCII imprimível (`!` a `~`). Mais duro que "sem espaço" de
    -- propósito: `[[:space:]]` depende do locale e o `\s` do JavaScript inclui
    -- U+00A0 e companhia — as duas implementações divergiriam justamente nos
    -- caracteres que ninguém testa.
    when e.v ~ '[^!-~]' then false
    when e.v ~ '[\\<>"''`{}|^]' then false
    when not (e.com_tls or e.sem_tls) then false
    when e.autoridade is null then false
    when e.autoridade = '' then false
    when strpos(e.autoridade, '@') > 0 then false
    when e.autoridade !~* '^[a-z0-9.-]+(:[0-9]{1,5})?$' then false
    when e.com_tls then true
    -- Sem TLS, só host local.
    else lower(regexp_replace(e.autoridade, ':[0-9]{1,5}$', '')) in ('localhost', '127.0.0.1')
  end
  from e;
$fn$;

comment on function public.endereco_de_imagem_e_permitido(text) is
  'Espelho em SQL de enderecoDeImagemPermitido de src/domain/blog/arquivos.js: lista de PERMISSAO de endereco de imagem — https:// absoluto, e http:// so para host local, a mesma distincao de problemaNaUrl. E ela que torna conteudo de arquivo nao representavel na coluna. As duas sao comparadas sobre um corpus pela ferramenta verificar:escrita.';
