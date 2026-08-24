/**
 * O índice para motores generativos.
 *
 * ─── O CONTEÚDO É A STORY 4.8 ─────────────────────────────────────────────
 *
 * Esta story declara o endereço, porque a ordem em relação à regra apanha-tudo
 * é o critério dela. O que se serve agora é um documento VÁLIDO do tipo certo —
 * texto simples, com título e um parágrafo que diz o que o site é. Servir HTML
 * aqui seria pior que servir pouco: o rastreador aceitaria e descartaria sem
 * dizer nada.
 *
 * As seções de links com descrição curta, que é o que a Story 4.8 pede, entram
 * lá — e entram sabendo quais Posts existem, que é leitura de banco e não é
 * desta story.
 */

import { PAGINAS_DO_SITE } from "./_nucleo/paginasDoSite.js";
import {
  dominioDoAmbiente,
  metodoRecusado,
  responderDefeito,
  responderDocumento,
} from "./_nucleo/entrega.js";

export const TIPO_DO_INDICE = "text/plain; charset=utf-8";

export const TITULO_DO_INDICE = "# ChatClean";

export const RESUMO_DO_INDICE =
  "Plataforma de CRM e chatbot para WhatsApp. Este arquivo indexa as páginas " +
  "públicas do site para leitura por máquina.";

export function indiceParaLlms(raiz) {
  const semBarra = String(raiz).replace(/\/+$/, "");
  const links = PAGINAS_DO_SITE.map((p) => `- ${semBarra}${p.caminho}`).join("\n");
  return `${TITULO_DO_INDICE}\n\n${RESUMO_DO_INDICE}\n\n## Páginas\n\n${links}\n`;
}

export default async function handler(req, res) {
  if (metodoRecusado(req, res)) return;

  const dominio = dominioDoAmbiente();
  if (!dominio.ok) {
    responderDefeito(res, dominio.defeito);
    return;
  }

  responderDocumento(res, { tipo: TIPO_DO_INDICE, corpo: indiceParaLlms(dominio.raiz) });
}
