import { Contador, IconeDoCanal } from "./PecasDeCena";
import { TRANSICAO, cresce, surge } from "./estiloDeCena";

/**
 * Organização da equipe: a conversa nova chega na fila com o departamento e
 * desce para quem cuida dele: sai da fila para baixo e aparece na linha do
 * atendente, cujo contador de "em atendimento" sobe.
 *
 * Fila e linhas já estão montadas; os cartões só aparecem e somem por
 * opacidade e deslocamento.
 */
const EQUIPE = [
  { id: "bruno", nome: "Bruno", depto: "Vendas", sigla: "BR", inicial: 2 },
  { id: "carla", nome: "Carla", depto: "Suporte", sigla: "CA", inicial: 3 },
  { id: "diego", nome: "Diego", depto: "Financeiro", sigla: "DI", inicial: 1 },
];

// Cada conversa: passo ímpar ela chega na fila, passo par ela é distribuída
const FILA = [
  { cliente: "Marina S.", canal: "WhatsApp", para: "bruno", depto: "Vendas" },
  { cliente: "Carlos L.", canal: "Instagram", para: "carla", depto: "Suporte" },
  { cliente: "Ana P.", canal: "Facebook", para: "diego", depto: "Financeiro" },
];

export default function CenaEquipe({ passo }) {
  const chegou = (i) => passo >= i * 2 + 1;
  const distribuida = (i) => passo >= i * 2 + 2;
  const filaVazia = !FILA.some((_, i) => chegou(i) && !distribuida(i));

  return (
    <div className="absolute inset-0 flex flex-col gap-3 px-5 py-5">
      {/* Fila de entrada: os três cartões empilhados no mesmo lugar */}
      <div className="relative h-14 rounded-2xl border border-dashed border-creme-borda">
        <span
          className={`absolute inset-0 grid place-items-center text-[11px] text-zinc-500 transition-opacity duration-300 ${filaVazia ? "opacity-100" : "opacity-0"}`}
        >
          Nova conversa entra aqui
        </span>
        {FILA.map((c, i) => {
          const naFila = chegou(i) && !distribuida(i);
          return (
            <div
              key={c.cliente}
              className={`absolute inset-x-2.5 top-1/2 -mt-[1.125rem] flex h-9 items-center gap-2 rounded-xl bg-white px-2 ring-1 ring-emerald-300 ${TRANSICAO} ${
                naFila ? "translate-y-0 opacity-100" : distribuida(i) ? "translate-y-6 opacity-0" : "-translate-y-3 opacity-0"
              }`}
            >
              <IconeDoCanal canal={c.canal} tamanho="h-6 w-6" icone="h-3 w-3" />
              <span className="flex-1 truncate text-[12px] font-semibold text-zinc-900">{c.cliente}</span>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10.5px] font-medium text-emerald-700">{c.depto}</span>
            </div>
          );
        })}
      </div>

      {/* Atendentes */}
      <ul className="flex flex-1 flex-col justify-center gap-2">
        {EQUIPE.map((pessoa) => {
          const minhas = FILA.map((c, i) => ({ ...c, i })).filter((c) => c.para === pessoa.id);
          const recebidas = minhas.filter((c) => distribuida(c.i));
          const ativo = recebidas.length > 0;
          return (
            <li key={pessoa.id} className="relative flex items-center gap-2.5 rounded-xl bg-white/70 px-2.5 py-2 ring-1 ring-creme-borda">
              <span
                className={`pointer-events-none absolute inset-0 rounded-xl bg-emerald-50 ring-1 ring-emerald-300 transition-opacity duration-300 ${
                  ativo ? "opacity-100" : "opacity-0"
                }`}
              />
              <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-creme-profundo text-[11px] font-bold text-zinc-900">
                {pessoa.sigla}
              </span>
              <span className="relative w-[4.5rem] shrink-0">
                <span className="block text-[12px] font-semibold text-zinc-900">{pessoa.nome}</span>
                <span className="block text-[10.5px] text-zinc-500">{pessoa.depto}</span>
              </span>
              <span className="relative flex h-6 min-w-0 flex-1 justify-end">
                {minhas.map((c) => (
                  <span
                    key={c.cliente}
                    className={`absolute right-0 top-0 flex max-w-full origin-right items-center gap-1.5 rounded-full bg-white py-0.5 pl-0.5 pr-2 ring-1 ring-emerald-300 ${TRANSICAO} ${cresce(
                      distribuida(c.i)
                    )} ${surge(distribuida(c.i))}`}
                    style={{ transitionDelay: distribuida(c.i) ? "180ms" : "0ms" }}
                  >
                    <IconeDoCanal canal={c.canal} tamanho="h-5 w-5" icone="h-2.5 w-2.5" />
                    <span className="truncate text-[11px] text-zinc-900">{c.cliente}</span>
                  </span>
                ))}
              </span>
              <span className="relative w-7 shrink-0 text-right text-[12px] font-semibold text-zinc-600">
                <Contador valor={pessoa.inicial + recebidas.length} duracao={0.4} saltar={passo === 0} />
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-center text-[10.5px] text-zinc-500">em atendimento agora</p>
    </div>
  );
}
