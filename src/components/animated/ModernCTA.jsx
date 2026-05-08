import { motion } from "framer-motion";
import { ArrowRight, Phone, Sparkles } from "lucide-react";
import ParticleField from "./ParticleField";

const WHATSAPP_LINK =
  "https://api.whatsapp.com/send?phone=5584996950105&text=Ol%C3%A1%2C+eu+vim+pelo+site";

/**
 * CTA gigante de fechamento — aurora verde animada com efeito mesh.
 * Mantém o impacto visual e o branding ChatClean.
 */
export default function ModernCTA() {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden aurora-bg aurora-beams py-20">
      {/* Grid técnico branco */}
      <div className="absolute inset-0 bg-grid-white opacity-40 pointer-events-none" />

      {/* Particles brancas */}
      <ParticleField count={40} color="rgba(255,255,255,0.7)" />

      {/* Blobs adicionais para profundidade */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        whileInView={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.6, ease: [0, 0.55, 0.45, 1] }}
        viewport={{ once: true, margin: "200px" }}
        className="absolute -top-32 -right-32 w-[500px] h-[500px] bg-yellow-300/30 rounded-full blur-[120px] mix-blend-screen pointer-events-none"
      />
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        whileInView={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.6, delay: 0.2, ease: [0, 0.55, 0.45, 1] }}
        viewport={{ once: true, margin: "200px" }}
        className="absolute -bottom-32 -left-32 w-[600px] h-[600px] bg-cyan-300/25 rounded-full blur-[140px] mix-blend-screen pointer-events-none"
      />

      <div className="relative z-10 flex flex-col items-center text-center px-4 w-full max-w-5xl">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.85 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 border border-white/30 backdrop-blur-md text-white text-xs font-bold uppercase tracking-widest mb-8"
        >
          <Sparkles className="w-3.5 h-3.5 text-yellow-200" />
          Pronto para escalar?
        </motion.div>

        {/* Headline gigante */}
        <motion.h2
          initial={{ y: 50, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-5xl md:text-7xl lg:text-8xl font-black text-white tracking-tighter leading-[0.95] mb-8"
        >
          Revolucione seu
          <br />
          <span className="bg-gradient-to-r from-yellow-200 via-white to-cyan-100 bg-clip-text text-transparent">
            atendimento hoje
          </span>
        </motion.h2>

        <motion.p
          initial={{ y: 20, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          viewport={{ once: true }}
          className="text-lg md:text-2xl text-white/90 mb-12 font-light max-w-2xl"
        >
          Junte-se às empresas brasileiras que já transformaram o WhatsApp em um
          canal de vendas previsível com a ChatClean.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35 }}
          viewport={{ once: true }}
          className="flex flex-col sm:flex-row gap-4 items-center"
        >
          <motion.a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ scale: 1.04, y: -3 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="group inline-flex items-center gap-2 px-10 py-5 bg-white text-emerald-700 font-bold text-lg rounded-full shadow-[0_0_50px_rgba(255,255,255,0.25)] hover:shadow-[0_0_80px_rgba(255,255,255,0.5)] transition-shadow duration-300"
          >
            Agendar Demo Gratuita
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </motion.a>

          <motion.a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ scale: 1.04, y: -3 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="inline-flex items-center gap-2 px-10 py-5 bg-white/10 text-white border border-white/30 hover:border-white/60 backdrop-blur-md font-bold text-lg rounded-full transition-colors duration-300"
          >
            <Phone className="w-5 h-5" />
            Falar com Especialista
          </motion.a>
        </motion.div>

        {/* Stat strip pequena */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.55 }}
          viewport={{ once: true }}
          className="mt-16 grid grid-cols-3 gap-8 max-w-2xl text-white"
        >
          {[
            { v: "Setup", l: "Em poucos dias úteis" },
            { v: "100%", l: "Suporte em PT-BR" },
            { v: "Sem fidelidade", l: "Cancele quando quiser" },
          ].map((s, i) => (
            <div key={i} className="text-center">
              <div className="font-bold text-xl md:text-2xl">{s.v}</div>
              <div className="text-white/70 text-xs md:text-sm">{s.l}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
