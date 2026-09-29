/**
 * O vocabulário fechado do que se pode PEDIR à função de escrita de Carreiras
 * (`POST /api/carreiras`).
 *
 * Domínio puro, como `src/domain/blog/operacoes.js`: sem React, sem rede, sem
 * armazenamento. O servidor o importa para decidir o que executar; o cliente
 * do Painel (`src/data/carreiras/escrita.js`) o importa para nomear o que
 * pede. A lista é uma só, e as duas pontas a leem daqui.
 *
 * ─── A OPERAÇÃO É DADO, E NÃO ENDEREÇO ─────────────────────────────────────
 *
 * Cinco operações e UMA porta: a Vaga (salvar, mudar de Estado, excluir) e a
 * Classificação (salvar, excluir). Uma rota por operação seria uma superfície
 * a mais para autenticar, classificar erro e esconder detalhe, e o teto de
 * funções do plano não comporta isso.
 *
 * ─── E, AO CONTRÁRIO DO BLOG, NÃO HÁ OPERAÇÃO PADRÃO ───────────────────────
 *
 * O Blog aceita corpo sem `operacao` como `salvar` por compatibilidade com
 * pedidos que nasceram antes do campo. Carreiras nasce com o campo, e por isso
 * ele é OBRIGATÓRIO: pedido sem operação é recusado, e nunca vira gravação
 * por omissão. Operação implícita é comportamento não declarado.
 *
 * ─── LISTA DE PERMISSÃO ────────────────────────────────────────────────────
 *
 * A conferência é contra a LISTA, e não contra as chaves de um objeto: com
 * objeto, `"constructor"` e `"__proto__"` responderiam verdadeiro.
 */

/** Criar ou editar uma Vaga (sempre nasce Rascunho). */
export const OPERACAO_SALVAR_VAGA = "salvarVaga";

/** Abrir, encerrar ou reabrir uma Vaga, pela máquina de `transicoes.js`. */
export const OPERACAO_MUDAR_ESTADO_DA_VAGA = "mudarEstadoDaVaga";

/** Excluir uma Vaga. Só Rascunho e Encerrada. */
export const OPERACAO_EXCLUIR_VAGA = "excluirVaga";

/** Criar ou editar um Departamento, um Tipo ou um Nível (`lista` no corpo). */
export const OPERACAO_SALVAR_CLASSIFICACAO = "salvarClassificacao";

/** Excluir uma Classificação que nenhuma Vaga usa. */
export const OPERACAO_EXCLUIR_CLASSIFICACAO = "excluirClassificacao";

/** As cinco, e nenhuma outra. */
export const OPERACOES_DE_CARREIRAS = Object.freeze([
  OPERACAO_SALVAR_VAGA,
  OPERACAO_MUDAR_ESTADO_DA_VAGA,
  OPERACAO_EXCLUIR_VAGA,
  OPERACAO_SALVAR_CLASSIFICACAO,
  OPERACAO_EXCLUIR_CLASSIFICACAO,
]);

/** `true` apenas para uma das cinco. Não lança. */
export function ehOperacaoDeCarreiras(valor) {
  return typeof valor === "string" && OPERACOES_DE_CARREIRAS.includes(valor);
}

/**
 * Qual operação o corpo pede, ou o motivo da recusa.
 *
 * Devolve `{ ok: true, operacao }` ou `{ ok: false, mensagem, detalhe }`.
 * Ausente, vazia, fora da lista ou de outro tipo: tudo é recusa. Não lança,
 * porque quem pergunta é o servidor, sobre valor que veio da rede.
 */
export function operacaoPedidaDeCarreiras(corpo) {
  const ehObjeto = corpo !== null && typeof corpo === "object" && !Array.isArray(corpo);
  const bruto = ehObjeto ? corpo.operacao : undefined;
  if (bruto === undefined || bruto === null || bruto === "") {
    return {
      ok: false,
      mensagem:
        `O pedido não diz qual operação de Carreiras fazer. As operações são: ${OPERACOES_DE_CARREIRAS.join(", ")}.`,
      detalhe: ehObjeto
        ? "operacao ausente no corpo do pedido"
        : `corpo não é objeto: ${Array.isArray(corpo) ? "lista" : corpo === null ? "null" : typeof corpo}`,
    };
  }
  const pedida = typeof bruto === "string" ? bruto.trim() : "";
  if (!ehOperacaoDeCarreiras(pedida)) {
    return {
      ok: false,
      mensagem:
        `Não reconhecemos a operação pedida. As operações de Carreiras são: ${OPERACOES_DE_CARREIRAS.join(", ")}.`,
      detalhe: `operacao fora do vocabulário: ${JSON.stringify(String(bruto).slice(0, 60))}`,
    };
  }
  return { ok: true, operacao: pedida };
}
