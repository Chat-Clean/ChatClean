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
 * Ele também não consulta tabela. As chamadas são funções de banco de
 * propósito único (Story 4.2 e 5.2), que devolvem só o que a entrega precisa:
 * situação de endereço, Posts no ar, próxima publicação, situação de Vaga e Vagas Abertas.
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

/**
 * As funções que este módulo pode chamar. Lista fechada, e a ORDEM importa:
 * as três do Blog vêm primeiro, e as duas de Carreiras (Story 5.2) entram NO
 * FIM, porque a verificação usa `FUNCOES_DA_ENTREGA[0]`.
 */
export const FUNCOES_DA_ENTREGA = Object.freeze([
  "situacao_do_endereco",
  "posts_no_ar",
  "proxima_publicacao",
  "situacao_da_vaga",
  "vagas_abertas",
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
  { ambiente = process.env, buscar = globalThis.fetch, sinal = null } = {},
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
      /* O sinal de cancelamento só vai quando alguém o passou (Story 5.9: o
         prazo da leitura das Vagas). Sem ele, a chamada é a de antes. */
      ...(sinal === null ? {} : { signal: sinal }),
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

/* ─── As Vagas (Story 5.8) ───────────────────────────────────────────────── */

/* Os imports de Carreiras moram AQUI, e não no topo: o topo é do Blog, e a
   verificação de travessão aponta exceções por NÚMERO de linha dele. ESM iça
   toda declaração de import, então o lugar não muda o comportamento. */
import {
  CAMPOS_SO_DA_ABERTA,
  ehSituacaoDaVaga,
  SITUACAO_ABERTA,
  SITUACAO_ENCERRADA,
  SITUACAO_INEXISTENTE,
  SITUACOES_DA_VAGA,
} from "../../src/domain/carreiras/estados.js";
import { FORMATO_DE_SLUG, LIMITES_DA_VAGA } from "../../src/domain/carreiras/vaga.js";

/*
 * As duas leituras de Carreiras, pelas mesmas `chamar` e chave publicável do
 * Blog. A forma da resposta é CONFERIDA aqui: corpo torto é falha de leitura
 * (a página responde 500 com o shell), e nunca "Vaga inexistente" (um 404
 * inventado seria guardado pelo buscador como verdade).
 */

/**
 * Os campos que esta leitura LÊ da linha de `situacao_da_vaga`, e só eles.
 * Exportados para a verificação conferir, contra o catálogo do banco, que
 * cada um existe entre as colunas de retorno da função (revisão da 5.8).
 */
export const CAMPOS_LIDOS_DA_SITUACAO = Object.freeze(["situacao", "slug", "titulo", ...CAMPOS_SO_DA_ABERTA]);

/** Os campos que esta leitura LÊ de cada linha de `vagas_abertas`. */
export const CAMPOS_LIDOS_DAS_ABERTAS = Object.freeze([
  "situacao",
  "slug",
  "titulo",
  /* Story 5.9: o Resumo vai para o `/llms.txt`. A RPC já o devolvia. */
  "resumo",
  "modalidade",
  "localizacao",
  "aberta_em",
  "atualizado_em",
]);

function ehObjetoDaLeitura(valor) {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

function textoCheio(valor) {
  return typeof valor === "string" && valor.trim() !== "";
}

/** Texto ou nulo: toda coluna lida é `text`, `uuid` ou `timestamptz`. */
function textoOuNulo(valor) {
  return valor === null || valor === undefined || typeof valor === "string";
}

/** Os campos da linha com tipo errado (objeto, número, lista onde se espera texto). */
function camposDeTipoErrado(linha, campos) {
  return campos.filter((campo) => !textoOuNulo(linha[campo]));
}

/** O Slug que pode virar consulta: o formato e o teto da coluna. */
export function ehSlugDeVagaConsultavel(slug) {
  return (
    typeof slug === "string" &&
    slug.length <= LIMITES_DA_VAGA.slug &&
    FORMATO_DE_SLUG.test(slug)
  );
}

/**
 * A situação de um endereço de Vaga: `{ok:true, situacao, vaga}` ou
 * `{ok:false, defeito}`. Nunca lança.
 *
 * - Slug fora do formato é `inexistente` SEM ir ao banco: o endereço torto
 *   não vira consulta, e a resposta é a mesma de um Rascunho.
 * - `aberta` traz a Vaga (título e Slug obrigatórios, todo campo texto ou
 *   nulo; senão, é defeito).
 * - `encerrada` traz SÓ título e Slug, e o Slug no formato. Um campo de
 *   conteúdo preenchido nela é defeito nomeado, e não limpeza silenciosa: se
 *   acontecer, a função de banco mudou.
 * - `inexistente` não traz nada.
 */
export async function situacaoDaVagaServida(slug, opcoes = {}) {
  if (!ehSlugDeVagaConsultavel(slug)) {
    return { ok: true, situacao: SITUACAO_INEXISTENTE, vaga: null };
  }
  const r = await chamar("situacao_da_vaga", { p_slug: slug }, opcoes);
  if (!r.ok) return r;

  if (!Array.isArray(r.dados) || r.dados.length !== 1 || !ehObjetoDaLeitura(r.dados[0])) {
    return {
      ok: false,
      defeito: "A leitura de `situacao_da_vaga` não devolveu exatamente uma linha.",
    };
  }
  const linha = r.dados[0];
  if (!ehSituacaoDaVaga(linha.situacao)) {
    return {
      ok: false,
      defeito: `A leitura de \`situacao_da_vaga\` devolveu uma situação fora do vocabulário (${SITUACOES_DA_VAGA.join(", ")}).`,
    };
  }

  if (linha.situacao === SITUACAO_INEXISTENTE) {
    return { ok: true, situacao: SITUACAO_INEXISTENTE, vaga: null };
  }

  const tortos = camposDeTipoErrado(linha, CAMPOS_LIDOS_DA_SITUACAO);
  if (tortos.length > 0) {
    return {
      ok: false,
      defeito: `A leitura de \`situacao_da_vaga\` devolveu campo com tipo errado: [${tortos.join(", ")}].`,
    };
  }

  if (linha.situacao === SITUACAO_ENCERRADA) {
    const vazando = CAMPOS_SO_DA_ABERTA.filter(
      (campo) => linha[campo] !== null && linha[campo] !== undefined,
    );
    if (vazando.length > 0) {
      return {
        ok: false,
        defeito: `A leitura devolveu conteúdo numa Vaga encerrada: [${vazando.join(", ")}].`,
      };
    }
    if (!ehSlugDeVagaConsultavel(linha.slug)) {
      return { ok: false, defeito: "A leitura devolveu uma Vaga encerrada sem Slug válido." };
    }
    return {
      ok: true,
      situacao: SITUACAO_ENCERRADA,
      vaga: Object.freeze({
        slug: linha.slug,
        titulo: typeof linha.titulo === "string" ? linha.titulo : null,
      }),
    };
  }

  /* ABERTA: a Vaga inteira, por LISTA DE PERMISSÃO (o Slug, o título e os
     campos só da Aberta). Uma coluna nova que a função passasse a devolver
     não atravessa sem alguém a listar. */
  if (!ehSlugDeVagaConsultavel(linha.slug) || !textoCheio(linha.titulo)) {
    return {
      ok: false,
      defeito: "A leitura devolveu uma Vaga aberta sem Slug válido ou sem título.",
    };
  }
  const vaga = {};
  for (const campo of CAMPOS_LIDOS_DA_SITUACAO) {
    if (campo !== "situacao") vaga[campo] = linha[campo] ?? null;
  }
  return { ok: true, situacao: SITUACAO_ABERTA, vaga: Object.freeze(vaga) };
}

/**
 * As Vagas Abertas, na ordem do banco (`aberta_em` desc): `{ok:true, vagas}`
 * ou `{ok:false, defeito}`. Uma linha torta derruba a leitura inteira, pelo
 * mesmo motivo de `exigirLista` na camada do navegador: uma lista com buraco
 * afirmaria que a Vaga que faltou não existe.
 *
 * TUDO OU NADA, por decisão (Story 5.9): uma linha com campo de tipo errado,
 * inclusive o `resumo` que o `/llms.txt` passou a ler, derruba a leitura
 * inteira. Na listagem servida isso é o 500 de leitura; no mapa e no índice, a
 * degradação sem Vagas.
 */
export async function vagasAbertasServidas(opcoes = {}) {
  const r = await chamar("vagas_abertas", {}, opcoes);
  if (!r.ok) return r;
  if (!Array.isArray(r.dados)) {
    return { ok: false, defeito: "A leitura de `vagas_abertas` não devolveu uma lista." };
  }
  const vagas = [];
  for (const [i, linha] of r.dados.entries()) {
    if (
      !ehObjetoDaLeitura(linha) ||
      linha.situacao !== SITUACAO_ABERTA ||
      !ehSlugDeVagaConsultavel(linha.slug) ||
      !textoCheio(linha.titulo) ||
      camposDeTipoErrado(linha, CAMPOS_LIDOS_DAS_ABERTAS).length > 0
    ) {
      return {
        ok: false,
        defeito: `A leitura de \`vagas_abertas\` devolveu uma linha torta na posição ${i}.`,
      };
    }
    const vaga = {};
    for (const campo of CAMPOS_LIDOS_DAS_ABERTAS) {
      if (campo !== "situacao") vaga[campo] = linha[campo] ?? null;
    }
    vagas.push(Object.freeze(vaga));
  }
  return { ok: true, vagas: Object.freeze(vagas) };
}

/* ─── As Vagas do mapa do site e do /llms.txt (Story 5.9) ────────────────── */

/**
 * O prazo da leitura das Vagas no mapa e no índice. Vencido, a leitura é
 * cancelada e a rota segue sem as Vagas: uma Carreiras pendurada não segura a
 * resposta do Blog além disto. A leitura dos Posts não tem prazo próprio.
 */
export const PRAZO_DA_LEITURA_DAS_VAGAS_MS = 3000;

/**
 * As Vagas Abertas para `/sitemap.xml` e `/llms.txt`: `{ok:true, vagas}` ou
 * `{ok:false, defeito}`, e NUNCA rejeita nem passa do prazo.
 *
 * - a leitura é `vagasAbertasServidas`, a mesma da listagem servida;
 * - o prazo cancela a chamada pelo sinal (`AbortController`) e, se ela não
 *   obedecer, a corrida com o temporizador responde assim mesmo;
 * - o que lança ou rejeita vira `{ok:false}` com o motivo.
 *
 * `ler` e `prazoMs` são injetáveis para a verificação; o resto das opções
 * segue para a leitura (`ambiente`, `buscar`).
 */
export async function vagasIsoladas({
  prazoMs = PRAZO_DA_LEITURA_DAS_VAGAS_MS,
  ler = vagasAbertasServidas,
  ...opcoes
} = {}) {
  const controle = new AbortController();
  let temporizador = null;
  const estouro = new Promise((resolver) => {
    temporizador = setTimeout(() => {
      controle.abort();
      resolver({
        ok: false,
        defeito: `A leitura de \`vagas_abertas\` passou do prazo de ${prazoMs} ms.`,
      });
    }, prazoMs);
  });
  const leitura = Promise.resolve()
    .then(() => ler({ ...opcoes, sinal: controle.signal }))
    .then((r) =>
      r?.ok === true && Array.isArray(r.vagas)
        ? r
        : {
            ok: false,
            defeito:
              typeof r?.defeito === "string" ? r.defeito : "A leitura das Vagas devolveu um resultado sem forma.",
          },
    )
    .catch((erro) => ({
      ok: false,
      defeito: `A leitura das Vagas lançou: ${erro?.message ?? erro}`,
    }));
  try {
    return await Promise.race([leitura, estouro]);
  } finally {
    clearTimeout(temporizador);
  }
}
