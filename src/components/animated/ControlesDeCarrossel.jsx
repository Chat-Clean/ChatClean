import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Setas e bolinhas de um carrossel de celular (ver `lib/useCarrossel.js`).
 *
 * A bolinha da vez se estica virando uma barrinha — a mesma linguagem das
 * barras de mensagem da trama de fundo do site.
 *
 * `rotulos` nomeia cada parada para quem usa leitor de tela: "Ver 300+
 * empresas atendidas" diz mais que "Ir para o slide 1".
 */
export default function ControlesDeCarrossel({ rotulos, indice, irPara, className = "" }) {
  const botaoDeSeta =
    "grid h-10 w-10 place-items-center rounded-full bg-white text-zinc-700 ring-1 ring-creme-borda transition-opacity disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600";

  return (
    <div className={`mt-6 flex items-center justify-center gap-4 ${className}`}>
      <button
        type="button"
        onClick={() => irPara(indice - 1)}
        disabled={indice <= 0}
        aria-label="Ver o anterior"
        className={botaoDeSeta}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </button>

      <div className="flex items-center gap-2">
        {rotulos.map((rotulo, i) => (
          <button
            key={rotulo}
            type="button"
            onClick={() => irPara(i)}
            aria-label={`Ver ${rotulo}`}
            aria-current={i === indice ? "true" : undefined}
            className={`h-2 rounded-full transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
              i === indice ? "w-7 bg-emerald-500" : "w-2 bg-creme-borda"
            }`}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => irPara(indice + 1)}
        disabled={indice >= rotulos.length - 1}
        aria-label="Ver o próximo"
        className={botaoDeSeta}
      >
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}
