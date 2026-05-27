import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion.jsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card.jsx";
import { Star } from "lucide-react";
import { motion } from "framer-motion";
import "./App.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ChatbotPopup from "@/components/ChatbotPopup";
import Reveal from "@/components/animated/Reveal";
import { StaggerGroup, StaggerItem } from "@/components/animated/StaggerGroup";
import ScrollProgress from "@/components/animated/ScrollProgress";
import BackToTop from "@/components/animated/BackToTop";
import { EASE } from "@/lib/motion";

import ModernHero from "./components/animated/ModernHero";
import StatsSection from "./components/animated/StatsSection";
import BentoFeatures from "./components/animated/BentoFeatures";
import ModernCTA from "./components/animated/ModernCTA";

import bonesRamalho from "./assets/bones-ramalho.jpg";
import dStore from "./assets/d-store.png";
import grupoDuraMais from "./assets/grupo-duramais.jpg";
import lautoCargo from "./assets/lauto-cargo.png";
import ligaDooH from "./assets/liga-dooh.png";
import terraInvestImoveis from "./assets/terra-invest-imoveis.jpg";
import wishBones from "./assets/wish-bones.jpg";

const testimonials = [
  {
    name: "Equipe L'auto Cargo",
    company: "L'auto Cargo",
    role: "Operação de Atendimento",
    content:
      "Centralizamos WhatsApp, Instagram e Facebook em um só painel. O time ganhou velocidade e a esteira de atendimento ficou bem mais previsível.",
    rating: 5,
  },
  {
    name: "Equipe Terra Invest Imóveis",
    company: "Terra Invest Imóveis",
    role: "Comercial",
    content:
      "Com o CRM e o ChatBot da ChatClean conseguimos qualificar leads 24/7 e não perder mais conversa por falta de resposta. Aumentamos a conversão.",
    rating: 5,
  },
  {
    name: "Equipe Grupo Dura Mais",
    company: "Grupo Dura Mais",
    role: "Atendimento ao Cliente",
    content:
      "A migração para a API Oficial do WhatsApp ficou simples e os relatórios ajudam a entender onde melhorar a operação todo mês.",
    rating: 5,
  },
];

const faqs = [
  {
    q: "O que é um CRM para WhatsApp?",
    a: "Um CRM para WhatsApp é uma plataforma que conecta o WhatsApp Business ao seu processo comercial: registra cada conversa, organiza leads em um funil de vendas (Kanban), permite que vários atendentes usem o mesmo número e automatiza mensagens. Na ChatClean, o CRM é integrado à API Oficial do WhatsApp e ainda centraliza Instagram, Facebook e Telegram no mesmo painel.",
  },
  {
    q: "O que é a API Oficial do WhatsApp e por que ela importa?",
    a: "A API Oficial do WhatsApp Business (Cloud API) é a versão homologada pela Meta para empresas. Permite ter um único número com vários atendentes, envio de templates aprovados, integração com sistemas e zero risco de banimento. A ChatClean é integrada nativamente à API Oficial e cuida de toda a configuração com você.",
  },
  {
    q: "Quanto custa a API Oficial do WhatsApp?",
    a: "A Meta cobra por conversa iniciada, com valores que variam por categoria (utilidade, marketing, autenticação, serviço) e pelo país do destinatário. No Brasil, conversas de utilidade custam aproximadamente R$ 0,045 e de marketing cerca de R$ 0,35 por sessão.",
  },
  {
    q: "Como ter vários atendentes em um único número de WhatsApp?",
    a: "Com a API Oficial e a ChatClean, sua empresa tem um único número de WhatsApp com login individual para cada atendente, filas, departamentos, transferência de conversa, histórico centralizado e relatórios por colaborador — sem precisar de vários celulares ou chips.",
  },
  {
    q: "Qual a diferença entre WhatsApp Business e API Oficial?",
    a: "O WhatsApp Business comum (aplicativo) é gratuito e funciona para autônomos e microempresas, mas só permite até 4 dispositivos no mesmo número. A API Oficial é a solução para empresas que precisam de multiatendimento real, automação com chatbot, integração com CRM e envio de campanhas em escala — sem risco de bloqueio.",
  },
  {
    q: "Como integrar o WhatsApp ao meu CRM?",
    a: "Na ChatClean, a integração é nativa: você não precisa instalar plugins ou contratar fornecedores extras. Nossa equipe ativa a API Oficial do WhatsApp para o seu número, configura templates, importa contatos e treina o time. Geralmente o onboarding é concluído em poucos dias úteis.",
  },
  {
    q: "Existe prazo de fidelidade?",
    a: "Sem surpresas, sem complicações. Cancela quando quiser e reativa quando precisar, sem burocracia.",
  },
  {
    q: "O que são canais de comunicação?",
    a: "Canais de comunicação são as diferentes plataformas onde você atende seus clientes, como WhatsApp, Instagram, Facebook Messenger, Telegram, e outros. Nossa plataforma centraliza todos esses canais em um só lugar.",
  },
  {
    q: "O que acontece se eu não pagar a mensalidade do plano?",
    a: "Caso não seja efetuado o pagamento da mensalidade, o acesso à plataforma será suspenso temporariamente. Seus dados ficam seguros e podem ser recuperados assim que a situação for regularizada.",
  },
  {
    q: "Vocês cobram multa de cancelamento?",
    a: "Não cobramos multa de cancelamento. Você pode cancelar seu plano a qualquer momento sem custos adicionais.",
  },
  {
    q: "Como a ChatClean pode aprimorar meu atendimento ao cliente?",
    a: "A ChatClean centraliza todos os seus canais de atendimento, oferece automação inteligente com chatbots, CRM integrado para histórico completo dos clientes, e relatórios detalhados para otimizar sua estratégia de atendimento.",
  },
  {
    q: "A ChatClean se integra em quais canais?",
    a: "Integramos com WhatsApp, Instagram Direct, Facebook Messenger, Telegram, webchat para seu site, e diversos outros canais. Também oferecemos integrações com plataformas como Hotmart, Asaas, Trello e muitas outras.",
  },
  {
    q: "Consigo responder mensagens dos clientes no direct, sem sair da ChatClean?",
    a: "Sim! Você pode responder mensagens de todos os canais integrados diretamente pela plataforma ChatClean, sem precisar alternar entre diferentes aplicativos ou abas do navegador.",
  },
  {
    q: "Por que vocês não possuem planos no site?",
    a: "Cada empresa tem necessidades únicas. Por isso, preferimos criar propostas personalizadas que atendam exatamente às suas demandas, garantindo que você pague apenas pelo que realmente precisa e usa.",
  },
];

