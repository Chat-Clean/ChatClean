import asaas from "@/assets/integracoes/asaas.png";
import calendly from "@/assets/integracoes/calendly.svg";
import chatgpt from "@/assets/integracoes/chatgpt.svg";
import facebook from "@/assets/integracoes/facebook.svg";
import gmail from "@/assets/integracoes/gmail.svg";
import googleAgenda from "@/assets/integracoes/google-agenda.svg";
import googleForms from "@/assets/integracoes/google-forms.svg";
import googleSheets from "@/assets/integracoes/google-sheets.svg";
import hotmart from "@/assets/integracoes/hotmart.svg";
import hubspot from "@/assets/integracoes/hubspot.svg";
import instagram from "@/assets/integracoes/instagram.svg";
import jira from "@/assets/integracoes/jira.svg";
import make from "@/assets/integracoes/make.svg";
import n8n from "@/assets/integracoes/n8n.svg";
import pipedrive from "@/assets/integracoes/pipedrive.png";
import rdStation from "@/assets/integracoes/rd-station.png";
import salesforce from "@/assets/integracoes/salesforce.svg";
import shopify from "@/assets/integracoes/shopify.svg";
import telegram from "@/assets/integracoes/telegram.svg";
import trello from "@/assets/integracoes/trello.svg";
import whatsapp from "@/assets/integracoes/whatsapp.svg";
import woocommerce from "@/assets/integracoes/woocommerce.svg";
import zapier from "@/assets/integracoes/zapier.svg";

/**
 * O conteúdo da página `/integracoes`.
 *
 * Tudo aqui foi conferido na documentação do produto (o vault da ChatClean),
 * e o que ela não confirma não é prometido:
 * - "Nativa" só onde há conector de verdade: os canais, o RD Station (modo
 *   homologado do Novo Push) e a IA com modelos da OpenAI;
 * - "Via webhook" onde a ferramenta manda ou recebe eventos e a ChatClean
 *   conversa com eles pelo Push e pelo webhook de saída;
 * - "Via Flow" onde o caminho é o Flow, o editor de fluxos da própria
 *   ChatClean: ele recebe webhooks, chama APIs (Bearer, Basic, OAuth2) e envia
 *   webhooks, que é o papel de um integrador como n8n, Make ou Zapier, sem
 *   ferramenta de fora no meio (documentação: `automacoes/flow.md`).
 * A documentação diz, com estas palavras, que o sistema "não se limita às
 * plataformas listadas": qualquer ferramenta com API ou webhook entra pelos
 * mesmos caminhos.
 */

/** Os selos de "como conecta", do mais direto ao mais indireto. */
export const COMO_CONECTA = Object.freeze({
  NATIVA: "Nativa",
  WEBHOOK: "Via webhook",
  FLOW: "Via Flow",
});

/**
 * As quatro formas de integrar: o que o sistema faz de fato. `titulo` diz o
 * que acontece em uma frase; `apoio` diz o que dá para fazer com isso.
 */
export const FORMAS_DE_INTEGRAR = Object.freeze([
  Object.freeze({
    icone: "ArrowDownToLine",
    recurso: "Novo Push",
    titulo: "Um evento em outro sistema vira mensagem no WhatsApp.",
    apoio: "Venda, cadastro ou carrinho abandonado disparam a mensagem, aplicam uma etiqueta e colocam o contato no funil.",
  }),
  Object.freeze({
    icone: "ArrowUpFromLine",
    recurso: "Webhook de saída",
    titulo: "O que acontece na ChatClean chega ao seu sistema.",
    apoio: "Contato, atendimento e oportunidade seguem em JSON a cada evento.",
  }),
  Object.freeze({
    icone: "MessagesSquare",
    recurso: "ChatBot e Flow",
    titulo: "O chatbot consulta o seu sistema no meio da conversa.",
    apoio: "Pede o CPF e devolve o boleto, o Pix ou o status do pedido, sem passar por um atendente.",
  }),
  Object.freeze({
    icone: "Code2",
    recurso: "API da ChatClean",
    titulo: "O seu sistema comanda a ChatClean pela API.",
    apoio: "Contatos, etiquetas, templates e oportunidades, com o token de acesso da sua conta.",
  }),
]);

