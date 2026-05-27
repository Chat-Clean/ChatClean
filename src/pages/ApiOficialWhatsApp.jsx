import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button.jsx";
import {
  CheckCircle,
  ArrowRight,
  MessageCircle,
  Shield,
  Zap,
  Users,
  BarChart3,
  Phone,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

/**
 * Pagina pilar para SEO: /api-oficial-whatsapp
 * Alvo: rankear para "API oficial WhatsApp", "API WhatsApp Business",
 * "como integrar API oficial WhatsApp" e variacoes.
 */
export default function ApiOficialWhatsApp() {
  // Atualiza title e meta description ao montar (SPA)
  useEffect(() => {
    const previousTitle = document.title;
    document.title =
      "API Oficial do WhatsApp Business no Brasil | ChatClean";

    let metaDescription = document.querySelector('meta[name="description"]');
    const previousDescription = metaDescription
      ? metaDescription.getAttribute("content")
      : null;
    if (!metaDescription) {
      metaDescription = document.createElement("meta");
      metaDescription.setAttribute("name", "description");
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute(
      "content",
      "API Oficial do WhatsApp Business com a ChatClean: ative em poucos dias, multiatendimento com varios atendentes, integracao com CRM e ChatBot com IA. Saiba como funciona, quanto custa e como migrar.",
    );

    let canonical = document.querySelector('link[rel="canonical"]');
    const previousCanonical = canonical
      ? canonical.getAttribute("href")
      : null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute(
      "href",
      "https://chatclean.com.br/api-oficial-whatsapp",
    );

    // JSON-LD especifico da pagina
    const ldScript = document.createElement("script");
    ldScript.type = "application/ld+json";
    ldScript.id = "ld-api-oficial";
    ldScript.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      headline:
        "API Oficial do WhatsApp Business no Brasil — Guia Completo",
      description:
        "Guia completo da API Oficial do WhatsApp Business: o que e, como funciona, quanto custa e como ativar com a ChatClean.",
      author: { "@type": "Organization", name: "ChatClean" },
      publisher: {
        "@type": "Organization",
        name: "ChatClean",
        logo: {
          "@type": "ImageObject",
          url: "https://chatclean.com.br/chatclean.svg",
        },
      },
      mainEntityOfPage: "https://chatclean.com.br/api-oficial-whatsapp",
      datePublished: "2026-05-07",
      dateModified: "2026-05-07",
    });
    document.head.appendChild(ldScript);

    return () => {
      document.title = previousTitle;
      if (previousDescription !== null && metaDescription) {
        metaDescription.setAttribute("content", previousDescription);
      }
      if (previousCanonical !== null && canonical) {
        canonical.setAttribute("href", previousCanonical);
      }
      const existing = document.getElementById("ld-api-oficial");
      if (existing) existing.remove();
    };
  }, []);

  const beneficios = [
    {
      icon: Users,
      title: "Multiatendimento real",
      desc: "Um único número com vários atendentes, filas, departamentos e transferência de conversa.",
    },
    {
      icon: Shield,
      title: "Zero risco de banimento",
      desc: "API homologada pela Meta — adeus aos chips bloqueados e clones do WhatsApp Web.",
    },
    {
      icon: Zap,
      title: "ChatBot com IA",
      desc: "Atenda 24/7, qualifique leads automaticamente e escale conversas para humanos quando preciso.",
    },
    {
      icon: MessageCircle,
      title: "Templates aprovados",
      desc: "Envie campanhas, lembretes e notificações com modelos validados pela Meta.",
    },
    {
      icon: BarChart3,
      title: "Relatórios e métricas",
      desc: "Acompanhe tempo de resposta, conversões e desempenho por atendente em tempo real.",
    },
    {
      icon: CheckCircle,
      title: "Integração com seu CRM",
      desc: "Histórico do cliente, funil Kanban e automações conectadas ao seu processo comercial.",
    },
  ];

  const passos = [
    {
      n: "1",
      title: "Verificação do Facebook Business",
      desc: "Confirmamos sua empresa no Meta Business Manager (CNPJ + documentos).",
    },
    {
      n: "2",
      title: "Cadastro do número",
      desc: "Você escolhe um número novo ou migra um existente para a API Oficial.",
    },
    {
      n: "3",
      title: "Configuração da plataforma",
      desc: "Ativamos o ChatClean, criamos templates, departamentos e fluxos do ChatBot.",
    },
    {
      n: "4",
      title: "Treinamento do time",
      desc: "Onboarding com sua equipe e suporte 100% em português durante a implantação.",
    },
    {
      n: "5",
      title: "Go-live",
      desc: "Em poucos dias úteis seu time já está atendendo no canal oficial, com dados unificados.",
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Breadcrumb (SEO + UX) — compensate for fixed navbar */}
      <div className="pt-20" />
      <nav
        aria-label="Breadcrumb"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-sm text-gray-500"
      >
        <ol className="flex items-center gap-2">
          <li>
            <Link to="/" className="hover:text-green-600">
              Home
            </Link>
          </li>
          <li>/</li>
          <li className="text-gray-700 font-medium">
            API Oficial do WhatsApp
          </li>
        </ol>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
        <div className="max-w-4xl">
          <span className="inline-block bg-green-50 text-green-700 text-xs font-semibold px-3 py-1 rounded-full mb-6">
            API OFICIAL · WHATSAPP BUSINESS
          </span>
          <h1 className="text-4xl lg:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
            API Oficial do WhatsApp Business no Brasil
          </h1>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed">
            A ChatClean é integrada nativamente à{" "}
            <strong>API Oficial do WhatsApp</strong> (Cloud API da Meta).
            Tenha multiatendimento real, ChatBot com IA, CRM e relatórios em
            uma única plataforma — sem risco de banimento e com suporte 100%
            em português.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href="https://api.whatsapp.com/send?phone=5584996950105&text=Ol%C3%A1%2C+quero+ativar+a+API+Oficial+do+WhatsApp"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                size="lg"
                className="bg-green-600 hover:bg-green-700 text-white px-8 h-14 rounded-2xl"
              >
                Agendar Demonstração Gratuita
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </a>
            <a href="#como-funciona">
              <Button
                size="lg"
                variant="outline"
                className="border-gray-300 px-8 h-14 rounded-2xl"
              >
                Como funciona
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* O que é */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12">
          <div>
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-6">
              O que é a API Oficial do WhatsApp?
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              A API Oficial do WhatsApp Business — também chamada de{" "}
              <strong>WhatsApp Cloud API</strong> — é a versão homologada
              pela Meta para empresas que precisam atender em escala. Ela
              permite que vários atendentes usem o mesmo número, conecta o
              WhatsApp ao seu CRM e libera recursos de automação que o app
              comum não oferece.
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              É a única forma <strong>oficial e segura</strong> de operar
              WhatsApp em escala: empresas que tentam usar o WhatsApp Web ou
              clones (não oficiais) correm o risco de ter os números
              banidos pela Meta.
            </p>
            <p className="text-gray-700 leading-relaxed">
              Na ChatClean, cuidamos de toda a ativação para você — da
              homologação na Meta até o treinamento do time.
            </p>
          </div>
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
            <h3 className="text-xl font-bold text-gray-900 mb-6">
              Para quem é a API Oficial?
            </h3>
            <ul className="space-y-3">
              {[
                "Times comerciais com mais de 2 atendentes",
                "Operações de SAC e pós-venda",
                "E-commerces com volume alto de mensagens",
                "Clínicas, escolas, imobiliárias, escritórios",
                "Empresas com mais de 100 conversas por dia",
                "Negócios que querem campanhas em massa",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-gray-700">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Benefícios */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-12 text-center">
            Vantagens da API Oficial com ChatClean
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {beneficios.map((b, i) => (
              <div
                key={i}
                className="p-8 rounded-3xl border border-gray-100 hover:shadow-lg transition-shadow"
              >
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-4">
                  <b.icon className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  {b.title}
                </h3>
                <p className="text-gray-600 leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="bg-gray-50 py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4 text-center">
            Como ativar a API Oficial em 5 passos
          </h2>
          <p className="text-lg text-gray-600 text-center mb-12">
            Onboarding completo em poucos dias úteis, com a ChatClean
            cuidando de tudo.
          </p>
          <div className="space-y-4">
            {passos.map((p, i) => (
              <div
                key={i}
                className="flex gap-6 items-start bg-white p-6 rounded-2xl border border-gray-100"
              >
                <div className="flex-shrink-0 w-12 h-12 bg-green-600 text-white rounded-xl flex items-center justify-center font-bold text-lg">
                  {p.n}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">
                    {p.title}
                  </h3>
                  <p className="text-gray-600">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Preço */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-6">
            Quanto custa a API Oficial do WhatsApp?
          </h2>
          <p className="text-lg text-gray-600 mb-6 leading-relaxed">
            A Meta cobra por <strong>conversa iniciada</strong>, com valores
            que variam por categoria e país. Para o Brasil, em 2026, os
            valores médios praticados são:
          </p>
          <div className="overflow-x-auto rounded-2xl border border-gray-100">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-700 text-sm">
                <tr>
                  <th className="px-6 py-4 font-semibold">Categoria</th>
                  <th className="px-6 py-4 font-semibold">Quando é cobrada</th>
                  <th className="px-6 py-4 font-semibold">Custo médio (BR)</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                <tr className="border-t border-gray-100">
                  <td className="px-6 py-4">Utilidade</td>
                  <td className="px-6 py-4">
                    Lembretes, confirmações, atualizações de pedido
                  </td>
                  <td className="px-6 py-4">R$ 0,045 / conversa</td>
                </tr>
                <tr className="border-t border-gray-100 bg-gray-50/50">
                  <td className="px-6 py-4">Marketing</td>
                  <td className="px-6 py-4">
                    Campanhas, ofertas, novidades
                  </td>
                  <td className="px-6 py-4">R$ 0,35 / conversa</td>
                </tr>
                <tr className="border-t border-gray-100">
                  <td className="px-6 py-4">Autenticação</td>
                  <td className="px-6 py-4">Códigos OTP, login</td>
                  <td className="px-6 py-4">R$ 0,03 / conversa</td>
                </tr>
                <tr className="border-t border-gray-100 bg-gray-50/50">
                  <td className="px-6 py-4">Serviço</td>
                  <td className="px-6 py-4">
                    Resposta dentro da janela de 24h
                  </td>
                  <td className="px-6 py-4">Gratuito</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-gray-500 mt-4">
            * Valores aproximados, sujeitos a alteração pela Meta. A ChatClean
            inclui o detalhamento exato na proposta personalizada.
          </p>
        </div>
      </section>

      {/* CTA Final */}
      <section className="bg-gradient-to-r from-green-600 to-blue-600 text-white py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold mb-6">
            Pronto para ativar a API Oficial do WhatsApp?
          </h2>
          <p className="text-lg opacity-90 mb-8">
            Em uma conversa de 30 minutos a gente mostra o painel da
            ChatClean e como sua operação vai ficar com a API Oficial.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://api.whatsapp.com/send?phone=5584996950105&text=Ol%C3%A1%2C+quero+ativar+a+API+Oficial+do+WhatsApp"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                size="lg"
                className="bg-white text-green-600 hover:bg-gray-100"
              >
                <Phone className="h-5 w-5 mr-2" />
                Falar com Especialista
              </Button>
            </a>
            <Link to="/">
              <Button
                size="lg"
                variant="outline"
                className="border-white text-white hover:bg-white hover:text-green-600 bg-transparent"
              >
                Voltar para a Home
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
