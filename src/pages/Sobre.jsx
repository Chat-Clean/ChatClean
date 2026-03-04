import { Button } from "../components/ui/button";
import {
  ArrowLeft,
  Users,
  Target,
  TrendingUp,
  Award,
  Phone,
  Mail,
} from "lucide-react";
import { Link } from "react-router-dom";

// Importar imagens
import palestra1 from "@/assets/palestra-1.jpg";
import palestra2 from "@/assets/palestra-2.jpg";
import palestra3 from "@/assets/palestra-3.jpg";
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

export default function Sobre() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center py-4 gap-4">
            <Link
              to="/"
              className="flex items-center gap-2 text-green-600 hover:text-green-700 cursor-pointer"
            >
              <ArrowLeft className="h-5 w-5" />
              Voltar ao Site
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">
              Sobre a ChatClean
            </h1>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-24 bg-gradient-to-br from-gray-900 via-gray-800 to-green-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-7xl font-bold mb-8 leading-tight">
              Mais que Tecnologia,
              <span className="block text-green-400 mt-2">
                Transformação Completa
              </span>
            </h1>
            <p className="text-xl md:text-2xl mb-12 text-gray-200 leading-relaxed max-w-3xl mx-auto">
              A ChatClean não é apenas uma plataforma de CRM e ChatBot. Somos
              especialistas em transformação digital, consultoria empresarial e
              capacitação em vendas que geram resultados reais.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 text-lg cursor-pointer"
                onClick={() =>
                  window.open(
                    "https://api.whatsapp.com/send?phone=5584996950105&text=Ol%C3%A1%2C+eu+vim+pelo+site",
                    "_blank",
                  )
                }
              >
                <Phone className="h-5 w-5 mr-2" />
                Falar com Especialista
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="border-white text-gray-500 hover:bg-white hover:text-gray-900 px-8 py-4 text-lg cursor-pointer"
                onClick={() =>
                  window.open(
                    "https://api.whatsapp.com/send?phone=5584996950105&text=Ol%C3%A1%2C+eu+vim+pelo+site",
                    "_blank",
                  )
                }
              >
                <Mail className="h-5 w-5 mr-2" />
                Solicitar Proposta
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Nossa Missão */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                Nossa Missão
              </h2>
              <p className="text-lg text-gray-600 mb-6">
                Revolucionar a forma como empresas se relacionam com seus
                clientes, oferecendo não apenas tecnologia de ponta, mas também
                conhecimento estratégico e capacitação profissional.
              </p>
              <div className="grid grid-cols-2 gap-6">
                <div className="text-center">
                  <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Users className="h-8 w-8 text-green-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900">+30</h3>
                  <p className="text-sm text-gray-600">Empresas Atendidas</p>
                </div>
                <div className="text-center">
                  <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
                    <TrendingUp className="h-8 w-8 text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900">50%</h3>
                  <p className="text-sm text-gray-600">
                    Aumento Médio em Vendas
                  </p>
                </div>
              </div>
            </div>
            <div className="cards-carousel">
              <div className="cards-track">
                <div className="card-item">
                  <img src={consultoria3} alt="Consultoria ChatClean" />
                  <div className="card-overlay">
                    <h4 className="font-semibold mb-2">
                      Consultoria Estratégica
                    </h4>
                    <p className="text-sm">
                      Transformando processos empresariais
                    </p>
                  </div>
                </div>
                <div className="card-item">
                  <img src={consultoria4} alt="Reunião estratégica" />
                  <div className="card-overlay">
                    <h4 className="font-semibold mb-2">
                      Reuniões Estratégicas
                    </h4>
                    <p className="text-sm">
                      Planejamento e execução de resultados
                    </p>
                  </div>
                </div>
                <div className="card-item">
                  <img src={consultoria1} alt="Consultoria em ação" />
                  <div className="card-overlay">
                    <h4 className="font-semibold mb-2">Consultoria em Ação</h4>
                    <p className="text-sm">Implementação prática de soluções</p>
                  </div>
                </div>
                <div className="card-item">
                  <img src={consultoria2} alt="Equipe de consultores" />
                  <div className="card-overlay">
                    <h4 className="font-semibold mb-2">Equipe Especializada</h4>
                    <p className="text-sm">
                      Profissionais experientes e qualificados
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Consultoria Empresarial */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Consultoria Empresarial
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Transformamos processos, otimizamos resultados e capacitamos
              equipes para o sucesso sustentável.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <div className="bg-white p-8 rounded-xl shadow-lg">
              <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mb-6">
                <Target className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Estratégia de Vendas
              </h3>
              <p className="text-gray-600">
                Desenvolvemos estratégias personalizadas para maximizar
                conversões e otimizar o funil de vendas da sua empresa.
              </p>
            </div>

            <div className="bg-white p-8 rounded-xl shadow-lg">
              <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mb-6">
                <Users className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Gestão de Equipes
              </h3>
              <p className="text-gray-600">
                Capacitamos líderes e equipes para alcançar alta performance
                através de metodologias comprovadas.
              </p>
            </div>

            <div className="bg-white p-8 rounded-xl shadow-lg">
              <div className="bg-purple-100 w-16 h-16 rounded-full flex items-center justify-center mb-6">
                <TrendingUp className="h-8 w-8 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Transformação Digital
              </h3>
              <p className="text-gray-600">
                Implementamos soluções tecnológicas que revolucionam a
                experiência do cliente e aumentam a eficiência.
              </p>
            </div>
          </div>

          <div className="cards-carousel">
            <div className="cards-track">
              <div className="card-item">
                <img src={palestra2} alt="Palestra em andamento" />
                <div className="card-overlay">
                  <h4 className="font-semibold mb-2">
                    Palestras Motivacionais
                  </h4>
                  <p className="text-sm">
                    Inspirando equipes para alta performance
                  </p>
                </div>
              </div>
              <div className="card-item">
                <img src={palestra6} alt="Apresentação" />
                <div className="card-overlay">
                  <h4 className="font-semibold mb-2">Apresentações Técnicas</h4>
                  <p className="text-sm">Conhecimento aplicado na prática</p>
                </div>
              </div>
              <div className="card-item">
                <img src={palestra4} alt="Palestrante em ação" />
                <div className="card-overlay">
                  <h4 className="font-semibold mb-2">
                    Palestrante Especialista
                  </h4>
                  <p className="text-sm">
                    Experiência e conhecimento compartilhados
                  </p>
                </div>
              </div>
              <div className="card-item">
                <img src={palestra5} alt="Evento de capacitação" />
                <div className="card-overlay">
                  <h4 className="font-semibold mb-2">Eventos de Capacitação</h4>
                  <p className="text-sm">
                    Desenvolvimento profissional contínuo
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Palestras e Capacitação */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Palestras e Capacitação
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Eventos transformadores que capacitam profissionais e empresas
              para alcançar resultados extraordinários.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center mb-16">
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-6">
                Desmistificando Vendas
              </h3>
              <p className="text-lg text-gray-600 mb-6">
                Nossa palestra mais requisitada revela os segredos por trás de
                vendas de alta performance. Técnicas comprovadas, cases reais e
                metodologias que transformam vendedores em verdadeiros
                consultores.
              </p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-3">
                  <Award className="h-5 w-5 text-green-600" />
                  <span className="text-gray-700">
                    Técnicas de persuasão ética
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  <Award className="h-5 w-5 text-green-600" />
                  <span className="text-gray-700">Gestão de objeções</span>
                </li>
                <li className="flex items-center gap-3">
                  <Award className="h-5 w-5 text-green-600" />
                  <span className="text-gray-700">Fechamento de vendas</span>
                </li>
                <li className="flex items-center gap-3">
                  <Award className="h-5 w-5 text-green-600" />
                  <span className="text-gray-700">
                    Relacionamento duradouro
                  </span>
                </li>
              </ul>
            </div>
            <div className="cards-carousel">
              <div className="cards-track">
                <div className="card-item">
                  <img src={consultoria6} alt="Consultoria em ação" />
                  <div className="card-overlay">
                    <h4 className="font-semibold mb-2">
                      Metodologias Avançadas
                    </h4>
                    <p className="text-sm">Técnicas comprovadas de vendas</p>
                  </div>
                </div>
                <div className="card-item">
                  <img src={palestra5} alt="Equipe de consultores" />
                  <div className="card-overlay">
                    <h4 className="font-semibold mb-2">Treinamento Prático</h4>
                    <p className="text-sm">Aplicação real das técnicas</p>
                  </div>
                </div>
                <div className="card-item">
                  <img src={palestra6} alt="Consultoria ChatClean" />
                  <div className="card-overlay">
                    <h4 className="font-semibold mb-2">
                      Resultados Mensuráveis
                    </h4>
                    <p className="text-sm">Acompanhamento de performance</p>
                  </div>
                </div>
                <div className="card-item">
                  <img src={palestra7} alt="Reunião estratégica" />
                  <div className="card-overlay">
                    <h4 className="font-semibold mb-2">
                      Estratégias Personalizadas
                    </h4>
                    <p className="text-sm">
                      Soluções sob medida para sua empresa
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-green-600 to-blue-600 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Pronto para Transformar sua Empresa?
          </h2>
          <p className="text-xl mb-8">
            Agende uma consultoria gratuita e descubra como podemos revolucionar
            seus resultados.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://api.whatsapp.com/send?phone=5584996950105&text=Ol%C3%A1%2C+eu+vim+pelo+site"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                size="lg"
                className="bg-white text-green-600 hover:bg-gray-100 cursor-pointer"
              >
                <Phone className="h-5 w-5 mr-2" />
                Agendar Consultoria Gratuita
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
                className="border-white text-white hover:bg-white hover:text-green-600 bg-transparent cursor-pointer"
              >
                <Mail className="h-5 w-5 mr-2" />
                Solicitar Proposta
              </Button>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
