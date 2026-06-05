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
  Instagram,
  Facebook,
  Send,
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
      viewport={{ once: true }}
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
            Tudo que sua empresa{" "}
            <span className="text-gradient-green">precisa</span>
          </h2>
          <p className="text-zinc-600 text-lg mt-6 leading-relaxed">
            Ferramentas simples de usar que ajudam sua equipe a
            atender melhor e vender mais — sem precisar de conhecimento técnico.
          </p>
        </motion.div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 auto-rows-fr">
          {/* Linha 1 */}
          <BentoCard
            title="Tudo em Um Só Lugar"
            description="Seus clientes falam por WhatsApp, Instagram, Facebook ou Telegram? Sua equipe responde tudo numa única tela — sem precisar trocar de aplicativo."
            colSpan="md:col-span-2"
            delay={0.05}
            icon={MessageCircle}
            accent="from-emerald-500 to-green-600"
          >
            {/* Visual: ícones das redes sociais */}
            <div className="grid grid-cols-2 gap-4 sm:flex sm:gap-6 sm:items-center">
              {[
                { Icon: MessageCircle, bg: "bg-green-500",   shadow: "shadow-green-400/50",   title: "WhatsApp"  },
                { Icon: Instagram,     bg: "bg-gradient-to-br from-pink-500 via-rose-500 to-orange-400", shadow: "shadow-pink-400/50",   title: "Instagram" },
                { Icon: Facebook,      bg: "bg-blue-600",    shadow: "shadow-blue-400/50",    title: "Facebook"  },
                { Icon: Send,          bg: "bg-sky-500",     shadow: "shadow-sky-400/50",     title: "Telegram"  },
              ].map(({ Icon, bg, shadow, title }, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.6 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.15 + i * 0.1, duration: 0.4, type: "spring", stiffness: 260, damping: 18 }}
                  viewport={{ once: true }}
                  whileHover={{ y: -4, scale: 1.12 }}
                  title={title}
                  className={`w-14 h-14 rounded-2xl ${bg} flex items-center justify-center shadow-xl ${shadow} cursor-default`}
                >
                  <Icon className="w-7 h-7 text-white" strokeWidth={1.8} />
                </motion.div>
              ))}
            </div>
          </BentoCard>

          <BentoCard
            title="Painel de Controle"
            description="Veja em tempo real quantos atendimentos estão abertos, quem está respondendo e se os clientes estão sendo bem atendidos."
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
            title="Robô de Atendimento"
            description="Um robô que responde seus clientes 24h por dia, 7 dias por semana. Resolve as dúvidas mais comuns sozinho e só chama um atendente quando for necessário."
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
            title="Organização de Clientes e Vendas"
            description="Veja o histórico completo de cada cliente, organize suas oportunidades de venda por etapa e nunca perca o fio da conversa."
            colSpan="md:col-span-2"
            delay={0.2}
            icon={Users}
            accent="from-purple-500 to-pink-600"
            spotlightColor="rgba(168, 85, 247, 0.15)"
          >
            <div className="flex gap-2 w-full px-4">
              {["Novo Contato", "Interessado", "Proposta", "Fechado"].map((stage, i) => (
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
            title="Envio em Massa"
            description="Mande promoções, lembretes e avisos para muitos clientes ao mesmo tempo — de forma rápida e pelo WhatsApp oficial."
            delay={0.25}
            icon={CheckCircle}
            accent="from-indigo-500 to-purple-600"
            spotlightColor="rgba(99, 102, 241, 0.15)"
          />

          <BentoCard
            title="Organização da Equipe"
            description="Distribua conversas entre os atendentes, crie departamentos e veja quem está atendendo o quê — em tempo real."
            delay={0.3}
            icon={Clock}
            accent="from-red-500 to-rose-600"
            spotlightColor="rgba(244, 63, 94, 0.15)"
          />

          <BentoCard
            title="Atenda pelo Celular"
            description="Atenda seus clientes de onde estiver — pelo celular, tablet ou computador. Disponível para iPhone e Android."
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
            "Vários atendentes no mesmo número",
            "Mensagens aprovadas pelo WhatsApp",
            "Histórico de clientes integrado",
            "Suporte em Português",
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
