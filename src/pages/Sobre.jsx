import { motion } from "framer-motion";
import { ArrowRight, Award, Phone, Target, TrendingUp, Users } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Reveal from "../components/animated/Reveal";
import { StaggerGroup, StaggerItem } from "../components/animated/StaggerGroup";

import palestra1 from "@/assets/palestra-1.jpg";
import palestra2 from "@/assets/palestra-2.jpg";
import palestra4 from "@/assets/palestra-4.jpg";
import palestra5 from "@/assets/palestra-5.jpg";
import palestra6 from "@/assets/palestra-6.jpg";
import palestra7 from "@/assets/palestra-7.jpg";
import consultoria1 from "@/assets/consultoria-1.jpg";
import consultoria2 from "@/assets/consultoria-2.jpg";
import consultoria3 from "@/assets/consultoria-3.jpg";
import consultoria4 from "@/assets/consultoria-4.jpg";
import consultoria5 from "@/assets/consultoria-5.jpg";
import consultoria6 from "@/assets/consultoria-6.jpg";

const WHATSAPP_LINK =
  "https://api.whatsapp.com/send?phone=5584996950105&text=Ol%C3%A1%2C+eu+vim+pelo+site";

const pilares = [
  {
    icon: Target,
    title: "Estratégia de Vendas",
    description:
      "Desenvolvemos estratégias personalizadas para maximizar conversões e otimizar o funil de vendas da sua empresa.",
    accent: "from-emerald-500 to-green-600",
    bg: "bg-emerald-50",
  },
  {
    icon: Users,
    title: "Gestão de Equipes",
    description:
      "Capacitamos líderes e equipes para alcançar alta performance através de metodologias comprovadas.",
    accent: "from-blue-500 to-cyan-600",
    bg: "bg-blue-50",
  },
  {
    icon: TrendingUp,
    title: "Transformação Digital",
    description:
      "Implementamos soluções tecnológicas que revolucionam a experiência do cliente e aumentam a eficiência.",
    accent: "from-purple-500 to-fuchsia-600",
    bg: "bg-purple-50",
  },
];

const palestrasSlides = [palestra2, palestra6, palestra4, palestra5];
const consultoriaSlides = [consultoria3, consultoria4, consultoria1, consultoria2];
const metodologiasSlides = [consultoria6, palestra5, palestra6, palestra7];

