import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Shield } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

const SECTIONS = [
  {
    titulo: "1. Informações que Coletamos",
    texto: `Coletamos informações que você nos fornece diretamente ao criar uma conta, preencher formulários ou entrar em contato conosco, incluindo: nome completo, e-mail, telefone/WhatsApp, nome da empresa, cargo e outras informações de perfil.

Também coletamos automaticamente dados de uso da plataforma, como endereço IP, tipo de navegador, páginas acessadas, data e hora de acesso, e informações do dispositivo utilizado.`,
  },
  {
    titulo: "2. Como Usamos suas Informações",
    texto: `Utilizamos suas informações para:

• Fornecer, operar e melhorar nossos serviços de CRM e ChatBot;
• Processar transações e enviar avisos relacionados;
• Responder a comentários, perguntas e solicitações de suporte;
• Enviar comunicações técnicas, atualizações e alertas de segurança;
• Enviar comunicações de marketing, quando você autorizar;
• Monitorar e analisar tendências, uso e atividades relacionadas aos nossos serviços;
• Cumprir obrigações legais aplicáveis.`,
  },
  {
    titulo: "3. Compartilhamento de Informações",
    texto: `Não vendemos, alugamos ou compartilhamos suas informações pessoais com terceiros para fins comerciais próprios deles.

Podemos compartilhar suas informações nas seguintes situações:

• Com prestadores de serviços que nos auxiliam na operação da plataforma (ex: infraestrutura de nuvem, processamento de pagamentos), sempre sob acordos de confidencialidade;
• Quando exigido por lei, ordem judicial ou autoridade competente;
• Para proteger os direitos, propriedade ou segurança da ChatClean, nossos clientes ou terceiros;
• Em caso de fusão, aquisição ou venda de ativos, mediante aviso prévio.`,
  },
  {
    titulo: "4. Segurança dos Dados",
    texto: `Adotamos medidas técnicas e organizacionais para proteger suas informações contra acesso não autorizado, alteração, divulgação ou destruição, incluindo:

• Criptografia de dados em trânsito (TLS/HTTPS);
• Controle de acesso baseado em funções;
• Monitoramento contínuo de segurança;
• Backups regulares e planos de recuperação.

Nenhum método de transmissão pela Internet ou armazenamento eletrônico é 100% seguro, por isso não podemos garantir segurança absoluta.`,
  },
  {
    titulo: "5. Seus Direitos (LGPD)",
    texto: `Em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você tem o direito de:

• Confirmar a existência de tratamento de seus dados;
• Acessar seus dados pessoais;
• Corrigir dados incompletos, inexatos ou desatualizados;
• Solicitar a anonimização, bloqueio ou eliminação de dados desnecessários;
• Solicitar a portabilidade dos dados;
• Revogar o consentimento a qualquer momento;
• Solicitar informações sobre com quem compartilhamos seus dados.

Para exercer esses direitos, entre em contato pelo e-mail: contato@chatclean.com.br`,
  },
  {
    titulo: "6. Cookies e Tecnologias de Rastreamento",
    texto: `Utilizamos cookies e tecnologias similares para melhorar sua experiência, analisar o tráfego e personalizar conteúdo. Os tipos de cookies que utilizamos incluem:

• Cookies essenciais: necessários para o funcionamento básico do site;
• Cookies de desempenho: coletam informações anônimas sobre como o site é usado;
• Cookies de funcionalidade: permitem que o site lembre suas preferências;
• Cookies de marketing: usados para exibir anúncios relevantes.

Você pode controlar o uso de cookies nas configurações do seu navegador.`,
  },
  {
    titulo: "7. Retenção de Dados",
    texto: `Mantemos suas informações pelo tempo necessário para fornecer nossos serviços e cumprir obrigações legais. Quando você encerra sua conta, podemos reter certas informações conforme exigido por lei ou para fins legítimos de negócios, como resolver disputas ou fazer cumprir nossos acordos.`,
  },
  {
    titulo: "8. Alterações nesta Política",
    texto: `Podemos atualizar esta Política de Privacidade periodicamente. Notificaremos você sobre alterações significativas publicando a nova política nesta página e, quando apropriado, enviando uma notificação por e-mail. Recomendamos que você revise esta política regularmente.`,
  },
  {
    titulo: "9. Contato",
    texto: `Se tiver dúvidas sobre esta Política de Privacidade ou sobre o tratamento dos seus dados, entre em contato conosco:

ChatClean — CNPJ: 57.487.327/0001-57
Av. Prudente de Morais, 5121, Natal-RN, CEP 59020-400
E-mail: contato@chatclean.com.br
Telefone: +55 84 9695-0105`,
  },
];

export default function PoliticaPrivacidade() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 selection:bg-emerald-500 selection:text-white">
      <Navbar />

      {/* Hero */}
      <section className="relative aurora-bg aurora-beams pt-40 pb-16 overflow-hidden">
        <div className="absolute inset-0 bg-grid-white opacity-40 pointer-events-none" />
        <div className="relative z-10 max-w-3xl mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 border border-white/30 backdrop-blur-md text-white text-xs font-bold uppercase tracking-widest mb-6"
          >
            <Shield className="w-3.5 h-3.5" />
            Privacidade & Dados
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-6xl font-black text-white tracking-tighter leading-tight mb-4"
          >
            Política de{" "}
            <span className="bg-gradient-to-r from-yellow-200 via-white to-cyan-100 bg-clip-text text-transparent">
              Privacidade
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-white/70 text-sm"
          >
            Última atualização: 28/05/2026
          </motion.p>
        </div>
      </section>

      {/* Conteúdo */}
      <main className="max-w-3xl mx-auto px-4 py-16">
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-zinc-600 leading-relaxed mb-10 text-base border-l-4 border-emerald-500 pl-4"
        >
          A ChatClean está comprometida com a proteção da sua privacidade. Esta política descreve como coletamos, usamos e protegemos suas informações pessoais em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
        </motion.p>

        <div className="space-y-10">
          {SECTIONS.map((s, i) => (
            <motion.section
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.04 }}
            >
              <h2 className="text-xl font-black text-zinc-900 tracking-tight mb-3">{s.titulo}</h2>
              <div className="text-zinc-600 leading-relaxed whitespace-pre-line text-sm">{s.texto}</div>
            </motion.section>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-zinc-100 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-emerald-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao início
          </Link>
          <Link
            to="/termos-de-servico"
            className="text-sm text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
          >
            Ver Termos de Serviço →
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
