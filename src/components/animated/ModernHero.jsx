import { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Play, Check, Bot } from "lucide-react";

// A foto da hero: a atendente ao notebook nítida, o resto desfocado. É o
// fundo inteiro da seção. Gerada fora do build por scripts/recortar-foto-hero.mjs.
import fotoAtendimento from "../../assets/hero-atendimento.webp";
import fotoAtendimento720 from "../../assets/hero-atendimento-720.webp";

/**
 * A demonstração em vídeo.
 *
 * O botão principal da home apontava para o WhatsApp, o que pedia uma conversa
 * de quem só queria VER o produto antes de falar com alguém. O vídeo responde
 * essa pergunta sem custo de atendimento, e quem quiser conversar depois tem o
 * WhatsApp em toda outra seção da página.
 */
const VSL_LINK = "https://links.chatclean.com.br/vsl";

/**
 * Botão magnético — segue o cursor com força configurável.
 * Estilo Linear / Awwwards.
 */
const MagneticButton = ({ children, href, onClick, variant = "primary" }) => {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const handleMouse = (e) => {
    if (!ref.current) return;
    const { clientX, clientY } = e;
    const { height, width, left, top } = ref.current.getBoundingClientRect();
    const middleX = clientX - (left + width / 2);
    const middleY = clientY - (top + height / 2);
    setPos({ x: middleX * 0.18, y: middleY * 0.18 });
  };
  const reset = () => setPos({ x: 0, y: 0 });

  const baseClasses =
    "relative inline-flex items-center justify-center gap-2 px-8 md:px-10 py-4 md:py-5 font-bold text-base md:text-lg rounded-full overflow-hidden group transition-shadow duration-300";

  const styles =
    variant === "primary"
      ? "bg-white text-emerald-800 shadow-[0_0_40px_rgba(255,255,255,0.25)] hover:shadow-[0_0_60px_rgba(255,255,255,0.5)]"
      : "bg-white/10 text-white border border-white/30 hover:border-white/60 backdrop-blur-md";

  const Component = href ? motion.a : motion.button;
  const extraProps = href
    ? { href, target: "_blank", rel: "noopener noreferrer" }
    : { onClick, type: "button" };

  return (
    <Component
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={reset}
      animate={{ x: pos.x, y: pos.y }}
      transition={{ type: "spring", stiffness: 150, damping: 15, mass: 0.1 }}
      className={`${baseClasses} ${styles}`}
      {...extraProps}
    >
      <span className="relative z-10 flex items-center gap-2">{children}</span>
      {variant === "primary" && (
        <div className="absolute inset-0 bg-emerald-50 transform scale-y-0 origin-bottom group-hover:scale-y-100 transition-transform duration-500 ease-[cubic-bezier(0.19,1,0.22,1)] z-0" />
      )}
    </Component>
  );
};

/**
 * Cartão flutuante sobre a foto. Os dois juntos contam uma conversa: a
 * mensagem chega e o robô responde, enquanto a atendente segue com a
 * atenção livre.
 *
 * A entrada (framer-motion) fica no elemento de fora e a flutuação contínua
 * (CSS, `.hero-flutua`) no de dentro: os dois escrevem `transform`, e num
 * elemento só um apagaria o outro.
 */
