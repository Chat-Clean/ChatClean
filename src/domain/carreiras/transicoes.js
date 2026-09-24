/**
 * A máquina de estados da Vaga (C-FR-13): de cada Estado, o que se pode fazer
 * e para onde isso leva.
 *
 * Domínio puro, como `src/domain/blog/transicoes.js`. A tela DERIVA os botões
 * daqui e o servidor VALIDA a transição contra a mesma tabela: não há segunda
 * lista em lugar nenhum.
 *
 *   Rascunho   → Aberta     (Abrir vaga)
 *   Aberta     → Encerrada  (Encerrar vaga)
 *   Encerrada  → Aberta     (Reabrir vaga)
 *   Rascunho, Encerrada → removida (Excluir vaga)
 *
 * ─── POR QUE A ABERTA NÃO SE EXCLUI ───────────────────────────────────────
 *
 * Uma Vaga Aberta tem endereço divulgado e pode estar no Google Vagas. Excluir
 * de uma vez faria o endereço responder "não encontrada" sem passar pelo
 * "encerrada", que é o que diz a quem chegou tarde que a vaga existiu e acabou.
 * Por isso de Aberta só se sai encerrando.
 *
 * Excluir não tem Estado de destino: `destino: null` e `exclui: true`. Toda
 * outra ação tem destino, que é sempre um Estado do vocabulário.
 */

import { ESTADOS_DA_VAGA, ehEstadoDaVaga, rotuloDoEstadoDaVaga } from "./estados.js";

export const ACAO_ABRIR = "abrir";
export const ACAO_ENCERRAR = "encerrar";
export const ACAO_REABRIR = "reabrir";
export const ACAO_EXCLUIR = "excluir";

const EXCLUIR = Object.freeze({
  chave: ACAO_EXCLUIR,
  rotulo: "Excluir vaga",
  confirmacao: "Vaga excluída",
  destino: null,
  exclui: true,
});

const MAQUINA = Object.freeze({
  rascunho: Object.freeze([
    Object.freeze({
      chave: ACAO_ABRIR,
      rotulo: "Abrir vaga",
      confirmacao: "Vaga aberta",
      destino: "aberta",
      exclui: false,
    }),
    EXCLUIR,
  ]),
  aberta: Object.freeze([
    Object.freeze({
      chave: ACAO_ENCERRAR,
      rotulo: "Encerrar vaga",
      confirmacao: "Vaga encerrada",
      destino: "encerrada",
      exclui: false,
    }),
  ]),
  encerrada: Object.freeze([
    Object.freeze({
      chave: ACAO_REABRIR,
      rotulo: "Reabrir vaga",
      confirmacao: "Vaga reaberta",
      destino: "aberta",
      exclui: false,
    }),
    EXCLUIR,
  ]),
});

/* A tabela é conferida contra o VOCABULÁRIO na carga do módulo: todo Estado
   tem linha, e todo destino é um Estado (ou a exclusão). É conferência contra
   `estados.js`, não contra si mesma. */
for (const estado of ESTADOS_DA_VAGA) {
  if (!Array.isArray(MAQUINA[estado]) || MAQUINA[estado].length === 0) {
    throw new Error(
      `Estado de Vaga sem ações declaradas: ${JSON.stringify(estado)}. ` +
        "Todo Estado de `src/domain/carreiras/estados.js` precisa de uma linha em `transicoes.js`.",
    );
  }
  for (const acao of MAQUINA[estado]) {
    const valida = acao.exclui === true ? acao.destino === null : ehEstadoDaVaga(acao.destino);
    if (!valida) {
      throw new Error(
        `Destino fora do vocabulário na ação ${JSON.stringify(acao.chave)} de ` +
          `${JSON.stringify(estado)}: ${JSON.stringify(acao.destino)}.`,
      );
    }
  }
}

/**
 * As ações a partir do Estado, na ordem em que a tela as oferece. Falha alto
 * para Estado fora do vocabulário, pela mesma razão de `aparenciaDoEstadoDaVaga`.
 */
export function acoesDoEstadoDaVaga(estado) {
  if (!ehEstadoDaVaga(estado)) {
    throw new Error(
      `Estado de Vaga desconhecido: ${JSON.stringify(estado)}. ` +
        `O vocabulário é fechado, os únicos valores são: ${ESTADOS_DA_VAGA.join(", ")}.`,
    );
  }
  return MAQUINA[estado];
}

/** A ação de chave dada a partir do Estado, ou `null`. Não lança. */
export function acaoDoEstadoDaVaga(estado, chave) {
  if (!ehEstadoDaVaga(estado)) return null;
  return MAQUINA[estado].find((acao) => acao.chave === chave) ?? null;
}

/**
 * Esta mudança de Estado existe? Não lança: quem pergunta é o servidor, sobre
 * valor que veio de fora, e Estado desconhecido responde `false`.
 */
export function transicaoDaVagaPermitida(de, para) {
  if (!ehEstadoDaVaga(de) || !ehEstadoDaVaga(para)) return false;
  return MAQUINA[de].some((acao) => acao.exclui !== true && acao.destino === para);
}

/** Uma Vaga neste Estado pode ser excluída? Só Rascunho e Encerrada. */
export function exclusaoDaVagaPermitida(estado) {
  if (!ehEstadoDaVaga(estado)) return false;
  return MAQUINA[estado].some((acao) => acao.exclui === true);
}

/**
 * A frase que explica a recusa de uma mudança de Estado. Nomeia a saída que
 * existe em vez de só dizer "não pode". `para` nulo pergunta pela exclusão.
 *
 * Movimento PERMITIDO não tem motivo de recusa: devolve `null`, e é assim que
 * quem pergunta distingue "pode" de "não pode" sem uma segunda consulta. O
 * conselho "encerre antes" só aparece para a Aberta, que é o único Estado de
 * onde a exclusão passa por encerrar.
 */
export function motivoDaRecusa(de, para) {
  if (!ehEstadoDaVaga(de)) {
    return (
      `Não reconhecemos o estado atual desta vaga (${JSON.stringify(de)}), ` +
      "então não dá para saber se a mudança é permitida."
    );
  }
  const saidas = MAQUINA[de].map((acao) => acao.rotulo).join(", ");
  if (para === null || para === undefined) {
    if (exclusaoDaVagaPermitida(de)) return null;
    const conselho = de === "aberta" ? "Encerre a vaga antes. " : "";
    return (
      `Uma vaga ${rotuloDoEstadoDaVaga(de).toLowerCase()} não pode ser excluída. ` +
      `${conselho}O que dá para fazer agora: ${saidas}.`
    );
  }
  if (transicaoDaVagaPermitida(de, para)) return null;
  if (!ehEstadoDaVaga(para)) {
    return (
      `Não reconhecemos o estado ${JSON.stringify(para)}. ` +
      `Os estados de uma vaga são: ${ESTADOS_DA_VAGA.join(", ")}.`
    );
  }
  return (
    `Uma vaga ${rotuloDoEstadoDaVaga(de).toLowerCase()} não pode ir para ` +
    `${rotuloDoEstadoDaVaga(para).toLowerCase()}. O que dá para fazer agora: ${saidas}.`
  );
}