/** O catálogo, por categoria. `faz` diz o que dá para fazer, em uma frase. */
export const CATEGORIAS = Object.freeze([
  Object.freeze({
    nome: "CRM e marketing",
    resumo: "O lead que chega pelo marketing já cai no funil certo, com a mensagem certa.",
    ferramentas: Object.freeze([
      { nome: "RD Station", imagem: rdStation, como: COMO_CONECTA.NATIVA, faz: "Eventos do RD Station Marketing e CRM já homologados no Novo Push: o lead converte e recebe a mensagem." },
      { nome: "HubSpot", imagem: hubspot, como: COMO_CONECTA.WEBHOOK, faz: "Um negócio que muda de etapa dispara a mensagem para o cliente no WhatsApp." },
      { nome: "Pipedrive", imagem: pipedrive, como: COMO_CONECTA.WEBHOOK, faz: "Mover o card no funil de vendas avisa o cliente e registra a conversa." },
      { nome: "Salesforce", imagem: salesforce, como: COMO_CONECTA.FLOW, faz: "Oportunidades e contatos sincronizados com a ChatClean pelo Flow, que chama a API da Salesforce." },
    ]),
  }),
  Object.freeze({
    nome: "Vendas e e-commerce",
    resumo: "Cada compra, carrinho e pagamento vira uma conversa no momento certo.",
    ferramentas: Object.freeze([
      { nome: "Shopify", imagem: shopify, como: COMO_CONECTA.WEBHOOK, faz: "Carrinho abandonado e compra aprovada disparam mensagens no WhatsApp." },
      { nome: "WooCommerce", imagem: woocommerce, como: COMO_CONECTA.WEBHOOK, faz: "Pedidos da sua loja WordPress avisam o cliente em cada etapa." },
      { nome: "Hotmart", imagem: hotmart, como: COMO_CONECTA.WEBHOOK, faz: "Venda aprovada, boleto gerado ou reembolso disparam a mensagem para o aluno." },
      { nome: "Asaas", imagem: asaas, como: COMO_CONECTA.WEBHOOK, faz: "Cobranças e segunda via de boleto no WhatsApp, pelo webhook ou pelo chatbot." },
    ]),
  }),
  Object.freeze({
    nome: "Canais de atendimento",
    resumo: "Todas as conversas no mesmo lugar, com o histórico de cada cliente.",
    ferramentas: Object.freeze([
      { nome: "WhatsApp", imagem: whatsapp, como: COMO_CONECTA.NATIVA, faz: "API Oficial da Meta, com vários atendentes no mesmo número." },
      { nome: "Instagram", imagem: instagram, como: COMO_CONECTA.NATIVA, faz: "Mensagens diretas do Instagram na mesma caixa de entrada do WhatsApp." },
      { nome: "Facebook", imagem: facebook, como: COMO_CONECTA.NATIVA, faz: "Conversas do Messenger da sua página, atendidas pela mesma equipe." },
      { nome: "Telegram", imagem: telegram, como: COMO_CONECTA.NATIVA, faz: "Atendimento pelo bot da sua empresa no Telegram." },
      { nome: "Gmail", imagem: gmail, como: COMO_CONECTA.NATIVA, faz: "E-mails de atendimento viram atendimentos na plataforma." },
    ]),
  }),
  Object.freeze({
    nome: "Produtividade",
    resumo: "A operação da equipe conversa com o atendimento, sem copiar e colar.",
    ferramentas: Object.freeze([
      { nome: "Google Sheets", imagem: googleSheets, como: COMO_CONECTA.FLOW, faz: "Planilhas que viram contatos, notas internas ou disparos, pelo Flow ou pelo Google Apps Script." },
      { nome: "Google Forms", imagem: googleForms, como: COMO_CONECTA.FLOW, faz: "Quem responde o formulário recebe a mensagem e entra no funil." },
      { nome: "Google Agenda", imagem: googleAgenda, como: COMO_CONECTA.NATIVA, faz: "Tarefas do CRM chegam no WhatsApp do responsável com o link para a agenda." },
      { nome: "Calendly", imagem: calendly, como: COMO_CONECTA.FLOW, faz: "Reunião marcada dispara a confirmação e o lembrete no WhatsApp." },
      { nome: "Trello", imagem: trello, como: COMO_CONECTA.FLOW, faz: "Um atendimento pode abrir um card no quadro da equipe." },
      { nome: "Jira", imagem: jira, como: COMO_CONECTA.FLOW, faz: "Chamados de suporte viram tarefas no Jira, com a conversa anexada." },
    ]),
  }),
  Object.freeze({
    nome: "Inteligência artificial",
    resumo: "Atendimento com IA que entende o contexto e sabe a hora de passar para uma pessoa.",
    ferramentas: Object.freeze([
      { nome: "ChatGPT (OpenAI)", imagem: chatgpt, como: COMO_CONECTA.NATIVA, faz: "A IA da ChatClean usa modelos da OpenAI para responder, qualificar e transferir para o departamento certo." },
    ]),
  }),
  Object.freeze({
    nome: "Integradores",
    resumo: "O Flow já faz esse papel dentro da ChatClean. Se a sua empresa já usa um destes, ele conversa com a ChatClean também.",
    ferramentas: Object.freeze([
      { nome: "n8n", imagem: n8n, como: COMO_CONECTA.WEBHOOK, faz: "Fluxos que você já tem no n8n recebem e enviam eventos da ChatClean." },
      { nome: "Make", imagem: make, como: COMO_CONECTA.WEBHOOK, faz: "Cenários visuais que recebem e enviam eventos da ChatClean." },
      { nome: "Zapier", imagem: zapier, como: COMO_CONECTA.WEBHOOK, faz: "Liga a ChatClean a milhares de aplicativos com gatilhos e ações." },
    ]),
  }),
]);

