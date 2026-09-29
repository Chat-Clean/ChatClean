/**
 * A alteração pendente do Post: o que ainda não foi salvo, e o que se diz
 * sobre isso.
 *
 * As regras genéricas (o retrato canônico, a pergunta "há pendência?", os
 * rótulos do diálogo de saída) moram em `src/admin/comum/pendencia.js`, que
 * serve o Blog e Carreiras. Este arquivo as reexporta com os MESMOS nomes e
 * guarda a única frase que é do Post: sem título, a saída fala "deste post".
 */

import { descricaoDaSaida as descricaoComum } from "../comum/pendencia.js";

export {
  haPendencia,
  instantaneo,
  ROTULO_PARA_FICAR,
  ROTULO_PARA_SAIR,
  TITULO_DA_SAIDA,
} from "../comum/pendencia.js";

/**
 * A consequência, factual e sem alarme: o que se perde, e por quê. O post é
 * nomeado; sem título, a frase diz "deste post".
 */
export function descricaoDaSaida(titulo) {
  return descricaoComum(titulo, "deste post");
}
