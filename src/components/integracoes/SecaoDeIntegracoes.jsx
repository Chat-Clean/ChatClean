import { Link } from "react-router-dom";
import { ArrowRight, Code2, Users, Workflow } from "lucide-react";
import Reveal from "@/components/animated/Reveal";
import { LINK_DO_WHATSAPP } from "@/domain/whatsapp";
import ParedeDeMarcas from "./ParedeDeMarcas";
import { VANTAGENS_DA_INTEGRACAO } from "./colunas";

const ICONES_DAS_VANTAGENS = { Workflow, Users, Code2 };

/**
 * "Mais de 50 integrações" na home: o texto de um lado e a parede de marcas
 * do outro. O botão principal leva à página `/integracoes`, que detalha como
 * cada ferramenta se conecta; falar com um especialista fica ao lado.
 */
export default function SecaoDeIntegracoes() {
  return (
    <section
      id="integracoes"
      aria-labelledby="integracoes-titulo"
      className="integracoes-fundo relative overflow-hidden px-4 py-20 md:py-24 lg:py-32"
    >
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
        <Reveal className="max-w-xl">
          <span className="mb-6 inline-block rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white backdrop-blur-md">
            Integrações
          </span>
          <h2
            id="integracoes-titulo"
            className="text-4xl font-black leading-[1.05] tracking-tighter text-balance text-white md:text-5xl xl:text-6xl"
          >
            <span className="brilho-latao">Mais de 50 integrações</span> com as ferramentas que você já usa
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-white/75">
            A ChatClean se conecta ao seu CRM, à sua loja, ao seu meio de pagamento e a qualquer ferramenta que
            tenha API.
          </p>

          <ul className="mt-8 space-y-3">
            {VANTAGENS_DA_INTEGRACAO.map(({ texto, icone }) => {
              const Icone = ICONES_DAS_VANTAGENS[icone];
              return (
                <li
                  key={texto}
                  className="flex max-w-sm items-center gap-3 rounded-full border border-white/10 bg-white/10 px-5 py-3 text-sm font-semibold text-white"
                >
                  <Icone aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-300" />
                  {texto}
                </li>
              );
            })}
          </ul>

          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Link
              to="/integracoes"
              className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 font-bold text-emerald-700 shadow-xl transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-900"
            >
              Ver todas as integrações
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <a
              href={LINK_DO_WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-white underline decoration-white/40 underline-offset-4 transition-colors hover:decoration-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Fale com um especialista
            </a>
          </div>
        </Reveal>

        <Reveal delay={0.1} className="integracoes-palco">
          <ParedeDeMarcas />
        </Reveal>
      </div>
    </section>
  );
}
