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
 *
 * ─── AS VAGAS ENTRAM, E A FALHA DELAS É ISOLADA (Story 5.9) ───────────────
 *
 * Cada Vaga Aberta ganha um nó, depois das fixas e dos Posts, lida por
 * `vagasIsoladas()` (sobre `vagasAbertasServidas()`, a mesma leitura da
 * listagem servida de `/carreiras`). A visibilidade é da função de banco,
 * como a dos Posts.
 *
 * As duas leituras correm em paralelo, e a das Vagas NÃO derruba o mapa: ao
 * contrário dos Posts, a falha de Carreiras não pode tirar o Blog do ar
 * (C-FR-22). A das Vagas tem prazo próprio. Falhando ou vencendo o prazo, o
 * mapa sai 200 com fixas e Posts, `no-store` (a resposta incompleta não fica
 * no cache), e o diagnóstico diz que as Vagas faltaram.
 *
 * A assimetria é de propósito: Posts falhando derrubam a rota INTEIRA, Vagas
 * incluídas; Vagas falhando não derrubam nada.
 */

import { mapaDoSite } from "./_nucleo/paginasDoSite.js";
import { postsNoAr, vagasIsoladas } from "./_nucleo/leitura.js";
import { ETIQUETA_DE_CARREIRAS } from "./_nucleo/cache.js";
import {
  dominioDoAmbiente,
  metodoRecusado,
  responderDefeito,
  responderDocumento,
} from "./_nucleo/entrega.js";
import {
  DIAGNOSTICO_LEITURA_FALHOU,
  DIAGNOSTICO_OK,
  DIAGNOSTICO_SEM_DOMINIO,
  DIAGNOSTICO_VAGAS_FALHARAM,
} from "./_nucleo/diagnostico.js";

export const TIPO_DO_MAPA = "application/xml; charset=utf-8";

/** O nome desta rota, para o diagnóstico e o registro de evento. */
const ROTA = "sitemap";

/**
 * A rota. O terceiro parâmetro só existe para a verificação trocar a leitura
 * das Vagas (a plataforma chama com dois).
 */
export default async function handler(req, res, { lerVagas = vagasIsoladas } = {}) {
  if (metodoRecusado(req, res, { rota: ROTA })) return;

  const dominio = dominioDoAmbiente();
  if (!dominio.ok) {
    responderDefeito(res, dominio.defeito, { diagnostico: DIAGNOSTICO_SEM_DOMINIO, rota: ROTA });
    return;
  }

  const [lidos, abertas] = await Promise.all([postsNoAr(), lerVagas()]);
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
    corpo: mapaDoSite(dominio.raiz, undefined, lidos.posts, abertas.ok ? abertas.vagas : []),
    etiquetas: { colecoes: ["sitemap", ETIQUETA_DE_CARREIRAS] },
    diagnostico: abertas.ok ? DIAGNOSTICO_OK : DIAGNOSTICO_VAGAS_FALHARAM,
    detalhe: abertas.ok ? null : abertas.defeito,
    guardar: abertas.ok,
    rota: ROTA,
  });
}
