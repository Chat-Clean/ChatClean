import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";

/**
 * Motor das cenas dos cards de funcionalidade.
 *
 * Uma cena é uma sequência de passos com duração: `duracoes[i]` é quanto o
 * passo `i` fica na tela antes do próximo. Ela roda EM LAÇO enquanto o card
 * está na tela: chega ao último passo (o resultado da funcionalidade), segura
 * esse quadro por `PAUSA_NO_RESULTADO`, apaga o palco (`saindo`) e recomeça.
 *
 * O recomeço acontece com o palco apagado e com as transições desligadas
 * (`semTransicao`) por dois quadros: as peças voltam ao estado inicial num
 * salto invisível, em vez de "desanimarem" de trás pra frente.
 *
 * Fora da tela o laço para, e recomeça do início quando o card volta.
 * Com "reduzir movimento" não há laço: a cena fica no último passo.
 */
const PAUSA_NO_RESULTADO = 2600;
const DURACAO_DA_SAIDA = 350;

export function useCena(duracoes) {
  const ref = useRef(null);
  const visivel = useInView(ref, { amount: 0.35 });
  const reduzir = useReducedMotion();
  const ultimo = duracoes.length;
  const [passo, setPasso] = useState(reduzir ? ultimo : 0);
  const [saindo, setSaindo] = useState(false);
  const [semTransicao, setSemTransicao] = useState(true);
  const [volta, setVolta] = useState(0);

  // Fora da tela, também as animações CSS contínuas do palco param (o
  // "digitando", o "ao vivo"): ver `lib/pausaForaDaTela.js` e `index.css`
  useEffect(() => {
    ref.current?.toggleAttribute("data-fora-da-tela", !visivel);
  }, [visivel]);

  useEffect(() => {
    if (reduzir) {
      setPasso(ultimo);
      setSaindo(false);
      setSemTransicao(true);
      return undefined;
    }
    if (!visivel) return undefined;

    setSemTransicao(true);
    setPasso(0);
    let quadro = requestAnimationFrame(() => {
      quadro = requestAnimationFrame(() => {
        setSemTransicao(false);
        setSaindo(false);
      });
    });

    const timers = [];
    let t = 0;
    duracoes.forEach((duracao, i) => {
      t += duracao;
      timers.push(setTimeout(() => setPasso(i + 1), t));
    });
    t += PAUSA_NO_RESULTADO;
    timers.push(setTimeout(() => setSaindo(true), t));
    t += DURACAO_DA_SAIDA;
    timers.push(setTimeout(() => setVolta((v) => v + 1), t));

    return () => {
      cancelAnimationFrame(quadro);
      timers.forEach(clearTimeout);
    };
    // `duracoes` é constante por cena; a próxima volta vem por `volta`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visivel, reduzir, volta, ultimo]);

  return { ref, passo, saindo, semTransicao, duracaoDaSaida: DURACAO_DA_SAIDA };
}
