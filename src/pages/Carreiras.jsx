/**
 * `/carreiras`: o hero, os benefícios, as Vagas Abertas e o convite final.
 *
 * Desde a Story 5.7 a seção de vagas lê do banco, por `listarVagasAbertas`
 * (a função `vagas_abertas`, que só devolve Aberta e já vem das mais
 * recentes para as mais antigas). A ordem é a da camada, sem reordenar.
 *
 * A seção tem quatro situações, decididas por `situacaoDaLista` no módulo
 * puro: carregando (esqueleto), erro (frase e tentar de novo), vazia (o
 * convite do currículo) e pronta (os cartões). O erro é conferido ANTES do
 * vazio: uma leitura que falhou nunca aparece como "nenhuma vaga".
 *
 * A página não toca o `<head>`: título, descrição e canônica de Carreiras são
 * do HTML servido (Story 5.8).
 *
 * Vindo de uma Vaga pela navegação de ida (PUSH), a chave de transição é a
 * mesma e ninguém mais rola: `useChegadaDaPagina` sobe ao topo e leva o foco
 * ao `<h1>` do hero. Na volta do navegador (POP), não força o topo.
 */

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, ArrowRight, Clock, Users, Zap } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Reveal from "../components/animated/Reveal";
import { StaggerGroup, StaggerItem } from "../components/animated/StaggerGroup";
import { listarVagasAbertas } from "@/data/carreiras/leitura";
import CartaoDeVaga from "./CartaoDeVaga";
import SemVagasAbertas from "./SemVagasAbertas";
import { useChegadaDaPagina } from "./useChegadaDaPagina";
import {
  ENDERECO_DO_CURRICULO,
  LISTA_CARREGANDO,
  LISTA_ERRO,
  LISTA_PRONTA,
  LISTA_VAZIA,
  ROTULO_DE_RECARREGAR_A_LISTA,
  TEXTO_DE_CARREGANDO_A_LISTA,
  falaDaLista,
  falhaDeExcecao,
  situacaoDaLista,
} from "./carreirasPublico";

const beneficios = [
  {
    icon: Users,
    title: "Ambiente Colaborativo",
    description:
      "Trabalhe com uma equipe talentosa e apaixonada por inovação e tecnologia.",
    accent: "from-emerald-500 to-green-600",
  },
  {
    icon: Clock,
    title: "Flexibilidade",
    description:
      "Horários flexíveis e opções de trabalho remoto para equilibrar vida pessoal e profissional.",
    accent: "from-blue-500 to-cyan-600",
  },
  {
    icon: Zap,
    title: "Crescimento Acelerado",
    description:
      "Oportunidades de desenvolvimento profissional e crescimento dentro da empresa.",
    accent: "from-yellow-500 to-orange-500",
  },
];

