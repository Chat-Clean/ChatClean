import { CircleCheck } from "lucide-react";
import { Contador } from "./PecasDeCena";

/**
 * Organização de clientes e vendas: o negócio da Marina anda pelas etapas do
 * funil — o mesmo cartão, deslizando de coluna em coluna, para a continuidade
 * ficar óbvia. Ao chegar em "Fechado", ele fica verde e o total do mês sobe.
 *
 * O cartão que anda é uma camada por cima da grade, com a largura de uma
 * coluna, e se move só por `translateX` (uma coluna = 100% da largura dele +
 * o espaço entre colunas). Cada coluna reserva o lugar dele no topo, então
 * nada na grade se mexe.
 */
// No celular a coluna tem ~75px: o nome curto cabe inteiro
const ETAPAS = [
  { nome: "Novo contato", curto: "Novo" },
  { nome: "Interessado", curto: "Interesse" },
  { nome: "Proposta", curto: "Proposta" },
  { nome: "Fechado", curto: "Fechado" },
];

// Os outros negócios de cada coluna: contexto parado, sem competir
const OUTROS = [
  [{ nome: "Rafael T.", valor: "R$ 890" }, { nome: "Júlia M.", valor: "R$ 1.300" }],
  [{ nome: "Bruno C.", valor: "R$ 3.100" }],
  [{ nome: "Loja Aurora", valor: "R$ 5.600" }],
  [{ nome: "Pedro A.", valor: "R$ 2.150" }],
];

const formatarReais = (n) => "R$ " + Math.round(n).toLocaleString("pt-BR");

// Espaço entre colunas (gap-2) — o passo do cartão é a coluna + este espaço
const ESPACO = "0.5rem";

export default function CenaFunil({ passo }) {
  const etapa = Math.min(passo, 3);
  const fechou = passo >= 4;

  return (
    <div className="absolute inset-0 flex flex-col gap-3 px-4 py-5 md:px-8">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold text-zinc-900">Funil de vendas</span>
        <span className="text-[11px] text-zinc-500">
          Fechado no mês{" "}
          <strong className={`font-semibold ${fechou ? "text-yellow-600" : "text-zinc-900"}`}>
            <Contador valor={fechou ? 20800 : 18400} formatar={formatarReais} saltar={passo === 0} />
          </strong>
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        <div className="grid h-full grid-cols-4 gap-2">
          {ETAPAS.map(({ nome, curto }, coluna) => (
            <div key={nome} className="flex min-w-0 flex-col gap-1.5 rounded-xl bg-white/70 p-1.5 ring-1 ring-creme-borda">
              <p className="h-5 truncate px-1 text-[10.5px] font-semibold leading-5 text-zinc-500 sm:uppercase sm:tracking-wide">
                <span className="sm:hidden">{curto}</span>
                <span className="hidden sm:inline">{nome}</span>
              </p>
              {/* Lugar reservado para o cartão que anda: tracejado, é a trilha dele */}
              <div className="h-[3.25rem] shrink-0 rounded-lg border border-dashed border-creme-borda" />
              {OUTROS[coluna].map((n) => (
                <div key={n.nome} className="rounded-lg bg-creme p-2">
                  <p className="truncate text-[11px] text-zinc-600">{n.nome}</p>
                  <p className="truncate text-[10.5px] text-zinc-500">{n.valor}</p>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* O negócio da Marina: 2rem = p-1.5 + h-5 do título + gap-1.5 */}
        <div
          className="absolute left-0 top-[2rem] px-1.5 transition-transform duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{
            width: `calc((100% - 3 * ${ESPACO}) / 4)`,
            transform: `translateX(calc(${etapa} * (100% + ${ESPACO})))`,
          }}
        >
          <div className="relative h-[3.25rem] overflow-hidden rounded-lg bg-white p-2 ring-2 ring-emerald-400 shadow-[0_10px_24px_-10px_rgba(20,35,27,0.25)]">
            <span className={`absolute inset-0 bg-emerald-500 transition-opacity duration-300 ${fechou ? "opacity-100" : "opacity-0"}`} />
            <p className="relative flex items-center gap-1 truncate text-[11.5px] font-semibold text-zinc-900">
              <CircleCheck
                className={`hidden h-3 w-3 shrink-0 text-emerald-950 transition-opacity duration-300 sm:block ${fechou ? "opacity-100" : "opacity-0"}`}
              />
              <span className="sm:hidden">Marina</span>
              <span className="hidden sm:inline">Marina Souza</span>
            </p>
            <p className="relative truncate text-[10.5px] text-zinc-700">R$ 2.400</p>
          </div>
        </div>
      </div>
    </div>
  );
}
