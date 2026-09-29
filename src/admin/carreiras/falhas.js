/**
 * Como as telas de Carreiras leem uma falha tipada, puro (revisão da Story 5.5).
 *
 * O formulário de Vaga (`EditorDeVaga.jsx`) e a listagem (`ListaDeVagas.jsx`)
 * decidem do MESMO jeito se oferecem "Tentar de novo" e qual frase mostram.
 * Estas duas funções moravam em `formulario.js`, e a lista as importava de lá:
 * a listagem dependia do módulo do formulário por uma regra que não é do
 * formulário. Aqui elas ficam num módulo neutro, importado pelos dois.
 *
 * ─── SEM MÓDULO DE DADOS AQUI DENTRO ──────────────────────────────────────
 *
 * Os tipos de erro chegam POR PARÂMETRO, de quem chama (a tela os lê de
 * `@/data/carreiras/*`, pelos apelidos que a verificação troca por dublê). Um
 * import relativo de lá puxaria o módulo de dados REAL para dentro do pacote
 * montado, por baixo do dublê.
 */

/**
 * A falha pede "Tentar de novo"? Só a PASSAGEIRA, e `tiposPassageiros` chega
 * de quem chama. As telas passam `rede` e `inesperado` (queda, prazo, 5xx,
 * resposta ilegível, exceção: repetir pode dar certo). `configuracao`,
 * `permissao`, `dados_invalidos`, `conflito` e `nao_encontrado` NÃO: repetir o
 * mesmo pedido daria a mesma recusa, e o botão ensinaria a apertar à toa.
 */
export function falhaPassageira(erro, tiposPassageiros) {
  return (
    Array.isArray(tiposPassageiros) &&
    erro !== null &&
    typeof erro === "object" &&
    typeof erro.tipo === "string" &&
    tiposPassageiros.includes(erro.tipo)
  );
}

/** A frase de uma falha, com reserva quando o servidor não mandou nenhuma. */
export function mensagemDaFalha(erro, reserva) {
  const mensagem = erro !== null && typeof erro === "object" ? erro.mensagem : null;
  return typeof mensagem === "string" && mensagem.trim() !== "" ? mensagem : reserva;
}
