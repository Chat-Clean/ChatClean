import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * O seletor de quantidade do dimensionamento.
 *
 * ─── POR QUE NÃO SÃO MAIS DOIS BOTÕES DE MAIS E MENOS ────────────────────
 *
 * Passo a passo funciona para dois ou três. Para chegar a quarenta usuários são
 * trinta e nove cliques, e a faixa vai até duzentos. O dropdown mostra a faixa
 * inteira e deixa escolher em um gesto — a quantidade continua livre, o que
 * muda é o custo de chegar nela.
 *
 * ─── A LISTA TRAZ TODOS OS VALORES ───────────────────────────────────────
 *
 * A tentação é oferecer degraus (5, 10, 25, 50). Seria decidir pelo cliente que
 * ele não pode ter sete usuários. Se a operação tem sete, ela escolhe sete: a
 * lista rola, e o valor escolhido já nasce visível no topo dela.
 */

/** Todos os inteiros da faixa, do mínimo ao máximo. */
function valoresDaFaixa({ minimo, maximo }) {
  return Array.from({ length: maximo - minimo + 1 }, (_, i) => minimo + i);
}

export default function SeletorDeQuantidade({
  rotulo,
  ajuda,
  valor,
  faixa,
  aoMudar,
  sufixo,
}) {
  const valores = valoresDaFaixa(faixa);
  const id = `quantidade-${rotulo.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className="flex flex-col gap-2">
      <span
        id={`${id}-rotulo`}
        className="text-xs font-bold uppercase tracking-widest text-zinc-500"
      >
        {rotulo}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger
          id={id}
          aria-labelledby={`${id}-rotulo`}
          className="group flex min-w-[132px] items-center justify-between gap-3 rounded-full border border-zinc-200 bg-white px-5 py-2.5 text-left transition-colors hover:border-zinc-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 data-[state=open]:border-emerald-500"
        >
          <span className="text-lg font-black tabular-nums text-zinc-900">
            {valor}
            {sufixo ? (
              <span className="ml-1.5 text-xs font-bold text-zinc-500">
                {sufixo}
              </span>
            ) : null}
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-data-[state=open]:rotate-180"
            aria-hidden="true"
          />
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          className="max-h-64 w-[var(--radix-dropdown-menu-trigger-width)] min-w-[132px] overflow-y-auto rounded-2xl border-zinc-200 p-1.5"
        >
          {valores.map((quantidade) => {
            const escolhido = quantidade === valor;
            return (
              <DropdownMenuItem
                key={quantidade}
                onSelect={() => aoMudar(quantidade)}
                className={`flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm font-bold tabular-nums transition-colors focus:bg-emerald-50 focus:text-emerald-900 ${
                  escolhido ? "bg-emerald-50 text-emerald-900" : "text-zinc-700"
                }`}
              >
                {quantidade}
                {escolhido && (
                  <Check
                    className="h-3.5 w-3.5 text-emerald-600"
                    aria-hidden="true"
                  />
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {ajuda ? (
        <span className="max-w-[220px] text-[11px] leading-tight text-zinc-500">
          {ajuda}
        </span>
      ) : null}
    </div>
  );
}
