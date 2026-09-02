import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import Reveal from "@/components/animated/Reveal";
import { StaggerGroup, StaggerItem } from "@/components/animated/StaggerGroup";
import { EASE } from "@/lib/motion";
import {
  PLANOS,
  PLANO_SOB_MEDIDA,
  TAMANHOS_DE_EQUIPE,
  atendentesCobrados,
  formatarMoeda,
  formatarNumero,
  totalMensal,
} from "@/lib/planos";

/**
 * Seção de Planos da home.
 *
 * MOCKUP: não existe checkout. Os botões são `type="button"` sem ação — só
 * ocupam o lugar da chamada final. Os preços vêm de `@/lib/planos` e estão
 * marcados lá como valores de demonstração.
 */

/** Seletor de tamanho de equipe — é ele que recalcula o total dos cartões. */
const SeletorDeEquipe = ({ atendentes, aoEscolher }) => (
  <div className="inline-flex flex-col items-center gap-3 rounded-3xl bg-white border border-zinc-200 px-6 py-5 shadow-sm">
    <span
      id="rotulo-tamanho-equipe"
      className="text-xs font-bold uppercase tracking-widest text-zinc-500"
    >
      Quantos atendentes vão usar?
    </span>
    <div
      role="group"
      aria-labelledby="rotulo-tamanho-equipe"
      className="flex flex-wrap justify-center gap-2"
    >
      {TAMANHOS_DE_EQUIPE.map((quantidade) => {
        const ativo = quantidade === atendentes;
        return (
          <button
            key={quantidade}
            type="button"
            onClick={() => aoEscolher(quantidade)}
            aria-pressed={ativo}
            className={`min-w-14 rounded-full px-4 py-2 text-sm font-bold transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
              ativo
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/25"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900"
            }`}
          >
            {quantidade === 20 ? "20+" : quantidade}
          </button>
        );
      })}
    </div>
  </div>
);

