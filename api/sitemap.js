/**
 * O mapa do site.
 *
 * Era `public/sitemap.xml`, e saiu do repositório nesta entrega: o sistema de
 * arquivos é consultado ANTES das reescritas, então o arquivo venceria esta
 * rota em silêncio — ela existiria na configuração e nunca rodaria.
 *
 * O que ele listava continua listado, em `_nucleo/paginasDoSite.js`. Os Posts
 * entram na Story 4.7, junto com o `lastmod` real.
 */

import { mapaDoSite } from "./_nucleo/paginasDoSite.js";
import {
  dominioDoAmbiente,
  metodoRecusado,
  responderDefeito,
  responderDocumento,
} from "./_nucleo/entrega.js";

export const TIPO_DO_MAPA = "application/xml; charset=utf-8";

export default async function handler(req, res) {
  if (metodoRecusado(req, res)) return;

  const dominio = dominioDoAmbiente();
  if (!dominio.ok) {
    responderDefeito(res, dominio.defeito);
    return;
  }

  responderDocumento(res, { tipo: TIPO_DO_MAPA, corpo: mapaDoSite(dominio.raiz) });
}
