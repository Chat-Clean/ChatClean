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
      "Reunimos WhatsApp, Instagram e Facebook em um só lugar. A equipe responde mais rápido e o atendimento ficou muito mais organizado.",
    rating: 5,
  },
  {
    name: "Equipe Terra Invest Imóveis",
    company: "Terra Invest Imóveis",
    role: "Comercial",
    content:
      "Com a ChatClean, conseguimos responder clientes 24 horas por dia sem deixar nenhuma conversa sem resposta. Nossas vendas cresceram muito.",
    rating: 5,
  },
  {
    name: "Equipe Grupo Dura Mais",
    company: "Grupo Dura Mais",
    role: "Atendimento ao Cliente",
    content:
      "A mudança para o WhatsApp oficial da empresa foi tranquila e os relatórios nos ajudam a entender o que melhorar todo mês.",
    rating: 5,
  },
];

const faqs = [
  {
    q: "O que é a ChatClean?",
    a: "A ChatClean é uma plataforma que organiza todo o atendimento da sua empresa pelo WhatsApp. Com ela, vários funcionários usam o mesmo número ao mesmo tempo, cada conversa fica registrada, e você pode criar respostas automáticas para as dúvidas mais comuns — tudo sem precisar de conhecimento técnico.",
  },
  {
    q: "Por que a ChatClean usa o WhatsApp oficial para empresas?",
    a: "O WhatsApp oficial para empresas é uma versão aprovada pelo próprio WhatsApp para uso comercial. Com ele, vários funcionários atendem pelo mesmo número sem risco de o número ser bloqueado. A ChatClean cuida de toda essa configuração para você — é só começar a usar.",
  },
  {
    q: "Existe algum custo extra por mensagem enviada?",
    a: "O WhatsApp cobra uma pequena taxa por conversa iniciada pela empresa. No Brasil, o valor é em torno de R$ 0,04 para mensagens de suporte e R$ 0,35 para mensagens de marketing. Para conversas em que o cliente fala primeiro, não há cobrança. Nossa equipe orienta você sobre esses valores na proposta.",
  },
  {
    q: "Posso ter vários atendentes no mesmo número de WhatsApp?",
    a: "Sim! Com a ChatClean, toda a sua equipe atende pelo mesmo número de WhatsApp — cada um com seu próprio acesso. Você pode criar departamentos (ex: Vendas, Suporte), transferir conversas entre atendentes e ver quem respondeu o quê, sem precisar de vários celulares ou chips.",
  },
  {
    q: "Qual a diferença do WhatsApp normal para o que a ChatClean usa?",
    a: "O WhatsApp Business que a maioria das pessoas conhece funciona só para uso individual ou em equipes muito pequenas. Já o WhatsApp que a ChatClean usa não tem esse limite: permite que uma equipe inteira atenda, automatiza respostas e não corre risco de bloqueio — mesmo enviando muitas mensagens.",
  },
  {
    q: "É difícil começar a usar a ChatClean?",
    a: "Não! Nossa equipe cuida de tudo: configura seu WhatsApp, cria os fluxos de atendimento e treina seu time. Você começa a atender em poucos dias — sem precisar de nenhum conhecimento técnico ou contratar alguém de TI.",
  },
  {
    q: "Existe prazo de fidelidade?",
    a: "Não. Sem surpresas, sem complicações. Você cancela quando quiser e reativa quando precisar, sem multa e sem burocracia.",
  },
  {
    q: "O que são os 'canais' que a ChatClean centraliza?",
    a: "São os diferentes aplicativos onde seus clientes entram em contato com você: WhatsApp, Instagram, Facebook e Telegram. A ChatClean reúne todos eles numa única tela para que sua equipe não precise ficar trocando de aplicativo durante o trabalho.",
  },
  {
    q: "O que acontece se eu não pagar a mensalidade?",
    a: "O acesso fica suspenso temporariamente, mas seus dados ficam seguros. Assim que regularizar o pagamento, tudo volta ao normal.",
  },
  {
    q: "Vocês cobram multa de cancelamento?",
    a: "Não cobramos nenhuma multa. Você pode cancelar seu plano a qualquer momento, sem custos adicionais.",
  },
  {
    q: "Como a ChatClean melhora o meu atendimento?",
    a: "Com a ChatClean, sua equipe responde mais rápido, nenhuma mensagem fica sem resposta, e um robô resolve as dúvidas mais comuns automaticamente. Você também recebe relatórios simples de entender para saber o que está funcionando bem.",
  },
  {
    q: "Com quais aplicativos a ChatClean se conecta?",
    a: "Conectamos com WhatsApp, Instagram, Facebook, Telegram e o chat do seu site. Também temos integrações com plataformas como Hotmart, Asaas, Trello e muitas outras — para encaixar no jeito que sua empresa já trabalha.",
  },
  {
    q: "Consigo responder mensagens do Instagram e Facebook pela ChatClean?",
    a: "Sim! Você gerencia tudo em uma única tela: WhatsApp, Instagram, Facebook e Telegram — sem precisar abrir cada aplicativo separado. Sua equipe economiza tempo e nenhum cliente fica sem resposta.",
  },
  {
    q: "Por que vocês não mostram os preços no site?",
    a: "Cada empresa tem um tamanho e uma necessidade diferente. Por isso, criamos uma proposta feita especialmente para você — assim você paga só pelo que realmente precisa, sem pagar por coisas que não vai usar.",
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
            Empresas que confiam na ChatClean
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
              O que dizem{" "}
              <span className="text-gradient-green">nossos clientes</span>
            </h2>
            <p className="text-zinc-600 text-lg max-w-2xl mx-auto">
              Empresas brasileiras que usam a ChatClean no dia a dia e
              viram a diferença.
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
      <section id="faq" className="py-24 md:py-32 aurora-bg aurora-beams relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-white opacity-30 pointer-events-none" />

        <div className="max-w-6xl mx-auto px-4 relative">
          <Reveal className="text-center mb-14">
            <span className="inline-block px-3 py-1 rounded-full bg-white/15 border border-white/30 backdrop-blur-md text-white text-xs font-bold uppercase tracking-widest mb-5">
              FAQ
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tighter">
              Tem alguma dúvida?
            </h2>
            <p className="text-white/75 text-lg">Respondemos as perguntas que as pessoas mais fazem</p>
          </Reveal>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Coluna esquerda */}
            <Accordion type="single" collapsible className="space-y-3">
              {faqs.slice(0, Math.ceil(faqs.length / 2)).map((faq, idx) => (
                <AccordionItem
                  key={idx}
                  value={`left-${idx}`}
                  className="bg-emerald-800/70 border border-emerald-700/60 hover:border-emerald-600 rounded-2xl overflow-hidden px-2 transition-all duration-300 data-[state=open]:border-emerald-500 data-[state=open]:bg-emerald-800/90"
                >
                  <AccordionTrigger className="px-5 py-4 hover:no-underline text-white/90 hover:text-white data-[state=open]:text-white font-semibold text-left text-sm transition-colors [&>svg]:text-white/50 [&>svg]:data-[state=open]:text-white">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4 text-white/70 leading-relaxed text-sm">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            {/* Coluna direita */}
            <Accordion type="single" collapsible className="space-y-3">
              {faqs.slice(Math.ceil(faqs.length / 2)).map((faq, idx) => (
                <AccordionItem
                  key={idx}
                  value={`right-${idx}`}
                  className="bg-emerald-800/70 border border-emerald-700/60 hover:border-emerald-600 rounded-2xl overflow-hidden px-2 transition-all duration-300 data-[state=open]:border-emerald-500 data-[state=open]:bg-emerald-800/90"
                >
                  <AccordionTrigger className="px-5 py-4 hover:no-underline text-white/90 hover:text-white data-[state=open]:text-white font-semibold text-left text-sm transition-colors [&>svg]:text-white/50 [&>svg]:data-[state=open]:text-white">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4 text-white/70 leading-relaxed text-sm">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      <Footer />
      <ChatbotPopup />
      <BackToTop />
    </div>
  );
}

export default App;
