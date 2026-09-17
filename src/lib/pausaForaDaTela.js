import { useEffect, useRef } from "react";

/**
 * Pausa as animações CSS de um trecho enquanto ele está fora da tela.
 *
 * Animação infinita continua rodando mesmo onde ninguém vê — a esteira de
 * logos e os balões da hero seguiam ocupando a placa de vídeo enquanto a
 * pessoa lia outra seção (medido: a página caía de ~55 para ~45 fps com eles
 * rodando fora da vista). O atributo `data-fora-da-tela` liga a regra de
 * `index.css` que pausa, e é trocado direto no elemento, sem re-renderizar
 * o React.
 */
export function usePausaForaDaTela() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const observador = new IntersectionObserver(([entrada]) => {
      el.toggleAttribute("data-fora-da-tela", !entrada.isIntersecting);
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  return ref;
}
