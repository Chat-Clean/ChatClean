import { IconeDoCanal } from "./PecasDeCena";
import { TRANSICAO, TRANSICAO_RAPIDA, entraDaEsquerda } from "./estiloDeCena";

/**
 * Tudo em um só lugar: cada canal chama por vez, a linha dele acende até a
 * caixa de entrada e a conversa aparece na lista. No fim, quatro aplicativos
 * numa tela só.
 *
 * A lista já tem as quatro linhas no lugar final (a mais nova em cima); cada
 * chegada só revela a sua. Nada é inserido nem empurra as outras.
 */
const CONVERSAS = [
  { canal: "WhatsApp", nome: "Marina Souza", texto: "Vocês entregam ainda hoje?" },
  { canal: "Instagram", nome: "Carlos Lima", texto: "Vi o post, tem no tamanho M?" },
  { canal: "Facebook", nome: "Ana Paula", texto: "Qual o valor do plano anual?" },
  { canal: "Telegram", nome: "Pedro Alves", texto: "Consigo trocar o horário?" },
];

// A mais nova em cima: a lista mostra as conversas na ordem inversa da chegada
const NA_LISTA = CONVERSAS.map((c, ordem) => ({ ...c, ordem })).reverse();

// Altura de cada canal na coluna da esquerda, em % do palco (centros)
const Y_CANAL = [20, 40, 60, 80];

export default function CenaCaixaDeEntrada({ passo }) {
  const ativo = passo - 1;

  return (
    <div className="absolute inset-0 flex items-center gap-3 px-5 md:px-10">
      {/* Canais */}
      <div className="relative z-10 flex h-full flex-col justify-around py-6">
        {CONVERSAS.map((c, i) => (
          <div
            key={c.canal}
            className={`flex items-center gap-2.5 ${TRANSICAO_RAPIDA} ${i === ativo ? "scale-110" : "scale-100"} ${
              passo === 0 || i < passo ? "opacity-100" : "opacity-55"
            }`}
          >
            <span className="relative">
              <IconeDoCanal canal={c.canal} tamanho="h-9 w-9" />
              {i === ativo && <span key={passo} className="cena-onda absolute inset-0 rounded-xl ring-2 ring-emerald-400" />}
            </span>
            <span className="hidden text-xs font-medium text-zinc-600 sm:inline">{c.canal}</span>
          </div>
        ))}
      </div>

      {/* Linhas: cada canal até a caixa; a do canal que chamou acende.
          Largura explícita: <svg> posicionado ignora `right` e fica com 300px. */}
      <svg
        className="absolute inset-y-0 left-[7.75rem] hidden h-full w-[calc(100%-28rem)] sm:block md:left-[9.25rem] md:w-[calc(100%-30.75rem)]"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        {Y_CANAL.map((y, i) => (
          <g key={i}>
            <path d={`M0 ${y} C 50 ${y}, 50 50, 100 50`} fill="none" stroke="rgba(20,35,27,0.14)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            {/* Linha acesa: a camada verde aparece por opacidade */}
            <path
              d={`M0 ${y} C 50 ${y}, 50 50, 100 50`}
              fill="none"
              stroke="#51bc69"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
              className="transition-opacity duration-500"
              style={{ opacity: i === ativo ? 1 : i < passo ? 0.35 : 0 }}
            />
          </g>
        ))}
      </svg>

      {/* Caixa de entrada */}
      <div className="relative z-10 ml-auto min-w-0 max-w-[19rem] flex-1 rounded-2xl bg-white p-3 ring-1 ring-creme-borda shadow-[0_24px_48px_-16px_rgba(20,35,27,0.18)]">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-xs font-semibold text-zinc-900">Caixa de entrada</span>
          <span className="text-[11px] tabular-nums text-zinc-500">
            {passo} {passo === 1 ? "conversa" : "conversas"}
          </span>
        </div>
        <ul className="flex flex-col gap-1.5">
          {NA_LISTA.map((c) => {
            const chegou = c.ordem < passo;
            const maisNova = c.ordem === ativo;
            return (
              <li
                key={c.nome}
                className={`relative flex items-center gap-2.5 rounded-xl bg-zinc-50 px-2.5 py-2 ${TRANSICAO} ${entraDaEsquerda(chegou)}`}
              >
                {/* Destaque da mais nova: camada por opacidade, sem trocar cor */}
                <span
                  className={`pointer-events-none absolute inset-0 rounded-xl bg-creme ring-1 ring-emerald-300 transition-opacity duration-300 ${
                    maisNova ? "opacity-100" : "opacity-0"
                  }`}
                />
                <span className="relative">
                  <IconeDoCanal canal={c.canal} tamanho="h-7 w-7" icone="h-3.5 w-3.5" />
                </span>
                <span className="relative min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold text-zinc-900">{c.nome}</span>
                  <span className="block truncate text-[11px] text-zinc-500">{c.texto}</span>
                </span>
                <span
                  className={`relative h-2 w-2 shrink-0 rounded-full bg-emerald-400 transition-opacity duration-300 ${maisNova ? "opacity-100" : "opacity-0"}`}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
