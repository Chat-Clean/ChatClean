import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Reveal from "@/components/animated/Reveal";
import { StaggerGroup, StaggerItem } from "@/components/animated/StaggerGroup";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { LINK_DO_WHATSAPP } from "@/domain/whatsapp";
import heroIntegracoes from "@/assets/hero-integracoes.webp";
import heroIntegracoes900 from "@/assets/hero-integracoes-900.webp";
import {
  CATEGORIAS,
  COMO_CONECTA,
  FORMAS_DE_INTEGRAR,
  METADADOS_DA_PAGINA,
  PASSOS,
  PERGUNTAS,
} from "./integracoesPublico";
import TrilhaDasFormas from "./TrilhaDasFormas";
import MotionDoFlow from "./MotionDoFlow";
import ListaRecolhivel from "./ListaRecolhivel";

/** A cor de cada selo de "como conecta", pelos tokens de destaque do site. */
const COR_DO_SELO = {
  [COMO_CONECTA.NATIVA]: "bg-destaque-verde text-emerald-900",
  [COMO_CONECTA.WEBHOOK]: "bg-destaque-azul text-sky-900",
  [COMO_CONECTA.FLOW]: "bg-destaque-amarelo text-amber-900",
};

const DOMINIO = "https://chatclean.com.br";

