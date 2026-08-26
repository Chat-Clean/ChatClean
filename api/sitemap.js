/**
 * O mapa do site.
 *
 * Era `public/sitemap.xml`, e saiu do repositório na Story 4.1: o sistema de
 * arquivos é consultado ANTES das reescritas, então o arquivo venceria esta
 * rota em silêncio — ela existiria na configuração e nunca rodaria.
 *
 * ─── OS POSTS ENTRAM AQUI (Story 4.7) ─────────────────────────────────────
 *
 * O buscador descobre artigo de dois jeitos: seguindo link, ou lendo este
 * arquivo. Sem os Posts, todo artigo dependia de alguém ter linkado para ele.
 *
 * ─── E A VISIBILIDADE NÃO É DECIDIDA AQUI ─────────────────────────────────
 *
 * `postsNoAr()` já aplica a regra — a MESMA que a página do artigo consulta. É
 * por isso que o mapa segue sozinho a passagem do tempo: um Post agendado entra
 * quando a hora chega, um arquivado sai, um rascunho nunca aparece, e nada
 * disso precisa de uma segunda opinião escrita nesta função. Filtrar por Estado
 * aqui divergiria no dia em que a regra mudasse, e o sintoma seria um mapa
 * anunciando endereço que a página responde 404.
 *
 * ─── E ESTA ROTA NÃO DEGRADA (Story 4.10) ─────────────────────────────────
 *
 * `/blog/:slug` passa a servir o shell de verdade quando a leitura falha,
 * porque ele É uma página que um humano abre. Este arquivo é só para máquina:
 * não há "shell" dele para degradar a, e fingir sucesso aqui seria o oposto do
 * que o comentário logo abaixo já protege — um mapa vazio de propósito.
 */

import { mapaDoSite } from "./_nucleo/paginasDoSite.js";
import { postsNoAr } from "./_nucleo/leitura.js";
import {
  dominioDoAmbiente,
  metodoRecusado,
  responderDefeito,
  responderDocumento,
} from "./_nucleo/entrega.js";
import { DIAGNOSTICO_LEITURA_FALHOU, DIAGNOSTICO_SEM_DOMINIO } from "./_nucleo/diagnostico.js";

export const TIPO_DO_MAPA = "application/xml; charset=utf-8";

/** O nome desta rota, para o diagnóstico e o registro de evento. */
const ROTA = "sitemap";

export default async function handler(req, res) {
  if (metodoRecusado(req, res, { rota: ROTA })) return;

  const dominio = dominioDoAmbiente();
  if (!dominio.ok) {
    responderDefeito(res, dominio.defeito, { diagnostico: DIAGNOSTICO_SEM_DOMINIO, rota: ROTA });
    return;
  }

  const lidos = await postsNoAr();
  if (!lidos.ok) {
    /* ★ FALHA ALTO, E NÃO SERVE SÓ AS FIXAS ★
       A tentação é servir as páginas fixas quando o banco não responde —
       "melhor que nada". É PIOR que nada: um mapa que lista cinco páginas e
       zero artigos diz ao buscador que o blog está vazio, e ele desindexa o que
       já conhecia. Um 500 diz "tente de novo", e ele tenta. */
    responderDefeito(res, lidos.defeito, { diagnostico: DIAGNOSTICO_LEITURA_FALHOU, rota: ROTA });
    return;
  }

  responderDocumento(res, {
    tipo: TIPO_DO_MAPA,
    corpo: mapaDoSite(dominio.raiz, undefined, lidos.posts),
    etiquetas: { colecoes: ["sitemap"] },
    rota: ROTA,
  });
}
