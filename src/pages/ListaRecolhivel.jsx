import { useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Uma lista longa que abre recolhida: mostra o começo, desfoca e esmaece o
 * fim para dizer que há mais, e um botão expande o resto.
 *
 * O desfoque é progressivo: faixas empilhadas de desfoque crescente, cada
 * uma com máscara suave, somadas a um degradê que chega à cor do fundo antes
 * do fim (é ele que esconde o corte da lista). Ao
 * abrir, a altura anima até a altura real do conteúdo (medida) e, no fim da
 * transição, é liberada (`none`), para a lista acompanhar mudanças de
 * largura sem cortar nada. Com "reduzir movimento", a regra global do site já
 * zera a duração da transição.
 */
/** A altura da faixa desfocada, em px (a mesma do `h-56` abaixo). */
const ALTURA_DO_BORRAO = 224;

/**
 * O desfoque progressivo: faixas empilhadas, cada uma com um desfoque maior
 * e uma máscara que entra e sai suave, sobrepostas pela metade. O conteúdo
 * vai borrando aos poucos, sem a borda seca de uma camada única.
 */
const FAIXAS_DO_BORRAO = Object.freeze([
  { desfoque: 0.5, inicio: 0 },
  { desfoque: 1, inicio: 12.5 },
  { desfoque: 2, inicio: 25 },
  { desfoque: 4, inicio: 37.5 },
  { desfoque: 8, inicio: 50 },
  { desfoque: 16, inicio: 62.5 },
]);

export default function ListaRecolhivel({ children, corte, folgaDoCorte = 0, alturaRecolhida = "40rem", rotulo, corDoFundo }) {
  const id = useId();
  const refConteudo = useRef(null);
  const [aberta, setAberta] = useState(false);
  const [alturaMaxima, setAlturaMaxima] = useState(alturaRecolhida);

  // Recolhida, a lista mostra até a base do elemento `corte` (um seletor) e
  // o borrão começa ali (mais `folgaDoCorte` px): o que está acima fica nítido em qualquer largura de
  // tela, porque a medida é refeita quando a largura muda. Sem `corte`, vale
  // a `alturaRecolhida` fixa.
  useLayoutEffect(() => {
    if (aberta) return undefined;
    const conteudo = refConteudo.current;
    const medir = () => {
      const alvo = corte ? conteudo?.querySelector(corte) : null;
      if (!alvo) {
        setAlturaMaxima(alturaRecolhida);
        return;
      }
      const base = alvo.getBoundingClientRect().bottom - conteudo.getBoundingClientRect().top;
      setAlturaMaxima(`${Math.round(base + 4 + folgaDoCorte + ALTURA_DO_BORRAO)}px`);
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(conteudo);
    return () => observador.disconnect();
  }, [aberta, alturaRecolhida, corte, folgaDoCorte]);

  const abrir = () => {
    const conteudo = refConteudo.current;
    setAlturaMaxima(conteudo ? `${conteudo.scrollHeight}px` : "none");
    setAberta(true);
  };

  return (
    // `overflow-x-clip`: as faixas do borrão passam das bordas da lista para
    // não desenhar quina, e sem o recorte elas alargavam a página no celular.
    <div className="relative overflow-x-clip">
      <div
        id={id}
        ref={refConteudo}
        onTransitionEnd={() => {
          if (aberta) setAlturaMaxima("none");
        }}
        className="overflow-hidden transition-[max-height] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ maxHeight: alturaMaxima }}
      >
        {children}
      </div>

      {!aberta && (
        <div className="absolute inset-x-0 bottom-0 flex h-56 items-end justify-center">
          {/* O desfoque progressivo. As faixas passam das bordas da lista
              (`-inset-x-10`), para não desenhar uma quina nas laterais. */}
          {FAIXAS_DO_BORRAO.map(({ desfoque, inicio }, indice) => {
            const ultima = indice === FAIXAS_DO_BORRAO.length - 1;
            const mascara = ultima
              ? `linear-gradient(to bottom, transparent ${inicio}%, black ${inicio + 12.5}%)`
              : `linear-gradient(to bottom, transparent ${inicio}%, black ${inicio + 12.5}%, black ${inicio + 25}%, transparent ${inicio + 37.5}%)`;
            return (
              <div
                key={desfoque}
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 -inset-x-10"
                style={{
                  backdropFilter: `blur(${desfoque}px)`,
                  WebkitBackdropFilter: `blur(${desfoque}px)`,
                  maskImage: mascara,
                  WebkitMaskImage: mascara,
                }}
              />
            );
          })}
          {/* O esmaecimento até a cor da seção: chega à cor cheia antes do
              fim, e o corte da lista some debaixo dele. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 -inset-x-10"
            style={{
              background: `linear-gradient(to bottom, transparent 0%, color-mix(in srgb, ${corDoFundo} 35%, transparent) 40%, ${corDoFundo} 80%)`,
            }}
          />
          <button
            type="button"
            aria-expanded={aberta}
            aria-controls={id}
            onClick={abrir}
            className="relative mb-1 inline-flex items-center gap-2 rounded-full bg-brand-chrome px-7 py-3.5 font-bold text-white shadow-[0_12px_30px_-10px_rgb(0_92_58/0.6)] transition-transform duration-300 hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-chrome focus-visible:ring-offset-2"
          >
            {rotulo}
            <ChevronDown aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
