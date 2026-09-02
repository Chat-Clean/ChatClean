/**
 * Planos comerciais da ChatClean — dados da seção de Planos da home.
 *
 * Origem do conteúdo:
 *   - Nomes dos planos: playbook comercial (Starter / Pro / Business / Enterprise).
 *   - Recursos de cada plano: documentação dos módulos da plataforma
 *     (Atendimento, Canais, CRM-Pipeline, Automações, Envios, Dashboards,
 *      Ao Vivo, Chat Interno, Integrações, Configurações, Segurança/LGPD).
 *
 * ATENÇÃO — VALORES DE MOCKUP. Os preços abaixo NÃO vêm da base comercial:
 * não existe tabela de preços registrada. São números de demonstração para
 * validar o layout e devem ser substituídos pelos valores oficiais antes de
 * qualquer publicação. Não há checkout: os botões da seção não têm ação.
 */

export const PLANOS = [
  {
    id: "starter",
    nome: "Starter",
    estagio: "Organiza",
    resumo:
      "Para colocar todo o atendimento da equipe em um lugar só, com registro de cada conversa.",
    precoPorAtendente: 89.9,
    minimoAtendentes: 2,
    destaque: false,
    tituloRecursos: "Recursos incluídos",
    recursos: [
      "1 número de WhatsApp Oficial",
      "Caixa de entrada compartilhada",
      "Departamentos e transferência de conversa",
      "Mensagens rápidas e etiquetas",
      "Agenda de contatos e histórico completo",
      "Horário de atendimento e feriados",
      "Chat interno da equipe",
      "Dash de atendimento",
    ],
    rotuloAcao: "Começar com o Starter",
  },
  {
    id: "pro",
    nome: "Pro",
    estagio: "Automatiza",
    resumo:
      "Para quem já atende bem e quer o robô e a IA resolvendo o repetitivo, com a venda no pipeline.",
    precoPorAtendente: 149.9,
    minimoAtendentes: 3,
    destaque: true,
    tituloRecursos: "Tudo do Starter, mais",
    recursos: [
      "Até 3 canais: WhatsApp, Instagram, Facebook, Telegram ou Webchat",
      "CRM em pipeline Kanban, com vários funis",
      "ChatBot e Flow para fluxos automáticos",
      "Agente de IA que responde no tom da sua empresa",
      "Mensagens agendadas",
      "Campanhas e funil de envios",
      "Dash de vendas e de oportunidades",
      "Pesquisa de satisfação (CSAT)",
    ],
    rotuloAcao: "Começar com o Pro",
  },
  {
    id: "business",
    nome: "Business",
    estagio: "Escala",
    resumo:
      "Para operação grande, que precisa acompanhar em tempo real, auditar e conversar com outros sistemas.",
    precoPorAtendente: 229.9,
    minimoAtendentes: 5,
    destaque: false,
    tituloRecursos: "Tudo do Pro, mais",
    recursos: [
      "Canais e pipelines ilimitados",
      "Tela Ao Vivo: atendimentos em tempo real",
      "SLA e auditoria de tudo que a equipe faz",
      "API e webhook: contatos, templates, pipeline e etiquetas",
      "Campos customizados e metas de venda",
      "Acesso por IP e autenticação de dois fatores",
      "Créditos de IA ampliados",
      "Suporte prioritário",
    ],
    rotuloAcao: "Começar com o Business",
  },
];

export const PLANO_SOB_MEDIDA = {
  id: "enterprise",
  nome: "Enterprise",
  resumo:
    "Multiunidade, integração dedicada e implantação acompanhada pelo nosso time. O preço sai da sua operação, não de uma tabela.",
  recursos: [
    "Multiunidade e multimarca",
    "Integração dedicada com o seu sistema",
    "Implantação acompanhada",
    "Gerente de conta",
  ],
  rotuloAcao: "Falar com um especialista",
};

/** Opções do seletor de tamanho de equipe. */
export const TAMANHOS_DE_EQUIPE = [2, 3, 5, 10, 20];

/** Quantos atendentes o plano cobra para uma equipe deste tamanho. */
export function atendentesCobrados(plano, atendentes) {
  return Math.max(plano.minimoAtendentes, atendentes);
}

/** Total mensal do plano para uma equipe deste tamanho. */
export function totalMensal(plano, atendentes) {
  return plano.precoPorAtendente * atendentesCobrados(plano, atendentes);
}

const MOEDA = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatarMoeda(valor) {
  return MOEDA.format(valor);
}

/** Preço por atendente sem o símbolo, para compor o número grande do cartão. */
export function formatarNumero(valor) {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
