import { useRef } from "react";
import { ArrowRight, Code2, Users, Workflow } from "lucide-react";
import Reveal from "@/components/animated/Reveal";
import { LINK_DO_WHATSAPP } from "@/domain/whatsapp";
import { COLUNAS_DE_MARCAS, VANTAGENS_DA_INTEGRACAO } from "./colunas";
import { useLupaDasMarcas } from "./useLupaDasMarcas";

const ICONES_DAS_VANTAGENS = { Workflow, Users, Code2 };

/**
 * "Mais de 50 integrações" na home: o texto de um lado e a parede de marcas
 * do outro, em colunas desencontradas.
 *
 * O cursor passa pela parede como uma lupa: as marcas perto dele crescem e
 * as longe voltam ao tamanho (`useLupaDasMarcas`). As marcas não são links:
 * a seção diz com o que a ChatClean conversa, e a conversa em si começa no
 * botão.
 */
export default function SecaoDeIntegracoes() {
  const refDaParede = useRef(null);
  useLupaDasMarcas(refDaParede);
  return (
    <section
      id="integracoes"
      aria-labelledby="integracoes-titulo"
      className="integracoes-fundo relative overflow-hidden px-4 py-24 md:py-32"
    >
      <div className="relative mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-[1fr_1.1fr] lg:gap-10">
        <Reveal className="max-w-xl">
          <span className="mb-6 inline-block rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white backdrop-blur-md">
            Integrações
          </span>
          <h2
            id="integracoes-titulo"
            className="text-4xl font-black leading-[1.05] tracking-tighter text-white md:text-5xl lg:text-6xl"
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

          <a
            href={LINK_DO_WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-10 inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 font-bold text-emerald-700 shadow-xl transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-900"
          >
            Fale com um especialista
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </a>
        </Reveal>

        <Reveal delay={0.1}>
          {/* Leitor de tela: uma lista com o nome de cada ferramenta. A
              arrumação em colunas é só visual. */}
          <div
            ref={refDaParede}
            role="list"
            aria-label="Algumas das ferramentas integradas"
            className="integracoes-parede"
          >
            {COLUNAS_DE_MARCAS.map((coluna, indice) => (
              <div key={indice} className="integracoes-coluna">
                {coluna.map((marca) => (
                  <div key={marca.nome} role="listitem" className="integracao-marca">
                    <svg
                      viewBox="0 0 24 24"
                      role="img"
                      aria-label={marca.nome}
                      className="integracao-desenho"
                      fill={marca.cor}
                    >
                      <path d={marca.caminho} />
                    </svg>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
