/**
 * A página de assistir a uma Notícia (`/noticias/:id`): o vídeo, o título e a
 * descrição.
 *
 * ─── O REPRODUTOR SÓ CARREGA QUANDO A PESSOA PEDE ───────────────────────────
 *
 * A página abre com a miniatura e um botão de play, e não com o reprodutor do
 * YouTube: ele pesa mais que a página inteira, e carregá-lo para quem só veio
 * ler a descrição é gastar a rede dos outros. No clique o reprodutor entra já
 * tocando, pelo domínio `youtube-nocookie.com`, que só grava cookie no play.
 *
 * ─── AUSENTE É AUSENTE ──────────────────────────────────────────────────────
 *
 * Notícia que não existe e Notícia que saiu do ar dão a MESMA tela: a política
 * de leitura anônima não devolve a segunda, e esta página não tem como (nem
 * deve) distinguir as duas.
 *
 * A leitura é pelo cliente público, incondicionalmente. As situações e as
 * frases moram em `noticiasPublico.js`.
 */

import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft, Calendar, ExternalLink, Play, Video } from "lucide-react";

import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { Button } from "../components/ui/button";
import { lerNoticiaPublica, listarNoticiasPublicas } from "@/data/blog/noticias";
import {
  LARGURA_DA_MINIATURA_AUSENTE,
  enderecoDoReprodutor,
  enderecoNoYoutube,
  miniaturaDeReserva,
  miniaturaDoVideo,
} from "@/domain/blog/noticias";
import { CartaoDeNoticia } from "./CartaoDeNoticia";
import {
  ENDERECO_DAS_NOTICIAS,
  NOTICIAS_CARREGANDO,
  NOTICIAS_FALHA,
  NOTICIAS_FALHA_PERMANENTE,
  NOTICIAS_PRONTAS,
  PARAMETRO_DA_NOTICIA,
  ROTULO_DE_RECARREGAR,
  ROTULO_DE_VOLTAR_AS_NOTICIAS,
  TAMANHO_DAS_OUTRAS_NOTICIAS,
  TEXTO_DE_CARREGANDO_O_VIDEO,
  TITULO_DAS_OUTRAS,
  descricaoDaNoticia,
  falaDasNoticias,
  falhaDeExcecao,
  outrasNoticias,
  rotuloDeTocar,
  situacaoDaNoticia,
  textoDaDataDaNoticia,
  tituloDaNoticia,
  tituloDoReprodutor,
} from "./noticiasPublico";

const TITULO_PADRAO = "Notícias em vídeo | ChatClean";

