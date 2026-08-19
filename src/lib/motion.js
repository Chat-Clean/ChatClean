/**
 * Variants e helpers reutilizaveis de Framer Motion.
 * Centralizados aqui para manter consistencia visual em todo o site.
 *
 * Sempre que possivel, anime apenas transform e opacity (GPU-accelerated)
 * para preservar Core Web Vitals.
 */

// Easing curves cinemáticas
export const EASE = {
  out: [0.16, 1, 0.3, 1], // expo.out — entrada premium
  inOut: [0.65, 0, 0.35, 1],
  smooth: [0.43, 0.13, 0.23, 0.96],
};

// Fade + slide up (uso geral em sections)
export const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE.out },
  },
};

// Fade + slide right (para colunas laterais)
export const fadeRight = {
  hidden: { opacity: 0, x: -32 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.7, ease: EASE.out },
  },
};

// Stagger container (anima filhos em cascata)
export const staggerContainer = (stagger = 0.08, delayChildren = 0) => ({
  hidden: {},
  visible: {
    transition: {
      staggerChildren: stagger,
      delayChildren,
    },
  },
});

// Item de stagger (filho)
export const staggerItem = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: EASE.out },
  },
};

// Scale + fade (cards, badges)
export const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, ease: EASE.out },
  },
};

// Page transition
export const pageTransition = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE.out } },
  exit: { opacity: 0, y: -16, transition: { duration: 0.35, ease: EASE.inOut } },
};

// Viewport options padrao para whileInView
export const viewportOnce = { once: true };

/**
 * A chave da transicao de pagina: o PRIMEIRO segmento do caminho, e nao o
 * caminho inteiro.
 *
 * Com o caminho inteiro, <AnimatePresence mode="wait"> desmonta e remonta a
 * arvore a cada navegacao — inclusive entre uma rota-pai e uma filha dela. No
 * Painel isso significa derrubar o provedor de sessao e o portao ao ir de
 * /admin para /admin/previa/:id: o bootstrap de sessao recomeca, o esqueleto
 * pisca, e o que era continuidade vira uma tela que reabre do zero.
 *
 * Pelo primeiro segmento, a troca de PAGINA continua animada (que e o que a
 * animacao existe para marcar) e a navegacao DENTRO de uma area preserva o que
 * esta montado acima da rota.
 */
export function chaveDaTransicao(pathname) {
  const caminho = typeof pathname === "string" ? pathname : "";
  const primeiro = caminho.split("?")[0].split("#")[0].split("/").filter(Boolean)[0];
  return primeiro === undefined ? "/" : `/${primeiro}`;
}
