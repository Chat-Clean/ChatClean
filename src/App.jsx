import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion.jsx";
import { Button } from "@/components/ui/button.jsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card.jsx";
import {
  Mail,
  MapPin,
  Menu,
  Phone,
  Star,
  Users,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import "./App.css";
import ChatbotPopup from "@/components/ChatbotPopup";
import Reveal from "@/components/animated/Reveal";
import { StaggerGroup, StaggerItem } from "@/components/animated/StaggerGroup";
import ScrollProgress from "@/components/animated/ScrollProgress";
import BackToTop from "@/components/animated/BackToTop";
import { EASE } from "@/lib/motion";

// Componentes principais animados
import ModernHero from "./components/animated/ModernHero";
import StatsSection from "./components/animated/StatsSection";
import BentoFeatures from "./components/animated/BentoFeatures";
import ModernCTA from "./components/animated/ModernCTA";

// Logos (versão branca para header sobre hero verde, verde para header branco)
import chatcleanLogoWhite from "/logo-chatclean-white.svg";
import chatcleanLogoGreen from "/Logo ChatClean.svg";

// Logos dos clientes para a parede de logos
import bonesRamalho from "./assets/bones-ramalho.jpg";
import dStore from "./assets/d-store.png";
import grupoDuraMais from "./assets/grupo-duramais.jpg";
import lautoCargo from "./assets/lauto-cargo.png";
import ligaDooH from "./assets/liga-dooh.png";
import terraInvestImoveis from "./assets/terra-invest-imoveis.jpg";
import wishBones from "./assets/wish-bones.jpg";

const WHATSAPP_LINK =
  "https://api.whatsapp.com/send?phone=5584996950105&text=Ol%C3%A1%2C+eu+vim+pelo+site";

function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const closeMobileMenu = () => setIsMenuOpen(false);

  const navItems = [
    { name: "Home", href: "#home" },
    { name: "Funcionalidades", href: "#funcionalidades" },
    { name: "Sobre", href: "/sobre", isLink: true },
    { name: "Blog", href: "/blog", isLink: true },
    { name: "Carreiras", href: "/carreiras", isLink: true },
    { name: "FAQ", href: "#faq" },
    { name: "Contato", href: "#contato" },
  ];

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

  const LoginModal = () => (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center p-4 transition-all duration-300 ${
        isLoginModalOpen ? "opacity-100 visible" : "opacity-0 invisible"
      }`}
    >
      <div
        className="absolute inset-0 bg-zinc-900/60 backdrop-blur-md"
        onClick={() => setIsLoginModalOpen(false)}
      />
      <div
        className={`relative w-full max-w-md transform transition-all duration-300 ${
          isLoginModalOpen ? "scale-100 translate-y-0" : "scale-95 translate-y-4"
        } rounded-3xl bg-white p-8 shadow-2xl border border-zinc-100`}
      >
        <button
          onClick={() => setIsLoginModalOpen(false)}
          className="absolute right-6 top-6 p-2 rounded-full hover:bg-zinc-100 transition-colors"
        >
          <X className="h-5 w-5 text-zinc-400" />
        </button>
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-zinc-900 mb-2">
            Acesse sua conta
          </h2>
          <p className="text-zinc-500 text-sm">
            Escolha a versão da plataforma que deseja utilizar:
          </p>
        </div>
        <div className="space-y-4">
          <a
            href="https://app.chatclean.com.br/"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center p-5 border border-zinc-200 bg-white rounded-2xl hover:border-emerald-500 hover:shadow-xl hover:shadow-emerald-50 transition-all duration-300"
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-lg shadow-emerald-200 transition-transform group-hover:scale-110">
              <span className="text-lg font-bold">1</span>
            </div>
            <div className="ml-4">
              <h4 className="font-bold text-zinc-900 text-lg">ChatClean</h4>
              <p className="text-sm text-zinc-500">Servidor 1</p>
            </div>
          </a>
          <a
            href="https://app2.chatclean.com.br/"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center p-5 border border-zinc-200 bg-white rounded-2xl hover:border-blue-500 hover:shadow-xl hover:shadow-blue-50 transition-all duration-300"
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white shadow-lg shadow-blue-200 transition-transform group-hover:scale-110">
              <span className="text-lg font-bold">2</span>
            </div>
            <div className="ml-4">
              <h4 className="font-bold text-zinc-900 text-lg">ChatClean</h4>
              <p className="text-sm text-zinc-500">Servidor 2</p>
            </div>
          </a>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white text-zinc-900 selection:bg-emerald-500 selection:text-white">
      <ScrollProgress />

      {/* Header — transparente sobre hero verde, vira branco com blur ao rolar */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? "bg-white/85 backdrop-blur-xl border-b border-zinc-100 shadow-[0_4px_30px_rgba(0,0,0,0.04)]"
            : "bg-transparent border-b border-white/10"
        }`}
      >
        <div className="mx-auto sm:px-20">
          <div className="flex justify-between items-center h-20 px-4">
            {/* Logo (troca conforme scroll) */}
            <div className="flex items-center">
              <a
                href="#home"
                className="transition-transform hover:scale-105 active:scale-95 duration-200"
              >
                <img
                  src={scrolled ? chatcleanLogoGreen : chatcleanLogoWhite}
                  alt="ChatClean"
                  className="h-12 w-auto transition-opacity"
                />
              </a>
            </div>

            {/* Desktop Menu */}
            <nav
              className={`hidden md:flex items-center rounded-full px-2 py-1 transition-all duration-500 ${
                scrolled
                  ? "bg-zinc-50 border border-zinc-100 shadow-sm"
                  : "bg-white/15 border border-white/30 backdrop-blur-md"
              }`}
            >
              {navItems.map((item) =>
                item.isLink ? (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`px-4 py-2 text-sm font-medium transition-all rounded-full ${
                      scrolled
                        ? "text-zinc-600 hover:text-emerald-600 hover:bg-emerald-50"
                        : "text-white/90 hover:text-white hover:bg-white/15"
                    }`}
                  >
                    {item.name}
                  </Link>
                ) : (
                  <a
                    key={item.name}
                    href={item.href}
                    className={`px-4 py-2 text-sm font-medium transition-all rounded-full ${
                      scrolled
                        ? "text-zinc-600 hover:text-emerald-600 hover:bg-emerald-50"
                        : "text-white/90 hover:text-white hover:bg-white/15"
                    }`}
                  >
                    {item.name}
                  </a>
                ),
              )}
            </nav>

            {/* Botão Área do Cliente */}
            <div className="hidden md:flex items-center">
              <Button
                onClick={() => setIsLoginModalOpen(true)}
                className={`transition-all duration-500 hover:scale-[1.03] active:scale-95 px-6 h-12 rounded-full cursor-pointer font-bold ${
                  scrolled
                    ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30"
                    : "bg-white hover:bg-emerald-50 text-emerald-700 shadow-xl"
                }`}
              >
                <Users className="h-4 w-4 mr-2" />
                Área do Cliente
              </Button>
            </div>

            {/* Mobile menu trigger */}
            <button
              className={`md:hidden p-2 transition-colors ${
                scrolled ? "text-zinc-700 hover:text-emerald-600" : "text-white"
              }`}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Abrir menu"
            >
              {isMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>

          {/* Mobile menu animado */}
          <AnimatePresence>
            {isMenuOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE.out }}
                className="md:hidden overflow-hidden border-t border-zinc-100 bg-white/95 backdrop-blur-xl"
              >
                <nav className="flex flex-col py-4 px-4 gap-1">
                  {navItems.map((item, idx) =>
                    item.isLink ? (
                      <motion.div
                        key={item.name}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.05 * idx, duration: 0.3 }}
                      >
                        <Link
                          to={item.href}
                          onClick={closeMobileMenu}
                          className="block px-4 py-3 text-base font-medium text-zinc-700 hover:bg-emerald-50 hover:text-emerald-700 rounded-xl transition-colors"
                        >
                          {item.name}
                        </Link>
                      </motion.div>
                    ) : (
                      <motion.a
                        key={item.name}
                        href={item.href}
                        onClick={closeMobileMenu}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.05 * idx, duration: 0.3 }}
                        className="block px-4 py-3 text-base font-medium text-zinc-700 hover:bg-emerald-50 hover:text-emerald-700 rounded-xl transition-colors"
                      >
                        {item.name}
                      </motion.a>
                    ),
                  )}
                  <Button
                    onClick={() => {
                      closeMobileMenu();
                      setIsLoginModalOpen(true);
                    }}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white mt-4 rounded-full font-bold"
                  >
                    Área do Cliente
                  </Button>
                </nav>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

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
              {[
                lautoCargo,
                dStore,
                terraInvestImoveis,
                bonesRamalho,
                wishBones,
                grupoDuraMais,
                ligaDooH,
              ].map((logo, idx) => (
                <img
                  key={idx}
                  src={logo}
                  alt="Cliente ChatClean"
                  className="h-12 object-contain"
                />
              ))}
              {[
                lautoCargo,
                dStore,
                terraInvestImoveis,
                bonesRamalho,
                wishBones,
                grupoDuraMais,
                ligaDooH,
              ].map((logo, idx) => (
                <img
                  key={`dup-${idx}`}
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

      {/* Depoimentos modo claro */}
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

      {/* FAQ modo claro */}
      <section id="faq" className="py-24 md:py-32 bg-zinc-50 relative">
        <div className="max-w-3xl mx-auto px-4">
          <Reveal className="text-center mb-16">
            <span className="inline-block px-3 py-1.5 rounded-full bg-white border border-zinc-200 text-zinc-700 text-xs font-bold uppercase tracking-widest mb-6 shadow-sm">
              Perguntas frequentes
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-zinc-900 mb-4 tracking-tighter">
              Tudo que você precisa saber
            </h2>
            <p className="text-zinc-600 text-lg">
              Sem surpresas, sem complicações.
            </p>
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

      {/* 4. CTA Aurora gigante */}
      <ModernCTA />

      {/* Footer dark elegante */}
      <footer
        id="contato"
        className="bg-zinc-950 text-zinc-300 py-16 border-t border-zinc-900"
      >
        <div className="max-w-7xl mx-auto px-4 grid md:grid-cols-4 gap-12">
          <div>
            <div className="flex items-center space-x-2 mb-6">
              <img
                src={chatcleanLogoWhite}
                alt="ChatClean"
                className="h-8 w-auto"
              />
            </div>
            <p className="text-zinc-500 mb-6 text-sm leading-relaxed">
              A plataforma de CRM e ChatBot para WhatsApp com API Oficial mais
              completa do Brasil.
            </p>
            <div className="space-y-2 text-sm text-zinc-400">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 flex-shrink-0" />
                <span>+55 84 9695-0105</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 flex-shrink-0" />
                <span>contato@chatclean.com.br</span>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Av. Prudente de Morais, 5121, Natal-RN</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-white font-bold mb-4">Produto</h4>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li>
                <a
                  href="#funcionalidades"
                  className="hover:text-emerald-400 transition-colors"
                >
                  Funcionalidades
                </a>
              </li>
              <li>
                <Link
                  to="/api-oficial-whatsapp"
                  className="hover:text-emerald-400 transition-colors"
                >
                  API Oficial WhatsApp
                </Link>
              </li>
              <li>
                <a
                  href="#funcionalidades"
                  className="hover:text-emerald-400 transition-colors"
                >
                  Integrações
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-emerald-400 transition-colors">
                  FAQ
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-4">Empresa</h4>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li>
                <Link
                  to="/sobre"
                  className="hover:text-emerald-400 transition-colors"
                >
                  Sobre Nós
                </Link>
              </li>
              <li>
                <Link
                  to="/blog"
                  className="hover:text-emerald-400 transition-colors"
                >
                  Blog
                </Link>
              </li>
              <li>
                <Link
                  to="/carreiras"
                  className="hover:text-emerald-400 transition-colors"
                >
                  Carreiras
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-4">Suporte</h4>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li>
                <a href="#faq" className="hover:text-emerald-400 transition-colors">
                  Central de Ajuda
                </a>
              </li>
              <li>
                <a
                  href={WHATSAPP_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-emerald-400 transition-colors"
                >
                  Falar com a gente
                </a>
              </li>
              <li>
                <a
                  href="https://status.chatclean.com.br"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-emerald-400 transition-colors"
                >
                  Status
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 mt-16 pt-8 border-t border-zinc-900 text-center text-xs text-zinc-600">
          &copy; {new Date().getFullYear()} ChatClean. Todos os direitos
          reservados. CNPJ: 57.487.327/0001-57
        </div>
      </footer>

      <LoginModal />
      <ChatbotPopup />
      <BackToTop />
    </div>
  );
}

export default App;
