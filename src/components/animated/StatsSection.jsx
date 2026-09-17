import { motion } from "framer-motion";
import { Building2, MessageSquare, Clock, Bot } from "lucide-react";
import AnimatedCounter from "./AnimatedCounter";
import Reveal from "./Reveal";
import { useCarrossel } from "@/lib/useCarrossel";
import ControlesDeCarrossel from "./ControlesDeCarrossel";

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
  // No celular os cards viram um carrossel de arrastar; a partir de `sm` a
  // mesma lista volta a ser grade e os controles somem.
  const { trilha, indice, irPara } = useCarrossel(stats.length);

  return (
    <section className="relative py-24 md:py-32 bg-creme overflow-hidden">
      {/* Grid pattern decorativo */}
      <div className="absolute inset-0 bg-grid pointer-events-none" />

      {/* Blob suave de fundo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1100px] h-[600px] bg-gradient-to-r from-emerald-100/40 via-cyan-100/30 to-yellow-100/40 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-zinc-900 tracking-tighter leading-[1.05] mb-6">
            Resultados reais de <br />
            <span className="text-brand-chrome">quem já usa</span>
          </h2>
          <p className="text-zinc-600 text-lg leading-relaxed">
            Empresas que usam a ChatClean atendem mais rápido, vendem mais
            e não perdem nenhuma mensagem dos clientes.
          </p>
        </Reveal>

        {/* Celular: fileira que arrasta, com o próximo card espiando na
            borda — é o que conta que dá para deslizar. Da grade para cima
            (`sm:`), volta tudo ao normal. */}
        <div
          ref={trilha}
          className="sem-barra-de-rolagem -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:px-0 lg:grid-cols-4"
        >
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
              className="group relative basis-[85%] shrink-0 snap-center bg-white rounded-3xl p-6 md:p-8 border border-zinc-100 hover:border-zinc-200 green-glow card-3d sm:basis-auto"
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

            </motion.div>
          ))}
        </div>

        {/* Controles: só no celular, onde a grade virou carrossel */}
        <ControlesDeCarrossel
          className="sm:hidden"
          rotulos={stats.map((stat) => `${stat.value}${stat.suffix} ${stat.label.toLowerCase()}`)}
          indice={indice}
          irPara={irPara}
        />
      </div>
    </section>
  );
}
