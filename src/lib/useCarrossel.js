import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Carrossel de arrastar, para uma fileira de cards no celular.
 *
 * Quem rola é o próprio navegador (`overflow-x` com `scroll-snap`): o dedo
 * arrasta com a física nativa, sem JavaScript por quadro. Aqui só ficam as
 * duas coisas que o CSS não sabe: QUAL card está na frente agora (por
 * `IntersectionObserver`, sem ouvir cada pixel de rolagem) e levar até um
 * card quando a pessoa toca numa bolinha ou numa seta.
 *
 * `quantidade` entra só para o índice não passar do fim quando a lista muda.
 */
export function useCarrossel(quantidade) {
  const trilha = useRef(null);
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    const el = trilha.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const cards = [...el.children];
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting) {
            const i = cards.indexOf(entrada.target);
            if (i >= 0) setIndice(Math.min(i, quantidade - 1));
          }
        }
      },
      { root: el, threshold: 0.6 },
    );
    cards.forEach((card) => observador.observe(card));
    return () => observador.disconnect();
  }, [quantidade]);

  const irPara = useCallback((i) => {
    const el = trilha.current;
    const alvo = el?.children?.[i];
    if (!alvo) return;
    const semMovimento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({
      left: alvo.offsetLeft - el.offsetLeft,
      behavior: semMovimento ? "auto" : "smooth",
    });
  }, []);

  return { trilha, indice, irPara };
}
