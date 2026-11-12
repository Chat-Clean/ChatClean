/**
 * A campanha Black November (novembro de 2026), em regra pura.
 *
 * O pop-up com a arte e a etiqueta flutuante do lado esquerdo leem tudo
 * daqui: período, mensagem pronta e endereço do WhatsApp. Passado o fim, os
 * dois somem sozinhos, sem precisar de outro deploy para tirar.
 *
 * ─── POR QUE NÃO O LINK DO TINTIM ────────────────────────────────────────
 *
 * O `LINK_DO_WHATSAPP` (Tintim) não repassa `text`: ele manda o texto dele,
 * com o código de rastreio escondido. A campanha pede a mensagem da Black
 * November já escrita, então aqui o endereço é o `api.whatsapp.com` direto,
 * para o MESMO número. Quem conta os cliques é o Meta Pixel (evento
 * `Contact` e `BlackNovemberClique`), e a mensagem já diz de onde a pessoa veio.
 */

export const NUMERO_DO_WHATSAPP = "5584998900718";

export const MENSAGEM_DA_CAMPANHA =
  "Olá! Vim pelo site e quero aproveitar a Black November da ChatClean: API Oficial gratuita na implantação. Pode me passar as condições?";

export const LINK_DA_CAMPANHA = `https://api.whatsapp.com/send?phone=${NUMERO_DO_WHATSAPP}&text=${encodeURIComponent(MENSAGEM_DA_CAMPANHA)}`;

/** Até quando a campanha fica no ar: o mês inteiro, no horário de Brasília. */
export const FIM_DA_CAMPANHA = new Date("2026-12-01T00:00:00-03:00");

export function campanhaNoAr(agora = new Date()) {
  return agora < FIM_DA_CAMPANHA;
}

/** Onde a campanha NÃO aparece: as mesmas exceções da Jéssica. */
const SEM_CAMPANHA = [/^\/admin(\/|$)/i, /^\/assinar\/?$/i, /^\/assinatura(\/|$)/i];

export function paginaComCampanha(pathname = "") {
  return !SEM_CAMPANHA.some((padrao) => padrao.test(pathname));
}

/** O pop-up abre sozinho uma vez por visita (aba); depois, só pela etiqueta. */
export const CHAVE_DO_POPUP_VISTO = "chatclean.blacknovember.popup";
