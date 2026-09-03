import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import SeletorDeQuantidade from "@/components/SeletorDeQuantidade";
import Reveal from "@/components/animated/Reveal";
import { StaggerGroup, StaggerItem } from "@/components/animated/StaggerGroup";
import { EASE } from "@/lib/motion";
import {
  LIMITES,
  PLANOS,
  PLANO_SOB_MEDIDA,
  formatarMoeda,
  formatarNumero,
  impedimentoDoPlano,
  precoMensal,
} from "@/domain/assinatura/planos";

/**
 * A seção de Planos da home.
 *
 * O dimensionamento vem ANTES da escolha do plano — quantos usuários e quantas
 * conexões, em quantidade livre. Os dois números recalculam o preço de cada
 * cartão e viajam para `/assinar` junto com o plano escolhido.
 *
 * Preço e fórmula vêm de `@/domain/assinatura/planos`, o mesmo módulo que o
 * servidor usa para conferir. A tela não sabe calcular preço; ela sabe mostrar.
 */

const CONTADORES = [
  {
    campo: "usuarios",
    rotulo: "Usuários",
    ajuda: "quem entra na plataforma",
    faixa: LIMITES.usuarios,
  },
  {
    campo: "conexoes",
    rotulo: "Conexões",
    ajuda: "WhatsApp, Instagram, Facebook, Telegram, Webchat",
    faixa: LIMITES.conexoes,
  },
];


const CartaoDePlano = ({ plano, dimensao }) => {
  const reduzirMovimento = useReducedMotion();
  const destaque = plano.destaque;
  const impedimento = impedimentoDoPlano(plano, dimensao);
  const preco = precoMensal(plano, dimensao);
  const acimaDoMinimo = preco.usuariosCobrados > dimensao.usuarios;

  return (
    <div
      className={`relative flex h-full flex-col rounded-3xl p-8 transition-all duration-500 ${
        destaque
          ? "border border-emerald-700/60 bg-gradient-to-b from-emerald-900 to-emerald-950 shadow-2xl shadow-emerald-900/25 md:-mt-6 md:pt-12"
          : "border border-zinc-200 bg-white hover:-translate-y-1 hover:border-emerald-200 hover:shadow-2xl hover:shadow-emerald-500/10"
      } ${impedimento ? "opacity-55" : ""}`}
    >
      {destaque && (
        <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-1.5 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-600/30">
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

      {/* O total mensal — é o que a pessoa paga, então é o número grande. */}
      <div className="mt-8 flex items-end gap-2">
        <span
          className={`pb-2 text-lg font-bold ${
            destaque ? "text-white/60" : "text-zinc-400"
          }`}
        >
          R$
        </span>
        <motion.span
          key={preco.centavos}
          initial={reduzirMovimento ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE.out }}
          className={`text-5xl font-black tabular-nums tracking-tighter ${
            destaque ? "text-white" : "text-zinc-900"
          }`}
        >
          {formatarNumero(preco.total)}
        </motion.span>
        <span
          className={`pb-2 text-xs font-medium leading-tight ${
            destaque ? "text-white/60" : "text-zinc-500"
          }`}
        >
          por mês
        </span>
      </div>

      {/* A conta aberta. Discriminar os valores antes da contratação é
          exigência do Decreto 7.962/2013, não capricho de transparência. */}
      <div
        className={`mt-5 rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${
          destaque
            ? "bg-white/10 text-white/80"
            : "border border-zinc-100 bg-zinc-50 text-zinc-600"
        }`}
        aria-live="polite"
      >
        <p className="tabular-nums">
          {preco.usuariosCobrados} × {formatarMoeda(plano.porUsuario)} por usuário
        </p>
        {preco.conexoesExtras > 0 ? (
          <p className="tabular-nums">
            {preco.conexoesExtras} × {formatarMoeda(plano.porConexaoExtra)} por
            conexão extra
          </p>
        ) : (
          <p>
            {plano.conexoesInclusas}{" "}
            {plano.conexoesInclusas === 1 ? "conexão inclusa" : "conexões inclusas"}
          </p>
        )}
        <p className={destaque ? "mt-1 text-white/55" : "mt-1 text-zinc-500"}>
          {acimaDoMinimo
            ? `Contratação mínima de ${plano.minimoDeUsuarios} usuários`
            : "Sem fidelidade e sem multa para cancelar"}
        </p>
      </div>

      {impedimento ? (
        <p
          className={`mt-6 rounded-full px-6 py-3.5 text-center text-sm font-bold ${
            destaque ? "bg-white/10 text-white/70" : "bg-zinc-100 text-zinc-500"
          }`}
        >
          {impedimento}
        </p>
      ) : (
        <Link
          to={`/assinar?plano=${plano.id}&usuarios=${dimensao.usuarios}&conexoes=${dimensao.conexoes}`}
          className={`mt-6 block w-full rounded-full px-6 py-3.5 text-center text-sm font-bold transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 ${
            destaque
              ? "bg-white text-emerald-900 hover:bg-emerald-50 focus-visible:outline-white"
              : "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 focus-visible:outline-emerald-600"
          }`}
        >
          Assinar o {plano.nome}
        </Link>
      )}

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
  const [dimensao, setDimensao] = useState({ usuarios: 3, conexoes: 1 });

  return (
    <section
      id="planos"
      className="relative overflow-hidden bg-zinc-50 px-4 py-24 md:py-32"
    >
      <div className="pointer-events-none absolute inset-0 bg-grid" />

      <div className="relative mx-auto max-w-7xl">
        <Reveal className="mb-12 text-center">
          <span className="mb-6 inline-block rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-emerald-700">
            Planos
          </span>
          <h2 className="mb-6 text-4xl font-black tracking-tighter text-zinc-900 md:text-6xl">
            Você monta o{" "}
            <span className="text-gradient-green">tamanho da sua operação</span>
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-zinc-600">
            Diga quantas pessoas vão atender e quantos canais vai ligar. O preço
            de cada plano aparece na hora, com a conta aberta.
          </p>
        </Reveal>

        <Reveal className="mb-14 flex justify-center">
          <div className="flex flex-wrap items-start justify-center gap-x-10 gap-y-6 rounded-3xl border border-zinc-200 bg-white px-8 py-6 shadow-sm">
            {CONTADORES.map(({ campo, rotulo, ajuda, faixa }) => (
              <SeletorDeQuantidade
                key={campo}
                rotulo={rotulo}
                ajuda={ajuda}
                faixa={faixa}
                valor={dimensao[campo]}
                aoMudar={(valor) =>
                  setDimensao((atual) => ({ ...atual, [campo]: valor }))
                }
              />
            ))}
          </div>
        </Reveal>

        <StaggerGroup className="grid items-stretch gap-6 md:grid-cols-3 md:pt-6">
          {PLANOS.map((plano) => (
            <StaggerItem key={plano.id} className="h-full">
              <CartaoDePlano plano={plano} dimensao={dimensao} />
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
            <a
              href="#contato"
              className="shrink-0 rounded-full border-2 border-zinc-900 px-8 py-3.5 text-center text-sm font-bold text-zinc-900 transition-all duration-300 hover:bg-zinc-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
            >
              Falar com um especialista
            </a>
          </div>
        </Reveal>

        <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-relaxed text-zinc-500">
          Pagamento no Pix ou no boleto, todo mês, no dia que você escolher. O
          WhatsApp cobra à parte por conversa iniciada pela empresa: cerca de R$
          0,04 para suporte e R$ 0,35 para marketing. Quando o cliente fala
          primeiro, não há cobrança.
        </p>
      </div>
    </section>
  );
}