const CLIENT_LOGOS = [
  lautoCargo,
  dStore,
  terraInvestImoveis,
  bonesRamalho,
  wishBones,
  grupoDuraMais,
  ligaDooH,
];

function App() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 selection:bg-emerald-500 selection:text-white">
      <ScrollProgress />
      <Navbar />

      {/* 1. Hero verde premium */}
      <ModernHero />

      {/* Parede de logos clientes */}
      <section className="py-14 bg-white border-y border-zinc-100">
        <div className="max-w-7xl mx-auto px-4">
          <p className="text-center text-sm font-medium text-zinc-500 uppercase tracking-widest mb-8">
            Líderes que escalam com a ChatClean
          </p>
          <div className="logos-container">
            <div className="logos-track">
              {[...CLIENT_LOGOS, ...CLIENT_LOGOS].map((logo, idx) => (
                <img
                  key={idx}
                  src={logo}
                  alt="Cliente ChatClean"
                  className="h-12 object-contain"
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Stats animados */}
      <StatsSection />

      {/* 3. Funcionalidades em Bento Grid */}
      <div id="funcionalidades">
        <BentoFeatures />
      </div>

      {/* Depoimentos */}
      <section className="py-24 md:py-32 bg-white relative overflow-hidden">
        <div className="absolute inset-0 bg-grid pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 relative">
          <Reveal className="text-center mb-16">
            <span className="inline-block px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold uppercase tracking-widest mb-6">
              Clientes que evoluíram com a gente
            </span>
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-6 text-zinc-900">
              Histórias de{" "}
              <span className="text-gradient-green">sucesso</span>
            </h2>
            <p className="text-zinc-600 text-lg max-w-2xl mx-auto">
              Resultados reais de empresas brasileiras que usam a ChatClean no
              dia a dia.
            </p>
          </Reveal>

          <StaggerGroup className="grid md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, index) => (
              <StaggerItem key={index}>
                <Card className="h-full bg-white border-zinc-100 hover:border-emerald-200 green-glow card-3d transition-all duration-500">
                  <CardHeader>
                    <div className="flex space-x-1 mb-4">
                      {[...Array(testimonial.rating)].map((_, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                          whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
                          viewport={{ once: true }}
                          transition={{
                            duration: 0.4,
                            delay: 0.1 + i * 0.06,
                            ease: EASE.out,
                          }}
                        >
                          <Star className="h-4 w-4 text-yellow-400 fill-current" />
                        </motion.div>
                      ))}
                    </div>
                    <CardDescription className="text-zinc-700 text-base leading-relaxed italic">
                      "{testimonial.content}"
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="font-bold text-zinc-900">{testimonial.name}</p>
                    <p className="text-xs text-zinc-500">{testimonial.role}</p>
                    <p className="text-sm text-emerald-600 font-medium">
                      {testimonial.company}
                    </p>
                  </CardContent>
                </Card>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 md:py-32 bg-zinc-50 relative">
        <div className="max-w-3xl mx-auto px-4">
          <Reveal className="text-center mb-16">
            <span className="inline-block px-3 py-1.5 rounded-full bg-white border border-zinc-200 text-zinc-700 text-xs font-bold uppercase tracking-widest mb-6 shadow-sm">
              Perguntas frequentes
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-zinc-900 mb-4 tracking-tighter">
              Tudo que você precisa saber
            </h2>
            <p className="text-zinc-600 text-lg">Sem surpresas, sem complicações.</p>
          </Reveal>

          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((faq, idx) => (
              <AccordionItem
                key={idx}
                value={`item-${idx}`}
                className="bg-white border border-zinc-100 rounded-2xl overflow-hidden px-2 hover:border-emerald-200 hover:shadow-md hover:shadow-emerald-50 transition-all duration-300"
              >
                <AccordionTrigger className="px-6 py-4 hover:no-underline text-zinc-900 font-medium text-left">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-4 text-zinc-600 leading-relaxed">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA Aurora */}
      <ModernCTA />

      <Footer />
      <ChatbotPopup />
      <BackToTop />
    </div>
  );
}

export default App;
