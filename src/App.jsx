import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Button } from "@/components/ui/button.jsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.jsx";
import {
  ArrowRight,
  BarChart3,
  CheckCircle,
  ChevronDown,
  Clock,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  Play,
  Smartphone,
  Star,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import "./App.css";
import ChatbotPopup from '@/components/ChatbotPopup';
import Reveal from "@/components/animated/Reveal";
import { StaggerGroup, StaggerItem } from "@/components/animated/StaggerGroup";
import AnimatedCounter from "@/components/animated/AnimatedCounter";
import AnimatedGradient from "@/components/animated/AnimatedGradient";
import { EASE } from "@/lib/motion";

// Importar imagens
import heroDashboard from "./assets/hero-dashboard-2.jpg";
import teamWorking from "./assets/team-working.png";
import chatcleanLogo from "/Logo ChatClean.svg";

// Importar logos dos clientes reais
import bonesRamalho from "./assets/bones-ramalho.jpg";
import dStore from "./assets/d-store.png";
import grupoDuraMais from "./assets/grupo-duramais.jpg";
import lautoCargo from "./assets/lauto-cargo.png";
import ligaDooH from "./assets/liga-dooh.png";
import terraInvestImoveis from "./assets/terra-invest-imoveis.jpg";
import wishBones from "./assets/wish-bones.jpg";

function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [text, setText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [loopNum, setLoopNum] = useState(0);
  const [typingSpeed, setTypingSpeed] = useState(150);

  const words = ["WhatsApp", "Instagram", "Vendas"];

  const features = [
    {
      icon: BarChart3,
      title: "Dashboard Inteligente",
      description: "Acompanhe métricas em tempo real e tome decisões baseadas em dados",
      color: "bg-blue-500"
    },
    {
      icon: MessageCircle,
      title: "Atendimento Omnichannel",
      description: "WhatsApp, Instagram, Facebook em um só lugar",
      color: "bg-green-500"
    },
    {
      icon: Users,
      title: "CRM Avançado",
      description: "Histórico completo de cada cliente e gestão de relacionamento",
      color: "bg-purple-500"
    },
    {
      icon: Zap,
      title: "ChatBot com IA",
      description: "Automação inteligente 24/7 para seus clientes",
      color: "bg-yellow-500"
    },
    {
      icon: Clock,
      title: "Gestão de Tarefas",
      description: "Organize e acompanhe sua equipe de atendimento",
      color: "bg-red-500"
    },
    {
      icon: CheckCircle,
      title: "Campanhas Automáticas",
      description: "Mensagens no momento certo para seus clientes",
      color: "bg-indigo-500"
    },
    {
      icon: BarChart3,
      title: "Relatórios Detalhados",
      description: "Insights para tomar decisões estratégicas",
      color: "bg-orange-500"
    },
    {
      icon: Smartphone,
      title: "App Mobile",
      description: "Atenda seus clientes de qualquer lugar",
      color: "bg-pink-500"
    },
  ];

  // TODO: substituir por depoimentos verificados de clientes reais (com foto e link).
  // Os textos abaixo sao genericos enquanto coletamos depoimentos autorizados;
  // os nomes/empresas foram trocados por clientes reais ja exibidos na parede de logos.
  const testimonials = [
    {
      name: "Equipe L'auto Cargo",
      company: "L'auto Cargo",
      role: "Operacao de Atendimento",
      content:
        "Centralizamos WhatsApp, Instagram e Facebook em um so painel. O time ganhou velocidade e a esteira de atendimento ficou bem mais previsivel.",
      rating: 5,
    },
    {
      name: "Equipe Terra Invest Imoveis",
      company: "Terra Invest Imoveis",
      role: "Comercial",
      content:
        "Com o CRM e o ChatBot da ChatClean conseguimos qualificar leads 24/7 e nao perder mais conversa por falta de resposta. Aumentamos a conversao do funil.",
      rating: 5,
    },
    {
      name: "Equipe Grupo Dura Mais",
      company: "Grupo Dura Mais",
      role: "Atendimento ao Cliente",
      content:
        "A migracao para a API Oficial do WhatsApp ficou simples e os relatorios ajudam a entender onde melhorar a operacao todo mes.",
      rating: 5,
    },
  ];

  const backgroundHero = {
    background:
      "linear-gradient(312deg,rgba(0, 145, 97, 1) 0%, rgba(0, 189, 66, 1) 42%, rgba(0, 230, 184, 1) 100%)",
    height: "100%",
    width: "100%",
  };

  const LoginModal = () => (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
        isLoginModalOpen ? "opacity-100 visible" : "opacity-0 invisible"
      }`}
    >
      {/* Overlay com desfoque */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
        onClick={() => setIsLoginModalOpen(false)}
      />

      {/* Conteúdo do Modal */}
      <div
        className={`relative w-full max-w-md transform transition-all duration-300 ${
          isLoginModalOpen
            ? "scale-100 translate-y-0"
            : "scale-95 translate-y-4"
        } rounded-3xl bg-white p-8 shadow-2xl dark:bg-slate-900 border border-gray-100 dark:border-slate-800`}
      >
        {/* Botão Fechar */}
        <button
          onClick={() => setIsLoginModalOpen(false)}
          className="absolute right-6 top-6 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="h-5 w-5 text-gray-400" />
        </button>

        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">
            Acesse sua conta
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Escolha a versão da plataforma que deseja utilizar:
          </p>
        </div>

        <div className="space-y-4">
          {/* Opção App 1 */}
          <a
            href="https://app.chatclean.com.br/"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center p-5 border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-800/50 rounded-2xl hover:border-blue-500 hover:shadow-xl hover:shadow-blue-50/50 dark:hover:shadow-none transition-all duration-300"
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white shadow-lg shadow-blue-200 dark:shadow-none transition-transform group-hover:scale-110">
              <span className="text-lg font-bold">1</span>
            </div>
            <div className="ml-4">
              <h4 className="font-bold text-gray-800 dark:text-white text-lg">
                ChatClean
              </h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Servidor 1
              </p>
            </div>
          </a>

          {/* Opção App 2 */}
          <a
            href="https://app2.chatclean.com.br/"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center p-5 border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-800/50 rounded-2xl hover:border-green-500 hover:shadow-xl hover:shadow-green-50/50 dark:hover:shadow-none transition-all duration-300"
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-green-500 text-white shadow-lg shadow-green-200 dark:shadow-none transition-transform group-hover:scale-110">
              <span className="text-lg font-bold">2</span>
            </div>
            <div className="ml-4">
              <h4 className="font-bold text-gray-800 dark:text-white text-lg">
                ChatClean
              </h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Servidor 2
              </p>
            </div>
          </a>
        </div>

        <p className="mt-8 text-center text-xs text-gray-400">
          Problemas com o acesso?{" "}
          <a
            href="#contato"
            className="underline hover:text-green-500 transition-colors"
          >
            Fale com o suporte
          </a>
          .
        </p>
      </div>
    </div>
  );

  useEffect(() => {
    const handleType = () => {
      const i = loopNum % words.length;
      const fullText = words[i];
      setText(isDeleting ? fullText.substring(0, text.length - 1) : fullText.substring(0, text.length + 1));
      setTypingSpeed(isDeleting ? 40 : 80);
      if (!isDeleting && text === fullText) {
        setTimeout(() => setIsDeleting(true), 2000);
      } else if (isDeleting && text === "") {
        setIsDeleting(false);
        setLoopNum(loopNum + 1);
      }
    };
    const timer = setTimeout(handleType, typingSpeed);
    return () => clearTimeout(timer);
  }, [text, isDeleting, loopNum, typingSpeed]);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-transparent backdrop-blur-sm border-b border-white/5">
        <div className="mx-auto sm:px-20">
          <div className="flex justify-between items-center h-20">
            {" "}
            {/* Logo */}
            <div className="flex items-center">
              <a
                href="#home"
                className="transition-transform hover:scale-105 active:scale-95 duration-200"
              >
                <img
                  src={chatcleanLogo}
                  alt="ChatClean"
                  className="h-15 w-aut"
                />
              </a>
            </div>
            {/* Desktop Menu */}
            <nav className="hidden md:flex items-center bg-gray-50/50 rounded-full px-2 py-1 shadow-sm">
              {[
                { name: "Home", href: "#home" },
                { name: "Funcionalidades", href: "#funcionalidades" },
                { name: "Sobre", href: "/sobre", isLink: true },
                { name: "Blog", href: "/blog", isLink: true },
                { name: "Carreiras", href: "/carreiras", isLink: true },
                { name: "FAQ", href: "#faq" },
                { name: "Contato", href: "#contato" },
              ].map((item) =>
                item.isLink ? (
                  <Link
                    key={item.name}
                    to={item.href}
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-green-600 transition-all rounded-full hover:bg-green-300 hover:shadow-sm"
                  >
                    {item.name}
                  </Link>
                ) : (
                  <a
                    key={item.name}
                    href={item.href}
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-green-600 transition-all rounded-full hover:bg-green-300 hover:shadow-sm"
                  >
                    {item.name}
                  </a>
                ),
              )}
            </nav>
            {/* Botão Área do Cliente */}
            <div className="hidden md:flex items-center">
              <Button
                variant="light"
                onClick={() => setIsLoginModalOpen(true)}
                className="w-full sm:w-auto bg-green-500 hover:bg-green-600 hover:scale-105 active:scale-95 transition-all duration-200 shadow-xl shadow-green-700 text-white px-8 h-14 rounded-2xl cursor-pointer"
              >
                <Users className="h-4 w-4 text-gray-50 group-hover:text-green-600 transition-colors" />
                <span className="text-sm font-semibold">Área do Cliente</span>
                <ChevronDown className="h-4 w-4 opacity-80 group-hover:rotate-180 transition-transform duration-300" />
              </Button>
            </div>
            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>

          {/* Mobile Menu - Animado e Moderno */}
          {isMenuOpen && (
            <div className="md:hidden py-6 bg-white border-t border-gray-50 animate-in fade-in slide-in-from-top-4 duration-300">
              <nav className="flex flex-col space-y-2">
                {[
                  { name: "Home", href: "#home" },
                  { name: "Funcionalidades", href: "#funcionalidades" },
                  { name: "Sobre", href: "/sobre", isLink: true },
                  { name: "Blog", href: "/blog", isLink: true },
                  { name: "Carreiras", href: "/carreiras", isLink: true },
                  { name: "FAQ", href: "#faq" },
                  { name: "Contato", href: "#contato" },
                ].map((item) =>
                  item.isLink ? (
                    <Link
                      key={item.name}
                      to={item.href}
                      className="px-4 py-3 text-base font-medium text-gray-700 hover:bg-green-50 hover:text-green-600 rounded-xl transition-colors"
                    >
                      {item.name}
                    </Link>
                  ) : (
                    <a
                      key={item.name}
                      href={item.href}
                      className="px-4 py-3 text-base font-medium text-gray-700 hover:bg-green-50 hover:text-green-600 rounded-xl transition-colors"
                    >
                      {item.name}
                    </a>
                  ),
                )}
                <div className="pt-4 px-4">
                  <Button
                    onClick={() => setIsLoginModalOpen(true)}
                    className="w-full justify-center bg-green-600 hover:bg-green-700 text-white py-6 rounded-xl text-lg shadow-lg shadow-green-100"
                  >
                    Área do Cliente
                  </Button>
                </div>
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section
        id="home"
        style={backgroundHero}
        className="relative overflow-hidden pt-50 py-50 "
      >
        {/* Gradient mesh animado (blobs) */}
        <AnimatedGradient />

        {/* Detalhe abstrato de fundo para modernizar */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-35 items-center">
            {/* Coluna de Texto */}
            <motion.div
              className="text-left"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE.out }}
            >
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1, ease: EASE.out }}
              >
                <Badge className="mb-6 px-4 py-1.5 bg-green-100/80 text-green-600 border-none rounded-full text-sm font-semibold backdrop-blur-sm">
                  ✨ #1 Plataforma de CRM no Brasil
                </Badge>
              </motion.div>

              <motion.h1
                className="text-5xl lg:text-7xl font-extrabold text-white mb-6 tracking-tight leading-[1.1]"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.15, ease: EASE.out }}
              >
                CRM e ChatBot <br />
                <span className="flex items-center gap-3 flex-wrap">
                  <span>para</span>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-blue-800 border-r-4 border-blue-600 pr-2 animate-pulse">
                    {text}
                  </span>
                </span>
              </motion.h1>

              <motion.p
                className="text-lg text-white mb-10 leading-relaxed max-w-xl"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3, ease: EASE.out }}
              >
                Centralize WhatsApp, Instagram, Facebook e Telegram em um único
                CRM com
                <span className="font-semibold text-blue-700">
                  {" "}
                  API Oficial do WhatsApp
                </span>
                . Atenda mais rápido, automatize com IA e venda mais — com
                multiatendimento real.
              </motion.p>

              <motion.div
                className="flex flex-col sm:flex-row gap-4 items-center"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.45, ease: EASE.out }}
              >
                <motion.a
                  href="https://api.whatsapp.com/send?phone=5584996950105&text=Ol%C3%A1%2C+eu+vim+pelo+site"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto"
                  whileHover={{ y: -3, scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.2, ease: EASE.out }}
                >
                  <Button
                    size="lg"
                    className="w-full sm:w-auto bg-green-500 hover:bg-green-600 transition-all duration-200 shadow-xl shadow-green-700 text-white px-8 h-14 rounded-2xl cursor-pointer btn-shiny"
                  >
                    <Play className="h-5 w-5 mr-2 fill-current" />
                    Agendar Demo Gratuita
                  </Button>
                </motion.a>

                <motion.a
                  href="#funcionalidades"
                  className="w-full sm:w-auto"
                  whileHover={{ y: -3, scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.2, ease: EASE.out }}
                >
                  <Button
                    size="lg"
                    className="w-full sm:w-auto bg-green-500 hover:bg-green-600 transition-all duration-200 shadow-xl shadow-green-700 text-white px-8 h-14 rounded-2xl cursor-pointer"
                  >
                    Conhecer Recursos
                    <ArrowRight className="h-5 w-5 ml-2" />
                  </Button>
                </motion.a>
              </motion.div>

              {/* Prova social com logos reais */}
              <motion.div
                className="mt-10 pt-8 border-t border-white/10 flex items-center gap-4"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.6, ease: EASE.out }}
              >
                <div className="flex -space-x-3">
                  {[lautoCargo, dStore, wishBones, grupoDuraMais].map(
                    (logo, i) => (
                      <motion.img
                        key={i}
                        src={logo}
                        alt="Cliente ChatClean"
                        className="w-12 h-12 rounded-full border-2 border-blue-500 bg-white object-contain p-1 shadow-lg"
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{
                          duration: 0.4,
                          delay: 0.7 + i * 0.08,
                          ease: EASE.out,
                        }}
                        whileHover={{ y: -4, scale: 1.1, zIndex: 10 }}
                      />
                    ),
                  )}
                </div>
                <p className="text-sm text-white/70 font-medium">
                  <span className="text-white font-bold">
                    +<AnimatedCounter to={100} duration={1400} />
                    {" "}empresas
                  </span>{" "}
                  já escalam com ChatClean
                </p>
              </motion.div>
            </motion.div>

            {/* Coluna da Imagem/Dashboard */}
            <motion.div
              className="relative group"
              initial={{ opacity: 0, scale: 0.94, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.3, ease: EASE.out }}
            >
              {/* Efeito de brilho atrás da imagem */}
              <div className="absolute -inset-5 bg-gradient-to-r from-blue-400 to-blue-500 rounded-[2rem] blur-2xl opacity-60 group-hover:opacity-30 transition-opacity duration-500" />

              <div className="relative border border-white/50 bg-white/50 backdrop-blur-sm p-3 rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] transition-transform duration-500 hover:-translate-y-2 floaty">
                <img
                  src={heroDashboard}
                  alt="Dashboard ChatClean"
                  className="rounded-[1.8rem] w-full h-auto object-cover shadow-inner"
                />

                {/* Card Flutuante sutil (Opcional - Estilo SaaS moderno) */}
                <div className="absolute -bottom-6 -left-6 bg-white p-4 rounded-2xl shadow-xl border border-slate-100 hidden xl:block animate-bounce-slow">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                      <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                        Status
                      </p>
                      <p className="text-sm font-bold text-slate-800">
                        Atendimento Ativo
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Value Proposition */}
      <section className="py-20 bg-white relative overflow-hidden">
        {/* dot pattern decorativo */}
        <div className="absolute inset-0 bg-dot opacity-40 pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <Reveal className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              Por que mais de{" "}
              <span className="text-gradient">
                <AnimatedCounter to={100} duration={1500} suffix="+" />
              </span>{" "}
              empresas escolhem a ChatClean?
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Transforme seu atendimento com a plataforma mais completa do
              mercado
            </p>
          </Reveal>

          <StaggerGroup className="grid md:grid-cols-3 gap-8">
            <StaggerItem className="text-center group">
              <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 group-hover:bg-green-200">
                <Zap className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Eficiência</h3>
              <p className="text-gray-600">
                Aumente a produtividade da sua equipe em até{" "}
                <span className="font-bold text-green-600">
                  <AnimatedCounter to={100} duration={1300} suffix="%" />
                </span>
              </p>
            </StaggerItem>
            <StaggerItem className="text-center group">
              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 group-hover:bg-blue-200">
                <MessageCircle className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Integração</h3>
              <p className="text-gray-600">
                Todos os canais em um só lugar, sem complicação
              </p>
            </StaggerItem>
            <StaggerItem className="text-center group">
              <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 group-hover:bg-purple-200">
                <BarChart3 className="h-8 w-8 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Inteligência</h3>
              <p className="text-gray-600">
                IA que aprende com seus clientes e otimiza resultados
              </p>
            </StaggerItem>
          </StaggerGroup>

          {/* Parede de Logos */}
          <Reveal className="mt-16 pt-16 border-t border-gray-200">
            <div className="text-center mb-12">
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">
                Parceiros de Sucesso
              </p>
              <h3 className="text-2xl font-bold text-gray-900">
                Líderes de mercado que escolheram a excelência
              </h3>
            </div>
            <div className="logos-container">
              <div className="logos-track">
                {/* Primeira sequência */}
                <img src={lautoCargo} alt="L'auto Cargo" />
                <img src={dStore} alt="D Store" />
                <img src={terraInvestImoveis} alt="Terra Invest Imóveis" />
                <img src={bonesRamalho} alt="Bonés Ramalho" />
                <img src={wishBones} alt="Wish Bones" />
                <img src={grupoDuraMais} alt="Grupo Dura Mais" />
                <img src={ligaDooH} alt="Liga DooH" />

                {/* Segunda sequência idêntica para loop infinito */}
                <img src={lautoCargo} alt="L'auto Cargo" />
                <img src={dStore} alt="D Store" />
                <img src={terraInvestImoveis} alt="Terra Invest Imóveis" />
                <img src={bonesRamalho} alt="Bonés Ramalho" />
                <img src={wishBones} alt="Wish Bones" />
                <img src={grupoDuraMais} alt="Grupo Dura Mais" />
                <img src={ligaDooH} alt="Liga DooH" />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Features Section */}
      <section id="funcionalidades" className="py-32 bg-white relative overflow-hidden">
        {/* gradient blob decorativo */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-green-100/40 via-blue-100/30 to-purple-100/40 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 relative">
          <Reveal className="text-center max-w-3xl mx-auto mb-20">
            <span className="inline-block bg-green-50 text-green-700 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full mb-4">
              Plataforma completa
            </span>
            <h2 className="text-4xl lg:text-5xl font-black text-gray-900 mb-6 tracking-tight">
              Funcionalidades <span className="text-gradient">Incríveis</span>
            </h2>
            <p className="text-xl text-gray-500">
              Tecnologia desenhada para transformar cada interação em uma
              oportunidade de negócio.
            </p>
          </Reveal>

          <StaggerGroup className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <StaggerItem
                key={index}
                className="modern-card glow-ring card-3d p-8 rounded-[2rem] text-left relative overflow-hidden"
              >
                <motion.div
                  className={`w-14 h-14 ${feature.color} rounded-2xl flex items-center justify-center text-white mb-6 shadow-xl shadow-gray-200`}
                  whileHover={{ rotate: -8, scale: 1.08 }}
                  transition={{ duration: 0.3, ease: EASE.out }}
                >
                  <feature.icon size={28} />
                </motion.div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">
                  {feature.title}
                </h3>
                <p className="text-gray-500 leading-relaxed">
                  {feature.description}
                </p>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* Demo Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <Reveal>
              <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-6">
                Veja a ChatClean em <span className="text-gradient">Ação</span>
              </h2>
              <p className="text-xl text-gray-600 mb-8">
                Descubra como nossa plataforma pode revolucionar o atendimento
                da sua empresa. Agende uma demonstração personalizada e veja
                todos os recursos funcionando.
              </p>
              <motion.a
                href="https://api.whatsapp.com/send?phone=5584996950105&text=Ol%C3%A1%2C+eu+vim+pelo+site"
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ y: -3, scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.2, ease: EASE.out }}
                className="inline-block"
              >
                <Button
                  size="lg"
                  className="bg-green-600 hover:bg-green-700 btn-shiny"
                >
                  <Play className="h-5 w-5 mr-2" />
                  Solicitar Demonstração Personalizada
                </Button>
              </motion.a>
            </Reveal>
            <Reveal variant="right" delay={0.15}>
              <div className="relative group">
                <div className="absolute -inset-4 bg-gradient-to-r from-green-400 via-blue-400 to-purple-400 rounded-3xl blur-2xl opacity-30 group-hover:opacity-50 transition-opacity duration-500" />
                <img
                  src={teamWorking}
                  alt="Equipe trabalhando com ChatClean"
                  className="relative rounded-2xl shadow-xl floaty"
                />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-gray-50 relative overflow-hidden">
        <div className="absolute inset-0 bg-dot opacity-30 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <Reveal className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              O que Nossos Clientes Dizem
            </h2>
            <p className="text-xl text-gray-600">
              Histórias reais de transformação e sucesso
            </p>
          </Reveal>

          <StaggerGroup className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <StaggerItem key={index}>
                <Card className="card-3d hover:shadow-2xl transition-all duration-500 border-gray-100 h-full bg-white/70 backdrop-blur-sm">
                  <CardHeader>
                    <div className="flex items-center space-x-1 mb-2">
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
                          <Star className="h-5 w-5 text-yellow-400 fill-current" />
                        </motion.div>
                      ))}
                    </div>
                    <CardDescription className="text-base italic leading-relaxed">
                      "{testimonial.content}"
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div>
                      <p className="font-semibold">{testimonial.name}</p>
                      <p className="text-sm text-gray-600">
                        {testimonial.role}
                      </p>
                      <p className="text-sm text-green-600 font-medium">
                        {testimonial.company}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-20 bg-gradient-to-br from-green-600 via-green-500 to-blue-600 text-white relative overflow-hidden">
        {/* Light beams decorativos */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-1 h-full bg-gradient-to-b from-white/20 to-transparent rotate-12" />
          <div className="absolute top-0 right-1/3 w-1 h-full bg-gradient-to-b from-white/15 to-transparent -rotate-6" />
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
        </div>

        <Reveal className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8 relative">
          <h2 className="text-3xl lg:text-5xl font-bold mb-6 tracking-tight">
            Pronto para Revolucionar seu Atendimento?
          </h2>
          <p className="text-xl mb-8 opacity-90">
            Junte-se a diversas empresas que já transformaram seus resultados
            com a ChatClean
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <motion.a
              href="https://api.whatsapp.com/send?phone=5584996950105&text=Ol%C3%A1%2C+eu+vim+pelo+site"
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ y: -3, scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.2, ease: EASE.out }}
            >
              <Button
                size="lg"
                className="bg-white text-green-600 hover:bg-gray-100 btn-shiny shadow-2xl"
              >
                Agendar Demo Gratuita
              </Button>
            </motion.a>
            <motion.a
              href="https://api.whatsapp.com/send?phone=5584996950105&text=Ol%C3%A1%2C+eu+vim+pelo+site"
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ y: -3, scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.2, ease: EASE.out }}
            >
              <Button
                size="lg"
                variant="outline"
                className="border-white text-white hover:bg-white hover:text-green-600 bg-transparent"
              >
                <Phone className="h-5 w-5 mr-2" />
                Falar com Especialista
              </Button>
            </motion.a>
          </div>
        </Reveal>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              Perguntas Frequentes
            </h2>
            <p className="text-xl text-gray-600">
              Sem surpresas, sem complicações. Cancela quando quiser e reativa
              quando precisar, sem burocracia.
            </p>
          </Reveal>

          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem
              value="item-seo-1"
              className="bg-white rounded-lg border"
            >
              <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                <span className="text-lg font-medium">
                  O que é um CRM para WhatsApp?
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <p className="text-gray-600">
                  Um CRM para WhatsApp é uma plataforma que conecta o WhatsApp
                  Business ao seu processo comercial: registra cada conversa,
                  organiza leads em um funil de vendas (Kanban), permite que
                  vários atendentes usem o mesmo número e automatiza
                  mensagens. Na ChatClean, o CRM é integrado à API Oficial do
                  WhatsApp e ainda centraliza Instagram, Facebook e Telegram no
                  mesmo painel.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem
              value="item-seo-2"
              className="bg-white rounded-lg border"
            >
              <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                <span className="text-lg font-medium">
                  O que é a API Oficial do WhatsApp e por que ela importa?
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <p className="text-gray-600">
                  A API Oficial do WhatsApp Business (também chamada de Cloud
                  API) é a versão homologada pela Meta para empresas. Permite
                  ter um único número com vários atendentes, envio de templates
                  aprovados, integração com sistemas e zero risco de
                  banimento. A ChatClean é integrada nativamente à API Oficial
                  e cuida de toda a configuração com você.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem
              value="item-seo-3"
              className="bg-white rounded-lg border"
            >
              <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                <span className="text-lg font-medium">
                  Quanto custa a API Oficial do WhatsApp?
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <p className="text-gray-600">
                  A Meta cobra por conversa iniciada, com valores que variam
                  por categoria (utilidade, marketing, autenticação, serviço) e
                  pelo país do destinatário. No Brasil, conversas de utilidade
                  custam aproximadamente R$ 0,045 e de marketing cerca de
                  R$ 0,35 por sessão. A ChatClean inclui essa orientação na
                  proposta personalizada e ajuda a otimizar o uso de templates
                  para reduzir custos.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem
              value="item-seo-4"
              className="bg-white rounded-lg border"
            >
              <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                <span className="text-lg font-medium">
                  Como ter vários atendentes em um único número de WhatsApp?
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <p className="text-gray-600">
                  Com a API Oficial e a ChatClean, sua empresa tem um único
                  número de WhatsApp com login individual para cada atendente,
                  filas, departamentos, transferência de conversa, histórico
                  centralizado e relatórios por colaborador — sem precisar de
                  vários celulares ou chips.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem
              value="item-seo-5"
              className="bg-white rounded-lg border"
            >
              <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                <span className="text-lg font-medium">
                  Qual a diferença entre WhatsApp Business e API Oficial?
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <p className="text-gray-600">
                  O WhatsApp Business comum (aplicativo) é gratuito e funciona
                  para autônomos e microempresas, mas só permite até 4
                  dispositivos no mesmo número. A API Oficial é a solução para
                  empresas que precisam de multiatendimento real, automação
                  com chatbot, integração com CRM e envio de campanhas em
                  escala — sem risco de bloqueio.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem
              value="item-seo-6"
              className="bg-white rounded-lg border"
            >
              <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                <span className="text-lg font-medium">
                  Como integrar o WhatsApp ao meu CRM?
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <p className="text-gray-600">
                  Na ChatClean, a integração é nativa: você não precisa
                  instalar plugins ou contratar fornecedores extras. Nossa
                  equipe ativa a API Oficial do WhatsApp para o seu número,
                  configura templates, importa contatos e treina o time.
                  Geralmente o onboarding é concluído em poucos dias úteis.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem
              value="item-1"
              className="bg-white rounded-lg border"
            >
              <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                <span className="text-lg font-medium">
                  Existe prazo de fidelidade?
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <p className="text-gray-600">
                  <strong>Sem surpresas, sem complicações.</strong> Cancela
                  quando quiser e reativa quando precisar, sem burocracia.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem
              value="item-2"
              className="bg-white rounded-lg border"
            >
              <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                <span className="text-lg font-medium">
                  O que são canais de comunicação?
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <p className="text-gray-600">
                  Canais de comunicação são as diferentes plataformas onde você
                  atende seus clientes, como WhatsApp, Instagram, Facebook
                  Messenger, Telegram, e outros. Nossa plataforma centraliza
                  todos esses canais em um só lugar.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem
              value="item-3"
              className="bg-white rounded-lg border"
            >
              <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                <span className="text-lg font-medium">
                  O que acontece se eu não pagar a mensalidade do plano?
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <p className="text-gray-600">
                  Caso não seja efetuado o pagamento da mensalidade, o acesso à
                  plataforma será suspenso temporariamente. Seus dados ficam
                  seguros e podem ser recuperados assim que a situação for
                  regularizada.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem
              value="item-4"
              className="bg-white rounded-lg border"
            >
              <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                <span className="text-lg font-medium">
                  Vocês cobram multa de cancelamento?
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <p className="text-gray-600">
                  Não cobramos multa de cancelamento. Você pode cancelar seu
                  plano a qualquer momento sem custos adicionais, mantendo nossa
                  política de transparência e flexibilidade.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem
              value="item-5"
              className="bg-white rounded-lg border"
            >
              <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                <span className="text-lg font-medium">
                  Como a ChatClean pode aprimorar meu atendimento ao cliente?
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <p className="text-gray-600">
                  A ChatClean centraliza todos os seus canais de atendimento,
                  oferece automação inteligente com chatbots, CRM integrado para
                  histórico completo dos clientes, e relatórios detalhados para
                  otimizar sua estratégia de atendimento.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem
              value="item-6"
              className="bg-white rounded-lg border"
            >
              <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                <span className="text-lg font-medium">
                  A ChatClean se integra em quais canais?
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <p className="text-gray-600">
                  Integramos com WhatsApp, Instagram Direct, Facebook Messenger,
                  Telegram, webchat para seu site, e diversos outros canais.
                  Também oferecemos integrações com plataformas como Hotmart,
                  Asaas, Trello e muitas outras.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem
              value="item-7"
              className="bg-white rounded-lg border"
            >
              <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                <span className="text-lg font-medium">
                  Consigo responder mensagens dos clientes no direct, sem sair
                  da ChatClean?
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <p className="text-gray-600">
                  Sim! Você pode responder mensagens de todos os canais
                  integrados diretamente pela plataforma ChatClean, sem precisar
                  alternar entre diferentes aplicativos ou abas do navegador.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem
              value="item-8"
              className="bg-white rounded-lg border"
            >
              <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                <span className="text-lg font-medium">
                  Porque vocês não possuem planos no site?
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <p className="text-gray-600">
                  Cada empresa tem necessidades únicas. Por isso, preferimos
                  criar propostas personalizadas que atendam exatamente às suas
                  demandas, garantindo que você pague apenas pelo que realmente
                  precisa e usa.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      {/* Footer */}
      <footer id="contato" className="bg-gray-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <img src={chatcleanLogo} alt="ChatClean" className="h-8 w-10" />
                <span className="text-xl font-bold">ChatClean</span>
              </div>
              <p className="text-gray-400 mb-4">
                A plataforma de CRM e ChatBot mais completa do Brasil
              </p>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Phone className="h-4 w-4" />
                  <span>+55 84 9695-0105</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Mail className="h-4 w-4" />
                  <span>contato@chatclean.com.br</span>
                </div>
                <div className="flex items-center space-x-2">
                  <MapPin className="h-4 w-4" />
                  <span>Av Prudente de Morais, 5121, Natal-RN</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-4">Produto</h3>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <a href="#funcionalidades" className="hover:text-white">
                    Funcionalidades
                  </a>
                </li>
                <li>
                  <a href="#precos" className="hover:text-white">
                    Preços
                  </a>
                </li>
                <li>
                  <a href="#funcionalidades" className="hover:text-white">
                    Integrações
                  </a>
                </li>
                <li>
                  <Link to="/api-oficial-whatsapp" className="hover:text-white">
                    API Oficial WhatsApp
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-4">Empresa</h3>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <Link to="/sobre" className="hover:text-white">
                    Sobre
                  </Link>
                </li>
                <li>
                  <Link to="/blog" className="hover:text-white">
                    Blog
                  </Link>
                </li>
                <li>
                  <Link to="/carreiras" className="hover:text-white">
                    Carreiras
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-4">Suporte</h3>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <a href="#faq" className="hover:text-white">
                    FAQ
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Central de Ajuda
                  </a>
                </li>
                <li>
                  <a
                    href="https://api.whatsapp.com/send?phone=5584996950105&text=Ol%C3%A1%2C+eu+vim+pelo+site"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white"
                  >
                    Contato
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Status
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 mt-12 pt-8 text-center text-gray-400">
            <p>
              &copy; {new Date().getFullYear()} ChatClean. Todos os direitos
              reservados. CNPJ: 57.487.327/0001-57
            </p>
          </div>
        </div>
      </footer>

      {/* Login Modal */}
      <LoginModal />
      <ChatbotPopup />
    </div>
  );
}

export default App;
