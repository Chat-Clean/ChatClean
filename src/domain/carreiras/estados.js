/**
 * O vocabulário fechado de Estado da Vaga, e o da situação de um endereço
 * público de Vaga.
 *
 * Domínio puro, no molde de `src/domain/blog/estados.js`: nenhuma dependência
 * de React, de Supabase ou de armazenamento. O servidor o importa em Node e a
 * tela no navegador.
 *
 * A regra que sustenta o fechamento é a mesma do Post: valor fora da lista
 * FALHA ALTO. Um quarto Estado só entra editando este arquivo, e a ferramenta
 * `verificar:carreiras` compara esta lista com o enum `public.estado_vaga`.
 *
 * O par de cor REUSA os tokens de Estado do Painel (`--state-*`), sem token
 * novo: Rascunho é o rascunho do Post, Aberta usa o par de "publicado" (está
 * no ar) e Encerrada usa o de "arquivado" (saiu do ar, o registro fica).
 */

import { rotuloDoEstado } from "../blog/estados.js";

/** As três chaves, na ordem do ciclo de vida. */
export const ESTADOS_DA_VAGA = Object.freeze(["rascunho", "aberta", "encerrada"]);

/** O Estado em que toda Vaga nasce: o mesmo padrão da coluna no banco. */
export const ESTADO_INICIAL_DA_VAGA = "rascunho";

const CATALOGO = Object.freeze({
  rascunho: Object.freeze({
    /* A MESMA palavra do Rascunho do Post, lida do vocabulário dele: é a
       única palavra que os dois vocabulários compartilham, e ela não se
       escreve à mão fora de `domain/blog/estados.js`. "Aberta" e
       "Encerrada", logo abaixo, são o vocabulário PRÓPRIO da Vaga, e é aqui,
       neste catálogo, que ele é declarado. */
    rotulo: rotuloDoEstado("rascunho"),
    fundo: "var(--state-rascunho-bg)",
    tinta: "var(--state-rascunho-ink)",
  }),
  aberta: Object.freeze({
    rotulo: "Aberta",
    fundo: "var(--state-publicado-bg)",
    tinta: "var(--state-publicado-ink)",
  }),
  encerrada: Object.freeze({
    rotulo: "Encerrada",
    fundo: "var(--state-arquivado-bg)",
    tinta: "var(--state-arquivado-ink)",
  }),
});

/**
 * `true` apenas para uma das três chaves. Não lança: é para quem PRECISA
 * testar valor que veio de fora (um filtro, o servidor).
 */
export function ehEstadoDaVaga(valor) {
  return typeof valor === "string" && Object.hasOwn(CATALOGO, valor);
}

/**
 * A aparência do Estado da Vaga: `{ rotulo, fundo, tinta }`, congelada.
 *
 * Lança para qualquer valor fora da lista, inclusive `undefined`, `null`,
 * string vazia e variação de caixa. Estado desconhecido é erro de programação:
 * uma pílula em branco seria pior do que a exceção.
 */
export function aparenciaDoEstadoDaVaga(estado) {
  if (!ehEstadoDaVaga(estado)) {
    throw new Error(
      `Estado de Vaga desconhecido: ${JSON.stringify(estado)}. ` +
        `O vocabulário é fechado, os únicos valores são: ${ESTADOS_DA_VAGA.join(", ")}.`,
    );
  }
  return CATALOGO[estado];
}

/** A palavra por extenso do Estado. Mesma regra de falha alto. */
export function rotuloDoEstadoDaVaga(estado) {
  return aparenciaDoEstadoDaVaga(estado).rotulo;
}

/* ─── A situação de um endereço público de Vaga ─────────────────────────────
 *
 * É outro vocabulário que o Estado: o Estado é de quem escreve, a situação é
 * de quem ENTREGA. Rascunho e endereço que nunca existiu têm a MESMA situação
 * (inexistente), e é isso que impede um Rascunho de vazar por um 404 diferente.
 * A função de banco `situacao_da_vaga` devolve exatamente estas três palavras,
 * e a verificação compara as duas listas.
 */

export const SITUACAO_ABERTA = "aberta";
export const SITUACAO_ENCERRADA = "encerrada";
export const SITUACAO_INEXISTENTE = "inexistente";

export const SITUACOES_DA_VAGA = Object.freeze([
  SITUACAO_ABERTA,
  SITUACAO_ENCERRADA,
  SITUACAO_INEXISTENTE,
]);

export function ehSituacaoDaVaga(valor) {
  return typeof valor === "string" && SITUACOES_DA_VAGA.includes(valor);
}

/**
 * Os campos que só a situação `aberta` carrega. Na Encerrada vêm só o título
 * e o Slug; na inexistente, nada. A camada de dados apaga estes campos fora
 * da Aberta, como segunda trava sobre o que o banco já garante.
 */
export const CAMPOS_SO_DA_ABERTA = Object.freeze([
  "id",
  "resumo",
  "descricao_html",
  "departamento",
  "departamento_cor",
  "tipo",
  "equivalente_jobposting",
  "nivel",
  "nivel_cor",
  "modalidade",
  "localizacao",
  "link_de_candidatura",
  "aberta_em",
  "atualizado_em",
]);
