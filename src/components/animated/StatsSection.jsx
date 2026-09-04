import { motion } from "framer-motion";
import { Building2, MessageSquare, Clock, Bot } from "lucide-react";
import AnimatedCounter from "./AnimatedCounter";
import Reveal from "./Reveal";

/**
 * <StatsSection /> — banner de KPIs animados em 4 colunas.
 * Modo claro premium estilo Stripe / Linear.
 * Números sobem ao entrar na viewport.
 */
const stats = [
  {
    icon: Building2,
    value: 300,
    suffix: "+",
    label: "Empresas atendidas",
    description: "Pequenas, médias e grandes empresas no Brasil",
  },
  {
    icon: MessageSquare,
    value: 50,
    suffix: "M+",
    label: "Mensagens trocadas",
    description: "Por mês, em todos os aplicativos conectados",
  },
  {
    icon: Clock,
    value: 70,
    suffix: "%",
    label: "Mais rápido para responder",
    description: "Média dos clientes nos primeiros 90 dias",
  },
  {
    icon: Bot,
    value: 24,
    suffix: "/7",
    label: "Atendimento automático",
    description: "Robô ativo dia e noite, sem pausas",
  },
];

export default function StatsSection() {
  return (
    <section className="relative py-24 md:py-32 bg-white overflow-hidden">
      {/* Grid pattern decorativo */}
      <div className="absolute inset-0 bg-grid pointer-events-none" />

      {/* Blob suave de fundo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1100px] h-[600px] bg-gradient-to-r from-emerald-100/40 via-cyan-100/30 to-yellow-100/40 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-block px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold uppercase tracking-widest mb-6">
            Resultados que falam por si
          </span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-zinc-900 tracking-tighter leading-[1.05] mb-6">
            Resultados reais de <br />
            <span className="text-brand-chrome">quem já usa</span>
          </h2>
          <p className="text-zinc-600 text-lg leading-relaxed">
            Empresas que usam a ChatClean atendem mais rápido, vendem mais
            e não perdem nenhuma mensagem dos clientes.
          </p>
        </Reveal>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                duration: 0.7,
                delay: i * 0.08,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="group relative bg-white rounded-3xl p-6 md:p-8 border border-zinc-100 hover:border-zinc-200 green-glow card-3d"
            >
              <stat.icon
                className="w-9 h-9 text-brand-action icon-wiggle mb-6 transition-transform duration-500 group-hover:scale-110"
                strokeWidth={1.5}
                aria-hidden="true"
              />

              {/* Número gigante */}
              <div className="font-black text-5xl md:text-6xl text-zinc-900 tracking-tighter mb-2 tabular-nums">
                <AnimatedCounter
                  to={stat.value}
                  duration={1800}
                  suffix={stat.suffix}
                />
              </div>

              {/* Label + descrição */}
              <p className="text-zinc-900 font-semibold mb-1">{stat.label}</p>
              <p className="text-zinc-500 text-sm leading-relaxed">
                {stat.description}
              </p>

              {/* Linha decorativa que aparece no hover */}
              <div
                className={`absolute bottom-0 left-8 right-8 h-1 bg-gradient-to-r ${stat.accent} rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
