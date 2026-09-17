import { ArrowRightLeft, Bot, Moon } from "lucide-react";
import { Balao, Digitando } from "./PecasDeCena";
import { TRANSICAO, surge } from "./estiloDeCena";

/**
 * Robô de atendimento: 03h12, ninguém na empresa. O robô responde a dúvida
 * comum sozinho e, quando o assunto pede uma pessoa (reembolso), passa a
 * conversa para o Financeiro — o "só chama um atendente quando precisa".
 *
 * A conversa inteira já está montada no lugar; cada passo revela uma peça.
 * O "digitando" fica por cima do lugar da resposta, e some quando ela chega.
 */
function Resposta({ digitando, respondeu, children }) {
  return (
    <div className="relative flex flex-col">
      <Balao de="empresa" visivel={respondeu}>
        {children}
      </Balao>
      <div className="absolute right-0 top-0">
        <Balao de="empresa" visivel={digitando && !respondeu}>
          <Digitando />
        </Balao>
      </div>
    </div>
  );
}

export default function CenaRobo({ passo }) {
  return (
    <div className="absolute inset-0 flex flex-col px-5 pb-4 pt-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-900">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500 text-emerald-950">
            <Bot className="h-4 w-4" />
          </span>
          Robô ChatClean
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-yellow-600 ring-1 ring-creme-borda">
          <Moon className="h-3 w-3" />
          03:12
        </span>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col justify-end gap-2">
        <Balao visivel={passo >= 1}>Vocês abrem sábado?</Balao>
        <Resposta digitando={passo >= 2} respondeu={passo >= 3}>
          Abrimos sim, das 8h às 13h. Quer que eu agende um horário?
        </Resposta>
        <Balao visivel={passo >= 4}>Na verdade quero falar sobre um reembolso</Balao>
        <div
          className={`flex items-center gap-2.5 self-center rounded-full bg-white py-1.5 pl-1.5 pr-3.5 ring-1 ring-emerald-300 ${TRANSICAO} ${surge(passo >= 6)}`}
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-yellow-400 text-[11px] font-bold text-emerald-950">AN</span>
          <span className="text-[12px] leading-tight text-zinc-900">
            <span className="flex items-center gap-1 font-semibold">
              <ArrowRightLeft className="h-3 w-3 text-emerald-600" />
              Transferido para Ana
            </span>
            <span className="text-[11px] text-zinc-500">Financeiro</span>
          </span>
        </div>
        {/* "digitando" da segunda resposta: no canto, ao lado do aviso de transferência */}
        <div className="absolute bottom-0 right-0">
          <Balao de="empresa" visivel={passo === 5}>
            <Digitando />
          </Balao>
        </div>
      </div>
    </div>
  );
}
