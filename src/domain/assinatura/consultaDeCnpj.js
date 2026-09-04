/**
 * A consulta do CNPJ que preenche a razão social, em regra pura.
 *
 * Sem React e sem rede: o que fazer com a resposta, e quando é permitido
 * escrever no campo. Quem fala com a rede é `api/cnpj.js`; quem desenha é
 * `Assinar.jsx`.
 *
 * ─── A RESPOSTA É PENEIRADA, NÃO REPASSADA ───────────────────────────────
 *
 * A consulta pública de CNPJ devolve dezenas de campos, e entre eles o `qsa`:
 * o quadro de sócios, com NOME e CPF parcial de pessoas físicas. Nada disso
 * tem a ver com preencher um campo de formulário, e repassar o corpo inteiro
 * para o navegador seria publicar dado pessoal de terceiro em troca de
 * conveniência.
 *
 * `razaoSocialDaResposta` é lista de permissão de UM campo. Campo novo na
 * fonte não passa a aparecer sozinho.
 *
 * ─── O QUE A PESSOA DIGITOU VENCE O QUE NÓS ADIVINHAMOS ──────────────────
 *
 * `podePreencher` é a regra que impede o caso mais irritante de
 * autopreenchimento: a pessoa corrige a razão social à mão, troca um dígito do
 * CNPJ para conferir, e a correção dela é apagada por uma resposta de rede.
 *
 * Só escrevemos quando o campo está vazio, ou quando ele contém exatamente o
 * que NÓS sugerimos da última vez. Qualquer outra coisa é digitação humana, e
 * digitação humana não se sobrescreve.
 */

import { cnpjEhValido, somenteDigitos } from "./pedido.js";

/** O mesmo teto da coluna `razao_social` e da validação do pedido. */
export const RAZAO_SOCIAL_MAXIMA = 200;

/**
 * Vale consultar este CNPJ?
 *
 * Só com os catorze dígitos completos E os verificadores conferindo. Consultar
 * a cada tecla mandaria treze requisições inúteis por CNPJ digitado, e a
 * décima quarta é a única que pode responder alguma coisa.
 */
export function valeConsultar(bruto) {
  const digitos = somenteDigitos(bruto);
  return digitos.length === 14 && cnpjEhValido(digitos);
}

/**
 * A razão social de uma resposta da consulta pública, ou `null`.
 *
 * Lista de permissão de um campo só. Espaço colapsado, pontas aparadas e teto
 * aplicado aqui: o campo do formulário tem limite, e uma razão social que
 * estoure o limite seria recusada na hora de enviar, depois de a pessoa achar
 * que estava tudo certo.
 */
export function razaoSocialDaResposta(corpo) {
  if (typeof corpo !== "object" || corpo === null) return null;
  const bruto = corpo.razao_social;
  if (typeof bruto !== "string") return null;
  const limpo = bruto.replace(/\s+/g, " ").trim();
  if (limpo === "") return null;
  return limpo.slice(0, RAZAO_SOCIAL_MAXIMA);
}

/**
 * Dá para escrever a sugestão no campo?
 *
 * `atual` é o que está no campo agora; `ultimaSugerida` é o que nós escrevemos
 * por último (ou `null`, se nunca escrevemos). A comparação é frouxa no
 * espaço, porque o campo pode ter ganhado um espaço no fim sem que isso seja
 * uma edição de verdade.
 */
export function podePreencher({ atual, ultimaSugerida }) {
  const valor = typeof atual === "string" ? atual.trim() : "";
  if (valor === "") return true;
  if (typeof ultimaSugerida !== "string") return false;
  return valor === ultimaSugerida.trim();
}
