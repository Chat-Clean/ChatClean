import { useEffect } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Code2,
  MessagesSquare,
  MoveRight,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Reveal from "@/components/animated/Reveal";
import ParedeDeMarcas from "@/components/integracoes/ParedeDeMarcas";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { LINK_DO_WHATSAPP } from "@/domain/whatsapp";
import {
  CATEGORIAS,
  COMO_CONECTA,
  FORMAS_DE_INTEGRAR,
  METADADOS_DA_PAGINA,
  NA_PRATICA,
  PASSOS,
  PERGUNTAS,
} from "./integracoesPublico";

const ICONES_DAS_FORMAS = { ArrowDownToLine, ArrowUpFromLine, MessagesSquare, Code2 };

/** A cor de cada selo de "como conecta", pelos tokens de destaque do site. */
const COR_DO_SELO = {
  [COMO_CONECTA.NATIVA]: "bg-destaque-verde text-emerald-900",
  [COMO_CONECTA.WEBHOOK]: "bg-destaque-azul text-sky-900",
  [COMO_CONECTA.INTEGRADOR]: "bg-destaque-amarelo text-amber-900",
};

const DOMINIO = "https://chatclean.com.br";

/**
 * `/integracoes`: como a ChatClean conversa com as ferramentas que a empresa
 * já usa. Abre com a mesma parede de marcas da home, explica as quatro
 * formas de integrar, mostra o catálogo por categoria com o selo honesto de
 * cada ferramenta, casos reais, o caminho da implantação e as dúvidas.
 *
 * Título, descrição e canônica são aplicados ao montar e devolvidos ao sair,
 * como na página da API Oficial.
 */
