import { useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowDownToLine, ArrowUpFromLine, Code2, MessagesSquare } from "lucide-react";
import Reveal from "@/components/animated/Reveal";
import { caminhoEmS, fracoesDosNos, posicaoDoNo } from "./trilhaEmS";

const ICONES = { ArrowDownToLine, ArrowUpFromLine, MessagesSquare, Code2 };

/** Mede o comprimento de um caminho SVG sem desenhá-lo na página. */
function comprimentoDe(d) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const caminho = document.createElementNS("http://www.w3.org/2000/svg", "path");
  caminho.setAttribute("d", d);
  svg.appendChild(caminho);
  svg.style.cssText = "position:absolute;width:0;height:0;visibility:hidden";
  document.body.appendChild(svg);
  const total = caminho.getTotalLength();
  svg.remove();
  return total;
}

/**
 * Um nó da trilha: o ícone da etapa, que acende quando a linha chega nele.
 * Componente próprio porque cada nó tem o seu `useTransform`.
 */
function No({ progresso, fracao, x, y, Icone, parado }) {
  const aceso = useTransform(progresso, [Math.max(fracao - 0.04, 0), fracao], [0, 1]);
  const escala = useTransform(aceso, [0, 1], [0.7, 1]);
  return (
    <motion.span
      aria-hidden="true"
      style={{ left: x, top: y, opacity: parado ? 1 : aceso, scale: parado ? 1 : escala }}
      className="absolute grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-brand-chrome text-white shadow-[0_0_0_6px_var(--color-creme),0_0_24px_rgb(0_189_66/0.45)] lg:h-14 lg:w-14"
    >
      <Icone className="h-5 w-5 lg:h-6 lg:w-6" />
    </motion.span>
  );
}

/**
 * As quatro formas de integrar como uma trilha: o texto de cada etapa à
 * esquerda e, à direita, uma linha em S que se desenha conforme a página
 * rola, acendendo o ícone de cada etapa quando chega nele. No celular a
 * trilha fica à esquerda, estreita, e o texto à direita.
 *
 * A linha passa na altura do meio de cada texto: as posições são medidas no
 * DOM (e remedidas quando a largura muda), e o caminho sai de `caminhoEmS`.
 * Com "reduzir movimento" a trilha aparece inteira, sem desenho.
 */
export default function TrilhaDasFormas({ etapas }) {
  const refTrilha = useRef(null);
  const refColuna = useRef(null);
  const refsEtapas = useRef([]);
  const [geometria, setGeometria] = useState(null);
  const parado = useReducedMotion();

  useLayoutEffect(() => {
    const coluna = refColuna.current;
    if (!coluna) return undefined;
    const medir = () => {
      const caixa = coluna.getBoundingClientRect();
      const largura = caixa.width;
      const altura = caixa.height;
      if (!largura || !altura) return;
      const pontos = refsEtapas.current.map((etapa, indice) => {
        const b = etapa.getBoundingClientRect();
        return { x: posicaoDoNo(indice, largura), y: b.top + b.height / 2 - caixa.top };
      });
      const d = caminhoEmS(pontos, altura);
      const total = comprimentoDe(d);
      const ate = pontos.map((p, i) => comprimentoDe(caminhoEmS(pontos.slice(0, i + 1), p.y)));
      setGeometria({ largura, altura, pontos, d, fracoes: fracoesDosNos(ate, total) });
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(refTrilha.current);
    return () => observador.disconnect();
  }, [etapas.length]);

  // A linha começa a se desenhar quando o topo da trilha passa de 70% da
  // tela e termina quando o fim dela chega a 60%.
  const { scrollYProgress } = useScroll({ target: refTrilha, offset: ["start 70%", "end 60%"] });

  return (
    <div ref={refTrilha} className="relative grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-x-16">
      <div ref={refColuna} className="relative lg:order-2">
        {geometria && (
          <>
            <svg
              aria-hidden="true"
              width={geometria.largura}
              height={geometria.altura}
              viewBox={`0 0 ${geometria.largura} ${geometria.altura}`}
              className="absolute inset-0 overflow-visible"
              fill="none"
            >
              {/* O traçado inteiro, apagado: mostra o caminho que a linha vai fazer. */}
              <path d={geometria.d} stroke="var(--color-creme-borda)" strokeWidth="3" strokeLinecap="round" />
              <motion.path
                d={geometria.d}
                stroke="var(--color-brand-vivid)"
                strokeWidth="3"
                strokeLinecap="round"
                style={{ pathLength: parado ? 1 : scrollYProgress }}
              />
            </svg>
            {geometria.pontos.map((p, i) => (
              <No
                key={etapas[i].recurso}
                progresso={scrollYProgress}
                fracao={geometria.fracoes[i]}
                x={p.x}
                y={p.y}
                Icone={ICONES[etapas[i].icone]}
                parado={parado}
              />
            ))}
          </>
        )}
      </div>

      <ol className="lg:order-1">
        {etapas.map((etapa, indice) => (
          <li
            key={etapa.recurso}
            ref={(el) => {
              refsEtapas.current[indice] = el;
            }}
            className="py-10 lg:py-16"
          >
            <Reveal>
              <p className="font-secundaria text-xs font-semibold uppercase tracking-[0.16em] text-brand-action">
                {etapa.recurso}
              </p>
              <h3 className="mt-3 max-w-xl text-2xl font-bold leading-snug tracking-tight text-zinc-900 md:text-3xl">
                {etapa.titulo}
              </h3>
              <p className="mt-3 max-w-lg text-lg leading-relaxed text-zinc-600">{etapa.apoio}</p>
            </Reveal>
          </li>
        ))}
      </ol>
    </div>
  );
}
