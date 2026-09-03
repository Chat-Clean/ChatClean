/**
 * A ponte entre a decisão de cookies e o navegador.
 *
 * Duas responsabilidades que o domínio não pode ter, porque exigem navegador:
 * guardar a decisão e **carregar ou não o Meta Pixel** por causa dela.
 *
 * ─── O PIXEL SAIU DO index.html, E ISSO É O PONTO ────────────────────────
 *
 * Antes, o Pixel carregava no `<head>`, em toda visita, antes de qualquer
 * pergunta. Um banner que apenas avisasse continuaria ilegal: sob a LGPD,
 * rastreamento de marketing depende de consentimento PRÉVIO. Enquanto ninguém
 * responde, `fbq` não existe nesta página.
 *
 * ─── RETIRAR O CONSENTIMENTO PRECISA VALER NA HORA ───────────────────────
 *
 * Script de terceiro não se descarrega: `fbq` já entrou no `window` e o cookie
 * `_fbp` já foi gravado. Retirar o consentimento faz três coisas — para de
 * enviar evento, apaga os cookies que dá para apagar do nosso domínio, e
 * recarrega a página, que é o único jeito honesto de a próxima navegação
 * começar limpa. A alternativa seria dizer "desativado" e continuar enviando.
 */

import {
  CHAVE_DE_ARMAZENAMENTO,
  consentiu,
  decisaoPadrao,
  interpretar,
  serializar,
} from "@/domain/consentimento/cookies";

/** O Pixel da ChatClean. Estava fixo no `index.html` até esta mudança. */
export const ID_DO_PIXEL = "1773986837313693";

/* ─── Reabrir o painel ───────────────────────────────────────────────────
 *
 * Mora aqui, e não no componente, porque quem chama é o rodapé: função em
 * arquivo de componente quebra a recarga rápida, e o lint cobra.
 */

export const EVENTO_DE_ABERTURA = "chatclean:cookies";

/** Reabre o painel de preferências de qualquer lugar do site. */
export function abrirPreferenciasDeCookies() {
  window.dispatchEvent(new CustomEvent(EVENTO_DE_ABERTURA));
}

/* ─── Armazenamento ──────────────────────────────────────────────────────
 *
 * `localStorage` lança em vez de devolver nulo em algumas situações — modo
 * privado do Safari, cota estourada, site com dados bloqueados. Toda leitura e
 * toda escrita são protegidas: o pior caso é perguntar de novo, nunca a página
 * quebrar por causa de um banner.
 */

export function lerDecisao() {
  try {
    return interpretar(window.localStorage.getItem(CHAVE_DE_ARMAZENAMENTO));
  } catch {
    return decisaoPadrao();
  }
}

export function gravarDecisao(decisao) {
  try {
    window.localStorage.setItem(CHAVE_DE_ARMAZENAMENTO, serializar(decisao));
    return true;
  } catch {
    return false;
  }
}

/* ─── Meta Pixel ─────────────────────────────────────────────────────── */

let pixelCarregado = false;

/** O carregador oficial do Meta, com o `<script>` inserido por nós. */
function instalarPixel() {
  if (typeof window === "undefined" || window.fbq) return;

  const fila = function (...argumentos) {
    fila.callMethod
      ? fila.callMethod.apply(fila, argumentos)
      : fila.queue.push(argumentos);
  };
  window.fbq = fila;
  if (!window._fbq) window._fbq = fila;
  fila.push = fila;
  fila.loaded = true;
  fila.version = "2.0";
  fila.queue = [];

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  script.dataset.consentimento = "marketing";
  document.head.appendChild(script);
}

/**
 * Aplica a decisão ao Pixel.
 *
 * Consentido e ainda não carregado: instala e conta a visita. Consentido e já
 * carregado: só conta a visita nova (usado na troca de rota). Não consentido:
 * não faz nada — a limpeza de quem retirou o consentimento é a de baixo.
 */
export function aplicarDecisao(decisao, { contarVisita = true } = {}) {
  if (typeof window === "undefined") return;
  if (!consentiu(decisao, "marketing")) return;

  if (!pixelCarregado) {
    instalarPixel();
    window.fbq("init", ID_DO_PIXEL);
    pixelCarregado = true;
  }
  if (contarVisita) window.fbq("track", "PageView");
}

/**
 * Apaga os cookies que o Pixel deixou no nosso domínio.
 *
 * `_fbp` e `_fbc` são gravados por JavaScript em `chatclean.com.br`, então dá
 * para expirá-los daqui. Cookie de `facebook.com` é de outro domínio e não nos
 * pertence — quem apaga aquele é o navegador, e a política precisa dizer isso
 * em vez de prometer o que não podemos cumprir.
 */
export function limparCookiesDeMarketing() {
  if (typeof document === "undefined") return;
  const dominio = window.location.hostname;
  const raiz = dominio.split(".").slice(-2).join(".");
  for (const nome of ["_fbp", "_fbc"]) {
    for (const escopo of [dominio, `.${raiz}`]) {
      document.cookie = `${nome}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${escopo}`;
    }
    document.cookie = `${nome}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

/** O Pixel chegou a carregar nesta aba? Decide se a retirada exige recarga. */
export function pixelEstaCarregado() {
  return pixelCarregado;
}
