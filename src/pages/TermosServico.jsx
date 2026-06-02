import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, FileText } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

const SECTIONS = [
  {
    titulo: "1. Aceitação dos Termos",
    texto: `Ao acessar ou utilizar a plataforma ChatClean, você concorda em ficar vinculado a estes Termos de Serviço. Se você não concordar com alguma parte destes termos, não poderá acessar o serviço.

Estes Termos se aplicam a todos os visitantes, usuários e outras pessoas que acessem ou utilizem o serviço.`,
  },
  {
    titulo: "2. Descrição do Serviço",
    texto: `A ChatClean é uma plataforma de CRM e ChatBot para WhatsApp com API Oficial que oferece:

• Atendimento omnichannel (WhatsApp, Instagram, Facebook, Telegram);
• Gestão de leads e pipeline de vendas (CRM Kanban);
• Automação de atendimento com Inteligência Artificial;
• Multiatendimento com vários atendentes em um único número;
• Campanhas automatizadas e relatórios detalhados;
• Aplicativo móvel para iOS e Android.

O serviço é oferecido mediante pagamento de assinatura, conforme plano contratado.`,
  },
  {
    titulo: "3. Cadastro e Conta",
    texto: `Para utilizar o serviço, você deve:

• Ter pelo menos 18 anos de idade ou representar legalmente uma empresa;
• Fornecer informações verdadeiras, precisas e completas no cadastro;
• Manter as credenciais de acesso em sigilo e não compartilhá-las;
• Notificar imediatamente a ChatClean sobre qualquer uso não autorizado da sua conta;
• Ser responsável por todas as atividades realizadas com suas credenciais.

A ChatClean se reserva o direito de encerrar contas com informações falsas ou que violem estes termos.`,
  },
  {
    titulo: "4. Uso Aceitável",
    texto: `Ao utilizar a plataforma, você concorda em NÃO:

• Enviar spam, mensagens em massa não solicitadas ou conteúdo enganoso;
• Violar leis aplicáveis, incluindo a LGPD e regulamentos da Meta/WhatsApp;
• Tentar acessar sistemas ou dados de outros usuários sem autorização;
• Realizar engenharia reversa ou descompilar qualquer parte do software;
• Usar o serviço para fins ilegais, fraudulentos ou prejudiciais;
• Revender, sublicenciar ou transferir o acesso ao serviço sem autorização;
• Sobrecarregar ou comprometer a infraestrutura da plataforma.

O descumprimento poderá resultar na suspensão imediata da conta.`,
  },
  {
    titulo: "5. Pagamento e Assinatura",
    texto: `Os planos de assinatura são cobrados mensalmente ou anualmente, conforme contratado. As condições de pagamento incluem:

• O valor da assinatura é cobrado antecipadamente no início de cada período;
• Não há reembolso por períodos parcialmente utilizados, salvo disposição legal;
• Em caso de inadimplência, o acesso poderá ser suspenso após notificação;
• Os preços podem ser reajustados mediante aviso prévio de 30 dias;
• Custos da API Oficial do WhatsApp (cobrados pela Meta) são de responsabilidade do cliente.`,
  },
  {
    titulo: "6. Propriedade Intelectual",
    texto: `A plataforma ChatClean, incluindo seu software, design, marca, logotipos e conteúdo, é de propriedade exclusiva da ChatClean e protegida por leis de propriedade intelectual.

Você retém todos os direitos sobre os dados e conteúdos que você inserir na plataforma. Ao usar o serviço, você concede à ChatClean uma licença limitada para processar esses dados exclusivamente para a prestação do serviço contratado.`,
  },
  {
    titulo: "7. Disponibilidade e SLA",
    texto: `A ChatClean se compromete a manter a plataforma disponível com uptime mínimo de 99% ao mês, exceto em:

• Manutenções programadas (comunicadas com antecedência);
• Eventos de força maior;
• Indisponibilidades de infraestrutura de terceiros (Meta, servidores em nuvem).

O status em tempo real da plataforma pode ser consultado em status.chatclean.com.br.`,
  },
  {
    titulo: "8. Limitação de Responsabilidade",
    texto: `Na máxima extensão permitida por lei, a ChatClean não será responsável por:

• Danos indiretos, incidentais, especiais ou consequentes;
• Perda de receita, dados ou oportunidades de negócio;
• Ações ou omissões de terceiros, incluindo a Meta/WhatsApp;
• Interrupções do serviço fora do controle da ChatClean.

Nossa responsabilidade total não excederá o valor pago pelo cliente nos últimos 3 meses de serviço.`,
  },
  {
    titulo: "9. Rescisão",
    texto: `Você pode cancelar sua assinatura a qualquer momento pelo painel de controle ou entrando em contato com o suporte. O acesso permanecerá ativo até o fim do período pago.

A ChatClean pode suspender ou encerrar sua conta imediatamente em caso de violação destes Termos, uso fraudulento ou inadimplência recorrente, com ou sem aviso prévio dependendo da gravidade.`,
  },
  {
    titulo: "10. Alterações nos Termos",
    texto: `Podemos revisar estes Termos periodicamente. Alterações significativas serão comunicadas por e-mail ou notificação na plataforma com no mínimo 15 dias de antecedência. O uso continuado do serviço após esse prazo implica na aceitação dos novos termos.`,
  },
  {
    titulo: "11. Lei Aplicável e Foro",
    texto: `Estes Termos são regidos pelas leis da República Federativa do Brasil. Qualquer disputa será submetida ao foro da Comarca de Natal, Rio Grande do Norte, com renúncia a qualquer outro, por mais privilegiado que seja.`,
  },
  {
    titulo: "12. Contato",
    texto: `Para dúvidas sobre estes Termos de Serviço, entre em contato:

ChatClean — CNPJ: 57.487.327/0001-57
Av. Prudente de Morais, 5121, Natal-RN, CEP 59020-400
E-mail: contato@chatclean.com.br
Telefone: +55 84 9695-0105`,
  },
];

export default function TermosServico() {
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
            <FileText className="w-3.5 h-3.5" />
            Termos Legais
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-6xl font-black text-white tracking-tighter leading-tight mb-4"
          >
            Termos de{" "}
            <span className="bg-gradient-to-r from-yellow-200 via-white to-cyan-100 bg-clip-text text-transparent">
              Serviço
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
          Estes Termos de Serviço regem o uso da plataforma ChatClean. Leia atentamente antes de utilizar nossos serviços. Ao criar uma conta ou usar a plataforma, você concorda com estes termos em sua totalidade.
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
            to="/politica-de-privacidade"
            className="text-sm text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
          >
            Ver Política de Privacidade →
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
