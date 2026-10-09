/**
 * Os cartões de uma Notícia em vídeo, e a capa que os dois compartilham.
 *
 * São dois cartões porque são dois lugares: o ESCURO é o do carrossel do blog,
 * com a pegada do Post em destaque; o CLARO é o da grade da listagem e das
 * sugestões embaixo do vídeo. Os dois levam para a página de assistir: o
 * cartão não toca o vídeo, e por isso não carrega reprodutor nenhum.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Calendar, Play, Video } from "lucide-react";

import {
  LARGURA_DA_MINIATURA_AUSENTE,
  miniaturaDeReserva,
  miniaturaDoVideo,
} from "@/domain/blog/noticias";
import {
  ROTULO_DE_ASSISTIR,
  descricaoDaNoticia,
  enderecoDaNoticia,
  rotuloDoCartaoDeNoticia,
  textoDaDataDaNoticia,
  tituloDaNoticia,
} from "./noticiasPublico";

/* A mesma luz de latão do cartão de Post em destaque. */
const LUZ_DO_DESTAQUE =
  "radial-gradient(circle at 100% 0%, rgba(183,146,62,0.28), transparent 55%), radial-gradient(circle at 0% 100%, rgba(81,188,105,0.14), transparent 50%)";

/**
 * A miniatura do vídeo, em 16:9, com o sinal de play por cima.
 *
 * ─── TRÊS DEGRAUS, E NENHUM DELES É IMAGEM QUEBRADA ─────────────────────────
 *
 * Começa pela miniatura grande. Nem todo vídeo a tem, e o YouTube não responde
 * com erro: devolve um quadro cinza pequeno, que carrega "com sucesso". Por
 * isso a conferência é pela LARGURA do que chegou, no `onLoad`, e não só pelo
 * `onError`. Faltando a grande, entra a de reserva, que todo vídeo tem; se até
 * ela falhar, fica o fundo `aurora-bg` com o ícone.
 *
 * A imagem é decorativa (`alt=""`): o título do vídeo já está no cartão, e
 * repeti-lo aqui faria o leitor de tela dizê-lo duas vezes.
 */
export function CapaDoVideo({ youtubeId, preguicosa = true, tamanhoDoPlay = "h-14 w-14" }) {
  const [degrau, setDegrau] = useState(0);
  const endereco =
    degrau === 0
      ? miniaturaDoVideo(youtubeId)
      : degrau === 1
        ? miniaturaDeReserva(youtubeId)
        : "";

  return (
    <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl aurora-bg">
      {endereco !== "" ? (
        <img
          src={endereco}
          alt=""
          data-papel="capa-do-video"
          referrerPolicy="no-referrer"
          loading={preguicosa ? "lazy" : undefined}
          width={1280}
          height={720}
          onError={() => setDegrau((d) => d + 1)}
          onLoad={(evento) => {
            if (degrau === 0 && evento.currentTarget.naturalWidth <= LARGURA_DA_MINIATURA_AUSENTE) {
              setDegrau(1);
            }
          }}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <Video aria-hidden="true" className="h-10 w-10 text-white/60" />
      )}
      {/* O véu garante que o play se leia sobre qualquer miniatura. */}
      <div aria-hidden="true" className="absolute inset-0 bg-emerald-950/20" />
      <span
        aria-hidden="true"
        className={`relative grid ${tamanhoDoPlay} place-items-center rounded-full bg-yellow-300 text-emerald-950 shadow-xl transition-transform duration-300 group-hover:scale-110`}
      >
        <Play className="h-1/2 w-1/2 translate-x-[1px] fill-current" />
      </span>
    </div>
  );
}

/**
 * O cartão ESCURO, do carrossel do blog. Mesma moldura do Post em destaque:
 * borda de latão, fundo `emerald-950`, a capa de um lado e o texto do outro.
 */
export function CartaoDeNoticiaEmDestaque({ noticia }) {
  const descricao = descricaoDaNoticia(noticia);
  const data = textoDaDataDaNoticia(noticia);
  return (
    <Link
      to={enderecoDaNoticia(noticia)}
      aria-label={rotuloDoCartaoDeNoticia(noticia)}
      data-noticia={noticia.id}
      className="group block h-full"
    >
      <div className="relative grid h-full overflow-hidden rounded-3xl border border-yellow-400/25 bg-emerald-950 transition-colors duration-500 group-hover:border-yellow-400/60 md:grid-cols-2 md:items-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: LUZ_DO_DESTAQUE }}
        />
        <div className="relative p-3 pb-0 md:p-4 md:pr-0">
          <CapaDoVideo youtubeId={noticia.youtube_id} />
        </div>
        <div className="relative flex flex-col p-6 md:p-8">
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-300 px-3 py-1 text-xs font-bold text-emerald-950">
              <Video aria-hidden="true" className="h-3.5 w-3.5" />
              Vídeo
            </span>
            {data !== "" && (
              <span className="flex items-center gap-1 whitespace-nowrap text-xs text-creme/70">
                <Calendar aria-hidden="true" className="h-3.5 w-3.5" />
                {data}
              </span>
            )}
          </div>
          <h2 className="mb-6 text-2xl font-black tracking-tight text-creme transition-colors group-hover:text-yellow-300 md:mb-4 md:text-3xl">
            {tituloDaNoticia(noticia)}
          </h2>
          {/* A descrição só a partir do tablet, como o resumo do Post em
              destaque: no celular ela dobrava a altura do cartão. */}
          {descricao !== "" && (
            <p className="mb-6 hidden leading-relaxed text-creme/75 md:line-clamp-3">{descricao}</p>
          )}
          <div className="mt-auto flex justify-end">
            <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-yellow-300 px-5 py-2.5 text-sm font-bold text-emerald-950 transition-all group-hover:gap-3">
              {ROTULO_DE_ASSISTIR}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

/** O cartão CLARO, da grade da listagem e das sugestões. */
export function CartaoDeNoticia({ noticia }) {
  const descricao = descricaoDaNoticia(noticia);
  const data = textoDaDataDaNoticia(noticia);
  return (
    <Link
      to={enderecoDaNoticia(noticia)}
      aria-label={rotuloDoCartaoDeNoticia(noticia)}
      data-noticia={noticia.id}
      className="group block h-full"
    >
      <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-zinc-100 bg-white transition-all duration-500 green-glow hover:border-emerald-200">
        <div className="p-3 pb-0">
          <CapaDoVideo youtubeId={noticia.youtube_id} tamanhoDoPlay="h-12 w-12" />
        </div>
        <div className="flex flex-1 flex-col p-6">
          <h3 className="mb-3 text-lg font-black tracking-tight text-zinc-900 transition-colors group-hover:text-emerald-700">
            {tituloDaNoticia(noticia)}
          </h3>
          {descricao !== "" && (
            <p className="mb-6 line-clamp-3 text-sm leading-relaxed text-zinc-500">{descricao}</p>
          )}
          <div className="mt-auto flex items-center justify-between border-t border-zinc-100 pt-4 text-xs text-zinc-400">
            {data !== "" ? (
              <span className="flex items-center gap-1">
                <Calendar aria-hidden="true" className="h-3.5 w-3.5" />
                {data}
              </span>
            ) : (
              <span />
            )}
            <span className="flex items-center gap-1 font-semibold text-emerald-600 transition-all group-hover:gap-2">
              {ROTULO_DE_ASSISTIR}
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
