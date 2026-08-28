/**
 * O vocabulário fechado do que se pode PEDIR ao caminho único de escrita.
 *
 * Domínio puro, como `estados.js` e `transicoes.js`: sem React, sem rede, sem
 * armazenamento. O servidor o importa em Node para decidir qual operação
 * executar; o cliente o importa no navegador para nomear a que está pedindo. É
 * essa dupla cidadania que é o ponto inteiro do arquivo.
 *
 * ─── POR QUE A OPERAÇÃO É DADO, E NÃO ENDEREÇO ──────────────────────────────
 *
 * "Nenhum cliente escreve no banco, e o único caminho é a função em `api/`" é a
 * regra que sustenta a RLS inteira. Uma segunda rota de escrita seria uma
 * segunda superfície para autenticar, classificar erro e defender — e a segunda
 * sempre fica para trás da primeira. Então excluir e alternar Destaque não
 * ganham endereço: eles viram **valor** de um campo do corpo, conferido contra
 * esta lista.
 *
 * ─── POR QUE LISTA DE PERMISSÃO, E NÃO DE PROIBIÇÃO ─────────────────────────
 *
 * O corpo do pedido vem da rede. Uma lista de proibições sempre tem uma forma
 * de evasão que ninguém pensou ainda — a defesa do banco da Story 2.5 foi
 * escrita duas vezes por causa exatamente disso. Aqui o que não está declarado
 * é recusado, e é recusado por construção: `ehOperacao` responde `false` para
 * tudo o que não é uma das chaves, **inclusive** para nome herdado do
 * protótipo de `Object` (`constructor`, `toString`, `__proto__`), que é a
 * evasão clássica de quem usa objeto como tabela de despacho.
 */

/** Gravar o Post: criar, editar, e a transição de Estado da Story 2.8. */
export const OPERACAO_SALVAR = "salvar";

/** Apagar o Post. Irreversível — quem confirma é a tela, nomeando o Post. */
export const OPERACAO_EXCLUIR = "excluir";

/** Ligar ou desligar o Destaque, sem passar pelo Editor. */
export const OPERACAO_DESTACAR = "destacar";

/**
 * Criar ou editar uma Categoria (Story 2.14) — nome, endereço, cor, ícone e
 * ordem.
 *
 * Uma operação para as duas coisas, como `salvar` faz com o Post: identificador
 * ausente cria, identificador presente edita. Duas operações para "gravar" e
 * "editar" seriam duas superfícies para autenticar, validar e recusar colisão —
 * e a segunda ficaria para trás da primeira.
 */
export const OPERACAO_SALVAR_CATEGORIA = "salvarCategoria";

/**
 * Excluir uma Categoria.
 *
 * Ela é recusada quando a Categoria está em uso, e a recusa diz **quantos**
 * Posts dependem dela. O bloqueio de verdade mora no banco (`on delete
 * restrict`): a contagem existe para EXPLICAR a recusa, não para ser a recusa.
 */
export const OPERACAO_EXCLUIR_CATEGORIA = "excluirCategoria";

/**
 * As cinco, na ordem em que o Painel as oferece.
 *
 * `salvar` está aqui, e não implícito, porque o vocabulário precisa ser
 * COMPLETO para ser fechado: uma lista que só nomeia as operações novas deixa
 * "o que acontece quando o campo falta" como comportamento não declarado, e
 * comportamento não declarado é onde a próxima pessoa encaixa uma sexta
 * operação sem lista nenhuma.
 *
 * ─── A LISTA CRESCE DE PROPÓSITO, E ISSO NÃO É UMA PORTA NOVA ───────────────
 *
 * A Story 2.12 fixou por asserção que o vocabulário tinha TRÊS operações "e
 * nenhuma a mais" — e registrou, no `deferred` daquela spec, que uma story
 * futura precisaria reabrir a asserção **de propósito, não por acidente**. É o
 * que a Story 2.14 faz: as duas operações de Categoria entram aqui, não em
 * `api/categorias.js`. A porta continua sendo uma; o que muda é o dado que ela
 * recebe.
 */
export const OPERACOES = Object.freeze([
  OPERACAO_SALVAR,
  OPERACAO_EXCLUIR,
  OPERACAO_DESTACAR,
  OPERACAO_SALVAR_CATEGORIA,
  OPERACAO_EXCLUIR_CATEGORIA,
]);

/**
 * A operação padrão quando o corpo não fala de operação.
 *
 * Existe pela compatibilidade que a Story 2.5 fixou: o corpo de um salvamento
 * nunca teve este campo, e exigir o campo agora recusaria toda gravação em voo.
 * Ausência é `salvar`; **valor presente** precisa estar na lista.
 */
export const OPERACAO_PADRAO = OPERACAO_SALVAR;

/**
 * `true` apenas para uma das chaves declaradas.
 *
 * A conferência é contra a LISTA, e não contra as chaves de um objeto: com
 * objeto, `ehOperacao("constructor")` responderia verdadeiro e a tabela de
 * despacho devolveria uma função que ninguém declarou.
 */
export function ehOperacao(valor) {
  return typeof valor === "string" && OPERACOES.includes(valor);
}

/**
 * Qual operação o corpo está pedindo — ou o motivo da recusa.
 *
 * Devolve `{ ok: true, operacao }` ou `{ ok: false, mensagem, detalhe }`. Não
 * lança: quem pergunta é o servidor, sobre valor que veio de fora, e exceção
 * daqui viraria 500 sem tipo.
 *
 * Corpo que não é objeto NÃO é recusado aqui: ele é pedido de `salvar` mal
 * formado, e quem sabe descrever o que veio no lugar é a leitura do corpo da
 * própria gravação. Duas frases para o mesmo caso mandariam a pessoa procurar
 * dois defeitos diferentes.
 */
export function operacaoPedida(corpo) {
  const ehObjeto = corpo !== null && typeof corpo === "object" && !Array.isArray(corpo);
  const bruto = ehObjeto ? corpo.operacao : undefined;
  if (bruto === undefined || bruto === null || bruto === "") {
    return { ok: true, operacao: OPERACAO_PADRAO };
  }
  const pedida = typeof bruto === "string" ? bruto.trim() : "";
  if (!ehOperacao(pedida)) {
    return {
      ok: false,
      mensagem:
        `Não reconhecemos a operação pedida. As operações de um post são: ${OPERACOES.join(", ")}.`,
      detalhe: `operacao fora do vocabulário: ${JSON.stringify(String(bruto).slice(0, 60))}`,
    };
  }
  return { ok: true, operacao: pedida };
}