export default function Integracoes() {
  useEffect(() => {
    const tituloAnterior = document.title;
    document.title = METADADOS_DA_PAGINA.titulo;

    const garantir = (seletor, criar) => {
      let elemento = document.head.querySelector(seletor);
      const criado = !elemento;
      if (criado) {
        elemento = criar();
        document.head.appendChild(elemento);
      }
      return { elemento, criado };
    };
    const descricao = garantir('meta[name="description"]', () => {
      const m = document.createElement("meta");
      m.setAttribute("name", "description");
      return m;
    });
    const descricaoAnterior = descricao.elemento.getAttribute("content");
    descricao.elemento.setAttribute("content", METADADOS_DA_PAGINA.descricao);

    const canonica = garantir('link[rel="canonical"]', () => {
      const l = document.createElement("link");
      l.setAttribute("rel", "canonical");
      return l;
    });
    const canonicaAnterior = canonica.elemento.getAttribute("href");
    canonica.elemento.setAttribute("href", `${DOMINIO}${METADADOS_DA_PAGINA.caminho}`);

    return () => {
      document.title = tituloAnterior;
      if (descricao.criado) descricao.elemento.remove();
      else if (descricaoAnterior !== null) descricao.elemento.setAttribute("content", descricaoAnterior);
      if (canonica.criado) canonica.elemento.remove();
      else if (canonicaAnterior !== null) canonica.elemento.setAttribute("href", canonicaAnterior);
    };
  }, []);

  return (
    <div className="min-h-screen bg-creme text-zinc-900">
      <Navbar />

      {/* Topo: a promessa e a mesma parede de marcas da home */}
      <section
        aria-labelledby="integracoes-pagina-titulo"
        className="integracoes-fundo relative overflow-hidden px-4 pb-20 pt-32 md:pb-24 md:pt-40"
      >
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
          <Reveal className="max-w-xl">
            <span className="mb-6 inline-block rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white backdrop-blur-md">
              Integrações
            </span>
            <h1
              id="integracoes-pagina-titulo"
              className="text-4xl font-black leading-[1.05] tracking-tighter text-balance text-white md:text-5xl xl:text-6xl"
            >
              Conecte a ChatClean às ferramentas que{" "}
              <span className="brilho-latao">sua empresa já usa</span>
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-white/75">
              CRM, loja virtual, meio de pagamento, agenda e IA conversando com o seu WhatsApp. Pelo webhook, pela
              API ou por integradores como n8n, Make e Zapier: se a ferramenta tem API, ela conversa com a
              ChatClean.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
              <a
                href="#catalogo"
                className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 font-bold text-emerald-700 shadow-xl transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-900"
              >
                Ver as ferramentas
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </a>
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

      {/* As quatro formas de integrar */}
      <section aria-labelledby="formas-titulo" className="bg-creme px-4 py-20 md:py-28">
        <div className="mx-auto max-w-7xl">
          <Reveal className="mx-auto mb-12 max-w-3xl text-center md:mb-16">
            <h2
              id="formas-titulo"
              className="text-4xl font-black leading-[1.05] tracking-tighter text-balance text-zinc-900 md:text-5xl"
            >
              Quatro jeitos de <span className="text-brand-chrome">conectar</span>
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-zinc-600">
              Toda integração da ChatClean passa por um destes caminhos. Eles se combinam: um evento chega, a
              conversa acontece e os dados voltam para o seu sistema.
            </p>
          </Reveal>

          <ul className="grid gap-4 md:grid-cols-2 md:gap-5">
            {FORMAS_DE_INTEGRAR.map((forma, indice) => {
              const Icone = ICONES_DAS_FORMAS[forma.icone];
              return (
                <Reveal as="li" key={forma.nome} delay={indice * 0.05} className="h-full">
                  <article className="h-full rounded-3xl border border-creme-borda bg-white p-6 transition-colors duration-300 hover:border-emerald-200 md:p-8">
                    <div className="mb-5 flex items-center gap-3">
                      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-wash text-brand-chrome">
                        <Icone aria-hidden="true" className="h-5 w-5" />
                      </span>
                      <span className="font-secundaria text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                        {forma.recurso}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold tracking-tight text-zinc-900 md:text-2xl">{forma.nome}</h3>
                    <p className="mt-3 leading-relaxed text-zinc-600">{forma.texto}</p>
                  </article>
                </Reveal>
              );
            })}
          </ul>
        </div>
      </section>

      {/* O catálogo */}
      <section id="catalogo" aria-labelledby="catalogo-titulo" className="scroll-mt-20 bg-creme-profundo px-4 py-20 md:py-28">
        <div className="mx-auto max-w-7xl">
          <Reveal className="mb-10 max-w-3xl md:mb-14">
            <h2
              id="catalogo-titulo"
              className="text-4xl font-black leading-[1.05] tracking-tighter text-balance text-zinc-900 md:text-5xl"
            >
              Com o que a ChatClean <span className="text-brand-chrome">conversa</span>
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-zinc-600">
              Algumas das ferramentas que nossos clientes conectam. O selo diz o caminho de cada uma.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2" aria-label="O que cada selo quer dizer">
              {[
                [COMO_CONECTA.NATIVA, "conector pronto na plataforma"],
                [COMO_CONECTA.WEBHOOK, "eventos pelo Push e pelo webhook"],
                [COMO_CONECTA.INTEGRADOR, "n8n, Make ou Zapier no meio"],
              ].map(([selo, explicacao]) => (
                <li key={selo} className="flex items-center gap-2 text-sm text-zinc-600">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${COR_DO_SELO[selo]}`}>{selo}</span>
                  {explicacao}
                </li>
              ))}
            </ul>
          </Reveal>

          <div className="space-y-14">
            {CATEGORIAS.map((categoria) => (
              <Reveal key={categoria.nome}>
                <div className="mb-5 flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between md:gap-6">
                  <h3 className="text-2xl font-bold tracking-tight text-zinc-900">{categoria.nome}</h3>
                  <p className="text-zinc-600 md:text-right">{categoria.resumo}</p>
                </div>
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {categoria.ferramentas.map((ferramenta) => (
                    <li
                      key={ferramenta.nome}
                      className="flex gap-4 rounded-3xl border border-creme-borda bg-white p-5 transition-colors duration-300 hover:border-emerald-200"
                    >
                      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-surface-sunk">
                        <img
                          src={ferramenta.imagem}
                          alt=""
                          width="32"
                          height="32"
                          loading="lazy"
                          decoding="async"
                          className="h-8 w-8 object-contain"
                        />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-zinc-900">{ferramenta.nome}</h4>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${COR_DO_SELO[ferramenta.como]}`}>
                            {ferramenta.como}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{ferramenta.faz}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Na prática */}
      <section aria-labelledby="pratica-titulo" className="bg-creme px-4 py-20 md:py-28">
        <div className="mx-auto max-w-7xl">
          <Reveal className="mx-auto mb-12 max-w-3xl text-center md:mb-16">
            <h2
              id="pratica-titulo"
              className="text-4xl font-black leading-[1.05] tracking-tighter text-balance text-zinc-900 md:text-5xl"
            >
              Na prática, <span className="text-brand-chrome">um evento vira conversa</span>
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-zinc-600">
              Integrações que já rodam em clientes da ChatClean.
            </p>
          </Reveal>
          <ul className="grid gap-4 md:grid-cols-2 md:gap-5">
            {NA_PRATICA.map((caso, indice) => (
              <Reveal as="li" key={caso.gatilho} delay={indice * 0.05} className="h-full">
                <article className="h-full rounded-3xl border border-creme-borda bg-white p-6 md:p-8">
                  <p className="font-secundaria text-xs font-semibold uppercase tracking-[0.16em] text-brand-action">
                    {caso.setor}
                  </p>
                  <p className="mt-4 flex items-start gap-3 text-lg font-bold text-zinc-900">
                    {caso.gatilho}
                    <MoveRight aria-hidden="true" className="mt-1.5 h-5 w-5 shrink-0 text-brand-vivid" />
                  </p>
                  <p className="mt-2 leading-relaxed text-zinc-600">{caso.resultado}</p>
                </article>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* Como colocamos para rodar: é uma sequência de verdade, então é numerada */}
      <section aria-labelledby="passos-titulo" className="bg-creme-profundo px-4 py-20 md:py-28">
        <div className="mx-auto max-w-7xl">
          <Reveal className="mb-12 max-w-3xl md:mb-16">
            <h2
              id="passos-titulo"
              className="text-4xl font-black leading-[1.05] tracking-tighter text-balance text-zinc-900 md:text-5xl"
            >
              Da conversa à integração <span className="text-brand-chrome">rodando</span>
            </h2>
          </Reveal>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            {PASSOS.map((passo, indice) => (
              <Reveal as="li" key={passo.titulo} delay={indice * 0.05} className="h-full">
                <div className="h-full rounded-3xl border border-creme-borda bg-white p-6">
                  <span
                    aria-hidden="true"
                    className="grid h-10 w-10 place-items-center rounded-full bg-brand-chrome font-bold text-white"
                  >
                    {indice + 1}
                  </span>
                  <h3 className="mt-5 text-lg font-bold text-zinc-900">{passo.titulo}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600">{passo.texto}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Dúvidas */}
      <section aria-labelledby="duvidas-titulo" className="bg-creme px-4 py-20 md:py-28">
        <div className="mx-auto max-w-3xl">
          <Reveal className="mb-10 text-center">
            <h2
              id="duvidas-titulo"
              className="text-4xl font-black leading-[1.05] tracking-tighter text-zinc-900 md:text-5xl"
            >
              Dúvidas sobre integração
            </h2>
          </Reveal>
          <Accordion type="single" collapsible className="space-y-3">
            {PERGUNTAS.map((pergunta, indice) => (
              <AccordionItem
                key={pergunta.q}
                value={`pergunta-${indice}`}
                className="overflow-hidden rounded-2xl border border-creme-borda bg-white px-2 transition-colors data-[state=open]:border-emerald-200"
              >
                <AccordionTrigger className="px-5 py-4 text-left font-semibold text-zinc-900 hover:no-underline">
                  {pergunta.q}
                </AccordionTrigger>
                <AccordionContent className="px-5 pb-4 leading-relaxed text-zinc-600">{pergunta.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* A ferramenta que não está na lista */}
      <section className="relative overflow-hidden aurora-bg aurora-beams px-4 py-24 md:py-28">
        <div className="absolute inset-0 bg-grid-white opacity-30 pointer-events-none" />
        <Reveal className="relative mx-auto max-w-3xl text-center">
          <h2 className="text-4xl font-black leading-[1.05] tracking-tighter text-balance text-white md:text-5xl">
            Sua ferramenta não está aqui?
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-white/80">
            Se ela tem API ou webhook, ela conversa com a ChatClean. Conte o que você usa e mostramos como fica
            a integração no seu caso.
          </p>
          <a
            href={LINK_DO_WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-10 inline-flex items-center gap-2 rounded-full bg-white px-10 py-5 text-lg font-bold text-emerald-700 shadow-[0_0_50px_rgba(255,255,255,0.25)] transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_0_80px_rgba(255,255,255,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-900"
          >
            Fale com um especialista
            <ArrowRight aria-hidden="true" className="h-5 w-5" />
          </a>
        </Reveal>
      </section>

      <Footer />
    </div>
  );
}