/** Como uma integração sai do papel: o caminho do onboarding. */
export const PASSOS = Object.freeze([
  Object.freeze({ titulo: "Você conta o que usa", texto: "Quais ferramentas a sua empresa já tem e o que precisa acontecer entre elas." }),
  Object.freeze({ titulo: "Desenhamos o fluxo", texto: "Qual evento dispara, qual mensagem sai, qual etiqueta entra e para onde vai o atendimento." }),
  Object.freeze({ titulo: "Configuramos com você", texto: "A integração entra na etapa de configurações avançadas da implantação, com a nossa equipe." }),
  Object.freeze({ titulo: "Testamos com você", texto: "O fluxo roda em teste antes de chegar aos seus clientes, e ajustamos o que for preciso." }),
]);

export const PERGUNTAS = Object.freeze([
  Object.freeze({
    q: "Preciso saber programar para integrar?",
    a: "Não. Boa parte das integrações usa o Novo Push e os webhooks, configurados em telas da própria plataforma, e a nossa equipe acompanha a implantação. A API fica disponível para quem quer ligar sistemas próprios.",
  }),
  Object.freeze({
    q: "A minha ferramenta não está na lista. Dá para integrar?",
    a: "Se ela tem API ou webhook, sim: entra pelos mesmos caminhos das ferramentas da lista, direto ou pelo Flow, o editor de fluxos da ChatClean, que recebe webhooks e chama a API da sua ferramenta. Fale com a gente e contamos como fica no seu caso.",
  }),
  Object.freeze({
    q: "Funciona com a API Oficial do WhatsApp?",
    a: "Funciona. Mensagens disparadas por integração fora da janela de 24 horas usam templates aprovados pela Meta, como a própria Meta exige.",
  }),
  Object.freeze({
    q: "Como a integração é autorizada?",
    a: "A API e o Push da ChatClean só aceitam chamadas com o token de acesso gerado na sua conta, e as integrações são configuradas pela sua equipe ou pela nossa, durante a implantação.",
  }),
]);

/** O que a página declara ao buscador (a página aplica no `<head>` ao montar). */
export const METADADOS_DA_PAGINA = Object.freeze({
  titulo: "Integrações da ChatClean | CRM e WhatsApp conectados às suas ferramentas",
  descricao:
    "Conecte a ChatClean ao seu CRM, e-commerce, meios de pagamento e IA. Webhook, API e o Flow, o editor de fluxos da ChatClean: se a ferramenta tem API, ela conversa com a ChatClean.",
  caminho: "/integracoes",
});
