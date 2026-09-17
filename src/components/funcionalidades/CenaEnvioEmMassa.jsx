import { Check, Megaphone } from "lucide-react";
import { Contador, Tiques } from "./PecasDeCena";

/**
 * Envio em massa: uma mensagem só, disparada uma vez, chega a todos. A grade
 * são os contatos: a onda de "enviado" sai do botão e passa pela lista, e a
 * segunda onda pinta de azul quem já leu — os tiques do próprio WhatsApp.
 *
 * Desempenho: a onda anda por COLUNA. Cada coluna tem três cópias empilhadas
 * dos seus pontos (vazios, verdes, azuis) e só a opacidade da cópia inteira
 * muda. São 16 camadas animadas no total; com uma camada por ponto eram 64,
 * e a placa de vídeo engasgava com os outros cards rodando junto.
 */
const COLUNAS = 8;
const LINHAS = 4;
// Quem não leu (ainda), por [coluna, linha]: posições fixas, sem sorteio
const NAO_LEU = new Set(["3,0", "1,1", "6,1", "6,2", "3,3", "6,3"]);

function Pontos({ cor, pular = () => false }) {
  return (
    <div className="flex h-full flex-col justify-around">
      {Array.from({ length: LINHAS }, (_, linha) => (
        <span key={linha} className={`mx-auto h-5 w-5 rounded-full ${pular(linha) ? "" : cor}`} />
      ))}
    </div>
  );
}

export default function CenaEnvioEmMassa({ passo }) {
  const enviado = passo >= 2;
  const lido = passo >= 3;

  return (
    <div className="absolute inset-0 flex flex-col gap-4 px-5 py-5">
      {/* A campanha */}
      <div className="rounded-2xl bg-white p-3 ring-1 ring-creme-borda">
        <div className="flex items-start gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-yellow-100 text-yellow-600">
            <Megaphone className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-zinc-900">Promoção de sexta</p>
            <p className="truncate text-[11px] text-zinc-500">“Só hoje: 20% em toda a loja”</p>
          </div>
          <span
            className={`relative inline-flex shrink-0 items-center gap-1 overflow-hidden rounded-full px-2.5 py-1 text-[11px] font-semibold transition-transform duration-200 ${
              passo === 1 ? "scale-95" : "scale-100"
            } ${passo >= 1 ? "text-emerald-950" : "text-zinc-600"}`}
          >
            <span className="absolute inset-0 bg-creme-profundo" />
            <span className={`absolute inset-0 bg-emerald-500 transition-opacity duration-300 ${passo >= 1 ? "opacity-100" : "opacity-0"}`} />
            <span className="relative inline-flex items-center gap-1">
              {passo >= 2 ? (
                <>
                  <Check className="h-3 w-3" strokeWidth={3} /> Enviada
                </>
              ) : passo === 1 ? (
                "Enviando…"
              ) : (
                "Enviar"
              )}
            </span>
          </span>
        </div>
      </div>

      {/* Os contatos: uma coluna por vez */}
      <div className="grid flex-1 grid-cols-8 gap-x-2">
        {Array.from({ length: COLUNAS }, (_, coluna) => (
          <div key={coluna} className="relative">
            <Pontos cor="bg-emerald-950/[0.09]" />
            <div
              className={`absolute inset-0 transition-opacity duration-300 ${enviado ? "opacity-100" : "opacity-0"}`}
              style={{ transitionDelay: enviado ? `${coluna * 70}ms` : "0ms" }}
            >
              <Pontos cor="bg-emerald-500/85" />
            </div>
            <div
              className={`absolute inset-0 transition-opacity duration-300 ${lido ? "opacity-100" : "opacity-0"}`}
              style={{ transitionDelay: lido ? `${coluna * 70}ms` : "0ms" }}
            >
              <Pontos cor="bg-canal-telegram/85" pular={(linha) => NAO_LEU.has(`${coluna},${linha}`)} />
            </div>
          </div>
        ))}
      </div>

      {/* Os números */}
      <div className="flex items-center justify-between text-[11px]">
        <span className="inline-flex items-center gap-1.5 text-zinc-600">
          <Tiques />
          Entregues{" "}
          <strong className="font-semibold text-zinc-900">
            <Contador valor={enviado ? 1240 : 0} saltar={passo === 0} />
          </strong>
        </span>
        <span className="inline-flex items-center gap-1.5 text-zinc-600">
          <Tiques lido />
          Lidas{" "}
          <strong className="font-semibold text-zinc-900">
            <Contador valor={lido ? 986 : 0} saltar={passo === 0} />
          </strong>
        </span>
      </div>
    </div>
  );
}
