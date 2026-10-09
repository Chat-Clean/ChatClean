/**
 * A listagem de Notícias em vídeo (`/noticias`): todos os vídeos, e só eles.
 *
 * É a resposta para "ver todos sem misturar com os Posts": o blog mostra os
 * mais recentes num carrossel, e daqui para frente a lista é esta, com a grade
 * dela e a paginação dela. Nenhum artigo aparece aqui, e nenhum vídeo aparece
 * na grade de artigos.
 *
 * A visibilidade é da política de leitura anônima, e de mais nada: a leitura é
 * pelo cliente público, incondicionalmente.
 *
 * As situações (carregando, pronta, vazia, falha e falha permanente) e as
 * frases moram em `noticiasPublico.js`, puras.
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft, Video } from "lucide-react";

import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { Button } from "../components/ui/button";
import { listarNoticiasPublicas } from "@/data/blog/noticias";
import { CartaoDeNoticia } from "./CartaoDeNoticia";
import {
  ENDERECO_DO_BLOG,
  NOTICIAS_CARREGANDO,
  NOTICIAS_FALHA,
  NOTICIAS_FALHA_PERMANENTE,
  NOTICIAS_PRONTAS,
  ROTULO_DE_CARREGAR_MAIS,
  ROTULO_DE_RECARREGAR,
  ROTULO_DE_VOLTAR_AO_BLOG,
  TAMANHO_DA_PAGINA_DE_NOTICIAS,
  TEXTO_DE_CARREGANDO,
  anuncioDasNoticias,
  falaDasNoticias,
  falhaDeExcecao,
  haMaisNoticias,
  situacaoDasNoticias,
} from "./noticiasPublico";

const TITULO_DA_PAGINA = "Notícias em vídeo | ChatClean";

/** O pedido inicial: primeira página. `tentativa` só existe para repetir. */
const PEDIDO_INICIAL = Object.freeze({ deslocamento: 0, tentativa: 0 });

export default function Noticias() {
  const [pedido, setPedido] = useState(PEDIDO_INICIAL);
  const [noticias, setNoticias] = useState(null);
  const [haMais, setHaMais] = useState(false);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const anterior = document.title;
    document.title = TITULO_DA_PAGINA;
    return () => {
      document.title = anterior;
    };
  }, []);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);
    (async () => {
      /* A camada devolve erro tipado e não lança, mas uma rejeição sem
         tratamento deixaria o esqueleto para sempre. */
      let resultado;
      try {
        resultado = await listarNoticiasPublicas({
          limite: TAMANHO_DA_PAGINA_DE_NOTICIAS,
          deslocamento: pedido.deslocamento,
        });
      } catch (excecao) {
        resultado = { ok: false, erro: falhaDeExcecao(excecao) };
      }
      if (!vivo) return;
      if (!resultado?.ok) {
        /* A página seguinte que falha não apaga o que já está na tela. */
        if (pedido.deslocamento === 0) setNoticias(null);
        setErro(resultado?.erro ?? { tipo: "inesperado", mensagem: "" });
        setCarregando(false);
        return;
      }
      const recebidas = resultado.dados;
      setNoticias((anteriores) =>
        pedido.deslocamento === 0 ? recebidas : [...(anteriores ?? []), ...recebidas],
      );
      setHaMais(haMaisNoticias(recebidas));
      setErro(null);
      setCarregando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [pedido]);

  const tentarDeNovo = useCallback(
    () => setPedido((p) => ({ deslocamento: 0, tentativa: p.tentativa + 1 })),
    [],
  );
  const carregarMais = useCallback(
    () =>
      setPedido((p) => ({
        ...p,
        deslocamento: p.deslocamento + TAMANHO_DA_PAGINA_DE_NOTICIAS,
      })),
    [],
  );

  const situacao = situacaoDasNoticias({ carregando, erro, noticias });
  const lista = Array.isArray(noticias) ? noticias : [];

  return (
    <div
      className="min-h-screen bg-creme text-zinc-900 selection:bg-emerald-500 selection:text-white"
      data-tela="noticias-publicas"
      data-situacao={situacao}
    >
      <Navbar />

      <section className="relative aurora-bg aurora-beams overflow-hidden pt-32 pb-14 md:pt-40 md:pb-20">
        <div className="absolute inset-0 bg-grid-white opacity-40 pointer-events-none" />
        <div className="relative z-10 mx-auto max-w-3xl px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white backdrop-blur-md"
          >
            <Video aria-hidden="true" className="h-3.5 w-3.5" />
            Blog ChatClean
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="mb-6 text-5xl font-black leading-[1.0] tracking-tighter text-white md:text-7xl"
          >
            Notícias <span className="text-yellow-300">em vídeo</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg text-white/85"
          >
            As novidades da ChatClean, gravadas por quem faz a ChatClean.
          </motion.p>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 py-10 md:py-16">
        <Link
          to={ENDERECO_DO_BLOG}
          data-acao="voltar-ao-blog"
          className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-emerald-700 transition-all hover:gap-3 hover:text-emerald-900"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          {ROTULO_DE_VOLTAR_AO_BLOG}
        </Link>

        <p role="status" aria-live="polite" data-papel="anuncio" className="sr-only">
          {carregando
            ? TEXTO_DE_CARREGANDO
            : situacao === NOTICIAS_PRONTAS
              ? anuncioDasNoticias(lista.length)
              : ""}
        </p>

        {situacao === NOTICIAS_CARREGANDO && (
          <div data-papel="esqueleto" aria-hidden="true" className="grid gap-6 pb-16 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-72 animate-pulse rounded-3xl border border-zinc-100 bg-zinc-50" />
            ))}
          </div>
        )}

        {situacao !== NOTICIAS_CARREGANDO && situacao !== NOTICIAS_PRONTAS && (
          <SemVideos situacao={situacao} aoRepetir={tentarDeNovo} />
        )}

        {situacao === NOTICIAS_PRONTAS && (
          <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3" data-papel="cartoes">
            {lista.map((noticia, i) => (
              <motion.div
                key={noticia.id}
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: (i % 3) * 0.08, ease: [0.16, 1, 0.3, 1] }}
              >
                <CartaoDeNoticia noticia={noticia} />
              </motion.div>
            ))}
          </div>
        )}

        {situacao === NOTICIAS_PRONTAS && haMais && (
          <div className="mb-8 flex justify-center">
            <Button
              type="button"
              variant="outline"
              data-acao="carregar-mais"
              disabled={carregando}
              onClick={carregarMais}
              className="rounded-full"
            >
              {ROTULO_DE_CARREGAR_MAIS}
            </Button>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

/**
 * O vazio e as duas falhas, cada um dizendo o que houve e o que fazer. Nenhum
 * detalhe técnico é mostrado: o que sai é a fala da situação.
 */
function SemVideos({ situacao, aoRepetir }) {
  const fala = falaDasNoticias(situacao);
  const alerta = situacao === NOTICIAS_FALHA || situacao === NOTICIAS_FALHA_PERMANENTE;
  const Icone = alerta ? AlertCircle : Video;
  return (
    <div
      role={alerta ? "alert" : "status"}
      data-papel="situacao"
      className={`mx-auto mb-16 max-w-xl rounded-3xl border p-10 text-center ${
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
      {fala.repetir && (
        <div className="mt-6 flex justify-center">
          <Button
            type="button"
            data-acao="repetir"
            onClick={() => aoRepetir?.()}
            className="rounded-full bg-emerald-500 text-white hover:bg-emerald-600"
          >
            {ROTULO_DE_RECARREGAR}
          </Button>
        </div>
      )}
    </div>
  );
}
