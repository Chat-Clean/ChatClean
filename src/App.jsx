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
import "./App.css";
import ChatbotPopup from '@/components/ChatbotPopup';

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

  const words = ["Completo", "Robusto", "Eficaz"];

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

  const testimonials = [
    {
      name: "Maria Silva",
      company: "TechCorp",
      role: "Gerente de Atendimento",
      content:
        "A ChatClean revolucionou nosso atendimento. Aumentamos a eficiência em 300% e a satisfação dos clientes disparou.",
      rating: 5,
    },
    {
      name: "João Santos",
      company: "E-commerce Plus",
      role: "CEO",
      content:
        "Desde que implementamos a ChatClean, nosso time consegue atender 5x mais clientes com a mesma qualidade.",
      rating: 5,
    },
    {
      name: "Ana Costa",
      company: "Serviços Premium",
      role: "Diretora Comercial",
      content:
        "O ROI foi imediato. Em 3 meses já tínhamos recuperado o investimento e aumentado nossas vendas.",
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
        {/* Detalhe abstrato de fundo para modernizar */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-35 items-center">
            {/* Coluna de Texto */}
            <div className="text-left">
              <Badge className="mb-6 px-4 py-1.5 bg-green-100/80 text-green-600 border-none rounded-full text-sm font-semibold backdrop-blur-sm">
                ✨ #1 Plataforma de CRM no Brasil
              </Badge>

              <h1 className="text-5xl lg:text-7xl font-extrabold text-white mb-6 tracking-tight leading-[1.1]">
                CRM e ChatBot <br />
                <span className="flex items-center gap-3">
                  <span>Mais</span>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-blue-800 border-r-4 border-blue-600 pr-2 animate-pulse">
                    {text}
                  </span>
                </span>
              </h1>

              <p className="text-lg text-white mb-10 leading-relaxed max-w-xl">
                Centralize WhatsApp, Instagram e seus canais de atendimento em
                uma única
                <span className="font-semibold text-blue-700">
                  {" "}
                  solução inteligente
                </span>
                . Aumente a eficiência da sua equipe e venda mais com automação
                real.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 items-center">
                <a
                  href="https://api.whatsapp.com/send?phone=5584996950105&text=Ol%C3%A1%2C+eu+vim+pelo+site"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto"
                >
                  <Button
                    size="lg"
                    className="w-full sm:w-auto bg-green-500 hover:bg-green-600 hover:scale-105 active:scale-95 transition-all duration-200 shadow-xl shadow-green-700 text-white px-8 h-14 rounded-2xl cursor-pointer"
                  >
                    <Play className="h-5 w-5 mr-2 fill-current" />
                    Agendar Demo Gratuita
                  </Button>
                </a>

                <a href="#funcionalidades" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className="w-full sm:w-auto bg-green-500 hover:bg-green-600 hover:scale-105 active:scale-95 transition-all duration-200 shadow-xl shadow-green-700 text-white px-8 h-14 rounded-2xl cursor-pointer"
                  >
                    Conhecer Recursos
                    <ArrowRight className="h-5 w-5 ml-2" />
                  </Button>
                </a>
              </div>

              {/* Prova social com logos reais */}
              <div className="mt-10 pt-8 border-t border-white/10 flex items-center gap-4">
                <div className="flex -space-x-3">
                  {[lautoCargo, dStore, wishBones, grupoDuraMais].map(
                    (logo, i) => (
                      <img
                        key={i}
                        src={logo}
                        alt="Cliente ChatClean"
                        className="w-12 h-12 rounded-full border-2 border-blue-500 bg-white object-contain p-1 shadow-lg"
                      />
                    ),
                  )}
                </div>
                <p className="text-sm text-white/70 font-medium">
                  <span className="text-white font-bold">+100 empresas</span> já
                  escalam com ChatClean
                </p>
              </div>
            </div>

            {/* Coluna da Imagem/Dashboard */}
            <div className="relative group">
              {/* Efeito de brilho atrás da imagem */}
              <div className="absolute -inset-5 bg-gradient-to-r from-blue-400 to-blue-500 rounded-[2rem] blur-2xl opacity-60 group-hover:opacity-30 transition-opacity duration-500" />

              <div className="relative border border-white/50 bg-white/50 backdrop-blur-sm p-3 rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] transition-transform duration-500 hover:-translate-y-2">
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
            </div>
          </div>
        </div>
      </section>

      {/* Value Proposition */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              Por que mais de 30 empresas escolhem a ChatClean?
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Transforme seu atendimento com a plataforma mais completa do
              mercado
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Zap className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Eficiência</h3>
              <p className="text-gray-600">
                Aumente a produtividade da sua equipe em até 100%
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Integração</h3>
              <p className="text-gray-600">
                Todos os canais em um só lugar, sem complicação
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="h-8 w-8 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Inteligência</h3>
              <p className="text-gray-600">
                IA que aprende com seus clientes e otimiza resultados
              </p>
            </div>
          </div>

          {/* Parede de Logos */}
          <div className="mt-16 pt-16 border-t border-gray-200">
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
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="funcionalidades" className="py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-4xl lg:text-5xl font-black text-gray-900 mb-6">Funcionalidades Incríveis</h2>
            <p className="text-xl text-gray-500">Tecnologia desenhada para transformar cada interação em uma oportunidade de negócio.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="modern-card p-8 rounded-[2rem] text-left">
                <div className={`w-14 h-14 ${feature.color} rounded-2xl flex items-center justify-center text-white mb-6 shadow-xl shadow-gray-200`}>
                  <feature.icon size={28} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">{feature.title}</h3>
                <p className="text-gray-500 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-6">
                Veja a ChatClean em Ação
              </h2>
              <p className="text-xl text-gray-600 mb-8">
                Descubra como nossa plataforma pode revolucionar o atendimento
                da sua empresa. Agende uma demonstração personalizada e veja
                todos os recursos funcionando.
              </p>
              <a
                href="https://api.whatsapp.com/send?phone=5584996950105&text=Ol%C3%A1%2C+eu+vim+pelo+site"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button size="lg" className="bg-green-600 hover:bg-green-700">
                  <Play className="h-5 w-5 mr-2" />
                  Solicitar Demonstração Personalizada
                </Button>
              </a>
            </div>
            <div className="relative">
              <img
                src={teamWorking}
                alt="Equipe trabalhando com ChatClean"
                className="rounded-lg shadow-xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              O que Nossos Clientes Dizem
            </h2>
            <p className="text-xl text-gray-600">
              Histórias reais de transformação e sucesso
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center space-x-1 mb-2">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star
                        key={i}
                        className="h-5 w-5 text-yellow-400 fill-current"
                      />
                    ))}
                  </div>
                  <CardDescription className="text-base italic">
                    "{testimonial.content}"
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div>
                    <p className="font-semibold">{testimonial.name}</p>
                    <p className="text-sm text-gray-600">{testimonial.role}</p>
                    <p className="text-sm text-green-600">
                      {testimonial.company}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-20 bg-gradient-to-r from-green-600 to-blue-600 text-white">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl lg:text-4xl font-bold mb-6">
            Pronto para Revolucionar seu Atendimento?
          </h2>
          <p className="text-xl mb-8 opacity-90">
            Junte-se a diversas empresas que já transformaram seus resultados
            com a ChatClean
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://api.whatsapp.com/send?phone=5584996950105&text=Ol%C3%A1%2C+eu+vim+pelo+site"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                size="lg"
                className="bg-white text-green-600 hover:bg-gray-100"
              >
                Começar Agora - Grátis
              </Button>
            </a>
            <a
              href="https://api.whatsapp.com/send?phone=5584996950105&text=Ol%C3%A1%2C+eu+vim+pelo+site"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                size="lg"
                variant="outline"
                className="border-white text-white hover:bg-white hover:text-green-600 bg-transparent"
              >
                <Phone className="h-5 w-5 mr-2" />
                Falar com Especialista
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              Perguntas Frequentes
            </h2>
            <p className="text-xl text-gray-600">
              Sem surpresas, sem complicações. Cancela quando quiser e reativa
              quando precisar, sem burocracia.
            </p>
          </div>

          <Accordion type="single" collapsible className="space-y-4">
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
                  <a href="#" className="hover:text-white">
                    Integrações
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    API
                  </a>
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
              &copy; 2025 ChatClean. Todos os direitos reservados. CNPJ:
              57.487.327/0001-57
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
