/**
 * Título e descrição de cada página fixa do site, num lugar só.
 *
 * ─── POR QUE ISTO EXISTE ──────────────────────────────────────────────────
 *
 * Toda rota que não é servida por função recebia o `index.html` com os
 * metadados da HOME: título da home e canônica apontando para `/`. Para o
 * buscador, `/sobre`, `/integracoes` e `/api-oficial-whatsapp` se declaravam
 * CÓPIAS da home, e o Search Console as listava como não indexadas ("cópia",
 * "página alternativa com tag canônica"). O ajuste por `useEffect` em duas
 * delas não bastava: a canônica do HTML recebido contradizia a da página
 * renderizada.
 *
 * O build (`scripts/gerar-paginas-fixas.mjs`) monta uma cópia do shell por
 * página, com a região de metadados desta lista, e `vercel.json` aponta cada
 * caminho para a sua cópia. As páginas que ajustam o `<head>` no navegador
 * leem DESTA lista, para as duas versões não divergirem.
 *
 * Puro: sem React, sem rede, sem `fs`.
 */

export const PAGINAS_FIXAS = Object.freeze([
  Object.freeze({
    caminho: "/api-oficial-whatsapp",
    arquivo: "api-oficial-whatsapp",
    titulo: "API Oficial do WhatsApp Business no Brasil | ChatClean",
    descricao:
      "API Oficial do WhatsApp Business com a ChatClean: ative em poucos dias, multiatendimento com varios atendentes, integracao com CRM e ChatBot com IA. Saiba como funciona, quanto custa e como migrar.",
  }),
  Object.freeze({
    caminho: "/integracoes",
    arquivo: "integracoes",
    titulo: "Integrações da ChatClean | CRM e WhatsApp conectados às suas ferramentas",
    descricao:
      "Conecte a ChatClean ao seu CRM, e-commerce, meios de pagamento e IA. Webhook, API e o Flow, o editor de fluxos da ChatClean: se a ferramenta tem API, ela conversa com a ChatClean.",
  }),
  Object.freeze({
    caminho: "/sobre",
    arquivo: "sobre",
    titulo: "Sobre a ChatClean | CRM, consultoria e capacitação em vendas",
    descricao:
      "Quem faz a ChatClean: plataforma de CRM e ChatBot para WhatsApp, consultoria empresarial e capacitação em vendas, de Natal/RN para empresas de todo o Brasil.",
  }),
  Object.freeze({
    caminho: "/noticias",
    arquivo: "noticias",
    titulo: "Notícias em vídeo | ChatClean",
    descricao:
      "As novidades da ChatClean em vídeo, gravadas por quem faz a ChatClean: lançamentos, mudanças no WhatsApp e dicas de atendimento.",
  }),
  Object.freeze({
    caminho: "/politica-de-privacidade",
    arquivo: "politica-de-privacidade",
    titulo: "Política de Privacidade | ChatClean",
    descricao:
      "Quais dados a ChatClean coleta, como os usa, compartilha e protege, por quanto tempo os guarda e como exercer os seus direitos pela LGPD.",
  }),
  Object.freeze({
    caminho: "/termos-de-servico",
    arquivo: "termos-de-servico",
    titulo: "Termos de Serviço | ChatClean",
    descricao:
      "As condições de uso da plataforma ChatClean: cadastro, uso aceitável, contratação e pagamento, direito de arrependimento, disponibilidade e rescisão.",
  }),
]);

/** A página fixa de um caminho, ou `null`. */
export function paginaFixa(caminho) {
  return PAGINAS_FIXAS.find((p) => p.caminho === caminho) ?? null;
}

/** Onde o build grava a cópia do shell de cada página, dentro de `dist/`. */
export function arquivoDaPaginaFixa(pagina) {
  return `/paginas/${pagina.arquivo}.html`;
}
