/**
 * Os planos comerciais e a fórmula do preço.
 *
 * Mora em `domain/` — e não em `lib/` — por um motivo de integridade, não de
 * organização: o preço é recalculado NO SERVIDOR antes de criar a assinatura no
 * Asaas. Se a fórmula morasse no bundle do navegador, o valor cobrado seria o
 * que o navegador mandasse, e o navegador é do cliente. Aqui, o mesmo módulo
 * serve as duas pontas: a tela mostra, `api/assinar.js` confere.
 *
 * Sem React, sem rede, sem `Intl` no cálculo — só aritmética e vocabulário.
 *
 * ─── VALORES DE MOCKUP ────────────────────────────────────────────────────
 *
 * Os preços abaixo NÃO vêm da base comercial: não existe tabela de preços
 * registrada, e o playbook manda abrir preço só depois de qualificar a dor.
 * São números de demonstração, para exercitar o checkout ponta a ponta em
 * sandbox. Trocar por valores reais é trocar as constantes deste arquivo —
 * nada mais depende delas por cópia.
 *
 * ─── Origem do conteúdo ───────────────────────────────────────────────────
 *
 * Nomes dos planos: playbook comercial (Starter / Pro / Business / Enterprise).
 * Recursos: documentação dos módulos da plataforma (Atendimento, Canais,
 * CRM-Pipeline, Automações, Envios, Dashboards, Ao Vivo, Chat Interno,
 * Integrações, Configurações, Segurança/LGPD).
 */

/* ─── Vocabulário ──────────────────────────────────────────────────────────
 *
 * Dois limites, e um nome só para cada um. `usuario` é quem entra na
 * plataforma; `conexao` é cada canal ligado (WhatsApp, Instagram, Facebook,
 * Telegram, Webchat) — é o termo que a documentação de Canais usa: "cada canal
 * representa uma conexão ativa". "Atendente" e "número" são sinônimos que este
 * módulo deliberadamente não tem.
 */

/** Faixa aceita no dimensionamento. Fora dela, o pedido é recusado. */
export const LIMITES = Object.freeze({
  usuarios: Object.freeze({ minimo: 1, maximo: 200 }),
  conexoes: Object.freeze({ minimo: 1, maximo: 30 }),
});

/**
 * O dia do mês em que a cobrança vence, escolhido pelo cliente.
 *
 * O teto é 28, não 31, e é deliberado: dia 30 não existe em fevereiro. Um dia
 * acima de 28 obrigaria a decidir, todo mês, se a cobrança antecipa ou atrasa —
 * e essa decisão vazaria para o extrato do cliente como inconsistência.
 */
export const DIA_DE_VENCIMENTO = Object.freeze({ minimo: 1, maximo: 28 });

export const PLANOS = Object.freeze([
  Object.freeze({
    id: "starter",
    nome: "Starter",
    estagio: "Organiza",
    resumo:
      "Para colocar todo o atendimento da equipe em um lugar só, com registro de cada conversa.",
    porUsuario: 89.9,
    minimoDeUsuarios: 2,
    conexoesInclusas: 1,
    porConexaoExtra: 49.9,
    maximoDeConexoes: 3,
    destaque: false,
    tituloRecursos: "Recursos incluídos",
    recursos: Object.freeze([
      "WhatsApp Oficial (API Meta)",
      "Caixa de entrada compartilhada",
      "Departamentos e transferência de conversa",
      "Mensagens rápidas e etiquetas",
      "Agenda de contatos e histórico completo",
      "Horário de atendimento e feriados",
      "Chat interno da equipe",
      "Dash de atendimento",
    ]),
  }),
  Object.freeze({
    id: "pro",
    nome: "Pro",
    estagio: "Automatiza",
    resumo:
      "Para quem já atende bem e quer o robô e a IA resolvendo o repetitivo, com a venda no pipeline.",
    porUsuario: 149.9,
    minimoDeUsuarios: 3,
    conexoesInclusas: 3,
    porConexaoExtra: 39.9,
    maximoDeConexoes: 10,
    destaque: true,
    tituloRecursos: "Tudo do Starter, mais",
    recursos: Object.freeze([
      "WhatsApp, Instagram, Facebook, Telegram e Webchat",
      "CRM em pipeline Kanban, com vários funis",
      "ChatBot e Flow para fluxos automáticos",
      "Agente de IA que responde no tom da sua empresa",
      "Mensagens agendadas",
      "Campanhas e funil de envios",
      "Dash de vendas e de oportunidades",
      "Pesquisa de satisfação (CSAT)",
    ]),
  }),
  Object.freeze({
    id: "business",
    nome: "Business",
    estagio: "Escala",
    resumo:
      "Para operação grande, que precisa acompanhar em tempo real, auditar e conversar com outros sistemas.",
    porUsuario: 229.9,
    minimoDeUsuarios: 5,
    conexoesInclusas: 5,
    porConexaoExtra: 29.9,
    maximoDeConexoes: 30,
    destaque: false,
    tituloRecursos: "Tudo do Pro, mais",
    recursos: Object.freeze([
      "Pipelines e equipes ilimitados",
      "Tela Ao Vivo: atendimentos em tempo real",
      "SLA e auditoria de tudo que a equipe faz",
      "API e webhook: contatos, templates, pipeline e etiquetas",
      "Campos customizados e metas de venda",
      "Acesso por IP e autenticação de dois fatores",
      "Créditos de IA ampliados",
      "Suporte prioritário",
    ]),
  }),
]);