const Cartao = ({ delay = 0, className = "", flutua = "hero-flutua", children }) => (
  <motion.div
    initial={{ opacity: 0, y: 24, scale: 0.9 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ delay, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    className={`absolute z-20 ${className}`}
  >
    <div className={flutua}>{children}</div>
  </motion.div>
);

/**
 * Os dois balões da cena. No desktop ficam na coluna da direita, sobre a
 * foto de fundo; no celular (`compacto`) ficam menores, sobre a foto que
 * ocupa o topo da seção — a mesma conversa, no mesmo lugar da cena.
 */
const Baloes = ({ compacto = false }) => (
  <>
      {/* Mensagem que acaba de chegar: balão de WhatsApp, com rabicho */}
      <Cartao
        delay={1.1}
        className={
          compacto
            ? "left-3 top-[21%] w-[14rem] origin-top-left scale-[0.62]"
            : "left-[16%] lg:left-[12%] top-[7%] w-[16.5rem]"
        }
      >
        <div className="relative rounded-2xl rounded-tl-md bg-white/95 backdrop-blur-md px-4 py-3.5 text-left shadow-[0_24px_48px_-12px_rgba(20,35,27,0.55)] ring-1 ring-emerald-950/10">
          <span
            aria-hidden="true"
            className="absolute -left-1.5 top-3.5 h-3 w-3 rotate-45 rounded-[2px] bg-white/95"
          />
          <div className="mb-2 flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 font-secundaria text-[11px] font-bold text-white">
              RM
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-secundaria text-[13px] font-semibold leading-tight text-zinc-900">
                Rafaela Moraes
              </p>
              <p className="font-secundaria text-[11px] leading-tight text-zinc-500">
                WhatsApp · agora
              </p>
            </div>
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
          </div>
          <p className="text-[13.5px] leading-snug text-zinc-800">
            Oi! Vocês entregam ainda hoje?
          </p>
        </div>
      </Cartao>

      {/* A resposta do robô: cartão escuro, na cor da marca */}
      <Cartao
        delay={1.35}
        flutua="hero-flutua-2"
        className={
          compacto
            ? "right-3 top-[50%] origin-top-right scale-[0.68]"
            : "right-[-4%] lg:right-[-8%] bottom-[26%]"
        }
      >
        <div className="flex items-center gap-3 rounded-2xl bg-emerald-950/90 px-4 py-3 text-left text-white backdrop-blur-md shadow-[0_24px_48px_-12px_rgba(20,35,27,0.7)] ring-1 ring-white/10">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-400/30">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <p className="font-secundaria text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
              Robô respondeu
            </p>
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <span className="inline-flex text-sky-200" aria-hidden="true">
                <Check className="h-3.5 w-3.5" />
                <Check className="-ml-2 h-3.5 w-3.5" />
              </span>
              em 4 segundos
            </p>
          </div>
        </div>
      </Cartao>
  </>
);

/**
 * Hero sobre a foto da atendente: ela, o notebook e a mesa nítidos à
 * direita, e o fundo da própria foto desfocado ocupando a seção inteira.
 * Sem fundo animado por enquanto. Magnetic CTAs, kinetic typography e
 * parallax suave do texto continuam.
 *
 * H1 carrega palavras-chave SEO: "CRM e ChatBot para WhatsApp".
 */
export default function ModernHero() {
  // Sem parallax nem fade ao rolar: o conteúdo da hero fica onde está e
  // legível até sair da tela.
  // Headline com palavras animando
  const titleVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.25 },
    },
  };
  const wordVariants = {
    hidden: { y: 60, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: "spring", damping: 22, stiffness: 110 },
    },
  };

  // Texto rotativo no badge
  const [tagIdx, setTagIdx] = useState(0);
  const tags = ["WhatsApp Business", "Instagram", "Facebook", "Telegram"];
  useEffect(() => {
    const t = setInterval(() => setTagIdx((i) => (i + 1) % tags.length), 2400);
    return () => clearInterval(t);
  }, []);

  return (
    <section
      id="home"
      data-hero-escura=""
      className="relative min-h-screen flex flex-col items-center justify-end lg:justify-center overflow-hidden pt-[44svh] pb-10 lg:pt-32 lg:pb-20 bg-emerald-950"
    >
      {/* A foto ocupa a seção inteira no desktop, ancorada à direita: a
          proporção do arquivo foi calculada para a atendente cair na coluna
          da direita em 1440x900 e crescer com a altura da tela. */}
      <img
        src={fotoAtendimento}
        alt=""
        aria-hidden="true"
        draggable="false"
        className="hidden lg:block absolute inset-0 w-full h-full object-cover object-right select-none pointer-events-none"
      />
      {/* Véu só para o texto ler bem sobre o desfoque */}
      <div
        aria-hidden="true"
        className="hidden lg:block absolute inset-0 bg-gradient-to-r from-emerald-950/70 via-emerald-950/25 to-transparent pointer-events-none"
      />

      {/* No celular a foto é o TOPO da seção: a atendente e o notebook
          enquadrados pela direita, e o texto entra por cima de um degradê
          que começa na altura das mãos. Os balões seguem a cena, menores. */}
      <div
        className="lg:hidden absolute inset-x-0 top-0 h-[60svh] pointer-events-none"
        aria-hidden="true"
      >
        <img
          src={fotoAtendimento720}
          srcSet={`${fotoAtendimento720} 1400w, ${fotoAtendimento} 2800w`}
          sizes="100vw"
          alt=""
          draggable="false"
          className="absolute inset-0 w-full h-full object-cover object-[100%_50%] select-none"
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(20,35,27,0.45)_0%,rgba(20,35,27,0)_20%,rgba(20,35,27,0)_50%,#14231b_100%)]" />
        <div className="absolute inset-0">
          <Baloes compacto />
        </div>
      </div>

      <div className="relative z-10 w-full mx-auto px-4 sm:px-20 grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
        {/* Coluna texto */}
        <div className="text-left">
          {/* Badge live com pill rotativo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 border border-white/30 backdrop-blur-md text-white text-sm font-medium mb-8"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-300 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-300" />
            </span>
            Conectado ao{" "}
            <motion.span
              key={tagIdx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="font-bold"
            >
              {tags[tagIdx]}
            </motion.span>
          </motion.div>

          {/* H1 com kinetic typography */}
          <motion.h1
            variants={titleVariants}
            initial="hidden"
            animate="visible"
            className="text-[2.75rem] md:text-6xl lg:text-7xl font-extrabold text-white tracking-tighter leading-[0.95] mb-5 lg:mb-6"
          >
            {/* Só a segunda linha tem descendente ("p"), então só ela leva
                o respiro embaixo contra o corte do overflow-hidden */}
            <span className="block overflow-hidden">
              <motion.span variants={wordVariants} className="inline-block">
                CRM e ChatBot
              </motion.span>
            </span>
            <span className="block overflow-hidden pb-2">
              <motion.span variants={wordVariants} className="inline-block">
                para
              </motion.span>{" "}
              <motion.span
                variants={wordVariants}
                className="inline-block text-yellow-300"
              >
                WhatsApp
              </motion.span>
            </span>
          </motion.h1>

          {/* Subtítulo com keyword */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="text-base md:text-xl text-white/90 mb-7 lg:mb-10 leading-relaxed max-w-xl"
          >
            Reúna WhatsApp, Instagram, Facebook e Telegram em{" "}
            <span className="text-white font-semibold underline decoration-yellow-200/60 decoration-2 underline-offset-4">
              um único lugar
            </span>
            . Atenda mais clientes ao mesmo tempo, sem perder nenhuma mensagem e sem complicação.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85, duration: 0.6 }}
            className="flex flex-col sm:flex-row gap-4"
          >
            <MagneticButton href={VSL_LINK} variant="primary">
              <Play className="w-5 h-5 fill-current" />
              Ver Demo
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </MagneticButton>

            <MagneticButton
              onClick={() => {
                const el = document.getElementById("funcionalidades");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
              variant="secondary"
            >
              Como Funciona?
            </MagneticButton>
          </motion.div>
        </div>

        {/* Coluna da cena (só desktop): posiciona os balões sobre a foto de
            fundo, na mesma caixa em que a atendente cai */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="hidden lg:flex justify-end"
        >
          <div className="relative w-full lg:max-w-[36rem] xl:max-w-[40rem] aspect-[1369/1420]">
            <Baloes />
          </div>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6, duration: 0.6 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden lg:flex flex-col items-center gap-2 text-white/70"
      >
        <span className="text-xs uppercase tracking-widest">Role para descobrir</span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          className="w-6 h-10 border-2 border-white/40 rounded-full flex justify-center pt-2"
        >
          <div className="w-1 h-2 bg-white/70 rounded-full" />
        </motion.div>
      </motion.div>
    </section>
  );
}
