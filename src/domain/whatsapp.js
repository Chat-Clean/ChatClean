/**
 * O único endereço de WhatsApp da ChatClean. Todo botão e link do site que
 * leva ao WhatsApp usa este, inclusive o que o servidor devolve depois de
 * gravar um lead (`api/lead.js`).
 *
 * É um link de rastreamento do Tintim, não o `wa.me` direto: ele registra de
 * onde a conversa veio e só então abre o WhatsApp. Por isso não leva mensagem
 * pronta: o Tintim não repassa `text`.
 */
export const LINK_DO_WHATSAPP =
  "https://tintim.link/whatsapp/1d5367b1-6da3-45a2-b951-2e6c5379dc1e/cdc6e483-1dbb-4b88-94c2-2261add708e6";