export const PLANO_SOB_MEDIDA = Object.freeze({
  id: "enterprise",
  nome: "Enterprise",
  resumo:
    "Multiunidade, integração dedicada e implantação acompanhada pelo nosso time. O preço sai da sua operação, não de uma tabela.",
  recursos: Object.freeze([
    "Multiunidade e multimarca",
    "Integração dedicada com o seu sistema",
    "Implantação acompanhada",
    "Gerente de conta",
  ]),
});

/** O plano pelo identificador, ou `null`. Lista fechada: nada de busca solta. */
export function planoPorId(id) {
  if (typeof id !== "string") return null;
  return PLANOS.find((plano) => plano.id === id) ?? null;
}

/* ─── Dimensionamento ───────────────────────────────────────────────────── */

/**
 * Normaliza um número vindo de fora (campo de formulário, querystring, corpo
 * de requisição) para inteiro dentro da faixa.
 *
 * Devolve `null` — e não um valor corrigido — quando a entrada não é número
 * inteiro. Corrigir silenciosamente `"3,5"` para `3` esconderia erro de
 * digitação do cliente no valor que ele vai pagar.
 */
export function quantidadeValida(bruto, faixa) {
  const numero = typeof bruto === "number" ? bruto : Number(String(bruto).trim());
  if (!Number.isInteger(numero)) return null;
  if (numero < faixa.minimo || numero > faixa.maximo) return null;
  return numero;
}

/** Quantos usuários o plano cobra para esta equipe (respeita o mínimo). */
export function usuariosCobrados(plano, usuarios) {
  return Math.max(plano.minimoDeUsuarios, usuarios);
}

/** Quantas conexões passam do que o plano já inclui. */
export function conexoesExtras(plano, conexoes) {
  return Math.max(0, conexoes - plano.conexoesInclusas);
}

/**
 * O plano atende a este dimensionamento?
 *
 * Devolve o motivo em texto quando não atende, e `null` quando atende — assim a
 * tela mostra POR QUE o cartão está indisponível em vez de só desabilitá-lo.
 * O único impedimento é o teto de conexões: usuário acima do mínimo é sempre
 * possível, é só somar.
 */
export function impedimentoDoPlano(plano, { conexoes }) {
  if (conexoes > plano.maximoDeConexoes) {
    return `O ${plano.nome} atende até ${plano.maximoDeConexoes} ${
      plano.maximoDeConexoes === 1 ? "conexão" : "conexões"
    }`;
  }
  return null;
}

/**
 * A fórmula do preço.
 *
 * total = (valor por usuário × usuários cobrados)
 *       + (valor por conexão extra × conexões acima das inclusas)
 *
 * Devolve as parcelas junto com o total, e não só o total, porque a tela e o
 * resumo da contratação precisam mostrar a conta aberta — exigência do
 * Decreto 7.962/2013, que manda discriminar os valores antes da contratação.
 *
 * Os centavos são fechados com `Math.round` sobre centavos inteiros: somar
 * ponto flutuante direto produz 1049.7000000000003, que o Asaas recusa ou
 * arredonda por conta própria.
 */
export function precoMensal(plano, { usuarios, conexoes }) {
  const usuariosNaConta = usuariosCobrados(plano, usuarios);
  const extras = conexoesExtras(plano, conexoes);

  const centavosDosUsuarios = Math.round(plano.porUsuario * 100) * usuariosNaConta;
  const centavosDasConexoes = Math.round(plano.porConexaoExtra * 100) * extras;
  const centavos = centavosDosUsuarios + centavosDasConexoes;

  return {
    usuariosCobrados: usuariosNaConta,
    conexoesExtras: extras,
    valorDosUsuarios: centavosDosUsuarios / 100,
    valorDasConexoes: centavosDasConexoes / 100,
    centavos,
    total: centavos / 100,
  };
}

/* ─── Apresentação do valor ────────────────────────────────────────────── */

const MOEDA = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatarMoeda(valor) {
  return MOEDA.format(valor);
}

/** Só o número, para compor o valor grande do cartão com o "R$" à parte. */
export function formatarNumero(valor) {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
