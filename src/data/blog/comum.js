/**
 * O que os três módulos de leitura compartilham: como se obtém cada cliente,
 * o que é um slug, e qual é o teto de uma listagem.
 *
 * Existe porque a alternativa é pior: três cópias da obtenção de cliente, com
 * assinaturas diferentes, fazem a regra "a escolha do cliente é do módulo"
 * virar três regras parecidas — e a primeira que divergir divergirá em
 * silêncio. A exigência de sessão do Painel, em especial, precisa ser
 * declarada UMA vez: é ela que impede o Painel de abrir com o subconjunto
 * anônimo achando que está completo.
 */

import { clienteAutenticado, clientePublico } from "../supabase/clientes.js";
import { deExcecao, ERRO_PERMISSAO, falha, sucesso } from "./resultado.js";

/* ─── Slug ───────────────────────────────────────────────────────────────── */

/**
 * O MESMO formato que a Story 2.1 fixou no banco
 * (`posts_slug_formato`): minúsculas, dígitos e hífen simples entre segmentos.
 *
 * Validar antes de consultar não é zelo: vírgula, ponto e parêntese são
 * METACARACTERES do filtro do PostgREST. Um slug com qualquer um deles produz
 * filtro malformado, 400, e o visitante vê defeito onde deveria ver "página
 * não encontrada" — e o 301 da Story 4.5 quebraria pelo mesmo caminho.
 */
export const FORMATO_DE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Comprimento máximo de `posts.slug` no banco. */
export const TAMANHO_MAXIMO_DO_SLUG = 200;

export function ehSlug(valor) {
  return (
    typeof valor === "string" &&
    valor.length > 0 &&
    valor.length <= TAMANHO_MAXIMO_DO_SLUG &&
    FORMATO_DE_SLUG.test(valor)
  );
}

/** Formato de identificador do banco: `uuid` gerado pelo Postgres. */
export const FORMATO_DE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ehUuid(valor) {
  return typeof valor === "string" && FORMATO_DE_UUID.test(valor.trim());
}

/* ─── Tamanho de página ──────────────────────────────────────────────────── */

/** Teto de segurança: listagem sem limite é varredura sem limite. */
export const LIMITE_PADRAO = 200;
export const LIMITE_MAXIMO = 500;

export function limiteValido(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return LIMITE_PADRAO;
  return Math.min(Math.floor(n), LIMITE_MAXIMO);
}

export function deslocamentoValido(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/* ─── Clientes ───────────────────────────────────────────────────────────── */

/**
 * O cliente de leitura anônima. Instanciar pode lançar `ConfiguracaoAusente`
 * quando falta `.env`; aqui a exceção já vira valor, para que nem o site
 * público caia por falta de ambiente — ele mostra erro de configuração, não
 * uma tela branca.
 */
export function clientePublicoOuFalha(operacao) {
  try {
    return sucesso(clientePublico());
  } catch (excecao) {
    return deExcecao(excecao, operacao);
  }
}

/**
 * O cliente do Painel MAIS a garantia de que existe sessão.
 *
 * Sem sessão, o PostgREST não recusa: ele responde 200 com o subconjunto
 * ANÔNIMO, porque a política `to authenticated` simplesmente não se aplica.
 * O Painel abriria com metade dos posts e nada teria falhado — por isso a
 * ausência de sessão vira `permissao` aqui, explicitamente.
 *
 * `getSession()` não valida nada no servidor (é a lição da Story 1.4) e não é
 * usado para CONCEDER acesso: quem concede continua sendo a RLS. Ele só
 * escolhe qual erro tipado devolver. Sessão forjada passa por esta porta e
 * esbarra no servidor, que responde 401 — e 401 é `permissao` do mesmo jeito.
 */
export async function clienteDoPainelOuFalha(operacao) {
  let cliente;
  try {
    cliente = clienteAutenticado();
  } catch (excecao) {
    return deExcecao(excecao, operacao);
  }
  try {
    const { data, error } = await cliente.auth.getSession();
    if (error) {
      return falha(ERRO_PERMISSAO, {
        operacao,
        detalhe: String(error?.message ?? error),
        status: Number.isFinite(Number(error?.status)) ? Number(error.status) : null,
      });
    }
    if (!data?.session) {
      return falha(ERRO_PERMISSAO, {
        operacao,
        detalhe: "não há sessão ativa — a leitura do Painel exige uma",
      });
    }
    return sucesso(cliente);
  } catch (excecao) {
    return deExcecao(excecao, operacao);
  }
}