export default function NoticiaPublica() {
  const id = useParams()[PARAMETRO_DA_NOTICIA] ?? "";

  const [noticia, setNoticia] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [tentativa, setTentativa] = useState(0);
  const [outras, setOutras] = useState([]);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);
    setNoticia(null);
    (async () => {
      let resultado;
      try {
        resultado = await lerNoticiaPublica(id);
      } catch (excecao) {
        resultado = { ok: false, erro: falhaDeExcecao(excecao) };
      }
      if (!vivo) return;
      if (!resultado?.ok) {
        setErro(resultado?.erro ?? { tipo: "inesperado", mensagem: "" });
        setCarregando(false);
        return;
      }
      setNoticia(resultado.dados);
      setCarregando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [id, tentativa]);

  /* As sugestões são complemento: falhando, a faixa não aparece e o vídeo
     continua na tela. Um a mais que o teto, porque o atual sai da lista. */
  useEffect(() => {
    let vivo = true;
    (async () => {
      let resultado;
      try {
        resultado = await listarNoticiasPublicas({ limite: TAMANHO_DAS_OUTRAS_NOTICIAS + 1 });
      } catch {
        resultado = { ok: false };
      }
      if (vivo) setOutras(resultado?.ok ? resultado.dados : []);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const titulo = tituloDaNoticia(noticia);
  useEffect(() => {
    const anterior = document.title;
    document.title = titulo === "" ? TITULO_PADRAO : `${titulo} | ChatClean`;
    return () => {
      document.title = anterior;
    };
  }, [titulo]);

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), []);

  const situacao = situacaoDaNoticia({ carregando, erro, noticia });
  const pronta = situacao === NOTICIAS_PRONTAS;
  const data = textoDaDataDaNoticia(noticia);
  const descricao = descricaoDaNoticia(noticia);
  const sugestoes = outrasNoticias(outras, noticia ?? { id });

  return (
    <div
      className="min-h-screen bg-creme text-zinc-900 selection:bg-emerald-500 selection:text-white"
      data-tela="noticia-publica"
      data-situacao={situacao}
    >
      <Navbar />

      <section className="relative aurora-bg aurora-beams overflow-hidden pt-28 pb-12 md:pt-40 md:pb-16">
        <div className="absolute inset-0 bg-grid-white opacity-40 pointer-events-none" />
        <div className="relative z-10 mx-auto max-w-4xl px-5 md:px-4">
          <Link
            to={ENDERECO_DAS_NOTICIAS}
            data-acao="voltar-as-noticias"
            className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-white/85 transition-all hover:gap-3 hover:text-white"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {ROTULO_DE_VOLTAR_AS_NOTICIAS}
          </Link>
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-300 px-3 py-1 text-xs font-bold text-emerald-950">
              <Video aria-hidden="true" className="h-3.5 w-3.5" />
              Vídeo
            </span>
            {pronta && data !== "" && (
              <span className="flex items-center gap-1 text-sm text-white/80">
                <Calendar aria-hidden="true" className="h-4 w-4" />
                {data}
              </span>
            )}
          </div>
          <motion.h1
            key={pronta ? noticia.id : situacao}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-3xl font-black leading-tight tracking-tighter text-white md:text-5xl"
          >
            {pronta ? titulo : "Notícias em vídeo"}
          </motion.h1>
        </div>
      </section>

      <main className="mx-auto max-w-4xl px-5 py-10 md:px-4 md:py-16">
        <p role="status" aria-live="polite" className="sr-only">
          {carregando ? TEXTO_DE_CARREGANDO_O_VIDEO : ""}
        </p>

        {situacao === NOTICIAS_CARREGANDO && (
          <div
            data-papel="esqueleto"
            aria-hidden="true"
            className="aspect-video animate-pulse rounded-3xl border border-zinc-100 bg-zinc-50"
          />
        )}

        {!pronta && situacao !== NOTICIAS_CARREGANDO && (
          <SemVideo situacao={situacao} aoRepetir={tentarDeNovo} />
        )}

        {pronta && (
          <article data-noticia={noticia.id}>
            {/* A `key` troca o reprodutor inteiro quando o vídeo muda: sem ela,
                ir de um vídeo para uma sugestão manteria o anterior tocando. */}
            <Reprodutor key={noticia.id} noticia={noticia} />

            {descricao !== "" && (
              <p
                data-papel="descricao"
                className="mt-8 whitespace-pre-line text-lg leading-relaxed text-zinc-700"
              >
                {descricao}
              </p>
            )}

            <a
              href={enderecoNoYoutube(noticia.youtube_id)}
              target="_blank"
              rel="noopener noreferrer"
              data-acao="ver-no-youtube"
              className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-emerald-700 transition-colors hover:text-emerald-900"
            >
              Assistir no YouTube
              <ExternalLink aria-hidden="true" className="h-4 w-4" />
            </a>
          </article>
        )}

        {sugestoes.length > 0 && (
          <section aria-label={TITULO_DAS_OUTRAS} data-papel="outras-noticias" className="mt-16">
            <h2 className="mb-6 text-2xl font-black tracking-tight text-zinc-900">
              {TITULO_DAS_OUTRAS}
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              {sugestoes.map((outra) => (
                <CartaoDeNoticia key={outra.id} noticia={outra} />
              ))}
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}

/**
 * A miniatura com o play, e o reprodutor depois do clique.
 *
 * A miniatura segue os mesmos três degraus de `CapaDoVideo`: a grande, a de
 * reserva quando o YouTube devolve o quadro cinza, e o fundo quando nenhuma
 * carrega. Aqui ela não é preguiçosa: é a primeira coisa da página.
 */
function Reprodutor({ noticia }) {
  const [tocando, setTocando] = useState(false);
  const [degrau, setDegrau] = useState(0);
  const youtubeId = noticia.youtube_id;
  const miniatura =
    degrau === 0 ? miniaturaDoVideo(youtubeId) : degrau === 1 ? miniaturaDeReserva(youtubeId) : "";

  return (
    <div
      data-papel="reprodutor"
      data-tocando={tocando ? "1" : "0"}
      className="relative aspect-video overflow-hidden rounded-3xl border border-emerald-950/10 bg-emerald-950 shadow-2xl"
    >
      {tocando ? (
        <iframe
          src={enderecoDoReprodutor(youtubeId, { tocar: true })}
          title={tituloDoReprodutor(noticia)}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 size-full border-0"
        />
      ) : (
        <button
          type="button"
          data-acao="tocar"
          aria-label={rotuloDeTocar(noticia)}
          onClick={() => setTocando(true)}
          className="group absolute inset-0 flex size-full cursor-pointer items-center justify-center aurora-bg focus-visible:outline-4 focus-visible:outline-offset-[-4px] focus-visible:outline-yellow-300"
        >
          {miniatura !== "" && (
            <img
              src={miniatura}
              alt=""
              referrerPolicy="no-referrer"
              width={1280}
              height={720}
              onError={() => setDegrau((d) => d + 1)}
              onLoad={(evento) => {
                if (
                  degrau === 0 &&
                  evento.currentTarget.naturalWidth <= LARGURA_DA_MINIATURA_AUSENTE
                ) {
                  setDegrau(1);
                }
              }}
              className="absolute inset-0 size-full object-cover"
            />
          )}
          <span aria-hidden="true" className="absolute inset-0 bg-emerald-950/25" />
          <span
            aria-hidden="true"
            className="relative grid h-20 w-20 place-items-center rounded-full bg-yellow-300 text-emerald-950 shadow-2xl transition-transform duration-300 group-hover:scale-110"
          >
            <Play className="h-9 w-9 translate-x-[2px] fill-current" />
          </span>
        </button>
      )}
    </div>
  );
}

/** A ausência e as duas falhas, cada uma dizendo o que houve e o que fazer. */
function SemVideo({ situacao, aoRepetir }) {
  const fala = falaDasNoticias(situacao);
  const alerta = situacao === NOTICIAS_FALHA || situacao === NOTICIAS_FALHA_PERMANENTE;
  const Icone = alerta ? AlertCircle : Video;
  return (
    <div
      role={alerta ? "alert" : "status"}
      data-papel="situacao"
      className={`mx-auto max-w-xl rounded-3xl border p-10 text-center ${
        alerta ? "border-red-200 bg-red-50" : "border-zinc-100 bg-white"
      }`}
    >
      <Icone
        aria-hidden="true"
        className={`mx-auto h-8 w-8 ${alerta ? "text-red-600" : "text-zinc-400"}`}
      />
      <h2 data-papel="o-que-houve" className="mt-4 text-xl font-black tracking-tight text-zinc-900">
        {fala.oQueHouve}
      </h2>
      <p data-papel="o-que-fazer" className="mt-2 text-zinc-500">
        {fala.oQueFazer}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {fala.repetir && (
          <Button
            type="button"
            data-acao="repetir"
            onClick={() => aoRepetir?.()}
            className="rounded-full bg-emerald-500 text-white hover:bg-emerald-600"
          >
            {ROTULO_DE_RECARREGAR}
          </Button>
        )}
        <Button asChild variant="outline" className="rounded-full">
          <Link to={ENDERECO_DAS_NOTICIAS}>{ROTULO_DE_VOLTAR_AS_NOTICIAS}</Link>
        </Button>
      </div>
    </div>
  );
}
