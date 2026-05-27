import { motion } from "framer-motion";
import { ArrowRight, Briefcase, Clock, MapPin, Users, Zap } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Reveal from "../components/animated/Reveal";
import { StaggerGroup, StaggerItem } from "../components/animated/StaggerGroup";

const WHATSAPP_BASE =
  "https://api.whatsapp.com/send?phone=5584996950105&text=";

const vagas = [
  {
    titulo: "Desenvolvedor Full Stack",
    departamento: "Tecnologia",
    localizacao: "Remoto",
    tipo: "CLT",
    nivel: "Pleno",
    descricao:
      "Desenvolver e manter aplicações web usando React, Node.js e banco de dados relacionais.",
    accent: "from-blue-500 to-cyan-600",
    bg: "bg-blue-50",
  },
  {
    titulo: "Especialista em Customer Success",
    departamento: "Atendimento",
    localizacao: "São Paulo, SP",
    tipo: "CLT",
    nivel: "Sênior",
    descricao:
      "Garantir o sucesso dos clientes, implementação e treinamento da plataforma ChatClean.",
    accent: "from-emerald-500 to-green-600",
    bg: "bg-emerald-50",
  },
  {
    titulo: "Analista de Marketing Digital",
    departamento: "Marketing",
    localizacao: "Híbrido",
    tipo: "CLT",
    nivel: "Júnior",
    descricao:
      "Criar e executar estratégias de marketing digital, gerenciar campanhas e analisar métricas.",
    accent: "from-purple-500 to-fuchsia-600",
    bg: "bg-purple-50",
  },
];

const beneficios = [
  {
    icon: Users,
    title: "Ambiente Colaborativo",
    description:
      "Trabalhe com uma equipe talentosa e apaixonada por inovação e tecnologia.",
    accent: "from-emerald-500 to-green-600",
  },
  {
    icon: Clock,
    title: "Flexibilidade",
    description:
      "Horários flexíveis e opções de trabalho remoto para equilibrar vida pessoal e profissional.",
    accent: "from-blue-500 to-cyan-600",
  },
  {
    icon: Zap,
    title: "Crescimento Acelerado",
    description:
      "Oportunidades de desenvolvimento profissional e crescimento dentro da empresa.",
    accent: "from-yellow-500 to-orange-500",
  },
];

const nivelColors = {
  Júnior: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Pleno: "bg-blue-50 text-blue-700 border-blue-200",
  Sênior: "bg-purple-50 text-purple-700 border-purple-200",
};

