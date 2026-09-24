/**
 * A autenticação da escrita: a fachada neutra.
 *
 * Quem é o chamador (`identificarChamador`), se ele tem perfil no Painel
 * (`perfilOuFalha`) e a combinação das duas conferências (`autorizar`) não são
 * do Post: toda operação de escrita do Painel passa por elas, a do Blog e a de
 * Carreiras. Este módulo é o endereço neutro de onde uma função nova as
 * importa, sem precisar saber que elas nasceram junto do Post.
 *
 * **Reexporta, não copia.** As funções continuam morando onde nasceram
 * (`salvarPost.js` e `operacoesDoPost.js`), e o que sai daqui é o MESMO objeto
 * de função, não uma segunda implementação: a verificação da escrita afirma
 * isso por identidade (`===`). Uma cópia divergiria na primeira correção de
 * segurança feita num lado só.
 */

export { identificarChamador, perfilOuFalha } from "./salvarPost.js";
export { autorizar } from "./operacoesDoPost.js";
