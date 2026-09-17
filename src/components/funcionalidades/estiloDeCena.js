/**
 * Classes compartilhadas pelas cenas. Só `transform` e `opacity` transitam:
 * o navegador compõe as duas na placa de vídeo, sem refazer layout nem
 * pintura — o que mantém vários cards rodando juntos a 60 quadros.
 *
 * As peças de uma cena já nascem no lugar final; a animação só as revela e
 * as move. Nada entra ou sai do DOM no meio da cena, então nada empurra
 * vizinho nem obriga o navegador a medir de novo.
 */

export const TRANSICAO = "transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]";
export const TRANSICAO_RAPIDA = "transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]";

/** Revela subindo levemente. */
export const surge = (visivel) => (visivel ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2");

/** Revela vindo da esquerda. */
export const entraDaEsquerda = (visivel) => (visivel ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-5");

/** Revela crescendo a partir de um canto (defina a origem no elemento). */
export const cresce = (visivel) => (visivel ? "opacity-100 scale-100" : "opacity-0 scale-90");

/** Atraso de transição em ms, como estilo inline. */
export const atraso = (ms) => ({ transitionDelay: `${ms}ms` });
