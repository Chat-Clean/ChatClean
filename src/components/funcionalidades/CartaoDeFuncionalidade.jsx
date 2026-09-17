import { useCena } from "./useCena";

/**
 * Card de funcionalidade: um palco creme onde a própria funcionalidade
 * acontece (a `Cena`), em laço enquanto o card está na tela, e embaixo o
 * título e a descrição.
 *
 * Entre uma volta e outra o palco apaga e acende (`saindo`), para o recomeço
 * não ser um corte seco. `contain: paint` isola a pintura de cada palco: o
 * que muda dentro de um card não obriga o navegador a repintar os vizinhos.
 *
 * O palco é decorativo para leitor de tela (`aria-hidden`): tudo que ele
 * mostra está dito no texto do card.
 */
export default function CartaoDeFuncionalidade({ titulo, destaque, descricao, duracoes, Cena, className = "" }) {
  const { ref, passo, saindo, semTransicao, duracaoDaSaida } = useCena(duracoes);

  return (
    <article
      ref={ref}
      className={`relative flex flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-creme-borda shadow-[0_1px_2px_rgba(20,35,27,0.04)] ${className}`}
    >
      <div className="relative h-72 overflow-hidden bg-creme bg-[radial-gradient(rgba(20,35,27,0.07)_1px,transparent_1px)] bg-[size:18px_18px] [contain:paint] md:h-80">
        <div
          aria-hidden="true"
          className={`absolute inset-0 transition-opacity ease-out ${saindo ? "opacity-0" : "opacity-100"} ${
            semTransicao ? "cena-sem-transicao" : ""
          }`}
          style={{ transitionDuration: `${saindo ? duracaoDaSaida : 250}ms` }}
        >
          <Cena passo={passo} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-6 md:p-7">
        <h3 className="text-xl font-semibold tracking-tight text-zinc-900 md:text-2xl">
          {destaque && <span className="text-brand-chrome">{destaque} </span>}
          {titulo}
        </h3>
        <p className="text-[15px] leading-relaxed text-zinc-600 md:text-base">{descricao}</p>
      </div>
    </article>
  );
}