export default function Carreiras() {
  const [vagas, setVagas] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);
    (async () => {
      /* A camada devolve erro tipado e não lança; a exceção que escapar
         mesmo assim vira erro, com a frase fixa, e nunca lista vazia. */
      let resultado;
      try {
        resultado = await listarVagasAbertas();
      } catch (excecao) {
        resultado = { ok: false, erro: falhaDeExcecao(excecao) };
      }
      if (!vivo) return;
      if (resultado?.ok === true && Array.isArray(resultado.dados)) {
        setVagas(resultado.dados);
        setErro(null);
      } else {
        setVagas(null);
        setErro(resultado?.erro ?? falhaDeExcecao(null));
      }
      setCarregando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [tentativa]);

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), []);
  const situacao = situacaoDaLista({ carregando, erro, vagas });
  const refDaPagina = useChegadaDaPagina(true);

  return (
    <div
      ref={refDaPagina}
      className="min-h-screen bg-creme text-zinc-900 selection:bg-emerald-500 selection:text-white"
    >
      <Navbar />

      {/* Hero aurora */}
      <section className="relative aurora-bg aurora-beams pt-44 pb-28 overflow-hidden">
        <div className="absolute inset-0 bg-grid-white opacity-40 pointer-events-none" />
        <div className="absolute top-1/4 -right-32 w-96 h-96 bg-emerald-300/30 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
        <div className="absolute bottom-1/4 -left-32 w-[500px] h-[500px] bg-cyan-300/25 rounded-full blur-[140px] mix-blend-screen pointer-events-none" />

        <div className="relative z-10 max-w-3xl mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 border border-white/30 backdrop-blur-md text-white text-xs font-bold uppercase tracking-widest mb-8"
          >
            Faça parte do time
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            tabIndex={-1}
            className="text-5xl md:text-7xl font-black text-white tracking-tighter leading-[1.0] mb-6 outline-none"
          >
            Construa o futuro do{" "}
            <span className="text-yellow-300">
              atendimento
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="text-lg md:text-xl text-white/85 max-w-2xl mx-auto"
          >
            Na ChatClean, estamos transformando a forma como empresas se relacionam com seus
            clientes. Junte-se a nós.
          </motion.p>
        </div>
      </section>

      {/* Benefícios */}
      <section className="py-24 md:py-32 bg-creme relative overflow-hidden">
        <div className="absolute inset-0 bg-grid pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 relative">
          <Reveal className="text-center mb-16 max-w-2xl mx-auto">
            <span className="inline-block px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold uppercase tracking-widest mb-6">
              Por que a ChatClean?
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-zinc-900 tracking-tighter mb-6">
              Mais que um emprego,{" "}
              <span className="text-gradient-green">uma missão</span>
            </h2>
          </Reveal>

          <StaggerGroup className="grid md:grid-cols-3 gap-6">
            {beneficios.map((b) => (
              <StaggerItem key={b.title}>
                <div className="bg-white rounded-3xl p-8 border border-zinc-100 hover:border-emerald-200 green-glow card-3d transition-all duration-500 h-full">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${b.accent} flex items-center justify-center mb-6 shadow-lg`}>
                    <b.icon className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-xl font-black text-zinc-900 tracking-tight mb-3">{b.title}</h3>
                  <p className="text-zinc-600 leading-relaxed text-sm">{b.description}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* Vagas */}
      <section className="py-24 md:py-32 bg-creme-profundo relative overflow-hidden">
        <div className="absolute inset-0 bg-grid pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 relative">
          <Reveal className="text-center mb-16">
            <span className="inline-block px-3 py-1.5 rounded-full bg-white border border-zinc-200 text-zinc-700 text-xs font-bold uppercase tracking-widest mb-6 shadow-sm">
              Vagas abertas
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-zinc-900 tracking-tighter">
              Oportunidades disponíveis
            </h2>
          </Reveal>

          <div data-estado-da-lista={situacao} aria-busy={situacao === LISTA_CARREGANDO}>
            {situacao === LISTA_CARREGANDO && (
              <div data-papel="esqueleto">
                <p role="status" className="sr-only">
                  {TEXTO_DE_CARREGANDO_A_LISTA}
                </p>
                <div aria-hidden="true" className="space-y-4">
                  {[0, 1].map((i) => (
                    <div key={i} className="bg-white rounded-3xl border border-zinc-100 p-6 md:p-8">
                      <div className="flex gap-2 mb-5">
                        <div className="h-6 w-24 rounded-full bg-zinc-100 animate-pulse" />
                        <div className="h-6 w-16 rounded-full bg-zinc-100 animate-pulse" />
                      </div>
                      <div className="h-7 w-3/5 rounded-lg bg-zinc-100 animate-pulse" />
                      <div className="mt-3 h-4 w-2/5 rounded bg-zinc-100 animate-pulse" />
                      <div className="mt-5 h-4 w-full rounded bg-zinc-100 animate-pulse" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {situacao === LISTA_ERRO && (
              <div
                data-papel="erro"
                className="text-center py-16 px-6 bg-white rounded-3xl border border-zinc-100"
              >
                <AlertCircle aria-hidden="true" className="mx-auto h-10 w-10 text-red-500 mb-4" />
                {/* O anúncio é só a MENSAGEM, e não o bloco com o botão. */}
                <p role="alert" data-papel="mensagem-de-erro" className="max-w-md mx-auto mb-8">
                  <strong className="block text-2xl font-black text-zinc-900 tracking-tight mb-3">
                    {falaDaLista(LISTA_ERRO).oQueHouve}
                  </strong>
                  <span className="block text-zinc-500 text-base leading-relaxed">
                    {falaDaLista(LISTA_ERRO).oQueFazer}
                  </span>
                </p>
                <button
                  type="button"
                  data-acao="repetir"
                  onClick={tentarDeNovo}
                  className="inline-flex items-center gap-2 px-7 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-full shadow-lg shadow-emerald-500/30 transition-all duration-200 text-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                >
                  {ROTULO_DE_RECARREGAR_A_LISTA}
                </button>
              </div>
            )}

            {situacao === LISTA_VAZIA && <SemVagasAbertas />}

            {situacao === LISTA_PRONTA && (
              <StaggerGroup className="space-y-4">
                {vagas.map((vaga) => (
                  <StaggerItem key={vaga.id ?? vaga.slug}>
                    <CartaoDeVaga vaga={vaga} />
                  </StaggerItem>
                ))}
              </StaggerGroup>
            )}
          </div>
        </div>
      </section>

      {/* CTA aurora */}
      <section className="relative overflow-hidden aurora-bg aurora-beams py-28">
        <div className="absolute inset-0 bg-grid-white opacity-30 pointer-events-none" />
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="relative z-10 max-w-3xl mx-auto px-4 text-center"
        >
          <h2 className="text-4xl md:text-6xl font-black text-white tracking-tighter mb-6">
            Não encontrou
            <br />
            <span className="text-yellow-300">
              a vaga ideal?
            </span>
          </h2>
          <p className="text-white/80 text-lg mb-10">
            Envie seu currículo e entraremos em contato quando surgir uma oportunidade que
            combine com seu perfil.
          </p>
          <a
            href={ENDERECO_DO_CURRICULO}
            data-acao="curriculo-final"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-10 py-5 bg-white text-emerald-700 font-bold text-lg rounded-full shadow-[0_0_50px_rgba(255,255,255,0.25)] hover:shadow-[0_0_80px_rgba(255,255,255,0.5)] hover:scale-[1.03] transition-all duration-300"
          >
            Enviar Currículo
            <ArrowRight className="h-5 w-5" />
          </a>
        </motion.div>
      </section>

      <Footer />
    </div>
  );
}
