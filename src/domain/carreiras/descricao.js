/**
 * A Descrição da Vaga: a projeção reduzida do schema do Blog
 * (`VOCABULARIO_DA_DESCRICAO`), com as frases de Carreiras.
 *
 * Não é uma segunda declaração: nós, marcas, elementos da barra e a regra do
 * link são OS MESMOS objetos da projeção. O que muda aqui são só as mensagens,
 * que no domínio do Blog ficaram neutras de propósito (o Blog não conhece a
 * Vaga). Espelhos em SQL: `descricao_da_vaga_e_permitida` e
 * `html_da_descricao_e_reduzido`.
 */

import {
  VOCABULARIO_DA_DESCRICAO,
  validarDocumentoNoVocabulario,
} from "../blog/schema.js";

export const VOCABULARIO_DA_VAGA = Object.freeze({
  ...VOCABULARIO_DA_DESCRICAO,
  mensagens: Object.freeze({
    vazio: "A descrição da vaga está vazia. Escreva algo antes de salvar.",
    formato:
      "A descrição da vaga não está no formato de documento. Abra a vaga no Painel e salve de novo.",
    rotuloDoConteudo: "Descrição da vaga",
  }),
});

/**
 * Valida (e higieniza) a Descrição contra a projeção. Nunca lança: devolve o
 * mesmo contrato de `validarDocumentoNoVocabulario`.
 */
export function validarDescricao(entrada) {
  return validarDocumentoNoVocabulario(entrada, VOCABULARIO_DA_VAGA);
}