const CartaoDePlano = ({ plano, atendentes }) => {
  const reduzirMovimento = useReducedMotion();
  const destaque = plano.destaque;
  const cobrados = atendentesCobrados(plano, atendentes);
  const total = totalMensal(plano, atendentes);
  const abaixoDoMinimo = cobrados > atendentes;

  return (
    <div
      className={`relative flex h-full flex-col rounded-3xl p-8 transition-all duration-500 ${
        destaque
          ? "bg-gradient-to-b from-emerald-900 to-emerald-950 border border-emerald-700/60 shadow-2xl shadow-emerald-900/25 md:-mt-6 md:pt-12"
          : "bg-white border border-zinc-200 hover:border-emerald-200 hover:-translate-y-1 hover:shadow-2xl hover:shadow-emerald-500/10"
      }`}
    >
      {destaque && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-1.5 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-600/30">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Mais escolhido
        </span>
      )}

      <h3
        className={`text-3xl font-black tracking-tighter ${
          destaque ? "text-white" : "text-zinc-900"
        }`}
      >
        {plano.nome}
      </h3>
      <span
        className={`mt-1 text-xs font-bold uppercase tracking-widest ${
          destaque ? "text-emerald-300" : "text-emerald-600"
        }`}
      >
        {plano.estagio}
      </span>
      <p
        className={`mt-4 text-sm leading-relaxed ${
          destaque ? "text-white/75" : "text-zinc-600"
        }`}
      >
        {plano.resumo}
      </p>

      {/* Preço por atendente */}
      <div className="mt-8 flex items-end gap-2">
        <span
          className={`pb-2 text-lg font-bold ${
            destaque ? "text-white/60" : "text-zinc-400"
          }`}
        >
          R$
        </span>
        <span
          className={`text-5xl font-black tracking-tighter tabular-nums ${
            destaque ? "text-white" : "text-zinc-900"
          }`}
        >
          {formatarNumero(plano.precoPorAtendente)}
        </span>
        <span
          className={`pb-2 text-xs font-medium leading-tight ${
            destaque ? "text-white/60" : "text-zinc-500"
          }`}
        >
          por atendente
          <br />
          por mês
        </span>
      </div>

      {/* Total da equipe escolhida — muda com o seletor */}
      <div
        className={`mt-5 rounded-2xl px-4 py-3 ${
          destaque ? "bg-white/10" : "bg-zinc-50 border border-zinc-100"
        }`}
        aria-live="polite"
      >
        <motion.p
          key={total}
          initial={reduzirMovimento ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE.out }}
          className={`text-sm font-bold tabular-nums ${
            destaque ? "text-white" : "text-zinc-900"
          }`}
        >
          {cobrados} atendentes: {formatarMoeda(total)}
          <span
            className={`font-medium ${
              destaque ? "text-white/60" : "text-zinc-500"
            }`}
          >
            {" "}
            por mês
          </span>
        </motion.p>
        <p
          className={`mt-0.5 text-[11px] ${
            destaque ? "text-white/50" : "text-zinc-500"
          }`}
        >
          {abaixoDoMinimo
            ? `Contratação mínima de ${plano.minimoAtendentes} atendentes`
            : "Sem fidelidade e sem multa para cancelar"}
        </p>
      </div>

      {/* MOCKUP: botão sem ação, o checkout ainda não existe. */}
      <button
        type="button"
        className={`mt-6 w-full rounded-full px-6 py-3.5 text-sm font-bold transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 ${
          destaque
            ? "bg-white text-emerald-900 hover:bg-emerald-50 focus-visible:outline-white"
            : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 focus-visible:outline-emerald-600"
        }`}
      >
        {plano.rotuloAcao}
      </button>

      <div className={`my-7 h-px ${destaque ? "bg-white/15" : "bg-zinc-100"}`} />

      <p
        className={`mb-4 text-xs font-bold uppercase tracking-widest ${
          destaque ? "text-white/50" : "text-zinc-400"
        }`}
      >
        {plano.tituloRecursos}
      </p>
      <ul className="flex flex-col gap-3">
        {plano.recursos.map((recurso) => (
          <li key={recurso} className="flex items-start gap-3">
            <Check
              aria-hidden="true"
              className={`mt-0.5 h-4 w-4 shrink-0 ${
                destaque ? "text-emerald-300" : "text-emerald-600"
              }`}
            />
            <span
              className={`text-sm leading-snug ${
                destaque ? "text-white/85" : "text-zinc-700"
              }`}
            >
              {recurso}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default function Planos() {
  const [atendentes, setAtendentes] = useState(3);

  return (
    <section
      id="planos"
      className="relative overflow-hidden bg-zinc-50 py-24 md:py-32 px-4"
    >
      <div className="absolute inset-0 bg-grid pointer-events-none" />

      <div className="relative mx-auto max-w-7xl">
        <Reveal className="mb-12 text-center">
          <span className="mb-6 inline-block rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-emerald-700">
            Planos
          </span>
          <h2 className="mb-6 text-4xl md:text-6xl font-black tracking-tighter text-zinc-900">
            Você paga por <span className="text-gradient-green">quem atende</span>
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-zinc-600">
            Sem taxa de implantação e sem cobrança por conversa da plataforma.
            Escolha o tamanho da sua equipe e veja quanto fica cada plano.
          </p>
        </Reveal>

        <Reveal className="mb-14 flex justify-center">
          <SeletorDeEquipe atendentes={atendentes} aoEscolher={setAtendentes} />
        </Reveal>

        <StaggerGroup className="grid items-stretch gap-6 md:grid-cols-3 md:pt-6">
          {PLANOS.map((plano) => (
            <StaggerItem key={plano.id} className="h-full">
              <CartaoDePlano plano={plano} atendentes={atendentes} />
            </StaggerItem>
          ))}
        </StaggerGroup>

        {/* Enterprise: sem preço de tabela, por decisão comercial. */}
        <Reveal className="mt-6">
          <div className="flex flex-col gap-6 rounded-3xl border border-zinc-200 bg-white p-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <div className="flex items-center gap-3">
                <h3 className="text-2xl font-black tracking-tighter text-zinc-900">
                  {PLANO_SOB_MEDIDA.nome}
                </h3>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Sob medida
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-zinc-600">
                {PLANO_SOB_MEDIDA.resumo}
              </p>
              <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                {PLANO_SOB_MEDIDA.recursos.map((recurso) => (
                  <li
                    key={recurso}
                    className="flex items-center gap-2 text-sm text-zinc-700"
                  >
                    <Check
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 text-emerald-600"
                    />
                    {recurso}
                  </li>
                ))}
              </ul>
            </div>
            {/* MOCKUP: botão sem ação. */}
            <button
              type="button"
              className="shrink-0 rounded-full border-2 border-zinc-900 px-8 py-3.5 text-sm font-bold text-zinc-900 transition-all duration-300 hover:bg-zinc-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
            >
              {PLANO_SOB_MEDIDA.rotuloAcao}
            </button>
          </div>
        </Reveal>

        <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-relaxed text-zinc-500">
          O WhatsApp cobra à parte por conversa iniciada pela empresa: cerca de
          R$ 0,04 para suporte e R$ 0,35 para marketing. Quando o cliente fala
          primeiro, não há cobrança.
        </p>
      </div>
    </section>
  );
}
