/**
 * As palavras da confirmação de troca de endereço (Story 4.5).
 *
 * ─── O QUE ACONTECE, E POR QUE O AUTOR PRECISA SABER ──────────────────────
 *
 * Desde o Épico 2 o caminho de escrita faz a coisa certa sozinho: ao trocar o
 * Slug de um Post que já esteve no ar, o endereço anterior é APOSENTADO, numa
 * transação, e passa a redirecionar. Nada se perde.
 *
 * O que se perde é outra coisa, e nenhum código conserta: o link que alguém
 * mandou num grupo de WhatsApp há seis meses passa a dar um pulo antes de
 * abrir; a métrica daquele endereço se parte em duas; e um endereço aposentado
 * nunca mais pode ser reusado por outro Post. São consequências que só a pessoa
 * pode aceitar — e ela só aceita se souber.
 *
 * ─── A DECISÃO NÃO ESTÁ AQUI ──────────────────────────────────────────────
 *
 * `trocaDeEnderecoQuebraLinks` mora no DOMÍNIO, e é a mesma função que o
 * caminho de escrita consulta para decidir se aposenta o endereço. Este arquivo
 * tem só as palavras: um Painel que avisasse de uma quebra que o servidor não
 * vai causar — ou que calasse sobre uma que vai — ensinaria a ignorar o aviso.
 *
 * Puro: sem React, sem rede.
 */

export const TITULO_DA_TROCA_DE_ENDERECO = "Trocar o endereço deste post?";

/**
 * O texto do diálogo.
 *
 * Ele NOMEIA os dois endereços. "O endereço vai mudar" obrigaria a pessoa a
 * lembrar o que digitou três campos acima; ver os dois lado a lado é o que
 * transforma a confirmação numa conferência, e não num obstáculo.
 */
export function descricaoDaTrocaDeEndereco({ de, para } = {}) {
  return (
    `Este post já esteve no ar em /blog/${de}. Trocando para /blog/${para}, ` +
    "o endereço antigo passa a redirecionar para o novo, nada se perde, mas " +
    "os links já compartilhados vão dar um pulo antes de abrir, e o endereço " +
    "antigo fica reservado para sempre."
  );
}

export const ROTULO_PARA_TROCAR_ENDERECO = "Trocar o endereço";
export const ROTULO_PARA_MANTER_ENDERECO = "Manter o atual";
