import asaas from "@/assets/integracoes/asaas.png";
import calendly from "@/assets/integracoes/calendly.svg";
import chatgpt from "@/assets/integracoes/chatgpt.svg";
import facebook from "@/assets/integracoes/facebook.svg";
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
import trello from "@/assets/integracoes/trello.svg";
import whatsapp from "@/assets/integracoes/whatsapp.svg";
import zapier from "@/assets/integracoes/zapier.svg";

/**
 * As marcas da parede de integrações da home, na ordem das colunas
 * (3-4-3-4-3, ver `colunas.js`).
 *
 * É o mesmo conjunto da seção equivalente da Clickmassa, que serviu de
 * referência. Nos cinco lugares em que o logo deles não tem nome que se
 * confirme, entram ferramentas da própria lista de integrações deles
 * (Zapier, Make, n8n, Shopify e Instagram).
 *
 * De onde vem cada arquivo (`src/assets/integracoes/`):
 * - SVG do Simple Icons (CC0 1.0), na cor oficial: Trello, Calendly, Facebook,
 *   WhatsApp, HubSpot, Jira, Zapier, Make, n8n, Shopify e Instagram;
 * - recorte vetorial da Wikimedia Commons: a chama da Hotmart, o nó da
 *   OpenAI (ChatGPT) e a nuvem da Salesforce;
 * - PNG de 60x69 da Clickmassa, por não haver vetor público: Pipedrive,
 *   RD Station e Asaas. Trocar pelo arquivo oficial de cada marca assim que
 *   houver; são os únicos que perdem nitidez sob a lupa.
 *
 * As marcas são de seus donos. Aparecem aqui só para dizer com quais
 * ferramentas a ChatClean conversa.
 */
export const MARCAS_INTEGRADAS = Object.freeze([
  // Coluna 1 (3)
  Object.freeze({ nome: "Hotmart", imagem: hotmart }),
  Object.freeze({ nome: "Trello", imagem: trello }),
  Object.freeze({ nome: "ChatGPT", imagem: chatgpt }),
  // Coluna 2 (4)
  Object.freeze({ nome: "Calendly", imagem: calendly }),
  Object.freeze({ nome: "RD Station", imagem: rdStation }),
  Object.freeze({ nome: "Asaas", imagem: asaas }),
  Object.freeze({ nome: "Facebook", imagem: facebook }),
  // Coluna 3 (3): o WhatsApp no alto, como na referência
  Object.freeze({ nome: "WhatsApp", imagem: whatsapp }),
  Object.freeze({ nome: "HubSpot", imagem: hubspot }),
  Object.freeze({ nome: "Pipedrive", imagem: pipedrive }),
  // Coluna 4 (4)
  Object.freeze({ nome: "Zapier", imagem: zapier }),
  Object.freeze({ nome: "Salesforce", imagem: salesforce }),
  Object.freeze({ nome: "Jira", imagem: jira }),
  Object.freeze({ nome: "Make", imagem: make }),
  // Coluna 5 (3), a que esmaece na borda
  Object.freeze({ nome: "Shopify", imagem: shopify }),
  Object.freeze({ nome: "n8n", imagem: n8n }),
  Object.freeze({ nome: "Instagram", imagem: instagram }),
]);
