import { ChevronLeft, SendHorizontal } from "lucide-react";
import { Balao, IconeDoCanal, Tiques } from "./PecasDeCena";
import { TRANSICAO } from "./estiloDeCena";

/**
 * Atenda pelo celular: a notificação chega na tela bloqueada, o toque abre a
 * conversa e a resposta sai do bolso, com os tiques ficando azuis.
 *
 * Tela bloqueada e conversa são duas camadas montadas juntas; abrir é trocar
 * uma pela outra por opacidade e escala — a bloqueada recua, a conversa
 * chega. A digitação no campo é revelada por `clip-path`, só nele.
 */
const RESPOSTA = "Entregamos sim, até as 18h!";

// A data da tela bloqueada é a de hoje, de quem está vendo
const hoje = () => new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

export default function CenaCelular({ passo }) {
  const aberto = passo >= 2;

  return (
    <div className="absolute inset-0 flex justify-center pb-4 pt-5">
      {/* Aparelho: ocupa a altura do palco, para o campo de resposta aparecer */}
      <div className="relative h-full w-[13.5rem] rounded-[2.2rem] bg-zinc-900 p-2 shadow-[0_30px_60px_-20px_rgba(20,35,27,0.35)]">
        <div className="relative h-full overflow-hidden rounded-[1.7rem] bg-creme">
          <div className="relative z-10 flex items-center justify-between px-5 pt-2.5 text-[10px] font-semibold text-zinc-600">
            <span>9:41</span>
            <span className="h-4 w-14 rounded-full bg-zinc-900" />
            <span>5G</span>
          </div>

          {/* Tela bloqueada */}
          <div className={`absolute inset-x-0 bottom-0 top-7 flex flex-col items-center px-3 pt-5 ${TRANSICAO} ${aberto ? "scale-95 opacity-0" : "scale-100 opacity-100"}`}>
            <p className="text-3xl font-light text-zinc-800">9:41</p>
            <p className="mb-4 text-[10px] text-zinc-500">{hoje()}</p>
            <div
              className={`flex w-full items-start gap-2 rounded-2xl bg-white p-2 ring-1 ring-creme-borda shadow-[0_8px_20px_-10px_rgba(20,35,27,0.25)] ${TRANSICAO} ${
                passo >= 1 ? "translate-y-0 opacity-100" : "-translate-y-8 opacity-0"
              }`}
            >
              <IconeDoCanal canal="WhatsApp" tamanho="h-7 w-7" icone="h-3.5 w-3.5" />
              <span className="min-w-0 text-[11px] leading-snug">
                <span className="block font-semibold text-zinc-900">Marina Souza</span>
                <span className="block text-zinc-600">Vocês entregam ainda hoje?</span>
              </span>
            </div>
          </div>

          {/* Conversa */}
          <div className={`absolute inset-x-0 bottom-0 top-7 flex flex-col ${TRANSICAO} ${aberto ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}>
            <div className="flex items-center gap-2 bg-white px-2.5 py-2 ring-1 ring-creme-borda">
              <ChevronLeft className="h-4 w-4 text-zinc-600" />
              <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500 text-[10px] font-bold text-emerald-950">MS</span>
              <span className="text-[11.5px] font-semibold text-zinc-900">Marina Souza</span>
            </div>

            <div className="flex flex-1 flex-col justify-end gap-1.5 px-2.5 pb-2">
              <Balao>Vocês entregam ainda hoje?</Balao>
              <Balao de="empresa" visivel={passo >= 4}>
                <span className="flex items-end gap-1">
                  {RESPOSTA}
                  <Tiques lido={passo >= 5} sobreVerde />
                </span>
              </Balao>
            </div>

            {/* Campo de resposta: o texto é digitado no passo 3 */}
            <div className="flex items-center gap-1.5 px-2 pb-3">
              <div className="h-8 min-w-0 flex-1 overflow-hidden rounded-full bg-white px-3 text-[11px] leading-8 text-zinc-900 ring-1 ring-creme-borda">
                <span
                  className={`block truncate ${passo === 3 ? "opacity-100" : "opacity-0"}`}
                  style={{
                    clipPath: passo === 3 ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)",
                    transition: passo === 3 ? "clip-path 900ms linear" : "none",
                  }}
                >
                  {RESPOSTA}
                </span>
              </div>
              <span
                className={`relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full ring-1 ring-creme-borda ${
                  passo === 3 ? "text-emerald-950" : "text-zinc-500"
                }`}
              >
                <span className="absolute inset-0 bg-white" />
                <span className={`absolute inset-0 bg-emerald-500 transition-opacity duration-200 ${passo === 3 ? "opacity-100" : "opacity-0"}`} />
                <SendHorizontal className="relative h-3.5 w-3.5" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
