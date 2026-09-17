import { TrendingDown } from "lucide-react";
import { Contador } from "./PecasDeCena";

/**
 * Painel de controle: o dia andando. Os atendimentos de cada hora sobem, a
 * fila de abertos cai e o tempo da primeira resposta despenca — o que o
 * gestor abre o painel para ver.
 *
 * As barras têm a altura final desde o início e crescem por `scaleY`.
 */
const HORAS = [
  { rotulo: "8h", valor: 34 },
  { rotulo: "9h", valor: 58 },
  { rotulo: "10h", valor: 82 },
  { rotulo: "11h", valor: 71 },
  { rotulo: "12h", valor: 46 },
  { rotulo: "13h", valor: 63 },
  { rotulo: "14h", valor: 90 },
];

const formatarTempo = (segundos) => {
  const s = Math.round(segundos);
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};

export default function CenaPainel({ passo }) {
  const horasVisiveis = passo === 0 ? 0 : passo === 1 ? 4 : HORAS.length;
  const atualizado = passo >= 2;

  return (
    <div className="absolute inset-0 flex flex-col gap-3 px-5 py-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-900">Hoje</span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          ao vivo
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-white p-2.5 ring-1 ring-creme-borda">
          <p className="text-[10.5px] text-zinc-500">Em aberto</p>
          <p className="text-xl font-semibold text-zinc-900">
            <Contador valor={atualizado ? 7 : 14} saltar={passo === 0} />
          </p>
        </div>
        <div className="rounded-xl bg-white p-2.5 ring-1 ring-creme-borda">
          <p className="text-[10.5px] text-zinc-500">1ª resposta</p>
          <p className="flex items-center gap-1 text-xl font-semibold text-zinc-900">
            <Contador valor={atualizado ? 72 : 400} formatar={formatarTempo} duracao={1.1} saltar={passo === 0} />
            <TrendingDown
              className={`h-4 w-4 text-emerald-600 transition-[opacity,transform] duration-300 ${
                atualizado ? "translate-y-0 opacity-100 delay-700" : "-translate-y-1 opacity-0"
              }`}
            />
          </p>
        </div>
      </div>

      {/* Atendimentos por hora */}
      <div className="flex min-h-0 flex-1 flex-col rounded-xl bg-white p-2.5 ring-1 ring-creme-borda">
        <p className="mb-2 text-[10.5px] text-zinc-500">Atendimentos por hora</p>
        <div className="flex min-h-0 flex-1 items-end gap-1.5">
          {HORAS.map((h, i) => {
            const visivel = i < horasVisiveis;
            const ultimaAcesa = i === HORAS.length - 1 && atualizado;
            return (
              <div key={h.rotulo} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span
                  className="relative w-full origin-bottom overflow-hidden rounded-t-md bg-emerald-500/55 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  style={{
                    height: `${h.valor}%`,
                    transform: `scaleY(${visivel ? 1 : 0})`,
                    transitionDelay: visivel ? `${(i % 4) * 80}ms` : "0ms",
                  }}
                >
                  <span className={`absolute inset-0 bg-emerald-400 transition-opacity duration-300 ${ultimaAcesa ? "opacity-100" : "opacity-0"}`} />
                </span>
                <span className="text-[9.5px] text-zinc-500">{h.rotulo}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