export default function Carreiras() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 selection:bg-emerald-500 selection:text-white">
      <Navbar />

      {/* Hero aurora */}
      <section className="relative aurora-bg aurora-beams pt-44 pb-28 overflow-hidden">
        <div className="absolute inset-0 bg-grid-white opacity-40 pointer-events-none" />
        <div className="absolute top-1/4 -right-32 w-96 h-96 bg-emerald-300/30 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
        <div className="absolute bottom-1/4 -left-32 w-[500px] h-[500px] bg-cyan-300/25 rounded-full blur-[140px] mix-blend-screen pointer-events-none" />

        <div className="relative z-10 max-w-3xl mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 border border-white/30 backdrop-blur-md text-white text-xs font-bold uppercase tracking-widest mb-8"
          >
            Faça parte do time
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="text-5xl md:text-7xl font-black text-white tracking-tighter leading-[1.0] mb-6"
          >
            Construa o futuro do{" "}
            <span className="bg-gradient-to-r from-yellow-200 via-white to-cyan-100 bg-clip-text text-transparent">
              atendimento
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="text-lg md:text-xl text-white/85 max-w-2xl mx-auto"
          >
            Na ChatClean, estamos transformando a forma como empresas se relacionam com seus
            clientes. Junte-se a nós.
          </motion.p>
        </div>
      </section>

      {/* Benefícios */}
      <section className="py-24 md:py-32 bg-white relative overflow-hidden">
        <div className="absolute inset-0 bg-grid pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 relative">
          <Reveal className="text-center mb-16 max-w-2xl mx-auto">
            <span className="inline-block px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold uppercase tracking-widest mb-6">
              Por que a ChatClean?
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-zinc-900 tracking-tighter mb-6">
              Mais que um emprego,{" "}
              <span className="text-gradient-green">uma missão</span>
            </h2>
          </Reveal>

          <StaggerGroup className="grid md:grid-cols-3 gap-6">
            {beneficios.map((b) => (
              <StaggerItem key={b.title}>
                <div className="bg-white rounded-3xl p-8 border border-zinc-100 hover:border-emerald-200 green-glow card-3d transition-all duration-500 h-full">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${b.accent} flex items-center justify-center mb-6 shadow-lg`}>
                    <b.icon className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-xl font-black text-zinc-900 tracking-tight mb-3">{b.title}</h3>
                  <p className="text-zinc-600 leading-relaxed text-sm">{b.description}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* Vagas */}
      <section className="py-24 md:py-32 bg-zinc-50 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 relative">
          <Reveal className="text-center mb-16">
            <span className="inline-block px-3 py-1.5 rounded-full bg-white border border-zinc-200 text-zinc-700 text-xs font-bold uppercase tracking-widest mb-6 shadow-sm">
              Vagas abertas
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-zinc-900 tracking-tighter">
              Oportunidades disponíveis
            </h2>
          </Reveal>

          <div className="space-y-4">
            {vagas.map((vaga, i) => (
              <motion.div
                key={vaga.titulo}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
              >
                <div className="bg-white rounded-3xl border border-zinc-100 hover:border-emerald-200 p-8 green-glow card-3d transition-all duration-500">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${vaga.accent} flex items-center justify-center flex-shrink-0 shadow-lg`}>
                        <Briefcase className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-zinc-900 tracking-tight">
                          {vaga.titulo}
                        </h3>
                        <div className="flex flex-wrap items-center gap-3 mt-2">
                          <span className="flex items-center gap-1 text-sm text-zinc-500">
                            <MapPin className="h-3.5 w-3.5" />
                            {vaga.localizacao}
                          </span>
                          <span className="text-zinc-300">·</span>
                          <span className="text-sm text-zinc-500">{vaga.tipo}</span>
                          <span className="text-zinc-300">·</span>
                          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${nivelColors[vaga.nivel]}`}>
                            {vaga.nivel}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className={`self-start text-xs font-bold px-3 py-1 rounded-full ${vaga.bg} border`} style={{ borderColor: "transparent" }}>
                      {vaga.departamento}
                    </span>
                  </div>

                  <p className="text-zinc-600 text-sm leading-relaxed mb-6">{vaga.descricao}</p>

                  <a
                    href={`${WHATSAPP_BASE}Tenho+interesse+na+vaga+de+${encodeURIComponent(vaga.titulo)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-full shadow-lg shadow-emerald-500/30 hover:scale-[1.02] transition-all duration-200 text-sm"
                  >
                    Candidatar-se
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA aurora */}
      <section className="relative overflow-hidden aurora-bg aurora-beams py-28">
        <div className="absolute inset-0 bg-grid-white opacity-30 pointer-events-none" />
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="relative z-10 max-w-3xl mx-auto px-4 text-center"
        >
          <h2 className="text-4xl md:text-6xl font-black text-white tracking-tighter mb-6">
            Não encontrou
            <br />
            <span className="bg-gradient-to-r from-yellow-200 via-white to-cyan-100 bg-clip-text text-transparent">
              a vaga ideal?
            </span>
          </h2>
          <p className="text-white/80 text-lg mb-10">
            Envie seu currículo e entraremos em contato quando surgir uma oportunidade que
            combine com seu perfil.
          </p>
          <a
            href={`${WHATSAPP_BASE}Gostaria+de+enviar+meu+curr%C3%ADculo+para+futuras+oportunidades`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-10 py-5 bg-white text-emerald-700 font-bold text-lg rounded-full shadow-[0_0_50px_rgba(255,255,255,0.25)] hover:shadow-[0_0_80px_rgba(255,255,255,0.5)] hover:scale-[1.03] transition-all duration-300"
          >
            Enviar Currículo
            <ArrowRight className="h-5 w-5" />
          </a>
        </motion.div>
      </section>

      <Footer />
    </div>
  );
}