export default function Sobre() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 selection:bg-emerald-500 selection:text-white">
      <Navbar />

      {/* Hero aurora */}
      <section className="relative aurora-bg aurora-beams pt-44 pb-28 overflow-hidden">
        <div className="absolute inset-0 bg-grid-white opacity-40 pointer-events-none" />
        <div className="absolute top-1/4 -right-32 w-96 h-96 bg-emerald-300/30 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
        <div className="absolute bottom-1/4 -left-32 w-[500px] h-[500px] bg-cyan-300/25 rounded-full blur-[140px] mix-blend-screen pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 border border-white/30 backdrop-blur-md text-white text-xs font-bold uppercase tracking-widest mb-8"
          >
            Nossa história
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="text-5xl md:text-7xl font-black text-white tracking-tighter leading-[1.0] mb-6"
          >
            Mais que tecnologia,
            <br />
            <span className="bg-gradient-to-r from-yellow-200 via-white to-cyan-100 bg-clip-text text-transparent">
              transformação completa
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="text-lg md:text-xl text-white/85 max-w-2xl mx-auto mb-10"
          >
            A ChatClean não é apenas uma plataforma de CRM e ChatBot. Somos especialistas
            em transformação digital, consultoria empresarial e capacitação em vendas que
            geram resultados reais.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-emerald-700 font-bold rounded-full shadow-[0_0_40px_rgba(255,255,255,0.25)] hover:shadow-[0_0_60px_rgba(255,255,255,0.5)] hover:scale-[1.03] transition-all duration-300"
            >
              <Phone className="h-4 w-4" />
              Falar com Especialista
            </a>
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white/10 text-white border border-white/30 hover:border-white/60 backdrop-blur-md font-bold rounded-full transition-all duration-300"
            >
              Solicitar Proposta
              <ArrowRight className="h-4 w-4" />
            </a>
          </motion.div>
        </div>
      </section>

      {/* Nossa Missão */}
      <section className="py-24 md:py-32 bg-white relative overflow-hidden">
        <div className="absolute inset-0 bg-grid pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 relative">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <Reveal>
              <span className="inline-block px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold uppercase tracking-widest mb-6">
                Nossa missão
              </span>
              <h2 className="text-4xl md:text-5xl font-black text-zinc-900 tracking-tighter mb-6">
                Revolucionar a forma como empresas se relacionam com seus clientes
              </h2>
              <p className="text-zinc-600 text-lg leading-relaxed mb-8">
                Oferecemos não apenas tecnologia de ponta, mas também conhecimento estratégico
                e capacitação profissional. Nossa missão é transformar cada interação em uma
                oportunidade de negócio.
              </p>
              <div className="grid grid-cols-2 gap-6">
                {[
                  { icon: Users, value: "+100", label: "Empresas atendidas", color: "text-emerald-600", bg: "bg-emerald-50" },
                  { icon: TrendingUp, value: "50%", label: "Aumento médio em vendas", color: "text-blue-600", bg: "bg-blue-50" },
                ].map((stat) => (
                  <div key={stat.label} className="text-center p-6 rounded-2xl bg-white border border-zinc-100 green-glow">
                    <div className={`w-12 h-12 ${stat.bg} rounded-xl flex items-center justify-center mx-auto mb-3`}>
                      <stat.icon className={`h-6 w-6 ${stat.color}`} />
                    </div>
                    <p className="text-2xl font-black text-zinc-900">{stat.value}</p>
                    <p className="text-sm text-zinc-500">{stat.label}</p>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal variant="right">
              <div className="cards-carousel rounded-3xl overflow-hidden shadow-2xl">
                <div className="cards-track">
                  {consultoriaSlides.map((img, i) => (
                    <div key={i} className="card-item">
                      <img src={img} alt="ChatClean consultoria" />
                      <div className="card-overlay">
                        <h4 className="font-semibold mb-1 text-sm">
                          {["Consultoria Estratégica", "Reuniões Estratégicas", "Consultoria em Ação", "Equipe Especializada"][i]}
                        </h4>
                        <p className="text-xs opacity-80">
                          {["Transformando processos empresariais", "Planejamento e execução de resultados", "Implementação prática de soluções", "Profissionais experientes"][i]}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Consultoria Empresarial */}
      <section className="py-24 md:py-32 bg-zinc-50 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 relative">
          <Reveal className="text-center mb-16 max-w-3xl mx-auto">
            <span className="inline-block px-3 py-1.5 rounded-full bg-white border border-zinc-200 text-zinc-700 text-xs font-bold uppercase tracking-widest mb-6 shadow-sm">
              Consultoria empresarial
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-zinc-900 tracking-tighter mb-6">
              Transformamos processos,{" "}
              <span className="text-gradient-green">otimizamos resultados</span>
            </h2>
            <p className="text-zinc-600 text-lg leading-relaxed">
              Capacitamos equipes para o sucesso sustentável através de metodologias comprovadas.
            </p>
          </Reveal>

          <StaggerGroup className="grid md:grid-cols-3 gap-6 mb-16">
            {pilares.map((p) => (
              <StaggerItem key={p.title}>
                <div className="bg-white rounded-3xl p-8 border border-zinc-100 hover:border-emerald-200 green-glow card-3d transition-all duration-500 h-full">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${p.accent} flex items-center justify-center mb-6 shadow-lg`}>
                    <p.icon className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-xl font-black text-zinc-900 tracking-tight mb-3">{p.title}</h3>
                  <p className="text-zinc-600 leading-relaxed text-sm">{p.description}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>

          <Reveal>
            <div className="cards-carousel rounded-3xl overflow-hidden shadow-2xl">
              <div className="cards-track">
                {palestrasSlides.map((img, i) => (
                  <div key={i} className="card-item">
                    <img src={img} alt="ChatClean palestras" />
                    <div className="card-overlay">
                      <h4 className="font-semibold mb-1 text-sm">
                        {["Palestras Motivacionais", "Apresentações Técnicas", "Palestrante Especialista", "Eventos de Capacitação"][i]}
                      </h4>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Palestras e Capacitação */}
      <section className="py-24 md:py-32 bg-white relative overflow-hidden">
        <div className="absolute inset-0 bg-grid pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 relative">
          <Reveal className="text-center mb-16 max-w-3xl mx-auto">
            <span className="inline-block px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold uppercase tracking-widest mb-6">
              Palestras e capacitação
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-zinc-900 tracking-tighter mb-6">
              Desmistificando{" "}
              <span className="text-gradient-green">Vendas</span>
            </h2>
            <p className="text-zinc-600 text-lg leading-relaxed">
              Nossa palestra mais requisitada revela os segredos por trás de vendas de alta
              performance.
            </p>
          </Reveal>

          <div className="grid md:grid-cols-2 gap-16 items-center">
            <Reveal>
              <ul className="space-y-4 mb-8">
                {[
                  "Técnicas de persuasão ética",
                  "Gestão de objeções",
                  "Fechamento de vendas",
                  "Relacionamento duradouro",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-4 p-4 rounded-2xl bg-zinc-50 border border-zinc-100 hover:border-emerald-200 transition-colors">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center flex-shrink-0">
                      <Award className="h-5 w-5 text-white" />
                    </div>
                    <span className="font-medium text-zinc-800">{item}</span>
                  </li>
                ))}
              </ul>
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-8 py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-full shadow-lg shadow-emerald-500/30 hover:scale-[1.03] transition-all duration-300"
              >
                Contratar Palestra
                <ArrowRight className="h-4 w-4" />
              </a>
            </Reveal>

            <Reveal variant="right">
              <div className="cards-carousel rounded-3xl overflow-hidden shadow-2xl">
                <div className="cards-track">
                  {metodologiasSlides.map((img, i) => (
                    <div key={i} className="card-item">
                      <img src={img} alt="Metodologias ChatClean" />
                      <div className="card-overlay">
                        <h4 className="font-semibold mb-1 text-sm">
                          {["Metodologias Avançadas", "Treinamento Prático", "Resultados Mensuráveis", "Estratégias Personalizadas"][i]}
                        </h4>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
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
            Pronto para
            <br />
            <span className="bg-gradient-to-r from-yellow-200 via-white to-cyan-100 bg-clip-text text-transparent">
              transformar sua empresa?
            </span>
          </h2>
          <p className="text-white/80 text-lg mb-10">
            Agende uma consultoria gratuita e descubra como podemos revolucionar seus resultados.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-emerald-700 font-bold rounded-full shadow-[0_0_40px_rgba(255,255,255,0.25)] hover:shadow-[0_0_60px_rgba(255,255,255,0.5)] hover:scale-[1.03] transition-all duration-300"
            >
              <Phone className="h-4 w-4" />
              Agendar Consultoria Gratuita
            </a>
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white/10 text-white border border-white/30 hover:border-white/60 backdrop-blur-md font-bold rounded-full transition-all duration-300"
            >
              Solicitar Proposta
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </motion.div>
      </section>

      <Footer />
    </div>
  );
}
