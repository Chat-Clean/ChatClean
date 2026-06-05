import { useRef, useState, useEffect } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, Play, Zap, Activity, MessageCircle } from "lucide-react";
import AnimatedCounter from "./AnimatedCounter";
import ParticleField from "./ParticleField";
import TiltCard from "./TiltCard";

// Logos de clientes reais
import lautoCargo from "../../assets/lauto-cargo.png";
import dStore from "../../assets/d-store.png";
import wishBones from "../../assets/wish-bones.jpg";
import grupoDuraMais from "../../assets/grupo-duramais.jpg";
import heroDashboard from "../../assets/hero-dashboard-2.jpg";

const WHATSAPP_LINK =
  "https://api.whatsapp.com/send?phone=5584996950105&text=Ol%C3%A1%2C+eu+vim+pelo+site";

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
      ? "bg-white text-[#009161] shadow-[0_0_40px_rgba(255,255,255,0.25)] hover:shadow-[0_0_60px_rgba(255,255,255,0.5)]"
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
 * Card flutuante de status (3D) sobre o mockup.
 */
const FloatingChip = ({ delay = 0, position, icon: Icon, title, value, accent }) => (
  <motion.div
    initial={{ opacity: 0, y: 30, scale: 0.85 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ delay, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    className={`absolute ${position} bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl shadow-black/10 px-4 py-3 flex items-center gap-3 border border-white/40`}
    style={{ transform: "translateZ(60px)" }}
  >
    <div className={`w-10 h-10 ${accent} rounded-xl flex items-center justify-center text-white`}>
      <Icon className="w-5 h-5" />
    </div>
    <div className="text-left">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
        {title}
      </p>
      <p className="text-sm font-bold text-zinc-900">{value}</p>
    </div>
  </motion.div>
);

/**
 * Hero verde premium — identidade ChatClean original.
 * Mockup com tilt 3D, cards flutuantes, particles, magnetic CTAs,
 * kinetic typography, parallax suave.
 *
 * H1 carrega palavras-chave SEO: "CRM e ChatBot para WhatsApp".
 */
export default function ModernHero() {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  // Parallax: hero text sobe levemente, mockup desce
  const yText = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const yMockup = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const opacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);

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
      ref={containerRef}
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden pt-32 pb-20 aurora-bg aurora-beams"
    >
      {/* Grid técnico de fundo */}
      <div className="absolute inset-0 bg-grid-white opacity-60 pointer-events-none" />

      {/* Particles brancas flutuantes */}
      <ParticleField count={36} color="rgba(255,255,255,0.7)" />

      {/* Blobs de cor adicionais */}
      <div className="absolute top-1/4 -right-32 w-96 h-96 bg-emerald-300/30 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-1/4 -left-32 w-[500px] h-[500px] bg-cyan-300/25 rounded-full blur-[140px] mix-blend-screen pointer-events-none" />

      <div className="relative z-10 w-full mx-auto px-4 sm:px-20 grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
        {/* Coluna texto */}
        <motion.div
          style={{ y: yText, opacity }}
          className="text-left"
        >
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
            className="text-5xl md:text-6xl lg:text-7xl font-extrabold text-white tracking-tighter leading-[1.05] mb-6"
          >
            <span className="block overflow-hidden pb-2">
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
                className="inline-block bg-gradient-to-r from-yellow-200 via-white to-cyan-100 bg-clip-text text-transparent"
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
            className="text-lg md:text-xl text-white/90 mb-10 leading-relaxed max-w-xl"
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
            <MagneticButton href={WHATSAPP_LINK} variant="primary">
              <Play className="w-5 h-5 fill-current" />
              Ver uma Demonstração Gratuita
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </MagneticButton>

            <MagneticButton
              onClick={() => {
                const el = document.getElementById("funcionalidades");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
              variant="secondary"
            >
              Ver Como Funciona
            </MagneticButton>
          </motion.div>

          {/* Prova social */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.05, duration: 0.6 }}
            className="mt-12 pt-8 border-t border-white/20 flex flex-col sm:flex-row items-start sm:items-center gap-4"
          >
            <div className="flex -space-x-3">
              {[lautoCargo, dStore, wishBones, grupoDuraMais].map((logo, i) => (
                <motion.img
                  key={i}
                  src={logo}
                  alt="Cliente ChatClean"
                  className="w-12 h-12 rounded-full border-2 border-white bg-white object-contain p-1 shadow-lg"
                  whileHover={{ y: -6, scale: 1.15, zIndex: 10 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                />
              ))}
            </div>
            <p className="text-sm text-white/85">
              <span className="text-white font-bold">
                +<AnimatedCounter to={300} duration={1400} /> empresas
              </span>{" "}
              já crescem com a ChatClean
            </p>
          </motion.div>
        </motion.div>

        {/* Coluna mockup com tilt 3D */}
        <motion.div
          style={{ y: yMockup, opacity }}
          initial={{ opacity: 0, scale: 0.92, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative"
        >
          <TiltCard
            className="relative"
            innerClassName="relative"
            intensity={6}
          >
            {/* Sombra sutil atrás */}
            <div className="absolute -inset-4 bg-black/30 rounded-[3rem] blur-2xl" />

            {/* Frame branco com mockup */}
            <div className="relative bg-white/95 backdrop-blur-md p-3 rounded-[2.5rem] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.3)] border border-white/60">
              <img
                src={heroDashboard}
                alt="Dashboard ChatClean"
                className="rounded-[1.8rem] w-full h-auto object-cover"
              />
            </div>

            {/* Cards flutuantes */}
            <FloatingChip
              delay={1.1}
              position="-top-6 -left-6 hidden md:flex"
              icon={Activity}
              title="Status"
              value="Atendimento Ativo"
              accent="bg-green-500"
            />
            <FloatingChip
              delay={1.3}
              position="bottom-8 -right-6 hidden md:flex"
              icon={MessageCircle}
              title="Hoje"
              value="248 conversas"
              accent="bg-blue-500"
            />
            <FloatingChip
              delay={1.5}
              position="-bottom-6 left-8 hidden xl:flex"
              icon={Zap}
              title="Robô"
              value="64% automatizado"
              accent="bg-yellow-500"
            />
          </TiltCard>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6, duration: 0.6 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/70"
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