/**
 * `/integracoes`: como a ChatClean conversa com as ferramentas que a empresa
 * já usa. Abre com a foto do notebook conectado; as quatro formas de
 * integrar vêm numa trilha em S que se desenha ao rolar; depois o catálogo
 * por categoria com o selo honesto de cada ferramenta, o Flow montando uma
 * integração num motion do editor, o caminho
 * da implantação e as dúvidas. Quase sem cartões: listas e divisórias, com a
 * mesma entrada animada da home (Reveal e StaggerGroup).
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
    <div className="min-h-screen overflow-x-clip bg-creme text-zinc-900">
      <Navbar />

      {/* Topo: a promessa sobre a foto do notebook conectado. A foto é o
          fundo da seção inteira; o escurecimento da esquerda segura o texto,
          e no celular, onde o texto passa por cima do notebook, ele cobre
          tudo. Do `lg` para cima a altura é 43% da largura (no máximo 85% da altura
          da tela), para a próxima seção aparecer ao abrir a página; o
          enquadramento em 55% tira um pouco mais das plantas em cima que da
          mesa embaixo, para sobrar respiro sob o notebook.
          `fetchPriority` alto: é a primeira imagem que a pessoa vê. */}
      <section
        aria-labelledby="integracoes-pagina-titulo"
        data-hero-escura
        className="integracoes-fundo relative flex min-h-[28rem] items-center overflow-hidden px-4 pb-16 pt-28 md:min-h-[34rem] md:pt-32 lg:h-[43vw] lg:max-h-[85vh] lg:min-h-[30rem]"
      >
        <img
          src={heroIntegracoes}
          srcSet={`${heroIntegracoes900} 900w, ${heroIntegracoes} 1774w`}
          sizes="100vw"
          alt=""
          width="1774"
          height="887"
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-[72%_center] lg:object-[72%_55%]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(90deg,rgb(8_16_12/0.92)_0%,rgb(8_16_12/0.75)_40%,rgb(8_16_12/0.15)_70%,transparent_100%)] max-lg:bg-[rgb(8_16_12/0.72)]"
        />
        {/* Só o selo e o título, alinhados à esquerda e no meio da altura: a
            foto conta o resto. As ferramentas e o contato estão logo abaixo. */}
        <div className="relative mx-auto flex w-full max-w-7xl min-[1600px]:max-w-[88rem] min-[2200px]:max-w-[110rem]">
          <Reveal className="max-w-xl lg:-mt-12">
            <span className="mb-5 inline-block rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white backdrop-blur-md">
              Integrações
            </span>
            <h1
              id="integracoes-pagina-titulo"
              className="max-w-xl text-4xl font-black leading-[1.05] tracking-tighter text-balance text-white md:text-5xl lg:text-[2.75rem] xl:text-[3.5rem]"
            >
              Conecte a ChatClean às ferramentas que{" "}
              <span className="brilho-latao">sua empresa já usa</span>
            </h1>
          </Reveal>
        </div>

      </section>

      {/* As quatro formas de integrar: a trilha em S que se desenha ao rolar */}
      <section aria-labelledby="formas-titulo" className="bg-creme px-4 pt-20 pb-10 md:pt-28">
        <div className="mx-auto max-w-6xl">
          <Reveal className="mx-auto max-w-3xl text-center">
            <h2
              id="formas-titulo"
              className="text-4xl font-black leading-[1.05] tracking-tighter text-balance text-zinc-900 md:text-5xl"
            >
              Quatro jeitos de <span className="text-brand-chrome">conectar</span>
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-zinc-600">
              Toda integração da ChatClean passa por um destes caminhos, e eles se combinam.
            </p>
          </Reveal>
          <div className="mt-10 md:mt-14">
            <TrilhaDasFormas etapas={FORMAS_DE_INTEGRAR} />
          </div>
        </div>
      </section>

      {/* O catálogo: listas, não cartões */}
      <section id="catalogo" aria-labelledby="catalogo-titulo" className="scroll-mt-20 bg-creme-profundo px-4 py-20 md:py-28">
        <div className="mx-auto max-w-6xl">
          <Reveal className="mb-12 max-w-3xl md:mb-16">
            <h2
              id="catalogo-titulo"
              className="text-4xl font-black leading-[1.05] tracking-tighter text-balance text-zinc-900 md:text-5xl"
            >
              Com o que a ChatClean <span className="text-brand-chrome">conversa</span>
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-zinc-600">
              Algumas das ferramentas que nossos clientes conectam. O selo diz o caminho de cada uma.
            </p>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2" aria-label="O que cada selo quer dizer">
              {[
                [COMO_CONECTA.NATIVA, "conector pronto na plataforma"],
                [COMO_CONECTA.WEBHOOK, "eventos pelo Push e pelo webhook"],
                [COMO_CONECTA.FLOW, "pelo Flow, o editor de fluxos da ChatClean"],
              ].map(([selo, explicacao]) => (
                <li key={selo} className="flex items-center gap-2 text-sm text-zinc-600">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${COR_DO_SELO[selo]}`}>{selo}</span>
                  {explicacao}
                </li>
              ))}
            </ul>
          </Reveal>

          {/* A lista inteira é longa: abre recolhida, com o fim desfocado */}
          <ListaRecolhivel
            rotulo="Ver todas as ferramentas"
            corDoFundo="var(--color-creme-profundo)"
            corte={`[data-categoria="Vendas e e-commerce"] [data-nome-da-ferramenta]`}
            folgaDoCorte={-40}
          >
            <div className="divide-y divide-creme-borda border-t border-creme-borda">
              {CATEGORIAS.map((categoria) => (
                <div key={categoria.nome} data-categoria={categoria.nome} className="grid gap-6 py-10 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-12">
                  <Reveal>
                    <h3 className="text-2xl font-bold tracking-tight text-zinc-900">{categoria.nome}</h3>
                    <p className="mt-2 leading-relaxed text-zinc-600">{categoria.resumo}</p>
                  </Reveal>
                  <StaggerGroup role="list" className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
                    {categoria.ferramentas.map((ferramenta) => (
                      <StaggerItem key={ferramenta.nome} role="listitem" className="flex gap-4">
                        <img
                          src={ferramenta.imagem}
                          alt=""
                          width="28"
                          height="28"
                          loading="lazy"
                          decoding="async"
                          className="mt-0.5 h-7 w-7 shrink-0 object-contain"
                        />
                        <div className="min-w-0">
                          <div data-nome-da-ferramenta className="flex flex-wrap items-center gap-2">
                            <h4 className="font-bold text-zinc-900">{ferramenta.nome}</h4>
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${COR_DO_SELO[ferramenta.como]}`}>
                              {ferramenta.como}
                            </span>
                          </div>
                          <p className="mt-1 text-sm leading-relaxed text-zinc-600">{ferramenta.faz}</p>
                        </div>
                      </StaggerItem>
                    ))}
                  </StaggerGroup>
                </div>
              ))}
            </div>
          </ListaRecolhivel>
        </div>
      </section>

      {/* O Flow: o integrador que já vem na ChatClean, montado ao vivo */}
      <section aria-labelledby="flow-titulo" className="bg-creme px-4 py-20 md:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
            <Reveal>
              <p className="font-secundaria text-xs font-semibold uppercase tracking-[0.16em] text-brand-action">
                Flow, o editor de fluxos da ChatClean
              </p>
              <h2
                id="flow-titulo"
                className="mt-4 text-4xl font-black leading-[1.05] tracking-tighter text-balance text-zinc-900 md:text-5xl"
              >
                A integração se monta <span className="text-brand-chrome">arrastando blocos</span>
              </h2>
            </Reveal>
            <Reveal delay={0.05}>
              <p className="text-lg leading-relaxed text-zinc-600">
                O Flow recebe o evento, chama a API da sua ferramenta e responde no WhatsApp. É ele que faz o papel
                de integrador, dentro da própria ChatClean.
              </p>
            </Reveal>
          </div>

          <Reveal delay={0.1} className="mt-12 md:mt-16">
            <MotionDoFlow />
          </Reveal>

        </div>
      </section>

      {/* Como colocamos para rodar: uma sequência de verdade, então numerada e ligada por um traço */}
      <section aria-labelledby="passos-titulo" className="bg-creme-profundo px-4 py-20 md:py-28">
        <div className="mx-auto max-w-6xl">
          <Reveal className="mb-12 max-w-3xl md:mb-16">
            <h2
              id="passos-titulo"
              className="text-4xl font-black leading-[1.05] tracking-tighter text-balance text-zinc-900 md:text-5xl"
            >
              Da conversa à integração <span className="text-brand-chrome">rodando</span>
            </h2>
          </Reveal>
          <div className="relative">
            <span aria-hidden="true" className="absolute left-0 right-0 top-5 hidden h-px bg-creme-borda lg:block" />
            <StaggerGroup role="list" className="relative grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              {PASSOS.map((passo, indice) => (
                <StaggerItem key={passo.titulo} role="listitem">
                  <span
                    aria-hidden="true"
                    className="grid h-10 w-10 place-items-center rounded-full bg-brand-chrome font-bold text-white shadow-[0_0_0_6px_var(--color-creme-profundo)]"
                  >
                    {indice + 1}
                  </span>
                  <h3 className="mt-5 text-lg font-bold text-zinc-900">{passo.titulo}</h3>
                  <p className="mt-2 leading-relaxed text-zinc-600">{passo.texto}</p>
                </StaggerItem>
              ))}
            </StaggerGroup>
          </div>
        </div>
      </section>

      {/* Dúvidas: divisórias em vez de caixas */}
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
          <Reveal>
            <Accordion type="single" collapsible className="divide-y divide-creme-borda border-y border-creme-borda">
              {PERGUNTAS.map((pergunta, indice) => (
                <AccordionItem key={pergunta.q} value={`pergunta-${indice}`} className="border-0">
                  <AccordionTrigger className="py-5 text-left text-lg font-semibold text-zinc-900 hover:no-underline">
                    {pergunta.q}
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 leading-relaxed text-zinc-600">{pergunta.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Reveal>
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
