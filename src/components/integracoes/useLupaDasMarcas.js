import { useEffect } from "react";

/** Até quantos pixels do cursor uma marca ainda cresce. */
export const ALCANCE_DA_LUPA = 150;

/** O tamanho da marca bem debaixo do cursor (1,5 = 150%). */
export const AUMENTO_MAXIMO = 1.5;

/**
 * Quanto uma marca cresce, pela distância do cursor ao centro dela: o
 * aumento inteiro em cima, nada a partir do alcance, e uma rampa reta entre
 * os dois. Função pura, para a conta ser conferida sem navegador.
 */
export function escalaPelaDistancia(distancia, alcance = ALCANCE_DA_LUPA, maximo = AUMENTO_MAXIMO) {
  if (!Number.isFinite(distancia) || distancia >= alcance) return 1;
  return 1 + (maximo - 1) * (1 - Math.max(distancia, 0) / alcance);
}

/**
 * A lupa da parede de integrações, como a do Dock: o cursor passa, as marcas
 * perto dele crescem e as longe voltam ao tamanho.
 *
 * Feita para não pesar:
 * - ouve só a seção (`area`), não a página inteira;
 * - faz no máximo uma conta por quadro de tela (`requestAnimationFrame`),
 *   por mais eventos de ponteiro que cheguem;
 * - escreve direto no `style` de cada quadro: nenhum estado do React muda,
 *   então nada se redesenha além do `transform`;
 * - só vale para mouse (no toque não há "passar por cima"), e fica parada
 *   para quem pediu menos movimento no sistema.
 */
export function useLupaDasMarcas(refDaArea, seletorDasMarcas = ".integracao-marca") {
  useEffect(() => {
    const area = refDaArea.current;
    if (!area || typeof window === "undefined") return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;

    const marcas = Array.from(area.querySelectorAll(seletorDasMarcas));
    let quadro = 0;
    let ultimo = null;

    const aplicar = () => {
      quadro = 0;
      if (!ultimo) return;
      const { x, y } = ultimo;
      for (const marca of marcas) {
        // A escala parte do centro do quadro, então o centro medido é o mesmo
        // com ou sem a lupa aplicada.
        const caixa = marca.getBoundingClientRect();
        const centroX = caixa.left + caixa.width / 2;
        const centroY = caixa.top + caixa.height / 2;
        const escala = escalaPelaDistancia(Math.hypot(x - centroX, y - centroY));
        marca.style.transform = escala === 1 ? "" : `scale(${escala.toFixed(3)})`;
        marca.style.zIndex = escala === 1 ? "" : String(Math.round(escala * 10));
      }
    };

    const aoMover = (evento) => {
      if (evento.pointerType !== "mouse") return;
      ultimo = { x: evento.clientX, y: evento.clientY };
      if (!quadro) quadro = requestAnimationFrame(aplicar);
    };

    const aoSair = () => {
      ultimo = null;
      if (quadro) cancelAnimationFrame(quadro);
      quadro = 0;
      for (const marca of marcas) {
        marca.style.transform = "";
        marca.style.zIndex = "";
      }
    };

    area.addEventListener("pointermove", aoMover, { passive: true });
    area.addEventListener("pointerleave", aoSair);
    return () => {
      area.removeEventListener("pointermove", aoMover);
      area.removeEventListener("pointerleave", aoSair);
      aoSair();
    };
  }, [refDaArea, seletorDasMarcas]);
}
