import { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  MessageCircle,
  Users,
  Clock,
  CheckCircle,
  Smartphone,
  Sparkles,
  Zap,
} from "lucide-react";

/**
 * Card do Bento (modo claro) com efeito spotlight verde + tilt sutil.
 */
const BentoCard = ({
  title,
  description,
  colSpan = "md:col-span-1",
  delay = 0,
  icon: Icon,
  accent = "from-emerald-500 to-green-600",
  spotlightColor = "rgba(0, 189, 66, 0.15)",
  children,
}) => {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const cardRef = useRef(null);

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const r = cardRef.current.getBoundingClientRect();
    setMouse({ x: e.clientX - r.left, y: e.clientY - r.top });
  };

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`relative overflow-hidden rounded-3xl bg-white border border-zinc-100 hover:border-zinc-200 p-8 group transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl hover:shadow-emerald-500/10 ${colSpan}`}
    >
      {/* Spotlight verde que segue cursor */}
      <div
        className="pointer-events-none absolute -inset-px rounded-3xl opacity-0 transition duration-500 group-hover:opacity-100"
        style={{
          background: `radial-gradient(500px circle at ${mouse.x}px ${mouse.y}px, ${spotlightColor}, transparent 50%)`,
        }}
      />

      <div className="relative z-10 h-full flex flex-col gap-5">
        {/* Visual */}
        <div className="h-40 w-full rounded-2xl bg-gradient-to-br from-zinc-50 to-zinc-100 flex items-center justify-center overflow-hidden border border-zinc-100 relative">
          {children || (
            <div
              className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${accent} flex items-center justify-center shadow-lg`}
            >
              {Icon && <Icon className="w-8 h-8 text-white icon-wiggle" />}
            </div>
          )}
        </div>

        {/* Texto */}
        <div className="mt-auto">
          <h3 className="text-xl md:text-2xl font-bold text-zinc-900 mb-2 tracking-tight">
            {title}
          </h3>
          <p className="text-zinc-600 leading-relaxed text-sm md:text-base">
            {description}
          </p>
        </div>
      </div>
    </motion.div>
  );
};

/**
 * Bento grid de funcionalidades — modo claro premium.
 * 7 cards em grade assimétrica com visuais únicos animados.
 */
export default function BentoFeatures() {
  return (
    <section className="py-24 md:py-32 bg-zinc-50 px-4 relative overflow-hidden">
      {/* Grid técnico */}
      <div className="absolute inset-0 bg-grid pointer-events-none" />

      {/* Blob decorativo */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gradient-to-r from-emerald-200/30 via-cyan-200/20 to-yellow-200/30 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto relative">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="text-center mb-16 md:mb-20 max-w-3xl mx-auto"
        >
          <span className="inline-block px-3 py-1.5 rounded-full bg-white border border-zinc-200 text-zinc-700 text-xs font-bold uppercase tracking-widest mb-6 shadow-sm">
            Plataforma completa
          </span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-zinc-900 tracking-tighter leading-[1.05]">
            Funcionalidades{" "}
            <span className="text-gradient-green">Incríveis</span>
          </h2>
          <p className="text-zinc-600 text-lg mt-6 leading-relaxed">
            Tecnologia desenhada para transformar cada interação em uma
            oportunidade de negócio.
          </p>
        </motion.div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 auto-rows-fr">
          {/* Linha 1 */}
          <BentoCard
            title="Atendimento Omnichannel"
            description="WhatsApp, Instagram, Facebook e Telegram centralizados. Sua equipe responde tudo no mesmo painel, sem alternar abas."
            colSpan="md:col-span-2"
            delay={0.05}
            icon={MessageCircle}
            accent="from-emerald-500 to-green-600"
          >
            {/* Visual: pills dos canais com pulse staggered */}
            <div className="flex gap-3 items-center">
              {[
                { color: "bg-green-500", label: "WhatsApp" },
                { color: "bg-pink-500", label: "Instagram" },
                { color: "bg-blue-500", label: "Facebook" },
                { color: "bg-sky-400", label: "Telegram" },
              ].map((ch, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.08, duration: 0.4 }}
                  viewport={{ once: true }}
                  className={`px-3 py-2 rounded-xl ${ch.color} text-white text-xs font-bold shadow-lg flex items-center gap-2`}
                >
                  <motion.span
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{
                      duration: 1.4,
                      repeat: Infinity,
                      delay: i * 0.2,
                    }}
                    className="w-2 h-2 rounded-full bg-white/80"
                  />
                  {ch.label}
                </motion.div>
              ))}
            </div>
          </BentoCard>

          <BentoCard
            title="Dashboard Inteligente"
            description="Acompanhe métricas em tempo real e tome decisões baseadas em dados."
            delay={0.1}
            icon={BarChart3}
            accent="from-blue-500 to-blue-700"
          >
            {/* Barras animadas */}
            <div className="flex gap-2 items-end h-24">
              {[40, 70, 100, 60, 85].map((h, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 0 }}
                  whileInView={{ height: `${h}%` }}
                  transition={{ duration: 1, delay: 0.3 + i * 0.08 }}
                  viewport={{ once: true }}
                  className="w-5 bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-md"
                />
              ))}
            </div>
          </BentoCard>

          {/* Linha 2 */}
          <BentoCard
            title="ChatBot com IA"
            description="Atendimento 24/7 que qualifica leads automaticamente e escala conversas para humanos quando necessário."
            delay={0.15}
            icon={Sparkles}
            accent="from-yellow-400 to-orange-500"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
              className="w-24 h-24 border-4 border-dashed border-yellow-300 rounded-full flex items-center justify-center"
            >
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg"
              >
                <Sparkles className="w-6 h-6 text-white" />
              </motion.div>
            </motion.div>
          </BentoCard>

          <BentoCard
            title="CRM Avançado com Kanban"
            description="Histórico completo de cada cliente, funil de vendas visual e gestão de oportunidades em tempo real."
            colSpan="md:col-span-2"
            delay={0.2}
            icon={Users}
            accent="from-purple-500 to-pink-600"
            spotlightColor="rgba(168, 85, 247, 0.15)"
          >
            <div className="flex gap-2 w-full px-4">
              {["Lead", "Qualificado", "Proposta", "Fechado"].map((stage, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.08, duration: 0.4 }}
                  viewport={{ once: true }}
                  className="flex-1 min-w-0"
                >
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2 truncate font-bold">
                    {stage}
                  </div>
                  <div className="space-y-1.5">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: "100%" }}
                      transition={{ delay: 0.5 + i * 0.08, duration: 0.6 }}
                      viewport={{ once: true }}
                      className="h-3 bg-gradient-to-r from-purple-400 to-purple-600 rounded"
                    />
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: "75%" }}
                      transition={{ delay: 0.7 + i * 0.08, duration: 0.6 }}
                      viewport={{ once: true }}
                      className="h-3 bg-gradient-to-r from-purple-300 to-pink-400 rounded"
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </BentoCard>

          {/* Linha 3 */}
          <BentoCard
            title="Campanhas Automáticas"
            description="Mensagens no momento certo, com templates aprovados pela Meta."
            delay={0.25}
            icon={CheckCircle}
            accent="from-indigo-500 to-purple-600"
            spotlightColor="rgba(99, 102, 241, 0.15)"
          />

          <BentoCard
            title="Gestão de Tarefas"
            description="Organize e acompanhe sua equipe de atendimento por departamento e fila."
            delay={0.3}
            icon={Clock}
            accent="from-red-500 to-rose-600"
            spotlightColor="rgba(244, 63, 94, 0.15)"
          />

          <BentoCard
            title="App Mobile"
            description="Atenda seus clientes de qualquer lugar. iOS e Android nativo."
            delay={0.35}
            icon={Smartphone}
            accent="from-pink-500 to-fuchsia-600"
            spotlightColor="rgba(236, 72, 153, 0.15)"
          />
        </div>

        {/* Faixa de bullets de benefícios */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="mt-12 flex flex-wrap justify-center gap-3"
        >
          {[
            "Multiatendimento real",
            "Templates aprovados Meta",
            "Integração nativa CRM",
            "Suporte 100% PT-BR",
          ].map((item, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-zinc-200 text-zinc-700 text-sm shadow-sm hover:border-emerald-300 hover:text-emerald-700 transition-colors"
            >
              <Zap className="w-4 h-4 text-emerald-500" />
              {item}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
