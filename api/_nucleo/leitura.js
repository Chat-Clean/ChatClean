/**
 * A leitura do servidor — e por que ela é tão estreita.
 *
 * ─── SEM CHAVE DE SERVIÇO ─────────────────────────────────────────────────
 *
 * Este módulo lê com a **chave publicável**, a mesma que chega ao navegador. A
 * chave de serviço vive em `acesso.js` e é do caminho de ESCRITA; trazê-la para
 * cá daria a um caminho que só lê o poder de escrever tudo. Nada aqui a menciona
 * — e `verificar:escrita` cobra isso por lista de permissão.
 *
 * ─── E SEM CONSULTA LIVRE ─────────────────────────────────────────────────
 *
 * Ele também não consulta tabela. As três chamadas são funções de banco de
 * propósito único (Story 4.2), que devolvem exatamente o que a entrega precisa:
 * a situação de um endereço, os Posts no ar, e quando é a próxima publicação.
 * Uma consulta livre aqui devolveria o que a política libera — e a política
 * esconde justamente a diferença entre arquivado e inexistente, que é a razão
 * de as funções existirem.
 */

import {
  CAMPOS_DE_CONTEUDO,
  ehSituacaoDaEntrega,
  INEXISTENTE,
  SITUACOES_SEM_CONTEUDO,
} from "../../src/domain/blog/entrega.js";

/** Os nomes de ambiente que servem, em ordem de preferência. */
const NOMES_DA_URL = Object.freeze(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
const NOMES_DA_CHAVE = Object.freeze([
  "SUPABASE_CHAVE_PUBLICAVEL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
]);

export const DEFEITO_SEM_AMBIENTE =
  "A leitura do servidor não foi configurada: defina a URL do projeto e a chave " +
  "PUBLICÁVEL no ambiente. A chave de serviço não serve aqui — este caminho só lê.";

/** As três funções que este módulo pode chamar. Lista fechada. */
export const FUNCOES_DA_ENTREGA = Object.freeze([
  "situacao_do_endereco",
  "posts_no_ar",
  "proxima_publicacao",
]);

function doAmbiente(nomes, ambiente) {
  for (const nome of nomes) {
    const valor = ambiente?.[nome];
    if (typeof valor === "string" && valor.trim() !== "") return valor.trim();
  }
  return null;
}

/**
 * Chama uma das funções de banco. Nunca lança; devolve resultado tipado.
 *
 * `buscar` é injetável pela mesma razão que na camada de dados: o caminho de
 * falha se exercita sem rede, e sem a ferramenta de verificação precisar de um
 * projeto de pé para provar o que ela decide.
 */
export async function chamar(
  nome,
  argumentos = {},
  { ambiente = process.env, buscar = globalThis.fetch } = {},
) {
  if (!FUNCOES_DA_ENTREGA.includes(nome)) {
    /* LISTA DE PERMISSÃO. Um nome montado a partir de dado que chegou da rede
       viraria chamada arbitrária de função — e o dia em que isso acontecesse
       ninguém saberia, porque o erro seria do banco e não daqui. */
    return {
      ok: false,
      defeito: `\`${nome}\` não é uma das funções da entrega.`,
    };
  }

  const url = doAmbiente(NOMES_DA_URL, ambiente);
  const chave = doAmbiente(NOMES_DA_CHAVE, ambiente);
  if (url === null || chave === null) {
    return { ok: false, defeito: DEFEITO_SEM_AMBIENTE };
  }

  try {
    const resposta = await buscar(`${url.replace(/\/+$/, "")}/rest/v1/rpc/${nome}`, {
      method: "POST",
      headers: {
        apikey: chave,
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(argumentos),
    });
    if (!resposta.ok) {
      return {
        ok: false,
        defeito: `A leitura de \`${nome}\` respondeu ${resposta.status}.`,
      };
    }
    return { ok: true, dados: await resposta.json() };
  } catch (erro) {
    return {
      ok: false,
      defeito: `A leitura de \`${nome}\` não completou: ${erro?.message ?? erro}`,
    };
  }
}

/**
 * A situação de um endereço.
 *
 * A guarda de conteúdo é repetida AQUI de propósito. O banco já não devolve
 * conteúdo fora da situação no ar — mas este módulo é o que as Stories 4.3 em
 * diante consomem, e uma segunda camada que apaga o que não devia vir custa
 * quase nada e fecha o caso de a função ser trocada por uma versão frouxa sem
 * ninguém reler este arquivo.
 */
export async function situacaoDoEndereco(slug, opcoes = {}) {
  const r = await chamar("situacao_do_endereco", { p_slug: slug ?? null }, opcoes);
  if (!r.ok) return r;

  const linha = Array.isArray(r.dados) ? r.dados[0] : r.dados;
  const situacao = linha?.situacao;
  if (!ehSituacaoDaEntrega(situacao)) {
    return { ok: true, situacao: INEXISTENTE, slugAtual: null, post: null };
  }

  if (SITUACOES_SEM_CONTEUDO.includes(situacao)) {
    const vazando = CAMPOS_DE_CONTEUDO.filter(
      (campo) => linha[campo] !== null && linha[campo] !== undefined,
    );
    if (vazando.length > 0) {
      /* NÃO É PARA ACONTECER, e por isso vira defeito nomeado em vez de ser
         limpo em silêncio: se acontecer, a função de banco mudou. */
      return {
        ok: false,
        defeito:
          `A leitura devolveu conteúdo numa situação que não pode ter: ` +
          `${situacao} trouxe [${vazando.join(", ")}].`,
      };
    }
    return {
      ok: true,
      situacao,
      slugAtual: typeof linha.slug_atual === "string" ? linha.slug_atual : null,
      post: null,
    };
  }

  const post = {};
  for (const campo of CAMPOS_DE_CONTEUDO) post[campo] = linha[campo] ?? null;
  return {
    ok: true,
    situacao,
    slugAtual: typeof linha.slug_atual === "string" ? linha.slug_atual : null,
    post: Object.freeze(post),
  };
}

/** Os Posts no ar — endereço, título e os dois instantes. */
export async function postsNoAr(opcoes = {}) {
  const r = await chamar("posts_no_ar", {}, opcoes);
  if (!r.ok) return r;
  return { ok: true, posts: Array.isArray(r.dados) ? r.dados : [] };
}

/** O instante da próxima publicação agendada, ou `null` quando não há. */
export async function proximaPublicacao(opcoes = {}) {
  const r = await chamar("proxima_publicacao", {}, opcoes);
  if (!r.ok) return r;
  const valor = Array.isArray(r.dados) ? r.dados[0] : r.dados;
  return { ok: true, instante: typeof valor === "string" && valor !== "" ? valor : null };
}
